BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

CREATE TEMP TABLE lease_archive_scope_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  draft_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  draft_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  draft_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active_creation_result jsonb,
  active_activation_result jsonb,
  active_ending_result jsonb,
  draft_creation_result jsonb,
  draft_cancellation_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_archive_scope_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON lease_archive_scope_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'lease-archive-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('lease-archive', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM lease_archive_scope_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Lease archive safety organization',
  'lease-archive-' || left(organization_id::text, 8)
FROM lease_archive_scope_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM lease_archive_scope_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status, rental_structure
)
SELECT active_property_id, organization_id, 'Active lease property',
  'LA-' || left(active_property_id::text, 8), 'apartment', 'active', 'multi_unit'
FROM lease_archive_scope_state
UNION ALL
SELECT draft_property_id, organization_id, 'Draft lease property',
  'LD-' || left(draft_property_id::text, 8), 'apartment', 'active', 'multi_unit'
FROM lease_archive_scope_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT active_unit_id, organization_id, active_property_id, 'ACTIVE-01',
  'vacant', 900, 'USD'::public.currency_code
FROM lease_archive_scope_state
UNION ALL
SELECT draft_unit_id, organization_id, draft_property_id, 'DRAFT-01',
  'vacant', 700, 'USD'::public.currency_code
FROM lease_archive_scope_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT active_tenant_id, organization_id, 'Active Lease Tenant', 'individual'
FROM lease_archive_scope_state
UNION ALL
SELECT draft_tenant_id, organization_id, 'Draft Lease Tenant', 'individual'
FROM lease_archive_scope_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, active_tenant_id, 'tenant'
FROM lease_archive_scope_state
UNION ALL
SELECT organization_id, draft_tenant_id, 'tenant'
FROM lease_archive_scope_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_archive_scope_state),
  true
);

UPDATE lease_archive_scope_state AS state
SET active_creation_result = public.create_lease_with_relationships(
  state.organization_id,
  state.active_property_id,
  state.active_unit_id,
  state.active_tenant_id,
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
      'personId', state.active_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'archive_scope_active_draft_created',
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
      'reason', 'archive_scope_active_draft_created',
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
  'lease-archive-active-create-v1'
);

UPDATE lease_archive_scope_state AS state
SET active_activation_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.active_creation_result ->> 'leaseId')::uuid,
  'draft',
  (state.active_creation_result ->> 'occupancyId')::uuid,
  'activate',
  current_date,
  NULL,
  'Keys received before archive safety regression test',
  'lease-archive-active-activate-v1'
);

UPDATE lease_archive_scope_state AS state
SET draft_creation_result = public.create_lease_with_relationships(
  state.organization_id,
  state.draft_property_id,
  state.draft_unit_id,
  state.draft_tenant_id,
  current_date + 30,
  current_date + 395,
  700,
  'USD',
  1,
  'monthly',
  'draft',
  350,
  'USD',
  'draft',
  jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', state.draft_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'archive_scope_draft_created',
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
      'reason', 'archive_scope_draft_created',
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
  ),
  'lease-archive-draft-create-v1'
);

SELECT throws_ok(
  format(
    'SELECT public.archive_unit(%L, %L)',
    (SELECT active_unit_id FROM lease_archive_scope_state),
    (SELECT organization_id FROM lease_archive_scope_state)
  ),
  '55000',
  'Unit has an open Lease',
  'an occupied unit cannot be archived while its Lease is open'
);

SELECT ok(
  (SELECT archived_at IS NULL
   FROM public.units
   WHERE id = (SELECT active_unit_id FROM lease_archive_scope_state)),
  'a rejected unit archive leaves the unit unchanged'
);

RESET ROLE;

SET LOCAL session_replication_role = replica;

UPDATE public.units
SET archived_at = statement_timestamp(), archived_by = admin_id, updated_by = admin_id
FROM lease_archive_scope_state
WHERE public.units.id = lease_archive_scope_state.active_unit_id;

SET LOCAL session_replication_role = origin;

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)',
    'EXECUTE'
  ),
  'Data API roles cannot execute the low-level authoritative term writer'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_archive_scope_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.archive_property(%L, %L)',
    (SELECT active_property_id FROM lease_archive_scope_state),
    (SELECT organization_id FROM lease_archive_scope_state)
  ),
  '55000',
  'Property has an open Lease',
  'a property cannot be archived by first hiding the leased unit'
);

SELECT ok(
  (SELECT archived_at IS NULL
   FROM public.properties
   WHERE id = (SELECT active_property_id FROM lease_archive_scope_state)),
  'a rejected property archive leaves the property unchanged'
);

RESET ROLE;

SET LOCAL session_replication_role = replica;

UPDATE public.properties
SET archived_at = statement_timestamp(), archived_by = admin_id, updated_by = admin_id
FROM lease_archive_scope_state
WHERE public.properties.id = lease_archive_scope_state.active_property_id;

UPDATE public.units
SET archived_at = statement_timestamp(), archived_by = admin_id, updated_by = admin_id
FROM lease_archive_scope_state
WHERE public.units.id = lease_archive_scope_state.draft_unit_id;

UPDATE public.properties
SET archived_at = statement_timestamp(), archived_by = admin_id, updated_by = admin_id
FROM lease_archive_scope_state
WHERE public.properties.id = lease_archive_scope_state.draft_property_id;

SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_archive_scope_state),
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.create_authoritative_lease_term(
      state.organization_id,
      (state.active_creation_result ->> 'leaseId')::uuid,
      term.start_date,
      term.end_date,
      term.rent_amount,
      term.rent_currency,
      term.rent_due_day,
      term.payment_frequency,
      'terminated',
      term.id,
      'lease-archive-direct-term-v1'
    )
    FROM lease_archive_scope_state AS state
    JOIN public.lease_terms AS term
      ON term.lease_id = (state.active_creation_result ->> 'leaseId')::uuid
    WHERE term.authority_kind = 'authoritative'
      AND term.status NOT IN ('superseded', 'terminated')
      AND term.archived_at IS NULL
    ORDER BY term.term_sequence DESC
    LIMIT 1
  $sql$,
  '42501',
  'permission denied for function create_authoritative_lease_term',
  'archived-scope recovery remains restricted to the checked lifecycle command'
);

SELECT throws_ok(
  $sql$
    WITH forged_recovery_context AS MATERIALIZED (
      SELECT set_config(
        'app.lease_scope_terminal_recovery_context',
        'checked-lease-lifecycle-v1',
        true
      ) AS context_value
    )
    SELECT public.create_authoritative_lease_term(
      state.organization_id,
      (state.active_creation_result ->> 'leaseId')::uuid,
      term.start_date,
      term.end_date,
      term.rent_amount,
      term.rent_currency,
      term.rent_due_day,
      term.payment_frequency,
      'terminated',
      term.id,
      'lease-archive-forged-context-v1:' || forged.context_value
    )
    FROM lease_archive_scope_state AS state
    JOIN public.lease_terms AS term
      ON term.lease_id = (state.active_creation_result ->> 'leaseId')::uuid
    CROSS JOIN forged_recovery_context AS forged
    WHERE term.authority_kind = 'authoritative'
      AND term.status NOT IN ('superseded', 'terminated')
      AND term.archived_at IS NULL
    ORDER BY term.term_sequence DESC
    LIMIT 1
  $sql$,
  '42501',
  'permission denied for function create_authoritative_lease_term',
  'a caller-set recovery setting cannot bypass the checked lifecycle command'
);

SELECT lives_ok(
  format(
    $sql$
      UPDATE lease_archive_scope_state AS state
      SET active_ending_result = public.transition_lease_lifecycle(
        state.organization_id,
        (state.active_creation_result ->> 'leaseId')::uuid,
        'active',
        (state.active_activation_result ->> 'occupancyId')::uuid,
        'end',
        current_date,
        NULL,
        'Move-out confirmed for legacy archived Lease scope',
        'lease-archive-active-end-v1'
      )
    $sql$
  ),
  'an existing active Lease can be ended after its scope was archived'
);

SELECT is(
  (SELECT status
   FROM public.leases
   WHERE id = (
     SELECT (active_creation_result ->> 'leaseId')::uuid
     FROM lease_archive_scope_state
   )),
  'ended',
  'ending an orphaned active Lease advances its header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_terms AS term
    JOIN lease_archive_scope_state AS state
      ON term.id = (state.active_ending_result ->> 'termId')::uuid
    WHERE term.status = 'terminated'
  ),
  'ending an orphaned active Lease appends a terminal authoritative term'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_lifecycle_events AS event
    JOIN lease_archive_scope_state AS state
      ON event.lease_id = (state.active_creation_result ->> 'leaseId')::uuid
    WHERE event.transition = 'end'
      AND event.to_status = 'ended'
  ),
  'ending an orphaned active Lease preserves its lifecycle event history'
);

SELECT lives_ok(
  format(
    $sql$
      UPDATE lease_archive_scope_state AS state
      SET draft_cancellation_result = public.transition_lease_lifecycle(
        state.organization_id,
        (state.draft_creation_result ->> 'leaseId')::uuid,
        'draft',
        (state.draft_creation_result ->> 'occupancyId')::uuid,
        'cancel',
        current_date,
        NULL,
        'Draft cancelled for legacy archived Lease scope',
        'lease-archive-draft-cancel-v1'
      )
    $sql$
  ),
  'an existing draft Lease can be cancelled after its scope was archived'
);

SELECT is(
  (SELECT status
   FROM public.leases
   WHERE id = (
     SELECT (draft_creation_result ->> 'leaseId')::uuid
     FROM lease_archive_scope_state
   )),
  'cancelled',
  'cancelling an orphaned draft Lease advances its header'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN lease_archive_scope_state AS state
      ON occupancy.id = (state.draft_cancellation_result ->> 'occupancyId')::uuid
    WHERE occupancy.business_lifecycle = 'cancelled_before_effective'
  ),
  'cancelling an orphaned draft Lease closes its accepted occupancy evidence'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.lease_lifecycle_events AS event
    JOIN lease_archive_scope_state AS state
      ON event.lease_id = (state.draft_creation_result ->> 'leaseId')::uuid
    WHERE event.transition = 'cancel'
      AND event.to_status = 'cancelled'
  ),
  'cancelling an orphaned draft Lease preserves its lifecycle event history'
);

SELECT * FROM finish();
ROLLBACK;
