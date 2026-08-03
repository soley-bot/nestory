BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(13);

CREATE TEMP TABLE ips_expense_state (
  organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  admin_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000101',
  lease_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000001',
  tenant_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000001',
  billing_id uuid,
  invoice_id uuid,
  property_id uuid,
  unit_id uuid,
  source_id uuid,
  owner_expense_result jsonb,
  tenant_expense_result jsonb,
  payment_id uuid
) ON COMMIT DROP;

INSERT INTO ips_expense_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON ips_expense_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM ips_expense_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET billing_id = public.set_lease_billing_term(
      organization_id,
      lease_id,
      (SELECT lease_start_date FROM public.leases WHERE id = lease_id),
      'through_ips',
      'percentage',
      10,
      true,
      true,
      'individual',
      tenant_id,
      NULL,
      NULL,
      NULL,
      'expense-billing-0001'
    )
  $$,
  'expense setup uses the lease billing rule'
);

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET invoice_id = public.generate_tenant_rent_invoice(
          organization_id,
          lease_id,
          (date_trunc('month', current_date) + interval '1 month')::date,
          current_date,
          'expense-invoice-0001'
        ),
        property_id = (
          SELECT property_id FROM public.leases
          WHERE id = ips_expense_state.lease_id
        ),
        unit_id = (
          SELECT unit_id FROM public.leases
          WHERE id = ips_expense_state.lease_id
        )
  $$,
  'rent invoice generation also creates the management fee owner charge'
);

SELECT results_eq(
  $$
    SELECT total_amount, paid_from_held_cash, balance_due, payment_status
    FROM public.owner_invoice_balances
    WHERE property_id = (SELECT property_id FROM ips_expense_state)
  $$,
  $$VALUES (78.00::numeric, 0.00::numeric, 78.00::numeric, 'unpaid'::text)$$,
  'management fee starts as an owner amount due when IPS has no rent cash'
);

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET owner_expense_result = public.record_ips_paid_expense(
      organization_id,
      property_id,
      unit_id,
      'cleaning',
      'Clean Co.',
      current_date,
      50,
      20,
      'owner',
      NULL,
      NULL,
      NULL,
      'Move-out cleaning',
      'owner-cleaning-0001'
    )
  $$,
  'IPS can record a paid owner expense with private markup'
);

SELECT results_eq(
  $$
    SELECT total_amount, paid_from_held_cash, balance_due
    FROM public.owner_invoice_balances
    WHERE property_id = (SELECT property_id FROM ips_expense_state)
  $$,
  $$VALUES (148.00::numeric, 0.00::numeric, 148.00::numeric)$$,
  'owner cost joins the property-specific invoice while cash is insufficient'
);

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET tenant_expense_result = public.record_ips_paid_expense(
      organization_id,
      property_id,
      unit_id,
      'cleaning',
      'Clean Co.',
      current_date,
      50,
      20,
      'tenant',
      invoice_id,
      NULL,
      NULL,
      'Tenant cleaning charge',
      'tenant-cleaning-0001'
    )
  $$,
  'IPS can add a tenant-responsible cost to the tenant invoice'
);

SELECT results_eq(
  $$
    SELECT customer_label, amount, internal_cost_amount, internal_markup_amount
    FROM public.tenant_invoice_lines
    WHERE id = (
      SELECT (tenant_expense_result->>'tenant_invoice_line_id')::uuid
      FROM ips_expense_state
    )
  $$,
  $$VALUES ('Cleaning'::text, 70.00::numeric, 50.00::numeric, 20.00::numeric)$$,
  'tenant sees one simple Cleaning total while IPS keeps cost and markup'
);

SELECT is(
  (
    SELECT total_amount
    FROM public.tenant_invoices
    WHERE id = (SELECT invoice_id FROM ips_expense_state)
  ),
  850.00::numeric,
  'tenant charge increases the one lease invoice total'
);

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET source_id = public.create_financial_reconciliation_source(
      organization_id,
      'EXPCASH',
      'Expense behavior operating account',
      'bank',
      'property_dedicated',
      'USD',
      property_id,
      '****9010'
    )
  $$,
  'IPS can choose the property cash source'
);

SELECT lives_ok(
  $$
    UPDATE ips_expense_state
    SET payment_id = public.record_tenant_invoice_payment(
      organization_id,
      invoice_id,
      100,
      current_date,
      source_id,
      'Partial rent',
      NULL,
      'expense-rent-payment-0001'
    )
  $$,
  'new rent cash automatically covers the oldest owner charges first'
);

SELECT results_eq(
  $$
    SELECT total_amount, paid_from_held_cash, balance_due, payment_status
    FROM public.owner_invoice_balances
    WHERE property_id = (SELECT property_id FROM ips_expense_state)
  $$,
  $$VALUES (148.00::numeric, 100.00::numeric, 48.00::numeric, 'partly_paid'::text)$$,
  'management fee and owner cost use available held cash without overdraw'
);

SELECT results_eq(
  $$
    SELECT held_cash_amount, ips_advance_amount
    FROM public.ips_expense_responsibilities
    WHERE id = (
      SELECT (owner_expense_result->>'responsibility_id')::uuid
      FROM ips_expense_state
    )
  $$,
  $$VALUES (22.00::numeric, 48.00::numeric)$$,
  'the owner expense clearly splits held cash from the amount still owed to IPS'
);

SELECT results_eq(
  $$
    SELECT responsibility, held_cash_amount, ips_advance_amount, owner_invoice_line_id IS NULL
    FROM public.ips_expense_responsibilities
    WHERE id = (
      SELECT (tenant_expense_result->>'responsibility_id')::uuid
      FROM ips_expense_state
    )
  $$,
  $$VALUES ('tenant'::text, 0.00::numeric, 50.00::numeric, true)$$,
  'tenant responsibility never becomes an owner expense'
);

SELECT * FROM finish();
ROLLBACK;
