BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(16);

SELECT has_column('public', 'organizations', 'theme_mode', 'organizations store theme mode');
SELECT has_column('public', 'organizations', 'accent_preset', 'organizations store accent preset');
SELECT has_column('public', 'organizations', 'accent_seed', 'organizations store custom accent seed');
SELECT has_function(
  'public',
  'update_organization_appearance',
  ARRAY['uuid', 'text', 'text', 'text'],
  'checked organization appearance RPC exists'
);
SELECT ok(
  NOT coalesce(has_function_privilege('anon', 'public.update_organization_appearance(uuid,text,text,text)', 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', 'public.update_organization_appearance(uuid,text,text,text)', 'EXECUTE'), false),
  'only authenticated callers receive RPC execution'
);

CREATE TEMP TABLE appearance_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_manager_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_member_person_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO appearance_state DEFAULT VALUES;
GRANT SELECT ON appearance_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('appearance-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM appearance_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM appearance_state
  UNION ALL SELECT finance_member_id, 'finance-member' FROM appearance_state
  UNION ALL SELECT operations_manager_id, 'operations-manager' FROM appearance_state
  UNION ALL SELECT operations_member_id, 'operations-member' FROM appearance_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM appearance_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Appearance organization', 'appearance-' || left(organization_id::text, 8)
FROM appearance_state
UNION ALL
SELECT cross_organization_id, 'Cross appearance organization', 'cross-appearance-' || left(cross_organization_id::text, 8)
FROM appearance_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, 'Appearance branch', 'APP'
FROM appearance_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT operations_manager_person_id, organization_id, 'Appearance Operations Manager'
FROM appearance_state
UNION ALL
SELECT operations_member_person_id, organization_id, 'Appearance Operations Member'
FROM appearance_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, operations_manager_person_id, 'staff', 'active'
FROM appearance_state
UNION ALL
SELECT organization_id, operations_member_person_id, 'staff', 'active'
FROM appearance_state;

INSERT INTO public.organization_members (organization_id, user_id, role, person_id, branch_id)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid FROM appearance_state
UNION ALL SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid FROM appearance_state
UNION ALL SELECT organization_id, finance_member_id, 'finance_member', NULL::uuid, NULL::uuid FROM appearance_state
UNION ALL SELECT organization_id, operations_manager_id, 'operations_manager', operations_manager_person_id, branch_id FROM appearance_state
UNION ALL SELECT organization_id, operations_member_id, 'operations_member', operations_member_person_id, branch_id FROM appearance_state
UNION ALL SELECT cross_organization_id, cross_super_admin_id, 'super_admin', NULL::uuid, NULL::uuid FROM appearance_state;

SELECT is(
  (SELECT theme_mode FROM public.organizations WHERE id = (SELECT organization_id FROM appearance_state)),
  'system',
  'new organizations default to system mode'
);
SELECT is(
  (SELECT accent_preset FROM public.organizations WHERE id = (SELECT organization_id FROM appearance_state)),
  'neutral',
  'new organizations default to neutral accent'
);
SELECT is(
  (SELECT accent_seed FROM public.organizations WHERE id = (SELECT organization_id FROM appearance_state)),
  NULL,
  'new organizations have no custom seed'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM appearance_state), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.update_organization_appearance(%L, %L, %L, %L)',
    organization_id, 'dark', 'custom', '#2563eb'
  ),
  'Super Admin can save custom organization appearance'
)
FROM appearance_state;

SELECT is(
  (SELECT accent_seed FROM public.organizations WHERE id = (SELECT organization_id FROM appearance_state)),
  '#2563EB',
  'custom seed is normalized to uppercase'
);

SELECT throws_ok(
  format(
    'SELECT public.update_organization_appearance(%L, %L, %L, %L)',
    organization_id, 'dark', 'custom', '#12GG00'
  ),
  '22023',
  'Enter a valid six-digit hex color.',
  'malformed custom seed is rejected'
)
FROM appearance_state;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_appearance(%L, %L, %L, %L)',
    cross_organization_id, 'light', 'forest', NULL
  ),
  '42501',
  'Only a Super Admin can update organization appearance.',
  'Super Admin cannot update another organization'
)
FROM appearance_state;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM appearance_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.update_organization_appearance(%L, %L, %L, NULL)', organization_id, 'light', 'neutral'),
  '42501', 'Only a Super Admin can update organization appearance.',
  'Finance Manager cannot update appearance'
)
FROM appearance_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM appearance_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.update_organization_appearance(%L, %L, %L, NULL)', organization_id, 'light', 'neutral'),
  '42501', 'Only a Super Admin can update organization appearance.',
  'Finance Member cannot update appearance'
)
FROM appearance_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM appearance_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.update_organization_appearance(%L, %L, %L, NULL)', organization_id, 'light', 'neutral'),
  '42501', 'Only a Super Admin can update organization appearance.',
  'Operations Manager cannot update appearance'
)
FROM appearance_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_member_id::text FROM appearance_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.update_organization_appearance(%L, %L, %L, NULL)', organization_id, 'light', 'neutral'),
  '42501', 'Only a Super Admin can update organization appearance.',
  'Operations Member cannot update appearance'
)
FROM appearance_state;

SELECT * FROM finish();
ROLLBACK;
