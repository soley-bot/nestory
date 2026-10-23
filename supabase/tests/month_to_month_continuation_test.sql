BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

CREATE TEMP TABLE boundary_state (
  admin_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000003',
  unit_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000004',
  tenant_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000005',
  company_id uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000006',
  start_actual_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000010',
  end_actual_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000011',
  start_override_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000012',
  end_override_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000013',
  conflict_write_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000014',
  conflict_history_lease uuid NOT NULL DEFAULT '98000000-0000-0000-0000-000000000015'
) ON COMMIT DROP;

INSERT INTO boundary_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id,
  'authenticated', 'authenticated', 'rent-boundary@example.test',
  extensions.crypt('rent-boundary', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM boundary_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Rent boundary', 'month-continuation-9800', 'UTC'
FROM boundary_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM boundary_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, rental_structure, status
)
SELECT property_id, organization_id, 'Boundary Property', 'RBP',
  'apartment', 'multi_unit', 'active'
FROM boundary_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'B-1', 'vacant', 3100, 'USD'
FROM boundary_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT fixture.id, state.organization_id, fixture.name, fixture.kind
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'Boundary Tenant', 'individual'),
  (state.company_id, 'Boundary Company', 'company')
) AS fixture(id, name, kind);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT state.organization_id, fixture.id, fixture.role
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'tenant'),
  (state.company_id, 'owner')
) AS fixture(id, role);

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
)
SELECT organization_id, property_id, company_id, 'Primary owner',
  100, true, DATE '2025-01-01', admin_id, admin_id
FROM boundary_state;


SET LOCAL session_replication_role = replica;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT start_actual_lease,organization_id,property_id,unit_id,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT '98000000-0000-0000-0000-000000000100',organization_id,start_actual_lease,1,
 (date_trunc('month',current_date)-interval '1 year')::date,(date_trunc('month',current_date)-interval '1 month')::date+2,
 600,'USD',1,'monthly','active','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT '98000000-0000-0000-0000-000000000101',organization_id,start_actual_lease,property_id,
 (date_trunc('month',current_date)-interval '1 year')::date,(date_trunc('month',current_date)-interval '1 month')::date+2,
 'through_ips','percentage',10,true,false,'individual',tenant_id,'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',
 now(),admin_id,admin_id,admin_id FROM boundary_state;
SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM boundary_state),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT admin_id FROM boundary_state),'role','authenticated')::text,true);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT organization_id,1,'frozen',date_trunc('month',current_date)::date FROM boundary_state;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM boundary_state);
GRANT SELECT ON boundary_state TO authenticated;
CREATE FUNCTION pg_temp.continue_lease(p_rent numeric DEFAULT 600,p_key text DEFAULT 'continuation-one') RETURNS uuid LANGUAGE sql AS $$
 SELECT public.continue_lease_month_to_month(organization_id,start_actual_lease,
 '98000000-0000-0000-0000-000000000100','98000000-0000-0000-0000-000000000101',p_rent,'percentage',10,p_key) FROM boundary_state;
$$;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.continue_lease(601)$$,'40001','continuation_term_changed','changed original rent is rejected');
SELECT lives_ok($$SELECT pg_temp.continue_lease()$$,'expired contract continues without a fabricated end date');
SELECT is((SELECT count(*)::integer FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),2,'one continuation term');
SELECT is((SELECT end_date::text FROM public.lease_terms WHERE id='98000000-0000-0000-0000-000000000100'),
 ((date_trunc('month',current_date)-interval '1 month')::date+2)::text,'historical contract end unchanged');
SELECT is((SELECT start_date FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),
 (date_trunc('month',current_date)-interval '1 month')::date+3,'contract continuation retains actual pre-cutoff start');
SELECT is((SELECT end_date::text FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),'infinity','open-ended continuation stored');
SELECT is((SELECT rent_amount FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),600::numeric,'rent preserved');
SELECT is((SELECT management_fee_value FROM public.lease_billing_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND effective_to='infinity'),10::numeric,'fee preserved');
SELECT is((SELECT count(*)::integer FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND billing_period_start<date_trunc('month',current_date)::date),0,'no pre-opening billing resurrected');
SELECT lives_ok($$SELECT pg_temp.continue_lease()$$,'same command replays without duplicate term');
SELECT is((SELECT count(*)::integer FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),2,'replay remains exactly once');
SELECT is((SELECT count(*)::integer FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND billing_period_start=date_trunc('month',current_date)::date AND lifecycle='issued'),1,'current month generated exactly once');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND billing_period_start=date_trunc('month',current_date)::date AND lifecycle='issued'),600::numeric,'full current month uses unchanged rent');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT pg_temp.continue_lease()$$,'40001','financial_generation_stale','old browser rejected before replay');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok($$SELECT pg_temp.continue_lease(600,'different-continuation-key')$$,'55000','continuation_future_term_exists','another command cannot duplicate continuation');
RESET ROLE;
SELECT app_private.try_current_month_rent(organization_id,start_actual_lease,'scheduled',now()+interval '1 month') FROM boundary_state;
SELECT is((SELECT count(*)::integer FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)
 AND billing_period_start=(date_trunc('month',current_date)+interval '1 month')::date AND lifecycle='issued'),1,'next month generates from open-ended authority');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)
 AND billing_period_start=(date_trunc('month',current_date)+interval '1 month')::date AND lifecycle='issued'),600::numeric,'next month keeps same rent');
SELECT * FROM finish();
ROLLBACK;
