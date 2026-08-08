BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

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

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_person_id uuid,
  p_party_source text,
  p_occupancy_source text,
  p_participant_source text DEFAULT NULL,
  p_party_lifecycle text DEFAULT 'planned',
  p_occupancy_lifecycle text DEFAULT 'reserved',
  p_participant_lifecycle text DEFAULT 'planned'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_person_id,
      'lifecycle', p_party_lifecycle,
      'recordSource', p_party_source,
      'reason', 'tb02_round6',
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
      'lifecycle', p_occupancy_lifecycle,
      'recordSource', p_occupancy_source,
      'reason', 'tb02_round6',
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
    'participants', CASE
      WHEN p_participant_source IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'personId', p_person_id,
          'lifecycle', p_participant_lifecycle,
          'recordSource', p_participant_source,
          'reason', 'tb02_round6',
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
        )
      )
    END
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_public_create(
  p_unit_id uuid,
  p_person_id uuid,
  p_idempotency_key text,
  p_party_source text,
  p_occupancy_source text,
  p_participant_source text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
BEGIN
  PERFORM public.create_lease_with_relationships(
    'f4980000-0000-4000-8000-000000000001',
    'f4980000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2049-01-01',
    DATE '2049-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    pg_temp.relationship_payload(
      p_person_id,
      p_party_source,
      p_occupancy_source,
      p_participant_source
    ),
    p_idempotency_key
  );

  RETURN 'NO_ERROR';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-')
    || ':' || SQLERRM;
END;
$$;

CREATE TEMP TABLE lease_history_tb02_round6_state (
  imported_lease_id uuid,
  operator_lease_id uuid,
  compatibility_lease_id uuid
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round6_state DEFAULT VALUES;
GRANT ALL ON lease_history_tb02_round6_state TO authenticated;

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
  'f4980000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round6@example.test',
  extensions.crypt('tb02-round6', extensions.gen_salt('bf')),
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
  'f4980000-0000-4000-8000-000000000001',
  'TB-02 review round 6',
  'tb02-review-round-6'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f4980000-0000-4000-8000-000000000001',
  'f4980000-0000-4000-8000-000000000002',
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
  'f4980000-0000-4000-8000-000000000003',
  'f4980000-0000-4000-8000-000000000001',
  'TB-02 round 6 property',
  'TB02-R6',
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
    'f4980000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4980000-0000-4000-8000-000000000001'::uuid,
  'f4980000-0000-4000-8000-000000000003'::uuid,
  'TB02-R6-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 15) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
SELECT
  (
    'f4980000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f4980000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 6 tenant ' || person_number::text,
  'individual'
FROM generate_series(20, 25) AS person_number;

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f4980000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f4980000-0000-4000-8000-000000000001';

SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', 'f4980000-0000-4000-8000-000000000001',
    'sourceClaimHash', encode(extensions.digest('f4980000-0000-4000-8000-000000000030', 'sha256'), 'hex'),
    'runId', 'f4980000-0000-4000-8000-000000000030'
  )::text,
  true
);

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  total_rows,
  ready_rows,
  source_claim_hash,
  snapshot_hash
)
VALUES (
  'f4980000-0000-4000-8000-000000000030',
  'f4980000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round6-ended.csv',
  1,
  1,
  encode(extensions.digest('f4980000-0000-4000-8000-000000000030', 'sha256'), 'hex'),
  encode(extensions.digest('snapshot:f4980000-0000-4000-8000-000000000030', 'sha256'), 'hex')
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
VALUES (
  'f4980000-0000-4000-8000-000000000031',
  'f4980000-0000-4000-8000-000000000030',
  'f4980000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  jsonb_build_object(
    'propertyId', 'f4980000-0000-4000-8000-000000000003',
    'unitId', 'f4980000-0000-4000-8000-000000000010',
    'tenantPersonId', 'f4980000-0000-4000-8000-000000000020',
    'leaseStartDate', '2049-01-01',
    'leaseEndDate', '2049-12-31',
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
  'f4980000-0000-4000-8000-000000000002',
  true
);

SET LOCAL ROLE authenticated;

SELECT is(
  public.commit_generic_import_run(
    'f4980000-0000-4000-8000-000000000030',
    'f4980000-0000-4000-8000-000000000001'
  ) ->> 'created',
  '1',
  'a terminal checked import commits its explicit evidence composition'
);

RESET ROLE;

UPDATE lease_history_tb02_round6_state
SET imported_lease_id = (
  SELECT result_lease_id
  FROM public.import_rows
  WHERE id = 'f4980000-0000-4000-8000-000000000031'
);

SELECT is(
  (
    SELECT
      parties.business_lifecycle || '/'
      || occupancies.business_lifecycle || '/'
      || parties.record_source || '/'
      || occupancies.record_source
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.id = rows.result_lease_party_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = rows.result_lease_occupancy_id
    WHERE rows.id = 'f4980000-0000-4000-8000-000000000031'
  ),
  'ended/vacated/imported_explicit/imported_explicit',
  'the terminal import keeps unknown dates and accepted ended evidence'
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_error_message(
    format(
      'SELECT public.archive_lease(%L,%L)',
      'f4980000-0000-4000-8000-000000000001',
      (SELECT imported_lease_id FROM lease_history_tb02_round6_state)
    )
  ),
  'NO_ERROR',
  'accepted terminal imported evidence does not block Lease archive'
);

RESET ROLE;

SELECT ok(
  (
    SELECT archived_at IS NOT NULL
    FROM public.leases
    WHERE id = (
      SELECT imported_lease_id FROM lease_history_tb02_round6_state
    )
  ),
  'terminal imported Lease archive persists'
);

SET LOCAL ROLE authenticated;

UPDATE lease_history_tb02_round6_state
SET operator_lease_id = (
  public.create_lease_with_relationships(
    'f4980000-0000-4000-8000-000000000001',
    'f4980000-0000-4000-8000-000000000003',
    'f4980000-0000-4000-8000-000000000011',
    'f4980000-0000-4000-8000-000000000021',
    DATE '2049-01-01',
    DATE '2049-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'terminated',
    NULL,
    NULL,
    'terminated',
    pg_temp.relationship_payload(
      'f4980000-0000-4000-8000-000000000021',
      'operator_confirmed',
      'operator_confirmed',
      NULL,
      'ended',
      'vacated'
    ),
    'tb02-round6-operator-terminal'
  ) ->> 'leaseId'
)::uuid;

RESET ROLE;

SELECT is(
  (
    SELECT
      parties.business_lifecycle || '/'
      || occupancies.business_lifecycle
    FROM public.lease_parties AS parties
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.lease_id = parties.lease_id
      AND occupancies.organization_id = parties.organization_id
    WHERE parties.lease_id = (
      SELECT operator_lease_id FROM lease_history_tb02_round6_state
    )
  ),
  'ended/vacated',
  'the public operator composition records explicit terminal lifecycles'
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_error_message(
    format(
      'SELECT public.archive_lease(%L,%L)',
      'f4980000-0000-4000-8000-000000000001',
      (SELECT operator_lease_id FROM lease_history_tb02_round6_state)
    )
  ),
  'NO_ERROR',
  'accepted terminal operator evidence does not block Lease archive'
);

RESET ROLE;

SELECT ok(
  (
    SELECT archived_at IS NOT NULL
    FROM public.leases
    WHERE id = (
      SELECT operator_lease_id FROM lease_history_tb02_round6_state
    )
  ),
  'terminal operator Lease archive persists'
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_public_create(
    'f4980000-0000-4000-8000-000000000012',
    'f4980000-0000-4000-8000-000000000022',
    'tb02-round6-public-import-source',
    'imported_explicit',
    'operator_confirmed'
  ),
  '42501:lease_relationship_record_source_context_required:'
    || 'Imported and system Lease evidence is reserved for trusted workflows',
  'public creation rejects imported primary-party evidence without source context'
);

SELECT is(
  pg_temp.capture_public_create(
    'f4980000-0000-4000-8000-000000000013',
    'f4980000-0000-4000-8000-000000000023',
    'tb02-round6-public-system-source',
    'operator_confirmed',
    'system_transition'
  ),
  '42501:lease_relationship_record_source_context_required:'
    || 'Imported and system Lease evidence is reserved for trusted workflows',
  'public creation rejects system occupancy evidence without trusted context'
);

SELECT is(
  pg_temp.capture_public_create(
    'f4980000-0000-4000-8000-000000000014',
    'f4980000-0000-4000-8000-000000000024',
    'tb02-round6-public-participant-source',
    'operator_confirmed',
    'operator_confirmed',
    'imported_explicit'
  ),
  '42501:lease_relationship_record_source_context_required:'
    || 'Imported and system Lease evidence is reserved for trusted workflows',
  'public creation also rejects privileged participant evidence'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4980000-0000-4000-8000-000000000001'
      AND idempotency_key IN (
        'tb02-round6-public-import-source',
        'tb02-round6-public-system-source',
        'tb02-round6-public-participant-source'
      )
  ),
  0::bigint,
  'rejected public privileged-source requests leave no idempotency claims'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f4980000-0000-4000-8000-000000000001'
      AND unit_id IN (
        'f4980000-0000-4000-8000-000000000012',
        'f4980000-0000-4000-8000-000000000013',
        'f4980000-0000-4000-8000-000000000014'
      )
  ),
  0::bigint,
  'rejected public privileged-source requests leave no Lease composition'
);

SET LOCAL ROLE authenticated;

UPDATE lease_history_tb02_round6_state
SET compatibility_lease_id = public.create_lease_with_authoritative_term(
  'f4980000-0000-4000-8000-000000000001',
  'f4980000-0000-4000-8000-000000000003',
  'f4980000-0000-4000-8000-000000000015',
  'f4980000-0000-4000-8000-000000000025',
  DATE '2049-01-01',
  DATE '2049-12-31',
  1000,
  'USD',
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'draft',
  'tb02-round6-compatibility'
);

RESET ROLE;

SELECT ok(
  (
    SELECT compatibility_lease_id IS NOT NULL
    FROM lease_history_tb02_round6_state
  ),
  'the trusted compatibility wrapper can still create a Lease'
);

SELECT is(
  (
    SELECT parties.record_source || '/' || occupancies.record_source
    FROM public.lease_parties AS parties
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = parties.organization_id
      AND occupancies.lease_id = parties.lease_id
    WHERE parties.lease_id = (
      SELECT compatibility_lease_id
      FROM lease_history_tb02_round6_state
    )
  ),
  'system_transition/system_transition',
  'the trusted compatibility wrapper retains system-transition evidence'
);

SELECT * FROM finish();

ROLLBACK;
