CREATE OR REPLACE FUNCTION public.update_organization_member_access(
  p_organization_id uuid,
  p_member_id uuid,
  p_role text,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  existing_member_role text;
  normalized_role text := lower(trim(coalesce(p_role, '')));
BEGIN
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
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

  SELECT role
  INTO existing_member_role
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF existing_member_role = 'admin' AND normalized_role <> 'admin' THEN
    PERFORM id
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF (
      SELECT count(*)
      FROM public.organization_members
      WHERE organization_id = p_organization_id
        AND role = 'admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last administrator';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET
    role = normalized_role,
    person_id = p_person_id,
    branch_id = p_branch_id
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  RETURN p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
TO authenticated;
