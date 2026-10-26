-- Synthetic actual-COMMIT failure proof; never a production command.
-- The sole database writer supplies one pg_temp.reopening_expiry_fixture row:
-- (binding jsonb,evidence_text text,authorization_id uuid), obtained through the
-- real completed reset and genuine gateway authorization. No claims, receipt,
-- completion, session, permission or capability is manufactured here.
-- Run in a separately admitted disposable clone. Retain the failed intent and
-- do not reuse its locator or automatically retry/reauthorize after this test.
-- The runner must accept exactly the named expected COMMIT error below and
-- reject any other stderr. No positive reopening proof is claimed by this file.
\set ON_ERROR_STOP on
SELECT current_database() ~ '^pilot_reset_receipts_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 AS reopening_expiry_disposable_database \gset
\if :reopening_expiry_disposable_database
\else
\echo 'Refusing reopening expiry proof outside its admitted disposable database.'
\quit 3
\endif

BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
SET LOCAL timezone='UTC';
DO $expiry_input$
DECLARE f record; a app_private.financial_reset_actor_authorizations%ROWTYPE; expiry_at timestamptz;
BEGIN
 IF (SELECT count(*) FROM pg_temp.reopening_expiry_fixture)<>1 THEN RAISE EXCEPTION 'reopening_expiry_fixture_input_invalid'; END IF;
 SELECT * INTO STRICT f FROM pg_temp.reopening_expiry_fixture;
 PERFORM app_private.assert_financial_reset_actor_binding(f.binding,'reopen');
 expiry_at:=(f.evidence_text::jsonb->'authority_receipt'->>'expiresAt')::timestamptz;
 SELECT * INTO STRICT a FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=f.authorization_id;
 IF f.binding->'version' IS DISTINCT FROM '2'::jsonb OR f.binding->>'recovery_policy' IS DISTINCT FROM 'no-backup-user-waived'
  OR f.binding->>'organization_id' IS DISTINCT FROM '752a87b8-bd04-4a45-9cb8-00687af66e73'
  OR expiry_at IS NULL OR expiry_at<=clock_timestamp()+interval '1 second' OR expiry_at>clock_timestamp()+interval '15 seconds'
  OR a.binding IS DISTINCT FROM f.binding OR a.action IS DISTINCT FROM 'reopen' OR a.consumed_at IS NOT NULL
  OR a.expires_at<=expiry_at+interval '30 seconds' OR a.credential_expires_at<=expiry_at+interval '30 seconds'
  OR app_private.financial_reset_actor_is_current(a.organization_id,a.actor_id,a.session_id) IS DISTINCT FROM true
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE operation_id=a.operation_id) THEN
  RAISE EXCEPTION 'reopening_expiry_fixture_input_invalid';
 END IF;
END;
$expiry_input$;

SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_lifecycle_v1:'||(binding->>'organization_id'),0))
 FROM pg_temp.reopening_expiry_fixture;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'reopen') FROM pg_temp.reopening_expiry_fixture;
DO $open_then_hold$
DECLARE f record; expiry_at timestamptz; hold_seconds double precision;
BEGIN
 SELECT * INTO STRICT f FROM pg_temp.reopening_expiry_fixture;
 PERFORM app_private.reopen_financial_reset_checked(f.binding,f.evidence_text);
 PERFORM app_private.assert_financial_reset_hosted_actor_context(f.binding,'reopen');
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=(f.binding->>'organization_id')::uuid
   AND status='open' AND generation=(f.binding->'reopening'->>'generation')::integer)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE authorization_id=f.authorization_id
   AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'reopening_expiry_fixture_uncommitted_open_missing';
 END IF;
 expiry_at:=(f.evidence_text::jsonb->'authority_receipt'->>'expiresAt')::timestamptz;
 hold_seconds:=extract(epoch FROM expiry_at-clock_timestamp())+0.05;
 IF hold_seconds<=0 OR hold_seconds>15.05 THEN RAISE EXCEPTION 'reopening_expiry_fixture_hold_invalid'; END IF;
 PERFORM pg_sleep(hold_seconds);
 -- This is still valid immediately before COMMIT. Only the shorter reviewed
 -- authority has expired; the locator/session check must not mask the defect.
 PERFORM app_private.assert_financial_reset_hosted_actor_context(f.binding,'reopen');
END;
$open_then_hold$;

-- Expected sole error:
-- financial_reset_reopening_no_backup_authority_expired_before_commit (42501).
\set ON_ERROR_STOP off
COMMIT;
\set reopening_expiry_failed :ERROR
\set reopening_expiry_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
\if :reopening_expiry_failed
\else
\echo 'FAIL: the expired authority unexpectedly committed an opening.'
\quit 3
\endif
SELECT :'reopening_expiry_sqlstate'='42501' AS reopening_expiry_expected_error \gset
\if :reopening_expiry_expected_error
\else
\echo 'FAIL: the opening transaction failed for an unexpected reason.'
\quit 3
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $verify_rollback$
DECLARE f record; a app_private.financial_reset_actor_authorizations%ROWTYPE;
BEGIN
 SELECT * INTO STRICT f FROM pg_temp.reopening_expiry_fixture;
 SELECT * INTO STRICT a FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=f.authorization_id;
 IF a.consumed_at IS NOT NULL OR a.backend_pid IS NOT NULL OR a.transaction_id IS NOT NULL
  OR a.expires_at<=clock_timestamp() OR a.credential_expires_at<=clock_timestamp()
  OR app_private.financial_reset_actor_is_current(a.organization_id,a.actor_id,a.session_id) IS DISTINCT FROM true
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts WHERE operation_id=a.operation_id)
  OR EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_context WHERE operation_id=a.operation_id)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=a.organization_id AND status='frozen'
   AND generation=(f.binding->'reopening'->>'generation')::integer AND financial_start_date=(f.binding->>'cutoff')::date)
  OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=a.operation_id
   AND checkpoint_sha256=f.binding->'reopening'->>'checkpoint_sha256') THEN
  RAISE EXCEPTION 'reopening_expiry_fixture_rollback_unproven';
 END IF;
END;
$verify_rollback$;
SELECT jsonb_build_object('proof','synthetic-held-reopening-authority-expiry-v1','commitSqlstate','42501',
 'controlFrozen',true,'openingReceiptCount',0,'actorStillCurrent',true,'authorizationConsumed',false,'mutationRetried',false);
COMMIT;
