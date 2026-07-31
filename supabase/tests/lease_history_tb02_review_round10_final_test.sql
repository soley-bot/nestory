BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(32);

CREATE OR REPLACE FUNCTION pg_temp.capture_error(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_message text;
  v_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'capture_error_statement_succeeded',
        DETAIL = 'capture_error_statement_succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL;

    IF v_state = 'P0001'
      AND v_message = 'capture_error_statement_succeeded' THEN
      RETURN jsonb_build_object(
        'threw', false,
        'sqlstate', NULL,
        'message', NULL,
        'detail', NULL
      );
    END IF;

    RETURN jsonb_build_object(
      'threw', true,
      'sqlstate', v_state,
      'message', v_message,
      'detail', NULLIF(v_detail, '')
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.affected_rows(p_sql text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE TEMP TABLE round10_final_state (
  lease_result jsonb,
  failed_commit_result jsonb,
  failed_snapshot jsonb,
  person_archive_snapshot jsonb,
  person_restore_snapshot jsonb
) ON COMMIT DROP;

INSERT INTO round10_final_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON round10_final_state TO authenticated;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'f7100000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round10-final@example.test',
  extensions.crypt('tb02-round10-final', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'f7100000-0000-4000-8000-000000000001',
  'TB-02 review round 10 final',
  'tb02-review-round-10-final'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000002',
  'admin'
);

INSERT INTO public.properties(
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
VALUES (
  'f7100000-0000-4000-8000-000000000003',
  'f7100000-0000-4000-8000-000000000001',
  'TB-02 round 10 final property',
  'TB02-R10-FINAL',
  'apartment',
  'active'
);

INSERT INTO public.units(
  id,
  organization_id,
  property_id,
  unit_number,
  status,
  current_rent_amount,
  current_rent_currency
)
VALUES (
  'f7100000-0000-4000-8000-000000000004',
  'f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000003',
  'TB02-R10-FINAL',
  'vacant',
  1000,
  'USD'
);

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
VALUES
(
  'f7100000-0000-4000-8000-000000000005',
  'f7100000-0000-4000-8000-000000000001',
  'TB-02 final tenant',
  'individual'
),
(
  'f7100000-0000-4000-8000-000000000006',
  'f7100000-0000-4000-8000-000000000001',
  'TB-02 final archive person',
  'individual'
);

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
VALUES (
  'f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000005',
  'tenant',
  'active'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f7100000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

UPDATE round10_final_state
SET lease_result = public.create_lease_with_relationships(
  'f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000003',
  'f7100000-0000-4000-8000-000000000004',
  'f7100000-0000-4000-8000-000000000005',
  DATE '2055-01-01',
  DATE '2055-12-31',
  1000,
  'USD',
  5,
  'monthly',
  'terminated',
  NULL,
  NULL,
  'ended',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', 'f7100000-0000-4000-8000-000000000005',
      'lifecycle', 'ended',
      'recordSource', 'operator_confirmed',
      'reason', 'tb02_round10_final',
      'startedOn', jsonb_build_object(
        'date', '2055-01-01',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'endedOn', jsonb_build_object(
        'date', '2055-12-31',
        'kind', 'known',
        'confidence', 'confirmed'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'vacated',
      'recordSource', 'operator_confirmed',
      'reason', 'tb02_round10_final',
      'scheduledMoveIn', jsonb_build_object(
        'date', '2055-01-01',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', '2055-12-31',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', '2055-01-01',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', '2055-12-31',
        'kind', 'known',
        'confidence', 'confirmed'
      )
    ),
    'participants', '[]'::jsonb
  ),
  'tb02-round10-final'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conrelid = 'public.import_runs'::regclass
      AND constraints.contype = 'u'
      AND pg_get_constraintdef(constraints.oid)
        = 'UNIQUE (organization_id, id)'
  ),
  'import runs expose an organization-scoped parent key'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraints
    WHERE constraints.conrelid = 'public.import_rows'::regclass
      AND constraints.contype = 'f'
      AND constraints.confdeltype = 'a'
      AND pg_get_constraintdef(constraints.oid)
        = 'FOREIGN KEY (organization_id, import_run_id) REFERENCES import_runs(organization_id, id)'
  ),
  'import rows enforce organization-scoped parent membership with NO ACTION'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.import_rows AS rows
    LEFT JOIN public.import_runs AS runs
      ON runs.organization_id = rows.organization_id
      AND runs.id = rows.import_run_id
    WHERE runs.id IS NULL
  ),
  0::bigint,
  'no imported row is outside its exact organization-scoped parent'
);

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  total_rows,
  ready_rows
)
VALUES
(
  'f7100000-0000-4000-8000-000000000010',
  'f7100000-0000-4000-8000-000000000001',
  'people',
  'staged',
  'non-lease.csv',
  1,
  1
),
(
  'f7100000-0000-4000-8000-000000000020',
  'f7100000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'spoof-row.csv',
  1,
  1
),
(
  'f7100000-0000-4000-8000-000000000022',
  'f7100000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'spoof-run.csv',
  0,
  0
),
(
  'f7100000-0000-4000-8000-000000000030',
  'f7100000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'summary-mismatch.csv',
  2,
  2
),
(
  'f7100000-0000-4000-8000-000000000040',
  'f7100000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'all-invalid.csv',
  1,
  1
);

INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  raw_data,
  normalized_data,
  issues
)
VALUES
(
  'f7100000-0000-4000-8000-000000000011',
  'f7100000-0000-4000-8000-000000000010',
  'f7100000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{"name":"Non-Lease row"}',
  '{"displayName":"Non-Lease row"}',
  '[]'
),
(
  'f7100000-0000-4000-8000-000000000021',
  'f7100000-0000-4000-8000-000000000020',
  'f7100000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{"unit":"TB02-R10-FINAL"}',
  '{}',
  '[{"level":"warning","message":"original warning"}]'
),
(
  'f7100000-0000-4000-8000-000000000031',
  'f7100000-0000-4000-8000-000000000030',
  'f7100000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{}',
  '{}',
  '[]'
),
(
  'f7100000-0000-4000-8000-000000000041',
  'f7100000-0000-4000-8000-000000000040',
  'f7100000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{"unit":"TB02-R10-FINAL","tenant":"Missing"}',
  jsonb_build_object(
    'propertyId', 'f7100000-0000-4000-8000-000000000003',
    'unitId', 'f7100000-0000-4000-8000-000000000004',
    'tenantPersonId', 'f7100000-0000-4000-8000-000000000099',
    'leaseStartDate', '2056-01-01',
    'leaseEndDate', '2056-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'terminated',
    'status', 'ended'
  ),
  '[{"level":"warning","message":"original warning"}]'
);

SELECT is(
  pg_temp.capture_error(format(
    $sql$
      INSERT INTO public.import_rows(
        id, import_run_id, organization_id, source_row_number,
        row_status, action_label, raw_data, normalized_data,
        result_action, result_lease_id, result_lease_party_id,
        result_lease_occupancy_id
      )
      VALUES (
        'f7100000-0000-4000-8000-000000000012',
        'f7100000-0000-4000-8000-000000000010',
        'f7100000-0000-4000-8000-000000000001',
        2, 'committed', 'forged', '{}', '{}', 'created',
        %L, %L, %L
      )
    $sql$,
    (SELECT lease_result ->> 'leaseId' FROM round10_final_state),
    (SELECT lease_result ->> 'partyId' FROM round10_final_state),
    (SELECT lease_result ->> 'occupancyId' FROM round10_final_state)
  )) ->> 'detail',
  'lease_import_type_mismatch',
  'a non-Lease parent rejects a coherent Lease result tuple on insert'
);

SELECT is(
  pg_temp.capture_error(format(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'committed',
        result_action = 'created',
        result_lease_id = %L,
        result_lease_party_id = %L,
        result_lease_occupancy_id = %L
      WHERE id = 'f7100000-0000-4000-8000-000000000011'
    $sql$,
    (SELECT lease_result ->> 'leaseId' FROM round10_final_state),
    (SELECT lease_result ->> 'partyId' FROM round10_final_state),
    (SELECT lease_result ->> 'occupancyId' FROM round10_final_state)
  )) ->> 'detail',
  'lease_import_type_mismatch',
  'a non-Lease parent rejects a coherent Lease result tuple on update'
);

SELECT lives_ok(
  $sql$
    UPDATE public.import_rows
    SET result_unit_id = 'f7100000-0000-4000-8000-000000000004'
    WHERE id = 'f7100000-0000-4000-8000-000000000011'
  $sql$,
  'non-Lease compatibility result Unit remains outside Lease provenance'
);

ALTER TABLE public.lease_parties DISABLE TRIGGER USER;
UPDATE public.lease_parties
SET source_import_row_id =
  'f7100000-0000-4000-8000-000000000011'
WHERE id = (
  SELECT (lease_result ->> 'partyId')::uuid
  FROM round10_final_state
);
ALTER TABLE public.lease_parties ENABLE TRIGGER USER;

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET raw_data = '{"name":"rewritten"}'
      WHERE id = 'f7100000-0000-4000-8000-000000000011'
    $sql$
  ) ->> 'detail',
  'lease_import_type_mismatch',
  'a non-Lease parent rejects mutation after Lease source linkage exists'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      DELETE FROM public.import_rows
      WHERE id = 'f7100000-0000-4000-8000-000000000011'
    $sql$
  ) ->> 'detail',
  'lease_import_type_mismatch',
  'a non-Lease parent rejects deletion after Lease source linkage exists'
);

ALTER TABLE public.import_runs DISABLE TRIGGER USER;
UPDATE public.import_runs
SET status = 'committing'
WHERE id = 'f7100000-0000-4000-8000-000000000020';
ALTER TABLE public.import_runs ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.lease_import_result_write_context',
  'checked-v1',
  true
);
SELECT set_config(
  'app.lease_import_checked_run_id',
  'f7100000-0000-4000-8000-000000000020',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = 'authenticated spoof',
        issues = issues || '[{"level":"error","message":"authenticated spoof"}]'
      WHERE id = 'f7100000-0000-4000-8000-000000000021'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'authenticated cannot spoof an otherwise valid checked row failure'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = 'service spoof',
        issues = issues || '[{"level":"error","message":"service spoof"}]'
      WHERE id = 'f7100000-0000-4000-8000-000000000021'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'service role cannot spoof an otherwise valid checked row failure'
);

RESET ROLE;
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = 'prefix rewrite',
        issues =
          '[{"level":"warning","message":"rewritten warning"},'
          '{"level":"error","message":"prefix rewrite"}]'
      WHERE id = 'f7100000-0000-4000-8000-000000000021'
    $sql$
  ) ->> 'detail',
  'lease_import_failure_issue_prefix_immutable',
  'checked failure preserves the exact prior issue prefix'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.lease_import_checked_run_id',
  'f7100000-0000-4000-8000-000000000022',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET
        status = 'committing',
        created_count = 0,
        updated_count = 0,
        failed_count = 0,
        skipped_count = 0,
        error_message = NULL,
        committed_at = NULL,
        updated_by = 'f7100000-0000-4000-8000-000000000002'
      WHERE id = 'f7100000-0000-4000-8000-000000000022'
    $sql$
  ) ->> 'detail',
  'lease_import_run_checked_operation_required',
  'authenticated cannot spoof an otherwise valid checked run start'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET
        status = 'committing',
        created_count = 0,
        updated_count = 0,
        failed_count = 0,
        skipped_count = 0,
        error_message = NULL,
        committed_at = NULL,
        updated_by = 'f7100000-0000-4000-8000-000000000002'
      WHERE id = 'f7100000-0000-4000-8000-000000000022'
    $sql$
  ) ->> 'detail',
  'lease_import_run_checked_operation_required',
  'service role cannot spoof an otherwise valid checked run start'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.lease_import_result_write_context', '', true);
SELECT set_config('app.lease_import_checked_run_id', '', true);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET raw_data = '{"unit":"direct rewrite"}'
      WHERE id = 'f7100000-0000-4000-8000-000000000021'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'direct Lease row update is rejected before any parent lock'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      DELETE FROM public.import_rows
      WHERE id = 'f7100000-0000-4000-8000-000000000021'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'direct Lease row deletion is rejected before any parent lock'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.commit_generic_import_run(
        'f7100000-0000-4000-8000-000000000030',
        'f7100000-0000-4000-8000-000000000001'
      )
    $sql$
  ) ->> 'detail',
  'lease_import_staging_summary_mismatch',
  'commit rejects partial staging whose total and ready summary is inflated'
);

UPDATE round10_final_state
SET failed_commit_result = public.commit_generic_import_run(
  'f7100000-0000-4000-8000-000000000040',
  'f7100000-0000-4000-8000-000000000001'
);

SELECT is(
  (SELECT failed_commit_result FROM round10_final_state),
  jsonb_build_object(
    'created', 0,
    'updated', 0,
    'failed', 1,
    'skipped', 0,
    'status', 'failed'
  ),
  'an actual all-invalid Lease import returns failed'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', row_status,
      'resultAction', result_action,
      'resultLeaseId', result_lease_id,
      'issueCount', jsonb_array_length(issues),
      'prefix', issues -> 0,
      'lastLevel', issues -> -1 ->> 'level',
      'lastMessage', issues -> -1 ->> 'message',
      'message', error_message
    )
    FROM public.import_rows
    WHERE id = 'f7100000-0000-4000-8000-000000000041'
  ),
  (
    SELECT jsonb_build_object(
      'status', 'failed',
      'resultAction', NULL,
      'resultLeaseId', NULL,
      'issueCount', 2,
      'prefix', '{"level":"warning","message":"original warning"}'::jsonb,
      'lastLevel', 'error',
      'lastMessage', error_message,
      'message', error_message
    )
    FROM public.import_rows
    WHERE id = 'f7100000-0000-4000-8000-000000000041'
  ),
  'actual failed row keeps its exact issue prefix and appends one matching error'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', status,
      'created', created_count,
      'updated', updated_count,
      'failed', failed_count,
      'skipped', skipped_count,
      'committed', committed_at IS NOT NULL
    )
    FROM public.import_runs
    WHERE id = 'f7100000-0000-4000-8000-000000000040'
  ),
  jsonb_build_object(
    'status', 'failed',
    'created', 0,
    'updated', 0,
    'failed', 1,
    'skipped', 0,
    'committed', true
  ),
  'actual all-invalid Lease import persists exact terminal counters'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE organization_id = 'f7100000-0000-4000-8000-000000000001'
      AND entity_type = 'import'
      AND entity_id = 'f7100000-0000-4000-8000-000000000040'
      AND action = 'generic_import_committed'
  ),
  1::bigint,
  'actual all-invalid Lease import emits one terminal activity'
);

UPDATE round10_final_state
SET failed_snapshot = (
  SELECT jsonb_build_object(
    'run', to_jsonb(runs),
    'row', to_jsonb(rows),
    'activities', (
      SELECT count(*)
      FROM public.activity_logs
      WHERE organization_id = runs.organization_id
        AND entity_type = 'import'
        AND entity_id = runs.id
        AND action = 'generic_import_committed'
    )
  )
  FROM public.import_runs AS runs
  JOIN public.import_rows AS rows
    ON rows.import_run_id = runs.id
  WHERE runs.id = 'f7100000-0000-4000-8000-000000000040'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.commit_generic_import_run(
        'f7100000-0000-4000-8000-000000000040',
        'f7100000-0000-4000-8000-000000000001'
      )
    $sql$
  ) ->> 'sqlstate',
  '22023',
  'failed Lease import replay is rejected'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'run', to_jsonb(runs),
      'row', to_jsonb(rows),
      'activities', (
        SELECT count(*)
        FROM public.activity_logs
        WHERE organization_id = runs.organization_id
          AND entity_type = 'import'
          AND entity_id = runs.id
          AND action = 'generic_import_committed'
      )
    )
    FROM public.import_runs AS runs
    JOIN public.import_rows AS rows
      ON rows.import_run_id = runs.id
    WHERE runs.id = 'f7100000-0000-4000-8000-000000000040'
  ),
  (SELECT failed_snapshot FROM round10_final_state),
  'failed Lease import replay leaves run row and activity unchanged'
);

SELECT is(
  public.archive_person(
    'f7100000-0000-4000-8000-000000000001',
    'f7100000-0000-4000-8000-000000000006'
  ),
  'f7100000-0000-4000-8000-000000000006'::uuid,
  'checked Person archive succeeds'
);

UPDATE round10_final_state
SET person_archive_snapshot = (
  SELECT jsonb_build_object(
    'archivedAt', archived_at,
    'archivedBy', archived_by,
    'activities', (
      SELECT count(*)
      FROM public.activity_logs
      WHERE organization_id = people.organization_id
        AND entity_type = 'person'
        AND entity_id = people.id
        AND action = 'archived'
    )
  )
  FROM public.people
  WHERE id = 'f7100000-0000-4000-8000-000000000006'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.people
      SET archived_by = NULL
      WHERE id = 'f7100000-0000-4000-8000-000000000006'
    $sql$
  ) ->> 'detail',
  'person_archive_metadata_immutable',
  'archived Person metadata is immutable to authenticated callers'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.people
      SET archived_at = archived_at + interval '1 second'
      WHERE id = 'f7100000-0000-4000-8000-000000000006'
    $sql$
  ) ->> 'detail',
  'person_archive_metadata_immutable',
  'archived Person metadata is immutable to service role'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.person_restore_context',
  'checked-person-restore-v1',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.people
      SET archived_at = NULL, archived_by = NULL
      WHERE id = 'f7100000-0000-4000-8000-000000000006'
    $sql$
  ) ->> 'detail',
  'person_restore_checked_operation_required',
  'authenticated caller-set context cannot spoof Person restore'
);

SELECT set_config('app.person_restore_context', '', true);

SELECT is(
  public.archive_person(
    'f7100000-0000-4000-8000-000000000001',
    'f7100000-0000-4000-8000-000000000006'
  ),
  'f7100000-0000-4000-8000-000000000006'::uuid,
  'Person archive replay returns the existing Person'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'archivedAt', archived_at,
      'archivedBy', archived_by,
      'activities', (
        SELECT count(*)
        FROM public.activity_logs
        WHERE organization_id = people.organization_id
          AND entity_type = 'person'
          AND entity_id = people.id
          AND action = 'archived'
      )
    )
    FROM public.people
    WHERE id = 'f7100000-0000-4000-8000-000000000006'
  ),
  (SELECT person_archive_snapshot FROM round10_final_state),
  'Person archive replay does not rewrite metadata or activity'
);

SELECT is(
  public.restore_person(
    'f7100000-0000-4000-8000-000000000001',
    'f7100000-0000-4000-8000-000000000006'
  ),
  'f7100000-0000-4000-8000-000000000006'::uuid,
  'checked Person restore succeeds'
);

UPDATE round10_final_state
SET person_restore_snapshot = (
  SELECT jsonb_build_object(
    'archivedAt', archived_at,
    'archivedBy', archived_by,
    'activities', (
      SELECT count(*)
      FROM public.activity_logs
      WHERE organization_id = people.organization_id
        AND entity_type = 'person'
        AND entity_id = people.id
        AND action = 'restored'
    )
  )
  FROM public.people
  WHERE id = 'f7100000-0000-4000-8000-000000000006'
);

SELECT is(
  public.restore_person(
    'f7100000-0000-4000-8000-000000000001',
    'f7100000-0000-4000-8000-000000000006'
  ),
  'f7100000-0000-4000-8000-000000000006'::uuid,
  'Person restore replay returns the already-restored Person'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'archivedAt', archived_at,
      'archivedBy', archived_by,
      'activities', (
        SELECT count(*)
        FROM public.activity_logs
        WHERE organization_id = people.organization_id
          AND entity_type = 'person'
          AND entity_id = people.id
          AND action = 'restored'
      )
    )
    FROM public.people
    WHERE id = 'f7100000-0000-4000-8000-000000000006'
  ),
  (SELECT person_restore_snapshot FROM round10_final_state),
  'Person restore replay does not duplicate activity'
);

SELECT is(
  pg_temp.affected_rows(
    $sql$
      UPDATE public.people
      SET archived_at = archived_at, archived_by = archived_by
      WHERE id = 'f7100000-0000-4000-8000-000000000006'
    $sql$
  ),
  0,
  'exact Person archive metadata no-op affects zero rows'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
