BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(13);

CREATE TEMP TABLE step_up_tenant_lease_state (
  admin_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000001',
  branch_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000001',
  property_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000001',
  first_unit_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000001',
  second_unit_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000002',
  verified_unit_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000003',
  existing_tenant_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000001',
  owner_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000002',
  exact_session_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000001',
  second_session_id uuid NOT NULL DEFAULT 'c7000000-0000-0000-0000-000000000002',
  challenge_id uuid,
  verified_tenant_id uuid,
  verified_lease_result jsonb
) ON COMMIT DROP;

INSERT INTO step_up_tenant_lease_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON step_up_tenant_lease_state
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.step_up_relationship_payload(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'privileged_email_step_up_tenant_lease_test',
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
      'reason', 'privileged_email_step_up_tenant_lease_test',
      'scheduledMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', p_tenant_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'privileged_email_step_up_tenant_lease_test',
        'startedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.step_up_billing_rule(
  p_owner_id uuid
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'billingRecipientKind', 'company',
    'billingRecipientPersonId', p_owner_id,
    'collectionRoute', 'through_ips',
    'managementFeeMode', 'percentage',
    'managementFeeValue', 8,
    'chargeManagementFeeWhenActive', true,
    'fullManagementFeeDuringProration', false,
    'rentCalculationTimezone', 'Asia/Phnom_Penh',
    'shortMonthDueDayRule', 'last_calendar_day',
    'leaseStartProrationRule', 'actual_days',
    'leaseEndProrationRule', 'actual_days',
    'midPeriodRentChangeRule', 'next_full_month',
    'chargeThroughLeaseEnd', true,
    'firstPeriodProratedAmount', NULL,
    'finalPeriodProratedAmount', NULL
  );
$$;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
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
  admin_id,
  'authenticated',
  'authenticated',
  'pilot-step-up-admin@example.test',
  now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
FROM step_up_tenant_lease_state;

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
SELECT exact_session_id, admin_id, now(), now(), 'aal1'::auth.aal_level
FROM step_up_tenant_lease_state
UNION ALL
SELECT second_session_id, admin_id, now(), now(), 'aal1'::auth.aal_level
FROM step_up_tenant_lease_state;

INSERT INTO public.organizations (
  id,
  name,
  slug,
  operational_timezone
)
SELECT
  organization_id,
  'Pilot step-up tenant and lease test',
  'pilot-step-up-tenant-lease-test',
  'Asia/Phnom_Penh'
FROM step_up_tenant_lease_state;

INSERT INTO public.organization_branches (id, organization_id, name, code)
SELECT branch_id, organization_id, 'Pilot test branch', 'PST'
FROM step_up_tenant_lease_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM step_up_tenant_lease_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  rental_structure,
  status
)
SELECT
  property_id,
  organization_id,
  'Pilot step-up property',
  'PST-1',
  'apartment',
  'multi_unit',
  'active'
FROM step_up_tenant_lease_state;

INSERT INTO public.units (
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
FROM step_up_tenant_lease_state AS state
CROSS JOIN LATERAL (
  VALUES
    (state.first_unit_id, 'PST-01'),
    (state.second_unit_id, 'PST-02'),
    (state.verified_unit_id, 'PST-03')
) AS fixture(unit_id, unit_number);

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT existing_tenant_id, organization_id, 'Existing Pilot tenant', 'individual'
FROM step_up_tenant_lease_state
UNION ALL
SELECT owner_id, organization_id, 'Pilot owner company', 'company'
FROM step_up_tenant_lease_state;

INSERT INTO public.person_branch_relationships (
  organization_id,
  person_id,
  branch_id
)
SELECT organization_id, existing_tenant_id, branch_id
FROM step_up_tenant_lease_state
UNION ALL
SELECT organization_id, owner_id, branch_id
FROM step_up_tenant_lease_state;

INSERT INTO public.person_roles (organization_id, person_id, role)
SELECT organization_id, existing_tenant_id, 'tenant'
FROM step_up_tenant_lease_state
UNION ALL
SELECT organization_id, owner_id, 'owner'
FROM step_up_tenant_lease_state;

INSERT INTO public.property_owners (
  organization_id,
  property_id,
  person_id,
  ownership_label,
  ownership_percent,
  is_primary,
  started_on,
  created_by,
  updated_by
)
SELECT
  organization_id,
  property_id,
  owner_id,
  'Primary owner',
  100,
  true,
  DATE '2025-01-01',
  admin_id,
  admin_id
FROM step_up_tenant_lease_state;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM step_up_tenant_lease_state),
  true
);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', admin_id,
    'session_id', exact_session_id
  )::text,
  true
)
FROM step_up_tenant_lease_state;
SET LOCAL ROLE authenticated;

SELECT public.assign_property_branch(organization_id, property_id, branch_id)
FROM step_up_tenant_lease_state;

RESET ROLE;

UPDATE public.organization_authorization_states AS authorization_state
SET ordinary_access_enabled = true
FROM step_up_tenant_lease_state AS state
WHERE authorization_state.organization_id = state.organization_id;

INSERT INTO app_private.privileged_email_step_up_policies (
  organization_id,
  enforcement_enabled,
  enabled_at,
  enabled_by
)
SELECT organization_id, true, now(), admin_id
FROM step_up_tenant_lease_state;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_person(%L,%L,NULL,%L,NULL,NULL,NULL,NULL,ARRAY[%L],%L)',
    organization_id,
    'Denied before verification',
    'individual',
    'tenant',
    branch_id
  ),
  '42501',
  'Privileged email verification required',
  'create_person fails closed before email verification'
)
FROM step_up_tenant_lease_state;

SELECT throws_ok(
  format(
    'SELECT public.create_lease_with_deposit_receipt(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,15,%L,%L,500,%L,%L,%L::jsonb,%L::jsonb,false,NULL,NULL,%L)',
    state.organization_id,
    state.property_id,
    state.first_unit_id,
    state.existing_tenant_id,
    '2026-09-01',
    '2027-08-31',
    'USD',
    'monthly',
    'draft',
    'USD',
    'draft',
    pg_temp.step_up_relationship_payload(state.existing_tenant_id),
    pg_temp.step_up_billing_rule(state.owner_id),
    'pilot-step-up-before-verification'
  ),
  '42501',
  'Privileged email verification required',
  'create_lease_with_deposit_receipt fails closed before email verification'
)
FROM step_up_tenant_lease_state AS state;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.display_name = 'Denied before verification'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.leases AS lease
    JOIN step_up_tenant_lease_state AS state
      ON state.organization_id = lease.organization_id
    WHERE lease.unit_id = state.first_unit_id
  ),
  'denied tenant and lease writes leave no partial application records'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

UPDATE step_up_tenant_lease_state AS state
SET challenge_id = (
  SELECT prepared.challenge_id
  FROM public.prepare_privileged_email_step_up(
    state.organization_id,
    state.admin_id,
    state.exact_session_id,
    repeat('a', 64),
    repeat('b', 64)
  ) AS prepared
);

SELECT ok(
  challenge_id IS NOT NULL,
  'the trusted email boundary prepares a challenge for the exact Auth session'
)
FROM step_up_tenant_lease_state;

SELECT lives_ok(
  format(
    'SELECT public.mark_privileged_email_step_up_sent(%L::uuid)',
    challenge_id
  ),
  'the trusted email boundary marks the challenge delivered'
)
FROM step_up_tenant_lease_state;

SELECT is(
  public.verify_privileged_email_step_up(
    challenge_id,
    organization_id,
    admin_id,
    exact_session_id,
    repeat('a', 64),
    repeat('b', 64)
  ),
  true,
  'the delivered email digest establishes the exact-session grant'
)
FROM step_up_tenant_lease_state;

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    WHERE step_up_grant.organization_id = state.organization_id
      AND step_up_grant.user_id = state.admin_id
      AND step_up_grant.session_id = state.exact_session_id
      AND step_up_grant.expires_at IS NULL
      AND step_up_grant.revoked_at IS NULL
  ),
  'verification persists a grant only for the prepared Auth session'
)
FROM step_up_tenant_lease_state AS state;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM step_up_tenant_lease_state),
  true
);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', admin_id,
    'session_id', second_session_id
  )::text,
  true
)
FROM step_up_tenant_lease_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_person(%L,%L,NULL,%L,NULL,NULL,NULL,NULL,ARRAY[%L],%L)',
    organization_id,
    'Denied from second session',
    'individual',
    'tenant',
    branch_id
  ),
  '42501',
  'Privileged email verification required',
  'create_person rejects the same user from a second Auth session'
)
FROM step_up_tenant_lease_state;

SELECT throws_ok(
  format(
    'SELECT public.create_lease_with_deposit_receipt(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,15,%L,%L,500,%L,%L,%L::jsonb,%L::jsonb,false,NULL,NULL,%L)',
    state.organization_id,
    state.property_id,
    state.second_unit_id,
    state.existing_tenant_id,
    '2026-09-01',
    '2027-08-31',
    'USD',
    'monthly',
    'draft',
    'USD',
    'draft',
    pg_temp.step_up_relationship_payload(state.existing_tenant_id),
    pg_temp.step_up_billing_rule(state.owner_id),
    'pilot-step-up-second-session'
  ),
  '42501',
  'Privileged email verification required',
  'create_lease_with_deposit_receipt rejects the same user from a second Auth session'
)
FROM step_up_tenant_lease_state AS state;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', admin_id,
    'session_id', exact_session_id
  )::text,
  true
)
FROM step_up_tenant_lease_state;
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'UPDATE step_up_tenant_lease_state SET verified_tenant_id = public.create_person(%L,%L,NULL,%L,%L,NULL,NULL,NULL,ARRAY[%L],%L)',
    organization_id,
    'Verified Pilot tenant',
    'individual',
    'verified-pilot-tenant@example.test',
    'tenant',
    branch_id
  ),
  'create_person succeeds in the verified exact Auth session'
)
FROM step_up_tenant_lease_state;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.id = state.verified_tenant_id
      AND person.organization_id = state.organization_id
      AND person.display_name = 'Verified Pilot tenant'
  ),
  'the verified Person RPC persists the real tenant record'
)
FROM step_up_tenant_lease_state AS state;

SELECT lives_ok(
  format(
    'UPDATE step_up_tenant_lease_state SET verified_lease_result = public.create_lease_with_deposit_receipt(%L,%L,%L,%L,DATE %L,DATE %L,1000,%L,15,%L,%L,500,%L,%L,%L::jsonb,%L::jsonb,false,NULL,NULL,%L)',
    state.organization_id,
    state.property_id,
    state.verified_unit_id,
    state.verified_tenant_id,
    '2026-09-01',
    '2027-08-31',
    'USD',
    'monthly',
    'draft',
    'USD',
    'draft',
    pg_temp.step_up_relationship_payload(state.verified_tenant_id),
    pg_temp.step_up_billing_rule(state.owner_id),
    'pilot-step-up-verified-session'
  ),
  'create_lease_with_deposit_receipt succeeds in the verified exact Auth session'
)
FROM step_up_tenant_lease_state AS state;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.leases AS lease
    WHERE lease.id = (state.verified_lease_result ->> 'leaseId')::uuid
      AND lease.organization_id = state.organization_id
      AND lease.unit_id = state.verified_unit_id
      AND lease.primary_tenant_person_id = state.verified_tenant_id
  ),
  'the verified Lease RPC persists a lease for the newly created tenant'
)
FROM step_up_tenant_lease_state AS state;

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
