BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('fa231120-0000-4000-8000-000000000010','authenticated','authenticated','archived-zero-maker@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231120-0000-4000-8000-000000000011','authenticated','authenticated','archived-zero-reviewer@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES('fa231120-0000-4000-8000-000000000001','Archived zero fixture','archived-zero-fixture');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000010','super_admin'),
 ('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000011','super_admin');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('fa231120-0000-4000-8000-000000000020','fa231120-0000-4000-8000-000000000001','Archived zero branch','AZR','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id) VALUES
 ('fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000001','Archived property','AZR-A','Apartment','fa231120-0000-4000-8000-000000000020'),
 ('fa231120-0000-4000-8000-000000000006','fa231120-0000-4000-8000-000000000001','Active property','AZR-B','Apartment','fa231120-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('fa231120-0000-4000-8000-000000000003','fa231120-0000-4000-8000-000000000001','Archived zero owner');
INSERT INTO public.person_roles(organization_id,person_id,role,status) VALUES
 ('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on) VALUES
 ('fa231120-0000-4000-8000-000000000004','fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000003',100,'2026-01-01'),
 ('fa231120-0000-4000-8000-000000000007','fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000006','fa231120-0000-4000-8000-000000000003',100,'2026-01-01');
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000010',true);

-- A legitimate pending request made before archival remains unapprovable through
-- the ordinary path after archival. Roll back this setup before the reset test.
SAVEPOINT ordinary_archived_review;
CREATE TEMP TABLE ordinary_pending AS SELECT public.submit_owner_opening_balance(
 'fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000003',
 'USD','2026-10-01','ips_held_owner_cash',0,'Ordinary pending fixture','fixture evidence',NULL,repeat('e',64),NULL,'archived-ordinary-submit') AS result;
SELECT public.archive_property('fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000011',true);
SELECT throws_ok($$SELECT public.review_owner_opening_balance('fa231120-0000-4000-8000-000000000001',
 (SELECT (result->>'request_id')::uuid FROM ordinary_pending),'approve','Ordinary archived review','archived-ordinary-review')$$,
 '23503','owner_roster_property_not_found','ordinary review cannot approve an archived property request');
ROLLBACK TO SAVEPOINT ordinary_archived_review;
SELECT public.archive_property('fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000001');
CREATE TEMP TABLE archived_property_before AS SELECT to_jsonb(p) AS row_json FROM public.properties p WHERE id='fa231120-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT * FROM app_private.validate_owner_roster_on_date('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','2026-10-01')$$,
 '23503','owner_roster_property_not_found','ordinary roster reader remains closed for archived properties');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.submit_owner_opening_balance('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000003',
 'USD','2026-10-01','ips_held_owner_cash',0,'Ordinary archived fixture','fixture evidence',NULL,repeat('e',64),NULL,'archived-zero-ordinary-submit')$$,
 '23503','Property not found','ordinary zero submission does not gain archived authority');
SELECT throws_ok($$SELECT public.generate_owner_balance_period('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','fa231120-0000-4000-8000-000000000003','USD','2026-10-01','archived-zero-period')$$,
 '23503','owner_balance_property_not_found','ordinary archived report-period generation remains unsupported');
RESET ROLE;
SAVEPOINT bad_roster;
UPDATE public.property_owners SET ownership_percent=50 WHERE id='fa231120-0000-4000-8000-000000000004';
SELECT throws_ok($$SELECT app_private.financial_reset_zero_scope_on_date('fa231120-0000-4000-8000-000000000001','2026-10-01')$$,
 '23514','owner_share_total_not_100: expected 100.000, got 50.000','archived review reader retains exact owner-share validation');
ROLLBACK TO SAVEPOINT bad_roster;

INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa231120-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id','fa231120-0000-4000-8000-000000000100',
 'organization_id','fa231120-0000-4000-8000-000000000001','operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),'archive_sha256',app_private.financial_reset_hash('[]'),
 'action_sha256',app_private.financial_reset_hash('[]'),'archive_count',0,'action_count',0,'audit_timestamp',now(),'audit_actor',NULL));
CREATE TEMP TABLE archived_zero_plan AS SELECT jsonb_build_object('operation_id','fa231120-0000-4000-8000-000000000100',
 'organization_id','fa231120-0000-4000-8000-000000000001','manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id','fa231120-0000-4000-8000-000000000010','reviewer_actor_id','fa231120-0000-4000-8000-000000000011',
 'effective_date','2026-10-01','currencies','["USD"]'::jsonb,'scopes',app_private.financial_reset_known_zero_scope('fa231120-0000-4000-8000-000000000100')) AS plan;
CREATE TEMP TABLE archived_zero_scope AS SELECT value AS scope FROM archived_zero_plan,jsonb_array_elements(plan->'scopes') WHERE value->>'property_id'='fa231120-0000-4000-8000-000000000002';
SELECT is(jsonb_array_length((SELECT plan->'scopes' FROM archived_zero_plan)),2,'review includes both active and archived owners without omission');
SELECT is((SELECT scope->>'property_row_sha256' FROM archived_zero_scope),(SELECT app_private.financial_reset_hash(row_json) FROM archived_property_before),'review pins full original archived property image');
SELECT is((SELECT scope->'property_archived_at' FROM archived_zero_scope),(SELECT row_json->'archived_at' FROM archived_property_before),'review pins original archive timestamp');
SELECT ok(NOT has_table_privilege('authenticated','app_private.financial_reset_archived_zero_command_context','INSERT')
 AND NOT has_table_privilege('service_role','app_private.financial_reset_archived_zero_command_context','UPDATE')
 AND NOT has_function_privilege('authenticated','app_private.begin_financial_reset_archived_zero_context(uuid,jsonb,public.owner_balance_component)','EXECUTE')
 AND NOT has_function_privilege('service_role','app_private.financial_reset_zero_scope_on_date(uuid,date)','EXECUTE'),'context and private review readers grant no application authority');
CREATE FUNCTION pg_temp.prepare_archived_zero(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_zero_plan('fa231120-0000-4000-8000-000000000100',p_plan,app_private.financial_reset_hash(p_plan))
$$;
SELECT throws_ok($$SELECT pg_temp.prepare_archived_zero(jsonb_set((SELECT plan FROM archived_zero_plan),'{scopes,0,property_row_sha256}',to_jsonb(repeat('f',64))))$$,
 '23514','financial_reset_zero_review_scope_invalid','a substituted original property hash cannot be approved');
SELECT pg_temp.prepare_archived_zero((SELECT plan FROM archived_zero_plan));
SELECT set_config('test.archived_zero_review',(SELECT app_private.financial_reset_hash(plan) FROM archived_zero_plan),true);
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231120-0000-4000-8000-000000000100',current_setting('test.archived_zero_review'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000011',true);
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231120-0000-4000-8000-000000000100',current_setting('test.archived_zero_review'));
RESET ROLE;
SELECT app_private.seal_financial_reset_operation('fa231120-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231120-0000-4000-8000-000000000100');
SELECT app_private.complete_financial_reset_actions('fa231120-0000-4000-8000-000000000100');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);

SAVEPOINT property_drift;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231120-0000-4000-8000-000000000001';
UPDATE public.properties SET notes='changed after approved snapshot' WHERE id='fa231120-0000-4000-8000-000000000002';
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id='fa231120-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231120-0000-4000-8000-000000000100')$$,
 '40001','financial_reset_zero_roster_changed','full property drift invalidates the immutable approved scope before zero writes');
ROLLBACK TO SAVEPOINT property_drift;

-- Genuine prepared/approved/started operation, inspected in an inner rollback
-- scope: no fake completed journals or manually manufactured authority rows.
SAVEPOINT context_boundaries;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa231120-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000010',true);
SELECT app_private.begin_financial_reset_archived_zero_context('fa231120-0000-4000-8000-000000000100',(SELECT scope FROM archived_zero_scope),'ips_held_owner_cash');
SELECT throws_ok($$SELECT app_private.begin_financial_reset_archived_zero_context('fa231120-0000-4000-8000-000000000100',(SELECT scope FROM archived_zero_scope),'ips_held_owner_cash')$$,
 '23514','financial_reset_archived_zero_context_already_open','preexisting context cannot be replaced or reused');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET backend_pid=backend_pid+1000$$,
 '23514','financial_reset_archived_zero_context_transaction_invalid','context cannot move to another backend');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET transaction_id='1'::xid8$$,
 '23514','financial_reset_archived_zero_context_transaction_invalid','context cannot use a stale transaction');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET generation=2$$,
 '23514','financial_reset_archived_zero_context_binding_invalid','context cannot move to another generation');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET organization_id=extensions.gen_random_uuid()$$,
 '23514','financial_reset_archived_zero_context_binding_invalid','context cannot move to another organization');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET operation_id=extensions.gen_random_uuid()$$,
 'P0002',NULL,'context cannot use an unknown operation');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET review_sha256=repeat('f',64)$$,
 '23514','financial_reset_archived_zero_context_binding_invalid','context cannot substitute an unapproved review hash');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET component='owner_due_to_ips'$$,
 '23514','financial_reset_archived_zero_context_transition_invalid','context cannot change component');
SELECT throws_ok($$UPDATE app_private.financial_reset_archived_zero_command_context SET scope=scope||'{"property_id":"fa231120-0000-4000-8000-000000000006"}'::jsonb$$,
 '23514','financial_reset_archived_zero_context_binding_invalid','context cannot change property scope');
CREATE FUNCTION pg_temp.archived_zero_args() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('organization_id',plan->'organization_id','property_id',scope->'property_id','owner_person_id',scope->'owner_person_id',
  'currency','USD','effective_date',plan->'effective_date','component','ips_held_owner_cash','amount',0,'reason','Reviewed reset known-zero opening',
  'source_reference','financial-reset:fa231120-0000-4000-8000-000000000100:'||app_private.financial_reset_hash(plan),
  'supporting_document_id',NULL,'evidence_sha256',app_private.financial_reset_hash(plan),'resubmission_of_request_id',NULL,
  'idempotency_key','reset-zero:fa231120-0000-4000-8000-000000000100:'||substr(app_private.financial_reset_hash(jsonb_build_object('scope',scope,'component','ips_held_owner_cash')),1,40)||':submit')
 FROM archived_zero_plan,archived_zero_scope
$$;
CREATE FUNCTION pg_temp.submit_archived_zero_args(p jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.submit_owner_opening_balance((p->>'organization_id')::uuid,(p->>'property_id')::uuid,(p->>'owner_person_id')::uuid,
  (p->>'currency')::public.currency_code,(p->>'effective_date')::date,(p->>'component')::public.owner_balance_component,(p->>'amount')::numeric,
  p->>'reason',p->>'source_reference',(p->>'supporting_document_id')::uuid,p->>'evidence_sha256',(p->>'resubmission_of_request_id')::uuid,p->>'idempotency_key')
$$;
SELECT throws_ok($$SELECT pg_temp.submit_archived_zero_args(pg_temp.archived_zero_args()||'{"amount":1}'::jsonb)$$,
 '23514','financial_reset_archived_zero_command_mismatch','valid private context cannot authorize nonzero public submission');
SELECT throws_ok($$SELECT pg_temp.submit_archived_zero_args(pg_temp.archived_zero_args()||'{"effective_date":"2026-11-01"}'::jsonb)$$,
 '23514','financial_reset_archived_zero_command_mismatch','valid private context cannot change the opening date');
SELECT throws_ok($$SELECT pg_temp.submit_archived_zero_args(pg_temp.archived_zero_args()||'{"component":"owner_due_to_ips"}'::jsonb)$$,
 '23514','financial_reset_archived_zero_command_mismatch','valid private context cannot submit another component');
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000011',true);
SELECT throws_ok($$SELECT pg_temp.submit_archived_zero_args(pg_temp.archived_zero_args())$$,
 '42501','financial_reset_archived_zero_actor_invalid','valid private context cannot impersonate the other approved actor');
SELECT set_config('request.jwt.claim.sub','fa231120-0000-4000-8000-000000000010',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231120-0000-4000-8000-000000000100')$$,
 '23514','financial_reset_archived_zero_context_already_open','apply refuses a preexisting context');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_archived_zero_command_context$$,
 '23514','financial_reset_archived_zero_context_incomplete','unfinished context cannot be declared complete');
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,
 '23514','financial_reset_archived_zero_context_must_close','unfinished context cannot survive commit');
ROLLBACK TO SAVEPOINT context_boundaries;
SELECT is((SELECT count(*) FROM app_private.financial_reset_archived_zero_command_context),0::bigint,'savepoint rollback removes the scoped context');

CREATE FUNCTION pg_temp.fail_archived_zero_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected_archived_zero_failure' USING ERRCODE='PZ112'; END;
$$;
CREATE TRIGGER test_archived_zero_failure AFTER INSERT ON public.owner_opening_balance_entries FOR EACH ROW
 WHEN(NEW.organization_id='fa231120-0000-4000-8000-000000000001'::uuid AND NEW.property_id='fa231120-0000-4000-8000-000000000002'::uuid AND NEW.component='security_deposit_custody')
 EXECUTE FUNCTION pg_temp.fail_archived_zero_entry();
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231120-0000-4000-8000-000000000100')$$,
 'PZ112','injected_archived_zero_failure','mid-phase archived approval failure aborts the complete zero phase');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archived_zero_command_context),0::bigint,'exception cleanup leaves no archived command context');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='fa231120-0000-4000-8000-000000000001'),0::bigint,'exception rolls back earlier zero components');
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id='fa231120-0000-4000-8000-000000000001'),0::bigint,'exception rolls back new command intents');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231120-0000-4000-8000-000000000001'),'frozen','exception restores frozen control');
DROP TRIGGER test_archived_zero_failure ON public.owner_opening_balance_entries;

CREATE TEMP TABLE archived_zero_correction_probe(code text,message text);
CREATE FUNCTION pg_temp.probe_archived_zero_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  PERFORM public.submit_owner_opening_balance_correction(NEW.organization_id,NEW.id,1,'Forbidden archived correction','fixture evidence',NULL,repeat('e',64),NULL,'archived-zero-correction');
  INSERT INTO archived_zero_correction_probe VALUES('unexpected-success','');
 EXCEPTION WHEN OTHERS THEN INSERT INTO archived_zero_correction_probe VALUES(SQLSTATE,SQLERRM);
 END;
 RETURN NULL;
END;
$$;
CREATE TRIGGER test_archived_zero_correction AFTER INSERT ON public.owner_opening_balance_entries FOR EACH ROW
 WHEN(NEW.organization_id='fa231120-0000-4000-8000-000000000001'::uuid AND NEW.property_id='fa231120-0000-4000-8000-000000000002'::uuid AND NEW.component='ips_held_owner_cash')
 EXECUTE FUNCTION pg_temp.probe_archived_zero_correction();
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa231120-0000-4000-8000-000000000100')$$,'endorsed reset creates active and archived zero openings using normal submit/review checks');
SELECT is((SELECT code FROM archived_zero_correction_probe),'23503','even during a valid exact context ordinary correction cannot gain archived authority');
SELECT is((SELECT message FROM archived_zero_correction_probe),'owner_roster_property_not_found','correction retains the ordinary archived roster rejection');
DROP TRIGGER test_archived_zero_correction ON public.owner_opening_balance_entries;
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='fa231120-0000-4000-8000-000000000001' AND signed_amount=0),8::bigint,'both scopes receive all four explicit zero components');
SELECT is((SELECT count(DISTINCT component) FROM public.owner_opening_balance_entries WHERE property_id='fa231120-0000-4000-8000-000000000002'),4::bigint,'archived scope has no missing-as-zero components');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa231120-0000-4000-8000-000000000001' AND status='approved'
 AND submitted_by='fa231120-0000-4000-8000-000000000010' AND reviewed_by='fa231120-0000-4000-8000-000000000011'),8::bigint,'independent approved actors are retained on every request');
SELECT is((SELECT to_jsonb(p) FROM public.properties p WHERE id='fa231120-0000-4000-8000-000000000002'),(SELECT row_json FROM archived_property_before),'archived property full row remains byte-equivalent including archive/audit fields');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archived_zero_command_context),0::bigint,'successful phase leaves no usable context');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa231120-0000-4000-8000-000000000001'),'frozen','success returns with frozen control');
SELECT ok(NOT app_private.financial_reset_archived_zero_scope_allowed('fa231120-0000-4000-8000-000000000001','fa231120-0000-4000-8000-000000000002','2026-10-01'),'no archived exception remains after helper return');
SELECT is(jsonb_array_length(app_private.financial_reset_recovery_candidates('fa231120-0000-4000-8000-000000000100')),16,'existing recovery derivation includes all active and archived zero request/entry rows');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'normal deferred approval conservation and closed-context fences pass');
SELECT * FROM finish();
ROLLBACK;
