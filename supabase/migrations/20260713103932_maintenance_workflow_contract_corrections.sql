CREATE OR REPLACE FUNCTION app_private.has_maintenance_member_identity(
  p_organization_id uuid,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_person_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.role = 'member'
        AND membership.person_id = p_person_id
        AND membership.branch_id IS NOT DISTINCT FROM p_branch_id
    );
$$;

CREATE OR REPLACE FUNCTION app_private.is_executable_maintenance_assignee(
  p_organization_id uuid,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT app_private.has_maintenance_member_identity(
    p_organization_id,
    p_branch_id,
    p_person_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.organization_id = p_organization_id
      AND person.id = p_person_id
      AND person.archived_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION app_private.has_maintenance_member_identity(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.is_executable_maintenance_assignee(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
)
SET SCHEMA app_private;

ALTER FUNCTION app_private.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
)
RENAME TO create_maintenance_task_legacy_checked;

REVOKE ALL ON FUNCTION app_private.create_maintenance_task_legacy_checked(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_maintenance_task(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_status text,
  p_due_date date,
  p_due_time time,
  p_reminder_date date,
  p_reminder_time time,
  p_vendor_person_id uuid,
  p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,
  p_checklist jsonb,
  p_recurrence_frequency text,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
  actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'manager'
    AND actor_branch_id IS NOT NULL
    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN
    RAISE EXCEPTION 'Manager can only manage tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND NOT app_private.is_executable_maintenance_assignee(
      p_organization_id,
      p_branch_id,
      p_assignee_person_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id = person.organization_id
       AND person_role.person_id = person.id
       AND person_role.role = 'staff'
       AND person_role.status = 'active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id = p_organization_id
        AND person.id = p_assignee_person_id
        AND person.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
    END IF;

    RAISE EXCEPTION 'Assignee must be an executable linked member for the selected branch'
      USING ERRCODE = '23503';
  END IF;

  RETURN app_private.create_maintenance_task_legacy_checked(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_title,
    p_description,
    p_category,
    p_priority,
    p_status,
    p_due_date,
    p_due_time,
    p_reminder_date,
    p_reminder_time,
    p_vendor_person_id,
    p_cost_estimate_amount,
    p_cost_estimate_currency,
    p_checklist,
    p_recurrence_frequency,
    p_branch_id,
    p_assignee_person_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
)
TO authenticated;

ALTER FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
)
SET SCHEMA app_private;

ALTER FUNCTION app_private.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
)
RENAME TO update_maintenance_task_legacy_checked;

REVOKE ALL ON FUNCTION app_private.update_maintenance_task_legacy_checked(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_maintenance_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_status text,
  p_due_date date,
  p_due_time time,
  p_reminder_date date,
  p_reminder_time time,
  p_vendor_person_id uuid,
  p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,
  p_actual_cost_amount numeric,
  p_actual_cost_currency public.currency_code,
  p_checklist jsonb,
  p_recurrence_frequency text,
  p_link_actual_cost_to_ledger boolean,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
  old_task public.tasks%ROWTYPE;
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_status IS DISTINCT FROM old_task.status THEN
    IF old_task.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Terminal maintenance tasks cannot change status'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the member execution RPC to submit work for review'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'completed' THEN
      RAISE EXCEPTION 'Use the completion review RPC to complete submitted work'
        USING ERRCODE = '22023';
    ELSIF old_task.status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the completion review RPC for submitted work'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'cancelled' THEN
      NULL;
    ELSIF NOT (
      (old_task.status = 'pending' AND normalized_status = 'scheduled')
      OR (old_task.status = 'scheduled' AND normalized_status = 'pending')
    ) THEN
      RAISE EXCEPTION 'Use the assigned-member or coordinated execution RPC for execution status changes'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND (
      p_assignee_person_id IS DISTINCT FROM old_task.assignee_person_id
      OR p_branch_id IS DISTINCT FROM old_task.branch_id
    )
    AND NOT app_private.is_executable_maintenance_assignee(
      p_organization_id,
      p_branch_id,
      p_assignee_person_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id = person.organization_id
       AND person_role.person_id = person.id
       AND person_role.role = 'staff'
       AND person_role.status = 'active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id = p_organization_id
        AND person.id = p_assignee_person_id
        AND person.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
    END IF;

    RAISE EXCEPTION 'Assignee must be an executable linked member for the selected branch'
      USING ERRCODE = '23503';
  END IF;

  RETURN app_private.update_maintenance_task_legacy_checked(
    p_task_id,
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_title,
    p_description,
    p_category,
    p_priority,
    p_status,
    p_due_date,
    p_due_time,
    p_reminder_date,
    p_reminder_time,
    p_vendor_person_id,
    p_cost_estimate_amount,
    p_cost_estimate_currency,
    p_actual_cost_amount,
    p_actual_cost_currency,
    p_checklist,
    p_recurrence_frequency,
    p_link_actual_cost_to_ledger,
    p_branch_id,
    p_assignee_person_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
)
TO authenticated;

ALTER FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
SET SCHEMA app_private;
ALTER FUNCTION app_private.assign_maintenance_task(uuid, uuid, uuid, uuid)
RENAME TO assign_maintenance_task_legacy_checked;
REVOKE ALL ON FUNCTION app_private.assign_maintenance_task_legacy_checked(
  uuid, uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.assign_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_branch_id uuid,
  p_assignee_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
  actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'manager'
    AND actor_branch_id IS NOT NULL
    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN
    RAISE EXCEPTION 'Manager can only manage tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND NOT app_private.is_executable_maintenance_assignee(
      p_organization_id,
      p_branch_id,
      p_assignee_person_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id = person.organization_id
       AND person_role.person_id = person.id
       AND person_role.role = 'staff'
       AND person_role.status = 'active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id = p_organization_id
        AND person.id = p_assignee_person_id
        AND person.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
    END IF;

    RAISE EXCEPTION 'Assignee must be an executable linked member for the selected branch'
      USING ERRCODE = '23503';
  END IF;

  RETURN app_private.assign_maintenance_task_legacy_checked(
    p_organization_id,
    p_task_id,
    p_branch_id,
    p_assignee_person_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
  TO authenticated;

CREATE FUNCTION public.get_maintenance_execution_members(
  p_organization_id uuid
)
RETURNS TABLE (
  person_id uuid,
  branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT membership.person_id, membership.branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'member'
    AND membership.person_id IS NOT NULL
  ORDER BY membership.branch_id NULLS FIRST, membership.person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_execution_members(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_execution_members(uuid)
  TO authenticated;

CREATE FUNCTION public.execute_coordinated_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_role text;
  actor_branch_id uuid;
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_note text := NULLIF(trim(coalesce(p_note, '')), '');
  next_status text;
  activity_action text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT membership.role, membership.branch_id
  INTO actor_role, actor_branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = actor_id
  LIMIT 1;

  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF actor_role = 'manager'
    AND actor_branch_id IS NOT NULL
    AND old_task.branch_id IS DISTINCT FROM actor_branch_id THEN
    RAISE EXCEPTION 'Manager can only coordinate tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF app_private.has_maintenance_member_identity(
    p_organization_id,
    old_task.branch_id,
    old_task.assignee_person_id
  ) THEN
    RAISE EXCEPTION 'Executable member assignments must use the member workflow'
      USING ERRCODE = '22023';
  END IF;

  CASE normalized_action
    WHEN 'start' THEN
      IF old_task.status NOT IN ('pending', 'scheduled') THEN
        RAISE EXCEPTION 'Only pending or scheduled coordinated work can start'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'in_progress';
      activity_action := 'maintenance_task_coordinated_work_started';
    WHEN 'block' THEN
      IF old_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress coordinated work can be blocked'
          USING ERRCODE = '22023';
      END IF;
      IF normalized_note IS NULL OR length(normalized_note) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'Coordinated block note must be between 3 and 500 characters'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'blocked';
      activity_action := 'maintenance_task_coordinated_work_blocked';
    WHEN 'resume' THEN
      IF old_task.status <> 'blocked' THEN
        RAISE EXCEPTION 'Only blocked coordinated work can resume'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'in_progress';
      activity_action := 'maintenance_task_coordinated_work_resumed';
    WHEN 'complete' THEN
      IF old_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress coordinated work can complete'
          USING ERRCODE = '22023';
      END IF;
      IF normalized_note IS NULL OR length(normalized_note) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'Coordinated completion note must be between 3 and 500 characters'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'completed';
      activity_action := 'maintenance_task_coordinated_work_completed';
    ELSE
      RAISE EXCEPTION 'Unsupported coordinated maintenance action'
        USING ERRCODE = '22023';
  END CASE;

  UPDATE public.tasks
  SET
    status = next_status,
    blocked_reason = CASE
      WHEN normalized_action = 'block' THEN normalized_note
      ELSE NULL
    END,
    completed_at = CASE
      WHEN normalized_action = 'complete' THEN now()
      ELSE NULL
    END,
    updated_by = actor_id
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

  UPDATE public.tenant_requests
  SET
    status = CASE WHEN normalized_action = 'complete' THEN 'closed' ELSE 'open' END,
    updated_by = actor_id
  WHERE id = old_task.tenant_request_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance request not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    actor_id,
    'task',
    p_task_id,
    activity_action,
    jsonb_strip_nulls(jsonb_build_object(
      'status', old_task.status,
      'blocked_reason', old_task.blocked_reason
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'status', new_task.status,
      'blocked_reason', new_task.blocked_reason,
      'completion_note', CASE
        WHEN normalized_action = 'complete' THEN normalized_note
        ELSE NULL
      END
    ))
  );

  RETURN p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_coordinated_maintenance_task(
  uuid, uuid, text, text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_coordinated_maintenance_task(
  uuid, uuid, text, text
)
TO authenticated;
