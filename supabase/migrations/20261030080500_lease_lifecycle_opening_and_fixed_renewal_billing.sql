BEGIN;

ALTER TABLE public.lease_billing_terms ADD COLUMN renewed_from_billing_term_id uuid;
ALTER TABLE public.lease_billing_terms ADD CONSTRAINT lease_billing_terms_renewed_from_fkey
  FOREIGN KEY(organization_id,lease_id,renewed_from_billing_term_id)
  REFERENCES public.lease_billing_terms(organization_id,lease_id,id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.lease_billing_terms.renewed_from_billing_term_id IS
  'Checked unchanged recurring billing carried into an adjacent renewal interval; predecessor remains historical authority.';

-- A clock-selected renewal rule can bill the opening segment of the same month
-- only through adjacent, unchanged predecessor rules. This does not authorize
-- a different fee, recipient, collection route, timezone, or a gap in coverage.
CREATE FUNCTION app_private.renewal_billing_covers_date(p_organization_id uuid,p_lease_id uuid,p_rule_id uuid,p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE chain AS (
    SELECT b.* FROM public.lease_billing_terms b WHERE b.organization_id=p_organization_id AND b.lease_id=p_lease_id
      AND b.id=p_rule_id AND b.archived_at IS NULL AND b.superseded_at IS NULL AND b.rule_source='lease_default_v1'
    UNION ALL
    SELECT prior.* FROM public.lease_billing_terms prior JOIN chain next
      ON prior.organization_id=next.organization_id AND prior.lease_id=next.lease_id AND prior.id=next.renewed_from_billing_term_id
    WHERE prior.archived_at IS NULL AND prior.superseded_at IS NULL AND prior.rule_source='lease_default_v1'
      AND prior.effective_from<next.effective_from AND prior.effective_to+1=next.effective_from
      AND p_date<next.effective_from
      AND ROW(prior.collection_route,prior.management_fee_mode,prior.management_fee_value,prior.charge_management_fee_when_active,
        prior.full_management_fee_during_proration,prior.billing_recipient_kind,prior.billing_recipient_person_id,
        prior.rent_calculation_timezone,prior.short_month_due_day_rule,prior.lease_start_proration_rule,prior.lease_end_proration_rule,
        prior.mid_period_rent_change_rule,prior.charge_through_lease_end)
        IS NOT DISTINCT FROM ROW(next.collection_route,next.management_fee_mode,next.management_fee_value,next.charge_management_fee_when_active,
        next.full_management_fee_during_proration,next.billing_recipient_kind,next.billing_recipient_person_id,
        next.rent_calculation_timezone,next.short_month_due_day_rule,next.lease_start_proration_rule,next.lease_end_proration_rule,
        next.mid_period_rent_change_rule,next.charge_through_lease_end)
  ) SELECT EXISTS(SELECT 1 FROM chain WHERE p_date BETWEEN effective_from AND effective_to);
$$;
REVOKE ALL ON FUNCTION app_private.renewal_billing_covers_date(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;

DO $billing_boundary$
DECLARE d text; a text := '    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to';
BEGIN
  d:=pg_get_functiondef('app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure);
  IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'renewal_billing_boundary_predecessor_changed'; END IF;
  d:=replace(d,a,'    AND (v_effective_date BETWEEN billing.effective_from AND billing.effective_to OR app_private.renewal_billing_covers_date(p_organization_id,p_lease_id,billing.id,v_effective_date))');
  -- The renewal expires its predecessor. Include that opening segment for
  -- automatic billing only when the selected rule proves this exact renewal.
  a:=$anchor$AND term.status IN ('active', 'upcoming')$anchor$;
  IF strpos(d,a)=0 THEN RAISE EXCEPTION 'renewal_term_segments_predecessor_changed'; END IF;
  d:=replace(d,a,$replacement$AND (term.status IN ('active', 'upcoming') OR (
    term.status='expired' AND EXISTS (
      SELECT 1 FROM public.lease_terms successor JOIN public.lease_billing_terms continuation
        ON continuation.organization_id=successor.organization_id AND continuation.lease_id=successor.lease_id
      WHERE successor.organization_id=term.organization_id AND successor.lease_id=term.lease_id
        AND successor.supersedes_term_id=term.id AND successor.start_date=term.end_date+1
        AND successor.authority_kind='authoritative' AND successor.archived_at IS NULL AND successor.status IN ('active','upcoming')
        AND continuation.id=p_expected_billing_term_id AND continuation.renewed_from_billing_term_id IS NOT NULL
        AND continuation.effective_from BETWEEN successor.start_date AND successor.start_date+1
        AND app_private.renewal_billing_covers_date(p_organization_id,p_lease_id,continuation.id,greatest(term.start_date,p_billing_period_start))
    )))$replacement$);
  EXECUTE d;
END;
$billing_boundary$;

-- Contract dates survive a financial opening. Only lock months in the current
-- books; the ordinary invoice/payment guards still reject pre-opening money.
CREATE OR REPLACE FUNCTION app_private.lock_open_lease_term_periods(
  p_organization_id uuid, p_property_id uuid, p_currency public.currency_code,
  p_start_date date, p_end_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_period_start date; v_start date; v_end date := p_end_date; v_floor date;
BEGIN
  IF p_start_date IS NULL OR NOT pg_catalog.isfinite(p_start_date) OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Valid lease-term dates are required' USING ERRCODE='22023';
  END IF;
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  SELECT financial_start_date INTO v_floor FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
  v_start := greatest(p_start_date, v_floor);
  IF p_end_date = 'infinity'::date THEN
    v_end := greatest(v_start, app_private.rent_business_date(p_organization_id, statement_timestamp()));
    IF EXISTS (SELECT 1 FROM public.financial_month_locks l WHERE l.organization_id=p_organization_id
      AND l.month_start>v_end AND l.is_locked) THEN
      RAISE EXCEPTION 'Month-to-month continuation requires review of future closed months' USING ERRCODE='55000';
    END IF;
  END IF;
  IF v_end < v_start THEN RETURN; END IF;
  FOR v_period_start IN SELECT months::date FROM pg_catalog.generate_series(
    pg_catalog.date_trunc('month',v_start), pg_catalog.date_trunc('month',v_end), interval '1 month') months
  LOOP
    PERFORM app_private.lock_open_property_financial_month(p_organization_id,p_property_id,p_currency,greatest(v_period_start,v_floor));
  END LOOP;
END;
$$;

-- A checked repair for a renewal already saved without its billing interval.
-- Existing billing and issued invoices are never rewritten by this command.
CREATE FUNCTION public.carry_forward_lease_renewal_billing(
  p_organization_id uuid, p_lease_id uuid, p_term_id uuid,
  p_expected_billing_rule_id uuid, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid()); v_claim record;
  v_lease public.leases%ROWTYPE; v_term public.lease_terms%ROWTYPE;
  v_previous public.lease_terms%ROWTYPE; v_rule public.lease_billing_terms%ROWTYPE;
  v_start date; v_rule_id uuid := gen_random_uuid();
BEGIN
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  PERFORM app_private.assert_lease_permission(p_organization_id,p_lease_id,'leases.change_terms'::public.organization_permission_key);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease_rent_correction:'||p_organization_id::text||':'||p_lease_id::text,0));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id,'carry_forward_lease_renewal_billing',p_idempotency_key,v_actor,
    jsonb_build_object('leaseId',p_lease_id,'termId',p_term_id,'billingRuleId',p_expected_billing_rule_id));
  IF v_claim.is_replay THEN RETURN (v_claim.result_ids->>'billingRuleId')::uuid; END IF;
  SELECT * INTO v_lease FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_lease.status NOT IN ('active','notice_given') THEN
    RAISE EXCEPTION 'renewal_active_lease_required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':','lease_term_v1',p_organization_id,p_lease_id),0));
  SELECT * INTO v_term FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id AND id=p_term_id
    AND archived_at IS NULL AND authority_kind='authoritative' AND status IN ('active','upcoming') FOR UPDATE;
  IF NOT FOUND OR NOT pg_catalog.isfinite(v_term.end_date) OR v_term.supersedes_term_id IS NULL THEN
    RAISE EXCEPTION 'renewal_term_changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_previous FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id=v_term.supersedes_term_id AND archived_at IS NULL AND authority_kind='authoritative' FOR UPDATE;
  IF NOT FOUND OR v_previous.start_date>=v_term.start_date OR v_previous.end_date<>v_term.start_date-1
    OR EXISTS (SELECT 1 FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
      AND archived_at IS NULL AND authority_kind='authoritative' AND status IN ('active','upcoming') AND term_sequence>v_term.term_sequence) THEN
    RAISE EXCEPTION 'renewal_term_changed' USING ERRCODE='40001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':','lease_billing_rule_v2',p_organization_id,p_lease_id),0));
  SELECT * INTO v_rule FROM public.lease_billing_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id=p_expected_billing_rule_id AND archived_at IS NULL AND superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_rule.rule_source<>'lease_default_v1'
    OR v_rule.effective_from>v_previous.end_date OR v_rule.effective_to NOT BETWEEN v_term.start_date-1 AND v_term.start_date
    OR v_rule.effective_to>=v_term.end_date OR v_rule.collection_route IS NULL
    OR v_rule.management_fee_mode IS NULL OR v_rule.management_fee_value IS NULL
    OR v_rule.billing_recipient_kind IS NULL OR v_rule.billing_recipient_person_id IS NULL
    OR v_rule.rent_calculation_timezone IS NULL OR v_rule.short_month_due_day_rule IS NULL
    OR v_rule.lease_start_proration_rule IS NULL OR v_rule.lease_end_proration_rule IS NULL
    OR v_rule.mid_period_rent_change_rule IS NULL OR v_rule.charge_through_lease_end IS NULL THEN
    RAISE EXCEPTION 'renewal_billing_changed_or_incomplete' USING ERRCODE='40001';
  END IF;
  v_start := v_rule.effective_to+1;
  IF EXISTS (SELECT 1 FROM public.lease_billing_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id<>v_rule.id AND archived_at IS NULL AND superseded_at IS NULL AND effective_to>=v_start) THEN
    RAISE EXCEPTION 'renewal_future_billing_exists' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_invoices WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND lifecycle='issued' AND billing_period_end>=v_start AND billing_period_start<=v_term.end_date) THEN
    RAISE EXCEPTION 'renewal_billing_has_issued_rent' USING ERRCODE='55000';
  END IF;
  PERFORM app_private.lock_open_lease_term_periods(p_organization_id,v_lease.property_id,v_term.rent_currency,v_start,v_term.end_date);
  PERFORM app_private.assert_lease_billing_destination(p_organization_id,v_lease.property_id,v_lease.unit_id,v_start,
    jsonb_build_object('billingRecipientKind',v_rule.billing_recipient_kind,'billingRecipientPersonId',v_rule.billing_recipient_person_id,'collectionRoute',v_rule.collection_route));
  INSERT INTO public.lease_billing_terms (id,organization_id,lease_id,property_id,effective_from,effective_to,
    collection_route,management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
    billing_recipient_kind,billing_recipient_person_id,first_period_prorated_amount,final_period_prorated_amount,
    rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,
    mid_period_rent_change_rule,charge_through_lease_end,rule_source,confirmed_at,confirmed_by,created_by,updated_by,renewed_from_billing_term_id)
  VALUES (v_rule_id,p_organization_id,p_lease_id,v_lease.property_id,v_start,v_term.end_date,
    v_rule.collection_route,v_rule.management_fee_mode,v_rule.management_fee_value,v_rule.charge_management_fee_when_active,v_rule.full_management_fee_during_proration,
    v_rule.billing_recipient_kind,v_rule.billing_recipient_person_id,NULL,NULL,v_rule.rent_calculation_timezone,
    v_rule.short_month_due_day_rule,v_rule.lease_start_proration_rule,v_rule.lease_end_proration_rule,
    v_rule.mid_period_rent_change_rule,v_rule.charge_through_lease_end,v_rule.rule_source,statement_timestamp(),v_actor,v_actor,v_actor,v_rule.id);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
  VALUES(p_organization_id,v_actor,'lease_billing_term',v_rule_id,'lease_renewal_billing_carried_forward',
    jsonb_build_object('sourceBillingRuleId',v_rule.id),jsonb_build_object('termId',v_term.id,'effectiveFrom',v_start,'effectiveTo',v_term.end_date));
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,jsonb_build_object('billingRuleId',v_rule_id));
  RETURN v_rule_id;
END;
$$;

-- Defer automatic catch-up only for the lease being renewed, until its term
-- and billing interval are both present. The final billing insert runs it once.
DO $patch$
DECLARE d text; a text := '  v_organization_id := NEW.organization_id;';
BEGIN
  d := pg_get_functiondef('app_private.catch_up_lease_rent()'::regprocedure);
  IF strpos(d,a)=0 THEN RAISE EXCEPTION 'renewal_catch_up_predecessor_changed'; END IF;
  EXECUTE replace(d,a,$body$
  IF TG_TABLE_NAME='lease_terms' THEN
    IF current_setting('app.renewal_billing_lease_id',true)=NEW.lease_id::text THEN RETURN NEW; END IF;
  END IF;
$body$||a);
END;
$patch$;

CREATE FUNCTION public.renew_lease_with_billing(
  p_organization_id uuid, p_lease_id uuid, p_start_date date, p_end_date date,
  p_rent_amount numeric, p_rent_currency public.currency_code, p_rent_due_day integer,
  p_payment_frequency text, p_supersedes_term_id uuid, p_expected_billing_rule_id uuid, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid()); v_claim record; v_previous public.lease_terms%ROWTYPE;
  v_term_id uuid; v_billing_id uuid; v_old_batch text := current_setting('app.renewal_billing_lease_id',true);
BEGIN
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  PERFORM app_private.assert_lease_permission(p_organization_id,p_lease_id,'leases.change_terms'::public.organization_permission_key);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease_rent_correction:'||p_organization_id::text||':'||p_lease_id::text,0));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id,'renew_lease_with_billing',p_idempotency_key,v_actor,
    jsonb_build_object('leaseId',p_lease_id,'startDate',p_start_date,'endDate',p_end_date,'rentAmount',p_rent_amount,
      'currency',p_rent_currency,'rentDueDay',p_rent_due_day,'frequency',p_payment_frequency,
      'previousTermId',p_supersedes_term_id,'billingRuleId',p_expected_billing_rule_id));
  IF v_claim.is_replay THEN RETURN (v_claim.result_ids->>'termId')::uuid; END IF;
  PERFORM 1 FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id AND archived_at IS NULL AND status IN ('active','notice_given') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'renewal_active_lease_required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_previous FROM public.lease_terms WHERE organization_id=p_organization_id AND lease_id=p_lease_id
    AND id=p_supersedes_term_id AND archived_at IS NULL AND authority_kind='authoritative' AND status='active' FOR UPDATE;
  IF NOT FOUND OR NOT pg_catalog.isfinite(v_previous.end_date) THEN RAISE EXCEPTION 'renewal_term_changed' USING ERRCODE='40001'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR NOT pg_catalog.isfinite(p_end_date)
    OR p_start_date NOT BETWEEN v_previous.end_date AND v_previous.end_date+1 OR p_end_date<=p_start_date THEN
    RAISE EXCEPTION 'renewal_dates_must_follow_term' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('app.renewal_billing_lease_id',p_lease_id::text,true);
  v_term_id := public.schedule_authoritative_lease_term(p_organization_id,p_lease_id,p_start_date,p_end_date,
    p_rent_amount,p_rent_currency,p_rent_due_day,p_payment_frequency,p_supersedes_term_id,'renewal-term:'||v_claim.request_id::text);
  PERFORM set_config('app.renewal_billing_lease_id',coalesce(v_old_batch,''),true);
  v_billing_id := public.carry_forward_lease_renewal_billing(p_organization_id,p_lease_id,v_term_id,p_expected_billing_rule_id,'renewal-billing:'||v_claim.request_id::text);
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,jsonb_build_object('termId',v_term_id,'billingRuleId',v_billing_id));
  RETURN v_term_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carry_forward_lease_renewal_billing(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.carry_forward_lease_renewal_billing(uuid,uuid,uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.renew_lease_with_billing(uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.renew_lease_with_billing(uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,uuid,text) TO authenticated;
COMMIT;
