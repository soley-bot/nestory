BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(44);

-- Schema and API contract. These assertions are the first red gate on the
-- 100-migration local schema: the Property branch column and checked RPCs do
-- not exist until property_branch_scope_foundation is applied.
SELECT has_column(
  'public',
  'properties',
  'branch_id',
  'Properties retain their canonical branch identity'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'public.properties'::regclass
      AND constraint_record.conname = 'properties_branch_organization_fk'
      AND constraint_record.contype = 'f'
      AND pg_get_constraintdef(constraint_record.oid) LIKE
        'FOREIGN KEY (organization_id, branch_id) REFERENCES organization_branches(organization_id, id)%'
  ),
  'Property branch identity is protected by a same-organization composite foreign key'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes AS index_record
    WHERE index_record.schemaname = 'public'
      AND index_record.tablename = 'properties'
      AND index_record.indexname = 'properties_org_branch_archived_idx'
      AND replace(index_record.indexdef, '"', '') LIKE
        '%(organization_id, branch_id, archived_at)%'
  ),
  'Property branch and archive predicates have the required composite index'
);

SELECT has_function(
  'public',
  'get_organization_branch_readiness',
  ARRAY['uuid'],
  'checked branch readiness RPC exists'
);

SELECT has_function(
  'public',
  'assign_property_branch',
  ARRAY['uuid', 'uuid', 'uuid'],
  'checked Property branch assignment RPC exists'
);

SELECT ok(
  (
    SELECT count(*) = 2
    FROM pg_proc AS function_record
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'get_organization_branch_readiness',
        'assign_property_branch'
      )
      AND NOT function_record.prosecdef
      AND coalesce(array_to_string(function_record.proconfig, ','), '') LIKE
        '%search_path=%'
  ),
  'public branch RPCs are security-invoker wrappers with explicit search paths'
);

SELECT ok(
  (
    SELECT count(*) = 2
    FROM pg_proc AS function_record
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'get_organization_branch_readiness',
        'assign_property_branch'
      )
      AND has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', function_record.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', function_record.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(
          coalesce(function_record.proacl, acldefault('f', function_record.proowner))
        ) AS privilege_record
        WHERE privilege_record.grantee = 0
          AND privilege_record.privilege_type = 'EXECUTE'
      )
  ),
  'branch RPCs execute only for authenticated callers and never through PUBLIC'
);

SELECT ok(
  (
    SELECT table_record.relrowsecurity
    FROM pg_class AS table_record
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'properties'
  ),
  'Properties remain protected by RLS'
);

SELECT ok(
  (
    SELECT
      strpos(
        pg_get_functiondef(function_record.oid),
        'PERFORM app_private.lock_organization_authorization_scope'
      ) > 0
      AND strpos(
        pg_get_functiondef(function_record.oid),
        'PERFORM app_private.lock_current_organization_membership'
      ) > 0
      AND strpos(
        pg_get_functiondef(function_record.oid),
        'app_private.assert_role_super_admin'
      ) > 0
      AND strpos(
        pg_get_functiondef(function_record.oid),
        'PERFORM app_private.lock_organization_authorization_scope'
      ) < strpos(
        pg_get_functiondef(function_record.oid),
        'PERFORM app_private.lock_current_organization_membership'
      )
      AND strpos(
        pg_get_functiondef(function_record.oid),
        'PERFORM app_private.lock_current_organization_membership'
      ) < strpos(
        pg_get_functiondef(function_record.oid),
        'app_private.assert_role_super_admin'
      )
    FROM pg_proc AS function_record
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'app_private'
      AND function_record.proname = 'assign_property_branch_checked'
      AND pg_get_function_identity_arguments(function_record.oid) =
        'p_organization_id uuid, p_property_id uuid, p_branch_id uuid'
  ),
  'checked Property assignment locks authorization state, current membership, then reads Super Admin authority'
);

CREATE TEMP TABLE branch_scope_state (
  single_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  zero_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  conflict_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  fresh_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  inactive_only_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archived_only_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_inactive_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_branch_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_role_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_empty_role_org_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinary_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  single_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_branch_a_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_branch_b_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_inactive_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_archived_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  conflict_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  inactive_only_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archived_only_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_inactive_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_role_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_empty_role_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  single_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  zero_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  conflict_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  inactive_only_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archived_only_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_inactive_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_branch_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_archived_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_empty_role_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO branch_scope_state DEFAULT VALUES;
GRANT SELECT ON branch_scope_state TO authenticated, service_role;

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
  extensions.crypt('branch-scope-test', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id AS user_id, 'super-admin' AS label
  FROM branch_scope_state
  UNION ALL
  SELECT ordinary_user_id, 'ordinary-user' FROM branch_scope_state
  UNION ALL
  SELECT cross_super_admin_id, 'cross-super-admin' FROM branch_scope_state
) AS user_record;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, organization_name, organization_slug
FROM (
  SELECT single_org_id, 'Single Branch Org', 'branch-single-' || left(single_org_id::text, 8)
  FROM branch_scope_state
  UNION ALL SELECT zero_org_id, 'Zero Branch Org', 'branch-zero-' || left(zero_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT multi_org_id, 'Multi Branch Org', 'branch-multi-' || left(multi_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT conflict_org_id, 'Conflict Branch Org', 'branch-conflict-' || left(conflict_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT fresh_org_id, 'Fresh Org', 'branch-fresh-' || left(fresh_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT legacy_org_id, 'Legacy Org', 'branch-legacy-' || left(legacy_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT cross_org_id, 'Cross Org', 'branch-cross-' || left(cross_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT inactive_only_org_id, 'Inactive Only Org', 'branch-inactive-only-' || left(inactive_only_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT archived_only_org_id, 'Archived Only Org', 'branch-archived-only-' || left(archived_only_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT invite_inactive_org_id, 'Inactive Invite Org', 'invite-inactive-' || left(invite_inactive_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT invite_archived_branch_org_id, 'Archived Branch Invite Org', 'invite-archived-branch-' || left(invite_archived_branch_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT invite_archived_role_org_id, 'Archived Role Invite Org', 'invite-archived-role-' || left(invite_archived_role_org_id::text, 8) FROM branch_scope_state
  UNION ALL SELECT invite_empty_role_org_id, 'Empty Role Invite Org', 'invite-empty-role-' || left(invite_empty_role_org_id::text, 8) FROM branch_scope_state
) AS organization_fixture(organization_id, organization_name, organization_slug);

INSERT INTO public.organization_branches (
  id,
  organization_id,
  name,
  code,
  status,
  archived_at
)
SELECT branch_id, organization_id, branch_name, branch_code, branch_status, archived_at
FROM (
  SELECT single_branch_id, single_org_id, 'Single Active', 'SINGLE', 'active', NULL::timestamptz FROM branch_scope_state
  UNION ALL SELECT multi_branch_a_id, multi_org_id, 'Multi A', 'MULTI-A', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT multi_branch_b_id, multi_org_id, 'Multi B', 'MULTI-B', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT multi_inactive_branch_id, multi_org_id, 'Inactive', 'INACTIVE', 'inactive', NULL FROM branch_scope_state
  UNION ALL SELECT multi_archived_branch_id, multi_org_id, 'Archived', 'ARCHIVED', 'active', now() FROM branch_scope_state
  UNION ALL SELECT conflict_branch_id, conflict_org_id, 'Conflict Active', 'CONFLICT', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT legacy_branch_id, legacy_org_id, 'Legacy Active', 'LEGACY', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT cross_branch_id, cross_org_id, 'Cross Active', 'CROSS', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT inactive_only_branch_id, inactive_only_org_id, 'Inactive Only', 'INACTIVE-ONLY', 'inactive', NULL FROM branch_scope_state
  UNION ALL SELECT archived_only_branch_id, archived_only_org_id, 'Archived Only', 'ARCHIVED-ONLY', 'active', now() FROM branch_scope_state
  UNION ALL SELECT invite_inactive_branch_id, invite_inactive_org_id, 'Invite Inactive', 'INV-INACTIVE', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT invite_archived_branch_id, invite_archived_branch_org_id, 'Invite Archived', 'INV-ARCHIVED', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT invite_archived_role_branch_id, invite_archived_role_org_id, 'Invite Archived Role', 'INV-ARCH-ROLE', 'active', NULL FROM branch_scope_state
  UNION ALL SELECT invite_empty_role_branch_id, invite_empty_role_org_id, 'Invite Empty Role', 'INV-EMPTY-ROLE', 'active', NULL FROM branch_scope_state
) AS branch_fixture(branch_id, organization_id, branch_name, branch_code, branch_status, archived_at);

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type
)
SELECT property_id, organization_id, property_name, property_code, 'apartment'
FROM (
  SELECT single_property_id, single_org_id, 'Single Property', 'SINGLE-P' FROM branch_scope_state
  UNION ALL SELECT zero_property_id, zero_org_id, 'Zero Property', 'ZERO-P' FROM branch_scope_state
  UNION ALL SELECT multi_property_id, multi_org_id, 'Multi Property', 'MULTI-P' FROM branch_scope_state
  UNION ALL SELECT conflict_property_id, conflict_org_id, 'Conflict Property', 'CONFLICT-P' FROM branch_scope_state
  UNION ALL SELECT legacy_property_id, legacy_org_id, 'Legacy Property', 'LEGACY-P' FROM branch_scope_state
  UNION ALL SELECT cross_property_id, cross_org_id, 'Cross Property', 'CROSS-P' FROM branch_scope_state
  UNION ALL SELECT inactive_only_property_id, inactive_only_org_id, 'Inactive Only Property', 'INACTIVE-ONLY-P' FROM branch_scope_state
  UNION ALL SELECT archived_only_property_id, archived_only_org_id, 'Archived Only Property', 'ARCHIVED-ONLY-P' FROM branch_scope_state
) AS property_fixture(property_id, organization_id, property_name, property_code);

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT single_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT zero_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT multi_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT conflict_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT fresh_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT legacy_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT legacy_org_id, ordinary_user_id, 'finance_member' FROM branch_scope_state
UNION ALL SELECT cross_org_id, cross_super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT inactive_only_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT archived_only_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT invite_inactive_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT invite_archived_branch_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT invite_archived_role_org_id, super_admin_id, 'super_admin' FROM branch_scope_state
UNION ALL SELECT invite_empty_role_org_id, super_admin_id, 'super_admin' FROM branch_scope_state;

INSERT INTO public.organization_roles (
  id,
  organization_id,
  name,
  created_by,
  updated_by
)
SELECT role_id, organization_id, role_name, super_admin_id, super_admin_id
FROM (
  SELECT invite_inactive_role_id, invite_inactive_org_id, 'Inactive Branch Invite Role', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_branch_role_id, invite_archived_branch_org_id, 'Archived Branch Invite Role', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_role_id, invite_archived_role_org_id, 'Archived Invite Role', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_empty_role_id, invite_empty_role_org_id, 'Empty Invite Role', super_admin_id FROM branch_scope_state
) AS role_fixture(role_id, organization_id, role_name, super_admin_id);

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key,
  granted_by
)
SELECT organization_id, role_id, 'properties.view', super_admin_id
FROM (
  SELECT invite_inactive_org_id, invite_inactive_role_id, super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_branch_org_id, invite_archived_branch_role_id, super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_role_org_id, invite_archived_role_id, super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_empty_role_org_id, invite_empty_role_id, super_admin_id FROM branch_scope_state
) AS permission_fixture(organization_id, role_id, super_admin_id);

INSERT INTO public.organization_invitations (
  organization_id,
  email,
  role,
  branch_id,
  custom_role_id,
  status,
  invited_by
)
SELECT
  organization_id,
  invitation_email,
  'custom',
  branch_id,
  role_id,
  invitation_status,
  super_admin_id
FROM (
  SELECT invite_inactive_org_id, 'inactive-invite@example.test', invite_inactive_branch_id, invite_inactive_role_id, 'pending', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_branch_org_id, 'archived-branch-invite@example.test', invite_archived_branch_id, invite_archived_branch_role_id, 'send_failed', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_archived_role_org_id, 'archived-role-invite@example.test', invite_archived_role_branch_id, invite_archived_role_id, 'pending', super_admin_id FROM branch_scope_state
  UNION ALL SELECT invite_empty_role_org_id, 'empty-role-invite@example.test', invite_empty_role_branch_id, invite_empty_role_id, 'send_failed', super_admin_id FROM branch_scope_state
) AS invitation_fixture(
  organization_id,
  invitation_email,
  branch_id,
  role_id,
  invitation_status,
  super_admin_id
);

-- The retained private helper is owner-only and lets this suite exercise the
-- exact deterministic migration algorithm against controlled fixtures.
SELECT is(
  app_private.backfill_property_branch_scope(),
  4::bigint,
  'deterministic backfill updates only organizations with exactly one active branch'
);

SELECT is(
  (SELECT branch_id FROM public.properties WHERE id = (SELECT single_property_id FROM branch_scope_state)),
  (SELECT single_branch_id FROM branch_scope_state),
  'single-active-branch Property backfill is deterministic'
);

SELECT is(
  (SELECT branch_id FROM public.properties WHERE id = (SELECT zero_property_id FROM branch_scope_state)),
  NULL::uuid,
  'a Property with zero active branches remains unresolved'
);

SELECT is(
  (SELECT branch_id FROM public.properties WHERE id = (SELECT multi_property_id FROM branch_scope_state)),
  NULL::uuid,
  'a Property with multiple active branches remains unresolved'
);

SELECT is(
  (SELECT branch_id FROM public.properties WHERE id = (SELECT inactive_only_property_id FROM branch_scope_state)),
  NULL::uuid,
  'an inactive-only branch is not eligible for deterministic Property backfill'
);

SELECT is(
  (SELECT branch_id FROM public.properties WHERE id = (SELECT archived_only_property_id FROM branch_scope_state)),
  NULL::uuid,
  'an active branch with archived evidence is not eligible for deterministic Property backfill'
);

UPDATE public.organization_branches
SET status = 'inactive'
WHERE id = (SELECT conflict_branch_id FROM branch_scope_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM branch_scope_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  format(
    'SELECT active_branch_count, property_count, scoped_property_count, unscoped_property_count, conflicting_record_count, ordinary_assignment_ready FROM public.get_organization_branch_readiness(%L)',
    (SELECT single_org_id FROM branch_scope_state)
  ),
  $$VALUES (1::bigint, 1::bigint, 1::bigint, 0::bigint, 0::bigint, true)$$,
  'single-active-branch readiness reports exact counts and ready state'
);

SELECT results_eq(
  format(
    'SELECT active_branch_count, property_count, scoped_property_count, unscoped_property_count, conflicting_record_count, ordinary_assignment_ready FROM public.get_organization_branch_readiness(%L)',
    (SELECT zero_org_id FROM branch_scope_state)
  ),
  $$VALUES (0::bigint, 1::bigint, 0::bigint, 1::bigint, 0::bigint, false)$$,
  'zero active branches with a Property is unresolved and not ready'
);

SELECT results_eq(
  format(
    'SELECT active_branch_count, property_count, scoped_property_count, unscoped_property_count, conflicting_record_count, ordinary_assignment_ready FROM public.get_organization_branch_readiness(%L)',
    (SELECT multi_org_id FROM branch_scope_state)
  ),
  $$VALUES (2::bigint, 1::bigint, 0::bigint, 1::bigint, 0::bigint, false)$$,
  'multiple active branches preserve unresolved Property scope without guessing'
);

SELECT results_eq(
  format(
    'SELECT active_branch_count, property_count, scoped_property_count, unscoped_property_count, conflicting_record_count, ordinary_assignment_ready FROM public.get_organization_branch_readiness(%L)',
    (SELECT conflict_org_id FROM branch_scope_state)
  ),
  $$VALUES (0::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint, false)$$,
  'a Property linked to an inactive branch is counted as a conflict'
);

SELECT results_eq(
  format(
    'SELECT active_branch_count, property_count, scoped_property_count, unscoped_property_count, conflicting_record_count, ordinary_assignment_ready FROM public.get_organization_branch_readiness(%L)',
    (SELECT fresh_org_id FROM branch_scope_state)
  ),
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, true)$$,
  'a fresh organization with no Properties is ready without requiring a branch'
);

SELECT set_config('request.jwt.claim.sub', (SELECT ordinary_user_id::text FROM branch_scope_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_organization_branch_readiness(%L)',
    (SELECT multi_org_id FROM branch_scope_state)
  ),
  '42501',
  'Only a Super Admin can manage roles.',
  'non-admin callers cannot read organization branch readiness'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM branch_scope_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_organization_branch_readiness(%L)',
    (SELECT cross_org_id FROM branch_scope_state)
  ),
  '42501',
  'Only a Super Admin can manage roles.',
  'readiness rejects a cross-organization Super Admin identifier'
);

SELECT throws_ok(
  format(
    'SELECT public.assign_property_branch(%L, %L, NULL)',
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state)
  ),
  '22004',
  'A Property branch is required.',
  'checked Property assignment rejects a null branch'
);

SELECT throws_ok(
  format(
    'SELECT public.assign_property_branch(%L, %L, %L)',
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state),
    (SELECT cross_branch_id FROM branch_scope_state)
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked Property assignment rejects a cross-organization branch'
);

SELECT throws_ok(
  format(
    'SELECT public.assign_property_branch(%L, %L, %L)',
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state),
    (SELECT multi_inactive_branch_id FROM branch_scope_state)
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked Property assignment rejects an inactive branch'
);

SELECT throws_ok(
  format(
    'SELECT public.assign_property_branch(%L, %L, %L)',
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state),
    (SELECT multi_archived_branch_id FROM branch_scope_state)
  ),
  '23514',
  'An active branch in this organization is required.',
  'checked Property assignment rejects an archived branch'
);

SELECT throws_ok(
  format(
    'SELECT public.assign_property_branch(%L, %L, %L)',
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT cross_property_id FROM branch_scope_state),
    (SELECT multi_branch_a_id FROM branch_scope_state)
  ),
  'P0002',
  'Property was not found in this organization.',
  'checked Property assignment rejects a cross-organization Property'
);

RESET ROLE;

UPDATE public.organization_branches
SET status = 'inactive'
WHERE id = (SELECT invite_inactive_branch_id FROM branch_scope_state);

UPDATE public.organization_branches
SET archived_at = now()
WHERE id = (SELECT invite_archived_branch_id FROM branch_scope_state);

ALTER TABLE public.organization_roles
  DISABLE TRIGGER organization_roles_prevent_assigned_archival;
UPDATE public.organization_roles
SET
  status = 'archived',
  archived_at = now(),
  archived_by = (SELECT super_admin_id FROM branch_scope_state)
WHERE id = (SELECT invite_archived_role_id FROM branch_scope_state);
ALTER TABLE public.organization_roles
  ENABLE TRIGGER organization_roles_prevent_assigned_archival;

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.organization_role_permissions
  DISABLE TRIGGER organization_role_permissions_keep_assigned_role_nonempty;
DELETE FROM public.organization_role_permissions
WHERE role_id = (SELECT invite_empty_role_id FROM branch_scope_state);
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.organization_role_permissions
  ENABLE TRIGGER organization_role_permissions_keep_assigned_role_nonempty;

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT invite_inactive_org_id FROM branch_scope_state)
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'a pending custom invitation with an inactive-only branch blocks activation'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT invite_archived_branch_org_id FROM branch_scope_state)
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'a send-failed custom invitation with active status and archived branch evidence blocks activation'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT invite_archived_role_org_id FROM branch_scope_state)
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'a pending custom invitation with an archived role blocks activation'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT invite_empty_role_org_id FROM branch_scope_state)
  ),
  '55000',
  'Every ordinary invitation requires one active branch and one active role with permissions.',
  'a send-failed custom invitation with an empty role blocks activation'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT multi_org_id FROM branch_scope_state)
  ),
  '55000',
  'Ordinary access cannot be enabled while Property branch scope is unresolved.',
  'ordinary access activation is denied while Property scope is unresolved'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM branch_scope_state), true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.assign_property_branch(
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state),
    (SELECT multi_branch_a_id FROM branch_scope_state)
  ),
  (SELECT multi_property_id FROM branch_scope_state),
  'Super Admin can assign an unresolved Property to an active same-organization branch'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE organization_id = (SELECT multi_org_id FROM branch_scope_state)
      AND entity_type = 'property'
      AND entity_id = (SELECT multi_property_id FROM branch_scope_state)
      AND action = 'property_branch_assigned'
  ),
  1::bigint,
  'checked Property branch assignment writes exactly one activity event'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM branch_scope_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'UPDATE public.properties SET branch_id = %L WHERE organization_id = %L AND id = %L',
    (SELECT multi_branch_b_id FROM branch_scope_state),
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state)
  ),
  '42501',
  NULL,
  'authenticated Super Admin has no direct Property DML table privilege'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  format(
    'UPDATE public.properties SET branch_id = %L WHERE organization_id = %L AND id = %L',
    (SELECT multi_branch_b_id FROM branch_scope_state),
    (SELECT multi_org_id FROM branch_scope_state),
    (SELECT multi_property_id FROM branch_scope_state)
  ),
  '42501',
  NULL,
  'service role has no direct Property DML table privilege'
);

RESET ROLE;

SELECT lives_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT multi_org_id FROM branch_scope_state)
  ),
  'ordinary access activation succeeds only after exact Property resolution'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.properties (organization_id, name, code, property_type) VALUES (%L, %L, %L, %L)',
    (SELECT multi_org_id FROM branch_scope_state),
    'Late Unresolved Property',
    'LATE-UNRESOLVED',
    'apartment'
  ),
  '55000',
  'Ordinary access requires every Property to retain an active branch.',
  'an enabled organization cannot introduce a new unresolved Property'
);

SELECT is(
  (
    SELECT transition_manifest_required
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT legacy_org_id FROM branch_scope_state)
  ),
  true,
  'legacy ordinary membership still requires an exact transition manifest'
);

SELECT is(
  (
    SELECT ordinary_access_enabled
    FROM public.organization_authorization_states
    WHERE organization_id = (SELECT legacy_org_id FROM branch_scope_state)
  ),
  false,
  'branch backfill does not activate legacy ordinary access'
);

SELECT throws_ok(
  format(
    'UPDATE public.organization_authorization_states SET ordinary_access_enabled = true WHERE organization_id = %L',
    (SELECT legacy_org_id FROM branch_scope_state)
  ),
  '55000',
  'Ordinary access cannot be enabled while legacy ordinary memberships remain.',
  'the exact transition-manifest containment gate remains authoritative'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.backfill_property_branch_scope()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'app_private.backfill_property_branch_scope()',
    'EXECUTE'
  ),
  'deterministic backfill is retained only as an owner-only recovery primitive'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'app_private.property_branch_assignment_context_capability',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'service_role',
    'app_private.property_branch_assignment_context_capability',
    'SELECT'
  ),
  'checked branch-assignment capability material is not readable by application roles'
);

SELECT is(
  (
    SELECT branch_id
    FROM public.properties
    WHERE id = (SELECT multi_property_id FROM branch_scope_state)
  ),
  (SELECT multi_branch_a_id FROM branch_scope_state),
  'denied direct writes leave the checked Property branch unchanged'
);

SELECT * FROM finish();

ROLLBACK;
