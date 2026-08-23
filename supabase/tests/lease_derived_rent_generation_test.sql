BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(88);

SELECT has_column(
  'public',
  'finance_income_items',
  'rent_billing_period_start',
  'rent obligations carry an explicit lease billing-month identity'
);

SELECT has_index(
  'public',
  'finance_income_items',
  'finance_income_items_org_lease_rent_period_unique',
  'rent uniqueness is based on lease billing month instead of due date'
);

SELECT has_column(
  'public',
  'tenant_invoices',
  'lease_term_id',
  'rent invoices snapshot the authoritative lease term'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'rent_policy_version_id',
  'rent invoices snapshot the approved rent policy'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'generation_source',
  'rent invoices identify how they were generated'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'generated_at',
  'rent invoices record when generation completed'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'base_rent_amount',
  'rent invoices preserve the unprorated lease amount'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'is_prorated',
  'rent invoices identify prorated periods'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'management_fee_mode',
  'rent invoices snapshot the management fee mode'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'management_fee_value',
  'rent invoices snapshot the management fee value'
);
SELECT has_column(
  'public',
  'tenant_invoices',
  'management_fee_amount',
  'rent invoices preserve the calculated management fee'
);

SELECT has_table(
  'public',
  'rent_generation_exceptions',
  'rent generation failures have an operational exception queue'
);
SELECT has_column(
  'public',
  'rent_generation_exceptions',
  'billing_period_start',
  'rent exceptions identify the affected billing month'
);
SELECT has_column(
  'public',
  'rent_generation_exceptions',
  'attempt_count',
  'rent exceptions count isolated retries'
);
SELECT has_column(
  'public',
  'rent_generation_exceptions',
  'resolved_invoice_id',
  'rent exceptions retain successful resolution evidence'
);

SELECT has_function(
  'app_private',
  'generate_lease_rent_invoice',
  ARRAY['uuid', 'uuid', 'date', 'date', 'text', 'uuid'],
  'one private function owns lease-month rent generation'
);
SELECT has_function(
  'app_private',
  'run_due_rent_generation',
  ARRAY['timestamp with time zone'],
  'the automatic runner accepts a deterministic clock for tests'
);
SELECT has_function(
  'app_private',
  'run_due_rent_generation',
  ARRAY[]::text[],
  'the automatic runner exposes a no-argument Cron entry point'
);
SELECT has_function(
  'public',
  'recover_rent_generation_exception',
  ARRAY['uuid', 'uuid'],
  'Super Admin has one checked rent-recovery action'
);
SELECT has_function(
  'public',
  'recover_lease_rent_period',
  ARRAY['uuid', 'uuid', 'date'],
  'Super Admin can recover one selected historical lease month'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.generate_tenant_rent_invoice(uuid,uuid,date,date,text)'),
      'EXECUTE'
    ),
    false
  ),
  'the old per-invoice manual generator is not callable through the Data API'
);
SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.generate_monthly_rent_income_items(uuid,date)'),
      'EXECUTE'
    ),
    false
  ),
  'the old monthly batch generator is not callable through the Data API'
);
SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'app_private.generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'authenticated users cannot call the private generator directly'
);
SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.run_due_rent_generation(timestamp with time zone)'),
      'EXECUTE'
    ),
    false
  ),
  'authenticated users cannot call the scheduled runner directly'
);

SELECT has_trigger(
  'public',
  'finance_income_items',
  'guard_lease_derived_rent_income',
  'rent income is protected from independent insertion'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ),
  'pg_cron is installed for automatic rent generation'
);
CREATE TEMP TABLE rent_cron_contract (configured boolean NOT NULL)
ON COMMIT DROP;

DO $rent_cron_check$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    INSERT INTO rent_cron_contract VALUES (false);
  ELSE
    EXECUTE $query$
      INSERT INTO rent_cron_contract
      SELECT EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'nestory-hourly-rent-generation'
          AND schedule = '17 * * * *'
          AND active
          AND command = 'SELECT app_private.run_due_rent_generation();'
      )
    $query$;
  END IF;
END;
$rent_cron_check$;

SELECT ok(
  (SELECT configured FROM rent_cron_contract),
  'one named hourly rent-generation job is active'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.rent_generation_exceptions')
      AND conname = 'rent_generation_exceptions_lease_period_unique'
  ),
  'one exception row represents each lease and billing period'
);

CREATE TEMP TABLE lease_rent_state (
  organization_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000001',
  missing_policy_organization_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000102',
  property_id uuid NOT NULL DEFAULT 'a2000000-0000-0000-0000-000000000001',
  good_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000001',
  blocked_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000002',
  recovery_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000004',
  good_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000001',
  blocked_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000002',
  owner_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000003',
  recovery_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000005',
  good_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000001',
  blocked_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000002',
  missing_policy_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000003',
  recovery_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000004',
  good_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000001',
  blocked_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000002',
  recovery_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000003',
  good_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000001',
  blocked_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000002',
  recovery_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000003',
  policy_id uuid NOT NULL DEFAULT 'a8000000-0000-0000-0000-000000000001',
  source_id uuid,
  current_business_date date,
  current_period_start date,
  non_current_period_start date,
  current_retry_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_rent_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON lease_rent_state TO authenticated;

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
  user_id,
  'authenticated',
  'authenticated',
  label || '@lease-rent.test',
  extensions.crypt('lease-rent-test', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM lease_rent_state
  UNION ALL
  SELECT finance_manager_id, 'finance-manager' FROM lease_rent_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT
  organization_id,
  'Lease rent test organization',
  'lease-rent-test'
FROM lease_rent_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role
)
SELECT organization_id, super_admin_id, 'super_admin'
FROM lease_rent_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager'
FROM lease_rent_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Lease rent property',
  'LR-001',
  'apartment',
  'active'
FROM lease_rent_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT good_unit_id, organization_id, property_id, 'A-01', 'vacant'
FROM lease_rent_state
UNION ALL
SELECT blocked_unit_id, organization_id, property_id, 'A-02', 'vacant'
FROM lease_rent_state
UNION ALL
SELECT recovery_unit_id, organization_id, property_id, 'A-03', 'vacant'
FROM lease_rent_state;

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  party_type
)
SELECT good_tenant_id, organization_id, 'Good Lease Tenant', 'individual'
FROM lease_rent_state
UNION ALL
SELECT blocked_tenant_id, organization_id, 'Blocked Lease Tenant', 'individual'
FROM lease_rent_state
UNION ALL
SELECT owner_id, organization_id, 'Lease Rent Owner', 'individual'
FROM lease_rent_state
UNION ALL
SELECT recovery_tenant_id, organization_id, 'Historical Recovery Tenant', 'individual'
FROM lease_rent_state;

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status
)
SELECT organization_id, good_tenant_id, 'tenant', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, blocked_tenant_id, 'tenant', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, owner_id, 'owner', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, recovery_tenant_id, 'tenant', 'active'
FROM lease_rent_state;

INSERT INTO public.property_owners (
  organization_id,
  property_id,
  person_id,
  ownership_label,
  ownership_percent,
  is_primary,
  started_on,
  created_by,
  updated_by
)
SELECT
  organization_id,
  property_id,
  owner_id,
  'Primary owner',
  100,
  true,
  '2025-01-01',
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  status,
  created_by,
  updated_by
)
SELECT
  good_lease_id,
  organization_id,
  property_id,
  good_unit_id,
  good_tenant_id,
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  blocked_lease_id,
  organization_id,
  property_id,
  blocked_unit_id,
  blocked_tenant_id,
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_lease_id,
  organization_id,
  property_id,
  recovery_unit_id,
  recovery_tenant_id,
  'ended',
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  id,
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  authority_kind,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  good_term_id,
  organization_id,
  good_lease_id,
  2,
  '2026-08-15'::date,
  '2027-07-31'::date,
  1000::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  blocked_term_id,
  organization_id,
  blocked_lease_id,
  2,
  '2026-08-01'::date,
  '2027-07-31'::date,
  900::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_term_id,
  organization_id,
  recovery_lease_id,
  2,
  '2026-01-01'::date,
  '2026-07-31'::date,
  1100::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'expired',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

INSERT INTO public.rent_policy_versions (
  id,
  organization_id,
  version_number,
  effective_from,
  supported_frequencies,
  rent_calculation_timezone,
  due_day_source,
  policy_default_due_day,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  notice_period_charging_rule,
  mid_period_rent_change_rule,
  concessions_support_state,
  rent_free_support_state,
  waivers_support_state,
  lifecycle,
  created_by,
  updated_by,
  approved_at,
  approved_by
)
SELECT
  policy_id,
  organization_id,
  1,
  '2026-01-01',
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  5,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  super_admin_id,
  super_admin_id,
  now(),
  super_admin_id
FROM lease_rent_state;

-- Resolve the business date only after the approved timezone policy exists.
-- Before that, the helper correctly falls back to UTC, which can differ from
-- the organization's Asia/Bangkok operating date around midnight.
UPDATE lease_rent_state
SET current_business_date = app_private.rent_business_date(
      organization_id,
      pg_catalog.now()
    ),
    current_period_start = pg_catalog.date_trunc(
      'month',
      app_private.rent_business_date(organization_id, pg_catalog.now())
    )::date,
    non_current_period_start = (
      pg_catalog.date_trunc(
        'month',
        app_private.rent_business_date(organization_id, pg_catalog.now())
      ) + interval '1 month'
    )::date;

INSERT INTO public.lease_billing_terms (
  id,
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  first_period_prorated_amount,
  final_period_prorated_amount,
  rent_calculation_timezone,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  mid_period_rent_change_rule,
  charge_through_lease_end,
  rule_source,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  good_billing_id,
  organization_id,
  good_lease_id,
  property_id,
  '2026-08-15'::date,
  '2027-07-31'::date,
  'through_ips',
  'percentage',
  10,
  true,
  false,
  'individual',
  good_tenant_id,
  750::numeric,
  NULL::numeric,
  'Asia/Bangkok',
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'lease_default_v1',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_billing_id,
  organization_id,
  recovery_lease_id,
  property_id,
  '2026-01-01'::date,
  '2026-07-31'::date,
  'through_ips',
  'flat',
  50,
  true,
  true,
  'individual',
  recovery_tenant_id,
  NULL::numeric,
  NULL::numeric,
  'Asia/Bangkok',
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'lease_default_v1',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

INSERT INTO public.organizations (id, name, slug)
SELECT
  missing_policy_organization_id,
  'Missing rent policy organization',
  'missing-rent-policy'
FROM lease_rent_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT missing_policy_organization_id, super_admin_id, 'super_admin'
FROM lease_rent_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  'a2000000-0000-0000-0000-000000000002',
  missing_policy_organization_id,
  'Missing policy property',
  'LR-002',
  'apartment',
  'active'
FROM lease_rent_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT
  'a3000000-0000-0000-0000-000000000003',
  missing_policy_organization_id,
  'a2000000-0000-0000-0000-000000000002',
  'B-01',
  'vacant'
FROM lease_rent_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT
  'a4000000-0000-0000-0000-000000000004',
  missing_policy_organization_id,
  'Missing Policy Tenant',
  'individual'
FROM lease_rent_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT
  missing_policy_organization_id,
  'a4000000-0000-0000-0000-000000000004',
  'tenant',
  'active'
FROM lease_rent_state;

SET LOCAL session_replication_role = replica;
INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  status,
  created_by,
  updated_by
)
SELECT
  missing_policy_lease_id,
  missing_policy_organization_id,
  'a2000000-0000-0000-0000-000000000002',
  'a3000000-0000-0000-0000-000000000003',
  'a4000000-0000-0000-0000-000000000004',
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state;
SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  authority_kind,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  missing_policy_organization_id,
  missing_policy_lease_id,
  1,
  '2026-08-01',
  '2027-07-31',
  700,
  'USD',
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SELECT results_eq(
  $$
    SELECT
      invoice.generation_source,
      invoice.total_amount,
      invoice.base_rent_amount,
      invoice.is_prorated
    FROM public.tenant_invoices AS invoice
    WHERE invoice.lease_id = (
      SELECT good_lease_id FROM lease_rent_state
    )
      AND invoice.billing_period_start = '2026-08-01'
  $$,
  $$ VALUES ('lease_rules_v1'::text, 750.00::numeric, 1000.00::numeric, true) $$,
  'activation catch-up creates the prorated current-month rent from lease authority'
);

SELECT lives_ok(
  $$
    SELECT app_private.run_due_rent_generation(
      '2026-08-31 17:30:00+00'::timestamptz
    );
    SELECT app_private.run_due_rent_generation(
      '2026-09-01 00:30:00+00'::timestamptz
    )
  $$,
  'the scheduled runner isolates leases and covers lease-rule timezones plus missing-rule failure'
);

SELECT results_eq(
  $$
    SELECT error_code, attempt_count, resolved_at IS NULL
    FROM public.rent_generation_exceptions
    WHERE lease_id = (
      SELECT missing_policy_lease_id FROM lease_rent_state
    )
      AND billing_period_start = '2026-09-01'
  $$,
  $$VALUES ('billing_setup_missing'::text, 1, true)$$,
  'scheduled generation exposes a pre-existing active lease with no lease-owned billing rule'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  1,
  'Bangkok-local September rent is generated while the UTC date is still August'
);

SELECT results_eq(
  $$
    SELECT
      invoice.lease_term_id,
      invoice.billing_term_id,
      invoice.generation_source,
      invoice.base_rent_amount,
      invoice.total_amount,
      invoice.is_prorated,
      invoice.management_fee_mode,
      invoice.management_fee_value,
      invoice.management_fee_amount
    FROM public.tenant_invoices AS invoice
    WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND invoice.billing_period_start = '2026-09-01'
  $$,
  $$
    SELECT
      good_term_id,
      good_billing_id,
      'lease_rules_v1'::text,
      1000.00::numeric,
      1000.00::numeric,
      false,
      'percentage'::text,
      10.0000::numeric,
      100.00::numeric
    FROM lease_rent_state
  $$,
  'generated rent snapshots the exact term, lease billing rule, amount, proration, and fee authority'
);

SELECT is(
  (
    SELECT due_date
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  '2026-09-05'::date,
  'the lease term supplies the due day without mutable organization policy'
);

SELECT is(
  (
    SELECT fee.amount
    FROM public.management_fee_occurrences AS fee
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = fee.organization_id
     AND invoice.id = fee.tenant_invoice_id
    WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND invoice.billing_period_start = '2026-09-01'
  ),
  100.00::numeric,
  'one management-fee occurrence is calculated from the generated rent month'
);

SELECT lives_ok(
  $$
    SELECT app_private.run_due_rent_generation(
      '2026-09-01 00:30:00+00'::timestamptz
    );
    SELECT app_private.run_due_rent_generation(
      '2026-09-01 00:30:00+00'::timestamptz
    )
  $$,
  'scheduled replay is safe'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  1,
  'scheduled replay cannot duplicate a lease-month invoice'
);

SELECT results_eq(
  $$
    SELECT error_code, attempt_count, resolved_at IS NULL
    FROM public.rent_generation_exceptions
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  $$,
  $$ VALUES ('billing_setup_missing'::text, 3, true) $$,
  'one lease failure is isolated in a typed exception and repeated runs increment attempts'
);

INSERT INTO public.financial_month_locks (
  organization_id,
  branch_id,
  month_start,
  is_locked,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  (SELECT branch_id FROM public.properties WHERE id=lease_rent_state.property_id),
  '2026-10-01',
  true,
  now(),
  super_admin_id,
  'Rent generation lock test'
FROM lease_rent_state;

SELECT lives_ok(
  $$
    SELECT app_private.try_generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2026-10-01',
      '2026-10-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    )
  $$,
  'a locked month is isolated instead of aborting the runner'
);

SELECT results_eq(
  $$
    SELECT error_code, resolved_at IS NULL
    FROM public.rent_generation_exceptions
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-10-01'
  $$,
  $$ VALUES ('period_locked'::text, true) $$,
  'a locked month produces an actionable rent exception'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-10-01'
  ),
  0,
  'a locked month has no financial effect'
);

INSERT INTO public.financial_month_locks (
  organization_id,
  branch_id,
  month_start,
  is_locked,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  (SELECT branch_id FROM public.properties WHERE id=lease_rent_state.property_id),
  month_start,
  true,
  now(),
  super_admin_id,
  'Rent generation lock test'
FROM lease_rent_state
CROSS JOIN (
  VALUES ('2027-04-01'::date), ('2027-05-01'::date)
) AS months(month_start);

SELECT results_eq(
  $$
    SELECT app_private.try_generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2027-04-01',
      '2027-04-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    ) ->> 'code'
  $$,
  $$VALUES ('period_locked'::text)$$,
  'the April month lock rejects rent generation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2027-04-01'
  ),
  0,
  'the April month lock creates no rent or fee effect'
);

SELECT results_eq(
  $$
    SELECT app_private.try_generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2027-05-01',
      '2027-05-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    ) ->> 'code'
  $$,
  $$VALUES ('period_locked'::text)$$,
  'the May month lock rejects rent generation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2027-05-01'
  ),
  0,
  'the May month lock creates no rent or fee effect'
);

INSERT INTO public.financial_month_locks (
  organization_id,
  branch_id,
  month_start,
  is_locked,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  (SELECT branch_id FROM public.properties WHERE id=lease_rent_state.property_id),
  current_period_start,
  true,
  now(),
  super_admin_id,
  'Current-rent retry must fail closed'
FROM lease_rent_state
ON CONFLICT (organization_id, branch_id, month_start) WHERE branch_id IS NOT NULL DO UPDATE
SET is_locked = EXCLUDED.is_locked,
    locked_at = EXCLUDED.locked_at,
    locked_by = EXCLUDED.locked_by,
    reason = EXCLUDED.reason;

INSERT INTO public.lease_billing_terms (
  id,
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  rent_calculation_timezone,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  mid_period_rent_change_rule,
  charge_through_lease_end,
  rule_source,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  blocked_billing_id,
  organization_id,
  blocked_lease_id,
  property_id,
  '2026-08-01',
  '2027-07-31',
  'through_ips',
  'flat',
  75,
  true,
  true,
  'individual',
  blocked_tenant_id,
  'Asia/Bangkok',
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'lease_default_v1',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM lease_rent_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE lease_rent_state
    SET current_retry_result = public.recover_rent_generation_exception(
      organization_id,
      (
        SELECT id
        FROM public.rent_generation_exceptions
        WHERE lease_id = lease_rent_state.blocked_lease_id
          AND billing_period_start = lease_rent_state.current_period_start
      )
    )
  $$,
  'Finance Manager can safely retry the explicitly locked current rent exception'
);

SELECT results_eq(
  $$
    SELECT current_retry_result ->> 'status', current_retry_result ->> 'code'
    FROM lease_rent_state
  $$,
  $$ VALUES ('failed'::text, 'period_locked'::text) $$,
  'the locked-current-month retry returns the typed safe failure'
);

SELECT results_eq(
  $$
    SELECT
      (
        SELECT count(*)::integer
        FROM public.tenant_invoices
        WHERE lease_id = state.blocked_lease_id
          AND billing_period_start = state.current_period_start
      ),
      exception.resolved_at IS NULL,
      exception.resolved_invoice_id IS NULL,
      exception.last_attempted_by = state.finance_manager_id,
      (
        SELECT count(*)::integer
        FROM public.finance_income_items
        WHERE lease_id = state.blocked_lease_id
          AND rent_billing_period_start = state.current_period_start
      ),
      (
        SELECT count(*)::integer
        FROM public.management_fee_occurrences AS fee
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = fee.organization_id
         AND invoice.id = fee.tenant_invoice_id
        WHERE invoice.lease_id = state.blocked_lease_id
          AND invoice.billing_period_start = state.current_period_start
      )
    FROM lease_rent_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.blocked_lease_id
     AND exception.billing_period_start = state.current_period_start
  $$,
  $$ VALUES (0, true, true, true, 0, 0) $$,
  'the locked-current-month retry records the manager but creates no invoice, resolution, income, or fee effect'
);

SELECT results_eq(
  $$
    SELECT result ->> 'status', result ->> 'code'
    FROM (
      SELECT public.recover_rent_generation_exception(
        (SELECT organization_id FROM lease_rent_state),
        (
          SELECT id
          FROM public.rent_generation_exceptions
          WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
            AND billing_period_start = (SELECT current_period_start FROM lease_rent_state)
        )
      ) AS result
    ) AS replay
  $$,
  $$ VALUES ('failed'::text, 'period_locked'::text) $$,
  'an exact locked-current-month retry remains a safe typed failure'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM lease_rent_state),
  true
);
RESET ROLE;

DELETE FROM public.financial_month_locks
WHERE organization_id = (SELECT organization_id FROM lease_rent_state)
  AND month_start = (SELECT current_period_start FROM lease_rent_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM lease_rent_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE lease_rent_state
    SET current_retry_result = public.recover_rent_generation_exception(
      organization_id,
      (
        SELECT id
        FROM public.rent_generation_exceptions
        WHERE lease_id = lease_rent_state.blocked_lease_id
          AND billing_period_start = lease_rent_state.current_period_start
      )
    )
  $$,
  'Finance Manager can resolve a valid unlocked current-business-month exception'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM lease_rent_state),
  true
);
RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      state.current_retry_result ->> 'status',
      exception.resolved_at IS NOT NULL,
      exception.resolved_invoice_id::text = state.current_retry_result ->> 'invoiceId',
      exception.last_attempted_by = state.finance_manager_id
    FROM lease_rent_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.blocked_lease_id
     AND exception.billing_period_start = state.current_period_start
  $$,
  $$ VALUES ('generated'::text, true, true, true) $$,
  'successful current retry resolves the exception under the requesting Finance Manager'
);

SELECT results_eq(
  $$
    SELECT
      (
        SELECT count(*)::integer
        FROM public.tenant_invoices
        WHERE lease_id = state.blocked_lease_id
          AND billing_period_start = state.current_period_start
      ),
      (
        SELECT count(*)::integer
        FROM public.finance_income_items
        WHERE lease_id = state.blocked_lease_id
          AND rent_billing_period_start = state.current_period_start
      ),
      (
        SELECT count(*)::integer
        FROM public.management_fee_occurrences AS fee
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = fee.organization_id
         AND invoice.id = fee.tenant_invoice_id
        WHERE invoice.lease_id = state.blocked_lease_id
          AND invoice.billing_period_start = state.current_period_start
      )
    FROM lease_rent_state AS state
  $$,
  $$ VALUES (1, 1, 1) $$,
  'successful current retry creates exactly one invoice, income item, and management fee'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM lease_rent_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE lease_rent_state
    SET current_retry_result = public.recover_rent_generation_exception(
      organization_id,
      (
        SELECT id
        FROM public.rent_generation_exceptions
        WHERE lease_id = lease_rent_state.blocked_lease_id
          AND billing_period_start = lease_rent_state.current_period_start
      )
    )
  $$,
  'Finance Manager can safely replay the same successful current exception request'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      state.current_retry_result ->> 'status',
      state.current_retry_result ->> 'invoiceId',
      exception.resolved_invoice_id::text,
      (
        SELECT count(*)::integer
        FROM public.tenant_invoices
        WHERE lease_id = state.blocked_lease_id
          AND billing_period_start = state.current_period_start
      )
    FROM lease_rent_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.blocked_lease_id
     AND exception.billing_period_start = state.current_period_start
  $$,
  $$
    SELECT
      'already_generated'::text,
      resolved_invoice_id::text,
      resolved_invoice_id::text,
      1
    FROM public.rent_generation_exceptions AS exception
    JOIN lease_rent_state AS state
      ON state.organization_id = exception.organization_id
     AND state.blocked_lease_id = exception.lease_id
     AND state.current_period_start = exception.billing_period_start
  $$,
  'same current-exception replay returns the original invoice without duplicates'
);

SELECT results_eq(
  $$
    SELECT
      invoice.created_by = state.finance_manager_id,
      invoice.issue_date = state.current_business_date,
      income.created_by = state.finance_manager_id,
      line.created_by = state.finance_manager_id,
      fee.created_by = state.finance_manager_id,
      activity.actor_id = state.finance_manager_id
    FROM lease_rent_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.blocked_lease_id
     AND invoice.billing_period_start = state.current_period_start
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = invoice.organization_id
     AND line.invoice_id = invoice.id
     AND line.line_type = 'rent'
    JOIN public.finance_income_items AS income
      ON income.organization_id = line.organization_id
     AND income.id = line.income_item_id
    JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = invoice.organization_id
     AND fee.tenant_invoice_id = invoice.id
    JOIN public.activity_logs AS activity
      ON activity.organization_id = invoice.organization_id
     AND activity.entity_type = 'tenant_invoice'
     AND activity.entity_id = invoice.id
     AND activity.action = 'lease_rent_generated'
  $$,
  $$ VALUES (true, true, true, true, true, true) $$,
  'current-business invoice, income, line, fee, and activity provenance all name the real Finance Manager'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM lease_rent_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.rent_generation_exceptions
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = (SELECT non_current_period_start FROM lease_rent_state)
  ),
  'Finance Manager can read a non-current rent exception in the queue'
);

SELECT throws_ok(
  format(
    'SELECT public.recover_rent_generation_exception(%L, %L)',
    (SELECT organization_id FROM lease_rent_state),
    (
      SELECT id
      FROM public.rent_generation_exceptions
      WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
        AND billing_period_start = (SELECT non_current_period_start FROM lease_rent_state)
    )
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot retry a non-current rent exception by guessed identity'
);

SELECT throws_ok(
  format(
    'SELECT public.recover_lease_rent_period(%L, %L, %L)',
    (SELECT organization_id FROM lease_rent_state),
    (SELECT recovery_lease_id FROM lease_rent_state),
    '2026-07-01'
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot generate a selected historical rent month'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM lease_rent_state),
  true
);

RESET ROLE;

INSERT INTO public.financial_month_locks (
  organization_id,
  branch_id,
  month_start,
  is_locked,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  (SELECT branch_id FROM public.properties WHERE id=lease_rent_state.property_id),
  '2026-08-01',
  true,
  now(),
  super_admin_id,
  'Historical recovery must stay in the selected month'
FROM lease_rent_state
ON CONFLICT (organization_id, branch_id, month_start) WHERE branch_id IS NOT NULL DO UPDATE
SET is_locked = EXCLUDED.is_locked,
    locked_at = EXCLUDED.locked_at,
    locked_by = EXCLUDED.locked_by,
    reason = EXCLUDED.reason;

SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT public.recover_lease_rent_period(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT recovery_lease_id FROM lease_rent_state),
      '2026-07-01'
    ) ->> 'status'
  $$,
  $$ VALUES ('generated'::text) $$,
  'Super Admin can generate exactly one selected historical lease month'
);

SELECT lives_ok(
  $$
    SELECT public.recover_lease_rent_period(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT recovery_lease_id FROM lease_rent_state),
      '2026-07-01'
    )
  $$,
  'selected-period recovery safely replays the existing lease-month invoice'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT recovery_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-07-01'
  ),
  1,
  'selected-period recovery is idempotent by lease and billing month'
);

SELECT is(
  (
    SELECT fee.fee_date
    FROM public.management_fee_occurrences AS fee
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = fee.organization_id
     AND invoice.id = fee.tenant_invoice_id
    WHERE invoice.lease_id = (SELECT recovery_lease_id FROM lease_rent_state)
      AND invoice.billing_period_start = '2026-07-01'
  ),
  current_date,
  'historical recovery recognizes its management fee on immutable invoice issuance even when the selected month is locked'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT recovery_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-06-01'
  ),
  0,
  'selected-period recovery never backfills an adjacent historical month'
);

SELECT lives_ok(
  format(
    'SELECT public.recover_rent_generation_exception(%L, %L)',
    (SELECT organization_id FROM lease_rent_state),
    (
      SELECT id
      FROM public.rent_generation_exceptions
      WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
        AND billing_period_start = '2026-09-01'
    )
  ),
  'Super Admin can recover one configured rent exception'
);

SELECT results_eq(
  $$
    SELECT resolved_at IS NOT NULL, resolved_invoice_id IS NOT NULL
    FROM public.rent_generation_exceptions
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  $$,
  $$ VALUES (true, true) $$,
  'successful recovery resolves the original exception with invoice evidence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  1,
  'manual recovery creates exactly one missing lease-month invoice'
);

SELECT throws_ok(
  format(
    'SELECT public.create_finance_income_item(%L,%L,%L,%L,%L,%L,%L,1000,0,NULL,%L,%L,%L)',
    (SELECT organization_id FROM lease_rent_state),
    (SELECT property_id FROM lease_rent_state),
    (SELECT good_unit_id FROM lease_rent_state),
    (SELECT good_lease_id FROM lease_rent_state),
    'rent',
    'Good Lease Tenant',
    '2026-11-05',
    'Manual rent',
    'MANUAL-RENT-TEST',
    (SELECT good_tenant_id FROM lease_rent_state)
  ),
  '42883',
  NULL,
  'the retired generic income command is absent'
);

SELECT results_eq(
  $$
    SELECT generation_source, management_fee_amount
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  $$,
  $$ VALUES ('lease_rules_v1'::text, 75.00::numeric) $$,
  'recovered rent retains its lease-owned source and configured flat fee snapshot'
);

SELECT results_eq(
  $$
    SELECT collection_route, recipient_label
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  $$,
  $$ VALUES ('through_ips'::text, 'Good Lease Tenant'::text) $$,
  'generated rent preserves the configured collection route and recipient'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.void_finance_income_item(uuid,uuid)'),
    'EXECUTE'
  ), false),
  'the generic income void command is absent'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.post_finance_income_item(uuid,uuid)'),
    'EXECUTE'
  ), false),
  'the generic income posting command is absent'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.record_finance_receipt(uuid,uuid,numeric,date,text)'),
    'EXECUTE'
  ), false),
  'the generic receipt command is absent'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.record_finance_income_payment(uuid,uuid,numeric,date,text)'),
    'EXECUTE'
  ), false),
  'the generic income payment command is absent'
);

SELECT ok(
  NOT coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.record_finance_receipt_v2(uuid,uuid,numeric,date,uuid,text,text)'),
    'EXECUTE'
  ), false),
  'the generic atomic receipt command is absent'
);

RESET ROLE;

UPDATE lease_rent_state
SET source_id = public.create_financial_reconciliation_source(
  organization_id,
  'RENTGUARD',
  'Rent guard test account',
  'bank',
  'property_dedicated',
  'USD',
  property_id,
  '****9100'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.void_finance_income_item(
      (
        SELECT line.income_item_id
        FROM public.tenant_invoice_lines AS line
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = line.organization_id
         AND invoice.id = line.invoice_id
        WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
          AND invoice.billing_period_start = '2026-09-01'
          AND line.line_type = 'rent'
      ),
      (SELECT organization_id FROM lease_rent_state)
    )
  $$,
  '42883',
  NULL,
  'a removed generic command cannot archive a lease-derived rent obligation'
);

SELECT throws_ok(
  $$
    SELECT public.post_finance_income_item(
      (
        SELECT line.income_item_id
        FROM public.tenant_invoice_lines AS line
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = line.organization_id
         AND invoice.id = line.invoice_id
        WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
          AND invoice.billing_period_start = '2026-09-01'
          AND line.line_type = 'rent'
      ),
      (SELECT organization_id FROM lease_rent_state)
    )
  $$,
  '42883',
  NULL,
  'a removed generic command cannot create a separate Ledger effect for generated rent'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt(
      (SELECT organization_id FROM lease_rent_state),
      (
        SELECT line.income_item_id
        FROM public.tenant_invoice_lines AS line
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = line.organization_id
         AND invoice.id = line.invoice_id
        WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
          AND invoice.billing_period_start = '2026-09-01'
          AND line.line_type = 'rent'
      ),
      10,
      '2026-09-05',
      'Direct receipt blocked'
    )
  $$,
  '42883',
  NULL,
  'a removed generic command cannot settle generated rent outside its invoice'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_income_payment(
      (
        SELECT line.income_item_id
        FROM public.tenant_invoice_lines AS line
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = line.organization_id
         AND invoice.id = line.invoice_id
        WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
          AND invoice.billing_period_start = '2026-09-01'
          AND line.line_type = 'rent'
      ),
      (SELECT organization_id FROM lease_rent_state),
      10,
      '2026-09-05',
      'Direct payment blocked'
    )
  $$,
  '42883',
  NULL,
  'a removed generic payment command cannot settle generated rent directly'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      (SELECT organization_id FROM lease_rent_state),
      (
        SELECT line.income_item_id
        FROM public.tenant_invoice_lines AS line
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = line.organization_id
         AND invoice.id = line.invoice_id
        WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
          AND invoice.billing_period_start = '2026-09-01'
          AND line.line_type = 'rent'
      ),
      10,
      '2026-09-05',
      (SELECT source_id FROM lease_rent_state),
      'Direct atomic receipt blocked',
      'rent-direct-v2-blocked'
    )
  $$,
  '42883',
  NULL,
  'a removed generic settlement command cannot bypass the tenant-invoice allocation'
);

SELECT results_eq(
  $$
    SELECT
      income.status,
      income.amount_received,
      income.archived_at IS NULL,
      invoice.lifecycle,
      invoice.total_amount
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = invoice.organization_id
     AND line.invoice_id = invoice.id
     AND line.line_type = 'rent'
    JOIN public.finance_income_items AS income
      ON income.organization_id = line.organization_id
     AND income.id = line.income_item_id
    WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND invoice.billing_period_start = '2026-09-01'
  $$,
  $$VALUES ('open'::text, 0::numeric, true, 'issued'::text, 1000.00::numeric)$$,
  'retired direct mutations leave the generated invoice and income obligation unchanged'
);

RESET ROLE;

SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

INSERT INTO public.finance_income_items (
  id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  income_type,
  payer_label,
  due_date,
  amount_due,
  amount_received,
  status,
  currency,
  description,
  reference,
  created_by,
  updated_by
)
SELECT
  existing_income_id,
  organization_id,
  property_id,
  good_unit_id,
  good_lease_id,
  'rent',
  'Good Lease Tenant',
  due_date,
  amount_due,
  0,
  'open',
  'USD'::public.currency_code,
  'Monthly rent',
  reference,
  super_admin_id,
  super_admin_id
FROM (
  SELECT
    'a9000000-0000-0000-0000-000000000001'::uuid AS existing_income_id,
    organization_id,
    property_id,
    good_unit_id,
    good_lease_id,
    '2026-11-01'::date AS due_date,
    1000::numeric AS amount_due,
    '2026-11'::text AS reference,
    super_admin_id
  FROM lease_rent_state
  UNION ALL
  SELECT
    'a9000000-0000-0000-0000-000000000002'::uuid,
    organization_id,
    property_id,
    good_unit_id,
    good_lease_id,
    '2026-12-01'::date,
    999::numeric,
    '2026-12'::text,
    super_admin_id
  FROM lease_rent_state
) AS existing_rows;

SELECT set_config('app.rent_generation_context', 'off', true);

SELECT lives_ok(
  $$
    SELECT app_private.generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2026-11-01',
      '2026-11-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    )
  $$,
  'automatic rent adopts a compatible pre-existing month obligation'
);

SELECT results_eq(
  $$
    SELECT
      income.id,
      income.rent_billing_period_start,
      income.due_date,
      income.payer_person_id,
      line.income_item_id,
      invoice.due_date
    FROM public.finance_income_items AS income
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = income.organization_id
     AND line.income_item_id = income.id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE income.id = 'a9000000-0000-0000-0000-000000000001'
  $$,
  $$
    SELECT
      'a9000000-0000-0000-0000-000000000001'::uuid,
      '2026-11-01'::date,
      '2026-11-05'::date,
      good_tenant_id,
      'a9000000-0000-0000-0000-000000000001'::uuid,
      '2026-11-05'::date
    FROM lease_rent_state
  $$,
  'adoption normalizes due date and recipient while keeping one obligation identity'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.finance_income_items
    WHERE organization_id = (SELECT organization_id FROM lease_rent_state)
      AND lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND income_type = 'rent'
      AND due_date BETWEEN '2026-11-01' AND '2026-11-30'
      AND archived_at IS NULL
  ),
  1,
  'pre-existing rent adoption cannot duplicate the November obligation'
);

SELECT throws_ok(
  $$
    SELECT app_private.generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2026-12-01',
      '2026-12-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    )
  $$,
  '23514',
  'Existing rent activity conflicts with this lease month',
  'automatic rent refuses a pre-existing month whose amount conflicts with Lease authority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-12-01'
  ),
  0,
  'a conflicting pre-existing obligation produces no duplicate December invoice'
);

INSERT INTO public.rent_policy_versions (
  id,
  organization_id,
  version_number,
  effective_from,
  supported_frequencies,
  rent_calculation_timezone,
  due_day_source,
  policy_default_due_day,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  notice_period_charging_rule,
  mid_period_rent_change_rule,
  concessions_support_state,
  rent_free_support_state,
  waivers_support_state,
  lifecycle,
  created_by,
  updated_by,
  approved_at,
  approved_by
)
SELECT
  'a8000000-0000-0000-0000-000000000002',
  organization_id,
  2,
  '2027-01-01',
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  31,
  'next_calendar_month',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  super_admin_id,
  super_admin_id,
  now(),
  super_admin_id
FROM lease_rent_state;

SELECT lives_ok(
  $$
    SELECT app_private.generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2027-02-01',
      '2027-02-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    )
  $$,
  'February rent supports a next-calendar-month due date'
);

SELECT lives_ok(
  $$
    SELECT app_private.generate_lease_rent_invoice(
      (SELECT organization_id FROM lease_rent_state),
      (SELECT good_lease_id FROM lease_rent_state),
      '2027-03-01',
      '2027-03-01',
      'scheduled',
      (SELECT super_admin_id FROM lease_rent_state)
    )
  $$,
  'March rent can share February rent''s due date without collision'
);

SELECT results_eq(
  $$
    SELECT
      invoice.billing_period_start,
      income.rent_billing_period_start,
      income.due_date
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = invoice.organization_id
     AND line.invoice_id = invoice.id
     AND line.line_type = 'rent'
    JOIN public.finance_income_items AS income
      ON income.organization_id = line.organization_id
     AND income.id = line.income_item_id
    WHERE invoice.lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND invoice.billing_period_start IN ('2027-02-01', '2027-03-01')
    ORDER BY invoice.billing_period_start
  $$,
  $$
    VALUES
      ('2027-02-01'::date, '2027-02-01'::date, '2027-03-31'::date),
      ('2027-03-01'::date, '2027-03-01'::date, '2027-03-31'::date)
  $$,
  'two lease months remain distinct even when their due dates are identical'
);

SELECT * FROM finish();
ROLLBACK;
