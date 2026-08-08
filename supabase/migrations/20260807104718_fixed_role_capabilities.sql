-- Replace the transitional admin/manager/member labels with the five fixed
-- product roles.  Authorization stays organization-scoped and capability
-- predicates are the shared database boundary for RLS and checked RPCs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE (
      membership.role = 'admin'
      AND (membership.branch_id IS NOT NULL OR membership.person_id IS NOT NULL)
    ) OR (
      membership.role IN ('manager', 'member')
      AND (membership.branch_id IS NULL OR membership.person_id IS NULL)
    )
  ) THEN
    RAISE EXCEPTION
      'Legacy workspace memberships must be scoped before fixed-role migration'
      USING
        ERRCODE = '23514',
        HINT = 'Clear branch/Staff scope for admins and assign both branch and active Staff scope to every manager/member.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE (
      invitation.role = 'admin'
      AND (invitation.branch_id IS NOT NULL OR invitation.person_id IS NOT NULL)
    ) OR (
      invitation.role IN ('manager', 'member')
      AND (invitation.branch_id IS NULL OR invitation.person_id IS NULL)
    )
  ) THEN
    RAISE EXCEPTION
      'Legacy workspace invitations must be scoped before fixed-role migration'
      USING
        ERRCODE = '23514',
        HINT = 'Clear branch/Staff scope for admins and assign both branch and active Staff scope to every manager/member invitation.';
  END IF;
END;
$$;

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_role_check;

UPDATE public.organization_members
SET role = CASE role
  WHEN 'admin' THEN 'super_admin'
  WHEN 'manager' THEN 'operations_manager'
  WHEN 'member' THEN 'operations_member'
  ELSE role
END
WHERE role IN ('admin', 'manager', 'member');

UPDATE public.organization_invitations
SET role = CASE role
  WHEN 'admin' THEN 'super_admin'
  WHEN 'manager' THEN 'operations_manager'
  WHEN 'member' THEN 'operations_member'
  ELSE role
END
WHERE role IN ('admin', 'manager', 'member');

ALTER TABLE public.organization_members
  ALTER COLUMN role SET DEFAULT 'super_admin',
  ADD CONSTRAINT organization_members_role_check
  CHECK (
    role IN (
      'super_admin',
      'finance_manager',
      'finance_member',
      'operations_manager',
      'operations_member'
    )
  );

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_role_check
  CHECK (
    role IN (
      'super_admin',
      'finance_manager',
      'finance_member',
      'operations_manager',
      'operations_member'
    )
  );

CREATE OR REPLACE FUNCTION app_private.current_workspace_role(
  target_organization_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = (SELECT auth.uid())
    AND (
      (
        membership.role IN ('super_admin', 'finance_manager', 'finance_member')
        AND membership.branch_id IS NULL
        AND membership.person_id IS NULL
      )
      OR (
        membership.role IN ('operations_manager', 'operations_member')
        AND membership.branch_id IS NOT NULL
        AND membership.person_id IS NOT NULL
      )
    )
  LIMIT 1;
$$;

-- Keep the previous helper's output stable for the already-deployed
-- maintenance RPCs while new authorization uses named capabilities.
CREATE OR REPLACE FUNCTION app_private.current_org_role(
  target_organization_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE app_private.current_workspace_role(target_organization_id)
    WHEN 'super_admin' THEN 'admin'
    WHEN 'operations_manager' THEN 'manager'
    WHEN 'operations_member' THEN 'member'
    ELSE app_private.current_workspace_role(target_organization_id)
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_member(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.current_workspace_role(target_organization_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app_private.is_super_admin(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_admin(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_super_admin(target_organization_id);
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_access(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_configure_leases(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_finance(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_submit_expense(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_review_expense(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_reverse_expense(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_operations(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'operations_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_execute_operations(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'operations_manager', 'operations_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_assign_tasks(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'operations_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.workspace_role_scope_is_valid(
  p_role text,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_role IN ('super_admin', 'finance_manager', 'finance_member')
      THEN p_branch_id IS NULL AND p_person_id IS NULL
    WHEN p_role IN ('operations_manager', 'operations_member')
      THEN p_branch_id IS NOT NULL AND p_person_id IS NOT NULL
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION app_private.current_workspace_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.current_org_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_manage_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_configure_leases(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_read_finance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_submit_expense(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_review_expense(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_reverse_expense(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_manage_operations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_execute_operations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_assign_tasks(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.workspace_role_scope_is_valid(text, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.current_workspace_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_org_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_manage_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_configure_leases(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_submit_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_review_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_reverse_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_manage_operations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_execute_operations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_assign_tasks(uuid) TO authenticated;

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_scope_check,
  ADD CONSTRAINT organization_members_role_scope_check
  CHECK (app_private.workspace_role_scope_is_valid(role, branch_id, person_id));

ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_role_scope_check,
  ADD CONSTRAINT organization_invitations_role_scope_check
  CHECK (app_private.workspace_role_scope_is_valid(role, branch_id, person_id));

CREATE OR REPLACE FUNCTION public.provision_client_workspace(
  p_name text,
  p_slug text,
  p_admin_email text
)
RETURNS TABLE (
  organization_id uuid,
  invitation_id uuid,
  organization_name text,
  workspace_slug text,
  invited_email text,
  invitation_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  IF EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.slug = normalized_slug
  ) THEN
    RAISE EXCEPTION 'Workspace slug already exists' USING ERRCODE = '23505';
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

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_id uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
  previous_invitation public.organization_invitations%ROWTYPE;
  violated_constraint text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_role NOT IN (
    'super_admin',
    'finance_manager',
    'finance_member',
    'operations_manager',
    'operations_member'
  ) THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.workspace_role_scope_is_valid(
    normalized_role,
    p_branch_id,
    p_person_id
  ) THEN
    IF normalized_role IN ('operations_manager', 'operations_member') THEN
      RAISE EXCEPTION 'Operations roles require branch and Staff scope'
        USING ERRCODE = '22023';
    END IF;

    RAISE EXCEPTION 'Finance roles cannot have branch or Staff scope'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    p_organization_id,
    p_branch_id,
    p_person_id
  );
  PERFORM app_private.lock_staff_workspace_access(
    p_organization_id,
    p_person_id
  );

  UPDATE public.organization_invitations AS invitation
  SET status = 'expired'
  WHERE invitation.organization_id = p_organization_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.expires_at <= now()
    AND (
      invitation.email = normalized_email
      OR (
        p_person_id IS NOT NULL
        AND invitation.person_id = p_person_id
      )
    );

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.person_id = p_person_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.email <> normalized_email
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  SELECT invitation.*
  INTO previous_invitation
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.email = normalized_email
    AND invitation.status IN ('pending', 'send_failed')
  FOR UPDATE;

  IF previous_invitation.id IS NOT NULL THEN
    IF previous_invitation.person_id IS DISTINCT FROM p_person_id THEN
      RAISE EXCEPTION 'An active invitation already exists for this email'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.organization_invitations
    SET
      role = normalized_role,
      branch_id = p_branch_id,
      person_id = p_person_id,
      status = 'pending',
      delivery_error = NULL,
      expires_at = now() + interval '1 hour'
    WHERE id = previous_invitation.id
    RETURNING id INTO invitation_id;
  ELSE
    INSERT INTO public.organization_invitations (
      organization_id,
      email,
      role,
      branch_id,
      person_id,
      status,
      invited_by,
      invited_at,
      expires_at
    )
    VALUES (
      p_organization_id,
      normalized_email,
      normalized_role,
      p_branch_id,
      p_person_id,
      'pending',
      (SELECT auth.uid()),
      now(),
      now() + interval '1 hour'
    )
    RETURNING id INTO invitation_id;
  END IF;

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
    'organization_invitation',
    invitation_id,
    CASE
      WHEN previous_invitation.id IS NULL THEN 'organization_invitation_created'
      ELSE 'organization_invitation_refreshed'
    END,
    jsonb_build_object(
      'email', normalized_email,
      'role', normalized_role,
      'branch_id', p_branch_id,
      'person_id', p_person_id
    )
  );

  RETURN invitation_id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_invitations_live_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has an active invitation'
        USING ERRCODE = '23505';
    END IF;

    IF violated_constraint = 'organization_invitations_active_email_uidx' THEN
      RAISE EXCEPTION 'An active invitation already exists for this email'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  super_admin_count integer;
  normalized_role text := lower(trim(coalesce(p_role, '')));
  target public.organization_members%ROWTYPE;
  violated_constraint text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_role NOT IN (
    'super_admin',
    'finance_manager',
    'finance_member',
    'operations_manager',
    'operations_member'
  ) THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.workspace_role_scope_is_valid(
    normalized_role,
    p_branch_id,
    p_person_id
  ) THEN
    IF normalized_role IN ('operations_manager', 'operations_member') THEN
      RAISE EXCEPTION 'Operations roles require branch and Staff scope'
        USING ERRCODE = '22023';
    END IF;

    RAISE EXCEPTION 'Finance roles cannot have branch or Staff scope'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    p_organization_id,
    p_branch_id,
    p_person_id
  );
  PERFORM app_private.lock_staff_workspace_access(
    p_organization_id,
    p_person_id
  );

  UPDATE public.organization_invitations AS invitation
  SET status = 'expired'
  WHERE p_person_id IS NOT NULL
    AND invitation.organization_id = p_organization_id
    AND invitation.person_id = p_person_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.expires_at <= now();

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT * INTO target
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.person_id = p_person_id
      AND member.id <> target.id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.person_id = p_person_id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  IF target.role = 'super_admin' AND normalized_role <> 'super_admin' THEN
    SELECT count(*) INTO super_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'super_admin';

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final Super Admin cannot be demoted'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET role = normalized_role, person_id = p_person_id, branch_id = p_branch_id
  WHERE id = target.id;

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
    'organization_membership',
    target.id,
    'organization_member_access_updated',
    jsonb_build_object(
      'role', target.role,
      'branch_id', target.branch_id,
      'person_id', target.person_id
    ),
    jsonb_build_object(
      'role', normalized_role,
      'branch_id', p_branch_id,
      'person_id', p_person_id
    )
  );

  RETURN target.id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_members_org_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_member_access(
  p_organization_id uuid,
  p_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  super_admin_count integer;
  target public.organization_members%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT * INTO target
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF target.role = 'super_admin' THEN
    SELECT count(*) INTO super_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'super_admin';

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final Super Admin cannot be removed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  DELETE FROM public.organization_members
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization_membership',
    target.id,
    'organization_member_access_removed',
    jsonb_build_object(
      'user_id', target.user_id,
      'role', target.role,
      'branch_id', target.branch_id,
      'person_id', target.person_id
    )
  );

  RETURN target.id;
END;
$$;

-- Existing maintenance RPCs consume compatibility role labels.  Their member
-- identity lookup must still point at the new stored role.
CREATE OR REPLACE FUNCTION app_private.has_maintenance_member_identity(
  p_organization_id uuid,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_person_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.role = 'operations_member'
        AND membership.person_id = p_person_id
        AND membership.branch_id IS NOT DISTINCT FROM p_branch_id
    );
$$;

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

  IF actor_role = 'manager' AND actor_branch_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT membership.person_id, membership.branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'operations_member'
    AND membership.person_id IS NOT NULL
    AND (
      actor_role = 'admin'
      OR membership.branch_id IS NOT DISTINCT FROM actor_branch_id
    )
  ORDER BY membership.branch_id NULLS FIRST, membership.person_id;
END;
$$;

-- The maintenance workflow predates fixed workspace roles. Its checked RPCs
-- read organization_members directly and therefore cannot rely on the
-- current_org_role compatibility helper. Recreate only those known functions
-- with the fixed stored-role labels while preserving their established
-- validation and workflow behavior.
DO $$
DECLARE
  target_function record;
  original_definition text;
  updated_definition text;
BEGIN
  FOR target_function IN
    SELECT procedure.oid, namespace.nspname, procedure.proname
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE (
      namespace.nspname = 'app_private'
      AND procedure.proname IN (
        'assign_maintenance_task_legacy_checked',
        'create_maintenance_task_legacy_checked',
        'update_maintenance_task_legacy_checked'
      )
    ) OR (
      namespace.nspname = 'public'
      AND procedure.proname IN (
        'execute_assigned_maintenance_task',
        'execute_coordinated_maintenance_task',
        'review_maintenance_task_completion'
      )
    )
  LOOP
    -- pg_get_functiondef preserves the server's line endings. Normalize them
    -- before applying the deliberately narrow compatibility rewrite so this
    -- migration behaves the same on Windows and Linux reset environments.
    original_definition := replace(
      pg_get_functiondef(target_function.oid),
      E'\r\n',
      E'\n'
    );
    updated_definition := replace(
      replace(
        replace(
          replace(
            replace(original_definition,
              'actor_role NOT IN (''admin'', ''manager'')',
              'actor_role NOT IN (''super_admin'', ''operations_manager'')'
            ),
            'actor_role = ''manager''',
            'actor_role = ''operations_manager'''
          ),
          'actor_role = ''admin''',
          'actor_role = ''super_admin'''
        ),
        'actor_role <> ''member''',
        'actor_role <> ''operations_member'''
      ),
      'assignee_membership.role = ''member''',
      'assignee_membership.role = ''operations_member'''
    );

    IF target_function.proname = 'execute_assigned_maintenance_task' THEN
      updated_definition := replace(
        updated_definition,
        'actor_role <> ''operations_member'' OR actor_role IS NULL OR actor_person_id IS NULL',
        'actor_role <> ''operations_member'' OR actor_role IS NULL OR actor_person_id IS NULL OR actor_branch_id IS NULL'
      );

      IF position('actor_branch_id IS NULL' IN updated_definition) = 0 THEN
        RAISE EXCEPTION
          'Fixed-role maintenance member scope did not fail closed for %.%',
          target_function.nspname,
          target_function.proname;
      END IF;
    ELSE
      updated_definition := replace(
        updated_definition,
        '  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN
    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';
  END IF;',
        '  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN
    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';
  END IF;

  IF actor_role = ''operations_manager'' AND actor_branch_id IS NULL THEN
    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';
  END IF;'
      );

      IF position(
        'actor_role = ''operations_manager'' AND actor_branch_id IS NULL'
        IN updated_definition
      ) = 0 THEN
        RAISE EXCEPTION
          'Fixed-role maintenance manager scope did not fail closed for %.%',
          target_function.nspname,
          target_function.proname;
      END IF;
    END IF;

    IF updated_definition = original_definition THEN
      RAISE EXCEPTION
        'Fixed-role maintenance compatibility did not update %.%',
        target_function.nspname,
        target_function.proname;
    END IF;

    EXECUTE updated_definition;
  END LOOP;
END;
$$;

-- Invitation acceptance can update an existing membership. Keep the final
-- Super Admin invariant aligned with the new stored role.
DO $$
DECLARE
  function_oid oid := to_regprocedure(
    'public.accept_organization_invitation(uuid)'
  );
  original_definition text;
  updated_definition text;
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'Invitation acceptance function is missing';
  END IF;

  original_definition := replace(
    pg_get_functiondef(function_oid),
    E'\r\n',
    E'\n'
  );
  updated_definition := replace(
    replace(
      replace(
        replace(original_definition,
          'existing_membership.role = ''admin''',
          'existing_membership.role = ''super_admin'''
        ),
        'target.role <> ''admin''',
        'target.role <> ''super_admin'''
      ),
      'member.role = ''admin''',
      'member.role = ''super_admin'''
    ),
    'The final administrator cannot be demoted',
    'The final Super Admin cannot be demoted'
  );

  IF updated_definition = original_definition THEN
    RAISE EXCEPTION 'Fixed-role invitation acceptance compatibility did not update';
  END IF;

  EXECUTE updated_definition;
END;
$$;

DROP POLICY IF EXISTS "Maintenance roles can read scoped tasks"
ON public.tasks;
CREATE POLICY "Maintenance roles can read scoped tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = tasks.organization_id
      AND membership.user_id = (SELECT auth.uid())
      AND (
        (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT DISTINCT FROM tasks.branch_id
        )
        OR (
          membership.role = 'operations_member'
          AND membership.person_id = tasks.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM tasks.branch_id
        )
      )
  )
);

DROP POLICY IF EXISTS "Maintenance roles can read scoped task requests"
ON public.tenant_requests;
CREATE POLICY "Maintenance roles can read scoped task requests"
ON public.tenant_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks AS scoped_task
    JOIN public.organization_members AS membership
      ON membership.organization_id = scoped_task.organization_id
     AND membership.user_id = (SELECT auth.uid())
    WHERE scoped_task.organization_id = tenant_requests.organization_id
      AND scoped_task.tenant_request_id = tenant_requests.id
      AND scoped_task.archived_at IS NULL
      AND (
        (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
        OR (
          membership.role = 'operations_member'
          AND membership.person_id = scoped_task.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
      )
  )
);

DROP POLICY IF EXISTS "Maintenance roles can read scoped task activity logs"
ON public.activity_logs;
CREATE POLICY "Maintenance roles can read scoped task activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  activity_logs.entity_type = 'task'
  AND EXISTS (
    SELECT 1
    FROM public.tasks AS scoped_task
    JOIN public.organization_members AS membership
      ON membership.organization_id = scoped_task.organization_id
     AND membership.user_id = (SELECT auth.uid())
    WHERE scoped_task.organization_id = activity_logs.organization_id
      AND scoped_task.id = activity_logs.entity_id
      AND (
        (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
        OR (
          membership.role = 'operations_member'
          AND membership.person_id = scoped_task.assignee_person_id
          AND membership.branch_id IS NOT DISTINCT FROM scoped_task.branch_id
        )
      )
  )
);

REVOKE ALL ON FUNCTION public.provision_client_workspace(text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_client_workspace(text, text, text)
TO service_role;

REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_organization_member_access(uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_maintenance_execution_members(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_maintenance_member_identity(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_organization_member_access(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_execution_members(uuid)
TO authenticated;

-- Finance data is visible only to Super Admin and Finance roles.  Direct
-- authenticated writes stay behind checked RPCs.
DO $$
DECLARE
  finance_table text;
  existing_policy record;
  finance_tables constant text[] := ARRAY[
    'accounting_accounts',
    'accounting_books',
    'accounting_journal_entries',
    'accounting_journal_lines',
    'accounting_periods',
    'finance_expense_items',
    'finance_income_items',
    'finance_payment_allocations',
    'finance_payments',
    'finance_receipt_allocation_journals',
    'finance_receipt_allocations',
    'finance_receipts',
    'financial_reconciliation_sources',
    'ips_expense_responsibilities',
    'ledger_entries',
    'ledger_period_locks',
    'lease_billing_terms',
    'lease_deposit_events',
    'lease_deposits',
    'lease_occupancies',
    'lease_parties',
    'lease_terms',
    'management_fee_occurrences',
    'owner_charge_cash_allocations',
    'owner_collection_confirmation_allocations',
    'owner_collection_confirmations',
    'owner_invoice_lines',
    'owner_invoices',
    'owner_payment_allocations',
    'owner_payments',
    'petty_cash_accounts',
    'petty_cash_entries',
    'petty_cash_periods',
    'property_close_revisions',
    'property_reporting_periods',
    'property_withdrawals',
    'rent_policy_versions',
    'tenant_invoice_lines',
    'tenant_invoice_payment_allocations',
    'tenant_invoice_payments',
    'tenant_invoices'
  ];
BEGIN
  FOREACH finance_table IN ARRAY finance_tables LOOP
    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = finance_table
        AND cmd = 'SELECT'
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON public.%I',
        existing_policy.policyname,
        finance_table
      );
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT app_private.can_read_finance(organization_id)))',
      'Finance roles can read records',
      finance_table
    );
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      finance_table
    );
    EXECUTE format(
      'GRANT SELECT ON TABLE public.%I TO authenticated',
      finance_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  function_signature regprocedure;
  original_definition text;
  updated_definition text;
  guarded_functions constant regprocedure[] := ARRAY[
    'public.resolve_authoritative_lease_term(uuid,uuid,date)'::regprocedure,
    'public.resolve_lease_billing_term(uuid,uuid,date)'::regprocedure
  ];
BEGIN
  FOREACH function_signature IN ARRAY guarded_functions LOOP
    SELECT pg_get_functiondef(function_signature)
    INTO original_definition;

    updated_definition := replace(
      original_definition,
      'app_private.is_org_member(p_organization_id)',
      'app_private.can_read_finance(p_organization_id)'
    );

    IF updated_definition = original_definition THEN
      RAISE EXCEPTION
        'Finance-only lease resolver compatibility did not update: %',
        function_signature;
    END IF;

    EXECUTE updated_definition;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Finance roles can read lease context" ON public.leases;
CREATE POLICY "Finance roles can read lease context"
ON public.leases
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));
GRANT SELECT ON TABLE public.leases TO authenticated;

DROP POLICY IF EXISTS "Finance roles can read owner context" ON public.property_owners;
CREATE POLICY "Finance roles can read owner context"
ON public.property_owners
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));
GRANT SELECT ON TABLE public.property_owners TO authenticated;
