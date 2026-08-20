BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(40);

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
    RETURN jsonb_build_object('threw', false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object(
      'threw', true,
      'sqlstate', v_state,
      'message', v_message,
      'detail', NULLIF(v_detail, '')
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.draft_relationship_payload(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_tenant_id,
      'lifecycle', 'planned',
      'recordSource', 'operator_confirmed',
      'reason', 'new_lease_relationship_composition',
      'startedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'endedOn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'reserved',
      'recordSource', 'operator_confirmed',
      'reason', 'new_lease_relationship_composition',
      'scheduledMoveIn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'scheduledMoveOut', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'actualMoveIn', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown'),
      'actualMoveOut', jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
    ),
    'participants', '[]'::jsonb
  );
$$;

CREATE TEMP TABLE property_only_lease_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  scheduled_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  changed_tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  single_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  multi_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  undecided_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  immediate_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  termination_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  changed_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  simple_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_lease_result jsonb,
  activation_result jsonb,
  immediate_lease_result jsonb,
  immediate_activation_result jsonb,
  termination_lease_result jsonb,
  termination_activation_result jsonb,
  termination_result jsonb,
  changed_lease_result jsonb,
  changed_activation_result jsonb,
  changed_term_id uuid,
  unit_lease_result jsonb
) ON COMMIT DROP;

INSERT INTO property_only_lease_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON property_only_lease_state TO authenticated, service_role;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated',
  'authenticated', 'property-lease@example.test',
  extensions.crypt('property-lease-test', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM property_only_lease_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Property lease organization',
  'property-lease-' || left(organization_id::text, 8),
  'Asia/Phnom_Penh'
FROM property_only_lease_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM property_only_lease_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status, rental_structure
)
SELECT single_property_id, organization_id, 'Whole house', 'WHOLE', 'house', 'active', 'single_space'
FROM property_only_lease_state
UNION ALL
SELECT multi_property_id, organization_id, 'Unit building', 'UNITS', 'apartment', 'active', 'multi_unit'
FROM property_only_lease_state
UNION ALL
SELECT undecided_property_id, organization_id, 'Undecided property', 'DECIDE', 'house', 'active', 'undecided'
FROM property_only_lease_state
UNION ALL
SELECT immediate_property_id, organization_id, 'Immediate house', 'NOW', 'house', 'active', 'single_space'
FROM property_only_lease_state
UNION ALL
SELECT termination_property_id, organization_id, 'Termination house', 'END', 'house', 'active', 'single_space'
FROM property_only_lease_state
UNION ALL
SELECT changed_property_id, organization_id, 'Rent change house', 'CHANGE', 'house', 'active', 'single_space'
FROM property_only_lease_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, multi_property_id, '1A', 'vacant', 900, 'USD'::public.currency_code
FROM property_only_lease_state
UNION ALL
SELECT simple_unit_id, organization_id, multi_property_id, '1B', 'vacant', 900, 'USD'::public.currency_code
FROM property_only_lease_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT tenant_id, organization_id, 'Property Tenant', 'individual'
FROM property_only_lease_state
UNION ALL
SELECT scheduled_tenant_id, organization_id, 'Scheduled Property Tenant', 'individual'
FROM property_only_lease_state
UNION ALL
SELECT changed_tenant_id, organization_id, 'Rent Change Tenant', 'individual'
FROM property_only_lease_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM property_only_lease_state
UNION ALL
SELECT organization_id, scheduled_tenant_id, 'tenant'
FROM property_only_lease_state
UNION ALL
SELECT organization_id, changed_tenant_id, 'tenant'
FROM property_only_lease_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_only_lease_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE property_only_lease_state AS state
SET property_lease_result = public.create_property_lease(
  state.organization_id,
  state.single_property_id,
  state.scheduled_tenant_id,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 364,
  1200,
  'USD',
  1,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  'property-only-lease-create'
);

SELECT ok(
  (SELECT property_lease_result ? 'leaseId' FROM property_only_lease_state),
  'a single-space Property can create a Lease without a Unit'
);

SELECT is(
  (
    SELECT lease.unit_id
    FROM public.leases AS lease
    WHERE lease.id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  NULL::uuid,
  'the Property Lease stores a null Unit'
);

SELECT is(
  (
    SELECT occupancy.unit_id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  NULL::uuid,
  'the checked occupancy record keeps the Property-only placement'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  1,
  'new Leases receive one visible billing-rule snapshot automatically'
);

SELECT is(
  (
    SELECT billing.rent_calculation_timezone
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'Asia/Phnom_Penh',
  'the billing snapshot uses the workspace timezone'
);

SELECT is(
  (
    SELECT concat_ws(
      ':',
      billing.short_month_due_day_rule,
      billing.lease_start_proration_rule,
      billing.lease_end_proration_rule,
      billing.mid_period_rent_change_rule
    )
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'last_calendar_day:actual_days:actual_days:next_full_month',
  'the Lease owns the simple V1 due-day and proration rules'
);

SELECT is(
  (
    SELECT billing.rule_source
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'lease_default_v1',
  'new billing rules are independent from global Rent policy versions'
);

SELECT lives_ok(
  $$
    UPDATE property_only_lease_state AS state
    SET unit_lease_result = public.create_simplified_unit_lease(
      state.organization_id,
      state.multi_property_id,
      state.simple_unit_id,
      state.tenant_id,
      DATE '2027-02-01',
      DATE '2027-12-31',
      900,
      'USD',
      1,
      'monthly',
      'draft',
      NULL,
      NULL,
      'draft',
      pg_temp.draft_relationship_payload(state.tenant_id),
      'simple-unit-lease-create'
    )
  $$,
  'the simplified Unit entrypoint creates a contextual Lease'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms AS billing
    WHERE billing.lease_id = (
      SELECT (unit_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
      AND billing.rule_source = 'lease_default_v1'
  ),
  1,
  'the simplified Unit entrypoint creates one Lease-owned billing snapshot'
);

UPDATE property_only_lease_state AS state
SET activation_result = public.request_lease_activation(
  state.organization_id,
  (state.property_lease_result ->> 'leaseId')::uuid,
  'draft',
  (
    SELECT occupancy.id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (state.property_lease_result ->> 'leaseId')::uuid
      AND occupancy.evidence_state = 'accepted'
  ),
  DATE '2027-01-01',
  'property-lease-scheduled-activation'
);

SELECT is(
  (SELECT activation_result ->> 'status' FROM property_only_lease_state),
  'scheduled',
  'a future activation date schedules the Lease'
);

SELECT is(
  (
    SELECT schedule.status
    FROM public.lease_activation_schedules AS schedule
    WHERE schedule.lease_id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'pending',
  'the future activation remains visibly pending'
);

SELECT is(
  (
    SELECT lease.status
    FROM public.leases AS lease
    WHERE lease.id = (
      SELECT (property_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'draft',
  'scheduling does not activate the Lease early'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_activation_schedules AS schedule,
      property_only_lease_state AS state
    WHERE schedule.lease_id = (state.property_lease_result ->> 'leaseId')::uuid
  ),
  1,
  'the scheduled activation request is idempotent before replay'
);

UPDATE property_only_lease_state AS state
SET activation_result = public.request_lease_activation(
  state.organization_id,
  (state.property_lease_result ->> 'leaseId')::uuid,
  'draft',
  (
    SELECT occupancy.id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (state.property_lease_result ->> 'leaseId')::uuid
      AND occupancy.evidence_state = 'accepted'
  ),
  DATE '2027-01-01',
  'property-lease-scheduled-activation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_activation_schedules AS schedule,
      property_only_lease_state AS state
    WHERE schedule.lease_id = (state.property_lease_result ->> 'leaseId')::uuid
  ),
  1,
  'replaying the same request does not duplicate the schedule'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

UPDATE public.lease_activation_schedules AS schedule
SET activation_date = (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date
FROM property_only_lease_state AS state
WHERE schedule.lease_id = (state.property_lease_result ->> 'leaseId')::uuid;

SELECT lives_ok(
  (
    SELECT format(
      'SELECT public.process_due_lease_activations(%L, DATE %L, 100)',
      organization_id,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date
    )
    FROM property_only_lease_state
  ),
  'the service-role activation runner processes a due schedule without a user JWT'
);

SELECT is(
  (
    SELECT schedule.status
    FROM public.lease_activation_schedules AS schedule,
      property_only_lease_state AS state
    WHERE schedule.lease_id = (state.property_lease_result ->> 'leaseId')::uuid
  ),
  'processed',
  'the due activation schedule is marked processed'
);

SELECT is(
  (
    SELECT lease.status
    FROM public.leases AS lease,
      property_only_lease_state AS state
    WHERE lease.id = (state.property_lease_result ->> 'leaseId')::uuid
  ),
  'active',
  'the due activation runner activates the scheduled Lease'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM cron.job AS job
    WHERE job.jobname = 'nestory-hourly-lease-activation'
      AND job.command = 'SELECT app_private.run_due_lease_activations();'
  ),
  'scheduled Lease activations have an hourly processor'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_only_lease_state),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE property_only_lease_state AS state
SET immediate_lease_result = public.create_property_lease(
  state.organization_id,
  state.immediate_property_id,
  state.tenant_id,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 364,
  1000,
  'USD',
  1,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  'immediate-property-lease-create'
);

UPDATE property_only_lease_state AS state
SET immediate_activation_result = public.request_lease_activation(
  state.organization_id,
  (state.immediate_lease_result ->> 'leaseId')::uuid,
  'draft',
  (
    SELECT occupancy.id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (state.immediate_lease_result ->> 'leaseId')::uuid
      AND occupancy.evidence_state = 'accepted'
  ),
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'immediate-property-lease-activation'
);

SELECT is(
  (SELECT immediate_activation_result ->> 'status' FROM property_only_lease_state),
  'active',
  'Activate today performs the checked lifecycle immediately'
);

SELECT is(
  (
    SELECT lease.status
    FROM public.leases AS lease
    WHERE lease.id = (
      SELECT (immediate_lease_result ->> 'leaseId')::uuid
      FROM property_only_lease_state
    )
  ),
  'active',
  'the immediate Lease is active after one request'
);

UPDATE property_only_lease_state AS state
SET termination_lease_result = public.create_property_lease(
  state.organization_id,
  state.termination_property_id,
  state.tenant_id,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 364,
  950,
  'USD',
  1,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  'termination-property-lease-create'
);

UPDATE property_only_lease_state AS state
SET termination_activation_result = public.request_lease_activation(
  state.organization_id,
  (state.termination_lease_result ->> 'leaseId')::uuid,
  'draft',
  (
    SELECT occupancy.id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (state.termination_lease_result ->> 'leaseId')::uuid
      AND occupancy.evidence_state = 'accepted'
  ),
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'termination-property-lease-activation'
);

SELECT lives_ok(
  (
    SELECT format(
      'UPDATE property_only_lease_state AS target SET termination_result = public.transition_lease_lifecycle(%L,%L,%L,%L,%L,DATE %L,NULL,%L,%L)',
      state.organization_id,
      (state.termination_lease_result ->> 'leaseId')::uuid,
      'active',
      (
        SELECT occupancy.id
        FROM public.lease_occupancies AS occupancy
        WHERE occupancy.lease_id = (state.termination_lease_result ->> 'leaseId')::uuid
          AND occupancy.evidence_state = 'accepted'
      ),
      'terminate',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'Tenant requested early termination',
      'termination-property-lease-transition'
    )
    FROM property_only_lease_state AS state
  ),
  'an active whole-Property Lease can be terminated through the checked lifecycle'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.rent_policy_versions AS policy,
      property_only_lease_state AS state
    WHERE policy.organization_id = state.organization_id
  ),
  0,
  'the simple Lease flow has no global Rent policy prerequisite'
);

SELECT is(
  (
    SELECT readiness.reason_code
    FROM property_only_lease_state AS state,
      public.resolve_lease_rent_readiness(
        state.organization_id,
        (state.immediate_lease_result ->> 'leaseId')::uuid,
        (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date
      ) AS readiness
  ),
  'ready',
  'Lease-owned billing rules make rent readiness visible without a global policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_lines AS line
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.immediate_lease_result ->> 'leaseId')::uuid
      AND line.line_type = 'rent'
  ),
  1,
  'activation creates the currently due rent charge once'
);

SELECT is(
  (
    SELECT line.amount
    FROM public.tenant_invoice_lines AS line
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.immediate_lease_result ->> 'leaseId')::uuid
      AND line.line_type = 'rent'
  ),
  round(1000 * ((date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
    + interval '1 month - 1 day')::date
    - (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 1)
    / extract(day FROM (date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
      + interval '1 month - 1 day'))::numeric, 2),
  'the first rent charge uses the Lease actual-days proration rule'
);

UPDATE property_only_lease_state AS state
SET changed_lease_result = public.create_property_lease(
  state.organization_id,
  state.changed_property_id,
  state.changed_tenant_id,
  date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)::date,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 500,
  1100,
  'USD',
  1,
  'monthly',
  'draft',
  NULL,
  NULL,
  'draft',
  'rent-change-lease-create'
);

UPDATE property_only_lease_state AS state
SET changed_activation_result = public.request_lease_activation(
  state.organization_id,
  (state.changed_lease_result ->> 'leaseId')::uuid,
  'draft',
  (
    SELECT occupancy.id
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.lease_id = (state.changed_lease_result ->> 'leaseId')::uuid
      AND occupancy.evidence_state = 'accepted'
  ),
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'rent-change-lease-activation'
);

UPDATE property_only_lease_state AS state
SET changed_term_id = public.schedule_authoritative_lease_term(
  state.organization_id,
  (state.changed_lease_result ->> 'leaseId')::uuid,
  (date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
    + interval '1 month 14 days')::date,
  (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date + 500,
  1300,
  'USD',
  1,
  'monthly',
  (
    SELECT term.id
    FROM public.lease_terms AS term
    WHERE term.lease_id = (state.changed_lease_result ->> 'leaseId')::uuid
      AND term.authority_kind = 'authoritative'
      AND term.status = 'active'
  ),
  'rent-change-next-full-month'
);

RESET ROLE;
SELECT app_private.generate_simple_lease_rent_invoice(
  organization_id,
  (changed_lease_result ->> 'leaseId')::uuid,
  (date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
    + interval '1 month')::date,
  (date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
    + interval '1 month')::date,
  'scheduled',
  admin_id
)
FROM property_only_lease_state;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM property_only_lease_state),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
  (
    SELECT invoice.total_amount
    FROM public.tenant_invoices AS invoice,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.changed_lease_result ->> 'leaseId')::uuid
      AND invoice.billing_period_start = (
        date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
        + interval '1 month'
      )::date
  ),
  1100::numeric,
  'a next-full-month rent change keeps the opening rent for the changed month'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_rent_segments AS segment
    JOIN public.tenant_invoices AS invoice ON invoice.id = segment.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.changed_lease_result ->> 'leaseId')::uuid
      AND invoice.billing_period_start = (
        date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
        + interval '1 month'
      )::date
  ),
  2,
  'the changed month records both authoritative rent segments'
);

SELECT results_eq(
  $$
    SELECT segment.amount, segment.proration_rule
    FROM public.tenant_invoice_rent_segments AS segment
    JOIN public.tenant_invoices AS invoice ON invoice.id = segment.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.changed_lease_result ->> 'leaseId')::uuid
      AND invoice.billing_period_start = (
        date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)
        + interval '1 month'
      )::date
    ORDER BY segment.segment_order
  $$,
  $$ VALUES
    (1100::numeric, 'next_full_period'::text),
    (0::numeric, 'next_full_period'::text)
  $$,
  'the opening segment bills and the replacement segment starts next month'
);

SELECT lives_ok(
  (
    SELECT format(
      'SELECT public.create_manual_tenant_charge(%L,%L,%L,date_trunc(''month'',%L::date)::date,%L::date,75,%L,%L)',
      organization_id,
      (immediate_lease_result ->> 'leaseId')::uuid,
      'utilities',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'Water bill',
      'manual-utilities-charge'
    )
    FROM property_only_lease_state
  ),
  'a Utilities charge uses the same checked tenant invoice authority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_lines AS line
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.immediate_lease_result ->> 'leaseId')::uuid
  ),
  2,
  'the manual charge is added to the existing Lease-month invoice'
);

SELECT lives_ok(
  (
    SELECT format(
      'SELECT public.create_manual_tenant_charge(%L,%L,%L,date_trunc(''month'',%L::date)::date,%L::date,75,%L,%L)',
      organization_id,
      (immediate_lease_result ->> 'leaseId')::uuid,
      'utilities',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'Water bill',
      'manual-utilities-charge'
    )
    FROM property_only_lease_state
  ),
  'replaying a manual charge is safe'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoice_lines AS line
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id,
      property_only_lease_state AS state
    WHERE invoice.lease_id = (state.immediate_lease_result ->> 'leaseId')::uuid
  ),
  2,
  'manual charge replay does not duplicate the line'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(format(
      'SELECT public.create_manual_tenant_charge(%L,%L,%L,date_trunc(''month'',%L::date)::date,%L::date,1000,%L,%L)',
      organization_id,
      (immediate_lease_result ->> 'leaseId')::uuid,
      'manual_rent',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'Duplicate rent',
      'duplicate-manual-rent'
    )) ->> 'detail'
    FROM property_only_lease_state
  ),
  'manual_rent_base_charge_exists',
  'Manual rent cannot duplicate the base rent for one Lease-month'
);

SELECT is(
  (
    SELECT pg_temp.capture_error(format(
      'SELECT public.create_manual_tenant_charge(%L,%L,%L,date_trunc(''month'',%L::date)::date,%L::date,25,NULL,%L)',
      organization_id,
      (immediate_lease_result ->> 'leaseId')::uuid,
      'other',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'manual-other-without-description'
    )) ->> 'detail'
    FROM property_only_lease_state
  ),
  'manual_charge_other_description_required',
  'Other requires a user description'
);

SELECT public.set_financial_month_lock(
  organization_id,
  date_trunc('month', (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date)::date,
  true,
  'Close the month for the manual-charge regression'
)
FROM property_only_lease_state;

SELECT is(
  (
    SELECT pg_temp.capture_error(format(
      'SELECT public.create_manual_tenant_charge(%L,%L,%L,date_trunc(''month'',%L::date)::date,%L::date,25,%L,%L)',
      organization_id,
      (immediate_lease_result ->> 'leaseId')::uuid,
      'utilities',
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      (statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
      'Locked month charge',
      'locked-month-charge'
    )) ->> 'sqlstate'
    FROM property_only_lease_state
  ),
  '55000',
  'manual charges cannot mutate a locked financial month'
);

SELECT is(
  (
    SELECT (pg_temp.capture_error(format(
      'SELECT public.create_property_lease(%L,%L,%L,DATE %L,DATE %L,900,%L,1,%L,%L,NULL,NULL,%L,%L)',
      organization_id, multi_property_id, tenant_id,
      '2027-01-01', '2027-12-31', 'USD', 'monthly', 'draft', 'draft',
      'multi-property-without-unit'
    )) ->> 'detail')
    FROM property_only_lease_state
  ),
  'lease_unit_required_for_multi_unit_property',
  'a multi-unit Property cannot create a Lease without a Unit'
);

SELECT is(
  (
    SELECT (pg_temp.capture_error(format(
      'SELECT public.create_property_lease(%L,%L,%L,DATE %L,DATE %L,900,%L,1,%L,%L,NULL,NULL,%L,%L)',
      organization_id, undecided_property_id, tenant_id,
      '2027-01-01', '2027-12-31', 'USD', 'monthly', 'draft', 'draft',
      'undecided-property-without-unit'
    )) ->> 'detail')
    FROM property_only_lease_state
  ),
  'lease_property_rental_structure_required',
  'an undecided Property must choose its rental structure first'
);

SELECT is(
  (
    SELECT (pg_temp.capture_error(format(
      'SELECT public.create_property_lease(%L,%L,%L,DATE %L,DATE %L,900,%L,1,%L,%L,NULL,NULL,%L,%L)',
      organization_id, single_property_id, tenant_id,
      '2027-06-01', '2028-05-31', 'USD', 'monthly', 'draft', 'draft',
      'overlapping-property-lease'
    )) ->> 'detail')
    FROM property_only_lease_state
  ),
  'property_lease_term_overlap',
  'overlapping Property-only Lease terms are rejected'
);

SELECT lives_ok(
  (
    SELECT format(
      'SELECT public.create_lease_with_relationships(%L,%L,%L,%L,DATE %L,DATE %L,900,%L,1,%L,%L,NULL,NULL,%L,pg_temp.draft_relationship_payload(%L),%L)',
      organization_id, multi_property_id, unit_id, tenant_id,
      '2027-01-01', '2027-12-31', 'USD', 'monthly', 'draft', 'draft',
      tenant_id, 'unit-backed-lease-create'
    )
    FROM property_only_lease_state
  ),
  'a multi-unit Property still creates a checked Unit Lease'
);

SELECT lives_ok(
  (
    SELECT format(
      'SELECT public.create_property_lease(%L,%L,%L,DATE %L,DATE %L,900,%L,1,%L,%L,NULL,NULL,%L,%L)',
      organization_id, single_property_id, tenant_id,
      '2028-01-01', '2028-12-31', 'USD', 'monthly', 'draft', 'draft',
      'nonoverlapping-property-lease'
    )
    FROM property_only_lease_state
  ),
  'a non-overlapping later Property Lease is allowed'
);

SELECT * FROM finish();

ROLLBACK;
