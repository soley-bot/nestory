BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('cc160000-0000-4000-8000-000000000010','authenticated','authenticated',
 'owner-contribution-correction@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug)
VALUES('cc160000-0000-4000-8000-000000000001','Owner date test','owner-contribution-correction-test');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('cc160000-0000-4000-8000-000000000003','cc160000-0000-4000-8000-000000000001','Owner test');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('cc160000-0000-4000-8000-000000000020','cc160000-0000-4000-8000-000000000001','Open target','CORRECT-OPEN','active'),
 ('cc160000-0000-4000-8000-000000000021','cc160000-0000-4000-8000-000000000001','Locked other','CORRECT-LOCKED','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('cc160000-0000-4000-8000-000000000002','cc160000-0000-4000-8000-000000000001','Test property','CONTRIB-CORRECTION','Apartment','cc160000-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
VALUES('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000002',
 'cc160000-0000-4000-8000-000000000003',100,current_date-365,true);
CREATE TEMP TABLE owner_date_state(original jsonb, later jsonb, corrected jsonb);
INSERT INTO owner_date_state DEFAULT VALUES;
GRANT ALL ON owner_date_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','cc160000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
UPDATE owner_date_state SET original=public.record_owner_cash_event('cc160000-0000-4000-8000-000000000001',
 'cc160000-0000-4000-8000-000000000002','cc160000-0000-4000-8000-000000000003','USD','owner_contribution',current_date-10,1000,'Original contribution','contribution-original');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-10,1000,'Original contribution','Correct bank statement','unchanged-input') FROM owner_date_state$$,'22023','owner_contribution_unchanged','unchanged contribution rejected');
RESET ROLE;
INSERT INTO public.financial_month_locks(organization_id,branch_id,month_start,is_locked,reason,locked_by,locked_at)
VALUES('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000021',date_trunc('month',current_date-9)::date,true,'Other branch locked','cc160000-0000-4000-8000-000000000010',now());
SET LOCAL ROLE authenticated;
UPDATE owner_date_state SET corrected=public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-9,1200,'New bank reference','Correct bank statement','contribution-correct');
SELECT ok((SELECT corrected->>'replacementId' IS NOT NULL FROM owner_date_state),'open target correction succeeds while another branch is locked');
RESET ROLE;
DELETE FROM public.financial_month_locks WHERE organization_id='cc160000-0000-4000-8000-000000000001' AND branch_id='cc160000-0000-4000-8000-000000000021';
INSERT INTO public.financial_month_locks(organization_id,branch_id,month_start,is_locked,reason,locked_by,locked_at)
VALUES('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000020',date_trunc('month',current_date-9)::date,true,'Target branch locked','cc160000-0000-4000-8000-000000000010',now());
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,1300,'Changed','Correct bank statement','contribution-target-locked') FROM owner_date_state$$,'55000','Financial month is locked','matching target branch lock blocks correction');
RESET ROLE;
DELETE FROM public.financial_month_locks WHERE organization_id='cc160000-0000-4000-8000-000000000001' AND branch_id='cc160000-0000-4000-8000-000000000020';

SET LOCAL ROLE authenticated;
SELECT is((SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-9,1200,'New bank reference','Correct bank statement','contribution-correct') FROM owner_date_state),(SELECT corrected FROM owner_date_state),'contribution retry returns original receipt');
SELECT is((SELECT amount FROM public.owner_cash_events WHERE id=(SELECT (original->>'owner_cash_event_id')::uuid FROM owner_date_state)),1000::numeric,'original contribution remains immutable');
SELECT is((SELECT reference FROM public.owner_cash_events WHERE id=(SELECT (corrected->>'replacementId')::uuid FROM owner_date_state)),'New bank reference','replacement stores owner-facing reference');
SELECT is((SELECT sum(balance_effect) FROM public.property_account_entries WHERE property_id='cc160000-0000-4000-8000-000000000002'),1200::numeric,'register contribution reversal and replacement net correctly');
SELECT is((SELECT running_balance FROM public.property_finance_positions WHERE property_id='cc160000-0000-4000-8000-000000000002'),1200::numeric,'position nets corrected contribution');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements WHERE property_id='cc160000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),1200::numeric,'authoritative cash matches replacement');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-9,900,'Changed','Correct bank statement','contribution-second') FROM owner_date_state$$,'23514','owner_contribution_already_reversed','original cannot be corrected twice');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'reversalId')::uuid,current_date-9,900,'Changed','Correct bank statement','contribution-reverse') FROM owner_date_state$$,'23514','owner_contribution_already_reversed','reversal cannot be corrected');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(original->>'owner_cash_event_id')::uuid,current_date-9,900,'Changed','Correct bank statement','contribution-correct') FROM owner_date_state$$,'22023',NULL,'replay with different amount rejected');
UPDATE owner_date_state SET corrected=public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,800,'Reduced contribution','Correct bank statement','contribution-reduce');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements WHERE property_id='cc160000-0000-4000-8000-000000000002' AND component='ips_held_owner_cash'),800::numeric,'reduction changes held cash exactly');
UPDATE owner_date_state SET corrected=public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,800,NULL,'Correct bank statement','contribution-clear-reference');
SELECT is((SELECT reference FROM public.owner_cash_events WHERE id=(SELECT (corrected->>'replacementId')::uuid FROM owner_date_state)),NULL::text,'reference can be explicitly cleared');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,0,'Changed','Correct bank statement','contribution-zero') FROM owner_date_state$$,'22023',NULL,'zero amount rejected');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,1.005,'Changed','Correct bank statement','contribution-cents') FROM owner_date_state$$,'22023',NULL,'fractional cents rejected');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date+1,800,'Changed','Correct bank statement','contribution-future') FROM owner_date_state$$,'22023',NULL,'future date rejected');
SELECT public.set_financial_month_lock('cc160000-0000-4000-8000-000000000001',current_date,true,'Protect correction test');
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,800,'Changed','Correct bank statement','contribution-closed') FROM owner_date_state$$,NULL,NULL,'closed financial month blocks contribution correction');
SELECT public.set_financial_month_lock('cc160000-0000-4000-8000-000000000001',current_date,false,'Release correction test');
UPDATE owner_date_state SET later=public.record_owner_distribution('cc160000-0000-4000-8000-000000000001','cc160000-0000-4000-8000-000000000002','cc160000-0000-4000-8000-000000000003','USD',100,current_date,'Consumed contribution','contribution-consumer');
SELECT throws_like($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,900,'Changed','Correct bank statement','contribution-consumed') FROM owner_date_state$$,'dependent_owner_cash:%','active downstream consumer prevents contribution correction');
SELECT is((SELECT count(*) FROM public.owner_cash_events WHERE property_id='cc160000-0000-4000-8000-000000000002'),7::bigint,'failed correction rolls back all history');
SELECT set_config('request.jwt.claim.sub','cc160000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,800,'Changed','Correct bank statement','contribution-forbidden') FROM owner_date_state$$,'42501','owner_contribution_correction_forbidden','unauthorized actor rejected');
RESET ROLE;
SELECT is((SELECT app_private.owner_statement_source_description(s.organization_id,s.id) FROM public.owner_event_allocation_sets s JOIN public.owner_cash_events c ON c.id=s.source_line_id WHERE c.corrects_event_id=(SELECT (original->>'owner_cash_event_id')::uuid FROM owner_date_state)),'New bank reference','statement uses corrected reference without audit reason');
SELECT is((SELECT app_private.owner_statement_source_description(s.organization_id,s.id) FROM public.owner_event_allocation_sets s JOIN public.owner_cash_events c ON c.id=s.source_line_id WHERE c.reversal_of_id=(SELECT (original->>'owner_cash_event_id')::uuid FROM owner_date_state)),'Reversal: Original contribution','statement retains original contribution description on reversal');
SELECT is((SELECT app_private.owner_statement_source_description(s.organization_id,s.id) FROM public.owner_event_allocation_sets s WHERE s.source_line_id=(SELECT (corrected->>'replacementId')::uuid FROM owner_date_state)),'Owner contribution','cleared reference falls back to source label without leaking audit reason');
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
VALUES('cc160000-0000-4000-8000-000000000001',true,now(),'cc160000-0000-4000-8000-000000000010');
SELECT set_config('request.jwt.claim.sub','cc160000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.correct_owner_contribution('cc160000-0000-4000-8000-000000000001',(corrected->>'replacementId')::uuid,current_date-9,800,'Changed','Correct bank statement','contribution-stepup') FROM owner_date_state$$,'42501','privileged_email_step_up_required','correction requires privileged verification when enforced');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
