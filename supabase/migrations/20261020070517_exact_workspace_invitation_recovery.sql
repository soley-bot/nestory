-- Renew only a reviewed, expired first-administrator reservation. The existing
-- create-or-resume function remains unchanged; this wrapper binds its resume
-- branch to exact identities and expected state in one atomic transaction.
CREATE FUNCTION public.resume_client_workspace_invitation_exact(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_expected_name text,
  p_expected_slug text,
  p_expected_email text,
  p_expected_expires_at timestamptz,
  p_expected_authorization_version bigint
)
RETURNS TABLE (
  organization_id uuid,
  invitation_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization public.organizations%ROWTYPE;
  v_authorization public.organization_authorization_states%ROWTYPE;
  v_invitation public.organization_invitations%ROWTYPE;
  v_after_invitation public.organization_invitations%ROWTYPE;
  v_result record;
  v_before_invitations jsonb;
  v_before_audit jsonb;
  v_after_audit jsonb;
  v_new_audit public.activity_logs%ROWTYPE;
  v_new_audit_count bigint;
  v_result_count integer := 0;
  v_new_expires_at timestamptz := transaction_timestamp() + interval '1 hour';
BEGIN
  IF NOT app_private.request_is_service_role() THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_invitation_id IS NULL
    OR nullif(trim(p_expected_name), '') IS NULL
    OR nullif(trim(p_expected_slug), '') IS NULL
    OR nullif(trim(p_expected_email), '') IS NULL
    OR p_expected_expires_at IS NULL
    OR p_expected_authorization_version IS NULL
    OR p_expected_authorization_version < 1 THEN
    RAISE EXCEPTION 'Exact invitation renewal requires every expected value'
      USING ERRCODE = '22023';
  END IF;

  -- Provisioning locks organization before invitation, while acceptance locks
  -- authorization state before invitation and later references organization.
  -- NOWAIT on every acquisition avoids either lock-order inversion. Contention
  -- propagates 55P03 before calling the writer; callers must reconcile, not retry.
  SELECT o.* INTO v_organization
  FROM public.organizations AS o
  WHERE o.id = p_organization_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND
    OR v_organization.name IS DISTINCT FROM p_expected_name
    OR v_organization.slug IS DISTINCT FROM p_expected_slug THEN
    RAISE EXCEPTION 'Workspace invitation no longer matches the reviewed reservation'
      USING ERRCODE = '55000';
  END IF;

  SELECT s.* INTO v_authorization
  FROM public.organization_authorization_states AS s
  WHERE s.organization_id = p_organization_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND
    OR v_authorization.version IS DISTINCT FROM p_expected_authorization_version
    OR v_authorization.ordinary_access_enabled IS DISTINCT FROM false
    OR v_authorization.transition_manifest_required IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Workspace invitation no longer matches the reviewed reservation'
      USING ERRCODE = '55000';
  END IF;

  PERFORM i.id
  FROM public.organization_invitations AS i
  WHERE i.organization_id = p_organization_id
  ORDER BY i.id
  FOR UPDATE NOWAIT;

  SELECT i.* INTO v_invitation
  FROM public.organization_invitations AS i
  WHERE i.id = p_invitation_id
    AND i.organization_id = p_organization_id;

  IF NOT FOUND
    OR v_invitation.email IS DISTINCT FROM p_expected_email
    OR v_invitation.role IS DISTINCT FROM 'super_admin'
    OR v_invitation.status IS DISTINCT FROM 'pending'
    OR v_invitation.branch_id IS NOT NULL
    OR v_invitation.custom_role_id IS NOT NULL
    OR v_invitation.person_id IS NOT NULL
    OR v_invitation.invited_by IS NOT NULL
    OR v_invitation.auth_user_id IS NOT NULL
    OR v_invitation.accepted_at IS NOT NULL
    OR v_invitation.revoked_at IS NOT NULL
    OR v_invitation.delivery_method IS NOT NULL
    OR v_invitation.last_sent_at IS NOT NULL
    OR v_invitation.expires_at IS DISTINCT FROM p_expected_expires_at
    OR v_invitation.expires_at > clock_timestamp()
    OR v_new_expires_at <= clock_timestamp()
    OR EXISTS (
      SELECT 1 FROM public.organization_members AS m
      WHERE m.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_branches AS b
      WHERE b.organization_id = p_organization_id
    )
    OR (
      SELECT count(*) FROM public.organization_invitations AS i
      WHERE i.organization_id = p_organization_id
        AND i.email = p_expected_email
        AND i.role = 'super_admin'
        AND i.status IN ('pending', 'send_failed', 'expired')
    ) <> 1 THEN
    RAISE EXCEPTION 'Workspace invitation no longer matches the reviewed reservation'
      USING ERRCODE = '55000';
  END IF;

  SELECT coalesce(jsonb_object_agg(i.id::text, to_jsonb(i)), '{}'::jsonb)
  INTO v_before_invitations
  FROM public.organization_invitations AS i
  WHERE i.organization_id = p_organization_id;

  SELECT coalesce(jsonb_object_agg(a.id::text, to_jsonb(a)), '{}'::jsonb)
  INTO v_before_audit
  FROM public.activity_logs AS a
  WHERE a.organization_id = p_organization_id;

  -- Every precondition above is checked with locks held. The only writer is the
  -- established provisioner, called once. Any exception below rolls it back.
  FOR v_result IN
    SELECT * FROM public.provision_client_workspace(
      p_expected_name, p_expected_slug, p_expected_email
    )
  LOOP
    v_result_count := v_result_count + 1;
    IF v_result.organization_id IS DISTINCT FROM p_organization_id
      OR v_result.invitation_id IS DISTINCT FROM p_invitation_id
      OR v_result.organization_name IS DISTINCT FROM p_expected_name
      OR v_result.workspace_slug IS DISTINCT FROM p_expected_slug
      OR v_result.invited_email IS DISTINCT FROM p_expected_email
      OR v_result.invitation_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Workspace invitation renewal postcondition failed'
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  SELECT i.* INTO v_after_invitation
  FROM public.organization_invitations AS i
  WHERE i.id = p_invitation_id AND i.organization_id = p_organization_id;

  SELECT count(*) INTO v_new_audit_count
  FROM public.activity_logs AS a
  WHERE a.organization_id = p_organization_id
    AND NOT (v_before_audit ? a.id::text);
  SELECT a.* INTO v_new_audit
  FROM public.activity_logs AS a
  WHERE a.organization_id = p_organization_id
    AND NOT (v_before_audit ? a.id::text)
  LIMIT 1;
  SELECT coalesce(jsonb_object_agg(a.id::text, to_jsonb(a)), '{}'::jsonb)
  INTO v_after_audit
  FROM public.activity_logs AS a
  WHERE a.organization_id = p_organization_id
    AND a.id IS DISTINCT FROM v_new_audit.id;

  IF v_result_count <> 1
    OR v_after_invitation.id IS DISTINCT FROM p_invitation_id
    OR v_after_invitation.expires_at IS DISTINCT FROM v_new_expires_at
    OR v_after_invitation.expires_at <= clock_timestamp()
    OR v_after_invitation.invited_at IS DISTINCT FROM transaction_timestamp()
    OR v_after_invitation.updated_at IS DISTINCT FROM transaction_timestamp()
    OR v_after_invitation.delivery_error IS NOT NULL
    OR (to_jsonb(v_after_invitation) - ARRAY['invited_at', 'expires_at', 'updated_at', 'delivery_error'])
      IS DISTINCT FROM
      (to_jsonb(v_invitation) - ARRAY['invited_at', 'expires_at', 'updated_at', 'delivery_error'])
    OR (
      SELECT coalesce(jsonb_object_agg(i.id::text, to_jsonb(i)), '{}'::jsonb)
      FROM public.organization_invitations AS i
      WHERE i.organization_id = p_organization_id AND i.id <> p_invitation_id
    ) IS DISTINCT FROM (v_before_invitations - p_invitation_id::text)
    OR (
      SELECT to_jsonb(o) FROM public.organizations AS o WHERE o.id = p_organization_id
    ) IS DISTINCT FROM to_jsonb(v_organization)
    OR (
      SELECT to_jsonb(s) FROM public.organization_authorization_states AS s
      WHERE s.organization_id = p_organization_id
    ) IS DISTINCT FROM to_jsonb(v_authorization)
    OR EXISTS (
      SELECT 1 FROM public.organization_members AS m
      WHERE m.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_branches AS b
      WHERE b.organization_id = p_organization_id
    )
    OR v_new_audit_count <> 1
    OR v_new_audit.entity_type IS DISTINCT FROM 'organization_invitation'
    OR v_new_audit.entity_id IS DISTINCT FROM p_invitation_id
    OR v_new_audit.actor_id IS NOT NULL
    OR v_new_audit.action IS DISTINCT FROM 'workspace_provisioning_resumed'
    OR v_new_audit.previous_values IS NOT NULL
    OR v_new_audit.new_values IS DISTINCT FROM
      jsonb_build_object('email', p_expected_email, 'role', 'super_admin')
    OR v_after_audit IS DISTINCT FROM v_before_audit THEN
    RAISE EXCEPTION 'Workspace invitation renewal postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  RETURN QUERY SELECT p_organization_id, p_invitation_id, v_after_invitation.expires_at;
END;
$$;

ALTER FUNCTION public.resume_client_workspace_invitation_exact(
  uuid, uuid, text, text, text, timestamptz, bigint
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resume_client_workspace_invitation_exact(
  uuid, uuid, text, text, text, timestamptz, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_client_workspace_invitation_exact(
  uuid, uuid, text, text, text, timestamptz, bigint
) TO service_role;

COMMENT ON FUNCTION public.resume_client_workspace_invitation_exact(
  uuid, uuid, text, text, text, timestamptz, bigint
) IS 'Service-only exact-ID and expected-expiry renewal of an expired, undelivered first-admin reservation. No email, Auth user, membership, branch, or access activation. No automatic retry.';
