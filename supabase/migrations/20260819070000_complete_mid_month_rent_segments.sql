CREATE OR REPLACE FUNCTION app_private.guard_tenant_invoice_rent_segments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_setting('app.rent_generation_context', true) = 'lease-derived-v1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND current_setting('app.rent_segment_repair_context', true) = 'next-full-month-v1' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'tenant_invoice_rent_segments_immutable'
    USING ERRCODE = '55000';
END;
$$;

ALTER FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) RENAME TO generate_simple_lease_rent_invoice_before_segment_completion;

CREATE FUNCTION app_private.generate_simple_lease_rent_invoice(
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
  v_income_item_id uuid;
  v_invoice_id uuid;
  v_line_id uuid;
  v_period_end date;
  v_starting_term public.lease_terms%ROWTYPE;
BEGIN
  v_invoice_id := app_private.generate_simple_lease_rent_invoice_before_segment_completion(
    p_organization_id,
    p_lease_id,
    p_billing_period_start,
    p_issue_date,
    p_generation_reason,
    p_actor_id
  );

  v_period_end := (p_billing_period_start + interval '1 month - 1 day')::date;

  SELECT billing.* INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND p_billing_period_start BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_billing.mid_period_rent_change_rule <> 'next_full_month' THEN
    RETURN v_invoice_id;
  END IF;

  SELECT term.* INTO v_starting_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status IN ('active', 'upcoming')
    AND term.archived_at IS NULL
    AND term.start_date <= p_billing_period_start
    AND term.end_date >= p_billing_period_start
  ORDER BY term.term_sequence DESC
  LIMIT 1;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.lease_terms AS term
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.authority_kind = 'authoritative'
      AND term.status IN ('active', 'upcoming')
      AND term.archived_at IS NULL
      AND term.id <> v_starting_term.id
      AND term.start_date <= v_period_end
      AND term.end_date >= p_billing_period_start
  ) THEN
    RETURN v_invoice_id;
  END IF;

  SELECT line.id, line.income_item_id
  INTO STRICT v_line_id, v_income_item_id
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = v_invoice_id
    AND line.line_type = 'rent'
  ORDER BY line.sort_order, line.id
  LIMIT 1;

  PERFORM set_config('app.rent_generation_context', 'lease-derived-v1', true);
  PERFORM set_config('app.rent_segment_repair_context', 'next-full-month-v1', true);

  UPDATE public.finance_income_items
  SET amount_due = v_starting_term.rent_amount, updated_by = p_actor_id
  WHERE organization_id = p_organization_id AND id = v_income_item_id;

  UPDATE public.tenant_invoice_lines
  SET amount = v_starting_term.rent_amount,
    description = to_char(p_billing_period_start, 'Mon YYYY')
  WHERE organization_id = p_organization_id AND id = v_line_id;

  UPDATE public.tenant_invoices
  SET total_amount = v_starting_term.rent_amount,
    lease_term_id = v_starting_term.id,
    base_rent_amount = v_starting_term.rent_amount,
    is_prorated = false
  WHERE organization_id = p_organization_id AND id = v_invoice_id;

  UPDATE public.tenant_invoice_rent_segments
  SET amount = v_starting_term.rent_amount,
    proration_rule = 'next_full_period'
  WHERE organization_id = p_organization_id
    AND invoice_id = v_invoice_id
    AND lease_term_id = v_starting_term.id;

  PERFORM set_config('app.rent_segment_repair_context', 'off', true);

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
      SELECT max(existing.segment_order)
      FROM public.tenant_invoice_rent_segments AS existing
      WHERE existing.invoice_id = v_invoice_id
    ), 0) + row_number() OVER (ORDER BY term.start_date, term.term_sequence, term.id)::integer,
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
    AND term.id <> v_starting_term.id
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
END;
$$;

REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice_before_segment_completion(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) IS 'Generates Lease-owned rent and records every overlapping term segment; next-full-month changes retain the opening rate until the next billing month.';
