BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

CREATE TEMP TABLE commit_guard_state (
  atomic_unit_run_id uuid,
  atomic_generic_run_id uuid,
  zero_ready_run_id uuid
) ON COMMIT DROP;

INSERT INTO commit_guard_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON commit_guard_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a7020000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'commit-guard@example.test',
  extensions.crypt('commit-guard', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'a7020000-0000-4000-8000-000000000001',
  'Import commit guard',
  'import-commit-guard'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'a7020000-0000-4000-8000-000000000001',
  'a7020000-0000-4000-8000-000000000002',
  'super_admin'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES (
  'a7020000-0000-4000-8000-000000000003',
  'a7020000-0000-4000-8000-000000000001',
  'Import property owner'
);

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES (
  'a7020000-0000-4000-8000-000000000001',
  'a7020000-0000-4000-8000-000000000003',
  'owner', 'active'
);

INSERT INTO public.properties (id, organization_id, name, code, property_type, status)
VALUES (
  'a7020000-0000-4000-8000-000000000004',
  'a7020000-0000-4000-8000-000000000001',
  'Before import', 'IMP-OWN', 'Apartment', 'active'
);

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent,
  is_primary, started_on
) VALUES (
  'a7020000-0000-4000-8000-000000000005',
  'a7020000-0000-4000-8000-000000000001',
  'a7020000-0000-4000-8000-000000000004',
  'a7020000-0000-4000-8000-000000000003',
  100.000, true, '2026-01-01'
);

INSERT INTO public.import_runs(
  id, organization_id, import_type, status, source_file_name,
  total_rows, ready_rows, warning_rows, error_rows,
  created_count, updated_count, failed_count, skipped_count, committed_at
)
VALUES
  (
    'a7020000-0000-8000-8000-000000000010',
    'a7020000-0000-4000-8000-000000000001',
    'units', 'failed', 'failed-units.csv', 1, 1, 0, 0,
    0, 0, 1, 0, now()
  ),
  (
    'a7020000-0000-8000-8000-000000000020',
    'a7020000-0000-4000-8000-000000000001',
    'properties', 'failed', 'failed-properties.csv', 1, 1, 0, 0,
    0, 0, 1, 0, now()
  ),
  (
    'a7020000-0000-8000-8000-000000000030',
    'a7020000-0000-4000-8000-000000000001',
    'units', 'staged', 'partial-units.csv', 2, 0, 0, 2,
    0, 0, 0, 0, NULL
  ),
  (
    'a7020000-0000-8000-8000-000000000040',
    'a7020000-0000-4000-8000-000000000001',
    'properties', 'staged', 'partial-properties.csv', 2, 0, 0, 2,
    0, 0, 0, 0, NULL
  ),
  (
    'a7020000-0000-8000-8000-000000000050',
    'a7020000-0000-4000-8000-000000000001',
    'properties', 'staged', 'owner-preserving-property.csv', 1, 1, 0, 0,
    0, 0, 0, 0, NULL
  );

INSERT INTO public.import_rows(
  import_run_id, organization_id, source_row_number, row_status,
  action_label, raw_data, normalized_data, issues
)
VALUES
  (
    'a7020000-0000-8000-8000-000000000010',
    'a7020000-0000-4000-8000-000000000001',
    2, 'failed', 'Create', '{}', '{}', '[]'
  ),
  (
    'a7020000-0000-8000-8000-000000000020',
    'a7020000-0000-4000-8000-000000000001',
    2, 'failed', 'Create', '{}', '{}', '[]'
  ),
  (
    'a7020000-0000-8000-8000-000000000030',
    'a7020000-0000-4000-8000-000000000001',
    2, 'error', 'Needs review', '{}', '{}', '[]'
  ),
  (
    'a7020000-0000-8000-8000-000000000040',
    'a7020000-0000-4000-8000-000000000001',
    2, 'error', 'Needs review', '{}', '{}', '[]'
  ),
  (
    'a7020000-0000-8000-8000-000000000050',
    'a7020000-0000-4000-8000-000000000001',
    2, 'ready', 'Update', '{}',
    '{"existingPropertyId":"a7020000-0000-4000-8000-000000000004","name":"After import","code":"IMP-OWN","propertyType":"Apartment","owner":"","address":"Updated by import","status":"active","acquisitionDate":"","notes":"Owner must remain"}',
    '[]'
  );

SELECT set_config(
  'request.jwt.claim.sub',
  'a7020000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

RESET ROLE;
SELECT public.commit_generic_import_run_internal(
  'a7020000-0000-8000-8000-000000000050',
  'a7020000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT status FROM public.import_runs WHERE id = 'a7020000-0000-8000-8000-000000000050'),
  'committed',
  'an existing-property import commits through the owner-preserving update path'
);

SELECT is(
  (SELECT name FROM public.properties WHERE id = 'a7020000-0000-4000-8000-000000000004'),
  'After import',
  'the existing-property import still updates non-ownership facts'
);

SELECT is(
  (SELECT jsonb_build_object(
    'ownerId', id, 'personId', person_id, 'share', ownership_percent,
    'startedOn', started_on, 'endedOn', ended_on
  ) FROM public.property_owners
   WHERE id = 'a7020000-0000-4000-8000-000000000005'),
  jsonb_build_object(
    'ownerId', 'a7020000-0000-4000-8000-000000000005'::uuid,
    'personId', 'a7020000-0000-4000-8000-000000000003'::uuid,
    'share', 100.000::numeric, 'startedOn', '2026-01-01'::date,
    'endedOn', NULL::date
  ),
  'the existing-property import preserves the complete effective owner authority'
);

UPDATE commit_guard_state
SET atomic_unit_run_id = (
  public.stage_import_run_v1(
    'a7020000-0000-4000-8000-000000000001',
    'units', 'atomic-units.csv', 10::bigint, 'text/csv', '["Unit"]',
    '{"unitNumber":"Unit"}',
    '[
      {"source_row_number":2,"row_status":"error","action_label":"Needs review","raw_data":{"Unit":"A"},"normalized_data":{},"issues":[{"level":"error","message":"Blocked"}]},
      {"source_row_number":3,"row_status":"error","action_label":"Needs review","raw_data":{"Unit":"B"},"normalized_data":{},"issues":[{"level":"error","message":"Blocked"}]}
    ]'
  ) ->> 'runId'
)::uuid,
atomic_generic_run_id = (
  public.stage_import_run_v1(
    'a7020000-0000-4000-8000-000000000001',
    'properties', 'atomic-properties.csv', 10::bigint, 'text/csv', '["Code"]',
    '{"code":"Code"}',
    '[
      {"source_row_number":2,"row_status":"error","action_label":"Needs review","raw_data":{"Code":"A"},"normalized_data":{},"issues":[{"level":"error","message":"Blocked"}]},
      {"source_row_number":3,"row_status":"error","action_label":"Needs review","raw_data":{"Code":"B"},"normalized_data":{},"issues":[{"level":"error","message":"Blocked"}]}
    ]'
  ) ->> 'runId'
)::uuid,
zero_ready_run_id = (
  public.stage_import_run_v1(
    'a7020000-0000-4000-8000-000000000001',
    'properties', 'all-blocked.csv', 10::bigint, 'text/csv', '["Code"]',
    '{"code":"Code"}',
    '[{"source_row_number":2,"row_status":"error","action_label":"Needs review","raw_data":{"Code":"BLOCKED"},"normalized_data":{},"issues":[{"level":"error","message":"Blocked"}]}]'
  ) ->> 'runId'
)::uuid;

RESET ROLE;

ALTER TABLE public.import_rows
  DISABLE TRIGGER zz_guard_atomic_import_row_write;
DELETE FROM public.import_rows
WHERE source_row_number = 3
  AND import_run_id IN (
    (SELECT atomic_unit_run_id FROM commit_guard_state),
    (SELECT atomic_generic_run_id FROM commit_guard_state)
  );
ALTER TABLE public.import_rows
  ENABLE TRIGGER zz_guard_atomic_import_row_write;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.commit_unit_import_run(
    'a7020000-0000-8000-8000-000000000010',
    'a7020000-0000-4000-8000-000000000001'
  )$$,
  '22023',
  'Import run must be staged before commit',
  'Unit commit rejects an all-failed concurrent winner'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', status, 'failed', failed_count, 'committedAt', committed_at
    )
    FROM public.import_runs
    WHERE id = 'a7020000-0000-8000-8000-000000000010'
  ),
  jsonb_build_object(
    'status', 'failed', 'failed', 1, 'committedAt',
    (SELECT committed_at FROM public.import_runs
     WHERE id = 'a7020000-0000-8000-8000-000000000010')
  ),
  'rejected Unit replay preserves the terminal failed result'
);

SELECT throws_ok(
  $$SELECT public.commit_generic_import_run(
    'a7020000-0000-8000-8000-000000000020',
    'a7020000-0000-4000-8000-000000000001'
  )$$,
  '22023',
  'Import run must be staged before commit',
  'generic commit rejects an all-failed concurrent winner'
);

SELECT is(
  (
    SELECT jsonb_build_object('status', status, 'failed', failed_count)
    FROM public.import_runs
    WHERE id = 'a7020000-0000-8000-8000-000000000020'
  ),
  '{"status":"failed","failed":1}'::jsonb,
  'rejected generic replay preserves the terminal failed result'
);

SELECT throws_ok(
  $$SELECT public.commit_unit_import_run(
    'a7020000-0000-8000-8000-000000000030',
    'a7020000-0000-4000-8000-000000000001'
  )$$,
  '23514',
  'Incomplete staged import must be re-uploaded before commit',
  'Unit commit rejects incomplete staging'
);

SELECT is(
  (SELECT status FROM public.import_runs
   WHERE id = 'a7020000-0000-8000-8000-000000000030'),
  'staged',
  'rejected incomplete Unit run remains staged'
);

SELECT throws_ok(
  $$SELECT public.commit_generic_import_run(
    'a7020000-0000-8000-8000-000000000040',
    'a7020000-0000-4000-8000-000000000001'
  )$$,
  '23514',
  'Incomplete staged import must be re-uploaded before commit',
  'generic commit rejects incomplete staging'
);

SELECT is(
  (SELECT status FROM public.import_runs
   WHERE id = 'a7020000-0000-8000-8000-000000000040'),
  'staged',
  'rejected incomplete generic run remains staged'
);

SELECT throws_ok(
  format(
    'SELECT public.commit_unit_import_run(%L, %L)',
    (SELECT atomic_unit_run_id FROM commit_guard_state),
    'a7020000-0000-4000-8000-000000000001'
  ),
  '23514',
  'Import run staging summary does not match its complete row set',
  'Unit commit validates exact atomic row counts before delegating'
);

SELECT is(
  (SELECT status FROM public.import_runs
   WHERE id = (SELECT atomic_unit_run_id FROM commit_guard_state)),
  'staged',
  'rejected incomplete atomic Unit run remains staged'
);

SELECT throws_ok(
  format(
    'SELECT public.commit_generic_import_run(%L, %L)',
    (SELECT atomic_generic_run_id FROM commit_guard_state),
    'a7020000-0000-4000-8000-000000000001'
  ),
  '23514',
  'Import run staging summary does not match its complete row set',
  'generic commit validates exact atomic row counts before delegating'
);

SELECT is(
  (SELECT status FROM public.import_runs
   WHERE id = (SELECT atomic_generic_run_id FROM commit_guard_state)),
  'staged',
  'rejected incomplete atomic generic run remains staged'
);

SELECT throws_ok(
  format(
    'SELECT public.commit_generic_import_run(%L, %L)',
    (SELECT zero_ready_run_id FROM commit_guard_state),
    'a7020000-0000-4000-8000-000000000001'
  ),
  '22023',
  'Import run has no ready rows to commit',
  'public commit rejects a complete all-blocked atomic run'
);

SELECT is(
  (SELECT status FROM public.import_runs
   WHERE id = (SELECT zero_ready_run_id FROM commit_guard_state)),
  'staged',
  'all-blocked atomic run remains staged for correction and re-upload'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
