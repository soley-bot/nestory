-- One transaction combines the existing, audited submission and approval paths.
-- It grants no new business authority and never adopts an older review request.
CREATE OR REPLACE FUNCTION public.post_expense_transaction(
  p_organization_id uuid,
  p_payee_person_id uuid,
  p_external_payee_label text,
  p_expense_date date,
  p_currency public.currency_code,
  p_pay_from_account_id uuid,
  p_reference text,
  p_supporting_document_id uuid,
  p_responsibility text,
  p_lines jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_review_key text;
  v_existing public.expense_transactions%ROWTYPE;
  v_result jsonb;
  v_property uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_super_admin(p_organization_id) AND NOT (
    app_private.has_org_permission(p_organization_id, 'finance.submit_expenses') AND
    app_private.can_reverse_expense(p_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF lower(btrim(coalesce(p_responsibility, ''))) <> 'owner' THEN
    RAISE EXCEPTION 'Direct posting requires an owner expense' USING ERRCODE = '22023';
  END IF;
  IF length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Paid expense transaction is incomplete' USING ERRCODE = '22023';
  END IF;
  -- Share the submission lock: a concurrent review submission cannot slip in
  -- between the collision check and submit. Keep the public key unchanged so
  -- switching between review and direct posting cannot create a second expense.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'submit_expense_transaction_v1', p_organization_id, v_key), 0));
  v_review_key := 'direct-expense-post:' || app_private.canonical_financial_payload_hash(
    jsonb_build_object('key', v_key, 'actor', v_actor));
  SELECT transaction.* INTO v_existing FROM public.expense_transactions AS transaction
    WHERE transaction.organization_id = p_organization_id AND transaction.idempotency_key = v_key
    FOR UPDATE;
  IF FOUND AND (
    v_existing.status <> 'approved' OR
    v_existing.submitted_by IS DISTINCT FROM v_actor OR
    v_existing.reviewed_by IS DISTINCT FROM v_actor OR
    v_existing.review_idempotency_key IS DISTINCT FROM v_review_key
  ) THEN
    RAISE EXCEPTION 'Conflicting direct expense posting request' USING ERRCODE = '22023';
  END IF;
  v_result := public.submit_expense_transaction(
    p_organization_id, p_payee_person_id, p_external_payee_label, p_expense_date,
    p_currency, p_pay_from_account_id, p_reference, p_supporting_document_id,
    p_responsibility, p_lines, v_key);
  FOR v_property IN
    SELECT scope.property_id FROM public.expense_transaction_scopes AS scope
    WHERE scope.organization_id = p_organization_id
      AND scope.transaction_id = (v_result->>'transaction_id')::uuid
    ORDER BY scope.property_id
  LOOP
    PERFORM app_private.assert_property_permission(p_organization_id, v_property, 'finance.correct_records');
  END LOOP;
  -- Approval performs its existing property, active-account, financial-month,
  -- owner-cash and immutable statement checks. Any failure rolls back submission.
  RETURN public.review_expense_transaction(p_organization_id,
    (v_result->>'transaction_id')::uuid, 'approve', NULL, v_review_key);
END;
$$;
REVOKE ALL ON FUNCTION public.post_expense_transaction(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense_transaction(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text) TO authenticated;
COMMENT ON FUNCTION public.post_expense_transaction(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)
IS 'Atomically submit and approve an expense using existing self-approval authority; existing review requests are never adopted.';
