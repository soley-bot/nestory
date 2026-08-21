-- Preserve unknown separately from intentional zero while keeping physical
-- room counts inside a conservative, operator-safe range.
ALTER TABLE public.units
  ADD COLUMN bedroom_count smallint,
  ADD COLUMN bathroom_count smallint,
  ADD CONSTRAINT units_bedroom_count_check
    CHECK (bedroom_count IS NULL OR bedroom_count BETWEEN 0 AND 100),
  ADD CONSTRAINT units_bathroom_count_check
    CHECK (bathroom_count IS NULL OR bathroom_count BETWEEN 0 AND 100);

DROP FUNCTION IF EXISTS public.create_unit(
  uuid, uuid, text, text, numeric, text
);

CREATE FUNCTION public.create_unit(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_bedroom_count numeric,
  p_bathroom_count numeric,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public, app_private
AS $$
DECLARE
  new_unit_id uuid;
  normalized_floor text := NULLIF(trim(coalesce(p_floor, '')), '');
  normalized_status text := lower(trim(coalesce(p_status, '')));
  normalized_unit_number text := trim(coalesce(p_unit_number, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_unit_number) = 0 THEN
    RAISE EXCEPTION 'Unit number is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_unit_number) > 40 THEN
    RAISE EXCEPTION 'Unit number is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_floor IS NOT NULL AND length(normalized_floor) > 40 THEN
    RAISE EXCEPTION 'Floor is too long' USING ERRCODE = '22023';
  END IF;

  IF p_size_sqm IS NOT NULL AND p_size_sqm < 0 THEN
    RAISE EXCEPTION 'Size cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_bedroom_count IS NOT NULL AND (
    p_bedroom_count < 0
    OR p_bedroom_count > 100
    OR p_bedroom_count <> trunc(p_bedroom_count)
  ) THEN
    RAISE EXCEPTION 'Bedroom count must be a whole number from 0 to 100'
      USING ERRCODE = '22023';
  END IF;

  IF p_bathroom_count IS NOT NULL AND (
    p_bathroom_count < 0
    OR p_bathroom_count > 100
    OR p_bathroom_count <> trunc(p_bathroom_count)
  ) THEN
    RAISE EXCEPTION 'Bathroom count must be a whole number from 0 to 100'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('vacant', 'occupied', 'reserved', 'maintenance', 'inactive') THEN
    RAISE EXCEPTION 'Unit status is not supported' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.units (
    organization_id,
    property_id,
    unit_number,
    floor,
    size_sqm,
    bedroom_count,
    bathroom_count,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    normalized_unit_number,
    normalized_floor,
    p_size_sqm,
    p_bedroom_count::smallint,
    p_bathroom_count::smallint,
    normalized_status,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_unit_id;

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
    'unit',
    new_unit_id,
    'unit_created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_number', normalized_unit_number,
      'floor', normalized_floor,
      'size_sqm', p_size_sqm,
      'bedroom_count', p_bedroom_count,
      'bathroom_count', p_bathroom_count,
      'status', normalized_status,
      'archived_at', NULL,
      'archived_by', NULL
    )
  );

  RETURN new_unit_id;
END;
$$;

ALTER FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, numeric, numeric, text
)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, numeric, numeric, text
)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, numeric, numeric, text
)
  TO authenticated;

-- Preserve the pre-room-count overload during the database-first deployment
-- window and for application rollback. It intentionally records unknown
-- counts while delegating every authorization and audit check to the new RPC.
CREATE FUNCTION public.create_unit(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_status text
)
RETURNS uuid
LANGUAGE sql
SET search_path TO public, app_private
AS $$
  SELECT public.create_unit(
    p_organization_id,
    p_property_id,
    p_unit_number,
    p_floor,
    p_size_sqm,
    NULL::numeric,
    NULL::numeric,
    p_status
  );
$$;

ALTER FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, text
)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, text
)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, text
)
  TO authenticated;

DROP FUNCTION IF EXISTS public.update_unit(
  uuid, uuid, uuid, text, text, numeric, text
);

CREATE FUNCTION public.update_unit(
  p_unit_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_bedroom_count numeric,
  p_bathroom_count numeric,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public, app_private
AS $$
DECLARE
  old_unit public.units%ROWTYPE;
  new_unit public.units%ROWTYPE;
  normalized_floor text := NULLIF(trim(coalesce(p_floor, '')), '');
  normalized_status text := lower(trim(coalesce(p_status, '')));
  normalized_unit_number text := trim(coalesce(p_unit_number, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_unit
  FROM public.units
  WHERE id = p_unit_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found' USING ERRCODE = '23503';
  END IF;

  IF p_property_id <> old_unit.property_id THEN
    RAISE EXCEPTION 'Unit property cannot be changed' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_unit_number) = 0 THEN
    RAISE EXCEPTION 'Unit number is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_unit_number) > 40 THEN
    RAISE EXCEPTION 'Unit number is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_floor IS NOT NULL AND length(normalized_floor) > 40 THEN
    RAISE EXCEPTION 'Floor is too long' USING ERRCODE = '22023';
  END IF;

  IF p_size_sqm IS NOT NULL AND p_size_sqm < 0 THEN
    RAISE EXCEPTION 'Size cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_bedroom_count IS NOT NULL AND (
    p_bedroom_count < 0
    OR p_bedroom_count > 100
    OR p_bedroom_count <> trunc(p_bedroom_count)
  ) THEN
    RAISE EXCEPTION 'Bedroom count must be a whole number from 0 to 100'
      USING ERRCODE = '22023';
  END IF;

  IF p_bathroom_count IS NOT NULL AND (
    p_bathroom_count < 0
    OR p_bathroom_count > 100
    OR p_bathroom_count <> trunc(p_bathroom_count)
  ) THEN
    RAISE EXCEPTION 'Bathroom count must be a whole number from 0 to 100'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('vacant', 'occupied', 'reserved', 'maintenance', 'inactive') THEN
    RAISE EXCEPTION 'Unit status is not supported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.units
  SET
    property_id = p_property_id,
    unit_number = normalized_unit_number,
    floor = normalized_floor,
    size_sqm = p_size_sqm,
    bedroom_count = p_bedroom_count::smallint,
    bathroom_count = p_bathroom_count::smallint,
    status = normalized_status,
    updated_by = (SELECT auth.uid())
  WHERE id = p_unit_id
  RETURNING * INTO new_unit;

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
    'unit',
    p_unit_id,
    'unit_updated',
    jsonb_build_object(
      'property_id', old_unit.property_id,
      'unit_number', old_unit.unit_number,
      'floor', old_unit.floor,
      'size_sqm', old_unit.size_sqm,
      'bedroom_count', old_unit.bedroom_count,
      'bathroom_count', old_unit.bathroom_count,
      'status', old_unit.status,
      'archived_at', old_unit.archived_at,
      'archived_by', old_unit.archived_by
    ),
    jsonb_build_object(
      'property_id', new_unit.property_id,
      'unit_number', new_unit.unit_number,
      'floor', new_unit.floor,
      'size_sqm', new_unit.size_sqm,
      'bedroom_count', new_unit.bedroom_count,
      'bathroom_count', new_unit.bathroom_count,
      'status', new_unit.status,
      'archived_at', new_unit.archived_at,
      'archived_by', new_unit.archived_by
    )
  );

  RETURN p_unit_id;
END;
$$;

ALTER FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, text
)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, text
)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, text
)
  TO authenticated;

-- Keep the former edit contract callable until the application release is
-- proven and for rollback. Lock and forward the current counts so an older
-- client editing another field cannot erase room-count data saved by the new
-- application.
CREATE FUNCTION public.update_unit(
  p_unit_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public, app_private
AS $$
DECLARE
  existing_bathroom_count smallint;
  existing_bedroom_count smallint;
BEGIN
  SELECT unit_record.bedroom_count, unit_record.bathroom_count
  INTO existing_bedroom_count, existing_bathroom_count
  FROM public.units AS unit_record
  WHERE unit_record.id = p_unit_id
    AND unit_record.organization_id = p_organization_id
  FOR UPDATE;

  RETURN public.update_unit(
    p_unit_id,
    p_organization_id,
    p_property_id,
    p_unit_number,
    p_floor,
    p_size_sqm,
    existing_bedroom_count,
    existing_bathroom_count,
    p_status
  );
END;
$$;

ALTER FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, text
)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, text
)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, text
)
  TO authenticated;

COMMENT ON COLUMN public.units.bedroom_count IS
  'Optional whole-number bedroom count. NULL means unknown; zero is intentional.';
COMMENT ON COLUMN public.units.bathroom_count IS
  'Optional whole-number bathroom count. NULL means unknown; zero is intentional.';
COMMENT ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, numeric, numeric, text
) IS
  'Creates unit identity and physical details, including optional room counts. Rent remains lease-owned.';
COMMENT ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, text
) IS
  'Updates unit identity and physical details, including optional room counts, without changing authoritative rent.';
COMMENT ON FUNCTION public.create_unit(
  uuid, uuid, text, text, numeric, text
) IS
  'Compatibility overload for application rollback; creates Units with unknown bedroom and bathroom counts.';
COMMENT ON FUNCTION public.update_unit(
  uuid, uuid, uuid, text, text, numeric, text
) IS
  'Compatibility overload for application rollback; edits Units without changing existing bedroom or bathroom counts.';
