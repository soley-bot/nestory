CREATE OR REPLACE FUNCTION public.bootstrap_admin_organization(organization_name text)
RETURNS TABLE (
  organization_id uuid,
  membership_id uuid
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  cleaned_name text := btrim(organization_name);
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

  INSERT INTO public.organizations (name)
  VALUES (cleaned_name)
  RETURNING id INTO organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (organization_id, current_user_id, 'admin')
  RETURNING id INTO membership_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_organization(text) TO authenticated;
