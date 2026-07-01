ALTER TABLE public.person_roles
  DROP CONSTRAINT IF EXISTS person_roles_role_check;

ALTER TABLE public.person_roles
  ADD CONSTRAINT person_roles_role_check
  CHECK (role IN ('tenant', 'owner', 'vendor', 'staff'));

CREATE OR REPLACE FUNCTION app_private.sync_person_roles(
  p_organization_id uuid,
  p_person_id uuid,
  p_roles text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  normalized_roles text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS role_name
    WHERE role_name IS NULL
      OR role_name NOT IN ('tenant', 'owner', 'vendor', 'staff')
  ) THEN
    RAISE EXCEPTION 'Person role is not supported' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT role_name ORDER BY role_name), ARRAY[]::text[])
  INTO normalized_roles
  FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS role_name;

  IF coalesce(array_length(normalized_roles, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one role' USING ERRCODE = '22023';
  END IF;

  UPDATE public.person_roles
  SET
    archived_at = NULL,
    archived_by = NULL,
    status = 'active',
    updated_by = (SELECT auth.uid())
  WHERE organization_id = p_organization_id
    AND person_id = p_person_id
    AND role = ANY(normalized_roles);

  INSERT INTO public.person_roles (
    organization_id,
    person_id,
    role,
    status,
    created_by,
    updated_by
  )
  SELECT
    p_organization_id,
    p_person_id,
    role_name,
    'active',
    (SELECT auth.uid()),
    (SELECT auth.uid())
  FROM unnest(normalized_roles) AS role_name
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_roles
    WHERE organization_id = p_organization_id
      AND person_id = p_person_id
      AND role = role_name
  );

  UPDATE public.person_roles
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    status = 'inactive',
    updated_by = (SELECT auth.uid())
  WHERE organization_id = p_organization_id
    AND person_id = p_person_id
    AND archived_at IS NULL
    AND NOT role = ANY(normalized_roles);

  RETURN normalized_roles;
END;
$$;
