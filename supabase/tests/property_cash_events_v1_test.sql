BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(61);

CREATE TEMP TABLE property_cash_events_test_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_rent_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_fee_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_rent_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_rent_reversal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_fee_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_rent_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_rent_reversal_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_owner_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_deposit_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_fee_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ledger_finance_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_operating_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_archived_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_maintenance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_operating_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_operating_reversal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_archived_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_maintenance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_operating_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_operating_reversal_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_owner_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_company_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_archived_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_maintenance_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_reversal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_period_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_cleared_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_uncleared_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_cleared_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_uncleared_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  maintenance_task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  maintenance_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  malformed_maintenance_task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  malformed_maintenance_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  represented_request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  represented_task_id uuid NOT NULL DEFAULT gen_random_uuid(),
  represented_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manual_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_allocation_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO property_cash_events_test_state DEFAULT VALUES;
GRANT SELECT ON property_cash_events_test_state TO anon, authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || user_id::text || '@example.test',
  extensions.crypt('property-cash-events-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT admin_id, 'cash-admin' FROM property_cash_events_test_state
  UNION ALL
  SELECT member_id, 'cash-member' FROM property_cash_events_test_state
  UNION ALL
  SELECT manager_id, 'cash-manager' FROM property_cash_events_test_state
  UNION ALL
  SELECT cross_admin_id, 'cash-cross-admin' FROM property_cash_events_test_state
) users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Property cash events test',
  'cash-events-' || left(organization_id::text, 8)
FROM property_cash_events_test_state
UNION ALL
SELECT cross_organization_id, 'Property cash events cross test',
  'cash-events-cross-' || left(cross_organization_id::text, 8)
FROM property_cash_events_test_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin'
FROM property_cash_events_test_state
UNION ALL
SELECT organization_id, member_id, 'member'
FROM property_cash_events_test_state
UNION ALL
SELECT organization_id, manager_id, 'manager'
FROM property_cash_events_test_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'admin'
FROM property_cash_events_test_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
)
SELECT property_id, organization_id, 'Cash contract property',
  'CASH-' || left(property_id::text, 8), 'apartment', 'active'
FROM property_cash_events_test_state
UNION ALL
SELECT cross_property_id, cross_organization_id, 'Cross cash property',
  'CROSS-' || left(cross_property_id::text, 8), 'apartment', 'active'
FROM property_cash_events_test_state;

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'C-01', 'occupied', 1000, 'USD'
FROM property_cash_events_test_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT owner_id, organization_id, 'Contract owner'
FROM property_cash_events_test_state
UNION ALL
SELECT tenant_id, organization_id, 'Contract tenant'
FROM property_cash_events_test_state
UNION ALL
SELECT vendor_id, organization_id, 'Contract vendor'
FROM property_cash_events_test_state;

INSERT INTO public.person_roles (organization_id, person_id, role)
SELECT organization_id, owner_id, 'owner'
FROM property_cash_events_test_state
UNION ALL
SELECT organization_id, tenant_id, 'tenant'
FROM property_cash_events_test_state
UNION ALL
SELECT organization_id, vendor_id, 'vendor'
FROM property_cash_events_test_state;

INSERT INTO public.property_owners (
  organization_id, property_id, person_id, ownership_percent, is_primary,
  started_on
)
SELECT organization_id, property_id, owner_id, 100, true, '2026-01-01'
FROM property_cash_events_test_state;

INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
)
SELECT lease_id, organization_id, property_id, unit_id, tenant_id,
  'Contract tenant', '2026-01-01', '2026-12-31', 1000, 'USD', 500, 'USD',
  'active'
FROM property_cash_events_test_state;

INSERT INTO public.ledger_entries (
  id, organization_id, property_id, unit_id, transaction_date, direction,
  category, amount, currency, description, source_type, source_id
)
SELECT ledger_finance_income_id, organization_id, property_id, unit_id,
  '2026-07-02'::date, 'income', 'Rent', 100, 'USD'::public.currency_code,
  'Exact finance income projection', 'finance_income', income_rent_id
FROM property_cash_events_test_state
UNION ALL
SELECT petty_cleared_ledger_id, organization_id, property_id, unit_id,
  '2026-07-18', 'expense', 'Petty cash', 15, 'USD',
  'Exact petty cash projection', 'petty_cash', petty_cleared_id
FROM property_cash_events_test_state
UNION ALL
SELECT petty_uncleared_ledger_id, organization_id, property_id, unit_id,
  '2026-07-19', 'expense', 'Petty cash', 12, 'USD',
  'Uncleared petty cash projection', 'petty_cash', petty_uncleared_id
FROM property_cash_events_test_state
UNION ALL
SELECT maintenance_ledger_id, organization_id, property_id, unit_id,
  '2026-07-20', 'expense', 'Maintenance', 40, 'USD',
  'Exact maintenance link only', 'maintenance_task', maintenance_task_id
FROM property_cash_events_test_state
UNION ALL
SELECT malformed_maintenance_ledger_id, organization_id, property_id, unit_id,
  '2026-07-25', 'expense', 'Maintenance', 17, 'USD',
  'Malformed maintenance link evidence', 'maintenance_task',
  malformed_maintenance_task_id
FROM property_cash_events_test_state
UNION ALL
SELECT represented_ledger_id, organization_id, property_id, unit_id,
  '2026-07-21', 'expense', 'Maintenance', 35, 'USD',
  'Maintenance represented by finance expense', 'finance_expense',
  expense_maintenance_id
FROM property_cash_events_test_state
UNION ALL
SELECT manual_ledger_id, organization_id, property_id, unit_id,
  '2026-07-22', 'expense', 'Legacy', 9, 'USD',
  'Unmatched legacy Ledger evidence', 'manual', NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, unit_id, lease_id, ledger_entry_id,
  income_type, payer_label, payer_person_id, due_date, amount_due, currency,
  status, reference, archived_at
)
SELECT income_rent_id, organization_id, property_id, unit_id, lease_id,
  ledger_finance_income_id, 'rent', 'Contract tenant', tenant_id,
  '2026-07-01'::date, 100, 'USD'::public.currency_code, 'open', 'CASH-RENT',
  now()
FROM property_cash_events_test_state
UNION ALL
SELECT income_owner_id, organization_id, property_id, NULL, NULL, NULL,
  'owner_contribution', 'Contract owner', owner_id, '2026-07-03', 50, 'USD',
  'open',
  'CASH-OWNER', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT income_deposit_id, organization_id, property_id, unit_id, lease_id,
  NULL, 'security_deposit', 'Contract tenant', tenant_id, '2026-07-04', 75, 'USD',
  'open', 'CASH-DEPOSIT-COMPAT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT income_fee_id, organization_id, property_id, NULL, NULL, NULL,
  'management_fee', 'Management company', NULL, '2026-07-05', 25, 'USD', 'open',
  'CASH-FEE', NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, reference, reversal_of_id
)
SELECT receipt_rent_id, organization_id, property_id, '2026-07-02'::date, 100,
  'USD'::public.currency_code, 'Contract tenant', 'CASH-RENT-RECEIPT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_rent_reversal_id, organization_id, property_id, '2026-07-06',
  100, 'USD', 'Contract tenant', 'CASH-RENT-REVERSAL', receipt_rent_id
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_owner_id, organization_id, property_id, '2026-07-03', 50,
  'USD', 'Contract owner', 'CASH-OWNER-RECEIPT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_deposit_id, organization_id, property_id, '2026-07-04', 75,
  'USD', 'Contract tenant', 'CASH-DEPOSIT-COMPAT-RECEIPT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_fee_id, organization_id, property_id, '2026-07-05', 25,
  'USD', 'Management company', 'CASH-FEE-RECEIPT', NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipt_allocations (
  id, organization_id, receipt_id, income_item_id, amount
)
SELECT receipt_rent_allocation_id, organization_id, receipt_rent_id,
  income_rent_id, 100
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_rent_reversal_allocation_id, organization_id,
  receipt_rent_reversal_id, income_rent_id, 100
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_owner_allocation_id, organization_id, receipt_owner_id,
  income_owner_id, 50
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_deposit_allocation_id, organization_id, receipt_deposit_id,
  income_deposit_id, 75
FROM property_cash_events_test_state
UNION ALL
SELECT receipt_fee_allocation_id, organization_id, receipt_fee_id,
  income_fee_id, 25
FROM property_cash_events_test_state;

INSERT INTO public.tenant_requests (
  id, organization_id, property_id, unit_id, title, category, status
)
SELECT request_id, organization_id, property_id, unit_id,
  'Exact maintenance request', 'General', 'closed'
FROM property_cash_events_test_state
UNION ALL
SELECT represented_request_id, organization_id, property_id, unit_id,
  'Represented maintenance request', 'General', 'closed'
FROM property_cash_events_test_state;

INSERT INTO public.tasks (
  id, organization_id, tenant_request_id, property_id, unit_id, title,
  category, status, vendor_person_id, actual_cost_amount,
  actual_cost_currency, ledger_entry_id, completed_at
)
SELECT maintenance_task_id, organization_id, request_id, property_id, unit_id,
  'Exact linked repair', 'Plumbing', 'completed', vendor_id, 40,
  'USD'::public.currency_code,
  maintenance_ledger_id, '2026-07-20'::timestamptz
FROM property_cash_events_test_state
UNION ALL
SELECT malformed_maintenance_task_id, organization_id, request_id, property_id,
  unit_id, 'Malformed linked repair', 'Plumbing', 'completed', vendor_id, 17,
  'USD', malformed_maintenance_ledger_id, '2026-07-25'
FROM property_cash_events_test_state
UNION ALL
SELECT represented_task_id, organization_id, represented_request_id,
  property_id, unit_id, 'Represented repair', 'Electrical', 'completed',
  vendor_id, 35, 'USD', represented_ledger_id, '2026-07-21'
FROM property_cash_events_test_state;

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, task_id, vendor_person_id,
  ledger_entry_id, expense_type, vendor_label, invoice_date, amount, currency,
  category, status, economic_scope, reference, archived_at
)
SELECT expense_operating_id, organization_id, property_id, unit_id,
  NULL::uuid, vendor_id, NULL::uuid, 'vendor_bill', 'Contract vendor',
  '2026-07-07'::date, 80,
  'USD'::public.currency_code,
  'Repairs', 'approved', 'property_expense', 'CASH-OPERATING-EXPENSE',
  NULL::timestamptz
FROM property_cash_events_test_state
UNION ALL
SELECT expense_owner_id, organization_id, property_id, NULL, NULL, NULL, NULL,
  'owner_payout', 'Contract owner', '2026-07-09', 30, 'USD',
  'Owner payout', 'approved', 'property_expense', 'CASH-OWNER-PAYOUT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT expense_company_id, organization_id, property_id, NULL, NULL, NULL,
  NULL, 'refund', 'Management company', '2026-07-10', 20, 'USD',
  'Company refund', 'approved', 'company_cost', 'CASH-COMPANY', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT expense_archived_id, organization_id, property_id, unit_id, NULL,
  vendor_id, NULL, 'utilities', 'Utility vendor', '2026-07-11', 45, 'USD',
  'Utilities', 'approved', 'property_expense', 'CASH-ARCHIVED-EXPENSE', now()
FROM property_cash_events_test_state
UNION ALL
SELECT expense_maintenance_id, organization_id, property_id, unit_id,
  represented_task_id, vendor_id, represented_ledger_id, 'maintenance',
  'Contract vendor', '2026-07-21', 35, 'USD', 'Maintenance', 'approved',
  'property_expense', 'CASH-REPRESENTED-MAINTENANCE', NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_payments (
  id, organization_id, property_id, paid_date, amount, currency, payee_label,
  reference, reversal_of_id
)
SELECT payment_operating_id, organization_id, property_id,
  '2026-07-08'::date, 80, 'USD'::public.currency_code, 'Contract vendor',
  'CASH-OPERATING-PAYMENT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT payment_operating_reversal_id, organization_id, property_id,
  '2026-07-09', 80, 'USD', 'Contract vendor',
  'CASH-OPERATING-PAYMENT-REVERSAL', payment_operating_id
FROM property_cash_events_test_state
UNION ALL
SELECT payment_owner_id, organization_id, property_id, '2026-07-10', 30,
  'USD', 'Contract owner', 'CASH-OWNER-PAYMENT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT payment_company_id, organization_id, property_id, '2026-07-11', 20,
  'USD', 'Management company', 'CASH-COMPANY-PAYMENT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT payment_archived_id, organization_id, property_id, '2026-07-12', 45,
  'USD', 'Utility vendor', 'CASH-ARCHIVED-PAYMENT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT payment_maintenance_id, organization_id, property_id, '2026-07-21', 35,
  'USD', 'Contract vendor', 'CASH-REPRESENTED-MAINTENANCE-PAYMENT', NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_payment_allocations (
  id, organization_id, payment_id, expense_item_id, amount
)
SELECT payment_operating_allocation_id, organization_id, payment_operating_id,
  expense_operating_id, 80
FROM property_cash_events_test_state
UNION ALL
SELECT payment_operating_reversal_allocation_id, organization_id,
  payment_operating_reversal_id, expense_operating_id, 80
FROM property_cash_events_test_state
UNION ALL
SELECT payment_owner_allocation_id, organization_id, payment_owner_id,
  expense_owner_id, 30
FROM property_cash_events_test_state
UNION ALL
SELECT payment_company_allocation_id, organization_id, payment_company_id,
  expense_company_id, 20
FROM property_cash_events_test_state
UNION ALL
SELECT payment_archived_allocation_id, organization_id, payment_archived_id,
  expense_archived_id, 45
FROM property_cash_events_test_state
UNION ALL
SELECT payment_maintenance_allocation_id, organization_id,
  payment_maintenance_id, expense_maintenance_id, 35
FROM property_cash_events_test_state;

-- Header residual fixtures prove both unapplied cash and over-allocation are
-- visible without assigning an economic meaning.
INSERT INTO public.finance_income_items (
  organization_id, property_id, income_type, payer_label, due_date, amount_due,
  currency, status, reference
)
SELECT
  state.organization_id, state.property_id, 'rent', 'Residual receipt payer',
  '2026-07-26', fixture.amount, 'USD', 'open', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('RESIDUAL-RECEIPT-UNAPPLIED-ITEM', 60::numeric),
  ('RESIDUAL-RECEIPT-OVERALLOCATED-ITEM', 80::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference
)
SELECT
  state.organization_id, state.property_id, '2026-07-26', fixture.amount,
  'USD', 'Residual receipt payer', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('RESIDUAL-RECEIPT-UNAPPLIED', 100::numeric),
  ('RESIDUAL-RECEIPT-OVERALLOCATED', 50::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT
  state.organization_id, receipt.id, income.id,
  CASE receipt.reference
    WHEN 'RESIDUAL-RECEIPT-UNAPPLIED' THEN 60
    ELSE 80
  END
FROM property_cash_events_test_state state
JOIN public.finance_receipts receipt
  ON receipt.organization_id = state.organization_id
 AND receipt.reference IN (
   'RESIDUAL-RECEIPT-UNAPPLIED',
   'RESIDUAL-RECEIPT-OVERALLOCATED'
 )
JOIN public.finance_income_items income
  ON income.organization_id = state.organization_id
 AND income.reference =
   CASE receipt.reference
     WHEN 'RESIDUAL-RECEIPT-UNAPPLIED'
       THEN 'RESIDUAL-RECEIPT-UNAPPLIED-ITEM'
     ELSE 'RESIDUAL-RECEIPT-OVERALLOCATED-ITEM'
   END;

INSERT INTO public.finance_expense_items (
  organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, reference
)
SELECT
  state.organization_id, state.property_id, 'vendor_bill',
  'Residual payment vendor', '2026-07-26', fixture.amount, 'USD', 'Repairs',
  'approved', 'property_expense', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('RESIDUAL-PAYMENT-UNALLOCATED-ITEM', 60::numeric),
  ('RESIDUAL-PAYMENT-OVERALLOCATED-ITEM', 80::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label,
  reference
)
SELECT
  state.organization_id, state.property_id, '2026-07-26', fixture.amount,
  'USD', 'Residual payment vendor', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('RESIDUAL-PAYMENT-UNALLOCATED', 100::numeric),
  ('RESIDUAL-PAYMENT-OVERALLOCATED', 50::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT
  state.organization_id, payment.id, expense.id,
  CASE payment.reference
    WHEN 'RESIDUAL-PAYMENT-UNALLOCATED' THEN 60
    ELSE 80
  END
FROM property_cash_events_test_state state
JOIN public.finance_payments payment
  ON payment.organization_id = state.organization_id
 AND payment.reference IN (
   'RESIDUAL-PAYMENT-UNALLOCATED',
   'RESIDUAL-PAYMENT-OVERALLOCATED'
 )
JOIN public.finance_expense_items expense
  ON expense.organization_id = state.organization_id
 AND expense.reference =
   CASE payment.reference
     WHEN 'RESIDUAL-PAYMENT-UNALLOCATED'
       THEN 'RESIDUAL-PAYMENT-UNALLOCATED-ITEM'
     ELSE 'RESIDUAL-PAYMENT-OVERALLOCATED-ITEM'
   END;

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference, reversal_of_id
)
SELECT
  state.organization_id, state.property_id, '2026-07-27', original.amount,
  original.currency, original.payer_label, 'CASH-FEE-RECEIPT-REVERSAL',
  original.id
FROM property_cash_events_test_state state
JOIN public.finance_receipts original
  ON original.organization_id = state.organization_id
 AND original.reference = 'CASH-FEE-RECEIPT';

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT state.organization_id, reversal.id, state.income_fee_id, reversal.amount
FROM property_cash_events_test_state state
JOIN public.finance_receipts reversal
  ON reversal.organization_id = state.organization_id
 AND reversal.reference = 'CASH-FEE-RECEIPT-REVERSAL';

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, deposit_type, amount, currency, status,
  received_on
)
SELECT lease_deposit_id, organization_id, lease_id, 'security', 500, 'USD',
  'held', '2026-07-13'
FROM property_cash_events_test_state;

INSERT INTO public.lease_deposit_events (
  id, organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, reversal_of_id
)
SELECT deposit_event_id, organization_id, property_id, lease_deposit_id,
  'received', '2026-07-13'::date, 500, 'USD'::public.currency_code,
  'CASH-DEPOSIT', NULL
FROM property_cash_events_test_state
UNION ALL
SELECT deposit_reversal_id, organization_id, property_id, lease_deposit_id,
  'reversed', '2026-07-14', 500, 'USD', 'CASH-DEPOSIT-REVERSAL',
  deposit_event_id
FROM property_cash_events_test_state;

INSERT INTO public.petty_cash_accounts (
  id, organization_id, account_number, name, currency, float_amount
)
SELECT petty_account_id, organization_id,
  'CASH-PC-' || left(petty_account_id::text, 8), 'Cash contract petty cash',
  'USD', 100
FROM property_cash_events_test_state;

INSERT INTO public.petty_cash_periods (
  id, organization_id, account_id, period_start, opening_balance_amount, status
)
SELECT petty_period_id, organization_id, petty_account_id, '2026-07-01', 100,
  'open'
FROM property_cash_events_test_state;

INSERT INTO public.petty_cash_entries (
  id, organization_id, account_id, period_id, property_id, unit_id,
  ledger_entry_id, invoice_date, clear_date, entry_kind, status, category,
  description, out_amount, in_amount, currency, economic_scope
)
SELECT petty_cleared_id, organization_id, petty_account_id, petty_period_id,
  property_id, unit_id, petty_cleared_ledger_id, '2026-07-17'::date,
  '2026-07-18'::date,
  'expense', 'posted', 'Supplies', 'Cleared petty cash', 15, 0,
  'USD'::public.currency_code,
  'property_expense'
FROM property_cash_events_test_state
UNION ALL
SELECT petty_uncleared_id, organization_id, petty_account_id, petty_period_id,
  property_id, unit_id, petty_uncleared_ledger_id, '2026-07-19', NULL,
  'expense', 'posted', 'Supplies', 'Uncleared petty cash', 12, 0, 'USD',
  'property_expense'
FROM property_cash_events_test_state;

INSERT INTO public.ledger_entries (
  organization_id, property_id, transaction_date, direction, category, amount,
  currency, description, source_type
)
SELECT
  state.organization_id, state.property_id, '2025-07-25', 'income', 'Legacy',
  1, 'USD', 'Bulk deterministic traversal ' || sequence_number, 'manual'
FROM property_cash_events_test_state state
CROSS JOIN generate_series(1, 5005) AS sequence_number;

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, income_type, payer_label, due_date,
  amount_due, currency, status, reference
)
SELECT cross_income_id, cross_organization_id, cross_property_id, 'rent',
  'Cross tenant', '2026-07-01', 999, 'USD', 'open', 'CROSS-CASH-INCOME'
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, reference
)
SELECT cross_receipt_id, cross_organization_id, cross_property_id,
  '2026-07-02', 999, 'USD', 'Cross tenant', 'CROSS-CASH-RECEIPT'
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipt_allocations (
  id, organization_id, receipt_id, income_item_id, amount
)
SELECT cross_allocation_id, cross_organization_id, cross_receipt_id,
  cross_income_id, 999
FROM property_cash_events_test_state;

-- A reversal header with the same total but redistributed allocations must
-- never resolve any of its allocation effects.
INSERT INTO public.finance_income_items (
  organization_id, property_id, income_type, payer_label, due_date, amount_due,
  currency, status, reference
)
SELECT
  state.organization_id, state.property_id, 'rent', 'Malformed receipt payer',
  '2026-07-23', fixture.amount, 'USD', 'open', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('MALFORMED-RECEIPT-A', 60::numeric),
  ('MALFORMED-RECEIPT-B', 40::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference
)
SELECT organization_id, property_id, '2026-07-23', 100, 'USD',
  'Malformed receipt payer', 'MALFORMED-RECEIPT-ORIGINAL'
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference, reversal_of_id
)
SELECT
  state.organization_id, state.property_id, '2026-07-24', 100, 'USD',
  'Malformed receipt payer', 'MALFORMED-RECEIPT-REVERSAL', original.id
FROM property_cash_events_test_state state
JOIN public.finance_receipts original
  ON original.organization_id = state.organization_id
 AND original.reference = 'MALFORMED-RECEIPT-ORIGINAL';

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT
  state.organization_id, receipt.id, income.id,
  CASE income.reference
    WHEN 'MALFORMED-RECEIPT-A' THEN 60
    ELSE 40
  END
FROM property_cash_events_test_state state
JOIN public.finance_receipts receipt
  ON receipt.organization_id = state.organization_id
 AND receipt.reference = 'MALFORMED-RECEIPT-ORIGINAL'
JOIN public.finance_income_items income
  ON income.organization_id = state.organization_id
 AND income.reference IN ('MALFORMED-RECEIPT-A', 'MALFORMED-RECEIPT-B');

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT
  state.organization_id, receipt.id, income.id, 50
FROM property_cash_events_test_state state
JOIN public.finance_receipts receipt
  ON receipt.organization_id = state.organization_id
 AND receipt.reference = 'MALFORMED-RECEIPT-REVERSAL'
JOIN public.finance_income_items income
  ON income.organization_id = state.organization_id
 AND income.reference IN ('MALFORMED-RECEIPT-A', 'MALFORMED-RECEIPT-B');

-- A reversal payment header missing one original obligation allocation must
-- keep its surviving allocation visible but unresolved.
INSERT INTO public.finance_expense_items (
  organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, reference
)
SELECT
  state.organization_id, state.property_id, 'vendor_bill',
  'Malformed payment vendor', '2026-07-23', fixture.amount, 'USD', 'Repairs',
  'approved', 'property_expense', fixture.reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('MALFORMED-PAYMENT-A', 60::numeric),
  ('MALFORMED-PAYMENT-B', 40::numeric)
) fixture(reference, amount);

INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label,
  reference
)
SELECT organization_id, property_id, '2026-07-23', 100, 'USD',
  'Malformed payment vendor', 'MALFORMED-PAYMENT-ORIGINAL'
FROM property_cash_events_test_state;

INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label,
  reference, reversal_of_id
)
SELECT
  state.organization_id, state.property_id, '2026-07-24', 100, 'USD',
  'Malformed payment vendor', 'MALFORMED-PAYMENT-REVERSAL', original.id
FROM property_cash_events_test_state state
JOIN public.finance_payments original
  ON original.organization_id = state.organization_id
 AND original.reference = 'MALFORMED-PAYMENT-ORIGINAL';

INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT
  state.organization_id, payment.id, expense.id,
  CASE expense.reference
    WHEN 'MALFORMED-PAYMENT-A' THEN 60
    ELSE 40
  END
FROM property_cash_events_test_state state
JOIN public.finance_payments payment
  ON payment.organization_id = state.organization_id
 AND payment.reference = 'MALFORMED-PAYMENT-ORIGINAL'
JOIN public.finance_expense_items expense
  ON expense.organization_id = state.organization_id
 AND expense.reference IN ('MALFORMED-PAYMENT-A', 'MALFORMED-PAYMENT-B');

INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT state.organization_id, payment.id, expense.id, 60
FROM property_cash_events_test_state state
JOIN public.finance_payments payment
  ON payment.organization_id = state.organization_id
 AND payment.reference = 'MALFORMED-PAYMENT-REVERSAL'
JOIN public.finance_expense_items expense
  ON expense.organization_id = state.organization_id
 AND expense.reference = 'MALFORMED-PAYMENT-A';

-- Malformed scope rows are permitted by the current direct-admin boundary but
-- must never become resolved canonical effects.
INSERT INTO public.finance_income_items (
  organization_id, property_id, income_type, payer_label, due_date, amount_due,
  currency, status, reference, lease_id, unit_id
)
SELECT organization_id, property_id, 'rent', 'Scope payer',
  '2026-07-20'::date, 11,
  'USD', 'open', 'SCOPE-RECEIPT-LEASE-UNIT', lease_id, NULL
FROM property_cash_events_test_state;

INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference
)
SELECT organization_id, property_id, '2026-07-20', fixture.amount, 'USD',
  'Scope payer', fixture.receipt_reference
FROM property_cash_events_test_state
CROSS JOIN (VALUES
  ('SCOPE-RECEIPT-LEASE-UNIT-HEADER', 11::numeric)
) fixture(receipt_reference, amount);

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT state.organization_id, receipt.id, income.id, receipt.amount
FROM property_cash_events_test_state state
JOIN public.finance_receipts receipt
 ON receipt.organization_id = state.organization_id
 AND receipt.reference IN (
   'SCOPE-RECEIPT-LEASE-UNIT-HEADER'
 )
JOIN public.finance_income_items income
  ON income.organization_id = state.organization_id
 AND (
   (receipt.reference = 'SCOPE-RECEIPT-LEASE-UNIT-HEADER'
     AND income.reference = 'SCOPE-RECEIPT-LEASE-UNIT')
 );

INSERT INTO public.people (organization_id, display_name)
SELECT cross_organization_id, 'Cross-organization scope vendor'
FROM property_cash_events_test_state;

-- Simulate legacy corruption that current checked task writes prevent. The
-- shadow read contract must retain one unresolved maintenance evidence row
-- without leaking the invalid cross-organization vendor or unit identity.
SET LOCAL session_replication_role = replica;
UPDATE public.tasks AS task
SET
  unit_id = gen_random_uuid(),
  vendor_person_id = cross_vendor.id
FROM property_cash_events_test_state AS state
JOIN public.people AS cross_vendor
  ON cross_vendor.organization_id = state.cross_organization_id
 AND cross_vendor.display_name = 'Cross-organization scope vendor'
WHERE task.id = state.malformed_maintenance_task_id;
SET LOCAL session_replication_role = origin;

INSERT INTO public.finance_expense_items (
  organization_id, property_id, unit_id, task_id, vendor_person_id,
  expense_type, vendor_label, invoice_date, amount, currency, category, status,
  economic_scope, reference
)
SELECT
  state.organization_id, state.property_id, NULL, state.represented_task_id,
  NULL, 'maintenance', 'Scope vendor', '2026-07-20'::date, 13, 'USD',
  'Maintenance',
  'approved', 'property_expense', 'SCOPE-PAYMENT-TASK-UNIT'
FROM property_cash_events_test_state state;

INSERT INTO public.finance_expense_items (
  organization_id, property_id, unit_id, task_id, vendor_person_id,
  expense_type, vendor_label, invoice_date, amount, currency, category, status,
  economic_scope, reference
)
SELECT
  state.organization_id, state.property_id, NULL, NULL, cross_vendor.id,
  'vendor_bill', 'Cross vendor', '2026-07-20'::date, 14, 'USD', 'Repairs',
  'approved', 'property_expense', 'SCOPE-PAYMENT-VENDOR'
FROM property_cash_events_test_state state
JOIN public.people cross_vendor
  ON cross_vendor.organization_id = state.cross_organization_id
 AND cross_vendor.display_name = 'Cross-organization scope vendor';

INSERT INTO public.finance_payments (
  organization_id, property_id, paid_date, amount, currency, payee_label,
  reference
)
SELECT
  state.organization_id, state.property_id, '2026-07-20', fixture.amount,
  'USD', 'Scope vendor', fixture.payment_reference
FROM property_cash_events_test_state state
CROSS JOIN (VALUES
  ('SCOPE-PAYMENT-TASK-UNIT-HEADER', 13::numeric),
  ('SCOPE-PAYMENT-VENDOR-HEADER', 14::numeric)
) fixture(payment_reference, amount);

INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT state.organization_id, payment.id, expense.id, payment.amount
FROM property_cash_events_test_state state
JOIN public.finance_payments payment
  ON payment.organization_id = state.organization_id
 AND payment.reference LIKE 'SCOPE-PAYMENT-%-HEADER'
JOIN public.finance_expense_items expense
  ON expense.organization_id = state.organization_id
 AND payment.reference =
   CASE expense.reference
     WHEN 'SCOPE-PAYMENT-TASK-UNIT' THEN 'SCOPE-PAYMENT-TASK-UNIT-HEADER'
     WHEN 'SCOPE-PAYMENT-VENDOR' THEN 'SCOPE-PAYMENT-VENDOR-HEADER'
   END;

INSERT INTO public.lease_deposits (
  organization_id, lease_id, deposit_type, amount, currency, status, notes
)
SELECT organization_id, lease_id, 'other', 16, 'USD', 'held',
  'SCOPE-DEPOSIT-ORIGINAL-PARENT'
FROM property_cash_events_test_state;

INSERT INTO public.lease_deposits (
  organization_id, lease_id, deposit_type, amount, currency, status, notes
)
SELECT organization_id, lease_id, 'other', 16, 'USD', 'held',
  'SCOPE-DEPOSIT-REVERSAL-PARENT'
FROM property_cash_events_test_state;

INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference
)
SELECT state.organization_id, state.property_id, deposit.id, 'received',
  '2026-07-21', 16, 'USD', 'SCOPE-DEPOSIT-ORIGINAL'
FROM property_cash_events_test_state state
JOIN public.lease_deposits deposit
  ON deposit.organization_id = state.organization_id
 AND deposit.notes = 'SCOPE-DEPOSIT-ORIGINAL-PARENT';

INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, reversal_of_id
)
SELECT state.organization_id, state.property_id, reversal_parent.id,
  'reversed', '2026-07-22', 16, 'USD', 'SCOPE-DEPOSIT-REVERSAL', original.id
FROM property_cash_events_test_state state
JOIN public.lease_deposits reversal_parent
  ON reversal_parent.organization_id = state.organization_id
 AND reversal_parent.notes = 'SCOPE-DEPOSIT-REVERSAL-PARENT'
JOIN public.lease_deposit_events original
  ON original.organization_id = state.organization_id
 AND original.reference = 'SCOPE-DEPOSIT-ORIGINAL';

INSERT INTO public.ledger_entries (
  organization_id, property_id, transaction_date, direction, category, amount,
  currency, description, source_type
)
SELECT organization_id, property_id, '2026-07-22', 'income', 'Legacy', 0,
  'USD', 'ZERO-LEDGER-NON-EVENT', 'manual'
FROM property_cash_events_test_state;

INSERT INTO public.petty_cash_entries (
  organization_id, account_id, period_id, property_id, unit_id, invoice_date,
  clear_date, entry_kind, status, category, description, out_amount, in_amount,
  currency, economic_scope
)
SELECT
  state.organization_id, state.petty_account_id, state.petty_period_id,
  state.property_id, state.unit_id, '2025-07-28', NULL, 'expense', 'posted',
  'Supplies', 'NULL-TAIL-' || sequence_number, 1, 0, 'USD',
  'property_expense'
FROM property_cash_events_test_state state
CROSS JOIN generate_series(1, 2) AS sequence_number;

SELECT app_private.ensure_accounting_books_and_accounts(
  (SELECT organization_id FROM property_cash_events_test_state),
  'USD'
);

CREATE TEMP TABLE property_cash_events_accounts AS
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
    SELECT organization_id FROM property_cash_events_test_state
  )
  AND book.book_type = 'client'
  AND book.currency = 'USD'
GROUP BY book.id;

INSERT INTO public.accounting_journal_entries (
  id, organization_id, book_id, entry_date, currency, description, source_type,
  source_id, posting_key, payload_hash, legacy_ledger_entry_id
)
SELECT
  state.journal_id, state.organization_id, account.book_id, '2026-07-02',
  'USD', 'Exact projection metadata', 'finance_income',
  state.income_rent_id, 'cash-contract-projection', repeat('c', 64),
  state.ledger_finance_income_id
FROM property_cash_events_test_state state
CROSS JOIN property_cash_events_accounts account;

INSERT INTO public.accounting_journal_lines (
  organization_id, journal_entry_id, account_id, line_number, debit_amount,
  credit_amount, property_id, unit_id, lease_id, tenant_person_id
)
SELECT
  state.organization_id, state.journal_id, account.cash_account_id, 1,
  100, 0, state.property_id, state.unit_id, state.lease_id, state.tenant_id
FROM property_cash_events_test_state state
CROSS JOIN property_cash_events_accounts account
UNION ALL
SELECT
  state.organization_id, state.journal_id, account.income_account_id, 2,
  0, 100, state.property_id, state.unit_id, state.lease_id, state.tenant_id
FROM property_cash_events_test_state state
CROSS JOIN property_cash_events_accounts account;

UPDATE public.ledger_entries ledger
SET accounting_journal_entry_id = state.journal_id
FROM property_cash_events_test_state state
WHERE ledger.id = state.ledger_finance_income_id;

SELECT has_function(
  'public',
  'get_property_cash_events_v1_page',
  ARRAY[
    'uuid', 'uuid', 'public.currency_code', 'date', 'date',
    'date', 'text', 'uuid', 'integer'
  ],
  'the checked property cash events v1 page RPC exists'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_property_cash_events_v1_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_property_cash_events_v1_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.get_property_cash_events_v1_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  ),
  'RPC execution is granted only to authenticated'
);

SELECT ok(
  NOT routine.prosecdef,
  'RPC is SECURITY INVOKER'
)
FROM pg_catalog.pg_proc routine
WHERE routine.oid =
  'public.get_property_cash_events_v1_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)'::regprocedure;

SET LOCAL ROLE anon;
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '42501',
  NULL,
  'anonymous invocation is denied by ACL'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM property_cash_events_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '42501', 'Not authorized', 'member invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM property_cash_events_test_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '42501', 'Not authorized', 'manager invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM property_cash_events_test_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '42501', 'Not authorized', 'cross-organization admin invocation is denied'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_cash_events_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT cross_property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '22023', 'Property does not belong to organization',
  'a property outside the requested organization is rejected'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2025-07-01', '2026-07-02'
  ),
  '22023', 'Period must be between 1 and 366 days',
  'periods over 366 days are rejected'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,1001)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  '22023', 'Page size must be between 1 and 1000',
  'page size is bounded to 1000'
);

SELECT lives_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_v1_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_events_test_state),
    (SELECT property_id FROM property_cash_events_test_state),
    'USD', '2026-07-01', '2026-07-31'
  ),
  'same-organization admin invocation succeeds'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_receipts
    WHERE organization_id = (
      SELECT cross_organization_id FROM property_cash_events_test_state
    )
  ),
  0::bigint,
  'base-table RLS hides cross-organization receipt rows from the caller'
);

SELECT ok(
  to_jsonb(event) ?& ARRAY[
    'contract_version', 'event_key', 'organization_id', 'property_id',
    'unit_id', 'lease_id', 'task_id', 'owner_person_id',
    'tenant_person_id', 'vendor_person_id', 'event_date', 'period_start',
    'currency', 'amount', 'owner_cash_effect', 'operating_cash_effect',
    'deposit_liability_effect', 'management_fee_effect', 'economic_class',
    'statement_section', 'category_code', 'classification_status',
    'source_type', 'source_id',
    'source_parent_type', 'source_parent_id', 'obligation_type',
    'obligation_id', 'reversal_source_type', 'reversal_source_id',
    'is_reversal', 'is_legacy', 'requires_resolution', 'resolution_codes',
    'reconciliation_source_id', 'reconciliation_state', 'ledger_entry_id',
    'journal_entry_id', 'projection_status', 'created_at', 'created_by',
    'updated_at', 'updated_by', 'archived_at'
  ]
  AND event.contract_version = 'property_cash_events_v1'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 10
) event
LIMIT 1;

SELECT ok(
  source_parent_type = 'finance_receipt'
  AND source_parent_id = (
    SELECT receipt_rent_id FROM property_cash_events_test_state
  )
  AND obligation_type = 'finance_income_item'
  AND obligation_id = (
    SELECT income_rent_id FROM property_cash_events_test_state
  )
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect = 100
  AND operating_cash_effect = 100
  AND deposit_liability_effect = 0
  AND management_fee_effect = 0,
  'receipt allocation preserves identity and explicitly provisional effects'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT receipt_rent_allocation_id FROM property_cash_events_test_state
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id = (
      SELECT receipt_rent_allocation_id FROM property_cash_events_test_state
    )
  ),
  1::bigint,
  'an archived settled income obligation remains visible'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id = (
      SELECT payment_archived_allocation_id
      FROM property_cash_events_test_state
    )
  ),
  1::bigint,
  'an archived settled expense obligation remains visible'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id IN (
      (SELECT ledger_finance_income_id FROM property_cash_events_test_state),
      (SELECT petty_cleared_ledger_id FROM property_cash_events_test_state),
      (SELECT journal_id FROM property_cash_events_test_state)
    )
  ),
  0::bigint,
  'exact Ledger projections and journals do not become duplicate events'
);

SELECT ok(
  (
    SELECT sum(owner_cash_effect) = 0
      AND bool_and(
        classification_status = 'provisional_current_obligation'
        AND requires_resolution
      )
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id IN (
      (SELECT receipt_rent_allocation_id FROM property_cash_events_test_state),
      (SELECT receipt_rent_reversal_allocation_id
       FROM property_cash_events_test_state)
    )
  ),
  'receipt reversal pair nets to zero and remains explicitly provisional'
);

SELECT ok(
  is_reversal
  AND reversal_source_type = 'receipt_allocation'
  AND reversal_source_id = (
    SELECT receipt_rent_allocation_id FROM property_cash_events_test_state
  )
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect = -100
  AND operating_cash_effect = -100,
  'receipt reversal derives exact identity and explicitly provisional signs'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT receipt_rent_reversal_allocation_id
  FROM property_cash_events_test_state
);

SELECT ok(
  (
    SELECT sum(operating_cash_effect) = 0
      AND bool_and(
        classification_status = 'provisional_current_obligation'
        AND requires_resolution
      )
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id IN (
      (SELECT payment_operating_allocation_id
       FROM property_cash_events_test_state),
      (SELECT payment_operating_reversal_allocation_id
       FROM property_cash_events_test_state)
    )
  ),
  'payment reversal pair nets to zero and remains explicitly provisional'
);

SELECT ok(
  count(*) = 2
  AND bool_and(
    classification_status = 'unresolved_reversal_header'
    AND requires_resolution
    AND reversal_source_id IS NULL
    AND owner_cash_effect IS NULL
    AND operating_cash_effect IS NULL
    AND deposit_liability_effect IS NULL
    AND management_fee_effect IS NULL
  ),
  'redistributed receipt reversal header is wholly unresolved and non-counting'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id IN (
  SELECT allocation.id
  FROM public.finance_receipt_allocations allocation
  JOIN public.finance_receipts receipt
    ON receipt.id = allocation.receipt_id
  WHERE receipt.reference = 'MALFORMED-RECEIPT-REVERSAL'
);

SELECT ok(
  count(*) = 1
  AND bool_and(
    classification_status = 'unresolved_reversal_header'
    AND requires_resolution
    AND reversal_source_id IS NOT NULL
    AND owner_cash_effect IS NULL
    AND operating_cash_effect IS NULL
    AND deposit_liability_effect IS NULL
    AND management_fee_effect IS NULL
  ),
  'incomplete payment reversal header is wholly unresolved and non-counting'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id IN (
  SELECT allocation.id
  FROM public.finance_payment_allocations allocation
  JOIN public.finance_payments payment
    ON payment.id = allocation.payment_id
  WHERE payment.reference = 'MALFORMED-PAYMENT-REVERSAL'
);

SELECT ok(
  count(*) = 1
  AND bool_and(
    classification_status = 'unresolved_source_scope'
    AND requires_resolution
    AND owner_cash_effect IS NULL
    AND operating_cash_effect IS NULL
    AND deposit_liability_effect IS NULL
    AND management_fee_effect IS NULL
  )
  AND (
    SELECT array_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)
    FROM pg_catalog.pg_enum AS enum_value
    JOIN pg_catalog.pg_type AS enum_type
      ON enum_type.oid = enum_value.enumtypid
    JOIN pg_catalog.pg_namespace AS enum_namespace
      ON enum_namespace.oid = enum_type.typnamespace
    WHERE enum_namespace.nspname = 'public'
      AND enum_type.typname = 'currency_code'
  ) = ARRAY['USD']::name[],
  'receipt lease-unit mismatch is non-counting; currency mismatch is schema-impossible'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id IN (
  SELECT allocation.id
  FROM public.finance_receipt_allocations allocation
  JOIN public.finance_receipts receipt
    ON receipt.id = allocation.receipt_id
  WHERE receipt.reference IN (
    'SCOPE-RECEIPT-LEASE-UNIT-HEADER'
  )
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    WHERE constraint_record.conname = 'finance_income_items_payer_person_fk'
      AND constraint_record.contype = 'f'
      AND pg_catalog.pg_get_constraintdef(constraint_record.oid) LIKE
        'FOREIGN KEY (organization_id, payer_person_id) REFERENCES people(organization_id, id)%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    WHERE constraint_record.conname = 'leases_primary_tenant_person_fk'
      AND constraint_record.contype = 'f'
      AND pg_catalog.pg_get_constraintdef(constraint_record.oid) LIKE
        'FOREIGN KEY (organization_id, primary_tenant_person_id) REFERENCES people(organization_id, id)%'
  ),
  'receipt owner and tenant people are organization-scoped by composite FKs'
);

SELECT ok(
  count(*) = 2
  AND bool_and(
    classification_status = 'unresolved_source_scope'
    AND requires_resolution
    AND owner_cash_effect IS NULL
    AND operating_cash_effect IS NULL
    AND deposit_liability_effect IS NULL
    AND management_fee_effect IS NULL
  ),
  'payment task-unit and person-organization mismatches stay non-counting'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id IN (
  SELECT allocation.id
  FROM public.finance_payment_allocations allocation
  JOIN public.finance_payments payment
    ON payment.id = allocation.payment_id
  WHERE payment.reference IN (
    'SCOPE-PAYMENT-TASK-UNIT-HEADER',
    'SCOPE-PAYMENT-VENDOR-HEADER'
  )
);

SELECT ok(
  count(*) = 1
  AND bool_and(
    classification_status = 'unresolved_source_scope'
    AND requires_resolution
    AND owner_person_id IS NULL
    AND tenant_person_id IS NULL
    AND vendor_person_id IS NULL
    AND owner_cash_effect IS NULL
    AND operating_cash_effect IS NULL
    AND deposit_liability_effect IS NULL
    AND management_fee_effect IS NULL
  ),
  'cross-organization payment vendor never escapes through person context'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id IN (
  SELECT allocation.id
  FROM public.finance_payment_allocations allocation
  JOIN public.finance_payments payment
    ON payment.id = allocation.payment_id
  WHERE payment.reference = 'SCOPE-PAYMENT-VENDOR-HEADER'
);

SELECT is(
  (
    SELECT sum(deposit_liability_effect)
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id IN (
      (SELECT deposit_event_id FROM property_cash_events_test_state),
      (SELECT deposit_reversal_id FROM property_cash_events_test_state)
    )
  ),
  0::numeric,
  'directly linked deposit reversal pair nets liability to zero'
);

SELECT ok(
  classification_status = 'unresolved_source_scope'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL
  AND deposit_liability_effect IS NULL
  AND management_fee_effect IS NULL,
  'deposit reversal linked to a different deposit parent is visible but non-counting'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT id
  FROM public.lease_deposit_events
  WHERE reference = 'SCOPE-DEPOSIT-REVERSAL'
);

SELECT ok(
  economic_class = 'owner_contribution'
  AND statement_section = 'owner_funding'
  AND owner_person_id = (
    SELECT owner_id FROM property_cash_events_test_state
  )
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect = 50
  AND operating_cash_effect = 0
  AND deposit_liability_effect = 0
  AND management_fee_effect = 0,
  'owner contribution effects are explicit but provisional'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT receipt_owner_allocation_id FROM property_cash_events_test_state
);

UPDATE public.finance_income_items
SET income_type = 'rent'
WHERE id = (
  SELECT income_owner_id FROM property_cash_events_test_state
);

SELECT ok(
  economic_class = 'operating_income'
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect = 50
  AND operating_cash_effect = 50
  AND deposit_liability_effect = 0
  AND management_fee_effect = 0,
  'obligation mutation changes only economics already marked provisional'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT receipt_owner_allocation_id FROM property_cash_events_test_state
);

SELECT ok(
  economic_class = 'management_fee'
  AND statement_section = 'management_fees'
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect = 0
  AND deposit_liability_effect = 0
  AND management_fee_effect = 25
  AND (to_jsonb(event)->'resolution_codes')
    ? 'management_fee_owner_recognition_unresolved',
  'management fee keeps its fee effect while owner recognition remains unknown'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
) event
WHERE source_id = (
  SELECT receipt_fee_allocation_id FROM property_cash_events_test_state
);

SELECT ok(
  is_reversal
  AND owner_cash_effect IS NULL
  AND operating_cash_effect = 0
  AND deposit_liability_effect = 0
  AND management_fee_effect = -25
  AND (to_jsonb(event)->'resolution_codes')
    ? 'management_fee_owner_recognition_unresolved',
  'management fee reversal exactly reverses only the fee effect'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
) event
WHERE source_id = (
  SELECT allocation.id
  FROM public.finance_receipt_allocations allocation
  JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
  WHERE receipt.reference = 'CASH-FEE-RECEIPT-REVERSAL'
);

SELECT ok(
  (
    SELECT count(*) = 1
      AND bool_and(
        event.event_key = 'receipt_header_residual:' || receipt.id::text
        AND event.category_code = 'unapplied_receipt'
        AND event.amount = 40
        AND event.event_date = receipt.received_date
        AND event.economic_class = 'legacy_unclassified'
        AND event.statement_section = 'unresolved'
        AND event.owner_cash_effect IS NULL
        AND event.operating_cash_effect IS NULL
        AND event.deposit_liability_effect IS NULL
        AND event.management_fee_effect IS NULL
        AND event.requires_resolution
        AND (to_jsonb(event)->'resolution_codes')
          ? 'receipt_header_unapplied'
      )
    FROM public.finance_receipts receipt
    LEFT JOIN public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
      ON event.source_type = 'receipt_header_residual'
     AND event.source_id = receipt.id
    WHERE receipt.reference = 'RESIDUAL-RECEIPT-UNAPPLIED'
  ),
  'receipt header amount above allocations emits one unapplied residual'
);

SELECT ok(
  (
    SELECT count(*) = 1
      AND bool_and(
        event.category_code = 'overallocated_receipt'
        AND event.amount = 30
        AND event.requires_resolution
        AND (to_jsonb(event)->'resolution_codes')
          ? 'receipt_header_overallocated'
      )
    FROM public.finance_receipts receipt
    LEFT JOIN public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
      ON event.source_type = 'receipt_header_residual'
     AND event.source_id = receipt.id
    WHERE receipt.reference = 'RESIDUAL-RECEIPT-OVERALLOCATED'
  ),
  'receipt allocations above header emit one over-allocation residual'
);

SELECT ok(
  (
    SELECT count(*) = 1
      AND bool_and(
        event.event_key = 'payment_header_residual:' || payment.id::text
        AND event.category_code = 'unallocated_payment'
        AND event.amount = 40
        AND event.event_date = payment.paid_date
        AND event.economic_class = 'legacy_unclassified'
        AND event.statement_section = 'unresolved'
        AND event.owner_cash_effect IS NULL
        AND event.operating_cash_effect IS NULL
        AND event.deposit_liability_effect IS NULL
        AND event.management_fee_effect IS NULL
        AND event.requires_resolution
        AND (to_jsonb(event)->'resolution_codes')
          ? 'payment_header_unallocated'
      )
    FROM public.finance_payments payment
    LEFT JOIN public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
      ON event.source_type = 'payment_header_residual'
     AND event.source_id = payment.id
    WHERE payment.reference = 'RESIDUAL-PAYMENT-UNALLOCATED'
  ),
  'payment header amount above allocations emits one unallocated residual'
);

SELECT ok(
  (
    SELECT count(*) = 1
      AND bool_and(
        event.category_code = 'overallocated_payment'
        AND event.amount = 30
        AND event.requires_resolution
        AND (to_jsonb(event)->'resolution_codes')
          ? 'payment_header_overallocated'
      )
    FROM public.finance_payments payment
    LEFT JOIN public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
      ON event.source_type = 'payment_header_residual'
     AND event.source_id = payment.id
    WHERE payment.reference = 'RESIDUAL-PAYMENT-OVERALLOCATED'
  ),
  'payment allocations above header emit one over-allocation residual'
);

SELECT ok(
  economic_class = 'owner_distribution'
  AND statement_section = 'owner_distributions'
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect = -30
  AND operating_cash_effect = 0
  AND deposit_liability_effect = 0
  AND management_fee_effect = 0,
  'owner payout compatibility effects remain explicitly provisional'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT payment_owner_allocation_id FROM property_cash_events_test_state
);

SELECT ok(
  economic_class = 'security_deposit'
  AND statement_section = 'deposits'
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL
  AND deposit_liability_effect IS NULL
  AND management_fee_effect IS NULL,
  'security-deposit compatibility receipt is visible, unresolved, and non-counting'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT receipt_deposit_allocation_id FROM property_cash_events_test_state
);

SELECT ok(
  economic_class = 'legacy_unclassified'
  AND statement_section = 'unresolved'
  AND classification_status = 'provisional_current_obligation'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL,
  'company-scope payment is visible as unresolved null-effect evidence'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT payment_company_allocation_id FROM property_cash_events_test_state
);

SELECT ok(
  event_date = '2026-07-18'
  AND classification_status = 'source_stable'
  AND owner_cash_effect = -15
  AND operating_cash_effect = -15
  AND requires_resolution
  AND (to_jsonb(event)->'resolution_codes')
    ? 'missing_reconciliation_source',
  'posted property petty cash keeps exact effects but exposes missing reconciliation'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
) event
WHERE source_id = (
  SELECT petty_cleared_id FROM property_cash_events_test_state
);

SELECT ok(
  event_date IS NULL
  AND period_start IS NULL
  AND classification_status = 'unresolved_evidence'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL,
  'petty cash without clear date never fabricates date or zero effects'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31',
  NULL,
  'petty_cash_entry',
  coalesce(
    (
      SELECT entry.id
      FROM public.petty_cash_entries AS entry
      WHERE entry.organization_id = (
        SELECT organization_id FROM property_cash_events_test_state
      )
        AND entry.id < (
          SELECT petty_uncleared_id FROM property_cash_events_test_state
        )
      ORDER BY entry.id DESC
      LIMIT 1
    ),
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  1000
)
WHERE source_id = (
  SELECT petty_uncleared_id FROM property_cash_events_test_state
);

SELECT ok(
  source_type = 'maintenance_task'
  AND source_id = (
    SELECT maintenance_task_id FROM property_cash_events_test_state
  )
  AND ledger_entry_id = (
    SELECT maintenance_ledger_id FROM property_cash_events_test_state
  )
  AND vendor_person_id = (
    SELECT vendor_id FROM property_cash_events_test_state
  )
  AND economic_class = 'legacy_unclassified'
  AND statement_section = 'unresolved'
  AND classification_status = 'unresolved_evidence'
  AND is_legacy
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL
  AND deposit_liability_effect IS NULL
  AND management_fee_effect IS NULL
  AND (to_jsonb(event)->'resolution_codes')
    ? 'maintenance_cash_settlement_unproven',
  'maintenance-only Ledger evidence is visible but never treated as paid cash'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
) event
WHERE source_id = (
  SELECT maintenance_task_id FROM property_cash_events_test_state
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_type = 'maintenance_task'
      AND source_id = (
        SELECT maintenance_task_id FROM property_cash_events_test_state
      )
  ),
  1::bigint,
  'valid maintenance-only Ledger evidence emits exactly one unresolved row'
);

SELECT ok(
  coalesce(
    (
      SELECT
        ledger_entry_id = (
          SELECT malformed_maintenance_ledger_id
          FROM property_cash_events_test_state
        )
        AND unit_id IS NULL
        AND vendor_person_id IS NULL
        AND economic_class = 'legacy_unclassified'
        AND classification_status = 'unresolved_evidence'
        AND is_legacy
        AND requires_resolution
        AND owner_cash_effect IS NULL
        AND operating_cash_effect IS NULL
        AND deposit_liability_effect IS NULL
        AND management_fee_effect IS NULL
        AND (to_jsonb(event)->'resolution_codes')
          ? 'maintenance_cash_settlement_unproven'
        AND (to_jsonb(event)->'resolution_codes') ? 'source_scope_invalid'
      FROM public.get_property_cash_events_v1_page(
        (SELECT organization_id FROM property_cash_events_test_state),
        (SELECT property_id FROM property_cash_events_test_state),
        'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
      ) event
      WHERE source_type = 'maintenance_task'
        AND source_id = (
          SELECT malformed_maintenance_task_id
          FROM property_cash_events_test_state
        )
    ),
    false
  ),
  'malformed maintenance scope remains visible once and unresolved'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_type = 'maintenance_task'
      AND source_id = (
        SELECT represented_task_id FROM property_cash_events_test_state
      )
  ),
  0::bigint,
  'maintenance does not duplicate an exact finance expense representation'
);

SELECT ok(
  source_type = 'ledger_entry'
  AND is_legacy
  AND classification_status = 'unresolved_evidence'
  AND requires_resolution
  AND owner_cash_effect IS NULL
  AND operating_cash_effect IS NULL,
  'unmatched active Ledger row remains visible as unresolved legacy evidence'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id = (
  SELECT manual_ledger_id FROM property_cash_events_test_state
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id = (
      SELECT id
      FROM public.ledger_entries
      WHERE description = 'ZERO-LEDGER-NON-EVENT'
    )
  ),
  0::bigint,
  'zero-amount Ledger rows are deliberately excluded as non-owner-relevant'
);

SELECT ok(
  ARRAY[
    'deposit_event',
    'ledger_entry',
    'maintenance_task',
    'payment_allocation',
    'payment_header_residual',
    'petty_cash_entry',
    'receipt_allocation',
    'receipt_header_residual'
  ] <@ array_agg(DISTINCT source_type ORDER BY source_type),
  'mixed supported source families are present in one contract'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
);

SELECT ok(
  bool_and(owner_person_id IS NULL),
  'live owner roster is never used to infer historical event owner identity'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_id <> (
  SELECT receipt_owner_allocation_id FROM property_cash_events_test_state
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE (
      source_type = 'receipt_header_residual'
      AND source_id = (
        SELECT receipt_rent_id FROM property_cash_events_test_state
      )
    )
    OR (
      source_type = 'payment_header_residual'
      AND source_id = (
        SELECT payment_operating_id FROM property_cash_events_test_state
      )
    )
  ),
  0::bigint,
  'balanced receipt and payment headers emit no residual event'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
    WHERE event.requires_resolution
      AND (
        coalesce(
          pg_catalog.jsonb_typeof(to_jsonb(event)->'resolution_codes'),
          'missing'
        ) <> 'array'
        OR coalesce(
          pg_catalog.jsonb_array_length(
            to_jsonb(event)->'resolution_codes'
          ),
          0
        ) = 0
      )
  ),
  'every requires-resolution row exposes at least one reason code'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    ) event
    WHERE pg_catalog.jsonb_typeof(
      to_jsonb(event)->'resolution_codes'
    ) = 'array'
      AND (
        SELECT array_agg(code ORDER BY ordinal)
          IS DISTINCT FROM array_agg(DISTINCT code ORDER BY code)
        FROM pg_catalog.jsonb_array_elements_text(
          to_jsonb(event)->'resolution_codes'
        ) WITH ORDINALITY AS codes(code, ordinal)
      )
  ),
  'resolution codes are deterministic, sorted, and unique'
);

SELECT ok(
  bool_and(
    (to_jsonb(event)->'reconciliation_source_id') = 'null'::jsonb
    AND (
      NOT event.requires_resolution
      OR to_jsonb(event)->>'reconciliation_state' =
        'missing_stable_identity'
    )
  ),
  'current reconciliation identity and state are explicit'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
) event;

SELECT ok(
  count(*) = 2
  AND bool_and(owner_cash_effect IS NULL)
  AND sum(management_fee_effect) = 0,
  'management fee original and exact reversal net only the fee effect'
)
FROM public.get_property_cash_events_v1_page(
  (SELECT organization_id FROM property_cash_events_test_state),
  (SELECT property_id FROM property_cash_events_test_state),
  'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
)
WHERE source_type = 'receipt_allocation'
  AND obligation_id = (
    SELECT income_fee_id FROM property_cash_events_test_state
  );

SELECT is(
  (
    SELECT journal_entry_id
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 1000
    )
    WHERE source_id = (
      SELECT receipt_rent_allocation_id FROM property_cash_events_test_state
    )
  ),
  (SELECT journal_id FROM property_cash_events_test_state),
  'journal identity is exposed only as projection metadata'
);

SELECT is(
  (
    SELECT array_agg(event_key ORDER BY event_date ASC NULLS LAST, source_type, source_id)
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 100
    )
  ),
  (
    SELECT array_agg(event_key ORDER BY event_date ASC NULLS LAST, source_type, source_id)
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31', NULL, NULL, NULL, 100
    )
  ),
  'repeated first-page loads are deterministic'
);

RESET ROLE;

UPDATE public.ledger_entries
SET transaction_date = '2026-07-25'
WHERE organization_id = (
    SELECT organization_id FROM property_cash_events_test_state
  )
  AND description LIKE 'Bulk deterministic traversal %';

UPDATE public.petty_cash_entries
SET invoice_date = '2026-07-28'
WHERE organization_id = (
    SELECT organization_id FROM property_cash_events_test_state
  )
  AND description LIKE 'NULL-TAIL-%';

SET LOCAL ROLE authenticated;

CREATE TEMP TABLE property_cash_events_traversal (
  event_key text PRIMARY KEY,
  event_date date,
  source_type text NOT NULL,
  source_id uuid NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON property_cash_events_traversal TO authenticated;

DO $traverse$
DECLARE
  cursor_event_date date;
  cursor_source_type text;
  cursor_source_id uuid;
  page_rows integer;
  page_number integer := 0;
BEGIN
  LOOP
    page_number := page_number + 1;
    IF page_number > 20 THEN
      RAISE EXCEPTION 'Property cash event traversal did not terminate';
    END IF;

    INSERT INTO property_cash_events_traversal (
      event_key, event_date, source_type, source_id
    )
    SELECT
      page.event_key, page.event_date, page.source_type, page.source_id
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM property_cash_events_test_state),
      (SELECT property_id FROM property_cash_events_test_state),
      'USD', '2026-07-01', '2026-07-31',
      cursor_event_date, cursor_source_type, cursor_source_id, 1000
    ) page;

    GET DIAGNOSTICS page_rows = ROW_COUNT;
    EXIT WHEN page_rows < 1000;

    SELECT
      traversed.event_date, traversed.source_type, traversed.source_id
    INTO cursor_event_date, cursor_source_type, cursor_source_id
    FROM property_cash_events_traversal traversed
    ORDER BY
      traversed.event_date DESC NULLS FIRST,
      traversed.source_type DESC,
      traversed.source_id DESC
    LIMIT 1;
  END LOOP;
END;
$traverse$;

SELECT ok(
  (SELECT count(*) FROM property_cash_events_traversal) > 5000,
  'deterministic keyset traversal returns more than 5000 events'
);

SELECT is(
  (SELECT count(*) FROM property_cash_events_traversal),
  (SELECT count(DISTINCT event_key) FROM property_cash_events_traversal),
  'event keys stay unique across every traversed page'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM property_cash_events_traversal
    WHERE event_key = 'petty_cash_entry:' || (
      SELECT petty_uncleared_id::text FROM property_cash_events_test_state
    )
      AND event_date IS NULL
  ),
  1::bigint,
  'null-date unresolved evidence is traversed exactly once after dated events'
);

SELECT ok(
  (
    SELECT count(*)
    FROM property_cash_events_traversal traversed
    JOIN public.petty_cash_entries petty
      ON petty.id = traversed.source_id
    WHERE traversed.source_type = 'petty_cash_entry'
      AND traversed.event_date IS NULL
      AND petty.description LIKE 'NULL-TAIL-%'
  ) = 2
  AND EXISTS (
    WITH first_null_page AS (
      SELECT page.*
      FROM public.get_property_cash_events_v1_page(
        (SELECT organization_id FROM property_cash_events_test_state),
        (SELECT property_id FROM property_cash_events_test_state),
        'USD', '2026-07-01', '2026-07-31',
        NULL, '', '00000000-0000-0000-0000-000000000000', 1
      ) AS page
    ),
    second_null_page AS (
      SELECT page.*
      FROM first_null_page AS first_page
      CROSS JOIN LATERAL public.get_property_cash_events_v1_page(
        (SELECT organization_id FROM property_cash_events_test_state),
        (SELECT property_id FROM property_cash_events_test_state),
        'USD', '2026-07-01', '2026-07-31',
        NULL, first_page.source_type, first_page.source_id, 1
      ) AS page
    )
    SELECT 1
    FROM first_null_page AS first_page
    CROSS JOIN second_null_page AS second_page
    WHERE first_page.event_date IS NULL
      AND second_page.event_date IS NULL
      AND first_page.event_key <> second_page.event_key
  ),
  'two null-date events traverse distinct page-size-one cursor pages'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM property_cash_events_traversal
    WHERE source_id = (
      SELECT cross_allocation_id FROM property_cash_events_test_state
    )
  ),
  0::bigint,
  'cross-organization event never leaks into traversal'
);

SELECT * FROM finish();

ROLLBACK;
