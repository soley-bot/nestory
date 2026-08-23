BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

SET LOCAL session_replication_role = replica;

INSERT INTO public.finance_categories (
  id, organization_id, namespace, code, display_label, reporting_group,
  sort_order, is_default, created_by
) VALUES
  (
    'ca100000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'tenant_billing', 'custom_parking_authority', 'Parking permit',
    'parking', 500, false, '00000000-0000-0000-0000-000000000101'
  ),
  (
    'ca100000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'owner_expense', 'custom_grounds_authority', 'Grounds service',
    'maintenance', 500, false, '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.tenant_invoices (
  id, organization_id, invoice_number, property_id, unit_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, occupant_labels, currency, total_amount, lifecycle,
  created_by
) VALUES (
  'ca200000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', 'TEN-CAT-203101-0001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '109df57b-7fb0-439a-b89c-0a1868132534',
  '1339ed4b-9ba7-47a7-84a1-32cf0bfc16ef',
  '2031-01-01', '2031-01-31', '2031-01-05', '2031-01-10',
  'through_ips', 'individual',
  '80000000-0000-0000-0000-000000000001', 'Tenant One',
  ARRAY['Tenant One'], 'USD', 240, 'issued',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.tenant_invoice_lines (
  id, organization_id, invoice_id, income_item_id, line_type,
  customer_label, description, amount, internal_cost_amount,
  internal_markup_amount, sort_order, created_by, property_id, unit_id,
  currency, recognized_on, finance_category_id
) VALUES
  (
    'ca300000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'ca200000-0000-0000-0000-000000000001',
    'ca400000-0000-0000-0000-000000000001',
    'other', 'Parking permit', 'Tenant parking permit', 120, NULL, 0, 1,
    '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'USD', '2031-01-05',
    'ca100000-0000-0000-0000-000000000001'
  ),
  (
    'ca300000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'ca200000-0000-0000-0000-000000000001',
    'ca400000-0000-0000-0000-000000000003',
    'rent', 'Rent', 'Historical rent without category identity', 120,
    NULL, 0, 2, '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'USD', '2031-01-06', NULL
  );

INSERT INTO public.tenant_invoice_lines (
  id, organization_id, invoice_id, income_item_id, line_type,
  customer_label, description, amount, internal_cost_amount,
  internal_markup_amount, sort_order, created_by, property_id, unit_id,
  currency, recognized_on, reversal_of_id, correction_occurrence_id,
  finance_category_id
) VALUES (
  'ca300000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'ca200000-0000-0000-0000-000000000001', NULL,
  'other', 'Parking permit', 'Correction: void parking permit', -120,
  NULL, 0, 3, '00000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 'USD', '2031-01-05',
  'ca300000-0000-0000-0000-000000000001',
  'ca500000-0000-0000-0000-000000000001', NULL
);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, amount, currency, category, status, created_by, updated_by,
  economic_scope, owner_bill_status, owner_reimbursable_amount,
  owner_reimbursed_amount, company_loss_amount
) VALUES (
  'ca600000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'maintenance', 'Grounds vendor', '2031-01-31', 200, 'USD',
  'Grounds service', 'paid',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  'company_advance', 'billed', 200, 0, 0
);

INSERT INTO public.owner_invoices (
  id, organization_id, property_id, owner_person_id, invoice_number,
  billing_period_start, issue_date, due_date, currency, lifecycle,
  idempotency_key, created_by
) VALUES (
  'ca700000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'OWN-CAT-203101-0001', '2031-01-01', '2031-01-31', '2031-02-05',
  'USD', 'issued', 'owner-cat-203101-0001',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.owner_invoice_lines (
  id, organization_id, invoice_id, property_id, source_type, source_id,
  customer_label, description, amount, sort_order, created_by, recognized_on
) VALUES (
  'ca800000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'ca700000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'owner_expense', 'ca900000-0000-0000-0000-000000000001',
  'Grounds service', 'Company-advanced grounds service', 200, 1,
  '00000000-0000-0000-0000-000000000101', '2031-01-31'
);

INSERT INTO public.ips_expense_responsibilities (
  id, organization_id, property_id, finance_expense_item_id,
  responsibility, responsible_person_id, customer_category,
  customer_label, internal_cost_amount, internal_markup_amount,
  customer_total_amount, held_cash_amount, ips_advance_amount,
  tenant_invoice_line_id, owner_invoice_line_id, idempotency_key,
  created_by, updated_by
) VALUES (
  'ca900000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ca600000-0000-0000-0000-000000000001',
  'owner', '80000000-0000-0000-0000-000000000004',
  'custom_grounds_authority', 'Grounds service', 200, 0, 200, 0, 200,
  NULL, 'ca800000-0000-0000-0000-000000000001',
  'owner-pl-category-authority-0001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.expense_customer_adjustments (
  id, organization_id, submission_id, property_id, responsibility_id,
  responsibility, owner_invoice_id, adjustment_date, amount, currency,
  reason, created_by
) VALUES (
  'cab00000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'cab00000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'ca900000-0000-0000-0000-000000000001', 'owner',
  'ca700000-0000-0000-0000-000000000001', '2031-02-01', -200,
  'USD', 'Reverse grounds service',
  '00000000-0000-0000-0000-000000000101'
);

UPDATE public.finance_categories
SET display_label = CASE code
      WHEN 'custom_parking_authority' THEN 'Parking permits'
      ELSE 'Grounds care'
    END,
    archived_at = '2031-02-02 00:00:00+00',
    archived_by = '00000000-0000-0000-0000-000000000101'
WHERE id IN (
  'ca100000-0000-0000-0000-000000000001',
  'ca100000-0000-0000-0000-000000000002'
);

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT to_jsonb(event)->>'contract_version'
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-02-28', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'ca300000-0000-0000-0000-000000000001'
  ),
  'owner_profit_loss_events.v2',
  'the category-aware read authority advertises its additive contract'
);

SELECT results_eq(
  $$
    SELECT
      to_jsonb(event)->>'category_id',
      to_jsonb(event)->>'category_code',
      to_jsonb(event)->>'category_label',
      to_jsonb(event)->>'category_reporting_group'
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-01-31', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'ca300000-0000-0000-0000-000000000001'
  $$,
  $$VALUES (
    'ca100000-0000-0000-0000-000000000001'::text,
    'custom_parking_authority'::text,
    'Parking permits'::text,
    'parking'::text
  )$$,
  'custom tenant income uses stable identity, current label, and tenant reporting group'
);

SELECT results_eq(
  $$
    SELECT
      to_jsonb(event)->>'category_id',
      to_jsonb(event)->>'category_code',
      to_jsonb(event)->>'category_label',
      to_jsonb(event)->>'category_reporting_group',
      reversal_of_id
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-01-31', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'ca300000-0000-0000-0000-000000000002'
  $$,
  $$VALUES (
    'ca100000-0000-0000-0000-000000000001'::text,
    'custom_parking_authority'::text,
    'Parking permits'::text,
    'parking'::text,
    'ca300000-0000-0000-0000-000000000001'::uuid
  )$$,
  'tenant reversal resolves the original category when the reversal row has no category ID'
);

SELECT results_eq(
  $$
    SELECT
      count(DISTINCT to_jsonb(event)->>'category_id'),
      sum(signed_amount)
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-01-31', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id IN (
      'ca300000-0000-0000-0000-000000000001',
      'ca300000-0000-0000-0000-000000000002'
    )
  $$,
  $$VALUES (1::bigint, 0::numeric)$$,
  'tenant correction keeps one category identity and zeroes economics exactly once'
);

SELECT results_eq(
  $$
    SELECT
      to_jsonb(event)->>'category_id',
      to_jsonb(event)->>'category_code',
      to_jsonb(event)->>'category_label',
      to_jsonb(event)->>'category_reporting_group'
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-01-31', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'ca800000-0000-0000-0000-000000000001'
  $$,
  $$VALUES (
    'ca100000-0000-0000-0000-000000000002'::text,
    'custom_grounds_authority'::text,
    'Grounds care'::text,
    'maintenance'::text
  )$$,
  'custom owner expense uses archived catalog identity and current configured label'
);

SELECT results_eq(
  $$
    SELECT
      to_jsonb(event)->>'category_id',
      to_jsonb(event)->>'category_code',
      to_jsonb(event)->>'category_label',
      to_jsonb(event)->>'category_reporting_group',
      recognized_on,
      signed_amount
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-02-01', '2031-02-28', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'cab00000-0000-0000-0000-000000000001'
  $$,
  $$VALUES (
    'ca100000-0000-0000-0000-000000000002'::text,
    'custom_grounds_authority'::text,
    'Grounds care'::text,
    'maintenance'::text,
    '2031-02-01'::date,
    -200::numeric
  )$$,
  'cross-month owner reversal keeps the original archived category authority'
);

SELECT results_eq(
  $$
    SELECT period_start, sum(signed_amount)
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-02-28', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id IN (
      'ca800000-0000-0000-0000-000000000001',
      'cab00000-0000-0000-0000-000000000001'
    )
    GROUP BY period_start
    ORDER BY period_start
  $$,
  $$VALUES
    ('2031-01-01'::date, 200::numeric),
    ('2031-02-01'::date, -200::numeric)
  $$,
  'cross-month category resolution does not alter recognized totals'
);

SELECT results_eq(
  $$
    SELECT
      to_jsonb(event)->>'category_id',
      to_jsonb(event)->>'category_code',
      to_jsonb(event)->>'category_label',
      to_jsonb(event)->>'category_reporting_group'
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2031-01-01', '2031-01-31', NULL, NULL, NULL, 100
    ) AS event
    WHERE source_id = 'ca300000-0000-0000-0000-000000000003'
  $$,
  $$VALUES (NULL::text, 'rent'::text, 'Rent'::text, 'rent'::text)$$,
  'historical tenant rows without category identity keep a meaningful legacy fallback'
);

SELECT ok(
  (
    WITH first_page AS (
      SELECT *
      FROM public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2031-01-01', '2031-02-28', NULL, NULL, NULL, 2
      )
    ), cursor AS (
      SELECT cursor_recognized_on, cursor_source_type, cursor_source_id
      FROM first_page
      ORDER BY cursor_recognized_on DESC, cursor_source_type DESC,
        cursor_source_id DESC
      LIMIT 1
    ), second_page AS (
      SELECT event.*
      FROM cursor
      CROSS JOIN LATERAL public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2031-01-01', '2031-02-28',
        cursor.cursor_recognized_on, cursor.cursor_source_type,
        cursor.cursor_source_id, 100
      ) AS event
    ), paged AS (
      SELECT event_key FROM first_page
      UNION ALL
      SELECT event_key FROM second_page
    ), full_read AS (
      SELECT event_key
      FROM public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2031-01-01', '2031-02-28', NULL, NULL, NULL, 100
      )
    )
    SELECT
      (SELECT count(*) FROM paged) = (SELECT count(*) FROM full_read)
      AND (SELECT count(*) FROM paged) =
        (SELECT count(DISTINCT event_key) FROM paged)
      AND NOT EXISTS (
        SELECT event_key FROM paged EXCEPT SELECT event_key FROM full_read
      )
  ),
  'category enrichment preserves deterministic cursor pagination'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
