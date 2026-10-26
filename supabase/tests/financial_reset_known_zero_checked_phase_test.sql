BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- SQL-only gateway simulation with real synthetic Auth session rows. This is
-- fixture setup, not evidence of a real Auth login or HTTP/PostgREST ingress.
CREATE FUNCTION pg_temp.reset_fixture_claims(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'session_id',md5(p_actor::text||':reset-fixture')::uuid,
  'role','authenticated','aud','authenticated','is_anonymous',false,
  'exp',extract(epoch FROM clock_timestamp()+interval '1 hour')::bigint)::text,true);
END;
$$;
CREATE FUNCTION pg_temp.reset_fixture_binding(p_operation uuid,p_semantic jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('version',1,'operation_id',o.operation_id,'project_ref','syntheticprojectrefa','organization_id',o.organization_id,
  'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),'schema_sha256',o.schema_sha256,
  'ledger_sha256',repeat('3',64),'source_snapshot_sha256',repeat('4',64),'source_generation',o.source_generation,'target_generation',o.target_generation,
  'cutoff','2026-10-01','issue_date','2026-10-01','timezone',g.operational_timezone,
  'execution_business_date',app_private.rent_business_date(o.organization_id,statement_timestamp()),'invoice_date_policy','original-reviewed-october',
  'manifest_sha256',o.manifest_sha256,'plan_sha256',o.plan_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
  'archive_artifact_sha256',repeat('5',64),'archive_count',o.archive_count,'action_count',o.action_count,'zero_review_sha256',z.review_sha256,
  'continuation_semantic_sha256',app_private.financial_reset_hash(p_semantic),'report_review_sha256',repeat('6',64),'continuation_semantic',p_semantic)
 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id)
 JOIN public.organizations g ON g.id=o.organization_id WHERE o.operation_id=p_operation
$$;
CREATE TEMP TABLE reset_operator_fixture(binding jsonb,authorization_id uuid);
GRANT SELECT,UPDATE ON reset_operator_fixture TO authenticated;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('fa231040-0000-4000-8000-000000000010','authenticated','authenticated','zero-maker@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231040-0000-4000-8000-000000000011','authenticated','authenticated','zero-checker@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231040-0000-4000-8000-000000000012','authenticated','authenticated','zero-unprivileged@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(id::text||':reset-fixture')::uuid,id,now(),now(),'aal1'
FROM auth.users WHERE id::text LIKE 'fa231040-%';
INSERT INTO public.organizations(id,name,slug) VALUES('fa231040-0000-4000-8000-000000000001','Known zero fixture','known-zero-fixture');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000010','super_admin'),
 ('fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000011','super_admin');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('fa231040-0000-4000-8000-000000000020','fa231040-0000-4000-8000-000000000001','Zero branch','ZRO','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id) VALUES
 ('fa231040-0000-4000-8000-000000000002','fa231040-0000-4000-8000-000000000001','Zero property','ZRO','Apartment','fa231040-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('fa231040-0000-4000-8000-000000000003','fa231040-0000-4000-8000-000000000001','Zero owner'),
 ('fa231040-0000-4000-8000-000000000005','fa231040-0000-4000-8000-000000000001','Zero operations member');
INSERT INTO public.person_roles(organization_id,person_id,role,status) VALUES
 ('fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000003','owner','active'),
 ('fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000005','staff','active');
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,person_id) VALUES
 ('fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000012','operations_member','fa231040-0000-4000-8000-000000000020','fa231040-0000-4000-8000-000000000005');
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on) VALUES
 ('fa231040-0000-4000-8000-000000000004','fa231040-0000-4000-8000-000000000001','fa231040-0000-4000-8000-000000000002','fa231040-0000-4000-8000-000000000003',100,'2026-01-01');
-- Real reviewed archive/delete work satisfies the hosted nonempty-action contract.
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
VALUES('fa231040-0000-4000-8000-000000000040','fa231040-0000-4000-8000-000000000001','2026-09-01','fa231040-0000-4000-8000-000000000010','Synthetic reviewed archive source');
CREATE TEMP TABLE reset_archive_fixture AS SELECT to_jsonb(f) AS image FROM public.financial_month_locks f WHERE id='fa231040-0000-4000-8000-000000000040';
CREATE TEMP TABLE reset_action_fixture AS SELECT jsonb_build_array(jsonb_build_object('action_id','fa231040-0000-4000-8000-000000000101','ordinal',1,
 'relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',image->'id'),'kind','archive-delete',
 'before_row_text',image::text,'before_sha256',app_private.financial_reset_hash(image),'after_row_text',NULL,'after_sha256',NULL)) AS actions
FROM reset_archive_fixture;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES
 ('fa231040-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id','fa231040-0000-4000-8000-000000000100',
 'organization_id','fa231040-0000-4000-8000-000000000001','operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
  'primary_key',jsonb_build_object('id',image->'id'),'row_sha256',app_private.financial_reset_hash(image)))) FROM reset_archive_fixture),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM reset_action_fixture CROSS JOIN LATERAL jsonb_array_elements(actions) a),'archive_count',1,'action_count',1,'audit_timestamp',now(),'audit_actor',NULL));
SELECT app_private.archive_financial_reset_rows('fa231040-0000-4000-8000-000000000100',jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
 'primary_key',jsonb_build_object('id',image->'id'),'row_text',image::text,'row_sha256',app_private.financial_reset_hash(image)))) FROM reset_archive_fixture;
SELECT app_private.prepare_financial_reset_actions('fa231040-0000-4000-8000-000000000100',actions) FROM reset_action_fixture;
CREATE TEMP TABLE zero_test_plan AS SELECT jsonb_build_object('operation_id','fa231040-0000-4000-8000-000000000100',
 'organization_id','fa231040-0000-4000-8000-000000000001','manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id','fa231040-0000-4000-8000-000000000010','reviewer_actor_id','fa231040-0000-4000-8000-000000000011',
 'effective_date','2026-10-01','currencies','["USD"]'::jsonb,'scopes',app_private.financial_reset_known_zero_scope('fa231040-0000-4000-8000-000000000100')) AS plan;
CREATE FUNCTION pg_temp.prepare_zero_probe(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',p_plan,app_private.financial_reset_hash(p_plan))
$$;
SELECT is(jsonb_array_length((SELECT plan->'scopes' FROM zero_test_plan)),1,'scope contains explicit live owner authority');
SELECT ok(NOT has_function_privilege('authenticated','app_private.apply_financial_reset_known_zero(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','app_private.apply_financial_reset_known_zero(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','app_private.prepare_financial_reset_zero_plan(uuid,jsonb,text)','EXECUTE'),
 'known-zero execution and review are private to the database operator');
SELECT throws_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan||'{"currencies":["KHR"]}'::jsonb FROM zero_test_plan))$$,
 '23514','financial_reset_zero_review_scope_invalid','unsupported KHR cannot silently widen existing USD authority');
SELECT throws_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan||'{"scopes":[]}'::jsonb FROM zero_test_plan))$$,
 '23514','financial_reset_zero_review_scope_invalid','missing owner scope is not interpreted as zero');
SELECT throws_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan||'{"reviewer_actor_id":"fa231040-0000-4000-8000-000000000010"}'::jsonb FROM zero_test_plan))$$,
 '42501','financial_reset_zero_independent_actors_required','one actor cannot self-approve the zero baseline');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',(SELECT plan FROM zero_test_plan),repeat('f',64))$$,
 '23514','financial_reset_zero_review_scope_invalid','review digest must cover exact actors and complete scope');

-- Naming identities is insufficient; the plan needs their own session approvals.
SAVEPOINT zero_bad_reviewer;
SELECT pg_temp.prepare_zero_probe((SELECT plan||'{"reviewer_actor_id":"fa231040-0000-4000-8000-000000000012"}'::jsonb FROM zero_test_plan));
SELECT set_config('test.zero_bad_review',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231040-0000-4000-8000-000000000100'),true);
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000010');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_bad_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000012');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_bad_review'))$$,
 '42501','financial_reset_zero_approval_forbidden','named reviewer must still have ordinary approval authority');
RESET ROLE;
RESET SESSION AUTHORIZATION;
INSERT INTO reset_operator_fixture(binding)
SELECT pg_temp.reset_fixture_binding('fa231040-0000-4000-8000-000000000100',jsonb_build_object('version',3,'actor_id','fa231040-0000-4000-8000-000000000010',
 'billing_period_start','2026-10-01','issue_date','2026-10-01','invoice_date_policy','original-reviewed-october',
 'execution_business_date',app_private.rent_business_date('fa231040-0000-4000-8000-000000000001',statement_timestamp()),'original_invoice_sources','[]'::jsonb,'leases','[]'::jsonb));
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000010');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);

SELECT app_private.seal_financial_reset_operation('fa231040-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT app_private.arm_financial_reset_action('fa231040-0000-4000-8000-000000000100','fa231040-0000-4000-8000-000000000101');
DELETE FROM public.financial_month_locks WHERE id='fa231040-0000-4000-8000-000000000040';
SELECT app_private.complete_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"sentinel":"original"}',true);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"stale","sentinel":"original"}',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '42501','financial_reset_zero_session_endorsement_required','unendorsed actor IDs cannot authorize the zero phase');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','failed command leaves the committed freeze intact');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001'),0::bigint,'failed reviewer rolls back the maker submission too');
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001'),0::bigint,'failed phase leaves no new executable idempotency intent');
SELECT is(current_setting('request.jwt.claim.sub'),'','failure preserves the claim-free operator');
SELECT is(current_setting('request.headers'),'{"x-nestory-financial-generation":"stale","sentinel":"original"}','failure restores original header bytes');
ROLLBACK TO SAVEPOINT zero_bad_reviewer;

SELECT lives_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan FROM zero_test_plan))$$,'complete reviewed plan binds before deletion begins');
SELECT lives_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan FROM zero_test_plan))$$,'identical zero plan is retry-safe');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_plans SET plan_json=plan_json||'{"maker_actor_id":"fa231040-0000-4000-8000-000000000011"}'::jsonb WHERE operation_id='fa231040-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_zero_plan_binding_invalid','reviewed actor binding cannot be edited');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '42501','financial_reset_scoped_operator_required','reviewed UUIDs alone cannot authorize the private zero phase');
SELECT set_config('test.zero_review',(SELECT app_private.financial_reset_hash(plan) FROM zero_test_plan),true);
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000012');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'))$$,
 '42501','financial_reset_zero_approval_forbidden','an unrelated authenticated member cannot approve another actor plan');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000010');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',repeat('f',64))$$,
 '23514','financial_reset_zero_approval_plan_invalid','approval must reference the exact reviewed plan digest');
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'))$$,
 'maker approves through the authenticated RPC');
SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'));
SELECT throws_ok($$INSERT INTO app_private.financial_reset_zero_approvals(operation_id,organization_id,approval_kind,review_sha256,approved_by)
 VALUES('fa231040-0000-4000-8000-000000000100','fa231040-0000-4000-8000-000000000001','reviewer',repeat('a',64),'fa231040-0000-4000-8000-000000000011')$$,
 '42501',NULL,'ordinary callers cannot forge approval rows');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_approvals WHERE operation_id='fa231040-0000-4000-8000-000000000100'),1::bigint,'duplicate maker approval does not substitute for reviewer');
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000011');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'))$$,
 'reviewer separately approves from their authenticated identity');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT throws_ok($$DELETE FROM app_private.financial_reset_zero_approvals WHERE operation_id='fa231040-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_evidence_immutable','approval evidence cannot be erased');
INSERT INTO reset_operator_fixture(binding)
SELECT pg_temp.reset_fixture_binding('fa231040-0000-4000-8000-000000000100',jsonb_build_object('version',3,'actor_id','fa231040-0000-4000-8000-000000000010',
 'billing_period_start','2026-10-01','issue_date','2026-10-01','invoice_date_policy','original-reviewed-october',
 'execution_business_date',app_private.rent_business_date('fa231040-0000-4000-8000-000000000001',statement_timestamp()),'original_invoice_sources','[]'::jsonb,'leases','[]'::jsonb));
SELECT pg_temp.reset_fixture_claims('fa231040-0000-4000-8000-000000000010');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_zero_same_action_transaction_required','zero phase cannot precede the reviewed removal sequence');
SELECT app_private.seal_financial_reset_operation('fa231040-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT app_private.arm_financial_reset_action('fa231040-0000-4000-8000-000000000100','fa231040-0000-4000-8000-000000000101');
DELETE FROM public.financial_month_locks WHERE id='fa231040-0000-4000-8000-000000000040';
SELECT app_private.complete_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SAVEPOINT zero_revoked_reviewer;
SELECT throws_ok($$DELETE FROM public.organization_members WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND user_id='fa231040-0000-4000-8000-000000000011'$$,
 '55000','financial_writes_frozen','reviewer authority cannot be changed inside the frozen reset');
ROLLBACK TO SAVEPOINT zero_revoked_reviewer;
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000012',true);
SELECT set_config('request.jwt.claims','{"sub":"fa231040-0000-4000-8000-000000000012","sentinel":"original"}',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '42501','financial_reset_claim_free_operator_required','private execution refuses a claimed actor even with consumed operator authorization');
SELECT is(current_setting('request.jwt.claim.sub'),'fa231040-0000-4000-8000-000000000012','rejected claimed actor is not rewritten');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"sentinel":"original"}',true);
SELECT set_config('request.headers','{"sentinel":"original"}',true);
SAVEPOINT zero_immediate_before_helper;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '23514','financial_reset_temporary_open_must_commit_frozen','forcing all constraints immediate rejects the temporary open before the checked phase can refreeze');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','ordinary immediate-constraint failure rolls back the temporary open');
ROLLBACK TO SAVEPOINT zero_immediate_before_helper;
SAVEPOINT zero_immediate_control_before_helper;
SET CONSTRAINTS app_private.financial_reset_control_commit_frozen IMMEDIATE;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,'initial zero phase succeeds with its control constraint immediate before helper');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','immediate-mode helper returns with a frozen control');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231040-0000-4000-8000-000000000001'$$,
 '23514','financial_reset_phase_must_commit_frozen','immediate-mode helper cannot be followed by an unchecked reopen');
ROLLBACK TO SAVEPOINT zero_immediate_control_before_helper;
SAVEPOINT zero_selectively_flushed_before_completion;
SET CONSTRAINTS app_private.financial_reset_checkpoint_operation_commit,app_private.financial_reset_checkpoint_evidence_commit,app_private.financial_reset_checkpoint_control_commit IMMEDIATE;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 'selectively flushing pre-phase checkpoint events does not disable normal zero construction');
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_checkpoint_zero_commit IMMEDIATE$$,
 '23514','financial_reset_checkpoint_must_commit','zero completion itself queues the checkpoint obligation after earlier checks were flushed');
ROLLBACK TO SAVEPOINT zero_selectively_flushed_before_completion;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,'normal independent submit/review commands create all four explicit zero components atomically');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','successful phase refreezes before returning');
SELECT is((SELECT generation FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),1,'private temporary open preserves reserved generation');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND signed_amount=0),4::bigint,'all four components have actual zero entries');
SELECT is((SELECT count(DISTINCT component) FROM public.owner_opening_balance_entries WHERE organization_id='fa231040-0000-4000-8000-000000000001'),4::bigint,'zero proof does not infer missing components');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND status='approved'
 AND submitted_by='fa231040-0000-4000-8000-000000000010' AND reviewed_by='fa231040-0000-4000-8000-000000000011'),4::bigint,'approved requests preserve independent maker/checker identities');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND supporting_document_id IS NOT NULL),0::bigint,'review manifest source evidence requires no fabricated Storage document');
SELECT is(current_setting('request.jwt.claim.sub'),'','success preserves the claim-free operator');
SELECT is(current_setting('request.jwt.claims'),'{"sentinel":"original"}','success preserves exact original claims bytes');
SELECT is(current_setting('request.headers'),'{"sentinel":"original"}','success restores original header bytes');
SELECT is(app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100'),
 (SELECT result_json FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231040-0000-4000-8000-000000000100'),'unknown-commit retry returns exact proof without adding openings');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidates('fa231040-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_report_checkpoint_required','zero-only recovery cannot adopt a caller-supplied current snapshot');
SAVEPOINT zero_cannot_escape_open;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231040-0000-4000-8000-000000000001';
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_phase_must_commit_frozen','caller cannot reopen after helper and commit an exposed partial phase');
ROLLBACK TO SAVEPOINT zero_cannot_escape_open;
SAVEPOINT zero_cannot_flush_fence;
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_checkpoint_must_commit',
 'a zero-only transaction cannot flush its checks or commit an unrecoverable partial reset');
ROLLBACK TO SAVEPOINT zero_cannot_flush_fence;
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_checkpoint_must_commit',
 'completed checked zero requires continuation and durable ordinary reports in the same commit');
SELECT * FROM finish();
ROLLBACK;
