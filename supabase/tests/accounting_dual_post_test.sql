BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(25);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

INSERT INTO public.finance_income_items (
  id,
  organization_id,
  property_id,
  unit_id,
  income_type,
  payer_label,
  due_date,
  received_date,
  amount_due,
  amount_received,
  currency,
  status,
  description,
  reference,
  created_by,
  updated_by
)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'rent',
    'Accounting rent test',
    '2026-08-01',
    '2026-08-01',
    780,
    780,
    'USD',
    'received',
    'August test rent',
    'INCOME-RENT',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'security_deposit',
    'Accounting deposit test',
    '2026-08-02',
    '2026-08-02',
    640,
    640,
    'USD',
    'received',
    'Refundable deposit test',
    'INCOME-DEPOSIT',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    NULL,
    'owner_contribution',
    'Accounting owner test',
    '2026-08-03',
    '2026-08-03',
    500,
    500,
    'USD',
    'received',
    'Owner reserve contribution test',
    'INCOME-OWNER',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a1000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    NULL,
    'management_fee',
    'Accounting company test',
    '2026-08-04',
    '2026-08-04',
    120,
    120,
    'USD',
    'received',
    'Management fee revenue test',
    'INCOME-MANAGEMENT',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a1000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    NULL,
    'rent',
    'Accounting locked test',
    '2026-09-01',
    '2026-09-01',
    560,
    560,
    'USD',
    'received',
    'Locked period rent test',
    'INCOME-LOCKED',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.finance_expense_items (
  id,
  organization_id,
  property_id,
  unit_id,
  expense_type,
  vendor_label,
  invoice_date,
  due_date,
  amount,
  currency,
  category,
  status,
  description,
  reference,
  economic_scope,
  owner_bill_status,
  owner_reimbursable_amount,
  owner_reimbursed_amount,
  company_loss_amount,
  created_by,
  updated_by
)
VALUES
  (
    'a2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'maintenance',
    'Accounting property vendor',
    '2026-08-05',
    '2026-08-15',
    185,
    'USD',
    'Plumbing repair',
    'approved',
    'Property expense accounting test',
    'EXPENSE-PROPERTY',
    'property_expense',
    'not_billable',
    0,
    0,
    0,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    NULL,
    'other',
    'Accounting company vendor',
    '2026-08-06',
    '2026-08-16',
    90,
    'USD',
    'Office supplies',
    'approved',
    'Company cost accounting test',
    'EXPENSE-COMPANY',
    'company_cost',
    'not_billable',
    0,
    0,
    90,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a2000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    NULL,
    'other',
    'Accounting advance vendor',
    '2026-08-07',
    '2026-08-17',
    100,
    'USD',
    'Owner advance',
    'approved',
    'Company advance accounting test',
    'EXPENSE-ADVANCE',
    'company_advance',
    'billable',
    100,
    0,
    0,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    'a2000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    NULL,
    'owner_payout',
    'Accounting owner payout',
    '2026-08-08',
    '2026-08-18',
    300,
    'USD',
    'Owner payout',
    'approved',
    'Owner payout must use distribution workflow',
    'EXPENSE-OWNER-PAYOUT',
    'property_expense',
    'not_billable',
    0,
    0,
    0,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

SELECT lives_ok(
  $$SELECT public.post_finance_income_item(
    'a1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  )$$,
  'rent income dual-posts'
);

SELECT ok(
  (
    SELECT ledger.accounting_journal_entry_id IS NOT NULL
    FROM public.finance_income_items AS income
    JOIN public.ledger_entries AS ledger ON ledger.id = income.ledger_entry_id
    WHERE income.id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'rent ledger row links to a journal'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_income_items AS income
    JOIN public.ledger_entries AS ledger ON ledger.id = income.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_books AS book ON book.id = journal.book_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE income.id = 'a1000000-0000-0000-0000-000000000001'
      AND book.book_type = 'client'
      AND account.system_code IN ('client_cash_clearing', 'rental_income')
  ),
  2::bigint,
  'rent uses client cash and rental income'
);

SELECT lives_ok(
  $$SELECT public.post_finance_income_item('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001')$$,
  'security deposit dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_income_items AS income
    JOIN public.ledger_entries AS ledger ON ledger.id = income.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE income.id = 'a1000000-0000-0000-0000-000000000002'
      AND account.system_code IN ('security_deposit_cash_clearing', 'refundable_security_deposits')
  ),
  2::bigint,
  'security deposit credits a refundable liability'
);

SELECT lives_ok(
  $$SELECT public.post_finance_income_item('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')$$,
  'owner contribution dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_income_items AS income
    JOIN public.ledger_entries AS ledger ON ledger.id = income.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE income.id = 'a1000000-0000-0000-0000-000000000003'
      AND account.system_code IN ('client_cash_clearing', 'owner_funds_held')
  ),
  2::bigint,
  'owner contribution credits owner funds held'
);

SELECT lives_ok(
  $$SELECT public.post_finance_income_item('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001')$$,
  'management fee dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_income_items AS income
    JOIN public.ledger_entries AS ledger ON ledger.id = income.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_books AS book ON book.id = journal.book_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE income.id = 'a1000000-0000-0000-0000-000000000004'
      AND book.book_type = 'management_company'
      AND account.system_code IN ('due_from_client_books', 'management_fee_revenue')
  ),
  2::bigint,
  'management fee uses company books and revenue'
);

SELECT lives_ok(
  $$SELECT public.post_finance_expense_item('a2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-08-05')$$,
  'property expense dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_expense_items AS expense
    JOIN public.ledger_entries AS ledger ON ledger.id = expense.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE expense.id = 'a2000000-0000-0000-0000-000000000001'
      AND account.system_code IN ('property_operating_expense', 'client_cash_clearing')
  ),
  2::bigint,
  'property expense stays in client property books'
);

SELECT lives_ok(
  $$SELECT public.post_finance_expense_item('a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '2026-08-06')$$,
  'company cost dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_expense_items AS expense
    JOIN public.ledger_entries AS ledger ON ledger.id = expense.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_books AS book ON book.id = journal.book_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE expense.id = 'a2000000-0000-0000-0000-000000000002'
      AND book.book_type = 'management_company'
      AND account.system_code IN ('company_operating_expense', 'company_cash_clearing')
  ),
  2::bigint,
  'company cost stays in management-company books'
);

SELECT lives_ok(
  $$SELECT public.post_finance_expense_item('a2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '2026-08-07')$$,
  'company advance dual-posts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_expense_items AS expense
    JOIN public.ledger_entries AS ledger ON ledger.id = expense.ledger_entry_id
    JOIN public.accounting_journal_entries AS journal ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_journal_lines AS line ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account ON account.id = line.account_id
    WHERE expense.id = 'a2000000-0000-0000-0000-000000000003'
      AND account.system_code IN ('company_advance_expense', 'company_cash_clearing')
  ),
  2::bigint,
  'company advance stays in management-company books'
);

SELECT throws_ok(
  $$SELECT public.post_finance_expense_item('a2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '2026-08-08')$$,
  '22023',
  'Use the owner distribution workflow',
  'generic owner payout posting is blocked'
);

SELECT lives_ok(
  $$SELECT public.create_ledger_entry(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    NULL,
    '2026-08-09',
    'expense',
    'Manual accounting test',
    45,
    'USD',
    'Manual entry dual-post test'
  )$$,
  'manual ledger entry dual-posts'
);

SELECT ok(
  (
    SELECT accounting_journal_entry_id IS NOT NULL
    FROM public.ledger_entries
    WHERE description = 'Manual entry dual-post test'
  ),
  'manual ledger row links to a journal'
);

INSERT INTO public.petty_cash_accounts (
  id,
  organization_id,
  account_number,
  name,
  currency,
  created_by,
  updated_by
)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'PC-ACCOUNTING-TEST',
  'Accounting petty cash',
  'USD',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.petty_cash_periods (
  id,
  organization_id,
  account_id,
  period_start,
  created_by,
  updated_by
)
VALUES (
  'a3000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  '2026-08-01',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.petty_cash_entries (
  id,
  organization_id,
  account_id,
  period_id,
  property_id,
  invoice_date,
  clear_date,
  entry_kind,
  status,
  category,
  supplier,
  description,
  out_amount,
  in_amount,
  currency,
  economic_scope,
  owner_bill_status,
  owner_reimbursable_amount,
  owner_reimbursed_amount,
  company_loss_amount,
  created_by,
  updated_by
)
VALUES (
  'a3000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000005',
  '2026-08-10',
  '2026-08-10',
  'expense',
  'cleared',
  'Supplies',
  'Accounting petty vendor',
  'Petty cash dual-post test',
  35,
  0,
  'USD',
  'property_expense',
  'not_billable',
  0,
  0,
  0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT lives_ok(
  $$SELECT public.post_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000003'
  )$$,
  'petty cash expense dual-posts'
);

SELECT ok(
  (
    SELECT ledger.accounting_journal_entry_id IS NOT NULL
    FROM public.petty_cash_entries AS petty
    JOIN public.ledger_entries AS ledger ON ledger.id = petty.ledger_entry_id
    WHERE petty.id = 'a3000000-0000-0000-0000-000000000003'
  ),
  'petty cash ledger row links to a journal'
);

SELECT lives_ok(
  $$SELECT public.post_finance_income_item('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')$$,
  'income posting retry is idempotent'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries
    WHERE source_type = 'finance_income'
      AND source_id = 'a1000000-0000-0000-0000-000000000001'
      AND posting_key = 'received'
  ),
  1::bigint,
  'income posting retry creates one journal'
);

SELECT public.set_accounting_period_lock(
  '00000000-0000-0000-0000-000000000001',
  (
    SELECT id
    FROM public.accounting_books
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND book_type = 'client'
      AND currency = 'USD'
      AND is_default
      AND archived_at IS NULL
  ),
  '2026-09-01',
  true,
  'Dual-post atomicity test'
);

SELECT throws_ok(
  $$SELECT public.post_finance_income_item('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001')$$,
  '22023',
  'Accounting period is locked',
  'locked accounting period rejects income posting'
);

SELECT is(
  (
    SELECT status
    FROM public.finance_income_items
    WHERE id = 'a1000000-0000-0000-0000-000000000005'
  ),
  'received',
  'failed locked-period posting leaves source status unchanged'
);

SELECT is(
  (
    SELECT ledger_entry_id
    FROM public.finance_income_items
    WHERE id = 'a1000000-0000-0000-0000-000000000005'
  ),
  NULL::uuid,
  'failed locked-period posting creates no legacy ledger row'
);

SELECT * FROM finish();

ROLLBACK;
