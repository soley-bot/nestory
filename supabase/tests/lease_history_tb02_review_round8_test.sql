BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(30);

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_person_id uuid,
  p_party_lifecycle text,
  p_occupancy_lifecycle text,
  p_participant_lifecycle text,
  p_record_source text DEFAULT 'operator_confirmed'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_person_id,
      'lifecycle', p_party_lifecycle,
      'recordSource', p_record_source,
      'reason', 'tb02_round8',
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
      'recordSource', p_record_source,
      'reason', 'tb02_round8',
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
        'date', CASE
          WHEN p_occupancy_lifecycle IN (
            'occupied',
            'notice_given',
            'vacated'
          ) THEN '2051-01-02'
          ELSE NULL
        END,
        'kind', CASE
          WHEN p_occupancy_lifecycle IN (
            'occupied',
            'notice_given',
            'vacated'
          ) THEN 'known'
          ELSE 'unknown'
        END,
        'confidence', CASE
          WHEN p_occupancy_lifecycle IN (
            'occupied',
            'notice_given',
            'vacated'
          ) THEN 'confirmed'
          ELSE 'unknown'
        END
      ),
      'actualMoveOut', jsonb_build_object(
        'date', CASE
          WHEN p_occupancy_lifecycle = 'vacated' THEN '2051-12-30'
          ELSE NULL
        END,
        'kind', CASE
          WHEN p_occupancy_lifecycle = 'vacated' THEN 'known'
          WHEN p_occupancy_lifecycle IN ('occupied', 'notice_given')
            THEN 'open_current'
          ELSE 'unknown'
        END,
        'confidence', CASE
          WHEN p_occupancy_lifecycle IN (
            'occupied',
            'notice_given',
            'vacated'
          ) THEN 'confirmed'
          ELSE 'unknown'
        END
      )
    ),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', p_person_id,
        'lifecycle', p_participant_lifecycle,
        'recordSource', p_record_source,
        'reason', 'tb02_round8',
        'startedOn', jsonb_build_object(
          'date', CASE
            WHEN p_participant_lifecycle IN ('present', 'ended')
              THEN '2051-01-02'
            ELSE NULL
          END,
          'kind', CASE
            WHEN p_participant_lifecycle IN ('present', 'ended')
              THEN 'known'
            ELSE 'unknown'
          END,
          'confidence', CASE
            WHEN p_participant_lifecycle IN ('present', 'ended')
              THEN 'confirmed'
            ELSE 'unknown'
          END
        ),
        'endedOn', jsonb_build_object(
          'date', CASE
            WHEN p_participant_lifecycle = 'ended' THEN '2051-12-30'
            ELSE NULL
          END,
          'kind', CASE
            WHEN p_participant_lifecycle = 'ended' THEN 'known'
            WHEN p_participant_lifecycle = 'present'
              THEN 'open_current'
            ELSE 'unknown'
          END,
          'confidence', CASE
            WHEN p_participant_lifecycle IN ('present', 'ended')
              THEN 'confirmed'
            ELSE 'unknown'
          END
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_public_create(
  p_unit_id uuid,
  p_person_id uuid,
  p_lease_status text,
  p_party_lifecycle text,
  p_occupancy_lifecycle text,
  p_participant_lifecycle text,
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
    'f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2051-01-01',
    DATE '2051-12-31',
    1000,
    'USD',
    5,
    'monthly',
    CASE
      WHEN p_lease_status IN ('cancelled', 'ended', 'terminated')
        THEN 'terminated'
      ELSE 'upcoming'
    END,
    NULL,
    NULL,
    p_lease_status,
    pg_temp.relationship_payload(
      p_person_id,
      p_party_lifecycle,
      p_occupancy_lifecycle,
      p_participant_lifecycle
    ),
    p_idempotency_key
  )
  INTO v_result;

  RETURN 'OK:' || (v_result ->> 'leaseId');
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_private_create(
  p_unit_id uuid,
  p_person_id uuid,
  p_lease_status text,
  p_party_lifecycle text,
  p_occupancy_lifecycle text,
  p_participant_lifecycle text,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_result jsonb;
BEGIN
  SELECT app_private.create_lease_with_relationships_internal(
    'f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2051-01-01',
    DATE '2051-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    p_lease_status,
    pg_temp.relationship_payload(
      p_person_id,
      p_party_lifecycle,
      p_occupancy_lifecycle,
      p_participant_lifecycle,
      'system_transition'
    ),
    p_idempotency_key
  )
  INTO v_result;

  RETURN 'OK:' || (v_result ->> 'leaseId');
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_compatibility_create(
  p_unit_id uuid,
  p_person_id uuid,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_result uuid;
BEGIN
  SELECT public.create_lease_with_authoritative_term(
    'f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2051-01-01',
    DATE '2051-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'active',
    p_idempotency_key
  )
  INTO v_result;

  RETURN 'OK:' || v_result::text;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-');
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
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'f5000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round8@example.test',
  extensions.crypt('tb02-round8', extensions.gen_salt('bf')),
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
  'f5000000-0000-4000-8000-000000000001',
  'TB-02 review round 8',
  'tb02-review-round-8'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f5000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000002',
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
  'f5000000-0000-4000-8000-000000000003',
  'f5000000-0000-4000-8000-000000000001',
  'TB-02 round 8 property',
  'TB02-R8',
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
    'f5000000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f5000000-0000-4000-8000-000000000001'::uuid,
  'f5000000-0000-4000-8000-000000000003'::uuid,
  'TB02-R8-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 26) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
SELECT
  (
    'f5000000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f5000000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 8 tenant ' || person_number::text,
  'individual'
FROM generate_series(30, 47) AS person_number;

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f5000000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f5000000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000000002',
  true
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000010',
    'f5000000-0000-4000-8000-000000000030',
    'draft',
    'effective',
    'reserved',
    'planned',
    'tb02-round8-invalid-draft'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'draft rejects a non-planned primary party'
);

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000011',
    'f5000000-0000-4000-8000-000000000031',
    'active',
    'effective',
    'cancelled_before_effective',
    'planned',
    'tb02-round8-invalid-active'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'active rejects a cancelled-before-effective occupancy'
);

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000012',
    'f5000000-0000-4000-8000-000000000032',
    'notice_given',
    'effective',
    'occupied',
    'present',
    'tb02-round8-invalid-notice'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'notice-given rejects a merely occupied occupancy'
);

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000013',
    'f5000000-0000-4000-8000-000000000033',
    'ended',
    'effective',
    'vacated',
    'ended',
    'tb02-round8-invalid-ended'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'ended rejects an effective primary party'
);

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000014',
    'f5000000-0000-4000-8000-000000000034',
    'terminated',
    'ended',
    'vacated',
    'planned',
    'tb02-round8-invalid-terminated'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'terminated rejects a planned participant'
);

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000015',
    'f5000000-0000-4000-8000-000000000035',
    'cancelled',
    'planned',
    'cancelled_before_effective',
    'cancelled_before_effective',
    'tb02-round8-invalid-cancelled'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'cancelled rejects a planned primary party'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND unit_id BETWEEN
        'f5000000-0000-4000-8000-000000000010'
        AND 'f5000000-0000-4000-8000-000000000015'
  ),
  0::bigint,
  'rejected status mismatches create no Leases'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_terms AS terms
    JOIN public.leases AS leases
      ON leases.id = terms.lease_id
    WHERE leases.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND leases.unit_id BETWEEN
        'f5000000-0000-4000-8000-000000000010'
        AND 'f5000000-0000-4000-8000-000000000015'
  ),
  0::bigint,
  'rejected status mismatches create no terms'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_parties AS parties
    JOIN public.leases AS leases
      ON leases.id = parties.lease_id
    WHERE leases.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND leases.unit_id BETWEEN
        'f5000000-0000-4000-8000-000000000010'
        AND 'f5000000-0000-4000-8000-000000000015'
  ),
  0::bigint,
  'rejected status mismatches create no parties'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_occupancies AS occupancies
    JOIN public.leases AS leases
      ON leases.id = occupancies.lease_id
    WHERE leases.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND leases.unit_id BETWEEN
        'f5000000-0000-4000-8000-000000000010'
        AND 'f5000000-0000-4000-8000-000000000015'
  ),
  0::bigint,
  'rejected status mismatches create no occupancies'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_occupancy_participants AS participants
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id = participants.lease_occupancy_id
    JOIN public.leases AS leases
      ON leases.id = occupancies.lease_id
    WHERE leases.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND leases.unit_id BETWEEN
        'f5000000-0000-4000-8000-000000000010'
        AND 'f5000000-0000-4000-8000-000000000015'
  ),
  0::bigint,
  'rejected status mismatches create no participants'
);

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND idempotency_key LIKE 'tb02-round8-invalid-%'
  ),
  0::bigint,
  'rejected status mismatches create no idempotency claims'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs AS activity
    WHERE activity.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND (activity.new_values ->> 'leaseId')::uuid IN (
        SELECT leases.id
        FROM public.leases
        WHERE leases.organization_id =
          'f5000000-0000-4000-8000-000000000001'
          AND leases.unit_id BETWEEN
            'f5000000-0000-4000-8000-000000000010'
            AND 'f5000000-0000-4000-8000-000000000015'
      )
  ),
  0::bigint,
  'rejected status mismatches create no relationship activity'
);

SET LOCAL ROLE authenticated;

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000020',
    'f5000000-0000-4000-8000-000000000040',
    'draft',
    'planned',
    'reserved',
    'planned',
    'tb02-round8-valid-draft'
  ),
  '^OK:',
  'draft accepts the planned reserved relationship mapping'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000021',
    'f5000000-0000-4000-8000-000000000041',
    'active',
    'effective',
    'occupied',
    'present',
    'tb02-round8-valid-active'
  ),
  '^OK:',
  'active accepts the effective occupied relationship mapping'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000022',
    'f5000000-0000-4000-8000-000000000042',
    'notice_given',
    'effective',
    'notice_given',
    'present',
    'tb02-round8-valid-notice'
  ),
  '^OK:',
  'notice-given accepts the effective notice relationship mapping'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000023',
    'f5000000-0000-4000-8000-000000000043',
    'ended',
    'ended',
    'vacated',
    'ended',
    'tb02-round8-valid-ended'
  ),
  '^OK:',
  'ended accepts the ended vacated relationship mapping'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000024',
    'f5000000-0000-4000-8000-000000000044',
    'terminated',
    'ended',
    'vacated',
    'ended',
    'tb02-round8-valid-terminated'
  ),
  '^OK:',
  'terminated accepts the ended vacated relationship mapping'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000025',
    'f5000000-0000-4000-8000-000000000045',
    'cancelled',
    'cancelled_before_effective',
    'cancelled_before_effective',
    'cancelled_before_effective',
    'tb02-round8-valid-cancelled'
  ),
  '^OK:',
  'cancelled accepts the cancelled-before-effective relationship mapping'
);

RESET ROLE;

SELECT is(
  (
    WITH expected(
      unit_id,
      lease_status,
      party_lifecycle,
      occupancy_lifecycle,
      participant_lifecycle
    ) AS (
      VALUES
        (
          'f5000000-0000-4000-8000-000000000020'::uuid,
          'draft',
          'planned',
          'reserved',
          'planned'
        ),
        (
          'f5000000-0000-4000-8000-000000000021'::uuid,
          'active',
          'effective',
          'occupied',
          'present'
        ),
        (
          'f5000000-0000-4000-8000-000000000022'::uuid,
          'notice_given',
          'effective',
          'notice_given',
          'present'
        ),
        (
          'f5000000-0000-4000-8000-000000000023'::uuid,
          'ended',
          'ended',
          'vacated',
          'ended'
        ),
        (
          'f5000000-0000-4000-8000-000000000024'::uuid,
          'terminated',
          'ended',
          'vacated',
          'ended'
        ),
        (
          'f5000000-0000-4000-8000-000000000025'::uuid,
          'cancelled',
          'cancelled_before_effective',
          'cancelled_before_effective',
          'cancelled_before_effective'
        )
    )
    SELECT count(*)
    FROM expected
    JOIN public.leases AS leases
      ON leases.organization_id =
        'f5000000-0000-4000-8000-000000000001'
      AND leases.unit_id = expected.unit_id
      AND leases.status = expected.lease_status
    JOIN public.lease_parties AS parties
      ON parties.lease_id = leases.id
      AND parties.business_lifecycle = expected.party_lifecycle
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.lease_id = leases.id
      AND occupancies.business_lifecycle = expected.occupancy_lifecycle
    JOIN public.lease_occupancy_participants AS participants
      ON participants.lease_occupancy_id = occupancies.id
      AND participants.business_lifecycle =
        expected.participant_lifecycle
  ),
  6::bigint,
  'all six exact mappings persist their party, occupancy, and participant states'
);

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND idempotency_key LIKE 'tb02-round8-valid-%'
      AND status = 'completed'
  ),
  12::bigint,
  'all six exact mappings complete both checked idempotency claim layers'
);

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000017',
    'f5000000-0000-4000-8000-000000000037',
    'active',
    'effective',
    'cancelled_before_effective',
    'planned',
    'tb02-round8-active-unit-bypass'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'active Unit uniqueness cannot be bypassed with cancelled occupancy evidence'
);

SELECT matches(
  pg_temp.capture_public_create(
    'f5000000-0000-4000-8000-000000000017',
    'f5000000-0000-4000-8000-000000000038',
    'active',
    'effective',
    'occupied',
    'present',
    'tb02-round8-active-unit-valid'
  ),
  '^OK:',
  'the Unit still accepts one correctly mapped active Lease'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND unit_id = 'f5000000-0000-4000-8000-000000000017'
  ),
  1::bigint,
  'the active Unit retains exactly its original Lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_occupancies
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND unit_id = 'f5000000-0000-4000-8000-000000000017'
      AND evidence_state = 'accepted'
  ),
  1::bigint,
  'the active Unit retains exactly its original accepted occupancy'
);

SELECT is(
  pg_temp.capture_private_create(
    'f5000000-0000-4000-8000-000000000016',
    'f5000000-0000-4000-8000-000000000036',
    'active',
    'effective',
    'cancelled_before_effective',
    'planned',
    'tb02-round8-private-mismatch'
  ),
  '23514:lease_relationship_status_lifecycle_mismatch',
  'the private checked boundary also rejects lifecycle mismatches'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f5000000-0000-4000-8000-000000000001'
      AND unit_id = 'f5000000-0000-4000-8000-000000000016'
  ),
  0::bigint,
  'the rejected private mismatch creates no Lease'
);

SET LOCAL ROLE authenticated;

SELECT matches(
  pg_temp.capture_compatibility_create(
    'f5000000-0000-4000-8000-000000000026',
    'f5000000-0000-4000-8000-000000000047',
    'tb02-round8-compatibility'
  ),
  '^OK:',
  'the system compatibility wrapper still composes an active Lease'
);

RESET ROLE;

SELECT is(
  (
    SELECT parties.business_lifecycle
      || '/' || occupancies.business_lifecycle
    FROM app_private.financial_idempotency_requests AS requests
    JOIN public.leases AS leases
      ON leases.id = (requests.result_ids ->> 'leaseId')::uuid
    JOIN public.lease_parties AS parties
      ON parties.lease_id = leases.id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.lease_id = leases.id
    WHERE requests.organization_id =
      'f5000000-0000-4000-8000-000000000001'
      AND requests.idempotency_key = 'tb02-round8-compatibility'
  ),
  'effective/occupied',
  'the compatibility wrapper keeps its system lifecycle mapping'
);

SELECT is(
  (
    WITH expected(
      lease_status,
      party_lifecycle,
      occupancy_lifecycle
    ) AS (
      VALUES
        ('active', 'effective', 'occupied'),
        (
          'cancelled',
          'cancelled_before_effective',
          'cancelled_before_effective'
        ),
        ('draft', 'planned', 'reserved'),
        ('ended', 'ended', 'vacated'),
        ('notice_given', 'effective', 'notice_given'),
        ('terminated', 'ended', 'vacated')
    )
    SELECT count(*)
    FROM expected
    WHERE app_private.build_checked_lease_import_relationship_payload(
      'f5000000-0000-4000-8000-000000000099',
      jsonb_build_object(
        'status', expected.lease_status,
        'tenantPersonId', 'f5000000-0000-4000-8000-000000000040'
      )
    ) #>> '{primaryParty,lifecycle}' = expected.party_lifecycle
      AND app_private.build_checked_lease_import_relationship_payload(
        'f5000000-0000-4000-8000-000000000099',
        jsonb_build_object(
          'status', expected.lease_status,
          'tenantPersonId', 'f5000000-0000-4000-8000-000000000040'
        )
      ) #>> '{occupancy,lifecycle}' = expected.occupancy_lifecycle
  ),
  6::bigint,
  'trusted import composition retains all six exact mappings'
);

SELECT * FROM finish();

ROLLBACK;
