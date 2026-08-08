BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

CREATE TEMP TABLE atomic_import_state (
  first_result jsonb,
  replay_result jsonb,
  replacement_result jsonb,
  lease_first_result jsonb,
  lease_replacement_result jsonb,
  terminal_result jsonb,
  terminal_row_snapshot jsonb,
  tamper_result jsonb,
  issues_guard_result jsonb
) ON COMMIT DROP;

INSERT INTO atomic_import_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON atomic_import_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a7010000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'atomic-import@example.test',
  extensions.crypt('atomic-import', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'a7010000-0000-4000-8000-000000000001',
  'Atomic import staging',
  'atomic-import-staging'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'a7010000-0000-4000-8000-000000000001',
  'a7010000-0000-4000-8000-000000000002',
  'super_admin'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.stage_import_run_v1(uuid,text,text,bigint,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute atomic import staging'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.stage_import_run_v1(uuid,text,text,bigint,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service role can execute atomic import staging'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.stage_import_run_v1(uuid,text,text,bigint,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute atomic import staging'
);

SELECT ok(
  has_column_privilege(
    'authenticated', 'public.import_runs', 'source_file_name', 'INSERT,UPDATE'
  )
    AND NOT has_column_privilege(
      'authenticated', 'public.import_runs', 'source_claim_hash', 'INSERT,UPDATE'
    )
    AND NOT has_column_privilege(
      'authenticated', 'public.import_runs', 'snapshot_hash', 'INSERT,UPDATE'
    )
    AND has_table_privilege('authenticated', 'public.import_runs', 'DELETE'),
  'authenticated retains scoped run writes except database-owned hash columns'
);

SELECT ok(
  has_column_privilege(
    'authenticated', 'public.import_rows', 'raw_data', 'INSERT,UPDATE'
  )
    AND has_column_privilege(
      'authenticated', 'public.import_rows', 'row_status', 'INSERT,UPDATE'
    )
    AND NOT has_column_privilege(
      'authenticated', 'public.import_rows', 'result_lease_id', 'INSERT,UPDATE'
    )
    AND NOT has_column_privilege(
      'authenticated', 'public.import_rows', 'result_lease_party_id', 'INSERT,UPDATE'
    )
    AND NOT has_column_privilege(
      'authenticated', 'public.import_rows', 'result_lease_occupancy_id', 'INSERT,UPDATE'
    )
    AND has_table_privilege('authenticated', 'public.import_rows', 'DELETE'),
  'authenticated retains scoped row writes behind the staging guards'
);

SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', 'a7010000-0000-4000-8000-000000000001',
    'sourceClaimHash', repeat('a', 64),
    'runId', 'a7010000-0000-8000-8000-000000000099'
  )::text,
  true
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.import_runs(
      id, organization_id, import_type, status, source_file_name,
      source_claim_hash, snapshot_hash
    )
    VALUES (
      'a7010000-0000-8000-8000-000000000099',
      'a7010000-0000-4000-8000-000000000001',
      'people', 'staged', 'one-null-hash.csv', repeat('a', 64), NULL
    )
  $sql$,
  '23514',
  NULL,
  'claim and snapshot hashes must be both null or both present'
);

SELECT set_config('app.atomic_import_write_context', '', true);

SELECT set_config(
  'request.jwt.claim.sub',
  'a7010000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

UPDATE atomic_import_state
SET first_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'properties', 'first-properties.csv', 111::bigint, 'text/csv',
  '["Property Code","Property Name"]',
  '{"code":"Property Code","name":"Property Name"}',
  '[
    {"source_row_number":2,"row_status":"ready","action_label":"  Create  ","raw_data":{"Property Code":"P1","Property Name":"First"},"normalized_data":{"code":"P1","existingPropertyId":null,"name":"First"},"issues":[]},
    {"source_row_number":3,"row_status":"warning","action_label":"Create","raw_data":{"Property Code":"P2","Property Name":"Second"},"normalized_data":{"code":"P2","existingPropertyId":null,"name":"Second"},"issues":[{"level":"warning","message":"Review"}]}
  ]'
);

SELECT is(
  (SELECT first_result - 'runId' FROM atomic_import_state),
  jsonb_build_object(
    'status', 'staged', 'sourceFileName', 'first-properties.csv',
    'total', 2, 'ready', 2, 'warnings', 1, 'blocked', 0,
    'created', 0, 'updated', 0, 'failed', 0, 'skipped', 0
  ),
  'new staging returns SQL-derived stored summary'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.import_runs
    WHERE id = ((SELECT first_result ->> 'runId' FROM atomic_import_state))::uuid
      AND source_claim_hash ~ '^[0-9a-f]{64}$'
      AND snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  'new atomic run stores its database-computed hash pair'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'total', total_rows, 'ready', ready_rows,
      'warnings', warning_rows, 'blocked', error_rows,
      'rows', (SELECT count(*) FROM public.import_rows WHERE import_run_id = runs.id),
      'action', (SELECT action_label FROM public.import_rows WHERE import_run_id = runs.id AND source_row_number = 2)
    )
    FROM public.import_runs AS runs
    WHERE id = ((SELECT first_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  '{"total":2,"ready":2,"warnings":1,"blocked":0,"rows":2,"action":"Create"}'::jsonb,
  'new atomic run is complete and snapshot hashing uses the inserted trimmed action'
);

SELECT set_config(
  'app.atomic_import_write_context',
  (
    SELECT jsonb_build_object(
      'operation', 'stage-v1',
      'organizationId', organization_id,
      'sourceClaimHash', source_claim_hash,
      'runId', id
    )::text
    FROM public.import_runs
    WHERE id = ((SELECT first_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  true
);

SELECT throws_ok(
  format(
    'UPDATE public.import_runs SET source_file_name = %L WHERE id = %L',
    'spoofed.csv',
    (SELECT first_result ->> 'runId' FROM atomic_import_state)
  ),
  '42501',
  'Atomic import runs can only be written by their checked RPC',
  'authenticated cannot spoof a bound atomic stage context to update a run'
);

SELECT throws_ok(
  format(
    'UPDATE public.import_rows SET raw_data = %L WHERE import_run_id = %L',
    '{"Property Code":"P1","Property Name":"Spoofed"}',
    (SELECT first_result ->> 'runId' FROM atomic_import_state)
  ),
  '42501',
  'Atomic import rows can only be written by their checked RPC',
  'authenticated cannot spoof a bound atomic stage context to update rows'
);

SELECT throws_ok(
  format(
    'DELETE FROM public.import_rows WHERE import_run_id = %L',
    (SELECT first_result ->> 'runId' FROM atomic_import_state)
  ),
  '42501',
  'Atomic import rows can only be written by their checked RPC',
  'authenticated cannot spoof a bound atomic stage context to delete rows'
);

SELECT set_config('app.atomic_import_write_context', '', true);

UPDATE atomic_import_state
SET issues_guard_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'people', 'issues-guard.csv', 10::bigint, 'text/csv', '["Name"]',
  '{"displayName":"Name"}',
  '[{"source_row_number":2,"row_status":"warning","action_label":"Create","raw_data":{"Name":"Guarded"},"normalized_data":{"displayName":"Guarded"},"issues":[{"level":"warning","message":"Review"}]}]'
);

RESET ROLE;
SELECT set_config(
  'app.atomic_import_write_context',
  (
    SELECT jsonb_build_object(
      'operation', 'commit-v1',
      'organizationId', organization_id,
      'sourceClaimHash', source_claim_hash,
      'runId', id
    )::text
    FROM public.import_runs
    WHERE id = ((SELECT issues_guard_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  true
);

UPDATE public.import_runs
SET status = 'committing'
WHERE id = ((SELECT issues_guard_result ->> 'runId' FROM atomic_import_state))::uuid;

SELECT throws_ok(
  format(
    'UPDATE public.import_rows SET issues = %L WHERE import_run_id = %L',
    '[]',
    (SELECT issues_guard_result ->> 'runId' FROM atomic_import_state)
  ),
  '55000',
  'Atomic import row transition is not a checked commit outcome',
  'atomic commit context cannot remove staged issues'
);

SELECT throws_ok(
  format(
    'UPDATE public.import_rows SET issues = %L WHERE import_run_id = %L',
    '[{"level":"warning","message":"Replacement"}]',
    (SELECT issues_guard_result ->> 'runId' FROM atomic_import_state)
  ),
  '55000',
  'Atomic import row transition is not a checked commit outcome',
  'atomic commit context cannot replace staged issues'
);

SELECT throws_ok(
  format(
    'UPDATE public.import_rows SET issues = issues || %L::jsonb WHERE import_run_id = %L',
    '[{"level":"warning","message":"Arbitrary append"}]',
    (SELECT issues_guard_result ->> 'runId' FROM atomic_import_state)
  ),
  '55000',
  'Atomic import row transition is not a checked commit outcome',
  'atomic commit context cannot append arbitrary issue evidence'
);

SELECT set_config('app.atomic_import_write_context', '', true);
SET LOCAL ROLE authenticated;

UPDATE atomic_import_state
SET replay_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'properties', 'renamed.csv', 999::bigint, 'application/vnd.ms-excel',
  '["Property Code","Property Name"]',
  '{"name":"Property Name","code":"Property Code"}',
  '[
    {"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Property Name":"First","Property Code":"P1"},"normalized_data":{"name":"First","existingPropertyId":null,"code":"P1"},"issues":[]},
    {"source_row_number":3,"row_status":"warning","action_label":"Create","raw_data":{"Property Name":"Second","Property Code":"P2"},"normalized_data":{"name":"Second","existingPropertyId":null,"code":"P2"},"issues":[{"message":"Review","level":"warning"}]}
  ]'
);

SELECT is(
  (SELECT replay_result FROM atomic_import_state),
  (SELECT first_result FROM atomic_import_state),
  'same raw claim and semantic snapshot reuse the stored run despite file metadata changes'
);

UPDATE atomic_import_state
SET replacement_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'properties', 'references-fixed.csv', 222::bigint, 'text/csv',
  '["Property Code","Property Name"]',
  '{"code":"Property Code","name":"Property Name"}',
  '[
    {"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"Property Code":"P1","Property Name":"First"},"normalized_data":{"code":"P1","existingPropertyId":"property-1","name":"First"},"issues":[]},
    {"source_row_number":3,"row_status":"ready","action_label":"Update","raw_data":{"Property Code":"P2","Property Name":"Second"},"normalized_data":{"code":"P2","existingPropertyId":"property-2","name":"Second"},"issues":[]}
  ]'
);

SELECT isnt(
  (SELECT replacement_result ->> 'runId' FROM atomic_import_state),
  (SELECT first_result ->> 'runId' FROM atomic_import_state),
  'changed reference-derived staged snapshot gets a new server run ID'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.import_runs
    WHERE id = ((SELECT first_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  0::bigint,
  'clean prior staged run is atomically deleted during replacement'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'file', runs.source_file_name,
      'ready', runs.ready_rows,
      'warning', runs.warning_rows,
      'action', rows.action_label,
      'existing', rows.normalized_data ->> 'existingPropertyId'
    )
    FROM public.import_runs AS runs
    JOIN public.import_rows AS rows ON rows.import_run_id = runs.id
    WHERE runs.id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid
      AND rows.source_row_number = 2
  ),
  '{"file":"references-fixed.csv","ready":2,"warning":0,"action":"Update","existing":"property-1"}'::jsonb,
  'replacement stores one complete new semantic snapshot'
);

UPDATE atomic_import_state
SET lease_first_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'leases', 'leases.csv', 10::bigint, 'text/csv', '["Tenant"]',
  '{"tenantName":"Tenant"}',
  '[{"source_row_number":2,"row_status":"error","action_label":"Needs review","raw_data":{"Tenant":"Missing"},"normalized_data":{"tenantPersonId":null},"issues":[{"level":"error","message":"Missing tenant"}]}]'
);

UPDATE atomic_import_state
SET lease_replacement_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'leases', 'leases.csv', 10::bigint, 'text/csv', '["Tenant"]',
  '{"tenantName":"Tenant"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Tenant":"Missing"},"normalized_data":{"tenantPersonId":"person-now-present"},"issues":[]}]'
);

SELECT isnt(
  (SELECT lease_replacement_result ->> 'runId' FROM atomic_import_state),
  (SELECT lease_first_result ->> 'runId' FROM atomic_import_state),
  'clean staged Lease snapshot can be replaced through parent cascade'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.import_runs
    WHERE id = ((SELECT lease_first_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  0::bigint,
  'Lease replacement removes the old parent and child rows'
);

RESET ROLE;

SELECT set_config(
  'app.atomic_import_write_context',
  (
    SELECT jsonb_build_object(
      'operation', 'commit-v1',
      'organizationId', organization_id,
      'sourceClaimHash', source_claim_hash,
      'runId', id
    )::text
    FROM public.import_runs
    WHERE id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid
  ),
  true
);

UPDATE public.import_runs
SET status = 'committing'
WHERE id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid;

UPDATE public.import_rows
SET
  row_status = 'failed',
  error_message = 'terminal fixture failure',
  issues = issues || '[{"level":"error","message":"terminal fixture failure"}]'::jsonb
WHERE import_run_id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid;

UPDATE public.import_runs
SET
  status = 'failed',
  failed_count = 2,
  error_message = 'Some rows could not be committed.',
  committed_at = now()
WHERE id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid;

SELECT set_config('app.atomic_import_write_context', '', true);

UPDATE atomic_import_state
SET terminal_row_snapshot = (
  SELECT jsonb_build_object('run', to_jsonb(runs), 'rows', jsonb_agg(to_jsonb(rows) ORDER BY rows.source_row_number))
  FROM public.import_runs AS runs
  JOIN public.import_rows AS rows ON rows.import_run_id = runs.id
  WHERE runs.id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid
  GROUP BY runs.id
);

SET LOCAL ROLE authenticated;

UPDATE atomic_import_state
SET terminal_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'properties', 'later.csv', 333::bigint, 'text/csv',
  '["Property Code","Property Name"]',
  '{"code":"Property Code","name":"Property Name"}',
  '[
    {"source_row_number":2,"row_status":"error","action_label":"Needs review","raw_data":{"Property Code":"P1","Property Name":"First"},"normalized_data":{},"issues":[{"level":"error","message":"Later validation"}]},
    {"source_row_number":3,"row_status":"error","action_label":"Needs review","raw_data":{"Property Code":"P2","Property Name":"Second"},"normalized_data":{},"issues":[{"level":"error","message":"Later validation"}]}
  ]'
);

SELECT is(
  (SELECT terminal_result ->> 'runId' FROM atomic_import_state),
  (SELECT replacement_result ->> 'runId' FROM atomic_import_state),
  'terminal raw claim returns the existing run instead of replacing it'
);

SELECT is(
  (
    SELECT jsonb_build_object('run', to_jsonb(runs), 'rows', jsonb_agg(to_jsonb(rows) ORDER BY rows.source_row_number))
    FROM public.import_runs AS runs
    JOIN public.import_rows AS rows ON rows.import_run_id = runs.id
    WHERE runs.id = ((SELECT replacement_result ->> 'runId' FROM atomic_import_state))::uuid
    GROUP BY runs.id
  ),
  (SELECT terminal_row_snapshot FROM atomic_import_state),
  'terminal recovery leaves stored run and rows immutable'
);

UPDATE atomic_import_state
SET tamper_result = public.stage_import_run_v1(
  'a7010000-0000-4000-8000-000000000001',
  'people', 'people.csv', 10::bigint, 'text/csv', '["Name"]',
  '{"displayName":"Name"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"Original"},"normalized_data":{"displayName":"Original"},"issues":[]}]'
);

RESET ROLE;
ALTER TABLE public.import_rows DISABLE TRIGGER zz_guard_atomic_import_row_write;
UPDATE public.import_rows
SET raw_data = '{"Name":"Tampered"}'
WHERE import_run_id = ((SELECT tamper_result ->> 'runId' FROM atomic_import_state))::uuid;
ALTER TABLE public.import_rows ENABLE TRIGGER zz_guard_atomic_import_row_write;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $sql$
    SELECT public.stage_import_run_v1(
      'a7010000-0000-4000-8000-000000000001',
      'people', 'people.csv', 10::bigint, 'text/csv', '["Name"]',
      '{"displayName":"Name"}',
      '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"Original"},"normalized_data":{"displayName":"Original"},"issues":[]}]'
    )
  $sql$,
  '23505',
  'Import source claim collision or tamper detected',
  'claim hash match with different stored raw payload fails closed'
);

SELECT throws_ok(
  $sql$
    SELECT public.stage_import_run_v1(
      'a7010000-0000-4000-8000-000000000001',
      'people', 'duplicate.csv', 1::bigint, 'text/csv', '["Name"]',
      '{"displayName":"Name"}',
      '[
        {"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"A"},"normalized_data":{},"issues":[]},
        {"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"B"},"normalized_data":{},"issues":[]}
      ]'
    )
  $sql$,
  '22023',
  'Import rows must have unique, strictly increasing source row numbers',
  'duplicate source row numbers are rejected'
);

SELECT throws_ok(
  $sql$
    SELECT public.stage_import_run_v1(
      'a7010000-0000-4000-8000-000000000001',
      'people', 'bad-status.csv', 1::bigint, 'text/csv', '["Name"]',
      '{"displayName":"Name"}',
      '[{"source_row_number":2,"row_status":"committed","action_label":"Create","raw_data":{"Name":"A"},"normalized_data":{},"issues":[]}]'
    )
  $sql$,
  '22023',
  'Import row payload is invalid',
  'non-staging row statuses are rejected'
);

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'bad.csv', 1::bigint,
    'text/csv', '{}', '{"displayName":"Name"}',
    '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{},"normalized_data":{},"issues":[]}]'
  )$$,
  '22023', 'Import staging payload is invalid',
  'non-array headers fail with the staging diagnostic'
);

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'bad.csv', 1::bigint,
    'text/csv', '[""]', '{"displayName":"Name"}',
    '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{},"normalized_data":{},"issues":[]}]'
  )$$,
  '22023', 'Import staging payload is invalid',
  'empty header names are rejected'
);

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'bad.csv', 1::bigint,
    'text/csv', '["Name"]', '{"displayName":"Name"}', '{}'
  )$$,
  '22023', 'Import staging payload is invalid',
  'non-array rows fail with the staging diagnostic'
);

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'overflow.csv', 1::bigint,
    'text/csv', '["Name"]', '{"displayName":"Name"}',
    '[{"source_row_number":999999999999999999999999999999,"row_status":"ready","action_label":"Create","raw_data":{},"normalized_data":{},"issues":[]}]'
  )$$,
  '22023', 'Import row payload is invalid',
  'oversized source row numbers fail before integer casts'
);

SELECT is(
  (SELECT count(*) FROM public.import_runs WHERE source_file_name IN ('duplicate.csv','bad-status.csv','bad.csv','overflow.csv')),
  0::bigint,
  'invalid payloads leave no partial runs'
);

RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.reject_atomic_import_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.raw_data ->> 'Name' = 'Forced failure' THEN
    RAISE EXCEPTION 'forced row failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_atomic_import_row_test
BEFORE INSERT ON public.import_rows
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_atomic_import_row();

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'forced-failure.csv', 1::bigint,
    'text/csv', '["Name"]', '{"displayName":"Name"}',
    '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"Forced failure"},"normalized_data":{},"issues":[]}]'
  )$$,
  '23514', 'forced row failure',
  'row insertion failure aborts the staging RPC'
);

SELECT is(
  (SELECT count(*) FROM public.import_runs WHERE source_file_name = 'forced-failure.csv'),
  0::bigint,
  'transactional row failure rolls back the run insert'
);

RESET ROLE;
DROP TRIGGER reject_atomic_import_row_test ON public.import_rows;

SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT public.stage_import_run_v1(
    'a7010000-0000-4000-8000-000000000001', 'people', 'anon.csv', 1::bigint,
    'text/csv', '["Name"]', '{"displayName":"Name"}',
    '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{},"normalized_data":{},"issues":[]}]'
  )$$,
  '42501', NULL,
  'anon cannot invoke atomic import staging'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
