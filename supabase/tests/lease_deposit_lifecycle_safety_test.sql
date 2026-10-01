BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE deposit_safety_state (
  property_id uuid DEFAULT gen_random_uuid(),
  person_id uuid,
  creation jsonb,
  activation jsonb,
  ending jsonb,
  deposit_id uuid
);
INSERT INTO deposit_safety_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON deposit_safety_state TO authenticated;

CREATE FUNCTION pg_temp.deposit_safety_command(
  p_type text, p_amount numeric, p_key text, p_date date DEFAULT current_date,
  p_reference text DEFAULT NULL, p_account uuid DEFAULT NULL, p_deposit uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_deposit uuid; v_account uuid;
BEGIN
  SELECT coalesce(p_deposit, deposit_id) INTO v_deposit FROM deposit_safety_state;
  SELECT coalesce(p_account, account_id) INTO v_account FROM public.finance_account_roles
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND role_code = 'security_deposits';
  IF to_regprocedure('public.record_lease_deposit_event_idempotent(uuid,uuid,uuid,text,date,numeric,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.record_lease_deposit_event_idempotent($1,$2,$3,$4,$5,$6,$7,$8)'
      INTO v_id USING '00000000-0000-0000-0000-000000000001'::uuid, v_deposit,
      v_account, p_type, p_date, p_amount, coalesce(p_reference, p_key), p_key;
  ELSE
    v_id := public.record_lease_deposit_event_with_account(
      '00000000-0000-0000-0000-000000000001', v_deposit, v_account,
      p_type, p_date, p_amount, coalesce(p_reference, p_key));
  END IF;
  RETURN v_id;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;
UPDATE deposit_safety_state SET property_id = public.create_property_minimal(
  '00000000-0000-0000-0000-000000000001',
  (SELECT branch_id FROM public.properties WHERE id = '10000000-0000-0000-0000-000000000001'),
  'Deposit lifecycle fixture', 'DS-' || left(property_id::text, 8), 'house', NULL,
  current_date, 'deposit-safety-property:' || property_id::text, NULL, NULL, NULL);
SELECT public.set_property_rental_structure(
  '00000000-0000-0000-0000-000000000001', property_id, 'single_space')
FROM deposit_safety_state;
UPDATE deposit_safety_state SET person_id = public.create_person(
  '00000000-0000-0000-0000-000000000001', 'Deposit safety tenant', NULL,
  'individual', NULL, NULL, NULL, NULL, ARRAY['tenant'],
  (SELECT branch_id FROM public.properties WHERE id = property_id));
UPDATE deposit_safety_state SET creation = public.create_property_lease(
  '00000000-0000-0000-0000-000000000001', property_id,
  person_id, current_date - 30, current_date + 335,
  1100, 'USD', 1, 'monthly', 'draft', 500, 'USD', 'draft', 'deposit-safety-create');
UPDATE deposit_safety_state SET deposit_id = (
  SELECT id FROM public.lease_deposits WHERE lease_id = (creation ->> 'leaseId')::uuid);

SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt');
SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE reference = 'deposit-safety-receipt'),
  1::bigint, 'lost-response receipt retry records one event');
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE source_id IN (
  SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-receipt')),
  1::bigint, 'receipt retry records one Ledger projection');
SELECT pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-refund');
SELECT pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-refund');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE reference = 'deposit-safety-refund'),
  1::bigint, 'lost-response refund retry records one event');
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE source_id IN (
  SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-refund')),
  1::bigint, 'refund retry records one Ledger projection');
SELECT is(pg_temp.deposit_safety_command('received', 100.00, 'deposit-safety-receipt'),
  (SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-receipt'),
  'receipt replay returns its original identity with normalized numeric scale');
SELECT is(pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-refund'),
  (SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-refund'),
  'refund replay returns its original identity');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 101, 'deposit-safety-receipt')$$,
  'Conflicting financial idempotency request', 'retry key binds amount');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('refunded', 100, 'deposit-safety-receipt')$$,
  'Conflicting financial idempotency request', 'retry key binds event type');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt', current_date + 1)$$,
  'Conflicting financial idempotency request', 'retry key binds date');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt', current_date, 'Different receipt')$$,
  'Conflicting financial idempotency request', 'retry key binds reference');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt', current_date, NULL,
  '88000000-0000-0000-0000-000000000999')$$,
  'Conflicting financial idempotency request', 'retry key binds liability account');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('refunded', 51, 'deposit-safety-over-refund')$$,
  'exceeds held deposit balance', 'fresh refund cannot overspend held cash');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 0.001, 'deposit-safety-subcent')$$,
  'Valid deposit activity', 'subcent receipt cannot silently change recorded cash');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 'NaN'::numeric, 'deposit-safety-nan')$$,
  'Valid deposit activity', 'non-finite deposit amount is rejected');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('applied', 1, 'deposit-safety-applied')$$,
  'Valid deposit activity', 'new UI command does not complete deposit-to-rent work');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt')$$,
  'Not authorized', 'completed retry remains protected by current property authorization');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt')$$,
  'Not authenticated', 'completed retry cannot bypass authentication');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT throws_matching($$SELECT public.record_lease_deposit_event_idempotent(
  '00000000-0000-0000-0000-000000000002', (SELECT deposit_id FROM deposit_safety_state),
  NULL, 'received', current_date, 100, 'deposit-safety-receipt', 'deposit-safety-receipt')$$,
  'Not authorized', 'cross-organization deposit identity is rejected');

UPDATE deposit_safety_state SET activation = public.transition_lease_lifecycle(
  '00000000-0000-0000-0000-000000000001', (creation ->> 'leaseId')::uuid,
  'draft', (creation ->> 'occupancyId')::uuid, 'activate', current_date, NULL,
  'Confirmed keys received for the deposit fixture', 'deposit-safety-activate');
UPDATE deposit_safety_state SET ending = public.transition_lease_lifecycle(
  '00000000-0000-0000-0000-000000000001', (creation ->> 'leaseId')::uuid,
  'active', (activation ->> 'occupancyId')::uuid, 'end', current_date, NULL,
  'Confirmed keys returned for the deposit fixture', 'deposit-safety-end');
SELECT public.archive_lease('00000000-0000-0000-0000-000000000001', (creation ->> 'leaseId')::uuid)
FROM deposit_safety_state;
SELECT lives_ok($$SELECT pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-archived-refund')$$,
  'archived ended Lease can settle held deposit cash');
SELECT is((SELECT count(*) FROM public.leases WHERE id = (
  SELECT (creation ->> 'leaseId')::uuid FROM deposit_safety_state) AND archived_at IS NOT NULL AND status = 'ended'),
  1::bigint, 'refund preserves archived ended Lease lifecycle');
SELECT throws_matching($$SELECT public.restore_lease('00000000-0000-0000-0000-000000000001',
  (SELECT (creation ->> 'leaseId')::uuid FROM deposit_safety_state))$$,
  'checked relationship', 'deposit settlement does not bypass the checked restore boundary');
SELECT has_function('public', 'record_lease_deposit_event_idempotent',
  ARRAY['uuid','uuid','uuid','text','date','numeric','text','text'], 'checked deposit command accepts an idempotency key');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('received', 1, 'deposit-safety-archived-receipt')$$,
  'Not authorized|not found', 'archived Lease cannot accept a fresh receipt');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('retained', 1, 'deposit-safety-archived-retained')$$,
  'Not authorized|not found', 'archived recovery is limited to cash refund');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('refunded', 1, 'deposit-safety-archived-over-refund')$$,
  'exceeds held deposit balance', 'archived refund cannot exceed remaining custody');
SELECT lives_ok($$SELECT public.reverse_lease_deposit_event(
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-archived-refund'),
  current_date, 'deposit-safety-refund-reversal')$$,
  'mistaken archived refund can be corrected through the checked reversal command');
SELECT is(pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-archived-refund'),
  (SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-archived-refund'),
  'retry of a reversed refund returns its original event without reposting');
SELECT lives_ok($$SELECT pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-corrected-refund')$$,
  'corrected archived refund uses a fresh command identity');
SELECT is((SELECT count(*) FROM public.ledger_entries reversal JOIN public.ledger_entries original
  ON original.id = reversal.reversal_of_ledger_entry_id WHERE original.source_id = (
    SELECT id FROM public.lease_deposit_events WHERE reference = 'deposit-safety-archived-refund')),
  1::bigint, 'archived refund correction retains one linked Ledger reversal');
SELECT is((SELECT count(DISTINCT liability_account_id) FROM public.lease_deposit_events
  WHERE lease_deposit_id = (SELECT deposit_id FROM deposit_safety_state)),
  1::bigint, 'refund correction preserves liability account identity');
SELECT public.set_financial_month_lock('00000000-0000-0000-0000-000000000001',
  date_trunc('month', current_date)::date, true, 'Deposit safety closed-month fixture');
SELECT lives_ok($$SELECT pg_temp.deposit_safety_command('received', 100, 'deposit-safety-receipt')$$,
  'lost-response receipt retry survives later archive and month close without cash writes');
SELECT lives_ok($$SELECT pg_temp.deposit_safety_command('refunded', 50, 'deposit-safety-archived-refund')$$,
  'completed archived refund retry survives later month close without cash writes');
SELECT throws_matching($$SELECT pg_temp.deposit_safety_command('refunded', 1, 'deposit-safety-closed-refund')$$,
  'Financial month is locked', 'fresh archived refund still respects a closed month');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action = 'lease_deposit_event_recorded'
  AND entity_id = (SELECT (creation ->> 'leaseId')::uuid FROM deposit_safety_state)),
  4::bigint, 'each receipt/refund has one audit event and retries add none');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id = (SELECT deposit_id FROM deposit_safety_state)),
  5::bigint, 'rejections and post-close replays add no deposit events');
SELECT ok(NOT has_function_privilege('anon',
  'public.record_lease_deposit_event_idempotent(uuid,uuid,uuid,text,date,numeric,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('service_role',
  'public.record_lease_deposit_event_idempotent(uuid,uuid,uuid,text,date,numeric,text,text)', 'EXECUTE'),
  'new financial command does not grant anonymous or service-role execution');
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND operation = 'record_lease_deposit_event' AND idempotency_key LIKE 'deposit-safety-%'),
  4::bigint, 'rejected requests leave no persistent idempotency claims');
SELECT * FROM finish();
ROLLBACK;
