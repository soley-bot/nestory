ALTER TABLE public.lease_billing_terms
  ALTER COLUMN rent_calculation_timezone SET DEFAULT 'UTC',
  ALTER COLUMN rule_source SET DEFAULT 'historical_policy_snapshot';

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

  IF v_lease.unit_id IS NOT NULL
    AND coalesce(
      current_setting('app.simple_lease_billing_defaults', true),
      'off'
    ) <> 'on' THEN
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

CREATE FUNCTION public.create_simplified_unit_lease(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_relationship_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('app.simple_lease_billing_defaults', 'on', true);

  v_result := public.create_lease_with_relationships(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_term_status,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status,
    p_relationship_payload,
    p_idempotency_key
  );

  PERFORM set_config('app.simple_lease_billing_defaults', 'off', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.simple_lease_billing_defaults', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_simplified_unit_lease(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_simplified_unit_lease(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_simplified_unit_lease(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) IS
  'Creates a contextual Unit Lease and its Lease-owned simple billing snapshot.';
