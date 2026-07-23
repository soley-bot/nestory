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
    coalesce(current_encrypted_password, '') = '',
    invitation.expires_at
  FROM public.organization_invitations AS invitation
  JOIN public.organizations AS organization ON organization.id = invitation.organization_id
  LEFT JOIN public.organization_branches AS branch ON branch.id = invitation.branch_id
  LEFT JOIN public.people AS person ON person.id = invitation.person_id
  WHERE invitation.id = p_invitation_id
    AND invitation.email = current_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_organization_invitation_for_acceptance(uuid)
TO authenticated;
