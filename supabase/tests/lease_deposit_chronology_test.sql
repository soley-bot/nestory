BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE deposit_chronology_state (
  property_id uuid DEFAULT gen_random_uuid(),
  person_id uuid,
  creation jsonb,
  deposit_id uuid
);
INSERT INTO deposit_chronology_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON deposit_chronology_state TO authenticated;

CREATE FUNCTION pg_temp.chronology_record(p_type text, p_amount numeric, p_date date, p_key text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT public.record_lease_deposit_event_idempotent(
    '00000000-0000-0000-0000-000000000001', state.deposit_id, role.account_id,
    p_type, p_date, p_amount, p_key, p_key
  ) INTO v_id
  FROM deposit_chronology_state AS state
  JOIN public.finance_account_roles AS role
    ON role.organization_id = '00000000-0000-0000-0000-000000000001'
   AND role.role_code = 'security_deposits';
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN v_id;
END;
$$;

CREATE FUNCTION pg_temp.chronology_reverse(p_reference text, p_date date, p_key text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT public.reverse_lease_deposit_event(
    '00000000-0000-0000-0000-000000000001', event.id, p_date, p_key
  ) INTO v_id
  FROM public.lease_deposit_events AS event
  WHERE event.lease_deposit_id = (SELECT deposit_id FROM deposit_chronology_state)
    AND event.reference = p_reference;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RETURN v_id;
END;
$$;

-- Always roll the probe back, including on the unfixed baseline. A missing
-- rejection must not contaminate the remaining scenarios with negative cash.
CREATE FUNCTION pg_temp.chronology_rejection(p_command text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_command;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'probe_accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;
UPDATE deposit_chronology_state SET property_id = public.create_property_minimal(
  '00000000-0000-0000-0000-000000000001',
  (SELECT branch_id FROM public.properties WHERE id = '10000000-0000-0000-0000-000000000001'),
  'Deposit chronology fixture', 'DC-' || left(property_id::text, 8), 'house', NULL,
  current_date - 90, 'deposit-chronology-property:' || property_id::text, NULL, NULL, NULL);
SELECT public.set_property_rental_structure(
  '00000000-0000-0000-0000-000000000001', property_id, 'single_space')
FROM deposit_chronology_state;
UPDATE deposit_chronology_state SET person_id = public.create_person(
  '00000000-0000-0000-0000-000000000001', 'Deposit chronology tenant', NULL,
  'individual', NULL, NULL, NULL, NULL, ARRAY['tenant'],
  (SELECT branch_id FROM public.properties WHERE id = property_id));
UPDATE deposit_chronology_state SET creation = public.create_property_lease(
  '00000000-0000-0000-0000-000000000001', property_id, person_id,
  current_date - 90, current_date + 335, 1100, 'USD', 1, 'monthly',
  'draft', 500, 'USD', 'draft', 'deposit-chronology-create');
UPDATE deposit_chronology_state SET deposit_id = (
  SELECT id FROM public.lease_deposits WHERE lease_id = (creation ->> 'leaseId')::uuid);

SELECT lives_ok($$SELECT pg_temp.chronology_record('received', 100, current_date - 2, 'chronology-late-receipt')$$,
  'a recent receipt establishes current held cash');
SELECT is(pg_temp.chronology_rejection(
  $$SELECT pg_temp.chronology_record('refunded', 20, current_date - 10, 'chronology-early-refund')$$),
  '23514:Deposit event would make historical held balance negative',
  'an unconfirmed deposit cannot refund cash before its receipt');
SELECT is(pg_temp.chronology_rejection(
  $$SELECT pg_temp.chronology_record('retained', 20, current_date - 10, 'chronology-early-retention')$$),
  '23514:Deposit event would make historical held balance negative',
  'a backdated retention cannot consume a later receipt');
SELECT is(pg_temp.chronology_rejection($$SELECT public.record_lease_deposit_event_with_account(
  '00000000-0000-0000-0000-000000000001', (SELECT deposit_id FROM deposit_chronology_state),
  (SELECT account_id FROM public.finance_account_roles WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND role_code = 'security_deposits'), 'applied', current_date - 10, 20, 'chronology-early-application')$$),
  '23514:Deposit event would make historical held balance negative',
  'the checked legacy application path also enforces chronology');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id =
  (SELECT deposit_id FROM deposit_chronology_state)), 1::bigint,
  'rejected backdates leave no deposit events');
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE source_id IN (
  SELECT id FROM public.lease_deposit_events WHERE lease_deposit_id =
    (SELECT deposit_id FROM deposit_chronology_state))), 1::bigint,
  'only the accepted receipt has a Ledger projection');

SELECT lives_ok($$SELECT pg_temp.chronology_record('received', 60, current_date - 15, 'chronology-early-receipt')$$,
  'a valid earlier receipt is allowed after a later receipt was entered');
SELECT lives_ok($$SELECT pg_temp.chronology_record('refunded', 50, current_date - 10, 'chronology-valid-refund')$$,
  'an earlier refund is allowed when cash existed on its business date');
SELECT is(pg_temp.chronology_rejection(
  $$SELECT pg_temp.chronology_record('refunded', 11, current_date - 10, 'chronology-prefix-overdraw')$$),
  '23514:Deposit event would make historical held balance negative',
  'a later positive balance cannot hide an intermediate overdraft');
SELECT is(pg_temp.chronology_rejection(
  $$SELECT pg_temp.chronology_reverse('chronology-early-receipt', current_date - 12, 'chronology-early-receipt-reversal')$$),
  '23514:Deposit event would make historical held balance negative',
  'a receipt reversal cannot strand a later refund even when today remains positive');
SELECT lives_ok($$SELECT pg_temp.chronology_reverse('chronology-early-receipt', current_date - 1,
  'chronology-valid-receipt-reversal')$$,
  'a later receipt reversal preserves the original cash at earlier business dates');
SELECT lives_ok($$SELECT pg_temp.chronology_reverse('chronology-valid-refund', current_date - 9,
  'chronology-valid-refund-reversal')$$,
  'a refund reversal restores cash on its own business date');
SELECT lives_ok($$SELECT pg_temp.chronology_record('refunded', 10, current_date - 15, 'chronology-same-day-refund')$$,
  'same-day receipt and refund are evaluated together despite later entry time');
SELECT is((SELECT sum(CASE WHEN event.reversal_of_id IS NULL THEN
    CASE WHEN event.event_type = 'received' THEN event.amount ELSE -event.amount END
    ELSE CASE WHEN original.event_type = 'received' THEN -event.amount ELSE event.amount END END)
  FROM public.lease_deposit_events AS event
  LEFT JOIN public.lease_deposit_events AS original ON original.id = event.reversal_of_id
  WHERE event.lease_deposit_id = (SELECT deposit_id FROM deposit_chronology_state)),
  90::numeric, 'signed original and reversal events retain the correct final held balance');
SELECT is((SELECT amount FROM public.lease_deposits WHERE id =
  (SELECT deposit_id FROM deposit_chronology_state)), 500::numeric,
  'chronology enforcement preserves the contractual deposit amount');
SELECT is((SELECT deposit_amount FROM public.leases WHERE id =
  (SELECT (creation ->> 'leaseId')::uuid FROM deposit_chronology_state)), 500::numeric,
  'chronology enforcement preserves the Lease agreement');

RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND idempotency_key IN ('chronology-early-refund', 'chronology-early-retention', 'chronology-prefix-overdraw')),
  0::bigint, 'rejected posting leaves no durable idempotency result');
SELECT is(pg_temp.chronology_rejection($$UPDATE public.lease_deposit_events SET event_date = current_date - 5
  WHERE reference = 'chronology-early-receipt' AND lease_deposit_id = (SELECT deposit_id FROM deposit_chronology_state)$$),
  '23514:Deposit event would make historical held balance negative',
  'moving a receipt date forward cannot leave earlier dispositions unfunded');
SELECT is(pg_temp.chronology_rejection($$DELETE FROM public.lease_deposit_events
  WHERE reference = 'chronology-late-receipt' AND lease_deposit_id = (SELECT deposit_id FROM deposit_chronology_state)$$),
  '23514:Deposit event would make historical held balance negative',
  'deleting a receipt cannot leave the later receipt reversal unfunded');
SELECT is((SELECT count(*) FROM public.deposit_rent_custody_confirmations
  WHERE lease_deposit_id = (SELECT deposit_id FROM deposit_chronology_state)), 0::bigint,
  'the regression covers deposits without verified-custody records');

SELECT * FROM finish();
ROLLBACK;
