BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

SELECT has_table('public', 'tenant_invoices', 'tenant invoices have a typed header');
SELECT has_table('public', 'tenant_invoice_lines', 'tenant invoice lines are typed obligations');
SELECT has_table('public', 'tenant_invoice_payments', 'IPS collections have a customer payment header');
SELECT has_table('public', 'tenant_invoice_payment_allocations', 'IPS payments allocate to invoice lines');
SELECT has_table('public', 'owner_collection_confirmations', 'direct owner collections use a non-cash confirmation');
SELECT has_table('public', 'owner_collection_confirmation_allocations', 'direct owner collections allocate to invoice lines');
SELECT has_table('public', 'management_fee_occurrences', 'management fees are recorded once per rent invoice');

SELECT has_column('public', 'tenant_invoices', 'collection_route', 'invoice snapshots show who collects rent');
SELECT has_column('public', 'tenant_invoices', 'recipient_person_id', 'invoice has one individual or company recipient');
SELECT has_column('public', 'tenant_invoices', 'occupant_labels', 'company invoices retain occupant references');
SELECT has_column('public', 'tenant_invoice_lines', 'customer_label', 'customer documents use a simple line label');
SELECT has_column('public', 'tenant_invoice_lines', 'internal_cost_amount', 'internal cost is separate from the customer total');
SELECT has_column('public', 'tenant_invoice_lines', 'internal_markup_amount', 'internal markup is hidden from customer documents');

SELECT has_function(
  'public',
  'recover_lease_rent_period',
  ARRAY['uuid', 'uuid', 'date'],
  'one checked command recovers one selected Lease month'
);

SELECT has_function(
  'public',
  'record_tenant_invoice_payment',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'uuid', 'text', 'jsonb', 'text'],
  'one checked command records and allocates an IPS payment'
);

SELECT has_function(
  'public',
  'confirm_owner_collected_rent',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'text', 'jsonb', 'text'],
  'one checked command records direct-owner collection without an IPS receipt'
);

SELECT has_view('public', 'tenant_invoice_balances', 'invoice payment state is derived from linked allocations');

SELECT table_privs_are(
  'public',
  'tenant_invoices',
  'authenticated',
  ARRAY['SELECT'],
  'invoice headers cannot bypass checked commands'
);

SELECT table_privs_are(
  'public',
  'tenant_invoice_payments',
  'authenticated',
  ARRAY['SELECT'],
  'payment headers cannot bypass checked commands'
);

SELECT table_privs_are(
  'public',
  'owner_collection_confirmations',
  'authenticated',
  ARRAY['SELECT'],
  'owner confirmations cannot bypass checked commands'
);

SELECT * FROM finish();
ROLLBACK;
