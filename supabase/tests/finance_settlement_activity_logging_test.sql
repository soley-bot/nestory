BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname IN (
        'record_finance_receipt',
        'record_finance_payment',
        'reverse_finance_receipt',
        'reverse_finance_payment'
      )
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) IN (
        'p_organization_id uuid, p_income_item_id uuid, p_amount numeric, p_received_date date, p_reference text',
        'p_organization_id uuid, p_expense_item_id uuid, p_amount numeric, p_paid_date date, p_reference text',
        'p_organization_id uuid, p_receipt_id uuid, p_reversal_date date, p_reference text',
        'p_organization_id uuid, p_payment_id uuid, p_reversal_date date, p_reference text'
      )
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, public']
  ),
  4::bigint,
  'settlement implementations preserve signatures, definer authorization, and fixed search paths'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

INSERT INTO public.finance_income_items (
  id,
  organization_id,
  property_id,
  income_type,
  payer_label,
  due_date,
  amount_due,
  amount_received,
  currency,
  status,
  created_by,
  updated_by
)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'rent',
  'Settlement audit tenant',
  '2026-07-23',
  1000,
  0,
  'USD',
  'open',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.finance_expense_items (
  id,
  organization_id,
  property_id,
  expense_type,
  vendor_label,
  invoice_date,
  amount,
  currency,
  category,
  status,
  economic_scope,
  owner_bill_status,
  owner_reimbursable_amount,
  owner_reimbursed_amount,
  company_loss_amount,
  created_by,
  updated_by
)
VALUES (
  'f2000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'maintenance',
  'Settlement audit vendor',
  '2026-07-23',
  500,
  'USD',
  'Repair',
  'approved',
  'property_expense',
  'not_billable',
  0,
  0,
  0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

CREATE TEMP TABLE finance_settlement_activity_state (
  receipt_id uuid,
  payment_id uuid
) ON COMMIT DROP;

INSERT INTO finance_settlement_activity_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON finance_settlement_activity_state TO authenticated;

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$UPDATE finance_settlement_activity_state
    SET receipt_id = public.record_finance_receipt(
      '00000000-0000-0000-0000-000000000001',
      'f1000000-0000-0000-0000-000000000001',
      250,
      '2026-07-23',
      'SETTLEMENT-AUDIT-RECEIPT'
    )$$,
  'recording a receipt succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_recorded'
  ),
  1::bigint,
  'receipt recording creates exactly one activity entry'
);

SELECT ok(
  (
    SELECT actor_id = '00000000-0000-0000-0000-000000000101'
      AND organization_id = '00000000-0000-0000-0000-000000000001'
      AND NOT (previous_values ?| ARRAY[
        'actor_id', 'organization_id', 'reference', 'created_by', 'updated_by'
      ])
      AND NOT (new_values ?| ARRAY[
        'actor_id', 'organization_id', 'reference', 'created_by', 'updated_by'
      ])
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_recorded'
  ),
  'receipt activity is scoped to the operational item and excludes sensitive audit fields'
);

SELECT is(
  (
    SELECT previous_values
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_recorded'
  ),
  jsonb_build_object(
    'income_type', 'rent',
    'payer_label', 'Settlement audit tenant',
    'amount_received', 0,
    'received_date', NULL,
    'status', 'open'
  ),
  'receipt activity preserves the previous compatibility state'
);

SELECT is(
  (
    SELECT new_values
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_recorded'
  ),
  jsonb_build_object(
    'income_type', 'rent',
    'payer_label', 'Settlement audit tenant',
    'amount_received', 250,
    'received_date', '2026-07-23'::date,
    'status', 'partially_received',
    'receipt_amount', 250,
    'receipt_date', '2026-07-23'::date
  ),
  'receipt activity preserves the new compatibility state and settlement amount'
);

SELECT lives_ok(
  $$UPDATE finance_settlement_activity_state
    SET payment_id = public.record_finance_payment(
      '00000000-0000-0000-0000-000000000001',
      'f2000000-0000-0000-0000-000000000001',
      200,
      '2026-07-23',
      'SETTLEMENT-AUDIT-PAYMENT'
    )$$,
  'recording a payment succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_recorded'
  ),
  1::bigint,
  'payment recording creates exactly one activity entry'
);

SELECT ok(
  (
    SELECT actor_id = '00000000-0000-0000-0000-000000000101'
      AND organization_id = '00000000-0000-0000-0000-000000000001'
      AND NOT (previous_values ?| ARRAY[
        'actor_id', 'organization_id', 'reference', 'created_by', 'updated_by'
      ])
      AND NOT (new_values ?| ARRAY[
        'actor_id', 'organization_id', 'reference', 'created_by', 'updated_by'
      ])
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_recorded'
  ),
  'payment activity is scoped to the operational item and excludes sensitive audit fields'
);

SELECT is(
  (
    SELECT previous_values
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_recorded'
  ),
  jsonb_build_object(
    'expense_type', 'maintenance',
    'vendor_label', 'Settlement audit vendor',
    'amount_paid', 0,
    'paid_date', NULL,
    'status', 'approved'
  ),
  'payment activity preserves the previous compatibility state'
);

SELECT is(
  (
    SELECT new_values
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_recorded'
  ),
  jsonb_build_object(
    'expense_type', 'maintenance',
    'vendor_label', 'Settlement audit vendor',
    'amount_paid', 200,
    'paid_date', NULL,
    'status', 'approved',
    'payment_amount', 200,
    'payment_date', '2026-07-23'::date
  ),
  'payment activity preserves the new compatibility state and settlement amount'
);

SELECT lives_ok(
  $$SELECT public.reverse_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    (SELECT receipt_id FROM finance_settlement_activity_state),
    '2026-07-24',
    'SETTLEMENT-AUDIT-RECEIPT-REVERSAL'
  )$$,
  'reversing the receipt succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_reversed'
  ),
  1::bigint,
  'receipt reversal creates exactly one activity entry'
);

SELECT ok(
  (
    SELECT previous_values = jsonb_build_object(
        'income_type', 'rent',
        'payer_label', 'Settlement audit tenant',
        'amount_received', 250,
        'received_date', '2026-07-23'::date,
        'status', 'partially_received'
      )
      AND new_values = jsonb_build_object(
        'income_type', 'rent',
        'payer_label', 'Settlement audit tenant',
        'amount_received', 0,
        'received_date', NULL,
        'status', 'open',
        'reversal_amount', 250,
        'reversal_date', '2026-07-24'::date
      )
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action = 'receipt_reversed'
  ),
  'receipt reversal records exact safe before and new values'
);

SELECT throws_ok(
  $$SELECT public.reverse_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    (SELECT receipt_id FROM finance_settlement_activity_state),
    '2026-07-25',
    'SETTLEMENT-AUDIT-RECEIPT-RETRY'
  )$$,
  '22023',
  'Finance receipt is already reversed',
  'retrying the same receipt reversal is rejected'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
      AND action IN ('receipt_recorded', 'receipt_reversed')
  ),
  2::bigint,
  'a rejected receipt reversal retry does not duplicate activity'
);

SELECT lives_ok(
  $$SELECT public.reverse_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    (SELECT payment_id FROM finance_settlement_activity_state),
    '2026-07-24',
    'SETTLEMENT-AUDIT-PAYMENT-REVERSAL'
  )$$,
  'reversing the payment succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_reversed'
  ),
  1::bigint,
  'payment reversal creates exactly one activity entry'
);

SELECT ok(
  (
    SELECT previous_values = jsonb_build_object(
        'expense_type', 'maintenance',
        'vendor_label', 'Settlement audit vendor',
        'amount_paid', 200,
        'paid_date', NULL,
        'status', 'approved'
      )
      AND new_values = jsonb_build_object(
        'expense_type', 'maintenance',
        'vendor_label', 'Settlement audit vendor',
        'amount_paid', 0,
        'paid_date', NULL,
        'status', 'approved',
        'reversal_amount', 200,
        'reversal_date', '2026-07-24'::date
      )
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action = 'payment_reversed'
  ),
  'payment reversal records exact safe before and new values'
);

SELECT throws_ok(
  $$SELECT public.reverse_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    (SELECT payment_id FROM finance_settlement_activity_state),
    '2026-07-25',
    'SETTLEMENT-AUDIT-PAYMENT-RETRY'
  )$$,
  '22023',
  'Finance payment is already reversed',
  'retrying the same payment reversal is rejected'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
      AND action IN ('payment_recorded', 'payment_reversed')
  ),
  2::bigint,
  'a rejected payment reversal retry does not duplicate activity'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);

SELECT throws_ok(
  $$SELECT public.record_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    25,
    '2026-07-25',
    'UNAUTHORIZED-RECEIPT'
  )$$,
  '42501',
  'Not authorized',
  'another organization administrator cannot record a receipt'
);

SELECT throws_ok(
  $$SELECT public.record_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    'f2000000-0000-0000-0000-000000000001',
    25,
    '2026-07-25',
    'UNAUTHORIZED-PAYMENT'
  )$$,
  '42501',
  'Not authorized',
  'another organization administrator cannot record a payment'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE (
      entity_type = 'finance_income_item'
      AND entity_id = 'f1000000-0000-0000-0000-000000000001'
    ) OR (
      entity_type = 'finance_expense_item'
      AND entity_id = 'f2000000-0000-0000-0000-000000000001'
    )
  ),
  4::bigint,
  'unauthorized settlement attempts do not create activity'
);

SELECT * FROM finish();

ROLLBACK;
