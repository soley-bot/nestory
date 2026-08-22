BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(62);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND conname = 'organization_members_role_check'
      AND pg_get_constraintdef(oid) LIKE '%super_admin%'
      AND pg_get_constraintdef(oid) LIKE '%finance_manager%'
      AND pg_get_constraintdef(oid) LIKE '%finance_member%'
      AND pg_get_constraintdef(oid) LIKE '%operations_manager%'
      AND pg_get_constraintdef(oid) LIKE '%operations_member%'
      AND pg_get_constraintdef(oid) NOT LIKE '%''admin''%'
      AND pg_get_constraintdef(oid) NOT LIKE '%''manager''%'
      AND pg_get_constraintdef(oid) NOT LIKE '%''member''%'
  ),
  'organization memberships accept exactly the five product roles'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE role IN ('admin', 'manager', 'member')
  ),
  'the role migration leaves only the five product roles'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND conname = 'organization_members_role_scope_check'
      AND convalidated
  ),
  'membership role scopes are validated for every migrated row'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organization_invitations'::regclass
      AND conname = 'organization_invitations_role_scope_check'
      AND convalidated
  ),
  'invitation role scopes are validated for every migrated row'
);

SELECT has_function('app_private', 'is_super_admin', ARRAY['uuid'], 'Super Admin helper exists');
SELECT has_function('app_private', 'can_manage_access', ARRAY['uuid'], 'access capability exists');
SELECT has_function('app_private', 'can_configure_leases', ARRAY['uuid'], 'lease capability exists');
SELECT has_function('app_private', 'can_read_finance', ARRAY['uuid'], 'finance-read capability exists');
SELECT has_function('app_private', 'can_submit_expense', ARRAY['uuid'], 'expense-submit capability exists');
SELECT has_function('app_private', 'can_review_expense', ARRAY['uuid'], 'expense-review capability exists');
SELECT has_function('app_private', 'can_reverse_expense', ARRAY['uuid'], 'expense-reversal capability exists');
SELECT has_function('app_private', 'can_manage_operations', ARRAY['uuid'], 'operations-management capability exists');
SELECT has_function('app_private', 'can_execute_operations', ARRAY['uuid'], 'operations-execution capability exists');
SELECT has_function('app_private', 'can_operate_finance', ARRAY['uuid'], 'ordinary Finance operation capability exists');
SELECT has_function('app_private', 'can_manage_petty_cash', ARRAY['uuid'], 'Petty Cash operation capability exists');
SELECT has_function('app_private', 'can_manage_reconciliation_sources', ARRAY['uuid'], 'reconciliation-source configuration capability exists');
SELECT has_function('app_private', 'can_retry_current_rent', ARRAY['uuid'], 'current-rent retry capability exists');
SELECT has_function('app_private', 'can_lock_financial_month', ARRAY['uuid'], 'financial-month lock capability exists');
SELECT has_function('app_private', 'can_unlock_financial_month', ARRAY['uuid'], 'financial-month unlock capability exists');
SELECT has_function('app_private', 'can_read_finance_reports', ARRAY['uuid'], 'Finance report-read capability exists');
SELECT has_function('app_private', 'can_correct_finance', ARRAY['uuid'], 'Finance correction capability exists');
SELECT has_function(
  'app_private',
  'workspace_role_scope_is_valid',
  ARRAY['text', 'uuid', 'uuid'],
  'role-specific membership scope validator exists'
);

SELECT ok(
  NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.is_super_admin(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_access(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_configure_leases(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_read_finance(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_submit_expense(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_review_expense(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_reverse_expense(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_operations(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_execute_operations(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_operate_finance(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_petty_cash(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_reconciliation_sources(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_retry_current_rent(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_lock_financial_month(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_unlock_financial_month(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_read_finance_reports(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_correct_finance(uuid)'), 'EXECUTE'), false),
  'capability helpers are not executable through default PUBLIC grants'
);

SELECT ok(
  coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.is_super_admin(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_access(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_configure_leases(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_read_finance(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_submit_expense(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_review_expense(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_reverse_expense(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_operations(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_execute_operations(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_operate_finance(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_petty_cash(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_reconciliation_sources(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_retry_current_rent(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_lock_financial_month(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_unlock_financial_month(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_read_finance_reports(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_correct_finance(uuid)'), 'EXECUTE'), false),
  'authenticated RLS evaluation can execute every capability helper'
);

CREATE TEMP TABLE fixed_role_state (
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
  operations_member_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO fixed_role_state DEFAULT VALUES;
GRANT SELECT ON fixed_role_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('fixed-role-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM fixed_role_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM fixed_role_state
  UNION ALL SELECT finance_member_id, 'finance-member' FROM fixed_role_state
  UNION ALL SELECT operations_manager_id, 'operations-manager' FROM fixed_role_state
  UNION ALL SELECT operations_member_id, 'operations-member' FROM fixed_role_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM fixed_role_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Fixed role organization', 'fixed-role-' || left(organization_id::text, 8)
FROM fixed_role_state
UNION ALL
SELECT cross_organization_id, 'Cross role organization', 'cross-role-' || left(cross_organization_id::text, 8)
FROM fixed_role_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, 'Operations branch', 'OPS'
FROM fixed_role_state;
INSERT INTO public.people (id, organization_id, display_name)
SELECT operations_manager_person_id, organization_id, 'Operations Manager Person'
FROM fixed_role_state
UNION ALL
SELECT operations_member_person_id, organization_id, 'Operations Member Person'
FROM fixed_role_state
UNION ALL
SELECT invitation_person_id, organization_id, 'Invited Operations Person'
FROM fixed_role_state;
INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, operations_manager_person_id, 'staff', 'active'
FROM fixed_role_state
UNION ALL
SELECT organization_id, operations_member_person_id, 'staff', 'active'
FROM fixed_role_state
UNION ALL
SELECT organization_id, invitation_person_id, 'staff', 'active'
FROM fixed_role_state;

SELECT throws_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    organization_id,
    operations_manager_id,
    'operations_manager'
  ),
  '23514',
  'new row for relation "organization_members" violates check constraint "organization_members_role_scope_check"',
  'an Operations Manager membership cannot bypass required branch and Staff scope'
)
FROM fixed_role_state;

SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    organization_id,
    super_admin_id,
    'super_admin'
  ),
  'Super Admin membership is accepted'
)
FROM fixed_role_state;
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    organization_id,
    finance_manager_id,
    'finance_manager'
  ),
  'Finance Manager membership is accepted'
)
FROM fixed_role_state;
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    organization_id,
    finance_member_id,
    'finance_member'
  ),
  'Finance Member membership is accepted'
)
FROM fixed_role_state;
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, person_id, branch_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    operations_manager_id,
    'operations_manager',
    operations_manager_person_id,
    branch_id
  ),
  'Operations Manager membership is accepted'
)
FROM fixed_role_state;
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role, person_id, branch_id) VALUES (%L, %L, %L, %L, %L)',
    organization_id,
    operations_member_id,
    'operations_member',
    operations_member_person_id,
    branch_id
  ),
  'Operations Member membership is accepted'
)
FROM fixed_role_state;
SELECT lives_ok(
  format(
    'INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (%L, %L, %L)',
    cross_organization_id,
    cross_super_admin_id,
    'super_admin'
  ),
  'a second organization can have its own Super Admin'
)
FROM fixed_role_state;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_manage_access(organization_id),
      app_private.can_configure_leases(organization_id),
      app_private.can_read_finance(organization_id),
      app_private.can_submit_expense(organization_id),
      app_private.can_review_expense(organization_id),
      app_private.can_reverse_expense(organization_id),
      app_private.can_manage_operations(organization_id),
      app_private.can_execute_operations(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (true, true, true, true, true, true, true, true) $$,
  'Super Admin receives every fixed capability'
);

SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.legacy_role_has_permission('finance_manager','properties.view'),
      app_private.legacy_role_has_permission('finance_manager','leases.change_terms'),
      app_private.legacy_role_has_permission('finance_manager','finance.view'),
      app_private.legacy_role_has_permission('finance_manager','finance.submit_expenses'),
      app_private.legacy_role_has_permission('finance_manager','finance.approve_expenses'),
      app_private.legacy_role_has_permission('finance_manager','finance.correct_records'),
      app_private.legacy_role_has_permission('finance_manager','maintenance.create_assign'),
      app_private.legacy_role_has_permission('finance_manager','maintenance.complete')
    FROM fixed_role_state
  $$,
  $$ VALUES (false, true, true, false, true, true, false, false) $$,
  'Finance Manager legacy transition mapping has the named approved permissions'
);

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.legacy_role_has_permission('finance_member','properties.view'),
      app_private.legacy_role_has_permission('finance_member','leases.change_terms'),
      app_private.legacy_role_has_permission('finance_member','finance.view'),
      app_private.legacy_role_has_permission('finance_member','finance.submit_expenses'),
      app_private.legacy_role_has_permission('finance_member','finance.approve_expenses'),
      app_private.legacy_role_has_permission('finance_member','finance.correct_records'),
      app_private.legacy_role_has_permission('finance_member','maintenance.create_assign'),
      app_private.legacy_role_has_permission('finance_member','maintenance.complete')
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, true, true, false, false, false, false) $$,
  'Finance Member legacy transition mapping has the named approved permissions'
);

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.legacy_role_has_permission('operations_manager','properties.view'),
      app_private.legacy_role_has_permission('operations_manager','leases.change_terms'),
      app_private.legacy_role_has_permission('operations_manager','finance.view'),
      app_private.legacy_role_has_permission('operations_manager','finance.submit_expenses'),
      app_private.legacy_role_has_permission('operations_manager','finance.approve_expenses'),
      app_private.legacy_role_has_permission('operations_manager','finance.correct_records'),
      app_private.legacy_role_has_permission('operations_manager','maintenance.create_assign'),
      app_private.legacy_role_has_permission('operations_manager','maintenance.complete')
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, true, true) $$,
  'Operations Manager legacy transition mapping has the named approved permissions'
);

SELECT set_config('request.jwt.claim.sub', (SELECT operations_member_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_manage_access(organization_id),
      app_private.can_configure_leases(organization_id),
      app_private.can_read_finance(organization_id),
      app_private.can_submit_expense(organization_id),
      app_private.can_review_expense(organization_id),
      app_private.can_reverse_expense(organization_id),
      app_private.can_manage_operations(organization_id),
      app_private.can_execute_operations(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, true) $$,
  'Operations Member can execute assigned operations only'
);

SELECT set_config('request.jwt.claim.sub', (SELECT cross_super_admin_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_manage_access(organization_id),
      app_private.can_configure_leases(organization_id),
      app_private.can_read_finance(organization_id),
      app_private.can_submit_expense(organization_id),
      app_private.can_review_expense(organization_id),
      app_private.can_reverse_expense(organization_id),
      app_private.can_manage_operations(organization_id),
      app_private.can_execute_operations(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'capabilities never cross organization boundaries'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SELECT ok(
  app_private.is_org_admin((SELECT organization_id FROM fixed_role_state)),
  'the Super Admin predicate recognizes only Super Admin authority'
);
SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SELECT ok(
  app_private.can_assign_tasks((SELECT organization_id FROM fixed_role_state)),
  'the task-assignment predicate recognizes Operations Manager'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='finance_expense_items'
      AND cmd='SELECT' AND coalesce(qual,'') LIKE '%can_read_finance_property%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='financial_reconciliation_sources'
      AND cmd='SELECT' AND coalesce(qual,'') LIKE '%can_read_finance_property%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='financial_month_locks'
      AND cmd='SELECT' AND coalesce(qual,'') LIKE '%current_active_branch_id%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='petty_cash_entries'
      AND cmd='SELECT' AND coalesce(qual,'') LIKE '%can_read_finance_property%'
  ),
  'named finance read policies enforce property or branch scope'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_expense_items', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.finance_income_items', 'INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT,UPDATE,DELETE'),
  'finance source tables reject direct authenticated DML'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.create_organization_invitation(%L,%L,%L,NULL,NULL)',
    organization_id,
    'finance-invite@example.test',
    'finance_member'
  ),
  'Finance invitation accepts organization-wide scope'
)
FROM fixed_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L,%L,%L,%L,%L)',
    organization_id,
    'scoped-finance@example.test',
    'finance_manager',
    operations_manager_person_id,
    branch_id
  ),
  '22023',
  'Finance roles cannot have branch or Staff scope',
  'Finance invitation rejects operations scope'
)
FROM fixed_role_state;

SELECT lives_ok(
  format(
    'SELECT public.create_organization_invitation(%L,%L,%L,%L,%L)',
    organization_id,
    'operations-invite@example.test',
    'operations_member',
    branch_id,
    invitation_person_id
  ),
  'Operations invitation accepts branch and Staff scope'
)
FROM fixed_role_state;

SELECT throws_ok(
  format(
    'SELECT public.create_organization_invitation(%L,%L,%L,NULL,NULL)',
    organization_id,
    'unscoped-operations@example.test',
    'operations_manager'
  ),
  '22023',
  'Operations roles require branch and Staff scope',
  'Operations invitation rejects missing scope'
)
FROM fixed_role_state;

SELECT throws_ok(
  format(
    'SELECT public.update_organization_member_access(%L,%L,%L,NULL,NULL)',
    organization_id,
    (
      SELECT member.id
      FROM public.organization_members AS member
      WHERE member.organization_id = fixed_role_state.organization_id
        AND member.user_id = fixed_role_state.super_admin_id
    ),
    'finance_manager'
  ),
  '55000',
  'The final Super Admin cannot be demoted',
  'the final Super Admin cannot be demoted'
)
FROM fixed_role_state;

SELECT throws_ok(
  format(
    'SELECT public.remove_organization_member_access(%L,%L)',
    organization_id,
    (
      SELECT member.id
      FROM public.organization_members AS member
      WHERE member.organization_id = fixed_role_state.organization_id
        AND member.user_id = fixed_role_state.super_admin_id
    )
  ),
  '55000',
  'The final Super Admin cannot be removed',
  'the final Super Admin cannot be removed'
)
FROM fixed_role_state;

RESET ROLE;

-- The invitation assertions above preserve the legacy pre-activation contract.
-- From this point, exercise the approved custom-role and one-branch model.
INSERT INTO public.organization_roles (id, organization_id, name)
SELECT role_id, state.organization_id, role_name
FROM fixed_role_state AS state
CROSS JOIN (VALUES
  ('fa000000-0000-0000-0000-000000000420'::uuid,'Finance Manager'),
  ('fa000000-0000-0000-0000-000000000421'::uuid,'Finance Member'),
  ('fa000000-0000-0000-0000-000000000422'::uuid,'Operations Manager'),
  ('fa000000-0000-0000-0000-000000000423'::uuid,'Operations Member')
) AS role_profile(role_id,role_name);

INSERT INTO public.organization_role_permissions (organization_id,role_id,permission_key)
SELECT state.organization_id,profile.role_id,profile.permission_key
FROM fixed_role_state AS state
CROSS JOIN (VALUES
  ('fa000000-0000-0000-0000-000000000420'::uuid,'leases.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000420'::uuid,'leases.change_terms'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000420'::uuid,'finance.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000420'::uuid,'finance.record_payments'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000420'::uuid,'finance.approve_expenses'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000420'::uuid,'finance.correct_records'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000421'::uuid,'leases.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000421'::uuid,'finance.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000421'::uuid,'finance.submit_expenses'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000422'::uuid,'maintenance.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000422'::uuid,'maintenance.create_assign'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000422'::uuid,'maintenance.complete'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000422'::uuid,'maintenance.review'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000423'::uuid,'maintenance.view'::public.organization_permission_key),
  ('fa000000-0000-0000-0000-000000000423'::uuid,'maintenance.complete'::public.organization_permission_key)
) AS profile(role_id,permission_key);

UPDATE public.organization_members AS member
SET role='custom',branch_id=state.branch_id,custom_role_id=CASE member.user_id
  WHEN state.finance_manager_id THEN 'fa000000-0000-0000-0000-000000000420'::uuid
  WHEN state.finance_member_id THEN 'fa000000-0000-0000-0000-000000000421'::uuid
  WHEN state.operations_manager_id THEN 'fa000000-0000-0000-0000-000000000422'::uuid
  WHEN state.operations_member_id THEN 'fa000000-0000-0000-0000-000000000423'::uuid
END
FROM fixed_role_state AS state
WHERE member.organization_id=state.organization_id
  AND member.user_id IN (state.finance_manager_id,state.finance_member_id,state.operations_manager_id,state.operations_member_id);

DELETE FROM public.organization_invitations AS invitation
USING fixed_role_state AS state
WHERE invitation.organization_id=state.organization_id;

UPDATE public.organization_authorization_states AS authorization_state
SET ordinary_access_enabled=true,transition_manifest_required=false
FROM fixed_role_state AS state
WHERE authorization_state.organization_id=state.organization_id;

SELECT pg_catalog.set_config(
  'app.property_branch_assignment_context',
  (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),
  true
);
INSERT INTO public.properties (id, organization_id, branch_id, name, code, property_type, status)
SELECT property_id, organization_id, branch_id, 'Finance policy property', 'FIN-POL', 'apartment', 'active'
FROM fixed_role_state;
SELECT pg_catalog.set_config('app.property_branch_assignment_context','off',true);

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status
)
SELECT
  'fa000000-0000-0000-0000-000000000410', organization_id, property_id,
  'FIN-01', 'vacant'
FROM fixed_role_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT
  'fa000000-0000-0000-0000-000000000411', organization_id,
  'Finance lease tenant', 'individual'
FROM fixed_role_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT
  organization_id, 'fa000000-0000-0000-0000-000000000411',
  'tenant', 'active'
FROM fixed_role_state;

INSERT INTO public.person_branch_relationships (organization_id,person_id,branch_id)
SELECT organization_id,'fa000000-0000-0000-0000-000000000411',branch_id
FROM fixed_role_state;

SET LOCAL session_replication_role = replica;
INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000412', organization_id, property_id,
  'fa000000-0000-0000-0000-000000000410',
  'fa000000-0000-0000-0000-000000000411', 'draft',
  super_admin_id, super_admin_id
FROM fixed_role_state;
SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  id, organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000413', organization_id,
  'fa000000-0000-0000-0000-000000000412', 2, '2026-08-01',
  '2027-07-31', 900, 'USD', 5, 'monthly', 'active', 'authoritative',
  now(), super_admin_id, super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.rent_policy_versions (
  id, organization_id, version_number, effective_from,
  supported_frequencies, rent_calculation_timezone, due_day_source,
  policy_default_due_day, short_month_due_day_rule,
  lease_start_proration_rule, lease_end_proration_rule,
  notice_period_charging_rule, mid_period_rent_change_rule,
  concessions_support_state, rent_free_support_state, waivers_support_state,
  lifecycle, created_by, updated_by, approved_at, approved_by
)
SELECT
  'fa000000-0000-0000-0000-000000000414', organization_id, 1,
  '2026-01-01', ARRAY['monthly']::text[], 'Asia/Bangkok',
  'policy_default', 5, 'last_calendar_day', 'actual_days', 'actual_days',
  'through_lease_end', 'prorate_actual_days', 'unsupported', 'unsupported',
  'unsupported', 'approved', super_admin_id, super_admin_id, now(),
  super_admin_id
FROM fixed_role_state;

INSERT INTO public.lease_billing_terms (
  id, organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  charge_management_fee_when_active, full_management_fee_during_proration,
  billing_recipient_kind, billing_recipient_person_id, confirmed_at,
  confirmed_by, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000415', organization_id,
  'fa000000-0000-0000-0000-000000000412', property_id, '2026-08-01',
  '2027-07-31', 'through_ips', 'percentage', 10, true, true,
  'individual', 'fa000000-0000-0000-0000-000000000411', now(),
  super_admin_id, super_admin_id, super_admin_id
FROM fixed_role_state;

SET LOCAL session_replication_role = replica;
INSERT INTO public.lease_parties (
  id, organization_id, lease_id, person_id, party_role, is_primary,
  started_on, started_on_kind, started_on_confidence, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000416', organization_id,
  'fa000000-0000-0000-0000-000000000412',
  'fa000000-0000-0000-0000-000000000411', 'primary_tenant', true,
  '2026-08-01', 'known', 'confirmed', super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.lease_occupancies (
  id, organization_id, lease_id, property_id, unit_id, status,
  scheduled_move_in_date, scheduled_move_in_kind,
  scheduled_move_in_confidence, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000417', organization_id,
  'fa000000-0000-0000-0000-000000000412', property_id,
  'fa000000-0000-0000-0000-000000000410', 'reserved', '2026-08-01',
  'known', 'confirmed',
  super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, deposit_type, amount, currency, status,
  received_on, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000418', organization_id,
  'fa000000-0000-0000-0000-000000000412', 'security', 900, 'USD',
  'held', '2026-08-01', super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.lease_deposit_events (
  id, organization_id, property_id, lease_deposit_id, event_type,
  event_date, amount, currency, reference, created_by
)
SELECT
  'fa000000-0000-0000-0000-000000000419', organization_id, property_id,
  'fa000000-0000-0000-0000-000000000418', 'received', '2026-08-01',
  900, 'USD', 'ROLE-DEPOSIT', super_admin_id
FROM fixed_role_state;
SET LOCAL session_replication_role = origin;

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, reference
)
SELECT
  expense_id, organization_id, property_id, 'vendor_bill', 'Policy vendor',
  '2026-08-01', 100, 'USD', 'Repairs', 'approved', 'ROLE-POLICY'
FROM fixed_role_state;

INSERT INTO public.ledger_entries (
  id, organization_id, property_id, transaction_date, direction, category,
  amount, currency, description, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000401', organization_id, property_id,
  '2026-08-01', 'expense', 'Role policy', 25, 'USD',
  'Finance role read test', super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.petty_cash_accounts (
  id, organization_id, account_number, name, float_amount, created_by,
  updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000402', organization_id, 'ROLE-CASH',
  'Role policy cash', 100, super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.petty_cash_periods (
  id, organization_id, account_id, period_start, opening_balance_amount,
  advance_amount, status, created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000403', organization_id,
  'fa000000-0000-0000-0000-000000000402', '2026-08-01', 100, 100,
  'open', super_admin_id, super_admin_id
FROM fixed_role_state;

INSERT INTO public.petty_cash_entries (
  id, organization_id, account_id, period_id, property_id, invoice_date,
  entry_kind, status, category, description, out_amount, in_amount, currency,
  created_by, updated_by
)
SELECT
  'fa000000-0000-0000-0000-000000000404', organization_id,
  'fa000000-0000-0000-0000-000000000402',
  'fa000000-0000-0000-0000-000000000403', property_id, '2026-08-01',
  'expense', 'cleared', 'Role policy', 'Finance role read test', 25, 0,
  'USD', super_admin_id, super_admin_id
FROM fixed_role_state;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
      (SELECT count(*) FROM public.ledger_entries WHERE id = 'fa000000-0000-0000-0000-000000000401'),
      (SELECT count(*) FROM public.petty_cash_accounts WHERE id = 'fa000000-0000-0000-0000-000000000402'),
      (SELECT count(*) FROM public.petty_cash_periods WHERE id = 'fa000000-0000-0000-0000-000000000403'),
      (SELECT count(*) FROM public.petty_cash_entries WHERE id = 'fa000000-0000-0000-0000-000000000404'),
      (SELECT count(*) FROM public.lease_terms WHERE id = 'fa000000-0000-0000-0000-000000000413'),
      (SELECT count(*) FROM public.lease_billing_terms WHERE id = 'fa000000-0000-0000-0000-000000000415'),
      (SELECT count(*) FROM public.rent_policy_versions WHERE id = 'fa000000-0000-0000-0000-000000000414'),
      (SELECT count(*) FROM public.lease_parties WHERE id = 'fa000000-0000-0000-0000-000000000416'),
      (SELECT count(*) FROM public.lease_occupancies WHERE id = 'fa000000-0000-0000-0000-000000000417'),
      (SELECT count(*) FROM public.lease_deposits WHERE id = 'fa000000-0000-0000-0000-000000000418'),
      (SELECT count(*) FROM public.lease_deposit_events WHERE id = 'fa000000-0000-0000-0000-000000000419')
  $$,
  $$VALUES (1::bigint, 1::bigint, 0::bigint, 0::bigint, 1::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Finance Member sees branch-scoped finance rows while organization-wide lease helpers remain hidden'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.resolve_authoritative_lease_term(
      (SELECT organization_id FROM fixed_role_state),
      'fa000000-0000-0000-0000-000000000412',
      '2026-08-01'
    )
  $$,
  '42501',
  'Not authorized',
  'legacy organization-wide lease resolver remains Super-Admin-only'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.lease_parties WHERE id = 'fa000000-0000-0000-0000-000000000416'),
      (SELECT count(*) FROM public.lease_occupancies WHERE id = 'fa000000-0000-0000-0000-000000000417'),
      (SELECT count(*) FROM public.lease_deposits WHERE id = 'fa000000-0000-0000-0000-000000000418'),
      (SELECT count(*) FROM public.lease_deposit_events WHERE id = 'fa000000-0000-0000-0000-000000000419')
  $$,
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Finance Manager cannot enumerate organization-wide lease helper tables directly'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
      (SELECT count(*) FROM public.ledger_entries WHERE id = 'fa000000-0000-0000-0000-000000000401'),
      (SELECT count(*) FROM public.petty_cash_entries WHERE id = 'fa000000-0000-0000-0000-000000000404'),
      (SELECT count(*) FROM public.lease_terms WHERE id = 'fa000000-0000-0000-0000-000000000413'),
      (SELECT count(*) FROM public.lease_billing_terms WHERE id = 'fa000000-0000-0000-0000-000000000415'),
      (SELECT count(*) FROM public.rent_policy_versions WHERE id = 'fa000000-0000-0000-0000-000000000414'),
      (SELECT count(*) FROM public.lease_parties WHERE id = 'fa000000-0000-0000-0000-000000000416'),
      (SELECT count(*) FROM public.lease_occupancies WHERE id = 'fa000000-0000-0000-0000-000000000417'),
      (SELECT count(*) FROM public.lease_deposits WHERE id = 'fa000000-0000-0000-0000-000000000418'),
      (SELECT count(*) FROM public.lease_deposit_events WHERE id = 'fa000000-0000-0000-0000-000000000419')
  $$,
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Operations Manager cannot read expense, Ledger, Petty Cash, or lease finance rows'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.resolve_authoritative_lease_term(
      (SELECT organization_id FROM fixed_role_state),
      'fa000000-0000-0000-0000-000000000412',
      '2026-08-01'
    )
  $$,
  '42501',
  'Not authorized',
  'Operations Manager cannot bypass lease-term RLS through its resolver'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.resolve_lease_billing_term(
      (SELECT organization_id FROM fixed_role_state),
      'fa000000-0000-0000-0000-000000000412',
      '2026-08-01'
    )
  $$,
  '42501',
  'Not authorized',
  'Operations Manager cannot bypass billing-term RLS through its resolver'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_member_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.lease_terms WHERE id = 'fa000000-0000-0000-0000-000000000413'),
      (SELECT count(*) FROM public.lease_billing_terms WHERE id = 'fa000000-0000-0000-0000-000000000415'),
      (SELECT count(*) FROM public.rent_policy_versions WHERE id = 'fa000000-0000-0000-0000-000000000414'),
      (SELECT count(*) FROM public.lease_parties WHERE id = 'fa000000-0000-0000-0000-000000000416'),
      (SELECT count(*) FROM public.lease_occupancies WHERE id = 'fa000000-0000-0000-0000-000000000417'),
      (SELECT count(*) FROM public.lease_deposits WHERE id = 'fa000000-0000-0000-0000-000000000418'),
      (SELECT count(*) FROM public.lease_deposit_events WHERE id = 'fa000000-0000-0000-0000-000000000419')
  $$,
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'Operations Member cannot enumerate organization-wide lease finance context'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
      (SELECT count(*) FROM public.ledger_entries WHERE id = 'fa000000-0000-0000-0000-000000000401'),
      (SELECT count(*) FROM public.petty_cash_entries WHERE id = 'fa000000-0000-0000-0000-000000000404'),
      (SELECT count(*) FROM public.lease_terms WHERE id = 'fa000000-0000-0000-0000-000000000413'),
      (SELECT count(*) FROM public.lease_billing_terms WHERE id = 'fa000000-0000-0000-0000-000000000415'),
      (SELECT count(*) FROM public.rent_policy_versions WHERE id = 'fa000000-0000-0000-0000-000000000414'),
      (SELECT count(*) FROM public.lease_parties WHERE id = 'fa000000-0000-0000-0000-000000000416'),
      (SELECT count(*) FROM public.lease_occupancies WHERE id = 'fa000000-0000-0000-0000-000000000417'),
      (SELECT count(*) FROM public.lease_deposits WHERE id = 'fa000000-0000-0000-0000-000000000418'),
      (SELECT count(*) FROM public.lease_deposit_events WHERE id = 'fa000000-0000-0000-0000-000000000419')
  $$,
  $$VALUES (1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'Super Admin can read expense, Ledger, Petty Cash, and complete lease finance context'
);
RESET ROLE;

SELECT ok(
  to_regprocedure('app_private.can_read_owner_balance_authority(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_submit_owner_opening_balance(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_request_owner_opening_balance_correction(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_review_owner_opening_balance(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_close_owner_month(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_reopen_owner_month(uuid)') IS NOT NULL
  AND to_regprocedure('app_private.can_publish_owner_statement(uuid)') IS NOT NULL,
  'named owner-balance and close predicates remain present'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('can_read_owner_balance_authority'),
        ('can_submit_owner_opening_balance'),
        ('can_request_owner_opening_balance_correction'),
        ('can_review_owner_opening_balance'),
        ('can_inspect_owner_close_readiness'),
        ('can_close_owner_month'),
        ('can_reopen_owner_month'),
        ('can_publish_owner_statement')
    ) AS capability(name)
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS role_name(name)
    WHERE coalesce(
      has_function_privilege(
        role_name.name,
        to_regprocedure('app_private.' || capability.name || '(uuid)'),
        'EXECUTE'
      ),
      false
    )
  ),
  'owner authority predicates remain private to checked database code'
);

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_read_owner_balance_authority(organization_id),
      app_private.can_submit_owner_opening_balance(organization_id),
      app_private.can_request_owner_opening_balance_correction(organization_id),
      app_private.can_review_owner_opening_balance(organization_id),
      app_private.can_inspect_owner_close_readiness(organization_id),
      app_private.can_close_owner_month(organization_id),
      app_private.can_reopen_owner_month(organization_id),
      app_private.can_publish_owner_statement(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (true, true, true, true, true, true, true, true) $$,
  'Super Admin receives every owner-balance and close authority'
);

SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_read_owner_balance_authority(organization_id),
      app_private.can_submit_owner_opening_balance(organization_id),
      app_private.can_request_owner_opening_balance_correction(organization_id),
      app_private.can_review_owner_opening_balance(organization_id),
      app_private.can_inspect_owner_close_readiness(organization_id),
      app_private.can_close_owner_month(organization_id),
      app_private.can_reopen_owner_month(organization_id),
      app_private.can_publish_owner_statement(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'custom Finance Manager cannot use legacy organization-wide owner helpers directly'
);

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_read_owner_balance_authority(organization_id),
      app_private.can_submit_owner_opening_balance(organization_id),
      app_private.can_request_owner_opening_balance_correction(organization_id),
      app_private.can_review_owner_opening_balance(organization_id),
      app_private.can_inspect_owner_close_readiness(organization_id),
      app_private.can_close_owner_month(organization_id),
      app_private.can_reopen_owner_month(organization_id),
      app_private.can_publish_owner_statement(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'custom Finance Member cannot use legacy organization-wide owner helpers directly'
);

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_read_owner_balance_authority(organization_id),
      app_private.can_submit_owner_opening_balance(organization_id),
      app_private.can_request_owner_opening_balance_correction(organization_id),
      app_private.can_review_owner_opening_balance(organization_id),
      app_private.can_inspect_owner_close_readiness(organization_id),
      app_private.can_close_owner_month(organization_id),
      app_private.can_reopen_owner_month(organization_id),
      app_private.can_publish_owner_statement(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'Operations Manager receives no owner-balance or close authority'
);

SELECT set_config('request.jwt.claim.sub', (SELECT operations_member_id::text FROM fixed_role_state), true);
SELECT results_eq(
  $$
    SELECT
      app_private.can_read_owner_balance_authority(organization_id),
      app_private.can_submit_owner_opening_balance(organization_id),
      app_private.can_request_owner_opening_balance_correction(organization_id),
      app_private.can_review_owner_opening_balance(organization_id),
      app_private.can_inspect_owner_close_readiness(organization_id),
      app_private.can_close_owner_month(organization_id),
      app_private.can_reopen_owner_month(organization_id),
      app_private.can_publish_owner_statement(organization_id)
    FROM fixed_role_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'Operations Member receives no owner-balance or close authority'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT * FROM finish();

ROLLBACK;
