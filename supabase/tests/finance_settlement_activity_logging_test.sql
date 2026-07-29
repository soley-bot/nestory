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
  receipt_result jsonb,
  reversal_result jsonb,
  reconciliation_source_id uuid,
  payment_id uuid
) ON COMMIT DROP;

INSERT INTO finance_settlement_activity_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON finance_settlement_activity_state TO authenticated;

UPDATE finance_settlement_activity_state
SET reconciliation_source_id =
  public.create_financial_reconciliation_source(
    '00000000-0000-0000-0000-000000000001',
    'SETTLEMENTAUDIT',
    'Settlement audit bank',
    'bank',
    'property_dedicated',
    'USD',
    '10000000-0000-0000-0000-000000000001',
    '****2309'
  );

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$UPDATE finance_settlement_activity_state
    SET receipt_result = public.record_finance_receipt_v2(
      '00000000-0000-0000-0000-000000000001',
      'f1000000-0000-0000-0000-000000000001',
      250,
      '2026-07-23',
      reconciliation_source_id,
      'SETTLEMENT-AUDIT-RECEIPT',
      'settlement-audit-receipt-v2'
    )$$,
  'recording a receipt succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (receipt_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_recorded'
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
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (receipt_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_recorded'
  ),
  'receipt activity is scoped to the operational item and excludes sensitive audit fields'
);

SELECT is(
  (
    SELECT previous_values
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (receipt_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_recorded'
  ),
  jsonb_build_object(
    'income_item_id', 'f1000000-0000-0000-0000-000000000001',
    'amount_received', 0,
    'received_date', NULL,
    'status', 'open'
  ),
  'receipt activity preserves the previous compatibility state'
);

SELECT ok(
  coalesce((
    SELECT new_values @> jsonb_build_object(
        'receipt_id',
          (SELECT receipt_result->>'receipt_id'
           FROM finance_settlement_activity_state),
        'allocation_id',
          (SELECT receipt_result->>'allocation_id'
           FROM finance_settlement_activity_state),
        'income_item_id', 'f1000000-0000-0000-0000-000000000001',
        'amount', 250,
        'received_date', '2026-07-23'::date,
        'outstanding_balance_after', 750,
        'status', 'partially_received'
      )
      AND new_values ? 'ledger_entry_id'
      AND new_values ? 'journal_entry_ids'
      AND new_values ? 'classification_evidence_hash'
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (receipt_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_recorded'
  ), false),
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
  $$UPDATE finance_settlement_activity_state
    SET reversal_result = public.reverse_finance_receipt_v2(
      '00000000-0000-0000-0000-000000000001',
      (receipt_result->>'receipt_id')::uuid,
      '2026-07-24',
      reconciliation_source_id,
      'SETTLEMENT-AUDIT-RECEIPT-REVERSAL',
      'settlement-audit-reversal-v2'
    )$$,
  'reversing the receipt succeeds'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (reversal_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_reversed'
  ),
  1::bigint,
  'receipt reversal creates exactly one activity entry'
);

SELECT ok(
  coalesce((
    SELECT previous_values = jsonb_build_object(
        'receipt_id',
          (SELECT receipt_result->>'receipt_id'
           FROM finance_settlement_activity_state),
        'allocation_id',
          (SELECT receipt_result->>'allocation_id'
           FROM finance_settlement_activity_state),
        'amount_received', 250,
        'status', 'partially_received'
      )
      AND new_values @> jsonb_build_object(
        'receipt_id',
          (SELECT reversal_result->>'receipt_id'
           FROM finance_settlement_activity_state),
        'allocation_id',
          (SELECT reversal_result->>'allocation_id'
           FROM finance_settlement_activity_state),
        'reversal_of_allocation_id',
          (SELECT receipt_result->>'allocation_id'
           FROM finance_settlement_activity_state),
        'reason', 'SETTLEMENT-AUDIT-RECEIPT-REVERSAL',
        'reversal_date', '2026-07-24'::date,
        'outstanding_balance_after', 1000,
        'status', 'open',
        'publication_source_class', 'legacy_cash_non_publishable'
      )
      AND new_values ? 'ledger_entry_id'
      AND new_values ? 'journal_entry_ids'
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND entity_id = (
        SELECT (reversal_result->>'allocation_id')::uuid
        FROM finance_settlement_activity_state
      )
      AND action = 'income_settlement_reversed'
  ), false),
  'receipt reversal records exact safe before and new values'
);

SELECT throws_ok(
  $$SELECT public.reverse_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    (SELECT (receipt_result->>'receipt_id')::uuid
     FROM finance_settlement_activity_state),
    '2026-07-25',
    (SELECT reconciliation_source_id
     FROM finance_settlement_activity_state),
    'SETTLEMENT-AUDIT-RECEIPT-RETRY',
    'settlement-audit-reversal-retry-v2'
  )$$,
  '22023',
  'Finance receipt is already reversed',
  'retrying the same receipt reversal is rejected'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'finance_receipt_allocation'
      AND action IN (
        'income_settlement_recorded',
        'income_settlement_reversed'
      )
      AND (
        new_values->>'income_item_id' =
          'f1000000-0000-0000-0000-000000000001'
        OR (
          action = 'income_settlement_reversed'
          AND previous_values->>'allocation_id' = (
            SELECT receipt_result->>'allocation_id'
            FROM finance_settlement_activity_state
          )
        )
      )
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
  $$SELECT public.record_finance_receipt_v2(
    '00000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    25,
    '2026-07-25',
    (SELECT reconciliation_source_id
     FROM finance_settlement_activity_state),
    'UNAUTHORIZED-RECEIPT',
    'unauthorized-receipt-v2'
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
      entity_type = 'finance_receipt_allocation'
      AND (
        new_values->>'income_item_id' =
          'f1000000-0000-0000-0000-000000000001'
        OR previous_values->>'allocation_id' = (
          SELECT receipt_result->>'allocation_id'
          FROM finance_settlement_activity_state
        )
      )
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
