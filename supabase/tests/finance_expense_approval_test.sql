BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_table(
  'public',
  'expense_submissions',
  'human-entered costs have a non-financial submission boundary'
);
SELECT has_table(
  'public',
  'expense_customer_adjustments',
  'customer-facing expense reversals are append-only adjustments'
);
SELECT has_function(
  'public',
  'submit_expense',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'date',
    'numeric', 'numeric', 'currency_code', 'text', 'uuid', 'uuid', 'uuid',
    'uuid', 'text', 'text'
  ],
  'Finance Member and Super Admin share one checked submission RPC'
);
SELECT has_function(
  'public',
  'review_expense',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'Finance Manager and Super Admin share one checked review RPC'
);
SELECT has_function(
  'public',
  'reverse_expense',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'Super Admin has one checked expense reversal RPC'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.record_ips_paid_expense(uuid,uuid,uuid,text,text,date,numeric,numeric,text,uuid,uuid,uuid,text,text)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'the direct paid-expense RPC is retired from the Data API'
);

CREATE TEMP TABLE expense_approval_state (
  organization_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000102',
  finance_member_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000103',
  operations_manager_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000104',
  property_id uuid NOT NULL DEFAULT 'b2000000-0000-0000-0000-000000000001',
  cross_property_id uuid NOT NULL DEFAULT 'b2000000-0000-0000-0000-000000000002',
  unit_id uuid NOT NULL DEFAULT 'b3000000-0000-0000-0000-000000000001',
  owner_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000001',
  operations_person_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000002',
  tenant_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000003',
  lease_id uuid NOT NULL DEFAULT 'b5000000-0000-0000-0000-000000000001',
  billing_id uuid NOT NULL DEFAULT 'b6000000-0000-0000-0000-000000000001',
  invoice_id uuid NOT NULL DEFAULT 'b7000000-0000-0000-0000-000000000001',
  source_id uuid,
  submission_id uuid,
  rejection_submission_id uuid,
  locked_submission_id uuid,
  tenant_submission_id uuid,
  approval_result jsonb,
  tenant_approval_result jsonb,
  reversal_result jsonb
) ON COMMIT DROP;

INSERT INTO expense_approval_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON expense_approval_state TO authenticated;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  label || '@expense-approval.test',
  extensions.crypt('expense-approval-test', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM expense_approval_state
  UNION ALL
  SELECT finance_manager_id, 'finance-manager' FROM expense_approval_state
  UNION ALL
  SELECT finance_member_id, 'finance-member' FROM expense_approval_state
  UNION ALL
  SELECT operations_manager_id, 'operations-manager' FROM expense_approval_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Expense approval organization', 'expense-approval'
FROM expense_approval_state
UNION ALL
SELECT cross_organization_id, 'Cross expense organization', 'cross-expense'
FROM expense_approval_state;

INSERT INTO public.organization_branches (organization_id, name, code)
SELECT organization_id, 'Expense operations', 'EXP-OPS'
FROM expense_approval_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Expense Owner', 'individual'
FROM expense_approval_state
UNION ALL
SELECT operations_person_id, organization_id, 'Expense Operations Manager', 'individual'
FROM expense_approval_state
UNION ALL
SELECT tenant_id, organization_id, 'Expense Tenant', 'individual'
FROM expense_approval_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, owner_id, 'owner', 'active'
FROM expense_approval_state
UNION ALL
SELECT organization_id, operations_person_id, 'staff', 'active'
FROM expense_approval_state
UNION ALL
SELECT organization_id, tenant_id, 'tenant', 'active'
FROM expense_approval_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT organization_id, finance_member_id, 'finance_member', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT
  state.organization_id,
  state.operations_manager_id,
  'operations_manager',
  state.operations_person_id,
  branch.id
FROM expense_approval_state AS state
JOIN public.organization_branches AS branch
  ON branch.organization_id = state.organization_id
UNION ALL
SELECT cross_organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM expense_approval_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Expense approval property',
  'EA-001',
  'apartment',
  'active'
FROM expense_approval_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Cross expense property',
  'EA-002',
  'apartment',
  'active'
FROM expense_approval_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT unit_id, organization_id, property_id, 'EA-A1', 'vacant'
FROM expense_approval_state;

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  tenant_name,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  status,
  created_by,
  updated_by
)
SELECT
  lease_id,
  organization_id,
  property_id,
  unit_id,
  tenant_id,
  'Expense Tenant',
  '2026-08-01',
  '2027-07-31',
  1000,
  'USD',
  'draft',
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

INSERT INTO public.lease_billing_terms (
  id,
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  billing_id,
  organization_id,
  lease_id,
  property_id,
  '2026-08-01',
  '2027-07-31',
  'through_ips',
  'percentage',
  10,
  true,
  true,
  'individual',
  tenant_id,
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

INSERT INTO public.tenant_invoices (
  id,
  organization_id,
  invoice_number,
  property_id,
  unit_id,
  lease_id,
  billing_term_id,
  billing_period_start,
  billing_period_end,
  issue_date,
  due_date,
  collection_route,
  recipient_kind,
  recipient_person_id,
  recipient_label,
  occupant_labels,
  currency,
  total_amount,
  created_by
)
SELECT
  invoice_id,
  organization_id,
  'EA-INV-0001',
  property_id,
  unit_id,
  lease_id,
  billing_id,
  '2026-08-01',
  '2026-08-31',
  '2026-08-01',
  '2026-08-05',
  'through_ips',
  'individual',
  tenant_id,
  'Expense Tenant',
  ARRAY['Expense Tenant'],
  'USD',
  1000,
  super_admin_id
FROM expense_approval_state;

INSERT INTO public.property_owners (
  organization_id,
  property_id,
  person_id,
  ownership_label,
  ownership_percent,
  is_primary,
  started_on,
  created_by,
  updated_by
)
SELECT
  organization_id,
  property_id,
  owner_id,
  'Primary owner',
  100,
  true,
  '2025-01-01',
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM expense_approval_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET source_id = public.create_financial_reconciliation_source(
      organization_id,
      'EXPAUTH',
      'Expense approval operating account',
      'bank',
      'property_dedicated',
      'USD',
      property_id,
      '****4401'
    )
  $$,
  'Super Admin creates the approved property funding source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET submission_id = (
      public.submit_expense(
        organization_id,
        property_id,
        unit_id,
        'general',
        NULL,
        'cleaning',
        'Clean Co.',
        '2026-08-08',
        50,
        20,
        'USD',
        'owner',
        NULL,
        source_id,
        NULL,
        NULL,
        'Move-out cleaning',
        'expense-submit-owner-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Finance Member can submit a paid owner expense for review'
);

SELECT results_eq(
  $$
    SELECT status, submitted_by, internal_cost_amount,
      internal_markup_amount, customer_total_amount, responsibility
    FROM public.expense_submissions
    WHERE id = (SELECT submission_id FROM expense_approval_state)
  $$,
  $$
    SELECT
      'submitted'::text,
      finance_member_id,
      50.00::numeric,
      20.00::numeric,
      70.00::numeric,
      'owner'::text
    FROM expense_approval_state
  $$,
  'submission preserves the exact reviewer-visible cost snapshot'
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.finance_expense_items),
      (SELECT count(*) FROM public.finance_payments),
      (SELECT count(*) FROM public.finance_payment_allocations),
      (SELECT count(*) FROM public.ips_expense_responsibilities),
      (SELECT count(*) FROM public.ledger_entries),
      (SELECT count(*) FROM public.accounting_journal_entries),
      (SELECT count(*) FROM public.owner_invoice_lines)
  $$,
  $$VALUES (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'submission creates no financial, Ledger, journal, or customer effect'
);

SELECT is(
  (
    public.submit_expense(
      organization_id,
      property_id,
      unit_id,
      'general',
      NULL,
      'cleaning',
      'Clean Co.',
      '2026-08-08',
      50,
      20,
      'USD',
      'owner',
      NULL,
      source_id,
      NULL,
      NULL,
      'Move-out cleaning',
      'expense-submit-owner-0001'
    )->>'submission_id'
  )::uuid,
  (SELECT submission_id FROM expense_approval_state),
  'an exact submission replay returns the original immutable record'
)
FROM expense_approval_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.submit_expense(
        %L, %L, %L, 'general', NULL, 'other', 'Blocked vendor',
        '2026-08-08', 10, 0, 'USD', 'owner', NULL, %L,
        NULL, NULL, 'Blocked submit', 'expense-manager-submit-0001'
      )
    $sql$,
    organization_id,
    property_id,
    unit_id,
    source_id
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot submit or edit expenses'
)
FROM expense_approval_state;

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET approval_result = public.review_expense(
      organization_id,
      submission_id,
      'approve',
      NULL,
      'expense-approve-owner-0001'
    )
  $$,
  'Finance Manager can approve a submitted expense'
);

SELECT results_eq(
  $$
    SELECT
      submission.status,
      submission.reviewed_by,
      expense.status,
      payment.amount,
      payment.reconciliation_source_id,
      allocation.amount,
      allocation.signed_amount,
      allocation.settlement_contract_version
    FROM public.expense_submissions AS submission
    JOIN public.finance_expense_items AS expense
      ON expense.id = submission.approved_finance_expense_item_id
    JOIN public.finance_payments AS payment
      ON payment.id = submission.approved_payment_id
    JOIN public.finance_payment_allocations AS allocation
      ON allocation.id = submission.approved_payment_allocation_id
    WHERE submission.id = (SELECT submission_id FROM expense_approval_state)
  $$,
  $$
    SELECT
      'approved'::text,
      finance_manager_id,
      'paid'::text,
      50.00::numeric,
      source_id,
      50.00::numeric,
      -50.00::numeric,
      'expense_approval.v1'::text
    FROM expense_approval_state
  $$,
  'approval atomically records the exact paid-expense settlement snapshot'
);

SELECT results_eq(
  $$
    SELECT
      ledger.source_type,
      ledger.source_id,
      ledger.direction,
      ledger.amount,
      journal.source_type,
      journal.source_id,
      sum(lines.debit_amount),
      sum(lines.credit_amount)
    FROM public.expense_submissions AS submission
    JOIN public.ledger_entries AS ledger
      ON ledger.id = submission.approved_ledger_entry_id
    JOIN public.accounting_journal_entries AS journal
      ON journal.id = submission.approved_journal_entry_id
    JOIN public.accounting_journal_lines AS lines
      ON lines.journal_entry_id = journal.id
    WHERE submission.id = (SELECT submission_id FROM expense_approval_state)
    GROUP BY ledger.source_type, ledger.source_id, ledger.direction,
      ledger.amount, journal.source_type, journal.source_id
  $$,
  $$
    SELECT
      'payment_allocation'::text,
      (approval_result->>'payment_allocation_id')::uuid,
      'expense'::text,
      50.00::numeric,
      'payment_allocation'::text,
      (approval_result->>'payment_allocation_id')::uuid,
      50.00::numeric,
      50.00::numeric
    FROM expense_approval_state
  $$,
  'approval creates one balanced Ledger and journal projection at allocation identity'
);

SELECT results_eq(
  $$
    SELECT
      responsibility.responsibility,
      responsibility.internal_cost_amount,
      responsibility.internal_markup_amount,
      responsibility.customer_total_amount,
      line.amount
    FROM public.expense_submissions AS submission
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.id = submission.approved_responsibility_id
    JOIN public.owner_invoice_lines AS line
      ON line.id = responsibility.owner_invoice_line_id
    WHERE submission.id = (SELECT submission_id FROM expense_approval_state)
  $$,
  $$VALUES ('owner'::text, 50.00::numeric, 20.00::numeric, 70.00::numeric, 70.00::numeric)$$,
  'approval creates the owner responsibility and simple customer charge once'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.review_expense(
        %L, %L, 'reject', 'Not supported', 'expense-member-review-0001'
      )
    $sql$,
    organization_id,
    submission_id
  ),
  '42501',
  'Not authorized',
  'Finance Member cannot review an expense'
)
FROM expense_approval_state;

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET rejection_submission_id = (
      public.submit_expense(
        organization_id,
        property_id,
        unit_id,
        'general',
        NULL,
        'other',
        'Review Vendor',
        '2026-08-09',
        15,
        0,
        'USD',
        'owner',
        NULL,
        source_id,
        NULL,
        NULL,
        'Needs review',
        'expense-submit-reject-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Finance Member can submit a second independent expense'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.review_expense(
        %L, %L, 'reject', NULL, 'expense-reject-no-reason-0001'
      )
    $sql$,
    organization_id,
    rejection_submission_id
  ),
  '22023',
  'A rejection reason is required',
  'rejection fails closed without a reviewer reason'
)
FROM expense_approval_state;

SELECT lives_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      rejection_submission_id,
      'reject',
      'Receipt does not match the cost',
      'expense-reject-0001'
    )
    FROM expense_approval_state
  $$,
  'Finance Manager can reject with an operational reason'
);

SELECT results_eq(
  $$
    SELECT status, review_reason, approved_finance_expense_item_id IS NULL
    FROM public.expense_submissions
    WHERE id = (SELECT rejection_submission_id FROM expense_approval_state)
  $$,
  $$VALUES ('rejected'::text, 'Receipt does not match the cost'::text, true)$$,
  'rejection preserves the reason and creates no approved source link'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET reversal_result = public.reverse_expense(
      organization_id,
      submission_id,
      '2026-08-10',
      'Vendor refunded the charge',
      'expense-reverse-owner-0001'
    )
  $$,
  'Super Admin can reverse an approved expense with a reason'
);

SELECT results_eq(
  $$
    SELECT
      submission.status,
      submission.reversed_by,
      reversal.reversal_of_id,
      reversal_allocation.reversal_of_allocation_id,
      reversal_allocation.signed_amount,
      ledger.direction,
      ledger.amount,
      adjustment.amount
    FROM public.expense_submissions AS submission
    JOIN public.finance_payments AS reversal
      ON reversal.id = submission.reversal_payment_id
    JOIN public.finance_payment_allocations AS reversal_allocation
      ON reversal_allocation.id = submission.reversal_payment_allocation_id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = submission.reversal_ledger_entry_id
    JOIN public.expense_customer_adjustments AS adjustment
      ON adjustment.submission_id = submission.id
    WHERE submission.id = (SELECT submission_id FROM expense_approval_state)
  $$,
  $$
    SELECT
      'reversed'::text,
      super_admin_id,
      (approval_result->>'payment_id')::uuid,
      (approval_result->>'payment_allocation_id')::uuid,
      50.00::numeric,
      'income'::text,
      50.00::numeric,
      -70.00::numeric
    FROM expense_approval_state
  $$,
  'reversal appends opposite cash, allocation, Ledger, and customer evidence'
);

SELECT results_eq(
  $$
    SELECT total_amount, paid_from_held_cash, paid_by_owner, balance_due
    FROM public.owner_invoice_balances
    WHERE property_id = (SELECT property_id FROM expense_approval_state)
  $$,
  $$VALUES (0.00::numeric, 0.00::numeric, 0.00::numeric, 0.00::numeric)$$,
  'the reversed owner charge no longer affects the owner balance'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.reverse_expense(
        %L, %L, '2026-08-11', 'Duplicate reversal',
        'expense-reverse-owner-0002'
      )
    $sql$,
    organization_id,
    submission_id
  ),
  '22023',
  'Only an approved expense can be reversed',
  'a second reversal is rejected without new effects'
)
FROM expense_approval_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET tenant_submission_id = (
      public.submit_expense(
        organization_id,
        property_id,
        unit_id,
        'general',
        NULL,
        'utility',
        'Utility Vendor',
        '2026-08-12',
        20,
        5,
        'USD',
        'tenant',
        invoice_id,
        source_id,
        NULL,
        NULL,
        'Tenant utility recovery',
        'expense-submit-tenant-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Finance Member can submit a tenant-responsible cost'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET tenant_approval_result = public.review_expense(
      organization_id,
      tenant_submission_id,
      'approve',
      NULL,
      'expense-approve-tenant-0001'
    )
  $$,
  'Finance Manager can approve a tenant-responsible cost'
);

SELECT is(
  public.review_expense(
    organization_id,
    tenant_submission_id,
    'approve',
    NULL,
    'expense-approve-tenant-0001'
  ),
  tenant_approval_result,
  'an exact review replay returns the original approval result'
)
FROM expense_approval_state;

SELECT results_eq(
  $$
    SELECT
      invoice.total_amount,
      line.amount,
      line.internal_cost_amount,
      line.internal_markup_amount,
      responsibility.responsibility
    FROM public.expense_submissions AS submission
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.id = submission.approved_responsibility_id
    JOIN public.tenant_invoice_lines AS line
      ON line.id = responsibility.tenant_invoice_line_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.id = line.invoice_id
    WHERE submission.id = (SELECT tenant_submission_id FROM expense_approval_state)
  $$,
  $$VALUES (1025.00::numeric, 25.00::numeric, 20.00::numeric, 5.00::numeric, 'tenant'::text)$$,
  'tenant approval adds one simple customer charge with private cost and markup'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    SELECT public.reverse_expense(
      organization_id,
      tenant_submission_id,
      '2026-08-13',
      'Tenant charge was entered in error',
      'expense-reverse-tenant-0001'
    )
    FROM expense_approval_state
  $$,
  'Super Admin can reverse an unsettled tenant charge exactly'
);

SELECT results_eq(
  $$
    SELECT invoice.total_amount, income.status, adjustment.amount
    FROM public.expense_submissions AS submission
    JOIN public.expense_customer_adjustments AS adjustment
      ON adjustment.submission_id = submission.id
    JOIN public.tenant_invoices AS invoice
      ON invoice.id = adjustment.tenant_invoice_id
    JOIN public.finance_income_items AS income
      ON income.id = adjustment.tenant_income_item_id
    WHERE submission.id = (SELECT tenant_submission_id FROM expense_approval_state)
  $$,
  $$VALUES (1000.00::numeric, 'void'::text, -25.00::numeric)$$,
  'tenant reversal removes the invoice effect and voids the unsettled charge source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE expense_approval_state
    SET locked_submission_id = (
      public.submit_expense(
        organization_id,
        property_id,
        unit_id,
        'general',
        NULL,
        'other',
        'Locked Vendor',
        '2026-08-14',
        30,
        0,
        'USD',
        'owner',
        NULL,
        source_id,
        NULL,
        NULL,
        'Locked period expense',
        'expense-submit-locked-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Finance Member can submit evidence while the period is open'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM expense_approval_state),
  true
);

SELECT lives_ok(
  $$
    SELECT public.set_ledger_period_lock(
      organization_id,
      '2026-08-01',
      true,
      'Expense approval lock test'
    )
    FROM expense_approval_state
  $$,
  'Super Admin can lock the submitted expense month'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.review_expense(
        %L, %L, 'approve', NULL, 'expense-approve-locked-0001'
      )
    $sql$,
    organization_id,
    locked_submission_id
  ),
  '22023',
  'Organization Ledger period is locked',
  'approval creates no partial effects in a locked period'
)
FROM expense_approval_state;

SELECT results_eq(
  $$
    SELECT status, approved_finance_expense_item_id IS NULL
    FROM public.expense_submissions
    WHERE id = (SELECT locked_submission_id FROM expense_approval_state)
  $$,
  $$VALUES ('submitted'::text, true)$$,
  'locked-period failure leaves the submission awaiting review'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.submit_expense(
        %L, %L, NULL, 'general', NULL, 'other', 'Cross vendor',
        '2026-08-08', 10, 0, 'USD', 'owner', NULL, %L,
        NULL, NULL, 'Cross organization', 'expense-cross-org-0001'
      )
    $sql$,
    cross_organization_id,
    cross_property_id,
    source_id
  ),
  '42501',
  'Not authorized',
  'expense submission cannot cross the caller organization'
)
FROM expense_approval_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM expense_approval_state),
  true
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.submit_expense(
        %L, %L, %L, 'general', NULL, 'other', 'Operations vendor',
        '2026-08-08', 10, 0, 'USD', 'owner', NULL, %L,
        NULL, NULL, 'Operations bypass', 'expense-operations-0001'
      )
    $sql$,
    organization_id,
    property_id,
    unit_id,
    source_id
  ),
  '42501',
  'Not authorized',
  'Operations Manager cannot bypass the maintenance handoff with a general expense'
)
FROM expense_approval_state;

SELECT * FROM finish();
ROLLBACK;
