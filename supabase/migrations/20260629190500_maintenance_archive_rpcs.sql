CREATE OR REPLACE FUNCTION public.archive_maintenance_task(
  p_task_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
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

  UPDATE public.tasks
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

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
    (SELECT auth.uid()),
    'task',
    p_task_id,
    'archived',
    jsonb_build_object(
      'title', old_task.title,
      'category', old_task.category,
      'priority', old_task.priority,
      'status', old_task.status,
      'due_date', old_task.due_date,
      'due_time', old_task.due_time,
      'reminder_date', old_task.reminder_date,
      'reminder_time', old_task.reminder_time,
      'vendor_person_id', old_task.vendor_person_id,
      'cost_estimate_amount', old_task.cost_estimate_amount,
      'cost_estimate_currency', old_task.cost_estimate_currency,
      'actual_cost_amount', old_task.actual_cost_amount,
      'actual_cost_currency', old_task.actual_cost_currency,
      'ledger_entry_id', old_task.ledger_entry_id,
      'timeline_event_id', old_task.timeline_event_id,
      'recurrence_frequency', old_task.recurrence_frequency,
      'archived_at', old_task.archived_at,
      'archived_by', old_task.archived_by
    ),
    jsonb_build_object(
      'title', new_task.title,
      'category', new_task.category,
      'priority', new_task.priority,
      'status', new_task.status,
      'due_date', new_task.due_date,
      'due_time', new_task.due_time,
      'reminder_date', new_task.reminder_date,
      'reminder_time', new_task.reminder_time,
      'vendor_person_id', new_task.vendor_person_id,
      'cost_estimate_amount', new_task.cost_estimate_amount,
      'cost_estimate_currency', new_task.cost_estimate_currency,
      'actual_cost_amount', new_task.actual_cost_amount,
      'actual_cost_currency', new_task.actual_cost_currency,
      'ledger_entry_id', new_task.ledger_entry_id,
      'timeline_event_id', new_task.timeline_event_id,
      'recurrence_frequency', new_task.recurrence_frequency,
      'archived_at', new_task.archived_at,
      'archived_by', new_task.archived_by
    )
  );

  RETURN p_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_maintenance_task(
  p_task_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = old_task.property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF old_task.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = old_task.unit_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.tasks
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

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
    (SELECT auth.uid()),
    'task',
    p_task_id,
    'restored',
    jsonb_build_object(
      'title', old_task.title,
      'category', old_task.category,
      'priority', old_task.priority,
      'status', old_task.status,
      'due_date', old_task.due_date,
      'due_time', old_task.due_time,
      'reminder_date', old_task.reminder_date,
      'reminder_time', old_task.reminder_time,
      'vendor_person_id', old_task.vendor_person_id,
      'cost_estimate_amount', old_task.cost_estimate_amount,
      'cost_estimate_currency', old_task.cost_estimate_currency,
      'actual_cost_amount', old_task.actual_cost_amount,
      'actual_cost_currency', old_task.actual_cost_currency,
      'ledger_entry_id', old_task.ledger_entry_id,
      'timeline_event_id', old_task.timeline_event_id,
      'recurrence_frequency', old_task.recurrence_frequency,
      'archived_at', old_task.archived_at,
      'archived_by', old_task.archived_by
    ),
    jsonb_build_object(
      'title', new_task.title,
      'category', new_task.category,
      'priority', new_task.priority,
      'status', new_task.status,
      'due_date', new_task.due_date,
      'due_time', new_task.due_time,
      'reminder_date', new_task.reminder_date,
      'reminder_time', new_task.reminder_time,
      'vendor_person_id', new_task.vendor_person_id,
      'cost_estimate_amount', new_task.cost_estimate_amount,
      'cost_estimate_currency', new_task.cost_estimate_currency,
      'actual_cost_amount', new_task.actual_cost_amount,
      'actual_cost_currency', new_task.actual_cost_currency,
      'ledger_entry_id', new_task.ledger_entry_id,
      'timeline_event_id', new_task.timeline_event_id,
      'recurrence_frequency', new_task.recurrence_frequency,
      'archived_at', new_task.archived_at,
      'archived_by', new_task.archived_by
    )
  );

  RETURN p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_maintenance_task(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_maintenance_task(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.archive_maintenance_task(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_maintenance_task(uuid, uuid) TO authenticated;
