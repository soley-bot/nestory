-- Inactive installation. The original frozen checkpoint is never rewritten.
-- A single fixed Pilot execute may record a fresh before/after foreign census
-- only inside its genuine, already-consumed authorization transaction.
BEGIN;

CREATE TABLE app_private.financial_reset_execute_resumes (
 operation_id uuid PRIMARY KEY REFERENCES app_private.financial_reset_hosted_reservations(operation_id) ON DELETE RESTRICT,
 failed_authorization_id uuid NOT NULL REFERENCES app_private.financial_reset_actor_authorizations(authorization_id) ON DELETE RESTRICT,
 authorization_id uuid NOT NULL UNIQUE REFERENCES app_private.financial_reset_actor_authorizations(authorization_id) ON DELETE RESTRICT,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 original_foreign_sha256 text NOT NULL CHECK(original_foreign_sha256 ~ '^[a-f0-9]{64}$'),
 foreign_sha256 text NOT NULL CHECK(foreign_sha256=app_private.financial_reset_hash(foreign_census)),
 foreign_census jsonb NOT NULL CHECK(jsonb_typeof(foreign_census)='array'),
 foreign_organization_count integer NOT NULL CHECK(foreign_organization_count=4),
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid),
 CHECK(failed_authorization_id='4db95b1e-774b-4a8c-881a-2192724aa42d'::uuid),
 CHECK(authorization_id<>failed_authorization_id)
);
-- No organization_id column: this audit record is not a foreign organization
-- row. The immutable reservation supplies its organization. The established
-- continuation snapshot also excludes all financial_reset_* bookkeeping.
ALTER TABLE app_private.financial_reset_execute_resumes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_execute_resumes FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_execute_resume_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_execute_resumes
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_execute_resume_no_truncate BEFORE TRUNCATE ON app_private.financial_reset_execute_resumes
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.financial_reset_execute_foreign_sha256(p_binding jsonb) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r app_private.financial_reset_execute_resumes%ROWTYPE; context jsonb; original text;
BEGIN
 SELECT foreign_sha256 INTO original FROM app_private.financial_reset_hosted_reservations
  WHERE operation_id=(p_binding->>'operation_id')::uuid AND binding=p_binding
   AND binding_sha256=app_private.financial_reset_hash(p_binding);
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_hosted_reservation_mismatch' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM app_private.financial_reset_execute_resumes
  WHERE operation_id=(p_binding->>'operation_id')::uuid AND binding_sha256=app_private.financial_reset_hash(p_binding)
   AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned();
 IF NOT FOUND THEN RETURN original; END IF;
 -- Recheck live actor/session/expiry on every use; the audit row is no capability.
 context:=app_private.assert_financial_reset_hosted_actor_context(p_binding,'execute');
 IF r.authorization_id IS DISTINCT FROM (context->>'authorizationId')::uuid
  OR r.original_foreign_sha256 IS DISTINCT FROM original THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_context_required' USING ERRCODE='42501';
 END IF;
 RETURN r.foreign_sha256;
END;
$$;

CREATE FUNCTION app_private.activate_financial_reset_execute_resume(p_binding jsonb,p_failed_authorization uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; failed app_private.financial_reset_actor_authorizations%ROWTYPE;
 op app_private.financial_reset_operations%ROWTYPE; reservation app_private.financial_reset_hosted_reservations%ROWTYPE;
 census jsonb; org uuid:='752a87b8-bd04-4a45-9cb8-00687af66e73';
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 IF p_binding->>'operation_id' IS DISTINCT FROM '7c70e27f-ba37-48cc-8f93-d32badcb2fb7'
  OR p_binding->>'organization_id' IS DISTINCT FROM org::text OR p_binding ? 'recovery'
  OR p_failed_authorization IS DISTINCT FROM '4db95b1e-774b-4a8c-881a-2192724aa42d'::uuid THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_scope_invalid' USING ERRCODE='22023';
 END IF;
 context:=app_private.assert_financial_reset_hosted_actor_context(p_binding,'execute');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||org::text,0));
 SELECT * INTO failed FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=p_failed_authorization FOR SHARE;
 IF NOT FOUND OR failed.operation_id IS DISTINCT FROM (p_binding->>'operation_id')::uuid
  OR failed.organization_id IS DISTINCT FROM org OR failed.action IS DISTINCT FROM 'execute'
  OR failed.binding IS DISTINCT FROM p_binding OR failed.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p_binding)
  OR failed.expires_at>clock_timestamp() OR failed.consumed_at IS NOT NULL OR failed.backend_pid IS NOT NULL OR failed.transaction_id IS NOT NULL
  OR failed.authorization_id=(context->>'authorizationId')::uuid THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_failed_attempt_invalid' USING ERRCODE='40001';
 END IF;
 SELECT * INTO reservation FROM app_private.financial_reset_hosted_reservations
  WHERE operation_id=(p_binding->>'operation_id')::uuid;
 IF NOT FOUND OR reservation.organization_id IS DISTINCT FROM org OR reservation.binding IS DISTINCT FROM p_binding
  OR reservation.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p_binding) THEN
  RAISE EXCEPTION 'financial_reset_hosted_reservation_mismatch' USING ERRCODE='40001';
 END IF;
 SELECT * INTO op FROM app_private.financial_reset_operations WHERE operation_id=reservation.operation_id FOR UPDATE;
 IF NOT FOUND OR op.organization_id IS DISTINCT FROM org OR op.operation_kind IS DISTINCT FROM 'reset' OR op.restore_of IS NOT NULL
  OR op.status IS DISTINCT FROM 'sealed' OR op.source_generation IS DISTINCT FROM 0 OR op.target_generation IS DISTINCT FROM 1
  OR op.execution_backend IS NOT NULL OR op.execution_xid IS NOT NULL OR op.completed_at IS NOT NULL
  OR op.archive_count IS DISTINCT FROM 4898 OR op.action_count IS DISTINCT FROM 4169
  OR (p_binding->>'archive_count')::integer IS DISTINCT FROM op.archive_count
  OR (p_binding->>'action_count')::integer IS DISTINCT FROM op.action_count
  OR op.manifest_sha256 IS DISTINCT FROM p_binding->>'manifest_sha256' OR op.plan_sha256 IS DISTINCT FROM p_binding->>'plan_sha256'
  OR op.schema_sha256 IS DISTINCT FROM p_binding->>'schema_sha256' OR op.archive_sha256 IS DISTINCT FROM p_binding->>'archive_sha256'
  OR op.action_sha256 IS DISTINCT FROM p_binding->>'action_sha256'
  OR (SELECT count(*) FROM app_private.financial_reset_archive_rows WHERE operation_id=op.operation_id)<>4898
  OR app_private.financial_reset_archive_digest(op.operation_id) IS DISTINCT FROM op.archive_sha256
  OR (SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=op.operation_id)<>4169
  OR (SELECT max(ordinal) FROM app_private.financial_reset_actions WHERE operation_id=op.operation_id) IS DISTINCT FROM 4169
  OR app_private.financial_reset_action_digest(op.operation_id) IS DISTINCT FROM op.action_sha256
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=op.operation_id AND applied_at IS NOT NULL)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans WHERE operation_id=op.operation_id)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_phase_fences WHERE operation_id=op.operation_id)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=op.operation_id)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=op.operation_id)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=op.operation_id AND z.status='prepared'
   AND z.execution_backend IS NULL AND z.execution_xid IS NULL AND z.completed_at IS NULL AND z.result_json IS NULL
   AND z.review_sha256=p_binding->>'zero_review_sha256' AND z.review_sha256=app_private.financial_reset_hash(z.plan_json)) THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_rollback_required' USING ERRCODE='40001';
 END IF;
 IF app_private.financial_reset_single_admin_mode(op.operation_id) IS DISTINCT FROM true
  OR (SELECT count(*) FROM public.organizations WHERE id IS DISTINCT FROM org)<>4 THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_scope_invalid' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_execute_resumes WHERE operation_id=op.operation_id) THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_already_recorded' USING ERRCODE='55000';
 END IF;
 census:=app_private.financial_reset_hosted_foreign_census(org);
 INSERT INTO app_private.financial_reset_execute_resumes(operation_id,failed_authorization_id,authorization_id,binding_sha256,
  original_foreign_sha256,foreign_sha256,foreign_census,foreign_organization_count,backend_pid,transaction_id)
 VALUES(op.operation_id,p_failed_authorization,(context->>'authorizationId')::uuid,reservation.binding_sha256,
  reservation.foreign_sha256,app_private.financial_reset_hash(census),census,4,pg_backend_pid(),pg_current_xact_id());
 -- This retains all original frozen/source/checkpoint checks, now against the
 -- just-captured actual census. A failure rolls back the append and consumption.
 PERFORM app_private.assert_financial_reset_hosted_reservation(p_binding,'execute');
END;
$$;

-- Preserve OID, owner and ACL; change only the expected foreign baseline.
DO $patch$
DECLARE definition text; old_text text:='r.foreign_sha256=app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(v_org))';
BEGIN
 SELECT replace(pg_get_functiondef('app_private.assert_financial_reset_hosted_reservation(jsonb,text)'::regprocedure),E'\r\n',E'\n') INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN
  RAISE EXCEPTION 'financial_reset_execute_resume_predecessor_changed';
 END IF;
 EXECUTE replace(definition,old_text,'app_private.financial_reset_execute_foreign_sha256(v_base)=app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(v_org))');
END;
$patch$;
REVOKE ALL ON FUNCTION app_private.financial_reset_execute_foreign_sha256(jsonb),
 app_private.activate_financial_reset_execute_resume(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
