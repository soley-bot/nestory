BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(30);

CREATE OR REPLACE FUNCTION pg_temp.capture_error(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_constraint text;
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RETURN 'NO_ERROR';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_constraint = CONSTRAINT_NAME,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(
    NULLIF(v_constraint, ''),
    NULLIF(v_detail, ''),
    SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_error_message(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RETURN 'NO_ERROR';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-')
    || ':' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.probe_error(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_constraint text;
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
EXCEPTION
  WHEN SQLSTATE 'Z0001' THEN
    RETURN 'NO_ERROR';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_constraint = CONSTRAINT_NAME,
      v_detail = PG_EXCEPTION_DETAIL;
    RETURN SQLSTATE || ':' || coalesce(
      NULLIF(v_constraint, ''),
      NULLIF(v_detail, ''),
      SQLERRM
    );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_source_import_row_id uuid
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'sourceImportRowId', p_source_import_row_id,
      'primaryParty', jsonb_build_object(
        'personId', 'f4960000-0000-4000-8000-000000000020',
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'tb02_round4_date_order',
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
        'lifecycle', 'reserved',
        'recordSource', 'operator_confirmed',
        'reason', 'tb02_round4_date_order',
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
    )
  );
$$;

CREATE TEMP TABLE lease_history_tb02_round4_state (
  imported_lease_id uuid,
  imported_party_id uuid,
  imported_occupancy_id uuid
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round4_state DEFAULT VALUES;
GRANT ALL ON lease_history_tb02_round4_state TO authenticated;

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
  'f4960000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round4@example.test',
  extensions.crypt('tb02-round4', extensions.gen_salt('bf')),
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
VALUES
(
  'f4960000-0000-4000-8000-000000000001',
  'TB-02 review round 4 A',
  'tb02-review-round-4-a'
),
(
  'f4960000-0000-4000-8000-000000000003',
  'TB-02 review round 4 B',
  'tb02-review-round-4-b'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
(
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000002',
  'admin'
),
(
  'f4960000-0000-4000-8000-000000000003',
  'f4960000-0000-4000-8000-000000000002',
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
  'f4960000-0000-4000-8000-000000000004',
  'f4960000-0000-4000-8000-000000000001',
  'TB-02 round 4 property',
  'TB02-R4',
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
    'f4960000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4960000-0000-4000-8000-000000000001'::uuid,
  'f4960000-0000-4000-8000-000000000004'::uuid,
  'TB02-R4-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 19) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
VALUES
(
  'f4960000-0000-4000-8000-000000000020',
  'f4960000-0000-4000-8000-000000000001',
  'TB-02 round 4 tenant A',
  'individual'
),
(
  'f4960000-0000-4000-8000-000000000021',
  'f4960000-0000-4000-8000-000000000001',
  'TB-02 round 4 tenant B',
  'individual'
);

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
VALUES
(
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000020',
  'tenant',
  'active'
),
(
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000021',
  'tenant',
  'active'
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
  'f4960000-0000-4000-8000-000000000060',
  'f4960000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round4-referenced.csv',
  1,
  1
),
(
  'f4960000-0000-4000-8000-000000000062',
  'f4960000-0000-4000-8000-000000000001',
  'people',
  'staged',
  'tb02-round4-unreferenced.csv',
  1,
  1
),
(
  'f4960000-0000-4000-8000-000000000064',
  'f4960000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round4-empty.csv',
  0,
  0
),
(
  'f4960000-0000-4000-8000-000000000066',
  'f4960000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round4-valid.csv',
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
  normalized_data
)
VALUES
(
  'f4960000-0000-4000-8000-000000000061',
  'f4960000-0000-4000-8000-000000000060',
  'f4960000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{}'::jsonb
),
(
  'f4960000-0000-4000-8000-000000000063',
  'f4960000-0000-4000-8000-000000000062',
  'f4960000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{}'::jsonb
),
(
  'f4960000-0000-4000-8000-000000000067',
  'f4960000-0000-4000-8000-000000000066',
  'f4960000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  jsonb_build_object(
    'propertyId', 'f4960000-0000-4000-8000-000000000004',
    'unitId', 'f4960000-0000-4000-8000-000000000011',
    'tenantPersonId', 'f4960000-0000-4000-8000-000000000020',
    'leaseStartDate', '2044-01-01',
    'leaseEndDate', '2044-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'upcoming',
    'status', 'draft'
  )
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f4960000-0000-4000-8000-000000000002',
  true
);

SET LOCAL ROLE authenticated;

WITH created AS (
  SELECT public.create_lease_with_relationships(
    'f4960000-0000-4000-8000-000000000001',
    'f4960000-0000-4000-8000-000000000004',
    'f4960000-0000-4000-8000-000000000010',
    'f4960000-0000-4000-8000-000000000020',
    DATE '2043-01-01',
    DATE '2043-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    pg_temp.relationship_payload(
      NULL
    ),
    'tb02-round4-referenced'
  ) AS result
)
UPDATE lease_history_tb02_round4_state
SET
  imported_lease_id = (created.result ->> 'leaseId')::uuid,
  imported_party_id = (created.result ->> 'partyId')::uuid,
  imported_occupancy_id = (created.result ->> 'occupancyId')::uuid
FROM created;

RESET ROLE;

SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);

UPDATE public.lease_parties
SET source_import_row_id =
  'f4960000-0000-4000-8000-000000000061'
WHERE id = (
  SELECT imported_party_id
  FROM lease_history_tb02_round4_state
);

UPDATE public.lease_occupancies
SET source_import_row_id =
  'f4960000-0000-4000-8000-000000000061'
WHERE id = (
  SELECT imported_occupancy_id
  FROM lease_history_tb02_round4_state
);

SELECT set_config(
  'app.lease_history_write_context',
  'off',
  true
);

ALTER TABLE public.import_rows DISABLE TRIGGER USER;
UPDATE public.import_rows
SET
  result_lease_id = (
    SELECT imported_lease_id FROM lease_history_tb02_round4_state
  ),
  result_lease_party_id = (
    SELECT imported_party_id FROM lease_history_tb02_round4_state
  ),
  result_lease_occupancy_id = (
    SELECT imported_occupancy_id FROM lease_history_tb02_round4_state
  )
WHERE id = 'f4960000-0000-4000-8000-000000000061';
ALTER TABLE public.import_rows ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_runs
      SET organization_id =
        'f4960000-0000-4000-8000-000000000003'
      WHERE id = 'f4960000-0000-4000-8000-000000000060'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'a referenced Lease import run cannot move organizations'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_runs
      SET organization_id =
        'f4960000-0000-4000-8000-000000000003'
      WHERE id = 'f4960000-0000-4000-8000-000000000064'
    $sql$
  ),
  '55000:lease_import_provenance_immutable',
  'an empty staged Lease import run keeps immutable organization identity'
);

SELECT is(
  pg_temp.probe_error(test_case.sql),
  CASE
    WHEN test_case.label = 'a referenced import creation timestamp is immutable'
      THEN '42501:permission denied for table import_rows'
    WHEN test_case.label IN (
      'a referenced import row ID is immutable',
      'a referenced import row run membership is immutable',
      'a referenced import row organization is immutable'
    ) THEN '55000:lease_import_provenance_immutable'
    ELSE '42501:lease_import_row_checked_operation_required'
  END,
  test_case.label
)
FROM (
  VALUES
  (
    'a referenced import row ID is immutable',
    $sql$
      UPDATE public.import_rows
      SET id = 'f4960000-0000-4000-8000-000000000099'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import row run membership is immutable',
    $sql$
      UPDATE public.import_rows
      SET import_run_id =
        'f4960000-0000-4000-8000-000000000062'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import row organization is immutable',
    $sql$
      UPDATE public.import_rows
      SET organization_id =
        'f4960000-0000-4000-8000-000000000003'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import source row number is immutable',
    $sql$
      UPDATE public.import_rows
      SET source_row_number = 99
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import row status is immutable',
    $sql$
      UPDATE public.import_rows
      SET row_status = 'warning'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import action label is immutable',
    $sql$
      UPDATE public.import_rows
      SET action_label = 'update'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'referenced raw import evidence is immutable',
    $sql$
      UPDATE public.import_rows
      SET raw_data = '{"tampered":true}'::jsonb
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'referenced normalized import evidence is immutable',
    $sql$
      UPDATE public.import_rows
      SET normalized_data = '{"tampered":true}'::jsonb
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'referenced import issues are immutable',
    $sql$
      UPDATE public.import_rows
      SET issues = '[{"level":"warning","message":"tampered"}]'::jsonb
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import result action is immutable',
    $sql$
      UPDATE public.import_rows
      SET result_action = 'updated'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced compatibility result Unit is immutable',
    $sql$
      UPDATE public.import_rows
      SET result_unit_id =
        'f4960000-0000-4000-8000-000000000012'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import error is immutable',
    $sql$
      UPDATE public.import_rows
      SET error_message = 'tampered'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  (
    'a referenced import creation timestamp is immutable',
    $sql$
      UPDATE public.import_rows
      SET created_at = created_at - interval '1 day'
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  )
) AS test_case(label, sql);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_rows
      SET updated_at = updated_at
      WHERE id = 'f4960000-0000-4000-8000-000000000061'
    $sql$
  ),
  '42501:permission denied for table import_rows',
  'authenticated callers cannot write import-row audit timestamps'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      UPDATE public.import_rows
      SET
        row_status = 'warning',
        action_label = 'update',
        raw_data = '{"staged":true}'::jsonb,
        normalized_data = '{"staged":true}'::jsonb,
        issues = '[{"level":"warning","message":"review"}]'::jsonb,
        error_message = NULL
      WHERE id = 'f4960000-0000-4000-8000-000000000063'
    $sql$
  ),
  'NO_ERROR',
  'an unreferenced row retains valid material staging edits'
);

SELECT is(
  (
    public.commit_generic_import_run(
      'f4960000-0000-4000-8000-000000000066',
      'f4960000-0000-4000-8000-000000000001'
    ) ->> 'created'
  )::integer,
  1,
  'the checked import commit can finalize result evidence after references exist'
);

RESET ROLE;

SELECT set_config('app.people_leases_skip_sync', 'on', true);

INSERT INTO public.leases(
  id,
  organization_id,
  property_id,
  unit_id,
  tenant_name,
  primary_tenant_person_id,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  status
)
SELECT
  (
    'f4960000-0000-4000-8000-'
    || lpad(lease_number::text, 12, '0')
  )::uuid,
  'f4960000-0000-4000-8000-000000000001'::uuid,
  'f4960000-0000-4000-8000-000000000004'::uuid,
  (
    'f4960000-0000-4000-8000-'
    || lpad((12 + lease_number % 7)::text, 12, '0')
  )::uuid,
  'TB-02 round 4 direct tenant',
  'f4960000-0000-4000-8000-000000000020'::uuid,
  DATE '2045-01-01',
  DATE '2045-12-31',
  1000,
  'USD',
  'draft'
FROM generate_series(40, 47) AS lease_number;

INSERT INTO public.lease_parties(
  id,
  organization_id,
  lease_id,
  person_id,
  party_role,
  is_primary,
  evidence_state,
  business_lifecycle,
  record_source,
  evidence_reason
)
VALUES
(
  'f4960000-0000-4000-8000-000000000070',
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000040',
  'f4960000-0000-4000-8000-000000000020',
  'primary_tenant',
  true,
  'accepted',
  'planned',
  'operator_confirmed',
  'tb02_round4_unknown_primary'
),
(
  'f4960000-0000-4000-8000-000000000071',
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000041',
  'f4960000-0000-4000-8000-000000000020',
  'co_tenant',
  false,
  'accepted',
  'planned',
  'operator_confirmed',
  'tb02_round4_unknown_person_role'
);

INSERT INTO public.lease_occupancies(
  id,
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  evidence_state,
  business_lifecycle,
  record_source,
  evidence_reason
)
VALUES (
  'f4960000-0000-4000-8000-000000000072',
  'f4960000-0000-4000-8000-000000000001',
  'f4960000-0000-4000-8000-000000000040',
  'f4960000-0000-4000-8000-000000000004',
  'f4960000-0000-4000-8000-000000000017',
  'reserved',
  'accepted',
  'reserved',
  'operator_confirmed',
  'tb02_round4_unknown_occupancy'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_parties(
        organization_id, lease_id, person_id, party_role, is_primary,
        evidence_state, business_lifecycle, record_source, evidence_reason
      )
      VALUES (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000040',
        'f4960000-0000-4000-8000-000000000021',
        'primary_tenant', true, 'accepted', 'planned',
        'operator_confirmed', 'tb02_round4_duplicate_primary'
      )
    $sql$
  ),
  '23505:lease_parties_one_unbounded_primary_tenant_idx',
  'unknown-boundary active primary-Tenant facts remain unique per Lease'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_parties(
        organization_id, lease_id, person_id, party_role, is_primary,
        evidence_state, business_lifecycle, record_source, evidence_reason
      )
      VALUES (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000041',
        'f4960000-0000-4000-8000-000000000020',
        'co_tenant', false, 'accepted', 'planned',
        'operator_confirmed', 'tb02_round4_duplicate_person_role'
      )
    $sql$
  ),
  '23505:lease_parties_one_unbounded_person_role_idx',
  'unknown-boundary active same-Person same-role facts remain unique'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_occupancies(
        organization_id, lease_id, property_id, unit_id, status,
        evidence_state, business_lifecycle, record_source, evidence_reason
      )
      VALUES (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000047',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000017',
        'reserved', 'accepted', 'reserved',
        'operator_confirmed', 'tb02_round4_duplicate_occupancy'
      )
    $sql$
  ),
  '23505:lease_occupancies_one_unbounded_active_unit_idx',
  'unknown-boundary active occupancy remains unique per Unit'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_parties(
        organization_id, lease_id, person_id, party_role, is_primary,
        started_on, ended_on, evidence_state, business_lifecycle,
        record_source, evidence_reason
      )
      VALUES
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000044',
        'f4960000-0000-4000-8000-000000000020',
        'primary_tenant', true, DATE '2040-01-01', DATE '2040-06-30',
        'legacy_unresolved', 'planned', 'legacy_inferred',
        'tb02_round4_legacy_history_a'
      ),
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000044',
        'f4960000-0000-4000-8000-000000000021',
        'primary_tenant', true, DATE '2040-07-01', DATE '2040-12-31',
        'legacy_unresolved', 'planned', 'legacy_inferred',
        'tb02_round4_legacy_history_b'
      )
    $sql$
  ),
  'NO_ERROR',
  'dated legacy primary-Tenant history remains allowed'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_parties(
        organization_id, lease_id, person_id, party_role, is_primary,
        evidence_state, business_lifecycle, record_source, evidence_reason
      )
      VALUES
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000045',
        'f4960000-0000-4000-8000-000000000020',
        'authorized_occupant', false, 'accepted', 'ended',
        'operator_confirmed', 'tb02_round4_ended_history_a'
      ),
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000045',
        'f4960000-0000-4000-8000-000000000020',
        'authorized_occupant', false, 'accepted', 'ended',
        'operator_confirmed', 'tb02_round4_ended_history_b'
      )
    $sql$
  ),
  'NO_ERROR',
  'non-active accepted same-Person role history remains allowed'
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      INSERT INTO public.lease_occupancies(
        organization_id, lease_id, property_id, unit_id, status,
        evidence_state, business_lifecycle, record_source, evidence_reason
      )
      VALUES
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000046',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000016',
        'vacated', 'accepted', 'vacated',
        'operator_confirmed', 'tb02_round4_vacated_history_a'
      ),
      (
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000046',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000016',
        'vacated', 'accepted', 'vacated',
        'operator_confirmed', 'tb02_round4_vacated_history_b'
      )
    $sql$
  ),
  'NO_ERROR',
  'non-active accepted same-Unit occupancy history remains allowed'
);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000019',
        'f4960000-0000-4000-8000-000000000020',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        jsonb_set(
          jsonb_set(
            pg_temp.relationship_payload(
              NULL
            ),
            '{primaryParty,startedOn}',
            '{"date":"2046-02-01","kind":"known","confidence":"confirmed"}'
          ),
          '{primaryParty,endedOn}',
          '{"date":"2046-01-31","kind":"known","confidence":"confirmed"}'
        ),
        'tb02-round4-party-date-order'
      )
    $sql$
  ),
  '23514:lease_relationship_party_date_order_invalid:'
    || 'Party end date must be on or after party start date',
  'party boundary ordering fails with the field-specific validation contract'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000019',
        'f4960000-0000-4000-8000-000000000020',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        jsonb_set(
          jsonb_set(
            pg_temp.relationship_payload(
              NULL
            ),
            '{occupancy,scheduledMoveIn}',
            '{"date":"2046-02-01","kind":"known","confidence":"confirmed"}'
          ),
          '{occupancy,scheduledMoveOut}',
          '{"date":"2046-01-31","kind":"known","confidence":"confirmed"}'
        ),
        'tb02-round4-scheduled-date-order'
      )
    $sql$
  ),
  '23514:lease_relationship_scheduled_date_order_invalid:'
    || 'Scheduled move-out date must be on or after scheduled move-in date',
  'scheduled occupancy ordering fails with field-specific validation'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000019',
        'f4960000-0000-4000-8000-000000000020',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        jsonb_set(
          jsonb_set(
            pg_temp.relationship_payload(
              NULL
            ),
            '{occupancy,actualMoveIn}',
            '{"date":"2046-02-01","kind":"known","confidence":"confirmed"}'
          ),
          '{occupancy,actualMoveOut}',
          '{"date":"2046-01-31","kind":"known","confidence":"confirmed"}'
        ),
        'tb02-round4-actual-date-order'
      )
    $sql$
  ),
  '23514:lease_relationship_actual_date_order_invalid:'
    || 'Actual move-out date must be on or after actual move-in date',
  'actual occupancy ordering fails with field-specific validation'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4960000-0000-4000-8000-000000000001',
        'f4960000-0000-4000-8000-000000000004',
        'f4960000-0000-4000-8000-000000000019',
        'f4960000-0000-4000-8000-000000000020',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        jsonb_set(
          pg_temp.relationship_payload(
            NULL
          ),
          '{participants}',
          '[{
            "personId":"f4960000-0000-4000-8000-000000000020",
            "lifecycle":"planned",
            "recordSource":"operator_confirmed",
            "reason":"tb02_round4_participant_date_order",
            "startedOn":{
              "date":"2046-02-01",
              "kind":"known",
              "confidence":"confirmed"
            },
            "endedOn":{
              "date":"2046-01-31",
              "kind":"known",
              "confidence":"confirmed"
            }
          }]'::jsonb
        ),
        'tb02-round4-participant-date-order'
      )
    $sql$
  ),
  '23514:lease_relationship_participant_date_order_invalid:'
    || 'Participant end date must be on or after participant start date',
  'participant ordering fails with the field-specific validation contract'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.import_rows
    WHERE id = 'f4960000-0000-4000-8000-000000000061'
      AND row_status = 'ready'
      AND result_lease_id = (
        SELECT imported_lease_id FROM lease_history_tb02_round4_state
      )
      AND error_message IS NULL
  ),
  'rejected date-boundary writes leave existing import evidence unchanged'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'lease_parties_one_unbounded_primary_tenant_idx',
        'lease_parties_one_unbounded_person_role_idx',
        'lease_occupancies_one_unbounded_active_unit_idx'
      )
  ),
  3,
  'all three unknown-or-open active uniqueness indexes are installed'
);

SELECT * FROM finish();
ROLLBACK;
