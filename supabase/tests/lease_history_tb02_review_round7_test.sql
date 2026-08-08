BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(16);

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_person_id uuid,
  p_reason text DEFAULT 'tb02_round7'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_person_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', p_reason,
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
      'reason', p_reason,
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

CREATE OR REPLACE FUNCTION pg_temp.capture_relationship_result(
  p_unit_id uuid,
  p_person_id uuid,
  p_rent_amount numeric,
  p_idempotency_key text,
  p_reason text DEFAULT 'tb02_round7'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_detail text;
  v_result jsonb;
BEGIN
  SELECT public.create_lease_with_relationships(
    'f4990000-0000-4000-8000-000000000001',
    'f4990000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2050-01-01',
    DATE '2050-12-31',
    p_rent_amount,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    pg_temp.relationship_payload(p_person_id, p_reason),
    p_idempotency_key
  )
  INTO v_result;

  RETURN jsonb_build_object('result', v_result);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object(
    'error',
    SQLSTATE || ':' || coalesce(NULLIF(v_detail, ''), '-')
      || ':' || SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_compatibility_result(
  p_unit_id uuid,
  p_person_id uuid,
  p_rent_amount numeric,
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
    'f4990000-0000-4000-8000-000000000001',
    'f4990000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2050-01-01',
    DATE '2050-12-31',
    p_rent_amount,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
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

CREATE TEMP TABLE lease_history_tb02_round7_state (
  invalidated_legacy_lease_id uuid,
  live_legacy_lease_id uuid,
  expanded_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round7_state DEFAULT VALUES;
GRANT ALL ON lease_history_tb02_round7_state TO authenticated;

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
  'f4990000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round7@example.test',
  extensions.crypt('tb02-round7', extensions.gen_salt('bf')),
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
  'f4990000-0000-4000-8000-000000000001',
  'TB-02 review round 7',
  'tb02-review-round-7'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f4990000-0000-4000-8000-000000000001',
  'f4990000-0000-4000-8000-000000000002',
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
  'f4990000-0000-4000-8000-000000000003',
  'f4990000-0000-4000-8000-000000000001',
  'TB-02 round 7 property',
  'TB02-R7',
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
    'f4990000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4990000-0000-4000-8000-000000000001'::uuid,
  'f4990000-0000-4000-8000-000000000003'::uuid,
  'TB02-R7-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(10, 12) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
SELECT
  (
    'f4990000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f4990000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 7 tenant ' || person_number::text,
  'individual'
FROM generate_series(20, 22) AS person_number;

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f4990000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f4990000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  'f4990000-0000-4000-8000-000000000002',
  true
);

UPDATE lease_history_tb02_round7_state
SET invalidated_legacy_lease_id =
  app_private.create_lease_with_authoritative_term_plan04(
    'f4990000-0000-4000-8000-000000000001',
    'f4990000-0000-4000-8000-000000000003',
    'f4990000-0000-4000-8000-000000000010',
    'f4990000-0000-4000-8000-000000000020',
    DATE '2050-01-01',
    DATE '2050-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    'tb02-round7-invalidated-legacy'
  ),
  live_legacy_lease_id =
  app_private.create_lease_with_authoritative_term_plan04(
    'f4990000-0000-4000-8000-000000000001',
    'f4990000-0000-4000-8000-000000000003',
    'f4990000-0000-4000-8000-000000000011',
    'f4990000-0000-4000-8000-000000000021',
    DATE '2050-01-01',
    DATE '2050-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    'tb02-round7-live-legacy'
  );

SET LOCAL ROLE authenticated;

UPDATE lease_history_tb02_round7_state
SET expanded_result = public.create_lease_with_relationships(
  'f4990000-0000-4000-8000-000000000001',
  'f4990000-0000-4000-8000-000000000003',
  'f4990000-0000-4000-8000-000000000012',
  'f4990000-0000-4000-8000-000000000022',
  DATE '2050-01-01',
  DATE '2050-12-31',
  1000,
  'USD',
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'draft',
  pg_temp.relationship_payload(
    'f4990000-0000-4000-8000-000000000022'
  ),
  'tb02-round7-expanded'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key IN (
        'tb02-round7-invalidated-legacy',
        'tb02-round7-live-legacy'
      )
      AND result_ids = jsonb_build_object(
        'leaseId',
        CASE idempotency_key
          WHEN 'tb02-round7-invalidated-legacy' THEN (
            SELECT invalidated_legacy_lease_id
            FROM lease_history_tb02_round7_state
          )
          ELSE (
            SELECT live_legacy_lease_id
            FROM lease_history_tb02_round7_state
          )
        END
      )
  ),
  2::bigint,
  'both pre-TB-02 claims begin as completed Lease-ID-only results'
);

SELECT ok(
  (
    SELECT
      result_ids ? 'relationshipPayloadHash'
      AND result_ids ?& ARRAY[
        'leaseId',
        'partyId',
        'occupancyId',
        'participantIds'
      ]
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round7-expanded'
  ),
  'an expanded request starts with the full two-hash replay contract'
);

UPDATE public.person_roles
SET status = 'inactive'
WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
  AND person_id IN (
    'f4990000-0000-4000-8000-000000000020',
    'f4990000-0000-4000-8000-000000000022'
  )
  AND role = 'tenant';

UPDATE public.units
SET archived_at = now()
WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
  AND id IN (
    'f4990000-0000-4000-8000-000000000010',
    'f4990000-0000-4000-8000-000000000012'
  );

SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.capture_relationship_result(
    'f4990000-0000-4000-8000-000000000010',
    'f4990000-0000-4000-8000-000000000020',
    1000,
    'tb02-round7-invalidated-legacy'
  ),
  jsonb_build_object(
    'result',
    jsonb_build_object(
      'leaseId',
      (
        SELECT invalidated_legacy_lease_id
        FROM lease_history_tb02_round7_state
      )
    )
  ),
  'legacy exact replay returns its stored result before mutable checks'
);

SELECT is(
  pg_temp.capture_compatibility_result(
    'f4990000-0000-4000-8000-000000000010',
    'f4990000-0000-4000-8000-000000000020',
    1000,
    'tb02-round7-invalidated-legacy'
  ),
  'OK:' || (
    SELECT invalidated_legacy_lease_id::text
    FROM lease_history_tb02_round7_state
  ),
  'the compatibility RPC accepts the same Lease-ID-only replay shape'
);

SELECT is(
  pg_temp.capture_relationship_result(
    'f4990000-0000-4000-8000-000000000010',
    'f4990000-0000-4000-8000-000000000020',
    1001,
    'tb02-round7-invalidated-legacy'
  ) ->> 'error',
  '22023:lease_relationship_idempotency_conflict:'
    || 'Conflicting Lease relationship idempotency request',
  'legacy completed replay still rejects a changed scalar payload'
);

SELECT is(
  pg_temp.capture_relationship_result(
    'f4990000-0000-4000-8000-000000000011',
    'f4990000-0000-4000-8000-000000000021',
    1000,
    'tb02-round7-live-legacy'
  ),
  jsonb_build_object(
    'result',
    jsonb_build_object(
      'leaseId',
      (
        SELECT live_legacy_lease_id
        FROM lease_history_tb02_round7_state
      )
    )
  ),
  'legacy replay does not fall through when mutable prerequisites still pass'
);

SELECT is(
  pg_temp.capture_relationship_result(
    'f4990000-0000-4000-8000-000000000012',
    'f4990000-0000-4000-8000-000000000022',
    1000,
    'tb02-round7-expanded'
  ) -> 'result',
  (
    SELECT expanded_result
    FROM lease_history_tb02_round7_state
  ),
  'expanded exact replay retains its full relationship result'
);

SELECT is(
  pg_temp.capture_relationship_result(
    'f4990000-0000-4000-8000-000000000012',
    'f4990000-0000-4000-8000-000000000022',
    1000,
    'tb02-round7-expanded',
    'tb02_round7_changed'
  ) ->> 'error',
  '22023:lease_relationship_idempotency_conflict:'
    || 'Conflicting Lease relationship idempotency request',
  'expanded replay still enforces its relationship payload hash'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND unit_id = 'f4990000-0000-4000-8000-000000000010'
  ),
  1::bigint,
  'invalidated legacy replay leaves exactly the original Lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round7-invalidated-legacy'
  ),
  1::bigint,
  'invalidated legacy replay leaves exactly the original claim'
);

SELECT is(
  (
    SELECT result_ids
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round7-invalidated-legacy'
  ),
  jsonb_build_object(
    'leaseId',
    (
      SELECT invalidated_legacy_lease_id
      FROM lease_history_tb02_round7_state
    )
  ),
  'invalidated legacy replay never rewrites the stored result'
);

SELECT is(
  (
    SELECT parties.evidence_state || '/' || occupancies.evidence_state
    FROM public.lease_parties AS parties
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = parties.organization_id
      AND occupancies.lease_id = parties.lease_id
    WHERE parties.lease_id = (
      SELECT invalidated_legacy_lease_id
      FROM lease_history_tb02_round7_state
    )
  ),
  'legacy_unresolved/legacy_unresolved',
  'invalidated legacy replay leaves relationship evidence untouched'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND unit_id = 'f4990000-0000-4000-8000-000000000011'
  ),
  1::bigint,
  'live legacy replay leaves exactly the original Lease'
);

SELECT is(
  (
    SELECT result_ids
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round7-live-legacy'
  ),
  jsonb_build_object(
    'leaseId',
    (
      SELECT live_legacy_lease_id
      FROM lease_history_tb02_round7_state
    )
  ),
  'live legacy replay never expands the completed claim'
);

SELECT is(
  (
    SELECT parties.evidence_state || '/' || occupancies.evidence_state
    FROM public.lease_parties AS parties
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = parties.organization_id
      AND occupancies.lease_id = parties.lease_id
    WHERE parties.lease_id = (
      SELECT live_legacy_lease_id
      FROM lease_history_tb02_round7_state
    )
  ),
  'legacy_unresolved/legacy_unresolved',
  'live legacy replay cannot fall through into relationship adoption'
);

SELECT ok(
  (
    SELECT
      count(*) = 1
      AND bool_and(
        result_ids ? 'relationshipPayloadHash'
        AND result_ids ?& ARRAY[
          'leaseId',
          'partyId',
          'occupancyId',
          'participantIds'
        ]
      )
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND idempotency_key = 'tb02-round7-expanded'
  )
  AND (
    SELECT count(*) = 1
    FROM public.leases
    WHERE organization_id = 'f4990000-0000-4000-8000-000000000001'
      AND unit_id = 'f4990000-0000-4000-8000-000000000012'
  ),
  'expanded replay remains one full claim and one Lease'
);

SELECT * FROM finish();

ROLLBACK;
