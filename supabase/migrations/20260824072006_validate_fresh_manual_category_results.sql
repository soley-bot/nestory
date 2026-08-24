CREATE FUNCTION app_private.valid_exact_manual_finance_category_result(
  p_organization_id uuid,
  p_idempotency_key text,
  p_require_seal boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result_id uuid;
BEGIN
  SELECT line.id
  INTO v_result_id
  FROM app_private.financial_idempotency_requests AS request
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = request.organization_id
   AND line.id = CASE
     WHEN request.result_ids->>'lineId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'lineId')::uuid
     ELSE NULL
   END
   AND line.line_type <> 'rent'
   AND line.income_item_id IS NOT NULL
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = line.organization_id
   AND invoice.id = line.invoice_id
   AND invoice.id = CASE
     WHEN request.result_ids->>'invoiceId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'invoiceId')::uuid
     ELSE NULL
   END
   AND invoice.lease_id = CASE
     WHEN request.result_ids->>'leaseId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'leaseId')::uuid
     ELSE NULL
   END
  JOIN public.finance_income_items AS income
    ON income.organization_id = line.organization_id
   AND income.id = line.income_item_id
   AND income.lease_id = invoice.lease_id
   AND income.income_type <> 'rent'
  WHERE request.organization_id = p_organization_id
    AND request.operation = 'create_manual_tenant_charge'
    AND request.idempotency_key = p_idempotency_key
    AND request.status = 'completed'
    AND request.actor_id IS NOT NULL
    AND 1 = (
      SELECT pg_catalog.count(*)
      FROM public.activity_logs AS activity
      WHERE activity.organization_id = request.organization_id
        AND activity.actor_id = request.actor_id
        AND activity.entity_type = 'tenant_invoice'
        AND activity.entity_id = invoice.id
        AND activity.action = 'manual_tenant_charge_created'
        AND activity.new_values->>'invoiceId' = invoice.id::text
        AND activity.new_values->>'lineId' = line.id::text
        AND activity.new_values->>'leaseId' = invoice.lease_id::text
        AND lower(btrim(coalesce(activity.new_values->>'chargeType', '')))
          IN ('utilities', 'cleaning', 'repairs_maintenance', 'other')
        AND app_private.canonical_financial_payload_hash(
          activity.new_values - 'invoiceId' - 'lineId'
        ) = request.payload_hash
    )
    AND (
      NOT p_require_seal
      OR EXISTS (
        SELECT 1
        FROM app_private.finance_category_idempotency_result_seals AS seal
        WHERE seal.organization_id = request.organization_id
          AND seal.operation = request.operation
          AND seal.idempotency_key = request.idempotency_key
          AND seal.result_id = line.id
      )
    );

  RETURN v_result_id;
END;
$$;

ALTER FUNCTION app_private.valid_exact_manual_finance_category_result(
  uuid, text, boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.valid_exact_manual_finance_category_result(
  uuid, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

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
SET search_path = ''
AS $$
DECLARE
  v_authority record;
  v_binding app_private.finance_category_idempotency_bindings%ROWTYPE;
  v_binding_inserted boolean := false;
  v_bridge_category text;
  v_effective_description text := p_description;
  v_income_item_id uuid;
  v_line_id uuid;
  v_request_existed boolean := false;
  v_result jsonb;
  v_seal_existed boolean := false;
  v_unbound_request_exists boolean := false;
  v_validated_result_id uuid;
BEGIN
  IF lower(btrim(coalesce(p_charge_type, ''))) = 'manual_rent' THEN
    RETURN app_private.create_manual_tenant_charge_before_category_connection(
      p_organization_id,
      p_lease_id,
      p_charge_type,
      p_billing_period_start,
      p_due_date,
      p_amount,
      p_description,
      p_idempotency_key
    );
  END IF;

  SELECT resolved.*
  INTO v_authority
  FROM public.resolve_finance_category(
    p_organization_id,
    'tenant_billing',
    p_charge_type
  ) AS resolved;

  IF NOT FOUND OR v_authority.authority_kind <> 'category' THEN
    RAISE EXCEPTION 'Choose an active tenant-billing category'
      USING ERRCODE = '22023',
        DETAIL = 'tenant_billing_category_inactive_or_missing';
  END IF;

  v_bridge_category := CASE
    WHEN v_authority.canonical_code IN (
      'cleaning', 'repairs_maintenance', 'other'
    ) THEN v_authority.canonical_code
    WHEN v_authority.canonical_code = 'utilities' THEN 'utilities'
    WHEN v_authority.reporting_group = 'utility_reimbursement' THEN
      'utilities'
    ELSE 'other'
  END;

  SELECT EXISTS (
    SELECT 1
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.operation = 'create_manual_tenant_charge'
      AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  ) INTO v_request_existed;

  SELECT EXISTS (
    SELECT 1
    FROM app_private.finance_category_idempotency_result_seals AS seal
    WHERE seal.organization_id = p_organization_id
      AND seal.operation = 'create_manual_tenant_charge'
      AND seal.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  ) INTO v_seal_existed;

  IF v_seal_existed AND NOT v_request_existed THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.operation = 'create_manual_tenant_charge'
      AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
      AND NOT EXISTS (
        SELECT 1
        FROM app_private.finance_category_idempotency_bindings AS binding
        WHERE binding.organization_id = request.organization_id
          AND binding.operation = request.operation
          AND binding.idempotency_key = request.idempotency_key
      )
  ) INTO v_unbound_request_exists;

  IF NOT v_unbound_request_exists THEN
    INSERT INTO app_private.finance_category_idempotency_bindings (
      organization_id,
      operation,
      idempotency_key,
      namespace,
      finance_category_id
    )
    VALUES (
      p_organization_id,
      'create_manual_tenant_charge',
      btrim(coalesce(p_idempotency_key, '')),
      'tenant_billing',
      v_authority.category_id
    )
    ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING
    RETURNING true INTO v_binding_inserted;
  END IF;

  IF coalesce(v_binding_inserted, false) AND NOT v_authority.is_active THEN
    RAISE EXCEPTION 'Choose an active tenant-billing category'
      USING ERRCODE = '22023',
        DETAIL = 'tenant_billing_category_inactive_or_missing';
  END IF;

  IF v_authority.canonical_code LIKE 'custom\_%' ESCAPE '\'
    AND nullif(btrim(coalesce(p_description, '')), '') IS NULL
  THEN
    IF coalesce(v_binding_inserted, false) THEN
      v_effective_description := v_authority.display_label;
    ELSE
      IF v_request_existed AND NOT v_seal_existed THEN
        v_line_id := app_private.valid_finance_category_idempotency_result(
          p_organization_id,
          'create_manual_tenant_charge',
          btrim(coalesce(p_idempotency_key, '')),
          false
        );
      ELSE
        v_line_id := app_private.valid_exact_manual_finance_category_result(
          p_organization_id,
          btrim(coalesce(p_idempotency_key, '')),
          true
        );
      END IF;

      SELECT line.description
      INTO v_effective_description
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.id = v_line_id;

      IF NOT FOUND OR nullif(btrim(coalesce(v_effective_description, '')), '')
        IS NULL
      THEN
        RAISE EXCEPTION 'Finance category idempotency result is unavailable'
          USING ERRCODE = '23514',
            DETAIL = 'finance_category_idempotency_result_missing';
      END IF;
    END IF;
  END IF;

  v_result := app_private.create_manual_tenant_charge_before_category_connection(
    p_organization_id,
    p_lease_id,
    v_bridge_category,
    p_billing_period_start,
    p_due_date,
    p_amount,
    v_effective_description,
    p_idempotency_key
  );

  IF coalesce(v_result->>'lineId', '') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;
  v_line_id := (v_result->>'lineId')::uuid;

  IF v_unbound_request_exists THEN
    v_validated_result_id :=
      app_private.valid_finance_category_idempotency_result(
        p_organization_id,
        'create_manual_tenant_charge',
        btrim(coalesce(p_idempotency_key, '')),
        false
      );
    IF v_validated_result_id IS DISTINCT FROM v_line_id THEN
      RAISE EXCEPTION 'Finance category idempotency result is unavailable'
        USING ERRCODE = '23514',
          DETAIL = 'finance_category_idempotency_result_missing';
    END IF;

    RAISE EXCEPTION 'Finance category idempotency binding is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_binding_missing';
  END IF;

  SELECT binding.*
  INTO STRICT v_binding
  FROM app_private.finance_category_idempotency_bindings AS binding
  WHERE binding.organization_id = p_organization_id
    AND binding.operation = 'create_manual_tenant_charge'
    AND binding.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  FOR UPDATE;

  IF v_binding.namespace IS DISTINCT FROM 'tenant_billing'
    OR v_binding.finance_category_id IS DISTINCT FROM v_authority.category_id
  THEN
    RAISE EXCEPTION 'Conflicting Finance category idempotency request'
      USING ERRCODE = '22023',
        DETAIL = 'finance_category_idempotency_conflict';
  END IF;

  IF NOT v_request_existed
    AND NOT v_seal_existed
    AND coalesce(v_binding_inserted, false)
  THEN
    v_validated_result_id :=
      app_private.valid_exact_manual_finance_category_result(
        p_organization_id,
        btrim(coalesce(p_idempotency_key, '')),
        false
      );
  ELSIF v_request_existed AND NOT v_seal_existed THEN
    v_validated_result_id :=
      app_private.valid_finance_category_idempotency_result(
        p_organization_id,
        'create_manual_tenant_charge',
        btrim(coalesce(p_idempotency_key, '')),
        false
      );
  ELSE
    v_validated_result_id :=
      app_private.valid_exact_manual_finance_category_result(
        p_organization_id,
        btrim(coalesce(p_idempotency_key, '')),
        true
      );
  END IF;

  IF v_validated_result_id IS DISTINCT FROM v_line_id THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  IF coalesce(v_binding_inserted, false) THEN
    INSERT INTO app_private.finance_category_idempotency_result_seals (
      organization_id, operation, idempotency_key, result_id
    ) VALUES (
      p_organization_id, 'create_manual_tenant_charge',
      btrim(coalesce(p_idempotency_key, '')), v_line_id
    )
    ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;
  END IF;

  PERFORM 1
  FROM app_private.finance_category_idempotency_result_seals AS seal
  WHERE seal.organization_id = p_organization_id
    AND seal.operation = 'create_manual_tenant_charge'
    AND seal.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    AND seal.result_id = v_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  IF NOT coalesce(v_binding_inserted, false) THEN
    RETURN v_result;
  END IF;

  UPDATE public.tenant_invoice_lines AS line
  SET finance_category_id = v_authority.category_id,
      customer_label = v_authority.display_label
  WHERE line.organization_id = p_organization_id
    AND line.id = v_line_id
  RETURNING line.income_item_id INTO v_income_item_id;

  IF nullif(btrim(coalesce(p_description, '')), '') IS NULL THEN
    UPDATE public.finance_income_items AS income
    SET description = v_authority.display_label
    WHERE income.organization_id = p_organization_id
      AND income.id = v_income_item_id;
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated, service_role;
