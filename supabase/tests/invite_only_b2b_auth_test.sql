BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(32);

SELECT has_table('public', 'organization_invitations', 'invitation domain exists');
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
  '00000000-0000-0000-0000-000000000701',
  'authenticated',
  'authenticated',
  'invitee@example.com',
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000702',
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
  '00000000-0000-0000-0000-000000000703',
  'authenticated',
  'authenticated',
  'unverified@example.com',
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  NULL, '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"email":"invitee@example.com"}'::jsonb,
  now(), now()
);

CREATE TEMP TABLE invitation_test_state (
  invitation_id uuid,
  member_id uuid,
  revoked_invitation_id uuid,
  expired_invitation_id uuid
) ON COMMIT DROP;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'blocked-manager@example.com',
    'member',
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
    'member',
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
    'member',
    '00000000-0000-0000-0000-000000009999',
    NULL
  )$$,
  '23503',
  'Branch not found',
  'cross-organization or missing branches are rejected'
);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'cross-person@example.com',
    'member',
    NULL,
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
  'member',
  '00000000-0000-0000-0000-000000000211',
  '80300000-0000-0000-0000-000000000003'
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
    'member',
    '00000000-0000-0000-0000-000000000211',
    '80300000-0000-0000-0000-000000000003'
  ),
  (SELECT invitation_id FROM invitation_test_state),
  'resend preparation refreshes the active invitation instead of duplicating it'
);
SELECT is(
  (SELECT count(*) FROM public.organization_invitations WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND email = 'invitee@example.com' AND status IN ('pending', 'send_failed')),
  1::bigint,
  'only one active invitation exists per organization and email'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '42501',
  'Verified email is required',
  'unverified users cannot claim an invitation by spoofing user metadata'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT invitation_id FROM invitation_test_state)
  ),
  '42501',
  'Invitation email does not match the authenticated user',
  'acceptance rejects a mismatched signed-in account'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
UPDATE invitation_test_state
SET member_id = public.accept_organization_invitation(invitation_id);
SELECT ok(
  (SELECT member_id IS NOT NULL FROM invitation_test_state),
  'matching verified email accepts the invitation'
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
  (SELECT count(*) FROM public.organization_members WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND user_id = '00000000-0000-0000-0000-000000000701'),
  1::bigint,
  'acceptance never duplicates membership'
);

SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000000001'),
  1::bigint,
  'accepted membership grants access through organization RLS'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000201',
    'manager',
    '80300000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000211'
  )$$,
  '55000',
  'The final administrator cannot be demoted',
  'final administrator demotion is rejected in SQL'
);
SELECT throws_ok(
  $$SELECT public.remove_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000201'
  )$$,
  '55000',
  'The final administrator cannot be removed',
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

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
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
  'member', NULL, NULL
),
expired_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'expired@example.com',
  'member', NULL, NULL
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

UPDATE auth.users SET email = 'revoked@example.com' WHERE id = '00000000-0000-0000-0000-000000000702';
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT revoked_invitation_id FROM invitation_test_state)
  ),
  '55000',
  'Invitation is not available',
  'revoked invitations cannot be accepted'
);
UPDATE auth.users SET email = 'expired@example.com' WHERE id = '00000000-0000-0000-0000-000000000702';
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
