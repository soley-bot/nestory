-- Maintenance vendor selection must expose the same eligibility rule enforced
-- by create/update writes while preserving unchanged historical task links.

CREATE OR REPLACE FUNCTION public.get_maintenance_vendor_options(
  p_organization_id uuid
)
RETURNS TABLE (
  id uuid,
  label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT person.id, person.display_name
  FROM public.people AS person
  JOIN public.person_roles AS person_role
    ON person_role.organization_id = person.organization_id
   AND person_role.person_id = person.id
   AND person_role.role = 'vendor'
   AND person_role.status = 'active'
   AND person_role.archived_at IS NULL
  WHERE person.organization_id = p_organization_id
    AND person.archived_at IS NULL
  ORDER BY lower(person.display_name), person.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_vendor_options(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_vendor_options(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_task_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  linked_request record;
BEGIN
  SELECT request.property_id, request.unit_id
  INTO linked_request
  FROM public.tenant_requests AS request
  WHERE request.organization_id = NEW.organization_id
    AND request.id = NEW.tenant_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task request not found' USING ERRCODE = '23503';
  END IF;

  IF linked_request.property_id <> NEW.property_id THEN
    RAISE EXCEPTION 'Task property must match the request property'
      USING ERRCODE = '23503';
  END IF;

  IF linked_request.unit_id IS NOT NULL
    AND NEW.unit_id IS DISTINCT FROM linked_request.unit_id THEN
    RAISE EXCEPTION 'Task unit must match the request unit'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.organization_id = NEW.organization_id
      AND unit.id = NEW.unit_id
      AND unit.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Task unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  IF (
    TG_OP = 'INSERT'
    OR NEW.vendor_person_id IS DISTINCT FROM OLD.vendor_person_id
  )
    AND NEW.vendor_person_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id = person.organization_id
       AND person_role.person_id = person.id
       AND person_role.role = 'vendor'
       AND person_role.status = 'active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id = NEW.organization_id
        AND person.id = NEW.vendor_person_id
        AND person.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Vendor not found' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DO $migration$
DECLARE
  function_definition text;
  original_guard constant text :=
    'IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (';
  historical_guard constant text :=
    'IF p_vendor_person_id IS DISTINCT FROM old_task.vendor_person_id'
    || E'\n    AND p_vendor_person_id IS NOT NULL'
    || E'\n    AND NOT EXISTS (';
  guard_count integer;
BEGIN
  SELECT pg_get_functiondef(
    (
      'app_private.update_maintenance_task_legacy_checked('
      || 'uuid,uuid,uuid,uuid,text,text,text,text,text,date,time,date,time,'
      || 'uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,'
      || 'text,boolean,uuid,uuid)'
    )::regprocedure
  )
  INTO function_definition;

  guard_count := (
    length(function_definition)
    - length(replace(function_definition, original_guard, ''))
  ) / length(original_guard);

  IF guard_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one maintenance vendor guard, found %',
      guard_count;
  END IF;

  function_definition := replace(
    function_definition,
    original_guard,
    historical_guard
  );

  EXECUTE function_definition;
END;
$migration$;
