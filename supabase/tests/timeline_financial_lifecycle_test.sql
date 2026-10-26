BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa230940-0000-4000-8000-000000000010','authenticated','authenticated','timeline-fence@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230940-0000-4000-8000-000000000001','Timeline fence fixture','timeline-fence-test'),
 ('fa230940-0000-4000-8000-000000000009','Timeline other fixture','timeline-fence-other');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
VALUES('fa230940-0000-4000-8000-000000000020','fa230940-0000-4000-8000-000000000001','Timeline branch','TLF','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('fa230940-0000-4000-8000-000000000002','fa230940-0000-4000-8000-000000000001','Timeline property','TLF','Apartment','fa230940-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title,cost_amount,cost_currency) VALUES
 ('fa230940-0000-4000-8000-000000000030','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002','2026-09-01','Inspection','Historical note',NULL,NULL),
 ('fa230940-0000-4000-8000-000000000031','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002','2026-09-01','Inspection','Historical cost',5,'USD'),
 ('fa230940-0000-4000-8000-000000000032','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002','2026-10-01','Inspection','Current cost',5,'USD');
SELECT set_config('request.jwt.claim.sub','fa230940-0000-4000-8000-000000000010',true);
SELECT lives_ok($$SELECT app_private.assert_financial_report_source_lifetime()$$,'timeline retains an enforced organization lifetime path');
SELECT ok(NOT has_function_privilege('authenticated','app_private.guard_timeline_financial_write_row()','EXECUTE'),'financial timeline guard is private');
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa230940-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.timeline_events WHERE organization_id='fa230940-0000-4000-8000-000000000001'),3::bigint,'authorized member can see fixture through RLS');
SELECT throws_ok($$INSERT INTO public.timeline_events(organization_id,property_id,event_date,event_type,title)
 VALUES('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002','2026-09-01','Inspection','Frozen direct note')$$,'55000','financial_writes_frozen','direct RLS insert cannot mutate frozen timeline');
WITH changed AS (UPDATE public.timeline_events SET title='Frozen change' WHERE id='fa230940-0000-4000-8000-000000000030' RETURNING id)
SELECT is(count(*),0::bigint,'SELECT-only RLS continues to deny direct timeline updates') FROM changed;
SELECT throws_ok($$DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000030'$$,'42501','permission denied for table timeline_events','ordinary hard delete retains its existing permission denial');
SELECT throws_ok($$SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-01','Inspection','Frozen RPC note',NULL,NULL,NULL)$$,'55000','financial_writes_frozen','authorized create RPC cannot mutate frozen timeline');
SELECT throws_ok($$SELECT public.update_timeline_event('fa230940-0000-4000-8000-000000000030','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-01','Inspection','Frozen RPC edit',NULL,NULL,NULL)$$,'55000','financial_writes_frozen','authorized update RPC cannot mutate frozen timeline');
SELECT throws_ok($$SELECT public.archive_timeline_event('fa230940-0000-4000-8000-000000000030','fa230940-0000-4000-8000-000000000001')$$,'55000','financial_writes_frozen','authorized archive RPC cannot mutate frozen timeline');
RESET ROLE;
SELECT lives_ok($$INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action)
 VALUES('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000010','timeline_event','fa230940-0000-4000-8000-000000000030','created')$$,'freeze continues to permit general audit evidence');
SELECT throws_ok($$DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','privileged direct delete also observes freeze');
SELECT throws_ok($$UPDATE public.timeline_events SET organization_id='fa230940-0000-4000-8000-000000000009' WHERE id='fa230940-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','moving a row out of a frozen old organization fails');
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa230940-0000-4000-8000-000000000001';
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa230940-0000-4000-8000-000000000009',2,'frozen','2026-10-01');
SELECT throws_ok($$UPDATE public.timeline_events SET organization_id='fa230940-0000-4000-8000-000000000009' WHERE id='fa230940-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','moving a row into a frozen new organization fails');
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa230940-0000-4000-8000-000000000009';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-01','Inspection','Open historical note',NULL,NULL,NULL)$$,'historical nonfinancial note needs neither new date nor financial header');
SELECT lives_ok($$SELECT public.update_timeline_event('fa230940-0000-4000-8000-000000000030','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-01','Inspection','Open historical edit',NULL,NULL,NULL)$$,'checked historical note edit remains available without financial header');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.timeline_events SET title='Missing header' WHERE id='fa230940-0000-4000-8000-000000000032'$$,'22023','financial_generation_required','cost row requires original financial generation');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-10-01','Inspection','Stale RPC cost',NULL,0,'USD')$$,'40001','financial_generation_stale','zero cost still rejects stale rendered generation');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.timeline_events SET cost_amount=NULL,cost_currency=NULL WHERE id='fa230940-0000-4000-8000-000000000032'$$,'40001','financial_generation_stale','clearing old cost cannot bypass stale generation');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.archive_timeline_event('fa230940-0000-4000-8000-000000000032','fa230940-0000-4000-8000-000000000001')$$,'40001','financial_generation_stale','cost archive rejects stale generation');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok($$SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-30','Inspection','Backdated RPC cost',NULL,5,'USD')$$,'22023','financial_date_before_start','create RPC rejects pre-cutoff cost');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.timeline_events SET event_date='2026-09-30' WHERE id='fa230940-0000-4000-8000-000000000032'$$,'22023','financial_date_before_start','new financial date enforces cutoff');
SELECT throws_ok($$UPDATE public.timeline_events SET event_date='2026-10-01',cost_amount=NULL,cost_currency=NULL WHERE id='fa230940-0000-4000-8000-000000000031'$$,'22023','financial_date_before_start','old financial date cannot be hidden by clearing and redating');
SELECT throws_ok($$UPDATE public.timeline_events SET cost_amount=0,cost_currency='USD' WHERE id='fa230940-0000-4000-8000-000000000030'$$,'22023','financial_date_before_start','adding cost converts a historical note to cutoff-protected financial data');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-10-01','Inspection','Current RPC cost',NULL,5,'USD')$$,'fresh cost at inclusive cutoff succeeds');
SELECT lives_ok($$SELECT public.archive_timeline_event('fa230940-0000-4000-8000-000000000032','fa230940-0000-4000-8000-000000000001')$$,'fresh current-cost archive succeeds');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT public.restore_timeline_event('fa230940-0000-4000-8000-000000000032','fa230940-0000-4000-8000-000000000001')$$,'40001','financial_generation_stale','cost restore rejects stale generation');
RESET ROLE;
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id='fa230940-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.restore_timeline_event('fa230940-0000-4000-8000-000000000032','fa230940-0000-4000-8000-000000000001')$$,'55000','financial_writes_frozen','restore RPC cannot mutate frozen timeline');
RESET ROLE;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa230940-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok($$UPDATE public.timeline_events SET organization_id='fa230940-0000-4000-8000-000000000009' WHERE id='fa230940-0000-4000-8000-000000000032'$$,'40001','financial_generation_stale','new organization generation is checked independently');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"2"}',true);
SELECT throws_ok($$UPDATE public.timeline_events SET organization_id='fa230940-0000-4000-8000-000000000009' WHERE id='fa230940-0000-4000-8000-000000000032'$$,'40001','financial_generation_stale','old organization generation is checked independently');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok($$DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000031'$$,'22023','financial_date_before_start','privileged deletion cannot bypass old financial cutoff');
-- A link alone is financial even with no displayed cost. Failure occurs before
-- the deliberately nonexistent ledger ID could reach its FK check.
SELECT throws_ok($$UPDATE public.timeline_events SET ledger_entry_id='fa230940-0000-4000-8000-000000000099' WHERE id='fa230940-0000-4000-8000-000000000030'$$,'22023','financial_date_before_start','ledger-only projection is cutoff protected');
INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title)
 VALUES('fa230940-0000-4000-8000-000000000033','fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002','2026-10-01','Inspection','Current operational note');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.set_financial_month_lock('fa230940-0000-4000-8000-000000000001','2026-10-01',true,'Timeline deletion regression')$$,'authorized month lock establishes deletion regression');
RESET ROLE;
SELECT ok(has_table_privilege('service_role','public.timeline_events','DELETE'),'service role has a real direct timeline deletion path');
SET LOCAL ROLE service_role;
SELECT throws_ok($$DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000032'$$,'22023','Financial month is locked','privileged API deletion protects locked-month cost rows');
SELECT lives_ok($$DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000033'$$,'locked month still permits nonfinancial timeline removal');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000032'),1::bigint,'rejected privileged deletion preserves cost projection');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.set_financial_month_lock('fa230940-0000-4000-8000-000000000001','2026-10-01',false,'Timeline regression complete')$$,'ordinary checked unlock retains existing behavior');
RESET ROLE;
SELECT ok(EXISTS(SELECT 1 FROM public.activity_logs WHERE organization_id='fa230940-0000-4000-8000-000000000001' AND entity_type='timeline_event' AND action='created'),'successful operational RPCs retain audit evidence');
-- Isolate timeline revision publication from fixture writes in this transaction.
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-940
 WHERE organization_id='fa230940-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
CREATE TEMP TABLE timeline_revision_before AS SELECT sum(revision) AS revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230940-0000-4000-8000-000000000001';
SAVEPOINT timeline_revision_rollback;
UPDATE public.timeline_events SET title='Rolled back note' WHERE id='fa230940-0000-4000-8000-000000000030';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230940-0000-4000-8000-000000000001'),(SELECT revision+1 FROM timeline_revision_before),'timeline-only mutation advances source stamp');
ROLLBACK TO SAVEPOINT timeline_revision_rollback;
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230940-0000-4000-8000-000000000001'),(SELECT revision FROM timeline_revision_before),'rolled-back timeline mutation publishes no source stamp');
DELETE FROM public.timeline_events WHERE id='fa230940-0000-4000-8000-000000000030';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230940-0000-4000-8000-000000000001'),(SELECT revision+1 FROM timeline_revision_before),'permitted timeline removal also advances source stamp');
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-941
 WHERE organization_id='fa230940-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
SET LOCAL ROLE authenticated;
SELECT public.create_timeline_event('fa230940-0000-4000-8000-000000000001','fa230940-0000-4000-8000-000000000002',NULL,'2026-09-01','Inspection','New source note',NULL,NULL,NULL);
RESET ROLE;
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230940-0000-4000-8000-000000000001'),(SELECT revision+2 FROM timeline_revision_before),'ordinary checked timeline insert advances source stamp');
SELECT * FROM finish();
ROLLBACK;
