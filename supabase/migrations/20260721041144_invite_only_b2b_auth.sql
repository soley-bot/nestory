DROP FUNCTION IF EXISTS public.bootstrap_admin_organization(text, text);
DROP FUNCTION IF EXISTS app_private.bootstrap_admin_organization(text, text);
DROP FUNCTION IF EXISTS public.add_existing_organization_member(uuid, text, text, uuid, uuid);

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can create organization memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update organization memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can delete organization memberships" ON public.organization_members;

REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS organization_branches_id_organization_uidx
  ON public.organization_branches (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS people_id_organization_uidx
  ON public.people (id, organization_id);

CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  branch_id uuid,
  person_id uuid,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  delivery_method text,
  delivery_error text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_email_normalized_check
    CHECK (email = lower(trim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('admin', 'manager', 'member')),
  CONSTRAINT organization_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired', 'send_failed')),
  CONSTRAINT organization_invitations_delivery_method_check
    CHECK (delivery_method IS NULL OR delivery_method IN ('invite', 'magic_link')),
  CONSTRAINT organization_invitations_branch_organization_fk
    FOREIGN KEY (branch_id, organization_id)
    REFERENCES public.organization_branches(id, organization_id),
  CONSTRAINT organization_invitations_person_organization_fk
    FOREIGN KEY (person_id, organization_id)
    REFERENCES public.people(id, organization_id),
  CONSTRAINT organization_invitations_lifecycle_check
    CHECK (
      (status = 'accepted' AND accepted_at IS NOT NULL AND auth_user_id IS NOT NULL)
      OR (status = 'revoked' AND revoked_at IS NOT NULL)
      OR status IN ('pending', 'expired', 'send_failed')
    )
);

CREATE UNIQUE INDEX organization_invitations_active_email_uidx
  ON public.organization_invitations (organization_id, email)
  WHERE status IN ('pending', 'send_failed');
CREATE INDEX organization_invitations_organization_status_idx
  ON public.organization_invitations (organization_id, status, invited_at DESC);
CREATE INDEX organization_invitations_email_idx
  ON public.organization_invitations (email, status);
CREATE INDEX organization_invitations_expiry_idx
  ON public.organization_invitations (expires_at)
  WHERE status IN ('pending', 'send_failed');

CREATE TRIGGER set_organization_invitations_updated_at
BEFORE UPDATE ON public.organization_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read organization invitations"
ON public.organization_invitations
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

REVOKE ALL ON public.organization_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT ALL PRIVILEGES ON public.organization_invitations TO service_role;

CREATE OR REPLACE FUNCTION app_private.request_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

CREATE OR REPLACE FUNCTION app_private.assert_invitation_scope(
  p_organization_id uuid,
  p_branch_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.organization_id = p_organization_id
      AND branch.archived_at IS NULL
      AND branch.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '23503';
  END IF;

  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE person.id = p_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.request_is_service_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.assert_invitation_scope(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

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
    RAISE EXCEPTION 'Company name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;

  IF normalized_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'
    OR normalized_slug IN ('api', 'app', 'www') THEN
    RAISE EXCEPTION 'Workspace slug is invalid or reserved' USING ERRCODE = '22023';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Administrator email is invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizations AS organization
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
    'admin',
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
    jsonb_build_object('email', normalized_email, 'role', 'admin')
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

REVOKE ALL ON FUNCTION public.provision_client_workspace(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_client_workspace(text, text, text) TO service_role;

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
  previous_invitation_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    p_organization_id,
    p_branch_id,
    p_person_id
  );

  SELECT invitation.id
  INTO previous_invitation_id
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.email = normalized_email
    AND invitation.status IN ('pending', 'send_failed')
  FOR UPDATE;

  IF previous_invitation_id IS NOT NULL THEN
    UPDATE public.organization_invitations
    SET
      role = normalized_role,
      branch_id = p_branch_id,
      person_id = p_person_id,
      status = 'pending',
      delivery_error = NULL,
      expires_at = now() + interval '1 hour'
    WHERE id = previous_invitation_id
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
      WHEN previous_invitation_id IS NULL THEN 'organization_invitation_created'
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
    RAISE EXCEPTION 'An active invitation already exists for this email'
      USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_organization_invitation(
  p_invitation_id uuid
)
RETURNS TABLE (invitation_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.organization_invitations%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status NOT IN ('pending', 'send_failed') THEN
    RAISE EXCEPTION 'Invitation cannot be resent' USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'pending', delivery_error = NULL, expires_at = now() + interval '1 hour'
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    target.id,
    'organization_invitation_resend_requested',
    jsonb_build_object('email', target.email)
  );

  RETURN QUERY SELECT target.id, target.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_organization_invitation_sent(
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_delivery_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.organization_invitations%ROWTYPE;
  normalized_method text := lower(trim(coalesce(p_delivery_method, '')));
BEGIN
  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT app_private.request_is_service_role()
    AND ((SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(target.organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_method NOT IN ('invite', 'magic_link') THEN
    RAISE EXCEPTION 'Delivery method is not supported' USING ERRCODE = '22023';
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending' USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_invitations
  SET
    auth_user_id = coalesce(p_auth_user_id, auth_user_id),
    delivery_method = normalized_method,
    delivery_error = NULL,
    last_sent_at = now()
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    target.id,
    'organization_invitation_sent',
    jsonb_build_object('delivery_method', normalized_method)
  );

  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_organization_invitation_delivery_failed(
  p_invitation_id uuid,
  p_error text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.organization_invitations%ROWTYPE;
  safe_error text := left(nullif(trim(coalesce(p_error, '')), ''), 500);
BEGIN
  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT app_private.request_is_service_role()
    AND ((SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(target.organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending' USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'send_failed', delivery_error = safe_error
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    target.id,
    'organization_invitation_delivery_failed',
    jsonb_build_object('error', safe_error)
  );

  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_invitation(
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.organization_invitations%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status NOT IN ('pending', 'send_failed') THEN
    RAISE EXCEPTION 'Invitation cannot be revoked' USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked', revoked_at = now(), delivery_error = NULL
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    target.organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    target.id,
    'organization_invitation_revoked',
    jsonb_build_object('status', target.status),
    jsonb_build_object('status', 'revoked')
  );

  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_invitation_for_acceptance(
  p_invitation_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  organization_name text,
  invited_role text,
  scope_name text,
  staff_name text,
  invitation_status text,
  password_required boolean,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_email text;
  current_user_id uuid := (SELECT auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lower(user_row.email)
  INTO current_email
  FROM auth.users AS user_row
  WHERE user_row.id = current_user_id
    AND user_row.email_confirmed_at IS NOT NULL;

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'Verified email is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    invitation.id,
    organization.name,
    invitation.role,
    coalesce(branch.name, 'All branches'),
    person.display_name,
    CASE
      WHEN invitation.status IN ('pending', 'send_failed') AND invitation.expires_at <= now()
        THEN 'expired'
      ELSE invitation.status
    END,
    invitation.delivery_method = 'invite',
    invitation.expires_at
  FROM public.organization_invitations AS invitation
  JOIN public.organizations AS organization ON organization.id = invitation.organization_id
  LEFT JOIN public.organization_branches AS branch ON branch.id = invitation.branch_id
  LEFT JOIN public.people AS person ON person.id = invitation.person_id
  WHERE invitation.id = p_invitation_id
    AND invitation.email = current_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_email text;
  current_user_id uuid := (SELECT auth.uid());
  membership_id uuid;
  target public.organization_invitations%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lower(user_row.email)
  INTO current_email
  FROM auth.users AS user_row
  WHERE user_row.id = current_user_id
    AND user_row.email_confirmed_at IS NOT NULL;

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'Verified email is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  IF target.email <> current_email THEN
    RAISE EXCEPTION 'Invitation email does not match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  SELECT member.id INTO membership_id
  FROM public.organization_members AS member
  WHERE member.organization_id = target.organization_id
    AND member.user_id = current_user_id
  FOR UPDATE;

  IF target.status = 'accepted' AND target.auth_user_id = current_user_id
    AND membership_id IS NOT NULL THEN
    RETURN membership_id;
  END IF;

  IF target.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  IF target.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '55000';
  END IF;

  IF membership_id IS NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      person_id,
      branch_id
    ) VALUES (
      target.organization_id,
      current_user_id,
      target.role,
      target.person_id,
      target.branch_id
    )
    RETURNING id INTO membership_id;
  END IF;

  UPDATE public.organization_invitations
  SET
    status = 'accepted',
    auth_user_id = current_user_id,
    accepted_at = now(),
    delivery_error = NULL
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    current_user_id,
    'organization_invitation',
    target.id,
    'organization_invitation_accepted',
    jsonb_build_object('membership_id', membership_id, 'role', target.role)
  );

  RETURN membership_id;
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
  admin_count integer;
  normalized_role text := lower(trim(coalesce(p_role, '')));
  target public.organization_members%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_role NOT IN ('admin', 'manager', 'member') THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    p_organization_id,
    p_branch_id,
    p_person_id
  );

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

  IF target.role = 'admin' AND normalized_role <> 'admin' THEN
    SELECT count(*) INTO admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'admin';

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'The final administrator cannot be demoted'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET role = normalized_role, person_id = p_person_id, branch_id = p_branch_id
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization_membership',
    target.id,
    'organization_member_access_updated',
    jsonb_build_object('role', target.role, 'branch_id', target.branch_id, 'person_id', target.person_id),
    jsonb_build_object('role', normalized_role, 'branch_id', p_branch_id, 'person_id', p_person_id)
  );

  RETURN target.id;
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
  admin_count integer;
  target public.organization_members%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
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

  IF target.role = 'admin' THEN
    SELECT count(*) INTO admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'admin';

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'The final administrator cannot be removed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  DELETE FROM public.organization_members WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values
  ) VALUES (
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

REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_organization_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_organization_invitation_delivery_failed(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_invitation_for_acceptance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_organization_member_access(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_organization_invitation_delivery_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_invitation_for_acceptance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_organization_member_access(uuid, uuid) TO authenticated;
