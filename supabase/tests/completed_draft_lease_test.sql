BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

CREATE TEMP TABLE tenant_archive_cancel_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_result jsonb,
  activation_result jsonb,
  cancellation_result jsonb,
  repair_result jsonb
) ON COMMIT DROP;

INSERT INTO tenant_archive_cancel_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON tenant_archive_cancel_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'tenant-archive-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('tenant-archive', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM tenant_archive_cancel_state;

INSERT INTO public.organizations(id, name, slug)
SELECT organization_id, 'Tenant archive cancellation organization',
  'tenant-archive-' || left(organization_id::text, 8)
FROM tenant_archive_cancel_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM tenant_archive_cancel_state;

INSERT INTO public.properties(id, organization_id, name, code, property_type, status)
SELECT property_id, organization_id, 'Tenant archive property',
  'TA-' || left(property_id::text, 8), 'apartment', 'active'
FROM tenant_archive_cancel_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'TA-01', 'vacant', 900, 'USD'
FROM tenant_archive_cancel_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Tenant Archive Resident', 'individual'
FROM tenant_archive_cancel_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM tenant_archive_cancel_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM tenant_archive_cancel_state),
  true
);

UPDATE tenant_archive_cancel_state AS state
SET creation_result = public.create_lease_with_relationships(
  state.organization_id,
  state.property_id,
  state.unit_id,
  state.tenant_id,
  current_date - 30,
  current_date - 1,
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
      'reason', 'explicit_draft_party',
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
      'reason', 'explicit_draft_occupancy',
      'scheduledMoveIn', jsonb_build_object(
        'date', current_date - 30, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', current_date - 1, 'kind', 'known', 'confidence', 'confirmed'
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
        'personId', state.tenant_id,
        'lifecycle', 'planned',
        'recordSource', 'operator_confirmed',
        'reason', 'explicit_draft_participant',
        'startedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        )
      )
    )
  ),
  'tenant-archive-draft-create-v1'
);

RESET ROLE;

INSERT INTO public.lease_billing_terms (
  organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  billing_recipient_kind, billing_recipient_person_id,
  confirmed_by, created_by, updated_by
)
SELECT
  organization_id, (creation_result ->> 'leaseId')::uuid, property_id,
  current_date - 30, current_date - 1, 'through_ips', 'percentage', 10,
  'individual', tenant_id, admin_id, admin_id, admin_id
FROM tenant_archive_cancel_state;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM tenant_archive_cancel_state),
  true
);

SELECT lives_ok($test$
 UPDATE tenant_archive_cancel_state SET activation_result = public.record_completed_draft_lease(
 organization_id, (creation_result->>'leaseId')::uuid, 'draft',
 (creation_result->>'occupancyId')::uuid, 'end', current_date - 1, NULL,
 'Confirmed historical occupancy', 'completed-history-test', current_date - 30
 )
$test$, 'Completed draft is recorded without current activation');
SELECT is((SELECT activation_result->>'status' FROM tenant_archive_cancel_state), 'ended', 'Lease is ended');
SELECT is((SELECT actual_move_in_date FROM public.lease_occupancies WHERE id=(SELECT (activation_result->>'occupancyId')::uuid FROM tenant_archive_cancel_state)), current_date-30, 'Actual move-in retained');
SELECT is((SELECT actual_move_out_date FROM public.lease_occupancies WHERE id=(SELECT (activation_result->>'occupancyId')::uuid FROM tenant_archive_cancel_state)), current_date-1, 'Actual move-out retained');
SELECT is((SELECT count(*)::integer FROM public.tenant_invoices WHERE lease_id=(SELECT (creation_result->>'leaseId')::uuid FROM tenant_archive_cancel_state)), 0, 'Historical recording does not create rent charges');
SELECT lives_ok($test$
 SELECT public.record_completed_draft_lease(organization_id,(creation_result->>'leaseId')::uuid,'draft',
 (creation_result->>'occupancyId')::uuid,'end',current_date-1,NULL,
 'Confirmed historical occupancy','completed-history-test',current_date-30)
 FROM tenant_archive_cancel_state
$test$, 'Identical retry returns saved history');
SELECT throws_ok($test$
 SELECT public.record_completed_draft_lease(organization_id,(creation_result->>'leaseId')::uuid,'draft',
 (creation_result->>'occupancyId')::uuid,'end',current_date-1,NULL,
 'Confirmed historical occupancy','completed-history-test',current_date-29)
 FROM tenant_archive_cancel_state
$test$,'22023',NULL,'Changed move-in cannot reuse saved history command');
SELECT * FROM finish();
ROLLBACK;
