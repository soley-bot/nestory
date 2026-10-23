BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('fa231040-0000-4000-8000-000000000010','authenticated','authenticated','zero-maker@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231040-0000-4000-8000-000000000011','authenticated','authenticated','zero-checker@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231040-0000-4000-8000-000000000012','authenticated','authenticated','zero-unprivileged@test.invalid','{"provider":"email","providers":["email"]}','{}');
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
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES
 ('fa231040-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id','fa231040-0000-4000-8000-000000000100',
 'organization_id','fa231040-0000-4000-8000-000000000001','operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),'archive_sha256',app_private.financial_reset_hash('[]'),
 'action_sha256',app_private.financial_reset_hash('[]'),'archive_count',0,'action_count',0,'audit_timestamp',now(),'audit_actor',NULL));
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
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000012',true);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',
 (SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231040-0000-4000-8000-000000000100'))$$,
 '42501','financial_reset_zero_approval_forbidden','named reviewer must still have ordinary approval authority');
SELECT app_private.seal_financial_reset_operation('fa231040-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT app_private.complete_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000012',true);
SELECT set_config('request.jwt.claims','{"sub":"fa231040-0000-4000-8000-000000000012","role":"authenticated","sentinel":"original"}',true);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"stale","sentinel":"original"}',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '42501','financial_reset_zero_independent_approval_required','unendorsed actor IDs cannot authorize the zero phase');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','failed command leaves the committed freeze intact');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001'),0::bigint,'failed reviewer rolls back the maker submission too');
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001'),0::bigint,'failed phase leaves no new executable idempotency intent');
SELECT is(current_setting('request.jwt.claim.sub'),'fa231040-0000-4000-8000-000000000012','failure restores original actor');
SELECT is(current_setting('request.headers'),'{"x-nestory-financial-generation":"stale","sentinel":"original"}','failure restores original header bytes');
ROLLBACK TO SAVEPOINT zero_bad_reviewer;

SELECT lives_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan FROM zero_test_plan))$$,'complete reviewed plan binds before deletion begins');
SELECT lives_ok($$SELECT pg_temp.prepare_zero_probe((SELECT plan FROM zero_test_plan))$$,'identical zero plan is retry-safe');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_plans SET plan_json=plan_json||'{"maker_actor_id":"fa231040-0000-4000-8000-000000000011"}'::jsonb WHERE operation_id='fa231040-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_zero_plan_binding_invalid','reviewed actor binding cannot be edited');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_zero_same_action_transaction_required','zero phase cannot precede the reviewed removal sequence');
SELECT set_config('test.zero_review',(SELECT app_private.financial_reset_hash(plan) FROM zero_test_plan),true);
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000012',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'))$$,
 '42501','financial_reset_zero_approval_forbidden','an unrelated authenticated member cannot approve another actor plan');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000010',true);
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
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_approvals WHERE operation_id='fa231040-0000-4000-8000-000000000100'),1::bigint,'duplicate maker approval does not substitute for reviewer');
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000011',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa231040-0000-4000-8000-000000000100',current_setting('test.zero_review'))$$,
 'reviewer separately approves from their authenticated identity');
RESET ROLE;
SELECT throws_ok($$DELETE FROM app_private.financial_reset_zero_approvals WHERE operation_id='fa231040-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_evidence_immutable','approval evidence cannot be erased');
SELECT app_private.seal_financial_reset_operation('fa231040-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SELECT app_private.complete_financial_reset_actions('fa231040-0000-4000-8000-000000000100');
SAVEPOINT zero_revoked_reviewer;
SELECT throws_ok($$DELETE FROM public.organization_members WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND user_id='fa231040-0000-4000-8000-000000000011'$$,
 '55000','financial_writes_frozen','reviewer authority cannot be changed inside the frozen reset');
ROLLBACK TO SAVEPOINT zero_revoked_reviewer;
SELECT set_config('request.jwt.claim.sub','fa231040-0000-4000-8000-000000000012',true);
SELECT set_config('request.jwt.claims','{"sub":"fa231040-0000-4000-8000-000000000012","sentinel":"original"}',true);
SELECT set_config('request.headers','{"sentinel":"original"}',true);
SAVEPOINT zero_immediate_before_helper;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,
 '23514','approved initial owner opening request requires exactly one opening entry','forcing ordinary conservation immediate fails closed inside the unchanged command');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','ordinary immediate-constraint failure rolls back the temporary open');
ROLLBACK TO SAVEPOINT zero_immediate_before_helper;
SAVEPOINT zero_immediate_control_before_helper;
SET CONSTRAINTS app_private.financial_reset_control_commit_frozen IMMEDIATE;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,'initial zero phase succeeds with its control constraint immediate before helper');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','immediate-mode helper returns with a frozen control');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231040-0000-4000-8000-000000000001'$$,
 '23514','financial_reset_phase_must_commit_frozen','immediate-mode helper cannot be followed by an unchecked reopen');
ROLLBACK TO SAVEPOINT zero_immediate_control_before_helper;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100')$$,'normal independent submit/review commands create all four explicit zero components atomically');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),'frozen','successful phase refreezes before returning');
SELECT is((SELECT generation FROM app_private.financial_write_controls WHERE organization_id='fa231040-0000-4000-8000-000000000001'),1,'private temporary open preserves reserved generation');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND signed_amount=0),4::bigint,'all four components have actual zero entries');
SELECT is((SELECT count(DISTINCT component) FROM public.owner_opening_balance_entries WHERE organization_id='fa231040-0000-4000-8000-000000000001'),4::bigint,'zero proof does not infer missing components');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND status='approved'
 AND submitted_by='fa231040-0000-4000-8000-000000000010' AND reviewed_by='fa231040-0000-4000-8000-000000000011'),4::bigint,'approved requests preserve independent maker/checker identities');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231040-0000-4000-8000-000000000001' AND supporting_document_id IS NOT NULL),0::bigint,'review manifest source evidence requires no fabricated Storage document');
SELECT is(current_setting('request.jwt.claim.sub'),'fa231040-0000-4000-8000-000000000012','success restores caller actor');
SELECT is(current_setting('request.jwt.claims'),'{"sub":"fa231040-0000-4000-8000-000000000012","sentinel":"original"}','success restores exact original claims bytes');
SELECT is(current_setting('request.headers'),'{"sentinel":"original"}','success restores original header bytes');
SELECT is(app_private.apply_financial_reset_known_zero('fa231040-0000-4000-8000-000000000100'),
 (SELECT result_json FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231040-0000-4000-8000-000000000100'),'unknown-commit retry returns exact proof without adding openings');
SAVEPOINT zero_cannot_escape_open;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231040-0000-4000-8000-000000000001';
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_phase_must_commit_frozen','caller cannot reopen after helper and commit an exposed partial phase');
ROLLBACK TO SAVEPOINT zero_cannot_escape_open;
SAVEPOINT zero_cannot_flush_fence;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231040-0000-4000-8000-000000000001'$$,
 '23514','financial_reset_phase_must_commit_frozen','flushing the original fence cannot authorize a later reopen');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa231040-0000-4000-8000-000000000001'$$,
 '23514','financial_reset_phase_must_commit_frozen','flushing the original fence cannot authorize a later generation change');
ROLLBACK TO SAVEPOINT zero_cannot_flush_fence;
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'completed private phase retains normal deferred approval conservation');
SELECT * FROM finish();
ROLLBACK;
