BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa230900-0000-4000-8000-000000000010','authenticated','authenticated','report-revision@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230900-0000-4000-8000-000000000001','Report revision fixture','report-revision-test'),
 ('fa230900-0000-4000-8000-000000000002','Other revision fixture','report-revision-other');
CREATE TEMP TABLE other_org_revision_before AS SELECT coalesce((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000002'),0) AS revision;
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('fa230900-0000-4000-8000-000000000001','fa230900-0000-4000-8000-000000000010','super_admin');
SELECT ok(NOT has_table_privilege('authenticated','app_private.financial_report_source_revisions','UPDATE'),'app cannot forge source versions');
SELECT ok(NOT has_table_privilege('service_role','app_private.financial_report_source_revisions','DELETE'),'service role cannot erase source versions');
SELECT is((SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND t.tgname='a_financial_write_fence' AND NOT EXISTS(SELECT 1 FROM pg_trigger version WHERE version.tgrelid=t.tgrelid AND version.tgname='financial_report_source_revision')),0::bigint,'all reviewed public sources advance the report version');
-- Simulate an earlier committed transaction ID; all probe writes roll back.
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=0 WHERE organization_id='fa230900-0000-4000-8000-000000000001';
INSERT INTO public.people(organization_id,display_name) VALUES('fa230900-0000-4000-8000-000000000001','Synthetic report owner');
SELECT is((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::bigint,'a new source-writing transaction advances the revision');
UPDATE public.people SET display_name='Updated report owner' WHERE organization_id='fa230900-0000-4000-8000-000000000001';
SELECT is((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::bigint,'one transaction publishes one revision for all its writes');
SELECT is(coalesce((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000002'),0),(SELECT revision FROM other_org_revision_before),'another organization revision is unchanged');
SELECT set_config('request.jwt.claim.sub','fa230900-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_financial_report_context('fa230900-0000-4000-8000-000000000001')->>'source_revision','2','ordinary member receives revision with lifecycle context');
SELECT throws_ok($$SELECT public.get_financial_report_context('fa230900-0000-4000-8000-000000000002')$$,'42501','financial_context_forbidden','cross-workspace version reads are denied');
RESET ROLE;
SAVEPOINT cancelled_source_change;
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=0 WHERE organization_id='fa230900-0000-4000-8000-000000000001';
DELETE FROM public.people WHERE organization_id='fa230900-0000-4000-8000-000000000001';
ROLLBACK TO SAVEPOINT cancelled_source_change;
SELECT is((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::bigint,'rolled-back source writes do not publish a revision');
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=0 WHERE organization_id='fa230900-0000-4000-8000-000000000001';
UPDATE public.organizations SET name='Changed report heading' WHERE id='fa230900-0000-4000-8000-000000000001';
SELECT is((SELECT revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),3::bigint,'workspace identity changes invalidate reports using that heading');
-- Create an otherwise empty synthetic workspace without automatic finance seeds.
-- All writes under test, including the child cascade, use ordinary trigger mode.
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230900-0000-4000-8000-000000000003','Revision cascade fixture','report-revision-cascade');
SET LOCAL session_replication_role = origin;
INSERT INTO public.people(organization_id,display_name)
VALUES('fa230900-0000-4000-8000-000000000003','Cascading report source');
SELECT lives_ok($$DELETE FROM public.organizations WHERE id='fa230900-0000-4000-8000-000000000003'$$,'unenrolled workspace deletion and child cascades do not recreate revision rows');
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000003'),0::bigint,'deleted workspace leaves no revision authority');
SELECT * FROM finish();
ROLLBACK;
