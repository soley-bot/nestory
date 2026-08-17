CREATE OR REPLACE FUNCTION public.create_property_lease(
  p_organization_id uuid,
  p_property_id uuid,
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_lease_id uuid;
  v_occupancy_id uuid;
  v_party_id uuid;
  v_property public.properties%ROWTYPE;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT property.*
  INTO v_property
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
    AND property.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_property.rental_structure = 'undecided' THEN
    RAISE EXCEPTION 'Choose how the Property is rented before creating a Lease'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_property_rental_structure_required';
  END IF;

  IF v_property.rental_structure <> 'single_space' THEN
    RAISE EXCEPTION 'Choose a Unit before creating a Lease for this Property'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_unit_required_for_multi_unit_property';
  END IF;

  IF p_lease_start_date IS NULL
    OR p_lease_end_date IS NULL
    OR p_lease_end_date <= p_lease_start_date THEN
    RAISE EXCEPTION 'Lease end date must be after the start date'
      USING ERRCODE = '22007';
  END IF;

  IF p_rent_amount IS NULL OR p_rent_amount <= 0 THEN
    RAISE EXCEPTION 'Rent amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF p_rent_due_day IS NULL OR p_rent_due_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Rent due day must be from 1 to 31'
      USING ERRCODE = '22023';
  END IF;

  IF lower(trim(p_payment_frequency)) <> 'monthly' THEN
    RAISE EXCEPTION 'New Property Leases use monthly rent'
      USING ERRCODE = '22023';
  END IF;

  IF lower(trim(p_term_status)) <> 'draft'
    OR lower(trim(p_lease_status)) <> 'draft' THEN
    RAISE EXCEPTION 'A new Property Lease must start as a draft'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.people AS people
  JOIN public.person_roles AS roles
    ON roles.organization_id = people.organization_id
    AND roles.person_id = people.id
  WHERE people.organization_id = p_organization_id
    AND people.id = p_primary_tenant_person_id
    AND people.archived_at IS NULL
    AND roles.role = 'tenant'
    AND roles.status = 'active'
    AND roles.archived_at IS NULL
  FOR SHARE OF people, roles;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Tenant is required'
      USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_property_lease',
    p_idempotency_key,
    v_actor_id,
    jsonb_build_object(
      'propertyId', p_property_id,
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
    v_lease_id := (v_claim.result_ids ->> 'leaseId')::uuid;
  ELSIF EXISTS (
    SELECT 1
    FROM public.leases AS lease
    JOIN public.lease_terms AS term
      ON term.organization_id = lease.organization_id
      AND term.lease_id = lease.id
    WHERE lease.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease.unit_id IS NULL
      AND lease.archived_at IS NULL
      AND lease.status <> 'cancelled'
      AND term.archived_at IS NULL
      AND term.status IN ('draft', 'upcoming', 'active')
      AND term.start_date <= p_lease_end_date
      AND term.end_date >= p_lease_start_date
  ) THEN
    RAISE EXCEPTION 'This Property already has a Lease for those dates'
      USING
        ERRCODE = '23P01',
        DETAIL = 'property_lease_term_overlap';
  ELSE
    PERFORM set_config('app.lease_creation_context', 'checked-v1', true);

    v_lease_id := app_private.create_lease_record_internal(
      p_organization_id,
      p_property_id,
      NULL,
      p_primary_tenant_person_id,
      p_deposit_amount,
      p_deposit_currency,
      p_lease_status
    );

    PERFORM set_config('app.lease_creation_context', 'off', true);

    INSERT INTO public.lease_terms (
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
    VALUES (
      p_organization_id,
      v_lease_id,
      1,
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      lower(trim(p_payment_frequency)),
      lower(trim(p_term_status)),
      'authoritative',
      now(),
      v_actor_id,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_term_id;

    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      jsonb_build_object('leaseId', v_lease_id, 'termId', v_term_id)
    );
  END IF;

  SELECT party.id
  INTO v_party_id
  FROM public.lease_parties AS party
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = v_lease_id
    AND party.is_primary
  ORDER BY party.created_at, party.id
  LIMIT 1;

  SELECT occupancy.id
  INTO v_occupancy_id
  FROM public.lease_occupancies AS occupancy
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = v_lease_id
  ORDER BY occupancy.created_at, occupancy.id
  LIMIT 1;

  RETURN jsonb_build_object(
    'leaseId', v_lease_id,
    'partyId', v_party_id,
    'occupancyId', v_occupancy_id,
    'participantIds', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_lease(
  uuid, uuid, uuid, date, date, numeric, public.currency_code, integer,
  text, text, numeric, public.currency_code, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_property_lease(
  uuid, uuid, uuid, date, date, numeric, public.currency_code, integer,
  text, text, numeric, public.currency_code, text, text
) TO authenticated, service_role;
