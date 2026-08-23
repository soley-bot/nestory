BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

SELECT has_function(
  'public',
  'correct_tenant_invoice',
  ARRAY['uuid', 'uuid', 'text', 'uuid', 'text', 'text'],
  'one checked tenant-invoice correction authority exists'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.correct_tenant_invoice(uuid,uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.correct_tenant_invoice(uuid,uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.correct_tenant_invoice(uuid,uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'the correction RPC is exposed only to authenticated application callers'
);

SELECT ok(
  (
    SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'tenant_invoice_corrections'
  ),
  'immutable correction occurrences force row-level security'
);

CREATE TEMP TABLE correction_state (
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  finance_manager_id uuid NOT NULL,
  finance_member_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  billing_term_id uuid,
  invoice_id uuid,
  rent_line_id uuid,
  utility_line_id uuid,
  management_fee_id uuid,
  owner_line_id uuid,
  owner_allocation_set_id uuid,
  close_series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  closed_revision_id uuid NOT NULL DEFAULT gen_random_uuid(),
  utility_correction jsonb,
  void_correction jsonb,
  payment_invoice_id uuid,
  reconciliation_source_id uuid,
  payment_id uuid,
  no_fee_invoice_id uuid,
  no_fee_rent_line_id uuid,
  no_fee_close_series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  no_fee_closed_revision_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO correction_state (
  organization_id,
  admin_id,
  finance_manager_id,
  finance_member_id,
  lease_id,
  property_id,
  owner_person_id
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000801',
  lease.id,
  lease.property_id,
  owner.person_id
FROM public.current_leases AS lease
JOIN public.property_owners AS owner
  ON owner.organization_id = lease.organization_id
 AND owner.property_id = lease.property_id
 AND owner.archived_at IS NULL
 AND owner.started_on <= current_date
 AND (owner.ended_on IS NULL OR current_date < owner.ended_on)
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease.primary_tenant_person_id = '80000000-0000-0000-0000-000000000001';

GRANT SELECT, UPDATE ON correction_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

INSERT INTO public.rent_policy_versions (
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
  organization_id,
  coalesce((
    SELECT max(policy.version_number) + 1
    FROM public.rent_policy_versions AS policy
    WHERE policy.organization_id = correction_state.organization_id
  ), 1),
  date_trunc('month', current_date)::date,
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  1,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  admin_id,
  admin_id,
  now(),
  admin_id
FROM correction_state;

UPDATE correction_state
SET billing_term_id = (
  public.save_lease_billing_rules(
    organization_id,
    lease_id,
    jsonb_build_object(
      'billingRecipientKind', 'individual',
      'billingRecipientPersonId', '80000000-0000-0000-0000-000000000001',
      'collectionRoute', 'through_ips',
      'managementFeeMode', 'percentage',
      'managementFeeValue', 10,
      'chargeManagementFeeWhenActive', true,
      'fullManagementFeeDuringProration', true,
      'rentCalculationTimezone', 'Asia/Bangkok',
      'shortMonthDueDayRule', 'last_calendar_day',
      'leaseStartProrationRule', 'actual_days',
      'leaseEndProrationRule', 'actual_days',
      'midPeriodRentChangeRule', 'next_full_month',
      'chargeThroughLeaseEnd', true,
      'firstPeriodProratedAmount', NULL,
      'finalPeriodProratedAmount', NULL
    ),
    (
      SELECT id
      FROM public.lease_billing_terms AS existing
      WHERE existing.organization_id = correction_state.organization_id
        AND existing.lease_id = correction_state.lease_id
        AND existing.archived_at IS NULL
      ORDER BY existing.effective_from DESC
      LIMIT 1
    ),
    'invoice-correction-billing-term-0001'
  )->>'billingTermId'
)::uuid;

UPDATE correction_state
SET invoice_id = app_private.generate_simple_lease_rent_invoice(
  organization_id,
  lease_id,
  (date_trunc('month', current_date) + interval '1 month')::date,
  current_date - 1,
  'manual_recovery',
  admin_id
);

UPDATE correction_state
SET utility_line_id = (
  public.create_manual_tenant_charge(
    organization_id,
    lease_id,
    'utilities',
    (date_trunc('month', current_date) + interval '1 month')::date,
    (date_trunc('month', current_date) + interval '1 month + 4 days')::date,
    37.45,
    'Metered water recharge',
    'invoice-correction-utility-0001'
  )->>'lineId'
)::uuid;

UPDATE correction_state AS state
SET
  rent_line_id = line.id,
  management_fee_id = fee.id,
  owner_line_id = owner_line.id
FROM public.tenant_invoice_lines AS line
JOIN public.management_fee_occurrences AS fee
  ON fee.organization_id = line.organization_id
 AND fee.tenant_invoice_id = line.invoice_id
JOIN public.owner_invoice_lines AS owner_line
  ON owner_line.organization_id = fee.organization_id
 AND owner_line.source_type = 'management_fee'
 AND owner_line.source_id = fee.id
WHERE line.organization_id = state.organization_id
  AND line.invoice_id = state.invoice_id
  AND line.line_type = 'rent'
  AND line.reversal_of_id IS NULL;

UPDATE correction_state
SET owner_allocation_set_id = (
  public.allocate_owner_event(
    organization_id,
    'management_fee_occurrence',
    management_fee_id,
    'invoice-correction-fee-allocation-0001'
  )->>'allocation_set_id'
)::uuid;

SELECT results_eq(
  $$
    SELECT
      invoice.issue_date,
      rent.recognized_on,
      fee.fee_date,
      owner_line.recognized_on,
      allocation_set.event_date
    FROM correction_state AS state
    JOIN public.tenant_invoices AS invoice ON invoice.id = state.invoice_id
    JOIN public.tenant_invoice_lines AS rent ON rent.id = state.rent_line_id
    JOIN public.management_fee_occurrences AS fee ON fee.id = state.management_fee_id
    JOIN public.owner_invoice_lines AS owner_line ON owner_line.id = state.owner_line_id
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.id = state.owner_allocation_set_id
  $$,
  $$VALUES (
    current_date - 1,
    current_date - 1,
    current_date - 1,
    current_date - 1,
    current_date - 1
  )$$,
  'issued rent, management fee, owner charge, and owner balance use one recognition date'
);

SELECT is(
  (SELECT recognized_on FROM public.tenant_invoice_lines WHERE id = (SELECT utility_line_id FROM correction_state)),
  current_date,
  'a line appended to an issued invoice stores its explicit append recognition date'
);

SELECT set_config('app.owner_close_write_context', 'checked-owner-close-v1', true);

INSERT INTO public.owner_close_series (
  id,
  organization_id,
  property_id,
  owner_person_id,
  currency,
  month_start,
  state,
  created_by,
  state_changed_by
)
SELECT
  close_series_id,
  organization_id,
  property_id,
  owner_person_id,
  'USD',
  date_trunc('month', current_date - 1)::date,
  'open',
  admin_id,
  admin_id
FROM correction_state;

INSERT INTO public.owner_close_revisions (
  id,
  owner_close_series_id,
  organization_id,
  property_id,
  owner_person_id,
  currency,
  month_start,
  revision_number,
  status,
  prepared_by,
  input_watermark,
  input_hash,
  content_hash,
  closed_at,
  closed_by,
  close_reason,
  input_canonical
)
SELECT
  closed_revision_id,
  close_series_id,
  organization_id,
  property_id,
  owner_person_id,
  'USD',
  date_trunc('month', current_date - 1)::date,
  1,
  'closed',
  admin_id,
  'invoice-correction-fixture-v1',
  repeat('a', 64),
  repeat('b', 64),
  now(),
  admin_id,
  'Invoice correction closed-period fixture',
  '{"fixture":"invoice-correction"}'
FROM correction_state;

UPDATE public.owner_close_series AS series
SET
  state = 'closed',
  active_revision_id = state.closed_revision_id,
  current_closed_revision_id = state.closed_revision_id,
  state_changed_at = now(),
  state_changed_by = state.admin_id
FROM correction_state AS state
WHERE series.organization_id = state.organization_id
  AND series.id = state.close_series_id;

SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);

UPDATE public.owner_balance_periods AS period
SET
  status = CASE
    WHEN period.month_start = date_trunc('month', current_date - 1)::date THEN 'closed'
    ELSE 'ready'
  END,
  closed_revision_id = CASE
    WHEN period.month_start = date_trunc('month', current_date - 1)::date
      THEN state.closed_revision_id
    ELSE NULL
  END,
  stale_at = NULL,
  stale_reason = NULL,
  blocked_reason_code = NULL,
  blocked_reason_detail = NULL
FROM correction_state AS state
WHERE period.organization_id = state.organization_id
  AND period.property_id = state.property_id
  AND period.owner_person_id = state.owner_person_id
  AND period.currency = 'USD'
  AND period.month_start IN (
    date_trunc('month', current_date - 1)::date,
    (date_trunc('month', current_date - 1) + interval '1 month')::date
  );

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM correction_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE correction_state
SET utility_correction = public.correct_tenant_invoice(
  organization_id,
  invoice_id,
  'line_correction',
  utility_line_id,
  'Reverse the metered recharge only',
  'invoice-correction-utility-reversal-0001'
);

SELECT results_eq(
  $$
    SELECT
      reversal.amount,
      reversal.recognized_on,
      reversal.property_id = original.property_id,
      reversal.unit_id IS NOT DISTINCT FROM original.unit_id,
      reversal.currency = original.currency,
      reversal.reversal_of_id = original.id
    FROM correction_state AS state
    JOIN public.tenant_invoice_lines AS original ON original.id = state.utility_line_id
    JOIN public.tenant_invoice_lines AS reversal ON reversal.reversal_of_id = original.id
  $$,
  $$VALUES (-37.45::numeric, current_date, true, true, true, true)$$,
  'an appended recharge correction preserves exact snapshots, recognition, and lineage'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.management_fee_occurrences AS fee
    WHERE fee.correction_occurrence_id = (
      SELECT (utility_correction->>'correction_id')::uuid FROM correction_state
    )
  ),
  0,
  'tenant recharge correction does not append a management-fee reversal'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.owner_invoice_lines AS line
    WHERE line.correction_occurrence_id = (
      SELECT (utility_correction->>'correction_id')::uuid FROM correction_state
    )
  ),
  0,
  'tenant recharge correction does not create an owner charge'
);

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      organization_id,
      invoice_id,
      'void',
      NULL,
      'Void the unpaid issued rent invoice',
      'invoice-correction-void-0001'
    )
    FROM correction_state
  $$,
  '55000',
  'owner_close_period_closed',
  'rent correction fails closed while the affected Owner Close month is closed'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

SELECT lives_ok(
  $$
    SELECT public.reopen_owner_month(
      organization_id,
      close_series_id,
      'Tenant invoice evidence requires correction',
      'invoice-correction-owner-reopen-0001'
    )
    FROM correction_state
  $$,
  'the existing Owner Close reopen authority permits recovery'
);

SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);
UPDATE public.owner_balance_periods AS period
SET
  status = 'ready',
  closed_revision_id = NULL,
  stale_at = NULL,
  stale_reason = NULL,
  blocked_reason_code = NULL,
  blocked_reason_detail = NULL
FROM correction_state AS state
WHERE period.organization_id = state.organization_id
  AND period.property_id = state.property_id
  AND period.owner_person_id = state.owner_person_id
  AND period.currency = 'USD'
  AND period.month_start IN (
    date_trunc('month', current_date - 1)::date,
    (date_trunc('month', current_date - 1) + interval '1 month')::date
  );

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM correction_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE correction_state
SET void_correction = public.correct_tenant_invoice(
  organization_id,
  invoice_id,
  'void',
  NULL,
  'Void the unpaid issued rent invoice',
  'invoice-correction-void-0001'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

SELECT is(
  (SELECT lifecycle FROM public.tenant_invoices WHERE id = (SELECT invoice_id FROM correction_state)),
  'void',
  'permitted void transitions the invoice lifecycle without deleting evidence'
);

SELECT results_eq(
  $$
    SELECT count(*)::integer, sum(reversal.amount)::numeric(14,2)
    FROM correction_state AS state
    JOIN public.tenant_invoice_lines AS original ON original.invoice_id = state.invoice_id
    JOIN public.tenant_invoice_lines AS reversal ON reversal.reversal_of_id = original.id
    WHERE original.reversal_of_id IS NULL
  $$,
  $$VALUES (2, -887.45::numeric(14,2))$$,
  'every recognized invoice line has exactly one append-only reversal'
);

SELECT results_eq(
  $$
    SELECT
      reversal.amount,
      reversal.fee_date,
      reversal.currency = original.currency,
      reversal.property_id = original.property_id,
      reversal.reversal_of_id = original.id
    FROM correction_state AS state
    JOIN public.management_fee_occurrences AS original ON original.id = state.management_fee_id
    JOIN public.management_fee_occurrences AS reversal ON reversal.reversal_of_id = original.id
  $$,
  $$VALUES (-85.00::numeric, current_date - 1, true, true, true)$$,
  'void appends one exact management-fee reversal on the issued recognition date'
);

SELECT results_eq(
  $$
    SELECT
      reversal.amount,
      reversal.recognized_on,
      reversal.property_id = original.property_id,
      reversal.reversal_of_id = original.id,
      reversal.source_id = fee_reversal.id
    FROM correction_state AS state
    JOIN public.owner_invoice_lines AS original ON original.id = state.owner_line_id
    JOIN public.owner_invoice_lines AS reversal ON reversal.reversal_of_id = original.id
    JOIN public.management_fee_occurrences AS fee_reversal
      ON fee_reversal.reversal_of_id = state.management_fee_id
  $$,
  $$VALUES (-85.00::numeric, current_date - 1, true, true, true)$$,
  'void appends the matching owner-invoice reversal with source lineage'
);

SELECT results_eq(
  $$
    SELECT
      reversal_set.gross_signed_amount,
      reversal_set.event_date,
      reversal_set.reversal_of_allocation_set_id = original_set.id,
      reversal_movement.component::text,
      reversal_movement.signed_amount,
      reversal_movement.reversal_of_movement_id = original_movement.id
    FROM correction_state AS state
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.id = state.owner_allocation_set_id
    JOIN public.owner_event_allocation_sets AS reversal_set
      ON reversal_set.reversal_of_allocation_set_id = original_set.id
    JOIN public.owner_event_owner_allocations AS original_owner
      ON original_owner.allocation_set_id = original_set.id
    JOIN public.owner_event_owner_allocations AS reversal_owner
      ON reversal_owner.allocation_set_id = reversal_set.id
     AND reversal_owner.allocation_order = original_owner.allocation_order
    JOIN public.owner_component_movements AS original_movement
      ON original_movement.owner_event_owner_allocation_id = original_owner.id
    JOIN public.owner_component_movements AS reversal_movement
      ON reversal_movement.owner_event_owner_allocation_id = reversal_owner.id
     AND reversal_movement.reversal_of_movement_id = original_movement.id
  $$,
  $$VALUES (
    -85.00::numeric,
    current_date - 1,
    true,
    'owner_due_to_ips'::text,
    -85.00::numeric,
    true
  )$$,
  'the owner_due_to_ips economic effect is reversed from the original owner snapshot'
);

SELECT results_eq(
  $$
    SELECT period.month_start, period.status
    FROM correction_state AS state
    JOIN public.owner_balance_periods AS period
      ON period.organization_id = state.organization_id
     AND period.property_id = state.property_id
     AND period.owner_person_id = state.owner_person_id
     AND period.currency = 'USD'
    WHERE period.month_start IN (
      date_trunc('month', current_date - 1)::date,
      (date_trunc('month', current_date - 1) + interval '1 month')::date
    )
    ORDER BY period.month_start
  $$,
  $$VALUES
    (date_trunc('month', current_date - 1)::date, 'stale'::text),
    ((date_trunc('month', current_date - 1) + interval '1 month')::date, 'stale'::text)
  $$,
  'a permitted prior-evidence correction stales the affected and downstream owner periods'
);

SELECT is(
  (SELECT total_amount FROM public.tenant_invoice_balances WHERE id = (SELECT invoice_id FROM correction_state)),
  0.00::numeric,
  'tenant balance derives from recognized line evidence and nets the void to zero'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM correction_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.correct_tenant_invoice(
    organization_id,
    invoice_id,
    'void',
    NULL,
    'Void the unpaid issued rent invoice',
    'invoice-correction-void-0001'
  ),
  void_correction,
  'an exact retry returns the original correction result'
)
FROM correction_state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer FROM public.tenant_invoice_corrections
       WHERE tenant_invoice_id = state.invoice_id),
      (SELECT count(*)::integer FROM public.tenant_invoice_lines AS line
       JOIN public.tenant_invoice_lines AS original ON original.id = line.reversal_of_id
       WHERE original.invoice_id = state.invoice_id),
      (SELECT count(*)::integer FROM public.management_fee_occurrences
       WHERE reversal_of_id = state.management_fee_id),
      (SELECT count(*)::integer FROM public.owner_invoice_lines
       WHERE reversal_of_id = state.owner_line_id),
      (SELECT count(*)::integer FROM public.owner_event_allocation_sets
       WHERE reversal_of_allocation_set_id = state.owner_allocation_set_id)
    FROM correction_state AS state
  $$,
  $$VALUES (2, 2, 1, 1, 1)$$,
  'retry creates no duplicate correction or reversal evidence'
);

SELECT results_eq(
  $$
    SELECT rent.amount, fee.amount, owner_line.amount
    FROM correction_state AS state
    JOIN public.tenant_invoice_lines AS rent ON rent.id = state.rent_line_id
    JOIN public.management_fee_occurrences AS fee ON fee.id = state.management_fee_id
    JOIN public.owner_invoice_lines AS owner_line ON owner_line.id = state.owner_line_id
  $$,
  $$VALUES (850.00::numeric, 85.00::numeric, 85.00::numeric)$$,
  'original tenant, fee, and owner evidence remains unchanged'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

SELECT throws_ok(
  $$
    UPDATE public.tenant_invoice_corrections
    SET reason = 'Attempted mutation'
    WHERE id = (
      SELECT (void_correction->>'correction_id')::uuid FROM correction_state
    )
  $$,
  '42501',
  'tenant invoice correction occurrences are immutable',
  'correction occurrences reject mutation even for the database owner'
);

UPDATE correction_state
SET payment_invoice_id = app_private.generate_simple_lease_rent_invoice(
  organization_id,
  lease_id,
  (date_trunc('month', current_date) + interval '2 months')::date,
  current_date,
  'manual_recovery',
  admin_id
);

UPDATE correction_state
SET reconciliation_source_id = public.create_financial_reconciliation_source(
  organization_id,
  'INVCORR',
  'Invoice correction settlement guard',
  'bank',
  'property_dedicated',
  'USD',
  property_id,
  '****5732'
);

UPDATE correction_state
SET payment_id = public.record_tenant_invoice_payment(
  organization_id,
  payment_invoice_id,
  1.00,
  current_date,
  reconciliation_source_id,
  'Settlement guard payment',
  jsonb_build_array(jsonb_build_object(
    'lineId', (
      SELECT id
      FROM public.tenant_invoice_lines
      WHERE invoice_id = payment_invoice_id
        AND line_type = 'rent'
        AND reversal_of_id IS NULL
    ),
    'amount', 1.00
  )),
  'invoice-correction-payment-0001'
);

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      organization_id,
      payment_invoice_id,
      'void',
      NULL,
      'Cannot detach settled cash',
      'invoice-correction-paid-void-0001'
    )
    FROM correction_state
  $$,
  '23514',
  'tenant_invoice_settlement_active',
  'void rejects while any tenant payment or allocation remains active'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_corrections
    WHERE tenant_invoice_id = (SELECT payment_invoice_id FROM correction_state)
  ),
  0,
  'settlement rejection appends no correction occurrence'
);

-- Fixture-only setup: the generated rule is already used, so the public
-- effective-dated editor correctly cannot rewrite it. The transaction rolls
-- this direct database-owner change back after exercising the no-fee path.
UPDATE public.lease_billing_terms AS billing
SET
  charge_management_fee_when_active = false,
  updated_by = state.admin_id
FROM correction_state AS state
WHERE billing.organization_id = state.organization_id
  AND billing.id = state.billing_term_id;

UPDATE correction_state
SET no_fee_invoice_id = app_private.generate_simple_lease_rent_invoice(
  organization_id,
  lease_id,
  (date_trunc('month', current_date) + interval '3 months')::date,
  (date_trunc('month', current_date) + interval '3 months')::date,
  'manual_recovery',
  admin_id
);

UPDATE correction_state AS state
SET no_fee_rent_line_id = line.id
FROM public.tenant_invoice_lines AS line
WHERE line.organization_id = state.organization_id
  AND line.invoice_id = state.no_fee_invoice_id
  AND line.line_type = 'rent'
  AND line.reversal_of_id IS NULL;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.management_fee_occurrences AS fee
    WHERE fee.tenant_invoice_id = (SELECT no_fee_invoice_id FROM correction_state)
  ),
  0,
  'a rent invoice can carry owner P&L recognition without a management fee'
);

SELECT set_config('app.owner_close_write_context', 'checked-owner-close-v1', true);
INSERT INTO public.owner_close_series (
  id, organization_id, property_id, owner_person_id, currency, month_start,
  state, created_by, state_changed_by
)
SELECT
  no_fee_close_series_id, organization_id, property_id, owner_person_id, 'USD',
  (date_trunc('month', current_date) + interval '3 months')::date,
  'open', admin_id, admin_id
FROM correction_state;

INSERT INTO public.owner_close_revisions (
  id, owner_close_series_id, organization_id, property_id, owner_person_id,
  currency, month_start, revision_number, status, prepared_by,
  input_watermark, input_hash, content_hash, closed_at, closed_by,
  close_reason, input_canonical
)
SELECT
  no_fee_closed_revision_id, no_fee_close_series_id, organization_id,
  property_id, owner_person_id, 'USD',
  (date_trunc('month', current_date) + interval '3 months')::date,
  1, 'closed', admin_id, 'invoice-correction-no-fee-v1', repeat('c', 64),
  repeat('d', 64), now(), admin_id, 'No-fee rent correction fixture',
  '{"fixture":"invoice-correction-no-fee"}'
FROM correction_state;

UPDATE public.owner_close_series AS series
SET
  state = 'closed',
  active_revision_id = state.no_fee_closed_revision_id,
  current_closed_revision_id = state.no_fee_closed_revision_id,
  state_changed_at = now(),
  state_changed_by = state.admin_id
FROM correction_state AS state
WHERE series.organization_id = state.organization_id
  AND series.id = state.no_fee_close_series_id;

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      organization_id,
      no_fee_invoice_id,
      'line_correction',
      no_fee_rent_line_id,
      'No-fee rent still changes owner P and L',
      'invoice-correction-no-fee-closed-0001'
    )
    FROM correction_state
  $$,
  '55000',
  'owner_close_period_closed',
  'rent recognition fails closed for Owner Close even without a management fee'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM correction_state),
  true
);

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      organization_id,
      payment_invoice_id,
      'void',
      NULL,
      'Unauthorized correction attempt',
      'invoice-correction-unauthorized-0001'
    )
    FROM correction_state
  $$,
  '42501',
  'tenant_invoice_correction_forbidden',
  'a role without finance.correct_records cannot use the authority'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM correction_state),
  true
);

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      '00000000-0000-0000-0000-000000009999',
      invoice_id,
      'void',
      NULL,
      'Cross-organization correction attempt',
      'invoice-correction-cross-org-0001'
    )
    FROM correction_state
  $$,
  '42501',
  'tenant_invoice_correction_forbidden',
  'cross-organization access fails without revealing invoice existence'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT throws_ok(
  $$
    SELECT public.correct_tenant_invoice(
      organization_id,
      payment_invoice_id,
      'void',
      NULL,
      'Missing actor correction attempt',
      'invoice-correction-no-actor-0001'
    )
    FROM correction_state
  $$,
  '42501',
  'tenant_invoice_correction_forbidden',
  'an authenticated database role without an actor claim fails closed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_lines AS line
    WHERE line.invoice_id = (SELECT payment_invoice_id FROM correction_state)
      AND line.reversal_of_id IS NOT NULL
  ),
  0,
  'rejected attempts leave the settled invoice evidence unchanged'
);

SELECT * FROM finish();
ROLLBACK;
