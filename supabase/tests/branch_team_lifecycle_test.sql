BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

SELECT has_function('public', 'update_organization_branch', ARRAY['uuid','uuid','text','text','text'], 'checked branch update RPC exists');
SELECT has_function('public', 'archive_organization_branch', ARRAY['uuid','uuid'], 'checked branch archive RPC exists');
SELECT has_function('public', 'restore_organization_branch', ARRAY['uuid','uuid'], 'checked branch restore RPC exists');
SELECT has_function('public', 'update_organization_team', ARRAY['uuid','uuid','uuid','text','uuid'], 'checked team update RPC exists');
SELECT has_function('public', 'archive_organization_team', ARRAY['uuid','uuid'], 'checked team archive RPC exists');
SELECT has_function('public', 'restore_organization_team', ARRAY['uuid','uuid'], 'checked team restore RPC exists');

SELECT ok(
  (
    SELECT count(*) = 8
    FROM pg_proc AS function_record
    JOIN pg_namespace AS schema_record ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'create_organization_branch', 'update_organization_branch',
        'archive_organization_branch', 'restore_organization_branch',
        'create_organization_team', 'update_organization_team',
        'archive_organization_team', 'restore_organization_team'
      )
      AND NOT function_record.prosecdef
      AND coalesce(array_to_string(function_record.proconfig, ','), '') LIKE '%search_path=%'
  ),
  'public branch and team mutation RPCs are security-invoker wrappers with explicit paths'
);

SELECT ok(
  (
    SELECT count(*) = 8
    FROM pg_proc AS function_record
    JOIN pg_namespace AS schema_record ON schema_record.oid = function_record.pronamespace
    WHERE schema_record.nspname = 'public'
      AND function_record.proname IN (
        'create_organization_branch', 'update_organization_branch',
        'archive_organization_branch', 'restore_organization_branch',
        'create_organization_team', 'update_organization_team',
        'archive_organization_team', 'restore_organization_team'
      )
      AND has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', function_record.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', function_record.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) AS privilege_record
        WHERE privilege_record.grantee = 0
          AND privilege_record.privilege_type = 'EXECUTE'
      )
  ),
  'public branch and team mutation RPCs execute only for authenticated callers'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.organization_branches', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.organization_teams', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role', 'public.organization_branches', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role', 'public.organization_teams', 'INSERT,UPDATE,DELETE'),
  'application roles cannot mutate branch or team tables directly'
);

SELECT ok(
  to_regclass('public.organization_members_active_branch_dependency_idx') IS NOT NULL
  AND to_regclass('public.organization_invitations_active_branch_dependency_idx') IS NOT NULL
  AND to_regclass('public.organization_teams_active_branch_dependency_idx') IS NOT NULL
  AND to_regclass('public.tasks_active_branch_dependency_idx') IS NOT NULL
  AND to_regclass('public.notification_outbox_live_branch_dependency_idx') IS NOT NULL
  AND to_regclass('public.organization_access_manifest_items_target_branch_idx') IS NOT NULL,
  'branch lifecycle dependency predicates are indexed'
);

CREATE TEMP TABLE branch_team_lifecycle_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinary_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  spare_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  empty_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_team_id uuid NOT NULL DEFAULT gen_random_uuid(),
  empty_team_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_team_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO branch_team_lifecycle_state DEFAULT VALUES;
GRANT SELECT ON branch_team_lifecycle_state TO authenticated, service_role;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('branch-team-test', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM (
  SELECT super_admin_id AS user_id, 'super-admin' AS label FROM branch_team_lifecycle_state
  UNION ALL SELECT ordinary_user_id, 'ordinary-user' FROM branch_team_lifecycle_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM branch_team_lifecycle_state
) AS users;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Lifecycle Test', 'lifecycle-' || left(organization_id::text, 8)
FROM branch_team_lifecycle_state
UNION ALL
SELECT cross_organization_id, 'Cross Lifecycle Test', 'cross-lifecycle-' || left(cross_organization_id::text, 8)
FROM branch_team_lifecycle_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, name, code
FROM (
  SELECT active_branch_id, organization_id, 'Central', 'CENTRAL' FROM branch_team_lifecycle_state
  UNION ALL SELECT spare_branch_id, organization_id, 'North', 'NORTH' FROM branch_team_lifecycle_state
  UNION ALL SELECT empty_branch_id, organization_id, 'South', 'SOUTH' FROM branch_team_lifecycle_state
  UNION ALL SELECT cross_branch_id, cross_organization_id, 'Cross', 'CROSS' FROM branch_team_lifecycle_state
) AS branches(branch_id, organization_id, name, code);

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT manager_person_id, organization_id, 'Lifecycle Manager', 'individual'
FROM branch_team_lifecycle_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin' FROM branch_team_lifecycle_state
UNION ALL
SELECT cross_organization_id, cross_super_admin_id, 'super_admin' FROM branch_team_lifecycle_state;

INSERT INTO public.organization_teams (id, organization_id, branch_id, name, manager_person_id)
SELECT active_team_id, organization_id, active_branch_id, 'Field Team', manager_person_id
FROM branch_team_lifecycle_state
UNION ALL
SELECT empty_team_id, organization_id, NULL, 'Office Team', manager_person_id
FROM branch_team_lifecycle_state
UNION ALL
SELECT cross_team_id, cross_organization_id, cross_branch_id, 'Cross Team', NULL
FROM branch_team_lifecycle_state;

SELECT set_config(
  'app.property_branch_assignment_context',
  (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),
  true
);
SELECT set_config(
  'app.property_creation_branch_id',
  (SELECT active_branch_id::text FROM branch_team_lifecycle_state),
  true
);

INSERT INTO public.properties (id, organization_id, branch_id, name, code, property_type)
SELECT property_id, organization_id, active_branch_id, 'Lifecycle Property', 'LIFE-P', 'apartment'
FROM branch_team_lifecycle_state;

SELECT set_config('app.property_creation_branch_id', '', true);
SELECT set_config('app.property_branch_assignment_context', 'off', true);

SELECT set_config('request.jwt.claim.sub', (SELECT ordinary_user_id::text FROM branch_team_lifecycle_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_branch(%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state),
    'Denied', 'DENIED', NULL
  ),
  '42501', NULL,
  'ordinary users cannot update branches'
);

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_team(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_team_id FROM branch_team_lifecycle_state)
  ),
  '42501', NULL,
  'ordinary users cannot archive teams'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM branch_team_lifecycle_state), true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.update_organization_branch(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_branch_id FROM branch_team_lifecycle_state),
    'South Office', 'SOUTH-1', '17 South Road'
  ),
  (SELECT empty_branch_id FROM branch_team_lifecycle_state),
  'Super Admin can update a same-organization active branch'
);

SELECT throws_ok(
  format(
    'SELECT public.update_organization_branch(%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT cross_branch_id FROM branch_team_lifecycle_state),
    'Cross changed', 'CROSS-2', NULL
  ),
  'P0002', 'Branch was not found.',
  'branch update rejects a cross-organization target'
);

SELECT is(
  public.update_organization_team(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_team_id FROM branch_team_lifecycle_state),
    (SELECT spare_branch_id FROM branch_team_lifecycle_state),
    'Office Operations',
    (SELECT manager_person_id FROM branch_team_lifecycle_state)
  ),
  (SELECT empty_team_id FROM branch_team_lifecycle_state),
  'Super Admin can update a team with same-organization references'
);

SELECT throws_ok(
  format(
    'SELECT public.update_organization_team(%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_team_id FROM branch_team_lifecycle_state),
    (SELECT cross_branch_id FROM branch_team_lifecycle_state),
    'Invalid scope',
    (SELECT manager_person_id FROM branch_team_lifecycle_state)
  ),
  '23503', 'Choose an active branch in this organization.',
  'team update rejects a cross-organization branch'
);

SELECT throws_ok(
  format(
    'SELECT public.create_organization_team(%L,%L,%L,NULL)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT spare_branch_id FROM branch_team_lifecycle_state),
    'Field Team'
  ),
  '23505', 'Team name is already in use.',
  'team names remain unique across the organization and return the checked message'
);

SELECT is(
  public.archive_organization_team(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_team_id FROM branch_team_lifecycle_state)
  ),
  (SELECT empty_team_id FROM branch_team_lifecycle_state),
  'Super Admin can archive a team without active dependencies'
);

SELECT ok(
  (SELECT archived_at IS NOT NULL AND archived_by = super_admin_id
   FROM public.organization_teams, branch_team_lifecycle_state
   WHERE id = empty_team_id),
  'team archive stores lifecycle evidence without deleting the row'
);

SELECT is(
  public.restore_organization_team(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_team_id FROM branch_team_lifecycle_state)
  ),
  (SELECT empty_team_id FROM branch_team_lifecycle_state),
  'Super Admin can restore an archived team when its references remain active'
);

SELECT is(
  public.archive_organization_branch(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_branch_id FROM branch_team_lifecycle_state)
  ),
  (SELECT empty_branch_id FROM branch_team_lifecycle_state),
  'Super Admin can archive a branch without active dependencies'
);

SELECT ok(
  (SELECT archived_at IS NOT NULL AND archived_by = super_admin_id AND status = 'inactive'
   FROM public.organization_branches, branch_team_lifecycle_state
   WHERE id = empty_branch_id),
  'branch archive stores lifecycle evidence without deleting the row'
);

SELECT is(
  public.restore_organization_branch(
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT empty_branch_id FROM branch_team_lifecycle_state)
  ),
  (SELECT empty_branch_id FROM branch_team_lifecycle_state),
  'Super Admin can restore an archived branch'
);

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Move or archive 1 active Property before archiving this branch.',
  'an active Property blocks branch archive'
);

RESET ROLE;
UPDATE public.properties SET archived_at = now() WHERE id = (SELECT property_id FROM branch_team_lifecycle_state);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Move or archive 1 active Team before archiving this branch.',
  'an active Team blocks branch archive'
);

RESET ROLE;
UPDATE public.organization_teams SET archived_at = now() WHERE id = (SELECT active_team_id FROM branch_team_lifecycle_state);

INSERT INTO public.person_branch_relationships (organization_id, person_id, branch_id, created_by)
SELECT organization_id, manager_person_id, active_branch_id, super_admin_id
FROM branch_team_lifecycle_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Archive 1 active Person relationship before archiving this branch.',
  'an active Person relationship blocks branch archive'
);

RESET ROLE;
UPDATE public.person_branch_relationships SET archived_at = now()
WHERE branch_id = (SELECT active_branch_id FROM branch_team_lifecycle_state);

INSERT INTO public.tenant_requests (id, organization_id, property_id, title)
SELECT request_id, organization_id, property_id, 'Lifecycle request'
FROM branch_team_lifecycle_state;
INSERT INTO public.tasks (id, organization_id, tenant_request_id, property_id, branch_id, title)
SELECT task_id, organization_id, request_id, property_id, active_branch_id, 'Lifecycle task'
FROM branch_team_lifecycle_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Complete, cancel, move, or archive 1 active Maintenance item before archiving this branch.',
  'an active Maintenance item blocks branch archive'
);

RESET ROLE;
UPDATE public.tasks SET archived_at = now() WHERE id = (SELECT task_id FROM branch_team_lifecycle_state);

INSERT INTO public.maintenance_recurrence_series (
  id, organization_id, branch_id, property_id, lifecycle, created_by
)
SELECT series_id, organization_id, active_branch_id, property_id, 'active', super_admin_id
FROM branch_team_lifecycle_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Retire or move 1 active Maintenance recurrence before archiving this branch.',
  'an active Maintenance recurrence blocks branch archive'
);

RESET ROLE;
UPDATE public.maintenance_recurrence_series SET lifecycle = 'retired', retired_at = now(), retired_by = (SELECT super_admin_id FROM branch_team_lifecycle_state)
WHERE id = (SELECT series_id FROM branch_team_lifecycle_state);

INSERT INTO public.organization_invitations (
  organization_id, email, role, branch_id, person_id, status, invited_by
)
SELECT organization_id, 'branch-invite@example.test', 'operations_member', active_branch_id,
       manager_person_id, 'pending', super_admin_id
FROM branch_team_lifecycle_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Reassign or revoke 1 active invitation before archiving this branch.',
  'an active ordinary invitation blocks branch archive'
);

RESET ROLE;
UPDATE public.organization_invitations SET status = 'revoked', revoked_at = now()
WHERE email = 'branch-invite@example.test';

INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, person_id)
SELECT organization_id, ordinary_user_id, 'operations_member', active_branch_id, manager_person_id
FROM branch_team_lifecycle_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT organization_id FROM branch_team_lifecycle_state),
    (SELECT active_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Reassign or remove 1 active ordinary membership before archiving this branch.',
  'an active ordinary membership blocks branch archive'
);

RESET ROLE;
DELETE FROM public.organization_members WHERE user_id = (SELECT ordinary_user_id FROM branch_team_lifecycle_state);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT cross_organization_id FROM branch_team_lifecycle_state);
UPDATE public.organization_teams
SET archived_at = now(), archived_by = (SELECT cross_super_admin_id FROM branch_team_lifecycle_state)
WHERE id = (SELECT cross_team_id FROM branch_team_lifecycle_state);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_super_admin_id::text FROM branch_team_lifecycle_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_branch(%L,%L)',
    (SELECT cross_organization_id FROM branch_team_lifecycle_state),
    (SELECT cross_branch_id FROM branch_team_lifecycle_state)
  ),
  '55000', 'Keep at least one active branch while ordinary access is enabled.',
  'the last required active branch cannot be archived'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*) FROM public.activity_logs
    WHERE organization_id = (SELECT organization_id FROM branch_team_lifecycle_state)
      AND entity_type = 'organization_branch'
      AND entity_id = (SELECT empty_branch_id FROM branch_team_lifecycle_state)
      AND action IN ('organization_branch_updated','organization_branch_archived','organization_branch_restored')
      AND previous_values IS NOT NULL
      AND new_values IS NOT NULL
  ),
  3::bigint,
  'branch update, archive, and restore each retain before and after activity'
);

SELECT is(
  (
    SELECT count(*) FROM public.activity_logs
    WHERE organization_id = (SELECT organization_id FROM branch_team_lifecycle_state)
      AND entity_type = 'organization_team'
      AND entity_id = (SELECT empty_team_id FROM branch_team_lifecycle_state)
      AND action IN ('organization_team_updated','organization_team_archived','organization_team_restored')
      AND previous_values IS NOT NULL
      AND new_values IS NOT NULL
  ),
  3::bigint,
  'team update, archive, and restore each retain before and after activity'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.organization_branches WHERE id = (SELECT empty_branch_id FROM branch_team_lifecycle_state))
  AND EXISTS (SELECT 1 FROM public.organization_teams WHERE id = (SELECT empty_team_id FROM branch_team_lifecycle_state)),
  'branch and team lifecycle mutations never cascade-delete business records'
);

SELECT * FROM finish();
ROLLBACK;
