-- Pure authority/closure regression checks. No business rows, request claims,
-- trigger modes, clock settings or permission memberships are changed here.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE scoped_report_graph(source_name text,target_name text) ON COMMIT DROP;
INSERT INTO scoped_report_graph VALUES
 ('app_private.apply_financial_reset_continuation','app_private.financial_reset_scoped_continuation'),
 ('app_private.apply_financial_reset_reports','app_private.financial_reset_scoped_reports'),
 ('public.get_owner_event_allocation_queue','app_private.financial_reset_scoped_queue'),
 ('app_private.get_owner_event_allocation_queue_baseline','app_private.financial_reset_scoped_queue_baseline'),
 ('public.allocate_owner_event','app_private.financial_reset_scoped_allocate'),
 ('public.allocate_owner_event_branch106','app_private.financial_reset_scoped_allocate_impl'),
 ('public.generate_owner_balance_period','app_private.financial_reset_scoped_period'),
 ('app_private.generate_owner_balance_period','app_private.financial_reset_scoped_period_impl'),
 ('public.get_owner_balance_ledger','app_private.financial_reset_scoped_ledger'),
 ('public.get_owner_close_readiness','app_private.financial_reset_scoped_readiness'),
 ('app_private.build_owner_close_readiness','app_private.financial_reset_scoped_build_readiness'),
 ('app_private.build_owner_close_readiness_before_rent_completeness','app_private.financial_reset_scoped_build_before_rent'),
 ('app_private.build_owner_close_readiness_with_period_20260812','app_private.financial_reset_scoped_build_with_period');
CREATE TEMP TABLE scoped_report_defs AS
 SELECT g.*,p.oid,p.provolatile,p.proconfig,replace(pg_get_functiondef(p.oid),E'\r\n',E'\n') definition
 FROM scoped_report_graph g JOIN pg_namespace n ON n.nspname='app_private'
 JOIN pg_proc p ON p.pronamespace=n.oid AND n.nspname||'.'||p.proname=g.target_name;
SELECT is((SELECT count(*) FROM scoped_report_defs),13::bigint,'every checked function in the nested report graph has one private clone');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs d CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE has_function_privilege(r.name,d.oid,'EXECUTE')),'application roles cannot invoke any private graph clone');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE n.nspname='app_private' AND (p.proname LIKE 'financial_reset_scoped_%' OR p.proname LIKE 'assert_financial_reset_scoped_%')
 AND has_function_privilege(r.name,p.oid,'EXECUTE')),'all scoped assertions and adapters remain private');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs WHERE provolatile<>'v'),
 'scoped readers see current command writes and revalidate live authorization');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs WHERE NOT ('search_path=""'=ANY(proconfig))),
 'every cloned function retains an empty search path');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs WHERE definition LIKE '%auth.uid()%'
 OR definition LIKE '%request.jwt%' OR definition LIKE '%SET ROLE%' OR definition LIKE '%session_replication_role%'),
 'private graph neither borrows request identity nor changes claims, roles or trigger mode');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs d JOIN scoped_report_graph g ON true
 WHERE d.definition LIKE '%'||g.source_name||'(%'),
 'nested report commands never fall back to an authenticated-context function');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_report_defs WHERE definition LIKE '%public.continue_lease_month_to_month(%'
 OR definition LIKE '%create_authoritative_lease_term(%' OR definition LIKE '%catch_up_lease_rent(%'
 OR definition LIKE '%try_current_month_rent(%'),
 'the scoped original-date graph cannot renew a contract or enter legacy catch-up');
SELECT ok((SELECT definition LIKE '%assert_financial_reset_original_invoice_dates(p_operation,v_plan.plan_json)%'
 AND definition LIKE '%financial_reset_original_invoice_contract_required%' FROM scoped_report_defs
 WHERE target_name='app_private.financial_reset_scoped_continuation'),
 'the original-date contract guard and an explicit renewal refusal both remain');
SELECT ok((SELECT definition LIKE '%financial_reset_scoped_queue(p_operation,%' FROM scoped_report_defs
 WHERE target_name='app_private.financial_reset_scoped_build_with_period'),
 'deep close-readiness queue calls carry the operation scope');

-- Every original exception remains in its clone, including all business,
-- idempotency, financial lock and audit-image postcondition failures.
SELECT ok(NOT EXISTS(
 SELECT 1 FROM scoped_report_defs d JOIN pg_proc p ON p.proname=split_part(d.source_name,'.',2)
 JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname=split_part(d.source_name,'.',1)
 CROSS JOIN LATERAL regexp_matches(pg_get_functiondef(p.oid),$re$RAISE EXCEPTION '[^']*'$re$,'g') e
 WHERE strpos(d.definition,e[1])=0), 'clones preserve every original checked-command failure guard');

SELECT is(auth.uid(),NULL::uuid,'test begins without a request actor');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_scoped_phase('fa232317-0000-4000-8000-000000000001','reports')$$,
 '42501','financial_reset_scoped_operator_required','an operation UUID supplies no report authority');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_continuation('fa232317-0000-4000-8000-000000000001')$$,
 '42501','financial_reset_scoped_operator_required','direct continuation clone entry requires consumed session authorization');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_reports('fa232317-0000-4000-8000-000000000001')$$,
 '42501','financial_reset_scoped_operator_required','direct report clone entry requires consumed session authorization');
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_scoped_queue('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003','USD','2026-10-01','2026-10-31')$$,
 '42501','financial_reset_scoped_operator_required','queue clone cannot disclose records from supplied UUIDs');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_allocate('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','management_fee_occurrence','fa232317-0000-4000-8000-000000000003','arbitrary-key')$$,
 '42501','financial_reset_scoped_operator_required','allocation wrapper checks consumed authorization before source resolution');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_period('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003','fa232317-0000-4000-8000-000000000004','USD','2026-10-01','arbitrary-key')$$,
 '42501','financial_reset_scoped_operator_required','period generation cannot acquire scope from supplied keys');
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_scoped_ledger('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003','fa232317-0000-4000-8000-000000000004','USD','2026-10-01','2026-10-01')$$,
 '42501','financial_reset_scoped_operator_required','ledger reader checks scoped authority before querying rows');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_readiness('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003','fa232317-0000-4000-8000-000000000004','USD','2026-10-01')$$,
 '42501','financial_reset_scoped_operator_required','readiness reader checks scoped authority before nested commands');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_rent('fa232317-0000-4000-8000-000000000001',
 'fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003','2026-10-01','2026-10-01','activation_catch_up',
 'fa232317-0000-4000-8000-000000000004','fa232317-0000-4000-8000-000000000005')$$,
 '42501','financial_reset_scoped_operator_required','an explicit actor UUID cannot authorize the scoped rent generator');
SELECT is(auth.uid(),NULL::uuid,'every refused path leaves ordinary identity empty');
SELECT is(app_private.can_read_finance_property('fa232317-0000-4000-8000-000000000002','fa232317-0000-4000-8000-000000000003'),false,
 'ordinary finance permission remains false without an authenticated caller');
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue('fa232317-0000-4000-8000-000000000002',
 'fa232317-0000-4000-8000-000000000003','USD','2026-10-01','2026-10-31')$$,
 '42501','owner_allocation_queue_forbidden','ordinary API still rejects missing request identity');
SELECT * FROM finish();
ROLLBACK;
