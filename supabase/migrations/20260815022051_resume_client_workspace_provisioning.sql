CREATE OR REPLACE FUNCTION public.provision_client_workspace(
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
  target_organization public.organizations%ROWTYPE;
  target_invitation public.organization_invitations%ROWTYPE;
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

  SELECT organization.*
  INTO target_organization
  FROM public.organizations AS organization
  WHERE organization.slug = normalized_slug
  FOR UPDATE;

  IF target_organization.id IS NOT NULL THEN
    IF lower(target_organization.name) <> lower(normalized_name)
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = target_organization.id
      ) THEN
      RAISE EXCEPTION 'Workspace slug already exists' USING ERRCODE = '23505';
    END IF;

    SELECT invitation.*
    INTO target_invitation
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = target_organization.id
      AND invitation.email = normalized_email
      AND invitation.role = 'super_admin'
      AND invitation.status IN ('pending', 'send_failed', 'expired')
    ORDER BY invitation.invited_at DESC
    LIMIT 1
    FOR UPDATE;

    IF target_invitation.id IS NULL THEN
      RAISE EXCEPTION
        'Existing workspace provisioning can only resume for its original administrator'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.organization_invitations
    SET
      status = 'pending',
      delivery_error = NULL,
      invited_at = now(),
      expires_at = now() + interval '1 hour'
    WHERE id = target_invitation.id;

    INSERT INTO public.activity_logs (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      new_values
    ) VALUES (
      target_organization.id,
      NULL,
      'organization_invitation',
      target_invitation.id,
      'workspace_provisioning_resumed',
      jsonb_build_object('email', normalized_email, 'role', 'super_admin')
    );

    RETURN QUERY
    SELECT
      target_organization.id,
      target_invitation.id,
      target_organization.name,
      target_organization.slug,
      normalized_email,
      'pending'::text;
    RETURN;
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

REVOKE ALL ON FUNCTION public.provision_client_workspace(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_client_workspace(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.provision_client_workspace(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_client_workspace(text, text, text) TO service_role;
