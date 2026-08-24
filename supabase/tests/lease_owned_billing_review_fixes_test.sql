BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(55);

CREATE TEMP TABLE review_state (
  fixture_clock timestamptz NOT NULL DEFAULT pg_catalog.now(),
  fixture_utc_date date GENERATED ALWAYS AS (
    (fixture_clock AT TIME ZONE 'UTC')::date
  ) STORED,
  replacement_effective_on date GENERATED ALWAYS AS (
    (
      pg_catalog.date_trunc('month', fixture_clock AT TIME ZONE 'UTC')
      + interval '1 month'
    )::date
  ) STORED,
  owner_b_started_on date GENERATED ALWAYS AS (
    (fixture_clock AT TIME ZONE 'UTC')::date + 90
  ) STORED,
  fixture_lease_date date GENERATED ALWAYS AS (
    (fixture_clock AT TIME ZONE 'Pacific/Kiritimati')::date
  ) STORED,
  fixture_lease_month_start date GENERATED ALWAYS AS (
    pg_catalog.date_trunc(
      'month', fixture_clock AT TIME ZONE 'Pacific/Kiritimati'
    )::date
  ) STORED,
  admin_id uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000002',
  property_a uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000003',
  property_b uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000004',
  property_c uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000005',
  unit_a uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000006',
  unit_b uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000007',
  unit_c uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000008',
  tenant_id uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000009',
  company_id uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000000a',
  owner_a uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000000b',
  owner_b uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000000c',
  owner_c uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000000d',
  proration_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000010',
  full_fee_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000011',
  override_fee_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000012',
  move_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000013',
  scheduled_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000014',
  rejected_scheduled_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000015',
  west_to_east_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000016',
  east_to_west_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000017',
  authority_gap_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000018',
  unsupported_false_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-000000000019',
  legacy_snapshot_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000001a',
  incomplete_false_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000001b',
  complete_unused_legacy_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000001c',
  complete_prior_billed_legacy_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000001d',
  complete_current_billed_legacy_lease uuid NOT NULL DEFAULT '96000000-0000-0000-0000-00000000001e',
  west_result jsonb,
  east_result jsonb,
  gap_result jsonb,
  rollover_result jsonb,
  unsupported_current_result jsonb,
  unsupported_manual_result jsonb,
  incomplete_current_result jsonb,
  incomplete_manual_result jsonb,
  unsupported_repair_result jsonb,
  supported_retry_result jsonb,
  legacy_repair_result jsonb,
  unused_legacy_repair_result jsonb,
  prior_billed_legacy_repair_result jsonb,
  current_billed_legacy_repair_result jsonb,
  unused_legacy_generation_result jsonb,
  prior_billed_legacy_generation_result jsonb
) ON COMMIT DROP;

INSERT INTO review_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON review_state TO authenticated;

SELECT ok(
  owner_b_started_on > replacement_effective_on + interval '1 month',
  'the rejected scheduled-owner fixture stays invalid across a UTC month rollover'
) FROM review_state;

CREATE OR REPLACE FUNCTION pg_temp.billing_rule(
  p_recipient uuid,
  p_route text DEFAULT 'through_ips',
  p_fee_mode text DEFAULT 'flat',
  p_fee_value numeric DEFAULT 310,
  p_keep_full boolean DEFAULT false,
  p_timezone text DEFAULT 'UTC',
  p_first_override numeric DEFAULT NULL,
  p_final_override numeric DEFAULT NULL,
  p_charge_through boolean DEFAULT true
) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'billingRecipientKind', 'company',
    'billingRecipientPersonId', p_recipient,
    'collectionRoute', p_route,
    'managementFeeMode', p_fee_mode,
    'managementFeeValue', p_fee_value,
    'chargeManagementFeeWhenActive', true,
    'fullManagementFeeDuringProration', p_keep_full,
    'rentCalculationTimezone', p_timezone,
    'shortMonthDueDayRule', 'last_calendar_day',
    'leaseStartProrationRule', 'actual_days',
    'leaseEndProrationRule', 'actual_days',
    'midPeriodRentChangeRule', 'next_full_month',
    'chargeThroughLeaseEnd', p_charge_through,
    'firstPeriodProratedAmount', p_first_override,
    'finalPeriodProratedAmount', p_final_override
  );
$$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id,
  'authenticated', 'authenticated', 'billing-review@example.test',
  extensions.crypt('billing-review', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM review_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Billing review', 'billing-review-9600', 'UTC'
FROM review_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin' FROM review_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, rental_structure, status
)
SELECT fixture.id, state.organization_id, fixture.name, fixture.code,
  'apartment', 'multi_unit', 'active'
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.property_a, 'Property A', 'BRA'),
  (state.property_b, 'Property B', 'BRB'),
  (state.property_c, 'Property C', 'BRC')
) AS fixture(id, name, code);

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT fixture.id, state.organization_id, fixture.property_id,
  fixture.number, 'vacant', 3100, 'USD'
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.unit_a, state.property_a, 'A-1'),
  (state.unit_b, state.property_b, 'B-1'),
  (state.unit_c, state.property_c, 'C-1')
) AS fixture(id, property_id, number);

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT fixture.id, state.organization_id, fixture.name, fixture.kind
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'Tenant', 'individual'),
  (state.company_id, 'Billing Company', 'company'),
  (state.owner_a, 'Owner A', 'company'),
  (state.owner_b, 'Owner B', 'company'),
  (state.owner_c, 'Owner C', 'company')
) AS fixture(id, name, kind);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT state.organization_id, fixture.id, fixture.role
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'tenant'),
  (state.company_id, 'owner'),
  (state.owner_a, 'owner'),
  (state.owner_b, 'owner'),
  (state.owner_c, 'owner')
) AS fixture(id, role);

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
)
SELECT state.organization_id, fixture.property_id, fixture.person_id,
  'Primary owner', 100, true, fixture.started_on, state.admin_id, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.property_a, state.owner_a, DATE '2025-01-01'),
  (state.property_b, state.owner_b, state.owner_b_started_on),
  (state.property_c, state.owner_c, state.replacement_effective_on)
) AS fixture(property_id, person_id, started_on);

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, deposit_amount, deposit_currency, created_by, updated_by
)
SELECT fixture.id, state.organization_id, fixture.property_id, fixture.unit_id,
  state.tenant_id, fixture.status, 0, 'USD', state.admin_id, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.proration_lease, state.property_a, state.unit_a, 'active'),
  (state.full_fee_lease, state.property_a, state.unit_a, 'active'),
  (state.override_fee_lease, state.property_a, state.unit_a, 'active'),
  (state.move_lease, state.property_a, state.unit_a, 'draft'),
  (state.scheduled_lease, state.property_c, state.unit_c, 'active'),
  (state.rejected_scheduled_lease, state.property_b, state.unit_b, 'active'),
  (state.west_to_east_lease, state.property_a, state.unit_a, 'active'),
  (state.east_to_west_lease, state.property_a, state.unit_a, 'active'),
  (state.authority_gap_lease, state.property_a, state.unit_a, 'active'),
  (state.unsupported_false_lease, state.property_a, state.unit_a, 'active'),
  (state.legacy_snapshot_lease, state.property_a, state.unit_a, 'active'),
  (state.incomplete_false_lease, state.property_a, state.unit_a, 'active'),
  (state.complete_unused_legacy_lease, state.property_a, state.unit_a, 'active'),
  (state.complete_prior_billed_legacy_lease, state.property_a, state.unit_a, 'active'),
  (state.complete_current_billed_legacy_lease, state.property_a, state.unit_a, 'active')
) AS fixture(id, property_id, unit_id, status);

INSERT INTO public.lease_terms(
  organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
SELECT state.organization_id, fixture.lease_id, fixture.sequence,
  fixture.start_date, fixture.end_date, 3100, 'USD', 1, 'monthly',
  fixture.status, 'authoritative', now(), state.admin_id,
  state.admin_id, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  (state.proration_lease, 1, DATE '2026-02-10', DATE '2026-02-20', 'active'),
  (state.proration_lease, 2, DATE '2026-04-10', DATE '2026-04-20', 'active'),
  (state.proration_lease, 3, DATE '2026-05-10', DATE '2026-05-20', 'active'),
  (state.full_fee_lease, 1, DATE '2026-05-10', DATE '2026-05-20', 'active'),
  (state.override_fee_lease, 1, DATE '2026-06-10', DATE '2026-06-30', 'active'),
  (state.move_lease, 1, DATE '2026-08-01', DATE '2027-12-31', 'draft'),
  (state.scheduled_lease, 1, state.fixture_utc_date - 60, state.fixture_utc_date + 400, 'active'),
  (state.rejected_scheduled_lease, 1, state.fixture_utc_date - 60, state.fixture_utc_date + 400, 'active'),
  (state.west_to_east_lease, 1, DATE '2026-08-01', DATE '2026-12-31', 'active'),
  (state.east_to_west_lease, 1, DATE '2026-08-01', DATE '2026-12-31', 'active'),
  (state.authority_gap_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.unsupported_false_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.legacy_snapshot_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.incomplete_false_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.complete_unused_legacy_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.complete_prior_billed_legacy_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active'),
  (state.complete_current_billed_legacy_lease, 1,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_month_start + interval '4 months - 1 day', 'active')
) AS fixture(lease_id, sequence, start_date, end_date, status);

INSERT INTO public.lease_billing_terms(
  id, organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  charge_management_fee_when_active, full_management_fee_during_proration,
  billing_recipient_kind, billing_recipient_person_id,
  first_period_prorated_amount, final_period_prorated_amount,
  rent_calculation_timezone, short_month_due_day_rule,
  lease_start_proration_rule, lease_end_proration_rule,
  mid_period_rent_change_rule, charge_through_lease_end, rule_source,
  confirmed_at, confirmed_by, created_by, updated_by
)
SELECT fixture.rule_id, state.organization_id, fixture.lease_id,
  fixture.property_id, fixture.effective_from, fixture.effective_to,
  fixture.route, 'flat', 310, true, fixture.keep_full, 'company',
  fixture.recipient_id, fixture.first_override, NULL, fixture.timezone,
  'last_calendar_day', 'actual_days', 'actual_days', 'next_full_month', true,
  'lease_default_v1', now(), state.admin_id, state.admin_id, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  ('96000000-0000-0000-0000-000000000101'::uuid, state.proration_lease, state.property_a, DATE '2026-01-01', DATE '2026-12-31', 'through_ips', false, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000102'::uuid, state.full_fee_lease, state.property_a, DATE '2026-01-01', DATE '2026-12-31', 'through_ips', true, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000103'::uuid, state.override_fee_lease, state.property_a, DATE '2026-01-01', DATE '2026-12-31', 'through_ips', false, state.company_id, 1550::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000104'::uuid, state.move_lease, state.property_a, DATE '2026-08-01', DATE '2027-12-31', 'direct_to_owner', false, state.owner_a, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000105'::uuid, state.scheduled_lease, state.property_c, state.fixture_utc_date - 60, state.fixture_utc_date + 400, 'through_ips', false, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000106'::uuid, state.rejected_scheduled_lease, state.property_b, state.fixture_utc_date - 60, state.fixture_utc_date + 400, 'through_ips', false, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000107'::uuid, state.west_to_east_lease, state.property_a, DATE '2026-08-01', DATE '2026-08-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Kiritimati'),
  ('96000000-0000-0000-0000-000000000108'::uuid, state.west_to_east_lease, state.property_a, DATE '2026-09-01', DATE '2026-12-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Honolulu'),
  ('96000000-0000-0000-0000-000000000109'::uuid, state.east_to_west_lease, state.property_a, DATE '2026-08-01', DATE '2026-08-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Honolulu'),
  ('96000000-0000-0000-0000-000000000110'::uuid, state.east_to_west_lease, state.property_a, DATE '2026-09-01', DATE '2026-12-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Kiritimati'),
  ('96000000-0000-0000-0000-000000000111'::uuid, state.authority_gap_lease, state.property_a,
    state.fixture_lease_month_start - interval '1 month',
    state.fixture_lease_date - 1, 'through_ips', false, state.company_id,
    NULL::numeric, 'Pacific/Kiritimati'),
  ('96000000-0000-0000-0000-000000000112'::uuid, state.authority_gap_lease, state.property_a,
    state.fixture_lease_date + 1,
    state.fixture_lease_month_start + interval '4 months - 1 day',
    'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Kiritimati')
) AS fixture(rule_id, lease_id, property_id, effective_from, effective_to,
  route, keep_full, recipient_id, first_override, timezone);

INSERT INTO public.lease_billing_terms(
  id, organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  charge_management_fee_when_active, full_management_fee_during_proration,
  billing_recipient_kind, billing_recipient_person_id,
  first_period_prorated_amount, final_period_prorated_amount,
  rent_calculation_timezone, short_month_due_day_rule,
  lease_start_proration_rule, lease_end_proration_rule,
  mid_period_rent_change_rule, charge_through_lease_end, rule_source,
  confirmed_at, confirmed_by, created_by, updated_by
)
SELECT
  '96000000-0000-0000-0000-000000000113'::uuid, state.organization_id,
  state.unsupported_false_lease, state.property_a,
  state.fixture_lease_month_start - interval '1 month',
  state.fixture_lease_month_start + interval '4 months - 1 day',
  'through_ips', 'flat', 310, true, false, 'company', state.company_id,
  NULL::numeric, NULL::numeric, 'Pacific/Kiritimati', 'last_calendar_day', 'actual_days',
  'actual_days', 'next_full_month', false, 'lease_default_v1',
  now(), state.admin_id, state.admin_id, state.admin_id
FROM review_state AS state
UNION ALL
SELECT
  '96000000-0000-0000-0000-000000000114'::uuid, state.organization_id,
  state.legacy_snapshot_lease, state.property_a,
  state.fixture_lease_month_start - interval '1 month',
  state.fixture_lease_month_start + interval '4 months - 1 day',
  NULL::text, NULL::text, NULL::numeric, false, false, NULL::text, NULL::uuid,
  NULL::numeric, NULL::numeric, 'Pacific/Kiritimati', 'last_calendar_day', 'actual_days',
  'actual_days', 'next_full_month', true, 'historical_policy_snapshot',
  now(), state.admin_id, state.admin_id, state.admin_id
FROM review_state AS state
UNION ALL
SELECT
  '96000000-0000-0000-0000-000000000115'::uuid, state.organization_id,
  state.incomplete_false_lease, state.property_a,
  state.fixture_lease_month_start - interval '1 month',
  state.fixture_lease_month_start + interval '4 months - 1 day',
  NULL::text, NULL::text, NULL::numeric, false, false, NULL::text, NULL::uuid,
  NULL::numeric, NULL::numeric, 'Pacific/Kiritimati', 'last_calendar_day', 'actual_days',
  'actual_days', 'next_full_month', false, 'lease_default_v1',
  now(), state.admin_id, state.admin_id, state.admin_id
FROM review_state AS state
UNION ALL
SELECT
  fixture.rule_id, state.organization_id, fixture.lease_id, state.property_a,
  state.fixture_lease_month_start - interval '1 month',
  state.fixture_lease_month_start + interval '4 months - 1 day',
  'through_ips', 'flat', 310, true, false, 'company', state.company_id,
  NULL::numeric, NULL::numeric, 'Pacific/Kiritimati', 'last_calendar_day',
  'actual_days', 'actual_days', 'next_full_month', true, fixture.rule_source,
  now(), state.admin_id, state.admin_id, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  ('96000000-0000-0000-0000-000000000116'::uuid,
    state.complete_unused_legacy_lease, 'historical_policy_snapshot'),
  ('96000000-0000-0000-0000-000000000117'::uuid,
    state.complete_prior_billed_legacy_lease, 'historical_policy_snapshot'),
  ('96000000-0000-0000-0000-000000000118'::uuid,
    state.complete_current_billed_legacy_lease, 'unresolved_history')
) AS fixture(rule_id, lease_id, rule_source);

INSERT INTO public.tenant_invoices(
  id, organization_id, invoice_number, property_id, unit_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, currency, total_amount, lifecycle,
  management_fee_mode, management_fee_value, management_fee_amount,
  created_by
)
SELECT
  fixture.invoice_id, state.organization_id, fixture.invoice_number,
  state.property_a, state.unit_a, fixture.lease_id, fixture.rule_id,
  fixture.period_start,
  (fixture.period_start + interval '1 month - 1 day')::date,
  fixture.period_start, fixture.period_start, 'through_ips', 'company',
  state.company_id, 'Billing Company', 'USD', 3100, 'issued', 'flat', 310,
  310, state.admin_id
FROM review_state AS state
CROSS JOIN LATERAL (VALUES
  ('96000000-0000-0000-0000-000000000201'::uuid, 'LEGACY-PRIOR',
    state.complete_prior_billed_legacy_lease,
    '96000000-0000-0000-0000-000000000117'::uuid,
    (state.fixture_lease_month_start - interval '1 month')::date),
  ('96000000-0000-0000-0000-000000000202'::uuid, 'LEGACY-CURRENT',
    state.complete_current_billed_legacy_lease,
    '96000000-0000-0000-0000-000000000118'::uuid,
    state.fixture_lease_month_start)
) AS fixture(invoice_id, invoice_number, lease_id, rule_id, period_start);

SET LOCAL session_replication_role = origin;

CREATE OR REPLACE FUNCTION pg_temp.capture_billing_save_sqlstate(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_rule jsonb,
  p_expected_rule_id uuid,
  p_idempotency_key text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM public.save_lease_billing_rules(
      p_organization_id,
      p_lease_id,
      p_billing_rule,
      p_expected_rule_id,
      p_idempotency_key
    );
    RAISE EXCEPTION 'pg_temp_expected_rollback';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    IF v_message = 'pg_temp_expected_rollback' THEN
      RETURN 'no_error';
    END IF;
    RETURN v_state;
  END;
END;
$$;

SELECT throws_ok(
  format(
    $q$SELECT app_private.normalize_lease_billing_rule(%L,%L,%L,%L::jsonb)$q$,
    organization_id,
    unsupported_false_lease,
    fixture_lease_date,
    pg_temp.billing_rule(
      company_id, 'through_ips', 'flat', 310, false, 'Pacific/Kiritimati',
      NULL, NULL, false
    )
  ),
  '22023',
  NULL,
  'normalization rejects the unsupported stop-before-lease-end snapshot'
) FROM review_state;

UPDATE review_state AS state
SET unsupported_current_result = app_private.try_current_month_rent(
  state.organization_id,
  state.unsupported_false_lease,
  'scheduled',
  state.fixture_clock
);

SELECT is(
  pg_catalog.jsonb_build_array(
    unsupported_current_result ->> 'status',
    unsupported_current_result ->> 'code'
  ),
  pg_catalog.jsonb_build_array('failed', 'billing_setup_missing'),
  'current exact-rule generation fails closed for a persisted false snapshot'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id),
      count(DISTINCT exception.id) FILTER (
        WHERE exception.error_code = 'billing_setup_missing'
          AND exception.resolved_at IS NULL
          AND exception.attempt_count = 1
      )
    )
    FROM review_state AS state
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.unsupported_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.unsupported_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.unsupported_false_lease
    LEFT JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.unsupported_false_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
  ),
  pg_catalog.jsonb_build_array(0, 0, 0, 1),
  'unsupported current generation records one reviewable exception and no finance writes'
);

UPDATE review_state AS state
SET unsupported_manual_result = app_private.try_generate_lease_rent_invoice(
  state.organization_id,
  state.unsupported_false_lease,
  state.fixture_lease_month_start,
  state.fixture_lease_date,
  'manual_recovery',
  state.admin_id
);

SELECT is(
  pg_catalog.jsonb_build_array(
    unsupported_manual_result ->> 'status',
    unsupported_manual_result ->> 'code'
  ),
  pg_catalog.jsonb_build_array('failed', 'billing_setup_missing'),
  'general historical-recovery overload also fails closed for false authority'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      exception.attempt_count,
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id)
    )
    FROM review_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.unsupported_false_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.unsupported_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.unsupported_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.unsupported_false_lease
    GROUP BY exception.attempt_count
  ),
  pg_catalog.jsonb_build_array(2, 0, 0, 0),
  'manual retry increments the same unresolved exception without partial finance writes'
);

UPDATE review_state AS state
SET incomplete_current_result = app_private.try_current_month_rent(
  state.organization_id,
  state.incomplete_false_lease,
  'scheduled',
  state.fixture_clock
);

SELECT is(
  pg_catalog.jsonb_build_array(
    incomplete_current_result ->> 'status',
    incomplete_current_result ->> 'code'
  ),
  pg_catalog.jsonb_build_array('failed', 'billing_setup_missing'),
  'current exact-rule generation fails closed before incomplete-rule fallback'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id),
      count(DISTINCT exception.id) FILTER (
        WHERE exception.error_code = 'billing_setup_missing'
          AND exception.resolved_at IS NULL
          AND exception.attempt_count = 1
      )
    )
    FROM review_state AS state
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.incomplete_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.incomplete_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.incomplete_false_lease
    LEFT JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.incomplete_false_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
  ),
  pg_catalog.jsonb_build_array(0, 0, 0, 1),
  'incomplete false current generation records an exception and no finance writes'
);

UPDATE review_state AS state
SET incomplete_manual_result = app_private.try_generate_lease_rent_invoice(
  state.organization_id,
  state.incomplete_false_lease,
  state.fixture_lease_month_start,
  state.fixture_lease_date,
  'manual_recovery',
  state.admin_id
);

SELECT is(
  pg_catalog.jsonb_build_array(
    incomplete_manual_result ->> 'status',
    incomplete_manual_result ->> 'code'
  ),
  pg_catalog.jsonb_build_array('failed', 'billing_setup_missing'),
  'general manual generation fails closed before incomplete-rule fallback'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      exception.attempt_count,
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id)
    )
    FROM review_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.incomplete_false_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.incomplete_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.incomplete_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.incomplete_false_lease
    GROUP BY exception.attempt_count
  ),
  pg_catalog.jsonb_build_array(2, 0, 0, 0),
  'incomplete false manual retry increments the exception without finance writes'
);

SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM review_state), true);
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_billing_save_sqlstate(
    organization_id,
    legacy_snapshot_lease,
    pg_temp.billing_rule(company_id, p_timezone => 'Pacific/Kiritimati'),
    NULL,
    'legacy-snapshot-null-token'
  ),
  '40001',
  'a legacy snapshot repair rejects a missing concurrency token'
) FROM review_state;

SELECT is(
  pg_temp.capture_billing_save_sqlstate(
    organization_id,
    legacy_snapshot_lease,
    pg_temp.billing_rule(company_id, p_timezone => 'Pacific/Kiritimati'),
    '96000000-0000-0000-0000-000000000199',
    'legacy-snapshot-stale-token'
  ),
  '40001',
  'a legacy snapshot repair rejects a stale concurrency token'
) FROM review_state;

UPDATE review_state AS state
SET legacy_repair_result = public.save_lease_billing_rules(
  state.organization_id,
  state.legacy_snapshot_lease,
  pg_temp.billing_rule(state.company_id, p_timezone => 'Pacific/Kiritimati'),
  '96000000-0000-0000-0000-000000000114',
  'legacy-snapshot-correct-token'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      legacy_repair_result ->> 'mode',
      legacy_repair_result ->> 'billingTermId',
      billing.rule_source,
      billing.charge_through_lease_end
    )
    FROM review_state AS state
    JOIN public.lease_billing_terms AS billing
      ON billing.organization_id = state.organization_id
     AND billing.id = '96000000-0000-0000-0000-000000000114'
  ),
  pg_catalog.jsonb_build_array(
    'repair', '96000000-0000-0000-0000-000000000114',
    'lease_default_v1', true
  ),
  'the exact legacy token repairs the same row into explicit Lease authority'
);

UPDATE review_state AS state
SET unused_legacy_repair_result = public.save_lease_billing_rules(
  state.organization_id,
  state.complete_unused_legacy_lease,
  pg_temp.billing_rule(state.company_id, p_timezone => 'Pacific/Kiritimati'),
  '96000000-0000-0000-0000-000000000116',
  'complete-unused-legacy-repair'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      state.unused_legacy_repair_result ->> 'mode',
      state.unused_legacy_repair_result ->> 'billingTermId',
      billing.rule_source,
      billing.effective_from
    )
    FROM review_state AS state
    JOIN public.lease_billing_terms AS billing
      ON billing.organization_id = state.organization_id
     AND billing.id = '96000000-0000-0000-0000-000000000116'
  ),
  (
    SELECT pg_catalog.jsonb_build_array(
      'repair',
      '96000000-0000-0000-0000-000000000116',
      'lease_default_v1',
      (fixture_lease_month_start - interval '1 month')::date
    )
    FROM review_state
  ),
  'an unused complete legacy row repairs in place into current Lease authority'
);

UPDATE review_state AS state
SET prior_billed_legacy_repair_result = public.save_lease_billing_rules(
  state.organization_id,
  state.complete_prior_billed_legacy_lease,
  pg_temp.billing_rule(state.company_id, p_timezone => 'Pacific/Kiritimati'),
  '96000000-0000-0000-0000-000000000117',
  'complete-prior-billed-legacy-repair'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      state.prior_billed_legacy_repair_result ->> 'mode',
      successor.rule_source,
      successor.effective_from,
      legacy.rule_source,
      legacy.effective_to
    )
    FROM review_state AS state
    JOIN public.lease_billing_terms AS successor
      ON successor.organization_id = state.organization_id
     AND successor.id = (
       state.prior_billed_legacy_repair_result ->> 'billingTermId'
     )::uuid
    JOIN public.lease_billing_terms AS legacy
      ON legacy.organization_id = state.organization_id
     AND legacy.id = '96000000-0000-0000-0000-000000000117'
  ),
  (
    SELECT pg_catalog.jsonb_build_array(
      'scheduled_replacement', 'lease_default_v1',
      fixture_lease_month_start, 'historical_policy_snapshot',
      fixture_lease_month_start - 1
    )
    FROM review_state
  ),
  'used prior-month legacy authority is preserved with a successor in the current unbilled month'
);

SELECT is(
  (
    SELECT invoice.billing_term_id
    FROM review_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.id = '96000000-0000-0000-0000-000000000201'
  ),
  '96000000-0000-0000-0000-000000000117'::uuid,
  'prior issued legacy evidence retains its immutable billing-rule lineage'
);

UPDATE review_state AS state
SET current_billed_legacy_repair_result = public.save_lease_billing_rules(
  state.organization_id,
  state.complete_current_billed_legacy_lease,
  pg_temp.billing_rule(state.company_id, p_timezone => 'Pacific/Kiritimati'),
  '96000000-0000-0000-0000-000000000118',
  'complete-current-billed-legacy-repair'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      state.current_billed_legacy_repair_result ->> 'mode',
      successor.rule_source,
      successor.effective_from,
      legacy.rule_source,
      legacy.effective_to
    )
    FROM review_state AS state
    JOIN public.lease_billing_terms AS successor
      ON successor.organization_id = state.organization_id
     AND successor.id = (
       state.current_billed_legacy_repair_result ->> 'billingTermId'
     )::uuid
    JOIN public.lease_billing_terms AS legacy
      ON legacy.organization_id = state.organization_id
     AND legacy.id = '96000000-0000-0000-0000-000000000118'
  ),
  (
    SELECT pg_catalog.jsonb_build_array(
      'scheduled_replacement', 'lease_default_v1',
      (fixture_lease_month_start + interval '1 month')::date,
      'unresolved_history',
      (fixture_lease_month_start + interval '1 month - 1 day')::date
    )
    FROM review_state
  ),
  'used current-month legacy authority preserves evidence and starts its successor next month'
);

SELECT is(
  (
    SELECT invoice.billing_term_id
    FROM review_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.id = '96000000-0000-0000-0000-000000000202'
  ),
  '96000000-0000-0000-0000-000000000118'::uuid,
  'current issued legacy evidence retains its immutable billing-rule lineage'
);

SELECT is(
  pg_temp.capture_billing_save_sqlstate(
    organization_id,
    unsupported_false_lease,
    pg_temp.billing_rule(
      company_id, 'through_ips', 'flat', 310, false, 'Pacific/Kiritimati',
      NULL, NULL, false
    ),
    '96000000-0000-0000-0000-000000000113',
    'unsupported-false-save'
  ),
  '22023',
  'save authority rejects an unsupported false snapshot before mutation'
) FROM review_state;

UPDATE review_state AS state
SET unsupported_repair_result = public.save_lease_billing_rules(
  state.organization_id,
  state.unsupported_false_lease,
  pg_temp.billing_rule(state.company_id, p_timezone => 'Pacific/Kiritimati'),
  '96000000-0000-0000-0000-000000000113',
  'unsupported-false-repair'
);

RESET ROLE;

UPDATE review_state AS state
SET unused_legacy_generation_result = app_private.try_current_month_rent(
  state.organization_id,
  state.complete_unused_legacy_lease,
  'scheduled',
  state.fixture_clock
),
prior_billed_legacy_generation_result = app_private.try_current_month_rent(
  state.organization_id,
  state.complete_prior_billed_legacy_lease,
  'scheduled',
  state.fixture_clock
);

SELECT is(
  pg_catalog.jsonb_build_array(
    unused_legacy_generation_result ->> 'status',
    prior_billed_legacy_generation_result ->> 'status'
  ),
  pg_catalog.jsonb_build_array('generated', 'generated'),
  'current generation succeeds after both unused and prior-billed legacy repairs'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        invoice.lease_id,
        invoice.billing_period_start,
        invoice.billing_term_id
      ) ORDER BY invoice.lease_id
    )
    FROM review_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id IN (
       state.complete_unused_legacy_lease,
       state.complete_prior_billed_legacy_lease
     )
     AND invoice.billing_period_start = state.fixture_lease_month_start
  ),
  (
    SELECT pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array(
        complete_unused_legacy_lease,
        fixture_lease_month_start,
        '96000000-0000-0000-0000-000000000116'::uuid
      ),
      pg_catalog.jsonb_build_array(
        complete_prior_billed_legacy_lease,
        fixture_lease_month_start,
        (prior_billed_legacy_repair_result ->> 'billingTermId')::uuid
      )
    )
    FROM review_state
  ),
  'current invoices use the repaired row and earliest-unbilled successor respectively'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)
    FROM review_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.complete_current_billed_legacy_lease
     AND invoice.billing_period_start = state.fixture_lease_month_start
  ),
  1::bigint,
  'a current-month legacy invoice remains the sole invoice for its covered month'
);

SELECT is(
  pg_catalog.jsonb_build_array(
    unsupported_repair_result ->> 'mode',
    unsupported_repair_result ->> 'billingTermId'
  ),
  pg_catalog.jsonb_build_array(
    'repair', '96000000-0000-0000-0000-000000000113'
  ),
  'a persisted false row is repaired in place when the exact token submits true'
) FROM review_state;

UPDATE review_state AS state
SET supported_retry_result = app_private.try_current_month_rent(
  state.organization_id,
  state.unsupported_false_lease,
  'scheduled',
  state.fixture_clock
);

SELECT is(
  supported_retry_result ->> 'status',
  'generated',
  'current rent generates after the unsupported row is repaired to true'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id),
      count(DISTINCT exception.id) FILTER (
        WHERE exception.resolved_at IS NOT NULL
          AND exception.resolved_invoice_id = invoice.id
      )
    )
    FROM review_state AS state
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.unsupported_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.unsupported_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.unsupported_false_lease
    LEFT JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.unsupported_false_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
  ),
  pg_catalog.jsonb_build_array(1, 1, 1, 1),
  'repair retry creates one complete finance chain and resolves the exception once'
);

UPDATE public.lease_billing_terms
SET charge_through_lease_end = false
WHERE id = '96000000-0000-0000-0000-000000000113';

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      app_private.try_generate_lease_rent_invoice(
        state.organization_id,
        state.unsupported_false_lease,
        state.fixture_lease_month_start,
        state.fixture_lease_date,
        'manual_recovery',
        state.admin_id
      ) ->> 'status',
      count(DISTINCT invoice.id),
      count(DISTINCT income.id),
      count(DISTINCT fee.id)
    )
    FROM review_state AS state
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.unsupported_false_lease
    LEFT JOIN public.finance_income_items AS income
      ON income.organization_id = state.organization_id
     AND income.lease_id = state.unsupported_false_lease
    LEFT JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = state.organization_id
     AND fee.lease_id = state.unsupported_false_lease
    GROUP BY state.organization_id, state.unsupported_false_lease,
      state.fixture_lease_month_start, state.fixture_lease_date, state.admin_id
  ),
  pg_catalog.jsonb_build_array('generated', 1, 1, 1),
  'an issued invoice still replays idempotently if its historical rule is later false'
);

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, proration_lease,
    DATE '2026-02-01', DATE '2026-02-10', 'manual_recovery', admin_id)->>'status'),
  'generated', '28-day same-month rent generates'
) FROM review_state;
SELECT is(
  (SELECT jsonb_build_array(invoice.total_amount, invoice.management_fee_amount)
   FROM public.tenant_invoices invoice WHERE invoice.lease_id = state.proration_lease
     AND invoice.billing_period_start = DATE '2026-02-01'),
  jsonb_build_array(1217.86, 121.79),
  '28-day same-month rent and flat fee use the bounded occupied-day ratio'
) FROM review_state state;

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, proration_lease,
    DATE '2026-02-01', DATE '2026-02-10', 'manual_recovery', admin_id)->>'status'),
  'generated', 'same-period generation replay returns the issued invoice'
) FROM review_state;
SELECT is(
  (SELECT jsonb_build_array(count(DISTINCT invoice.id), count(fee.id))
   FROM public.tenant_invoices invoice
   LEFT JOIN public.management_fee_occurrences fee
     ON fee.organization_id=invoice.organization_id
    AND fee.tenant_invoice_id=invoice.id
   WHERE invoice.lease_id=state.proration_lease
     AND invoice.billing_period_start=DATE '2026-02-01'),
  jsonb_build_array(1, 1),
  'same-period replay does not duplicate rent or its management fee'
) FROM review_state state;

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, proration_lease,
    DATE '2026-04-01', DATE '2026-04-10', 'manual_recovery', admin_id)->>'status'),
  'generated', '30-day same-month rent generates'
) FROM review_state;
SELECT is(
  (SELECT jsonb_build_array(invoice.total_amount, invoice.management_fee_amount)
   FROM public.tenant_invoices invoice WHERE invoice.lease_id = state.proration_lease
     AND invoice.billing_period_start = DATE '2026-04-01'),
  jsonb_build_array(1136.67, 113.67),
  '30-day same-month rent and flat fee use the bounded occupied-day ratio'
) FROM review_state state;

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, proration_lease,
    DATE '2026-05-01', DATE '2026-05-10', 'manual_recovery', admin_id)->>'status'),
  'generated', '31-day same-month rent generates'
) FROM review_state;
SELECT is(
  (SELECT jsonb_build_array(invoice.total_amount, invoice.management_fee_amount)
   FROM public.tenant_invoices invoice WHERE invoice.lease_id = state.proration_lease
     AND invoice.billing_period_start = DATE '2026-05-01'),
  jsonb_build_array(1100, 110),
  '31-day same-month rent and flat fee use the bounded occupied-day ratio'
) FROM review_state state;

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, full_fee_lease,
    DATE '2026-05-01', DATE '2026-05-10', 'manual_recovery', admin_id)->>'status'),
  'generated', 'keep-full flat-fee rent generates'
) FROM review_state;
SELECT is(
  (SELECT invoice.management_fee_amount FROM public.tenant_invoices invoice
   WHERE invoice.lease_id = state.full_fee_lease),
  310.00::numeric, 'keep-full-fee=true preserves the full flat fee'
) FROM review_state state;

SELECT is(
  (app_private.try_generate_lease_rent_invoice(organization_id, override_fee_lease,
    DATE '2026-06-01', DATE '2026-06-10', 'manual_recovery', admin_id)->>'status'),
  'generated', 'explicit proration override rent generates'
) FROM review_state;
SELECT is(
  (SELECT jsonb_build_array(invoice.total_amount, invoice.management_fee_amount)
   FROM public.tenant_invoices invoice WHERE invoice.lease_id = state.override_fee_lease),
  jsonb_build_array(1550, 155),
  'flat fee prorates by override rent divided by full-period rent'
) FROM review_state state;

SELECT throws_ok(
  format($q$SELECT app_private.normalize_lease_billing_rule(%L,%L,DATE '2026-08-01',%L::jsonb)$q$,
    organization_id, move_lease,
    pg_temp.billing_rule(owner_a, 'direct_to_owner') || '{"firstPeriodProratedAmount":0}'::jsonb),
  '22023', NULL, 'SQL normalization rejects a non-null zero proration override'
) FROM review_state;

SELECT throws_ok(
  format($q$UPDATE public.lease_billing_terms SET first_period_prorated_amount=0 WHERE id=%L$q$,
    '96000000-0000-0000-0000-000000000104'),
  '23514', NULL, 'the forward constraint rejects direct zero override writes'
);

SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM review_state), true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format($q$SELECT public.update_lease_with_billing_rules(%L,%L,%L,%L,%L,DATE '2026-08-01',DATE '2027-12-31',3100,'USD',1,'monthly','draft',0,'USD','draft',%L::jsonb,'move-owner-a')$q$,
    move_lease, organization_id, property_b, unit_b, tenant_id,
    pg_temp.billing_rule(owner_a, 'direct_to_owner')),
  '23514', NULL, 'draft A-to-B move rejects an owner valid only for property A before mutation'
) FROM review_state;

SELECT is(
  (SELECT jsonb_build_array(lease.property_id, lease.unit_id, billing.property_id)
   FROM public.leases lease JOIN public.lease_billing_terms billing
     ON billing.organization_id=lease.organization_id AND billing.lease_id=lease.id
   WHERE lease.id=state.move_lease),
  jsonb_build_array(property_a, unit_a, property_a),
  'rejected destination billing leaves Lease and billing authority unchanged'
) FROM review_state state;

SELECT throws_ok(
  format($q$SELECT public.update_lease_with_billing_rules(%L,%L,%L,%L,%L,%L::date,DATE '2027-12-31',3100,'USD',1,'monthly','draft',0,'USD','draft',%L::jsonb,'move-owner-b')$q$,
    move_lease, organization_id, property_b, unit_b, tenant_id,
    owner_b_started_on,
    pg_temp.billing_rule(owner_b, 'direct_to_owner')),
  '55000', NULL,
  'destination-valid owner reaches the unchanged checked occupancy-transition guard'
) FROM review_state;

SELECT lives_ok(
  format($q$SELECT public.save_lease_billing_rules(%L,%L,%L::jsonb,%L,'schedule-owner-on-effective-date')$q$,
    organization_id, scheduled_lease,
    pg_temp.billing_rule(owner_c, 'direct_to_owner'),
    '96000000-0000-0000-0000-000000000105'),
  'scheduled direct-to-owner validation uses the replacement effective date'
) FROM review_state;

SELECT throws_ok(
  format($q$SELECT public.save_lease_billing_rules(%L,%L,%L::jsonb,%L,'reject-owner-after-effective-date')$q$,
    organization_id, rejected_scheduled_lease,
    pg_temp.billing_rule(owner_b, 'direct_to_owner'),
    '96000000-0000-0000-0000-000000000106'),
  '23514', NULL,
  'scheduled direct-to-owner rejects an owner beginning after replacement effectiveness'
) FROM review_state;

SELECT is(
  (SELECT jsonb_build_array(count(*), min(billing.effective_from), max(billing.effective_to))
   FROM public.lease_billing_terms billing
   WHERE billing.lease_id=state.rejected_scheduled_lease),
  jsonb_build_array(1, fixture_utc_date - 60, fixture_utc_date + 400),
  'rejected scheduled ownership validation leaves the current rule unmutated'
) FROM review_state state;

RESET ROLE;

UPDATE review_state AS state
SET west_result = app_private.try_current_month_rent(
  state.organization_id, state.west_to_east_lease, 'scheduled',
  TIMESTAMPTZ '2026-08-31 10:30:00+00'
);

SELECT is(
  (SELECT jsonb_build_array(invoice.billing_period_start, invoice.billing_term_id)
   FROM review_state state
   JOIN public.tenant_invoices invoice
     ON invoice.id=(state.west_result->>'invoiceId')::uuid),
  jsonb_build_array(DATE '2026-09-01', '96000000-0000-0000-0000-000000000108'::uuid),
  'predecessor Kiritimati owns the boundary and successor Honolulu clamps to September'
) FROM review_state;

UPDATE review_state AS state
SET east_result = app_private.try_current_month_rent(
  state.organization_id, state.east_to_west_lease, 'scheduled',
  TIMESTAMPTZ '2026-08-31 10:30:00+00'
);

SELECT is(
  (SELECT jsonb_build_array(invoice.billing_period_start, invoice.billing_term_id)
   FROM review_state state
   JOIN public.tenant_invoices invoice
     ON invoice.id=(state.east_result->>'invoiceId')::uuid),
  jsonb_build_array(DATE '2026-08-01', '96000000-0000-0000-0000-000000000109'::uuid),
  'predecessor Honolulu prevents successor Kiritimati from taking the boundary early'
) FROM review_state;

UPDATE review_state AS state
SET gap_result = app_private.try_current_month_rent(
  state.organization_id, state.authority_gap_lease, 'scheduled',
  state.fixture_clock
);

SELECT is(
  jsonb_build_array(gap_result ->> 'status', gap_result ->> 'code'),
  jsonb_build_array('failed', 'billing_setup_missing'),
  'current rent fails closed when no billing rule owns the resolved business date'
) FROM review_state;

SELECT is(
  (SELECT pg_catalog.count(*)
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.authority_gap_lease),
  0::bigint,
  'an authority gap cannot issue a stale-predecessor Rent invoice'
) FROM review_state AS state;

UPDATE public.organization_members AS membership
SET role = 'finance_manager'
FROM review_state AS state
WHERE membership.organization_id = state.organization_id
  AND membership.user_id = state.admin_id;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM review_state),
  true
);
SET LOCAL ROLE authenticated;

WITH retry AS MATERIALIZED (
  SELECT public.recover_rent_generation_exception(
    state.organization_id,
    exception.id
  ) AS result
  FROM review_state AS state
  JOIN public.rent_generation_exceptions AS exception
    ON exception.organization_id = state.organization_id
   AND exception.lease_id = state.authority_gap_lease
   AND exception.billing_period_start = state.fixture_lease_month_start
)
SELECT is(
  pg_catalog.jsonb_build_array(result ->> 'status', result ->> 'code'),
  pg_catalog.jsonb_build_array('failed', 'billing_setup_missing'),
  'Finance Manager retry preserves the current-period authority-gap failure'
) FROM retry;

RESET ROLE;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      exception.resolved_at IS NULL,
      pg_catalog.count(invoice.id)
    )
    FROM review_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.authority_gap_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
    LEFT JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.lease_id = state.authority_gap_lease
    GROUP BY exception.resolved_at
  ),
  pg_catalog.jsonb_build_array(true, 0),
  'Finance Manager retry leaves the gap exception unresolved and issues no invoice'
) FROM review_state;

UPDATE public.lease_billing_terms AS billing
SET archived_at = pg_catalog.now()
FROM review_state AS state
WHERE billing.organization_id = state.organization_id
  AND billing.id = '96000000-0000-0000-0000-000000000112';

UPDATE public.lease_billing_terms AS billing
SET effective_to = state.fixture_lease_month_start + interval '4 months - 1 day'
FROM review_state AS state
WHERE billing.organization_id = state.organization_id
  AND billing.id = '96000000-0000-0000-0000-000000000111';

CREATE OR REPLACE FUNCTION app_private.rent_business_date(
  p_organization_id uuid,
  p_clock timestamptz DEFAULT pg_catalog.now()
) RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    pg_catalog.date_trunc(
      'month', p_clock AT TIME ZONE 'Pacific/Kiritimati'
    ) AT TIME ZONE 'Pacific/Kiritimati'
      AT TIME ZONE 'Pacific/Honolulu'
  )::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_rent_recovery(
  p_organization_id uuid,
  p_exception_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.recover_rent_generation_exception(
    p_organization_id,
    p_exception_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'status', 'threw',
    'code', SQLSTATE,
    'message', SQLERRM
  );
END;
$$;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      pg_catalog.date_trunc(
        'month', app_private.rent_business_date(
          state.organization_id, state.fixture_clock
        )::timestamp
      )::date,
      pg_catalog.date_trunc('month', resolved.business_date::timestamp)::date,
      resolved.billing_term_id
    )
    FROM review_state AS state
    CROSS JOIN LATERAL app_private.resolve_lease_billing_clock(
      state.organization_id,
      state.authority_gap_lease,
      state.fixture_clock
    ) AS resolved
  ),
  (
    SELECT pg_catalog.jsonb_build_array(
      (fixture_lease_month_start - interval '1 month')::date,
      fixture_lease_month_start,
      '96000000-0000-0000-0000-000000000111'::uuid
    )
    FROM review_state
  ),
  'opposing organization timezone is one month behind exact Lease authority at rollover'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM review_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE review_state AS state
SET rollover_result = pg_temp.capture_rent_recovery(
  state.organization_id,
  exception.id
)
FROM public.rent_generation_exceptions AS exception
WHERE exception.organization_id = state.organization_id
  AND exception.lease_id = state.authority_gap_lease
  AND exception.billing_period_start = state.fixture_lease_month_start;

RESET ROLE;

SELECT is(
  pg_catalog.jsonb_build_array(
    rollover_result ->> 'status',
    rollover_result ->> 'code'
  ),
  pg_catalog.jsonb_build_array('generated', NULL),
  'Finance Manager retry delegates adjacent-calendar validation to the Lease clock'
) FROM review_state;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      invoice.billing_term_id,
      exception.resolved_invoice_id = invoice.id,
      exception.resolved_at IS NOT NULL
    )
    FROM review_state AS state
    JOIN public.rent_generation_exceptions AS exception
      ON exception.organization_id = state.organization_id
     AND exception.lease_id = state.authority_gap_lease
     AND exception.billing_period_start = state.fixture_lease_month_start
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = state.organization_id
     AND invoice.id = exception.resolved_invoice_id
  ),
  pg_catalog.jsonb_build_array(
    '96000000-0000-0000-0000-000000000111'::uuid,
    true,
    true
  ),
  'adjacent-calendar retry issues and resolves through the exact Lease rule'
) FROM review_state;

SELECT * FROM finish();
ROLLBACK;
