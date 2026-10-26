BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Real empty action operation; completed checked journals are never invented.
-- The continuation test exercises the positive report phase. The owned clone
-- rehearsal commits reset and recovery in separate transactions.
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa231543-0000-4000-8000-000000000001','Verification checkpoint fixture','reset-verification-checkpoint');
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa231543-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object(
 'operation_id','fa231543-0000-4000-8000-000000000100','organization_id','fa231543-0000-4000-8000-000000000001',
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('1',64),'plan_sha256',repeat('2',64),'schema_sha256',repeat('3',64),
 'archive_count',0,'action_count',0,'archive_sha256',app_private.financial_reset_hash('[]'),
 'action_sha256',app_private.financial_reset_hash('[]'),'audit_timestamp','2026-10-23T00:00:00Z','audit_actor',NULL));

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='app_private.financial_reset_verification_checkpoints'::regclass),
 'private checkpoint evidence has RLS');
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE has_table_privilege(r.name,'app_private.financial_reset_verification_checkpoints','SELECT,INSERT,UPDATE,DELETE')),
 'application roles cannot read or write checkpoint evidence');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE n.nspname='app_private' AND p.proname LIKE '%financial_reset%' AND has_function_privilege(r.name,p.oid,'EXECUTE')),
 'all reset helpers remain unavailable to application roles');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid='app_private.financial_reset_verification_checkpoints'::regclass
 AND tgfoid='app_private.guard_financial_reset_immutable()'::regprocedure AND (tgtype::integer & 8)=8 AND (tgtype::integer & 16)=16),
 1::bigint,'checkpoint evidence rejects update and deletion');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_reports('fa231543-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_report_checked_phases_required','prepared actions cannot produce a successful report checkpoint');
SELECT app_private.seal_financial_reset_operation('fa231543-0000-4000-8000-000000000100');
SELECT throws_ok($$SELECT app_private.finalize_financial_reset_recovery('fa231543-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_recovery_checkpoint_actions_required','a sealed reset cannot masquerade as completed recovery');
SELECT app_private.start_financial_reset_actions('fa231543-0000-4000-8000-000000000100');
SELECT app_private.complete_financial_reset_actions('fa231543-0000-4000-8000-000000000100');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_reports('fa231543-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_report_checked_phases_required','raw action completion is not checked report authority');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_report_recovery_boundary('fa231543-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_report_checkpoint_required','uncheckpointed reset cannot bind arbitrary current data as recovery source');
SELECT is(app_private.financial_reset_operation_status('fa231543-0000-4000-8000-000000000100')->'checkpoint_sha256','null'::jsonb,
 'unknown commit status distinguishes action completion from durable report verification');
SELECT is(app_private.financial_reset_operation_status('fa231543-0000-4000-8000-000000000100')->>'recovery_verified','false',
 'raw action completion never claims recovery');
SELECT is(app_private.financial_reset_operation_status('fa231543-0000-4000-8000-000000000100')->>'storage_recovery_verified','false',
 'database checkpoint cannot claim physical Storage recovery');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231543-0000-4000-8000-000000000100','public.properties',
 jsonb_build_object('organization_id','fa231543-0000-4000-8000-000000000001'),NULL,'reports')$$,
 '23514','financial_reset_recovery_report_source_invalid','report provenance cannot authorize deletion of master data');
SELECT is((SELECT count(*) FROM app_private.financial_reset_verification_checkpoints WHERE organization_id='fa231543-0000-4000-8000-000000000001'),
 0::bigint,'every refused operation leaves the durable checkpoint set unchanged');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231543-0000-4000-8000-000000000001'),
 'frozen','all refused finalization paths preserve frozen control');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'raw action foundation remains independently testable without a false checkpoint');
SELECT * FROM finish();
ROLLBACK;
