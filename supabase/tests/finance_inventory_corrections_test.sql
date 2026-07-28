BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

CREATE TEMP TABLE finance_inventory_correction_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  rent_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_expense_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_expense_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_payout_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_reversal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_reversal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_reversal_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO finance_inventory_correction_state DEFAULT VALUES;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Finance inventory correction test',
  'finance-inventory-correction-' || left(organization_id::text, 8)
FROM finance_inventory_correction_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
)
SELECT property_id, organization_id, 'Correction property',
  'CORR-' || left(property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_correction_state;

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'C-01', 'occupied', 1000, 'USD'
FROM finance_inventory_correction_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT tenant_id, organization_id, 'Correction tenant'
FROM finance_inventory_correction_state
UNION ALL
SELECT owner_id, organization_id, 'Correction owner'
FROM finance_inventory_correction_state;

INSERT INTO public.person_roles (organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM finance_inventory_correction_state
UNION ALL
SELECT organization_id, owner_id, 'owner'
FROM finance_inventory_correction_state;

INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
)
SELECT lease_id, organization_id, property_id, unit_id, tenant_id,
  'Correction tenant', '2026-01-01', '2026-12-31', 1000, 'USD', 500, 'USD',
  'active'
FROM finance_inventory_correction_state;

-- The IPS ownership rule is valid at period end, but deliberately invalid on
-- the 2026-07-10 settlement date.
INSERT INTO public.property_owners (
  organization_id, property_id, person_id, ownership_percent, is_primary,
  started_on
)
SELECT organization_id, property_id, owner_id, 100, true, '2026-07-20'
FROM finance_inventory_correction_state;

INSERT INTO public.finance_income_items (
  id, organization_id, property_id, unit_id, lease_id, income_type,
  payer_label, due_date, received_date, amount_due, amount_received,
  currency, status, reference
)
SELECT rent_income_id, organization_id, property_id, unit_id, lease_id, 'rent',
  'Correction tenant', '2026-07-01'::date, '2026-07-10'::date, 100, 0,
  'USD'::public.currency_code, 'open',
  'CORRECTION-RENT'
FROM finance_inventory_correction_state
UNION ALL
SELECT owner_income_id, organization_id, property_id, NULL, NULL,
  'owner_contribution', 'Correction owner', '2026-07-02'::date, '2026-07-02'::date,
  50, 0, 'USD'::public.currency_code, 'open', 'CORRECTION-OWNER-CONTRIBUTION'
FROM finance_inventory_correction_state;

INSERT INTO public.finance_receipts (
  id, organization_id, property_id, received_date, amount, currency,
  payer_label, reference, reversal_of_id
)
SELECT receipt_id, organization_id, property_id, '2026-07-10'::date, 100,
  'USD'::public.currency_code,
  'Correction tenant', 'CORRECTION-RECEIPT', NULL
FROM finance_inventory_correction_state
UNION ALL
SELECT receipt_reversal_id, organization_id, property_id, '2026-07-11'::date, 100,
  'USD'::public.currency_code, 'Correction tenant',
  'CORRECTION-RECEIPT-REVERSAL', receipt_id
FROM finance_inventory_correction_state;

INSERT INTO public.finance_receipt_allocations (
  organization_id, receipt_id, income_item_id, amount
)
SELECT organization_id, receipt_id, rent_income_id, 100
FROM finance_inventory_correction_state
UNION ALL
SELECT organization_id, receipt_reversal_id, rent_income_id, 100
FROM finance_inventory_correction_state;

INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, due_date, paid_date, amount, currency, category, status,
  economic_scope, reference
)
SELECT property_expense_id, organization_id, property_id, unit_id,
  'vendor_bill', 'Correction vendor', '2026-07-03'::date, '2026-07-03'::date,
  '2026-07-12'::date, 80, 'USD'::public.currency_code, 'Repairs', 'paid',
  'property_expense',
  'CORRECTION-PROPERTY-EXPENSE'
FROM finance_inventory_correction_state
UNION ALL
SELECT company_expense_id, organization_id, property_id, NULL,
  'vendor_bill', 'Management company', '2026-07-04'::date, '2026-07-04'::date,
  '2026-07-04'::date, 20, 'USD'::public.currency_code, 'Bank Fees', 'paid',
  'company_cost',
  'CORRECTION-COMPANY-COST'
FROM finance_inventory_correction_state
UNION ALL
SELECT owner_payout_id, organization_id, property_id, NULL,
  'owner_payout', 'Correction owner', '2026-07-05'::date, '2026-07-05'::date,
  '2026-07-05'::date, 25, 'USD'::public.currency_code, 'Owner payout', 'paid',
  'property_expense',
  'CORRECTION-OWNER-PAYOUT'
FROM finance_inventory_correction_state;

INSERT INTO public.finance_payments (
  id, organization_id, property_id, paid_date, amount, currency, payee_label,
  reference, reversal_of_id
)
SELECT payment_id, organization_id, property_id, '2026-07-12'::date, 80,
  'USD'::public.currency_code,
  'Correction vendor', 'CORRECTION-PAYMENT', NULL
FROM finance_inventory_correction_state
UNION ALL
SELECT payment_reversal_id, organization_id, property_id, '2026-07-13'::date, 80,
  'USD'::public.currency_code, 'Correction vendor',
  'CORRECTION-PAYMENT-REVERSAL', payment_id
FROM finance_inventory_correction_state;

INSERT INTO public.finance_payment_allocations (
  organization_id, payment_id, expense_item_id, amount
)
SELECT organization_id, payment_id, property_expense_id, 80
FROM finance_inventory_correction_state
UNION ALL
SELECT organization_id, payment_reversal_id, property_expense_id, 80
FROM finance_inventory_correction_state;

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, deposit_type, amount, currency, status,
  received_on
)
SELECT lease_deposit_id, organization_id, lease_id, 'utilities', 500, 'USD',
  'held', '2026-07-15'
FROM finance_inventory_correction_state;

INSERT INTO public.lease_deposit_events (
  id, organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, reversal_of_id
)
SELECT deposit_event_id, organization_id, property_id, lease_deposit_id,
  'received', '2026-07-15'::date, 500, 'USD'::public.currency_code,
  'CORRECTION-DEPOSIT', NULL
FROM finance_inventory_correction_state
UNION ALL
SELECT deposit_reversal_id, organization_id, property_id, lease_deposit_id,
  'reversed', '2026-07-16'::date, 500, 'USD'::public.currency_code,
  'CORRECTION-DEPOSIT-REVERSAL', deposit_event_id
FROM finance_inventory_correction_state;

-- Deliberately unrelated cash with the same date/amount must not prove a link.
INSERT INTO public.finance_receipts (
  organization_id, property_id, received_date, amount, currency, payer_label,
  reference
)
SELECT organization_id, property_id, '2026-07-15', 500, 'USD',
  'Unrelated payer', 'UNRELATED-SAME-AMOUNT-DATE'
FROM finance_inventory_correction_state;

SELECT is(
  (
    SELECT payload ->> 'signedAmount'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['receipt_allocation']
    )
    WHERE payload ->> 'parentTransactionId' = (
      SELECT receipt_reversal_id::text FROM finance_inventory_correction_state
    )
  ),
  '-100.00',
  'receipt reversal allocation has the exact opposite signed effect'
);

SELECT is(
  (
    SELECT payload ->> 'signedAmount'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['payment_allocation']
    )
    WHERE payload ->> 'parentTransactionId' = (
      SELECT payment_reversal_id::text FROM finance_inventory_correction_state
    )
  ),
  '-80.00',
  'payment reversal allocation has the exact opposite signed effect'
);

SELECT is(
  (
    SELECT payload ->> 'signedAmount'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['deposit_event']
    )
    WHERE payload ->> 'sourceId' = (
      SELECT deposit_reversal_id::text FROM finance_inventory_correction_state
    )
  ),
  '-500.00',
  'deposit reversal has the opposite effect of its exact original event'
);

SELECT is(
  (
    SELECT payload ->> 'originalEventType'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['deposit_event']
    )
    WHERE payload ->> 'sourceId' = (
      SELECT deposit_reversal_id::text FROM finance_inventory_correction_state
    )
  ),
  'received',
  'deposit reversal resolves the exact original event type'
);

SELECT is(
  (
    SELECT payload ->> 'depositType'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['deposit_event']
    )
    WHERE payload ->> 'sourceId' = (
      SELECT deposit_event_id::text FROM finance_inventory_correction_state
    )
  ),
  'utilities',
  'deposit source preserves the lease deposit type'
);

SELECT is(
  (
    SELECT payload ->> 'economicClass'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['receipt_allocation']
    )
    WHERE payload ->> 'obligationId' = (
      SELECT rent_income_id::text FROM finance_inventory_correction_state
    )
    ORDER BY stable_key
    LIMIT 1
  ),
  'operating_income',
  'receipt allocation preserves its obligation economic class'
);

SELECT is(
  (
    SELECT payload ->> 'economicClass'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL,
      ARRAY['payment_allocation']
    )
    WHERE payload ->> 'obligationId' = (
      SELECT property_expense_id::text FROM finance_inventory_correction_state
    )
    ORDER BY stable_key
    LIMIT 1
  ),
  'property_expense',
  'payment allocation preserves its obligation economic scope'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'diagnostics', NULL, 1000,
      ARRAY['DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE'], NULL
    )
    WHERE payload ->> 'sourceId' = (
      SELECT deposit_event_id::text FROM finance_inventory_correction_state
    )
  ),
  1::bigint,
  'same-date same-amount unrelated cash never suppresses missing deposit identity'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'diagnostics', NULL, 1000,
      ARRAY['OWNERSHIP_INVALID_ON_RELEVANT_DATE'], NULL
    )
    WHERE payload ->> 'eventDate' = '2026-07-10'
  ),
  1::bigint,
  'ownership is checked on financially relevant event dates'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'diagnostics', NULL, 1000,
      ARRAY['OWNERSHIP_INVALID_ON_RELEVANT_DATE'], NULL
    )
    WHERE payload ->> 'eventDate' = '2026-07-31'
  ),
  0::bigint,
  'valid period-end ownership does not hide or add a false issue'
);

SELECT is(
  (
    SELECT DISTINCT contract_version
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL, NULL
    )
  ),
  'finance_inventory_v3',
  'database diagnostic contract matches the corrected artifact contract'
);

CREATE TEMP TABLE finance_inventory_watermark_before AS
SELECT payload
FROM app_private.get_finance_inventory_page(
  (SELECT organization_id FROM finance_inventory_correction_state),
  (SELECT property_id FROM finance_inventory_correction_state),
  'USD', '2026-07-01', '2026-07-31', 'watermark', NULL, 1000, NULL, NULL
);

UPDATE public.property_owners
SET started_on = '2026-07-19'
WHERE organization_id = (
  SELECT organization_id FROM finance_inventory_correction_state
);

INSERT INTO public.ledger_period_locks (
  organization_id, period_start, locked_at, reason
)
SELECT organization_id, '2026-07-01', now(), 'Correction watermark mutation'
FROM finance_inventory_correction_state;

SELECT isnt(
  (
    SELECT payload ->> 'hash'
    FROM finance_inventory_watermark_before
  ),
  (
    SELECT payload ->> 'hash'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'watermark', NULL, 1000, NULL, NULL
    )
  ),
  'ownership and lock changes alter the material-dependency watermark'
);

SELECT ok(
  (
    SELECT (payload ->> 'rowCount')::bigint
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'watermark', NULL, 1000, NULL, NULL
    )
  ) > (
    SELECT count(*)::bigint
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'sources', NULL, 1000, NULL, NULL
    )
  ),
  'watermark covers dependencies that do not emit source rows'
);

CREATE TEMP TABLE finance_inventory_watermark_before_access AS
SELECT payload
FROM app_private.get_finance_inventory_page(
  (SELECT organization_id FROM finance_inventory_correction_state),
  (SELECT property_id FROM finance_inventory_correction_state),
  'USD', '2026-07-01', '2026-07-31', 'watermark', NULL, 1000, NULL, NULL
);

GRANT SELECT ON public.lease_deposit_events TO anon;

SELECT isnt(
  (
    SELECT payload ->> 'hash'
    FROM finance_inventory_watermark_before_access
  ),
  (
    SELECT payload ->> 'hash'
    FROM app_private.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_correction_state),
      (SELECT property_id FROM finance_inventory_correction_state),
      'USD', '2026-07-01', '2026-07-31', 'watermark', NULL, 1000, NULL, NULL
    )
  ),
  'table privilege changes alter the material access watermark'
);

SELECT * FROM finish();

ROLLBACK;
