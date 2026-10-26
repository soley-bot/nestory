-- Private, consumed-session October replay. No identity claims are manufactured.
-- Ordinary commands and their authentication helpers retain their definitions.
-- This path is deliberately limited to v3 original dates and existing contracts;
-- it cannot enter the legacy month-to-month writer/catch-up trigger graph.
BEGIN;
SET LOCAL search_path=public,pg_catalog;

CREATE FUNCTION app_private.assert_financial_reset_scoped_phase(p_operation uuid,p_phase text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; a app_private.financial_reset_actor_authorizations%ROWTYPE;
 o app_private.financial_reset_operations%ROWTYPE; p app_private.financial_reset_continuation_plans%ROWTYPE;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_operator(p_operation);
 SELECT * INTO STRICT a FROM app_private.financial_reset_actor_authorizations WHERE operation_id=p_operation
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND consumed_at IS NOT NULL AND action='execute';
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 SELECT * INTO p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation;
 IF p_phase IS NULL OR p_phase NOT IN ('continuation','reports') OR o.status IS DISTINCT FROM 'actions_complete'
  OR o.execution_backend IS DISTINCT FROM pg_backend_pid() OR o.execution_xid IS DISTINCT FROM pg_current_xact_id()
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=p_operation
   AND z.organization_id=o.organization_id AND z.status='complete')
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NULL)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid())
  OR p.operation_id IS NULL OR p.organization_id IS DISTINCT FROM o.organization_id
  OR p.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p.plan_json)
  OR p.plan_json-'source_sha256' IS DISTINCT FROM a.binding->'continuation_semantic'
  OR app_private.financial_reset_hash(p.plan_json-'source_sha256') IS DISTINCT FROM a.binding->>'continuation_semantic_sha256'
  OR p.plan_json->>'actor_id' IS DISTINCT FROM v_actor::text
  OR (p_phase='reports' AND p.status IS DISTINCT FROM 'complete') THEN
  RAISE EXCEPTION 'financial_reset_scoped_phase_binding_invalid' USING ERRCODE='42501';
 END IF;
 IF p.plan_json->'version' IS DISTINCT FROM '3'::jsonb
  OR p.plan_json->>'invoice_date_policy' IS DISTINCT FROM 'original-reviewed-october'
  OR a.binding->>'invoice_date_policy' IS DISTINCT FROM 'original-reviewed-october'
  OR p.plan_json->>'billing_period_start' IS DISTINCT FROM '2026-10-01'
  OR p.plan_json->>'issue_date' IS DISTINCT FROM '2026-10-01'
  OR p.plan_json->>'execution_business_date' IS DISTINCT FROM a.binding->>'execution_business_date'
  OR a.binding->>'issue_date' IS DISTINCT FROM p.plan_json->>'issue_date'
  OR p.plan_json->>'execution_business_date' IS DISTINCT FROM app_private.rent_business_date(o.organization_id,statement_timestamp())::text
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.plan_json->'leases') l WHERE
   l->>'disposition' NOT IN ('bill','defer-expired-unbilled') OR l->'continue_month_to_month'='true'::jsonb) THEN
  RAISE EXCEPTION 'financial_reset_scoped_original_dates_required' USING ERRCODE='42501';
 END IF;
 -- The immutable consumed binding carries the reviewed report hash. If this is
 -- a reserved hosted workflow, its original reservation must bind the same bytes.
 IF coalesce(a.binding->>'report_review_sha256','') !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=p_operation
   AND (r.binding IS DISTINCT FROM a.binding OR r.binding_sha256 IS DISTINCT FROM a.binding_sha256)) THEN
  RAISE EXCEPTION 'financial_reset_scoped_report_binding_invalid' USING ERRCODE='42501';
 END IF;
 RETURN v_actor;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_scoped_report_command(p_operation uuid,p_command text,
 p_organization uuid,p_property uuid,p_owner uuid,p_currency public.currency_code,p_start date,p_end date,p_key text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; o app_private.financial_reset_operations%ROWTYPE; v_scope jsonb;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_phase(p_operation,'reports');
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 IF p_command IS NULL OR p_command NOT IN ('queue','allocate','period','ledger','readiness')
  OR p_organization IS DISTINCT FROM o.organization_id OR p_property IS NULL OR p_currency IS DISTINCT FROM 'USD'::public.currency_code
  OR p_start IS DISTINCT FROM DATE '2026-10-01'
  OR p_end IS DISTINCT FROM (CASE WHEN p_command IN ('queue','allocate') THEN DATE '2026-10-31' ELSE DATE '2026-10-01' END)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_operation)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=p_organization
   AND generation=o.target_generation AND status='open') THEN
  RAISE EXCEPTION 'financial_reset_scoped_report_command_scope_invalid' USING ERRCODE='42501';
 END IF;
 SELECT s INTO v_scope FROM app_private.financial_reset_zero_plans z CROSS JOIN LATERAL jsonb_array_elements(z.plan_json->'scopes') s
  WHERE z.operation_id=p_operation AND s->>'property_id'=p_property::text AND s->>'currency'=p_currency::text
   AND s->>'property_archived_at' IS NULL AND (p_command IN ('queue','allocate') OR s->>'owner_person_id'=p_owner::text)
  ORDER BY s::text LIMIT 1;
 IF v_scope IS NULL OR NOT EXISTS(SELECT 1 FROM public.properties WHERE organization_id=p_organization AND id=p_property AND archived_at IS NULL)
  OR (p_command IN ('queue','allocate') AND p_owner IS NOT NULL)
  OR (p_command NOT IN ('queue','allocate') AND p_owner IS NULL)
  OR (p_command='period' AND p_key IS DISTINCT FROM 'reset-report:'||p_operation::text||':period:'||app_private.financial_reset_hash(v_scope))
  OR (p_command<>'period' AND p_key IS NOT NULL) THEN
  RAISE EXCEPTION 'financial_reset_scoped_report_command_scope_invalid' USING ERRCODE='42501';
 END IF;
 RETURN v_actor;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_scoped_allocation(p_operation uuid,p_organization uuid,
 p_source_type text,p_source_line uuid,p_key text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; f public.management_fee_occurrences%ROWTYPE; p app_private.financial_reset_continuation_plans%ROWTYPE;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_phase(p_operation,'reports');
 SELECT * INTO STRICT p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation;
 SELECT * INTO f FROM public.management_fee_occurrences WHERE organization_id=p_organization AND id=p_source_line;
 IF NOT FOUND OR p_source_type IS DISTINCT FROM 'management_fee_occurrence'
  OR p_key IS DISTINCT FROM 'reset-report:'||p_operation::text||':allocate:'||p_source_line::text
  OR f.fee_date<DATE '2026-10-01' OR f.fee_date>DATE '2026-10-31'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.after_images->'public.management_fee_occurrences') x WHERE x=to_jsonb(f)) THEN
  RAISE EXCEPTION 'financial_reset_scoped_allocation_scope_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_financial_reset_scoped_report_command(p_operation,'allocate',p_organization,f.property_id,NULL,f.currency,
  DATE '2026-10-01',DATE '2026-10-31');
 RETURN v_actor;
END;
$$;

-- Every replaced permission predicate below already grants the super_admin
-- branch. The bridge requires that same current role with null branch/person,
-- a current Auth session and live step-up; exact report scope is additional.
-- No custom/legacy role or finance branch capability is borrowed or created.
CREATE FUNCTION app_private.financial_reset_scoped_property_permission(p_operation uuid,p_organization uuid,
 p_property uuid,p_permission public.organization_permission_key) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_phase(p_operation,'reports');
 IF p_permission IS NULL OR p_permission NOT IN ('finance.view','finance.record_payments','finance.close_periods')
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE operation_id=p_operation AND organization_id=p_organization)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z CROSS JOIN LATERAL jsonb_array_elements(z.plan_json->'scopes') s
   WHERE z.operation_id=p_operation AND s->>'property_id'=p_property::text AND s->>'property_archived_at' IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.properties WHERE organization_id=p_organization AND id=p_property AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'financial_reset_scoped_report_permission_scope_invalid' USING ERRCODE='42501';
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_organization AND user_id=v_actor
  AND role='super_admin' AND branch_id IS NULL AND person_id IS NULL);
END;
$$;
CREATE FUNCTION app_private.financial_reset_scoped_read_permission(p_operation uuid,p_organization uuid,p_property uuid) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT app_private.financial_reset_scoped_property_permission(p_operation,p_organization,p_property,'finance.view')
$$;
CREATE FUNCTION app_private.financial_reset_scoped_operate_permission(p_operation uuid,p_organization uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_phase(p_operation,'reports');
 RETURN EXISTS(SELECT 1 FROM app_private.financial_reset_operations o JOIN public.organization_members m ON m.organization_id=o.organization_id
  WHERE o.operation_id=p_operation AND o.organization_id=p_organization AND m.user_id=v_actor AND m.role='super_admin'
   AND m.branch_id IS NULL AND m.person_id IS NULL);
END;
$$;
CREATE FUNCTION app_private.financial_reset_scoped_begin_authority(p_operation uuid,p_organization uuid,
 p_property uuid,p_permission public.organization_permission_key) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF app_private.financial_reset_scoped_property_permission(p_operation,p_organization,p_property,p_permission) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 -- Original begin_finance_property_authority returns NULL for super_admin.
 RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.financial_reset_scoped_rent(p_operation uuid,p_organization uuid,p_lease uuid,
 p_period date,p_issue date,p_reason text,p_actor uuid,p_rule uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; p app_private.financial_reset_continuation_plans%ROWTYPE; v_item jsonb;
BEGIN
 v_actor:=app_private.assert_financial_reset_scoped_phase(p_operation,'continuation');
 SELECT * INTO STRICT p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation;
 SELECT l INTO v_item FROM jsonb_array_elements(p.plan_json->'leases') l WHERE l->>'lease_id'=p_lease::text;
 IF p.status IS DISTINCT FROM 'prepared' OR p.organization_id IS DISTINCT FROM p_organization OR p_actor IS DISTINCT FROM v_actor
  OR p_period IS DISTINCT FROM DATE '2026-10-01' OR p_issue IS DISTINCT FROM DATE '2026-10-01'
  OR p_reason IS DISTINCT FROM 'activation_catch_up' OR v_item IS NULL OR v_item->>'disposition' IS DISTINCT FROM 'bill'
  OR v_item->'continue_month_to_month' IS DISTINCT FROM 'false'::jsonb OR v_item->>'billing_rule_id' IS DISTINCT FROM p_rule::text
  OR NOT EXISTS(SELECT 1 FROM public.leases l JOIN public.lease_terms t ON t.organization_id=l.organization_id AND t.lease_id=l.id
   WHERE l.organization_id=p_organization AND l.id=p_lease AND l.archived_at IS NULL AND l.status IN ('active','notice_given')
    AND t.id::text=v_item->>'term_id' AND t.archived_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=p_organization AND status='open')
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_operation) THEN
  RAISE EXCEPTION 'financial_reset_scoped_rent_scope_invalid' USING ERRCODE='42501';
 END IF;
 RETURN app_private.generate_simple_lease_rent_invoice(p_organization,p_lease,p_period,p_issue,p_reason,v_actor,p_rule);
END;
$$;

-- Runtime definitions are pinned before cloning. Only identity, equivalent
-- super_admin permission predicates and calls within this closed graph change.
-- All original business checks, locks, idempotency and audit writes remain.
DO $clones$
DECLARE r record; m record; d text; a text; b text; v_signature text; v_guard text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.apply_financial_reset_continuation(uuid)','app_private.apply_financial_reset_continuation','financial_reset_scoped_continuation','0e884f2ecb1e8711ca2dc7407e5e9e006aa41d354757a700224d15267611c3b5','continuation'),
  ('app_private.apply_financial_reset_reports(uuid)','app_private.apply_financial_reset_reports','financial_reset_scoped_reports','3711eaaad629debed23cb43ad945cb9f4fd6299f4be7bf758e0b65d294b675b4','reports'),
  ('public.get_owner_event_allocation_queue(uuid,uuid,public.currency_code,date,date)','public.get_owner_event_allocation_queue','financial_reset_scoped_queue','216ec87314f741add9870897947a4906574b6e6aec3d1825190d53fadb5dec70','queue'),
  ('app_private.get_owner_event_allocation_queue_baseline(uuid,uuid,public.currency_code,date,date)','app_private.get_owner_event_allocation_queue_baseline','financial_reset_scoped_queue_baseline','c33425531b4bfe238c8b52336f844729a34ddd18773868cced58dcdb52aeabc9','queue'),
  ('public.allocate_owner_event(uuid,text,uuid,text)','public.allocate_owner_event','financial_reset_scoped_allocate','50faae50d746f139d71e38905bf204843991d3a6c3f0a235ce762a43a01425bf','allocate'),
  ('public.allocate_owner_event_branch106(uuid,text,uuid,text)','public.allocate_owner_event_branch106','financial_reset_scoped_allocate_impl','0e1d5e4a99ba9b5bb746f86cad0c3f9fbb233ceb64eef67640bdefe03d6c7aff','allocate'),
  ('public.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)','public.generate_owner_balance_period','financial_reset_scoped_period','e682ba85fdd689b7863443d8dc54ee93ee99a6e0543b01a3a5c09a839107f48e','period'),
  ('app_private.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)','app_private.generate_owner_balance_period','financial_reset_scoped_period_impl','8ef72c0dcc82efd6ee9aa08c309e86deaddc963caf28ed47fce429fafc9ae2cb','period'),
  ('public.get_owner_balance_ledger(uuid,uuid,uuid,public.currency_code,date,date)','public.get_owner_balance_ledger','financial_reset_scoped_ledger','a8a9aa93eb6f4b58ae20b1f6d8ed6dfebc037a130cf23fe8da99425d0a2bea00','ledger'),
  ('public.get_owner_close_readiness(uuid,uuid,uuid,public.currency_code,date)','public.get_owner_close_readiness','financial_reset_scoped_readiness','1e3eeaadba7a2f0b7d56873237d0d2a5d674b5f229d3fb887c289ed6a091bede','readiness'),
  ('app_private.build_owner_close_readiness(uuid,uuid,uuid,public.currency_code,date)','app_private.build_owner_close_readiness','financial_reset_scoped_build_readiness','fd9f368a369681b0cebfb7e93f91cedadbb3803561e7d6b8ce54f2728cd95cc7','readiness'),
  ('app_private.build_owner_close_readiness_before_rent_completeness(uuid,uuid,uuid,public.currency_code,date)','app_private.build_owner_close_readiness_before_rent_completeness','financial_reset_scoped_build_before_rent','c5ff9af641a15f0d38326e949e5a5c4094f06a5035028739b7ad4d57dfdce5e8','readiness'),
  ('app_private.build_owner_close_readiness_with_period_20260812(uuid,uuid,uuid,public.currency_code,date)','app_private.build_owner_close_readiness_with_period_20260812','financial_reset_scoped_build_with_period','2775fc48781b15ac4af22310e4060c3d735e6770786e1c0c615150bcfe9a1de6','readiness')
 ) q(signature,source_name,target_name,sha256,guard_kind) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  IF encode(extensions.digest(d,'sha256'),'hex') IS DISTINCT FROM r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_scoped_report_predecessor_changed: %',r.signature;
  END IF;
  a:='CREATE OR REPLACE FUNCTION '||r.source_name||'(';
  b:='CREATE OR REPLACE FUNCTION app_private.'||r.target_name||'('||CASE WHEN r.guard_kind IN ('continuation','reports') THEN '' ELSE 'p_operation uuid, ' END;
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_clone_header_changed'; END IF;
  d:=replace(d,a,b);
  d:=replace(d,' STABLE',' VOLATILE');
  d:=replace(d,'auth.uid()','app_private.assert_financial_reset_scoped_operator(p_operation)');
  FOR m IN SELECT * FROM (VALUES
   ('public.get_owner_event_allocation_queue','financial_reset_scoped_queue'),
   ('app_private.get_owner_event_allocation_queue_baseline','financial_reset_scoped_queue_baseline'),
   ('public.allocate_owner_event','financial_reset_scoped_allocate'),
   ('public.allocate_owner_event_branch106','financial_reset_scoped_allocate_impl'),
   ('public.generate_owner_balance_period','financial_reset_scoped_period'),
   ('app_private.generate_owner_balance_period','financial_reset_scoped_period_impl'),
   ('public.get_owner_balance_ledger','financial_reset_scoped_ledger'),
   ('public.get_owner_close_readiness','financial_reset_scoped_readiness'),
   ('app_private.build_owner_close_readiness','financial_reset_scoped_build_readiness'),
   ('app_private.build_owner_close_readiness_before_rent_completeness','financial_reset_scoped_build_before_rent'),
   ('app_private.build_owner_close_readiness_with_period_20260812','financial_reset_scoped_build_with_period'),
   ('app_private.generate_simple_lease_rent_invoice','financial_reset_scoped_rent'),
   ('app_private.can_access_property','financial_reset_scoped_property_permission'),
   ('app_private.can_read_finance_property','financial_reset_scoped_read_permission'),
   ('app_private.can_operate_finance','financial_reset_scoped_operate_permission'),
   ('app_private.begin_finance_property_authority','financial_reset_scoped_begin_authority')
  ) x(source_name,target_name) LOOP
   d:=replace(d,m.source_name||'(','app_private.'||m.target_name||'(p_operation,');
  END LOOP;
  v_guard:=CASE r.guard_kind
   WHEN 'continuation' THEN 'PERFORM app_private.assert_financial_reset_scoped_phase(p_operation,''continuation'');'
   WHEN 'reports' THEN 'PERFORM app_private.assert_financial_reset_scoped_phase(p_operation,''reports'');'
   WHEN 'allocate' THEN 'PERFORM app_private.assert_financial_reset_scoped_allocation(p_operation,p_organization_id,p_source_type,p_source_line_id,p_idempotency_key);'
   WHEN 'queue' THEN 'PERFORM app_private.assert_financial_reset_scoped_report_command(p_operation,''queue'',p_organization_id,p_property_id,NULL,p_currency,p_period_start,p_period_end);'
   WHEN 'period' THEN 'PERFORM app_private.assert_financial_reset_scoped_report_command(p_operation,''period'',p_organization_id,p_property_id,p_owner_person_id,p_currency,p_month_start,p_month_start,p_idempotency_key);'
   WHEN 'ledger' THEN 'PERFORM app_private.assert_financial_reset_scoped_report_command(p_operation,''ledger'',p_organization_id,p_property_id,p_owner_person_id,p_currency,p_period_start,p_period_end);'
   WHEN 'readiness' THEN 'PERFORM app_private.assert_financial_reset_scoped_report_command(p_operation,''readiness'',p_organization_id,p_property_id,p_owner_person_id,p_currency,p_month_start,p_month_start);'
  END;
  IF v_guard IS NULL OR strpos(d,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'financial_reset_scoped_clone_guard_changed'; END IF;
  d:=overlay(d placing E'BEGIN\n '||v_guard||E'\n' from strpos(d,E'BEGIN\n') for length(E'BEGIN\n'));
  IF r.guard_kind='continuation' THEN
   -- The unchanged v3 validator rejects this branch before any write. Remove
   -- its call as a second boundary so this clone never reaches term writers.
   a:=$anchor$v_term_id:=public.continue_lease_month_to_month(v_op.organization_id,v_lease.id,v_term.id,v_rule.id,v_term.rent_amount,v_rule.management_fee_mode,v_rule.management_fee_value,'reset:'||p_operation::text||':'||v_lease.id::text);$anchor$;
   IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_renewal_anchor_changed'; END IF;
   d:=replace(d,a,$replacement$RAISE EXCEPTION 'financial_reset_original_invoice_contract_required' USING ERRCODE='23514';$replacement$);
  ELSIF r.guard_kind='reports' THEN
   a:=$anchor$ INSERT INTO app_private.financial_reset_verification_checkpoints(operation_id,organization_id,checkpoint_kind,generation,$anchor$;
   b:=$replacement$ SELECT v_result||jsonb_build_object('report_review_sha256',binding->>'report_review_sha256',
   'continuation_semantic_sha256',binding->>'continuation_semantic_sha256','authorization_id',authorization_id,
   'actor_id',actor_id) INTO v_result FROM app_private.financial_reset_actor_authorizations
  WHERE operation_id=p_operation AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND action='execute' AND consumed_at IS NOT NULL;
$replacement$||a;
   IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_checkpoint_anchor_changed'; END IF;
   d:=replace(d,a,b);
  END IF;
  EXECUTE d;
  v_signature:='app_private.'||r.target_name||'('||CASE WHEN r.guard_kind IN ('continuation','reports') THEN '' ELSE 'uuid,' END||split_part(r.signature,'(',2);
  EXECUTE 'REVOKE ALL ON FUNCTION '||v_signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
 -- Pin the authorization semantics underlying the deliberately narrower
 -- consumed-super_admin adapters; do not rewrite the shared helper bodies.
 FOR r IN SELECT * FROM (VALUES
  ('app_private.has_org_permission(uuid,public.organization_permission_key)','b74a848e7b11362210ba48325f41c48ab4aea1b0138c79e5605e6f04178d40be'),
  ('app_private.can_access_property(uuid,uuid,public.organization_permission_key)','f4f43ce00c0af9d4e4c0ea5ab9d99d1dd5ae0df69551980f2b0419d32a98804e'),
  ('app_private.is_super_admin(uuid)','488bb5dc8355c43170d3dc96b779dc705ad097405d0390b6cdfaa500a5218089'),
  ('app_private.current_workspace_role(uuid)','64655fe523c72a9fd769b42783b9130c95e4d819c0242447b0e183469261d4ea'),
  ('app_private.can_read_finance_property(uuid,uuid)','68327b0e5bca15ef1e81d0297416165c634f25bf5a4e63e34ea9c4f12d58166e'),
  ('app_private.can_operate_finance(uuid)','8094974b631225bccf6bc48ada5961e6f4ecc32a7aa0446b7170db2a6c3b4c0c'),
  ('app_private.assert_property_permission(uuid,uuid,public.organization_permission_key)','80c537fca54110029ac7aba99c039a68c3b1dd32d55904178571d72e9b89bce1'),
  ('app_private.begin_finance_property_authority(uuid,uuid,public.organization_permission_key)','aad6f75f4fc8d852134ba7375ba040dfe85ea5a9c2c4daa7f17920b1e4f7ad14'),
  ('app_private.owner_close_input_snapshot(uuid,uuid,uuid,public.currency_code,date)','a7737817b5cfa0d5033f56ce1b374b62e1502ba394ce0a01770ef87e66dd35d6')
 ) q(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex') IS DISTINCT FROM r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_scoped_permission_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
END;
$clones$;

-- Preserve the existing private/authenticated execution-date path. A consumed
-- operator authorization always selects the scoped path and can never fall
-- back to request claims, including when its operation or policy is wrong.
DO $dispatch$
DECLARE d text; a text; r record; v_call text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.apply_financial_reset_continuation(uuid)','financial_reset_scoped_continuation'),
  ('app_private.apply_financial_reset_reports(uuid)','financial_reset_scoped_reports')
 ) x(signature,target_name) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  v_call:=E'BEGIN\n IF EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid()\n'
   ||E'  AND transaction_id=pg_current_xact_id_if_assigned() AND consumed_at IS NOT NULL) THEN\n'
   ||'  RETURN app_private.'||r.target_name||E'(p_operation);\n END IF;\n';
  IF strpos(d,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'financial_reset_scoped_dispatch_anchor_changed'; END IF;
  EXECUTE overlay(d placing v_call from strpos(d,E'BEGIN\n') for length(E'BEGIN\n'));
 END LOOP;
 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=$anchor$ INSERT INTO app_private.financial_reset_continuation_plans(operation_id,organization_id,plan_json,review_sha256)$anchor$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_prepare_anchor_changed'; END IF;
 EXECUTE replace(d,a,$replacement$ IF EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id_if_assigned() AND consumed_at IS NOT NULL) THEN
  PERFORM app_private.assert_financial_reset_scoped_operator(p_operation);
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations a WHERE a.operation_id=p_operation
   AND a.backend_pid=pg_backend_pid() AND a.transaction_id=pg_current_xact_id() AND a.consumed_at IS NOT NULL AND a.action='execute'
   AND a.binding->'continuation_semantic'=p_plan-'source_sha256'
   AND a.binding->>'continuation_semantic_sha256'=app_private.financial_reset_hash(p_plan-'source_sha256')) THEN
   RAISE EXCEPTION 'financial_reset_scoped_phase_binding_invalid' USING ERRCODE='42501';
  END IF;
  IF p_plan->'version' IS DISTINCT FROM '3'::jsonb OR p_plan->>'invoice_date_policy' IS DISTINCT FROM 'original-reviewed-october' THEN
   RAISE EXCEPTION 'financial_reset_scoped_original_dates_required' USING ERRCODE='42501';
  END IF;
 END IF;
$replacement$||a);
END;
$dispatch$;

REVOKE ALL ON FUNCTION app_private.assert_financial_reset_scoped_phase(uuid,text),
 app_private.assert_financial_reset_scoped_report_command(uuid,text,uuid,uuid,uuid,public.currency_code,date,date,text),
 app_private.assert_financial_reset_scoped_allocation(uuid,uuid,text,uuid,text),
 app_private.financial_reset_scoped_property_permission(uuid,uuid,uuid,public.organization_permission_key),
 app_private.financial_reset_scoped_read_permission(uuid,uuid,uuid),app_private.financial_reset_scoped_operate_permission(uuid,uuid),
 app_private.financial_reset_scoped_begin_authority(uuid,uuid,uuid,public.organization_permission_key),
 app_private.financial_reset_scoped_rent(uuid,uuid,uuid,date,date,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
