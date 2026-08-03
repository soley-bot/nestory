BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

SELECT has_table(
  'public',
  'ips_expense_responsibilities',
  'IPS-paid expenses have one typed responsibility record'
);

SELECT has_table(
  'public',
  'owner_invoices',
  'owner amounts owed are issued on property-specific invoices'
);

SELECT has_table(
  'public',
  'owner_invoice_lines',
  'owner invoices keep typed fee and expense lines'
);

SELECT has_table(
  'public',
  'owner_charge_cash_allocations',
  'owner charges can be reduced from IPS-held cash'
);

SELECT has_column(
  'public',
  'ips_expense_responsibilities',
  'responsibility',
  'expense responsibility is explicitly owner or tenant'
);

SELECT has_column(
  'public',
  'ips_expense_responsibilities',
  'internal_cost_amount',
  'the amount IPS paid stays private'
);

SELECT has_column(
  'public',
  'ips_expense_responsibilities',
  'internal_markup_amount',
  'markup stays private'
);

SELECT has_column(
  'public',
  'ips_expense_responsibilities',
  'customer_total_amount',
  'the customer-facing total is stored separately'
);

SELECT has_column(
  'public',
  'ips_expense_responsibilities',
  'supporting_document_id',
  'a supporting receipt can be linked'
);

SELECT has_function(
  'public',
  'record_ips_paid_expense',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'text', 'text', 'date', 'numeric', 'numeric',
    'text', 'uuid', 'uuid', 'uuid', 'text', 'text'
  ],
  'one checked command records an IPS-paid owner or tenant expense'
);

SELECT has_view(
  'public',
  'owner_invoice_balances',
  'owner invoice balances are derived from allocations'
);

SELECT table_privs_are(
  'public',
  'ips_expense_responsibilities',
  'authenticated',
  ARRAY['SELECT'],
  'expense responsibility cannot bypass the checked command'
);

SELECT table_privs_are(
  'public',
  'owner_invoices',
  'authenticated',
  ARRAY['SELECT'],
  'owner invoice headers cannot bypass checked commands'
);

SELECT table_privs_are(
  'public',
  'owner_invoice_lines',
  'authenticated',
  ARRAY['SELECT'],
  'owner invoice lines cannot bypass checked commands'
);

SELECT * FROM finish();
ROLLBACK;
