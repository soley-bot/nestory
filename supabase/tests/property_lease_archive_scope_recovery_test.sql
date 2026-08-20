BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

CREATE TEMP TABLE property_lease_archive_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_result jsonb,
  activation_result jsonb,
  ending_result jsonb
) ON COMMIT DROP;

INSERT INTO property_lease_archive_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON property_lease_archive_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'property-lease-archive-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('property-lease-archive', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM property_lease_archive_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Property Lease archive organization',
  'property-lease-archive-' || left(organization_id::text, 8)
FROM property_lease_archive_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM property_lease_archive_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status, rental_structure
)
SELECT property_id, organization_id, 'Whole-property Lease recovery',
  'WPA-' || left(property_id::text, 8), 'house', 'active', 'single_space'
FROM property_lease_archive_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Whole-Property Lease Tenant', 'individual'
FROM property_lease_archive_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM property_lease_archive_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_lease_archive_state),
  true
);

UPDATE property_lease_archive_state AS state
SET creation_result = public.create_property_lease(
  state.organization_id,
  state.property_id,
  state.tenant_id,
  current_date - 30,
  current_date + 335,
  1100,
  'USD',
  1,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  'property-lease-archive-create-v1'
);

UPDATE property_lease_archive_state AS state
SET activation_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  'draft',
  (state.creation_result ->> 'occupancyId')::uuid,
  'activate',
  current_date,
  NULL,
  'Keys received before whole-property archive recovery test',
  'property-lease-archive-activate-v1'
);

SELECT throws_ok(
  format(
    'SELECT public.archive_property(%L, %L)',
    (SELECT property_id FROM property_lease_archive_state),
    (SELECT organization_id FROM property_lease_archive_state)
  ),
  '55000',
  'Property has an open Lease',
  'a whole-property Lease prevents its property from being archived'
);

SELECT ok(
  (SELECT archived_at IS NULL
   FROM public.properties
   WHERE id = (SELECT property_id FROM property_lease_archive_state)),
  'a rejected whole-property archive leaves the property unchanged'
);

RESET ROLE;
SET LOCAL session_replication_role = replica;

UPDATE public.properties
SET archived_at = statement_timestamp(), archived_by = admin_id, updated_by = admin_id
FROM property_lease_archive_state
WHERE public.properties.id = property_lease_archive_state.property_id;

SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_lease_archive_state),
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.create_authoritative_lease_term(
      state.organization_id,
      (state.creation_result ->> 'leaseId')::uuid,
      term.start_date,
      term.end_date,
      term.rent_amount,
      term.rent_currency,
      term.rent_due_day,
      term.payment_frequency,
      'terminated',
      term.id,
      'property-lease-archive-direct-term-v1'
    )
    FROM property_lease_archive_state AS state
    JOIN public.lease_terms AS term
      ON term.lease_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE term.authority_kind = 'authoritative'
      AND term.status NOT IN ('superseded', 'terminated')
      AND term.archived_at IS NULL
    ORDER BY term.term_sequence DESC
    LIMIT 1
  $sql$,
  '42501',
  'permission denied for function create_authoritative_lease_term',
  'whole-property recovery remains restricted to checked lifecycle actions'
);

SELECT lives_ok(
  $sql$
    UPDATE property_lease_archive_state AS state
    SET ending_result = public.transition_lease_lifecycle(
      state.organization_id,
      (state.creation_result ->> 'leaseId')::uuid,
      'active',
      (state.activation_result ->> 'occupancyId')::uuid,
      'end',
      current_date,
      NULL,
      'Move-out confirmed for archived whole-property Lease scope',
      'property-lease-archive-end-v1'
    )
  $sql$,
  'an orphaned active whole-property Lease can be ended'
);

SELECT is(
  (SELECT status
   FROM public.leases
   WHERE id = (
     SELECT (creation_result ->> 'leaseId')::uuid
     FROM property_lease_archive_state
   )),
  'ended',
  'ending an orphaned whole-property Lease advances its header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_lifecycle_events AS event
    JOIN property_lease_archive_state AS state
      ON event.lease_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE event.transition = 'end'
      AND event.to_status = 'ended'
  ),
  'whole-property recovery records the immutable lifecycle event'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    JOIN property_lease_archive_state AS state
      ON activity.entity_id = (state.creation_result ->> 'leaseId')::uuid
    WHERE activity.entity_type = 'lease'
      AND activity.action = 'lease_lifecycle_end'
  ),
  'whole-property recovery records the operator activity log'
);

SELECT * FROM finish();
ROLLBACK;
