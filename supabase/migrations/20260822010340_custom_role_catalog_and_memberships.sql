CREATE TYPE public.organization_permission_key AS ENUM (
  'properties.view',
  'properties.write',
  'properties.archive',
  'people.view',
  'people.write',
  'people.archive',
  'leases.view',
  'leases.prepare',
  'leases.activate',
  'leases.change_terms',
  'leases.close',
  'leases.archive',
  'finance.view',
  'finance.record_payments',
  'finance.submit_expenses',
  'finance.approve_expenses',
  'finance.correct_records',
  'finance.close_periods',
  'finance.publish',
  'maintenance.view',
  'maintenance.create_assign',
  'maintenance.complete',
  'maintenance.review'
);

CREATE TABLE public.organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_roles_name_not_blank_check
    CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT organization_roles_name_normalized_check
    CHECK (name = btrim(regexp_replace(name, '\s+', ' ', 'g'))),
  CONSTRAINT organization_roles_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT organization_roles_version_check
    CHECK (version > 0),
  CONSTRAINT organization_roles_archive_state_check
    CHECK (
      (status = 'active' AND archived_at IS NULL AND archived_by IS NULL)
      OR (status = 'archived' AND archived_at IS NOT NULL)
    ),
  CONSTRAINT organization_roles_organization_id_id_key
    UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX organization_roles_active_name_uidx
  ON public.organization_roles (organization_id, lower(name))
  WHERE status = 'active';

CREATE INDEX organization_roles_org_status_name_idx
  ON public.organization_roles (organization_id, status, name);

CREATE TABLE public.organization_role_permissions (
  organization_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_key public.organization_permission_key NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_role_permissions_pkey
    PRIMARY KEY (role_id, permission_key),
  CONSTRAINT organization_role_permissions_role_organization_fk
    FOREIGN KEY (organization_id, role_id)
    REFERENCES public.organization_roles(organization_id, id)
    ON DELETE CASCADE
);

CREATE INDEX organization_role_permissions_org_role_idx
  ON public.organization_role_permissions (organization_id, role_id);

CREATE TABLE public.organization_authorization_states (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ordinary_access_enabled boolean NOT NULL DEFAULT false,
  transition_manifest_required boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_authorization_states_version_check
    CHECK (version > 0)
);

CREATE TABLE public.organization_access_transition_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'staged',
  manifest_fingerprint text NOT NULL,
  expected_legacy_membership_count integer NOT NULL,
  expected_legacy_invitation_count integer NOT NULL,
  baseline_custom_membership_count integer NOT NULL DEFAULT 0,
  baseline_custom_invitation_count integer NOT NULL DEFAULT 0,
  baseline_custom_fingerprint text NOT NULL,
  no_unlisted_conversion boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_access_transition_manifests_organization_key
    UNIQUE (organization_id),
  CONSTRAINT organization_access_transition_manifests_organization_id_id_key
    UNIQUE (organization_id, id),
  CONSTRAINT organization_access_transition_manifests_status_check
    CHECK (status IN ('staged', 'approved', 'applied')),
  CONSTRAINT organization_access_transition_manifests_fingerprint_check
    CHECK (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT org_access_manifests_baseline_fingerprint_check
    CHECK (baseline_custom_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT organization_access_transition_manifests_counts_check
    CHECK (
      expected_legacy_membership_count >= 0
      AND expected_legacy_invitation_count >= 0
      AND baseline_custom_membership_count >= 0
      AND baseline_custom_invitation_count >= 0
      AND expected_legacy_membership_count + expected_legacy_invitation_count > 0
    ),
  CONSTRAINT organization_access_transition_manifests_no_unlisted_check
    CHECK (no_unlisted_conversion),
  CONSTRAINT organization_access_transition_manifests_version_check
    CHECK (version > 0),
  CONSTRAINT organization_access_transition_manifests_lifecycle_check
    CHECK (
      (status = 'staged' AND approved_at IS NULL AND applied_at IS NULL)
      OR (status = 'approved' AND approved_at IS NOT NULL AND applied_at IS NULL)
      OR (status = 'applied' AND approved_at IS NOT NULL AND applied_at IS NOT NULL)
    )
);

CREATE INDEX organization_access_transition_manifests_org_status_idx
  ON public.organization_access_transition_manifests (organization_id, status);

CREATE TABLE public.organization_access_transition_manifest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  subject_fingerprint text NOT NULL,
  legacy_role text NOT NULL,
  target_branch_id uuid NOT NULL,
  target_role_id uuid NOT NULL,
  target_permission_keys public.organization_permission_key[] NOT NULL,
  target_profile_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_access_transition_manifest_items_manifest_fk
    FOREIGN KEY (organization_id, manifest_id)
    REFERENCES public.organization_access_transition_manifests(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT organization_access_transition_manifest_items_branch_fk
    FOREIGN KEY (organization_id, target_branch_id)
    REFERENCES public.organization_branches(organization_id, id),
  CONSTRAINT organization_access_transition_manifest_items_role_fk
    FOREIGN KEY (organization_id, target_role_id)
    REFERENCES public.organization_roles(organization_id, id),
  CONSTRAINT organization_access_transition_manifest_items_source_key
    UNIQUE (manifest_id, source_kind, source_id),
  CONSTRAINT organization_access_transition_manifest_items_source_kind_check
    CHECK (source_kind IN ('membership', 'invitation')),
  CONSTRAINT organization_access_transition_manifest_items_legacy_role_check
    CHECK (
      legacy_role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
    ),
  CONSTRAINT org_access_manifest_items_subject_fingerprint_check
    CHECK (subject_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT org_access_manifest_items_profile_fingerprint_check
    CHECK (target_profile_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT org_access_manifest_items_permission_keys_check
    CHECK (cardinality(target_permission_keys) > 0)
);

CREATE INDEX organization_access_transition_manifest_items_org_manifest_idx
  ON public.organization_access_transition_manifest_items (organization_id, manifest_id);

CREATE INDEX org_access_manifest_items_branch_role_idx
  ON public.organization_access_transition_manifest_items (
    organization_id,
    target_branch_id,
    target_role_id
  );

ALTER TABLE public.organization_members
  ADD COLUMN custom_role_id uuid;

ALTER TABLE public.organization_invitations
  ADD COLUMN custom_role_id uuid;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_custom_role_organization_fk
  FOREIGN KEY (organization_id, custom_role_id)
  REFERENCES public.organization_roles(organization_id, id);

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_custom_role_organization_fk
  FOREIGN KEY (organization_id, custom_role_id)
  REFERENCES public.organization_roles(organization_id, id);

CREATE INDEX organization_members_org_custom_role_id_idx
  ON public.organization_members (organization_id, custom_role_id)
  WHERE custom_role_id IS NOT NULL;

CREATE INDEX organization_invitations_org_custom_role_id_idx
  ON public.organization_invitations (organization_id, custom_role_id)
  WHERE custom_role_id IS NOT NULL;

ALTER TABLE public.organization_members
  DROP CONSTRAINT organization_members_role_check,
  DROP CONSTRAINT organization_members_role_scope_check;

ALTER TABLE public.organization_invitations
  DROP CONSTRAINT organization_invitations_role_check,
  DROP CONSTRAINT organization_invitations_role_scope_check;

CREATE OR REPLACE FUNCTION app_private.workspace_role_scope_is_valid(
  p_role text,
  p_branch_id uuid,
  p_person_id uuid,
  p_custom_role_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_role = 'super_admin'
      THEN p_branch_id IS NULL
        AND p_person_id IS NULL
        AND p_custom_role_id IS NULL
    WHEN p_role IN ('finance_manager', 'finance_member')
      THEN p_branch_id IS NULL
        AND p_person_id IS NULL
        AND p_custom_role_id IS NULL
    WHEN p_role IN ('operations_manager', 'operations_member')
      THEN p_branch_id IS NOT NULL
        AND p_person_id IS NOT NULL
        AND p_custom_role_id IS NULL
    WHEN p_role = 'custom'
      THEN p_branch_id IS NOT NULL
        AND p_custom_role_id IS NOT NULL
    ELSE false
  END;
$$;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
    CHECK (
      role IN (
        'super_admin',
        'custom',
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
    ),
  ADD CONSTRAINT organization_members_role_scope_check
    CHECK (
      app_private.workspace_role_scope_is_valid(
        role,
        branch_id,
        person_id,
        custom_role_id
      )
    );

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_role_check
    CHECK (
      role IN (
        'super_admin',
        'custom',
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
    ),
  ADD CONSTRAINT organization_invitations_role_scope_check
    CHECK (
      app_private.workspace_role_scope_is_valid(
        role,
        branch_id,
        person_id,
        custom_role_id
      )
    );

CREATE FUNCTION app_private.ensure_organization_authorization_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.organization_authorization_states (
    organization_id,
    created_by,
    updated_by
  )
  VALUES (
    NEW.id,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_authorization_state_after_insert
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_organization_authorization_state();

INSERT INTO public.organization_authorization_states (organization_id)
SELECT organization.id
FROM public.organizations AS organization
ON CONFLICT (organization_id) DO NOTHING;

UPDATE public.organization_authorization_states AS authorization_state
SET transition_manifest_required = true
WHERE EXISTS (
  SELECT 1
  FROM public.organization_members AS member
  WHERE member.organization_id = authorization_state.organization_id
    AND member.role IN (
      'finance_manager',
      'finance_member',
      'operations_manager',
      'operations_member'
    )
)
OR EXISTS (
  SELECT 1
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = authorization_state.organization_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.role IN (
      'finance_manager',
      'finance_member',
      'operations_manager',
      'operations_member'
    )
);

CREATE FUNCTION app_private.organization_permission_profile_fingerprint(
  p_permission_keys public.organization_permission_key[]
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(
      coalesce(
        array_to_string(
          ARRAY(
            SELECT DISTINCT permission_key
            FROM unnest(
              coalesce(
                p_permission_keys,
                '{}'::public.organization_permission_key[]
              )
            ) AS permission_key
            ORDER BY permission_key
          ),
          ','
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE FUNCTION app_private.transition_subject_fingerprint(
  p_source_kind text,
  p_source_id uuid,
  p_identity text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(
      lower(btrim(coalesce(p_source_kind, '')))
        || ':' || coalesce(p_source_id::text, '')
        || ':' || btrim(coalesce(p_identity, '')),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE FUNCTION app_private.organization_transition_manifest_fingerprint(
  p_organization_id uuid,
  p_manifest_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(
      coalesce(
        string_agg(
          concat_ws(
            '|',
            manifest_item.source_kind,
            manifest_item.source_id::text,
            manifest_item.subject_fingerprint,
            manifest_item.legacy_role,
            manifest_item.target_branch_id::text,
            manifest_item.target_role_id::text,
            array_to_string(manifest_item.target_permission_keys, ','),
            manifest_item.target_profile_fingerprint
          ),
          E'\n'
          ORDER BY manifest_item.source_kind, manifest_item.source_id
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  FROM public.organization_access_transition_manifest_items AS manifest_item
  WHERE manifest_item.organization_id = p_organization_id
    AND manifest_item.manifest_id = p_manifest_id;
$$;

CREATE FUNCTION app_private.organization_custom_assignment_baseline_fingerprint(
  p_organization_id uuid,
  p_manifest_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(
      coalesce(
        string_agg(
          baseline.assignment_fingerprint,
          E'\n'
          ORDER BY baseline.assignment_fingerprint
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  FROM (
    SELECT concat_ws(
      '|',
      'membership',
      member.id::text,
      app_private.transition_subject_fingerprint(
        'membership',
        member.id,
        member.user_id::text
      ),
      member.branch_id::text,
      member.custom_role_id::text
    ) AS assignment_fingerprint
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role = 'custom'
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_access_transition_manifest_items AS manifest_item
        WHERE manifest_item.organization_id = p_organization_id
          AND manifest_item.manifest_id = p_manifest_id
          AND manifest_item.source_kind = 'membership'
          AND manifest_item.source_id = member.id
      )

    UNION ALL

    SELECT concat_ws(
      '|',
      'invitation',
      invitation.id::text,
      app_private.transition_subject_fingerprint(
        'invitation',
        invitation.id,
        lower(btrim(invitation.email))
      ),
      invitation.branch_id::text,
      invitation.custom_role_id::text
    ) AS assignment_fingerprint
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.role = 'custom'
      AND invitation.status IN ('pending', 'send_failed')
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_access_transition_manifest_items AS manifest_item
        WHERE manifest_item.organization_id = p_organization_id
          AND manifest_item.manifest_id = p_manifest_id
          AND manifest_item.source_kind = 'invitation'
          AND manifest_item.source_id = invitation.id
      )
  ) AS baseline;
$$;

CREATE FUNCTION app_private.lock_organization_authorization_scope(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_role_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.organization_authorization_states AS authorization_state
  WHERE authorization_state.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization authorization state was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id = p_branch_id
    FOR UPDATE;
  END IF;

  IF p_role_id IS NOT NULL THEN
    PERFORM 1
    FROM public.organization_roles AS role_record
    WHERE role_record.organization_id = p_organization_id
      AND role_record.id = p_role_id
    FOR UPDATE;

    PERFORM 1
    FROM public.organization_role_permissions AS permission_record
    WHERE permission_record.organization_id = p_organization_id
      AND permission_record.role_id = p_role_id
    ORDER BY permission_record.permission_key
    FOR UPDATE;
  END IF;
END;
$$;

COMMENT ON FUNCTION app_private.lock_organization_authorization_scope(uuid, uuid, uuid)
IS 'Authorization lock order: organization authorization state, branch, role, then role permissions.';

CREATE FUNCTION app_private.lock_current_organization_membership(
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM member.id
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
    AND member.user_id = (SELECT auth.uid())
  FOR UPDATE;
END;
$$;

COMMENT ON FUNCTION app_private.lock_current_organization_membership(uuid)
IS 'Authorization actor lock: current organization membership row after authorization state and before authority assertion.';

CREATE FUNCTION app_private.mark_transition_manifest_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role NOT IN (
    'finance_manager',
    'finance_member',
    'operations_manager',
    'operations_member'
  ) OR (
    TG_TABLE_NAME = 'organization_invitations'
    AND (to_jsonb(NEW) ->> 'status') NOT IN ('pending', 'send_failed')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM app_private.lock_organization_authorization_scope(
    NEW.organization_id,
    NULL,
    NULL
  );

  UPDATE public.organization_authorization_states AS authorization_state
  SET
    transition_manifest_required = true,
    version = authorization_state.version + 1,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE authorization_state.organization_id = NEW.organization_id
    AND NOT authorization_state.transition_manifest_required;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_members_mark_transition_manifest_required
BEFORE INSERT OR UPDATE OF organization_id, role
ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION app_private.mark_transition_manifest_required();

CREATE TRIGGER organization_invitations_mark_transition_manifest_required
BEFORE INSERT OR UPDATE OF organization_id, role, status
ON public.organization_invitations
FOR EACH ROW
EXECUTE FUNCTION app_private.mark_transition_manifest_required();

CREATE FUNCTION app_private.assert_transition_manifest_targets(
  p_organization_id uuid,
  p_manifest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organization_access_transition_manifest_items AS manifest_item
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = manifest_item.organization_id
     AND branch.id = manifest_item.target_branch_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id = manifest_item.organization_id
     AND role_record.id = manifest_item.target_role_id
    WHERE manifest_item.organization_id = p_organization_id
      AND manifest_item.manifest_id = p_manifest_id
      AND (
        branch.id IS NULL
        OR branch.status <> 'active'
        OR branch.archived_at IS NOT NULL
        OR role_record.id IS NULL
        OR role_record.status <> 'active'
        OR manifest_item.target_permission_keys IS DISTINCT FROM (
          SELECT array_agg(
            permission_record.permission_key
            ORDER BY permission_record.permission_key
          )
          FROM public.organization_role_permissions AS permission_record
          WHERE permission_record.organization_id = manifest_item.organization_id
            AND permission_record.role_id = manifest_item.target_role_id
        )
        OR manifest_item.target_profile_fingerprint IS DISTINCT FROM
          app_private.organization_permission_profile_fingerprint(
            manifest_item.target_permission_keys
          )
      )
  ) THEN
    RAISE EXCEPTION 'Transition manifest target branch, role, or permission profile is not exact and active.'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION app_private.assert_transition_manifest_approvable(
  p_organization_id uuid,
  p_manifest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manifest public.organization_access_transition_manifests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_manifest
  FROM public.organization_access_transition_manifests AS manifest
  WHERE manifest.organization_id = p_organization_id
    AND manifest.id = p_manifest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transition manifest was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_manifest.expected_legacy_membership_count <> (
    SELECT count(*)
    FROM public.organization_access_transition_manifest_items AS manifest_item
    WHERE manifest_item.organization_id = p_organization_id
      AND manifest_item.manifest_id = p_manifest_id
      AND manifest_item.source_kind = 'membership'
  ) OR v_manifest.expected_legacy_invitation_count <> (
    SELECT count(*)
    FROM public.organization_access_transition_manifest_items AS manifest_item
    WHERE manifest_item.organization_id = p_organization_id
      AND manifest_item.manifest_id = p_manifest_id
      AND manifest_item.source_kind = 'invitation'
  ) OR v_manifest.expected_legacy_membership_count <> (
    SELECT count(*)
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) OR v_manifest.expected_legacy_invitation_count <> (
    SELECT count(*)
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_access_transition_manifest_items AS manifest_item
        WHERE manifest_item.organization_id = member.organization_id
          AND manifest_item.manifest_id = p_manifest_id
          AND manifest_item.source_kind = 'membership'
          AND manifest_item.source_id = member.id
          AND manifest_item.legacy_role = member.role
          AND manifest_item.subject_fingerprint =
            app_private.transition_subject_fingerprint(
              'membership',
              member.id,
              member.user_id::text
            )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_access_transition_manifest_items AS manifest_item
        WHERE manifest_item.organization_id = invitation.organization_id
          AND manifest_item.manifest_id = p_manifest_id
          AND manifest_item.source_kind = 'invitation'
          AND manifest_item.source_id = invitation.id
          AND manifest_item.legacy_role = invitation.role
          AND manifest_item.subject_fingerprint =
            app_private.transition_subject_fingerprint(
              'invitation',
              invitation.id,
              lower(btrim(invitation.email))
            )
      )
  ) THEN
    RAISE EXCEPTION 'Transition manifest does not enumerate every legacy ordinary assignment.'
      USING ERRCODE = '55000';
  END IF;

  IF v_manifest.baseline_custom_membership_count <> (
    SELECT count(*)
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role = 'custom'
  ) OR v_manifest.baseline_custom_invitation_count <> (
    SELECT count(*)
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.role = 'custom'
      AND invitation.status IN ('pending', 'send_failed')
  ) OR v_manifest.baseline_custom_fingerprint IS DISTINCT FROM
    app_private.organization_custom_assignment_baseline_fingerprint(
      p_organization_id,
      p_manifest_id
    ) THEN
    RAISE EXCEPTION 'Transition manifest does not match the exact custom assignment baseline.'
      USING ERRCODE = '55000';
  END IF;

  IF v_manifest.manifest_fingerprint IS DISTINCT FROM
    app_private.organization_transition_manifest_fingerprint(
      p_organization_id,
      p_manifest_id
    ) THEN
    RAISE EXCEPTION 'Transition manifest fingerprint does not match its exact items.'
      USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.assert_transition_manifest_targets(
    p_organization_id,
    p_manifest_id
  );
END;
$$;

CREATE FUNCTION app_private.assert_transition_manifest_applied(
  p_organization_id uuid,
  p_manifest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manifest public.organization_access_transition_manifests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_manifest
  FROM public.organization_access_transition_manifests AS manifest
  WHERE manifest.organization_id = p_organization_id
    AND manifest.id = p_manifest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transition manifest was not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) THEN
    RAISE EXCEPTION 'Transition application still contains a legacy ordinary assignment.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_access_transition_manifest_items AS manifest_item
    LEFT JOIN public.organization_members AS member
      ON manifest_item.source_kind = 'membership'
     AND member.organization_id = manifest_item.organization_id
     AND member.id = manifest_item.source_id
    LEFT JOIN public.organization_invitations AS invitation
      ON manifest_item.source_kind = 'invitation'
     AND invitation.organization_id = manifest_item.organization_id
     AND invitation.id = manifest_item.source_id
    WHERE manifest_item.organization_id = p_organization_id
      AND manifest_item.manifest_id = p_manifest_id
      AND (
        (
          manifest_item.source_kind = 'membership'
          AND (
            member.id IS NULL
            OR member.role <> 'custom'
            OR member.branch_id IS DISTINCT FROM manifest_item.target_branch_id
            OR member.custom_role_id IS DISTINCT FROM manifest_item.target_role_id
            OR manifest_item.subject_fingerprint IS DISTINCT FROM
              app_private.transition_subject_fingerprint(
                'membership',
                member.id,
                member.user_id::text
              )
          )
        )
        OR (
          manifest_item.source_kind = 'invitation'
          AND (
            invitation.id IS NULL
            OR invitation.status NOT IN ('pending', 'send_failed')
            OR invitation.role <> 'custom'
            OR invitation.branch_id IS DISTINCT FROM manifest_item.target_branch_id
            OR invitation.custom_role_id IS DISTINCT FROM manifest_item.target_role_id
            OR manifest_item.subject_fingerprint IS DISTINCT FROM
              app_private.transition_subject_fingerprint(
                'invitation',
                invitation.id,
                lower(btrim(invitation.email))
              )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Transition application does not match every approved assignment.'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT count(*)
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role = 'custom'
  ) <> v_manifest.baseline_custom_membership_count
    + v_manifest.expected_legacy_membership_count
  OR (
    SELECT count(*)
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.role = 'custom'
      AND invitation.status IN ('pending', 'send_failed')
  ) <> v_manifest.baseline_custom_invitation_count
    + v_manifest.expected_legacy_invitation_count
  OR v_manifest.baseline_custom_fingerprint IS DISTINCT FROM
    app_private.organization_custom_assignment_baseline_fingerprint(
      p_organization_id,
      p_manifest_id
    ) THEN
    RAISE EXCEPTION 'Transition application includes an unlisted custom assignment.'
      USING ERRCODE = '55000';
  END IF;

  IF v_manifest.manifest_fingerprint IS DISTINCT FROM
    app_private.organization_transition_manifest_fingerprint(
      p_organization_id,
      p_manifest_id
    ) THEN
    RAISE EXCEPTION 'Transition manifest fingerprint does not match its exact items.'
      USING ERRCODE = '55000';
  END IF;

END;
$$;

CREATE FUNCTION app_private.validate_transition_manifest_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manifest_status text;
  v_organization_id uuid;
  v_organization_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_organization_ids := ARRAY[NEW.organization_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_organization_ids := ARRAY[OLD.organization_id];
  ELSE
    v_organization_ids := ARRAY[OLD.organization_id, NEW.organization_id];
  END IF;

  FOR v_organization_id IN
    SELECT DISTINCT organization_id
    FROM unnest(v_organization_ids) AS organization_id
    ORDER BY organization_id
  LOOP
    PERFORM app_private.lock_organization_authorization_scope(
      v_organization_id,
      NULL,
      NULL
    );
  END LOOP;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT manifest.status
    INTO v_manifest_status
    FROM public.organization_access_transition_manifests AS manifest
    WHERE manifest.organization_id = OLD.organization_id
      AND manifest.id = OLD.manifest_id
    FOR UPDATE;

    IF v_manifest_status IS DISTINCT FROM 'staged' THEN
      RAISE EXCEPTION 'Approved transition manifest items are immutable.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT manifest.status
    INTO v_manifest_status
    FROM public.organization_access_transition_manifests AS manifest
    WHERE manifest.organization_id = NEW.organization_id
      AND manifest.id = NEW.manifest_id
    FOR UPDATE;

    IF v_manifest_status IS DISTINCT FROM 'staged' THEN
      RAISE EXCEPTION 'Approved transition manifest items are immutable.'
        USING ERRCODE = '55000';
    END IF;

    PERFORM app_private.lock_organization_authorization_scope(
      NEW.organization_id,
      NEW.target_branch_id,
      NEW.target_role_id
    );

    IF NEW.target_profile_fingerprint IS DISTINCT FROM
      app_private.organization_permission_profile_fingerprint(
        NEW.target_permission_keys
      ) OR NOT EXISTS (
        SELECT 1
        FROM public.organization_branches AS branch
        JOIN public.organization_roles AS role_record
          ON role_record.organization_id = branch.organization_id
         AND role_record.id = NEW.target_role_id
        WHERE branch.organization_id = NEW.organization_id
          AND branch.id = NEW.target_branch_id
          AND branch.status = 'active'
          AND branch.archived_at IS NULL
          AND role_record.status = 'active'
          AND NEW.target_permission_keys IS NOT DISTINCT FROM (
            SELECT array_agg(
              permission_record.permission_key
              ORDER BY permission_record.permission_key
            )
            FROM public.organization_role_permissions AS permission_record
            WHERE permission_record.organization_id = NEW.organization_id
              AND permission_record.role_id = NEW.target_role_id
          )
      ) THEN
      RAISE EXCEPTION 'Transition manifest target branch, role, or permission profile is not exact and active.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_access_manifest_items_validate
BEFORE INSERT OR UPDATE OR DELETE
ON public.organization_access_transition_manifest_items
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_transition_manifest_item();

CREATE FUNCTION app_private.validate_transition_manifest_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    NEW.organization_id,
    NULL,
    NULL
  );

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Transition manifest identity is immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
    AND (
      OLD.manifest_fingerprint IS DISTINCT FROM NEW.manifest_fingerprint
      OR OLD.expected_legacy_membership_count IS DISTINCT FROM
        NEW.expected_legacy_membership_count
      OR OLD.expected_legacy_invitation_count IS DISTINCT FROM
        NEW.expected_legacy_invitation_count
      OR OLD.baseline_custom_membership_count IS DISTINCT FROM
        NEW.baseline_custom_membership_count
      OR OLD.baseline_custom_invitation_count IS DISTINCT FROM
        NEW.baseline_custom_invitation_count
      OR OLD.baseline_custom_fingerprint IS DISTINCT FROM
        NEW.baseline_custom_fingerprint
      OR OLD.no_unlisted_conversion IS DISTINCT FROM
        NEW.no_unlisted_conversion
    ) THEN
    RAISE EXCEPTION 'Transition manifest approval contract is immutable during status advancement.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = NEW.status THEN
    IF OLD.status <> 'staged' THEN
      RAISE EXCEPTION 'Approved transition manifest evidence is immutable.'
        USING ERRCODE = '55000';
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := coalesce((SELECT auth.uid()), NEW.updated_by);
    RETURN NEW;
  END IF;

  IF OLD.status = 'staged' AND NEW.status = 'approved' THEN
    PERFORM app_private.assert_transition_manifest_approvable(
      NEW.organization_id,
      NEW.id
    );
    NEW.approved_at := now();
    NEW.approved_by := coalesce((SELECT auth.uid()), NEW.approved_by, NEW.updated_by);
  ELSIF OLD.status = 'approved' AND NEW.status = 'applied' THEN
    PERFORM app_private.assert_transition_manifest_targets(
      NEW.organization_id,
      NEW.id
    );
    PERFORM app_private.assert_transition_manifest_applied(
      NEW.organization_id,
      NEW.id
    );
    NEW.applied_at := now();
    NEW.applied_by := coalesce((SELECT auth.uid()), NEW.applied_by, NEW.updated_by);
  ELSE
    RAISE EXCEPTION 'Transition manifest status can only advance from staged to approved to applied.'
      USING ERRCODE = '55000';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := coalesce((SELECT auth.uid()), NEW.updated_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_access_manifests_validate_lifecycle
BEFORE UPDATE
ON public.organization_access_transition_manifests
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_transition_manifest_lifecycle();

CREATE FUNCTION app_private.validate_custom_workspace_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    NEW.organization_id,
    NEW.branch_id,
    NEW.custom_role_id
  );

  IF current_user = 'service_role'
    AND (
      NEW.role = 'custom'
      OR NEW.custom_role_id IS NOT NULL
      OR (TG_OP = 'UPDATE' AND OLD.role = 'custom')
      OR (TG_OP = 'UPDATE' AND OLD.custom_role_id IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Custom role assignment requires a checked or protected release path.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'organization_invitations'
    AND (to_jsonb(NEW) ->> 'status') NOT IN ('pending', 'send_failed') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IN (
    'finance_manager',
    'finance_member',
    'operations_manager',
    'operations_member'
  ) AND EXISTS (
    SELECT 1
    FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id = NEW.organization_id
      AND authorization_state.ordinary_access_enabled
  ) THEN
    RAISE EXCEPTION 'Legacy ordinary assignments are disabled after ordinary access activation.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.role <> 'custom' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = NEW.organization_id
      AND branch.id = NEW.branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    IF TG_TABLE_NAME = 'organization_invitations' THEN
      RAISE EXCEPTION 'Every ordinary invitation requires one active branch and one active role with permissions.'
        USING ERRCODE = '55000';
    END IF;

    RAISE EXCEPTION 'An active branch in this organization is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_roles AS role_record
    WHERE role_record.organization_id = NEW.organization_id
      AND role_record.id = NEW.custom_role_id
      AND role_record.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.organization_role_permissions AS permission_record
        WHERE permission_record.organization_id = role_record.organization_id
          AND permission_record.role_id = role_record.id
      )
  ) THEN
    IF TG_TABLE_NAME = 'organization_invitations' THEN
      RAISE EXCEPTION 'Every ordinary invitation requires one active branch and one active role with permissions.'
        USING ERRCODE = '55000';
    END IF;

    RAISE EXCEPTION 'An active role with permissions in this organization is required.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_members_validate_custom_assignment
BEFORE INSERT OR UPDATE OF organization_id, role, branch_id, custom_role_id
ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_custom_workspace_assignment();

CREATE FUNCTION app_private.prevent_assigned_role_from_becoming_empty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      WHERE member.organization_id = OLD.organization_id
        AND member.role = 'custom'
        AND member.custom_role_id = OLD.role_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_invitations AS invitation
      WHERE invitation.organization_id = OLD.organization_id
        AND invitation.custom_role_id = OLD.role_id
        AND invitation.status IN ('pending', 'send_failed')
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.organization_role_permissions AS permission_record
    WHERE permission_record.organization_id = OLD.organization_id
      AND permission_record.role_id = OLD.role_id
      AND permission_record.permission_key <> OLD.permission_key
  ) THEN
    RAISE EXCEPTION 'Assigned roles must retain at least one permission.'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_role_permissions_keep_assigned_role_nonempty
BEFORE DELETE OR UPDATE OF organization_id, role_id, permission_key
ON public.organization_role_permissions
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_assigned_role_from_becoming_empty();

CREATE FUNCTION app_private.validate_role_permission_view_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_organization_id uuid;
  v_new_role_id uuid;
  v_old_organization_id uuid;
  v_old_role_id uuid;
  v_organization_id uuid;
  v_role_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_organization_id := OLD.organization_id;
    v_old_role_id := OLD.role_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_organization_id := NEW.organization_id;
    v_new_role_id := NEW.role_id;
  END IF;

  FOR v_organization_id, v_role_id IN
    SELECT DISTINCT permission_pair.organization_id, permission_pair.role_id
    FROM (
      VALUES
        (v_old_organization_id, v_old_role_id),
        (v_new_organization_id, v_new_role_id)
    ) AS permission_pair(organization_id, role_id)
    WHERE permission_pair.organization_id IS NOT NULL
      AND permission_pair.role_id IS NOT NULL
    ORDER BY permission_pair.organization_id, permission_pair.role_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.organization_role_permissions AS dependent_permission
      WHERE dependent_permission.organization_id = v_organization_id
        AND dependent_permission.role_id = v_role_id
        AND split_part(dependent_permission.permission_key::text, '.', 2) <> 'view'
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_role_permissions AS view_permission
          WHERE view_permission.organization_id = dependent_permission.organization_id
            AND view_permission.role_id = dependent_permission.role_id
            AND view_permission.permission_key::text =
              split_part(dependent_permission.permission_key::text, '.', 1) || '.view'
        )
    ) THEN
      RAISE EXCEPTION 'Every dependent permission requires its group View permission.'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER organization_role_permissions_view_dependency_check
AFTER INSERT OR UPDATE OR DELETE
ON public.organization_role_permissions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_role_permission_view_dependencies();

CREATE FUNCTION app_private.prevent_assigned_role_archival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'archived'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = OLD.organization_id
          AND member.role = 'custom'
          AND member.custom_role_id = OLD.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.organization_invitations AS invitation
        WHERE invitation.organization_id = OLD.organization_id
          AND invitation.custom_role_id = OLD.id
          AND invitation.status IN ('pending', 'send_failed')
      )
    ) THEN
    RAISE EXCEPTION 'Assigned roles cannot be archived.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_roles_prevent_assigned_archival
BEFORE UPDATE OF status
ON public.organization_roles
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_assigned_role_archival();

CREATE TRIGGER organization_invitations_validate_custom_assignment
BEFORE INSERT OR UPDATE OF organization_id, role, branch_id, custom_role_id, status
ON public.organization_invitations
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_custom_workspace_assignment();

CREATE FUNCTION app_private.assert_checked_workspace_access(
  p_organization_id uuid,
  p_role_kind text,
  p_person_id uuid,
  p_branch_id uuid,
  p_custom_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ordinary_access_enabled boolean;
  v_ordinary_assignment_ready boolean;
  v_role_kind text := lower(trim(coalesce(p_role_kind, '')));
BEGIN
  IF v_role_kind NOT IN ('super_admin', 'custom') THEN
    RAISE EXCEPTION 'Role kind must be super_admin or custom.'
      USING ERRCODE = '22023';
  END IF;

  IF v_role_kind = 'super_admin' THEN
    IF p_person_id IS NOT NULL
      OR p_branch_id IS NOT NULL
      OR p_custom_role_id IS NOT NULL THEN
      RAISE EXCEPTION 'Super Admin access cannot have branch, role, or Staff scope.'
        USING ERRCODE = '22023';
    END IF;

    RETURN;
  END IF;

  IF p_branch_id IS NULL OR p_custom_role_id IS NULL THEN
    RAISE EXCEPTION 'Custom access requires one branch and one role.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    p_branch_id,
    p_custom_role_id
  );

  SELECT authorization_state.ordinary_access_enabled
  INTO v_ordinary_access_enabled
  FROM public.organization_authorization_states AS authorization_state
  WHERE authorization_state.organization_id = p_organization_id;

  IF NOT coalesce(v_ordinary_access_enabled, false) THEN
    RAISE EXCEPTION 'Ordinary access is contained.'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regprocedure(
    'app_private.organization_branch_readiness_snapshot(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Ordinary access cannot be enabled while Property branch scope is unresolved.'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE
    'SELECT readiness.ordinary_assignment_ready
       FROM app_private.organization_branch_readiness_snapshot($1) AS readiness'
  INTO v_ordinary_assignment_ready
  USING p_organization_id;

  IF NOT coalesce(v_ordinary_assignment_ready, false) THEN
    RAISE EXCEPTION 'Ordinary access cannot be enabled while Property branch scope is unresolved.'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = p_organization_id
      AND branch.id = p_branch_id
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'An active branch in this organization is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_roles AS role_record
    WHERE role_record.organization_id = p_organization_id
      AND role_record.id = p_custom_role_id
      AND role_record.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.organization_role_permissions AS permission_record
        WHERE permission_record.organization_id = role_record.organization_id
          AND permission_record.role_id = role_record.id
      )
  ) THEN
    RAISE EXCEPTION 'An active role with permissions in this organization is required.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_kind text,
  p_person_id uuid,
  p_branch_id uuid,
  p_custom_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_id uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role_kind text := lower(trim(coalesce(p_role_kind, '')));
  previous_invitation public.organization_invitations%ROWTYPE;
  violated_constraint text;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(
    p_organization_id
  );

  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_checked_workspace_access(
    p_organization_id,
    normalized_role_kind,
    p_person_id,
    p_branch_id,
    p_custom_role_id
  );

  PERFORM app_private.lock_staff_workspace_access(
    p_organization_id,
    p_person_id
  );

  UPDATE public.organization_invitations AS invitation
  SET status = 'expired'
  WHERE invitation.organization_id = p_organization_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.expires_at <= now()
    AND (
      invitation.email = normalized_email
      OR (
        p_person_id IS NOT NULL
        AND invitation.person_id = p_person_id
      )
    );

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.person_id = p_person_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.email <> normalized_email
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  SELECT invitation.*
  INTO previous_invitation
  FROM public.organization_invitations AS invitation
  WHERE invitation.organization_id = p_organization_id
    AND invitation.email = normalized_email
    AND invitation.status IN ('pending', 'send_failed')
  FOR UPDATE;

  IF previous_invitation.id IS NOT NULL THEN
    IF previous_invitation.person_id IS DISTINCT FROM p_person_id THEN
      RAISE EXCEPTION 'An active invitation already exists for this email'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.organization_invitations
    SET
      role = normalized_role_kind,
      branch_id = p_branch_id,
      person_id = p_person_id,
      custom_role_id = p_custom_role_id,
      status = 'pending',
      delivery_error = NULL,
      expires_at = now() + interval '1 hour'
    WHERE id = previous_invitation.id
    RETURNING id INTO invitation_id;
  ELSE
    INSERT INTO public.organization_invitations (
      organization_id,
      email,
      role,
      branch_id,
      person_id,
      custom_role_id,
      status,
      invited_by,
      invited_at,
      expires_at
    )
    VALUES (
      p_organization_id,
      normalized_email,
      normalized_role_kind,
      p_branch_id,
      p_person_id,
      p_custom_role_id,
      'pending',
      (SELECT auth.uid()),
      now(),
      now() + interval '1 hour'
    )
    RETURNING id INTO invitation_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    invitation_id,
    CASE
      WHEN previous_invitation.id IS NULL THEN 'organization_invitation_created'
      ELSE 'organization_invitation_refreshed'
    END,
    jsonb_build_object(
      'role', normalized_role_kind,
      'role_kind', normalized_role_kind,
      'branch_id', p_branch_id,
      'custom_role_id', p_custom_role_id
    )
  );

  RETURN invitation_id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_invitations_live_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has an active invitation'
        USING ERRCODE = '23505';
    END IF;

    IF violated_constraint = 'organization_invitations_active_email_uidx' THEN
      RAISE EXCEPTION 'An active invitation already exists for this email'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_organization_invitation(
  p_invitation_id uuid
)
RETURNS TABLE(invitation_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.organization_invitations%ROWTYPE;
  violated_constraint text;
BEGIN
  SELECT invitation.* INTO target
  FROM public.organization_invitations AS invitation
  WHERE invitation.id = p_invitation_id;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.lock_organization_authorization_scope(
    target.organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(
    target.organization_id
  );
  PERFORM app_private.lock_organization_authorization_scope(
    target.organization_id,
    target.branch_id,
    target.custom_role_id
  );
  PERFORM app_private.lock_staff_workspace_access(
    target.organization_id,
    target.person_id
  );

  SELECT invitation.* INTO target
  FROM public.organization_invitations AS invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL OR (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(target.organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF target.status NOT IN ('pending', 'send_failed', 'expired') THEN
    RAISE EXCEPTION 'Invitation cannot be resent' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    target.organization_id,
    CASE WHEN target.role = 'custom' THEN NULL ELSE target.branch_id END,
    target.person_id
  );

  IF target.person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = target.organization_id
      AND member.person_id = target.person_id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF target.person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = target.organization_id
      AND invitation.person_id = target.person_id
      AND invitation.id <> target.id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = target.organization_id
      AND invitation.email = target.email
      AND invitation.id <> target.id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.organization_invitations
  SET
    status = 'pending',
    delivery_error = NULL,
    expires_at = now() + interval '1 hour'
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    (SELECT auth.uid()),
    'organization_invitation',
    target.id,
    'organization_invitation_resend_requested',
    jsonb_build_object('email', target.email)
  );

  RETURN QUERY SELECT target.id, target.email;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_invitations_live_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has an active invitation'
        USING ERRCODE = '23505';
    END IF;

    IF violated_constraint = 'organization_invitations_active_email_uidx' THEN
      RAISE EXCEPTION 'An active invitation already exists for this email'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_count integer;
  current_email text;
  current_encrypted_password text;
  current_user_id uuid := (SELECT auth.uid());
  existing_membership public.organization_members%ROWTYPE;
  invitation_is_already_accepted boolean;
  linked_person_member_id uuid;
  membership_id uuid;
  target public.organization_invitations%ROWTYPE;
  violated_constraint text;
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

  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.lock_organization_authorization_scope(
    target.organization_id,
    NULL,
    NULL
  );

  SELECT * INTO target
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  PERFORM app_private.lock_staff_workspace_access(
    target.organization_id,
    target.person_id
  );

  IF target.email <> current_email THEN
    RAISE EXCEPTION 'Invitation email does not match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = target.organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT member.* INTO existing_membership
  FROM public.organization_members AS member
  WHERE member.organization_id = target.organization_id
    AND member.user_id = current_user_id;
  membership_id := existing_membership.id;

  invitation_is_already_accepted :=
    target.status = 'accepted'
    AND target.auth_user_id = current_user_id
    AND membership_id IS NOT NULL;

  IF invitation_is_already_accepted THEN
    RETURN membership_id;
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not available' USING ERRCODE = '55000';
  END IF;

  IF target.status = 'pending' AND target.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '55000';
  END IF;

  IF coalesce(current_encrypted_password, '') = ''
    OR EXISTS (
      SELECT 1
      FROM app_private.invitation_password_challenges AS challenge
      WHERE challenge.invitation_id = target.id
        AND challenge.auth_user_id = current_user_id
        AND challenge.password_hash_fingerprint =
          extensions.digest(current_encrypted_password, 'sha256')
    ) THEN
    RAISE EXCEPTION 'Password setup is required' USING ERRCODE = '55000';
  END IF;

  IF target.role IN ('super_admin', 'custom') THEN
    PERFORM app_private.assert_checked_workspace_access(
      target.organization_id,
      target.role,
      target.person_id,
      target.branch_id,
      target.custom_role_id
    );
  END IF;

  PERFORM app_private.assert_invitation_scope(
    target.organization_id,
    target.branch_id,
    target.person_id
  );

  IF membership_id IS NOT NULL
    AND target.person_id IS NOT NULL
    AND existing_membership.person_id IS NOT NULL
    AND existing_membership.person_id <> target.person_id THEN
    RAISE EXCEPTION 'This account is linked to a different staff member'
      USING ERRCODE = '23505';
  END IF;

  IF target.person_id IS NOT NULL THEN
    SELECT member.id INTO linked_person_member_id
    FROM public.organization_members AS member
    WHERE member.organization_id = target.organization_id
      AND member.person_id = target.person_id
      AND member.id IS DISTINCT FROM membership_id;

    IF linked_person_member_id IS NOT NULL THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF membership_id IS NOT NULL THEN
    IF existing_membership.role = 'super_admin' AND target.role <> 'super_admin' THEN
      SELECT count(*) INTO admin_count
      FROM public.organization_members AS member
      WHERE member.organization_id = target.organization_id
        AND member.role = 'super_admin';

      IF admin_count <= 1 THEN
        RAISE EXCEPTION 'The final Super Admin cannot be demoted'
          USING ERRCODE = '55000';
      END IF;
    END IF;

    UPDATE public.organization_members
    SET
      role = target.role,
      person_id = coalesce(target.person_id, existing_membership.person_id),
      branch_id = target.branch_id,
      custom_role_id = target.custom_role_id
    WHERE id = membership_id;
  ELSE
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      person_id,
      branch_id,
      custom_role_id
    ) VALUES (
      target.organization_id,
      current_user_id,
      target.role,
      target.person_id,
      target.branch_id,
      target.custom_role_id
    )
    RETURNING id INTO membership_id;
  END IF;

  UPDATE public.organization_invitations
  SET
    status = 'accepted',
    auth_user_id = current_user_id,
    accepted_at = now(),
    delivery_error = NULL
  WHERE id = target.id;

  DELETE FROM app_private.invitation_password_challenges
  WHERE invitation_id = target.id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    target.organization_id,
    current_user_id,
    'organization_invitation',
    target.id,
    'organization_invitation_accepted',
    jsonb_build_object(
      'membership_id', membership_id,
      'role', target.role,
      'role_kind', target.role,
      'branch_id', target.branch_id,
      'custom_role_id', target.custom_role_id
    )
  );

  RETURN membership_id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_members_org_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;

    IF violated_constraint = 'organization_members_organization_id_user_id_key' THEN
      RAISE EXCEPTION 'This account already has workspace access'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_member_access(
  p_organization_id uuid,
  p_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  super_admin_count integer;
  target public.organization_members%ROWTYPE;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(
    p_organization_id
  );

  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT * INTO target
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF target.role = 'super_admin' THEN
    SELECT count(*) INTO super_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'super_admin';

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final Super Admin cannot be removed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  DELETE FROM public.organization_members
  WHERE id = target.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'organization_membership',
    target.id,
    'organization_member_access_removed',
    jsonb_build_object(
      'user_id', target.user_id,
      'role', target.role,
      'branch_id', target.branch_id,
      'person_id', target.person_id
    )
  );

  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_member_access(
  p_organization_id uuid,
  p_member_id uuid,
  p_role text,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  super_admin_count integer;
  normalized_role text := lower(trim(coalesce(p_role, '')));
  target public.organization_members%ROWTYPE;
  violated_constraint text;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(
    p_organization_id
  );

  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_role NOT IN (
    'super_admin',
    'finance_manager',
    'finance_member',
    'operations_manager',
    'operations_member'
  ) THEN
    RAISE EXCEPTION 'Role is not supported' USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.workspace_role_scope_is_valid(
    normalized_role,
    p_branch_id,
    p_person_id
  ) THEN
    IF normalized_role IN ('operations_manager', 'operations_member') THEN
      RAISE EXCEPTION 'Operations roles require branch and Staff scope'
        USING ERRCODE = '22023';
    END IF;

    RAISE EXCEPTION 'Finance roles cannot have branch or Staff scope'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_invitation_scope(
    p_organization_id,
    p_branch_id,
    p_person_id
  );
  PERFORM app_private.lock_staff_workspace_access(
    p_organization_id,
    p_person_id
  );

  UPDATE public.organization_invitations AS invitation
  SET status = 'expired'
  WHERE p_person_id IS NOT NULL
    AND invitation.organization_id = p_organization_id
    AND invitation.person_id = p_person_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.expires_at <= now();

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT * INTO target
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.person_id = p_person_id
      AND member.id <> target.id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.person_id = p_person_id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  IF target.role = 'super_admin' AND normalized_role <> 'super_admin' THEN
    SELECT count(*) INTO super_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'super_admin';

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final Super Admin cannot be demoted'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET role = normalized_role, person_id = p_person_id, branch_id = p_branch_id
  WHERE id = target.id;

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
    (SELECT auth.uid()),
    'organization_membership',
    target.id,
    'organization_member_access_updated',
    jsonb_build_object(
      'role', target.role,
      'branch_id', target.branch_id,
      'person_id', target.person_id
    ),
    jsonb_build_object(
      'role', normalized_role,
      'branch_id', p_branch_id,
      'person_id', p_person_id
    )
  );

  RETURN target.id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_members_org_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE FUNCTION public.update_organization_member_access(
  p_organization_id uuid,
  p_member_id uuid,
  p_role_kind text,
  p_person_id uuid,
  p_branch_id uuid,
  p_custom_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  super_admin_count integer;
  normalized_role_kind text := lower(trim(coalesce(p_role_kind, '')));
  target public.organization_members%ROWTYPE;
  violated_constraint text;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );
  PERFORM app_private.lock_current_organization_membership(
    p_organization_id
  );

  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_manage_access(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.assert_checked_workspace_access(
    p_organization_id,
    normalized_role_kind,
    p_person_id,
    p_branch_id,
    p_custom_role_id
  );

  PERFORM app_private.lock_staff_workspace_access(
    p_organization_id,
    p_person_id
  );

  UPDATE public.organization_invitations AS invitation
  SET status = 'expired'
  WHERE p_person_id IS NOT NULL
    AND invitation.organization_id = p_organization_id
    AND invitation.person_id = p_person_id
    AND invitation.status IN ('pending', 'send_failed')
    AND invitation.expires_at <= now();

  PERFORM 1
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
  ORDER BY member.id
  FOR UPDATE;

  SELECT member.* INTO target
  FROM public.organization_members AS member
  WHERE member.id = p_member_id
    AND member.organization_id = p_organization_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = '23503';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.person_id = p_person_id
      AND member.id <> target.id
  ) THEN
    RAISE EXCEPTION 'This staff member already has workspace access'
      USING ERRCODE = '23505';
  END IF;

  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.person_id = p_person_id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'This staff member already has an active invitation'
      USING ERRCODE = '23505';
  END IF;

  IF target.role = 'super_admin' AND normalized_role_kind <> 'super_admin' THEN
    SELECT count(*) INTO super_admin_count
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role = 'super_admin';

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'The final Super Admin cannot be demoted'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET
    role = normalized_role_kind,
    person_id = p_person_id,
    branch_id = p_branch_id,
    custom_role_id = p_custom_role_id
  WHERE id = target.id;

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
    (SELECT auth.uid()),
    'organization_membership',
    target.id,
    'organization_member_access_updated',
    jsonb_build_object(
      'role', target.role,
      'role_kind', target.role,
      'branch_id', target.branch_id,
      'custom_role_id', target.custom_role_id
    ),
    jsonb_build_object(
      'role', normalized_role_kind,
      'role_kind', normalized_role_kind,
      'branch_id', p_branch_id,
      'custom_role_id', p_custom_role_id
    )
  );

  RETURN target.id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

    IF coalesce(violated_constraint, '') = '' THEN
      RAISE;
    END IF;

    IF violated_constraint = 'organization_members_org_person_uidx' THEN
      RAISE EXCEPTION 'This staff member already has workspace access'
        USING ERRCODE = '23505';
    END IF;

    RAISE;
END;
$$;

CREATE FUNCTION app_private.validate_ordinary_access_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
  v_manifest_id uuid;
  v_manifest_status text;
  v_role_id uuid;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    NEW.organization_id,
    NULL,
    NULL
  );

  FOR v_branch_id IN
    SELECT DISTINCT scope.branch_id
    FROM (
      SELECT member.branch_id
      FROM public.organization_members AS member
      WHERE member.organization_id = NEW.organization_id
        AND member.role = 'custom'
      UNION
      SELECT invitation.branch_id
      FROM public.organization_invitations AS invitation
      WHERE invitation.organization_id = NEW.organization_id
        AND invitation.role = 'custom'
        AND invitation.status IN ('pending', 'send_failed')
    ) AS scope
    WHERE scope.branch_id IS NOT NULL
    ORDER BY scope.branch_id
  LOOP
    PERFORM app_private.lock_organization_authorization_scope(
      NEW.organization_id,
      v_branch_id,
      NULL
    );
  END LOOP;

  FOR v_role_id IN
    SELECT DISTINCT scope.custom_role_id
    FROM (
      SELECT member.custom_role_id
      FROM public.organization_members AS member
      WHERE member.organization_id = NEW.organization_id
        AND member.role = 'custom'
      UNION
      SELECT invitation.custom_role_id
      FROM public.organization_invitations AS invitation
      WHERE invitation.organization_id = NEW.organization_id
        AND invitation.role = 'custom'
        AND invitation.status IN ('pending', 'send_failed')
    ) AS scope
    WHERE scope.custom_role_id IS NOT NULL
    ORDER BY scope.custom_role_id
  LOOP
    PERFORM app_private.lock_organization_authorization_scope(
      NEW.organization_id,
      NULL,
      v_role_id
    );
  END LOOP;

  IF OLD.ordinary_access_enabled IS NOT DISTINCT FROM NEW.ordinary_access_enabled THEN
    RETURN NEW;
  END IF;

  IF NEW.ordinary_access_enabled AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = NEW.organization_id
      AND member.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) THEN
    RAISE EXCEPTION 'Ordinary access cannot be enabled while legacy ordinary memberships remain.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.ordinary_access_enabled AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = NEW.organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role IN (
        'finance_manager',
        'finance_member',
        'operations_manager',
        'operations_member'
      )
  ) THEN
    RAISE EXCEPTION 'Ordinary access cannot be enabled while legacy ordinary invitations remain.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.ordinary_access_enabled AND NEW.transition_manifest_required THEN
    SELECT manifest.id, manifest.status
    INTO v_manifest_id, v_manifest_status
    FROM public.organization_access_transition_manifests AS manifest
    WHERE manifest.organization_id = NEW.organization_id;

    IF v_manifest_id IS NULL OR v_manifest_status IS DISTINCT FROM 'applied' THEN
      RAISE EXCEPTION 'A complete applied transition manifest is required before ordinary access activation.'
        USING ERRCODE = '55000';
    END IF;

    PERFORM app_private.assert_transition_manifest_applied(
      NEW.organization_id,
      v_manifest_id
    );
    NEW.transition_manifest_required := false;
  END IF;

  IF NEW.ordinary_access_enabled AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = member.organization_id
     AND branch.id = member.branch_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id = member.organization_id
     AND role_record.id = member.custom_role_id
    WHERE member.organization_id = NEW.organization_id
      AND member.role <> 'super_admin'
      AND (
        member.role <> 'custom'
        OR branch.id IS NULL
        OR branch.status <> 'active'
        OR branch.archived_at IS NOT NULL
        OR role_record.id IS NULL
        OR role_record.status <> 'active'
        OR NOT EXISTS (
          SELECT 1
          FROM public.organization_role_permissions AS permission_record
          WHERE permission_record.organization_id = role_record.organization_id
            AND permission_record.role_id = role_record.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Every ordinary membership requires one active branch and one active role with permissions.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.ordinary_access_enabled AND EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    LEFT JOIN public.organization_branches AS branch
      ON branch.organization_id = invitation.organization_id
     AND branch.id = invitation.branch_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id = invitation.organization_id
     AND role_record.id = invitation.custom_role_id
    WHERE invitation.organization_id = NEW.organization_id
      AND invitation.status IN ('pending', 'send_failed')
      AND invitation.role = 'custom'
      AND (
        branch.id IS NULL
        OR branch.status <> 'active'
        OR branch.archived_at IS NOT NULL
        OR role_record.id IS NULL
        OR role_record.status <> 'active'
        OR NOT EXISTS (
          SELECT 1
          FROM public.organization_role_permissions AS permission_record
          WHERE permission_record.organization_id = role_record.organization_id
            AND permission_record.role_id = role_record.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Every ordinary invitation requires one active branch and one active role with permissions.'
      USING ERRCODE = '55000';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := (SELECT auth.uid());
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_authorization_states_validate_activation
BEFORE UPDATE OF ordinary_access_enabled
ON public.organization_authorization_states
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_ordinary_access_activation();

CREATE FUNCTION app_private.can_read_organization_role(
  p_organization_id uuid,
  p_role_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_authorization_states AS authorization_state
      JOIN public.organization_members AS member
        ON member.organization_id = authorization_state.organization_id
       AND member.user_id = (SELECT auth.uid())
       AND member.role = 'custom'
       AND member.custom_role_id = p_role_id
      WHERE authorization_state.organization_id = p_organization_id
        AND authorization_state.ordinary_access_enabled
    ),
    false
  );
$$;

CREATE FUNCTION app_private.can_read_organization_authorization_state(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.user_id = (SELECT auth.uid())
  );
$$;

ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_authorization_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_authorization_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_access_transition_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_access_transition_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_access_transition_manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_access_transition_manifest_items FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_roles_authenticated_select
ON public.organization_roles
FOR SELECT
TO authenticated
USING (
  (SELECT app_private.can_read_organization_role(organization_id, id))
);

CREATE POLICY organization_role_permissions_authenticated_select
ON public.organization_role_permissions
FOR SELECT
TO authenticated
USING (
  (SELECT app_private.can_read_organization_role(organization_id, role_id))
);

CREATE POLICY organization_authorization_states_authenticated_select
ON public.organization_authorization_states
FOR SELECT
TO authenticated
USING (
  (SELECT app_private.can_read_organization_authorization_state(organization_id))
);

CREATE POLICY organization_access_transition_manifests_authenticated_select
ON public.organization_access_transition_manifests
FOR SELECT
TO authenticated
USING (
  (SELECT app_private.is_super_admin(organization_id))
);

CREATE POLICY org_access_manifest_items_authenticated_select
ON public.organization_access_transition_manifest_items
FOR SELECT
TO authenticated
USING (
  (SELECT app_private.is_super_admin(organization_id))
);

CREATE FUNCTION app_private.normalize_organization_permission_keys(
  p_requested public.organization_permission_key[],
  p_current public.organization_permission_key[] DEFAULT '{}'::public.organization_permission_key[]
)
RETURNS public.organization_permission_key[]
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_current public.organization_permission_key[] := coalesce(
    p_current,
    '{}'::public.organization_permission_key[]
  );
  v_group text;
  v_requested public.organization_permission_key[] := ARRAY(
    SELECT DISTINCT requested_permission
    FROM unnest(coalesce(p_requested, '{}'::public.organization_permission_key[]))
      AS requested_permission
    ORDER BY requested_permission
  );
  v_result public.organization_permission_key[];
  v_view public.organization_permission_key;
BEGIN
  v_result := v_requested;

  FOREACH v_group IN ARRAY ARRAY[
    'properties',
    'people',
    'leases',
    'finance',
    'maintenance'
  ]
  LOOP
    v_view := (v_group || '.view')::public.organization_permission_key;

    IF v_view = ANY (v_current) AND NOT v_view = ANY (v_requested) THEN
      v_result := ARRAY(
        SELECT permission_key
        FROM unnest(v_result) AS permission_key
        WHERE split_part(permission_key::text, '.', 1) <> v_group
        ORDER BY permission_key
      );
    ELSIF EXISTS (
      SELECT 1
      FROM unnest(v_requested) AS permission_key
      WHERE split_part(permission_key::text, '.', 1) = v_group
        AND permission_key <> v_view
    ) AND NOT v_view = ANY (v_result) THEN
      v_result := array_append(v_result, v_view);
    END IF;
  END LOOP;

  RETURN ARRAY(
    SELECT DISTINCT permission_key
    FROM unnest(v_result) AS permission_key
    ORDER BY permission_key
  );
END;
$$;

CREATE FUNCTION app_private.normalized_organization_role_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
$$;

CREATE FUNCTION app_private.assert_role_super_admin(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can manage roles.' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_id;
END;
$$;

CREATE FUNCTION app_private.create_organization_role_checked(
  p_organization_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_name text := app_private.normalized_organization_role_name(p_name);
  v_role_id uuid;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );

  PERFORM app_private.lock_current_organization_membership(p_organization_id);

  v_actor_id := app_private.assert_role_super_admin(p_organization_id);

  IF length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_roles (
    organization_id,
    name,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    v_name,
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_role_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'organization_role',
    v_role_id,
    'organization_role_created',
    jsonb_build_object('name', v_name, 'status', 'active')
  );

  RETURN v_role_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Role name is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.duplicate_organization_role_checked(
  p_organization_id uuid,
  p_role_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_name text := app_private.normalized_organization_role_name(p_name);
  v_new_role_id uuid;
  v_source public.organization_roles%ROWTYPE;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );

  PERFORM app_private.lock_current_organization_membership(p_organization_id);

  v_actor_id := app_private.assert_role_super_admin(p_organization_id);

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    p_role_id
  );

  IF length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  SELECT role_record.*
  INTO v_source
  FROM public.organization_roles AS role_record
  WHERE role_record.organization_id = p_organization_id
    AND role_record.id = p_role_id
  FOR SHARE;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Role was not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.organization_roles (
    organization_id,
    name,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    v_name,
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_new_role_id;

  INSERT INTO public.organization_role_permissions (
    organization_id,
    role_id,
    permission_key,
    granted_by
  )
  SELECT
    p_organization_id,
    v_new_role_id,
    permission_record.permission_key,
    v_actor_id
  FROM public.organization_role_permissions AS permission_record
  WHERE permission_record.organization_id = p_organization_id
    AND permission_record.role_id = p_role_id
  ORDER BY permission_record.permission_key;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'organization_role',
    v_new_role_id,
    'organization_role_duplicated',
    jsonb_build_object(
      'name', v_name,
      'source_role_id', p_role_id,
      'status', 'active'
    )
  );

  RETURN v_new_role_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Role name is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.save_organization_role_checked(
  p_organization_id uuid,
  p_role_id uuid,
  p_name text,
  p_permission_keys public.organization_permission_key[],
  p_expected_version bigint,
  p_confirm_removals boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_added public.organization_permission_key[];
  v_assigned_user_count bigint;
  v_current public.organization_permission_key[];
  v_name text := app_private.normalized_organization_role_name(p_name);
  v_normalized public.organization_permission_key[];
  v_permission public.organization_permission_key;
  v_removed public.organization_permission_key[];
  v_role public.organization_roles%ROWTYPE;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );

  PERFORM app_private.lock_current_organization_membership(p_organization_id);

  v_actor_id := app_private.assert_role_super_admin(p_organization_id);

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    p_role_id
  );

  IF length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'A valid expected role version is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT role_record.*
  INTO v_role
  FROM public.organization_roles AS role_record
  WHERE role_record.organization_id = p_organization_id
    AND role_record.id = p_role_id
  FOR UPDATE;

  IF v_role.id IS NULL THEN
    RAISE EXCEPTION 'Role was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role.status <> 'active' THEN
    RAISE EXCEPTION 'Archived roles cannot be edited.' USING ERRCODE = '55000';
  END IF;

  IF v_role.version <> p_expected_version THEN
    RAISE EXCEPTION 'Role has changed. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  SELECT coalesce(
    array_agg(permission_record.permission_key ORDER BY permission_record.permission_key),
    '{}'::public.organization_permission_key[]
  )
  INTO v_current
  FROM public.organization_role_permissions AS permission_record
  WHERE permission_record.organization_id = p_organization_id
    AND permission_record.role_id = p_role_id;

  v_normalized := app_private.normalize_organization_permission_keys(
    p_permission_keys,
    v_current
  );

  SELECT coalesce(array_agg(permission_key ORDER BY permission_key), '{}')
  INTO v_added
  FROM unnest(v_normalized) AS permission_key
  WHERE NOT permission_key = ANY (v_current);

  SELECT coalesce(array_agg(permission_key ORDER BY permission_key), '{}')
  INTO v_removed
  FROM unnest(v_current) AS permission_key
  WHERE NOT permission_key = ANY (v_normalized);

  SELECT count(*)
  INTO v_assigned_user_count
  FROM public.organization_members AS member
  WHERE member.organization_id = p_organization_id
    AND member.role = 'custom'
    AND member.custom_role_id = p_role_id;

  IF cardinality(v_removed) > 0 AND NOT coalesce(p_confirm_removals, false) THEN
    RETURN jsonb_build_object(
      'status', 'confirmation_required',
      'affectedUserCount', v_assigned_user_count,
      'version', v_role.version,
      'removedPermissionKeys', to_jsonb(v_removed)
    );
  END IF;

  IF v_assigned_user_count > 0 AND cardinality(v_normalized) = 0 THEN
    RAISE EXCEPTION 'Reassign users before removing every permission from this role.'
      USING ERRCODE = '55000';
  END IF;

  IF v_name = v_role.name
    AND cardinality(v_added) = 0
    AND cardinality(v_removed) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'saved',
      'affectedUserCount', v_assigned_user_count,
      'version', v_role.version,
      'permissionKeys', to_jsonb(v_normalized)
    );
  END IF;

  INSERT INTO public.organization_role_permissions (
    organization_id,
    role_id,
    permission_key,
    granted_by
  )
  SELECT p_organization_id, p_role_id, permission_key, v_actor_id
  FROM unnest(v_added) AS permission_key
  ORDER BY permission_key;

  DELETE FROM public.organization_role_permissions AS permission_record
  WHERE permission_record.organization_id = p_organization_id
    AND permission_record.role_id = p_role_id
    AND permission_record.permission_key = ANY (v_removed);

  FOREACH v_permission IN ARRAY v_removed
  LOOP
    INSERT INTO public.activity_logs (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      previous_values
    )
    VALUES (
      p_organization_id,
      v_actor_id,
      'organization_role',
      p_role_id,
      'organization_role_permission_removed',
      jsonb_build_object('permission_key', v_permission::text)
    );
  END LOOP;

  FOREACH v_permission IN ARRAY v_added
  LOOP
    INSERT INTO public.activity_logs (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      new_values
    )
    VALUES (
      p_organization_id,
      v_actor_id,
      'organization_role',
      p_role_id,
      'organization_role_permission_added',
      jsonb_build_object('permission_key', v_permission::text)
    );
  END LOOP;

  UPDATE public.organization_roles
  SET
    name = v_name,
    version = version + 1,
    updated_at = now(),
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_role_id
  RETURNING * INTO v_role;

  RETURN jsonb_build_object(
    'status', 'saved',
    'affectedUserCount', v_assigned_user_count,
    'version', v_role.version,
    'permissionKeys', to_jsonb(v_normalized)
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Role name is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION app_private.archive_organization_role_checked(
  p_organization_id uuid,
  p_role_id uuid,
  p_expected_version bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_role public.organization_roles%ROWTYPE;
BEGIN
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    NULL
  );

  PERFORM app_private.lock_current_organization_membership(p_organization_id);

  v_actor_id := app_private.assert_role_super_admin(p_organization_id);

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,
    NULL,
    p_role_id
  );

  SELECT role_record.*
  INTO v_role
  FROM public.organization_roles AS role_record
  WHERE role_record.organization_id = p_organization_id
    AND role_record.id = p_role_id
  FOR UPDATE;

  IF v_role.id IS NULL THEN
    RAISE EXCEPTION 'Role was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role.status = 'archived' THEN
    RETURN v_role.id;
  END IF;

  IF v_role.version <> p_expected_version THEN
    RAISE EXCEPTION 'Role has changed. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.role = 'custom'
      AND member.custom_role_id = p_role_id
  ) THEN
    RAISE EXCEPTION 'Reassign users before archiving this role.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    WHERE invitation.organization_id = p_organization_id
      AND invitation.custom_role_id = p_role_id
      AND invitation.status IN ('pending', 'send_failed')
  ) THEN
    RAISE EXCEPTION 'Reassign pending invitations before archiving this role.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.organization_roles
  SET
    status = 'archived',
    version = version + 1,
    updated_at = now(),
    updated_by = v_actor_id,
    archived_at = now(),
    archived_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_role_id;

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
    'organization_role',
    p_role_id,
    'organization_role_archived',
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'archived')
  );

  RETURN p_role_id;
END;
$$;

CREATE FUNCTION app_private.get_organization_roles_checked(
  p_organization_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  assigned_user_count bigint,
  pending_invitation_count bigint,
  version bigint,
  permission_keys public.organization_permission_key[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_role_super_admin(p_organization_id);

  RETURN QUERY
  SELECT
    role_record.id,
    role_record.name,
    role_record.status,
    (
      SELECT count(*)
      FROM public.organization_members AS member
      WHERE member.organization_id = role_record.organization_id
        AND member.role = 'custom'
        AND member.custom_role_id = role_record.id
    ) AS assigned_user_count,
    (
      SELECT count(*)
      FROM public.organization_invitations AS invitation
      WHERE invitation.organization_id = role_record.organization_id
        AND invitation.role = 'custom'
        AND invitation.custom_role_id = role_record.id
        AND invitation.status IN ('pending', 'send_failed')
    ) AS pending_invitation_count,
    role_record.version,
    coalesce(
      (
        SELECT array_agg(
          permission_record.permission_key
          ORDER BY permission_record.permission_key
        )
        FROM public.organization_role_permissions AS permission_record
        WHERE permission_record.organization_id = role_record.organization_id
          AND permission_record.role_id = role_record.id
      ),
      '{}'::public.organization_permission_key[]
    ) AS permission_keys
  FROM public.organization_roles AS role_record
  WHERE role_record.organization_id = p_organization_id
  ORDER BY
    CASE role_record.status WHEN 'active' THEN 0 ELSE 1 END,
    lower(role_record.name),
    role_record.id;
END;
$$;

CREATE FUNCTION public.create_organization_role(
  p_organization_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.create_organization_role_checked($1, $2);
$$;

CREATE FUNCTION public.duplicate_organization_role(
  p_organization_id uuid,
  p_role_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.duplicate_organization_role_checked($1, $2, $3);
$$;

CREATE FUNCTION public.save_organization_role(
  p_organization_id uuid,
  p_role_id uuid,
  p_name text,
  p_permission_keys public.organization_permission_key[],
  p_expected_version bigint,
  p_confirm_removals boolean
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.save_organization_role_checked($1, $2, $3, $4, $5, $6);
$$;

CREATE FUNCTION public.archive_organization_role(
  p_organization_id uuid,
  p_role_id uuid,
  p_expected_version bigint
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.archive_organization_role_checked($1, $2, $3);
$$;

CREATE FUNCTION public.get_organization_roles(
  p_organization_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  assigned_user_count bigint,
  pending_invitation_count bigint,
  version bigint,
  permission_keys public.organization_permission_key[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM app_private.get_organization_roles_checked($1);
$$;

REVOKE ALL ON TABLE public.organization_roles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.organization_role_permissions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.organization_authorization_states FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.organization_access_transition_manifests FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.organization_access_transition_manifest_items FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.organization_roles TO authenticated;
GRANT SELECT ON TABLE public.organization_role_permissions TO authenticated;
GRANT SELECT ON TABLE public.organization_authorization_states TO authenticated;
GRANT SELECT ON TABLE public.organization_access_transition_manifests TO authenticated;
GRANT SELECT ON TABLE public.organization_access_transition_manifest_items TO authenticated;

GRANT SELECT ON TABLE public.organization_roles TO service_role;
GRANT SELECT ON TABLE public.organization_role_permissions TO service_role;
GRANT SELECT ON TABLE public.organization_authorization_states TO service_role;
GRANT SELECT ON TABLE public.organization_access_transition_manifests TO service_role;
GRANT SELECT ON TABLE public.organization_access_transition_manifest_items TO service_role;

REVOKE ALL ON TYPE public.organization_permission_key FROM PUBLIC, anon;
GRANT USAGE ON TYPE public.organization_permission_key TO authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.workspace_role_scope_is_valid(text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.workspace_role_scope_is_valid(text, uuid, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION app_private.ensure_organization_authorization_state()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.organization_permission_profile_fingerprint(
  public.organization_permission_key[]
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.transition_subject_fingerprint(text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.organization_transition_manifest_fingerprint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.organization_custom_assignment_baseline_fingerprint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_organization_authorization_scope(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.lock_organization_authorization_scope(uuid, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION app_private.lock_current_organization_membership(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.mark_transition_manifest_required()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.assert_transition_manifest_targets(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.assert_transition_manifest_approvable(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.assert_transition_manifest_applied(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_transition_manifest_item()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_transition_manifest_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_custom_workspace_assignment()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.prevent_assigned_role_from_becoming_empty()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_role_permission_view_dependencies()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.prevent_assigned_role_archival()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_ordinary_access_activation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_read_organization_role(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_read_organization_role(uuid, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.can_read_organization_authorization_state(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_read_organization_authorization_state(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.normalize_organization_permission_keys(
  public.organization_permission_key[],
  public.organization_permission_key[]
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.normalized_organization_role_name(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.assert_checked_workspace_access(uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.assert_role_super_admin(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.assert_role_super_admin(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION app_private.create_organization_role_checked(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.duplicate_organization_role_checked(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.save_organization_role_checked(
  uuid,
  uuid,
  text,
  public.organization_permission_key[],
  bigint,
  boolean
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.archive_organization_role_checked(uuid, uuid, bigint)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION app_private.get_organization_roles_checked(uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION app_private.create_organization_role_checked(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.duplicate_organization_role_checked(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.save_organization_role_checked(
  uuid,
  uuid,
  text,
  public.organization_permission_key[],
  bigint,
  boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.archive_organization_role_checked(uuid, uuid, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_organization_roles_checked(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_role(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.duplicate_organization_role(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_organization_role(
  uuid,
  uuid,
  text,
  public.organization_permission_key[],
  bigint,
  boolean
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_organization_role(uuid, uuid, bigint)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_organization_roles(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_organization_invitation(
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_organization_member_access(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_organization_role(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_organization_role(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_role(
  uuid,
  uuid,
  text,
  public.organization_permission_key[],
  bigint,
  boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_organization_role(uuid, uuid, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_roles(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_access(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid
) TO authenticated;
