BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

SELECT has_column(
  'public',
  'organizations',
  'logo_storage_path',
  'organizations stores the active company logo path'
);
SELECT has_function(
  'public',
  'update_organization_logo',
  ARRAY['uuid', 'text'],
  'checked organization logo RPC exists'
);
SELECT function_returns(
  'public',
  'update_organization_logo',
  ARRAY['uuid', 'text'],
  'text',
  'organization logo RPC returns the selected path'
);
SELECT ok(
  NOT coalesce(has_function_privilege('anon', 'public.update_organization_logo(uuid,text)', 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', 'public.update_organization_logo(uuid,text)', 'EXECUTE'), false),
  'only authenticated callers receive logo RPC execution'
);
SELECT results_eq(
  $$
    SELECT public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'organization-assets'
  $$,
  $$ VALUES (
    false,
    2097152::bigint,
    ARRAY['image/png', 'image/jpeg']::text[]
  ) $$,
  'organization logo bucket is private and constrained'
);

CREATE TEMP TABLE company_logo_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  logo_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO company_logo_state DEFAULT VALUES;
GRANT SELECT ON company_logo_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('company-logo-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM company_logo_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM company_logo_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM company_logo_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Logo workspace', 'logo-' || left(organization_id::text, 8)
FROM company_logo_state
UNION ALL
SELECT cross_organization_id, 'Cross workspace', 'cross-logo-' || left(cross_organization_id::text, 8)
FROM company_logo_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin' FROM company_logo_state
UNION ALL SELECT organization_id, finance_manager_id, 'finance_manager' FROM company_logo_state
UNION ALL SELECT cross_organization_id, cross_super_admin_id, 'super_admin' FROM company_logo_state;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM company_logo_state), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES (%L, %L, %L, %L::jsonb)',
    'organization-assets',
    (SELECT organization_id::text || '/logos/' || logo_id::text || '.png' FROM company_logo_state),
    (SELECT super_admin_id::text FROM company_logo_state),
    '{"mimetype":"image/png","size":1024}'
  ),
  'Super Admin can upload a logo inside the organization path'
);

SELECT lives_ok(
  format(
    'SELECT public.update_organization_logo(%L, %L)',
    organization_id,
    organization_id::text || '/logos/' || logo_id::text || '.png'
  ),
  'Super Admin can select an uploaded organization logo'
)
FROM company_logo_state;

SELECT is(
  (
    SELECT logo_storage_path
    FROM public.organizations
    WHERE id = (SELECT organization_id FROM company_logo_state)
  ),
  (
    SELECT organization_id::text || '/logos/' || logo_id::text || '.png'
    FROM company_logo_state
  ),
  'selected company logo path is persisted'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE organization_id = (SELECT organization_id FROM company_logo_state)
      AND entity_type = 'organization'
      AND action = 'logo_updated'
      AND new_values ->> 'logo_storage_path' = (
        SELECT organization_id::text || '/logos/' || logo_id::text || '.png'
        FROM company_logo_state
      )
  ),
  'logo selection appends organization activity evidence'
);

SELECT throws_ok(
  format(
    'SELECT public.update_organization_logo(%L, %L)',
    organization_id,
    cross_organization_id::text || '/logos/' || logo_id::text || '.png'
  ),
  '22023',
  'Company logo path is invalid.',
  'organization cannot select a cross-workspace path'
)
FROM company_logo_state;

SELECT lives_ok(
  format('SELECT public.update_organization_logo(%L, NULL)', organization_id),
  'Super Admin can clear the company logo pointer'
)
FROM company_logo_state;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM company_logo_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES (%L, %L, %L, %L::jsonb)',
    'organization-assets',
    (SELECT organization_id::text || '/logos/' || gen_random_uuid()::text || '.png' FROM company_logo_state),
    (SELECT finance_manager_id::text FROM company_logo_state),
    '{"mimetype":"image/png","size":1024}'
  ),
  '42501',
  NULL,
  'Finance Manager cannot upload organization logos'
);

SELECT throws_ok(
  format('SELECT public.update_organization_logo(%L, NULL)', organization_id),
  '42501',
  'Only a Super Admin can update the company logo.',
  'Finance Manager cannot change the logo pointer'
)
FROM company_logo_state;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM storage.objects
    WHERE bucket_id = 'organization-assets'
      AND app_private.storage_object_org_id(name) = (
        SELECT organization_id FROM company_logo_state
      )
  ),
  1::bigint,
  'organization member can read its organization logo object'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT cross_super_admin_id::text FROM company_logo_state), true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM storage.objects
    WHERE bucket_id = 'organization-assets'
      AND app_private.storage_object_org_id(name) = (
        SELECT organization_id FROM company_logo_state
      )
  ),
  0::bigint,
  'cross-workspace member cannot read another organization logo object'
);

SELECT throws_ok(
  format(
    'INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES (%L, %L, %L, %L::jsonb)',
    'organization-assets',
    (SELECT organization_id::text || '/logos/' || gen_random_uuid()::text || '.jpg' FROM company_logo_state),
    (SELECT cross_super_admin_id::text FROM company_logo_state),
    '{"mimetype":"image/jpeg","size":1024}'
  ),
  '42501',
  NULL,
  'cross-workspace Super Admin cannot upload into another organization path'
);

SELECT throws_ok(
  format('SELECT public.update_organization_logo(%L, NULL)', organization_id),
  '42501',
  'Only a Super Admin can update the company logo.',
  'cross-workspace Super Admin cannot clear another organization logo'
)
FROM company_logo_state;

SELECT * FROM finish();
ROLLBACK;
