-- Session-backed, short-lived authorization for one reviewed private action.
-- This migration enrolls nobody and stores no bearer token or JWT claims.
-- The locator is not a credential: API roles cannot consume it or execute the
-- private reset, and every use rechecks the original live session and authority.
BEGIN;

CREATE TABLE app_private.financial_reset_actor_authorizations (
 authorization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 operation_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('freeze','checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery')),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 binding_sha256 text NOT NULL CHECK(binding_sha256=app_private.financial_reset_hash(binding)),
 -- Deliberately not cascading Auth FKs: consumed audit evidence survives signout
 -- and user deletion without preventing either operation.
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 credential_expires_at timestamptz NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 backend_pid integer,
 transaction_id xid8,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes' AND expires_at<=credential_expires_at),
 CHECK((consumed_at IS NULL AND backend_pid IS NULL AND transaction_id IS NULL) OR
       (consumed_at IS NOT NULL AND backend_pid IS NOT NULL AND transaction_id IS NOT NULL AND consumed_at<expires_at))
);
CREATE INDEX financial_reset_actor_authorizations_operation ON app_private.financial_reset_actor_authorizations(operation_id,action);
CREATE UNIQUE INDEX financial_reset_actor_one_transaction ON app_private.financial_reset_actor_authorizations(backend_pid,transaction_id)
 WHERE consumed_at IS NOT NULL;
ALTER TABLE app_private.financial_reset_actor_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_actor_authorizations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.assert_financial_reset_actor_binding(p_binding jsonb,p_action text) RETURNS void
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_field text; v_recovery jsonb:=p_binding->'recovery';
BEGIN
 IF p_binding IS NULL OR jsonb_typeof(p_binding) IS DISTINCT FROM 'object' OR p_action IS NULL OR
  p_action NOT IN ('freeze','checkpoint','prepare','seal','execute','prepare-recovery','execute-recovery') THEN
  RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
 END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_binding-'recovery') k) IS DISTINCT FROM
  (SELECT array_agg(k ORDER BY k) FROM unnest(ARRAY['version','operation_id','project_ref','organization_id','packet_sha256','main_sha','sources_sha256',
   'schema_sha256','ledger_sha256','source_snapshot_sha256','source_generation','target_generation','cutoff','issue_date','timezone',
   'execution_business_date','invoice_date_policy','manifest_sha256','plan_sha256','archive_sha256','action_sha256','archive_artifact_sha256',
   'archive_count','action_count','zero_review_sha256','continuation_semantic_sha256','report_review_sha256','continuation_semantic']) k)
  OR p_binding->'version' IS DISTINCT FROM '1'::jsonb
  OR coalesce(p_binding->>'project_ref','') !~ '^[a-z0-9]{20}$' OR coalesce(p_binding->>'main_sha','') !~ '^[a-f0-9]{40}$'
  OR coalesce(p_binding->>'operation_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(p_binding->>'organization_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR coalesce(p_binding->>'source_generation','') !~ '^[0-9]+$' OR coalesce(p_binding->>'target_generation','') !~ '^[0-9]+$'
  OR coalesce(p_binding->>'archive_count','') !~ '^[1-9][0-9]*$' OR coalesce(p_binding->>'action_count','') !~ '^[1-9][0-9]*$'
  OR p_binding->>'cutoff' IS DISTINCT FROM '2026-10-01'
  OR coalesce(p_binding->>'issue_date','') !~ '^2026-10-[0-9]{2}$'
  OR coalesce(p_binding->>'execution_business_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR coalesce(p_binding->>'invoice_date_policy','') NOT IN ('execution-business-date','original-reviewed-october')
  OR jsonb_typeof(p_binding->'continuation_semantic') IS DISTINCT FROM 'object'
  OR p_binding->'continuation_semantic' ? 'source_sha256'
  OR coalesce(p_binding->'continuation_semantic'->>'actor_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR app_private.financial_reset_hash(p_binding->'continuation_semantic') IS DISTINCT FROM p_binding->>'continuation_semantic_sha256'
  OR (p_action IN ('prepare-recovery','execute-recovery')) IS DISTINCT FROM (p_binding ? 'recovery') THEN
  RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
 END IF;
 IF (p_binding->>'target_generation')::bigint<>(p_binding->>'source_generation')::bigint+1
  OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=(p_binding->>'organization_id')::uuid AND operational_timezone=p_binding->>'timezone') THEN
  RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
 END IF;
 FOREACH v_field IN ARRAY ARRAY['packet_sha256','sources_sha256','schema_sha256','ledger_sha256','source_snapshot_sha256',
  'manifest_sha256','plan_sha256','archive_sha256','action_sha256','archive_artifact_sha256','zero_review_sha256',
  'continuation_semantic_sha256','report_review_sha256'] LOOP
  IF coalesce(p_binding->>v_field,'') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF p_binding ? 'recovery' THEN
  IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' OR
   (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_recovery) k) IS DISTINCT FROM
   ARRAY['action_count','action_sha256','execution_business_date','operation_id','phase_binding_sha256','plan_sha256','report_checkpoint_sha256','review_artifact_sha256','source_generation','target_generation']::text[]
   OR coalesce(v_recovery->>'operation_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR v_recovery->>'operation_id'=p_binding->>'operation_id'
   OR v_recovery->'source_generation' IS DISTINCT FROM p_binding->'target_generation'
   OR coalesce(v_recovery->>'target_generation','') !~ '^[0-9]+$'
   OR coalesce(v_recovery->>'action_count','') !~ '^[1-9][0-9]*$'
   OR coalesce(v_recovery->>'execution_business_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
  END IF;
  IF (v_recovery->>'target_generation')::bigint<>(v_recovery->>'source_generation')::bigint+1 THEN
   RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['action_sha256','phase_binding_sha256','plan_sha256','report_checkpoint_sha256','review_artifact_sha256'] LOOP
   IF coalesce(v_recovery->>v_field,'') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'financial_reset_actor_binding_invalid' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END IF;
END;
$$;

-- Existing reset continuation/report eligibility is super_admin. Requiring the
-- same current membership keeps branch/custom/legacy roles from acquiring new
-- organization-wide reset authority. No user_metadata authorization is used.
CREATE FUNCTION app_private.financial_reset_actor_is_current(p_organization uuid,p_actor uuid,p_session uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  JOIN public.organization_members m ON m.user_id=u.id AND m.organization_id=p_organization
  WHERE s.id=p_session AND s.user_id=p_actor AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
    AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
    AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND m.role='super_admin'
    AND m.branch_id IS NULL AND m.person_id IS NULL)
  AND app_private.privileged_email_step_up_satisfied_for_actor(p_organization,p_actor,p_session)
  AND (NOT coalesce((SELECT enforcement_enabled FROM app_private.privileged_email_step_up_policies WHERE organization_id=p_organization),false)
   OR EXISTS(SELECT 1 FROM app_private.privileged_email_step_up_grants g WHERE g.organization_id=p_organization AND g.user_id=p_actor
    AND g.session_id=p_session AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())))
$$;

CREATE FUNCTION app_private.guard_financial_reset_actor_authorization() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['consumed_at','backend_pid','transaction_id']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['consumed_at','backend_pid','transaction_id']) OR OLD.consumed_at IS NOT NULL
  OR NEW.consumed_at IS NULL OR NEW.backend_pid IS DISTINCT FROM pg_backend_pid()
  OR NEW.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'financial_reset_actor_authorization_immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER financial_reset_actor_authorization_guard BEFORE UPDATE OR DELETE ON app_private.financial_reset_actor_authorizations
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_actor_authorization();

-- Authenticated PostgREST is the only application entry point. Identity and
-- credential expiry come from its verified request, never from UUID parameters.
CREATE FUNCTION public.authorize_financial_reset_hosted_action(p_binding jsonb,p_action text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_claims jsonb:=(SELECT auth.jwt()); v_session uuid;
 v_org uuid; v_now timestamptz:=clock_timestamp(); v_credential_expiry timestamptz; v_expiry timestamptz; v_id uuid;
BEGIN
 -- PostgREST validates the bearer before switching its authenticator connection
 -- to authenticated. A raw operator SET ROLE plus invented claims is not ingress.
 IF session_user IS DISTINCT FROM 'authenticator' OR current_setting('role',true) IS DISTINCT FROM 'authenticated' OR v_actor IS NULL OR
  v_claims->>'sub' IS DISTINCT FROM v_actor::text OR v_claims->>'role' IS DISTINCT FROM 'authenticated' OR
  v_claims->>'aud' IS DISTINCT FROM 'authenticated' OR v_claims->'is_anonymous' IS DISTINCT FROM 'false'::jsonb OR
  coalesce(v_claims->>'session_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR
  coalesce(v_claims->>'exp','') !~ '^[0-9]{1,12}$' THEN
  RAISE EXCEPTION 'financial_reset_actor_session_required' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.assert_financial_reset_actor_binding(p_binding,p_action);
 v_org:=(p_binding->>'organization_id')::uuid; v_session:=(v_claims->>'session_id')::uuid;
 v_credential_expiry:=to_timestamp((v_claims->>'exp')::double precision);
 IF v_credential_expiry<=v_now OR v_actor IS DISTINCT FROM (p_binding->'continuation_semantic'->>'actor_id')::uuid OR
  app_private.financial_reset_actor_is_current(v_org,v_actor,v_session) IS DISTINCT FROM true OR
  app_private.has_org_permission(v_org,'finance.correct_records') IS DISTINCT FROM true OR
  app_private.has_org_permission(v_org,'finance.close_periods') IS DISTINCT FROM true OR
  app_private.has_org_permission(v_org,'leases.change_terms') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'financial_reset_actor_authority_required' USING ERRCODE='42501';
 END IF;
 SELECT least(v_now+interval '5 minutes',v_credential_expiry,s.not_after) INTO STRICT v_expiry FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor;
 INSERT INTO app_private.financial_reset_actor_authorizations(organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,credential_expires_at,issued_at,expires_at)
 VALUES(v_org,coalesce(p_binding->'recovery'->>'operation_id',p_binding->>'operation_id')::uuid,p_action,p_binding,
  app_private.financial_reset_hash(p_binding),v_actor,v_session,v_credential_expiry,v_now,v_expiry) RETURNING authorization_id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE FUNCTION app_private.consume_financial_reset_actor_authorization(p_authorization uuid,p_binding jsonb,p_action text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row app_private.financial_reset_actor_authorizations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM app_private.assert_financial_reset_actor_binding(p_binding,p_action);
 SELECT * INTO v_row FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=p_authorization FOR UPDATE;
 IF NOT FOUND OR v_row.binding IS DISTINCT FROM p_binding OR v_row.action IS DISTINCT FROM p_action OR
  v_row.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p_binding) THEN
  RAISE EXCEPTION 'financial_reset_actor_authorization_mismatch' USING ERRCODE='42501';
 END IF;
 IF v_row.consumed_at IS NOT NULL THEN
  RAISE EXCEPTION 'financial_reset_actor_authorization_consumed' USING ERRCODE='42501';
 END IF;
 -- Lock the current authority through commit. Policy is a sparse table; its
 -- table lock also closes the absent-policy/enable race. It does not alter it.
 LOCK TABLE app_private.privileged_email_step_up_policies IN SHARE MODE;
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  JOIN public.organization_members m ON m.user_id=u.id AND m.organization_id=v_row.organization_id
  WHERE s.id=v_row.session_id AND s.user_id=v_row.actor_id FOR SHARE OF s,u,m;
 PERFORM 1 FROM app_private.privileged_email_step_up_grants g WHERE g.organization_id=v_row.organization_id
  AND g.user_id=v_row.actor_id AND g.session_id=v_row.session_id FOR SHARE;
 IF v_row.expires_at<=clock_timestamp() OR v_row.credential_expires_at<=clock_timestamp() OR
  app_private.financial_reset_actor_is_current(v_row.organization_id,v_row.actor_id,v_row.session_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'financial_reset_actor_authorization_stale' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'financial_reset_actor_transaction_already_bound' USING ERRCODE='42501';
 END IF;
 UPDATE app_private.financial_reset_actor_authorizations SET consumed_at=clock_timestamp(),backend_pid=pg_backend_pid(),transaction_id=pg_current_xact_id()
 WHERE authorization_id=p_authorization;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_hosted_actor_context(p_binding jsonb,p_action text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row app_private.financial_reset_actor_authorizations%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_lifecycle_isolation();
 SELECT * INTO v_row FROM app_private.financial_reset_actor_authorizations WHERE backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id_if_assigned() AND consumed_at IS NOT NULL;
 IF NOT FOUND OR v_row.binding IS DISTINCT FROM p_binding OR v_row.action IS DISTINCT FROM p_action OR
  v_row.binding_sha256 IS DISTINCT FROM app_private.financial_reset_hash(p_binding) OR v_row.expires_at<=clock_timestamp() OR
  app_private.financial_reset_actor_is_current(v_row.organization_id,v_row.actor_id,v_row.session_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'financial_reset_actor_context_required' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('authorizationId',v_row.authorization_id,'actorId',v_row.actor_id,'backendPid',v_row.backend_pid,'transactionId',v_row.transaction_id::text);
END;
$$;

-- A read-only observation, never a capability. Consumed status remains useful
-- for historical reconciliation after a later signout or authorization expiry.
CREATE FUNCTION app_private.financial_reset_hosted_actor_authorization_status(p_authorization uuid,p_binding jsonb,p_action text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row app_private.financial_reset_actor_authorizations%ROWTYPE; v_matches boolean; v_status text;
BEGIN
 SELECT * INTO v_row FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=p_authorization;
 v_matches:=FOUND AND v_row.binding IS NOT DISTINCT FROM p_binding AND v_row.action IS NOT DISTINCT FROM p_action
  AND v_row.binding_sha256=app_private.financial_reset_hash(p_binding);
 v_status:=CASE WHEN v_row.authorization_id IS NULL THEN 'missing' WHEN NOT v_matches THEN 'mismatch'
  WHEN v_row.consumed_at IS NOT NULL THEN 'consumed' WHEN v_row.expires_at<=clock_timestamp() THEN 'expired'
  WHEN NOT app_private.financial_reset_actor_is_current(v_row.organization_id,v_row.actor_id,v_row.session_id) THEN 'revoked' ELSE 'pending' END;
 RETURN jsonb_build_object('authorizationId',p_authorization,'actorId',CASE WHEN v_matches THEN v_row.actor_id END,
  'status',v_status,'bindingMatches',coalesce(v_matches,false),'backendPid',CASE WHEN v_matches THEN v_row.backend_pid END,
  'transactionId',CASE WHEN v_matches THEN v_row.transaction_id::text END,'expiresAt',CASE WHEN v_matches THEN v_row.expires_at END,'observedAt',clock_timestamp());
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_financial_reset_actor_binding(jsonb,text),
 app_private.financial_reset_actor_is_current(uuid,uuid,uuid),app_private.guard_financial_reset_actor_authorization(),
 app_private.consume_financial_reset_actor_authorization(uuid,jsonb,text),app_private.assert_financial_reset_hosted_actor_context(jsonb,text),
 app_private.financial_reset_hosted_actor_authorization_status(uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.authorize_financial_reset_hosted_action(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.authorize_financial_reset_hosted_action(jsonb,text) TO authenticated;
COMMENT ON FUNCTION public.authorize_financial_reset_hosted_action(jsonb,text) IS
 'Records the exact reviewed action using the caller''s genuine live Auth session and existing reset authority; returns a non-secret locator only.';
COMMIT;
