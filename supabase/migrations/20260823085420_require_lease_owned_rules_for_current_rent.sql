-- Current rent generation must fail closed when a Lease has no effective
-- lease_default_v1 rule. Historical invoices and historical policy snapshots
-- remain readable evidence, but are not live generation authority.

CREATE OR REPLACE FUNCTION app_private.try_generate_lease_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_error_code text;
  v_error_message text;
  v_invoice_id uuid;
  v_period_end date;
  v_property_id uuid;
  v_safe_message text;
  v_uses_lease_rule boolean;
BEGIN
  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'failed',
      'code', 'lease_not_found',
      'message', 'The Lease is no longer available.'
    );
  END IF;

  v_period_end := (p_billing_period_start + interval '1 month - 1 day')::date;
  SELECT EXISTS (
    SELECT 1
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND billing.effective_from <= v_period_end
      AND billing.effective_to >= p_billing_period_start
  )
  INTO v_uses_lease_rule;

  BEGIN
    IF NOT v_uses_lease_rule THEN
      RAISE EXCEPTION 'Complete the Lease billing setup before generating rent'
        USING ERRCODE = '23514';
    END IF;

    v_invoice_id := app_private.generate_simple_lease_rent_invoice(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_source,
      p_actor_id
    );

    UPDATE public.rent_generation_exceptions AS exception
    SET resolved_at = coalesce(exception.resolved_at, pg_catalog.now()),
        resolved_invoice_id = coalesce(
          exception.resolved_invoice_id, v_invoice_id
        ),
        last_attempt_at = pg_catalog.now(),
        last_attempted_by = p_actor_id
    WHERE exception.organization_id = p_organization_id
      AND exception.lease_id = p_lease_id
      AND exception.billing_period_start = p_billing_period_start;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'generated', 'invoiceId', v_invoice_id
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;

    v_error_code := CASE
      WHEN v_error_message LIKE 'A Super Admin is required%' THEN 'missing_super_admin'
      WHEN v_error_message LIKE 'Approve a complete monthly rent policy%' THEN 'rent_policy_missing'
      WHEN v_error_message LIKE 'Confirm one authoritative lease term%'
        OR v_error_message LIKE 'Confirm one authoritative Lease term%'
        THEN 'lease_term_missing'
      WHEN v_error_message LIKE 'Complete lease billing setup%'
        OR v_error_message LIKE 'Complete the Lease billing setup%'
        OR v_error_message LIKE 'Resolve the Lease billing rules%'
        THEN 'billing_setup_missing'
      WHEN v_error_message LIKE 'The lease billing recipient%'
        OR v_error_message LIKE 'The Lease billing recipient%'
        THEN 'billing_recipient_invalid'
      WHEN v_error_message LIKE 'Automatic rent currently supports%'
        OR v_error_message LIKE 'Automatic rent requires monthly terms%'
        THEN 'unsupported_frequency'
      WHEN v_error_message LIKE 'This month is locked%'
        OR v_error_message LIKE 'Financial month is locked%'
        THEN 'period_locked'
      WHEN v_error_message LIKE 'The lease is not active%'
        OR v_error_message LIKE 'The Lease is not eligible%'
        THEN 'lease_outside_period'
      WHEN v_error_message LIKE 'Only an active lease%' THEN 'lease_inactive'
      WHEN v_error_message LIKE 'Complete the rent due-day%' THEN 'due_day_missing'
      WHEN v_error_message LIKE 'Existing rent activity conflicts%' THEN 'rent_conflict'
      ELSE 'generation_failed'
    END;

    v_safe_message := CASE v_error_code
      WHEN 'missing_super_admin' THEN 'Assign a Super Admin before automatic rent can run.'
      WHEN 'rent_policy_missing' THEN 'Approve the monthly rent policy for this organization.'
      WHEN 'lease_term_missing' THEN 'Confirm one authoritative Lease term for this month.'
      WHEN 'billing_setup_missing' THEN 'Complete the Lease billing and management-fee setup.'
      WHEN 'billing_recipient_invalid' THEN 'Select an active billing recipient for the Lease.'
      WHEN 'unsupported_frequency' THEN 'Automatic rent currently supports monthly terms only.'
      WHEN 'period_locked' THEN 'Unlock this month before retrying rent generation.'
      WHEN 'lease_outside_period' THEN 'The Lease is not active in this billing month.'
      WHEN 'lease_inactive' THEN 'The Lease must be active before rent can be generated.'
      WHEN 'due_day_missing' THEN 'Complete the rent due-day configuration.'
      WHEN 'rent_conflict' THEN 'Resolve the existing rent record for this Lease month.'
      ELSE 'Review the Lease rent setup and retry.'
    END;

    INSERT INTO public.rent_generation_exceptions (
      organization_id, property_id, lease_id, billing_period_start,
      generation_source, error_code, safe_message, attempt_count,
      first_attempt_at, last_attempt_at, last_attempted_by,
      resolved_at, resolved_invoice_id
    ) VALUES (
      p_organization_id, v_property_id, p_lease_id, p_billing_period_start,
      p_generation_source, v_error_code, v_safe_message, 1,
      pg_catalog.now(), pg_catalog.now(), p_actor_id, NULL, NULL
    )
    ON CONFLICT ON CONSTRAINT rent_generation_exceptions_lease_period_unique
    DO UPDATE SET
      generation_source = EXCLUDED.generation_source,
      error_code = EXCLUDED.error_code,
      safe_message = EXCLUDED.safe_message,
      attempt_count = public.rent_generation_exceptions.attempt_count + 1,
      last_attempt_at = pg_catalog.now(),
      last_attempted_by = EXCLUDED.last_attempted_by,
      resolved_at = NULL,
      resolved_invoice_id = NULL;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'failed', 'code', v_error_code, 'message', v_safe_message
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.try_generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.try_generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) IS
  'Generates only from an effective lease_default_v1 rule and records billing_setup_missing when that Lease-owned authority is absent.';

CREATE OR REPLACE FUNCTION app_private.try_current_month_rent(
  p_organization_id uuid,
  p_lease_id uuid,
  p_generation_source text,
  p_clock timestamptz DEFAULT pg_catalog.now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid;
  v_business_date date;
  v_calculation_timezone text;
  v_lease public.leases%ROWTYPE;
  v_period_start date;
BEGIN
  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL;

  IF NOT FOUND OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'skipped');
  END IF;

  SELECT billing.rent_calculation_timezone
  INTO v_calculation_timezone
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.rule_source = 'lease_default_v1'
    AND billing.archived_at IS NULL
    AND (p_clock AT TIME ZONE billing.rent_calculation_timezone)::date
      BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF FOUND THEN
    v_business_date := (
      p_clock AT TIME ZONE v_calculation_timezone
    )::date;
  ELSE
    -- The organization operational timezone only identifies which exception
    -- month to record. It never supplies rent calculation or invoice authority.
    SELECT organization.operational_timezone
    INTO v_calculation_timezone
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id;

    v_business_date := (
      p_clock AT TIME ZONE coalesce(v_calculation_timezone, 'UTC')
    )::date;
  END IF;
  v_period_start := pg_catalog.date_trunc('month', v_business_date)::date;

  SELECT membership.user_id
  INTO v_actor_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'super_admin'
  ORDER BY membership.created_at, membership.id
  LIMIT 1;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    p_lease_id,
    v_period_start,
    v_business_date,
    p_generation_source,
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.try_current_month_rent(
  uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.try_current_month_rent(
  uuid, uuid, text, timestamptz
) IS
  'Generates the current rent month only from an effective Lease-owned calculation timezone; a missing rule records billing_setup_missing without consulting organization rent policy.';
