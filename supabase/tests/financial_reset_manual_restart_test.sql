-- Owned-schema-only committed restart variant.
-- Expanded by scripts/run-database-tests.mjs; never run directly.
\set empty_books_single_admin true
\ir financial_reset_empty_books_test.sql
COMMIT;
BEGIN;
\if :empty_month
-- The complete native fixture above has really committed its frozen checkpoint.
-- No customer rows are copied. Session claims below emulate the SQL gateway;
-- genuine HTTP authorization remains a separate production acceptance check.
CREATE TEMP TABLE manual_restart_review AS
 SELECT s.*,c.checkpoint_sha256 FROM empty_books_state s
 JOIN app_private.financial_reset_verification_checkpoints c ON c.operation_id=s.operation;
GRANT SELECT ON manual_restart_review,empty_books_state,empty_books_contract_fixture TO authenticated;
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT org FROM manual_restart_review)),
 'frozen','the committed reset remains frozen before the separate restart');
SELECT throws_ok($$SELECT public.get_pilot_manual_restart_status()$$,'42501','pilot_manual_restart_session_required',
 'a database-owner connection cannot stand in for the signed-in administrator');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET automatic_rent_enabled=false WHERE organization_id=(SELECT org FROM manual_restart_review)$$,
 '42501','automatic_rent_policy_restart_required','the manual policy cannot be changed without the native restart receipt');
SAVEPOINT manual_restart_source_drift;
UPDATE public.person_contacts SET contact_name='Changed before restart' WHERE id=pg_temp.empty_books_id(9007);
SELECT throws_ok($$SELECT app_private.assert_pilot_manual_restart_ready(operation,1,checkpoint_sha256) FROM manual_restart_review$$,
 '40001','pilot_manual_restart_source_changed','a changed preserved contact invalidates the completed baseline');
ROLLBACK TO SAVEPOINT manual_restart_source_drift;
SELECT pg_temp.reset_fixture_claims(reviewer) FROM manual_restart_review;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_pilot_manual_restart_status()$$,'42501','pilot_manual_restart_named_actor_required',
 'another real synthetic administrator cannot replace the reviewed named maker');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims(maker) FROM manual_restart_review;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute'
 WHERE id=(SELECT md5(maker::text||':reset-fixture')::uuid FROM manual_restart_review);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_pilot_manual_restart_status()$$,'42501','pilot_manual_restart_named_actor_required',
 'an expired real synthetic Auth session cannot restart the completed operation');
RESET ROLE;
RESET SESSION AUTHORIZATION;
UPDATE auth.sessions SET not_after=NULL
 WHERE id=(SELECT md5(maker::text||':reset-fixture')::uuid FROM manual_restart_review);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(public.get_pilot_manual_restart_status()->>'status','ready','the genuine-shaped named session sees the committed baseline ready');
SELECT throws_ok($$SELECT public.restart_pilot_manual_billing(operation,2,checkpoint_sha256) FROM manual_restart_review$$,
 '40001','pilot_manual_restart_review_changed','a different generation cannot be reopened');
SELECT throws_ok($$SELECT public.restart_pilot_manual_billing(operation,1,repeat('f',64)) FROM manual_restart_review$$,
 '55000','pilot_manual_restart_completed_checkpoint_required','a changed checkpoint cannot be reopened');
SELECT is((SELECT public.restart_pilot_manual_billing(operation,1,checkpoint_sha256)->>'status' FROM manual_restart_review),
 'open','the named maker opens manual billing from the committed native zero checkpoint');
SELECT is((SELECT public.get_financial_write_context(org)->>'automatic_rent_enabled' FROM manual_restart_review),'false',
 'normal finance context exposes the persistent manual-only policy');
SELECT is((SELECT public.get_financial_report_context(org)->'context' FROM manual_restart_review),
 (SELECT public.get_financial_write_context(org) FROM manual_restart_review),'report and write contexts carry exactly the same policy');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'all native and manual restart deferred guards accept the exact receipt');
SELECT throws_ok($$UPDATE public.person_contacts SET contact_name='Changed after restart guard flush' WHERE id=pg_temp.empty_books_id(9007)$$,
 '23514','pilot_manual_restart_transaction_sealed','flushing constraints cannot reopen the preserved baseline for later writes');
-- Commit while the simulated gateway actor is still current; reset role only
-- after commit. This is a distinct transaction from the native reset above.
COMMIT;
RESET ROLE;
RESET SESSION AUTHORIZATION;
BEGIN;
SELECT is((SELECT count(*) FROM app_private.financial_reset_manual_restart_receipts),1::bigint,
 'one immutable restart receipt survived the separate commit');
SELECT ok((SELECT status='open' AND generation=1 AND financial_start_date='2026-10-01' AND NOT automatic_rent_enabled
 FROM app_private.financial_write_controls WHERE organization_id=(SELECT org FROM manual_restart_review)),
 'normal finance remains open with generation and October cutoff preserved');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET automatic_rent_enabled=true WHERE organization_id=(SELECT org FROM manual_restart_review)$$,
 '42501','automatic_rent_policy_restart_required','ordinary control updates cannot reenable automatic rent');
SELECT throws_ok($$DELETE FROM app_private.financial_reset_manual_restart_receipts$$,
 '23514','financial_reset_evidence_immutable','the restart audit receipt is immutable');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM manual_restart_review)),0::bigint,
 'the restart itself creates no invoice');
SELECT is((SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org),
 'deposits',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.lease_deposits d WHERE organization_id=s.org)) FROM empty_books_state s),
 (SELECT image FROM empty_books_contracts),'committed restart preserves every contract and deposit requirement');
SELECT is((SELECT jsonb_build_object(
 'properties',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.properties p WHERE organization_id=s.org),
 'units',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.units u WHERE organization_id=s.org),
 'people',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.people p WHERE organization_id=s.org)) FROM empty_books_state s),
 (SELECT image FROM empty_books_masters),'committed restart preserves properties, units and people');
SELECT pg_temp.reset_fixture_claims(maker) FROM manual_restart_review;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT is((SELECT app_private.try_current_month_rent(org,pg_temp.empty_books_id(1),'scheduled',now())->>'reason' FROM manual_restart_review),
 'manual_billing','scheduled rent is skipped persistently after reopening');
SELECT is((SELECT app_private.try_current_month_rent(org,pg_temp.empty_books_id(1),'activation_catch_up',now())->>'reason' FROM manual_restart_review),
 'manual_billing','activation catch-up cannot rebuild invoices');
UPDATE public.leases SET status=status WHERE id=pg_temp.empty_books_id(1);
UPDATE public.lease_terms SET status=status WHERE id=pg_temp.empty_books_id(101);
UPDATE public.lease_billing_terms SET management_fee_value=management_fee_value WHERE id=pg_temp.empty_books_id(201);
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM manual_restart_review)),0::bigint,
 'normal lease and billing-rule updates leave automatic invoices empty');
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(pg_temp.empty_books_id(9900),'authenticated','authenticated','restart-finance@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
 VALUES(md5(pg_temp.empty_books_id(9900)::text||':reset-fixture')::uuid,pg_temp.empty_books_id(9900),now(),now(),'aal1');
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT org,pg_temp.empty_books_id(9900),'finance_manager' FROM manual_restart_review;
CREATE TEMP TABLE manual_restart_rent_results(attempt integer PRIMARY KEY,result jsonb);
GRANT SELECT,INSERT ON manual_restart_rent_results TO authenticated;
SELECT is((SELECT count(*) FROM public.rent_generation_exceptions WHERE organization_id=(SELECT org FROM manual_restart_review)),0::bigint,
 'first manual generation starts without a manufactured retry exception');
SELECT pg_temp.reset_fixture_claims(pg_temp.empty_books_id(9900));
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.recover_lease_rent_period(org,pg_temp.empty_books_id(1),'2026-09-01') FROM manual_restart_review$$,
 '42501','Not authorized','ordinary finance users cannot generate historical rent');
SELECT throws_ok($$SELECT public.recover_lease_rent_period(org,pg_temp.empty_books_id(1),'2026-11-01') FROM manual_restart_review$$,
 '42501','Not authorized','ordinary finance users cannot generate future rent');
INSERT INTO manual_restart_rent_results SELECT 1,public.recover_lease_rent_period(org,pg_temp.empty_books_id(1),'2026-10-01') FROM manual_restart_review;
SELECT is((SELECT result->>'status' FROM manual_restart_rent_results WHERE attempt=1),'generated',
 'the first authorized finance request generates canonical rent immediately');
INSERT INTO manual_restart_rent_results SELECT 2,public.recover_lease_rent_period(org,pg_temp.empty_books_id(1),'2026-10-01') FROM manual_restart_review;
SELECT is((SELECT result FROM manual_restart_rent_results WHERE attempt=2),(SELECT result FROM manual_restart_rent_results WHERE attempt=1),
 'a repeated manual request returns the same successful status and invoice ID');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*) FROM public.rent_generation_exceptions WHERE organization_id=(SELECT org FROM manual_restart_review)),0::bigint,
 'successful first generation and replay create no hidden retry exceptions');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM manual_restart_review)),1::bigint,
 'manual current-month generation creates exactly one canonical invoice');
SELECT is((SELECT sum(amount) FROM public.tenant_invoice_lines WHERE organization_id=(SELECT org FROM manual_restart_review) AND line_type='rent'),400::numeric,
 'the canonical rent line uses the retained contract amount');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences WHERE organization_id=(SELECT org FROM manual_restart_review)),0::bigint,
 'manual rent preserves the retained contract setting that disables management fees');
SELECT pg_temp.reset_fixture_claims(maker) FROM manual_restart_review;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is((SELECT public.restart_pilot_manual_billing(operation,1,checkpoint_sha256)->>'status' FROM manual_restart_review),
 'already_open','idempotent restart replay preserves legitimate financial entries after opening');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*) FROM app_private.financial_reset_manual_restart_receipts),1::bigint,'restart replay never creates a second receipt');
SELECT is((SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.financial_month_locks f
 WHERE id IN (SELECT pg_temp.empty_books_id(9501+n*10) FROM generate_series(0,3) n)),
 (SELECT image FROM empty_books_foreign),'all four other organizations remain byte-identical');
\endif
SELECT * FROM finish();
ROLLBACK;
