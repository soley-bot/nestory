-- Synthetic local-only integration. SET SESSION AUTHORIZATION emulates the
-- verified gateway boundary for fixtures; it is not hosted authentication proof.
-- Use real checked preparation/actions and opening commands throughout. No
-- disabled triggers, rewritten production helpers or manufactured completions.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous) VALUES
 ('fa232313-0000-4000-8000-000000000010','authenticated','authenticated','scoped-operator@test.invalid','{"provider":"email","providers":["email"]}','{}',false),
 ('fa232313-0000-4000-8000-000000000011','authenticated','authenticated','scoped-maker@test.invalid','{"provider":"email","providers":["email"]}','{}',false),
 ('fa232313-0000-4000-8000-000000000012','authenticated','authenticated','scoped-reviewer@test.invalid','{"provider":"email","providers":["email"]}','{}',false);
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal) VALUES
 ('fa232313-0000-4000-8000-000000000110','fa232313-0000-4000-8000-000000000010',now(),now(),'aal1'),
 ('fa232313-0000-4000-8000-000000000111','fa232313-0000-4000-8000-000000000011',now(),now(),'aal1'),
 ('fa232313-0000-4000-8000-000000000112','fa232313-0000-4000-8000-000000000012',now(),now(),'aal1'),
 ('fa232313-0000-4000-8000-000000000113','fa232313-0000-4000-8000-000000000011',now(),now(),'aal1');
INSERT INTO public.organizations(id,name,slug,operational_timezone) VALUES
 ('fa232313-0000-4000-8000-000000000001','Scoped zero fixture','scoped-zero-fixture','Asia/Phnom_Penh'),
 ('fa232313-0000-4000-8000-000000000009','Scoped zero foreign fixture','scoped-zero-foreign','Asia/Phnom_Penh');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('fa232313-0000-4000-8000-000000000020','fa232313-0000-4000-8000-000000000001','Reviewed branch','SZR','active'),
 ('fa232313-0000-4000-8000-000000000021','fa232313-0000-4000-8000-000000000001','Other branch','SZO','active');
INSERT INTO public.organization_roles(id,organization_id,name,status) VALUES
 ('fa232313-0000-4000-8000-000000000030','fa232313-0000-4000-8000-000000000001','Scoped maker','active'),
 ('fa232313-0000-4000-8000-000000000031','fa232313-0000-4000-8000-000000000001','Scoped reviewer','active');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000030','finance.view'),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000030','finance.submit_expenses'),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000031','finance.view'),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000031','finance.approve_expenses'),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000031','properties.view');
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000010','super_admin',NULL,NULL),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000011','custom','fa232313-0000-4000-8000-000000000020','fa232313-0000-4000-8000-000000000030'),
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000012','custom','fa232313-0000-4000-8000-000000000020','fa232313-0000-4000-8000-000000000031');
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='fa232313-0000-4000-8000-000000000001';
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
 VALUES('fa232313-0000-4000-8000-000000000001',true,now(),'fa232313-0000-4000-8000-000000000010');
INSERT INTO app_private.privileged_email_step_up_challenges(id,organization_id,user_id,session_id,code_digest,email_digest,expires_at,resend_available_at)
 SELECT ('fa232313-0000-4000-8000-0000000002'||n)::uuid,'fa232313-0000-4000-8000-000000000001',
  ('fa232313-0000-4000-8000-0000000000'||n)::uuid,('fa232313-0000-4000-8000-0000000001'||n)::uuid,
  repeat('1',64),repeat('2',64),now()+interval '10 minutes',now()+interval '1 minute' FROM generate_series(10,12) n;
INSERT INTO app_private.privileged_email_step_up_grants(organization_id,user_id,session_id,challenge_id,expires_at)
 SELECT 'fa232313-0000-4000-8000-000000000001',('fa232313-0000-4000-8000-0000000000'||n)::uuid,
  ('fa232313-0000-4000-8000-0000000001'||n)::uuid,('fa232313-0000-4000-8000-0000000002'||n)::uuid,NULL FROM generate_series(10,12) n;
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id) VALUES
 ('fa232313-0000-4000-8000-000000000002','fa232313-0000-4000-8000-000000000001','Active scoped property','SZA','Apartment','fa232313-0000-4000-8000-000000000020'),
 ('fa232313-0000-4000-8000-000000000006','fa232313-0000-4000-8000-000000000001','Archived scoped property','SZX','Apartment','fa232313-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('fa232313-0000-4000-8000-000000000003','fa232313-0000-4000-8000-000000000001','Scoped owner');
INSERT INTO public.person_roles(organization_id,person_id,role,status) VALUES
 ('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on) VALUES
 ('fa232313-0000-4000-8000-000000000004','fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000002','fa232313-0000-4000-8000-000000000003',100,'2026-01-01'),
 ('fa232313-0000-4000-8000-000000000007','fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000006','fa232313-0000-4000-8000-000000000003',100,'2026-01-01');
CREATE TEMP TABLE scoped_zero_claims AS SELECT user_id,session_id,
 jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aud','authenticated','is_anonymous',false,
  'exp',extract(epoch FROM clock_timestamp()+interval '20 minutes')::bigint) AS claims
 FROM app_private.privileged_email_step_up_grants WHERE organization_id='fa232313-0000-4000-8000-000000000001';
GRANT SELECT ON scoped_zero_claims TO authenticated;
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000010'),true);
SELECT public.archive_property('fa232313-0000-4000-8000-000000000006','fa232313-0000-4000-8000-000000000001');
CREATE TEMP TABLE scoped_zero_property_before AS SELECT to_jsonb(p) row_json FROM public.properties p WHERE id='fa232313-0000-4000-8000-000000000006';
SELECT set_config('request.jwt.claims','{}',true);

-- A real one-row financial archive/removal supplies the positive action counts
-- required by hosted authorization. The target fixture and foreign sentinel are
-- synthetic; every mutation is rolled back at the end of this file.
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason) VALUES
 ('fa232313-0000-4000-8000-000000000040','fa232313-0000-4000-8000-000000000001','2026-09-01','fa232313-0000-4000-8000-000000000010','Scoped synthetic archive source'),
 ('fa232313-0000-4000-8000-000000000049','fa232313-0000-4000-8000-000000000009','2026-09-01','fa232313-0000-4000-8000-000000000010','Foreign sentinel');
CREATE TEMP TABLE scoped_zero_source AS SELECT to_jsonb(t) original FROM public.financial_month_locks t WHERE id='fa232313-0000-4000-8000-000000000040';
CREATE TEMP TABLE scoped_zero_fixture(operation_binding jsonb,actions jsonb,plan jsonb,binding jsonb,authorization_id uuid);
INSERT INTO scoped_zero_fixture(actions)
 SELECT jsonb_build_array(jsonb_build_object('action_id','fa232313-0000-4000-8000-000000000101','ordinal',1,'relation_name','public.financial_month_locks',
  'primary_key',jsonb_build_object('id',original->'id'),'kind','archive-delete','before_row_text',original::text,
  'after_row_text',NULL,'before_sha256',app_private.financial_reset_hash(original),'after_sha256',NULL)) FROM scoped_zero_source;
UPDATE scoped_zero_fixture SET operation_binding=jsonb_build_object('operation_id','fa232313-0000-4000-8000-000000000100',
 'organization_id','fa232313-0000-4000-8000-000000000001','operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),'archive_count',1,'action_count',1,
 'audit_timestamp',clock_timestamp(),'audit_actor',NULL,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
  'primary_key',jsonb_build_object('id',original->'id'),'row_sha256',app_private.financial_reset_hash(original)))) FROM scoped_zero_source),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('action_id',a->'action_id','ordinal',a->'ordinal',
  'relation_name',a->'relation_name','primary_key',a->'primary_key','kind',a->'kind','before_sha256',a->'before_sha256','after_sha256',a->'after_sha256')
  ORDER BY (a->>'ordinal')::integer)) FROM jsonb_array_elements(actions) a));
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 VALUES('fa232313-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT app_private.prepare_financial_reset_operation(operation_binding) FROM scoped_zero_fixture;
SELECT app_private.archive_financial_reset_rows('fa232313-0000-4000-8000-000000000100',
 jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',original->'id'),
  'row_text',original::text,'row_sha256',app_private.financial_reset_hash(original)))) FROM scoped_zero_source;
SELECT app_private.prepare_financial_reset_actions('fa232313-0000-4000-8000-000000000100',actions) FROM scoped_zero_fixture;
UPDATE scoped_zero_fixture SET plan=jsonb_build_object('operation_id','fa232313-0000-4000-8000-000000000100',
 'organization_id','fa232313-0000-4000-8000-000000000001','manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id','fa232313-0000-4000-8000-000000000011','reviewer_actor_id','fa232313-0000-4000-8000-000000000012',
 'effective_date','2026-10-01','currencies','["USD"]'::jsonb,'scopes',app_private.financial_reset_known_zero_scope('fa232313-0000-4000-8000-000000000100'));
SELECT app_private.prepare_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',plan,app_private.financial_reset_hash(plan)) FROM scoped_zero_fixture;
SELECT set_config('test.scoped_zero_review',(SELECT app_private.financial_reset_hash(plan) FROM scoped_zero_fixture),true);
GRANT SELECT,UPDATE ON scoped_zero_fixture TO authenticated;

SELECT ok(NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE c.oid IN ('app_private.financial_reset_zero_session_endorsements'::regclass,'app_private.financial_reset_zero_command_context'::regclass)
 AND (NOT c.relrowsecurity OR has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE'))),'private session/context tables have RLS and no application privileges');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE n.nspname='app_private' AND (p.proname LIKE '%financial_reset_zero_%' OR p.proname LIKE 'financial_reset_scoped_%'
 OR p.proname='assert_financial_reset_scoped_operator') AND has_function_privilege(r.name,p.oid,'EXECUTE')),
 'scoped adapters and context builders are unavailable to application roles');
SELECT ok(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='app_private'
 AND table_name='financial_reset_zero_session_endorsements' AND column_name IN ('token','access_token','refresh_token','claims','jwt','password')),
 'endorsement evidence stores no credentials or claims');
SELECT is(app_private.has_org_permission('fa232313-0000-4000-8000-000000000001','finance.submit_expenses'),false,'null auth identity retains ordinary permission denial');
SELECT ok(strpos(pg_get_functiondef('app_private.apply_financial_reset_known_zero(uuid)'::regprocedure),'request.jwt')=0
 AND strpos(pg_get_functiondef('app_private.apply_financial_reset_known_zero(uuid)'::regprocedure),'auth.uid()')=0,
 'effective known-zero phase neither rewrites claims nor derives command identity from auth.uid');
SELECT throws_ok($$SELECT app_private.financial_reset_zero_command_actor('submit')$$,'42501','financial_reset_zero_command_context_required','UUIDs alone create no private command identity');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_scoped_operator('fa232313-0000-4000-8000-000000000100')$$,
 '42501','financial_reset_scoped_operator_required','prepared operation is not operator authorization');
SELECT is(app_private.financial_reset_zero_endorsement_status('fa232313-0000-4000-8000-000000000100','maker')->>'status','missing',
 'read-only observation distinguishes missing endorsement evidence');

SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_genuine_session_required','raw SET ROLE with supplied claims is not a gateway endorsement');
RESET ROLE;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',repeat('f',64))$$,
 '23514','financial_reset_zero_approval_plan_invalid','real ingress still binds exact reviewed bytes');
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('session_id','fa232313-0000-4000-8000-000000000112'))::text
 FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_session_endorsement_stale','another actor session cannot endorse the maker identity');
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('exp',extract(epoch FROM clock_timestamp()-interval '1 minute')::bigint))::text
 FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_session_endorsement_stale','expired request cannot record approval');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('exp',floor(extract(epoch FROM clock_timestamp()+interval '4 seconds'))::bigint))::text
 FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'maker custom role endorses through simulated genuine ingress using its own session');
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'identical maker endorsement is retry-safe');
SELECT pg_sleep(4.1);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_session_endorsement_stale','expired original credential cannot renew itself');
RESET ROLE;
RESET SESSION AUTHORIZATION;
CREATE TEMP TABLE scoped_zero_original_endorsement AS SELECT to_jsonb(e) row_json FROM app_private.financial_reset_zero_session_endorsements e
 WHERE operation_id='fa232313-0000-4000-8000-000000000100' AND approval_kind='maker';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','maker')$$,
 '42501','financial_reset_zero_session_endorsement_stale','expired captured credential cannot authorize commands');
SELECT is(app_private.financial_reset_zero_endorsement_status('fa232313-0000-4000-8000-000000000100','maker')->>'status','expired',
 'observation uses database time to report the expired captured credential');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'same actor with refreshed genuine credential can append endorsement on the same frozen operation');
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'repeating the refreshed credential does not append another endorsement');
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('session_id','fa232313-0000-4000-8000-000000000113'))::text
 FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_session_endorsement_stale','new maker session without its own required step-up cannot renew');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000010'),true);
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '42501','financial_reset_zero_approval_forbidden','operator super_admin authority cannot stand in for the named reviewer');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000012'),true);
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'distinct custom reviewer endorses using its own session and permission');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id='fa232313-0000-4000-8000-000000000100'),3::bigint,
 'one expired maker endorsement, one renewal and one independent reviewer endorsement are retained');
SELECT is((SELECT to_jsonb(e) FROM app_private.financial_reset_zero_session_endorsements e
 WHERE operation_id='fa232313-0000-4000-8000-000000000100' AND approval_kind='maker' AND endorsement_number=1),
 (SELECT row_json FROM scoped_zero_original_endorsement),'renewal preserves all original endorsement bytes including actual audit timestamp');
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_approvals WHERE operation_id='fa232313-0000-4000-8000-000000000100'),2::bigint,
 'session renewal does not rewrite or duplicate the original independent approvals');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_session_endorsements SET credential_expires_at=clock_timestamp()+interval '1 day'$$,
 '23514','financial_reset_evidence_immutable','private operator cannot rewrite original endorsement expiry');
SAVEPOINT read_only_observation;
SET LOCAL transaction_read_only=on;
SELECT is(app_private.financial_reset_zero_endorsement_status('fa232313-0000-4000-8000-000000000100','maker')->>'status','current',
 'current endorsement observation succeeds inside READ ONLY mode without command locks');
SELECT ok((app_private.financial_reset_zero_endorsement_status('fa232313-0000-4000-8000-000000000100','reviewer')->>'observedAt')::timestamptz
 BETWEEN transaction_timestamp() AND clock_timestamp(),'observation reports a database timestamp');
ROLLBACK TO SAVEPOINT read_only_observation;

SAVEPOINT new_session_renewal;
INSERT INTO app_private.privileged_email_step_up_challenges(id,organization_id,user_id,session_id,code_digest,email_digest,expires_at,resend_available_at)
 VALUES('fa232313-0000-4000-8000-000000000213','fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000011',
  'fa232313-0000-4000-8000-000000000113',repeat('1',64),repeat('2',64),now()+interval '10 minutes',now()+interval '1 minute');
INSERT INTO app_private.privileged_email_step_up_grants(organization_id,user_id,session_id,challenge_id,expires_at)
 VALUES('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000011','fa232313-0000-4000-8000-000000000113',
  'fa232313-0000-4000-8000-000000000213',NULL);
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('session_id','fa232313-0000-4000-8000-000000000113'))::text
 FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 'same approved actor can append a new live session with its own fresh step-up');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT session_id FROM app_private.financial_reset_zero_session_endorsements
 WHERE operation_id='fa232313-0000-4000-8000-000000000100' AND approval_kind='maker' ORDER BY endorsement_number DESC LIMIT 1),
 'fa232313-0000-4000-8000-000000000113'::uuid,'newest append is the sole current maker session');
DELETE FROM auth.sessions WHERE id='fa232313-0000-4000-8000-000000000113';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','maker')$$,
 '42501','financial_reset_zero_session_endorsement_stale','revoked newest session cannot fall back to a still-live historical endorsement');
SAVEPOINT revoked_read_only_observation;
SET LOCAL transaction_read_only=on;
SELECT is(app_private.financial_reset_zero_endorsement_status('fa232313-0000-4000-8000-000000000100','maker')->>'status','not-current',
 'read-only observation reports revoked newest session without falling back');
ROLLBACK TO SAVEPOINT revoked_read_only_observation;
ROLLBACK TO SAVEPOINT new_session_renewal;

SAVEPOINT revoked_endorsement;
DELETE FROM auth.sessions WHERE id='fa232313-0000-4000-8000-000000000112';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','reviewer')$$,
 '42501','financial_reset_zero_session_endorsement_stale','signout invalidates recorded reviewer endorsement');
ROLLBACK TO SAVEPOINT revoked_endorsement;
SAVEPOINT expired_endorsement;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='fa232313-0000-4000-8000-000000000111';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','maker')$$,
 '42501','financial_reset_zero_session_endorsement_stale','session time limit is rechecked at command time');
ROLLBACK TO SAVEPOINT expired_endorsement;
SAVEPOINT revoked_step_up;
UPDATE app_private.privileged_email_step_up_grants SET revoked_at=clock_timestamp() WHERE user_id='fa232313-0000-4000-8000-000000000012';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','reviewer')$$,
 '42501','financial_reset_zero_session_endorsement_stale','step-up revocation invalidates original reviewer authority');
ROLLBACK TO SAVEPOINT revoked_step_up;
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa232313-0000-4000-8000-000000000001'$$,
 '42501','financial_reset_checked_reopening_required','prepared operation cannot open before its checked actions complete');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa232313-0000-4000-8000-000000000001'),'frozen',
 'rejected prepared opening preserves the freeze');

UPDATE scoped_zero_fixture SET binding=(operation_binding-ARRAY['operation_kind','restore_of','audit_timestamp','audit_actor'])||
 jsonb_build_object('version',1,'project_ref','syntheticprojectrefa','packet_sha256',repeat('1',64),'main_sha',repeat('a',40),
  'sources_sha256',repeat('2',64),'ledger_sha256',repeat('3',64),'source_snapshot_sha256',repeat('4',64),'cutoff','2026-10-01',
  'issue_date','2026-10-01','timezone','Asia/Phnom_Penh','execution_business_date','2026-10-24','invoice_date_policy','original-reviewed-october',
  'archive_artifact_sha256',repeat('5',64),'zero_review_sha256',app_private.financial_reset_hash(plan),'report_review_sha256',repeat('6',64),
  'continuation_semantic',jsonb_build_object('actor_id','fa232313-0000-4000-8000-000000000010','billing_period_start','2026-10-01',
   'issue_date','2026-10-01','version',3,'leases','[]'::jsonb));
UPDATE scoped_zero_fixture SET binding=binding||jsonb_build_object('continuation_semantic_sha256',app_private.financial_reset_hash(binding->'continuation_semantic'));
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000010'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE scoped_zero_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM scoped_zero_fixture;
SELECT is(app_private.assert_financial_reset_scoped_operator('fa232313-0000-4000-8000-000000000100'),'fa232313-0000-4000-8000-000000000010'::uuid,
 'private operator comes from the consumed exact execute authorization');
SELECT is(auth.uid(),NULL::uuid,'operator consumption leaves auth identity empty');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_scoped_operator('fa232313-0000-4000-8000-000000000199')$$,
 '42501','financial_reset_scoped_operator_required','authorization for one operation cannot select another');
SELECT app_private.seal_financial_reset_operation('fa232313-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa232313-0000-4000-8000-000000000100');
SELECT app_private.arm_financial_reset_action('fa232313-0000-4000-8000-000000000100','fa232313-0000-4000-8000-000000000101');
DELETE FROM public.financial_month_locks WHERE id='fa232313-0000-4000-8000-000000000040';
SELECT app_private.complete_financial_reset_actions('fa232313-0000-4000-8000-000000000100');

-- The existing checked phase permits only a temporary open after real actions
-- complete in this backend/transaction. Each probe rolls back its opening and
-- authority change; no final reopening receipt or completion is fabricated.
SAVEPOINT changed_permissions;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa232313-0000-4000-8000-000000000001';
DELETE FROM public.organization_role_permissions WHERE role_id='fa232313-0000-4000-8000-000000000031'
 AND permission_key='finance.approve_expenses';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','reviewer')$$,
 '42501','financial_reset_zero_endorsement_permission_changed','removed custom-role approval permission is not borrowed from operator');
ROLLBACK TO SAVEPOINT changed_permissions;
SAVEPOINT changed_branch;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa232313-0000-4000-8000-000000000001';
UPDATE public.organization_members SET branch_id='fa232313-0000-4000-8000-000000000021' WHERE user_id='fa232313-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement('fa232313-0000-4000-8000-000000000100','maker')$$,
 '42501','financial_reset_zero_endorsement_permission_changed','maker reassigned to another branch loses reviewed property authority');
ROLLBACK TO SAVEPOINT changed_branch;

CREATE FUNCTION pg_temp.scoped_zero_args() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('organization_id',plan->'organization_id','property_id',scope->'property_id','owner_person_id',scope->'owner_person_id',
  'currency','USD','effective_date',plan->'effective_date','component','ips_held_owner_cash','amount',0,'reason','Reviewed reset known-zero opening',
  'source_reference','financial-reset:fa232313-0000-4000-8000-000000000100:'||app_private.financial_reset_hash(plan),'supporting_document_id',NULL,
  'evidence_sha256',app_private.financial_reset_hash(plan),'resubmission_of_request_id',NULL,
  'idempotency_key','reset-zero:fa232313-0000-4000-8000-000000000100:'||substr(app_private.financial_reset_hash(jsonb_build_object('scope',scope,'component','ips_held_owner_cash')),1,40)||':submit')
 FROM scoped_zero_fixture,jsonb_array_elements(plan->'scopes') scope WHERE scope->>'property_id'='fa232313-0000-4000-8000-000000000002'
$$;
CREATE FUNCTION pg_temp.submit_scoped_zero_args(p jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT app_private.financial_reset_scoped_submit_opening((p->>'organization_id')::uuid,(p->>'property_id')::uuid,(p->>'owner_person_id')::uuid,
  (p->>'currency')::public.currency_code,(p->>'effective_date')::date,(p->>'component')::public.owner_balance_component,(p->>'amount')::numeric,
  p->>'reason',p->>'source_reference',(p->>'supporting_document_id')::uuid,p->>'evidence_sha256',(p->>'resubmission_of_request_id')::uuid,p->>'idempotency_key')
$$;
SELECT throws_ok($$SELECT pg_temp.submit_scoped_zero_args(pg_temp.scoped_zero_args())$$,
 '42501','financial_reset_zero_command_context_required','consumed operator alone cannot call an unscoped maker command');
SAVEPOINT exact_command;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa232313-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT app_private.begin_financial_reset_zero_command('fa232313-0000-4000-8000-000000000100',scope,'ips_held_owner_cash')
 FROM scoped_zero_fixture,jsonb_array_elements(plan->'scopes') scope WHERE scope->>'property_id'='fa232313-0000-4000-8000-000000000002';
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_command_context SET backend_pid=backend_pid+1$$,
 '42501','financial_reset_zero_command_transaction_invalid','command cannot move to another backend');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_command_context SET transaction_id='1'::xid8$$,
 '42501','financial_reset_zero_command_transaction_invalid','command cannot reuse another top-level transaction');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_command_context SET generation=2$$,
 '42501','financial_reset_zero_command_binding_invalid','command cannot move to another generation');
SELECT throws_ok($$UPDATE app_private.financial_reset_zero_command_context SET organization_id='fa232313-0000-4000-8000-000000000009'$$,
 '42501','financial_reset_zero_command_binding_invalid','command cannot move to another organization');
SELECT throws_ok($$SELECT pg_temp.submit_scoped_zero_args(pg_temp.scoped_zero_args()||'{"amount":1}'::jsonb)$$,
 '23514','financial_reset_zero_command_arguments_changed','known zero cannot authorize a nonzero opening');
SELECT throws_ok($$SELECT pg_temp.submit_scoped_zero_args(pg_temp.scoped_zero_args()||'{"effective_date":"2026-11-01"}'::jsonb)$$,
 '23514','financial_reset_zero_command_arguments_changed','known zero cannot authorize another month');
SELECT throws_ok($$SELECT pg_temp.submit_scoped_zero_args(pg_temp.scoped_zero_args()||'{"component":"owner_due_to_ips"}'::jsonb)$$,
 '23514','financial_reset_zero_command_arguments_changed','known zero cannot authorize another component');
SELECT throws_ok($$SELECT pg_temp.submit_scoped_zero_args(pg_temp.scoped_zero_args()||'{"property_id":"fa232313-0000-4000-8000-000000000006"}'::jsonb)$$,
 '23514','financial_reset_zero_command_arguments_changed','known zero cannot switch properties');
SELECT throws_ok($$SELECT public.submit_owner_opening_balance('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000002',
 'fa232313-0000-4000-8000-000000000003','USD','2026-10-01','ips_held_owner_cash',0,'Ordinary probe','Ordinary evidence',NULL,repeat('e',64),NULL,'ordinary-null-actor')$$,
 '28000','Not authenticated','private context does not authenticate an ordinary public opening command');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_zero_command_context$$,
 '23514','financial_reset_zero_command_incomplete','unfinished submit cannot discard command context');
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_zero_command_context_closed IMMEDIATE$$,
 '23514','financial_reset_zero_command_must_close','open private context cannot survive commit checks');
ROLLBACK TO SAVEPOINT exact_command;

SAVEPOINT ordinary_cannot_borrow_archived_scope;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa232313-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT app_private.begin_financial_reset_zero_command('fa232313-0000-4000-8000-000000000100',scope,'ips_held_owner_cash')
 FROM scoped_zero_fixture,jsonb_array_elements(plan->'scopes') scope WHERE scope->>'property_id'='fa232313-0000-4000-8000-000000000006';
SELECT app_private.begin_financial_reset_archived_zero_context('fa232313-0000-4000-8000-000000000100',scope,'ips_held_owner_cash')
 FROM scoped_zero_fixture,jsonb_array_elements(plan->'scopes') scope WHERE scope->>'property_id'='fa232313-0000-4000-8000-000000000006';
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SELECT throws_ok($$SELECT public.submit_owner_opening_balance('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000006',
 'fa232313-0000-4000-8000-000000000003','USD','2026-10-01','ips_held_owner_cash',0,'Ordinary probe','Ordinary evidence',NULL,repeat('e',64),NULL,'ordinary-maker-archived')$$,
 '42501','financial_reset_claim_free_operator_required','ordinary maker cannot borrow the scoped archived exception');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000012'),true);
SELECT throws_ok($$SELECT app_private.financial_reset_zero_command_actor('submit')$$,
 '42501','financial_reset_claim_free_operator_required','ordinary reviewer claims cannot become the scoped maker identity');
SELECT set_config('request.jwt.claims','{"sub":"fa232313-0000-4000-8000-000000000099","role":"authenticated"}',true);
SELECT throws_ok($$SELECT app_private.financial_reset_zero_command_actor('submit')$$,
 '42501','financial_reset_claim_free_operator_required','foreign caller claims cannot borrow an operator context');
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT public.submit_owner_opening_balance('fa232313-0000-4000-8000-000000000001','fa232313-0000-4000-8000-000000000006',
 'fa232313-0000-4000-8000-000000000003','USD','2026-10-01','ips_held_owner_cash',0,'Ordinary probe','Ordinary evidence',NULL,repeat('e',64),NULL,'ordinary-null-archived')$$,
 '28000','Not authenticated','null caller also gains no ordinary archived submission authority');
ROLLBACK TO SAVEPOINT ordinary_cannot_borrow_archived_scope;

SELECT set_config('request.headers','{"sentinel":"preserve"}',true);
SAVEPOINT ordinary_conservation;
SET CONSTRAINTS public.owner_opening_balance_approved_entries_complete IMMEDIATE;
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero('fa232313-0000-4000-8000-000000000100')$$,
 '23514','approved initial owner opening request requires exactly one opening entry','unchanged ordinary approval conservation remains active and fails closed');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa232313-0000-4000-8000-000000000001'),0::bigint,
 'failed scoped phase rolls back all maker/reviewer writes');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa232313-0000-4000-8000-000000000001'),'frozen',
 'failed scoped phase restores the freeze');
ROLLBACK TO SAVEPOINT ordinary_conservation;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_known_zero('fa232313-0000-4000-8000-000000000100')$$,
 'consumed operator and live independent custom-role endorsements execute active and archived zero commands');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='fa232313-0000-4000-8000-000000000001' AND signed_amount=0),8::bigint,
 'each of two properties has all four explicit zero components');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id='fa232313-0000-4000-8000-000000000001'
 AND status='approved' AND submitted_by='fa232313-0000-4000-8000-000000000011' AND reviewed_by='fa232313-0000-4000-8000-000000000012'),8::bigint,
 'requests preserve real independent maker and reviewer audit identities');
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id='fa232313-0000-4000-8000-000000000001'
 AND status='completed' AND financial_generation=1),16::bigint,'normal per-actor generation-scoped idempotency records complete');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id='fa232313-0000-4000-8000-000000000001'),'frozen','phase returns frozen');
SELECT is((SELECT to_jsonb(p) FROM public.properties p WHERE id='fa232313-0000-4000-8000-000000000006'),(SELECT row_json FROM scoped_zero_property_before),
 'archived property bytes and original archive timestamp are unchanged');
SELECT is((SELECT count(*) FROM public.financial_month_locks WHERE id='fa232313-0000-4000-8000-000000000049'),1::bigint,'foreign financial sentinel is unchanged');
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_command_context),0::bigint,'no scoped command context remains');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archived_zero_command_context),0::bigint,'no archived exception context remains');
SELECT is(auth.uid(),NULL::uuid,'successful maker/reviewer execution never fabricated auth identity');
SELECT is(current_setting('request.jwt.claims'),'{}','successful execution preserves exact request-claim bytes');
SELECT is(current_setting('request.headers'),'{"sentinel":"preserve"}','successful execution restores original headers');
SELECT is(app_private.apply_financial_reset_known_zero('fa232313-0000-4000-8000-000000000100'),
 (SELECT result_json FROM app_private.financial_reset_zero_plans WHERE operation_id='fa232313-0000-4000-8000-000000000100'),'same transaction retry returns exact proof without duplicate openings');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM scoped_zero_claims WHERE user_id='fa232313-0000-4000-8000-000000000011'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan('fa232313-0000-4000-8000-000000000100',current_setting('test.scoped_zero_review'))$$,
 '23514','financial_reset_zero_approval_plan_invalid','completed phase cannot gain another endorsement even with valid live credentials');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_checkpoint_must_commit',
 'known-zero-only execution still cannot commit without continuation and durable report checkpoint');
SELECT * FROM finish();
ROLLBACK;
