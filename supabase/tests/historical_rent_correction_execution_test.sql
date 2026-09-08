BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
-- Disposable fixture construction only; production authority is exercised below.
CREATE TEMP TABLE lease_rent_state (
  organization_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000001',
  missing_policy_organization_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000102',
  property_id uuid NOT NULL DEFAULT 'a2000000-0000-0000-0000-000000000001',
  good_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000001',
  blocked_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000002',
  recovery_unit_id uuid NOT NULL DEFAULT 'a3000000-0000-0000-0000-000000000004',
  good_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000001',
  blocked_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000002',
  owner_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000003',
  recovery_tenant_id uuid NOT NULL DEFAULT 'a4000000-0000-0000-0000-000000000005',
  good_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000001',
  blocked_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000002',
  missing_policy_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000003',
  recovery_lease_id uuid NOT NULL DEFAULT 'a5000000-0000-0000-0000-000000000004',
  good_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000001',
  blocked_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000002',
  recovery_term_id uuid NOT NULL DEFAULT 'a6000000-0000-0000-0000-000000000003',
  good_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000001',
  blocked_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000002',
  recovery_billing_id uuid NOT NULL DEFAULT 'a7000000-0000-0000-0000-000000000003',
  policy_id uuid NOT NULL DEFAULT 'a8000000-0000-0000-0000-000000000001',
  source_id uuid,
  current_business_date date,
  current_period_start date,
  non_current_period_start date,
  current_retry_result jsonb
) ON COMMIT DROP;

INSERT INTO lease_rent_state DEFAULT VALUES;

GRANT SELECT, UPDATE ON lease_rent_state TO authenticated;

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
  user_id,
  'authenticated',
  'authenticated',
  label || '@lease-rent.test',
  extensions.crypt('lease-rent-test', extensions.gen_salt('bf')),
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
FROM (
  SELECT super_admin_id, 'super-admin' FROM lease_rent_state
  UNION ALL
  SELECT finance_manager_id, 'finance-manager' FROM lease_rent_state
) AS users(user_id, label)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
SELECT
  organization_id,
  'Lease rent test organization',
  'lease-rent-test'
FROM lease_rent_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role
)
SELECT organization_id, super_admin_id, 'super_admin'
FROM lease_rent_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager'
FROM lease_rent_state;

INSERT INTO public.properties (
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
  'Lease rent property',
  'LR-001',
  'apartment',
  'active'
FROM lease_rent_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT good_unit_id, organization_id, property_id, 'A-01', 'vacant'
FROM lease_rent_state
UNION ALL
SELECT blocked_unit_id, organization_id, property_id, 'A-02', 'vacant'
FROM lease_rent_state
UNION ALL
SELECT recovery_unit_id, organization_id, property_id, 'A-03', 'vacant'
FROM lease_rent_state;

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  party_type
)
SELECT good_tenant_id, organization_id, 'Good Lease Tenant', 'individual'
FROM lease_rent_state
UNION ALL
SELECT blocked_tenant_id, organization_id, 'Blocked Lease Tenant', 'individual'
FROM lease_rent_state
UNION ALL
SELECT owner_id, organization_id, 'Lease Rent Owner', 'individual'
FROM lease_rent_state
UNION ALL
SELECT recovery_tenant_id, organization_id, 'Historical Recovery Tenant', 'individual'
FROM lease_rent_state;

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status
)
SELECT organization_id, good_tenant_id, 'tenant', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, blocked_tenant_id, 'tenant', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, owner_id, 'owner', 'active'
FROM lease_rent_state
UNION ALL
SELECT organization_id, recovery_tenant_id, 'tenant', 'active'
FROM lease_rent_state;

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
  (date_trunc('month',current_date)-interval '2 years')::date,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  status,
  created_by,
  updated_by
)
SELECT
  good_lease_id,
  organization_id,
  property_id,
  good_unit_id,
  good_tenant_id,
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  blocked_lease_id,
  organization_id,
  property_id,
  blocked_unit_id,
  blocked_tenant_id,
  'active',
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_lease_id,
  organization_id,
  property_id,
  recovery_unit_id,
  recovery_tenant_id,
  'ended',
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  id,
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  authority_kind,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  good_term_id,
  organization_id,
  good_lease_id,
  2,
  (date_trunc('month',current_date)-interval '8 months')::date::date,
  (date_trunc('month',current_date)+interval '2 months - 1 day')::date::date,
  1000::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  blocked_term_id,
  organization_id,
  blocked_lease_id,
  2,
  (date_trunc('month',current_date)-interval '8 months')::date::date,
  (date_trunc('month',current_date)+interval '2 months - 1 day')::date::date,
  900::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_term_id,
  organization_id,
  recovery_lease_id,
  2,
  (date_trunc('month',current_date)-interval '1 year')::date::date,
  (date_trunc('month',current_date)-interval '1 month - 1 day')::date::date,
  1100::numeric,
  'USD'::public.currency_code,
  5,
  'monthly',
  'expired',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

INSERT INTO public.rent_policy_versions (
  id,
  organization_id,
  version_number,
  effective_from,
  supported_frequencies,
  rent_calculation_timezone,
  due_day_source,
  policy_default_due_day,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  notice_period_charging_rule,
  mid_period_rent_change_rule,
  concessions_support_state,
  rent_free_support_state,
  waivers_support_state,
  lifecycle,
  created_by,
  updated_by,
  approved_at,
  approved_by
)
SELECT
  policy_id,
  organization_id,
  1,
  (date_trunc('month',current_date)-interval '1 year')::date,
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  5,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  super_admin_id,
  super_admin_id,
  now(),
  super_admin_id
FROM lease_rent_state;

-- Resolve the business date only after the approved timezone policy exists.
-- Before that, the helper correctly falls back to UTC, which can differ from
-- the organization's Asia/Bangkok operating date around midnight.
UPDATE lease_rent_state
SET current_business_date = app_private.rent_business_date(
      organization_id,
      pg_catalog.now()
    ),
    current_period_start = pg_catalog.date_trunc(
      'month',
      app_private.rent_business_date(organization_id, pg_catalog.now())
    )::date,
    non_current_period_start = (
      pg_catalog.date_trunc(
        'month',
        app_private.rent_business_date(organization_id, pg_catalog.now())
      ) + interval '1 month'
    )::date;

INSERT INTO public.lease_billing_terms (
  id,
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  first_period_prorated_amount,
  final_period_prorated_amount,
  rent_calculation_timezone,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  mid_period_rent_change_rule,
  charge_through_lease_end,
  rule_source,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  good_billing_id,
  organization_id,
  good_lease_id,
  property_id,
  (date_trunc('month',current_date)-interval '8 months')::date::date,
  (date_trunc('month',current_date)+interval '2 months - 1 day')::date::date,
  'through_ips',
  'percentage',
  10,
  true,
  false,
  'individual',
  good_tenant_id,
  750::numeric,
  NULL::numeric,
  'Asia/Bangkok',
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'lease_default_v1',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state
UNION ALL
SELECT
  recovery_billing_id,
  organization_id,
  recovery_lease_id,
  property_id,
  (date_trunc('month',current_date)-interval '1 year')::date::date,
  (date_trunc('month',current_date)-interval '1 month - 1 day')::date::date,
  'through_ips',
  'flat',
  50,
  true,
  true,
  'individual',
  recovery_tenant_id,
  NULL::numeric,
  NULL::numeric,
  'Asia/Bangkok',
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'lease_default_v1',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM lease_rent_state;

SELECT set_config('request.jwt.claim.sub',(SELECT super_admin_id::text FROM lease_rent_state),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
UPDATE lease_rent_state SET source_id=public.create_financial_reconciliation_source(
  organization_id,'HISTRENT','Historical rent test bank','bank','organization_pooled','USD',NULL,'****1130');

-- A direct-owner rule for the independent third lease.
INSERT INTO public.lease_billing_terms (
  id,organization_id,lease_id,property_id,effective_from,effective_to,
  collection_route,management_fee_mode,management_fee_value,
  charge_management_fee_when_active,full_management_fee_during_proration,
  billing_recipient_kind,billing_recipient_person_id,first_period_prorated_amount,
  final_period_prorated_amount,rent_calculation_timezone,short_month_due_day_rule,
  lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,
  charge_through_lease_end,rule_source,confirmed_at,confirmed_by,created_by,updated_by
)
SELECT state.blocked_billing_id,rule.organization_id,state.blocked_lease_id,
  rule.property_id,rule.effective_from,rule.effective_to,'direct_to_owner',
  rule.management_fee_mode,rule.management_fee_value,rule.charge_management_fee_when_active,
  rule.full_management_fee_during_proration,rule.billing_recipient_kind,state.blocked_tenant_id,
  NULL,rule.final_period_prorated_amount,rule.rent_calculation_timezone,
  rule.short_month_due_day_rule,rule.lease_start_proration_rule,rule.lease_end_proration_rule,
  rule.mid_period_rent_change_rule,rule.charge_through_lease_end,rule.rule_source,
  rule.confirmed_at,rule.confirmed_by,rule.created_by,rule.updated_by
FROM public.lease_billing_terms rule CROSS JOIN lease_rent_state state
WHERE rule.id=state.good_billing_id;

-- Supported and stale-evidence cases have independent cash pools so other
-- scenarios cannot spend their receipt cash before the action under test.
CREATE TEMP TABLE isolated_paid(name text PRIMARY KEY,property_id uuid DEFAULT gen_random_uuid(),
 unit_id uuid DEFAULT gen_random_uuid(),lease_id uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO isolated_paid(name) VALUES ('paid-isolated'),('partial'),('stale');
INSERT INTO public.properties(id,organization_id,name,code,property_type,status)
 SELECT isolated.property_id,state.organization_id,'Independent '||isolated.name,'HR-'||isolated.name,'apartment','active'
 FROM isolated_paid isolated CROSS JOIN lease_rent_state state;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
 SELECT isolated.unit_id,state.organization_id,isolated.property_id,'PAID-01','vacant'
 FROM isolated_paid isolated CROSS JOIN lease_rent_state state;
INSERT INTO public.property_owners(organization_id,property_id,person_id,
 ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
 SELECT state.organization_id,isolated.property_id,state.owner_id,'Primary owner',100,true,
 (date_trunc('month',current_date)-interval '2 years')::date,state.super_admin_id,state.super_admin_id
 FROM isolated_paid isolated CROSS JOIN lease_rent_state state;
SET LOCAL session_replication_role=replica;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,
 status,created_by,updated_by)
 SELECT isolated.lease_id,state.organization_id,isolated.property_id,isolated.unit_id,
 state.good_tenant_id,'active',state.super_admin_id,state.super_admin_id
 FROM isolated_paid isolated CROSS JOIN lease_rent_state state;
SET LOCAL session_replication_role=origin;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,
 rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,
 confirmed_at,confirmed_by,created_by,updated_by)
 SELECT term.organization_id,isolated.lease_id,1,term.start_date,term.end_date,
 term.rent_amount,term.rent_currency,term.rent_due_day,term.payment_frequency,term.status,
 term.authority_kind,term.confirmed_at,term.confirmed_by,term.created_by,term.updated_by
 FROM public.lease_terms term CROSS JOIN isolated_paid isolated CROSS JOIN lease_rent_state state
 WHERE term.id=state.good_term_id;
INSERT INTO public.lease_billing_terms (
  organization_id,lease_id,property_id,effective_from,effective_to,
  collection_route,management_fee_mode,management_fee_value,
  charge_management_fee_when_active,full_management_fee_during_proration,
  billing_recipient_kind,billing_recipient_person_id,first_period_prorated_amount,
  final_period_prorated_amount,rent_calculation_timezone,short_month_due_day_rule,
  lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,
  charge_through_lease_end,rule_source,confirmed_at,confirmed_by,created_by,updated_by
)
SELECT rule.organization_id,isolated.lease_id,isolated.property_id,rule.effective_from,
  rule.effective_to,rule.collection_route,rule.management_fee_mode,rule.management_fee_value,
  rule.charge_management_fee_when_active,rule.full_management_fee_during_proration,
  rule.billing_recipient_kind,rule.billing_recipient_person_id,NULL,rule.final_period_prorated_amount,
  rule.rent_calculation_timezone,rule.short_month_due_day_rule,rule.lease_start_proration_rule,
  rule.lease_end_proration_rule,rule.mid_period_rent_change_rule,rule.charge_through_lease_end,
  rule.rule_source,rule.confirmed_at,rule.confirmed_by,rule.created_by,rule.updated_by
FROM public.lease_billing_terms rule CROSS JOIN isolated_paid isolated CROSS JOIN lease_rent_state state
WHERE rule.id=state.good_billing_id;

CREATE TEMP TABLE historical_cases(
  name text PRIMARY KEY, invoice_id uuid, rent_line_id uuid, payment_id uuid,
  account_id uuid, target numeric, preview jsonb, result jsonb, original_invoice jsonb
) ON COMMIT DROP;
INSERT INTO historical_cases(name,target) VALUES
 ('unpaid-increase',1200),('partial',950),('paid',1100),('credit-blocked',800),
 ('stale',1100),('retired',1100),('direct',950),('direct-credit',800),('paid-isolated',1100);
UPDATE historical_cases c SET invoice_id=app_private.generate_simple_lease_rent_invoice(
  state.organization_id,
  CASE WHEN c.name IN ('paid-isolated','partial','stale') THEN (SELECT lease_id FROM isolated_paid WHERE name=c.name)
    WHEN c.name LIKE 'direct%' THEN state.blocked_lease_id ELSE state.good_lease_id END,
  (state.current_period_start-make_interval(months=>CASE c.name
    WHEN 'unpaid-increase' THEN 1 WHEN 'partial' THEN 2 WHEN 'paid' THEN 3
    WHEN 'credit-blocked' THEN 4 WHEN 'stale' THEN 5 WHEN 'retired' THEN 6
    WHEN 'direct' THEN 1 ELSE 2 END))::date,
  (state.current_period_start-make_interval(months=>CASE c.name
    WHEN 'unpaid-increase' THEN 1 WHEN 'partial' THEN 2 WHEN 'paid' THEN 3
    WHEN 'credit-blocked' THEN 4 WHEN 'stale' THEN 5 WHEN 'retired' THEN 6
    WHEN 'direct' THEN 1 ELSE 2 END))::date,
  'manual_recovery',state.super_admin_id)
FROM lease_rent_state state;
UPDATE historical_cases c SET
  rent_line_id=(SELECT id FROM public.tenant_invoice_lines WHERE invoice_id=c.invoice_id AND line_type='rent'),
  original_invoice=(SELECT to_jsonb(row) FROM public.tenant_invoices row WHERE row.id=c.invoice_id),
  account_id=(SELECT account_id FROM public.finance_account_source_links link
    JOIN lease_rent_state state ON state.organization_id=link.organization_id AND state.source_id=link.source_id);
GRANT SELECT,UPDATE ON historical_cases TO authenticated;

SELECT lives_ok($$SELECT public.preview_historical_rent_correction(
 state.organization_id,c.invoice_id,c.target,10)
 FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name='unpaid-increase'$$,
 'an actual historical-rent preview executes against issued invoice evidence');

CREATE FUNCTION pg_temp.preview_case(p_name text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.preview_historical_rent_correction(state.organization_id,c.invoice_id,c.target,10)
  FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name=p_name;
$$;
CREATE FUNCTION pg_temp.apply_case(p_name text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.correct_historical_rent(state.organization_id,c.invoice_id,c.target,10,
    'Verified signed historical lease evidence',c.preview->>'previewHash','historical-test-'||c.name)
  FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name=p_name;
$$;

-- Record existing settlements through real checked authorities and allocate
-- their owner evidence through the same public command used by production.
-- Establish the blocked case as the only source before allocating existing fees:
-- this proves a real dependency without relying on random receipt UUID ordering.
UPDATE historical_cases c SET payment_id=public.record_tenant_invoice_payment_with_account(
  state.organization_id,c.invoice_id,1000,state.current_business_date,c.account_id,'Dependency fixture',
  jsonb_build_array(jsonb_build_object('lineId',c.rent_line_id,'amount',1000)),
  'historical-payment-'||c.name)
FROM lease_rent_state state WHERE c.name='paid';
SELECT public.allocate_owner_event(state.organization_id,'tenant_rent_receipt',allocation.id,
  'historical-owner-'||allocation.id::text)
FROM public.tenant_invoice_payment_allocations allocation
JOIN historical_cases c ON c.payment_id=allocation.payment_id AND c.name='paid'
CROSS JOIN lease_rent_state state;
SELECT app_private.apply_available_owner_cash(state.organization_id,state.property_id,
 state.current_business_date,state.super_admin_id) FROM lease_rent_state state;
-- Same ordering as baseline.sql's source queue then legacy cash pass:
-- each cash consumer must resolve to an already-allocated fee recognition source.
SELECT public.allocate_owner_event(state.organization_id,'management_fee_occurrence',fee.id,
 'historical-fixture-fee-'||fee.id::text)
FROM public.management_fee_occurrences fee
CROSS JOIN lease_rent_state state
WHERE fee.organization_id=state.organization_id AND fee.reversal_of_id IS NULL
ORDER BY fee.fee_date,fee.id;
SELECT public.allocate_owner_event(state.organization_id,'owner_invoice_payment',allocation.id,
 'historical-fixture-owner-cash-'||allocation.id::text)
FROM public.owner_charge_cash_allocations allocation
CROSS JOIN lease_rent_state state
WHERE allocation.organization_id=state.organization_id AND allocation.reversal_of_id IS NULL;

UPDATE historical_cases c SET payment_id=public.record_tenant_invoice_payment_with_account(
  state.organization_id,c.invoice_id,CASE c.name WHEN 'partial' THEN 400 ELSE 1000 END,
  state.current_business_date,c.account_id,'Historical fixture',
  jsonb_build_array(jsonb_build_object('lineId',c.rent_line_id,
    'amount',CASE c.name WHEN 'partial' THEN 400 ELSE 1000 END)),
  'historical-payment-'||c.name)
FROM lease_rent_state state
WHERE c.name IN ('partial','paid-isolated','credit-blocked','stale','retired');
SELECT public.allocate_owner_event(state.organization_id,'tenant_rent_receipt',allocation.id,
  'historical-owner-'||allocation.id::text)
FROM public.tenant_invoice_payment_allocations allocation
JOIN historical_cases c ON c.payment_id=allocation.payment_id
CROSS JOIN lease_rent_state state;
UPDATE historical_cases c SET payment_id=public.confirm_owner_collected_rent(
  state.organization_id,c.invoice_id,900,state.current_business_date,'Direct historical fixture',
  jsonb_build_array(jsonb_build_object('lineId',c.rent_line_id,'amount',900)),
  'historical-payment-'||c.name)
FROM lease_rent_state state WHERE c.name LIKE 'direct%';
SELECT public.allocate_owner_event(state.organization_id,'owner_direct_rent_receipt',allocation.id,
  'historical-owner-'||allocation.id::text)
FROM public.owner_collection_confirmation_allocations allocation
JOIN historical_cases c ON c.payment_id=allocation.confirmation_id
CROSS JOIN lease_rent_state state;

CREATE TEMP TABLE original_cash_sources ON COMMIT DROP AS
SELECT allocation_set.id,to_jsonb(allocation_set) AS evidence
FROM public.owner_event_allocation_sets allocation_set
JOIN lease_rent_state state ON state.organization_id=allocation_set.organization_id
WHERE allocation_set.source_type='owner_invoice_payment';
GRANT SELECT ON original_cash_sources TO authenticated;
SET LOCAL ROLE authenticated;
UPDATE historical_cases SET preview=pg_temp.preview_case(name);
SELECT ok(EXISTS(SELECT 1 FROM original_cash_sources),
 'fixture supplies already-canonically-allocated owner fee cash sources');
SELECT throws_ok($$SELECT public.preview_historical_rent_correction(
 state.organization_id,c.invoice_id,c.target,NULL::integer)
 FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name='unpaid-increase'$$,
 '22023','historical_rent_correction_inputs_invalid','direct RPC callers cannot submit a NULL due day');
SELECT is((SELECT (preview->>'canApply')::boolean FROM historical_cases WHERE name='unpaid-increase'),true,
  'unpaid historical increase has a checked applicable preview');
CREATE TEMP TABLE before_nonfinite ON COMMIT DROP AS
SELECT ARRAY[(SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_corrections evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_lines evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_payments evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.management_fee_occurrences evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.owner_invoice_lines evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.owner_component_movements evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.historical_rent_settlement_reapplications evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_credit_occurrences evidence)] AS financial_evidence;
SELECT throws_ok(format($probe$SELECT public.preview_historical_rent_correction(
 state.organization_id,c.invoice_id,%L::numeric,10)
 FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name='unpaid-increase'$probe$,bad.amount),
 '22023','historical_rent_correction_inputs_invalid','preview rejects non-finite rent '||bad.amount)
FROM (VALUES ('NaN'),('Infinity'),('-Infinity')) bad(amount);
SELECT throws_ok(format($probe$SELECT public.correct_historical_rent(
 state.organization_id,c.invoice_id,%L::numeric,10,'Reject non-finite correction',
 c.preview->>'previewHash','historical-nonfinite-'||%L)
 FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name='unpaid-increase'$probe$,bad.amount,bad.amount),
 '22023','historical_rent_correction_inputs_invalid','apply rejects non-finite rent '||bad.amount)
FROM (VALUES ('NaN'),('Infinity'),('-Infinity')) bad(amount);
SELECT is(ARRAY[(SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_corrections evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_lines evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_invoice_payments evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.management_fee_occurrences evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.owner_invoice_lines evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.owner_component_movements evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.historical_rent_settlement_reapplications evidence),
 (SELECT coalesce(jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id),'[]'::jsonb) FROM public.tenant_credit_occurrences evidence)],
 (SELECT financial_evidence FROM before_nonfinite),
 'non-finite preview and execution leave all original financial rows and identities unchanged');
SELECT lives_ok($$UPDATE historical_cases SET result=pg_temp.apply_case(name) WHERE name='unpaid-increase'$$,
  'unpaid correction executes through authenticated Super Admin authority');
SELECT is((SELECT total_amount FROM public.tenant_invoice_balances balance
  JOIN historical_cases c ON c.invoice_id=balance.id WHERE c.name='unpaid-increase'),1200::numeric,
  'signed reversal and successor produce exactly the corrected obligation');
SELECT ok((SELECT original_invoice=to_jsonb(invoice) FROM historical_cases c
  JOIN public.tenant_invoices invoice ON invoice.id=c.invoice_id WHERE c.name='unpaid-increase'),
  'issued invoice header is byte-equivalent after correction');
SELECT ok(NOT EXISTS(SELECT 1 FROM original_cash_sources original
 LEFT JOIN public.owner_event_allocation_sets current ON current.id=original.id
 WHERE original.evidence IS DISTINCT FROM to_jsonb(current)),
 'correction retains the exact pre-existing owner cash allocation identities and evidence');
SELECT is((SELECT count(*)::integer FROM public.tenant_invoice_lines line
  JOIN historical_cases c ON c.invoice_id=line.invoice_id WHERE c.name='unpaid-increase'),3,
  'one immutable root plus one signed reversal plus one successor');
SELECT is((SELECT sum(fee.amount) FROM public.management_fee_occurrences fee
 JOIN historical_cases c ON c.invoice_id=fee.tenant_invoice_id WHERE c.name='unpaid-increase'),120::numeric,
 'percentage fee is replaced with exact 120 recognition without rewriting its original 100');
SELECT is((SELECT sum(line.amount) FROM public.owner_invoice_lines line
 JOIN public.management_fee_occurrences fee ON fee.id=line.source_id AND line.source_type='management_fee'
 JOIN historical_cases c ON c.invoice_id=fee.tenant_invoice_id WHERE c.name='unpaid-increase'),120::numeric,
 'owner charge recognition agrees with the corrected fee');
SELECT is(pg_temp.apply_case('unpaid-increase'),
  (SELECT result FROM historical_cases WHERE name='unpaid-increase'),'same key replays the exact result');

-- Applying the first case changes owner-close evidence; refresh before each
-- subsequent independent correction.
UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='partial';
SELECT lives_ok($$UPDATE historical_cases SET result=pg_temp.apply_case(name) WHERE name='partial'$$,
  'partial settlement replays against a decrease that needs no tenant credit');
SELECT is((SELECT ARRAY[balance.total_amount,balance.paid_through_ips,balance.balance_due]
 FROM public.tenant_invoice_balances balance JOIN historical_cases c ON c.invoice_id=balance.id
 WHERE c.name='partial'),ARRAY[950::numeric,400::numeric,550::numeric],
 'partial settlement preserves cash and leaves exact corrected receivable');

UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='paid';
SELECT ok((SELECT preview->'blockers' @>
 '[{"code":"historical_rent_dependent_owner_cash"}]'::jsonb
 FROM historical_cases WHERE name='paid'),'cash consumed by other owner charges is an explicit blocker');
SELECT throws_ok($$SELECT pg_temp.apply_case('paid')$$,'55000','historical_rent_correction_blocked',
 'correction cannot unwind cash already consumed by another owner charge');

UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='paid-isolated';
SELECT lives_ok($$UPDATE historical_cases SET result=pg_temp.apply_case(name) WHERE name='paid-isolated'$$,
  'fully settled increase preserves and reapplies the original collected cash');
SELECT is((SELECT ARRAY[balance.total_amount,balance.paid_through_ips,balance.balance_due]
 FROM public.tenant_invoice_balances balance JOIN historical_cases c ON c.invoice_id=balance.id
 WHERE c.name='paid-isolated'),ARRAY[1100::numeric,1000::numeric,100::numeric],
 'paid increase creates only the additional receivable');

UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='direct';
SELECT lives_ok($$UPDATE historical_cases SET result=pg_temp.apply_case(name) WHERE name='direct'$$,
  'direct-owner settled increase replays without moving custody');
SELECT is((SELECT ARRAY[balance.total_amount,balance.collected_by_owner,balance.balance_due]
 FROM public.tenant_invoice_balances balance JOIN historical_cases c ON c.invoice_id=balance.id
 WHERE c.name='direct'),ARRAY[950::numeric,900::numeric,50::numeric],
 'direct-owner custody and additional receivable remain exact');

UPDATE historical_cases SET preview=pg_temp.preview_case(name)
 WHERE name IN ('credit-blocked','direct-credit');
SELECT ok((SELECT preview->'blockers' @>
 '[{"code":"historical_rent_tenant_credit_unsupported"}]'::jsonb
 FROM historical_cases WHERE name='credit-blocked'),'IPS excess-credit decrease is explicitly blocked');
SELECT throws_ok($$SELECT pg_temp.apply_case('credit-blocked')$$,'55000','historical_rent_correction_blocked',
 'IPS excess-credit decrease cannot bypass its preview blocker');
SELECT throws_ok($$SELECT pg_temp.apply_case('direct-credit')$$,'55000','historical_rent_correction_blocked',
 'direct-owner excess-credit decrease cannot bypass its preview blocker');
SELECT is((SELECT count(*)::integer FROM public.tenant_credit_occurrences),0,
 'blocked decreases invent neither tenant-credit evidence nor a refund');
SELECT ok((SELECT bool_and(c.original_invoice=to_jsonb(invoice))
 FROM historical_cases c JOIN public.tenant_invoices invoice ON invoice.id=c.invoice_id
 WHERE c.name IN ('credit-blocked','direct-credit')),'unsupported paths leave issued evidence intact');

-- Equal monetary totals with changed receipt identity must stale the preview.
UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='stale';
RESET ROLE;
SELECT public.reverse_tenant_invoice_payment(state.organization_id,c.payment_id,
 state.current_business_date,'Replace fixture evidence','historical-stale-reverse')
FROM historical_cases c CROSS JOIN lease_rent_state state WHERE c.name='stale';
UPDATE historical_cases c SET payment_id=public.record_tenant_invoice_payment_with_account(
 state.organization_id,c.invoice_id,1000,state.current_business_date,c.account_id,
 'Equal value new receipt',jsonb_build_array(jsonb_build_object('lineId',c.rent_line_id,'amount',1000)),
 'historical-stale-replacement')
FROM lease_rent_state state WHERE c.name='stale';
SELECT public.allocate_owner_event(state.organization_id,'tenant_rent_receipt',allocation.id,
 'historical-stale-owner-'||allocation.id::text)
FROM public.tenant_invoice_payment_allocations allocation
JOIN historical_cases c ON c.payment_id=allocation.payment_id AND c.name='stale'
CROSS JOIN lease_rent_state state;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.apply_case('stale')$$,'40001','historical_rent_preview_stale',
 'equal-value replacement settlement invalidates old confirmation');

RESET ROLE;
SELECT ok(NOT EXISTS (
 SELECT 1 FROM historical_cases c
 JOIN public.historical_rent_settlement_reapplications replay ON replay.original_settlement_id=c.payment_id
 JOIN app_private.financial_idempotency_requests request
  ON request.organization_id=replay.organization_id
  AND request.operation='record_tenant_invoice_payment'
  AND request.result_ids->>'paymentId'=replay.replacement_settlement_id::text
 LEFT JOIN app_private.finance_chart_workflow_idempotency_bindings binding
  ON binding.organization_id=request.organization_id
  AND binding.operation=request.operation AND binding.idempotency_key=request.idempotency_key
 WHERE c.name IN ('partial','paid-isolated') AND binding.primary_account_id IS DISTINCT FROM c.account_id),
 'every successful IPS replay retains its original Chart account binding');
SELECT is((SELECT count(*)::integer FROM public.historical_rent_settlement_reapplications
 WHERE settlement_kind='ips_payment'),2,'both supported IPS paths append explicit replay evidence');
SELECT is((SELECT sum(original_amount-reapplied_amount) FROM public.historical_rent_settlement_reapplications),0::numeric,
 'supported replay conserves the entire original settlement amount');

SELECT is((SELECT sum(event.amount) FROM lease_rent_state state
 CROSS JOIN (SELECT DISTINCT invoice.property_id FROM historical_cases c
   JOIN public.tenant_invoices invoice ON invoice.id=c.invoice_id) scope
 CROSS JOIN LATERAL public.get_property_cash_events_page(
   state.organization_id,scope.property_id,'USD',state.current_business_date,
   state.current_business_date,NULL::date,NULL::text,NULL::uuid,200) event
 WHERE event.reconciliation_source_id=state.source_id),5400::numeric,
 'canonical bank activity retains all 5400 collected across every scenario after supported replays and blocked decreases');

SELECT public.archive_financial_reconciliation_source(organization_id,source_id) FROM lease_rent_state;
SET LOCAL ROLE authenticated;
UPDATE historical_cases SET preview=pg_temp.preview_case(name) WHERE name='retired';
SELECT ok((SELECT preview->'blockers' @>
 '[{"code":"historical_rent_payment_account_unavailable"}]'::jsonb
 FROM historical_cases WHERE name='retired'),'retired source is an explicit preview blocker');
SELECT throws_ok($$SELECT pg_temp.apply_case('retired')$$,'55000','historical_rent_correction_blocked',
 'retired sources cannot produce a new replay receipt');

SELECT set_config('request.jwt.claim.sub',(SELECT finance_manager_id::text FROM lease_rent_state),true);
SELECT throws_ok($$SELECT pg_temp.preview_case('stale')$$,'42501','historical_rent_correction_forbidden',
 'finance correction permission alone cannot preview historical rent');
SELECT throws_ok($$SELECT pg_temp.apply_case('unpaid-increase')$$,'42501','historical_rent_correction_forbidden',
 'a non-Super Admin cannot replay a prior privileged result');
SELECT set_config('request.jwt.claim.sub',(SELECT super_admin_id::text FROM lease_rent_state),true);
SELECT throws_ok($$SELECT public.preview_historical_rent_correction(
 '00000000-0000-0000-0000-000000000001',(SELECT invoice_id FROM historical_cases LIMIT 1),1000,10)$$,
 '42501','historical_rent_correction_forbidden','cross-organization invoice preview is denied');

RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at)
 SELECT organization_id,true,now() FROM lease_rent_state
 ON CONFLICT(organization_id) DO UPDATE SET enforcement_enabled=true,enabled_at=now();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.apply_case('unpaid-increase')$$,'42501','privileged_email_step_up_required',
 'enabled email verification also protects idempotent replay');
SELECT throws_ok($$UPDATE public.historical_rent_settlement_reapplications SET original_amount=1$$,
 '42501',NULL,'direct replay-evidence mutation is denied');

SELECT * FROM finish();
ROLLBACK;
