-- Private fixed-command known-zero phase. No organization is enrolled or reset.
-- Reuses ordinary maker/checker commands under an exclusive lifecycle lock;
-- there is no caller SQL, callback, public grant, or rowless guard exemption.
BEGIN;
CREATE TABLE app_private.financial_reset_zero_plans (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 plan_json jsonb NOT NULL CHECK(jsonb_typeof(plan_json)='object'),
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','complete')),
 execution_backend integer,
 execution_xid xid8,
 completed_at timestamptz,
 result_json jsonb,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK((status='prepared' AND execution_backend IS NULL AND execution_xid IS NULL AND completed_at IS NULL AND result_json IS NULL)
  OR (status='complete' AND execution_backend IS NOT NULL AND execution_xid IS NOT NULL AND completed_at IS NOT NULL AND result_json IS NOT NULL))
);
CREATE TABLE app_private.financial_reset_phase_fences (
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 phase text NOT NULL CHECK(phase IN ('known-zero','continuation')),
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 generation integer NOT NULL,
 financial_start_date date NOT NULL,
 PRIMARY KEY(operation_id,phase),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE app_private.financial_reset_zero_approvals (
 operation_id uuid NOT NULL REFERENCES app_private.financial_reset_zero_plans(operation_id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL,
 approval_kind text NOT NULL CHECK(approval_kind IN ('maker','reviewer')),
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,approval_kind),
 UNIQUE(operation_id,approved_by),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT
);
ALTER TABLE app_private.financial_reset_zero_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_phase_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_zero_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_zero_plans,app_private.financial_reset_phase_fences,app_private.financial_reset_zero_approvals FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_zero_approval_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_zero_approvals
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.financial_reset_known_zero_scope(p_operation_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_date date; v_property record; v_owner record; v_result jsonb:='[]';
BEGIN
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id;
 SELECT financial_start_date INTO STRICT v_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 IF NOT isfinite(v_date) OR v_date<>date_trunc('month',v_date::timestamp)::date THEN
   RAISE EXCEPTION 'financial_reset_zero_month_boundary_required' USING ERRCODE='22023';
 END IF;
 -- Archived property authority needs a separate reviewed domain path. Never
 -- silently omit a property or infer that an absent roster is a zero balance.
 IF EXISTS(SELECT 1 FROM public.properties WHERE organization_id=v_op.organization_id AND archived_at IS NOT NULL) THEN
   RAISE EXCEPTION 'financial_reset_zero_archived_property_unsupported' USING ERRCODE='23514';
 END IF;
 FOR v_property IN SELECT id FROM public.properties WHERE organization_id=v_op.organization_id ORDER BY id LOOP
   FOR v_owner IN SELECT * FROM app_private.validate_owner_roster_on_date(v_op.organization_id,v_property.id,v_date) ORDER BY property_owner_id LOOP
     v_result:=v_result||jsonb_build_array(jsonb_build_object('property_id',v_property.id,'property_owner_id',v_owner.property_owner_id,
       'owner_person_id',v_owner.owner_person_id,'ownership_percent',v_owner.ownership_percent,'ownership_roster_hash',v_owner.ownership_roster_hash,'currency','USD'));
   END LOOP;
 END LOOP;
 IF jsonb_array_length(v_result)=0 THEN RAISE EXCEPTION 'financial_reset_zero_scope_empty' USING ERRCODE='23514'; END IF;
 RETURN v_result;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_zero_plan() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=NEW.operation_id;
 IF NEW.organization_id IS DISTINCT FROM v_op.organization_id OR NEW.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(NEW.plan_json) THEN
   RAISE EXCEPTION 'financial_reset_zero_plan_binding_invalid' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.status<>'prepared' THEN RAISE EXCEPTION 'financial_reset_zero_plan_initial_status' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['status','execution_backend','execution_xid','completed_at','result_json']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','execution_backend','execution_xid','completed_at','result_json']) OR OLD.status<>'prepared' OR NEW.status<>'complete'
   OR NEW.execution_backend<>pg_backend_pid() OR NEW.execution_xid<>pg_current_xact_id()
   OR v_op.execution_backend<>NEW.execution_backend OR v_op.execution_xid<>NEW.execution_xid) THEN
   RAISE EXCEPTION 'financial_reset_zero_plan_immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_zero_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_zero_plans
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_zero_plan();
CREATE TRIGGER financial_reset_phase_fence_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_phase_fences
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.prepare_financial_reset_zero_plan(p_operation_id uuid,p_plan jsonb,p_review_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_existing app_private.financial_reset_zero_plans%ROWTYPE; v_date date;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 SELECT financial_start_date INTO STRICT v_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 IF v_op.operation_kind<>'reset' OR p_review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p_plan)
   OR p_plan->>'operation_id' IS DISTINCT FROM p_operation_id::text OR p_plan->>'organization_id' IS DISTINCT FROM v_op.organization_id::text
   OR p_plan->>'manifest_sha256' IS DISTINCT FROM v_op.manifest_sha256 OR p_plan->>'reset_plan_sha256' IS DISTINCT FROM v_op.plan_sha256
   OR p_plan->>'effective_date' IS DISTINCT FROM v_date::text
   OR p_plan->'currencies' IS DISTINCT FROM '["USD"]'::jsonb OR p_plan->'scopes' IS DISTINCT FROM app_private.financial_reset_known_zero_scope(p_operation_id)
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_plan) key) IS DISTINCT FROM
      ARRAY['currencies','effective_date','maker_actor_id','manifest_sha256','operation_id','organization_id','reset_plan_sha256','reviewer_actor_id','scopes']::text[] THEN
   RAISE EXCEPTION 'financial_reset_zero_review_scope_invalid' USING ERRCODE='23514';
 END IF;
 IF (p_plan->>'maker_actor_id')::uuid IS NULL OR (p_plan->>'reviewer_actor_id')::uuid IS NULL
   OR (p_plan->>'maker_actor_id')::uuid=(p_plan->>'reviewer_actor_id')::uuid
   OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=v_op.organization_id AND user_id=(p_plan->>'maker_actor_id')::uuid)
   OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=v_op.organization_id AND user_id=(p_plan->>'reviewer_actor_id')::uuid) THEN
   RAISE EXCEPTION 'financial_reset_zero_independent_actors_required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_existing FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id;
 IF FOUND THEN
   IF v_existing.review_sha256<>p_review_sha256 OR v_existing.plan_json IS DISTINCT FROM p_plan THEN
     RAISE EXCEPTION 'financial_reset_zero_plan_id_reused' USING ERRCODE='23514';
   END IF;
   RETURN;
 END IF;
 IF v_op.status NOT IN ('prepared','sealed') THEN RAISE EXCEPTION 'financial_reset_zero_review_must_precede_actions' USING ERRCODE='55000'; END IF;
 INSERT INTO app_private.financial_reset_zero_plans(operation_id,organization_id,plan_json,review_sha256)
 VALUES(p_operation_id,v_op.organization_id,p_plan,p_review_sha256);
END;
$$;

-- Each real session endorses the complete plan before execution. Merely naming
-- two users in an operator-authored plan cannot stand in for their approval.
CREATE FUNCTION public.approve_financial_reset_zero_plan(p_operation_id uuid,p_review_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_plan app_private.financial_reset_zero_plans%ROWTYPE;
 v_actor uuid:=(SELECT auth.uid()); v_kind text; v_permission public.organization_permission_key; v_scope jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'financial_reset_zero_approval_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 SELECT * INTO v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_op.operation_kind<>'reset' OR v_op.status NOT IN ('prepared','sealed') OR v_plan.status<>'prepared'
  OR p_review_sha256 IS DISTINCT FROM v_plan.review_sha256 THEN
  RAISE EXCEPTION 'financial_reset_zero_approval_plan_invalid' USING ERRCODE='23514';
 END IF;
 IF v_actor=(v_plan.plan_json->>'maker_actor_id')::uuid THEN v_kind:='maker'; v_permission:='finance.submit_expenses';
 ELSIF v_actor=(v_plan.plan_json->>'reviewer_actor_id')::uuid THEN v_kind:='reviewer'; v_permission:='finance.approve_expenses';
 ELSE RAISE EXCEPTION 'financial_reset_zero_approval_forbidden' USING ERRCODE='42501'; END IF;
 FOR v_scope IN SELECT value FROM jsonb_array_elements(v_plan.plan_json->'scopes') LOOP
  IF app_private.can_access_property(v_op.organization_id,(v_scope->>'property_id')::uuid,v_permission) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'financial_reset_zero_approval_forbidden' USING ERRCODE='42501';
  END IF;
 END LOOP;
 INSERT INTO app_private.financial_reset_zero_approvals(operation_id,organization_id,approval_kind,review_sha256,approved_by)
 VALUES(p_operation_id,v_op.organization_id,v_kind,p_review_sha256,v_actor) ON CONFLICT(operation_id,approval_kind) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_financial_reset_zero_plan(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_financial_reset_zero_plan(uuid,text) TO authenticated;

CREATE FUNCTION app_private.assert_financial_reset_phase_frozen() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control app_private.financial_write_controls%ROWTYPE;
BEGIN
 SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=NEW.organization_id;
 IF NOT FOUND OR v_control.status<>'frozen' OR v_control.generation<>NEW.generation OR v_control.financial_start_date<>NEW.financial_start_date THEN
   RAISE EXCEPTION 'financial_reset_phase_must_commit_frozen' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_phase_commit_frozen AFTER INSERT ON app_private.financial_reset_phase_fences
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_phase_frozen();

-- Recheck every later control mutation as well as the original fence INSERT.
-- Otherwise SET CONSTRAINTS IMMEDIATE could consume the sole pending check,
-- followed by an unchecked open UPDATE. Check the final current row so normal
-- deferred private open/refreeze phases remain valid within one transaction.
CREATE FUNCTION app_private.assert_financial_reset_control_phase_frozen() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control app_private.financial_write_controls%ROWTYPE; v_fence record;
BEGIN
 SELECT * INTO STRICT v_control FROM app_private.financial_write_controls WHERE organization_id=NEW.organization_id;
 FOR v_fence IN SELECT generation,financial_start_date FROM app_private.financial_reset_phase_fences
 WHERE organization_id=NEW.organization_id AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() LOOP
  IF v_control.status<>'frozen' OR v_control.generation<>v_fence.generation OR v_control.financial_start_date<>v_fence.financial_start_date THEN
   RAISE EXCEPTION 'financial_reset_phase_must_commit_frozen' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_control_commit_frozen AFTER INSERT OR UPDATE ON app_private.financial_write_controls
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_control_phase_frozen();

CREATE FUNCTION app_private.record_financial_reset_phase_fence(p_operation_id uuid,p_phase text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_date date;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id;
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete' OR v_op.execution_backend<>pg_backend_pid() OR v_op.execution_xid<>pg_current_xact_id() THEN
   RAISE EXCEPTION 'financial_reset_phase_execution_transaction_required' USING ERRCODE='55000';
 END IF;
 SELECT financial_start_date INTO STRICT v_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 INSERT INTO app_private.financial_reset_phase_fences(operation_id,organization_id,phase,backend_pid,transaction_id,generation,financial_start_date)
 VALUES(p_operation_id,v_op.organization_id,p_phase,pg_backend_pid(),pg_current_xact_id(),v_op.target_generation,v_date);
END;
$$;

CREATE FUNCTION app_private.apply_financial_reset_known_zero(p_operation_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_op app_private.financial_reset_operations%ROWTYPE; v_plan app_private.financial_reset_zero_plans%ROWTYPE;
 v_scope jsonb; v_component public.owner_balance_component; v_relation record; v_count bigint; v_expected integer; v_result jsonb;
 v_submit jsonb; v_review jsonb; v_request uuid; v_ids uuid[]:='{}'; v_evidence jsonb; v_effective date; v_reference text; v_key text;
 v_context_names text[]:=ARRAY['request.jwt.claims','request.jwt.claim','request.jwt.claim.sub','request.jwt.claim.role','request.headers',
   'app.finance_branch_authority_token','app.finance_branch_authority_org','app.finance_branch_authority_branch','app.finance_branch_authority_permission','app.owner_opening_request_review_context'];
 v_context_values text[]; v_setting text; v_i integer;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 SELECT * INTO STRICT v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id FOR UPDATE;
 IF v_plan.status='complete' THEN RETURN v_plan.result_json; END IF;
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete' OR v_op.execution_backend<>pg_backend_pid() OR v_op.execution_xid<>pg_current_xact_id()
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
   RAISE EXCEPTION 'financial_reset_zero_same_action_transaction_required' USING ERRCODE='55000';
 END IF;
 IF v_plan.plan_json->'scopes' IS DISTINCT FROM app_private.financial_reset_known_zero_scope(p_operation_id) THEN
   RAISE EXCEPTION 'financial_reset_zero_roster_changed' USING ERRCODE='40001';
 END IF;
 IF (SELECT count(*) FROM app_private.financial_reset_zero_approvals a WHERE a.operation_id=p_operation_id
    AND a.organization_id=v_op.organization_id AND a.review_sha256=v_plan.review_sha256
    AND a.approved_by=(v_plan.plan_json->>(a.approval_kind||'_actor_id'))::uuid)<>2 THEN
   RAISE EXCEPTION 'financial_reset_zero_independent_approval_required' USING ERRCODE='42501';
 END IF;
 v_effective:=(v_plan.plan_json->>'effective_date')::date;
 IF v_effective IS DISTINCT FROM (SELECT financial_start_date FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id) THEN
   RAISE EXCEPTION 'financial_reset_zero_cutoff_changed' USING ERRCODE='40001';
 END IF;
 FOR v_relation IN SELECT relation_name FROM app_private.financial_reset_relation_rules WHERE archive_remove ORDER BY relation_name LOOP
   EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id=$1',split_part(v_relation.relation_name,'.',1),split_part(v_relation.relation_name,'.',2)) INTO v_count USING v_op.organization_id;
   IF v_count<>0 THEN RAISE EXCEPTION 'financial_reset_zero_financial_history_remaining: %',v_relation.relation_name USING ERRCODE='23514'; END IF;
 END LOOP;
 v_expected:=jsonb_array_length(v_plan.plan_json->'scopes')*4;
 v_reference:='financial-reset:'||p_operation_id::text||':'||v_plan.review_sha256;
 FOREACH v_setting IN ARRAY v_context_names LOOP v_context_values:=array_append(v_context_values,current_setting(v_setting,true)); END LOOP;
 BEGIN
   -- The exclusive lifecycle transaction lock was acquired before all reads.
   -- Other writers cannot pass their shared lock until this transaction commits
   -- frozen; no other session can observe this uncommitted open version.
   UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=v_op.organization_id AND generation=v_op.target_generation AND status='frozen';
   IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_open_transition_failed' USING ERRCODE='55000'; END IF;
   PERFORM set_config('request.headers',jsonb_build_object('x-nestory-financial-generation',v_op.target_generation::text)::text,true);
   FOR v_scope IN SELECT value FROM jsonb_array_elements(v_plan.plan_json->'scopes') LOOP
     FOREACH v_component IN ARRAY enum_range(NULL::public.owner_balance_component) LOOP
       v_key:='reset-zero:'||p_operation_id::text||':'||substr(app_private.financial_reset_hash(jsonb_build_object('scope',v_scope,'component',v_component)),1,40);
       -- Use only identity/role claims, never borrowed session/step-up assurance.
       PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_plan.plan_json->>'maker_actor_id','role','authenticated')::text,true);
       PERFORM set_config('request.jwt.claim',current_setting('request.jwt.claims'),true);
       PERFORM set_config('request.jwt.claim.sub',v_plan.plan_json->>'maker_actor_id',true);
       PERFORM set_config('request.jwt.claim.role','authenticated',true);
       v_submit:=public.submit_owner_opening_balance(v_op.organization_id,(v_scope->>'property_id')::uuid,(v_scope->>'owner_person_id')::uuid,
         'USD'::public.currency_code,v_effective,v_component,0::numeric,'Reviewed reset known-zero opening',v_reference,NULL,v_plan.review_sha256,NULL,v_key||':submit');
       v_request:=(v_submit->>'request_id')::uuid;
       IF v_request IS NULL THEN RAISE EXCEPTION 'financial_reset_zero_submit_result_invalid' USING ERRCODE='23514'; END IF;
       PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_plan.plan_json->>'reviewer_actor_id','role','authenticated')::text,true);
       PERFORM set_config('request.jwt.claim',current_setting('request.jwt.claims'),true);
       PERFORM set_config('request.jwt.claim.sub',v_plan.plan_json->>'reviewer_actor_id',true);
       v_review:=public.review_owner_opening_balance(v_op.organization_id,v_request,'approve','Reviewed reset known-zero opening',v_key||':review');
       v_ids:=array_append(v_ids,v_request);
     END LOOP;
   END LOOP;
   UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=v_op.organization_id AND generation=v_op.target_generation
     AND financial_start_date=v_effective AND status='open';
   IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_refreeze_failed' USING ERRCODE='55000'; END IF;
   IF v_plan.plan_json->'scopes' IS DISTINCT FROM app_private.financial_reset_known_zero_scope(p_operation_id) THEN
     RAISE EXCEPTION 'financial_reset_zero_roster_changed' USING ERRCODE='40001';
   END IF;
   -- Reconcile every authority row and the full removal set. Missing rows are
   -- never interpreted as zero; normal approval conservation remains enabled.
   FOR v_relation IN SELECT relation_name FROM app_private.financial_reset_relation_rules WHERE archive_remove ORDER BY relation_name LOOP
     EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id=$1',split_part(v_relation.relation_name,'.',1),split_part(v_relation.relation_name,'.',2)) INTO v_count USING v_op.organization_id;
     IF v_count<>(CASE WHEN v_relation.relation_name IN ('public.owner_opening_balance_requests','public.owner_opening_balance_entries') THEN v_expected ELSE 0 END) THEN
       RAISE EXCEPTION 'financial_reset_zero_unexpected_financial_write_set: %',v_relation.relation_name USING ERRCODE='23514';
     END IF;
   END LOOP;
   IF cardinality(v_ids)<>v_expected OR (SELECT count(DISTINCT id) FROM unnest(v_ids) id)<>v_expected
     OR EXISTS(SELECT 1 FROM public.owner_opening_balance_requests r WHERE r.organization_id=v_op.organization_id AND
       (NOT r.id=ANY(v_ids) OR r.request_kind<>'initial' OR r.proposed_amount<>0 OR r.status<>'approved' OR r.effective_date<>v_effective
        OR r.currency<>'USD' OR r.source_reference<>v_reference OR r.evidence_sha256<>v_plan.review_sha256 OR r.supporting_document_id IS NOT NULL
        OR r.submitted_by<>(v_plan.plan_json->>'maker_actor_id')::uuid OR r.reviewed_by<>(v_plan.plan_json->>'reviewer_actor_id')::uuid))
     OR EXISTS(SELECT 1 FROM public.owner_opening_balance_entries e WHERE e.organization_id=v_op.organization_id AND
       (NOT e.request_id=ANY(v_ids) OR e.entry_kind<>'opening' OR e.signed_amount<>0 OR e.effective_date<>v_effective OR e.currency<>'USD'
        OR e.created_by<>(v_plan.plan_json->>'reviewer_actor_id')::uuid))
     OR (SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id=v_op.organization_id
         AND idempotency_key LIKE 'reset-zero:'||p_operation_id::text||':%' AND status='completed' AND financial_generation=v_op.target_generation)<>2*v_expected THEN
     RAISE EXCEPTION 'financial_reset_zero_authority_postcondition_failed' USING ERRCODE='23514';
   END IF;
   SELECT jsonb_agg(row_evidence ORDER BY relation_name,primary_key::text) INTO v_evidence FROM (
     SELECT 'public.owner_opening_balance_requests' AS relation_name,jsonb_build_object('id',r.id) AS primary_key,
       jsonb_build_object('relation_name','public.owner_opening_balance_requests','primary_key',jsonb_build_object('id',r.id),'row_json',to_jsonb(r),'row_sha256',app_private.financial_reset_hash(to_jsonb(r))) AS row_evidence
     FROM public.owner_opening_balance_requests r WHERE r.organization_id=v_op.organization_id
     UNION ALL SELECT 'public.owner_opening_balance_entries',jsonb_build_object('id',e.id),
       jsonb_build_object('relation_name','public.owner_opening_balance_entries','primary_key',jsonb_build_object('id',e.id),'row_json',to_jsonb(e),'row_sha256',app_private.financial_reset_hash(to_jsonb(e)))
     FROM public.owner_opening_balance_entries e WHERE e.organization_id=v_op.organization_id
   ) evidence;
   v_result:=jsonb_build_object('operation_id',p_operation_id,'generation',v_op.target_generation,'status','known_zero_complete','review_sha256',v_plan.review_sha256,
     'scope_count',jsonb_array_length(v_plan.plan_json->'scopes'),'component_count',v_expected,'request_ids',to_jsonb(v_ids),'authority_rows',v_evidence,
     'authority_sha256',app_private.financial_reset_hash(v_evidence),'financial_control_status','frozen','recovery_verified',false);
   UPDATE app_private.financial_reset_zero_plans SET status='complete',execution_backend=pg_backend_pid(),execution_xid=pg_current_xact_id(),completed_at=clock_timestamp(),result_json=v_result WHERE operation_id=p_operation_id;
   PERFORM app_private.record_financial_reset_phase_fence(p_operation_id,'known-zero');
   FOR v_i IN 1..cardinality(v_context_names) LOOP PERFORM set_config(v_context_names[v_i],coalesce(v_context_values[v_i],''),true); END LOOP;
 EXCEPTION WHEN OTHERS THEN
   -- PL/pgSQL rolls back the complete inner block, including its open control,
   -- normal command writes and settings, before entering this handler.
   FOR v_i IN 1..cardinality(v_context_names) LOOP PERFORM set_config(v_context_names[v_i],coalesce(v_context_values[v_i],''),true); END LOOP;
   RAISE;
 END;
 RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app_private.financial_reset_known_zero_scope(uuid),app_private.guard_financial_reset_zero_plan(),
 app_private.prepare_financial_reset_zero_plan(uuid,jsonb,text),app_private.assert_financial_reset_phase_frozen(),
 app_private.record_financial_reset_phase_fence(uuid,text),app_private.apply_financial_reset_known_zero(uuid),
 app_private.assert_financial_reset_control_phase_frozen() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
