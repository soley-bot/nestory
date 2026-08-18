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

  FOR v_schedule IN
    SELECT schedule.*
    FROM public.lease_activation_schedules AS schedule
    WHERE schedule.organization_id = p_organization_id
      AND schedule.status = 'pending'
      AND schedule.activation_date <= v_business_date
    ORDER BY schedule.activation_date, schedule.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
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
        failure_code = NULL, failure_message = NULL, updated_by = v_schedule.created_by
      WHERE organization_id = p_organization_id AND id = v_schedule.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
      UPDATE public.lease_activation_schedules
      SET status = 'failed', failure_code = SQLSTATE,
        failure_message = left(SQLERRM, 500), updated_by = v_schedule.created_by
      WHERE organization_id = p_organization_id AND id = v_schedule.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  RETURN jsonb_build_object('failed', v_failed, 'processed', v_processed);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.run_due_lease_activations(
  p_clock timestamptz DEFAULT statement_timestamp()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_failed integer := 0;
  v_organization record;
  v_processed integer := 0;
  v_result jsonb;
BEGIN
  FOR v_organization IN
    SELECT organization.id, organization.operational_timezone
    FROM public.organizations AS organization
    WHERE EXISTS (
      SELECT 1
      FROM public.lease_activation_schedules AS schedule
      WHERE schedule.organization_id = organization.id
        AND schedule.status = 'pending'
        AND schedule.activation_date <= (p_clock AT TIME ZONE organization.operational_timezone)::date
    )
  LOOP
    v_result := public.process_due_lease_activations(
      v_organization.id,
      (p_clock AT TIME ZONE v_organization.operational_timezone)::date,
      500
    );
    v_processed := v_processed + coalesce((v_result ->> 'processed')::integer, 0);
    v_failed := v_failed + coalesce((v_result ->> 'failed')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object('failed', v_failed, 'processed', v_processed);
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_lease_activations(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_due_lease_activations(uuid, date, integer)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.run_due_lease_activations(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.run_due_lease_activations(timestamptz) TO service_role;

DO $migration$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT job.jobid
  INTO existing_job_id
  FROM cron.job AS job
  WHERE job.jobname = 'nestory-hourly-lease-activation';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'nestory-hourly-lease-activation',
    '11 * * * *',
    'SELECT app_private.run_due_lease_activations();'
  );
END;
$migration$;

COMMENT ON FUNCTION app_private.run_due_lease_activations(timestamptz) IS
  'Processes due Lease activation schedules for every workspace using each workspace operational date.';
