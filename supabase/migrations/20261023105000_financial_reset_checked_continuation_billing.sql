-- Private, fixed-command phase. Other backends never observe an open control:
-- its exclusive lifecycle lock is held until the transaction commits frozen.
BEGIN;
DO $predecessors$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public.continue_lease_month_to_month(uuid,uuid,uuid,uuid,numeric,text,numeric,text)','fccdfbc4f25013911ea2cb59b4f5b71bebed73ef183641b6c293efdd64478c08'),
 ('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)','753322d4f40d7cb8f222016b2341c83eacf9dc543f79fe74658d61c60451e2b2')
 ) p(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')<>r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_continuation_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
END;
$predecessors$;
CREATE TABLE app_private.financial_reset_continuation_plans (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 plan_json jsonb NOT NULL,
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','complete')),
 completed_at timestamptz,
 result_json jsonb,
 before_images jsonb,
 after_images jsonb,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id),
 CHECK((status='prepared' AND completed_at IS NULL AND result_json IS NULL AND before_images IS NULL AND after_images IS NULL)
 OR (status='complete' AND completed_at IS NOT NULL AND result_json IS NOT NULL AND before_images IS NOT NULL AND after_images IS NOT NULL))
);
ALTER TABLE app_private.financial_reset_continuation_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_continuation_plans FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.guard_financial_reset_continuation_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'prepared' OR NEW.status<>'complete'
 OR (to_jsonb(NEW)-ARRAY['status','completed_at','result_json','before_images','after_images'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at','result_json','before_images','after_images']) THEN
  RAISE EXCEPTION 'financial_reset_continuation_plan_immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_continuation_plan_immutable BEFORE UPDATE OR DELETE
ON app_private.financial_reset_continuation_plans FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_continuation_plan();

-- A full persisted organization write-set snapshot, including tables unknown to
-- this migration. New tables fail closed in the later closed-set comparison.
-- Control/revision bookkeeping and immutable maintenance journals are separate.
CREATE FUNCTION app_private.financial_reset_continuation_snapshot(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; v_rows jsonb; v_result jsonb:='{}';
BEGIN
 FOR r IN SELECT c.oid,n.nspname,c.relname,
  CASE WHEN n.nspname='public' AND c.relname='organizations' THEN 'id' ELSE 'organization_id' END AS scope
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app_private')
 AND NOT (n.nspname='app_private' AND (c.relname LIKE 'financial_reset_%' OR c.relname IN ('financial_write_controls','financial_report_source_revisions')))
 AND ((n.nspname='public' AND c.relname='organizations') OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped))
 ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM %I.%I t WHERE %I=$1',r.nspname,r.relname,r.scope) INTO v_rows USING p_org;
  v_result:=v_result||jsonb_build_object(r.nspname||'.'||r.relname,v_rows);
 END LOOP;
 RETURN v_result;
END;
$$;

CREATE FUNCTION app_private.prepare_financial_reset_continuation(p_operation uuid,p_plan jsonb,p_review_sha256 text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_item jsonb;
 v_period date; v_issue date; v_business_date date; v_cutoff date;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete'
 OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=p_operation AND z.organization_id=v_op.organization_id AND z.status='complete') THEN
  RAISE EXCEPTION 'financial_reset_known_zero_required' USING ERRCODE='55000';
 END IF;
 IF p_plan IS NULL OR jsonb_typeof(p_plan)<>'object' OR app_private.financial_reset_hash(p_plan) IS DISTINCT FROM p_review_sha256
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_plan) k) IS DISTINCT FROM
 ARRAY['actor_id','billing_period_start','issue_date','leases','source_sha256','version']::text[]
 OR EXISTS(SELECT 1 FROM jsonb_each(p_plan) WHERE value='null'::jsonb)
 OR p_plan->>'version'<>'1' OR p_plan->>'source_sha256' !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_plan->'leases')<>'array' OR jsonb_array_length(p_plan->'leases')=0
 OR (p_plan->>'actor_id')::uuid IS NULL THEN
  RAISE EXCEPTION 'financial_reset_continuation_plan_invalid' USING ERRCODE='23514';
 END IF;
 v_period:=(p_plan->>'billing_period_start')::date; v_issue:=(p_plan->>'issue_date')::date;
 v_business_date:=app_private.rent_business_date(v_op.organization_id,statement_timestamp());
 SELECT financial_start_date INTO STRICT v_cutoff FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 -- The unchanged continuation trigger catches up the current business month.
 -- Reject a delayed historical restart before recording or executing the phase.
 IF v_period IS DISTINCT FROM v_cutoff OR v_period IS DISTINCT FROM date_trunc('month',v_business_date)::date THEN
  RAISE EXCEPTION 'financial_reset_continuation_current_cutoff_month_required' USING ERRCODE='23514';
 END IF;
 IF v_issue IS DISTINCT FROM v_business_date THEN
  RAISE EXCEPTION 'financial_reset_continuation_business_date_changed' USING ERRCODE='40001';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_plan->'leases') LOOP
  IF jsonb_typeof(v_item)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_item) k) IS DISTINCT FROM
   ARRAY['billing_rule_id','collection_route','continue_month_to_month','currency','due_date','lease_id','management_fee_amount','recipient_person_id','rent_amount','term_id']::text[]
   OR EXISTS(SELECT 1 FROM jsonb_each(v_item) WHERE value='null'::jsonb)
   OR (v_item->>'lease_id')::uuid IS NULL OR (v_item->>'term_id')::uuid IS NULL OR (v_item->>'billing_rule_id')::uuid IS NULL
   OR (v_item->>'recipient_person_id')::uuid IS NULL OR jsonb_typeof(v_item->'continue_month_to_month')<>'boolean'
   OR v_item->>'currency'<>'USD' OR v_item->>'collection_route' NOT IN ('through_ips','direct_to_owner')
   OR (v_item->>'rent_amount')::numeric<0 OR (v_item->>'management_fee_amount')::numeric<0
   OR (v_item->>'rent_amount')::numeric IS NULL OR (v_item->>'management_fee_amount')::numeric IS NULL
   OR NOT isfinite((v_item->>'due_date')::date)
   OR ((v_item->>'continue_month_to_month')::boolean AND (v_item->>'rent_amount')::numeric=0) THEN
   RAISE EXCEPTION 'financial_reset_continuation_lease_invalid' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'lease_id') FROM jsonb_array_elements(p_plan->'leases'))<>jsonb_array_length(p_plan->'leases') THEN
  RAISE EXCEPTION 'financial_reset_continuation_duplicate_lease' USING ERRCODE='23514';
 END IF;
 INSERT INTO app_private.financial_reset_continuation_plans(operation_id,organization_id,plan_json,review_sha256)
 VALUES(p_operation,v_op.organization_id,p_plan,p_review_sha256);
END;
$$;

CREATE FUNCTION app_private.apply_financial_reset_continuation(p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_op app_private.financial_reset_operations%ROWTYPE;
 v_plan app_private.financial_reset_continuation_plans%ROWTYPE;
 v_control app_private.financial_write_controls%ROWTYPE;
 v_before jsonb; v_after jsonb; v_item jsonb; v_row jsonb; v_old jsonb; v_table text;
 v_actor uuid; v_period date; v_issue date; v_lease public.leases%ROWTYPE;
 v_term public.lease_terms%ROWTYPE; v_rule public.lease_billing_terms%ROWTYPE;
 v_new_rule public.lease_billing_terms%ROWTYPE; v_new_term public.lease_terms%ROWTYPE;
 v_invoice public.tenant_invoices%ROWTYPE; v_term_id uuid; v_rule_id uuid; v_invoice_id uuid;
 v_results jsonb:='[]'; v_result jsonb; v_expected numeric; v_fee numeric;
 v_headers text:=current_setting('request.headers',true);
 v_rent_context text:=current_setting('app.rent_generation_context',true);
 v_segment_context text:=current_setting('app.rent_segment_repair_context',true);
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 SELECT * INTO STRICT v_plan FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation FOR UPDATE;
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete'
 OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=p_operation AND z.organization_id=v_op.organization_id AND z.status='complete')
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_known_zero_required' USING ERRCODE='55000';
 END IF;
 v_actor:=(v_plan.plan_json->>'actor_id')::uuid;
 -- No identity impersonation: the private operator must supply the reviewed
 -- actor's existing request context. The checked commands retain all permissions.
 IF auth.uid() IS DISTINCT FROM v_actor OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=v_op.organization_id AND user_id=v_actor AND role='super_admin') THEN
  RAISE EXCEPTION 'financial_reset_continuation_actor_required' USING ERRCODE='42501';
 END IF;
 IF v_plan.status='complete' THEN RETURN v_plan.result_json; END IF;
 IF v_op.execution_backend IS DISTINCT FROM pg_backend_pid() OR v_op.execution_xid IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'financial_reset_continuation_same_action_transaction_required' USING ERRCODE='55000';
 END IF;
 v_period:=(v_plan.plan_json->>'billing_period_start')::date; v_issue:=(v_plan.plan_json->>'issue_date')::date;
 IF app_private.rent_business_date(v_op.organization_id,statement_timestamp()) IS DISTINCT FROM v_issue THEN
  RAISE EXCEPTION 'financial_reset_continuation_business_date_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO STRICT v_control FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 IF v_control.financial_start_date IS DISTINCT FROM v_period
 OR v_period IS DISTINCT FROM date_trunc('month',v_issue)::date THEN
  RAISE EXCEPTION 'financial_reset_continuation_current_cutoff_month_required' USING ERRCODE='23514';
 END IF;
 IF (SELECT coalesce(jsonb_agg(id::text ORDER BY id::text),'[]') FROM public.leases WHERE organization_id=v_op.organization_id AND archived_at IS NULL AND status IN ('active','notice_given'))
 IS DISTINCT FROM (SELECT jsonb_agg(value->>'lease_id' ORDER BY value->>'lease_id') FROM jsonb_array_elements(v_plan.plan_json->'leases')) THEN
  RAISE EXCEPTION 'financial_reset_continuation_roster_mismatch' USING ERRCODE='23514';
 END IF;
 v_before:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
 IF app_private.financial_reset_hash(v_before) IS DISTINCT FROM v_plan.plan_json->>'source_sha256' THEN
  RAISE EXCEPTION 'financial_reset_continuation_source_changed' USING ERRCODE='40001';
 END IF;
 FOR v_table IN SELECT relation_name FROM app_private.financial_reset_relation_rules WHERE archive_remove LOOP
  IF v_table IN ('public.owner_opening_balance_requests','public.owner_opening_balance_entries') THEN
   IF v_before->v_table IS DISTINCT FROM (SELECT coalesce(jsonb_agg(e->'row_json' ORDER BY (e->'row_json')::text),'[]')
     FROM app_private.financial_reset_zero_plans z CROSS JOIN LATERAL jsonb_array_elements(z.result_json->'authority_rows') e
     WHERE z.operation_id=p_operation AND e->>'relation_name'=v_table) THEN
    RAISE EXCEPTION 'financial_reset_continuation_zero_evidence_changed' USING ERRCODE='40001';
   END IF;
  ELSIF v_before->v_table IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'financial_reset_continuation_empty_billing_required' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=v_op.organization_id)
 OR EXISTS(SELECT 1 FROM public.finance_income_items WHERE organization_id=v_op.organization_id)
 OR EXISTS(SELECT 1 FROM public.management_fee_occurrences WHERE organization_id=v_op.organization_id)
 OR EXISTS(SELECT 1 FROM public.owner_invoices WHERE organization_id=v_op.organization_id)
 OR EXISTS(SELECT 1 FROM public.rent_generation_exceptions WHERE organization_id=v_op.organization_id) THEN
  RAISE EXCEPTION 'financial_reset_continuation_empty_billing_required' USING ERRCODE='23514';
 END IF;
 -- The exclusive lifecycle lock was acquired before every source read. This
 -- status is visible only to this transaction; no normal backend can use it.
 BEGIN
  UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=v_op.organization_id;
  PERFORM set_config('request.headers',(coalesce(nullif(v_headers,''),'{}')::jsonb||jsonb_build_object('x-nestory-financial-generation',v_op.target_generation::text))::text,true);
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_plan.plan_json->'leases') ORDER BY value->>'lease_id' LOOP
   SELECT * INTO STRICT v_lease FROM public.leases WHERE organization_id=v_op.organization_id AND id=(v_item->>'lease_id')::uuid FOR UPDATE;
   SELECT * INTO STRICT v_term FROM public.lease_terms WHERE organization_id=v_op.organization_id AND lease_id=v_lease.id AND id=(v_item->>'term_id')::uuid AND archived_at IS NULL;
   SELECT * INTO STRICT v_rule FROM public.lease_billing_terms WHERE organization_id=v_op.organization_id AND lease_id=v_lease.id AND id=(v_item->>'billing_rule_id')::uuid AND archived_at IS NULL;
   IF v_term.rent_currency::text<>v_item->>'currency' OR v_term.authority_kind<>'authoritative' OR v_term.payment_frequency<>'monthly'
   OR v_rule.property_id IS DISTINCT FROM v_lease.property_id OR v_rule.superseded_at IS NOT NULL
   OR v_rule.billing_recipient_person_id IS DISTINCT FROM (v_item->>'recipient_person_id')::uuid
   OR v_rule.collection_route IS DISTINCT FROM v_item->>'collection_route' OR v_rule.rule_source<>'lease_default_v1'
   OR (NOT (v_item->>'continue_month_to_month')::boolean AND (v_term.status NOT IN ('active','upcoming') OR v_term.start_date>(v_period+interval '1 month - 1 day')::date OR v_term.end_date<v_period OR v_rule.effective_from>greatest(v_period,v_term.start_date) OR v_rule.effective_to<greatest(v_period,v_term.start_date))) THEN
    RAISE EXCEPTION 'financial_reset_continuation_authority_mismatch' USING ERRCODE='23514';
   END IF;
   v_term_id:=v_term.id; v_rule_id:=v_rule.id;
   IF (v_item->>'continue_month_to_month')::boolean THEN
    v_term_id:=public.continue_lease_month_to_month(v_op.organization_id,v_lease.id,v_term.id,v_rule.id,v_term.rent_amount,v_rule.management_fee_mode,v_rule.management_fee_value,'reset:'||p_operation::text||':'||v_lease.id::text);
    SELECT * INTO STRICT v_new_term FROM public.lease_terms WHERE id=v_term_id AND organization_id=v_op.organization_id;
    SELECT * INTO STRICT v_new_rule FROM public.lease_billing_terms WHERE organization_id=v_op.organization_id AND lease_id=v_lease.id AND effective_from=v_term.end_date+1 AND effective_to='infinity'::date AND archived_at IS NULL;
    v_rule_id:=v_new_rule.id;
    IF v_new_term.lease_id<>v_lease.id OR v_new_term.start_date<>v_term.end_date+1 OR v_new_term.end_date<>'infinity'::date
    OR v_new_term.rent_amount<>v_term.rent_amount OR v_new_term.rent_currency<>v_term.rent_currency
    OR v_new_term.rent_due_day<>v_term.rent_due_day OR v_new_term.payment_frequency<>'monthly' OR v_new_term.authority_kind<>'authoritative' OR v_new_term.status<>'active'
    OR (to_jsonb(v_new_rule)-ARRAY['id','effective_from','effective_to','effective_range','first_period_prorated_amount','final_period_prorated_amount','supersedes_billing_term_id','superseded_at','superseded_by','created_at','updated_at','created_by','updated_by','confirmed_at','confirmed_by'])
    IS DISTINCT FROM (to_jsonb(v_rule)-ARRAY['id','effective_from','effective_to','effective_range','first_period_prorated_amount','final_period_prorated_amount','supersedes_billing_term_id','superseded_at','superseded_by','created_at','updated_at','created_by','updated_by','confirmed_at','confirmed_by']) THEN
     RAISE EXCEPTION 'financial_reset_continuation_rule_copy_mismatch' USING ERRCODE='23514';
    END IF;
   END IF;
   v_expected:=(v_item->>'rent_amount')::numeric; v_fee:=(v_item->>'management_fee_amount')::numeric;
   v_invoice_id:=NULL;
   IF v_expected>0 THEN
    v_invoice_id:=app_private.generate_simple_lease_rent_invoice(v_op.organization_id,v_lease.id,v_period,v_issue,'activation_catch_up',v_actor,v_rule_id);
    SELECT * INTO STRICT v_invoice FROM public.tenant_invoices WHERE organization_id=v_op.organization_id AND id=v_invoice_id;
    IF ROW(v_invoice.lease_id,v_invoice.lease_term_id,v_invoice.billing_term_id,v_invoice.billing_period_start,v_invoice.billing_period_end,v_invoice.issue_date,v_invoice.due_date,v_invoice.lifecycle,v_invoice.total_amount,v_invoice.management_fee_amount,v_invoice.currency::text,v_invoice.recipient_person_id,v_invoice.collection_route,v_invoice.generation_source)
    IS DISTINCT FROM ROW(v_lease.id,v_term_id,v_rule_id,v_period,(v_period+interval '1 month - 1 day')::date,v_issue,(v_item->>'due_date')::date,'issued'::text,v_expected,v_fee,v_item->>'currency',(v_item->>'recipient_person_id')::uuid,v_item->>'collection_route','lease_rules_v1'::text) THEN
     RAISE EXCEPTION 'financial_reset_continuation_invoice_mismatch' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM public.tenant_invoice_lines WHERE organization_id=v_op.organization_id AND invoice_id=v_invoice_id AND line_type='rent' AND amount=v_expected AND reversal_of_id IS NULL)<>1
    OR (SELECT coalesce(sum(amount),0) FROM public.tenant_invoice_rent_segments WHERE organization_id=v_op.organization_id AND invoice_id=v_invoice_id)<>v_expected
    OR EXISTS(SELECT 1 FROM public.tenant_invoice_lines l LEFT JOIN public.finance_income_items i ON i.organization_id=l.organization_id AND i.id=l.income_item_id
      WHERE l.organization_id=v_op.organization_id AND l.invoice_id=v_invoice_id AND (i.id IS NULL OR i.lease_id<>v_lease.id OR i.amount_due<>v_expected OR i.amount_received<>0 OR i.status<>'open' OR i.payer_person_id<>v_invoice.recipient_person_id OR i.currency<>v_invoice.currency OR i.rent_billing_period_start<>v_period))
    OR (SELECT coalesce(sum(amount),0) FROM public.management_fee_occurrences WHERE organization_id=v_op.organization_id AND tenant_invoice_id=v_invoice_id)<>v_fee THEN
     RAISE EXCEPTION 'financial_reset_continuation_billing_lineage_mismatch' USING ERRCODE='23514';
    END IF;
   ELSIF v_term.rent_amount<>0 OR v_fee<>0 OR EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=v_op.organization_id AND lease_id=v_lease.id) THEN
    RAISE EXCEPTION 'financial_reset_continuation_zero_rent_mismatch' USING ERRCODE='23514';
   END IF;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('lease_id',v_lease.id,'term_id',v_term_id,'billing_rule_id',v_rule_id,'invoice_id',v_invoice_id));
  END LOOP;
  IF (SELECT count(*) FROM public.tenant_invoices WHERE organization_id=v_op.organization_id)<>(SELECT count(*) FROM jsonb_array_elements(v_plan.plan_json->'leases') WHERE (value->>'rent_amount')::numeric>0)
  OR (SELECT count(*) FROM public.finance_income_items WHERE organization_id=v_op.organization_id)<>(SELECT count(*) FROM jsonb_array_elements(v_plan.plan_json->'leases') WHERE (value->>'rent_amount')::numeric>0)
  OR (SELECT count(*) FROM public.management_fee_occurrences WHERE organization_id=v_op.organization_id)<>(SELECT count(*) FROM jsonb_array_elements(v_plan.plan_json->'leases') WHERE (value->>'management_fee_amount')::numeric>0)
  OR (SELECT count(*) FROM public.owner_invoice_lines WHERE organization_id=v_op.organization_id)<>(SELECT count(*) FROM jsonb_array_elements(v_plan.plan_json->'leases') WHERE (value->>'management_fee_amount')::numeric>0)
  OR EXISTS(SELECT 1 FROM public.rent_generation_exceptions e WHERE e.organization_id=v_op.organization_id AND (e.resolved_at IS NULL OR e.billing_period_start<>v_period OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) r WHERE (r->>'lease_id')::uuid=e.lease_id AND (r->>'invoice_id')::uuid=e.resolved_invoice_id))) THEN
   RAISE EXCEPTION 'financial_reset_continuation_billing_incomplete' USING ERRCODE='23514';
  END IF;
  v_after:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
  -- Reject any persisted mutation outside this closed set, including changes to
  -- historical idempotency, cash, openings, deposits, master data or other leases.
  FOR v_table IN SELECT key FROM jsonb_object_keys(v_before||v_after) key LOOP
   IF v_before->v_table IS NOT DISTINCT FROM v_after->v_table THEN CONTINUE; END IF;
   IF v_table NOT IN ('public.lease_terms','public.lease_billing_terms','public.finance_income_items','public.tenant_invoices','public.tenant_invoice_lines','public.tenant_invoice_rent_segments','public.management_fee_occurrences','public.owner_invoices','public.owner_invoice_lines','public.activity_logs','public.rent_generation_exceptions','app_private.financial_idempotency_requests') THEN
    RAISE EXCEPTION 'financial_reset_continuation_unplanned_relation: %',v_table USING ERRCODE='23514';
   END IF;
   FOR v_old IN SELECT value FROM jsonb_array_elements(v_before->v_table) LOOP
    SELECT value INTO v_row FROM jsonb_array_elements(v_after->v_table) WHERE value->'id'=v_old->'id';
    IF v_row IS NOT DISTINCT FROM v_old THEN CONTINUE; END IF;
    IF v_table<>'public.lease_terms' OR v_row IS NULL OR v_old->>'status'<>'active' OR v_row->>'status'<>'expired'
    OR (v_row-ARRAY['status','updated_at','updated_by']) IS DISTINCT FROM (v_old-ARRAY['status','updated_at','updated_by'])
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan.plan_json->'leases') p WHERE (p->>'continue_month_to_month')::boolean AND p->'term_id'=v_old->'id') THEN
     RAISE EXCEPTION 'financial_reset_continuation_historical_row_changed: %',v_table USING ERRCODE='23514';
    END IF;
   END LOOP;
   FOR v_row IN SELECT a.value FROM jsonb_array_elements(v_after->v_table) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_before->v_table) b WHERE a.value->'id'=b.value->'id') LOOP
    IF v_table IN ('public.lease_terms','public.lease_billing_terms') THEN
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) r JOIN jsonb_array_elements(v_plan.plan_json->'leases') p ON p->'lease_id'=r->'lease_id'
       WHERE (p->>'continue_month_to_month')::boolean AND v_row->'id'=r->(CASE WHEN v_table='public.lease_terms' THEN 'term_id' ELSE 'billing_rule_id' END)) THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_contract' USING ERRCODE='23514';
     END IF;
    ELSIF v_table='app_private.financial_idempotency_requests' THEN
     IF v_row->>'operation' NOT IN ('continue_lease_month_to_month','create_authoritative_lease_term') OR v_row->>'status'<>'completed'
      OR (v_row->>'financial_generation')::integer<>v_op.target_generation OR (v_row->>'actor_id')::uuid<>v_actor
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan.plan_json->'leases') p WHERE (p->>'continue_month_to_month')::boolean
        AND v_row->>'idempotency_key'='reset:'||p_operation::text||':'||(p->>'lease_id')||CASE WHEN v_row->>'operation'='create_authoritative_lease_term' THEN ':term' ELSE '' END) THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_intent' USING ERRCODE='23514';
     END IF;
    ELSIF v_table='public.activity_logs' THEN
     IF v_row->>'action' NOT IN ('lease_month_to_month_continued','authoritative_lease_term_created','lease_rent_generated')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) r WHERE v_row->'entity_id' IN (r->'term_id',r->'invoice_id')) THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_audit' USING ERRCODE='23514';
     END IF;
    ELSIF v_table IN ('public.finance_income_items','public.tenant_invoices','public.tenant_invoice_rent_segments','public.management_fee_occurrences','public.rent_generation_exceptions') THEN
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) r WHERE r->'lease_id'=v_row->'lease_id') THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_lease_authority' USING ERRCODE='23514';
     END IF;
    ELSIF v_table='public.tenant_invoice_lines' THEN
     IF v_row->>'line_type'<>'rent' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_results) r WHERE r->'invoice_id'=v_row->'invoice_id') THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_tenant_line' USING ERRCODE='23514';
     END IF;
    ELSIF v_table='public.owner_invoice_lines' THEN
     IF v_row->>'source_type'<>'management_fee' OR NOT EXISTS(SELECT 1 FROM public.management_fee_occurrences f WHERE f.organization_id=v_op.organization_id AND f.id=(v_row->>'source_id')::uuid AND f.amount=(v_row->>'amount')::numeric) THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_owner_line' USING ERRCODE='23514';
     END IF;
    ELSIF v_table='public.owner_invoices' THEN
     IF v_row->>'lifecycle'<>'issued' OR (v_row->>'billing_period_start')::date<>v_period
     OR NOT EXISTS(SELECT 1 FROM public.owner_invoice_lines l WHERE l.organization_id=v_op.organization_id AND l.invoice_id=(v_row->>'id')::uuid) THEN
      RAISE EXCEPTION 'financial_reset_continuation_extra_owner_invoice' USING ERRCODE='23514';
     END IF;
    END IF;
   END LOOP;
  END LOOP;
  UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=v_op.organization_id;
  PERFORM app_private.assert_financial_reset_frozen(p_operation);
  IF (SELECT financial_start_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id)<>v_control.financial_start_date THEN
   RAISE EXCEPTION 'financial_reset_continuation_control_changed' USING ERRCODE='23514';
  END IF;
  PERFORM app_private.record_financial_reset_phase_fence(p_operation,'continuation');
  v_result:=jsonb_build_object('leases',v_results,'generation',v_op.target_generation,'before_sha256',app_private.financial_reset_hash(v_before),'after_sha256',app_private.financial_reset_hash(v_after));
  UPDATE app_private.financial_reset_continuation_plans SET status='complete',completed_at=clock_timestamp(),result_json=v_result,before_images=v_before,after_images=v_after WHERE operation_id=p_operation;
  PERFORM set_config('request.headers',coalesce(v_headers,''),true);
  PERFORM set_config('app.rent_generation_context',coalesce(v_rent_context,''),true);
  PERFORM set_config('app.rent_segment_repair_context',coalesce(v_segment_context,''),true);
 EXCEPTION WHEN OTHERS THEN
  -- This entire subtransaction, including control and all nested commands,
  -- rolls back. Original request settings are restored by the same rollback.
  RAISE;
 END;
 RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_financial_reset_continuation_plan(),
 app_private.financial_reset_continuation_snapshot(uuid),
 app_private.prepare_financial_reset_continuation(uuid,jsonb,text),
 app_private.apply_financial_reset_continuation(uuid)
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
