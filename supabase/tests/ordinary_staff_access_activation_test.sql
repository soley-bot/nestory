BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(71);

-- All identities and workspaces below are synthetic and rolled back. The
-- application calls run as real API roles; no production guard is disabled.
CREATE TEMP TABLE activation_actor (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinary_id uuid NOT NULL DEFAULT gen_random_uuid(),
  replacement_id uuid NOT NULL DEFAULT gen_random_uuid(),
  revoked_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;
INSERT INTO activation_actor DEFAULT VALUES;

CREATE TEMP TABLE activation_case (
  label text PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  spare_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  preview jsonb,
  result jsonb
) ON COMMIT DROP;
INSERT INTO activation_case(label) VALUES
  ('bootstrap'), ('foreign'), ('no-branch'), ('unresolved'),
  ('legacy-member'), ('legacy-invitation'), ('transition'), ('staged'), ('revoked');
GRANT SELECT ON activation_actor TO authenticated, anon, service_role;
GRANT SELECT, UPDATE ON activation_case TO authenticated;
GRANT SELECT ON activation_case TO anon, service_role;

INSERT INTO auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT '00000000-0000-0000-0000-000000000000', user_id,
  'authenticated', 'authenticated', user_id::text || '@activation.example.test',
  extensions.crypt('synthetic-activation-password', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM activation_actor CROSS JOIN LATERAL unnest(
  ARRAY[admin_id, other_admin_id, ordinary_id, replacement_id, revoked_admin_id]
) AS actor(user_id);

-- Model the bootstrap administrator's completed password login. A populated
-- hash alone does not satisfy the invitation's credential-proof requirement.
DO $$
BEGIN
  PERFORM app_private.record_auth_password_credential_proof(
    (SELECT admin_id FROM activation_actor),
    'password_login'
  );
END;
$$;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Activation ' || label,
  'activation-' || left(organization_id::text, 8) FROM activation_case;
INSERT INTO public.organization_branches(id, organization_id, name, code)
SELECT branch_id, organization_id, 'Primary', 'PRIMARY'
FROM activation_case WHERE label <> 'no-branch';
INSERT INTO public.organization_branches(id, organization_id, name, code)
SELECT spare_branch_id, organization_id, 'Secondary', 'SECONDARY'
FROM activation_case WHERE label IN ('staged', 'unresolved');
INSERT INTO public.organization_branches(id, organization_id, name, code, status, archived_at)
SELECT branch_id, organization_id, 'Inactive', 'INACTIVE', 'inactive', NULL::timestamptz
FROM activation_case WHERE label = 'no-branch'
UNION ALL
SELECT spare_branch_id, organization_id, 'Archived', 'ARCHIVED', 'active', now()
FROM activation_case WHERE label = 'no-branch';

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id,
  CASE WHEN label = 'foreign' THEN other_admin_id ELSE admin_id END,
  'super_admin'
FROM activation_case CROSS JOIN activation_actor WHERE label <> 'bootstrap';
INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, revoked_admin_id, 'super_admin'
FROM activation_case CROSS JOIN activation_actor WHERE label = 'revoked';

-- Bootstrap authority is obtained through actual invitation acceptance below.
INSERT INTO public.organization_invitations(id, organization_id, email, role)
SELECT invitation_id, organization_id, admin_id::text || '@activation.example.test',
  'super_admin'
FROM activation_case CROSS JOIN activation_actor WHERE label = 'bootstrap';

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, ordinary_id, 'finance_member'
FROM activation_case CROSS JOIN activation_actor WHERE label IN ('legacy-member', 'transition');
INSERT INTO public.organization_invitations(id, organization_id, email, role, expires_at)
SELECT invitation_id, organization_id, 'legacy@activation.example.test', 'finance_member',
  now() - interval '1 hour'
FROM activation_case WHERE label = 'legacy-invitation';
-- Removing a legacy member does not clear the required transition manifest.
DELETE FROM public.organization_members
WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'transition')
  AND role = 'finance_member';

INSERT INTO public.organization_roles(id, organization_id, name)
SELECT role_id, organization_id, 'Synthetic property reader'
FROM activation_case WHERE label = 'staged';
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key)
SELECT organization_id, role_id, 'properties.view'
FROM activation_case WHERE label = 'staged';
INSERT INTO public.organization_members(organization_id, user_id, role, branch_id, custom_role_id)
SELECT organization_id, ordinary_id, 'custom', branch_id, role_id
FROM activation_case CROSS JOIN activation_actor WHERE label = 'staged';
INSERT INTO public.organization_invitations(id, organization_id, email, role, branch_id, custom_role_id)
SELECT invitation_id, organization_id, 'staged@activation.example.test', 'custom', branch_id, role_id
FROM activation_case WHERE label = 'staged';

INSERT INTO public.properties(id, organization_id, name, code, property_type)
SELECT property_id, organization_id, 'Unresolved synthetic property', 'ACT-UNRESOLVED', 'apartment'
FROM activation_case WHERE label = 'unresolved';

CREATE FUNCTION pg_temp.activation_claims(p_user_id uuid, p_session_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated', 'session_id', p_session_id)::text, true);
END;
$$;
CREATE FUNCTION pg_temp.activation_preview(p_label text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT public.get_organization_ordinary_access_activation(organization_id)
  FROM activation_case WHERE label = p_label;
$$;
CREATE FUNCTION pg_temp.activate_case(p_label text, p_confirm boolean DEFAULT true)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT public.activate_organization_ordinary_access(
    organization_id, (preview->>'authorization_version')::bigint,
    preview->>'impact_fingerprint', p_confirm)
  FROM activation_case WHERE label = p_label;
$$;

SELECT ok(
  (SELECT count(*) = 2
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (
     'get_organization_ordinary_access_activation', 'activate_organization_ordinary_access')
     AND NOT p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND NOT EXISTS (
       SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege_record
       WHERE privilege_record.grantee = 0 AND privilege_record.privilege_type = 'EXECUTE')),
  'activation APIs are narrow invoker wrappers executable only by authenticated callers');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.organization_authorization_states', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role', 'public.organization_authorization_states', 'INSERT,UPDATE,DELETE'),
  'activation does not grant direct authorization-state writes to API roles');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT pg_temp.activation_preview('bootstrap')$$,
  '42501', NULL, 'anonymous callers cannot inspect activation readiness');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', NULL, 'anonymous callers cannot activate access');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT pg_temp.activation_preview('bootstrap')$$,
  '42501', NULL, 'service role cannot substitute for an accepted administrator preview');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', NULL, 'service role cannot substitute for administrator activation');
RESET ROLE;
SELECT pg_temp.activation_claims(NULL);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.activation_preview('bootstrap')$$,
  '42501', NULL, 'authenticated SQL role without a user is denied');
SELECT pg_temp.activation_claims((SELECT admin_id FROM activation_actor));
SELECT throws_ok($$SELECT pg_temp.activation_preview('bootstrap')$$,
  '42501', NULL, 'a pending invitation does not grant preview authority');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', NULL, 'a pending invitation does not grant activation authority');
SELECT lives_ok(
  $$SELECT public.accept_organization_invitation(invitation_id)
    FROM activation_case WHERE label = 'bootstrap'$$,
  'the verified synthetic administrator accepts the bootstrap invitation');
SELECT throws_ok($$SELECT pg_temp.activation_preview('foreign')$$,
  '42501', NULL, 'an administrator cannot preview another organization');
SELECT throws_ok($$SELECT pg_temp.activate_case('foreign')$$,
  '42501', NULL, 'an administrator cannot activate another organization');
SELECT pg_temp.activation_claims((SELECT ordinary_id FROM activation_actor));
SELECT is(
  (SELECT count(*) FROM public.organization_roles
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'staged')),
  0::bigint, 'a valid staged member has no role access while ordinary access is contained');
SELECT throws_ok($$SELECT pg_temp.activation_preview('staged')$$,
  '42501', NULL, 'a valid staged custom member cannot inspect activation readiness');
SELECT throws_ok($$SELECT pg_temp.activate_case('staged')$$,
  '42501', NULL, 'a custom member cannot activate their organization');
SELECT throws_ok(
  $$SELECT app_private.ordinary_access_activation_snapshot(organization_id)
    FROM activation_case WHERE label = 'foreign'$$,
  '42501', NULL, 'raw consent snapshot cannot bypass actor authorization through the private schema');
SELECT pg_temp.activation_claims((SELECT admin_id FROM activation_actor));

UPDATE activation_case SET preview = pg_temp.activation_preview(label)
WHERE label <> 'foreign';
SELECT ok(
  (SELECT preview->>'organization_id' = organization_id::text
     AND (preview->>'authorization_version')::bigint > 0
     AND NOT (preview->>'ordinary_access_enabled')::boolean
     AND (preview->>'activation_ready')::boolean
     AND preview->'blockers' = '[]'::jsonb
     AND preview->>'impact_fingerprint' ~ '^[0-9a-f]{64}$'
     AND (preview->>'active_branch_count')::bigint = 1
     AND (preview->>'ordinary_member_count')::bigint = 0
     AND (preview->>'live_ordinary_invitation_count')::bigint = 0
     AND preview->'impact_memberships' = '[]'::jsonb
     AND preview->'impact_invitations' = '[]'::jsonb
   FROM activation_case WHERE label = 'bootstrap'),
  'accepted admin sees exact ready contained state with no pre-existing staff assignments');
SELECT ok(
  (SELECT c.preview->'impact_memberships' = jsonb_build_array(jsonb_build_object(
      'membership_id', m.id, 'user_id', a.ordinary_id,
      'email', a.ordinary_id::text || '@activation.example.test',
      'branch_id', c.branch_id, 'branch_name', 'Primary',
      'role_id', c.role_id, 'role_name', 'Synthetic property reader',
      'permission_keys', jsonb_build_array('properties.view')))
     AND c.preview->'impact_invitations' = jsonb_build_array(jsonb_build_object(
      'invitation_id', c.invitation_id, 'email', 'staged@activation.example.test',
      'status', 'pending', 'branch_id', c.branch_id, 'branch_name', 'Primary',
      'role_id', c.role_id, 'role_name', 'Synthetic property reader',
      'permission_keys', jsonb_build_array('properties.view')))
     AND jsonb_array_length(c.preview->'impact_memberships')
       = (c.preview->>'ordinary_member_count')::integer
     AND jsonb_array_length(c.preview->'impact_invitations')
       = (c.preview->>'live_ordinary_invitation_count')::integer
   FROM activation_case c CROSS JOIN activation_actor a
   JOIN public.organization_members m ON m.user_id = a.ordinary_id
   WHERE c.label = 'staged' AND m.organization_id = c.organization_id),
  'consent identifies exactly the affected member and invitation with source branch, role and permissions');
SELECT ok(
  (SELECT bool_and(NOT (preview->>'activation_ready')::boolean
    AND preview->'blockers' ? expected.blocker)
   FROM activation_case JOIN (VALUES
     ('no-branch', 'no_active_branch'), ('unresolved', 'property_branch_scope'),
     ('legacy-member', 'legacy_memberships'), ('legacy-invitation', 'legacy_invitations'),
     ('transition', 'transition_manifest')
   ) AS expected(label, blocker) USING(label)),
  'preview rejects inactive or archived branches, unresolved property scope, legacy assignments and missing transition');
SELECT throws_ok(format('SELECT pg_temp.activate_case(%L)', label),
  '55000', 'Ordinary access is not ready to enable.',
  label || ' remains contained through the supported activation API')
FROM activation_case WHERE label IN (
  'no-branch', 'unresolved', 'legacy-member', 'legacy-invitation', 'transition')
ORDER BY label;
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap', false)$$,
  '22023', NULL, 'activation requires explicit confirmation');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap', NULL)$$,
  '22023', NULL, 'null confirmation cannot enable access');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id, 0,
      preview->>'impact_fingerprint', true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '22023', NULL, 'non-positive expected version is rejected');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id, NULL,
      preview->>'impact_fingerprint', true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '22023', NULL, 'null expected version is rejected');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id,
      (preview->>'authorization_version')::bigint, 'invalid', true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '22023', NULL, 'malformed impact fingerprint is rejected');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id,
      (preview->>'authorization_version')::bigint, NULL, true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '22023', NULL, 'null impact fingerprint is rejected');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id,
      (preview->>'authorization_version')::bigint + 1, preview->>'impact_fingerprint', true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '40001', NULL, 'a stale authorization version cannot activate access');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id,
      (preview->>'authorization_version')::bigint, repeat('0', 64), true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '40001', NULL, 'a different well-formed impact fingerprint cannot activate access');

-- Equal counts do not mean equal authority. These fixtures remain valid while
-- individual permission, member, invitation, and branch scopes change.
RESET ROLE;
UPDATE public.organization_role_permissions SET permission_key = 'maintenance.view'
WHERE role_id = (SELECT role_id FROM activation_case WHERE label = 'staged');
SET LOCAL ROLE authenticated;
SELECT ok(
  (SELECT (pg_temp.activation_preview(label)->>'authorization_version')::bigint
      = (preview->>'authorization_version')::bigint
    AND pg_temp.activation_preview(label)->>'ordinary_member_count'
      = preview->>'ordinary_member_count'
    AND pg_temp.activation_preview(label)->>'live_ordinary_invitation_count'
      = preview->>'live_ordinary_invitation_count'
    AND pg_temp.activation_preview(label)->>'impact_fingerprint'
      <> preview->>'impact_fingerprint'
    AND pg_temp.activation_preview(label)->'impact_memberships'->0->'permission_keys'
      = jsonb_build_array('maintenance.view')
    AND pg_temp.activation_preview(label)->'impact_invitations'->0->'permission_keys'
      = jsonb_build_array('maintenance.view')
   FROM activation_case WHERE label = 'staged'),
  'same-count permission replacement changes the fingerprint and both displayed permission sets');
SELECT throws_ok($$SELECT pg_temp.activate_case('staged')$$,
  '40001', NULL, 'reviewed permission content must still match at activation');
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'staged';
RESET ROLE;
UPDATE public.organization_members SET user_id = (SELECT replacement_id FROM activation_actor)
WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'staged')
  AND role = 'custom';
SET LOCAL ROLE authenticated;
SELECT ok(
  (SELECT pg_temp.activation_preview(label)->>'impact_fingerprint' <> preview->>'impact_fingerprint'
     AND pg_temp.activation_preview(label)->'impact_memberships'->0->>'user_id'
       = a.replacement_id::text
     AND pg_temp.activation_preview(label)->'impact_memberships'->0->>'email'
       = a.replacement_id::text || '@activation.example.test'
     AND pg_temp.activation_preview(label)->>'ordinary_member_count' = preview->>'ordinary_member_count'
   FROM activation_case CROSS JOIN activation_actor a WHERE label = 'staged'),
  'replaced member identity appears in a refreshed consent snapshot with a new fingerprint');
SELECT throws_ok($$SELECT pg_temp.activate_case('staged')$$,
  '40001', NULL, 'same-count replacement of the ordinary member invalidates approval');
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'staged';
RESET ROLE;
UPDATE public.organization_invitations SET email = 'different@activation.example.test'
WHERE id = (SELECT invitation_id FROM activation_case WHERE label = 'staged');
SET LOCAL ROLE authenticated;
SELECT ok(
  (SELECT pg_temp.activation_preview(label)->>'impact_fingerprint' <> preview->>'impact_fingerprint'
     AND pg_temp.activation_preview(label)->'impact_invitations'->0->>'email'
       = 'different@activation.example.test'
     AND pg_temp.activation_preview(label)->>'live_ordinary_invitation_count'
       = preview->>'live_ordinary_invitation_count'
   FROM activation_case WHERE label = 'staged'),
  'changed invitation recipient appears in refreshed consent despite unchanged counts');
SELECT throws_ok($$SELECT pg_temp.activate_case('staged')$$,
  '40001', NULL, 'same-count replacement of the invitation recipient invalidates approval');
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'staged';
RESET ROLE;
UPDATE public.organization_members SET branch_id =
  (SELECT spare_branch_id FROM activation_case WHERE label = 'staged')
WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'staged')
  AND role = 'custom';
SET LOCAL ROLE authenticated;
SELECT ok(
  (SELECT pg_temp.activation_preview(label)->>'impact_fingerprint' <> preview->>'impact_fingerprint'
     AND pg_temp.activation_preview(label)->'impact_memberships'->0->>'branch_id' = spare_branch_id::text
     AND pg_temp.activation_preview(label)->'impact_memberships'->0->>'branch_name' = 'Secondary'
   FROM activation_case WHERE label = 'staged'),
  'changed membership branch appears in refreshed consent with a new fingerprint');
SELECT throws_ok($$SELECT pg_temp.activate_case('staged')$$,
  '40001', NULL, 'same-count membership branch reassignment invalidates approval');

-- A checked revocation after preview must remove activation authority.
SELECT pg_temp.activation_claims((SELECT revoked_admin_id FROM activation_actor));
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'revoked';
SELECT pg_temp.activation_claims((SELECT admin_id FROM activation_actor));
SELECT public.remove_organization_member_access(
  (SELECT organization_id FROM activation_case WHERE label = 'revoked'),
  (SELECT id FROM public.organization_members
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'revoked')
     AND user_id = (SELECT revoked_admin_id FROM activation_actor)));
SELECT pg_temp.activation_claims((SELECT revoked_admin_id FROM activation_actor));
SELECT throws_ok($$SELECT pg_temp.activation_preview('revoked')$$,
  '42501', NULL, 'a revoked administrator cannot inspect readiness');
SELECT throws_ok($$SELECT pg_temp.activate_case('revoked')$$,
  '42501', NULL, 'a revoked administrator cannot use an earlier valid preview');

RESET ROLE;
SELECT ok(
  (SELECT bool_and(NOT ordinary_access_enabled)
   FROM public.organization_authorization_states
   WHERE organization_id IN (SELECT organization_id FROM activation_case)),
  'all rejected calls leave every synthetic organization contained');
SELECT is(
  (SELECT count(*) FROM public.activity_logs
   WHERE organization_id IN (SELECT organization_id FROM activation_case)
     AND action = 'organization_ordinary_access_enabled'),
  0::bigint, 'rejected calls create no activation audit event');

-- Enforced step-up uses exact synthetic Auth sessions and an explicit grant.
-- Fixture insertion models prior verification; activation itself sends nothing.
INSERT INTO auth.sessions(id, user_id, created_at, updated_at, aal)
SELECT session_id, admin_id, now(), now(), 'aal1'::auth.aal_level FROM activation_actor
UNION ALL SELECT other_session_id, admin_id, now(), now(), 'aal1'::auth.aal_level FROM activation_actor;
INSERT INTO app_private.privileged_email_step_up_policies(
  organization_id, enforcement_enabled, enabled_at, enabled_by)
SELECT organization_id, true, now(), admin_id
FROM activation_case CROSS JOIN activation_actor WHERE label = 'bootstrap';
SELECT pg_temp.activation_claims(
  (SELECT admin_id FROM activation_actor), (SELECT session_id FROM activation_actor));
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.activation_preview('bootstrap')$$,
  'an accepted administrator can review impact before completing enforced step-up');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', 'Privileged email verification required',
  'enforced step-up protects the state transition');
RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_challenges(
  id, organization_id, user_id, session_id, code_digest, email_digest, delivery_status,
  created_at, expires_at, resend_available_at, sent_at, consumed_at)
SELECT challenge_id, organization_id, admin_id, session_id,
  repeat('a',64), repeat('b',64), 'sent',
  now()-interval '1 minute', now()+interval '9 minutes',
  now()+interval '30 seconds', now()-interval '50 seconds', now()-interval '40 seconds'
FROM activation_case CROSS JOIN activation_actor WHERE label = 'bootstrap';
INSERT INTO app_private.privileged_email_step_up_grants(
  organization_id, user_id, session_id, challenge_id, verified_at, expires_at)
SELECT organization_id, admin_id, session_id, challenge_id, now(), NULL
FROM activation_case CROSS JOIN activation_actor WHERE label = 'bootstrap';

CREATE TEMP TABLE activation_before AS
SELECT
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.organization_members m
    WHERE m.organization_id IN (SELECT organization_id FROM activation_case)) AS memberships,
  (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.organization_invitations i
    WHERE i.organization_id IN (SELECT organization_id FROM activation_case)) AS invitations,
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.organization_id) FROM public.organization_authorization_states s
    WHERE s.organization_id <> (SELECT organization_id FROM activation_case WHERE label = 'bootstrap')) AS other_states,
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM public.notification_outbox) AS notifications,
  (SELECT count(*) FROM app_private.privileged_email_step_up_challenges) AS challenges,
  (SELECT count(*) FROM app_private.privileged_email_step_up_events) AS step_up_events;
GRANT SELECT ON activation_before TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.activation_claims(
  (SELECT admin_id FROM activation_actor), (SELECT other_session_id FROM activation_actor));
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', 'Privileged email verification required',
  'a grant from another Auth session cannot authorize activation');
SELECT pg_temp.activation_claims(
  (SELECT admin_id FROM activation_actor), (SELECT session_id FROM activation_actor));
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'bootstrap';
UPDATE activation_case SET result = pg_temp.activate_case(label) WHERE label = 'bootstrap';
SELECT ok(
  (SELECT result->>'status' = 'activated'
     AND (result->>'ordinary_access_enabled')::boolean
     AND NOT (result->>'activation_ready')::boolean
     AND result->>'organization_id' = organization_id::text
     AND (result->>'authorization_version')::bigint = (preview->>'authorization_version')::bigint + 1
   FROM activation_case WHERE label = 'bootstrap'),
  'accepted, verified administrator activates the exact empty prepared workspace once');
SELECT ok(
  (SELECT s.ordinary_access_enabled
     AND s.version = (c.preview->>'authorization_version')::bigint + 1
     AND s.updated_by = a.admin_id
   FROM public.organization_authorization_states s
   JOIN activation_case c ON c.organization_id = s.organization_id
   CROSS JOIN activation_actor a WHERE c.label = 'bootstrap'),
  'the authoritative state records one version increment and the authenticated actor');
SELECT is(
  (SELECT count(*) FROM public.activity_logs l JOIN activation_case c
    ON c.organization_id = l.organization_id
   WHERE c.label = 'bootstrap' AND l.action = 'organization_ordinary_access_enabled'
     AND l.entity_type = 'organization' AND l.entity_id = c.organization_id
     AND l.actor_id = (SELECT admin_id FROM activation_actor)),
  1::bigint, 'activation records exactly one organization audit event for its actor');
SELECT ok(
  (SELECT l.previous_values->'ordinary_access_enabled' = 'false'::jsonb
     AND l.previous_values->'authorization_version' = c.preview->'authorization_version'
     AND l.previous_values->'impact_fingerprint' = c.preview->'impact_fingerprint'
     AND l.new_values->'ordinary_access_enabled' = 'true'::jsonb
     AND l.new_values->'authorization_version' = c.result->'authorization_version'
     AND l.new_values->'ordinary_member_count' = '0'::jsonb
     AND l.new_values->'live_ordinary_invitation_count' = '0'::jsonb
   FROM public.activity_logs l JOIN activation_case c ON c.organization_id = l.organization_id
   WHERE c.label = 'bootstrap' AND l.action = 'organization_ordinary_access_enabled'),
  'activation audit retains the reviewed fingerprint, before/after versions and exact impact counts');
SELECT is(pg_temp.activate_case('bootstrap')->>'status', 'already_enabled',
  'a successful retry reconciles the old reviewed version and fingerprint');
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap', false)$$,
  '22023', NULL, 'already-enabled replay still requires explicit confirmation');
SELECT throws_ok(
  $$SELECT public.activate_organization_ordinary_access(organization_id, 0, 'bad', true)
    FROM activation_case WHERE label = 'bootstrap'$$,
  '22023', NULL, 'already-enabled replay still requires well-formed preconditions');
SELECT pg_temp.activation_claims((SELECT ordinary_id FROM activation_actor));
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', NULL, 'an enabled state cannot be replayed by an unrelated ordinary user');
SELECT pg_temp.activation_claims(
  (SELECT admin_id FROM activation_actor), (SELECT session_id FROM activation_actor));
RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants SET revoked_at = now()
WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'bootstrap');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', 'Privileged email verification required',
  'already-enabled replay rechecks a revoked step-up grant');
RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants SET revoked_at = NULL
WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'bootstrap');
UPDATE auth.sessions SET not_after = now() - interval '1 second'
WHERE id = (SELECT session_id FROM activation_actor);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.activate_case('bootstrap')$$,
  '42501', 'Privileged email verification required',
  'an expired Auth session cannot replay activation despite an unrevoked grant');
RESET ROLE;

SELECT is(
  (SELECT version FROM public.organization_authorization_states
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'bootstrap')),
  (SELECT (preview->>'authorization_version')::bigint + 1 FROM activation_case WHERE label = 'bootstrap'),
  'successful and denied retries do not increment the authorization version again');
SELECT is(
  (SELECT count(*) FROM public.activity_logs
   WHERE organization_id IN (SELECT organization_id FROM activation_case)
     AND action = 'organization_ordinary_access_enabled'),
  1::bigint, 'successful and denied retries do not duplicate activation audit history');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.organization_id)
   FROM public.organization_authorization_states s
   WHERE s.organization_id <> (SELECT organization_id FROM activation_case WHERE label = 'bootstrap')),
  (SELECT other_states FROM activation_before), 'activation preserves every other organization authorization state');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.organization_members m
   WHERE m.organization_id IN (SELECT organization_id FROM activation_case)),
  (SELECT memberships FROM activation_before), 'activation and retries neither create nor change memberships');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.organization_invitations i
   WHERE i.organization_id IN (SELECT organization_id FROM activation_case)),
  (SELECT invitations FROM activation_before), 'activation and retries preserve invitation identity and delivery state');
SELECT is((SELECT count(*) FROM auth.users), (SELECT auth_users FROM activation_before),
  'activation creates no Auth accounts');
SELECT is((SELECT count(*) FROM public.notification_outbox), (SELECT notifications FROM activation_before),
  'activation queues no notification delivery');
SELECT is((SELECT count(*) FROM app_private.privileged_email_step_up_challenges),
  (SELECT challenges FROM activation_before), 'activation creates no verification email challenge');
SELECT is((SELECT count(*) FROM app_private.privileged_email_step_up_events),
  (SELECT step_up_events FROM activation_before), 'activation records no email delivery or verification event');
SELECT ok(
  (SELECT transition_manifest_required AND NOT ordinary_access_enabled
   FROM public.organization_authorization_states
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'transition')),
  'activation elsewhere does not clear unresolved transition containment');

-- A fresh review can also activate valid existing custom assignments. No role,
-- member, or invitation is manufactured by activation.
SELECT pg_temp.activation_claims((SELECT admin_id FROM activation_actor));
SET LOCAL ROLE authenticated;
UPDATE activation_case SET preview = pg_temp.activation_preview(label) WHERE label = 'staged';
UPDATE activation_case SET result = pg_temp.activate_case(label) WHERE label = 'staged';
SELECT ok(
  (SELECT result->>'status' = 'activated'
     AND (result->>'ordinary_member_count')::bigint = 1
     AND (result->>'live_ordinary_invitation_count')::bigint = 1
   FROM activation_case WHERE label = 'staged'),
  'freshly reviewed valid custom assignments can activate without bypassing containment guards');
SELECT pg_temp.activation_claims((SELECT replacement_id FROM activation_actor));
SELECT is(
  (SELECT count(*) FROM public.organization_roles
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'staged')),
  1::bigint, 'activation opens the assigned role to the existing custom member');
SELECT is(
  (SELECT count(*) FROM public.organization_roles
   WHERE organization_id = (SELECT organization_id FROM activation_case WHERE label = 'foreign')),
  0::bigint, 'activated custom access remains isolated from another organization');
SELECT throws_ok($$SELECT pg_temp.activation_preview('staged')$$,
  '42501', NULL, 'activation does not promote the custom member to administrator');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
