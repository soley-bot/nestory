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

CREATE TEMP TABLE current_invoice AS SELECT app_private.generate_simple_lease_rent_invoice(organization_id,good_lease_id,current_period_start,current_period_start,'manual_recovery',super_admin_id) id FROM lease_rent_state;
GRANT SELECT ON current_invoice TO authenticated;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.schedule_authoritative_lease_term(organization_id,good_lease_id,current_period_start,(current_period_start + interval '2 months - 1 day')::date,1200,'USD',5,'monthly',good_term_id,'current-rent-change-test') FROM lease_rent_state $$,'current month rent change updates issued rent');
SELECT is((SELECT total_amount FROM public.tenant_invoice_balances WHERE id=(SELECT id FROM current_invoice)),1200::numeric,'current invoice uses new rent');
SELECT is((SELECT rent_amount FROM public.lease_terms WHERE lease_id=(SELECT good_lease_id FROM lease_rent_state) AND status='active' AND archived_at IS NULL),1200::numeric,'ongoing term uses new rent');
SELECT lives_ok($$ SELECT public.schedule_authoritative_lease_term(organization_id,good_lease_id,current_period_start,(current_period_start + interval '2 months - 1 day')::date,1200,'USD',5,'monthly',good_term_id,'current-rent-change-test') FROM lease_rent_state $$,'retry does not duplicate correction');
SELECT lives_ok($$ SELECT public.schedule_authoritative_lease_term(organization_id,good_lease_id,current_period_start,(current_period_start + interval '2 months - 1 day')::date,1250,'USD',7,'monthly',(SELECT id FROM public.lease_terms WHERE lease_id=good_lease_id AND status='active' AND archived_at IS NULL),'current-rent-change-again') FROM lease_rent_state $$,'same month can be edited again');
SELECT is((SELECT total_amount FROM public.tenant_invoice_balances WHERE id=(SELECT id FROM current_invoice)),1250::numeric,'repeat edit uses latest rent');
SELECT is((SELECT due_date FROM public.tenant_invoice_balances WHERE id=(SELECT id FROM current_invoice)),(SELECT greatest(current_period_start+6,(SELECT issue_date FROM public.tenant_invoices WHERE id=(SELECT id FROM current_invoice))) FROM lease_rent_state),'repeat edit exposes latest due date even in same transaction');
SELECT is((SELECT (public.preview_historical_rent_correction(organization_id,(SELECT id FROM current_invoice),1300,9)->>'originalDueDate')::date FROM lease_rent_state),(SELECT greatest(current_period_start+6,(SELECT issue_date FROM public.tenant_invoices WHERE id=(SELECT id FROM current_invoice))) FROM lease_rent_state),'next preview uses previous corrected due date');
SELECT is((SELECT count(*) FROM public.tenant_invoice_corrections WHERE tenant_invoice_id=(SELECT id FROM current_invoice)),2::bigint,'both edits remain in audit history without retry duplicates');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE id=(SELECT id FROM current_invoice)),1000::numeric,'issued snapshot remains unchanged');
SELECT lives_ok($$ SELECT public.record_tenant_invoice_payment_with_account(
 state.organization_id,(SELECT id FROM current_invoice),500,state.current_business_date,
 (SELECT account_id FROM public.finance_account_source_links WHERE organization_id=state.organization_id AND source_id=state.source_id),
 'Current month partial receipt',
 jsonb_build_array(jsonb_build_object('lineId',(SELECT line.id FROM public.tenant_invoice_lines line WHERE line.invoice_id=(SELECT id FROM current_invoice) AND line.line_type='rent' AND line.reversal_of_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_lines r WHERE r.reversal_of_id=line.id)),'amount',500)),
 'current-rent-partial-receipt') FROM lease_rent_state state $$,'partial payment is recorded against corrected rent');
SELECT public.allocate_owner_event(state.organization_id,'tenant_rent_receipt',allocation.id,'current-rent-owner-'||allocation.id::text)
FROM public.tenant_invoice_payment_allocations allocation CROSS JOIN lease_rent_state state
WHERE allocation.invoice_id=(SELECT id FROM current_invoice);
SELECT lives_ok($$ SELECT public.schedule_authoritative_lease_term(organization_id,good_lease_id,current_period_start,(current_period_start + interval '2 months - 1 day')::date,1400,'USD',7,'monthly',(SELECT id FROM public.lease_terms WHERE lease_id=good_lease_id AND status='active' AND archived_at IS NULL),'current-rent-paid-change') FROM lease_rent_state $$,'paid month can be increased without recording cash again');
SELECT is((SELECT total_amount FROM public.tenant_invoice_balances WHERE id=(SELECT id FROM current_invoice)),1400::numeric,'paid invoice reflects updated amount');
SELECT is((SELECT sum(signed_amount) FROM public.tenant_invoice_payment_allocations WHERE invoice_id=(SELECT id FROM current_invoice)),500::numeric,'payment allocations conserve received cash');
SELECT throws_ok($$ SELECT public.schedule_authoritative_lease_term(organization_id,good_lease_id,current_period_start,(current_period_start + interval '2 months - 1 day')::date,400,'USD',7,'monthly',(SELECT id FROM public.lease_terms WHERE lease_id=good_lease_id AND status='active' AND archived_at IS NULL),'current-rent-credit-blocked') FROM lease_rent_state $$,'23514','rent_change_requires_linked_review','reduction below collected cash requires resolving credit');
SELECT is((SELECT total_amount FROM public.tenant_invoice_balances WHERE id=(SELECT id FROM current_invoice)),1400::numeric,'failed change leaves invoice intact');
SELECT is((SELECT rent_amount FROM public.lease_terms WHERE lease_id=(SELECT good_lease_id FROM lease_rent_state) AND status='active' AND archived_at IS NULL),1400::numeric,'failed change leaves ongoing schedule intact');
SELECT * FROM finish();
ROLLBACK;

