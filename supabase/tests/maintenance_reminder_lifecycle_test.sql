BEGIN;

SELECT plan(5);

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
)
INSERT INTO public.maintenance_recurrence_revisions (
  organization_id, series_id, revision_number, frequency, timezone,
  next_occurrence_at, title, category, priority, reminder_offset_minutes,
  effective_from, created_by
)
SELECT organization_id, id, 1, 'monthly', 'UTC',
  '2035-02-15 09:00+00', 'Advance reminder fixture', 'Preventive maintenance',
  'normal', 1440, '2035-02-15 09:00+00', created_by
FROM series RETURNING series_id;

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

SELECT * FROM finish();
ROLLBACK;
