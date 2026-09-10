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
  0,
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

-- Fee-only scenarios share the established historical-rent fixture contract.
SELECT set_config('request.jwt.claim.sub',(SELECT super_admin_id::text FROM lease_rent_state),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
UPDATE public.lease_billing_terms SET management_fee_value=0 WHERE id=(SELECT good_billing_id FROM lease_rent_state);
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,
  collection_route,management_fee_mode,management_fee_value,charge_management_fee_when_active,
  full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
  rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,
  mid_period_rent_change_rule,charge_through_lease_end,rule_source,confirmed_at,confirmed_by,created_by,updated_by)
SELECT s.blocked_billing_id,s.organization_id,s.blocked_lease_id,s.property_id,b.effective_from,b.effective_to,
  'through_ips','flat',50,true,false,'individual',s.blocked_tenant_id,'Asia/Bangkok','last_calendar_day',
  'actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),s.super_admin_id,s.super_admin_id,s.super_admin_id
FROM public.lease_billing_terms b CROSS JOIN lease_rent_state s WHERE b.id=s.good_billing_id;
CREATE TEMP TABLE fee_cases(name text primary key, invoice_id uuid, target numeric, preview jsonb, result jsonb, evidence jsonb);
INSERT INTO fee_cases(name,target) VALUES ('missing',48.33),('positive',60),('zero',0),('stale',75);
UPDATE fee_cases c SET invoice_id=app_private.generate_simple_lease_rent_invoice(
 s.organization_id,CASE WHEN c.name='missing' THEN s.good_lease_id ELSE s.blocked_lease_id END,
 (s.current_period_start-make_interval(months=>CASE c.name WHEN 'zero' THEN 1 WHEN 'stale' THEN 2 ELSE 0 END))::date,
 (s.current_period_start-make_interval(months=>CASE c.name WHEN 'zero' THEN 1 WHEN 'stale' THEN 2 ELSE 0 END))::date,
 'manual_recovery',s.super_admin_id) FROM lease_rent_state s;
GRANT SELECT,UPDATE ON fee_cases TO authenticated;
CREATE FUNCTION pg_temp.preview_fee(p_name text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.preview_historical_rent_correction(s.organization_id,c.invoice_id,l.amount,
 extract(day from i.due_date)::integer,c.target) FROM fee_cases c CROSS JOIN lease_rent_state s
 JOIN public.tenant_invoices i ON i.organization_id=s.organization_id
 JOIN public.tenant_invoice_lines l ON l.invoice_id=i.id AND l.line_type='rent'
 WHERE c.name=p_name AND i.id=c.invoice_id;
$$;
CREATE FUNCTION pg_temp.apply_fee(p_name text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.correct_historical_rent(s.organization_id,c.invoice_id,l.amount,
 extract(day from i.due_date)::integer,'Verified issued management fee amount',c.preview->>'previewHash','fee-test-'||c.name,c.target)
 FROM fee_cases c CROSS JOIN lease_rent_state s
 JOIN public.tenant_invoices i ON i.organization_id=s.organization_id
 JOIN public.tenant_invoice_lines l ON l.invoice_id=i.id AND l.line_type='rent'
 WHERE c.name=p_name AND i.id=c.invoice_id;
$$;
CREATE FUNCTION pg_temp.fee_evidence(p_invoice uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'invoice',(SELECT to_jsonb(i) FROM public.tenant_invoices i WHERE i.id=p_invoice),
 'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.tenant_invoice_lines l WHERE l.invoice_id=p_invoice),
 'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.tenant_invoice_payments p WHERE p.invoice_id=p_invoice),
 'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.tenant_invoice_payment_allocations a
   JOIN public.tenant_invoice_payments p ON p.id=a.payment_id WHERE p.invoice_id=p_invoice),
 'income',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.finance_income_items i JOIN public.tenant_invoice_lines l ON l.income_item_id=i.id WHERE l.invoice_id=p_invoice));
$$;
UPDATE fee_cases SET evidence=pg_temp.fee_evidence(invoice_id);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.management_fee_occurrences WHERE tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='missing')),0,'0 percent issued invoice has no original fee occurrence');
UPDATE fee_cases SET preview=pg_temp.preview_fee(name);
SELECT ok((SELECT bool_and((preview->>'canApply')::boolean) FROM fee_cases),'current and prior issued periods can preview a one-off fee correction');
SELECT public.set_financial_month_lock((SELECT organization_id FROM lease_rent_state),current_date,true,'Fee correction lock test');
SELECT ok((pg_temp.preview_fee('missing')->'blockers') @> '[{"code":"financial_month_locked"}]'::jsonb,'financial month lock blocks fee correction');
SELECT throws_ok($$SELECT pg_temp.apply_fee('missing')$$,'40001','historical_rent_preview_stale','locking a month invalidates an earlier preview');
SELECT public.set_financial_month_lock((SELECT organization_id FROM lease_rent_state),current_date,false,'Fee correction test reopened');
RESET ROLE;
-- Disposable closed-period fixture; restore normal triggers before exercising RPCs.
SET LOCAL session_replication_role = replica;
INSERT INTO public.owner_close_series(id,organization_id,property_id,owner_person_id,currency,month_start,state,created_by,state_changed_by)
 SELECT 'a9000000-0000-0000-0000-000000000001',organization_id,property_id,owner_id,'USD',current_period_start,'open',super_admin_id,super_admin_id FROM lease_rent_state;
INSERT INTO public.owner_close_revisions(id,owner_close_series_id,organization_id,property_id,owner_person_id,currency,
 month_start,revision_number,status,prepared_by,input_watermark,input_canonical,input_hash,content_hash,closed_at,closed_by,close_reason)
 SELECT 'a9000000-0000-0000-0000-000000000002','a9000000-0000-0000-0000-000000000001',organization_id,
 property_id,owner_id,'USD',current_period_start,1,'closed',super_admin_id,'fixture','fixture',repeat('0',64),repeat('0',64),now(),super_admin_id,'Fixture closed period' FROM lease_rent_state;
UPDATE public.owner_close_series SET state='closed',active_revision_id='a9000000-0000-0000-0000-000000000002',
 current_closed_revision_id='a9000000-0000-0000-0000-000000000002' WHERE id='a9000000-0000-0000-0000-000000000001';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT ok((pg_temp.preview_fee('missing')->'blockers') @> '[{"code":"historical_rent_owner_close_reopen_required"}]'::jsonb,'closed Owner Close period blocks current fee correction');
SELECT throws_ok($$SELECT pg_temp.apply_fee('missing')$$,'40001','historical_rent_preview_stale','closing Owner Close invalidates confirmation');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.owner_close_series SET state='open',active_revision_id=NULL,current_closed_revision_id=NULL WHERE id='a9000000-0000-0000-0000-000000000001';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
UPDATE fee_cases SET preview=pg_temp.preview_fee(name);
SELECT throws_ok($$SELECT public.preview_historical_rent_correction((SELECT organization_id FROM lease_rent_state),
 (SELECT invoice_id FROM fee_cases WHERE name='missing'),1,5,48.33)$$,'22023','management_fee_correction_inputs_invalid','fee-only authority rejects rent changes');
SELECT throws_ok($$SELECT public.preview_historical_rent_correction((SELECT organization_id FROM lease_rent_state),
 (SELECT invoice_id FROM fee_cases WHERE name='missing'),1000,5,'NaN'::numeric)$$,'22023','management_fee_correction_inputs_invalid','nonfinite fee is rejected');
SELECT throws_ok($$SELECT public.preview_historical_rent_correction((SELECT organization_id FROM lease_rent_state),
 (SELECT invoice_id FROM fee_cases WHERE name='missing'),1000,5,-1)$$,'22023','management_fee_correction_inputs_invalid','negative fee is rejected');
SELECT throws_ok($$SELECT public.preview_historical_rent_correction((SELECT organization_id FROM lease_rent_state),
 (SELECT invoice_id FROM fee_cases WHERE name='missing'),1000,5,48.333)$$,'22023','management_fee_correction_inputs_invalid','fee precision is rejected');
UPDATE fee_cases SET target=76 WHERE name='stale';
SELECT throws_ok($$SELECT pg_temp.apply_fee('stale')$$,'40001','historical_rent_preview_stale','changed fee cannot reuse a prior preview');

SELECT lives_ok($$UPDATE fee_cases SET result=pg_temp.apply_fee(name) WHERE name='positive'$$,'existing fee receives signed reversal and successor');
SELECT lives_ok($$UPDATE fee_cases SET result=pg_temp.apply_fee(name) WHERE name='zero'$$,'an existing fee can be corrected to zero');
RESET ROLE;
UPDATE lease_rent_state SET source_id=public.create_financial_reconciliation_source(
 organization_id,'FEECORRECTION','Fee correction test bank','bank','organization_pooled','USD',NULL,'****1130');
SELECT public.record_tenant_invoice_payment_with_account(s.organization_id,c.invoice_id,100,s.current_business_date,
 (SELECT account_id FROM public.finance_account_source_links WHERE organization_id=s.organization_id AND source_id=s.source_id),
 'Original collection retained',jsonb_build_array(jsonb_build_object('lineId',l.id,'amount',100)),'fee-original-payment')
 FROM fee_cases c CROSS JOIN lease_rent_state s JOIN public.tenant_invoice_lines l ON l.organization_id=s.organization_id
 WHERE c.name='missing' AND l.invoice_id=c.invoice_id AND l.line_type='rent';
SELECT public.allocate_owner_event(s.organization_id,'tenant_rent_receipt',a.id,'fee-original-allocation-'||a.id::text)
 FROM public.tenant_invoice_payment_allocations a JOIN public.tenant_invoice_payments p ON p.id=a.payment_id
 CROSS JOIN lease_rent_state s WHERE p.invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='missing');
-- Existing collected rent has already funded another invoice's owner fee.
SELECT public.allocate_owner_event(s.organization_id,'management_fee_occurrence',f.id,'fee-consumed-source-'||f.id::text)
 FROM public.management_fee_occurrences f CROSS JOIN lease_rent_state s
 WHERE f.tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='stale') AND f.reversal_of_id IS NULL;
SELECT public.allocate_owner_event(s.organization_id,'owner_invoice_payment',a.id,'fee-consumed-cash-'||a.id::text)
 FROM public.owner_charge_cash_allocations a CROSS JOIN lease_rent_state s
 JOIN public.owner_invoice_lines l ON l.organization_id=s.organization_id
 WHERE a.owner_invoice_line_id=l.id AND a.organization_id=s.organization_id
 AND l.source_id IN (SELECT id FROM public.management_fee_occurrences WHERE tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='stale'))
 AND a.reversal_of_id IS NULL;
CREATE TEMP TABLE spent_fee_cash AS SELECT c.* FROM public.owner_cash_source_consumptions c
 WHERE c.organization_id=(SELECT organization_id FROM lease_rent_state);
GRANT SELECT ON spent_fee_cash TO authenticated;
SELECT ok(EXISTS(SELECT 1 FROM spent_fee_cash),'fixture includes collected rent already consumed by another owner charge');
UPDATE fee_cases SET evidence=pg_temp.fee_evidence(invoice_id),preview=pg_temp.preview_fee(name) WHERE name='missing';
SET LOCAL ROLE authenticated;
SELECT ok((SELECT (preview->>'canApply')::boolean FROM fee_cases WHERE name='missing'),'spent rent cash does not block an independent fee-only correction');
SELECT lives_ok($$UPDATE fee_cases SET result=pg_temp.apply_fee(name) WHERE name='missing'$$,'missing fee becomes an explicit owner charge');
SELECT ok(NOT EXISTS(SELECT 1 FROM spent_fee_cash original LEFT JOIN public.owner_cash_source_consumptions current_cash ON current_cash.id=original.id
 WHERE current_cash.id IS NULL OR to_jsonb(current_cash) IS DISTINCT FROM to_jsonb(original)),'fee-only correction retains existing spent owner cash evidence');
SELECT ok((pg_temp.preview_fee('stale')->'blockers') @> '[{"code":"owner_invoice_settlement_active"}]'::jsonb,'an existing fee paid from owner cash must be reversed through its settlement flow first');
UPDATE fee_cases SET preview=pg_temp.preview_fee(name) WHERE name='stale';
SELECT throws_ok($$SELECT pg_temp.apply_fee('stale')$$,'55000','historical_rent_correction_blocked','fee correction cannot bypass a settled owner charge');
SELECT is((SELECT sum(amount) FROM public.management_fee_occurrences WHERE tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='missing')),48.33::numeric,'corrected missing fee contributes exactly48.33 to fee reporting');
SELECT is((SELECT sum(amount) FROM public.management_fee_occurrences WHERE tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='positive')),60::numeric,'fee reversal and successor net to60');
SELECT is((SELECT sum(amount) FROM public.management_fee_occurrences WHERE tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='zero')),0::numeric,'fee correction tozero nets tozero');
SELECT ok((SELECT bool_and(evidence=pg_temp.fee_evidence(invoice_id)) FROM fee_cases),'invoice header rent lines income and payments remain byte-equivalent');
SELECT is(pg_temp.apply_fee('missing'),(SELECT result FROM fee_cases WHERE name='missing'),'retry returns original result without duplicate charges');
SELECT is((SELECT count(*)::integer FROM public.owner_event_allocation_sets a JOIN public.management_fee_occurrences f ON f.organization_id=a.organization_id AND f.id=a.source_line_id WHERE a.source_type='management_fee_occurrence' AND f.tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='missing')),1,'missing fee is allocated into the owner ledger');
SELECT is((SELECT sum(l.amount) FROM public.owner_invoice_lines l JOIN public.management_fee_occurrences f ON f.organization_id=l.organization_id AND f.id=l.source_id WHERE l.source_type='management_fee' AND f.tenant_invoice_id=(SELECT invoice_id FROM fee_cases WHERE name='missing')),48.33::numeric,'one root owner receivable is created');
SELECT ok((pg_temp.preview_fee('missing')->'blockers') @> '[{"code":"management_fee_already_corrected"}]'::jsonb,'second correction is explicitly blocked');
SELECT set_config('request.jwt.claim.sub',(SELECT finance_manager_id::text FROM lease_rent_state),true);
SELECT throws_ok($$SELECT pg_temp.preview_fee('stale')$$,'42501','historical_rent_correction_forbidden','finance manager cannot preview privileged correction');
SELECT throws_ok($$SELECT pg_temp.apply_fee('missing')$$,'42501','historical_rent_correction_forbidden','finance manager cannot replay an admin correction');
SELECT set_config('request.jwt.claim.sub',(SELECT super_admin_id::text FROM lease_rent_state),true);
RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at)
 SELECT organization_id,true,now() FROM lease_rent_state ON CONFLICT(organization_id) DO UPDATE SET enforcement_enabled=true,enabled_at=now();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.preview_fee('stale')$$,'42501','privileged_email_step_up_required','email verification gates preview');
SELECT throws_ok($$SELECT pg_temp.apply_fee('missing')$$,'42501','privileged_email_step_up_required','email verification gates idempotent replay');
SELECT * FROM finish();
ROLLBACK;
