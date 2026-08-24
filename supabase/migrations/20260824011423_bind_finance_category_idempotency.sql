ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_org_namespace_id_key
  UNIQUE (organization_id, namespace, id);

CREATE TABLE app_private.finance_category_idempotency_bindings (
  organization_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  namespace text NOT NULL,
  finance_category_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_category_idempotency_bindings_pkey
    PRIMARY KEY (organization_id, operation, idempotency_key),
  CONSTRAINT finance_category_idempotency_bindings_operation_check
    CHECK (
      (operation = 'submit_expense'
        AND namespace IN ('owner_expense', 'tenant_billing'))
      OR (operation = 'create_manual_tenant_charge'
        AND namespace = 'tenant_billing')
    ),
  CONSTRAINT finance_category_idempotency_bindings_request_fkey
    FOREIGN KEY (organization_id, operation, idempotency_key)
    REFERENCES app_private.financial_idempotency_requests (
      organization_id, operation, idempotency_key
    )
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT finance_category_idempotency_bindings_category_fkey
    FOREIGN KEY (organization_id, namespace, finance_category_id)
    REFERENCES public.finance_categories (organization_id, namespace, id)
    ON DELETE RESTRICT
);

ALTER TABLE app_private.finance_category_idempotency_bindings OWNER TO postgres;
REVOKE ALL ON TABLE app_private.finance_category_idempotency_bindings
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.finance_category_idempotency_bindings IS
  'Immutable canonical Finance category identity bound to the unchanged financial idempotency operation and key.';

INSERT INTO app_private.finance_category_idempotency_bindings (
  organization_id,
  operation,
  idempotency_key,
  namespace,
  finance_category_id
)
SELECT
  request.organization_id,
  request.operation,
  request.idempotency_key,
  category.namespace,
  category.id
FROM app_private.financial_idempotency_requests AS request
JOIN public.expense_submissions AS submission
  ON submission.organization_id = request.organization_id
 AND request.result_ids->>'submission_id' ~
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND submission.id = (request.result_ids->>'submission_id')::uuid
JOIN public.finance_categories AS category
  ON category.organization_id = submission.organization_id
 AND category.namespace = CASE submission.responsibility
   WHEN 'owner' THEN 'owner_expense'
   WHEN 'tenant' THEN 'tenant_billing'
 END
 AND category.code = app_private.normalize_finance_category_legacy_code(
   submission.customer_category
 )
WHERE request.operation = 'submit_expense'
  AND request.status = 'completed'
ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

INSERT INTO app_private.finance_category_idempotency_bindings (
  organization_id,
  operation,
  idempotency_key,
  namespace,
  finance_category_id
)
SELECT
  request.organization_id,
  request.operation,
  request.idempotency_key,
  'tenant_billing',
  category.id
FROM app_private.financial_idempotency_requests AS request
JOIN public.tenant_invoice_lines AS line
  ON line.organization_id = request.organization_id
 AND request.result_ids->>'lineId' ~
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND line.id = (request.result_ids->>'lineId')::uuid
JOIN public.finance_categories AS category
  ON category.organization_id = line.organization_id
 AND category.namespace = 'tenant_billing'
 AND (
   category.id = line.finance_category_id
   OR (
     line.finance_category_id IS NULL
     AND line.line_type <> 'rent'
     AND category.code = app_private.normalize_finance_category_legacy_code(
       line.line_type
     )
   )
 )
WHERE request.operation = 'create_manual_tenant_charge'
  AND request.status = 'completed'
ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_expense(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_customer_category text,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_currency public.currency_code,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_reconciliation_source_id uuid,
  p_supporting_document_id uuid,
  p_vendor_person_id uuid,
  p_reference text,
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
  v_namespace text;
  v_responsibility text := lower(btrim(coalesce(p_responsibility, '')));
  v_result jsonb;
  v_submission_id uuid;
  v_unbound_request_exists boolean := false;
BEGIN
  IF v_responsibility NOT IN ('owner', 'tenant') THEN
    RAISE EXCEPTION 'Choose Owner or Tenant' USING ERRCODE = '22023';
  END IF;

  v_namespace := CASE v_responsibility
    WHEN 'owner' THEN 'owner_expense'
    ELSE 'tenant_billing'
  END;

  SELECT resolved.*
  INTO v_authority
  FROM public.resolve_finance_category(
    p_organization_id,
    v_namespace,
    p_customer_category
  ) AS resolved;

  IF NOT FOUND OR v_authority.authority_kind <> 'category' THEN
    RAISE EXCEPTION 'Choose an active Finance category for this cost'
      USING ERRCODE = '22023',
        DETAIL = 'finance_category_inactive_or_missing';
  END IF;

  v_bridge_category := CASE
    WHEN v_authority.canonical_code = 'cleaning' THEN 'cleaning'
    WHEN v_authority.canonical_code = 'repairs_maintenance' THEN
      'repairs_maintenance'
    WHEN v_authority.canonical_code = 'utilities' THEN 'utility'
    WHEN v_authority.reporting_group = 'maintenance' THEN
      'repairs_maintenance'
    WHEN v_authority.reporting_group IN ('utilities', 'utility_reimbursement')
      THEN 'utility'
    ELSE 'other'
  END;

  SELECT EXISTS (
    SELECT 1
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.operation = 'submit_expense'
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
      'submit_expense',
      btrim(coalesce(p_idempotency_key, '')),
      v_namespace,
      v_authority.category_id
    )
    ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING
    RETURNING true INTO v_binding_inserted;
  END IF;

  IF coalesce(v_binding_inserted, false) AND NOT v_authority.is_active THEN
    RAISE EXCEPTION 'Choose an active Finance category for this cost'
      USING ERRCODE = '22023',
        DETAIL = 'finance_category_inactive_or_missing';
  END IF;

  v_result := app_private.submit_expense_before_category_connection(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_source_type,
    p_source_id,
    v_bridge_category,
    p_vendor_label,
    p_expense_date,
    p_internal_cost_amount,
    p_internal_markup_amount,
    p_currency,
    v_responsibility,
    p_tenant_invoice_id,
    p_reconciliation_source_id,
    p_supporting_document_id,
    p_vendor_person_id,
    p_reference,
    p_idempotency_key
  );

  IF v_unbound_request_exists THEN
    RAISE EXCEPTION 'Finance category idempotency binding is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_binding_missing';
  END IF;

  SELECT binding.*
  INTO STRICT v_binding
  FROM app_private.finance_category_idempotency_bindings AS binding
  WHERE binding.organization_id = p_organization_id
    AND binding.operation = 'submit_expense'
    AND binding.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  FOR UPDATE;

  IF v_binding.namespace IS DISTINCT FROM v_namespace
    OR v_binding.finance_category_id IS DISTINCT FROM v_authority.category_id
  THEN
    RAISE EXCEPTION 'Conflicting Finance category idempotency request'
      USING ERRCODE = '22023',
        DETAIL = 'finance_category_idempotency_conflict';
  END IF;

  IF coalesce(v_result->>'submission_id', '') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;
  v_submission_id := (v_result->>'submission_id')::uuid;

  PERFORM 1
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.operation = 'submit_expense'
    AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    AND request.status = 'completed'
    AND request.result_ids->>'submission_id' = v_submission_id::text
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  PERFORM 1
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = v_submission_id
    AND submission.responsibility = v_responsibility
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  IF NOT coalesce(v_binding_inserted, false) THEN
    RETURN v_result;
  END IF;

  UPDATE public.expense_submissions AS submission
  SET customer_category = v_authority.canonical_code
  WHERE submission.organization_id = p_organization_id
    AND submission.id = v_submission_id;

  RETURN v_result;
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
  v_result jsonb;
  v_unbound_request_exists boolean := false;
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
      SELECT line.description
      INTO v_effective_description
      FROM app_private.financial_idempotency_requests AS request
      JOIN public.tenant_invoice_lines AS line
        ON request.result_ids->>'lineId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND line.organization_id = request.organization_id
       AND line.id = (request.result_ids->>'lineId')::uuid
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'create_manual_tenant_charge'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed';

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

  IF v_unbound_request_exists THEN
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

  IF coalesce(v_result->>'lineId', '') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;
  v_line_id := (v_result->>'lineId')::uuid;

  PERFORM 1
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.operation = 'create_manual_tenant_charge'
    AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    AND request.status = 'completed'
    AND request.result_ids->>'lineId' = v_line_id::text
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  PERFORM 1
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = v_line_id
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

ALTER FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) IS
  'Submits category-authorized paid costs with immutable canonical category identity bound to idempotency.';

COMMENT ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) IS
  'Creates category-authorized tenant charges with immutable canonical category identity bound to idempotency; manual rent remains database-guarded.';
