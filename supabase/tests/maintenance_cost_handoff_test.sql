BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_column(
  'public',
  'tasks',
  'actual_cost_date',
  'maintenance keeps the operational cost date on the task'
);
SELECT has_column(
  'public',
  'tasks',
  'actual_cost_document_id',
  'maintenance can identify the submitted receipt'
);
SELECT has_column(
  'public',
  'tasks',
  'actual_cost_reference',
  'maintenance keeps a compact cost reference'
);
SELECT has_function(
  'public',
  'submit_maintenance_cost',
  ARRAY['uuid', 'uuid', 'date', 'uuid', 'text', 'text'],
  'Operations has one checked maintenance-to-Finance handoff'
);
SELECT has_function(
  'public',
  'get_maintenance_cost_statuses',
  ARRAY['uuid', 'uuid[]'],
  'Operations reads only a checked maintenance cost status projection'
);
SELECT has_function(
  'public',
  'get_maintenance_task_documents',
  ARRAY['uuid', 'uuid[]'],
  'Operations reads task evidence through a checked projection'
);
SELECT has_function(
  'public',
  'get_expense_submission_evidence',
  ARRAY['uuid', 'uuid[]'],
  'Finance has a checked evidence projection for submitted expenses'
);
SELECT has_function(
  'public',
  'review_expense',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'uuid'],
  'Finance review accepts a checked funding source at approval'
);
SELECT has_column(
  'public',
  'expense_submissions',
  'adjusts_submission_id',
  'maintenance adjustments preserve append-only submission lineage'
);

CREATE TEMP TABLE maintenance_cost_state (
  organization_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000102',
  operations_manager_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000103',
  operations_member_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000104',
  branch_id uuid NOT NULL DEFAULT 'c8000000-0000-0000-0000-000000000001',
  other_branch_id uuid NOT NULL DEFAULT 'c8000000-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000001',
  alternate_property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000003',
  cross_property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000002',
  unit_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000001',
  alternate_unit_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000002',
  owner_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000001',
  vendor_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000002',
  operations_manager_person_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000003',
  operations_member_person_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000004',
  request_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000001',
  rejected_request_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000002',
  other_branch_request_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000003',
  task_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000001',
  rejected_task_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000002',
  other_branch_task_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000003',
  direct_link_task_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000004',
  document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000001',
  other_branch_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000002',
  forged_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000004',
  blocked_forged_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000005',
  cross_ledger_entry_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000003',
  funding_source_id uuid NOT NULL DEFAULT 'c9000000-0000-0000-0000-000000000001',
  submission_id uuid,
  forged_submission_id uuid,
  adjustment_submission_id uuid,
  rejected_submission_id uuid,
  resubmission_id uuid
) ON COMMIT DROP;

INSERT INTO maintenance_cost_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON maintenance_cost_state TO authenticated;

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
  label || '@maintenance-cost.test',
  extensions.crypt('maintenance-cost-test', extensions.gen_salt('bf')),
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
  SELECT super_admin_id, 'super-admin' FROM maintenance_cost_state
  UNION ALL
  SELECT finance_manager_id, 'finance-manager' FROM maintenance_cost_state
  UNION ALL
  SELECT operations_manager_id, 'operations-manager' FROM maintenance_cost_state
  UNION ALL
  SELECT operations_member_id, 'operations-member' FROM maintenance_cost_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Maintenance cost organization', 'maintenance-cost'
FROM maintenance_cost_state
UNION ALL
SELECT cross_organization_id, 'Cross maintenance organization', 'cross-maintenance-cost'
FROM maintenance_cost_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, 'Operations North', 'OPS-N'
FROM maintenance_cost_state
UNION ALL
SELECT other_branch_id, organization_id, 'Operations South', 'OPS-S'
FROM maintenance_cost_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Maintenance Owner', 'individual'
FROM maintenance_cost_state
UNION ALL
SELECT vendor_id, organization_id, 'Reliable Repairs', 'company'
FROM maintenance_cost_state
UNION ALL
SELECT operations_manager_person_id, organization_id, 'Operations Manager', 'individual'
FROM maintenance_cost_state
UNION ALL
SELECT operations_member_person_id, organization_id, 'Operations Member', 'individual'
FROM maintenance_cost_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, owner_id, 'owner', 'active'
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, vendor_id, 'vendor', 'active'
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, operations_manager_person_id, 'staff', 'active'
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, operations_member_person_id, 'staff', 'active'
FROM maintenance_cost_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid
FROM maintenance_cost_state
UNION ALL
SELECT
  organization_id,
  operations_manager_id,
  'operations_manager',
  operations_manager_person_id,
  branch_id
FROM maintenance_cost_state
UNION ALL
SELECT
  organization_id,
  operations_member_id,
  'operations_member',
  operations_member_person_id,
  branch_id
FROM maintenance_cost_state;

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
  'Maintenance cost property',
  'MC-001',
  'apartment',
  'active'
FROM maintenance_cost_state
UNION ALL
SELECT
  alternate_property_id,
  organization_id,
  'Alternate maintenance property',
  'MC-003',
  'apartment',
  'active'
FROM maintenance_cost_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Cross maintenance property',
  'MC-002',
  'apartment',
  'active'
FROM maintenance_cost_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT unit_id, organization_id, property_id, 'MC-A1', 'vacant'
FROM maintenance_cost_state
UNION ALL
SELECT alternate_unit_id, organization_id, property_id, 'MC-A2', 'vacant'
FROM maintenance_cost_state;

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
FROM maintenance_cost_state;

INSERT INTO public.tenant_requests (
  id,
  organization_id,
  property_id,
  unit_id,
  title,
  category,
  status,
  created_by
)
SELECT
  request_id,
  organization_id,
  property_id,
  unit_id,
  'Repair water pump',
  'Repairs',
  'open',
  super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT
  rejected_request_id,
  organization_id,
  property_id,
  unit_id,
  'Replace door lock',
  'Repairs',
  'open',
  super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT
  other_branch_request_id,
  organization_id,
  property_id,
  unit_id,
  'Other branch repair',
  'Repairs',
  'open',
  super_admin_id
FROM maintenance_cost_state;

INSERT INTO public.tasks (
  id,
  organization_id,
  tenant_request_id,
  property_id,
  unit_id,
  branch_id,
  assignee_person_id,
  title,
  category,
  priority,
  status,
  vendor_person_id,
  actual_cost_amount,
  actual_cost_currency,
  created_by,
  updated_by
)
SELECT
  task_id,
  organization_id,
  request_id,
  property_id,
  unit_id,
  branch_id,
  operations_member_person_id,
  'Repair water pump',
  'Repairs',
  'normal',
  'in_progress',
  vendor_id,
  125.50,
  'USD'::public.currency_code,
  super_admin_id,
  super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT
  rejected_task_id,
  organization_id,
  rejected_request_id,
  property_id,
  unit_id,
  branch_id,
  operations_member_person_id,
  'Replace door lock',
  'Repairs',
  'normal',
  'in_progress',
  vendor_id,
  80,
  'USD'::public.currency_code,
  super_admin_id,
  super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT
  other_branch_task_id,
  organization_id,
  other_branch_request_id,
  property_id,
  unit_id,
  other_branch_id,
  NULL,
  'Other branch repair',
  'Repairs',
  'normal',
  'in_progress',
  vendor_id,
  40,
  'USD'::public.currency_code,
  super_admin_id,
  super_admin_id
FROM maintenance_cost_state;

INSERT INTO public.ledger_entries (
  id,
  organization_id,
  property_id,
  transaction_date,
  direction,
  category,
  amount,
  currency,
  description
)
SELECT
  cross_ledger_entry_id,
  cross_organization_id,
  cross_property_id,
  '2026-08-08',
  'expense',
  'Legacy maintenance',
  40,
  'USD',
  'Cross-organization legacy Ledger entry'
FROM maintenance_cost_state;

INSERT INTO public.documents (
  id,
  organization_id,
  property_id,
  unit_id,
  task_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  uploaded_by
)
SELECT
  document_id,
  organization_id,
  property_id,
  unit_id,
  task_id,
  'Maintenance',
  'pump-receipt.pdf',
  organization_id::text || '/maintenance-cost/pump-receipt.pdf',
  'application/pdf',
  128,
  operations_manager_id
FROM maintenance_cost_state
UNION ALL
SELECT
  other_branch_document_id,
  organization_id,
  property_id,
  unit_id,
  other_branch_task_id,
  'Maintenance',
  'other-branch-receipt.pdf',
  organization_id::text || '/maintenance-cost/other-branch-receipt.pdf',
  'application/pdf',
  256,
  super_admin_id
FROM maintenance_cost_state;

-- Represent a legacy forged document row so both read projections can prove
-- that an organization prefix mismatch never grants storage access.
SET LOCAL session_replication_role = replica;
INSERT INTO public.documents (
  id,
  organization_id,
  property_id,
  unit_id,
  task_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  uploaded_by
)
SELECT
  forged_document_id,
  organization_id,
  property_id,
  unit_id,
  task_id,
  'Maintenance',
  'forged-receipt.pdf',
  cross_organization_id::text || '/maintenance-cost/forged-receipt.pdf',
  'application/pdf',
  512,
  super_admin_id
FROM maintenance_cost_state;
SET LOCAL session_replication_role = origin;

INSERT INTO storage.objects (bucket_id, name)
SELECT
  'nestory-documents',
  organization_id::text || '/maintenance-cost/pump-receipt.pdf'
FROM maintenance_cost_state
UNION ALL
SELECT
  'nestory-documents',
  organization_id::text || '/maintenance-cost/other-branch-receipt.pdf'
FROM maintenance_cost_state
UNION ALL
SELECT
  'nestory-documents',
  cross_organization_id::text || '/maintenance-cost/forged-receipt.pdf'
FROM maintenance_cost_state;

CREATE OR REPLACE FUNCTION pg_temp.update_maintenance_cost(
  p_task_id uuid,
  p_actual_cost numeric,
  p_link_to_ledger boolean DEFAULT false,
  p_unit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO STRICT target
  FROM public.tasks
  WHERE id = p_task_id;

  RETURN public.update_maintenance_task(
    target.id,
    target.organization_id,
    target.property_id,
    coalesce(p_unit_id, target.unit_id),
    target.title,
    target.description,
    target.category,
    target.priority,
    target.status,
    target.due_date,
    target.due_time,
    target.reminder_date,
    target.reminder_time,
    target.vendor_person_id,
    target.cost_estimate_amount,
    target.cost_estimate_currency,
    p_actual_cost,
    target.actual_cost_currency,
    target.checklist,
    target.recurrence_frequency,
    p_link_to_ledger,
    target.branch_id,
    target.assignee_person_id
  );
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.documents (
      id,
      organization_id,
      property_id,
      unit_id,
      task_id,
      category,
      file_name,
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by
    )
    SELECT
      blocked_forged_document_id,
      organization_id,
      property_id,
      unit_id,
      task_id,
      'Maintenance',
      'blocked-forged-receipt.pdf',
      cross_organization_id::text || '/maintenance-cost/blocked-forged-receipt.pdf',
      'application/pdf',
      32,
      super_admin_id
    FROM maintenance_cost_state
  $$,
  '22023',
  'Document storage path must belong to its organization',
  'new document metadata cannot point at another organization storage path'
);

SELECT lives_ok(
  $$
    UPDATE maintenance_cost_state
    SET funding_source_id = public.create_financial_reconciliation_source(
      organization_id,
      'MCBANK',
      'Maintenance operating account',
      'bank',
      'property_dedicated',
      'USD',
      property_id,
      '****8801'
    )
  $$,
  'Super Admin creates the approved maintenance funding source'
);

SELECT throws_ok(
  $$
    SELECT public.submit_expense(
      organization_id,
      property_id,
      unit_id,
      'general',
      NULL,
      'other',
      'Forged evidence vendor',
      '2026-08-08',
      10,
      0,
      'USD',
      'owner',
      NULL,
      funding_source_id,
      forged_document_id,
      vendor_id,
      'Forged cross-organization evidence',
      'maintenance-forged-evidence-0001'
    )
    FROM maintenance_cost_state
  $$,
  '23503',
  'Supporting receipt does not belong to property',
  'legacy forged document metadata cannot enter the expense approval workflow'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.tasks (
      id,
      organization_id,
      tenant_request_id,
      property_id,
      unit_id,
      branch_id,
      title,
      category,
      priority,
      status,
      ledger_entry_id,
      created_by,
      updated_by
    )
    SELECT
      direct_link_task_id,
      organization_id,
      request_id,
      property_id,
      unit_id,
      branch_id,
      'Attempted direct Ledger link',
      'Repairs',
      'normal',
      'pending',
      cross_ledger_entry_id,
      operations_manager_id,
      operations_manager_id
    FROM maintenance_cost_state
  $$,
  '22023',
  'Direct maintenance cost posting is retired; submit the cost to Finance',
  'Operations cannot attach a guessed cross-organization Ledger entry during task creation'
);

SELECT results_eq(
  $$
    SELECT task_id, id, file_name, storage_path, mime_type, size_bytes
    FROM public.get_maintenance_task_documents(
      (SELECT organization_id FROM maintenance_cost_state),
      ARRAY[
        (SELECT task_id FROM maintenance_cost_state),
        (SELECT other_branch_task_id FROM maintenance_cost_state)
      ]
    )
  $$,
  $$
    SELECT
      task_id,
      document_id,
      'pump-receipt.pdf'::text,
      organization_id::text || '/maintenance-cost/pump-receipt.pdf',
      'application/pdf'::text,
      128::bigint
    FROM maintenance_cost_state
  $$,
  'Operations Manager sees evidence only for tasks in the assigned branch'
);

SELECT results_eq(
  $$
    SELECT name
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name LIKE '%/maintenance-cost/%receipt.pdf'
    ORDER BY name
  $$,
  $$
    SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
    FROM maintenance_cost_state
  $$,
  'Operations Manager can sign only storage objects linked to visible tasks'
);

SELECT lives_ok(
  $$
    UPDATE maintenance_cost_state
    SET submission_id = (
      public.submit_maintenance_cost(
        organization_id,
        task_id,
        '2026-08-08',
        document_id,
        'Pump receipt 42',
        'maintenance-cost-submit-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Operations Manager submits recorded maintenance cost to Finance'
);

SELECT results_eq(
  $$
    SELECT
      task_id,
      submission_id,
      status,
      review_reason,
      submitted_at IS NOT NULL
    FROM public.get_maintenance_cost_statuses(
      (SELECT organization_id FROM maintenance_cost_state),
      ARRAY[
        (SELECT task_id FROM maintenance_cost_state),
        (SELECT other_branch_task_id FROM maintenance_cost_state)
      ]
    )
  $$,
  $$
    SELECT
      task_id,
      submission_id,
      'submitted'::text,
      NULL::text,
      true
    FROM maintenance_cost_state
  $$,
  'Operations sees only its branch-scoped maintenance cost status'
);

SELECT results_eq(
  $$
    SELECT entity_type, entity_id, action
    FROM public.activity_logs
    WHERE entity_id = (SELECT task_id FROM maintenance_cost_state)
      AND action = 'cost_submitted_to_finance'
  $$,
  $$
    SELECT 'task'::text, task_id, 'cost_submitted_to_finance'::text
    FROM maintenance_cost_state
  $$,
  'Operations sees the maintenance-side Finance handoff in task activity'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.expense_submissions
    WHERE source_id = (SELECT task_id FROM maintenance_cost_state)
  ),
  0::bigint,
  'Operations cannot read the Finance submission base row'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      source_type,
      source_id,
      customer_category,
      vendor_label,
      expense_date,
      internal_cost_amount,
      internal_markup_amount,
      currency,
      responsibility,
      reconciliation_source_id,
      supporting_document_id,
      reference,
      status
    FROM public.expense_submissions
    WHERE id = (SELECT submission_id FROM maintenance_cost_state)
  $$,
  $$
    SELECT
      'maintenance_task'::text,
      task_id,
      'repairs_maintenance'::text,
      'Reliable Repairs'::text,
      '2026-08-08'::date,
      125.50::numeric,
      0::numeric,
      'USD'::public.currency_code,
      'owner'::text,
      NULL::uuid,
      document_id,
      'Pump receipt 42'::text,
      'submitted'::text
    FROM maintenance_cost_state
  $$,
  'the handoff snapshots operational facts without inventing a funding source'
);

SELECT throws_ok(
  $$
    UPDATE public.documents
    SET archived_at = now()
    WHERE id = (SELECT document_id FROM maintenance_cost_state)
  $$,
  '22023',
  'Expense submission evidence is immutable',
  'submitted evidence cannot be archived while Finance is reviewing it'
);

UPDATE public.documents
SET archived_at = NULL
WHERE id = (SELECT document_id FROM maintenance_cost_state);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE storage.objects
SET name = name || '.changed'
WHERE bucket_id = 'nestory-documents'
  AND name = (
    SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
    FROM maintenance_cost_state
  );

SELECT results_eq(
  $$
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name = (
        SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
        FROM maintenance_cost_state
      )
  $$,
  $$VALUES (1::bigint)$$,
  'Super Admin cannot rename evidence bytes referenced by a Finance submission'
);

SELECT throws_ok(
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name = (
        SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
        FROM maintenance_cost_state
      )
  $$,
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'direct storage deletion cannot remove Finance submission evidence'
);

SELECT results_eq(
  $$
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name = (
        SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
        FROM maintenance_cost_state
      )
  $$,
  $$VALUES (1::bigint)$$,
  'Super Admin cannot delete evidence bytes referenced by a Finance submission'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    public.submit_maintenance_cost(
      organization_id,
      task_id,
      '2026-08-08',
      document_id,
      'Pump receipt 42',
      'maintenance-cost-submit-0001'
    )->>'submission_id'
  )::uuid,
  (SELECT submission_id FROM maintenance_cost_state),
  'a completed maintenance submission replay survives an attempted evidence mutation'
)
FROM maintenance_cost_state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT actual_cost_date, actual_cost_document_id, actual_cost_reference
    FROM public.tasks
    WHERE id = (SELECT task_id FROM maintenance_cost_state)
  $$,
  $$
    SELECT '2026-08-08'::date, document_id, 'Pump receipt 42'::text
    FROM maintenance_cost_state
  $$,
  'the task preserves the submitted date, evidence, and reference'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_expense_items
    WHERE task_id = (SELECT task_id FROM maintenance_cost_state)
  ),
  0::bigint,
  'submission creates no approved Finance expense'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.finance_payments AS payment
    JOIN public.finance_payment_allocations AS allocation
      ON allocation.organization_id = payment.organization_id
     AND allocation.payment_id = payment.id
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = allocation.organization_id
     AND expense.id = allocation.expense_item_id
    WHERE expense.task_id = (
      SELECT task_id FROM maintenance_cost_state
    )
  ),
  0::bigint,
  'submission creates no cash effect'
);
SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      task_id,
      '2026-08-08',
      document_id,
      'Duplicate alternate request',
      'maintenance-cost-submit-0002'
    )
    FROM maintenance_cost_state
  $$,
  '22023',
  'This maintenance cost is already awaiting Finance review',
  'a maintenance task has only one pending cost review'
);

SELECT throws_ok(
  $$SELECT pg_temp.update_maintenance_cost(
    'c6000000-0000-0000-0000-000000000001',
    130,
    false
  )$$,
  '22023',
  'Submitted maintenance cost fields are locked',
  'submitted cost cannot be edited while Finance is reviewing it'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);

SELECT throws_ok(
  $$
    UPDATE public.tasks
    SET property_id = (
          SELECT alternate_property_id FROM maintenance_cost_state
        ),
        unit_id = NULL
    WHERE id = (SELECT task_id FROM maintenance_cost_state)
  $$,
  '22023',
  'Submitted maintenance cost fields are locked',
  'submitted maintenance property cannot change while Finance is reviewing it'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT throws_ok(
  $$SELECT pg_temp.update_maintenance_cost(
    'c6000000-0000-0000-0000-000000000002',
    80,
    true
  )$$,
  '22023',
  'Direct maintenance cost posting is retired; submit the cost to Finance',
  'the old direct Ledger switch is retired'
);

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      other_branch_task_id,
      '2026-08-08',
      NULL,
      'Wrong branch',
      'maintenance-cost-cross-branch'
    )
    FROM maintenance_cost_state
  $$,
  '42501',
  'Not authorized for this maintenance task',
  'Operations Manager cannot submit another branch cost'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_member_id::text FROM maintenance_cost_state),
  true
);

SELECT results_eq(
  $$
    SELECT task_id, id, file_name
    FROM public.get_maintenance_task_documents(
      (SELECT organization_id FROM maintenance_cost_state),
      ARRAY[
        (SELECT task_id FROM maintenance_cost_state),
        (SELECT other_branch_task_id FROM maintenance_cost_state)
      ]
    )
  $$,
  $$
    SELECT task_id, document_id, 'pump-receipt.pdf'::text
    FROM maintenance_cost_state
  $$,
  'Operations Member receives documents only for an assigned task'
);

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      rejected_task_id,
      '2026-08-08',
      NULL,
      'Member attempt',
      'maintenance-cost-member-denied'
    )
    FROM maintenance_cost_state
  $$,
  '42501',
  'Not authorized',
  'Operations Member cannot submit maintenance cost'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT results_eq(
  $$
    SELECT submission_id, document_id, file_name, mime_type, size_bytes
    FROM public.get_expense_submission_evidence(
      (SELECT organization_id FROM maintenance_cost_state),
      ARRAY[
        (SELECT submission_id FROM maintenance_cost_state),
        (SELECT forged_submission_id FROM maintenance_cost_state)
      ]
    )
  $$,
  $$
    SELECT
      submission_id,
      document_id,
      'pump-receipt.pdf'::text,
      'application/pdf'::text,
      128::bigint
    FROM maintenance_cost_state
  $$,
  'Finance can inspect the exact maintenance receipt before approval'
);

SELECT results_eq(
  $$
    SELECT name
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name LIKE '%/maintenance-cost/%receipt.pdf'
    ORDER BY name
  $$,
  $$
    SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
    FROM maintenance_cost_state
  $$,
  'Finance cannot sign a forged evidence path that belongs to another organization'
);

SELECT throws_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      submission_id,
      'approve',
      'Receipt reviewed',
      'maintenance-review-no-source',
      NULL
    )
    FROM maintenance_cost_state
  $$,
  '22023',
  'Choose the funding source used for this maintenance cost',
  'Finance cannot approve maintenance cost without a funding source'
);

SELECT results_eq(
  $$
    SELECT status, reconciliation_source_id
    FROM public.expense_submissions
    WHERE id = (SELECT submission_id FROM maintenance_cost_state)
  $$,
  $$VALUES ('submitted'::text, NULL::uuid)$$,
  'failed approval leaves the maintenance submission unchanged'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.documents
SET archived_at = now()
WHERE id = (SELECT document_id FROM maintenance_cost_state);
SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      submission_id,
      'approve',
      'Receipt reviewed',
      'maintenance-review-missing-evidence',
      funding_source_id
    )
    FROM maintenance_cost_state
  $$,
  '23503',
  'Supporting evidence is no longer available for approval',
  'approval revalidates that the submitted receipt remains active and in scope'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.documents
SET archived_at = NULL
WHERE id = (SELECT document_id FROM maintenance_cost_state);
DELETE FROM storage.objects
WHERE bucket_id = 'nestory-documents'
  AND name = (
    SELECT organization_id::text || '/maintenance-cost/pump-receipt.pdf'
    FROM maintenance_cost_state
  );
SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      submission_id,
      'approve',
      'Receipt reviewed',
      'maintenance-review-missing-object',
      funding_source_id
    )
    FROM maintenance_cost_state
  $$,
  '23503',
  'Supporting evidence is no longer available for approval',
  'approval fails when the immutable document no longer has stored bytes'
);

RESET ROLE;
INSERT INTO storage.objects (bucket_id, name)
SELECT
  'nestory-documents',
  organization_id::text || '/maintenance-cost/pump-receipt.pdf'
FROM maintenance_cost_state;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      submission_id,
      'approve',
      'Receipt and cost reviewed',
      'maintenance-review-approve-0001',
      funding_source_id
    )
    FROM maintenance_cost_state
  $$,
  'Finance Manager approves maintenance cost through the shared review RPC'
);

SELECT results_eq(
  $$
    SELECT
      submission.status,
      submission.reconciliation_source_id,
      expense.task_id,
      submission.approved_ledger_entry_id IS NOT NULL,
      submission.approved_journal_entry_id IS NOT NULL
    FROM public.expense_submissions AS submission
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = submission.organization_id
     AND expense.id = submission.approved_finance_expense_item_id
    WHERE submission.id = (SELECT submission_id FROM maintenance_cost_state)
  $$,
  $$
    SELECT
      'approved'::text,
      funding_source_id,
      task_id,
      true,
      true
    FROM maintenance_cost_state
  $$,
  'approval creates one exact task-linked official expense'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT pg_temp.update_maintenance_cost(
    'c6000000-0000-0000-0000-000000000001',
    125.50,
    false,
    (SELECT alternate_unit_id FROM maintenance_cost_state)
  )$$,
  '22023',
  'Approved maintenance cost scope requires reversal before changing property, unit, currency, or vendor',
  'approved maintenance unit cannot change before reversal'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);

SELECT throws_ok(
  $$
    UPDATE public.tasks
    SET property_id = (
          SELECT alternate_property_id FROM maintenance_cost_state
        ),
        unit_id = NULL
    WHERE id = (SELECT task_id FROM maintenance_cost_state)
  $$,
  '22023',
  'Approved maintenance cost scope requires reversal before changing property, unit, currency, or vendor',
  'approved maintenance property cannot change before reversal'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

RESET ROLE;

-- Seed a pre-migration historical row without weakening the runtime trigger.
SET LOCAL session_replication_role = replica;
INSERT INTO public.tasks (
  id,
  organization_id,
  tenant_request_id,
  property_id,
  unit_id,
  branch_id,
  assignee_person_id,
  title,
  category,
  priority,
  status,
  vendor_person_id,
  actual_cost_amount,
  actual_cost_currency,
  ledger_entry_id,
  created_by,
  updated_by
)
SELECT
  'c6000000-0000-0000-0000-000000000004',
  organization_id,
  request_id,
  property_id,
  unit_id,
  branch_id,
  operations_member_person_id,
  'Legacy posted repair',
  'Repairs',
  'normal',
  'completed',
  vendor_id,
  125.50,
  'USD'::public.currency_code,
  (
    SELECT approved_ledger_entry_id
    FROM public.expense_submissions
    WHERE id = state.submission_id
  ),
  super_admin_id,
  super_admin_id
FROM maintenance_cost_state AS state;
SET LOCAL session_replication_role = origin;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      'c6000000-0000-0000-0000-000000000004',
      '2026-08-09',
      NULL,
      'Legacy paid repair',
      'maintenance-legacy-posted-0001'
    )
    FROM maintenance_cost_state
  $$,
  '22023',
  'Historical Ledger-linked maintenance cost requires Super Admin reconciliation before Finance submission',
  'a historical Ledger-linked task cannot create a second Finance effect'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.expense_submissions
    WHERE source_id = 'c6000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'the blocked legacy task creates no expense submission'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT pg_temp.update_maintenance_cost(
    'c6000000-0000-0000-0000-000000000001',
    150,
    false
  )$$,
  'Operations can record a later increased maintenance total after approval'
);

SELECT lives_ok(
  $$
    UPDATE maintenance_cost_state
    SET adjustment_submission_id = (
      public.submit_maintenance_cost(
        organization_id,
        task_id,
        '2026-08-09',
        document_id,
        'Pump follow-up receipt',
        'maintenance-cost-adjust-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Operations submits the later cost difference as a new adjustment'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      adjustment.adjusts_submission_id,
      adjustment.internal_cost_amount,
      original.status,
      adjustment.status
    FROM public.expense_submissions AS adjustment
    JOIN public.expense_submissions AS original
      ON original.organization_id = adjustment.organization_id
     AND original.id = adjustment.adjusts_submission_id
    WHERE adjustment.id = (
      SELECT adjustment_submission_id FROM maintenance_cost_state
    )
  $$,
  $$
    SELECT
      submission_id,
      24.50::numeric,
      'approved'::text,
      'submitted'::text
    FROM maintenance_cost_state
  $$,
  'the adjustment snapshots only the delta and preserves the approved original'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    $sql$
      SELECT public.reverse_expense(
        %L, %L, '2026-08-10', 'Reverse original too early',
        'maintenance-parent-reverse-blocked'
      )
    $sql$,
    organization_id,
    submission_id
  ),
  '22023',
  'Reverse the latest maintenance cost adjustment first',
  'a pending adjustment prevents reversal of its approved baseline'
)
FROM maintenance_cost_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      adjustment_submission_id,
      'approve',
      'Follow-up receipt reviewed',
      'maintenance-adjust-approve-0001',
      funding_source_id
    )
    FROM maintenance_cost_state
  $$,
  'Finance approves the append-only maintenance cost adjustment'
);

RESET ROLE;

SELECT is(
  (
    SELECT sum(internal_cost_amount)
    FROM public.expense_submissions
    WHERE organization_id = (
      SELECT organization_id FROM maintenance_cost_state
    )
      AND source_type = 'maintenance_task'
      AND source_id = (SELECT task_id FROM maintenance_cost_state)
      AND status = 'approved'
  ),
  150.00::numeric,
  'approved maintenance effects equal the latest recorded operational total'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.reverse_expense(
      organization_id,
      adjustment_submission_id,
      '2026-08-10',
      'Follow-up charge was refunded',
      'maintenance-adjust-reverse-0001'
    )
    FROM maintenance_cost_state
  $$,
  'Super Admin reverses only the latest maintenance adjustment'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT original.status, adjustment.status, sum(active.internal_cost_amount)
    FROM public.expense_submissions AS original
    JOIN public.expense_submissions AS adjustment
      ON adjustment.organization_id = original.organization_id
     AND adjustment.adjusts_submission_id = original.id
    JOIN public.expense_submissions AS active
      ON active.organization_id = original.organization_id
     AND active.source_id = original.source_id
     AND active.status = 'approved'
    WHERE original.id = (SELECT submission_id FROM maintenance_cost_state)
      AND adjustment.id = (
        SELECT adjustment_submission_id FROM maintenance_cost_state
      )
    GROUP BY original.status, adjustment.status
  $$,
  $$VALUES ('approved'::text, 'reversed'::text, 125.50::numeric)$$,
  'reversing the adjustment keeps the original approved effect intact'
);

SELECT is(
  (
    SELECT ledger_entry_id
    FROM public.tasks
    WHERE id = (SELECT task_id FROM maintenance_cost_state)
  ),
  NULL::uuid,
  'maintenance task no longer receives a direct Ledger link'
);

RESET ROLE;
UPDATE public.tasks
SET status = 'completed',
    completed_at = now()
WHERE id = (SELECT task_id FROM maintenance_cost_state);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT task.status, submission.status
    FROM public.tasks AS task
    JOIN public.expense_submissions AS submission
      ON submission.source_id = task.id
    WHERE task.id = (SELECT task_id FROM maintenance_cost_state)
      AND submission.status = 'approved'
  $$,
  $$VALUES ('completed'::text, 'approved'::text)$$,
  'operational completion remains independent from Finance approval status'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE maintenance_cost_state
    SET rejected_submission_id = (
      public.submit_maintenance_cost(
        organization_id,
        rejected_task_id,
        '2026-08-08',
        NULL,
        'Lock receipt 9',
        'maintenance-cost-reject-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Operations submits a second task cost for review'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT lives_ok(
  $$
    SELECT public.review_expense(
      organization_id,
      rejected_submission_id,
      'reject',
      'Cost does not match receipt',
      'maintenance-review-reject-0001',
      NULL
    )
    FROM maintenance_cost_state
  $$,
  'Finance returns an incorrect maintenance cost with a reason'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT lives_ok(
  $$SELECT pg_temp.update_maintenance_cost(
    'c6000000-0000-0000-0000-000000000002',
    75,
    false
  )$$,
  'Operations can correct cost after Finance rejection'
);

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      rejected_task_id,
      '2026-08-08',
      NULL,
      'Lock receipt 9',
      'maintenance-cost-reject-0001'
    )
    FROM maintenance_cost_state
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'a rejected submission key cannot replay after the task cost snapshot changes'
);

SELECT lives_ok(
  $$
    UPDATE maintenance_cost_state
    SET resubmission_id = (
      public.submit_maintenance_cost(
        organization_id,
        rejected_task_id,
        '2026-08-09',
        NULL,
        'Corrected lock receipt',
        'maintenance-cost-resubmit-0001'
      )->>'submission_id'
    )::uuid
  $$,
  'Operations can resubmit a corrected rejected cost'
);

SELECT is(
  (
    public.submit_maintenance_cost(
      organization_id,
      rejected_task_id,
      '2026-08-09',
      NULL,
      'Corrected lock receipt',
      'maintenance-cost-resubmit-0001'
    )->>'submission_id'
  )::uuid,
  resubmission_id,
  'an exact corrected submission retry replays its immutable snapshot'
)
FROM maintenance_cost_state;

RESET ROLE;

SELECT results_eq(
  $$
    SELECT status, internal_cost_amount, expense_date
    FROM public.expense_submissions
    WHERE source_id = (SELECT rejected_task_id FROM maintenance_cost_state)
    ORDER BY expense_date, status
  $$,
  $$
    VALUES
      ('rejected'::text, 80::numeric, '2026-08-08'::date),
      ('submitted'::text, 75::numeric, '2026-08-09'::date)
  $$,
  'rejection preserves history while corrected resubmission uses a new snapshot'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      other_branch_task_id,
      '2026-08-10',
      NULL,
      NULL,
      'maintenance-cost-no-evidence'
    )
    FROM maintenance_cost_state
  $$,
  '22023',
  'Add a supporting document or receipt reference',
  'maintenance cost cannot be handed to Finance without evidence'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.expense_submissions
    WHERE idempotency_key = 'maintenance-cost-no-evidence'
  ),
  0::bigint,
  'an evidence-free maintenance handoff creates no review record'
);

SELECT * FROM finish();

ROLLBACK;
