-- Reopening is a separate authenticated, reviewed action after a committed
-- checkpoint. Installation opens nobody. API ACLs and credential expiry stay.
BEGIN;

CREATE TABLE app_private.financial_reset_reopening_context (
 backend_pid integer PRIMARY KEY,
 transaction_id xid8 NOT NULL,
 operation_id uuid NOT NULL REFERENCES app_private.financial_reset_operations(operation_id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 binding jsonb NOT NULL,
 evidence_text text NOT NULL,
 consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE app_private.financial_reset_reopening_receipts (
 operation_id uuid PRIMARY KEY REFERENCES app_private.financial_reset_operations(operation_id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 request_id uuid NOT NULL UNIQUE,
 generation integer NOT NULL,
 cutoff date NOT NULL,
 binding jsonb NOT NULL,
 binding_sha256 text NOT NULL CHECK(binding_sha256=app_private.financial_reset_hash(binding)),
 evidence_text text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256=encode(extensions.digest(evidence_text,'sha256'),'hex')),
 checkpoint_sha256 text NOT NULL,
 after_sha256 text NOT NULL,
 authorization_id uuid NOT NULL REFERENCES app_private.financial_reset_actor_authorizations(authorization_id),
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 opened_at timestamptz NOT NULL,
 result_json jsonb NOT NULL,
 result_sha256 text NOT NULL CHECK(result_sha256=app_private.financial_reset_hash(result_json)),
 UNIQUE(organization_id,generation)
);
ALTER TABLE app_private.financial_reset_reopening_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_reopening_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_reopening_context,app_private.financial_reset_reopening_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.assert_financial_reset_reopening_binding(p_binding jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb:=p_binding->'reopening'; k text;
BEGIN
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key)
  IS DISTINCT FROM ARRAY['after_sha256','checkpoint_sha256','cutoff','evidence_sha256','execution_business_date','foreign_sha256',
   'generation','operation_id','request_id','review_sha256','version']::text[] OR r->'version' IS DISTINCT FROM '1'::jsonb
  OR r->>'operation_id' IS DISTINCT FROM coalesce(p_binding->'recovery'->>'operation_id',p_binding->>'operation_id')
  OR r->'generation' IS DISTINCT FROM coalesce(p_binding->'recovery'->'target_generation',p_binding->'target_generation')
  OR r->>'cutoff' IS DISTINCT FROM p_binding->>'cutoff'
  OR coalesce(r->>'request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(r->>'execution_business_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'financial_reset_reopening_binding_invalid' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY ARRAY['after_sha256','checkpoint_sha256','evidence_sha256','foreign_sha256','review_sha256'] LOOP
  IF coalesce(r->>k,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'financial_reset_reopening_binding_invalid' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_binding->'version'='2'::jsonb AND (p_binding->>'recovery_policy' IS DISTINCT FROM 'no-backup-user-waived'
  OR p_binding->'archive_artifact_sha256' IS DISTINCT FROM 'null'::jsonb OR p_binding ? 'recovery'
  OR r->>'foreign_sha256' IS DISTINCT FROM p_binding->>'foreign_snapshot_sha256') THEN
  RAISE EXCEPTION 'financial_reset_reopening_no_backup_binding_invalid' USING ERRCODE='22023';
 END IF;
 PERFORM app_private.assert_financial_reset_actor_binding(p_binding-'reopening',CASE WHEN p_binding ? 'recovery' THEN 'execute-recovery' ELSE 'execute' END);
END;
$$;

-- The existing gateway RPC, current actor checks and consume path are reused.
-- Only its closed binding validator/action constraint gain the separate action.
DO $actor_binding$
DECLARE d text; b text; a text:=E'BEGIN\n';
BEGIN
 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO STRICT d,b
 FROM pg_proc WHERE oid='app_private.assert_financial_reset_actor_binding(jsonb,text)'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'15f85f8e8ae95779c5bdc41cdffa22992b46cfaa7f3ecb5d49db84d85430f499'
  OR (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_reset_reopening_actor_predecessor_changed';
 END IF;
 EXECUTE replace(d,b,replace(b,a,a||E' IF p_action=''reopen'' THEN\n  PERFORM app_private.assert_financial_reset_reopening_binding(p_binding);\n  RETURN;\n END IF;\n'));
END;
$actor_binding$;
ALTER TABLE app_private.financial_reset_actor_authorizations DROP CONSTRAINT financial_reset_actor_authorizations_action_check;
ALTER TABLE app_private.financial_reset_actor_authorizations ADD CONSTRAINT financial_reset_actor_authorizations_action_check
 CHECK(action IN ('freeze','checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery','reopen'));

-- In v1, external storage/key/containment provenance is verified by the fixed
-- protected provider. V2 has no backup, export or inverse capability: current
-- waiver, exact consent, actors, containment and rehearsal evidence must be
-- verified by the protected runtime, independently of the reference hashes.
-- This function independently verifies every database fact; a digest or readiness
-- flag cannot replace a missing database witness or a changed source image.
CREATE FUNCTION app_private.assert_financial_reset_reopening_ready(p_binding jsonb,p_evidence_text text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb:=p_binding->'reopening'; e jsonb; b jsonb:=p_binding-'reopening'; base jsonb:=p_binding-ARRAY['reopening','recovery'];
 o app_private.financial_reset_operations%ROWTYPE; c app_private.financial_reset_verification_checkpoints%ROWTYPE;
 w app_private.financial_write_controls%ROWTYPE; a app_private.financial_reset_actor_authorizations%ROWTYPE;
 h app_private.financial_reset_hosted_reservations%ROWTYPE; k text; v_expected_kind text;
 v_no_backup boolean:=p_binding->'version'='2'::jsonb; v_audit jsonb; v_authority jsonb;
 v_reopening_actor app_private.financial_reset_actor_authorizations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM app_private.assert_financial_reset_reopening_binding(p_binding);
 PERFORM pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||(p_binding->>'organization_id'),0));
 PERFORM app_private.assert_financial_reset_hosted_actor_context(p_binding,'reopen');
 IF p_evidence_text IS NULL OR octet_length(p_evidence_text)>1048576
  OR encode(extensions.digest(p_evidence_text,'sha256'),'hex') IS DISTINCT FROM r->>'evidence_sha256' THEN
  RAISE EXCEPTION 'financial_reset_reopening_evidence_required' USING ERRCODE='23514';
 END IF;
 e:=p_evidence_text::jsonb;
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)
  IS DISTINCT FROM (CASE WHEN v_no_backup THEN
   ARRAY['after_sha256','authority_receipt','checkpoint_sha256','completion_intent_sha256','completion_reconciliation_sha256',
    'database_audit','evidence_references','format','operation_id','organization_id','packet_sha256','recovery_policy','review_sha256']::text[]
   ELSE ARRAY['after_sha256','artifact_receipts','authority_receipt','checkpoint_sha256','completion_intent_sha256',
    'completion_reconciliation_sha256','format','operation_id','organization_id','packet_sha256','review_sha256']::text[] END)
  OR e->>'format' IS DISTINCT FROM (CASE WHEN v_no_backup THEN 'nestory-reset-reopening-evidence-v2' ELSE 'nestory-reset-reopening-evidence-v1' END)
  OR e->>'operation_id' IS DISTINCT FROM r->>'operation_id' OR e->>'organization_id' IS DISTINCT FROM p_binding->>'organization_id'
  OR e->>'packet_sha256' IS DISTINCT FROM p_binding->>'packet_sha256' OR e->>'checkpoint_sha256' IS DISTINCT FROM r->>'checkpoint_sha256'
  OR e->>'after_sha256' IS DISTINCT FROM r->>'after_sha256' OR e->>'review_sha256' IS DISTINCT FROM r->>'review_sha256'
  OR coalesce(e->>'completion_intent_sha256','') !~ '^[a-f0-9]{64}$'
  OR coalesce(e->>'completion_reconciliation_sha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(e->'authority_receipt') IS DISTINCT FROM 'object' OR e->'authority_receipt'='{}'::jsonb THEN
  RAISE EXCEPTION 'financial_reset_reopening_evidence_required' USING ERRCODE='23514';
 END IF;
 IF v_no_backup THEN
  v_authority:=e->'authority_receipt';
  IF e->>'recovery_policy' IS DISTINCT FROM 'no-backup-user-waived'
   OR jsonb_typeof(e->'database_audit') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e->'database_audit') key) IS DISTINCT FROM
    ARRAY['action_count','action_sha256','archive_count','archive_sha256','completion_authorization_id','completion_backend_pid',
     'completion_transaction_id','prepare_receipt_sha256','seal_receipt_sha256']::text[]
   OR jsonb_typeof(e->'evidence_references') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e->'evidence_references') key) IS DISTINCT FROM
    ARRAY['actorApprovals','containmentProof','liveConsent','rehearsalProof','waiver']::text[]
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_authority) key) IS DISTINCT FROM
    ARRAY['actorId','afterSha256','bindingSha256','checkpointSha256','databaseAudit','evidenceReferences','executionBusinessDate','expiresAt',
     'foreignSha256','format','observedAt','operationId','organizationId','packetSha256','recoveryPolicy','reviewSha256','sessionId']::text[] THEN
   RAISE EXCEPTION 'financial_reset_reopening_no_backup_evidence_required' USING ERRCODE='23514';
  END IF;
  FOREACH k IN ARRAY ARRAY['waiver','liveConsent','actorApprovals','containmentProof','rehearsalProof'] LOOP
   IF jsonb_typeof(e->'evidence_references'->k) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e->'evidence_references'->k) key) IS DISTINCT FROM ARRAY['bytes','sha256']::text[]
    OR coalesce(e->'evidence_references'->k->>'sha256','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(e->'evidence_references'->k->'bytes') IS DISTINCT FROM 'number'
    OR coalesce(e->'evidence_references'->k->>'bytes','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'financial_reset_reopening_no_backup_evidence_required' USING ERRCODE='23514';
   END IF;
  END LOOP;
  SELECT * INTO STRICT v_reopening_actor FROM app_private.financial_reset_actor_authorizations
   WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND action='reopen' AND binding=p_binding;
  IF v_authority->>'format' IS DISTINCT FROM 'nestory-no-backup-reopening-authority-v1'
   OR v_authority->>'recoveryPolicy' IS DISTINCT FROM 'no-backup-user-waived'
   OR v_authority->>'operationId' IS DISTINCT FROM b->>'operation_id' OR v_authority->>'organizationId' IS DISTINCT FROM b->>'organization_id'
   OR v_authority->>'packetSha256' IS DISTINCT FROM b->>'packet_sha256' OR v_authority->>'bindingSha256' IS DISTINCT FROM app_private.financial_reset_hash(b)
   OR v_authority->>'checkpointSha256' IS DISTINCT FROM r->>'checkpoint_sha256' OR v_authority->>'afterSha256' IS DISTINCT FROM r->>'after_sha256'
   OR v_authority->>'foreignSha256' IS DISTINCT FROM b->>'foreign_snapshot_sha256' OR v_authority->>'reviewSha256' IS DISTINCT FROM r->>'review_sha256'
   OR v_authority->>'executionBusinessDate' IS DISTINCT FROM r->>'execution_business_date'
   OR v_authority->'databaseAudit' IS DISTINCT FROM e->'database_audit' OR v_authority->'evidenceReferences' IS DISTINCT FROM e->'evidence_references'
   OR v_authority->>'actorId' IS DISTINCT FROM v_reopening_actor.actor_id::text OR v_authority->>'actorId' IS DISTINCT FROM b->'continuation_semantic'->>'actor_id'
   OR v_authority->>'sessionId' IS DISTINCT FROM v_reopening_actor.session_id::text
   OR coalesce(v_authority->>'observedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
   OR coalesce(v_authority->>'expiresAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
   OR (v_authority->>'observedAt')::timestamptz>clock_timestamp() OR (v_authority->>'expiresAt')::timestamptz<=clock_timestamp()
   OR (v_authority->>'expiresAt')::timestamptz>(v_authority->>'observedAt')::timestamptz+interval '5 minutes'
   OR (v_authority->>'expiresAt')::timestamptz>v_reopening_actor.credential_expires_at THEN
   RAISE EXCEPTION 'financial_reset_reopening_no_backup_authority_required' USING ERRCODE='42501';
  END IF;
 ELSE
  IF jsonb_typeof(e->'artifact_receipts') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e->'artifact_receipts') key)
    IS DISTINCT FROM ARRAY['archive','containmentProof','liveConsent','restoreProof','storageProof']::text[] THEN
   RAISE EXCEPTION 'financial_reset_reopening_evidence_required' USING ERRCODE='23514';
  END IF;
  FOREACH k IN ARRAY ARRAY['archive','containmentProof','liveConsent','restoreProof','storageProof'] LOOP
   IF jsonb_typeof(e->'artifact_receipts'->k) IS DISTINCT FROM 'object'
    OR coalesce(e->'artifact_receipts'->k->>'artifact_sha256','') !~ '^[a-f0-9]{64}$'
    OR coalesce(e->'artifact_receipts'->k->>'receipt_sha256','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'financial_reset_reopening_artifact_receipt_required' USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF e->'artifact_receipts'->'archive'->>'artifact_sha256' IS DISTINCT FROM p_binding->>'archive_artifact_sha256' THEN
   RAISE EXCEPTION 'financial_reset_reopening_archive_changed' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT * INTO o FROM app_private.financial_reset_operations WHERE operation_id=(r->>'operation_id')::uuid FOR UPDATE;
 SELECT * INTO w FROM app_private.financial_write_controls WHERE organization_id=(p_binding->>'organization_id')::uuid FOR UPDATE;
 SELECT * INTO c FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=o.operation_id FOR SHARE;
 SELECT * INTO h FROM app_private.financial_reset_hosted_reservations WHERE operation_id=(base->>'operation_id')::uuid FOR SHARE;
 v_expected_kind:=CASE WHEN b ? 'recovery' THEN 'phase-recovery' ELSE 'checked-reports' END;
 IF o.operation_id IS NULL OR c.operation_id IS NULL OR h.operation_id IS NULL OR w.organization_id IS NULL
  OR o.organization_id IS DISTINCT FROM w.organization_id OR o.status IS DISTINCT FROM 'actions_complete'
  OR o.manifest_sha256 IS DISTINCT FROM base->>'manifest_sha256' OR o.archive_sha256 IS DISTINCT FROM base->>'archive_sha256'
  OR o.schema_sha256 IS DISTINCT FROM base->>'schema_sha256'
  OR o.plan_sha256 IS DISTINCT FROM coalesce(b->'recovery'->>'plan_sha256',base->>'plan_sha256')
  OR o.action_sha256 IS DISTINCT FROM coalesce(b->'recovery'->>'action_sha256',base->>'action_sha256')
  OR o.operation_kind IS DISTINCT FROM (CASE WHEN b ? 'recovery' THEN 'restore' ELSE 'reset' END)
  OR o.restore_of IS DISTINCT FROM (CASE WHEN b ? 'recovery' THEN (base->>'operation_id')::uuid ELSE NULL::uuid END)
  OR w.status IS DISTINCT FROM 'frozen' OR w.generation IS DISTINCT FROM (r->>'generation')::integer
  OR w.generation IS DISTINCT FROM o.target_generation OR w.financial_start_date::text IS DISTINCT FROM r->>'cutoff'
  OR o.database_name IS DISTINCT FROM current_database() OR o.database_oid IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname=current_database())
  OR o.execution_xid IS NULL OR o.execution_xid=pg_current_xact_id() OR c.execution_xid IS DISTINCT FROM o.execution_xid
  OR c.execution_backend IS DISTINCT FROM o.execution_backend OR c.generation IS DISTINCT FROM o.target_generation
  OR c.organization_id IS DISTINCT FROM o.organization_id OR c.checkpoint_kind IS DISTINCT FROM v_expected_kind
  OR c.checkpoint_sha256 IS DISTINCT FROM r->>'checkpoint_sha256' OR c.checkpoint_sha256 IS DISTINCT FROM app_private.financial_reset_hash(c.result_json)
  OR c.result_json->>'after_sha256' IS DISTINCT FROM r->>'after_sha256'
  OR c.result_json->'control_reopened' IS DISTINCT FROM 'false'::jsonb
  OR c.after_images IS DISTINCT FROM app_private.financial_reset_continuation_snapshot(o.organization_id)
  OR app_private.financial_reset_hash(c.after_images) IS DISTINCT FROM r->>'after_sha256'
  OR h.binding IS DISTINCT FROM base OR h.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(base)
  OR h.foreign_sha256 IS DISTINCT FROM r->>'foreign_sha256'
  OR h.foreign_sha256 IS DISTINCT FROM app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(o.organization_id))
  OR app_private.rent_business_date(o.organization_id,statement_timestamp())::text IS DISTINCT FROM r->>'execution_business_date'
  OR (SELECT operational_timezone FROM public.organizations WHERE id=o.organization_id) IS DISTINCT FROM b->>'timezone'
  OR (SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=o.operation_id AND applied_at IS NOT NULL)<>o.action_count
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE organization_id=o.organization_id)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_checkpoints hc WHERE hc.operation_id=h.operation_id
   AND hc.binding_sha256=h.binding_sha256 AND hc.source_sha256=base->>'source_snapshot_sha256' AND hc.foreign_sha256=h.foreign_sha256) THEN
  RAISE EXCEPTION 'financial_reset_reopening_committed_checkpoint_required' USING ERRCODE='40001';
 END IF;
 -- Real immutable stage receipts are required for the original reset. Their
 -- own source/deferred triggers prove archive/actions/zero-plan insertion.
 IF (SELECT count(*) FROM app_private.financial_reset_hosted_action_receipts s WHERE s.operation_id=h.operation_id
   AND s.binding=base AND s.binding_sha256=h.binding_sha256 AND s.action IN ('prepare','seal')
   AND s.result_sha256=app_private.financial_reset_hash(s.result_json))<>2 THEN
  RAISE EXCEPTION 'financial_reset_reopening_stage_receipts_required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO a FROM app_private.financial_reset_actor_authorizations WHERE operation_id=o.operation_id
  AND action=(CASE WHEN b ? 'recovery' THEN 'execute-recovery' ELSE 'execute' END)
  AND binding=b AND binding_sha256=app_private.financial_reset_hash(b) AND consumed_at IS NOT NULL
  AND backend_pid=c.execution_backend AND transaction_id=c.execution_xid;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_reopening_completion_authority_required' USING ERRCODE='23514'; END IF;
 IF v_no_backup THEN
  v_audit:=jsonb_build_object(
   'archive_count',(SELECT count(*) FROM app_private.financial_reset_archive_rows WHERE operation_id=o.operation_id),
   'archive_sha256',app_private.financial_reset_archive_digest(o.operation_id),
   'action_count',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=o.operation_id),
   'action_sha256',app_private.financial_reset_action_digest(o.operation_id),
   'prepare_receipt_sha256',(SELECT result_sha256 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=o.operation_id AND action='prepare'),
   'seal_receipt_sha256',(SELECT result_sha256 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=o.operation_id AND action='seal'),
   'completion_authorization_id',a.authorization_id,'completion_backend_pid',a.backend_pid,'completion_transaction_id',a.transaction_id::text);
  IF e->'database_audit' IS DISTINCT FROM v_audit OR v_audit->'archive_count' IS DISTINCT FROM b->'archive_count'
   OR v_audit->>'archive_sha256' IS DISTINCT FROM b->>'archive_sha256' OR v_audit->'action_count' IS DISTINCT FROM b->'action_count'
   OR v_audit->>'action_sha256' IS DISTINCT FROM b->>'action_sha256'
   OR h.foreign_sha256 IS DISTINCT FROM b->>'foreign_snapshot_sha256'
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows ar WHERE ar.operation_id=o.operation_id
    AND (ar.organization_id IS DISTINCT FROM o.organization_id OR ar.row_sha256 IS DISTINCT FROM app_private.financial_reset_hash(ar.row_json))) THEN
   RAISE EXCEPTION 'financial_reset_reopening_no_backup_database_audit_required' USING ERRCODE='23514';
  END IF;
 END IF;
 IF b ? 'recovery' THEN
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_recovery_reservations hr WHERE hr.operation_id=o.operation_id
    AND hr.reset_operation_id=h.operation_id AND hr.binding=b AND hr.binding_sha256=app_private.financial_reset_hash(b))
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_recovery_plans rp WHERE rp.operation_id=o.operation_id
    AND rp.binding_sha256=c.result_json->>'recovery_binding_sha256' AND rp.sources_sha256=c.result_json->>'recovery_sources_sha256'
    AND rp.phase_binding->>'report_checkpoint_sha256'=b->'recovery'->>'report_checkpoint_sha256') THEN
   RAISE EXCEPTION 'financial_reset_reopening_recovery_proof_required' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=o.operation_id AND z.status='complete'
    AND z.review_sha256=b->>'zero_review_sha256' AND z.execution_xid=c.execution_xid AND z.execution_backend=c.execution_backend)
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans p WHERE p.operation_id=o.operation_id AND p.status='complete'
    AND p.review_sha256=c.result_json->>'continuation_review_sha256')
   OR (SELECT count(*) FROM app_private.financial_reset_phase_fences f WHERE f.operation_id=o.operation_id
    AND f.transaction_id=c.execution_xid AND f.backend_pid=c.execution_backend AND f.phase IN ('known-zero','continuation','reports'))<>3
   OR c.result_json->>'report_review_sha256' IS DISTINCT FROM b->>'report_review_sha256'
   OR c.result_json->>'continuation_semantic_sha256' IS DISTINCT FROM b->>'continuation_semantic_sha256'
   OR c.result_json->>'authorization_id' IS DISTINCT FROM a.authorization_id::text
   OR c.result_json->>'actor_id' IS DISTINCT FROM a.actor_id::text
   OR c.result_json->'reports_persisted' IS DISTINCT FROM 'true'::jsonb OR c.result_json->'close_published' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'financial_reset_reopening_report_proof_required' USING ERRCODE='23514';
  END IF;
 END IF;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_reopening_context() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.backend_pid<>pg_backend_pid() OR OLD.transaction_id<>pg_current_xact_id() OR NOT OLD.consumed
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE operation_id=OLD.operation_id
    AND backend_pid=OLD.backend_pid AND transaction_id=OLD.transaction_id) THEN
   RAISE EXCEPTION 'financial_reset_reopening_context_invalid' USING ERRCODE='42501';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF pg_trigger_depth()<2 OR OLD.consumed OR NOT NEW.consumed
   OR (to_jsonb(NEW)-'consumed') IS DISTINCT FROM (to_jsonb(OLD)-'consumed') THEN
   RAISE EXCEPTION 'financial_reset_reopening_context_invalid' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.backend_pid<>pg_backend_pid() OR NEW.transaction_id<>pg_current_xact_id() OR NEW.consumed
  OR NEW.operation_id IS DISTINCT FROM (NEW.binding->'reopening'->>'operation_id')::uuid
  OR NEW.organization_id IS DISTINCT FROM (NEW.binding->>'organization_id')::uuid THEN
  RAISE EXCEPTION 'financial_reset_reopening_context_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_financial_reset_reopening_ready(NEW.binding,NEW.evidence_text);
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_reopening_context_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_reopening_context
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_reopening_context();

CREATE FUNCTION app_private.guard_financial_reset_checked_open() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x app_private.financial_reset_reopening_context%ROWTYPE;
BEGIN
 IF OLD.status<>'frozen' OR NEW.status<>'open' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=OLD.organization_id)
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations WHERE organization_id=OLD.organization_id) THEN RETURN NEW; END IF;
 SELECT * INTO x FROM app_private.financial_reset_reopening_context WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND organization_id=OLD.organization_id AND NOT consumed;
 IF FOUND THEN
  IF NEW.generation IS DISTINCT FROM OLD.generation OR NEW.financial_start_date IS DISTINCT FROM OLD.financial_start_date THEN
   RAISE EXCEPTION 'financial_reset_reopening_control_changed' USING ERRCODE='23514';
  END IF;
  PERFORM app_private.assert_financial_reset_reopening_ready(x.binding,x.evidence_text);
  UPDATE app_private.financial_reset_reopening_context SET consumed=true WHERE backend_pid=pg_backend_pid();
  RETURN NEW;
 END IF;
 -- Existing checked phases temporarily open under their exact execution
 -- transaction. A new unconditional deferred obligation forces re-freeze.
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_operations o WHERE o.organization_id=OLD.organization_id
  AND o.target_generation=OLD.generation AND o.status='actions_complete' AND o.execution_backend=pg_backend_pid()
  AND o.execution_xid=pg_current_xact_id() AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c WHERE c.operation_id=o.operation_id)) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'financial_reset_checked_reopening_required' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER financial_write_control_checked_open BEFORE UPDATE ON app_private.financial_write_controls
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_checked_open();

CREATE FUNCTION app_private.record_financial_reset_checked_open() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x app_private.financial_reset_reopening_context%ROWTYPE; a app_private.financial_reset_actor_authorizations%ROWTYPE; r jsonb; v_result jsonb;
BEGIN
 IF OLD.status<>'frozen' OR NEW.status<>'open' THEN RETURN NULL; END IF;
 SELECT * INTO x FROM app_private.financial_reset_reopening_context WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND organization_id=NEW.organization_id AND consumed;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND action='reopen' AND binding=x.binding AND consumed_at IS NOT NULL;
 PERFORM app_private.assert_financial_reset_hosted_actor_context(x.binding,'reopen');
 r:=x.binding->'reopening';
 v_result:=jsonb_build_object('version',1,'operation_id',x.operation_id,'organization_id',NEW.organization_id,'request_id',r->'request_id',
  'generation',NEW.generation,'cutoff',NEW.financial_start_date,'checkpoint_sha256',r->'checkpoint_sha256','after_sha256',r->'after_sha256',
  'evidence_sha256',r->'evidence_sha256','review_sha256',r->'review_sha256','authorization_id',a.authorization_id,
  'actor_id',a.actor_id,'session_id',a.session_id,'opened_at',NEW.updated_at,'status','open');
 INSERT INTO app_private.financial_reset_reopening_receipts(operation_id,organization_id,request_id,generation,cutoff,binding,binding_sha256,
  evidence_text,evidence_sha256,checkpoint_sha256,after_sha256,authorization_id,actor_id,session_id,backend_pid,transaction_id,opened_at,result_json,result_sha256)
 VALUES(x.operation_id,NEW.organization_id,(r->>'request_id')::uuid,NEW.generation,NEW.financial_start_date,x.binding,app_private.financial_reset_hash(x.binding),
  x.evidence_text,r->>'evidence_sha256',r->>'checkpoint_sha256',r->>'after_sha256',a.authorization_id,a.actor_id,a.session_id,
  pg_backend_pid(),pg_current_xact_id(),NEW.updated_at,v_result,app_private.financial_reset_hash(v_result));
 RETURN NULL;
END;
$$;
CREATE TRIGGER financial_write_control_checked_open_receipt AFTER UPDATE ON app_private.financial_write_controls
 FOR EACH ROW EXECUTE FUNCTION app_private.record_financial_reset_checked_open();

CREATE FUNCTION app_private.guard_financial_reset_reopening_receipt() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514'; END IF;
 IF pg_trigger_depth()<2 OR NEW.backend_pid<>pg_backend_pid() OR NEW.transaction_id<>pg_current_xact_id()
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_context x WHERE x.backend_pid=NEW.backend_pid
   AND x.transaction_id=NEW.transaction_id AND x.operation_id=NEW.operation_id AND x.organization_id=NEW.organization_id
   AND x.binding=NEW.binding AND x.evidence_text=NEW.evidence_text AND x.consumed)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls w WHERE w.organization_id=NEW.organization_id
   AND w.generation=NEW.generation AND w.financial_start_date=NEW.cutoff AND w.status='open' AND w.updated_at=NEW.opened_at) THEN
  RAISE EXCEPTION 'financial_reset_reopening_actual_transition_required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_reopening_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_reopening_receipts
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_reopening_receipt();
CREATE TRIGGER financial_reset_reopening_receipt_no_truncate BEFORE TRUNCATE ON app_private.financial_reset_reopening_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.assert_financial_reset_reopening_commit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r app_private.financial_reset_reopening_receipts%ROWTYPE;
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'financial_reset_reopening_context_must_close' USING ERRCODE='23514';
 END IF;
 FOR r IN SELECT * FROM app_private.financial_reset_reopening_receipts WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() LOOP
  PERFORM app_private.assert_financial_reset_hosted_actor_context(r.binding,'reopen');
  -- The reviewed authority may expire before the genuine actor locator does.
  -- Check the immutable opening evidence again at the deferred boundary.
  IF r.binding->'version'='2'::jsonb AND
   coalesce((r.evidence_text::jsonb->'authority_receipt'->>'expiresAt')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() THEN
   RAISE EXCEPTION 'financial_reset_reopening_no_backup_authority_expired_before_commit' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls w WHERE w.organization_id=r.organization_id AND w.status='open'
   AND w.generation=r.generation AND w.financial_start_date=r.cutoff AND w.updated_at=r.opened_at)
   OR app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(r.organization_id)) IS DISTINCT FROM r.after_sha256
   OR app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(r.organization_id)) IS DISTINCT FROM r.binding->'reopening'->>'foreign_sha256' THEN
   RAISE EXCEPTION 'financial_reset_reopening_changed_before_commit' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='financial_write_controls' THEN
  IF OLD.status='frozen' AND NEW.status='open'
   AND (EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=NEW.organization_id)
    OR EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations WHERE organization_id=NEW.organization_id))
   AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE organization_id=NEW.organization_id
    AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id())
   AND NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=NEW.organization_id AND status='frozen') THEN
   RAISE EXCEPTION 'financial_reset_temporary_open_must_commit_frozen' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_checked_open_commit AFTER UPDATE ON app_private.financial_write_controls
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_reopening_commit();
CREATE CONSTRAINT TRIGGER financial_reset_reopening_receipt_commit AFTER INSERT ON app_private.financial_reset_reopening_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_reopening_commit();
CREATE CONSTRAINT TRIGGER financial_reset_reopening_context_commit AFTER INSERT OR UPDATE ON app_private.financial_reset_reopening_context
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_reopening_commit();

CREATE FUNCTION app_private.reopen_financial_reset_checked(p_binding jsonb,p_evidence_text text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_operation uuid; v_result jsonb;
BEGIN
 PERFORM app_private.assert_financial_reset_reopening_ready(p_binding,p_evidence_text);
 v_operation:=(p_binding->'reopening'->>'operation_id')::uuid;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE operation_id=v_operation) THEN
  RAISE EXCEPTION 'financial_reset_reopening_existing_attempt_reconcile_required' USING ERRCODE='55000';
 END IF;
 INSERT INTO app_private.financial_reset_reopening_context(backend_pid,transaction_id,operation_id,organization_id,binding,evidence_text)
 VALUES(pg_backend_pid(),pg_current_xact_id(),v_operation,(p_binding->>'organization_id')::uuid,p_binding,p_evidence_text);
 UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(p_binding->>'organization_id')::uuid;
 SELECT result_json INTO STRICT v_result FROM app_private.financial_reset_reopening_receipts WHERE operation_id=v_operation
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 DELETE FROM app_private.financial_reset_reopening_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 RETURN v_result;
END;
$$;

-- Reusing existing row-seal triggers also prevents early SET CONSTRAINTS from
-- permitting normal entries later in the opening transaction. They begin only
-- after the separate reopening receipt itself has committed.
DO $seal$
DECLARE d text; b text; a text:=E' IF EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c';
BEGIN
 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO STRICT d,b
 FROM pg_proc WHERE oid='app_private.guard_financial_reset_checkpoint_row()'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'cc6268601705e02af4a11da7c4a2e39194c1061cee56c12beb86e8d90c8893df'
  OR (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_reopening_seal_predecessor_changed'; END IF;
 EXECUTE replace(d,b,replace(b,a,E' IF EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts r\n  WHERE r.backend_pid=pg_backend_pid() AND r.transaction_id=pg_current_xact_id()\n   AND r.organization_id::text IN (v_before->>v_column,v_after->>v_column)) THEN\n  RAISE EXCEPTION ''financial_reset_reopening_transaction_sealed'' USING ERRCODE=''23514'';\n END IF;\n'||a));
END;
$seal$;
REVOKE ALL ON FUNCTION app_private.assert_financial_reset_reopening_binding(jsonb),app_private.assert_financial_reset_reopening_ready(jsonb,text),
 app_private.guard_financial_reset_reopening_context(),app_private.guard_financial_reset_checked_open(),app_private.record_financial_reset_checked_open(),
 app_private.guard_financial_reset_reopening_receipt(),app_private.assert_financial_reset_reopening_commit(),app_private.reopen_financial_reset_checked(jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
