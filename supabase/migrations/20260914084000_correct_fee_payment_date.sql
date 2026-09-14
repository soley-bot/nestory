-- Correct only the held-cash settlement date. Recognition and issued amounts
-- retain their original identities; every financial correction is appended.
CREATE TABLE public.fee_payment_date_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL,
  original_allocation_id uuid NOT NULL UNIQUE,
  reversal_allocation_id uuid NOT NULL UNIQUE,
  replacement_allocation_id uuid NOT NULL UNIQUE,
  old_date date NOT NULL,
  new_date date NOT NULL CHECK (new_date <> old_date),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  preview_hash text NOT NULL,
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,property_id) REFERENCES public.properties(organization_id,id),
  FOREIGN KEY (organization_id,original_allocation_id) REFERENCES public.owner_charge_cash_allocations(organization_id,id),
  FOREIGN KEY (organization_id,reversal_allocation_id) REFERENCES public.owner_charge_cash_allocations(organization_id,id),
  FOREIGN KEY (organization_id,replacement_allocation_id) REFERENCES public.owner_charge_cash_allocations(organization_id,id)
);
ALTER TABLE public.fee_payment_date_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_payment_date_corrections FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.fee_payment_date_corrections TO authenticated;
CREATE POLICY fee_payment_date_corrections_read ON public.fee_payment_date_corrections
  FOR SELECT TO authenticated USING (app_private.can_access_property(organization_id,property_id,'finance.view'));
CREATE TRIGGER fee_payment_date_corrections_append_only BEFORE INSERT OR UPDATE OR DELETE
  ON public.fee_payment_date_corrections FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_balance_append_only();
CREATE TRIGGER privileged_email_step_up_enforcement BEFORE INSERT OR UPDATE OR DELETE
  ON public.fee_payment_date_corrections FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();

-- A reversal releases the original consumer's source reservation. Counting its
-- positive compensating movement as another source would count that cash twice.
DO $patch$
DECLARE v_definition text; v_marker text := E'        AND movement.signed_amount > 0\n        AND movement.event_date <= p_event_date';
BEGIN
  SELECT pg_get_functiondef('app_private.consume_owner_held_cash(uuid,uuid,uuid,public.currency_code,date,uuid,numeric,uuid)'::regprocedure)
    INTO v_definition;
  v_definition := replace(v_definition,E'\r\n',E'\n');
  IF encode(sha256(convert_to(v_definition,'UTF8')),'hex') <>
    'be720e70d816ff71d0978ec6f84a01a80357eecb9f2208c10da2d47cdece7194' THEN
    RAISE EXCEPTION 'fee_cash_source_predecessor_changed';
  END IF;
  IF strpos(v_definition,v_marker)=0 THEN RAISE EXCEPTION 'fee_cash_source_patch_contract_changed'; END IF;
  EXECUTE replace(v_definition,v_marker,
    E'        AND movement.signed_amount > 0\n        AND movement.reversal_of_movement_id IS NULL\n        AND movement.event_date <= p_event_date');
END;
$patch$;

CREATE FUNCTION app_private.fee_payment_date_snapshot(p_organization_id uuid,p_property_id uuid,p_currency public.currency_code,p_old_date date,p_new_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT jsonb_build_object(
    'queue',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
      FROM public.get_owner_event_allocation_queue(p_organization_id,p_property_id,p_currency,DATE '0001-01-01',DATE '9999-12-31') q),
    'cash',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.owner_charge_cash_allocations c WHERE c.organization_id=p_organization_id AND c.property_id=p_property_id),
    'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.owner_component_movements m WHERE m.organization_id=p_organization_id AND m.property_id=p_property_id),
    'openings',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM public.owner_opening_balance_entries o WHERE o.organization_id=p_organization_id AND o.property_id=p_property_id),
    'owners',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM public.property_owners o WHERE o.organization_id=p_organization_id AND o.property_id=p_property_id),
    'periods',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.owner_balance_periods p WHERE p.organization_id=p_organization_id AND p.property_id=p_property_id),
    'branch',(SELECT branch_id FROM public.properties WHERE organization_id=p_organization_id AND id=p_property_id),
    'locks',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.month_start,l.branch_id,l.id),'[]')
      FROM public.financial_month_locks l
      JOIN public.properties p ON p.organization_id=l.organization_id AND p.id=p_property_id
      WHERE l.organization_id=p_organization_id
        AND (l.branch_id IS NULL OR p.branch_id IS NULL OR l.branch_id=p.branch_id)
        AND l.month_start IN (SELECT date_trunc('month',d)::date FROM (
          SELECT p_old_date d UNION SELECT p_new_date
          UNION SELECT q.event_date FROM public.get_owner_event_allocation_queue(
            p_organization_id,p_property_id,p_currency,DATE '0001-01-01',DATE '9999-12-31') q
        ) affected_dates))
  );
$$;

CREATE FUNCTION public.list_fee_payment_date_candidates(p_organization_id uuid,p_lease_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_property uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'fee_payment_date_correction_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT property_id INTO v_property FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id;
  PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.record_payments');
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',c.id,'invoiceNumber',i.invoice_number,'amount',c.amount,
    'paymentDate',c.allocation_date,'feeDate',f.fee_date) ORDER BY c.allocation_date DESC,c.id),'[]')
    FROM public.owner_charge_cash_allocations c
    JOIN public.owner_invoice_lines l ON l.organization_id=c.organization_id AND l.id=c.owner_invoice_line_id
    JOIN public.owner_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
    JOIN public.management_fee_occurrences f ON f.organization_id=l.organization_id AND f.id=l.source_id
    WHERE c.organization_id=p_organization_id AND f.lease_id=p_lease_id
      AND l.source_type='management_fee' AND i.lifecycle='issued' AND c.reversal_of_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations r WHERE r.organization_id=c.organization_id AND r.reversal_of_id=c.id));
END;
$$;

CREATE FUNCTION app_private.run_fee_payment_date_correction(
  p_organization_id uuid,p_allocation_id uuid,p_new_date date,p_reason text,
  p_preview_hash text,p_idempotency_key text,p_preview boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_original public.owner_charge_cash_allocations%ROWTYPE;
  v_line public.owner_invoice_lines%ROWTYPE;
  v_invoice public.owner_invoices%ROWTYPE;
  v_existing public.fee_payment_date_corrections%ROWTYPE;
  v_before jsonb; v_locked jsonb; v_hash text; v_payload text;
  v_month date; v_owner uuid; v_branch uuid; v_source record;
  v_id uuid := gen_random_uuid(); v_reversal uuid := gen_random_uuid(); v_replacement uuid := gen_random_uuid();
  v_result jsonb; v_error text; v_context text;
  v_cash_before numeric; v_cash_after numeric; v_business_date date;
BEGIN
  IF v_actor IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'fee_payment_date_correction_forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT p_preview AND NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE='42501';
  END IF;
  IF p_allocation_id IS NULL OR p_new_date IS NULL OR p_new_date IN ('infinity'::date,'-infinity'::date) THEN
    RAISE EXCEPTION 'fee_payment_date_correction_inputs_invalid' USING ERRCODE='22023';
  END IF;
  IF NOT p_preview AND (length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500
    OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 160
    OR coalesce(p_preview_hash,'') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'fee_payment_date_correction_inputs_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_original FROM public.owner_charge_cash_allocations WHERE organization_id=p_organization_id AND id=p_allocation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee_payment_allocation_not_found' USING ERRCODE='23503'; END IF;
  PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,'finance.record_payments');
  SELECT * INTO STRICT v_line FROM public.owner_invoice_lines WHERE organization_id=p_organization_id AND id=v_original.owner_invoice_line_id;
  SELECT * INTO STRICT v_invoice FROM public.owner_invoices WHERE organization_id=p_organization_id AND id=v_line.invoice_id;
  v_payload := app_private.canonical_financial_payload_hash(jsonb_build_object('allocation',p_allocation_id,'date',p_new_date,'reason',btrim(p_reason),'preview',p_preview_hash));
  IF NOT p_preview THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','fee-payment-date-idempotency',p_organization_id,btrim(p_idempotency_key)),0));
    SELECT * INTO v_existing FROM public.fee_payment_date_corrections WHERE organization_id=p_organization_id AND idempotency_key=btrim(p_idempotency_key);
    IF FOUND THEN
      IF v_existing.payload_hash<>v_payload OR v_existing.created_by<>v_actor THEN
        RAISE EXCEPTION 'fee_payment_date_idempotency_conflict' USING ERRCODE='22023';
      END IF;
      RETURN jsonb_build_object('correctionId',v_existing.id);
    END IF;
  END IF;
  SELECT (now() AT TIME ZONE operational_timezone)::date INTO v_business_date
    FROM public.organizations WHERE id=p_organization_id;
  v_before := app_private.fee_payment_date_snapshot(p_organization_id,v_original.property_id,v_invoice.currency,v_original.allocation_date,p_new_date);
  SELECT branch_id INTO v_branch FROM public.properties WHERE organization_id=p_organization_id AND id=v_original.property_id;
  -- Follow the existing global order: every month, then every owner, then rows.
  FOR v_month IN SELECT DISTINCT date_trunc('month',d)::date FROM (
    SELECT (q->>'event_date')::date d FROM jsonb_array_elements(v_before->'queue') q
    UNION SELECT p_new_date UNION SELECT v_original.allocation_date) dates ORDER BY 1
  LOOP
    PERFORM app_private.lock_financial_month_scope(p_organization_id,v_branch,v_month);
    PERFORM app_private.lock_property_financial_month(p_organization_id,v_original.property_id,v_invoice.currency,v_month);
  END LOOP;
  FOR v_owner IN SELECT person_id FROM (
    SELECT v_invoice.owner_person_id person_id
    UNION SELECT person_id FROM public.property_owners WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_component_movements WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_cash_events WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.property_withdrawals WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT from_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT to_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
  ) owners WHERE person_id IS NOT NULL ORDER BY person_id
  LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(p_organization_id,v_original.property_id,v_owner,v_invoice.currency);
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||v_original.property_id::text||':owner-cash',0));
  PERFORM 1 FROM public.owner_charge_cash_allocations WHERE organization_id=p_organization_id AND id=p_allocation_id FOR UPDATE;
  v_locked := app_private.fee_payment_date_snapshot(p_organization_id,v_original.property_id,v_invoice.currency,v_original.allocation_date,p_new_date);
  IF v_locked IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'fee_payment_date_sources_changed' USING ERRCODE='40001'; END IF;
  v_hash := app_private.canonical_financial_payload_hash(jsonb_build_object('allocation',p_allocation_id,'newDate',p_new_date,'snapshot',v_locked,'businessDate',v_business_date));
  IF NOT p_preview AND v_hash IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION 'fee_payment_date_preview_stale' USING ERRCODE='40001';
  END IF;
  v_result := jsonb_build_object('allocationId',p_allocation_id,'oldDate',v_original.allocation_date,'newDate',p_new_date,
    'amount',v_original.amount,'canApply',true,'blockers','[]'::jsonb,'previewHash',v_hash,
    'cashChangeOnEarlierDate',CASE WHEN p_new_date<v_original.allocation_date THEN -v_original.amount ELSE v_original.amount END,
    'currentBalanceChange',0);
  -- Preview runs the identical write path in a subtransaction, then deliberately
  -- rolls it back. Local result variables survive; rows, logs and GUCs do not.
  BEGIN
    SELECT coalesce(sum(amount),0) INTO v_cash_before FROM (
      SELECT signed_amount amount FROM public.owner_component_movements
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency
          AND component='ips_held_owner_cash' AND event_date<=v_business_date
      UNION ALL SELECT signed_amount FROM public.owner_opening_balance_entries
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency
          AND component='ips_held_owner_cash' AND effective_date<=v_business_date
    ) current_cash;
    IF v_line.source_type<>'management_fee' OR v_invoice.lifecycle<>'issued'
      OR v_original.reversal_of_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations
        WHERE organization_id=p_organization_id AND reversal_of_id=p_allocation_id)
      OR NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences f
        WHERE f.organization_id=p_organization_id AND f.id=v_line.source_id AND f.reversal_of_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences r
            WHERE r.organization_id=f.organization_id AND r.reversal_of_id=f.id)) THEN
      RAISE EXCEPTION 'fee_payment_allocation_not_correctable' USING ERRCODE='23514';
    END IF;
    IF p_new_date=v_original.allocation_date THEN RAISE EXCEPTION 'fee_payment_date_unchanged' USING ERRCODE='22023'; END IF;
    IF p_new_date>app_private.rent_business_date(p_organization_id)
      OR v_original.allocation_date>app_private.rent_business_date(p_organization_id) THEN
      RAISE EXCEPTION 'fee_payment_date_in_future' USING ERRCODE='22023';
    END IF;
    -- These keys were already locked before any lifecycle key. The checked
    -- helper now verifies branch-specific closure inside preview's rollback.
    FOR v_month IN SELECT DISTINCT date_trunc('month',d)::date FROM (
      SELECT (q->>'event_date')::date d FROM jsonb_array_elements(v_before->'queue') q
        WHERE q->>'allocation_state'<>'allocated'
          AND app_private.owner_distribution_source_required(p_organization_id,
            q->>'source_type',(q->>'source_line_id')::uuid,v_invoice.owner_person_id)
      UNION SELECT p_new_date UNION SELECT v_original.allocation_date) dates ORDER BY 1
    LOOP
      PERFORM app_private.lock_open_property_financial_month(p_organization_id,v_original.property_id,v_invoice.currency,v_month);
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.owner_balance_periods p WHERE p.organization_id=p_organization_id
      AND p.property_id=v_original.property_id AND p.currency=v_invoice.currency AND p.status='closed'
      AND p.owner_person_id=v_invoice.owner_person_id
      AND p.month_start>=date_trunc('month',least(p_new_date,v_original.allocation_date))::date) THEN
      RAISE EXCEPTION 'fee_payment_date_owner_period_closed' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app_private.validate_owner_roster_on_date(p_organization_id,v_original.property_id,p_new_date)
      WHERE owner_person_id=v_invoice.owner_person_id) THEN
      RAISE EXCEPTION 'fee_payment_date_owner_mismatch' USING ERRCODE='23514';
    END IF;
    -- Reconcile only this owner's real cash sources. A legacy cash settlement
    -- can precede its fee date, so allocate required noncash originals first.
    FOR v_source IN SELECT q.* FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_invoice.currency,DATE '0001-01-01',DATE '9999-12-31') q
      WHERE q.allocation_state='pending' AND q.source_type IN ('management_fee_occurrence','owner_paid_cost')
      AND EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations c
        JOIN public.owner_invoice_lines l ON l.organization_id=c.organization_id AND l.id=c.owner_invoice_line_id
        JOIN public.owner_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
        WHERE c.organization_id=p_organization_id AND c.property_id=v_original.property_id
          AND i.owner_person_id=v_invoice.owner_person_id AND l.source_id=q.source_line_id
          AND q.source_type=CASE l.source_type WHEN 'management_fee' THEN 'management_fee_occurrence' ELSE 'owner_paid_cost' END)
      ORDER BY q.event_date,q.source_type,q.source_line_id
    LOOP
      PERFORM public.allocate_owner_event(p_organization_id,v_source.source_type,v_source.source_line_id,
        'distribution-source:'||v_source.source_type||':'||v_source.source_line_id::text);
    END LOOP;
    PERFORM app_private.prepare_owner_distribution_sources(p_organization_id,v_original.property_id,v_invoice.currency,
      DATE '0001-01-01',DATE '9999-12-31',v_invoice.owner_person_id);
    PERFORM app_private.assert_owner_distribution_sources_allocated(p_organization_id,v_original.property_id,v_invoice.currency,
      DATE '9999-12-31',v_invoice.owner_person_id);
    -- A cash allocation is one explicit owner, with an original authoritative
    -- payment set. Ambiguous or incomplete legacy sources fail in the resolver.
    IF NOT EXISTS (SELECT 1 FROM public.owner_event_allocation_sets WHERE organization_id=p_organization_id
      AND source_type='owner_invoice_payment' AND source_line_id=p_allocation_id) THEN
      PERFORM public.allocate_owner_event(p_organization_id,'owner_invoice_payment',p_allocation_id,
        'distribution-source:owner_invoice_payment:'||p_allocation_id::text);
    END IF;
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by,reversal_of_id)
      VALUES(v_reversal,p_organization_id,v_original.property_id,v_original.owner_invoice_line_id,v_original.allocation_date,-v_original.amount,v_actor,p_allocation_id);
    PERFORM public.allocate_owner_event(p_organization_id,'reversal',v_reversal,'fee-date-reversal:'||v_id::text);
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by)
      VALUES(v_replacement,p_organization_id,v_original.property_id,v_original.owner_invoice_line_id,p_new_date,v_original.amount,v_actor);
    PERFORM public.allocate_owner_event(p_organization_id,'owner_invoice_payment',v_replacement,'fee-date-replacement:'||v_id::text);
    -- Validate every dated balance, including subsequent payouts. Current cash
    -- alone cannot prove a backdated debit left those obligations funded.
    IF EXISTS (WITH days AS (
      SELECT effective_date d,signed_amount amount FROM public.owner_opening_balance_entries
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency AND component='ips_held_owner_cash'
      UNION ALL SELECT event_date,signed_amount FROM public.owner_component_movements
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency AND component='ips_held_owner_cash'
    ), totals AS (SELECT d,sum(amount) amount FROM days GROUP BY d), running AS (
      SELECT d,sum(amount) OVER (ORDER BY d) balance FROM totals)
      SELECT 1 FROM running WHERE d>=least(p_new_date,v_original.allocation_date) AND balance<0) THEN
      RAISE EXCEPTION 'fee_payment_date_would_underfund_owner_cash' USING ERRCODE='23514';
    END IF;
    v_context := current_setting('app.owner_balance_write_context',true);
    PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
    INSERT INTO public.fee_payment_date_corrections(id,organization_id,property_id,original_allocation_id,reversal_allocation_id,
      replacement_allocation_id,old_date,new_date,amount,reason,created_by,idempotency_key,payload_hash,preview_hash)
    VALUES(v_id,p_organization_id,v_original.property_id,p_allocation_id,v_reversal,v_replacement,
      v_original.allocation_date,p_new_date,v_original.amount,CASE WHEN p_preview THEN 'Preview validation only' ELSE btrim(p_reason) END,
      v_actor,CASE WHEN p_preview THEN 'preview:'||v_id::text ELSE btrim(p_idempotency_key) END,v_payload,v_hash);
    PERFORM set_config('app.owner_balance_write_context',coalesce(v_context,''),true);
    INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,v_actor,'fee_payment_date_correction',v_id,'corrected',jsonb_build_object(
      'allocationId',p_allocation_id,'replacementAllocationId',v_replacement,'oldDate',v_original.allocation_date,
      'newDate',p_new_date,'amount',v_original.amount,'reason',p_reason));
    SELECT coalesce(sum(amount),0) INTO v_cash_after FROM (
      SELECT signed_amount amount FROM public.owner_component_movements
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency
          AND component='ips_held_owner_cash' AND event_date<=v_business_date
      UNION ALL SELECT signed_amount FROM public.owner_opening_balance_entries
        WHERE organization_id=p_organization_id AND property_id=v_original.property_id
          AND owner_person_id=v_invoice.owner_person_id AND currency=v_invoice.currency
          AND component='ips_held_owner_cash' AND effective_date<=v_business_date
    ) current_cash;
    v_result := v_result||jsonb_build_object('currentBalanceChange',v_cash_after-v_cash_before);
    IF p_preview THEN RAISE EXCEPTION 'fee_payment_date_preview_rollback' USING ERRCODE='PFC01'; END IF;
  EXCEPTION
    WHEN SQLSTATE 'PFC01' THEN NULL;
    WHEN OTHERS THEN
      IF NOT p_preview THEN RAISE; END IF;
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
      v_result := v_result||jsonb_build_object('canApply',false,'blockers',jsonb_build_array(v_error));
  END;
  IF p_preview THEN RETURN v_result; END IF;
  RETURN jsonb_build_object('correctionId',v_id);
END;
$$;

CREATE FUNCTION public.preview_fee_payment_date_correction(p_organization_id uuid,p_allocation_id uuid,p_payment_date date)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT app_private.run_fee_payment_date_correction(p_organization_id,p_allocation_id,p_payment_date,'Preview validation only',NULL,NULL,true);
$$;
CREATE FUNCTION public.correct_fee_payment_date(p_organization_id uuid,p_allocation_id uuid,p_payment_date date,p_reason text,p_preview_hash text,p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT app_private.run_fee_payment_date_correction(p_organization_id,p_allocation_id,p_payment_date,p_reason,p_preview_hash,p_idempotency_key,false);
$$;
REVOKE ALL ON FUNCTION app_private.fee_payment_date_snapshot(uuid,uuid,public.currency_code,date,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.run_fee_payment_date_correction(uuid,uuid,date,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_fee_payment_date_candidates(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_fee_payment_date_correction(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.correct_fee_payment_date(uuid,uuid,date,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_fee_payment_date_candidates(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_fee_payment_date_correction(uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_fee_payment_date(uuid,uuid,date,text,text,text) TO authenticated;
