-- Read-only account selectors retain historical assignments and invalid-roster
-- accounts. Roster readiness and all financial authority remain separate.
CREATE FUNCTION app_private.owner_account_read_context(
  p_organization_id uuid, p_requested_property_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id, 'finance.view')) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_requested_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties property
    WHERE property.organization_id=p_organization_id AND property.id=p_requested_property_id
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- The requested property is checked above, but selectors retain every allowed
  -- property so selecting one account does not remove other authorized choices.
  WITH allowed_properties AS MATERIALIZED (
    SELECT property.id,property.code,property.name
    FROM public.properties property
    WHERE property.organization_id=p_organization_id AND property.archived_at IS NULL
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ), assignments AS MATERIALIZED (
    SELECT assignment.id,assignment.property_id,assignment.person_id,
      assignment.started_on,assignment.ended_on
    FROM public.property_owners assignment
    JOIN allowed_properties property ON property.id=assignment.property_id
    JOIN public.people person ON person.id=assignment.person_id
      AND person.organization_id=assignment.organization_id AND person.archived_at IS NULL
    WHERE assignment.organization_id=p_organization_id AND assignment.archived_at IS NULL
    -- Deliberately no current-date, share-total or active-owner-role filter:
    -- historical account inspection and remediation must remain discoverable.
  ), owners AS (
    SELECT person.id,person.display_name FROM public.people person
    WHERE person.organization_id=p_organization_id AND person.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM assignments assignment WHERE assignment.person_id=person.id)
  )
  SELECT jsonb_build_object(
    'properties',coalesce((SELECT jsonb_agg(to_jsonb(property) ORDER BY property.code,property.id)
      FROM allowed_properties property),'[]'::jsonb),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.display_name,person.id)
      FROM owners person),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_agg(to_jsonb(assignment) ORDER BY assignment.started_on,assignment.id)
      FROM assignments assignment),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.get_owner_account_read_context(
  p_organization_id uuid, p_requested_property_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT app_private.owner_account_read_context(p_organization_id,p_requested_property_id); $$;

ALTER FUNCTION app_private.owner_account_read_context(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_owner_account_read_context(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_account_read_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_owner_account_read_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.owner_account_read_context(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_account_read_context(uuid,uuid) TO authenticated;
