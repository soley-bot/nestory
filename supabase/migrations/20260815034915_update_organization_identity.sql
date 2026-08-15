CREATE OR REPLACE FUNCTION public.update_organization_identity(
  p_organization_id uuid,
  p_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_previous_name text;
BEGIN
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can update organization identity.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Workspace name must be between 2 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  SELECT organization.name
  INTO v_previous_name
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_name = v_name THEN
    RETURN v_name;
  END IF;

  UPDATE public.organizations
  SET name = v_name
  WHERE id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization',
    p_organization_id,
    'updated',
    jsonb_build_object('name', v_previous_name),
    jsonb_build_object('name', v_name)
  );

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_identity(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_identity(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_organization_identity(uuid, text) TO authenticated;
