BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(21);

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
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
EXCEPTION
  WHEN SQLSTATE 'Z0001' THEN
    RETURN 'NO_ERROR';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_person_id uuid,
  p_source_import_row_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'sourceImportRowId', p_source_import_row_id,
      'primaryParty', jsonb_build_object(
        'personId', p_person_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'tb02_round5_replay',
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
        'reason', 'tb02_round5_replay',
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

CREATE OR REPLACE FUNCTION pg_temp.capture_relationship_result(
  p_unit_id uuid,
  p_person_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_result jsonb;
BEGIN
  SELECT public.create_lease_with_relationships(
    'f4970000-0000-4000-8000-000000000001',
    'f4970000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    pg_temp.relationship_payload(p_person_id),
    p_idempotency_key
  )
  INTO v_result;

  RETURN 'OK:' || v_result::text;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN 'ERR:' || SQLSTATE || ':'
    || coalesce(NULLIF(v_detail, ''), '-')
    || ':' || SQLERRM;
END;
$$;

CREATE TEMP TABLE lease_history_tb02_round5_state (
  role_replay_result jsonb,
  unit_replay_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round5_state DEFAULT VALUES;
GRANT ALL ON lease_history_tb02_round5_state TO authenticated;

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
VALUES
(
  '00000000-0000-0000-0000-000000000000',
  'f4970000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round5@example.test',
  extensions.crypt('tb02-round5', extensions.gen_salt('bf')),
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
),
(
  '00000000-0000-0000-0000-000000000000',
  'f4970000-0000-4000-8000-000000000004',
  'authenticated',
  'authenticated',
  'tb02-round5-second-admin@example.test',
  extensions.crypt('tb02-round5-second', extensions.gen_salt('bf')),
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
  'f4970000-0000-4000-8000-000000000001',
  'TB-02 review round 5',
  'tb02-review-round-5'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
(
  'f4970000-0000-4000-8000-000000000001',
  'f4970000-0000-4000-8000-000000000002',
  'admin'
),
(
  'f4970000-0000-4000-8000-000000000001',
  'f4970000-0000-4000-8000-000000000004',
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
  'f4970000-0000-4000-8000-000000000003',
  'f4970000-0000-4000-8000-000000000001',
  'TB-02 round 5 property',
  'TB02-R5',
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
    'f4970000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4970000-0000-4000-8000-000000000001'::uuid,
  'f4970000-0000-4000-8000-000000000003'::uuid,
  'TB02-R5-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 36) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
SELECT
  (
    'f4970000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f4970000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 5 tenant ' || person_number::text,
  'individual'
FROM generate_series(40, 52) AS person_number;

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f4970000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f4970000-0000-4000-8000-000000000001';

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
  'f4970000-0000-4000-8000-000000000060',
  'f4970000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round5-lifecycles.csv',
  6,
  6
),
(
  'f4970000-0000-4000-8000-000000000070',
  'f4970000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round5-unchecked-source.csv',
  1,
  1
);

WITH statuses(source_row_number, lease_status) AS (
  VALUES
    (1, 'active'),
    (2, 'cancelled'),
    (3, 'draft'),
    (4, 'ended'),
    (5, 'notice_given'),
    (6, 'terminated')
)
INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
SELECT
  (
    'f4970000-0000-4000-8000-'
    || lpad((60 + source_row_number)::text, 12, '0')
  )::uuid,
  'f4970000-0000-4000-8000-000000000060'::uuid,
  'f4970000-0000-4000-8000-000000000001'::uuid,
  source_row_number,
  'ready',
  'create',
  jsonb_build_object(
    'propertyId', 'f4970000-0000-4000-8000-000000000003',
    'unitId',
      'f4970000-0000-4000-8000-'
        || lpad((9 + source_row_number)::text, 12, '0'),
    'tenantPersonId',
      'f4970000-0000-4000-8000-'
        || lpad((39 + source_row_number)::text, 12, '0'),
    'leaseStartDate', '2044-01-01',
    'leaseEndDate', '2044-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus',
      CASE
        WHEN lease_status IN ('ended', 'terminated', 'cancelled')
          THEN 'terminated'
        ELSE 'upcoming'
      END,
    'status', lease_status
  )
FROM statuses;

INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
VALUES (
  'f4970000-0000-4000-8000-000000000071',
  'f4970000-0000-4000-8000-000000000070',
  'f4970000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  jsonb_build_object(
    'propertyId', 'f4970000-0000-4000-8000-000000000003',
    'unitId', 'f4970000-0000-4000-8000-000000000036',
    'tenantPersonId', 'f4970000-0000-4000-8000-000000000052',
    'leaseStartDate', '2048-01-01',
    'leaseEndDate', '2048-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'upcoming',
    'status', 'draft'
  )
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f4970000-0000-4000-8000-000000000002',
  true
);

SET LOCAL ROLE authenticated;

SELECT is(
  public.commit_generic_import_run(
    'f4970000-0000-4000-8000-000000000060',
    'f4970000-0000-4000-8000-000000000001'
  ) ->> 'created',
  '6',
  'all six supported imported Lease statuses commit'
);

RESET ROLE;

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 1
  ),
  'effective/occupied',
  'active import maps to effective party and occupied scope'
);

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 2
  ),
  'cancelled_before_effective/cancelled_before_effective',
  'cancelled import maps to cancelled-before-effective relationships'
);

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 3
  ),
  'planned/reserved',
  'draft import maps to planned party and reserved scope'
);

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 4
  ),
  'ended/vacated',
  'ended import maps to ended party and vacated scope'
);

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 5
  ),
  'effective/notice_given',
  'notice-given import maps to effective party and notice-given scope'
);

SELECT is(
  (
    SELECT parties.business_lifecycle || '/' || occupancies.business_lifecycle
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.source_row_number = 6
  ),
  'ended/vacated',
  'terminated import maps to ended party and vacated scope'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.import_rows AS rows
    JOIN public.leases AS leases
      ON leases.id = rows.result_lease_id
      AND leases.organization_id = rows.organization_id
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
      AND parties.lease_id = leases.id
      AND parties.source_import_row_id = rows.id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
      AND occupancies.lease_id = leases.id
      AND occupancies.source_import_row_id = rows.id
    WHERE rows.import_run_id = 'f4970000-0000-4000-8000-000000000060'
      AND rows.row_status = 'committed'
      AND leases.property_id =
        (rows.normalized_data ->> 'propertyId')::uuid
      AND leases.unit_id = (rows.normalized_data ->> 'unitId')::uuid
      AND leases.primary_tenant_person_id =
        (rows.normalized_data ->> 'tenantPersonId')::uuid
      AND leases.status = rows.normalized_data ->> 'status'
  ),
  6::bigint,
  'checked import binds each result composition to its normalized source row'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT app_private.create_lease_with_relationships_internal(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000036',
        'f4970000-0000-4000-8000-000000000052',
        DATE '2048-01-01', DATE '2048-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        app_private.build_checked_lease_import_relationship_payload(
          'f4970000-0000-4000-8000-000000000071',
          (
            SELECT normalized_data
            FROM public.import_rows
            WHERE id = 'f4970000-0000-4000-8000-000000000071'
          )
        ),
        'import:f4970000-0000-4000-8000-000000000070:'
          || 'f4970000-0000-4000-8000-000000000071'
      )
    $sql$
  ),
  '23514:lease_import_source_payload_mismatch:'
    || 'Lease import source does not match the checked commit payload',
  'private checked creation requires a locked committing import run'
);

UPDATE public.import_runs
SET status = 'committing'
WHERE id = 'f4970000-0000-4000-8000-000000000070';

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT app_private.create_lease_with_relationships_internal(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000036',
        'f4970000-0000-4000-8000-000000000052',
        DATE '2048-01-01', DATE '2048-12-31', 1001, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        app_private.build_checked_lease_import_relationship_payload(
          'f4970000-0000-4000-8000-000000000071',
          (
            SELECT normalized_data
            FROM public.import_rows
            WHERE id = 'f4970000-0000-4000-8000-000000000071'
          )
        ),
        'import:f4970000-0000-4000-8000-000000000070:'
          || 'f4970000-0000-4000-8000-000000000071'
      )
    $sql$
  ),
  '23514:lease_import_source_payload_mismatch:'
    || 'Lease import source does not match the checked commit payload',
  'private checked creation binds scalar inputs to normalized import data'
);

UPDATE public.import_runs
SET status = 'staged'
WHERE id = 'f4970000-0000-4000-8000-000000000070';

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.probe_error(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000013',
        'f4970000-0000-4000-8000-000000000043',
        DATE '2045-01-01', DATE '2045-12-31', 1100, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        pg_temp.relationship_payload(
          'f4970000-0000-4000-8000-000000000043'
        ),
        'tb02-round5-open-after-ended'
      )
    $sql$
  ),
  'NO_ERROR',
  'ended imported relationships do not lock a later open composition'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000036',
        'f4970000-0000-4000-8000-000000000052',
        DATE '2048-01-01', DATE '2048-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        pg_temp.relationship_payload(
          'f4970000-0000-4000-8000-000000000052',
          'f4970000-0000-4000-8000-000000000071'
        ),
        'tb02-round5-unchecked-source'
      )
    $sql$
  ),
  '42501:lease_import_source_context_required:'
    || 'Lease source import row is reserved for checked import commit',
  'public Lease creation cannot attach an arbitrary import source row'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4970000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round5-unchecked-source'
  ),
  0::bigint,
  'rejected public source attachment leaves no idempotency artifact'
);

SELECT ok(
  coalesce(
    (
      SELECT NOT has_function_privilege(
        'authenticated',
        procedure_oid,
        'EXECUTE'
      )
      FROM (
        SELECT to_regprocedure(
          'app_private.create_lease_with_relationships_internal('
            || 'uuid,uuid,uuid,uuid,date,date,numeric,'
            || 'public.currency_code,integer,text,text,numeric,'
            || 'public.currency_code,text,jsonb,text)'
        ) AS procedure_oid
      ) AS private_function
      WHERE procedure_oid IS NOT NULL
    ),
    false
  ),
  'the checked import implementation is not executable by authenticated'
);

SET LOCAL ROLE authenticated;

WITH created AS (
  SELECT public.create_lease_with_relationships(
    'f4970000-0000-4000-8000-000000000001',
    'f4970000-0000-4000-8000-000000000003',
    'f4970000-0000-4000-8000-000000000020',
    'f4970000-0000-4000-8000-000000000050',
    DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
    'monthly', 'upcoming', NULL, NULL, 'draft',
    pg_temp.relationship_payload(
      'f4970000-0000-4000-8000-000000000050'
    ),
    'tb02-round5-role-replay'
  ) AS result
)
UPDATE lease_history_tb02_round5_state
SET role_replay_result = created.result
FROM created;

WITH created AS (
  SELECT public.create_lease_with_relationships(
    'f4970000-0000-4000-8000-000000000001',
    'f4970000-0000-4000-8000-000000000003',
    'f4970000-0000-4000-8000-000000000021',
    'f4970000-0000-4000-8000-000000000051',
    DATE '2047-01-01', DATE '2047-12-31', 1000, 'USD', 5,
    'monthly', 'upcoming', NULL, NULL, 'draft',
    pg_temp.relationship_payload(
      'f4970000-0000-4000-8000-000000000051'
    ),
    'tb02-round5-unit-replay'
  ) AS result
)
UPDATE lease_history_tb02_round5_state
SET unit_replay_result = created.result
FROM created;

RESET ROLE;

UPDATE public.person_roles
SET status = 'inactive'
WHERE organization_id = 'f4970000-0000-4000-8000-000000000001'
  AND person_id = 'f4970000-0000-4000-8000-000000000050'
  AND role = 'tenant';

UPDATE public.units
SET archived_at = now()
WHERE organization_id = 'f4970000-0000-4000-8000-000000000001'
  AND id = 'f4970000-0000-4000-8000-000000000021';

SELECT set_config('app.financial_authority_period_context', 'on', true);

UPDATE public.property_reporting_periods
SET lifecycle_status = 'closed'
WHERE organization_id = 'f4970000-0000-4000-8000-000000000001'
  AND property_id = 'f4970000-0000-4000-8000-000000000003'
  AND currency = 'USD'
  AND period_start = DATE '2047-01-01';

SELECT set_config('app.financial_authority_period_context', 'off', true);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_relationship_result(
    'f4970000-0000-4000-8000-000000000020',
    'f4970000-0000-4000-8000-000000000050',
    DATE '2046-01-01',
    DATE '2046-12-31',
    1000,
    'tb02-round5-role-replay'
  ),
  'OK:' || (
    SELECT role_replay_result::text
    FROM lease_history_tb02_round5_state
  ),
  'completed exact replay survives later Tenant role deactivation'
);

SELECT is(
  pg_temp.capture_relationship_result(
    'f4970000-0000-4000-8000-000000000021',
    'f4970000-0000-4000-8000-000000000051',
    DATE '2047-01-01',
    DATE '2047-12-31',
    1000,
    'tb02-round5-unit-replay'
  ),
  'OK:' || (
    SELECT unit_replay_result::text
    FROM lease_history_tb02_round5_state
  ),
  'completed exact replay survives later Unit archive and period close'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000020',
        'f4970000-0000-4000-8000-000000000050',
        DATE '2046-01-01', DATE '2046-12-31', 1001, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        pg_temp.relationship_payload(
          'f4970000-0000-4000-8000-000000000050'
        ),
        'tb02-round5-role-replay'
      )
    $sql$
  ),
  '22023:lease_relationship_idempotency_conflict:'
    || 'Conflicting Lease relationship idempotency request',
  'completed same-key changed scalar payload conflicts before role revalidation'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000020',
        'f4970000-0000-4000-8000-000000000050',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        jsonb_set(
          pg_temp.relationship_payload(
            'f4970000-0000-4000-8000-000000000050'
          ),
          '{primaryParty,reason}',
          '"tb02_round5_changed_reason"'
        ),
        'tb02-round5-role-replay'
      )
    $sql$
  ),
  '22023:lease_relationship_idempotency_conflict:'
    || 'Conflicting Lease relationship idempotency request',
  'completed same-key changed relationship payload conflicts early'
);

SELECT is(
  pg_temp.capture_error_message(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000020',
        'f4970000-0000-4000-8000-000000000050',
        DATE '2046-01-01', DATE '2046-12-31', 1000, 'USD', 5,
        'monthly', 'upcoming', NULL, NULL, 'draft',
        pg_temp.relationship_payload(
          'f4970000-0000-4000-8000-000000000050'
        ),
        'tb02-round5-role-replay-new-key'
      )
    $sql$
  ),
  '23503:-:An active Tenant role is required for the exact primary Tenant',
  'a new key still evaluates mutable Tenant prerequisites'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'f4970000-0000-4000-8000-000000000004',
  true
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_relationship_result(
    'f4970000-0000-4000-8000-000000000020',
    'f4970000-0000-4000-8000-000000000050',
    DATE '2046-01-01',
    DATE '2046-12-31',
    1000,
    'tb02-round5-role-replay'
  ),
  'ERR:22023:lease_relationship_idempotency_conflict:'
    || 'Conflicting Lease relationship idempotency request',
  'completed replay remains bound to the original actor'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'f4970000-0000-4000-8000-000000000002',
  true
);

SELECT is(
  pg_temp.probe_error(
    $sql$
      SELECT app_private.create_lease_with_relationships_internal(
        'f4970000-0000-4000-8000-000000000001',
        'f4970000-0000-4000-8000-000000000003',
        'f4970000-0000-4000-8000-000000000013',
        'f4970000-0000-4000-8000-000000000043',
        DATE '2044-01-01', DATE '2044-12-31', 1000, 'USD', 5,
        'monthly', 'terminated', NULL, NULL, 'ended',
        app_private.build_checked_lease_import_relationship_payload(
          'f4970000-0000-4000-8000-000000000064',
          (
            SELECT normalized_data
            FROM public.import_rows
            WHERE id = 'f4970000-0000-4000-8000-000000000064'
          )
        ),
        'import:f4970000-0000-4000-8000-000000000060:'
          || 'f4970000-0000-4000-8000-000000000064'
      )
    $sql$
  ),
  'NO_ERROR',
  'completed checked import provenance replays after run and row commit'
);

SELECT * FROM finish();

ROLLBACK;
