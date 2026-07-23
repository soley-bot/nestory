BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(25);

SELECT has_function(
  'app_private',
  'assert_staff_workspace_access_uniqueness',
  ARRAY[]::text[],
  'the migration exposes a private upgrade preflight assertion'
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
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000731'::uuid, 'existing-unlinked@example.com'),
    ('00000000-0000-0000-0000-000000000732'::uuid, 'existing-same-linked@example.com'),
    ('00000000-0000-0000-0000-000000000733'::uuid, 'existing-different-linked@example.com'),
    ('00000000-0000-0000-0000-000000000736'::uuid, 'accept-unrelated-unique@example.com')
) AS fixture_users(user_id, email);

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  legal_name,
  party_type,
  primary_email,
  created_by,
  updated_by
)
SELECT
  person_id,
  '00000000-0000-0000-0000-000000000001',
  display_name,
  display_name,
  'individual',
  email,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM (
  VALUES
    ('88300000-0000-0000-0000-000000000031'::uuid, 'Existing Unlinked Staff', 'existing-unlinked@example.com'),
    ('88300000-0000-0000-0000-000000000032'::uuid, 'Existing Same Linked Staff', 'existing-same-linked@example.com'),
    ('88300000-0000-0000-0000-000000000033'::uuid, 'Existing Different Staff', 'existing-different-linked@example.com'),
    ('88300000-0000-0000-0000-000000000034'::uuid, 'Invited Different Staff', 'invited-different@example.com'),
    ('88300000-0000-0000-0000-000000000036'::uuid, 'Unrelated Unique Staff', 'accept-unrelated-unique@example.com'),
    ('88300000-0000-0000-0000-000000000037'::uuid, 'Post Accept Staff', 'post-accept-staff@example.com')
) AS fixture_people(person_id, display_name, email);

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status,
  created_by,
  updated_by
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  person_id,
  'staff',
  'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM (
  VALUES
    ('88300000-0000-0000-0000-000000000031'::uuid),
    ('88300000-0000-0000-0000-000000000032'::uuid),
    ('88300000-0000-0000-0000-000000000033'::uuid),
    ('88300000-0000-0000-0000-000000000034'::uuid),
    ('88300000-0000-0000-0000-000000000036'::uuid),
    ('88300000-0000-0000-0000-000000000037'::uuid)
) AS fixture_roles(person_id);

INSERT INTO public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
VALUES
  (
    '00000000-0000-0000-0000-000000000731',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000731',
    'member',
    NULL,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000732',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000732',
    'member',
    '88300000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000211'
  ),
  (
    '00000000-0000-0000-0000-000000000733',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000733',
    'member',
    '88300000-0000-0000-0000-000000000033',
    '00000000-0000-0000-0000-000000000211'
  );

INSERT INTO public.organization_invitations (
  id,
  organization_id,
  email,
  role,
  branch_id,
  person_id,
  status,
  invited_by,
  expires_at
)
VALUES
  (
    '89300000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000001',
    'existing-unlinked@example.com',
    'admin',
    '00000000-0000-0000-0000-000000000212',
    '88300000-0000-0000-0000-000000000031',
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  ),
  (
    '89300000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000001',
    'existing-same-linked@example.com',
    'manager',
    '00000000-0000-0000-0000-000000000212',
    '88300000-0000-0000-0000-000000000032',
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  ),
  (
    '89300000-0000-0000-0000-000000000033',
    '00000000-0000-0000-0000-000000000001',
    'existing-different-linked@example.com',
    'manager',
    '00000000-0000-0000-0000-000000000212',
    '88300000-0000-0000-0000-000000000034',
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  ),
  (
    '89300000-0000-0000-0000-000000000034',
    '00000000-0000-0000-0000-000000000001',
    'nestory@gmail.com',
    'manager',
    '00000000-0000-0000-0000-000000000212',
    '80300000-0000-0000-0000-000000000001',
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  ),
  (
    '89300000-0000-0000-0000-000000000035',
    '00000000-0000-0000-0000-000000000001',
    'handler-create@example.com',
    'member',
    NULL,
    NULL,
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  ),
  (
    '89300000-0000-0000-0000-000000000036',
    '00000000-0000-0000-0000-000000000001',
    'accept-unrelated-unique@example.com',
    'member',
    NULL,
    '88300000-0000-0000-0000-000000000036',
    'pending',
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 hour'
  );

SELECT throws_ok(
  $$SELECT app_private.assert_staff_workspace_access_uniqueness()$$,
  '23505',
  'Cannot enforce Staff access uniqueness: linked memberships overlap live Staff invitations',
  'upgrade preflight rejects member and live-invitation overlap for the same Staff record'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000731', true);
SELECT lives_ok(
  $$SELECT public.accept_organization_invitation(
    '89300000-0000-0000-0000-000000000031'
  )$$,
  'an existing unlinked membership can accept its Staff-linked invitation'
);
SELECT is(
  (
    SELECT role || ':' || person_id::text || ':' || branch_id::text
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000731'
  ),
  'admin:88300000-0000-0000-0000-000000000031:00000000-0000-0000-0000-000000000212',
  'acceptance applies the invited access level, Staff link, and scope'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000031'
  ),
  'accepted',
  'the unlinked-membership invitation is accepted only after its link is applied'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT public.update_organization_member_access(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000731',
  'member',
  '88300000-0000-0000-0000-000000000037',
  '00000000-0000-0000-0000-000000000211'
);
CREATE TEMP TABLE accepted_retry_state (membership_id uuid) ON COMMIT DROP;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000731', true);
SELECT lives_ok(
  $$INSERT INTO accepted_retry_state (membership_id)
    SELECT public.accept_organization_invitation(
      '89300000-0000-0000-0000-000000000031'
    )$$,
  'retrying an accepted invitation returns without replaying its privileges'
);
SELECT is(
  (SELECT membership_id FROM accepted_retry_state),
  '00000000-0000-0000-0000-000000000731'::uuid,
  'the inert retry returns the existing membership ID'
);
SELECT is(
  (
    SELECT role || ':' || person_id::text || ':' || branch_id::text
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000731'
  ),
  'member:88300000-0000-0000-0000-000000000037:00000000-0000-0000-0000-000000000211',
  'accepted-invitation retry preserves later role, Staff, and scope changes'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'organization_invitation'
      AND entity_id = '89300000-0000-0000-0000-000000000031'
      AND action = 'organization_invitation_accepted'
  ),
  1::bigint,
  'accepted-invitation retry does not append another acceptance audit event'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000732', true);
SELECT lives_ok(
  $$SELECT public.accept_organization_invitation(
    '89300000-0000-0000-0000-000000000032'
  )$$,
  'an existing membership linked to the same Staff record can accept updated access configuration'
);
SELECT is(
  (
    SELECT role || ':' || person_id::text || ':' || branch_id::text
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000732'
  ),
  'manager:88300000-0000-0000-0000-000000000032:00000000-0000-0000-0000-000000000212',
  'same-Staff acceptance applies the invited access level and scope'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000032'
  ),
  'accepted',
  'the same-Staff invitation records acceptance after configuration update'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000733', true);
SELECT throws_ok(
  $$SELECT public.accept_organization_invitation(
    '89300000-0000-0000-0000-000000000033'
  )$$,
  '23505',
  'This account is linked to a different staff member',
  'acceptance cannot silently replace a different existing Staff link'
);
SELECT is(
  (
    SELECT person_id
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000733'
  ),
  '88300000-0000-0000-0000-000000000033'::uuid,
  'a rejected changed-Staff acceptance preserves the existing membership link'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000033'
  ),
  'pending',
  'a rejected changed-Staff invitation remains live for administrator resolution'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_ok(
  $$SELECT public.accept_organization_invitation(
    '89300000-0000-0000-0000-000000000034'
  )$$,
  '55000',
  'The final administrator cannot be demoted',
  'acceptance preserves the final-administrator invariant'
);
SELECT is(
  (
    SELECT role || ':' || person_id::text || ':' || branch_id::text
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000201'
  ),
  'admin:80300000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000211',
  'a rejected final-administrator acceptance preserves the active configuration'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000034'
  ),
  'pending',
  'a rejected final-administrator invitation remains live'
);

CREATE UNIQUE INDEX staff_access_unrelated_activity_uidx
  ON public.activity_logs (organization_id, entity_type, entity_id, action)
  WHERE entity_id IN (
    '89300000-0000-0000-0000-000000000035',
    '00000000-0000-0000-0000-000000000503',
    '89300000-0000-0000-0000-000000000036'
  );

SELECT public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'handler-create@example.com',
  'member',
  NULL,
  NULL
);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'handler-create@example.com',
    'member',
    NULL,
    NULL
  )$$,
  '23505',
  'duplicate key value violates unique constraint "staff_access_unrelated_activity_uidx"',
  'invitation creation rethrows unrelated unique violations unchanged'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000035'
  ),
  'pending',
  'an unrelated create failure leaves the invitation live'
);

SELECT public.update_organization_member_access(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000503',
  'manager',
  '80300000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000211'
);
SELECT throws_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000503',
    'manager',
    '80300000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000211'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "staff_access_unrelated_activity_uidx"',
  'member access updates rethrow unrelated unique violations unchanged'
);
SELECT is(
  (
    SELECT role || ':' || person_id::text || ':' || branch_id::text
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000503'
  ),
  'manager:80300000-0000-0000-0000-000000000002:00000000-0000-0000-0000-000000000211',
  'an unrelated update failure preserves the last successful configuration'
);

INSERT INTO public.activity_logs (
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  new_values
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'organization_invitation',
  '89300000-0000-0000-0000-000000000036',
  'organization_invitation_accepted',
  '{}'::jsonb
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000736', true);
SELECT throws_ok(
  $$SELECT public.accept_organization_invitation(
    '89300000-0000-0000-0000-000000000036'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "staff_access_unrelated_activity_uidx"',
  'invitation acceptance rethrows unrelated unique violations unchanged'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '00000000-0000-0000-0000-000000000736'
  ),
  0::bigint,
  'an unrelated acceptance failure rolls back membership creation'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = '89300000-0000-0000-0000-000000000036'
  ),
  'pending',
  'an unrelated acceptance failure leaves the invitation live'
);

SELECT * FROM finish();
ROLLBACK;
