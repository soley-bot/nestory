\set ON_ERROR_STOP on

SELECT
  gen_random_uuid() AS admin_id,
  gen_random_uuid() AS organization_id,
  gen_random_uuid() AS property_id,
  gen_random_uuid() AS unit_id,
  gen_random_uuid() AS tenant_id,
  gen_random_uuid() AS owner_id,
  gen_random_uuid() AS archived_owner_id,
  gen_random_uuid() AS lease_id,
  gen_random_uuid() AS deposit_id,
  gen_random_uuid() AS utilities_deposit_id,
  gen_random_uuid() AS pet_deposit_id,
  gen_random_uuid() AS other_deposit_id,
  gen_random_uuid() AS income_id,
  gen_random_uuid() AS clean_income_id,
  gen_random_uuid() AS clean_receipt_id,
  gen_random_uuid() AS clean_ledger_id,
  gen_random_uuid() AS clean_journal_id,
  gen_random_uuid() AS expense_id,
  gen_random_uuid() AS request_id,
  gen_random_uuid() AS maintenance_ledger_id,
  gen_random_uuid() AS petty_ledger_id,
  gen_random_uuid() AS petty_account_id,
  gen_random_uuid() AS petty_period_id
\gset

SELECT 'finance-inventory-' || left(:'admin_id', 8) || '@example.test' AS admin_email
\gset

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000', :'admin_id', 'authenticated',
  'authenticated', :'admin_email',
  extensions.crypt('finance-inventory-local-only', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  :'organization_id',
  'Disposable finance inventory fixture',
  'finance-inventory-' || left(:'organization_id', 8)
);
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (:'organization_id', :'admin_id', 'super_admin');
INSERT INTO public.properties (id, organization_id, name, code, property_type, status)
VALUES (:'property_id', :'organization_id', 'Inventory fixture property', 'FIN-INV', 'apartment', 'active');
INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
) VALUES (:'unit_id', :'organization_id', :'property_id', 'A-01', 'occupied', 1500, 'USD');
INSERT INTO public.people (id, organization_id, display_name)
VALUES
  (:'tenant_id', :'organization_id', 'Inventory tenant'),
  (:'owner_id', :'organization_id', 'Current owner'),
  (:'archived_owner_id', :'organization_id', 'Archived historical owner');
INSERT INTO public.person_roles (organization_id, person_id, role)
VALUES
  (:'organization_id', :'tenant_id', 'tenant'),
  (:'organization_id', :'owner_id', 'owner'),
  (:'organization_id', :'archived_owner_id', 'owner');
INSERT INTO public.person_contacts (
  organization_id, person_id, contact_type, contact_name, is_primary,
  archived_at
) VALUES (
  :'organization_id', :'archived_owner_id', 'other',
  'Archived historical contact', true, now()
);
INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
) VALUES (
  :'lease_id', :'organization_id', :'property_id', :'unit_id', :'tenant_id',
  'Inventory tenant', '2026-01-01', '2026-12-31', 1500, 'USD', 1500, 'USD', 'active'
);
INSERT INTO public.property_owners (
  organization_id, property_id, person_id, ownership_percent, is_primary,
  started_on, ended_on
) VALUES
  (:'organization_id', :'property_id', :'owner_id', 100, true, '2026-07-20', NULL),
  (:'organization_id', :'property_id', :'archived_owner_id', 100, false, '2026-01-01', '2026-07-10');
UPDATE public.people SET archived_at = now() WHERE id = :'archived_owner_id';

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, unit_id, lease_id, income_type, payer_label,
  due_date, received_date, amount_due, amount_received, currency, status, reference
) VALUES
  (:'income_id', :'organization_id', :'property_id', :'unit_id', :'lease_id',
   'rent', 'Inventory tenant', '2026-07-01', '2026-07-01', 1500, 1500, 'USD',
   'received', 'BACKFILL-INCOME-INFERRED'),
  (gen_random_uuid(), :'organization_id', :'property_id', NULL, NULL,
   'owner_contribution', 'Owner', '2026-07-02', '2026-07-02', 500, 500, 'USD',
   'received', 'OWNER-CONTRIBUTION-COMPAT'),
  (gen_random_uuid(), :'organization_id', :'property_id', NULL, NULL,
   'management_fee', 'Management company', '2026-07-03', NULL, 125, 0, 'USD',
   'open', 'MANAGEMENT-FEE-WITHOUT-AGREEMENT');

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, unit_id, lease_id, income_type, payer_label,
  due_date, received_date, amount_due, amount_received, currency, status,
  reference
) VALUES (
  :'clean_income_id', :'organization_id', :'property_id', :'unit_id',
  :'lease_id', 'rent', 'Inventory tenant', '2026-07-06', '2026-07-06',
  60, 60, 'USD', 'posted', 'CLEAN-EXACT-INCOME'
);

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label, reference
) VALUES
  (:'organization_id', :'property_id', '2026-07-01', 600, 'USD', 'Inventory tenant', 'PARTIAL-RECEIPT'),
  (:'organization_id', :'property_id', '2026-07-05', 900, 'USD', 'Inventory tenant', 'FINAL-RECEIPT');
INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT :'organization_id', id, :'income_id',
  CASE reference WHEN 'PARTIAL-RECEIPT' THEN 600 ELSE 900 END
FROM public.finance_receipts
WHERE organization_id = :'organization_id' AND reference IN ('PARTIAL-RECEIPT', 'FINAL-RECEIPT');
INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference, reversal_of_id
)
SELECT
  organization_id, property_id, '2026-07-08', amount, currency, payer_label,
  'REVERSED-RECEIPT', id
FROM public.finance_receipts
WHERE organization_id = :'organization_id' AND reference = 'PARTIAL-RECEIPT';
INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT reversal.organization_id, reversal.id, original_allocation.income_item_id,
  original_allocation.amount
FROM public.finance_receipts reversal
JOIN public.finance_receipts original
  ON original.id = reversal.reversal_of_id
JOIN public.finance_receipt_allocations original_allocation
  ON original_allocation.receipt_id = original.id
WHERE reversal.organization_id = :'organization_id'
  AND reversal.reference = 'REVERSED-RECEIPT';

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference
)
SELECT organization_id, property_id, '2026-07-02', amount_due, currency,
  payer_label, 'OWNER-CONTRIBUTION-RECEIPT'
FROM public.finance_income_items
WHERE organization_id = :'organization_id'
  AND reference = 'OWNER-CONTRIBUTION-COMPAT';
INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT receipt.organization_id, receipt.id, income.id, receipt.amount
FROM public.finance_receipts receipt
JOIN public.finance_income_items income
  ON income.organization_id = receipt.organization_id
 AND income.reference = 'OWNER-CONTRIBUTION-COMPAT'
WHERE receipt.organization_id = :'organization_id'
  AND receipt.reference = 'OWNER-CONTRIBUTION-RECEIPT';

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, reference
) VALUES (
  :'clean_receipt_id', :'organization_id', :'property_id', '2026-07-06', 60,
  'USD', 'Inventory tenant', 'CLEAN-EXACT-RECEIPT'
);
INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
) VALUES (
  :'organization_id', :'clean_receipt_id', :'clean_income_id', 60
);

SELECT app_private.ensure_accounting_books_and_accounts(
  :'organization_id',
  'USD'
);
INSERT INTO public.ledger_entries (
  id, organization_id, property_id, unit_id, transaction_date, direction,
  category, amount, currency, description, source_type, source_id
) VALUES (
  :'clean_ledger_id', :'organization_id', :'property_id', :'unit_id',
  '2026-07-06', 'income', 'Rent', 60, 'USD',
  'Clean exactly linked fixture projection', 'finance_income',
  :'clean_income_id'
);
UPDATE public.finance_income_items
SET ledger_entry_id = :'clean_ledger_id'
WHERE id = :'clean_income_id';
INSERT INTO public.accounting_journal_entries (
  id, organization_id, book_id, entry_date, currency, description, source_type,
  source_id, posting_key, payload_hash, legacy_ledger_entry_id
)
SELECT
  :'clean_journal_id', :'organization_id', book.id, '2026-07-06', 'USD',
  'Clean exactly linked fixture journal', 'finance_income', :'clean_income_id',
  'clean-exact-fixture', repeat('c', 64), :'clean_ledger_id'
FROM public.accounting_books book
WHERE book.organization_id = :'organization_id'
  AND book.book_type = 'client'
  AND book.currency = 'USD'
  AND book.is_default
  AND book.archived_at IS NULL;
INSERT INTO public.accounting_journal_lines (
  organization_id, journal_entry_id, account_id, line_number, debit_amount,
  credit_amount, property_id, unit_id, lease_id
)
SELECT
  :'organization_id', :'clean_journal_id', account.id,
  CASE account.system_code
    WHEN 'client_cash_clearing' THEN 1
    ELSE 2
  END,
  CASE account.system_code
    WHEN 'client_cash_clearing' THEN 60
    ELSE 0
  END,
  CASE account.system_code
    WHEN 'rental_income' THEN 60
    ELSE 0
  END,
  :'property_id', :'unit_id', :'lease_id'
FROM public.accounting_accounts account
JOIN public.accounting_books book ON book.id = account.book_id
WHERE book.organization_id = :'organization_id'
  AND book.book_type = 'client'
  AND book.currency = 'USD'
  AND account.system_code IN ('client_cash_clearing', 'rental_income');
UPDATE public.ledger_entries
SET accounting_journal_entry_id = :'clean_journal_id'
WHERE id = :'clean_ledger_id';

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, due_date, paid_date, amount, currency, category, status, reference
) VALUES
  (:'expense_id', :'organization_id', :'property_id', :'unit_id', 'vendor_bill',
   'Inventory vendor', '2026-07-02', '2026-07-15', '2026-07-02', 800, 'USD',
   'Repairs', 'paid', 'BACKFILL-EXPENSE-INFERRED'),
  (gen_random_uuid(), :'organization_id', :'property_id', NULL, 'owner_payout',
   'Owner', '2026-07-06', '2026-07-06', NULL, 250, 'USD', 'Owner payout',
   'approved', 'OWNER-PAYOUT-COMPAT');
INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label, reference
) VALUES
  (:'organization_id', :'property_id', '2026-07-02', 300, 'USD', 'Inventory vendor', 'PARTIAL-PAYMENT'),
  (:'organization_id', :'property_id', '2026-07-07', 500, 'USD', 'Inventory vendor', 'FINAL-PAYMENT');
INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT :'organization_id', id, :'expense_id',
  CASE reference WHEN 'PARTIAL-PAYMENT' THEN 300 ELSE 500 END
FROM public.finance_payments
WHERE organization_id = :'organization_id' AND reference IN ('PARTIAL-PAYMENT', 'FINAL-PAYMENT');
INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label,
  reference, reversal_of_id
)
SELECT
  organization_id, property_id, '2026-07-09', amount, currency, payee_label,
  'REVERSED-PAYMENT', id
FROM public.finance_payments
WHERE organization_id = :'organization_id' AND reference = 'PARTIAL-PAYMENT';
INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT reversal.organization_id, reversal.id, original_allocation.expense_item_id,
  original_allocation.amount
FROM public.finance_payments reversal
JOIN public.finance_payments original
  ON original.id = reversal.reversal_of_id
JOIN public.finance_payment_allocations original_allocation
  ON original_allocation.payment_id = original.id
WHERE reversal.organization_id = :'organization_id'
  AND reversal.reference = 'REVERSED-PAYMENT';

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, deposit_type, amount, currency, status,
  received_on
) VALUES
  (:'deposit_id', :'organization_id', :'lease_id', 'security', 1500, 'USD', 'partially_returned', '2026-07-01'),
  (:'utilities_deposit_id', :'organization_id', :'lease_id', 'utilities', 300, 'USD', 'held', '2026-07-02'),
  (:'pet_deposit_id', :'organization_id', :'lease_id', 'pet', 200, 'USD', 'held', '2026-07-03'),
  (:'other_deposit_id', :'organization_id', :'lease_id', 'other', 100, 'USD', 'held', '2026-07-04');
INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, reversal_of_id
) VALUES
  (:'organization_id', :'property_id', :'deposit_id', 'received', '2026-07-01', 1500, 'USD', 'DEPOSIT-RECEIPT', NULL),
  (:'organization_id', :'property_id', :'deposit_id', 'refunded', '2026-07-20', 500, 'USD', 'DEPOSIT-REFUND', NULL),
  (:'organization_id', :'property_id', :'utilities_deposit_id', 'received', '2026-07-02', 300, 'USD', 'UTILITIES-DEPOSIT', NULL),
  (:'organization_id', :'property_id', :'pet_deposit_id', 'received', '2026-07-03', 200, 'USD', 'PET-DEPOSIT', NULL),
  (:'organization_id', :'property_id', :'other_deposit_id', 'received', '2026-07-04', 100, 'USD', 'OTHER-DEPOSIT', NULL);
INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, reversal_of_id
)
SELECT
  organization_id, property_id, lease_deposit_id, 'reversed', '2026-07-05',
  amount, currency, 'OTHER-DEPOSIT-REVERSAL', id
FROM public.lease_deposit_events
WHERE organization_id = :'organization_id'
  AND reference = 'OTHER-DEPOSIT';

INSERT INTO public.ledger_entries (
  id, organization_id, property_id, unit_id, transaction_date, direction,
  category, amount, currency, description, source_type, source_id
) VALUES
  (:'maintenance_ledger_id', :'organization_id', :'property_id', :'unit_id',
   '2026-07-10', 'expense', 'Maintenance', 175, 'USD',
   'Direct maintenance Ledger effect', 'manual', NULL),
  (:'petty_ledger_id', :'organization_id', :'property_id', :'unit_id',
   '2026-07-11', 'expense', 'Petty cash', 45, 'USD',
   'Petty cash projection', 'petty_cash', gen_random_uuid());

INSERT INTO public.tenant_requests (
  id, organization_id, property_id, unit_id, title, category, status
) VALUES (
  :'request_id', :'organization_id', :'property_id', :'unit_id',
  'Fixture maintenance', 'Plumbing', 'closed'
);
INSERT INTO public.tasks (
  organization_id, tenant_request_id, property_id, unit_id, title, category,
  status, actual_cost_amount, actual_cost_currency, ledger_entry_id, completed_at
) VALUES (
  :'organization_id', :'request_id', :'property_id', :'unit_id',
  'Fixture repair', 'Plumbing', 'completed', 175, 'USD',
  :'maintenance_ledger_id', '2026-07-10'
);

INSERT INTO public.petty_cash_accounts (
  id, organization_id, account_number, name, currency, float_amount
) VALUES (:'petty_account_id', :'organization_id', 'FIXTURE-PC', 'Fixture petty cash', 'USD', 500);
INSERT INTO public.petty_cash_periods (
  id, organization_id, account_id, period_start, opening_balance_amount, status
) VALUES (:'petty_period_id', :'organization_id', :'petty_account_id', '2026-07-01', 500, 'open');
INSERT INTO public.petty_cash_entries (
  organization_id, account_id, period_id, property_id, unit_id, ledger_entry_id,
  invoice_date, clear_date, entry_kind, status, category, description,
  out_amount, in_amount, currency
) VALUES (
  :'organization_id', :'petty_account_id', :'petty_period_id', :'property_id',
  :'unit_id', :'petty_ledger_id', '2026-07-11', NULL, 'expense', 'posted',
  'Supplies', 'Invoice date has no evidenced disbursement date', 45, 0, 'USD'
);

INSERT INTO public.ledger_entries (
  organization_id, property_id, transaction_date, direction, category, amount,
  currency, description, source_type
)
SELECT
  :'organization_id', :'property_id', '2026-07-15', 'income',
  'Pagination fixture', 0.01, 'USD',
  'Generated inventory row ' || sequence_number, 'manual'
FROM generate_series(1, 5205) AS sequence_number;

INSERT INTO public.ledger_period_locks (
  organization_id, period_start, locked_at, locked_by, reason
) VALUES (
  :'organization_id', '2026-07-01', now(), :'admin_id', 'Deliberate lock mismatch'
);

CREATE TEMP TABLE finance_inventory_fixture_context AS
SELECT
  :'organization_id'::uuid AS organization_id,
  :'property_id'::uuid AS property_id,
  :'clean_income_id'::uuid AS clean_income_id,
  :'clean_ledger_id'::uuid AS clean_ledger_id,
  :'clean_journal_id'::uuid AS clean_journal_id;

DO $fixture_check$
DECLARE
  fixture_context record;
  source_count bigint;
BEGIN
  SELECT * INTO STRICT fixture_context
  FROM finance_inventory_fixture_context;

  SELECT count(*)
  INTO source_count
  FROM app_private.get_finance_inventory_page(
    fixture_context.organization_id,
    fixture_context.property_id,
    'USD',
    '2026-07-01',
    '2026-07-31',
    'sources',
    NULL,
    1000,
    NULL,
    NULL
  );

  IF source_count <> 1000 THEN
    RAISE EXCEPTION 'Fixture first diagnostic page did not reach its 1,000-row bound';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_private.get_finance_inventory_page(
      fixture_context.organization_id, fixture_context.property_id, 'USD',
      '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['receipt_allocation']
    )
    WHERE payload ->> 'parentTransactionId' = (
      SELECT id::text
      FROM public.finance_receipts
      WHERE organization_id = fixture_context.organization_id
        AND reference = 'REVERSED-RECEIPT'
    )
      AND payload ->> 'signedAmount' = '-600.00'
  ) THEN
    RAISE EXCEPTION 'Fixture receipt reversal allocation is not negative';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_private.get_finance_inventory_page(
      fixture_context.organization_id, fixture_context.property_id, 'USD',
      '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['payment_allocation']
    )
    WHERE payload ->> 'parentTransactionId' = (
      SELECT id::text
      FROM public.finance_payments
      WHERE organization_id = fixture_context.organization_id
        AND reference = 'REVERSED-PAYMENT'
    )
      AND payload ->> 'signedAmount' = '-300.00'
  ) THEN
    RAISE EXCEPTION 'Fixture payment reversal allocation is not negative';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_private.get_finance_inventory_page(
      fixture_context.organization_id, fixture_context.property_id, 'USD',
      '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['deposit_event']
    )
    WHERE payload ->> 'reversalOfId' IS NOT NULL
      AND payload ->> 'signedAmount' = '-100.00'
  ) THEN
    RAISE EXCEPTION 'Fixture deposit reversal is not the opposite custody effect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_private.get_finance_inventory_page(
      fixture_context.organization_id, fixture_context.property_id, 'USD',
      '2026-07-01', '2026-07-31', 'diagnostics', NULL, 1000,
      ARRAY[
        'DUPLICATE_EXACT_SOURCE_IDENTITY',
        'WRONG_LINKED_RECORD_SCOPE',
        'MAINTENANCE_BILL_DUPLICATE_EXACT_TASK',
        'PETTY_CASH_BILL_DUPLICATE_EXACT_LEDGER'
      ],
      NULL
    )
    WHERE payload ->> 'severity' = 'Critical'
      AND (
        payload ->> 'sourceId' IN (
          fixture_context.clean_income_id::text,
          fixture_context.clean_ledger_id::text,
          fixture_context.clean_journal_id::text
        )
        OR payload ->> 'ledgerEntryId' = fixture_context.clean_ledger_id::text
        OR payload ->> 'journalId' = fixture_context.clean_journal_id::text
      )
  ) THEN
    RAISE EXCEPTION 'Clean exactly linked fixture event produced a false Critical diagnostic';
  END IF;
END;
$fixture_check$;

SELECT jsonb_build_object(
  'environmentId', 'local-disposable',
  'projectId', 'nestory-finance-inventory',
  'organizationId', :'organization_id',
  'propertyId', :'property_id',
  'currency', 'USD',
  'periodStart', '2026-07-01',
  'periodEnd', '2026-07-31',
  'adminEmail', :'admin_email',
  'adminPassword', 'finance-inventory-local-only'
) AS finance_inventory_fixture_scope;
