-- Phase 1 maintenance handoff: manager assignment, member execution, and
-- manager/admin completion review. This intentionally extends the existing
-- maintenance task model instead of introducing a generic workflow model.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_reason text;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_blocked_reason_length_check CHECK (
    blocked_reason IS NULL
    OR length(trim(blocked_reason)) BETWEEN 3 AND 500
  );

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check CHECK (
    status IN (
      'pending',
      'scheduled',
      'in_progress',
      'blocked',
      'ready_for_review',
      'completed',
      'cancelled'
    )
  );

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_completed_at_status_check CHECK (
    completed_at IS NULL OR status = 'completed'
  ) NOT VALID;

DROP FUNCTION IF EXISTS public.create_maintenance_task(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  jsonb,
  text
);

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
  actor_id uuid := (SELECT auth.uid());
  actor_role text;
  actor_branch_id uuid;
  new_request_id uuid;
  new_task_id uuid;
  new_timeline_event_id uuid;
  normalized_category text := trim(coalesce(p_category, ''));
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_priority text := lower(trim(coalesce(p_priority, 'normal')));
  normalized_status text := lower(trim(coalesce(p_status, 'pending')));
  normalized_title text := trim(coalesce(p_title, ''));
  normalized_recurrence text := lower(trim(coalesce(p_recurrence_frequency, 'none')));
  normalized_checklist jsonb := coalesce(p_checklist, '[]'::jsonb);
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

  IF actor_role = 'manager'
    AND actor_branch_id IS NOT NULL
    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN
    RAISE EXCEPTION 'Manager can only manage tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.id = p_property_id
      AND property.organization_id = p_organization_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.id = p_unit_id
      AND unit.property_id = p_property_id
      AND unit.organization_id = p_organization_id
      AND unit.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'vendor'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_vendor_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor not found' USING ERRCODE = '23503';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.organization_id = p_organization_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_assignee_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS assignee_membership
    WHERE assignee_membership.organization_id = p_organization_id
      AND assignee_membership.person_id = p_assignee_person_id
      AND assignee_membership.role = 'member'
      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id
  ) THEN
    RAISE EXCEPTION 'Assignee branch does not match the task branch'
      USING ERRCODE = '22023';
  END IF;

  IF length(normalized_title) < 3 THEN
    RAISE EXCEPTION 'Title is too short' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_category) < 2 THEN
    RAISE EXCEPTION 'Category is too short' USING ERRCODE = '22023';
  END IF;

  IF normalized_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Priority is not supported' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'New maintenance tasks must be pending or scheduled'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_recurrence NOT IN (
    'none',
    'weekly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
  ) THEN
    RAISE EXCEPTION 'Recurrence is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_due_time IS NOT NULL AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Due time requires a due date' USING ERRCODE = '22023';
  END IF;

  IF p_reminder_time IS NOT NULL AND p_reminder_date IS NULL THEN
    RAISE EXCEPTION 'Reminder time requires a reminder date' USING ERRCODE = '22023';
  END IF;

  IF p_cost_estimate_amount IS NOT NULL AND p_cost_estimate_amount < 0 THEN
    RAISE EXCEPTION 'Cost estimate cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_cost_estimate_amount IS NULL) <> (p_cost_estimate_currency IS NULL) THEN
    RAISE EXCEPTION 'Cost estimate and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(normalized_checklist) <> 'array' THEN
    RAISE EXCEPTION 'Checklist must be an array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_requests (
    organization_id,
    property_id,
    unit_id,
    request_type,
    title,
    description,
    category,
    priority,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    'maintenance',
    normalized_title,
    normalized_description,
    normalized_category,
    normalized_priority,
    'open',
    actor_id,
    actor_id
  )
  RETURNING id INTO new_request_id;

  INSERT INTO public.tasks (
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
    due_time,
    reminder_date,
    reminder_time,
    vendor_person_id,
    cost_estimate_amount,
    cost_estimate_currency,
    checklist,
    recurrence_frequency,
    branch_id,
    assignee_person_id,
    completed_at,
    blocked_reason,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    new_request_id,
    p_property_id,
    p_unit_id,
    normalized_title,
    normalized_description,
    normalized_category,
    normalized_priority,
    normalized_status,
    p_due_date,
    p_due_time,
    p_reminder_date,
    p_reminder_time,
    p_vendor_person_id,
    p_cost_estimate_amount,
    p_cost_estimate_currency,
    normalized_checklist,
    normalized_recurrence,
    p_branch_id,
    p_assignee_person_id,
    NULL,
    NULL,
    actor_id,
    actor_id
  )
  RETURNING id INTO new_task_id;

  INSERT INTO public.timeline_events (
    organization_id,
    property_id,
    unit_id,
    event_date,
    event_type,
    title,
    description,
    cost_amount,
    cost_currency,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    coalesce(p_due_date, current_date),
    app_private.maintenance_timeline_event_type(normalized_category, normalized_title),
    'Maintenance case: ' || normalized_title,
    normalized_description,
    NULL,
    NULL,
    actor_id,
    actor_id
  )
  RETURNING id INTO new_timeline_event_id;

  UPDATE public.tasks
  SET timeline_event_id = new_timeline_event_id
  WHERE id = new_task_id
    AND organization_id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES
  (
    p_organization_id,
    actor_id,
    'tenant_request',
    new_request_id,
    'maintenance_request_created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'title', normalized_title,
      'category', normalized_category,
      'priority', normalized_priority,
      'status', 'open'
    )
  ),
  (
    p_organization_id,
    actor_id,
    'task',
    new_task_id,
    'maintenance_task_created',
    jsonb_build_object(
      'tenant_request_id', new_request_id,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'title', normalized_title,
      'category', normalized_category,
      'priority', normalized_priority,
      'status', normalized_status,
      'due_date', p_due_date,
      'due_time', p_due_time,
      'reminder_date', p_reminder_date,
      'reminder_time', p_reminder_time,
      'vendor_person_id', p_vendor_person_id,
      'cost_estimate_amount', p_cost_estimate_amount,
      'cost_estimate_currency', p_cost_estimate_currency,
      'timeline_event_id', new_timeline_event_id,
      'recurrence_frequency', normalized_recurrence,
      'branch_id', p_branch_id,
      'assignee_person_id', p_assignee_person_id
    )
  );

  RETURN new_task_id;
END;
$$;

DROP FUNCTION IF EXISTS public.update_maintenance_task(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  numeric,
  public.currency_code,
  jsonb,
  text,
  boolean
);

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
  actor_id uuid := (SELECT auth.uid());
  actor_role text;
  actor_branch_id uuid;
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
  new_ledger_entry_id uuid;
  new_timeline_event_id uuid;
  normalized_category text := trim(coalesce(p_category, ''));
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_priority text := lower(trim(coalesce(p_priority, 'normal')));
  normalized_status text := lower(trim(coalesce(p_status, 'pending')));
  normalized_title text := trim(coalesce(p_title, ''));
  normalized_recurrence text := lower(trim(coalesce(p_recurrence_frequency, 'none')));
  normalized_checklist jsonb := coalesce(p_checklist, '[]'::jsonb);
  ledger_category text;
  ledger_transaction_date date;
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
    AND (
      old_task.branch_id IS DISTINCT FROM actor_branch_id
      OR p_branch_id IS DISTINCT FROM actor_branch_id
    ) THEN
    RAISE EXCEPTION 'Manager can only manage tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'manager' AND coalesce(p_link_actual_cost_to_ledger, false) THEN
    RAISE EXCEPTION 'Managers cannot create, update, link, or post maintenance ledger entries'
      USING ERRCODE = '42501';
  END IF;

  IF old_task.property_id <> p_property_id THEN
    RAISE EXCEPTION 'Maintenance task property cannot be changed'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.id = p_property_id
      AND property.organization_id = p_organization_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.id = p_unit_id
      AND unit.property_id = p_property_id
      AND unit.organization_id = p_organization_id
      AND unit.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'vendor'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_vendor_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor not found' USING ERRCODE = '23503';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.organization_id = p_organization_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_assignee_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND (
      p_assignee_person_id IS DISTINCT FROM old_task.assignee_person_id
      OR p_branch_id IS DISTINCT FROM old_task.branch_id
    )
    AND EXISTS (
    SELECT 1
    FROM public.organization_members AS assignee_membership
    WHERE assignee_membership.organization_id = p_organization_id
      AND assignee_membership.person_id = p_assignee_person_id
      AND assignee_membership.role = 'member'
      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id
  ) THEN
    RAISE EXCEPTION 'Assignee branch does not match the task branch'
      USING ERRCODE = '22023';
  END IF;

  IF length(normalized_title) < 3 THEN
    RAISE EXCEPTION 'Title is too short' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_category) < 2 THEN
    RAISE EXCEPTION 'Category is too short' USING ERRCODE = '22023';
  END IF;

  IF normalized_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Priority is not supported' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN (
    'pending',
    'scheduled',
    'in_progress',
    'blocked',
    'ready_for_review',
    'completed',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'Status is not supported' USING ERRCODE = '22023';
  END IF;

  IF normalized_status IS DISTINCT FROM old_task.status THEN
    IF old_task.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Terminal maintenance tasks cannot change status'
        USING ERRCODE = '22023';
    END IF;

    IF old_task.status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the completion review RPC for submitted work'
        USING ERRCODE = '22023';
    END IF;

    IF normalized_status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the member execution RPC to submit work for review'
        USING ERRCODE = '22023';
    END IF;

    IF normalized_status = 'completed' THEN
      RAISE EXCEPTION 'Use the completion review RPC to complete submitted work'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF normalized_recurrence NOT IN (
    'none',
    'weekly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
  ) THEN
    RAISE EXCEPTION 'Recurrence is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_due_time IS NOT NULL AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Due time requires a due date' USING ERRCODE = '22023';
  END IF;

  IF p_reminder_time IS NOT NULL AND p_reminder_date IS NULL THEN
    RAISE EXCEPTION 'Reminder time requires a reminder date' USING ERRCODE = '22023';
  END IF;

  IF p_cost_estimate_amount IS NOT NULL AND p_cost_estimate_amount < 0 THEN
    RAISE EXCEPTION 'Cost estimate cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_actual_cost_amount IS NOT NULL AND p_actual_cost_amount < 0 THEN
    RAISE EXCEPTION 'Actual cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_cost_estimate_amount IS NULL) <> (p_cost_estimate_currency IS NULL) THEN
    RAISE EXCEPTION 'Cost estimate and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  IF (p_actual_cost_amount IS NULL) <> (p_actual_cost_currency IS NULL) THEN
    RAISE EXCEPTION 'Actual cost and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(normalized_checklist) <> 'array' THEN
    RAISE EXCEPTION 'Checklist must be an array' USING ERRCODE = '22023';
  END IF;

  new_ledger_entry_id := old_task.ledger_entry_id;
  new_timeline_event_id := old_task.timeline_event_id;
  ledger_category := 'Maintenance - ' || normalized_category;
  ledger_transaction_date := coalesce(p_due_date, current_date);

  IF actor_role = 'admin'
    AND coalesce(p_link_actual_cost_to_ledger, false)
    AND p_actual_cost_amount IS NOT NULL
    AND p_actual_cost_amount > 0 THEN
    IF new_ledger_entry_id IS NULL THEN
      INSERT INTO public.ledger_entries (
        organization_id,
        property_id,
        unit_id,
        transaction_date,
        direction,
        category,
        amount,
        currency,
        description,
        created_by,
        updated_by
      )
      VALUES (
        p_organization_id,
        p_property_id,
        p_unit_id,
        ledger_transaction_date,
        'expense',
        ledger_category,
        p_actual_cost_amount,
        p_actual_cost_currency,
        normalized_title,
        actor_id,
        actor_id
      )
      RETURNING id INTO new_ledger_entry_id;

      INSERT INTO public.activity_logs (
        organization_id,
        actor_id,
        entity_type,
        entity_id,
        action,
        new_values
      )
      VALUES (
        p_organization_id,
        actor_id,
        'ledger_entry',
        new_ledger_entry_id,
        'created_from_maintenance_task',
        jsonb_build_object(
          'task_id', p_task_id,
          'property_id', p_property_id,
          'unit_id', p_unit_id,
          'category', ledger_category,
          'amount', p_actual_cost_amount,
          'currency', p_actual_cost_currency
        )
      );
    ELSE
      UPDATE public.ledger_entries
      SET
        property_id = p_property_id,
        unit_id = p_unit_id,
        transaction_date = ledger_transaction_date,
        direction = 'expense',
        category = ledger_category,
        amount = p_actual_cost_amount,
        currency = p_actual_cost_currency,
        description = normalized_title,
        updated_by = actor_id
      WHERE id = new_ledger_entry_id
        AND organization_id = p_organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked maintenance ledger entry not found'
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;

  IF new_timeline_event_id IS NULL THEN
    INSERT INTO public.timeline_events (
      organization_id,
      property_id,
      unit_id,
      ledger_entry_id,
      event_date,
      event_type,
      title,
      description,
      cost_amount,
      cost_currency,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      p_property_id,
      p_unit_id,
      new_ledger_entry_id,
      coalesce(p_due_date, current_date),
      app_private.maintenance_timeline_event_type(normalized_category, normalized_title),
      'Maintenance case: ' || normalized_title,
      normalized_description,
      p_actual_cost_amount,
      p_actual_cost_currency,
      actor_id,
      actor_id
    )
    RETURNING id INTO new_timeline_event_id;
  ELSE
    UPDATE public.timeline_events
    SET
      property_id = p_property_id,
      unit_id = p_unit_id,
      ledger_entry_id = new_ledger_entry_id,
      event_date = coalesce(p_due_date, current_date),
      event_type = app_private.maintenance_timeline_event_type(normalized_category, normalized_title),
      title = 'Maintenance case: ' || normalized_title,
      description = normalized_description,
      cost_amount = p_actual_cost_amount,
      cost_currency = p_actual_cost_currency,
      updated_by = actor_id
    WHERE id = new_timeline_event_id
      AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked maintenance timeline event not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  UPDATE public.tasks
  SET
    unit_id = p_unit_id,
    title = normalized_title,
    description = normalized_description,
    category = normalized_category,
    priority = normalized_priority,
    status = normalized_status,
    due_date = p_due_date,
    due_time = p_due_time,
    reminder_date = p_reminder_date,
    reminder_time = p_reminder_time,
    vendor_person_id = p_vendor_person_id,
    cost_estimate_amount = p_cost_estimate_amount,
    cost_estimate_currency = p_cost_estimate_currency,
    actual_cost_amount = p_actual_cost_amount,
    actual_cost_currency = p_actual_cost_currency,
    checklist = normalized_checklist,
    recurrence_frequency = normalized_recurrence,
    ledger_entry_id = new_ledger_entry_id,
    timeline_event_id = new_timeline_event_id,
    branch_id = p_branch_id,
    assignee_person_id = p_assignee_person_id,
    blocked_reason = CASE
      WHEN normalized_status = 'blocked' THEN old_task.blocked_reason
      ELSE NULL
    END,
    completed_at = CASE
      WHEN normalized_status = 'completed' THEN old_task.completed_at
      ELSE NULL
    END,
    updated_by = actor_id
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

  UPDATE public.tenant_requests
  SET
    unit_id = p_unit_id,
    title = normalized_title,
    description = normalized_description,
    category = normalized_category,
    priority = normalized_priority,
    status = CASE
      WHEN normalized_status = 'cancelled' THEN 'cancelled'
      WHEN normalized_status = 'completed' THEN 'closed'
      ELSE 'open'
    END,
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
    CASE
      WHEN old_task.status IS DISTINCT FROM normalized_status THEN 'maintenance_task_status_changed'
      ELSE 'maintenance_task_updated'
    END,
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
      'branch_id', old_task.branch_id,
      'assignee_person_id', old_task.assignee_person_id
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
      'branch_id', new_task.branch_id,
      'assignee_person_id', new_task.assignee_person_id
    )
  );

  RETURN p_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_maintenance_task(
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
  actor_id uuid := (SELECT auth.uid());
  actor_role text;
  actor_branch_id uuid;
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
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
    AND (
      old_task.branch_id IS DISTINCT FROM actor_branch_id
      OR p_branch_id IS DISTINCT FROM actor_branch_id
    ) THEN
    RAISE EXCEPTION 'Manager can only manage tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.organization_id = p_organization_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_assignee_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS assignee_membership
    WHERE assignee_membership.organization_id = p_organization_id
      AND assignee_membership.person_id = p_assignee_person_id
      AND assignee_membership.role = 'member'
      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id
  ) THEN
    RAISE EXCEPTION 'Assignee branch does not match the task branch'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tasks
  SET
    branch_id = p_branch_id,
    assignee_person_id = p_assignee_person_id,
    updated_by = actor_id
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
    actor_id,
    'task',
    p_task_id,
    'maintenance_task_assigned',
    jsonb_build_object(
      'branch_id', old_task.branch_id,
      'assignee_person_id', old_task.assignee_person_id
    ),
    jsonb_build_object(
      'branch_id', new_task.branch_id,
      'assignee_person_id', new_task.assignee_person_id
    )
  );

  RETURN p_task_id;
END;
$$;

CREATE FUNCTION public.execute_assigned_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_action text,
  p_checklist_item_id text DEFAULT NULL,
  p_checklist_completed boolean DEFAULT NULL,
  p_blocked_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_role text;
  actor_person_id uuid;
  actor_branch_id uuid;
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_item_id text := NULLIF(trim(coalesce(p_checklist_item_id, '')), '');
  normalized_blocked_reason text := NULLIF(trim(coalesce(p_blocked_reason, '')), '');
  next_status text;
  next_blocked_reason text;
  next_checklist jsonb;
  activity_action text;
  matching_item_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT membership.role, membership.person_id, membership.branch_id
  INTO actor_role, actor_person_id, actor_branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = actor_id
  LIMIT 1;

  IF actor_role <> 'member' OR actor_role IS NULL OR actor_person_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
    OR old_task.assignee_person_id IS DISTINCT FROM actor_person_id
    OR old_task.branch_id IS DISTINCT FROM actor_branch_id
    OR old_task.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Not authorized for this maintenance task'
      USING ERRCODE = '42501';
  END IF;

  next_status := old_task.status;
  next_blocked_reason := old_task.blocked_reason;
  next_checklist := old_task.checklist;

  CASE normalized_action
    WHEN 'start' THEN
      IF old_task.status NOT IN ('pending', 'scheduled') THEN
        RAISE EXCEPTION 'Only pending or scheduled work can be started'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'in_progress';
      next_blocked_reason := NULL;
      activity_action := 'maintenance_task_work_started';

    WHEN 'resume' THEN
      IF old_task.status <> 'blocked' THEN
        RAISE EXCEPTION 'Only blocked work can be resumed'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'in_progress';
      next_blocked_reason := NULL;
      activity_action := 'maintenance_task_work_resumed';

    WHEN 'set_checklist_item' THEN
      IF old_task.status NOT IN ('in_progress', 'blocked') THEN
        RAISE EXCEPTION 'Checklist execution requires active work'
          USING ERRCODE = '22023';
      END IF;

      IF normalized_item_id IS NULL OR p_checklist_completed IS NULL THEN
        RAISE EXCEPTION 'Checklist item and completion value are required'
          USING ERRCODE = '22023';
      END IF;

      SELECT count(*)
      INTO matching_item_count
      FROM jsonb_array_elements(old_task.checklist) AS item
      WHERE item ->> 'id' = normalized_item_id;

      IF matching_item_count <> 1 THEN
        RAISE EXCEPTION 'Checklist item not found' USING ERRCODE = '22023';
      END IF;

      SELECT jsonb_agg(
        CASE
          WHEN item.value ->> 'id' = normalized_item_id
            THEN jsonb_set(
              item.value,
              '{completed}',
              to_jsonb(p_checklist_completed),
              true
            )
          ELSE item.value
        END
        ORDER BY item.ordinality
      )
      INTO next_checklist
      FROM jsonb_array_elements(old_task.checklist) WITH ORDINALITY AS item(value, ordinality);

      activity_action := 'maintenance_task_checklist_item_updated';

    WHEN 'block' THEN
      IF old_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work can be blocked'
          USING ERRCODE = '22023';
      END IF;

      IF normalized_blocked_reason IS NULL
        OR length(normalized_blocked_reason) < 3
        OR length(normalized_blocked_reason) > 500 THEN
        RAISE EXCEPTION 'Block reason must be between 3 and 500 characters'
          USING ERRCODE = '22023';
      END IF;

      next_status := 'blocked';
      next_blocked_reason := normalized_blocked_reason;
      activity_action := 'maintenance_task_work_blocked';

    WHEN 'submit_for_review' THEN
      IF old_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work can be submitted for review'
          USING ERRCODE = '22023';
      END IF;

      next_status := 'ready_for_review';
      next_blocked_reason := NULL;
      activity_action := 'maintenance_task_submitted_for_review';

    ELSE
      RAISE EXCEPTION 'Maintenance execution action is not supported'
        USING ERRCODE = '22023';
  END CASE;

  UPDATE public.tasks
  SET
    status = next_status,
    checklist = next_checklist,
    blocked_reason = next_blocked_reason,
    completed_at = NULL,
    updated_by = actor_id
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

  UPDATE public.tenant_requests
  SET
    status = 'open',
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
    jsonb_build_object(
      'status', old_task.status,
      'blocked_reason', old_task.blocked_reason,
      'checklist_item_id', normalized_item_id,
      'checklist_completed', CASE
        WHEN normalized_item_id IS NULL THEN NULL
        ELSE (
          SELECT (item ->> 'completed')::boolean
          FROM jsonb_array_elements(old_task.checklist) AS item
          WHERE item ->> 'id' = normalized_item_id
          LIMIT 1
        )
      END
    ),
    jsonb_build_object(
      'status', new_task.status,
      'blocked_reason', new_task.blocked_reason,
      'checklist_item_id', normalized_item_id,
      'checklist_completed', p_checklist_completed
    )
  );

  RETURN p_task_id;
END;
$$;

CREATE FUNCTION public.review_maintenance_task_completion(
  p_organization_id uuid,
  p_task_id uuid,
  p_action text,
  p_review_note text DEFAULT NULL
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
  normalized_review_note text := NULLIF(trim(coalesce(p_review_note, '')), '');
  next_status text;
  next_completed_at timestamptz;
  request_status text;
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
    RAISE EXCEPTION 'Manager can only review tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF old_task.status <> 'ready_for_review' THEN
    RAISE EXCEPTION 'Only submitted maintenance work can be reviewed'
      USING ERRCODE = '22023';
  END IF;

  CASE normalized_action
    WHEN 'approve' THEN
      IF normalized_review_note IS NOT NULL AND length(normalized_review_note) > 500 THEN
        RAISE EXCEPTION 'Approval note cannot exceed 500 characters'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'completed';
      next_completed_at := now();
      request_status := 'closed';
      activity_action := 'maintenance_task_completion_approved';

    WHEN 'reopen' THEN
      IF normalized_review_note IS NULL
        OR length(normalized_review_note) < 3
        OR length(normalized_review_note) > 500 THEN
        RAISE EXCEPTION 'Reopen note must be between 3 and 500 characters'
          USING ERRCODE = '22023';
      END IF;
      next_status := 'in_progress';
      next_completed_at := NULL;
      request_status := 'open';
      activity_action := 'maintenance_task_completion_reopened';

    ELSE
      RAISE EXCEPTION 'Maintenance review action is not supported'
        USING ERRCODE = '22023';
  END CASE;

  UPDATE public.tasks
  SET
    status = next_status,
    blocked_reason = NULL,
    completed_at = next_completed_at,
    updated_by = actor_id
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

  UPDATE public.tenant_requests
  SET
    status = request_status,
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
    jsonb_build_object(
      'status', old_task.status,
      'completed_at', old_task.completed_at,
      'blocked_reason', old_task.blocked_reason
    ),
    jsonb_build_object(
      'status', new_task.status,
      'completed_at', new_task.completed_at,
      'blocked_reason', new_task.blocked_reason,
      'review_note', normalized_review_note
    )
  );

  RETURN p_task_id;
END;
$$;

-- Checked definer RPCs are installed before removing the legacy manager write
-- policies so the migration never leaves managers without a valid write path.
DROP POLICY IF EXISTS "Managers can create task requests"
ON public.tenant_requests;
DROP POLICY IF EXISTS "Managers can update task requests"
ON public.tenant_requests;
DROP POLICY IF EXISTS "Managers can create branch tasks"
ON public.tasks;
DROP POLICY IF EXISTS "Managers can update branch tasks"
ON public.tasks;
DROP POLICY IF EXISTS "Managers can create task activity logs"
ON public.activity_logs;

DROP POLICY IF EXISTS "Managers can read branch tasks and members read assigned tasks"
ON public.tasks;
CREATE POLICY "Maintenance roles can read scoped tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = tasks.organization_id
      AND membership.user_id = (SELECT auth.uid())
      AND (
        (
          membership.role = 'manager'
          AND (
            membership.branch_id IS NULL
            OR tasks.branch_id = membership.branch_id
          )
        )
        OR (
          membership.role = 'member'
          AND membership.person_id = tasks.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM tasks.branch_id
        )
      )
  )
);

DROP POLICY IF EXISTS "Managers can read task requests"
ON public.tenant_requests;
CREATE POLICY "Maintenance roles can read scoped task requests"
ON public.tenant_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks AS scoped_task
    JOIN public.organization_members AS membership
      ON membership.organization_id = scoped_task.organization_id
     AND membership.user_id = (SELECT auth.uid())
    WHERE scoped_task.organization_id = tenant_requests.organization_id
      AND scoped_task.tenant_request_id = tenant_requests.id
      AND scoped_task.archived_at IS NULL
      AND (
        (
          membership.role = 'manager'
          AND (
            membership.branch_id IS NULL
            OR scoped_task.branch_id = membership.branch_id
          )
        )
        OR (
          membership.role = 'member'
          AND membership.person_id = scoped_task.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
      )
  )
);

DROP POLICY IF EXISTS "Members can read task activity logs"
ON public.activity_logs;
CREATE POLICY "Maintenance roles can read scoped task activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  activity_logs.entity_type = 'task'
  AND EXISTS (
    SELECT 1
    FROM public.tasks AS scoped_task
    JOIN public.organization_members AS membership
      ON membership.organization_id = scoped_task.organization_id
     AND membership.user_id = (SELECT auth.uid())
    WHERE scoped_task.organization_id = activity_logs.organization_id
      AND scoped_task.id = activity_logs.entity_id
      AND (
        (
          membership.role = 'manager'
          AND (
            membership.branch_id IS NULL
            OR scoped_task.branch_id = membership.branch_id
          )
        )
        OR (
          membership.role = 'member'
          AND membership.person_id = scoped_task.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
      )
  )
);

REVOKE ALL ON FUNCTION public.create_maintenance_task(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  jsonb,
  text,
  uuid,
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_maintenance_task(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  numeric,
  public.currency_code,
  jsonb,
  text,
  boolean,
  uuid,
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_assigned_maintenance_task(
  uuid,
  uuid,
  text,
  text,
  boolean,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_maintenance_task_completion(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_maintenance_task(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  jsonb,
  text,
  uuid,
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_maintenance_task(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  date,
  time,
  uuid,
  numeric,
  public.currency_code,
  numeric,
  public.currency_code,
  jsonb,
  text,
  boolean,
  uuid,
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_assigned_maintenance_task(
  uuid,
  uuid,
  text,
  text,
  boolean,
  text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_maintenance_task_completion(
  uuid,
  uuid,
  text,
  text
) TO authenticated;
