-- Clean-schema, rollback-only synthetic fixture. Gateway role switching tests
-- native checks; it is not evidence of hosted login or customer execution.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE resume_fixture AS SELECT
 '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid org,
 '7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid operation,
 '4db95b1e-774b-4a8c-881a-2192724aa42d'::uuid failed_auth,
 'ee280535-0000-4000-8000-000000000001'::uuid actor,
 'ee280535-0000-4000-8000-000000000002'::uuid session,
 NULL::jsonb binding,NULL::uuid current_auth,NULL::jsonb original_reservation,NULL::jsonb original_checkpoint;
CREATE FUNCTION pg_temp.resume_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('ee280535-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
SELECT is((SELECT count(*) FROM public.organizations),0::bigint,'fixture starts in a clean synthetic schema');
SELECT is((SELECT count(*) FROM app_private.financial_reset_execute_resumes),0::bigint,'migration installation activates nothing');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='app_private.financial_reset_execute_resumes'::regclass), 'resume audit has RLS');
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
 WHERE has_table_privilege(role,'app_private.financial_reset_execute_resumes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 OR has_function_privilege(role,'app_private.activate_financial_reset_execute_resume(jsonb,uuid)','EXECUTE')
 OR has_function_privilege(role,'app_private.financial_reset_execute_foreign_sha256(jsonb)','EXECUTE')), 'API roles gain no private privileges');
SELECT throws_ok($$SELECT app_private.activate_financial_reset_execute_resume('{}',NULL)$$,'22023','financial_reset_execute_resume_scope_invalid','missing fixed scope fails closed');
SELECT throws_ok($$SELECT app_private.activate_financial_reset_execute_resume(jsonb_build_object('operation_id',operation,'organization_id',org),failed_auth) FROM resume_fixture$$,
 '42501','financial_reset_actor_context_required','fixed identifiers do not substitute for consumed genuine authority');

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous)
 SELECT actor,'authenticated','authenticated','execute-resume@test.invalid','{"provider":"email","providers":["email"]}','{}',false FROM resume_fixture;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
 SELECT session,actor,now(),now(),'aal1' FROM resume_fixture;
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 SELECT org,'Resume synthetic Pilot','resume-synthetic-pilot','UTC' FROM resume_fixture;
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 SELECT pg_temp.resume_id(10+n),'Resume foreign sentinel','resume-foreign-'||n,'UTC' FROM generate_series(1,4) n;
INSERT INTO public.organization_members(organization_id,user_id,role) SELECT org,actor,'super_admin' FROM resume_fixture;
INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
 SELECT pg_temp.resume_id(20),org,'Resume property','RSM','apartment','multi_unit','active' FROM resume_fixture;
INSERT INTO public.people(id,organization_id,display_name,party_type)
 SELECT pg_temp.resume_id(21),org,'Resume owner','company' FROM resume_fixture;
INSERT INTO public.person_roles(organization_id,person_id,role) SELECT org,pg_temp.resume_id(21),'owner' FROM resume_fixture;
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
 SELECT org,pg_temp.resume_id(20),pg_temp.resume_id(21),'Owner',100,true,'2025-01-01',actor,actor FROM resume_fixture;
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT pg_temp.resume_id(10000+n),org,(DATE '1700-01-01'+n*interval '1 month')::date,actor,'Synthetic archived row'
 FROM resume_fixture CROSS JOIN generate_series(1,4898) n;
CREATE TEMP TABLE resume_archive AS SELECT to_jsonb(t) image,jsonb_build_object('id',id) pk,
 row_number() OVER(ORDER BY id)::integer ordinal FROM public.financial_month_locks t CROSS JOIN resume_fixture f WHERE t.organization_id=f.org;
CREATE TEMP TABLE resume_actions AS SELECT jsonb_agg(jsonb_build_object('action_id',pg_temp.resume_id(20000+ordinal),
 'ordinal',ordinal,'relation_name','public.financial_month_locks','primary_key',pk,'kind','archive-delete',
 'before_row_text',image::text,'before_sha256',app_private.financial_reset_hash(image),'after_row_text',NULL,'after_sha256',NULL) ORDER BY ordinal) value
 FROM resume_archive WHERE ordinal<=4169;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) SELECT org,1,'frozen','2026-10-01' FROM resume_fixture;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id',operation,'organization_id',org,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),
 'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),'archive_count',4898,'action_count',4169,
 'audit_timestamp',clock_timestamp(),'audit_actor',NULL,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',pk,'row_sha256',app_private.financial_reset_hash(image)) ORDER BY pk::text)) FROM resume_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer)) FROM resume_actions CROSS JOIN LATERAL jsonb_array_elements(value) a))) FROM resume_fixture;
SELECT app_private.archive_financial_reset_rows(operation,(SELECT jsonb_agg(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',pk,'row_text',image::text,'row_sha256',app_private.financial_reset_hash(image))) FROM resume_archive)) FROM resume_fixture;
SELECT app_private.prepare_financial_reset_actions(operation,value) FROM resume_fixture CROSS JOIN resume_actions;
CREATE TEMP TABLE resume_zero AS SELECT jsonb_build_object('version',4,'approval_policy','pilot-october-single-admin-v1',
 'operation_id',operation,'organization_id',org,'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id',actor,'reviewer_actor_id',NULL,'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_empty_zero_scope_on_date(org,'2026-10-01')) value FROM resume_fixture;
SELECT app_private.prepare_financial_reset_zero_plan(operation,value,app_private.financial_reset_hash(value)) FROM resume_fixture CROSS JOIN resume_zero;
SELECT app_private.seal_financial_reset_operation(operation) FROM resume_fixture;
CREATE TEMP TABLE resume_semantic AS SELECT jsonb_build_object('version',4,'actor_id',actor,'billing_period_start','2026-10-01',
 'issue_date','2026-10-01','execution_business_date','2026-10-28','invoice_date_policy','empty-books-no-invoices',
 'contracts_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(org)),'leases','[]'::jsonb) value FROM resume_fixture;
UPDATE resume_fixture f SET binding=jsonb_build_object('version',1,'operation_id',o.operation_id,'project_ref','syntheticprojectrefa','organization_id',o.organization_id,
 'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),'schema_sha256',o.schema_sha256,'ledger_sha256',repeat('3',64),
 'source_snapshot_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(f.org)),
 'source_generation',0,'target_generation',1,'cutoff','2026-10-01','issue_date','2026-10-01','timezone','UTC','execution_business_date','2026-10-28',
 'invoice_date_policy','empty-books-no-invoices','manifest_sha256',o.manifest_sha256,'plan_sha256',o.plan_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
 'archive_artifact_sha256',repeat('4',64),'archive_count',4898,'action_count',4169,'zero_review_sha256',z.review_sha256,
 'continuation_semantic_sha256',app_private.financial_reset_hash(s.value),'report_review_sha256',repeat('5',64),'continuation_semantic',s.value)
 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id) CROSS JOIN resume_semantic s WHERE o.operation_id=f.operation;
INSERT INTO app_private.financial_reset_hosted_reservations(operation_id,organization_id,binding,binding_sha256,foreign_sha256)
 SELECT operation,org,binding,app_private.financial_reset_hash(binding),app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(org)) FROM resume_fixture;
INSERT INTO app_private.financial_reset_hosted_checkpoints(operation_id,organization_id,binding_sha256,authority_sha256,source_sha256,foreign_sha256)
 SELECT operation_id,organization_id,binding_sha256,repeat('6',64),binding->>'source_snapshot_sha256',foreign_sha256 FROM app_private.financial_reset_hosted_reservations;
UPDATE resume_fixture SET original_reservation=(SELECT to_jsonb(r) FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=operation),
 original_checkpoint=(SELECT to_jsonb(c) FROM app_private.financial_reset_hosted_checkpoints c WHERE c.operation_id=operation);
-- Only the expired historical authorization is seeded directly. The fresh
-- attempt below uses the genuine-ingress native RPC and unchanged consume API.
INSERT INTO app_private.financial_reset_actor_authorizations(authorization_id,organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,credential_expires_at,issued_at,expires_at)
 SELECT failed_auth,org,operation,'execute',binding,app_private.financial_reset_hash(binding),actor,session,clock_timestamp()+interval '1 hour',clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '6 minutes' FROM resume_fixture;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session,'role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',extract(epoch FROM clock_timestamp()+interval '1 hour')::bigint)::text,true) FROM resume_fixture;
GRANT SELECT,UPDATE ON resume_fixture TO authenticated;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE resume_fixture SET current_auth=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT is((SELECT expires_at-issued_at FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=(SELECT current_auth FROM resume_fixture)),
 interval '15 minutes','only exact reserved Pilot execute receives fifteen minutes');
-- Fresh gateway issuances prove shorter credentials/sessions remain decisive,
-- and unrelated actions/operations/bindings retain the ordinary limit.
SAVEPOINT authorization_window_cases;
CREATE TEMP TABLE window_cases(label text PRIMARY KEY,authorization_id uuid);
GRANT SELECT,INSERT ON window_cases TO authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session,'role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',extract(epoch FROM clock_timestamp()+interval '1 hour')::bigint)::text,true) FROM resume_fixture;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
INSERT INTO window_cases SELECT 'other action',public.authorize_financial_reset_hosted_action(binding,'seal') FROM resume_fixture;
INSERT INTO window_cases SELECT 'other operation',public.authorize_financial_reset_hosted_action(jsonb_set(binding,'{operation_id}',to_jsonb('ee280535-0000-4000-8000-000000000099'::text)),'execute') FROM resume_fixture;
INSERT INTO window_cases SELECT 'different reservation binding',public.authorize_financial_reset_hosted_action(jsonb_set(binding,'{packet_sha256}',to_jsonb(repeat('f',64))),'execute') FROM resume_fixture;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT ok(NOT EXISTS(SELECT 1 FROM window_cases w JOIN app_private.financial_reset_actor_authorizations a USING(authorization_id)
 WHERE a.expires_at-a.issued_at<>interval '5 minutes'),'other action, operation and non-reserved binding stay at five minutes');
UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 minutes' WHERE id=(SELECT session FROM resume_fixture);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
INSERT INTO window_cases SELECT 'session cap',public.authorize_financial_reset_hosted_action(binding,'execute') FROM resume_fixture;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT a.expires_at FROM app_private.financial_reset_actor_authorizations a JOIN window_cases w USING(authorization_id) WHERE w.label='session cap'),
 (SELECT not_after FROM auth.sessions WHERE id=(SELECT session FROM resume_fixture)),'two-minute live session caps the scoped window');
UPDATE auth.sessions SET not_after=NULL WHERE id=(SELECT session FROM resume_fixture);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session,'role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',extract(epoch FROM clock_timestamp()+interval '2 minutes')::bigint)::text,true) FROM resume_fixture;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
INSERT INTO window_cases SELECT 'credential cap',public.authorize_financial_reset_hosted_action(binding,'execute') FROM resume_fixture;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT ok((SELECT a.expires_at=a.credential_expires_at AND a.expires_at-a.issued_at<interval '3 minutes'
 FROM app_private.financial_reset_actor_authorizations a JOIN window_cases w USING(authorization_id) WHERE w.label='credential cap'),
 'two-minute genuine credential caps the scoped window');
SELECT throws_ok($$INSERT INTO app_private.financial_reset_actor_authorizations(organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,credential_expires_at,issued_at,expires_at)
 SELECT organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,credential_expires_at,issued_at,issued_at+interval '15 minutes 1 second'
 FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=(SELECT current_auth FROM resume_fixture)$$,
 '23514',NULL,'table constraint refuses exceeding the fixed fifteen-minute ceiling');
ROLLBACK TO SAVEPOINT authorization_window_cases;
SAVEPOINT short_authority;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session,'role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',extract(epoch FROM clock_timestamp()+interval '3 seconds')::bigint)::text,true) FROM resume_fixture;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE resume_fixture SET current_auth=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT app_private.consume_financial_reset_actor_authorization(current_auth,binding,'execute') FROM resume_fixture;
SELECT app_private.activate_financial_reset_execute_resume(binding,failed_auth) FROM resume_fixture;
SELECT pg_sleep(greatest(0,extract(epoch FROM (SELECT expires_at FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=(SELECT current_auth FROM resume_fixture))-clock_timestamp()))+0.05);
SELECT throws_ok($$SELECT app_private.financial_reset_execute_foreign_sha256(binding) FROM resume_fixture$$,
 '42501','financial_reset_actor_context_required','an activated baseline cannot outlive the genuine authorization deadline');
ROLLBACK TO SAVEPOINT short_authority;
SELECT app_private.consume_financial_reset_actor_authorization(current_auth,binding,'execute') FROM resume_fixture;
SAVEPOINT incomplete_attempt;
SELECT app_private.start_financial_reset_actions(operation) FROM resume_fixture;
SELECT throws_ok($$SELECT app_private.activate_financial_reset_execute_resume(binding,failed_auth) FROM resume_fixture$$,
 '40001','financial_reset_execute_resume_rollback_required','an executing operation is not a proven rolled-back attempt');
ROLLBACK TO SAVEPOINT incomplete_attempt;
SELECT is((SELECT app_private.financial_reset_execute_foreign_sha256(binding) FROM resume_fixture),
 (SELECT original_reservation->>'foreign_sha256' FROM resume_fixture),'without activation the original baseline remains authoritative');
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT pg_temp.resume_id(30),pg_temp.resume_id(11),'2026-09-01',actor,'Synthetic interval foreign change' FROM resume_fixture;
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_reservation(binding,'execute') FROM resume_fixture$$,
 '40001','financial_reset_hosted_reservation_mismatch','ordinary execution still rejects drift from the frozen foreign checkpoint');
SELECT throws_ok($$SELECT app_private.activate_financial_reset_execute_resume(binding,pg_temp.resume_id(99)) FROM resume_fixture$$,
 '22023','financial_reset_execute_resume_scope_invalid','another failed authorization cannot activate');
SAVEPOINT activation_rollback;
SELECT lives_ok($$SELECT app_private.activate_financial_reset_execute_resume(binding,failed_auth) FROM resume_fixture$$,'exact genuine attempt captures a fresh census');
SELECT is((SELECT count(*) FROM app_private.financial_reset_execute_resumes),1::bigint,'exactly one audit row is appended');
SELECT is((SELECT foreign_sha256 FROM app_private.financial_reset_execute_resumes),
 (SELECT app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(org)) FROM resume_fixture),'fresh baseline equals actual full current census');
SELECT is((SELECT app_private.financial_reset_execute_foreign_sha256(binding) FROM resume_fixture),
 (SELECT foreign_sha256 FROM app_private.financial_reset_execute_resumes),'only the current consumed transaction obtains the fresh baseline');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_hosted_reservation(binding,'execute') FROM resume_fixture$$,'all original reservation source/frozen/checkpoint guards pass with the audited baseline');
SELECT throws_ok($$SELECT app_private.activate_financial_reset_execute_resume(binding,failed_auth) FROM resume_fixture$$,
 '55000','financial_reset_execute_resume_already_recorded','the attempt cannot append a second baseline');
SELECT throws_ok($$UPDATE app_private.financial_reset_execute_resumes SET foreign_sha256=repeat('f',64)$$,'23514','financial_reset_evidence_immutable','audit baseline cannot be overwritten');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_execute_resumes$$,'23514','financial_reset_evidence_immutable','audit baseline cannot be deleted');
SELECT throws_ok($$TRUNCATE app_private.financial_reset_execute_resumes$$,'23514','financial_reset_evidence_immutable','audit baseline cannot be truncated');
SELECT is((SELECT to_jsonb(r) FROM app_private.financial_reset_hosted_reservations r),(SELECT original_reservation FROM resume_fixture),'original reservation is byte-for-byte unchanged');
SELECT is((SELECT to_jsonb(c) FROM app_private.financial_reset_hosted_checkpoints c),(SELECT original_checkpoint FROM resume_fixture),'original checkpoint is byte-for-byte unchanged');
SAVEPOINT foreign_drift;
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT pg_temp.resume_id(31),pg_temp.resume_id(11),'2026-08-01',actor,'Synthetic during-attempt foreign change' FROM resume_fixture;
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_reservation(binding,'execute') FROM resume_fixture$$,
 '40001','financial_reset_hosted_reservation_mismatch','a later real foreign write still fails the before/after guard');
ROLLBACK TO SAVEPOINT foreign_drift;
SAVEPOINT revoked_actor;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=(SELECT session FROM resume_fixture);
SELECT throws_ok($$SELECT app_private.financial_reset_execute_foreign_sha256(binding) FROM resume_fixture$$,
 '42501','financial_reset_actor_context_required','an audit row does not cache or renew actor/session authority');
ROLLBACK TO SAVEPOINT revoked_actor;
ROLLBACK TO SAVEPOINT activation_rollback;
SELECT is((SELECT count(*) FROM app_private.financial_reset_execute_resumes),0::bigint,'transaction rollback removes activation rather than leaving an ambient baseline');
SELECT is((SELECT app_private.financial_reset_execute_foreign_sha256(binding) FROM resume_fixture),
 (SELECT original_reservation->>'foreign_sha256' FROM resume_fixture),'rolled-back activation falls back to the original baseline');
SELECT is((SELECT count(*) FROM app_private.financial_reset_actions WHERE applied_at IS NOT NULL),0::bigint,'activation never applies a financial action');
SELECT is((SELECT count(*) FROM public.financial_month_locks WHERE organization_id=(SELECT org FROM resume_fixture)),4898::bigint,'all synthetic Pilot financial rows remain intact');
SELECT ok((SELECT expires_at<=issued_at+interval '15 minutes' AND expires_at<=credential_expires_at FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=(SELECT current_auth FROM resume_fixture)), 'exact scoped authorization retains its bounded credential-capped deadline');
SELECT * FROM finish();
ROLLBACK;
