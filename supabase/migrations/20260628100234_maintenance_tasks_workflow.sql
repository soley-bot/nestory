-- Maintenance/issues workflow.
-- Starts with the roadmap-backed request/task model while presenting tasks as
-- maintenance cases in the app.

CREATE TABLE public.tenant_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  request_type text NOT NULL DEFAULT 'maintenance',
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_requests_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT tenant_requests_type_check CHECK (
    request_type IN ('maintenance', 'inspection', 'incident', 'general')
  ),
  CONSTRAINT tenant_requests_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT tenant_requests_status_check CHECK (
    status IN ('open', 'in_review', 'closed', 'cancelled')
  ),
  CONSTRAINT tenant_requests_title_not_blank_check CHECK (length(trim(title)) > 0),
  CONSTRAINT tenant_requests_category_not_blank_check CHECK (length(trim(category)) > 0)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_request_id uuid NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  due_time time,
  reminder_date date,
  reminder_time time,
  vendor_person_id uuid,
  cost_estimate_amount numeric(14, 2),
  cost_estimate_currency public.currency_code,
  actual_cost_amount numeric(14, 2),
  actual_cost_currency public.currency_code,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence_frequency text NOT NULL DEFAULT 'none',
  ledger_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  timeline_event_id uuid REFERENCES public.timeline_events(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tasks_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT tasks_request_fk
    FOREIGN KEY (tenant_request_id)
    REFERENCES public.tenant_requests(id)
    ON DELETE CASCADE,
  CONSTRAINT tasks_property_fk
    FOREIGN KEY (property_id)
    REFERENCES public.properties(id)
    ON DELETE CASCADE,
  CONSTRAINT tasks_unit_fk
    FOREIGN KEY (unit_id)
    REFERENCES public.units(id)
    ON DELETE SET NULL,
  CONSTRAINT tasks_vendor_person_fk
    FOREIGN KEY (vendor_person_id)
    REFERENCES public.people(id)
    ON DELETE SET NULL,
  CONSTRAINT tasks_title_not_blank_check CHECK (length(trim(title)) > 0),
  CONSTRAINT tasks_category_not_blank_check CHECK (length(trim(category)) > 0),
  CONSTRAINT tasks_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT tasks_status_check CHECK (
    status IN ('pending', 'scheduled', 'in_progress', 'blocked', 'completed', 'cancelled')
  ),
  CONSTRAINT tasks_due_time_requires_date_check CHECK (
    due_time IS NULL OR due_date IS NOT NULL
  ),
  CONSTRAINT tasks_reminder_time_requires_date_check CHECK (
    reminder_time IS NULL OR reminder_date IS NOT NULL
  ),
  CONSTRAINT tasks_estimate_non_negative_check CHECK (
    cost_estimate_amount IS NULL OR cost_estimate_amount >= 0
  ),
  CONSTRAINT tasks_actual_cost_non_negative_check CHECK (
    actual_cost_amount IS NULL OR actual_cost_amount >= 0
  ),
  CONSTRAINT tasks_estimate_currency_pair_check CHECK (
    (cost_estimate_amount IS NULL AND cost_estimate_currency IS NULL)
    OR (cost_estimate_amount IS NOT NULL AND cost_estimate_currency IS NOT NULL)
  ),
  CONSTRAINT tasks_actual_cost_currency_pair_check CHECK (
    (actual_cost_amount IS NULL AND actual_cost_currency IS NULL)
    OR (actual_cost_amount IS NOT NULL AND actual_cost_currency IS NOT NULL)
  ),
  CONSTRAINT tasks_checklist_array_check CHECK (jsonb_typeof(checklist) = 'array'),
  CONSTRAINT tasks_recurrence_frequency_check CHECK (
    recurrence_frequency IN ('none', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual')
  )
);

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS tenant_request_id uuid,
  ADD COLUMN IF NOT EXISTS task_id uuid,
  ADD CONSTRAINT documents_tenant_request_fk
    FOREIGN KEY (tenant_request_id)
    REFERENCES public.tenant_requests(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT documents_task_fk
    FOREIGN KEY (task_id)
    REFERENCES public.tasks(id)
    ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_tenant_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE organization_id = NEW.organization_id
      AND id = NEW.unit_id
      AND property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Request unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_task_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_request record;
BEGIN
  SELECT property_id, unit_id
  INTO linked_request
  FROM public.tenant_requests
  WHERE organization_id = NEW.organization_id
    AND id = NEW.tenant_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task request not found' USING ERRCODE = '23503';
  END IF;

  IF linked_request.property_id <> NEW.property_id THEN
    RAISE EXCEPTION 'Task property must match the request property'
      USING ERRCODE = '23503';
  END IF;

  IF linked_request.unit_id IS NOT NULL
    AND NEW.unit_id IS DISTINCT FROM linked_request.unit_id THEN
    RAISE EXCEPTION 'Task unit must match the request unit'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE organization_id = NEW.organization_id
      AND id = NEW.unit_id
      AND property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Task unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE organization_id = NEW.organization_id
      AND id = NEW.vendor_person_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor/person link not found'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tenant_requests_scope
BEFORE INSERT OR UPDATE OF organization_id, property_id, unit_id
ON public.tenant_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_request_scope();

CREATE TRIGGER validate_tasks_scope
BEFORE INSERT OR UPDATE OF
  organization_id,
  tenant_request_id,
  property_id,
  unit_id,
  vendor_person_id
ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_task_scope();

CREATE TRIGGER set_tenant_requests_updated_at
BEFORE UPDATE ON public.tenant_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant requests"
ON public.tenant_requests
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage tasks"
ON public.tasks
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

REVOKE ALL ON public.tenant_requests, public.tasks FROM anon;
REVOKE ALL ON public.tenant_requests, public.tasks FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_requests, public.tasks TO authenticated;
GRANT ALL PRIVILEGES ON public.tenant_requests, public.tasks TO service_role;

CREATE INDEX tenant_requests_org_status_requested_idx
  ON public.tenant_requests (organization_id, status, requested_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX tenant_requests_org_property_unit_requested_idx
  ON public.tenant_requests (organization_id, property_id, unit_id, requested_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX tenant_requests_org_category_requested_idx
  ON public.tenant_requests (organization_id, category, requested_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX tenant_requests_created_by_idx ON public.tenant_requests (created_by);
CREATE INDEX tenant_requests_updated_by_idx ON public.tenant_requests (updated_by);
CREATE INDEX tenant_requests_archived_by_idx ON public.tenant_requests (archived_by);

CREATE INDEX tasks_org_status_due_idx
  ON public.tasks (organization_id, status, due_date, due_time)
  WHERE archived_at IS NULL;
CREATE INDEX tasks_org_property_unit_created_idx
  ON public.tasks (organization_id, property_id, unit_id, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX tasks_org_category_created_idx
  ON public.tasks (organization_id, category, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX tasks_org_priority_status_idx
  ON public.tasks (organization_id, priority, status)
  WHERE archived_at IS NULL;
CREATE INDEX tasks_org_vendor_status_due_idx
  ON public.tasks (organization_id, vendor_person_id, status, due_date)
  WHERE vendor_person_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX tasks_tenant_request_id_idx ON public.tasks (tenant_request_id);
CREATE INDEX tasks_ledger_entry_id_idx ON public.tasks (ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;
CREATE INDEX tasks_timeline_event_id_idx ON public.tasks (timeline_event_id)
  WHERE timeline_event_id IS NOT NULL;
CREATE INDEX tasks_created_by_idx ON public.tasks (created_by);
CREATE INDEX tasks_updated_by_idx ON public.tasks (updated_by);
CREATE INDEX tasks_archived_by_idx ON public.tasks (archived_by);

CREATE INDEX documents_tenant_request_id_idx ON public.documents (tenant_request_id)
  WHERE tenant_request_id IS NOT NULL;
CREATE INDEX documents_task_id_idx ON public.documents (task_id)
  WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.maintenance_timeline_event_type(
  category text,
  title text
)
RETURNS public.timeline_event_type
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(coalesce(category, '') || ' ' || coalesce(title, ''));
BEGIN
  IF normalized LIKE '%renovation%' THEN
    RETURN 'Renovation'::public.timeline_event_type;
  END IF;

  IF normalized LIKE '%repair%' THEN
    RETURN 'Repair'::public.timeline_event_type;
  END IF;

  IF normalized LIKE '%inspection%' THEN
    RETURN 'Inspection'::public.timeline_event_type;
  END IF;

  RETURN 'Maintenance'::public.timeline_event_type;
END;
$$;

REVOKE ALL ON FUNCTION app_private.maintenance_timeline_event_type(text, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.maintenance_timeline_event_type(text, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_maintenance_task(
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
  p_recurrence_frequency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
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
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND property_id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_vendor_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor/person not found' USING ERRCODE = '23503';
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
    'completed',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'Status is not supported' USING ERRCODE = '22023';
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
    CASE
      WHEN normalized_status = 'cancelled' THEN 'cancelled'
      WHEN normalized_status = 'completed' THEN 'closed'
      ELSE 'open'
    END,
    (SELECT auth.uid()),
    (SELECT auth.uid())
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
    completed_at,
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
    CASE WHEN normalized_status = 'completed' THEN now() ELSE NULL END,
    (SELECT auth.uid()),
    (SELECT auth.uid())
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
    (SELECT auth.uid()),
    (SELECT auth.uid())
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
    (SELECT auth.uid()),
    'tenant_request',
    new_request_id,
    'maintenance_request_created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'title', normalized_title,
      'category', normalized_category,
      'priority', normalized_priority,
      'status', CASE
        WHEN normalized_status = 'cancelled' THEN 'cancelled'
        WHEN normalized_status = 'completed' THEN 'closed'
        ELSE 'open'
      END
    )
  ),
  (
    p_organization_id,
    (SELECT auth.uid()),
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
      'recurrence_frequency', normalized_recurrence
    )
  );

  RETURN new_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_maintenance_task(
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
  p_link_actual_cost_to_ledger boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
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
  timeline_cost_amount numeric;
  timeline_cost_currency public.currency_code;
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

  IF old_task.property_id <> p_property_id THEN
    RAISE EXCEPTION 'Maintenance task property cannot be changed'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND property_id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_vendor_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor/person not found' USING ERRCODE = '23503';
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
    'completed',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'Status is not supported' USING ERRCODE = '22023';
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
  timeline_cost_amount := p_actual_cost_amount;
  timeline_cost_currency := p_actual_cost_currency;

  IF coalesce(p_link_actual_cost_to_ledger, false)
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
        (SELECT auth.uid()),
        (SELECT auth.uid())
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
        (SELECT auth.uid()),
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
        updated_by = (SELECT auth.uid())
      WHERE id = new_ledger_entry_id
        AND organization_id = p_organization_id;
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
      timeline_cost_amount,
      timeline_cost_currency,
      (SELECT auth.uid()),
      (SELECT auth.uid())
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
      cost_amount = timeline_cost_amount,
      cost_currency = timeline_cost_currency,
      updated_by = (SELECT auth.uid())
    WHERE id = new_timeline_event_id
      AND organization_id = p_organization_id;
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
    completed_at = CASE
      WHEN normalized_status = 'completed' THEN coalesce(old_task.completed_at, now())
      ELSE NULL
    END,
    updated_by = (SELECT auth.uid())
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
    updated_by = (SELECT auth.uid())
  WHERE id = old_task.tenant_request_id
    AND organization_id = p_organization_id;

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
      'recurrence_frequency', old_task.recurrence_frequency
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
      'recurrence_frequency', new_task.recurrence_frequency
    )
  );

  RETURN p_task_id;
END;
$$;

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
  text
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
  boolean
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
  text
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
  boolean
) TO authenticated;
