-- Isolated synthetic fixture only. SET SESSION AUTHORIZATION below simulates
-- PostgREST's gateway boundary for SQL coverage; it is not a real login or proof
-- of hosted Auth/TLS. Production issuance must enter through verified PostgREST.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous)
VALUES
 ('fa231852-0000-4000-8000-000000000001','authenticated','authenticated','actor-bridge@test.invalid','{"provider":"email","providers":["email"]}','{}',false),
 ('fa231852-0000-4000-8000-000000000002','authenticated','authenticated','actor-foreign@test.invalid','{"provider":"email","providers":["email"]}','{}',false);
INSERT INTO public.organizations(id,name,slug,operational_timezone) VALUES
 ('fa231852-0000-4000-8000-000000000010','Actor bridge fixture','actor-bridge-fixture','Asia/Phnom_Penh'),
 ('fa231852-0000-4000-8000-000000000011','Actor foreign fixture','actor-foreign-fixture','Asia/Phnom_Penh');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('fa231852-0000-4000-8000-000000000010','fa231852-0000-4000-8000-000000000001','super_admin'),
 ('fa231852-0000-4000-8000-000000000011','fa231852-0000-4000-8000-000000000002','super_admin');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal) VALUES
 ('fa231852-0000-4000-8000-000000000101','fa231852-0000-4000-8000-000000000001',now(),now(),'aal1'),
 ('fa231852-0000-4000-8000-000000000102','fa231852-0000-4000-8000-000000000002',now(),now(),'aal1');
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
 VALUES('fa231852-0000-4000-8000-000000000010',true,now(),'fa231852-0000-4000-8000-000000000001');
INSERT INTO app_private.privileged_email_step_up_challenges(id,organization_id,user_id,session_id,code_digest,email_digest,expires_at,resend_available_at)
 VALUES('fa231852-0000-4000-8000-000000000201','fa231852-0000-4000-8000-000000000010','fa231852-0000-4000-8000-000000000001',
 'fa231852-0000-4000-8000-000000000101',repeat('1',64),repeat('2',64),now()+interval '10 minutes',now()+interval '1 minute');

CREATE TEMP TABLE actor_bridge_fixture(binding jsonb,authorization_id uuid,second_id uuid,claims jsonb);
INSERT INTO actor_bridge_fixture(binding,claims)
SELECT jsonb_build_object('version',1,'operation_id','fa231852-0000-4000-8000-000000000100','project_ref','syntheticprojectrefa',
 'organization_id','fa231852-0000-4000-8000-000000000010','packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),
 'schema_sha256',repeat('3',64),'ledger_sha256',repeat('4',64),'source_snapshot_sha256',repeat('5',64),'source_generation',0,'target_generation',1,
 'cutoff','2026-10-01','issue_date','2026-10-23','timezone','Asia/Phnom_Penh','execution_business_date','2026-10-23','invoice_date_policy','execution-business-date',
 'manifest_sha256',repeat('6',64),'plan_sha256',repeat('7',64),'archive_sha256',repeat('8',64),'action_sha256',repeat('9',64),
 'archive_artifact_sha256',repeat('a',64),'archive_count',1,'action_count',1,'zero_review_sha256',repeat('b',64),
 'continuation_semantic_sha256',app_private.financial_reset_hash(semantic),'report_review_sha256',repeat('c',64),'continuation_semantic',semantic),
 jsonb_build_object('sub','fa231852-0000-4000-8000-000000000001','session_id','fa231852-0000-4000-8000-000000000101',
 'role','authenticated','aud','authenticated','is_anonymous',false,'exp',extract(epoch FROM clock_timestamp()+interval '10 minutes')::bigint)
FROM (SELECT '{"actor_id":"fa231852-0000-4000-8000-000000000001","billing_period_start":"2026-10-01","issue_date":"2026-10-23","version":2,"leases":[]}'::jsonb semantic) s;
GRANT SELECT,UPDATE ON actor_bridge_fixture TO authenticated;

SELECT ok(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='app_private'
 AND table_name='financial_reset_actor_authorizations' AND column_name IN ('token','access_token','refresh_token','jwt','claims','password')),
 'authorization evidence contains no bearer, claims or credentials');
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE has_table_privilege(r.name,'app_private.financial_reset_actor_authorizations','SELECT,INSERT,UPDATE,DELETE')),
 'API roles cannot read, mint or alter authorization rows directly');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE n.nspname='app_private' AND p.proname IN ('consume_financial_reset_actor_authorization','assert_financial_reset_hosted_actor_context',
 'financial_reset_hosted_actor_authorization_status','financial_reset_actor_is_current') AND has_function_privilege(r.name,p.oid,'EXECUTE')),
 'an authorization locator alone gives no API caller private reset access');
SELECT ok(has_function_privilege('authenticated','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE'),
 'only authenticated ingress exposes the narrow authorization RPC');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='app_private.financial_reset_actor_authorizations'::regclass),
 'private authorization table has RLS');

SELECT set_config('request.jwt.claims',(SELECT claims::text FROM actor_bridge_fixture),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_session_required','raw SET ROLE and supplied claims cannot substitute for gateway ingress');
RESET ROLE;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authority_required','live session without required step-up cannot authorize');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO app_private.privileged_email_step_up_grants(organization_id,user_id,session_id,challenge_id,expires_at)
 VALUES('fa231852-0000-4000-8000-000000000010','fa231852-0000-4000-8000-000000000001','fa231852-0000-4000-8000-000000000101',
 'fa231852-0000-4000-8000-000000000201',NULL);

SELECT set_config('request.jwt.claims',(SELECT claims::text FROM actor_bridge_fixture),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding||'{"organization_id":"fa231852-0000-4000-8000-000000000011"}'::jsonb,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authority_required','current authority in another organization is not sufficient');
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding||'{"actor_id":"fa231852-0000-4000-8000-000000000002"}'::jsonb,'prepare') FROM actor_bridge_fixture$$,
 '22023','financial_reset_actor_binding_invalid','caller-controlled identity field is outside the binding');
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding,'approve') FROM actor_bridge_fixture$$,
 '22023','financial_reset_actor_binding_invalid','unknown action cannot authorize');
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('session_id','fa231852-0000-4000-8000-000000000102'))::text FROM actor_bridge_fixture),true);
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authority_required','another user session does not authenticate the reviewed actor');
SELECT set_config('request.jwt.claims',(SELECT (claims||jsonb_build_object('exp',extract(epoch FROM clock_timestamp()-interval '1 minute')::bigint))::text FROM actor_bridge_fixture),true);
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authority_required','expired request credentials cannot mint authority');
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM actor_bridge_fixture),true);
UPDATE actor_bridge_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'prepare'),
 second_id=public.authorize_financial_reset_hosted_action(binding,'seal');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);
SELECT ok((SELECT authorization_id IS NOT NULL AND second_id IS NOT NULL FROM actor_bridge_fixture),
 'genuine-ingress synthetic fixture records two exact action locators');
SELECT is((SELECT actor_id FROM app_private.financial_reset_actor_authorizations a JOIN actor_bridge_fixture f USING(authorization_id)),
 'fa231852-0000-4000-8000-000000000001'::uuid,'actor is captured from request identity');
SELECT ok((SELECT expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes' AND expires_at<=credential_expires_at
 FROM app_private.financial_reset_actor_authorizations a JOIN actor_bridge_fixture f USING(authorization_id)),
 'authorization expiry is bounded by five minutes and request credential expiry');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status(authorization_id,binding,'prepare')->>'status' FROM actor_bridge_fixture),
 'pending','read-only status recognizes current unconsumed authorization');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','status observation and a locator establish no transaction context');
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'seal') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_mismatch','action mismatch cannot consume');
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding||jsonb_build_object('plan_sha256',repeat('f',64)),'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_mismatch','changed reviewed bytes cannot consume');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status(authorization_id,binding||jsonb_build_object('packet_sha256',repeat('f',64)),'prepare')->>'status' FROM actor_bridge_fixture),
 'mismatch','status does not bless another packet');
SELECT throws_ok($$UPDATE app_private.financial_reset_actor_authorizations SET actor_id='fa231852-0000-4000-8000-000000000002'$$,
 '23514','financial_reset_actor_authorization_immutable','actor evidence cannot be rewritten');

CREATE TEMP TABLE actor_bridge_expired_locator AS
WITH expired AS (
 INSERT INTO app_private.financial_reset_actor_authorizations(organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,
  credential_expires_at,issued_at,expires_at)
 SELECT a.organization_id,a.operation_id,a.action,a.binding,a.binding_sha256,a.actor_id,a.session_id,a.credential_expires_at,
  clock_timestamp()-interval '6 minutes',clock_timestamp()-interval '2 minutes'
 FROM app_private.financial_reset_actor_authorizations a JOIN actor_bridge_fixture f USING(authorization_id)
 RETURNING authorization_id
) SELECT * FROM expired;
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization((SELECT authorization_id FROM actor_bridge_expired_locator),binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','expired authorization fails even while its Auth session is still live');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status((SELECT authorization_id FROM actor_bridge_expired_locator),binding,'prepare')->>'status' FROM actor_bridge_fixture),
 'expired','status independently recognizes authorization expiry');

UPDATE app_private.privileged_email_step_up_grants SET revoked_at=clock_timestamp() WHERE user_id='fa231852-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','step-up revoked after issuance blocks consumption');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status(authorization_id,binding,'prepare')->>'status' FROM actor_bridge_fixture),
 'revoked','status rechecks revoked step-up');
UPDATE app_private.privileged_email_step_up_grants SET revoked_at=NULL WHERE user_id='fa231852-0000-4000-8000-000000000001';
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='fa231852-0000-4000-8000-000000000101';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','Auth session expiry after issuance blocks consumption');
UPDATE auth.sessions SET not_after=NULL WHERE id='fa231852-0000-4000-8000-000000000101';
UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id='fa231852-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','current user ban blocks consumption');
UPDATE auth.users SET banned_until=NULL WHERE id='fa231852-0000-4000-8000-000000000001';
-- Synthetic delete/reinsert of the same membership verifies that current
-- membership, not a persisted role claim, governs the eventual action.
CREATE TEMP TABLE actor_bridge_member AS SELECT * FROM public.organization_members WHERE user_id='fa231852-0000-4000-8000-000000000001';
DELETE FROM public.organization_members WHERE user_id='fa231852-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','membership removed after issuance blocks consumption');
INSERT INTO public.organization_members SELECT * FROM actor_bridge_member;

-- Wrong-backend/top-xid persisted evidence must not become local context. These
-- are deliberately crafted negative fixture rows, not issuer entry points.
INSERT INTO app_private.financial_reset_actor_authorizations(organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,
 credential_expires_at,issued_at,expires_at,consumed_at,backend_pid,transaction_id)
SELECT a.organization_id,a.operation_id,a.action,a.binding,a.binding_sha256,a.actor_id,a.session_id,a.credential_expires_at,a.issued_at,a.expires_at,
 clock_timestamp(),pg_backend_pid()+1,pg_current_xact_id() FROM app_private.financial_reset_actor_authorizations a JOIN actor_bridge_fixture f USING(authorization_id);
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','another backend cannot donate its consumed authorization');
INSERT INTO app_private.financial_reset_actor_authorizations(organization_id,operation_id,action,binding,binding_sha256,actor_id,session_id,
 credential_expires_at,issued_at,expires_at,consumed_at,backend_pid,transaction_id)
SELECT a.organization_id,a.operation_id,a.action,a.binding,a.binding_sha256,a.actor_id,a.session_id,a.credential_expires_at,a.issued_at,a.expires_at,
 clock_timestamp(),pg_backend_pid(),((pg_current_xact_id()::text)::bigint+1)::text::xid8 FROM app_private.financial_reset_actor_authorizations a JOIN actor_bridge_fixture f USING(authorization_id);
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','another top-level transaction cannot donate its authorization');

SELECT lives_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 'private consumption binds actual authority to this exact backend and top-level transaction');
SELECT is((SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare')->>'actorId' FROM actor_bridge_fixture),
 'fa231852-0000-4000-8000-000000000001','context derives the actor from consumed authorization');
SELECT is((SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare')->>'authorizationId' FROM actor_bridge_fixture),
 (SELECT authorization_id::text FROM actor_bridge_fixture),'context identifies the exact consumed locator');
SELECT is((SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare')->>'transactionId' FROM actor_bridge_fixture),
 pg_current_xact_id()::text,'context uses the top-level xid even inside pgTAP exception subtransactions');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status(authorization_id,binding,'prepare')->>'status' FROM actor_bridge_fixture),
 'consumed','consumed status is historical evidence, not permission to dispatch again');
SELECT is(auth.uid(),NULL::uuid,'consumption never fabricates auth.uid or request claims');
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_consumed','replaying the same locator fails');
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(second_id,binding,'seal') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_transaction_already_bound','one transaction cannot consume a different action');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'seal') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','consumed prepare context cannot authorize seal');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding||jsonb_build_object('manifest_sha256',repeat('e',64)),'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','consumed context cannot authorize different reviewed bytes');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_actor_authorizations$$,
 '23514','financial_reset_actor_authorization_immutable','consumed evidence cannot be deleted');

DELETE FROM auth.sessions WHERE id='fa231852-0000-4000-8000-000000000101';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(second_id,binding,'seal') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_authorization_stale','deleted session cannot consume an otherwise valid pending authorization');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_hosted_actor_context(binding,'prepare') FROM actor_bridge_fixture$$,
 '42501','financial_reset_actor_context_required','session deletion revokes further command context immediately');
SELECT is((SELECT app_private.financial_reset_hosted_actor_authorization_status(authorization_id,binding,'prepare')->>'status' FROM actor_bridge_fixture),
 'consumed','session revocation preserves historical consumed evidence for reconciliation');
SELECT ok(NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id IN
 ('fa231852-0000-4000-8000-000000000010','fa231852-0000-4000-8000-000000000011')),
 'issuance and consumption enroll no organization and change no financial generation');
SELECT * FROM finish();
ROLLBACK;
