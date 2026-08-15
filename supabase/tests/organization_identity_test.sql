BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(11);

SELECT has_function(
  'public',
  'update_organization_identity',
  ARRAY['uuid', 'text'],
  'checked organization identity RPC exists'
);
SELECT function_returns(
  'public',
  'update_organization_identity',
  ARRAY['uuid', 'text'],
  'text',
  'organization identity RPC returns the normalized name'
);
SELECT ok(
  NOT coalesce(has_function_privilege('anon', 'public.update_organization_identity(uuid,text)', 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', 'public.update_organization_identity(uuid,text)', 'EXECUTE'), false),
  'only authenticated callers receive identity RPC execution'
);

CREATE TEMP TABLE identity_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO identity_state DEFAULT VALUES;
GRANT SELECT ON identity_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('identity-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM identity_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM identity_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM identity_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Original workspace', 'identity-' || left(organization_id::text, 8)
FROM identity_state
UNION ALL
SELECT cross_organization_id, 'Cross workspace', 'cross-identity-' || left(cross_organization_id::text, 8)
FROM identity_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin' FROM identity_state
UNION ALL SELECT organization_id, finance_manager_id, 'finance_manager' FROM identity_state
UNION ALL SELECT cross_organization_id, cross_super_admin_id, 'super_admin' FROM identity_state;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM identity_state), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.update_organization_identity(%L, %L)',
    organization_id,
    '  Soley Property Management  '
  ),
  'Super Admin can update the workspace display name'
)
FROM identity_state;

SELECT is(
  (SELECT name FROM public.organizations WHERE id = (SELECT organization_id FROM identity_state)),
  'Soley Property Management',
  'workspace name is trimmed and persisted'
);
SELECT is(
  (SELECT slug FROM public.organizations WHERE id = (SELECT organization_id FROM identity_state)),
  'identity-' || left((SELECT organization_id::text FROM identity_state), 8),
  'workspace slug remains unchanged'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE organization_id = (SELECT organization_id FROM identity_state)
      AND entity_type = 'organization'
      AND action = 'updated'
      AND previous_values ->> 'name' = 'Original workspace'
      AND new_values ->> 'name' = 'Soley Property Management'
  ),
  'organization identity update appends old and new activity evidence'
);
SELECT throws_ok(
  format('SELECT public.update_organization_identity(%L, %L)', organization_id, ' '),
  '22023',
  'Workspace name must be between 2 and 120 characters.',
  'blank workspace name is rejected'
)
FROM identity_state;
SELECT throws_ok(
  format('SELECT public.update_organization_identity(%L, %L)', organization_id, repeat('x', 121)),
  '22023',
  'Workspace name must be between 2 and 120 characters.',
  'oversized workspace name is rejected'
)
FROM identity_state;
SELECT throws_ok(
  format('SELECT public.update_organization_identity(%L, %L)', cross_organization_id, 'Cross update'),
  '42501',
  'Only a Super Admin can update organization identity.',
  'Super Admin cannot update another organization'
)
FROM identity_state;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM identity_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.update_organization_identity(%L, %L)', organization_id, 'Finance update'),
  '42501',
  'Only a Super Admin can update organization identity.',
  'Finance Manager cannot update organization identity'
)
FROM identity_state;

SELECT * FROM finish();
ROLLBACK;
