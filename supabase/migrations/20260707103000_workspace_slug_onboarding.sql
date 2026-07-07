DROP FUNCTION IF EXISTS public.bootstrap_admin_organization(text);
DROP FUNCTION IF EXISTS app_private.bootstrap_admin_organization(text);

CREATE OR REPLACE FUNCTION app_private.bootstrap_admin_organization(
  organization_name text,
  workspace_slug text DEFAULT NULL
)
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
  requested_slug text := lower(nullif(btrim(workspace_slug), ''));
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

  IF requested_slug IS NOT NULL THEN
    IF requested_slug IN ('api', 'app', 'www') THEN
      RAISE EXCEPTION 'Workspace URL is reserved.';
    END IF;

    IF
      length(requested_slug) < 3
      OR length(requested_slug) > 63
      OR requested_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    THEN
      RAISE EXCEPTION 'Workspace URL is invalid.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.organizations
      WHERE slug = requested_slug
    ) THEN
      RAISE EXCEPTION 'Workspace URL is already taken.';
    END IF;

    candidate_slug := requested_slug;
  ELSE
    base_slug := app_private.organization_slug_base(cleaned_name);
    candidate_slug := left(base_slug, 63);

    WHILE
      candidate_slug IN ('api', 'app', 'www')
      OR EXISTS (
        SELECT 1
        FROM public.organizations
        WHERE slug = candidate_slug
      )
    LOOP
      candidate_slug :=
        left(base_slug, greatest(1, 63 - length(slug_suffix::text) - 1))
        || '-' || slug_suffix::text;
      slug_suffix := slug_suffix + 1;
    END LOOP;
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (cleaned_name, candidate_slug)
  RETURNING id INTO organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (organization_id, current_user_id, 'admin')
  RETURNING id INTO membership_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app_private.bootstrap_admin_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.bootstrap_admin_organization(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_admin_organization(
  organization_name text,
  workspace_slug text DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  membership_id uuid
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
  SELECT *
  FROM app_private.bootstrap_admin_organization(organization_name, workspace_slug);
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_organization(text, text) TO authenticated;
