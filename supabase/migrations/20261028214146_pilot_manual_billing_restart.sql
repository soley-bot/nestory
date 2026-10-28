-- One reviewed restart of the completed Pilot October empty-books operation.
-- This migration enrolls/reopens no organization and generates no invoice.
BEGIN;

ALTER TABLE app_private.financial_write_controls
 ADD COLUMN automatic_rent_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE app_private.financial_reset_manual_restart_receipts (
 operation_id uuid PRIMARY KEY REFERENCES app_private.financial_reset_operations(operation_id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
 generation integer NOT NULL CHECK (generation=1),
 financial_start_date date NOT NULL CHECK (financial_start_date=DATE '2026-10-01'),
 checkpoint_sha256 text NOT NULL CHECK (checkpoint_sha256 ~ '^[a-f0-9]{64}$'),
 after_sha256 text NOT NULL CHECK (after_sha256 ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,
 credential_expires_at timestamptz NOT NULL,
 backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid),
 CHECK (organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid)
);
ALTER TABLE app_private.financial_reset_manual_restart_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.financial_reset_manual_restart_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Same actual gateway/session boundary as the native reset approval. No actor
-- parameter, service-role substitution, invented claims or database-owner RPC.
CREATE FUNCTION app_private.pilot_manual_restart_actor() RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid:=(SELECT auth.uid()); j jsonb:=(SELECT auth.jwt()); s uuid;
 p constant uuid:='752a87b8-bd04-4a45-9cb8-00687af66e73';
BEGIN
 IF session_user IS DISTINCT FROM 'authenticator' OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
  OR a IS NULL OR j->>'sub' IS DISTINCT FROM a::text OR j->>'role' IS DISTINCT FROM 'authenticated'
  OR j->>'aud' IS DISTINCT FROM 'authenticated' OR j->'is_anonymous' IS DISTINCT FROM 'false'::jsonb
  OR coalesce(j->>'session_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR coalesce(j->>'exp','') !~ '^[0-9]{1,12}$' THEN
  RAISE EXCEPTION 'pilot_manual_restart_session_required' USING ERRCODE='42501';
 END IF;
 s:=(j->>'session_id')::uuid;
 IF to_timestamp((j->>'exp')::double precision)<=clock_timestamp()
  OR app_private.financial_reset_actor_is_current(p,a,s) IS DISTINCT FROM true
  OR app_private.has_org_permission(p,'finance.correct_records') IS DISTINCT FROM true
  OR app_private.has_org_permission(p,'finance.close_periods') IS DISTINCT FROM true
  OR app_private.has_org_permission(p,'leases.change_terms') IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans c
   WHERE c.operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid AND c.organization_id=p
    AND c.status='complete' AND c.plan_json->'version'='4'::jsonb AND c.plan_json->>'actor_id'=a::text) THEN
  RAISE EXCEPTION 'pilot_manual_restart_named_actor_required' USING ERRCODE='42501';
 END IF;
 RETURN a;
END;
$$;

CREATE FUNCTION app_private.assert_pilot_manual_restart_ready(p_operation uuid,p_generation integer,p_checkpoint text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.financial_reset_operations%ROWTYPE;
 c app_private.financial_reset_verification_checkpoints%ROWTYPE;
 w app_private.financial_write_controls%ROWTYPE; p app_private.financial_reset_continuation_plans%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM app_private.assert_financial_reset_checkpoint_coverage();
 IF p_operation IS DISTINCT FROM '7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid OR p_generation IS DISTINCT FROM 1
  OR coalesce(p_checkpoint,'') !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'pilot_manual_restart_review_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO o FROM app_private.financial_reset_operations WHERE operation_id=p_operation;
 SELECT * INTO c FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_operation;
 SELECT * INTO w FROM app_private.financial_write_controls WHERE organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73';
 SELECT * INTO p FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation;
 IF o.organization_id IS DISTINCT FROM w.organization_id OR w.organization_id IS NULL
  OR w.status IS DISTINCT FROM 'frozen' OR w.generation IS DISTINCT FROM p_generation
  OR w.financial_start_date IS DISTINCT FROM DATE '2026-10-01'
  OR o.operation_kind IS DISTINCT FROM 'reset' OR o.status IS DISTINCT FROM 'actions_complete' OR o.completed_at IS NULL
  OR o.target_generation IS DISTINCT FROM p_generation OR o.execution_xid IS NULL OR o.execution_xid=pg_current_xact_id()
  OR c.organization_id IS DISTINCT FROM o.organization_id OR c.generation IS DISTINCT FROM p_generation
  OR c.checkpoint_kind IS DISTINCT FROM 'checked-reports' OR c.execution_xid IS DISTINCT FROM o.execution_xid
  OR c.execution_backend IS DISTINCT FROM o.execution_backend OR c.checkpoint_sha256 IS DISTINCT FROM p_checkpoint
  OR c.checkpoint_sha256 IS DISTINCT FROM app_private.financial_reset_hash(c.result_json)
  OR c.result_json->'empty_books' IS DISTINCT FROM 'true'::jsonb
  OR c.result_json->'contracts_unchanged' IS DISTINCT FROM 'true'::jsonb
  OR c.result_json->'billing_paused' IS DISTINCT FROM 'true'::jsonb
  OR c.result_json->'control_reopened' IS DISTINCT FROM 'false'::jsonb
  OR p.status IS DISTINCT FROM 'complete' OR p.organization_id IS DISTINCT FROM o.organization_id
  OR p.plan_json->'version' IS DISTINCT FROM '4'::jsonb OR p.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p.plan_json)
  OR o.action_count<=0 OR (SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NOT NULL)<>o.action_count
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE organization_id=o.organization_id)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=p_operation
   AND z.organization_id=o.organization_id AND z.status='complete' AND z.execution_xid=c.execution_xid AND z.execution_backend=c.execution_backend)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations a WHERE a.operation_id=p_operation
   AND a.action='execute' AND a.consumed_at IS NOT NULL AND a.transaction_id=c.execution_xid AND a.backend_pid=c.execution_backend
   AND a.actor_id::text=p.plan_json->>'actor_id' AND a.binding->'continuation_semantic'->'version'='4'::jsonb) THEN
  RAISE EXCEPTION 'pilot_manual_restart_completed_checkpoint_required' USING ERRCODE='55000';
 END IF;
 IF c.after_images IS DISTINCT FROM app_private.financial_reset_continuation_snapshot(o.organization_id)
  OR c.result_json->>'after_sha256' IS DISTINCT FROM app_private.financial_reset_hash(c.after_images) THEN
  RAISE EXCEPTION 'pilot_manual_restart_source_changed' USING ERRCODE='40001';
 END IF;
 PERFORM app_private.assert_financial_reset_empty_contracts(o.organization_id,p.plan_json-'source_sha256');
 PERFORM app_private.assert_financial_reset_empty_sources(p_operation,true);
END;
$$;

CREATE FUNCTION app_private.guard_pilot_manual_restart_receipt() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid; j jsonb:=(SELECT auth.jwt());
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'financial_reset_evidence_immutable' USING ERRCODE='23514'; END IF;
 a:=app_private.pilot_manual_restart_actor();
 IF NEW.actor_id IS DISTINCT FROM a OR NEW.session_id::text IS DISTINCT FROM j->>'session_id'
  OR NEW.credential_expires_at IS DISTINCT FROM to_timestamp((j->>'exp')::double precision)
  OR NEW.backend_pid IS DISTINCT FROM pg_backend_pid() OR NEW.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR NEW.recorded_at>clock_timestamp() OR NEW.credential_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'pilot_manual_restart_receipt_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_pilot_manual_restart_ready(NEW.operation_id,NEW.generation,NEW.checkpoint_sha256);
 IF NEW.after_sha256 IS DISTINCT FROM (SELECT result_json->>'after_sha256' FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=NEW.operation_id) THEN
  RAISE EXCEPTION 'pilot_manual_restart_receipt_invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_manual_restart_receipt_guard BEFORE INSERT OR UPDATE OR DELETE
 ON app_private.financial_reset_manual_restart_receipts FOR EACH ROW EXECUTE FUNCTION app_private.guard_pilot_manual_restart_receipt();
CREATE TRIGGER financial_reset_manual_restart_no_truncate BEFORE TRUNCATE
 ON app_private.financial_reset_manual_restart_receipts FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.assert_pilot_manual_restart_commit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r app_private.financial_reset_manual_restart_receipts%ROWTYPE;
BEGIN
 FOR r IN SELECT * FROM app_private.financial_reset_manual_restart_receipts
  WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() LOOP
  IF r.actor_id IS DISTINCT FROM app_private.pilot_manual_restart_actor() OR r.credential_expires_at<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls w WHERE w.organization_id=r.organization_id
    AND w.generation=r.generation AND w.financial_start_date=r.financial_start_date AND w.status='open' AND NOT w.automatic_rent_enabled)
   OR (TG_TABLE_NAME='financial_reset_manual_restart_receipts'
    AND app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(r.organization_id)) IS DISTINCT FROM r.after_sha256) THEN
   RAISE EXCEPTION 'pilot_manual_restart_commit_changed' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_manual_restart_receipt_commit AFTER INSERT
 ON app_private.financial_reset_manual_restart_receipts DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app_private.assert_pilot_manual_restart_commit();
CREATE CONSTRAINT TRIGGER financial_reset_manual_restart_control_commit AFTER UPDATE
 ON app_private.financial_write_controls DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app_private.assert_pilot_manual_restart_commit();

-- Extend existing boundaries only for this separately approved, transaction-bound
-- immutable receipt. The older v4 reopening rejection remains unchanged.
DO $boundaries$
DECLARE d text; a text; b text;
BEGIN
 d:=replace(pg_get_functiondef('app_private.guard_financial_reset_checked_open()'::regprocedure),E'\r\n',E'\n');
 a:=$a$ IF OLD.status<>'frozen' OR NEW.status<>'open' THEN RETURN NEW; END IF;$a$;
 b:=a||$b$
 IF NEW.generation=OLD.generation AND NEW.financial_start_date=OLD.financial_start_date AND NOT NEW.automatic_rent_enabled
  AND EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts r WHERE r.organization_id=NEW.organization_id
   AND r.generation=NEW.generation AND r.financial_start_date=NEW.financial_start_date
   AND r.backend_pid=pg_backend_pid() AND r.transaction_id=pg_current_xact_id()) THEN RETURN NEW; END IF;
$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_restart_open_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 d:=replace(pg_get_functiondef('app_private.assert_financial_reset_reopening_commit()'::regprocedure),E'\r\n',E'\n');
 a:=$a$   AND NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=NEW.organization_id AND status='frozen') THEN$a$;
 b:=$b$   AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts WHERE organization_id=NEW.organization_id
    AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id())
$b$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_restart_commit_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 d:=replace(pg_get_functiondef('app_private.guard_financial_reset_checkpoint_row()'::regprocedure),E'\r\n',E'\n');
 a:=$a$ IF EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c$a$;
 b:=$b$ IF EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts r
  WHERE r.backend_pid=pg_backend_pid() AND r.transaction_id=pg_current_xact_id()
   AND r.organization_id::text IN (v_before->>v_column,v_after->>v_column)) THEN
  RAISE EXCEPTION 'pilot_manual_restart_transaction_sealed' USING ERRCODE='23514';
 END IF;
$b$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_restart_seal_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
END;
$boundaries$;

CREATE FUNCTION app_private.guard_automatic_rent_policy() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT NEW.automatic_rent_enabled THEN RAISE EXCEPTION 'automatic_rent_policy_restart_required' USING ERRCODE='42501'; END IF;
 ELSIF NEW.automatic_rent_enabled IS DISTINCT FROM OLD.automatic_rent_enabled THEN
  IF NOT OLD.automatic_rent_enabled OR NEW.automatic_rent_enabled OR OLD.status<>'frozen' OR NEW.status<>'open'
   OR NEW.generation<>OLD.generation OR NEW.financial_start_date<>OLD.financial_start_date
   OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts r WHERE r.organization_id=NEW.organization_id
    AND r.backend_pid=pg_backend_pid() AND r.transaction_id=pg_current_xact_id()) THEN
   RAISE EXCEPTION 'automatic_rent_policy_restart_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_write_control_rent_policy_guard BEFORE INSERT OR UPDATE
 ON app_private.financial_write_controls FOR EACH ROW EXECUTE FUNCTION app_private.guard_automatic_rent_policy();

DO $manual_rent$
DECLARE d text; a text; b text;
BEGIN
 -- All automatic rent callers (cron, lease/term/rule catch-up, approved-policy
 -- catch-up) enter here. Explicit manual recovery uses the checked generator.
 d:=replace(pg_get_functiondef('app_private.try_current_month_rent(uuid,uuid,text,timestamptz)'::regprocedure),E'\r\n',E'\n');
 a:=E'BEGIN\n';
 b:=a||$b$  PERFORM app_private.assert_financial_lifecycle_isolation();
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('financial_write_lifecycle_v1:'||p_organization_id::text,0));
  IF EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=p_organization_id AND NOT automatic_rent_enabled) THEN
    RETURN jsonb_build_object('status','skipped','reason','manual_billing');
  END IF;
$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_generator_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 d:=replace(pg_get_functiondef('public.recover_lease_rent_period(uuid,uuid,date)'::regprocedure),E'\r\n',E'\n');
 a:='  v_current_period date;';
 b:=a||E'\n  v_result jsonb; v_property_id uuid; v_rule_id uuid;';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_declarations_changed'; END IF;
 d:=replace(d,a,b);
 a:='    OR NOT app_private.is_super_admin(p_organization_id) THEN';
 b:=$b$    OR (NOT app_private.is_super_admin(p_organization_id) AND NOT EXISTS(
      SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=p_organization_id AND NOT automatic_rent_enabled)) THEN$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_actor_anchor_changed'; END IF;
 d:=replace(d,a,b);
 a:='  IF p_billing_period_start >= v_current_period THEN';
 b:=$b$  IF NOT app_private.is_super_admin(p_organization_id) AND p_billing_period_start<>v_current_period THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_billing_period_start > v_current_period OR (p_billing_period_start = v_current_period AND NOT EXISTS(
    SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=p_organization_id AND NOT automatic_rent_enabled)) THEN$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_period_anchor_changed'; END IF;
 d:=replace(d,a,b);
 a:='  -- The private generator locks and keys by lease plus billing month. Repeating';
 b:=$b$  -- Current-month manual entry uses the same property-bound delegated
  -- authority and selected billing rule as the existing exception retry.
  IF NOT app_private.is_super_admin(p_organization_id) THEN
    SELECT property_id INTO v_property_id FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id;
    IF v_property_id IS NULL OR app_private.can_access_property(p_organization_id,v_property_id,'finance.record_payments') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
    END IF;
    PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.record_payments');
    BEGIN
      SELECT billing_term_id,business_date INTO v_rule_id,v_business_date
      FROM app_private.resolve_lease_billing_clock(p_organization_id,p_lease_id,pg_catalog.now());
      IF v_business_date IS NULL OR date_trunc('month',v_business_date)::date IS DISTINCT FROM p_billing_period_start THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
      END IF;
      v_result:=app_private.try_generate_lease_rent_invoice(p_organization_id,p_lease_id,p_billing_period_start,
        v_business_date,'manual_recovery',v_actor_id,v_rule_id);
    EXCEPTION WHEN OTHERS THEN
      PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
      RAISE;
    END;
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
    RETURN v_result;
  END IF;
$b$||a;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_generator_call_changed'; END IF;
 EXECUTE replace(d,a,b);
 -- An explicit first manual invoice has no exception to retry. Preserve the
 -- existing actor, current clock, rule and property authority checks, allowing
 -- only the checked manual-policy path to omit that old exception requirement.
 d:=replace(pg_get_functiondef('app_private.is_checked_current_rent_retry_generation(uuid,uuid,date,date,text,uuid)'::regprocedure),E'\r\n',E'\n');
 a:=$a$    AND EXISTS (
      SELECT 1
      FROM public.rent_generation_exceptions AS exception
      WHERE exception.organization_id = p_organization_id
        AND exception.lease_id = p_lease_id
        AND exception.billing_period_start = p_billing_period_start
        AND exception.resolved_at IS NULL
    );$a$;
 b:=$b$    AND ((EXISTS(SELECT 1 FROM app_private.financial_write_controls
       WHERE organization_id=p_organization_id AND NOT automatic_rent_enabled)
      AND app_private.has_finance_branch_authority_context(p_organization_id,'finance.record_payments')) OR EXISTS (
      SELECT 1
      FROM public.rent_generation_exceptions AS exception
      WHERE exception.organization_id = p_organization_id
        AND exception.lease_id = p_lease_id
        AND exception.billing_period_start = p_billing_period_start
        AND exception.resolved_at IS NULL
    ));$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_exception_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
 d:=replace(pg_get_functiondef('public.get_financial_write_context(uuid)'::regprocedure),E'\r\n',E'\n');
 a:=$a$'financial_start_date',v_control.financial_start_date,'enforced',true$a$;
 b:=$b$'financial_start_date',v_control.financial_start_date,'enforced',true,'automatic_rent_enabled',v_control.automatic_rent_enabled$b$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'pilot_manual_rent_context_anchor_changed'; END IF;
 EXECUTE replace(d,a,b);
END;
$manual_rent$;

CREATE FUNCTION public.get_pilot_manual_restart_status() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='30s' SET lock_timeout='8s' AS $$
DECLARE p constant uuid:='752a87b8-bd04-4a45-9cb8-00687af66e73'; o constant uuid:='7c70e27f-ba37-48cc-8f93-d32badcb2fb7';
 w app_private.financial_write_controls%ROWTYPE; h text; v_status text:='not_ready'; v_reason text;
BEGIN
 PERFORM app_private.pilot_manual_restart_actor();
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('financial_write_lifecycle_v1:'||p::text,0));
 SELECT * INTO w FROM app_private.financial_write_controls WHERE organization_id=p;
 SELECT checkpoint_sha256 INTO h FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=o;
 IF w.status='open' AND NOT w.automatic_rent_enabled AND EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts
  WHERE operation_id=o AND organization_id=w.organization_id AND generation=w.generation AND financial_start_date=w.financial_start_date) THEN
  v_status:='already_open';
 ELSE
  BEGIN
   PERFORM app_private.assert_pilot_manual_restart_ready(o,w.generation,h);
   v_status:='ready';
  EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE '55000' OR SQLSTATE '23514' THEN
   v_reason:='The completed reset baseline no longer matches. Operator review is required.';
  END;
 END IF;
 RETURN jsonb_build_object('eligible',v_status='ready','status',v_status,'operation_id',o,'generation',w.generation,
  'checkpoint_sha256',h,'financial_start_date',w.financial_start_date,'billing_mode',CASE WHEN NOT w.automatic_rent_enabled THEN 'manual' ELSE 'paused' END,
  'preserved_counts',jsonb_build_object('properties',(SELECT count(*) FROM public.properties WHERE organization_id=p),
   'units',(SELECT count(*) FROM public.units WHERE organization_id=p),'people',(SELECT count(*) FROM public.people WHERE organization_id=p),
   'leases',(SELECT count(*) FROM public.leases WHERE organization_id=p)),'reason',v_reason);
END;
$$;

CREATE FUNCTION public.restart_pilot_manual_billing(p_operation_id uuid,p_expected_generation integer,p_expected_checkpoint_sha256 text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='30s' SET lock_timeout='8s' AS $$
DECLARE p constant uuid:='752a87b8-bd04-4a45-9cb8-00687af66e73'; a uuid; j jsonb:=(SELECT auth.jwt());
 r app_private.financial_reset_manual_restart_receipts%ROWTYPE;
BEGIN
 a:=app_private.pilot_manual_restart_actor();
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||p::text,0));
 -- Keep revocation, membership and sparse step-up policy stable through commit.
 LOCK TABLE app_private.privileged_email_step_up_policies IN SHARE MODE;
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  JOIN public.organization_members m ON m.user_id=u.id AND m.organization_id=p
  WHERE s.id=(j->>'session_id')::uuid AND s.user_id=a FOR SHARE OF s,u,m;
 PERFORM 1 FROM app_private.privileged_email_step_up_grants g WHERE g.organization_id=p
  AND g.user_id=a AND g.session_id=(j->>'session_id')::uuid FOR SHARE;
 a:=app_private.pilot_manual_restart_actor();
 IF p_operation_id IS DISTINCT FROM '7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid OR p_expected_generation IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'pilot_manual_restart_review_changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO r FROM app_private.financial_reset_manual_restart_receipts WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF r.checkpoint_sha256 IS DISTINCT FROM p_expected_checkpoint_sha256 OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls
   WHERE organization_id=p AND status='open' AND generation=r.generation AND financial_start_date=r.financial_start_date AND NOT automatic_rent_enabled) THEN
   RAISE EXCEPTION 'pilot_manual_restart_existing_receipt_changed' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('status','already_open','billing_mode','manual','generation',r.generation,'operation_id',r.operation_id,
   'financial_start_date',r.financial_start_date,'checkpoint_sha256',r.checkpoint_sha256,'receipt_recorded_at',r.recorded_at);
 END IF;
 -- The mandatory BEFORE INSERT receipt guard validates the complete baseline
 -- once. Repeating that same full snapshot here would only spend gateway time.
 INSERT INTO app_private.financial_reset_manual_restart_receipts(operation_id,organization_id,generation,financial_start_date,
  checkpoint_sha256,after_sha256,actor_id,session_id,credential_expires_at,backend_pid,transaction_id)
 SELECT p_operation_id,p,1,'2026-10-01',p_expected_checkpoint_sha256,c.result_json->>'after_sha256',a,(j->>'session_id')::uuid,
  to_timestamp((j->>'exp')::double precision),pg_backend_pid(),pg_current_xact_id()
 FROM app_private.financial_reset_verification_checkpoints c WHERE c.operation_id=p_operation_id RETURNING * INTO STRICT r;
 UPDATE app_private.financial_write_controls SET status='open',automatic_rent_enabled=false WHERE organization_id=p;
 RETURN jsonb_build_object('status','open','billing_mode','manual','generation',r.generation,'operation_id',r.operation_id,
  'financial_start_date',r.financial_start_date,'checkpoint_sha256',r.checkpoint_sha256,'receipt_recorded_at',r.recorded_at);
END;
$$;

REVOKE ALL ON FUNCTION app_private.pilot_manual_restart_actor(),app_private.assert_pilot_manual_restart_ready(uuid,integer,text),
 app_private.guard_pilot_manual_restart_receipt(),app_private.assert_pilot_manual_restart_commit(),app_private.guard_automatic_rent_policy()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_pilot_manual_restart_status(),public.restart_pilot_manual_billing(uuid,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pilot_manual_restart_status(),public.restart_pilot_manual_billing(uuid,integer,text) TO authenticated;

COMMENT ON FUNCTION public.restart_pilot_manual_billing(uuid,integer,text) IS
 'One genuine named-admin restart of the completed Pilot October empty baseline; opens normal entries with automatic rent permanently disabled and creates no financial records.';
COMMIT;
