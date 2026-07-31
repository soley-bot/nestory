BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(19);

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

CREATE OR REPLACE FUNCTION pg_temp.capture_jsonb(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_constraint text;
  v_detail text;
  v_result jsonb;
BEGIN
  EXECUTE p_sql INTO v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_constraint = CONSTRAINT_NAME,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object(
    'error',
    SQLSTATE || ':' || coalesce(
      NULLIF(v_constraint, ''),
      NULLIF(v_detail, ''),
      SQLERRM
    )
  );
END;
$$;

CREATE TEMP TABLE lease_history_tb02_review_state (
  admin_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  foreign_organization_id uuid NOT NULL,
  legacy_lease_id uuid,
  legacy_party_id uuid,
  legacy_occupancy_id uuid,
  relationship_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_history_tb02_review_state(
  admin_id,
  organization_id,
  foreign_organization_id
)
VALUES (
  'f4930000-0000-4000-8000-000000000001',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000003'
);

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
  'f4930000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'tb02-review@example.test',
  extensions.crypt('tb02-review', extensions.gen_salt('bf')),
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
  'f4930000-0000-4000-8000-000000000002',
  'TB-02 review organization',
  'tb02-review-organization'
),
(
  'f4930000-0000-4000-8000-000000000003',
  'TB-02 foreign organization',
  'tb02-foreign-organization'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000001',
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
VALUES
(
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000002',
  'TB-02 review property',
  'TB02-REVIEW',
  'apartment',
  'active'
),
(
  'f4930000-0000-4000-8000-000000000005',
  'f4930000-0000-4000-8000-000000000003',
  'TB-02 foreign property',
  'TB02-FOREIGN',
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
VALUES
(
  'f4930000-0000-4000-8000-000000000006',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'LEGACY-RETRY',
  'vacant',
  1000,
  'USD'
),
(
  'f4930000-0000-4000-8000-000000000007',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'PARTY-RANGE',
  'vacant',
  1000,
  'USD'
),
(
  'f4930000-0000-4000-8000-000000000008',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'OCCUPANCY-RANGE',
  'vacant',
  1000,
  'USD'
),
(
  'f4930000-0000-4000-8000-000000000009',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'PARTICIPANT-A',
  'vacant',
  1000,
  'USD'
),
(
  'f4930000-0000-4000-8000-000000000010',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'PARTICIPANT-B',
  'vacant',
  1000,
  'USD'
),
(
  'f4930000-0000-4000-8000-000000000011',
  'f4930000-0000-4000-8000-000000000003',
  'f4930000-0000-4000-8000-000000000005',
  'FOREIGN',
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
  'f4930000-0000-4000-8000-000000000012',
  'f4930000-0000-4000-8000-000000000002',
  'TB-02 primary tenant',
  'individual'
),
(
  'f4930000-0000-4000-8000-000000000013',
  'f4930000-0000-4000-8000-000000000002',
  'TB-02 planned participant',
  'individual'
),
(
  'f4930000-0000-4000-8000-000000000014',
  'f4930000-0000-4000-8000-000000000003',
  'TB-02 foreign tenant',
  'individual'
);

INSERT INTO public.person_roles(organization_id, person_id, role)
VALUES
(
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000012',
  'tenant'
),
(
  'f4930000-0000-4000-8000-000000000003',
  'f4930000-0000-4000-8000-000000000014',
  'tenant'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'f4930000-0000-4000-8000-000000000001',
  true
);

UPDATE lease_history_tb02_review_state
SET legacy_lease_id =
  app_private.create_lease_with_authoritative_term_plan04(
    'f4930000-0000-4000-8000-000000000002',
    'f4930000-0000-4000-8000-000000000004',
    'f4930000-0000-4000-8000-000000000006',
    'f4930000-0000-4000-8000-000000000012',
    DATE '2029-01-01',
    DATE '2029-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    'tb02-cross-version-retry'
  );

UPDATE lease_history_tb02_review_state AS state
SET
  legacy_party_id = parties.id,
  legacy_occupancy_id = occupancies.id
FROM public.lease_parties AS parties
JOIN public.lease_occupancies AS occupancies
  ON occupancies.organization_id = parties.organization_id
  AND occupancies.lease_id = parties.lease_id
WHERE parties.organization_id = state.organization_id
  AND parties.lease_id = state.legacy_lease_id
  AND parties.party_role = 'primary_tenant';

UPDATE lease_history_tb02_review_state
SET relationship_result = pg_temp.capture_jsonb(
  $sql$
    SELECT public.create_lease_with_relationships(
      'f4930000-0000-4000-8000-000000000002',
      'f4930000-0000-4000-8000-000000000004',
      'f4930000-0000-4000-8000-000000000006',
      'f4930000-0000-4000-8000-000000000012',
      DATE '2029-01-01',
      DATE '2029-12-31',
      1000,
      'USD',
      5,
      'monthly',
      'upcoming',
      NULL,
      NULL,
      'draft',
      '{
        "primaryParty": {
          "personId": "f4930000-0000-4000-8000-000000000012",
          "lifecycle": "planned",
          "recordSource": "system_transition",
          "reason": "compatibility_create",
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
          "lifecycle": "reserved",
          "recordSource": "system_transition",
          "reason": "compatibility_create",
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
        "participants": []
      }'::jsonb,
      'tb02-cross-version-retry'
    )
  $sql$
);

SELECT is(
  (
    SELECT proargnames
    FROM pg_catalog.pg_proc
    WHERE oid =
      'public.create_lease_with_authoritative_term(
        uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,
        integer,text,text,numeric,public.currency_code,text,text
      )'::regprocedure
  ),
  ARRAY[
    'p_organization_id',
    'p_property_id',
    'p_unit_id',
    'p_primary_tenant_person_id',
    'p_lease_start_date',
    'p_lease_end_date',
    'p_rent_amount',
    'p_rent_currency',
    'p_rent_due_day',
    'p_payment_frequency',
    'p_term_status',
    'p_deposit_amount',
    'p_deposit_currency',
    'p_lease_status',
    'p_idempotency_key'
  ]::text[],
  'the Plan 04 compatibility RPC preserves every named argument'
);

SELECT is(
  (SELECT (relationship_result ->> 'leaseId')::uuid
   FROM lease_history_tb02_review_state),
  (SELECT legacy_lease_id FROM lease_history_tb02_review_state),
  'a pre-TB-02 successful create retry adopts the original Lease'
);
SELECT is(
  (SELECT (relationship_result ->> 'partyId')::uuid
   FROM lease_history_tb02_review_state),
  (SELECT legacy_party_id FROM lease_history_tb02_review_state),
  'a cross-version retry normalizes the exact original primary party'
);
SELECT is(
  (SELECT (relationship_result ->> 'occupancyId')::uuid
   FROM lease_history_tb02_review_state),
  (SELECT legacy_occupancy_id FROM lease_history_tb02_review_state),
  'a cross-version retry normalizes the exact original occupancy'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leases
    WHERE organization_id =
      'f4930000-0000-4000-8000-000000000002'
      AND unit_id = 'f4930000-0000-4000-8000-000000000006'
  ),
  1,
  'a cross-version retry never creates a second Lease'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM app_private.financial_idempotency_requests
    WHERE organization_id =
      'f4930000-0000-4000-8000-000000000002'
      AND operation = 'create_lease_with_relationships_tb02'
  ),
  0,
  'TB-02 creation does not forget legacy claims in a second namespace'
);
SELECT ok(
  (
    SELECT
      result_ids ? 'leaseId'
      AND result_ids ? 'partyId'
      AND result_ids ? 'occupancyId'
      AND result_ids ? 'participantIds'
      AND result_ids ? 'relationshipPayloadHash'
    FROM app_private.financial_idempotency_requests
    WHERE organization_id =
      'f4930000-0000-4000-8000-000000000002'
      AND operation = 'create_lease_with_authoritative_term'
      AND idempotency_key = 'tb02-cross-version-retry'
  ),
  'the original idempotency claim binds the expanded relationship result'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      SELECT public.create_lease_with_relationships(
        'f4930000-0000-4000-8000-000000000002',
        'f4930000-0000-4000-8000-000000000004',
        'f4930000-0000-4000-8000-000000000006',
        'f4930000-0000-4000-8000-000000000012',
        DATE '2029-01-01',
        DATE '2029-12-31',
        1000,
        'USD',
        5,
        'monthly',
        'upcoming',
        NULL,
        NULL,
        'draft',
        '{
          "primaryParty": {
            "personId": "f4930000-0000-4000-8000-000000000012",
            "lifecycle": "planned",
            "recordSource": "system_transition",
            "reason": "different_relationship_payload",
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
            "lifecycle": "reserved",
            "recordSource": "system_transition",
            "reason": "compatibility_create",
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
          "participants": []
        }'::jsonb,
        'tb02-cross-version-retry'
      )
    $sql$
  ),
  '22023:lease_relationship_idempotency_conflict',
  'the original claim rejects a different expanded relationship payload'
);
SELECT lives_ok(
  $sql$
    SELECT public.create_lease_with_authoritative_term(
      p_organization_id =>
        'f4930000-0000-4000-8000-000000000002'::uuid,
      p_property_id =>
        'f4930000-0000-4000-8000-000000000004'::uuid,
      p_unit_id =>
        'f4930000-0000-4000-8000-000000000006'::uuid,
      p_primary_tenant_person_id =>
        'f4930000-0000-4000-8000-000000000012'::uuid,
      p_lease_start_date => DATE '2029-01-01',
      p_lease_end_date => DATE '2029-12-31',
      p_rent_amount => 1000::numeric,
      p_rent_currency => 'USD'::public.currency_code,
      p_rent_due_day => 5,
      p_payment_frequency => 'monthly',
      p_term_status => 'upcoming',
      p_deposit_amount => NULL::numeric,
      p_deposit_currency => NULL::public.currency_code,
      p_lease_status => 'draft',
      p_idempotency_key => 'tb02-cross-version-retry'
    )
  $sql$,
  'the compatibility RPC remains callable through its original named contract'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leases
    WHERE organization_id =
      'f4930000-0000-4000-8000-000000000002'
      AND unit_id = 'f4930000-0000-4000-8000-000000000006'
  ),
  1,
  'named compatibility replay also returns without duplication'
);

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
VALUES
(
  'f4930000-0000-4000-8000-000000000020',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000007',
  'TB-02 party range',
  'f4930000-0000-4000-8000-000000000012',
  DATE '2030-01-01',
  DATE '2030-12-31',
  1000,
  'USD',
  'draft'
),
(
  'f4930000-0000-4000-8000-000000000021',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000008',
  'TB-02 occupancy A',
  'f4930000-0000-4000-8000-000000000012',
  DATE '2030-01-01',
  DATE '2030-12-31',
  1000,
  'USD',
  'draft'
),
(
  'f4930000-0000-4000-8000-000000000022',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000008',
  'TB-02 occupancy B',
  'f4930000-0000-4000-8000-000000000012',
  DATE '2030-01-01',
  DATE '2030-12-31',
  1000,
  'USD',
  'draft'
),
(
  'f4930000-0000-4000-8000-000000000023',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000009',
  'TB-02 participant A',
  'f4930000-0000-4000-8000-000000000012',
  DATE '2031-01-01',
  DATE '2031-12-31',
  1000,
  'USD',
  'draft'
),
(
  'f4930000-0000-4000-8000-000000000024',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000010',
  'TB-02 participant B',
  'f4930000-0000-4000-8000-000000000012',
  DATE '2031-01-01',
  DATE '2031-12-31',
  1000,
  'USD',
  'draft'
),
(
  'f4930000-0000-4000-8000-000000000025',
  'f4930000-0000-4000-8000-000000000003',
  'f4930000-0000-4000-8000-000000000005',
  'f4930000-0000-4000-8000-000000000011',
  'TB-02 foreign Lease',
  'f4930000-0000-4000-8000-000000000014',
  DATE '2032-01-01',
  DATE '2032-12-31',
  1000,
  'USD',
  'draft'
);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v2',
  true
);

INSERT INTO public.lease_parties(
  id,
  organization_id,
  lease_id,
  person_id,
  party_role,
  is_primary,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  record_source,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence,
  evidence_reason
)
VALUES
(
  'f4930000-0000-4000-8000-000000000030',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000020',
  'f4930000-0000-4000-8000-000000000012',
  'primary_tenant',
  true,
  DATE '2030-01-01',
  DATE '2030-01-10',
  'accepted',
  'planned',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  'tb02_same_day_party_a'
),
(
  'f4930000-0000-4000-8000-000000000031',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000023',
  'f4930000-0000-4000-8000-000000000013',
  'authorized_occupant',
  false,
  NULL,
  NULL,
  'accepted',
  'planned',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_planned_participant_party_a'
),
(
  'f4930000-0000-4000-8000-000000000032',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000024',
  'f4930000-0000-4000-8000-000000000013',
  'authorized_occupant',
  false,
  NULL,
  NULL,
  'accepted',
  'planned',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_planned_participant_party_b'
),
(
  'f4930000-0000-4000-8000-000000000033',
  'f4930000-0000-4000-8000-000000000003',
  'f4930000-0000-4000-8000-000000000025',
  'f4930000-0000-4000-8000-000000000014',
  'primary_tenant',
  true,
  NULL,
  NULL,
  'accepted',
  'planned',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_foreign_party'
);

INSERT INTO public.lease_occupancies(
  id,
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  scheduled_move_in_date,
  scheduled_move_out_date,
  evidence_state,
  business_lifecycle,
  record_source,
  scheduled_move_in_kind,
  scheduled_move_in_confidence,
  scheduled_move_out_kind,
  scheduled_move_out_confidence,
  actual_move_in_kind,
  actual_move_in_confidence,
  actual_move_out_kind,
  actual_move_out_confidence,
  notice_kind,
  notice_confidence,
  evidence_reason
)
VALUES
(
  'f4930000-0000-4000-8000-000000000040',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000021',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000008',
  'reserved',
  DATE '2030-01-01',
  DATE '2030-01-10',
  'accepted',
  'reserved',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_same_day_occupancy_a'
),
(
  'f4930000-0000-4000-8000-000000000041',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000023',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000009',
  'reserved',
  NULL,
  NULL,
  'accepted',
  'reserved',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_planned_participant_occupancy_a'
),
(
  'f4930000-0000-4000-8000-000000000042',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000024',
  'f4930000-0000-4000-8000-000000000004',
  'f4930000-0000-4000-8000-000000000010',
  'reserved',
  NULL,
  NULL,
  'accepted',
  'reserved',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_planned_participant_occupancy_b'
),
(
  'f4930000-0000-4000-8000-000000000043',
  'f4930000-0000-4000-8000-000000000003',
  'f4930000-0000-4000-8000-000000000025',
  'f4930000-0000-4000-8000-000000000005',
  'f4930000-0000-4000-8000-000000000011',
  'reserved',
  NULL,
  NULL,
  'accepted',
  'reserved',
  'operator_confirmed',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'unknown',
  'tb02_foreign_occupancy'
);

INSERT INTO public.lease_occupancy_participants(
  id,
  organization_id,
  lease_occupancy_id,
  lease_party_id,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  record_source,
  started_on_kind,
  started_on_confidence,
  ended_on_kind,
  ended_on_confidence,
  evidence_reason
)
VALUES (
  'f4930000-0000-4000-8000-000000000050',
  'f4930000-0000-4000-8000-000000000002',
  'f4930000-0000-4000-8000-000000000041',
  'f4930000-0000-4000-8000-000000000031',
  DATE '2031-01-01',
  DATE '2031-01-10',
  'accepted',
  'planned',
  'operator_confirmed',
  'known',
  'confirmed',
  'known',
  'confirmed',
  'tb02_same_day_participant_a'
);

SELECT is(
  pg_temp.capture_error(
    $sql$
      INSERT INTO public.lease_parties(
        id, organization_id, lease_id, person_id, party_role, is_primary,
        started_on, ended_on, evidence_state, business_lifecycle,
        record_source, started_on_kind, started_on_confidence,
        ended_on_kind, ended_on_confidence, evidence_reason
      )
      VALUES (
        'f4930000-0000-4000-8000-000000000034',
        'f4930000-0000-4000-8000-000000000002',
        'f4930000-0000-4000-8000-000000000020',
        'f4930000-0000-4000-8000-000000000013',
        'primary_tenant',
        true,
        DATE '2030-01-10',
        DATE '2030-01-20',
        'accepted',
        'planned',
        'operator_confirmed',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'tb02_same_day_party_b'
      )
    $sql$
  ),
  '23P01:lease_parties_primary_effective_range_excl',
  'an inclusive same-day primary-party successor is rejected'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      INSERT INTO public.lease_occupancies(
        id, organization_id, lease_id, property_id, unit_id, status,
        scheduled_move_in_date, scheduled_move_out_date, evidence_state,
        business_lifecycle, record_source, scheduled_move_in_kind,
        scheduled_move_in_confidence, scheduled_move_out_kind,
        scheduled_move_out_confidence, actual_move_in_kind,
        actual_move_in_confidence, actual_move_out_kind,
        actual_move_out_confidence, notice_kind, notice_confidence,
        evidence_reason
      )
      VALUES (
        'f4930000-0000-4000-8000-000000000044',
        'f4930000-0000-4000-8000-000000000002',
        'f4930000-0000-4000-8000-000000000022',
        'f4930000-0000-4000-8000-000000000004',
        'f4930000-0000-4000-8000-000000000008',
        'reserved',
        DATE '2030-01-10',
        DATE '2030-01-20',
        'accepted',
        'reserved',
        'operator_confirmed',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'unknown',
        'unknown',
        'unknown',
        'unknown',
        'unknown',
        'unknown',
        'tb02_same_day_occupancy_b'
      )
    $sql$
  ),
  '23P01:lease_occupancies_unit_protected_range_excl',
  'an inclusive same-day Unit-occupancy successor is rejected'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      INSERT INTO public.lease_occupancy_participants(
        id, organization_id, lease_occupancy_id, lease_party_id,
        started_on, ended_on, evidence_state, business_lifecycle,
        record_source, started_on_kind, started_on_confidence,
        ended_on_kind, ended_on_confidence, evidence_reason
      )
      VALUES (
        'f4930000-0000-4000-8000-000000000051',
        'f4930000-0000-4000-8000-000000000002',
        'f4930000-0000-4000-8000-000000000042',
        'f4930000-0000-4000-8000-000000000032',
        DATE '2031-01-10',
        DATE '2031-01-20',
        'accepted',
        'planned',
        'operator_confirmed',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'tb02_same_day_participant_b'
      )
    $sql$
  ),
  '23P01:occupancy_participant_person_overlap',
  'accepted known planned Person ranges cannot overlap across parties or Units'
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
  'f4930000-0000-4000-8000-000000000060',
  'f4930000-0000-4000-8000-000000000002',
  'leases',
  'staged',
  'tb02-review.csv',
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
  'f4930000-0000-4000-8000-000000000061',
  'f4930000-0000-4000-8000-000000000060',
  'f4930000-0000-4000-8000-000000000002',
  1,
  'ready',
  'create'
);

SELECT ok(
  (
    SELECT
      pg_get_constraintdef(oid)
      LIKE
        'FOREIGN KEY (organization_id, result_lease_id) REFERENCES %'
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.import_rows'::regclass
      AND conname = 'import_rows_result_lease_org_fk'
  ),
  'Lease import result identity is organization-scoped'
);
SELECT ok(
  (
    SELECT
      pg_get_constraintdef(oid)
      LIKE
        'FOREIGN KEY (organization_id, result_lease_party_id) REFERENCES %'
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.import_rows'::regclass
      AND conname = 'import_rows_result_lease_party_org_fk'
  ),
  'Lease-party import result identity is organization-scoped'
);
SELECT ok(
  (
    SELECT
      pg_get_constraintdef(oid)
      LIKE
        'FOREIGN KEY (organization_id, result_lease_occupancy_id) REFERENCES %'
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.import_rows'::regclass
      AND conname = 'import_rows_result_lease_occupancy_org_fk'
  ),
  'Lease-occupancy import result identity is organization-scoped'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET result_lease_id =
        'f4930000-0000-4000-8000-000000000025'
      WHERE id = 'f4930000-0000-4000-8000-000000000061'
    $sql$
  ),
  '23503:import_rows_result_lease_org_fk',
  'direct DML cannot link an import result to another organization Lease'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET result_lease_party_id =
        'f4930000-0000-4000-8000-000000000033'
      WHERE id = 'f4930000-0000-4000-8000-000000000061'
    $sql$
  ),
  '23503:import_rows_result_lease_party_org_fk',
  'direct DML cannot link an import result to another organization party'
);
SELECT is(
  pg_temp.capture_error(
    $sql$
      UPDATE public.import_rows
      SET result_lease_occupancy_id =
        'f4930000-0000-4000-8000-000000000043'
      WHERE id = 'f4930000-0000-4000-8000-000000000061'
    $sql$
  ),
  '23503:import_rows_result_lease_occupancy_org_fk',
  'direct DML cannot link an import result to another organization occupancy'
);

SELECT set_config('app.lease_history_write_context', 'off', true);

SELECT * FROM finish();
ROLLBACK;
