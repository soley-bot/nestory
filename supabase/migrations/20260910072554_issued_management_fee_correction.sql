-- One-off issued-invoice fee corrections. Rent and tenant settlement evidence
-- are never rewritten or replayed. Legacy four/seven argument RPCs stay intact.
ALTER TABLE public.tenant_invoice_corrections
  DROP CONSTRAINT tenant_invoice_corrections_action_check,
  ADD CONSTRAINT tenant_invoice_corrections_action_check CHECK (
    (action = 'void' AND target_invoice_line_id IS NULL)
    OR (action IN ('line_correction', 'historical_rent', 'management_fee')
      AND target_invoice_line_id IS NOT NULL)
  );
CREATE UNIQUE INDEX tenant_invoice_management_fee_correction_once
  ON public.tenant_invoice_corrections (organization_id, tenant_invoice_id)
  WHERE action = 'management_fee';

ALTER TABLE public.management_fee_occurrences
  DROP CONSTRAINT management_fee_occurrences_reversal_evidence_check,
  ADD CONSTRAINT management_fee_occurrences_reversal_evidence_check CHECK (
    (reversal_of_id IS NULL AND supersedes_occurrence_id IS NULL AND settlement_status <> 'reversed')
    OR (reversal_of_id IS NOT NULL AND supersedes_occurrence_id IS NULL
      AND correction_occurrence_id IS NOT NULL AND settlement_status = 'reversed')
    OR (reversal_of_id IS NULL AND supersedes_occurrence_id IS NOT NULL
      AND correction_occurrence_id IS NOT NULL AND settlement_status <> 'reversed')
  );

-- Reuse the exact deployed preview gate implementation, with reviewed, uniquely
-- matched changes. Unknown predecessors fail closed instead of losing a gate.
DO $migration$
DECLARE
  definition text := replace(pg_get_functiondef(
    'app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)'::regprocedure), chr(13), '');
  replacement record;
BEGIN
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <>
    '684d9de9e05426253af2885048e7663f2f6d8e3c26f2edee35dc0a5170d05027' THEN
    RAISE EXCEPTION 'management_fee_preview_predecessor_mismatch';
  END IF;
  FOR replacement IN SELECT * FROM (VALUES
    ('p_corrected_due_day integer)', 'p_corrected_due_day integer, p_corrected_management_fee_amount numeric)'),
    ('OR v_invoice.billing_period_end >= v_business_date THEN',
      'OR (p_corrected_management_fee_amount IS NULL AND v_invoice.billing_period_end >= v_business_date) THEN'),
    ('  v_preview := pg_catalog.jsonb_build_object(', $new$
  IF p_corrected_management_fee_amount IS NULL
    OR p_corrected_management_fee_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_corrected_management_fee_amount < 0
    OR p_corrected_management_fee_amount > 999999999999.99
    OR p_corrected_management_fee_amount <> round(p_corrected_management_fee_amount, 2)
    OR p_corrected_rent_amount IS DISTINCT FROM v_line.amount
    OR p_corrected_due_day IS DISTINCT FROM v_original_due_day THEN
    RAISE EXCEPTION 'management_fee_correction_inputs_invalid' USING ERRCODE = '22023';
  END IF;
  -- These gates protect reversal/replay of tenant receipts. Fee-only mode
  -- retains those receipts, their custody, account history and cash consumers.
  -- Keep every other (including unknown future) financial/owner fee gate.
  SELECT coalesce(jsonb_agg(blocker ORDER BY ordinal), '[]'::jsonb) INTO v_blockers
  FROM jsonb_array_elements(v_blockers) WITH ORDINALITY AS items(blocker, ordinal)
  WHERE coalesce(blocker->>'code','') NOT IN (
    'historical_rent_dependent_owner_cash', 'historical_rent_payment_account_unavailable',
    'historical_rent_owner_custody_changed', 'historical_rent_settlement_owner_effect_missing',
    'historical_rent_owner_roster_changed', 'historical_rent_tenant_credit_unsupported');
  IF EXISTS (SELECT 1 FROM public.tenant_invoice_corrections c
    WHERE c.organization_id = p_organization_id AND c.tenant_invoice_id = p_invoice_id
      AND c.action = 'management_fee') THEN
    v_blockers := v_blockers || '[{"code":"management_fee_already_corrected"}]'::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations a
    JOIN public.owner_invoice_lines l ON l.organization_id = a.organization_id AND l.id = a.owner_invoice_line_id
    WHERE a.organization_id = p_organization_id AND l.source_type = 'management_fee'
      AND l.source_id = v_fee.id AND a.reversal_of_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations r
        WHERE r.organization_id = a.organization_id AND r.reversal_of_id = a.id)) THEN
    v_blockers := v_blockers || '[{"code":"owner_invoice_settlement_active"}]'::jsonb;
  END IF;
  IF app_private.is_financial_month_locked(p_organization_id, v_invoice.property_id, v_invoice.issue_date) THEN
    v_blockers := v_blockers || '[{"code":"financial_month_locked"}]'::jsonb;
  END IF;
  IF p_corrected_management_fee_amount = coalesce(v_fee.amount, 0) THEN
    v_blockers := v_blockers || '[{"code":"management_fee_no_change"}]'::jsonb;
  END IF;
  v_replacement_fee := p_corrected_management_fee_amount;
  v_preview := pg_catalog.jsonb_build_object($new$),
    ('  v_preview_hash := app_private.canonical_financial_payload_hash(v_preview);', $new$
  v_preview := v_preview || jsonb_build_object(
    'correctionMode', 'management_fee',
    'correctedManagementFeeAmount', p_corrected_management_fee_amount,
    'feeRecognizedOn', coalesce(v_fee.fee_date, v_invoice.issue_date),
    'feeCorrectionEvidence', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb)
      FROM public.tenant_invoice_corrections c WHERE c.organization_id = p_organization_id AND c.tenant_invoice_id = p_invoice_id));
  v_preview_hash := app_private.canonical_financial_payload_hash(v_preview);$new$)
  ) AS changes(needle, value) LOOP
    IF array_length(string_to_array(definition, replacement.needle), 1) <> 2 THEN
      RAISE EXCEPTION 'management_fee_preview_anchor_mismatch: %', replacement.needle;
    END IF;
    definition := replace(definition, replacement.needle, replacement.value);
  END LOOP;
  EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer,numeric)
  FROM PUBLIC, anon, authenticated, service_role;

-- Positive roots and successors carry a checked correction snapshot. Ordinary
-- generation and legacy rent-correction/reversal branches are unchanged.
DO $migration$
DECLARE
  definition text := replace(pg_get_functiondef('app_private.create_management_fee_owner_charge()'::regprocedure), chr(13), '');
  needle text := '  IF NEW.reversal_of_id IS NOT NULL THEN';
BEGIN
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <>
    '6c112cde04bbaa47ef88f94d5b108bd5068103bfc2d6850b4880be96cedafe2f'
    OR array_length(string_to_array(definition, needle), 1) <> 2 THEN
    RAISE EXCEPTION 'management_fee_trigger_predecessor_mismatch';
  END IF;
  EXECUTE replace(definition, needle, $new$
  IF NEW.reversal_of_id IS NULL AND NEW.correction_occurrence_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenant_invoice_corrections c
      WHERE c.organization_id = NEW.organization_id AND c.id = NEW.correction_occurrence_id
        AND c.tenant_invoice_id = NEW.tenant_invoice_id AND c.action = 'management_fee') THEN
    IF current_user <> 'postgres'
      OR current_setting('app.management_fee_correction_context', true) IS DISTINCT FROM 'checked-management-fee-v1'
      OR NOT EXISTS (SELECT 1 FROM public.tenant_invoice_corrections c
        WHERE c.organization_id = NEW.organization_id AND c.id = NEW.correction_occurrence_id
          AND (c.source_identity->>'correctedManagementFeeAmount')::numeric = NEW.amount
          AND (c.source_identity->>'originalFeeId')::uuid IS NOT DISTINCT FROM NEW.supersedes_occurrence_id) THEN
      RAISE EXCEPTION 'management_fee_correction_authority_required' USING ERRCODE = '42501';
    END IF;
    NEW.property_id := v_invoice.property_id;
    NEW.lease_id := v_invoice.lease_id;
    NEW.billing_term_id := v_invoice.billing_term_id;
    NEW.fee_date := v_invoice.issue_date;
    NEW.currency := v_invoice.currency;
    NEW.fee_mode := 'flat';
    NEW.fee_value := NEW.amount;
    NEW.settlement_status := 'owner_due';
    IF NEW.supersedes_occurrence_id IS NULL THEN
      PERFORM app_private.create_owner_invoice_line(NEW.organization_id, NEW.property_id,
        app_private.resolve_property_owner(NEW.organization_id, NEW.property_id, NEW.fee_date),
        NEW.fee_date, 'management_fee', NEW.id, 'Management fee', 'Issued invoice fee correction', NEW.amount, NEW.created_by);
    ELSE
      SELECT original.* INTO STRICT v_original FROM public.management_fee_occurrences original
      WHERE original.organization_id = NEW.organization_id AND original.id = NEW.supersedes_occurrence_id
        AND original.tenant_invoice_id = NEW.tenant_invoice_id AND original.reversal_of_id IS NULL
        AND original.supersedes_occurrence_id IS NULL FOR KEY SHARE;
      NEW.fee_date := v_original.fee_date;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.reversal_of_id IS NULL AND NEW.supersedes_occurrence_id IS NULL AND NEW.correction_occurrence_id IS NOT NULL THEN
    RAISE EXCEPTION 'management_fee_correction_authority_required' USING ERRCODE = '42501';
  END IF;
  IF NEW.reversal_of_id IS NOT NULL THEN$new$);
END;
$migration$;

CREATE FUNCTION public.preview_historical_rent_correction(
  p_organization_id uuid, p_invoice_id uuid, p_corrected_rent_amount numeric,
  p_corrected_due_day integer, p_corrected_management_fee_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF p_corrected_management_fee_amount IS NULL THEN
    RETURN public.preview_historical_rent_correction(p_organization_id,p_invoice_id,p_corrected_rent_amount,p_corrected_due_day);
  END IF;
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE = '42501';
  END IF;
  RETURN app_private.build_historical_rent_correction_preview(p_organization_id,p_invoice_id,p_corrected_rent_amount,p_corrected_due_day,p_corrected_management_fee_amount);
END;
$$;

CREATE FUNCTION public.correct_historical_rent(
  p_organization_id uuid, p_invoice_id uuid, p_corrected_rent_amount numeric,
  p_corrected_due_day integer, p_reason text, p_preview_hash text, p_idempotency_key text,
  p_corrected_management_fee_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  invoice public.tenant_invoices%ROWTYPE;
  fee public.management_fee_occurrences%ROWTYPE;
  owner_line public.owner_invoice_lines%ROWTYPE;
  preview jsonb;
  payload jsonb;
  replay jsonb;
  claim record;
  result jsonb;
  correction_id uuid := gen_random_uuid();
  reversal_fee_id uuid := gen_random_uuid();
  replacement_fee_id uuid := gen_random_uuid();
  business_date date;
  recognized_on date;
  owner_scope record;
BEGIN
  IF p_corrected_management_fee_amount IS NULL THEN
    RETURN public.correct_historical_rent(p_organization_id,p_invoice_id,p_corrected_rent_amount,p_corrected_due_day,p_reason,p_preview_hash,p_idempotency_key);
  END IF;
  IF actor IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500
    OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 160
    OR coalesce(p_preview_hash,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'management_fee_correction_inputs_invalid' USING ERRCODE = '22023';
  END IF;
  payload := jsonb_build_object('invoiceId',p_invoice_id,'correctedRentAmount',p_corrected_rent_amount,
    'correctedDueDay',p_corrected_due_day,'correctedManagementFeeAmount',p_corrected_management_fee_amount,
    'reason',btrim(p_reason),'previewHash',p_preview_hash);
  replay := app_private.get_financial_idempotency_replay(p_organization_id,'correct_issued_management_fee',btrim(p_idempotency_key),actor,payload);
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','historical_rent_correction_v1',p_organization_id::text,p_invoice_id::text),0));
  SELECT i.* INTO STRICT invoice FROM public.tenant_invoices i
    WHERE i.organization_id = p_organization_id AND i.id = p_invoice_id FOR UPDATE;
  preview := app_private.build_historical_rent_correction_preview(p_organization_id,p_invoice_id,p_corrected_rent_amount,p_corrected_due_day,p_corrected_management_fee_amount);
  IF preview->>'previewHash' IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION 'historical_rent_preview_stale' USING ERRCODE = '40001';
  END IF;
  IF NOT (preview->>'canApply')::boolean THEN
    RAISE EXCEPTION 'historical_rent_correction_blocked' USING ERRCODE = '55000', DETAIL = (preview->'blockers')::text;
  END IF;
  business_date := (preview->>'correctionBusinessDate')::date;
  recognized_on := (preview->>'feeRecognizedOn')::date;
  PERFORM app_private.lock_open_property_financial_month(p_organization_id,invoice.property_id,invoice.currency,business_date);
  PERFORM app_private.lock_open_property_financial_month(p_organization_id,invoice.property_id,invoice.currency,recognized_on);
  FOR owner_scope IN SELECT owner_person_id FROM app_private.validate_owner_roster_on_date(
    p_organization_id,invoice.property_id,recognized_on) ORDER BY owner_person_id LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(p_organization_id,invoice.property_id,owner_scope.owner_person_id,invoice.currency);
  END LOOP;
  SELECT c.* INTO STRICT claim FROM app_private.claim_financial_idempotency(p_organization_id,'correct_issued_management_fee',btrim(p_idempotency_key),actor,payload) c;
  IF claim.is_replay THEN RETURN claim.result_ids; END IF;
  SELECT f.* INTO fee FROM public.management_fee_occurrences f
    WHERE f.organization_id = p_organization_id AND f.tenant_invoice_id = p_invoice_id
      AND f.reversal_of_id IS NULL AND f.supersedes_occurrence_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences r WHERE r.organization_id=f.organization_id AND r.reversal_of_id=f.id) FOR UPDATE;
  IF fee.id IS NOT NULL THEN
    SELECT l.* INTO STRICT owner_line FROM public.owner_invoice_lines l
      WHERE l.organization_id = p_organization_id AND l.source_type='management_fee' AND l.source_id=fee.id FOR UPDATE;
  END IF;
  -- Recheck after fee/owner-line and period locks: concurrent settlements or
  -- Owner Close must invalidate confirmation before any financial insertion.
  preview := app_private.build_historical_rent_correction_preview(p_organization_id,p_invoice_id,p_corrected_rent_amount,p_corrected_due_day,p_corrected_management_fee_amount);
  IF preview->>'previewHash' IS DISTINCT FROM p_preview_hash OR NOT (preview->>'canApply')::boolean THEN
    RAISE EXCEPTION 'historical_rent_preview_stale' USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('app.tenant_invoice_correction_context','checked-invoice-correction-v1',true);
  PERFORM set_config('app.management_fee_correction_context','checked-management-fee-v1',true);
  INSERT INTO public.tenant_invoice_corrections(id,organization_id,tenant_invoice_id,action,target_invoice_line_id,
    property_id,unit_id,currency,evidence_recognized_on,affected_line_count,reason,idempotency_key,payload_hash,
    source_identity,correction_business_date,preview_hash,created_by)
  VALUES(correction_id,p_organization_id,p_invoice_id,'management_fee',(preview->>'sourceRentLineId')::uuid,
    invoice.property_id,invoice.unit_id,invoice.currency,recognized_on,1,btrim(p_reason),btrim(p_idempotency_key),
    app_private.canonical_financial_payload_hash(payload),payload || jsonb_build_object('originalFeeId',fee.id,
      'originalManagementFeeAmount',coalesce(fee.amount,0),'invoiceNumber',invoice.invoice_number),business_date,p_preview_hash,actor);
  IF fee.id IS NOT NULL THEN
    PERFORM public.allocate_owner_event(p_organization_id,'management_fee_occurrence',fee.id,'fee-correction-original-'||fee.id::text);
    INSERT INTO public.management_fee_occurrences(id,organization_id,property_id,lease_id,tenant_invoice_id,billing_term_id,
      fee_date,amount,currency,fee_mode,fee_value,settlement_status,created_by,reversal_of_id,correction_occurrence_id)
    VALUES(reversal_fee_id,p_organization_id,fee.property_id,fee.lease_id,p_invoice_id,fee.billing_term_id,
      fee.fee_date,-fee.amount,fee.currency,fee.fee_mode,fee.fee_value,'reversed',actor,fee.id,correction_id);
    INSERT INTO public.owner_invoice_lines(organization_id,invoice_id,property_id,source_type,source_id,customer_label,
      description,amount,sort_order,created_by,recognized_on,reversal_of_id,correction_occurrence_id)
    VALUES(p_organization_id,owner_line.invoice_id,invoice.property_id,'management_fee',reversal_fee_id,owner_line.customer_label,
      'Management fee correction: '||btrim(p_reason),-owner_line.amount,owner_line.sort_order+1,actor,
      owner_line.recognized_on,owner_line.id,correction_id);
    PERFORM app_private.append_management_fee_owner_effect_reversal(fee.id,reversal_fee_id,correction_id,actor);
  END IF;
  IF p_corrected_management_fee_amount > 0 THEN
    INSERT INTO public.management_fee_occurrences(id,organization_id,property_id,lease_id,tenant_invoice_id,billing_term_id,
      fee_date,amount,currency,fee_mode,fee_value,settlement_status,created_by,correction_occurrence_id,supersedes_occurrence_id)
    VALUES(replacement_fee_id,p_organization_id,invoice.property_id,invoice.lease_id,p_invoice_id,invoice.billing_term_id,
      recognized_on,p_corrected_management_fee_amount,invoice.currency,'flat',p_corrected_management_fee_amount,
      'owner_due',actor,correction_id,fee.id);
    IF fee.id IS NOT NULL THEN
      INSERT INTO public.owner_invoice_lines(organization_id,invoice_id,property_id,source_type,source_id,customer_label,
        description,amount,sort_order,created_by,recognized_on,supersedes_line_id,correction_occurrence_id)
      VALUES(p_organization_id,owner_line.invoice_id,invoice.property_id,'management_fee',replacement_fee_id,owner_line.customer_label,
        'Corrected management fee: '||btrim(p_reason),p_corrected_management_fee_amount,owner_line.sort_order+2,
        actor,owner_line.recognized_on,owner_line.id,correction_id);
    END IF;
    PERFORM public.allocate_owner_event(p_organization_id,'management_fee_occurrence',replacement_fee_id,'fee-correction-new-'||correction_id::text);
  END IF;
  PERFORM app_private.mark_tenant_rent_owner_periods_stale(p_organization_id,invoice.property_id,invoice.currency,
    ARRAY[(preview->>'sourceRentLineId')::uuid],correction_id,actor);
  result := jsonb_build_object('correctionId',correction_id,'invoiceId',p_invoice_id,
    'correctedManagementFeeAmount',p_corrected_management_fee_amount,'replacementFeeId',
    CASE WHEN p_corrected_management_fee_amount>0 THEN replacement_fee_id ELSE NULL END);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,actor,'tenant_invoice',p_invoice_id,'management_fee_corrected',payload||result);
  result := app_private.complete_financial_idempotency(claim.request_id,p_organization_id,actor,result);
  PERFORM set_config('app.tenant_invoice_correction_context','',true);
  PERFORM set_config('app.management_fee_correction_context','',true);
  PERFORM set_config('app.owner_balance_period_write_context','',true);
  PERFORM set_config('app.owner_close_write_context','',true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_historical_rent_correction(uuid,uuid,numeric,integer,numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_historical_rent_correction(uuid,uuid,numeric,integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text,numeric) TO authenticated;
