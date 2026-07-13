BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(87);

CREATE TEMP TABLE maintenance_role_workflow_state (
  created_task_id uuid
) ON COMMIT DROP;

GRANT ALL ON maintenance_role_workflow_state TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.call_create_maintenance_task(
  p_status text,
  p_branch_id uuid,
  p_assignee_person_id uuid
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
    NULL,
    50,
    'USD'::public.currency_code,
    '[{"id":"inspect","label":"Inspect the issue","completed":false}]'::jsonb,
    'none',
    p_branch_id,
    p_assignee_person_id
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.call_update_maintenance_task(
  p_task_id uuid,
  p_status text DEFAULT NULL,
  p_actual_cost_amount numeric DEFAULT NULL,
  p_actual_cost_currency public.currency_code DEFAULT NULL,
  p_link_actual_cost_to_ledger boolean DEFAULT false,
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
    p_link_actual_cost_to_ledger,
    coalesce(p_branch_id, target.branch_id),
    coalesce(p_assignee_person_id, target.assignee_person_id)
  );
END;
$$;

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

INSERT INTO maintenance_role_workflow_state (created_task_id)
SELECT pg_temp.call_create_maintenance_task(
  'pending',
  '00000000-0000-0000-0000-000000000211'::uuid,
  '80300000-0000-0000-0000-000000000003'::uuid
);

SELECT ok(
  (
    SELECT status = 'pending'
      AND branch_id = '00000000-0000-0000-0000-000000000211'::uuid
      AND assignee_person_id = '80300000-0000-0000-0000-000000000003'::uuid
    FROM public.tasks
    WHERE id = (SELECT created_task_id FROM maintenance_role_workflow_state)
  ),
  'manager creation atomically stores the initial branch and assignee'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('completed', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000003')$$,
  '22023',
  'New maintenance tasks must be pending or scheduled',
  'new tasks cannot start completed'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_create_maintenance_task('pending', '00000000-0000-0000-0000-000000000212', '80300000-0000-0000-0000-000000000003')$$,
  '42501',
  'Manager can only manage tasks in their branch',
  'branch-scoped manager cannot create in another branch'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003', NULL, 84, 'USD', false)$$,
  'manager records operational actual cost without financial posting'
);

SELECT ok(
  (
    SELECT actual_cost_amount = 84
      AND actual_cost_currency = 'USD'::public.currency_code
      AND ledger_entry_id IS NULL
    FROM public.tasks
    WHERE id = '91000000-0000-0000-0000-000000000003'
  ),
  'manager actual cost does not create or link an official ledger entry'
);

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003', NULL, 85, 'USD', true)$$,
  '42501',
  'Managers cannot create, update, link, or post maintenance ledger entries',
  'manager ledger posting is explicitly rejected'
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
  'Manager can only manage tasks in their branch',
  'branch-scoped manager cannot update another branch task'
);

SELECT lives_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000003')$$,
  'manager can atomically reassign a task inside their branch'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000212', '80300000-0000-0000-0000-000000000003')$$,
  '42501',
  'Manager can only manage tasks in their branch',
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

SELECT lives_ok(
  $$UPDATE public.tasks SET actual_cost_amount = 999, actual_cost_currency = 'USD' WHERE id = '91000000-0000-0000-0000-000000000003'$$,
  'direct manager task update is filtered by RLS instead of raising'
);

SELECT throws_matching(
  $$INSERT INTO public.activity_logs (organization_id, actor_id, entity_type, entity_id, action) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'task', '91000000-0000-0000-0000-000000000003', 'unchecked_manager_write')$$,
  'row-level security',
  'manager cannot write task activity outside the checked RPCs'
);

SELECT is(
  (SELECT count(*)::bigint FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000008'),
  0::bigint,
  'branch-scoped manager cannot select another branch task'
);

SELECT lives_ok(
  $$UPDATE public.tenant_requests SET status = 'closed' WHERE id = '90000000-0000-0000-0000-000000000003'$$,
  'direct manager request update is filtered by RLS instead of raising'
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
  0::bigint,
  'branch-scoped manager cannot enumerate members from another branch'
);

RESET ROLE;

UPDATE public.organization_members
SET branch_id = '00000000-0000-0000-0000-000000000211'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

UPDATE public.organization_members
SET branch_id = NULL
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000501';

SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_maintenance_execution_members(
      '00000000-0000-0000-0000-000000000001'
    )
  ),
  1::bigint,
  'organization-scoped manager can enumerate executable members across branches'
);

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000008', NULL, 77, 'USD', false)$$,
  'manager without a branch preserves existing organization-wide management scope'
);

SELECT throws_ok(
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000212', '80300000-0000-0000-0000-000000000003')$$,
  '23503',
  'Assignee must be an executable linked member for the selected branch',
  'new assignment to a branch-incompatible linked member fails'
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
  'manager starts legacy unlinked work through coordinated controls'
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
  (SELECT ledger_entry_id FROM public.tasks WHERE id = '91000000-0000-0000-0000-000000000009'),
  NULL::uuid,
  'coordinated completion creates no official ledger effect'
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
  $$SELECT pg_temp.call_create_maintenance_task('pending', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000003')$$,
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
  $$SELECT public.assign_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000211', '80300000-0000-0000-0000-000000000003')$$,
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
  assignee_person_id = '80300000-0000-0000-0000-000000000003',
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

UPDATE public.organization_members
SET person_id = NULL
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.execute_assigned_maintenance_task('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'start', NULL, NULL, NULL)$$,
  '42501',
  'Not authorized',
  'member requires a linked staff person before executing work'
);

RESET ROLE;

UPDATE public.organization_members
SET person_id = '80300000-0000-0000-0000-000000000003'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = '00000000-0000-0000-0000-000000000601';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000004', NULL, 10, 'USD', false)$$,
  '42501',
  'Not authorized',
  'member cannot record actual maintenance cost'
);

SELECT lives_ok(
  $$UPDATE public.tasks SET status = 'completed' WHERE id = '91000000-0000-0000-0000-000000000004'$$,
  'direct member task update is filtered by RLS instead of raising'
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

SELECT lives_ok(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000005', NULL, 130, 'USD', true)$$,
  'admin can post recorded actual cost into the official ledger'
);

SELECT ok(
  (
    SELECT tasks.ledger_entry_id IS NOT NULL
      AND ledger.amount = 130
      AND ledger.direction = 'expense'
    FROM public.tasks
    JOIN public.ledger_entries AS ledger
      ON ledger.id = tasks.ledger_entry_id
    WHERE tasks.id = '91000000-0000-0000-0000-000000000005'
  ),
  'admin posting creates and links the official maintenance ledger effect'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SET LOCAL ROLE authenticated;

SELECT throws_matching(
  $$SELECT pg_temp.call_update_maintenance_task('91000000-0000-0000-0000-000000000003')$$,
  'Not authorized|not found',
  'cross-organization admin cannot mutate maintenance work'
);

SELECT * FROM finish();
ROLLBACK;
