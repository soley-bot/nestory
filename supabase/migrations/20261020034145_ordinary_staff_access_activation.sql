-- Explicit, reviewed activation for an existing workspace. Installing this
-- migration does not activate any organization or create/send any invitation.
CREATE FUNCTION app_private.lock_ordinary_access_activation_actor(
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only an authenticated Super Admin can activate ordinary access.'
      USING ERRCODE = '42501', DETAIL = 'ordinary_access_forbidden';
  END IF;

  -- The shared authorization lock precedes the actor row and every readiness
  -- read. Recheck after waiting: the actor may have been removed or demoted.
  PERFORM app_private.lock_organization_authorization_scope(p_organization_id);
  PERFORM app_private.lock_current_organization_membership(p_organization_id);
  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only an authenticated Super Admin can activate ordinary access.'
      USING ERRCODE = '42501', DETAIL = 'ordinary_access_forbidden';
  END IF;
  RETURN v_actor_id;
END;
$$;

CREATE FUNCTION app_private.ordinary_access_activation_snapshot(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state public.organization_authorization_states%ROWTYPE;
  v_readiness record;
  v_manifest public.organization_access_transition_manifests%ROWTYPE;
  v_blockers text[] := ARRAY[]::text[];
  v_members jsonb;
  v_invitations jsonb;
  v_roles jsonb;
  v_branches jsonb;
  v_properties jsonb;
  v_manifest_items jsonb;
  v_impact_memberships jsonb;
  v_impact_invitations jsonb;
  v_ordinary_members bigint;
  v_ordinary_invitations bigint;
  v_impact jsonb;
BEGIN
  -- Internal only. Callers hold the shared authorization/actor locks.
  SELECT * INTO STRICT v_state
  FROM public.organization_authorization_states
  WHERE organization_id = p_organization_id;
  SELECT * INTO STRICT v_readiness
  FROM app_private.organization_branch_readiness_snapshot(p_organization_id);

  IF v_readiness.active_branch_count = 0 THEN
    v_blockers := array_append(v_blockers, 'no_active_branch');
  END IF;
  IF NOT v_readiness.ordinary_assignment_ready THEN
    v_blockers := array_append(v_blockers, 'property_branch_scope');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role IN ('finance_manager', 'finance_member', 'operations_manager', 'operations_member')
  ) THEN
    v_blockers := array_append(v_blockers, 'legacy_memberships');
  END IF;
  -- Match the activation triggers: pending/send_failed rows remain live
  -- assignments until their stored status changes, even after expires_at.
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations
    WHERE organization_id = p_organization_id
      AND status IN ('pending', 'send_failed')
      AND role IN ('finance_manager', 'finance_member', 'operations_manager', 'operations_member')
  ) THEN
    v_blockers := array_append(v_blockers, 'legacy_invitations');
  END IF;

  SELECT * INTO v_manifest
  FROM public.organization_access_transition_manifests
  WHERE organization_id = p_organization_id;
  IF v_state.transition_manifest_required THEN
    IF v_manifest.id IS NULL OR v_manifest.status IS DISTINCT FROM 'applied' THEN
      v_blockers := array_append(v_blockers, 'transition_manifest');
    ELSE
      BEGIN
        PERFORM app_private.assert_transition_manifest_applied(p_organization_id, v_manifest.id);
      EXCEPTION WHEN SQLSTATE '55000' OR SQLSTATE 'P0002' THEN
        v_blockers := array_append(v_blockers, 'transition_manifest');
      END;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = member.organization_id AND branch.id = member.branch_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id = member.organization_id AND role_record.id = member.custom_role_id
    WHERE member.organization_id = p_organization_id
      AND member.role <> 'super_admin'
      AND (
        member.role <> 'custom' OR branch.id IS NULL OR branch.status <> 'active'
        OR branch.archived_at IS NOT NULL OR role_record.id IS NULL OR role_record.status <> 'active'
        OR NOT EXISTS (
          SELECT 1 FROM public.organization_role_permissions AS permission_record
          WHERE permission_record.organization_id = role_record.organization_id
            AND permission_record.role_id = role_record.id
        )
      )
  ) THEN
    v_blockers := array_append(v_blockers, 'invalid_memberships');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = invitation.organization_id AND branch.id = invitation.branch_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id = invitation.organization_id AND role_record.id = invitation.custom_role_id
    WHERE invitation.organization_id = p_organization_id
      AND invitation.status IN ('pending', 'send_failed') AND invitation.role = 'custom'
      AND (
        branch.id IS NULL OR branch.status <> 'active' OR branch.archived_at IS NOT NULL
        OR role_record.id IS NULL OR role_record.status <> 'active'
        OR NOT EXISTS (
          SELECT 1 FROM public.organization_role_permissions AS permission_record
          WHERE permission_record.organization_id = role_record.organization_id
            AND permission_record.role_id = role_record.id
        )
      )
  ) THEN
    v_blockers := array_append(v_blockers, 'invalid_invitations');
  END IF;

  -- Return the exact consent subjects together with the fingerprint. A
  -- separately loaded Access register may be older than a refreshed preview.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', member.id,
    'user_id', member.user_id,
    'email', auth_user.email,
    'branch_id', member.branch_id,
    'branch_name', branch.name,
    'role_id', member.custom_role_id,
    'role_name', coalesce(role_record.name, member.role),
    'permission_keys', (
      SELECT coalesce(jsonb_agg(permission_record.permission_key ORDER BY permission_record.permission_key), '[]'::jsonb)
      FROM public.organization_role_permissions AS permission_record
      WHERE permission_record.organization_id = member.organization_id
        AND permission_record.role_id = member.custom_role_id
    )
  ) ORDER BY member.id), '[]'::jsonb)
  INTO v_impact_memberships
  FROM public.organization_members AS member
  LEFT JOIN auth.users AS auth_user ON auth_user.id = member.user_id
  LEFT JOIN public.organization_branches AS branch
    ON branch.organization_id = member.organization_id AND branch.id = member.branch_id
  LEFT JOIN public.organization_roles AS role_record
    ON role_record.organization_id = member.organization_id AND role_record.id = member.custom_role_id
  WHERE member.organization_id = p_organization_id AND member.role <> 'super_admin';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', invitation.id,
    'email', invitation.email,
    'status', invitation.status,
    'branch_id', invitation.branch_id,
    'branch_name', branch.name,
    'role_id', invitation.custom_role_id,
    'role_name', coalesce(role_record.name, invitation.role),
    'permission_keys', (
      SELECT coalesce(jsonb_agg(permission_record.permission_key ORDER BY permission_record.permission_key), '[]'::jsonb)
      FROM public.organization_role_permissions AS permission_record
      WHERE permission_record.organization_id = invitation.organization_id
        AND permission_record.role_id = invitation.custom_role_id
    )
  ) ORDER BY invitation.id), '[]'::jsonb)
  INTO v_impact_invitations
  FROM public.organization_invitations AS invitation
  LEFT JOIN public.organization_branches AS branch
    ON branch.organization_id = invitation.organization_id AND branch.id = invitation.branch_id
  LEFT JOIN public.organization_roles AS role_record
    ON role_record.organization_id = invitation.organization_id AND role_record.id = invitation.custom_role_id
  WHERE invitation.organization_id = p_organization_id AND invitation.role <> 'super_admin'
    AND invitation.status IN ('pending', 'send_failed');
  v_ordinary_members := jsonb_array_length(v_impact_memberships);
  v_ordinary_invitations := jsonb_array_length(v_impact_invitations);

  -- Hash exact identities and scope, not only counts. Every collection has an
  -- explicit stable order; all joins remain inside this organization. Raw
  -- delivery/session data are excluded. Consent subjects are returned above;
  -- their identities are never copied into the audit payload.
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    member.id, member.user_id, member.role, member.person_id,
    member.branch_id, member.custom_role_id
  ) ORDER BY member.id), '[]'::jsonb)
  INTO v_members FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    invitation.id, invitation.email, invitation.role, invitation.person_id,
    invitation.branch_id, invitation.custom_role_id, invitation.status,
    invitation.expires_at
  ) ORDER BY invitation.id), '[]'::jsonb)
  INTO v_invitations FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.status IN ('pending', 'send_failed');
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    role_record.id, role_record.name, role_record.status, role_record.version,
    (SELECT coalesce(jsonb_agg(permission_record.permission_key ORDER BY permission_record.permission_key), '[]'::jsonb)
     FROM public.organization_role_permissions AS permission_record
     WHERE permission_record.organization_id = role_record.organization_id
       AND permission_record.role_id = role_record.id)
  ) ORDER BY role_record.id), '[]'::jsonb)
  INTO v_roles FROM public.organization_roles AS role_record
  WHERE role_record.organization_id = p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    branch.id, branch.name, branch.code, branch.status, branch.archived_at
  ) ORDER BY branch.id), '[]'::jsonb)
  INTO v_branches FROM public.organization_branches AS branch
  WHERE branch.organization_id = p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    property.id, property.branch_id, property.archived_at
  ) ORDER BY property.id), '[]'::jsonb)
  INTO v_properties FROM public.properties AS property
  WHERE property.organization_id = p_organization_id;
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.id), '[]'::jsonb)
  INTO v_manifest_items FROM public.organization_access_transition_manifest_items AS item
  WHERE item.organization_id = p_organization_id AND item.manifest_id = v_manifest.id;

  v_impact := jsonb_build_object(
    'organization_id', p_organization_id,
    'authorization_version', v_state.version,
    'ordinary_access_enabled', v_state.ordinary_access_enabled,
    'transition_manifest_required', v_state.transition_manifest_required,
    'members', v_members, 'invitations', v_invitations, 'roles', v_roles,
    'branches', v_branches, 'properties', v_properties,
    'impact_memberships', v_impact_memberships, 'impact_invitations', v_impact_invitations,
    'manifest', to_jsonb(v_manifest), 'manifest_items', v_manifest_items,
    'readiness', to_jsonb(v_readiness), 'blockers', to_jsonb(v_blockers)
  );
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'authorization_version', v_state.version,
    'ordinary_access_enabled', v_state.ordinary_access_enabled,
    'activation_ready', NOT v_state.ordinary_access_enabled AND cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'impact_fingerprint', encode(extensions.digest(v_impact::text, 'sha256'), 'hex'),
    'active_branch_count', v_readiness.active_branch_count,
    'property_count', v_readiness.property_count,
    'unscoped_property_count', v_readiness.unscoped_property_count,
    'conflicting_record_count', v_readiness.conflicting_record_count,
    'ordinary_member_count', v_ordinary_members,
    'live_ordinary_invitation_count', v_ordinary_invitations,
    'impact_memberships', v_impact_memberships,
    'impact_invitations', v_impact_invitations
  );
END;
$$;

CREATE FUNCTION app_private.get_organization_ordinary_access_activation_checked(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Preview is allowed before step-up, so the administrator can review impact.
  -- Locks make its counts and fingerprint one coherent, non-mutating snapshot.
  PERFORM app_private.lock_ordinary_access_activation_actor(p_organization_id);
  RETURN app_private.ordinary_access_activation_snapshot(p_organization_id);
END;
$$;

CREATE FUNCTION app_private.activate_organization_ordinary_access_checked(
  p_organization_id uuid,
  p_expected_version bigint,
  p_expected_impact_fingerprint text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  v_actor_id := app_private.lock_ordinary_access_activation_actor(p_organization_id);
  -- Recheck even when already enabled; an idempotent response is not an
  -- authorization or step-up bypass.
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'Privileged email verification required'
      USING ERRCODE = '42501', DETAIL = 'ordinary_access_step_up_required';
  END IF;
  IF p_confirm IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirm ordinary access activation before continuing.'
      USING ERRCODE = '22023', DETAIL = 'ordinary_access_confirmation_required';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 1
    OR p_expected_impact_fingerprint IS NULL
    OR p_expected_impact_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Reload ordinary access readiness before continuing.'
      USING ERRCODE = '22023', DETAIL = 'ordinary_access_invalid_precondition';
  END IF;

  v_before := app_private.ordinary_access_activation_snapshot(p_organization_id);
  IF (v_before ->> 'ordinary_access_enabled')::boolean THEN
    RETURN v_before || jsonb_build_object('status', 'already_enabled');
  END IF;
  IF (v_before ->> 'authorization_version')::bigint <> p_expected_version
    OR v_before ->> 'impact_fingerprint' IS DISTINCT FROM p_expected_impact_fingerprint THEN
    RAISE EXCEPTION 'Ordinary access readiness changed. Reload and review it again.'
      USING ERRCODE = '40001', DETAIL = 'ordinary_access_stale_preview';
  END IF;
  IF NOT (v_before ->> 'activation_ready')::boolean THEN
    RAISE EXCEPTION 'Ordinary access is not ready to enable.'
      USING ERRCODE = '55000', DETAIL = 'ordinary_access_not_ready';
  END IF;

  -- Preserve the existing activation triggers. They perform the final
  -- branch/property/legacy/transition/role checks and advance the version.
  UPDATE public.organization_authorization_states
  SET ordinary_access_enabled = true
  WHERE organization_id = p_organization_id;
  v_after := app_private.ordinary_access_activation_snapshot(p_organization_id);

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'organization', p_organization_id,
    'organization_ordinary_access_enabled',
    jsonb_build_object(
      'ordinary_access_enabled', false,
      'authorization_version', v_before -> 'authorization_version',
      'impact_fingerprint', v_before -> 'impact_fingerprint'
    ),
    jsonb_build_object(
      'ordinary_access_enabled', true,
      'authorization_version', v_after -> 'authorization_version',
      'ordinary_member_count', v_before -> 'ordinary_member_count',
      'live_ordinary_invitation_count', v_before -> 'live_ordinary_invitation_count',
      'active_branch_count', v_before -> 'active_branch_count',
      'property_count', v_before -> 'property_count'
    )
  );
  RETURN v_after || jsonb_build_object('status', 'activated');
END;
$$;

CREATE FUNCTION public.get_organization_ordinary_access_activation(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.get_organization_ordinary_access_activation_checked($1);
$$;

CREATE FUNCTION public.activate_organization_ordinary_access(
  p_organization_id uuid,
  p_expected_version bigint,
  p_expected_impact_fingerprint text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.activate_organization_ordinary_access_checked($1, $2, $3, $4);
$$;

REVOKE ALL ON FUNCTION app_private.lock_ordinary_access_activation_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ordinary_access_activation_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.get_organization_ordinary_access_activation_checked(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.activate_organization_ordinary_access_checked(uuid, bigint, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_organization_ordinary_access_activation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.activate_organization_ordinary_access(uuid, bigint, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_organization_ordinary_access_activation_checked(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.activate_organization_ordinary_access_checked(uuid, bigint, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_ordinary_access_activation(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_organization_ordinary_access(uuid, bigint, text, boolean)
  TO authenticated;
