BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE finance_category_idempotency_state (
  organization_id uuid NOT NULL,
  super_admin_id uuid NOT NULL,
  finance_manager_id uuid NOT NULL,
  finance_member_id uuid NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  lease_id uuid NOT NULL,
  source_id uuid NOT NULL,
  owner_category_a_id uuid,
  owner_category_a_code text,
  owner_category_b_id uuid,
  owner_category_b_code text,
  tenant_category_a_id uuid,
  tenant_category_a_code text,
  tenant_category_b_id uuid,
  tenant_category_b_code text,
  evidence_document_id uuid,
  expense_other_evidence_id uuid,
  expense_custom_evidence_id uuid,
  expense_result jsonb,
  expense_replay_result jsonb,
  expense_approval_result jsonb,
  expense_other_result jsonb,
  expense_custom_result jsonb,
  manual_result jsonb,
  manual_replay_result jsonb,
  manual_other_result jsonb,
  manual_custom_result jsonb,
  payment_id uuid
) ON COMMIT DROP;

INSERT INTO finance_category_idempotency_state (
  organization_id,
  super_admin_id,
  finance_manager_id,
  finance_member_id,
  property_id,
  unit_id,
  lease_id,
  source_id
)
SELECT
  lease.organization_id,
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  '00000000-0000-0000-0000-000000000801'::uuid,
  lease.property_id,
  lease.unit_id,
  lease.id,
  source.id
FROM public.leases AS lease
CROSS JOIN LATERAL (
  SELECT reconciliation.id
  FROM public.financial_reconciliation_sources AS reconciliation
  WHERE reconciliation.organization_id = lease.organization_id
    AND reconciliation.currency = 'USD'
    AND reconciliation.scope_kind = 'organization_pooled'
    AND reconciliation.archived_at IS NULL
  ORDER BY reconciliation.id
  LIMIT 1
) AS source
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND lease.status IN ('active', 'notice_given')
  AND lease.archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = lease.organization_id
      AND billing.lease_id = lease.id
      AND billing.archived_at IS NULL
      AND billing.collection_route = 'through_ips'
      AND current_date BETWEEN billing.effective_from AND billing.effective_to
  )
ORDER BY lease.id
LIMIT 1;

GRANT SELECT, UPDATE ON finance_category_idempotency_state TO authenticated;

SELECT is(
  (SELECT count(*) FROM finance_category_idempotency_state),
  1::bigint,
  'the loaded fixture exposes one deterministic active Lease and funding source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE finance_category_idempotency_state
SET owner_category_a_id = public.create_finance_category(
      organization_id, 'owner_expense', 'Idempotent owner alpha', 'other'
    ),
    owner_category_b_id = public.create_finance_category(
      organization_id, 'owner_expense', 'Idempotent owner beta', 'other'
    ),
    tenant_category_a_id = public.create_finance_category(
      organization_id, 'tenant_billing', 'Idempotent tenant alpha', 'other'
    ),
    tenant_category_b_id = public.create_finance_category(
      organization_id, 'tenant_billing', 'Idempotent tenant beta', 'other'
    );

UPDATE finance_category_idempotency_state AS state
SET owner_category_a_code = owner_a.code,
    owner_category_b_code = owner_b.code,
    tenant_category_a_code = tenant_a.code,
    tenant_category_b_code = tenant_b.code
FROM public.finance_categories AS owner_a,
     public.finance_categories AS owner_b,
     public.finance_categories AS tenant_a,
     public.finance_categories AS tenant_b
WHERE owner_a.id = state.owner_category_a_id
  AND owner_b.id = state.owner_category_b_id
  AND tenant_a.id = state.tenant_category_a_id
  AND tenant_b.id = state.tenant_category_b_id;

RESET ROLE;

INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
SELECT
  pg_catalog.gen_random_uuid(),
  'nestory-documents',
  state.organization_id::text ||
    '/paid-cost-evidence/category-idempotency/owner-alpha.pdf',
  pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object('mimetype', 'application/pdf', 'size', 29)
FROM finance_category_idempotency_state AS state;

UPDATE finance_category_idempotency_state AS state
SET evidence_document_id = (
  public.register_paid_cost_evidence_verified(
    state.organization_id,
    state.finance_member_id,
    state.property_id,
    'owner-alpha.pdf',
    object.name,
    'application/pdf',
    29,
    pg_catalog.repeat('e', 64),
    object.id,
    object.version,
    'category-idempotency-evidence-owner-alpha'
  )->>'document_id'
)::uuid
FROM storage.objects AS object
WHERE object.bucket_id = 'nestory-documents'
  AND object.name = state.organization_id::text ||
    '/paid-cost-evidence/category-idempotency/owner-alpha.pdf';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE finance_category_idempotency_state
    SET expense_result = public.submit_expense(
      organization_id,
      property_id,
      unit_id,
      'general',
      NULL,
      owner_category_a_code,
      'Idempotency Vendor',
      current_date,
      41.25,
      3.75,
      'USD',
      'owner',
      NULL,
      source_id,
      evidence_document_id,
      NULL,
      'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
  $$,
  'the first expense submission accepts custom owner category A'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM finance_category_idempotency_state),
  true
);

UPDATE finance_category_idempotency_state
SET expense_approval_result = public.review_expense(
  organization_id,
  (expense_result->>'submission_id')::uuid,
  'approve',
  NULL,
  'category-idempotency-owner-approve-0001',
  NULL
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);

SELECT public.update_finance_category(
  organization_id,
  owner_category_a_id,
  'Idempotent owner alpha renamed',
  'other'
)
FROM finance_category_idempotency_state;

SELECT public.set_finance_category_archived(
  organization_id,
  owner_category_a_id,
  true
)
FROM finance_category_idempotency_state;

RESET ROLE;

CREATE TEMP TABLE expense_idempotency_snapshot ON COMMIT DROP AS
SELECT
  submission.id,
  submission.customer_category,
  submission.status,
  submission.updated_at,
  expense.id AS finance_expense_item_id,
  expense.category AS finance_expense_category,
  (SELECT count(*) FROM public.expense_submissions) AS submission_count,
  (SELECT count(*) FROM public.finance_expense_items) AS expense_count,
  (SELECT count(*) FROM public.activity_logs) AS activity_count,
  (SELECT count(*) FROM app_private.financial_idempotency_requests)
    AS idempotency_count
FROM finance_category_idempotency_state AS state
JOIN public.expense_submissions AS submission
  ON submission.id = (state.expense_result->>'submission_id')::uuid
JOIN public.finance_expense_items AS expense
  ON expense.id = (state.expense_approval_result->>'finance_expense_item_id')::uuid;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE finance_category_idempotency_state
    SET expense_replay_result = public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_a_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
  $$,
  'renamed and archived owner category A replays the same approved submission'
);

SELECT is(
  (expense_replay_result->>'submission_id')::uuid,
  (expense_result->>'submission_id')::uuid,
  'the exact expense replay returns the original submission ID'
)
FROM finance_category_idempotency_state;

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_b_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'owner category B cannot reuse category A idempotency after approval'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      submission.customer_category,
      submission.status,
      submission.updated_at,
      expense.category,
      (SELECT count(*) FROM public.expense_submissions),
      (SELECT count(*) FROM public.finance_expense_items),
      (SELECT count(*) FROM public.activity_logs),
      (SELECT count(*) FROM app_private.financial_idempotency_requests)
    FROM finance_category_idempotency_state AS state
    JOIN public.expense_submissions AS submission
      ON submission.id = (state.expense_result->>'submission_id')::uuid
    JOIN public.finance_expense_items AS expense
      ON expense.id = (state.expense_approval_result->>'finance_expense_item_id')::uuid
  $$,
  $$
    SELECT
      customer_category,
      status,
      updated_at,
      finance_expense_category,
      submission_count,
      expense_count,
      activity_count,
      idempotency_count
    FROM expense_idempotency_snapshot
  $$,
  'exact and conflicting expense retries leave the approved snapshot and totals unchanged'
);

INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
SELECT
  pg_catalog.gen_random_uuid(),
  'nestory-documents',
  state.organization_id::text ||
    '/paid-cost-evidence/category-idempotency/' || evidence.file_name,
  pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object(
    'mimetype', 'application/pdf', 'size', evidence.size_bytes
  )
FROM finance_category_idempotency_state AS state
CROSS JOIN (
  VALUES
    ('owner-other-first.pdf'::text, 31::bigint),
    ('owner-custom-first.pdf'::text, 32::bigint)
) AS evidence(file_name, size_bytes);

UPDATE finance_category_idempotency_state AS state
SET expense_other_evidence_id = (
      public.register_paid_cost_evidence_verified(
        state.organization_id,
        state.finance_member_id,
        state.property_id,
        'owner-other-first.pdf',
        object.name,
        'application/pdf',
        31,
        pg_catalog.repeat('f', 64),
        object.id,
        object.version,
        'category-idempotency-evidence-owner-other'
      )->>'document_id'
    )::uuid
FROM storage.objects AS object
WHERE object.bucket_id = 'nestory-documents'
  AND object.name = state.organization_id::text ||
    '/paid-cost-evidence/category-idempotency/owner-other-first.pdf';

UPDATE finance_category_idempotency_state AS state
SET expense_custom_evidence_id = (
      public.register_paid_cost_evidence_verified(
        state.organization_id,
        state.finance_member_id,
        state.property_id,
        'owner-custom-first.pdf',
        object.name,
        'application/pdf',
        32,
        pg_catalog.repeat('1', 64),
        object.id,
        object.version,
        'category-idempotency-evidence-owner-custom'
      )->>'document_id'
    )::uuid
FROM storage.objects AS object
WHERE object.bucket_id = 'nestory-documents'
  AND object.name = state.organization_id::text ||
    '/paid-cost-evidence/category-idempotency/owner-custom-first.pdf';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE finance_category_idempotency_state
SET expense_other_result = public.submit_expense(
  organization_id, property_id, unit_id, 'general', NULL,
  'other', 'Other-first Vendor', current_date, 21.25, 0,
  'USD', 'owner', NULL, source_id, expense_other_evidence_id, NULL,
  'Same built-in and custom expense bridge',
  'category-idempotency-expense-other-first-0001'
);

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_b_code, 'Other-first Vendor', current_date, 21.25, 0,
      'USD', 'owner', NULL, source_id, expense_other_evidence_id, NULL,
      'Same built-in and custom expense bridge',
      'category-idempotency-expense-other-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'a custom owner category mapped to Other cannot take a built-in Other key'
);

SELECT results_eq(
  $$
    SELECT submission.customer_category
    FROM finance_category_idempotency_state AS state
    JOIN public.expense_submissions AS submission
      ON submission.id = (state.expense_other_result->>'submission_id')::uuid
  $$,
  $$VALUES ('other'::text)$$,
  'the built-in Other expense keeps its immutable category identity'
);

UPDATE finance_category_idempotency_state
SET expense_custom_result = public.submit_expense(
  organization_id, property_id, unit_id, 'general', NULL,
  owner_category_b_code, 'Custom-first Vendor', current_date, 22.25, 0,
  'USD', 'owner', NULL, source_id, expense_custom_evidence_id, NULL,
  'Same custom and built-in expense bridge',
  'category-idempotency-expense-custom-first-0001'
);

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      'other', 'Custom-first Vendor', current_date, 22.25, 0,
      'USD', 'owner', NULL, source_id, expense_custom_evidence_id, NULL,
      'Same custom and built-in expense bridge',
      'category-idempotency-expense-custom-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'built-in Other cannot take a custom owner category key'
);

SELECT results_eq(
  $$
    SELECT submission.customer_category
    FROM finance_category_idempotency_state AS state
    JOIN public.expense_submissions AS submission
      ON submission.id = (state.expense_custom_result->>'submission_id')::uuid
  $$,
  $$
    SELECT owner_category_b_code
    FROM finance_category_idempotency_state
  $$,
  'the custom expense keeps its immutable category identity after conflict'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE finance_category_idempotency_state
    SET manual_result = public.create_manual_tenant_charge(
      organization_id,
      lease_id,
      tenant_category_a_code,
      date_trunc('month', current_date)::date,
      current_date,
      27.50,
      'Same explicit tenant description',
      'category-idempotency-manual-charge-0001'
    )
  $$,
  'the first manual tenant charge accepts custom tenant category A'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM finance_category_idempotency_state),
  true
);

UPDATE finance_category_idempotency_state AS state
SET payment_id = public.record_tenant_invoice_payment(
  state.organization_id,
  (state.manual_result->>'invoiceId')::uuid,
  27.50,
  current_date,
  state.source_id,
  'Category idempotency settlement',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'lineId', (state.manual_result->>'lineId')::uuid,
    'amount', 27.50
  )),
  'category-idempotency-manual-payment-0001'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);

SELECT public.update_finance_category(
  organization_id,
  tenant_category_a_id,
  'Idempotent tenant alpha renamed',
  'other'
)
FROM finance_category_idempotency_state;

SELECT public.set_finance_category_archived(
  organization_id,
  tenant_category_a_id,
  true
)
FROM finance_category_idempotency_state;

RESET ROLE;

CREATE TEMP TABLE manual_idempotency_snapshot ON COMMIT DROP AS
SELECT
  line.id,
  line.finance_category_id,
  line.customer_label,
  line.description,
  income.description AS income_description,
  invoice.total_amount,
  balance.balance_due AS line_balance_due,
  (SELECT count(*) FROM public.tenant_invoice_lines) AS line_count,
  (SELECT count(*) FROM public.finance_income_items) AS income_count,
  (SELECT count(*) FROM public.activity_logs) AS activity_count,
  (SELECT count(*) FROM app_private.financial_idempotency_requests)
    AS idempotency_count
FROM finance_category_idempotency_state AS state
JOIN public.tenant_invoice_lines AS line
  ON line.id = (state.manual_result->>'lineId')::uuid
JOIN public.finance_income_items AS income
  ON income.id = line.income_item_id
JOIN public.tenant_invoices AS invoice
  ON invoice.id = line.invoice_id
JOIN public.tenant_invoice_line_balances AS balance
  ON balance.id = line.id;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE finance_category_idempotency_state
    SET manual_replay_result = public.create_manual_tenant_charge(
      organization_id, lease_id, tenant_category_a_code,
      date_trunc('month', current_date)::date, current_date, 27.50,
      'Same explicit tenant description',
      'category-idempotency-manual-charge-0001'
    )
  $$,
  'renamed and archived tenant category A replays the same settled line'
);

SELECT is(
  (manual_replay_result->>'lineId')::uuid,
  (manual_result->>'lineId')::uuid,
  'the exact manual-charge replay returns the original line ID'
)
FROM finance_category_idempotency_state;

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, tenant_category_b_code,
      date_trunc('month', current_date)::date, current_date, 27.50,
      'Same explicit tenant description',
      'category-idempotency-manual-charge-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'tenant category B cannot reuse category A idempotency after settlement'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      line.finance_category_id,
      line.customer_label,
      line.description,
      income.description,
      invoice.total_amount,
      balance.balance_due,
      (SELECT count(*) FROM public.tenant_invoice_lines),
      (SELECT count(*) FROM public.finance_income_items),
      (SELECT count(*) FROM public.activity_logs),
      (SELECT count(*) FROM app_private.financial_idempotency_requests)
    FROM finance_category_idempotency_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.manual_result->>'lineId')::uuid
    JOIN public.finance_income_items AS income
      ON income.id = line.income_item_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.id = line.invoice_id
    JOIN public.tenant_invoice_line_balances AS balance
      ON balance.id = line.id
  $$,
  $$
    SELECT
      finance_category_id,
      customer_label,
      description,
      income_description,
      total_amount,
      line_balance_due,
      line_count,
      income_count,
      activity_count,
      idempotency_count
    FROM manual_idempotency_snapshot
  $$,
  'exact and conflicting manual retries leave issued and settled evidence unchanged'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE finance_category_idempotency_state
SET manual_other_result = public.create_manual_tenant_charge(
  organization_id,
  lease_id,
  'other',
  date_trunc('month', current_date)::date,
  current_date,
  11.25,
  'Same built-in and custom bridge payload',
  'category-idempotency-manual-other-first-0001'
);

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, tenant_category_b_code,
      date_trunc('month', current_date)::date, current_date, 11.25,
      'Same built-in and custom bridge payload',
      'category-idempotency-manual-other-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'a custom category mapped to Other cannot take a built-in Other key'
);

SELECT results_eq(
  $$
    SELECT line.finance_category_id, line.customer_label
    FROM finance_category_idempotency_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.manual_other_result->>'lineId')::uuid
  $$,
  $$
    SELECT category.id, 'Other'::text
    FROM finance_category_idempotency_state AS state
    JOIN public.finance_categories AS category
      ON category.organization_id = state.organization_id
     AND category.namespace = 'tenant_billing'
     AND category.code = 'other'
  $$,
  'the built-in Other line keeps its immutable category identity after conflict'
);

UPDATE finance_category_idempotency_state
SET manual_custom_result = public.create_manual_tenant_charge(
  organization_id,
  lease_id,
  tenant_category_b_code,
  date_trunc('month', current_date)::date,
  current_date,
  12.25,
  'Same custom and built-in bridge payload',
  'category-idempotency-manual-custom-first-0001'
);

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, 'other',
      date_trunc('month', current_date)::date, current_date, 12.25,
      'Same custom and built-in bridge payload',
      'category-idempotency-manual-custom-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'built-in Other cannot take a custom category key'
);

SELECT results_eq(
  $$
    SELECT line.finance_category_id, line.customer_label
    FROM finance_category_idempotency_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.manual_custom_result->>'lineId')::uuid
  $$,
  $$
    SELECT tenant_category_b_id, 'Idempotent tenant beta'::text
    FROM finance_category_idempotency_state
  $$,
  'the custom line keeps its immutable category identity after built-in conflict'
);

RESET ROLE;

DELETE FROM app_private.finance_category_idempotency_bindings AS binding
USING finance_category_idempotency_state AS state
WHERE binding.organization_id = state.organization_id
  AND binding.operation = 'create_manual_tenant_charge'
  AND binding.idempotency_key =
    'category-idempotency-manual-other-first-0001';

UPDATE public.tenant_invoice_lines AS line
SET finance_category_id = NULL
FROM finance_category_idempotency_state AS state
WHERE line.id = (state.manual_other_result->>'lineId')::uuid;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, 'other',
      date_trunc('month', current_date)::date, current_date, 11.25,
      'Same built-in and custom bridge payload',
      'category-idempotency-manual-other-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency binding is unavailable',
  'an unbound legacy-null manual category fails closed instead of being adopted'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT line.finance_category_id, line.customer_label
    FROM finance_category_idempotency_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.manual_other_result->>'lineId')::uuid
  $$,
  $$VALUES (NULL::uuid, 'Other'::text)$$,
  'the failed legacy-null replay leaves the issued line unchanged'
);

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = '{}'::jsonb
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key =
    'category-idempotency-manual-custom-first-0001';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, tenant_category_b_code,
      date_trunc('month', current_date)::date, current_date, 12.25,
      'Same custom and built-in bridge payload',
      'category-idempotency-manual-custom-first-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency result is unavailable',
  'a malformed completed replay fails closed before category post-processing'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT line.finance_category_id, line.customer_label
    FROM finance_category_idempotency_state AS state
    JOIN public.tenant_invoice_lines AS line
      ON line.id = (state.manual_custom_result->>'lineId')::uuid
  $$,
  $$
    SELECT tenant_category_b_id, 'Idempotent tenant beta'::text
    FROM finance_category_idempotency_state
  $$,
  'the malformed replay cannot mutate the original custom line'
);

SELECT results_eq(
  $$
    SELECT binding.operation, binding.namespace, binding.finance_category_id
    FROM finance_category_idempotency_state AS state
    JOIN app_private.finance_category_idempotency_bindings AS binding
      ON binding.organization_id = state.organization_id
     AND binding.operation = 'submit_expense'
     AND binding.idempotency_key = 'category-idempotency-owner-expense-0001'
  $$,
  $$
    SELECT 'submit_expense'::text, 'owner_expense'::text, owner_category_a_id
    FROM finance_category_idempotency_state
  $$,
  'expense idempotency binds the immutable category UUID and namespace'
);

SELECT results_eq(
  $$
    SELECT binding.operation, binding.namespace, binding.finance_category_id
    FROM finance_category_idempotency_state AS state
    JOIN app_private.finance_category_idempotency_bindings AS binding
      ON binding.organization_id = state.organization_id
     AND binding.operation = 'create_manual_tenant_charge'
     AND binding.idempotency_key = 'category-idempotency-manual-charge-0001'
  $$,
  $$
    SELECT 'create_manual_tenant_charge'::text,
      'tenant_billing'::text,
      tenant_category_a_id
    FROM finance_category_idempotency_state
  $$,
  'manual-charge idempotency binds the immutable category UUID and namespace'
);

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests AS request
    JOIN public.expense_submissions AS submission
      ON submission.organization_id = request.organization_id
     AND request.result_ids->>'submission_id' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND submission.id = (request.result_ids->>'submission_id')::uuid
    JOIN public.finance_categories AS category
      ON category.organization_id = submission.organization_id
     AND category.namespace = CASE submission.responsibility
       WHEN 'owner' THEN 'owner_expense'
       WHEN 'tenant' THEN 'tenant_billing'
     END
     AND category.code = app_private.normalize_finance_category_legacy_code(
       submission.customer_category
     )
    LEFT JOIN app_private.finance_category_idempotency_bindings AS binding
      ON binding.organization_id = request.organization_id
     AND binding.operation = request.operation
     AND binding.idempotency_key = request.idempotency_key
     AND binding.namespace = category.namespace
     AND binding.finance_category_id = category.id
    WHERE request.operation = 'submit_expense'
      AND request.status = 'completed'
      AND binding.organization_id IS NULL
  ),
  0::bigint,
  'completed historical expense requests, including utility normalization and both responsibilities, are exactly backfilled'
);

RESET ROLE;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000099'::uuid,
  'Finance category isolation proof',
  'finance-category-isolation-proof'
);

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type
)
VALUES (
  '00000000-0000-0000-0000-000000000991'::uuid,
  '00000000-0000-0000-0000-000000000099'::uuid,
  'Finance category isolation property',
  'FCIP',
  'Apartment'
);

INSERT INTO public.expense_submissions (
  id,
  organization_id,
  property_id,
  source_type,
  customer_category,
  vendor_label,
  expense_date,
  internal_cost_amount,
  internal_markup_amount,
  currency,
  responsibility,
  reconciliation_source_id,
  reference,
  status,
  idempotency_key,
  request_payload_hash,
  submitted_by
)
SELECT
  '00000000-0000-0000-0000-000000000992'::uuid,
  '00000000-0000-0000-0000-000000000099'::uuid,
  '00000000-0000-0000-0000-000000000991'::uuid,
  'general',
  'other',
  'Cross-organization Vendor',
  current_date,
  41.25,
  3.75,
  'USD',
  'owner',
  source.id,
  'Cross-organization category idempotency proof',
  'submitted',
  'category-idempotency-cross-org-business-row',
  pg_catalog.repeat('9', 64),
  '00000000-0000-0000-0000-000000000801'::uuid
FROM public.financial_reconciliation_sources AS source
WHERE source.organization_id =
    '00000000-0000-0000-0000-000000000099'::uuid
  AND source.scope_kind = 'organization_pooled'
  AND source.archived_at IS NULL
ORDER BY source.id
LIMIT 1;

CREATE TEMP TABLE expense_result_authority_snapshot ON COMMIT DROP AS
SELECT request.result_ids
FROM app_private.financial_idempotency_requests AS request
JOIN finance_category_idempotency_state AS state
  ON state.organization_id = request.organization_id
WHERE request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = pg_catalog.jsonb_build_object(
  'submission_id',
  '00000000-0000-0000-0000-000000000998'::text
)
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_a_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency result is unavailable',
  'a completed request whose result business row is missing fails closed'
);

RESET ROLE;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = pg_catalog.jsonb_build_object(
  'submission_id',
  '00000000-0000-0000-0000-000000000992'::text
)
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_a_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency result is unavailable',
  'a completed request cannot adopt a result business row from another organization'
);

RESET ROLE;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = snapshot.result_ids
FROM finance_category_idempotency_state AS state
CROSS JOIN expense_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

UPDATE app_private.finance_category_idempotency_bindings AS binding
SET namespace = 'tenant_billing',
    finance_category_id = state.tenant_category_b_id
FROM finance_category_idempotency_state AS state
WHERE binding.organization_id = state.organization_id
  AND binding.operation = 'submit_expense'
  AND binding.idempotency_key = 'category-idempotency-owner-expense-0001';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_a_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '22023',
  'Conflicting Finance category idempotency request',
  'an existing canonical binding in the wrong namespace fails closed'
);

RESET ROLE;

UPDATE app_private.finance_category_idempotency_bindings AS binding
SET namespace = 'owner_expense',
    finance_category_id = state.owner_category_a_id
FROM finance_category_idempotency_state AS state
WHERE binding.organization_id = state.organization_id
  AND binding.operation = 'submit_expense'
  AND binding.idempotency_key = 'category-idempotency-owner-expense-0001';

SELECT results_eq(
  $$
    SELECT seal.operation, seal.result_id
    FROM finance_category_idempotency_state AS state
    JOIN app_private.finance_category_idempotency_result_seals AS seal
      ON seal.organization_id = state.organization_id
     AND (
       (seal.operation = 'submit_expense'
         AND seal.idempotency_key = 'category-idempotency-owner-expense-0001')
       OR
       (seal.operation = 'create_manual_tenant_charge'
         AND seal.idempotency_key = 'category-idempotency-manual-charge-0001')
     )
    ORDER BY seal.operation
  $$,
  $$
    SELECT operation, result_id
    FROM (
      VALUES
        ('create_manual_tenant_charge'::text,
          (SELECT (manual_result->>'lineId')::uuid
           FROM finance_category_idempotency_state)),
        ('submit_expense'::text,
          (SELECT (expense_result->>'submission_id')::uuid
           FROM finance_category_idempotency_state))
    ) AS expected(operation, result_id)
    ORDER BY operation
  $$,
  'fresh category-aware requests seal their exact business result identities'
);

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = pg_catalog.jsonb_build_object(
  'submission_id', state.expense_custom_result->>'submission_id',
  'status', 'submitted'
)
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id, property_id, unit_id, 'general', NULL,
      owner_category_a_code, 'Idempotency Vendor', current_date,
      41.25, 3.75, 'USD', 'owner', NULL, source_id,
      evidence_document_id, NULL, 'Canonical category replay proof',
      'category-idempotency-owner-expense-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency result is unavailable',
  'a same-organization pointer swap to an unrelated expense fails the sealed lineage check'
);

RESET ROLE;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = snapshot.result_ids
FROM finance_category_idempotency_state AS state
CROSS JOIN expense_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'submit_expense'
  AND request.idempotency_key = 'category-idempotency-owner-expense-0001';

CREATE TEMP TABLE manual_result_authority_snapshot ON COMMIT DROP AS
SELECT request.result_ids, request.actor_id, request.payload_hash
FROM app_private.financial_idempotency_requests AS request
JOIN finance_category_idempotency_state AS state
  ON state.organization_id = request.organization_id
WHERE request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = pg_catalog.jsonb_build_object(
  'invoiceId', state.manual_custom_result->>'invoiceId',
  'leaseId', state.lease_id,
  'lineId', state.manual_custom_result->>'lineId'
)
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_idempotency_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.create_manual_tenant_charge(
      organization_id, lease_id, tenant_category_a_code,
      date_trunc('month', current_date)::date, current_date, 27.50,
      'Same explicit tenant description',
      'category-idempotency-manual-charge-0001'
    )
    FROM finance_category_idempotency_state
  $$,
  '23514',
  'Finance category idempotency result is unavailable',
  'a same-organization pointer swap to an unrelated non-rent line fails closed'
);

RESET ROLE;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = snapshot.result_ids
FROM finance_category_idempotency_state AS state
CROSS JOIN manual_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

CREATE TEMP TABLE rent_line_authority_snapshot ON COMMIT DROP AS
SELECT line.id, line.finance_category_id, invoice.id AS invoice_id,
  invoice.lease_id
FROM public.tenant_invoice_lines AS line
JOIN public.tenant_invoices AS invoice
  ON invoice.organization_id = line.organization_id
 AND invoice.id = line.invoice_id
JOIN finance_category_idempotency_state AS state
  ON state.organization_id = line.organization_id
WHERE line.line_type = 'rent'
ORDER BY line.id
LIMIT 1;

UPDATE public.tenant_invoice_lines AS line
SET finance_category_id = state.tenant_category_a_id
FROM rent_line_authority_snapshot AS snapshot
CROSS JOIN finance_category_idempotency_state AS state
WHERE line.id = snapshot.id;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = pg_catalog.jsonb_build_object(
  'invoiceId', snapshot.invoice_id,
  'leaseId', snapshot.lease_id,
  'lineId', snapshot.id
)
FROM rent_line_authority_snapshot AS snapshot
CROSS JOIN finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

SELECT is(
  app_private.valid_finance_category_idempotency_result(
    organization_id,
    'create_manual_tenant_charge',
    'category-idempotency-manual-charge-0001',
    false
  ),
  NULL::uuid,
  'a rent line is never valid manual-category lineage even with an exact category UUID'
)
FROM finance_category_idempotency_state;

UPDATE app_private.financial_idempotency_requests AS request
SET result_ids = snapshot.result_ids
FROM finance_category_idempotency_state AS state
CROSS JOIN manual_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

UPDATE public.tenant_invoice_lines AS line
SET finance_category_id = snapshot.finance_category_id
FROM rent_line_authority_snapshot AS snapshot
WHERE line.id = snapshot.id;

UPDATE app_private.financial_idempotency_requests AS request
SET actor_id = state.finance_manager_id
FROM finance_category_idempotency_state AS state
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

SELECT is(
  app_private.valid_finance_category_idempotency_result(
    organization_id,
    'create_manual_tenant_charge',
    'category-idempotency-manual-charge-0001',
    false
  ),
  NULL::uuid,
  'manual-category lineage rejects an actor that differs from the append-only activity'
)
FROM finance_category_idempotency_state;

UPDATE app_private.financial_idempotency_requests AS request
SET actor_id = snapshot.actor_id,
    payload_hash = pg_catalog.repeat('a', 64)
FROM finance_category_idempotency_state AS state
CROSS JOIN manual_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

SELECT is(
  app_private.valid_finance_category_idempotency_result(
    organization_id,
    'create_manual_tenant_charge',
    'category-idempotency-manual-charge-0001',
    false
  ),
  NULL::uuid,
  'manual-category lineage rejects an activity payload hash mismatch'
)
FROM finance_category_idempotency_state;

UPDATE app_private.financial_idempotency_requests AS request
SET payload_hash = snapshot.payload_hash
FROM finance_category_idempotency_state AS state
CROSS JOIN manual_result_authority_snapshot AS snapshot
WHERE request.organization_id = state.organization_id
  AND request.operation = 'create_manual_tenant_charge'
  AND request.idempotency_key = 'category-idempotency-manual-charge-0001';

INSERT INTO public.activity_logs (
  organization_id, actor_id, entity_type, entity_id, action,
  previous_values, new_values
)
SELECT activity.organization_id, activity.actor_id, activity.entity_type,
  activity.entity_id, activity.action,
  pg_catalog.jsonb_build_object('categoryLineageDuplicateTest', true),
  activity.new_values
FROM public.activity_logs AS activity
JOIN finance_category_idempotency_state AS state
  ON activity.organization_id = state.organization_id
WHERE activity.action = 'manual_tenant_charge_created'
  AND activity.new_values->>'lineId' = state.manual_result->>'lineId';

SELECT is(
  app_private.valid_finance_category_idempotency_result(
    organization_id,
    'create_manual_tenant_charge',
    'category-idempotency-manual-charge-0001',
    false
  ),
  NULL::uuid,
  'ambiguous duplicate append-only activities fail closed'
)
FROM finance_category_idempotency_state;

DELETE FROM public.activity_logs
WHERE previous_values =
  pg_catalog.jsonb_build_object('categoryLineageDuplicateTest', true);

SELECT is(
  app_private.valid_finance_category_idempotency_result(
    organization_id,
    'create_manual_tenant_charge',
    'category-idempotency-manual-charge-0001',
    true
  ),
  (manual_result->>'lineId')::uuid,
  'unique manual activity lineage resolves the exact sealed line again'
)
FROM finance_category_idempotency_state;

SELECT throws_ok(
  $$
    UPDATE app_private.finance_category_idempotency_result_seals
    SET result_id = pg_catalog.gen_random_uuid()
    WHERE operation = 'submit_expense'
      AND idempotency_key = 'category-idempotency-owner-expense-0001'
  $$,
  '55000',
  'Finance category idempotency result seals are immutable',
  'sealed result identity cannot be reassigned'
);

SELECT throws_ok(
  $$
    INSERT INTO app_private.finance_category_idempotency_bindings (
      organization_id,
      operation,
      idempotency_key,
      namespace,
      finance_category_id
    )
    SELECT
      state.organization_id,
      'submit_expense',
      'category-idempotency-binding-cross-org-0001',
      'owner_expense',
      category.id
    FROM finance_category_idempotency_state AS state
    JOIN public.finance_categories AS category
      ON category.organization_id =
        '00000000-0000-0000-0000-000000000099'::uuid
     AND category.namespace = 'owner_expense'
     AND category.code = 'other'
  $$,
  '23503',
  NULL,
  'the canonical category foreign key rejects cross-organization bindings'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'app_private.finance_category_idempotency_bindings',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'app_private.finance_category_idempotency_bindings',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'service_role',
    'app_private.finance_category_idempotency_bindings',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'anon',
    'app_private.finance_category_idempotency_result_seals',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'app_private.finance_category_idempotency_result_seals',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  AND NOT has_table_privilege(
    'service_role',
    'app_private.finance_category_idempotency_result_seals',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'private canonical bindings and result seals are not exposed through Data API roles'
);

SELECT ok(
  (
    SELECT bool_and(
      procedure.prosecdef
      AND procedure.proowner = 'postgres'::regrole
      AND 'search_path=""' = ANY (coalesce(procedure.proconfig, '{}'::text[]))
      AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      AND has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    )
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid IN (
      'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure
    )
  ),
  'public category-aware RPCs retain checked definer, owner, search_path, and grants'
);

SELECT ok(
  (
    SELECT category_table.relrowsecurity
    FROM pg_catalog.pg_class AS category_table
    WHERE category_table.oid = 'public.finance_categories'::regclass
  ),
  'the public category authority remains protected by RLS'
);

SELECT * FROM finish();
ROLLBACK;
