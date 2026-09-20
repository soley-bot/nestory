-- Void retains the original and posts its checked reversal atomically.
-- Uses the same month/lifecycle ordering and consumed-cash guard as corrections.
CREATE FUNCTION public.void_owner_contribution(
  p_organization_id uuid, p_cash_event_id uuid, p_reason text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p_event_date date;
  p_amount numeric := 0;
  p_reference text;
  v_actor uuid := (SELECT auth.uid());
  v_original public.owner_cash_events%ROWTYPE;
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_result jsonb;
  v_reversal jsonb;
  v_queue jsonb;
  v_locked_queue jsonb;
  v_month date;
  v_owner uuid;
  v_cash_before numeric;
  v_end date;
  v_source record;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_reason text := pg_catalog.btrim(p_reason);
  v_reference text := nullif(pg_catalog.btrim(p_reference), '');
BEGIN
  SELECT * INTO v_original FROM public.owner_cash_events
    WHERE organization_id = p_organization_id AND id = p_cash_event_id;
  p_event_date := v_original.event_date;
  IF v_actor IS NULL OR v_original.id IS NULL
    OR v_original.event_type <> 'owner_contribution'
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.correct_records')
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.record_payments') THEN
    RAISE EXCEPTION 'owner_contribution_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE='42501';
  END IF;
  IF p_event_date IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 120
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 500
    OR length(v_reference) > 240 THEN
    RAISE EXCEPTION 'owner_contribution_correction_inputs_invalid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('cashEventId', p_cash_event_id,
    'newDate', p_event_date, 'amount', p_amount, 'reference', v_reference, 'reason', v_reason);
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'void_owner_contribution', v_key, v_actor, v_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF greatest(p_event_date, v_original.event_date) > app_private.rent_business_date(p_organization_id) THEN
    RAISE EXCEPTION 'owner_contribution_date_in_future' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
    INTO v_queue FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q;
  -- Follow the global financial-month -> owner-lifecycle -> source-row order.
  FOR v_month IN SELECT DISTINCT date_trunc('month', d)::date FROM (
    SELECT (q->>'event_date')::date d FROM jsonb_array_elements(v_queue) q
    UNION SELECT p_event_date UNION SELECT v_original.event_date
  ) dates ORDER BY 1 LOOP
    -- Match record_owner_distribution: all legacy month locks precede
    -- lifecycle locks. The branch-aware open-period checks follow below.
    PERFORM app_private.lock_property_financial_month(p_organization_id,v_original.property_id,v_original.currency,v_month);
  END LOOP;
  FOR v_owner IN SELECT person_id FROM (
    SELECT v_original.owner_person_id person_id
    UNION SELECT person_id FROM public.property_owners WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_component_movements WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_cash_events WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.property_withdrawals WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT from_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT to_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
  ) owners WHERE person_id IS NOT NULL ORDER BY person_id LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(p_organization_id,v_original.property_id,v_owner,v_original.currency);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
    INTO v_locked_queue FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q;
  IF v_locked_queue IS DISTINCT FROM v_queue THEN
    RAISE EXCEPTION 'owner_contribution_sources_changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id,'void_owner_contribution',v_key,v_actor,v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO STRICT v_original FROM public.owner_cash_events
    WHERE organization_id=p_organization_id AND id=p_cash_event_id FOR UPDATE;
  IF v_original.reversal_of_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.owner_cash_events WHERE organization_id=p_organization_id AND reversal_of_id=p_cash_event_id
  ) THEN RAISE EXCEPTION 'owner_contribution_already_reversed' USING ERRCODE='23514'; END IF;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,v_original.event_date);
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,p_event_date);
  IF EXISTS (SELECT 1 FROM public.owner_balance_periods WHERE organization_id=p_organization_id
    AND property_id=v_original.property_id AND owner_person_id=v_original.owner_person_id
    AND currency=v_original.currency AND status='closed'
    AND month_start>=date_trunc('month',least(p_event_date,v_original.event_date))::date
  ) THEN RAISE EXCEPTION 'owner_contribution_owner_period_closed' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.validate_owner_roster_on_date(
    p_organization_id,v_original.property_id,p_event_date) WHERE owner_person_id=v_original.owner_person_id
  ) THEN RAISE EXCEPTION 'owner_contribution_owner_mismatch' USING ERRCODE='23514'; END IF;
  SELECT greatest(p_event_date,v_original.event_date,max((q->>'event_date')::date)) INTO v_end
    FROM jsonb_array_elements(v_queue) q WHERE CASE WHEN q->>'source_type' IN (
      'owner_distribution','owner_invoice_payment','reversal','owner_component_transfer'
    ) THEN app_private.owner_distribution_source_cash(p_organization_id,q->>'source_type',
      (q->>'source_line_id')::uuid,v_original.owner_person_id)<0 ELSE false END;
  -- Required non-cash originals can post after their historical cash payments.
  FOR v_source IN SELECT q.* FROM public.get_owner_event_allocation_queue(
    p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q
    WHERE q.allocation_state='pending' AND q.source_type IN ('management_fee_occurrence','owner_paid_cost')
    AND EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations c
      JOIN public.owner_invoice_lines l ON l.organization_id=c.organization_id AND l.id=c.owner_invoice_line_id
      JOIN public.owner_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
      WHERE c.organization_id=p_organization_id AND c.property_id=v_original.property_id AND c.allocation_date<=v_end
        AND i.owner_person_id=v_original.owner_person_id AND l.source_id=q.source_line_id
        AND q.source_type=CASE l.source_type WHEN 'management_fee' THEN 'management_fee_occurrence' ELSE 'owner_paid_cost' END)
    ORDER BY q.event_date,q.source_type,q.source_line_id LOOP
    PERFORM public.allocate_owner_event(p_organization_id,v_source.source_type,v_source.source_line_id,
      'distribution-source:'||v_source.source_type||':'||v_source.source_line_id::text);
  END LOOP;
  PERFORM app_private.prepare_owner_distribution_sources(p_organization_id,v_original.property_id,v_original.currency,
    DATE '0001-01-01',v_end,v_original.owner_person_id);
  PERFORM app_private.assert_owner_distribution_sources_allocated(p_organization_id,v_original.property_id,v_original.currency,
    v_end,v_original.owner_person_id);
  SELECT coalesce(sum(signed_amount),0) INTO v_cash_before FROM public.owner_component_movements
    WHERE organization_id=p_organization_id AND property_id=v_original.property_id
      AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash';
  -- allocate_owner_event rejects any active consumer of the original source.
  -- Do not release, replace or reassign those consumers' reservations.
  PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
  INSERT INTO public.owner_cash_events(organization_id,property_id,owner_person_id,currency,event_type,
    event_date,amount,reason,reference,idempotency_key,payload_hash,created_by,reversal_of_id)
  VALUES(p_organization_id,v_original.property_id,v_original.owner_person_id,v_original.currency,'owner_contribution',
    v_original.event_date,-v_original.amount,v_original.reason,v_original.reference,
    'contribution-reversal:'||v_claim.request_id::text,app_private.canonical_financial_payload_hash(v_payload),v_actor,p_cash_event_id)
  RETURNING jsonb_build_object('id',id) INTO v_reversal;
  PERFORM public.allocate_owner_event(p_organization_id,'reversal',(v_reversal->>'id')::uuid,
    'contribution-reversal:'||v_claim.request_id::text);
  IF (SELECT coalesce(sum(signed_amount),0) FROM public.owner_component_movements
    WHERE organization_id=p_organization_id AND property_id=v_original.property_id
      AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
  ) IS DISTINCT FROM (v_cash_before - v_original.amount + p_amount) THEN
    RAISE EXCEPTION 'owner_contribution_correction_cash_changed' USING ERRCODE='23514';
  END IF;
  IF EXISTS (WITH daily AS (
    SELECT effective_date d,signed_amount amount FROM public.owner_opening_balance_entries
      WHERE organization_id=p_organization_id AND property_id=v_original.property_id
        AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
    UNION ALL SELECT event_date,signed_amount FROM public.owner_component_movements
      WHERE organization_id=p_organization_id AND property_id=v_original.property_id
        AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
  ), totals AS (SELECT d,sum(amount) amount FROM daily GROUP BY d), running AS (
    SELECT d,sum(amount) OVER (ORDER BY d) balance FROM totals
  ) SELECT 1 FROM running WHERE d>=least(p_event_date,v_original.event_date) AND balance<0) THEN
    RAISE EXCEPTION 'owner_contribution_date_would_underfund_owner_cash' USING ERRCODE='23514';
  END IF;
  v_result:=jsonb_build_object('originalId',p_cash_event_id,
    'reversalId',v_reversal->>'id','oldDate',v_original.event_date,'newDate',p_event_date,
    'oldAmount',v_original.amount,'newAmount',p_amount,
    'oldReference',CASE WHEN v_original.corrects_event_id IS NOT NULL THEN v_original.reference ELSE coalesce(v_original.reference,v_original.reason) END,
    'reference',v_reference);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_organization_id,v_actor,'owner_contribution_void',p_cash_event_id,'voided',v_result||jsonb_build_object('reason',v_reason));
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.void_owner_contribution(uuid,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.void_owner_contribution(uuid,uuid,text,text) TO authenticated;
