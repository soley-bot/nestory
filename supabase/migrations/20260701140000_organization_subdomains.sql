-- MVP workspace routing by subdomain.
-- ponytail: a single organization slug is enough for Nestory-owned subdomains;
-- add organization_domains when customers need custom domains or aliases.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION app_private.organization_slug_base(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' from lower(regexp_replace(input, '[^a-zA-Z0-9]+', '-', 'g'))),
      ''
    ),
    'workspace'
  );
$$;

WITH normalized AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY created_at, id) AS slug_index
  FROM (
    SELECT
      id,
      created_at,
      app_private.organization_slug_base(name) AS base_slug
    FROM public.organizations
    WHERE slug IS NULL OR slug = ''
  ) AS source_rows
)
UPDATE public.organizations AS organizations
SET slug = CASE
  WHEN normalized.slug_index = 1 THEN left(normalized.base_slug, 63)
  ELSE
    left(
      normalized.base_slug,
      greatest(1, 63 - length(normalized.slug_index::text) - 1)
    ) || '-' || normalized.slug_index::text
  END
FROM normalized
WHERE organizations.id = normalized.id;

ALTER TABLE public.organizations
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT organizations_slug_format_check
  CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$');

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key
  ON public.organizations (slug);

CREATE OR REPLACE FUNCTION app_private.bootstrap_admin_organization(organization_name text)
RETURNS TABLE (
  organization_id uuid,
  membership_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleaned_name text := btrim(organization_name);
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 2;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF cleaned_name IS NULL OR length(cleaned_name) < 2 THEN
    RAISE EXCEPTION 'Organization name is required.';
  END IF;

  IF length(cleaned_name) > 120 THEN
    RAISE EXCEPTION 'Organization name is too long.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'User already belongs to a workspace.';
  END IF;

  base_slug := app_private.organization_slug_base(cleaned_name);
  candidate_slug := left(base_slug, 63);

  WHILE EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE slug = candidate_slug
  ) LOOP
    candidate_slug :=
      left(base_slug, greatest(1, 63 - length(slug_suffix::text) - 1))
      || '-' || slug_suffix::text;
    slug_suffix := slug_suffix + 1;
  END LOOP;

  INSERT INTO public.organizations (name, slug)
  VALUES (cleaned_name, candidate_slug)
  RETURNING id INTO organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (organization_id, current_user_id, 'admin')
  RETURNING id INTO membership_id;

  RETURN NEXT;
END;
$$;
