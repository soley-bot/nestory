BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

SELECT has_table('public', 'owner_payments', 'owner payments have a typed header');
SELECT has_table('public', 'owner_payment_allocations', 'owner payments allocate to owner charges');
SELECT has_table('public', 'property_withdrawals', 'owner withdrawals are property-specific');

SELECT has_column(
  'public',
  'property_withdrawals',
  'owner_person_id',
  'withdrawal snapshots the one property owner'
);

SELECT has_column(
  'public',
  'property_withdrawals',
  'idempotency_key',
  'withdrawals are retry safe'
);

SELECT has_function(
  'public',
  'record_owner_invoice_payment',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'text', 'text'],
  'one checked command records an owner payment'
);

SELECT has_function(
  'public',
  'record_property_withdrawal',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'text', 'text'],
  'one checked command records a safe property withdrawal'
);

SELECT has_view(
  'public',
  'property_finance_positions',
  'each property has a compact owner finance position'
);

SELECT has_view(
  'public',
  'property_account_entries',
  'each property has a simple running account'
);

SELECT has_column(
  'public',
  'property_finance_positions',
  'cash_held_by_ips',
  'cash held by IPS is shown separately'
);

SELECT has_column(
  'public',
  'property_finance_positions',
  'owner_owes_ips',
  'owner amounts owed to IPS are shown separately'
);

SELECT has_column(
  'public',
  'property_finance_positions',
  'available_withdrawal',
  'safe withdrawal availability is explicit'
);

SELECT table_privs_are(
  'public',
  'owner_payments',
  'authenticated',
  ARRAY['SELECT'],
  'owner payments cannot bypass the checked command'
);

SELECT table_privs_are(
  'public',
  'property_withdrawals',
  'authenticated',
  ARRAY['SELECT'],
  'withdrawals cannot bypass the checked command'
);

SELECT * FROM finish();
ROLLBACK;
