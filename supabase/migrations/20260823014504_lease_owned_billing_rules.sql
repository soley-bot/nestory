CREATE FUNCTION app_private.normalize_lease_billing_rule(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_on date,
  p_billing_rule jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_billing_recipient_kind text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'billingRecipientKind', '')
  ));
  v_billing_recipient_person_id uuid;
  v_charge_management_fee_when_active boolean;
  v_charge_through_lease_end boolean;
  v_collection_route text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'collectionRoute', '')
  ));
  v_final_period_prorated_amount numeric;
  v_first_period_prorated_amount numeric;
  v_full_management_fee_during_proration boolean;
  v_lease_end_proration_rule text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'leaseEndProrationRule', '')
  ));
  v_lease_start_proration_rule text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'leaseStartProrationRule', '')
  ));
  v_management_fee_mode text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'managementFeeMode', '')
  ));
  v_management_fee_value numeric;
  v_mid_period_rent_change_rule text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'midPeriodRentChangeRule', '')
  ));
  v_property_id uuid;
  v_rent_calculation_timezone text := pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'rentCalculationTimezone', '')
  );
  v_short_month_due_day_rule text := lower(pg_catalog.btrim(
    coalesce(p_billing_rule ->> 'shortMonthDueDayRule', '')
  ));
BEGIN
  IF p_organization_id IS NULL
    OR p_effective_on IS NULL
    OR pg_catalog.jsonb_typeof(p_billing_rule) IS DISTINCT FROM 'object'
    OR v_billing_recipient_kind NOT IN ('individual', 'company')
    OR v_collection_route NOT IN ('through_ips', 'direct_to_owner')
    OR v_management_fee_mode NOT IN ('flat', 'percentage')
    OR v_short_month_due_day_rule <> 'last_calendar_day'
    OR v_lease_start_proration_rule <> 'actual_days'
    OR v_lease_end_proration_rule <> 'actual_days'
    OR v_mid_period_rent_change_rule <> 'next_full_month'
    OR v_rent_calculation_timezone = '' THEN
    RAISE EXCEPTION 'Lease billing inputs are incomplete or invalid'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END IF;

  BEGIN
    v_billing_recipient_person_id :=
      NULLIF(p_billing_rule ->> 'billingRecipientPersonId', '')::uuid;
    v_management_fee_value :=
      NULLIF(p_billing_rule ->> 'managementFeeValue', '')::numeric;
    v_first_period_prorated_amount :=
      NULLIF(p_billing_rule ->> 'firstPeriodProratedAmount', '')::numeric;
    v_final_period_prorated_amount :=
      NULLIF(p_billing_rule ->> 'finalPeriodProratedAmount', '')::numeric;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Lease billing inputs are incomplete or invalid'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END;

  IF pg_catalog.jsonb_typeof(
      p_billing_rule -> 'chargeManagementFeeWhenActive'
    ) IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(
      p_billing_rule -> 'fullManagementFeeDuringProration'
    ) IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(
      p_billing_rule -> 'chargeThroughLeaseEnd'
    ) IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Lease billing fee behavior must be explicit'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END IF;

  v_charge_management_fee_when_active :=
    (p_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean;
  v_full_management_fee_during_proration :=
    (p_billing_rule ->> 'fullManagementFeeDuringProration')::boolean;
  v_charge_through_lease_end :=
    (p_billing_rule ->> 'chargeThroughLeaseEnd')::boolean;

  IF v_billing_recipient_person_id IS NULL
    OR v_management_fee_value IS NULL
    OR v_management_fee_value < 0
    OR (
      v_management_fee_mode = 'percentage'
      AND v_management_fee_value > 100
    )
    OR (
      v_management_fee_mode = 'flat'
      AND v_management_fee_value IS DISTINCT FROM
        pg_catalog.round(v_management_fee_value, 2)
    )
    OR (
      v_management_fee_mode = 'percentage'
      AND v_management_fee_value IS DISTINCT FROM
        pg_catalog.round(v_management_fee_value, 4)
    )
    OR coalesce(v_first_period_prorated_amount, 0) < 0
    OR coalesce(v_final_period_prorated_amount, 0) < 0
    OR (
      v_first_period_prorated_amount IS NOT NULL
      AND v_first_period_prorated_amount IS DISTINCT FROM
        pg_catalog.round(v_first_period_prorated_amount, 2)
    )
    OR (
      v_final_period_prorated_amount IS NOT NULL
      AND v_final_period_prorated_amount IS DISTINCT FROM
        pg_catalog.round(v_final_period_prorated_amount, 2)
    ) THEN
    RAISE EXCEPTION 'Lease billing inputs are incomplete or invalid'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS timezone
    WHERE timezone.name = v_rent_calculation_timezone
  ) THEN
    RAISE EXCEPTION 'Lease billing timezone is invalid'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_timezone_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = v_billing_recipient_person_id
      AND person.party_type = v_billing_recipient_kind
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Billing recipient does not match the selected recipient type'
      USING ERRCODE = '23503', DETAIL = 'lease_billing_recipient_invalid';
  END IF;

  IF p_lease_id IS NOT NULL THEN
    SELECT lease.property_id
    INTO v_property_id
    FROM public.leases AS lease
    WHERE lease.organization_id = p_organization_id
      AND lease.id = p_lease_id
      AND lease.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
    END IF;

    PERFORM app_private.assert_person_in_property_branch(
      p_organization_id,
      v_property_id,
      v_billing_recipient_person_id
    );

    IF v_collection_route = 'direct_to_owner'
      AND NOT EXISTS (
        SELECT 1
        FROM public.property_owners AS owner
        WHERE owner.organization_id = p_organization_id
          AND owner.property_id = v_property_id
          AND owner.is_primary
          AND owner.archived_at IS NULL
          AND (owner.started_on IS NULL OR owner.started_on <= p_effective_on)
          AND (owner.ended_on IS NULL OR owner.ended_on >= p_effective_on)
      ) THEN
      RAISE EXCEPTION
        'Property must have one active owner before direct collection is used'
        USING ERRCODE = '23514', DETAIL = 'lease_billing_owner_required';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'billingRecipientKind', v_billing_recipient_kind,
    'billingRecipientPersonId', v_billing_recipient_person_id,
    'collectionRoute', v_collection_route,
    'managementFeeMode', v_management_fee_mode,
    'managementFeeValue', v_management_fee_value,
    'chargeManagementFeeWhenActive',
      v_charge_management_fee_when_active,
    'fullManagementFeeDuringProration',
      v_full_management_fee_during_proration,
    'rentCalculationTimezone', v_rent_calculation_timezone,
    'shortMonthDueDayRule', v_short_month_due_day_rule,
    'leaseStartProrationRule', v_lease_start_proration_rule,
    'leaseEndProrationRule', v_lease_end_proration_rule,
    'midPeriodRentChangeRule', v_mid_period_rent_change_rule,
    'chargeThroughLeaseEnd', v_charge_through_lease_end,
    'firstPeriodProratedAmount', v_first_period_prorated_amount,
    'finalPeriodProratedAmount', v_final_period_prorated_amount
  );
END;
$$;

CREATE FUNCTION app_private.write_initial_lease_billing_rule(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_billing_rule jsonb,
  p_actor_id uuid,
  p_activity_action text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_billing_term_id uuid := gen_random_uuid();
  v_existing public.lease_billing_terms%ROWTYPE;
  v_existing_count integer;
  v_property_id uuid;
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_effective_from IS NULL
    OR p_effective_to IS NULL
    OR p_effective_to < p_effective_from
    OR p_actor_id IS NULL
    OR pg_catalog.length(pg_catalog.btrim(coalesce(p_activity_action, ''))) < 3
  THEN
    RAISE EXCEPTION 'Initial lease billing write is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'lease_billing_rule_v2', p_organization_id, p_lease_id
      ),
      0
    )
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_count
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL;

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'Initial billing rule cannot overwrite billing history'
      USING ERRCODE = '55000', DETAIL = 'lease_billing_history_exists';
  END IF;

  SELECT billing.*
  INTO v_existing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
  ORDER BY billing.effective_from, billing.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.lease_id = p_lease_id
        AND invoice.billing_term_id = v_existing.id
    ) THEN
      RAISE EXCEPTION 'A used billing rule cannot be overwritten'
        USING ERRCODE = '55000', DETAIL = 'lease_billing_rule_used';
    END IF;

    UPDATE public.lease_billing_terms AS billing
    SET
      property_id = v_property_id,
      effective_from = p_effective_from,
      effective_to = p_effective_to,
      collection_route = p_billing_rule ->> 'collectionRoute',
      management_fee_mode = p_billing_rule ->> 'managementFeeMode',
      management_fee_value =
        (p_billing_rule ->> 'managementFeeValue')::numeric,
      charge_management_fee_when_active =
        (p_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean,
      full_management_fee_during_proration =
        (p_billing_rule ->> 'fullManagementFeeDuringProration')::boolean,
      billing_recipient_kind =
        p_billing_rule ->> 'billingRecipientKind',
      billing_recipient_person_id =
        (p_billing_rule ->> 'billingRecipientPersonId')::uuid,
      first_period_prorated_amount =
        (p_billing_rule ->> 'firstPeriodProratedAmount')::numeric,
      final_period_prorated_amount =
        (p_billing_rule ->> 'finalPeriodProratedAmount')::numeric,
      rent_calculation_timezone =
        p_billing_rule ->> 'rentCalculationTimezone',
      short_month_due_day_rule =
        p_billing_rule ->> 'shortMonthDueDayRule',
      lease_start_proration_rule =
        p_billing_rule ->> 'leaseStartProrationRule',
      lease_end_proration_rule =
        p_billing_rule ->> 'leaseEndProrationRule',
      mid_period_rent_change_rule =
        p_billing_rule ->> 'midPeriodRentChangeRule',
      charge_through_lease_end =
        (p_billing_rule ->> 'chargeThroughLeaseEnd')::boolean,
      rule_source = 'lease_default_v1',
      supersedes_billing_term_id = NULL,
      superseded_at = NULL,
      superseded_by = NULL,
      confirmed_at = pg_catalog.clock_timestamp(),
      confirmed_by = p_actor_id,
      updated_by = p_actor_id
    WHERE billing.organization_id = p_organization_id
      AND billing.id = v_existing.id
    RETURNING billing.id INTO v_billing_term_id;
  ELSE
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
    VALUES (
      v_billing_term_id,
      p_organization_id,
      p_lease_id,
      v_property_id,
      p_effective_from,
      p_effective_to,
      p_billing_rule ->> 'collectionRoute',
      p_billing_rule ->> 'managementFeeMode',
      (p_billing_rule ->> 'managementFeeValue')::numeric,
      (p_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean,
      (p_billing_rule ->> 'fullManagementFeeDuringProration')::boolean,
      p_billing_rule ->> 'billingRecipientKind',
      (p_billing_rule ->> 'billingRecipientPersonId')::uuid,
      (p_billing_rule ->> 'firstPeriodProratedAmount')::numeric,
      (p_billing_rule ->> 'finalPeriodProratedAmount')::numeric,
      p_billing_rule ->> 'rentCalculationTimezone',
      p_billing_rule ->> 'shortMonthDueDayRule',
      p_billing_rule ->> 'leaseStartProrationRule',
      p_billing_rule ->> 'leaseEndProrationRule',
      p_billing_rule ->> 'midPeriodRentChangeRule',
      (p_billing_rule ->> 'chargeThroughLeaseEnd')::boolean,
      'lease_default_v1',
      pg_catalog.clock_timestamp(),
      p_actor_id,
      p_actor_id,
      p_actor_id
    );
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  SELECT
    p_organization_id,
    p_actor_id,
    'lease_billing_term',
    v_billing_term_id,
    p_activity_action,
    CASE
      WHEN v_existing.id IS NULL THEN NULL
      ELSE pg_catalog.to_jsonb(v_existing)
    END,
    pg_catalog.to_jsonb(billing)
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.id = v_billing_term_id;

  RETURN v_billing_term_id;
END;
$$;

CREATE FUNCTION public.create_lease_with_billing_rules(
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
  p_billing_rule jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_billing_rule jsonb;
  v_billing_term_id uuid;
  v_claim record;
  v_lease_id uuid;
  v_relationship_result jsonb;
  v_result jsonb;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM app_private.assert_lease_creation_scope(
    p_organization_id,
    p_property_id,
    p_primary_tenant_person_id,
    p_relationship_payload
  );

  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    NULL,
    p_lease_start_date,
    p_billing_rule
  );

  PERFORM app_private.assert_person_in_property_branch(
    p_organization_id,
    p_property_id,
    (v_billing_rule ->> 'billingRecipientPersonId')::uuid
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_lease_with_billing_rules',
    p_idempotency_key,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'primaryTenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status,
      'relationshipPayload', p_relationship_payload,
      'billingRule', v_billing_rule
    )
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  IF p_unit_id IS NULL THEN
    v_relationship_result := public.create_property_lease(
      p_organization_id,
      p_property_id,
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
      p_idempotency_key
    );
  ELSE
    v_relationship_result := public.create_lease_with_relationships(
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
  END IF;

  v_lease_id := (v_relationship_result ->> 'leaseId')::uuid;

  SELECT term.id
  INTO v_term_id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = v_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.archived_at IS NULL
  ORDER BY term.term_sequence, term.id
  LIMIT 1
  FOR SHARE;

  IF v_term_id IS NULL THEN
    RAISE EXCEPTION 'Lease term not found' USING ERRCODE = '23503';
  END IF;

  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    v_lease_id,
    p_lease_start_date,
    v_billing_rule
  );

  v_billing_term_id := app_private.write_initial_lease_billing_rule(
    p_organization_id,
    v_lease_id,
    p_lease_start_date,
    p_lease_end_date,
    v_billing_rule,
    v_actor_id,
    'lease_billing_created'
  );

  v_result := v_relationship_result || pg_catalog.jsonb_build_object(
    'leaseId', v_lease_id,
    'termId', v_term_id,
    'billingTermId', v_billing_term_id
  );

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

CREATE FUNCTION public.update_lease_with_billing_rules(
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
  p_billing_rule jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_billing_rule jsonb;
  v_billing_term_id uuid;
  v_claim record;
  v_lease public.leases%ROWTYPE;
  v_result jsonb;
  v_term_id uuid;
BEGIN
  v_actor_id := app_private.assert_lease_edit_permission(
    p_organization_id,
    p_lease_id
  );

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_lease.status <> 'draft'
    OR lower(pg_catalog.btrim(coalesce(p_lease_status, ''))) <> 'draft'
    OR lower(pg_catalog.btrim(coalesce(p_term_status, ''))) <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft Lease can edit its initial billing rule'
      USING ERRCODE = '55000', DETAIL = 'lease_billing_draft_required';
  END IF;

  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    p_lease_id,
    p_lease_start_date,
    p_billing_rule
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'update_lease_with_billing_rules',
    p_idempotency_key,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'leaseId', p_lease_id,
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'primaryTenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status,
      'billingRule', v_billing_rule
    )
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  PERFORM public.update_lease_with_authoritative_term(
    p_lease_id,
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
    p_idempotency_key
  );

  SELECT term.id
  INTO v_term_id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.archived_at IS NULL
    AND term.status <> 'superseded'
    AND (
      term.start_date,
      term.end_date,
      term.rent_amount,
      term.rent_currency,
      term.rent_due_day,
      term.payment_frequency,
      term.status
    ) IS NOT DISTINCT FROM (
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      lower(pg_catalog.btrim(p_payment_frequency)),
      lower(pg_catalog.btrim(p_term_status))
    )
  ORDER BY term.term_sequence DESC, term.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_term_id IS NULL THEN
    RAISE EXCEPTION 'Updated Lease term not found' USING ERRCODE = '23503';
  END IF;

  v_billing_term_id := app_private.write_initial_lease_billing_rule(
    p_organization_id,
    p_lease_id,
    p_lease_start_date,
    p_lease_end_date,
    v_billing_rule,
    v_actor_id,
    'lease_billing_draft_updated'
  );

  v_result := pg_catalog.jsonb_build_object(
    'leaseId', p_lease_id,
    'termId', v_term_id,
    'billingTermId', v_billing_term_id
  );

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

CREATE FUNCTION public.save_lease_billing_rules(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_rule jsonb,
  p_expected_current_billing_rule_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_billing_count integer;
  v_billing_rule jsonb;
  v_billing_term_id uuid;
  v_candidate_effective_from date;
  v_claim record;
  v_current public.lease_billing_terms%ROWTYPE;
  v_current_is_complete boolean;
  v_has_used_rule boolean;
  v_lease public.leases%ROWTYPE;
  v_latest_billed_month date;
  v_local_date date;
  v_result jsonb;
  v_term_end date;
  v_term_start date;
BEGIN
  v_actor_id := app_private.assert_lease_edit_permission(
    p_organization_id,
    p_lease_id
  );

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  SELECT pg_catalog.min(term.start_date), pg_catalog.max(term.end_date)
  INTO v_term_start, v_term_end
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status <> 'superseded'
    AND term.archived_at IS NULL;

  IF v_term_start IS NULL OR v_term_end IS NULL THEN
    RAISE EXCEPTION 'Lease term not found' USING ERRCODE = '23503';
  END IF;

  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    p_lease_id,
    v_term_start,
    p_billing_rule
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'lease_billing_rule_v2', p_organization_id, p_lease_id
      ),
      0
    )
  );

  PERFORM billing.id
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
  ORDER BY billing.effective_from, billing.id
  FOR UPDATE;

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'save_lease_billing_rules',
    p_idempotency_key,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'leaseId', p_lease_id,
      'billingRule', v_billing_rule,
      'expectedCurrentBillingRuleId', p_expected_current_billing_rule_id
    )
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_billing_count
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL;

  IF v_billing_count = 0 THEN
    IF p_expected_current_billing_rule_id IS NOT NULL THEN
      RAISE EXCEPTION 'The billing rule changed after the page loaded'
        USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
    END IF;

    v_billing_term_id := app_private.write_initial_lease_billing_rule(
      p_organization_id,
      p_lease_id,
      v_term_start,
      v_term_end,
      v_billing_rule,
      v_actor_id,
      'lease_billing_repaired'
    );
    v_result := pg_catalog.jsonb_build_object(
      'leaseId', p_lease_id,
      'billingTermId', v_billing_term_id,
      'effectiveFrom', v_term_start,
      'mode', 'repair'
    );
  ELSE
    IF p_expected_current_billing_rule_id IS NULL THEN
      RAISE EXCEPTION 'Choose the billing rule being changed'
        USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
    END IF;

    SELECT billing.*
    INTO v_current
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.id = p_expected_current_billing_rule_id
      AND billing.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The billing rule changed after the page loaded'
        USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
    END IF;

    v_current_is_complete :=
      v_current.collection_route IS NOT NULL
      AND v_current.management_fee_mode IS NOT NULL
      AND v_current.management_fee_value IS NOT NULL
      AND v_current.billing_recipient_kind IS NOT NULL
      AND v_current.billing_recipient_person_id IS NOT NULL
      AND v_current.rent_calculation_timezone IS NOT NULL
      AND v_current.short_month_due_day_rule IS NOT NULL
      AND v_current.lease_start_proration_rule IS NOT NULL
      AND v_current.lease_end_proration_rule IS NOT NULL
      AND v_current.mid_period_rent_change_rule IS NOT NULL
      AND v_current.charge_through_lease_end IS NOT NULL;

    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.lease_id = p_lease_id
        AND invoice.billing_term_id = v_current.id
    )
    INTO v_has_used_rule;

    IF (v_lease.status = 'draft' OR NOT v_current_is_complete)
      AND NOT v_has_used_rule THEN
      v_billing_term_id := app_private.write_initial_lease_billing_rule(
        p_organization_id,
        p_lease_id,
        v_term_start,
        v_term_end,
        v_billing_rule,
        v_actor_id,
        CASE
          WHEN v_lease.status = 'draft' THEN 'lease_billing_draft_updated'
          ELSE 'lease_billing_repaired'
        END
      );
      v_result := pg_catalog.jsonb_build_object(
        'leaseId', p_lease_id,
        'billingTermId', v_billing_term_id,
        'effectiveFrom', v_term_start,
        'mode', CASE
          WHEN v_lease.status = 'draft' THEN 'draft_update'
          ELSE 'repair'
        END
      );
    ELSE
      IF v_lease.status NOT IN ('active', 'notice_given') THEN
        RAISE EXCEPTION 'Billing rules cannot change for this Lease status'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_status_invalid';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.lease_billing_terms AS billing
        WHERE billing.organization_id = p_organization_id
          AND billing.lease_id = p_lease_id
          AND billing.archived_at IS NULL
          AND billing.id <> v_current.id
          AND billing.superseded_at IS NULL
          AND billing.effective_from > v_current.effective_from
      ) THEN
        RAISE EXCEPTION 'A future billing rule is already scheduled'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_future_rule_exists';
      END IF;

      v_local_date := (
        pg_catalog.clock_timestamp()
        AT TIME ZONE (v_current.rent_calculation_timezone)
      )::date;

      IF v_local_date NOT BETWEEN v_current.effective_from AND v_current.effective_to
        AND v_term_start NOT BETWEEN
          v_current.effective_from AND v_current.effective_to THEN
        RAISE EXCEPTION 'The billing rule changed after the page loaded'
          USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
      END IF;

      SELECT pg_catalog.max(invoice.billing_period_start)
      INTO v_latest_billed_month
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.lease_id = p_lease_id;

      v_candidate_effective_from := (
        pg_catalog.date_trunc('month', v_local_date::timestamp)
        + interval '1 month'
      )::date;

      IF v_latest_billed_month IS NOT NULL THEN
        v_candidate_effective_from := greatest(
          v_candidate_effective_from,
          (
            pg_catalog.date_trunc(
              'month', v_latest_billed_month::timestamp
            ) + interval '1 month'
          )::date
        );
      END IF;

      IF v_candidate_effective_from <= v_current.effective_from
        OR v_candidate_effective_from > v_current.effective_to
        OR v_candidate_effective_from > v_term_end THEN
        RAISE EXCEPTION 'There is no unbilled future month in this Lease'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_no_future_month';
      END IF;

      v_billing_rule := app_private.normalize_lease_billing_rule(
        p_organization_id,
        p_lease_id,
        v_candidate_effective_from,
        p_billing_rule
      );

      UPDATE public.lease_billing_terms AS billing
      SET
        effective_to = v_candidate_effective_from - 1,
        superseded_at = pg_catalog.clock_timestamp(),
        superseded_by = v_actor_id,
        updated_by = v_actor_id
      WHERE billing.organization_id = p_organization_id
        AND billing.id = v_current.id;

      v_billing_term_id := gen_random_uuid();

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
        supersedes_billing_term_id,
        confirmed_at,
        confirmed_by,
        created_by,
        updated_by
      )
      VALUES (
        v_billing_term_id,
        p_organization_id,
        p_lease_id,
        v_lease.property_id,
        v_candidate_effective_from,
        v_term_end,
        v_billing_rule ->> 'collectionRoute',
        v_billing_rule ->> 'managementFeeMode',
        (v_billing_rule ->> 'managementFeeValue')::numeric,
        (v_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean,
        (v_billing_rule ->> 'fullManagementFeeDuringProration')::boolean,
        v_billing_rule ->> 'billingRecipientKind',
        (v_billing_rule ->> 'billingRecipientPersonId')::uuid,
        (v_billing_rule ->> 'firstPeriodProratedAmount')::numeric,
        (v_billing_rule ->> 'finalPeriodProratedAmount')::numeric,
        v_billing_rule ->> 'rentCalculationTimezone',
        v_billing_rule ->> 'shortMonthDueDayRule',
        v_billing_rule ->> 'leaseStartProrationRule',
        v_billing_rule ->> 'leaseEndProrationRule',
        v_billing_rule ->> 'midPeriodRentChangeRule',
        (v_billing_rule ->> 'chargeThroughLeaseEnd')::boolean,
        'lease_default_v1',
        v_current.id,
        pg_catalog.clock_timestamp(),
        v_actor_id,
        v_actor_id,
        v_actor_id
      );

      INSERT INTO public.activity_logs (
        organization_id,
        actor_id,
        entity_type,
        entity_id,
        action,
        previous_values,
        new_values
      )
      SELECT
        p_organization_id,
        v_actor_id,
        'lease_billing_term',
        v_billing_term_id,
        'lease_billing_changed',
        pg_catalog.to_jsonb(v_current),
        pg_catalog.to_jsonb(billing)
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = p_organization_id
        AND billing.id = v_billing_term_id;

      v_result := pg_catalog.jsonb_build_object(
        'leaseId', p_lease_id,
        'billingTermId', v_billing_term_id,
        'supersedesBillingTermId', v_current.id,
        'effectiveFrom', v_candidate_effective_from,
        'mode', 'scheduled_replacement'
      );
    END IF;
  END IF;

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.normalize_lease_billing_rule(
  uuid, uuid, date, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.write_initial_lease_billing_rule(
  uuid, uuid, date, date, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) TO authenticated;

COMMENT ON FUNCTION public.create_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb, text
) IS
  'Atomically creates a Lease, authoritative term, relationships, deposit, and complete Lease-owned billing rule.';

COMMENT ON FUNCTION public.update_lease_with_billing_rules(
  uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, text
) IS
  'Atomically edits a draft Lease and its unused initial Lease-owned billing rule.';

COMMENT ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) IS
  'Repairs incomplete Lease billing or schedules an active replacement at the next unbilled month without changing invoice snapshots.';

-- Lease-owned rent generation stores the rule's fee inputs on the immutable
-- invoice snapshot. The fee remains tenant-invisible and is recognized through
-- management_fee_occurrences and its owner charge.
ALTER TABLE public.tenant_invoices
  DROP CONSTRAINT tenant_invoices_generation_provenance_check;

ALTER TABLE public.tenant_invoices
  ADD CONSTRAINT tenant_invoices_generation_provenance_check CHECK (
    generation_source IS NULL
    OR (
      generation_source IN ('scheduled', 'activation_catch_up', 'manual_recovery')
      AND lease_term_id IS NOT NULL
      AND rent_policy_version_id IS NOT NULL
      AND generated_at IS NOT NULL
      AND base_rent_amount > 0
      AND is_prorated IS NOT NULL
      AND management_fee_mode IN ('flat', 'percentage')
      AND management_fee_value >= 0
      AND management_fee_amount >= 0
    )
    OR (
      generation_source = 'lease_rules_v1'
      AND lease_term_id IS NOT NULL
      AND rent_policy_version_id IS NULL
      AND generated_at IS NOT NULL
      AND base_rent_amount > 0
      AND is_prorated IS NOT NULL
      AND (
        (
          management_fee_mode IN ('flat', 'percentage')
          AND management_fee_value >= 0
          AND management_fee_amount >= 0
        )
        OR (
          management_fee_mode IS NULL
          AND management_fee_value IS NULL
          AND coalesce(management_fee_amount, 0) = 0
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION app_private.generate_simple_lease_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_reason text,
  p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_billing public.lease_billing_terms%ROWTYPE;
  v_days_in_month integer;
  v_due_date date;
  v_effective_date date;
  v_fee_amount numeric(14,2) := 0;
  v_fee_base numeric(14,2);
  v_income_item_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_is_prorated boolean := false;
  v_legacy_income_item_id uuid;
  v_legacy_line_id uuid;
  v_lease record;
  v_line_id uuid := gen_random_uuid();
  v_occupant_labels text[];
  v_period_end date;
  v_recipient public.people%ROWTYPE;
  v_rent_amount numeric(14,2);
  v_segment_rule text := 'full_period';
  v_term public.lease_terms%ROWTYPE;
  v_term_count integer;
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_issue_date IS NULL
    OR p_generation_reason NOT IN (
      'scheduled', 'activation_catch_up', 'manual_recovery'
    )
    OR p_billing_period_start IS DISTINCT FROM
      pg_catalog.date_trunc('month', p_billing_period_start)::date THEN
    RAISE EXCEPTION 'A Lease, monthly billing period, issue date, and generation source are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL OR NOT (
    EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = p_actor_id
        AND membership.role = 'super_admin'
    )
    OR app_private.is_checked_current_rent_retry_generation(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_reason,
      p_actor_id
    )
  ) THEN
    RAISE EXCEPTION 'A Super Admin is required for automatic rent generation'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'lease_derived_rent_v1', p_organization_id, p_lease_id,
        p_billing_period_start
      ),
      0
    )
  );

  SELECT invoice.id
  INTO v_invoice_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.lease_id = p_lease_id
    AND invoice.billing_period_start = p_billing_period_start
    AND EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = invoice.organization_id
        AND line.invoice_id = invoice.id
        AND line.line_type = 'rent'
    )
  FOR UPDATE;

  IF FOUND THEN
    -- An issued invoice is evidence. Idempotent retries return it unchanged.
    RETURN v_invoice_id;
  END IF;
  v_invoice_id := gen_random_uuid();

  SELECT lease.*, tenant.display_name AS tenant_name
  INTO v_lease
  FROM public.leases AS lease
  JOIN public.people AS tenant
    ON tenant.organization_id = lease.organization_id
    AND tenant.id = lease.primary_tenant_person_id
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR SHARE OF lease, tenant;

  IF NOT FOUND OR (
    p_generation_reason = 'manual_recovery'
    AND v_lease.status NOT IN ('active', 'notice_given', 'ended', 'terminated')
  ) OR (
    p_generation_reason <> 'manual_recovery'
    AND v_lease.status NOT IN ('active', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'The Lease is not eligible for this rent month'
      USING ERRCODE = '23514';
  END IF;

  v_period_end := (p_billing_period_start + interval '1 month - 1 day')::date;

  IF app_private.is_financial_month_locked(
    p_organization_id, p_billing_period_start
  ) THEN
    RAISE EXCEPTION 'This month is locked; unlock it before generating rent'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_term_count
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (p_generation_reason = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated'))
      OR (p_generation_reason <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming'))
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start;

  IF v_term_count < 1 THEN
    RAISE EXCEPTION 'Confirm one authoritative Lease term for this month'
      USING ERRCODE = '23514';
  END IF;

  SELECT term.*
  INTO v_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (p_generation_reason = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated'))
      OR (p_generation_reason <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming'))
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY
    CASE WHEN term.start_date <= p_billing_period_start THEN 0 ELSE 1 END,
    term.start_date,
    term.term_sequence,
    term.id
  LIMIT 1;

  IF EXISTS (
    SELECT 1
    FROM public.lease_terms AS term
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.authority_kind = 'authoritative'
      AND (
        (p_generation_reason = 'manual_recovery'
          AND term.status IN ('active', 'upcoming', 'expired', 'terminated'))
        OR (p_generation_reason <> 'manual_recovery'
          AND term.status IN ('active', 'upcoming'))
      )
      AND term.archived_at IS NULL
      AND term.start_date <= v_period_end
      AND term.end_date >= p_billing_period_start
      AND (
        term.payment_frequency IS DISTINCT FROM 'monthly'
        OR term.rent_currency IS DISTINCT FROM v_term.rent_currency
      )
  ) THEN
    RAISE EXCEPTION 'Automatic rent requires monthly terms in one currency'
      USING ERRCODE = '0A000';
  END IF;

  v_effective_date := greatest(
    p_billing_period_start, v_term.start_date
  );

  SELECT billing.*
  INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND billing.rule_source = 'lease_default_v1'
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complete the Lease billing setup before generating rent'
      USING ERRCODE = '23514';
  END IF;

  IF v_billing.collection_route IS NULL
    OR v_billing.management_fee_mode IS NULL
    OR v_billing.management_fee_value IS NULL
    OR v_billing.billing_recipient_kind IS NULL
    OR v_billing.billing_recipient_person_id IS NULL
    OR v_billing.rent_calculation_timezone IS NULL
    OR v_billing.short_month_due_day_rule IS NULL
    OR v_billing.lease_start_proration_rule IS NULL
    OR v_billing.lease_end_proration_rule IS NULL
    OR v_billing.mid_period_rent_change_rule IS NULL
    OR v_billing.charge_through_lease_end IS NULL THEN
    -- The pre-contract property-only RPC left an incomplete default row and
    -- called this private helper directly. Preserve that historical path until
    -- Finance repairs it into a complete Lease-owned rule.
    v_invoice_id := app_private.generate_simple_lease_rent_invoice_before_segment_completion(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_reason,
      p_actor_id
    );

    IF v_term_count < 2
      OR v_billing.mid_period_rent_change_rule <> 'next_full_month' THEN
      RETURN v_invoice_id;
    END IF;

    SELECT line.id, line.income_item_id
    INTO STRICT v_legacy_line_id, v_legacy_income_item_id
    FROM public.tenant_invoice_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.invoice_id = v_invoice_id
      AND line.line_type = 'rent'
    ORDER BY line.sort_order, line.id
    LIMIT 1;

    PERFORM pg_catalog.set_config(
      'app.rent_generation_context', 'lease-derived-v1', true
    );
    PERFORM pg_catalog.set_config(
      'app.rent_segment_repair_context', 'next-full-month-v1', true
    );

    UPDATE public.finance_income_items
    SET amount_due = v_term.rent_amount,
        updated_by = p_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_legacy_income_item_id;

    UPDATE public.tenant_invoice_lines
    SET amount = v_term.rent_amount,
        description = pg_catalog.to_char(p_billing_period_start, 'Mon YYYY')
    WHERE organization_id = p_organization_id
      AND id = v_legacy_line_id;

    UPDATE public.tenant_invoices
    SET total_amount = v_term.rent_amount,
        lease_term_id = v_term.id,
        base_rent_amount = v_term.rent_amount,
        is_prorated = false
    WHERE organization_id = p_organization_id
      AND id = v_invoice_id;

    UPDATE public.tenant_invoice_rent_segments
    SET amount = v_term.rent_amount,
        proration_rule = 'next_full_period'
    WHERE organization_id = p_organization_id
      AND invoice_id = v_invoice_id
      AND lease_term_id = v_term.id;

    PERFORM pg_catalog.set_config(
      'app.rent_segment_repair_context', 'off', true
    );

    INSERT INTO public.tenant_invoice_rent_segments (
      organization_id, invoice_id, lease_id, lease_term_id, segment_order,
      segment_start, segment_end, full_period_amount, amount, proration_rule,
      created_by
    )
    SELECT
      p_organization_id,
      v_invoice_id,
      p_lease_id,
      term.id,
      coalesce((
        SELECT pg_catalog.max(existing.segment_order)
        FROM public.tenant_invoice_rent_segments AS existing
        WHERE existing.invoice_id = v_invoice_id
      ), 0) + pg_catalog.row_number() OVER (
        ORDER BY term.start_date, term.term_sequence, term.id
      )::integer,
      greatest(term.start_date, p_billing_period_start),
      least(term.end_date, v_period_end),
      term.rent_amount,
      0,
      'next_full_period',
      p_actor_id
    FROM public.lease_terms AS term
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.authority_kind = 'authoritative'
      AND term.status IN ('active', 'upcoming')
      AND term.archived_at IS NULL
      AND term.id <> v_term.id
      AND term.start_date <= v_period_end
      AND term.end_date >= p_billing_period_start
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_rent_segments AS existing
        WHERE existing.invoice_id = v_invoice_id
          AND existing.lease_term_id = term.id
      )
    ORDER BY term.start_date, term.term_sequence, term.id;

    RETURN v_invoice_id;
  END IF;

  SELECT person.*
  INTO v_recipient
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = v_billing.billing_recipient_person_id
    AND (p_generation_reason = 'manual_recovery' OR person.archived_at IS NULL);

  IF NOT FOUND
    OR v_recipient.party_type IS DISTINCT FROM v_billing.billing_recipient_kind THEN
    RAISE EXCEPTION 'The Lease billing recipient is no longer valid'
      USING ERRCODE = '23503';
  END IF;

  IF v_term.rent_due_day IS NULL OR v_term.rent_due_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Complete the rent due-day configuration before generating rent'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,
    v_lease.property_id,
    v_term.rent_currency,
    p_billing_period_start
  );

  v_days_in_month := extract(day FROM v_period_end)::integer;
  v_due_date := greatest(
    pg_catalog.make_date(
      extract(year FROM p_billing_period_start)::integer,
      extract(month FROM p_billing_period_start)::integer,
      least(v_term.rent_due_day, v_days_in_month)
    ),
    p_issue_date
  );
  v_rent_amount := v_term.rent_amount::numeric(14,2);

  IF v_term_count > 1 THEN
    -- The only currently supported lease-owned change rule keeps the opening
    -- monthly rate until the following month.
    v_is_prorated := false;
    v_segment_rule := 'next_full_period';
  ELSIF pg_catalog.date_trunc('month', v_term.start_date)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF pg_catalog.date_trunc('month', v_term.end_date)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF v_term.start_date > p_billing_period_start THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (v_period_end - v_term.start_date + 1)
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  ELSIF v_term.end_date < v_period_end THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (v_term.end_date - p_billing_period_start + 1)
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  END IF;

  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'The Lease rent amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF v_billing.charge_management_fee_when_active THEN
    v_fee_base := CASE
      WHEN v_is_prorated AND NOT v_billing.full_management_fee_during_proration
        THEN v_rent_amount
      ELSE v_term.rent_amount::numeric(14,2)
    END;
    v_fee_amount := CASE v_billing.management_fee_mode
      WHEN 'percentage' THEN pg_catalog.round(
        v_fee_base * v_billing.management_fee_value / 100,
        2
      )
      ELSE pg_catalog.round(v_billing.management_fee_value, 2)
    END;
  END IF;

  SELECT coalesce(
    pg_catalog.array_agg(
      person.display_name ORDER BY party.is_primary DESC, person.display_name
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS person
    ON person.organization_id = party.organization_id
    AND person.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN ('primary_tenant', 'co_tenant', 'authorized_occupant')
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND person.archived_at IS NULL;

  v_invoice_number := pg_catalog.concat(
    'INV-',
    pg_catalog.to_char(p_billing_period_start, 'YYYYMM'),
    '-',
    pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(v_invoice_id::text, '-', ''), 1, 8
    ))
  );

  PERFORM pg_catalog.set_config(
    'app.rent_generation_context', 'lease-derived-v1', true
  );

  INSERT INTO public.finance_income_items (
    id, organization_id, property_id, unit_id, lease_id, income_type,
    payer_person_id, payer_label, rent_billing_period_start, due_date,
    amount_due, amount_received, currency, status, description, reference,
    created_by, updated_by
  ) VALUES (
    v_income_item_id, p_organization_id, v_lease.property_id, v_lease.unit_id,
    p_lease_id, 'rent', v_recipient.id, v_recipient.display_name,
    p_billing_period_start, v_due_date, v_rent_amount, 0,
    v_term.rent_currency, 'open', 'Rent', v_invoice_number,
    p_actor_id, p_actor_id
  );

  INSERT INTO public.tenant_invoices (
    id, organization_id, invoice_number, property_id, unit_id, lease_id,
    billing_term_id, billing_period_start, billing_period_end, issue_date,
    due_date, collection_route, recipient_kind, recipient_person_id,
    recipient_label, occupant_labels, currency, total_amount, lease_term_id,
    rent_policy_version_id, generation_source, generated_at,
    base_rent_amount, is_prorated, management_fee_mode,
    management_fee_value, management_fee_amount, created_by
  ) VALUES (
    v_invoice_id, p_organization_id, v_invoice_number, v_lease.property_id,
    v_lease.unit_id, p_lease_id, v_billing.id, p_billing_period_start,
    v_period_end, p_issue_date, v_due_date, v_billing.collection_route,
    v_billing.billing_recipient_kind, v_recipient.id,
    v_recipient.display_name, v_occupant_labels, v_term.rent_currency,
    v_rent_amount, v_term.id, NULL, 'lease_rules_v1',
    pg_catalog.statement_timestamp(), v_term.rent_amount, v_is_prorated,
    v_billing.management_fee_mode, v_billing.management_fee_value,
    v_fee_amount, p_actor_id
  );

  INSERT INTO public.tenant_invoice_rent_segments (
    organization_id, invoice_id, lease_id, lease_term_id, segment_order,
    segment_start, segment_end, full_period_amount, amount, proration_rule,
    created_by
  )
  SELECT
    p_organization_id,
    v_invoice_id,
    p_lease_id,
    term.id,
    pg_catalog.row_number() OVER (
      ORDER BY term.start_date, term.term_sequence, term.id
    )::integer,
    greatest(term.start_date, p_billing_period_start),
    least(term.end_date, v_period_end),
    term.rent_amount,
    CASE
      WHEN v_term_count = 1 THEN v_rent_amount
      WHEN term.id = v_term.id THEN v_rent_amount
      ELSE 0::numeric(14,2)
    END,
    CASE WHEN v_term_count = 1 THEN v_segment_rule ELSE 'next_full_period' END,
    p_actor_id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (p_generation_reason = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated'))
      OR (p_generation_reason <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming'))
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id;

  INSERT INTO public.tenant_invoice_lines (
    id, organization_id, invoice_id, income_item_id, line_type,
    customer_label, description, amount, internal_cost_amount,
    internal_markup_amount, sort_order, created_by
  ) VALUES (
    v_line_id, p_organization_id, v_invoice_id, v_income_item_id, 'rent',
    'Rent',
    pg_catalog.concat(
      pg_catalog.to_char(p_billing_period_start, 'Mon YYYY'),
      CASE WHEN v_is_prorated THEN ' - prorated' ELSE '' END
    ),
    v_rent_amount, NULL, 0, 1, p_actor_id
  );

  IF v_fee_amount > 0 THEN
    INSERT INTO public.management_fee_occurrences (
      organization_id, property_id, lease_id, tenant_invoice_id,
      billing_term_id, fee_date, amount, currency, fee_mode, fee_value,
      created_by
    ) VALUES (
      p_organization_id, v_lease.property_id, p_lease_id, v_invoice_id,
      v_billing.id, p_billing_period_start, v_fee_amount,
      v_term.rent_currency, v_billing.management_fee_mode,
      v_billing.management_fee_value, p_actor_id
    );
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id, p_actor_id, 'tenant_invoice', v_invoice_id,
    'lease_rent_generated',
    pg_catalog.jsonb_build_object(
      'leaseId', p_lease_id,
      'billingPeriodStart', p_billing_period_start,
      'leaseTermId', v_term.id,
      'billingTermId', v_billing.id,
      'generationSource', 'lease_rules_v1',
      'generationReason', p_generation_reason,
      'amount', v_rent_amount,
      'managementFeeAmount', v_fee_amount
    )
  );

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) IS
  'Generates a rent invoice entirely from the effective Lease term and Lease-owned billing rule while preserving the invoice and owner-fee snapshots as immutable evidence.';

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
    IF v_uses_lease_rule THEN
      v_invoice_id := app_private.generate_simple_lease_rent_invoice(
        p_organization_id,
        p_lease_id,
        p_billing_period_start,
        p_issue_date,
        p_generation_source,
        p_actor_id
      );
    ELSE
      -- Historical and unresolved leases keep their existing policy-backed path.
      v_invoice_id := app_private.generate_lease_rent_invoice(
        p_organization_id,
        p_lease_id,
        p_billing_period_start,
        p_issue_date,
        p_generation_source,
        p_actor_id
      );
    END IF;

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
    -- Legacy leases retain the organization/global policy business date.
    v_business_date := app_private.rent_business_date(
      p_organization_id, p_clock
    );
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
  'Resolves the rent business month from the effective Lease-owned calculation timezone before generating from that same rule.';
