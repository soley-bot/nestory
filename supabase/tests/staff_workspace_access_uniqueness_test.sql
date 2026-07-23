BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(31);

SELECT has_index(
  'public',
  'organization_members',
  'organization_members_org_person_uidx',
  'a Staff record can be linked to only one membership per organization'
);
SELECT has_index(
  'public',
  'organization_invitations',
  'organization_invitations_live_person_uidx',
  'a Staff record can have only one live invitation per organization'
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
    ('00000000-0000-0000-0000-000000000711'::uuid, 'duplicate-member@example.com'),
    ('00000000-0000-0000-0000-000000000712'::uuid, 'legacy-one@example.com'),
    ('00000000-0000-0000-0000-000000000713'::uuid, 'legacy-two@example.com'),
    ('00000000-0000-0000-0000-000000000714'::uuid, 'cross-org-member@example.com'),
    ('00000000-0000-0000-0000-000000000715'::uuid, 'accept-conflict@example.com'),
    ('00000000-0000-0000-0000-000000000716'::uuid, 'linked-before-accept@example.com')
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
VALUES
  (
    '88300000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Invitation Staff',
    'Invitation Staff',
    'individual',
    'invitation-staff@example.com',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '88300000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Different Staff Same Email',
    'Different Staff Same Email',
    'individual',
    'different-staff-same-email@example.com',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '88300000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    'Acceptance Staff',
    'Acceptance Staff',
    'individual',
    'accept-conflict@example.com',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '88300000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000002',
    'Other Workspace Staff',
    'Other Workspace Staff',
    'individual',
    'other-workspace-staff@example.com',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000301'
  ),
  (
    '88300000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000002',
    'Other Workspace Invite Staff',
    'Other Workspace Invite Staff',
    'individual',
    'other-workspace-invite-staff@example.com',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000301'
  );

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status,
  created_by,
  updated_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '88300000-0000-0000-0000-000000000010',
    'staff',
    'active',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '88300000-0000-0000-0000-000000000011',
    'staff',
    'active',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '88300000-0000-0000-0000-000000000012',
    'staff',
    'active',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '88300000-0000-0000-0000-000000000020',
    'staff',
    'active',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000301'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '88300000-0000-0000-0000-000000000021',
    'staff',
    'active',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000301'
  );

SELECT throws_ok(
  $$INSERT INTO public.organization_members (
      id, organization_id, user_id, role, person_id
    ) VALUES (
      '00000000-0000-0000-0000-000000000721',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000711',
      'member',
      '80300000-0000-0000-0000-000000000001'
    )$$,
  '23505',
  NULL,
  'the membership constraint rejects a second link to the same Staff record'
);
DELETE FROM public.organization_members
WHERE id = '00000000-0000-0000-0000-000000000721';

SELECT lives_ok(
  $$INSERT INTO public.organization_members (
      id, organization_id, user_id, role, person_id
    ) VALUES
      (
        '00000000-0000-0000-0000-000000000722',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000712',
        'member',
        NULL
      ),
      (
        '00000000-0000-0000-0000-000000000723',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000713',
        'member',
        NULL
      )$$,
  'multiple legacy memberships without Staff links remain valid'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE id IN (
      '00000000-0000-0000-0000-000000000722',
      '00000000-0000-0000-0000-000000000723'
    )
      AND person_id IS NULL
  ),
  2::bigint,
  'legacy unlinked memberships remain unmodified'
);

SELECT lives_ok(
  $$INSERT INTO public.organization_members (
      id, organization_id, user_id, role, person_id
    ) VALUES (
      '00000000-0000-0000-0000-000000000724',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000714',
      'member',
      '88300000-0000-0000-0000-000000000020'
    )$$,
  'a different organization can link its own Staff record'
);

CREATE TEMP TABLE staff_access_test_state (
  first_invitation_id uuid,
  replacement_invitation_id uuid,
  recoverable_invitation_id uuid,
  accept_conflict_invitation_id uuid,
  cross_org_invitation_id uuid
) ON COMMIT DROP;
INSERT INTO staff_access_test_state DEFAULT VALUES;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
UPDATE staff_access_test_state
SET first_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'first-invitation@example.com',
  'member',
  NULL,
  '88300000-0000-0000-0000-000000000010'
);
SELECT ok(
  (SELECT first_invitation_id IS NOT NULL FROM staff_access_test_state),
  'an administrator can create the first Staff-linked invitation'
);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'different-email@example.com',
    'member',
    NULL,
    '88300000-0000-0000-0000-000000000010'
  )$$,
  '23505',
  'This staff member already has an active invitation',
  'a second live invitation for the same Staff record is rejected with bounded guidance'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_invitations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND person_id = '88300000-0000-0000-0000-000000000010'
      AND status IN ('pending', 'send_failed')
  ),
  1::bigint,
  'duplicate invitation attempts leave exactly one live invitation'
);

UPDATE public.organization_invitations
SET expires_at = now() - interval '1 minute'
WHERE id = (SELECT first_invitation_id FROM staff_access_test_state);
UPDATE staff_access_test_state
SET replacement_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'replacement-invitation@example.com',
  'member',
  NULL,
  '88300000-0000-0000-0000-000000000010'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT first_invitation_id FROM staff_access_test_state)
  ),
  'expired',
  'an effectively expired invitation is normalized before replacement'
);
SELECT isnt(
  (SELECT replacement_invitation_id FROM staff_access_test_state),
  (SELECT first_invitation_id FROM staff_access_test_state),
  'a replacement invitation receives its own history record'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_invitations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND person_id = '88300000-0000-0000-0000-000000000010'
  ),
  2::bigint,
  'expired invitation history is retained beside the single live replacement'
);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'replacement-invitation@example.com',
    'manager',
    '00000000-0000-0000-0000-000000000212',
    '88300000-0000-0000-0000-000000000011'
  )$$,
  '23505',
  'An active invitation already exists for this email',
  'the same email cannot silently replace its validated Staff link'
);
SELECT is(
  (
    SELECT person_id
    FROM public.organization_invitations
    WHERE id = (SELECT replacement_invitation_id FROM staff_access_test_state)
  ),
  '88300000-0000-0000-0000-000000000010'::uuid,
  'a changed-person retry leaves the original Staff link intact'
);

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    (SELECT first_invitation_id FROM staff_access_test_state)
  ),
  '23505',
  'This staff member already has an active invitation',
  'an old expired invitation cannot displace a newer live Staff invitation'
);

UPDATE staff_access_test_state
SET recoverable_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'recoverable-expired@example.com',
  'manager',
  '00000000-0000-0000-0000-000000000212',
  '88300000-0000-0000-0000-000000000011'
);
UPDATE public.organization_invitations
SET status = 'expired', expires_at = now() - interval '1 minute'
WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state);

SELECT lives_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  'an administrator can resend a materialized expired invitation'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  'pending',
  'resending an expired invitation restores its pending state'
);
SELECT ok(
  (
    SELECT expires_at > now()
    FROM public.organization_invitations
    WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  'resending an expired invitation issues a new expiration window'
);
SELECT is(
  (
    SELECT person_id
    FROM public.organization_invitations
    WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  '88300000-0000-0000-0000-000000000011'::uuid,
  'resending preserves the validated Staff link'
);

UPDATE public.organization_invitations
SET status = 'expired', expires_at = now() - interval '1 minute'
WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state);
SELECT lives_ok(
  format(
    'SELECT public.revoke_organization_invitation(%L)',
    (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  'an administrator can revoke a materialized expired invitation'
);
SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT recoverable_invitation_id FROM staff_access_test_state)
  ),
  'revoked',
  'revoking an expired invitation closes its lifecycle'
);

SELECT lives_ok(
  $$SELECT public.create_organization_invitation(
      '00000000-0000-0000-0000-000000000001',
      'legacy-invite-one@example.com',
      'member',
      NULL,
      NULL
    );
    SELECT public.create_organization_invitation(
      '00000000-0000-0000-0000-000000000001',
      'legacy-invite-two@example.com',
      'member',
      NULL,
      NULL
    )$$,
  'multiple invitations without Staff links remain valid'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_invitations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND person_id IS NULL
      AND email LIKE 'legacy-invite-%'
      AND status IN ('pending', 'send_failed')
  ),
  2::bigint,
  'legacy unlinked invitations are not collapsed by Staff uniqueness'
);

SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'already-linked@example.com',
    'member',
    NULL,
    '80300000-0000-0000-0000-000000000001'
  )$$,
  '23505',
  'This staff member already has workspace access',
  'invitation creation rejects a Staff record already linked to a membership'
);

SELECT throws_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000603',
    'member',
    '80300000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000211'
  )$$,
  '23505',
  'This staff member already has workspace access',
  'member linking rejects a Staff record already linked to another membership'
);
SELECT throws_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000603',
    'member',
    '88300000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000211'
  )$$,
  '23505',
  'This staff member already has an active invitation',
  'member linking cannot race ahead of an existing live Staff invitation'
);

UPDATE staff_access_test_state
SET accept_conflict_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000001',
  'accept-conflict@example.com',
  'member',
  NULL,
  '88300000-0000-0000-0000-000000000012'
);
INSERT INTO public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  person_id
)
VALUES (
  '00000000-0000-0000-0000-000000000725',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000716',
  'member',
  '88300000-0000-0000-0000-000000000012'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000715', true);
SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    (SELECT accept_conflict_invitation_id FROM staff_access_test_state)
  ),
  '23505',
  'This staff member already has workspace access',
  'invitation acceptance rejects a Staff record linked after invitation creation'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
UPDATE staff_access_test_state
SET cross_org_invitation_id = public.create_organization_invitation(
  '00000000-0000-0000-0000-000000000002',
  'other-workspace-invite@example.com',
  'member',
  NULL,
  '88300000-0000-0000-0000-000000000021'
);
SELECT ok(
  (SELECT cross_org_invitation_id IS NOT NULL FROM staff_access_test_state),
  'another organization can invite its own Staff record'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_ok(
  $$SELECT public.create_organization_invitation(
    '00000000-0000-0000-0000-000000000001',
    'cross-organization-person@example.com',
    'member',
    NULL,
    '88300000-0000-0000-0000-000000000020'
  )$$,
  '23503',
  'Person not found',
  'Staff links remain organization scoped'
);

SELECT throws_ok(
  $$INSERT INTO public.organization_invitations (
      organization_id,
      email,
      role,
      person_id,
      status,
      invited_by,
      expires_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'direct-duplicate@example.com',
      'member',
      '88300000-0000-0000-0000-000000000010',
      'pending',
      '00000000-0000-0000-0000-000000000101',
      now() + interval '1 hour'
    )$$,
  '23505',
  NULL,
  'the invitation constraint rejects direct duplicate live Staff links'
);
DELETE FROM public.organization_invitations
WHERE email = 'direct-duplicate@example.com';

SELECT lives_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000503',
    'manager',
    '80300000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000211'
  )$$,
  'updating a membership while retaining its own Staff link remains valid'
);

SELECT * FROM finish();
ROLLBACK;
