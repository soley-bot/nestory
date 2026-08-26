-- Enforce the staged Nestory email-only privileged grant at the database write
-- boundary. This grant is an application authorization control, not MFA/AAL2.
-- The migration remains dormant until an organization policy row is enabled.

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
      AND step_up_grant.expires_at > now()
  );
END;
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
BEGIN
  BEGIN
    v_session_id := nullif((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session_id := NULL;
  END;

  RETURN app_private.privileged_email_step_up_satisfied_for_actor(
    p_organization_id,
    (SELECT auth.uid()),
    v_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_privileged_email_step_up_satisfied(
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
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.privileged_email_step_up_satisfied_for_actor(
    p_organization_id,
    p_user_id,
    p_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text;
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_old_organization_id uuid;
  v_new_organization_id uuid;
BEGIN
  v_request_role := nullif(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  );
  IF v_request_role IS NULL THEN
    BEGIN
      v_request_role := nullif(
        pg_catalog.current_setting('request.jwt.claims', true),
        ''
      )::jsonb ->> 'role';
    EXCEPTION WHEN invalid_text_representation THEN
      v_request_role := NULL;
    END;
  END IF;

  -- Service-role, cron, provisioning, cleanup, and direct operator sessions
  -- keep their existing independent authorization and do not impersonate a user.
  IF v_request_role IS DISTINCT FROM 'authenticated' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN
    v_session_id := nullif((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session_id := NULL;
  END;

  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME = 'organizations' THEN
      v_old_organization_id := (pg_catalog.to_jsonb(OLD) ->> 'id')::uuid;
    ELSE
      v_old_organization_id :=
        (pg_catalog.to_jsonb(OLD) ->> 'organization_id')::uuid;
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'organizations' THEN
      v_new_organization_id := (pg_catalog.to_jsonb(NEW) ->> 'id')::uuid;
    ELSE
      v_new_organization_id :=
        (pg_catalog.to_jsonb(NEW) ->> 'organization_id')::uuid;
    END IF;
  END IF;

  IF v_old_organization_id IS NOT NULL
    AND NOT app_private.privileged_email_step_up_satisfied_for_actor(
      v_old_organization_id,
      v_user_id,
      v_session_id
    ) THEN
    RAISE EXCEPTION 'Privileged email verification required'
      USING ERRCODE = '42501';
  END IF;

  IF v_new_organization_id IS NOT NULL
    AND v_new_organization_id IS DISTINCT FROM v_old_organization_id
    AND NOT app_private.privileged_email_step_up_satisfied_for_actor(
      v_new_organization_id,
      v_user_id,
      v_session_id
    ) THEN
    RAISE EXCEPTION 'Privileged email verification required'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  v_table record;
BEGIN
  FOR v_table IN
    SELECT table_class.relname AS table_name
    FROM pg_catalog.pg_class AS table_class
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    WHERE table_namespace.nspname = 'public'
      AND table_class.relkind IN ('r', 'p')
      AND (
        table_class.relname = 'organizations'
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS column_attribute
          WHERE column_attribute.attrelid = table_class.oid
            AND column_attribute.attname = 'organization_id'
            AND column_attribute.attnum > 0
            AND NOT column_attribute.attisdropped
        )
      )
    ORDER BY table_class.relname
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER privileged_email_step_up_enforcement '
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION '
      'app_private.enforce_privileged_email_step_up_on_organization_mutation()',
      v_table.table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_privileged_email_step_up_on_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text;
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_old_organization_id uuid;
  v_new_organization_id uuid;
BEGIN
  v_request_role := nullif(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  );
  IF v_request_role IS NULL THEN
    BEGIN
      v_request_role := nullif(
        pg_catalog.current_setting('request.jwt.claims', true),
        ''
      )::jsonb ->> 'role';
    EXCEPTION WHEN invalid_text_representation THEN
      v_request_role := NULL;
    END;
  END IF;

  IF v_request_role IS DISTINCT FROM 'authenticated' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN
    v_session_id := nullif((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session_id := NULL;
  END;

  IF TG_OP <> 'INSERT' THEN
    v_old_organization_id := app_private.storage_object_org_id(OLD.name);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_organization_id := app_private.storage_object_org_id(NEW.name);
  END IF;

  IF v_old_organization_id IS NOT NULL
    AND NOT app_private.privileged_email_step_up_satisfied_for_actor(
      v_old_organization_id,
      v_user_id,
      v_session_id
    ) THEN
    RAISE EXCEPTION 'Privileged email verification required'
      USING ERRCODE = '42501';
  END IF;

  IF v_new_organization_id IS NOT NULL
    AND v_new_organization_id IS DISTINCT FROM v_old_organization_id
    AND NOT app_private.privileged_email_step_up_satisfied_for_actor(
      v_new_organization_id,
      v_user_id,
      v_session_id
    ) THEN
    RAISE EXCEPTION 'Privileged email verification required'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION
  app_private.enforce_privileged_email_step_up_on_storage_object();

REVOKE ALL ON FUNCTION app_private.privileged_email_step_up_satisfied_for_actor(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.current_privileged_email_step_up_satisfied(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_privileged_email_step_up_on_storage_object()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_privileged_email_step_up_satisfied(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_privileged_email_step_up_satisfied(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION app_private.privileged_email_step_up_satisfied_for_actor(uuid, uuid, uuid) IS
  'Checks the staged Nestory email-only grant for an explicit organization, actor, and exact active Auth session.';
COMMENT ON FUNCTION app_private.current_privileged_email_step_up_satisfied(uuid) IS
  'Checks the staged Nestory email-only grant for the current verified authenticated request claims.';
COMMENT ON FUNCTION public.assert_privileged_email_step_up_satisfied(uuid, uuid, uuid) IS
  'Service-role-only check for a trusted server-derived organization, actor, and exact Auth session.';
