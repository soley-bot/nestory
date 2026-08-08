BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

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

CREATE TEMP TABLE lease_history_tb02_round2_state (
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  property_id uuid NOT NULL,
  valid_tenant_id uuid NOT NULL,
  normalized_lease_id uuid,
  lease_a_id uuid,
  party_a_id uuid,
  occupancy_a_id uuid,
  lease_b_id uuid,
  party_b_id uuid,
  occupancy_b_id uuid
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_round2_state(
  organization_id,
  admin_id,
  property_id,
  valid_tenant_id
)
VALUES (
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000002',
  'f4940000-0000-4000-8000-000000000003',
  'f4940000-0000-4000-8000-000000000023'
);

GRANT SELECT ON lease_history_tb02_round2_state TO authenticated;

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
  'f4940000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'tb02-round2@example.test',
  extensions.crypt('tb02-round2', extensions.gen_salt('bf')),
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
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 review round 2',
  'tb02-review-round-2'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000002',
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
  'f4940000-0000-4000-8000-000000000003',
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 round 2 property',
  'TB02-R2',
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
    'f4940000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f4940000-0000-4000-8000-000000000001'::uuid,
  'f4940000-0000-4000-8000-000000000003'::uuid,
  'TB02-R2-' || unit_number::text,
  'vacant',
  1000,
  'USD'
FROM generate_series(6, 14) AS unit_number;

INSERT INTO public.people(
  id,
  organization_id,
  display_name,
  party_type
)
VALUES
(
  'f4940000-0000-4000-8000-000000000020',
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 owner only',
  'individual'
),
(
  'f4940000-0000-4000-8000-000000000021',
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 inactive tenant',
  'individual'
),
(
  'f4940000-0000-4000-8000-000000000022',
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 archived tenant',
  'individual'
),
(
  'f4940000-0000-4000-8000-000000000023',
  'f4940000-0000-4000-8000-000000000001',
  'TB-02 active tenant',
  'individual'
);

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status,
  archived_at
)
VALUES
(
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000020',
  'owner',
  'active',
  NULL
),
(
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000021',
  'tenant',
  'inactive',
  NULL
),
(
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000022',
  'tenant',
  'active',
  now()
),
(
  'f4940000-0000-4000-8000-000000000001',
  'f4940000-0000-4000-8000-000000000023',
  'tenant',
  'active',
  NULL
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f4940000-0000-4000-8000-000000000002',
  true
);

CREATE OR REPLACE FUNCTION pg_temp.call_compatibility_create(
  p_person_id uuid,
  p_unit_id uuid,
  p_lease_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT public.create_lease_with_authoritative_term(
    'f4940000-0000-4000-8000-000000000001',
    'f4940000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    DATE '2034-01-01',
    DATE '2034-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    p_lease_status,
    p_idempotency_key
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.default_relationship_payload(
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
        'reason', 'tb02_round2_test',
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
        'reason', 'tb02_round2_test',
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

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT pg_temp.call_compatibility_create(
        'f4940000-0000-4000-8000-000000000020',
        'f4940000-0000-4000-8000-000000000006',
        'draft',
        'tb02-round2-owner-only'
      )
    $sql$
  ),
  '23503:An active Tenant role is required for the exact primary Tenant',
  'an owner-only Person cannot be promoted to primary Tenant by creation'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT pg_temp.call_compatibility_create(
        'f4940000-0000-4000-8000-000000000021',
        'f4940000-0000-4000-8000-000000000007',
        'draft',
        'tb02-round2-inactive-tenant'
      )
    $sql$
  ),
  '23503:An active Tenant role is required for the exact primary Tenant',
  'an inactive Tenant role cannot become an accepted primary Tenant'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT pg_temp.call_compatibility_create(
        'f4940000-0000-4000-8000-000000000022',
        'f4940000-0000-4000-8000-000000000008',
        'draft',
        'tb02-round2-archived-tenant'
      )
    $sql$
  ),
  '23503:An active Tenant role is required for the exact primary Tenant',
  'an archived Tenant role cannot become an accepted primary Tenant'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.person_roles
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND person_id IN (
        'f4940000-0000-4000-8000-000000000020',
        'f4940000-0000-4000-8000-000000000021',
        'f4940000-0000-4000-8000-000000000022'
      )
      AND role = 'tenant'
      AND status = 'active'
      AND archived_at IS NULL
  ),
  0,
  'rejected creation never auto-activates a Tenant role'
);

UPDATE lease_history_tb02_round2_state
SET normalized_lease_id = pg_temp.call_compatibility_create(
  'f4940000-0000-4000-8000-000000000023',
  'f4940000-0000-4000-8000-000000000009',
  ' Active ',
  'tb02-round2-normalized-active'
);

SELECT is(
  (
    SELECT leases.status
    FROM public.leases AS leases
    JOIN lease_history_tb02_round2_state AS state
      ON state.normalized_lease_id = leases.id
  ),
  'active',
  'an active Tenant with whitespace/case status creates an active Lease'
);

SELECT is(
  (
    SELECT parties.business_lifecycle
    FROM public.lease_parties AS parties
    JOIN lease_history_tb02_round2_state AS state
      ON state.normalized_lease_id = parties.lease_id
    WHERE parties.party_role = 'primary_tenant'
  ),
  'effective',
  'normalized active status creates an effective primary party'
);

SELECT is(
  (
    SELECT occupancies.business_lifecycle
    FROM public.lease_occupancies AS occupancies
    JOIN lease_history_tb02_round2_state AS state
      ON state.normalized_lease_id = occupancies.lease_id
  ),
  'occupied',
  'normalized active status creates an occupied relationship'
);

SELECT is(
  pg_temp.call_compatibility_create(
    'f4940000-0000-4000-8000-000000000023',
    'f4940000-0000-4000-8000-000000000009',
    ' Active ',
    'tb02-round2-normalized-active'
  ),
  (
    SELECT normalized_lease_id
    FROM lease_history_tb02_round2_state
  ),
  'an exact raw whitespace/case retry preserves Plan 04 idempotency'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leases
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND unit_id = 'f4940000-0000-4000-8000-000000000009'
  ),
  1,
  'the raw compatibility replay does not duplicate the Lease'
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
VALUES (
  'f4940000-0000-4000-8000-000000000060',
  'f4940000-0000-4000-8000-000000000001',
  'people',
  'staged',
  'tb02-round2-people.csv',
  1,
  1
);

INSERT INTO public.import_rows(
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label
)
VALUES (
  'f4940000-0000-4000-8000-000000000061',
  'f4940000-0000-4000-8000-000000000060',
  'f4940000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4940000-0000-4000-8000-000000000001',
        'f4940000-0000-4000-8000-000000000003',
        'f4940000-0000-4000-8000-000000000010',
        'f4940000-0000-4000-8000-000000000023',
        DATE '2036-01-01',
        DATE '2036-12-31',
        1000,
        'USD',
        5,
        'monthly',
        'upcoming',
        NULL,
        NULL,
        'draft',
        pg_temp.default_relationship_payload(
          'f4940000-0000-4000-8000-000000000023',
          'f4940000-0000-4000-8000-000000000061'
        ),
        'tb02-round2-wrong-import-provenance'
      )
    $sql$
  ),
  '42501:lease_import_source_context_required',
  'public relationship creation rejects any caller-supplied import source row'
);

UPDATE lease_history_tb02_round2_state
SET
  lease_a_id = pg_temp.call_compatibility_create(
    'f4940000-0000-4000-8000-000000000023',
    'f4940000-0000-4000-8000-000000000012',
    'draft',
    'tb02-round2-tuple-a'
  ),
  lease_b_id = pg_temp.call_compatibility_create(
    'f4940000-0000-4000-8000-000000000023',
    'f4940000-0000-4000-8000-000000000013',
    'draft',
    'tb02-round2-tuple-b'
  );

UPDATE lease_history_tb02_round2_state AS state
SET
  party_a_id = party_a.id,
  occupancy_a_id = occupancy_a.id,
  party_b_id = party_b.id,
  occupancy_b_id = occupancy_b.id
FROM public.lease_parties AS party_a
JOIN public.lease_occupancies AS occupancy_a
  ON occupancy_a.organization_id = party_a.organization_id
  AND occupancy_a.lease_id = party_a.lease_id
JOIN public.lease_parties AS party_b
  ON party_b.organization_id = party_a.organization_id
JOIN public.lease_occupancies AS occupancy_b
  ON occupancy_b.organization_id = party_b.organization_id
  AND occupancy_b.lease_id = party_b.lease_id
WHERE party_a.lease_id = state.lease_a_id
  AND party_b.lease_id = state.lease_b_id
  AND party_a.party_role = 'primary_tenant'
  AND party_b.party_role = 'primary_tenant';

SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', 'f4940000-0000-4000-8000-000000000001',
    'sourceClaimHash', encode(extensions.digest('f4940000-0000-4000-8000-000000000065', 'sha256'), 'hex'),
    'runId', 'f4940000-0000-4000-8000-000000000065'
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
  snapshot_hash,
  created_by,
  updated_by
)
VALUES
(
  'f4940000-0000-4000-8000-000000000062',
  'f4940000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round2-forgery.csv',
  2,
  2,
  NULL,
  NULL,
  (SELECT auth.uid()),
  (SELECT auth.uid())
),
(
  'f4940000-0000-4000-8000-000000000065',
  'f4940000-0000-4000-8000-000000000001',
  'leases',
  'staged',
  'tb02-round2-valid.csv',
  1,
  1,
  encode(extensions.digest('f4940000-0000-4000-8000-000000000065', 'sha256'), 'hex'),
  encode(extensions.digest('snapshot:f4940000-0000-4000-8000-000000000065', 'sha256'), 'hex'),
  (SELECT auth.uid()),
  (SELECT auth.uid())
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
  'f4940000-0000-4000-8000-000000000063',
  'f4940000-0000-4000-8000-000000000062',
  'f4940000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  '{}'::jsonb
),
(
  'f4940000-0000-4000-8000-000000000064',
  'f4940000-0000-4000-8000-000000000062',
  'f4940000-0000-4000-8000-000000000001',
  2,
  'ready',
  'create',
  '{}'::jsonb
),
(
  'f4940000-0000-4000-8000-000000000066',
  'f4940000-0000-4000-8000-000000000065',
  'f4940000-0000-4000-8000-000000000001',
  1,
  'ready',
  'create',
  jsonb_build_object(
    'propertyId', 'f4940000-0000-4000-8000-000000000003',
    'unitId', 'f4940000-0000-4000-8000-000000000014',
    'tenantPersonId', 'f4940000-0000-4000-8000-000000000023',
    'leaseStartDate', '2040-01-01',
    'leaseEndDate', '2040-12-31',
    'monthlyRentAmount', 1000,
    'rentDueDay', 5,
    'paymentFrequency', 'monthly',
    'termStatus', 'upcoming',
    'status', 'draft'
  )
);

SELECT set_config('app.atomic_import_write_context', '', true);

SET LOCAL ROLE authenticated;

SELECT matches(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        result_lease_id = (
          SELECT lease_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_party_id = (
          SELECT party_b_id FROM lease_history_tb02_round2_state
        ),
        result_lease_occupancy_id = (
          SELECT occupancy_a_id FROM lease_history_tb02_round2_state
        )
      WHERE id = 'f4940000-0000-4000-8000-000000000063'
    $sql$
  ),
  '^42501:permission denied for (table|column).*import_rows',
  'an authenticated admin cannot write a forged Lease-party result tuple'
);

SELECT matches(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        result_lease_id = (
          SELECT lease_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_party_id = (
          SELECT party_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_occupancy_id = (
          SELECT occupancy_b_id FROM lease_history_tb02_round2_state
        )
      WHERE id = 'f4940000-0000-4000-8000-000000000064'
    $sql$
  ),
  '^42501:permission denied for (table|column).*import_rows',
  'an authenticated admin cannot write a forged Lease-occupancy result tuple'
);

RESET ROLE;

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        result_lease_id = (
          SELECT lease_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_party_id = (
          SELECT party_b_id FROM lease_history_tb02_round2_state
        ),
        result_lease_occupancy_id = (
          SELECT occupancy_a_id FROM lease_history_tb02_round2_state
        )
      WHERE id = 'f4940000-0000-4000-8000-000000000063'
    $sql$
  ),
  '23514:import_row_lease_result_mismatch',
  'trusted writes also reject a same-org mismatched Lease-party tuple'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET
        result_lease_id = (
          SELECT lease_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_party_id = (
          SELECT party_a_id FROM lease_history_tb02_round2_state
        ),
        result_lease_occupancy_id = (
          SELECT occupancy_b_id FROM lease_history_tb02_round2_state
        )
      WHERE id = 'f4940000-0000-4000-8000-000000000064'
    $sql$
  ),
  '23514:import_row_lease_result_mismatch',
  'trusted writes also reject a same-org mismatched Lease-occupancy tuple'
);

SET LOCAL ROLE authenticated;

SELECT is(
  (
    public.commit_generic_import_run(
      'f4940000-0000-4000-8000-000000000065',
      'f4940000-0000-4000-8000-000000000001'
    ) ->> 'created'
  )::integer,
  1,
  'the checked Lease import RPC can write one valid result tuple'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    JOIN public.lease_parties AS parties
      ON parties.organization_id = rows.organization_id
      AND parties.id = rows.result_lease_party_id
      AND parties.lease_id = rows.result_lease_id
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = rows.organization_id
      AND occupancies.id = rows.result_lease_occupancy_id
      AND occupancies.lease_id = rows.result_lease_id
    WHERE rows.id = 'f4940000-0000-4000-8000-000000000066'
      AND rows.row_status = 'committed'
  ),
  'the checked import result references one exact coherent Lease composition'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4940000-0000-4000-8000-000000000001',
        'f4940000-0000-4000-8000-000000000003',
        'f4940000-0000-4000-8000-000000000011',
        'f4940000-0000-4000-8000-000000000023',
        DATE '2038-01-01',
        DATE '2038-12-31',
        1000,
        'USD',
        5,
        'monthly',
        'upcoming',
        NULL,
        NULL,
        'active',
        '{
          "primaryParty": {
            "personId": "f4940000-0000-4000-8000-000000000023",
            "lifecycle": "effective",
            "recordSource": "operator_confirmed",
            "reason": "tb02_round2_rollback",
            "startedOn": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            },
            "endedOn": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            }
          },
          "occupancy": {
            "lifecycle": "occupied",
            "recordSource": "operator_confirmed",
            "reason": "tb02_round2_rollback",
            "scheduledMoveIn": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            },
            "scheduledMoveOut": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            },
            "actualMoveIn": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            },
            "actualMoveOut": {
              "date": null,
              "kind": "unknown",
              "confidence": "unknown"
            }
          },
          "participants": [
            {
              "personId": "f4940000-0000-4000-8000-000000000023",
              "lifecycle": "present",
              "recordSource": "operator_confirmed",
              "reason": "tb02_round2_rejected_participant",
              "startedOn": {
                "date": "2038-02-01",
                "kind": "known",
                "confidence": "confirmed"
              },
              "endedOn": {
                "date": "2038-03-01",
                "kind": "known",
                "confidence": "confirmed"
              }
            }
          ]
        }'::jsonb,
        'tb02-round2-rollback'
      )
    $sql$
  ),
  '23514:occupancy_participant_actual_containment_required',
  'a rejected participant composition returns the containment error'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leases
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND unit_id = 'f4940000-0000-4000-8000-000000000011'
  ),
  0,
  'rejected participant composition leaves no Lease'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_terms AS terms
    JOIN public.leases AS leases
      ON leases.organization_id = terms.organization_id
      AND leases.id = terms.lease_id
    WHERE leases.organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND leases.unit_id = 'f4940000-0000-4000-8000-000000000011'
  ),
  0,
  'rejected participant composition leaves no authoritative term'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties AS parties
    JOIN public.leases AS leases
      ON leases.organization_id = parties.organization_id
      AND leases.id = parties.lease_id
    WHERE leases.organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND leases.unit_id = 'f4940000-0000-4000-8000-000000000011'
  ),
  0,
  'rejected participant composition leaves no Lease party'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancies
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND unit_id = 'f4940000-0000-4000-8000-000000000011'
  ),
  0,
  'rejected participant composition leaves no occupancy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participants
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = participants.organization_id
      AND occupancies.id = participants.lease_occupancy_id
    WHERE occupancies.organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND occupancies.unit_id =
        'f4940000-0000-4000-8000-000000000011'
  ),
  0,
  'rejected participant composition leaves no participant'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.activity_logs
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND (
        new_values ->> 'unit_id' =
          'f4940000-0000-4000-8000-000000000011'
        OR new_values ->> 'unitId' =
          'f4940000-0000-4000-8000-000000000011'
      )
  ),
  0,
  'rejected participant composition leaves no activity'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM app_private.financial_idempotency_requests
    WHERE organization_id =
      'f4940000-0000-4000-8000-000000000001'
      AND idempotency_key LIKE 'tb02-round2-rollback%'
  ),
  0,
  'rejected participant composition leaves no idempotency residue'
);

SELECT * FROM finish();
ROLLBACK;
