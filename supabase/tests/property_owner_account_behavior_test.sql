BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- This exercises the checked owner-account boundary. Data API execute
-- privileges for account and collection writes are asserted separately.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(24);

SELECT has_column(
  'public',
  'owner_payments',
  'ledger_entry_id',
  'owner payments own their operational Ledger identity'
);

SELECT has_column(
  'public',
  'owner_collection_confirmation_allocations',
  'ledger_entry_id',
  'owner-collected rent allocations own their operational Ledger identity'
);

SELECT has_function(
  'public',
  'record_owner_invoice_payment',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'text', 'text'],
  'owner payments have one checked command'
);

SELECT has_function(
  'public',
  'record_property_withdrawal',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'text', 'text'],
  'withdrawals have one checked command'
);

SELECT has_column(
  'public',
  'property_withdrawals',
  'ledger_entry_id',
  'property withdrawals own their operational Ledger identity'
);

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

INSERT INTO public.rent_policy_versions (
  organization_id,
  version_number,
  effective_from,
  supported_frequencies,
  rent_calculation_timezone,
  due_day_source,
  policy_default_due_day,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  notice_period_charging_rule,
  mid_period_rent_change_rule,
  concessions_support_state,
  rent_free_support_state,
  waivers_support_state,
  lifecycle,
  created_by,
  updated_by,
  approved_at,
  approved_by
)
SELECT
  organization_id,
  coalesce((
    SELECT max(policy.version_number) + 1
    FROM public.rent_policy_versions AS policy
    WHERE policy.organization_id = owner_account_state.organization_id
  ), 1),
  date_trunc('month', current_date)::date,
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  1,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  admin_id,
  admin_id,
  now(),
  admin_id
FROM owner_account_state;

SELECT lives_ok(
  $$
    SELECT public.set_lease_billing_term(
      organization_id,
      through_lease_id,
      (SELECT lease_start_date FROM public.current_leases WHERE id = through_lease_id),
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
    SET through_invoice_id = (
          SELECT id
          FROM public.tenant_invoices
          WHERE lease_id = through_lease_id
          ORDER BY billing_period_start DESC
          LIMIT 1
        ),
        through_property_id = (
          SELECT property_id FROM public.leases WHERE id = through_lease_id
        ),
        through_unit_id = (
          SELECT unit_id FROM public.leases WHERE id = through_lease_id
        )
  $$,
  'billing activation creates the property management fee'
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
      jsonb_build_array(
        jsonb_build_object(
          'lineId', (
            SELECT id
            FROM public.tenant_invoice_lines
            WHERE invoice_id = through_invoice_id
              AND line_type = 'rent'
          ),
          'amount', 780
        )
      ),
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
  $$VALUES (302.00::numeric, 302.00::numeric, 0.00::numeric, 302.00::numeric)$$,
  'withdrawal updates the property running balance and held cash together'
);

SELECT ok(
  (
    SELECT withdrawal.ledger_entry_id IS NOT NULL
      AND ledger.source_type = 'owner_cash_event'
      AND ledger.source_id = withdrawal.id
    FROM owner_account_state AS state
    JOIN public.property_withdrawals AS withdrawal
      ON withdrawal.id = state.withdrawal_id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = withdrawal.ledger_entry_id
  ),
  'withdrawal owns one source-linked operational Ledger event'
);

SELECT results_eq(
  $$
    SELECT public.record_property_withdrawal(
      organization_id,
      through_property_id,
      400,
      current_date,
      'Owner bank transfer',
      'account-withdrawal-0001'
    )
    FROM owner_account_state
  $$,
  $$SELECT withdrawal_id FROM owner_account_state$$,
  'an exact withdrawal retry returns the original source event'
);

SELECT throws_ok(
  $$
    SELECT public.record_property_withdrawal(
      organization_id,
      through_property_id,
      399,
      current_date,
      'Owner bank transfer',
      'account-withdrawal-0001'
    )
    FROM owner_account_state
  $$,
  '22023',
  'Conflicting withdrawal idempotency request',
  'a changed withdrawal payload cannot reuse a completed key'
);

SELECT throws_ok(
  $$
    SELECT public.record_property_withdrawal(
      organization_id,
      through_property_id,
      303,
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
      (SELECT lease_start_date FROM public.current_leases WHERE id = direct_lease_id),
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
    SET direct_invoice_id = (
          SELECT id
          FROM public.tenant_invoices
          WHERE lease_id = direct_lease_id
          ORDER BY billing_period_start DESC
          LIMIT 1
        ),
        direct_property_id = (
          SELECT property_id FROM public.leases WHERE id = direct_lease_id
        )
  $$,
  'direct-owner billing activation creates an owner fee amount due'
);

SELECT lives_ok(
  $$
    SELECT public.confirm_owner_collected_rent(
      organization_id,
      direct_invoice_id,
      640,
      current_date,
      'Owner confirmed collection',
      jsonb_build_array(
        jsonb_build_object(
          'lineId', (
            SELECT id
            FROM public.tenant_invoice_lines
            WHERE invoice_id = direct_invoice_id
              AND line_type = 'rent'
          ),
          'amount', 640
        )
      ),
      'account-direct-confirm-0001'
    )
    FROM owner_account_state
  $$,
  'owner collection confirmation records income without IPS cash'
);

SELECT ok(
  (
    SELECT bool_and(
      allocation.ledger_entry_id IS NOT NULL
      AND ledger.source_type = 'owner_collection_allocation'
      AND ledger.source_id = allocation.id
    )
    FROM owner_account_state AS state
    JOIN public.owner_collection_confirmations AS confirmation
      ON confirmation.organization_id = state.organization_id
     AND confirmation.invoice_id = state.direct_invoice_id
    JOIN public.owner_collection_confirmation_allocations AS allocation
      ON allocation.organization_id = confirmation.organization_id
     AND allocation.confirmation_id = confirmation.id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = allocation.ledger_entry_id
  ),
  'owner-collected rent creates exact source-linked Ledger events'
);

SELECT results_eq(
  $$
    SELECT running_balance, cash_held_by_ips, owner_owes_ips, available_withdrawal
    FROM public.property_finance_positions
    WHERE property_id = (SELECT direct_property_id FROM owner_account_state)
  $$,
  $$VALUES (877.00::numeric, 302.00::numeric, 65.00::numeric, 302.00::numeric)$$,
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
  $$VALUES (302.00::numeric, 0.00::numeric, 302.00::numeric)$$,
  'owner payment settles IPS without pretending IPS holds owner rent cash'
);

SELECT ok(
  (
    SELECT payment.ledger_entry_id IS NOT NULL
      AND ledger.source_type = 'owner_cash_event'
      AND ledger.source_id = payment.id
    FROM owner_account_state AS state
    JOIN public.owner_payments AS payment
      ON payment.id = state.owner_payment_id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = payment.ledger_entry_id
  ),
  'owner payment owns one source-linked operational Ledger event'
);

SELECT * FROM finish();
ROLLBACK;
