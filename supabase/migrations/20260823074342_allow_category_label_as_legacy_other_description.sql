ALTER FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) RENAME TO create_manual_tenant_charge_before_category_label_bridge;

ALTER FUNCTION public.create_manual_tenant_charge_before_category_label_bridge(
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
  v_effective_description text := p_description;
BEGIN
  IF lower(btrim(coalesce(p_charge_type, ''))) = 'manual_rent' THEN
    RETURN app_private.create_manual_tenant_charge_before_category_label_bridge(
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

  IF FOUND
    AND v_authority.authority_kind = 'category'
    AND v_authority.canonical_code LIKE 'custom\_%' ESCAPE '\'
    AND nullif(btrim(coalesce(p_description, '')), '') IS NULL THEN
    v_effective_description := v_authority.display_label;
  END IF;

  RETURN app_private.create_manual_tenant_charge_before_category_label_bridge(
    p_organization_id,
    p_lease_id,
    p_charge_type,
    p_billing_period_start,
    p_due_date,
    p_amount,
    v_effective_description,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_manual_tenant_charge_before_category_label_bridge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_manual_tenant_charge(
  uuid, uuid, text, date, date, numeric, text, text
) IS
  'Creates category-authorized tenant charges, using a custom category label when its optional description is omitted, while preserving the database-only manual-rent guard.';
