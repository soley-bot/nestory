-- Optional October empty-books review. No organization is enrolled or reopened.
-- Preserve contractual authority; only the reviewed exact-row reset removes cash.
BEGIN;

CREATE FUNCTION app_private.financial_reset_preserved_contracts(p_org uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'leases',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.leases l WHERE organization_id=p_org),
  'terms',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.lease_terms t WHERE organization_id=p_org),
  'billing_rules',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY id),'[]') FROM public.lease_billing_terms b WHERE organization_id=p_org))
$$;

CREATE FUNCTION app_private.financial_reset_preserved_lease_source(p_org uuid,p_lease uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('lease',to_jsonb(l),
  'terms',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.lease_terms t WHERE organization_id=p_org AND lease_id=p_lease),
  'billing_rules',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY id),'[]') FROM public.lease_billing_terms b WHERE organization_id=p_org AND lease_id=p_lease))
 FROM public.leases l WHERE organization_id=p_org AND id=p_lease
$$;

-- A separate policy cannot smuggle the old billing/renewal fields into a no-op.
CREATE FUNCTION app_private.assert_financial_reset_empty_semantic(p_semantic jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i jsonb;
BEGIN
 IF p_semantic IS NULL OR jsonb_typeof(p_semantic) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'financial_reset_empty_review_invalid' USING ERRCODE='23514';
 END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_semantic) k) IS DISTINCT FROM
  ARRAY['actor_id','billing_period_start','contracts_sha256','execution_business_date','invoice_date_policy','issue_date','leases','version']::text[]
  OR p_semantic->'version' IS DISTINCT FROM '4'::jsonb
  OR p_semantic->>'billing_period_start' IS DISTINCT FROM '2026-10-01'
  OR p_semantic->>'issue_date' IS DISTINCT FROM '2026-10-01'
  OR p_semantic->>'invoice_date_policy' IS DISTINCT FROM 'empty-books-no-invoices'
  OR coalesce(p_semantic->>'actor_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR coalesce(p_semantic->>'contracts_sha256','') !~ '^[a-f0-9]{64}$'
  OR coalesce(p_semantic->>'execution_business_date','') !~ '^2026-10-(0[1-9]|[12][0-9]|3[01])$'
  OR jsonb_typeof(p_semantic->'leases') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'financial_reset_empty_review_invalid' USING ERRCODE='23514';
 END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(p_semantic->'leases') LOOP
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'financial_reset_empty_lease_invalid' USING ERRCODE='23514';
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(i) k) IS DISTINCT FROM ARRAY['disposition','lease_id','source_sha256']::text[]
   OR i->>'disposition' IS DISTINCT FROM 'preserve-unbilled'
   OR coalesce(i->>'lease_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR coalesce(i->>'source_sha256','') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'financial_reset_empty_lease_invalid' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'lease_id') FROM jsonb_array_elements(p_semantic->'leases'))<>jsonb_array_length(p_semantic->'leases') THEN
  RAISE EXCEPTION 'financial_reset_continuation_duplicate_lease' USING ERRCODE='23514';
 END IF;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_empty_contracts(p_org uuid,p_semantic jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i jsonb;
BEGIN
 PERFORM app_private.assert_financial_reset_empty_semantic(p_semantic);
 IF (SELECT coalesce(jsonb_agg(id::text ORDER BY id::text),'[]') FROM public.leases WHERE organization_id=p_org)
  IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value->>'lease_id' ORDER BY value->>'lease_id'),'[]') FROM jsonb_array_elements(p_semantic->'leases')) THEN
  RAISE EXCEPTION 'financial_reset_continuation_roster_mismatch' USING ERRCODE='23514';
 END IF;
 IF app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(p_org)) IS DISTINCT FROM p_semantic->>'contracts_sha256' THEN
  RAISE EXCEPTION 'financial_reset_empty_contracts_changed' USING ERRCODE='40001';
 END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(p_semantic->'leases') LOOP
  IF app_private.financial_reset_hash(app_private.financial_reset_preserved_lease_source(p_org,(i->>'lease_id')::uuid)) IS DISTINCT FROM i->>'source_sha256' THEN
   RAISE EXCEPTION 'financial_reset_empty_contracts_changed' USING ERRCODE='40001';
  END IF;
 END LOOP;
END;
$$;

-- Known-zero rows are the only surviving opening authority. Reports may add
-- zero period components, but never allocations, fees, invoices, cash or custody.
CREATE FUNCTION app_private.assert_financial_reset_empty_sources(p_operation uuid,p_reports boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.financial_reset_operations%ROWTYPE; z app_private.financial_reset_zero_plans%ROWTYPE;
 s jsonb; r record;
BEGIN
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 SELECT * INTO STRICT z FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation AND status='complete';
 s:=app_private.financial_reset_continuation_snapshot(o.organization_id);
 FOR r IN SELECT relation_name FROM app_private.financial_reset_relation_rules WHERE archive_remove LOOP
  IF r.relation_name IN ('public.owner_opening_balance_requests','public.owner_opening_balance_entries') THEN
   IF s->r.relation_name IS DISTINCT FROM (SELECT coalesce(jsonb_agg(e->'row_json' ORDER BY (e->'row_json')::text),'[]')
    FROM jsonb_array_elements(z.result_json->'authority_rows') e WHERE e->>'relation_name'=r.relation_name) THEN
    RAISE EXCEPTION 'financial_reset_continuation_zero_evidence_changed' USING ERRCODE='40001';
   END IF;
  ELSIF p_reports AND r.relation_name IN ('public.owner_balance_periods','public.owner_balance_period_components') THEN
   CONTINUE;
  ELSIF s->r.relation_name IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'financial_reset_empty_monetary_source: %',r.relation_name USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.lease_deposits WHERE organization_id=o.organization_id AND archived_at IS NULL
   AND status IN ('received','held','partially_returned')) THEN
  RAISE EXCEPTION 'financial_reset_empty_recorded_deposit_cash' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.owner_balance_period_components WHERE organization_id=o.organization_id
   AND (opening_amount<>0 OR movement_amount<>0 OR closing_amount<>0)) THEN
  RAISE EXCEPTION 'financial_reset_empty_nonzero_component' USING ERRCODE='23514';
 END IF;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_empty_plan(p_operation uuid,p_plan jsonb) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.financial_reset_operations%ROWTYPE; v_actor uuid;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 IF o.operation_kind<>'reset' OR o.status<>'actions_complete'
  OR o.execution_backend IS DISTINCT FROM pg_backend_pid() OR o.execution_xid IS DISTINCT FROM pg_current_xact_id()
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation AND organization_id=o.organization_id AND status='complete')
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NULL)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_empty_checked_actions_required' USING ERRCODE='55000';
 END IF;
 PERFORM app_private.assert_financial_reset_empty_contracts(o.organization_id,p_plan-'source_sha256');
 IF coalesce(p_plan->>'source_sha256','') !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'financial_reset_empty_review_invalid' USING ERRCODE='23514';
 END IF;
 IF (SELECT financial_start_date FROM app_private.financial_write_controls WHERE organization_id=o.organization_id) IS DISTINCT FROM DATE '2026-10-01'
  OR date_trunc('month',app_private.rent_business_date(o.organization_id,statement_timestamp()))::date IS DISTINCT FROM DATE '2026-10-01' THEN
  RAISE EXCEPTION 'financial_reset_continuation_current_cutoff_month_required' USING ERRCODE='23514';
 END IF;
 IF p_plan->>'execution_business_date' IS DISTINCT FROM app_private.rent_business_date(o.organization_id,statement_timestamp())::text THEN
  RAISE EXCEPTION 'financial_reset_continuation_business_date_changed' USING ERRCODE='40001';
 END IF;
 v_actor:=(p_plan->>'actor_id')::uuid;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id_if_assigned() AND consumed_at IS NOT NULL) THEN
  IF app_private.assert_financial_reset_scoped_operator(p_operation) IS DISTINCT FROM v_actor
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations a WHERE a.operation_id=p_operation
    AND a.backend_pid=pg_backend_pid() AND a.transaction_id=pg_current_xact_id() AND a.action='execute' AND a.consumed_at IS NOT NULL
    AND a.binding->'continuation_semantic'=p_plan-'source_sha256'
    AND a.binding->>'continuation_semantic_sha256'=app_private.financial_reset_hash(p_plan-'source_sha256')
    AND a.binding->>'invoice_date_policy'='empty-books-no-invoices'
    AND a.binding->>'execution_business_date'=p_plan->>'execution_business_date'
    AND a.binding->>'issue_date'=p_plan->>'issue_date') THEN
   RAISE EXCEPTION 'financial_reset_scoped_phase_binding_invalid' USING ERRCODE='42501';
  END IF;
 ELSIF auth.uid() IS DISTINCT FROM v_actor OR NOT EXISTS(SELECT 1 FROM public.organization_members
   WHERE organization_id=o.organization_id AND user_id=v_actor AND role='super_admin') THEN
  RAISE EXCEPTION 'financial_reset_continuation_actor_required' USING ERRCODE='42501';
 END IF;
 RETURN v_actor;
END;
$$;

CREATE FUNCTION app_private.prepare_financial_reset_empty_continuation(p_operation uuid,p_plan jsonb,p_review_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 IF app_private.financial_reset_hash(p_plan) IS DISTINCT FROM p_review_sha256 THEN
  RAISE EXCEPTION 'financial_reset_continuation_plan_invalid' USING ERRCODE='23514';
 END IF;
 PERFORM app_private.assert_financial_reset_empty_plan(p_operation,p_plan);
 SELECT organization_id INTO STRICT v_org FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 IF app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(v_org)) IS DISTINCT FROM p_plan->>'source_sha256' THEN
  RAISE EXCEPTION 'financial_reset_continuation_source_changed' USING ERRCODE='40001';
 END IF;
 PERFORM app_private.assert_financial_reset_empty_sources(p_operation,false);
 INSERT INTO app_private.financial_reset_continuation_plans(operation_id,organization_id,plan_json,review_sha256)
 VALUES(p_operation,v_org,p_plan,p_review_sha256);
END;
$$;

CREATE FUNCTION app_private.apply_financial_reset_empty_continuation(p_operation uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.financial_reset_continuation_plans%ROWTYPE; o app_private.financial_reset_operations%ROWTYPE;
 s jsonb; v_result jsonb; v_leases jsonb;
BEGIN
 SELECT * INTO STRICT p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation FOR UPDATE;
 PERFORM app_private.assert_financial_reset_empty_plan(p_operation,p.plan_json);
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 s:=app_private.financial_reset_continuation_snapshot(p.organization_id);
 IF p.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p.plan_json)
  OR app_private.financial_reset_hash(s) IS DISTINCT FROM p.plan_json->>'source_sha256' THEN
  RAISE EXCEPTION 'financial_reset_continuation_source_changed' USING ERRCODE='40001';
 END IF;
 IF p.status='complete' THEN
  IF p.before_images IS DISTINCT FROM s OR p.after_images IS DISTINCT FROM s THEN
   RAISE EXCEPTION 'financial_reset_continuation_source_changed' USING ERRCODE='40001';
  END IF;
  RETURN p.result_json;
 END IF;
 PERFORM app_private.assert_financial_reset_empty_sources(p_operation,false);
 SELECT coalesce(jsonb_agg(i||jsonb_build_object('invoice_id',NULL,'generated_rent_amount',0,'generated_fee_amount',0,'contract_changed',false)
  ORDER BY i->>'lease_id'),'[]') INTO v_leases FROM jsonb_array_elements(p.plan_json->'leases') i;
 v_result:=jsonb_build_object('leases',v_leases,'generation',o.target_generation,
  'before_sha256',app_private.financial_reset_hash(s),'after_sha256',app_private.financial_reset_hash(s),
  'contracts_sha256',p.plan_json->'contracts_sha256','contracts_unchanged',true,'empty_books',true,'billing_paused',true,
  'billing_complete',false,'close_ready',false,'deferred_lease_count',0,'preserved_unbilled_lease_count',jsonb_array_length(v_leases),
  'invoice_date_policy','empty-books-no-invoices','execution_business_date',p.plan_json->'execution_business_date');
 PERFORM app_private.record_financial_reset_phase_fence(p_operation,'continuation');
 UPDATE app_private.financial_reset_continuation_plans SET status='complete',completed_at=clock_timestamp(),
  result_json=v_result,before_images=s,after_images=s WHERE operation_id=p_operation;
 RETURN v_result;
END;
$$;

-- Public close readiness is unchanged: this private checkpoint can retain a
-- precisely reviewed missing-rent blocker, and labels the entire mode paused.
CREATE FUNCTION app_private.financial_reset_empty_report_blocker(p_operation uuid,p_property uuid,p_currency public.currency_code,p_blocker jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.financial_reset_continuation_plans%ROWTYPE; s jsonb;
BEGIN
 IF p_blocker->>'code' IS DISTINCT FROM 'monthly_rent_invoice_missing'
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_blocker) k) IS DISTINCT FROM ARRAY['code','lease_id','property_id','unit_id']::text[] THEN RETURN false; END IF;
 SELECT * INTO p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation AND status='complete';
 IF NOT FOUND OR p.plan_json->'version' IS DISTINCT FROM '4'::jsonb OR p_currency<>'USD' THEN RETURN false; END IF;
 PERFORM app_private.assert_financial_reset_empty_contracts(p.organization_id,p.plan_json-'source_sha256');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.plan_json->'leases') i WHERE i->'lease_id'=p_blocker->'lease_id'
   AND i->>'disposition'='preserve-unbilled') THEN RETURN false; END IF;
 s:=app_private.financial_reset_preserved_lease_source(p.organization_id,(p_blocker->>'lease_id')::uuid);
 RETURN p_blocker->>'property_id'=p_property::text AND p_blocker->'property_id'=s->'lease'->'property_id'
  AND p_blocker->'unit_id'=s->'lease'->'unit_id';
END;
$$;

-- Extend only checked anchors. Existing policy branches, session validation,
-- exact images, phase fences and the commit seal are retained verbatim.
DO $integrate$
DECLARE d text; a text; b text; r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.assert_financial_reset_actor_binding(jsonb,text)'),
  ('app_private.reserve_financial_reset_hosted_operation(jsonb)')) x(signature) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  a:=$a$NOT IN ('execution-business-date','original-reviewed-october')$a$;
  b:=$b$NOT IN ('execution-business-date','original-reviewed-october','empty-books-no-invoices')$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_policy_anchor_changed: %',r.signature; END IF;
  d:=replace(d,a,b);
  -- This check adds no authority: the original binding/session checks still run.
  a:=E'BEGIN\n';
  b:=a||$b$ IF p_binding->'continuation_semantic'->'version'='4'::jsonb OR p_binding->>'invoice_date_policy'='empty-books-no-invoices' THEN
  PERFORM app_private.assert_financial_reset_empty_semantic(p_binding->'continuation_semantic');
  IF p_binding->'version' IS DISTINCT FROM '1'::jsonb
   OR p_binding->>'invoice_date_policy' IS DISTINCT FROM 'empty-books-no-invoices'
   OR p_binding->>'issue_date' IS DISTINCT FROM '2026-10-01'
   OR p_binding->>'execution_business_date' IS DISTINCT FROM p_binding->'continuation_semantic'->>'execution_business_date' THEN
   RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
  END IF;
 END IF;
$b$;
  IF strpos(d,a)=0 THEN RAISE EXCEPTION 'financial_reset_empty_binding_body_changed'; END IF;
  EXECUTE overlay(d placing b from strpos(d,a) for length(a));
 END LOOP;

 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=E'BEGIN\n';
 b:=a||$b$ IF p_plan->'version'='4'::jsonb THEN
  PERFORM app_private.prepare_financial_reset_empty_continuation(p_operation,p_plan,p_review_sha256);
  RETURN;
 END IF;
$b$;
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'financial_reset_empty_prepare_body_changed'; END IF;
 EXECUTE overlay(d placing b from strpos(d,a) for length(a));
 FOR r IN SELECT * FROM (VALUES('app_private.apply_financial_reset_continuation(uuid)'),
  ('app_private.financial_reset_scoped_continuation(uuid)')) x(signature) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  b:=a||$b$ IF EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation AND plan_json->'version'='4'::jsonb) THEN
  RETURN app_private.apply_financial_reset_empty_continuation(p_operation);
 END IF;
$b$;
  IF strpos(d,a)=0 THEN RAISE EXCEPTION 'financial_reset_empty_apply_body_changed'; END IF;
  EXECUTE overlay(d placing b from strpos(d,a) for length(a));
 END LOOP;

 d:=replace(pg_get_functiondef('app_private.assert_financial_reset_scoped_phase(uuid,text)'::regprocedure),E'\r\n',E'\n');
 a:=$a$ IF p.plan_json->'version' IS DISTINCT FROM '3'::jsonb$a$;
 b:=$b$ IF p.plan_json->'version'='4'::jsonb THEN
  -- Nested report commands run under the existing exclusive lifecycle lock
  -- during the checked temporary-open window. The outer phase alone requires
  -- frozen here; common checks above still bind this exact execution transaction.
  PERFORM app_private.assert_financial_reset_empty_contracts(o.organization_id,p.plan_json-'source_sha256');
  IF a.binding->>'invoice_date_policy' IS DISTINCT FROM 'empty-books-no-invoices'
   OR p.plan_json->>'execution_business_date' IS DISTINCT FROM a.binding->>'execution_business_date'
   OR p.plan_json->>'execution_business_date' IS DISTINCT FROM app_private.rent_business_date(o.organization_id,statement_timestamp())::text
   OR p.plan_json->>'issue_date' IS DISTINCT FROM a.binding->>'issue_date' THEN
   RAISE EXCEPTION 'financial_reset_scoped_phase_binding_invalid' USING ERRCODE='42501';
  END IF;
 ELSIF p.plan_json->'version' IS DISTINCT FROM '3'::jsonb$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_scoped_phase_changed'; END IF;
 EXECUTE replace(d,a,b);

 FOR r IN SELECT * FROM (VALUES('app_private.apply_financial_reset_reports(uuid)'),
  ('app_private.financial_reset_scoped_reports(uuid)')) x(signature) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  a:=$a$ v_before:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);$a$;
  b:=a||$b$
 IF v_phase.plan_json->'version'='4'::jsonb THEN
  PERFORM app_private.assert_financial_reset_empty_plan(p_operation,v_phase.plan_json);
 END IF;
$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_source_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$ -- The exclusive lifecycle lock is held throughout.$a$;
  b:=$b$ IF v_phase.plan_json->'version'='4'::jsonb THEN
  PERFORM app_private.assert_financial_reset_empty_sources(p_operation,false);
 END IF;
$b$||a;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_baseline_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$AND NOT app_private.financial_reset_report_deferred_blocker(p_operation,(v_scope->>'property_id')::uuid,(v_scope->>'currency')::public.currency_code,b)$a$;
  b:=a||$b$ AND NOT app_private.financial_reset_empty_report_blocker(p_operation,(v_scope->>'property_id')::uuid,(v_scope->>'currency')::public.currency_code,b)$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_blocker_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$'status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(v_readiness->'blockers')$a$;
  b:=$b$'status',CASE WHEN v_phase.plan_json->'version'='4'::jsonb THEN 'empty-books-billing-paused' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(v_readiness->'blockers')$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_status_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$ OR l->>'closing_amount' IS NULL OR l->>'blocked_reason_code' IS NOT NULL$a$;
  b:=a||$b$ OR (v_phase.plan_json->'version'='4'::jsonb AND
      ((l->>'movement_amount')::numeric IS DISTINCT FROM 0 OR (l->>'closing_amount')::numeric IS DISTINCT FROM 0))$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_ledger_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$ v_after:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);$a$;
  b:=a||$b$
 IF v_phase.plan_json->'version'='4'::jsonb THEN
  PERFORM app_private.assert_financial_reset_empty_sources(p_operation,true);
  PERFORM app_private.assert_financial_reset_empty_contracts(v_op.organization_id,v_phase.plan_json-'source_sha256');
 END IF;
$b$;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_after_anchor_changed'; END IF;
  d:=replace(d,a,b);
  a:=$a$ INSERT INTO app_private.financial_reset_verification_checkpoints(operation_id,organization_id,checkpoint_kind,generation,$a$;
  b:=$b$ IF v_phase.plan_json->'version'='4'::jsonb THEN
  v_result:=v_result||jsonb_build_object('empty_books',true,'billing_paused',true,'contracts_unchanged',true,
   'contracts_sha256',v_phase.plan_json->'contracts_sha256','billing_complete',false,'close_ready',false,
   'deferred_lease_count',0,'preserved_unbilled_lease_count',jsonb_array_length(v_phase.plan_json->'leases'));
 END IF;
$b$||a;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_report_checkpoint_anchor_changed'; END IF;
  EXECUTE replace(d,a,b);
 END LOOP;
END;
$integrate$;

-- Paused means frozen. The existing reopening protocol cannot implicitly turn
-- this no-billing review into authorization to resume billing or financial writes.
DO $restart$
DECLARE d text; a text:=E'BEGIN\n';
BEGIN
 d:=replace(pg_get_functiondef('app_private.assert_financial_reset_reopening_ready(jsonb,text)'::regprocedure),E'\r\n',E'\n');
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'financial_reset_empty_reopening_anchor_changed'; END IF;
 EXECUTE overlay(d placing a||$b$ IF p_binding->'continuation_semantic'->'version'='4'::jsonb AND NOT (p_binding ? 'recovery') THEN
  RAISE EXCEPTION 'financial_reset_empty_restart_review_required' USING ERRCODE='55000';
 END IF;
$b$ from strpos(d,a) for length(a));
END;
$restart$;

-- A reviewed empty-books opening may retain an archived owner's historical
-- identity only for an already archived property. Ordinary ownership readers,
-- owner roles, cutoff dates and conservation checks are unchanged.
DO $empty_zero_readers$
DECLARE d text; a text; b text; r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.financial_reset_zero_roster_on_date(uuid,uuid,date)','994c22e47e7548f9eac1cc4d7dc3c2fa34f3785fd07fcad77d331921bf27b483'),
  ('app_private.financial_reset_zero_scope_on_date(uuid,date)','9a699bcb7580fb82d6f813e2eaab87d65934f5fb1f9fa8e2b59a4cffdc592e9c'),
  ('app_private.prepare_financial_reset_zero_plan(uuid,jsonb,text)','4ec5ef11cd6e4413478c3a8567ab3c16d3e947b40aba8b2c5ccec4204de1a168'),
  ('app_private.financial_reset_known_zero_scope(uuid)','8c60e17f6a3c0aea25a5596ecc393b9abe553a42c5fb19cca543e0e19412887d'),
  ('app_private.assert_financial_reset_archived_zero_context(app_private.financial_reset_archived_zero_command_context)','143f107669b05d4ffea74dab4146ec734ae3fb8db4e5ca5486ac7f3f2cc34b66'),
  ('app_private.apply_financial_reset_known_zero(uuid)','8c3e25728955170a3345d0a8f5cff66cffa6fd74e361b66f7632a7d9c1f17036'),
  ('app_private.financial_reset_scoped_submit_opening(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)','1c70b0ec666b8fdb27c7dd0e098169a417babd35e11217ba3ffa3eba2c14c928'),
  ('app_private.financial_reset_scoped_review_opening(uuid,uuid,text,text,text)','330ab58011bb69a5c6bc372eb9f68e9aefdac31b4ac0830070158a8e515a085a')
 ) p(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')<>r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_empty_zero_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
 d:=replace(pg_get_functiondef('app_private.financial_reset_zero_roster_on_date(uuid,uuid,date)'::regprocedure),E'\r\n',E'\n');
 d:=replace(d,'FUNCTION app_private.financial_reset_zero_roster_on_date(','FUNCTION app_private.financial_reset_empty_zero_roster_on_date(');
 a:='pe.archived_at IS NOT NULL OR NOT EXISTS (';
 b:='(pe.archived_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id=p_property_id AND p.organization_id=p_organization_id AND p.archived_at IS NOT NULL)) OR NOT EXISTS (';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_owner_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 d:=replace(pg_get_functiondef('app_private.financial_reset_zero_scope_on_date(uuid,date)'::regprocedure),E'\r\n',E'\n');
 d:=replace(d,'FUNCTION app_private.financial_reset_zero_scope_on_date(','FUNCTION app_private.financial_reset_empty_zero_scope_on_date(');
 a:='app_private.financial_reset_zero_roster_on_date(';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_scope_anchor_changed'; END IF;
 d:=replace(d,a,'app_private.financial_reset_empty_zero_roster_on_date(');
 a:=$a$'property_archived_at',v_property.row_json->'archived_at'$a$;
 b:=a||$b$,'owner_person_row_sha256',(SELECT app_private.financial_reset_hash(to_jsonb(pe)) FROM public.people pe WHERE pe.organization_id=p_organization_id AND pe.id=v_owner.owner_person_id)$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_person_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 -- This explicit preparation entry needs no continuation row or execution
 -- context: both real actors subsequently endorse its entire immutable plan.
 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_zero_plan(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 d:=replace(d,'FUNCTION app_private.prepare_financial_reset_zero_plan(','FUNCTION app_private.prepare_financial_reset_empty_zero_plan(');
 a:=$a$ IF v_op.operation_kind<>'reset' OR p_review_sha256$a$;
 b:=$b$ IF p_plan->'version' IS DISTINCT FROM '4'::jsonb OR v_op.operation_kind<>'reset' OR p_review_sha256$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_prepare_anchor_changed'; END IF;
 d:=replace(d,a,b);
 a:='app_private.financial_reset_known_zero_scope(p_operation_id)';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_prepare_scope_anchor_changed'; END IF;
 d:=replace(d,a,'app_private.financial_reset_empty_zero_scope_on_date(v_op.organization_id,v_date)');
 a:=$a$'reviewer_actor_id','scopes']::text[]$a$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_prepare_keys_anchor_changed'; END IF;
 EXECUTE replace(d,a,$b$'reviewer_actor_id','scopes','version']::text[]$b$);
 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_zero_plan(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=E'BEGIN\n';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_prepare_dispatch_anchor_changed'; END IF;
 EXECUTE replace(d,a,a||$b$ IF p_plan->'version'='4'::jsonb THEN
  PERFORM app_private.prepare_financial_reset_empty_zero_plan(p_operation_id,p_plan,p_review_sha256); RETURN;
 END IF;
$b$);
 d:=replace(pg_get_functiondef('app_private.financial_reset_known_zero_scope(uuid)'::regprocedure),E'\r\n',E'\n');
 a:=' RETURN app_private.financial_reset_zero_scope_on_date(v_org,v_date);';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_scope_dispatch_anchor_changed'; END IF;
 EXECUTE replace(d,a,$b$ IF EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id AND plan_json->'version'='4'::jsonb) THEN
  RETURN app_private.financial_reset_empty_zero_scope_on_date(v_org,v_date);
 END IF;
$b$||a);
END;
$empty_zero_readers$;

CREATE FUNCTION app_private.assert_financial_reset_empty_zero_operator(p_operation uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a app_private.financial_reset_actor_authorizations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_scoped_operator(p_operation);
 SELECT * INTO STRICT a FROM app_private.financial_reset_actor_authorizations
 WHERE operation_id=p_operation AND action='execute' AND consumed_at IS NOT NULL
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 IF a.binding->'continuation_semantic'->'version' IS DISTINCT FROM '4'::jsonb
  OR a.binding->>'invoice_date_policy' IS DISTINCT FROM 'empty-books-no-invoices'
  OR a.binding->'continuation_semantic'->>'invoice_date_policy' IS DISTINCT FROM 'empty-books-no-invoices'
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation AND plan_json->'version'='4'::jsonb
   AND review_sha256=a.binding->>'zero_review_sha256' AND review_sha256=app_private.financial_reset_hash(plan_json)) THEN
  RAISE EXCEPTION 'financial_reset_empty_zero_consumed_review_required' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_financial_reset_empty_semantic(a.binding->'continuation_semantic');
END;
$$;

CREATE FUNCTION app_private.financial_reset_reviewed_zero_roster_on_date(p_operation uuid,p_organization_id uuid,p_property_id uuid,p_effective_date date)
RETURNS TABLE(property_owner_id uuid,owner_person_id uuid,ownership_percent numeric(6,3),started_on date,ended_on date,ownership_roster_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE z app_private.financial_reset_zero_plans%ROWTYPE; s jsonb; person_image jsonb; property_image jsonb; n integer:=0;
BEGIN
 SELECT * INTO STRICT z FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation;
 IF z.plan_json->'version'='4'::jsonb THEN
  PERFORM app_private.assert_financial_reset_empty_zero_operator(p_operation);
  IF z.organization_id IS DISTINCT FROM p_organization_id OR z.plan_json->>'effective_date' IS DISTINCT FROM p_effective_date::text THEN
   RAISE EXCEPTION 'financial_reset_empty_zero_roster_context_invalid' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) INTO property_image FROM public.properties p WHERE p.organization_id=p_organization_id AND p.id=p_property_id FOR SHARE;
  FOR s IN SELECT value FROM jsonb_array_elements(z.plan_json->'scopes') WHERE value->>'property_id'=p_property_id::text LOOP
   n:=n+1;
   SELECT to_jsonb(p) INTO person_image FROM public.people p WHERE p.organization_id=p_organization_id AND p.id=(s->>'owner_person_id')::uuid FOR SHARE;
   IF person_image IS NULL OR property_image IS NULL OR app_private.financial_reset_hash(person_image) IS DISTINCT FROM s->>'owner_person_row_sha256'
    OR app_private.financial_reset_hash(property_image) IS DISTINCT FROM s->>'property_row_sha256'
    OR property_image->'archived_at' IS DISTINCT FROM s->'property_archived_at' THEN
    RAISE EXCEPTION 'financial_reset_empty_zero_identity_changed' USING ERRCODE='40001';
   END IF;
  END LOOP;
  IF n=0 THEN RAISE EXCEPTION 'financial_reset_empty_zero_roster_context_invalid' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT * FROM app_private.financial_reset_empty_zero_roster_on_date(p_organization_id,p_property_id,p_effective_date);
 ELSE
  RETURN QUERY SELECT * FROM app_private.financial_reset_zero_roster_on_date(p_organization_id,p_property_id,p_effective_date);
 END IF;
END;
$$;

CREATE FUNCTION app_private.financial_reset_empty_command_roster_on_date(p_organization_id uuid,p_property_id uuid,p_effective_date date)
RETURNS TABLE(property_owner_id uuid,owner_person_id uuid,ownership_percent numeric(6,3),started_on date,ended_on date,ownership_roster_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_reset_zero_command_context%ROWTYPE;
BEGIN
 SELECT x.* INTO c FROM app_private.financial_reset_zero_command_context x JOIN app_private.financial_reset_zero_plans z USING(operation_id)
 WHERE x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id_if_assigned() AND z.plan_json->'version'='4'::jsonb;
 IF FOUND THEN
  IF app_private.financial_reset_archived_zero_scope_allowed(p_organization_id,p_property_id,p_effective_date) THEN
   RETURN QUERY SELECT * FROM app_private.financial_reset_reviewed_zero_roster_on_date(c.operation_id,p_organization_id,p_property_id,p_effective_date);
   RETURN;
  END IF;
 END IF;
 RETURN QUERY SELECT * FROM app_private.owner_opening_command_roster_on_date(p_organization_id,p_property_id,p_effective_date);
END;
$$;

DO $empty_zero_commands$
DECLARE d text; a text; b text; r record;
BEGIN
 d:=replace(pg_get_functiondef('app_private.assert_financial_reset_archived_zero_context(app_private.financial_reset_archived_zero_command_context)'::regprocedure),E'\r\n',E'\n');
 a:='app_private.financial_reset_zero_roster_on_date(v_op.organization_id,';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_archived_context_anchor_changed'; END IF;
 EXECUTE replace(d,a,'app_private.financial_reset_reviewed_zero_roster_on_date(p_context.operation_id,v_op.organization_id,');
 FOR r IN SELECT signature FROM (VALUES
  ('app_private.financial_reset_scoped_submit_opening(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'),
  ('app_private.financial_reset_scoped_review_opening(uuid,uuid,text,text,text)')) p(signature) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  a:='app_private.owner_opening_command_roster_on_date(';
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_scoped_command_anchor_changed'; END IF;
  d:=replace(d,a,'app_private.financial_reset_empty_command_roster_on_date(');
  IF r.signature LIKE 'app_private.financial_reset_scoped_submit_opening(%' THEN
   a:='AND owner_person.archived_at IS NULL';
   IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_submit_person_anchor_changed'; END IF;
   d:=replace(d,a,$b$AND (owner_person.archived_at IS NULL OR EXISTS (
    SELECT 1 FROM app_private.financial_reset_empty_command_roster_on_date(p_organization_id,p_property_id,p_effective_date) historical_owner
    WHERE historical_owner.owner_person_id=p_owner_person_id))$b$);
  END IF;
  EXECUTE d;
 END LOOP;
 d:=replace(pg_get_functiondef('app_private.apply_financial_reset_known_zero(uuid)'::regprocedure),E'\r\n',E'\n');
 a:=' SELECT * INTO STRICT v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id FOR UPDATE;';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_empty_zero_execution_anchor_changed'; END IF;
 b:=a||E'\n IF v_plan.plan_json->''version''=''4''::jsonb THEN PERFORM app_private.assert_financial_reset_empty_zero_operator(p_operation_id); END IF;';
 EXECUTE replace(d,a,b);
END;
$empty_zero_commands$;

REVOKE ALL ON FUNCTION app_private.financial_reset_empty_zero_roster_on_date(uuid,uuid,date),app_private.financial_reset_empty_zero_scope_on_date(uuid,date),
 app_private.prepare_financial_reset_empty_zero_plan(uuid,jsonb,text),app_private.assert_financial_reset_empty_zero_operator(uuid),
 app_private.financial_reset_reviewed_zero_roster_on_date(uuid,uuid,uuid,date),app_private.financial_reset_empty_command_roster_on_date(uuid,uuid,date)
 FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.financial_reset_preserved_contracts(uuid),app_private.financial_reset_preserved_lease_source(uuid,uuid),
 app_private.assert_financial_reset_empty_semantic(jsonb),app_private.assert_financial_reset_empty_contracts(uuid,jsonb),
 app_private.assert_financial_reset_empty_sources(uuid,boolean),app_private.assert_financial_reset_empty_plan(uuid,jsonb),
 app_private.prepare_financial_reset_empty_continuation(uuid,jsonb,text),app_private.apply_financial_reset_empty_continuation(uuid),
 app_private.financial_reset_empty_report_blocker(uuid,uuid,public.currency_code,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
