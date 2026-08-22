BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(110);

CREATE TEMP TABLE maintenance_role_workflow_state (
  created_task_id uuid
) ON COMMIT DROP;

GRANT ALL ON maintenance_role_workflow_state TO authenticated;

CREATE TEMP TABLE maintenance_vendor_state (
  created_task_id uuid
) ON COMMIT DROP;

GRANT ALL ON maintenance_vendor_state TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.call_create_maintenance_task(
  p_status text,
  p_branch_id uuid,
  p_assignee_person_id uuid,
  p_vendor_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT public.create_maintenance_task(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'Role workflow test case',
    'Created by the maintenance role workflow pgTAP test.',
    'Plumbing',
    'normal',
    p_status,
    '2026-07-20'::date,
    '10:00'::time,
    NULL,
    NULL,
    p_vendor_person_id,
    50,
    'USD'::public.currency_code,
    '[{"id":"inspect","label":"Inspect the issue","completed":false}]'::jsonb,
    'none',
    p_branch_id,
    p_assignee_person_id
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_create_maintenance_vendor_task(
  p_vendor_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO maintenance_vendor_state (created_task_id)
  SELECT pg_temp.call_create_maintenance_task(
    'pending',
    '00000000-0000-0000-0000-000000000211'::uuid,
    '80000000-0000-0000-0000-000000000008'::uuid,
    p_vendor_person_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.call_update_maintenance_task(
  p_task_id uuid,
  p_status text DEFAULT NULL,
  p_actual_cost_amount numeric DEFAULT NULL,
  p_actual_cost_currency public.currency_code DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.tasks
  WHERE id = p_task_id;

  RETURN public.update_maintenance_task(
    target.id,
    target.organization_id,
    target.property_id,
    target.unit_id,
    target.title,
    target.description,
    target.category,
    target.priority,
    coalesce(p_status, target.status),
    target.due_date,
    target.due_time,
    target.reminder_date,
    target.reminder_time,
    target.vendor_person_id,
    target.cost_estimate_amount,
    target.cost_estimate_currency,
    coalesce(p_actual_cost_amount, target.actual_cost_amount),
    coalesce(p_actual_cost_currency, target.actual_cost_currency),
    target.checklist,
    target.recurrence_frequency,
    coalesce(p_branch_id, target.branch_id),
    coalesce(p_assignee_person_id, target.assignee_person_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.call_update_maintenance_vendor(
  p_task_id uuid,
  p_vendor_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.tasks
  WHERE id = p_task_id;

  RETURN public.update_maintenance_task(
    target.id,
    target.organization_id,
    target.property_id,
    target.unit_id,
    target.title,
    target.description,
    target.category,
    target.priority,
    target.status,
    target.due_date,
    target.due_time,
    target.reminder_date,
    target.reminder_time,
    p_vendor_person_id,
    target.cost_estimate_amount,
    target.cost_estimate_currency,
    target.actual_cost_amount,
    target.actual_cost_currency,
    target.checklist,
    target.recurrence_frequency,
    target.branch_id,
    target.assignee_person_id
  );
END;
$$;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Maintenance Boundary Organization',
  'maintenance-boundary-organization'
);

INSERT INTO public.organization_branches (
  id,
  organization_id,
  name,
  code,
  status,
  created_by,
  updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000212',
  '00000000-0000-0000-0000-000000000001',
  'Secondary Operations Branch',
  'SECONDARY-OPS',
  'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;

INSERT INTO public.properties (
  id,
  organization_id,
  branch_id,
  name,
  code,
  property_type,
  address,
  status,
  acquisition_date,
  notes,
  created_by,
  updated_by
)
VALUES (
  '10000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000212',
  'Secondary Operations Property',
  'SECONDARY-OPS',
  'Residential apartment',
  'Secondary Operations Branch',
  'active',
  current_date,
  'Branch-consistent maintenance workflow fixture.',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status,
  created_by,
  updated_by
)
VALUES (
  '20000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000099',
  'SECONDARY-01',
  'vacant',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.organization_roles (
  id,
  organization_id,
  name,
  created_by,
  updated_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000391',
    '00000000-0000-0000-0000-000000000001',
    'Maintenance Manager Test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000392',
    '00000000-0000-0000-0000-000000000001',
    'Maintenance Member Test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000393',
    '00000000-0000-0000-0000-000000000001',
    'Non Maintenance Test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key,
  granted_by
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  profile.role_id,
  profile.permission_key,
  '00000000-0000-0000-0000-000000000101'
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000391'::uuid, 'maintenance.view'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000391'::uuid, 'maintenance.create_assign'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000391'::uuid, 'maintenance.complete'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000391'::uuid, 'maintenance.review'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000392'::uuid, 'maintenance.view'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000392'::uuid, 'maintenance.complete'::public.organization_permission_key),
    ('00000000-0000-0000-0000-000000000393'::uuid, 'properties.view'::public.organization_permission_key)
) AS profile(role_id, permission_key);

UPDATE public.organization_members
SET
  role = 'custom',
  branch_id = '00000000-0000-0000-0000-000000000211',
  custom_role_id = CASE
    WHEN user_id = '00000000-0000-0000-0000-000000000501'::uuid
      THEN '00000000-0000-0000-0000-000000000391'::uuid
    WHEN user_id = '00000000-0000-0000-0000-000000000601'::uuid
      THEN '00000000-0000-0000-0000-000000000392'::uuid
    ELSE '00000000-0000-0000-0000-000000000393'::uuid
  END
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND role <> 'super_admin';

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true,
    transition_manifest_required = false
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

INSERT INTO public.people (id, organization_id, display_name, archived_at)
VALUES
  ('80200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Workflow Vendor One', NULL),
  ('80200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Workflow Vendor Two', NULL),
  ('80300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Unlinked Operations Person', NULL),
  ('82f00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Inactive Vendor', NULL),
  ('82f00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Archived Role Vendor', NULL),
  ('82f00000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Archived Person Vendor', now()),
  ('82f00000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Other Organization Vendor', NULL);

INSERT INTO public.person_branch_relationships (
  organization_id,
  person_id,
  branch_id,
  created_by
)
VALUES
  ('00000000-0000-0000-0000-000000000001', '80200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101');

INSERT INTO public.person_roles (
  id,
  organization_id,
  person_id,
  role,
  status,
  archived_at
)
VALUES
  ('83e00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '80200000-0000-0000-0000-000000000001', 'vendor', 'active', NULL),
  ('83e00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '80200000-0000-0000-0000-000000000002', 'vendor', 'active', NULL),
  ('83e00000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '80300000-0000-0000-0000-000000000004', 'staff', 'active', NULL),
  ('83f00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000001', 'vendor', 'inactive', NULL),
  ('83f00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000002', 'vendor', 'active', now()),
  ('83f00000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '82f00000-0000-0000-0000-000000000003', 'vendor', 'active', NULL),
  ('83f00000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '82f00000-0000-0000-0000-000000000004', 'vendor', 'active', NULL);

INSERT INTO public.tenant_requests (
  id,
  organization_id,
  property_id,
  unit_id,
  title,
  category,
  status,
  requested_by_person_id,
  created_by,
  updated_by
)
SELECT
  ('90000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  CASE
    WHEN sequence IN (8, 10, 12)
      THEN '10000000-0000-0000-0000-000000000099'::uuid
    ELSE '10000000-0000-0000-0000-000000000001'::uuid
  END,
  CASE
    WHEN sequence IN (8, 10, 12)
      THEN '20000000-0000-0000-0000-000000000099'::uuid
    ELSE '20000000-0000-0000-0000-000000000001'::uuid
  END,
  'Maintenance workflow request ' || sequence,
  'Maintenance',
  'open',
  '80000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM generate_series(1, 12) AS sequence;

WITH workflow_tasks (
  sequence,
  status,
  branch_id,
  assignee_person_id,
  actual_cost_amount,
  completed_at
) AS (
  VALUES
    (1, 'in_progress'::text, '00000000-0000-0000-0000-000000000211'::uuid, '80000000-0000-0000-0000-000000000008'::uuid, NULL::numeric, NULL::timestamptz),
    (3, 'scheduled', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008', NULL, NULL),
    (4, 'pending', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008', NULL, NULL),
    (5, 'pending', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008', NULL, NULL),
    (6, 'scheduled', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000004', NULL, NULL),
    (8, 'in_progress', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008', NULL, NULL),
    (9, 'pending', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000004', NULL, NULL),
    (10, 'completed', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008', 64, now()),
    (12, 'blocked', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008', NULL, NULL)
)
INSERT INTO public.tasks (
  id,
  organization_id,
  tenant_request_id,
  property_id,
  unit_id,
  title,
  description,
  category,
  priority,
  status,
  due_date,
  vendor_person_id,
  cost_estimate_amount,
  cost_estimate_currency,
  actual_cost_amount,
  actual_cost_currency,
  checklist,
  branch_id,
  assignee_person_id,
  completed_at,
  created_by,
  updated_by
)
SELECT
  ('91000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('90000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
  CASE
    WHEN branch_id = '00000000-0000-0000-0000-000000000212'::uuid
      THEN '10000000-0000-0000-0000-000000000099'::uuid
    ELSE '10000000-0000-0000-0000-000000000001'::uuid
  END,
  CASE
    WHEN branch_id = '00000000-0000-0000-0000-000000000212'::uuid
      THEN '20000000-0000-0000-0000-000000000099'::uuid
    ELSE '20000000-0000-0000-0000-000000000001'::uuid
  END,
  'Maintenance workflow task ' || sequence,
  'Fixed-role maintenance behavior fixture.',
  'Maintenance',
  'normal',
  status,
  current_date + sequence,
  '80200000-0000-0000-0000-000000000001',
  100,
  'USD',
  actual_cost_amount,
  CASE WHEN actual_cost_amount IS NULL THEN NULL ELSE 'USD'::public.currency_code END,
  '[{"id":"pickup","label":"Collect required materials","completed":false}]'::jsonb,
  branch_id,
  assignee_person_id,
  completed_at,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM workflow_tasks;

SELECT ok(
  to_regprocedure('public.get_maintenance_vendor_options(uuid)') IS NOT NULL
  AND has_function_privilege(
    'authenticated',
    'public.get_maintenance_vendor_options(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_maintenance_vendor_options(uuid)',
    'EXECUTE'
  ),
  'maintenance vendor options are exposed only through the authenticated checked RPC'
);

SELECT has_column(
  'public',
  'tasks',
  'blocked_reason',
  'tasks expose the maintenance blocker reason'
);

SELECT lives_ok(
  $$UPDATE public.tasks SET status = 'ready_for_review', completed_at = NULL WHERE id = '91000000-0000-0000-0000-000000000012'$$,
  'ready_for_review is a valid maintenance status'
);

SELECT throws_ok(
  $$UPDATE public.tasks SET completed_at = now() WHERE id = '91000000-0000-0000-0000-000000000012'$$,
  '23514',
  NULL,
  'future writes cannot give a non-completed task a completion timestamp'
);

SELECT ok(
  (
    SELECT status = 'completed' AND completed_at IS NOT NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000010'
  ),
  'historical completed tasks and timestamps remain valid'
);

SELECT ok(
  (
    SELECT prosecdef
      AND proconfig @> ARRAY['search_path=""']
    FROM pg_proc
    WHERE oid = 'public.execute_assigned_maintenance_task(uuid,uuid,text,text,boolean,text)'::regprocedure
  ),
  'member execution RPC is security definer with an empty search path'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.execute_assigned_maintenance_task(uuid,uuid,text,text,boolean,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.execute_assigned_maintenance_task(uuid,uuid,text,text,boolean,text)',
    'EXECUTE'
  ),
  'only authenticated clients can execute the member workflow RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.review_maintenance_task_completion(uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.review_maintenance_task_completion(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'only authenticated clients can execute the completion review RPC'
);

SELECT ok(
  (
    SELECT prosecdef
      AND proconfig @> ARRAY['search_path=""']
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'public.execute_coordinated_maintenance_task(uuid,uuid,text,text)'
    )
  ),
  'coordinated execution RPC is security definer with an empty search path'
);

SELECT ok(
  CASE
    WHEN to_regprocedure('public.execute_coordinated_maintenance_task(uuid,uuid,text,text)') IS NULL
      THEN false
    ELSE has_function_privilege(
      'authenticated',
      'public.execute_coordinated_maintenance_task(uuid,uuid,text,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.execute_coordinated_maintenance_task(uuid,uuid,text,text)',
      'EXECUTE'
    )
  END,
  'only authenticated clients can execute the coordinated workflow RPC'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '80200000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'active organization vendor is included in maintenance options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '80000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'tenant-only people are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '80100000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'owner-only people are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '80000000-0000-0000-0000-000000000007'
  ),
  0::bigint,
  'staff-only people are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '82f00000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'inactive vendor roles are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '82f00000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'archived vendor roles are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '82f00000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'archived people are excluded from maintenance vendor options'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_vendor_options('00000000-0000-0000-0000-000000000001')
    WHERE id = '82f00000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'people from another organization are excluded from maintenance vendor options'
);

SELECT lives_ok(
  $$SELECT pg_temp.capture_create_maintenance_vendor_task('80200000-0000-0000-0000-000000000001')$$,
  'manager can create a maintenance task with an eligible vendor'
);

SELECT is(
  (
    SELECT vendor_person_id
    FROM public.tasks
    WHERE id = (SELECT created_task_id FROM maintenance_vendor_state LIMIT 1)
  ),
  '80200000-0000-0000-0000-000000000001'::uuid,
  'valid vendor is stored during maintenance creation'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('pending', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008', '80100000-0000-0000-0000-000000000001')$$,
  '23503',
  'Vendor not found',
  'maintenance creation rejects a newly selected non-vendor person'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_vendor('91000000-0000-0000-0000-000000000003', '80200000-0000-0000-0000-000000000001')$$,
  'manager can update a maintenance task to an eligible vendor'
);

SELECT is(
  (SELECT vendor_person_id FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000003'),
  '80200000-0000-0000-0000-000000000001'::uuid,
  'valid changed vendor is stored during maintenance update'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_vendor('91000000-0000-0000-0000-000000000003', '80200000-0000-0000-0000-000000000002')$$,
  'manager can assign the vendor before it becomes historical'
);

RESET ROLE;

UPDATE public.person_roles
SET status = 'inactive'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND person_id = '80200000-0000-0000-0000-000000000002'
  AND role = 'vendor';

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003')$$,
  'unrelated edits preserve an unchanged historical vendor link'
);

SELECT is(
  (SELECT vendor_person_id FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000003'),
  '80200000-0000-0000-0000-000000000002'::uuid,
  'historical vendor link remains stored after an unrelated edit'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_vendor('91000000-0000-0000-0000-000000000003', '80100000-0000-0000-0000-000000000001')$$,
  '23503',
  'Vendor not found',
  'maintenance update rejects a newly selected non-vendor person'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_vendor('91000000-0000-0000-0000-000000000003', NULL)$$,
  'manager can explicitly clear a historical vendor link'
);

SELECT is(
  (SELECT vendor_person_id FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000003'),
  NULL::uuid,
  'historical vendor clearing is stored intentionally'
);

INSERT INTO maintenance_role_workflow_state (created_task_id)
SELECT pg_temp.call_create_maintenance_task(
  'pending',
  '00000000-0000-0000-0000-000000000211'::uuid,
  '80000000-0000-0000-0000-000000000008'::uuid
);

SELECT ok(
  (
    SELECT status = 'pending'
      AND branch_id = '00000000-0000-0000-0000-000000000211'::uuid
      AND assignee_person_id = '80000000-0000-0000-0000-000000000008'::uuid
    FROM public.tasks
    WHERE id = (SELECT created_task_id FROM maintenance_role_workflow_state)
  ),
  'manager creation atomically stores the initial branch and assignee'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('completed', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008')$$,
  '22023',
  'New maintenance tasks must be pending or scheduled',
  'new tasks cannot start completed'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('pending', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008')$$,
  '42501',
  NULL,
  'branch-scoped manager cannot create in another branch'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003', NULL, 84, 'USD')$$,
  'manager records operational actual cost without financial posting'
);

SELECT ok(
  (
    SELECT actual_cost_amount = 84
      AND actual_cost_currency = 'USD'::public.currency_code
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000003'
  ),
  'manager records the operational actual cost without creating a financial effect'
);

SELECT hasnt_column(
  'public',
  'tasks',
  'ledger_entry_id',
  'maintenance tasks expose no direct Ledger link'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000001', 'ready_for_review')$$,
  '22023',
  'Use the member execution RPC to submit work for review',
  'generic updates cannot submit active work for review'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000008')$$,
  '42501',
  NULL,
  'branch-scoped manager cannot update another branch task'
);

SELECT lives_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008')$$,
  'manager can atomically reassign a task inside their branch'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008')$$,
  '42501',
  NULL,
  'manager assignment cannot escape branch scope'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000211', '80100000-0000-0000-0000-000000000001')$$,
  '23503',
  'Assignee not found',
  'assignment rejects a person without an active staff role'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000004')$$,
  '23503',
  'Assignee must be an executable linked member for the selected branch',
  'new assignment to active but unlinked staff fails'
);

SELECT throws_matching(
  $$UPDATE public.tasks SET actual_cost_amount = 999, actual_cost_currency = 'USD' WHERE id = '91000000-0000-0000-0000-000000000003'$$,
  'permission denied',
  'direct manager task update is blocked at the table grant boundary'
);

SELECT throws_matching(
  $$INSERT INTO public.activity_logs (organization_id, actor_id, entity_type, entity_id, action) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'task', '91000000-0000-0000-0000-000000000003', 'unauthorized_manager_write')$$,
  'permission denied|row-level security',
  'manager cannot write task activity outside the checked RPCs'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000008'),
  0::bigint,
  'branch-scoped manager cannot select another branch task'
);

SELECT throws_matching(
  $$UPDATE public.tenant_requests SET status = 'closed' WHERE id = '90000000-0000-0000-0000-000000000003'$$,
  'permission denied',
  'direct manager request update is blocked at the table grant boundary'
);

RESET ROLE;

SELECT is(
  (SELECT actual_cost_amount FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000003'),
  84::numeric,
  'direct manager updates cannot bypass the checked RPC'
);

SELECT is(
  (SELECT status FROM public.tenant_requests WHERE id = '90000000-0000-0000-0000-000000000003'),
  'open',
  'direct manager request updates cannot bypass the checked RPC'
);

UPDATE public.organization_members
SET branch_id = '00000000-0000-0000-0000-000000000212'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_execution_members(
      '00000000-0000-0000-0000-000000000001'
    )
  ),
  1::bigint,
  'branch-scoped manager sees only their own eligible identity when the member moves branches'
);

RESET ROLE;

UPDATE public.organization_members
SET branch_id = '00000000-0000-0000-0000-000000000211'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

SELECT throws_ok(
  $$UPDATE public.organization_members
    SET branch_id = NULL
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '00000000-0000-0000-0000-000000000501'$$,
  '23514',
  NULL,
  'operations managers cannot drop their required branch scope'
);

SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_execution_members(
      '00000000-0000-0000-0000-000000000001'
    )
  ),
  2::bigint,
  'branch-scoped manager enumerates every permission-eligible identity in their branch'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000008', NULL, 77, 'USD')$$,
  '42501',
  NULL,
  'operations manager cannot update another branch task'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000212', '80000000-0000-0000-0000-000000000008')$$,
  '42501',
  NULL,
  'operations manager cannot assign another branch task'
);

RESET ROLE;

UPDATE public.organization_members
SET branch_id = '00000000-0000-0000-0000-000000000211'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000501';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000005', 'in_progress')$$,
  '22023',
  'Use the assigned-member or coordinated execution RPC for execution status changes',
  'manager cannot start member-owned work through the generic update RPC'
);

SELECT throws_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'start', NULL)$$,
  '22023',
  'Executable member assignments must use the member workflow',
  'manager cannot execute member-owned work through coordinated controls'
);

SELECT lives_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'start', NULL)$$,
  'manager starts unlinked work through coordinated controls'
);

SELECT is(
  (SELECT status FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000009'),
  'in_progress',
  'coordinated start moves pending work to in progress'
);

SELECT throws_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'block', 'x')$$,
  '22023',
  'Coordinated block note must be between 3 and 500 characters',
  'coordinated block requires a useful note'
);

SELECT lives_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'block', 'Waiting for the external vendor')$$,
  'manager blocks coordinated work with a reason'
);

SELECT ok(
  (
    SELECT status = 'blocked'
      AND blocked_reason = 'Waiting for the external vendor'
      AND completed_at IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000009'
  ),
  'coordinated block stores the current reason'
);

SELECT lives_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'resume', NULL)$$,
  'manager resumes coordinated work'
);

SELECT ok(
  (
    SELECT status = 'in_progress' AND blocked_reason IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000009'
  ),
  'coordinated resume clears the current blocker'
);

SELECT throws_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'complete', NULL)$$,
  '22023',
  'Coordinated completion note must be between 3 and 500 characters',
  'coordinated completion requires a note'
);

SELECT lives_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000009', 'complete', 'External vendor completed the repair')$$,
  'manager completes coordinated work with a note'
);

SELECT ok(
  (
    SELECT tasks.status = 'completed'
      AND tasks.completed_at IS NOT NULL
      AND tasks.blocked_reason IS NULL
      AND requests.status = 'closed'
    FROM public.tasks
    JOIN public.tenant_requests AS requests
      ON requests.id = tasks.tenant_request_id
    WHERE tasks.id = '91000000-0000-0000-0000-000000000009'
  ),
  'coordinated completion timestamps the task and closes its request'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE source_id = '91000000-0000-0000-0000-000000000009'
  ),
  0::bigint,
  'coordinated completion creates no source-owned Ledger event'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000009'
      AND action = 'maintenance_task_coordinated_work_started'
  )
  AND EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000009'
      AND action = 'maintenance_task_coordinated_work_blocked'
  )
  AND EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000009'
      AND action = 'maintenance_task_coordinated_work_resumed'
  )
  AND EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000009'
      AND action = 'maintenance_task_coordinated_work_completed'
  ),
  'coordinated transitions emit distinct activity actions'
);

SELECT throws_ok(
  $$SELECT public.execute_coordinated_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000008', 'start', NULL)$$,
  '42501',
  'Manager can only coordinate tasks in their branch',
  'branch-scoped manager cannot coordinate work in another branch'
);

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('pending', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008')$$,
  '42501',
  'Not authorized',
  'members cannot create maintenance tasks'
);

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'start', NULL, NULL, NULL)$$,
  'assigned member starts pending work'
);

SELECT is(
  (SELECT status FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000004'),
  'in_progress',
  'member start moves pending work to in progress'
);

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'set_checklist_item', 'pickup', true, NULL)$$,
  'assigned member toggles one existing checklist item'
);

SELECT is(
  (
    SELECT item ->> 'completed'
    FROM public.tasks,
      LATERAL jsonb_array_elements(checklist) AS item
    WHERE tasks.id = '91000000-0000-0000-0000-000000000004'
      AND item ->> 'id' = 'pickup'
  ),
  'true',
  'member checklist mutation changes only the selected item completion flag'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'set_checklist_item', 'missing', true, NULL)$$,
  '22023',
  'Checklist item not found',
  'member cannot add or replace checklist content through item toggle'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'block', NULL, NULL, NULL)$$,
  '22023',
  'Block reason must be between 3 and 500 characters',
  'blocker reason is required'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'block', NULL, NULL, 'no')$$,
  '22023',
  'Block reason must be between 3 and 500 characters',
  'blocker reason enforces the minimum trimmed length'
);

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'block', NULL, NULL, 'Waiting for the replacement hinge')$$,
  'assigned member blocks active work with a reason'
);

SELECT ok(
  (
    SELECT status = 'blocked'
      AND blocked_reason = 'Waiting for the replacement hinge'
      AND completed_at IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000004'
  ),
  'blocking stores the trimmed reason without a completion timestamp'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'submit_for_review', NULL, NULL, NULL)$$,
  '22023',
  'Only in-progress work can be submitted for review',
  'blocked work cannot be submitted for review'
);

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'resume', NULL, NULL, NULL)$$,
  'assigned member resumes blocked work'
);

SELECT ok(
  (
    SELECT status = 'in_progress' AND blocked_reason IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000004'
  ),
  'resuming clears the blocker reason'
);

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'submit_for_review', NULL, NULL, NULL)$$,
  'assigned member submits work for manager review'
);

SELECT ok(
  (
    SELECT tasks.status = 'ready_for_review'
      AND tasks.completed_at IS NULL
      AND requests.status = 'open'
    FROM public.tasks
    JOIN public.tenant_requests AS requests
      ON requests.id = tasks.tenant_request_id
    WHERE tasks.id = '91000000-0000-0000-0000-000000000004'
  ),
  'submission keeps completion null and the tenant request open'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006', 'start', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized for this maintenance task',
  'member cannot execute a task assigned to another person'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000008', 'submit_for_review', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized for this maintenance task',
  'member cannot execute an assigned task in another branch'
);

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004', 'start', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized',
  'member cannot execute work across organizations'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000211', '80000000-0000-0000-0000-000000000008')$$,
  '42501',
  'Not authorized',
  'member cannot mutate task assignment fields'
);

RESET ROLE;

UPDATE public.tasks
SET assignee_person_id = NULL
WHERE id = (SELECT created_task_id FROM maintenance_role_workflow_state);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', (SELECT created_task_id FROM maintenance_role_workflow_state), 'start', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized for this maintenance task',
  'member cannot execute an unassigned task'
);

RESET ROLE;

UPDATE public.tasks
SET
  assignee_person_id = '80000000-0000-0000-0000-000000000008',
  archived_at = now()
WHERE id = (SELECT created_task_id FROM maintenance_role_workflow_state);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', (SELECT created_task_id FROM maintenance_role_workflow_state), 'start', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized for this maintenance task',
  'member cannot execute an archived task'
);

RESET ROLE;

UPDATE public.tasks
SET archived_at = NULL
WHERE id = (SELECT created_task_id FROM maintenance_role_workflow_state);

SELECT lives_ok(
  $$UPDATE public.organization_members
    SET person_id = NULL
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '00000000-0000-0000-0000-000000000601'$$,
  'custom roles may omit a Staff identity while execution remains identity-gated'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006', 'start', NULL, NULL, NULL)$$,
  '42501',
  NULL,
  'custom member without the assigned Staff identity cannot execute that work'
);

RESET ROLE;

UPDATE public.organization_members
SET person_id = '80000000-0000-0000-0000-000000000008'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000004', NULL, 10, 'USD')$$,
  '42501',
  'Not authorized',
  'member cannot record actual maintenance cost'
);

SELECT throws_matching(
  $$UPDATE public.tasks SET status = 'completed' WHERE id = '91000000-0000-0000-0000-000000000004'$$,
  'permission denied',
  'direct member task update is blocked at the table grant boundary'
);

SELECT is(
  (SELECT status FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000004'),
  'ready_for_review',
  'member cannot complete submitted work by direct update'
);

SELECT throws_ok(
  $$SELECT public.review_maintenance_task_completion('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'approve', NULL)$$,
  '42501',
  'Not authorized',
  'member cannot approve submitted work'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::bigint FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000004' AND status = 'ready_for_review'),
  1::bigint,
  'branch-scoped manager can read submitted work in their branch'
);

SELECT throws_ok(
  $$SELECT public.review_maintenance_task_completion('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'reopen', NULL)$$,
  '22023',
  'Reopen note must be between 3 and 500 characters',
  'reopen requires a review note'
);

SELECT throws_ok(
  $$SELECT public.review_maintenance_task_completion('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'reopen', 'no')$$,
  '22023',
  'Reopen note must be between 3 and 500 characters',
  'reopen note enforces the minimum trimmed length'
);

SELECT lives_ok(
  $$SELECT public.review_maintenance_task_completion('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'reopen', 'Please verify the closer speed again')$$,
  'manager reopens submitted work with a review note'
);

SELECT ok(
  (
    SELECT status = 'in_progress'
      AND completed_at IS NULL
      AND blocked_reason IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000004'
  ),
  'reopen returns submitted work to in progress'
);

SELECT is(
  (
    SELECT new_values ->> 'review_note'
    FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000004'
      AND action = 'maintenance_task_completion_reopened'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  'Please verify the closer speed again',
  'reopen review note is retained in assignee-visible activity history'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'submit_for_review', NULL, NULL, NULL)$$,
  'member resubmits reopened work'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.review_maintenance_task_completion('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'approve', NULL)$$,
  'manager approves submitted work without requiring an approval note'
);

SELECT ok(
  (
    SELECT tasks.status = 'completed'
      AND tasks.completed_at IS NOT NULL
      AND tasks.blocked_reason IS NULL
      AND requests.status = 'closed'
    FROM public.tasks
    JOIN public.tenant_requests AS requests
      ON requests.id = tasks.tenant_request_id
    WHERE tasks.id = '91000000-0000-0000-0000-000000000004'
  ),
  'approval completes the task, timestamps it, and closes its request'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000004'
      AND action = 'maintenance_task_work_started'
  )
  AND EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000004'
      AND action = 'maintenance_task_submitted_for_review'
  )
  AND EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000004'
      AND action = 'maintenance_task_completion_approved'
  ),
  'member and review transitions emit distinct activity actions'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::bigint FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000008'),
  0::bigint,
  'member cannot select an assigned task from an incompatible branch'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.activity_logs
    WHERE entity_type = 'task'
      AND entity_id = '91000000-0000-0000-0000-000000000008'
  ),
  0::bigint,
  'member cannot read activity for an inaccessible task'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  to_regprocedure(
    'public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,boolean,uuid,uuid)'
  ) IS NULL,
  'the maintenance update API has no direct Ledger switch'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.ledger_entries
    WHERE source_id = '91000000-0000-0000-0000-000000000005'
  ),
  0::bigint,
  'maintenance edits leave finance authority with the approval workflow'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SET LOCAL ROLE authenticated;

SELECT throws_matching(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003')$$,
  'Not authorized|not found',
  'cross-organization admin cannot mutate maintenance work'
);

RESET ROLE;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
VALUES (
  '82e00000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Organization Scope Target',
  'ORG-SCOPE-TARGET',
  'Residential apartment',
  'active'
);

INSERT INTO public.tenant_requests (
  id,
  organization_id,
  property_id,
  request_type,
  title,
  category,
  priority,
  status
)
VALUES (
  '82e00000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  '82e00000-0000-0000-0000-000000000001',
  'maintenance',
  'Organization scope change target',
  'General',
  'normal',
  'open'
);

SELECT throws_ok(
  $$
    UPDATE public.tasks
    SET
      organization_id = '00000000-0000-0000-0000-000000000002',
      tenant_request_id = '82e00000-0000-0000-0000-000000000002',
      property_id = '82e00000-0000-0000-0000-000000000001',
      unit_id = NULL,
      branch_id = NULL,
      assignee_person_id = NULL
    WHERE id = '91000000-0000-0000-0000-000000000001'
  $$,
  '22023',
  'Maintenance task branch must match its Property',
  'task organization changes preserve the Property branch invariant before vendor validation'
);

SELECT * FROM finish();
ROLLBACK;
