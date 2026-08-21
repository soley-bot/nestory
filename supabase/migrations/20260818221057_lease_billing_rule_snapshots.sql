ALTER TABLE public.lease_billing_terms
  ALTER COLUMN collection_route DROP NOT NULL,
  ALTER COLUMN management_fee_mode DROP NOT NULL,
  ALTER COLUMN management_fee_value DROP NOT NULL,
  ALTER COLUMN billing_recipient_kind DROP NOT NULL,
  ALTER COLUMN billing_recipient_person_id DROP NOT NULL;

ALTER TABLE public.lease_billing_terms
  ADD COLUMN rent_calculation_timezone text,
  ADD COLUMN short_month_due_day_rule text,
  ADD COLUMN lease_start_proration_rule text,
  ADD COLUMN lease_end_proration_rule text,
  ADD COLUMN mid_period_rent_change_rule text,
  ADD COLUMN charge_through_lease_end boolean,
  ADD COLUMN rule_source text;

UPDATE public.lease_billing_terms AS billing
SET
  rent_calculation_timezone = organization.operational_timezone,
  short_month_due_day_rule = 'last_calendar_day',
  lease_start_proration_rule = 'actual_days',
  lease_end_proration_rule = 'actual_days',
  mid_period_rent_change_rule = 'next_full_month',
  charge_through_lease_end = true,
  rule_source = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.rent_policy_versions AS policy
      WHERE policy.organization_id = billing.organization_id
        AND policy.lifecycle = 'approved'
        AND policy.effective_from <= billing.effective_from
    ) THEN 'historical_policy_snapshot'
    ELSE 'unresolved_history'
  END
FROM public.organizations AS organization
WHERE organization.id = billing.organization_id;

WITH initial_terms AS (
  SELECT DISTINCT ON (lease.organization_id, lease.id)
    lease.organization_id,
    lease.id AS lease_id,
    lease.property_id,
    term.start_date,
    term.end_date,
    coalesce(term.confirmed_by, term.created_by, lease.created_by) AS actor_id,
    organization.operational_timezone
  FROM public.leases AS lease
  JOIN public.lease_terms AS term
    ON term.organization_id = lease.organization_id
    AND term.lease_id = lease.id
  JOIN public.organizations AS organization
    ON organization.id = lease.organization_id
  WHERE lease.archived_at IS NULL
    AND term.archived_at IS NULL
    AND term.authority_kind = 'authoritative'
    AND term.status <> 'superseded'
    AND NOT EXISTS (
      SELECT 1
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = lease.organization_id
        AND billing.lease_id = lease.id
        AND billing.archived_at IS NULL
    )
  ORDER BY
    lease.organization_id,
    lease.id,
    term.start_date,
    term.term_sequence,
    term.id
)
INSERT INTO public.lease_billing_terms (
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  rent_calculation_timezone,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  mid_period_rent_change_rule,
  charge_through_lease_end,
  rule_source,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  initial.organization_id,
  initial.lease_id,
  initial.property_id,
  initial.start_date,
  initial.end_date,
  initial.operational_timezone,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'next_full_month',
  true,
  'unresolved_history',
  initial.actor_id,
  initial.actor_id,
  initial.actor_id
FROM initial_terms AS initial
WHERE initial.actor_id IS NOT NULL;

ALTER TABLE public.lease_billing_terms
  ALTER COLUMN rent_calculation_timezone SET NOT NULL,
  ALTER COLUMN short_month_due_day_rule SET NOT NULL,
  ALTER COLUMN lease_start_proration_rule SET NOT NULL,
  ALTER COLUMN lease_end_proration_rule SET NOT NULL,
  ALTER COLUMN mid_period_rent_change_rule SET NOT NULL,
  ALTER COLUMN charge_through_lease_end SET NOT NULL,
  ALTER COLUMN rule_source SET NOT NULL,
  ALTER COLUMN short_month_due_day_rule SET DEFAULT 'last_calendar_day',
  ALTER COLUMN lease_start_proration_rule SET DEFAULT 'actual_days',
  ALTER COLUMN lease_end_proration_rule SET DEFAULT 'actual_days',
  ALTER COLUMN mid_period_rent_change_rule SET DEFAULT 'next_full_month',
  ALTER COLUMN charge_through_lease_end SET DEFAULT true,
  ALTER COLUMN rule_source SET DEFAULT 'lease_default_v1';

ALTER TABLE public.lease_billing_terms
  ADD CONSTRAINT lease_billing_terms_short_month_rule_check
    CHECK (short_month_due_day_rule = 'last_calendar_day'),
  ADD CONSTRAINT lease_billing_terms_start_proration_rule_check
    CHECK (lease_start_proration_rule = 'actual_days'),
  ADD CONSTRAINT lease_billing_terms_end_proration_rule_check
    CHECK (lease_end_proration_rule = 'actual_days'),
  ADD CONSTRAINT lease_billing_terms_mid_period_rule_check
    CHECK (mid_period_rent_change_rule = 'next_full_month'),
  ADD CONSTRAINT lease_billing_terms_rule_source_check
    CHECK (rule_source IN (
      'lease_default_v1',
      'historical_policy_snapshot',
      'unresolved_history'
    )),
  ADD CONSTRAINT lease_billing_terms_timezone_not_blank_check
    CHECK (length(trim(rent_calculation_timezone)) > 0);

CREATE OR REPLACE FUNCTION app_private.create_default_lease_billing_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := coalesce(
    (SELECT auth.uid()),
    NEW.confirmed_by,
    NEW.created_by
  );
  v_lease public.leases%ROWTYPE;
  v_timezone text;
BEGIN
  IF NEW.authority_kind <> 'authoritative'
    OR NEW.term_sequence <> 1
    OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = NEW.organization_id
    AND lease.id = NEW.lease_id
    AND lease.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT organization.operational_timezone
  INTO v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = NEW.organization_id;

  IF v_actor_id IS NULL OR NULLIF(trim(v_timezone), '') IS NULL THEN
    RAISE EXCEPTION 'Lease billing snapshot authority is incomplete'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_billing_snapshot_authority_required';
  END IF;

  INSERT INTO public.lease_billing_terms (
    organization_id,
    lease_id,
    property_id,
    effective_from,
    effective_to,
    rent_calculation_timezone,
    short_month_due_day_rule,
    lease_start_proration_rule,
    lease_end_proration_rule,
    mid_period_rent_change_rule,
    charge_through_lease_end,
    rule_source,
    confirmed_by,
    created_by,
    updated_by
  )
  VALUES (
    NEW.organization_id,
    NEW.lease_id,
    v_lease.property_id,
    NEW.start_date,
    NEW.end_date,
    v_timezone,
    'last_calendar_day',
    'actual_days',
    'actual_days',
    'next_full_month',
    true,
    'lease_default_v1',
    v_actor_id,
    v_actor_id,
    v_actor_id
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_default_lease_billing_rules()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lease_terms_create_default_billing_rules
AFTER INSERT ON public.lease_terms
FOR EACH ROW
EXECUTE FUNCTION app_private.create_default_lease_billing_rules();
