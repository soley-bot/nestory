BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

CREATE TEMP TABLE zero_deposit_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  zero_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  funded_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  zero_result jsonb,
  funded_result jsonb
) ON COMMIT DROP;

INSERT INTO zero_deposit_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON zero_deposit_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'zero-deposit-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('zero-deposit', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM zero_deposit_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Zero deposit organization',
  'zero-deposit-' || left(organization_id::text, 8)
FROM zero_deposit_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM zero_deposit_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status, rental_structure
)
SELECT property_id, organization_id, 'Zero deposit property',
  'ZD-' || left(property_id::text, 8), 'apartment', 'active', 'multi_unit'
FROM zero_deposit_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT zero_unit_id, organization_id, property_id, 'ZERO-01', 'vacant', 900,
  'USD'::public.currency_code
FROM zero_deposit_state
UNION ALL
SELECT funded_unit_id, organization_id, property_id, 'FUNDED-01', 'vacant', 950,
  'USD'::public.currency_code
FROM zero_deposit_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Zero Deposit Tenant', 'individual'
FROM zero_deposit_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM zero_deposit_state;

CREATE OR REPLACE FUNCTION pg_temp.relationship_payload(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'zero_deposit_normalization_fixture',
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
      'reason', 'zero_deposit_normalization_fixture',
      'scheduledMoveIn', jsonb_build_object(
        'date', current_date + 30, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', current_date + 395, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'participants', '[]'::jsonb
  );
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM zero_deposit_state),
  true
);

SELECT lives_ok(
  $$
    UPDATE zero_deposit_state AS state
    SET zero_result = public.create_simplified_unit_lease(
      state.organization_id,
      state.property_id,
      state.zero_unit_id,
      state.tenant_id,
      current_date + 30,
      current_date + 395,
      900,
      'USD',
      1,
      'monthly',
      'draft',
      0,
      'USD',
      'draft',
      pg_temp.relationship_payload(state.tenant_id),
      'zero-deposit-create-v1'
    )
  $$,
  'a zero deposit is accepted as no deposit required'
);

SELECT lives_ok(
  $$
    UPDATE zero_deposit_state AS state
    SET funded_result = public.create_simplified_unit_lease(
      state.organization_id,
      state.property_id,
      state.funded_unit_id,
      state.tenant_id,
      current_date + 30,
      current_date + 395,
      950,
      'USD',
      1,
      'monthly',
      'draft',
      500,
      'USD',
      'draft',
      pg_temp.relationship_payload(state.tenant_id),
      'funded-deposit-create-v1'
    )
  $$,
  'a positive deposit remains supported'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.leases AS lease
    JOIN zero_deposit_state AS state
      ON lease.id = (state.zero_result ->> 'leaseId')::uuid
    WHERE lease.deposit_amount IS NULL
      AND lease.deposit_currency IS NULL
  ),
  'the Lease header stores zero as no deposit'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_deposits AS deposit
    JOIN zero_deposit_state AS state
      ON deposit.lease_id = (state.zero_result ->> 'leaseId')::uuid
    WHERE deposit.archived_at IS NULL
  ),
  0,
  'zero does not create a pending deposit artifact'
);

SELECT is(
  (
    SELECT deposit.amount
    FROM public.lease_deposits AS deposit
    JOIN zero_deposit_state AS state
      ON deposit.lease_id = (state.funded_result ->> 'leaseId')::uuid
    WHERE deposit.archived_at IS NULL
  ),
  500::numeric,
  'the unrelated positive deposit is unchanged'
);

SELECT lives_ok(
  $$
    SELECT public.update_lease_with_authoritative_term(
      (state.zero_result ->> 'leaseId')::uuid,
      state.organization_id,
      state.property_id,
      state.zero_unit_id,
      state.tenant_id,
      current_date + 30,
      current_date + 395,
      900,
      'USD',
      1,
      'monthly',
      'draft',
      0,
      'USD',
      'draft',
      'zero-deposit-update-v1'
    )
    FROM zero_deposit_state AS state
  $$,
  'editing with zero keeps no deposit required'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_deposits AS deposit
    JOIN zero_deposit_state AS state
      ON deposit.lease_id = (state.zero_result ->> 'leaseId')::uuid
    WHERE deposit.archived_at IS NULL
  ),
  0,
  'a zero-value edit does not recreate a pending deposit artifact'
);

SELECT * FROM finish();

ROLLBACK;
