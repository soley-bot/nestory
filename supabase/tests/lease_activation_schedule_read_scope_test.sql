BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

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
  actor_id,
  'authenticated',
  'authenticated',
  label || '@example.test',
  extensions.crypt('lease-activation-schedule-read-scope-test', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (VALUES
  ('c1000000-0000-4000-8000-000000000001'::uuid, 'branch-a-member'),
  ('c1000000-0000-4000-8000-000000000002'::uuid, 'branch-b-member'),
  ('c1000000-0000-4000-8000-000000000003'::uuid, 'branch-a-finance'),
  ('c1000000-0000-4000-8000-000000000004'::uuid, 'legacy-operations')
) AS actors(actor_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'c2000000-0000-4000-8000-000000000001',
  'Lease activation schedule scope fixture',
  'lease-activation-schedule-scope'
);

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES
  (
    'c3000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'Branch A',
    'SCHEDULE-A'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'Branch B',
    'SCHEDULE-B'
  );

INSERT INTO public.organization_roles (id, organization_id, name)
VALUES
  (
    'c4000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'Lease Viewer'
  ),
  (
    'c4000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'Finance Viewer'
  );

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key
)
VALUES
  (
    'c2000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    'leases.view'
  ),
  (
    'c2000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    'finance.view'
  );

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  (
    'c5000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'Branch A Tenant'
  ),
  (
    'c5000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'Branch B Tenant'
  );

INSERT INTO public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  branch_id,
  custom_role_id,
  person_id
)
VALUES
  (
    'c6000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'custom',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001',
    NULL
  ),
  (
    'c6000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'custom',
    'c3000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000001',
    NULL
  ),
  (
    'c6000000-0000-4000-8000-000000000003',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000003',
    'custom',
    'c3000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    NULL
  ),
  (
    'c6000000-0000-4000-8000-000000000004',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000004',
    'operations_member',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'c5000000-0000-4000-8000-000000000001'
  );

SET LOCAL session_replication_role = replica;

INSERT INTO public.properties (
  id,
  organization_id,
  branch_id,
  name,
  code,
  property_type,
  rental_structure
)
VALUES
  (
    'c7000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'Branch A Property',
    'SCHEDULE-PROP-A',
    'apartment',
    'single_space'
  ),
  (
    'c7000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'Branch B Property',
    'SCHEDULE-PROP-B',
    'apartment',
    'single_space'
  );

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  primary_tenant_person_id,
  status
)
VALUES
  (
    'c8000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    'draft'
  ),
  (
    'c8000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002',
    'c5000000-0000-4000-8000-000000000002',
    'draft'
  );

INSERT INTO public.lease_occupancies (
  id,
  organization_id,
  lease_id,
  property_id,
  status
)
VALUES
  (
    'c9000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001',
    'reserved'
  ),
  (
    'c9000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002',
    'c7000000-0000-4000-8000-000000000002',
    'reserved'
  );

INSERT INTO public.lease_activation_schedules (
  id,
  organization_id,
  lease_id,
  expected_occupancy_id,
  activation_date,
  status,
  idempotency_key
)
VALUES
  (
    'ca000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001',
    current_date + 7,
    'pending',
    'schedule-branch-a'
  ),
  (
    'ca000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002',
    'c9000000-0000-4000-8000-000000000002',
    current_date + 7,
    'pending',
    'schedule-branch-b'
  );

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = 'c2000000-0000-4000-8000-000000000001';

SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.leases
    ORDER BY id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000001'::uuid) $$,
  'Branch A member sees only the already-authorized Branch A Lease'
);

SELECT results_eq(
  $$
    SELECT lease_id
    FROM public.lease_activation_schedules
    ORDER BY lease_id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000001'::uuid) $$,
  'Branch A member sees only the schedule for the already-authorized Branch A Lease'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000002',
  true
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.leases
    ORDER BY id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000002'::uuid) $$,
  'Branch B member sees only the already-authorized Branch B Lease'
);

SELECT results_eq(
  $$
    SELECT lease_id
    FROM public.lease_activation_schedules
    ORDER BY lease_id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000002'::uuid) $$,
  'Branch B member sees only the schedule for the already-authorized Branch B Lease'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000003',
  true
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.leases
    ORDER BY id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000001'::uuid) $$,
  'Branch A Finance viewer sees the Branch A Lease through finance authority'
);

SELECT results_eq(
  $$
    SELECT lease_id
    FROM public.lease_activation_schedules
    ORDER BY lease_id
  $$,
  $$ VALUES ('c8000000-0000-4000-8000-000000000001'::uuid) $$,
  'Branch A Finance viewer sees the matching schedule through finance authority'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000004',
  true
);

SELECT is_empty(
  $$
    SELECT id
    FROM public.leases
  $$,
  'Legacy operations member cannot read Leases after ordinary access is enabled'
);

SELECT is_empty(
  $$
    SELECT lease_id
    FROM public.lease_activation_schedules
  $$,
  'Legacy operations member cannot read Lease activation schedules after ordinary access is enabled'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
