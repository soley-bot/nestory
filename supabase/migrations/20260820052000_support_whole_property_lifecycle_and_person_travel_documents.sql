ALTER TABLE public.people
  ADD COLUMN passport_number text,
  ADD COLUMN passport_expiry_date date,
  ADD COLUMN visa_expiry_date date;

ALTER TABLE public.people
  ADD CONSTRAINT people_passport_number_length_check
    CHECK (passport_number IS NULL OR length(passport_number) <= 80),
  ADD CONSTRAINT people_passport_fields_pair_check
    CHECK ((passport_number IS NULL) = (passport_expiry_date IS NULL));

COMMENT ON COLUMN public.people.passport_number IS
  'Passport identifier for owner and tenant follow-up.';
COMMENT ON COLUMN public.people.passport_expiry_date IS
  'Passport expiry date for owner and tenant follow-up.';
COMMENT ON COLUMN public.people.visa_expiry_date IS
  'Optional visa expiry date for owner and tenant follow-up.';

CREATE FUNCTION public.create_person(
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_type text,
  p_primary_email text,
  p_primary_phone text,
  p_tax_identifier text,
  p_notes text,
  p_roles text[],
  p_passport_number text,
  p_passport_expiry_date date,
  p_visa_expiry_date date
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_person_id uuid;
  v_passport_number text := NULLIF(trim(coalesce(p_passport_number, '')), '');
BEGIN
  IF v_passport_number IS NOT NULL AND length(v_passport_number) > 80 THEN
    RAISE EXCEPTION 'Passport number is too long' USING ERRCODE = '22023';
  END IF;

  IF (v_passport_number IS NULL) <> (p_passport_expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Passport number and expiry date must be entered together'
      USING ERRCODE = '22023';
  END IF;

  v_person_id := public.create_person(
    p_organization_id,
    p_display_name,
    p_legal_name,
    p_party_type,
    p_primary_email,
    p_primary_phone,
    p_tax_identifier,
    p_notes,
    p_roles
  );

  UPDATE public.people
  SET
    passport_number = v_passport_number,
    passport_expiry_date = p_passport_expiry_date,
    visa_expiry_date = p_visa_expiry_date
  WHERE id = v_person_id
    AND organization_id = p_organization_id;

  RETURN v_person_id;
END;
$$;

ALTER FUNCTION public.create_person(
  uuid, text, text, text, text, text, text, text, text[], text, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_person(
  uuid, text, text, text, text, text, text, text, text[], text, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_person(
  uuid, text, text, text, text, text, text, text, text[], text, date, date
) TO authenticated;

CREATE FUNCTION public.update_person(
  p_person_id uuid,
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_type text,
  p_primary_email text,
  p_primary_phone text,
  p_tax_identifier text,
  p_notes text,
  p_roles text[],
  p_passport_number text,
  p_passport_expiry_date date,
  p_visa_expiry_date date
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_passport_number text := NULLIF(trim(coalesce(p_passport_number, '')), '');
BEGIN
  IF v_passport_number IS NOT NULL AND length(v_passport_number) > 80 THEN
    RAISE EXCEPTION 'Passport number is too long' USING ERRCODE = '22023';
  END IF;

  IF (v_passport_number IS NULL) <> (p_passport_expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Passport number and expiry date must be entered together'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.update_person(
    p_person_id,
    p_organization_id,
    p_display_name,
    p_legal_name,
    p_party_type,
    p_primary_email,
    p_primary_phone,
    p_tax_identifier,
    p_notes,
    p_roles
  );

  UPDATE public.people
  SET
    passport_number = v_passport_number,
    passport_expiry_date = p_passport_expiry_date,
    visa_expiry_date = p_visa_expiry_date,
    updated_by = (SELECT auth.uid())
  WHERE id = p_person_id
    AND organization_id = p_organization_id;

  RETURN p_person_id;
END;
$$;

ALTER FUNCTION public.update_person(
  uuid, uuid, text, text, text, text, text, text, text, text[], text, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_person(
  uuid, uuid, text, text, text, text, text, text, text, text[], text, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_person(
  uuid, uuid, text, text, text, text, text, text, text, text[], text, date, date
) TO authenticated;

DO $$
DECLARE
  v_definition text;
  v_previous_scope_guard constant text := $guard$
  IF NOT FOUND
    OR v_lease.unit_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.units AS units
      WHERE units.id = v_lease.unit_id
        AND units.organization_id = p_organization_id
        AND units.property_id = v_lease.property_id
        AND units.archived_at IS NULL
    ) THEN
$guard$;
  v_supported_scope_guard constant text := $guard$
  IF NOT FOUND
    OR NOT EXISTS (
      SELECT 1
      FROM public.properties AS properties
      WHERE properties.id = v_lease.property_id
        AND properties.organization_id = p_organization_id
        AND properties.archived_at IS NULL
        AND (
          (
            properties.rental_structure = 'single_space'
            AND v_lease.unit_id IS NULL
          )
          OR (
            properties.rental_structure = 'multi_unit'
            AND v_lease.unit_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.units AS units
              WHERE units.id = v_lease.unit_id
                AND units.organization_id = p_organization_id
                AND units.property_id = v_lease.property_id
                AND units.archived_at IS NULL
            )
          )
        )
    ) THEN
$guard$;
  v_previous_lock_guard constant text :=
    '    AND leases.unit_id = v_lease.unit_id';
  v_supported_lock_guard constant text :=
    '    AND leases.unit_id IS NOT DISTINCT FROM v_lease.unit_id';
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  )
  INTO v_definition;

  IF strpos(v_definition, v_previous_scope_guard) = 0 THEN
    RAISE EXCEPTION 'Expected authoritative lease-term scope guard was not found';
  END IF;

  IF strpos(v_definition, v_previous_lock_guard) = 0 THEN
    RAISE EXCEPTION 'Expected authoritative lease-term lock guard was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_previous_scope_guard,
    v_supported_scope_guard
  );
  v_definition := replace(
    v_definition,
    v_previous_lock_guard,
    v_supported_lock_guard
  );

  EXECUTE v_definition;
END;
$$;

COMMENT ON FUNCTION app_private.create_authoritative_lease_term_internal(
  uuid, uuid, date, date, numeric, public.currency_code, integer, text, text, uuid, text
) IS 'Creates authoritative lease terms for supported whole-property and unit lease scopes.';
