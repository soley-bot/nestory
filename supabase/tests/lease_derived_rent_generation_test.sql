BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(45);

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
  super_admin_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000102',
  property_id uuid NOT NULL DEFAULT 'a2000000-0000-0000-0000-000000000001',
  good_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000001',
  blocked_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000002',
  good_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000001',
  blocked_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000002',
  owner_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000003',
  good_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000001',
  blocked_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000002',
  good_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000001',
  blocked_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000002',
  good_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000001',
  blocked_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000002',
  policy_id uuid NOT NULL DEFAULT 'a8000000-0000-0000-0000-000000000001'
) ON COMMIT DROP;

INSERT INTO lease_rent_state DEFAULT VALUES;
GRANT SELECT ON lease_rent_state TO authenticated;

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

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  tenant_name,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
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
  'Good Lease Tenant',
  '2026-08-15'::date,
  '2027-07-31'::date,
  1000::numeric,
  'USD'::public.currency_code,
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
  'Blocked Lease Tenant',
  '2026-08-01'::date,
  '2027-07-31'::date,
  900::numeric,
  'USD'::public.currency_code,
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

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
  NULL::integer,
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
  NULL::integer,
  'monthly',
  'active',
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
  '2026-08-15',
  '2027-07-31',
  'through_ips',
  'percentage',
  10,
  true,
  false,
  'individual',
  good_tenant_id,
  750,
  NULL,
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
  $$ VALUES ('activation_catch_up'::text, 750.00::numeric, 1000.00::numeric, true) $$,
  'activation catch-up creates the prorated current-month rent from lease authority'
);

SELECT lives_ok(
  $$
    SELECT app_private.run_due_rent_generation(
      '2026-08-31 17:30:00+00'::timestamptz
    )
  $$,
  'the scheduled runner isolates leases and uses a supplied clock'
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
      invoice.rent_policy_version_id,
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
      policy_id,
      'scheduled'::text,
      1000.00::numeric,
      1000.00::numeric,
      false,
      'percentage'::text,
      10.0000::numeric,
      100.00::numeric
    FROM lease_rent_state
  $$,
  'generated rent snapshots the exact term, policy, amount, proration, and fee authority'
);

SELECT is(
  (
    SELECT due_date
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT good_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  '2026-09-05'::date,
  'the approved policy supplies the due day when the lease term does not'
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
      '2026-08-31 17:30:00+00'::timestamptz
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
  $$ VALUES ('billing_setup_missing'::text, 2, true) $$,
  'one lease failure is isolated in a typed exception and repeated runs increment attempts'
);

INSERT INTO public.ledger_period_locks (
  organization_id,
  period_start,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  '2026-10-01',
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

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.rent_generation_exceptions
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  ),
  1,
  'Finance Manager can read the rent exception queue'
);

SELECT throws_ok(
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
  '42501',
  'Not authorized',
  'Finance Manager cannot recover rent generation'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM lease_rent_state),
  true
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
  '42501',
  'Rent income is created automatically from the active lease configuration',
  'the generic income RPC rejects independent rent creation with safe product language'
);

SELECT results_eq(
  $$
    SELECT generation_source, management_fee_amount
    FROM public.tenant_invoices
    WHERE lease_id = (SELECT blocked_lease_id FROM lease_rent_state)
      AND billing_period_start = '2026-09-01'
  $$,
  $$ VALUES ('manual_recovery'::text, 75.00::numeric) $$,
  'recovered rent retains its recovery source and configured flat fee snapshot'
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

SELECT * FROM finish();
ROLLBACK;
