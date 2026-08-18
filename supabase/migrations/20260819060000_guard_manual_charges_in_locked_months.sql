ALTER FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) RENAME TO create_manual_tenant_charge_before_month_lock;

ALTER FUNCTION public.create_manual_tenant_charge_before_month_lock(
  uuid, uuid, text, date, date, numeric, text, text
) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION app_private.create_manual_tenant_charge_before_month_lock(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;

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
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_billing_period_start IS NOT NULL
    AND app_private.is_financial_month_locked(
      p_organization_id,
      date_trunc('month', p_billing_period_start)::date
    ) THEN
    RAISE EXCEPTION 'This month is locked; unlock it before adding a charge'
      USING ERRCODE = '55000', DETAIL = 'manual_charge_financial_month_locked';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_billing_period_start
  );

  RETURN app_private.create_manual_tenant_charge_before_month_lock(
    p_organization_id,
    p_lease_id,
    p_charge_type,
    p_billing_period_start,
    p_due_date,
    p_amount,
    p_description,
    p_idempotency_key
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
) IS 'Creates a checked tenant charge only while its financial month remains open.';
