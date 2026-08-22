BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(200);

SELECT has_type(
  'public',
  'organization_permission_key',
  'the stable organization permission enum exists'
);

SELECT is(
  (
    SELECT string_agg(enum_value.enumlabel, ',' ORDER BY enum_value.enumsortorder)
    FROM pg_type type_record
    JOIN pg_namespace schema_record ON schema_record.oid = type_record.typnamespace
    JOIN pg_enum enum_value ON enum_value.enumtypid = type_record.oid
    WHERE schema_record.nspname = 'public'
      AND type_record.typname = 'organization_permission_key'
  ),
  'properties.view,properties.write,properties.archive,people.view,people.write,people.archive,leases.view,leases.prepare,leases.activate,leases.change_terms,leases.close,leases.archive,finance.view,finance.record_payments,finance.submit_expenses,finance.approve_expenses,finance.correct_records,finance.close_periods,finance.publish,maintenance.view,maintenance.create_assign,maintenance.complete,maintenance.review',
  'permission enum has exactly the approved 23 values in catalogue order'
);

SELECT has_table('public', 'organization_roles', 'custom roles are stored per organization');
SELECT has_table('public', 'organization_role_permissions', 'role permissions use a normalized table');
SELECT has_table('public', 'organization_authorization_states', 'ordinary authorization has an explicit containment state');
SELECT has_column('public', 'organization_members', 'custom_role_id', 'memberships can stage a custom role');
SELECT has_column('public', 'organization_invitations', 'custom_role_id', 'invitations can stage a custom role');

SELECT ok(
  (
    SELECT pg_get_triggerdef(trigger_record.oid) ~
      'UPDATE OF .*status'
    FROM pg_trigger AS trigger_record
    WHERE trigger_record.tgrelid = 'public.organization_invitations'::regclass
      AND trigger_record.tgname =
        'organization_invitations_validate_custom_assignment'
  ),
  'invitation assignment validation runs on status-only lifecycle transitions'
);

SELECT ok(
  coalesce((
    SELECT table_record.relrowsecurity AND table_record.relforcerowsecurity
    FROM pg_class table_record
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'organization_roles'
  ), false),
  'organization roles enable and force RLS'
);
SELECT ok(
  coalesce((
    SELECT table_record.relrowsecurity AND table_record.relforcerowsecurity
    FROM pg_class table_record
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'organization_role_permissions'
  ), false),
  'organization role permissions enable and force RLS'
);
SELECT ok(
  coalesce((
    SELECT table_record.relrowsecurity AND table_record.relforcerowsecurity
    FROM pg_class table_record
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'organization_authorization_states'
  ), false),
  'organization authorization states enable and force RLS'
);

SELECT ok(
  coalesce(has_table_privilege('authenticated', 'public.organization_roles', 'SELECT'), false),
  'authenticated callers have explicit read access to roles'
);
SELECT ok(
  coalesce(has_table_privilege('authenticated', 'public.organization_role_permissions', 'SELECT'), false),
  'authenticated callers have explicit read access to role permissions'
);
SELECT ok(
  coalesce(has_table_privilege('authenticated', 'public.organization_authorization_states', 'SELECT'), false),
  'authenticated callers have explicit read access to authorization state'
);
SELECT ok(
  NOT coalesce(has_table_privilege('authenticated', 'public.organization_roles', 'INSERT,UPDATE,DELETE'), false),
  'authenticated callers cannot mutate roles directly'
);
SELECT ok(
  NOT coalesce(has_table_privilege('authenticated', 'public.organization_role_permissions', 'INSERT,UPDATE,DELETE'), false),
  'authenticated callers cannot mutate role permissions directly'
);

SELECT has_function('public', 'create_organization_role', ARRAY['uuid', 'text'], 'checked role creation RPC exists');
SELECT has_function('public', 'duplicate_organization_role', ARRAY['uuid', 'uuid', 'text'], 'checked role duplication RPC exists');
SELECT has_function(
  'public',
  'save_organization_role',
  ARRAY['uuid', 'uuid', 'text', 'public.organization_permission_key[]', 'bigint', 'boolean'],
  'checked role save RPC exists'
);
SELECT has_function('public', 'archive_organization_role', ARRAY['uuid', 'uuid', 'bigint'], 'checked role archive RPC exists');
SELECT has_function('public', 'get_organization_roles', ARRAY['uuid'], 'checked role register RPC exists');

SELECT ok(
  to_regprocedure(
    'public.create_organization_invitation(uuid,text,text,uuid,uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.update_organization_member_access(uuid,uuid,text,uuid,uuid)'
  ) IS NOT NULL,
  'released five-argument invitation and member access interfaces remain callable'
);

SELECT has_function(
  'public',
  'create_organization_invitation',
  ARRAY['uuid', 'text', 'text', 'uuid', 'uuid', 'uuid'],
  'checked role-kind invitation overload exists'
);

SELECT has_function(
  'public',
  'update_organization_member_access',
  ARRAY['uuid', 'uuid', 'text', 'uuid', 'uuid', 'uuid'],
  'checked role-kind member access overload exists'
);

SELECT ok(
  pg_get_function_result(
    'app_private.get_organization_roles_checked(uuid)'::regprocedure
  ) = 'TABLE(id uuid, name text, status text, assigned_user_count bigint, pending_invitation_count bigint, version bigint, permission_keys organization_permission_key[])'
  AND pg_get_function_result(
    'public.get_organization_roles(uuid)'::regprocedure
  ) = 'TABLE(id uuid, name text, status text, assigned_user_count bigint, pending_invitation_count bigint, version bigint, permission_keys organization_permission_key[])',
  'private and public role registers expose the pending invitation count without changing the assigned-user count'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc function_record
    JOIN pg_namespace schema_record ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'create_organization_role',
        'duplicate_organization_role',
        'save_organization_role',
        'archive_organization_role',
        'get_organization_roles'
      )
      AND function_record.prosecdef
  ),
  'public role RPCs are narrow security-invoker wrappers'
);

SELECT ok(
  (
    SELECT count(*) = 5
    FROM pg_proc function_record
    JOIN pg_namespace schema_record ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'create_organization_role',
        'duplicate_organization_role',
        'save_organization_role',
        'archive_organization_role',
        'get_organization_roles'
      )
      AND has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', function_record.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) privilege_record
        WHERE privilege_record.grantee = 0
          AND privilege_record.privilege_type = 'EXECUTE'
      )
  ),
  'all public role RPCs execute only for authenticated callers'
);

SELECT ok(
  to_regclass('public.organization_roles_organization_id_id_key') IS NOT NULL
  AND to_regclass('public.organization_role_permissions_org_role_idx') IS NOT NULL
  AND to_regclass('public.organization_members_org_custom_role_id_idx') IS NOT NULL
  AND to_regclass('public.organization_invitations_org_custom_role_id_idx') IS NOT NULL,
  'role organization and assignment predicates are indexed'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conname = 'organization_role_permissions_role_organization_fk'
      AND constraint_record.contype = 'f'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conname = 'organization_members_custom_role_organization_fk'
      AND constraint_record.contype = 'f'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    WHERE constraint_record.conname = 'organization_invitations_custom_role_organization_fk'
      AND constraint_record.contype = 'f'
  ),
  'composite foreign keys prevent cross-organization role linkage'
);

CREATE TEMP TABLE custom_role_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinary_non_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  custom_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  spare_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_readiness_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_role_id uuid,
  invitation_id uuid,
  legacy_invitation_id uuid,
  checked_invitation_id uuid,
  checked_member_id uuid,
  checked_empty_role_id uuid,
  cross_role_id uuid,
  cross_manifest_id uuid,
  role_id uuid,
  duplicate_role_id uuid,
  empty_role_id uuid,
  replacement_role_id uuid,
  manifest_id uuid,
  save_result jsonb
) ON COMMIT DROP;

INSERT INTO custom_role_state DEFAULT VALUES;
GRANT SELECT, INSERT, UPDATE, DELETE ON custom_role_state TO authenticated;
GRANT SELECT ON custom_role_state TO service_role;

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
  user_record.user_id,
  'authenticated',
  'authenticated',
  user_record.label || '-' || left(user_record.user_id::text, 8) || '@example.test',
  extensions.crypt('custom-role-test', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id AS user_id, 'super-admin' AS label FROM custom_role_state
  UNION ALL SELECT legacy_manager_id, 'legacy-manager' FROM custom_role_state
  UNION ALL SELECT ordinary_non_admin_id, 'ordinary-non-admin' FROM custom_role_state
  UNION ALL SELECT custom_user_id, 'custom-user' FROM custom_role_state
  UNION ALL SELECT spare_user_id, 'spare-user' FROM custom_role_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM custom_role_state
) AS user_record;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Custom Role Test', 'custom-role-' || left(organization_id::text, 8)
FROM custom_role_state
UNION ALL
SELECT cross_organization_id, 'Cross Custom Role Test', 'cross-custom-role-' || left(cross_organization_id::text, 8)
FROM custom_role_state;

INSERT INTO public.organization_branches (
  id,
  organization_id,
  name,
  code
)
SELECT branch_id, organization_id, 'Primary Branch', 'PRIMARY'
FROM custom_role_state
UNION ALL
SELECT cross_branch_id, cross_organization_id, 'Cross Branch', 'CROSS'
FROM custom_role_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin' FROM custom_role_state
UNION ALL
SELECT organization_id, legacy_manager_id, 'finance_manager' FROM custom_role_state
UNION ALL
SELECT organization_id, ordinary_non_admin_id, 'finance_member' FROM custom_role_state
UNION ALL
SELECT cross_organization_id, cross_super_admin_id, 'super_admin' FROM custom_role_state;

-- 25
SELECT is(
  (
    SELECT ordinary_access_enabled
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  ),
  false,
  'new organization authorization state is contained by default'
);

SELECT is(
  (
    SELECT transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  ),
  true,
  'a contained organization with legacy ordinary memberships requires an approved transition manifest'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 26
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET role_id = public.create_organization_role(%L, %L)',
    organization_id,
    '  Finance   Reviewer  '
  ),
  'Super Admin can create a custom role'
)
FROM custom_role_state;

-- 27
SELECT results_eq(
  $$
    SELECT name, status, version, permission_count
    FROM (
      SELECT
        role_record.name,
        role_record.status,
        role_record.version,
        count(permission_record.permission_key)::bigint AS permission_count
      FROM public.organization_roles AS role_record
      LEFT JOIN public.organization_role_permissions AS permission_record
        ON permission_record.organization_id = role_record.organization_id
       AND permission_record.role_id = role_record.id
      WHERE role_record.id = (SELECT role_id FROM custom_role_state)
      GROUP BY role_record.id
    ) AS created_role
  $$,
  $$VALUES ('Finance Reviewer'::text, 'active'::text, 1::bigint, 0::bigint)$$,
  'new roles are normalized, active, version one, and empty'
);

-- 28
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 1, false)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.approve_expenses'
  ),
  'saving a dependent permission succeeds without removal confirmation'
)
FROM custom_role_state;

-- 29
SELECT results_eq(
  $$
    SELECT permission_key::text
    FROM public.organization_role_permissions
    WHERE role_id = (SELECT role_id FROM custom_role_state)
    ORDER BY organization_role_permissions.permission_key
  $$,
  $$VALUES ('finance.view'::text), ('finance.approve_expenses'::text)$$,
  'adding a dependent permission also adds Finance View in enum order'
);

-- 30
SELECT is(
  (SELECT version FROM public.organization_roles WHERE id = (SELECT role_id FROM custom_role_state)),
  2::bigint,
  'permission addition advances the optimistic version'
);

-- 31
SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_id = (SELECT role_id FROM custom_role_state)
      AND action = 'organization_role_permission_added'
  ),
  2::bigint,
  'each normalized permission addition creates its own activity event'
);

-- 32
SELECT throws_ok(
  format(
    'SELECT public.create_organization_role(%L, %L)',
    organization_id,
    'finance reviewer'
  ),
  '23505',
  'Role name is already in use.',
  'active role names are unique case-insensitively'
)
FROM custom_role_state;

-- 33
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET duplicate_role_id = public.duplicate_organization_role(%L, %L, %L)',
    organization_id,
    role_id,
    'Finance Reviewer Copy'
  ),
  'Super Admin can duplicate a custom role'
)
FROM custom_role_state;

-- 34
SELECT results_eq(
  $$
    SELECT role_record.status, role_record.version, permission_record.permission_key::text
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT duplicate_role_id FROM custom_role_state)
    ORDER BY permission_record.permission_key
  $$,
  $$VALUES
    ('active'::text, 1::bigint, 'finance.view'::text),
    ('active'::text, 1::bigint, 'finance.approve_expenses'::text)
  $$,
  'a duplicate starts active and copies the source permission set'
);

-- 35
SELECT is(
  (
    SELECT count(*)
    FROM public.get_organization_roles((SELECT organization_id FROM custom_role_state))
  ),
  2::bigint,
  'the checked role register lists organization roles'
);

-- 36
SELECT throws_ok(
  format(
    'SELECT public.create_organization_role(%L, %L)',
    cross_organization_id,
    'Cross Organization Attempt'
  ),
  '42501',
  'Only a Super Admin can manage roles.',
  'a Super Admin cannot create roles in another organization'
)
FROM custom_role_state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT ordinary_non_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 37
SELECT throws_ok(
  format(
    'SELECT public.create_organization_role(%L, %L)',
    organization_id,
    'Unauthorized Role'
  ),
  '42501',
  'Only a Super Admin can manage roles.',
  'a legacy ordinary member cannot create roles'
)
FROM custom_role_state;

-- 38
SELECT throws_ok(
  format('SELECT * FROM public.get_organization_roles(%L)', organization_id),
  '42501',
  'Only a Super Admin can manage roles.',
  'a legacy ordinary member cannot list the role register'
)
FROM custom_role_state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 39
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET empty_role_id = public.create_organization_role(%L, %L)',
    organization_id,
    'Archive Me'
  ),
  'Super Admin can create a second empty role'
)
FROM custom_role_state;

RESET ROLE;

-- 40
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    custom_user_id,
    'custom',
    cross_branch_id,
    role_id
  ),
  '23514',
  'An active branch in this organization is required.',
  'custom assignment rejects a branch from another organization'
)
FROM custom_role_state;

-- 41
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    custom_user_id,
    'custom',
    branch_id,
    empty_role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'an empty role cannot be assigned'
)
FROM custom_role_state;

-- 42
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    cross_organization_id,
    custom_user_id,
    'custom',
    cross_branch_id,
    role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'custom assignment rejects a role from another organization'
)
FROM custom_role_state;

-- 43
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    custom_user_id,
    'custom',
    branch_id,
    role_id
  ),
  'a contained release can stage an approved custom assignment atomically'
)
FROM custom_role_state;

-- 44
SELECT is(
  (
    SELECT ordinary_access_enabled
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  ),
  false,
  'staging an assignment does not activate ordinary access'
);

-- 45
SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    organization_id
  ),
  '55000',
  'Ordinary access cannot be enabled while legacy ordinary memberships remain.',
  'activation fails closed while the required manifest still has legacy memberships'
)
FROM custom_role_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT custom_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 46
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_roles
    WHERE id = (SELECT role_id FROM custom_role_state)
  ),
  0::bigint,
  'a staged custom user cannot read the role while ordinary access is contained'
);

RESET ROLE;

WITH inserted_manifest AS (
  INSERT INTO public.organization_access_transition_manifests (
    organization_id,
    manifest_fingerprint,
    expected_legacy_membership_count,
    expected_legacy_invitation_count,
    baseline_custom_membership_count,
    baseline_custom_invitation_count,
    baseline_custom_fingerprint,
    created_by,
    updated_by
  )
  SELECT
    organization_id,
    repeat('0', 64),
    2,
    0,
    1,
    0,
    repeat('0', 64),
    super_admin_id,
    super_admin_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET manifest_id = inserted_manifest.id
FROM inserted_manifest;

INSERT INTO public.organization_access_transition_manifest_items (
  organization_id,
  manifest_id,
  source_kind,
  source_id,
  subject_fingerprint,
  legacy_role,
  target_branch_id,
  target_role_id,
  target_permission_keys,
  target_profile_fingerprint,
  created_by
)
SELECT
  state.organization_id,
  state.manifest_id,
  'membership',
  member.id,
  app_private.transition_subject_fingerprint(
    'membership',
    member.id,
    member.user_id::text
  ),
  member.role,
  state.branch_id,
  state.role_id,
  ARRAY[
    'finance.view',
    'finance.approve_expenses'
  ]::public.organization_permission_key[],
  app_private.organization_permission_profile_fingerprint(
    ARRAY[
      'finance.view',
      'finance.approve_expenses'
    ]::public.organization_permission_key[]
  ),
  state.super_admin_id
FROM custom_role_state AS state
JOIN public.organization_members AS member
  ON member.organization_id = state.organization_id
 AND member.user_id = state.legacy_manager_id;

SELECT throws_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'approved', approved_at = now()
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  '55000',
  'Transition manifest does not enumerate every legacy ordinary assignment.',
  'an incomplete manifest cannot be approved'
);

INSERT INTO public.organization_access_transition_manifest_items (
  organization_id,
  manifest_id,
  source_kind,
  source_id,
  subject_fingerprint,
  legacy_role,
  target_branch_id,
  target_role_id,
  target_permission_keys,
  target_profile_fingerprint,
  created_by
)
SELECT
  state.organization_id,
  state.manifest_id,
  'membership',
  member.id,
  app_private.transition_subject_fingerprint(
    'membership',
    member.id,
    member.user_id::text
  ),
  member.role,
  state.branch_id,
  state.role_id,
  ARRAY[
    'finance.view',
    'finance.approve_expenses'
  ]::public.organization_permission_key[],
  app_private.organization_permission_profile_fingerprint(
    ARRAY[
      'finance.view',
      'finance.approve_expenses'
    ]::public.organization_permission_key[]
  ),
  state.super_admin_id
FROM custom_role_state AS state
JOIN public.organization_members AS member
  ON member.organization_id = state.organization_id
 AND member.user_id = state.ordinary_non_admin_id;

UPDATE public.organization_access_transition_manifests
SET baseline_custom_fingerprint =
  app_private.organization_custom_assignment_baseline_fingerprint(
    organization_id,
    id
  )
WHERE id = (SELECT manifest_id FROM custom_role_state);

SELECT throws_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'approved', approved_at = now()
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  '55000',
  'Transition manifest fingerprint does not match its exact items.',
  'a manifest with a stale fingerprint cannot be approved'
);

UPDATE public.organization_access_transition_manifests
SET
  manifest_fingerprint = app_private.organization_transition_manifest_fingerprint(
    organization_id,
    id
  )
WHERE id = (SELECT manifest_id FROM custom_role_state);

SELECT throws_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'approved', manifest_fingerprint = repeat('f', 64)
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  '55000',
  'Transition manifest approval contract is immutable during status advancement.',
  'status advancement cannot swap the approved fingerprint or completeness contract'
);

SELECT lives_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'approved', approved_at = now()
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  'an exact complete manifest can be approved while access remains contained'
);

SELECT results_eq(
  $$
    SELECT status, version, approved_at IS NOT NULL, applied_at IS NULL
    FROM public.organization_access_transition_manifests
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  $$VALUES ('approved'::text, 2::bigint, true, true)$$,
  'manifest approval records its immutable lifecycle evidence'
);

SELECT throws_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = status
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  '55000',
  'Approved transition manifest evidence is immutable.',
  'approved manifest evidence rejects even a same-status write'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.organization_access_transition_manifest_items (organization_id, manifest_id, source_kind, source_id, subject_fingerprint, legacy_role, target_branch_id, target_role_id, target_permission_keys, target_profile_fingerprint) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, ARRAY[%L]::public.organization_permission_key[], %L)',
    organization_id,
    manifest_id,
    'membership',
    gen_random_uuid(),
    repeat('1', 64),
    'finance_member',
    branch_id,
    role_id,
    'finance.view',
    app_private.organization_permission_profile_fingerprint(
      ARRAY['finance.view']::public.organization_permission_key[]
    )
  ),
  '55000',
  'Approved transition manifest items are immutable.',
  'approved manifest items cannot be extended or replaced'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    organization_id
  ),
  '55000',
  'Ordinary access cannot be enabled while legacy ordinary memberships remain.',
  'approval alone cannot activate ordinary access before exact conversion'
)
FROM custom_role_state;

UPDATE public.organization_members AS member
SET
  role = 'custom',
  branch_id = manifest_item.target_branch_id,
  custom_role_id = manifest_item.target_role_id
FROM public.organization_access_transition_manifest_items AS manifest_item
WHERE manifest_item.manifest_id = (SELECT manifest_id FROM custom_role_state)
  AND manifest_item.source_kind = 'membership'
  AND manifest_item.source_id = member.id;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  branch_id,
  custom_role_id
)
SELECT organization_id, spare_user_id, 'custom', branch_id, role_id
FROM custom_role_state;

SELECT throws_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'applied', applied_at = now()
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  '55000',
  'Transition application includes an unlisted custom assignment.',
  'manifest application rejects an unlisted conversion'
);

DELETE FROM public.organization_members
WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  AND user_id = (SELECT spare_user_id FROM custom_role_state);

SELECT lives_ok(
  $$
    UPDATE public.organization_access_transition_manifests
    SET status = 'applied', applied_at = now()
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  'the exact approved conversion can be marked applied while still contained'
);

SELECT results_eq(
  $$
    SELECT status, version, approved_at IS NOT NULL, applied_at IS NOT NULL
    FROM public.organization_access_transition_manifests
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  $$,
  $$VALUES ('applied'::text, 3::bigint, true, true)$$,
  'manifest application records its immutable lifecycle evidence'
);

WITH inserted_role AS (
  INSERT INTO public.organization_roles (
    organization_id,
    name,
    created_by,
    updated_by
  )
  SELECT
    cross_organization_id,
    'Cross Transition Role',
    cross_super_admin_id,
    cross_super_admin_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET cross_role_id = inserted_role.id
FROM inserted_role;

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key,
  granted_by
)
SELECT
  cross_organization_id,
  cross_role_id,
  'finance.view',
  cross_super_admin_id
FROM custom_role_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role
)
SELECT cross_organization_id, spare_user_id, 'finance_member'
FROM custom_role_state;

WITH inserted_manifest AS (
  INSERT INTO public.organization_access_transition_manifests (
    organization_id,
    manifest_fingerprint,
    expected_legacy_membership_count,
    expected_legacy_invitation_count,
    baseline_custom_membership_count,
    baseline_custom_invitation_count,
    baseline_custom_fingerprint,
    created_by,
    updated_by
  )
  SELECT
    cross_organization_id,
    repeat('0', 64),
    1,
    0,
    0,
    0,
    repeat('0', 64),
    cross_super_admin_id,
    cross_super_admin_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET cross_manifest_id = inserted_manifest.id
FROM inserted_manifest;

SAVEPOINT invalid_manifest_item_destination;
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_access_transition_manifest_items (organization_id, manifest_id, source_kind, source_id, subject_fingerprint, legacy_role, target_branch_id, target_role_id, target_permission_keys, target_profile_fingerprint) SELECT %L, %L, %L, member.id, app_private.transition_subject_fingerprint(%L, member.id, member.user_id::text), member.role, %L, %L, ARRAY[%L]::public.organization_permission_key[], app_private.organization_permission_profile_fingerprint(ARRAY[%L]::public.organization_permission_key[]) FROM public.organization_members AS member WHERE member.organization_id = %L AND member.user_id = %L',
    cross_organization_id,
    cross_manifest_id,
    'membership',
    'membership',
    cross_branch_id,
    cross_role_id,
    'maintenance.view',
    'maintenance.view',
    cross_organization_id,
    spare_user_id
  ),
  '55000',
  'Transition manifest target branch, role, or permission profile is not exact and active.',
  'a staged manifest item must match its new destination role profile immediately'
)
FROM custom_role_state;
ROLLBACK TO SAVEPOINT invalid_manifest_item_destination;

INSERT INTO public.organization_access_transition_manifest_items (
  organization_id,
  manifest_id,
  source_kind,
  source_id,
  subject_fingerprint,
  legacy_role,
  target_branch_id,
  target_role_id,
  target_permission_keys,
  target_profile_fingerprint,
  created_by
)
SELECT
  state.cross_organization_id,
  state.cross_manifest_id,
  'membership',
  member.id,
  app_private.transition_subject_fingerprint(
    'membership',
    member.id,
    member.user_id::text
  ),
  member.role,
  state.cross_branch_id,
  state.cross_role_id,
  ARRAY['finance.view']::public.organization_permission_key[],
  app_private.organization_permission_profile_fingerprint(
    ARRAY['finance.view']::public.organization_permission_key[]
  ),
  state.cross_super_admin_id
FROM custom_role_state AS state
JOIN public.organization_members AS member
  ON member.organization_id = state.cross_organization_id
 AND member.user_id = state.spare_user_id;

UPDATE public.organization_access_transition_manifests
SET
  manifest_fingerprint = app_private.organization_transition_manifest_fingerprint(
    organization_id,
    id
  ),
  baseline_custom_fingerprint =
    app_private.organization_custom_assignment_baseline_fingerprint(
      organization_id,
      id
    )
WHERE id = (SELECT cross_manifest_id FROM custom_role_state);

SAVEPOINT move_applied_item_to_staged;
SELECT throws_ok(
  format(
    'UPDATE public.organization_access_transition_manifest_items SET organization_id = %L, manifest_id = %L, target_branch_id = %L, target_role_id = %L, target_permission_keys = ARRAY[%L]::public.organization_permission_key[], target_profile_fingerprint = app_private.organization_permission_profile_fingerprint(ARRAY[%L]::public.organization_permission_key[]) WHERE manifest_id = %L AND source_kind = %L AND source_id = (SELECT source_id FROM public.organization_access_transition_manifest_items WHERE manifest_id = %L ORDER BY source_id LIMIT 1)',
    cross_organization_id,
    cross_manifest_id,
    cross_branch_id,
    cross_role_id,
    'finance.view',
    'finance.view',
    manifest_id,
    'membership',
    manifest_id
  ),
  '55000',
  'Approved transition manifest items are immutable.',
  'an item cannot move from an applied manifest into a staged destination'
)
FROM custom_role_state;
ROLLBACK TO SAVEPOINT move_applied_item_to_staged;

SAVEPOINT delete_applied_manifest_item;
SELECT throws_ok(
  format(
    'DELETE FROM public.organization_access_transition_manifest_items WHERE manifest_id = %L AND source_kind = %L AND source_id = (SELECT source_id FROM public.organization_access_transition_manifest_items WHERE manifest_id = %L ORDER BY source_id LIMIT 1)',
    manifest_id,
    'membership',
    manifest_id
  ),
  '55000',
  'Approved transition manifest items are immutable.',
  'an applied manifest item cannot be deleted'
)
FROM custom_role_state;
ROLLBACK TO SAVEPOINT delete_applied_manifest_item;

UPDATE public.organization_access_transition_manifests
SET status = 'approved'
WHERE id = (SELECT cross_manifest_id FROM custom_role_state);

UPDATE public.organization_members AS member
SET
  role = 'custom',
  branch_id = manifest_item.target_branch_id,
  custom_role_id = manifest_item.target_role_id
FROM public.organization_access_transition_manifest_items AS manifest_item
WHERE manifest_item.manifest_id = (SELECT cross_manifest_id FROM custom_role_state)
  AND manifest_item.source_kind = 'membership'
  AND manifest_item.source_id = member.id;

UPDATE public.organization_access_transition_manifests
SET status = 'applied'
WHERE id = (SELECT cross_manifest_id FROM custom_role_state);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state);

SELECT results_eq(
  $$
    SELECT manifest.status, state.ordinary_access_enabled, count(member.id)::bigint
    FROM public.organization_access_transition_manifests AS manifest
    JOIN public.organization_authorization_states AS state
      ON state.organization_id = manifest.organization_id
    JOIN public.organization_members AS member
      ON member.organization_id = manifest.organization_id
     AND member.role = 'custom'
    WHERE manifest.id = (SELECT cross_manifest_id FROM custom_role_state)
    GROUP BY manifest.status, state.ordinary_access_enabled
  $$,
  $$VALUES ('applied'::text, true, 1::bigint)$$,
  'the reviewer fixture starts with one exactly applied custom membership'
);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state);

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT cross_organization_id, legacy_manager_id, 'finance_member'
FROM custom_role_state;

DELETE FROM public.organization_members
WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  AND user_id = (SELECT legacy_manager_id FROM custom_role_state);

SELECT is(
  (
    SELECT transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  ),
  true,
  'deleting an unlisted legacy row leaves the transition gate set until activation validates the applied manifest'
);

SELECT lives_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    cross_organization_id
  ),
  'deleting the unlisted legacy row can recover through exact activation validation'
)
FROM custom_role_state;

SELECT is(
  (
    SELECT transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  ),
  false,
  'successful exact activation validation clears the recovered transition gate'
);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state);

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT cross_organization_id, ordinary_non_admin_id, 'finance_member'
FROM custom_role_state;

UPDATE public.organization_members
SET
  role = 'custom',
  branch_id = (SELECT cross_branch_id FROM custom_role_state),
  custom_role_id = (SELECT cross_role_id FROM custom_role_state)
WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  AND user_id = (SELECT ordinary_non_admin_id FROM custom_role_state);

SELECT is(
  (
    SELECT transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  ),
  true,
  'converting an unlisted legacy row cannot clear the transition gate'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    cross_organization_id
  ),
  '55000',
  'Transition application includes an unlisted custom assignment.',
  'an unlisted legacy-to-custom conversion cannot activate ordinary access'
)
FROM custom_role_state;

SELECT is(
  (
    SELECT ordinary_access_enabled
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT cross_organization_id FROM custom_role_state)
  ),
  false,
  'failed exact validation keeps the organization contained'
);

-- 47
SELECT lives_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    organization_id
  ),
  'ordinary access activates after all legacy ordinary memberships are resolved'
)
FROM custom_role_state;

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members AS member
    JOIN public.organization_access_transition_manifest_items AS manifest_item
      ON manifest_item.manifest_id = (SELECT manifest_id FROM custom_role_state)
     AND manifest_item.source_kind = 'membership'
     AND manifest_item.source_id = member.id
     AND manifest_item.target_branch_id = member.branch_id
     AND manifest_item.target_role_id = member.custom_role_id
    WHERE member.organization_id = (SELECT organization_id FROM custom_role_state)
      AND member.role = 'custom'
  ),
  2::bigint,
  'every listed membership has exactly its approved branch and role'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
      AND role = 'custom'
  ),
  3::bigint,
  'the applied manifest preserves the one baseline custom member and adds only its two listed conversions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'organization_access_transition_manifests',
        'organization_access_transition_manifest_items'
      )
      AND column_name IN ('email', 'display_name', 'full_name')
  ),
  'the generic manifest schema stores fingerprints rather than user-facing PII'
);

SELECT is(
  (
    SELECT manifest_fingerprint
    FROM public.organization_access_transition_manifests
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  ),
  app_private.organization_transition_manifest_fingerprint(
    (SELECT organization_id FROM custom_role_state),
    (SELECT manifest_id FROM custom_role_state)
  ),
  'the applied manifest fingerprint still binds the exact approved item set'
);

SELECT is(
  (
    SELECT baseline_custom_fingerprint
    FROM public.organization_access_transition_manifests
    WHERE id = (SELECT manifest_id FROM custom_role_state)
  ),
  app_private.organization_custom_assignment_baseline_fingerprint(
    (SELECT organization_id FROM custom_role_state),
    (SELECT manifest_id FROM custom_role_state)
  ),
  'the applied manifest preserves the exact pre-existing custom assignment baseline'
);

-- 48
SELECT results_eq(
  $$
    SELECT ordinary_access_enabled, version
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  $$,
  $$VALUES (true, 3::bigint)$$,
  'successful activation records the enabled state and advances its version'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT custom_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 49
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_roles
    WHERE id = (SELECT role_id FROM custom_role_state)
  ),
  1::bigint,
  'an activated custom user can read their own role'
);

-- 50
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_roles
    WHERE id = (SELECT duplicate_role_id FROM custom_role_state)
  ),
  0::bigint,
  'an ordinary user cannot read another custom role in the same organization'
);

-- 51
SELECT is(
  (
    SELECT count(*)
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  ),
  1::bigint,
  'an ordinary member can read the containment state for their own organization'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 52
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 2, false)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.view'
  ),
  'unconfirmed permission removal returns a preview instead of raising'
)
FROM custom_role_state;

-- 53
SELECT results_eq(
  $$
    SELECT
      save_result ->> 'status',
      (save_result ->> 'affectedUserCount')::bigint,
      (save_result ->> 'version')::bigint
    FROM custom_role_state
  $$,
  $$VALUES ('confirmation_required'::text, 3::bigint, 2::bigint)$$,
  'removal preview reports the exact affected user count and version'
);

-- 54
SELECT results_eq(
  $$
    SELECT role_record.version, count(permission_record.permission_key)::bigint
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT role_id FROM custom_role_state)
    GROUP BY role_record.id
  $$,
  $$VALUES (2::bigint, 2::bigint)$$,
  'an unconfirmed removal does not mutate role permissions or version'
);

-- 55
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 2, true)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.view'
  ),
  'confirmed removal mutates through the checked RPC'
)
FROM custom_role_state;

-- 56
SELECT results_eq(
  $$
    SELECT role_record.version, permission_record.permission_key::text
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT role_id FROM custom_role_state)
  $$,
  $$VALUES (3::bigint, 'finance.view'::text)$$,
  'confirmed removal persists only the requested View permission and advances version'
);

-- 57
SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_id = (SELECT role_id FROM custom_role_state)
      AND action = 'organization_role_permission_removed'
      AND previous_values ->> 'permission_key' = 'finance.approve_expenses'
  ),
  1::bigint,
  'confirmed removal appends one activity event for the removed key'
);

-- 58
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L, %L]::public.organization_permission_key[], 3, false)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.view',
    'finance.publish'
  ),
  'adding a permission after confirmation succeeds'
)
FROM custom_role_state;

-- 59
SELECT results_eq(
  $$
    SELECT role_record.version, permission_record.permission_key::text
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT role_id FROM custom_role_state)
    ORDER BY permission_record.permission_key
  $$,
  $$VALUES
    (4::bigint, 'finance.view'::text),
    (4::bigint, 'finance.publish'::text)
  $$,
  'permission addition preserves View and advances the version once'
);

-- 60
SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_id = (SELECT role_id FROM custom_role_state)
      AND action = 'organization_role_permission_added'
      AND new_values ->> 'permission_key' = 'finance.publish'
  ),
  1::bigint,
  'each later permission addition creates one matching activity event'
);

-- 61
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 1, false)',
    organization_id,
    duplicate_role_id,
    'Finance Reviewer Copy',
    'finance.approve_expenses'
  ),
  'removing View from an unassigned role returns a preview'
)
FROM custom_role_state;

-- 62
SELECT results_eq(
  $$
    SELECT
      save_result ->> 'status',
      (save_result ->> 'affectedUserCount')::bigint,
      (save_result ->> 'version')::bigint
    FROM custom_role_state
  $$,
  $$VALUES ('confirmation_required'::text, 0::bigint, 1::bigint)$$,
  'View-removal preview reports zero assigned users without mutation'
);

-- 63
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 1, true)',
    organization_id,
    duplicate_role_id,
    'Finance Reviewer Copy',
    'finance.approve_expenses'
  ),
  'confirmed View removal clears the complete permission group'
)
FROM custom_role_state;

-- 64
SELECT results_eq(
  $$
    SELECT role_record.version, count(permission_record.permission_key)::bigint
    FROM public.organization_roles AS role_record
    LEFT JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT duplicate_role_id FROM custom_role_state)
    GROUP BY role_record.id
  $$,
  $$VALUES (2::bigint, 0::bigint)$$,
  'removing View removes every dependent and leaves an unassigned role empty'
);

-- 65
SELECT throws_ok(
  format(
    'SELECT public.archive_organization_role(%L, %L, 4)',
    organization_id,
    role_id
  ),
  '55000',
  'Reassign users before archiving this role.',
  'an assigned role cannot be archived'
)
FROM custom_role_state;

-- 66
SELECT lives_ok(
  format(
    'SELECT public.archive_organization_role(%L, %L, 1)',
    organization_id,
    empty_role_id
  ),
  'an unassigned role can be archived'
)
FROM custom_role_state;

-- 67
SELECT results_eq(
  $$
    SELECT status, version, archived_at IS NOT NULL
    FROM public.organization_roles
    WHERE id = (SELECT empty_role_id FROM custom_role_state)
  $$,
  $$VALUES ('archived'::text, 2::bigint, true)$$,
  'archiving records the terminal state, version, and timestamp'
);

RESET ROLE;

-- 68
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    spare_user_id,
    'custom',
    branch_id,
    empty_role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'an archived role cannot be assigned'
)
FROM custom_role_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

-- 69
SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET replacement_role_id = public.create_organization_role(%L, %L)',
    organization_id,
    'archive me'
  ),
  'an archived name can be reused without losing history'
)
FROM custom_role_state;

-- 70
SELECT throws_ok(
  format(
    'SELECT public.save_organization_role(%L, %L, %L, ARRAY[%L, %L]::public.organization_permission_key[], 3, false)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.view',
    'finance.publish'
  ),
  '40001',
  'Role has changed. Reload and try again.',
  'stale optimistic versions are rejected'
)
FROM custom_role_state;

-- 71
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_roles (organization_id, name) VALUES (%L, %L)',
    organization_id,
    'Direct Write'
  ),
  '42501',
  'permission denied for table organization_roles',
  'authenticated callers cannot insert roles directly'
)
FROM custom_role_state;

-- 72
SELECT throws_ok(
  format(
    'DELETE FROM public.organization_role_permissions WHERE organization_id = %L AND role_id = %L',
    organization_id,
    role_id
  ),
  '42501',
  'permission denied for table organization_role_permissions',
  'authenticated callers cannot delete role permissions directly'
)
FROM custom_role_state;

-- 73
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'organization_role'
      AND activity.organization_id = (SELECT organization_id FROM custom_role_state)
      AND activity.actor_id IS DISTINCT FROM (SELECT super_admin_id FROM custom_role_state)
  ),
  'role lifecycle and permission activity preserves the authenticated actor'
);

RESET ROLE;

-- 74
SELECT lives_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = false WHERE organization_id = %L',
    organization_id
  ),
  'ordinary access can return to contained mode without deleting authorization data'
)
FROM custom_role_state;

INSERT INTO public.organization_invitations (
  organization_id,
  email,
  role
)
SELECT organization_id, 'legacy-invitation@example.test', 'finance_member'
FROM custom_role_state;

-- 75
SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    organization_id
  ),
  '55000',
  'Ordinary access cannot be enabled while legacy ordinary invitations remain.',
  'activation also fails closed while a live legacy ordinary invitation remains'
)
FROM custom_role_state;

-- 76
SELECT results_eq(
  $$
    SELECT
      authorization_state.ordinary_access_enabled,
      count(DISTINCT role_record.id)::bigint,
      count(DISTINCT permission_record.permission_key)::bigint,
      count(DISTINCT member.id)::bigint
    FROM public.organization_authorization_states AS authorization_state
    JOIN public.organization_roles AS role_record
      ON role_record.organization_id = authorization_state.organization_id
    LEFT JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    JOIN public.organization_members AS member
      ON member.organization_id = authorization_state.organization_id
     AND member.role = 'custom'
    WHERE authorization_state.organization_id = (SELECT organization_id FROM custom_role_state)
    GROUP BY authorization_state.organization_id
  $$,
  $$VALUES (false, 4::bigint, 2::bigint, 3::bigint)$$,
  'containment preserves roles, permissions, and staged assignments without activating access'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    organization_id
  ),
  '42501',
  'permission denied for table organization_authorization_states',
  'authenticated callers cannot mutate authorization state directly'
)
FROM custom_role_state;

RESET ROLE;

CREATE TEMP TABLE expected_custom_role_functions (
  signature text PRIMARY KEY,
  security_definer boolean NOT NULL,
  authenticated_execute boolean NOT NULL,
  service_execute boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_custom_role_functions VALUES
  ('app_private.workspace_role_scope_is_valid(text,uuid,uuid,uuid)', false, false, true),
  ('app_private.ensure_organization_authorization_state()', true, false, false),
  ('app_private.organization_permission_profile_fingerprint(public.organization_permission_key[])', false, false, false),
  ('app_private.transition_subject_fingerprint(text,uuid,text)', false, false, false),
  ('app_private.organization_transition_manifest_fingerprint(uuid,uuid)', true, false, false),
  ('app_private.organization_custom_assignment_baseline_fingerprint(uuid,uuid)', true, false, false),
  ('app_private.lock_organization_authorization_scope(uuid,uuid,uuid)', true, false, true),
  ('app_private.lock_current_organization_membership(uuid)', true, false, false),
  ('app_private.mark_transition_manifest_required()', true, false, false),
  ('app_private.assert_transition_manifest_targets(uuid,uuid)', true, false, false),
  ('app_private.assert_transition_manifest_approvable(uuid,uuid)', true, false, false),
  ('app_private.assert_transition_manifest_applied(uuid,uuid)', true, false, false),
  ('app_private.validate_transition_manifest_item()', true, false, false),
  ('app_private.validate_transition_manifest_lifecycle()', true, false, false),
  ('app_private.validate_custom_workspace_assignment()', false, false, false),
  ('app_private.prevent_assigned_role_from_becoming_empty()', true, false, false),
  ('app_private.validate_role_permission_view_dependencies()', true, false, false),
  ('app_private.prevent_assigned_role_archival()', true, false, false),
  ('app_private.validate_ordinary_access_activation()', true, false, false),
  ('app_private.can_read_organization_role(uuid,uuid)', true, true, false),
  ('app_private.can_read_organization_authorization_state(uuid)', true, true, false),
  ('app_private.normalize_organization_permission_keys(public.organization_permission_key[],public.organization_permission_key[])', false, false, false),
  ('app_private.normalized_organization_role_name(text)', false, false, false),
  ('app_private.assert_checked_workspace_access(uuid,text,uuid,uuid,uuid)', true, false, false),
  ('app_private.assert_role_super_admin(uuid)', true, true, false),
  ('app_private.create_organization_role_checked(uuid,text)', true, true, false),
  ('app_private.duplicate_organization_role_checked(uuid,uuid,text)', true, true, false),
  ('app_private.save_organization_role_checked(uuid,uuid,text,public.organization_permission_key[],bigint,boolean)', true, true, false),
  ('app_private.archive_organization_role_checked(uuid,uuid,bigint)', true, true, false),
  ('app_private.get_organization_roles_checked(uuid)', true, true, false),
  ('public.create_organization_role(uuid,text)', false, true, false),
  ('public.duplicate_organization_role(uuid,uuid,text)', false, true, false),
  ('public.save_organization_role(uuid,uuid,text,public.organization_permission_key[],bigint,boolean)', false, true, false),
  ('public.archive_organization_role(uuid,uuid,bigint)', false, true, false),
  ('public.get_organization_roles(uuid)', false, true, false),
  ('public.update_organization_member_access(uuid,uuid,text,uuid,uuid)', true, true, false),
  ('public.update_organization_member_access(uuid,uuid,text,uuid,uuid,uuid)', true, true, false),
  ('public.create_organization_invitation(uuid,text,text,uuid,uuid,uuid)', true, true, false),
  ('public.remove_organization_member_access(uuid,uuid)', true, true, false),
  ('public.accept_organization_invitation(uuid)', true, true, false);

SELECT is(
  (SELECT count(*) FROM expected_custom_role_functions WHERE to_regprocedure(signature) IS NOT NULL),
  40::bigint,
  'the privilege matrix resolves every function introduced or lock-order-overridden by the migration'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_custom_role_functions AS expected
    JOIN pg_proc AS function_record
      ON function_record.oid = to_regprocedure(expected.signature)
    WHERE NOT coalesce(function_record.proconfig, '{}'::text[])
      @> ARRAY['search_path=""']::text[]
  ),
  'every introduced function fixes an empty search path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_custom_role_functions AS expected
    JOIN pg_proc AS function_record
      ON function_record.oid = to_regprocedure(expected.signature)
    WHERE has_function_privilege('anon', function_record.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) AS privilege_record
        WHERE privilege_record.grantee = 0
          AND privilege_record.privilege_type = 'EXECUTE'
      )
  ),
  'no introduced function grants anon or PUBLIC execution'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_custom_role_functions AS expected
    JOIN pg_proc AS function_record
      ON function_record.oid = to_regprocedure(expected.signature)
    WHERE function_record.prosecdef IS DISTINCT FROM expected.security_definer
  ),
  'every introduced function has its exact reviewed invoker or definer mode'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_custom_role_functions AS expected
    JOIN pg_proc AS function_record
      ON function_record.oid = to_regprocedure(expected.signature)
    WHERE has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        IS DISTINCT FROM expected.authenticated_execute
      OR has_function_privilege('service_role', function_record.oid, 'EXECUTE')
        IS DISTINCT FROM expected.service_execute
  ),
  'authenticated and service execution exactly match the narrow reviewed matrix'
);

DELETE FROM public.organization_invitations
WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  AND email = 'legacy-invitation@example.test';

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT organization_id FROM custom_role_state);

SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    organization_id,
    spare_user_id,
    'finance_member'
  ),
  '55000',
  'Legacy ordinary assignments are disabled after ordinary access activation.',
  'active authorization rejects a new legacy ordinary membership'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'INSERT INTO public.organization_invitations (organization_id, email, role) VALUES (%L, %L, %L)',
    organization_id,
    'new-legacy-invitation@example.test',
    'finance_member'
  ),
  '55000',
  'Legacy ordinary assignments are disabled after ordinary access activation.',
  'active authorization rejects a new legacy ordinary invitation'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'DELETE FROM public.organization_role_permissions WHERE organization_id = %L AND role_id = %L',
    organization_id,
    role_id
  ),
  '55000',
  'Assigned roles must retain at least one permission.',
  'database integrity blocks deletion of the final permission from an assigned role'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'UPDATE public.organization_roles SET status = %L, archived_at = now(), archived_by = %L WHERE organization_id = %L AND id = %L',
    'archived',
    super_admin_id,
    organization_id,
    role_id
  ),
  '55000',
  'Assigned roles cannot be archived.',
  'database integrity blocks direct archival of an assigned role'
)
FROM custom_role_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT organization_id FROM custom_role_state);

SELECT is(
  (
    SELECT version
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  ),
  7::bigint,
  'each activation or containment state change advances the transition version'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger trigger_record
    JOIN pg_class table_record ON table_record.oid = trigger_record.tgrelid
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'organization_role_permissions'
      AND trigger_record.tgname = 'organization_role_permissions_view_dependency_check'
      AND trigger_record.tgdeferrable
      AND trigger_record.tginitdeferred
  ),
  'View dependency is enforced by a deferrable initially-deferred constraint trigger'
);

SAVEPOINT invalid_dependent_insert;
INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key
)
SELECT
  organization_id,
  replacement_role_id,
  'maintenance.complete'::public.organization_permission_key
FROM custom_role_state;
SELECT throws_ok(
  'SET CONSTRAINTS organization_role_permissions_view_dependency_check IMMEDIATE',
  '23514',
  'Every dependent permission requires its group View permission.',
  'direct permission insertion cannot persist a dependent without View'
);
ROLLBACK TO SAVEPOINT invalid_dependent_insert;
SET CONSTRAINTS ALL DEFERRED;

SAVEPOINT invalid_view_delete;
DELETE FROM public.organization_role_permissions
WHERE role_id = (SELECT role_id FROM custom_role_state)
  AND permission_key = 'finance.view';
SELECT throws_ok(
  'SET CONSTRAINTS organization_role_permissions_view_dependency_check IMMEDIATE',
  '23514',
  'Every dependent permission requires its group View permission.',
  'direct View deletion cannot leave dependent permissions behind'
);
ROLLBACK TO SAVEPOINT invalid_view_delete;
SET CONSTRAINTS organization_role_permissions_view_dependency_check IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SAVEPOINT invalid_cross_role_view_move;
UPDATE public.organization_role_permissions
SET role_id = (SELECT replacement_role_id FROM custom_role_state)
WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  AND role_id = (SELECT role_id FROM custom_role_state)
  AND permission_key = 'finance.view';
SELECT throws_ok(
  'SET CONSTRAINTS organization_role_permissions_view_dependency_check IMMEDIATE',
  '23514',
  'Every dependent permission requires its group View permission.',
  'moving View to another role cannot orphan dependents on the OLD role pair'
);
ROLLBACK TO SAVEPOINT invalid_cross_role_view_move;
SET CONSTRAINTS ALL DEFERRED;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 4, true)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'finance.view'
  ),
  'the assigned regression fixture is reduced to exactly Finance View'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 5, true)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'maintenance.complete'
  ),
  'an assigned role can replace its only permission group atomically'
)
FROM custom_role_state;

RESET ROLE;

SELECT results_eq(
  $$
    SELECT role_record.version, permission_record.permission_key::text
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT role_id FROM custom_role_state)
    ORDER BY permission_record.permission_key
  $$,
  $$VALUES
    (6::bigint, 'maintenance.view'::text),
    (6::bigint, 'maintenance.complete'::text)
  $$,
  'group replacement stores the normalized Maintenance View and Complete profile'
);

SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET save_result = public.save_organization_role(%L, %L, %L, ARRAY[%L]::public.organization_permission_key[], 6, true)',
    organization_id,
    role_id,
    'Finance Reviewer',
    'maintenance.view'
  ),
  'a checked save can remove a dependent permission immediately after acquiring current authority'
)
FROM custom_role_state;

SELECT results_eq(
  $$
    SELECT role_record.version, permission_record.permission_key::text
    FROM public.organization_roles AS role_record
    JOIN public.organization_role_permissions AS permission_record
      ON permission_record.organization_id = role_record.organization_id
     AND permission_record.role_id = role_record.id
    WHERE role_record.id = (SELECT role_id FROM custom_role_state)
    ORDER BY permission_record.permission_key
  $$,
  $$VALUES (7::bigint, 'maintenance.view'::text)$$,
  'the immediate checked removal preserves View and advances the optimistic version once'
);

SELECT lives_ok(
  'SET CONSTRAINTS organization_role_permissions_view_dependency_check IMMEDIATE',
  'the saved replacement satisfies the deferred View-dependency invariant'
);
SET CONSTRAINTS ALL DEFERRED;

RESET ROLE;

SELECT has_function(
  'app_private',
  'lock_organization_authorization_scope',
  ARRAY['uuid', 'uuid', 'uuid'],
  'one private helper owns the authorization write lock order'
);

SELECT has_function(
  'app_private',
  'lock_current_organization_membership',
  ARRAY['uuid'],
  'one private helper serializes checked writes against current actor membership changes'
);

SELECT is(
  obj_description(
    to_regprocedure(
      'app_private.lock_organization_authorization_scope(uuid,uuid,uuid)'
    ),
    'pg_proc'
  ),
  'Authorization lock order: organization authorization state, branch, role, then role permissions.',
  'the serialization order is documented on the lock helper'
);

SELECT is(
  obj_description(
    to_regprocedure('app_private.lock_current_organization_membership(uuid)'),
    'pg_proc'
  ),
  'Authorization actor lock: current organization membership row after authorization state and before authority assertion.',
  'the current-actor membership lock position is documented'
);

SELECT ok(
  (
    SELECT
      strpos(function_definition, 'FROM public.organization_authorization_states') > 0
      AND strpos(function_definition, 'FROM public.organization_authorization_states')
        < strpos(function_definition, 'FROM public.organization_branches')
      AND strpos(function_definition, 'FROM public.organization_branches')
        < strpos(function_definition, 'FROM public.organization_roles')
      AND strpos(function_definition, 'FROM public.organization_roles')
        < strpos(function_definition, 'FROM public.organization_role_permissions')
    FROM (
      SELECT pg_get_functiondef(
        to_regprocedure(
          'app_private.lock_organization_authorization_scope(uuid,uuid,uuid)'
        )
      ) AS function_definition
    ) AS lock_contract
  ),
  'the helper acquires state, branch, role, and permission locks in order'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc function_record
    JOIN pg_namespace schema_record ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'app_private'
      AND function_record.proname IN (
        'create_organization_role_checked',
        'duplicate_organization_role_checked',
        'save_organization_role_checked',
        'archive_organization_role_checked',
        'validate_custom_workspace_assignment',
        'validate_ordinary_access_activation'
      )
      AND pg_get_functiondef(function_record.oid)
        LIKE '%app_private.lock_organization_authorization_scope%'
  ),
  6::bigint,
  'every role mutation, assignment, and activation path uses the shared lock order'
);

SELECT ok(
  (
    SELECT bool_and(
      function_definition ~
        'BEGIN[[:space:]]+PERFORM app_private\.lock_organization_authorization_scope\([[:space:]]+p_organization_id,[[:space:]]+NULL,[[:space:]]+NULL[[:space:]]+\);[[:space:]]+PERFORM app_private\.lock_current_organization_membership\(p_organization_id\);[[:space:]]+v_actor_id := app_private\.assert_role_super_admin\(p_organization_id\);'
      AND (
        NOT requires_role_lock
        OR substring(
          function_definition
          FROM strpos(
            function_definition,
            'v_actor_id := app_private.assert_role_super_admin(p_organization_id);'
          )
        ) ~
          'PERFORM app_private\.lock_organization_authorization_scope\([[:space:]]+p_organization_id,[[:space:]]+NULL,[[:space:]]+p_role_id[[:space:]]+\);'
      )
    )
    FROM (
      VALUES
        ('app_private.create_organization_role_checked(uuid,text)'::regprocedure, false),
        ('app_private.duplicate_organization_role_checked(uuid,uuid,text)'::regprocedure, true),
        ('app_private.save_organization_role_checked(uuid,uuid,text,public.organization_permission_key[],bigint,boolean)'::regprocedure, true),
        ('app_private.archive_organization_role_checked(uuid,uuid,bigint)'::regprocedure, true)
    ) AS mutator(function_oid, requires_role_lock)
    CROSS JOIN LATERAL (
      SELECT pg_get_functiondef(mutator.function_oid) AS function_definition
    ) AS source
  ),
  'checked role mutators lock authorization state, then current actor membership, assert current authority, and only then lock role state'
);

SELECT ok(
  (
    SELECT
      function_record.provolatile = 's'
      AND function_definition LIKE '%app_private.assert_role_super_admin%'
      AND function_definition NOT LIKE '%app_private.lock_organization_authorization_scope%'
    FROM pg_proc AS function_record
    CROSS JOIN LATERAL (
      SELECT pg_get_functiondef(function_record.oid) AS function_definition
    ) AS source
    WHERE function_record.oid =
      'app_private.get_organization_roles_checked(uuid)'::regprocedure
  ),
  'the snapshot-consistent read-only role register checks Super Admin authority without taking mutation locks'
);

SELECT ok(
  (
    SELECT bool_and(
      function_definition ~
        'BEGIN[[:space:]]+PERFORM app_private\.lock_organization_authorization_scope\([[:space:]]+p_organization_id,[[:space:]]+NULL,[[:space:]]+NULL[[:space:]]+\);[[:space:]]+PERFORM app_private\.lock_current_organization_membership\([[:space:]]+p_organization_id[[:space:]]+\);[[:space:]]+IF \(SELECT auth\.uid\(\)\) IS NULL[[:space:]]+OR NOT app_private\.can_manage_access\(p_organization_id\) THEN'
      AND strpos(function_definition, 'FOR UPDATE') >
        strpos(function_definition, 'app_private.can_manage_access(p_organization_id)')
    )
    FROM (
      VALUES
        ('public.update_organization_member_access(uuid,uuid,text,uuid,uuid)'::regprocedure),
        ('public.remove_organization_member_access(uuid,uuid)'::regprocedure)
    ) AS mutator(function_oid)
    CROSS JOIN LATERAL (
      SELECT pg_get_functiondef(mutator.function_oid) AS function_definition
    ) AS source
  ),
  'admin membership mutators lock state, then current actor membership, recheck access authority, and only then lock target rows'
);

SELECT ok(
  (
    SELECT bool_and(
      function_definition ~
        'BEGIN[[:space:]]+PERFORM app_private\.lock_organization_authorization_scope\([[:space:]]+p_organization_id,[[:space:]]+NULL,[[:space:]]+NULL[[:space:]]+\);[[:space:]]+PERFORM app_private\.lock_current_organization_membership\([[:space:]]+p_organization_id[[:space:]]+\);[[:space:]]+IF \(SELECT auth\.uid\(\)\) IS NULL[[:space:]]+OR NOT app_private\.can_manage_access\(p_organization_id\) THEN'
      AND strpos(function_definition, 'app_private.assert_checked_workspace_access') >
        strpos(function_definition, 'app_private.can_manage_access(p_organization_id)')
    )
    FROM (
      VALUES
        (to_regprocedure(
          'public.create_organization_invitation(uuid,text,text,uuid,uuid,uuid)'
        )),
        (to_regprocedure(
          'public.update_organization_member_access(uuid,uuid,text,uuid,uuid,uuid)'
        ))
    ) AS mutator(function_oid)
    CROSS JOIN LATERAL (
      SELECT pg_get_functiondef(mutator.function_oid) AS function_definition
    ) AS source
  ),
  'checked custom access mutators lock state and actor authority before validating target scope'
);

SELECT ok(
  (
    SELECT function_definition ~
      'SELECT \* INTO target[[:space:]]+FROM public\.organization_invitations[[:space:]]+WHERE id = p_invitation_id;.*PERFORM app_private\.lock_organization_authorization_scope\([[:space:]]+target\.organization_id,[[:space:]]+NULL,[[:space:]]+NULL[[:space:]]+\);.*SELECT \* INTO target[[:space:]]+FROM public\.organization_invitations[[:space:]]+WHERE id = p_invitation_id[[:space:]]+FOR UPDATE;.*PERFORM app_private\.lock_staff_workspace_access\(.*FROM public\.organization_members AS member.*FOR UPDATE'
      AND strpos(function_definition, 'app_private.assert_checked_workspace_access') >
        strpos(function_definition, 'Password setup is required')
    FROM (
      SELECT pg_get_functiondef(
        'public.accept_organization_invitation(uuid)'::regprocedure
      ) AS function_definition
    ) AS source
  ),
  'invitation acceptance performs a nonlocking organization lookup, then locks state before invitation, staff, and membership rows'
);

SELECT ok(
  NOT coalesce(has_table_privilege('service_role', 'public.organization_roles', 'INSERT,UPDATE,DELETE'), false)
  AND NOT coalesce(has_table_privilege('service_role', 'public.organization_role_permissions', 'INSERT,UPDATE,DELETE'), false)
  AND NOT coalesce(has_table_privilege('service_role', 'public.organization_authorization_states', 'INSERT,UPDATE,DELETE'), false),
  'service infrastructure has no direct custom-role lifecycle mutation grants'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    spare_user_id,
    'custom',
    branch_id,
    role_id
  ),
  '42501',
  'Custom role assignment requires a checked or protected release path.',
  'service infrastructure cannot assign a custom role directly'
)
FROM custom_role_state;
RESET ROLE;
DELETE FROM public.organization_members
WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  AND user_id = (SELECT spare_user_id FROM custom_role_state);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  format(
    'INSERT INTO public.organization_roles (organization_id, name) VALUES (%L, %L)',
    organization_id,
    'Service Direct Role'
  ),
  '42501',
  'permission denied for table organization_roles',
  'service infrastructure cannot create a role without checked audit'
)
FROM custom_role_state;
RESET ROLE;
DELETE FROM public.organization_roles
WHERE organization_id = (SELECT organization_id FROM custom_role_state)
  AND name = 'Service Direct Role';

SELECT has_table(
  'public',
  'organization_access_transition_manifests',
  'contained organizations can store one approved transition manifest contract'
);
SELECT has_table(
  'public',
  'organization_access_transition_manifest_items',
  'transition manifests enumerate every approved legacy conversion'
);
SELECT has_column(
  'public',
  'organization_authorization_states',
  'transition_manifest_required',
  'authorization state records whether activation requires an applied manifest'
);
SELECT has_function(
  'app_private',
  'organization_permission_profile_fingerprint',
  ARRAY['public.organization_permission_key[]'],
  'permission profiles have a canonical non-PII fingerprint helper'
);
SELECT has_function(
  'app_private',
  'transition_subject_fingerprint',
  ARRAY['text', 'uuid', 'text'],
  'transition subjects have a generic non-PII fingerprint helper'
);
SELECT has_function(
  'app_private',
  'organization_transition_manifest_fingerprint',
  ARRAY['uuid', 'uuid'],
  'transition items have a canonical organization-scoped manifest fingerprint'
);

SELECT ok(
  NOT coalesce(has_table_privilege('authenticated', 'public.organization_access_transition_manifests', 'INSERT,UPDATE,DELETE'), false)
  AND NOT coalesce(has_table_privilege('authenticated', 'public.organization_access_transition_manifest_items', 'INSERT,UPDATE,DELETE'), false)
  AND NOT coalesce(has_table_privilege('service_role', 'public.organization_access_transition_manifests', 'INSERT,UPDATE,DELETE'), false)
  AND NOT coalesce(has_table_privilege('service_role', 'public.organization_access_transition_manifest_items', 'INSERT,UPDATE,DELETE'), false),
  'normal authenticated and service infrastructure cannot mutate protected transition evidence'
);

SELECT ok(
  (
    SELECT bool_and(table_record.relrowsecurity AND table_record.relforcerowsecurity)
    FROM pg_class AS table_record
    JOIN pg_namespace AS schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname IN (
        'organization_access_transition_manifests',
        'organization_access_transition_manifest_items'
      )
  ),
  'both transition evidence tables enable and force RLS'
);

SELECT has_function(
  'app_private',
  'organization_custom_assignment_baseline_fingerprint',
  ARRAY['uuid', 'uuid'],
  'the manifest binds the exact custom-assignment baseline without storing PII'
);

INSERT INTO public.organizations (id, name, slug)
SELECT
  invitation_organization_id,
  'Invitation Activation Test',
  'invitation-activation-' || left(invitation_organization_id::text, 8)
FROM custom_role_state;

INSERT INTO public.organization_branches (
  id,
  organization_id,
  name,
  code
)
SELECT
  invitation_branch_id,
  invitation_organization_id,
  'Invitation Branch',
  'INVITE'
FROM custom_role_state
UNION ALL
SELECT
  invitation_readiness_branch_id,
  invitation_organization_id,
  'Invitation Readiness Branch',
  'INVITE-READY'
FROM custom_role_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT invitation_organization_id, spare_user_id, 'super_admin'
FROM custom_role_state;

WITH inserted_role AS (
  INSERT INTO public.organization_roles (
    organization_id,
    name,
    created_by,
    updated_by
  )
  SELECT
    invitation_organization_id,
    'Invitation Role',
    spare_user_id,
    spare_user_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET invitation_role_id = inserted_role.id
FROM inserted_role;

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key,
  granted_by
)
SELECT
  invitation_organization_id,
  invitation_role_id,
  'properties.view',
  spare_user_id
FROM custom_role_state;

WITH inserted_invitation AS (
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    branch_id,
    custom_role_id,
    invited_by
  )
  SELECT
    invitation_organization_id,
    'custom-invitation@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id,
    spare_user_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET invitation_id = inserted_invitation.id
FROM inserted_invitation;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT
      (to_jsonb(role_register) ->> 'assigned_user_count')::bigint,
      coalesce(
        (to_jsonb(role_register) ->> 'pending_invitation_count')::bigint,
        -1::bigint
      )
    FROM public.get_organization_roles(
      (SELECT invitation_organization_id FROM custom_role_state)
    ) AS role_register
    WHERE (to_jsonb(role_register) ->> 'id')::uuid =
      (SELECT invitation_role_id FROM custom_role_state)
  $$,
  $$VALUES (0::bigint, 1::bigint)$$,
  'the role register counts live custom invitations separately from assigned users'
);

RESET ROLE;

SELECT lives_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    invitation_organization_id
  ),
  'ordinary access can activate with a valid pending custom invitation'
)
FROM custom_role_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

UPDATE public.organization_branches
SET status = 'inactive'
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    invitation_organization_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'activation rejects a pending custom invitation whose branch became inactive'
)
FROM custom_role_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

UPDATE public.organization_branches
SET status = 'active'
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);

ALTER TABLE public.organization_roles
  DISABLE TRIGGER organization_roles_prevent_assigned_archival;
UPDATE public.organization_roles
SET status = 'archived', archived_at = now(), archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);
ALTER TABLE public.organization_roles
  ENABLE TRIGGER organization_roles_prevent_assigned_archival;

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    invitation_organization_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'activation rejects a pending custom invitation whose role became archived'
)
FROM custom_role_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

UPDATE public.organization_roles
SET status = 'active', archived_at = NULL, archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);

UPDATE public.organization_invitations
SET status = 'expired'
WHERE id = (SELECT invitation_id FROM custom_role_state);

WITH inserted_invitation AS (
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    invited_by
  )
  SELECT
    invitation_organization_id,
    'legacy-refresh@example.test',
    'finance_member',
    'expired',
    spare_user_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET legacy_invitation_id = inserted_invitation.id
FROM inserted_invitation;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

UPDATE public.organization_roles
SET status = 'archived', archived_at = now(), archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    invitation_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'refresh cannot reactivate an expired custom invitation whose role was archived'
)
FROM custom_role_state;

RESET ROLE;

SELECT is(
  (
    SELECT invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT invitation_id FROM custom_role_state)
  ),
  'expired',
  'a rejected archived-role refresh does not mutate invitation status'
);

UPDATE public.organization_invitations
SET status = 'expired'
WHERE id = (SELECT invitation_id FROM custom_role_state);
UPDATE public.organization_roles
SET status = 'active', archived_at = NULL, archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);

DELETE FROM public.organization_role_permissions
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state)
  AND role_id = (SELECT invitation_role_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    invitation_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'refresh cannot reactivate an expired custom invitation whose role became empty'
)
FROM custom_role_state;

RESET ROLE;

SELECT is(
  (
    SELECT invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT invitation_id FROM custom_role_state)
  ),
  'expired',
  'a rejected empty-role refresh does not mutate invitation status'
);

UPDATE public.organization_invitations
SET status = 'expired'
WHERE id = (SELECT invitation_id FROM custom_role_state);
INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key,
  granted_by
)
SELECT
  invitation_organization_id,
  invitation_role_id,
  'properties.view',
  spare_user_id
FROM custom_role_state;

UPDATE public.organization_branches
SET status = 'inactive'
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    invitation_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'refresh cannot reactivate an expired custom invitation whose branch became inactive'
)
FROM custom_role_state;

RESET ROLE;

SELECT is(
  (
    SELECT invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT invitation_id FROM custom_role_state)
  ),
  'expired',
  'a rejected inactive-branch refresh does not mutate invitation status'
);

UPDATE public.organization_branches
SET archived_at = now()
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    invitation_id
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'refresh cannot reactivate an expired custom invitation whose branch was archived'
)
FROM custom_role_state;

RESET ROLE;

SELECT is(
  (
    SELECT invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT invitation_id FROM custom_role_state)
  ),
  'expired',
  'a rejected archived-branch refresh does not mutate invitation status'
);

ALTER TABLE public.organization_invitations
  DISABLE TRIGGER organization_invitations_validate_custom_assignment;
UPDATE public.organization_invitations
SET status = 'pending'
WHERE id = (SELECT invitation_id FROM custom_role_state);
ALTER TABLE public.organization_invitations
  ENABLE TRIGGER organization_invitations_validate_custom_assignment;

SELECT lives_ok(
  format(
    'UPDATE public.organization_invitations SET status = %L, revoked_at = now() WHERE id = %L',
    'revoked',
    invitation_id
  ),
  'an invalid active invitation can transition out to revoked'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'UPDATE public.organization_invitations SET custom_role_id = custom_role_id WHERE id = %L',
    invitation_id
  ),
  'cleanup scope updates remain possible while an invalid invitation is non-active'
)
FROM custom_role_state;

UPDATE public.organization_branches
SET status = 'active', archived_at = NULL, archived_by = NULL
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.refresh_organization_invitation(%L)',
    legacy_invitation_id
  ),
  '55000',
  'Legacy ordinary assignments are disabled after ordinary access activation.',
  'legacy ordinary invitations cannot be refreshed after ordinary access activation'
)
FROM custom_role_state;

RESET ROLE;

SELECT is(
  (
    SELECT invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT legacy_invitation_id FROM custom_role_state)
  ),
  'expired',
  'a rejected legacy refresh does not mutate invitation status'
);

WITH inserted_member AS (
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role
  )
  SELECT
    invitation_organization_id,
    legacy_manager_id,
    'super_admin'
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET checked_member_id = inserted_member.id
FROM inserted_member;

WITH inserted_role AS (
  INSERT INTO public.organization_roles (
    organization_id,
    name,
    created_by,
    updated_by
  )
  SELECT
    invitation_organization_id,
    'Checked Empty Role',
    spare_user_id,
    spare_user_id
  FROM custom_role_state
  RETURNING id
)
UPDATE custom_role_state
SET checked_empty_role_id = inserted_role.id
FROM inserted_role;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'contained-custom@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '55000',
  'Ordinary access is contained.',
  'checked custom invitations remain denied while authorization is contained'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, NULL, NULL)',
    invitation_organization_id,
    'checked-super-admin@example.test',
    'super_admin'
  ),
  'checked invitation creation supports organization-wide Super Admin access without scope'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    checked_member_id,
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '55000',
  'Ordinary access is contained.',
  'checked custom member reassignment remains denied while authorization is contained'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties (
  organization_id,
  name,
  code,
  property_type
)
SELECT
  invitation_organization_id,
  'Unresolved Checked Access Property',
  'CHECKED-UNSCOPED',
  'residential'
FROM custom_role_state;
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'unready-property-scope@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '55000',
  'Ordinary access cannot be enabled while Property branch scope is unresolved.',
  'checked custom access remains denied when Property branch readiness becomes unresolved'
)
FROM custom_role_state;

SELECT public.assign_property_branch(
  (SELECT invitation_organization_id FROM custom_role_state),
  (
    SELECT property.id
    FROM public.properties AS property
    WHERE property.organization_id = (
      SELECT invitation_organization_id FROM custom_role_state
    )
      AND property.code = 'CHECKED-UNSCOPED'
  ),
  (SELECT invitation_readiness_branch_id FROM custom_role_state)
);

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, NULL, NULL)',
    invitation_organization_id,
    'named-role@example.test',
    'Invitation Role'
  ),
  '22023',
  'Role kind must be super_admin or custom.',
  'checked invitation creation accepts role kind rather than a role name'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'scoped-admin@example.test',
    'super_admin',
    invitation_branch_id,
    invitation_role_id
  ),
  '22023',
  'Super Admin access cannot have branch, role, or Staff scope.',
  'checked invitation creation rejects organization-wide Super Admin scope values'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, NULL, %L)',
    invitation_organization_id,
    'missing-branch@example.test',
    'custom',
    invitation_role_id
  ),
  '22023',
  'Custom access requires one branch and one role.',
  'checked custom invitation creation requires exactly one branch'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, NULL)',
    invitation_organization_id,
    'missing-role@example.test',
    'custom',
    invitation_branch_id
  ),
  '22023',
  'Custom access requires one branch and one role.',
  'checked custom invitation creation requires exactly one role'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'cross-branch@example.test',
    'custom',
    cross_branch_id,
    invitation_role_id
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked custom invitation creation rejects a cross-organization branch'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'cross-role@example.test',
    'custom',
    invitation_branch_id,
    role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'checked custom invitation creation rejects a cross-organization role'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_branches
SET status = 'inactive'
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'inactive-branch@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked custom invitation creation rejects an inactive branch'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_branches
SET status = 'active', archived_at = now()
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'archived-branch@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked custom invitation creation rejects an archived branch'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_branches
SET archived_at = NULL
WHERE id = (SELECT invitation_branch_id FROM custom_role_state);
UPDATE public.organization_roles
SET status = 'archived', archived_at = now(), archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'archived-role@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'checked custom invitation creation rejects an archived role'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_roles
SET status = 'active', archived_at = NULL, archived_by = NULL
WHERE id = (SELECT invitation_role_id FROM custom_role_state);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'empty-role@example.test',
    'custom',
    invitation_branch_id,
    checked_empty_role_id
  ),
  '23514',
  'An active role with permissions in this organization is required.',
  'checked custom invitation creation rejects an empty role'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'UPDATE custom_role_state SET checked_invitation_id = public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'custom-user-' || left(custom_user_id::text, 8) || '@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  'an active Super Admin can create a checked custom invitation'
)
FROM custom_role_state;

SELECT results_eq(
  $$
    SELECT invitation.role, invitation.branch_id, invitation.custom_role_id,
           invitation.person_id, invitation.status
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT checked_invitation_id FROM custom_role_state)
  $$,
  $$
    SELECT 'custom'::text, invitation_branch_id, invitation_role_id,
           NULL::uuid, 'pending'::text
    FROM custom_role_state
  $$,
  'checked invitation creation persists the exact role kind, branch, and role identifiers'
);

SELECT ok(
  (
    SELECT activity.new_values @> jsonb_build_object(
      'role_kind', 'custom',
      'branch_id', invitation_branch_id,
      'custom_role_id', invitation_role_id
    )
      AND NOT activity.new_values ? 'email'
    FROM public.activity_logs AS activity
    CROSS JOIN custom_role_state
    WHERE activity.entity_id = checked_invitation_id
      AND activity.action = 'organization_invitation_created'
    ORDER BY activity.created_at DESC
    LIMIT 1
  ),
  'checked invitation activity records scope identifiers without email data'
);

RESET ROLE;
UPDATE public.organization_invitations
SET status = 'send_failed', delivery_error = 'synthetic delivery failure'
WHERE id = (SELECT checked_invitation_id FROM custom_role_state);

SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT public.create_organization_invitation(
      invitation_organization_id,
      'custom-user-' || left(custom_user_id::text, 8) || '@example.test',
      'custom',
      NULL,
      invitation_branch_id,
      invitation_role_id
    )
    FROM custom_role_state
  ),
  (SELECT checked_invitation_id FROM custom_role_state),
  'checked invitation creation refreshes the same live invitation idempotently'
);

RESET ROLE;
SELECT results_eq(
  $$
    SELECT invitation.status, invitation.delivery_error IS NULL,
           invitation.expires_at > now()
    FROM public.organization_invitations AS invitation
    WHERE invitation.id = (SELECT checked_invitation_id FROM custom_role_state)
  $$,
  $$VALUES ('pending'::text, true, true)$$,
  'checked invitation refresh restores pending delivery state and a live expiry'
);

INSERT INTO app_private.invitation_password_challenges (
  invitation_id,
  auth_user_id,
  password_hash_fingerprint
)
SELECT
  checked_invitation_id,
  custom_user_id,
  extensions.digest('checked-custom-invite-proof', 'sha256')
FROM custom_role_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = false
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT custom_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    checked_invitation_id
  ),
  '55000',
  'Ordinary access is contained.',
  'a staged custom invitation cannot be accepted while authorization is contained'
)
FROM custom_role_state;

RESET ROLE;
UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT invitation_organization_id FROM custom_role_state);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.accept_organization_invitation(%L)',
    checked_invitation_id
  ),
  'a valid checked custom invitation can be accepted after activation'
)
FROM custom_role_state;

RESET ROLE;

SELECT results_eq(
  $$
    SELECT member.role, member.branch_id, member.custom_role_id, member.person_id
    FROM public.organization_members AS member
    WHERE member.organization_id = (
      SELECT invitation_organization_id FROM custom_role_state
    )
      AND member.user_id = (SELECT custom_user_id FROM custom_role_state)
  $$,
  $$
    SELECT 'custom'::text, invitation_branch_id, invitation_role_id, NULL::uuid
    FROM custom_role_state
  $$,
  'custom invitation acceptance atomically copies the exact branch and custom role'
);

SELECT ok(
  (
    SELECT activity.new_values @> jsonb_build_object(
      'role_kind', 'custom',
      'branch_id', invitation_branch_id,
      'custom_role_id', invitation_role_id
    )
      AND NOT activity.new_values ? 'email'
    FROM public.activity_logs AS activity
    CROSS JOIN custom_role_state
    WHERE activity.entity_id = checked_invitation_id
      AND activity.action = 'organization_invitation_accepted'
    ORDER BY activity.created_at DESC
    LIMIT 1
  ),
  'custom acceptance activity records exact scope without sensitive invitation data'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    'nonadmin-custom@example.test',
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  '42501',
  'Not authorized',
  'an ordinary custom member cannot create access invitations'
)
FROM custom_role_state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT spare_user_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, NULL, NULL)',
    cross_organization_id,
    'cross-org-admin@example.test',
    'super_admin'
  ),
  '42501',
  'Not authorized',
  'a Super Admin cannot create access in another organization'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L, %L, %L, NULL, NULL)',
    invitation_organization_id,
    'new-legacy-after-activation@example.test',
    'finance_member'
  ),
  '55000',
  'Legacy ordinary assignments are disabled after ordinary access activation.',
  'the released fixed-role invitation path cannot create legacy ordinary access after activation'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, NULL, NULL)',
    invitation_organization_id,
    checked_member_id,
    'super_admin'
  ),
  'the released five-argument member update remains callable for compatible Super Admin access'
)
FROM custom_role_state;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    checked_member_id,
    'super_admin',
    invitation_branch_id,
    invitation_role_id
  ),
  '22023',
  'Super Admin access cannot have branch, role, or Staff scope.',
  'checked member updates reject organization-wide Super Admin scope values'
)
FROM custom_role_state;

SELECT lives_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, NULL, %L, %L)',
    invitation_organization_id,
    checked_member_id,
    'custom',
    invitation_branch_id,
    invitation_role_id
  ),
  'an active Super Admin can reassign an existing member to checked custom access'
)
FROM custom_role_state;

RESET ROLE;

SELECT results_eq(
  $$
    SELECT member.role, member.branch_id, member.custom_role_id
    FROM public.organization_members AS member
    WHERE member.id = (SELECT checked_member_id FROM custom_role_state)
  $$,
  $$
    SELECT 'custom'::text, invitation_branch_id, invitation_role_id
    FROM custom_role_state
  $$,
  'checked member reassignment persists the exact custom scope'
);

SELECT ok(
  (
    SELECT activity.new_values @> jsonb_build_object(
      'role_kind', 'custom',
      'branch_id', invitation_branch_id,
      'custom_role_id', invitation_role_id
    )
      AND NOT activity.new_values ? 'email'
    FROM public.activity_logs AS activity
    CROSS JOIN custom_role_state
    WHERE activity.entity_id = checked_member_id
      AND activity.action = 'organization_member_access_updated'
      AND activity.new_values->>'role_kind' = 'custom'
    ORDER BY activity.id DESC
    LIMIT 1
  ),
  'checked member reassignment audits the exact custom scope without sensitive data'
);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT organization_id FROM custom_role_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM custom_role_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_member_access(%L, %L, %L, NULL, %L, %L)',
    organization_id,
    (
      SELECT member.id
      FROM public.organization_members AS member
      WHERE member.organization_id = organization_id
        AND member.user_id = super_admin_id
    ),
    'custom',
    branch_id,
    role_id
  ),
  '55000',
  'The final Super Admin cannot be demoted',
  'checked custom reassignment preserves final Super Admin protection'
)
FROM custom_role_state;

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
