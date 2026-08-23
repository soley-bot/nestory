BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(22);

CREATE TEMP TABLE review_state (
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
  west_result jsonb,
  east_result jsonb
) ON COMMIT DROP;

INSERT INTO review_state DEFAULT VALUES;
GRANT SELECT ON review_state TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.billing_rule(
  p_recipient uuid,
  p_route text DEFAULT 'through_ips',
  p_fee_mode text DEFAULT 'flat',
  p_fee_value numeric DEFAULT 310,
  p_keep_full boolean DEFAULT false,
  p_timezone text DEFAULT 'UTC',
  p_first_override numeric DEFAULT NULL,
  p_final_override numeric DEFAULT NULL
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
    'chargeThroughLeaseEnd', true,
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
  (state.property_b, state.owner_b, DATE '2026-09-02'),
  (state.property_c, state.owner_c,
    (date_trunc('month', current_date::timestamp) + interval '1 month')::date)
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
  (state.east_to_west_lease, state.property_a, state.unit_a, 'active')
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
  (state.scheduled_lease, 1, current_date - 60, current_date + 400, 'active'),
  (state.rejected_scheduled_lease, 1, current_date - 60, current_date + 400, 'active'),
  (state.west_to_east_lease, 1, DATE '2026-08-01', DATE '2026-12-31', 'active'),
  (state.east_to_west_lease, 1, DATE '2026-08-01', DATE '2026-12-31', 'active')
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
  ('96000000-0000-0000-0000-000000000105'::uuid, state.scheduled_lease, state.property_c, current_date - 60, current_date + 400, 'through_ips', false, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000106'::uuid, state.rejected_scheduled_lease, state.property_b, current_date - 60, current_date + 400, 'through_ips', false, state.company_id, NULL::numeric, 'UTC'),
  ('96000000-0000-0000-0000-000000000107'::uuid, state.west_to_east_lease, state.property_a, DATE '2026-08-01', DATE '2026-08-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Kiritimati'),
  ('96000000-0000-0000-0000-000000000108'::uuid, state.west_to_east_lease, state.property_a, DATE '2026-09-01', DATE '2026-12-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Honolulu'),
  ('96000000-0000-0000-0000-000000000109'::uuid, state.east_to_west_lease, state.property_a, DATE '2026-08-01', DATE '2026-08-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Honolulu'),
  ('96000000-0000-0000-0000-000000000110'::uuid, state.east_to_west_lease, state.property_a, DATE '2026-09-01', DATE '2026-12-31', 'through_ips', false, state.company_id, NULL::numeric, 'Pacific/Kiritimati')
) AS fixture(rule_id, lease_id, property_id, effective_from, effective_to,
  route, keep_full, recipient_id, first_override, timezone);

SET LOCAL session_replication_role = origin;

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
  format($q$SELECT public.update_lease_with_billing_rules(%L,%L,%L,%L,%L,DATE '2026-09-02',DATE '2027-12-31',3100,'USD',1,'monthly','draft',0,'USD','draft',%L::jsonb,'move-owner-b')$q$,
    move_lease, organization_id, property_b, unit_b, tenant_id,
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
  jsonb_build_array(1, current_date - 60, current_date + 400),
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

SELECT * FROM finish();
ROLLBACK;
