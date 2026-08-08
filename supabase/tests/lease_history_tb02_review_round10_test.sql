BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(53);

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

CREATE OR REPLACE FUNCTION pg_temp.builder_relationship_payload(
  p_person_id uuid,
  p_lease_status text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_person_id,
      'lifecycle', CASE
        WHEN p_lease_status = 'cancelled'
          THEN 'cancelled_before_effective'
        WHEN p_lease_status IN ('ended', 'terminated') THEN 'ended'
        WHEN p_lease_status IN ('active', 'notice_given') THEN 'effective'
        ELSE 'planned'
      END,
      'recordSource', 'operator_confirmed',
      'reason', 'new_lease_relationship_composition',
      'startedOn', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', CASE
        WHEN p_lease_status = 'cancelled'
          THEN 'cancelled_before_effective'
        WHEN p_lease_status IN ('ended', 'terminated') THEN 'vacated'
        WHEN p_lease_status = 'notice_given' THEN 'notice_given'
        WHEN p_lease_status = 'active' THEN 'occupied'
        ELSE 'reserved'
      END,
      'recordSource', 'operator_confirmed',
      'reason', 'new_lease_relationship_composition',
      'scheduledMoveIn', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      )
    ),
    'participants', '[]'::jsonb
  );
$$;

CREATE TEMP TABLE round10_builder_results (
  lease_status text PRIMARY KEY,
  result jsonb NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE round10_state (
  import_result jsonb,
  import_activity_before bigint,
  lease_activity_before bigint,
  lease_updated_at_before timestamptz,
  deposit_updated_at_before timestamptz,
  deposit_updated_by_before uuid
) ON COMMIT DROP;

INSERT INTO round10_state DEFAULT VALUES;

GRANT SELECT, INSERT ON round10_builder_results TO authenticated;
GRANT SELECT, UPDATE ON round10_state TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.create_builder_contract_lease(
  p_lease_status text,
  p_slot integer
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid := (
    'f7000000-0000-4000-8000-'
    || lpad((p_slot + 10)::text, 12, '0')
  )::uuid;
  v_result jsonb;
  v_unit_id uuid := (
    'f7000000-0000-4000-8000-'
    || lpad(p_slot::text, 12, '0')
  )::uuid;
BEGIN
  v_result := public.create_lease_with_relationships(
    'f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000003',
    v_unit_id,
    v_person_id,
    DATE '2053-01-01',
    DATE '2053-12-31',
    1000,
    'USD',
    5,
    'monthly',
    CASE
      WHEN p_lease_status IN ('cancelled', 'ended', 'terminated')
        THEN 'terminated'
      ELSE 'upcoming'
    END,
    500,
    'USD',
    p_lease_status,
    pg_temp.builder_relationship_payload(v_person_id, p_lease_status),
    'tb02-round10-builder-' || p_lease_status
  );

  INSERT INTO round10_builder_results(lease_status, result)
  VALUES (p_lease_status, v_result);

  RETURN (v_result ->> 'leaseId')::uuid;
END;
$$;

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
SELECT
  '00000000-0000-0000-0000-000000000000',
  fixture.user_id,
  'authenticated',
  'authenticated',
  fixture.label || '@example.test',
  extensions.crypt('tb02-round10', extensions.gen_salt('bf')),
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
FROM (
  VALUES
    (
      'f7000000-0000-4000-8000-000000000002'::uuid,
      'tb02-round10-admin'
    ),
    (
      'f7000000-0000-4000-8000-000000000004'::uuid,
      'tb02-round10-second-admin'
    )
) AS fixture(user_id, label);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'f7000000-0000-4000-8000-000000000001',
  'TB-02 review round 10',
  'tb02-review-round-10'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
(
  'f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002',
  'super_admin'
),
(
  'f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000004',
  'super_admin'
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
  'f7000000-0000-4000-8000-000000000003',
  'f7000000-0000-4000-8000-000000000001',
  'TB-02 round 10 property',
  'TB02-R10',
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
SELECT
  (
    'f7000000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000003'::uuid,
  'TB02-R10-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 17) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
SELECT
  (
    'f7000000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f7000000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 10 person ' || person_number::text,
  'individual'
FROM (
  VALUES
    (20),
    (21),
    (22),
    (23),
    (24),
    (25),
    (26),
    (30),
    (31),
    (32)
) AS fixture(person_number);

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f7000000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f7000000-0000-4000-8000-000000000001';

SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', 'f7000000-0000-4000-8000-000000000001',
    'sourceClaimHash', encode(extensions.digest('f7000000-0000-4000-8000-000000000090', 'sha256'), 'hex'),
    'runId', 'f7000000-0000-4000-8000-000000000090'
  )::text,
  true
);

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  source_file_size,
  source_mime_type,
  headers,
  mapping,
  total_rows,
  ready_rows,
  source_claim_hash,
  snapshot_hash
)
VALUES (
  'f7000000-0000-4000-8000-000000000090',
  'f7000000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round10-leases.csv',
  2048,
  'text/csv',
  '["unit","tenant"]',
  '{"unit":"unitNumber","tenant":"tenantName"}',
  2,
  2,
  encode(extensions.digest('f7000000-0000-4000-8000-000000000090', 'sha256'), 'hex'),
  encode(extensions.digest('snapshot:f7000000-0000-4000-8000-000000000090', 'sha256'), 'hex')
);

INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  raw_data,
  normalized_data
)
VALUES
(
  'f7000000-0000-4000-8000-000000000091',
  'f7000000-0000-4000-8000-000000000090',
  'f7000000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{"unit":"TB02-R10-16","tenant":"Import success"}',
  jsonb_build_object(
    'propertyId', 'f7000000-0000-4000-8000-000000000003',
    'unitId', 'f7000000-0000-4000-8000-000000000016',
    'tenantPersonId', 'f7000000-0000-4000-8000-000000000026',
    'leaseStartDate', '2052-01-01',
    'leaseEndDate', '2052-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'terminated',
    'status', 'ended'
  )
),
(
  'f7000000-0000-4000-8000-000000000092',
  'f7000000-0000-4000-8000-000000000090',
  'f7000000-0000-4000-8000-000000000001',
  2,
  'ready',
  'create',
  '{"unit":"TB02-R10-17","tenant":"Missing tenant"}',
  jsonb_build_object(
    'propertyId', 'f7000000-0000-4000-8000-000000000003',
    'unitId', 'f7000000-0000-4000-8000-000000000017',
    'tenantPersonId', 'f7000000-0000-4000-8000-000000000029',
    'leaseStartDate', '2052-01-01',
    'leaseEndDate', '2052-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'terminated',
    'status', 'ended'
  )
);

SELECT set_config('app.atomic_import_write_context', '', true);

SELECT set_config(
  'request.jwt.claim.sub',
  'f7000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE service_role;

SELECT is(
  pg_temp.capture_error(
    $sql$
      INSERT INTO public.import_runs(
        id,
        organization_id,
        import_type,
        status,
        source_file_name,
        created_count,
        committed_at
      )
      VALUES (
        'f7000000-0000-4000-8000-000000000098',
        'f7000000-0000-4000-8000-000000000001',
        'leases',
        'committed',
        'forged-terminal.csv',
        1,
        now()
      )
    $sql$
  ) ->> 'detail',
  'lease_import_staging_required',
  'service role cannot forge the first Lease import run outcome'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.import_runs(
      id,
      organization_id,
      import_type,
      status,
      source_file_name,
      source_file_size,
      total_rows,
      ready_rows,
      error_rows,
      created_at,
      created_by,
      updated_at,
      updated_by
    )
    VALUES (
      'f7000000-0000-4000-8000-000000000093',
      'f7000000-0000-4000-8000-000000000001',
      'leases',
      'staged',
      'staged-error.csv',
      50,
      1,
      0,
      1,
      TIMESTAMPTZ '2000-01-01 00:00:00+00',
      'f7000000-0000-4000-8000-000000000004',
      TIMESTAMPTZ '2000-01-01 00:00:00+00',
      'f7000000-0000-4000-8000-000000000004'
    )
  $sql$,
  'service role can create a clean staged Lease import run'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'createdBy', created_by,
      'updatedBy', updated_by,
      'serverCreatedAt', created_at > TIMESTAMPTZ '2026-01-01',
      'serverUpdatedAt', updated_at > TIMESTAMPTZ '2026-01-01'
    )
    FROM public.import_runs
    WHERE id = 'f7000000-0000-4000-8000-000000000093'
  ),
  jsonb_build_object(
    'createdBy', 'f7000000-0000-4000-8000-000000000002'::uuid,
    'updatedBy', 'f7000000-0000-4000-8000-000000000002'::uuid,
    'serverCreatedAt', true,
    'serverUpdatedAt', true
  ),
  'Lease run insert derives actors and timestamps from server context'
);

SELECT lives_ok(
  $sql$
    UPDATE public.import_runs
    SET
      source_file_name = 'staged-error-renamed.csv',
      headers = '["unit"]',
      mapping = '{"unit":"unitNumber"}'
    WHERE id = 'f7000000-0000-4000-8000-000000000093'
  $sql$,
  'empty staged Lease run source fields remain editable'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      INSERT INTO public.import_rows(
        id,
        import_run_id,
        organization_id,
        source_row_number,
        row_status,
        action_label,
        raw_data,
        normalized_data,
        result_action
      )
      VALUES (
        'f7000000-0000-4000-8000-000000000094',
        'f7000000-0000-4000-8000-000000000093',
        'f7000000-0000-4000-8000-000000000001',
        1,
        'committed',
        'forged',
        '{}',
        '{}',
        'created'
      )
    $sql$
  ) ->> 'detail',
  'lease_import_staging_required',
  'service role cannot forge the first Lease import row result'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.import_rows(
      id,
      import_run_id,
      organization_id,
      source_row_number,
      row_status,
      action_label,
      raw_data,
      normalized_data,
      issues,
      error_message
    )
    VALUES (
      'f7000000-0000-4000-8000-000000000095',
      'f7000000-0000-4000-8000-000000000093',
      'f7000000-0000-4000-8000-000000000001',
      1,
      'error',
      'Needs review',
      '{"unit":"missing"}',
      '{}',
      '[{"level":"error","message":"Unit is required"}]',
      'Unit is required'
    )
  $sql$,
  'staging preserves error rows with issues and an error message'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', row_status,
      'error', error_message,
      'issues', issues
    )
    FROM public.import_rows
    WHERE id = 'f7000000-0000-4000-8000-000000000095'
  ),
  jsonb_build_object(
    'status', 'error',
    'error', 'Unit is required',
    'issues', '[{"level":"error","message":"Unit is required"}]'::jsonb
  ),
  'staged error-row evidence remains intact'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET source_file_name = 'rewritten-after-row.csv'
      WHERE id = 'f7000000-0000-4000-8000-000000000093'
    $sql$
  ) ->> 'detail',
  'lease_import_provenance_immutable',
  'Lease run source and staging summary freeze after the first child row'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        action_label = 'Still needs review',
        raw_data = '{"unit":"still-missing"}'
      WHERE id = 'f7000000-0000-4000-8000-000000000095'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'direct Lease row staging evidence mutation requires a checked owner operation'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      DELETE FROM public.import_rows
      WHERE id = 'f7000000-0000-4000-8000-000000000095'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'direct Lease import row deletion is blocked'
);

SELECT set_config(
  'app.lease_import_result_write_context',
  'checked-v1',
  true
);
SELECT set_config(
  'app.lease_import_checked_run_id',
  'f7000000-0000-4000-8000-000000000090',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = 'wrong-run checked context',
        issues = issues || '[{"level":"error","message":"wrong-run checked context"}]'
      WHERE id = 'f7000000-0000-4000-8000-000000000095'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'service role cannot use a checked context bound to another run'
);

SELECT set_config('app.lease_import_result_write_context', '', true);
SELECT set_config('app.lease_import_checked_run_id', '', true);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET status = 'committing'
      WHERE id = 'f7000000-0000-4000-8000-000000000093'
    $sql$
  ) ->> 'detail',
  'lease_import_run_checked_operation_required',
  'service role cannot start a Lease commit by direct run update'
);

SELECT lives_ok(
  $sql$
    DELETE FROM public.import_runs
    WHERE id = 'f7000000-0000-4000-8000-000000000093'
  $sql$,
  'clean staged Lease run deletion owns its child cascade'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.import_rows
    WHERE id = 'f7000000-0000-4000-8000-000000000095'
  ),
  0::bigint,
  'clean staged run cascade removes its unreferenced rows'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'f7000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT set_config(
  'app.lease_import_result_write_context',
  'round10-ambient-context',
  true
);
SELECT set_config(
  'app.lease_import_checked_run_id',
  'f7000000-0000-4000-8000-000000000099',
  true
);

SELECT lives_ok(
  format(
    'SELECT pg_temp.create_builder_contract_lease(%L,%s)',
    lease_status,
    slot
  ),
  lease_status || ' public builder payload persists through the checked RPC'
)
FROM (
  VALUES
    ('draft', 10),
    ('active', 11),
    ('notice_given', 12),
    ('ended', 13),
    ('terminated', 14),
    ('cancelled', 15)
) AS fixture(lease_status, slot);

SELECT is(
  (
    SELECT count(*)
    FROM round10_builder_results AS results
    JOIN public.leases AS leases
      ON leases.id = (results.result ->> 'leaseId')::uuid
    JOIN public.lease_parties AS parties
      ON parties.id = (results.result ->> 'partyId')::uuid
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = (results.result ->> 'occupancyId')::uuid
    WHERE jsonb_array_length(results.result -> 'participantIds') = 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_occupancy_participants AS participants
        WHERE participants.lease_occupancy_id = occupancies.id
      )
      AND parties.evidence_state = 'accepted'
      AND occupancies.evidence_state = 'accepted'
  ),
  6::bigint,
  'all six public builder outputs persist without impossible participant rows'
);

UPDATE round10_state
SET import_result = public.commit_generic_import_run(
  'f7000000-0000-4000-8000-000000000090',
  'f7000000-0000-4000-8000-000000000001'
);

SELECT is(
  import_result,
  jsonb_build_object(
    'created', 1,
    'updated', 0,
    'failed', 1,
    'skipped', 0,
    'status', 'committed_with_errors'
  ),
  'checked import finalizes one success and one failure through exact transitions'
)
FROM round10_state;

SELECT is(
  (
    SELECT jsonb_build_object(
      'rowStatus', rows.row_status,
      'resultAction', rows.result_action,
      'coherentIds', (
        rows.result_lease_id IS NOT NULL
        AND rows.result_lease_party_id IS NOT NULL
        AND rows.result_lease_occupancy_id IS NOT NULL
      )
    )
    FROM public.import_rows AS rows
    WHERE rows.id = 'f7000000-0000-4000-8000-000000000091'
  ),
  jsonb_build_object(
    'rowStatus', 'committed',
    'resultAction', 'created',
    'coherentIds', true
  ),
  'checked success finalization persists one coherent Lease result tuple'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'rowStatus', rows.row_status,
      'hasResult', (
        rows.result_lease_id IS NOT NULL
        OR rows.result_lease_party_id IS NOT NULL
        OR rows.result_lease_occupancy_id IS NOT NULL
      ),
      'issueCount', jsonb_array_length(rows.issues)
    )
    FROM public.import_rows AS rows
    WHERE rows.id = 'f7000000-0000-4000-8000-000000000092'
  ),
  jsonb_build_object(
    'rowStatus', 'failed',
    'hasResult', false,
    'issueCount', 1
  ),
  'checked failure finalization appends one issue without durable references'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', runs.status,
      'created', runs.created_count,
      'updated', runs.updated_count,
      'failed', runs.failed_count,
      'skipped', runs.skipped_count,
      'committed', runs.committed_at IS NOT NULL
    )
    FROM public.import_runs AS runs
    WHERE runs.id = 'f7000000-0000-4000-8000-000000000090'
  ),
  jsonb_build_object(
    'status', 'committed_with_errors',
    'created', 1,
    'updated', 0,
    'failed', 1,
    'skipped', 0,
    'committed', true
  ),
  'checked run finalization owns the exact terminal summary'
);

SELECT is(
  jsonb_build_object(
    'context',
    current_setting(
      'app.lease_import_result_write_context',
      true
    ),
    'runId',
    current_setting('app.lease_import_checked_run_id', true)
  ),
  jsonb_build_object(
    'context', 'round10-ambient-context',
    'runId', 'f7000000-0000-4000-8000-000000000099'
  ),
  'checked helpers restore the prior ambient context and run binding'
);

UPDATE round10_state
SET import_activity_before = (
  SELECT count(*)
  FROM public.activity_logs
  WHERE entity_type = 'import'
    AND entity_id = 'f7000000-0000-4000-8000-000000000090'
    AND action = 'generic_import_committed'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.commit_generic_import_run(
        'f7000000-0000-4000-8000-000000000090',
        'f7000000-0000-4000-8000-000000000001'
      )
    $sql$
  ) ->> 'sqlstate',
  '22023',
  'terminal Lease import replay fails closed'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'import'
      AND entity_id = 'f7000000-0000-4000-8000-000000000090'
      AND action = 'generic_import_committed'
  ),
  (SELECT import_activity_before FROM round10_state),
  'terminal Lease import replay creates no duplicate activity'
);

SELECT set_config(
  'app.lease_import_result_write_context',
  'checked-v1',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        result_action = NULL,
        error_message = 'spoofed authenticated finalization'
      WHERE id = 'f7000000-0000-4000-8000-000000000091'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'authenticated caller-set result context cannot spoof row finalization'
);

SELECT set_config('app.lease_import_result_write_context', '', true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'app.lease_import_result_write_context',
  'checked-v1',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        result_action = NULL,
        result_lease_id = NULL,
        result_lease_party_id = NULL,
        result_lease_occupancy_id = NULL,
        error_message = 'spoofed service finalization'
      WHERE id = 'f7000000-0000-4000-8000-000000000091'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'service caller-set result context cannot spoof row finalization'
);

SELECT set_config('app.lease_import_result_write_context', '', true);
RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET raw_data = '{"unit":"rewritten"}'
      WHERE id = 'f7000000-0000-4000-8000-000000000091'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'referenced row source evidence is immutable'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      DELETE FROM public.import_rows
      WHERE id = 'f7000000-0000-4000-8000-000000000091'
    $sql$
  ) ->> 'detail',
  'lease_import_row_checked_operation_required',
  'referenced import row cannot be deleted'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET
        source_file_name = 'rewritten.csv',
        source_file_size = 1,
        source_mime_type = 'application/octet-stream',
        headers = '[]',
        mapping = '{}'
      WHERE id = 'f7000000-0000-4000-8000-000000000090'
    $sql$
  ) ->> 'detail',
  'lease_import_provenance_immutable',
  'referenced run source identity, headers, and mapping are immutable'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET
        status = 'failed',
        total_rows = 0,
        ready_rows = 0,
        warning_rows = 0,
        error_rows = 0,
        created_count = 0,
        failed_count = 0,
        committed_at = NULL,
        error_message = 'rewritten summary'
      WHERE id = 'f7000000-0000-4000-8000-000000000090'
    $sql$
  ) ->> 'detail',
  'lease_import_run_checked_operation_required',
  'referenced run staging and commit summary are immutable'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      DELETE FROM public.import_runs
      WHERE id = 'f7000000-0000-4000-8000-000000000090'
    $sql$
  ) ->> 'detail',
  'lease_import_provenance_immutable',
  'referenced import run cannot cascade-delete its evidence rows'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_runs
      SET status = 'failed'
      WHERE id = 'f7000000-0000-4000-8000-000000000090'
    $sql$
  ) ->> 'detail',
  'lease_import_run_checked_operation_required',
  'terminal checked import run cannot be reopened or rewritten'
);

RESET ROLE;

ALTER TABLE public.import_rows DISABLE TRIGGER USER;
ALTER TABLE public.import_runs DISABLE TRIGGER USER;

UPDATE public.import_rows
SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
WHERE id = 'f7000000-0000-4000-8000-000000000091';

UPDATE public.import_runs
SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
WHERE id = 'f7000000-0000-4000-8000-000000000090';

ALTER TABLE public.import_rows ENABLE TRIGGER USER;
ALTER TABLE public.import_runs ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $sql$
    UPDATE public.import_rows
    SET raw_data = raw_data
    WHERE id = 'f7000000-0000-4000-8000-000000000091'
  $sql$,
  'referenced row exact no-op remains harmless'
);

SELECT is(
  (
    SELECT updated_at
    FROM public.import_rows
    WHERE id = 'f7000000-0000-4000-8000-000000000091'
  ),
  TIMESTAMPTZ '2000-01-01 00:00:00+00',
  'referenced row exact no-op does not rewrite its timestamp'
);

SELECT lives_ok(
  $sql$
    UPDATE public.import_runs
    SET source_file_name = source_file_name
    WHERE id = 'f7000000-0000-4000-8000-000000000090'
  $sql$,
  'referenced run exact no-op remains harmless'
);

SELECT is(
  (
    SELECT updated_at
    FROM public.import_runs
    WHERE id = 'f7000000-0000-4000-8000-000000000090'
  ),
  TIMESTAMPTZ '2000-01-01 00:00:00+00',
  'referenced run exact no-op does not rewrite its timestamp'
);

SELECT ok(
  NOT has_column_privilege(
    'authenticated',
    'public.import_rows',
    'created_at',
    'INSERT'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_rows',
    'created_at',
    'UPDATE'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_rows',
    'updated_at',
    'INSERT'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_rows',
    'updated_at',
    'UPDATE'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_runs',
    'created_at',
    'INSERT'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_runs',
    'created_at',
    'UPDATE'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_runs',
    'updated_at',
    'INSERT'
  )
  AND NOT has_column_privilege(
    'authenticated',
    'public.import_runs',
    'updated_at',
    'UPDATE'
  ),
  'import row and run audit timestamps are default and trigger owned'
);

RESET ROLE;

SELECT ok(
  (
    SELECT
      array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'aa_cancel_exact_lease_import_row_update_noop')
      < array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'set_import_rows_updated_at')
    FROM pg_catalog.pg_trigger AS triggers
    WHERE triggers.tgrelid = 'public.import_rows'::regclass
      AND NOT triggers.tgisinternal
  )
  AND (
    SELECT
      array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'aa_cancel_exact_lease_import_run_update_noop')
      < array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'set_import_runs_updated_at')
    FROM pg_catalog.pg_trigger AS triggers
    WHERE triggers.tgrelid = 'public.import_runs'::regclass
      AND NOT triggers.tgisinternal
  )
  AND (
    SELECT
      array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'aa_cancel_exact_lease_update_noop')
      < array_position(array_agg(triggers.tgname ORDER BY triggers.tgname),
        'set_leases_updated_at')
    FROM pg_catalog.pg_trigger AS triggers
    WHERE triggers.tgrelid = 'public.leases'::regclass
      AND NOT triggers.tgisinternal
  ),
  'exact no-op guards run before audit timestamp triggers'
);

SELECT ok(
  (
    SELECT count(*) = 6
      AND bool_and(
      NOT routines.prosecdef
      AND routines.proconfig @> ARRAY['search_path=""']
      AND pg_get_userbyid(routines.proowner) = 'postgres'
      AND NOT has_function_privilege(
        'authenticated',
        routines.oid,
        'EXECUTE'
      )
      AND NOT has_function_privilege(
        'service_role',
        routines.oid,
        'EXECUTE'
      )
    )
    FROM pg_catalog.pg_proc AS routines
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = routines.pronamespace
    WHERE schemas.nspname = 'app_private'
      AND routines.proname IN (
        'cancel_exact_lease_import_row_update_noop',
        'cancel_exact_lease_import_run_update_noop',
        'cancel_exact_lease_update_noop',
        'guard_referenced_lease_import_row_provenance',
        'guard_referenced_lease_import_run_provenance',
        'guard_person_lease_archive'
      )
  )
  AND (
    SELECT count(*) = 2
      AND bool_and(
      routines.prosecdef
      AND routines.proconfig @> ARRAY['search_path=""']
      AND pg_get_userbyid(routines.proowner) = 'postgres'
      AND NOT has_function_privilege(
        'authenticated',
        routines.oid,
        'EXECUTE'
      )
      AND NOT has_function_privilege(
        'service_role',
        routines.oid,
        'EXECUTE'
      )
    )
    FROM pg_catalog.pg_proc AS routines
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = routines.pronamespace
    WHERE schemas.nspname = 'app_private'
      AND routines.proname IN (
        'apply_checked_lease_import_row_result',
        'apply_checked_lease_import_run_transition'
      )
  ),
  'import and Person guards and private transition helpers keep least privilege'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.person_archive_context',
  'checked-person-archive-v1',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.people
      SET
        archived_at = now(),
        archived_by = 'f7000000-0000-4000-8000-000000000004'
      WHERE id = 'f7000000-0000-4000-8000-000000000030'
    $sql$
  ) ->> 'detail',
  'person_archive_checked_operation_required',
  'authenticated caller-set Person archive context cannot spoof checked archive'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'app.person_archive_context',
  'checked-person-archive-v1',
  true
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.people
      SET
        archived_at = now(),
        archived_by = 'f7000000-0000-4000-8000-000000000004'
      WHERE id = 'f7000000-0000-4000-8000-000000000031'
    $sql$
  ) ->> 'detail',
  'person_archive_checked_operation_required',
  'service caller-set Person archive context cannot spoof checked archive'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'f7000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.archive_person(
    'f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000032'
  ),
  'f7000000-0000-4000-8000-000000000032'::uuid,
  'legitimate definer Person archive still reaches the invoker guard'
);

SELECT is(
  (
    SELECT archived_by
    FROM public.people
    WHERE id = 'f7000000-0000-4000-8000-000000000032'
  ),
  'f7000000-0000-4000-8000-000000000002'::uuid,
  'checked Person archive records the authenticated actor'
);

SELECT lives_ok(
  format(
    'SELECT public.archive_lease(%L,%L)',
    'f7000000-0000-4000-8000-000000000001',
    (
      SELECT result ->> 'leaseId'
      FROM round10_builder_results
      WHERE lease_status = 'cancelled'
    )
  ),
  'cancelled builder Lease archives through the checked RPC'
);

RESET ROLE;

ALTER TABLE public.leases DISABLE TRIGGER USER;
ALTER TABLE public.lease_deposits DISABLE TRIGGER USER;

UPDATE public.leases
SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
WHERE id = (
  SELECT (result ->> 'leaseId')::uuid
  FROM round10_builder_results
  WHERE lease_status = 'cancelled'
);

UPDATE public.lease_deposits
SET
  updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00',
  updated_by = 'f7000000-0000-4000-8000-000000000002'
WHERE lease_id = (
  SELECT (result ->> 'leaseId')::uuid
  FROM round10_builder_results
  WHERE lease_status = 'cancelled'
);

ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.lease_deposits ENABLE TRIGGER USER;

UPDATE round10_state AS state
SET
  lease_activity_before = (
    SELECT count(*)
    FROM public.activity_logs AS logs
    WHERE logs.entity_type = 'lease'
      AND logs.entity_id = (
        SELECT (result ->> 'leaseId')::uuid
        FROM round10_builder_results
        WHERE lease_status = 'cancelled'
      )
      AND logs.action = 'lease_updated'
  ),
  lease_updated_at_before = leases.updated_at,
  deposit_updated_at_before = deposits.updated_at,
  deposit_updated_by_before = deposits.updated_by
FROM public.leases AS leases
JOIN public.lease_deposits AS deposits
  ON deposits.organization_id = leases.organization_id
  AND deposits.lease_id = leases.id
  AND deposits.deposit_type = 'security'
  AND deposits.archived_at IS NULL
WHERE leases.id = (
  SELECT (result ->> 'leaseId')::uuid
  FROM round10_builder_results
  WHERE lease_status = 'cancelled'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f7000000-0000-4000-8000-000000000004',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.affected_rows(format(
    'UPDATE public.leases SET archived_at = archived_at, archived_by = archived_by WHERE id = %L',
    (
      SELECT result ->> 'leaseId'
      FROM round10_builder_results
      WHERE lease_status = 'cancelled'
    )
  )),
  0,
  'exact Lease archive metadata no-op affects zero rows'
);

SELECT is(
  (
    SELECT leases.updated_at
    FROM round10_builder_results AS results
    JOIN public.leases AS leases
      ON leases.id = (results.result ->> 'leaseId')::uuid
    WHERE results.lease_status = 'cancelled'
  ),
  (SELECT lease_updated_at_before FROM round10_state),
  'exact Lease archive no-op does not rewrite Lease updated_at'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'updatedAt', deposits.updated_at,
      'updatedBy', deposits.updated_by
    )
    FROM round10_builder_results AS results
    JOIN public.lease_deposits AS deposits
      ON deposits.lease_id = (results.result ->> 'leaseId')::uuid
      AND deposits.deposit_type = 'security'
      AND deposits.archived_at IS NULL
    WHERE results.lease_status = 'cancelled'
  ),
  (
    SELECT jsonb_build_object(
      'updatedAt', deposit_updated_at_before,
      'updatedBy', deposit_updated_by_before
    )
    FROM round10_state
  ),
  'exact Lease archive no-op does not rewrite deposit audit metadata'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs AS logs
    WHERE logs.entity_type = 'lease'
      AND logs.entity_id = (
        SELECT (result ->> 'leaseId')::uuid
        FROM round10_builder_results
        WHERE lease_status = 'cancelled'
      )
      AND logs.action = 'lease_updated'
  ),
  (SELECT lease_activity_before FROM round10_state),
  'exact Lease archive no-op does not create false lease_updated activity'
);

UPDATE public.leases
SET
  archived_at = archived_at,
  archived_by = archived_by,
  updated_by = 'f7000000-0000-4000-8000-000000000004'
WHERE id = (
  SELECT (result ->> 'leaseId')::uuid
  FROM round10_builder_results
  WHERE lease_status = 'cancelled'
);

SELECT is(
  (
    SELECT leases.updated_by
    FROM round10_builder_results AS results
    JOIN public.leases AS leases
      ON leases.id = (results.result ->> 'leaseId')::uuid
    WHERE results.lease_status = 'cancelled'
  ),
  'f7000000-0000-4000-8000-000000000004'::uuid,
  'archive metadata no-op guard does not cancel a mixed real update'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
