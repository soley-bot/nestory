CREATE FUNCTION app_private.has_org_permission(
  p_organization_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id = member.organization_id
       AND authorization_state.ordinary_access_enabled
      JOIN public.organization_branches AS branch
        ON branch.organization_id = member.organization_id
       AND branch.id = member.branch_id
       AND branch.status = 'active'
       AND branch.archived_at IS NULL
      JOIN public.organization_roles AS role_record
        ON role_record.organization_id = member.organization_id
       AND role_record.id = member.custom_role_id
       AND role_record.status = 'active'
       AND role_record.archived_at IS NULL
      JOIN public.organization_role_permissions AS permission_record
        ON permission_record.organization_id = role_record.organization_id
       AND permission_record.role_id = role_record.id
       AND permission_record.permission_key = p_permission_key
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'custom'
        AND member.branch_id IS NOT NULL
        AND member.custom_role_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_role_permissions AS nonempty_permission
          WHERE nonempty_permission.organization_id = role_record.organization_id
            AND nonempty_permission.role_id = role_record.id
        )
    );
$$;

COMMENT ON FUNCTION app_private.has_org_permission(uuid, public.organization_permission_key)
IS 'Current database-backed organization permission. Super Admin bypasses permission keys only inside its organization; ordinary access requires an enabled state, active branch, and active nonempty custom role.';

CREATE FUNCTION app_private.current_active_branch_id(
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT member.branch_id
  FROM public.organization_members AS member
  JOIN public.organization_authorization_states AS authorization_state
    ON authorization_state.organization_id = member.organization_id
   AND authorization_state.ordinary_access_enabled
  JOIN public.organization_branches AS branch
    ON branch.organization_id = member.organization_id
   AND branch.id = member.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  JOIN public.organization_roles AS role_record
    ON role_record.organization_id = member.organization_id
   AND role_record.id = member.custom_role_id
   AND role_record.status = 'active'
   AND role_record.archived_at IS NULL
  WHERE member.organization_id = p_organization_id
    AND member.user_id = (SELECT auth.uid())
    AND member.role = 'custom'
    AND member.branch_id IS NOT NULL
    AND member.custom_role_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_role_permissions AS permission_record
      WHERE permission_record.organization_id = role_record.organization_id
        AND permission_record.role_id = role_record.id
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION app_private.current_active_branch_id(uuid)
IS 'Returns the caller current branch only for an enabled, active, nonempty custom-role assignment. Super Admin and legacy ordinary roles have no ordinary branch.';

CREATE FUNCTION app_private.can_access_branch(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_branches AS branch
        ON branch.organization_id = member.organization_id
       AND branch.id = p_branch_id
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'super_admin'
    )
    OR (
      app_private.current_active_branch_id(p_organization_id) = p_branch_id
      AND EXISTS (
        SELECT 1
        FROM public.organization_branches AS branch
        WHERE branch.organization_id = p_organization_id
          AND branch.id = p_branch_id
          AND branch.status = 'active'
          AND branch.archived_at IS NULL
      )
    );
$$;

COMMENT ON FUNCTION app_private.can_access_branch(uuid, uuid)
IS 'Super Admin may access any branch in its organization. An ordinary caller may access exactly the active branch on its valid custom assignment.';

CREATE FUNCTION app_private.property_branch_id(
  p_organization_id uuid,
  p_property_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT property.branch_id
  FROM public.properties AS property
  JOIN public.organization_branches AS branch
    ON branch.organization_id = property.organization_id
   AND branch.id = property.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION app_private.property_branch_id(uuid, uuid)
IS 'Returns an active same-organization Property branch. Null, inactive, archived, cross-organization, or otherwise unresolved scope returns null and is never guessed.';

CREATE FUNCTION app_private.can_access_property(
  p_organization_id uuid,
  p_property_id uuid,
  p_permission_key public.organization_permission_key
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
      JOIN public.properties AS property
        ON property.organization_id = member.organization_id
       AND property.id = p_property_id
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'super_admin'
    )
    OR (
      app_private.has_org_permission(p_organization_id, p_permission_key)
      AND app_private.current_active_branch_id(p_organization_id)
        = app_private.property_branch_id(p_organization_id, p_property_id)
    ),
    false
  );
$$;

COMMENT ON FUNCTION app_private.can_access_property(uuid, uuid, public.organization_permission_key)
IS 'Super Admin sees every Property in its organization. Ordinary access requires the exact permission and exact active assigned branch; unresolved scope is denied.';

CREATE FUNCTION app_private.person_is_visible_in_branch(
  p_organization_id uuid,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.people AS person
      WHERE person.organization_id = p_organization_id
        AND person.id = p_person_id
    )
    AND app_private.has_org_permission(
      p_organization_id,
      'people.view'::public.organization_permission_key
    )
    AND app_private.current_active_branch_id(p_organization_id) = p_branch_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = p_organization_id
          AND member.user_id = (SELECT auth.uid())
          AND member.role = 'custom'
          AND member.branch_id = p_branch_id
          AND member.person_id = p_person_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.property_owners AS owner_link
        WHERE owner_link.organization_id = p_organization_id
          AND owner_link.person_id = p_person_id
          AND owner_link.archived_at IS NULL
          AND owner_link.started_on <= current_date
          AND (owner_link.ended_on IS NULL OR owner_link.ended_on > current_date)
          AND app_private.property_branch_id(
            owner_link.organization_id,
            owner_link.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.leases AS lease
        WHERE lease.organization_id = p_organization_id
          AND lease.primary_tenant_person_id = p_person_id
          AND lease.archived_at IS NULL
          AND lease.status IN ('draft', 'active', 'notice_given')
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_parties AS party
        JOIN public.leases AS lease
          ON lease.organization_id = party.organization_id
         AND lease.id = party.lease_id
         AND lease.archived_at IS NULL
         AND lease.status IN ('draft', 'active', 'notice_given')
        WHERE party.organization_id = p_organization_id
          AND party.person_id = p_person_id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND (party.ended_on IS NULL OR party.ended_on >= current_date)
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_parties AS party
        JOIN public.lease_occupancies AS occupancy
          ON occupancy.organization_id = party.organization_id
         AND occupancy.lease_id = party.lease_id
         AND occupancy.archived_at IS NULL
         AND occupancy.evidence_state = 'accepted'
         AND occupancy.business_lifecycle IN ('reserved', 'occupied', 'notice_given')
        WHERE party.organization_id = p_organization_id
          AND party.person_id = p_person_id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND app_private.property_branch_id(
            occupancy.organization_id,
            occupancy.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_requests AS request
        WHERE request.organization_id = p_organization_id
          AND request.requested_by_person_id = p_person_id
          AND request.archived_at IS NULL
          AND app_private.property_branch_id(
            request.organization_id,
            request.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tasks AS task
        WHERE task.organization_id = p_organization_id
          AND p_person_id IN (task.vendor_person_id, task.assignee_person_id)
          AND task.archived_at IS NULL
          AND task.branch_id = p_branch_id
          AND app_private.property_branch_id(
            task.organization_id,
            task.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.maintenance_recurrence_revisions AS revision
        JOIN public.maintenance_recurrence_series AS series
          ON series.organization_id = revision.organization_id
         AND series.id = revision.series_id
        WHERE revision.organization_id = p_organization_id
          AND p_person_id IN (
            revision.vendor_person_id,
            revision.assignee_person_id
          )
          AND revision.superseded_at IS NULL
          AND series.lifecycle IN ('active', 'paused')
          AND series.retired_at IS NULL
          AND series.branch_id = p_branch_id
          AND app_private.property_branch_id(
            series.organization_id,
            series.property_id
          ) = p_branch_id
      )
    );
$$;

COMMENT ON FUNCTION app_private.person_is_visible_in_branch(uuid, uuid, uuid)
IS 'Returns true only for a valid people.view caller and an exact active branch relationship: own membership identity, current ownership, current lease primary/party/occupancy, tenant request requester, maintenance task vendor/assignee, or current recurrence vendor/assignee.';

REVOKE ALL ON FUNCTION app_private.has_org_permission(uuid, public.organization_permission_key)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.current_active_branch_id(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_access_branch(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.property_branch_id(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_access_property(uuid, uuid, public.organization_permission_key)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.person_is_visible_in_branch(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_private.has_org_permission(uuid, public.organization_permission_key)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_active_branch_id(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_branch(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_property(uuid, uuid, public.organization_permission_key)
  TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.person_is_visible_in_branch(uuid, uuid, uuid)
  TO authenticated;

CREATE INDEX maintenance_recurrence_revisions_org_vendor_idx
  ON public.maintenance_recurrence_revisions (
    organization_id,
    vendor_person_id,
    series_id
  )
  WHERE vendor_person_id IS NOT NULL AND superseded_at IS NULL;

CREATE INDEX maintenance_recurrence_revisions_org_assignee_idx
  ON public.maintenance_recurrence_revisions (
    organization_id,
    assignee_person_id,
    series_id
  )
  WHERE assignee_person_id IS NOT NULL AND superseded_at IS NULL;

CREATE INDEX maintenance_recurrence_series_org_scope_idx
  ON public.maintenance_recurrence_series (
    organization_id,
    branch_id,
    property_id,
    lifecycle
  )
  WHERE retired_at IS NULL;

CREATE INDEX tenant_requests_org_requester_idx
  ON public.tenant_requests (
    organization_id,
    requested_by_person_id,
    property_id
  )
  WHERE requested_by_person_id IS NOT NULL AND archived_at IS NULL;

DROP POLICY IF EXISTS "Members can read properties" ON public.properties;
DROP POLICY IF EXISTS "Members can read units" ON public.units;
DROP POLICY IF EXISTS "Members can read people" ON public.people;
DROP POLICY IF EXISTS "Members can read person roles" ON public.person_roles;
DROP POLICY IF EXISTS "Members can read asset photos" ON public.asset_photos;
DROP POLICY IF EXISTS "Members can read organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can read branches" ON public.organization_branches;
DROP POLICY IF EXISTS "Members can read organization memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Members can read teams" ON public.organization_teams;

CREATE POLICY "Authorized users can read properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  app_private.can_access_property(
    organization_id,
    id,
    'properties.view'::public.organization_permission_key
  )
);

CREATE POLICY "Authorized users can read units"
ON public.units
FOR SELECT
TO authenticated
USING (
  app_private.can_access_property(
    organization_id,
    property_id,
    'properties.view'::public.organization_permission_key
  )
);

CREATE POLICY "Authorized users can read asset photos"
ON public.asset_photos
FOR SELECT
TO authenticated
USING (
  app_private.can_access_property(
    organization_id,
    property_id,
    'properties.view'::public.organization_permission_key
  )
  AND (
    unit_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.units AS scoped_unit
      WHERE scoped_unit.organization_id = asset_photos.organization_id
        AND scoped_unit.id = asset_photos.unit_id
        AND scoped_unit.property_id = asset_photos.property_id
    )
  )
);

CREATE POLICY "Authorized users can read organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  app_private.current_active_branch_id(id) IS NOT NULL
);

CREATE POLICY "Authorized users can read branches"
ON public.organization_branches
FOR SELECT
TO authenticated
USING (
  app_private.can_access_branch(organization_id, id)
);

CREATE POLICY "Authorized users can read own membership"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND app_private.current_active_branch_id(organization_id) IS NOT NULL
);

CREATE POLICY "Authorized users can read people"
ON public.people
FOR SELECT
TO authenticated
USING (
  app_private.person_is_visible_in_branch(
    organization_id,
    id,
    app_private.current_active_branch_id(organization_id)
  )
);

CREATE POLICY "Authorized users can read person roles"
ON public.person_roles
FOR SELECT
TO authenticated
USING (
  app_private.person_is_visible_in_branch(
    organization_id,
    person_id,
    app_private.current_active_branch_id(organization_id)
  )
);

REVOKE ALL ON TABLE
  public.properties,
  public.units,
  public.people,
  public.person_roles,
  public.asset_photos,
  public.organizations,
  public.organization_branches,
  public.organization_members,
  public.organization_invitations,
  public.organization_teams
FROM anon;

GRANT SELECT ON TABLE
  public.properties,
  public.units,
  public.people,
  public.person_roles,
  public.asset_photos,
  public.organizations,
  public.organization_branches,
  public.organization_members,
  public.organization_invitations,
  public.organization_teams
TO authenticated;
