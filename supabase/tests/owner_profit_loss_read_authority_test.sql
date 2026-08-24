BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

SELECT has_function(
  'public',
  'get_owner_profit_loss_events_page',
  ARRAY['uuid','uuid','currency_code','date','date','date','text','uuid','integer'],
  'owner P&L exposes one checked cursor authority'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_owner_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_owner_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.get_owner_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'app_private.get_owner_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  ),
  'only authenticated callers can execute the checked public boundary'
);

SELECT ok(
  (
    SELECT
      definition NOT LIKE '%ledger_entries%'
      AND definition NOT LIKE '%finance_receipt%'
      AND definition NOT LIKE '%owner_due_to_ips%'
      AND definition NOT LIKE '%owner_charge_cash_allocations%'
      AND definition LIKE '%responsibility.responsibility = ''tenant''%'
      AND definition LIKE '%line.currency = p_currency%'
    FROM (
      SELECT pg_get_functiondef(
        'app_private.get_owner_profit_loss_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
      ) AS definition
    ) AS authority
  ),
  'the authority excludes Ledger, settlement, balance, and tenant-recharge sources'
);

SET LOCAL session_replication_role = replica;

INSERT INTO public.tenant_invoices (
  id, organization_id, invoice_number, property_id, unit_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, occupant_labels, currency, total_amount, lifecycle,
  created_by
) VALUES
  (
    '91000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 'TEN-PL-203001-0001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '109df57b-7fb0-439a-b89c-0a1868132534',
    '1339ed4b-9ba7-47a7-84a1-32cf0bfc16ef',
    '2030-01-01', '2030-01-31', '2030-01-05', '2030-01-10',
    'through_ips', 'individual',
    '80000000-0000-0000-0000-000000000001', 'Tenant One',
    ARRAY['Tenant One'], 'USD', 1130, 'issued',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001', 'TEN-PL-203003-0001',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004',
    '05a91c9a-8e01-4248-995a-99ad558e34ca',
    'a1f94989-b7be-48e7-bc2b-fcc7686fb670',
    '2030-03-01', '2030-03-31', '2030-01-05', '2030-03-05',
    'direct_to_owner', 'individual',
    '80000000-0000-0000-0000-000000000003', 'Tenant Three',
    ARRAY['Tenant Three'], 'USD', 40, 'issued',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.tenant_invoice_lines (
  id, organization_id, invoice_id, income_item_id, line_type,
  customer_label, description, amount, internal_cost_amount,
  internal_markup_amount, sort_order, created_by, property_id, unit_id,
  currency, recognized_on
) VALUES
  (
    '92000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'rent', 'Rent', 'January rent', 1000, NULL, 0, 1,
    '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'USD', '2030-01-05'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    'other', 'Owner income', 'Property-level key income', 50, NULL, 0, 2,
    '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001', NULL, 'USD', '2030-01-06'
  ),
  (
    '92000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000003',
    'utility', 'Tenant recharge', 'Company cost plus service fee',
    80, 60, 20, 3,
    '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'USD', '2030-01-08'
  ),
  (
    '92000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000005',
    'other', 'Other property income', 'Different property', 40, NULL, 0, 1,
    '00000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004', 'USD', '2030-01-05'
  );

INSERT INTO public.management_fee_occurrences (
  id, organization_id, property_id, lease_id, tenant_invoice_id,
  billing_term_id, fee_date, amount, currency, fee_mode, fee_value,
  settlement_status, created_by
) VALUES (
  '94000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '109df57b-7fb0-439a-b89c-0a1868132534',
  '91000000-0000-0000-0000-000000000001',
  '1339ed4b-9ba7-47a7-84a1-32cf0bfc16ef',
  '2030-01-05', 100, 'USD', 'percentage', 10, 'owner_due',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, amount, currency, category, status, created_by, updated_by,
  economic_scope, owner_bill_status, owner_reimbursable_amount,
  owner_reimbursed_amount, company_loss_amount
) VALUES
  (
    '95000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', NULL,
    'maintenance', 'Roof vendor', '2030-01-31', 200, 'USD',
    'repairs_maintenance', 'paid',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'company_advance', 'billed', 200, 0, 0
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'utilities', 'Utility company', '2030-01-08', 60, 'USD',
    'utility', 'paid',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'company_cost', 'not_billable', 0, 0, 0
  );

INSERT INTO public.owner_invoices (
  id, organization_id, property_id, owner_person_id, invoice_number,
  billing_period_start, issue_date, due_date, currency, lifecycle,
  idempotency_key, created_by
) VALUES (
  '96000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'OWN-PL-203001-0001', '2030-01-01', '2030-01-31', '2030-02-05',
  'USD', 'issued', 'owner-pl-203001-0001',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.owner_invoice_lines (
  id, organization_id, invoice_id, property_id, source_type, source_id,
  customer_label, description, amount, sort_order, created_by, recognized_on
) VALUES (
  '97000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'owner_expense', '98000000-0000-0000-0000-000000000001',
  'Owner repair', 'Company-advanced roof repair', 200, 1,
  '00000000-0000-0000-0000-000000000101', '2030-01-31'
);

INSERT INTO public.ips_expense_responsibilities (
  id, organization_id, property_id, finance_expense_item_id,
  responsibility, responsible_person_id, customer_category,
  customer_label, internal_cost_amount, internal_markup_amount,
  customer_total_amount, held_cash_amount, ips_advance_amount,
  tenant_invoice_line_id, owner_invoice_line_id, idempotency_key,
  created_by, updated_by
) VALUES
  (
    '98000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    'owner', '80000000-0000-0000-0000-000000000004',
    'repairs_maintenance', 'Owner repair', 200, 0, 200, 0, 200,
    NULL, '97000000-0000-0000-0000-000000000001',
    'owner-pl-owner-expense-0001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '98000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000002',
    'tenant', '80000000-0000-0000-0000-000000000001',
    'utility', 'Tenant recharge', 60, 20, 80, 0, 80,
    '92000000-0000-0000-0000-000000000003', NULL,
    'owner-pl-tenant-recharge-0001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT source_type, signed_amount, unit_id, recognition_basis
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    )
    WHERE source_id IN (
      '92000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000001',
      '97000000-0000-0000-0000-000000000001'
    )
    ORDER BY source_type, source_id
  $$,
  $$VALUES
    ('management_fee_occurrence'::text, 100::numeric,
      '20000000-0000-0000-0000-000000000001'::uuid,
      'management_fee_earned_at_invoice_issuance'::text),
    ('owner_invoice_line'::text, 200::numeric, NULL::uuid,
      'owner_responsibility_obligation'::text),
    ('tenant_invoice_line'::text, 1000::numeric,
      '20000000-0000-0000-0000-000000000001'::uuid,
      'tenant_invoice_issued'::text),
    ('tenant_invoice_line'::text, 50::numeric, NULL::uuid,
      'tenant_invoice_issued'::text)
  $$,
  'unpaid income, fee, and owner cost appear once with unit and property scope'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    ) WHERE source_id = '92000000-0000-0000-0000-000000000003'
  ),
  'tenant-recharge company cost and service fee are excluded'
);

SELECT is(
  (SELECT sum(amount) FROM public.tenant_invoice_lines
   WHERE invoice_id = '91000000-0000-0000-0000-000000000001'
     AND reversal_of_id IS NULL),
  1130::numeric,
  'management fee is absent from tenant invoice lines'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    ) WHERE source_id = '92000000-0000-0000-0000-000000000005'
  ),
  'mandatory currency and property filters isolate recognized lines'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, settlement_contract_version, created_by
) VALUES (
  '99000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '2030-01-20', 400, 'USD', 'Partial tenant payment',
  'income_settlement.v1', '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_receipt_allocations (
  id, organization_id, receipt_id, income_item_id, amount, created_by,
  property_id, unit_id, lease_id, payer_label_snapshot, currency,
  received_date, reconciliation_source_id, economic_class,
  obligation_type, income_type_snapshot, signed_amount,
  settlement_contract_version
) VALUES (
  '99000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '99000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001', 400,
  '00000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '109df57b-7fb0-439a-b89c-0a1868132534',
  'Partial tenant payment', 'USD', '2030-01-20',
  '99000000-0000-0000-0000-000000000003',
  'operating_income', 'tenant_invoice_line', 'rent', 400,
  'income_settlement.v1'
);

SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*) FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    ) WHERE source_id = '92000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'partial tenant payment creates no additional income event'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;

INSERT INTO public.tenant_invoice_lines (
  id, organization_id, invoice_id, income_item_id, line_type,
  customer_label, description, amount, internal_cost_amount,
  internal_markup_amount, sort_order, created_by, property_id, unit_id,
  currency, recognized_on, reversal_of_id, correction_occurrence_id
) VALUES (
  '92000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001', NULL,
  'rent', 'Rent reversal', 'Void January rent', -1000, NULL, 0, 4,
  '00000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 'USD', '2030-01-05',
  '92000000-0000-0000-0000-000000000001',
  '9a000000-0000-0000-0000-000000000001'
);

INSERT INTO public.management_fee_occurrences (
  id, organization_id, property_id, lease_id, tenant_invoice_id,
  billing_term_id, fee_date, amount, currency, fee_mode, fee_value,
  settlement_status, created_by, reversal_of_id, correction_occurrence_id
) SELECT
  '94000000-0000-0000-0000-000000000011', organization_id, property_id,
  lease_id, tenant_invoice_id, billing_term_id, fee_date, -amount, currency,
  fee_mode, fee_value, 'reversed', created_by, id,
  '9a000000-0000-0000-0000-000000000001'
FROM public.management_fee_occurrences
WHERE id = '94000000-0000-0000-0000-000000000001';

INSERT INTO public.expense_customer_adjustments (
  id, organization_id, submission_id, property_id, responsibility_id,
  responsibility, owner_invoice_id, adjustment_date, amount, currency,
  reason, created_by
) VALUES (
  '9b000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '9b000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001', 'owner',
  '96000000-0000-0000-0000-000000000001', '2030-02-01', -200,
  'USD', 'Reverse owner repair',
  '00000000-0000-0000-0000-000000000101'
);

SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT economic_class, sum(signed_amount), count(*)
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    )
    WHERE source_id IN (
      '92000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000011',
      '94000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000011'
    )
    GROUP BY economic_class ORDER BY economic_class
  $$,
  $$VALUES
    ('owner_expense'::text, 0::numeric, 2::bigint),
    ('owner_income'::text, 0::numeric, 2::bigint)
  $$,
  'void correction reverses rent and management fee exactly once'
);

SELECT results_eq(
  $$
    SELECT source_type, reversal_source_type, reversal_of_id, recognized_on
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
    )
    WHERE source_id IN (
      '92000000-0000-0000-0000-000000000011',
      '94000000-0000-0000-0000-000000000011'
    ) ORDER BY source_type
  $$,
  $$VALUES
    ('management_fee_occurrence'::text,
      'management_fee_occurrence'::text,
      '94000000-0000-0000-0000-000000000001'::uuid, '2030-01-05'::date),
    ('tenant_invoice_line'::text, 'tenant_invoice_line'::text,
      '92000000-0000-0000-0000-000000000001'::uuid, '2030-01-05'::date)
  $$,
  'signed reversals retain original recognition date and lineage'
);

SELECT results_eq(
  $$
    SELECT recognized_on, signed_amount, unit_id, reversal_source_type,
      reversal_of_id
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-02-01', '2030-02-28', NULL, NULL, NULL, 100
    ) WHERE source_id = '9b000000-0000-0000-0000-000000000001'
  $$,
  $$VALUES ('2030-02-01'::date, -200::numeric, NULL::uuid,
    'owner_invoice_line'::text,
    '97000000-0000-0000-0000-000000000001'::uuid)$$,
  'owner cost adjustment follows recognized_on across month boundaries'
);

SELECT ok(
  (
    WITH first_page AS (
      SELECT * FROM public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 2
      )
    ), cursor AS (
      SELECT cursor_recognized_on, cursor_source_type, cursor_source_id
      FROM first_page
      ORDER BY cursor_recognized_on DESC, cursor_source_type DESC,
        cursor_source_id DESC LIMIT 1
    ), second_page AS (
      SELECT event.* FROM cursor
      CROSS JOIN LATERAL public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2030-01-01', '2030-01-31',
        cursor.cursor_recognized_on, cursor.cursor_source_type,
        cursor.cursor_source_id, 100
      ) AS event
    ), paged AS (
      SELECT event_key FROM first_page
      UNION ALL
      SELECT event_key FROM second_page
    ), full_read AS (
      SELECT event_key FROM public.get_owner_profit_loss_events_page(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
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
  'cursor pagination is complete, ordered, and overlap-free'
);

SELECT is(
  (
    SELECT md5(coalesce(jsonb_agg(to_jsonb(event) ORDER BY
      event.recognized_on, event.source_type, event.source_id)::text, '[]'))
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-02-28', NULL, NULL, NULL, 100
    ) AS event
  ),
  (
    SELECT md5(coalesce(jsonb_agg(to_jsonb(event) ORDER BY
      event.recognized_on, event.source_type, event.source_id)::text, '[]'))
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-02-28', NULL, NULL, NULL, 100
    ) AS event
  ),
  'repeated reads are idempotent'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_owner_profit_loss_events_page(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'USD', '2030-01-01', '2030-01-31', '2030-01-05', NULL, NULL, 100
  )$$,
  '22023', 'Complete bounded recognized-event scope is required',
  'partial cursors fail closed'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_owner_profit_loss_events_page(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 1001
  )$$,
  '22023', 'Complete bounded recognized-event scope is required',
  'unbounded page sizes fail closed'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.get_owner_profit_loss_events_page(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
  )$$,
  '42501', 'Not authorized',
  'roles without finance read authority are denied'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.get_owner_profit_loss_events_page(
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'USD', '2030-01-01', '2030-01-31', NULL, NULL, NULL, 100
  )$$,
  '42501', 'Not authorized',
  'organization scope cannot be crossed'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE owner_pl_close_snapshot AS
SELECT md5(coalesce(jsonb_agg(to_jsonb(event) ORDER BY
  event.recognized_on, event.source_type, event.source_id)::text, '[]')) AS hash
FROM public.get_owner_profit_loss_events_page(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'USD', '2030-01-01', '2030-02-28', NULL, NULL, NULL, 100
) AS event;

INSERT INTO public.owner_close_series (
  id, organization_id, property_id, owner_person_id, currency,
  month_start, state, active_revision_id, current_closed_revision_id,
  created_by, state_changed_by
) VALUES (
  '9c000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004', 'USD', '2030-01-01',
  'closed', '9c000000-0000-0000-0000-000000000002',
  '9c000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

UPDATE public.owner_close_series SET state = 'stale'
WHERE id = '9c000000-0000-0000-0000-000000000001';
UPDATE public.owner_close_series SET state = 'closed'
WHERE id = '9c000000-0000-0000-0000-000000000001';

SET LOCAL session_replication_role = origin;

SELECT is(
  (
    SELECT md5(coalesce(jsonb_agg(to_jsonb(event) ORDER BY
      event.recognized_on, event.source_type, event.source_id)::text, '[]'))
    FROM public.get_owner_profit_loss_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD', '2030-01-01', '2030-02-28', NULL, NULL, NULL, 100
    ) AS event
  ),
  (SELECT hash FROM owner_pl_close_snapshot),
  'closed, reopened-stale, and reclosed state leaves recognition deterministic'
);

SELECT * FROM finish();
ROLLBACK;
