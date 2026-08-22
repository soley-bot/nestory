BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '@example.test',
  extensions.crypt('approved-transition-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (VALUES
  ('10710000-0000-4000-8000-000000000001'::uuid, 'finance-manager'),
  ('10710000-0000-4000-8000-000000000002'::uuid, 'finance-member'),
  ('10710000-0000-4000-8000-000000000003'::uuid, 'operations-manager'),
  ('10710000-0000-4000-8000-000000000004'::uuid, 'operations-member-one'),
  ('10710000-0000-4000-8000-000000000005'::uuid, 'operations-member-two'),
  ('10710000-0000-4000-8000-000000000006'::uuid, 'super-admin')
) AS actors(user_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '1221152a-3a7d-48f6-a109-45f2b2173813',
  'Nestory approved transition fixture',
  'nestory'
);

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'a8120000-0000-4000-8000-000000000001',
  '1221152a-3a7d-48f6-a109-45f2b2173813',
  'Synthetic Pilot Phnom Penh',
  'SYN-PP-260812'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('10720000-0000-4000-8000-000000000003', '1221152a-3a7d-48f6-a109-45f2b2173813', 'Operations Manager'),
  ('10720000-0000-4000-8000-000000000004', '1221152a-3a7d-48f6-a109-45f2b2173813', 'Operations Member One'),
  ('10720000-0000-4000-8000-000000000005', '1221152a-3a7d-48f6-a109-45f2b2173813', 'Operations Member Two');

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  ('1221152a-3a7d-48f6-a109-45f2b2173813', '10720000-0000-4000-8000-000000000003', 'staff', 'active'),
  ('1221152a-3a7d-48f6-a109-45f2b2173813', '10720000-0000-4000-8000-000000000004', 'staff', 'active'),
  ('1221152a-3a7d-48f6-a109-45f2b2173813', '10720000-0000-4000-8000-000000000005', 'staff', 'active');

INSERT INTO public.organization_members (
  id, organization_id, user_id, role, person_id, branch_id
)
VALUES
  ('bd64e40e-dcf1-4067-896a-43f0fd79c389', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000001', 'finance_manager', NULL, NULL),
  ('4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000002', 'finance_member', NULL, NULL),
  ('062393f4-3d01-4c84-8f28-052e15d6741a', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000003', 'operations_manager', '10720000-0000-4000-8000-000000000003', 'a8120000-0000-4000-8000-000000000001'),
  ('5120be8d-a5b6-4897-bafc-f36fdc674582', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000004', 'operations_member', '10720000-0000-4000-8000-000000000004', 'a8120000-0000-4000-8000-000000000001'),
  ('92696111-dabe-46c9-945f-b1532aea2a88', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000005', 'operations_member', '10720000-0000-4000-8000-000000000005', 'a8120000-0000-4000-8000-000000000001'),
  ('10730000-0000-4000-8000-000000000006', '1221152a-3a7d-48f6-a109-45f2b2173813', '10710000-0000-4000-8000-000000000006', 'super_admin', NULL, NULL);

SELECT has_function(
  'app_private',
  'apply_approved_nestory_transition_20260822',
  ARRAY[]::text[],
  'the reviewed production transition has one pinned internal entrypoint'
);

SELECT function_privs_are(
  'app_private',
  'apply_approved_nestory_transition_20260822',
  ARRAY[]::text[],
  'authenticated',
  ARRAY[]::text[],
  'authenticated callers cannot invoke the production transition'
);

SELECT function_privs_are(
  'app_private',
  'apply_approved_nestory_transition_20260822',
  ARRAY[]::text[],
  'service_role',
  ARRAY[]::text[],
  'service role cannot invoke the production transition'
);

UPDATE public.organization_members
SET id = '10730000-0000-4000-8000-000000000002'
WHERE id = '4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484';

SELECT throws_ok(
  'SELECT app_private.apply_approved_nestory_transition_20260822()',
  '55000',
  'Approved Nestory transition membership set does not match.',
  'the transition fails closed when even one approved membership identity differs'
);

UPDATE public.organization_members
SET id = '4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484'
WHERE id = '10730000-0000-4000-8000-000000000002';

SELECT lives_ok(
  'SELECT app_private.apply_approved_nestory_transition_20260822()',
  'the exact approved transition applies atomically'
);

SELECT results_eq(
  $$
    SELECT name, status
    FROM public.organization_roles
    WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
    ORDER BY name
  $$,
  $$ VALUES
    ('Finance Manager'::text, 'active'::text),
    ('Finance Member'::text, 'active'::text),
    ('Operations Manager'::text, 'active'::text),
    ('Operations Member'::text, 'active'::text)
  $$,
  'the approved role register contains exactly four active profiles'
);

SELECT results_eq(
  $$
    SELECT role_record.name,
      array_agg(permission_record.permission_key::text ORDER BY permission_record.permission_key)
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
    GROUP BY role_record.name
    ORDER BY role_record.name
  $$,
  $$ VALUES
    ('Finance Manager'::text, ARRAY['leases.view','leases.prepare','leases.activate','leases.change_terms','leases.close','leases.archive','finance.view','finance.record_payments','finance.approve_expenses','finance.correct_records','finance.close_periods','finance.publish']::text[]),
    ('Finance Member'::text, ARRAY['leases.view','finance.view','finance.submit_expenses']::text[]),
    ('Operations Manager'::text, ARRAY['maintenance.view','maintenance.create_assign','maintenance.complete','maintenance.review']::text[]),
    ('Operations Member'::text, ARRAY['maintenance.view','maintenance.complete']::text[])
  $$,
  'each approved role has its exact permission profile and no extra key'
);

SELECT results_eq(
  $$
    SELECT member.id, role_record.name, branch.code
    FROM public.organization_members AS member
    JOIN public.organization_roles AS role_record
      ON role_record.organization_id = member.organization_id
     AND role_record.id = member.custom_role_id
    JOIN public.organization_branches AS branch
      ON branch.organization_id = member.organization_id
     AND branch.id = member.branch_id
    WHERE member.organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
      AND member.role = 'custom'
    ORDER BY member.id
  $$,
  $$ VALUES
    ('062393f4-3d01-4c84-8f28-052e15d6741a'::uuid, 'Operations Manager'::text, 'SYN-PP-260812'::text),
    ('4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484'::uuid, 'Finance Member'::text, 'SYN-PP-260812'::text),
    ('5120be8d-a5b6-4897-bafc-f36fdc674582'::uuid, 'Operations Member'::text, 'SYN-PP-260812'::text),
    ('92696111-dabe-46c9-945f-b1532aea2a88'::uuid, 'Operations Member'::text, 'SYN-PP-260812'::text),
    ('bd64e40e-dcf1-4067-896a-43f0fd79c389'::uuid, 'Finance Manager'::text, 'SYN-PP-260812'::text)
  $$,
  'only the five pinned memberships receive their approved role and branch'
);

SELECT is(
  (SELECT role FROM public.organization_members WHERE id = '10730000-0000-4000-8000-000000000006'),
  'super_admin'::text,
  'Super Admin remains organization-wide and unchanged'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
      AND role IN ('finance_manager','finance_member','operations_manager','operations_member')
  ),
  0::bigint,
  'no legacy ordinary membership remains'
);

SELECT results_eq(
  $$
    SELECT ordinary_access_enabled, transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
  $$,
  $$ VALUES (true, false) $$,
  'ordinary access opens only after the exact transition is applied'
);

SELECT results_eq(
  $$
    SELECT status, expected_legacy_membership_count,
      expected_legacy_invitation_count, baseline_custom_membership_count,
      baseline_custom_invitation_count
    FROM public.organization_access_transition_manifests
    WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
  $$,
  $$ VALUES ('applied'::text, 5, 0, 0, 0) $$,
  'the reviewed manifest records the exact approved conversion baseline'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_access_transition_manifest_items
    WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
  ),
  5::bigint,
  'the manifest enumerates exactly five assignments'
);

SELECT ok(
  (
    SELECT manifest.manifest_fingerprint =
      app_private.organization_transition_manifest_fingerprint(
        manifest.organization_id,
        manifest.id
      )
      AND manifest.baseline_custom_fingerprint =
        app_private.organization_custom_assignment_baseline_fingerprint(
          manifest.organization_id,
          manifest.id
        )
    FROM public.organization_access_transition_manifests AS manifest
    WHERE manifest.organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'
  ),
  'manifest and no-unlisted-assignment fingerprints remain exact after application'
);

SELECT throws_ok(
  'SELECT app_private.apply_approved_nestory_transition_20260822()',
  '55000',
  'Approved Nestory transition requires ordinary access to be contained.',
  'the protected transition cannot be replayed after activation'
);

SELECT * FROM finish();

ROLLBACK;
