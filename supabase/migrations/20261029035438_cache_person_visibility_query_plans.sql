-- Cache the unchanged relationship queries after the shared permission helpers.
-- The preceding NULL-branch shortcut remains intact. Both exact predecessor
-- definitions are pinned; CREATE OR REPLACE preserves owner, ACL and all policy
-- callers. No permission predicate, visibility scope or function grant changes.
DO $guard$
DECLARE predecessor record;
BEGIN
 FOR predecessor IN SELECT * FROM (VALUES
 ('app_private.person_is_visible_in_branch_without_explicit_relationship(uuid,uuid,uuid)','165ad014bc3aa88c7cb18463ecbe53f03aab2cd6571d5c8991224da7e0631c82'),
 ('app_private.person_is_visible_in_branch(uuid,uuid,uuid)','c406681f51077b21d3c025dd4f5b043cc803061a33ec897916dc4ef50e915ee8')
 ) expected(signature,sha256)
 LOOP
  IF pg_catalog.encode(extensions.digest(pg_catalog.replace(
    pg_catalog.pg_get_functiondef(predecessor.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')
    IS DISTINCT FROM predecessor.sha256 THEN
   RAISE EXCEPTION 'person_visibility_query_plan_predecessor_changed: %',predecessor.signature;
  END IF;
 END LOOP;
END;
$guard$;

CREATE OR REPLACE FUNCTION app_private.person_is_visible_in_branch_without_explicit_relationship(p_organization_id uuid, p_person_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN (SELECT
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
    ));
END;
$function$
;

CREATE OR REPLACE FUNCTION app_private.person_is_visible_in_branch(p_organization_id uuid, p_person_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN (SELECT CASE WHEN p_branch_id IS NULL THEN false ELSE
    app_private.person_is_visible_in_branch_without_explicit_relationship($1,$2,$3)
    OR (
      app_private.has_org_permission(
        $1,
        'people.view'::public.organization_permission_key
      )
      AND app_private.current_active_branch_id($1) = $3
      AND EXISTS (
        SELECT 1
        FROM public.people AS person
        JOIN public.person_branch_relationships AS relationship
          ON relationship.organization_id = person.organization_id
         AND relationship.person_id = person.id
         AND relationship.branch_id = $3
         AND relationship.archived_at IS NULL
        WHERE person.organization_id = $1
          AND person.id = $2
      )
    )
  END);
END;
$function$
;
