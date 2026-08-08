BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- This exercises the checked tenant-collection boundary. Data API execute
-- privileges for invoice and collection writes are asserted separately.
SELECT set_config('app.rent_generation_context', 'lease-derived-v1', true);

SELECT plan(19);

CREATE TEMP TABLE tenant_invoice_state (
  organization_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  admin_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000101',
  through_lease_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000001',
  direct_lease_id uuid NOT NULL DEFAULT '30000000-0000-0000-0000-000000000002',
  through_tenant_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000001',
  company_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000007',
  through_billing_id uuid,
  direct_billing_id uuid,
  through_invoice_id uuid,
  direct_invoice_id uuid,
  source_id uuid,
  payment_id uuid,
  confirmation_id uuid
) ON COMMIT DROP;

INSERT INTO tenant_invoice_state DEFAULT VALUES;
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
  $$VALUES ('through_ips'::text, 780.00::numeric, 'individual'::text, 'unpaid'::text)$$,
  'generated invoice snapshots route, rent, recipient, and unpaid state'
);

SELECT is(
  (
    SELECT amount
    FROM public.management_fee_occurrences
    WHERE tenant_invoice_id = (SELECT through_invoice_id FROM tenant_invoice_state)
  ),
  78.00::numeric,
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
  $$VALUES (400.00::numeric, 0.00::numeric, 380.00::numeric, 'partly_paid'::text)$$,
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

SELECT ok(
  to_regprocedure('public.reverse_finance_receipt(uuid,uuid,date,text)') IS NULL,
  'generic receipt reversal is absent'
);

SELECT ok(
  to_regprocedure(
    'public.reverse_finance_receipt_v2(uuid,uuid,date,uuid,text,text)'
  ) IS NULL,
  'generic atomic receipt reversal is absent'
);

SELECT ok(
  to_regprocedure('public.reverse_finance_receipt(uuid,uuid,date,text)') IS NULL,
  'no generic reversal can diverge a generated tenant invoice'
);

SELECT ok(
  to_regprocedure(
    'public.reverse_finance_receipt_v2(uuid,uuid,date,uuid,text,text)'
  ) IS NULL,
  'tenant-invoice payment state has no independent receipt reversal command'
);

SELECT results_eq(
  $$
    SELECT paid_through_ips, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT through_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (400.00::numeric, 380.00::numeric, 'partly_paid'::text)$$,
  'retired direct reversals leave the tenant invoice payment state unchanged'
);

SELECT lives_ok(
  $$
    UPDATE tenant_invoice_state
    SET direct_billing_id = public.set_lease_billing_term(
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
  $$VALUES ('Sokha Trading Co.'::text, 'direct_to_owner'::text, 1)$$,
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
  'staff can confirm the owner collected the full invoice'
);

SELECT results_eq(
  $$
    SELECT paid_through_ips, collected_by_owner, balance_due, payment_status
    FROM public.tenant_invoice_balances
    WHERE id = (SELECT direct_invoice_id FROM tenant_invoice_state)
  $$,
  $$VALUES (0.00::numeric, 640.00::numeric, 0.00::numeric, 'paid'::text)$$,
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

SELECT * FROM finish();
ROLLBACK;
