BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Compatibility fixture rows represent lease-derived automatic rent.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(59);

-- This migration contract creates its own isolated deposit-event history.
DELETE FROM public.lease_deposit_events;

SELECT has_table('public', 'finance_receipts', 'finance_receipts exists');
SELECT has_table('public', 'finance_receipt_allocations', 'receipt allocations exist');
SELECT has_table('public', 'finance_payments', 'finance_payments exists');
SELECT has_table('public', 'finance_payment_allocations', 'payment allocations exist');
SELECT has_table('public', 'lease_deposit_events', 'deposit events exist');

SELECT is(
  (
    SELECT count(DISTINCT table_record.relname)::bigint
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = table_record.relnamespace
    JOIN pg_class AS referenced_table
      ON referenced_table.oid = constraint_record.confrelid
    WHERE schema_record.nspname = 'public'
      AND table_record.relname IN (
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposit_events'
      )
      AND referenced_table.relname = 'organizations'
      AND constraint_record.contype = 'f'
      AND constraint_record.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = table_record.oid
            AND attribute.attname = 'organization_id'
        )
      ]::smallint[]
  ),
  5::bigint,
  'all cash event tables have organization foreign keys'
);

SELECT is(
  (
    SELECT count(DISTINCT table_record.relname)::bigint
    FROM pg_class AS table_record
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname IN (
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposit_events'
      )
      AND table_record.relrowsecurity
  ),
  5::bigint,
  'RLS is enabled on all cash event tables'
);

SELECT policies_are(
  'public',
  'finance_receipts',
  ARRAY['Admins can manage finance receipts', 'Finance roles can read records']
);
SELECT policies_are(
  'public',
  'finance_receipt_allocations',
  ARRAY['Admins can manage finance receipt allocations', 'Finance roles can read records']
);
SELECT policies_are(
  'public',
  'finance_payments',
  ARRAY['Admins can manage finance payments', 'Finance roles can read records']
);
SELECT policies_are(
  'public',
  'finance_payment_allocations',
  ARRAY['Admins can manage finance payment allocations', 'Finance roles can read records']
);
SELECT policies_are(
  'public',
  'lease_deposit_events',
  ARRAY['Admins can manage lease deposit events', 'Finance roles can read records']
);

SELECT is(
  (
    SELECT count(DISTINCT table_record.relname)::bigint
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname IN (
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposit_events'
      )
      AND constraint_record.contype = 'c'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%amount >%'
  ),
  5::bigint,
  'all cash event amounts must be positive'
);

SELECT is(
  (
    SELECT count(DISTINCT table_record.relname)::bigint
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace AS schema_record
      ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname IN (
        'finance_receipt_allocations',
        'finance_payment_allocations'
      )
      AND constraint_record.contype = 'u'
  ),
  2::bigint,
  'allocation event and obligation pairs are unique'
);

SELECT ok(
  (
    SELECT count(*) = 2
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('finance_receipts', 'finance_payments')
      AND column_name = 'amount'
      AND data_type = 'numeric'
      AND numeric_precision = 14
      AND numeric_scale = 2
  )
  AND (
    SELECT count(*) = 3
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('finance_receipts', 'finance_payments', 'lease_deposit_events')
      AND column_name = 'reversal_of_id'
  )
  AND (
    SELECT count(*) = 5
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposit_events'
      )
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'public.lease_deposit_events'::regclass
      AND constraint_record.contype = 'c'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%received%'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%applied%'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%retained%'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%refunded%'
      AND pg_get_constraintdef(constraint_record.oid) LIKE '%reversed%'
  ),
  'event tables preserve exact money, reversal, scope, and deposit event shapes'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'finance_receipts_org_date_idx',
        'finance_payments_org_date_idx',
        'lease_deposit_events_org_date_idx'
      )
  ),
  3::bigint,
  'event tables have organization and business-date indexes'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_receipts', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_receipts', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.finance_receipt_allocations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_payments', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_payment_allocations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.lease_deposit_events', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.finance_receipts', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.finance_payments', 'INSERT'),
  'event and allocation writes are RPC-only for API roles'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT app_private.set_finance_settlement_context(true);

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, income_type, payer_label, due_date,
  received_date, amount_due, amount_received, currency, status, created_by, updated_by
) VALUES (
  'c1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'rent', 'Backfill tenant', '2026-06-01', '2026-06-05', 500, 75, 'USD',
  'partially_received',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT app_private.set_finance_settlement_context(false);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  paid_date, amount, currency, category, status, economic_scope,
  owner_bill_status, owner_reimbursable_amount, owner_reimbursed_amount,
  company_loss_amount, created_by, updated_by
) VALUES (
  'd1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'maintenance', 'Backfill vendor', '2026-06-01', '2026-06-06', 200, 'USD',
  'Repair', 'paid', 'property_expense', 'not_billable', 0, 0, 0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, owner_bill_status,
  owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount,
  created_by, updated_by
) VALUES (
  'b1000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'maintenance', 'Full payment vendor', '2026-07-01', 200, 'USD', 'Repair',
  'approved', 'property_expense', 'not_billable', 0, 0, 0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT app_private.backfill_property_cash_events();

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.finance_receipts AS receipt
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.receipt_id = receipt.id
    WHERE allocation.income_item_id = 'c1000000-0000-0000-0000-000000000001'
      AND allocation.amount = 75
      AND receipt.reference = 'BACKFILL-INCOME-c1000000-0000-0000-0000-000000000001'
  )
  AND EXISTS (
    SELECT 1
    FROM public.finance_payments AS payment
    JOIN public.finance_payment_allocations AS allocation
      ON allocation.payment_id = payment.id
    WHERE allocation.expense_item_id = 'd1000000-0000-0000-0000-000000000001'
      AND allocation.amount = 200
      AND payment.reference = 'BACKFILL-EXPENSE-d1000000-0000-0000-0000-000000000001'
  ),
  'legacy settlement columns backfill deterministic cash events'
);

SELECT app_private.backfill_property_cash_events();

SELECT is(
  (
    SELECT count(*)::bigint
    FROM (
      SELECT receipt.reference
      FROM public.finance_receipts AS receipt
      WHERE receipt.reference = 'BACKFILL-INCOME-c1000000-0000-0000-0000-000000000001'
      UNION ALL
      SELECT payment.reference
      FROM public.finance_payments AS payment
      WHERE payment.reference = 'BACKFILL-EXPENSE-d1000000-0000-0000-0000-000000000001'
    ) AS backfill_events
  ),
  2::bigint,
  'backfill reruns remain unique per obligation target'
);

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, income_type, payer_label, due_date,
  amount_due, amount_received, currency, status, created_by, updated_by
) VALUES (
  'a1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'rent', 'Cash event tenant', '2026-07-01', 500, 0, 'USD', 'open',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, owner_bill_status,
  owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount,
  created_by, updated_by
) VALUES (
  'b1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'maintenance', 'Cash event vendor', '2026-07-01', 200, 'USD', 'Repair',
  'approved', 'property_expense', 'not_billable', 0, 0, 0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

CREATE TEMP TABLE property_cash_event_state (
  initial_income_id uuid,
  reconciliation_source_id uuid
) ON COMMIT DROP;

INSERT INTO property_cash_event_state DEFAULT VALUES;

UPDATE property_cash_event_state
SET reconciliation_source_id =
  public.create_financial_reconciliation_source(
    '00000000-0000-0000-0000-000000000001',
    'CASH-EVENT-TEST',
    'Cash event test bank',
    'bank',
    'property_dedicated',
    'USD',
    '10000000-0000-0000-0000-000000000001',
    '****1006'
  );

GRANT SELECT, INSERT, UPDATE ON property_cash_event_state TO authenticated;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.finance_income_items (
    id, organization_id, property_id, income_type, payer_label, due_date,
    received_date, amount_due, amount_received, currency, status, created_by, updated_by
  ) VALUES (
    'a3000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'rent', 'Direct settled tenant', '2026-07-01', '2026-07-01',
    100, 100, 'USD', 'received',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  )$$,
  '42501',
  NULL,
  'authenticated direct income inserts are denied by table privilege'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_income_items (
    id, organization_id, property_id, income_type, payer_label, due_date,
    amount_due, amount_received, currency, status, created_by, updated_by
  ) VALUES (
    'a3000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'rent', 'Direct open tenant', '2026-07-01',
    100, 0, 'USD', 'open',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  )$$,
  '42501',
  NULL,
  'authenticated zero-cash income inserts are also denied by table privilege'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_expense_items (
    id, organization_id, property_id, expense_type, vendor_label, invoice_date,
    paid_date, amount, currency, category, status, economic_scope,
    owner_bill_status, owner_reimbursable_amount, owner_reimbursed_amount,
    company_loss_amount, created_by, updated_by
  ) VALUES (
    'b3000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'maintenance', 'Direct paid vendor', '2026-07-01', '2026-07-01',
    100, 'USD', 'Repair', 'paid', 'property_expense', 'not_billable', 0, 0, 0,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  )$$,
  '42501',
  NULL,
  'authenticated direct paid expense inserts are denied by table privilege'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_expense_items (
    id, organization_id, property_id, expense_type, vendor_label, invoice_date,
    amount, currency, category, status, economic_scope, owner_bill_status,
    owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount,
    created_by, updated_by
  ) VALUES (
    'b3000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'maintenance', 'Direct draft vendor', '2026-07-01',
    100, 'USD', 'Repair', 'draft', 'property_expense', 'not_billable', 0, 0, 0,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  )$$,
  '42501',
  NULL,
  'authenticated unpaid expense inserts are also denied by table privilege'
);

SELECT lives_ok(
  $$UPDATE property_cash_event_state
    SET initial_income_id = public.create_finance_income_item(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      NULL,
      NULL,
      'other',
      'Initial receipt tenant',
      '2026-07-01',
      300,
      0,
      NULL,
      'Created before cash',
      'INITIAL-RECEIPT'
    )$$,
  'income obligation creates without initial cash'
);

SELECT ok(
  (
    SELECT income.amount_received = 0
      AND income.received_date IS NULL
      AND income.status = 'open'
    FROM public.finance_income_items AS income
    WHERE income.id = (SELECT initial_income_id FROM property_cash_event_state)
  )
  AND (
    SELECT count(*) = 0
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.income_item_id = (
      SELECT initial_income_id FROM property_cash_event_state
    )
  ),
  'new obligations do not synthesize receipt allocations'
);

RESET ROLE;

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.post_finance_income_item(uuid,uuid)',
    'EXECUTE'
  ),
  'the checked compatibility posting wrapper remains available for historical non-rent income'
);

SET LOCAL ROLE authenticated;

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.record_finance_receipt(uuid,uuid,numeric,date,text)',
    'EXECUTE'
  ),
  'the checked legacy receipt wrapper remains available for historical non-rent income'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.reverse_finance_receipt(uuid,uuid,date,text)',
    'EXECUTE'
  ),
  'the checked legacy reversal wrapper remains available for historical non-rent receipts'
);

SELECT ok(
  (
    SELECT status = 'open'
      AND ledger_entry_id IS NULL
      AND amount_received = 0
    FROM public.finance_income_items
    WHERE id = (SELECT initial_income_id FROM property_cash_event_state)
  ),
  'creating an obligation alone leaves cash and Ledger evidence empty'
);

SELECT lives_ok(
  $$SELECT public.record_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    100,
    '2026-07-10',
    (SELECT reconciliation_source_id
     FROM property_cash_event_state),
    'TEST-RECEIPT',
    'property-cash-test-receipt'
  )$$,
  'Plan 05 receipt command records one settlement'
);

SELECT ok(
  (
    SELECT count(*) = 1
      AND bool_and(settlement_contract_version = 'plan05.v1')
      AND bool_and(ledger_entry_id IS NOT NULL)
      AND bool_and(signed_amount = 100)
    FROM public.finance_receipt_allocations
    WHERE income_item_id = 'a1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT count(*) = 1
    FROM public.finance_receipts AS receipt
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.receipt_id = receipt.id
    WHERE allocation.income_item_id = 'a1000000-0000-0000-0000-000000000001'
      AND receipt.reference = 'TEST-RECEIPT'
  )
  AND (
    SELECT count(*) = 1
    FROM public.finance_receipt_allocation_journals AS link
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.id = link.allocation_id
    WHERE allocation.income_item_id =
      'a1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT amount_received = 100 AND status = 'partially_received'
    FROM public.finance_income_items
    WHERE id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'receipt allocation derives compatibility, Ledger, and journal evidence'
);

SELECT lives_ok(
  $$SELECT public.record_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    50,
    '2026-07-10',
    'TEST-PAYMENT'
  )$$,
  'payment RPC records a settlement'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM public.finance_payment_allocations
    WHERE expense_item_id = 'b1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT status = 'approved' AND paid_date IS NULL
    FROM public.finance_expense_items
    WHERE id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'partial payment allocates without falsely marking the expense paid'
);

SELECT lives_ok(
  $$SELECT public.record_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    200,
    '2026-07-11',
    'TEST-PAYMENT-FINAL'
  )$$,
  'payment RPC records the remaining settlement'
);

SELECT ok(
  (
    SELECT status = 'paid'
      AND paid_date = '2026-07-11'
      AND economic_scope = 'property_expense'
      AND owner_reimbursable_amount = 0
      AND owner_reimbursed_amount = 0
      AND company_loss_amount = 0
    FROM public.finance_expense_items
    WHERE id = 'b1000000-0000-0000-0000-000000000002'
  )
  AND (
    SELECT count(*) = 1 AND sum(amount) = 200
    FROM public.finance_payment_allocations
    WHERE expense_item_id = 'b1000000-0000-0000-0000-000000000002'
  ),
  'full payment marks the compatibility row paid without company accounting data'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_receipts (
    organization_id, property_id, received_date, amount, currency, payer_label, reference
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2026-07-10', 1, 'USD', 'Direct writer', 'DIRECT-WRITE'
  )$$,
  '42501',
  'permission denied for table finance_receipts',
  'authenticated callers cannot insert receipt events directly'
);

SELECT throws_ok(
  $$UPDATE public.finance_receipts
    SET amount = amount + 1
    WHERE reference = 'TEST-RECEIPT'$$,
  '42501',
  'permission denied for table finance_receipts',
  'authenticated callers cannot mutate receipt events directly'
);

SELECT throws_ok(
  $$UPDATE public.finance_income_items
    SET amount_received = 499, received_date = '2026-07-10', status = 'received'
    WHERE id = 'a1000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'authenticated callers cannot update income settlement aggregates directly'
);

SELECT throws_ok(
  $$UPDATE public.finance_expense_items
    SET paid_date = '2026-07-10', status = 'paid'
    WHERE id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'authenticated callers cannot update expense settlement aggregates directly'
);

SELECT throws_ok(
  $$SELECT public.set_finance_expense_status(
    'b1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'paid'
  )$$,
  '22023',
  'Use record_finance_payment to settle expenses',
  'legacy paid-status shortcut is rejected'
);

SELECT throws_ok(
  $$SELECT public.record_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    999999,
    '2026-07-10',
    (SELECT reconciliation_source_id
     FROM property_cash_event_state),
    'OVER',
    'property-cash-over-allocation'
  )$$,
  '22023',
  'Receipt allocation exceeds open balance',
  'receipt over-allocation is rejected'
);

SELECT lives_ok(
  $$SELECT public.reverse_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_receipts WHERE reference = 'TEST-RECEIPT'),
    '2026-07-11',
    (SELECT reconciliation_source_id
     FROM property_cash_event_state),
    'REVERSE-TEST-RECEIPT',
    'property-cash-reverse-receipt'
  )$$,
  'receipt reversal RPC records a balancing event'
);

SELECT ok(
  (
    SELECT amount_received = 0 AND status = 'open' AND received_date IS NULL
    FROM public.finance_income_items
    WHERE id = 'a1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT coalesce(sum(
      CASE WHEN receipt.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0) = 0
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_receipts AS receipt ON receipt.id = allocation.receipt_id
    WHERE allocation.income_item_id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'receipt reversal is negative reporting cash and restores income compatibility'
);

SELECT throws_ok(
  $$SELECT public.reverse_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_receipts WHERE reference = 'TEST-RECEIPT'),
    '2026-07-12',
    (SELECT reconciliation_source_id
     FROM property_cash_event_state),
    'DUPLICATE-RECEIPT-REVERSAL',
    'property-cash-duplicate-reversal'
  )$$,
  '22023',
  'Finance receipt is already reversed',
  'a receipt can only be reversed once'
);

SELECT lives_ok(
  $$SELECT public.reverse_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_payments WHERE reference = 'TEST-PAYMENT'),
    '2026-07-11',
    'REVERSE-TEST-PAYMENT'
  )$$,
  'payment reversal RPC records a balancing event'
);

SELECT ok(
  (
    SELECT status = 'approved' AND paid_date IS NULL
    FROM public.finance_expense_items
    WHERE id = 'b1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT coalesce(sum(
      CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0) = 0
    FROM public.finance_payment_allocations AS allocation
    JOIN public.finance_payments AS payment ON payment.id = allocation.payment_id
    WHERE allocation.expense_item_id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'payment reversal is negative reporting cash and restores expense compatibility'
);

SELECT throws_ok(
  $$SELECT public.reverse_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_payments WHERE reference = 'TEST-PAYMENT'),
    '2026-07-12',
    'DUPLICATE-PAYMENT-REVERSAL'
  )$$,
  '22023',
  'Finance payment is already reversed',
  'a payment can only be reversed once'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);

SELECT throws_ok(
  $$SELECT public.record_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    25,
    '2026-07-10',
    (SELECT reconciliation_source_id
     FROM property_cash_event_state),
    'CROSS-ORG',
    'property-cash-cross-org'
  )$$,
  '42501',
  'Not authorized',
  'another organization admin cannot record a receipt'
);

RESET ROLE;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status, created_by, updated_by
) VALUES (
  '10000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000002',
  'Cross-scope property', 'CROSS-ORG', 'Residential', 'active',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000301'
);

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status, created_by, updated_by
) VALUES (
  '10000000-0000-0000-0000-000000000098',
  '00000000-0000-0000-0000-000000000001',
  'Alternate reversal property', 'REV-SCOPE', 'Residential', 'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, income_type, payer_label, due_date,
  amount_due, amount_received, currency, status, created_by, updated_by
) VALUES (
  'a2000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000099',
  'rent', 'Other organization tenant', '2026-07-01', 100, 0, 'USD', 'open',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000301'
);

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, owner_bill_status,
  owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount,
  created_by, updated_by
) VALUES (
  'b2000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000099',
  'maintenance', 'Other organization vendor', '2026-07-01', 100, 'USD',
  'Repair', 'approved', 'property_expense', 'not_billable', 0, 0, 0,
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000301'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_receipts (
    organization_id, property_id, received_date, amount, currency, payer_label, reference
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '2026-07-10', 10, 'USD', 'Cross-scope tenant', 'CROSS-PROPERTY-RECEIPT'
  )$$,
  'finance_receipts_org_property_fkey',
  'receipt organization must match its property'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_payments (
    organization_id, property_id, paid_date, amount, currency, payee_label, reference
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '2026-07-10', 10, 'USD', 'Cross-scope vendor', 'CROSS-PROPERTY-PAYMENT'
  )$$,
  'finance_payments_org_property_fkey',
  'payment organization must match its property'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_receipt_allocations (
    organization_id, receipt_id, income_item_id, amount
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_receipts WHERE reference = 'TEST-RECEIPT'),
    'a2000000-0000-0000-0000-000000000001',
    10
  )$$,
  'finance_receipt_allocations_org_income_item_fkey',
  'receipt allocation organization must match its obligation'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_payment_allocations (
    organization_id, payment_id, expense_item_id, amount
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.finance_payments WHERE reference = 'TEST-PAYMENT'),
    'b2000000-0000-0000-0000-000000000001',
    10
  )$$,
  'finance_payment_allocations_org_expense_item_fkey',
  'payment allocation organization must match its obligation'
);

SELECT throws_matching(
  $$INSERT INTO public.lease_deposit_events (
    organization_id, property_id, lease_deposit_id, event_type,
    event_date, amount, currency, reference
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000099',
    '88000000-0000-0000-0000-000000000001',
    'received', '2026-07-10', 10, 'USD', 'CROSS-DEPOSIT'
  )$$,
  'lease_deposit_events_org_deposit_fkey',
  'deposit event organization must match its deposit record'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_receipts (
    organization_id, property_id, received_date, amount, currency,
    payer_label, reference, reversal_of_id
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000099',
    '2026-07-12', 75, 'USD', 'Cross reversal', 'CROSS-RECEIPT-REVERSAL',
    (SELECT id FROM public.finance_receipts
     WHERE reference = 'BACKFILL-INCOME-c1000000-0000-0000-0000-000000000001')
  )$$,
  'finance_receipts_scope_reversal_fkey',
  'receipt reversal must match original organization property and currency'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_payments (
    organization_id, property_id, paid_date, amount, currency,
    payee_label, reference, reversal_of_id
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000099',
    '2026-07-12', 200, 'USD', 'Cross reversal', 'CROSS-PAYMENT-REVERSAL',
    (SELECT id FROM public.finance_payments
     WHERE reference = 'BACKFILL-EXPENSE-d1000000-0000-0000-0000-000000000001')
  )$$,
  'finance_payments_scope_reversal_fkey',
  'payment reversal must match original organization property and currency'
);

INSERT INTO public.lease_deposit_events (
  id, organization_id, property_id, lease_deposit_id, event_type,
  event_date, amount, currency, reference
)
SELECT
  'e1000000-0000-0000-0000-000000000001',
  deposit.organization_id,
  lease.property_id,
  deposit.id,
  'received',
  '2026-07-10',
  100,
  deposit.currency,
  'DEPOSIT-ORIGINAL'
FROM public.lease_deposits AS deposit
JOIN public.leases AS lease
  ON lease.id = deposit.lease_id
 AND lease.organization_id = deposit.organization_id
WHERE deposit.id = '88000000-0000-0000-0000-000000000001';

SELECT throws_matching(
  $$INSERT INTO public.lease_deposit_events (
    organization_id, property_id, lease_deposit_id, event_type,
    event_date, amount, currency, reference, reversal_of_id
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000098',
    '88000000-0000-0000-0000-000000000001',
    'reversed', '2026-07-12', 100, 'USD', 'CROSS-DEPOSIT-REVERSAL',
    'e1000000-0000-0000-0000-000000000001'
  )$$,
  'lease_deposit_events_scope_reversal_fkey',
  'deposit reversal must match original organization property and currency'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_receipts (
    id, organization_id, property_id, received_date, amount, currency,
    payer_label, reference, reversal_of_id
  ) VALUES (
    'e2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2026-07-12', 10, 'USD', 'Self reversal', 'SELF-REVERSAL',
    'e2000000-0000-0000-0000-000000000001'
  )$$,
  'finance_receipts_not_self_reversal_check',
  'receipt events cannot reverse themselves'
);

SELECT throws_matching(
  $$INSERT INTO public.finance_receipts (
    organization_id, property_id, received_date, amount, currency,
    payer_label, reference, reversal_of_id
  )
  SELECT
    organization_id, property_id, '2026-07-12', amount, currency,
    payer_label, 'REVERSAL-CHAIN', id
  FROM public.finance_receipts
  WHERE reference = 'REVERSE-TEST-RECEIPT'$$,
  'Reversal chains are not allowed',
  'receipt reversal chains are rejected'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.lease_deposit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND reference <> 'DEPOSIT-ORIGINAL'
  ),
  0::bigint,
  'finance settlements do not create deposit events'
);

SELECT * FROM finish();

ROLLBACK;
