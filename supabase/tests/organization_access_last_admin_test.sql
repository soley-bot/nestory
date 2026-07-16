BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000201'::uuid,
    'manager',
    '80300000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000211'::uuid
  )$$,
  'P0001',
  'Cannot demote the last administrator',
  'the final administrator cannot be demoted'
);

RESET ROLE;

-- Keep the second invariant independent when this test is run against the
-- pre-fix RPC, which incorrectly applies the first demotion.
UPDATE public.organization_members
SET role = 'admin'
WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;

INSERT INTO public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
VALUES (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000301',
  'admin',
  NULL,
  NULL
);

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.update_organization_member_access(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000201'::uuid,
    'manager',
    '80300000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000211'::uuid
  )$$,
  'an administrator can be demoted when another administrator remains'
);

SELECT is(
  (
    SELECT role
    FROM public.organization_members
    WHERE id = '00000000-0000-0000-0000-000000000201'::uuid
  ),
  'manager',
  'the permitted role change is applied'
);

RESET ROLE;

DELETE FROM public.organization_members
WHERE id = '00000000-0000-0000-0000-000000000202'::uuid;

UPDATE public.organization_members
SET role = 'admin'
WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.organization_members
    SET role = 'manager'
    WHERE id = '00000000-0000-0000-0000-000000000201'::uuid$$,
  'P0001',
  'Cannot demote the last administrator',
  'the final administrator cannot be demoted through a direct table update'
);

RESET ROLE;

UPDATE public.organization_members
SET role = 'admin'
WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.add_existing_organization_member(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'nestory@gmail.com',
    'manager',
    '80300000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000211'::uuid
  )$$,
  'P0001',
  'Cannot demote the last administrator',
  'the final administrator cannot be demoted through Add access'
);

SELECT * FROM finish();

ROLLBACK;
