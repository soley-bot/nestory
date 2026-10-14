-- Opaque versions do not depend on timestamp precision or transaction start time.
ALTER TABLE public.properties
  ADD COLUMN edit_version uuid NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION app_private.advance_property_edit_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.edit_version := pg_catalog.gen_random_uuid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER advance_property_edit_version
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION app_private.advance_property_edit_version();

-- Ownership is part of the property editor's snapshot, including writes made
-- through the existing APIs. Locking/updating the parent serializes their commit
-- with a checked property save. A deadlock aborts one transaction, never an edit.
CREATE FUNCTION app_private.advance_property_owner_edit_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.properties SET edit_version = pg_catalog.gen_random_uuid()
    WHERE organization_id = OLD.organization_id AND id = OLD.property_id;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND
    (NEW.organization_id, NEW.property_id) IS DISTINCT FROM (OLD.organization_id, OLD.property_id)) THEN
    UPDATE public.properties SET edit_version = pg_catalog.gen_random_uuid()
    WHERE organization_id = NEW.organization_id AND id = NEW.property_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER advance_property_owner_edit_version
  AFTER INSERT OR UPDATE OR DELETE ON public.property_owners
  FOR EACH ROW EXECUTE FUNCTION app_private.advance_property_owner_edit_version();

REVOKE ALL ON FUNCTION app_private.advance_property_edit_version()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.advance_property_owner_edit_version()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.update_property_details_checked(
  p_property_id uuid,
  p_organization_id uuid,
  p_expected_version uuid,
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
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old public.properties%ROWTYPE;
  v_owner public.property_owners%ROWTYPE;
  v_actor_id uuid;
  v_name text := pg_catalog.btrim(COALESCE(p_name, ''));
  v_code text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  v_type text := pg_catalog.btrim(COALESCE(p_property_type, ''));
  v_status text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, '')));
  v_current_status text;
  v_owner_text text := NULLIF(pg_catalog.btrim(COALESCE(p_owner, '')), '');
  v_address text := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_notes text := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  v_details_changed boolean;
  v_owner_changed boolean;
  v_version uuid;
BEGIN
  v_actor_id := app_private.assert_property_permission(
    p_organization_id, p_property_id, 'properties.write'::public.organization_permission_key);
  SELECT * INTO v_old FROM public.properties
  WHERE organization_id = p_organization_id AND id = p_property_id AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;
  -- Recheck scope after acquiring the row lock (a branch move may have won it).
  PERFORM app_private.assert_property_permission(
    p_organization_id, p_property_id, 'properties.write'::public.organization_permission_key);
  PERFORM app_private.assert_person_in_property_branch(
    p_organization_id, p_property_id, p_owner_person_id);
  IF p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Property version is required' USING ERRCODE = '22023';
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

  SELECT * INTO v_owner FROM public.property_owners
  WHERE organization_id = p_organization_id AND property_id = p_property_id
    AND is_primary AND archived_at IS NULL AND ended_on IS NULL;
  v_owner_changed := (v_owner.person_id, v_owner.started_on, v_owner.ownership_percent)
    IS DISTINCT FROM (p_owner_person_id, p_owner_started_on, p_owner_ownership_percent);
  -- Match the editor's legacy status normalization and input trimming. Opening
  -- and saving an unchanged older record must not perform a cleanup write.
  v_current_status := pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.btrim(v_old.status)), '[-[:space:]]+', '_', 'g');
  v_current_status := CASE
    WHEN v_current_status IN ('under_renovation', 'renovation') THEN 'under_renovation'
    WHEN v_current_status = 'inactive' THEN 'inactive'
    ELSE 'active'
  END;
  v_details_changed := (
    pg_catalog.btrim(v_old.name), pg_catalog.upper(pg_catalog.btrim(v_old.code)),
    pg_catalog.btrim(v_old.property_type),
    NULLIF(pg_catalog.btrim(COALESCE(v_old.owner, '')), ''),
    NULLIF(pg_catalog.btrim(COALESCE(v_old.address, '')), ''),
    v_current_status, v_old.registered_date, v_old.acquisition_date,
    NULLIF(pg_catalog.btrim(COALESCE(v_old.notes, '')), '')
  ) IS DISTINCT FROM (
    v_name, v_code, v_type, v_owner_text, v_address,
    v_status, p_registered_date, p_acquisition_date, v_notes
  );

  -- A lost response may be retried with the original version. Equal desired
  -- state is already applied; return without timestamps, ownership, or activity.
  IF NOT v_details_changed AND NOT v_owner_changed THEN
    RETURN pg_catalog.jsonb_build_object(
      'property_id', p_property_id, 'version', v_old.edit_version, 'changed', false);
  END IF;
  IF p_expected_version <> v_old.edit_version THEN
    RAISE EXCEPTION 'Property changed since this editor was opened' USING ERRCODE = '40001';
  END IF;

  IF v_details_changed THEN
    UPDATE public.properties
    SET name = v_name, code = v_code, property_type = v_type,
        owner = v_owner_text, address = v_address, status = v_status,
        registered_date = p_registered_date, acquisition_date = p_acquisition_date,
        notes = v_notes, updated_at = pg_catalog.now(), updated_by = v_actor_id
    WHERE organization_id = p_organization_id AND id = p_property_id;
  END IF;
  IF v_owner_changed THEN
    PERFORM app_private.sync_property_primary_owner(
      p_organization_id, p_property_id, p_owner_person_id,
      p_owner_started_on, p_owner_ownership_percent);
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'property', p_property_id, 'property_updated',
    pg_catalog.to_jsonb(v_old), pg_catalog.jsonb_build_object(
      'name', v_name, 'code', v_code, 'property_type', v_type,
      'registered_date', p_registered_date, 'owner_person_id', p_owner_person_id,
      'owner_started_on', p_owner_started_on, 'owner_ownership_percent', p_owner_ownership_percent)
  );
  SELECT edit_version INTO v_version FROM public.properties
  WHERE organization_id = p_organization_id AND id = p_property_id;
  RETURN pg_catalog.jsonb_build_object(
    'property_id', p_property_id, 'version', v_version, 'changed', true);
END;
$$;

ALTER FUNCTION public.update_property_details_checked(
  uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_property_details_checked(
  uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_property_details_checked(
  uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) TO authenticated;

COMMENT ON COLUMN public.properties.edit_version IS
  'Opaque optimistic-concurrency token for the Property and its ownership links; never generated by clients.';
COMMENT ON FUNCTION public.update_property_details_checked(
  uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, uuid, date, numeric
) IS 'Atomically rejects stale edits and treats already-applied Property details and ownership as a write-free no-op.';
