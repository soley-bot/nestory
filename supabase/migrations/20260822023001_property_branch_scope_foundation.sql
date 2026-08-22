ALTER TABLE public.properties
  ADD COLUMN branch_id uuid;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_branch_organization_fk
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id);

CREATE INDEX properties_org_branch_archived_idx
  ON public.properties (organization_id, branch_id, archived_at);

CREATE TABLE app_private.property_branch_assignment_context_capability (
  singleton boolean PRIMARY KEY DEFAULT true,
  capability_token text NOT NULL UNIQUE,
  CONSTRAINT property_branch_assignment_context_singleton_check
    CHECK (singleton),
  CONSTRAINT property_branch_assignment_context_token_check
    CHECK (capability_token ~ '^[0-9a-f]{64}$')
);

INSERT INTO app_private.property_branch_assignment_context_capability (
  singleton,
  capability_token
)
VALUES (
  true,
  encode(extensions.gen_random_bytes(32), 'hex')
);

CREATE FUNCTION app_private.backfill_property_branch_scope()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capability_token text;
  v_organization_id uuid;
  v_branch_id uuid;
  v_row_count bigint;
  v_total_count bigint := 0;
BEGIN
  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.property_branch_assignment_context_capability AS capability
  WHERE capability.singleton;

  PERFORM pg_catalog.set_config(
    'app.property_branch_assignment_context',
    v_capability_token,
    true
  );

  FOR v_organization_id, v_branch_id IN
    SELECT
      branch.organization_id,
      (array_agg(branch.id ORDER BY branch.id))[1] AS branch_id
    FROM public.organization_branches AS branch
    WHERE branch.status = 'active'
      AND branch.archived_at IS NULL
    GROUP BY branch.organization_id
    HAVING count(*) = 1
    ORDER BY branch.organization_id
  LOOP
    PERFORM app_private.lock_organization_authorization_scope(
      v_organization_id,
      v_branch_id,
      NULL
    );

    IF (
      SELECT count(*)
      FROM public.organization_branches AS branch
      WHERE branch.organization_id = v_organization_id
        AND branch.status = 'active'
        AND branch.archived_at IS NULL
    ) = 1
    AND EXISTS (
      SELECT 1
      FROM public.organization_branches AS branch
      WHERE branch.organization_id = v_organization_id
        AND branch.id = v_branch_id
        AND branch.status = 'active'
        AND branch.archived_at IS NULL
    ) THEN
      UPDATE public.properties AS property
      SET branch_id = v_branch_id
      WHERE property.organization_id = v_organization_id
        AND property.branch_id IS NULL;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_total_count := v_total_count + v_row_count;
    END IF;
  END LOOP;

  PERFORM pg_catalog.set_config(
    'app.property_branch_assignment_context',
    'off',
    true
  );

  RETURN v_total_count;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.property_branch_assignment_context',
      'off',
      true
    );
    RAISE;
END;
$$;

SELECT app_private.backfill_property_branch_scope();

CREATE FUNCTION app_private.guard_property_branch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capability_token text;
  v_checked_context boolean;
  v_scope_changed boolean;
BEGIN
  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.property_branch_assignment_context_capability AS capability
  WHERE capability.singleton;

  v_checked_context := coalesce(
    pg_catalog.current_setting(
      'app.property_branch_assignment_context',
      true
    ),
    ''
  ) = v_capability_token;

  v_scope_changed := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.branch_id IS NOT NULL
    ELSE OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
  END;

  IF NOT v_checked_context THEN
    PERFORM app_private.lock_organization_authorization_scope(
      NEW.organization_id,
      NULL,
      NULL
    );
  END IF;

  IF v_scope_changed AND NOT v_checked_context THEN
    RAISE EXCEPTION 'Property branch changes require the checked assignment path.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = NEW.organization_id
      AND branch.id = NEW.branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'An active branch in this organization is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.branch_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id = NEW.organization_id
      AND authorization_state.ordinary_access_enabled
  ) THEN
    RAISE EXCEPTION 'Ordinary access requires every Property to retain an active branch.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_guard_branch_scope
BEFORE INSERT OR UPDATE OF organization_id, branch_id
ON public.properties
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_property_branch_scope();

CREATE FUNCTION app_private.organization_branch_readiness_snapshot(
  p_organization_id uuid
)
RETURNS TABLE (
  active_branch_count bigint,
  property_count bigint,
  scoped_property_count bigint,
  unscoped_property_count bigint,
  conflicting_record_count bigint,
  ordinary_assignment_ready boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH branch_counts AS (
    SELECT count(*)::bigint AS active_branch_count
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ),
  property_counts AS (
    SELECT
      count(*)::bigint AS property_count,
      count(*) FILTER (WHERE property.branch_id IS NOT NULL)::bigint
        AS scoped_property_count,
      count(*) FILTER (WHERE property.branch_id IS NULL)::bigint
        AS unscoped_property_count,
      count(*) FILTER (
        WHERE property.branch_id IS NOT NULL
          AND (
            branch.id IS NULL
            OR branch.status <> 'active'
            OR branch.archived_at IS NOT NULL
          )
      )::bigint AS conflicting_record_count
    FROM public.properties AS property
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = property.organization_id
     AND branch.id = property.branch_id
    WHERE property.organization_id = p_organization_id
  )
  SELECT
    branch_counts.active_branch_count,
    property_counts.property_count,
    property_counts.scoped_property_count,
    property_counts.unscoped_property_count,
    property_counts.conflicting_record_count,
    property_counts.unscoped_property_count = 0
      AND property_counts.conflicting_record_count = 0
      AS ordinary_assignment_ready
  FROM branch_counts
  CROSS JOIN property_counts;
$$;

CREATE FUNCTION app_private.get_organization_branch_readiness_checked(
  p_organization_id uuid
)
RETURNS TABLE (
  active_branch_count bigint,
  property_count bigint,
  scoped_property_count bigint,
  unscoped_property_count bigint,
  conflicting_record_count bigint,
  ordinary_assignment_ready boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_role_super_admin(p_organization_id);

  RETURN QUERY
  SELECT *
  FROM app_private.organization_branch_readiness_snapshot(p_organization_id);
END;
$$;

CREATE FUNCTION app_private.assign_property_branch_checked(
  p_organization_id uuid,
  p_property_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_capability_token text;
  v_previous_branch_id uuid;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );

  PERFORM app_private.lock_current_organization_membership(p_organization_id);

  v_actor_id := app_private.assert_role_super_admin(p_organization_id);

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'A Property branch is required.'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
  FROM public.organization_branches AS branch
  WHERE branch.organization_id = p_organization_id
    AND branch.id = p_branch_id
    AND branch.status = 'active'
    AND branch.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active branch in this organization is required.'
      USING ERRCODE = '23514';
  END IF;

  SELECT property.branch_id
  INTO v_previous_branch_id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property was not found in this organization.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_branch_id IS NOT DISTINCT FROM p_branch_id THEN
    RETURN p_property_id;
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.property_branch_assignment_context_capability AS capability
  WHERE capability.singleton;

  PERFORM pg_catalog.set_config(
    'app.property_branch_assignment_context',
    v_capability_token,
    true
  );

  UPDATE public.properties
  SET
    branch_id = p_branch_id,
    updated_at = now(),
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_property_id;

  PERFORM pg_catalog.set_config(
    'app.property_branch_assignment_context',
    'off',
    true
  );

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'property',
    p_property_id,
    'property_branch_assigned',
    jsonb_build_object('branch_id', v_previous_branch_id),
    jsonb_build_object('branch_id', p_branch_id)
  );

  RETURN p_property_id;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.property_branch_assignment_context',
      'off',
      true
    );
    RAISE;
END;
$$;

CREATE FUNCTION app_private.validate_property_branch_readiness_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ordinary_assignment_ready boolean;
BEGIN
  IF OLD.ordinary_access_enabled IS NOT DISTINCT FROM NEW.ordinary_access_enabled
    OR NOT NEW.ordinary_access_enabled THEN
    RETURN NEW;
  END IF;

  PERFORM app_private.lock_organization_authorization_scope(
    NEW.organization_id,
    NULL,
    NULL
  );

  PERFORM 1
  FROM public.properties AS property
  WHERE property.organization_id = NEW.organization_id
  ORDER BY property.id
  FOR UPDATE;

  SELECT readiness.ordinary_assignment_ready
  INTO v_ordinary_assignment_ready
  FROM app_private.organization_branch_readiness_snapshot(
    NEW.organization_id
  ) AS readiness;

  IF NOT coalesce(v_ordinary_assignment_ready, false) THEN
    RAISE EXCEPTION 'Ordinary access cannot be enabled while Property branch scope is unresolved.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_authorization_states_branch_readiness_activation
BEFORE UPDATE OF ordinary_access_enabled
ON public.organization_authorization_states
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_property_branch_readiness_activation();

CREATE FUNCTION public.get_organization_branch_readiness(
  p_organization_id uuid
)
RETURNS TABLE (
  active_branch_count bigint,
  property_count bigint,
  scoped_property_count bigint,
  unscoped_property_count bigint,
  conflicting_record_count bigint,
  ordinary_assignment_ready boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM app_private.get_organization_branch_readiness_checked($1);
$$;

CREATE FUNCTION public.assign_property_branch(
  p_organization_id uuid,
  p_property_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.assign_property_branch_checked($1, $2, $3);
$$;

COMMENT ON FUNCTION app_private.backfill_property_branch_scope()
IS 'Owner-only deterministic Property branch backfill; assigns only organizations with exactly one active non-archived branch.';

COMMENT ON FUNCTION app_private.assign_property_branch_checked(uuid, uuid, uuid)
IS 'Authorization lock order: organization authorization state, current organization membership, target branch, then Property.';

REVOKE ALL ON TABLE app_private.property_branch_assignment_context_capability
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.backfill_property_branch_scope()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_property_branch_scope()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.organization_branch_readiness_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.get_organization_branch_readiness_checked(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.assign_property_branch_checked(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.validate_property_branch_readiness_activation()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_private.get_organization_branch_readiness_checked(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.assign_property_branch_checked(uuid, uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_organization_branch_readiness(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.assign_property_branch(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_organization_branch_readiness(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_property_branch(uuid, uuid, uuid)
  TO authenticated;
