CREATE OR REPLACE FUNCTION app_private.align_cancelled_lease_participant_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.evidence_state = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = NEW.organization_id
        AND occupancy.id = NEW.lease_occupancy_id
        AND occupancy.evidence_state = 'accepted'
        AND occupancy.business_lifecycle = 'cancelled_before_effective'
    ) THEN
    NEW.started_on := NULL;
    NEW.ended_on := NULL;
    NEW.business_lifecycle := 'cancelled_before_effective';
    NEW.started_on_kind := 'unknown';
    NEW.started_on_confidence := 'unknown';
    NEW.ended_on_kind := 'unknown';
    NEW.ended_on_confidence := 'unknown';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.align_cancelled_lease_participant_lifecycle()
FROM PUBLIC;

DROP TRIGGER IF EXISTS align_cancelled_lease_participant_lifecycle
ON public.lease_occupancy_participants;

CREATE TRIGGER align_cancelled_lease_participant_lifecycle
BEFORE INSERT OR UPDATE OF
  organization_id,
  lease_occupancy_id,
  evidence_state,
  business_lifecycle,
  started_on,
  ended_on,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence
ON public.lease_occupancy_participants
FOR EACH ROW
EXECUTE FUNCTION app_private.align_cancelled_lease_participant_lifecycle();

COMMENT ON FUNCTION app_private.align_cancelled_lease_participant_lifecycle() IS
  'Keeps accepted participant evidence closed when its accepted occupancy was cancelled before move-in.';

CREATE OR REPLACE FUNCTION app_private.close_lease_activation_schedule_on_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.lease_activation_schedules AS schedule
    SET
      status = 'cancelled',
      cancelled_at = coalesce(schedule.cancelled_at, statement_timestamp()),
      failure_code = NULL,
      failure_message = NULL,
      updated_by = coalesce(NEW.updated_by, schedule.updated_by)
    WHERE schedule.organization_id = NEW.organization_id
      AND schedule.lease_id = NEW.id
      AND schedule.status IN ('pending', 'failed');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_lease_activation_schedule_on_cancellation()
FROM PUBLIC;

DROP TRIGGER IF EXISTS close_lease_activation_schedule_on_cancellation
ON public.leases;

CREATE TRIGGER close_lease_activation_schedule_on_cancellation
AFTER UPDATE OF status ON public.leases
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION app_private.close_lease_activation_schedule_on_cancellation();

CREATE OR REPLACE FUNCTION public.process_due_lease_activations(
  p_organization_id uuid,
  p_through_date date DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_business_date date;
  v_candidate record;
  v_failed integer := 0;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_processed integer := 0;
  v_schedule public.lease_activation_schedules%ROWTYPE;
  v_timezone text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT organization.operational_timezone INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  v_business_date := coalesce(
    p_through_date,
    (statement_timestamp() AT TIME ZONE v_timezone)::date
  );

  FOR v_candidate IN
    SELECT schedule.id, schedule.lease_id
    FROM public.lease_activation_schedules AS schedule
    WHERE schedule.organization_id = p_organization_id
      AND schedule.status = 'pending'
      AND schedule.activation_date <= v_business_date
    ORDER BY schedule.activation_date, schedule.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  LOOP
    BEGIN
      PERFORM 1
      FROM public.leases AS lease
      WHERE lease.organization_id = p_organization_id
        AND lease.id = v_candidate.lease_id
      FOR UPDATE;

      SELECT schedule.* INTO v_schedule
      FROM public.lease_activation_schedules AS schedule
      WHERE schedule.organization_id = p_organization_id
        AND schedule.id = v_candidate.id
        AND schedule.status = 'pending'
        AND schedule.activation_date <= v_business_date
      FOR UPDATE;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF v_schedule.created_by IS NULL THEN
        RAISE EXCEPTION 'Scheduled activation has no authorizing operator'
          USING ERRCODE = '28000', DETAIL = 'lease_activation_actor_required';
      END IF;

      PERFORM set_config('request.jwt.claim.sub', v_schedule.created_by::text, true);
      PERFORM public.transition_lease_lifecycle(
        p_organization_id,
        v_schedule.lease_id,
        'draft',
        v_schedule.expected_occupancy_id,
        'activate',
        v_schedule.activation_date,
        NULL,
        'Lease activated on scheduled date',
        v_schedule.idempotency_key || ':execute'
      );
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);

      UPDATE public.lease_activation_schedules
      SET status = 'processed', processed_at = statement_timestamp(),
        failure_code = NULL, failure_message = NULL,
        updated_by = v_schedule.created_by
      WHERE organization_id = p_organization_id AND id = v_schedule.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
      UPDATE public.lease_activation_schedules
      SET status = 'failed', failure_code = SQLSTATE,
        failure_message = left(SQLERRM, 500), updated_by = v_schedule.created_by
      WHERE organization_id = p_organization_id AND id = v_candidate.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  RETURN jsonb_build_object('failed', v_failed, 'processed', v_processed);
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_lease_activations(uuid, date, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_due_lease_activations(uuid, date, integer)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.repair_cancelled_lease_artifacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_participant_count integer := 0;
  v_schedule_count integer := 0;
BEGIN
  PERFORM set_config(
    'app.lease_history_write_context',
    'checked-lease-lifecycle-v1',
    true
  );

  UPDATE public.lease_occupancy_participants AS participant
  SET
    business_lifecycle = participant.business_lifecycle,
    updated_at = statement_timestamp()
  WHERE participant.evidence_state = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = participant.organization_id
        AND occupancy.id = participant.lease_occupancy_id
        AND occupancy.evidence_state = 'accepted'
        AND occupancy.business_lifecycle = 'cancelled_before_effective'
    )
    AND (
      participant.business_lifecycle IS DISTINCT FROM 'cancelled_before_effective'
      OR participant.started_on IS NOT NULL
      OR participant.ended_on IS NOT NULL
      OR participant.started_on_kind IS DISTINCT FROM 'unknown'
      OR participant.started_on_confidence IS DISTINCT FROM 'unknown'
      OR participant.ended_on_kind IS DISTINCT FROM 'unknown'
      OR participant.ended_on_confidence IS DISTINCT FROM 'unknown'
    );
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  PERFORM set_config('app.lease_history_write_context', 'off', true);

  UPDATE public.lease_activation_schedules AS schedule
  SET
    status = 'cancelled',
    cancelled_at = coalesce(schedule.cancelled_at, statement_timestamp()),
    failure_code = NULL,
    failure_message = NULL,
    updated_by = coalesce(lease.updated_by, schedule.updated_by)
  FROM public.leases AS lease
  WHERE lease.organization_id = schedule.organization_id
    AND lease.id = schedule.lease_id
    AND lease.status = 'cancelled'
    AND schedule.status IN ('pending', 'failed');
  GET DIAGNOSTICS v_schedule_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'participantRows', v_participant_count,
    'scheduleRows', v_schedule_count
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.lease_history_write_context', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION app_private.repair_cancelled_lease_artifacts()
FROM PUBLIC;

SELECT app_private.repair_cancelled_lease_artifacts();

COMMENT ON FUNCTION app_private.close_lease_activation_schedule_on_cancellation() IS
  'Atomically closes pending or failed activation work when a Draft Lease is cancelled.';

COMMENT ON FUNCTION public.process_due_lease_activations(uuid, date, integer) IS
  'Processes due schedules with Lease-before-schedule locking so cancellation and activation share one lock order.';

COMMENT ON FUNCTION app_private.repair_cancelled_lease_artifacts() IS
  'Repairs participant and activation-schedule rows left open by cancellations recorded before the checked cleanup.';
