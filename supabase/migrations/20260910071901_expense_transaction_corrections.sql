-- Keep financial children immutable; edits cancel pending parents and corrections
-- append established reversals before submitting a replacement in one SQL transaction.
ALTER TABLE public.expense_transactions
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN replaces_transaction_id uuid,
  ADD COLUMN replacement_transaction_id uuid,
  ADD COLUMN replacement_idempotency_key text,
  ADD COLUMN replacement_payload_hash text,
  ADD COLUMN replaced_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT expense_transactions_replaces_fk FOREIGN KEY (organization_id, replaces_transaction_id)
    REFERENCES public.expense_transactions(organization_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT expense_transactions_replacement_fk FOREIGN KEY (organization_id, replacement_transaction_id)
    REFERENCES public.expense_transactions(organization_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT expense_transactions_cancelled_check CHECK (
    (cancelled_at IS NULL AND cancelled_by IS NULL) OR
    (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND status = 'rejected')),
  ADD CONSTRAINT expense_transactions_replacement_check CHECK (
    (replacement_transaction_id IS NULL AND replacement_idempotency_key IS NULL
      AND replacement_payload_hash IS NULL AND replaced_by IS NULL) OR
    (replacement_transaction_id IS NOT NULL AND replacement_idempotency_key IS NOT NULL
      AND replacement_payload_hash IS NOT NULL AND replacement_payload_hash ~ '^[0-9a-f]{64}$'
      AND replaced_by IS NOT NULL AND status IN ('rejected','reversed'))),
  ADD CONSTRAINT expense_transactions_replaces_once UNIQUE (replaces_transaction_id),
  ADD CONSTRAINT expense_transactions_replacement_key UNIQUE (organization_id,replacement_idempotency_key);

CREATE FUNCTION public.cancel_expense_transaction(
  p_organization_id uuid, p_transaction_id uuid, p_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_transaction public.expense_transactions%ROWTYPE;
  v_property uuid;
  v_reason text := btrim(coalesce(p_reason,''));
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_hash text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_super_admin(p_organization_id) AND NOT app_private.has_org_permission(p_organization_id,'finance.submit_expenses') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_transaction_id IS NULL OR length(v_reason) NOT BETWEEN 3 AND 500
    OR length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Expense cancellation request is invalid' USING ERRCODE='22023';
  END IF;
  v_hash := app_private.canonical_financial_payload_hash(jsonb_build_object(
    'operation','cancel','transaction_id',p_transaction_id,'reason',v_reason));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','review_expense_transaction_v1',p_organization_id,p_transaction_id),0));
  SELECT * INTO v_transaction FROM public.expense_transactions
    WHERE organization_id=p_organization_id AND id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense transaction not found' USING ERRCODE='23503'; END IF;
  IF v_transaction.submitted_by <> v_actor AND NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only the submitter or Super Admin can cancel a pending expense' USING ERRCODE='42501';
  END IF;
  FOR v_property IN SELECT property_id FROM public.expense_transaction_scopes
    WHERE organization_id=p_organization_id AND transaction_id=p_transaction_id ORDER BY property_id
  LOOP
    PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.submit_expenses');
  END LOOP;
  IF v_transaction.cancelled_at IS NOT NULL AND v_transaction.cancelled_by=v_actor
    AND v_transaction.review_idempotency_key=v_key AND v_transaction.review_payload_hash=v_hash THEN
    RETURN jsonb_build_object('transaction_id',p_transaction_id,'status','cancelled');
  END IF;
  IF v_transaction.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a pending expense transaction can be cancelled' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expense_transaction_lines WHERE organization_id=p_organization_id AND transaction_id=p_transaction_id)
    OR EXISTS (SELECT 1 FROM public.expense_transaction_lines l JOIN public.expense_submissions s
      ON s.organization_id=l.organization_id AND s.id=l.submission_id
      WHERE l.organization_id=p_organization_id AND l.transaction_id=p_transaction_id AND s.status <> 'submitted') THEN
    RAISE EXCEPTION 'Expense transaction children are inconsistent' USING ERRCODE='23514';
  END IF;
  PERFORM app_private.set_expense_transaction_context(p_organization_id,p_transaction_id,'review',true);
  UPDATE public.expense_submissions s SET status='rejected',reviewed_at=now(),reviewed_by=v_actor,review_reason=v_reason
    FROM public.expense_transaction_lines l WHERE l.organization_id=p_organization_id AND l.transaction_id=p_transaction_id
    AND s.organization_id=l.organization_id AND s.id=l.submission_id;
  PERFORM app_private.set_expense_transaction_context(p_organization_id,p_transaction_id,'review',false);
  UPDATE public.expense_transactions SET status='rejected',cancelled_at=now(),cancelled_by=v_actor,
    reviewed_at=now(),reviewed_by=v_actor,review_reason=v_reason,review_idempotency_key=v_key,
    review_payload_hash=v_hash,updated_at=now() WHERE organization_id=p_organization_id AND id=p_transaction_id;
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,v_actor,'expense_transaction',p_transaction_id,'cancelled',jsonb_build_object('reason',v_reason));
  RETURN jsonb_build_object('transaction_id',p_transaction_id,'status','cancelled');
END;
$$;

CREATE FUNCTION public.replace_expense_transaction(
  p_organization_id uuid, p_transaction_id uuid, p_expected_status text, p_reason text,
  p_reversal_date date, p_payee_person_id uuid, p_external_payee_label text,
  p_expense_date date, p_currency public.currency_code, p_pay_from_account_id uuid,
  p_reference text, p_supporting_document_id uuid, p_responsibility text,
  p_lines jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_transaction public.expense_transactions%ROWTYPE;
  v_property uuid;
  v_reason text := btrim(coalesce(p_reason,''));
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_hash text;
  v_new_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_super_admin(p_organization_id) AND NOT app_private.has_org_permission(p_organization_id,'finance.submit_expenses') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_transaction_id IS NULL OR p_expected_status IS NULL OR p_expected_status NOT IN ('submitted','approved')
    OR length(v_reason) NOT BETWEEN 3 AND 500 OR length(v_key) NOT BETWEEN 8 AND 160
    OR (p_expected_status='approved' AND p_reversal_date IS NULL) THEN
    RAISE EXCEPTION 'Expense replacement request is invalid' USING ERRCODE='22023';
  END IF;
  IF p_expected_status='approved' AND NOT app_private.can_reverse_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  v_hash := app_private.canonical_financial_payload_hash(jsonb_build_object(
    'transaction_id',p_transaction_id,'expected_status',p_expected_status,'reason',v_reason,
    'reversal_date',p_reversal_date,'payee_person_id',p_payee_person_id,'external_payee_label',p_external_payee_label,
    'expense_date',p_expense_date,'currency',p_currency,'pay_from_account_id',p_pay_from_account_id,
    'reference',p_reference,'supporting_document_id',p_supporting_document_id,'responsibility',p_responsibility,'lines',p_lines));
  -- Match existing reviewer/reverser lock order before locking the parent row.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':',
    CASE WHEN p_expected_status='approved' THEN 'reverse_expense_transaction_v1' ELSE 'review_expense_transaction_v1' END,
    p_organization_id,p_transaction_id),0));
  SELECT * INTO v_transaction FROM public.expense_transactions
    WHERE organization_id=p_organization_id AND id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense transaction not found' USING ERRCODE='23503'; END IF;
  IF p_expected_status='submitted' AND v_transaction.submitted_by <> v_actor
    AND NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only the submitter or Super Admin can edit a pending expense' USING ERRCODE='42501';
  END IF;
  FOR v_property IN SELECT property_id FROM public.expense_transaction_scopes
    WHERE organization_id=p_organization_id AND transaction_id=p_transaction_id ORDER BY property_id
  LOOP
    PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.submit_expenses');
  END LOOP;
  IF v_transaction.replacement_transaction_id IS NOT NULL THEN
    IF v_transaction.replaced_by=v_actor AND v_transaction.replacement_idempotency_key=v_key
      AND v_transaction.replacement_payload_hash=v_hash THEN
      RETURN jsonb_build_object('transaction_id',v_transaction.replacement_transaction_id,
        'replaces_transaction_id',p_transaction_id,'status','submitted');
    END IF;
    RAISE EXCEPTION 'Conflicting expense replacement request' USING ERRCODE='22023';
  END IF;
  IF v_transaction.status <> p_expected_status THEN
    RAISE EXCEPTION 'Expense status changed; refresh before replacing it' USING ERRCODE='22023';
  END IF;
  IF p_responsibility IS DISTINCT FROM v_transaction.responsibility THEN
    RAISE EXCEPTION 'A replacement must keep the original expense responsibility' USING ERRCODE='22023';
  END IF;
  -- Existing evidence is exclusive to the immutable original. Require a newly
  -- registered upload instead of dropping evidence or weakening reuse guards.
  IF v_transaction.supporting_document_id IS NOT NULL AND
    (p_supporting_document_id IS NULL OR p_supporting_document_id=v_transaction.supporting_document_id) THEN
    RAISE EXCEPTION 'Upload a new receipt for the replacement; the original receipt remains in its history' USING ERRCODE='22023';
  END IF;
  IF p_expected_status='approved' THEN
    PERFORM public.reverse_expense_transaction(p_organization_id,p_transaction_id,p_reversal_date,v_reason,
      'expense-correction:'||p_transaction_id::text);
  ELSE
    PERFORM public.cancel_expense_transaction(p_organization_id,p_transaction_id,v_reason,
      'expense-edit:'||p_transaction_id::text);
  END IF;
  v_result := public.submit_expense_transaction(p_organization_id,p_payee_person_id,p_external_payee_label,
    p_expense_date,p_currency,p_pay_from_account_id,p_reference,p_supporting_document_id,p_responsibility,p_lines,
    'expense-replacement:'||gen_random_uuid()::text);
  v_new_id := (v_result->>'transaction_id')::uuid;
  UPDATE public.expense_transactions SET replaces_transaction_id=p_transaction_id
    WHERE organization_id=p_organization_id AND id=v_new_id;
  UPDATE public.expense_transactions SET replacement_transaction_id=v_new_id,replacement_idempotency_key=v_key,
    replacement_payload_hash=v_hash,replaced_by=v_actor,updated_at=now()
    WHERE organization_id=p_organization_id AND id=p_transaction_id;
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,v_actor,'expense_transaction',p_transaction_id,
      CASE WHEN p_expected_status='approved' THEN 'corrected' ELSE 'edited' END,
      jsonb_build_object('reason',v_reason,'replacement_transaction_id',v_new_id));
  RETURN v_result || jsonb_build_object('replaces_transaction_id',p_transaction_id);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_expense_transaction(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_expense_transaction(uuid,uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.replace_expense_transaction(uuid,uuid,text,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_expense_transaction(uuid,uuid,text,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)
  TO authenticated,service_role;



