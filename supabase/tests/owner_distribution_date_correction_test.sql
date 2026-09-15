BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('dd150000-0000-4000-8000-000000000010','authenticated','authenticated',
 'owner-date@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug)
VALUES('dd150000-0000-4000-8000-000000000001','Owner date test','owner-date-test');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('dd150000-0000-4000-8000-000000000001','dd150000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('dd150000-0000-4000-8000-000000000003','dd150000-0000-4000-8000-000000000001','Owner test');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('dd150000-0000-4000-8000-000000000001','dd150000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.properties(id,organization_id,name,code,property_type)
VALUES('dd150000-0000-4000-8000-000000000002','dd150000-0000-4000-8000-000000000001','Test property','DATE-TEST','Apartment');
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
VALUES('dd150000-0000-4000-8000-000000000001','dd150000-0000-4000-8000-000000000002',
 'dd150000-0000-4000-8000-000000000003',100,current_date-365,true);
CREATE TEMP TABLE owner_date_state(original jsonb, later jsonb, corrected jsonb);
INSERT INTO owner_date_state DEFAULT VALUES;
GRANT ALL ON owner_date_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','dd150000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT public.record_owner_cash_event('dd150000-0000-4000-8000-000000000001',
 'dd150000-0000-4000-8000-000000000002','dd150000-0000-4000-8000-000000000003',
 'USD','owner_contribution',current_date-60,1000,'Fund property account','date-test-contribution');
SELECT is((SELECT sum(balance_effect) FROM public.property_account_entries
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),1000::numeric,'contribution is visible as money in');
SELECT is((SELECT running_balance FROM public.property_finance_positions
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),1000::numeric,'contribution increases owner balance');
SELECT is((SELECT rent_income FROM public.property_finance_positions
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),0::numeric,'contribution is not rental income');
UPDATE owner_date_state SET later=public.record_owner_distribution('dd150000-0000-4000-8000-000000000001',
 'dd150000-0000-4000-8000-000000000002','dd150000-0000-4000-8000-000000000003',
 'USD',100,current_date-5,'Later payout','date-test-later');
UPDATE owner_date_state SET original=public.record_owner_distribution('dd150000-0000-4000-8000-000000000001',
 'dd150000-0000-4000-8000-000000000002','dd150000-0000-4000-8000-000000000003',
 'USD',400,current_date,'Original payout','date-test-original');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (original->>'property_withdrawal_id')::uuid,current_date-61,'Correct actual bank date','date-test-unfunded')
 FROM owner_date_state$$,'23514',NULL,'date before cash arrived is rejected');
SELECT is((SELECT count(*) FROM public.property_withdrawals WHERE property_id='dd150000-0000-4000-8000-000000000002'),
 2::bigint,'failed correction rolls back reversal and replacement');
CREATE TEMP TABLE later_reserved_cash_before AS SELECT c.* FROM public.owner_cash_source_consumptions c
 JOIN public.owner_component_movements m ON m.id=c.consumer_movement_id
 JOIN public.owner_event_owner_allocations a ON a.id=m.owner_event_owner_allocation_id
 JOIN public.owner_event_allocation_sets s ON s.id=a.allocation_set_id
 WHERE s.source_line_id=(SELECT (later->>'property_withdrawal_id')::uuid FROM owner_date_state);
SELECT ok((SELECT count(*)>0 FROM later_reserved_cash_before),'later payout has real cash reservations before correction');
UPDATE owner_date_state SET corrected=public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (original->>'property_withdrawal_id')::uuid,(date_trunc('month',current_date)-interval '1 day')::date,
 'Correct actual bank date','date-test-correct');
SELECT is((SELECT count(*) FROM later_reserved_cash_before b WHERE NOT EXISTS(
 SELECT 1 FROM public.owner_cash_source_consumptions c WHERE to_jsonb(c)=to_jsonb(b))),0::bigint,
 'backdating preserves the later payout cash source reservations');
SELECT ok((SELECT corrected->>'withdrawalId' IS NOT NULL AND corrected->>'reversalId' IS NOT NULL FROM owner_date_state),
 'correction returns replacement and reversal identities');
SELECT is((SELECT withdrawal_date FROM public.property_withdrawals WHERE id=(SELECT (original->>'property_withdrawal_id')::uuid FROM owner_date_state)),
 current_date,'original retains its posted date');
SELECT is((SELECT withdrawal_date FROM public.property_withdrawals WHERE id=(SELECT (corrected->>'withdrawalId')::uuid FROM owner_date_state)),
 (date_trunc('month',current_date)-interval '1 day')::date,'replacement uses the corrected date across month boundary');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE property_id='dd150000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),500::numeric,
 'correction preserves current held cash and existing later payout');
SELECT is((SELECT sum(balance_effect) FROM public.property_account_entries
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),500::numeric,'register does not double count reversed distributions');
SELECT is((SELECT running_balance FROM public.property_finance_positions
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),500::numeric,'summary agrees with corrected register');
SELECT is((SELECT available_withdrawal FROM public.property_finance_positions
 WHERE property_id='dd150000-0000-4000-8000-000000000002'),500::numeric,'available cash includes contribution and correct reversal signs');
SELECT is((SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (original->>'property_withdrawal_id')::uuid,(date_trunc('month',current_date)-interval '1 day')::date,
 'Correct actual bank date','date-test-correct') FROM owner_date_state),
 (SELECT corrected FROM owner_date_state),'retry is idempotent');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (original->>'property_withdrawal_id')::uuid,current_date-10,
 'Correct actual bank date','date-test-correct') FROM owner_date_state$$,
 NULL,NULL,'same key cannot be reused with a different payload');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (original->>'property_withdrawal_id')::uuid,current_date-10,'Different date request','date-test-second') FROM owner_date_state$$,
 '23514','owner_distribution_already_reversed','already corrected original cannot be corrected twice');
SELECT public.set_financial_month_lock('dd150000-0000-4000-8000-000000000001',current_date,true,'Protect correction test');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (later->>'property_withdrawal_id')::uuid,current_date-4,'Correct actual bank date','date-test-closed') FROM owner_date_state$$,
 NULL,NULL,'closed financial period blocks correction');
SELECT public.set_financial_month_lock('dd150000-0000-4000-8000-000000000001',current_date,false,'Release correction test');
-- A known user key must never cause the correction to reuse a separate payout.
SELECT public.record_owner_distribution('dd150000-0000-4000-8000-000000000001',
 'dd150000-0000-4000-8000-000000000002','dd150000-0000-4000-8000-000000000003',
 'USD',100,current_date-4,'Later payout','date-replacement:date-test-preclaimed');
CREATE TEMP TABLE reserved_cash_before AS SELECT c.* FROM public.owner_cash_source_consumptions c
 JOIN public.owner_component_movements m ON m.id=c.consumer_movement_id
 JOIN public.owner_event_owner_allocations a ON a.id=m.owner_event_owner_allocation_id
 JOIN public.owner_event_allocation_sets s ON s.id=a.allocation_set_id
 WHERE s.source_line_id=(SELECT (corrected->>'withdrawalId')::uuid FROM owner_date_state);
SELECT ok((SELECT count(*)>0 FROM reserved_cash_before),'earlier payout has real cash reservations before forward correction');
SELECT lives_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (later->>'property_withdrawal_id')::uuid,current_date-4,
 'Actual bank date correction','date-test-preclaimed') FROM owner_date_state$$,
 'forward correction succeeds even when an attacker preclaimed the old derived key');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE property_id='dd150000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),400::numeric,
 'forward correction preserves cash without reusing a separate payout');
SELECT is((SELECT count(*) FROM public.property_withdrawals WHERE property_id='dd150000-0000-4000-8000-000000000002'),
 7::bigint,'each date correction appends its own reversal and replacement');
SELECT is((SELECT count(*) FROM reserved_cash_before b WHERE NOT EXISTS(
 SELECT 1 FROM public.owner_cash_source_consumptions c WHERE to_jsonb(c)=to_jsonb(b))),0::bigint,
 'other payouts retain their original cash source reservations');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (later->>'property_withdrawal_id')::uuid,current_date+1,'Correct actual bank date','date-test-future') FROM owner_date_state$$,
 '22023','owner_distribution_date_in_future','future date is rejected');
SELECT set_config('request.jwt.claim.sub','dd150000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.correct_owner_distribution_date('dd150000-0000-4000-8000-000000000001',
 (later->>'property_withdrawal_id')::uuid,current_date-4,'Correct actual bank date','date-test-denied') FROM owner_date_state$$,
 '42501','owner_distribution_correction_forbidden','unauthorized actor cannot correct distribution');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='dd150000-0000-4000-8000-000000000001'
 AND entity_type='owner_distribution_date_correction'),2::bigint,'each successful correction records one audit entry');
SELECT * FROM finish();
ROLLBACK;
