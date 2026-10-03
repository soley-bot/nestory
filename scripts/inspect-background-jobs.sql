BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

SELECT statement_timestamp() AS observed_at_utc,
  current_database() AS database_name;

SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('nestory-hourly-rent-generation',
  'nestory-hourly-lease-activation', 'nestory-deferred-owner-cash')
ORDER BY jobname;

SELECT job.jobname, run.runid, run.status, run.start_time, run.end_time
FROM cron.job_run_details AS run
JOIN cron.job AS job ON job.jobid = run.jobid
WHERE job.jobname IN ('nestory-hourly-rent-generation',
  'nestory-hourly-lease-activation', 'nestory-deferred-owner-cash')
  AND run.start_time >= statement_timestamp() - interval '24 hours'
ORDER BY run.start_time DESC
LIMIT 100;

SELECT status, count(*) AS rows,
  count(*) FILTER (WHERE scheduled_for <= statement_timestamp()
    AND next_attempt_at <= statement_timestamp()) AS due_rows,
  min(scheduled_for) AS oldest_scheduled_for,
  max(attempt_count) AS highest_attempt_count,
  count(*) FILTER (WHERE last_error IS NOT NULL) AS rows_with_error
FROM public.notification_outbox
GROUP BY status
ORDER BY status;

SELECT schedule.status, count(*) AS rows,
  count(*) FILTER (WHERE schedule.activation_date <=
    (statement_timestamp() AT TIME ZONE organization.operational_timezone)::date) AS due_rows,
  min(schedule.activation_date) AS oldest_activation_date,
  count(*) FILTER (WHERE schedule.failure_code IS NOT NULL) AS rows_with_failure
FROM public.lease_activation_schedules AS schedule
JOIN public.organizations AS organization ON organization.id = schedule.organization_id
GROUP BY schedule.status
ORDER BY schedule.status;

SELECT count(*) AS unresolved_rent_exceptions,
  max(attempt_count) AS highest_attempt_count
FROM public.rent_generation_exceptions
WHERE resolved_at IS NULL;

ROLLBACK;
