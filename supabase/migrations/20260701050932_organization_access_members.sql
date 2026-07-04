CREATE OR REPLACE FUNCTION public.get_organization_access_members(
  p_organization_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  person_id uuid,
  branch_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, app_private
AS $$
  SELECT
    members.id,
    members.user_id,
    users.email::text,
    members.role,
    members.person_id,
    members.branch_id
  FROM public.organization_members AS members
  JOIN auth.users AS users
    ON users.id = members.user_id
  WHERE members.organization_id = p_organization_id
    AND app_private.is_org_admin(p_organization_id)
  ORDER BY members.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_organization_access_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_access_members(uuid) TO authenticated;
