BEGIN;
SET LOCAL timezone TO 'UTC';
SET LOCAL datestyle TO 'ISO, YMD';

SELECT no_plan();

UPDATE public.organizations SET operational_timezone = 'UTC'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';
UPDATE public.notification_outbox SET status = 'cancelled'
WHERE status IN ('pending', 'retry', 'processing');

CREATE TEMP TABLE reminder_test_series AS
WITH series AS (
  INSERT INTO public.maintenance_recurrence_series (
    organization_id, property_id, branch_id, created_by
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000211',
    '00000000-0000-0000-0000-000000000101'
  ) RETURNING id, organization_id, created_by
), revision AS (
INSERT INTO public.maintenance_recurrence_revisions (
  organization_id, series_id, revision_number, frequency, timezone,
  next_occurrence_at, title, category, priority, reminder_offset_minutes,
  effective_from, created_by
)
SELECT organization_id, id, 1, 'monthly', 'UTC',
  '2035-02-15 09:00+00', 'Advance reminder fixture', 'Preventive maintenance',
  'normal', 1440, '2035-02-15 09:00+00', created_by
FROM series RETURNING series_id
)
SELECT series_id FROM revision;

SELECT is(
  (public.run_maintenance_automation('2035-02-14 08:59:59+00', 10)->>'generated')::integer,
  0, 'an occurrence is not generated before its reminder boundary'
);
SELECT is(
  (public.run_maintenance_automation('2035-02-14 09:00+00', 10)->>'generated')::integer,
  1, 'the occurrence exists at its advance reminder boundary'
);
SELECT is(
  (SELECT count(*)::integer FROM public.notification_outbox AS outbox
   JOIN public.tasks AS task ON task.id = outbox.task_id
   WHERE task.recurrence_series_id = (SELECT series_id FROM reminder_test_series)
     AND outbox.status = 'delivered' AND outbox.delivered_at = '2035-02-14 09:00+00'),
  1, 'an advance reminder is delivered a day before the occurrence is due'
);

CREATE TEMP TABLE reminder_test_task (id uuid);
GRANT ALL ON reminder_test_task TO authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;
INSERT INTO reminder_test_task
SELECT public.create_maintenance_task(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Cleared reminder fixture', NULL, 'Plumbing', 'normal', 'scheduled',
  '2035-02-15', '09:00', '2035-02-14', '09:00', NULL, NULL, NULL,
  '[]', 'none', '00000000-0000-0000-0000-000000000211', NULL
);
RESET ROLE;
UPDATE public.tasks SET reminder_date = NULL, reminder_time = NULL
WHERE id = (SELECT id FROM reminder_test_task);
SELECT is(
  (SELECT status FROM public.notification_outbox
   WHERE task_id = (SELECT id FROM reminder_test_task)),
  'cancelled', 'clearing a reminder cancels its queued delivery'
);
SELECT is(
  (public.run_maintenance_automation('2035-02-14 09:00+00', 10)->>'delivered')::integer,
  0, 'a cleared reminder cannot be delivered by the next run'
);

UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';

CREATE FUNCTION pg_temp.reminder_task(p_title text) RETURNS uuid
LANGUAGE sql AS $$
  SELECT public.create_maintenance_task(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    p_title, NULL, 'Plumbing', 'normal', 'scheduled',
    '2035-02-15', '09:00', '2035-02-14', '09:00', NULL, NULL, NULL,
    '[]', 'none', '00000000-0000-0000-0000-000000000211', NULL
  );
$$;

CREATE TEMP TABLE lifecycle_tasks AS
SELECT title, pg_temp.reminder_task(title) AS id FROM (VALUES
  ('Archive fixture'), ('Complete fixture'), ('Cancel fixture'),
  ('Review fixture'), ('Retry fixture'), ('Reschedule fixture'),
  ('Stale recipient fixture'), ('Stale date fixture'), ('Stale state fixture')
) AS names(title);

UPDATE public.tasks SET archived_at = statement_timestamp()
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Archive fixture');
UPDATE public.tasks SET status = 'completed'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Complete fixture');
UPDATE public.tasks SET status = 'cancelled'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Cancel fixture');
UPDATE public.tasks SET status = 'ready_for_review'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Review fixture');
SELECT results_eq(
  $$ SELECT fixture.title, outbox.status FROM lifecycle_tasks AS fixture
     JOIN public.notification_outbox AS outbox ON outbox.task_id = fixture.id
     WHERE fixture.title IN ('Archive fixture', 'Complete fixture', 'Cancel fixture', 'Review fixture')
     ORDER BY fixture.title $$,
  $$ VALUES ('Archive fixture'::text, 'cancelled'::text),
            ('Cancel fixture', 'cancelled'), ('Complete fixture', 'cancelled'),
            ('Review fixture', 'cancelled') $$,
  'archived, completed, cancelled and review-ready work cancels pending reminders'
);

UPDATE public.tasks SET archived_at = NULL
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Archive fixture');
SELECT is((SELECT status FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Archive fixture')),
  'pending', 'restoring actionable work re-arms its cancelled reminder');
UPDATE public.tasks SET archived_at = statement_timestamp()
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Archive fixture');

UPDATE public.notification_outbox SET status = 'retry', attempt_count = 1,
  next_attempt_at = '2035-02-14 10:00+00', last_error = 'fixture failure'
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
INSERT INTO public.notification_delivery_attempts (outbox_id, attempt_number, outcome, error_message)
SELECT id, 1, 'retry', 'fixture failure' FROM public.notification_outbox
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
UPDATE public.tasks SET title = 'Retry fixture edited'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
SELECT is((SELECT next_attempt_at FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture')),
  '2035-02-14 10:00+00'::timestamptz, 'editing a task preserves retry backoff');

UPDATE public.tasks SET reminder_date = '2035-02-13'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Reschedule fixture');
UPDATE public.tasks SET reminder_date = '2035-02-14'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Reschedule fixture');
SELECT results_eq(
  $$ SELECT status, count(*)::integer FROM public.notification_outbox WHERE task_id =
    (SELECT id FROM lifecycle_tasks WHERE title = 'Reschedule fixture') GROUP BY status ORDER BY status $$,
  $$ VALUES ('cancelled'::text, 1), ('pending'::text, 1) $$,
  'moving a reminder away and back reuses one event and cancels the other'
);

UPDATE public.notification_outbox SET recipient_person_id = '80000000-0000-0000-0000-000000000008'
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Stale recipient fixture');
UPDATE public.notification_outbox SET scheduled_for = '2035-02-13 09:00+00',
  next_attempt_at = '2035-02-13 09:00+00'
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Stale date fixture');
UPDATE public.tasks SET reminder_date = NULL, reminder_time = NULL
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Stale state fixture');
UPDATE public.notification_outbox SET status = 'pending'
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Stale state fixture');

SELECT is((public.run_maintenance_automation('2035-02-14 09:59:59+00', 100)->>'delivered')::integer,
  1, 'only current actionable reminders deliver before the retry boundary');
SELECT results_eq(
  $$ SELECT fixture.title, outbox.status, outbox.attempt_count FROM lifecycle_tasks AS fixture
     JOIN public.notification_outbox AS outbox ON outbox.task_id = fixture.id
     WHERE fixture.title LIKE 'Stale %' ORDER BY fixture.title $$,
  $$ VALUES ('Stale date fixture'::text, 'cancelled'::text, 0),
            ('Stale recipient fixture', 'cancelled', 0), ('Stale state fixture', 'cancelled', 0) $$,
  'delivery revalidates stale dates, recipients and lifecycle without recording an attempt'
);
SELECT is((public.run_maintenance_automation('2035-02-14 10:00+00', 100)->>'delivered')::integer,
  1, 'a retry delivers at its next-attempt boundary');
SELECT results_eq(
  $$ SELECT attempt.attempt_number, attempt.outcome FROM public.notification_delivery_attempts AS attempt
     JOIN public.notification_outbox AS outbox ON outbox.id = attempt.outbox_id
     WHERE outbox.task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture')
     ORDER BY attempt.attempt_number $$,
  $$ VALUES (1, 'retry'::text), (2, 'delivered'::text) $$,
  'retry history retains its failure and records the next attempt once'
);
SELECT is((public.run_maintenance_automation('2035-02-14 10:00+00', 100)->>'delivered')::integer,
  0, 'replaying delivery does not duplicate a successful attempt');
UPDATE public.tasks SET title = 'Already delivered edited'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
SELECT is((SELECT payload->>'title' FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture')),
  'Retry fixture edited', 'task edits preserve delivered reminder evidence');

CREATE TEMP TABLE delivered_event_identity AS
SELECT event_key FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
SET LOCAL timezone TO 'Asia/Phnom_Penh';
SET LOCAL datestyle TO 'SQL, DMY';
UPDATE public.tasks SET title = 'Delivered reminder edited from another session'
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture');
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture')),
  1, 'session timezone and date format cannot create another reminder event');
SELECT is((public.run_maintenance_automation('2035-02-14 10:00+00', 100)->>'delivered')::integer,
  0, 'editing a delivered reminder from another session cannot deliver it again');
SELECT is((SELECT event_key FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Retry fixture') AND status = 'delivered'
  ORDER BY delivered_at, id LIMIT 1),
  (SELECT event_key FROM delivered_event_identity), 'the existing UTC reminder identity is retained');
SELECT is(current_setting('TimeZone'), 'Asia/Phnom_Penh',
  'reminder enqueue restores the caller session timezone');
SELECT is(current_setting('DateStyle'), 'SQL, DMY',
  'reminder enqueue restores the caller session date format');
SET LOCAL timezone TO 'UTC';
SET LOCAL datestyle TO 'ISO, YMD';

UPDATE public.notification_outbox SET status = 'retry', next_attempt_at = '2035-02-14 11:00+00'
WHERE task_id = (SELECT id FROM lifecycle_tasks WHERE title = 'Cancel fixture');
UPDATE public.tasks SET reminder_date = NULL, reminder_time = NULL
WHERE id = (SELECT id FROM lifecycle_tasks WHERE title = 'Cancel fixture');
SELECT is((SELECT status FROM public.notification_outbox WHERE task_id =
  (SELECT id FROM lifecycle_tasks WHERE title = 'Cancel fixture')),
  'cancelled', 'clearing terminal work also cancels legacy retry rows');

SELECT throws_ok($$ SELECT public.run_maintenance_automation('2035-02-14 09:00+00', NULL) $$,
  '22023', 'Invalid maintenance automation boundary', 'a null batch limit fails closed');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.run_maintenance_automation(timestamptz,integer)', 'EXECUTE'),
  'ordinary callers cannot execute the automation boundary');
SELECT ok(has_function_privilege('service_role',
  'public.run_maintenance_automation(timestamptz,integer)', 'EXECUTE'),
  'the scheduler retains its existing service-role authority');

SELECT results_eq(
  $$ SELECT frequency, app_private.next_maintenance_occurrence('2032-01-31 09:00+00', frequency, 'UTC')
     FROM (VALUES ('weekly'), ('monthly'), ('quarterly'), ('semi_annual'), ('annual')) AS f(frequency)
     ORDER BY frequency $$,
  $$ VALUES ('annual'::text, '2033-01-31 09:00+00'::timestamptz),
            ('monthly', '2032-02-29 09:00+00'::timestamptz),
            ('quarterly', '2032-04-30 09:00+00'::timestamptz),
            ('semi_annual', '2032-07-31 09:00+00'::timestamptz),
            ('weekly', '2032-02-07 09:00+00'::timestamptz) $$,
  'all existing calendar frequencies retain month-end and leap-year boundaries'
);
SELECT is(app_private.next_maintenance_occurrence('2032-03-07 14:00+00', 'weekly', 'America/New_York'),
  '2032-03-14 13:00+00'::timestamptz, 'weekly recurrence preserves local time across spring DST');
SELECT is(app_private.next_maintenance_occurrence('2032-10-31 13:00+00', 'weekly', 'America/New_York'),
  '2032-11-07 14:00+00'::timestamptz, 'weekly recurrence preserves local time across autumn DST');

UPDATE public.maintenance_recurrence_series SET lifecycle = 'active'
WHERE id = (SELECT series_id FROM reminder_test_series);
SELECT is((public.run_maintenance_automation('2035-05-14 09:00+00', 2)->>'generated')::integer,
  2, 'advance catch-up respects the generation batch limit');
SELECT is((public.run_maintenance_automation('2035-05-14 09:00+00', 2)->>'generated')::integer,
  1, 'the next catch-up resumes from the durable cursor');
SELECT is((public.run_maintenance_automation('2035-05-14 09:00+00', 2)->>'generated')::integer,
  0, 'repeated catch-up cannot regenerate the same occurrence');
SELECT is((SELECT next_occurrence_at FROM public.maintenance_recurrence_revisions
  WHERE series_id = (SELECT series_id FROM reminder_test_series)),
  '2035-06-15 09:00+00'::timestamptz, 'the cursor advances beyond the reminder window');
SELECT is((SELECT count(*)::integer FROM public.tasks
  WHERE recurrence_series_id = (SELECT series_id FROM reminder_test_series)),
  4, 'catch-up retains exactly one task per occurrence');

UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';
CREATE FUNCTION pg_temp.reminder_series(
  p_timezone text, p_next timestamptz, p_effective timestamptz, p_offset integer
) RETURNS uuid LANGUAGE sql AS $$
  WITH series AS (
    INSERT INTO public.maintenance_recurrence_series (
      organization_id, property_id, branch_id, created_by
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000211',
      '00000000-0000-0000-0000-000000000101'
    ) RETURNING id, organization_id, created_by
  ), revision AS (
    INSERT INTO public.maintenance_recurrence_revisions (
      organization_id, series_id, revision_number, frequency, timezone,
      next_occurrence_at, title, category, priority, reminder_offset_minutes,
      effective_from, created_by
    ) SELECT organization_id, id, 1, 'weekly', p_timezone, p_next,
      'Boundary reminder fixture', 'Plumbing', 'normal', p_offset, p_effective, created_by
    FROM series RETURNING series_id
  ) SELECT series_id FROM revision;
$$;
CREATE TEMP TABLE timezone_series AS
SELECT pg_temp.reminder_series('America/New_York', '2032-03-14 13:00+00',
  '2032-03-14 13:00+00', 1440) AS id;
SELECT is((public.run_maintenance_automation('2032-03-13 12:59:59+00', 10)->>'generated')::integer,
  0, 'a DST occurrence waits for the exact elapsed-minute reminder boundary');
SELECT is((public.run_maintenance_automation('2032-03-13 13:00+00', 10)->>'delivered')::integer,
  1, 'a generated reminder uses its revision timezone rather than the organization timezone');
SELECT results_eq(
  $$ SELECT task.due_date, task.due_time, task.reminder_date, task.reminder_time, outbox.scheduled_for
     FROM public.tasks AS task JOIN public.notification_outbox AS outbox ON outbox.task_id = task.id
     WHERE task.recurrence_series_id = (SELECT id FROM timezone_series) $$,
  $$ VALUES ('2032-03-14'::date, '09:00'::time, '2032-03-13'::date, '08:00'::time,
             '2032-03-13 13:00+00'::timestamptz) $$,
  'local task dates and UTC reminder delivery remain coherent across DST'
);
UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';

CREATE TEMP TABLE effective_series AS
SELECT pg_temp.reminder_series('UTC', '2032-01-01 09:00+00',
  '2032-02-01 09:00+00', 1440) AS id;
SELECT is((public.run_maintenance_automation('2032-01-31 08:59:59+00', 10)->>'generated')::integer,
  0, 'an invalid early cursor cannot generate before the revision effective boundary');
SELECT is((public.run_maintenance_automation('2032-01-31 09:00+00', 10)->>'generated')::integer,
  1, 'generation starts at the effective occurrence reminder boundary');
SELECT is((SELECT min(recurrence_occurrence_at) FROM public.tasks
  WHERE recurrence_series_id = (SELECT id FROM effective_series)),
  '2032-02-01 09:00+00'::timestamptz, 'no occurrence predates its revision effective date');
UPDATE public.maintenance_recurrence_series SET lifecycle = 'retired'
WHERE id = (SELECT id FROM effective_series);
SELECT is((public.run_maintenance_automation('2032-12-31 09:00+00', 10)->>'generated')::integer,
  0, 'paused and retired series never generate future work');

CREATE TEMP TABLE no_reminder_series AS
SELECT pg_temp.reminder_series('UTC', '2040-02-01 09:00+00',
  '2040-02-01 09:00+00', NULL) AS id;
SELECT is((public.run_maintenance_automation('2040-02-01 08:59:59+00', 10)->>'generated')::integer,
  0, 'work without a reminder keeps its due-time generation boundary');
SELECT is((public.run_maintenance_automation('2040-02-01 09:00+00', 10)->>'generated')::integer,
  1, 'work without a reminder materializes exactly when due');
SELECT is((SELECT count(*)::integer FROM public.notification_outbox AS outbox
  JOIN public.tasks AS task ON task.id = outbox.task_id
  WHERE task.recurrence_series_id = (SELECT id FROM no_reminder_series)),
  0, 'a recurrence without a reminder does not invent a notification');

SELECT * FROM finish();
ROLLBACK;
