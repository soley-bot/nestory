BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_table(
  'public',
  'expense_transactions',
  'paid expenses have a transaction-level review boundary'
);
SELECT has_table(
  'public',
  'expense_transaction_lines',
  'a paid expense transaction preserves ordered financial child lines'
);
SELECT has_table(
  'public',
  'expense_transaction_scopes',
  'cross-property paid expenses record every property authority scope'
);

SELECT has_column(
  'public',
  'expense_transaction_lines',
  'description',
  'each line stores its real expense description separately from reference'
);
SELECT has_column(
  'public',
  'expense_transaction_lines',
  'owner_cash_amount',
  'each owner line can preserve an explicit IPS-held cash amount'
);
SELECT col_is_null(
  'public',
  'expense_transaction_lines',
  'owner_cash_amount',
  'null owner cash preserves the existing automatic allocation behavior'
);
SELECT has_trigger(
  'public',
  'expense_submissions',
  'guard_expense_submission_evidence_reuse',
  'shared transaction evidence is protected by a deferred structural guard'
);
SELECT ok(
  coalesce(
    (
      SELECT trigger.tgdeferrable AND trigger.tginitdeferred
      FROM pg_catalog.pg_trigger AS trigger
      WHERE trigger.tgrelid = 'public.expense_submissions'::regclass
        AND trigger.tgname = 'guard_expense_submission_evidence_reuse'
    ),
    false
  ),
  'transaction evidence reuse is validated after every child line is linked'
);

SELECT has_function(
  'public',
  'submit_expense_transaction',
  ARRAY[
    'uuid', 'uuid', 'text', 'date', 'currency_code', 'uuid', 'text', 'uuid',
    'text', 'jsonb', 'text'
  ],
  'Finance Members submit one parent transaction with ordered JSON lines'
);
SELECT has_function(
  'public',
  'review_expense_transaction',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'Finance Managers review a whole transaction through one checked RPC'
);
SELECT has_function(
  'public',
  'reverse_expense_transaction',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'Super Admins reverse a whole transaction through one checked RPC'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.submit_expense_transaction(uuid,uuid,text,date,currency_code,uuid,text,uuid,text,jsonb,text)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'authenticated callers can reach the checked transaction submission RPC'
);
SELECT ok(
  NOT coalesce(
    has_table_privilege('authenticated', 'public.expense_transactions', 'INSERT'),
    false
  ),
  'authenticated callers cannot insert transaction parents directly'
);
SELECT ok(
  NOT coalesce(
    has_table_privilege('authenticated', 'public.expense_transaction_lines', 'INSERT'),
    false
  ),
  'authenticated callers cannot insert transaction lines directly'
);

SELECT policies_are(
  'public',
  'expense_transactions',
  ARRAY['expense_transactions_select'],
  'transaction parents expose only an organization-scoped read policy'
);
SELECT policies_are(
  'public',
  'expense_transaction_lines',
  ARRAY['expense_transaction_lines_select'],
  'transaction lines expose only an organization-scoped read policy'
);
SELECT policies_are(
  'public',
  'expense_transaction_scopes',
  ARRAY['expense_transaction_scopes_select'],
  'transaction property scopes expose only an organization-scoped read policy'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'app_private.apply_owner_cash_to_expense_line(uuid,uuid,uuid,numeric,date,uuid)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'authenticated callers cannot bypass approval to allocate owner cash'
);

SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure
    ),
    'lock_property_financial_month'
  ) > 0
  AND pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure
    ),
    'lock_owner_balance_lifecycle'
  ) > 0,
  'automatic owner cash preserves the hardened month and owner lock order'
);
SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'app_private.apply_owner_cash_to_expense_line(uuid,uuid,uuid,numeric,date,uuid)'::regprocedure
    ),
    'lock_property_financial_month'
  ) > 0
  AND pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'app_private.apply_owner_cash_to_expense_line(uuid,uuid,uuid,numeric,date,uuid)'::regprocedure
    ),
    'lock_owner_balance_lifecycle'
  ) > 0,
  'explicit owner cash follows the same hardened month and owner lock order'
);
SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure
    ),
    'transaction_line.owner_cash_amount IS NOT NULL'
  ) > 0,
  'automatic allocation excludes transaction lines with an explicit amount'
);

SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.submit_expense_transaction(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)'::regprocedure
    ),
    'assert_property_permission'
  ) > 0,
  'transaction submission checks Finance Member authority for every property scope'
);
SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.review_expense_transaction(uuid,uuid,text,text,text)'::regprocedure
    ),
    'assert_property_permission'
  ) > 0,
  'transaction review checks Finance Manager authority for every property scope'
);

SELECT * FROM finish();

ROLLBACK;
