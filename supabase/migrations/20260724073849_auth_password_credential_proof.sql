CREATE TABLE app_private.auth_password_credential_proofs (
  auth_user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash_fingerprint bytea NOT NULL,
  proof_method text NOT NULL
    CONSTRAINT auth_password_credential_proofs_method_check
    CHECK (
      proof_method IN (
        'password_login',
        'password_recovery',
        'invitation_password',
        'invite_hash_replacement'
      )
    ),
  proven_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_private.auth_password_credential_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.auth_password_credential_proofs
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.record_auth_password_credential_proof(
  p_auth_user_id uuid,
  p_proof_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_encrypted_password text;
  normalized_method text := lower(trim(coalesce(p_proof_method, '')));
BEGIN
  IF normalized_method NOT IN (
    'password_login',
    'password_recovery',
    'invitation_password',
    'invite_hash_replacement'
  ) THEN
    RAISE EXCEPTION 'Credential proof method is not supported'
      USING ERRCODE = '22023';
  END IF;

  SELECT user_row.encrypted_password
  INTO current_encrypted_password
  FROM auth.users AS user_row
  WHERE user_row.id = p_auth_user_id;

  IF coalesce(current_encrypted_password, '') = '' THEN
    RAISE EXCEPTION 'Password credential is not available'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO app_private.auth_password_credential_proofs (
    auth_user_id,
    password_hash_fingerprint,
    proof_method,
    proven_at
  )
  VALUES (
    p_auth_user_id,
    extensions.digest(current_encrypted_password, 'sha256'),
    normalized_method,
    now()
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    password_hash_fingerprint = EXCLUDED.password_hash_fingerprint,
    proof_method = EXCLUDED.proof_method,
    proven_at = EXCLUDED.proven_at;

  RETURN p_auth_user_id;
END;
$$;

REVOKE ALL
ON FUNCTION app_private.record_auth_password_credential_proof(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_auth_password_credential_proof(
  p_auth_user_id uuid,
  p_proof_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_method text := lower(trim(coalesce(p_proof_method, '')));
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_method NOT IN (
    'password_login',
    'password_recovery',
    'invitation_password'
  ) THEN
    RAISE EXCEPTION 'Credential proof method is not supported'
      USING ERRCODE = '22023';
  END IF;

  RETURN app_private.record_auth_password_credential_proof(
    p_auth_user_id,
    normalized_method
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.record_auth_password_credential_proof(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
ON FUNCTION public.record_auth_password_credential_proof(uuid, text)
TO service_role;

CREATE FUNCTION app_private.auth_password_is_proven(
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
      FROM app_private.auth_password_credential_proofs AS proof
      WHERE proof.auth_user_id = p_auth_user_id
        AND proof.password_hash_fingerprint =
          extensions.digest(p_encrypted_password, 'sha256')
    );
$$;

REVOKE ALL
ON FUNCTION app_private.auth_password_is_proven(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.invitation_password_is_proven(
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
    app_private.auth_password_is_proven(
      p_auth_user_id,
      p_encrypted_password
    )
    OR app_private.invitation_password_was_replaced(
      p_invitation_id,
      p_auth_user_id,
      p_encrypted_password
    );
$$;

REVOKE ALL
ON FUNCTION app_private.invitation_password_is_proven(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

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
  invite_auth_user_id uuid;
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
    AND (
      (SELECT auth.uid()) IS NULL
      OR NOT app_private.is_org_admin(target.organization_id)
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_method NOT IN ('invite', 'magic_link') THEN
    RAISE EXCEPTION 'Delivery method is not supported' USING ERRCODE = '22023';
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending' USING ERRCODE = '55000';
  END IF;

  IF normalized_method = 'invite' THEN
    SELECT
      user_row.id,
      CASE
        WHEN coalesce(user_row.encrypted_password, '') <> ''
          THEN extensions.digest(user_row.encrypted_password, 'sha256')
        ELSE NULL
      END
    INTO
      invite_auth_user_id,
      invite_password_fingerprint
    FROM auth.users AS user_row
    WHERE user_row.id = p_auth_user_id
      AND lower(user_row.email) = target.email;

    IF invite_auth_user_id IS NULL THEN
      RAISE EXCEPTION 'Invited Auth identity is not available'
        USING ERRCODE = '23503';
    END IF;

    IF invite_password_fingerprint IS NOT NULL THEN
      INSERT INTO app_private.invitation_password_challenges (
        invitation_id,
        auth_user_id,
        password_hash_fingerprint
      )
      VALUES (
        target.id,
        invite_auth_user_id,
        invite_password_fingerprint
      )
      ON CONFLICT (invitation_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.organization_invitations
  SET
    auth_user_id = coalesce(p_auth_user_id, auth_user_id),
    delivery_method = normalized_method,
    delivery_error = NULL,
    last_sent_at = now()
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
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

REVOKE ALL
ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE
ON FUNCTION public.mark_organization_invitation_sent(uuid, uuid, text)
TO authenticated, service_role;

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
      WHEN invitation.status IN ('pending', 'send_failed')
        AND invitation.expires_at <= now()
        THEN 'expired'
      ELSE invitation.status
    END,
    invitation.status IN ('pending', 'send_failed')
      AND NOT app_private.invitation_password_is_proven(
        invitation.id,
        current_user_id,
        current_encrypted_password
      ),
    invitation.expires_at
  FROM public.organization_invitations AS invitation
  JOIN public.organizations AS organization
    ON organization.id = invitation.organization_id
  LEFT JOIN public.organization_branches AS branch
    ON branch.id = invitation.branch_id
  LEFT JOIN public.people AS person
    ON person.id = invitation.person_id
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

CREATE OR REPLACE FUNCTION app_private.enforce_invite_password_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_encrypted_password text;
BEGIN
  IF NEW.status = 'accepted'
    AND OLD.status IN ('pending', 'send_failed') THEN
    SELECT user_row.encrypted_password
    INTO current_encrypted_password
    FROM auth.users AS user_row
    WHERE user_row.id = NEW.auth_user_id;

    IF app_private.auth_password_is_proven(
      NEW.auth_user_id,
      current_encrypted_password
    ) THEN
      RETURN NEW;
    END IF;

    IF app_private.invitation_password_was_replaced(
      OLD.id,
      NEW.auth_user_id,
      current_encrypted_password
    ) THEN
      PERFORM app_private.record_auth_password_credential_proof(
        NEW.auth_user_id,
        'invite_hash_replacement'
      );
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Password setup is required' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION app_private.enforce_invite_password_replacement()
FROM PUBLIC, anon, authenticated, service_role;
