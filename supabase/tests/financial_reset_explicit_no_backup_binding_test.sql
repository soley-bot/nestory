-- Rollback-only policy and refusal checks. Digest-shaped values below establish
-- binding contracts only; they are not archive, backup or completion evidence.
-- The SQL gateway simulation uses new synthetic Auth/session rows and is not
-- evidence of an actual Auth login or HTTP/PostgREST request.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Reuse existing Pilot metadata unchanged. An empty test database receives only
-- this rollback-only organization row at the exact policy target.
INSERT INTO public.organizations(id,name,slug,operational_timezone)
SELECT '752a87b8-bd04-4a45-9cb8-00687af66e73','No-backup policy synthetic target',
 'no-backup-policy-'||extensions.gen_random_uuid()::text,'Asia/Phnom_Penh'
WHERE NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='752a87b8-bd04-4a45-9cb8-00687af66e73');
CREATE TEMP TABLE no_backup_original_target AS
SELECT to_jsonb(o) AS image FROM public.organizations o WHERE id='752a87b8-bd04-4a45-9cb8-00687af66e73';
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous)
VALUES('fd240237-0000-4000-8000-000000000010','authenticated','authenticated',
 'no-backup-contract-'||extensions.gen_random_uuid()::text||'@test.invalid',
 '{"provider":"email","providers":["email"]}','{}',false);
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after,aal)
VALUES('fd240237-0000-4000-8000-000000000011','fd240237-0000-4000-8000-000000000010',
 clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour','aal1');

CREATE TEMP TABLE no_backup_fixture(binding jsonb,legacy_binding jsonb,reopening jsonb);
INSERT INTO no_backup_fixture(binding)
SELECT jsonb_build_object('version',2,'operation_id','fd240237-0000-4000-8000-000000000100',
 'project_ref','pfvmztxktkwyewvxfgot','organization_id','752a87b8-bd04-4a45-9cb8-00687af66e73',
 'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),
 'schema_sha256',repeat('3',64),'ledger_sha256',repeat('4',64),'source_snapshot_sha256',repeat('5',64),
 'foreign_snapshot_sha256',repeat('6',64),'source_generation',0,'target_generation',1,
 'cutoff','2026-10-01','issue_date','2026-10-01','timezone','Asia/Phnom_Penh',
 'execution_business_date','2026-10-24','invoice_date_policy','original-reviewed-october',
 'manifest_sha256',repeat('7',64),'plan_sha256',repeat('8',64),'archive_sha256',repeat('9',64),
 'action_sha256',repeat('a',64),'archive_artifact_sha256',NULL,'archive_count',1,'action_count',1,
 'zero_review_sha256',repeat('b',64),'continuation_semantic_sha256',app_private.financial_reset_hash(semantic),
 'report_review_sha256',repeat('c',64),'continuation_semantic',semantic,'recovery_policy','no-backup-user-waived')
FROM (SELECT jsonb_build_object('version',3,'actor_id','fd240237-0000-4000-8000-000000000010',
 'billing_period_start','2026-10-01','issue_date','2026-10-01','execution_business_date','2026-10-24',
 'invoice_date_policy','original-reviewed-october','leases','[]'::jsonb,'original_invoice_sources','[]'::jsonb) AS semantic) s;
UPDATE no_backup_fixture SET legacy_binding=(binding-ARRAY['foreign_snapshot_sha256','recovery_policy'])
 ||jsonb_build_object('version',1,'archive_artifact_sha256',repeat('d',64)),
 reopening=jsonb_build_object('version',1,'request_id','fd240237-0000-4000-8000-000000000101',
 'operation_id',binding->'operation_id','generation',1,'cutoff','2026-10-01',
 'checkpoint_sha256',repeat('d',64),'after_sha256',repeat('e',64),'foreign_sha256',binding->'foreign_snapshot_sha256',
 'evidence_sha256',repeat('1',64),'review_sha256',repeat('2',64),'execution_business_date','2026-10-24');

SELECT lives_ok($$SELECT app_private.assert_financial_reset_no_backup_binding(binding,'freeze') FROM no_backup_fixture$$,
 'exact v2 policy accepts an explicit JSON null external archive digest');
SELECT lives_ok(format('SELECT app_private.assert_financial_reset_actor_binding(binding,%L) FROM no_backup_fixture',action),
 'v2 actor binding accepts only the existing forward action '||action)
FROM unnest(ARRAY['freeze','checkpoint','prepare','seal','execute']) AS actions(action);

-- Every required top-level field is independently necessary, including the
-- present JSON null archive_artifact_sha256 and foreign_snapshot_sha256.
SELECT throws_ok(format('SELECT app_private.assert_financial_reset_no_backup_binding(%L::jsonb,''freeze'')',binding-key),
 '22023','financial_reset_no_backup_binding_invalid','missing required binding field: '||key)
FROM no_backup_fixture CROSS JOIN LATERAL jsonb_object_keys(binding) AS fields(key) ORDER BY key;

-- Each case changes one boundary and leaves all unrelated reviewed bytes alone.
SELECT throws_ok(format('SELECT app_private.assert_financial_reset_no_backup_binding(%L::jsonb,''freeze'')',binding||patch),
 '22023','financial_reset_no_backup_binding_invalid',description)
FROM no_backup_fixture CROSS JOIN (VALUES
 ('unknown top-level field is rejected','{"unexpected":true}'::jsonb),
 ('version must be the new numeric version','{"version":"2"}'::jsonb),
 ('the no-backup validator cannot bless old version one','{"version":1}'::jsonb),
 ('the waiver policy is explicit and exact','{"recovery_policy":"backup-available"}'::jsonb),
 ('a null waiver policy is rejected','{"recovery_policy":null}'::jsonb),
 ('a fabricated external archive digest is rejected',jsonb_build_object('archive_artifact_sha256',repeat('a',64))),
 ('an empty external archive digest is rejected','{"archive_artifact_sha256":""}'::jsonb),
 ('the text null is not a missing external backup','{"archive_artifact_sha256":"null"}'::jsonb),
 ('the one-off waiver cannot target another organization','{"organization_id":"fd240237-0000-4000-8000-000000000001"}'::jsonb),
 ('the one-off waiver cannot target another project','{"project_ref":"syntheticprojectrefa"}'::jsonb),
 ('operation identity must be a version-four UUID','{"operation_id":"fd240237-0000-1000-8000-000000000100"}'::jsonb),
 ('main commit digest must be a string','{"main_sha":1000000000000000000000000000000000000000}'::jsonb),
 ('main commit digest must contain forty lowercase hex characters','{"main_sha":"not-a-commit"}'::jsonb),
 ('the cutoff remains the original October first','{"cutoff":"2026-10-02"}'::jsonb),
 ('the issue date remains the original October first','{"issue_date":"2026-10-24"}'::jsonb),
 ('the operational timezone remains exact','{"timezone":"UTC"}'::jsonb),
 ('execution-date billing cannot replace original invoice dates','{"invoice_date_policy":"execution-business-date"}'::jsonb),
 ('execution stays in October','{"execution_business_date":"2026-11-01"}'::jsonb),
 ('invalid October day zero is rejected','{"execution_business_date":"2026-10-00"}'::jsonb),
 ('invalid October day thirty-two is rejected','{"execution_business_date":"2026-10-32"}'::jsonb),
 ('source generation must be a number','{"source_generation":"0"}'::jsonb),
 ('source generation cannot be negative','{"source_generation":-1}'::jsonb),
 ('source generation cannot be fractional','{"source_generation":0.5}'::jsonb),
 ('target generation must be a number','{"target_generation":"1"}'::jsonb),
 ('target generation cannot remain unchanged','{"target_generation":0}'::jsonb),
 ('target generation cannot skip ahead','{"target_generation":2}'::jsonb),
 ('generation cannot overflow the stored integer','{"source_generation":2147483647,"target_generation":2147483648}'::jsonb),
 ('archive count must be a positive number','{"archive_count":"1"}'::jsonb),
 ('archive count cannot be empty','{"archive_count":0}'::jsonb),
 ('archive count cannot exceed the stored integer','{"archive_count":2147483648}'::jsonb),
 ('action count must be a positive number','{"action_count":"1"}'::jsonb),
 ('action count cannot be empty','{"action_count":0}'::jsonb),
 ('action count cannot be fractional','{"action_count":1.5}'::jsonb),
 ('action count cannot exceed the stored integer','{"action_count":2147483648}'::jsonb)
) AS cases(description,patch);

SELECT throws_ok(format('SELECT app_private.assert_financial_reset_no_backup_binding(%L::jsonb,''freeze'')',
 jsonb_set(binding,ARRAY[field],bad)),
 '22023','financial_reset_no_backup_binding_invalid',field||' rejects '||kind)
FROM no_backup_fixture CROSS JOIN unnest(ARRAY['packet_sha256','sources_sha256','schema_sha256','ledger_sha256',
 'source_snapshot_sha256','foreign_snapshot_sha256','manifest_sha256','plan_sha256','archive_sha256','action_sha256',
 'zero_review_sha256','continuation_semantic_sha256','report_review_sha256']) AS fields(field)
CROSS JOIN (VALUES('malformed hex','"not-a-digest"'::jsonb),('JSON null','null'::jsonb),
 ('a numeric digest','1000000000000000000000000000000000000000000000000000000000000000'::jsonb)) AS bad_values(kind,bad);

SELECT throws_ok(format('SELECT app_private.assert_financial_reset_no_backup_binding(%L::jsonb,''freeze'')',
 binding||jsonb_build_object('continuation_semantic',semantic,'continuation_semantic_sha256',app_private.financial_reset_hash(semantic))),
 '22023','financial_reset_no_backup_binding_invalid','missing reviewed continuation field: '||key)
FROM no_backup_fixture CROSS JOIN LATERAL jsonb_object_keys(binding->'continuation_semantic') AS fields(key)
CROSS JOIN LATERAL (SELECT (binding->'continuation_semantic')-key AS semantic) s ORDER BY key;

SELECT throws_ok(format('SELECT app_private.assert_financial_reset_no_backup_binding(%L::jsonb,''freeze'')',
 binding||jsonb_build_object('continuation_semantic',semantic,'continuation_semantic_sha256',app_private.financial_reset_hash(semantic))),
 '22023','financial_reset_no_backup_binding_invalid',description)
FROM no_backup_fixture CROSS JOIN (VALUES
 ('continuation rejects unreviewed fields','{"unexpected":true}'::jsonb),
 ('continuation semantic excludes the mutable source hash',jsonb_build_object('source_sha256',repeat('a',64))),
 ('continuation keeps version three','{"version":2}'::jsonb),
 ('continuation keeps the reviewed actor identity shape','{"actor_id":"not-a-uuid"}'::jsonb),
 ('continuation keeps the October billing period','{"billing_period_start":"2026-11-01"}'::jsonb),
 ('continuation keeps the original issue date','{"issue_date":"2026-10-24"}'::jsonb),
 ('continuation execution date agrees with its binding','{"execution_business_date":"2026-10-23"}'::jsonb),
 ('continuation cannot change the invoice date policy','{"invoice_date_policy":"execution-business-date"}'::jsonb),
 ('reviewed leases remain an array','{"leases":{}}'::jsonb),
 ('original invoice sources remain an array','{"original_invoice_sources":{}}'::jsonb)
) AS cases(description,patch)
CROSS JOIN LATERAL (SELECT (binding->'continuation_semantic')||patch AS semantic) s;
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(
 jsonb_set(binding,'{continuation_semantic,actor_id}','"fd240237-0000-4000-8000-000000000099"'),'execute') FROM no_backup_fixture$$,
 '22023','financial_reset_no_backup_binding_invalid','a syntactically valid changed semantic still requires its exact digest');
SELECT throws_ok(format('SELECT app_private.assert_financial_reset_actor_binding(binding,%L) FROM no_backup_fixture',action),
 '22023','financial_reset_no_backup_binding_invalid','no-backup policy refuses '||action)
FROM unnest(ARRAY['prepare-recovery','execute-recovery']) AS actions(action);
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding||'{"recovery":{}}'::jsonb,'execute') FROM no_backup_fixture$$,
 '22023','financial_reset_no_backup_binding_invalid','a recovery payload cannot be hidden in a forward binding');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding,'unknown') FROM no_backup_fixture$$,
 '22023','financial_reset_actor_binding_invalid','the pre-existing unknown-action refusal remains');

SELECT lives_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding,'execute') FROM no_backup_fixture$$,
 'existing version one still accepts its own external-archive digest contract');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding||jsonb_build_object(
 'issue_date','2026-10-24','invoice_date_policy','execution-business-date'),'execute') FROM no_backup_fixture$$,
 'version one retains its earlier execution-date binding behavior');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding||'{"archive_artifact_sha256":null}'::jsonb,'execute') FROM no_backup_fixture$$,
 '22023','financial_reset_actor_binding_invalid','version one cannot inherit the new null-archive exception');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding||'{"recovery_policy":"no-backup-user-waived"}'::jsonb,'execute') FROM no_backup_fixture$$,
 '22023','financial_reset_actor_binding_invalid','version one cannot smuggle in the new waiver field');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding||jsonb_build_object('foreign_snapshot_sha256',repeat('a',64)),'execute') FROM no_backup_fixture$$,
 '22023','financial_reset_actor_binding_invalid','version one keeps its original closed field set');

SELECT lives_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding||jsonb_build_object('reopening',reopening),'reopen') FROM no_backup_fixture$$,
 'the separate reopening prelude validates a v2 base before the forward-action policy');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding||jsonb_build_object('reopening',reopening||jsonb_build_object('foreign_sha256',repeat('f',64))),'reopen') FROM no_backup_fixture$$,
 '22023','financial_reset_reopening_no_backup_binding_invalid','v2 reopening rejects a foreign census different from the original binding');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_actor_binding(legacy_binding||jsonb_build_object('reopening',reopening),'reopen') FROM no_backup_fixture$$,
 'the separate reopening prelude also retains version one');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding,'reopen') FROM no_backup_fixture$$,
 '22023','financial_reset_reopening_binding_invalid','a waiver alone cannot stand in for a reopening review');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(binding||jsonb_build_object('reopening',reopening||'{"generation":2}'::jsonb),'reopen') FROM no_backup_fixture$$,
 '22023','financial_reset_reopening_binding_invalid','reopening still cannot advance generation');
SELECT throws_ok($$SELECT app_private.reopen_financial_reset_checked(binding||jsonb_build_object('reopening',reopening),'{}') FROM no_backup_fixture$$,
 '42501','financial_reset_actor_context_required','even a well-shaped no-backup reopening requires consumed current authority');

SELECT ok(NOT has_function_privilege(role,'app_private.assert_financial_reset_no_backup_binding(jsonb,text)','EXECUTE')
 AND NOT has_function_privilege(role,'app_private.reserve_financial_reset_hosted_operation(jsonb)','EXECUTE')
 AND NOT has_function_privilege(role,'app_private.consume_financial_reset_actor_authorization(uuid,jsonb,text)','EXECUTE'),
 role||' receives no direct policy, reservation or consumption authority')
FROM unnest(ARRAY['anon','authenticated','service_role']) AS roles(role);
SELECT ok(has_function_privilege('authenticated','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.authorize_financial_reset_hosted_action(jsonb,text)','EXECUTE'),
 'the authenticated gateway remains the only application authorization entry');

SELECT set_config('test.no_backup.binding',(SELECT binding::text FROM no_backup_fixture),true);
SELECT set_config('test.no_backup.claims',jsonb_build_object('sub','fd240237-0000-4000-8000-000000000010',
 'session_id','fd240237-0000-4000-8000-000000000011','role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',extract(epoch FROM clock_timestamp()+interval '50 minutes')::bigint)::text,true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims',current_setting('test.no_backup.claims'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(current_setting('test.no_backup.binding')::jsonb,'freeze')$$,
 '42501','financial_reset_actor_session_required','a waived backup does not turn raw role plus claims into genuine gateway ingress');
RESET ROLE;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(current_setting('test.no_backup.binding')::jsonb,'freeze')$$,
 '42501','financial_reset_actor_authority_required','a live synthetic session still requires current organization authority');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true);

-- These are new synthetic authority rows only. Existing Pilot membership and
-- step-up policy rows are neither edited nor disabled.
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('752a87b8-bd04-4a45-9cb8-00687af66e73','fd240237-0000-4000-8000-000000000010','super_admin');
INSERT INTO app_private.privileged_email_step_up_challenges(id,organization_id,user_id,session_id,code_digest,email_digest,expires_at,resend_available_at)
VALUES('fd240237-0000-4000-8000-000000000012','752a87b8-bd04-4a45-9cb8-00687af66e73',
 'fd240237-0000-4000-8000-000000000010','fd240237-0000-4000-8000-000000000011',repeat('1',64),repeat('2',64),
 clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '1 minute');
INSERT INTO app_private.privileged_email_step_up_grants(organization_id,user_id,session_id,challenge_id,expires_at)
VALUES('752a87b8-bd04-4a45-9cb8-00687af66e73','fd240237-0000-4000-8000-000000000010',
 'fd240237-0000-4000-8000-000000000011','fd240237-0000-4000-8000-000000000012',NULL);
CREATE TEMP TABLE no_backup_before AS
SELECT app_private.financial_reset_continuation_snapshot('752a87b8-bd04-4a45-9cb8-00687af66e73') AS source,
 app_private.financial_reset_hosted_foreign_census('752a87b8-bd04-4a45-9cb8-00687af66e73') AS foreign_rows,
 (SELECT count(*) FROM app_private.financial_write_controls) AS control_count,
 (SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY organization_id),'[]'::jsonb) FROM app_private.financial_write_controls w) AS controls,
 (SELECT count(*) FROM app_private.financial_reset_hosted_reservations) AS reservation_count,
 (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY operation_id),'[]'::jsonb) FROM app_private.financial_reset_hosted_reservations r) AS reservations,
 (SELECT count(*) FROM app_private.financial_reset_operations) AS operation_count;
UPDATE no_backup_fixture SET binding=binding||jsonb_build_object(
 'source_snapshot_sha256',app_private.financial_reset_hash((SELECT source FROM no_backup_before)),
 -- Always corrupt one hex character of the actual foreign census digest.
 'foreign_snapshot_sha256',(SELECT CASE left(digest,1) WHEN '0' THEN '1' ELSE '0' END||substr(digest,2)
  FROM (SELECT app_private.financial_reset_hash(foreign_rows) AS digest FROM no_backup_before) hashes));
SELECT set_config('test.no_backup.binding',(SELECT binding::text FROM no_backup_fixture),true);
SELECT throws_ok($$SELECT app_private.reserve_financial_reset_hosted_operation(binding) FROM no_backup_fixture$$,
 '42501','financial_reset_actor_context_required','shape validation cannot replace an actual consumed operator context');

SELECT set_config('request.jwt.claims',(current_setting('test.no_backup.claims')::jsonb
 ||jsonb_build_object('session_id','fd240237-0000-4000-8000-000000000099'))::text,true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(current_setting('test.no_backup.binding')::jsonb,'freeze')$$,
 '42501','financial_reset_actor_authority_required','current membership cannot replace a live Auth session');
SELECT set_config('request.jwt.claims',(current_setting('test.no_backup.claims')::jsonb
 ||jsonb_build_object('exp',extract(epoch FROM clock_timestamp()-interval '1 minute')::bigint))::text,true);
SELECT throws_ok($$SELECT public.authorize_financial_reset_hosted_action(current_setting('test.no_backup.binding')::jsonb,'freeze')$$,
 '42501','financial_reset_actor_authority_required','waiver policy does not extend expired request credentials');
SELECT set_config('request.jwt.claims',current_setting('test.no_backup.claims'),true);
SELECT lives_ok($$SELECT set_config('test.no_backup.authorization',
 public.authorize_financial_reset_hosted_action(current_setting('test.no_backup.binding')::jsonb,'freeze')::text,true)$$,
 'the synthetic gateway issues an exact v2 freeze locator after unchanged authority checks');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations
 WHERE authorization_id=current_setting('test.no_backup.authorization')::uuid
 AND actor_id='fd240237-0000-4000-8000-000000000010' AND session_id='fd240237-0000-4000-8000-000000000011'
 AND action='freeze' AND binding=(SELECT binding FROM no_backup_fixture) AND consumed_at IS NULL
 AND expires_at<=issued_at+interval '5 minutes' AND expires_at<=credential_expires_at),
 'the locator retains exact actor, session, binding, action and original expiry bounds');
SAVEPOINT revoked_synthetic_session;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='fd240237-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(
 current_setting('test.no_backup.authorization')::uuid,binding,'freeze') FROM no_backup_fixture$$,
 '42501','financial_reset_actor_authorization_stale','session revocation still blocks consumption of a no-backup locator');
ROLLBACK TO SAVEPOINT revoked_synthetic_session;
SAVEPOINT removed_synthetic_membership;
DELETE FROM public.organization_members WHERE organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'
 AND user_id='fd240237-0000-4000-8000-000000000010';
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(
 current_setting('test.no_backup.authorization')::uuid,binding,'freeze') FROM no_backup_fixture$$,
 '42501','financial_reset_actor_authorization_stale','membership revocation still blocks consumption of a no-backup locator');
ROLLBACK TO SAVEPOINT removed_synthetic_membership;
SELECT lives_ok($$SELECT app_private.consume_financial_reset_actor_authorization(
 current_setting('test.no_backup.authorization')::uuid,binding,'freeze') FROM no_backup_fixture$$,
 'private consumption binds the current synthetic actor to this exact transaction');
SELECT throws_ok($$SELECT app_private.reserve_financial_reset_hosted_operation(binding) FROM no_backup_fixture$$,
 '40001','financial_reset_hosted_foreign_changed','a consumed no-backup authorization cannot waive changed foreign organization evidence');
SELECT throws_ok($$SELECT app_private.consume_financial_reset_actor_authorization(
 current_setting('test.no_backup.authorization')::uuid,binding,'freeze') FROM no_backup_fixture$$,
 '42501','financial_reset_actor_authorization_consumed','no-backup authorization remains single use');

SELECT is(app_private.financial_reset_continuation_snapshot('752a87b8-bd04-4a45-9cb8-00687af66e73'),
 (SELECT source FROM no_backup_before),'all refused commands leave the full target source image unchanged');
SELECT is(app_private.financial_reset_hosted_foreign_census('752a87b8-bd04-4a45-9cb8-00687af66e73'),
 (SELECT foreign_rows FROM no_backup_before),'all refused commands leave every foreign organization unchanged');
SELECT is((SELECT count(*) FROM app_private.financial_write_controls),(SELECT control_count FROM no_backup_before),
 'no refused request creates or deletes a financial control');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY organization_id),'[]'::jsonb) FROM app_private.financial_write_controls w),
 (SELECT controls FROM no_backup_before),'existing control status and generation images remain exact');
SELECT is((SELECT count(*) FROM app_private.financial_reset_hosted_reservations),(SELECT reservation_count FROM no_backup_before),
 'no refused request creates a hosted reservation');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY operation_id),'[]'::jsonb) FROM app_private.financial_reset_hosted_reservations r),
 (SELECT reservations FROM no_backup_before),'all existing reservation images remain exact');
SELECT is((SELECT count(*) FROM app_private.financial_reset_operations),(SELECT operation_count FROM no_backup_before),
 'policy validation and failed reservation execute no reset operation');
SELECT is((SELECT to_jsonb(o) FROM public.organizations o WHERE id='752a87b8-bd04-4a45-9cb8-00687af66e73'),
 (SELECT image FROM no_backup_original_target),'existing Pilot metadata is never rewritten by this fixture');
SELECT is(auth.uid(),NULL::uuid,'private checks leave request identity empty');
SELECT * FROM finish();
ROLLBACK;
