BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- This exercises the checked owner-account boundary. Data API execute
-- privileges for account and collection writes are asserted separately.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(30);

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
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  through_lease_id uuid NOT NULL,
  direct_lease_id uuid NOT NULL,
  through_tenant_id uuid NOT NULL,
  direct_tenant_id uuid NOT NULL,
  through_invoice_id uuid,
  through_payment_id uuid,
  direct_invoice_id uuid,
  through_property_id uuid,
  direct_property_id uuid,
  through_unit_id uuid,
  source_id uuid,
  owner_expense_result jsonb,
  withdrawal_id uuid,
  owner_payment_id uuid,
  baseline_rent_income numeric NOT NULL,
  baseline_management_fee_expense numeric NOT NULL,
  baseline_owner_expense numeric NOT NULL,
  baseline_withdrawals numeric NOT NULL,
  baseline_running_balance numeric NOT NULL,
  baseline_cash_held_by_ips numeric NOT NULL,
  baseline_owner_owes_ips numeric NOT NULL,
  baseline_available_withdrawal numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO owner_account_state (
  organization_id,
  admin_id,
  through_lease_id,
  direct_lease_id,
  through_tenant_id,
  direct_tenant_id,
  through_property_id,
  direct_property_id,
  through_unit_id,
  baseline_rent_income,
  baseline_management_fee_expense,
  baseline_owner_expense,
  baseline_withdrawals,
  baseline_running_balance,
  baseline_cash_held_by_ips,
  baseline_owner_owes_ips,
  baseline_available_withdrawal
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  through_lease.id,
  direct_lease.id,
  '80000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000002',
  through_lease.property_id,
  direct_lease.property_id,
  through_lease.unit_id,
  position.rent_income,
  position.management_fee_expense,
  position.owner_expense,
  position.withdrawals,
  position.running_balance,
  position.cash_held_by_ips,
  position.owner_owes_ips,
  position.available_withdrawal
FROM public.current_leases AS through_lease
JOIN public.current_leases AS direct_lease
  ON direct_lease.organization_id = through_lease.organization_id
 AND direct_lease.primary_tenant_person_id = '80000000-0000-0000-0000-000000000002'
JOIN public.property_finance_positions AS position
  ON position.organization_id = through_lease.organization_id
 AND position.property_id = through_lease.property_id
WHERE through_lease.organization_id = '00000000-0000-0000-0000-000000000001'
  AND through_lease.primary_tenant_person_id = '80000000-0000-0000-0000-000000000001';
GRANT SELECT, UPDATE ON owner_account_state TO authenticated;

CREATE FUNCTION pg_temp.try_uuid(statement text) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  result uuid;
BEGIN
  EXECUTE statement INTO result;
  RETURN result;
EXCEPTION
  WHEN insufficient_privilege OR invalid_parameter_value THEN
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_uuid(text) TO authenticated;

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
      (date_trunc('month', current_date) + interval '1 month')::date,
      'through_ips',
      'percentage',
      10,
      true,
      true,
      'individual',
      through_tenant_id,
      NULL,
      NULL,
      (
        SELECT id
        FROM public.lease_billing_terms
        WHERE organization_id = owner_account_state.organization_id
          AND lease_id = owner_account_state.through_lease_id
          AND archived_at IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      ),
      'account-through-billing-0001'
    )
    FROM owner_account_state
  $$,
  'through-IPS account setup is valid'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET through_invoice_id = app_private.generate_lease_rent_invoice(
      organization_id,
      through_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      current_date,
      'manual_recovery',
      admin_id
    )
  $$,
  'selected-month generation creates the property rent and fee obligations'
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

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET through_payment_id = public.record_tenant_invoice_payment(
      organization_id,
      through_invoice_id,
      850.00::numeric(14, 2),
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
          'amount', 850.00::numeric(14, 2)
        )
      ),
      'account-through-payment-0001'
    )
  $$,
  'Finance Manager full rent collection settles the management fee from held cash'
);

SELECT is(
  pg_temp.try_uuid(format(
    'SELECT public.record_tenant_invoice_payment(%L,%L,850.00::numeric(14,2),current_date,%L,%L,%L::jsonb,%L)',
    organization_id,
    through_invoice_id,
    source_id,
    'Full rent',
    jsonb_build_array(jsonb_build_object(
      'lineId', (
        SELECT id
        FROM public.tenant_invoice_lines
        WHERE invoice_id = through_invoice_id
          AND line_type = 'rent'
      ),
      'amount', 850.00::numeric(14, 2)
    ))::text,
    'account-through-payment-0001'
  )),
  through_payment_id,
  'an exact fully settled Finance Manager replay returns the original payment'
)
FROM owner_account_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM owner_account_state),
  true
);
RESET ROLE;

INSERT INTO public.financial_month_locks (
  organization_id,
  month_start,
  is_locked,
  locked_at,
  locked_by,
  reason
)
SELECT
  organization_id,
  date_trunc('month', current_date)::date,
  true,
  now(),
  admin_id,
  'Completed tenant-payment replay must remain immutable'
FROM owner_account_state
ON CONFLICT (organization_id, month_start) DO UPDATE
SET is_locked = EXCLUDED.is_locked,
    locked_at = EXCLUDED.locked_at,
    locked_by = EXCLUDED.locked_by,
    reason = EXCLUDED.reason;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.record_tenant_invoice_payment(%L,%L,850.00::numeric(14,2),current_date,%L,%L,%L::jsonb,%L)',
    organization_id,
    through_invoice_id,
    source_id,
    'Full rent',
    jsonb_build_array(jsonb_build_object(
      'lineId', (
        SELECT id
        FROM public.tenant_invoice_lines
        WHERE invoice_id = through_invoice_id
          AND line_type = 'rent'
      ),
      'amount', 850.00::numeric(14, 2)
    ))::text,
    'account-through-payment-0001'
  ),
  '22023',
  'Financial month is locked',
  'a later month lock remains authoritative before tenant-payment replay'
)
FROM owner_account_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM owner_account_state),
  true
);
RESET ROLE;

DELETE FROM public.financial_month_locks
WHERE organization_id = (SELECT organization_id FROM owner_account_state)
  AND month_start = date_trunc('month', current_date)::date;

SELECT results_eq(
  $$
    SELECT
      position.rent_income - state.baseline_rent_income,
      position.management_fee_expense - state.baseline_management_fee_expense,
      position.owner_expense - state.baseline_owner_expense,
      position.withdrawals - state.baseline_withdrawals,
      position.running_balance - state.baseline_running_balance,
      position.cash_held_by_ips - state.baseline_cash_held_by_ips,
      position.owner_owes_ips - state.baseline_owner_owes_ips,
      position.available_withdrawal - state.baseline_available_withdrawal
    FROM public.property_finance_positions AS position
    CROSS JOIN owner_account_state AS state
    WHERE position.property_id = state.through_property_id
  $$,
  $$VALUES (
    850.00::numeric, 85.00::numeric, 0.00::numeric, 0.00::numeric,
    765.00::numeric, 765.00::numeric, 0.00::numeric, 765.00::numeric
  )$$,
  'property position separates owner balance, IPS-held cash, and safe withdrawal'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

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
  'Finance Manager can withdraw only valid available property cash'
);

SELECT is(
  (SELECT created_by FROM public.property_withdrawals WHERE id = (SELECT withdrawal_id FROM owner_account_state)),
  '00000000-0000-0000-0000-000000000701'::uuid,
  'property withdrawal records the Finance Manager actor'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.property_withdrawals', 'UPDATE'),
  'Finance Manager cannot bypass the checked RPC with direct withdrawal DML'
);

SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM owner_account_state), true);
RESET ROLE;

UPDATE owner_account_state
SET withdrawal_id = public.record_property_withdrawal(
  organization_id,
  through_property_id,
  400,
  current_date,
  'Owner bank transfer',
  'account-withdrawal-admin-fallback'
)
WHERE withdrawal_id IS NULL;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT
      position.running_balance - state.baseline_running_balance,
      position.cash_held_by_ips - state.baseline_cash_held_by_ips,
      position.owner_owes_ips - state.baseline_owner_owes_ips,
      position.available_withdrawal - state.baseline_available_withdrawal
    FROM public.property_finance_positions AS position
    CROSS JOIN owner_account_state AS state
    WHERE position.property_id = state.through_property_id
  $$,
  $$VALUES (365.00::numeric, 365.00::numeric, 0.00::numeric, 365.00::numeric)$$,
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
    SELECT pg_temp.try_uuid(format(
      'SELECT public.record_property_withdrawal(%L,%L,400,current_date,%L,%L)',
      organization_id,
      through_property_id,
      'Owner bank transfer',
      'account-withdrawal-0001'
    ))
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
      (
        SELECT available_withdrawal + 1
        FROM public.property_finance_positions
        WHERE property_id = through_property_id
      ),
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

SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM owner_account_state), true);
RESET ROLE;

SELECT lives_ok(
  $$
    SELECT public.set_lease_billing_term(
      organization_id,
      direct_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      'direct_to_owner',
      'flat',
      65,
      true,
      true,
      'individual',
      direct_tenant_id,
      NULL,
      NULL,
      (
        SELECT id
        FROM public.lease_billing_terms
        WHERE organization_id = owner_account_state.organization_id
          AND lease_id = owner_account_state.direct_lease_id
          AND archived_at IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      ),
      'account-direct-billing-0001'
    )
    FROM owner_account_state
  $$,
  'direct-owner account setup is valid'
);

SELECT lives_ok(
  $$
    UPDATE owner_account_state
    SET direct_invoice_id = app_private.generate_lease_rent_invoice(
      organization_id,
      direct_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      current_date,
      'manual_recovery',
      admin_id
    )
  $$,
  'direct-owner generation creates an owner fee amount due'
);

SELECT lives_ok(
  $$
    SELECT public.confirm_owner_collected_rent(
      organization_id,
      direct_invoice_id,
      925,
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
          'amount', 925
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
    SELECT
      position.running_balance - state.baseline_running_balance,
      position.cash_held_by_ips - state.baseline_cash_held_by_ips,
      position.owner_owes_ips - state.baseline_owner_owes_ips,
      position.available_withdrawal - state.baseline_available_withdrawal
    FROM public.property_finance_positions AS position
    CROSS JOIN owner_account_state AS state
    WHERE position.property_id = state.direct_property_id
  $$,
  $$VALUES (1225.00::numeric, 365.00::numeric, 65.00::numeric, 365.00::numeric)$$,
  'direct-owner collection adds owner income without adding to IPS-held cash'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SET LOCAL ROLE authenticated;

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
  'Finance Manager can record an owner payment when no rent cash is held'
);

SELECT is(
  (SELECT created_by FROM public.owner_payments WHERE id = (SELECT owner_payment_id FROM owner_account_state)),
  '00000000-0000-0000-0000-000000000701'::uuid,
  'owner payment records the Finance Manager actor'
);

SELECT is(
  pg_temp.try_uuid(format(
    'SELECT public.record_owner_invoice_payment(%L,%L,65,current_date,%L,%L)',
    organization_id,
    (SELECT id FROM public.owner_invoice_balances WHERE property_id = direct_property_id ORDER BY issue_date DESC LIMIT 1),
    'Owner paid management fee',
    'account-owner-payment-0001'
  )),
  owner_payment_id,
  'an exact Finance Manager owner-payment retry returns the original record'
)
FROM owner_account_state;

SELECT results_eq(
  $$
    SELECT
      position.cash_held_by_ips - state.baseline_cash_held_by_ips,
      position.owner_owes_ips - state.baseline_owner_owes_ips,
      position.available_withdrawal - state.baseline_available_withdrawal
    FROM public.property_finance_positions AS position
    CROSS JOIN owner_account_state AS state
    WHERE position.property_id = state.direct_property_id
  $$,
  $$VALUES (365.00::numeric, 0.00::numeric, 365.00::numeric)$$,
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
