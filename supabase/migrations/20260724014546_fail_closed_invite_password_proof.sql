CREATE FUNCTION app_private.invitation_password_was_replaced(
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_encrypted_password text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    coalesce(p_encrypted_password, '') <> ''
    AND EXISTS (
      SELECT 1
      FROM app_private.invitation_password_challenges AS challenge
      WHERE challenge.invitation_id = p_invitation_id
        AND challenge.auth_user_id = p_auth_user_id
        AND challenge.password_hash_fingerprint <>
          extensions.digest(p_encrypted_password, 'sha256')
    );
$$;

REVOKE ALL
ON FUNCTION app_private.invitation_password_was_replaced(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

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
      OR (
        invitation.status IN ('pending', 'send_failed')
        AND (
          invitation.auth_user_id IS NOT NULL
          OR invitation.delivery_method IS DISTINCT FROM 'magic_link'
        )
        AND NOT app_private.invitation_password_was_replaced(
          invitation.id,
          current_user_id,
          current_encrypted_password
        )
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

REVOKE ALL
ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE
ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
TO authenticated;

CREATE FUNCTION app_private.enforce_invite_password_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_encrypted_password text;
BEGIN
  IF NEW.status = 'accepted'
    AND OLD.status IN ('pending', 'send_failed')
    AND (
      OLD.auth_user_id IS NOT NULL
      OR OLD.delivery_method IS DISTINCT FROM 'magic_link'
    ) THEN
    SELECT user_row.encrypted_password
    INTO current_encrypted_password
    FROM auth.users AS user_row
    WHERE user_row.id = NEW.auth_user_id;

    IF NOT app_private.invitation_password_was_replaced(
      OLD.id,
      NEW.auth_user_id,
      current_encrypted_password
    ) THEN
      RAISE EXCEPTION 'Password setup is required' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION app_private.enforce_invite_password_replacement()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_invite_password_replacement
BEFORE UPDATE OF status ON public.organization_invitations
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_invite_password_replacement();
