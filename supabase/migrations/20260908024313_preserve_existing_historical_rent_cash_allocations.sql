-- Forward fix to PR113 b4920a9d4fbd5d137872ad67d93c2ab06adf1039 integration.
-- Preserve previously allocated original owner-fee cash sources without weakening
-- current authority, preview freshness, replacement allocation, or cash guards.
CREATE OR REPLACE FUNCTION public.correct_historical_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_rent_amount numeric,
  p_corrected_due_day integer,
  p_reason text,
  p_preview_hash text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_preview_hash text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(p_preview_hash, '')
  ));
  v_idempotency_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_preview jsonb;
  v_payload jsonb;
  v_claim record;
  v_replay jsonb;
  v_result jsonb;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_original_line public.tenant_invoice_lines%ROWTYPE;
  v_original_income public.finance_income_items%ROWTYPE;
  v_original_fee public.management_fee_occurrences%ROWTYPE;
  v_original_owner_line public.owner_invoice_lines%ROWTYPE;
  v_correction_id uuid := gen_random_uuid();
  v_reversal_line_id uuid := gen_random_uuid();
  v_replacement_line_id uuid := gen_random_uuid();
  v_replacement_income_id uuid := gen_random_uuid();
  v_reversal_fee_id uuid := gen_random_uuid();
  v_replacement_fee_id uuid := gen_random_uuid();
  v_reversal_owner_line_id uuid := gen_random_uuid();
  v_replacement_owner_line_id uuid := gen_random_uuid();
  v_business_date date;
  v_replacement_fee_amount numeric(14,2);
  v_payment record;
  v_confirmation record;
  v_reversal_settlement_id uuid;
  v_replacement_settlement_id uuid;
  v_original_allocations jsonb;
  v_replacement_allocations jsonb;
  v_other_target_settled numeric(14,2);
  v_reapplied_target numeric(14,2) := 0;
  v_target_capacity numeric(14,2);
  v_reapplied_amount numeric(14,2);
  v_credit_amount numeric(14,2);
  v_tenant_credit_total numeric(14,2) := 0;
  v_settlement_count integer := 0;
  v_new_allocation record;
  v_held_allocation record;
  v_held_reversal_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 8 AND 500
    OR pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160
    OR v_preview_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'historical_rent_correction_inputs_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organizationId', p_organization_id,
    'invoiceId', p_invoice_id,
    'correctedRentAmount', p_corrected_rent_amount,
    'correctedDueDay', p_corrected_due_day,
    'reason', v_reason,
    'previewHash', v_preview_hash
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'correct_historical_rent',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'historical_rent_correction_v1',
        p_organization_id::text,
        p_invoice_id::text
      ),
      0
    )
  );

  -- Another identical request may have committed while this caller waited
  -- for the invoice advisory lock. Recheck before inspecting the now-reversed root.
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id,'correct_historical_rent',v_idempotency_key,v_actor_id,v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id
  FOR UPDATE;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_preview := app_private.build_historical_rent_correction_preview(
    p_organization_id,
    p_invoice_id,
    p_corrected_rent_amount,
    p_corrected_due_day
  );
  IF v_preview->>'previewHash' IS DISTINCT FROM v_preview_hash THEN
    RAISE EXCEPTION 'historical_rent_preview_stale'
      USING ERRCODE = '40001';
  END IF;
  IF NOT coalesce((v_preview->>'canApply')::boolean, false) THEN
    RAISE EXCEPTION 'historical_rent_correction_blocked'
      USING
        ERRCODE = '55000',
        DETAIL = (v_preview->'blockers')::text;
  END IF;

  v_business_date := (v_preview->>'correctionBusinessDate')::date;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,
    v_invoice.property_id,
    v_invoice.currency,
    v_business_date
  );

  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'correct_historical_rent',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  SELECT line.* INTO STRICT v_original_line
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = (v_preview->>'sourceRentLineId')::uuid
  FOR UPDATE;
  SELECT income.* INTO STRICT v_original_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.id = (v_preview->>'sourceIncomeItemId')::uuid
  FOR UPDATE;

  SELECT fee.* INTO v_original_fee
  FROM public.management_fee_occurrences AS fee
  WHERE fee.organization_id = p_organization_id
    AND fee.tenant_invoice_id = p_invoice_id
    AND fee.reversal_of_id IS NULL
    AND fee.supersedes_occurrence_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.management_fee_occurrences AS reversal
      WHERE reversal.organization_id = fee.organization_id
        AND reversal.reversal_of_id = fee.id
    )
  FOR UPDATE;
  IF v_original_fee.id IS NOT NULL THEN
    SELECT owner_line.* INTO STRICT v_original_owner_line
    FROM public.owner_invoice_lines AS owner_line
    WHERE owner_line.organization_id = p_organization_id
      AND owner_line.source_type = 'management_fee'
      AND owner_line.source_id = v_original_fee.id
      AND owner_line.reversal_of_id IS NULL
      AND owner_line.supersedes_line_id IS NULL
    FOR UPDATE;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context',
    'checked-invoice-correction-v1',
    true
  );
  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context',
    'checked-historical-rent-v1',
    true
  );

  INSERT INTO public.tenant_invoice_corrections (
    id,
    organization_id,
    tenant_invoice_id,
    action,
    target_invoice_line_id,
    property_id,
    unit_id,
    currency,
    evidence_recognized_on,
    affected_line_count,
    reason,
    idempotency_key,
    payload_hash,
    source_identity,
    correction_business_date,
    original_rent_amount,
    corrected_rent_amount,
    original_due_day,
    corrected_due_day,
    original_due_date,
    corrected_due_date,
    source_billing_term_id,
    preview_hash,
    created_by
  ) VALUES (
    v_correction_id,
    p_organization_id,
    p_invoice_id,
    'historical_rent',
    v_original_line.id,
    v_invoice.property_id,
    v_invoice.unit_id,
    v_invoice.currency,
    v_original_line.recognized_on,
    1,
    v_reason,
    v_idempotency_key,
    app_private.canonical_financial_payload_hash(v_payload),
    pg_catalog.jsonb_build_object(
      'tenantInvoiceId', p_invoice_id,
      'invoiceNumber', v_invoice.invoice_number,
      'sourceRentLineId', v_original_line.id,
      'sourceIncomeItemId', v_original_income.id,
      'leaseId', v_invoice.lease_id,
      'leaseTermId', v_invoice.lease_term_id,
      'billingTermId', v_invoice.billing_term_id,
      'billingPeriodStart', v_invoice.billing_period_start,
      'billingPeriodEnd', v_invoice.billing_period_end,
      'issuedTotalAmount', v_invoice.total_amount,
      'issuedDueDate', v_invoice.due_date
    ),
    v_business_date,
    v_original_line.amount,
    p_corrected_rent_amount,
    (v_preview->>'originalDueDay')::integer,
    p_corrected_due_day,
    v_invoice.due_date,
    (v_preview->>'correctedDueDate')::date,
    v_invoice.billing_term_id,
    v_preview_hash,
    v_actor_id
  );

  PERFORM pg_catalog.set_config(
    'app.rent_generation_context', 'lease-derived-v1', true
  );
  INSERT INTO public.finance_income_items (
    id,
    organization_id,
    property_id,
    unit_id,
    lease_id,
    income_type,
    payer_person_id,
    payer_label,
    rent_billing_period_start,
    due_date,
    amount_due,
    amount_received,
    currency,
    status,
    description,
    reference,
    created_by,
    updated_by,
    supersedes_income_item_id,
    correction_occurrence_id
  ) VALUES (
    v_replacement_income_id,
    v_original_income.organization_id,
    v_original_income.property_id,
    v_original_income.unit_id,
    v_original_income.lease_id,
    'rent',
    v_original_income.payer_person_id,
    v_original_income.payer_label,
    v_original_income.rent_billing_period_start,
    (v_preview->>'correctedDueDate')::date,
    p_corrected_rent_amount,
    0,
    v_original_income.currency,
    'open',
    'Corrected historical rent',
    v_original_income.reference,
    v_actor_id,
    v_actor_id,
    v_original_income.id,
    v_correction_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
    organization_id,
    invoice_id,
    income_item_id,
    line_type,
    customer_label,
    description,
    amount,
    internal_cost_amount,
    internal_markup_amount,
    sort_order,
    created_by,
    property_id,
    unit_id,
    currency,
    recognized_on,
    reversal_of_id,
    correction_occurrence_id
  ) VALUES (
    v_reversal_line_id,
    p_organization_id,
    p_invoice_id,
    NULL,
    'rent',
    v_original_line.customer_label,
    'Historical rent correction: ' || v_reason,
    -v_original_line.amount,
    NULL,
    0,
    (
      SELECT coalesce(max(line.sort_order), 0) + 1
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
    ),
    v_actor_id,
    v_original_line.property_id,
    v_original_line.unit_id,
    v_original_line.currency,
    v_original_line.recognized_on,
    v_original_line.id,
    v_correction_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
    organization_id,
    invoice_id,
    income_item_id,
    line_type,
    customer_label,
    description,
    amount,
    internal_cost_amount,
    internal_markup_amount,
    sort_order,
    created_by,
    property_id,
    unit_id,
    currency,
    recognized_on,
    supersedes_line_id,
    correction_occurrence_id
  ) VALUES (
    v_replacement_line_id,
    p_organization_id,
    p_invoice_id,
    v_replacement_income_id,
    'rent',
    v_original_line.customer_label,
    'Corrected historical rent: ' || v_reason,
    p_corrected_rent_amount,
    NULL,
    0,
    (
      SELECT coalesce(max(line.sort_order), 0) + 1
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
    ),
    v_actor_id,
    v_original_line.property_id,
    v_original_line.unit_id,
    v_original_line.currency,
    v_original_line.recognized_on,
    v_original_line.id,
    v_correction_id
  );

  IF v_original_fee.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = p_organization_id
        AND allocation_set.source_type = 'management_fee_occurrence'
        AND allocation_set.source_line_id = v_original_fee.id
    ) THEN
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'management_fee_occurrence',
        v_original_fee.id,
        'historical-rent-fee-original-' ||
          replace(v_original_fee.id::text, '-', '')
      );
    END IF;

    FOR v_held_allocation IN
      SELECT allocation.*
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_original_owner_line.id
        AND allocation.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_charge_cash_allocations AS reversal
          WHERE reversal.organization_id = allocation.organization_id
            AND reversal.reversal_of_id = allocation.id
        )
      ORDER BY allocation.allocation_date, allocation.created_at, allocation.id
      FOR UPDATE
    LOOP
      -- Reuse the immutable original source allocation when it is already
      -- canonical. A new command key must not duplicate/reclassify that source.
      IF NOT EXISTS (
        SELECT 1 FROM public.owner_event_allocation_sets AS allocation_set
        WHERE allocation_set.organization_id = p_organization_id
          AND allocation_set.source_type = 'owner_invoice_payment'
          AND allocation_set.source_line_id = v_held_allocation.id
      ) THEN
        PERFORM public.allocate_owner_event(
          p_organization_id,
          'owner_invoice_payment',
          v_held_allocation.id,
          'historical-rent-owner-cash-original-' ||
            replace(v_held_allocation.id::text, '-', '')
        );
      END IF;
      INSERT INTO public.owner_charge_cash_allocations (
        organization_id,
        property_id,
        owner_invoice_line_id,
        allocation_date,
        amount,
        reversal_of_id,
        created_by
      ) VALUES (
        p_organization_id,
        v_held_allocation.property_id,
        v_held_allocation.owner_invoice_line_id,
        v_business_date,
        -v_held_allocation.amount,
        v_held_allocation.id,
        v_actor_id
      ) RETURNING id INTO v_held_reversal_id;
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'reversal',
        v_held_reversal_id,
        'historical-rent-owner-cash-reversal-' ||
          replace(v_held_reversal_id::text, '-', '')
      );
    END LOOP;

    INSERT INTO public.management_fee_occurrences (
      id,
      organization_id,
      property_id,
      lease_id,
      tenant_invoice_id,
      billing_term_id,
      fee_date,
      amount,
      currency,
      fee_mode,
      fee_value,
      settlement_status,
      created_by,
      reversal_of_id,
      correction_occurrence_id
    ) VALUES (
      v_reversal_fee_id,
      v_original_fee.organization_id,
      v_original_fee.property_id,
      v_original_fee.lease_id,
      v_original_fee.tenant_invoice_id,
      v_original_fee.billing_term_id,
      v_original_fee.fee_date,
      -v_original_fee.amount,
      v_original_fee.currency,
      v_original_fee.fee_mode,
      v_original_fee.fee_value,
      'reversed',
      v_actor_id,
      v_original_fee.id,
      v_correction_id
    );

    INSERT INTO public.owner_invoice_lines (
      id,
      organization_id,
      invoice_id,
      property_id,
      source_type,
      source_id,
      customer_label,
      description,
      amount,
      sort_order,
      created_by,
      recognized_on,
      reversal_of_id,
      correction_occurrence_id
    ) VALUES (
      v_reversal_owner_line_id,
      v_original_owner_line.organization_id,
      v_original_owner_line.invoice_id,
      v_original_owner_line.property_id,
      'management_fee',
      v_reversal_fee_id,
      v_original_owner_line.customer_label,
      'Historical rent correction: ' || v_reason,
      -v_original_owner_line.amount,
      (
        SELECT coalesce(max(line.sort_order), 0) + 1
        FROM public.owner_invoice_lines AS line
        WHERE line.organization_id = v_original_owner_line.organization_id
          AND line.invoice_id = v_original_owner_line.invoice_id
      ),
      v_actor_id,
      v_original_owner_line.recognized_on,
      v_original_owner_line.id,
      v_correction_id
    );

    PERFORM app_private.append_management_fee_owner_effect_reversal(
      v_original_fee.id,
      v_reversal_fee_id,
      v_correction_id,
      v_actor_id
    );

    v_replacement_fee_amount := (
      v_preview->>'replacementManagementFeeAmount'
    )::numeric(14,2);
    IF v_replacement_fee_amount > 0 THEN
      INSERT INTO public.management_fee_occurrences (
        id,
        organization_id,
        property_id,
        lease_id,
        tenant_invoice_id,
        billing_term_id,
        fee_date,
        amount,
        currency,
        fee_mode,
        fee_value,
        settlement_status,
        created_by,
        correction_occurrence_id,
        supersedes_occurrence_id
      ) VALUES (
        v_replacement_fee_id,
        v_original_fee.organization_id,
        v_original_fee.property_id,
        v_original_fee.lease_id,
        v_original_fee.tenant_invoice_id,
        v_original_fee.billing_term_id,
        v_original_fee.fee_date,
        v_replacement_fee_amount,
        v_original_fee.currency,
        v_original_fee.fee_mode,
        v_original_fee.fee_value,
        'owner_due',
        v_actor_id,
        v_correction_id,
        v_original_fee.id
      );

      INSERT INTO public.owner_invoice_lines (
        id,
        organization_id,
        invoice_id,
        property_id,
        source_type,
        source_id,
        customer_label,
        description,
        amount,
        sort_order,
        created_by,
        recognized_on,
        supersedes_line_id,
        correction_occurrence_id
      ) VALUES (
        v_replacement_owner_line_id,
        v_original_owner_line.organization_id,
        v_original_owner_line.invoice_id,
        v_original_owner_line.property_id,
        'management_fee',
        v_replacement_fee_id,
        v_original_owner_line.customer_label,
        'Corrected historical management fee: ' || v_reason,
        v_replacement_fee_amount,
        (
          SELECT coalesce(max(line.sort_order), 0) + 1
          FROM public.owner_invoice_lines AS line
          WHERE line.organization_id = v_original_owner_line.organization_id
            AND line.invoice_id = v_original_owner_line.invoice_id
        ),
        v_actor_id,
        v_original_owner_line.recognized_on,
        v_original_owner_line.id,
        v_correction_id
      );

      PERFORM public.allocate_owner_event(
        p_organization_id,
        'management_fee_occurrence',
        v_replacement_fee_id,
        'historical-rent-fee-' || replace(v_correction_id::text, '-', '')
      );
    END IF;
  END IF;

  -- Replay IPS settlements in stable receipt order. The still-active original
  -- target allocations reserve capacity until their own reversal, ensuring a
  -- deterministic credit choice when several receipts exceed corrected rent.
  FOR v_payment IN
    SELECT payment.*
    FROM public.tenant_invoice_payments AS payment
    WHERE payment.organization_id = p_organization_id
      AND payment.invoice_id = p_invoice_id
      AND payment.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_payments AS reversal
        WHERE reversal.organization_id = payment.organization_id
          AND reversal.reversal_of_id = payment.id
      )
    ORDER BY payment.received_date, payment.created_at, payment.id
    FOR UPDATE
  LOOP
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'lineId', allocation.invoice_line_id,
          'amount', allocation.amount
        ) ORDER BY allocation.allocation_order, allocation.id
      ),
      '[]'::jsonb
    ) INTO v_original_allocations
    FROM public.tenant_invoice_payment_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.payment_id = v_payment.id
      AND allocation.reversal_of_allocation_id IS NULL;

    v_reversal_settlement_id := public.reverse_tenant_invoice_payment(
      p_organization_id,
      v_payment.id,
      v_business_date,
      'Historical rent correction: ' || v_reason,
      'historical-rent-reverse-' || replace(v_payment.id::text, '-', '')
    );

    SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
    INTO v_other_target_settled
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_payments AS payment
      ON payment.organization_id = allocation.organization_id
     AND payment.id = allocation.payment_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.invoice_line_id = v_original_line.id
      AND allocation.reversal_of_allocation_id IS NULL
      AND payment.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_payments AS reversal
        WHERE reversal.organization_id = payment.organization_id
          AND reversal.reversal_of_id = payment.id
      );
    v_target_capacity := greatest(
      p_corrected_rent_amount - v_reapplied_target - v_other_target_settled,
      0
    )::numeric(14,2);

    WITH source AS (
      SELECT
        allocation.*,
        CASE
          WHEN allocation.invoice_line_id = v_original_line.id
            THEN least(allocation.amount, v_target_capacity)
          ELSE allocation.amount
        END::numeric(14,2) AS replacement_amount
      FROM public.tenant_invoice_payment_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.payment_id = v_payment.id
        AND allocation.reversal_of_allocation_id IS NULL
    )
    SELECT
      coalesce(sum(source.replacement_amount), 0)::numeric(14,2),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'lineId', CASE
              WHEN source.invoice_line_id = v_original_line.id
                THEN v_replacement_line_id
              ELSE source.invoice_line_id
            END,
            'amount', source.replacement_amount
          ) ORDER BY source.allocation_order, source.id
        ) FILTER (WHERE source.replacement_amount > 0),
        '[]'::jsonb
      ),
      coalesce(sum(source.replacement_amount) FILTER (
        WHERE source.invoice_line_id = v_original_line.id
      ), 0)::numeric(14,2)
    INTO v_reapplied_amount, v_replacement_allocations, v_target_capacity
    FROM source;

    v_credit_amount := (v_payment.amount - v_reapplied_amount)::numeric(14,2);
    v_replacement_settlement_id := NULL;
    IF v_reapplied_amount > 0 THEN
      PERFORM app_private.bind_chart_workflow_accounts(
        p_organization_id,'record_tenant_invoice_payment',
        'historical-rent-reapply-' || replace(v_payment.id::text, '-', ''),
        app_private.historical_rent_payment_account(p_organization_id,v_payment.id),
        NULL,NULL,v_payment.reconciliation_source_id
      );
      v_replacement_settlement_id := public.record_tenant_invoice_payment(
        p_organization_id,
        p_invoice_id,
        v_reapplied_amount,
        v_business_date,
        v_payment.reconciliation_source_id,
        pg_catalog.concat_ws(
          ' · ', NULLIF(v_payment.reference, ''), 'Historical rent correction'
        ),
        v_replacement_allocations,
        'historical-rent-reapply-' || replace(v_payment.id::text, '-', '')
      );
      FOR v_new_allocation IN
        SELECT allocation.id
        FROM public.tenant_invoice_payment_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.payment_id = v_replacement_settlement_id
        ORDER BY allocation.allocation_order, allocation.id
      LOOP
        PERFORM public.allocate_owner_event(
          p_organization_id,
          'tenant_rent_receipt',
          v_new_allocation.id,
          'historical-rent-owner-' || replace(v_new_allocation.id::text, '-', '')
        );
      END LOOP;
    END IF;

    INSERT INTO public.historical_rent_settlement_reapplications (
      organization_id,
      correction_occurrence_id,
      settlement_kind,
      original_settlement_id,
      reversal_settlement_id,
      replacement_settlement_id,
      original_amount,
      reapplied_amount,
      credit_amount,
      original_allocation_snapshot,
      replacement_allocation_snapshot,
      created_by
    ) VALUES (
      p_organization_id,
      v_correction_id,
      'ips_payment',
      v_payment.id,
      v_reversal_settlement_id,
      v_replacement_settlement_id,
      v_payment.amount,
      v_reapplied_amount,
      v_credit_amount,
      v_original_allocations,
      v_replacement_allocations,
      v_actor_id
    );

    IF v_credit_amount > 0 THEN
      INSERT INTO public.tenant_credit_occurrences (
        organization_id,
        correction_occurrence_id,
        tenant_invoice_id,
        lease_id,
        property_id,
        unit_id,
        tenant_person_id,
        currency,
        occurred_on,
        amount,
        custody_kind,
        source_settlement_kind,
        source_settlement_id,
        reason,
        created_by
      ) VALUES (
        p_organization_id,
        v_correction_id,
        p_invoice_id,
        v_invoice.lease_id,
        v_invoice.property_id,
        v_invoice.unit_id,
        v_invoice.recipient_person_id,
        v_invoice.currency,
        v_business_date,
        v_credit_amount,
        'ips_held',
        'ips_payment',
        v_payment.id,
        v_reason,
        v_actor_id
      );
    END IF;
    v_reapplied_target := (v_reapplied_target + v_target_capacity)::numeric(14,2);
    v_tenant_credit_total := (
      v_tenant_credit_total + v_credit_amount
    )::numeric(14,2);
    v_settlement_count := v_settlement_count + 1;
  END LOOP;

  -- Direct-to-owner evidence follows the same reversal/reapplication chain.
  FOR v_confirmation IN
    SELECT confirmation.*
    FROM public.owner_collection_confirmations AS confirmation
    WHERE confirmation.organization_id = p_organization_id
      AND confirmation.invoice_id = p_invoice_id
      AND confirmation.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmations AS reversal
        WHERE reversal.organization_id = confirmation.organization_id
          AND reversal.reversal_of_id = confirmation.id
      )
    ORDER BY confirmation.confirmed_date, confirmation.created_at, confirmation.id
    FOR UPDATE
  LOOP
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'lineId', allocation.invoice_line_id,
          'amount', allocation.amount
        ) ORDER BY allocation.allocation_order, allocation.id
      ),
      '[]'::jsonb
    ) INTO v_original_allocations
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.confirmation_id = v_confirmation.id
      AND allocation.reversal_of_allocation_id IS NULL;

    v_reversal_settlement_id := public.reverse_owner_collection_confirmation(
      p_organization_id,
      v_confirmation.id,
      v_business_date,
      'Historical rent correction: ' || v_reason,
      'historical-rent-reverse-' || replace(v_confirmation.id::text, '-', '')
    );

    SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
    INTO v_other_target_settled
    FROM public.owner_collection_confirmation_allocations AS allocation
    JOIN public.owner_collection_confirmations AS confirmation
      ON confirmation.organization_id = allocation.organization_id
     AND confirmation.id = allocation.confirmation_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.invoice_line_id = v_original_line.id
      AND allocation.reversal_of_allocation_id IS NULL
      AND confirmation.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmations AS reversal
        WHERE reversal.organization_id = confirmation.organization_id
          AND reversal.reversal_of_id = confirmation.id
      );
    v_target_capacity := greatest(
      p_corrected_rent_amount - v_reapplied_target - v_other_target_settled,
      0
    )::numeric(14,2);

    WITH source AS (
      SELECT
        allocation.*,
        CASE
          WHEN allocation.invoice_line_id = v_original_line.id
            THEN least(allocation.amount, v_target_capacity)
          ELSE allocation.amount
        END::numeric(14,2) AS replacement_amount
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.confirmation_id = v_confirmation.id
        AND allocation.reversal_of_allocation_id IS NULL
    )
    SELECT
      coalesce(sum(source.replacement_amount), 0)::numeric(14,2),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'lineId', CASE
              WHEN source.invoice_line_id = v_original_line.id
                THEN v_replacement_line_id
              ELSE source.invoice_line_id
            END,
            'amount', source.replacement_amount
          ) ORDER BY source.allocation_order, source.id
        ) FILTER (WHERE source.replacement_amount > 0),
        '[]'::jsonb
      ),
      coalesce(sum(source.replacement_amount) FILTER (
        WHERE source.invoice_line_id = v_original_line.id
      ), 0)::numeric(14,2)
    INTO v_reapplied_amount, v_replacement_allocations, v_target_capacity
    FROM source;

    v_credit_amount := (
      v_confirmation.amount - v_reapplied_amount
    )::numeric(14,2);
    v_replacement_settlement_id := NULL;
    IF v_reapplied_amount > 0 THEN
      v_replacement_settlement_id := public.confirm_owner_collected_rent(
        p_organization_id,
        p_invoice_id,
        v_reapplied_amount,
        v_business_date,
        pg_catalog.concat_ws(
          ' · ',
          NULLIF(v_confirmation.reference, ''),
          'Historical rent correction'
        ),
        v_replacement_allocations,
        'historical-rent-reapply-' || replace(v_confirmation.id::text, '-', '')
      );
      FOR v_new_allocation IN
        SELECT allocation.id
        FROM public.owner_collection_confirmation_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.confirmation_id = v_replacement_settlement_id
        ORDER BY allocation.allocation_order, allocation.id
      LOOP
        PERFORM public.allocate_owner_event(
          p_organization_id,
          'owner_direct_rent_receipt',
          v_new_allocation.id,
          'historical-rent-owner-' || replace(v_new_allocation.id::text, '-', '')
        );
      END LOOP;
    END IF;

    INSERT INTO public.historical_rent_settlement_reapplications (
      organization_id,
      correction_occurrence_id,
      settlement_kind,
      original_settlement_id,
      reversal_settlement_id,
      replacement_settlement_id,
      original_amount,
      reapplied_amount,
      credit_amount,
      original_allocation_snapshot,
      replacement_allocation_snapshot,
      created_by
    ) VALUES (
      p_organization_id,
      v_correction_id,
      'owner_confirmation',
      v_confirmation.id,
      v_reversal_settlement_id,
      v_replacement_settlement_id,
      v_confirmation.amount,
      v_reapplied_amount,
      v_credit_amount,
      v_original_allocations,
      v_replacement_allocations,
      v_actor_id
    );

    IF v_credit_amount > 0 THEN
      INSERT INTO public.tenant_credit_occurrences (
        organization_id,
        correction_occurrence_id,
        tenant_invoice_id,
        lease_id,
        property_id,
        unit_id,
        tenant_person_id,
        owner_person_id,
        currency,
        occurred_on,
        amount,
        custody_kind,
        source_settlement_kind,
        source_settlement_id,
        reason,
        created_by
      ) VALUES (
        p_organization_id,
        v_correction_id,
        p_invoice_id,
        v_invoice.lease_id,
        v_invoice.property_id,
        v_invoice.unit_id,
        v_invoice.recipient_person_id,
        v_confirmation.owner_person_id,
        v_invoice.currency,
        v_business_date,
        v_credit_amount,
        'owner_held',
        'owner_confirmation',
        v_confirmation.id,
        v_reason,
        v_actor_id
      );
    END IF;
    v_reapplied_target := (v_reapplied_target + v_target_capacity)::numeric(14,2);
    v_tenant_credit_total := (
      v_tenant_credit_total + v_credit_amount
    )::numeric(14,2);
    v_settlement_count := v_settlement_count + 1;
  END LOOP;

  IF v_original_fee.id IS NOT NULL AND v_replacement_fee_amount > 0 THEN
    PERFORM app_private.apply_available_owner_cash(
      p_organization_id,
      v_invoice.property_id,
      v_business_date,
      v_actor_id
    );
    FOR v_new_allocation IN
      SELECT allocation.id
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_replacement_owner_line_id
        AND allocation.reversal_of_id IS NULL
      ORDER BY allocation.allocation_date, allocation.created_at, allocation.id
    LOOP
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'owner_invoice_payment',
        v_new_allocation.id,
        'historical-rent-owner-cash-reapply-' ||
          replace(v_new_allocation.id::text, '-', '')
      );
    END LOOP;
  END IF;

  PERFORM app_private.mark_tenant_rent_owner_periods_stale(
    p_organization_id,
    v_invoice.property_id,
    v_invoice.currency,
    ARRAY[v_original_line.id],
    v_correction_id,
    v_actor_id
  );

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'tenant_invoice',
    p_invoice_id,
    'historical_rent_corrected',
    v_payload || pg_catalog.jsonb_build_object(
      'correctionId', v_correction_id,
      'replacementRentLineId', v_replacement_line_id,
      'replacementIncomeItemId', v_replacement_income_id,
      'settlementReplayCount', v_settlement_count,
      'tenantCreditAmount', v_tenant_credit_total
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'correctionId', v_correction_id,
    'invoiceId', p_invoice_id,
    'replacementRentLineId', v_replacement_line_id,
    'replacementIncomeItemId', v_replacement_income_id,
    'settlementReplayCount', v_settlement_count,
    'tenantCreditAmount', v_tenant_credit_total,
    'correctedRentAmount', p_corrected_rent_amount,
    'correctedDueDate', v_preview->>'correctedDueDate'
  );
  v_result := app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );

  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config('app.rent_generation_context', '', true);
  PERFORM pg_catalog.set_config('app.owner_balance_write_context', '', true);
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config('app.owner_close_write_context', '', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config('app.rent_generation_context', '', true);
  PERFORM pg_catalog.set_config('app.owner_balance_write_context', '', true);
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config('app.owner_close_write_context', '', true);
  RAISE;
END;
$$;
