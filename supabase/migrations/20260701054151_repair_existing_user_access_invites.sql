CREATE OR REPLACE FUNCTION public.add_existing_organization_member(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, auth
AS $$
DECLARE
  existing_member_id uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
  target_user_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_email = '' THEN
    RAISE EXCEPTION 'Email is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  SELECT users.id
  INTO target_user_id
  FROM auth.users AS users
  WHERE lower(users.email) = normalized_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User account not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches
    WHERE id = p_branch_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  SELECT id
  INTO existing_member_id
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = target_user_id
  LIMIT 1;

  IF existing_member_id IS NOT NULL THEN
    UPDATE public.organization_members
    SET
      branch_id = p_branch_id,
      person_id = p_person_id,
      role = normalized_role
    WHERE id = existing_member_id;

    RETURN existing_member_id;
  END IF;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    person_id,
    branch_id
  )
  VALUES (
    p_organization_id,
    target_user_id,
    normalized_role,
    p_person_id,
    p_branch_id
  )
  RETURNING id INTO existing_member_id;

  RETURN existing_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_existing_organization_member(uuid, text, text, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_existing_organization_member(uuid, text, text, uuid, uuid)
TO authenticated;
