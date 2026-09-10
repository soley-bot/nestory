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

-- Materialize existing source facts only. Never synthesize an opening balance.
-- Refresh after every allocation: legacy settlements depend on original costs,
-- and reversals depend on the original source allocation. Any error is fatal.
CREATE FUNCTION app_private.prepare_owner_distribution_sources(
  p_organization_id uuid, p_property_id uuid, p_currency public.currency_code,
  p_start date, p_end date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_day date; v_source record; v_count integer := 0;
BEGIN
  IF p_end < p_start THEN RETURN; END IF;
  LOOP
    SELECT min(queue.event_date) INTO v_day
    FROM public.get_owner_event_allocation_queue(
      p_organization_id, p_property_id, p_currency, p_start, p_end
    ) AS queue WHERE queue.allocation_state <> 'allocated';
    EXIT WHEN v_day IS NULL;

    SELECT queue.* INTO v_source
    FROM public.get_owner_event_allocation_queue(
      p_organization_id, p_property_id, p_currency, v_day, v_day
    ) AS queue
    WHERE queue.allocation_state = 'pending'
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
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_owner_distribution(
  p_organization_id uuid, p_property_id uuid, p_owner_person_id uuid,
  p_currency public.currency_code, p_amount numeric, p_distribution_date date,
  p_reference text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_queue jsonb; v_locked_queue jsonb; v_month date; v_owner uuid; v_result jsonb; v_source record;
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
    p_organization_id, p_property_id, p_currency, p_distribution_date + 1, DATE '9999-12-31');
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id, NULL, 'finance.record_payments', false);
  RETURN v_result;
END;
$$;
