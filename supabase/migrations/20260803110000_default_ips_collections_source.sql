-- Give every workspace one usable destination for rent collected by IPS.
-- More bank or cash accounts can still be added through the checked source RPC.
CREATE OR REPLACE FUNCTION app_private.ensure_default_ips_collections_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  );

  INSERT INTO public.financial_reconciliation_sources (
    organization_id,
    property_id,
    currency,
    code,
    display_name,
    source_kind,
    scope_kind
  )
  VALUES (
    NEW.id,
    NULL,
    'USD'::public.currency_code,
    'IPS_COLLECTIONS',
    'IPS collected funds',
    'clearing',
    'organization_pooled'
  )
  ON CONFLICT (organization_id, code) DO NOTHING;

  PERFORM pg_catalog.set_config(
    'app.financial_reconciliation_source_context',
    'off',
    true
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.ensure_default_ips_collections_source()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER ensure_default_ips_collections_source
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_default_ips_collections_source();

-- Backfill workspaces that existed before this migration.
SELECT pg_catalog.set_config(
  'app.financial_reconciliation_source_context',
  'on',
  true
);

INSERT INTO public.financial_reconciliation_sources (
  organization_id,
  property_id,
  currency,
  code,
  display_name,
  source_kind,
  scope_kind
)
SELECT
  organization.id,
  NULL,
  'USD'::public.currency_code,
  'IPS_COLLECTIONS',
  'IPS collected funds',
  'clearing',
  'organization_pooled'
FROM public.organizations AS organization
ON CONFLICT (organization_id, code) DO NOTHING;

SELECT pg_catalog.set_config(
  'app.financial_reconciliation_source_context',
  'off',
  true
);
