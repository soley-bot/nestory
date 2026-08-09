CREATE OR REPLACE FUNCTION app_private.can_operate_finance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_petty_cash(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_reconciliation_sources(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_retry_current_rent(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_lock_financial_month(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_unlock_financial_month(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_finance_reports(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_correct_finance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_operate_finance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_manage_petty_cash(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_manage_reconciliation_sources(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_retry_current_rent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_lock_financial_month(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_unlock_financial_month(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_read_finance_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_correct_finance(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.can_operate_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_manage_petty_cash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_manage_reconciliation_sources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_retry_current_rent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_lock_financial_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_unlock_financial_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_finance_reports(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_correct_finance(uuid) TO authenticated;
