-- Registration commits in a separate RPC before the observed execution starts.
-- Registered means no terminal outcome has committed; it does not assert that
-- a worker is alive, or that an interrupted request failed. No schedule or retry
-- is introduced, and the existing maintenance business function is unchanged.
CREATE TABLE app_private.maintenance_automation_runs (
  run_id uuid PRIMARY KEY,
  run_at timestamptz NOT NULL,
  registered_at timestamptz NOT NULL,
  work_limit integer NOT NULL CHECK (work_limit BETWEEN 1 AND 500),
  status text NOT NULL CHECK (status IN ('registered', 'succeeded', 'failed')),
  finished_at timestamptz,
  generated integer,
  delivered integer,
  failure_code text,
  CHECK (run_at = registered_at),
  CHECK (
    (status = 'registered' AND finished_at IS NULL AND generated IS NULL
      AND delivered IS NULL AND failure_code IS NULL)
    OR (status = 'succeeded' AND finished_at IS NOT NULL
      AND generated IS NOT NULL AND generated >= 0
      AND delivered IS NOT NULL AND delivered >= 0 AND failure_code IS NULL)
    OR (status = 'failed' AND finished_at IS NOT NULL
      AND generated IS NULL AND delivered IS NULL
      AND failure_code IS NOT NULL AND failure_code = 'maintenance_execution_failed')
  )
);
ALTER TABLE app_private.maintenance_automation_runs OWNER TO postgres;
ALTER TABLE app_private.maintenance_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.maintenance_automation_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.maintenance_automation_runs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX maintenance_automation_runs_registered_idx
  ON app_private.maintenance_automation_runs(registered_at DESC, run_id DESC);
CREATE INDEX maintenance_automation_runs_terminal_idx
  ON app_private.maintenance_automation_runs(status, finished_at DESC, run_id DESC)
  WHERE status IN ('succeeded', 'failed');
CREATE INDEX maintenance_automation_runs_unresolved_idx
  ON app_private.maintenance_automation_runs(registered_at, run_id)
  WHERE status = 'registered';

CREATE FUNCTION public.begin_maintenance_automation_run(
  p_run_id uuid,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_run app_private.maintenance_automation_runs%ROWTYPE;
  v_registered_at timestamptz := pg_catalog.clock_timestamp();
  v_created boolean;
BEGIN
  IF p_run_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid maintenance run registration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app_private.maintenance_automation_runs (
    run_id, run_at, registered_at, work_limit, status
  ) VALUES (p_run_id, v_registered_at, v_registered_at, p_limit, 'registered')
  ON CONFLICT (run_id) DO NOTHING
  RETURNING * INTO v_run;
  v_created := FOUND;

  IF NOT v_created THEN
    -- A separate statement observes the committed winner after an INSERT
    -- conflict waits. No timestamp, status or parameter is reset on replay.
    SELECT * INTO STRICT v_run FROM app_private.maintenance_automation_runs
    WHERE run_id = p_run_id;
    IF v_run.work_limit <> p_limit THEN
      RAISE EXCEPTION 'Maintenance run parameters do not match' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', v_run.run_id, 'status', v_run.status, 'run_at', v_run.run_at,
    'registered_at', v_run.registered_at, 'finished_at', v_run.finished_at,
    'generated', v_run.generated, 'delivered', v_run.delivered,
    'failure_code', v_run.failure_code, 'created', v_created
  );
END;
$$;
ALTER FUNCTION public.begin_maintenance_automation_run(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.begin_maintenance_automation_run(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_maintenance_automation_run(uuid, integer)
  TO service_role;

CREATE FUNCTION public.execute_maintenance_automation_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_run app_private.maintenance_automation_runs%ROWTYPE;
  v_result jsonb;
  v_generated numeric;
  v_delivered numeric;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'Invalid maintenance run identity' USING ERRCODE = '22023';
  END IF;

  -- Always take the identity row lock before the legacy global business lock.
  -- Concurrent requests for one identity observe the first committed result.
  SELECT * INTO v_run FROM app_private.maintenance_automation_runs
  WHERE run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance run is not registered' USING ERRCODE = '22023';
  END IF;

  IF v_run.status = 'registered' THEN
    BEGIN
      v_result := public.run_maintenance_automation(v_run.run_at, v_run.work_limit);
      IF pg_catalog.jsonb_typeof(v_result) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(v_result->'generated') IS DISTINCT FROM 'number'
        OR pg_catalog.jsonb_typeof(v_result->'delivered') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Invalid maintenance execution result';
      END IF;
      v_generated := (v_result->>'generated')::numeric;
      v_delivered := (v_result->>'delivered')::numeric;
      IF v_generated < 0 OR v_generated > 2147483647 OR v_generated <> pg_catalog.trunc(v_generated)
        OR v_delivered < 0 OR v_delivered > 2147483647 OR v_delivered <> pg_catalog.trunc(v_delivered) THEN
        RAISE EXCEPTION 'Invalid maintenance execution result';
      END IF;
      -- This update shares the business subtransaction: a failure to record
      -- success must also roll back every business effect.
      UPDATE app_private.maintenance_automation_runs
      SET status = 'succeeded', finished_at = pg_catalog.clock_timestamp(),
          generated = v_generated::integer,
          delivered = v_delivered::integer
      WHERE run_id = p_run_id
      RETURNING * INTO v_run;
    EXCEPTION WHEN OTHERS THEN
      -- The inner block has rolled back. Return normally so this fixed result
      -- can commit. Never retain SQLERRM, detail, context or request data.
      -- OTHERS deliberately excludes query cancellation/assertion failure;
      -- interruption or failure of this handler leaves registration unresolved.
      UPDATE app_private.maintenance_automation_runs
      SET status = 'failed', finished_at = pg_catalog.clock_timestamp(),
          generated = NULL, delivered = NULL,
          failure_code = 'maintenance_execution_failed'
      WHERE run_id = p_run_id
      RETURNING * INTO v_run;
    END;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', v_run.run_id, 'status', v_run.status, 'run_at', v_run.run_at,
    'registered_at', v_run.registered_at, 'finished_at', v_run.finished_at,
    'generated', v_run.generated, 'delivered', v_run.delivered,
    'failure_code', v_run.failure_code
  );
END;
$$;
ALTER FUNCTION public.execute_maintenance_automation_run(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_maintenance_automation_run(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_maintenance_automation_run(uuid)
  TO service_role;
