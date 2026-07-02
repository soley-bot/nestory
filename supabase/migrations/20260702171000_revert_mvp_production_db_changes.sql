DROP FUNCTION IF EXISTS public.get_organization_access_members(uuid, uuid);

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

DROP FUNCTION IF EXISTS public.add_existing_organization_member(uuid, text, text, uuid, uuid, uuid);

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

DROP FUNCTION IF EXISTS app_private.is_org_admin_for_user(uuid, uuid);

DROP POLICY IF EXISTS "Members can create scoped activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can read scoped activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can create activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Managers can create task activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can read activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can read task activity logs" ON public.activity_logs;
CREATE POLICY "Admins can read activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can create activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Members can read task activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  app_private.is_org_member(organization_id)
  AND entity_type = 'task'
);
CREATE POLICY "Managers can create task activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.can_assign_tasks(organization_id)
  AND entity_type IN ('task', 'tenant_request', 'organization_branch')
);

DROP POLICY IF EXISTS "Admins can create branches" ON public.organization_branches;
DROP POLICY IF EXISTS "Admins can update branches" ON public.organization_branches;
DROP POLICY IF EXISTS "Admins can delete branches" ON public.organization_branches;
DROP POLICY IF EXISTS "Admins can manage branches" ON public.organization_branches;
CREATE POLICY "Admins can manage branches"
ON public.organization_branches
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can read organization memberships" ON public.organization_members;
CREATE POLICY "Admins can read organization memberships"
ON public.organization_members
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can create teams" ON public.organization_teams;
DROP POLICY IF EXISTS "Admins can update teams" ON public.organization_teams;
DROP POLICY IF EXISTS "Admins can delete teams" ON public.organization_teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON public.organization_teams;
CREATE POLICY "Admins can manage teams"
ON public.organization_teams
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can read organizations" ON public.organizations;
CREATE POLICY "Admins can read organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(id));

DROP POLICY IF EXISTS "Admins can create people" ON public.people;
DROP POLICY IF EXISTS "Admins can update people" ON public.people;
DROP POLICY IF EXISTS "Admins can delete people" ON public.people;
DROP POLICY IF EXISTS "Admins can manage people" ON public.people;
CREATE POLICY "Admins can manage people"
ON public.people
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can create person roles" ON public.person_roles;
DROP POLICY IF EXISTS "Admins can update person roles" ON public.person_roles;
DROP POLICY IF EXISTS "Admins can delete person roles" ON public.person_roles;
DROP POLICY IF EXISTS "Admins can manage person roles" ON public.person_roles;
CREATE POLICY "Admins can manage person roles"
ON public.person_roles
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can create properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can update properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can delete properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can manage properties" ON public.properties;
CREATE POLICY "Admins can manage properties"
ON public.properties
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Members can read scoped tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Managers can read branch tasks and members read assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins can manage tasks" ON public.tasks;
CREATE POLICY "Admins can manage tasks"
ON public.tasks
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Managers can read branch tasks and members read assigned tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  app_private.current_org_role(organization_id) = 'manager'
  AND (
    app_private.current_org_branch_id(organization_id) IS NULL
    OR branch_id = app_private.current_org_branch_id(organization_id)
  )
  OR app_private.current_org_role(organization_id) = 'member'
  AND assignee_person_id = app_private.current_org_person_id(organization_id)
);

DROP POLICY IF EXISTS "Admins can delete tenant requests" ON public.tenant_requests;
DROP POLICY IF EXISTS "Admins can manage tenant requests" ON public.tenant_requests;
CREATE POLICY "Admins can manage tenant requests"
ON public.tenant_requests
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can create units" ON public.units;
DROP POLICY IF EXISTS "Admins can update units" ON public.units;
DROP POLICY IF EXISTS "Admins can delete units" ON public.units;
DROP POLICY IF EXISTS "Admins can manage units" ON public.units;
CREATE POLICY "Admins can manage units"
ON public.units
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
