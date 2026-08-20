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

COMMENT ON FUNCTION app_private.close_lease_activation_schedule_on_cancellation() IS
  'Atomically closes pending or failed activation work when a Draft Lease is cancelled.';
