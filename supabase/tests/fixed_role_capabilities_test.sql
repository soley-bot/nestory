BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(39);

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
  'the role migration leaves no legacy membership roles'
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
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_execute_operations(uuid)'), 'EXECUTE'), false),
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
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_execute_operations(uuid)'), 'EXECUTE'), false),
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
  $$ VALUES (false, false, true, false, true, false, false, false) $$,
  'Finance Manager can read and review finance only'
);

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM fixed_role_state), true);
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
  $$ VALUES (false, false, true, true, false, false, false, false) $$,
  'Finance Member can read finance and submit expenses only'
);

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
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
  $$ VALUES (false, false, false, false, false, false, true, true) $$,
  'Operations Manager can manage and execute operations only'
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
  'the compatibility admin predicate recognizes only Super Admin authority'
);
SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SELECT ok(
  app_private.can_assign_tasks((SELECT organization_id FROM fixed_role_state)),
  'the compatibility task-assignment predicate recognizes Operations Manager'
);

SELECT results_eq(
  $$
    SELECT DISTINCT tablename::text COLLATE "C"
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND coalesce(qual, '') LIKE '%can_read_finance%'
      AND tablename = ANY (ARRAY[
        'accounting_accounts', 'accounting_books', 'accounting_journal_entries',
        'accounting_journal_lines', 'accounting_periods', 'finance_expense_items',
        'finance_income_items', 'finance_payment_allocations', 'finance_payments',
        'finance_receipt_allocation_journals', 'finance_receipt_allocations',
        'finance_receipts', 'ips_expense_responsibilities', 'ledger_entries',
        'ledger_period_locks', 'management_fee_occurrences',
        'owner_charge_cash_allocations', 'owner_collection_confirmation_allocations',
        'owner_collection_confirmations', 'owner_invoice_lines', 'owner_invoices',
        'owner_payment_allocations', 'owner_payments', 'petty_cash_accounts',
        'petty_cash_entries', 'petty_cash_periods', 'property_close_revisions',
        'property_reporting_periods', 'property_withdrawals', 'tenant_invoice_lines',
        'tenant_invoice_payment_allocations', 'tenant_invoice_payments', 'tenant_invoices'
      ])
    ORDER BY tablename
  $$,
  $$
    SELECT unnest(ARRAY[
      'accounting_accounts', 'accounting_books', 'accounting_journal_entries',
      'accounting_journal_lines', 'accounting_periods', 'finance_expense_items',
      'finance_income_items', 'finance_payment_allocations', 'finance_payments',
      'finance_receipt_allocation_journals', 'finance_receipt_allocations',
      'finance_receipts', 'ips_expense_responsibilities', 'ledger_entries',
      'ledger_period_locks', 'management_fee_occurrences',
      'owner_charge_cash_allocations', 'owner_collection_confirmation_allocations',
      'owner_collection_confirmations', 'owner_invoice_lines', 'owner_invoices',
      'owner_payment_allocations', 'owner_payments', 'petty_cash_accounts',
      'petty_cash_entries', 'petty_cash_periods', 'property_close_revisions',
      'property_reporting_periods', 'property_withdrawals', 'tenant_invoice_lines',
      'tenant_invoice_payment_allocations', 'tenant_invoice_payments', 'tenant_invoices'
    ]::text[]) COLLATE "C"
  $$,
  'every finance table has a capability-scoped read policy'
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

INSERT INTO public.properties (id, organization_id, name, code, property_type, status)
SELECT property_id, organization_id, 'Finance policy property', 'FIN-POL', 'apartment', 'active'
FROM fixed_role_state;
INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, reference
)
SELECT
  expense_id, organization_id, property_id, 'vendor_bill', 'Policy vendor',
  '2026-08-01', 100, 'USD', 'Repairs', 'approved', 'ROLE-POLICY'
FROM fixed_role_state;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
  1,
  'Finance Member can read organization finance rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
  0,
  'Operations Manager cannot read organization finance rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM fixed_role_state), true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.finance_expense_items WHERE reference = 'ROLE-POLICY'),
  1,
  'Super Admin can read organization finance rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT * FROM finish();

ROLLBACK;
