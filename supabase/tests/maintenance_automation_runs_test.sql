BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('app_private', 'maintenance_automation_runs',
  'maintenance run history is private');
SELECT has_function('public', 'begin_maintenance_automation_run',
  ARRAY['uuid', 'integer'], 'a run is registered before execution');
SELECT has_function('public', 'execute_maintenance_automation_run',
  ARRAY['uuid'], 'execution uses only the registered identity');

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'app_private.maintenance_automation_runs'::regclass),
  'private history also enables and forces RLS');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS actor(name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privilege(name)
  WHERE has_table_privilege(actor.name, 'app_private.maintenance_automation_runs', privilege.name)
), 'no API role can read or forge ledger rows directly');
SELECT ok((
  SELECT count(*) = 2 AND bool_and(
    routine.prosecdef AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND 'search_path=""' = ANY(coalesce(routine.proconfig, '{}'::text[]))
    AND has_function_privilege('service_role', routine.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', routine.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', routine.oid, 'EXECUTE'))
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid IN (
    'public.begin_maintenance_automation_run(uuid,integer)'::regprocedure,
    'public.execute_maintenance_automation_run(uuid)'::regprocedure)
), 'only service role receives the postgres-owned RPCs with a fixed empty search path');
SELECT ok(
  has_function_privilege('service_role', 'public.run_maintenance_automation(timestamptz,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.run_maintenance_automation(timestamptz,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.run_maintenance_automation(timestamptz,integer)', 'EXECUTE'),
  'legacy business runner authorization remains unchanged');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function begin_maintenance_automation_run',
  'anonymous callers cannot register runs');
SELECT throws_ok($$SELECT public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function execute_maintenance_automation_run',
  'anonymous callers cannot execute runs');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function begin_maintenance_automation_run',
  'authenticated callers cannot register runs');
SELECT throws_ok($$SELECT public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function execute_maintenance_automation_run',
  'authenticated callers cannot execute runs');
RESET ROLE;

CREATE TEMP TABLE maintenance_run_results (label text PRIMARY KEY, result jsonb NOT NULL);
GRANT SELECT, INSERT ON maintenance_run_results TO service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run(NULL, 100)$$,
  '22023', 'Invalid maintenance run registration', 'registration rejects a null identity');
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001', NULL)$$,
  '22023', 'Invalid maintenance run registration', 'registration rejects a null limit');
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001', 0)$$,
  '22023', 'Invalid maintenance run registration', 'registration rejects a zero limit');
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001', 501)$$,
  '22023', 'Invalid maintenance run registration', 'registration rejects an excessive limit');
SELECT throws_ok($$SELECT public.execute_maintenance_automation_run(NULL)$$,
  '22023', 'Invalid maintenance run identity', 'execution rejects a null identity');
SELECT throws_ok($$SELECT public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000001')$$,
  '22023', 'Maintenance run is not registered', 'execution cannot invent registration');

INSERT INTO maintenance_run_results VALUES ('registered',
  public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001'));
SELECT is((SELECT result->>'status' FROM maintenance_run_results WHERE label = 'registered'),
  'registered', 'begin records an unresolved registration');
SELECT is((SELECT result->>'created' FROM maintenance_run_results WHERE label = 'registered'),
  'true', 'the first begin owns creation');
SELECT results_eq(
  $$SELECT key FROM maintenance_run_results, jsonb_object_keys(result) AS key
    WHERE label = 'registered' ORDER BY key$$,
  $$VALUES ('created'::text), ('delivered'), ('failure_code'), ('finished_at'),
    ('generated'), ('registered_at'), ('run_at'), ('run_id'), ('status')$$,
  'registration returns only the approved snapshot fields');
SELECT ok((SELECT result->'run_at' = result->'registered_at'
  AND (result->>'registered_at')::timestamptz BETWEEN transaction_timestamp() AND clock_timestamp()
  AND result->'finished_at' = 'null'::jsonb AND result->'generated' = 'null'::jsonb
  AND result->'delivered' = 'null'::jsonb AND result->'failure_code' = 'null'::jsonb
  FROM maintenance_run_results WHERE label = 'registered'),
  'database observation time defines the immutable cutoff without inventing an outcome');
SELECT is(public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001'),
  (SELECT result || '{"created":false}'::jsonb FROM maintenance_run_results WHERE label = 'registered'),
  'duplicate registration preserves the original snapshot');
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001', 99)$$,
  '22023', 'Maintenance run parameters do not match', 'a run identity cannot change its limit');
RESET ROLE;
SELECT is((SELECT work_limit FROM app_private.maintenance_automation_runs
  WHERE run_id = 'ac000000-0000-4000-8000-000000000001'), 100,
  'the default limit is stored privately');

-- This test runs only on the local test fixture and rolls all fixture changes
-- back. Suppress pre-existing due work so the assertions identify exact effects.
UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';
UPDATE public.notification_outbox SET status = 'cancelled' WHERE status IN ('pending', 'retry');
CREATE TEMP TABLE maintenance_run_fixture AS
SELECT organization.id AS organization_id, property.id AS property_id,
  property.branch_id, task.created_by
FROM public.organizations AS organization
JOIN public.properties AS property ON property.organization_id = organization.id
  AND property.archived_at IS NULL
JOIN public.tasks AS task ON task.organization_id = organization.id
  AND task.property_id = property.id AND task.created_by IS NOT NULL
ORDER BY organization.id, property.id, task.id LIMIT 1;
SELECT is((SELECT count(*)::integer FROM maintenance_run_fixture), 1,
  'the isolated database fixture supplies one maintenance authority context');

INSERT INTO public.maintenance_recurrence_series (
  id, organization_id, property_id, branch_id, lifecycle, created_by)
SELECT 'ac000000-0000-4000-8000-000000000011', organization_id, property_id,
  branch_id, 'active', created_by FROM maintenance_run_fixture;
INSERT INTO public.maintenance_recurrence_revisions (
  id, organization_id, series_id, revision_number, frequency, timezone,
  next_occurrence_at, title, category, priority, checklist, effective_from, created_by)
SELECT 'ac000000-0000-4000-8000-000000000012', organization_id,
  'ac000000-0000-4000-8000-000000000011', 1, 'annual', 'UTC',
  transaction_timestamp() - interval '1 day', 'Durable run rollback test',
  'Preventive maintenance', 'normal', '[]'::jsonb,
  transaction_timestamp() - interval '1 day', created_by FROM maintenance_run_fixture;
INSERT INTO public.notification_outbox (
  id, organization_id, event_key, event_type, payload, scheduled_for, next_attempt_at)
SELECT 'ac000000-0000-4000-8000-000000000013', organization_id,
  'durable-run-rollback-test', 'maintenance_reminder', '{}'::jsonb,
  transaction_timestamp() - interval '1 day', transaction_timestamp() - interval '1 day'
FROM maintenance_run_fixture;

CREATE TEMP TABLE maintenance_run_before AS SELECT
  (SELECT count(*) FROM public.tasks) AS tasks,
  (SELECT count(*) FROM public.tenant_requests) AS requests,
  (SELECT count(*) FROM public.timeline_events) AS timeline,
  (SELECT count(*) FROM public.activity_logs) AS activity,
  (SELECT count(*) FROM public.notification_delivery_attempts) AS attempts,
  (SELECT to_jsonb(revision) FROM public.maintenance_recurrence_revisions AS revision
   WHERE id = 'ac000000-0000-4000-8000-000000000012') AS revision,
  (SELECT to_jsonb(outbox) FROM public.notification_outbox AS outbox
   WHERE id = 'ac000000-0000-4000-8000-000000000013') AS outbox;

-- Sequence advancement survives a rolled-back exception block. It proves the
-- injected fault occurred after real generation and outbox writes, not before.
CREATE TEMP SEQUENCE maintenance_run_writes_observed;
CREATE FUNCTION pg_temp.maintenance_run_delivery_fault() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outbox_id = 'ac000000-0000-4000-8000-000000000013'::uuid THEN
    IF EXISTS (SELECT 1 FROM public.tasks
        WHERE recurrence_series_id = 'ac000000-0000-4000-8000-000000000011')
      AND EXISTS (SELECT 1 FROM public.notification_outbox
        WHERE id = NEW.outbox_id AND status = 'delivered') THEN
      PERFORM nextval('pg_temp.maintenance_run_writes_observed');
    END IF;
    IF current_setting('app.maintenance_run_test_fault', true) = 'failure' THEN
      RAISE EXCEPTION 'private maintenance payload and credential' USING ERRCODE = '23514';
    ELSIF current_setting('app.maintenance_run_test_fault', true) = 'cancel' THEN
      RAISE EXCEPTION 'private maintenance cancellation' USING ERRCODE = '57014';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maintenance_run_test_delivery_fault BEFORE INSERT
  ON public.notification_delivery_attempts FOR EACH ROW
  EXECUTE FUNCTION pg_temp.maintenance_run_delivery_fault();

CREATE FUNCTION pg_temp.maintenance_run_business_unchanged() RETURNS boolean
LANGUAGE sql AS $$
  SELECT before.tasks = (SELECT count(*) FROM public.tasks)
    AND before.requests = (SELECT count(*) FROM public.tenant_requests)
    AND before.timeline = (SELECT count(*) FROM public.timeline_events)
    AND before.activity = (SELECT count(*) FROM public.activity_logs)
    AND before.attempts = (SELECT count(*) FROM public.notification_delivery_attempts)
    AND before.revision = (SELECT to_jsonb(revision) FROM public.maintenance_recurrence_revisions AS revision
      WHERE id = 'ac000000-0000-4000-8000-000000000012')
    AND before.outbox = (SELECT to_jsonb(outbox) FROM public.notification_outbox AS outbox
      WHERE id = 'ac000000-0000-4000-8000-000000000013')
  FROM maintenance_run_before AS before;
$$;

-- pgTAP's generic exception assertion need not catch query_canceled. Catch it
-- explicitly outside the execution RPC to prove the RPC did not consume it.
CREATE FUNCTION pg_temp.maintenance_run_cancellation_observed(p_run_id uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.execute_maintenance_automation_run(p_run_id);
  RETURN false;
EXCEPTION WHEN query_canceled THEN
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.maintenance_run_cancellation_observed(uuid) TO service_role;

SELECT set_config('app.maintenance_run_test_fault', 'failure', true);
SET LOCAL ROLE service_role;
INSERT INTO maintenance_run_results VALUES ('failed',
  public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000001'));
RESET ROLE;
SELECT ok((SELECT is_called FROM maintenance_run_writes_observed),
  'ordinary failure occurs after real generation and outbox changes');
SELECT ok(pg_temp.maintenance_run_business_unchanged(),
  'caught business failure rolls back every preceding business change');
SELECT ok((SELECT result->>'status' = 'failed'
  AND result->>'failure_code' = 'maintenance_execution_failed'
  AND result->'generated' = 'null'::jsonb AND result->'delivered' = 'null'::jsonb
  AND result->'finished_at' <> 'null'::jsonb
  AND result::text NOT LIKE '%private%'
  FROM maintenance_run_results WHERE label = 'failed'),
  'caught failure records only the fixed sanitized outcome and no success counters');
SELECT results_eq(
  $$SELECT key FROM maintenance_run_results, jsonb_object_keys(result) AS key
    WHERE label = 'failed' ORDER BY key$$,
  $$VALUES ('delivered'::text), ('failure_code'), ('finished_at'), ('generated'),
    ('registered_at'), ('run_at'), ('run_id'), ('status')$$,
  'execution returns exactly the approved snapshot fields');
SET LOCAL ROLE service_role;
SELECT is(public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000001'),
  (SELECT result FROM maintenance_run_results WHERE label = 'failed'),
  'a failed terminal replay never executes business work again');
SELECT is(public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000001'),
  (SELECT result || '{"created":false}'::jsonb FROM maintenance_run_results WHERE label = 'failed'),
  'begin cannot reset a failed terminal outcome');

INSERT INTO maintenance_run_results VALUES ('cancel_registered',
  public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000002'));
SELECT set_config('app.maintenance_run_test_fault', 'cancel', true);
SELECT ok(pg_temp.maintenance_run_cancellation_observed('ac000000-0000-4000-8000-000000000002'),
  'cancellation escapes the ordinary failure handler');
SELECT is(public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000002'),
  (SELECT result || '{"created":false}'::jsonb FROM maintenance_run_results WHERE label = 'cancel_registered'),
  'cancellation preserves unresolved registration without fabricating failure');
RESET ROLE;
SELECT ok(pg_temp.maintenance_run_business_unchanged(), 'cancellation rolls back preceding business changes');
SELECT is((SELECT last_value FROM maintenance_run_writes_observed), 2::bigint,
  'terminal replay did not execute, and cancellation occurred after real writes');

CREATE FUNCTION pg_temp.maintenance_run_success_fault() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.run_id = 'ac000000-0000-4000-8000-000000000003'::uuid AND NEW.status = 'succeeded' THEN
    RAISE EXCEPTION 'private ledger finalization failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maintenance_run_test_success_fault BEFORE UPDATE
  ON app_private.maintenance_automation_runs FOR EACH ROW
  EXECUTE FUNCTION pg_temp.maintenance_run_success_fault();
SELECT set_config('app.maintenance_run_test_fault', 'none', true);
SET LOCAL ROLE service_role;
SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000003');
SELECT is(public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000003')->>'status',
  'failed', 'success-ledger write failure becomes a known failed outcome');
RESET ROLE;
SELECT ok(pg_temp.maintenance_run_business_unchanged(),
  'success finalization shares the business rollback boundary');
DROP TRIGGER maintenance_run_test_success_fault ON app_private.maintenance_automation_runs;

SET LOCAL ROLE service_role;
INSERT INTO maintenance_run_results VALUES ('success_registered',
  public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000004', 500));
INSERT INTO maintenance_run_results VALUES ('succeeded',
  public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000004'));
SELECT ok((SELECT result->>'status' = 'succeeded' AND result->'generated' = '1'::jsonb
  AND result->'delivered' = '1'::jsonb AND result->'failure_code' = 'null'::jsonb
  AND (result->>'finished_at')::timestamptz >= (result->>'registered_at')::timestamptz
  FROM maintenance_run_results WHERE label = 'succeeded'),
  'successful execution records the actual generated and delivered counts');
SELECT is((SELECT result - ARRAY['created','status','finished_at','generated','delivered','failure_code']
    FROM maintenance_run_results WHERE label = 'success_registered'),
  (SELECT result - ARRAY['status','finished_at','generated','delivered','failure_code']
    FROM maintenance_run_results WHERE label = 'succeeded'),
  'execution preserves the original identity and database cutoff');
SELECT is(public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000004'),
  (SELECT result FROM maintenance_run_results WHERE label = 'succeeded'),
  'successful terminal replay returns the saved counts and timestamps');
SELECT is(public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000004', 500),
  (SELECT result || '{"created":false}'::jsonb FROM maintenance_run_results WHERE label = 'succeeded'),
  'begin cannot reset successful terminal history');
SELECT throws_ok($$SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000004', 1)$$,
  '22023', 'Maintenance run parameters do not match', 'terminal identity cannot change its parameters');
SELECT public.begin_maintenance_automation_run('ac000000-0000-4000-8000-000000000005', 1);
SELECT ok((SELECT result->>'status' = 'succeeded' AND result->'generated' = '0'::jsonb
  AND result->'delivered' = '0'::jsonb
  FROM (SELECT public.execute_maintenance_automation_run('ac000000-0000-4000-8000-000000000005') AS result) AS execution),
  'a genuinely idle new run is a zero-work success');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.tasks
  WHERE recurrence_series_id = 'ac000000-0000-4000-8000-000000000011'), 1::bigint,
  'failed and repeated requests leave exactly one committed occurrence');
SELECT is((SELECT count(*) FROM public.notification_delivery_attempts
  WHERE outbox_id = 'ac000000-0000-4000-8000-000000000013'), 1::bigint,
  'failed and repeated requests leave exactly one delivery attempt');

SELECT * FROM finish();
ROLLBACK;
