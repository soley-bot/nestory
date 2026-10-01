BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

CREATE TEMP TABLE deposit_safety_state (
  property_id uuid DEFAULT gen_random_uuid(),
  creation jsonb,
  activation jsonb,
  ending jsonb,
  deposit_id uuid
);
INSERT INTO deposit_safety_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON deposit_safety_state TO authenticated;

INSERT INTO public.properties (id, organization_id, name, code, property_type, status, rental_structure)
SELECT property_id, '00000000-0000-0000-0000-000000000001', 'Deposit lifecycle fixture',
  'DS-' || left(property_id::text, 8), 'house', 'active', 'single_space'
FROM deposit_safety_state;

CREATE FUNCTION pg_temp.deposit_safety_command(p_type text, p_amount numeric, p_key text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_deposit uuid; v_account uuid;
BEGIN
  SELECT deposit_id INTO v_deposit FROM deposit_safety_state;
  SELECT account_id INTO v_account FROM public.finance_account_roles
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND role_code = 'security_deposits';
  IF to_regprocedure('public.record_lease_deposit_event_idempotent(uuid,uuid,uuid,text,date,numeric,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.record_lease_deposit_event_idempotent($1,$2,$3,$4,$5,$6,$7,$8)'
      INTO v_id USING '00000000-0000-0000-0000-000000000001'::uuid, v_deposit,
      v_account, p_type, current_date, p_amount, p_key, p_key;
  ELSE
    v_id := public.record_lease_deposit_event_with_account(
      '00000000-0000-0000-0000-000000000001', v_deposit, v_account,
      p_type, current_date, p_amount, p_key);
  END IF;
  RETURN v_id;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;
UPDATE deposit_safety_state SET creation = public.create_property_lease(
  '00000000-0000-0000-0000-000000000001', property_id,
  '80000000-0000-0000-0000-000000000001', current_date - 30, current_date + 335,
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
SELECT * FROM finish();
ROLLBACK;
