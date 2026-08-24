-- Repair only the selected unused legacy row. Historical predecessor and
-- future successor rows are immutable chain evidence and must not be routed
-- through the single-row initial-authority helper.
DO $patch_selected_legacy_repair$
DECLARE
  v_function constant regprocedure :=
    'public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old constant text := $old$
    IF (v_lease.status = 'draft' OR NOT v_current_is_complete)
      AND NOT v_has_used_rule THEN$old$;
  v_new constant text := $new$
    IF v_current.rule_source <> 'lease_default_v1'
      AND NOT v_has_used_rule THEN
      v_local_date := (
        pg_catalog.clock_timestamp()
        AT TIME ZONE coalesce(
          v_current.rent_calculation_timezone,
          v_billing_rule ->> 'rentCalculationTimezone'
        )
      )::date;

      IF v_lease.status IN ('active', 'notice_given')
        AND v_local_date NOT BETWEEN
          v_current.effective_from AND v_current.effective_to THEN
        RAISE EXCEPTION 'The billing rule changed after the page loaded'
          USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
      END IF;

      v_billing_rule := app_private.normalize_lease_billing_rule(
        p_organization_id,
        NULL,
        v_current.effective_from,
        p_billing_rule
      );
      PERFORM app_private.assert_lease_billing_destination(
        p_organization_id,
        v_lease.property_id,
        v_lease.unit_id,
        v_current.effective_from,
        v_billing_rule
      );

      IF EXISTS (
        SELECT 1
        FROM public.tenant_invoices AS invoice
        WHERE invoice.organization_id = p_organization_id
          AND invoice.lease_id = p_lease_id
          AND invoice.billing_term_id = v_current.id
      ) THEN
        RAISE EXCEPTION 'A used billing rule cannot be overwritten'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_rule_used';
      END IF;

      UPDATE public.lease_billing_terms AS billing
      SET
        property_id = v_lease.property_id,
        collection_route = v_billing_rule ->> 'collectionRoute',
        management_fee_mode = v_billing_rule ->> 'managementFeeMode',
        management_fee_value =
          (v_billing_rule ->> 'managementFeeValue')::numeric,
        charge_management_fee_when_active =
          (v_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean,
        full_management_fee_during_proration =
          (v_billing_rule ->> 'fullManagementFeeDuringProration')::boolean,
        billing_recipient_kind =
          v_billing_rule ->> 'billingRecipientKind',
        billing_recipient_person_id =
          (v_billing_rule ->> 'billingRecipientPersonId')::uuid,
        first_period_prorated_amount =
          (v_billing_rule ->> 'firstPeriodProratedAmount')::numeric,
        final_period_prorated_amount =
          (v_billing_rule ->> 'finalPeriodProratedAmount')::numeric,
        rent_calculation_timezone =
          v_billing_rule ->> 'rentCalculationTimezone',
        short_month_due_day_rule =
          v_billing_rule ->> 'shortMonthDueDayRule',
        lease_start_proration_rule =
          v_billing_rule ->> 'leaseStartProrationRule',
        lease_end_proration_rule =
          v_billing_rule ->> 'leaseEndProrationRule',
        mid_period_rent_change_rule =
          v_billing_rule ->> 'midPeriodRentChangeRule',
        charge_through_lease_end =
          (v_billing_rule ->> 'chargeThroughLeaseEnd')::boolean,
        rule_source = 'lease_default_v1',
        confirmed_at = pg_catalog.clock_timestamp(),
        confirmed_by = v_actor_id,
        updated_by = v_actor_id
      WHERE billing.organization_id = p_organization_id
        AND billing.lease_id = p_lease_id
        AND billing.id = v_current.id
        AND billing.archived_at IS NULL
        AND billing.rule_source <> 'lease_default_v1'
      RETURNING billing.id INTO v_billing_term_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The billing rule changed after the page loaded'
          USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
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
        v_actor_id,
        'lease_billing_term',
        v_billing_term_id,
        CASE
          WHEN v_lease.status = 'draft' THEN 'lease_billing_draft_updated'
          ELSE 'lease_billing_repaired'
        END,
        pg_catalog.to_jsonb(v_current),
        pg_catalog.to_jsonb(billing)
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = p_organization_id
        AND billing.lease_id = p_lease_id
        AND billing.id = v_billing_term_id;

      v_result := pg_catalog.jsonb_build_object(
        'leaseId', p_lease_id,
        'billingTermId', v_billing_term_id,
        'effectiveFrom', v_current.effective_from,
        'mode', CASE
          WHEN v_lease.status = 'draft' THEN 'draft_update'
          ELSE 'repair'
        END
      );
    ELSIF (v_lease.status = 'draft' OR NOT v_current_is_complete)
      AND NOT v_has_used_rule THEN$new$;
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) / pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected selected legacy repair anchor is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_selected_legacy_repair$;

-- The first rule owns its activation boundary in its own calculation
-- timezone, just as predecessor rules own later transition boundaries.
CREATE OR REPLACE FUNCTION app_private.resolve_lease_billing_clock(
  p_organization_id uuid,
  p_lease_id uuid,
  p_clock timestamptz
)
RETURNS TABLE(billing_term_id uuid, business_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.lease_billing_terms%ROWTYPE;
  v_next public.lease_billing_terms%ROWTYPE;
  v_predecessor_date date;
  v_utc_date date := (p_clock AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT billing.*
  INTO v_current
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.rule_source = 'lease_default_v1'
    AND billing.archived_at IS NULL
  ORDER BY billing.effective_from, billing.created_at, billing.id
  LIMIT 1;

  IF NOT FOUND THEN
    billing_term_id := NULL;
    business_date := v_utc_date;
    RETURN NEXT;
    RETURN;
  END IF;

  business_date := (
    p_clock AT TIME ZONE v_current.rent_calculation_timezone
  )::date;

  IF business_date < v_current.effective_from THEN
    billing_term_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  LOOP
    SELECT billing.*
    INTO v_next
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND billing.effective_from > v_current.effective_from
    ORDER BY billing.effective_from, billing.created_at, billing.id
    LIMIT 1;

    EXIT WHEN NOT FOUND;
    v_predecessor_date := (
      p_clock AT TIME ZONE v_current.rent_calculation_timezone
    )::date;
    EXIT WHEN v_predecessor_date < v_next.effective_from;
    v_current := v_next;
  END LOOP;

  business_date := greatest(
    (p_clock AT TIME ZONE v_current.rent_calculation_timezone)::date,
    v_current.effective_from
  );
  billing_term_id := CASE
    WHEN business_date BETWEEN v_current.effective_from AND v_current.effective_to
      THEN v_current.id
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)
  SET search_path = '';
ALTER FUNCTION app_private.resolve_lease_billing_clock(uuid,uuid,timestamptz)
  OWNER TO postgres;
ALTER FUNCTION app_private.resolve_lease_billing_clock(uuid,uuid,timestamptz)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.resolve_lease_billing_clock(
  uuid,uuid,timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
