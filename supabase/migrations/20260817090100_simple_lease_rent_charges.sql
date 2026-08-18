ALTER TABLE public.tenant_invoices
  DROP CONSTRAINT tenant_invoices_generation_provenance_check,
  DROP CONSTRAINT tenant_invoices_generation_source_check;

ALTER TABLE public.tenant_invoices
  ADD CONSTRAINT tenant_invoices_generation_source_check CHECK (
    generation_source IS NULL OR generation_source IN (
      'scheduled', 'activation_catch_up', 'manual_recovery', 'lease_rules_v1'
    )
  ),
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
      AND management_fee_mode IS NULL
      AND management_fee_value IS NULL
      AND coalesce(management_fee_amount, 0) = 0
    )
  );

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
  v_days_in_month integer;
  v_due_date date;
  v_income_item_id uuid := gen_random_uuid();
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_is_prorated boolean;
  v_lease public.leases%ROWTYPE;
  v_line_id uuid := gen_random_uuid();
  v_period_end date;
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

  v_days_in_month := extract(day FROM v_period_end)::integer;
  v_segment_start := greatest(p_billing_period_start, v_term.start_date);
  v_segment_end := least(v_period_end, v_term.end_date);
  v_is_prorated := v_segment_start > p_billing_period_start OR v_segment_end < v_period_end;
  v_rent_amount := CASE
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

  v_due_date := make_date(
    extract(year FROM p_billing_period_start)::integer,
    extract(month FROM p_billing_period_start)::integer,
    least(v_term.rent_due_day, v_days_in_month)
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
    p_lease_id, 'rent', v_tenant.id, v_tenant.display_name,
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
      v_period_end, p_issue_date, v_due_date, 'through_ips', v_tenant.party_type,
      v_tenant.id, v_tenant.display_name, ARRAY[v_tenant.display_name],
      v_term.rent_currency, v_rent_amount, v_term.id, NULL, 'lease_rules_v1',
      statement_timestamp(), v_term.rent_amount, v_is_prorated, NULL, NULL, 0,
      p_actor_id
    );
  ELSE
    v_invoice_id := v_invoice.id;
    v_invoice_number := v_invoice.invoice_number;
    UPDATE public.finance_income_items
    SET reference = v_invoice_number, updated_by = p_actor_id
    WHERE organization_id = p_organization_id AND id = v_income_item_id;
    UPDATE public.tenant_invoices
    SET total_amount = total_amount + v_rent_amount,
      generation_source = 'lease_rules_v1', generated_at = statement_timestamp(),
      lease_term_id = v_term.id, rent_policy_version_id = NULL,
      base_rent_amount = v_term.rent_amount, is_prorated = v_is_prorated,
      management_fee_mode = NULL, management_fee_value = NULL,
      management_fee_amount = 0
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
    CASE WHEN v_is_prorated THEN 'prorate_actual_days' ELSE 'full_period' END,
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

REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.try_current_month_rent(
  p_organization_id uuid,
  p_lease_id uuid,
  p_generation_source text,
  p_clock timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid;
  v_business_date date;
  v_invoice_id uuid;
  v_lease public.leases%ROWTYPE;
  v_period_start date;
BEGIN
  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL;
  IF NOT FOUND OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  v_business_date := app_private.rent_business_date(p_organization_id, p_clock);
  v_period_start := date_trunc('month', v_business_date)::date;
  SELECT membership.user_id INTO v_actor_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'super_admin'
  ORDER BY membership.created_at, membership.id
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND v_business_date BETWEEN billing.effective_from AND billing.effective_to
  ) THEN
    BEGIN
      v_invoice_id := app_private.generate_simple_lease_rent_invoice(
        p_organization_id, p_lease_id, v_period_start, v_business_date,
        p_generation_source, v_actor_id
      );
      RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'generated');
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', SQLERRM, 'status', 'failed');
    END;
  END IF;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id, p_lease_id, v_period_start, v_business_date,
    p_generation_source, v_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_tenant_charge(
  p_organization_id uuid,
  p_lease_id uuid,
  p_charge_type text,
  p_billing_period_start date,
  p_due_date date,
  p_amount numeric,
  p_description text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_billing public.lease_billing_terms%ROWTYPE;
  v_charge_type text := lower(btrim(coalesce(p_charge_type, '')));
  v_claim record;
  v_income_item_id uuid := gen_random_uuid();
  v_income_type text;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_label text;
  v_lease public.leases%ROWTYPE;
  v_line_id uuid := gen_random_uuid();
  v_line_type text;
  v_payload jsonb;
  v_period_end date;
  v_tenant public.people%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_charge_type NOT IN ('manual_rent', 'utilities', 'cleaning', 'repairs_maintenance', 'other')
    OR p_billing_period_start IS NULL
    OR p_billing_period_start <> date_trunc('month', p_billing_period_start)::date
    OR p_due_date IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR length(btrim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RAISE EXCEPTION 'Manual charge inputs are incomplete or invalid'
      USING ERRCODE = '22023', DETAIL = 'manual_charge_invalid';
  END IF;
  IF v_charge_type = 'other' AND length(btrim(coalesce(p_description, ''))) = 0 THEN
    RAISE EXCEPTION 'Describe the Other charge'
      USING ERRCODE = '22023', DETAIL = 'manual_charge_other_description_required';
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.status IN ('active', 'notice_given')
    AND lease.archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active Lease for this charge' USING ERRCODE = '23503';
  END IF;
  SELECT person.* INTO STRICT v_tenant
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = v_lease.primary_tenant_person_id
    AND person.archived_at IS NULL;
  SELECT billing.* INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND p_due_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resolve the Lease billing rules before adding a charge'
      USING ERRCODE = '23514';
  END IF;

  IF v_charge_type = 'manual_rent' AND EXISTS (
    SELECT 1 FROM public.finance_income_items AS income
    WHERE income.organization_id = p_organization_id
      AND income.lease_id = p_lease_id
      AND income.income_type = 'rent'
      AND income.rent_billing_period_start = p_billing_period_start
      AND income.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Base rent already exists for this Lease month'
      USING ERRCODE = '23505', DETAIL = 'manual_rent_base_charge_exists';
  END IF;

  v_payload := jsonb_build_object(
    'leaseId', p_lease_id, 'chargeType', v_charge_type,
    'billingPeriodStart', p_billing_period_start, 'dueDate', p_due_date,
    'amount', p_amount, 'description', nullif(btrim(coalesce(p_description, '')), '')
  );
  SELECT * INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'create_manual_tenant_charge', p_idempotency_key,
    v_actor_id, v_payload
  );
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'tenant_invoice_v1', p_organization_id, p_lease_id, p_billing_period_start), 0
    )
  );
  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.lease_id = p_lease_id
    AND invoice.billing_period_start = p_billing_period_start
  FOR UPDATE;

  v_period_end := (p_billing_period_start + interval '1 month - 1 day')::date;
  v_label := CASE v_charge_type
    WHEN 'manual_rent' THEN 'Manual rent'
    WHEN 'utilities' THEN 'Utilities'
    WHEN 'cleaning' THEN 'Cleaning'
    WHEN 'repairs_maintenance' THEN 'Repairs and maintenance'
    ELSE 'Other'
  END;
  v_line_type := CASE v_charge_type
    WHEN 'manual_rent' THEN 'rent'
    WHEN 'utilities' THEN 'utility'
    WHEN 'repairs_maintenance' THEN 'repairs_maintenance'
    ELSE v_charge_type
  END;
  v_income_type := CASE v_charge_type
    WHEN 'manual_rent' THEN 'rent'
    WHEN 'utilities' THEN 'utility_reimbursement'
    ELSE 'other'
  END;
  v_invoice_number := CASE WHEN v_invoice.id IS NULL THEN concat(
    'INV-', to_char(p_billing_period_start, 'YYYYMM'), '-',
    upper(substr(replace(v_invoice_id::text, '-', ''), 1, 8))
  ) ELSE v_invoice.invoice_number END;

  IF v_charge_type = 'manual_rent' THEN
    PERFORM set_config('app.rent_generation_context', 'lease-derived-v1', true);
  END IF;
  INSERT INTO public.finance_income_items (
    id, organization_id, property_id, unit_id, lease_id, income_type,
    payer_person_id, payer_label, rent_billing_period_start, due_date,
    amount_due, amount_received, currency, status, description, reference,
    created_by, updated_by
  ) VALUES (
    v_income_item_id, p_organization_id, v_lease.property_id, v_lease.unit_id,
    p_lease_id, v_income_type, v_tenant.id, v_tenant.display_name,
    CASE WHEN v_charge_type = 'manual_rent' THEN p_billing_period_start ELSE NULL END,
    p_due_date, round(p_amount, 2), 0, 'USD', 'open',
    coalesce(nullif(btrim(coalesce(p_description, '')), ''), v_label),
    v_invoice_number, v_actor_id, v_actor_id
  );

  IF v_invoice.id IS NULL THEN
    INSERT INTO public.tenant_invoices (
      id, organization_id, invoice_number, property_id, unit_id, lease_id,
      billing_term_id, billing_period_start, billing_period_end, issue_date,
      due_date, collection_route, recipient_kind, recipient_person_id,
      recipient_label, occupant_labels, currency, total_amount, created_by
    ) VALUES (
      v_invoice_id, p_organization_id, v_invoice_number, v_lease.property_id,
      v_lease.unit_id, p_lease_id, v_billing.id, p_billing_period_start,
      v_period_end, current_date, p_due_date, 'through_ips', v_tenant.party_type,
      v_tenant.id, v_tenant.display_name, ARRAY[v_tenant.display_name],
      'USD', round(p_amount, 2), v_actor_id
    );
  ELSE
    v_invoice_id := v_invoice.id;
    UPDATE public.tenant_invoices
    SET total_amount = total_amount + round(p_amount, 2),
      due_date = least(due_date, p_due_date)
    WHERE organization_id = p_organization_id AND id = v_invoice_id;
  END IF;

  INSERT INTO public.tenant_invoice_lines (
    id, organization_id, invoice_id, income_item_id, line_type,
    customer_label, description, amount, internal_cost_amount,
    internal_markup_amount, sort_order, created_by
  ) VALUES (
    v_line_id, p_organization_id, v_invoice_id, v_income_item_id, v_line_type,
    v_label, nullif(btrim(coalesce(p_description, '')), ''), round(p_amount, 2),
    NULL, 0,
    coalesce((SELECT max(line.sort_order) + 1 FROM public.tenant_invoice_lines AS line
      WHERE line.invoice_id = v_invoice_id), 1),
    v_actor_id
  );

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'tenant_invoice', v_invoice_id,
    'manual_tenant_charge_created',
    v_payload || jsonb_build_object('invoiceId', v_invoice_id, 'lineId', v_line_id)
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id,
    jsonb_build_object('invoiceId', v_invoice_id, 'leaseId', p_lease_id, 'lineId', v_line_id)
  );
  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id, 'leaseId', p_lease_id, 'lineId', v_line_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) IS 'Adds one idempotent tenant charge to the canonical Lease-month invoice.';
