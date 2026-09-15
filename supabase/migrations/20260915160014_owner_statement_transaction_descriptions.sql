-- Freeze real transaction descriptions in new close revisions. Never rewrite
-- retained close lines, publication hashes, or already-issued artifacts.
ALTER TABLE public.owner_close_lines DROP CONSTRAINT owner_close_lines_description_check;
ALTER TABLE public.owner_close_lines ADD CONSTRAINT owner_close_lines_description_check
  CHECK (pg_catalog.length(pg_catalog.btrim(description)) >= 1);

CREATE OR REPLACE FUNCTION app_private.owner_statement_source_description(
  p_organization_id uuid, p_allocation_set_id uuid
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE
  v_set public.owner_event_allocation_sets%ROWTYPE;
  v_id uuid := p_allocation_set_id;
  v_description text;
  v_prefix text := '';
  v_depth integer := 0;
BEGIN
  LOOP
    SELECT * INTO v_set FROM public.owner_event_allocation_sets
    WHERE organization_id=p_organization_id AND id=v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'owner_statement_source_missing' USING ERRCODE='23514';
    END IF;
    EXIT WHEN v_set.source_type <> 'reversal' OR v_set.reversal_of_allocation_set_id IS NULL;
    v_depth := v_depth + 1;
    IF v_depth > 32 THEN RAISE EXCEPTION 'owner_statement_reversal_chain_invalid' USING ERRCODE='23514'; END IF;
    v_prefix := 'Reversal: ';
    v_id := v_set.reversal_of_allocation_set_id;
  END LOOP;

  CASE v_set.source_type
  WHEN 'tenant_rent_receipt' THEN
    SELECT coalesce(nullif(btrim(l.description),''),nullif(btrim(l.customer_label),'')) INTO v_description
    FROM public.tenant_invoice_payment_allocations a
    JOIN public.tenant_invoice_lines l ON l.organization_id=a.organization_id AND l.id=a.invoice_line_id
    WHERE a.organization_id=p_organization_id AND a.id=v_set.source_line_id;
  WHEN 'owner_direct_rent_receipt' THEN
    SELECT coalesce(nullif(btrim(l.description),''),nullif(btrim(l.customer_label),'')) INTO v_description
    FROM public.owner_collection_confirmation_allocations a
    JOIN public.tenant_invoice_lines l ON l.organization_id=a.organization_id AND l.id=a.invoice_line_id
    WHERE a.organization_id=p_organization_id AND a.id=v_set.source_line_id;
  WHEN 'management_fee_occurrence' THEN
    SELECT coalesce(nullif(btrim(l.description),''),nullif(btrim(l.customer_label),'')) INTO v_description
    FROM public.owner_invoice_lines l
    WHERE l.organization_id=p_organization_id AND l.source_type='management_fee' AND l.source_id=v_set.source_line_id
    ORDER BY l.created_at,l.id LIMIT 1;
  WHEN 'owner_paid_cost' THEN
    SELECT coalesce(nullif(btrim(e.description),''),nullif(btrim(l.description),''),nullif(btrim(r.customer_label),'')) INTO v_description
    FROM public.ips_expense_responsibilities r
    JOIN public.finance_expense_items e ON e.organization_id=r.organization_id AND e.id=r.finance_expense_item_id
    LEFT JOIN public.owner_invoice_lines l ON l.organization_id=r.organization_id AND l.id=r.owner_invoice_line_id
    WHERE r.organization_id=p_organization_id AND r.id=v_set.source_line_id;
  WHEN 'owner_invoice_payment' THEN
    SELECT coalesce(nullif(btrim(l.description),''),nullif(btrim(l.customer_label),'')) INTO v_description
    FROM public.owner_payment_allocations a
    JOIN public.owner_invoice_lines l ON l.organization_id=a.organization_id AND l.id=a.owner_invoice_line_id
    WHERE a.organization_id=p_organization_id AND a.id=v_set.source_line_id;
    IF v_description IS NULL THEN
      SELECT coalesce(nullif(btrim(l.description),''),nullif(btrim(l.customer_label),'')) INTO v_description
      FROM public.owner_charge_cash_allocations a
      JOIN public.owner_invoice_lines l ON l.organization_id=a.organization_id AND l.id=a.owner_invoice_line_id
      WHERE a.organization_id=p_organization_id AND a.id=v_set.source_line_id;
    END IF;
  WHEN 'owner_contribution', 'owner_reimbursement' THEN
    SELECT coalesce(nullif(btrim(e.reason),''),nullif(btrim(e.reference),'')) INTO v_description
    FROM public.owner_cash_events e WHERE e.organization_id=p_organization_id AND e.id=v_set.source_line_id;
  WHEN 'owner_distribution' THEN
    SELECT nullif(btrim(w.reference),'') INTO v_description FROM public.property_withdrawals w
    WHERE w.organization_id=p_organization_id AND w.id=v_set.source_line_id;
  WHEN 'security_deposit_receipt', 'security_deposit_refund' THEN
    SELECT nullif(btrim(e.reference),'') INTO v_description FROM public.lease_deposit_events e
    WHERE e.organization_id=p_organization_id AND e.id=v_set.source_line_id;
  WHEN 'owner_component_transfer' THEN
    SELECT nullif(btrim(i.reason),'') INTO v_description FROM public.owner_component_transfer_lines l
    JOIN public.owner_component_transfer_instructions i ON i.organization_id=l.organization_id AND i.id=l.transfer_instruction_id
    WHERE l.organization_id=p_organization_id AND l.id=v_set.source_line_id;
  WHEN 'owner_close_correction' THEN
    SELECT nullif(btrim(c.reason),'') INTO v_description FROM public.owner_close_corrections c
    WHERE c.organization_id=p_organization_id AND c.id=v_set.source_line_id;
  ELSE NULL;
  END CASE;
  RETURN v_prefix || coalesce(v_description, app_private.owner_close_source_label(v_set.source_type));
END;
$$;
ALTER FUNCTION app_private.owner_statement_source_description(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_statement_source_description(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.freeze_owner_close_revision(
  p_organization_id uuid,
  p_revision_id uuid,
  p_period_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_business_count integer := 0;
  v_previous_period_id uuid;
BEGIN
  SELECT period.id
  INTO v_previous_period_id
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = (p_month_start - INTERVAL '1 month')::date;

  INSERT INTO public.owner_close_lines (
    owner_close_revision_id, organization_id, line_number, line_kind,
    component, description, business_date, signed_amount, source_count,
    created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    app_private.owner_close_component_rank(component.component),
    'opening',
    component.component,
    CASE component.component
      WHEN 'ips_held_owner_cash' THEN 'Opening IPS-held owner cash'
      WHEN 'owner_due_to_ips' THEN 'Opening owner due to IPS'
      WHEN 'ips_due_to_owner' THEN 'Opening IPS due to owner'
      WHEN 'security_deposit_custody' THEN 'Opening security-deposit custody'
    END,
    p_month_start,
    component.opening_amount,
    CASE
      WHEN v_previous_period_id IS NOT NULL THEN 1
      ELSE (
        SELECT count(*)::integer
        FROM public.owner_opening_balance_entries AS entry
        WHERE entry.organization_id = p_organization_id
          AND entry.property_id = p_property_id
          AND entry.owner_person_id = p_owner_person_id
          AND entry.currency = p_currency
          AND entry.effective_date = p_month_start
          AND entry.component = component.component
      )
    END,
    p_actor_id
  FROM public.owner_balance_period_components AS component
  WHERE component.organization_id = p_organization_id
    AND component.owner_balance_period_id = p_period_id
  ORDER BY app_private.owner_close_component_rank(component.component);

  IF v_previous_period_id IS NOT NULL THEN
    INSERT INTO public.owner_close_line_sources (
      owner_close_revision_id, organization_id, close_line_id,
      source_type, source_id, source_line_id, source_fingerprint,
      owner_balance_period_component_id, created_by
    )
    SELECT
      p_revision_id,
      p_organization_id,
      line.id,
      'prior_period_component',
      v_previous_period_id,
      previous_component.id,
      pg_catalog.encode(
        extensions.digest(
          v_previous_period_id::text || '|' ||
          previous_component.component::text || '|' ||
          pg_catalog.to_char(
            previous_component.closing_amount, 'FM999999999990.00'
          ),
          'sha256'
        ),
        'hex'
      ),
      previous_component.id,
      p_actor_id
    FROM public.owner_close_lines AS line
    JOIN public.owner_balance_period_components AS previous_component
      ON previous_component.organization_id = p_organization_id
     AND previous_component.owner_balance_period_id = v_previous_period_id
     AND previous_component.component = line.component
    WHERE line.organization_id = p_organization_id
      AND line.owner_close_revision_id = p_revision_id
      AND line.line_kind = 'opening';
  ELSE
    INSERT INTO public.owner_close_line_sources (
      owner_close_revision_id, organization_id, close_line_id,
      source_type, source_id, source_line_id, source_fingerprint,
      owner_opening_balance_entry_id, created_by
    )
    SELECT
      p_revision_id,
      p_organization_id,
      line.id,
      'opening_balance_entry',
      entry.request_id,
      entry.id,
      pg_catalog.encode(
        extensions.digest(
          entry.id::text || '|' || entry.request_id::text || '|' ||
          entry.component::text || '|' || entry.entry_kind || '|' ||
          pg_catalog.to_char(entry.signed_amount, 'FM999999999990.00') || '|' ||
          request.evidence_sha256,
          'sha256'
        ),
        'hex'
      ),
      entry.id,
      p_actor_id
    FROM public.owner_close_lines AS line
    JOIN public.owner_opening_balance_entries AS entry
      ON entry.organization_id = p_organization_id
     AND entry.property_id = p_property_id
     AND entry.owner_person_id = p_owner_person_id
     AND entry.currency = p_currency
     AND entry.effective_date = p_month_start
     AND entry.component = line.component
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id
     AND request.id = entry.request_id
    WHERE line.organization_id = p_organization_id
      AND line.owner_close_revision_id = p_revision_id
      AND line.line_kind = 'opening';
  END IF;

  WITH business_rows AS (
    SELECT
      gen_random_uuid() AS line_id,
      'movement'::text AS line_kind,
      movement.component,
      app_private.owner_statement_source_description(p_organization_id, allocation_set.id) AS description,
      movement.event_date AS business_date,
      movement.signed_amount,
      allocation_set.source_type,
      allocation_set.source_id,
      allocation_set.source_line_id,
      allocation_set.source_fingerprint,
      movement.id AS owner_component_movement_id,
      NULL::uuid AS owner_event_owner_allocation_id,
      app_private.owner_close_source_rank(allocation_set.source_type) AS source_rank,
      app_private.owner_close_component_rank(movement.component) AS component_rank,
      movement.id AS stable_id
    FROM public.owner_component_movements AS movement
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = movement.organization_id
     AND owner_allocation.id = movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = owner_allocation.organization_id
     AND allocation_set.id = owner_allocation.allocation_set_id
    WHERE movement.organization_id = p_organization_id
      AND movement.property_id = p_property_id
      AND movement.owner_person_id = p_owner_person_id
      AND movement.currency = p_currency
      AND movement.month_start = p_month_start

    UNION ALL

    SELECT
      gen_random_uuid(),
      'activity'::text,
      NULL::public.owner_balance_component,
      app_private.owner_statement_source_description(p_organization_id, allocation_set.id),
      allocation_set.event_date,
      owner_allocation.allocated_gross_signed_amount,
      allocation_set.source_type,
      allocation_set.source_id,
      allocation_set.source_line_id,
      allocation_set.source_fingerprint,
      NULL::uuid,
      owner_allocation.id,
      app_private.owner_close_source_rank(allocation_set.source_type),
      0,
      owner_allocation.id
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.property_id = p_property_id
      AND allocation_set.currency = p_currency
      AND allocation_set.event_date >= p_month_start
      AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
      AND owner_allocation.owner_person_id = p_owner_person_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_movements AS movement
        WHERE movement.organization_id = owner_allocation.organization_id
          AND movement.owner_event_owner_allocation_id = owner_allocation.id
      )
  ), numbered AS (
    SELECT business.*,
      4 + pg_catalog.row_number() OVER (
        ORDER BY business.business_date, business.source_rank,
          business.source_line_id, business.component_rank,
          business.stable_id
      )::integer AS line_number
    FROM business_rows AS business
  ), inserted_lines AS (
    INSERT INTO public.owner_close_lines (
      id, owner_close_revision_id, organization_id, line_number, line_kind,
      component, description, business_date, signed_amount, source_count,
      created_by
    )
    SELECT
      numbered.line_id, p_revision_id, p_organization_id,
      numbered.line_number, numbered.line_kind, numbered.component,
      numbered.description, numbered.business_date, numbered.signed_amount,
      1, p_actor_id
    FROM numbered
    ORDER BY numbered.line_number
    RETURNING id
  )
  INSERT INTO public.owner_close_line_sources (
    owner_close_revision_id, organization_id, close_line_id,
    source_type, source_id, source_line_id, source_fingerprint,
    owner_component_movement_id, owner_event_owner_allocation_id, created_by
  )
  SELECT
    p_revision_id, p_organization_id, numbered.line_id,
    numbered.source_type, numbered.source_id, numbered.source_line_id,
    numbered.source_fingerprint, numbered.owner_component_movement_id,
    numbered.owner_event_owner_allocation_id, p_actor_id
  FROM numbered
  JOIN inserted_lines ON inserted_lines.id = numbered.line_id;

  SELECT count(*)::integer
  INTO v_business_count
  FROM public.owner_close_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.owner_close_revision_id = p_revision_id
    AND line.line_kind IN ('movement', 'activity');

  INSERT INTO public.owner_close_lines (
    owner_close_revision_id, organization_id, line_number, line_kind,
    component, description, business_date, signed_amount, source_count,
    created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    4 + v_business_count
      + app_private.owner_close_component_rank(component.component),
    'closing',
    component.component,
    CASE component.component
      WHEN 'ips_held_owner_cash' THEN 'Closing IPS-held owner cash'
      WHEN 'owner_due_to_ips' THEN 'Closing owner due to IPS'
      WHEN 'ips_due_to_owner' THEN 'Closing IPS due to owner'
      WHEN 'security_deposit_custody' THEN 'Closing security-deposit custody'
    END,
    (p_month_start + INTERVAL '1 month - 1 day')::date,
    component.closing_amount,
    1,
    p_actor_id
  FROM public.owner_balance_period_components AS component
  WHERE component.organization_id = p_organization_id
    AND component.owner_balance_period_id = p_period_id
  ORDER BY app_private.owner_close_component_rank(component.component);

  INSERT INTO public.owner_close_line_sources (
    owner_close_revision_id, organization_id, close_line_id,
    source_type, source_id, source_line_id, source_fingerprint,
    owner_balance_period_component_id, created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    line.id,
    'period_component',
    p_period_id,
    component.id,
    pg_catalog.encode(
      extensions.digest(
        p_period_id::text || '|' || component.component::text || '|' ||
        pg_catalog.to_char(component.opening_amount, 'FM999999999990.00') || '|' ||
        pg_catalog.to_char(component.movement_amount, 'FM999999999990.00') || '|' ||
        pg_catalog.to_char(component.closing_amount, 'FM999999999990.00'),
        'sha256'
      ),
      'hex'
    ),
    component.id,
    p_actor_id
  FROM public.owner_close_lines AS line
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = p_organization_id
   AND component.owner_balance_period_id = p_period_id
   AND component.component = line.component
  WHERE line.organization_id = p_organization_id
    AND line.owner_close_revision_id = p_revision_id
    AND line.line_kind = 'closing';

  RETURN v_business_count;
END;
$$;
