BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(3);

SELECT has_trigger(
  'public',
  'organizations',
  'ensure_default_ips_collections_source',
  'new workspaces receive a default IPS collection source'
);

SELECT results_eq(
  $$
    SELECT count(*)::bigint
    FROM public.organizations AS organization
    WHERE EXISTS (
      SELECT 1
      FROM public.financial_reconciliation_sources AS source
      WHERE source.organization_id = organization.id
        AND source.code = 'IPS_COLLECTIONS'
        AND source.currency = 'USD'
        AND source.scope_kind = 'organization_pooled'
        AND source.archived_at IS NULL
    )
  $$,
  $$ SELECT count(*)::bigint FROM public.organizations $$,
  'every existing workspace has a usable IPS collection source'
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  'IPS collection source test',
  'ips-collection-source-test'
);

SELECT results_eq(
  $$
    SELECT code, display_name, source_kind, scope_kind, currency::text
    FROM public.financial_reconciliation_sources
    WHERE organization_id = '00000000-0000-0000-0000-000000000099'
  $$,
  $$ VALUES (
    'IPS_COLLECTIONS'::text,
    'IPS collected funds'::text,
    'clearing'::text,
    'organization_pooled'::text,
    'USD'::text
  ) $$,
  'a newly created workspace can immediately record IPS rent collection'
);

SELECT * FROM finish();

ROLLBACK;
