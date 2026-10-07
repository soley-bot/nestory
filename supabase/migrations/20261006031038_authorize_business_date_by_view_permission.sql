-- Authorize the company business date using existing view permissions.
-- These three view permissions match the existing lease, finance and property
-- callers. The canonical helper enforces current membership/role/branch state.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL.
CREATE OR REPLACE FUNCTION public.get_lease_rent_business_date(p_organization_id uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (
    app_private.has_org_permission(p_organization_id,'leases.view')
    OR app_private.has_org_permission(p_organization_id,'finance.view')
    OR app_private.has_org_permission(p_organization_id,'properties.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN app_private.rent_business_date(p_organization_id,pg_catalog.statement_timestamp());
END;
$$;
