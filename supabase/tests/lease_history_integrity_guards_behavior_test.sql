BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(75);

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

CREATE TEMP TABLE lease_history_guard_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  checked_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  checked_target_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_target_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  direct_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  direct_target_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  completed_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archive_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  person_archive_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cancelled_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  restore_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_active_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_cancelled_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  replacement_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archive_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unrelated_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cancelled_import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  checked_lease_id uuid,
  legacy_lease_id uuid,
  direct_lease_id uuid,
  completed_lease_id uuid,
  archive_lease_id uuid,
  person_archive_lease_id uuid,
  cancelled_lease_id uuid,
  restore_lease_id uuid,
  restore_conflict_lease_id uuid,
  active_import_lease_id uuid,
  cancelled_import_lease_id uuid,
  checked_party_id uuid,
  checked_occupancy_id uuid,
  legacy_party_id uuid,
  legacy_occupancy_id uuid,
  completed_party_id uuid,
  completed_occupancy_id uuid,
  restore_party_id uuid,
  restore_occupancy_id uuid
) ON COMMIT DROP;

INSERT INTO lease_history_guard_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON lease_history_guard_state
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
  extensions.crypt('lease-history-guard-test', extensions.gen_salt('bf')),
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
FROM lease_history_guard_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.admin_id, 'lease-history-admin'),
    (state.manager_id, 'lease-history-manager'),
    (state.member_id, 'lease-history-member'),
    (state.cross_admin_id, 'lease-history-cross-admin')
) AS fixture(user_id, label);

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Lease history guard organization',
  'lease-history-guard-' || left(organization_id::text, 8)
FROM lease_history_guard_state
UNION ALL
SELECT
  cross_organization_id,
  'Lease history guard cross organization',
  'lease-history-guard-cross-' || left(cross_organization_id::text, 8)
FROM lease_history_guard_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin'
FROM lease_history_guard_state
UNION ALL
SELECT organization_id, manager_id, 'manager'
FROM lease_history_guard_state
UNION ALL
SELECT organization_id, member_id, 'member'
FROM lease_history_guard_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'admin'
FROM lease_history_guard_state;

INSERT INTO public.properties(
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Lease history guard property',
  'LH-GUARD-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM lease_history_guard_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Lease history guard cross property',
  'LH-GUARD-X-' || left(cross_property_id::text, 8),
  'apartment',
  'active'
FROM lease_history_guard_state;

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
  'USD'::public.currency_code
FROM lease_history_guard_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.checked_unit_id, 'LH-01'),
    (state.checked_target_unit_id, 'LH-02'),
    (state.legacy_unit_id, 'LH-03'),
    (state.legacy_target_unit_id, 'LH-04'),
    (state.direct_unit_id, 'LH-05'),
    (state.direct_target_unit_id, 'LH-06'),
    (state.completed_unit_id, 'LH-07'),
    (state.archive_unit_id, 'LH-08'),
    (state.person_archive_unit_id, 'LH-09'),
    (state.cancelled_unit_id, 'LH-10'),
    (state.restore_unit_id, 'LH-11'),
    (state.import_active_unit_id, 'LH-12'),
    (state.import_cancelled_unit_id, 'LH-13')
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
  'LH-X-01',
  'vacant',
  1000,
  'USD'::public.currency_code
FROM lease_history_guard_state;

INSERT INTO public.people(id, organization_id, display_name)
SELECT
  fixture.person_id,
  fixture.organization_id,
  fixture.display_name
FROM lease_history_guard_state AS state
CROSS JOIN LATERAL (
  VALUES
    (
      state.tenant_id,
      state.organization_id,
      'Lease history primary tenant'
    ),
    (
      state.replacement_tenant_id,
      state.organization_id,
      'Lease history replacement tenant'
    ),
    (
      state.archive_person_id,
      state.organization_id,
      'Lease history archive tenant'
    ),
    (
      state.unrelated_person_id,
      state.organization_id,
      'Lease history unrelated person'
    ),
    (
      state.cross_tenant_id,
      state.cross_organization_id,
      'Lease history cross tenant'
    )
) AS fixture(person_id, organization_id, display_name);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT
  fixture.organization_id,
  fixture.person_id,
  'tenant'
FROM lease_history_guard_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.organization_id, state.tenant_id),
    (state.organization_id, state.replacement_tenant_id),
    (state.organization_id, state.archive_person_id),
    (state.cross_organization_id, state.cross_tenant_id)
) AS fixture(organization_id, person_id);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE lease_history_guard_state
SET checked_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  checked_unit_id,
  tenant_id,
  current_date - 30,
  current_date + 330,
  1000,
  'USD',
  5,
  'monthly',
  'active',
  500,
  'USD',
  'active',
  'tb01-checked-create'
);

UPDATE lease_history_guard_state
SET legacy_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  legacy_unit_id,
  tenant_id,
  current_date - 20,
  current_date + 340,
  1000,
  'USD',
  5,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-legacy-create'
);

UPDATE lease_history_guard_state
SET direct_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  direct_unit_id,
  tenant_id,
  current_date - 10,
  current_date + 350,
  1000,
  'USD',
  5,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-direct-create'
);

UPDATE lease_history_guard_state
SET completed_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  completed_unit_id,
  tenant_id,
  current_date - 365,
  current_date - 5,
  1000,
  'USD',
  5,
  'monthly',
  'expired',
  NULL,
  NULL,
  'active',
  'tb01-completed-create'
);

UPDATE lease_history_guard_state
SET archive_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  archive_unit_id,
  tenant_id,
  current_date - 60,
  current_date + 300,
  1000,
  'USD',
  5,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-archive-create'
);

UPDATE lease_history_guard_state
SET person_archive_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  person_archive_unit_id,
  archive_person_id,
  current_date - 40,
  current_date + 320,
  1000,
  'USD',
  5,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-person-archive-create'
);

UPDATE lease_history_guard_state
SET cancelled_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  cancelled_unit_id,
  tenant_id,
  current_date + 30,
  current_date + 390,
  1000,
  'USD',
  5,
  'monthly',
  'expired',
  NULL,
  NULL,
  'cancelled',
  'tb01-cancelled-create'
);

UPDATE lease_history_guard_state
SET restore_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  restore_unit_id,
  tenant_id,
  current_date + 30,
  current_date + 390,
  1000,
  'USD',
  5,
  'monthly',
  'expired',
  NULL,
  NULL,
  'cancelled',
  'tb01-restore-create'
);

UPDATE lease_history_guard_state
SET restore_conflict_lease_id = public.create_lease_with_authoritative_term(
  organization_id,
  property_id,
  restore_unit_id,
  replacement_tenant_id,
  current_date - 5,
  current_date + 355,
  1100,
  'USD',
  6,
  'monthly',
  'active',
  NULL,
  NULL,
  'active',
  'tb01-restore-conflict-create'
);

UPDATE lease_history_guard_state AS state
SET
  checked_party_id = parties.id,
  checked_occupancy_id = occupancies.id
FROM public.lease_parties AS parties
JOIN public.lease_occupancies AS occupancies
  ON occupancies.organization_id = parties.organization_id
  AND occupancies.lease_id = parties.lease_id
WHERE parties.organization_id = state.organization_id
  AND parties.lease_id = state.checked_lease_id
  AND parties.party_role = 'primary_tenant';

UPDATE lease_history_guard_state AS state
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

UPDATE lease_history_guard_state AS state
SET
  completed_party_id = parties.id,
  completed_occupancy_id = occupancies.id
FROM public.lease_parties AS parties
JOIN public.lease_occupancies AS occupancies
  ON occupancies.organization_id = parties.organization_id
  AND occupancies.lease_id = parties.lease_id
WHERE parties.organization_id = state.organization_id
  AND parties.lease_id = state.completed_lease_id
  AND parties.party_role = 'primary_tenant';

UPDATE lease_history_guard_state AS state
SET
  restore_party_id = parties.id,
  restore_occupancy_id = occupancies.id
FROM public.lease_parties AS parties
JOIN public.lease_occupancies AS occupancies
  ON occupancies.organization_id = parties.organization_id
  AND occupancies.lease_id = parties.lease_id
WHERE parties.organization_id = state.organization_id
  AND parties.lease_id = state.restore_lease_id
  AND parties.party_role = 'primary_tenant';

SELECT is(
  (
    SELECT parties.started_on
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT checked_party_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation does not infer a primary-party start boundary'
);

SELECT is(
  (
    SELECT parties.ended_on
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT checked_party_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation does not infer a primary-party end boundary'
);

SELECT is(
  (
    SELECT occupancies.scheduled_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT checked_occupancy_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation does not infer a scheduled move-in from a term date'
);

SELECT is(
  (
    SELECT occupancies.scheduled_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT checked_occupancy_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation does not infer a scheduled move-out from a term date'
);

SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT checked_occupancy_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation leaves actual move-in unknown'
);

SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT checked_occupancy_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'checked creation leaves actual move-out unknown'
);

SELECT is(
  (
    SELECT parties.started_on
    FROM public.lease_parties AS parties
    WHERE parties.lease_id =
      (SELECT cancelled_lease_id FROM lease_history_guard_state)
      AND parties.party_role = 'primary_tenant'
  ),
  NULL::date,
  'cancelled checked creation keeps the party boundary unknown'
);

SELECT is(
  (
    SELECT occupancies.status
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_lease_id FROM lease_history_guard_state)
  ),
  'cancelled',
  'cancelled checked creation records cancelled intent, not a vacancy'
);

SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'cancelled checked creation does not fabricate actual move-in'
);

SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'cancelled checked creation does not fabricate actual move-out'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_parties AS parties
    WHERE parties.lease_id =
      (SELECT checked_lease_id FROM lease_history_guard_state)
      AND parties.party_role = 'primary_tenant'
  ),
  1::bigint,
  'checked creation produces exactly one primary-party fact'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT checked_lease_id FROM lease_history_guard_state)
  ),
  1::bigint,
  'checked creation produces exactly one occupancy fact'
);

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  source_file_name,
  total_rows,
  ready_rows
)
SELECT
  active_import_run_id,
  organization_id,
  'leases',
  'tb01-active-lease-import.csv',
  1,
  1
FROM lease_history_guard_state
UNION ALL
SELECT
  cancelled_import_run_id,
  organization_id,
  'leases',
  'tb01-cancelled-lease-import.csv',
  1,
  1
FROM lease_history_guard_state;

INSERT INTO public.import_rows(
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
SELECT
  active_import_run_id,
  organization_id,
  1,
  'ready',
  'Create',
  jsonb_build_object(
    'propertyId', property_id,
    'unitId', import_active_unit_id,
    'tenantPersonId', tenant_id,
    'leaseStartDate', current_date - 15,
    'leaseEndDate', current_date + 345,
    'monthlyRentAmount', 1000,
    'rentDueDay', 7,
    'paymentFrequency', 'monthly',
    'termStatus', 'active',
    'status', 'active'
  )
FROM lease_history_guard_state
UNION ALL
SELECT
  cancelled_import_run_id,
  organization_id,
  1,
  'ready',
  'Create',
  jsonb_build_object(
    'propertyId', property_id,
    'unitId', import_cancelled_unit_id,
    'tenantPersonId', tenant_id,
    'leaseStartDate', current_date + 45,
    'leaseEndDate', current_date + 405,
    'monthlyRentAmount', 1000,
    'rentDueDay', 7,
    'paymentFrequency', 'monthly',
    'termStatus', 'expired',
    'status', 'cancelled'
  )
FROM lease_history_guard_state;

SELECT lives_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    (SELECT active_import_run_id FROM lease_history_guard_state),
    (SELECT organization_id FROM lease_history_guard_state)
  ),
  'active Lease import still uses the checked Plan 04 workflow'
);

SELECT lives_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    (SELECT cancelled_import_run_id FROM lease_history_guard_state),
    (SELECT organization_id FROM lease_history_guard_state)
  ),
  'cancelled Lease import still uses the checked Plan 04 workflow'
);

UPDATE lease_history_guard_state AS state
SET active_import_lease_id = leases.id
FROM public.leases AS leases
WHERE leases.organization_id = state.organization_id
  AND leases.unit_id = state.import_active_unit_id;

UPDATE lease_history_guard_state AS state
SET cancelled_import_lease_id = leases.id
FROM public.leases AS leases
WHERE leases.organization_id = state.organization_id
  AND leases.unit_id = state.import_cancelled_unit_id;

SELECT is(
  (
    SELECT parties.started_on
    FROM public.lease_parties AS parties
    WHERE parties.lease_id =
      (SELECT active_import_lease_id FROM lease_history_guard_state)
      AND parties.party_role = 'primary_tenant'
  ),
  NULL::date,
  'active Lease import leaves the party boundary unknown'
);

SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT active_import_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'active Lease import leaves actual move-in unknown'
);

SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT active_import_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'active Lease import leaves actual move-out unknown'
);

SELECT is(
  (
    SELECT occupancies.status
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_import_lease_id FROM lease_history_guard_state)
  ),
  'cancelled',
  'cancelled Lease import records cancelled intent'
);

SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_import_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'cancelled Lease import does not fabricate actual move-in'
);

SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.lease_id =
      (SELECT cancelled_import_lease_id FROM lease_history_guard_state)
  ),
  NULL::date,
  'cancelled Lease import does not fabricate actual move-out'
);

SELECT is(
  (
    SELECT terms.authority_kind
    FROM public.lease_terms AS terms
    WHERE terms.lease_id =
      (SELECT active_import_lease_id FROM lease_history_guard_state)
      AND terms.archived_at IS NULL
      AND terms.status <> 'superseded'
  ),
  'authoritative',
  'active Lease import still creates one authoritative Plan 04 term'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.update_lease_with_authoritative_term(%L,%L,%L,%L,%L,current_date - 30,current_date + 330,1000,%L,5,%L,%L,500,%L,%L,%L)',
        checked_lease_id,
        organization_id,
        property_id,
        checked_unit_id,
        replacement_tenant_id,
        'USD',
        'monthly',
        'active',
        'USD',
        'active',
        'tb01-checked-person-replacement'
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'relationship_transition_required',
  'checked primary-person replacement returns the stable relationship code'
);

SELECT is(
  (
    SELECT parties.person_id
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT checked_party_id FROM lease_history_guard_state)
  ),
  (SELECT tenant_id FROM lease_history_guard_state),
  'rejected checked replacement preserves the original party identity'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.update_lease_with_authoritative_term(%L,%L,%L,%L,%L,current_date - 30,current_date + 330,1000,%L,5,%L,%L,500,%L,%L,%L)',
        checked_lease_id,
        organization_id,
        property_id,
        checked_target_unit_id,
        tenant_id,
        'USD',
        'monthly',
        'active',
        'USD',
        'active',
        'tb01-checked-unit-replacement'
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'occupancy_transition_required',
  'checked unit replacement returns the stable occupancy code'
);

SELECT is(
  (
    SELECT occupancies.unit_id
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT checked_occupancy_id FROM lease_history_guard_state)
  ),
  (SELECT checked_unit_id FROM lease_history_guard_state),
  'rejected checked unit replacement preserves the occupancy identity'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.update_lease(%L,%L,%L,%L,%L,current_date - 20,current_date + 340,1000,%L,NULL,NULL,%L)',
        legacy_lease_id,
        organization_id,
        property_id,
        legacy_target_unit_id,
        replacement_tenant_id,
        'USD',
        'active'
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'legacy Lease update execution cannot replace party or occupancy history'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET primary_tenant_person_id = %L WHERE organization_id = %L AND id = %L',
        replacement_tenant_id,
        organization_id,
        direct_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'relationship_transition_required',
  'direct authenticated Lease-header identity replacement is rejected'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET tenant_name = %L WHERE organization_id = %L AND id = %L',
        'Invented compatibility tenant',
        organization_id,
        direct_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'relationship_transition_required',
  'tenant-name compatibility input cannot initiate relationship mutation'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET status = %L WHERE organization_id = %L AND id = %L',
        'ended',
        organization_id,
        direct_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'occupancy_transition_required',
  'generic Lease status change requires a checked occupancy transition'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET unit_id = %L WHERE organization_id = %L AND id = %L',
        direct_target_unit_id,
        organization_id,
        direct_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'occupancy_transition_required',
  'service-role parent DML cannot replace occupancy identity'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'DELETE FROM public.leases WHERE organization_id = %L AND id = %L',
        organization_id,
        direct_lease_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'service role cannot delete a Lease and cascade-delete history'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary) VALUES (%L,%L,%L,%L,false)',
        organization_id,
        direct_lease_id,
        replacement_tenant_id,
        'co_tenant'
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'authenticated admin cannot directly insert Lease-party history'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancies SET actual_move_in_date = current_date WHERE organization_id = %L AND lease_id = %L',
        organization_id,
        direct_lease_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'authenticated admin cannot directly update Lease-occupancy history'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary) VALUES (%L,%L,%L,%L,false)',
        organization_id,
        direct_lease_id,
        replacement_tenant_id,
        'co_tenant'
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'service role cannot directly insert Lease-party history'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancies SET actual_move_in_date = current_date WHERE organization_id = %L AND lease_id = %L',
        organization_id,
        direct_lease_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'service role cannot directly update Lease-occupancy history'
);

RESET ROLE;
-- Test-only elevation inside this file's outer transaction: exercise the
-- trigger guard after bypassing the normal SELECT-only privilege boundary.
GRANT INSERT, UPDATE ON public.lease_parties TO authenticated, service_role;
GRANT INSERT, UPDATE ON public.lease_occupancies TO authenticated, service_role;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v1',
  true
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary) VALUES (%L,%L,%L,%L,false)',
        organization_id,
        direct_lease_id,
        replacement_tenant_id,
        'co_tenant'
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_history_mutation_forbidden',
  'authenticated caller cannot spoof the internal history context'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v1',
  true
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_occupancies(organization_id,lease_id,property_id,unit_id,status) VALUES (%L,%L,%L,NULL,%L)',
        organization_id,
        direct_lease_id,
        property_id,
        'cancelled'
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_history_mutation_forbidden',
  'service role cannot spoof the internal history context'
);

RESET ROLE;
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-create-v1',
  true
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_parties SET started_on = current_date WHERE id = %L',
        checked_party_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_history_mutation_forbidden',
  'checked creation capability cannot update an existing Lease-party fact'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.lease_occupancies SET actual_move_in_date = current_date WHERE id = %L',
        checked_occupancy_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_history_mutation_forbidden',
  'checked creation capability cannot update an existing occupancy fact'
);

SELECT set_config('app.lease_history_write_context', '', true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        organization_id,
        archive_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'occupancy_transition_required',
  'active Lease archive returns exact occupancy-transition guidance'
);

SELECT is(
  (
    SELECT leases.archived_at
    FROM public.leases AS leases
    WHERE leases.id =
      (SELECT archive_lease_id FROM lease_history_guard_state)
  ),
  NULL::timestamptz,
  'rejected active Lease archive leaves the Lease active'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_person(%L,%L)',
        organization_id,
        archive_person_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'relationship_transition_required',
  'active primary Person archive returns exact relationship guidance'
);

SELECT is(
  (
    SELECT people.archived_at
    FROM public.people
    WHERE people.id =
      (SELECT archive_person_id FROM lease_history_guard_state)
  ),
  NULL::timestamptz,
  'rejected Person archive leaves the active Person unarchived'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.people SET archived_at = now() WHERE organization_id = %L AND id = %L',
        organization_id,
        archive_person_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'relationship_transition_required',
  'service-role Person DML cannot bypass the active Lease-role guard'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_at = now() WHERE organization_id = %L AND id = %L',
        organization_id,
        archive_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'occupancy_transition_required',
  'service-role Lease DML cannot bypass the active occupancy guard'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.archive_lease(%L,%L)',
    (SELECT organization_id FROM lease_history_guard_state),
    (SELECT restore_lease_id FROM lease_history_guard_state)
  ),
  'cancelled Lease with no active occupancy can still be archived'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_at = NULL, archived_by = NULL WHERE organization_id = %L AND id = %L',
        organization_id,
        restore_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_restore_transition_required',
  'authenticated admin cannot bypass checked restore with direct Lease DML'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'UPDATE public.leases SET archived_at = NULL, archived_by = NULL WHERE organization_id = %L AND id = %L',
        organization_id,
        restore_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_restore_transition_required',
  'service role cannot bypass checked restore with direct Lease DML'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.restore_lease(%L,%L)',
        organization_id,
        restore_lease_id
      )
    ) ->> 'detail'
    FROM lease_history_guard_state
  ),
  'lease_restore_transition_required',
  'legacy restore fails closed pending checked dependency review'
);

SELECT isnt(
  (
    SELECT leases.archived_at
    FROM public.leases AS leases
    WHERE leases.id =
      (SELECT restore_lease_id FROM lease_history_guard_state)
  ),
  NULL::timestamptz,
  'failed restore leaves the Lease archived'
);

SELECT is(
  (
    SELECT parties.id
    FROM public.lease_parties AS parties
    WHERE parties.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND parties.lease_id =
        (SELECT restore_lease_id FROM lease_history_guard_state)
      AND parties.party_role = 'primary_tenant'
  ),
  (SELECT restore_party_id FROM lease_history_guard_state),
  'failed direct and checked restore preserve the exact Lease-party row'
);

SELECT is(
  (
    SELECT jsonb_build_array(parties.started_on, parties.ended_on)
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT restore_party_id FROM lease_history_guard_state)
  ),
  '[null, null]'::jsonb,
  'failed direct and checked restore preserve unknown party boundaries'
);

SELECT is(
  (
    SELECT occupancies.id
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND occupancies.lease_id =
        (SELECT restore_lease_id FROM lease_history_guard_state)
  ),
  (SELECT restore_occupancy_id FROM lease_history_guard_state),
  'failed direct and checked restore preserve the exact occupancy row'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'status', occupancies.status,
      'scheduled_move_in_date', occupancies.scheduled_move_in_date,
      'scheduled_move_out_date', occupancies.scheduled_move_out_date,
      'actual_move_in_date', occupancies.actual_move_in_date,
      'actual_move_out_date', occupancies.actual_move_out_date
    )
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT restore_occupancy_id FROM lease_history_guard_state)
  ),
  jsonb_build_object(
    'status', 'cancelled',
    'scheduled_move_in_date', NULL,
    'scheduled_move_out_date', NULL,
    'actual_move_in_date', NULL,
    'actual_move_out_date', NULL
  ),
  'failed direct and checked restore preserve occupancy status and date facts'
);

RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);

UPDATE public.lease_parties
SET
  started_on = current_date - 365,
  ended_on = current_date - 5
WHERE id = (SELECT completed_party_id FROM lease_history_guard_state);

UPDATE public.lease_occupancies
SET
  status = 'vacated',
  scheduled_move_in_date = current_date - 365,
  actual_move_in_date = current_date - 360,
  scheduled_move_out_date = current_date - 10,
  actual_move_out_date = current_date - 5
WHERE id = (SELECT completed_occupancy_id FROM lease_history_guard_state);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.update_lease_with_authoritative_term(%L,%L,%L,%L,%L,current_date - 364,current_date - 4,1050,%L,5,%L,%L,NULL,NULL,%L,%L)',
    (SELECT completed_lease_id FROM lease_history_guard_state),
    (SELECT organization_id FROM lease_history_guard_state),
    (SELECT property_id FROM lease_history_guard_state),
    (SELECT completed_unit_id FROM lease_history_guard_state),
    (SELECT tenant_id FROM lease_history_guard_state),
    'USD',
    'monthly',
    'expired',
    'active',
    'tb01-safe-term-update'
  ),
  'same-identity Plan 04 term update remains available'
);

SELECT is(
  (
    SELECT parties.person_id
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT completed_party_id FROM lease_history_guard_state)
  ),
  (SELECT tenant_id FROM lease_history_guard_state),
  'safe term update preserves the completed party identity'
);

SELECT is(
  (
    SELECT parties.started_on
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT completed_party_id FROM lease_history_guard_state)
  ),
  current_date - 365,
  'safe term update preserves the completed party start'
);

SELECT is(
  (
    SELECT parties.ended_on
    FROM public.lease_parties AS parties
    WHERE parties.id =
      (SELECT completed_party_id FROM lease_history_guard_state)
  ),
  current_date - 5,
  'safe term update preserves the completed party end'
);

SELECT is(
  (
    SELECT occupancies.unit_id
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT completed_occupancy_id FROM lease_history_guard_state)
  ),
  (SELECT completed_unit_id FROM lease_history_guard_state),
  'safe term update preserves the completed occupancy unit'
);

SELECT is(
  (
    SELECT occupancies.actual_move_in_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT completed_occupancy_id FROM lease_history_guard_state)
  ),
  current_date - 360,
  'safe term update preserves completed actual move-in'
);

SELECT is(
  (
    SELECT occupancies.actual_move_out_date
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.id =
      (SELECT completed_occupancy_id FROM lease_history_guard_state)
  ),
  current_date - 5,
  'safe term update preserves completed actual move-out'
);

SELECT is(
  (
    SELECT logs.previous_values ->> 'primary_tenant_person_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT tenant_id::text FROM lease_history_guard_state),
  'permitted activity keeps the exact prior primary Person ID'
);

SELECT is(
  (
    SELECT logs.new_values ->> 'primary_tenant_person_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT tenant_id::text FROM lease_history_guard_state),
  'permitted activity keeps the exact current primary Person ID'
);

SELECT is(
  (
    SELECT logs.previous_values ->> 'unit_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT completed_unit_id::text FROM lease_history_guard_state),
  'permitted activity keeps the exact prior Unit ID'
);

SELECT is(
  (
    SELECT logs.new_values ->> 'unit_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT completed_unit_id::text FROM lease_history_guard_state),
  'permitted activity keeps the exact current Unit ID'
);

SELECT is(
  (
    SELECT logs.previous_values ->> 'lease_start_date'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (current_date - 365)::text,
  'permitted activity keeps the exact prior Lease date'
);

SELECT is(
  (
    SELECT logs.new_values ->> 'lease_end_date'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (current_date - 4)::text,
  'permitted activity keeps the exact current Lease date'
);

SELECT is(
  (
    SELECT logs.new_values ->> 'lease_party_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT completed_party_id::text FROM lease_history_guard_state),
  'permitted activity identifies the exact preserved party row'
);

SELECT is(
  (
    SELECT logs.new_values ->> 'lease_occupancy_id'
    FROM public.activity_logs AS logs
    WHERE logs.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
      AND logs.entity_type = 'lease'
      AND logs.entity_id =
        (SELECT completed_lease_id FROM lease_history_guard_state)
      AND logs.action = 'lease_updated'
    ORDER BY logs.created_at DESC, logs.id DESC
    LIMIT 1
  ),
  (SELECT completed_occupancy_id::text FROM lease_history_guard_state),
  'permitted activity identifies the exact preserved occupancy row'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        organization_id,
        archive_lease_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'Manager cannot archive a Lease'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_person(%L,%L)',
        organization_id,
        archive_person_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'Member cannot archive a Person'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM lease_history_guard_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'SELECT public.archive_lease(%L,%L)',
        organization_id,
        archive_lease_id
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'cross-organization Admin cannot archive another organization Lease'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(
      format(
        'INSERT INTO public.lease_parties(organization_id,lease_id,person_id,party_role,is_primary) VALUES (%L,%L,%L,%L,false)',
        organization_id,
        archive_lease_id,
        cross_tenant_id,
        'co_tenant'
      )
    ) ->> 'sqlstate'
    FROM lease_history_guard_state
  ),
  '42501',
  'cross-organization Admin cannot insert Lease-party history'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_parties AS parties
    WHERE parties.organization_id =
      (SELECT organization_id FROM lease_history_guard_state)
  ),
  0::bigint,
  'cross-organization Admin cannot read another organization Lease history'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT lives_ok(
  format(
    'SELECT count(*) FROM public.lease_parties WHERE organization_id = %L',
    (SELECT organization_id FROM lease_history_guard_state)
  ),
  'service role retains the minimum Lease-history read capability'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
