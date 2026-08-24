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
  v_bridge_category text;
  v_income_item_id uuid;
  v_line_id uuid;
  v_result jsonb;
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

REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) IS
  'Creates category-authorized tenant charges while preserving the checked database guard for legacy manual-rent attempts. Manual rent remains absent from ordinary UI.';
