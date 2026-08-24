BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(23);

CREATE TEMP TABLE boundary_state (
  admin_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000003',
  unit_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000004',
  tenant_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000005',
  company_id uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000006',
  start_actual_lease uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000010',
  end_actual_lease uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000011',
  start_override_lease uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000012',
  end_override_lease uuid NOT NULL DEFAULT '97000000-0000-0000-0000-000000000013'
) ON COMMIT DROP;

INSERT INTO boundary_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id,
  'authenticated', 'authenticated', 'rent-boundary@example.test',
  extensions.crypt('rent-boundary', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM boundary_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Rent boundary', 'rent-boundary-9700', 'UTC'
FROM boundary_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM boundary_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, rental_structure, status
)
SELECT property_id, organization_id, 'Boundary Property', 'RBP',
  'apartment', 'multi_unit', 'active'
FROM boundary_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'B-1', 'vacant', 3100, 'USD'
FROM boundary_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT fixture.id, state.organization_id, fixture.name, fixture.kind
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'Boundary Tenant', 'individual'),
  (state.company_id, 'Boundary Company', 'company')
) AS fixture(id, name, kind);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT state.organization_id, fixture.id, fixture.role
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'tenant'),
  (state.company_id, 'owner')
) AS fixture(id, role);

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
)
SELECT organization_id, property_id, company_id, 'Primary owner',
  100, true, DATE '2025-01-01', admin_id, admin_id
FROM boundary_state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, deposit_amount, deposit_currency, created_by, updated_by
)
SELECT fixture.lease_id, state.organization_id, state.property_id, state.unit_id,
  state.tenant_id, 'active', 0, 'USD', state.admin_id, state.admin_id
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.start_actual_lease),
  (state.end_actual_lease),
  (state.start_override_lease),
  (state.end_override_lease)
) AS fixture(lease_id);

INSERT INTO public.lease_terms(
  organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
SELECT state.organization_id, fixture.lease_id, fixture.sequence,
  fixture.start_date, fixture.end_date, fixture.rent_amount,
  'USD', 1, 'monthly', fixture.status, 'authoritative',
  now(), state.admin_id, state.admin_id, state.admin_id
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.start_actual_lease, 1, DATE '2026-08-10', DATE '2026-08-19', 3100::numeric, 'active'),
  (state.start_actual_lease, 2, DATE '2026-08-20', DATE '2026-12-31', 3600::numeric, 'upcoming'),
  (state.end_actual_lease, 1, DATE '2026-05-01', DATE '2026-08-09', 3100::numeric, 'active'),
  (state.end_actual_lease, 2, DATE '2026-08-10', DATE '2026-08-20', 3600::numeric, 'upcoming'),
  (state.start_override_lease, 1, DATE '2026-08-10', DATE '2026-08-19', 3100::numeric, 'active'),
  (state.start_override_lease, 2, DATE '2026-08-20', DATE '2026-12-31', 3600::numeric, 'upcoming'),
  (state.end_override_lease, 1, DATE '2026-05-01', DATE '2026-08-09', 3100::numeric, 'active'),
  (state.end_override_lease, 2, DATE '2026-08-10', DATE '2026-08-20', 3600::numeric, 'upcoming')
) AS fixture(lease_id, sequence, start_date, end_date, rent_amount, status);

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
  state.property_id, DATE '2026-05-01', DATE '2026-12-31',
  'through_ips', fixture.fee_mode, fixture.fee_value, true,
  fixture.keep_full_fee, 'company', state.company_id,
  fixture.first_override, fixture.final_override, 'UTC',
  'last_calendar_day', 'actual_days', 'actual_days', 'next_full_month', true,
  'lease_default_v1', now(), state.admin_id, state.admin_id, state.admin_id
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  ('97000000-0000-0000-0000-000000000101'::uuid, state.start_actual_lease,
    'percentage', 10::numeric, false, NULL::numeric, NULL::numeric),
  ('97000000-0000-0000-0000-000000000102'::uuid, state.end_actual_lease,
    'flat', 310::numeric, false, NULL::numeric, NULL::numeric),
  ('97000000-0000-0000-0000-000000000103'::uuid, state.start_override_lease,
    'flat', 310::numeric, true, 1550::numeric, NULL::numeric),
  ('97000000-0000-0000-0000-000000000104'::uuid, state.end_override_lease,
    'percentage', 10::numeric, false, NULL::numeric, 1800::numeric)
) AS fixture(
  rule_id, lease_id, fee_mode, fee_value, keep_full_fee,
  first_override, final_override
);

SET LOCAL session_replication_role = origin;

SELECT is(
  app_private.try_generate_lease_rent_invoice(
    organization_id, start_actual_lease, DATE '2026-08-01', DATE '2026-08-10',
    'manual_recovery', admin_id
  ) ->> 'status',
  'generated',
  'start-boundary month with an intra-month rate change generates'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.base_rent_amount, invoice.total_amount, invoice.is_prorated,
      invoice.management_fee_amount
    )
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.start_actual_lease
     AND invoice.billing_period_start = DATE '2026-08-01'),
  jsonb_build_array(3100, 2200, true, 220),
  'start-boundary actual-days proration keeps the opening rate and prorates its percentage fee base'
) FROM boundary_state AS state;

SELECT results_eq(
  $$
    SELECT segment.amount, segment.proration_rule
    FROM public.tenant_invoice_rent_segments AS segment
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = segment.organization_id
     AND invoice.id = segment.invoice_id
    JOIN boundary_state AS state ON true
    WHERE invoice.lease_id = state.start_actual_lease
      AND invoice.billing_period_start = DATE '2026-08-01'
    ORDER BY segment.segment_order
  $$,
  $$ VALUES
    (2200::numeric, 'prorate_actual_days'::text),
    (0::numeric, 'next_full_period'::text)
  $$,
  'boundary proration is attributed to the opening segment while the rate change stays deferred'
);

SELECT is(
  app_private.try_generate_lease_rent_invoice(
    organization_id, end_actual_lease, DATE '2026-08-01', DATE '2026-08-01',
    'manual_recovery', admin_id
  ) ->> 'status',
  'generated',
  'end-boundary month with an intra-month rate change generates'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.base_rent_amount, invoice.total_amount, invoice.is_prorated,
      invoice.management_fee_amount
    )
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.end_actual_lease
     AND invoice.billing_period_start = DATE '2026-08-01'),
  jsonb_build_array(3100, 2000, true, 200),
  'end-boundary actual-days proration keeps the opening rate and prorates its flat fee'
) FROM boundary_state AS state;

SELECT is(
  app_private.try_generate_lease_rent_invoice(
    organization_id, start_override_lease, DATE '2026-08-01', DATE '2026-08-10',
    'manual_recovery', admin_id
  ) ->> 'status',
  'generated',
  'first-period override with an intra-month rate change generates'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.base_rent_amount, invoice.total_amount, invoice.is_prorated,
      invoice.management_fee_amount
    )
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.start_override_lease),
  jsonb_build_array(3100, 1550, true, 310),
  'explicit first-period override wins and keep-full preserves the full flat fee'
) FROM boundary_state AS state;

SELECT is(
  (SELECT segment.proration_rule
   FROM public.tenant_invoice_rent_segments AS segment
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = segment.organization_id
    AND invoice.id = segment.invoice_id
   WHERE invoice.lease_id = state.start_override_lease
   ORDER BY segment.segment_order
   LIMIT 1),
  'billing_override',
  'the opening segment records first-period override authority'
) FROM boundary_state AS state;

SELECT is(
  app_private.try_generate_lease_rent_invoice(
    organization_id, end_override_lease, DATE '2026-08-01', DATE '2026-08-01',
    'manual_recovery', admin_id
  ) ->> 'status',
  'generated',
  'final-period override with an intra-month rate change generates'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.base_rent_amount, invoice.total_amount, invoice.is_prorated,
      invoice.management_fee_amount
    )
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.end_override_lease),
  jsonb_build_array(3100, 1800, true, 180),
  'explicit final-period override wins and percentage fee uses the override rent base'
) FROM boundary_state AS state;

SELECT is(
  (SELECT segment.proration_rule
   FROM public.tenant_invoice_rent_segments AS segment
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = segment.organization_id
    AND invoice.id = segment.invoice_id
   WHERE invoice.lease_id = state.end_override_lease
   ORDER BY segment.segment_order
   LIMIT 1),
  'billing_override',
  'the opening segment records final-period override authority'
) FROM boundary_state AS state;

SELECT is(
  app_private.try_generate_lease_rent_invoice(
    organization_id, start_actual_lease, DATE '2026-09-01', DATE '2026-09-01',
    'manual_recovery', admin_id
  ) ->> 'status',
  'generated',
  'the month after the rate change generates'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.base_rent_amount, invoice.total_amount, invoice.is_prorated,
      invoice.management_fee_amount
    )
   FROM public.tenant_invoices AS invoice
   WHERE invoice.lease_id = state.start_actual_lease
     AND invoice.billing_period_start = DATE '2026-09-01'),
  jsonb_build_array(3600, 3600, false, 360),
  'the replacement rate begins on the next full month without proration'
) FROM boundary_state AS state;

SELECT is(
  (SELECT count(*)::integer
   FROM public.tenant_invoice_rent_segments AS segment
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = segment.organization_id
    AND invoice.id = segment.invoice_id
   WHERE invoice.lease_id = state.start_actual_lease
     AND invoice.billing_period_start = DATE '2026-09-01'),
  1,
  'the next full month has one economic rent segment'
) FROM boundary_state AS state;

CREATE TEMP TABLE retry_snapshot AS
SELECT invoice.id AS invoice_id, invoice.created_at, invoice.total_amount,
  invoice.management_fee_amount,
  (SELECT count(*) FROM public.tenant_invoice_lines AS line
   WHERE line.organization_id = invoice.organization_id
     AND line.invoice_id = invoice.id) AS line_count,
  (SELECT count(*) FROM public.tenant_invoice_rent_segments AS segment
   WHERE segment.organization_id = invoice.organization_id
     AND segment.invoice_id = invoice.id) AS segment_count,
  (SELECT count(*) FROM public.finance_income_items AS income
   WHERE income.organization_id = invoice.organization_id
     AND income.lease_id = invoice.lease_id
     AND income.rent_billing_period_start = invoice.billing_period_start) AS income_count,
  (SELECT count(*) FROM public.management_fee_occurrences AS fee
   WHERE fee.organization_id = invoice.organization_id
     AND fee.tenant_invoice_id = invoice.id) AS fee_count
FROM public.tenant_invoices AS invoice
JOIN boundary_state AS state ON state.start_actual_lease = invoice.lease_id
WHERE invoice.billing_period_start = DATE '2026-08-01';

SELECT is(
  (app_private.try_generate_lease_rent_invoice(
    organization_id, start_actual_lease, DATE '2026-08-01', DATE '2026-08-10',
    'manual_recovery', admin_id
  ) ->> 'invoiceId')::uuid,
  (SELECT invoice_id FROM retry_snapshot),
  'same-month retry returns the exact issued invoice'
) FROM boundary_state;

SELECT is(
  (SELECT jsonb_build_array(
      invoice.created_at, invoice.total_amount, invoice.management_fee_amount,
      (SELECT count(*) FROM public.tenant_invoice_lines AS line
       WHERE line.organization_id = invoice.organization_id
         AND line.invoice_id = invoice.id),
      (SELECT count(*) FROM public.tenant_invoice_rent_segments AS segment
       WHERE segment.organization_id = invoice.organization_id
         AND segment.invoice_id = invoice.id),
      (SELECT count(*) FROM public.finance_income_items AS income
       WHERE income.organization_id = invoice.organization_id
         AND income.lease_id = invoice.lease_id
         AND income.rent_billing_period_start = invoice.billing_period_start),
      (SELECT count(*) FROM public.management_fee_occurrences AS fee
       WHERE fee.organization_id = invoice.organization_id
         AND fee.tenant_invoice_id = invoice.id)
    )
   FROM public.tenant_invoices AS invoice
   JOIN retry_snapshot AS snapshot ON snapshot.invoice_id = invoice.id),
  (SELECT jsonb_build_array(
      created_at, total_amount, management_fee_amount,
      line_count, segment_count, income_count, fee_count
    ) FROM retry_snapshot),
  'same-month retry does not mutate or duplicate invoice economics'
);

SELECT is(
  (SELECT count(*)::integer FROM public.tenant_invoices AS invoice
   JOIN boundary_state AS state ON state.start_actual_lease = invoice.lease_id
   WHERE invoice.billing_period_start = DATE '2026-08-01'),
  1,
  'there is exactly one August invoice for the retried lease'
);

SELECT is(
  (SELECT count(*)::integer FROM public.management_fee_occurrences AS fee
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = fee.organization_id
    AND invoice.id = fee.tenant_invoice_id
   JOIN boundary_state AS state ON state.start_actual_lease = fee.lease_id
   WHERE invoice.billing_period_start = DATE '2026-08-01'),
  1,
  'there is exactly one August management-fee occurrence for the retried lease'
);

SELECT is(
  (SELECT count(*)::integer FROM public.finance_income_items AS income
   JOIN boundary_state AS state ON state.start_actual_lease = income.lease_id
   WHERE income.rent_billing_period_start = DATE '2026-08-01'),
  1,
  'there is exactly one August rent income item for the retried lease'
);

SELECT is(
  (SELECT sum(segment.amount)
   FROM public.tenant_invoice_rent_segments AS segment
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = segment.organization_id
    AND invoice.id = segment.invoice_id
   JOIN boundary_state AS state ON state.end_actual_lease = invoice.lease_id),
  2000::numeric,
  'end-boundary segment economics equal the prorated invoice rent'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.tenant_invoices AS invoice
   JOIN boundary_state AS state ON invoice.lease_id IN (
     state.start_actual_lease, state.end_actual_lease,
     state.start_override_lease, state.end_override_lease
   )
   WHERE invoice.billing_period_start = DATE '2026-08-01'),
  4,
  'each boundary scenario creates one August invoice'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.management_fee_occurrences AS fee
   JOIN public.tenant_invoices AS invoice
     ON invoice.organization_id = fee.organization_id
    AND invoice.id = fee.tenant_invoice_id
   JOIN boundary_state AS state ON fee.lease_id IN (
     state.start_actual_lease, state.end_actual_lease,
     state.start_override_lease, state.end_override_lease
   )
   WHERE invoice.billing_period_start = DATE '2026-08-01'),
  4,
  'each boundary scenario creates one August management fee'
);

SELECT is(
  (SELECT sum(invoice.total_amount)
   FROM public.tenant_invoices AS invoice
   JOIN boundary_state AS state ON invoice.lease_id IN (
     state.start_actual_lease, state.end_actual_lease,
     state.start_override_lease, state.end_override_lease
   )
   WHERE invoice.billing_period_start = DATE '2026-08-01'),
  7550::numeric,
  'August rent totals include only bounded opening-rate economics'
);

SELECT * FROM finish();
ROLLBACK;
