BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa230900-0000-4000-8000-000000000010','authenticated','authenticated','report-revision@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230900-0000-4000-8000-000000000001','Report revision fixture','report-revision-test'),
 ('fa230900-0000-4000-8000-000000000002','Other revision fixture','report-revision-other');
CREATE TEMP TABLE other_org_revision_before AS SELECT coalesce((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000002'),0) AS revision;
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('fa230900-0000-4000-8000-000000000001','fa230900-0000-4000-8000-000000000010','super_admin');
SELECT ok(NOT has_table_privilege('authenticated','app_private.financial_report_source_revisions','UPDATE'),'app cannot forge source versions');
SELECT ok(NOT has_table_privilege('service_role','app_private.financial_report_source_revisions','DELETE'),'service role cannot erase source versions');
SELECT lives_ok($$SELECT app_private.assert_financial_report_source_lifetime()$$,'all revision sources retain an immediate enforced organization lifetime path');
SELECT throws_like($$DO $probe$ BEGIN
  ALTER TABLE public.people DROP CONSTRAINT people_organization_id_fkey;
  PERFORM app_private.assert_financial_report_source_lifetime();
END; $probe$;$$,'%financial_report_source_lifetime_unproven%','missing source lifetime constraints fail closed');
SELECT throws_like($$DO $probe$ BEGIN
  ALTER TABLE public.people ALTER CONSTRAINT people_organization_id_fkey DEFERRABLE;
  PERFORM app_private.assert_financial_report_source_lifetime();
END; $probe$;$$,'%financial_report_source_lifetime_unproven%','deferred source lifetime constraints do not qualify for cleanup ordering');
SELECT is((SELECT count(*) FROM pg_constraint WHERE conrelid='app_private.financial_report_source_revisions'::regclass AND contype='f'),0::bigint,'revision bookkeeping does not introduce an organization FK lock');
SELECT is((SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND t.tgname='a_financial_write_fence' AND NOT EXISTS(SELECT 1 FROM pg_trigger version WHERE version.tgrelid=t.tgrelid AND version.tgname='financial_report_source_revision')),0::bigint,'all reviewed public sources advance the report version');
-- Simulate an earlier committed transaction ID; all probe writes roll back.
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=0 WHERE organization_id='fa230900-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
INSERT INTO public.people(organization_id,display_name) VALUES('fa230900-0000-4000-8000-000000000001','Synthetic report owner');
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::numeric,'a new source-writing transaction advances the revision');
UPDATE public.people SET display_name='Updated report owner' WHERE organization_id='fa230900-0000-4000-8000-000000000001';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::numeric,'one transaction publishes one revision for all its writes');
SELECT is(coalesce((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000002'),0),(SELECT revision FROM other_org_revision_before),'another organization revision is unchanged');
SELECT set_config('request.jwt.claim.sub','fa230900-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_financial_report_context('fa230900-0000-4000-8000-000000000001')->>'source_revision','2','ordinary member receives revision with lifecycle context');
SELECT throws_ok($$SELECT public.get_financial_report_context('fa230900-0000-4000-8000-000000000002')$$,'42501','financial_context_forbidden','cross-workspace version reads are denied');
RESET ROLE;
SAVEPOINT cancelled_source_change;
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-1 WHERE organization_id='fa230900-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
DELETE FROM public.people WHERE organization_id='fa230900-0000-4000-8000-000000000001';
ROLLBACK TO SAVEPOINT cancelled_source_change;
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),2::numeric,'rolled-back source writes do not publish a revision');
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-1 WHERE organization_id='fa230900-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
UPDATE public.organizations SET name='Changed report heading' WHERE id='fa230900-0000-4000-8000-000000000001';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),3::numeric,'workspace identity changes invalidate reports using that heading');
-- A forward upgrade retains the previous counter as a weighted baseline.
UPDATE app_private.financial_report_source_revisions SET revision=41
WHERE organization_id='fa230900-0000-4000-8000-000000000001' AND last_transaction_id=0;
SET LOCAL ROLE authenticated;
SELECT is(public.get_financial_report_context('fa230900-0000-4000-8000-000000000001')->>'source_revision','43','reader preserves a pre-upgrade counter weight and adds later transaction entries');
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),3::bigint,'each transaction has its own entry instead of overwriting another writer');
-- The source FK keeps orphan writes impossible without a revision-ledger FK.
SELECT throws_like($$INSERT INTO public.people(organization_id,display_name)
  VALUES('fa230900-0000-4000-8000-000000000099','Orphan revision source')$$,
  '%violates foreign key constraint%','a public source cannot outlive a missing organization');
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000099'),0::bigint,'rejected orphan source creates no revision entry');
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-2
WHERE organization_id IN ('fa230900-0000-4000-8000-000000000001','fa230900-0000-4000-8000-000000000002')
  AND last_transaction_id=pg_catalog.txid_current();
UPDATE public.people SET organization_id='fa230900-0000-4000-8000-000000000002'
WHERE organization_id='fa230900-0000-4000-8000-000000000001';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000001'),44::numeric,'source reassignment invalidates the old organization');
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000002'),2::numeric,'source reassignment invalidates the new organization');
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
-- Empty workspaces still have a revision for header writes and need cleanup.
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230900-0000-4000-8000-000000000004','Empty revision fixture','report-revision-empty');
SET LOCAL session_replication_role = origin;
UPDATE public.organizations SET name='Empty revision header' WHERE id='fa230900-0000-4000-8000-000000000004';
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230900-0000-4000-8000-000000000004'),1::bigint,'empty workspace heading writes still publish a revision');
DELETE FROM public.organizations WHERE id='fa230900-0000-4000-8000-000000000004';
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions revision LEFT JOIN public.organizations organization ON organization.id=revision.organization_id WHERE organization.id IS NULL),0::bigint,'explicit deletion cleanup leaves no orphan revision entries');
SELECT * FROM finish();
ROLLBACK;
