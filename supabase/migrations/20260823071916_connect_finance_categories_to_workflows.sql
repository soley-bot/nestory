ALTER TABLE public.expense_submissions
  DROP CONSTRAINT expense_submissions_category_check;

ALTER TABLE public.ips_expense_responsibilities
  DROP CONSTRAINT ips_expense_responsibilities_category_check;

ALTER TABLE public.tenant_invoice_lines
  ADD COLUMN finance_category_id uuid
  REFERENCES public.finance_categories(id);

COMMENT ON COLUMN public.tenant_invoice_lines.finance_category_id IS
  'Stable tenant-billing category identity. Base rent remains lease-owned and has no Finance category.';

CREATE FUNCTION app_private.guard_tenant_invoice_line_finance_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.finance_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_categories AS category
    WHERE category.id = NEW.finance_category_id
      AND category.organization_id = NEW.organization_id
      AND category.namespace = 'tenant_billing'
  ) THEN
    RAISE EXCEPTION 'Tenant invoice category does not belong to this organization namespace'
      USING ERRCODE = '23503', DETAIL = 'tenant_billing_category_scope_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_tenant_invoice_line_finance_category
BEFORE INSERT OR UPDATE OF finance_category_id
ON public.tenant_invoice_lines
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_tenant_invoice_line_finance_category();

ALTER FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) RENAME TO submit_expense_before_category_connection;

ALTER FUNCTION public.submit_expense_before_category_connection(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) SET SCHEMA app_private;

CREATE FUNCTION public.submit_expense(
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
  v_bridge_category text;
  v_namespace text;
  v_responsibility text := lower(btrim(coalesce(p_responsibility, '')));
  v_result jsonb;
  v_submission_id uuid;
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

  IF NOT FOUND
    OR v_authority.authority_kind <> 'category'
    OR NOT v_authority.is_active THEN
    RAISE EXCEPTION 'Choose an active Finance category for this cost'
      USING ERRCODE = '22023', DETAIL = 'finance_category_inactive_or_missing';
  END IF;

  v_bridge_category := CASE
    WHEN v_authority.canonical_code = 'cleaning' THEN 'cleaning'
    WHEN v_authority.canonical_code = 'repairs_maintenance' THEN 'repairs_maintenance'
    WHEN v_authority.canonical_code = 'utilities' THEN 'utility'
    WHEN v_authority.reporting_group IN ('maintenance') THEN 'repairs_maintenance'
    WHEN v_authority.reporting_group IN ('utilities', 'utility_reimbursement') THEN 'utility'
    ELSE 'other'
  END;

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

  v_submission_id := (v_result->>'submission_id')::uuid;
  UPDATE public.expense_submissions AS submission
  SET customer_category = v_authority.canonical_code
  WHERE submission.organization_id = p_organization_id
    AND submission.id = v_submission_id;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) RENAME TO review_expense_before_category_connection;

ALTER FUNCTION public.review_expense_before_category_connection(
  uuid, uuid, text, text, text, uuid
) SET SCHEMA app_private;

CREATE FUNCTION public.review_expense(
  p_organization_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text,
  p_reconciliation_source_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority record;
  v_bridge_category text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_finance_expense_item_id uuid;
  v_namespace text;
  v_original_category text;
  v_responsibility text;
  v_result jsonb;
  v_tenant_invoice_line_id uuid;
BEGIN
  SELECT submission.customer_category, submission.responsibility
  INTO v_original_category, v_responsibility
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_decision <> 'approve' THEN
    RETURN app_private.review_expense_before_category_connection(
      p_organization_id,
      p_submission_id,
      p_decision,
      p_reason,
      p_idempotency_key,
      p_reconciliation_source_id
    );
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
    v_original_category
  ) AS resolved;

  IF NOT FOUND OR v_authority.authority_kind <> 'category' THEN
    RAISE EXCEPTION 'Expense category authority is unavailable'
      USING ERRCODE = '23503', DETAIL = 'finance_category_authority_missing';
  END IF;

  v_bridge_category := CASE
    WHEN v_authority.canonical_code = 'cleaning' THEN 'cleaning'
    WHEN v_authority.canonical_code = 'repairs_maintenance' THEN 'repairs_maintenance'
    WHEN v_authority.canonical_code = 'utilities' THEN 'utility'
    WHEN v_authority.reporting_group IN ('maintenance') THEN 'repairs_maintenance'
    WHEN v_authority.reporting_group IN ('utilities', 'utility_reimbursement') THEN 'utility'
    ELSE 'other'
  END;

  UPDATE public.expense_submissions AS submission
  SET customer_category = v_bridge_category
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id;

  v_result := app_private.review_expense_before_category_connection(
    p_organization_id,
    p_submission_id,
    p_decision,
    p_reason,
    p_idempotency_key,
    p_reconciliation_source_id
  );

  UPDATE public.expense_submissions AS submission
  SET customer_category = v_original_category
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id;

  v_finance_expense_item_id := (v_result->>'finance_expense_item_id')::uuid;
  v_tenant_invoice_line_id := (v_result->>'tenant_invoice_line_id')::uuid;

  UPDATE public.ips_expense_responsibilities AS responsibility
  SET customer_category = v_authority.canonical_code,
      customer_label = v_authority.display_label
  WHERE responsibility.organization_id = p_organization_id
    AND responsibility.finance_expense_item_id = v_finance_expense_item_id;

  UPDATE public.finance_expense_items AS expense
  SET category = v_authority.display_label
  WHERE expense.organization_id = p_organization_id
    AND expense.id = v_finance_expense_item_id;

  IF v_tenant_invoice_line_id IS NOT NULL THEN
    UPDATE public.tenant_invoice_lines AS line
    SET finance_category_id = v_authority.category_id,
        customer_label = v_authority.display_label
    WHERE line.organization_id = p_organization_id
      AND line.id = v_tenant_invoice_line_id;
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) RENAME TO create_manual_tenant_charge_before_category_connection;

ALTER FUNCTION public.create_manual_tenant_charge_before_category_connection(
  uuid, uuid, text, date, date, numeric, text, text
) SET SCHEMA app_private;

CREATE FUNCTION public.create_manual_tenant_charge(
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
  v_bridge_category text;
  v_income_item_id uuid;
  v_line_id uuid;
  v_result jsonb;
BEGIN
  SELECT resolved.*
  INTO v_authority
  FROM public.resolve_finance_category(
    p_organization_id,
    'tenant_billing',
    p_charge_type
  ) AS resolved;

  IF NOT FOUND
    OR v_authority.authority_kind <> 'category'
    OR NOT v_authority.is_active THEN
    RAISE EXCEPTION 'Choose an active tenant-billing category'
      USING ERRCODE = '22023', DETAIL = 'tenant_billing_category_inactive_or_missing';
  END IF;

  v_bridge_category := CASE
    WHEN v_authority.canonical_code IN (
      'cleaning', 'repairs_maintenance', 'other'
    ) THEN v_authority.canonical_code
    WHEN v_authority.canonical_code = 'utilities' THEN 'utilities'
    WHEN v_authority.reporting_group = 'utility_reimbursement' THEN 'utilities'
    ELSE 'other'
  END;

  v_result := app_private.create_manual_tenant_charge_before_category_connection(
    p_organization_id,
    p_lease_id,
    v_bridge_category,
    p_billing_period_start,
    p_due_date,
    p_amount,
    p_description,
    p_idempotency_key
  );

  v_line_id := (v_result->>'lineId')::uuid;
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

CREATE OR REPLACE FUNCTION app_private.finance_category_is_used(
  p_category_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH category_record AS (
    SELECT category.organization_id, category.namespace, category.code, category.id
    FROM public.finance_categories AS category
    WHERE category.id = p_category_id
  )
  SELECT coalesce(bool_or(
    CASE category.namespace
      WHEN 'owner_expense' THEN
        EXISTS (
          SELECT 1
          FROM public.expense_submissions AS submission
          WHERE submission.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              submission.customer_category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.ips_expense_responsibilities AS responsibility
          WHERE responsibility.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              responsibility.customer_category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.finance_expense_items AS expense
          WHERE expense.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              expense.category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.petty_cash_entries AS entry
          WHERE entry.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              entry.category
            ) = category.code
        )
      WHEN 'tenant_billing' THEN
        EXISTS (
          SELECT 1
          FROM public.tenant_invoice_lines AS line
          WHERE line.organization_id = category.organization_id
            AND (
              line.finance_category_id = category.id
              OR app_private.normalize_finance_category_legacy_code(
                line.line_type
              ) = category.code
            )
        )
      ELSE false
    END
  ), false)
  FROM category_record AS category;
$$;

REVOKE ALL ON FUNCTION app_private.guard_tenant_invoice_line_finance_category()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.submit_expense_before_category_connection(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.review_expense_before_category_connection(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.create_manual_tenant_charge_before_category_connection(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated;

COMMENT ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) IS 'Submits a paid cost only with an active organization category from the responsibility-specific namespace.';
COMMENT ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) IS 'Reviews paid cost evidence while retaining category identity and stable reporting-group economics.';
COMMENT ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) IS 'Creates a checked non-rent tenant charge using an active organization tenant-billing category.';
