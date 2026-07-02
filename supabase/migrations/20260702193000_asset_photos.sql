CREATE TABLE IF NOT EXISTS public.asset_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  caption text,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  taken_at date,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS asset_photos_organization_id_idx
  ON public.asset_photos (organization_id);
CREATE INDEX IF NOT EXISTS asset_photos_property_id_idx
  ON public.asset_photos (property_id);
CREATE INDEX IF NOT EXISTS asset_photos_unit_id_idx
  ON public.asset_photos (unit_id);
CREATE INDEX IF NOT EXISTS asset_photos_active_scope_idx
  ON public.asset_photos (organization_id, property_id, unit_id, is_cover, uploaded_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.asset_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read asset photos"
ON public.asset_photos;

CREATE POLICY "Members can read asset photos"
ON public.asset_photos
FOR SELECT
TO authenticated
USING (
  app_private.is_org_member(organization_id)
);

DROP POLICY IF EXISTS "Admins can manage asset photos"
ON public.asset_photos;

CREATE POLICY "Admins can manage asset photos"
ON public.asset_photos
FOR ALL
TO authenticated
USING (
  app_private.is_org_admin(organization_id)
)
WITH CHECK (
  app_private.is_org_admin(organization_id)
);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'nestory-photos',
  'nestory-photos',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members can read Nestory photos"
ON storage.objects;

CREATE POLICY "Members can read Nestory photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nestory-photos'
  AND app_private.is_org_member(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can upload Nestory photos"
ON storage.objects;

CREATE POLICY "Admins can upload Nestory photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nestory-photos'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can update Nestory photos"
ON storage.objects;

CREATE POLICY "Admins can update Nestory photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nestory-photos'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
)
WITH CHECK (
  bucket_id = 'nestory-photos'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can delete Nestory photos"
ON storage.objects;

CREATE POLICY "Admins can delete Nestory photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nestory-photos'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

CREATE OR REPLACE FUNCTION app_private.validate_asset_photo_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  linked_property_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NULL THEN
    RETURN;
  END IF;

  SELECT property_id
  INTO linked_property_id
  FROM public.units
  WHERE id = p_unit_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL;

  IF linked_property_id IS NULL THEN
    RAISE EXCEPTION 'Unit not found' USING ERRCODE = '23503';
  END IF;

  IF linked_property_id <> p_property_id THEN
    RAISE EXCEPTION 'Unit must belong to selected property' USING ERRCODE = '23503';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_asset_photo_scope(uuid, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.validate_asset_photo_scope(uuid, uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_asset_photo(
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
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_photo_id uuid;
  normalized_caption text := NULLIF(trim(coalesce(p_caption, '')), '');
  normalized_file_name text := trim(coalesce(p_file_name, ''));
  normalized_mime_type text := trim(coalesce(p_mime_type, ''));
  normalized_storage_path text := trim(coalesce(p_storage_path, ''));
  should_set_cover boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_file_name) = 0 THEN
    RAISE EXCEPTION 'Photo file name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_storage_path) = 0 THEN
    RAISE EXCEPTION 'Photo storage path is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Photo MIME type is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_size_bytes < 0 THEN
    RAISE EXCEPTION 'Photo size is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.validate_asset_photo_scope(
    p_organization_id,
    p_property_id,
    p_unit_id
  );

  should_set_cover := p_is_cover OR NOT EXISTS (
    SELECT 1
    FROM public.asset_photos
    WHERE organization_id = p_organization_id
      AND property_id = p_property_id
      AND unit_id IS NOT DISTINCT FROM p_unit_id
      AND archived_at IS NULL
  );

  IF should_set_cover THEN
    UPDATE public.asset_photos
    SET is_cover = false
    WHERE organization_id = p_organization_id
      AND property_id = p_property_id
      AND unit_id IS NOT DISTINCT FROM p_unit_id
      AND archived_at IS NULL;
  END IF;

  INSERT INTO public.asset_photos (
    organization_id,
    property_id,
    unit_id,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    caption,
    is_cover,
    taken_at,
    uploaded_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    normalized_file_name,
    normalized_storage_path,
    normalized_mime_type,
    p_size_bytes,
    normalized_caption,
    should_set_cover,
    p_taken_at,
    (SELECT auth.uid())
  )
  RETURNING id INTO new_photo_id;

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
    CASE WHEN p_unit_id IS NULL THEN 'property' ELSE 'unit' END,
    coalesce(p_unit_id, p_property_id),
    'photo_uploaded',
    jsonb_build_object(
      'photo_id', new_photo_id,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'file_name', normalized_file_name,
      'is_cover', should_set_cover
    )
  );

  RETURN new_photo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_asset_photo_cover(
  p_organization_id uuid,
  p_photo_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  photo public.asset_photos%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO photo
  FROM public.asset_photos
  WHERE id = p_photo_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.asset_photos
  SET is_cover = false
  WHERE organization_id = p_organization_id
    AND property_id = photo.property_id
    AND unit_id IS NOT DISTINCT FROM photo.unit_id
    AND archived_at IS NULL;

  UPDATE public.asset_photos
  SET is_cover = true
  WHERE id = p_photo_id;

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
    CASE WHEN photo.unit_id IS NULL THEN 'property' ELSE 'unit' END,
    coalesce(photo.unit_id, photo.property_id),
    'photo_cover_set',
    jsonb_build_object('photo_id', p_photo_id)
  );

  RETURN p_photo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_asset_photo(
  p_organization_id uuid,
  p_photo_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  photo public.asset_photos%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO photo
  FROM public.asset_photos
  WHERE id = p_photo_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.asset_photos
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    is_cover = false
  WHERE id = p_photo_id;

  IF photo.is_cover THEN
    UPDATE public.asset_photos
    SET is_cover = true
    WHERE id = (
      SELECT id
      FROM public.asset_photos
      WHERE organization_id = p_organization_id
        AND property_id = photo.property_id
        AND unit_id IS NOT DISTINCT FROM photo.unit_id
        AND archived_at IS NULL
      ORDER BY uploaded_at DESC, id DESC
      LIMIT 1
    );
  END IF;

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
    CASE WHEN photo.unit_id IS NULL THEN 'property' ELSE 'unit' END,
    coalesce(photo.unit_id, photo.property_id),
    'photo_archived',
    jsonb_build_object('photo_id', p_photo_id)
  );

  RETURN p_photo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_asset_photo(uuid, uuid, uuid, text, text, text, bigint, text, boolean, date)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_asset_photo_cover(uuid, uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_asset_photo(uuid, uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_asset_photo(uuid, uuid, uuid, text, text, text, bigint, text, boolean, date)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_asset_photo_cover(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_asset_photo(uuid, uuid)
TO authenticated;
