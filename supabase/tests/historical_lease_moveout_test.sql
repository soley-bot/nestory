BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

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
  (date_trunc('month',current_date)::date - 65) - 30,
  (date_trunc('month',current_date)::date - 65) + 335,
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
        'date', (date_trunc('month',current_date)::date - 65), 'kind', 'known', 'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', (date_trunc('month',current_date)::date - 65) + 335, 'kind', 'known', 'confidence', 'confirmed'
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

UPDATE lease_lifecycle_state AS state
SET activation_result = public.transition_lease_lifecycle(
  state.organization_id,
  (state.creation_result ->> 'leaseId')::uuid,
  'draft',
  (state.creation_result ->> 'occupancyId')::uuid,
  'activate',
  (date_trunc('month',current_date)::date - 65),
  NULL,
  'Keys received and resident confirmed in person',
  'lease-lifecycle-activate-v1'
);

RESET ROLE;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
-- Seed an already enrolled manual-billing workspace; command guards remain enabled below.
SET LOCAL session_replication_role = replica;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date,automatic_rent_enabled)
SELECT organization_id,1,'frozen',date_trunc('month',current_date)::date,false FROM lease_lifecycle_state;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM lease_lifecycle_state);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE lease_lifecycle_state SET ending_result=public.transition_lease_lifecycle(
 organization_id,(creation_result->>'leaseId')::uuid,'active',(activation_result->>'occupancyId')::uuid,
 'terminate',date_trunc('month',current_date)::date-1,NULL,'Confirmed early move-out','historical-moveout-one')$$,
 'move-out preserves historical contract dates across the financial opening');
SELECT is((SELECT status FROM public.leases WHERE id=(SELECT (creation_result->>'leaseId')::uuid FROM lease_lifecycle_state)),
 'terminated','lease closes');
SELECT is((SELECT actual_move_out_date FROM public.lease_occupancies WHERE id=(SELECT (ending_result->>'occupancyId')::uuid FROM lease_lifecycle_state)),
 date_trunc('month',current_date)::date-1,'actual move-out retained');
SELECT is((SELECT count(*)::integer FROM public.tenant_invoices WHERE lease_id=(SELECT (creation_result->>'leaseId')::uuid FROM lease_lifecycle_state)
 AND billing_period_start<date_trunc('month',current_date)::date),0,'no pre-opening invoice created');
RESET ROLE;
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed(organization_id,date_trunc('month',current_date)::date-1) FROM lease_lifecycle_state$$,
 '22023','financial_date_before_start','actual pre-opening financial entries remain blocked');
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=(SELECT organization_id FROM lease_lifecycle_state);
SELECT throws_ok($$SELECT app_private.lock_open_lease_term_periods(organization_id,property_id,'USD',current_date-100,current_date-60) FROM lease_lifecycle_state$$,
 '55000','financial_writes_frozen','fully historical terms still honor the workspace freeze');
SELECT * FROM finish();
ROLLBACK;