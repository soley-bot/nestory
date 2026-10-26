-- Local-reviewed integration only. No organization, user, session or policy is
-- created or changed. The private operator carries a consumed genuine-session
-- authorization; maker/reviewer identity comes only from their own immutable
-- gateway endorsements. Request claims are never switched by this migration.
BEGIN;

-- Hashes are from the independently inspected 249-migration local baseline.
-- Pin permission helpers as well as the commands: the explicit-actor adapter
-- must not silently diverge from a future change in ordinary authorization.
DO $pins$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.apply_financial_reset_known_zero(uuid)','697f47677a7c818e636bd1d31784e0ded80ae5ce0a4fca003fb93a14e09f46fa'),
  ('app_private.assert_financial_reset_archived_zero_context(app_private.financial_reset_archived_zero_command_context)','531a047f303dca532055c6795da18192ec9fc309131dedd6425115badad2081d'),
  ('app_private.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)','779be24fcf7dc82128ce49775408aadeb8882c722d9ecec55401343962b5473e'),
  ('app_private.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text)','4a81d5661f3c9f2596f46f4193339bc45aeba446746ebaca0a3d6556a584e1c8'),
  ('public.approve_financial_reset_zero_plan(uuid,text)','9d79fc6491c1e35a11216e28ff6624d48f1c72e2955d8c47a81fe347a87091b1'),
  ('app_private.has_org_permission(uuid,public.organization_permission_key)','b74a848e7b11362210ba48325f41c48ab4aea1b0138c79e5605e6f04178d40be'),
  ('app_private.can_access_property(uuid,uuid,public.organization_permission_key)','f4f43ce00c0af9d4e4c0ea5ab9d99d1dd5ae0df69551980f2b0419d32a98804e'),
  ('app_private.current_active_branch_id(uuid)','35ad393db1ddbc5ec88e75f2fd4e1f2aace5fb51b406e6eac9d0f89125f59eaf'),
  ('app_private.is_super_admin(uuid)','488bb5dc8355c43170d3dc96b779dc705ad097405d0390b6cdfaa500a5218089'),
  ('app_private.current_workspace_role(uuid)','64655fe523c72a9fd769b42783b9130c95e4d819c0242447b0e183469261d4ea'),
  ('app_private.can_submit_owner_opening_balance(uuid)','87ef726ef4747000c7f7977f0fce9442f201752da69779d91867b89460e0e789'),
  ('app_private.can_review_owner_opening_balance(uuid)','a0ee70c417ef75f86a31472ffcf02399ed95330314765f161bf004aa6590f8a0')
 ) p(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')<>r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_scoped_zero_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
END;
$pins$;

CREATE TABLE app_private.financial_reset_zero_session_endorsements (
 endorsement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 approval_kind text NOT NULL CHECK(approval_kind IN ('maker','reviewer')),
 endorsement_number integer NOT NULL CHECK(endorsement_number>0),
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 credential_expires_at timestamptz NOT NULL,
 endorsed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,approval_kind,endorsement_number),
 FOREIGN KEY(operation_id,approval_kind) REFERENCES app_private.financial_reset_zero_approvals(operation_id,approval_kind) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK(credential_expires_at>endorsed_at)
);
ALTER TABLE app_private.financial_reset_zero_session_endorsements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_zero_session_endorsements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_zero_session_endorsement_immutable BEFORE UPDATE OR DELETE
 ON app_private.financial_reset_zero_session_endorsements FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

-- This resolver does not accept an actor, session, claims or capability token.
-- Phase adapters must additionally bind their exact command scope and arguments.
CREATE FUNCTION app_private.assert_financial_reset_scoped_operator(p_operation uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a app_private.financial_reset_actor_authorizations%ROWTYPE;
 o app_private.financial_reset_operations%ROWTYPE; c jsonb;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 IF (SELECT auth.uid()) IS NOT NULL THEN
  RAISE EXCEPTION 'financial_reset_claim_free_operator_required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO a FROM app_private.financial_reset_actor_authorizations
 WHERE operation_id=p_operation AND action='execute' AND consumed_at IS NOT NULL
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_scoped_operator_required' USING ERRCODE='42501'; END IF;
 c:=app_private.assert_financial_reset_hosted_actor_context(a.binding,'execute');
 SELECT * INTO o FROM app_private.financial_reset_operations WHERE operation_id=p_operation FOR SHARE;
 IF NOT FOUND OR o.operation_kind IS DISTINCT FROM 'reset'
  OR a.authorization_id::text IS DISTINCT FROM c->>'authorizationId' OR a.actor_id::text IS DISTINCT FROM c->>'actorId'
  OR a.organization_id IS DISTINCT FROM o.organization_id OR a.binding->>'operation_id' IS DISTINCT FROM o.operation_id::text
  OR a.binding->>'organization_id' IS DISTINCT FROM o.organization_id::text
  OR a.binding->>'source_generation' IS DISTINCT FROM o.source_generation::text
  OR a.binding->>'target_generation' IS DISTINCT FROM o.target_generation::text
  OR a.binding->>'manifest_sha256' IS DISTINCT FROM o.manifest_sha256 OR a.binding->>'plan_sha256' IS DISTINCT FROM o.plan_sha256
  OR a.binding->>'schema_sha256' IS DISTINCT FROM o.schema_sha256 OR a.binding->>'archive_sha256' IS DISTINCT FROM o.archive_sha256
  OR a.binding->>'action_sha256' IS DISTINCT FROM o.action_sha256 OR a.binding->>'archive_count' IS DISTINCT FROM o.archive_count::text
  OR a.binding->>'action_count' IS DISTINCT FROM o.action_count::text
  OR o.database_name IS DISTINCT FROM current_database() OR o.database_oid IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname=current_database())
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=o.operation_id
   AND z.organization_id=o.organization_id AND z.review_sha256=a.binding->>'zero_review_sha256'
   AND z.review_sha256=app_private.financial_reset_hash(z.plan_json))
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls w WHERE w.organization_id=o.organization_id
   AND w.generation=o.target_generation AND w.financial_start_date::text=a.binding->>'cutoff') THEN
  RAISE EXCEPTION 'financial_reset_scoped_operator_binding_invalid' USING ERRCODE='42501';
 END IF;
 RETURN a.actor_id;
END;
$$;

-- Resolve current authority without taking write-conflicting locks so a
-- READ ONLY observer can classify stale endorsement evidence. Commands use the
-- locked assertion below; this resolver's result is not command authority.
-- The explicit permission expression is equivalent to can_access_property for
-- the endorsed actor; it preserves custom and legacy permissions and never uses
-- the operator's super_admin role for an approver.
CREATE FUNCTION app_private.financial_reset_zero_endorsement_actor(p_operation uuid,p_kind text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e app_private.financial_reset_zero_session_endorsements%ROWTYPE;
 a app_private.financial_reset_zero_approvals%ROWTYPE; z app_private.financial_reset_zero_plans%ROWTYPE;
 m public.organization_members%ROWTYPE; v_permission public.organization_permission_key; v_scope jsonb; v_allowed boolean;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('maker','reviewer') THEN RAISE EXCEPTION 'financial_reset_zero_endorsement_kind_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id=p_operation AND approval_kind=p_kind
 ORDER BY endorsement_number DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_session_endorsement_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT a FROM app_private.financial_reset_zero_approvals WHERE operation_id=p_operation AND approval_kind=p_kind;
 SELECT * INTO STRICT z FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation;
 IF e.organization_id IS DISTINCT FROM z.organization_id OR a.organization_id IS DISTINCT FROM z.organization_id
  OR e.review_sha256 IS DISTINCT FROM z.review_sha256 OR a.review_sha256 IS DISTINCT FROM z.review_sha256
  OR z.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(z.plan_json)
  OR e.actor_id IS DISTINCT FROM a.approved_by OR e.actor_id::text IS DISTINCT FROM z.plan_json->>(p_kind||'_actor_id')
  OR z.plan_json->>'maker_actor_id' IS NOT DISTINCT FROM z.plan_json->>'reviewer_actor_id' THEN
  RAISE EXCEPTION 'financial_reset_zero_session_endorsement_binding_invalid' USING ERRCODE='42501';
 END IF;
 SELECT * INTO m FROM public.organization_members WHERE organization_id=e.organization_id AND user_id=e.actor_id;
 IF m.user_id IS NULL OR e.credential_expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.id=e.session_id AND s.user_id=e.actor_id
   AND (s.not_after IS NULL OR s.not_after>clock_timestamp()) AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
  OR app_private.privileged_email_step_up_satisfied_for_actor(e.organization_id,e.actor_id,e.session_id) IS DISTINCT FROM true
  OR (coalesce((SELECT enforcement_enabled FROM app_private.privileged_email_step_up_policies WHERE organization_id=e.organization_id),false)
   AND app_private.user_requires_privileged_step_up(e.organization_id,e.actor_id)
   AND NOT EXISTS(SELECT 1 FROM app_private.privileged_email_step_up_grants WHERE organization_id=e.organization_id AND user_id=e.actor_id
    AND session_id=e.session_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))) THEN
  RAISE EXCEPTION 'financial_reset_zero_session_endorsement_stale' USING ERRCODE='42501';
 END IF;
 v_permission:=CASE p_kind WHEN 'maker' THEN 'finance.submit_expenses' ELSE 'finance.approve_expenses' END;
 FOR v_scope IN SELECT value FROM jsonb_array_elements(z.plan_json->'scopes') LOOP
  SELECT coalesce((m.role='super_admin' AND m.branch_id IS NULL AND m.person_id IS NULL) OR (
   EXISTS(SELECT 1 FROM public.properties p WHERE p.organization_id=e.organization_id AND p.id=(v_scope->>'property_id')::uuid)
   AND (
    (m.role IN ('finance_manager','finance_member','operations_manager','operations_member')
     AND EXISTS(SELECT 1 FROM public.organization_authorization_states s WHERE s.organization_id=e.organization_id AND NOT s.ordinary_access_enabled)
     AND app_private.legacy_role_has_permission(m.role,v_permission))
    OR (m.role='custom' AND m.branch_id IS NOT NULL AND m.custom_role_id IS NOT NULL
     AND EXISTS(SELECT 1 FROM public.organization_authorization_states s
      JOIN public.organization_branches b ON b.organization_id=s.organization_id AND b.id=m.branch_id AND b.status='active' AND b.archived_at IS NULL
      JOIN public.organization_roles r ON r.organization_id=s.organization_id AND r.id=m.custom_role_id AND r.status='active' AND r.archived_at IS NULL
      JOIN public.organization_role_permissions rp ON rp.organization_id=r.organization_id AND rp.role_id=r.id AND rp.permission_key=v_permission
      JOIN public.properties p ON p.organization_id=s.organization_id AND p.id=(v_scope->>'property_id')::uuid AND p.branch_id=b.id
      WHERE s.organization_id=e.organization_id AND s.ordinary_access_enabled))
   )),false) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'financial_reset_zero_endorsement_permission_changed' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN e.actor_id;
END;
$$;

-- These row/table locks keep renewal, signout, revocation, role/branch/permission
-- changes and the absent-policy enable race from invalidating command authority
-- before commit. The operation lock also stabilizes the newest endorsement.
CREATE FUNCTION app_private.assert_financial_reset_zero_endorsement(p_operation uuid,p_kind text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e app_private.financial_reset_zero_session_endorsements%ROWTYPE;
 m public.organization_members%ROWTYPE; v_plan jsonb; v_scope jsonb;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('maker','reviewer') THEN RAISE EXCEPTION 'financial_reset_zero_endorsement_kind_invalid' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM app_private.financial_reset_operations WHERE operation_id=p_operation FOR SHARE;
 SELECT * INTO e FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id=p_operation AND approval_kind=p_kind
 ORDER BY endorsement_number DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_session_endorsement_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app_private.financial_reset_zero_approvals WHERE operation_id=p_operation AND approval_kind=p_kind FOR SHARE;
 SELECT plan_json INTO STRICT v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation FOR SHARE;
 LOCK TABLE app_private.privileged_email_step_up_policies IN SHARE MODE;
 LOCK TABLE public.organization_authorization_states IN SHARE MODE;
 LOCK TABLE public.organization_role_permissions IN SHARE MODE;
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.id=e.session_id AND s.user_id=e.actor_id FOR SHARE OF s,u;
 SELECT * INTO m FROM public.organization_members WHERE organization_id=e.organization_id AND user_id=e.actor_id FOR SHARE;
 PERFORM 1 FROM public.organization_branches WHERE organization_id=e.organization_id AND id=m.branch_id FOR SHARE;
 PERFORM 1 FROM public.organization_roles WHERE organization_id=e.organization_id AND id=m.custom_role_id FOR SHARE;
 PERFORM 1 FROM app_private.privileged_email_step_up_grants WHERE organization_id=e.organization_id AND user_id=e.actor_id AND session_id=e.session_id FOR SHARE;
 FOR v_scope IN SELECT value FROM jsonb_array_elements(v_plan->'scopes') LOOP
  PERFORM 1 FROM public.properties WHERE organization_id=e.organization_id AND id=(v_scope->>'property_id')::uuid FOR SHARE;
  PERFORM 1 FROM public.organization_branches b JOIN public.properties p ON p.organization_id=b.organization_id AND p.branch_id=b.id
   WHERE p.organization_id=e.organization_id AND p.id=(v_scope->>'property_id')::uuid FOR SHARE OF b;
 END LOOP;
 RETURN app_private.financial_reset_zero_endorsement_actor(p_operation,p_kind);
END;
$$;

CREATE FUNCTION app_private.financial_reset_zero_endorsement_status(p_operation uuid,p_kind text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e app_private.financial_reset_zero_session_endorsements%ROWTYPE; v_status text; v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('maker','reviewer') THEN RAISE EXCEPTION 'financial_reset_zero_endorsement_kind_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id=p_operation AND approval_kind=p_kind
 ORDER BY endorsement_number DESC LIMIT 1;
 IF NOT FOUND THEN v_status:='missing';
 ELSIF e.credential_expires_at<=v_now THEN v_status:='expired';
 ELSE
  BEGIN
   PERFORM app_private.financial_reset_zero_endorsement_actor(p_operation,p_kind);
   v_status:='current';
  EXCEPTION WHEN SQLSTATE '42501' THEN v_status:='not-current';
  END;
 END IF;
 RETURN jsonb_build_object('status',v_status,'observedAt',v_now);
END;
$$;

-- The existing approval RPC retains its exact plan and permission checks. A
-- fresh gateway call may add evidence for an old approval, but its old timestamp
-- is never rewritten or presented as the new session's endorsement timestamp.
-- Renewals append a numbered session endorsement for the same approved actor and
-- plan. The operation row lock serializes renewals and prevents execution from
-- observing a partially endorsed replacement. Only the newest endorsement is
-- current; historical sessions cannot become a fallback after revocation.
CREATE OR REPLACE FUNCTION public.approve_financial_reset_zero_plan(p_operation_id uuid,p_review_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_plan app_private.financial_reset_zero_plans%ROWTYPE;
 v_actor uuid:=(SELECT auth.uid()); v_kind text; v_permission public.organization_permission_key; v_scope jsonb;
 v_claims jsonb:=(SELECT auth.jwt()); v_session uuid; v_expiry timestamptz; v_now timestamptz:=clock_timestamp();
 v_existing app_private.financial_reset_zero_session_endorsements%ROWTYPE;
BEGIN
 IF session_user IS DISTINCT FROM 'authenticator' OR current_setting('role',true) IS DISTINCT FROM 'authenticated' OR v_actor IS NULL
  OR v_claims->>'sub' IS DISTINCT FROM v_actor::text OR v_claims->>'role' IS DISTINCT FROM 'authenticated'
  OR v_claims->>'aud' IS DISTINCT FROM 'authenticated' OR v_claims->'is_anonymous' IS DISTINCT FROM 'false'::jsonb
  OR coalesce(v_claims->>'session_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR coalesce(v_claims->>'exp','') !~ '^[0-9]{1,12}$' THEN
  RAISE EXCEPTION 'financial_reset_zero_genuine_session_required' USING ERRCODE='42501';
 END IF;
 v_session:=(v_claims->>'session_id')::uuid; v_expiry:=to_timestamp((v_claims->>'exp')::double precision);
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 SELECT * INTO v_plan FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_op.operation_kind<>'reset' OR v_op.status NOT IN ('prepared','sealed') OR v_plan.status<>'prepared'
  OR p_review_sha256 IS DISTINCT FROM v_plan.review_sha256 OR v_plan.review_sha256 IS DISTINCT FROM app_private.financial_reset_hash(v_plan.plan_json) THEN
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
 IF v_expiry<=v_now THEN RAISE EXCEPTION 'financial_reset_zero_session_endorsement_stale' USING ERRCODE='42501'; END IF;
 INSERT INTO app_private.financial_reset_zero_approvals(operation_id,organization_id,approval_kind,review_sha256,approved_by)
 VALUES(p_operation_id,v_op.organization_id,v_kind,p_review_sha256,v_actor) ON CONFLICT(operation_id,approval_kind) DO NOTHING;
 SELECT * INTO v_existing FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id=p_operation_id AND approval_kind=v_kind
 ORDER BY endorsement_number DESC LIMIT 1 FOR SHARE;
 IF FOUND THEN
  IF v_existing.actor_id IS DISTINCT FROM v_actor OR v_existing.organization_id IS DISTINCT FROM v_op.organization_id
   OR v_existing.review_sha256 IS DISTINCT FROM p_review_sha256 THEN
   RAISE EXCEPTION 'financial_reset_zero_session_endorsement_immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF v_existing.endorsement_id IS NULL OR v_existing.session_id IS DISTINCT FROM v_session OR v_existing.credential_expires_at<v_expiry THEN
  INSERT INTO app_private.financial_reset_zero_session_endorsements(operation_id,organization_id,approval_kind,endorsement_number,
   review_sha256,actor_id,session_id,credential_expires_at,endorsed_at)
  VALUES(p_operation_id,v_op.organization_id,v_kind,coalesce(v_existing.endorsement_number,0)+1,p_review_sha256,v_actor,v_session,v_expiry,v_now);
 END IF;
 PERFORM app_private.assert_financial_reset_zero_endorsement(p_operation_id,v_kind);
END;
$$;

CREATE TABLE app_private.financial_reset_zero_command_context (
 backend_pid integer PRIMARY KEY,
 transaction_id xid8 NOT NULL,
 operation_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 generation integer NOT NULL,
 operator_authorization_id uuid NOT NULL REFERENCES app_private.financial_reset_actor_authorizations(authorization_id) ON DELETE RESTRICT,
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[0-9a-f]{64}$'),
 scope jsonb NOT NULL CHECK(jsonb_typeof(scope)='object'),
 component public.owner_balance_component NOT NULL,
 command text NOT NULL CHECK(command IN ('submit','review')),
 request_id uuid,
 command_checked boolean NOT NULL DEFAULT false,
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK((command='submit' AND request_id IS NULL) OR (command='review' AND request_id IS NOT NULL))
);
ALTER TABLE app_private.financial_reset_zero_command_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_zero_command_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.assert_financial_reset_zero_command_context(c app_private.financial_reset_zero_command_context) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.financial_reset_operations%ROWTYPE; z app_private.financial_reset_zero_plans%ROWTYPE;
 w app_private.financial_write_controls%ROWTYPE; r public.owner_opening_balance_requests%ROWTYPE; v_maker uuid; v_reviewer uuid;
BEGIN
 IF c.backend_pid IS DISTINCT FROM pg_backend_pid() OR c.transaction_id IS DISTINCT FROM pg_current_xact_id_if_assigned() THEN
  RAISE EXCEPTION 'financial_reset_zero_command_transaction_invalid' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_financial_reset_scoped_operator(c.operation_id);
 SELECT * INTO STRICT o FROM app_private.financial_reset_operations WHERE operation_id=c.operation_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||o.organization_id::text,0));
 SELECT * INTO STRICT z FROM app_private.financial_reset_zero_plans WHERE operation_id=c.operation_id FOR SHARE;
 SELECT * INTO STRICT w FROM app_private.financial_write_controls WHERE organization_id=o.organization_id FOR SHARE;
 IF o.status IS DISTINCT FROM 'actions_complete' OR o.execution_backend IS DISTINCT FROM c.backend_pid OR o.execution_xid IS DISTINCT FROM c.transaction_id
  OR c.organization_id IS DISTINCT FROM o.organization_id OR c.generation IS DISTINCT FROM o.target_generation
  OR w.generation IS DISTINCT FROM o.target_generation OR w.status IS DISTINCT FROM 'open'
  OR z.status IS DISTINCT FROM 'prepared' OR c.review_sha256 IS DISTINCT FROM z.review_sha256
  OR z.plan_json->>'effective_date' IS DISTINCT FROM w.financial_start_date::text
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(z.plan_json->'scopes') s WHERE s.value=c.scope)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations a WHERE a.authorization_id=c.operator_authorization_id
   AND a.operation_id=c.operation_id AND a.action='execute' AND a.backend_pid=c.backend_pid AND a.transaction_id=c.transaction_id AND a.consumed_at IS NOT NULL)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_binding_invalid' USING ERRCODE='42501';
 END IF;
 v_maker:=app_private.assert_financial_reset_zero_endorsement(c.operation_id,'maker');
 v_reviewer:=app_private.assert_financial_reset_zero_endorsement(c.operation_id,'reviewer');
 IF v_maker IS NOT DISTINCT FROM v_reviewer THEN RAISE EXCEPTION 'financial_reset_zero_independent_actors_required' USING ERRCODE='42501'; END IF;
 IF c.command='review' THEN
  SELECT * INTO r FROM public.owner_opening_balance_requests WHERE id=c.request_id AND organization_id=c.organization_id FOR SHARE;
  IF NOT FOUND OR r.property_id::text IS DISTINCT FROM c.scope->>'property_id' OR r.owner_person_id::text IS DISTINCT FROM c.scope->>'owner_person_id'
   OR r.property_owner_id::text IS DISTINCT FROM c.scope->>'property_owner_id'
   OR r.ownership_percent_snapshot IS DISTINCT FROM (c.scope->>'ownership_percent')::numeric
   OR r.ownership_roster_hash IS DISTINCT FROM c.scope->>'ownership_roster_hash'
   OR r.currency IS DISTINCT FROM 'USD'::public.currency_code OR r.effective_date IS DISTINCT FROM w.financial_start_date
   OR r.component IS DISTINCT FROM c.component OR r.proposed_amount IS DISTINCT FROM 0::numeric OR r.request_kind IS DISTINCT FROM 'initial'
   OR r.correction_of_entry_id IS NOT NULL OR r.resubmission_of_request_id IS NOT NULL
   OR r.reason IS DISTINCT FROM 'Reviewed reset known-zero opening' OR r.supporting_document_id IS NOT NULL
   OR r.source_reference IS DISTINCT FROM 'financial-reset:'||c.operation_id::text||':'||c.review_sha256
   OR r.evidence_sha256 IS DISTINCT FROM c.review_sha256 OR r.submitted_by IS DISTINCT FROM v_maker
   OR r.status NOT IN ('submitted','approved') OR (r.status='approved' AND r.reviewed_by IS DISTINCT FROM v_reviewer) THEN
   RAISE EXCEPTION 'financial_reset_zero_command_request_invalid' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN CASE c.command WHEN 'submit' THEN v_maker ELSE v_reviewer END;
END;
$$;

CREATE FUNCTION app_private.financial_reset_zero_command_actor(p_command text) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_reset_zero_command_context%ROWTYPE;
BEGIN
 SELECT * INTO c FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid();
 IF NOT FOUND OR c.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'financial_reset_zero_command_context_required' USING ERRCODE='42501'; END IF;
 RETURN app_private.assert_financial_reset_zero_command_context(c);
END;
$$;

CREATE FUNCTION app_private.check_financial_reset_zero_command(p_command text,p_arguments jsonb) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.financial_reset_zero_command_context%ROWTYPE; z jsonb; v_key text; v_expected jsonb;
BEGIN
 PERFORM app_private.financial_reset_zero_command_actor(p_command);
 SELECT * INTO STRICT c FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid();
 SELECT plan_json INTO STRICT z FROM app_private.financial_reset_zero_plans WHERE operation_id=c.operation_id;
 v_key:='reset-zero:'||c.operation_id::text||':'||substr(app_private.financial_reset_hash(jsonb_build_object('scope',c.scope,'component',c.component)),1,40);
 IF p_command='submit' THEN
  v_expected:=jsonb_build_object('organization_id',c.organization_id,'property_id',c.scope->'property_id','owner_person_id',c.scope->'owner_person_id',
   'currency','USD','effective_date',z->'effective_date','component',c.component,'amount',0,'reason','Reviewed reset known-zero opening',
   'source_reference','financial-reset:'||c.operation_id::text||':'||c.review_sha256,'supporting_document_id',NULL,'evidence_sha256',c.review_sha256,
   'resubmission_of_request_id',NULL,'idempotency_key',v_key||':submit');
 ELSE
  v_expected:=jsonb_build_object('organization_id',c.organization_id,'request_id',c.request_id,'decision','approve',
   'review_reason','Reviewed reset known-zero opening','idempotency_key',v_key||':review');
 END IF;
 IF p_arguments IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'financial_reset_zero_command_arguments_changed' USING ERRCODE='23514'; END IF;
 UPDATE app_private.financial_reset_zero_command_context SET command_checked=true WHERE backend_pid=pg_backend_pid();
 RETURN true;
END;
$$;

CREATE FUNCTION app_private.financial_reset_zero_command_allowed(p_organization uuid,p_command text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.financial_reset_zero_command_actor(p_command);
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid()
  AND organization_id=p_organization AND command=p_command AND command_checked) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_scope_required' USING ERRCODE='42501';
 END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION app_private.guard_financial_reset_zero_command_context() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM app_private.assert_financial_reset_zero_command_context(OLD);
  IF OLD.command<>'review' OR NOT OLD.command_checked OR NOT EXISTS(
   SELECT 1 FROM public.owner_opening_balance_requests WHERE id=OLD.request_id AND organization_id=OLD.organization_id AND status='approved') THEN
   RAISE EXCEPTION 'financial_reset_zero_command_incomplete' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 PERFORM app_private.assert_financial_reset_zero_command_context(NEW);
 IF TG_OP='INSERT' AND (NEW.command<>'submit' OR NEW.request_id IS NOT NULL OR NEW.command_checked) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_initial_state' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['command','request_id','command_checked']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['command','request_id','command_checked']) OR NOT (
   (NEW.command=OLD.command AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id AND NOT OLD.command_checked AND NEW.command_checked)
   OR (OLD.command='submit' AND OLD.command_checked AND NEW.command='review' AND NEW.request_id IS NOT NULL AND NOT NEW.command_checked))) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_transition_invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_zero_command_context_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_zero_command_context
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_zero_command_context();

CREATE FUNCTION app_private.assert_financial_reset_zero_command_context_closed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_zero_command_context WHERE backend_pid=NEW.backend_pid AND transaction_id=NEW.transaction_id) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_must_close' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_zero_command_context_closed AFTER INSERT OR UPDATE ON app_private.financial_reset_zero_command_context
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_zero_command_context_closed();

CREATE FUNCTION app_private.begin_financial_reset_zero_command(p_operation uuid,p_scope jsonb,p_component public.owner_balance_component) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.assert_financial_reset_scoped_operator(p_operation);
 INSERT INTO app_private.financial_reset_zero_command_context(backend_pid,transaction_id,operation_id,organization_id,generation,operator_authorization_id,review_sha256,scope,component,command)
 SELECT pg_backend_pid(),pg_current_xact_id(),o.operation_id,o.organization_id,o.target_generation,a.authorization_id,z.review_sha256,p_scope,p_component,'submit'
 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id)
 JOIN app_private.financial_reset_actor_authorizations a ON a.operation_id=o.operation_id AND a.action='execute'
  AND a.backend_pid=pg_backend_pid() AND a.transaction_id=pg_current_xact_id() AND a.consumed_at IS NOT NULL
 WHERE o.operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_command_context_required' USING ERRCODE='42501'; END IF;
END;
$$;
CREATE FUNCTION app_private.advance_financial_reset_zero_command(p_operation uuid,p_request uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE app_private.financial_reset_zero_command_context SET command='review',request_id=p_request,command_checked=false
 WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_command_context_required' USING ERRCODE='42501'; END IF;
END;
$$;
CREATE FUNCTION app_private.finish_financial_reset_zero_command(p_operation uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_zero_command_context_required' USING ERRCODE='42501'; END IF;
END;
$$;

-- Clone the effective checked implementations, including their archived roster
-- gate, locks, idempotency, maker/checker rules and conservation postconditions.
-- The only changed actor/permission route requires this exact private context.
DO $adapters$
DECLARE d text; b text; r record; p record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)',
   'submit_owner_opening_balance_baseline_branch106','financial_reset_scoped_submit_opening','submit','can_submit_owner_opening_balance'),
  ('app_private.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text)',
   'review_owner_opening_balance_baseline_branch106','financial_reset_scoped_review_opening','review','can_review_owner_opening_balance')
 ) x(signature,old_name,new_name,command,permission_name) LOOP
  d:=replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n');
  b:=CASE r.command WHEN 'submit' THEN $submit$
  PERFORM app_private.check_financial_reset_archived_zero_command('submit',jsonb_build_object(
   'organization_id',p_organization_id,'property_id',p_property_id,'owner_person_id',p_owner_person_id,'currency',p_currency,
   'effective_date',p_effective_date,'component',p_component,'amount',p_amount,'reason',p_reason,'source_reference',p_source_reference,
   'supporting_document_id',p_supporting_document_id,'evidence_sha256',p_evidence_sha256,
   'resubmission_of_request_id',p_resubmission_of_request_id,'idempotency_key',p_idempotency_key));
$submit$ ELSE $review$
  PERFORM app_private.check_financial_reset_archived_zero_command('review',jsonb_build_object(
   'organization_id',p_organization_id,'request_id',p_request_id,'decision',p_decision,'review_reason',p_review_reason,'idempotency_key',p_idempotency_key));
$review$ END;
  FOR p IN SELECT * FROM (VALUES
   ('FUNCTION app_private.'||r.old_name||'(','FUNCTION app_private.'||r.new_name||'('),
   ('(SELECT auth.uid())','app_private.financial_reset_zero_command_actor('||quote_literal(r.command)||')'),
   ('app_private.'||r.permission_name||'(p_organization_id)',
    'app_private.financial_reset_zero_command_allowed(p_organization_id,'||quote_literal(r.command)||')'),
   (b,replace(b,'check_financial_reset_archived_zero_command','check_financial_reset_zero_command')||b)
  ) q(anchor,replacement) LOOP
   IF (length(d)-length(replace(d,p.anchor,'')))/length(p.anchor)<>1 THEN
    RAISE EXCEPTION 'financial_reset_scoped_opening_anchor_changed: %',r.old_name;
   END IF;
   d:=replace(d,p.anchor,p.replacement);
  END LOOP;
  IF strpos(d,'auth.uid()')>0 OR strpos(d,'request.jwt')>0 THEN
   RAISE EXCEPTION 'financial_reset_scoped_opening_claim_dependency';
  END IF;
  EXECUTE d;
 END LOOP;
END;
$adapters$;

DO $integrate$
DECLARE d text; a text; b text; r record;
BEGIN
 -- The archived-property exception remains tied to the exact same reviewed
 -- scope. Its actor comes from the independently checked command context.
 d:=replace(pg_get_functiondef('app_private.assert_financial_reset_archived_zero_context(app_private.financial_reset_archived_zero_command_context)'::regprocedure),E'\r\n',E'\n');
 a:='(SELECT auth.uid())';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_archived_scoped_actor_anchor_changed'; END IF;
 EXECUTE replace(d,a,'app_private.financial_reset_zero_command_actor(p_context.command)');

 d:=replace(pg_get_functiondef('app_private.apply_financial_reset_known_zero(uuid)'::regprocedure),E'\r\n',E'\n');
 b:=$entry$
 PERFORM app_private.assert_financial_reset_scoped_operator(p_operation_id);
 PERFORM app_private.assert_financial_reset_zero_endorsement(p_operation_id,'maker');
 PERFORM app_private.assert_financial_reset_zero_endorsement(p_operation_id,'reviewer');
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid()) THEN
  RAISE EXCEPTION 'financial_reset_zero_command_context_already_open' USING ERRCODE='23514';
 END IF;
$entry$;
 a:=E'\nBEGIN\n';
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_zero_entry_anchor_changed'; END IF;
 d:=replace(d,a,a||b);
 FOR r IN SELECT * FROM (VALUES
  ($old$ARRAY['request.jwt.claims','request.jwt.claim','request.jwt.claim.sub','request.jwt.claim.role','request.headers',$old$,
   $new$ARRAY['request.headers',$new$),
  ($old$       -- Use only identity/role claims, never borrowed session/step-up assurance.
       PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_plan.plan_json->>'maker_actor_id','role','authenticated')::text,true);
       PERFORM set_config('request.jwt.claim',current_setting('request.jwt.claims'),true);
       PERFORM set_config('request.jwt.claim.sub',v_plan.plan_json->>'maker_actor_id',true);
       PERFORM set_config('request.jwt.claim.role','authenticated',true);$old$,
   $new$       PERFORM app_private.begin_financial_reset_zero_command(p_operation_id,v_scope,v_component);$new$),
  ($old$       PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_plan.plan_json->>'reviewer_actor_id','role','authenticated')::text,true);
       PERFORM set_config('request.jwt.claim',current_setting('request.jwt.claims'),true);
       PERFORM set_config('request.jwt.claim.sub',v_plan.plan_json->>'reviewer_actor_id',true);$old$,
   $new$       PERFORM app_private.advance_financial_reset_zero_command(p_operation_id,v_request);$new$),
  ('v_submit:=public.submit_owner_opening_balance(','v_submit:=app_private.financial_reset_scoped_submit_opening('),
  ('v_review:=public.review_owner_opening_balance(','v_review:=app_private.financial_reset_scoped_review_opening('),
  ('       PERFORM app_private.finish_financial_reset_archived_zero_context(p_operation_id);',
   E'       PERFORM app_private.finish_financial_reset_archived_zero_context(p_operation_id);\n       PERFORM app_private.finish_financial_reset_zero_command(p_operation_id);')
 ) q(anchor,replacement) LOOP
  IF (length(d)-length(replace(d,r.anchor,'')))/length(r.anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_scoped_zero_phase_anchor_changed'; END IF;
  d:=replace(d,r.anchor,r.replacement);
 END LOOP;
 IF strpos(d,'request.jwt')>0 OR strpos(d,'auth.uid()')>0 THEN RAISE EXCEPTION 'financial_reset_scoped_zero_claim_dependency'; END IF;
 EXECUTE d;
END;
$integrate$;

REVOKE ALL ON FUNCTION app_private.assert_financial_reset_scoped_operator(uuid),
 app_private.financial_reset_zero_endorsement_actor(uuid,text),app_private.financial_reset_zero_endorsement_status(uuid,text),
 app_private.assert_financial_reset_zero_endorsement(uuid,text),
 app_private.assert_financial_reset_zero_command_context(app_private.financial_reset_zero_command_context),
 app_private.financial_reset_zero_command_actor(text),app_private.check_financial_reset_zero_command(text,jsonb),
 app_private.financial_reset_zero_command_allowed(uuid,text),app_private.guard_financial_reset_zero_command_context(),
 app_private.assert_financial_reset_zero_command_context_closed(),app_private.begin_financial_reset_zero_command(uuid,jsonb,public.owner_balance_component),
 app_private.advance_financial_reset_zero_command(uuid,uuid),app_private.finish_financial_reset_zero_command(uuid),
 app_private.financial_reset_scoped_submit_opening(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text),
 app_private.financial_reset_scoped_review_opening(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.approve_financial_reset_zero_plan(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_financial_reset_zero_plan(uuid,text) TO authenticated;
COMMIT;
