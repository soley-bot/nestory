CREATE OR REPLACE FUNCTION public.restore_financial_reconciliation_source(
  p_organization_id uuid,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source public.financial_reconciliation_sources%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_manage_reconciliation_sources(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT source.*
  INTO v_source
  FROM public.financial_reconciliation_sources AS source
  WHERE source.organization_id = p_organization_id
    AND source.id = p_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial reconciliation source not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_source.scope_kind = 'property_dedicated'
    AND NOT EXISTS (
      SELECT 1
      FROM public.properties AS property
      WHERE property.organization_id = p_organization_id
        AND property.id = v_source.property_id
        AND property.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Dedicated funding source property is archived'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  );

  UPDATE public.financial_reconciliation_sources
  SET archived_at = NULL,
      archived_by = NULL,
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_source_id;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'off',
    true
  );

  RETURN p_source_id;
END;
$$;

COMMENT ON FUNCTION public.restore_financial_reconciliation_source(uuid, uuid)
IS 'Restores an archived operational funding source through the Super Admin-only checked lifecycle boundary. Dedicated sources fail closed while their Property is archived.';

REVOKE ALL ON FUNCTION public.restore_financial_reconciliation_source(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_financial_reconciliation_source(uuid, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS financial_reconciliation_sources_branch_select
  ON public.financial_reconciliation_sources;

CREATE POLICY financial_reconciliation_sources_branch_select
  ON public.financial_reconciliation_sources
  FOR SELECT
  TO authenticated
  USING (
    app_private.is_super_admin(organization_id)
    OR (
      scope_kind = 'organization_pooled'
      AND property_id IS NULL
      AND app_private.has_org_permission(organization_id, 'finance.view')
    )
    OR (
      scope_kind = 'property_dedicated'
      AND property_id IS NOT NULL
      AND app_private.can_read_finance_property(organization_id, property_id)
    )
  );
