ALTER FUNCTION app_private.generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) RENAME TO generate_lease_rent_invoice_after_financial_lock;

REVOKE ALL ON FUNCTION app_private.generate_lease_rent_invoice_after_financial_lock(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.generate_lease_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_property_id uuid;
  v_primary_tenant_person_id uuid;
  v_currency public.currency_code;
  v_locked_currency public.currency_code;
  v_effective_date date;
  v_locked_effective_date date;
  v_period_end date;
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_issue_date IS NULL
    OR p_generation_source NOT IN (
      'scheduled',
      'activation_catch_up',
      'manual_recovery'
    )
    OR p_billing_period_start IS DISTINCT FROM
      pg_catalog.date_trunc('month', p_billing_period_start)::date THEN
    RETURN app_private.generate_lease_rent_invoice_after_financial_lock(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_source,
      p_actor_id
    );
  END IF;

  v_period_end := (
    p_billing_period_start + interval '1 month - 1 day'
  )::date;

  SELECT lease.property_id, lease.primary_tenant_person_id
  INTO v_property_id, v_primary_tenant_person_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL;

  SELECT
    term.rent_currency,
    greatest(p_billing_period_start, term.start_date)
  INTO v_currency, v_effective_date
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id
  LIMIT 1;

  IF v_property_id IS NULL OR v_currency IS NULL THEN
    RETURN app_private.generate_lease_rent_invoice_after_financial_lock(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_source,
      p_actor_id
    );
  END IF;

  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,
    v_property_id,
    v_currency,
    p_billing_period_start
  );

  PERFORM 1
  FROM public.leases AS lease
  JOIN public.people AS person
    ON person.organization_id = lease.organization_id
   AND person.id = lease.primary_tenant_person_id
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.property_id = v_property_id
    AND lease.primary_tenant_person_id = v_primary_tenant_person_id
    AND lease.archived_at IS NULL
  FOR SHARE OF lease, person;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease scope changed during rent generation'
      USING ERRCODE = '40001';
  END IF;

  SELECT
    term.rent_currency,
    greatest(p_billing_period_start, term.start_date)
  INTO v_locked_currency, v_locked_effective_date
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id
  LIMIT 1
  FOR SHARE;

  IF NOT FOUND
    OR v_locked_currency IS DISTINCT FROM v_currency
    OR v_locked_effective_date IS DISTINCT FROM v_effective_date THEN
    RAISE EXCEPTION 'Lease term scope changed during rent generation'
      USING ERRCODE = '40001';
  END IF;

  PERFORM term.id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id
  FOR SHARE;

  PERFORM billing.id
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND v_locked_effective_date BETWEEN
      billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1
  FOR SHARE;

  PERFORM policy.id
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id
    AND policy.lifecycle IN ('approved', 'superseded')
    AND policy.effective_from <= v_locked_effective_date
  ORDER BY policy.effective_from DESC, policy.version_number DESC, policy.id DESC
  LIMIT 1
  FOR SHARE;

  RETURN app_private.generate_lease_rent_invoice_after_financial_lock(
    p_organization_id,
    p_lease_id,
    p_billing_period_start,
    p_issue_date,
    p_generation_source,
    p_actor_id
  );
END;
$function$;

ALTER FUNCTION app_private.generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
