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
  gen_random_uuid() AS income_id,
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
VALUES (:'organization_id', :'admin_id', 'admin');
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
  (:'organization_id', :'property_id', :'owner_id', 60, true, '2026-01-01', NULL),
  (:'organization_id', :'property_id', :'archived_owner_id', 60, false, '2026-01-01', NULL);
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
   'other', 'Management company', '2026-07-03', NULL, 125, 0, 'USD',
   'open', 'MANAGEMENT-FEE-WITHOUT-AGREEMENT');

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

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, amount, currency, status, received_on
) VALUES (:'deposit_id', :'organization_id', :'lease_id', 1500, 'USD', 'partially_returned', '2026-07-01');
INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference
) VALUES
  (:'organization_id', :'property_id', :'deposit_id', 'received', '2026-07-01', 1500, 'USD', 'DEPOSIT-RECEIPT'),
  (:'organization_id', :'property_id', :'deposit_id', 'refunded', '2026-07-20', 500, 'USD', 'DEPOSIT-REFUND');

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
