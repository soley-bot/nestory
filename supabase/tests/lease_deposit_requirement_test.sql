BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE requirement_state (
  property_id uuid DEFAULT gen_random_uuid(), person_id uuid, creation jsonb,
  deposit_id uuid, lease_id uuid, event_snapshot jsonb, ledger_snapshot jsonb
);
INSERT INTO requirement_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON requirement_state TO authenticated;

CREATE FUNCTION pg_temp.change_requirement(p_amount numeric, p_expected numeric, p_key text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT public.update_lease_deposit_requirement(
    '00000000-0000-0000-0000-000000000001', lease_id, p_amount, p_expected,
    'Updated agreed deposit in lease', p_key, deposit_id)
  FROM requirement_state;
$$;
CREATE FUNCTION pg_temp.record_requirement_event(p_type text, p_amount numeric, p_key text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT public.record_lease_deposit_event_idempotent(
    '00000000-0000-0000-0000-000000000001', deposit_id,
    (SELECT account_id FROM public.finance_account_roles
      WHERE organization_id='00000000-0000-0000-0000-000000000001' AND role_code='security_deposits'),
    p_type, current_date, p_amount, p_key, p_key)
  FROM requirement_state;
$$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
SET LOCAL ROLE authenticated;
UPDATE requirement_state SET property_id = public.create_property_minimal(
  '00000000-0000-0000-0000-000000000001',
  (SELECT branch_id FROM public.properties WHERE id='10000000-0000-0000-0000-000000000001'),
  'Deposit requirement fixture', 'DR-' || left(property_id::text,8), 'house', NULL,
  current_date-30, 'deposit-requirement-property:' || property_id::text, NULL,NULL,NULL);
SELECT public.set_property_rental_structure('00000000-0000-0000-0000-000000000001',property_id,'single_space') FROM requirement_state;
UPDATE requirement_state SET person_id = public.create_person(
  '00000000-0000-0000-0000-000000000001','Deposit requirement tenant',NULL,
  'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],
  (SELECT branch_id FROM public.properties WHERE id=property_id));
UPDATE requirement_state SET creation = public.create_property_lease(
  '00000000-0000-0000-0000-000000000001',property_id,person_id,
  current_date-30,current_date+335,1100,'USD',1,'monthly','draft',500,'USD','draft','deposit-requirement-create');
UPDATE requirement_state SET lease_id=(creation->>'leaseId')::uuid;
UPDATE requirement_state SET deposit_id=(SELECT id FROM public.lease_deposits WHERE lease_id=requirement_state.lease_id);

SELECT throws_matching($$SELECT pg_temp.change_requirement(750,500,'requirement-draft')$$,
  'active_lease_required','drafts retain their separate preparation workflow');
SELECT public.transition_lease_lifecycle('00000000-0000-0000-0000-000000000001',lease_id,
  'draft',(creation->>'occupancyId')::uuid,'activate',current_date,NULL,
  'Confirmed fixture move-in','deposit-requirement-activate') FROM requirement_state;
SELECT lives_ok($$SELECT pg_temp.change_requirement(750,500,'requirement-edit')$$,'active required deposit can differ from rent');
SELECT is((SELECT amount FROM public.lease_deposits WHERE id=(SELECT deposit_id FROM requirement_state)),750::numeric,'deposit requirement saved');
SELECT is((SELECT deposit_amount FROM public.leases WHERE id=(SELECT lease_id FROM requirement_state)),750::numeric,'lease requirement kept in sync');
SELECT is((SELECT rent_amount FROM public.lease_terms WHERE lease_id=(SELECT lease_id FROM requirement_state) AND status='active'),1100::numeric,'rent is unchanged');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id=(SELECT deposit_id FROM requirement_state)),0::bigint,'changing requirement records no receipt');
SELECT lives_ok($$SELECT pg_temp.change_requirement(750,500,'requirement-edit')$$,'identical retry returns its original result');
SELECT throws_matching($$SELECT pg_temp.change_requirement(800,750,'requirement-edit')$$,'different|[Cc]onflict','a retry key cannot carry a different edit');
SELECT throws_matching($$SELECT pg_temp.change_requirement(900,500,'requirement-stale')$$,'requirement_changed','stale form cannot overwrite a new requirement');
SELECT throws_matching($$SELECT pg_temp.change_requirement(-1,750,'requirement-negative')$$,'requirement_invalid','negative requirement rejected');
SELECT throws_matching($$SELECT pg_temp.change_requirement(1.001,750,'requirement-fraction')$$,'requirement_invalid','fractional cents rejected');
SELECT throws_matching($$SELECT pg_temp.change_requirement('NaN'::numeric,750,'requirement-nan')$$,'requirement_invalid','nonfinite requirement rejected');

SELECT pg_temp.record_requirement_event('received',400,'requirement-receipt');
RESET ROLE;
UPDATE requirement_state SET
  event_snapshot=(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.lease_deposit_events e WHERE e.lease_deposit_id=requirement_state.deposit_id),
  ledger_snapshot=(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.ledger_entries l WHERE l.source_id IN
    (SELECT id FROM public.lease_deposit_events WHERE lease_deposit_id=requirement_state.deposit_id));
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.change_requirement(1000,750,'requirement-with-cash')$$,'requirement remains editable after receipt');
SELECT lives_ok($$SELECT pg_temp.change_requirement(400,1000,'requirement-down-to-held')$$,'requirement may be reduced to the held amount');
SELECT throws_matching($$SELECT pg_temp.change_requirement(399,400,'requirement-below-held')$$,'requirement_below_held','required amount cannot fall below held cash');
RESET ROLE;
SELECT is(app_private.deposit_rent_held('00000000-0000-0000-0000-000000000001',(SELECT deposit_id FROM requirement_state)),400::numeric,'held cash unchanged');
SELECT is((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.lease_deposit_events e WHERE e.lease_deposit_id=(SELECT deposit_id FROM requirement_state)),
  (SELECT event_snapshot FROM requirement_state),'receipt history byte-for-byte unchanged');
SELECT is((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.ledger_entries l WHERE l.source_id IN
  (SELECT id FROM public.lease_deposit_events WHERE lease_deposit_id=(SELECT deposit_id FROM requirement_state))),
  (SELECT ledger_snapshot FROM requirement_state),'Ledger evidence unchanged');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id=(SELECT lease_id FROM requirement_state) AND action='deposit_requirement_changed'),3::bigint,'only successful unique changes produce audit entries');
SELECT is((SELECT new_values->>'reason' FROM public.activity_logs WHERE entity_id=(SELECT lease_id FROM requirement_state) AND action='deposit_requirement_changed' LIMIT 1),
  'Updated agreed deposit in lease','reason retained in audit history');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.change_requirement(750,500,'requirement-edit')$$,'old replay after later edits does not overwrite the newer requirement');
SELECT is((SELECT amount FROM public.lease_deposits WHERE id=(SELECT deposit_id FROM requirement_state)),400::numeric,'newer amount survives old replay');
SELECT pg_temp.record_requirement_event('refunded',400,'requirement-refund');
SELECT lives_ok($$SELECT pg_temp.change_requirement(0,400,'requirement-waive')$$,'zero allowed after held funds are refunded');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id=(SELECT deposit_id FROM requirement_state)),2::bigint,'zero requirement preserves receipt and refund');
SELECT is((SELECT amount FROM public.lease_deposits WHERE id=(SELECT deposit_id FROM requirement_state)),0::numeric,'zero requirement preserves its deposit header');
SELECT lives_ok($$SELECT pg_temp.change_requirement(250,0,'requirement-reinstate')$$,'a zero requirement can be increased again');
SELECT lives_ok($$SELECT pg_temp.record_requirement_event('received',250,'requirement-new-receipt')$$,'receipts use the edited requirement');

SELECT throws_matching($$SELECT public.update_lease_deposit_requirement(gen_random_uuid(),(SELECT lease_id FROM requirement_state),500,250,'Wrong organization attempt','requirement-cross-org',(SELECT deposit_id FROM requirement_state))$$,
  'Not authorized','cross-organization attempt denied');
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
SELECT throws_matching($$SELECT pg_temp.change_requirement(500,250,'requirement-no-permission')$$,'Not authorized','caller without permission denied');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);

-- A distinct active lease with no header can establish its requirement.
UPDATE requirement_state SET property_id = public.create_property_minimal(
  '00000000-0000-0000-0000-000000000001',
  (SELECT branch_id FROM public.properties WHERE id='10000000-0000-0000-0000-000000000001'),
  'Empty requirement fixture','DR-EMPTY-' || left(gen_random_uuid()::text,8),'house',NULL,
  current_date-30,'deposit-requirement-empty-property',NULL,NULL,NULL);
SELECT public.set_property_rental_structure('00000000-0000-0000-0000-000000000001',property_id,'single_space') FROM requirement_state;
UPDATE requirement_state SET person_id = public.create_person(
  '00000000-0000-0000-0000-000000000001','Second deposit requirement tenant',NULL,
  'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],
  (SELECT branch_id FROM public.properties WHERE id=property_id));
UPDATE requirement_state SET creation = public.create_property_lease(
  '00000000-0000-0000-0000-000000000001',property_id,person_id,
  current_date-30,current_date+335,1100,'USD',1,'monthly','draft',NULL,NULL,'draft','deposit-requirement-empty');
UPDATE requirement_state SET lease_id=(creation->>'leaseId')::uuid,deposit_id=NULL;
SELECT public.transition_lease_lifecycle('00000000-0000-0000-0000-000000000001',lease_id,
  'draft',(creation->>'occupancyId')::uuid,'activate',current_date,NULL,
  'Confirmed fixture move-in','deposit-requirement-empty-activate') FROM requirement_state;
SELECT lives_ok($$SELECT pg_temp.change_requirement(300,0,'requirement-first-header')$$,'missing deposit header created atomically');
SELECT is((SELECT count(*) FROM public.lease_deposits WHERE lease_id=(SELECT lease_id FROM requirement_state)),1::bigint,'only one deposit created');
SELECT lives_ok($$SELECT pg_temp.change_requirement(300,0,'requirement-first-header')$$,'new-header creation is retry safe');
SELECT throws_matching($$SELECT pg_temp.change_requirement(350,0,'requirement-stale-empty')$$,'requirement_changed','stale empty form cannot create a duplicate header');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id IN
  (SELECT id FROM public.lease_deposits WHERE lease_id=(SELECT lease_id FROM requirement_state))),0::bigint,'initial requirement creates no cash');

SELECT * FROM finish();
ROLLBACK;
