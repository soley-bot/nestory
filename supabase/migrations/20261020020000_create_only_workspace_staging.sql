-- Create-only no-email staging. The unique slug index rejects concurrent duplicates.
-- Never reuse or refresh an existing workspace invitation.
CREATE OR REPLACE FUNCTION public.stage_client_workspace(
  p_name text,
  p_slug text,
  p_admin_email text
)
RETURNS TABLE(
  organization_id uuid,
  invitation_id uuid,
  organization_name text,
  workspace_slug text,
  invited_email text,
  invitation_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  normalized_email text := lower(trim(coalesce(p_admin_email, '')));
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_slug text := lower(trim(coalesce(p_slug, '')));
  new_organization_id uuid;
  new_invitation_id uuid;
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_name) < 2 OR length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Company name must be between 2 and 120 characters'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'
    OR normalized_slug IN ('api', 'app', 'www') THEN
    RAISE EXCEPTION 'Workspace slug is invalid or reserved'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Administrator email is invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (normalized_name, normalized_slug)
  RETURNING id INTO new_organization_id;

  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    invited_at,
    expires_at
  )
  VALUES (
    new_organization_id,
    normalized_email,
    'super_admin',
    'pending',
    now(),
    now() + interval '1 hour'
  )
  RETURNING id INTO new_invitation_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES
  (
    new_organization_id,
    NULL,
    'organization',
    new_organization_id,
    'workspace_provisioned',
    jsonb_build_object('name', normalized_name, 'slug', normalized_slug)
  ),
  (
    new_organization_id,
    NULL,
    'organization_invitation',
    new_invitation_id,
    'organization_invitation_created',
    jsonb_build_object('email', normalized_email, 'role', 'super_admin')
  );

  RETURN QUERY
  SELECT
    new_organization_id,
    new_invitation_id,
    normalized_name,
    normalized_slug,
    normalized_email,
    'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_client_workspace(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_client_workspace(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.stage_client_workspace(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_client_workspace(text, text, text) TO service_role;
