BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(31);

CREATE TEMP TABLE lease_billing_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  outsider_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  rollback_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  create_result jsonb,
  direct_result jsonb,
  draft_rule_id uuid,
  historical_result jsonb,
  replacement_result jsonb,
  scheduled_result jsonb,
  invoice_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_rule_id uuid
) ON COMMIT DROP;

INSERT INTO lease_billing_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON lease_billing_state TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'lease_owned_billing_test',
      'startedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved',
      'recordSource', 'operator_confirmed',
      'reason', 'lease_owned_billing_test',
      'scheduledMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', p_tenant_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'lease_owned_billing_test',
        'startedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.billing_rule(
  p_recipient_id uuid,
  p_fee_value numeric DEFAULT 8,
  p_collection_route text DEFAULT 'through_ips',
  p_charge_management_fee boolean DEFAULT true,
  p_first_period_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'billingRecipientKind', 'company',
    'billingRecipientPersonId', p_recipient_id,
    'collectionRoute', p_collection_route,
    'managementFeeMode', 'percentage',
    'managementFeeValue', p_fee_value,
    'chargeManagementFeeWhenActive', p_charge_management_fee,
    'fullManagementFeeDuringProration', false,
    'rentCalculationTimezone', 'Asia/Bangkok',
    'shortMonthDueDayRule', 'last_calendar_day',
    'leaseStartProrationRule', 'actual_days',
    'leaseEndProrationRule', 'actual_days',
    'midPeriodRentChangeRule', 'next_full_month',
    'chargeThroughLeaseEnd', true,
    'firstPeriodProratedAmount', p_first_period_amount,
    'finalPeriodProratedAmount', NULL
  );
$$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', fixture.user_id,
  'authenticated', 'authenticated', fixture.label || '@example.test',
  extensions.crypt('lease-owned-billing-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM lease_billing_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.admin_id, 'lease-billing-admin'),
    (state.outsider_id, 'lease-billing-outsider')
) AS fixture(user_id, label);

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT
  organization_id,
  'Lease-owned billing organization',
  'lease-owned-billing-' || left(organization_id::text, 8),
  'America/Los_Angeles'
FROM lease_billing_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM lease_billing_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, rental_structure, status
)
SELECT
  property_id, organization_id, 'Lease billing property',
  'LBR-' || left(property_id::text, 8), 'apartment', 'multi_unit', 'active'
FROM lease_billing_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  fixture.unit_id, state.organization_id, state.property_id,
  fixture.unit_number, 'vacant', 1000, 'USD'
FROM lease_billing_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.unit_id, 'LBR-01'),
    (state.rollback_unit_id, 'LBR-02'),
    (state.legacy_unit_id, 'LBR-03')
) AS fixture(unit_id, unit_number);

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Lease billing tenant', 'individual'
FROM lease_billing_state
UNION ALL
SELECT company_id, organization_id, 'Lease billing company', 'company'
FROM lease_billing_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM lease_billing_state
UNION ALL
SELECT organization_id, company_id, 'owner'
FROM lease_billing_state;

INSERT INTO public.property_owners(
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
  company_id,
  'Primary owner',
  100,
  true,
  DATE '2025-01-01',
  admin_id,
  admin_id
FROM lease_billing_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE lease_billing_state AS state
SET create_result = public.create_lease_with_billing_rules(
  state.organization_id,
  state.property_id,
  state.unit_id,
  state.tenant_id,
  DATE '2026-08-01',
  DATE '2027-12-31',
  1000,
  'USD',
  15,
  'monthly',
  'draft',
  500,
  'USD',
  'draft',
  pg_temp.relationship_payload(state.tenant_id),
  pg_temp.billing_rule(state.company_id),
  'lease-owned-create-1'
);

UPDATE lease_billing_state AS state
SET draft_rule_id = (state.create_result ->> 'billingTermId')::uuid;

SELECT is(
  (SELECT count(*)::integer FROM public.rent_policy_versions),
  0,
  'new lease creation does not require or create a global Rent Policy'
);

SELECT ok(
  (SELECT create_result ?& ARRAY[
    'leaseId', 'termId', 'partyId', 'occupancyId', 'participantIds',
    'billingTermId'
  ] FROM lease_billing_state),
  'one atomic result returns lease, term, relationship, and billing identities'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_terms AS term
    WHERE term.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND term.rent_amount = 1000
      AND term.rent_due_day = 15
      AND term.payment_frequency = 'monthly'
      AND term.start_date = DATE '2026-08-01'
      AND term.end_date = DATE '2027-12-31'
  ),
  1,
  'the authoritative lease term owns rent, explicit due day, frequency, and dates'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.id = state.draft_rule_id
      AND billing.effective_from = DATE '2026-08-01'
      AND billing.effective_to = DATE '2027-12-31'
      AND billing.collection_route = 'through_ips'
      AND billing.billing_recipient_kind = 'company'
      AND billing.billing_recipient_person_id = state.company_id
      AND billing.management_fee_mode = 'percentage'
      AND billing.management_fee_value = 8
      AND billing.charge_management_fee_when_active
      AND NOT billing.full_management_fee_during_proration
      AND billing.rent_calculation_timezone = 'Asia/Bangkok'
      AND billing.short_month_due_day_rule = 'last_calendar_day'
      AND billing.lease_start_proration_rule = 'actual_days'
      AND billing.lease_end_proration_rule = 'actual_days'
      AND billing.mid_period_rent_change_rule = 'next_full_month'
      AND billing.charge_through_lease_end
      AND billing.first_period_prorated_amount IS NULL
      AND billing.final_period_prorated_amount IS NULL
  ),
  1,
  'the initial rule explicitly snapshots every supported calculation and collection input'
)
FROM lease_billing_state AS state;

SELECT is(
  public.create_lease_with_billing_rules(
    state.organization_id, state.property_id, state.unit_id, state.tenant_id,
    DATE '2026-08-01', DATE '2027-12-31', 1000, 'USD', 15, 'monthly',
    'draft', 500, 'USD', 'draft',
    pg_temp.relationship_payload(state.tenant_id),
    pg_temp.billing_rule(state.company_id),
    'lease-owned-create-1'
  ),
  state.create_result,
  'same-payload create retry returns the exact original result'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (state.create_result ->> 'leaseId')::uuid
  ),
  1,
  'same-payload create retry does not duplicate the billing rule'
)
FROM lease_billing_state AS state;

SELECT throws_ok(
  format(
    'SELECT public.create_lease_with_billing_rules(%L,%L,%L,%L,DATE %L,DATE %L,1001,%L,15,%L,%L,500,%L,%L,%L::jsonb,%L::jsonb,%L)',
    state.organization_id, state.property_id, state.unit_id, state.tenant_id,
    '2026-08-01', '2027-12-31', 'USD', 'monthly', 'draft', 'USD',
    'draft', pg_temp.relationship_payload(state.tenant_id),
    pg_temp.billing_rule(state.company_id), 'lease-owned-create-1'
  ),
  '22023',
  NULL,
  'a reused create key rejects a changed lease or billing payload'
)
FROM lease_billing_state AS state;

SELECT throws_ok(
  format(
    'SELECT public.create_lease_with_billing_rules(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,15,%L,%L,500,%L,%L,%L::jsonb,%L::jsonb,%L)',
    state.organization_id, state.property_id, state.rollback_unit_id,
    state.tenant_id, '2026-08-01', '2027-12-31', 'USD', 'monthly',
    'draft', 'USD', 'draft', pg_temp.relationship_payload(state.tenant_id),
    pg_temp.billing_rule(state.company_id) || '{"rentCalculationTimezone":"Not/AZone"}'::jsonb,
    'lease-owned-create-invalid'
  ),
  '22023',
  NULL,
  'an invalid required billing snapshot rejects the whole creation command'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leases AS lease
    WHERE lease.unit_id = state.rollback_unit_id
  ),
  0,
  'billing validation failure rolls back lease, term, relationship, and deposit writes'
)
FROM lease_billing_state AS state;

SELECT lives_ok(
  format(
    'SELECT public.update_lease_with_billing_rules(%L,%L,%L,%L,%L,DATE %L,DATE %L,1200,%L,20,%L,%L,600,%L,%L,%L::jsonb,%L)',
    (state.create_result ->> 'leaseId')::uuid, state.organization_id,
    state.property_id, state.unit_id, state.tenant_id, '2026-08-01',
    '2027-12-31', 'USD', 'monthly', 'draft', 'USD', 'draft',
    pg_temp.billing_rule(state.company_id, 9, 'through_ips', true, 333.33),
    'lease-owned-draft-update-1'
  ),
  'a draft lease can update its unused initial billing rule atomically with its term'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND billing.id = state.draft_rule_id
      AND billing.management_fee_value = 9
  ),
  1,
  'draft editing updates the unused initial rule in place without creating history'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT jsonb_build_array(term.rent_amount, term.rent_due_day)
    FROM public.lease_terms AS term
    WHERE term.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND term.authority_kind = 'authoritative'
      AND term.status <> 'superseded'
      AND term.archived_at IS NULL
  ),
  jsonb_build_array(1200, 20),
  'draft editing updates rent and due day in the authoritative term only'
)
FROM lease_billing_state AS state;

RESET ROLE;
SET LOCAL session_replication_role = replica;

UPDATE public.leases AS lease
SET status = 'active'
FROM lease_billing_state AS state
WHERE lease.id = (state.create_result ->> 'leaseId')::uuid;

UPDATE public.lease_terms AS term
SET status = 'active'
FROM lease_billing_state AS state
WHERE term.lease_id = (state.create_result ->> 'leaseId')::uuid
  AND term.authority_kind = 'authoritative'
  AND term.status <> 'superseded'
  AND term.archived_at IS NULL;

SET LOCAL session_replication_role = origin;

UPDATE lease_billing_state AS state
SET scheduled_result = app_private.try_current_month_rent(
  state.organization_id,
  (state.create_result ->> 'leaseId')::uuid,
  'scheduled',
  TIMESTAMPTZ '2026-08-31 18:30:00+00'
);

SELECT is(
  (
    SELECT jsonb_build_array(
      invoice.billing_period_start,
      invoice.issue_date,
      invoice.billing_term_id,
      invoice.collection_route,
      invoice.recipient_kind,
      invoice.recipient_person_id,
      invoice.management_fee_mode,
      invoice.management_fee_value,
      invoice.management_fee_amount,
      invoice.total_amount
    )
    FROM public.tenant_invoices AS invoice
    WHERE invoice.id = (state.scheduled_result ->> 'invoiceId')::uuid
  ),
  jsonb_build_array(
    DATE '2026-09-01', DATE '2026-09-01', state.draft_rule_id,
    'through_ips', 'company', state.company_id, 'percentage', 9, 108, 1200
  ),
  'scheduled generation uses the effective Lease rule and its calculation timezone'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_lines AS line
    WHERE line.invoice_id = (state.scheduled_result ->> 'invoiceId')::uuid
      AND line.line_type = 'rent'
      AND line.amount = 1200
  ),
  1,
  'the tenant-visible scheduled invoice contains rent only, excluding the owner management fee'
)
FROM lease_billing_state AS state;

UPDATE lease_billing_state AS state
SET historical_result = app_private.try_generate_lease_rent_invoice(
  state.organization_id,
  (state.create_result ->> 'leaseId')::uuid,
  DATE '2026-08-01',
  DATE '2026-08-20',
  'manual_recovery',
  state.admin_id
);

SELECT is(
  state.historical_result ->> 'status',
  'generated',
  'historical recovery routes complete Lease-owned rules without a global Rent Policy'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT jsonb_build_array(
      invoice.total_amount,
      invoice.is_prorated,
      invoice.management_fee_amount,
      segment.proration_rule
    )
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_rent_segments AS segment
      ON segment.organization_id = invoice.organization_id
      AND segment.invoice_id = invoice.id
    WHERE invoice.id = (state.historical_result ->> 'invoiceId')::uuid
  ),
  jsonb_build_array(333.33, true, 30, 'billing_override'),
  'first-period override and prorated fee behavior come from the invoice billing-rule snapshot'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT jsonb_agg(
      jsonb_build_array(
        fee.amount,
        fee.billing_term_id,
        fee.fee_mode,
        fee.fee_value,
        fee.settlement_status
      )
      ORDER BY fee.fee_date
    )
    FROM public.management_fee_occurrences AS fee
    WHERE fee.lease_id = (state.create_result ->> 'leaseId')::uuid
  ),
  jsonb_build_array(
    jsonb_build_array(30, state.draft_rule_id, 'percentage', 9, 'owner_due'),
    jsonb_build_array(108, state.draft_rule_id, 'percentage', 9, 'owner_due')
  ),
  'invoice issuance creates tenant-invisible owner management-fee occurrences from the used rule'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.owner_invoice_lines AS line
    JOIN public.management_fee_occurrences AS fee
      ON fee.organization_id = line.organization_id
      AND fee.id = line.source_id
    WHERE fee.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND line.source_type = 'management_fee'
      AND line.amount = fee.amount
  ),
  2,
  'each management-fee occurrence creates the matching owner charge'
)
FROM lease_billing_state AS state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.tenant_invoices(
  id, organization_id, invoice_number, property_id, unit_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, currency, total_amount, lifecycle,
  management_fee_mode, management_fee_value, management_fee_amount
)
SELECT
  state.invoice_id, state.organization_id,
  'LBR-' || left(state.invoice_id::text, 8), state.property_id, state.unit_id,
  (state.create_result ->> 'leaseId')::uuid, state.draft_rule_id,
  DATE '2026-10-01', DATE '2026-10-31', DATE '2026-10-01',
  DATE '2026-10-20', 'through_ips', 'company', state.company_id,
  'Lease billing company', 'USD', 1200, 'issued', 'percentage', 9, 108
FROM lease_billing_state AS state;

UPDATE lease_billing_state
SET invoice_rule_id = draft_rule_id;

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE lease_billing_state AS state
SET replacement_result = public.save_lease_billing_rules(
  state.organization_id,
  (state.create_result ->> 'leaseId')::uuid,
  pg_temp.billing_rule(state.company_id, 12, 'direct_to_owner', false),
  state.draft_rule_id,
  'lease-owned-active-change-1'
);

SELECT is(
  (
    SELECT billing.effective_to
    FROM public.lease_billing_terms AS billing
    WHERE billing.id = state.draft_rule_id
  ),
  DATE '2026-10-31',
  'an active rule ends the day before the next unbilled month'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT billing.effective_from
    FROM public.lease_billing_terms AS billing
    WHERE billing.id = (state.replacement_result ->> 'billingTermId')::uuid
  ),
  DATE '2026-11-01',
  'the replacement begins after the latest generated invoice month'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND billing.management_fee_value IN (9, 12)
  ),
  2,
  'active changes preserve the prior rule and append one replacement'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT jsonb_build_array(
      invoice.billing_term_id,
      invoice.collection_route,
      invoice.management_fee_value,
      invoice.management_fee_amount
    )
    FROM public.tenant_invoices AS invoice
    WHERE invoice.id = state.invoice_id
  ),
  jsonb_build_array(state.invoice_rule_id, 'through_ips', 9, 108),
  'existing invoice source and calculation snapshots remain unchanged'
)
FROM lease_billing_state AS state;

RESET ROLE;

UPDATE lease_billing_state AS state
SET direct_result = app_private.try_generate_lease_rent_invoice(
  state.organization_id,
  (state.create_result ->> 'leaseId')::uuid,
  DATE '2026-11-01',
  DATE '2026-11-01',
  'manual_recovery',
  state.admin_id
);

SELECT is(
  (
    SELECT jsonb_build_array(
      invoice.billing_term_id,
      invoice.collection_route,
      invoice.recipient_kind,
      invoice.recipient_person_id,
      invoice.management_fee_mode,
      invoice.management_fee_value,
      invoice.management_fee_amount,
      EXISTS (
        SELECT 1
        FROM public.management_fee_occurrences AS fee
        WHERE fee.tenant_invoice_id = invoice.id
      )
    )
    FROM public.tenant_invoices AS invoice
    WHERE invoice.id = (state.direct_result ->> 'invoiceId')::uuid
  ),
  jsonb_build_array(
    (state.replacement_result ->> 'billingTermId')::uuid,
    'direct_to_owner', 'company', state.company_id,
    'percentage', 12, 0, false
  ),
  'a future effective rule changes collection and explicitly disables the owner fee without rewriting prior invoices'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT resolved.component::text
    FROM public.management_fee_occurrences AS fee
    CROSS JOIN LATERAL app_private.resolve_owner_event_source(
      fee.organization_id,
      'management_fee_occurrence',
      fee.id
    ) AS resolved
    WHERE fee.tenant_invoice_id = (state.scheduled_result ->> 'invoiceId')::uuid
  ),
  'owner_due_to_ips',
  'the generated management fee enters the canonical owner-balance authority'
)
FROM lease_billing_state AS state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.save_lease_billing_rules(
    state.organization_id,
    (state.create_result ->> 'leaseId')::uuid,
    pg_temp.billing_rule(state.company_id, 12, 'direct_to_owner', false),
    state.draft_rule_id,
    'lease-owned-active-change-1'
  ),
  state.replacement_result,
  'same-payload active change retry returns the scheduled rule without duplication'
)
FROM lease_billing_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (state.create_result ->> 'leaseId')::uuid
  ),
  2,
  'idempotent active retry creates no additional rule'
)
FROM lease_billing_state AS state;

SELECT throws_ok(
  format(
    'SELECT public.save_lease_billing_rules(%L,%L,%L::jsonb,%L,%L)',
    state.organization_id, (state.create_result ->> 'leaseId')::uuid,
    pg_temp.billing_rule(state.company_id, 13, 'direct_to_owner'),
    state.draft_rule_id, 'lease-owned-active-change-1'
  ),
  '22023',
  NULL,
  'a reused active-change key rejects a changed payload'
)
FROM lease_billing_state AS state;

RESET ROLE;
SET LOCAL session_replication_role = replica;

INSERT INTO public.leases(
  organization_id, property_id, unit_id, primary_tenant_person_id, status,
  created_by, updated_by
)
SELECT
  organization_id, property_id, legacy_unit_id, tenant_id, 'draft',
  admin_id, admin_id
FROM lease_billing_state;

INSERT INTO public.lease_terms(
  organization_id, lease_id, term_sequence, start_date, end_date, rent_amount,
  rent_currency, rent_due_day, payment_frequency, status, authority_kind,
  confirmed_at, confirmed_by, created_by, updated_by
)
SELECT
  state.organization_id, lease.id, 1, DATE '2026-09-01', DATE '2027-08-31',
  900, 'USD', 7, 'monthly', 'draft', 'authoritative', now(), state.admin_id,
  state.admin_id, state.admin_id
FROM lease_billing_state AS state
JOIN public.leases AS lease
  ON lease.organization_id = state.organization_id
  AND lease.unit_id = state.legacy_unit_id;

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.save_lease_billing_rules(%L,%L,%L::jsonb,NULL,%L)',
    state.organization_id, lease.id, pg_temp.billing_rule(state.company_id),
    'lease-owned-legacy-repair-1'
  ),
  'the same lease-owned authority repairs a legacy lease with no rule'
)
FROM lease_billing_state AS state
JOIN public.leases AS lease
  ON lease.organization_id = state.organization_id
  AND lease.unit_id = state.legacy_unit_id;

SELECT is(
  (
    SELECT billing.effective_from
    FROM public.lease_billing_terms AS billing
    JOIN public.leases AS lease
      ON lease.organization_id = billing.organization_id
      AND lease.id = billing.lease_id
    WHERE lease.unit_id = state.legacy_unit_id
  ),
  DATE '2026-09-01',
  'legacy repair anchors its initial authoritative rule to the lease start date'
)
FROM lease_billing_state AS state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT outsider_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.save_lease_billing_rules(%L,%L,%L::jsonb,%L,%L)',
    state.organization_id, (state.create_result ->> 'leaseId')::uuid,
    pg_temp.billing_rule(state.company_id, 14),
    (state.replacement_result ->> 'billingTermId')::uuid,
    'lease-owned-outsider-change'
  ),
  '42501',
  NULL,
  'an unaffiliated authenticated caller cannot change billing rules'
)
FROM lease_billing_state AS state;

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = state.organization_id
      AND billing.lease_id = (state.create_result ->> 'leaseId')::uuid
      AND billing.effective_from <= DATE '2026-10-01'
      AND billing.effective_to >= DATE '2026-10-31'
  ),
  1,
  'generated invoice months remain covered by exactly one immutable historical rule'
)
FROM lease_billing_state AS state;

SELECT * FROM finish();
ROLLBACK;
