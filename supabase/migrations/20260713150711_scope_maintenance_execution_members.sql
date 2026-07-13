CREATE OR REPLACE FUNCTION public.get_maintenance_execution_members(
  p_organization_id uuid
)
RETURNS TABLE (
  person_id uuid,
  branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
  actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT membership.person_id, membership.branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'member'
    AND membership.person_id IS NOT NULL
    AND (
      actor_role = 'admin'
      OR actor_branch_id IS NULL
      OR membership.branch_id IS NOT DISTINCT FROM actor_branch_id
    )
  ORDER BY membership.branch_id NULLS FIRST, membership.person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_execution_members(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_execution_members(uuid)
  TO authenticated;
