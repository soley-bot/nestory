-- Inactive private reset review extensions. No customer is enrolled or changed.
-- Deferred contracts remain byte-identical; missing rent stays a visible blocker.
BEGIN;

CREATE FUNCTION app_private.financial_reset_deferred_lease_source(p_org uuid,p_lease uuid,p_period date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.leases%ROWTYPE; t public.lease_terms%ROWTYPE; b public.lease_billing_terms%ROWTYPE;
BEGIN
 SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=p_lease;
 IF NOT FOUND OR l.archived_at IS NOT NULL OR l.status NOT IN ('active','notice_given')
 OR p_period IS NULL OR NOT isfinite(p_period) OR p_period<>date_trunc('month',p_period)::date
 OR NOT EXISTS(SELECT 1 FROM public.properties WHERE organization_id=p_org AND id=l.property_id AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.units WHERE organization_id=p_org AND property_id=l.property_id AND id=l.unit_id AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_scope_invalid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO t FROM public.lease_terms WHERE organization_id=p_org AND lease_id=p_lease AND archived_at IS NULL
  AND status<>'superseded' ORDER BY start_date DESC,term_sequence DESC,id DESC LIMIT 1;
 IF NOT FOUND OR t.authority_kind<>'authoritative' OR t.status NOT IN ('active','expired') OR t.rent_currency<>'USD'
 OR t.payment_frequency<>'monthly' OR NOT isfinite(t.end_date) OR t.end_date>=p_period
 OR EXISTS(SELECT 1 FROM public.lease_terms x WHERE x.organization_id=p_org AND x.lease_id=p_lease AND x.archived_at IS NULL
   AND x.status<>'superseded' AND (x.authority_kind<>'authoritative' OR x.status NOT IN ('active','expired')
    OR NOT isfinite(x.end_date) OR x.end_date>=p_period)) THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_term_not_expired' USING ERRCODE='23514';
 END IF;
 SELECT * INTO b FROM public.lease_billing_terms WHERE organization_id=p_org AND lease_id=p_lease
  AND archived_at IS NULL AND superseded_at IS NULL ORDER BY effective_from DESC,id DESC LIMIT 1;
 IF NOT FOUND OR b.property_id<>l.property_id OR b.rule_source<>'lease_default_v1'
 OR NOT isfinite(b.effective_to) OR b.effective_to>=p_period
 OR EXISTS(SELECT 1 FROM public.lease_billing_terms x WHERE x.organization_id=p_org AND x.lease_id=p_lease
   AND x.archived_at IS NULL AND x.superseded_at IS NULL AND (NOT isfinite(x.effective_to) OR x.effective_to>=p_period)) THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_rule_not_expired' USING ERRCODE='23514';
 END IF;
 RETURN jsonb_build_object('lease',to_jsonb(l),'selected_term_id',t.id,'selected_billing_rule_id',b.id,
  'terms',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lease_terms x WHERE x.organization_id=p_org AND x.lease_id=p_lease),
  'billing_rules',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lease_billing_terms x WHERE x.organization_id=p_org AND x.lease_id=p_lease));
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_deferred_lease(p_org uuid,p_period date,p_item jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF p_item IS NULL OR jsonb_typeof(p_item)<>'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_item) k) IS DISTINCT FROM
  ARRAY['billing_rule_id','disposition','lease_id','reason','source_sha256','term_id']::text[]
 OR EXISTS(SELECT 1 FROM jsonb_each(p_item) WHERE value='null'::jsonb)
 OR p_item->>'disposition' IS DISTINCT FROM 'defer-expired-unbilled' OR p_item->>'reason' IS DISTINCT FROM 'renewal-unconfirmed'
 OR p_item->>'source_sha256' !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_review_invalid' USING ERRCODE='23514';
 END IF;
 s:=app_private.financial_reset_deferred_lease_source(p_org,(p_item->>'lease_id')::uuid,p_period);
 IF p_item->'term_id' IS DISTINCT FROM s->'selected_term_id' OR p_item->'billing_rule_id' IS DISTINCT FROM s->'selected_billing_rule_id'
 OR p_item->>'source_sha256' IS DISTINCT FROM app_private.financial_reset_hash(s) THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_source_changed' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=p_org AND lease_id=(p_item->>'lease_id')::uuid)
 OR EXISTS(SELECT 1 FROM public.finance_income_items WHERE organization_id=p_org AND lease_id=(p_item->>'lease_id')::uuid)
 OR EXISTS(SELECT 1 FROM public.management_fee_occurrences WHERE organization_id=p_org AND lease_id=(p_item->>'lease_id')::uuid)
 OR EXISTS(SELECT 1 FROM public.rent_generation_exceptions WHERE organization_id=p_org AND lease_id=(p_item->>'lease_id')::uuid) THEN
  RAISE EXCEPTION 'financial_reset_deferred_lease_must_remain_unbilled' USING ERRCODE='23514';
 END IF;
 RETURN s;
END;
$$;

-- Keep public close readiness unchanged. Only this exact private reviewed
-- checkpoint may retain a named missing-invoice blocker, without calling it ready.
CREATE FUNCTION app_private.financial_reset_report_deferred_blocker(p_operation uuid,p_property uuid,p_currency public.currency_code,p_blocker jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.financial_reset_continuation_plans%ROWTYPE; i jsonb; s jsonb;
BEGIN
 IF p_currency<>'USD' OR p_blocker->>'code' IS DISTINCT FROM 'monthly_rent_invoice_missing'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_blocker) k) IS DISTINCT FROM ARRAY['code','lease_id','property_id','unit_id']::text[] THEN RETURN false; END IF;
 SELECT * INTO p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation AND status='complete';
 IF NOT FOUND OR p.plan_json->>'version'<>'2' THEN RETURN false; END IF;
 SELECT value INTO i FROM jsonb_array_elements(p.plan_json->'leases') WHERE value->>'disposition'='defer-expired-unbilled' AND value->'lease_id'=p_blocker->'lease_id';
 IF NOT FOUND THEN RETURN false; END IF;
 s:=app_private.assert_financial_reset_deferred_lease(p.organization_id,(p.plan_json->>'billing_period_start')::date,i);
 RETURN p_blocker->>'property_id'=p_property::text AND p_blocker->'property_id'=s->'lease'->'property_id'
  AND p_blocker->'unit_id'=s->'lease'->'unit_id';
END;
$$;

DO $extend$
DECLARE d text; a text; r text;
BEGIN
 d:=pg_get_functiondef('app_private.financial_reset_normalized_image(oid,jsonb,jsonb,timestamptz,uuid)'::regprocedure);
 a:=E'\n IF v_rule.relation_name=''public.notification_outbox'' AND';
 r:=E'\n'||$patch$ IF v_rule.relation_name='public.lease_deposits' THEN
   -- Historical/pending headers can be explicitly archived and kept unchanged.
   -- They may never be rewritten as a new pending obligation by normalization.
   IF p_before IS NOT DISTINCT FROM p_after THEN RETURN p_before->>'status' IN ('pending','returned','forfeited','waived'); END IF;
   IF p_before->>'status' NOT IN ('received','held','partially_returned') OR p_before->'archived_at' IS DISTINCT FROM 'null'::jsonb
    OR NOT EXISTS(SELECT 1 FROM public.leases l WHERE l.organization_id=(p_before->>'organization_id')::uuid
      AND l.id=(p_before->>'lease_id')::uuid AND l.archived_at IS NULL AND l.status IN ('active','notice_given')) THEN RETURN false; END IF;
 END IF;
$patch$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deposit_normalization_anchor_changed'; END IF;
 EXECUTE replace(d,a,r);

 d:=pg_get_functiondef('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)'::regprocedure);
 a:=' OR p_plan->>''version''<>''1'' OR'; r:=' OR p_plan->>''version'' NOT IN (''1'',''2'') OR';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_version_anchor_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$ FOR v_item IN SELECT value FROM jsonb_array_elements(p_plan->'leases') LOOP
$patch$;
 r:=a||$patch$  IF p_plan->>'version'='2' THEN
   IF v_item->>'disposition'='defer-expired-unbilled' THEN
    PERFORM app_private.assert_financial_reset_deferred_lease(v_op.organization_id,v_period,v_item);
    CONTINUE;
   END IF;
   IF v_item->>'disposition' IS DISTINCT FROM (CASE WHEN v_item->>'continue_month_to_month'='true' THEN 'continue-month-to-month' ELSE 'bill' END) THEN
    RAISE EXCEPTION 'financial_reset_continuation_disposition_invalid' USING ERRCODE='23514';
   END IF;
   v_item:=v_item-'disposition';
  END IF;
$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_prepare_loop_changed'; END IF;
 d:=replace(d,a,r);
 a:=' INSERT INTO app_private.financial_reset_continuation_plans(operation_id,organization_id,plan_json,review_sha256)';
 r:=$patch$ IF (SELECT coalesce(jsonb_agg(id::text ORDER BY id::text),'[]') FROM public.leases WHERE organization_id=v_op.organization_id AND archived_at IS NULL AND status IN ('active','notice_given'))
 IS DISTINCT FROM (SELECT jsonb_agg(value->>'lease_id' ORDER BY value->>'lease_id') FROM jsonb_array_elements(p_plan->'leases')) THEN
  RAISE EXCEPTION 'financial_reset_continuation_roster_mismatch' USING ERRCODE='23514';
 END IF;
$patch$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_prepare_roster_changed'; END IF;
 EXECUTE replace(d,a,r);

 d:=pg_get_functiondef('app_private.apply_financial_reset_continuation(uuid)'::regprocedure);
 a:=$patch$  FOR v_item IN SELECT value FROM jsonb_array_elements(v_plan.plan_json->'leases') ORDER BY value->>'lease_id' LOOP
$patch$;
 r:=a||$patch$   IF v_item->>'disposition'='defer-expired-unbilled' THEN
    IF v_plan.plan_json->>'version'<>'2' THEN RAISE EXCEPTION 'financial_reset_deferred_lease_review_invalid' USING ERRCODE='23514'; END IF;
    PERFORM app_private.assert_financial_reset_deferred_lease(v_op.organization_id,v_period,v_item);
    v_results:=v_results||jsonb_build_array(v_item||jsonb_build_object('invoice_id',NULL,'generated_rent_amount',0,'generated_fee_amount',0,'contract_changed',false));
    CONTINUE;
   END IF;
$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_apply_loop_changed'; END IF;
 d:=replace(d,a,r);
 a:='  v_after:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);';
 r:=$patch$  FOR v_item IN SELECT value FROM jsonb_array_elements(v_plan.plan_json->'leases') WHERE value->>'disposition'='defer-expired-unbilled' LOOP
   PERFORM app_private.assert_financial_reset_deferred_lease(v_op.organization_id,v_period,v_item);
  END LOOP;
$patch$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_apply_after_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$  v_result:=jsonb_build_object('leases',v_results,'generation',v_op.target_generation,'before_sha256',app_private.financial_reset_hash(v_before),'after_sha256',app_private.financial_reset_hash(v_after));$patch$;
 r:=$patch$  v_result:=jsonb_build_object('leases',v_results,'generation',v_op.target_generation,'before_sha256',app_private.financial_reset_hash(v_before),'after_sha256',app_private.financial_reset_hash(v_after),
   'deferred_lease_count',(SELECT count(*) FROM jsonb_array_elements(v_results) x WHERE x->>'disposition'='defer-expired-unbilled'),
   'billing_complete',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) x WHERE x->>'disposition'='defer-expired-unbilled'));$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_result_changed'; END IF;
 EXECUTE replace(d,a,r);

 d:=pg_get_functiondef('app_private.apply_financial_reset_reports(uuid)'::regprocedure);
 a:=$patch$SELECT 1 FROM jsonb_array_elements(v_readiness->'blockers') b WHERE b->>'code' IS DISTINCT FROM 'financial_month_not_locked'$patch$;
 r:=a||$patch$ AND NOT app_private.financial_reset_report_deferred_blocker(p_operation,(v_scope->>'property_id')::uuid,(v_scope->>'currency')::public.currency_code,b)$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_report_readiness_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$jsonb_build_object('scope',v_scope,'status','ready','period',v_generated,$patch$;
 r:=$patch$jsonb_build_object('scope',v_scope,'status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(v_readiness->'blockers') b WHERE b->>'code'='monthly_rent_invoice_missing') THEN 'blocked-deferred-lease' ELSE 'ready' END,'period',v_generated,$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_report_status_changed'; END IF;
 d:=replace(d,a,r);
 a:=$patch$'reports_persisted',true,'control_reopened',false,$patch$;
 r:=$patch$'reports_persisted',true,'billing_complete',coalesce((v_phase.result_json->>'billing_complete')::boolean,true),
   'deferred_lease_count',coalesce((v_phase.result_json->>'deferred_lease_count')::integer,0),'close_ready',false,'control_reopened',false,$patch$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_deferred_report_result_changed'; END IF;
 EXECUTE replace(d,a,r);
END;
$extend$;

REVOKE ALL ON FUNCTION app_private.financial_reset_deferred_lease_source(uuid,uuid,date),
 app_private.assert_financial_reset_deferred_lease(uuid,date,jsonb),
 app_private.financial_reset_report_deferred_blocker(uuid,uuid,public.currency_code,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
