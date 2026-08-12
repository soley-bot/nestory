-- Tracks 7, 8, and 10 share one operational authority boundary:
-- setup readiness composes existing records, maintenance evidence reuses the
-- exclusive paid-cost registrar, and recurrence/delivery remain durable when
-- no browser is open.

ALTER TABLE public.organizations
  ADD COLUMN operational_timezone text NOT NULL DEFAULT 'UTC'
  CHECK (length(btrim(operational_timezone)) BETWEEN 1 AND 100);

CREATE TABLE public.maintenance_recurrence_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.organization_branches(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  lifecycle text NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('active', 'paused', 'retired')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  retired_at timestamptz,
  retired_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE TABLE public.maintenance_recurrence_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  series_id uuid NOT NULL REFERENCES public.maintenance_recurrence_series(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  frequency text NOT NULL CHECK (
    frequency IN ('weekly', 'monthly', 'quarterly', 'semi_annual', 'annual')
  ),
  timezone text NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 100),
  next_occurrence_at timestamptz NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 140),
  description text,
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 2 AND 80),
  priority text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  vendor_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  cost_estimate_amount numeric(14, 2) CHECK (cost_estimate_amount >= 0),
  cost_estimate_currency public.currency_code,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
  assignee_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  reminder_offset_minutes integer CHECK (reminder_offset_minutes >= 0),
  effective_from timestamptz NOT NULL,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (series_id, revision_number),
  CHECK ((cost_estimate_amount IS NULL) = (cost_estimate_currency IS NULL))
);

CREATE UNIQUE INDEX maintenance_recurrence_one_current_revision_idx
  ON public.maintenance_recurrence_revisions(series_id)
  WHERE superseded_at IS NULL;
CREATE INDEX maintenance_recurrence_due_idx
  ON public.maintenance_recurrence_revisions(next_occurrence_at, organization_id)
  WHERE superseded_at IS NULL;

ALTER TABLE public.tasks
  ADD COLUMN recurrence_series_id uuid
    REFERENCES public.maintenance_recurrence_series(id) ON DELETE RESTRICT,
  ADD COLUMN recurrence_revision_id uuid
    REFERENCES public.maintenance_recurrence_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN recurrence_occurrence_at timestamptz;

CREATE UNIQUE INDEX tasks_recurrence_occurrence_once_idx
  ON public.tasks(organization_id, recurrence_series_id, recurrence_occurrence_at)
  WHERE recurrence_series_id IS NOT NULL
    AND recurrence_occurrence_at IS NOT NULL;

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.organization_branches(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT,
  recipient_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  event_key text NOT NULL CHECK (length(btrim(event_key)) BETWEEN 8 AND 240),
  event_type text NOT NULL CHECK (event_type IN ('maintenance_reminder')),
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'retry', 'dead', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (organization_id, event_key)
);

CREATE INDEX notification_outbox_due_idx
  ON public.notification_outbox(next_attempt_at, scheduled_for)
  WHERE status IN ('pending', 'retry');

CREATE TABLE public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.notification_outbox(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  attempted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  outcome text NOT NULL CHECK (outcome IN ('delivered', 'retry', 'dead')),
  error_message text,
  UNIQUE (outbox_id, attempt_number)
);

ALTER TABLE public.maintenance_recurrence_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_recurrence_series FORCE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_recurrence_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_recurrence_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.maintenance_recurrence_series
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.maintenance_recurrence_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.notification_outbox
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.notification_delivery_attempts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.next_maintenance_occurrence(
  p_occurrence_at timestamptz,
  p_frequency text,
  p_timezone text
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT (
    pg_catalog.timezone(p_timezone, p_occurrence_at) +
    CASE p_frequency
      WHEN 'weekly' THEN interval '7 days'
      WHEN 'monthly' THEN interval '1 month'
      WHEN 'quarterly' THEN interval '3 months'
      WHEN 'semi_annual' THEN interval '6 months'
      WHEN 'annual' THEN interval '1 year'
      ELSE interval '0 seconds'
    END
  ) AT TIME ZONE p_timezone;
$$;

ALTER FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, jsonb, text, uuid, uuid
) RENAME TO create_maintenance_task_baseline_track10;
ALTER FUNCTION public.create_maintenance_task_baseline_track10(
  uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, jsonb, text, uuid, uuid
) SET SCHEMA app_private;

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
  p_due_time time without time zone,
  p_reminder_date date,
  p_reminder_time time without time zone,
  p_vendor_person_id uuid,
  p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,
  p_checklist jsonb,
  p_recurrence_frequency text,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_frequency text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_recurrence_frequency, 'none')));
  v_task_id uuid;
  v_series_id uuid;
  v_revision_id uuid;
  v_timezone text;
  v_first_occurrence timestamptz;
  v_reminder_occurrence timestamptz;
  v_reminder_offset integer;
BEGIN
  IF v_frequency <> 'none' AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Recurring maintenance requires the first due date'
      USING ERRCODE = '22023';
  END IF;

  v_task_id := app_private.create_maintenance_task_baseline_track10(
    p_organization_id, p_property_id, p_unit_id, p_title, p_description,
    p_category, p_priority, p_status, p_due_date, p_due_time,
    p_reminder_date, p_reminder_time, p_vendor_person_id,
    p_cost_estimate_amount, p_cost_estimate_currency, p_checklist,
    p_recurrence_frequency, p_branch_id, p_assignee_person_id
  );

  IF v_frequency = 'none' THEN
    RETURN v_task_id;
  END IF;

  SELECT organization.operational_timezone
  INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;

  v_first_occurrence := (
    p_due_date + coalesce(p_due_time, '00:00'::time)
  ) AT TIME ZONE v_timezone;
  IF p_reminder_date IS NOT NULL THEN
    v_reminder_occurrence := (
      p_reminder_date + coalesce(p_reminder_time, '00:00'::time)
    ) AT TIME ZONE v_timezone;
    IF v_reminder_occurrence <= v_first_occurrence THEN
      v_reminder_offset := pg_catalog.floor(
        extract(epoch FROM (v_first_occurrence - v_reminder_occurrence)) / 60
      )::integer;
    END IF;
  END IF;

  INSERT INTO public.maintenance_recurrence_series (
    organization_id, branch_id, property_id, unit_id, created_by
  ) VALUES (
    p_organization_id, p_branch_id, p_property_id, p_unit_id, v_actor_id
  ) RETURNING id INTO v_series_id;

  INSERT INTO public.maintenance_recurrence_revisions (
    organization_id, series_id, revision_number, frequency, timezone,
    next_occurrence_at, title, description, category, priority,
    vendor_person_id, cost_estimate_amount, cost_estimate_currency,
    checklist, assignee_person_id, reminder_offset_minutes, effective_from,
    created_by
  ) VALUES (
    p_organization_id, v_series_id, 1, v_frequency, v_timezone,
    app_private.next_maintenance_occurrence(
      v_first_occurrence, v_frequency, v_timezone
    ),
    pg_catalog.btrim(p_title), nullif(pg_catalog.btrim(coalesce(p_description, '')), ''),
    pg_catalog.btrim(p_category), pg_catalog.lower(pg_catalog.btrim(p_priority)),
    p_vendor_person_id, p_cost_estimate_amount, p_cost_estimate_currency,
    coalesce(p_checklist, '[]'::jsonb), p_assignee_person_id,
    v_reminder_offset, v_first_occurrence, v_actor_id
  ) RETURNING id INTO v_revision_id;

  UPDATE public.tasks
  SET recurrence_series_id = v_series_id,
      recurrence_revision_id = v_revision_id,
      recurrence_occurrence_at = v_first_occurrence
  WHERE id = v_task_id
    AND organization_id = p_organization_id;

  RETURN v_task_id;
END;
$$;

ALTER FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, jsonb, text, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, jsonb, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_maintenance_task(
  uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, jsonb, text, uuid, uuid
) TO authenticated;

ALTER FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, numeric, public.currency_code, jsonb, text, uuid, uuid
) RENAME TO update_maintenance_task_baseline_track10;
ALTER FUNCTION public.update_maintenance_task_baseline_track10(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, numeric, public.currency_code, jsonb, text, uuid, uuid
) SET SCHEMA app_private;

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
  p_due_time time without time zone,
  p_reminder_date date,
  p_reminder_time time without time zone,
  p_vendor_person_id uuid,
  p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,
  p_actual_cost_amount numeric,
  p_actual_cost_currency public.currency_code,
  p_checklist jsonb,
  p_recurrence_frequency text,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_frequency text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_recurrence_frequency, 'none')));
  v_task_id uuid;
  v_old_revision_id uuid;
  v_series_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_timezone text;
  v_effective_occurrence timestamptz;
  v_next_occurrence timestamptz;
  v_reminder_occurrence timestamptz;
  v_reminder_offset integer;
BEGIN
  IF v_frequency <> 'none' AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'Recurring maintenance requires the first due date'
      USING ERRCODE = '22023';
  END IF;

  v_task_id := app_private.update_maintenance_task_baseline_track10(
    p_task_id, p_organization_id, p_property_id, p_unit_id, p_title,
    p_description, p_category, p_priority, p_status, p_due_date, p_due_time,
    p_reminder_date, p_reminder_time, p_vendor_person_id,
    p_cost_estimate_amount, p_cost_estimate_currency, p_actual_cost_amount,
    p_actual_cost_currency, p_checklist, p_recurrence_frequency, p_branch_id,
    p_assignee_person_id
  );

  SELECT task.recurrence_revision_id
  INTO v_old_revision_id
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.id = v_task_id
  FOR UPDATE;

  IF v_old_revision_id IS NOT NULL THEN
    SELECT revision.series_id
    INTO STRICT v_series_id
    FROM public.maintenance_recurrence_revisions AS revision
    JOIN public.maintenance_recurrence_series AS series
      ON series.id = revision.series_id
     AND series.organization_id = revision.organization_id
    WHERE revision.organization_id = p_organization_id
      AND revision.id = v_old_revision_id
    FOR UPDATE OF series;
  END IF;

  IF v_frequency = 'none' THEN
    IF v_series_id IS NOT NULL THEN
      UPDATE public.maintenance_recurrence_revisions
      SET superseded_at = statement_timestamp(), superseded_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND series_id = v_series_id
        AND superseded_at IS NULL;
      UPDATE public.maintenance_recurrence_series
      SET lifecycle = 'retired', retired_at = statement_timestamp(),
          retired_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND id = v_series_id;
    END IF;
    RETURN v_task_id;
  END IF;

  SELECT organization.operational_timezone
  INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  v_effective_occurrence := (
    p_due_date + coalesce(p_due_time, '00:00'::time)
  ) AT TIME ZONE v_timezone;
  v_next_occurrence := app_private.next_maintenance_occurrence(
    v_effective_occurrence, v_frequency, v_timezone
  );
  IF p_reminder_date IS NOT NULL THEN
    v_reminder_occurrence := (
      p_reminder_date + coalesce(p_reminder_time, '00:00'::time)
    ) AT TIME ZONE v_timezone;
    IF v_reminder_occurrence <= v_effective_occurrence THEN
      v_reminder_offset := pg_catalog.floor(
        extract(epoch FROM (v_effective_occurrence - v_reminder_occurrence)) / 60
      )::integer;
    END IF;
  END IF;

  IF v_series_id IS NULL THEN
    INSERT INTO public.maintenance_recurrence_series (
      organization_id, branch_id, property_id, unit_id, created_by
    ) VALUES (
      p_organization_id, p_branch_id, p_property_id, p_unit_id, v_actor_id
    ) RETURNING id INTO v_series_id;
    v_revision_number := 1;
  ELSE
    UPDATE public.maintenance_recurrence_series
    SET branch_id = p_branch_id, property_id = p_property_id,
        unit_id = p_unit_id, lifecycle = 'active', retired_at = NULL,
        retired_by = NULL
    WHERE organization_id = p_organization_id
      AND id = v_series_id;
    UPDATE public.maintenance_recurrence_revisions
    SET superseded_at = statement_timestamp(), superseded_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND series_id = v_series_id
      AND superseded_at IS NULL;
    SELECT coalesce(max(revision.revision_number), 0) + 1
    INTO v_revision_number
    FROM public.maintenance_recurrence_revisions AS revision
    WHERE revision.organization_id = p_organization_id
      AND revision.series_id = v_series_id;
  END IF;

  INSERT INTO public.maintenance_recurrence_revisions (
    organization_id, series_id, revision_number, frequency, timezone,
    next_occurrence_at, title, description, category, priority,
    vendor_person_id, cost_estimate_amount, cost_estimate_currency,
    checklist, assignee_person_id, reminder_offset_minutes, effective_from,
    created_by
  ) VALUES (
    p_organization_id, v_series_id, v_revision_number, v_frequency, v_timezone,
    v_next_occurrence, pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(coalesce(p_description, '')), ''),
    pg_catalog.btrim(p_category), pg_catalog.lower(pg_catalog.btrim(p_priority)),
    p_vendor_person_id, p_cost_estimate_amount, p_cost_estimate_currency,
    coalesce(p_checklist, '[]'::jsonb), p_assignee_person_id,
    v_reminder_offset, v_effective_occurrence, v_actor_id
  ) RETURNING id INTO v_revision_id;

  UPDATE public.tasks
  SET recurrence_series_id = v_series_id,
      recurrence_revision_id = v_revision_id,
      recurrence_occurrence_at = v_effective_occurrence
  WHERE organization_id = p_organization_id
    AND id = v_task_id;

  RETURN v_task_id;
END;
$$;

ALTER FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, numeric, public.currency_code, jsonb, text, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, numeric, public.currency_code, jsonb, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date,
  time without time zone, date, time without time zone, uuid, numeric,
  public.currency_code, numeric, public.currency_code, jsonb, text, uuid, uuid
) TO authenticated;

CREATE FUNCTION app_private.enqueue_maintenance_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_timezone text;
  v_scheduled_for timestamptz;
  v_event_key text;
BEGIN
  IF NEW.reminder_date IS NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization.operational_timezone
  INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = NEW.organization_id;
  v_scheduled_for := (
    NEW.reminder_date + coalesce(NEW.reminder_time, '00:00'::time)
  ) AT TIME ZONE v_timezone;
  v_event_key := pg_catalog.concat_ws(
    ':', 'maintenance-reminder-v1', NEW.id, v_scheduled_for
  );

  UPDATE public.notification_outbox
  SET status = 'cancelled',
      updated_at = statement_timestamp()
  WHERE organization_id = NEW.organization_id
    AND task_id = NEW.id
    AND event_type = 'maintenance_reminder'
    AND event_key <> v_event_key
    AND status IN ('pending', 'retry');

  INSERT INTO public.notification_outbox (
    organization_id, branch_id, task_id, recipient_person_id, event_key,
    event_type, payload, scheduled_for, next_attempt_at
  ) VALUES (
    NEW.organization_id, NEW.branch_id, NEW.id, NEW.assignee_person_id,
    v_event_key, 'maintenance_reminder',
    pg_catalog.jsonb_build_object(
      'title', NEW.title,
      'href', '/maintenance?archiveState=all&taskId=' || NEW.id::text,
      'propertyId', NEW.property_id,
      'unitId', NEW.unit_id
    ),
    v_scheduled_for, v_scheduled_for
  ) ON CONFLICT (organization_id, event_key) DO UPDATE
    SET branch_id = EXCLUDED.branch_id,
        recipient_person_id = EXCLUDED.recipient_person_id,
        payload = EXCLUDED.payload,
        scheduled_for = EXCLUDED.scheduled_for,
        next_attempt_at = EXCLUDED.next_attempt_at,
        updated_at = statement_timestamp();

  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_maintenance_reminder_after_write
AFTER INSERT OR UPDATE OF reminder_date, reminder_time, branch_id,
  assignee_person_id, title, archived_at
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION app_private.enqueue_maintenance_reminder();

CREATE FUNCTION public.run_maintenance_automation(
  p_run_at timestamptz,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_revision record;
  v_occurrence_at timestamptz;
  v_local_occurrence timestamp without time zone;
  v_reminder_at timestamptz;
  v_local_reminder timestamp without time zone;
  v_request_id uuid;
  v_task_id uuid;
  v_timeline_event_id uuid;
  v_generated integer := 0;
  v_delivered integer := 0;
  v_outbox record;
BEGIN
  IF p_run_at IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid maintenance automation boundary'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('maintenance_automation_v1', 0)
  );

  FOR v_revision IN
    SELECT revision.*, series.branch_id, series.property_id, series.unit_id,
      series.created_by AS series_created_by
    FROM public.maintenance_recurrence_revisions AS revision
    JOIN public.maintenance_recurrence_series AS series
      ON series.id = revision.series_id
     AND series.organization_id = revision.organization_id
    WHERE revision.superseded_at IS NULL
      AND series.lifecycle = 'active'
      AND revision.next_occurrence_at <= p_run_at
    ORDER BY revision.next_occurrence_at, revision.id
    FOR UPDATE OF revision SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_occurrence_at := v_revision.next_occurrence_at;
    WHILE v_occurrence_at <= p_run_at AND v_generated < p_limit LOOP
    v_task_id := NULL;
    v_timeline_event_id := NULL;
    v_local_occurrence := pg_catalog.timezone(
      v_revision.timezone, v_occurrence_at
    );
    IF v_revision.reminder_offset_minutes IS NOT NULL THEN
      v_reminder_at := v_occurrence_at -
        pg_catalog.make_interval(mins => v_revision.reminder_offset_minutes);
      v_local_reminder := pg_catalog.timezone(v_revision.timezone, v_reminder_at);
    ELSE
      v_reminder_at := NULL;
      v_local_reminder := NULL;
    END IF;

    INSERT INTO public.tenant_requests (
      organization_id, property_id, unit_id, request_type, title,
      description, category, priority, status, created_by, updated_by
    ) VALUES (
      v_revision.organization_id, v_revision.property_id, v_revision.unit_id,
      'maintenance', v_revision.title, v_revision.description,
      v_revision.category, v_revision.priority, 'open',
      v_revision.series_created_by, v_revision.series_created_by
    ) RETURNING id INTO v_request_id;

    INSERT INTO public.tasks (
      organization_id, tenant_request_id, property_id, unit_id, title,
      description, category, priority, status, due_date, due_time,
      reminder_date, reminder_time, vendor_person_id, cost_estimate_amount,
      cost_estimate_currency, checklist, recurrence_frequency, branch_id,
      assignee_person_id, recurrence_series_id, recurrence_revision_id,
      recurrence_occurrence_at,
      created_by, updated_by
    ) VALUES (
      v_revision.organization_id, v_request_id, v_revision.property_id,
      v_revision.unit_id, v_revision.title, v_revision.description,
      v_revision.category, v_revision.priority, 'scheduled',
      v_local_occurrence::date, v_local_occurrence::time,
      v_local_reminder::date, v_local_reminder::time,
      v_revision.vendor_person_id, v_revision.cost_estimate_amount,
      v_revision.cost_estimate_currency, v_revision.checklist,
      v_revision.frequency, v_revision.branch_id,
      v_revision.assignee_person_id, v_revision.series_id, v_revision.id,
      v_occurrence_at,
      v_revision.series_created_by, v_revision.series_created_by
    ) ON CONFLICT (
      organization_id, recurrence_series_id, recurrence_occurrence_at
    ) WHERE recurrence_series_id IS NOT NULL
      AND recurrence_occurrence_at IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_task_id;

    IF v_task_id IS NOT NULL THEN
      INSERT INTO public.timeline_events (
        organization_id, property_id, unit_id, event_date, event_type,
        title, description, created_by, updated_by
      ) VALUES (
        v_revision.organization_id, v_revision.property_id,
        v_revision.unit_id, v_local_occurrence::date,
        app_private.maintenance_timeline_event_type(
          v_revision.category, v_revision.title
        ),
        'Maintenance case: ' || v_revision.title, v_revision.description,
        v_revision.series_created_by, v_revision.series_created_by
      ) RETURNING id INTO v_timeline_event_id;

      UPDATE public.tasks
      SET timeline_event_id = v_timeline_event_id
      WHERE id = v_task_id;

      INSERT INTO public.activity_logs (
        organization_id, actor_id, entity_type, entity_id, action, new_values
      ) VALUES (
        v_revision.organization_id, v_revision.series_created_by,
        'task', v_task_id, 'maintenance_recurrence_generated',
        pg_catalog.jsonb_build_object(
          'recurrence_revision_id', v_revision.id,
          'occurrence_at', v_occurrence_at
        )
      );
      v_generated := v_generated + 1;
    ELSE
      DELETE FROM public.tenant_requests AS request
      WHERE request.organization_id = v_revision.organization_id
        AND request.id = v_request_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.tasks AS task
          WHERE task.organization_id = request.organization_id
            AND task.tenant_request_id = request.id
        );
    END IF;

    v_occurrence_at := app_private.next_maintenance_occurrence(
      v_occurrence_at, v_revision.frequency, v_revision.timezone
    );
    END LOOP;

    UPDATE public.maintenance_recurrence_revisions
    SET next_occurrence_at = v_occurrence_at
    WHERE id = v_revision.id;

    EXIT WHEN v_generated >= p_limit;
  END LOOP;

  FOR v_outbox IN
    SELECT outbox.id, outbox.attempt_count
    FROM public.notification_outbox AS outbox
    WHERE outbox.status IN ('pending', 'retry')
      AND outbox.scheduled_for <= p_run_at
      AND outbox.next_attempt_at <= p_run_at
    ORDER BY outbox.next_attempt_at, outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE public.notification_outbox
    SET status = 'delivered',
        attempt_count = v_outbox.attempt_count + 1,
        claimed_at = p_run_at,
        delivered_at = p_run_at,
        last_error = NULL,
        updated_at = statement_timestamp()
    WHERE id = v_outbox.id;

    INSERT INTO public.notification_delivery_attempts (
      outbox_id, attempt_number, attempted_at, outcome
    ) VALUES (
      v_outbox.id, v_outbox.attempt_count + 1, p_run_at, 'delivered'
    ) ON CONFLICT (outbox_id, attempt_number) DO NOTHING;
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'generated', v_generated,
    'delivered', v_delivered,
    'run_at', p_run_at
  );
END;
$$;

ALTER FUNCTION public.run_maintenance_automation(timestamptz, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_maintenance_automation(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_maintenance_automation(timestamptz, integer)
  TO service_role;

CREATE FUNCTION public.get_maintenance_notification_feed(
  p_organization_id uuid,
  p_limit integer DEFAULT 20
) RETURNS TABLE(
  id uuid,
  event_type text,
  title text,
  scheduled_for timestamptz,
  status text,
  href text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role text := app_private.current_workspace_role(p_organization_id);
  v_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
  v_person_id uuid := app_private.current_org_person_id(p_organization_id);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('super_admin', 'operations_manager', 'operations_member') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid notification limit' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT outbox.id, outbox.event_type, outbox.payload->>'title',
    outbox.scheduled_for, outbox.status, outbox.payload->>'href'
  FROM public.notification_outbox AS outbox
  WHERE outbox.organization_id = p_organization_id
    AND outbox.status = 'delivered'
    AND (
      v_role = 'super_admin'
      OR (
        v_role = 'operations_manager'
        AND outbox.branch_id = v_branch_id
      )
      OR (
        v_role = 'operations_member'
        AND v_person_id IS NOT NULL
        AND outbox.recipient_person_id = v_person_id
        AND (outbox.branch_id IS NULL OR outbox.branch_id = v_branch_id)
      )
    )
  ORDER BY outbox.scheduled_for DESC, outbox.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_notification_feed(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_notification_feed(uuid, integer)
  TO authenticated;

CREATE FUNCTION public.get_ips_setup_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_effective_date date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_property_ready boolean;
  v_unit_ready boolean;
  v_owner_ready boolean;
  v_lease_ready boolean;
  v_occupancy_ready boolean;
  v_billing_ready boolean;
  v_policy_ready boolean;
  v_opening_ready boolean;
  v_deposit_ready boolean;
  v_owner_count integer := 0;
  v_opening_count integer := 0;
  v_deposit_amount numeric := 0;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_manage_operations(p_organization_id)
    AND NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Choose a readiness date' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) INTO v_property_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'property', 'label', 'Property record', 'ready', v_property_ready,
    'repairHref', '/properties'
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.units AS unit
    WHERE unit.organization_id = p_organization_id
      AND unit.property_id = p_property_id
      AND unit.id = p_unit_id
      AND unit.archived_at IS NULL
  ) INTO v_unit_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'unit', 'label', 'Unit record', 'ready', v_unit_ready,
    'repairHref', '/properties/' || coalesce(p_property_id::text, '')
  ));

  SELECT NOT EXISTS (
    SELECT 1
    FROM app_private.owner_roster_legacy_preflight(p_effective_date) AS issue
    WHERE issue.organization_id = p_organization_id
      AND issue.property_id = p_property_id
      AND issue.issue_code IS NOT NULL
  ) AND EXISTS (
    SELECT 1 FROM public.property_owners AS owner
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND owner.archived_at IS NULL
      AND owner.effective_range @> p_effective_date
  ) INTO v_owner_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'owner_roster', 'label', 'Owner roster', 'ready', v_owner_ready,
    'repairHref', '/properties/' || coalesce(p_property_id::text, '')
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.current_leases AS lease
    WHERE lease.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease.unit_id = p_unit_id
      AND lease.id = p_lease_id
      AND lease.archived_at IS NULL
      AND lease.status IN ('active', 'notice_given')
  ), coalesce(max(lease.deposit_amount), 0)
  INTO v_lease_ready, v_deposit_amount
  FROM public.current_leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'lease', 'label', 'Active lease', 'ready', v_lease_ready,
    'repairHref', '/leases'
  ));

  SELECT EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN public.lease_occupancy_participants AS participant
      ON participant.organization_id = occupancy.organization_id
     AND participant.lease_occupancy_id = occupancy.id
     AND participant.business_lifecycle = 'current'
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.lease_id = p_lease_id
      AND occupancy.business_lifecycle = 'current'
      AND occupancy.archived_at IS NULL
  ) INTO v_occupancy_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'occupancy', 'label', 'Resident and occupancy facts',
    'ready', v_occupancy_ready, 'repairHref', '/leases'
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.archived_at IS NULL
      AND billing.superseded_at IS NULL
      AND billing.effective_range @> p_effective_date
      AND billing.confirmed_at IS NOT NULL
  ) INTO v_billing_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'billing', 'label', 'Billing terms', 'ready', v_billing_ready,
    'repairHref', '/rent-income?leaseId=' || coalesce(p_lease_id::text, '') || '&action=billing'
  ));

  SELECT readiness.readiness_status = 'ready', readiness.reason_code
  INTO v_policy_ready, v_reason
  FROM public.resolve_lease_rent_readiness(
    p_organization_id, p_lease_id, p_effective_date
  ) AS readiness;
  v_policy_ready := coalesce(v_policy_ready, false);
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'rent_policy', 'label', 'Approved rent policy and term',
    'ready', v_policy_ready, 'reason', coalesce(v_reason, 'rent_not_ready'),
    'repairHref', '/settings/rent-policy'
  ));

  SELECT count(*) INTO v_owner_count
  FROM public.property_owners AS owner
  WHERE owner.organization_id = p_organization_id
    AND owner.property_id = p_property_id
    AND owner.archived_at IS NULL
    AND owner.effective_range @> p_effective_date;
  SELECT count(DISTINCT authority.owner_person_id::text || ':' || authority.component::text)
  INTO v_opening_count
  FROM public.owner_opening_balance_known_authority_v1 AS authority
  JOIN public.property_owners AS owner
    ON owner.organization_id = authority.organization_id
   AND owner.property_id = authority.property_id
   AND owner.person_id = authority.owner_person_id
   AND owner.archived_at IS NULL
   AND owner.effective_range @> p_effective_date
  JOIN public.organizations AS organization
    ON organization.id = authority.organization_id
   AND organization.preferred_currency = authority.currency
  WHERE authority.organization_id = p_organization_id
    AND authority.property_id = p_property_id
    AND authority.effective_date <= p_effective_date
    AND authority.authority_state = 'known';
  v_opening_ready := v_owner_count > 0 AND v_opening_count >= v_owner_count * 4;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'opening_balance', 'label', 'Owner opening balances',
    'ready', v_opening_ready,
    'repairHref', '/balances?propertyId=' || coalesce(p_property_id::text, '')
  ));

  SELECT v_deposit_amount <= 0 OR EXISTS (
    SELECT 1 FROM public.lease_deposits AS deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.lease_id = p_lease_id
      AND deposit.archived_at IS NULL
      AND (
        deposit.status = 'waived'
        OR (
          deposit.status IN (
            'received', 'held', 'partially_returned', 'returned', 'forfeited'
          )
          AND EXISTS (
            SELECT 1
            FROM public.lease_deposit_events AS event
            WHERE event.organization_id = deposit.organization_id
              AND event.lease_deposit_id = deposit.id
              AND event.event_type = 'received'
              AND event.reversal_of_id IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM public.lease_deposit_events AS reversal
                WHERE reversal.reversal_of_id = event.id
              )
          )
        )
      )
  ) INTO v_deposit_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'deposit', 'label', 'Deposit handling', 'ready', v_deposit_ready,
    'repairHref', '/leases'
  ));

  RETURN pg_catalog.jsonb_build_object(
    'ready', v_property_ready AND v_unit_ready AND v_owner_ready
      AND v_lease_ready AND v_occupancy_ready AND v_billing_ready
      AND v_policy_ready AND v_opening_ready AND v_deposit_ready,
    'organizationId', p_organization_id,
    'propertyId', p_property_id,
    'unitId', p_unit_id,
    'leaseId', p_lease_id,
    'effectiveDate', p_effective_date,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  TO authenticated;

-- Reuse the Track 6 exclusive service registrar for task-bound evidence.
CREATE FUNCTION public.register_paid_cost_evidence_verified(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_content_sha256 text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_idempotency_key text,
  p_task_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_document_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks AS task
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND task.id = p_task_id
      AND task.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Maintenance task evidence scope is invalid'
      USING ERRCODE = '23503';
  END IF;

  v_result := public.register_paid_cost_evidence_verified(
    p_organization_id, p_actor_id, p_property_id, p_file_name,
    p_storage_path, p_content_type, p_size_bytes, p_content_sha256,
    p_storage_object_id, p_storage_object_version, p_idempotency_key
  );
  v_document_id := (v_result->>'document_id')::uuid;

  UPDATE public.documents
  SET task_id = p_task_id
  WHERE organization_id = p_organization_id
    AND property_id = p_property_id
    AND id = v_document_id
    AND (task_id IS NULL OR task_id = p_task_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task evidence binding conflicts'
      USING ERRCODE = '23505';
  END IF;

  RETURN v_result || pg_catalog.jsonb_build_object('task_id', p_task_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text, uuid
) TO service_role;

CREATE UNIQUE INDEX expense_submissions_evidence_once_idx
  ON public.expense_submissions(supporting_document_id)
  WHERE supporting_document_id IS NOT NULL;

ALTER FUNCTION public.submit_maintenance_cost(uuid, uuid, date, uuid, text, text)
  RENAME TO submit_maintenance_cost_baseline_track8;
ALTER FUNCTION public.submit_maintenance_cost_baseline_track8(
  uuid, uuid, date, uuid, text, text
) SET SCHEMA app_private;

CREATE FUNCTION public.submit_maintenance_cost(
  p_organization_id uuid,
  p_task_id uuid,
  p_expense_date date,
  p_supporting_document_id uuid,
  p_reference text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property_id uuid;
BEGIN
  IF p_supporting_document_id IS NULL THEN
    RAISE EXCEPTION 'Maintenance paid cost evidence document is required'
      USING ERRCODE = '23514';
  END IF;
  SELECT task.property_id
  INTO v_property_id
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.id = p_task_id
    AND task.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    JOIN app_private.paid_cost_evidence_registrations AS registration
      ON registration.document_id = document.id
     AND registration.organization_id = document.organization_id
    WHERE document.organization_id = p_organization_id
      AND document.property_id = v_property_id
      AND document.task_id = p_task_id
      AND document.id = p_supporting_document_id
      AND document.archived_at IS NULL
      AND registration.actor_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Maintenance paid cost evidence is not exclusively registered'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.assert_paid_cost_evidence_eligible(
    p_organization_id, v_property_id, p_supporting_document_id,
    v_actor_id, p_idempotency_key, NULL
  );

  RETURN app_private.submit_maintenance_cost_baseline_track8(
    p_organization_id, p_task_id, p_expense_date,
    p_supporting_document_id, nullif(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_maintenance_cost(uuid, uuid, date, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_maintenance_cost(uuid, uuid, date, uuid, text, text)
  TO authenticated;

CREATE FUNCTION app_private.guard_paid_cost_approval_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'approved'
    AND OLD.status IS DISTINCT FROM 'approved'
    AND (
      NEW.supporting_document_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.documents AS document
        JOIN app_private.paid_cost_evidence_registrations AS registration
          ON registration.document_id = document.id
         AND registration.organization_id = document.organization_id
        WHERE document.organization_id = NEW.organization_id
          AND document.property_id = NEW.property_id
          AND document.id = NEW.supporting_document_id
          AND document.archived_at IS NULL
          AND (
            NEW.source_type <> 'maintenance_task'
            OR document.task_id = NEW.source_id
          )
      )
    ) THEN
    RAISE EXCEPTION 'Paid cost approval requires exclusive registered evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_paid_cost_approval_evidence_before_update
BEFORE UPDATE OF status ON public.expense_submissions
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_paid_cost_approval_evidence();

-- A deposit agreement is not held cash until a received event exists.
UPDATE public.lease_deposits AS deposit
SET status = 'pending',
    updated_at = statement_timestamp()
WHERE deposit.status = 'held'
  AND NOT EXISTS (
    SELECT 1 FROM public.lease_deposit_events AS event
    WHERE event.organization_id = deposit.organization_id
      AND event.lease_deposit_id = deposit.id
      AND event.event_type = 'received'
  );

CREATE FUNCTION app_private.normalize_unreceived_deposit_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IN ('received', 'held', 'partially_returned')
    AND NOT EXISTS (
      SELECT 1 FROM public.lease_deposit_events AS event
      WHERE event.organization_id = NEW.organization_id
        AND event.lease_deposit_id = NEW.id
        AND event.event_type = 'received'
    ) THEN
    UPDATE public.lease_deposits
    SET status = 'pending', updated_at = statement_timestamp()
    WHERE organization_id = NEW.organization_id AND id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER normalize_unreceived_deposit_status_after_write
AFTER INSERT OR UPDATE OF status ON public.lease_deposits
FOR EACH ROW
WHEN (NEW.status IN ('received', 'held', 'partially_returned'))
EXECUTE FUNCTION app_private.normalize_unreceived_deposit_status();

CREATE FUNCTION app_private.derive_lease_deposit_status_from_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_organization_id uuid := coalesce(NEW.organization_id, OLD.organization_id);
  v_deposit_id uuid := coalesce(NEW.lease_deposit_id, OLD.lease_deposit_id);
  v_received numeric := 0;
  v_applied_or_retained numeric := 0;
  v_refunded numeric := 0;
  v_held numeric := 0;
  v_status text;
BEGIN
  SELECT
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'received'), 0),
    coalesce(sum(event.amount) FILTER (
      WHERE event.event_type IN ('applied', 'retained')
    ), 0),
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'refunded'), 0)
  INTO v_received, v_applied_or_retained, v_refunded
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = v_organization_id
    AND event.lease_deposit_id = v_deposit_id
    AND event.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lease_deposit_events AS reversal
      WHERE reversal.reversal_of_id = event.id
    );

  v_held := v_received - v_applied_or_retained - v_refunded;
  v_status := CASE
    WHEN v_received <= 0 THEN 'pending'
    WHEN v_applied_or_retained = 0 AND v_refunded = 0 THEN 'held'
    WHEN v_held > 0 THEN 'partially_returned'
    WHEN v_refunded >= v_received THEN 'returned'
    ELSE 'forfeited'
  END;

  UPDATE public.lease_deposits
  SET status = v_status,
      updated_at = statement_timestamp()
  WHERE organization_id = v_organization_id
    AND id = v_deposit_id
    AND archived_at IS NULL
    AND status IS DISTINCT FROM v_status;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.derive_lease_deposit_status_from_events()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER derive_lease_deposit_status_after_event_insert_delete
AFTER INSERT OR DELETE ON public.lease_deposit_events
FOR EACH ROW
EXECUTE FUNCTION app_private.derive_lease_deposit_status_from_events();

CREATE TRIGGER derive_lease_deposit_status_after_event_update
AFTER UPDATE OF event_type, amount, reversal_of_id, lease_deposit_id
ON public.lease_deposit_events
FOR EACH ROW
EXECUTE FUNCTION app_private.derive_lease_deposit_status_from_events();

COMMENT ON TABLE public.maintenance_recurrence_series IS
  'Stable identity for one recurring maintenance plan.';
COMMENT ON TABLE public.maintenance_recurrence_revisions IS
  'Immutable schedule and task payload revisions; generated tasks reference the exact revision.';
COMMENT ON TABLE public.notification_outbox IS
  'Provider-neutral durable notification delivery; external provider selection remains approval-gated.';
COMMENT ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date) IS
  'Composes existing owner, lease, occupancy, billing, rent-policy, opening-balance, and deposit authorities without a setup workflow table.';

CREATE FUNCTION public.get_maintenance_cost_status_history(
  p_organization_id uuid,
  p_task_ids uuid[]
) RETURNS TABLE(
  task_id uuid,
  submission_id uuid,
  status text,
  review_reason text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_actor_role text := app_private.current_workspace_role(p_organization_id);
  v_actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
  v_actor_person_id uuid := app_private.current_org_person_id(p_organization_id);
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_actor_role NOT IN ('super_admin', 'operations_manager', 'operations_member') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_actor_role <> 'super_admin' AND v_actor_branch_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF coalesce(pg_catalog.cardinality(p_task_ids), 0) = 0 THEN
    RETURN;
  END IF;
  IF pg_catalog.cardinality(p_task_ids) > 1000 THEN
    RAISE EXCEPTION 'Maintenance cost status query is limited to 1000 tasks'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT submission.source_id, submission.id, submission.status,
    submission.review_reason, submission.submitted_at
  FROM public.expense_submissions AS submission
  JOIN public.tasks AS task
    ON task.organization_id = submission.organization_id
   AND task.id = submission.source_id
  WHERE submission.organization_id = p_organization_id
    AND submission.source_type = 'maintenance_task'
    AND submission.source_id = ANY(p_task_ids)
    AND (
      v_actor_role = 'super_admin'
      OR task.branch_id IS NOT DISTINCT FROM v_actor_branch_id
      AND (
        v_actor_role = 'operations_manager'
        OR task.assignee_person_id = v_actor_person_id
      )
    )
  ORDER BY submission.source_id, submission.submitted_at DESC, submission.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_cost_status_history(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_cost_status_history(uuid, uuid[])
  TO authenticated;
