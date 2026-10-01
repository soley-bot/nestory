ALTER FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) RENAME TO create_asset_photo_before_storage_recovery;
ALTER FUNCTION public.create_asset_photo_before_storage_recovery(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) SET SCHEMA app_private;
REVOKE ALL ON FUNCTION app_private.create_asset_photo_before_storage_recovery(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_asset_photo(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_caption text DEFAULT NULL,
  p_is_cover boolean DEFAULT false,
  p_taken_at date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_property_permission(
    p_organization_id,p_property_id,'properties.write'
  );

  IF app_private.storage_object_org_id(p_storage_path)
    IS DISTINCT FROM p_organization_id
    OR NOT app_private.can_access_storage_object(
      'nestory-photos',p_storage_path,'properties.write','insert'
    ) THEN
    RAISE EXCEPTION 'Photo storage path is invalid.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-photos'
    AND object.name = btrim(p_storage_path)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo object was not found.' USING ERRCODE = '23503';
  END IF;

  RETURN app_private.create_asset_photo_before_storage_recovery(
    p_organization_id,p_property_id,p_unit_id,p_file_name,p_storage_path,
    p_mime_type,p_size_bytes,p_caption,p_is_cover,p_taken_at
  );
END;
$$;

ALTER FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_organization_logo(
  p_organization_id uuid,
  p_logo_storage_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_logo_storage_path text := nullif(btrim(p_logo_storage_path), '');
  v_previous_path text;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can update the company logo.'
      USING ERRCODE = '42501';
  END IF;

  IF v_logo_storage_path IS NOT NULL THEN
    IF app_private.storage_object_org_id(v_logo_storage_path)
      IS DISTINCT FROM p_organization_id
      OR v_logo_storage_path !~ (
        '^' || p_organization_id::text ||
        '/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
      ) THEN
      RAISE EXCEPTION 'Company logo path is invalid.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'organization-assets'
      AND object.name = v_logo_storage_path
      AND object.metadata ->> 'mimetype' IN ('image/png', 'image/jpeg')
      AND coalesce((object.metadata ->> 'size')::bigint, 0)
        BETWEEN 1 AND 2097152
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company logo object was not found.' USING ERRCODE = '23503';
    END IF;
  END IF;

  SELECT organization.logo_storage_path
  INTO v_previous_path
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_path IS NOT DISTINCT FROM v_logo_storage_path THEN
    RETURN v_logo_storage_path;
  END IF;

  UPDATE public.organizations
  SET logo_storage_path = v_logo_storage_path
  WHERE id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values
  ) VALUES (
    p_organization_id,v_actor_id,'organization',p_organization_id,'logo_updated',
    jsonb_build_object('logo_storage_path',v_previous_path),
    jsonb_build_object('logo_storage_path',v_logo_storage_path)
  );

  RETURN v_logo_storage_path;
END;
$$;

CREATE FUNCTION app_private.guard_registered_image_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_selected_logo_path text;
BEGIN
  IF OLD.bucket_id = 'nestory-photos' AND EXISTS (
    SELECT 1 FROM public.asset_photos AS photo
    WHERE photo.storage_path = OLD.name
  ) THEN
    RAISE EXCEPTION 'Registered photo bytes cannot be removed or replaced.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.bucket_id = 'organization-assets' THEN
    SELECT organization.logo_storage_path
    INTO v_selected_logo_path
    FROM public.organizations AS organization
    WHERE organization.id = app_private.storage_object_org_id(OLD.name);

    IF v_selected_logo_path = OLD.name THEN
      RAISE EXCEPTION 'Selected company logo bytes cannot be removed or replaced.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION app_private.guard_registered_image_storage_object() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_registered_image_storage_object()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER guard_registered_image_storage_object
  BEFORE DELETE OR UPDATE OF bucket_id,name,metadata ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_registered_image_storage_object();
