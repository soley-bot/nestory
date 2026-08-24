BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

CREATE TEMP TABLE finance_category_e2e_state (
  organization_id uuid NOT NULL,
  super_admin_id uuid NOT NULL,
  finance_operator_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  owner_category_id uuid,
  owner_category_code text,
  tenant_category_id uuid,
  tenant_category_code text,
  charge_result jsonb
) ON COMMIT DROP;

INSERT INTO finance_category_e2e_state (
  organization_id, super_admin_id, finance_operator_id, lease_id
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  lease.id
FROM public.leases AS lease
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND lease.status IN ('active', 'notice_given')
ORDER BY lease.id
LIMIT 1;

GRANT SELECT, UPDATE ON finance_category_e2e_state TO authenticated;

SELECT is(
  (SELECT count(*) FROM finance_category_e2e_state),
  1::bigint,
  'the deterministic fixture exposes one active lease for category workflow proof'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_e2e_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE finance_category_e2e_state
    SET owner_category_id = public.create_finance_category(
      organization_id, 'owner_expense', 'Landscaping', 'maintenance'
    )
  $$,
  'Super Admin adds an owner-expense category through the checked authority'
);

SELECT lives_ok(
  $$
    UPDATE finance_category_e2e_state
    SET tenant_category_id = public.create_finance_category(
      organization_id, 'tenant_billing', 'Parking pass', 'parking'
    )
  $$,
  'Super Admin adds a tenant-billing category through the separate namespace'
);

UPDATE finance_category_e2e_state AS state
SET owner_category_code = owner_category.code,
    tenant_category_code = tenant_category.code
FROM public.finance_categories AS owner_category,
     public.finance_categories AS tenant_category
WHERE owner_category.id = state.owner_category_id
  AND tenant_category.id = state.tenant_category_id;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_e2e_state),
  true
);

SELECT results_eq(
  $$
    SELECT authority.canonical_code, authority.display_label
    FROM finance_category_e2e_state AS state
    CROSS JOIN LATERAL public.resolve_finance_category(
      state.organization_id, 'owner_expense', state.owner_category_code
    ) AS authority
  $$,
  $$
    SELECT owner_category_code, 'Landscaping'::text
    FROM finance_category_e2e_state
  $$,
  'ordinary Finance reads resolve the custom owner-expense category'
);

SELECT lives_ok(
  $$
    UPDATE finance_category_e2e_state
    SET charge_result = public.create_manual_tenant_charge(
      organization_id,
      lease_id,
      tenant_category_code,
      date_trunc(
        'month',
        (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date
      )::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      25,
      '',
      'category-e2e-parking-pass-0001'
    )
  $$,
  'authorized Finance administrator bills an active custom tenant category through the ordinary command'
);

SELECT results_eq(
  $$
    SELECT
      line.finance_category_id,
      line.customer_label,
      line.line_type
    FROM finance_category_e2e_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.charge_result->>'lineId')::uuid
  $$,
  $$
    SELECT tenant_category_id, 'Parking pass'::text, 'other'::text
    FROM finance_category_e2e_state
  $$,
  'the invoice line retains stable tenant-category identity and display label'
);

SELECT results_eq(
  $$
    SELECT income.description
    FROM finance_category_e2e_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.charge_result->>'lineId')::uuid
    JOIN public.finance_income_items AS income
      ON income.id = line.income_item_id
  $$,
  $$VALUES ('Parking pass'::text)$$,
  'an omitted description inherits the active tenant-category label'
);

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id,
      lease_id,
      owner_category_code,
      date_trunc(
        'month',
        (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date
      )::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      25,
      'Wrong namespace',
      'category-e2e-wrong-namespace-0001'
    )
    FROM finance_category_e2e_state
  $$,
  '22023',
  'Choose an active tenant-billing category',
  'an owner-expense category cannot be used as a tenant-billing charge'
);

SELECT * FROM finish();
ROLLBACK;
