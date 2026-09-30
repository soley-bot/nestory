CREATE OR REPLACE FUNCTION public.create_manual_tenant_charge_with_account(
  p_organization_id uuid,
  p_lease_id uuid,
  p_category_account_id uuid,
  p_billing_period_start date,
  p_due_date date,
  p_amount numeric,
  p_description text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_label text;
  v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
  v_category text;
  v_property_id uuid;
  v_replay boolean;
  v_result jsonb;
BEGIN
  SELECT lease.property_id INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT account.display_name INTO v_account_label
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_category_account_id;

  SELECT binding.* INTO v_binding
  FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  WHERE binding.organization_id = p_organization_id
    AND binding.operation = 'create_manual_tenant_charge'
    AND binding.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  FOR UPDATE;
  IF FOUND THEN
    IF v_binding.primary_account_id IS DISTINCT FROM p_category_account_id THEN
      RAISE EXCEPTION 'Conflicting Chart account idempotency request'
        USING ERRCODE = '22023', DETAIL = 'finance_chart_workflow_idempotency_conflict';
    END IF;
    v_category := v_binding.resolved_category_code;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM app_private.financial_idempotency_requests AS request
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'create_manual_tenant_charge'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed'
    ) INTO v_replay;
    v_category := app_private.resolve_chart_lease_charge_category(
      p_organization_id,
      p_category_account_id,
      v_property_id,
      v_replay
    );
    PERFORM app_private.bind_chart_workflow_accounts(
      p_organization_id,
      'create_manual_tenant_charge',
      p_idempotency_key,
      p_category_account_id,
      NULL,
      v_category,
      NULL
    );
  END IF;

  v_result := public.create_manual_tenant_charge(
    p_organization_id,
    p_lease_id,
    v_category,
    p_billing_period_start,
    p_due_date,
    p_amount,
    p_description,
    p_idempotency_key
  );

  UPDATE public.tenant_invoice_lines AS line
  SET customer_label = v_account_label
  WHERE line.organization_id = p_organization_id
    AND line.id = (v_result->>'lineId')::uuid
    AND v_account_label IS NOT NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_tenant_charge_with_account(
  uuid, uuid, uuid, date, date, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge_with_account(
  uuid, uuid, uuid, date, date, numeric, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_manual_tenant_charge_with_account(
  uuid, uuid, uuid, date, date, numeric, text, text
) IS 'Creates an authorized tenant charge with deterministic category accounting while preserving the operator-selected Chart account label on the invoice line.';
