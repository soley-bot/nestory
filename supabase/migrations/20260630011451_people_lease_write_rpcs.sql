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
      OR role_name NOT IN ('tenant', 'owner', 'vendor')
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

CREATE OR REPLACE FUNCTION app_private.mark_unit_occupied_for_lease(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_unit public.units%ROWTYPE;
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF p_unit_id IS NULL OR normalized_status NOT IN ('active', 'notice_given') THEN
    RETURN;
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

  IF old_unit.property_id <> p_property_id THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  IF lower(trim(old_unit.status)) <> 'vacant' THEN
    RETURN;
  END IF;

  UPDATE public.units
  SET
    status = 'occupied',
    updated_by = (SELECT auth.uid())
  WHERE id = old_unit.id
    AND organization_id = p_organization_id;

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
    old_unit.id,
    'unit_occupied_from_lease',
    jsonb_build_object('status', old_unit.status),
    jsonb_build_object('status', 'occupied')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_person(
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_type text,
  p_primary_email text,
  p_primary_phone text,
  p_tax_identifier text,
  p_notes text,
  p_roles text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_person_id uuid;
  normalized_display_name text := trim(coalesce(p_display_name, ''));
  normalized_legal_name text := NULLIF(trim(coalesce(p_legal_name, '')), '');
  normalized_notes text := NULLIF(trim(coalesce(p_notes, '')), '');
  normalized_party_type text := lower(trim(coalesce(p_party_type, '')));
  normalized_primary_email text := NULLIF(trim(coalesce(p_primary_email, '')), '');
  normalized_primary_phone text := NULLIF(trim(coalesce(p_primary_phone, '')), '');
  normalized_roles text[];
  normalized_tax_identifier text := NULLIF(trim(coalesce(p_tax_identifier, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_display_name) = 0 THEN
    RAISE EXCEPTION 'Display name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_display_name) > 140 THEN
    RAISE EXCEPTION 'Display name is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_legal_name IS NOT NULL AND length(normalized_legal_name) > 180 THEN
    RAISE EXCEPTION 'Legal name is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_primary_email IS NOT NULL AND length(normalized_primary_email) > 180 THEN
    RAISE EXCEPTION 'Email is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_primary_phone IS NOT NULL AND length(normalized_primary_phone) > 60 THEN
    RAISE EXCEPTION 'Phone is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_tax_identifier IS NOT NULL AND length(normalized_tax_identifier) > 80 THEN
    RAISE EXCEPTION 'Tax identifier is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_notes IS NOT NULL AND length(normalized_notes) > 900 THEN
    RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_party_type NOT IN ('individual', 'company') THEN
    RAISE EXCEPTION 'Party type is not supported' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.people (
    organization_id,
    display_name,
    legal_name,
    party_type,
    primary_email,
    primary_phone,
    tax_identifier,
    notes,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    normalized_display_name,
    normalized_legal_name,
    normalized_party_type,
    normalized_primary_email,
    normalized_primary_phone,
    normalized_tax_identifier,
    normalized_notes,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_person_id;

  normalized_roles := app_private.sync_person_roles(
    p_organization_id,
    new_person_id,
    p_roles
  );

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
    'person',
    new_person_id,
    'created',
    jsonb_strip_nulls(jsonb_build_object(
      'display_name', normalized_display_name,
      'legal_name', normalized_legal_name,
      'party_type', normalized_party_type,
      'primary_email', normalized_primary_email,
      'primary_phone', normalized_primary_phone,
      'roles', to_jsonb(normalized_roles),
      'tax_identifier', normalized_tax_identifier,
      'notes', normalized_notes
    ))
  );

  RETURN new_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_person(
  p_person_id uuid,
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_type text,
  p_primary_email text,
  p_primary_phone text,
  p_tax_identifier text,
  p_notes text,
  p_roles text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_person public.people%ROWTYPE;
  normalized_display_name text := trim(coalesce(p_display_name, ''));
  normalized_legal_name text := NULLIF(trim(coalesce(p_legal_name, '')), '');
  normalized_notes text := NULLIF(trim(coalesce(p_notes, '')), '');
  normalized_party_type text := lower(trim(coalesce(p_party_type, '')));
  normalized_primary_email text := NULLIF(trim(coalesce(p_primary_email, '')), '');
  normalized_primary_phone text := NULLIF(trim(coalesce(p_primary_phone, '')), '');
  normalized_roles text[];
  normalized_tax_identifier text := NULLIF(trim(coalesce(p_tax_identifier, '')), '');
  old_person public.people%ROWTYPE;
  old_roles text[];
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_person
  FROM public.people
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_display_name) = 0 THEN
    RAISE EXCEPTION 'Display name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_display_name) > 140 THEN
    RAISE EXCEPTION 'Display name is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_legal_name IS NOT NULL AND length(normalized_legal_name) > 180 THEN
    RAISE EXCEPTION 'Legal name is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_primary_email IS NOT NULL AND length(normalized_primary_email) > 180 THEN
    RAISE EXCEPTION 'Email is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_primary_phone IS NOT NULL AND length(normalized_primary_phone) > 60 THEN
    RAISE EXCEPTION 'Phone is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_tax_identifier IS NOT NULL AND length(normalized_tax_identifier) > 80 THEN
    RAISE EXCEPTION 'Tax identifier is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_notes IS NOT NULL AND length(normalized_notes) > 900 THEN
    RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_party_type NOT IN ('individual', 'company') THEN
    RAISE EXCEPTION 'Party type is not supported' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(role ORDER BY role), ARRAY[]::text[])
  INTO old_roles
  FROM public.person_roles
  WHERE organization_id = p_organization_id
    AND person_id = p_person_id
    AND archived_at IS NULL;

  UPDATE public.people
  SET
    display_name = normalized_display_name,
    legal_name = normalized_legal_name,
    notes = normalized_notes,
    party_type = normalized_party_type,
    primary_email = normalized_primary_email,
    primary_phone = normalized_primary_phone,
    tax_identifier = normalized_tax_identifier,
    updated_by = (SELECT auth.uid())
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_person;

  normalized_roles := app_private.sync_person_roles(
    p_organization_id,
    p_person_id,
    p_roles
  );

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
    'person',
    p_person_id,
    'updated',
    jsonb_strip_nulls(jsonb_build_object(
      'archived_at', old_person.archived_at,
      'display_name', old_person.display_name,
      'legal_name', old_person.legal_name,
      'notes', old_person.notes,
      'party_type', old_person.party_type,
      'primary_email', old_person.primary_email,
      'primary_phone', old_person.primary_phone,
      'roles', to_jsonb(old_roles),
      'tax_identifier', old_person.tax_identifier
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'archived_at', new_person.archived_at,
      'display_name', new_person.display_name,
      'legal_name', new_person.legal_name,
      'notes', new_person.notes,
      'party_type', new_person.party_type,
      'primary_email', new_person.primary_email,
      'primary_phone', new_person.primary_phone,
      'roles', to_jsonb(normalized_roles),
      'tax_identifier', new_person.tax_identifier
    ))
  );

  RETURN p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_person(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_person public.people%ROWTYPE;
  old_person public.people%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_person
  FROM public.people
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.people
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_person;

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
    'person',
    p_person_id,
    'archived',
    jsonb_build_object(
      'archived_at', old_person.archived_at,
      'display_name', old_person.display_name
    ),
    jsonb_build_object(
      'archived_at', new_person.archived_at,
      'display_name', new_person.display_name
    )
  );

  RETURN p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_person(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_person public.people%ROWTYPE;
  old_person public.people%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_person
  FROM public.people
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.people
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  RETURNING * INTO new_person;

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
    'person',
    p_person_id,
    'restored',
    jsonb_build_object(
      'archived_at', old_person.archived_at,
      'display_name', old_person.display_name
    ),
    jsonb_build_object(
      'archived_at', new_person.archived_at,
      'display_name', new_person.display_name
    )
  );

  RETURN p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_lease(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_monthly_rent_amount numeric,
  p_monthly_rent_currency public.currency_code,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_lease_id uuid;
  normalized_status text := lower(trim(coalesce(p_status, '')));
  tenant_display_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_status NOT IN ('active', 'cancelled', 'draft', 'ended', 'notice_given', 'terminated') THEN
    RAISE EXCEPTION 'Lease status is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_lease_end_date < p_lease_start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date' USING ERRCODE = '22023';
  END IF;

  IF p_monthly_rent_amount < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_amount < 0 THEN
    RAISE EXCEPTION 'Deposit cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_deposit_amount IS NULL) <> (p_deposit_currency IS NULL) THEN
    RAISE EXCEPTION 'Deposit amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  SELECT display_name
  INTO tenant_display_name
  FROM public.people
  WHERE id = p_primary_tenant_person_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL;

  IF tenant_display_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = '23503';
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

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.leases (
    organization_id,
    property_id,
    unit_id,
    tenant_name,
    primary_tenant_person_id,
    lease_start_date,
    lease_end_date,
    monthly_rent_amount,
    monthly_rent_currency,
    deposit_amount,
    deposit_currency,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    tenant_display_name,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_monthly_rent_amount,
    p_monthly_rent_currency,
    p_deposit_amount,
    p_deposit_currency,
    normalized_status,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_lease_id;

  PERFORM app_private.mark_unit_occupied_for_lease(
    p_organization_id,
    p_property_id,
    p_unit_id,
    normalized_status
  );

  RETURN new_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lease(
  p_lease_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_monthly_rent_amount numeric,
  p_monthly_rent_currency public.currency_code,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  normalized_status text := lower(trim(coalesce(p_status, '')));
  tenant_display_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.leases
  WHERE id = p_lease_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_status NOT IN ('active', 'cancelled', 'draft', 'ended', 'notice_given', 'terminated') THEN
    RAISE EXCEPTION 'Lease status is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_lease_end_date < p_lease_start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date' USING ERRCODE = '22023';
  END IF;

  IF p_monthly_rent_amount < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_amount < 0 THEN
    RAISE EXCEPTION 'Deposit cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_deposit_amount IS NULL) <> (p_deposit_currency IS NULL) THEN
    RAISE EXCEPTION 'Deposit amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  SELECT display_name
  INTO tenant_display_name
  FROM public.people
  WHERE id = p_primary_tenant_person_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL;

  IF tenant_display_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = '23503';
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

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  UPDATE public.leases
  SET
    property_id = p_property_id,
    unit_id = p_unit_id,
    tenant_name = tenant_display_name,
    primary_tenant_person_id = p_primary_tenant_person_id,
    lease_start_date = p_lease_start_date,
    lease_end_date = p_lease_end_date,
    monthly_rent_amount = p_monthly_rent_amount,
    monthly_rent_currency = p_monthly_rent_currency,
    deposit_amount = p_deposit_amount,
    deposit_currency = p_deposit_currency,
    status = normalized_status,
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  PERFORM app_private.mark_unit_occupied_for_lease(
    p_organization_id,
    p_property_id,
    p_unit_id,
    normalized_status
  );

  RETURN p_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_lease(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.leases
  WHERE id = p_lease_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.leases
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  RETURN p_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_lease(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  restored_lease public.leases%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO restored_lease
  FROM public.leases
  WHERE id = p_lease_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.leases
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id
  RETURNING * INTO restored_lease;

  PERFORM app_private.mark_unit_occupied_for_lease(
    p_organization_id,
    restored_lease.property_id,
    restored_lease.unit_id,
    restored_lease.status
  );

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_person_roles(uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.mark_unit_occupied_for_lease(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_person(uuid, text, text, text, text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_person(uuid, uuid, text, text, text, text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_person(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_person(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_lease(uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_lease(uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_lease(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_lease(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.sync_person_roles(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.mark_unit_occupied_for_lease(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_person(uuid, text, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_person(uuid, uuid, text, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_person(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_person(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lease(uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lease(uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lease(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_lease(uuid, uuid) TO authenticated;
