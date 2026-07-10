BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(13);

SELECT app_private.ensure_accounting_books_and_accounts(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'USD'::public.currency_code
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

CREATE TEMP TABLE accounting_security_state (
  journal_id uuid,
  reversal_id uuid
) ON COMMIT DROP;

INSERT INTO accounting_security_state (journal_id)
SELECT public.post_accounting_journal(
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
  'security_test',
  '90000000-0000-0000-0000-000000000010'::uuid,
  'original',
  '2026-06-15'::date,
  'USD'::public.currency_code,
  'Security control test journal',
  'SEC-001',
  jsonb_build_array(
    jsonb_build_object(
      'account_system_code', 'client_cash_clearing',
      'debit_amount', 80.00,
      'credit_amount', 0,
      'property_id', '10000000-0000-0000-0000-000000000001'
    ),
    jsonb_build_object(
      'account_system_code', 'rental_income',
      'debit_amount', 0,
      'credit_amount', 80.00,
      'property_id', '10000000-0000-0000-0000-000000000001'
    )
  )
);

SELECT throws_ok(
  format(
    'UPDATE public.accounting_journal_entries SET description = %L WHERE id = %L',
    'Changed after posting',
    (SELECT journal_id FROM accounting_security_state)
  ),
  '55000',
  'Posted accounting journals are immutable',
  'posted journal headers cannot be edited'
);

SELECT throws_ok(
  format(
    'DELETE FROM public.accounting_journal_lines WHERE journal_entry_id = %L',
    (SELECT journal_id FROM accounting_security_state)
  ),
  '55000',
  'Posted accounting journal lines are immutable',
  'posted journal lines cannot be deleted'
);

SELECT has_function(
  'public',
  'set_accounting_period_lock',
  ARRAY['uuid', 'uuid', 'date', 'boolean', 'text'],
  'accounting period lock RPC exists'
);

SELECT lives_ok(
  format(
    'SELECT public.set_accounting_period_lock(%L, %L, %L, true, %L)',
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id
      FROM public.accounting_books
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND book_type = 'client'
        AND currency = 'USD'
        AND is_default
        AND archived_at IS NULL
    ),
    '2026-06-01',
    'Security test lock'
  ),
  'an admin can lock an accounting period'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    (SELECT id FROM public.accounting_books WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid AND book_type = 'client' AND currency = 'USD' AND is_default AND archived_at IS NULL),
    'security_test',
    '90000000-0000-0000-0000-000000000011'::uuid,
    'locked-period',
    '2026-06-20'::date,
    'USD'::public.currency_code,
    'Locked period journal',
    NULL,
    jsonb_build_array(
      jsonb_build_object('account_system_code', 'client_cash_clearing', 'debit_amount', 10.00, 'credit_amount', 0, 'property_id', '10000000-0000-0000-0000-000000000001'),
      jsonb_build_object('account_system_code', 'rental_income', 'debit_amount', 0, 'credit_amount', 10.00, 'property_id', '10000000-0000-0000-0000-000000000001')
    )
  )$$,
  '22023',
  'Accounting period is locked',
  'posting into a locked accounting period is rejected'
);

SELECT lives_ok(
  format(
    'SELECT public.set_accounting_period_lock(%L, %L, %L, false, NULL)',
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id
      FROM public.accounting_books
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND book_type = 'client'
        AND currency = 'USD'
        AND is_default
        AND archived_at IS NULL
    ),
    '2026-06-01'
  ),
  'an admin can reopen an accounting period'
);

SELECT lives_ok(
  format(
    'UPDATE accounting_security_state SET reversal_id = public.reverse_accounting_journal(%L, %L, %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT journal_id FROM accounting_security_state),
    '2026-06-30',
    'Correct the security test entry'
  ),
  'an admin can reverse a journal into an open period'
);

SELECT is(
  (
    SELECT sum(debit_amount)
    FROM public.accounting_journal_lines
    WHERE journal_entry_id = (
      SELECT reversal_id FROM accounting_security_state
    )
  ),
  80.00::numeric,
  'reversal retains the exact debit total'
);

SELECT is(
  (
    SELECT sum(reversal_line.debit_amount)
    FROM public.accounting_journal_lines AS reversal_line
    WHERE reversal_line.journal_entry_id = (
      SELECT reversal_id FROM accounting_security_state
    )
  ),
  (
    SELECT sum(original_line.credit_amount)
    FROM public.accounting_journal_lines AS original_line
    WHERE original_line.journal_entry_id = (
      SELECT journal_id FROM accounting_security_state
    )
  ),
  'reversal debits equal original credits'
);

SELECT is(
  (
    SELECT status
    FROM public.accounting_journal_entries
    WHERE id = (SELECT journal_id FROM accounting_security_state)
  ),
  'reversed',
  'the original journal is marked reversed'
);

SELECT throws_ok(
  format(
    'SELECT public.reverse_accounting_journal(%L, %L, %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT journal_id FROM accounting_security_state),
    '2026-06-30',
    'Attempt a second reversal'
  ),
  '22023',
  'Accounting journal is already reversed',
  'a journal cannot be reversed twice'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.accounting_journal_entries
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  ),
  0::bigint,
  'another organization admin cannot read journals'
);

SELECT throws_ok(
  $$SELECT public.post_accounting_journal(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'security_test',
    '90000000-0000-0000-0000-000000000012'::uuid,
    'cross-organization',
    '2026-07-01'::date,
    'USD'::public.currency_code,
    'Cross organization journal',
    NULL,
    '[]'::jsonb
  )$$,
  '42501',
  'Not authorized',
  'another organization admin cannot post journals'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
