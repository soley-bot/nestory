-- Inactive private hosted bookkeeping. Installing this migration reserves no
-- generation, enrolls no organization and grants no application mutation role.
BEGIN;

CREATE TABLE app_private.financial_reset_hosted_reservations (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 binding_sha256 text NOT NULL CHECK(binding_sha256=app_private.financial_reset_hash(binding)),
 foreign_sha256 text NOT NULL CHECK(foreign_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
 UNIQUE(organization_id,operation_id)
);
CREATE TABLE app_private.financial_reset_hosted_checkpoints (
 operation_id uuid PRIMARY KEY REFERENCES app_private.financial_reset_hosted_reservations(operation_id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 authority_sha256 text NOT NULL CHECK(authority_sha256 ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 foreign_sha256 text NOT NULL CHECK(foreign_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id()
);
CREATE TABLE app_private.financial_reset_hosted_recovery_reservations (
 operation_id uuid PRIMARY KEY,
 reset_operation_id uuid NOT NULL REFERENCES app_private.financial_reset_hosted_reservations(operation_id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 binding_sha256 text NOT NULL CHECK(binding_sha256=app_private.financial_reset_hash(binding)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id()
);
ALTER TABLE app_private.financial_reset_hosted_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_hosted_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_hosted_recovery_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_hosted_reservations,app_private.financial_reset_hosted_checkpoints,
 app_private.financial_reset_hosted_recovery_reservations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_hosted_reservation_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_hosted_reservations
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_hosted_checkpoint_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_hosted_checkpoints
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_hosted_recovery_reservation_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_hosted_recovery_reservations
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

-- Hash every scoped foreign row without exporting those rows. Metadata for this
-- target never substitutes for a census of other organizations.
CREATE FUNCTION app_private.financial_reset_hosted_foreign_census(p_organization uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; v_rows jsonb; v_result jsonb:='[]'::jsonb;
BEGIN
 FOR r IN SELECT n.nspname,c.relname,CASE WHEN n.nspname='public' AND c.relname='organizations' THEN 'id' ELSE 'organization_id' END scope
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','app_private') AND c.relkind IN ('r','p') AND
    ((n.nspname='public' AND c.relname='organizations') OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped))
  ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C" LOOP
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb) FROM %I.%I t WHERE %I IS DISTINCT FROM $1',
     r.nspname,r.relname,r.scope) INTO v_rows USING p_organization;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('relation_name',r.nspname||'.'||r.relname,
     'count',jsonb_array_length(v_rows),'sha256',app_private.financial_reset_hash(v_rows)));
 END LOOP;
 RETURN v_result;
END;
$$;

CREATE FUNCTION app_private.reserve_financial_reset_hosted_operation(p_binding jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=(p_binding->>'organization_id')::uuid; v_op uuid:=(p_binding->>'operation_id')::uuid;
 v_source integer:=(p_binding->>'source_generation')::integer; v_target integer:=(p_binding->>'target_generation')::integer;
 v_control app_private.financial_write_controls%ROWTYPE; v_field text;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM app_private.assert_financial_reset_hosted_actor_context(p_binding,'freeze');
 IF jsonb_typeof(p_binding)<>'object' OR p_binding->>'version'<>'1' OR p_binding ? 'recovery' OR
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_binding) k) IS DISTINCT FROM
  (SELECT array_agg(k ORDER BY k) FROM unnest(ARRAY['version','operation_id','project_ref','organization_id','packet_sha256','main_sha','sources_sha256',
   'schema_sha256','ledger_sha256','source_snapshot_sha256','source_generation','target_generation','cutoff','issue_date','timezone',
   'execution_business_date','invoice_date_policy','manifest_sha256','plan_sha256','archive_sha256','action_sha256','archive_artifact_sha256',
   'archive_count','action_count','zero_review_sha256','continuation_semantic_sha256','report_review_sha256','continuation_semantic']) k) OR
  v_source<0 OR v_target<>v_source+1 OR p_binding->>'cutoff'<>'2026-10-01' OR
  p_binding->>'project_ref' !~ '^[a-z0-9]{20}$' OR p_binding->>'main_sha' !~ '^[a-f0-9]{40}$' OR
  p_binding->>'invoice_date_policy' NOT IN ('execution-business-date','original-reviewed-october') OR
  (p_binding->>'archive_count')::integer<1 OR (p_binding->>'action_count')::integer<1 OR
  jsonb_typeof(p_binding->'continuation_semantic')<>'object' OR p_binding->'continuation_semantic' ? 'source_sha256' OR
  app_private.financial_reset_hash(p_binding->'continuation_semantic') IS DISTINCT FROM p_binding->>'continuation_semantic_sha256' THEN
   RAISE EXCEPTION 'financial_reset_hosted_binding_invalid' USING ERRCODE='22023';
 END IF;
 FOREACH v_field IN ARRAY ARRAY['packet_sha256','sources_sha256','schema_sha256','ledger_sha256','source_snapshot_sha256',
  'manifest_sha256','plan_sha256','archive_sha256','action_sha256','archive_artifact_sha256','zero_review_sha256',
  'continuation_semantic_sha256','report_review_sha256'] LOOP
   IF p_binding->>v_field IS NULL OR p_binding->>v_field !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'financial_reset_hosted_digest_invalid' USING ERRCODE='22023';
   END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||v_org::text,0));
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=v_op) OR
  EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=v_org AND status<>'actions_complete') THEN
   RAISE EXCEPTION 'financial_reset_hosted_reservation_exists' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org AND operational_timezone=p_binding->>'timezone') OR
  app_private.rent_business_date(v_org,statement_timestamp())::text IS DISTINCT FROM p_binding->>'execution_business_date' OR
  app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(v_org)) IS DISTINCT FROM p_binding->>'source_snapshot_sha256' THEN
   RAISE EXCEPTION 'financial_reset_hosted_source_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=v_org FOR UPDATE;
 IF coalesce(v_control.generation,0)<>v_source OR (v_source=0 AND v_control.organization_id IS NOT NULL) THEN
   RAISE EXCEPTION 'financial_reset_hosted_generation_changed' USING ERRCODE='40001';
 END IF;
 INSERT INTO app_private.financial_reset_hosted_reservations(operation_id,organization_id,binding,binding_sha256,foreign_sha256)
 VALUES(v_op,v_org,p_binding,app_private.financial_reset_hash(p_binding),
   app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(v_org)));
 IF v_source=0 THEN
  INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
   VALUES(v_org,v_target,'frozen',(p_binding->>'cutoff')::date);
 ELSE
  -- Existing lifecycle guards require freezing before generation advancement.
  UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=v_org;
  UPDATE app_private.financial_write_controls SET generation=v_target,financial_start_date=(p_binding->>'cutoff')::date WHERE organization_id=v_org;
 END IF;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_hosted_reservation(p_binding jsonb,p_action text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=(p_binding->>'organization_id')::uuid; v_base jsonb:=p_binding-'recovery';
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM app_private.assert_financial_reset_hosted_actor_context(p_binding,p_action);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||v_org::text,0));
 IF p_action NOT IN ('checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery') OR
  NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations r
    WHERE r.operation_id=(v_base->>'operation_id')::uuid AND r.organization_id=v_org AND r.binding=v_base
      AND r.binding_sha256=app_private.financial_reset_hash(v_base)
      AND r.foreign_sha256=app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(v_org))) THEN
   RAISE EXCEPTION 'financial_reset_hosted_reservation_mismatch' USING ERRCODE='40001';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls w WHERE w.organization_id=v_org AND w.status='frozen'
   AND w.financial_start_date=(v_base->>'cutoff')::date AND w.generation=CASE WHEN p_action='execute-recovery'
     THEN (p_binding->'recovery'->>'target_generation')::integer ELSE (v_base->>'target_generation')::integer END) THEN
   RAISE EXCEPTION 'financial_reset_hosted_frozen_boundary_changed' USING ERRCODE='40001';
 END IF;
 IF p_action IN ('checkpoint','prepare','seal','execute') AND
  app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(v_org)) IS DISTINCT FROM v_base->>'source_snapshot_sha256' THEN
   RAISE EXCEPTION 'financial_reset_hosted_source_changed' USING ERRCODE='40001';
 END IF;
 IF p_action IN ('prepare','seal','execute','prepare-recovery','execute-recovery') AND NOT EXISTS(
  SELECT 1 FROM app_private.financial_reset_hosted_checkpoints c WHERE c.operation_id=(v_base->>'operation_id')::uuid
    AND c.binding_sha256=app_private.financial_reset_hash(v_base) AND c.source_sha256=v_base->>'source_snapshot_sha256') THEN
   RAISE EXCEPTION 'financial_reset_hosted_durable_checkpoint_required' USING ERRCODE='55000';
 END IF;
END;
$$;

CREATE FUNCTION app_private.checkpoint_financial_reset_hosted_operation(p_binding jsonb,p_authority_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.assert_financial_reset_hosted_reservation(p_binding,'checkpoint');
 IF p_authority_sha256 IS NULL OR p_authority_sha256 !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'financial_reset_hosted_checkpoint_authority_required' USING ERRCODE='22023';
 END IF;
 INSERT INTO app_private.financial_reset_hosted_checkpoints(operation_id,organization_id,binding_sha256,authority_sha256,source_sha256,foreign_sha256)
 SELECT operation_id,organization_id,binding_sha256,p_authority_sha256,p_binding->>'source_snapshot_sha256',foreign_sha256
 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=(p_binding->>'operation_id')::uuid;
END;
$$;

CREATE FUNCTION app_private.reserve_financial_reset_hosted_recovery(p_binding jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_recovery jsonb:=p_binding->'recovery'; v_org uuid:=(p_binding->>'organization_id')::uuid;
BEGIN
 PERFORM app_private.assert_financial_reset_hosted_reservation(p_binding,'prepare-recovery');
 PERFORM app_private.assert_financial_reset_report_recovery_boundary((p_binding->>'operation_id')::uuid);
 IF jsonb_typeof(v_recovery)<>'object' OR (v_recovery->>'source_generation')::integer<>(p_binding->>'target_generation')::integer OR
  (v_recovery->>'target_generation')::integer<>(v_recovery->>'source_generation')::integer+1 OR
  app_private.rent_business_date(v_org,statement_timestamp())::text IS DISTINCT FROM v_recovery->>'execution_business_date' OR
  NOT EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c WHERE c.operation_id=(p_binding->>'operation_id')::uuid
    AND c.checkpoint_kind='checked-reports' AND c.checkpoint_sha256=v_recovery->>'report_checkpoint_sha256'
    AND c.checkpoint_sha256=app_private.financial_reset_hash(c.result_json)) THEN
   RAISE EXCEPTION 'financial_reset_hosted_recovery_binding_invalid' USING ERRCODE='22023';
 END IF;
 INSERT INTO app_private.financial_reset_hosted_recovery_reservations(operation_id,reset_operation_id,organization_id,binding,binding_sha256)
 VALUES((v_recovery->>'operation_id')::uuid,(p_binding->>'operation_id')::uuid,v_org,p_binding,app_private.financial_reset_hash(p_binding));
 UPDATE app_private.financial_write_controls SET generation=(v_recovery->>'target_generation')::integer WHERE organization_id=v_org;
END;
$$;

-- A status read is not a receipt for the transaction that prepared or sealed
-- an operation. Capture the actual private row changes, then require their
-- immutable receipt before the surrounding top-level transaction can commit.
CREATE TABLE app_private.financial_reset_hosted_stage_events (
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('prepare','seal')),
 event_kind text NOT NULL,
 row_key jsonb NOT NULL CHECK(jsonb_typeof(row_key)='object'),
 row_key_sha256 text NOT NULL CHECK(row_key_sha256=app_private.financial_reset_hash(row_key)),
 row_sha256 text NOT NULL CHECK(row_sha256 ~ '^[a-f0-9]{64}$'),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 authorization_id uuid NOT NULL REFERENCES app_private.financial_reset_actor_authorizations(authorization_id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL,
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,action,event_kind,row_key_sha256),
 FOREIGN KEY(organization_id,operation_id) REFERENCES app_private.financial_reset_hosted_reservations(organization_id,operation_id) ON DELETE RESTRICT,
 CHECK((action='prepare' AND event_kind IN ('operation-prepared','archive-insert','action-insert')) OR
       (action='seal' AND event_kind IN ('operation-sealed','zero-plan-insert')))
);
CREATE TABLE app_private.financial_reset_hosted_action_receipts (
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('prepare','seal')),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 binding_sha256 text NOT NULL CHECK(binding_sha256=app_private.financial_reset_hash(binding)),
 authorization_id uuid NOT NULL UNIQUE REFERENCES app_private.financial_reset_actor_authorizations(authorization_id) ON DELETE RESTRICT,
 authority_sha256 text NOT NULL CHECK(authority_sha256 ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL,
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 result_json jsonb NOT NULL CHECK(jsonb_typeof(result_json)='object'),
 result_sha256 text NOT NULL CHECK(result_sha256=app_private.financial_reset_hash(result_json)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,action),
 FOREIGN KEY(organization_id,operation_id) REFERENCES app_private.financial_reset_hosted_reservations(organization_id,operation_id) ON DELETE RESTRICT
);
ALTER TABLE app_private.financial_reset_hosted_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_hosted_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_hosted_stage_events,app_private.financial_reset_hosted_action_receipts
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_hosted_stage_event_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_hosted_stage_events
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_hosted_stage_event_no_truncate BEFORE TRUNCATE ON app_private.financial_reset_hosted_stage_events
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_hosted_action_receipt_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_hosted_action_receipts
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_hosted_action_receipt_no_truncate BEFORE TRUNCATE ON app_private.financial_reset_hosted_action_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.guard_financial_reset_hosted_stage_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_binding jsonb; v_context jsonb;
BEGIN
 SELECT binding INTO STRICT v_binding FROM app_private.financial_reset_hosted_reservations
  WHERE operation_id=NEW.operation_id AND organization_id=NEW.organization_id;
 v_context:=app_private.assert_financial_reset_hosted_actor_context(v_binding,NEW.action);
 IF pg_trigger_depth()<>2 OR NEW.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(v_binding) OR
  NEW.authorization_id IS DISTINCT FROM (v_context->>'authorizationId')::uuid OR NEW.actor_id IS DISTINCT FROM (v_context->>'actorId')::uuid OR
  NEW.backend_pid IS DISTINCT FROM pg_backend_pid() OR NEW.transaction_id IS DISTINCT FROM pg_current_xact_id() OR
  NEW.backend_pid IS DISTINCT FROM (v_context->>'backendPid')::integer OR NEW.transaction_id IS DISTINCT FROM (v_context->>'transactionId')::xid8 OR
  EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=NEW.operation_id AND action=NEW.action) THEN
   RAISE EXCEPTION 'financial_reset_hosted_stage_event_context_invalid' USING ERRCODE='23514';
 END IF;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_hosted_stage_event_guard BEFORE INSERT ON app_private.financial_reset_hosted_stage_events
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_hosted_stage_event();

CREATE FUNCTION app_private.capture_financial_reset_hosted_stage_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_binding jsonb; v_context jsonb; v_key jsonb; v_action text:=TG_ARGV[0]; v_kind text:=TG_ARGV[1];
BEGIN
 SELECT binding INTO v_binding FROM app_private.financial_reset_hosted_reservations
  WHERE operation_id=NEW.operation_id AND organization_id=NEW.organization_id;
 -- Existing local/recovery paths retain their own unchanged exact-row guards.
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_context:=app_private.assert_financial_reset_hosted_actor_context(v_binding,v_action);
 v_key:=CASE v_kind WHEN 'archive-insert' THEN jsonb_build_object('relation_name',to_jsonb(NEW)->'relation_name','primary_key',to_jsonb(NEW)->'primary_key')
  WHEN 'action-insert' THEN jsonb_build_object('action_id',to_jsonb(NEW)->'action_id') ELSE '{}'::jsonb END;
 INSERT INTO app_private.financial_reset_hosted_stage_events(operation_id,organization_id,action,event_kind,row_key,row_key_sha256,
  row_sha256,binding_sha256,authorization_id,actor_id,backend_pid,transaction_id)
 VALUES(NEW.operation_id,NEW.organization_id,v_action,v_kind,v_key,app_private.financial_reset_hash(v_key),app_private.financial_reset_hash(to_jsonb(NEW)),
  app_private.financial_reset_hash(v_binding),(v_context->>'authorizationId')::uuid,(v_context->>'actorId')::uuid,pg_backend_pid(),pg_current_xact_id());
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_hosted_operation_prepared AFTER INSERT ON app_private.financial_reset_operations
 FOR EACH ROW EXECUTE FUNCTION app_private.capture_financial_reset_hosted_stage_event('prepare','operation-prepared');
CREATE TRIGGER financial_reset_hosted_archive_insert AFTER INSERT ON app_private.financial_reset_archive_rows
 FOR EACH ROW EXECUTE FUNCTION app_private.capture_financial_reset_hosted_stage_event('prepare','archive-insert');
CREATE TRIGGER financial_reset_hosted_action_insert AFTER INSERT ON app_private.financial_reset_actions
 FOR EACH ROW EXECUTE FUNCTION app_private.capture_financial_reset_hosted_stage_event('prepare','action-insert');
CREATE TRIGGER financial_reset_hosted_operation_sealed AFTER UPDATE ON app_private.financial_reset_operations
 FOR EACH ROW WHEN(OLD.status='prepared' AND NEW.status='sealed')
 EXECUTE FUNCTION app_private.capture_financial_reset_hosted_stage_event('seal','operation-sealed');
CREATE TRIGGER financial_reset_hosted_zero_plan_insert AFTER INSERT ON app_private.financial_reset_zero_plans
 FOR EACH ROW EXECUTE FUNCTION app_private.capture_financial_reset_hosted_stage_event('seal','zero-plan-insert');

CREATE FUNCTION app_private.financial_reset_hosted_stage_result(p_operation uuid,p_action text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'action',p_action,
  'operation',to_jsonb(o)-ARRAY['database_oid','database_name','audit_actor'],
  'archiveCount',(SELECT count(*) FROM app_private.financial_reset_archive_rows WHERE operation_id=p_operation),
  'actionCount',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=p_operation),
  'appliedCount',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NOT NULL),
  'archiveSha256',app_private.financial_reset_archive_digest(p_operation),'actionSha256',app_private.financial_reset_action_digest(p_operation),
  'zero',CASE WHEN p_action='seal' THEN (SELECT jsonb_build_object('status',status,'reviewSha256',review_sha256,
    'planSha256',app_private.financial_reset_hash(plan_json),'plan',plan_json) FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation) ELSE NULL END)
 FROM app_private.financial_reset_operations o WHERE operation_id=p_operation
$$;

CREATE FUNCTION app_private.guard_financial_reset_hosted_action_receipt() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context jsonb; v_result jsonb; v_op app_private.financial_reset_operations%ROWTYPE; v_expected_count bigint;
BEGIN
 IF NEW.action NOT IN ('prepare','seal') OR NEW.binding ? 'recovery' THEN
  RAISE EXCEPTION 'financial_reset_hosted_action_receipt_invalid' USING ERRCODE='22023';
 END IF;
 PERFORM app_private.assert_financial_reset_hosted_reservation(NEW.binding,NEW.action);
 v_context:=app_private.assert_financial_reset_hosted_actor_context(NEW.binding,NEW.action);
 IF NEW.operation_id IS DISTINCT FROM (NEW.binding->>'operation_id')::uuid OR NEW.organization_id IS DISTINCT FROM (NEW.binding->>'organization_id')::uuid OR
  NEW.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(NEW.binding) OR
  NEW.authorization_id IS DISTINCT FROM (v_context->>'authorizationId')::uuid OR NEW.actor_id IS DISTINCT FROM (v_context->>'actorId')::uuid OR
  NEW.backend_pid IS DISTINCT FROM pg_backend_pid() OR NEW.transaction_id IS DISTINCT FROM pg_current_xact_id() OR
  NEW.backend_pid IS DISTINCT FROM (v_context->>'backendPid')::integer OR NEW.transaction_id IS DISTINCT FROM (v_context->>'transactionId')::xid8 THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_context_invalid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=NEW.operation_id FOR UPDATE;
 v_result:=app_private.financial_reset_hosted_stage_result(NEW.operation_id,NEW.action);
 IF v_op.organization_id<>NEW.organization_id OR v_op.operation_kind<>'reset' OR v_op.restore_of IS NOT NULL OR
  v_op.status<>(CASE NEW.action WHEN 'prepare' THEN 'prepared' ELSE 'sealed' END) OR
  v_op.source_generation<>(NEW.binding->>'source_generation')::integer OR v_op.target_generation<>(NEW.binding->>'target_generation')::integer OR
  v_op.manifest_sha256<>NEW.binding->>'manifest_sha256' OR v_op.plan_sha256<>NEW.binding->>'plan_sha256' OR
  v_op.schema_sha256<>NEW.binding->>'schema_sha256' OR v_op.archive_sha256<>NEW.binding->>'archive_sha256' OR v_op.action_sha256<>NEW.binding->>'action_sha256' OR
  v_op.archive_count<>(NEW.binding->>'archive_count')::integer OR v_op.action_count<>(NEW.binding->>'action_count')::integer OR
  (v_result->>'archiveCount')::integer<>v_op.archive_count OR (v_result->>'actionCount')::integer<>v_op.action_count OR
  (v_result->>'appliedCount')::integer<>0 OR v_result->>'archiveSha256'<>v_op.archive_sha256 OR v_result->>'actionSha256'<>v_op.action_sha256 OR
  NEW.result_json IS DISTINCT FROM v_result OR NEW.result_sha256 IS DISTINCT FROM app_private.financial_reset_hash(v_result) THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_state_invalid' USING ERRCODE='23514';
 END IF;
 IF NEW.action='seal' AND (v_result->'zero'->>'status' IS DISTINCT FROM 'prepared' OR
  v_result->'zero'->>'reviewSha256' IS DISTINCT FROM NEW.binding->>'zero_review_sha256' OR
  v_result->'zero'->>'planSha256' IS DISTINCT FROM NEW.binding->>'zero_review_sha256' OR NOT EXISTS(
   SELECT 1 FROM app_private.financial_reset_hosted_action_receipts r WHERE r.operation_id=NEW.operation_id AND r.action='prepare'
    AND r.binding=NEW.binding AND r.binding_sha256=NEW.binding_sha256)) THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_predecessor_required' USING ERRCODE='23514';
 END IF;
 v_expected_count:=CASE NEW.action WHEN 'prepare' THEN 1+v_op.archive_count::bigint+v_op.action_count::bigint ELSE 2 END;
 IF (SELECT count(*) FROM app_private.financial_reset_hosted_stage_events WHERE operation_id=NEW.operation_id AND action=NEW.action)<>v_expected_count OR
  EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_stage_events e WHERE e.operation_id=NEW.operation_id AND e.action=NEW.action AND
   (e.organization_id<>NEW.organization_id OR e.binding_sha256<>NEW.binding_sha256 OR e.authorization_id<>NEW.authorization_id OR
    e.actor_id<>NEW.actor_id OR e.backend_pid<>NEW.backend_pid OR e.transaction_id<>NEW.transaction_id)) OR
  NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_stage_events e WHERE e.operation_id=NEW.operation_id AND e.action=NEW.action
   AND e.event_kind=(CASE NEW.action WHEN 'prepare' THEN 'operation-prepared' ELSE 'operation-sealed' END) AND e.row_key='{}'::jsonb
   AND e.row_sha256=app_private.financial_reset_hash(to_jsonb(v_op))) THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_same_transaction_required' USING ERRCODE='23514';
 END IF;
 IF NEW.action='prepare' AND (EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows r WHERE r.operation_id=NEW.operation_id AND NOT EXISTS(
   SELECT 1 FROM app_private.financial_reset_hosted_stage_events e WHERE e.operation_id=NEW.operation_id AND e.action='prepare' AND e.event_kind='archive-insert'
    AND e.row_key=jsonb_build_object('relation_name',r.relation_name,'primary_key',r.primary_key) AND e.row_sha256=app_private.financial_reset_hash(to_jsonb(r)))) OR
  EXISTS(SELECT 1 FROM app_private.financial_reset_actions a WHERE a.operation_id=NEW.operation_id AND NOT EXISTS(
   SELECT 1 FROM app_private.financial_reset_hosted_stage_events e WHERE e.operation_id=NEW.operation_id AND e.action='prepare' AND e.event_kind='action-insert'
    AND e.row_key=jsonb_build_object('action_id',a.action_id) AND e.row_sha256=app_private.financial_reset_hash(to_jsonb(a))))) THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_same_transaction_required' USING ERRCODE='23514';
 END IF;
 IF NEW.action='seal' AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z JOIN app_private.financial_reset_hosted_stage_events e
  ON e.operation_id=z.operation_id AND e.action='seal' AND e.event_kind='zero-plan-insert' AND e.row_key='{}'::jsonb
   AND e.row_sha256=app_private.financial_reset_hash(to_jsonb(z)) WHERE z.operation_id=NEW.operation_id) THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_same_transaction_required' USING ERRCODE='23514';
 END IF;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_hosted_action_receipt_guard BEFORE INSERT ON app_private.financial_reset_hosted_action_receipts
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_hosted_action_receipt();

CREATE FUNCTION app_private.record_financial_reset_hosted_action_receipt(p_binding jsonb,p_action text,p_authorization uuid,p_authority_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context jsonb; v_result jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('prepare','seal') OR p_authorization IS NULL OR
  p_authority_sha256 IS NULL OR p_authority_sha256 !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'financial_reset_hosted_action_receipt_invalid' USING ERRCODE='22023';
 END IF;
 v_context:=app_private.assert_financial_reset_hosted_actor_context(p_binding,p_action);
 v_result:=app_private.financial_reset_hosted_stage_result((p_binding->>'operation_id')::uuid,p_action);
 INSERT INTO app_private.financial_reset_hosted_action_receipts(operation_id,organization_id,action,binding,binding_sha256,
  authorization_id,authority_sha256,actor_id,backend_pid,transaction_id,result_json,result_sha256)
 VALUES((p_binding->>'operation_id')::uuid,(p_binding->>'organization_id')::uuid,p_action,p_binding,app_private.financial_reset_hash(p_binding),
  p_authorization,p_authority_sha256,(v_context->>'actorId')::uuid,pg_backend_pid(),pg_current_xact_id(),v_result,app_private.financial_reset_hash(v_result));
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_hosted_stage_receipt_committed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_action_receipts r
  WHERE r.operation_id=NEW.operation_id AND r.organization_id=NEW.organization_id AND r.action=NEW.action
   AND r.binding_sha256=NEW.binding_sha256 AND r.authorization_id=NEW.authorization_id AND r.actor_id=NEW.actor_id
   AND r.backend_pid=NEW.backend_pid AND r.transaction_id=NEW.transaction_id) THEN
   RAISE EXCEPTION 'financial_reset_hosted_stage_receipt_required_before_commit' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_hosted_stage_receipt_commit AFTER INSERT ON app_private.financial_reset_hosted_stage_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_hosted_stage_receipt_committed();

REVOKE ALL ON FUNCTION app_private.financial_reset_hosted_foreign_census(uuid),
 app_private.reserve_financial_reset_hosted_operation(jsonb),app_private.assert_financial_reset_hosted_reservation(jsonb,text),
 app_private.checkpoint_financial_reset_hosted_operation(jsonb,text),app_private.reserve_financial_reset_hosted_recovery(jsonb),
 app_private.guard_financial_reset_hosted_stage_event(),app_private.capture_financial_reset_hosted_stage_event(),
 app_private.financial_reset_hosted_stage_result(uuid,text),app_private.guard_financial_reset_hosted_action_receipt(),
 app_private.record_financial_reset_hosted_action_receipt(jsonb,text,uuid,text),app_private.assert_financial_reset_hosted_stage_receipt_committed()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
