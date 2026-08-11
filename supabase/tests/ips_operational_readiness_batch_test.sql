BEGIN;

SELECT plan(28);

SELECT has_table(
  'public',
  'maintenance_recurrence_series',
  'recurring maintenance has one stable series authority'
);
SELECT has_table(
  'public',
  'maintenance_recurrence_revisions',
  'recurring maintenance preserves immutable schedule revisions'
);
SELECT has_table(
  'public',
  'notification_outbox',
  'notification delivery survives a closed browser'
);
SELECT has_table(
  'public',
  'notification_delivery_attempts',
  'delivery attempts and retries are auditable'
);
SELECT has_column(
  'public',
  'tasks',
  'recurrence_series_id',
  'generated tasks retain their stable recurrence series'
);
SELECT has_column(
  'public',
  'tasks',
  'recurrence_revision_id',
  'generated tasks retain their recurrence revision'
);
SELECT has_column(
  'public',
  'tasks',
  'recurrence_occurrence_at',
  'generated tasks retain a deterministic occurrence key'
);
SELECT has_function(
  'public',
  'run_maintenance_automation',
  ARRAY['timestamp with time zone', 'integer'],
  'the scheduler has one private transactional runner'
);
SELECT has_function(
  'public',
  'get_ips_setup_readiness',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'date'],
  'setup uses one compositional readiness result'
);
SELECT has_function(
  'public',
  'get_maintenance_notification_feed',
  ARRAY['uuid', 'integer'],
  'operators can read durable in-app notification delivery'
);
SELECT has_function(
  'public',
  'register_paid_cost_evidence_verified',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'bigint', 'text',
    'uuid', 'text', 'text', 'uuid'
  ],
  'the exclusive registrar can bind evidence to a maintenance task'
);
SELECT col_is_unique(
  'public',
  'notification_outbox',
  ARRAY['organization_id', 'event_key'],
  'one durable notification exists per organization event'
);

CREATE TEMP TABLE readiness_batch_ids AS
SELECT organization.id AS organization_id,
  property.id AS property_id,
  task.created_by
FROM public.organizations AS organization
JOIN public.properties AS property
  ON property.organization_id = organization.id
 AND property.archived_at IS NULL
JOIN public.tasks AS task
  ON task.organization_id = organization.id
 AND task.property_id = property.id
 AND task.created_by IS NOT NULL
LIMIT 1;

UPDATE public.maintenance_recurrence_series SET lifecycle = 'paused';

WITH new_series AS (
  INSERT INTO public.maintenance_recurrence_series (
    organization_id, property_id, lifecycle, created_by
  )
  SELECT organization_id, property_id, 'active', created_by
  FROM readiness_batch_ids
  RETURNING id, organization_id, property_id, created_by
)
INSERT INTO public.maintenance_recurrence_revisions (
  organization_id, series_id, revision_number, frequency, timezone,
  next_occurrence_at, title, category, priority, checklist,
  effective_from, created_by
)
SELECT organization_id, id, 1, 'monthly', 'UTC',
  '2030-01-15 09:00:00+00'::timestamptz,
  'Monthly readiness test', 'Preventive maintenance', 'normal', '[]'::jsonb,
  '2030-01-15 09:00:00+00'::timestamptz, created_by
FROM new_series;

SELECT is(
  (public.run_maintenance_automation(
    '2030-03-15 09:00:00+00'::timestamptz,
    10
  )->>'generated')::integer,
  3,
  'one recovery run catches up every due recurrence occurrence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tasks AS task
    JOIN public.maintenance_recurrence_revisions AS revision
      ON revision.id = task.recurrence_revision_id
    WHERE revision.title = 'Monthly readiness test'
      AND task.recurrence_occurrence_at BETWEEN
        '2030-01-15 09:00:00+00'::timestamptz AND
        '2030-03-15 09:00:00+00'::timestamptz
  ),
  3,
  'catch-up creates one uniquely keyed task per scheduled occurrence'
);

UPDATE public.maintenance_recurrence_revisions
SET superseded_at = statement_timestamp(),
    superseded_by = created_by
WHERE title = 'Monthly readiness test'
  AND superseded_at IS NULL;

INSERT INTO public.maintenance_recurrence_revisions (
  organization_id, series_id, revision_number, frequency, timezone,
  next_occurrence_at, title, category, priority, checklist,
  effective_from, created_by
)
SELECT organization_id, series_id, 2, frequency, timezone,
  '2030-03-15 09:00:00+00'::timestamptz,
  'Monthly readiness test revised', category, priority, checklist,
  '2030-03-15 09:00:00+00'::timestamptz, created_by
FROM public.maintenance_recurrence_revisions
WHERE title = 'Monthly readiness test'
  AND revision_number = 1;

SELECT is(
  (public.run_maintenance_automation(
    '2030-03-15 09:00:00+00'::timestamptz,
    10
  )->>'generated')::integer,
  0,
  'a new revision cannot regenerate an existing series occurrence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tasks AS task
    JOIN public.maintenance_recurrence_series AS series
      ON series.id = task.recurrence_series_id
    WHERE series.id = (
      SELECT revision.series_id
      FROM public.maintenance_recurrence_revisions AS revision
      WHERE revision.title = 'Monthly readiness test'
      LIMIT 1
    )
  ),
  3,
  'series-scoped uniqueness preserves one task per occurrence across revisions'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_requests AS request
    WHERE request.title IN (
      'Monthly readiness test', 'Monthly readiness test revised'
    )
  ),
  3,
  'a duplicate series occurrence does not leave an orphan tenant request'
);

CREATE TEMP TABLE recurrence_edit_state (
  task_id uuid
) ON COMMIT DROP;
GRANT ALL ON recurrence_edit_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO recurrence_edit_state (task_id)
SELECT public.create_maintenance_task(
  '00000000-0000-0000-0000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000001'::uuid,
  '20000000-0000-0000-0000-000000000001'::uuid,
  'Recurring edit contract', 'Original schedule', 'Preventive maintenance',
  'normal', 'pending', '2031-01-10'::date, '09:00'::time,
  '2031-01-09'::date, '09:00'::time, NULL, 25, 'USD'::public.currency_code,
  '[]'::jsonb, 'monthly',
  '00000000-0000-0000-0000-000000000211'::uuid,
  '80000000-0000-0000-0000-000000000008'::uuid
);

SELECT lives_ok(
  $$
    SELECT public.update_maintenance_task(
      (SELECT task_id FROM recurrence_edit_state),
      '00000000-0000-0000-0000-000000000001'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '20000000-0000-0000-0000-000000000001'::uuid,
      'Recurring edit contract revised', 'Revised schedule',
      'Preventive maintenance', 'high', 'pending',
      '2031-01-17'::date, '10:00'::time,
      '2031-01-16'::date, '10:00'::time, NULL, 35,
      'USD'::public.currency_code, NULL, NULL, '[]'::jsonb, 'weekly',
      '00000000-0000-0000-0000-000000000211'::uuid,
      '80000000-0000-0000-0000-000000000008'::uuid
    )
  $$,
  'editing a recurring task creates a new durable schedule revision'
);
RESET ROLE;

SELECT results_eq(
  $$
    SELECT count(*)::integer,
      count(*) FILTER (WHERE revision.superseded_at IS NULL)::integer,
      max(revision.title) FILTER (WHERE revision.superseded_at IS NULL)
    FROM public.maintenance_recurrence_revisions AS revision
    WHERE revision.series_id = (
      SELECT task.recurrence_series_id
      FROM public.tasks AS task
      WHERE task.id = (SELECT task_id FROM recurrence_edit_state)
    )
  $$,
  $$ VALUES (2, 1, 'Recurring edit contract revised'::text) $$,
  'the prior revision is superseded and the edited payload is current'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    SELECT public.update_maintenance_task(
      (SELECT task_id FROM recurrence_edit_state),
      '00000000-0000-0000-0000-000000000001'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '20000000-0000-0000-0000-000000000001'::uuid,
      'Recurring edit contract revised', 'Retired schedule',
      'Preventive maintenance', 'high', 'pending',
      '2031-01-17'::date, '10:00'::time,
      NULL, NULL, NULL, 35, 'USD'::public.currency_code,
      NULL, NULL, '[]'::jsonb, 'none',
      '00000000-0000-0000-0000-000000000211'::uuid,
      '80000000-0000-0000-0000-000000000008'::uuid
    )
  $$,
  'choosing one-time retires the durable recurrence schedule'
);
RESET ROLE;

SELECT is(
  (
    SELECT series.lifecycle
    FROM public.maintenance_recurrence_series AS series
    WHERE series.id = (
      SELECT task.recurrence_series_id
      FROM public.tasks AS task
      WHERE task.id = (SELECT task_id FROM recurrence_edit_state)
    )
  ),
  'retired',
  'a retired series cannot generate future tasks'
);

CREATE TEMP TABLE deposit_derivation_state AS
SELECT lease.organization_id, lease.id AS lease_id, lease.property_id,
  'de000000-0000-0000-0000-000000000001'::uuid AS deposit_id
FROM public.current_leases AS lease
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND lease.property_id = '10000000-0000-0000-0000-000000000001'::uuid
LIMIT 1;

INSERT INTO public.lease_deposits (
  id, organization_id, lease_id, amount, currency, status, created_by
)
SELECT deposit_id, organization_id, lease_id, 100, 'USD', 'held',
  '00000000-0000-0000-0000-000000000101'::uuid
FROM deposit_derivation_state;

SELECT is(
  (SELECT status FROM public.lease_deposits WHERE id =
    'de000000-0000-0000-0000-000000000001'::uuid),
  'pending',
  'a deposit without received evidence remains pending'
);

INSERT INTO public.lease_deposit_events (
  organization_id, property_id, lease_deposit_id, event_type, event_date,
  amount, currency, reference, created_by
)
SELECT organization_id, property_id, deposit_id, 'received', DATE '2030-01-01',
  100, 'USD', 'batch-status-derivation',
  '00000000-0000-0000-0000-000000000101'::uuid
FROM deposit_derivation_state;

SELECT is(
  (SELECT status FROM public.lease_deposits WHERE id =
    'de000000-0000-0000-0000-000000000001'::uuid),
  'held',
  'received-event evidence derives the deposit custody status'
);

INSERT INTO public.notification_outbox (
  organization_id, branch_id, recipient_person_id, event_key, event_type,
  payload, scheduled_for, status, next_attempt_at, delivered_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000211',
    '80000000-0000-0000-0000-000000000008',
    'batch-member-assigned-reminder', 'maintenance_reminder',
    '{"title":"Batch member assigned","href":"/maintenance"}'::jsonb,
    now(), 'delivered', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    NULL,
    '80000000-0000-0000-0000-000000000007',
    'batch-other-recipient-reminder', 'maintenance_reminder',
    '{"title":"Batch other recipient","href":"/maintenance"}'::jsonb,
    now(), 'delivered', now(), now()
  );

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000601',
  true
);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT feed.title
    FROM public.get_maintenance_notification_feed(
      '00000000-0000-0000-0000-000000000001'::uuid, 100
    ) AS feed
    WHERE feed.title LIKE 'Batch %'
    ORDER BY feed.title
  $$,
  $$ VALUES ('Batch member assigned'::text) $$,
  'Operations Member notifications are limited to the assigned recipient'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT feed.title
    FROM public.get_maintenance_notification_feed(
      '00000000-0000-0000-0000-000000000001'::uuid, 100
    ) AS feed
    WHERE feed.title LIKE 'Batch %'
    ORDER BY feed.title
  $$,
  $$ VALUES ('Batch member assigned'::text) $$,
  'Operations Manager notifications stay inside the exact assigned branch'
);
RESET ROLE;

INSERT INTO public.people (
  id, organization_id, display_name, created_by, updated_by
) VALUES (
  '8f000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Opening readiness owner without authority',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);
INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
) VALUES (
  '9f000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '8f000000-0000-0000-0000-000000000001',
  'Readiness test owner', 1, false, DATE '2024-01-01',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT (item->>'ready')::boolean
    FROM public.current_leases AS lease
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      public.get_ips_setup_readiness(
        lease.organization_id, lease.property_id, lease.unit_id, lease.id,
        DATE '2028-08-01'
      )->'items'
    ) AS item
    WHERE lease.organization_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      AND lease.property_id =
        '10000000-0000-0000-0000-000000000001'::uuid
      AND item->>'code' = 'opening_balance'
    LIMIT 1
  ),
  false,
  'current owners without same-currency opening authority keep setup blocked'
);
RESET ROLE;

CREATE TEMP TABLE occupancy_readiness_target AS
SELECT
  lease.organization_id,
  lease.property_id,
  lease.unit_id,
  lease.id AS lease_id,
  occupancy.id AS occupancy_id,
  lower(occupancy.actual_effective_range) AS effective_date
FROM public.current_leases AS lease
JOIN public.lease_occupancies AS occupancy
  ON occupancy.organization_id = lease.organization_id
 AND occupancy.lease_id = lease.id
JOIN public.lease_occupancy_participants AS participant
  ON participant.organization_id = occupancy.organization_id
 AND participant.lease_occupancy_id = occupancy.id
WHERE lease.organization_id =
    '00000000-0000-0000-0000-000000000001'::uuid
  AND lease.status IN ('active', 'notice_given')
  AND occupancy.actual_effective_range IS NOT NULL
  AND participant.effective_range IS NOT NULL
LIMIT 1;

GRANT SELECT ON occupancy_readiness_target TO authenticated;

SELECT set_config('app.people_leases_skip_sync', 'on', true);
UPDATE public.lease_occupancies AS occupancy
SET
  actual_move_in_date = NULL,
  actual_move_in_kind = 'unknown',
  actual_move_in_confidence = 'unknown',
  actual_move_out_date = NULL,
  actual_move_out_kind = 'unknown',
  actual_move_out_confidence = 'unknown'
FROM occupancy_readiness_target AS target
WHERE occupancy.organization_id = target.organization_id
  AND occupancy.id = target.occupancy_id;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT (item->>'ready')::boolean
    FROM occupancy_readiness_target AS target
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      public.get_ips_setup_readiness(
        target.organization_id,
        target.property_id,
        target.unit_id,
        target.lease_id,
        target.effective_date
      )->'items'
    ) AS item
    WHERE item->>'code' = 'occupancy'
  ),
  false,
  'scheduled or lifecycle facts without accepted actual occupancy stay blocked'
);
RESET ROLE;

SELECT set_config('app.people_leases_skip_sync', 'on', true);
UPDATE public.lease_occupancies AS occupancy
SET
  actual_move_in_date = target.effective_date,
  actual_move_in_kind = 'known',
  actual_move_in_confidence = 'confirmed',
  actual_move_out_date = NULL,
  actual_move_out_kind = 'open_current',
  actual_move_out_confidence = 'confirmed'
FROM occupancy_readiness_target AS target
WHERE occupancy.organization_id = target.organization_id
  AND occupancy.id = target.occupancy_id;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT (item->>'ready')::boolean
    FROM occupancy_readiness_target AS target
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      public.get_ips_setup_readiness(
        target.organization_id,
        target.property_id,
        target.unit_id,
        target.lease_id,
        target.effective_date
      )->'items'
    ) AS item
    WHERE item->>'code' = 'occupancy'
  ),
  true,
  'accepted actual occupancy and contained resident evidence satisfy readiness'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
