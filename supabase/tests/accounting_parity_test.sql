BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(6);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE archived_at IS NULL
      AND accounting_journal_entry_id IS NULL
  ),
  0::bigint,
  'every active legacy ledger row has an accounting journal'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries AS ledger
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = ledger.accounting_journal_entry_id
    WHERE ledger.organization_id <> journal.organization_id
  ),
  0::bigint,
  'legacy ledger links never cross organization boundaries'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries AS journal
    LEFT JOIN public.accounting_journal_lines AS line
      ON line.journal_entry_id = journal.id
    GROUP BY journal.id
    HAVING count(line.id) < 2
    LIMIT 1
  ),
  NULL::bigint,
  'every journal contains at least two lines'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM (
      SELECT journal.id
      FROM public.accounting_journal_entries AS journal
      JOIN public.accounting_journal_lines AS line
        ON line.journal_entry_id = journal.id
      GROUP BY journal.id
      HAVING sum(line.debit_amount) <> sum(line.credit_amount)
    ) AS unbalanced
  ),
  0::bigint,
  'every journal is balanced'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries AS journal
    JOIN public.accounting_books AS book ON book.id = journal.book_id
    WHERE journal.currency <> book.currency
  ),
  0::bigint,
  'journal currency always matches its accounting book'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM (
      SELECT organization_id, source_type, source_id, posting_key
      FROM public.accounting_journal_entries
      GROUP BY organization_id, source_type, source_id, posting_key
      HAVING count(*) > 1
    ) AS duplicate_posting
  ),
  0::bigint,
  'idempotency keys do not identify duplicate journals'
);

SELECT * FROM finish();

ROLLBACK;
