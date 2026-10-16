-- Operator-only, read-only snapshot for maintenance-run-health.mjs.
-- Connect through an already authorized operator path; never grant browser
-- access to app_private or invoke the mutating cron route for this check.
-- psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/inspect-maintenance-runs.sql
-- produces one JSON value. A failed query is unavailable evidence, not health.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

WITH latest_registration AS MATERIALIZED (
  SELECT registered_at
  FROM app_private.maintenance_automation_runs
  ORDER BY registered_at DESC, run_id DESC
  LIMIT 1
), terminal_heads AS MATERIALIZED (
  (SELECT status, finished_at, run_id
   FROM app_private.maintenance_automation_runs
   WHERE status = 'succeeded'
   ORDER BY finished_at DESC, run_id DESC
   LIMIT 1)
  UNION ALL
  (SELECT status, finished_at, run_id
   FROM app_private.maintenance_automation_runs
   WHERE status = 'failed'
   ORDER BY finished_at DESC, run_id DESC
   LIMIT 1)
), unresolved AS MATERIALIZED (
  SELECT count(*) AS registered_count, min(registered_at) AS oldest_registered_at
  FROM app_private.maintenance_automation_runs
  WHERE status = 'registered'
)
SELECT jsonb_build_object(
  'observed_at', statement_timestamp(),
  'latest_registered_at', (SELECT registered_at FROM latest_registration),
  'latest_succeeded_at', (SELECT finished_at FROM terminal_heads WHERE status = 'succeeded'),
  'latest_failed_at', (SELECT finished_at FROM terminal_heads WHERE status = 'failed'),
  'latest_terminal_status', (SELECT status FROM terminal_heads ORDER BY finished_at DESC, run_id DESC LIMIT 1),
  'registered_count', unresolved.registered_count,
  'oldest_registered_at', unresolved.oldest_registered_at
)
FROM unresolved;

ROLLBACK;
