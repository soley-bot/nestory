BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(44);

CREATE TEMP TABLE finance_inventory_auth_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_period_id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO finance_inventory_auth_state DEFAULT VALUES;
GRANT SELECT ON finance_inventory_auth_state TO anon, authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || user_id::text || '@example.test',
  extensions.crypt('finance-inventory-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT admin_id, 'inventory-auth-admin' FROM finance_inventory_auth_state
  UNION ALL
  SELECT member_id, 'inventory-auth-member' FROM finance_inventory_auth_state
  UNION ALL
  SELECT manager_id, 'inventory-auth-manager' FROM finance_inventory_auth_state
  UNION ALL
  SELECT cross_admin_id, 'inventory-auth-cross-admin' FROM finance_inventory_auth_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Finance inventory authorization',
  'finance-inventory-auth-' || left(organization_id::text, 8)
FROM finance_inventory_auth_state
UNION ALL
SELECT cross_organization_id, 'Finance inventory cross authorization',
  'finance-inventory-cross-auth-' || left(cross_organization_id::text, 8)
FROM finance_inventory_auth_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin' FROM finance_inventory_auth_state
UNION ALL
SELECT organization_id, member_id, 'member' FROM finance_inventory_auth_state
UNION ALL
SELECT organization_id, manager_id, 'manager' FROM finance_inventory_auth_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'admin'
FROM finance_inventory_auth_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
)
SELECT property_id, organization_id, 'Authorization property',
  'AUTH-' || left(property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_auth_state
UNION ALL
SELECT other_property_id, organization_id, 'Other authorization property',
  'OTHER-' || left(other_property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_auth_state
UNION ALL
SELECT cross_property_id, cross_organization_id, 'Cross property',
  'CROSS-' || left(cross_property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_auth_state;

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'A-1', 'occupied', 1000,
  'USD'::public.currency_code
FROM finance_inventory_auth_state
UNION ALL
SELECT other_unit_id, organization_id, other_property_id, 'B-1', 'vacant', 900,
  'USD'::public.currency_code
FROM finance_inventory_auth_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT tenant_id, organization_id, 'Authorization tenant'
FROM finance_inventory_auth_state
UNION ALL
SELECT other_person_id, organization_id, 'Unrelated same-organization person'
FROM finance_inventory_auth_state;
INSERT INTO public.person_roles (organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM finance_inventory_auth_state;

SELECT set_config('app.lease_creation_context', 'test-fixture-v1', true);

INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
)
SELECT lease_id, organization_id, property_id, unit_id, tenant_id,
  'Authorization tenant', '2026-01-01', '2026-12-31', 1000, 'USD', 500, 'USD',
  'active'
FROM finance_inventory_auth_state;

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, unit_id, lease_id, income_type,
  payer_label, due_date, amount_due, currency, status, reference
)
SELECT income_id, organization_id, property_id, unit_id, lease_id, 'rent',
  'Authorization tenant', '2026-07-01'::date, 100,
  'USD'::public.currency_code, 'open', 'AUTH-INCOME'
FROM finance_inventory_auth_state
UNION ALL
SELECT other_income_id, organization_id, other_property_id, other_unit_id, NULL,
  'other', 'Other payer', '2026-07-01'::date, 25,
  'USD'::public.currency_code, 'open',
  'AUTH-OTHER-PROPERTY-INCOME'
FROM finance_inventory_auth_state;

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, amount, currency, category, status, reference
)
SELECT expense_id, organization_id, property_id, unit_id, 'vendor_bill',
  'Authorization vendor', '2026-07-02', 50, 'USD', 'Repairs', 'approved',
  'AUTH-EXPENSE'
FROM finance_inventory_auth_state;

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, reference
)
SELECT receipt_id, organization_id, property_id, '2026-07-03', 100, 'USD',
  'Authorization tenant', 'AUTH-RECEIPT'
FROM finance_inventory_auth_state;

INSERT INTO public.finance_payments (
  id, organization_id, property_id, paid_date, amount, currency, payee_label,
  reference
)
SELECT payment_id, organization_id, property_id, '2026-07-04', 50, 'USD',
  'Authorization vendor', 'AUTH-PAYMENT'
FROM finance_inventory_auth_state;

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, deposit_type, amount, currency, status
)
SELECT lease_deposit_id, organization_id, lease_id, 'security', 500, 'USD',
  'pending'
FROM finance_inventory_auth_state;

INSERT INTO public.ledger_entries (
  id, organization_id, property_id, unit_id, transaction_date, direction,
  category, amount, currency, description, source_type
)
SELECT ledger_id, organization_id, property_id, unit_id, '2026-07-05', 'income',
  'Authorization', 10, 'USD', 'Authorization baseline Ledger', 'manual'
FROM finance_inventory_auth_state;

INSERT INTO public.petty_cash_accounts (
  id, organization_id, account_number, name, currency, float_amount
)
SELECT petty_account_id, organization_id,
  'AUTH-PC-' || left(petty_account_id::text, 8), 'Authorization petty cash',
  'USD', 100
FROM finance_inventory_auth_state;
INSERT INTO public.petty_cash_periods (
  id, organization_id, account_id, period_start, opening_balance_amount, status
)
SELECT petty_period_id, organization_id, petty_account_id, '2026-07-01', 100,
  'open'
FROM finance_inventory_auth_state;

INSERT INTO public.tenant_requests (
  id, organization_id, property_id, unit_id, title, category, status
)
SELECT request_id, organization_id, property_id, unit_id,
  'Authorization request', 'General', 'open'
FROM finance_inventory_auth_state;
INSERT INTO public.tasks (
  id, organization_id, tenant_request_id, property_id, unit_id, title,
  category, status
)
SELECT task_id, organization_id, request_id, property_id, unit_id,
  'Authorization task', 'General', 'pending'
FROM finance_inventory_auth_state;

SELECT app_private.ensure_accounting_books_and_accounts(
  (SELECT organization_id FROM finance_inventory_auth_state),
  'USD'
);

CREATE TEMP TABLE finance_inventory_auth_accounting AS
SELECT
  book.id AS book_id,
  min(account.id::text) FILTER (
    WHERE account.system_code = 'client_cash_clearing'
  )::uuid AS cash_account_id,
  min(account.id::text) FILTER (
    WHERE account.system_code = 'rental_income'
  )::uuid AS income_account_id
FROM public.accounting_books book
JOIN public.accounting_accounts account ON account.book_id = book.id
WHERE book.organization_id = (
    SELECT organization_id FROM finance_inventory_auth_state
  )
  AND book.book_type = 'client'
  AND book.currency = 'USD'
GROUP BY book.id;
GRANT SELECT ON finance_inventory_auth_accounting TO authenticated;

SELECT ok(
  has_table_privilege('authenticated', 'public.finance_income_items', 'INSERT')
  AND has_table_privilege('authenticated', 'public.finance_expense_items', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_receipts', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_receipt_allocations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_payments', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_payment_allocations', 'INSERT')
  AND has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT')
  AND has_table_privilege('authenticated', 'public.ledger_entries', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.accounting_journal_entries', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.lease_deposit_events', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.petty_cash_entries', 'INSERT'),
  'authenticated direct financial table privileges match the current mixed grant boundary'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.finance_income_items', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.ledger_entries', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.accounting_journal_entries', 'SELECT'),
  'anonymous database role has no direct financial table visibility'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  ),
  'checked diagnostic RPC execute privilege is authenticated-only'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  ),
  'private diagnostic helper invocation is denied'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,10,NULL,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    'USD', '2026-07-01', '2026-07-31', 'sources'
  ),
  '42501',
  NULL,
  'anonymous diagnostic invocation is denied'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM finance_inventory_auth_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,10,NULL,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    'USD', '2026-07-01', '2026-07-31', 'sources'
  ),
  '42501', 'Not authorized', 'member diagnostic invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM finance_inventory_auth_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,10,NULL,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    'USD', '2026-07-01', '2026-07-31', 'sources'
  ),
  '42501', 'Not authorized', 'manager diagnostic invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM finance_inventory_auth_state),
  true
);
SELECT lives_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,10,NULL,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    'USD', '2026-07-01', '2026-07-31', 'sources'
  ),
  'same-organization admin diagnostic invocation succeeds'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM finance_inventory_auth_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,10,NULL,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    'USD', '2026-07-01', '2026-07-31', 'sources'
  ),
  '42501', 'Not authorized', 'cross-organization admin diagnostic invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM finance_inventory_auth_state),
  true
);

SELECT throws_ok(statement, '42501', NULL, label)
FROM (VALUES
  (
    format(
      'INSERT INTO public.finance_income_items (organization_id,property_id,income_type,payer_label,due_date,amount_due,currency,status) VALUES (%L,%L,%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      'other', 'Member attempt', '2026-07-10', 'USD', 'open'
    ),
    'member direct obligation DML is denied'
  ),
  (
    format(
      'INSERT INTO public.finance_receipts (organization_id,property_id,received_date,amount,currency,payer_label) VALUES (%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'USD', 'Member attempt'
    ),
    'member direct receipt DML is denied'
  ),
  (
    format(
      'INSERT INTO public.finance_expense_items (organization_id,property_id,expense_type,vendor_label,invoice_date,amount,currency,category,status) VALUES (%L,%L,%L,%L,%L,1,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      'vendor_bill', 'Member attempt', '2026-07-10', 'USD', 'Repairs', 'draft'
    ),
    'member direct expense-obligation DML is denied'
  ),
  (
    format(
      'INSERT INTO public.finance_receipt_allocations (organization_id,receipt_id,income_item_id,amount) VALUES (%L,%L,%L,1)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT receipt_id FROM finance_inventory_auth_state),
      (SELECT income_id FROM finance_inventory_auth_state)
    ),
    'member direct receipt allocation DML is denied'
  ),
  (
    format(
      'INSERT INTO public.finance_payments (organization_id,property_id,paid_date,amount,currency,payee_label) VALUES (%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'USD', 'Member attempt'
    ),
    'member direct payment DML is denied'
  ),
  (
    format(
      'INSERT INTO public.finance_payment_allocations (organization_id,payment_id,expense_item_id,amount) VALUES (%L,%L,%L,1)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT payment_id FROM finance_inventory_auth_state),
      (SELECT expense_id FROM finance_inventory_auth_state)
    ),
    'member direct payment allocation DML is denied'
  ),
  (
    format(
      'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,description) VALUES (%L,%L,%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'income', 'Member attempt', 'USD', 'Member attempt'
    ),
    'member direct Ledger DML is denied'
  ),
  (
    format(
      'INSERT INTO public.accounting_journal_entries (organization_id,book_id,entry_date,currency,description,source_type,source_id,posting_key,payload_hash) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT book_id FROM finance_inventory_auth_accounting),
      '2026-07-10', 'USD', 'Member attempt', 'manual',
      gen_random_uuid(), 'member-attempt-' || gen_random_uuid()::text,
      repeat('a', 64)
    ),
    'member direct journal DML is denied'
  ),
  (
    format(
      'INSERT INTO public.lease_deposit_events (organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency) VALUES (%L,%L,%L,%L,%L,1,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      (SELECT lease_deposit_id FROM finance_inventory_auth_state),
      'received', '2026-07-10', 'USD'
    ),
    'member direct deposit DML is denied'
  ),
  (
    format(
      'INSERT INTO public.petty_cash_entries (organization_id,account_id,period_id,property_id,invoice_date,entry_kind,status,category,description,out_amount,in_amount,currency) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L,1,0,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT petty_account_id FROM finance_inventory_auth_state),
      (SELECT petty_period_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'expense', 'cleared', 'Member attempt', 'Member attempt',
      'USD'
    ),
    'member direct petty-cash DML is denied'
  )
) attempts(statement, label);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM finance_inventory_auth_state),
  true
);

SELECT CASE
  WHEN allowed THEN lives_ok(statement, label)
  ELSE throws_ok(statement, '42501', NULL, label)
END
FROM (VALUES
  (
    format(
      'INSERT INTO public.finance_income_items (organization_id,property_id,income_type,payer_label,due_date,amount_due,currency,status,reference) VALUES (%L,%L,%L,%L,%L,1,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      'other', 'Admin direct', '2026-07-10', 'USD', 'open',
      'ADMIN-DIRECT-INCOME'
    ),
    true,
    'admin direct obligation DML currently succeeds'
  ),
  (
    format(
      'INSERT INTO public.finance_receipts (organization_id,property_id,received_date,amount,currency,payer_label,reference) VALUES (%L,%L,%L,1,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'USD', 'Admin direct', 'ADMIN-DIRECT-RECEIPT'
    ),
    false,
    'admin direct receipt DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.finance_expense_items (organization_id,property_id,expense_type,vendor_label,invoice_date,amount,currency,category,status,reference) VALUES (%L,%L,%L,%L,%L,1,%L,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      'vendor_bill', 'Admin direct', '2026-07-10', 'USD', 'Repairs', 'draft',
      'ADMIN-DIRECT-EXPENSE'
    ),
    true,
    'admin direct expense-obligation DML currently succeeds'
  ),
  (
    format(
      'INSERT INTO public.finance_receipt_allocations (organization_id,receipt_id,income_item_id,amount) VALUES (%L,%L,%L,1)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT receipt_id FROM finance_inventory_auth_state),
      (SELECT income_id FROM finance_inventory_auth_state)
    ),
    false,
    'admin direct receipt allocation DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.finance_payments (organization_id,property_id,paid_date,amount,currency,payee_label,reference) VALUES (%L,%L,%L,1,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'USD', 'Admin direct', 'ADMIN-DIRECT-PAYMENT'
    ),
    false,
    'admin direct payment DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.finance_payment_allocations (organization_id,payment_id,expense_item_id,amount) VALUES (%L,%L,%L,1)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT payment_id FROM finance_inventory_auth_state),
      (SELECT expense_id FROM finance_inventory_auth_state)
    ),
    false,
    'admin direct payment allocation DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,description) VALUES (%L,%L,%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'income', 'Admin direct', 'USD', 'Admin direct'
    ),
    true,
    'admin direct Ledger DML currently succeeds'
  ),
  (
    format(
      'INSERT INTO public.accounting_journal_entries (organization_id,book_id,entry_date,currency,description,source_type,source_id,posting_key,payload_hash) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT book_id FROM finance_inventory_auth_accounting),
      '2026-07-10', 'USD', 'Admin direct', 'manual', gen_random_uuid(),
      'admin-direct-' || gen_random_uuid()::text, repeat('b', 64)
    ),
    false,
    'admin direct journal DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.lease_deposit_events (organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reference) VALUES (%L,%L,%L,%L,%L,1,%L,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      (SELECT lease_deposit_id FROM finance_inventory_auth_state),
      'received', '2026-07-10', 'USD', 'ADMIN-DIRECT-DEPOSIT'
    ),
    false,
    'admin direct deposit DML is denied by table privilege'
  ),
  (
    format(
      'INSERT INTO public.petty_cash_entries (organization_id,account_id,period_id,property_id,invoice_date,entry_kind,status,category,description,out_amount,in_amount,currency) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L,1,0,%L)',
      (SELECT organization_id FROM finance_inventory_auth_state),
      (SELECT petty_account_id FROM finance_inventory_auth_state),
      (SELECT petty_period_id FROM finance_inventory_auth_state),
      (SELECT property_id FROM finance_inventory_auth_state),
      '2026-07-10', 'expense', 'cleared', 'Admin direct', 'Admin direct', 'USD'
    ),
    false,
    'admin direct petty-cash DML is denied by table privilege'
  )
) attempts(statement, allowed, label);

SELECT throws_ok(
  format(
    'SELECT public.create_finance_income_item(%L,%L,%L,NULL,%L,%L,%L,1,0,NULL,NULL,%L,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT other_unit_id FROM finance_inventory_auth_state),
    'rent', 'Wrong unit', '2026-07-15', 'AUTH-WRONG-UNIT'
  ),
  '23503',
  'Unit not found under selected property',
  'income RPC rejects a same-organization unit linked to the wrong property'
);

SELECT throws_ok(
  format(
    'SELECT public.create_finance_income_item(%L,%L,%L,%L,%L,%L,%L,1,0,NULL,NULL,%L,NULL)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT other_property_id FROM finance_inventory_auth_state),
    (SELECT other_unit_id FROM finance_inventory_auth_state),
    (SELECT lease_id FROM finance_inventory_auth_state),
    'rent', 'Wrong lease', '2026-07-15', 'AUTH-WRONG-LEASE'
  ),
  '23503',
  'Lease not found for selected property and unit',
  'income RPC rejects a same-organization lease linked to the wrong property and unit'
);

SELECT lives_ok(
  format(
    'SELECT public.create_finance_income_item(%L,%L,%L,%L,%L,%L,%L,1,0,NULL,NULL,%L,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT unit_id FROM finance_inventory_auth_state),
    (SELECT lease_id FROM finance_inventory_auth_state),
    'rent', 'Ignored when payer person is present', '2026-07-15',
    'AUTH-UNRELATED-PAYER',
    (SELECT other_person_id FROM finance_inventory_auth_state)
  ),
  'income RPC currently accepts an unrelated same-organization payer person for a lease'
);

SELECT lives_ok(
  format(
    'SELECT public.create_finance_expense_item(%L,%L,%L,%L,%L,%L,%L,%L,NULL,1,%L,NULL,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT other_unit_id FROM finance_inventory_auth_state),
    (SELECT task_id FROM finance_inventory_auth_state),
    (SELECT other_person_id FROM finance_inventory_auth_state),
    'vendor_bill', 'Unrelated vendor', '2026-07-15', 'Repairs',
    'AUTH-WRONG-EXPENSE-UNIT'
  ),
  'expense RPC currently accepts a same-organization unit from the wrong property'
);

SELECT lives_ok(
  format(
    'SELECT public.create_finance_expense_item(%L,%L,%L,%L,%L,%L,%L,%L,NULL,1,%L,NULL,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT other_property_id FROM finance_inventory_auth_state),
    (SELECT other_unit_id FROM finance_inventory_auth_state),
    (SELECT task_id FROM finance_inventory_auth_state),
    (SELECT other_person_id FROM finance_inventory_auth_state),
    'vendor_bill', 'Unrelated vendor', '2026-07-15', 'Repairs',
    'AUTH-WRONG-EXPENSE-TASK'
  ),
  'expense RPC currently accepts a task and vendor person unrelated to the selected property'
);

SELECT throws_ok(
  format(
    'SELECT public.create_ledger_entry(%L,%L,%L,%L,%L,%L,2,%L,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT unit_id FROM finance_inventory_auth_state),
    '2026-07-11', 'income', 'Rent', 'USD', 'Generic create evidence'
  ),
  '42501',
  NULL,
  'admin generic Ledger create RPC is exposed but fails at private-helper execute denial'
);

SELECT lives_ok(
  format(
    'SELECT public.update_ledger_entry(%L,%L,%L,%L,%L,%L,%L,11,%L,%L)',
    (SELECT ledger_id FROM finance_inventory_auth_state),
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT unit_id FROM finance_inventory_auth_state),
    '2026-07-05', 'income', 'Authorization updated', 'USD',
    'Generic update evidence'
  ),
  'admin generic Ledger update RPC currently succeeds'
);

SELECT lives_ok(
  format(
    'SELECT public.archive_ledger_entry(%L,%L)',
    (SELECT ledger_id FROM finance_inventory_auth_state),
    (SELECT organization_id FROM finance_inventory_auth_state)
  ),
  'admin generic Ledger archive RPC currently succeeds'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.post_accounting_journal(
        %L,%L,%L,%L,%L,%L,%L,%L,NULL,
        jsonb_build_array(
          jsonb_build_object(
            'account_system_code','client_cash_clearing',
            'debit_amount',5,
            'credit_amount',0,
            'property_id',%L::uuid
          ),
          jsonb_build_object(
            'account_system_code','rental_income',
            'debit_amount',0,
            'credit_amount',5,
            'property_id',%L::uuid
          )
        )
      )
    $sql$,
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT book_id FROM finance_inventory_auth_accounting),
    'manual_authorization_test',
    (SELECT request_id FROM finance_inventory_auth_state),
    'authorization-generic-post',
    '2026-07-12',
    'USD',
    'Generic journal post evidence',
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state)
  ),
  '42501',
  NULL,
  'admin generic journal post RPC is exposed but fails at private-helper execute denial'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.reverse_accounting_journal(
        %L,
        (
          SELECT id
          FROM public.accounting_journal_entries
          WHERE posting_key = 'authorization-generic-post'
        ),
        %L,
        %L
      )
    $sql$,
    (SELECT organization_id FROM finance_inventory_auth_state),
    '2026-07-13',
    'Authorization generic reversal evidence'
  ),
  '23503',
  'Accounting journal not found',
  'admin generic journal reversal RPC is exposed but cannot reverse the journal that the denied post did not create'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM finance_inventory_auth_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT public.create_ledger_entry(%L,%L,NULL,%L,%L,%L,1,%L,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    '2026-07-14', 'income', 'Manager attempt', 'USD', 'Manager attempt'
  ),
  '42501', 'Not authorized', 'manager generic Ledger RPC is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM finance_inventory_auth_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT public.create_ledger_entry(%L,%L,%L,%L,%L,%L,1,%L,%L)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT property_id FROM finance_inventory_auth_state),
    (SELECT other_unit_id FROM finance_inventory_auth_state),
    '2026-07-14', 'income', 'Wrong unit', 'USD', 'Wrong unit'
  ),
  '42501', NULL,
  'same-organization wrong-property unit attempt is stopped by private-helper denial before scope validation'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.lease_deposits (organization_id,lease_id,deposit_type,amount,currency,status) VALUES (%L,%L,%L,1,%L,%L)',
    (SELECT cross_organization_id FROM finance_inventory_auth_state),
    (SELECT lease_id FROM finance_inventory_auth_state),
    'security', 'USD', 'pending'
  ),
  '42501', NULL, 'cross-organization lease DML is denied before link evaluation'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.finance_receipt_allocations (organization_id,receipt_id,income_item_id,amount) VALUES (%L,%L,%L,2)',
    (SELECT organization_id FROM finance_inventory_auth_state),
    (SELECT receipt_id FROM finance_inventory_auth_state),
    (SELECT other_income_id FROM finance_inventory_auth_state)
  ),
  '42501',
  NULL,
  'direct allocation wrong-property link is denied by table privilege'
);

SELECT lives_ok(
  format(
    'UPDATE public.ledger_entries SET source_type=%L,source_id=%L WHERE id=%L AND organization_id=%L',
    'finance_income',
    (SELECT other_income_id FROM finance_inventory_auth_state),
    (
      SELECT id
      FROM public.ledger_entries
      WHERE organization_id = (
        SELECT organization_id FROM finance_inventory_auth_state
      )
        AND description = 'Admin direct'
      LIMIT 1
    ),
    (SELECT organization_id FROM finance_inventory_auth_state)
  ),
  'admin direct Ledger update can impersonate a reserved namespace with a wrong-property source'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT * FROM finish();

ROLLBACK;
