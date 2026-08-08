BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- This exercises the retained internal compatibility kernel. Data API execute
-- privileges for these retired writers are asserted separately.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(16);

CREATE TEMP TABLE owner_account_state (
  organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  admin_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000101',
  through_lease_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000001',
  direct_lease_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000002',
  through_tenant_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000001',
  company_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000007',
  through_invoice_id uuid,
  direct_invoice_id uuid,
  through_property_id uuid,
  direct_property_id uuid,
  through_unit_id uuid,
  source_id uuid,
  owner_expense_result jsonb,
  withdrawal_id uuid,
  owner_payment_id uuid
) ON COMMIT DROP;

INSERT INTO owner_account_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON owner_account_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM owner_account_state),
  true
);
RESET ROLE;

SELECT lives_ok(
  $$
    SELECT public.set_lease_billing_term(
      organization_id,
      through_lease_id,
      (SELECT lease_start_date FROM public.leases WHERE id = through_lease_id),
      'through_ips',
      'percentage',
      10,
      true,
      true,
      'individual',
      through_tenant_id,
      NULL,
      NULL,
      NULL,
      'account-through-billing-0001'
    )
    FROM owner_account_state
  $$,
  'through-IPS account setup is valid'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET through_invoice_id = public.generate_tenant_rent_invoice(
          organization_id,
          through_lease_id,
          (date_trunc('month', current_date) + interval '1 month')::date,
          current_date,
          'account-through-invoice-0001'
        ),
        through_property_id = (
          SELECT property_id FROM public.leases WHERE id = through_lease_id
        ),
        through_unit_id = (
          SELECT unit_id FROM public.leases WHERE id = through_lease_id
        )
  $$,
  'rent invoice creates the property management fee'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET source_id = public.create_financial_reconciliation_source(
      organization_id,
      'ACCTEST',
      'Property account test cash',
      'bank',
      'property_dedicated',
      'USD',
      through_property_id,
      '****9020'
    )
  $$,
  'property account has a receipt source'
);

SELECT lives_ok(
  $$
    SELECT public.record_tenant_invoice_payment(
      organization_id,
      through_invoice_id,
      780,
      current_date,
      source_id,
      'Full rent',
      NULL,
      'account-through-payment-0001'
    )
    FROM owner_account_state
  $$,
  'full rent collection settles the management fee from held cash'
);

SELECT results_eq(
  $$
    SELECT rent_income, management_fee_expense, owner_expense, withdrawals,
           running_balance, cash_held_by_ips, owner_owes_ips, available_withdrawal
    FROM public.property_finance_positions
    WHERE property_id = (SELECT through_property_id FROM owner_account_state)
  $$,
  $$VALUES (
    780.00::numeric, 78.00::numeric, 0.00::numeric, 0.00::numeric,
    702.00::numeric, 702.00::numeric, 0.00::numeric, 702.00::numeric
  )$$,
  'property position separates owner balance, IPS-held cash, and safe withdrawal'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET owner_expense_result = public.record_ips_paid_expense(
      organization_id,
      through_property_id,
      through_unit_id,
      'repairs_maintenance',
      'Repair Co.',
      current_date,
      180,
      20,
      'owner',
      NULL,
      NULL,
      NULL,
      'Repair and service fee',
      'account-owner-expense-0001'
    )
  $$,
  'owner expense uses held rent cash before creating owner debt'
);

SELECT results_eq(
  $$
    SELECT held_cash_amount, ips_advance_amount
    FROM public.ips_expense_responsibilities
    WHERE id = (
      SELECT (owner_expense_result->>'responsibility_id')::uuid
      FROM owner_account_state
    )
  $$,
  $$VALUES (200.00::numeric, 0.00::numeric)$$,
  'sufficient held cash fully covers the owner expense and markup'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET withdrawal_id = public.record_property_withdrawal(
      organization_id,
      through_property_id,
      400,
      current_date,
      'Owner bank transfer',
      'account-withdrawal-0001'
    )
  $$,
  'staff can withdraw only the remaining property cash'
);

SELECT results_eq(
  $$
    SELECT running_balance, cash_held_by_ips, owner_owes_ips, available_withdrawal
    FROM public.property_finance_positions
    WHERE property_id = (SELECT through_property_id FROM owner_account_state)
  $$,
  $$VALUES (102.00::numeric, 102.00::numeric, 0.00::numeric, 102.00::numeric)$$,
  'withdrawal updates the property running balance and held cash together'
);

SELECT throws_ok(
  $$
    SELECT public.record_property_withdrawal(
      organization_id,
      through_property_id,
      103,
      current_date,
      'Too much',
      'account-withdrawal-too-large'
    )
    FROM owner_account_state
  $$,
  '22023',
  'Withdrawal exceeds available property cash',
  'withdrawal cannot overdraw IPS-held property cash'
);

SELECT lives_ok(
  $$
    SELECT public.set_lease_billing_term(
      organization_id,
      direct_lease_id,
      (SELECT lease_start_date FROM public.leases WHERE id = direct_lease_id),
      'direct_to_owner',
      'flat',
      65,
      true,
      true,
      'company',
      company_id,
      NULL,
      NULL,
      NULL,
      'account-direct-billing-0001'
    )
    FROM owner_account_state
  $$,
  'direct-owner account setup is valid'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET direct_invoice_id = public.generate_tenant_rent_invoice(
          organization_id,
          direct_lease_id,
          (date_trunc('month', current_date) + interval '1 month')::date,
          current_date,
          'account-direct-invoice-0001'
        ),
        direct_property_id = (
          SELECT property_id FROM public.leases WHERE id = direct_lease_id
        )
  $$,
  'direct-owner invoice creates an owner fee amount due'
);

SELECT lives_ok(
  $$
    SELECT public.confirm_owner_collected_rent(
      organization_id,
      direct_invoice_id,
      640,
      current_date,
      'Owner confirmed collection',
      NULL,
      'account-direct-confirm-0001'
    )
    FROM owner_account_state
  $$,
  'owner collection confirmation records income without IPS cash'
);

SELECT results_eq(
  $$
    SELECT running_balance, cash_held_by_ips, owner_owes_ips, available_withdrawal
    FROM public.property_finance_positions
    WHERE property_id = (SELECT direct_property_id FROM owner_account_state)
  $$,
  $$VALUES (677.00::numeric, 102.00::numeric, 65.00::numeric, 102.00::numeric)$$,
  'direct-owner collection adds owner income without adding to IPS-held cash'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET owner_payment_id = public.record_owner_invoice_payment(
      organization_id,
      (
        SELECT id FROM public.owner_invoice_balances
        WHERE property_id = direct_property_id AND balance_due > 0
      ),
      65,
      current_date,
      'Owner paid management fee',
      'account-owner-payment-0001'
    )
  $$,
  'owner can pay IPS directly when no rent cash is held'
);

SELECT results_eq(
  $$
    SELECT cash_held_by_ips, owner_owes_ips, available_withdrawal
    FROM public.property_finance_positions
    WHERE property_id = (SELECT direct_property_id FROM owner_account_state)
  $$,
  $$VALUES (102.00::numeric, 0.00::numeric, 102.00::numeric)$$,
  'owner payment settles IPS without pretending IPS holds owner rent cash'
);

SELECT * FROM finish();
ROLLBACK;
