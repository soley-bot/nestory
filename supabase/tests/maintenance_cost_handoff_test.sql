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
  finance_role_id uuid NOT NULL DEFAULT 'c8100000-0000-0000-0000-000000000001',
  operations_manager_role_id uuid NOT NULL DEFAULT 'c8100000-0000-0000-0000-000000000002',
  operations_member_role_id uuid NOT NULL DEFAULT 'c8100000-0000-0000-0000-000000000003',
  property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000001',
  alternate_property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000003',
  cross_property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000002',
  unit_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000001',
  alternate_unit_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000002',
  same_branch_unit_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000003',
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
  document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000001',
  adjustment_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000006',
  rejected_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000007',
  resubmission_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000008',
  other_branch_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000002',
  forged_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000004',
  blocked_forged_document_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000005',
  funding_source_id uuid NOT NULL DEFAULT 'c9000000-0000-0000-0000-000000000001',
  submission_id uuid,
  forged_submission_id uuid,
  adjustment_submission_id uuid,
  rejected_submission_id uuid,
  resubmission_id uuid,
  close_revision_id uuid,
  publication_id uuid
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

INSERT INTO public.organization_roles (
  id, organization_id, name, created_by, updated_by
)
SELECT finance_role_id, organization_id, 'Finance Manager', super_admin_id, super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT operations_manager_role_id, organization_id, 'Operations Manager', super_admin_id, super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT operations_member_role_id, organization_id, 'Operations Member', super_admin_id, super_admin_id
FROM maintenance_cost_state;

INSERT INTO public.organization_role_permissions (
  organization_id, role_id, permission_key, granted_by
)
SELECT state.organization_id, state.finance_role_id, permission_key, state.super_admin_id
FROM maintenance_cost_state AS state
CROSS JOIN unnest(ARRAY[
  'finance.view','finance.approve_expenses','finance.correct_records',
  'finance.close_periods','finance.publish'
]::public.organization_permission_key[]) AS permission_key
UNION ALL
SELECT state.organization_id, state.operations_manager_role_id, permission_key, state.super_admin_id
FROM maintenance_cost_state AS state
CROSS JOIN unnest(ARRAY[
  'maintenance.view','maintenance.create_assign',
  'maintenance.complete','maintenance.review'
]::public.organization_permission_key[]) AS permission_key
UNION ALL
SELECT state.organization_id, state.operations_member_role_id, permission_key, state.super_admin_id
FROM maintenance_cost_state AS state
CROSS JOIN unnest(ARRAY[
  'maintenance.view','maintenance.complete'
]::public.organization_permission_key[]) AS permission_key;

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

INSERT INTO public.person_branch_relationships (
  organization_id, person_id, branch_id, created_by
)
SELECT organization_id, operations_manager_person_id, branch_id, super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, operations_member_person_id, branch_id, super_admin_id
FROM maintenance_cost_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  person_id,
  branch_id,
  custom_role_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid, NULL::uuid
FROM maintenance_cost_state
UNION ALL
SELECT organization_id, finance_manager_id, 'custom', NULL::uuid, branch_id, finance_role_id
FROM maintenance_cost_state
UNION ALL
SELECT
  organization_id,
  operations_manager_id,
  'custom',
  operations_manager_person_id,
  branch_id,
  operations_manager_role_id
FROM maintenance_cost_state
UNION ALL
SELECT
  organization_id,
  operations_member_id,
  'custom',
  operations_member_person_id,
  branch_id,
  operations_member_role_id
FROM maintenance_cost_state;

SET LOCAL session_replication_role = replica;
INSERT INTO public.properties (
  id,
  organization_id,
  branch_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  branch_id,
  'Maintenance cost property',
  'MC-001',
  'apartment',
  'active'
FROM maintenance_cost_state
UNION ALL
SELECT
  alternate_property_id,
  organization_id,
  other_branch_id,
  'Alternate maintenance property',
  'MC-003',
  'apartment',
  'active'
FROM maintenance_cost_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  NULL::uuid,
  'Cross maintenance property',
  'MC-002',
  'apartment',
  'active'
FROM maintenance_cost_state;
SET LOCAL session_replication_role = origin;

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
SELECT alternate_unit_id, organization_id, alternate_property_id, 'MC-A2', 'vacant'
FROM maintenance_cost_state
UNION ALL
SELECT same_branch_unit_id, organization_id, property_id, 'MC-A3', 'vacant'
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
  alternate_property_id,
  alternate_unit_id,
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
  alternate_property_id,
  alternate_unit_id,
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

SET LOCAL session_replication_role = replica;
INSERT INTO public.documents (
  id,
  organization_id,
  branch_id,
  property_id,
  unit_id,
  task_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  content_sha256,
  uploaded_by
)
SELECT
  document_id,
  organization_id,
  branch_id,
  property_id,
  unit_id,
  task_id,
  'Paid cost evidence',
  'pump-receipt.pdf',
  organization_id::text || '/paid-cost-evidence/pump-receipt.pdf',
  'application/pdf',
  128,
  repeat('a', 64),
  operations_manager_id
FROM maintenance_cost_state
UNION ALL
SELECT
  other_branch_document_id,
  organization_id,
  other_branch_id,
  alternate_property_id,
  alternate_unit_id,
  other_branch_task_id,
  'Maintenance',
  'other-branch-receipt.pdf',
  organization_id::text || '/maintenance-cost/other-branch-receipt.pdf',
  'application/pdf',
  256,
  repeat('b', 64),
  super_admin_id
FROM maintenance_cost_state
UNION ALL
SELECT
  adjustment_document_id,
  organization_id,
  branch_id,
  property_id,
  unit_id,
  task_id,
  'Paid cost evidence',
  'pump-follow-up-receipt.pdf',
  organization_id::text || '/paid-cost-evidence/pump-follow-up-receipt.pdf',
  'application/pdf',
  129,
  repeat('c', 64),
  operations_manager_id
FROM maintenance_cost_state
UNION ALL
SELECT
  rejected_document_id,
  organization_id,
  branch_id,
  property_id,
  unit_id,
  rejected_task_id,
  'Paid cost evidence',
  'lock-receipt.pdf',
  organization_id::text || '/paid-cost-evidence/lock-receipt.pdf',
  'application/pdf',
  130,
  repeat('d', 64),
  operations_manager_id
FROM maintenance_cost_state
UNION ALL
SELECT
  resubmission_document_id,
  organization_id,
  branch_id,
  property_id,
  unit_id,
  rejected_task_id,
  'Paid cost evidence',
  'corrected-lock-receipt.pdf',
  organization_id::text || '/paid-cost-evidence/corrected-lock-receipt.pdf',
  'application/pdf',
  131,
  repeat('e', 64),
  operations_manager_id
FROM maintenance_cost_state;

WITH roster AS (
  SELECT validated.*
  FROM maintenance_cost_state AS state
  CROSS JOIN LATERAL app_private.validate_owner_roster_on_date(
    state.organization_id,
    state.property_id,
    '2026-08-01'
  ) AS validated
), opening_values AS (
  SELECT *
  FROM (
    VALUES
      ('ca000000-0000-0000-0000-000000000001'::uuid,
        'ips_held_owner_cash'::public.owner_balance_component),
      ('ca000000-0000-0000-0000-000000000002'::uuid,
        'owner_due_to_ips'::public.owner_balance_component),
      ('ca000000-0000-0000-0000-000000000003'::uuid,
        'ips_due_to_owner'::public.owner_balance_component),
      ('ca000000-0000-0000-0000-000000000004'::uuid,
        'security_deposit_custody'::public.owner_balance_component)
  ) AS values_by_component(request_id, component)
)
INSERT INTO public.owner_opening_balance_requests (
  id, organization_id, property_id, owner_person_id, property_owner_id,
  ownership_percent_snapshot, ownership_roster_hash, currency,
  effective_date, component, request_kind, proposed_amount, status,
  reason, source_reference, evidence_sha256, payload_hash, submitted_by,
  reviewed_at, reviewed_by, review_reason
)
SELECT
  opening_values.request_id, state.organization_id, state.property_id,
  roster.owner_person_id, roster.property_owner_id, roster.ownership_percent,
  roster.ownership_roster_hash, 'USD', '2026-08-01',
  opening_values.component, 'initial', 0.00, 'submitted',
  'Known zero opening for maintenance handoff acceptance',
  'Maintenance handoff owner-close prerequisite', repeat('1', 64),
  repeat('2', 64), state.operations_manager_id, NULL::timestamptz,
  NULL::uuid, NULL::text
FROM maintenance_cost_state AS state
CROSS JOIN roster
CROSS JOIN opening_values;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

UPDATE public.owner_opening_balance_requests
SET status = 'approved',
    reviewed_at = now(),
    reviewed_by = (SELECT finance_manager_id FROM maintenance_cost_state),
    review_reason = 'Independent zero-opening fixture review'
WHERE id IN (
  'ca000000-0000-0000-0000-000000000001',
  'ca000000-0000-0000-0000-000000000002',
  'ca000000-0000-0000-0000-000000000003',
  'ca000000-0000-0000-0000-000000000004'
);

INSERT INTO public.owner_opening_balance_entries (
  request_id, organization_id, property_id, owner_person_id,
  property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
  currency, effective_date, component, entry_kind, signed_amount, created_by
)
SELECT
  request.id, request.organization_id, request.property_id,
  request.owner_person_id, request.property_owner_id,
  request.ownership_percent_snapshot, request.ownership_roster_hash,
  request.currency, request.effective_date, request.component, 'opening',
  request.proposed_amount, request.reviewed_by
FROM public.owner_opening_balance_requests AS request
WHERE request.id IN (
  'ca000000-0000-0000-0000-000000000001',
  'ca000000-0000-0000-0000-000000000002',
  'ca000000-0000-0000-0000-000000000003',
  'ca000000-0000-0000-0000-000000000004'
);
SET LOCAL session_replication_role = origin;

INSERT INTO app_private.paid_cost_evidence_registrations (
  document_id,
  organization_id,
  property_id,
  actor_id,
  storage_path,
  content_sha256,
  size_bytes,
  mime_type,
  storage_object_id,
  storage_object_version,
  registrar_version
)
SELECT
  document_id,
  organization_id,
  property_id,
  operations_manager_id,
  organization_id::text || '/paid-cost-evidence/pump-receipt.pdf',
  repeat('a', 64),
  128,
  'application/pdf',
  'c7000000-0000-0000-0000-000000000101'::uuid,
  'fixture-v1',
  'paid-cost-evidence-registrar-v1'
FROM maintenance_cost_state
UNION ALL
SELECT adjustment_document_id, organization_id, property_id,
  operations_manager_id,
  organization_id::text || '/paid-cost-evidence/pump-follow-up-receipt.pdf',
  repeat('c', 64), 129, 'application/pdf',
  'c7000000-0000-0000-0000-000000000106'::uuid, 'fixture-v1',
  'paid-cost-evidence-registrar-v1'
FROM maintenance_cost_state
UNION ALL
SELECT rejected_document_id, organization_id, property_id,
  operations_manager_id,
  organization_id::text || '/paid-cost-evidence/lock-receipt.pdf',
  repeat('d', 64), 130, 'application/pdf',
  'c7000000-0000-0000-0000-000000000107'::uuid, 'fixture-v1',
  'paid-cost-evidence-registrar-v1'
FROM maintenance_cost_state
UNION ALL
SELECT resubmission_document_id, organization_id, property_id,
  operations_manager_id,
  organization_id::text || '/paid-cost-evidence/corrected-lock-receipt.pdf',
  repeat('e', 64), 131, 'application/pdf',
  'c7000000-0000-0000-0000-000000000108'::uuid, 'fixture-v1',
  'paid-cost-evidence-registrar-v1'
FROM maintenance_cost_state;

-- Represent a forged document row so both read projections can prove
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

INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
SELECT
  'c7000000-0000-0000-0000-000000000101'::uuid,
  'nestory-documents',
  organization_id::text || '/paid-cost-evidence/pump-receipt.pdf',
  'fixture-v1',
  '{"mimetype":"application/pdf","size":"128"}'::jsonb
FROM maintenance_cost_state
UNION ALL
SELECT
  'c7000000-0000-0000-0000-000000000102'::uuid,
  'nestory-documents',
  organization_id::text || '/maintenance-cost/other-branch-receipt.pdf',
  'fixture-v1',
  '{"mimetype":"application/pdf","size":"256"}'::jsonb
FROM maintenance_cost_state
UNION ALL
SELECT
  'c7000000-0000-0000-0000-000000000103'::uuid,
  'nestory-documents',
  cross_organization_id::text || '/maintenance-cost/forged-receipt.pdf',
  'fixture-v1',
  '{"mimetype":"application/pdf","size":"512"}'::jsonb
FROM maintenance_cost_state
UNION ALL
SELECT 'c7000000-0000-0000-0000-000000000106'::uuid,
  'nestory-documents',
  organization_id::text || '/paid-cost-evidence/pump-follow-up-receipt.pdf',
  'fixture-v1', '{"mimetype":"application/pdf","size":"129"}'::jsonb
FROM maintenance_cost_state
UNION ALL
SELECT 'c7000000-0000-0000-0000-000000000107'::uuid,
  'nestory-documents',
  organization_id::text || '/paid-cost-evidence/lock-receipt.pdf',
  'fixture-v1', '{"mimetype":"application/pdf","size":"130"}'::jsonb
FROM maintenance_cost_state
UNION ALL
SELECT 'c7000000-0000-0000-0000-000000000108'::uuid,
  'nestory-documents',
  organization_id::text || '/paid-cost-evidence/corrected-lock-receipt.pdf',
  'fixture-v1', '{"mimetype":"application/pdf","size":"131"}'::jsonb
FROM maintenance_cost_state;

CREATE OR REPLACE FUNCTION pg_temp.update_maintenance_cost(
  p_task_id uuid,
  p_actual_cost numeric,
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
    target.branch_id,
    target.assignee_person_id
  );
END;
$$;

UPDATE public.organization_authorization_states AS authorization_state
SET ordinary_access_enabled=true,
    transition_manifest_required=false,
    updated_by=state.super_admin_id
FROM maintenance_cost_state AS state
WHERE authorization_state.organization_id=state.organization_id;

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
  '42501',
  'permission denied for table documents',
  'direct authenticated document metadata creation is denied before a forged path can be stored'
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
  '23514',
  'paid_cost_evidence_invalid',
  'forged document metadata cannot enter the expense approval workflow'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT hasnt_column(
  'public',
  'tasks',
  'ledger_entry_id',
  'Operations cannot attach any direct Ledger entry to a maintenance task'
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
    WHERE file_name = 'pump-receipt.pdf'
  $$,
  $$
    SELECT
      task_id,
      document_id,
      'pump-receipt.pdf'::text,
      organization_id::text || '/paid-cost-evidence/pump-receipt.pdf',
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
      AND name LIKE '%/paid-cost-evidence/pump-receipt.pdf'
    ORDER BY name
  $$,
  $$
    SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
  'Financial evidence document is immutable while referenced',
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
    SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
    FROM maintenance_cost_state
  );

SELECT results_eq(
  $$
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name = (
        SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
        SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
        SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
    130
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
  '42501',
  'permission denied for table tasks',
  'direct task scope changes remain denied while Finance is reviewing the cost'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

SELECT ok(
  to_regprocedure(
    'public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,boolean,uuid,uuid)'
  ) IS NULL,
  'the maintenance update API has no direct Ledger switch'
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
  'Not authorized',
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
    WHERE file_name = 'pump-receipt.pdf'
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
  '23514',
  'Maintenance paid cost evidence document is required',
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
      AND name LIKE '%/paid-cost-evidence/%receipt.pdf'
    ORDER BY name
  $$,
  $$
    SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
    SELECT organization_id::text || '/paid-cost-evidence/pump-receipt.pdf'
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
INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
SELECT
  'c7000000-0000-0000-0000-000000000101'::uuid,
  'nestory-documents',
  organization_id::text || '/paid-cost-evidence/pump-receipt.pdf',
  'fixture-v1',
  '{"mimetype":"application/pdf","size":"128"}'::jsonb
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
      submission.approved_ledger_entry_id IS NOT NULL
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
      true
    FROM maintenance_cost_state
  $$,
  'approval creates one exact task-linked official expense'
);

RESET ROLE;

SAVEPOINT maintenance_owner_statement_acceptance;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id = (
      SELECT organization_id FROM maintenance_cost_state
    )
      AND revision.property_id = (SELECT property_id FROM maintenance_cost_state)
  ),
  0::bigint,
  'maintenance approval does not rely on a prebuilt owner close revision'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM maintenance_cost_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.allocate_owner_event(
      organization_id,
      'owner_paid_cost',
      (
        SELECT responsibility.id
        FROM public.expense_submissions AS submission
        JOIN public.ips_expense_responsibilities AS responsibility
          ON responsibility.organization_id = submission.organization_id
         AND responsibility.id = submission.approved_responsibility_id
        WHERE submission.id = maintenance_cost_state.submission_id
      ),
      'maintenance-owner-allocation-0001'
    )
    FROM maintenance_cost_state
  $$,
  'the approved task-bound expense allocates through owner authority'
);

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      organization_id, property_id, owner_id, 'USD', '2026-08-01',
      'maintenance-owner-period-0001'
    )
    FROM maintenance_cost_state
  $$,
  'the maintenance expense reaches the authoritative owner period'
);

SELECT lives_ok(
  $$
    SELECT public.set_financial_month_lock(
      organization_id, '2026-08-01', true,
      'Lock the maintenance handoff acceptance month'
    )
    FROM maintenance_cost_state
  $$,
  'the reconciled maintenance month locks before owner close'
);

WITH closed AS (
  SELECT public.close_owner_month(
    organization_id, property_id, owner_id, 'USD', '2026-08-01',
    'Maintenance cost handoff acceptance',
    'maintenance-owner-close-0001'
  ) AS result
  FROM maintenance_cost_state
)
UPDATE maintenance_cost_state
SET close_revision_id = (closed.result ->> 'revision_id')::uuid
FROM closed;

WITH published AS (
  SELECT public.publish_owner_statement(
    organization_id, close_revision_id, 'maintenance-owner-statement-0001'
  ) AS result
  FROM maintenance_cost_state
)
UPDATE maintenance_cost_state
SET publication_id = (published.result ->> 'publication_id')::uuid
FROM published;

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.owner_close_line_sources AS source
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.organization_id = source.organization_id
     AND responsibility.id = source.source_line_id
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
     AND expense.id = responsibility.finance_expense_item_id
    JOIN public.expense_submissions AS submission
      ON submission.organization_id = expense.organization_id
     AND submission.approved_finance_expense_item_id = expense.id
    JOIN public.owner_statement_publications AS publication
      ON publication.organization_id = source.organization_id
     AND publication.owner_close_revision_id = source.owner_close_revision_id
    WHERE source.source_type = 'owner_paid_cost'
      AND source.owner_close_revision_id = (
        SELECT close_revision_id FROM maintenance_cost_state
      )
      AND publication.id = (SELECT publication_id FROM maintenance_cost_state)
      AND submission.id = (SELECT submission_id FROM maintenance_cost_state)
      AND expense.task_id = (SELECT task_id FROM maintenance_cost_state)
  ),
  1::bigint,
  'the approved task-bound maintenance expense reaches one published owner statement source'
);

ROLLBACK TO SAVEPOINT maintenance_owner_statement_acceptance;

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
    (SELECT same_branch_unit_id FROM maintenance_cost_state)
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
  '42501',
  'permission denied for table tasks',
  'direct approved task scope changes remain denied before reversal'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM maintenance_cost_state),
  true
);

RESET ROLE;

SELECT hasnt_column(
  'public',
  'tasks',
  'ledger_entry_id',
  'maintenance work and financial projection identities are separate'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE source_type = 'maintenance_task'
  ),
  'maintenance tasks cannot become direct Ledger sources'
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
    150
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
        adjustment_document_id,
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
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE source_type = 'maintenance_task'
      AND source_id = (SELECT task_id FROM maintenance_cost_state)
  ),
  0::bigint,
  'maintenance task never receives a direct Ledger event'
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
        rejected_document_id,
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
    75
  )$$,
  'Operations can correct cost after Finance rejection'
);

SELECT throws_ok(
  $$
    SELECT public.submit_maintenance_cost(
      organization_id,
      rejected_task_id,
      '2026-08-08',
      rejected_document_id,
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
        resubmission_document_id,
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
      resubmission_document_id,
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
  '23514',
  'Maintenance paid cost evidence document is required',
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
