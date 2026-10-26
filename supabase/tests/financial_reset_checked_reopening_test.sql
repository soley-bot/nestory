-- Synthetic rollback-only negative-boundary checks. SQL-emulated gateway claims
-- are not genuine Auth/PostgREST proof. A separate actual-HTTP fixture supplies
-- the positive committed-checkpoint/open/ordinary-entry proof.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE reopening_fixture(binding jsonb,evidence_text text,authorization_id uuid,freeze_authorization uuid);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 VALUES('fd240157-0000-4000-8000-000000000010','authenticated','authenticated','reopening-maker@test.invalid',
 '{"provider":"email","providers":["email"]}','{}');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after,aal)
 VALUES('fd240157-0000-4000-8000-000000000012','fd240157-0000-4000-8000-000000000010',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour','aal1');
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 VALUES('fd240157-0000-4000-8000-000000000001','Synthetic reopening boundary','synthetic-reopening-boundary','Asia/Phnom_Penh');
INSERT INTO public.organization_members(organization_id,user_id,role)
 VALUES('fd240157-0000-4000-8000-000000000001','fd240157-0000-4000-8000-000000000010','super_admin');
INSERT INTO reopening_fixture(binding)
 SELECT jsonb_build_object('version',1,'operation_id','fd240157-0000-4000-8000-000000000100','project_ref','syntheticprojectrefa',
 'organization_id','fd240157-0000-4000-8000-000000000001','packet_sha256',repeat('1',64),'main_sha',repeat('2',40),
 'sources_sha256',repeat('3',64),'schema_sha256',repeat('4',64),'ledger_sha256',repeat('5',64),
 'source_snapshot_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('fd240157-0000-4000-8000-000000000001')),
 'source_generation',0,'target_generation',1,'cutoff','2026-10-01','issue_date','2026-10-01','timezone','Asia/Phnom_Penh',
 'execution_business_date',app_private.rent_business_date('fd240157-0000-4000-8000-000000000001',statement_timestamp()),
 'invoice_date_policy','original-reviewed-october','manifest_sha256',repeat('6',64),'plan_sha256',repeat('7',64),'archive_sha256',repeat('8',64),
 'action_sha256',repeat('9',64),'archive_artifact_sha256',repeat('a',64),'archive_count',1,'action_count',1,'zero_review_sha256',repeat('b',64),
 'report_review_sha256',repeat('c',64),'continuation_semantic',jsonb_build_object('version',3,'actor_id','fd240157-0000-4000-8000-000000000010',
  'billing_period_start','2026-10-01','issue_date','2026-10-01','execution_business_date',app_private.rent_business_date('fd240157-0000-4000-8000-000000000001',statement_timestamp()),
  'invoice_date_policy','original-reviewed-october','leases','[]'::jsonb));
UPDATE reopening_fixture SET binding=binding||jsonb_build_object('continuation_semantic_sha256',app_private.financial_reset_hash(binding->'continuation_semantic'));
UPDATE reopening_fixture SET evidence_text=jsonb_build_object('format','nestory-reset-reopening-evidence-v1','operation_id',binding->'operation_id',
 'organization_id',binding->'organization_id','packet_sha256',binding->'packet_sha256','checkpoint_sha256',repeat('d',64),'after_sha256',repeat('e',64),
 'review_sha256',repeat('f',64),'completion_intent_sha256',repeat('1',64),'completion_reconciliation_sha256',repeat('2',64),
 'authority_receipt',jsonb_build_object('synthetic_negative_fixture','does-not-establish-provenance'),
 'artifact_receipts',(SELECT jsonb_object_agg(role,jsonb_build_object('artifact_sha256',CASE WHEN role='archive' THEN repeat('a',64) ELSE repeat('3',64) END,
  'receipt_sha256',repeat('4',64))) FROM unnest(ARRAY['archive','containmentProof','liveConsent','restoreProof','storageProof']) role))::text;
SELECT set_config('reopening.base',(SELECT binding::text FROM reopening_fixture),true);
SELECT set_config('reopening.claims',jsonb_build_object('sub','fd240157-0000-4000-8000-000000000010',
 'session_id','fd240157-0000-4000-8000-000000000012','role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',floor(extract(epoch FROM clock_timestamp()+interval '50 minutes')))::text,true);

SELECT ok(NOT has_function_privilege('authenticated','app_private.reopen_financial_reset_checked(jsonb,text)','EXECUTE'),'authenticated cannot call private reopening');
SELECT ok(NOT has_function_privilege('service_role','app_private.reopen_financial_reset_checked(jsonb,text)','EXECUTE'),'service role cannot call private reopening');
SELECT ok(NOT has_table_privilege('authenticated','app_private.financial_reset_reopening_context','INSERT,UPDATE,DELETE,TRUNCATE'),'application cannot mint reopening capability');
SELECT ok(NOT has_table_privilege('service_role','app_private.financial_reset_reopening_receipts','INSERT,UPDATE,DELETE,TRUNCATE'),'service role cannot attest an opening');
SELECT ok(has_function_privilege('authenticated','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE'),'existing gateway RPC permission remains');
SELECT throws_ok($$TRUNCATE app_private.financial_reset_reopening_receipts$$,'23514','financial_reset_evidence_immutable','opening audit cannot be truncated');

-- The reservation is created by its actual consumed freeze command. It is
-- rolled back before the independent reopening-authorization checks below.
SAVEPOINT actual_freeze;
SELECT set_config('request.jwt.claims',current_setting('reopening.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('reopening.base')::jsonb,'freeze') AS reopening_freeze_id \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT app_private.consume_financial_reset_actor_authorization(:'reopening_freeze_id'::uuid,binding,'freeze') FROM reopening_fixture;
SELECT app_private.reserve_financial_reset_hosted_operation(binding) FROM reopening_fixture;
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fd240157-0000-4000-8000-000000000001'$$,
 '42501','financial_reset_checked_reopening_required','later raw owner status update cannot open a reset reservation');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fd240157-0000-4000-8000-000000000001'),'frozen','failed raw opening leaves frozen state');
SELECT is((SELECT count(*) FROM app_private.financial_reset_reopening_receipts),0::bigint,'failed raw opening manufactures no receipt');
ROLLBACK TO SAVEPOINT actual_freeze;

UPDATE reopening_fixture SET binding=binding||jsonb_build_object('reopening',jsonb_build_object('version',1,
 'request_id','fd240157-0000-4000-8000-000000000101','operation_id',binding->'operation_id','generation',1,'cutoff',binding->'cutoff',
 'checkpoint_sha256',repeat('d',64),'after_sha256',repeat('e',64),'foreign_sha256',repeat('5',64),
 'evidence_sha256',encode(extensions.digest(evidence_text,'sha256'),'hex'),'review_sha256',repeat('f',64),
 'execution_business_date',binding->'execution_business_date'));
SELECT set_config('reopening.binding',(SELECT binding::text FROM reopening_fixture),true);
SELECT lives_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding,'reopen') FROM reopening_fixture$$,'separate reopen action preserves exact original binding validation');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding||'{"extra":true}'::jsonb,'reopen') FROM reopening_fixture$$,
 '22023','financial_reset_actor_binding_invalid','extra original binding keys fail closed');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(jsonb_set(binding,'{reopening,request_id}','"not-a-uuid"'),'reopen') FROM reopening_fixture$$,
 '22023','financial_reset_reopening_binding_invalid','reopening attempt requires exact UUID');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(jsonb_set(binding,'{reopening,generation}','2'),'reopen') FROM reopening_fixture$$,
 '22023','financial_reset_reopening_binding_invalid','reopening cannot advance generation');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding-'reopening','reopen') FROM reopening_fixture$$,
 '22023','financial_reset_reopening_binding_invalid','original packet alone is not a reopening review');
SELECT throws_ok($$SELECT app_private.reopen_financial_reset_checked(binding,evidence_text) FROM reopening_fixture$$,
 '42501','financial_reset_actor_context_required','private owner cannot reopen without a consumed fresh operator');

SELECT set_config('request.jwt.claims',current_setting('reopening.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('reopening.binding')::jsonb,'reopen') AS reopening_id \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
UPDATE reopening_fixture SET authorization_id=:'reopening_id'::uuid;
SELECT ok((SELECT action='reopen' AND expires_at<=issued_at+interval '5 minutes' AND expires_at<=credential_expires_at
 FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=:'reopening_id'::uuid),'new action preserves original expiry limits');
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:fd240157-0000-4000-8000-000000000001',0));
SAVEPOINT revoked;
DELETE FROM auth.sessions WHERE id='fd240157-0000-4000-8000-000000000012';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'reopen') FROM reopening_fixture$$,
 '42501','financial_reset_actor_authorization_stale','revoked session cannot open with an unconsumed locator');
ROLLBACK TO SAVEPOINT revoked;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'reopen') FROM reopening_fixture;
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'reopen') FROM reopening_fixture$$,
 '42501','financial_reset_actor_authorization_consumed','same reopening locator cannot be consumed twice');
SELECT throws_ok($$SELECT app_private.reopen_financial_reset_checked(binding,'{}') FROM reopening_fixture$$,
 '23514','financial_reset_reopening_evidence_required','arbitrary evidence cannot replace exact reviewed bytes');
SELECT throws_ok($$SELECT app_private.reopen_financial_reset_checked(binding,evidence_text) FROM reopening_fixture$$,
 '40001','financial_reset_reopening_committed_checkpoint_required','valid actor and digest-shaped fixture evidence cannot replace an actual committed operation');
SELECT throws_ok($$INSERT INTO app_private.financial_reset_reopening_context(backend_pid,transaction_id,operation_id,organization_id,binding,evidence_text)
 SELECT pg_backend_pid()+1,pg_current_xact_id(),(binding->>'operation_id')::uuid,(binding->>'organization_id')::uuid,binding,evidence_text FROM reopening_fixture$$,
 '42501','financial_reset_reopening_context_invalid','capability cannot move to another backend');
SELECT throws_ok($$INSERT INTO app_private.financial_reset_reopening_context(backend_pid,transaction_id,operation_id,organization_id,binding,evidence_text)
 SELECT pg_backend_pid(),pg_current_xact_id(),(binding->>'operation_id')::uuid,(binding->>'organization_id')::uuid,binding,evidence_text FROM reopening_fixture$$,
 '40001','financial_reset_reopening_committed_checkpoint_required','direct capability insert also requires all actual readiness witnesses');
SELECT is((SELECT count(*) FROM app_private.financial_reset_reopening_context),0::bigint,'failed preparations leave no capability');
SELECT is((SELECT count(*) FROM app_private.financial_reset_reopening_receipts),0::bigint,'failed preparations leave no opening audit');
SELECT is((SELECT count(*) FROM app_private.financial_write_controls WHERE organization_id='fd240157-0000-4000-8000-000000000001'),0::bigint,'failed reopening never enrolls or opens the target');
SELECT is(auth.uid(),NULL::uuid,'checked private path never fabricates auth identity');

-- These are rejected policy shapes only. They mint no v2 authorization and do
-- not substitute this fixture's organization for the exact Pilot v2 target.
CREATE TEMP TABLE reopening_no_backup_boundary AS SELECT binding||jsonb_build_object('version',2,
 'recovery_policy','no-backup-user-waived','archive_artifact_sha256',NULL,'foreign_snapshot_sha256',repeat('5',64)) AS binding
 FROM reopening_fixture;
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_binding(binding||'{"recovery_policy":"backup-optional"}'::jsonb)
 FROM reopening_no_backup_boundary$$,'22023','financial_reset_reopening_no_backup_binding_invalid','waived backup is a closed policy, not an optional check');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_binding(binding||jsonb_build_object('archive_artifact_sha256',repeat('a',64)))
 FROM reopening_no_backup_boundary$$,'22023','financial_reset_reopening_no_backup_binding_invalid','no-backup mode cannot claim an encrypted archive digest');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_binding(binding||'{"recovery":{}}'::jsonb)
 FROM reopening_no_backup_boundary$$,'22023','financial_reset_reopening_no_backup_binding_invalid','no-backup reopening cannot borrow inverse scope');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_binding(binding||jsonb_build_object('foreign_snapshot_sha256',repeat('0',64)))
 FROM reopening_no_backup_boundary$$,'22023','financial_reset_reopening_no_backup_binding_invalid','no-backup reopening retains the original foreign snapshot');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_binding(jsonb_set(binding,'{reopening,execution_business_date}','"not-a-date"'))
 FROM reopening_no_backup_boundary$$,'22023','financial_reset_reopening_binding_invalid','separate reopening review requires an exact business date');
SELECT * FROM finish();
ROLLBACK;
