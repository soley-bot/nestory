-- Optional, private October replay. Installing this does not select a billing
-- date policy, enroll an organization, or execute any financial operation.
-- Business dates come from exact archived invoices; audit clocks stay real.
BEGIN;

CREATE FUNCTION app_private.assert_financial_reset_original_invoice_dates(p_operation uuid,p_plan jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_source jsonb; v_item jsonb; v_invoice jsonb;
 v_business_date date; v_term public.lease_terms%ROWTYPE; v_lease public.leases%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete'
 OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation AND organization_id=v_op.organization_id AND status='complete') THEN
  RAISE EXCEPTION 'financial_reset_known_zero_required' USING ERRCODE='55000';
 END IF;
 IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR p_plan->'version' IS DISTINCT FROM '3'::jsonb
 OR p_plan->>'invoice_date_policy' IS DISTINCT FROM 'original-reviewed-october'
 OR p_plan->>'billing_period_start' IS DISTINCT FROM '2026-10-01' OR p_plan->>'issue_date' IS DISTINCT FROM '2026-10-01'
 OR jsonb_typeof(p_plan->'original_invoice_sources') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_plan->'leases') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'financial_reset_original_invoice_date_review_invalid' USING ERRCODE='23514';
 END IF;
 v_business_date:=app_private.rent_business_date(v_op.organization_id,statement_timestamp());
 IF date_trunc('month',v_business_date)::date IS DISTINCT FROM DATE '2026-10-01'
 OR (SELECT financial_start_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id) IS DISTINCT FROM DATE '2026-10-01' THEN
  RAISE EXCEPTION 'financial_reset_continuation_current_cutoff_month_required' USING ERRCODE='23514';
 END IF;
 IF p_plan->>'execution_business_date' IS DISTINCT FROM v_business_date::text THEN
  RAISE EXCEPTION 'financial_reset_continuation_business_date_changed' USING ERRCODE='40001';
 END IF;
 IF (SELECT coalesce(jsonb_agg(id::text ORDER BY id::text),'[]') FROM public.leases WHERE organization_id=v_op.organization_id AND archived_at IS NULL AND status IN ('active','notice_given'))
 IS DISTINCT FROM (SELECT jsonb_agg(value->>'lease_id' ORDER BY value->>'lease_id') FROM jsonb_array_elements(p_plan->'leases')) THEN
  RAISE EXCEPTION 'financial_reset_continuation_roster_mismatch' USING ERRCODE='23514';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_plan->'leases') LOOP
  IF v_item->>'disposition'='defer-expired-unbilled' THEN
   PERFORM app_private.assert_financial_reset_deferred_lease(v_op.organization_id,DATE '2026-10-01',v_item);
   CONTINUE;
  END IF;
  IF v_item->>'disposition' IS DISTINCT FROM 'bill' OR v_item->'continue_month_to_month' IS DISTINCT FROM 'false'::jsonb
  OR v_item->>'due_date' IS DISTINCT FROM '2026-10-07' THEN
   RAISE EXCEPTION 'financial_reset_original_invoice_contract_required' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_lease FROM public.leases WHERE organization_id=v_op.organization_id AND id=(v_item->>'lease_id')::uuid;
  SELECT * INTO v_term FROM public.lease_terms WHERE organization_id=v_op.organization_id AND lease_id=v_lease.id
   AND id=(v_item->>'term_id')::uuid AND archived_at IS NULL;
  IF NOT FOUND OR v_term.rent_due_day IS DISTINCT FROM 7 OR v_term.authority_kind IS DISTINCT FROM 'authoritative'
  OR v_term.payment_frequency IS DISTINCT FROM 'monthly' OR v_term.status NOT IN ('active','upcoming')
  OR v_term.start_date>DATE '2026-10-31' OR v_term.end_date<DATE '2026-10-01' THEN
   RAISE EXCEPTION 'financial_reset_original_invoice_contract_required' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF jsonb_array_length(p_plan->'original_invoice_sources')=0
 OR jsonb_array_length(p_plan->'original_invoice_sources')<>(SELECT count(*) FROM jsonb_array_elements(p_plan->'leases') WHERE value->>'disposition'='bill' AND (value->>'rent_amount')::numeric>0)
 OR (SELECT count(DISTINCT value->>'lease_id') FROM jsonb_array_elements(p_plan->'original_invoice_sources'))<>jsonb_array_length(p_plan->'original_invoice_sources')
 OR (SELECT count(DISTINCT value->>'invoice_id') FROM jsonb_array_elements(p_plan->'original_invoice_sources'))<>jsonb_array_length(p_plan->'original_invoice_sources') THEN
  RAISE EXCEPTION 'financial_reset_original_invoice_source_roster_invalid' USING ERRCODE='23514';
 END IF;
 FOR v_source IN SELECT value FROM jsonb_array_elements(p_plan->'original_invoice_sources') LOOP
  IF jsonb_typeof(v_source) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_source) k) IS DISTINCT FROM ARRAY['invoice_id','lease_id','row_sha256']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(v_source) WHERE value='null'::jsonb)
  OR v_source->>'row_sha256' !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'financial_reset_original_invoice_source_invalid' USING ERRCODE='23514';
  END IF;
  SELECT value INTO v_item FROM jsonb_array_elements(p_plan->'leases') WHERE value->'lease_id'=v_source->'lease_id'
   AND value->>'disposition'='bill' AND (value->>'rent_amount')::numeric>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_original_invoice_source_roster_invalid' USING ERRCODE='23514'; END IF;
  SELECT a.row_json INTO v_invoice FROM app_private.financial_reset_archive_rows a
   WHERE a.operation_id=p_operation AND a.organization_id=v_op.organization_id AND a.relation_name='public.tenant_invoices'
   AND a.primary_key=jsonb_build_object('id',(v_source->>'invoice_id')::uuid)
   AND a.row_sha256=v_source->>'row_sha256' AND a.row_sha256=app_private.financial_reset_hash(a.row_json)
   AND EXISTS(SELECT 1 FROM app_private.financial_reset_actions x WHERE x.operation_id=a.operation_id AND x.organization_id=a.organization_id
    AND x.relation_name=a.relation_name AND x.primary_key=a.primary_key AND x.kind='archive-delete' AND x.applied_at IS NOT NULL
    AND x.before_sha256=a.row_sha256 AND x.before_row=a.row_json);
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_original_invoice_source_changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO STRICT v_lease FROM public.leases WHERE organization_id=v_op.organization_id AND id=(v_item->>'lease_id')::uuid;
  IF v_invoice->'id' IS DISTINCT FROM v_source->'invoice_id' OR v_invoice->>'organization_id' IS DISTINCT FROM v_op.organization_id::text
  OR v_invoice->'lease_id' IS DISTINCT FROM v_item->'lease_id' OR v_invoice->'lease_term_id' IS DISTINCT FROM v_item->'term_id'
  OR v_invoice->'billing_term_id' IS DISTINCT FROM v_item->'billing_rule_id' OR v_invoice->>'property_id' IS DISTINCT FROM v_lease.property_id::text
  OR v_invoice->>'unit_id' IS DISTINCT FROM v_lease.unit_id::text
  OR v_invoice->>'billing_period_start' IS DISTINCT FROM '2026-10-01' OR v_invoice->>'billing_period_end' IS DISTINCT FROM '2026-10-31'
  OR v_invoice->>'issue_date' IS DISTINCT FROM '2026-10-01' OR v_invoice->>'due_date' IS DISTINCT FROM '2026-10-07'
  OR v_invoice->>'lifecycle' IS DISTINCT FROM 'issued' OR v_invoice->'voided_at' IS DISTINCT FROM 'null'::jsonb OR v_invoice->'voided_by' IS DISTINCT FROM 'null'::jsonb
  OR v_invoice->'currency' IS DISTINCT FROM v_item->'currency' OR v_invoice->'recipient_person_id' IS DISTINCT FROM v_item->'recipient_person_id'
  OR v_invoice->'collection_route' IS DISTINCT FROM v_item->'collection_route' THEN
   RAISE EXCEPTION 'financial_reset_original_invoice_identity_or_dates_mismatch' USING ERRCODE='23514';
  END IF;
 END LOOP;
END;
$$;

DO $extend$
DECLARE d text; a text; r text; g text;
BEGIN
 g:=md5(pg_get_functiondef('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure));
 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=$patch$ ARRAY['actor_id','billing_period_start','issue_date','leases','source_sha256','version']::text[]$patch$;
 r:=$patch$ (CASE WHEN p_plan->>'version'='3' THEN ARRAY['actor_id','billing_period_start','execution_business_date','invoice_date_policy','issue_date','leases','original_invoice_sources','source_sha256','version']::text[]
 ELSE ARRAY['actor_id','billing_period_start','issue_date','leases','source_sha256','version']::text[] END)$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_plan_keys_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$ OR p_plan->>'version' NOT IN ('1','2') OR$patch$; r:=$patch$ OR p_plan->>'version' NOT IN ('1','2','3') OR$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_version_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$ IF v_issue IS DISTINCT FROM v_business_date THEN$patch$;
 r:=$patch$ IF (CASE WHEN p_plan->>'version'='3' THEN (p_plan->>'execution_business_date')::date ELSE v_issue END) IS DISTINCT FROM v_business_date THEN$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_prepare_clock_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$  IF p_plan->>'version'='2' THEN$patch$; r:=$patch$  IF p_plan->>'version' IN ('2','3') THEN$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_disposition_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$ INSERT INTO app_private.financial_reset_continuation_plans(operation_id,organization_id,plan_json,review_sha256)$patch$;
 r:=$patch$ IF p_plan->>'version'='3' THEN PERFORM app_private.assert_financial_reset_original_invoice_dates(p_operation,p_plan); END IF;
$patch$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_prepare_assert_anchor_changed'; END IF;
 EXECUTE replace(d,a,r);

 d:=replace(pg_get_functiondef('app_private.apply_financial_reset_continuation(uuid)'::regprocedure),E'\r\n',E'\n');
 a:=$patch$ IF app_private.rent_business_date(v_op.organization_id,statement_timestamp()) IS DISTINCT FROM v_issue THEN$patch$;
 r:=$patch$ IF v_plan.plan_json->>'version'='3' THEN PERFORM app_private.assert_financial_reset_original_invoice_dates(p_operation,v_plan.plan_json); END IF;
 IF app_private.rent_business_date(v_op.organization_id,statement_timestamp()) IS DISTINCT FROM
  (CASE WHEN v_plan.plan_json->>'version'='3' THEN (v_plan.plan_json->>'execution_business_date')::date ELSE v_issue END) THEN$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_apply_clock_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$IF v_plan.plan_json->>'version'<>'2' THEN$patch$; r:=$patch$IF v_plan.plan_json->>'version' NOT IN ('2','3') THEN$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_apply_deferred_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$  UPDATE app_private.financial_reset_continuation_plans SET status='complete',completed_at=clock_timestamp(),result_json=v_result$patch$;
 r:=$patch$  IF v_plan.plan_json->>'version'='3' THEN
   v_result:=v_result||jsonb_build_object('invoice_date_policy',v_plan.plan_json->'invoice_date_policy','issue_date',v_issue,
    'execution_business_date',v_plan.plan_json->'execution_business_date','original_invoice_sources',v_plan.plan_json->'original_invoice_sources');
  END IF;
$patch$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_result_anchor_changed'; END IF;
 EXECUTE replace(d,a,r);

 d:=replace(pg_get_functiondef('app_private.financial_reset_report_deferred_blocker(uuid,uuid,public.currency_code,jsonb)'::regprocedure),E'\r\n',E'\n');
 a:=$patch$p.plan_json->>'version'<>'2'$patch$; r:=$patch$p.plan_json->>'version' NOT IN ('2','3')$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_original_dates_report_deferred_anchor_changed'; END IF;
 EXECUTE replace(d,a,r);
 IF md5(pg_get_functiondef('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure)) IS DISTINCT FROM g THEN
  RAISE EXCEPTION 'financial_reset_original_dates_generator_changed';
 END IF;
END;
$extend$;

REVOKE ALL ON FUNCTION app_private.assert_financial_reset_original_invoice_dates(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
