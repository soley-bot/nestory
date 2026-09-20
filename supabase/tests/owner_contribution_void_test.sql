BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('cd160000-0000-4000-8000-000000000010','authenticated','authenticated',
 'owner-contribution-void@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug)
VALUES('cd160000-0000-4000-8000-000000000001','Owner date test','owner-contribution-void-test');
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
SET LOCAL ROLE authenticated;
UPDATE owner_date_state SET original=public.record_owner_cash_event('cd160000-0000-4000-8000-000000000001',
 'cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD','owner_contribution',current_date-10,1000,'Original contribution','contribution-original');

SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'short','void-invalid') FROM owner_date_state$$,'22023',NULL,'short reason rejected');
UPDATE owner_date_state SET later=public.record_owner_distribution('cd160000-0000-4000-8000-000000000001','cd160000-0000-4000-8000-000000000002','cd160000-0000-4000-8000-000000000003','USD',100,current_date,'Used contribution','void-consumer');
SELECT throws_like($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-consumed') FROM owner_date_state$$,'dependent_owner_cash:%','used contribution cannot be deleted');
SELECT is((SELECT count(*) FROM public.owner_cash_events WHERE property_id='cd160000-0000-4000-8000-000000000002'),1::bigint,'blocked delete makes no partial reversal');
SELECT public.reverse_property_withdrawal('cd160000-0000-4000-8000-000000000001',(later->>'property_withdrawal_id')::uuid,current_date,'Remove test payment','void-remove-consumer') FROM owner_date_state;
SELECT public.set_financial_month_lock('cd160000-0000-4000-8000-000000000001',current_date-10,true,'Protect original date');
SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-locked') FROM owner_date_state$$,NULL,NULL,'closed month blocks deletion');
SELECT public.set_financial_month_lock('cd160000-0000-4000-8000-000000000001',current_date-10,false,'Release original date');
UPDATE owner_date_state SET corrected=public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-success');
SELECT is((SELECT amount FROM public.owner_cash_events WHERE id=(SELECT (original->>'owner_cash_event_id')::uuid FROM owner_date_state)),1000::numeric,'original remains immutable');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements WHERE property_id='cd160000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),0::numeric,'void removes exactly contribution cash');
SELECT is((SELECT running_balance FROM public.property_finance_positions WHERE property_id='cd160000-0000-4000-8000-000000000002'),0::numeric,'report position agrees');
SELECT is((SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-success') FROM owner_date_state),(SELECT corrected FROM owner_date_state),'same request replays exact receipt');
SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Different reason','void-success') FROM owner_date_state$$,'22023',NULL,'different payload cannot replay');
SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-again') FROM owner_date_state$$,'23514',NULL,'duplicate delete rejected');
SELECT set_config('request.jwt.claim.sub','cd160000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-success') FROM owner_date_state$$,'42501',NULL,'unauthorized retry rejected');
RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
VALUES('cd160000-0000-4000-8000-000000000001',true,now(),'cd160000-0000-4000-8000-000000000010');
SELECT set_config('request.jwt.claim.sub','cd160000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.void_owner_contribution('cd160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,'Entered in error','void-success') FROM owner_date_state$$,'42501','privileged_email_step_up_required','step up checked before replay');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
