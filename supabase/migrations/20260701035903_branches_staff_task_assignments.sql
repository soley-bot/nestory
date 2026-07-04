-- Branches + staff task ownership.
-- ponytail: one assignee per task; add task_assignments only when one task needs
-- multiple active assignees or reassignment history.

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('admin', 'manager', 'member'));

CREATE TABLE public.organization_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  address text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_branches_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT organization_branches_org_code_key UNIQUE (organization_id, code),
  CONSTRAINT organization_branches_name_not_blank_check CHECK (length(trim(name)) > 0),
  CONSTRAINT organization_branches_code_not_blank_check CHECK (length(trim(code)) > 0),
  CONSTRAINT organization_branches_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE public.organization_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid,
  name text NOT NULL,
  manager_person_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_teams_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT organization_teams_org_name_key UNIQUE (organization_id, name),
  CONSTRAINT organization_teams_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.organization_branches(organization_id, id)
    ON DELETE SET NULL,
  CONSTRAINT organization_teams_manager_person_fk
    FOREIGN KEY (organization_id, manager_person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE SET NULL,
  CONSTRAINT organization_teams_name_not_blank_check CHECK (length(trim(name)) > 0)
);

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_person_fk
  FOREIGN KEY (organization_id, person_id)
  REFERENCES public.people(organization_id, id)
  ON DELETE SET NULL;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_branch_fk
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id)
  ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS assignee_person_id uuid;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_branch_fk
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id)
  ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assignee_person_fk
  FOREIGN KEY (organization_id, assignee_person_id)
  REFERENCES public.people(organization_id, id)
  ON DELETE SET NULL;

DROP TRIGGER IF EXISTS set_organization_branches_updated_at
ON public.organization_branches;
CREATE TRIGGER set_organization_branches_updated_at
BEFORE UPDATE ON public.organization_branches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_organization_teams_updated_at
ON public.organization_teams;
CREATE TRIGGER set_organization_teams_updated_at
BEFORE UPDATE ON public.organization_teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_teams ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.current_org_role(target_organization_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.current_org_person_id(target_organization_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_id
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.current_org_branch_id(target_organization_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.current_org_role(target_organization_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app_private.can_assign_tasks(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.current_org_role(target_organization_id) IN ('admin', 'manager');
$$;

REVOKE ALL ON FUNCTION app_private.current_org_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.current_org_person_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.current_org_branch_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_assign_tasks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_org_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_org_person_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_org_branch_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_assign_tasks(uuid) TO authenticated;

CREATE POLICY "Members can read organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (app_private.is_org_member(id));

CREATE POLICY "Members can read organization memberships"
ON public.organization_members
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Admins can manage branches"
ON public.organization_branches
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Members can read branches"
ON public.organization_branches
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Admins can manage teams"
ON public.organization_teams
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Members can read teams"
ON public.organization_teams
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Members can read properties"
ON public.properties
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Members can read units"
ON public.units
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Members can read people"
ON public.people
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

CREATE POLICY "Members can read person roles"
ON public.person_roles
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id));

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

CREATE POLICY "Managers can read task requests"
ON public.tenant_requests
FOR SELECT
TO authenticated
USING (app_private.can_assign_tasks(organization_id));

CREATE POLICY "Managers can create task requests"
ON public.tenant_requests
FOR INSERT
TO authenticated
WITH CHECK (app_private.can_assign_tasks(organization_id));

CREATE POLICY "Managers can update task requests"
ON public.tenant_requests
FOR UPDATE
TO authenticated
USING (app_private.can_assign_tasks(organization_id))
WITH CHECK (app_private.can_assign_tasks(organization_id));

CREATE POLICY "Managers can create branch tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.can_assign_tasks(organization_id)
  AND (
    app_private.current_org_branch_id(organization_id) IS NULL
    OR branch_id IS NULL
    OR branch_id = app_private.current_org_branch_id(organization_id)
  )
);

CREATE POLICY "Managers can update branch tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  app_private.can_assign_tasks(organization_id)
  AND (
    app_private.current_org_branch_id(organization_id) IS NULL
    OR branch_id IS NULL
    OR branch_id = app_private.current_org_branch_id(organization_id)
  )
)
WITH CHECK (
  app_private.can_assign_tasks(organization_id)
  AND (
    app_private.current_org_branch_id(organization_id) IS NULL
    OR branch_id IS NULL
    OR branch_id = app_private.current_org_branch_id(organization_id)
  )
);

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

REVOKE ALL ON public.organization_branches, public.organization_teams FROM anon;
REVOKE ALL ON public.organization_branches, public.organization_teams FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_branches, public.organization_teams TO authenticated;
GRANT ALL PRIVILEGES ON public.organization_branches, public.organization_teams TO service_role;

CREATE INDEX organization_members_org_role_idx
  ON public.organization_members (organization_id, role);
CREATE INDEX organization_members_org_person_id_idx
  ON public.organization_members (organization_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE INDEX organization_members_org_branch_id_idx
  ON public.organization_members (organization_id, branch_id)
  WHERE branch_id IS NOT NULL;
CREATE INDEX organization_branches_org_status_name_idx
  ON public.organization_branches (organization_id, status, name)
  WHERE archived_at IS NULL;
CREATE INDEX organization_teams_org_branch_name_idx
  ON public.organization_teams (organization_id, branch_id, name)
  WHERE archived_at IS NULL;
CREATE INDEX tasks_org_branch_status_due_idx
  ON public.tasks (organization_id, branch_id, status, due_date)
  WHERE branch_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX tasks_org_assignee_status_due_idx
  ON public.tasks (organization_id, assignee_person_id, status, due_date)
  WHERE assignee_person_id IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.assign_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_branch_id uuid,
  p_assignee_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_task public.tasks%ROWTYPE;
  new_task public.tasks%ROWTYPE;
  actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_assign_tasks(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF app_private.current_org_role(p_organization_id) = 'manager'
    AND actor_branch_id IS NOT NULL
    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN
    RAISE EXCEPTION 'Manager can only assign tasks in their branch'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches
    WHERE id = p_branch_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_assignee_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people people
    JOIN public.person_roles roles
      ON roles.organization_id = people.organization_id
     AND roles.person_id = people.id
     AND roles.role = 'staff'
     AND roles.status = 'active'
     AND roles.archived_at IS NULL
    WHERE people.id = p_assignee_person_id
      AND people.organization_id = p_organization_id
      AND people.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.tasks
  SET
    branch_id = p_branch_id,
    assignee_person_id = p_assignee_person_id,
    updated_by = (SELECT auth.uid())
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_task;

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
    'task',
    p_task_id,
    'maintenance_task_assigned',
    jsonb_build_object(
      'branch_id', old_task.branch_id,
      'assignee_person_id', old_task.assignee_person_id
    ),
    jsonb_build_object(
      'branch_id', new_task.branch_id,
      'assignee_person_id', new_task.assignee_person_id
    )
  );

  RETURN p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_maintenance_task(uuid, uuid, uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_organization_branch(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_branch_id uuid;
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_address text := NULLIF(trim(coalesce(p_address, '')), '');
BEGIN
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_name) < 2 OR length(normalized_code) < 2 THEN
    RAISE EXCEPTION 'Branch name and code are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_branches (
    organization_id,
    name,
    code,
    address,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    normalized_name,
    normalized_code,
    normalized_address,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_branch_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization_branch',
    new_branch_id,
    'created',
    jsonb_build_object('name', normalized_name, 'code', normalized_code)
  );

  RETURN new_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_team(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_manager_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_team_id uuid;
  normalized_name text := trim(coalesce(p_name, ''));
BEGIN
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_name) < 2 THEN
    RAISE EXCEPTION 'Team name is required' USING ERRCODE = '22023';
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

  IF p_manager_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = p_manager_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Manager person not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.organization_teams (
    organization_id,
    branch_id,
    name,
    manager_person_id,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_branch_id,
    normalized_name,
    p_manager_person_id,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_team_id;

  RETURN new_team_id;
END;
$$;

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

  UPDATE public.organization_members
  SET
    role = normalized_role,
    person_id = p_person_id,
    branch_id = p_branch_id
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  RETURN p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_branch(uuid, text, text, text)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_team(uuid, uuid, text, uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_branch(uuid, text, text, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_team(uuid, uuid, text, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
TO authenticated;
