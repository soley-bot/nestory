CREATE OR REPLACE FUNCTION public.create_property(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_owner text,
  p_address text,
  p_status text,
  p_acquisition_date date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_property_id uuid;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_property_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_name) = 0 THEN
    RAISE EXCEPTION 'Property name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Property name is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) = 0 THEN
    RAISE EXCEPTION 'Property code is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) > 24 THEN
    RAISE EXCEPTION 'Property code is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) = 0 THEN
    RAISE EXCEPTION 'Property type is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) > 80 THEN
    RAISE EXCEPTION 'Property type is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN
    RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.properties (
    organization_id,
    name,
    code,
    property_type,
    owner,
    address,
    status,
    acquisition_date,
    notes,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    normalized_name,
    normalized_code,
    normalized_property_type,
    NULLIF(trim(coalesce(p_owner, '')), ''),
    NULLIF(trim(coalesce(p_address, '')), ''),
    normalized_status,
    p_acquisition_date,
    NULLIF(trim(coalesce(p_notes, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_property_id;

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
    'property',
    new_property_id,
    'property_created',
    jsonb_build_object(
      'name', normalized_name,
      'code', normalized_code,
      'property_type', normalized_property_type,
      'owner', NULLIF(trim(coalesce(p_owner, '')), ''),
      'address', NULLIF(trim(coalesce(p_address, '')), ''),
      'status', normalized_status,
      'acquisition_date', p_acquisition_date,
      'notes', NULLIF(trim(coalesce(p_notes, '')), ''),
      'archived_at', NULL,
      'archived_by', NULL
    )
  );

  RETURN new_property_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_property(
  p_property_id uuid,
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_owner text,
  p_address text,
  p_status text,
  p_acquisition_date date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_property public.properties%ROWTYPE;
  new_property public.properties%ROWTYPE;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_property_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_property
  FROM public.properties
  WHERE id = p_property_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_name) = 0 THEN
    RAISE EXCEPTION 'Property name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Property name is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) = 0 THEN
    RAISE EXCEPTION 'Property code is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) > 24 THEN
    RAISE EXCEPTION 'Property code is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) = 0 THEN
    RAISE EXCEPTION 'Property type is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) > 80 THEN
    RAISE EXCEPTION 'Property type is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN
    RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.properties
  SET
    name = normalized_name,
    code = normalized_code,
    property_type = normalized_property_type,
    owner = NULLIF(trim(coalesce(p_owner, '')), ''),
    address = NULLIF(trim(coalesce(p_address, '')), ''),
    status = normalized_status,
    acquisition_date = p_acquisition_date,
    notes = NULLIF(trim(coalesce(p_notes, '')), ''),
    updated_by = (SELECT auth.uid())
  WHERE id = p_property_id
  RETURNING * INTO new_property;

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
    'property',
    p_property_id,
    'property_updated',
    jsonb_build_object(
      'name', old_property.name,
      'code', old_property.code,
      'property_type', old_property.property_type,
      'owner', old_property.owner,
      'address', old_property.address,
      'status', old_property.status,
      'acquisition_date', old_property.acquisition_date,
      'notes', old_property.notes,
      'archived_at', old_property.archived_at,
      'archived_by', old_property.archived_by
    ),
    jsonb_build_object(
      'name', new_property.name,
      'code', new_property.code,
      'property_type', new_property.property_type,
      'owner', new_property.owner,
      'address', new_property.address,
      'status', new_property.status,
      'acquisition_date', new_property.acquisition_date,
      'notes', new_property.notes,
      'archived_at', new_property.archived_at,
      'archived_by', new_property.archived_by
    )
  );

  RETURN p_property_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_property(
  p_property_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_property public.properties%ROWTYPE;
  new_property public.properties%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_property
  FROM public.properties
  WHERE id = p_property_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.units
    WHERE property_id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property has active units' USING ERRCODE = '23503';
  END IF;

  UPDATE public.properties
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_property_id
  RETURNING * INTO new_property;

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
    'property',
    p_property_id,
    'property_archived',
    jsonb_build_object(
      'name', old_property.name,
      'code', old_property.code,
      'property_type', old_property.property_type,
      'owner', old_property.owner,
      'address', old_property.address,
      'status', old_property.status,
      'acquisition_date', old_property.acquisition_date,
      'notes', old_property.notes,
      'archived_at', old_property.archived_at,
      'archived_by', old_property.archived_by
    ),
    jsonb_build_object(
      'name', new_property.name,
      'code', new_property.code,
      'property_type', new_property.property_type,
      'owner', new_property.owner,
      'address', new_property.address,
      'status', new_property.status,
      'acquisition_date', new_property.acquisition_date,
      'notes', new_property.notes,
      'archived_at', new_property.archived_at,
      'archived_by', new_property.archived_by
    )
  );

  RETURN p_property_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_property(
  p_property_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_property public.properties%ROWTYPE;
  new_property public.properties%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_property
  FROM public.properties
  WHERE id = p_property_id
    AND organization_id = p_organization_id
    AND archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.properties
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_property_id
  RETURNING * INTO new_property;

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
    'property',
    p_property_id,
    'property_restored',
    jsonb_build_object(
      'name', old_property.name,
      'code', old_property.code,
      'property_type', old_property.property_type,
      'owner', old_property.owner,
      'address', old_property.address,
      'status', old_property.status,
      'acquisition_date', old_property.acquisition_date,
      'notes', old_property.notes,
      'archived_at', old_property.archived_at,
      'archived_by', old_property.archived_by
    ),
    jsonb_build_object(
      'name', new_property.name,
      'code', new_property.code,
      'property_type', new_property.property_type,
      'owner', new_property.owner,
      'address', new_property.address,
      'status', new_property.status,
      'acquisition_date', new_property.acquisition_date,
      'notes', new_property.notes,
      'archived_at', new_property.archived_at,
      'archived_by', new_property.archived_by
    )
  );

  RETURN p_property_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_property(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.archive_property(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_property(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_property(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_property(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.archive_property(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_property(uuid, uuid) TO authenticated;
