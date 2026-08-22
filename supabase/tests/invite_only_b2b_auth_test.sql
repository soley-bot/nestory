BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(60);
UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.organization_members
SET
  role = CASE user_id
    WHEN '00000000-0000-0000-0000-000000000701'::uuid THEN 'finance_manager'
    WHEN '00000000-0000-0000-0000-000000000801'::uuid THEN 'finance_member'
    WHEN '00000000-0000-0000-0000-000000000501'::uuid THEN 'operations_manager'
    WHEN '00000000-0000-0000-0000-000000000601'::uuid THEN 'operations_member'
  END,
  person_id = CASE user_id
    WHEN '00000000-0000-0000-0000-000000000501'::uuid
      THEN '80000000-0000-0000-0000-000000000007'::uuid
    WHEN '00000000-0000-0000-0000-000000000601'::uuid
      THEN '80000000-0000-0000-0000-000000000008'::uuid
    ELSE NULL
  END,
  branch_id = CASE
    WHEN user_id IN (
      '00000000-0000-0000-0000-000000000501'::uuid,
      '00000000-0000-0000-0000-000000000601'::uuid
    ) THEN '00000000-0000-0000-0000-000000000211'::uuid
    ELSE NULL
  END,
  custom_role_id = NULL
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND user_id IN (
    '00000000-0000-0000-0000-000000000501'::uuid,
    '00000000-0000-0000-0000-000000000601'::uuid,
    '00000000-0000-0000-0000-000000000701'::uuid,
    '00000000-0000-0000-0000-000000000801'::uuid
  );


SELECT has_table('public', 'organization_invitations', 'invitation domain exists');
SELECT has_table(
  'app_private',
  'invitation_password_challenges',
  'provider-generated invitation passwords are tracked privately'
);
SELECT has_table(
  'app_private',
  'auth_password_credential_proofs',
  'positive password credential proof is tracked privately'
);
SELECT is(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'app_private.auth_password_credential_proofs'::regclass
  ),
  true,
  'the private credential-proof table has RLS enabled'
);
SELECT ok(
  NOT has_table_privilege(
    'anon',
    'app_private.auth_password_credential_proofs',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'app_private.auth_password_credential_proofs',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'service_role',
    'app_private.auth_password_credential_proofs',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'no API role has direct credential-proof table privileges'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.record_auth_password_credential_proof(uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.record_auth_password_credential_proof(uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.record_auth_password_credential_proof(uuid,text)',
    'EXECUTE'
  ),
  'only the trusted service role may establish credential proof'
);
SELECT has_function(
  'public',
  'provision_client_workspace',
  ARRAY['text', 'text', 'text'],
  'service-role provisioning boundary exists'
);
SELECT has_function(
  'public',
  'create_organization_invitation',
  ARRAY['uuid', 'text', 'text', 'uuid', 'uuid'],
  'checked invitation creation boundary exists'
);
SELECT has_function(
  'public',
  'accept_organization_invitation',
  ARRAY['uuid'],
  'atomic invitation acceptance boundary exists'
);
SELECT has_function(
  'public',
  'remove_organization_member_access',
  ARRAY['uuid', 'uuid'],
  'checked membership removal boundary exists'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.bootstrap_admin_organization(text,text)'),
      'EXECUTE'
    ),
    false
  ),
  'ordinary authenticated users cannot bootstrap organizations'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.provision_client_workspace(text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.provision_client_workspace(text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.provision_client_workspace(text,text,text)',
    'EXECUTE'
  ),
  'workspace provisioning is service-role only'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.organization_invitations', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.organization_invitations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.organization_invitations', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.organization_invitations', 'DELETE'),
  'authenticated table access is read-only and RLS constrained'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_organization_invitation(uuid,text,text,uuid,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.accept_organization_invitation(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke invitation RPCs'
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'invitee@example.com',
  extensions.crypt('provider-generated-invite-secret', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'other@example.com',
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'unverified@example.com',
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  NULL, '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"email":"invitee@example.com"}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000004',
  'authenticated',
  'authenticated',
  'magic-manager@example.com',
  extensions.crypt('unknown-existing-password', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000005',
  'authenticated',
  'authenticated',
  'magic-admin@example.com',
  extensions.crypt('unknown-admin-password', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000006',
  'authenticated',
  'authenticated',
  'magic-member@example.com',
  extensions.crypt('unknown-member-password', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-0000-0000-000000000007',
  'authenticated',
  'authenticated',
  'brand-new@example.com',
  NULL,
  NULL, '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
);

CREATE TEMP TABLE invitation_test_state (
  invitation_id uuid,
  member_id uuid,
  revoked_invitation_id uuid,
  expired_invitation_id uuid,
  magic_link_invitation_id uuid,
  magic_admin_invitation_id uuid,
  magic_member_invitation_id uuid,
  proven_invitation_id uuid,
  brand_new_invitation_id uuid
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.probe_invitation_acceptance(p_invitation_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  rejection_message text;
BEGIN
  BEGIN
    PERFORM public.accept_organization_invitation(p_invitation_id);
    RAISE EXCEPTION 'accepted unexpectedly' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      GET STACKED DIAGNOSTICS rejection_message = MESSAGE_TEXT;
      RETURN rejection_message;
    WHEN SQLSTATE 'P0001' THEN
      RETURN 'accepted unexpectedly';
  END;
END;
$$;

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  party_type,
  primary_email
)
VALUES (
  '80300000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'Invitation Operations Member',
  'individual',
  'invitee@example.com'
);

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '80300000-0000-0000-0000-000000000004',
  'staff',
  'active'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'blocked-manager@example.com',
    'finance_member',
    NULL,
    NULL
  )$$,
  '42501',
  'Not authorized',
  'managers cannot create invitations'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'blocked-member@example.com',
    'finance_member',
    NULL,
    NULL
  )$$,
  '42501',
  'Not authorized',
  'members cannot create invitations'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'cross-scope@example.com',
    'operations_member',
    '00000000-0000-0000-0000-000000009999',
    '80300000-0000-0000-0000-000000000004'
  )$$,
  '23503',
  'Branch not found',
  'cross-organization or missing branches are rejected'
);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'cross-person@example.com',
    'operations_member',
    '00000000-0000-0000-0000-000000000211',
    '00000000-0000-0000-0000-000000009999'
  )$$,
  '23503',
  'Person not found',
  'cross-organization or missing staff links are rejected'
);

INSERT INTO invitation_test_state (invitation_id)
SELECT public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  ' Invitee@Example.com ',
  'operations_member',
  '00000000-0000-0000-0000-000000000211',
  '80300000-0000-0000-0000-000000000004'
);

SELECT is(
  (SELECT email FROM public.organization_invitations WHERE id = (SELECT invitation_id FROM invitation_test_state)),
  'invitee@example.com',
  'invitation email is normalized'
);
SELECT is(
  public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'invitee@example.com',
    'operations_member',
    '00000000-0000-0000-0000-000000000211',
    '80300000-0000-0000-0000-000000000004'
  ),
  (SELECT invitation_id FROM invitation_test_state),
  'resend preparation refreshes the active invitation instead of duplicating it'
);
SELECT is(
  (SELECT count(*) FROM public.organization_invitations WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND email = 'invitee@example.com' AND status IN ('pending', 'send_failed')),
  1::bigint,
  'only one active invitation exists per organization and email'
);

UPDATE invitation_test_state
SET brand_new_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'brand-new@example.com',
  'finance_manager',
  NULL,
  NULL
);
SELECT lives_ok(
  format(
    'SELECT public.mark_organization_invitation_sent(%L, %L, %L)',
    (SELECT brand_new_invitation_id FROM invitation_test_state),
    '97000000-0000-0000-0000-000000000007',
    'invite'
  ),
  'brand-new Auth identities without a provider password hash still finalize delivery'
);
SELECT is(
  (
    SELECT count(*)
    FROM app_private.invitation_password_challenges
    WHERE invitation_id = (SELECT brand_new_invitation_id FROM invitation_test_state)
  ),
  0::bigint,
  'an empty provider password hash does not create a fake challenge'
);
UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = '97000000-0000-0000-0000-000000000007';
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000007', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT brand_new_invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'brand-new invite recipients with an empty hash must create a password'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
UPDATE invitation_test_state
SET magic_link_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'magic-manager@example.com',
  'finance_manager',
  NULL,
  NULL
);
SELECT public.mark_organization_invitation_sent(
  (SELECT magic_link_invitation_id FROM invitation_test_state),
  NULL,
  'magic_link'
);
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000004', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT magic_link_invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'a fresh Manager magic-link invitation without private proof requires password setup'
);
SELECT is(
  pg_temp.probe_invitation_acceptance(
    (SELECT magic_link_invitation_id FROM invitation_test_state)
  ),
  'Password setup is required',
  'direct acceptance rejects a non-empty Auth hash without private proof'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
UPDATE invitation_test_state
SET
  magic_admin_invitation_id = public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'magic-admin@example.com',
    'super_admin',
    NULL,
    NULL
  ),
  magic_member_invitation_id = public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'magic-member@example.com',
    'finance_member',
    NULL,
    NULL
  ),
  proven_invitation_id = public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'other@example.com',
    'finance_member',
    NULL,
    NULL
  );
SELECT public.mark_organization_invitation_sent(
  (SELECT magic_admin_invitation_id FROM invitation_test_state),
  NULL,
  'magic_link'
);
SELECT public.mark_organization_invitation_sent(
  (SELECT magic_member_invitation_id FROM invitation_test_state),
  NULL,
  'magic_link'
);
SELECT public.mark_organization_invitation_sent(
  (SELECT proven_invitation_id FROM invitation_test_state),
  NULL,
  'magic_link'
);

SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000005', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT magic_admin_invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'Admin invitations use the same fail-closed credential rule'
);
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000006', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT magic_member_invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'Member invitations use the same fail-closed credential rule'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO app_private.auth_password_credential_proofs (
    auth_user_id,
    password_hash_fingerprint,
    proof_method
  ) VALUES (
    '97000000-0000-0000-0000-000000000002',
    '\x00'::bytea,
    'password_login'
  )$$,
  '42501',
  'permission denied for table auth_password_credential_proofs',
  'ordinary authenticated callers cannot mutate credential proof'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.record_auth_password_credential_proof(
    '97000000-0000-0000-0000-000000000002',
    'password_login'
  )$$,
  'the trusted password-login boundary can establish proof'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM app_private.auth_password_credential_proofs
    WHERE auth_user_id = '97000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'positive proof stores one current password fingerprint'
);
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT proven_invitation_id FROM invitation_test_state)
    )
  ),
  false,
  'a fresh magic-link invitation may reuse a positively proven password'
);
SELECT lives_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT proven_invitation_id FROM invitation_test_state)
  ),
  'positive credential proof permits direct invitation acceptance'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT public.mark_organization_invitation_sent(
  (SELECT invitation_id FROM invitation_test_state),
  '97000000-0000-0000-0000-000000000001',
  'invite'
);
DELETE FROM app_private.invitation_password_challenges
WHERE invitation_id = (SELECT invitation_id FROM invitation_test_state);
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'invite delivery without a provider-hash challenge fails closed'
);
SELECT is(
  pg_temp.probe_invitation_acceptance(
    (SELECT invitation_id FROM invitation_test_state)
  ),
  'Password setup is required',
  'invite acceptance without proof of provider-hash replacement fails closed'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT public.mark_organization_invitation_sent(
  (SELECT invitation_id FROM invitation_test_state),
  '97000000-0000-0000-0000-000000000001',
  'invite'
);
SELECT public.mark_organization_invitation_sent(
  (SELECT invitation_id FROM invitation_test_state),
  NULL,
  'magic_link'
);
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'a provider-generated invite hash still requires password setup after resend switches delivery to magic link'
);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '55000',
  'Password setup is required',
  'direct acceptance rejects an unchanged provider-generated invite hash'
);
UPDATE auth.users
SET encrypted_password = NULL
WHERE id = '97000000-0000-0000-0000-000000000001';
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT invitation_id FROM invitation_test_state)
    )
  ),
  true,
  'a null Auth password hash requires password setup regardless of invitation delivery method'
);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '55000',
  'Password setup is required',
  'direct acceptance rejects a confirmed identity with a null password hash'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT invitation_id FROM invitation_test_state)
  ),
  'pending',
  'passwordless acceptance attempts leave the invitation pending'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '97000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'passwordless acceptance attempts do not create membership'
);
UPDATE auth.users
SET encrypted_password = extensions.crypt('123456789', extensions.gen_salt('bf'))
WHERE id = '97000000-0000-0000-0000-000000000001';
SELECT is(
  (
    SELECT password_required
    FROM public.get_organization_invitation_for_acceptance(
      (SELECT invitation_id FROM invitation_test_state)
    )
  ),
  false,
  'an existing password identity skips password setup even when the invitation was resent by magic link'
);

SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '42501',
  'Verified email is required',
  'unverified users cannot claim an invitation by spoofing user metadata'
);

SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '42501',
  'Invitation email does not match the authenticated user',
  'acceptance rejects a mismatched signed-in account'
);

SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
UPDATE invitation_test_state
SET member_id = public.accept_organization_invitation(invitation_id);
SELECT ok(
  (SELECT member_id IS NOT NULL FROM invitation_test_state),
  'matching verified email accepts the invitation after password setup'
);
SELECT is(
  (SELECT status FROM public.organization_invitations WHERE id = (SELECT invitation_id FROM invitation_test_state)),
  'accepted',
  'acceptance records the invitation lifecycle state'
);
SELECT is(
  public.accept_organization_invitation((SELECT invitation_id FROM invitation_test_state)),
  (SELECT member_id FROM invitation_test_state),
  'acceptance is idempotent'
);
SELECT is(
  (SELECT count(*) FROM public.organization_members WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND user_id = '97000000-0000-0000-0000-000000000001'),
  1::bigint,
  'acceptance never duplicates membership'
);
SELECT is(
  (
    SELECT count(*)
    FROM app_private.invitation_password_challenges
    WHERE invitation_id = (SELECT invitation_id FROM invitation_test_state)
  ),
  0::bigint,
  'successful invitation acceptance clears its provider-generated challenge'
);
SELECT is(
  (
    SELECT count(*)
    FROM app_private.auth_password_credential_proofs
    WHERE auth_user_id = '97000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'provider-password replacement becomes durable credential proof'
);

SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000001'),
  0::bigint,
  'accepted legacy membership remains contained until scoped custom access is assigned'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id
      FROM public.organization_members
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000101'
    ),
    'finance_manager',
    NULL,
    NULL
  ),
  '55000',
  'The final Super Admin cannot be demoted',
  'final administrator demotion is rejected in SQL'
);
SELECT throws_ok(
  format(
    'SELECT public.remove_organization_member_access(%L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id
      FROM public.organization_members
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000101'
    )
  ),
  '55000',
  'The final Super Admin cannot be removed',
  'final administrator removal is rejected in SQL'
);

SELECT lives_ok(
  format(
    'SELECT public.remove_organization_member_access(%L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT member_id FROM invitation_test_state)
  ),
  'an administrator can remove ordinary active access'
);
SELECT is(
  (SELECT count(*) FROM public.organization_members WHERE id = (SELECT member_id FROM invitation_test_state)),
  0::bigint,
  'membership removal immediately removes membership-based access'
);

SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000001'),
  0::bigint,
  'removed membership immediately loses access through organization RLS'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
UPDATE invitation_test_state
SET revoked_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'revoked@example.com',
  'finance_member', NULL, NULL
),
expired_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'expired@example.com',
  'finance_member', NULL, NULL
);
SELECT lives_ok(
  format(
    'SELECT public.revoke_organization_invitation(%L)',
    (SELECT revoked_invitation_id FROM invitation_test_state)
  ),
  'an administrator can revoke a pending invitation'
);
UPDATE public.organization_invitations
SET expires_at = now() - interval '1 minute'
WHERE id = (SELECT expired_invitation_id FROM invitation_test_state);

UPDATE auth.users SET email = 'revoked@example.com' WHERE id = '97000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT revoked_invitation_id FROM invitation_test_state)
  ),
  '55000',
  'Invitation is not available',
  'revoked invitations cannot be accepted'
);
UPDATE auth.users SET email = 'expired@example.com' WHERE id = '97000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT expired_invitation_id FROM invitation_test_state)
  ),
  '55000',
  'Invitation has expired',
  'expired invitations cannot be accepted'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.organization_invitations),
  0::bigint,
  'invitation RLS hides rows from non-admin workspace members'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
