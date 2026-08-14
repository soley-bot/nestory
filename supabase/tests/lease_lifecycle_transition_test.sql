BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(21);

CREATE TEMP TABLE lease_lifecycle_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cotenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cotenant_party_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cotenant_participant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_result jsonb,
  activation_result jsonb,
  notice_result jsonb,
  ending_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_lifecycle_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON lease_lifecycle_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'lease-lifecycle-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('lease-lifecycle', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM lease_lifecycle_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Lease lifecycle organization',
  'lease-lifecycle-' || left(organization_id::text, 8)
FROM lease_lifecycle_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM lease_lifecycle_state;

INSERT INTO public.properties(id, organization_id, name, code, property_type, status)
SELECT property_id, organization_id, 'Lease lifecycle property',
  'LL-' || left(property_id::text, 8), 'apartment', 'active'
FROM lease_lifecycle_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'LL-01', 'vacant', 900, 'USD'
FROM lease_lifecycle_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Lease Lifecycle Tenant', 'individual'
FROM lease_lifecycle_state
UNION ALL
SELECT cotenant_id, organization_id, 'Lease Lifecycle Co-tenant', 'individual'
FROM lease_lifecycle_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM lease_lifecycle_state
UNION ALL
SELECT organization_id, cotenant_id, 'tenant'
FROM lease_lifecycle_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_lifecycle_state),
  true
);

UPDATE lease_lifecycle_state AS state
SET creation_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.unit_id,
  state.tenant_id,
  current_date - 30,
  current_date + 335,
  900,
  'USD',
  1,
  'monthly',
  'draft',
  500,
  'USD',
  'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'draft_lease_created',
      'startedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved',
      'recordSource', 'operator_confirmed',
      'reason', 'draft_lease_created',
      'scheduledMoveIn', jsonb_build_object(
        'date', current_date, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', current_date + 335, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'participants', '[]'::jsonb
  ),
  'lease-lifecycle-create-v1'
);

RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);

INSERT INTO public.lease_parties (
  id, organization_id, lease_id, person_id, party_role, is_primary,
  evidence_state, business_lifecycle, record_source,
  started_on_kind, started_on_confidence, ended_on_kind, ended_on_confidence,
  evidence_reason, evidence_recorded_by, created_by, updated_by
)
SELECT
  cotenant_party_id, organization_id, (creation_result ->> 'leaseId')::uuid,
  cotenant_id, 'co_tenant', false, 'accepted', 'planned',
  'operator_confirmed', 'unknown', 'unknown', 'unknown', 'unknown',
  'draft_cotenant_recorded', admin_id, admin_id, admin_id
FROM lease_lifecycle_state;

INSERT INTO public.lease_occupancy_participants (
  id, organization_id, lease_occupancy_id, lease_party_id,
  evidence_state, business_lifecycle, record_source,
  started_on_kind, started_on_confidence, ended_on_kind, ended_on_confidence,
  evidence_reason, evidence_recorded_by, created_by, updated_by
)
SELECT
  cotenant_participant_id, organization_id,
  (creation_result ->> 'occupancyId')::uuid, cotenant_party_id,
  'accepted', 'planned', 'operator_confirmed',
  'unknown', 'unknown', 'unknown', 'unknown',
  'draft_cotenant_recorded', admin_id, admin_id, admin_id
FROM lease_lifecycle_state;

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SET LOCAL ROLE authenticated;

SELECT has_table(
  'public',
  'lease_lifecycle_events',
  'Lease lifecycle changes have one auditable event stream'
);

SELECT has_function(
  'public',
  'transition_lease_lifecycle',
  ARRAY[
    'uuid', 'uuid', 'text', 'uuid', 'text', 'date', 'date', 'text', 'text'
  ],
  'Lease lifecycle changes use one checked command'
);

UPDATE lease_lifecycle_state AS state
SET activation_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  'draft',
  (state.creation_result ->> 'occupancyId')::uuid,
  'activate',
  current_date,
  NULL,
  'Keys received and resident confirmed in person',
  'lease-lifecycle-activate-v1'
);

SELECT is(
  (
    SELECT status
    FROM public.leases
    WHERE id = (SELECT (creation_result ->> 'leaseId')::uuid FROM lease_lifecycle_state)
  ),
  'active',
  'activation advances the Lease header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS old_occupancy
    JOIN lease_lifecycle_state AS state
      ON old_occupancy.id = (state.creation_result ->> 'occupancyId')::uuid
    WHERE old_occupancy.evidence_state = 'superseded'
      AND old_occupancy.superseded_by_lease_occupancy_id =
        (state.activation_result ->> 'occupancyId')::uuid
  ),
  'activation supersedes rather than rewrites occupancy evidence'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN lease_lifecycle_state AS state
      ON occupancy.id = (state.activation_result ->> 'occupancyId')::uuid
    WHERE occupancy.evidence_state = 'accepted'
      AND occupancy.business_lifecycle = 'occupied'
      AND occupancy.actual_move_in_date = current_date
      AND occupancy.actual_move_out_kind = 'open_current'
  ),
  'activation records confirmed current occupancy'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participant
    JOIN lease_lifecycle_state AS state
      ON participant.lease_occupancy_id =
        (state.activation_result ->> 'occupancyId')::uuid
    WHERE participant.evidence_state = 'accepted'
      AND participant.business_lifecycle = 'present'
      AND participant.started_on = current_date
      AND participant.ended_on_kind = 'open_current'
  ),
  'activation records the primary resident without inferring it from term dates'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participant
    JOIN public.lease_parties AS party
      ON party.organization_id = participant.organization_id
      AND party.id = participant.lease_party_id
    JOIN lease_lifecycle_state AS state
      ON participant.lease_occupancy_id =
        (state.activation_result ->> 'occupancyId')::uuid
    WHERE participant.evidence_state = 'accepted'
      AND party.evidence_state <> 'accepted'
  ),
  'every activated resident points to their accepted successor Lease party'
);

SELECT is(
  (
    SELECT status
    FROM public.lease_terms
    WHERE id = (
      SELECT (activation_result ->> 'termId')::uuid
      FROM lease_lifecycle_state
    )
  ),
  'active',
  'activation advances the authoritative term'
);

SELECT is(
  public.transition_lease_lifecycle(
    organization_id,
    (creation_result ->> 'leaseId')::uuid,
    'draft',
    (creation_result ->> 'occupancyId')::uuid,
    'activate',
    current_date,
    NULL,
    'Keys received and resident confirmed in person',
    'lease-lifecycle-activate-v1'
  ),
  activation_result,
  'an exact activation retry returns the recorded transition'
)
FROM lease_lifecycle_state;

UPDATE lease_lifecycle_state AS state
SET notice_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  'active',
  (state.activation_result ->> 'occupancyId')::uuid,
  'give_notice',
  current_date + 10,
  current_date + 40,
  'Tenant notice received and move-out date confirmed',
  'lease-lifecycle-notice-v1'
);

SELECT is(
  (
    SELECT status
    FROM public.leases
    WHERE id = (SELECT (creation_result ->> 'leaseId')::uuid FROM lease_lifecycle_state)
  ),
  'notice_given',
  'notice advances the Lease header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN lease_lifecycle_state AS state
      ON occupancy.id = (state.notice_result ->> 'occupancyId')::uuid
    WHERE occupancy.business_lifecycle = 'notice_given'
      AND occupancy.notice_date = current_date + 10
      AND occupancy.notice_kind = 'known'
      AND occupancy.scheduled_move_out_date = current_date + 40
      AND occupancy.scheduled_move_out_kind = 'known'
      AND occupancy.actual_move_out_kind = 'open_current'
  ),
  'notice appends explicit notice and planned move-out evidence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties AS party
    JOIN lease_lifecycle_state AS state
      ON party.lease_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE party.evidence_state = 'accepted'
      AND party.business_lifecycle = 'effective'
  ),
  2,
  'notice keeps the active tenant relationship open'
);

UPDATE lease_lifecycle_state AS state
SET ending_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  'notice_given',
  (state.notice_result ->> 'occupancyId')::uuid,
  'end',
  current_date + 40,
  NULL,
  'Move-out inspection completed and keys returned',
  'lease-lifecycle-end-v1'
);

SELECT is(
  (
    SELECT status
    FROM public.leases
    WHERE id = (SELECT (creation_result ->> 'leaseId')::uuid FROM lease_lifecycle_state)
  ),
  'ended',
  'ending advances the Lease header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN lease_lifecycle_state AS state
      ON occupancy.id = (state.ending_result ->> 'occupancyId')::uuid
    WHERE occupancy.business_lifecycle = 'vacated'
      AND occupancy.actual_move_out_date = current_date + 40
      AND occupancy.actual_move_out_kind = 'known'
  ),
  'ending appends confirmed move-out evidence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_parties AS party
    JOIN lease_lifecycle_state AS state
      ON party.lease_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE party.evidence_state = 'accepted'
      AND party.business_lifecycle = 'ended'
      AND party.ended_on = current_date + 40
  ),
  2,
  'ending closes the accepted Lease party relationship'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_occupancy_participants AS participant
    JOIN lease_lifecycle_state AS state
      ON participant.lease_occupancy_id =
        (state.ending_result ->> 'occupancyId')::uuid
    WHERE participant.evidence_state = 'accepted'
      AND participant.business_lifecycle = 'ended'
      AND participant.ended_on = current_date + 40
  ),
  2,
  'ending closes the accepted resident relationship'
);

SELECT is(
  (
    SELECT status
    FROM public.lease_terms
    WHERE id = (
      SELECT (ending_result ->> 'termId')::uuid
      FROM lease_lifecycle_state
    )
  ),
  'terminated',
  'ending advances the authoritative term without rewriting it'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_lifecycle_events AS event
    JOIN lease_lifecycle_state AS state
      ON event.lease_id = (state.creation_result ->> 'leaseId')::uuid
  ),
  3,
  'activation, notice, and ending each create one lifecycle event'
);

SELECT lives_ok(
  format(
    'SELECT public.archive_lease(%L, %L)',
    (SELECT organization_id FROM lease_lifecycle_state),
    (SELECT creation_result ->> 'leaseId' FROM lease_lifecycle_state)
  ),
  'a Lease can be archived after checked closure'
);

RESET ROLE;

SELECT table_privs_are(
  'public',
  'lease_lifecycle_events',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers cannot bypass lifecycle commands'
);

SELECT function_privs_are(
  'public',
  'transition_lease_lifecycle',
  ARRAY[
    'uuid', 'uuid', 'text', 'uuid', 'text', 'date', 'date', 'text', 'text'
  ],
  'anon',
  ARRAY[]::text[],
  'anonymous callers cannot transition Lease lifecycle'
);

SELECT * FROM finish();
ROLLBACK;
