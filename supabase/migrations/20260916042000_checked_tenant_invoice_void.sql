-- Require the exact reviewed invoice line set before delegating to the existing
-- atomic void authority. Invoice rows serialize manual charge and correction writes.
CREATE FUNCTION public.void_tenant_invoice_checked(
  p_organization_id uuid, p_invoice_id uuid, p_expected_issue_date date,
  p_expected_lines jsonb, p_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_invoice public.tenant_invoices%ROWTYPE;
  v_expected jsonb; v_actual jsonb; v_payload jsonb; v_replay jsonb;
  v_claim record; v_result jsonb;
BEGIN
  SELECT * INTO v_invoice FROM public.tenant_invoices
    WHERE organization_id=p_organization_id AND id=p_invoice_id;
  IF v_actor IS NULL OR v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'tenant_invoice_correction_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_invoice.property_id,'finance.correct_records');
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE='42501';
  END IF;
  IF p_expected_issue_date IS NULL OR jsonb_typeof(p_expected_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_expected_lines) NOT BETWEEN 1 AND 10000
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500
    OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'tenant_invoice_review_invalid' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_expected_lines) item
    WHERE jsonb_typeof(item) <> 'object' OR item->>'id' IS NULL OR item->>'amount' IS NULL)
    OR (SELECT count(DISTINCT (item->>'id')::uuid) FROM jsonb_array_elements(p_expected_lines) item) <> jsonb_array_length(p_expected_lines) THEN
    RAISE EXCEPTION 'tenant_invoice_review_invalid' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',(item->>'id')::uuid,'amount',(item->>'amount')::numeric) ORDER BY (item->>'id')::uuid)
    INTO v_expected FROM jsonb_array_elements(p_expected_lines) item;
  v_payload := jsonb_build_object('invoiceId',p_invoice_id,'issueDate',p_expected_issue_date,'lines',v_expected,'reason',btrim(p_reason));
  v_replay := app_private.get_financial_idempotency_replay(p_organization_id,'void_tenant_invoice_checked',btrim(p_idempotency_key),v_actor,v_payload);
  IF v_replay IS NOT NULL THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false);
    RETURN v_replay;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tenant_invoice_correction_v1',p_organization_id::text,p_invoice_id::text),0));
  SELECT * INTO STRICT v_invoice FROM public.tenant_invoices
    WHERE organization_id=p_organization_id AND id=p_invoice_id FOR UPDATE;
  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(p_organization_id,'void_tenant_invoice_checked',btrim(p_idempotency_key),v_actor,v_payload);
  IF v_claim.is_replay THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false);
    RETURN v_claim.result_ids;
  END IF;
  -- Match tenant_invoice_line_balances: it includes original and correction
  -- lines, so previously corrected invoices remain safely deletable.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount) ORDER BY id),'[]'::jsonb)
    INTO v_actual FROM public.tenant_invoice_lines WHERE organization_id=p_organization_id AND invoice_id=p_invoice_id;
  IF v_invoice.issue_date IS DISTINCT FROM p_expected_issue_date OR v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'tenant_invoice_sources_changed' USING ERRCODE='40001';
  END IF;
  v_result := public.correct_tenant_invoice(p_organization_id,p_invoice_id,'void',NULL,p_reason,'checked-void:'||v_claim.request_id::text);
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.void_tenant_invoice_checked(uuid,uuid,date,jsonb,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.void_tenant_invoice_checked(uuid,uuid,date,jsonb,text,text) TO authenticated;
