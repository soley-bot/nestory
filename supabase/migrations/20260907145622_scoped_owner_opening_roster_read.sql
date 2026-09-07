-- The legacy organization-wide roster RPC retains its fail-closed authority.
-- This projection exposes only the caller's existing Finance-readable property
-- scope and validates assignments without granting access to admin base tables.
CREATE FUNCTION app_private.owner_opening_roster_scope(
  p_organization_id uuid, p_cutover_date date, p_property_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id, 'finance.view')) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_cutover_date IS NULL THEN
    RAISE EXCEPTION 'Owner roster date required' USING ERRCODE = '22023';
  END IF;
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.organization_id = p_organization_id AND property.id = p_property_id
      AND app_private.can_access_property(p_organization_id, property.id, 'finance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  WITH allowed_properties AS MATERIALIZED (
    SELECT property.id, property.archived_at
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND (p_property_id IS NULL OR property.id = p_property_id)
      AND app_private.can_access_property(p_organization_id, property.id, 'finance.view')
  ), scoped_readiness AS MATERIALIZED (
    SELECT roster.* FROM app_private.owner_roster_legacy_preflight(p_cutover_date) AS roster
    JOIN allowed_properties AS property ON property.id = roster.property_id
    WHERE roster.organization_id = p_organization_id
  ), ready_properties AS (
    SELECT roster.property_id FROM scoped_readiness AS roster
    JOIN allowed_properties AS property ON property.id = roster.property_id
    WHERE roster.boundary_date = p_cutover_date AND roster.issue_code IS NULL
      AND property.archived_at IS NULL
      -- Preflight's join must never hide a mismatched person identity.
      AND NOT EXISTS (
        SELECT 1 FROM public.property_owners AS assignment
        WHERE assignment.organization_id = p_organization_id
          AND assignment.property_id = roster.property_id AND assignment.archived_at IS NULL
          AND assignment.started_on <= p_cutover_date
          AND (assignment.ended_on IS NULL OR p_cutover_date < assignment.ended_on)
          AND NOT EXISTS (
            SELECT 1 FROM public.people AS person
            JOIN public.person_roles AS role ON role.organization_id = person.organization_id
              AND role.person_id = person.id AND role.role = 'owner'
              AND role.status = 'active' AND role.archived_at IS NULL
            WHERE person.organization_id = assignment.organization_id
              AND person.id = assignment.person_id AND person.archived_at IS NULL
          )
      )
  )
  SELECT jsonb_build_object(
    'readiness', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'organization_id', roster.organization_id, 'property_id', roster.property_id,
      'boundary_date', roster.boundary_date, 'next_boundary_date', roster.next_boundary_date,
      'issue_code', roster.issue_code, 'property_owner_ids', roster.property_owner_ids,
      'active_owner_count', roster.active_owner_count,
      'ownership_percent_total_text', roster.ownership_percent_total::text,
      'canonical_roster', roster.canonical_roster, 'ownership_roster_hash', roster.ownership_roster_hash,
      'setup_path', '/properties/' || roster.property_id::text
    ) ORDER BY roster.property_id, roster.boundary_date, roster.issue_code, roster.property_owner_ids)
      FROM scoped_readiness AS roster WHERE roster.issue_code IS NOT NULL), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', assignment.id, 'organization_id', assignment.organization_id,
      'property_id', assignment.property_id, 'person_id', assignment.person_id,
      'ownership_percent_text', assignment.ownership_percent::text,
      'started_on', assignment.started_on, 'ended_on', assignment.ended_on,
      'archived_at', assignment.archived_at
    ) ORDER BY assignment.property_id, assignment.id)
      FROM public.property_owners AS assignment
      JOIN ready_properties AS property ON property.property_id = assignment.property_id
      WHERE assignment.organization_id = p_organization_id AND assignment.archived_at IS NULL
        AND assignment.started_on <= p_cutover_date
        AND (assignment.ended_on IS NULL OR p_cutover_date < assignment.ended_on)), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.get_owner_opening_roster_scope(
  p_organization_id uuid, p_cutover_date date, p_property_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT app_private.owner_opening_roster_scope(p_organization_id, p_cutover_date, p_property_id); $$;

ALTER FUNCTION app_private.owner_opening_roster_scope(uuid,date,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_owner_opening_roster_scope(uuid,date,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_opening_roster_scope(uuid,date,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_owner_opening_roster_scope(uuid,date,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.owner_opening_roster_scope(uuid,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_opening_roster_scope(uuid,date,uuid) TO authenticated;
