-- Keep privileged email verification for the exact organization, user, and
-- Supabase Auth session instead of expiring it independently after 15 minutes.
-- Existing timed grants retain their expiry; only a newly successful challenge
-- converts its exact-session grant to the NULL session-lifetime representation.

ALTER TABLE app_private.privileged_email_step_up_grants
  ALTER COLUMN expires_at DROP NOT NULL;

CREATE OR REPLACE FUNCTION app_private.privileged_email_step_up_satisfied_for_actor(
  p_organization_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(
    (
      SELECT policy.enforcement_enabled
      FROM app_private.privileged_email_step_up_policies AS policy
      WHERE policy.organization_id = p_organization_id
    ),
    false
  ) THEN
    RETURN true;
  END IF;

  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS auth_session
    WHERE auth_session.id = p_session_id
      AND auth_session.user_id = p_user_id
      AND (auth_session.not_after IS NULL OR auth_session.not_after > now())
  ) THEN
    RETURN false;
  END IF;

  IF NOT app_private.user_requires_privileged_step_up(
    p_organization_id,
    p_user_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    WHERE step_up_grant.organization_id = p_organization_id
      AND step_up_grant.user_id = p_user_id
      AND step_up_grant.session_id = p_session_id
      AND step_up_grant.revoked_at IS NULL
      AND (
        step_up_grant.expires_at IS NULL
        OR step_up_grant.expires_at > now()
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_privileged_email_step_up(
  p_challenge_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_code_digest text,
  p_email_digest text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge app_private.privileged_email_step_up_challenges%ROWTYPE;
  v_next_attempt_count integer;
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_code_digest, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_challenge
  FROM app_private.privileged_email_step_up_challenges AS challenge
  WHERE challenge.id = p_challenge_id
    AND challenge.organization_id = p_organization_id
    AND challenge.user_id = p_user_id
    AND challenge.session_id = p_session_id
  FOR UPDATE;

  IF v_challenge.id IS NULL
    OR v_challenge.delivery_status <> 'sent'
    OR v_challenge.consumed_at IS NOT NULL
    OR v_challenge.invalidated_at IS NOT NULL
    OR v_challenge.expires_at <= now()
    OR v_challenge.attempt_count >= v_challenge.max_attempts
    OR NOT app_private.user_requires_privileged_step_up(
      p_organization_id,
      p_user_id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM auth.sessions AS auth_session
      WHERE auth_session.id = p_session_id
        AND auth_session.user_id = p_user_id
        AND (auth_session.not_after IS NULL OR auth_session.not_after > now())
    ) THEN
    RETURN false;
  END IF;

  IF coalesce(p_email_digest, '') !~ '^[0-9a-f]{64}$'
    OR v_challenge.email_digest <> p_email_digest THEN
    UPDATE app_private.privileged_email_step_up_challenges
    SET invalidated_at = now()
    WHERE id = v_challenge.id;

    INSERT INTO app_private.privileged_email_step_up_events (
      organization_id,
      user_id,
      challenge_id,
      event_type,
      metadata
    )
    VALUES (
      p_organization_id,
      p_user_id,
      v_challenge.id,
      'verification_failed',
      jsonb_build_object('reason', 'email_changed')
    );
    RETURN false;
  END IF;

  IF v_challenge.code_digest <> p_code_digest THEN
    v_next_attempt_count := v_challenge.attempt_count + 1;
    UPDATE app_private.privileged_email_step_up_challenges
    SET
      attempt_count = v_next_attempt_count,
      invalidated_at = CASE
        WHEN v_next_attempt_count >= max_attempts THEN now()
        ELSE invalidated_at
      END
    WHERE id = v_challenge.id;

    INSERT INTO app_private.privileged_email_step_up_events (
      organization_id,
      user_id,
      challenge_id,
      event_type,
      metadata
    )
    VALUES (
      p_organization_id,
      p_user_id,
      v_challenge.id,
      'verification_failed',
      jsonb_build_object('attemptNumber', v_next_attempt_count)
    );
    RETURN false;
  END IF;

  UPDATE app_private.privileged_email_step_up_challenges
  SET consumed_at = now()
  WHERE id = v_challenge.id;

  INSERT INTO app_private.privileged_email_step_up_grants (
    organization_id,
    user_id,
    session_id,
    challenge_id,
    verified_at,
    expires_at,
    revoked_at
  )
  VALUES (
    p_organization_id,
    p_user_id,
    p_session_id,
    v_challenge.id,
    now(),
    NULL,
    NULL
  )
  ON CONFLICT (organization_id, user_id, session_id) DO UPDATE
  SET
    challenge_id = EXCLUDED.challenge_id,
    verified_at = EXCLUDED.verified_at,
    expires_at = NULL,
    revoked_at = NULL;

  INSERT INTO app_private.privileged_email_step_up_events (
    organization_id,
    user_id,
    challenge_id,
    event_type,
    metadata
  )
  VALUES (
    p_organization_id,
    p_user_id,
    v_challenge.id,
    'verification_succeeded',
    jsonb_build_object('grantScope', 'auth_session')
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_privileged_email_step_up_status(
  p_organization_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_can_request_at timestamptz;
  v_enforcement_enabled boolean;
  v_required boolean;
  v_verified boolean;
  v_verified_until timestamptz;
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS auth_session
    WHERE auth_session.id = p_session_id
      AND auth_session.user_id = p_user_id
      AND (auth_session.not_after IS NULL OR auth_session.not_after > now())
  ) THEN
    RAISE EXCEPTION 'Status unavailable' USING ERRCODE = '42501';
  END IF;

  v_required := app_private.user_requires_privileged_step_up(
    p_organization_id,
    p_user_id
  );
  SELECT policy.enforcement_enabled
  INTO v_enforcement_enabled
  FROM app_private.privileged_email_step_up_policies AS policy
  WHERE policy.organization_id = p_organization_id;

  SELECT EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    WHERE step_up_grant.organization_id = p_organization_id
      AND step_up_grant.user_id = p_user_id
      AND step_up_grant.session_id = p_session_id
      AND step_up_grant.revoked_at IS NULL
      AND (
        step_up_grant.expires_at IS NULL
        OR step_up_grant.expires_at > now()
      )
  )
  INTO v_verified;

  SELECT max(step_up_grant.expires_at)
  INTO v_verified_until
  FROM app_private.privileged_email_step_up_grants AS step_up_grant
  WHERE step_up_grant.organization_id = p_organization_id
    AND step_up_grant.user_id = p_user_id
    AND step_up_grant.session_id = p_session_id
    AND step_up_grant.revoked_at IS NULL
    AND step_up_grant.expires_at > now();

  SELECT max(challenge.resend_available_at)
  INTO v_can_request_at
  FROM app_private.privileged_email_step_up_challenges AS challenge
  WHERE challenge.organization_id = p_organization_id
    AND challenge.user_id = p_user_id
    AND challenge.session_id = p_session_id
    AND challenge.consumed_at IS NULL
    AND challenge.invalidated_at IS NULL
    AND challenge.expires_at > now();

  RETURN jsonb_build_object(
    'required', v_required,
    'enforcementEnabled', coalesce(v_enforcement_enabled, false),
    'verified', coalesce(v_verified, false),
    'verifiedUntil', v_verified_until,
    'canRequestAt', v_can_request_at
  );
END;
$$;

COMMENT ON COLUMN app_private.privileged_email_step_up_grants.expires_at IS
  'Legacy grants use a timestamp; NULL grants remain valid only for their exact live Auth session.';

COMMENT ON FUNCTION app_private.privileged_email_step_up_satisfied_for_actor(uuid, uuid, uuid) IS
  'Checks rollout policy, actor privilege, exact live Auth session, revocation, and session-lifetime or legacy timed grant validity.';

COMMENT ON FUNCTION public.verify_privileged_email_step_up(uuid, uuid, uuid, uuid, text, text) IS
  'Consumes a fresh delivered challenge and grants privileged verification for the exact live Auth session.';
