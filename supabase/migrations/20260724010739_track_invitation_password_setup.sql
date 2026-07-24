CREATE TABLE app_private.invitation_password_challenges (
  invitation_id uuid PRIMARY KEY
    REFERENCES public.organization_invitations(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  password_hash_fingerprint bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_private.invitation_password_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.invitation_password_challenges
FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO app_private.invitation_password_challenges (
  invitation_id,
  auth_user_id,
  password_hash_fingerprint
)
SELECT
  invitation.id,
  invitation.auth_user_id,
  extensions.digest(user_row.encrypted_password, 'sha256')
FROM public.organization_invitations AS invitation
JOIN auth.users AS user_row ON user_row.id = invitation.auth_user_id
WHERE invitation.status IN ('pending', 'send_failed')
  AND invitation.delivery_method = 'invite'
  AND invitation.auth_user_id IS NOT NULL
  AND coalesce(user_row.encrypted_password, '') <> ''
ON CONFLICT (invitation_id) DO NOTHING;

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
  invite_password_fingerprint bytea;
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

  IF normalized_method = 'invite' THEN
    SELECT extensions.digest(user_row.encrypted_password, 'sha256')
    INTO invite_password_fingerprint
    FROM auth.users AS user_row
    WHERE user_row.id = p_auth_user_id
      AND lower(user_row.email) = target.email
      AND coalesce(user_row.encrypted_password, '') <> '';

    IF invite_password_fingerprint IS NULL THEN
      RAISE EXCEPTION 'Invited Auth identity is not available'
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO app_private.invitation_password_challenges (
      invitation_id,
      auth_user_id,
      password_hash_fingerprint
    )
    VALUES (
      target.id,
      p_auth_user_id,
      invite_password_fingerprint
    )
    ON CONFLICT (invitation_id) DO NOTHING;
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
  current_encrypted_password text;
  current_user_id uuid := (SELECT auth.uid());
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
    coalesce(current_encrypted_password, '') = ''
      OR EXISTS (
        SELECT 1
        FROM app_private.invitation_password_challenges AS challenge
        WHERE challenge.invitation_id = invitation.id
          AND challenge.auth_user_id = current_user_id
          AND challenge.password_hash_fingerprint =
            extensions.digest(current_encrypted_password, 'sha256')
      ),
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

  IF coalesce(current_encrypted_password, '') = ''
    OR EXISTS (
      SELECT 1
      FROM app_private.invitation_password_challenges AS challenge
      WHERE challenge.invitation_id = target.id
        AND challenge.auth_user_id = current_user_id
        AND challenge.password_hash_fingerprint =
          extensions.digest(current_encrypted_password, 'sha256')
    ) THEN
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

  DELETE FROM app_private.invitation_password_challenges
  WHERE invitation_id = target.id;

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

REVOKE ALL ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text)
TO authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
TO authenticated;
GRANT EXECUTE
ON FUNCTION public.accept_organization_invitation(uuid)
TO authenticated;
