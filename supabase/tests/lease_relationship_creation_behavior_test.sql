BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(35);

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

CREATE TEMP TABLE lease_relationship_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  planned_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  no_participant_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cancelled_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  second_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_row_id uuid NOT NULL DEFAULT gen_random_uuid(),
  planned_result jsonb,
  no_participant_result jsonb,
  cancelled_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_relationship_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON lease_relationship_state
TO authenticated, service_role;

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
  fixture.label || '-' || left(fixture.user_id::text, 8) || '@example.test',
  extensions.crypt('lease-history-lease-relationship', extensions.gen_salt('bf')),
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
FROM lease_relationship_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.admin_id, 'lease-relationship-admin'),
    (state.manager_id, 'lease-relationship-manager'),
    (state.member_id, 'lease-relationship-member'),
    (state.cross_admin_id, 'lease-relationship-cross-admin')
) AS fixture(user_id, label);

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Lease relationship relationship organization',
  'lease-relationship-' || left(organization_id::text, 8)
FROM lease_relationship_state
UNION ALL
SELECT
  cross_organization_id,
  'Lease relationship cross organization',
  'lease-relationship-cross-' || left(cross_organization_id::text, 8)
FROM lease_relationship_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM lease_relationship_state
UNION ALL
SELECT organization_id, manager_id, 'finance_manager'
FROM lease_relationship_state
UNION ALL
SELECT organization_id, member_id, 'finance_member'
FROM lease_relationship_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'super_admin'
FROM lease_relationship_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Lease relationship property',
  'LEASE-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM lease_relationship_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Lease relationship cross property',
  'LEASE-X-' || left(cross_property_id::text, 8),
  'apartment',
  'active'
FROM lease_relationship_state;

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
  fixture.unit_id,
  state.organization_id,
  state.property_id,
  fixture.unit_number,
  'vacant',
  1000,
  'USD'
FROM lease_relationship_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.planned_unit_id, 'LEASE-01'),
    (state.no_participant_unit_id, 'LEASE-02'),
    (state.cancelled_unit_id, 'LEASE-03'),
    (state.company_unit_id, 'LEASE-04'),
    (state.import_unit_id, 'LEASE-05')
) AS fixture(unit_id, unit_number);

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
  cross_unit_id,
  cross_organization_id,
  cross_property_id,
  'LEASE-X-01',
  'vacant',
  1000,
  'USD'
FROM lease_relationship_state;

INSERT INTO public.people(
  id, organization_id, display_name, party_type
)
SELECT
  fixture.person_id,
  fixture.organization_id,
  fixture.display_name,
  fixture.party_type
FROM lease_relationship_state AS state
CROSS JOIN LATERAL (
  VALUES
    (
      state.tenant_id,
      state.organization_id,
      'Lease relationship tenant',
      'individual'
    ),
    (
      state.second_tenant_id,
      state.organization_id,
      'Lease relationship second tenant',
      'individual'
    ),
    (
      state.company_id,
      state.organization_id,
      'Lease relationship company tenant',
      'company'
    ),
    (
      state.cross_tenant_id,
      state.cross_organization_id,
      'Lease relationship cross tenant',
      'individual'
    )
) AS fixture(person_id, organization_id, display_name, party_type);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT
  fixture.organization_id,
  fixture.person_id,
  'tenant'
FROM lease_relationship_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.organization_id, state.tenant_id),
    (state.organization_id, state.second_tenant_id),
    (state.organization_id, state.company_id),
    (state.cross_organization_id, state.cross_tenant_id)
) AS fixture(organization_id, person_id);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_relationship_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE lease_relationship_state AS state
SET planned_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.planned_unit_id,
  state.tenant_id,
  DATE '2027-01-01',
  DATE '2027-12-31',
  1000,
  'USD',
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'signed_future_lease',
      'startedOn', jsonb_build_object(
        'date', '2027-01-10',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'endedOn', jsonb_build_object(
        'date', '2027-12-20',
        'kind', 'known',
        'confidence', 'confirmed'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved',
      'recordSource', 'operator_confirmed',
      'reason', 'scheduled_move',
      'scheduledMoveIn', jsonb_build_object(
        'date', '2027-01-11',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', '2027-12-19',
        'kind', 'known',
        'confidence', 'confirmed'
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
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', state.tenant_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'planned_residence',
        'startedOn', jsonb_build_object(
          'date', '2027-01-11',
          'kind', 'known',
          'confidence', 'confirmed'
        ),
        'endedOn', jsonb_build_object(
          'date', '2027-12-19',
          'kind', 'known',
          'confidence', 'confirmed'
        )
      )
    )
  ),
  'lease-relationship-planned-create'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties AS parties
    WHERE parties.lease_id =
      (SELECT (planned_result ->> 'leaseId')::uuid
       FROM lease_relationship_state)
      AND parties.party_role = 'primary_tenant'
      AND parties.evidence_state = 'accepted'
  ),
  1,
  'checked creation returns exactly one accepted primary party'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT (planned_result ->> 'leaseId')::uuid
       FROM lease_relationship_state)
      AND occupancies.evidence_state = 'accepted'
  ),
  1,
  'checked creation returns exactly one accepted occupancy'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participants
    WHERE participants.lease_occupancy_id =
      (SELECT (planned_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  1,
  'explicit planned Person participation is created once'
);
SELECT is(
  (
    SELECT parties.started_on
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT (planned_result ->> 'partyId')::uuid
       FROM lease_relationship_state)
  ),
  DATE '2027-01-10',
  'term start does not silently confirm the party boundary'
);
SELECT is(
  (
    SELECT occupancies.scheduled_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT (planned_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  DATE '2027-01-11',
  'scheduled occupancy remains its own explicit fact'
);
SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT (planned_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  NULL::date,
  'omitted actual move-in stays NULL'
);
SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT (planned_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  NULL::date,
  'omitted actual move-out stays NULL'
);
SELECT is(
  (
    SELECT participants.business_lifecycle
    FROM public.lease_occupancy_participants AS participants
    WHERE participants.id =
      (
        SELECT jsonb_array_elements_text(
          planned_result -> 'participantIds'
        )::uuid
        FROM lease_relationship_state
      )
  ),
  'planned',
  'planned participation is not promoted to physical residence'
);
SELECT ok(
  (
    SELECT bool_and(
      activity.entity_id IN (
        (state.planned_result ->> 'partyId')::uuid,
        (state.planned_result ->> 'occupancyId')::uuid,
        (
          SELECT jsonb_array_elements_text(
            state.planned_result -> 'participantIds'
          )::uuid
        )
      )
    )
    FROM lease_relationship_state AS state
    JOIN public.activity_logs AS activity
      ON activity.organization_id = state.organization_id
      AND activity.action IN (
        'lease_party_created',
        'lease_occupancy_created',
        'lease_occupancy_participant_created'
      )
  ),
  'relationship creation logs exact normalized entity IDs'
);

SELECT is(
  public.create_lease_with_relationships(
    state.organization_id,
    state.property_id,
    state.planned_unit_id,
    state.tenant_id,
    DATE '2027-01-01',
    DATE '2027-12-31',
    1000,
    'USD',
    5,
    'monthly',
    'upcoming',
    NULL,
    NULL,
    'draft',
    jsonb_build_object(
      'primaryParty', jsonb_build_object(
        'personId', state.tenant_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'signed_future_lease',
        'startedOn', jsonb_build_object(
          'date', '2027-01-10',
          'kind', 'known',
          'confidence', 'confirmed'
        ),
        'endedOn', jsonb_build_object(
          'date', '2027-12-20',
          'kind', 'known',
          'confidence', 'confirmed'
        )
      ),
      'occupancy', jsonb_build_object(
        'lifecycle', 'reserved',
        'recordSource', 'operator_confirmed',
        'reason', 'scheduled_move',
        'scheduledMoveIn', jsonb_build_object(
          'date', '2027-01-11',
          'kind', 'known',
          'confidence', 'confirmed'
        ),
        'scheduledMoveOut', jsonb_build_object(
          'date', '2027-12-19',
          'kind', 'known',
          'confidence', 'confirmed'
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
      'participants', jsonb_build_array(
        jsonb_build_object(
          'personId', state.tenant_id,
          'lifecycle', 'planned',
          'recordSource', 'operator_confirmed',
          'reason', 'planned_residence',
          'startedOn', jsonb_build_object(
            'date', '2027-01-11',
            'kind', 'known',
            'confidence', 'confirmed'
          ),
          'endedOn', jsonb_build_object(
            'date', '2027-12-19',
            'kind', 'known',
            'confidence', 'confirmed'
          )
        )
      )
    ),
    'lease-relationship-planned-create'
  ),
  state.planned_result,
  'same-payload retry returns the exact relationship IDs'
)
FROM lease_relationship_state AS state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties
    WHERE lease_id =
      (SELECT (planned_result ->> 'leaseId')::uuid
       FROM lease_relationship_state)
  ),
  1,
  'same-payload retry does not duplicate the primary party'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancies
    WHERE lease_id =
      (SELECT (planned_result ->> 'leaseId')::uuid
       FROM lease_relationship_state)
  ),
  1,
  'same-payload retry does not duplicate the occupancy'
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,5,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
        organization_id,
        property_id,
        planned_unit_id,
        tenant_id,
        '2027-01-01',
        '2027-12-31',
        'USD',
        'monthly',
        'upcoming',
        'draft',
        jsonb_build_object(
          'primaryParty', jsonb_build_object(
            'personId', tenant_id,
            'lifecycle', 'planned',
            'recordSource', 'operator_confirmed',
            'reason', 'signed_future_lease',
            'startedOn', jsonb_build_object(
              'date', '2027-01-10',
              'kind', 'known',
              'confidence', 'confirmed'
            ),
            'endedOn', jsonb_build_object(
              'date', '2027-12-20',
              'kind', 'known',
              'confidence', 'confirmed'
            )
          ),
          'occupancy', jsonb_build_object(
            'lifecycle', 'reserved',
            'recordSource', 'operator_confirmed',
            'reason', 'different_payload',
            'scheduledMoveIn', jsonb_build_object(
              'date', '2027-02-01',
              'kind', 'known',
              'confidence', 'confirmed'
            ),
            'scheduledMoveOut', jsonb_build_object(
              'date', '2027-12-19',
              'kind', 'known',
              'confidence', 'confirmed'
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
        ),
        'lease-relationship-planned-create'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '22023',
  'same key with a different relationship payload is rejected'
);

UPDATE lease_relationship_state AS state
SET no_participant_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.no_participant_unit_id,
  state.second_tenant_id,
  DATE '2028-01-01',
  DATE '2028-12-31',
  1100,
  'USD',
  5,
  'monthly',
  'upcoming',
  NULL,
  NULL,
  'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.second_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'party_only',
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
      'reason', 'occupancy_only',
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
  ),
  'lease-relationship-no-participant'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participants
    WHERE participants.lease_occupancy_id =
      (SELECT (no_participant_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  0,
  'party role plus Lease occupancy does not prove Person residence'
);

RESET ROLE;
SELECT set_config(
  'app.atomic_import_write_context',
  jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', organization_id,
    'sourceClaimHash', encode(extensions.digest(import_run_id::text, 'sha256'), 'hex'),
    'runId', import_run_id
  )::text,
  true
)
FROM lease_relationship_state;

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
SELECT
  import_run_id,
  organization_id,
  'leases',
  'staged',
  'lease-relationship-explicit-lease.csv',
  1,
  1,
  encode(extensions.digest(import_run_id::text, 'sha256'), 'hex'),
  encode(extensions.digest('snapshot:' || import_run_id::text, 'sha256'), 'hex'),
  admin_id,
  admin_id
FROM lease_relationship_state;

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
SELECT
  import_row_id,
  import_run_id,
  organization_id,
  1,
  'ready',
  'Create Lease',
  '{"source":"lease-relationship"}'::jsonb,
  jsonb_build_object(
    'propertyId', property_id,
    'unitId', import_unit_id,
    'tenantPersonId', tenant_id,
    'leaseStartDate', '2033-01-01',
    'leaseEndDate', '2033-12-31',
    'monthlyRentAmount', '1300',
    'rentDueDay', '5',
    'paymentFrequency', 'monthly',
    'termStatus', 'upcoming',
    'depositAmount', '',
    'status', 'draft'
  )
FROM lease_relationship_state;

SELECT set_config('app.atomic_import_write_context', '', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    import_run_id,
    organization_id
  ),
  'checked Lease import consumes the normalized relationship composition'
)
FROM lease_relationship_state;

SELECT is(
  (
    SELECT rows.row_status
    FROM public.import_rows AS rows
    WHERE rows.id =
      (SELECT import_row_id FROM lease_relationship_state)
  ),
  'committed',
  'checked Lease import commits the normalized row'
);
SELECT ok(
  (
    SELECT rows.result_lease_id IS NOT NULL
      AND rows.result_lease_party_id IS NOT NULL
      AND rows.result_lease_occupancy_id IS NOT NULL
    FROM public.import_rows AS rows
    WHERE rows.id =
      (SELECT import_row_id FROM lease_relationship_state)
  ),
  'checked Lease import returns exact Lease, party, and occupancy IDs'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties AS parties
    WHERE parties.id = (
      SELECT rows.result_lease_party_id
      FROM public.import_rows AS rows
      WHERE rows.id =
        (SELECT import_row_id FROM lease_relationship_state)
    )
      AND parties.evidence_state = 'accepted'
      AND parties.record_source = 'imported_explicit'
      AND parties.source_import_row_id =
        (SELECT import_row_id FROM lease_relationship_state)
  ),
  1,
  'checked Lease import creates one payload-bound accepted primary party'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id = (
      SELECT rows.result_lease_occupancy_id
      FROM public.import_rows AS rows
      WHERE rows.id =
        (SELECT import_row_id FROM lease_relationship_state)
    )
      AND occupancies.evidence_state = 'accepted'
      AND occupancies.record_source = 'imported_explicit'
      AND occupancies.source_import_row_id =
        (SELECT import_row_id FROM lease_relationship_state)
      AND occupancies.actual_move_in_date IS NULL
      AND occupancies.actual_move_out_date IS NULL
  ),
  1,
  'checked Lease import creates one occupancy without invented actual dates'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participants
    WHERE participants.lease_occupancy_id = (
      SELECT rows.result_lease_occupancy_id
      FROM public.import_rows AS rows
      WHERE rows.id =
        (SELECT import_row_id FROM lease_relationship_state)
    )
  ),
  0,
  'Lease import does not infer participant presence from party and occupancy'
);

UPDATE lease_relationship_state AS state
SET cancelled_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.cancelled_unit_id,
  state.tenant_id,
  DATE '2029-01-01',
  DATE '2029-12-31',
  1200,
  'USD',
  5,
  'monthly',
  'expired',
  NULL,
  NULL,
  'cancelled',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.tenant_id,
      'lifecycle', 'cancelled_before_effective',
      'recordSource', 'operator_confirmed',
      'reason', 'cancelled_before_start',
      'startedOn', jsonb_build_object(
        'date', '2029-01-01',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL,
        'kind', 'unknown',
        'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'cancelled_before_effective',
      'recordSource', 'operator_confirmed',
      'reason', 'cancelled_before_move_in',
      'scheduledMoveIn', jsonb_build_object(
        'date', '2029-01-02',
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', '2029-12-30',
        'kind', 'known',
        'confidence', 'confirmed'
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
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', state.tenant_id,
        'lifecycle', 'cancelled_before_effective',
        'recordSource', 'operator_confirmed',
        'reason', 'cancelled_before_residence',
        'startedOn', jsonb_build_object(
          'date', '2029-01-02',
          'kind', 'known',
          'confidence', 'confirmed'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        )
      )
    )
  ),
  'lease-relationship-cancelled-create'
);

SELECT is(
  (
    SELECT parties.effective_range
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT (cancelled_result ->> 'partyId')::uuid
       FROM lease_relationship_state)
  ),
  NULL::daterange,
  'cancelled-before-effective party does not count as responsibility'
);
SELECT is(
  (
    SELECT participants.effective_range
    FROM public.lease_occupancy_participants AS participants
    WHERE participants.id =
      (
        SELECT jsonb_array_elements_text(
          cancelled_result -> 'participantIds'
        )::uuid
        FROM lease_relationship_state
      )
  ),
  NULL::daterange,
  'cancelled-before-effective participant does not count as residence'
);
SELECT ok(
  (
    SELECT occupancies.actual_move_in_date IS NULL
      AND occupancies.actual_move_out_date IS NULL
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT (cancelled_result ->> 'occupancyId')::uuid
       FROM lease_relationship_state)
  ),
  'cancelled reservation has no confirmed actual occupancy'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,5,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
        organization_id,
        property_id,
        company_unit_id,
        company_id,
        '2030-01-01',
        '2030-12-31',
        'USD',
        'monthly',
        'upcoming',
        'draft',
        jsonb_build_object(
          'primaryParty', jsonb_build_object(
            'personId', company_id,
            'lifecycle', 'planned',
            'recordSource', 'operator_confirmed',
            'reason', 'company_tenant',
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
            'reason', 'company_tenant',
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
          'participants', jsonb_build_array(
            jsonb_build_object(
              'personId', company_id,
              'lifecycle', 'planned',
              'recordSource', 'operator_confirmed',
              'reason', 'company_residence',
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
        ),
        'lease-relationship-company-participant'
      )
    ) ->> 'detail'
    FROM lease_relationship_state
  ),
  'occupancy_participant_individual_required',
  'a company cannot be an occupancy participant'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,5,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
        organization_id,
        property_id,
        cross_unit_id,
        tenant_id,
        '2031-01-01',
        '2031-12-31',
        'USD',
        'monthly',
        'upcoming',
        'draft',
        jsonb_build_object(
          'primaryParty', jsonb_build_object(
            'personId', tenant_id,
            'lifecycle', 'planned',
            'recordSource', 'operator_confirmed',
            'reason', 'cross_org',
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
            'reason', 'cross_org',
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
        ),
        'lease-relationship-cross-org'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '23503',
  'checked creation rejects cross-organization Unit links'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM lease_relationship_state),
  true
);
SELECT ok(
  app_private.can_configure_leases(
    (SELECT organization_id FROM lease_relationship_state)
  ),
  'Finance Manager receives checked Lease configuration authority'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM lease_relationship_state),
  true
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,5,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
        organization_id,
        property_id,
        import_unit_id,
        tenant_id,
        '2032-01-01',
        '2032-12-31',
        'USD',
        'monthly',
        'upcoming',
        'draft',
        '{}'::jsonb,
        'lease-relationship-member'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'member cannot create normalized Lease relationships'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM lease_relationship_state),
  true
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,5,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
        organization_id,
        property_id,
        import_unit_id,
        tenant_id,
        '2032-01-01',
        '2032-12-31',
        'USD',
        'monthly',
        'upcoming',
        'draft',
        '{}'::jsonb,
        'lease-relationship-cross-admin'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'an admin from another organization cannot use the target scope'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_relationship_state),
  true
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_parties SET evidence_reason = %L WHERE id = %L',
        'direct bypass',
        (planned_result ->> 'partyId')::uuid
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'direct authenticated Lease-party DML remains denied'
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancies SET evidence_reason = %L WHERE id = %L',
        'direct bypass',
        (planned_result ->> 'occupancyId')::uuid
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'direct authenticated Lease-occupancy DML remains denied'
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancy_participants SET evidence_reason = %L WHERE lease_occupancy_id = %L',
        'direct bypass',
        (planned_result ->> 'occupancyId')::uuid
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'direct authenticated participant DML is denied'
);

RESET ROLE;

SELECT set_config('app.lease_history_write_context', 'checked-lease-create-v2', true);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary,started_on,ended_on,evidence_state,business_lifecycle,record_source,started_on_kind,started_on_confidence,ended_on_kind,ended_on_confidence,evidence_recorded_at,evidence_reason) VALUES (%L,%L,%L,%L,true,DATE %L,DATE %L,%L,%L,%L,%L,%L,%L,%L,now(),%L)',
        organization_id,
        (planned_result ->> 'leaseId')::uuid,
        second_tenant_id,
        'primary_tenant',
        '2027-06-01',
        '2027-08-01',
        'accepted',
        'effective',
        'operator_confirmed',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'overlap test'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '23P01',
  'accepted overlapping primary-party intervals are rejected'
);
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary,started_on,ended_on,evidence_state,business_lifecycle,record_source,started_on_kind,started_on_confidence,ended_on_kind,ended_on_confidence,evidence_recorded_at,evidence_reason) VALUES (%L,%L,%L,%L,false,DATE %L,DATE %L,%L,%L,%L,%L,%L,%L,%L,now(),%L)',
        organization_id,
        (planned_result ->> 'leaseId')::uuid,
        tenant_id,
        'primary_tenant',
        '2027-06-01',
        '2027-08-01',
        'accepted',
        'effective',
        'operator_confirmed',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'same Person-role overlap test'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '23P01',
  'accepted overlapping Person-role intervals are rejected'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_occupancies(organization_id,lease_id,property_id,unit_id,status,actual_move_in_date,actual_move_out_date,evidence_state,business_lifecycle,record_source,scheduled_move_in_kind,scheduled_move_in_confidence,scheduled_move_out_kind,scheduled_move_out_confidence,actual_move_in_kind,actual_move_in_confidence,actual_move_out_kind,actual_move_out_confidence,evidence_recorded_at,evidence_reason) VALUES (%L,%L,%L,%L,%L,DATE %L,DATE %L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,now(),%L)',
        organization_id,
        (planned_result ->> 'leaseId')::uuid,
        property_id,
        planned_unit_id,
        'vacated',
        '2027-06-01',
        '2027-06-30',
        'accepted',
        'vacated',
        'operator_confirmed',
        'unknown',
        'unknown',
        'unknown',
        'unknown',
        'known',
        'confirmed',
        'known',
        'confirmed',
        'actual overlap test'
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '23P01',
  'accepted actual occupancy cannot overlap an accepted reservation'
);

SELECT set_config('app.lease_history_write_context', 'off', true);

SET LOCAL ROLE service_role;
SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancy_participants SET evidence_reason = %L WHERE lease_occupancy_id = %L',
        'service role bypass',
        (planned_result ->> 'occupancyId')::uuid
      )
    ) ->> 'sqlstate'
    FROM lease_relationship_state
  ),
  '42501',
  'service role cannot bypass participant mutation'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
