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
  current_encrypted_password text;
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

  SELECT
    lower(user_row.email),
    user_row.encrypted_password
  INTO
    current_email,
    current_encrypted_password
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

  IF coalesce(current_encrypted_password, '') = '' THEN
    RAISE EXCEPTION 'Password setup is required' USING ERRCODE = '55000';
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

REVOKE ALL ON FUNCTION public.accept_organization_invitation(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(uuid)
TO authenticated;
