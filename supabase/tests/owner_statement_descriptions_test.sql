BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('de150000-0000-4000-8000-000000000010','authenticated','authenticated',
 'owner-date@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug)
VALUES('de150000-0000-4000-8000-000000000001','Statement descriptions test','statement-descriptions-test');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('de150000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('de150000-0000-4000-8000-000000000003','de150000-0000-4000-8000-000000000001','Owner test');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('de150000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.properties(id,organization_id,name,code,property_type)
VALUES('de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000001','Test property','DETAIL-TEST','Apartment');
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
VALUES('de150000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000002',
 'de150000-0000-4000-8000-000000000003',100,current_date-365,true);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('de150000-0000-4000-8000-000000000011','authenticated','authenticated','description-review@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('de150000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000011','super_admin');
CREATE TEMP TABLE statement_description_state(revision_id uuid, publication_id uuid, publication jsonb);
INSERT INTO statement_description_state DEFAULT VALUES;
GRANT ALL ON statement_description_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','de150000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT public.submit_owner_opening_balance('de150000-0000-4000-8000-000000000001',
 'de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000003',
 'USD',date_trunc('month',current_date)::date,c::public.owner_balance_component,0,
 'Known zero opening balance for isolated test','Reviewed test opening',NULL,repeat('a',64),NULL,'description-opening-'||c)
 FROM unnest(ARRAY['ips_held_owner_cash','owner_due_to_ips','ips_due_to_owner','security_deposit_custody']) c;
SELECT set_config('request.jwt.claim.sub','de150000-0000-4000-8000-000000000011',true);
SELECT public.review_owner_opening_balance(organization_id,id,'approve','Verified zero opening balances','description-review-'||component::text)
 FROM public.owner_opening_balance_requests WHERE organization_id='de150000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','de150000-0000-4000-8000-000000000010',true);
SELECT public.record_owner_cash_event('de150000-0000-4000-8000-000000000001',
 'de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000003',
 'USD','owner_contribution',current_date,1000,
 'Fund installing water booster pump. ' || repeat('Approved repair materials. ',10), 'statement-description-contribution');
SELECT public.record_owner_distribution('de150000-0000-4000-8000-000000000001',
 'de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000003',
 'USD',200,current_date,'August rental proceeds paid to owner','statement-description-distribution');
SELECT public.record_owner_distribution('de150000-0000-4000-8000-000000000001',
 'de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000003',
 'USD',50,current_date,'Maintenance advance returned','statement-description-reverse-original');
SELECT public.reverse_property_withdrawal('de150000-0000-4000-8000-000000000001',id,current_date,
 'Return the maintenance advance','statement-description-reverse') FROM public.property_withdrawals
 WHERE organization_id='de150000-0000-4000-8000-000000000001' AND amount=50;
SELECT public.generate_owner_balance_period('de150000-0000-4000-8000-000000000001',
 'de150000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000003',
 'USD',date_trunc('month',current_date)::date,'statement-description-period');
SELECT public.set_financial_month_lock('de150000-0000-4000-8000-000000000001',current_date,true,'Test statement close');
UPDATE statement_description_state SET revision_id=(public.close_owner_month(
 'de150000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000002',
 'de150000-0000-4000-8000-000000000003','USD',date_trunc('month',current_date)::date,
 'Approve actual statement details','statement-description-close')->>'revision_id')::uuid;
SELECT is((SELECT description FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM statement_description_state)
 AND line_kind='movement' AND signed_amount=1000),
 'Fund installing water booster pump. ' || repeat('Approved repair materials. ',9) || 'Approved repair materials.',
 'close snapshots the full source reason beyond the old 240-character limit');
SELECT is((SELECT description FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM statement_description_state)
 AND line_kind='movement' AND signed_amount=-200),'August rental proceeds paid to owner','close snapshots actual payout reference');
SELECT is((SELECT description FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM statement_description_state)
 AND line_kind='movement' AND signed_amount=50),'Reversal: Maintenance advance returned',
 'reversal preserves the original detail with a clear reversal prefix');
UPDATE statement_description_state SET publication_id=(public.publish_owner_statement(
 'de150000-0000-4000-8000-000000000001',revision_id,'statement-description-publish')->>'publication_id')::uuid;
UPDATE statement_description_state SET publication=public.get_owner_statement_publication('de150000-0000-4000-8000-000000000001',publication_id);
SELECT ok((SELECT publication::text LIKE '%August rental proceeds paid to owner%' AND publication::text LIKE '%Fund installing water booster pump%' FROM statement_description_state),
 'publication returns the frozen real transaction descriptions');
SELECT is((SELECT sum(signed_amount) FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM statement_description_state) AND line_kind='movement'),800::numeric,
 'description changes preserve the money');
SELECT throws_ok($$UPDATE public.owner_close_lines SET description='Altered after publication'
 WHERE owner_close_revision_id=(SELECT revision_id FROM statement_description_state)$$,
 '42501',NULL,'client cannot rewrite retained descriptions');
SELECT is(public.get_owner_statement_publication('de150000-0000-4000-8000-000000000001',publication_id),publication,
 'retained publication descriptions and hash remain unchanged') FROM statement_description_state;
RESET ROLE;
SELECT throws_ok($$SELECT app_private.owner_statement_source_description('de150000-0000-4000-8000-000000000099',id)
 FROM public.owner_event_allocation_sets WHERE organization_id='de150000-0000-4000-8000-000000000001' LIMIT 1$$,
 '23514','owner_statement_source_missing','resolver cannot read another organization source');
SELECT ok(NOT has_function_privilege('authenticated','app_private.owner_statement_source_description(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','app_private.owner_statement_source_description(uuid,uuid)','EXECUTE'),
 'description resolver has no direct client grants');
SELECT * FROM finish();
ROLLBACK;
