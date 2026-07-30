CREATE OR REPLACE FUNCTION app_private.update_lease_with_authoritative_term_plan04(
  p_lease_id uuid,
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
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_current_term public.lease_terms%ROWTYPE;
  v_existing_lease public.leases%ROWTYPE;
  v_submitted_term public.lease_terms%ROWTYPE;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT leases.*
  INTO v_existing_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_existing_lease.property_id IS DISTINCT FROM p_property_id
    OR v_existing_lease.unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION
      'Lease property and unit scope cannot change through a term correction'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.property_id = p_property_id
    AND leases.unit_id IS NOT DISTINCT FROM p_unit_id
    AND leases.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease scope changed during the term mutation'
      USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'update_lease_with_authoritative_term',
    p_idempotency_key,
    v_actor_id,
    jsonb_build_object(
      'leaseId', p_lease_id,
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'tenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status
    )
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'leaseId')::uuid;
  END IF;

  IF lower(trim(p_lease_status)) IN ('ended', 'terminated', 'cancelled')
    AND lower(trim(p_term_status)) IN ('active', 'upcoming') THEN
    RAISE EXCEPTION
      'An inactive lease cannot retain an active or upcoming authoritative term'
      USING ERRCODE = '23514';
  END IF;

  SELECT terms.*
  INTO v_current_term
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.archived_at IS NULL
    AND terms.status NOT IN ('superseded', 'terminated')
  ORDER BY
    CASE
      WHEN terms.authority_kind = 'authoritative'
        AND current_date <@ terms.effective_range THEN 0
      WHEN terms.authority_kind = 'authoritative'
        AND terms.status = 'active' THEN 1
      WHEN terms.authority_kind = 'authoritative'
        AND terms.status = 'upcoming' THEN 2
      ELSE 3
    END,
    terms.term_sequence DESC
  LIMIT 1
  FOR UPDATE;

  SELECT terms.*
  INTO v_submitted_term
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.archived_at IS NULL
    AND terms.status NOT IN ('superseded', 'terminated')
    AND (
      terms.start_date,
      terms.end_date,
      terms.rent_amount,
      terms.rent_currency,
      terms.rent_due_day,
      terms.payment_frequency,
      terms.status
    ) IS NOT DISTINCT FROM (
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      lower(trim(p_payment_frequency)),
      lower(trim(p_term_status))
    )
  ORDER BY terms.term_sequence DESC
  LIMIT 1
  FOR UPDATE;

  IF v_submitted_term.id IS NOT NULL THEN
    v_term_id := v_submitted_term.id;
  ELSE
    PERFORM app_private.lock_open_lease_term_periods(
      p_organization_id,
      p_property_id,
      p_rent_currency,
      p_lease_start_date,
      p_lease_end_date
    );

    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      p_payment_frequency,
      p_term_status,
      v_current_term.id,
      p_idempotency_key || ':term'
    );
  END IF;

  PERFORM set_config(
    'app.lease_term_projection_context',
    'checked-v1',
    true
  );

  PERFORM public.update_lease(
    p_lease_id,
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    CASE
      WHEN v_submitted_term.id IS NULL
        AND lower(trim(p_term_status)) <> 'upcoming'
        THEN p_lease_start_date
      ELSE v_existing_lease.lease_start_date
    END,
    CASE
      WHEN v_submitted_term.id IS NULL
        AND lower(trim(p_term_status)) <> 'upcoming'
        THEN p_lease_end_date
      ELSE v_existing_lease.lease_end_date
    END,
    CASE
      WHEN v_submitted_term.id IS NULL
        AND lower(trim(p_term_status)) <> 'upcoming'
        THEN p_rent_amount
      ELSE v_existing_lease.monthly_rent_amount
    END,
    CASE
      WHEN v_submitted_term.id IS NULL
        AND lower(trim(p_term_status)) <> 'upcoming'
        THEN p_rent_currency
      ELSE v_existing_lease.monthly_rent_currency
    END,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status
  );

  PERFORM set_config(
    'app.lease_term_projection_context',
    'off',
    true
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    jsonb_build_object('leaseId', p_lease_id, 'termId', v_term_id)
  );

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.update_lease_with_authoritative_term_plan04(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    date,
    date,
    numeric,
    public.currency_code,
    integer,
    text,
    text,
    numeric,
    public.currency_code,
    text,
    text
  )
FROM PUBLIC, anon, authenticated, service_role;
