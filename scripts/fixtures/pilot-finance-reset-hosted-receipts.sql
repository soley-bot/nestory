-- Synthetic COMMIT proof, intentionally outside the rollback-only pgTAP suite.
-- Run only in a disposable database named pilot_reset_receipts_<uuid> with
-- the complete migration chain. The database writer must destroy that database
-- afterward: immutable evidence is deliberately not deleted by this script.
-- No hosted project, customer rows, disabled triggers, grants or role creation.
\set ON_ERROR_STOP on
SELECT current_database() ~ '^pilot_reset_receipts_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AS receipt_disposable_database \gset
\if :receipt_disposable_database
\else
\echo 'Refusing receipt COMMIT fixture outside its explicitly named disposable database.'
\quit 3
\endif

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE receipt_fixture(
 organization uuid,foreign_organization uuid,operation uuid,maker uuid,reviewer uuid,session_id uuid,
 started_at timestamptz,source_row jsonb,operation_binding jsonb,archive_rows jsonb,actions jsonb,zero_plan jsonb,binding jsonb,
 foreign_before jsonb
);
INSERT INTO receipt_fixture(organization,foreign_organization,operation,maker,reviewer,session_id,started_at) VALUES
 ('fa231853-0000-4000-8000-000000000001','fa231853-0000-4000-8000-000000000009','fa231853-0000-4000-8000-000000000100',
  'fa231853-0000-4000-8000-000000000010','fa231853-0000-4000-8000-000000000011','fa231853-0000-4000-8000-000000000012',clock_timestamp());
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 SELECT maker,'authenticated','authenticated','receipt-maker@test.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb FROM receipt_fixture
 UNION ALL SELECT reviewer,'authenticated','authenticated','receipt-reviewer@test.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb FROM receipt_fixture;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after,aal)
 SELECT session_id,maker,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour','aal1' FROM receipt_fixture;
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 SELECT organization,'Synthetic receipt proof','synthetic-receipt-proof','Asia/Phnom_Penh' FROM receipt_fixture
 UNION ALL SELECT foreign_organization,'Synthetic receipt foreign sentinel','synthetic-receipt-foreign','Asia/Phnom_Penh' FROM receipt_fixture;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT organization,maker,'super_admin' FROM receipt_fixture UNION ALL SELECT organization,reviewer,'super_admin' FROM receipt_fixture;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
 SELECT 'fa231853-0000-4000-8000-000000000020',organization,'Receipt proof branch','RCP','active' FROM receipt_fixture;
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
 SELECT 'fa231853-0000-4000-8000-000000000002',organization,'Receipt proof property','RCP','Apartment','fa231853-0000-4000-8000-000000000020' FROM receipt_fixture;
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.people(id,organization_id,display_name)
 SELECT 'fa231853-0000-4000-8000-000000000003',organization,'Receipt proof owner' FROM receipt_fixture;
INSERT INTO public.person_roles(organization_id,person_id,role,status)
 SELECT organization,'fa231853-0000-4000-8000-000000000003','owner','active' FROM receipt_fixture;
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on)
 SELECT 'fa231853-0000-4000-8000-000000000004',organization,'fa231853-0000-4000-8000-000000000002',
  'fa231853-0000-4000-8000-000000000003',100,'2026-01-01' FROM receipt_fixture;
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT 'fa231853-0000-4000-8000-000000000030'::uuid,organization,DATE '2026-09-01',maker,'Synthetic exact archive source' FROM receipt_fixture
 UNION ALL SELECT 'fa231853-0000-4000-8000-000000000039'::uuid,foreign_organization,DATE '2026-09-01',maker,'Synthetic foreign sentinel' FROM receipt_fixture;
UPDATE receipt_fixture SET source_row=(SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231853-0000-4000-8000-000000000030'),
 foreign_before=(SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231853-0000-4000-8000-000000000039');
UPDATE receipt_fixture SET actions=jsonb_build_array(jsonb_build_object('action_id','fa231853-0000-4000-8000-000000000101','ordinal',1,
 'relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',source_row->'id'),'kind','archive-delete',
 'before_row_text',source_row::text,'before_sha256',app_private.financial_reset_hash(source_row),'after_row_text',NULL,'after_sha256',NULL,'changed_columns','[]'::jsonb)),
 archive_rows=jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',source_row->'id'),
 'row_text',source_row::text,'row_sha256',app_private.financial_reset_hash(source_row)));
UPDATE receipt_fixture SET operation_binding=jsonb_build_object('operation_id',operation,'organization_id',organization,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_sha256',app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
  'primary_key',jsonb_build_object('id',source_row->'id'),'row_sha256',app_private.financial_reset_hash(source_row)))),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text','changed_columns'] ORDER BY (a->>'ordinal')::integer))
  FROM jsonb_array_elements(actions) a),'archive_count',1,'action_count',1,'audit_timestamp',clock_timestamp(),'audit_actor',NULL);
UPDATE receipt_fixture f SET zero_plan=jsonb_build_object('operation_id',operation,'organization_id',organization,
 'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),'maker_actor_id',maker,'reviewer_actor_id',reviewer,
 'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_zero_scope_on_date(f.organization,DATE '2026-10-01'));
UPDATE receipt_fixture SET binding=jsonb_build_object('version',1,'operation_id',operation,'project_ref','syntheticreceipttest','organization_id',organization,
 'packet_sha256',repeat('1',64),'main_sha',repeat('2',40),'sources_sha256',repeat('3',64),'schema_sha256',operation_binding->>'schema_sha256',
 'ledger_sha256',repeat('4',64),'source_snapshot_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(organization)),
 'source_generation',0,'target_generation',1,'cutoff','2026-10-01','issue_date','2026-10-01','timezone','Asia/Phnom_Penh',
 'execution_business_date',app_private.rent_business_date(organization,statement_timestamp()),'invoice_date_policy','original-reviewed-october',
 'manifest_sha256',operation_binding->>'manifest_sha256','plan_sha256',operation_binding->>'plan_sha256',
 'archive_sha256',operation_binding->>'archive_sha256','action_sha256',operation_binding->>'action_sha256',
 'archive_artifact_sha256',repeat('5',64),'archive_count',1,'action_count',1,'zero_review_sha256',app_private.financial_reset_hash(zero_plan),
 'continuation_semantic',jsonb_build_object('version',3,'actor_id',maker,'billing_period_start','2026-10-01','issue_date','2026-10-01',
  'execution_business_date',app_private.rent_business_date(organization,statement_timestamp()),'invoice_date_policy','original-reviewed-october','leases','[]'::jsonb),
 'report_review_sha256',repeat('6',64));
UPDATE receipt_fixture SET binding=binding||jsonb_build_object('continuation_semantic_sha256',app_private.financial_reset_hash(binding->'continuation_semantic'));
SELECT set_config('receipt.binding',binding::text,false),set_config('receipt.claims',jsonb_build_object('sub',maker,'session_id',session_id,
 'role','authenticated','aud','authenticated','is_anonymous',false,'exp',floor(extract(epoch FROM clock_timestamp()+interval '1 hour')))::text,false)
 FROM receipt_fixture;
CREATE FUNCTION pg_temp.receipt_prepare() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; BEGIN
 SELECT * INTO STRICT f FROM receipt_fixture;
 PERFORM app_private.prepare_financial_reset_operation(f.operation_binding);
 PERFORM app_private.archive_financial_reset_rows(f.operation,f.archive_rows);
 PERFORM app_private.prepare_financial_reset_actions(f.operation,f.actions);
END $$;
CREATE FUNCTION pg_temp.receipt_seal() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; BEGIN
 SELECT * INTO STRICT f FROM receipt_fixture;
 PERFORM app_private.seal_financial_reset_operation(f.operation);
 PERFORM app_private.prepare_financial_reset_zero_plan(f.operation,f.zero_plan,f.binding->>'zero_review_sha256');
END $$;
CREATE FUNCTION pg_temp.receipt_insert(p_action text,p_authorization uuid,p_backend integer,p_xid xid8) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; v_result jsonb; BEGIN
 SELECT * INTO STRICT f FROM receipt_fixture;
 v_result:=app_private.financial_reset_hosted_stage_result(f.operation,p_action);
 INSERT INTO app_private.financial_reset_hosted_action_receipts(operation_id,organization_id,action,binding,binding_sha256,
  authorization_id,authority_sha256,actor_id,backend_pid,transaction_id,result_json,result_sha256)
 VALUES(f.operation,f.organization,p_action,f.binding,app_private.financial_reset_hash(f.binding),p_authorization,repeat('f',64),
  f.maker,p_backend,p_xid,v_result,app_private.financial_reset_hash(v_result));
END $$;
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE has_function_privilege(name,'app_private.record_financial_reset_hosted_action_receipt(jsonb,text,uuid,text)','EXECUTE') OR
  has_table_privilege(name,'app_private.financial_reset_hosted_stage_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR
  has_table_privilege(name,'app_private.financial_reset_hosted_action_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),
 'application roles cannot read, write or attest private stage evidence');
COMMIT;

-- Genuine-session synthetic ingress is simulated only inside this disposable
-- SQL fixture. Protected private execution below has no request claims at all.
BEGIN;
SELECT set_config('request.jwt.claims',current_setting('receipt.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('receipt.binding')::jsonb,'freeze') AS receipt_auth \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT app_private.consume_financial_reset_actor_authorization(:'receipt_auth'::uuid,binding,'freeze') FROM receipt_fixture;
SELECT app_private.reserve_financial_reset_hosted_operation(binding) FROM receipt_fixture;
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claims',current_setting('receipt.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('receipt.binding')::jsonb,'checkpoint') AS receipt_auth \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT app_private.consume_financial_reset_actor_authorization(:'receipt_auth'::uuid,binding,'checkpoint') FROM receipt_fixture;
SELECT app_private.checkpoint_financial_reset_hosted_operation(binding,repeat('e',64)) FROM receipt_fixture;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims',current_setting('receipt.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('receipt.binding')::jsonb,'prepare') AS receipt_prepare_auth \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT app_private.consume_financial_reset_actor_authorization(:'receipt_prepare_auth'::uuid,binding,'prepare') FROM receipt_fixture;
SELECT set_config('receipt.authorization',:'receipt_prepare_auth',true);
SAVEPOINT receipt_missing_stage;
SELECT app_private.prepare_financial_reset_operation(operation_binding) FROM receipt_fixture;
SELECT throws_ok($$SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'prepare',current_setting('receipt.authorization')::uuid,repeat('f',64)) FROM receipt_fixture$$,
 '23514','financial_reset_hosted_action_receipt_state_invalid','partial preparation cannot produce a receipt');
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_hosted_stage_receipt_commit IMMEDIATE$$,
 '23514','financial_reset_hosted_stage_receipt_required_before_commit','actual preparation events cannot commit without their receipt');
ROLLBACK TO SAVEPOINT receipt_missing_stage;
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_stage_events WHERE operation_id=(SELECT operation FROM receipt_fixture)),0::bigint,
 'rollback removes every uncommitted event with its stage changes');
SAVEPOINT receipt_early_constraints;
SET CONSTRAINTS app_private.financial_reset_hosted_stage_receipt_commit IMMEDIATE;
SELECT throws_ok($$SELECT pg_temp.receipt_prepare()$$,'23514','financial_reset_hosted_stage_receipt_required_before_commit',
 'early immediate constraints fail closed at the first unreceipted stage event');
ROLLBACK TO SAVEPOINT receipt_early_constraints;
SELECT lives_ok($$SELECT pg_temp.receipt_prepare()$$,'exact complete preparation captures real operation, archive and action changes');
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_stage_events WHERE operation_id=(SELECT operation FROM receipt_fixture)),3::bigint,
 'one event exists for each real prepare change');
SELECT throws_ok($$SELECT pg_temp.receipt_insert('prepare',current_setting('receipt.authorization')::uuid,pg_backend_pid()+1,pg_current_xact_id())$$,
 '23514','financial_reset_hosted_action_receipt_context_invalid','another backend cannot supply a preparation receipt');
SELECT throws_ok($$SELECT pg_temp.receipt_insert('prepare',current_setting('receipt.authorization')::uuid,pg_backend_pid(),(pg_current_xact_id()::text::bigint+1)::text::xid8)$$,
 '23514','financial_reset_hosted_action_receipt_context_invalid','another top-level xid cannot supply a preparation receipt');
SELECT throws_ok($$SELECT pg_temp.receipt_insert('prepare','fa231853-0000-4000-8000-000000000999',pg_backend_pid(),pg_current_xact_id())$$,
 '23514','financial_reset_hosted_action_receipt_context_invalid','another authorization cannot supply a preparation receipt');
SELECT throws_ok($$INSERT INTO app_private.financial_reset_hosted_stage_events SELECT * FROM app_private.financial_reset_hosted_stage_events LIMIT 1$$,
 '23514','financial_reset_hosted_stage_event_context_invalid','direct event insertion cannot substitute for an actual source trigger');
SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'prepare',:'receipt_prepare_auth'::uuid,repeat('f',64)) FROM receipt_fixture;
SELECT lives_ok($$SET CONSTRAINTS app_private.financial_reset_hosted_stage_receipt_commit IMMEDIATE$$,'complete preparation and its receipt satisfy the real deferred commit boundary');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_actions(operation,jsonb_build_array((actions->0)||jsonb_build_object('action_id','fa231853-0000-4000-8000-000000000102','ordinal',2))) FROM receipt_fixture$$,
 '23514','financial_reset_hosted_stage_event_context_invalid','a receipted stage cannot gain further actions after constraints were flushed');
SELECT throws_ok($$UPDATE app_private.financial_reset_hosted_action_receipts SET authority_sha256=repeat('0',64)$$,
 '23514','financial_reset_evidence_immutable','the receipt cannot be edited');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_hosted_action_receipts$$,
 '23514','financial_reset_evidence_immutable','the receipt cannot be erased');
SELECT throws_ok($$TRUNCATE app_private.financial_reset_hosted_action_receipts$$,
 '23514','financial_reset_evidence_immutable','the receipt cannot be truncated');
SELECT throws_ok($$TRUNCATE app_private.financial_reset_hosted_stage_events$$,
 '23514','financial_reset_evidence_immutable','stage events cannot be truncated');
SELECT is((SELECT auth.uid()),NULL::uuid,'private receipt path never fabricates request identity');
COMMIT;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=(SELECT operation FROM receipt_fixture) AND action='prepare'),1::bigint,
 'a new transaction sees the actual committed preparation receipt');
SELECT ok((SELECT r.binding=f.binding AND r.binding_sha256=app_private.financial_reset_hash(f.binding) AND r.authority_sha256=repeat('f',64)
 AND r.authorization_id=:'receipt_prepare_auth'::uuid AND r.actor_id=f.maker AND r.result_sha256=app_private.financial_reset_hash(r.result_json)
 AND r.created_at>=f.started_at AND r.transaction_id IS DISTINCT FROM pg_current_xact_id_if_assigned()
 FROM app_private.financial_reset_hosted_action_receipts r CROSS JOIN receipt_fixture f WHERE r.operation_id=f.operation AND r.action='prepare'),
 'committed receipt preserves exact binding, actor, authority, top xid and real audit time');
SELECT ok(NOT EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_stage_events e JOIN app_private.financial_reset_hosted_action_receipts r USING(operation_id,action)
 WHERE e.binding_sha256<>r.binding_sha256 OR e.authorization_id<>r.authorization_id OR e.actor_id<>r.actor_id OR
  e.backend_pid<>r.backend_pid OR e.transaction_id<>r.transaction_id),'every committed source event shares the receipt authorization/backend/top xid');
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims',current_setting('receipt.claims'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.authorize_financial_reset_hosted_action(current_setting('receipt.binding')::jsonb,'seal') AS receipt_seal_auth \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT app_private.consume_financial_reset_actor_authorization(:'receipt_seal_auth'::uuid,binding,'seal') FROM receipt_fixture;
SELECT set_config('receipt.authorization',:'receipt_seal_auth',true);
SELECT throws_ok($$SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'prepare',current_setting('receipt.authorization')::uuid,repeat('f',64)) FROM receipt_fixture$$,
 '42501','financial_reset_actor_context_required','a later seal transaction cannot attest the earlier preparation');
SAVEPOINT receipt_incomplete_seal;
SELECT app_private.seal_financial_reset_operation(operation) FROM receipt_fixture;
SELECT throws_ok($$SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'seal',current_setting('receipt.authorization')::uuid,repeat('f',64)) FROM receipt_fixture$$,
 '23514','financial_reset_hosted_action_receipt_predecessor_required','sealed status without its exact zero-plan insertion is insufficient');
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_hosted_stage_receipt_commit IMMEDIATE$$,
 '23514','financial_reset_hosted_stage_receipt_required_before_commit','the actual sealed transition cannot commit without its receipt');
ROLLBACK TO SAVEPOINT receipt_incomplete_seal;
SELECT is((SELECT status FROM app_private.financial_reset_operations WHERE operation_id=(SELECT operation FROM receipt_fixture)),'prepared',
 'failed seal rolls back to its committed prepared predecessor');
SELECT lives_ok($$SELECT pg_temp.receipt_seal()$$,'seal captures its status transition and exact zero-plan insertion');
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_stage_events WHERE operation_id=(SELECT operation FROM receipt_fixture) AND action='seal'),2::bigint,
 'seal has both actual same-transaction events');
SELECT throws_ok($$SELECT pg_temp.receipt_insert('seal',current_setting('receipt.authorization')::uuid,pg_backend_pid()+1,pg_current_xact_id())$$,
 '23514','financial_reset_hosted_action_receipt_context_invalid','seal receipt also rejects a different backend');
SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'seal',:'receipt_seal_auth'::uuid,repeat('f',64)) FROM receipt_fixture;
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'real seal receipt passes all deferred constraints before COMMIT');
COMMIT;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=(SELECT operation FROM receipt_fixture)),2::bigint,
 'a fresh read-only transaction sees both committed immutable stage receipts');
SELECT ok((SELECT p.transaction_id<>s.transaction_id AND p.authorization_id<>s.authorization_id AND p.actor_id=s.actor_id
 AND p.result_json->'operation'->>'status'='prepared' AND s.result_json->'operation'->>'status'='sealed'
 AND o.status='sealed' AND p.result_sha256=app_private.financial_reset_hash(p.result_json) AND s.result_sha256=app_private.financial_reset_hash(s.result_json)
 FROM receipt_fixture f JOIN app_private.financial_reset_operations o ON o.operation_id=f.operation
 JOIN app_private.financial_reset_hosted_action_receipts p ON p.operation_id=f.operation AND p.action='prepare'
 JOIN app_private.financial_reset_hosted_action_receipts s ON s.operation_id=f.operation AND s.action='seal'),
 'later status advancement cannot replace the immutable preparation COMMIT proof');
SELECT is((SELECT r.result_json->'zero'->'plan' FROM app_private.financial_reset_hosted_action_receipts r WHERE r.operation_id=(SELECT operation FROM receipt_fixture) AND action='seal'),
 (SELECT zero_plan FROM receipt_fixture),'seal receipt retains the exact reviewed maker/checker plan');
SELECT is((SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231853-0000-4000-8000-000000000039'),
 (SELECT foreign_before FROM receipt_fixture),'foreign organization financial sentinel remains byte-identical');
SELECT is((SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231853-0000-4000-8000-000000000030'),
 (SELECT source_row FROM receipt_fixture),'prepare and seal do not execute the financial row removal');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization FROM receipt_fixture)),'frozen',
 'COMMIT proof finishes at the frozen sealed boundary');
SELECT * FROM finish();
COMMIT;
