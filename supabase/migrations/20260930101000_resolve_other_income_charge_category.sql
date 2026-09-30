CREATE OR REPLACE FUNCTION app_private.resolve_chart_lease_charge_category(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid,
  p_allow_archived boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_category_code text;
BEGIN
  SELECT category.code INTO v_category_code
  FROM public.finance_accounts AS account
  JOIN public.finance_account_category_links AS link
    ON link.organization_id = account.organization_id
   AND link.account_id = account.id
  JOIN public.finance_categories AS category
    ON category.organization_id = link.organization_id
   AND category.id = link.category_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND (p_allow_archived OR (account.archived_at IS NULL AND category.archived_at IS NULL))
    AND category.namespace = 'tenant_billing'
    AND account.account_class = 'income'
    AND account.use_for_lease_charges
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
  ORDER BY
    (
      account.normalized_name IN ('other', 'other income')
      AND category.code = 'other'
    ) DESC,
    (category.normalized_label = account.normalized_name) DESC,
    category.id
  LIMIT 1
  FOR SHARE OF account, link, category;

  IF v_category_code IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active lease-charge account'
      USING ERRCODE = '22023', DETAIL = 'finance_lease_charge_account_incompatible';
  END IF;
  RETURN v_category_code;
END;
$$;

REVOKE ALL ON FUNCTION app_private.resolve_chart_lease_charge_category(
  uuid, uuid, uuid, boolean
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.resolve_chart_lease_charge_category(
  uuid, uuid, uuid, boolean
) IS 'Resolves one deterministic tenant-billing category for a lease-charge account; Other income prefers the canonical Other category when legacy links remain.';
