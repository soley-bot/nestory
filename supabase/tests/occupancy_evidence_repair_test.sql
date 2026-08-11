BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(13);

CREATE TEMP TABLE occupancy_repair_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_result jsonb,
  repair_result uuid
) ON COMMIT DROP;

INSERT INTO occupancy_repair_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON occupancy_repair_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'occupancy-repair-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('occupancy-repair', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM occupancy_repair_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Occupancy repair organization',
  'occupancy-repair-' || left(organization_id::text, 8)
FROM occupancy_repair_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM occupancy_repair_state;

INSERT INTO public.properties(id, organization_id, name, code, property_type, status)
SELECT property_id, organization_id, 'Occupancy repair property',
  'OR-' || left(property_id::text, 8), 'apartment', 'active'
FROM occupancy_repair_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'OR-01', 'vacant', 900, 'USD'
FROM occupancy_repair_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Occupancy Repair Tenant', 'individual'
FROM occupancy_repair_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM occupancy_repair_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM occupancy_repair_state),
  true
);

UPDATE occupancy_repair_state AS state
SET creation_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.unit_id,
  state.tenant_id,
  DATE '2026-05-01',
  DATE '2027-04-30',
  900,
  'USD',
  1,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.tenant_id,
      'lifecycle', 'effective',
      'recordSource', 'operator_confirmed',
      'reason', 'lease_created',
      'startedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'endedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'occupied',
      'recordSource', 'operator_confirmed',
      'reason', 'occupancy_unknown_at_creation',
      'scheduledMoveIn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'scheduledMoveOut', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'actualMoveIn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'actualMoveOut', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ),
    'participants', '[]'::jsonb
  ),
  'occupancy-repair-create-v1'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participant
    WHERE participant.lease_occupancy_id =
      (SELECT (creation_result ->> 'occupancyId')::uuid FROM occupancy_repair_state)
  ),
  0,
  'creation keeps unknown residence free of invented participant evidence'
);

SELECT is(
  (
    SELECT (item ->> 'ready')::boolean
    FROM occupancy_repair_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      public.get_ips_setup_readiness(
        state.organization_id,
        state.property_id,
        state.unit_id,
        (state.creation_result ->> 'leaseId')::uuid,
        DATE '2026-08-11'
      ) -> 'items'
    ) AS item
    WHERE item ->> 'code' = 'occupancy'
  ),
  false,
  'unknown occupancy is not physically ready'
);

SELECT is(
  (
    SELECT item ->> 'repairHref'
    FROM occupancy_repair_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      public.get_ips_setup_readiness(
        state.organization_id,
        state.property_id,
        state.unit_id,
        (state.creation_result ->> 'leaseId')::uuid,
        DATE '2026-08-11'
      ) -> 'items'
    ) AS item
    WHERE item ->> 'code' = 'occupancy'
  ),
  (
    SELECT '/leases?leaseId=' || (creation_result ->> 'leaseId') || '#occupancy-evidence'
    FROM occupancy_repair_state
  ),
  'readiness gives the exact lease occupancy repair target'
);

UPDATE occupancy_repair_state AS state
SET repair_result = public.record_current_lease_occupancy_evidence(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  (state.creation_result ->> 'occupancyId')::uuid,
  DATE '2026-05-01',
  DATE '2027-04-30',
  DATE '2026-05-03',
  'Keys received and resident confirmed in person'
);

SELECT isnt(
  repair_result,
  (creation_result ->> 'occupancyId')::uuid,
  'repair appends a successor instead of mutating the original evidence identity'
)
FROM occupancy_repair_state;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS old_occupancy
    JOIN occupancy_repair_state AS state
      ON old_occupancy.id = (state.creation_result ->> 'occupancyId')::uuid
    WHERE old_occupancy.evidence_state = 'superseded'
      AND old_occupancy.superseded_by_lease_occupancy_id = state.repair_result
  ),
  'repair preserves explicit predecessor lineage'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN occupancy_repair_state AS state ON occupancy.id = state.repair_result
    WHERE occupancy.evidence_state = 'accepted'
      AND occupancy.business_lifecycle = 'occupied'
      AND occupancy.actual_move_in_date = DATE '2026-05-03'
      AND occupancy.actual_move_in_kind = 'known'
      AND occupancy.actual_move_in_confidence = 'confirmed'
      AND occupancy.actual_move_out_date IS NULL
      AND occupancy.actual_move_out_kind = 'open_current'
      AND occupancy.actual_move_out_confidence = 'confirmed'
      AND occupancy.scheduled_move_in_date = DATE '2026-05-01'
      AND occupancy.scheduled_move_out_date = DATE '2027-04-30'
      AND occupancy.evidence_reason = 'Keys received and resident confirmed in person'
  ),
  'successor contains only actor-entered scheduled and confirmed current occupancy facts'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participant
    JOIN occupancy_repair_state AS state
      ON participant.lease_occupancy_id = state.repair_result
    JOIN public.lease_parties AS party
      ON party.id = participant.lease_party_id
    WHERE participant.evidence_state = 'accepted'
      AND participant.business_lifecycle = 'present'
      AND participant.started_on = DATE '2026-05-03'
      AND participant.started_on_kind = 'known'
      AND participant.ended_on_kind = 'open_current'
      AND party.person_id = state.tenant_id
      AND party.is_primary
  ),
  'repair records contained resident evidence for the accepted primary tenant'
);

SELECT is(
  (
    SELECT (item ->> 'ready')::boolean
    FROM occupancy_repair_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      public.get_ips_setup_readiness(
        state.organization_id,
        state.property_id,
        state.unit_id,
        (state.creation_result ->> 'leaseId')::uuid,
        DATE '2026-08-11'
      ) -> 'items'
    ) AS item
    WHERE item ->> 'code' = 'occupancy'
  ),
  true,
  'accepted current occupancy plus resident evidence satisfies occupancy readiness'
);

SELECT is(
  public.record_current_lease_occupancy_evidence(
    organization_id,
    (creation_result ->> 'leaseId')::uuid,
    (creation_result ->> 'occupancyId')::uuid,
    DATE '2026-05-01',
    DATE '2027-04-30',
    DATE '2026-05-03',
    'Keys received and resident confirmed in person'
  ),
  repair_result,
  'an exact retry returns the existing successor'
)
FROM occupancy_repair_state;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancies AS occupancy
    JOIN occupancy_repair_state AS state
      ON occupancy.lease_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE occupancy.evidence_state = 'accepted'
  ),
  1,
  'an exact retry leaves exactly one accepted occupancy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participant
    JOIN occupancy_repair_state AS state
      ON participant.lease_occupancy_id = state.repair_result
    WHERE participant.evidence_state = 'accepted'
  ),
  1,
  'an exact retry leaves exactly one accepted resident participant'
);

RESET ROLE;

SELECT ok(
  (
    WITH payload AS (
      SELECT app_private.build_checked_lease_import_relationship_payload(
        gen_random_uuid(),
        jsonb_build_object(
          'status', 'active',
          'tenantPersonId', tenant_id,
          'leaseStartDate', '2026-05-01',
          'leaseEndDate', '2027-04-30'
        )
      ) AS value
      FROM occupancy_repair_state
    )
    SELECT value #>> '{occupancy,scheduledMoveIn,kind}' = 'unknown'
      AND value #>> '{occupancy,actualMoveIn,kind}' = 'unknown'
      AND jsonb_array_length(value -> 'participants') = 0
    FROM payload
  ),
  'Lease import does not infer occupancy or residence from contract term dates'
);

SELECT ok(
  (
    WITH payload AS (
      SELECT app_private.build_checked_lease_import_relationship_payload(
        gen_random_uuid(),
        jsonb_build_object(
          'status', 'active',
          'tenantPersonId', tenant_id,
          'leaseStartDate', '2026-05-01',
          'leaseEndDate', '2027-04-30',
          'scheduledMoveInDate', '2026-05-02',
          'scheduledMoveOutDate', '2027-04-29',
          'actualMoveInDate', '2026-05-03'
        )
      ) AS value
      FROM occupancy_repair_state
    )
    SELECT value #>> '{occupancy,scheduledMoveIn,date}' = '2026-05-02'
      AND value #>> '{occupancy,scheduledMoveOut,date}' = '2027-04-29'
      AND value #>> '{occupancy,actualMoveIn,date}' = '2026-05-03'
      AND value #>> '{occupancy,actualMoveOut,kind}' = 'open_current'
      AND value #>> '{participants,0,startedOn,date}' = '2026-05-03'
    FROM payload
  ),
  'Lease import carries only explicit occupancy evidence into its checked payload'
);

SELECT * FROM finish();
ROLLBACK;
