BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is(
  (
    SELECT count(*)::text
    FROM public.owner_charge_cash_allocations AS allocation
    WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
      AND allocation.property_id = '10000000-0000-0000-0000-000000000001'
  ),
  '5',
  'the guarded correction fixture exposes five automatic owner-cash settlement effects'
);

INSERT INTO public.owner_charge_cash_allocations (
  id, organization_id, property_id, owner_invoice_line_id,
  allocation_date, amount, created_by
)
SELECT
  'c1000000-0000-4000-8000-000000000040',
  candidate.organization_id,
  candidate.property_id,
  candidate.owner_invoice_line_id,
  current_date,
  40.00,
  '00000000-0000-0000-0000-000000000101'
FROM public.owner_charge_cash_allocations AS candidate
JOIN public.owner_invoice_lines AS line
  ON line.organization_id = candidate.organization_id
 AND line.id = candidate.owner_invoice_line_id
WHERE candidate.organization_id = '00000000-0000-0000-0000-000000000001'
  AND candidate.property_id = '10000000-0000-0000-0000-000000000001'
  AND candidate.reversal_of_id IS NULL
  AND line.source_type = 'owner_expense'
  AND candidate.amount = 125.00;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT
      queue.source_type,
      queue.gross_signed_amount,
      queue.allocation_state,
      coalesce(queue.remediation_code, '')
    FROM public.get_owner_event_allocation_queue(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month - 1 day')::date
    ) AS queue
    WHERE queue.source_line_id IN (
      SELECT allocation.id
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
        AND allocation.property_id = '10000000-0000-0000-0000-000000000001'
      UNION ALL
      SELECT adjustment.id
      FROM public.expense_customer_adjustments AS adjustment
      WHERE adjustment.organization_id = '00000000-0000-0000-0000-000000000001'
        AND adjustment.property_id = '10000000-0000-0000-0000-000000000001'
        AND adjustment.responsibility = 'owner'
    )
    ORDER BY 1, 2, 3, 4
  $$,
  $$
    VALUES
      ('owner_invoice_payment'::text, '-100.00'::text, 'allocated'::text, ''::text),
      ('owner_invoice_payment'::text, '-125.00'::text, 'allocated'::text, ''::text),
      ('owner_invoice_payment'::text, '-40.00'::text, 'pending'::text, ''::text),
      ('owner_invoice_payment'::text, '-60.00'::text, 'allocated'::text, ''::text),
      ('owner_invoice_payment'::text, '-85.00'::text, 'allocated'::text, ''::text),
      ('reversal'::text, '-100.00'::text, 'allocated'::text, ''::text),
      ('reversal'::text, '100.00'::text, 'allocated'::text, ''::text)
  $$,
  'the source queue includes full and partial cash settlements plus both atomic reversals'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM public.owner_charge_cash_allocations AS allocation
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = allocation.organization_id
     AND allocation_set.source_type = 'owner_invoice_payment'
     AND allocation_set.source_line_id = allocation.id
    WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
      AND allocation.property_id = '10000000-0000-0000-0000-000000000001'
      AND allocation.reversal_of_id IS NULL
  ),
  '4',
  'all full automatic cash settlement rows are allocated through the Track 3 registry'
);

SELECT lives_ok(
  $$
    SELECT public.allocate_owner_event(
      '00000000-0000-0000-0000-000000000001',
      'owner_invoice_payment',
      'c1000000-0000-4000-8000-000000000040',
      'correction-cash-settlement-partial-40'
    )
  $$,
  'the independent partial automatic cash settlement allocates through the Track 3 registry'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM public.owner_charge_cash_allocations AS allocation
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = allocation.organization_id
     AND allocation_set.source_type = 'reversal'
     AND allocation_set.source_line_id = allocation.id
    WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
      AND allocation.property_id = '10000000-0000-0000-0000-000000000001'
      AND allocation.reversal_of_id IS NOT NULL
  ),
  '1',
  'automatic cash settlement reversal is allocated with exact Track 3 reversal lineage'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = adjustment.organization_id
     AND allocation_set.source_type = 'reversal'
     AND allocation_set.source_line_id = adjustment.id
    WHERE adjustment.organization_id = '00000000-0000-0000-0000-000000000001'
      AND adjustment.property_id = '10000000-0000-0000-0000-000000000001'
      AND adjustment.responsibility = 'owner'
  ),
  '1',
  'owner-paid-cost adjustment reversal is allocated with exact Track 3 reversal lineage'
);

SELECT results_eq(
  $$
    SELECT
      pg_catalog.to_char(cash.amount, 'FM999999999990.00'),
      movement.component::text,
      pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00')
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = cash.organization_id
     AND allocation_set.source_type = 'owner_invoice_payment'
     AND allocation_set.source_line_id = cash.id
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    JOIN public.owner_component_movements AS movement
      ON movement.organization_id = owner_allocation.organization_id
     AND movement.owner_event_owner_allocation_id = owner_allocation.id
    WHERE cash.organization_id = '00000000-0000-0000-0000-000000000001'
      AND cash.property_id = '10000000-0000-0000-0000-000000000001'
      AND cash.reversal_of_id IS NULL
    ORDER BY cash.amount, movement.component
  $$,
  $$
    VALUES
      ('40.00'::text, 'ips_held_owner_cash'::text, '-40.00'::text),
      ('40.00'::text, 'owner_due_to_ips'::text, '-40.00'::text),
      ('60.00'::text, 'ips_held_owner_cash'::text, '-60.00'::text),
      ('60.00'::text, 'owner_due_to_ips'::text, '-60.00'::text),
      ('85.00'::text, 'ips_held_owner_cash'::text, '-85.00'::text),
      ('85.00'::text, 'owner_due_to_ips'::text, '-85.00'::text),
      ('100.00'::text, 'ips_held_owner_cash'::text, '-100.00'::text),
      ('100.00'::text, 'owner_due_to_ips'::text, '-100.00'::text),
      ('125.00'::text, 'ips_held_owner_cash'::text, '-125.00'::text),
      ('125.00'::text, 'owner_due_to_ips'::text, '-125.00'::text)
  $$,
  'full and partial settlements persist equal held-cash and owner-due-to-IPS effects'
);

SELECT results_eq(
  $$
    SELECT
      movement.component::text,
      pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00'),
      pg_catalog.to_char(original_movement.signed_amount, 'FM999999999990.00'),
      allocation_set.reversal_of_allocation_set_id = original_set.id,
      movement.reversal_of_movement_id = original_movement.id
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = cash.organization_id
     AND allocation_set.source_type = 'reversal'
     AND allocation_set.source_line_id = cash.id
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation_set.organization_id
     AND original_set.id = allocation_set.reversal_of_allocation_set_id
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    JOIN public.owner_component_movements AS movement
      ON movement.organization_id = owner_allocation.organization_id
     AND movement.owner_event_owner_allocation_id = owner_allocation.id
    JOIN public.owner_component_movements AS original_movement
      ON original_movement.organization_id = movement.organization_id
     AND original_movement.id = movement.reversal_of_movement_id
    WHERE cash.organization_id = '00000000-0000-0000-0000-000000000001'
      AND cash.property_id = '10000000-0000-0000-0000-000000000001'
      AND cash.reversal_of_id IS NOT NULL
    ORDER BY movement.component
  $$,
  $$
    VALUES
      ('ips_held_owner_cash'::text, '100.00'::text, '-100.00'::text, true, true),
      ('owner_due_to_ips'::text, '100.00'::text, '-100.00'::text, true, true)
  $$,
  'cash settlement reversal persists both exact component opposites and reversal links'
);

SELECT results_eq(
  $$
    SELECT
      movement.component::text,
      pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00'),
      pg_catalog.to_char(original_movement.signed_amount, 'FM999999999990.00'),
      allocation_set.reversal_of_allocation_set_id = original_set.id,
      movement.reversal_of_movement_id = original_movement.id
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = adjustment.organization_id
     AND allocation_set.source_type = 'reversal'
     AND allocation_set.source_line_id = adjustment.id
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation_set.organization_id
     AND original_set.id = allocation_set.reversal_of_allocation_set_id
     AND original_set.source_type = 'owner_paid_cost'
     AND original_set.source_line_id = adjustment.responsibility_id
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    JOIN public.owner_component_movements AS movement
      ON movement.organization_id = owner_allocation.organization_id
     AND movement.owner_event_owner_allocation_id = owner_allocation.id
    JOIN public.owner_component_movements AS original_movement
      ON original_movement.organization_id = movement.organization_id
     AND original_movement.id = movement.reversal_of_movement_id
    WHERE adjustment.organization_id = '00000000-0000-0000-0000-000000000001'
      AND adjustment.property_id = '10000000-0000-0000-0000-000000000001'
      AND adjustment.responsibility = 'owner'
  $$,
  $$
    VALUES ('owner_due_to_ips'::text, '-100.00'::text, '100.00'::text, true, true)
  $$,
  'owner-paid-cost reversal without cash use reverses only the original due component'
);

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'correction-c1-current-period'
    )
  $$,
  'the current period recomputes after automatic cash settlement allocation'
);

SELECT is(
  (
    public.get_owner_available_withdrawal(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      current_date
    )->>'available_withdrawal'
  ),
  '1815.00',
  'partial settlement and both reversals leave the literal authoritative held-cash capacity'
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      1815.01,
      current_date,
      'Post-settlement duplicate payout guard',
      'correction-post-settlement-payout'
    )
  $$,
  '23514',
  'insufficient_authoritative_held_cash',
  'post-settlement distribution cannot duplicate cash already applied to owner charges'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD', 1.00, current_date,
      'Opening-derived cash lineage probe',
      'correction-opening-lineage-payout'
    )
  $$,
  'opening-derived held cash can be consumed only through persisted lineage'
);

SELECT has_column(
  'public',
  'owner_cash_source_consumptions',
  'source_opening_entry_id',
  'held-cash consumption can identify an authoritative opening entry source'
);

CREATE OR REPLACE FUNCTION pg_temp.opening_consumption_source_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_source text;
BEGIN
  EXECUTE $query$
    SELECT consumption.source_opening_entry_id::text
    FROM public.owner_cash_source_consumptions AS consumption
    JOIN public.owner_component_movements AS consumer_movement
      ON consumer_movement.organization_id = consumption.organization_id
     AND consumer_movement.id = consumption.consumer_movement_id
    JOIN public.owner_event_owner_allocations AS consumer_owner
      ON consumer_owner.organization_id = consumer_movement.organization_id
     AND consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS consumer_set
      ON consumer_set.organization_id = consumer_owner.organization_id
     AND consumer_set.id = consumer_owner.allocation_set_id
    WHERE consumer_set.organization_id = '00000000-0000-0000-0000-000000000001'
      AND consumer_set.idempotency_key = 'correction-opening-lineage-payout'
  $query$
  INTO v_source;
  RETURN coalesce(v_source, 'missing');
EXCEPTION
  WHEN undefined_column THEN
    RETURN 'missing';
END;
$$;

SELECT is(
  pg_temp.opening_consumption_source_probe(),
  (
    SELECT entry.id::text
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = '00000000-0000-0000-0000-000000000001'
      AND entry.property_id = '10000000-0000-0000-0000-000000000001'
      AND entry.owner_person_id = '80000000-0000-0000-0000-000000000004'
      AND entry.currency = 'USD'
      AND entry.component = 'ips_held_owner_cash'
      AND entry.entry_kind = 'opening'
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_opening_balance_entries AS reversal
        WHERE reversal.organization_id = entry.organization_id
          AND reversal.reversal_of_entry_id = entry.id
      )
    ORDER BY entry.effective_date, entry.created_at, entry.id
    LIMIT 1
  ),
  'the exact opening entry is persisted as the first chronological cash source'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 'owner_contribution', current_date, 100.00,
      'Cross-month chronological funding',
      'correction-cross-month-funding'
    )
  $$,
  'cross-month guard fixture records one exact held-cash source'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 100.00,
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
      'Later-month consumes the only source',
      'correction-cross-month-later-payout'
    )
  $$,
  'later-month distribution can consume currently uncommitted authority'
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 1.00, current_date,
      'Backdated duplicate source use',
      'correction-cross-month-backdated-payout'
    )
  $$,
  '23514',
  'backdated_owner_cash_consumer',
  'a backdated distribution cannot reuse cash already consumed by a later month'
);

SELECT is(
  (
    SELECT pg_catalog.to_char(coalesce(sum(movement.signed_amount), 0), 'FM999999999990.00')
    FROM public.owner_component_movements AS movement
    WHERE movement.organization_id = '00000000-0000-0000-0000-000000000001'
      AND movement.property_id = '10000000-0000-0000-0000-000000000002'
      AND movement.owner_person_id = '80000000-0000-0000-0000-000000000005'
      AND movement.currency = 'USD'
      AND movement.component = 'ips_held_owner_cash'
      AND movement.event_date <= (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date
  ),
  '0.00',
  'chronological guard leaves the authoritative held-cash movement total nonnegative'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 'owner_contribution', current_date - 1, 10.00,
      'Reversed oldest source A',
      'correction-reversed-oldest-a'
    )
  $$,
  'reversed-source fixture records source A'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 'owner_contribution', current_date, 11.00,
      'Active source B',
      'correction-reversed-oldest-b'
    )
  $$,
  'reversed-source fixture records source B'
);

RESET ROLE;
SELECT set_config('app.owner_balance_write_context', 'checked-owner-balance-v1', true);

INSERT INTO public.owner_event_allocation_sets (
  id, organization_id, property_id, currency, event_date, source_type,
  source_id, source_line_id, gross_signed_amount, source_fingerprint,
  allocation_basis, explicit_owner_person_id, reversal_of_allocation_set_id,
  created_by, idempotency_key, command_payload_hash
)
SELECT
  'c2000000-0000-4000-8000-000000000001',
  original.organization_id,
  original.property_id,
  original.currency,
  current_date,
  'reversal',
  'c2000000-0000-4000-8000-000000000011',
  'c2000000-0000-4000-8000-000000000011',
  -10.00,
  repeat('c', 64),
  'explicit_owner',
  '80000000-0000-0000-0000-000000000005',
  original.id,
  '00000000-0000-0000-0000-000000000701',
  'correction-reversed-oldest-a-reversal',
  repeat('d', 64)
FROM public.owner_event_allocation_sets AS original
WHERE original.organization_id = '00000000-0000-0000-0000-000000000001'
  AND original.idempotency_key = 'correction-reversed-oldest-a';

INSERT INTO public.owner_event_owner_allocations (
  id, allocation_set_id, organization_id, property_owner_id,
  owner_person_id, ownership_percent_snapshot,
  ownership_started_on_snapshot, ownership_ended_on_snapshot,
  ownership_roster_hash, allocated_gross_signed_amount,
  allocation_order, created_by
)
SELECT
  'c2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000001',
  original.organization_id,
  original.property_owner_id,
  original.owner_person_id,
  original.ownership_percent_snapshot,
  original.ownership_started_on_snapshot,
  original.ownership_ended_on_snapshot,
  original.ownership_roster_hash,
  -10.00,
  1,
  '00000000-0000-0000-0000-000000000701'
FROM public.owner_event_owner_allocations AS original
JOIN public.owner_event_allocation_sets AS original_set
  ON original_set.organization_id = original.organization_id
 AND original_set.id = original.allocation_set_id
WHERE original_set.organization_id = '00000000-0000-0000-0000-000000000001'
  AND original_set.idempotency_key = 'correction-reversed-oldest-a';

INSERT INTO public.owner_component_movements (
  id, organization_id, owner_event_owner_allocation_id,
  property_id, owner_person_id, currency, event_date, month_start,
  component, signed_amount, movement_order, reversal_of_movement_id,
  created_by
)
SELECT
  'c2000000-0000-4000-8000-000000000003',
  original.organization_id,
  'c2000000-0000-4000-8000-000000000002',
  original.property_id,
  original.owner_person_id,
  original.currency,
  current_date,
  pg_catalog.date_trunc('month', current_date)::date,
  'ips_held_owner_cash',
  -10.00,
  1,
  original.id,
  '00000000-0000-0000-0000-000000000701'
FROM public.owner_component_movements AS original
JOIN public.owner_event_owner_allocations AS original_owner
  ON original_owner.organization_id = original.organization_id
 AND original_owner.id = original.owner_event_owner_allocation_id
JOIN public.owner_event_allocation_sets AS original_set
  ON original_set.organization_id = original_owner.organization_id
 AND original_set.id = original_owner.allocation_set_id
WHERE original_set.organization_id = '00000000-0000-0000-0000-000000000001'
  AND original_set.idempotency_key = 'correction-reversed-oldest-a'
  AND original.component = 'ips_held_owner_cash';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 10.00,
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
      'Consume only active source B',
      'correction-reversed-oldest-payout'
    )
  $$,
  'a distribution after an exact reversal uses only active held-cash authority'
);

RESET ROLE;
SELECT is(
  (
    SELECT source_set.idempotency_key
    FROM public.owner_cash_source_consumptions AS consumption
    JOIN public.owner_component_movements AS source_movement
      ON source_movement.organization_id = consumption.organization_id
     AND source_movement.id = consumption.source_movement_id
    JOIN public.owner_event_owner_allocations AS source_owner
      ON source_owner.organization_id = source_movement.organization_id
     AND source_owner.id = source_movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS source_set
      ON source_set.organization_id = source_owner.organization_id
     AND source_set.id = source_owner.allocation_set_id
    JOIN public.owner_component_movements AS consumer_movement
      ON consumer_movement.organization_id = consumption.organization_id
     AND consumer_movement.id = consumption.consumer_movement_id
    JOIN public.owner_event_owner_allocations AS consumer_owner
      ON consumer_owner.organization_id = consumer_movement.organization_id
     AND consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS consumer_set
      ON consumer_set.organization_id = consumer_owner.organization_id
     AND consumer_set.id = consumer_owner.allocation_set_id
    WHERE consumer_set.organization_id = '00000000-0000-0000-0000-000000000001'
      AND consumer_set.idempotency_key = 'correction-reversed-oldest-payout'
  ),
  'correction-reversed-oldest-b',
  'FIFO excludes the exactly reversed oldest positive source and links active source B'
);
SET LOCAL ROLE authenticated;

SELECT has_function(
  'app_private',
  'lock_owner_balance_lifecycle',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code'],
  'one private lifecycle lock serializes every producer, consumer, reversal, transfer, correction, and roll-forward'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000801',
  true
);

SELECT lives_ok(
  $$
    SELECT public.submit_owner_opening_balance(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '3 months')::date,
      requested.component,
      requested.amount,
      'Later opening must not restart an authoritative chain',
      'CORRECTION-LATER-OPENING-' || requested.suffix,
      NULL,
      repeat(requested.hash_character, 64),
      NULL,
      'correction-later-opening-' || pg_catalog.lower(requested.suffix)
    )
    FROM (
      VALUES
        ('ips_due_to_owner'::public.owner_balance_component, 1.00::numeric, 'DUE', 'a'),
        ('ips_held_owner_cash'::public.owner_balance_component, 1.00::numeric, 'HELD', 'b'),
        ('owner_due_to_ips'::public.owner_balance_component, 0.00::numeric, 'OWED', 'c'),
        ('security_deposit_custody'::public.owner_balance_component, 0.00::numeric, 'DEPOSIT', 'd')
    ) AS requested(component, amount, suffix, hash_character)
  $$,
  'an exact-four later opening fixture can be submitted for the missing-predecessor oracle'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT lives_ok(
  $$
    SELECT public.review_owner_opening_balance(
      request.organization_id,
      request.id,
      'approve',
      NULL,
      'correction-later-opening-review-' || pg_catalog.lower(request.component::text)
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
      AND request.source_reference LIKE 'CORRECTION-LATER-OPENING-%'
    ORDER BY request.component
  $$,
  'all four later openings are approved to prove they cannot substitute for a predecessor'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT results_eq(
  $$
    SELECT
      generated.result->>'status',
      generated.result->>'blocked_reason_code'
    FROM (
      SELECT public.generate_owner_balance_period(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000004',
        'USD',
        (pg_catalog.date_trunc('month', current_date) + INTERVAL '3 months')::date,
        'correction-missing-predecessor-exact-four'
      ) AS result
    ) AS generated
  $$,
  $$
    VALUES ('blocked'::text, 'prior_period_missing'::text)
  $$,
  'exactly four target-month openings cannot restart a chain with a missing immediate predecessor'
);

RESET ROLE;

INSERT INTO public.people (
  id, organization_id, display_name, legal_name, party_type,
  primary_email, created_by, updated_by
) VALUES (
  'c3000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Correction successor owner',
  'Correction successor owner',
  'individual',
  'correction.successor@example.test',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.person_roles (
  organization_id, person_id, role, status, created_by, updated_by
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'c3000000-0000-4000-8000-000000000003',
  'owner', 'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

UPDATE public.property_owners AS assignment
SET ended_on = (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
    updated_by = '00000000-0000-0000-0000-000000000101'
WHERE assignment.organization_id = '00000000-0000-0000-0000-000000000001'
  AND assignment.property_id = '10000000-0000-0000-0000-000000000002'
  AND assignment.person_id = '80000000-0000-0000-0000-000000000005'
  AND assignment.ended_on IS NULL;

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
) VALUES (
  'c3000000-0000-4000-8000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'c3000000-0000-4000-8000-000000000003',
  'Successor owner', 100.000, true,
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'USD', 'owner_contribution',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
      500.00,
      'Transfer predecessor authority',
      'correction-transfer-predecessor-funding'
    )
  $$,
  'transfer fixture records predecessor held-cash authority before the ownership boundary'
);

RESET ROLE;
SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);

INSERT INTO public.owner_balance_periods (
  id, organization_id, property_id, owner_person_id, currency,
  month_start, status, input_watermark, input_hash,
  generated_at, generated_by
) VALUES (
  'c3000000-0000-4000-8000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000005',
  'USD',
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
  'ready',
  'correction-transfer-predecessor',
  repeat('e', 64),
  now(),
  '00000000-0000-0000-0000-000000000701'
);

INSERT INTO public.owner_balance_period_components (
  owner_balance_period_id, organization_id, component,
  opening_amount, movement_amount, closing_amount, created_by
)
SELECT
  'c3000000-0000-4000-8000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  component,
  0.00,
  CASE component WHEN 'ips_held_owner_cash' THEN 500.00 ELSE 0.00 END,
  CASE component WHEN 'ips_held_owner_cash' THEN 500.00 ELSE 0.00 END,
  '00000000-0000-0000-0000-000000000701'
FROM pg_catalog.unnest(enum_range(NULL::public.owner_balance_component)) AS component;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 0.01,
      'Partial predecessor transfer must be rejected',
      'CORRECTION-TRANSFER-PARTIAL', repeat('1', 64),
      'correction-transfer-partial'
    )
  $$,
  '23514',
  'owner_transfer_amount_below_predecessor_remaining',
  'a one-cent partial transfer cannot falsely reconcile a larger predecessor balance'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      detail->>'previous_owner_person_id',
      detail->>'ownership_started_on',
      item->>'component',
      item->>'closing_amount'
    FROM (
      SELECT app_private.get_unresolved_owner_transfer_detail(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002',
        'c3000000-0000-4000-8000-000000000003',
        'USD',
        (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date
      ) AS detail
    ) AS unresolved
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      unresolved.detail->'unsettled_components'
    ) AS item
  $$,
  $$
    VALUES (
      '80000000-0000-0000-0000-000000000005'::text,
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date::text,
      'ips_held_owner_cash'::text,
      '500.00'::text
    )
  $$,
  'a rejected partial transfer leaves the exact predecessor component amount unresolved'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 500.01,
      'Over predecessor remaining transfer',
      'CORRECTION-TRANSFER-OVER', repeat('2', 64),
      'correction-transfer-over'
    )
  $$,
  '23514',
  'owner_transfer_amount_exceeds_predecessor_remaining',
  'an over-transfer is rejected against the exact predecessor period remainder'
);

SELECT lives_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 500.00,
      'Exact predecessor transfer',
      'CORRECTION-TRANSFER-EXACT', repeat('3', 64),
      'correction-transfer-exact'
    )
  $$,
  'one exact transfer clears the authoritative predecessor component amount'
);

SELECT results_eq(
  $$
    SELECT
      instruction.amount::text,
      line.line_direction,
      line.signed_amount::text
    FROM public.owner_component_transfer_instructions AS instruction
    JOIN public.owner_component_transfer_lines AS line
      ON line.organization_id = instruction.organization_id
     AND line.transfer_instruction_id = instruction.id
    WHERE instruction.organization_id = '00000000-0000-0000-0000-000000000001'
      AND instruction.idempotency_key = 'correction-transfer-exact'
    ORDER BY instruction.amount, line.line_direction
  $$,
  $$
    VALUES
      ('500.00'::text, 'from_owner'::text, '-500.00'::text),
      ('500.00'::text, 'to_owner'::text, '500.00'::text)
  $$,
  'the exact transfer retains equal-and-opposite immutable lines'
);

RESET ROLE;

SELECT is(
  app_private.get_unresolved_owner_transfer_detail(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'c3000000-0000-4000-8000-000000000003',
    'USD',
    (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date
  ),
  NULL::jsonb,
  'the successor resolves only after the exact predecessor remainder reaches zero'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 0.01,
      'Duplicate cleared transfer',
      'CORRECTION-TRANSFER-DUPLICATE', repeat('4', 64),
      'correction-transfer-duplicate'
    )
  $$,
  '23514',
  'owner_transfer_no_remaining_balance',
  'a duplicate transfer cannot consume beyond an exactly cleared predecessor component'
);

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months 1 day')::date,
      'ips_held_owner_cash', 0.01,
      'Wrong ownership boundary transfer',
      'CORRECTION-TRANSFER-WRONG-DATE', repeat('5', 64),
      'correction-transfer-wrong-date'
    )
  $$,
  '22023',
  'owner_transfer_effective_date_mismatch',
  'a transfer date must exactly equal the predecessor-successor ownership boundary'
);

RESET ROLE;
SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);

UPDATE public.owner_balance_periods
SET status = 'stale',
    stale_at = now(),
    stale_reason = 'correction stale predecessor oracle'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = 'c3000000-0000-4000-8000-000000000010';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 0.01,
      'Stale predecessor transfer',
      'CORRECTION-TRANSFER-STALE', repeat('6', 64),
      'correction-transfer-stale'
    )
  $$,
  '23514',
  'owner_transfer_predecessor_not_authoritative',
  'a stale predecessor period cannot authorize a transfer'
);

RESET ROLE;
SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);

DELETE FROM public.owner_balance_period_components
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND owner_balance_period_id = 'c3000000-0000-4000-8000-000000000010';
DELETE FROM public.owner_balance_periods
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = 'c3000000-0000-4000-8000-000000000010';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.transfer_owner_balance_component(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000005',
      'c3000000-0000-4000-8000-000000000003',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '2 months')::date,
      'ips_held_owner_cash', 0.01,
      'Missing predecessor transfer',
      'CORRECTION-TRANSFER-MISSING', repeat('7', 64),
      'correction-transfer-missing'
    )
  $$,
  '23514',
  'owner_transfer_predecessor_missing',
  'a transfer cannot be created without the exact immediate predecessor period'
);

RESET ROLE;

INSERT INTO public.owner_invoices (
  id, organization_id, property_id, owner_person_id, invoice_number,
  billing_period_start, issue_date, due_date, currency, lifecycle,
  idempotency_key, created_by
) VALUES (
  'c1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'CORRECTION-UNMAPPED-001',
  '2030-01-01', current_date, current_date, 'USD', 'issued',
  'correction-unmapped-invoice',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.owner_invoice_lines (
  id, organization_id, invoice_id, property_id, source_type, source_id,
  customer_label, description, amount, sort_order, created_by
) VALUES (
  'c1000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'management_fee',
  'c1000000-0000-4000-8000-000000000099',
  'Unmapped legacy owner cash settlement',
  'No ratified underlying Track 3 source exists',
  10.00, 1,
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.owner_charge_cash_allocations (
  id, organization_id, property_id, owner_invoice_line_id,
  allocation_date, amount, created_by
) VALUES (
  'c1000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'c1000000-0000-4000-8000-000000000002',
  current_date, 10.00,
  '00000000-0000-0000-0000-000000000101'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT
      queue.source_type,
      queue.gross_signed_amount,
      queue.allocation_state,
      queue.remediation_code
    FROM public.get_owner_event_allocation_queue(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month - 1 day')::date
    ) AS queue
    WHERE queue.source_line_id = 'c1000000-0000-4000-8000-000000000003'
  $$,
  $$
    VALUES (
      'owner_invoice_payment'::text,
      '-10.00'::text,
      'blocked'::text,
      'legacy_owner_cash_settlement_source_unallocated'::text
    )
  $$,
  'an unmappable legacy automatic cash row remains visible as typed blocking remediation'
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_distribution(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD', 1.00, current_date,
      'Blocked by unmapped owner cash source',
      'correction-unmapped-source-payout'
    )
  $$,
  '23514',
  'owner_cash_source_remediation_required',
  'an unmapped legacy cash effect blocks withdrawal capacity instead of permitting payout'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
