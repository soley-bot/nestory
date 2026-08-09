BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(23);

SELECT has_function('app_private', 'can_operate_finance', ARRAY['uuid'], 'ordinary Finance operation predicate exists');
SELECT has_function('app_private', 'can_manage_petty_cash', ARRAY['uuid'], 'Petty Cash operation predicate exists');
SELECT has_function('app_private', 'can_manage_reconciliation_sources', ARRAY['uuid'], 'reconciliation-source configuration predicate exists');
SELECT has_function('app_private', 'can_retry_current_rent', ARRAY['uuid'], 'current-rent retry predicate exists');
SELECT has_function('app_private', 'can_lock_financial_month', ARRAY['uuid'], 'financial-month lock predicate exists');
SELECT has_function('app_private', 'can_unlock_financial_month', ARRAY['uuid'], 'financial-month unlock predicate exists');
SELECT has_function('app_private', 'can_read_finance_reports', ARRAY['uuid'], 'Finance report-read predicate exists');
SELECT has_function('app_private', 'can_correct_finance', ARRAY['uuid'], 'Finance correction predicate exists');

SELECT ok(
  (
    SELECT
      count(*) = 8
      AND bool_and(procedure.provolatile = 's')
      AND bool_and(procedure.prosecdef)
      AND bool_and(procedure.proconfig @> ARRAY['search_path=""'])
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname = ANY (ARRAY[
        'can_correct_finance',
        'can_lock_financial_month',
        'can_manage_petty_cash',
        'can_manage_reconciliation_sources',
        'can_operate_finance',
        'can_read_finance_reports',
        'can_retry_current_rent',
        'can_unlock_financial_month'
      ])
  ),
  'granular Finance predicates are stable security-definer helpers with an empty search path'
);

SELECT ok(
  NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_operate_finance(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_petty_cash(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_manage_reconciliation_sources(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_retry_current_rent(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_lock_financial_month(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_unlock_financial_month(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_read_finance_reports(uuid)'), 'EXECUTE'), false)
  AND NOT coalesce(has_function_privilege('anon', to_regprocedure('app_private.can_correct_finance(uuid)'), 'EXECUTE'), false),
  'anon cannot execute any granular Finance predicate'
);

SELECT ok(
  coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_operate_finance(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_petty_cash(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_manage_reconciliation_sources(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_retry_current_rent(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_lock_financial_month(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_unlock_financial_month(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_read_finance_reports(uuid)'), 'EXECUTE'), false)
  AND coalesce(has_function_privilege('authenticated', to_regprocedure('app_private.can_correct_finance(uuid)'), 'EXECUTE'), false),
  'authenticated can execute every granular Finance predicate as a checked helper'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.record_tenant_invoice_payment(uuid,uuid,numeric,date,uuid,text,jsonb,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.confirm_owner_collected_rent(uuid,uuid,numeric,date,text,jsonb,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.record_owner_invoice_payment(uuid,uuid,numeric,date,text,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.record_property_withdrawal(uuid,uuid,numeric,date,text,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.recover_rent_generation_exception(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.record_tenant_invoice_payment_internal(uuid,uuid,numeric,date,uuid,text,jsonb,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.confirm_owner_collected_rent_internal(uuid,uuid,numeric,date,text,jsonb,text)', 'EXECUTE')
  AND (
    SELECT count(*) = 7
      AND bool_and(procedure.prosecdef)
      AND bool_and(procedure.proconfig @> ARRAY['search_path=""'])
      AND bool_and(procedure.prosrc LIKE '%app_private.can_operate_finance(p_organization_id)%')
      AND bool_and(procedure.prosrc NOT LIKE '%app_private.is_org_admin(p_organization_id)%')
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE (namespace.nspname, procedure.proname) IN (
      ('app_private', 'settle_income_item_internal'),
      ('public', 'confirm_owner_collected_rent'),
      ('public', 'confirm_owner_collected_rent_internal'),
      ('public', 'record_owner_invoice_payment'),
      ('public', 'record_property_withdrawal'),
      ('public', 'record_tenant_invoice_payment'),
      ('public', 'record_tenant_invoice_payment_internal')
    )
  ),
  'authenticated reaches only the checked public Finance commands, never duplicated internals'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.tenant_invoice_payments',
      'public.tenant_invoice_payment_allocations',
      'public.owner_collection_confirmations',
      'public.owner_collection_confirmation_allocations',
      'public.finance_receipts',
      'public.finance_receipt_allocations',
      'public.owner_payments',
      'public.owner_payment_allocations',
      'public.property_withdrawals',
      'public.ledger_entries'
    ]) AS source_table(table_name)
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS checked_privilege(privilege_name)
    WHERE has_table_privilege('authenticated', source_table.table_name, checked_privilege.privilege_name)
  ),
  'authenticated cannot bypass checked settlement and owner-cash RPCs with direct source-table DML'
);

SELECT ok(
  (
    SELECT procedure.prosrc LIKE '%app_private.can_manage_petty_cash(p_organization_id)%'
      AND procedure.prosrc NOT LIKE '%app_private.is_org_admin(p_organization_id)%'
      AND procedure.prosrc LIKE '%app_private.claim_financial_idempotency(%'
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'create_petty_cash_entry'
  )
  AND (
    SELECT procedure.prosrc LIKE '%app_private.can_manage_petty_cash(p_organization_id)%'
      AND procedure.prosrc NOT LIKE '%app_private.is_org_admin(p_organization_id)%'
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'post_petty_cash_entry'
  )
  AND (
    SELECT procedure.prosrc LIKE '%app_private.can_lock_financial_month(p_organization_id)%'
      AND procedure.prosrc LIKE '%app_private.can_unlock_financial_month(p_organization_id)%'
      AND procedure.prosrc LIKE '%app_private.is_super_admin(p_organization_id)%'
      AND procedure.prosrc LIKE '%Finance Manager can lock only the current operational month%'
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'set_financial_month_lock'
  ),
  'daily Finance commands consume operation-specific predicates and the narrow Super Admin lock exception'
);

CREATE TEMP TABLE granular_authority_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unaffiliated_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_manager_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_member_person_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO granular_authority_state DEFAULT VALUES;
GRANT SELECT ON granular_authority_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('granular-authority-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM granular_authority_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM granular_authority_state
  UNION ALL SELECT finance_member_id, 'finance-member' FROM granular_authority_state
  UNION ALL SELECT operations_manager_id, 'operations-manager' FROM granular_authority_state
  UNION ALL SELECT operations_member_id, 'operations-member' FROM granular_authority_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM granular_authority_state
  UNION ALL SELECT unaffiliated_user_id, 'unaffiliated-user' FROM granular_authority_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Granular authority organization', 'granular-authority-' || left(organization_id::text, 8)
FROM granular_authority_state
UNION ALL
SELECT cross_organization_id, 'Cross granular authority organization', 'cross-granular-authority-' || left(cross_organization_id::text, 8)
FROM granular_authority_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, 'Operations branch', 'OPS'
FROM granular_authority_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT operations_manager_person_id, organization_id, 'Granular Operations Manager'
FROM granular_authority_state
UNION ALL
SELECT operations_member_person_id, organization_id, 'Granular Operations Member'
FROM granular_authority_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, operations_manager_person_id, 'staff', 'active'
FROM granular_authority_state
UNION ALL
SELECT organization_id, operations_member_person_id, 'staff', 'active'
FROM granular_authority_state;

INSERT INTO public.organization_members (
  organization_id, user_id, role, person_id, branch_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM granular_authority_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid
FROM granular_authority_state
UNION ALL
SELECT organization_id, finance_member_id, 'finance_member', NULL::uuid, NULL::uuid
FROM granular_authority_state
UNION ALL
SELECT organization_id, operations_manager_id, 'operations_manager', operations_manager_person_id, branch_id
FROM granular_authority_state
UNION ALL
SELECT organization_id, operations_member_id, 'operations_member', operations_member_person_id, branch_id
FROM granular_authority_state
UNION ALL
SELECT cross_organization_id, cross_super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM granular_authority_state;

CREATE FUNCTION pg_temp.checked_granular_authority_results_eq(
  have_sql text,
  want_sql text,
  description text
) RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regprocedure('app_private.can_operate_finance(uuid)') IS NULL THEN
    RETURN fail(description);
  END IF;

  RETURN results_eq(have_sql, want_sql, description);
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT super_admin_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (true, true, true, true, true, true, true, true) $$,
  'Super Admin receives every granular Finance capability'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_manager_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (true, true, false, true, true, false, true, false) $$,
  'Finance Manager receives ordinary operation authority without configuration, unlock, or correction authority'
);

SELECT throws_ok(
  format(
    'SELECT public.record_tenant_invoice_payment(%L,%L,1,current_date,%L,%L,NULL,%L)',
    '00000000-0000-0000-0000-000000000001',
    gen_random_uuid(),
    gen_random_uuid(),
    'Cross organization attempt',
    'cross-org-payment-1'
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot call an operation RPC across organizations'
);

SELECT throws_ok(
  format(
    'SELECT public.reverse_expense(%L,%L,current_date,%L,%L)',
    (SELECT organization_id FROM granular_authority_state),
    gen_random_uuid(),
    'Unauthorized correction',
    'manager-expense-reversal-1'
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot call the expense reversal RPC'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT finance_member_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'Finance Member receives no granular Finance operation authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_manager_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'Operations Manager receives no granular Finance operation authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT operations_member_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'Operations Member receives no granular Finance operation authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT unaffiliated_user_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'authenticated execution is not an authorization bypass for a user without membership'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT cross_super_admin_id::text FROM granular_authority_state), true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.checked_granular_authority_results_eq(
  $$
    SELECT
      app_private.can_operate_finance(organization_id),
      app_private.can_manage_petty_cash(organization_id),
      app_private.can_manage_reconciliation_sources(organization_id),
      app_private.can_retry_current_rent(organization_id),
      app_private.can_lock_financial_month(organization_id),
      app_private.can_unlock_financial_month(organization_id),
      app_private.can_read_finance_reports(organization_id),
      app_private.can_correct_finance(organization_id)
    FROM granular_authority_state
  $$,
  $$ VALUES (false, false, false, false, false, false, false, false) $$,
  'granular Finance authority never crosses organization boundaries'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT * FROM finish();

ROLLBACK;
