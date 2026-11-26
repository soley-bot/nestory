BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

CREATE TEMP TABLE pnl_scope (
  org uuid, pilot boolean, property uuid DEFAULT gen_random_uuid(), unit uuid DEFAULT gen_random_uuid(),
  rent_invoice uuid DEFAULT gen_random_uuid(), service_invoice uuid DEFAULT gen_random_uuid()
);
INSERT INTO pnl_scope(org, pilot) VALUES
  ('752a87b8-bd04-4a45-9cb8-00687af66e73', true), (gen_random_uuid(), false);
GRANT SELECT ON pnl_scope TO authenticated;

SET LOCAL session_replication_role = replica;
INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT org, '9fa30000-0000-4000-8000-000000000001', 'super_admin' FROM pnl_scope;
INSERT INTO public.properties(id, organization_id, name, code, property_type)
SELECT property, org, 'P&L fixture', 'PNL-' || property, 'apartment' FROM pnl_scope;
INSERT INTO public.tenant_invoices(
  id, organization_id, invoice_number, property_id, unit_id, lease_id, billing_term_id,
  billing_period_start, billing_period_end, issue_date, due_date, collection_route,
  recipient_kind, recipient_person_id, recipient_label, total_amount
)
SELECT invoice_id, org, 'TEST-' || invoice_id, property, unit, gen_random_uuid(), gen_random_uuid(),
  '2034-10-01', '2034-10-31', '2034-11-26', '2034-11-26', 'through_ips',
  'individual', gen_random_uuid(), 'Test resident', total
FROM pnl_scope CROSS JOIN LATERAL (VALUES (rent_invoice, 712), (service_invoice, 20)) v(invoice_id, total);
INSERT INTO public.tenant_invoice_lines(
  organization_id, invoice_id, income_item_id, property_id, unit_id, line_type, customer_label,
  amount, sort_order, currency, recognized_on
)
SELECT org, invoice_id, gen_random_uuid(), property, unit, kind, kind, amount, ordinal, 'USD', '2034-11-26'
FROM pnl_scope CROSS JOIN LATERAL (VALUES
  (rent_invoice, 'rent', 700, 1), (rent_invoice, 'utility', 12, 2),
  (service_invoice, 'other', 20, 1)
) v(invoice_id, kind, amount, ordinal);
INSERT INTO public.management_fee_occurrences(
  organization_id, property_id, lease_id, tenant_invoice_id, billing_term_id, fee_date,
  amount, fee_mode, fee_value, settlement_status
)
SELECT org, property, i.lease_id, i.id, i.billing_term_id, '2034-11-26',
  CASE WHEN i.id = rent_invoice THEN 70 ELSE 2 END, 'percentage', 10, 'owner_due'
FROM pnl_scope JOIN public.tenant_invoices i ON i.id IN (rent_invoice, service_invoice);
SET LOCAL session_replication_role = origin;

CREATE TEMP VIEW pnl_months WITH (security_invoker = true) AS
SELECT c.pilot, m.month_start, e.*
FROM pnl_scope c CROSS JOIN (VALUES (date '2034-10-01'), (date '2034-11-01')) m(month_start)
CROSS JOIN LATERAL public.get_report_profit_loss_events_page(c.org, c.property, 'USD', m.month_start,
  (m.month_start + interval '1 month - 1 day')::date, NULL, NULL, NULL, 100, true) e;
GRANT SELECT ON pnl_months TO authenticated;
SELECT set_config('request.jwt.claim.sub', '9fa30000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT results_eq($$
  SELECT economic_class, signed_amount, recognized_on, recognition_basis
  FROM pnl_months WHERE pilot AND month_start = '2034-10-01' ORDER BY economic_class
$$, $$VALUES
  ('owner_expense'::text, 70::numeric, date '2034-10-01', 'management_fee_rent_billing_month'::text),
  ('owner_income', 700, date '2034-10-01', 'rent_billing_month')$$,
  'late-issued rent and its fee are recognized in the Pilot rental month');
SELECT is((SELECT count(*) FROM pnl_months WHERE pilot AND month_start = '2034-10-01'
  AND description LIKE '%posted 2034-11-26%' AND cursor_recognized_on = recognized_on),
  2::bigint, 'each shifted item retains its posting date in its memo and paginates on its P&L date');
SELECT results_eq($$
  SELECT signed_amount, recognized_on FROM pnl_months WHERE pilot AND month_start = '2034-11-01'
  ORDER BY signed_amount$$, $$VALUES (2::numeric, date '2034-11-26'), (12, date '2034-11-26'), (20, date '2034-11-26')$$,
  'November contains the utility, the service and its fee exactly once');
SELECT is((SELECT count(*) FROM pnl_months WHERE NOT pilot AND month_start = '2034-10-01'), 0::bigint,
  'other organizations keep their recognition dates even if rental month is requested');
SELECT is((SELECT count(*) FROM pnl_months WHERE NOT pilot AND month_start = '2034-11-01'
  AND recognized_on = '2034-11-26'), 5::bigint, 'all non-Pilot events remain in November');
SELECT is((SELECT count(*) FROM pnl_scope c CROSS JOIN LATERAL public.get_owner_profit_loss_events_page(
  c.org, c.property, 'USD', '2034-11-01', '2034-11-30', NULL, NULL, NULL, 100) e
  WHERE c.pilot AND e.recognized_on = '2034-11-26'), 5::bigint,
  'transaction activity and statement reconciliation keep the original posting dates');
SELECT results_eq($$
  SELECT first_row.source_type, next_row.source_type FROM pnl_scope c
  CROSS JOIN LATERAL public.get_report_profit_loss_events_page(c.org, c.property, 'USD',
    '2034-10-01', '2034-10-31', NULL, NULL, NULL, 1, true) first_row
  CROSS JOIN LATERAL public.get_report_profit_loss_events_page(c.org, c.property, 'USD',
    '2034-10-01', '2034-10-31', first_row.cursor_recognized_on, first_row.cursor_source_type,
    first_row.cursor_source_id, 1, true) next_row WHERE c.pilot$$,
  $$VALUES ('management_fee_occurrence'::text, 'tenant_invoice_line'::text)$$,
  'a one-row page advances across items sharing the effective rental date');
SELECT ok(NOT has_function_privilege('anon',
  'public.get_report_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer,boolean)', 'execute')
  AND NOT has_function_privilege('service_role',
  'public.get_report_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer,boolean)', 'execute'),
  'the checked report entry point is authenticated only');
SELECT throws_ok($$SELECT e.* FROM pnl_scope c CROSS JOIN LATERAL public.get_report_profit_loss_events_page(
  c.org, c.property, 'USD', '2034-10-01','2034-10-31', NULL, NULL, NULL, 1001, true) e$$,
  '22023', 'Complete bounded recognized-event scope is required', 'the monthly reader validates page bounds');
SELECT set_config('request.jwt.claim.sub', '9fa30000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$SELECT * FROM pnl_months$$, '42501', 'Not authorized',
  'the monthly reader enforces property finance access');
SELECT * FROM finish();
ROLLBACK;
