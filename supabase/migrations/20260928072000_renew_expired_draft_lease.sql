-- Confirm continuous occupancy and a renewal together, retaining the old term.
CREATE FUNCTION public.renew_and_activate_draft_lease(
  p_organization_id uuid, p_lease_id uuid, p_expected_occupancy_id uuid,
  p_move_in_date date, p_renewal_end_date date, p_rent_amount numeric,
  p_idempotency_key text, p_expected_term_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_billing public.lease_billing_terms%ROWTYPE;
  v_today date := app_private.rent_business_date(p_organization_id);
  v_claim record;
  v_result jsonb;
BEGIN
  PERFORM app_private.assert_lease_permission(p_organization_id,p_lease_id,'leases.activate');
  PERFORM app_private.assert_lease_permission(p_organization_id,p_lease_id,'leases.change_terms');
  PERFORM pg_advisory_xact_lock(hashtextextended('lease_rent_correction:'||p_organization_id::text||':'||p_lease_id::text,0));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id,'renew_and_activate_draft_lease',p_idempotency_key,auth.uid(),
    jsonb_build_object('termId',p_expected_term_id,'leaseId',p_lease_id,'occupancyId',p_expected_occupancy_id,
      'moveIn',p_move_in_date,'renewalEnd',p_renewal_end_date,'rent',p_rent_amount));
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO v_lease FROM public.leases
    WHERE organization_id=p_organization_id AND id=p_lease_id FOR UPDATE;
  IF NOT FOUND OR v_lease.status <> 'draft' OR v_lease.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'lease_activation_stale_status' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_term FROM public.lease_terms
    WHERE organization_id=p_organization_id AND lease_id=p_lease_id
      AND id=p_expected_term_id AND authority_kind='authoritative' AND status='draft' AND archived_at IS NULL
    ORDER BY term_sequence DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_term.end_date >= v_today OR p_renewal_end_date < v_today
    OR p_move_in_date NOT BETWEEN v_term.start_date AND v_term.end_date
    OR p_move_in_date IS NULL OR p_renewal_end_date IS NULL
    OR p_rent_amount IS NULL OR p_rent_amount <= 0
    OR p_rent_amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'lease_renewal_dates_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_billing FROM public.lease_billing_terms
    WHERE organization_id=p_organization_id AND lease_id=p_lease_id
      AND archived_at IS NULL AND superseded_at IS NULL
      AND rule_source <> 'unresolved_history'
      AND v_term.end_date BETWEEN effective_from AND effective_to
    ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lease_activation_billing_rules_required' USING ERRCODE='22023';
  END IF;
  PERFORM public.create_authoritative_lease_term(p_organization_id,p_lease_id,
    v_term.start_date,v_term.end_date,v_term.rent_amount,v_term.rent_currency,
    v_term.rent_due_day,v_term.payment_frequency,'expired',v_term.id,p_idempotency_key||':history');
  PERFORM public.create_authoritative_lease_term(p_organization_id,p_lease_id,
    v_term.end_date+1,p_renewal_end_date,p_rent_amount,v_term.rent_currency,
    v_term.rent_due_day,v_term.payment_frequency,'active',NULL,p_idempotency_key||':renewal');
  INSERT INTO public.lease_billing_terms(
    organization_id,lease_id,property_id,effective_from,effective_to,
    collection_route,management_fee_mode,management_fee_value,
    charge_management_fee_when_active,full_management_fee_during_proration,
    billing_recipient_kind,billing_recipient_person_id,
    rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,
    lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,
    confirmed_by,created_by,updated_by,rule_source)
  VALUES(p_organization_id,p_lease_id,v_lease.property_id,v_term.end_date+1,p_renewal_end_date,
    v_billing.collection_route,v_billing.management_fee_mode,v_billing.management_fee_value,
    v_billing.charge_management_fee_when_active,v_billing.full_management_fee_during_proration,
    v_billing.billing_recipient_kind,v_billing.billing_recipient_person_id,
    v_billing.rent_calculation_timezone,v_billing.short_month_due_day_rule,v_billing.lease_start_proration_rule,
    v_billing.lease_end_proration_rule,v_billing.mid_period_rent_change_rule,v_billing.charge_through_lease_end,
    auth.uid(),auth.uid(),auth.uid(),v_billing.rule_source);
  v_result := public.transition_lease_lifecycle(p_organization_id,p_lease_id,'draft',
    p_expected_occupancy_id,'activate',p_move_in_date,NULL,
    'Operator confirmed continuous occupancy and renewal',p_idempotency_key||':activate');
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,auth.uid(),v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.renew_and_activate_draft_lease(uuid,uuid,uuid,date,date,numeric,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.renew_and_activate_draft_lease(uuid,uuid,uuid,date,date,numeric,text,uuid) TO authenticated;
