BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

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

SELECT * FROM finish();

ROLLBACK;
