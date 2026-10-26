BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.lease_terms'::regclass,'public.lease_billing_terms'::regclass) AND tgname='000_financial_reset_row_action'),2::bigint,'both contract tables enter exact recovery actions before existing guards');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.lease_terms'::regclass,'public.lease_billing_terms'::regclass) AND tgname='zzzz_financial_reset_row_action_complete'),2::bigint,'both contract tables consume completed exact actions after source revisions');
SELECT is((SELECT count(*) FROM app_private.financial_reset_relation_rules WHERE relation_name IN ('public.lease_terms','public.lease_billing_terms') AND NOT archive_remove AND NOT restore_allowed AND cardinality(normalize_columns)=0),2::bigint,'contract rules do not authorize ordinary reset deletion or normalization');
SELECT ok((SELECT prosrc LIKE '%TG_RELID=''public.lease_terms''::regclass AND TG_OP=''UPDATE''%' AND prosrc LIKE '%financial_reset_action_allowed%' FROM pg_proc WHERE oid='app_private.catch_up_lease_rent()'::regprocedure),'catch-up exception is limited to an exact verified predecessor repair');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('app_private.enforce_lease_unit_term_availability()'::regprocedure,'app_private.guard_same_month_lease_term_write()'::regprocedure,'app_private.guard_same_month_billing_override_write()'::regprocedure) AND prosrc LIKE '%financial_reset_action_allowed%'),'normal availability and proration validators have no recovery exemption');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.lease_terms'::regclass,'public.lease_billing_terms'::regclass) AND tgname='financial_report_source_revision' AND tgenabled='O'),2::bigint,'contract recovery still advances report source stamps');
SELECT ok(NOT has_function_privilege('authenticated','app_private.financial_reset_action_allowed(oid,text,jsonb,jsonb)','EXECUTE') AND NOT has_table_privilege('authenticated','app_private.financial_reset_transaction_capabilities','INSERT'),'ordinary actors cannot forge recovery capability');
-- Exact prune/repair behavior requires the post-phase recovery tests and clone
-- executor proof. This file checks that integration retains normal guards.
SELECT * FROM finish();
ROLLBACK;
