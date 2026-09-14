-- Posting uses exact-date cash authority, not the current-month display contract.
DO $patch$
DECLARE v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.record_owner_distribution_baseline(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, 'v_capacity := public.get_owner_available_withdrawal(') = 0
    OR pg_catalog.strpos(v_definition, 'IF v_available < p_amount THEN') = 0 THEN
    RAISE EXCEPTION 'owner_distribution_capacity_patch_target_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition,
    'v_capacity := public.get_owner_available_withdrawal(',
    'v_capacity := app_private.get_owner_available_withdrawal_baseline(');
  v_definition := pg_catalog.replace(v_definition,
    'IF v_available < p_amount THEN',
    'IF v_available IS NULL OR v_available < p_amount THEN');
  EXECUTE v_definition;
END;
$patch$;

-- Classify cash by the same owner/component facts used by the allocator.
-- Legacy settlements may need classification before their non-cash original
-- exists; their invoice owner and signed cash allocation are authoritative.
CREATE FUNCTION app_private.owner_distribution_source_cash(
  p_organization_id uuid, p_source_type text, p_source_line_id uuid,
  p_owner_person_id uuid
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_set uuid; v_source record; v_cash numeric; v_owner uuid;
BEGIN
  SELECT source.id INTO v_set FROM public.owner_event_allocation_sets AS source
  WHERE source.organization_id = p_organization_id
    AND source.source_type = p_source_type AND source.source_line_id = p_source_line_id;
  IF FOUND THEN
    SELECT coalesce(sum(movement.signed_amount), 0) INTO v_cash
    FROM public.owner_component_movements AS movement
    JOIN public.owner_event_owner_allocations AS allocation
      ON allocation.organization_id = movement.organization_id
      AND allocation.id = movement.owner_event_owner_allocation_id
    WHERE allocation.organization_id = p_organization_id AND allocation.allocation_set_id = v_set
      AND movement.owner_person_id = p_owner_person_id
      AND movement.component = 'ips_held_owner_cash';
    RETURN v_cash;
  END IF;

  IF p_source_type IN ('owner_invoice_payment', 'reversal') THEN
    SELECT invoice.owner_person_id, -cash.amount INTO v_owner, v_cash
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id AND invoice.id = line.invoice_id
    WHERE cash.organization_id = p_organization_id AND cash.id = p_source_line_id
      AND ((p_source_type = 'owner_invoice_payment' AND cash.reversal_of_id IS NULL)
        OR (p_source_type = 'reversal' AND cash.reversal_of_id IS NOT NULL));
    IF FOUND THEN
      RETURN CASE WHEN v_owner = p_owner_person_id THEN v_cash ELSE 0 END;
    END IF;
    -- Expense adjustments reverse owner_due_to_ips, never held cash.
    IF p_source_type = 'reversal' AND EXISTS (
      SELECT 1 FROM public.expense_customer_adjustments AS adjustment
      WHERE adjustment.organization_id = p_organization_id AND adjustment.id = p_source_line_id
        AND adjustment.responsibility = 'owner'
    ) THEN RETURN 0; END IF;
  END IF;

  IF p_source_type IN ('management_fee_occurrence', 'owner_paid_cost',
    'owner_direct_rent_receipt', 'security_deposit_receipt', 'security_deposit_refund', 'owner_reimbursement') THEN
    RETURN 0;
  END IF;
  -- Queue discovery admits valid legacy deposit reversals whose originals have
  -- not been allocated yet. Their component is custody, not owner held cash.
  IF p_source_type = 'reversal' AND EXISTS (
    SELECT 1 FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id AND event.id = p_source_line_id
      AND event.reversal_of_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM public.tenant_invoice_payment_allocations WHERE organization_id = p_organization_id AND id = p_source_line_id
    UNION ALL SELECT 1 FROM public.owner_collection_confirmation_allocations WHERE organization_id = p_organization_id AND id = p_source_line_id
    UNION ALL SELECT 1 FROM public.owner_payment_allocations WHERE organization_id = p_organization_id AND id = p_source_line_id
    UNION ALL SELECT 1 FROM public.property_withdrawals WHERE organization_id = p_organization_id AND id = p_source_line_id
  ) THEN RETURN 0; END IF;

  SELECT source.* INTO STRICT v_source
  FROM app_private.resolve_owner_event_source(p_organization_id, p_source_type, p_source_line_id) AS source;
  IF v_source.reversal_of_allocation_set_id IS NOT NULL THEN
    SELECT coalesce(-sum(movement.signed_amount), 0) INTO v_cash
    FROM public.owner_component_movements AS movement
    JOIN public.owner_event_owner_allocations AS allocation
      ON allocation.organization_id = movement.organization_id
      AND allocation.id = movement.owner_event_owner_allocation_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.allocation_set_id = v_source.reversal_of_allocation_set_id
      AND movement.owner_person_id = p_owner_person_id
      AND movement.component = 'ips_held_owner_cash';
    RETURN v_cash;
  END IF;
  IF v_source.activity_only OR v_source.component IS DISTINCT FROM 'ips_held_owner_cash'::public.owner_balance_component THEN
    RETURN 0;
  END IF;
  IF v_source.allocation_basis = 'explicit_owner' THEN
    RETURN CASE WHEN v_source.explicit_owner_person_id = p_owner_person_id THEN v_source.gross_signed_amount ELSE 0 END;
  END IF;
  -- Membership is sufficient for direction; the allocator performs the exact
  -- cent split and all roster validation before writing a shared source.
  IF EXISTS (SELECT 1 FROM public.property_owners AS roster
    WHERE roster.organization_id = p_organization_id AND roster.property_id = v_source.property_id
      AND roster.person_id = p_owner_person_id AND roster.ownership_percent > 0
      AND roster.archived_at IS NULL AND roster.started_on <= v_source.event_date
      AND (roster.ended_on IS NULL OR v_source.event_date < roster.ended_on)
  ) THEN RETURN v_source.gross_signed_amount; END IF;
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION app_private.owner_distribution_source_cash(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- A transfer is one economic event: retain its counterpart line whenever
-- either line moves the selected owner's held cash.
CREATE FUNCTION app_private.owner_distribution_source_required(
  p_organization_id uuid, p_source_type text, p_source_line_id uuid,
  p_owner_person_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT app_private.owner_distribution_source_cash(
    p_organization_id, p_source_type, p_source_line_id, p_owner_person_id) <> 0
  OR (p_source_type = 'owner_component_transfer' AND EXISTS (
    SELECT 1 FROM public.owner_component_transfer_lines AS line
    JOIN public.owner_component_transfer_lines AS counterpart
      ON counterpart.organization_id = line.organization_id
      AND counterpart.transfer_instruction_id = line.transfer_instruction_id
    JOIN public.owner_component_transfer_instructions AS instruction
      ON instruction.organization_id = line.organization_id AND instruction.id = line.transfer_instruction_id
    WHERE line.organization_id = p_organization_id AND line.id = p_source_line_id
      AND instruction.component = 'ips_held_owner_cash'
      AND counterpart.owner_person_id = p_owner_person_id AND counterpart.signed_amount <> 0
  ));
$$;
REVOKE ALL ON FUNCTION app_private.owner_distribution_source_required(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Materialize existing source facts only. Never synthesize an opening balance.
-- Refresh after every allocation: legacy settlements depend on original costs,
-- and reversals depend on the original source allocation. Any error is fatal.
CREATE FUNCTION app_private.prepare_owner_distribution_sources(
  p_organization_id uuid, p_property_id uuid, p_currency public.currency_code,
  p_start date, p_end date, p_owner_person_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_day date; v_source record; v_count integer := 0;
BEGIN
  IF p_end < p_start THEN RETURN; END IF;
  LOOP
    SELECT min(queue.event_date) INTO v_day
    FROM public.get_owner_event_allocation_queue(
      p_organization_id, p_property_id, p_currency, p_start, p_end
    ) AS queue WHERE queue.allocation_state <> 'allocated'
      AND (p_owner_person_id IS NULL OR app_private.owner_distribution_source_required(
        p_organization_id, queue.source_type, queue.source_line_id, p_owner_person_id));
    EXIT WHEN v_day IS NULL;

    SELECT queue.* INTO v_source
    FROM public.get_owner_event_allocation_queue(
      p_organization_id, p_property_id, p_currency, v_day, v_day
    ) AS queue
    WHERE queue.allocation_state = 'pending'
      AND (p_owner_person_id IS NULL OR app_private.owner_distribution_source_required(
        p_organization_id, queue.source_type, queue.source_line_id, p_owner_person_id))
    ORDER BY CASE queue.source_type
      WHEN 'management_fee_occurrence' THEN 0 WHEN 'owner_paid_cost' THEN 0
      WHEN 'tenant_rent_receipt' THEN 1 WHEN 'owner_contribution' THEN 1
      WHEN 'owner_direct_rent_receipt' THEN 1 WHEN 'security_deposit_receipt' THEN 1
      WHEN 'reversal' THEN 2 WHEN 'owner_invoice_payment' THEN 3 ELSE 4 END,
      queue.source_type, queue.source_line_id
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'owner_cash_source_remediation_required' USING ERRCODE = '23514';
    END IF;
    v_count := v_count + 1;
    IF v_count > 5000 THEN
      RAISE EXCEPTION 'owner_cash_source_remediation_required' USING ERRCODE = '23514';
    END IF;
    PERFORM public.allocate_owner_event(
      p_organization_id, v_source.source_type, v_source.source_line_id,
      'distribution-source:' || v_source.source_type || ':' || v_source.source_line_id::text
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prepare_owner_distribution_sources(
  uuid, uuid, public.currency_code, date, date, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_owner_distribution(
  p_organization_id uuid, p_property_id uuid, p_owner_person_id uuid,
  p_currency public.currency_code, p_amount numeric, p_distribution_date date,
  p_reference text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_queue jsonb; v_locked_queue jsonb; v_month date; v_owner uuid; v_result jsonb; v_source record;
  v_obligation_end date;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.can_access_property(
    p_organization_id, p_property_id, 'finance.record_payments'
  ) THEN
    RAISE EXCEPTION 'owner_distribution_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_distribution_date IS NULL THEN
    RAISE EXCEPTION 'owner_distribution_date_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.idempotency_key = pg_catalog.btrim(p_idempotency_key)) THEN
    RETURN app_private.record_owner_distribution_baseline(
      p_organization_id, p_property_id, p_owner_person_id, p_currency,
      p_amount, p_distribution_date, p_reference, p_idempotency_key);
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(queue)
    ORDER BY queue.event_date, queue.source_type, queue.source_line_id), '[]'::jsonb)
  INTO v_queue FROM public.get_owner_event_allocation_queue(
    p_organization_id, p_property_id, p_currency, DATE '0001-01-01', DATE '9999-12-31'
  ) AS queue;

  -- Future credits and non-cash accruals alone are not obligations of this
  -- payout. Stop at the last existing source that can consume held cash.
  SELECT greatest(p_distribution_date, max((item->>'event_date')::date))
  INTO v_obligation_end FROM pg_catalog.jsonb_array_elements(v_queue) AS item
  WHERE (item->>'event_date')::date > p_distribution_date
    AND CASE WHEN item->>'source_type' IN (
      'owner_distribution', 'owner_invoice_payment', 'reversal', 'owner_component_transfer'
    ) THEN app_private.owner_distribution_source_cash(p_organization_id,
      item->>'source_type', (item->>'source_line_id')::uuid, p_owner_person_id) < 0
      ELSE false END;

  -- All financial-month locks precede all lifecycle locks, including future
  -- obligations which must remain fully funded after a backdated payout.
  FOR v_month IN
    SELECT DISTINCT pg_catalog.date_trunc('month', dates.event_date)::date
    FROM (SELECT (item->>'event_date')::date AS event_date
      FROM pg_catalog.jsonb_array_elements(v_queue) AS item
      UNION SELECT p_distribution_date) AS dates ORDER BY 1
  LOOP
    PERFORM app_private.lock_property_financial_month(
      p_organization_id, p_property_id, p_currency, v_month);
  END LOOP;
  FOR v_owner IN
    SELECT owners.person_id FROM (
      SELECT p_owner_person_id AS person_id
      UNION SELECT person_id FROM public.property_owners
        WHERE organization_id = p_organization_id AND property_id = p_property_id
      UNION SELECT allocation.owner_person_id FROM public.owner_event_owner_allocations AS allocation
        JOIN public.owner_event_allocation_sets AS source
          ON source.organization_id = allocation.organization_id AND source.id = allocation.allocation_set_id
        WHERE source.organization_id = p_organization_id AND source.property_id = p_property_id
      UNION SELECT owner_person_id FROM public.owner_cash_events
        WHERE organization_id = p_organization_id AND property_id = p_property_id
      UNION SELECT owner_person_id FROM public.property_withdrawals
        WHERE organization_id = p_organization_id AND property_id = p_property_id
      UNION SELECT from_owner_person_id FROM public.owner_component_transfer_instructions
        WHERE organization_id = p_organization_id AND property_id = p_property_id
      UNION SELECT to_owner_person_id FROM public.owner_component_transfer_instructions
        WHERE organization_id = p_organization_id AND property_id = p_property_id
    ) AS owners WHERE owners.person_id IS NOT NULL ORDER BY owners.person_id
  LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id, p_property_id, v_owner, p_currency);
  END LOOP;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(queue)
    ORDER BY queue.event_date, queue.source_type, queue.source_line_id), '[]'::jsonb)
  INTO v_locked_queue FROM public.get_owner_event_allocation_queue(
    p_organization_id, p_property_id, p_currency, DATE '0001-01-01', DATE '9999-12-31'
  ) AS queue;
  IF v_locked_queue IS DISTINCT FROM v_queue THEN
    RAISE EXCEPTION 'owner_distribution_sources_changed' USING ERRCODE = '40001';
  END IF;

  -- Keep the established prohibition on changing already allocated consumers.
  IF EXISTS (SELECT 1 FROM public.owner_component_movements AS movement
    WHERE movement.organization_id = p_organization_id AND movement.property_id = p_property_id
      AND movement.owner_person_id = p_owner_person_id AND movement.currency = p_currency
      AND movement.component = 'ips_held_owner_cash' AND movement.signed_amount < 0
      AND movement.event_date > p_distribution_date
      AND NOT EXISTS (SELECT 1 FROM public.owner_component_movements AS reversal
        WHERE reversal.organization_id = movement.organization_id
          AND reversal.reversal_of_movement_id = movement.id)) THEN
    RAISE EXCEPTION 'backdated_owner_cash_consumer' USING ERRCODE = '23514';
  END IF;

  -- A legacy payment can predate its invoice/fee. Allocate its non-cash
  -- original first, at the original date; this never creates held cash.
  FOR v_source IN SELECT queue.* FROM public.get_owner_event_allocation_queue(
    p_organization_id, p_property_id, p_currency, DATE '0001-01-01', DATE '9999-12-31'
  ) AS queue WHERE queue.allocation_state = 'pending'
    AND queue.source_type IN ('management_fee_occurrence', 'owner_paid_cost')
    AND (queue.event_date <= p_distribution_date OR EXISTS (
      SELECT 1 FROM public.owner_charge_cash_allocations AS cash
      JOIN public.owner_invoice_lines AS line
        ON line.organization_id = cash.organization_id AND line.id = cash.owner_invoice_line_id
      WHERE cash.organization_id = p_organization_id AND cash.property_id = p_property_id
        AND cash.allocation_date <= v_obligation_end AND line.source_id = queue.source_line_id
        AND queue.source_type = CASE line.source_type
          WHEN 'management_fee' THEN 'management_fee_occurrence' WHEN 'owner_expense' THEN 'owner_paid_cost' END
        AND (cash.allocation_date <= p_distribution_date OR EXISTS (
          SELECT 1 FROM public.owner_invoices AS invoice
          WHERE invoice.organization_id = line.organization_id AND invoice.id = line.invoice_id
            AND invoice.owner_person_id = p_owner_person_id
        ))
    ))
    ORDER BY queue.event_date, queue.source_type, queue.source_line_id
  LOOP
    PERFORM public.allocate_owner_event(p_organization_id, v_source.source_type,
      v_source.source_line_id,
      'distribution-source:' || v_source.source_type || ':' || v_source.source_line_id::text);
  END LOOP;
  PERFORM app_private.prepare_owner_distribution_sources(
    p_organization_id, p_property_id, p_currency, DATE '0001-01-01', p_distribution_date);
  PERFORM app_private.assert_owner_cash_sources_allocated(
    p_organization_id, p_property_id, p_currency, p_distribution_date);
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id, p_property_id, 'finance.record_payments');
  v_result := app_private.record_owner_distribution_baseline(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_amount, p_distribution_date, p_reference, p_idempotency_key);

  -- Atomic validation of later source obligations: later cash cannot fund the
  -- payout, and the payout cannot strand an existing later charge or reversal.
  PERFORM app_private.prepare_owner_distribution_sources(
    p_organization_id, p_property_id, p_currency, p_distribution_date + 1, v_obligation_end, p_owner_person_id);
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id, NULL, 'finance.record_payments', false);
  RETURN v_result;
END;
$$;
