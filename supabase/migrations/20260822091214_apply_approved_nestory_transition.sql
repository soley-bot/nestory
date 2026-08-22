CREATE FUNCTION app_private.apply_approved_nestory_transition_20260822()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id constant uuid := '1221152a-3a7d-48f6-a109-45f2b2173813';
  v_branch_id constant uuid := 'a8120000-0000-4000-8000-000000000001';
  v_manifest_id constant uuid := '10700000-0000-4000-8000-000000000001';
  v_finance_manager_role_id constant uuid := '10700000-0000-4000-8000-000000000101';
  v_finance_member_role_id constant uuid := '10700000-0000-4000-8000-000000000102';
  v_operations_manager_role_id constant uuid := '10700000-0000-4000-8000-000000000103';
  v_operations_member_role_id constant uuid := '10700000-0000-4000-8000-000000000104';
  v_ordinary_access_enabled boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations AS organization_record
    WHERE organization_record.id = v_organization_id
      AND organization_record.slug = 'nestory'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.organizations AS organization_record
      WHERE organization_record.id = v_organization_id
         OR organization_record.slug = 'nestory'
    ) THEN
      RAISE EXCEPTION 'Approved Nestory transition organization identity does not match.'
        USING ERRCODE = '55000';
    END IF;

    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizations AS pilot_organization
    WHERE pilot_organization.slug = 'pilot'
  ) AND (
    SELECT count(*) <> 4
      OR count(*) FILTER (WHERE member.role = 'super_admin') <> 4
    FROM public.organization_members AS member
    JOIN public.organizations AS pilot_organization
      ON pilot_organization.id = member.organization_id
    WHERE pilot_organization.slug = 'pilot'
  ) THEN
    RAISE EXCEPTION 'Pilot preservation precondition does not match four Super Admin memberships.'
      USING ERRCODE = '55000';
  END IF;

  SELECT authorization_state.ordinary_access_enabled
  INTO v_ordinary_access_enabled
  FROM public.organization_authorization_states AS authorization_state
  WHERE authorization_state.organization_id = v_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved Nestory transition authorization state was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_ordinary_access_enabled THEN
    RAISE EXCEPTION 'Approved Nestory transition requires ordinary access to be contained.'
      USING ERRCODE = '55000';
  END IF;

  PERFORM branch.id
  FROM public.organization_branches AS branch
  WHERE branch.organization_id = v_organization_id
    AND branch.id = v_branch_id
    AND branch.code = 'SYN-PP-260812'
    AND branch.status = 'active'
    AND branch.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.organization_branches AS active_branch
    WHERE active_branch.organization_id = v_organization_id
      AND active_branch.status = 'active'
      AND active_branch.archived_at IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'Approved Nestory transition branch identity does not match the sole active branch.'
      USING ERRCODE = '55000';
  END IF;

  PERFORM member.id
  FROM public.organization_members AS member
  WHERE member.organization_id = v_organization_id
  ORDER BY member.id
  FOR UPDATE;

  IF (
    SELECT count(*)
    FROM public.organization_members AS member
    WHERE member.organization_id = v_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) <> 5 OR EXISTS (
    SELECT member.id, member.role
    FROM public.organization_members AS member
    WHERE member.organization_id = v_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
    EXCEPT
    SELECT approved.id, approved.role
    FROM (VALUES
      ('bd64e40e-dcf1-4067-896a-43f0fd79c389'::uuid, 'finance_manager'::text),
      ('4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484'::uuid, 'finance_member'::text),
      ('062393f4-3d01-4c84-8f28-052e15d6741a'::uuid, 'operations_manager'::text),
      ('5120be8d-a5b6-4897-bafc-f36fdc674582'::uuid, 'operations_member'::text),
      ('92696111-dabe-46c9-945f-b1532aea2a88'::uuid, 'operations_member'::text)
    ) AS approved(id, role)
  ) OR EXISTS (
    SELECT approved.id, approved.role
    FROM (VALUES
      ('bd64e40e-dcf1-4067-896a-43f0fd79c389'::uuid, 'finance_manager'::text),
      ('4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484'::uuid, 'finance_member'::text),
      ('062393f4-3d01-4c84-8f28-052e15d6741a'::uuid, 'operations_manager'::text),
      ('5120be8d-a5b6-4897-bafc-f36fdc674582'::uuid, 'operations_member'::text),
      ('92696111-dabe-46c9-945f-b1532aea2a88'::uuid, 'operations_member'::text)
    ) AS approved(id, role)
    EXCEPT
    SELECT member.id, member.role
    FROM public.organization_members AS member
    WHERE member.organization_id = v_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) THEN
    RAISE EXCEPTION 'Approved Nestory transition membership set does not match.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = v_organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) THEN
    RAISE EXCEPTION 'Approved Nestory transition requires zero legacy ordinary invitations.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = v_organization_id
      AND member.role = 'custom'
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = v_organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role = 'custom'
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_roles AS role_record
    WHERE role_record.organization_id = v_organization_id
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_access_transition_manifests AS manifest
    WHERE manifest.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'Approved Nestory transition requires an empty custom-role baseline.'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.organization_roles (id, organization_id, name)
  VALUES
    (v_finance_manager_role_id, v_organization_id, 'Finance Manager'),
    (v_finance_member_role_id, v_organization_id, 'Finance Member'),
    (v_operations_manager_role_id, v_organization_id, 'Operations Manager'),
    (v_operations_member_role_id, v_organization_id, 'Operations Member');

  INSERT INTO public.organization_role_permissions (
    organization_id,
    role_id,
    permission_key
  )
  SELECT v_organization_id, profile.role_id, profile.permission_key
  FROM (VALUES
    (v_finance_manager_role_id, 'leases.view'::public.organization_permission_key),
    (v_finance_manager_role_id, 'leases.prepare'::public.organization_permission_key),
    (v_finance_manager_role_id, 'leases.activate'::public.organization_permission_key),
    (v_finance_manager_role_id, 'leases.change_terms'::public.organization_permission_key),
    (v_finance_manager_role_id, 'leases.close'::public.organization_permission_key),
    (v_finance_manager_role_id, 'leases.archive'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.view'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.record_payments'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.approve_expenses'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.correct_records'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.close_periods'::public.organization_permission_key),
    (v_finance_manager_role_id, 'finance.publish'::public.organization_permission_key),
    (v_finance_member_role_id, 'leases.view'::public.organization_permission_key),
    (v_finance_member_role_id, 'finance.view'::public.organization_permission_key),
    (v_finance_member_role_id, 'finance.submit_expenses'::public.organization_permission_key),
    (v_operations_manager_role_id, 'maintenance.view'::public.organization_permission_key),
    (v_operations_manager_role_id, 'maintenance.create_assign'::public.organization_permission_key),
    (v_operations_manager_role_id, 'maintenance.complete'::public.organization_permission_key),
    (v_operations_manager_role_id, 'maintenance.review'::public.organization_permission_key),
    (v_operations_member_role_id, 'maintenance.view'::public.organization_permission_key),
    (v_operations_member_role_id, 'maintenance.complete'::public.organization_permission_key)
  ) AS profile(role_id, permission_key);

  INSERT INTO public.organization_access_transition_manifests (
    id,
    organization_id,
    status,
    manifest_fingerprint,
    expected_legacy_membership_count,
    expected_legacy_invitation_count,
    baseline_custom_membership_count,
    baseline_custom_invitation_count,
    baseline_custom_fingerprint,
    no_unlisted_conversion
  ) VALUES (
    v_manifest_id,
    v_organization_id,
    'staged',
    repeat('0', 64),
    5,
    0,
    0,
    0,
    encode(extensions.digest('', 'sha256'), 'hex'),
    true
  );

  INSERT INTO public.organization_access_transition_manifest_items (
    organization_id,
    manifest_id,
    source_kind,
    source_id,
    subject_fingerprint,
    legacy_role,
    target_branch_id,
    target_role_id,
    target_permission_keys,
    target_profile_fingerprint
  )
  SELECT
    v_organization_id,
    v_manifest_id,
    'membership',
    member.id,
    app_private.transition_subject_fingerprint(
      'membership',
      member.id,
      member.user_id::text
    ),
    member.role,
    v_branch_id,
    CASE member.role
      WHEN 'finance_manager' THEN v_finance_manager_role_id
      WHEN 'finance_member' THEN v_finance_member_role_id
      WHEN 'operations_manager' THEN v_operations_manager_role_id
      WHEN 'operations_member' THEN v_operations_member_role_id
    END,
    permission_profile.permission_keys,
    app_private.organization_permission_profile_fingerprint(
      permission_profile.permission_keys
    )
  FROM public.organization_members AS member
  CROSS JOIN LATERAL (
    SELECT array_agg(
      permission_record.permission_key
      ORDER BY permission_record.permission_key
    ) AS permission_keys
    FROM public.organization_role_permissions AS permission_record
    WHERE permission_record.organization_id = v_organization_id
      AND permission_record.role_id = CASE member.role
        WHEN 'finance_manager' THEN v_finance_manager_role_id
        WHEN 'finance_member' THEN v_finance_member_role_id
        WHEN 'operations_manager' THEN v_operations_manager_role_id
        WHEN 'operations_member' THEN v_operations_member_role_id
      END
  ) AS permission_profile
  WHERE member.organization_id = v_organization_id
    AND member.role IN (
      'finance_manager',
      'finance_member',
      'operations_manager',
      'operations_member'
    );

  UPDATE public.organization_access_transition_manifests AS manifest
  SET manifest_fingerprint =
    app_private.organization_transition_manifest_fingerprint(
      v_organization_id,
      v_manifest_id
    )
  WHERE manifest.organization_id = v_organization_id
    AND manifest.id = v_manifest_id;

  UPDATE public.organization_access_transition_manifests AS manifest
  SET status = 'approved'
  WHERE manifest.organization_id = v_organization_id
    AND manifest.id = v_manifest_id;

  UPDATE public.organization_members AS member
  SET role = 'custom',
    branch_id = v_branch_id,
    custom_role_id = CASE member.id
      WHEN 'bd64e40e-dcf1-4067-896a-43f0fd79c389'::uuid THEN v_finance_manager_role_id
      WHEN '4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484'::uuid THEN v_finance_member_role_id
      WHEN '062393f4-3d01-4c84-8f28-052e15d6741a'::uuid THEN v_operations_manager_role_id
      WHEN '5120be8d-a5b6-4897-bafc-f36fdc674582'::uuid THEN v_operations_member_role_id
      WHEN '92696111-dabe-46c9-945f-b1532aea2a88'::uuid THEN v_operations_member_role_id
    END
  WHERE member.organization_id = v_organization_id
    AND member.id IN (
      'bd64e40e-dcf1-4067-896a-43f0fd79c389',
      '4e9f0b22-1bbc-4ad1-8ef9-d75ce380d484',
      '062393f4-3d01-4c84-8f28-052e15d6741a',
      '5120be8d-a5b6-4897-bafc-f36fdc674582',
      '92696111-dabe-46c9-945f-b1532aea2a88'
    );

  INSERT INTO public.activity_logs (
    organization_id,
    branch_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  SELECT
    manifest_item.organization_id,
    NULL,
    NULL,
    'organization_member',
    manifest_item.source_id,
    'access_transition_applied',
    jsonb_build_object('role', manifest_item.legacy_role),
    jsonb_build_object(
      'role', 'custom',
      'branch_id', manifest_item.target_branch_id,
      'custom_role_id', manifest_item.target_role_id,
      'manifest_id', manifest_item.manifest_id
    )
  FROM public.organization_access_transition_manifest_items AS manifest_item
  WHERE manifest_item.organization_id = v_organization_id
    AND manifest_item.manifest_id = v_manifest_id;

  UPDATE public.organization_access_transition_manifests AS manifest
  SET status = 'applied'
  WHERE manifest.organization_id = v_organization_id
    AND manifest.id = v_manifest_id;

  UPDATE public.organization_authorization_states AS authorization_state
  SET ordinary_access_enabled = true
  WHERE authorization_state.organization_id = v_organization_id;
END;
$$;

COMMENT ON FUNCTION app_private.apply_approved_nestory_transition_20260822()
IS 'Pinned, fail-closed release transition for the five user-approved Nestory legacy memberships.';

REVOKE ALL ON FUNCTION app_private.apply_approved_nestory_transition_20260822()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT app_private.apply_approved_nestory_transition_20260822();
