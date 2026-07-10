BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT has_table('public', 'finance_receipts', 'finance_receipts exists');
SELECT has_table('public', 'finance_receipt_allocations', 'receipt allocations exist');
SELECT has_table('public', 'finance_payments', 'finance_payments exists');
SELECT has_table('public', 'finance_payment_allocations', 'payment allocations exist');
SELECT has_table('public', 'lease_deposit_events', 'deposit events exist');

SELECT is(
  (
    SELECT count(*)::bigint
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
    SELECT count(*)::bigint
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
  ARRAY['Admins can manage finance receipts']
);
SELECT policies_are(
  'public',
  'finance_receipt_allocations',
  ARRAY['Admins can manage finance receipt allocations']
);
SELECT policies_are(
  'public',
  'finance_payments',
  ARRAY['Admins can manage finance payments']
);
SELECT policies_are(
  'public',
  'finance_payment_allocations',
  ARRAY['Admins can manage finance payment allocations']
);
SELECT policies_are(
  'public',
  'lease_deposit_events',
  ARRAY['Admins can manage lease deposit events']
);

SELECT is(
  (
    SELECT count(*)::bigint
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
    SELECT count(*)::bigint
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

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

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

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.record_finance_income_payment(
    'a1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    100,
    '2026-07-10',
    'TEST-RECEIPT'
  )$$,
  'legacy receipt wrapper records one settlement'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM public.finance_receipt_allocations
    WHERE income_item_id = 'a1000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT amount_received = 100 AND status = 'partially_received'
    FROM public.finance_income_items
    WHERE id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'receipt allocation derives income compatibility columns'
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

SELECT throws_ok(
  $$SELECT public.record_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    999999,
    '2026-07-10',
    'OVER'
  )$$,
  'P0001',
  'Receipt allocation exceeds open balance',
  'receipt over-allocation is rejected'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);

SELECT throws_ok(
  $$SELECT public.record_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    25,
    '2026-07-10',
    'CROSS-ORG'
  )$$,
  '42501',
  'Not authorized',
  'another organization admin cannot record a receipt'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.lease_deposit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'finance settlements do not create deposit events'
);

SELECT * FROM finish();

ROLLBACK;
