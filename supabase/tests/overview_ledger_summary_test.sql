BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE overview_state AS SELECT
  gen_random_uuid() org, gen_random_uuid() other_org,
  gen_random_uuid() actor, gen_random_uuid() denied_actor, gen_random_uuid() admin,
  gen_random_uuid() role_id, gen_random_uuid() branch_a, gen_random_uuid() branch_b;
GRANT SELECT ON overview_state TO authenticated;
INSERT INTO auth.users(id, email)
SELECT actor, actor || '@overview.test' FROM overview_state UNION ALL
SELECT denied_actor, denied_actor || '@overview.test' FROM overview_state UNION ALL
SELECT admin, admin || '@overview.test' FROM overview_state;
INSERT INTO public.organizations(id, name, slug)
SELECT org, 'Overview summary', 'overview-' || org FROM overview_state UNION ALL
SELECT other_org, 'Other overview', 'overview-' || other_org FROM overview_state;
INSERT INTO public.organization_branches(id, organization_id, name, code, status)
SELECT branch_a, org, 'A', 'A', 'active' FROM overview_state UNION ALL
SELECT branch_b, org, 'B', 'B', 'active' FROM overview_state;
INSERT INTO public.organization_roles(id, organization_id, name, status)
SELECT role_id, org, 'Overview finance reader', 'active' FROM overview_state;
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key)
SELECT org, role_id, 'finance.view' FROM overview_state;
INSERT INTO public.organization_members(organization_id, user_id, role, branch_id, custom_role_id)
SELECT org, actor, 'custom', branch_a, role_id FROM overview_state UNION ALL
SELECT org, admin, 'super_admin', NULL, NULL FROM overview_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = (SELECT org FROM overview_state);

CREATE TEMP TABLE overview_properties AS SELECT kind, gen_random_uuid() property_id,
  CASE WHEN kind = 'other_org' THEN other_org ELSE org END organization_id,
  CASE WHEN kind = 'hidden' THEN branch_b WHEN kind = 'other_org' THEN NULL ELSE branch_a END branch_id
FROM overview_state CROSS JOIN unnest(ARRAY['primary', 'sibling', 'hidden', 'other_org']) kind;
GRANT SELECT ON overview_properties TO authenticated;
-- Rollback-only synthetic read fixture. Keep FK/check constraints while
-- bypassing unrelated posting hooks; all assertions run against real RLS/RPCs.
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id, organization_id, branch_id, code, name, property_type, rental_structure)
SELECT property_id, organization_id, branch_id, upper(kind), 'House ' || kind, 'apartment', 'multi_unit'
FROM overview_properties;
ALTER TABLE public.properties ENABLE TRIGGER USER;

ALTER TABLE public.ledger_entries DISABLE TRIGGER USER;
INSERT INTO public.ledger_entries(organization_id, property_id, transaction_date, direction, category, amount)
SELECT p.organization_id, p.property_id, DATE '2026-10-15', direction, 'overview fixture',
  CASE WHEN direction = 'income' THEN 0.10 ELSE 0.01 END
FROM overview_properties p CROSS JOIN generate_series(1, 1005) n
CROSS JOIN unnest(ARRAY['income', 'expense']) direction WHERE p.kind = 'primary';
INSERT INTO public.ledger_entries(organization_id, property_id, transaction_date, direction, category, amount, archived_at)
SELECT p.organization_id, p.property_id, rows.transaction_date, rows.direction, 'overview fixture', rows.amount,
  CASE WHEN rows.archived THEN now() ELSE NULL END
FROM overview_properties p CROSS JOIN (VALUES
  (DATE '2020-01-01', 'income', 2::numeric, false),
  (DATE '2026-09-15', 'expense', 1000::numeric, false),
  (DATE '2026-09-14', 'expense', 1200::numeric, false),
  (DATE '2026-10-16', 'expense', 1300::numeric, false),
  (DATE '2026-10-15', 'expense', 1100::numeric, false),
  (DATE '2026-10-15', 'expense', 999.99::numeric, false),
  (DATE '2026-11-01', 'income', 7::numeric, false),
  (DATE '2026-10-15', 'income', 9000::numeric, true)
) rows(transaction_date, direction, amount, archived) WHERE p.kind = 'primary';
INSERT INTO public.ledger_entries(organization_id, property_id, transaction_date, direction, category, amount,
  source_type, source_id, reversal_of_ledger_entry_id)
SELECT p.organization_id, p.property_id, DATE '2026-10-15', 'income', 'overview reversal', -0.10,
  'receipt_allocation', gen_random_uuid(),
  (SELECT id FROM public.ledger_entries original WHERE original.property_id = p.property_id
    AND original.direction = 'income' AND original.amount = 0.10 ORDER BY id LIMIT 1)
FROM overview_properties p WHERE p.kind = 'primary';
INSERT INTO public.ledger_entries(organization_id, property_id, transaction_date, direction, category, amount)
SELECT organization_id, property_id, DATE '2026-10-15', 'income', 'overview fixture',
  CASE kind WHEN 'sibling' THEN 50 WHEN 'hidden' THEN 7000 ELSE 8000 END
FROM overview_properties WHERE kind <> 'primary';
ALTER TABLE public.ledger_entries ENABLE TRIGGER USER;

SELECT ok(NOT p.prosecdef, 'summary uses caller RLS rather than definer privileges')
FROM pg_proc p WHERE p.oid = 'public.get_overview_ledger_summary(uuid,date,date,date,date,numeric,uuid,date)'::regprocedure;
SELECT ok(NOT has_function_privilege('anon', 'public.get_overview_ledger_summary(uuid,date,date,date,date,numeric,uuid,date)', 'EXECUTE'),
  'anonymous callers cannot execute overview summary');
SELECT ok(has_function_privilege('authenticated', 'public.get_overview_ledger_summary(uuid,date,date,date,date,numeric,uuid,date)', 'EXECUTE'),
  'authenticated callers can execute the RLS-scoped summary');

SELECT set_config('request.jwt.claim.sub', (SELECT actor::text FROM overview_state), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE overview_result AS
SELECT public.get_overview_ledger_summary(org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000) value
FROM overview_state;
SELECT is((value->>'ledger_entry_count')::integer, 2019,
  'exact count includes more than the API row cap, old history and future entries, without archives or hidden scopes') FROM overview_result;
SELECT is((value->>'large_recent_expense_count')::integer, 2,
  'expense review includes the lower date and threshold but excludes the upper business-date bound') FROM overview_result;
SELECT is(jsonb_array_length(value->'months'), 3,
  'only three monthly direction groups leave the database for over two thousand ledger rows') FROM overview_result;
SELECT is((entry->>'amount')::numeric, 150.40::numeric,
  'October income includes the sibling property and subtracts the negative receipt reversal')
FROM overview_result, LATERAL jsonb_array_elements(value->'months') entry
WHERE entry->>'transaction_date' = '2026-10-01' AND entry->>'direction' = 'income';
SELECT is((entry->>'amount')::numeric, 3410.04::numeric,
  'October expense preserves exact cents for every row beyond the API cap')
FROM overview_result, LATERAL jsonb_array_elements(value->'months') entry
WHERE entry->>'transaction_date' = '2026-10-01' AND entry->>'direction' = 'expense';
SELECT is((entry->>'amount')::numeric, 2200::numeric,
  'September chart includes the full month independently of the expense-alert cutoff')
FROM overview_result, LATERAL jsonb_array_elements(value->'months') entry
WHERE entry->>'transaction_date' = '2026-09-01';
SELECT ok(NOT EXISTS(SELECT 1 FROM overview_result, LATERAL jsonb_array_elements(value->'months') entry
  WHERE entry->>'currency' <> 'USD' OR entry->>'transaction_date' NOT IN ('2026-09-01', '2026-10-01')),
  'monthly groups retain currency and exclude dates outside the requested chart window');

CREATE TEMP TABLE overview_property_result AS
SELECT public.get_overview_ledger_summary(s.org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000,
  p_property_id => p.property_id) value
FROM overview_state s CROSS JOIN overview_properties p WHERE p.kind = 'primary';
SELECT is((value->>'ledger_entry_count')::integer, 2018, 'selected property applies to exact counts') FROM overview_property_result;
SELECT is((entry->>'amount')::numeric, 100.40::numeric, 'selected property applies before monthly aggregation')
FROM overview_property_result, LATERAL jsonb_array_elements(value->'months') entry
WHERE entry->>'transaction_date' = '2026-10-01' AND entry->>'direction' = 'income';

CREATE TEMP TABLE overview_reset_result AS
SELECT public.get_overview_ledger_summary(s.org, '2026-10-15', '2026-11-01', '2026-10-15', '2026-10-16', 1000,
  p_financial_start_date => '2026-10-15') value FROM overview_state s;
SELECT is((value->>'ledger_entry_count')::integer, 2016, 'financial-start cutoff removes old history from the exact setup count') FROM overview_reset_result;
SELECT is((value->>'large_recent_expense_count')::integer, 1, 'financial-start cutoff also limits the operating alert') FROM overview_reset_result;
SELECT is(jsonb_array_length(value->'months'), 2, 'a mid-month reset returns only the partial month with no earlier activity') FROM overview_reset_result;
SELECT is((entry->>'amount')::numeric, 150.40::numeric, 'partial-month income remains exact after the reset cutoff')
FROM overview_reset_result, LATERAL jsonb_array_elements(value->'months') entry WHERE entry->>'direction' = 'income';

CREATE TEMP TABLE overview_empty_window AS
SELECT public.get_overview_ledger_summary(org, '2025-01-01', '2025-02-01', '2026-09-15', '2026-10-16', 1000) value FROM overview_state;
SELECT is(value->'months', '[]'::jsonb, 'an empty selected month does not invent chart activity') FROM overview_empty_window;
SELECT is((value->>'large_recent_expense_count')::integer, 2, 'operating alerts still follow business today when viewing an old month') FROM overview_empty_window;
SELECT is((value->>'ledger_entry_count')::integer, 2019, 'setup count does not depend on selected chart month') FROM overview_empty_window;

SELECT is(public.get_overview_ledger_summary(s.org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000,
  p_property_id => p.property_id), '{"ledger_entry_count":0,"large_recent_expense_count":0,"months":[]}'::jsonb,
  'an explicit hidden-branch property cannot reveal amounts or counts')
FROM overview_state s CROSS JOIN overview_properties p WHERE p.kind = 'hidden';
SELECT is(public.get_overview_ledger_summary(other_org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000),
  '{"ledger_entry_count":0,"large_recent_expense_count":0,"months":[]}'::jsonb,
  'an explicit foreign organization cannot reveal amounts or counts') FROM overview_state;
SELECT set_config('app.finance_branch_authority_context', (SELECT branch_b::text FROM overview_state), true);
SELECT is(public.get_overview_ledger_summary(org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000),
  (SELECT value FROM overview_result), 'a forged client branch setting cannot widen the summary') FROM overview_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT denied_actor::text FROM overview_state), true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_overview_ledger_summary(org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000),
  '{"ledger_entry_count":0,"large_recent_expense_count":0,"months":[]}'::jsonb,
  'an authenticated actor with no membership sees no ledger information') FROM overview_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT admin::text FROM overview_state), true);
SET LOCAL ROLE authenticated;
SELECT is((public.get_overview_ledger_summary(org, '2026-05-01', '2026-11-01', '2026-09-15', '2026-10-16', 1000)->>'ledger_entry_count')::integer,
  2020, 'the organization administrator retains both branches without leaking the foreign company') FROM overview_state;
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
