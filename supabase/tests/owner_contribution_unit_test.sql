BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('cd160000-0000-4000-8000-000000000010','authenticated','authenticated',
 'owner-contribution-void@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug)
VALUES('cd160000-0000-4000-8000-000000000001','Owner date test','owner-unit-test');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('cd160000-0000-4000-8000-000000000003','cd160000-0000-4000-8000-000000000001','Owner test');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('cd160000-0000-4000-8000-000000000020','cd160000-0000-4000-8000-000000000001','Open target','CORRECT-OPEN','active'),
 ('cd160000-0000-4000-8000-000000000021','cd160000-0000-4000-8000-000000000001','Locked other','CORRECT-LOCKED','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000001','Test property','CONTRIB-CORRECTION','Apartment','cd160000-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
VALUES('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002',
 'cd160000-0000-4000-8000-000000000003',100,current_date-365,true);
CREATE TEMP TABLE owner_date_state(original jsonb, later jsonb, corrected jsonb);
INSERT INTO owner_date_state DEFAULT VALUES;
GRANT ALL ON owner_date_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','cd160000-0000-4000-8000-000000000010',true);
INSERT INTO public.units(id,organization_id,property_id,unit_number) VALUES ('cd160000-0000-4000-8000-000000000040','cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','8F-D2');
SET LOCAL ROLE authenticated;
UPDATE owner_date_state SET original=public.record_owner_contribution('cd160000-0000-4000-8000-000000000001',
 'cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','contribution-original','cd160000-0000-4000-8000-000000000040');


SELECT is((SELECT unit_id FROM public.owner_cash_events WHERE id=(SELECT (original->>'owner_cash_event_id')::uuid FROM owner_date_state)), 'cd160000-0000-4000-8000-000000000040'::uuid,'contribution retains selected unit');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements WHERE property_id='cd160000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),1000::numeric,'unit attribution does not change property cash');
SELECT lives_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','contribution-original','cd160000-0000-4000-8000-000000000040')$$,'same unit request replays');
SELECT throws_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','contribution-original',NULL)$$,'22023','idempotency_key_reused','cannot replay as property-wide');
SELECT throws_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','contribution-invalid','cd160000-0000-4000-8000-000000000099')$$,'23503','owner_contribution_unit_mismatch','invalid unit rejected');
RESET ROLE;
UPDATE public.units SET archived_at=now() WHERE id='cd160000-0000-4000-8000-000000000040';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','contribution-original','cd160000-0000-4000-8000-000000000040')$$,'exact replay survives unit archival');
SELECT throws_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date-10,1000,'Original contribution','new-key-after-archive','cd160000-0000-4000-8000-000000000040')$$,'23503','owner_contribution_unit_mismatch','archived unit rejects new contribution');
SELECT is((SELECT count(*) FROM public.owner_cash_events WHERE property_id='cd160000-0000-4000-8000-000000000002'),1::bigint,'replay creates no duplicate contribution');
SELECT public.correct_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-9,900,'Updated contribution','Correct amount and date','contribution-correct-unit') FROM owner_date_state;
SELECT is((SELECT count(*) FROM public.owner_cash_events WHERE property_id='cd160000-0000-4000-8000-000000000002' AND unit_id='cd160000-0000-4000-8000-000000000040'),3::bigint,'correction and reversal both retain unit');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements WHERE property_id='cd160000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),900::numeric,'correction cash reconciles');
SELECT is((SELECT u->>'unit_number' FROM jsonb_array_elements(public.get_owner_account_read_context('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002')->'units') u WHERE u->>'id'='cd160000-0000-4000-8000-000000000040'),'8F-D2','owner account read context retains archived unit labels');
SELECT lives_ok($$SELECT * FROM public.get_owner_profit_loss_names('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002',ARRAY[]::text[])$$,'authorized empty name lookup');
SELECT set_config('request.jwt.claim.sub','cd160000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.record_owner_contribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',current_date,10,'No access','contribution-no-access',NULL)$$,'42501',NULL,'unauthorized contribution blocked');
SELECT throws_ok($$SELECT * FROM public.get_owner_profit_loss_names('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002',ARRAY[]::text[])$$,'42501',NULL,'unauthorized name lookup blocked');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
