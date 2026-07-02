DROP POLICY IF EXISTS "Admins can create activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Managers can create task activity logs" ON public.activity_logs;
CREATE POLICY "Members can create scoped activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.is_org_admin(organization_id)
  OR (
    app_private.can_assign_tasks(organization_id)
    AND entity_type = ANY (ARRAY['task'::text, 'tenant_request'::text, 'organization_branch'::text])
  )
);

DROP POLICY IF EXISTS "Admins can read activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can read task activity logs" ON public.activity_logs;
CREATE POLICY "Members can read scoped activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  app_private.is_org_admin(organization_id)
  OR (
    app_private.is_org_member(organization_id)
    AND entity_type = 'task'::text
  )
);

DROP POLICY IF EXISTS "Admins can manage branches" ON public.organization_branches;
CREATE POLICY "Admins can create branches"
ON public.organization_branches
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update branches"
ON public.organization_branches
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete branches"
ON public.organization_branches
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can read organization memberships" ON public.organization_members;

DROP POLICY IF EXISTS "Admins can manage teams" ON public.organization_teams;
CREATE POLICY "Admins can create teams"
ON public.organization_teams
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update teams"
ON public.organization_teams
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete teams"
ON public.organization_teams
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can read organizations" ON public.organizations;

DROP POLICY IF EXISTS "Admins can manage people" ON public.people;
CREATE POLICY "Admins can create people"
ON public.people
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update people"
ON public.people
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete people"
ON public.people
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage person roles" ON public.person_roles;
CREATE POLICY "Admins can create person roles"
ON public.person_roles
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update person roles"
ON public.person_roles
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete person roles"
ON public.person_roles
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage properties" ON public.properties;
CREATE POLICY "Admins can create properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "Managers can read branch tasks and members read assigned tasks" ON public.tasks;
CREATE POLICY "Members can read scoped tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  app_private.is_org_admin(organization_id)
  OR (
    app_private.current_org_role(organization_id) = 'manager'::text
    AND (
      app_private.current_org_branch_id(organization_id) IS NULL
      OR branch_id = app_private.current_org_branch_id(organization_id)
    )
  )
  OR (
    app_private.current_org_role(organization_id) = 'member'::text
    AND assignee_person_id = app_private.current_org_person_id(organization_id)
  )
);
CREATE POLICY "Admins can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage tenant requests" ON public.tenant_requests;
CREATE POLICY "Admins can delete tenant requests"
ON public.tenant_requests
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage units" ON public.units;
CREATE POLICY "Admins can create units"
ON public.units
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update units"
ON public.units
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete units"
ON public.units
FOR DELETE
TO authenticated
USING (app_private.is_org_admin(organization_id));
