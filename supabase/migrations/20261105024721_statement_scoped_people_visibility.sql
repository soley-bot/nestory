-- Cache caller authorization once per organization in this statement. The
-- relationship predicates intentionally match person_is_visible_in_branch and
-- its explicit-relationship wrapper; those helpers remain available unchanged
-- for checked RPCs and other policies.
-- Admin SELECT authorization must not depend on an existing person row:
-- INSERT/UPSERT RETURNING checks SELECT against the new row as well.
CREATE FUNCTION app_private.current_admin_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT member.organization_id
  FROM public.organization_members AS member
  WHERE member.user_id = (SELECT auth.uid())
    AND app_private.is_org_admin(member.organization_id);
$$;
REVOKE ALL ON FUNCTION app_private.current_admin_organization_ids()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.current_admin_organization_ids() TO authenticated;

CREATE FUNCTION app_private.current_branch_visible_people()
RETURNS TABLE (organization_id uuid, person_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller_context AS MATERIALIZED (
    SELECT
      member.organization_id,
      app_private.current_active_branch_id(member.organization_id) AS branch_id,
      app_private.has_org_permission(
        member.organization_id, 'people.view'::public.organization_permission_key
      ) AS can_view_people
    FROM public.organization_members AS member
    WHERE member.user_id = (SELECT auth.uid())
  ), authorized_context AS MATERIALIZED (
    SELECT *
    FROM caller_context
    WHERE branch_id IS NOT NULL AND can_view_people
  )
  SELECT person.organization_id, person.id
  FROM public.people AS person
  JOIN authorized_context AS scope
    ON scope.organization_id = person.organization_id
  WHERE (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = person.organization_id
          AND member.user_id = (SELECT auth.uid())
          AND member.role = 'custom'
          AND member.branch_id = scope.branch_id
          AND member.person_id = person.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.property_owners AS owner_link
        WHERE owner_link.organization_id = person.organization_id
          AND owner_link.person_id = person.id
          AND owner_link.archived_at IS NULL
          AND owner_link.started_on <= current_date
          AND (owner_link.ended_on IS NULL OR owner_link.ended_on > current_date)
          AND app_private.property_branch_id(
            owner_link.organization_id,
            owner_link.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.leases AS lease
        WHERE lease.organization_id = person.organization_id
          AND lease.primary_tenant_person_id = person.id
          AND lease.archived_at IS NULL
          AND lease.status IN ('draft', 'active', 'notice_given')
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_parties AS party
        JOIN public.leases AS lease
          ON lease.organization_id = party.organization_id
         AND lease.id = party.lease_id
         AND lease.archived_at IS NULL
         AND lease.status IN ('draft', 'active', 'notice_given')
        WHERE party.organization_id = person.organization_id
          AND party.person_id = person.id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND (party.ended_on IS NULL OR party.ended_on >= current_date)
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = scope.branch_id
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
        WHERE party.organization_id = person.organization_id
          AND party.person_id = person.id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND app_private.property_branch_id(
            occupancy.organization_id,
            occupancy.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_requests AS request
        WHERE request.organization_id = person.organization_id
          AND request.requested_by_person_id = person.id
          AND request.archived_at IS NULL
          AND app_private.property_branch_id(
            request.organization_id,
            request.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tasks AS task
        WHERE task.organization_id = person.organization_id
          AND person.id IN (task.vendor_person_id, task.assignee_person_id)
          AND task.archived_at IS NULL
          AND task.branch_id = scope.branch_id
          AND app_private.property_branch_id(
            task.organization_id,
            task.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.maintenance_recurrence_revisions AS revision
        JOIN public.maintenance_recurrence_series AS series
          ON series.organization_id = revision.organization_id
         AND series.id = revision.series_id
        WHERE revision.organization_id = person.organization_id
          AND person.id IN (
            revision.vendor_person_id,
            revision.assignee_person_id
          )
          AND revision.superseded_at IS NULL
          AND series.lifecycle IN ('active', 'paused')
          AND series.retired_at IS NULL
          AND series.branch_id = scope.branch_id
          AND app_private.property_branch_id(
            series.organization_id,
            series.property_id
          ) = scope.branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.person_branch_relationships AS relationship
        WHERE relationship.organization_id = person.organization_id
          AND relationship.person_id = person.id
          AND relationship.branch_id = scope.branch_id
          AND relationship.archived_at IS NULL
      )
    );
$$;

COMMENT ON FUNCTION app_private.current_branch_visible_people()
IS 'Current authenticated caller branch-visible-person keys. Statement-scoped RLS subquery; caches authorization per caller organization and preserves the established branch relationship predicates.';

REVOKE ALL ON FUNCTION app_private.current_branch_visible_people()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.current_branch_visible_people() TO authenticated;

-- The former ALL policies also participated in SELECT and repeated the admin
-- lookup per row. Preserve their exact write predicates as command policies,
-- and combine both existing read paths into one uncorrelated set membership.
DROP POLICY "Admins can manage people" ON public.people;
CREATE POLICY "Admins can insert people" ON public.people
FOR INSERT TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update people" ON public.people
FOR UPDATE TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete people" ON public.people
FOR DELETE TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY "Admins can manage person roles" ON public.person_roles;
CREATE POLICY "Admins can insert person roles" ON public.person_roles
FOR INSERT TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can update person roles" ON public.person_roles
FOR UPDATE TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));
CREATE POLICY "Admins can delete person roles" ON public.person_roles
FOR DELETE TO authenticated
USING (app_private.is_org_admin(organization_id));

ALTER POLICY "Authorized users can read people" ON public.people
USING (
  CASE WHEN organization_id IN (
    SELECT app_private.current_admin_organization_ids()
  ) THEN true ELSE (organization_id, id) IN (
    SELECT visible.organization_id, visible.person_id
    FROM app_private.current_branch_visible_people() AS visible
  ) END
);
ALTER POLICY "Authorized users can read person roles" ON public.person_roles
USING (
  CASE WHEN organization_id IN (
    SELECT app_private.current_admin_organization_ids()
  ) THEN true ELSE (organization_id, person_id) IN (
    SELECT visible.organization_id, visible.person_id
    FROM app_private.current_branch_visible_people() AS visible
  ) END
);
