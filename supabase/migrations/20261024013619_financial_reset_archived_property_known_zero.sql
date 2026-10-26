-- Archived properties remain archived. Only an endorsed reset's exact zero
-- submit/review pair can use their cutoff roster; ordinary commands stay closed.
BEGIN;
DO $pins$
DECLARE r record; d text; a text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.validate_owner_roster_on_date(uuid,uuid,date)','8bfd29981202a0ea0e822e732c6f84f0b89227a2794c17793a0d4e8ee14469c1'),
  ('app_private.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)','cff82db9e3ed87a1147f5ecdb39c2903b21a85df569f2af11ad7591f2e7f75b2'),
  ('app_private.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text)','eefffd6074b0a99410ecaa2e5351539186945c06d788c0436675f51e660fe2b5'),
  ('app_private.financial_reset_known_zero_scope(uuid)','4021ace273cfed8caf9319ea85bf0328671df16e1e639bfbcb50a9f6c8fc97a2'),
  ('app_private.apply_financial_reset_known_zero(uuid)','8b2a16c3261aeb9c250a45c2786943c9932c19f110a25cf83d69f7fc090d6162'),
  ('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)','db01239120ac2db428eefbe177cd8572550e6e26d13e4807409ec405011173f4')
 ) p(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')<>r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_archived_zero_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
 -- Read-only preparation reader: copy the pinned roster algorithm, changing
 -- only the property archive predicate. Owner activity/share/date checks stay.
 d:=replace(pg_get_functiondef('app_private.validate_owner_roster_on_date(uuid,uuid,date)'::regprocedure),E'\r\n',E'\n');
 a:=E'\n      AND p.archived_at IS NULL';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_archived_roster_anchor_changed'; END IF;
 d:=replace(d,'FUNCTION app_private.validate_owner_roster_on_date(','FUNCTION app_private.financial_reset_zero_roster_on_date(');
 EXECUTE replace(d,a,'');
END;
$pins$;
REVOKE ALL ON FUNCTION app_private.financial_reset_zero_roster_on_date(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.financial_reset_zero_scope_on_date(p_organization_id uuid,p_effective_date date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_property record; v_owner record; v_result jsonb:='[]';
BEGIN
 IF p_effective_date IS NULL OR NOT isfinite(p_effective_date)
  OR p_effective_date<>date_trunc('month',p_effective_date::timestamp)::date THEN
  RAISE EXCEPTION 'financial_reset_zero_month_boundary_required' USING ERRCODE='22023';
 END IF;
 FOR v_property IN SELECT p.id,to_jsonb(p) AS row_json FROM public.properties p WHERE p.organization_id=p_organization_id ORDER BY p.id LOOP
  FOR v_owner IN SELECT * FROM app_private.financial_reset_zero_roster_on_date(p_organization_id,v_property.id,p_effective_date) ORDER BY property_owner_id LOOP
   v_result:=v_result||jsonb_build_array(jsonb_build_object('property_id',v_property.id,'property_owner_id',v_owner.property_owner_id,
    'owner_person_id',v_owner.owner_person_id,'ownership_percent',v_owner.ownership_percent,'ownership_roster_hash',v_owner.ownership_roster_hash,
    'currency','USD','property_row_sha256',app_private.financial_reset_hash(v_property.row_json),'property_archived_at',v_property.row_json->'archived_at'));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(v_result)=0 THEN RAISE EXCEPTION 'financial_reset_zero_scope_empty' USING ERRCODE='23514'; END IF;
 RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION app_private.financial_reset_known_zero_scope(p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_date date;
BEGIN
 SELECT organization_id INTO STRICT v_org FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id;
 SELECT financial_start_date INTO STRICT v_date FROM app_private.financial_write_controls WHERE organization_id=v_org;
 RETURN app_private.financial_reset_zero_scope_on_date(v_org,v_date);
END;
$$;

CREATE TABLE app_private.financial_reset_archived_zero_command_context (
 backend_pid integer PRIMARY KEY,
 transaction_id xid8 NOT NULL,
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 generation integer NOT NULL,
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 scope jsonb NOT NULL CHECK(jsonb_typeof(scope)='object'),
 component public.owner_balance_component NOT NULL,
 command text NOT NULL CHECK(command IN ('submit','review')),
 request_id uuid,
 command_checked boolean NOT NULL DEFAULT false,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK((command='submit' AND request_id IS NULL) OR (command='review' AND request_id IS NOT NULL))
);
ALTER TABLE app_private.financial_reset_archived_zero_command_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_archived_zero_command_context FROM PUBLIC,anon,authenticated,service_role;

-- VOLATILE deliberately: see context/ordinary-command writes from earlier SPI
-- statements inside this same phase. A STABLE snapshot must not grant authority.
CREATE FUNCTION app_private.assert_financial_reset_archived_zero_context(p_context app_private.financial_reset_archived_zero_command_context) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_plan app_private.financial_reset_zero_plans%ROWTYPE;
 v_control app_private.financial_write_controls%ROWTYPE; v_property jsonb; v_owner record; v_request public.owner_opening_balance_requests%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 IF p_context.backend_pid IS DISTINCT FROM pg_backend_pid() OR p_context.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_transaction_invalid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_context.operation_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||v_op.organization_id::text,0));
 SELECT * INTO v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=v_op.operation_id;
 SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id;
 IF v_op.operation_kind IS DISTINCT FROM 'reset' OR v_op.status IS DISTINCT FROM 'actions_complete'
  OR v_op.execution_backend IS DISTINCT FROM pg_backend_pid() OR v_op.execution_xid IS DISTINCT FROM pg_current_xact_id()
  OR v_op.database_name IS DISTINCT FROM current_database() OR v_op.database_oid IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname=current_database())
  OR p_context.organization_id IS DISTINCT FROM v_op.organization_id OR p_context.generation IS DISTINCT FROM v_op.target_generation
  OR v_control.status IS DISTINCT FROM 'open' OR v_control.generation IS DISTINCT FROM v_op.target_generation
  OR v_plan.status IS DISTINCT FROM 'prepared' OR p_context.review_sha256 IS DISTINCT FROM v_plan.review_sha256
  OR v_plan.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(v_plan.plan_json)
  OR v_plan.plan_json->>'effective_date' IS DISTINCT FROM v_control.financial_start_date::text
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan.plan_json->'scopes') s WHERE s.value=p_context.scope)
  OR p_context.scope->>'property_archived_at' IS NULL
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_binding_invalid' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM app_private.financial_reset_zero_approvals a WHERE a.operation_id=v_op.operation_id
  AND a.organization_id=v_op.organization_id AND a.review_sha256=v_plan.review_sha256
  AND a.approved_by=(v_plan.plan_json->>(a.approval_kind||'_actor_id'))::uuid)<>2 THEN
  RAISE EXCEPTION 'financial_reset_zero_independent_approval_required' USING ERRCODE='42501';
 END IF;
 IF (SELECT auth.uid()) IS DISTINCT FROM (v_plan.plan_json->>(CASE p_context.command WHEN 'submit' THEN 'maker_actor_id' ELSE 'reviewer_actor_id' END))::uuid THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_actor_invalid' USING ERRCODE='42501';
 END IF;
 SELECT to_jsonb(p) INTO v_property FROM public.properties p WHERE p.organization_id=v_op.organization_id AND p.id=(p_context.scope->>'property_id')::uuid;
 IF v_property IS NULL OR v_property->>'archived_at' IS NULL
  OR v_property->'archived_at' IS DISTINCT FROM p_context.scope->'property_archived_at'
  OR app_private.financial_reset_hash(v_property) IS DISTINCT FROM p_context.scope->>'property_row_sha256' THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_property_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_owner FROM app_private.financial_reset_zero_roster_on_date(v_op.organization_id,(p_context.scope->>'property_id')::uuid,v_control.financial_start_date)
 WHERE owner_person_id=(p_context.scope->>'owner_person_id')::uuid;
 IF NOT FOUND OR v_owner.property_owner_id::text IS DISTINCT FROM p_context.scope->>'property_owner_id'
  OR v_owner.ownership_percent IS DISTINCT FROM (p_context.scope->>'ownership_percent')::numeric
  OR v_owner.ownership_roster_hash IS DISTINCT FROM p_context.scope->>'ownership_roster_hash' OR p_context.scope->>'currency' IS DISTINCT FROM 'USD' THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_roster_changed' USING ERRCODE='40001';
 END IF;
 IF p_context.command='review' THEN
  SELECT * INTO v_request FROM public.owner_opening_balance_requests WHERE id=p_context.request_id AND organization_id=v_op.organization_id;
  IF NOT FOUND OR v_request.property_id::text IS DISTINCT FROM p_context.scope->>'property_id'
   OR v_request.owner_person_id::text IS DISTINCT FROM p_context.scope->>'owner_person_id'
   OR v_request.property_owner_id::text IS DISTINCT FROM p_context.scope->>'property_owner_id'
   OR v_request.ownership_percent_snapshot IS DISTINCT FROM (p_context.scope->>'ownership_percent')::numeric
   OR v_request.ownership_roster_hash IS DISTINCT FROM p_context.scope->>'ownership_roster_hash'
   OR v_request.currency IS DISTINCT FROM 'USD'::public.currency_code OR v_request.effective_date IS DISTINCT FROM v_control.financial_start_date
   OR v_request.component IS DISTINCT FROM p_context.component OR v_request.proposed_amount IS DISTINCT FROM 0::numeric
   OR v_request.request_kind IS DISTINCT FROM 'initial' OR v_request.correction_of_entry_id IS NOT NULL OR v_request.resubmission_of_request_id IS NOT NULL
   OR v_request.reason IS DISTINCT FROM 'Reviewed reset known-zero opening' OR v_request.supporting_document_id IS NOT NULL
   OR v_request.source_reference IS DISTINCT FROM 'financial-reset:'||v_op.operation_id::text||':'||v_plan.review_sha256
   OR v_request.evidence_sha256 IS DISTINCT FROM v_plan.review_sha256
   OR v_request.submitted_by IS DISTINCT FROM (v_plan.plan_json->>'maker_actor_id')::uuid
   OR v_request.status NOT IN ('submitted','approved')
   OR (v_request.status='approved' AND v_request.reviewed_by IS DISTINCT FROM (v_plan.plan_json->>'reviewer_actor_id')::uuid) THEN
   RAISE EXCEPTION 'financial_reset_archived_zero_request_invalid' USING ERRCODE='23514';
  END IF;
 END IF;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_archived_zero_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM app_private.assert_financial_reset_archived_zero_context(OLD);
  IF OLD.command<>'review' OR NOT OLD.command_checked OR NOT EXISTS(
   SELECT 1 FROM public.owner_opening_balance_requests WHERE id=OLD.request_id AND organization_id=OLD.organization_id AND status='approved') THEN
   RAISE EXCEPTION 'financial_reset_archived_zero_context_incomplete' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 PERFORM app_private.assert_financial_reset_archived_zero_context(NEW);
 IF TG_OP='INSERT' AND (NEW.command<>'submit' OR NEW.request_id IS NOT NULL OR NEW.command_checked) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_initial_state' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['command','request_id','command_checked']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['command','request_id','command_checked']) OR NOT (
   (NEW.command=OLD.command AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id AND NOT OLD.command_checked AND NEW.command_checked)
   OR (OLD.command='submit' AND OLD.command_checked AND NEW.command='review' AND NEW.request_id IS NOT NULL AND NOT NEW.command_checked))) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_transition_invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_archived_zero_context_guard BEFORE INSERT OR UPDATE OR DELETE
ON app_private.financial_reset_archived_zero_command_context FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_archived_zero_context();

CREATE FUNCTION app_private.assert_financial_reset_archived_zero_context_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=NEW.backend_pid AND transaction_id=NEW.transaction_id) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_must_close' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_archived_zero_context_closed AFTER INSERT OR UPDATE
ON app_private.financial_reset_archived_zero_command_context DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_archived_zero_context_closed();

CREATE FUNCTION app_private.begin_financial_reset_archived_zero_context(p_operation uuid,p_scope jsonb,p_component public.owner_balance_component) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_already_open' USING ERRCODE='23514';
 END IF;
 IF p_scope->>'property_archived_at' IS NULL THEN RETURN; END IF;
 INSERT INTO app_private.financial_reset_archived_zero_command_context(backend_pid,transaction_id,operation_id,organization_id,generation,review_sha256,scope,component,command)
 SELECT pg_backend_pid(),pg_current_xact_id(),o.operation_id,o.organization_id,o.target_generation,z.review_sha256,p_scope,p_component,'submit'
 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id)
 WHERE o.operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_archived_zero_plan_required' USING ERRCODE='23514'; END IF;
END;
$$;
CREATE FUNCTION app_private.advance_financial_reset_archived_zero_context(p_operation uuid,p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid() AND operation_id<>p_operation) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_binding_invalid' USING ERRCODE='23514';
 END IF;
 UPDATE app_private.financial_reset_archived_zero_command_context SET command='review',request_id=p_request,command_checked=false
 WHERE backend_pid=pg_backend_pid() AND operation_id=p_operation;
END;
$$;
CREATE FUNCTION app_private.finish_financial_reset_archived_zero_context(p_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid() AND operation_id<>p_operation) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_binding_invalid' USING ERRCODE='23514';
 END IF;
 DELETE FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid() AND operation_id=p_operation;
END;
$$;

CREATE FUNCTION app_private.check_financial_reset_archived_zero_command(p_command text,p_arguments jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_reset_archived_zero_command_context%ROWTYPE; v_plan jsonb; v_key text; v_expected jsonb;
BEGIN
 SELECT * INTO c FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid();
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM app_private.assert_financial_reset_archived_zero_context(c);
 IF c.command_checked OR p_command IS DISTINCT FROM c.command THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_command_mismatch' USING ERRCODE='23514';
 END IF;
 SELECT plan_json INTO STRICT v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=c.operation_id;
 v_key:='reset-zero:'||c.operation_id::text||':'||substr(app_private.financial_reset_hash(jsonb_build_object('scope',c.scope,'component',c.component)),1,40);
 IF p_command='submit' THEN
  v_expected:=jsonb_build_object('organization_id',c.organization_id,'property_id',c.scope->'property_id','owner_person_id',c.scope->'owner_person_id',
   'currency','USD','effective_date',v_plan->'effective_date','component',c.component,'amount',0,'reason','Reviewed reset known-zero opening',
   'source_reference','financial-reset:'||c.operation_id::text||':'||c.review_sha256,'supporting_document_id',NULL,'evidence_sha256',c.review_sha256,
   'resubmission_of_request_id',NULL,'idempotency_key',v_key||':submit');
 ELSE
  v_expected:=jsonb_build_object('organization_id',c.organization_id,'request_id',c.request_id,'decision','approve',
   'review_reason','Reviewed reset known-zero opening','idempotency_key',v_key||':review');
 END IF;
 IF p_arguments IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'financial_reset_archived_zero_command_mismatch' USING ERRCODE='23514'; END IF;
 UPDATE app_private.financial_reset_archived_zero_command_context SET command_checked=true WHERE backend_pid=pg_backend_pid();
 RETURN true;
END;
$$;

CREATE FUNCTION app_private.financial_reset_archived_zero_scope_allowed(p_org uuid,p_property uuid,p_date date) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_reset_archived_zero_command_context%ROWTYPE;
BEGIN
 SELECT * INTO c FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid();
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM app_private.assert_financial_reset_archived_zero_context(c);
 IF NOT c.command_checked OR c.organization_id IS DISTINCT FROM p_org OR c.scope->>'property_id' IS DISTINCT FROM p_property::text
  OR p_date IS DISTINCT FROM (SELECT financial_start_date FROM app_private.financial_write_controls WHERE organization_id=c.organization_id) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_command_scope_mismatch' USING ERRCODE='23514';
 END IF;
 RETURN true;
END;
$$;
CREATE FUNCTION app_private.owner_opening_command_roster_on_date(p_organization_id uuid,p_property_id uuid,p_effective_date date)
RETURNS TABLE(property_owner_id uuid,owner_person_id uuid,ownership_percent numeric(6,3),started_on date,ended_on date,ownership_roster_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF app_private.financial_reset_archived_zero_scope_allowed(p_organization_id,p_property_id,p_effective_date) THEN
  RETURN QUERY SELECT * FROM app_private.financial_reset_zero_roster_on_date(p_organization_id,p_property_id,p_effective_date);
 ELSE
  RETURN QUERY SELECT * FROM app_private.validate_owner_roster_on_date(p_organization_id,p_property_id,p_effective_date);
 END IF;
END;
$$;

DO $integrate$
DECLARE d text; a text; b text; r record;
BEGIN
 d:=replace(pg_get_functiondef('app_private.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'::regprocedure),E'\r\n',E'\n');
 b:=$prefix$
  PERFORM app_private.check_financial_reset_archived_zero_command('submit',jsonb_build_object(
   'organization_id',p_organization_id,'property_id',p_property_id,'owner_person_id',p_owner_person_id,'currency',p_currency,
   'effective_date',p_effective_date,'component',p_component,'amount',p_amount,'reason',p_reason,'source_reference',p_source_reference,
   'supporting_document_id',p_supporting_document_id,'evidence_sha256',p_evidence_sha256,
   'resubmission_of_request_id',p_resubmission_of_request_id,'idempotency_key',p_idempotency_key));
$prefix$;
 d:=replace(d,E'\nBEGIN\n',E'\nBEGIN\n'||b);
 a:='AND property.archived_at IS NULL;';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_archived_submit_anchor_changed'; END IF;
 d:=replace(d,a,'AND (property.archived_at IS NULL OR app_private.financial_reset_archived_zero_scope_allowed(p_organization_id,p_property_id,p_effective_date));');
 EXECUTE replace(d,'app_private.validate_owner_roster_on_date(','app_private.owner_opening_command_roster_on_date(');

 d:=replace(pg_get_functiondef('app_private.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text)'::regprocedure),E'\r\n',E'\n');
 b:=$prefix$
  PERFORM app_private.check_financial_reset_archived_zero_command('review',jsonb_build_object(
   'organization_id',p_organization_id,'request_id',p_request_id,'decision',p_decision,'review_reason',p_review_reason,'idempotency_key',p_idempotency_key));
$prefix$;
 d:=replace(d,E'\nBEGIN\n',E'\nBEGIN\n'||b);
 EXECUTE replace(d,'app_private.validate_owner_roster_on_date(','app_private.owner_opening_command_roster_on_date(');

 d:=replace(pg_get_functiondef('app_private.apply_financial_reset_known_zero(uuid)'::regprocedure),E'\r\n',E'\n');
 b:=$prefix$
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_archived_zero_command_context WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_archived_zero_context_already_open' USING ERRCODE='23514';
 END IF;
$prefix$;
 d:=replace(d,E'\nBEGIN\n',E'\nBEGIN\n'||b);
 FOR r IN SELECT * FROM (VALUES
  ('       v_submit:=public.submit_owner_opening_balance(',E'       PERFORM app_private.begin_financial_reset_archived_zero_context(p_operation_id,v_scope,v_component);\n       v_submit:=public.submit_owner_opening_balance('),
  ('       v_review:=public.review_owner_opening_balance(',E'       PERFORM app_private.advance_financial_reset_archived_zero_context(p_operation_id,v_request);\n       v_review:=public.review_owner_opening_balance('),
  ('       v_ids:=array_append(v_ids,v_request);',E'       PERFORM app_private.finish_financial_reset_archived_zero_context(p_operation_id);\n       v_ids:=array_append(v_ids,v_request);')
 ) t(anchor,replacement) LOOP
  IF (length(d)-length(replace(d,r.anchor,'')))/length(r.anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_archived_zero_phase_anchor_changed'; END IF;
  d:=replace(d,r.anchor,r.replacement);
 END LOOP;
 EXECUTE d;

 -- A live unarchived lease on an archived parent is not a supported billing
 -- scope. Reject before plan persistence rather than silently omit invoices.
 d:=replace(pg_get_functiondef('app_private.prepare_financial_reset_continuation(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=' SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation;';
 b:=$guard$
 IF EXISTS(SELECT 1 FROM public.leases l JOIN public.properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
  WHERE l.organization_id=v_op.organization_id AND l.archived_at IS NULL AND l.status IN ('active','notice_given') AND p.archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'financial_reset_archived_property_active_lease_unsupported' USING ERRCODE='23514';
 END IF;
$guard$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_archived_continuation_anchor_changed'; END IF;
 EXECUTE replace(d,a,a||b);
END;
$integrate$;

REVOKE ALL ON FUNCTION app_private.financial_reset_zero_scope_on_date(uuid,date),app_private.financial_reset_known_zero_scope(uuid),
 app_private.assert_financial_reset_archived_zero_context(app_private.financial_reset_archived_zero_command_context),
 app_private.guard_financial_reset_archived_zero_context(),app_private.assert_financial_reset_archived_zero_context_closed(),
 app_private.begin_financial_reset_archived_zero_context(uuid,jsonb,public.owner_balance_component),
 app_private.advance_financial_reset_archived_zero_context(uuid,uuid),app_private.finish_financial_reset_archived_zero_context(uuid),
 app_private.check_financial_reset_archived_zero_command(text,jsonb),app_private.financial_reset_archived_zero_scope_allowed(uuid,uuid,date),
 app_private.owner_opening_command_roster_on_date(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
