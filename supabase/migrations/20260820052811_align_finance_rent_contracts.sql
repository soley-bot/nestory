ALTER TABLE public.tenant_invoices
  DROP CONSTRAINT tenant_invoices_generation_provenance_check;

ALTER TABLE public.tenant_invoices
  ADD CONSTRAINT tenant_invoices_generation_provenance_check CHECK (
    generation_source IS NULL
    OR (
      generation_source IN ('scheduled', 'activation_catch_up', 'manual_recovery')
      AND lease_term_id IS NOT NULL
      AND rent_policy_version_id IS NOT NULL
      AND generated_at IS NOT NULL
      AND base_rent_amount > 0
      AND is_prorated IS NOT NULL
      AND management_fee_mode IN ('flat', 'percentage')
      AND management_fee_value >= 0
      AND management_fee_amount >= 0
    )
    OR (
      generation_source = 'lease_rules_v1'
      AND lease_term_id IS NOT NULL
      AND rent_policy_version_id IS NULL
      AND generated_at IS NOT NULL
      AND base_rent_amount > 0
      AND is_prorated IS NOT NULL
      AND (
        (
          management_fee_mode IS NULL
          AND management_fee_value IS NULL
          AND coalesce(management_fee_amount, 0) = 0
        )
        OR (
          management_fee_mode IN ('flat', 'percentage')
          AND management_fee_value >= 0
          AND management_fee_amount >= 0
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION app_private.generate_simple_lease_rent_invoice_before_segment_completion(
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
  v_collection_route text;
  v_days_in_month integer;
  v_due_date date;
  v_fee_amount numeric(14,2) := 0;
  v_fee_base numeric(14,2);
  v_fee_mode text;
  v_fee_value numeric(14,4);
  v_income_item_id uuid := gen_random_uuid();
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_is_prorated boolean;
  v_lease public.leases%ROWTYPE;
  v_line_id uuid := gen_random_uuid();
  v_occupant_labels text[];
  v_period_end date;
  v_recipient public.people%ROWTYPE;
  v_rent_amount numeric(14,2);
  v_segment_end date;
  v_segment_start date;
  v_tenant public.people%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
BEGIN
  IF p_billing_period_start IS NULL
    OR p_billing_period_start <> date_trunc('month', p_billing_period_start)::date
    OR p_issue_date IS NULL
    OR length(btrim(coalesce(p_generation_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A monthly billing period, issue date, and generation reason are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.role IN ('super_admin', 'finance_manager')
  ) THEN
    RAISE EXCEPTION 'Finance authority is required for rent generation'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'lease_derived_rent_v1', p_organization_id, p_lease_id, p_billing_period_start),
      0
    )
  );

  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.lease_id = p_lease_id
    AND invoice.billing_period_start = p_billing_period_start
  FOR UPDATE;

  IF FOUND AND EXISTS (
    SELECT 1 FROM public.tenant_invoice_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.invoice_id = v_invoice.id
      AND line.line_type = 'rent'
  ) THEN
    RETURN v_invoice.id;
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.status IN ('active', 'notice_given')
    AND lease.archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Lease is not eligible for this rent month'
      USING ERRCODE = '23514';
  END IF;

  v_period_end := (p_billing_period_start + interval '1 month - 1 day')::date;
  IF app_private.is_financial_month_locked(p_organization_id, p_billing_period_start) THEN
    RAISE EXCEPTION 'This month is locked; unlock it before generating rent'
      USING ERRCODE = '55000';
  END IF;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id, v_lease.property_id, 'USD'::public.currency_code,
    p_billing_period_start
  );

  SELECT term.* INTO v_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status IN ('active', 'upcoming')
    AND term.payment_frequency = 'monthly'
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY
    CASE WHEN term.start_date <= p_billing_period_start THEN 0 ELSE 1 END,
    term.start_date, term.term_sequence
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirm one monthly authoritative Lease term for this month'
      USING ERRCODE = '23514';
  END IF;

  SELECT billing.* INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND greatest(p_billing_period_start, v_term.start_date)
      BETWEEN billing.effective_from AND billing.effective_to
    AND billing.rule_source <> 'unresolved_history'
  ORDER BY billing.effective_from DESC, billing.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resolve the Lease billing rules before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT person.* INTO v_tenant
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = v_lease.primary_tenant_person_id
    AND person.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Lease tenant is no longer available' USING ERRCODE = '23503';
  END IF;

  IF v_billing.billing_recipient_person_id IS NULL THEN
    v_recipient := v_tenant;
  ELSE
    SELECT person.* INTO v_recipient
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = v_billing.billing_recipient_person_id
      AND person.archived_at IS NULL;
    IF NOT FOUND OR v_recipient.party_type IS DISTINCT FROM v_billing.billing_recipient_kind THEN
      RAISE EXCEPTION 'The Lease billing recipient is no longer available'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_collection_route := coalesce(v_billing.collection_route, 'through_ips');
  v_fee_mode := coalesce(v_billing.management_fee_mode, 'flat');
  v_fee_value := coalesce(v_billing.management_fee_value, 0);

  SELECT coalesce(
    array_agg(occupant.display_name ORDER BY occupant.is_primary DESC, occupant.display_name),
    ARRAY[v_tenant.display_name]::text[]
  )
  INTO v_occupant_labels
  FROM (
    SELECT person.id, person.display_name, bool_or(party.is_primary) AS is_primary
    FROM public.lease_parties AS party
    JOIN public.people AS person
      ON person.organization_id = party.organization_id
     AND person.id = party.person_id
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND party.party_role IN ('primary_tenant', 'co_tenant', 'authorized_occupant')
      AND (party.started_on IS NULL OR party.started_on <= v_period_end)
      AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
      AND person.archived_at IS NULL
    GROUP BY person.id, person.display_name
  ) AS occupant;

  v_days_in_month := extract(day FROM v_period_end)::integer;
  v_segment_start := greatest(p_billing_period_start, v_term.start_date);
  v_segment_end := least(v_period_end, v_term.end_date);
  v_is_prorated := v_segment_start > p_billing_period_start OR v_segment_end < v_period_end;
  IF (
    date_trunc('month', v_term.start_date)::date = p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL
  ) OR (
    date_trunc('month', v_term.end_date)::date = p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL
  ) THEN
    v_is_prorated := true;
  END IF;
  v_rent_amount := CASE
    WHEN date_trunc('month', v_term.start_date)::date = p_billing_period_start
      AND v_billing.first_period_prorated_amount IS NOT NULL
      THEN v_billing.first_period_prorated_amount
    WHEN date_trunc('month', v_term.end_date)::date = p_billing_period_start
      AND v_billing.final_period_prorated_amount IS NOT NULL
      THEN v_billing.final_period_prorated_amount
    WHEN v_is_prorated THEN round(
      v_term.rent_amount * (v_segment_end - v_segment_start + 1) / v_days_in_month,
      2
    )
    ELSE v_term.rent_amount::numeric(14,2)
  END;
  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'The Lease rent amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF v_billing.charge_management_fee_when_active THEN
    v_fee_base := CASE
      WHEN v_is_prorated AND NOT v_billing.full_management_fee_during_proration
        THEN v_rent_amount
      ELSE v_term.rent_amount::numeric(14,2)
    END;
    v_fee_amount := CASE
      WHEN v_fee_mode = 'percentage'
        THEN round(v_fee_base * v_fee_value / 100, 2)
      ELSE round(v_fee_value, 2)
    END;
  END IF;

  -- Catch-up generation runs after the due day; a past due date read as arrears.
  v_due_date := greatest(
    make_date(
      extract(year FROM p_billing_period_start)::integer,
      extract(month FROM p_billing_period_start)::integer,
      least(v_term.rent_due_day, v_days_in_month)
    ),
    p_issue_date
  );
  v_invoice_number := concat(
    'INV-', to_char(p_billing_period_start, 'YYYYMM'), '-',
    upper(substr(replace(v_invoice_id::text, '-', ''), 1, 8))
  );

  PERFORM set_config('app.rent_generation_context', 'lease-derived-v1', true);
  INSERT INTO public.finance_income_items (
    id, organization_id, property_id, unit_id, lease_id, income_type,
    payer_person_id, payer_label, rent_billing_period_start, due_date,
    amount_due, amount_received, currency, status, description, reference,
    created_by, updated_by
  ) VALUES (
    v_income_item_id, p_organization_id, v_lease.property_id, v_lease.unit_id,
    p_lease_id, 'rent', v_recipient.id, v_recipient.display_name,
    p_billing_period_start, v_due_date, v_rent_amount, 0, v_term.rent_currency,
    'open', 'Rent', v_invoice_number, p_actor_id, p_actor_id
  );

  IF v_invoice.id IS NULL THEN
    INSERT INTO public.tenant_invoices (
      id, organization_id, invoice_number, property_id, unit_id, lease_id,
      billing_term_id, billing_period_start, billing_period_end, issue_date,
      due_date, collection_route, recipient_kind, recipient_person_id,
      recipient_label, occupant_labels, currency, total_amount, lease_term_id,
      rent_policy_version_id, generation_source, generated_at,
      base_rent_amount, is_prorated, management_fee_mode,
      management_fee_value, management_fee_amount, created_by
    ) VALUES (
      v_invoice_id, p_organization_id, v_invoice_number, v_lease.property_id,
      v_lease.unit_id, p_lease_id, v_billing.id, p_billing_period_start,
      v_period_end, p_issue_date, v_due_date, v_collection_route,
      v_recipient.party_type, v_recipient.id, v_recipient.display_name,
      v_occupant_labels, v_term.rent_currency, v_rent_amount, v_term.id, NULL,
      'lease_rules_v1', statement_timestamp(), v_term.rent_amount, v_is_prorated,
      v_fee_mode, v_fee_value,
      v_fee_amount, p_actor_id
    );
  ELSE
    v_invoice_id := v_invoice.id;
    v_invoice_number := v_invoice.invoice_number;
    UPDATE public.finance_income_items
    SET reference = v_invoice_number, updated_by = p_actor_id
    WHERE organization_id = p_organization_id AND id = v_income_item_id;
    UPDATE public.tenant_invoices
    SET total_amount = total_amount + v_rent_amount,
      billing_term_id = v_billing.id,
      collection_route = v_collection_route,
      recipient_kind = v_recipient.party_type,
      recipient_person_id = v_recipient.id,
      recipient_label = v_recipient.display_name,
      occupant_labels = v_occupant_labels,
      generation_source = 'lease_rules_v1', generated_at = statement_timestamp(),
      lease_term_id = v_term.id, rent_policy_version_id = NULL,
      base_rent_amount = v_term.rent_amount, is_prorated = v_is_prorated,
      management_fee_mode = v_fee_mode,
      management_fee_value = v_fee_value,
      management_fee_amount = v_fee_amount
    WHERE organization_id = p_organization_id AND id = v_invoice_id;
  END IF;

  INSERT INTO public.tenant_invoice_lines (
    id, organization_id, invoice_id, income_item_id, line_type,
    customer_label, description, amount, internal_cost_amount,
    internal_markup_amount, sort_order, created_by
  ) VALUES (
    v_line_id, p_organization_id, v_invoice_id, v_income_item_id, 'rent',
    'Rent', concat(to_char(p_billing_period_start, 'Mon YYYY'),
      CASE WHEN v_is_prorated THEN ' - prorated' ELSE '' END),
    v_rent_amount, NULL, 0,
    coalesce((SELECT max(line.sort_order) + 1 FROM public.tenant_invoice_lines AS line
      WHERE line.invoice_id = v_invoice_id), 1),
    p_actor_id
  );

  INSERT INTO public.tenant_invoice_rent_segments (
    organization_id, invoice_id, lease_id, lease_term_id, segment_order,
    segment_start, segment_end, full_period_amount, amount, proration_rule,
    created_by
  ) VALUES (
    p_organization_id, v_invoice_id, p_lease_id, v_term.id, 1,
    v_segment_start, v_segment_end, v_term.rent_amount, v_rent_amount,
    CASE
      WHEN date_trunc('month', v_term.start_date)::date = p_billing_period_start
        AND v_billing.first_period_prorated_amount IS NOT NULL
        THEN 'billing_override'
      WHEN date_trunc('month', v_term.end_date)::date = p_billing_period_start
        AND v_billing.final_period_prorated_amount IS NOT NULL
        THEN 'billing_override'
      WHEN v_is_prorated THEN 'prorate_actual_days'
      ELSE 'full_period'
    END,
    p_actor_id
  );

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id, p_actor_id, 'tenant_invoice', v_invoice_id,
    'lease_rent_generated',
    jsonb_build_object(
      'leaseId', p_lease_id, 'billingPeriodStart', p_billing_period_start,
      'leaseTermId', v_term.id, 'generationSource', 'lease_rules_v1',
      'generationReason', p_generation_reason, 'amount', v_rent_amount
    )
  );
  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice_before_segment_completion(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.generate_simple_lease_rent_invoice(
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
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_id uuid;
  v_line_id uuid;
  v_period_end date;
  v_starting_term public.lease_terms%ROWTYPE;
  v_fee_amount numeric(14,2) := 0;
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

  IF FOUND AND v_billing.mid_period_rent_change_rule = 'next_full_month' THEN
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

    IF FOUND AND EXISTS (
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
      SELECT line.id, line.income_item_id
      INTO STRICT v_line_id, v_income_item_id
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = v_invoice_id
        AND line.line_type = 'rent'
      ORDER BY line.sort_order, line.id
      LIMIT 1;

      IF v_billing.charge_management_fee_when_active THEN
        v_fee_amount := CASE
          WHEN coalesce(v_billing.management_fee_mode, 'flat') = 'percentage'
            THEN round(
              v_starting_term.rent_amount
                * coalesce(v_billing.management_fee_value, 0) / 100,
              2
            )
          ELSE round(coalesce(v_billing.management_fee_value, 0), 2)
        END;
      END IF;

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
      SET total_amount = (
          SELECT coalesce(sum(line.amount), 0)
          FROM public.tenant_invoice_lines AS line
          WHERE line.organization_id = p_organization_id
            AND line.invoice_id = v_invoice_id
        ),
        lease_term_id = v_starting_term.id,
        base_rent_amount = v_starting_term.rent_amount,
        is_prorated = false,
        management_fee_mode = coalesce(v_billing.management_fee_mode, 'flat'),
        management_fee_value = coalesce(v_billing.management_fee_value, 0),
        management_fee_amount = v_fee_amount
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
    END IF;
  END IF;

  SELECT invoice.* INTO STRICT v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = v_invoice_id;

  IF v_invoice.management_fee_amount > 0 AND NOT EXISTS (
    SELECT 1
    FROM public.management_fee_occurrences AS existing
    WHERE existing.organization_id = p_organization_id
      AND existing.tenant_invoice_id = v_invoice_id
  ) THEN
    INSERT INTO public.management_fee_occurrences (
      organization_id, property_id, lease_id, tenant_invoice_id,
      billing_term_id, fee_date, amount, currency, fee_mode, fee_value,
      created_by
    ) VALUES (
      p_organization_id, v_invoice.property_id, p_lease_id, v_invoice_id,
      v_invoice.billing_term_id, p_billing_period_start,
      v_invoice.management_fee_amount, v_invoice.currency,
      v_invoice.management_fee_mode, v_invoice.management_fee_value,
      p_actor_id
    );
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) IS 'Generates Lease-owned rent and records final invoice and management-fee snapshots after next-full-month normalization.';
