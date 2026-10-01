CREATE OR REPLACE FUNCTION app_private.enqueue_maintenance_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_timezone text;
  v_scheduled_for timestamptz;
  v_event_key text;
  v_actionable boolean := NEW.reminder_date IS NOT NULL
    AND NEW.archived_at IS NULL
    AND NEW.status IN ('pending', 'scheduled', 'in_progress', 'blocked');
BEGIN
  IF v_actionable THEN
    SELECT coalesce(revision.timezone, organization.operational_timezone)
    INTO STRICT v_timezone
    FROM public.organizations AS organization
    LEFT JOIN public.maintenance_recurrence_revisions AS revision
      ON revision.organization_id = NEW.organization_id
     AND revision.id = NEW.recurrence_revision_id
    WHERE organization.id = NEW.organization_id;
    v_scheduled_for := (
      NEW.reminder_date + coalesce(NEW.reminder_time, '00:00'::time)
    ) AT TIME ZONE v_timezone;
    v_event_key := pg_catalog.concat_ws(
      ':', 'maintenance-reminder-v1', NEW.id, v_scheduled_for
    );
  END IF;

  UPDATE public.notification_outbox
  SET status = 'cancelled', updated_at = statement_timestamp()
  WHERE organization_id = NEW.organization_id
    AND task_id = NEW.id
    AND event_type = 'maintenance_reminder'
    AND (NOT v_actionable OR event_key IS DISTINCT FROM v_event_key)
    AND status IN ('pending', 'retry', 'processing');

  IF NOT v_actionable THEN
    RETURN NEW;
  END IF;

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
    ), v_scheduled_for, v_scheduled_for
  ) ON CONFLICT (organization_id, event_key) DO UPDATE
    SET branch_id = EXCLUDED.branch_id,
        recipient_person_id = EXCLUDED.recipient_person_id,
        payload = EXCLUDED.payload,
        status = CASE WHEN notification_outbox.status = 'cancelled'
          THEN 'pending' ELSE notification_outbox.status END,
        next_attempt_at = CASE WHEN notification_outbox.status = 'cancelled'
          THEN EXCLUDED.next_attempt_at ELSE notification_outbox.next_attempt_at END,
        updated_at = statement_timestamp()
    WHERE notification_outbox.status IN ('pending', 'retry', 'cancelled');

  RETURN NEW;
END;
$$;

DROP TRIGGER enqueue_maintenance_reminder_after_write ON public.tasks;
CREATE TRIGGER enqueue_maintenance_reminder_after_write
AFTER INSERT OR UPDATE OF reminder_date, reminder_time, branch_id,
  assignee_person_id, title, archived_at, status, property_id, unit_id,
  recurrence_revision_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION app_private.enqueue_maintenance_reminder();

CREATE OR REPLACE FUNCTION public.run_maintenance_automation(
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
  v_task record;
  v_timezone text;
  v_scheduled_for timestamptz;
  v_examined integer := 0;
  v_processed integer := 0;
BEGIN
  IF p_run_at IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
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
      AND greatest(revision.next_occurrence_at, revision.effective_from) -
        pg_catalog.make_interval(mins => coalesce(revision.reminder_offset_minutes, 0)) <= p_run_at
    ORDER BY greatest(revision.next_occurrence_at, revision.effective_from) -
      pg_catalog.make_interval(mins => coalesce(revision.reminder_offset_minutes, 0)), revision.id
    FOR UPDATE OF series, revision SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_occurrence_at := greatest(v_revision.next_occurrence_at, v_revision.effective_from);
    WHILE v_occurrence_at - pg_catalog.make_interval(
      mins => coalesce(v_revision.reminder_offset_minutes, 0)
    ) <= p_run_at AND v_examined < p_limit LOOP
    v_examined := v_examined + 1;
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

    EXIT WHEN v_examined >= p_limit;
  END LOOP;

  UPDATE public.notification_outbox
  SET status = 'cancelled', updated_at = statement_timestamp()
  WHERE task_id IS NULL
    AND status IN ('pending', 'retry')
    AND scheduled_for <= p_run_at
    AND next_attempt_at <= p_run_at;

  FOR v_task IN
    SELECT task.*
    FROM public.tasks AS task
    WHERE EXISTS (
      SELECT 1 FROM public.notification_outbox AS outbox
      WHERE outbox.organization_id = task.organization_id
        AND outbox.task_id = task.id
        AND outbox.status IN ('pending', 'retry')
        AND outbox.scheduled_for <= p_run_at
        AND outbox.next_attempt_at <= p_run_at
    )
    ORDER BY task.id
    FOR UPDATE OF task SKIP LOCKED
    LIMIT p_limit
  LOOP
    SELECT coalesce(revision.timezone, organization.operational_timezone)
    INTO STRICT v_timezone
    FROM public.organizations AS organization
    LEFT JOIN public.maintenance_recurrence_revisions AS revision
      ON revision.organization_id = v_task.organization_id
     AND revision.id = v_task.recurrence_revision_id
    WHERE organization.id = v_task.organization_id;
    v_scheduled_for := (
      v_task.reminder_date + coalesce(v_task.reminder_time, '00:00'::time)
    ) AT TIME ZONE v_timezone;

    FOR v_outbox IN
      SELECT outbox.*
      FROM public.notification_outbox AS outbox
      WHERE outbox.organization_id = v_task.organization_id
        AND outbox.task_id = v_task.id
        AND outbox.status IN ('pending', 'retry')
        AND outbox.scheduled_for <= p_run_at
        AND outbox.next_attempt_at <= p_run_at
      ORDER BY outbox.next_attempt_at, outbox.id
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit - v_processed
    LOOP
      v_processed := v_processed + 1;
      IF v_task.archived_at IS NOT NULL
        OR v_task.status NOT IN ('pending', 'scheduled', 'in_progress', 'blocked')
        OR v_task.reminder_date IS NULL
        OR v_outbox.scheduled_for IS DISTINCT FROM v_scheduled_for
        OR v_outbox.branch_id IS DISTINCT FROM v_task.branch_id
        OR v_outbox.recipient_person_id IS DISTINCT FROM v_task.assignee_person_id THEN
        UPDATE public.notification_outbox
        SET status = 'cancelled', updated_at = statement_timestamp()
        WHERE id = v_outbox.id;
        CONTINUE;
      END IF;

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
      );
      v_delivered := v_delivered + 1;
    END LOOP;
    EXIT WHEN v_processed >= p_limit;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'generated', v_generated,
    'delivered', v_delivered,
    'run_at', p_run_at
  );
END;
$$;
