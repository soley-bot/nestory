BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

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
    RETURN jsonb_build_object('threw', false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL;

    RETURN jsonb_build_object(
      'threw', true,
      'sqlstate', v_state,
      'message', v_message,
      'detail', NULLIF(v_detail, '')
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(
  p_person_id uuid,
  p_lease_status text,
  p_start_date date,
  p_end_date date
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
        ELSE 'effective'
      END,
      'recordSource', 'operator_confirmed',
      'reason', 'tb02_round9',
      'startedOn', jsonb_build_object(
        'date', CASE
          WHEN p_lease_status = 'cancelled' THEN NULL
          ELSE p_start_date
        END,
        'kind', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'known'
        END,
        'confidence', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'confirmed'
        END
      ),
      'endedOn', jsonb_build_object(
        'date', CASE
          WHEN p_lease_status IN ('ended', 'terminated') THEN p_end_date
          ELSE NULL
        END,
        'kind', CASE
          WHEN p_lease_status IN ('ended', 'terminated') THEN 'known'
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'open_current'
        END,
        'confidence', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'confirmed'
        END
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', CASE
        WHEN p_lease_status = 'cancelled'
          THEN 'cancelled_before_effective'
        WHEN p_lease_status IN ('ended', 'terminated') THEN 'vacated'
        ELSE 'occupied'
      END,
      'recordSource', 'operator_confirmed',
      'reason', 'tb02_round9',
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
          WHEN p_lease_status = 'cancelled' THEN NULL
          ELSE p_start_date
        END,
        'kind', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'known'
        END,
        'confidence', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'confirmed'
        END
      ),
      'actualMoveOut', jsonb_build_object(
        'date', CASE
          WHEN p_lease_status IN ('ended', 'terminated') THEN p_end_date
          ELSE NULL
        END,
        'kind', CASE
          WHEN p_lease_status IN ('ended', 'terminated') THEN 'known'
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'open_current'
        END,
        'confidence', CASE
          WHEN p_lease_status = 'cancelled' THEN 'unknown'
          ELSE 'confirmed'
        END
      )
    ),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', p_person_id,
        'lifecycle', CASE
          WHEN p_lease_status = 'cancelled'
            THEN 'cancelled_before_effective'
          WHEN p_lease_status IN ('ended', 'terminated') THEN 'ended'
          ELSE 'present'
        END,
        'recordSource', 'operator_confirmed',
        'reason', 'tb02_round9',
        'startedOn', jsonb_build_object(
          'date', CASE
            WHEN p_lease_status = 'cancelled' THEN NULL
            ELSE p_start_date
          END,
          'kind', CASE
            WHEN p_lease_status = 'cancelled' THEN 'unknown'
            ELSE 'known'
          END,
          'confidence', CASE
            WHEN p_lease_status = 'cancelled' THEN 'unknown'
            ELSE 'confirmed'
          END
        ),
        'endedOn', jsonb_build_object(
          'date', CASE
            WHEN p_lease_status IN ('ended', 'terminated') THEN p_end_date
            ELSE NULL
          END,
          'kind', CASE
            WHEN p_lease_status IN ('ended', 'terminated') THEN 'known'
            WHEN p_lease_status = 'cancelled' THEN 'unknown'
            ELSE 'open_current'
          END,
          'confidence', CASE
            WHEN p_lease_status = 'cancelled' THEN 'unknown'
            ELSE 'confirmed'
          END
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_lease(
  p_unit_id uuid,
  p_person_id uuid,
  p_lease_status text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_end_date date := CASE
    WHEN p_lease_status = 'active' THEN current_date + 330
    WHEN p_lease_status = 'cancelled' THEN current_date + 390
    ELSE current_date - 1
  END;
  v_start_date date := CASE
    WHEN p_lease_status = 'active' THEN current_date - 30
    WHEN p_lease_status = 'cancelled' THEN current_date + 30
    ELSE current_date - 360
  END;
BEGIN
  RETURN public.create_lease_with_relationships(
    'f6000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000003',
    p_unit_id,
    p_person_id,
    v_start_date,
    v_end_date,
    1000,
    'USD',
    5,
    'monthly',
    CASE
      WHEN p_lease_status = 'active' THEN 'active'
      ELSE 'terminated'
    END,
    NULL,
    NULL,
    p_lease_status,
    pg_temp.relationship_payload(
      p_person_id,
      p_lease_status,
      v_start_date,
      v_end_date
    ),
    p_idempotency_key
  );
END;
$$;

CREATE TEMP TABLE round9_state (
  active_result jsonb,
  terminated_result jsonb,
  cancelled_open_party_result jsonb,
  ended_open_participant_result jsonb,
  missing_party_result jsonb,
  cancelled_safe_result jsonb,
  ended_safe_result jsonb,
  direct_safe_result jsonb,
  ended_safe_archived_at timestamptz,
  ended_safe_archived_by uuid
) ON COMMIT DROP;

INSERT INTO round9_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON round9_state TO authenticated;
GRANT SELECT ON round9_state TO service_role;

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
  extensions.crypt('tb02-round9', extensions.gen_salt('bf')),
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
      'f6000000-0000-4000-8000-000000000002'::uuid,
      'tb02-round9-admin'
    ),
    (
      'f6000000-0000-4000-8000-000000000004'::uuid,
      'tb02-round9-replay-admin'
    )
) AS fixture(user_id, label);

INSERT INTO public.organizations(id, name, slug)
VALUES (
  'f6000000-0000-4000-8000-000000000001',
  'TB-02 review round 9',
  'tb02-review-round-9'
);

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
(
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000002',
  'super_admin'
),
(
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000004',
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
  'f6000000-0000-4000-8000-000000000003',
  'f6000000-0000-4000-8000-000000000001',
  'TB-02 round 9 property',
  'TB02-R9',
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
    'f6000000-0000-4000-8000-'
    || lpad(unit_number::text, 12, '0')
  )::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6000000-0000-4000-8000-000000000003'::uuid,
  'TB02-R9-' || unit_number::text,
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
    'f6000000-0000-4000-8000-'
    || lpad(person_number::text, 12, '0')
  )::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'TB-02 round 9 tenant ' || person_number::text,
  'individual'
FROM generate_series(20, 27) AS person_number;

INSERT INTO public.person_roles(
  organization_id,
  person_id,
  role,
  status
)
SELECT
  'f6000000-0000-4000-8000-000000000001'::uuid,
  people.id,
  'tenant',
  'active'
FROM public.people
WHERE organization_id = 'f6000000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  'f6000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

UPDATE round9_state
SET
  active_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000010',
    'f6000000-0000-4000-8000-000000000020',
    'active',
    'tb02-round9-active-create'
  ),
  terminated_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000011',
    'f6000000-0000-4000-8000-000000000021',
    'terminated',
    'tb02-round9-terminated-create'
  ),
  cancelled_open_party_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000012',
    'f6000000-0000-4000-8000-000000000022',
    'cancelled',
    'tb02-round9-cancelled-open-create'
  ),
  ended_open_participant_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000013',
    'f6000000-0000-4000-8000-000000000023',
    'ended',
    'tb02-round9-ended-open-create'
  ),
  missing_party_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000014',
    'f6000000-0000-4000-8000-000000000024',
    'ended',
    'tb02-round9-missing-party-create'
  ),
  cancelled_safe_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000015',
    'f6000000-0000-4000-8000-000000000025',
    'cancelled',
    'tb02-round9-cancelled-safe-create'
  ),
  ended_safe_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000016',
    'f6000000-0000-4000-8000-000000000026',
    'ended',
    'tb02-round9-ended-safe-create'
  ),
  direct_safe_result = pg_temp.create_lease(
    'f6000000-0000-4000-8000-000000000017',
    'f6000000-0000-4000-8000-000000000027',
    'ended',
    'tb02-round9-direct-safe-create'
  );

RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);

UPDATE public.lease_parties
SET business_lifecycle = 'effective'
WHERE id = (
  SELECT (cancelled_open_party_result ->> 'partyId')::uuid
  FROM round9_state
);

UPDATE public.lease_occupancy_participants
SET business_lifecycle = 'present'
WHERE id = (
  SELECT jsonb_array_elements_text(
    ended_open_participant_result -> 'participantIds'
  )::uuid
  FROM round9_state
);

UPDATE public.lease_parties
SET evidence_state = 'voided'
WHERE id = (
  SELECT (missing_party_result ->> 'partyId')::uuid
  FROM round9_state
);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.terminate_authoritative_lease_term(%L,%L,%L,current_date,%L)',
        'f6000000-0000-4000-8000-000000000001',
        active_result ->> 'leaseId',
        (
          SELECT terms.id
          FROM public.lease_terms AS terms
          WHERE terms.lease_id = (active_result ->> 'leaseId')::uuid
            AND terms.authority_kind = 'authoritative'
            AND terms.status = 'active'
        ),
        'tb02-round9-active-terminate'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'relationship_transition_required',
  'active Lease termination stays fail-closed until TB-03'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.terminate_authoritative_lease_term(%L,%L,%L,current_date - 1,%L)',
        'f6000000-0000-4000-8000-000000000001',
        terminated_result ->> 'leaseId',
        (
          SELECT terms.id
          FROM public.lease_terms AS terms
          WHERE terms.lease_id =
            (terminated_result ->> 'leaseId')::uuid
            AND terms.authority_kind = 'authoritative'
            AND terms.status = 'terminated'
        ),
        'tb02-round9-terminal-terminate'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'relationship_transition_required',
  'even exact terminal evidence cannot bypass the missing TB-03 impact contract'
);

RESET ROLE;

SELECT is(
  (
    SELECT jsonb_build_object(
      'leaseStatus', leases.status,
      'activeTerms', count(DISTINCT terms.id)
        FILTER (WHERE terms.status = 'active'),
      'terminatedTerms', count(DISTINCT terms.id)
        FILTER (WHERE terms.status = 'terminated'),
      'partyLifecycle', min(parties.business_lifecycle),
      'occupancyLifecycle', min(occupancies.business_lifecycle),
      'participantLifecycle', min(participants.business_lifecycle)
    )
    FROM round9_state AS state
    JOIN public.leases AS leases
      ON leases.id = (state.active_result ->> 'leaseId')::uuid
    JOIN public.lease_terms AS terms
      ON terms.lease_id = leases.id
      AND terms.authority_kind = 'authoritative'
    JOIN public.lease_parties AS parties
      ON parties.lease_id = leases.id
      AND parties.evidence_state = 'accepted'
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.lease_id = leases.id
      AND occupancies.evidence_state = 'accepted'
    JOIN public.lease_occupancy_participants AS participants
      ON participants.lease_occupancy_id = occupancies.id
      AND participants.evidence_state = 'accepted'
    GROUP BY leases.status
  ),
  jsonb_build_object(
    'leaseStatus', 'active',
    'activeTerms', 1,
    'terminatedTerms', 0,
    'partyLifecycle', 'effective',
    'occupancyLifecycle', 'occupied',
    'participantLifecycle', 'present'
  ),
  'rejected termination preserves Lease, term, and relationship state'
);

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = 'f6000000-0000-4000-8000-000000000001'
      AND idempotency_key IN (
        'tb02-round9-active-terminate',
        'tb02-round9-terminal-terminate'
      )
  ),
  0::bigint,
  'rejected termination creates no idempotency artifact'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE organization_id = 'f6000000-0000-4000-8000-000000000001'
      AND entity_type = 'lease_term'
      AND new_values ->> 'leaseId' = (
        SELECT active_result ->> 'leaseId'
        FROM round9_state
      )
      AND new_values ->> 'status' = 'terminated'
  ),
  0::bigint,
  'rejected termination creates no activity artifact'
);

SELECT set_config('app.lease_term_projection_context', 'checked-v1', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET status = %L WHERE id = %L',
        'terminated',
        active_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'occupancy_transition_required',
  'generic term projection context cannot authorize a lifecycle change'
);

SELECT set_config('app.lease_term_projection_context', 'off', true);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        'f6000000-0000-4000-8000-000000000001',
        cancelled_open_party_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'relationship_transition_required',
  'cancelled header cannot hide an open accepted party'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        'f6000000-0000-4000-8000-000000000001',
        ended_open_participant_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'relationship_transition_required',
  'ended header cannot hide an open accepted participant'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        'f6000000-0000-4000-8000-000000000001',
        missing_party_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'relationship_transition_required',
  'archive requires one coherent accepted primary party'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        'f6000000-0000-4000-8000-000000000001',
        active_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'occupancy_transition_required',
  'operationally active Lease still cannot be archived'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'app.lease_archive_context',
  'checked-lease-archive-v1',
  true
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_at = now(), archived_by = %L WHERE id = %L',
        'f6000000-0000-4000-8000-000000000002',
        direct_safe_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'lease_archive_checked_operation_required',
  'caller-set archive context cannot bypass the checked archive RPC'
);

SELECT set_config('app.lease_archive_context', 'off', true);
RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'f6000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.archive_lease(%L,%L)',
    'f6000000-0000-4000-8000-000000000001',
    (SELECT cancelled_safe_result ->> 'leaseId' FROM round9_state)
  ),
  'exact cancelled-before-effective evidence permits archive'
);

SELECT lives_ok(
  format(
    'SELECT public.archive_lease(%L,%L)',
    'f6000000-0000-4000-8000-000000000001',
    (SELECT ended_safe_result ->> 'leaseId' FROM round9_state)
  ),
  'exact ended and vacated evidence permits archive'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      leases.status,
      parties.business_lifecycle,
      occupancies.business_lifecycle,
      participants.business_lifecycle
    FROM round9_state AS state
    JOIN public.leases AS leases
      ON leases.id = (state.cancelled_safe_result ->> 'leaseId')::uuid
    JOIN public.lease_parties AS parties
      ON parties.id = (state.cancelled_safe_result ->> 'partyId')::uuid
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.id =
        (state.cancelled_safe_result ->> 'occupancyId')::uuid
    JOIN public.lease_occupancy_participants AS participants
      ON participants.id = (
        SELECT jsonb_array_elements_text(
          state.cancelled_safe_result -> 'participantIds'
        )::uuid
      )
    WHERE leases.archived_at IS NOT NULL
  $$,
  $$
    VALUES (
      'cancelled'::text,
      'cancelled_before_effective'::text,
      'cancelled_before_effective'::text,
      'cancelled_before_effective'::text
    )
  $$,
  'cancelled archive retains exact auditable relationship evidence'
);

SET LOCAL ROLE authenticated;

UPDATE round9_state AS state
SET
  ended_safe_archived_at = leases.archived_at,
  ended_safe_archived_by = leases.archived_by
FROM public.leases AS leases
WHERE leases.id = (state.ended_safe_result ->> 'leaseId')::uuid;

SELECT set_config(
  'request.jwt.claim.sub',
  'f6000000-0000-4000-8000-000000000004',
  true
);

SELECT is(
  public.archive_lease(
    'f6000000-0000-4000-8000-000000000001',
    (ended_safe_result ->> 'leaseId')::uuid
  ),
  (ended_safe_result ->> 'leaseId')::uuid,
  'already-archived replay returns the existing Lease ID'
)
FROM round9_state;

SELECT is(
  (
    SELECT jsonb_build_object(
      'archivedAt', leases.archived_at,
      'archivedBy', leases.archived_by
    )
    FROM round9_state AS state
    JOIN public.leases AS leases
      ON leases.id = (state.ended_safe_result ->> 'leaseId')::uuid
  ),
  (
    SELECT jsonb_build_object(
      'archivedAt', ended_safe_archived_at,
      'archivedBy', ended_safe_archived_by
    )
    FROM round9_state
  ),
  'archive replay preserves the first timestamp and actor'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_at = archived_at + interval %L WHERE id = %L',
        '1 second',
        ended_safe_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'lease_archive_metadata_immutable',
  'archived timestamp cannot be rewritten after the first archive'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_by = %L WHERE id = %L',
        'f6000000-0000-4000-8000-000000000004',
        ended_safe_result ->> 'leaseId'
      )
    ) ->> 'detail'
    FROM round9_state
  ),
  'lease_archive_metadata_immutable',
  'archived actor cannot be rewritten after the first archive'
);

SELECT lives_ok(
  format(
    'UPDATE public.leases SET archived_at = archived_at, archived_by = archived_by WHERE id = %L',
    (SELECT ended_safe_result ->> 'leaseId' FROM round9_state)
  ),
  'an exact archive metadata no-op remains harmless'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM round9_state AS state
    JOIN public.lease_parties AS parties
      ON parties.lease_id = (state.ended_safe_result ->> 'leaseId')::uuid
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.lease_id = parties.lease_id
    JOIN public.lease_occupancy_participants AS participants
      ON participants.lease_occupancy_id = occupancies.id
  ),
  1::bigint,
  'archive and replay retain party, occupancy, and participant history'
);

SELECT * FROM finish();

ROLLBACK;
