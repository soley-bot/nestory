ALTER TABLE public.properties
  ADD COLUMN registered_date date,
  ADD COLUMN rental_structure text NOT NULL DEFAULT 'undecided';

ALTER TABLE public.properties
  ADD CONSTRAINT properties_rental_structure_check
  CHECK (rental_structure IN ('undecided', 'single_space', 'multi_unit'));

UPDATE public.properties AS property
SET rental_structure = 'multi_unit'
WHERE EXISTS (
  SELECT 1
  FROM public.units AS unit
  WHERE unit.property_id = property.id
    AND unit.organization_id = property.organization_id
    AND unit.archived_at IS NULL
);

CREATE FUNCTION app_private.enforce_property_unit_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_structure text;
BEGIN
  SELECT property.rental_structure
  INTO v_structure
  FROM public.properties AS property
  WHERE property.id = NEW.property_id
    AND property.organization_id = NEW.organization_id
    AND property.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF v_structure = 'single_space' THEN
    RAISE EXCEPTION 'Whole-property rentals cannot contain Units'
      USING ERRCODE = '23514', DETAIL = 'property_rental_structure_single_space';
  END IF;

  IF v_structure = 'undecided' THEN
    UPDATE public.properties
    SET rental_structure = 'multi_unit',
        updated_at = pg_catalog.now(),
        updated_by = COALESCE((SELECT auth.uid()), updated_by)
    WHERE id = NEW.property_id
      AND organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_property_unit_structure() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_property_unit_structure()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER units_enforce_property_rental_structure
BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.units
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_property_unit_structure();

CREATE FUNCTION public.create_property_minimal(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_address text,
  p_registered_date date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property_id uuid;
  v_existing public.properties%ROWTYPE;
  v_name text := pg_catalog.btrim(COALESCE(p_name, ''));
  v_code text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  v_property_type text := pg_catalog.btrim(COALESCE(p_property_type, ''));
  v_address text := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_key text := pg_catalog.btrim(COALESCE(p_idempotency_key, ''));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.length(v_key) < 8 OR pg_catalog.length(v_key) > 200 THEN
    RAISE EXCEPTION 'Property creation identity is required' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR pg_catalog.length(v_name) > 120 THEN
    RAISE EXCEPTION 'Property name is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_property_type = '' OR pg_catalog.length(v_property_type) > 80 THEN
    RAISE EXCEPTION 'Property type is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NOT NULL AND pg_catalog.length(v_address) > 240 THEN
    RAISE EXCEPTION 'Property address is invalid' USING ERRCODE = '22023';
  END IF;

  v_property_id := extensions.uuid_generate_v5(
    p_organization_id,
    'property_minimal_v1:' || v_key
  );
  IF v_code = '' THEN
    v_code := 'P-' || pg_catalog.upper(
      pg_catalog.left(pg_catalog.replace(v_property_id::text, '-', ''), 20)
    );
  END IF;
  IF pg_catalog.length(v_code) > 24 THEN
    RAISE EXCEPTION 'Property code is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT property.*
  INTO v_existing
  FROM public.properties AS property
  WHERE property.id = v_property_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.organization_id IS DISTINCT FROM p_organization_id
      OR v_existing.name IS DISTINCT FROM v_name
      OR v_existing.code IS DISTINCT FROM v_code
      OR v_existing.property_type IS DISTINCT FROM v_property_type
      OR v_existing.address IS DISTINCT FROM v_address
      OR v_existing.registered_date IS DISTINCT FROM p_registered_date THEN
      RAISE EXCEPTION 'Conflicting Property creation request'
        USING ERRCODE = '22023', DETAIL = 'property_creation_idempotency_conflict';
    END IF;
    RETURN v_property_id;
  END IF;

  INSERT INTO public.properties (
    id, organization_id, name, code, property_type, address, status,
    registered_date, rental_structure, created_by, updated_by
  ) VALUES (
    v_property_id, p_organization_id, v_name, v_code, v_property_type,
    v_address, 'active', p_registered_date, 'undecided', v_actor_id, v_actor_id
  );

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'property', v_property_id, 'property_created',
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'code', v_code,
      'property_type', v_property_type,
      'address', v_address,
      'registered_date', p_registered_date,
      'status', 'active',
      'rental_structure', 'undecided'
    )
  );

  RETURN v_property_id;
END;
$$;

ALTER FUNCTION public.create_property_minimal(uuid, text, text, text, text, date, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_property_minimal(uuid, text, text, text, text, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_property_minimal(uuid, text, text, text, text, date, text)
  TO authenticated;

CREATE FUNCTION public.set_property_rental_structure(
  p_organization_id uuid,
  p_property_id uuid,
  p_rental_structure text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property public.properties%ROWTYPE;
  v_structure text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_rental_structure, '')));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_structure NOT IN ('undecided', 'single_space', 'multi_unit') THEN
    RAISE EXCEPTION 'Property rental structure is not supported' USING ERRCODE = '22023';
  END IF;

  SELECT property.*
  INTO v_property
  FROM public.properties AS property
  WHERE property.id = p_property_id
    AND property.organization_id = p_organization_id
    AND property.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;
  IF v_property.rental_structure = v_structure THEN
    RETURN p_property_id;
  END IF;

  IF v_structure IN ('undecided', 'single_space') AND EXISTS (
    SELECT 1 FROM public.units AS unit
    WHERE unit.organization_id = p_organization_id
      AND unit.property_id = p_property_id
      AND unit.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive active Units before changing the rental structure'
      USING ERRCODE = '23514', DETAIL = 'property_rental_structure_has_units';
  END IF;

  IF v_structure IN ('undecided', 'single_space') AND EXISTS (
    SELECT 1 FROM public.leases AS lease
    WHERE lease.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease.unit_id IS NOT NULL
      AND lease.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive Unit Leases before changing the rental structure'
      USING ERRCODE = '23514', DETAIL = 'property_rental_structure_has_unit_leases';
  END IF;

  IF v_structure IN ('undecided', 'multi_unit') AND EXISTS (
    SELECT 1 FROM public.leases AS lease
    WHERE lease.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease.unit_id IS NULL
      AND lease.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Archive the whole-property Lease before changing the rental structure'
      USING ERRCODE = '23514', DETAIL = 'property_rental_structure_has_property_lease';
  END IF;

  UPDATE public.properties
  SET rental_structure = v_structure,
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE id = p_property_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'property', p_property_id,
    'property_rental_structure_set',
    pg_catalog.jsonb_build_object('rental_structure', v_property.rental_structure),
    pg_catalog.jsonb_build_object('rental_structure', v_structure)
  );

  RETURN p_property_id;
END;
$$;

ALTER FUNCTION public.set_property_rental_structure(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_property_rental_structure(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_property_rental_structure(uuid, uuid, text)
  TO authenticated;

CREATE FUNCTION public.update_property_details(
  p_property_id uuid,
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_owner text,
  p_address text,
  p_status text,
  p_registered_date date,
  p_acquisition_date date,
  p_notes text,
  p_owner_person_id uuid,
  p_owner_started_on date,
  p_owner_ownership_percent numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_old public.properties%ROWTYPE;
  v_name text := pg_catalog.btrim(COALESCE(p_name, ''));
  v_code text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  v_type text := pg_catalog.btrim(COALESCE(p_property_type, ''));
  v_status text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, '')));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT property.* INTO v_old
  FROM public.properties AS property
  WHERE property.id = p_property_id
    AND property.organization_id = p_organization_id
    AND property.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;
  IF v_name = '' OR pg_catalog.length(v_name) > 120 THEN
    RAISE EXCEPTION 'Property name is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_code = '' OR pg_catalog.length(v_code) > 24 THEN
    RAISE EXCEPTION 'Property code is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_type = '' OR pg_catalog.length(v_type) > 80 THEN
    RAISE EXCEPTION 'Property type is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('active', 'under_renovation', 'inactive') THEN
    RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.properties
  SET name = v_name,
      code = v_code,
      property_type = v_type,
      owner = NULLIF(pg_catalog.btrim(COALESCE(p_owner, '')), ''),
      address = NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), ''),
      status = v_status,
      registered_date = p_registered_date,
      acquisition_date = p_acquisition_date,
      notes = NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''),
      updated_at = pg_catalog.now(),
      updated_by = v_actor_id
  WHERE id = p_property_id;

  PERFORM app_private.sync_property_primary_owner(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_owner_started_on,
    p_owner_ownership_percent
  );

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'property', p_property_id, 'property_updated',
    pg_catalog.to_jsonb(v_old),
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'code', v_code,
      'property_type', v_type,
      'registered_date', p_registered_date,
      'owner_person_id', p_owner_person_id,
      'owner_started_on', p_owner_started_on,
      'owner_ownership_percent', p_owner_ownership_percent
    )
  );
  RETURN p_property_id;
END;
$$;

ALTER FUNCTION public.update_property_details(
  uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_property_details(
  uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_property_details(
  uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) TO authenticated;

COMMENT ON COLUMN public.properties.registered_date IS
  'Optional legal or registry date entered as Property identity; distinct from acquisition date.';
COMMENT ON COLUMN public.properties.rental_structure IS
  'Operator-selected Lease placement: undecided, whole Property, or separate Units.';
COMMENT ON FUNCTION public.create_property_minimal(uuid, text, text, text, text, date, text) IS
  'Creates Active Property identity without hidden owner, acquisition, or status prerequisites.';
COMMENT ON FUNCTION public.set_property_rental_structure(uuid, uuid, text) IS
  'Chooses whole-Property or Unit-level Lease placement after checking conflicting records.';
COMMENT ON FUNCTION public.update_property_details(
  uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) IS 'Updates complete Property setup while preserving separate registration and acquisition facts.';
