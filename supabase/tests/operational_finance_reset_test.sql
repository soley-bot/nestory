BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT ok(
  to_regclass('public.financial_month_locks') IS NOT NULL,
  'financial_month_locks is the only product month authority'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'set_financial_month_lock'
  ),
  'set_financial_month_lock is the checked product month-lock RPC'
);

SELECT ok(to_regclass('public.accounting_books') IS NULL, 'accounting_books is absent');
SELECT ok(to_regclass('public.accounting_accounts') IS NULL, 'accounting_accounts is absent');
SELECT ok(to_regclass('public.accounting_periods') IS NULL, 'accounting_periods is absent');
SELECT ok(to_regclass('public.accounting_journal_entries') IS NULL, 'accounting_journal_entries is absent');
SELECT ok(to_regclass('public.accounting_journal_lines') IS NULL, 'accounting_journal_lines is absent');
SELECT ok(to_regclass('public.property_reporting_periods') IS NULL, 'property_reporting_periods is absent');
SELECT ok(to_regclass('public.property_close_revisions') IS NULL, 'property_close_revisions is absent');
SELECT ok(to_regclass('public.finance_receipt_allocation_journals') IS NULL, 'receipt journal bridge is absent');
SELECT ok(to_regclass('public.ledger_period_locks') IS NULL, 'ledger_period_locks is absent');

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledger_entries'
      AND column_name = 'accounting_journal_entry_id'
  ),
  'Ledger entries have no accounting journal link'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_submissions'
      AND column_name = 'approved_journal_entry_id'
  ),
  'approved expenses have no accounting journal link'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_submissions'
      AND column_name = 'reversal_journal_entry_id'
  ),
  'expense reversals have no accounting journal link'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'post_accounting_journal'
  ),
  'public accounting journal posting is absent'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'reverse_accounting_journal'
  ),
  'public accounting journal reversal is absent'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'set_accounting_period_lock'
  ),
  'public accounting period locking is absent'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'create_lease_with_relationships'
  ),
  'checked Lease creation remains available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname = 'run_due_rent_generation'
  ),
  'scheduled rent generation remains available internally'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'commit_generic_import_run'
  ),
  'checked import commit remains available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'submit_expense'
  ),
  'expense submission remains available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'review_expense'
  ),
  'expense review remains available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'reverse_expense'
  ),
  'expense reversal remains available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'get_property_cash_events_page'
  ),
  'canonical property cash events remain available'
);

SELECT * FROM finish();

ROLLBACK;
