BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

SELECT has_function(
  'app_private',
  'resolve_legacy_accounting_mapping',
  ARRAY['text', 'text', 'text', 'text', 'text', 'text'],
  'legacy accounting mapping helper exists'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_income', 'income', 'Security deposit',
      'security_deposit', NULL, NULL
    )$$,
  $$VALUES (
    'client'::text,
    'security_deposit_cash_clearing'::text,
    'refundable_security_deposits'::text
  )$$,
  'security deposits map to client deposit liability'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_income', 'income', 'Owner contribution',
      'owner_contribution', NULL, NULL
    )$$,
  $$VALUES ('client'::text, 'client_cash_clearing'::text, 'owner_funds_held'::text)$$,
  'owner contributions map to owner funds held'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_income', 'income', 'Management fee',
      'management_fee', NULL, NULL
    )$$,
  $$VALUES (
    'management_company'::text,
    'due_from_client_books'::text,
    'management_fee_revenue'::text
  )$$,
  'management fees map to company revenue'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_expense', 'expense', 'Office expense',
      NULL, 'other', 'company_cost'
    )$$,
  $$VALUES (
    'management_company'::text,
    'company_operating_expense'::text,
    'company_cash_clearing'::text
  )$$,
  'company costs stay in company books'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_expense', 'expense', 'Owner advance',
      NULL, 'other', 'company_advance'
    )$$,
  $$VALUES (
    'management_company'::text,
    'company_advance_expense'::text,
    'company_cash_clearing'::text
  )$$,
  'company advances stay in company books'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'finance_expense', 'expense', 'Owner payout',
      NULL, 'owner_payout', 'property_expense'
    )$$,
  $$VALUES (
    'client'::text,
    'legacy_balance_offset'::text,
    'client_cash_clearing'::text
  )$$,
  'historical owner payouts do not post as property expense'
);

SELECT results_eq(
  $$SELECT book_type, debit_system_code, credit_system_code
    FROM app_private.resolve_legacy_accounting_mapping(
      'manual', 'expense', 'Plumbing repair',
      NULL, NULL, NULL
    )$$,
  $$VALUES (
    'client'::text,
    'property_operating_expense'::text,
    'client_cash_clearing'::text
  )$$,
  'manual property expenses map to client property expense'
);

SELECT has_function(
  'app_private',
  'backfill_accounting_journals',
  ARRAY[]::text[],
  'historical accounting backfill helper exists'
);

SELECT lives_ok(
  $$SELECT app_private.backfill_accounting_journals()$$,
  'historical ledger rows can be backfilled'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE archived_at IS NULL
      AND accounting_journal_entry_id IS NULL
  ),
  0::bigint,
  'every active legacy ledger row is journal linked'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries
    WHERE posting_key = 'legacy_backfill'
  ),
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE archived_at IS NULL
  ),
  'backfill creates one journal per active legacy row'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries AS journal
    JOIN LATERAL (
      SELECT
        coalesce(sum(line.debit_amount), 0) AS debits,
        coalesce(sum(line.credit_amount), 0) AS credits
      FROM public.accounting_journal_lines AS line
      WHERE line.journal_entry_id = journal.id
    ) AS totals ON true
    WHERE totals.debits <> totals.credits
      OR totals.debits <= 0
  ),
  0::bigint,
  'every backfilled journal is balanced'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries AS ledger
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_books AS book
      ON book.id = journal.book_id
    JOIN public.accounting_journal_lines AS line
      ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account
      ON account.id = line.account_id
    WHERE ledger.direction = 'income'
      AND (
        book.book_type <> 'client'
        OR account.system_code NOT IN ('client_cash_clearing', 'rental_income')
      )
  ),
  0::bigint,
  'seeded rent income uses the client cash and rental income accounts'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries AS ledger
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = ledger.accounting_journal_entry_id
    JOIN public.accounting_books AS book
      ON book.id = journal.book_id
    JOIN public.accounting_journal_lines AS line
      ON line.journal_entry_id = journal.id
    JOIN public.accounting_accounts AS account
      ON account.id = line.account_id
    WHERE ledger.direction = 'expense'
      AND (
        book.book_type <> 'client'
        OR account.system_code NOT IN (
          'property_operating_expense',
          'client_cash_clearing'
        )
      )
  ),
  0::bigint,
  'seeded property expenses use client expense and cash accounts'
);

CREATE TEMP TABLE accounting_backfill_count AS
SELECT count(*)::bigint AS journal_count
FROM public.accounting_journal_entries;

SELECT lives_ok(
  $$SELECT app_private.backfill_accounting_journals()$$,
  'historical backfill can be retried safely'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.accounting_journal_entries),
  (SELECT journal_count FROM accounting_backfill_count),
  'historical backfill retry creates no duplicate journals'
);

SELECT * FROM finish();

ROLLBACK;
