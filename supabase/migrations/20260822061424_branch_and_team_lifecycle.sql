CREATE INDEX organization_members_active_branch_dependency_idx
  ON public.organization_members (organization_id, branch_id, id)
  WHERE role <> 'super_admin' AND branch_id IS NOT NULL;

CREATE INDEX organization_invitations_active_branch_dependency_idx
  ON public.organization_invitations (organization_id, branch_id, id)
  WHERE role <> 'super_admin' AND status IN ('pending', 'send_failed')
    AND branch_id IS NOT NULL;

CREATE INDEX organization_teams_active_branch_dependency_idx
  ON public.organization_teams (organization_id, branch_id, id)
  WHERE archived_at IS NULL AND branch_id IS NOT NULL;

CREATE INDEX tasks_active_branch_dependency_idx
  ON public.tasks (organization_id, branch_id, id)
  WHERE archived_at IS NULL
    AND status NOT IN ('completed', 'cancelled')
    AND branch_id IS NOT NULL;

CREATE INDEX notification_outbox_live_branch_dependency_idx
  ON public.notification_outbox (organization_id, branch_id, id)
  WHERE status IN ('pending', 'processing', 'retry') AND branch_id IS NOT NULL;

CREATE INDEX organization_access_manifest_items_target_branch_idx
  ON public.organization_access_transition_manifest_items (
    organization_id,
    target_branch_id,
    manifest_id
  );

CREATE FUNCTION app_private.lock_organization_structure_scope(
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':organization-structure',
      0
    )
  );
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(p_organization_id);
  v_actor_id := app_private.assert_role_super_admin(p_organization_id);
  RETURN v_actor_id;
END;
$$;

COMMENT ON FUNCTION app_private.lock_organization_structure_scope(uuid)
IS 'Serializes organization structure changes, then locks authorization state and the caller membership before asserting Super Admin authority.';

CREATE FUNCTION app_private.normalized_structure_label(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')
  );
$$;

CREATE FUNCTION app_private.create_organization_branch_checked(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_branch_id uuid;
  v_name text := app_private.normalized_structure_label(p_name);
  v_code text := pg_catalog.upper(app_private.normalized_structure_label(p_code));
  v_address text := nullif(app_private.normalized_structure_label(p_address), '');
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);

  IF pg_catalog.length(v_name) NOT BETWEEN 2 AND 120
    OR pg_catalog.length(v_code) NOT BETWEEN 2 AND 16 THEN
    RAISE EXCEPTION 'Branch name and code are required.' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NOT NULL AND pg_catalog.length(v_address) > 240 THEN
    RAISE EXCEPTION 'Branch address is too long.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_branches (
    organization_id, name, code, address, created_by, updated_by
  ) VALUES (
    p_organization_id, v_name, v_code, v_address, v_actor_id, v_actor_id
  )
  RETURNING id INTO v_branch_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_branch',
    v_branch_id,
    'organization_branch_created',
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'code', v_code,
      'address', v_address,
      'status', 'active',
      'archived_at', NULL
    )
  );

  RETURN v_branch_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Branch name or code is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.update_organization_branch_checked(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_code text,
  p_address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_branches%ROWTYPE;
  v_after public.organization_branches%ROWTYPE;
  v_name text := app_private.normalized_structure_label(p_name);
  v_code text := pg_catalog.upper(app_private.normalized_structure_label(p_code));
  v_address text := nullif(app_private.normalized_structure_label(p_address), '');
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);

  SELECT branch.* INTO v_before
  FROM public.organization_branches AS branch
  WHERE branch.organization_id = p_organization_id
    AND branch.id = p_branch_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Branch was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived branches cannot be edited.' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.length(v_name) NOT BETWEEN 2 AND 120
    OR pg_catalog.length(v_code) NOT BETWEEN 2 AND 16 THEN
    RAISE EXCEPTION 'Branch name and code are required.' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NOT NULL AND pg_catalog.length(v_address) > 240 THEN
    RAISE EXCEPTION 'Branch address is too long.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organization_branches
  SET name = v_name,
      code = v_code,
      address = v_address,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_branch_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_branch',
    p_branch_id,
    'organization_branch_updated',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'code', v_before.code, 'address', v_before.address,
      'status', v_before.status, 'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'code', v_after.code, 'address', v_after.address,
      'status', v_after.status, 'archived_at', v_after.archived_at
    )
  );

  RETURN p_branch_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Branch name or code is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.archive_organization_branch_checked(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_branches%ROWTYPE;
  v_after public.organization_branches%ROWTYPE;
  v_count bigint;
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);

  SELECT branch.* INTO v_before
  FROM public.organization_branches AS branch
  WHERE branch.organization_id = p_organization_id
    AND branch.id = p_branch_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Branch was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NOT NULL THEN
    RETURN v_before.id;
  END IF;

  PERFORM member.id
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
    AND member.branch_id = p_branch_id
    AND member.role <> 'super_admin'
  ORDER BY member.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
    AND member.branch_id = p_branch_id
    AND member.role <> 'super_admin';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Reassign or remove % active ordinary membership% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM invitation.id
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.branch_id = p_branch_id
    AND invitation.role <> 'super_admin'
    AND invitation.status IN ('pending', 'send_failed')
  ORDER BY invitation.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.branch_id = p_branch_id
    AND invitation.role <> 'super_admin'
    AND invitation.status IN ('pending', 'send_failed');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Reassign or revoke % active invitation% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM property.id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.branch_id = p_branch_id
    AND property.archived_at IS NULL
  ORDER BY property.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.branch_id = p_branch_id
    AND property.archived_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Move or archive % active Propert% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN 'y' ELSE 'ies' END USING ERRCODE = '55000';
  END IF;

  PERFORM team.id
  FROM public.organization_teams AS team
  WHERE team.organization_id = p_organization_id
    AND team.branch_id = p_branch_id
    AND team.archived_at IS NULL
  ORDER BY team.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.organization_teams AS team
  WHERE team.organization_id = p_organization_id
    AND team.branch_id = p_branch_id
    AND team.archived_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Move or archive % active Team% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM relationship.id
  FROM public.person_branch_relationships AS relationship
  WHERE relationship.organization_id = p_organization_id
    AND relationship.branch_id = p_branch_id
    AND relationship.archived_at IS NULL
  ORDER BY relationship.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.person_branch_relationships AS relationship
  WHERE relationship.organization_id = p_organization_id
    AND relationship.branch_id = p_branch_id
    AND relationship.archived_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Archive % active Person relationship% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM task.id
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.branch_id = p_branch_id
    AND task.archived_at IS NULL
    AND task.status NOT IN ('completed', 'cancelled')
  ORDER BY task.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.branch_id = p_branch_id
    AND task.archived_at IS NULL
    AND task.status NOT IN ('completed', 'cancelled');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Complete, cancel, move, or archive % active Maintenance item% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM series.id
  FROM public.maintenance_recurrence_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.branch_id = p_branch_id
    AND series.lifecycle <> 'retired'
  ORDER BY series.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.maintenance_recurrence_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.branch_id = p_branch_id
    AND series.lifecycle <> 'retired';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Retire or move % active Maintenance recurrence% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM outbox.id
  FROM public.notification_outbox AS outbox
  WHERE outbox.organization_id = p_organization_id
    AND outbox.branch_id = p_branch_id
    AND outbox.status IN ('pending', 'processing', 'retry')
  ORDER BY outbox.id
  FOR UPDATE;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.notification_outbox AS outbox
  WHERE outbox.organization_id = p_organization_id
    AND outbox.branch_id = p_branch_id
    AND outbox.status IN ('pending', 'processing', 'retry');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Resolve % pending Maintenance notification% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  PERFORM manifest_item.id
  FROM public.organization_access_transition_manifest_items AS manifest_item
  JOIN public.organization_access_transition_manifests AS manifest
    ON manifest.organization_id = manifest_item.organization_id
   AND manifest.id = manifest_item.manifest_id
  WHERE manifest_item.organization_id = p_organization_id
    AND manifest_item.target_branch_id = p_branch_id
    AND manifest.status <> 'applied'
  ORDER BY manifest_item.id
  FOR UPDATE OF manifest_item;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.organization_access_transition_manifest_items AS manifest_item
  JOIN public.organization_access_transition_manifests AS manifest
    ON manifest.organization_id = manifest_item.organization_id
   AND manifest.id = manifest_item.manifest_id
  WHERE manifest_item.organization_id = p_organization_id
    AND manifest_item.target_branch_id = p_branch_id
    AND manifest.status <> 'applied';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Resolve % pending access transition record% before archiving this branch.',
      v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.archived_at IS NULL
    AND property.branch_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Resolve % Property without a branch before archiving this branch.', v_count
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.archived_at IS NULL
    AND task.status NOT IN ('completed', 'cancelled')
    AND task.branch_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Resolve % active Maintenance item without a branch before archiving this branch.', v_count
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.maintenance_recurrence_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.lifecycle <> 'retired'
    AND series.branch_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Resolve % active Maintenance recurrence without a branch before archiving this branch.', v_count
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id = p_organization_id
      AND authorization_state.ordinary_access_enabled
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id <> p_branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Keep at least one active branch while ordinary access is enabled.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_branches
  SET status = 'inactive',
      archived_at = pg_catalog.now(),
      archived_by = v_actor_id,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_branch_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_branch',
    p_branch_id,
    'organization_branch_archived',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'code', v_before.code, 'address', v_before.address,
      'status', v_before.status, 'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'code', v_after.code, 'address', v_after.address,
      'status', v_after.status, 'archived_at', v_after.archived_at
    )
  );

  RETURN p_branch_id;
END;
$$;

CREATE FUNCTION app_private.restore_organization_branch_checked(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_branches%ROWTYPE;
  v_after public.organization_branches%ROWTYPE;
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);

  SELECT branch.* INTO v_before
  FROM public.organization_branches AS branch
  WHERE branch.organization_id = p_organization_id
    AND branch.id = p_branch_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Branch was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NULL THEN
    RETURN v_before.id;
  END IF;

  UPDATE public.organization_branches
  SET status = 'active',
      archived_at = NULL,
      archived_by = NULL,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_branch_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_branch',
    p_branch_id,
    'organization_branch_restored',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'code', v_before.code, 'address', v_before.address,
      'status', v_before.status, 'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'code', v_after.code, 'address', v_after.address,
      'status', v_after.status, 'archived_at', v_after.archived_at
    )
  );

  RETURN p_branch_id;
END;
$$;

CREATE FUNCTION app_private.create_organization_team_checked(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_manager_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_team_id uuid;
  v_name text := app_private.normalized_structure_label(p_name);
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);
  IF pg_catalog.length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Team name is required.' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id = p_branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose an active branch in this organization.' USING ERRCODE = '23503';
  END IF;
  IF p_manager_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_manager_person_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose an active manager in this organization.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.organization_teams (
    organization_id, branch_id, name, manager_person_id, created_by, updated_by
  ) VALUES (
    p_organization_id, p_branch_id, v_name, p_manager_person_id, v_actor_id, v_actor_id
  ) RETURNING id INTO v_team_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_team',
    v_team_id,
    'organization_team_created',
    pg_catalog.jsonb_build_object(
      'name', v_name, 'branch_id', p_branch_id,
      'manager_person_id', p_manager_person_id, 'archived_at', NULL
    )
  );
  RETURN v_team_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Team name is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.update_organization_team_checked(
  p_organization_id uuid,
  p_team_id uuid,
  p_branch_id uuid,
  p_name text,
  p_manager_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_teams%ROWTYPE;
  v_after public.organization_teams%ROWTYPE;
  v_name text := app_private.normalized_structure_label(p_name);
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);
  SELECT team.* INTO v_before
  FROM public.organization_teams AS team
  WHERE team.organization_id = p_organization_id AND team.id = p_team_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Team was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived teams cannot be edited.' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Team name is required.' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id = p_branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose an active branch in this organization.' USING ERRCODE = '23503';
  END IF;
  IF p_manager_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_manager_person_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose an active manager in this organization.' USING ERRCODE = '23503';
  END IF;

  UPDATE public.organization_teams
  SET branch_id = p_branch_id,
      name = v_name,
      manager_person_id = p_manager_person_id,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_team_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_team',
    p_team_id,
    'organization_team_updated',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'branch_id', v_before.branch_id,
      'manager_person_id', v_before.manager_person_id,
      'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'branch_id', v_after.branch_id,
      'manager_person_id', v_after.manager_person_id,
      'archived_at', v_after.archived_at
    )
  );
  RETURN p_team_id;
END;
$$;

CREATE FUNCTION app_private.archive_organization_team_checked(
  p_organization_id uuid,
  p_team_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_teams%ROWTYPE;
  v_after public.organization_teams%ROWTYPE;
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);
  SELECT team.* INTO v_before
  FROM public.organization_teams AS team
  WHERE team.organization_id = p_organization_id AND team.id = p_team_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Team was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NOT NULL THEN
    RETURN v_before.id;
  END IF;

  -- No active schema object currently names organization_team.id. Keep this
  -- checked boundary so a future named dependency must add its blocker here.
  UPDATE public.organization_teams
  SET archived_at = pg_catalog.now(),
      archived_by = v_actor_id,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_team_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_team',
    p_team_id,
    'organization_team_archived',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'branch_id', v_before.branch_id,
      'manager_person_id', v_before.manager_person_id,
      'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'branch_id', v_after.branch_id,
      'manager_person_id', v_after.manager_person_id,
      'archived_at', v_after.archived_at
    )
  );
  RETURN p_team_id;
END;
$$;

CREATE FUNCTION app_private.restore_organization_team_checked(
  p_organization_id uuid,
  p_team_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_before public.organization_teams%ROWTYPE;
  v_after public.organization_teams%ROWTYPE;
BEGIN
  v_actor_id := app_private.lock_organization_structure_scope(p_organization_id);
  SELECT team.* INTO v_before
  FROM public.organization_teams AS team
  WHERE team.organization_id = p_organization_id AND team.id = p_team_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Team was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.archived_at IS NULL THEN
    RETURN v_before.id;
  END IF;
  IF v_before.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id = v_before.branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Restore the team branch first.' USING ERRCODE = '55000';
  END IF;
  IF v_before.manager_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = v_before.manager_person_id
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Restore or replace the team manager first.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_teams
  SET archived_at = NULL,
      archived_by = NULL,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = p_team_id
  RETURNING * INTO v_after;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'organization_team',
    p_team_id,
    'organization_team_restored',
    pg_catalog.jsonb_build_object(
      'name', v_before.name, 'branch_id', v_before.branch_id,
      'manager_person_id', v_before.manager_person_id,
      'archived_at', v_before.archived_at
    ),
    pg_catalog.jsonb_build_object(
      'name', v_after.name, 'branch_id', v_after.branch_id,
      'manager_person_id', v_after.manager_person_id,
      'archived_at', v_after.archived_at
    )
  );
  RETURN p_team_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Team name is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_branch(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_address text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.create_organization_branch_checked($1, $2, $3, $4);
$$;

CREATE FUNCTION public.update_organization_branch(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_code text,
  p_address text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.update_organization_branch_checked($1, $2, $3, $4, $5);
$$;

CREATE FUNCTION public.archive_organization_branch(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.archive_organization_branch_checked($1, $2);
$$;

CREATE FUNCTION public.restore_organization_branch(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.restore_organization_branch_checked($1, $2);
$$;

CREATE OR REPLACE FUNCTION public.create_organization_team(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_manager_person_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.create_organization_team_checked($1, $2, $3, $4);
$$;

CREATE FUNCTION public.update_organization_team(
  p_organization_id uuid,
  p_team_id uuid,
  p_branch_id uuid,
  p_name text,
  p_manager_person_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.update_organization_team_checked($1, $2, $3, $4, $5);
$$;

CREATE FUNCTION public.archive_organization_team(
  p_organization_id uuid,
  p_team_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.archive_organization_team_checked($1, $2);
$$;

CREATE FUNCTION public.restore_organization_team(
  p_organization_id uuid,
  p_team_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.restore_organization_team_checked($1, $2);
$$;

REVOKE ALL ON TABLE public.organization_branches, public.organization_teams
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.organization_branches, public.organization_teams
  TO authenticated;

REVOKE ALL ON FUNCTION app_private.lock_organization_structure_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.normalized_structure_label(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.create_organization_branch_checked(uuid,text,text,text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.update_organization_branch_checked(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.archive_organization_branch_checked(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.restore_organization_branch_checked(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.create_organization_team_checked(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.update_organization_team_checked(uuid,uuid,uuid,text,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.archive_organization_team_checked(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.restore_organization_team_checked(uuid,uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION app_private.create_organization_branch_checked(uuid,text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.update_organization_branch_checked(uuid,uuid,text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.archive_organization_branch_checked(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.restore_organization_branch_checked(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.create_organization_team_checked(uuid,uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.update_organization_team_checked(uuid,uuid,uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.archive_organization_team_checked(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.restore_organization_team_checked(uuid,uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_branch(uuid,text,text,text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_organization_branch(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_organization_branch(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.restore_organization_branch(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_organization_team(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_organization_team(uuid,uuid,uuid,text,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_organization_team(uuid,uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.restore_organization_team(uuid,uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_organization_branch(uuid,text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_branch(uuid,uuid,text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_organization_branch(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organization_branch(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_team(uuid,uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_team(uuid,uuid,uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_organization_team(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organization_team(uuid,uuid)
  TO authenticated;
