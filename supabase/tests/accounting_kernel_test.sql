BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(29);

SELECT has_table('public', 'accounting_books', 'accounting_books exists');
SELECT has_table('public', 'accounting_accounts', 'accounting_accounts exists');
SELECT has_table('public', 'accounting_periods', 'accounting_periods exists');
SELECT has_table(
  'public',
  'accounting_journal_entries',
  'accounting_journal_entries exists'
);
SELECT has_table(
  'public',
  'accounting_journal_lines',
  'accounting_journal_lines exists'
);
SELECT has_column(
  'public',
  'ledger_entries',
  'accounting_journal_entry_id',
  'ledger entries link to accounting journals'
);

SELECT col_type_is(
  'public',
  'accounting_journal_lines',
  'debit_amount',
  'numeric(18,2)',
  'journal debits use exact money'
);
SELECT col_type_is(
  'public',
  'accounting_journal_lines',
  'credit_amount',
  'numeric(18,2)',
  'journal credits use exact money'
);
SELECT col_not_null(
  'public',
  'accounting_books',
  'organization_id',
  'accounting books are organization scoped'
);
SELECT col_not_null(
  'public',
  'accounting_accounts',
  'book_id',
  'accounting accounts require a book'
);
SELECT col_not_null(
  'public',
  'accounting_journal_entries',
  'book_id',
  'journal entries require a book'
);
SELECT col_not_null(
  'public',
  'accounting_journal_lines',
  'journal_entry_id',
  'journal lines require a journal entry'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = to_regclass('public.accounting_books')
  ),
  'accounting_books has RLS enabled'
);
SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = to_regclass('public.accounting_journal_entries')
  ),
  'accounting_journal_entries has RLS enabled'
);

SELECT lives_ok(
  $$SELECT app_private.ensure_accounting_books_and_accounts(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'USD'::public.currency_code
  )$$,
  'default books and accounts can be bootstrapped'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_books
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND currency = 'USD'
      AND archived_at IS NULL
  ),
  2::bigint,
  'bootstrap creates client and management-company books'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_accounts
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND archived_at IS NULL
  ),
  22::bigint,
  'bootstrap creates the complete system chart'
);

SELECT lives_ok(
  $$SELECT app_private.ensure_accounting_books_and_accounts(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'USD'::public.currency_code
  )$$,
  'bootstrap can be retried safely'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_books
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND currency = 'USD'
      AND archived_at IS NULL
  ),
  2::bigint,
  'bootstrap retry does not duplicate books'
);

SELECT throws_ok(
  $$SELECT app_private.ensure_accounting_books_and_accounts(
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL
  )$$,
  '22023',
  'Accounting book currency is required',
  'bootstrap rejects a missing currency explicitly'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT lives_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (
      SELECT id
      FROM public.accounting_books
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND book_type = 'client'
        AND currency = 'USD'
        AND is_default
        AND archived_at IS NULL
    ),
    'kernel_test',
    '90000000-0000-0000-0000-000000000001'::uuid,
    'balanced-posting',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Balanced rent receipt',
    'KERNEL-001',
    jsonb_build_array(
      jsonb_build_object(
        'account_system_code', 'client_cash_clearing',
        'debit_amount', 125.00,
        'credit_amount', 0,
        'property_id', '10000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_object(
        'account_system_code', 'rental_income',
        'debit_amount', 0,
        'credit_amount', 125.00,
        'property_id', '10000000-0000-0000-0000-000000000001'
      )
    )
  )$$,
  'a balanced journal posts'
);

SELECT is(
  (
    SELECT sum(line.debit_amount)
    FROM public.accounting_journal_lines AS line
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = line.journal_entry_id
    WHERE journal.source_id = '90000000-0000-0000-0000-000000000001'::uuid
      AND journal.posting_key = 'balanced-posting'
  ),
  125.00::numeric,
  'posted debit total is exact'
);

SELECT is(
  (
    SELECT sum(line.credit_amount)
    FROM public.accounting_journal_lines AS line
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = line.journal_entry_id
    WHERE journal.source_id = '90000000-0000-0000-0000-000000000001'::uuid
      AND journal.posting_key = 'balanced-posting'
  ),
  125.00::numeric,
  'posted credit total is exact'
);

SELECT is(
  public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (
      SELECT id
      FROM public.accounting_books
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND book_type = 'client'
        AND currency = 'USD'
        AND is_default
        AND archived_at IS NULL
    ),
    'kernel_test',
    '90000000-0000-0000-0000-000000000001'::uuid,
    'balanced-posting',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Balanced rent receipt',
    'KERNEL-001',
    jsonb_build_array(
      jsonb_build_object(
        'account_system_code', 'client_cash_clearing',
        'debit_amount', 125.00,
        'credit_amount', 0,
        'property_id', '10000000-0000-0000-0000-000000000001'
      ),
      jsonb_build_object(
        'account_system_code', 'rental_income',
        'debit_amount', 0,
        'credit_amount', 125.00,
        'property_id', '10000000-0000-0000-0000-000000000001'
      )
    )
  ),
  (
    SELECT id
    FROM public.accounting_journal_entries
    WHERE source_id = '90000000-0000-0000-0000-000000000001'::uuid
      AND posting_key = 'balanced-posting'
  ),
  'an identical retry returns the existing journal'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries
    WHERE source_id = '90000000-0000-0000-0000-000000000001'::uuid
      AND posting_key = 'balanced-posting'
  ),
  1::bigint,
  'an identical retry does not duplicate the journal'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.accounting_books WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND book_type = 'client' AND currency = 'USD' AND is_default AND archived_at IS NULL),
    'kernel_test',
    '90000000-0000-0000-0000-000000000001'::uuid,
    'balanced-posting',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Balanced rent receipt',
    'KERNEL-001',
    jsonb_build_array(
      jsonb_build_object('account_system_code', 'client_cash_clearing', 'debit_amount', 126.00, 'credit_amount', 0, 'property_id', '10000000-0000-0000-0000-000000000001'),
      jsonb_build_object('account_system_code', 'rental_income', 'debit_amount', 0, 'credit_amount', 126.00, 'property_id', '10000000-0000-0000-0000-000000000001')
    )
  )$$,
  '22023',
  'Conflicting accounting posting',
  'a conflicting retry is rejected'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.accounting_books WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND book_type = 'client' AND currency = 'USD' AND is_default AND archived_at IS NULL),
    'kernel_test',
    '90000000-0000-0000-0000-000000000002'::uuid,
    'unbalanced-posting',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Unbalanced journal',
    NULL,
    jsonb_build_array(
      jsonb_build_object('account_system_code', 'client_cash_clearing', 'debit_amount', 125.00, 'credit_amount', 0, 'property_id', '10000000-0000-0000-0000-000000000001'),
      jsonb_build_object('account_system_code', 'rental_income', 'debit_amount', 0, 'credit_amount', 124.00, 'property_id', '10000000-0000-0000-0000-000000000001')
    )
  )$$,
  '22023',
  'Journal is not balanced',
  'an unbalanced journal is rejected'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.accounting_books WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND book_type = 'client' AND currency = 'USD' AND is_default AND archived_at IS NULL),
    'kernel_test',
    '90000000-0000-0000-0000-000000000003'::uuid,
    'empty-posting',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Empty journal',
    NULL,
    '[]'::jsonb
  )$$,
  '22023',
  'Journal requires at least two lines',
  'a journal with no lines is rejected'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.accounting_books WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND book_type = 'client' AND currency = 'USD' AND is_default AND archived_at IS NULL),
    'kernel_test',
    '90000000-0000-0000-0000-000000000004'::uuid,
    'currency-mismatch',
    '2026-07-01'::date,
    NULL,
    'Wrong currency',
    NULL,
    jsonb_build_array(
      jsonb_build_object('account_system_code', 'client_cash_clearing', 'debit_amount', 125.00, 'credit_amount', 0, 'property_id', '10000000-0000-0000-0000-000000000001'),
      jsonb_build_object('account_system_code', 'rental_income', 'debit_amount', 0, 'credit_amount', 125.00, 'property_id', '10000000-0000-0000-0000-000000000001')
    )
  )$$,
  '22023',
  'Accounting date, currency, and description are required',
  'a journal without a currency is rejected'
);

SELECT * FROM finish();

ROLLBACK;
