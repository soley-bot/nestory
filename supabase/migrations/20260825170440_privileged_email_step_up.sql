-- Staged server-authoritative privileged email verification.
--
-- Supabase email OTP is an AAL1 primary-authentication method, not an AAL2
-- factor. These private records therefore model a Nestory privileged step-up
-- grant without changing the Supabase Auth AAL claim. Enforcement remains off
-- until every privileged RPC, RLS policy, Storage policy, and service-role path
-- consumes current_privileged_email_step_up_satisfied() in a reviewed rollout.

CREATE TABLE app_private.privileged_email_step_up_policies (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  enforcement_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  enabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privileged_email_step_up_policy_enablement_check CHECK (
    (NOT enforcement_enabled AND enabled_at IS NULL AND enabled_by IS NULL)
    OR (enforcement_enabled AND enabled_at IS NOT NULL)
  )
);

CREATE TABLE app_private.privileged_email_step_up_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  code_digest text NOT NULL,
  email_digest text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  sent_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  CONSTRAINT privileged_email_step_up_code_digest_check
    CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT privileged_email_step_up_email_digest_check
    CHECK (email_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT privileged_email_step_up_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  CONSTRAINT privileged_email_step_up_attempt_count_check
    CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
  CONSTRAINT privileged_email_step_up_max_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 10),
  CONSTRAINT privileged_email_step_up_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT privileged_email_step_up_resend_check
    CHECK (resend_available_at > created_at),
  CONSTRAINT privileged_email_step_up_delivery_time_check
    CHECK ((delivery_status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX privileged_email_step_up_challenges_active_idx
  ON app_private.privileged_email_step_up_challenges (
    organization_id,
    user_id,
    session_id,
    created_at DESC
  )
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE app_private.privileged_email_step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL
    REFERENCES app_private.privileged_email_step_up_challenges(id)
    ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT privileged_email_step_up_grant_unique
    UNIQUE (organization_id, user_id, session_id),
  CONSTRAINT privileged_email_step_up_grant_expiry_check
    CHECK (expires_at > verified_at)
);

CREATE INDEX privileged_email_step_up_grants_active_idx
  ON app_private.privileged_email_step_up_grants (
    organization_id,
    user_id,
    session_id,
    expires_at DESC
  )
  WHERE revoked_at IS NULL;

CREATE TABLE app_private.privileged_email_step_up_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  challenge_id uuid
    REFERENCES app_private.privileged_email_step_up_challenges(id)
    ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privileged_email_step_up_event_type_check CHECK (
    event_type IN (
      'challenge_prepared',
      'delivery_succeeded',
      'delivery_failed',
      'verification_failed',
      'verification_succeeded'
    )
  ),
  CONSTRAINT privileged_email_step_up_event_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX privileged_email_step_up_events_audit_idx
  ON app_private.privileged_email_step_up_events (
    organization_id,
    user_id,
    created_at DESC
  );

ALTER TABLE app_private.privileged_email_step_up_policies
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_policies
  FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_challenges
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_challenges
  FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_grants
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_grants
  FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_events
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privileged_email_step_up_events
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app_private.privileged_email_step_up_policies
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE app_private.privileged_email_step_up_challenges
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE app_private.privileged_email_step_up_grants
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE app_private.privileged_email_step_up_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE app_private.privileged_email_step_up_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.user_requires_privileged_step_up(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      WHERE member.organization_id = p_organization_id
        AND member.user_id = p_user_id
        AND (
          member.role IN ('super_admin', 'finance_manager', 'finance_member')
          OR (
            member.role = 'custom'
            AND EXISTS (
              SELECT 1
              FROM public.organization_role_permissions AS permission
              WHERE permission.organization_id = member.organization_id
                AND permission.role_id = member.custom_role_id
                AND permission.permission_key::text LIKE 'finance.%'
            )
          )
        )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.current_privileged_email_step_up_satisfied(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id uuid;
  v_user_id uuid := (SELECT auth.uid());
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

  BEGIN
    v_session_id := nullif((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_user_id IS NULL OR v_session_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app_private.user_requires_privileged_step_up(
    p_organization_id,
    v_user_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_grants AS step_up_grant
    JOIN auth.sessions AS auth_session
      ON auth_session.id = step_up_grant.session_id
     AND auth_session.user_id = step_up_grant.user_id
    WHERE step_up_grant.organization_id = p_organization_id
      AND step_up_grant.user_id = v_user_id
      AND step_up_grant.session_id = v_session_id
      AND step_up_grant.revoked_at IS NULL
      AND step_up_grant.expires_at > now()
      AND (auth_session.not_after IS NULL OR auth_session.not_after > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_privileged_email_step_up(
  p_organization_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_code_digest text,
  p_email_digest text
)
RETURNS TABLE (
  challenge_id uuid,
  expires_at timestamptz,
  resend_available_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge_id uuid;
  v_created_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_resend_available_at timestamptz := now() + interval '60 seconds';
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_code_digest, '') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_email_digest, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid challenge material' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
    AND member.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR NOT app_private.user_requires_privileged_step_up(
      p_organization_id,
      p_user_id
    ) THEN
    RAISE EXCEPTION 'Challenge unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN auth.sessions AS auth_session
      ON auth_session.user_id = auth_user.id
    WHERE auth_user.id = p_user_id
      AND auth_user.email_confirmed_at IS NOT NULL
      AND nullif(trim(auth_user.email), '') IS NOT NULL
      AND auth_session.id = p_session_id
      AND (auth_session.not_after IS NULL OR auth_session.not_after > now())
  ) THEN
    RAISE EXCEPTION 'Challenge unavailable' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_private.privileged_email_step_up_challenges AS challenge
    WHERE challenge.organization_id = p_organization_id
      AND challenge.user_id = p_user_id
      AND challenge.resend_available_at > now()
  ) THEN
    RAISE EXCEPTION 'Challenge unavailable' USING ERRCODE = '55000';
  END IF;

  UPDATE app_private.privileged_email_step_up_challenges AS challenge
  SET invalidated_at = now()
  WHERE challenge.organization_id = p_organization_id
    AND challenge.user_id = p_user_id
    AND challenge.consumed_at IS NULL
    AND challenge.invalidated_at IS NULL;

  INSERT INTO app_private.privileged_email_step_up_challenges (
    organization_id,
    user_id,
    session_id,
    code_digest,
    email_digest,
    created_at,
    expires_at,
    resend_available_at
  )
  VALUES (
    p_organization_id,
    p_user_id,
    p_session_id,
    p_code_digest,
    p_email_digest,
    v_created_at,
    v_expires_at,
    v_resend_available_at
  )
  RETURNING id INTO v_challenge_id;

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
    v_challenge_id,
    'challenge_prepared',
    jsonb_build_object('expiresInSeconds', 600, 'maxAttempts', 5)
  );

  RETURN QUERY SELECT v_challenge_id, v_expires_at, v_resend_available_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_privileged_email_step_up_sent(
  p_challenge_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge app_private.privileged_email_step_up_challenges%ROWTYPE;
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_challenge
  FROM app_private.privileged_email_step_up_challenges AS challenge
  WHERE challenge.id = p_challenge_id
  FOR UPDATE;

  IF v_challenge.id IS NULL
    OR v_challenge.delivery_status <> 'pending'
    OR v_challenge.consumed_at IS NOT NULL
    OR v_challenge.invalidated_at IS NOT NULL
    OR v_challenge.expires_at <= now() THEN
    RETURN false;
  END IF;

  UPDATE app_private.privileged_email_step_up_challenges
  SET delivery_status = 'sent', sent_at = now()
  WHERE id = v_challenge.id;

  INSERT INTO app_private.privileged_email_step_up_events (
    organization_id,
    user_id,
    challenge_id,
    event_type
  )
  VALUES (
    v_challenge.organization_id,
    v_challenge.user_id,
    v_challenge.id,
    'delivery_succeeded'
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_privileged_email_step_up_failed(
  p_challenge_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge app_private.privileged_email_step_up_challenges%ROWTYPE;
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_challenge
  FROM app_private.privileged_email_step_up_challenges AS challenge
  WHERE challenge.id = p_challenge_id
  FOR UPDATE;

  IF v_challenge.id IS NULL OR v_challenge.delivery_status <> 'pending' THEN
    RETURN false;
  END IF;

  UPDATE app_private.privileged_email_step_up_challenges
  SET delivery_status = 'failed', invalidated_at = now()
  WHERE id = v_challenge.id;

  INSERT INTO app_private.privileged_email_step_up_events (
    organization_id,
    user_id,
    challenge_id,
    event_type
  )
  VALUES (
    v_challenge.organization_id,
    v_challenge.user_id,
    v_challenge.id,
    'delivery_failed'
  );

  RETURN true;
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
    now() + interval '15 minutes',
    NULL
  )
  ON CONFLICT (organization_id, user_id, session_id) DO UPDATE
  SET
    challenge_id = EXCLUDED.challenge_id,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at,
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
    jsonb_build_object('grantExpiresInSeconds', 900)
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
    'verifiedUntil', v_verified_until,
    'canRequestAt', v_can_request_at
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.user_requires_privileged_step_up(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.current_privileged_email_step_up_satisfied(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_privileged_email_step_up(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_privileged_email_step_up(uuid, uuid, uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.mark_privileged_email_step_up_sent(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_privileged_email_step_up_sent(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.mark_privileged_email_step_up_failed(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_privileged_email_step_up_failed(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.verify_privileged_email_step_up(uuid, uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_privileged_email_step_up(uuid, uuid, uuid, uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_privileged_email_step_up_status(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_privileged_email_step_up_status(uuid, uuid, uuid)
  TO service_role;

COMMENT ON TABLE app_private.privileged_email_step_up_policies IS
  'Staged rollout switch. False by default; enable only after all privileged database, Storage, and service-role paths consume the session grant.';
COMMENT ON FUNCTION app_private.current_privileged_email_step_up_satisfied(uuid) IS
  'Future database authorization predicate. It is not wired into existing authority paths by this staged migration.';
