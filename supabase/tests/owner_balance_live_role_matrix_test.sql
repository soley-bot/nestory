BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Final catalog proof for the nine Track 3 authority tables.
WITH authority_tables(table_name) AS (
  VALUES
    ('owner_event_allocation_sets'),
    ('owner_event_owner_allocations'),
    ('owner_component_movements'),
    ('owner_cash_source_consumptions'),
    ('owner_cash_events'),
    ('owner_component_transfer_instructions'),
    ('owner_component_transfer_lines'),
    ('owner_balance_periods'),
    ('owner_balance_period_components')
)
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN authority_tables AS expected
      ON expected.table_name = relation.relname
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  9::bigint,
  'all nine owner-balance authority tables have RLS and FORCE RLS enabled'
)
FROM authority_tables
LIMIT 1;

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_event_allocation_sets'),
    ('owner_event_owner_allocations'),
    ('owner_component_movements'),
    ('owner_cash_source_consumptions'),
    ('owner_cash_events'),
    ('owner_component_transfer_instructions'),
    ('owner_component_transfer_lines'),
    ('owner_balance_periods'),
    ('owner_balance_period_components')
)
SELECT ok(
  (
    SELECT bool_and(
      has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      AND NOT has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      AND NOT has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
    )
    FROM authority_tables
  ),
  'the nine authority tables grant SELECT only to authenticated'
);

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_event_allocation_sets'),
    ('owner_event_owner_allocations'),
    ('owner_component_movements'),
    ('owner_cash_source_consumptions'),
    ('owner_cash_events'),
    ('owner_component_transfer_instructions'),
    ('owner_component_transfer_lines'),
    ('owner_balance_periods'),
    ('owner_balance_period_components')
), checked_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), mutation_privileges(privilege_name) AS (
  VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')
)
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM authority_tables
    CROSS JOIN checked_roles
    CROSS JOIN mutation_privileges
    WHERE has_table_privilege(
      checked_roles.role_name,
      'public.' || authority_tables.table_name,
      mutation_privileges.privilege_name
    )
  ),
  'anon, authenticated, and service_role have no direct DML on any authority table'
);

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_event_allocation_sets'),
    ('owner_event_owner_allocations'),
    ('owner_component_movements'),
    ('owner_cash_source_consumptions'),
    ('owner_cash_events'),
    ('owner_component_transfer_instructions'),
    ('owner_component_transfer_lines'),
    ('owner_balance_periods'),
    ('owner_balance_period_components')
)
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_policies AS policy
    JOIN authority_tables AS expected ON expected.table_name = policy.tablename
    WHERE policy.schemaname = 'public'
      AND policy.cmd = 'SELECT'
      AND policy.roles = ARRAY['authenticated']::name[]
      AND policy.qual LIKE '%can_read_finance%'
  ),
  9::bigint,
  'each authority table has one authenticated Finance-read tenant policy'
)
FROM authority_tables
LIMIT 1;

WITH public_rpcs(function_name) AS (
  VALUES
    ('allocate_owner_event'),
    ('generate_owner_balance_period'),
    ('get_owner_available_withdrawal'),
    ('get_owner_balance_ledger'),
    ('get_owner_balance_source_ledger'),
    ('get_owner_event_allocation_queue'),
    ('record_owner_cash_event'),
    ('record_owner_distribution'),
    ('reverse_owner_invoice_payment'),
    ('reverse_property_withdrawal'),
    ('reverse_tenant_invoice_payment'),
    ('transfer_owner_balance_component')
), resolved AS (
  SELECT procedure.oid
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN public_rpcs AS expected ON expected.function_name = procedure.proname
  WHERE namespace.nspname = 'public'
)
SELECT ok(
  (SELECT count(*) = 12 FROM resolved)
  AND (
    SELECT bool_and(
      has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
    )
    FROM resolved
  ),
  'all twelve checked public RPCs are authenticated-only at the catalog boundary'
);

WITH private_helpers(function_name) AS (
  VALUES
    ('allocate_owner_roster_amount'),
    ('apply_available_owner_cash'),
    ('apply_owner_cash_after_tenant_payment'),
    ('apply_owner_transfer_remediation'),
    ('assert_owner_cash_sources_allocated'),
    ('consume_owner_held_cash'),
    ('create_management_fee_owner_charge'),
    ('derive_owner_payment_allocation_sign'),
    ('generate_owner_balance_period'),
    ('get_owner_available_withdrawal_baseline'),
    ('get_owner_event_allocation_queue_baseline'),
    ('get_unresolved_owner_transfer_detail'),
    ('guard_owner_balance_append_only'),
    ('guard_owner_balance_period_lifecycle'),
    ('guard_owner_balance_period_write'),
    ('guard_owner_opening_cash_dependency'),
    ('guard_owner_payment_allocation_outstanding'),
    ('legacy_owner_cash_source_state'),
    ('lock_legacy_owner_cash_effect'),
    ('lock_owner_balance_lifecycle'),
    ('lock_owner_event_lifecycle'),
    ('mark_owner_balance_periods_stale_after_opening_entry'),
    ('owner_event_source_rule'),
    ('record_owner_cash_event_baseline'),
    ('record_owner_distribution_baseline'),
    ('resolve_legacy_owner_cash_source'),
    ('resolve_owner_event_source'),
    ('reverse_owner_collection_after_allocation_guard'),
    ('reverse_owner_invoice_payment_baseline'),
    ('reverse_property_withdrawal_baseline'),
    ('reverse_tenant_invoice_payment_after_owner_cash_guard'),
    ('transfer_owner_balance_component_baseline')
), resolved AS (
  SELECT procedure.oid, procedure.proname
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN private_helpers AS expected ON expected.function_name = procedure.proname
  WHERE namespace.nspname = 'app_private'
)
SELECT ok(
  (SELECT count(*) = (SELECT count(*) FROM private_helpers) FROM resolved)
  AND (
    SELECT bool_and(
      NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
    )
    FROM resolved
  ),
  'every Track 3 and dependent-cash private helper denies Data API roles'
);

-- Two organizations and real actors make tenant visibility non-vacuous.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '@owner-role-matrix.test',
  extensions.crypt('owner-role-matrix', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM (VALUES
  ('c9100000-0000-4000-8000-000000000101'::uuid, 'super'),
  ('c9100000-0000-4000-8000-000000000102'::uuid, 'finance'),
  ('c9100000-0000-4000-8000-000000000103'::uuid, 'operations'),
  ('c9100000-0000-4000-8000-000000000104'::uuid, 'unaffiliated'),
  ('c9200000-0000-4000-8000-000000000105'::uuid, 'cross-super')
) AS actors(user_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('c9100000-0000-4000-8000-000000000001', 'Owner role matrix A', 'owner-role-matrix-a'),
  ('c9200000-0000-4000-8000-000000000001', 'Owner role matrix B', 'owner-role-matrix-b');

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'c9100000-0000-4000-8000-000000000007',
  'c9100000-0000-4000-8000-000000000001', 'Matrix operations', 'MATRIX-OPS'
);

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES
  ('c9100000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000001', 'Matrix property A', 'MATRIX-A', 'Apartment'),
  ('c9200000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000001', 'Matrix property B', 'MATRIX-B', 'Apartment');

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('c9100000-0000-4000-8000-000000000003', 'c9100000-0000-4000-8000-000000000001', 'Matrix owner A'),
  ('c9100000-0000-4000-8000-000000000004', 'c9100000-0000-4000-8000-000000000001', 'Matrix successor A'),
  ('c9100000-0000-4000-8000-000000000005', 'c9100000-0000-4000-8000-000000000001', 'Matrix operations staff'),
  ('c9200000-0000-4000-8000-000000000003', 'c9200000-0000-4000-8000-000000000001', 'Matrix owner B'),
  ('c9200000-0000-4000-8000-000000000004', 'c9200000-0000-4000-8000-000000000001', 'Matrix successor B');

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000004', 'owner', 'active'),
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000005', 'staff', 'active'),
  ('c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000004', 'owner', 'active');

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES
  ('c9100000-0000-4000-8000-000000000006', 'c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000003', 100.000, date_trunc('month', current_date)::date),
  ('c9200000-0000-4000-8000-000000000006', 'c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000003', 100.000, date_trunc('month', current_date)::date);

INSERT INTO public.organization_members (
  organization_id, user_id, role, person_id, branch_id
)
VALUES
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000101', 'super_admin', NULL, NULL),
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000102', 'finance_manager', NULL, NULL),
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000103', 'operations_manager', 'c9100000-0000-4000-8000-000000000005', 'c9100000-0000-4000-8000-000000000007'),
  ('c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000105', 'super_admin', NULL, NULL);

SELECT set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000102', true);
SET LOCAL ROLE authenticated;
SELECT public.record_owner_cash_event(
  'c9100000-0000-4000-8000-000000000001',
  'c9100000-0000-4000-8000-000000000002',
  'c9100000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', current_date, 10.00,
  'Role matrix source cash', 'role-matrix-a-contribution'
);
SELECT public.record_owner_distribution(
  'c9100000-0000-4000-8000-000000000001',
  'c9100000-0000-4000-8000-000000000002',
  'c9100000-0000-4000-8000-000000000003',
  'USD', 1.00, current_date, 'Role matrix consumption',
  'role-matrix-a-distribution'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'c9200000-0000-4000-8000-000000000105', true);
SET LOCAL ROLE authenticated;
SELECT public.record_owner_cash_event(
  'c9200000-0000-4000-8000-000000000001',
  'c9200000-0000-4000-8000-000000000002',
  'c9200000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', current_date, 10.00,
  'Role matrix source cash', 'role-matrix-b-contribution'
);
SELECT public.record_owner_distribution(
  'c9200000-0000-4000-8000-000000000001',
  'c9200000-0000-4000-8000-000000000002',
  'c9200000-0000-4000-8000-000000000003',
  'USD', 1.00, current_date, 'Role matrix consumption',
  'role-matrix-b-distribution'
);
RESET ROLE;

SELECT set_config('app.owner_balance_write_context', 'checked-owner-balance-v1', true);
INSERT INTO public.owner_component_transfer_instructions (
  id, organization_id, property_id, from_owner_person_id, to_owner_person_id,
  currency, effective_date, component, amount, reason, evidence_reference,
  evidence_sha256, idempotency_key, payload_hash, created_by
)
VALUES
  ('c9100000-0000-4000-8000-000000000020', 'c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000003', 'c9100000-0000-4000-8000-000000000004', 'USD', current_date, 'ips_held_owner_cash', 2.00, 'Role matrix transfer', 'MATRIX-A-TRANSFER', repeat('a', 64), 'role-matrix-a-transfer', repeat('b', 64), 'c9100000-0000-4000-8000-000000000101'),
  ('c9200000-0000-4000-8000-000000000020', 'c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000003', 'c9200000-0000-4000-8000-000000000004', 'USD', current_date, 'ips_held_owner_cash', 2.00, 'Role matrix transfer', 'MATRIX-B-TRANSFER', repeat('c', 64), 'role-matrix-b-transfer', repeat('d', 64), 'c9200000-0000-4000-8000-000000000105');

INSERT INTO public.owner_component_transfer_lines (
  organization_id, transfer_instruction_id, owner_person_id, line_direction,
  signed_amount, created_by
)
VALUES
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000020', 'c9100000-0000-4000-8000-000000000003', 'from_owner', -2.00, 'c9100000-0000-4000-8000-000000000101'),
  ('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000020', 'c9100000-0000-4000-8000-000000000004', 'to_owner', 2.00, 'c9100000-0000-4000-8000-000000000101'),
  ('c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000020', 'c9200000-0000-4000-8000-000000000003', 'from_owner', -2.00, 'c9200000-0000-4000-8000-000000000105'),
  ('c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000020', 'c9200000-0000-4000-8000-000000000004', 'to_owner', 2.00, 'c9200000-0000-4000-8000-000000000105');

SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);
INSERT INTO public.owner_balance_periods (
  id, organization_id, property_id, owner_person_id, currency, month_start,
  status, input_watermark, input_hash, generated_at, generated_by
)
VALUES
  ('c9100000-0000-4000-8000-000000000030', 'c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000003', 'USD', date_trunc('month', current_date)::date, 'ready', 'role-matrix-a', repeat('e', 64), now(), 'c9100000-0000-4000-8000-000000000102'),
  ('c9200000-0000-4000-8000-000000000030', 'c9200000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000003', 'USD', date_trunc('month', current_date)::date, 'ready', 'role-matrix-b', repeat('f', 64), now(), 'c9200000-0000-4000-8000-000000000105');

INSERT INTO public.owner_balance_period_components (
  owner_balance_period_id, organization_id, component, opening_amount,
  movement_amount, closing_amount, created_by
)
SELECT
  period_id, organization_id, component, 0.00, 0.00, 0.00, created_by
FROM (VALUES
  ('c9100000-0000-4000-8000-000000000030'::uuid, 'c9100000-0000-4000-8000-000000000001'::uuid, 'c9100000-0000-4000-8000-000000000102'::uuid),
  ('c9200000-0000-4000-8000-000000000030'::uuid, 'c9200000-0000-4000-8000-000000000001'::uuid, 'c9200000-0000-4000-8000-000000000105'::uuid)
) AS periods(period_id, organization_id, created_by)
CROSS JOIN unnest(enum_range(NULL::public.owner_balance_component)) AS component;

CREATE FUNCTION pg_temp.owner_balance_visible_summary(p_expected_organization_id uuid)
RETURNS TABLE (visible_table_count integer, unexpected_organization_count integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  WITH visible AS (
    SELECT 'owner_event_allocation_sets' AS table_name, organization_id FROM public.owner_event_allocation_sets
    UNION ALL SELECT 'owner_event_owner_allocations', organization_id FROM public.owner_event_owner_allocations
    UNION ALL SELECT 'owner_component_movements', organization_id FROM public.owner_component_movements
    UNION ALL SELECT 'owner_cash_source_consumptions', organization_id FROM public.owner_cash_source_consumptions
    UNION ALL SELECT 'owner_cash_events', organization_id FROM public.owner_cash_events
    UNION ALL SELECT 'owner_component_transfer_instructions', organization_id FROM public.owner_component_transfer_instructions
    UNION ALL SELECT 'owner_component_transfer_lines', organization_id FROM public.owner_component_transfer_lines
    UNION ALL SELECT 'owner_balance_periods', organization_id FROM public.owner_balance_periods
    UNION ALL SELECT 'owner_balance_period_components', organization_id FROM public.owner_balance_period_components
  ), per_table AS (
    SELECT
      table_name,
      pg_catalog.count(*) > 0 AS has_rows,
      pg_catalog.bool_or(organization_id <> p_expected_organization_id) AS has_unexpected
    FROM visible
    GROUP BY table_name
  )
  SELECT
    pg_catalog.count(*) FILTER (WHERE has_rows)::integer,
    pg_catalog.count(*) FILTER (WHERE has_unexpected)::integer
  FROM per_table;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.owner_balance_visible_summary(uuid) TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000102', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT * FROM pg_temp.owner_balance_visible_summary('c9100000-0000-4000-8000-000000000001') $$,
  $$ VALUES (9, 0) $$,
  'Finance sees rows in all nine authority tables and only in its organization'
);
SELECT lives_ok(
  $$ SELECT * FROM public.get_owner_event_allocation_queue('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'USD', date_trunc('month', current_date)::date, current_date) $$,
  'Finance can invoke a checked owner-balance read RPC for its organization'
);
SELECT throws_ok(
  $$ UPDATE public.owner_event_allocation_sets SET gross_signed_amount = 99.00 $$,
  '42501', 'permission denied for table owner_event_allocation_sets',
  'Finance cannot directly mutate owner-balance authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000101', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT * FROM pg_temp.owner_balance_visible_summary('c9100000-0000-4000-8000-000000000001') $$,
  $$ VALUES (9, 0) $$,
  'Super Admin sees rows in all nine authority tables and only in its organization'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000103', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT * FROM pg_temp.owner_balance_visible_summary('c9100000-0000-4000-8000-000000000001') $$,
  $$ VALUES (0, 0) $$,
  'Operations receives no owner-balance authority rows through RLS'
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_owner_event_allocation_queue('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'USD', date_trunc('month', current_date)::date, current_date) $$,
  '42501', 'owner_allocation_queue_forbidden',
  'Operations cannot invoke the Finance owner-balance read path'
);
SELECT throws_ok(
  $$ SELECT public.reverse_property_withdrawal('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000099', current_date, 'Unauthorized reversal probe', 'role-matrix-withdrawal-reversal') $$,
  '42501', 'owner_distribution_reversal_forbidden',
  'an unauthorized reversal actor is rejected before withdrawal lookup'
);
SELECT throws_ok(
  $$ SELECT public.reverse_owner_invoice_payment('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000098', current_date, 'Unauthorized reversal probe', 'role-matrix-payment-reversal') $$,
  '42501', 'owner_payment_reversal_forbidden',
  'an unauthorized reversal actor is rejected before owner-payment lookup'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000104', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT * FROM pg_temp.owner_balance_visible_summary('c9100000-0000-4000-8000-000000000001') $$,
  $$ VALUES (0, 0) $$,
  'an unaffiliated authenticated actor receives no authority rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'c9200000-0000-4000-8000-000000000105', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT * FROM pg_temp.owner_balance_visible_summary('c9200000-0000-4000-8000-000000000001') $$,
  $$ VALUES (9, 0) $$,
  'a cross-organization Super Admin sees all nine own-tenant tables and no foreign rows'
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_owner_event_allocation_queue('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'USD', date_trunc('month', current_date)::date, current_date) $$,
  '42501', 'owner_allocation_queue_forbidden',
  'a cross-organization Super Admin cannot use another tenant read path'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT count(*) FROM public.owner_event_allocation_sets $$,
  '42501', 'permission denied for table owner_event_allocation_sets',
  'anon has no direct authority-table read path'
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_owner_event_allocation_queue('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'USD', date_trunc('month', current_date)::date, current_date) $$,
  '42501', 'permission denied for function get_owner_event_allocation_queue',
  'anon has no checked owner-balance RPC execution path'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT count(*) FROM public.owner_event_allocation_sets $$,
  '42501', 'permission denied for table owner_event_allocation_sets',
  'service_role cannot bypass revoked authority-table privileges'
);
SELECT throws_ok(
  $$ UPDATE public.owner_event_allocation_sets SET gross_signed_amount = 99.00 $$,
  '42501', 'permission denied for table owner_event_allocation_sets',
  'service_role cannot directly mutate owner-balance authority'
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_owner_event_allocation_queue('c9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000002', 'USD', date_trunc('month', current_date)::date, current_date) $$,
  '42501', 'permission denied for function get_owner_event_allocation_queue',
  'service_role has no checked owner-balance RPC execution bypass'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
