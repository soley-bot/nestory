BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.fixture_recognition_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT greatest(
    current_date - 1,
    date_trunc('month', current_date)::date
  )
$$;

CREATE TEMP TABLE correction_state (
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  finance_manager_id uuid NOT NULL,
  finance_member_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  billing_term_id uuid,
  invoice_id uuid,
  rent_line_id uuid,
  utility_line_id uuid,
  pass_through_line_id uuid,
  pass_through_expense_id uuid NOT NULL DEFAULT gen_random_uuid(),
  management_fee_id uuid,
  owner_line_id uuid,
  owner_allocation_set_id uuid,
  close_series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  closed_revision_id uuid NOT NULL DEFAULT gen_random_uuid(),
  utility_correction jsonb,
  pass_through_correction jsonb,
  void_correction jsonb,
  payment_invoice_id uuid,
  reconciliation_source_id uuid,
  payment_id uuid,
  no_fee_invoice_id uuid,
  no_fee_rent_line_id uuid,
  no_fee_close_series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  no_fee_closed_revision_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO correction_state (
  organization_id,
  admin_id,
  finance_manager_id,
  finance_member_id,
  lease_id,
  property_id,
  owner_person_id
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000801',
  lease.id,
  lease.property_id,
  owner.person_id
FROM public.current_leases AS lease
JOIN public.property_owners AS owner
  ON owner.organization_id = lease.organization_id
 AND owner.property_id = lease.property_id
 AND owner.archived_at IS NULL
 AND owner.started_on <= current_date
 AND (owner.ended_on IS NULL OR current_date < owner.ended_on)
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease.primary_tenant_person_id = '80000000-0000-0000-0000-000000000001';

GRANT SELECT, UPDATE ON correction_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM correction_state),
  true
);

INSERT INTO public.rent_policy_versions (
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
  organization_id,
  coalesce((
    SELECT max(policy.version_number) + 1
    FROM public.rent_policy_versions AS policy
    WHERE policy.organization_id = correction_state.organization_id
  ), 1),
  date_trunc('month', current_date)::date,
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'policy_default',
  1,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  admin_id,
  admin_id,
  now(),
  admin_id
FROM correction_state;

UPDATE correction_state
SET billing_term_id = (
  public.save_lease_billing_rules(
    organization_id,
    lease_id,
    jsonb_build_object(
      'billingRecipientKind', 'individual',
      'billingRecipientPersonId', '80000000-0000-0000-0000-000000000001',
      'collectionRoute', 'through_ips',
      'managementFeeMode', 'percentage',
      'managementFeeValue', 10,
      'chargeManagementFeeWhenActive', true,
      'fullManagementFeeDuringProration', true,
      'rentCalculationTimezone', 'Asia/Bangkok',
      'shortMonthDueDayRule', 'last_calendar_day',
      'leaseStartProrationRule', 'actual_days',
      'leaseEndProrationRule', 'actual_days',
      'midPeriodRentChangeRule', 'next_full_month',
      'chargeThroughLeaseEnd', true,
      'firstPeriodProratedAmount', NULL,
      'finalPeriodProratedAmount', NULL
    ),
    (
      SELECT id
      FROM public.lease_billing_terms AS existing
      WHERE existing.organization_id = correction_state.organization_id
        AND existing.lease_id = correction_state.lease_id
        AND existing.archived_at IS NULL
      ORDER BY existing.effective_from DESC
      LIMIT 1
    ),
    'invoice-correction-billing-term-0001'
  )->>'billingTermId'
)::uuid;

UPDATE correction_state
SET invoice_id = app_private.generate_simple_lease_rent_invoice(
  organization_id,
  lease_id,
  (date_trunc('month', current_date) + interval '1 month')::date,
  pg_temp.fixture_recognition_date(),
  'manual_recovery',
  admin_id
);


CREATE TEMP TABLE invoice_review AS SELECT invoice.issue_date, (SELECT jsonb_agg(jsonb_build_object('id',line.id,'amount',line.amount) ORDER BY line.id) FROM public.tenant_invoice_lines line WHERE line.invoice_id=invoice.id) lines FROM public.tenant_invoices invoice WHERE invoice.id=(SELECT invoice_id FROM correction_state);
GRANT SELECT,UPDATE ON invoice_review TO authenticated;
UPDATE correction_state
SET utility_line_id = (
  public.create_manual_tenant_charge(
    organization_id,
    lease_id,
    'utilities',
    (date_trunc('month', current_date) + interval '1 month')::date,
    (date_trunc('month', current_date) + interval '1 month + 4 days')::date,
    37.45,
    'Metered water recharge',
    'invoice-correction-utility-0001'
  )->>'lineId'
)::uuid;


SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date FROM invoice_review),(SELECT lines FROM invoice_review),'Delete duplicate charge','checked-stale-0001') FROM correction_state$$,'40001','tenant_invoice_sources_changed','a charge added after review blocks the whole invoice deletion');
SELECT is((SELECT lifecycle FROM public.tenant_invoices WHERE id=(SELECT invoice_id FROM correction_state)),'issued','stale review leaves invoice issued');
SELECT is((SELECT count(*) FROM public.tenant_invoice_corrections WHERE tenant_invoice_id=(SELECT invoice_id FROM correction_state)),0::bigint,'stale review creates no correction');
SELECT lives_ok($$SELECT public.correct_tenant_invoice(organization_id,invoice_id,'line_correction',utility_line_id,'Remove erroneous utility','checked-remove-utility') FROM correction_state$$,'prior line correction can coexist with checked deletion');
UPDATE invoice_review SET lines=(SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount) ORDER BY id) FROM public.tenant_invoice_lines WHERE invoice_id=(SELECT invoice_id FROM correction_state));
SELECT throws_ok($$SELECT public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date-1 FROM invoice_review),(SELECT lines FROM invoice_review),'Delete duplicate charge','checked-date-0001') FROM correction_state$$,'40001','tenant_invoice_sources_changed','reviewed date must match');
UPDATE correction_state SET void_correction=public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date FROM invoice_review),(SELECT lines FROM invoice_review),'Delete duplicate charge','checked-success-0001');
SELECT is((SELECT lifecycle FROM public.tenant_invoices WHERE id=(SELECT invoice_id FROM correction_state)),'void','fresh review voids the invoice');
SELECT is((SELECT public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date FROM invoice_review),(SELECT lines FROM invoice_review),'Delete duplicate charge','checked-success-0001') FROM correction_state),(SELECT void_correction FROM correction_state),'replay returns the same result after reversal lines exist');
SELECT throws_ok($$SELECT public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date FROM invoice_review),(SELECT lines FROM invoice_review),'Different reason','checked-success-0001') FROM correction_state$$,'22023',NULL,'different request cannot reuse a successful key');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',true);
SELECT throws_ok($$SELECT public.void_tenant_invoice_checked(organization_id,invoice_id,(SELECT issue_date FROM invoice_review),(SELECT lines FROM invoice_review),'Delete duplicate charge','checked-success-0001') FROM correction_state$$,'42501',NULL,'unauthorized replay is rejected');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.void_tenant_invoice_checked(uuid,uuid,date,jsonb,text,text)','EXECUTE'),'anonymous callers cannot invoke checked void');
SELECT * FROM finish();
ROLLBACK;
