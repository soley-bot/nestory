-- Month-to-month uses the native open date bound, never an invented fixed end.
-- Only contractual ranges are unbounded; financial period locks remain finite.
CREATE OR REPLACE FUNCTION app_private.lock_open_lease_term_periods(
  p_organization_id uuid, p_property_id uuid, p_currency public.currency_code,
  p_start_date date, p_end_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_period_start date; v_start date := p_start_date; v_end date := p_end_date; v_floor date;
BEGIN
  IF p_start_date IS NULL OR NOT pg_catalog.isfinite(p_start_date) OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Valid lease-term dates are required' USING ERRCODE='22023';
  END IF;
  IF p_end_date = 'infinity'::date THEN
    PERFORM app_private.assert_financial_write_allowed(p_organization_id);
    SELECT financial_start_date INTO v_floor FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
    v_start := greatest(p_start_date, v_floor);
    v_end := greatest(v_start, app_private.rent_business_date(p_organization_id, statement_timestamp()));
    -- Existing future locks must not be skipped by the finite iteration bound.
    IF EXISTS (SELECT 1 FROM public.financial_month_locks l WHERE l.organization_id=p_organization_id
      AND l.month_start>v_end AND l.is_locked) THEN
      RAISE EXCEPTION 'Month-to-month continuation requires review of future closed months' USING ERRCODE='55000';
    END IF;
  END IF;
  FOR v_period_start IN SELECT months::date FROM pg_catalog.generate_series(
    pg_catalog.date_trunc('month',v_start), pg_catalog.date_trunc('month',v_end), interval '1 month') months
  LOOP
    PERFORM app_private.lock_open_property_financial_month(p_organization_id,p_property_id,p_currency,v_period_start);
  END LOOP;
END;
$$;

CREATE FUNCTION public.continue_lease_month_to_month(
  p_organization_id uuid, p_lease_id uuid, p_expected_term_id uuid,
  p_expected_billing_rule_id uuid, p_expected_rent_amount numeric,
  p_expected_fee_mode text, p_expected_fee_value numeric, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor uuid := auth.uid(); v_lease public.leases%ROWTYPE; v_term public.lease_terms%ROWTYPE;
  v_rule public.lease_billing_terms%ROWTYPE; v_new_rule public.lease_billing_terms%ROWTYPE;
  v_claim record; v_start date; v_new_term_id uuid;
  v_today date := app_private.rent_business_date(p_organization_id,statement_timestamp());
BEGIN
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  PERFORM app_private.assert_lease_permission(p_organization_id,p_lease_id,'leases.change_terms'::public.organization_permission_key);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease_rent_correction:'||p_organization_id::text||':'||p_lease_id::text,0));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id,'continue_lease_month_to_month',p_idempotency_key,v_actor,
    jsonb_build_object('leaseId',p_lease_id,'termId',p_expected_term_id,'billingRuleId',p_expected_billing_rule_id,
      'rentAmount',p_expected_rent_amount,'feeMode',p_expected_fee_mode,'feeValue',p_expected_fee_value));
  IF v_claim.is_replay THEN RETURN (v_claim.result_ids->>'termId')::uuid; END IF;
  SELECT * INTO v_lease FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_lease.status NOT IN ('active','notice_given') THEN RAISE EXCEPTION 'continuation_active_lease_required' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':','lease_term_v1',p_organization_id,p_lease_id),0));
  SELECT * INTO v_term FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id=p_expected_term_id AND authority_kind='authoritative' AND archived_at IS NULL AND status IN ('active','expired') FOR UPDATE;
  IF NOT FOUND OR NOT pg_catalog.isfinite(v_term.end_date) OR v_term.payment_frequency<>'monthly'
    OR v_term.rent_amount IS DISTINCT FROM p_expected_rent_amount OR v_term.rent_due_day IS NULL THEN
    RAISE EXCEPTION 'continuation_term_changed' USING ERRCODE='40001';
  END IF;
  v_start := v_term.end_date+1;
  IF v_start > v_today THEN RAISE EXCEPTION 'continuation_term_not_ended' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id<>v_term.id AND archived_at IS NULL AND status NOT IN ('superseded','terminated') AND end_date>=v_start) THEN
    RAISE EXCEPTION 'continuation_future_term_exists' USING ERRCODE='55000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':','lease_billing_rule_v2',p_organization_id,p_lease_id),0));
  SELECT * INTO v_rule FROM public.lease_billing_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id=p_expected_billing_rule_id AND archived_at IS NULL AND effective_from<=v_term.end_date AND effective_to=v_term.end_date
    AND superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_rule.rule_source<>'lease_default_v1' OR v_rule.management_fee_mode IS DISTINCT FROM p_expected_fee_mode
    OR v_rule.management_fee_value IS DISTINCT FROM p_expected_fee_value OR v_rule.collection_route IS NULL
    OR v_rule.management_fee_mode IS NULL OR v_rule.management_fee_value IS NULL
    OR v_rule.billing_recipient_kind IS NULL OR v_rule.billing_recipient_person_id IS NULL THEN
    RAISE EXCEPTION 'continuation_billing_changed_or_incomplete' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lease_billing_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id<>v_rule.id AND archived_at IS NULL AND superseded_at IS NULL AND effective_to>=v_start) THEN
    RAISE EXCEPTION 'continuation_future_billing_exists' USING ERRCODE='55000';
  END IF;
  -- Check before any automatic catch-up trigger runs. September contractual
  -- continuity remains intact after an October financial opening.
  PERFORM app_private.lock_open_lease_term_periods(p_organization_id,v_lease.property_id,v_term.rent_currency,v_start,'infinity'::date);
  -- Clone the checked rule without modifying historical contract or fee values.
  v_new_rule := v_rule;
  v_new_rule.id := gen_random_uuid(); v_new_rule.effective_from := v_start; v_new_rule.effective_to := 'infinity'::date;
  v_new_rule.first_period_prorated_amount := NULL; v_new_rule.final_period_prorated_amount := NULL;
  v_new_rule.supersedes_billing_term_id := NULL; v_new_rule.superseded_at := NULL; v_new_rule.superseded_by := NULL;
  v_new_rule.created_at := statement_timestamp(); v_new_rule.updated_at := statement_timestamp();
  v_new_rule.created_by := v_actor; v_new_rule.updated_by := v_actor; v_new_rule.confirmed_by := v_actor; v_new_rule.confirmed_at := statement_timestamp();
  -- List writable columns; effective_range is generated by PostgreSQL.
  INSERT INTO public.lease_billing_terms (id,organization_id,lease_id,property_id,effective_from,effective_to,
    collection_route,management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
    billing_recipient_kind,billing_recipient_person_id,first_period_prorated_amount,final_period_prorated_amount,
    rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,
    mid_period_rent_change_rule,charge_through_lease_end,rule_source,confirmed_at,confirmed_by,created_by,updated_by)
  VALUES (v_new_rule.id,p_organization_id,p_lease_id,v_lease.property_id,v_start,'infinity'::date,
    v_rule.collection_route,v_rule.management_fee_mode,v_rule.management_fee_value,v_rule.charge_management_fee_when_active,v_rule.full_management_fee_during_proration,
    v_rule.billing_recipient_kind,v_rule.billing_recipient_person_id,NULL,NULL,v_rule.rent_calculation_timezone,
    v_rule.short_month_due_day_rule,v_rule.lease_start_proration_rule,v_rule.lease_end_proration_rule,
    v_rule.mid_period_rent_change_rule,v_rule.charge_through_lease_end,v_rule.rule_source,statement_timestamp(),v_actor,v_actor,v_actor);
  UPDATE public.lease_terms SET status='expired',updated_by=v_actor WHERE id=v_term.id AND status='active';
  v_new_term_id := public.create_authoritative_lease_term(p_organization_id,p_lease_id,v_start,'infinity'::date,
    v_term.rent_amount,v_term.rent_currency,v_term.rent_due_day,'monthly','active',NULL,p_idempotency_key||':term');
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
  VALUES(p_organization_id,v_actor,'lease_term',v_new_term_id,'lease_month_to_month_continued',
    jsonb_build_object('term',to_jsonb(v_term),'billingRule',to_jsonb(v_rule)),
    jsonb_build_object('termId',v_new_term_id,'billingRuleId',v_new_rule.id,'startDate',v_start,'endDate','infinity','unchangedRentAndFees',true));
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,jsonb_build_object('termId',v_new_term_id));
  RETURN v_new_term_id;
END;
$$;
REVOKE ALL ON FUNCTION public.continue_lease_month_to_month(uuid,uuid,uuid,uuid,numeric,text,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.continue_lease_month_to_month(uuid,uuid,uuid,uuid,numeric,text,numeric,text) TO authenticated;
