-- Staff records remain operational identities in people/person_roles. These
-- constraints only make their optional workspace-access links unambiguous.

-- A pending row can be effectively expired before its materialized status is
-- updated. Normalize those rows before adding the live-invitation constraint so
-- historical invitations are retained without blocking a replacement.
UPDATE public.organization_invitations
SET status = 'expired'
WHERE status IN ('pending', 'send_failed')
  AND expires_at <= now();

CREATE OR REPLACE FUNCTION app_private.assert_staff_workspace_access_uniqueness()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE person_id IS NOT NULL
    GROUP BY organization_id, person_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce Staff access uniqueness: duplicate linked memberships exist'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations
    WHERE person_id IS NOT NULL
      AND status IN ('pending', 'send_failed')
    GROUP BY organization_id, person_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce Staff access uniqueness: duplicate live Staff invitations exist'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    JOIN public.organization_invitations AS invitation
      ON invitation.organization_id = member.organization_id
     AND invitation.person_id = member.person_id
    WHERE member.person_id IS NOT NULL
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce Staff access uniqueness: linked memberships overlap live Staff invitations'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

SELECT app_private.assert_staff_workspace_access_uniqueness();

REVOKE ALL ON FUNCTION app_private.assert_staff_workspace_access_uniqueness()
FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX organization_members_org_person_uidx
  ON public.organization_members (organization_id, person_id)
  WHERE person_id IS NOT NULL;

CREATE UNIQUE INDEX organization_invitations_live_person_uidx
  ON public.organization_invitations (organization_id, person_id)
  WHERE person_id IS NOT NULL
    AND status IN ('pending', 'send_failed');

CREATE OR REPLACE FUNCTION app_private.lock_staff_workspace_access(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_person_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'nestory_staff_workspace_access:'
          || p_organization_id::text
          || ':'
          || p_person_id::text,
        0
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.lock_staff_workspace_access(uuid, uuid)
FROM PUBLIC, anon, authenticated;

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
  violated_constraint text;
BEGIN
  SELECT invitation.* INTO target
  FROM public.organization_invitations AS invitation
  WHERE invitation.id = p_invitation_id;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.lock_staff_workspace_access(
    target.organization_id,
    target.person_id
  );

  SELECT invitation.* INTO target
  FROM public.organization_invitations AS invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status NOT IN ('pending', 'send_failed', 'expired') THEN
    RAISE EXCEPTION 'Invitation cannot be resent' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    target.organization_id,
    target.branch_id,
    target.person_id
  );

  IF target.person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = target.organization_id
      AND member.person_id = target.person_id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF target.person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = target.organization_id
      AND invitation.person_id = target.person_id
      AND invitation.id <> target.id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = target.organization_id
      AND invitation.email = target.email
      AND invitation.id <> target.id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.organization_invitations
  SET
    status = 'pending',
    delivery_error = NULL,
    expires_at = now() + interval '1 hour'
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
  SELECT invitation.* INTO target
  FROM public.organization_invitations AS invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status NOT IN ('pending', 'send_failed', 'expired') THEN
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

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_count integer;
  current_email text;
  current_user_id uuid := (SELECT auth.uid());
  existing_membership public.organization_members%ROWTYPE;
  invitation_is_already_accepted boolean;
  linked_person_member_id uuid;
  membership_id uuid;
  target public.organization_invitations%ROWTYPE;
  violated_constraint text;
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
  WHERE id = p_invitation_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.lock_staff_workspace_access(
    target.organization_id,
    target.person_id
  );

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

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = target.organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT member.* INTO existing_membership
  FROM public.organization_members AS member
  WHERE member.organization_id = target.organization_id
    AND member.user_id = current_user_id;
  membership_id := existing_membership.id;

  invitation_is_already_accepted :=
    target.status = 'accepted'
    AND target.auth_user_id = current_user_id
    AND membership_id IS NOT NULL;

  IF invitation_is_already_accepted THEN
    RETURN membership_id;
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  IF target.status = 'pending' AND target.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    target.organization_id,
    target.branch_id,
    target.person_id
  );

  IF membership_id IS NOT NULL
    AND target.person_id IS NOT NULL
    AND existing_membership.person_id IS NOT NULL
    AND existing_membership.person_id <> target.person_id THEN
    RAISE EXCEPTION 'This account is linked to a different staff member'
      USING ERRCODE = '23505';
  END IF;

  IF target.person_id IS NOT NULL THEN
    SELECT member.id INTO linked_person_member_id
    FROM public.organization_members AS member
    WHERE member.organization_id = target.organization_id
      AND member.person_id = target.person_id
      AND member.id IS DISTINCT FROM membership_id;

    IF linked_person_member_id IS NOT NULL THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF membership_id IS NOT NULL THEN
    IF existing_membership.role = 'admin' AND target.role <> 'admin' THEN
      SELECT count(*) INTO admin_count
      FROM public.organization_members AS member
      WHERE member.organization_id = target.organization_id
        AND member.role = 'admin';

      IF admin_count <= 1 THEN
        RAISE EXCEPTION 'The final administrator cannot be demoted'
          USING ERRCODE = '55000';
      END IF;
    END IF;

    UPDATE public.organization_members
    SET
      role = target.role,
      person_id = coalesce(target.person_id, existing_membership.person_id),
      branch_id = target.branch_id
    WHERE id = membership_id;
  ELSE
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

    IF violated_constraint = 'organization_members_organization_id_user_id_key' THEN
      RAISE EXCEPTION 'This account already has workspace access'
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
  admin_count integer;
  normalized_role text := lower(trim(coalesce(p_role, '')));
  target public.organization_members%ROWTYPE;
  violated_constraint text;
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

REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_organization_invitation(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_organization_invitation(uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(uuid, uuid, text, uuid, uuid)
TO authenticated;
