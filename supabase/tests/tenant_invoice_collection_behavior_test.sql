BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- This exercises the checked tenant-collection boundary. Data API execute
-- privileges for invoice and collection writes are asserted separately.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(28);

CREATE TEMP TABLE tenant_invoice_state (
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  through_lease_id uuid NOT NULL,
  direct_lease_id uuid NOT NULL,
  through_tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  through_billing_id uuid,
  direct_billing_id uuid,
  through_invoice_id uuid,
  direct_invoice_id uuid,
  source_id uuid,
  payment_id uuid,
  reversal_payment_id uuid,
  confirmation_id uuid,
  reversal_confirmation_id uuid
) ON COMMIT DROP;

INSERT INTO tenant_invoice_state (
  organization_id,
  admin_id,
  through_lease_id,
  direct_lease_id,
  through_tenant_id,
  company_id
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  (
    SELECT id
    FROM public.current_leases
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND primary_tenant_person_id = '80000000-0000-0000-0000-000000000001'
  ),
  (
    SELECT id
    FROM public.current_leases
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND primary_tenant_person_id = '80000000-0000-0000-0000-000000000003'
  ),
  '80000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000003';
GRANT SELECT, UPDATE ON tenant_invoice_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM tenant_invoice_state),
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
    WHERE policy.organization_id = tenant_invoice_state.organization_id
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
FROM tenant_invoice_state;

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET through_billing_id = public.set_lease_billing_term(
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
        WHERE organization_id = tenant_invoice_state.organization_id
          AND lease_id = tenant_invoice_state.through_lease_id
          AND archived_at IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      ),
      'invoice-through-billing-0001'
    )
  $$,
  'through-IPS billing can be activated for a lease'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET through_invoice_id = app_private.generate_lease_rent_invoice(
      organization_id,
      through_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      current_date,
      'manual_recovery',
      admin_id
    )
  $$,
  'monthly rent invoice generation uses authoritative lease billing'
);

SELECT results_eq(
  $$
    SELECT collection_route, total_amount, recipient_kind, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT through_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES ('through_ips'::text, 850.00::numeric, 'individual'::text, 'unpaid'::text)$$,
  'generated invoice snapshots route, rent, recipient, and unpaid state'
);

SELECT is(
  (
    SELECT amount
    FROM public.management_fee_occurrences
    WHERE tenant_invoice_id = (SELECT through_invoice_id FROM tenant_invoice_state)
  ),
  85.00::numeric,
  'percentage management fee is recorded once as an internal occurrence'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET source_id = public.create_financial_reconciliation_source(
      organization_id,
      'INVTEST',
      'Invoice test operating account',
      'bank',
      'property_dedicated',
      'USD',
      (SELECT property_id FROM public.tenant_invoices WHERE id = through_invoice_id),
      '****9001'
    )
  $$,
  'an IPS collection source can be selected'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET payment_id = public.record_tenant_invoice_payment(
      organization_id,
      through_invoice_id,
      400,
      current_date,
      source_id,
      'Bank transfer',
      jsonb_build_array(
        jsonb_build_object(
          'lineId', (
            SELECT id
            FROM public.tenant_invoice_lines
            WHERE invoice_id = through_invoice_id
              AND line_type = 'rent'
          ),
          'amount', 400
        )
      ),
      'invoice-through-payment-0001'
    )
  $$,
  'partial IPS payment defaults to rent-first allocation'
);

SELECT results_eq(
  $$
    SELECT paid_through_ips, collected_by_owner, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT through_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (400.00::numeric, 0.00::numeric, 450.00::numeric, 'partly_paid'::text)$$,
  'partial IPS payment produces a clear partly-paid balance'
);

SELECT is(
  (
    SELECT sum(receipt.amount)
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.finance_receipts AS receipt
      ON receipt.id = allocation.finance_receipt_id
    WHERE allocation.payment_id = (SELECT payment_id FROM tenant_invoice_state)
  ),
  400.00::numeric,
  'through-IPS payment creates exactly the linked cash receipts'
);

SELECT throws_ok(
  $$
    SELECT public.reverse_tenant_invoice_payment(
      organization_id,
      payment_id,
      current_date - 1,
      'Incorrect payment',
      'invoice-through-reverse-early'
    )
    FROM tenant_invoice_state
  $$,
  '22023',
  'Reversal date cannot be before the payment date',
  'a payment cannot be reversed into an earlier month or day'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);
SELECT throws_ok(
  $$
    SELECT public.reverse_tenant_invoice_payment(
      organization_id,
      payment_id,
      current_date,
      'Incorrect payment',
      'invoice-through-reverse-manager'
    )
    FROM tenant_invoice_state
  $$,
  '42501',
  'Not authorized',
  'Finance Manager cannot reverse a tenant payment'
);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM tenant_invoice_state),
  true
);
RESET ROLE;

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET reversal_payment_id = public.reverse_tenant_invoice_payment(
      organization_id,
      payment_id,
      current_date,
      'Incorrect payment',
      'invoice-through-reverse-0001'
    )
  $$,
  'Super Admin can reverse the invoice payment through its domain command'
);

SELECT is(
  public.reverse_tenant_invoice_payment(
    organization_id,
    payment_id,
    current_date,
    'Incorrect payment',
    'invoice-through-reverse-0001'
  ),
  reversal_payment_id,
  'an exact tenant-payment reversal retry returns the first result'
)
FROM tenant_invoice_state;

SELECT throws_ok(
  $$
    SELECT public.reverse_tenant_invoice_payment(
      organization_id,
      payment_id,
      current_date,
      'Different reason',
      'invoice-through-reverse-0001'
    )
    FROM tenant_invoice_state
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'a changed tenant-payment reversal cannot reuse its key'
);

SELECT results_eq(
  $$
    SELECT paid_through_ips, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT through_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (0.00::numeric, 850.00::numeric, 'unpaid'::text)$$,
  'the reversal restores the invoice balance without editing the payment'
);

SELECT results_eq(
  $$
    SELECT
      reversal_allocation.signed_amount,
      reversal_ledger.amount,
      reversal_ledger.reversal_of_ledger_entry_id = original_ledger.id,
      original_payment.reversal_of_id IS NULL
    FROM tenant_invoice_state AS state
    JOIN public.tenant_invoice_payments AS original_payment
      ON original_payment.id = state.payment_id
    JOIN public.tenant_invoice_payment_allocations AS payment_allocation
      ON payment_allocation.payment_id = state.reversal_payment_id
    JOIN public.finance_receipt_allocations AS reversal_allocation
      ON reversal_allocation.receipt_id = payment_allocation.finance_receipt_id
    JOIN public.finance_receipt_allocations AS original_allocation
      ON original_allocation.id = reversal_allocation.reversal_of_allocation_id
    JOIN public.ledger_entries AS reversal_ledger
      ON reversal_ledger.id = reversal_allocation.ledger_entry_id
    JOIN public.ledger_entries AS original_ledger
      ON original_ledger.id = original_allocation.ledger_entry_id
  $$,
  $$VALUES (-400.00::numeric, -400.00::numeric, true, true)$$,
  'tenant reversal appends exact negative cash and Ledger evidence'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET direct_billing_id = public.set_lease_billing_term(
      organization_id,
      direct_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      'direct_to_owner',
      'flat',
      65,
      true,
      true,
      'company',
      company_id,
      NULL,
      NULL,
      (
        SELECT id
        FROM public.lease_billing_terms
        WHERE organization_id = tenant_invoice_state.organization_id
          AND lease_id = tenant_invoice_state.direct_lease_id
          AND archived_at IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      ),
      'invoice-direct-billing-0001'
    )
  $$,
  'direct-owner company billing can be activated'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET direct_invoice_id = app_private.generate_lease_rent_invoice(
      organization_id,
      direct_lease_id,
      (date_trunc('month', current_date) + interval '1 month')::date,
      current_date,
      'manual_recovery',
      admin_id
    )
  $$,
  'company invoice is generated once for the lease and period'
);

SELECT results_eq(
  $$
    SELECT recipient_label, collection_route, cardinality(occupant_labels)
    FROM public.tenant_invoices
    WHERE id = (SELECT direct_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES ('Bright Mekong Trading'::text, 'direct_to_owner'::text, 1)$$,
  'company invoice keeps the company recipient and occupant reference separate'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET confirmation_id = public.confirm_owner_collected_rent(
      organization_id,
      direct_invoice_id,
      (
        SELECT balance_due
        FROM public.tenant_invoice_balances
        WHERE id = direct_invoice_id
      ),
      current_date,
      'Owner confirmed transfer',
      jsonb_build_array(
        jsonb_build_object(
          'lineId', (
            SELECT id
            FROM public.tenant_invoice_lines
            WHERE invoice_id = direct_invoice_id
              AND line_type = 'rent'
          ),
          'amount', (
            SELECT balance_due
            FROM public.tenant_invoice_balances
            WHERE id = direct_invoice_id
          )
        )
      ),
      'invoice-direct-confirm-0001'
    )
  $$,
  'Super Admin can confirm the owner collected the full invoice'
);

SELECT results_eq(
  $$
    SELECT paid_through_ips, collected_by_owner, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT direct_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (0.00::numeric, 1450.00::numeric, 0.00::numeric, 'paid'::text)$$,
  'direct-owner confirmation settles the tenant balance without IPS cash'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.finance_receipts AS receipt
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.receipt_id = receipt.id
    JOIN public.tenant_invoice_lines AS line
      ON line.income_item_id = allocation.income_item_id
    WHERE line.invoice_id = (SELECT direct_invoice_id FROM tenant_invoice_state)
  ),
  0,
  'direct-owner confirmation does not issue an IPS cash receipt'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET reversal_confirmation_id =
      public.reverse_owner_collection_confirmation(
        organization_id,
        confirmation_id,
        current_date,
        'Owner confirmation corrected',
        'invoice-owner-reverse-0001'
      )
  $$,
  'Super Admin can reverse a direct-owner collection confirmation'
);

SELECT is(
  public.reverse_owner_collection_confirmation(
    organization_id,
    confirmation_id,
    current_date,
    'Owner confirmation corrected',
    'invoice-owner-reverse-0001'
  ),
  reversal_confirmation_id,
  'an exact owner-confirmation reversal retry returns the first result'
)
FROM tenant_invoice_state;

SELECT results_eq(
  $$
    SELECT collected_by_owner, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT direct_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (0.00::numeric, 1450.00::numeric, 'unpaid'::text)$$,
  'the direct-owner reversal restores the tenant invoice balance'
);

SELECT results_eq(
  $$
    SELECT
      reversal_allocation.signed_amount,
      reversal_ledger.amount,
      reversal_ledger.reversal_of_ledger_entry_id = original_ledger.id,
      original_confirmation.reversal_of_id IS NULL
    FROM tenant_invoice_state AS state
    JOIN public.owner_collection_confirmations AS original_confirmation
      ON original_confirmation.id = state.confirmation_id
    JOIN public.owner_collection_confirmation_allocations AS reversal_allocation
      ON reversal_allocation.confirmation_id = state.reversal_confirmation_id
    JOIN public.owner_collection_confirmation_allocations AS original_allocation
      ON original_allocation.id = reversal_allocation.reversal_of_allocation_id
    JOIN public.ledger_entries AS reversal_ledger
      ON reversal_ledger.id = reversal_allocation.ledger_entry_id
    JOIN public.ledger_entries AS original_ledger
      ON original_ledger.id = original_allocation.ledger_entry_id
  $$,
  $$VALUES (-1450.00::numeric, -1450.00::numeric, true, true)$$,
  'owner reversal appends exact negative operational evidence'
);

SELECT results_eq(
  $$
    SELECT
      event.amount,
      event.is_reversal,
      event.reversal_source_id = original_allocation.id,
      event.resolution_state
    FROM tenant_invoice_state AS state
    JOIN public.tenant_invoices AS invoice
      ON invoice.id = state.direct_invoice_id
    JOIN public.owner_collection_confirmation_allocations AS reversal_allocation
      ON reversal_allocation.confirmation_id = state.reversal_confirmation_id
    JOIN public.owner_collection_confirmation_allocations AS original_allocation
      ON original_allocation.id = reversal_allocation.reversal_of_allocation_id
    CROSS JOIN LATERAL public.get_property_cash_events_page(
      state.organization_id,
      invoice.property_id,
      'USD',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      NULL,
      NULL,
      NULL,
      100
    ) AS event
    WHERE event.source_id = reversal_allocation.id
  $$,
  $$VALUES (-1450.00::numeric, true, true, 'resolved'::text)$$,
  'property cash exposes the direct-owner reversal as a resolved opposite event'
);

SELECT results_eq(
  $$
    SELECT
      coalesce(sum(amount), 0)::numeric(14, 2),
      coalesce(sum(balance_effect), 0)::numeric(14, 2)
    FROM public.property_account_entries
    WHERE source_id IN (
      SELECT allocation.id
      FROM public.tenant_invoice_payment_allocations AS allocation
      WHERE allocation.payment_id IN (
        (SELECT payment_id FROM tenant_invoice_state),
        (SELECT reversal_payment_id FROM tenant_invoice_state)
      )
      UNION ALL
      SELECT allocation.id
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.confirmation_id IN (
        (SELECT confirmation_id FROM tenant_invoice_state),
        (SELECT reversal_confirmation_id FROM tenant_invoice_state)
      )
    )
  $$,
  $$VALUES (0.00::numeric, 0.00::numeric)$$,
  'property account history retains original and opposite settlement events'
);

SELECT ok(
  to_regprocedure('public.reverse_finance_receipt(uuid,uuid,date,text)') IS NULL
    AND to_regprocedure(
      'public.reverse_finance_receipt_v2(uuid,uuid,date,uuid,text,text)'
    ) IS NULL,
  'generic receipt reversals remain absent'
);

SELECT * FROM finish();
ROLLBACK;
