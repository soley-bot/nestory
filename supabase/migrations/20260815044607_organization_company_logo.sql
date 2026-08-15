ALTER TABLE public.organizations
  ADD COLUMN logo_storage_path text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_storage_path_check
  CHECK (
    logo_storage_path IS NULL
    OR logo_storage_path ~ (
      '^' || id::text ||
      '/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
    )
  );

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'organization-assets',
  'organization-assets',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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

  IF v_logo_storage_path IS NOT NULL
    AND (
      app_private.storage_object_org_id(v_logo_storage_path)
        IS DISTINCT FROM p_organization_id
      OR v_logo_storage_path !~ (
        '^' || p_organization_id::text ||
        '/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
      )
    ) THEN
    RAISE EXCEPTION 'Company logo path is invalid.'
      USING ERRCODE = '22023';
  END IF;

  IF v_logo_storage_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'organization-assets'
        AND object.name = v_logo_storage_path
        AND object.metadata ->> 'mimetype' IN ('image/png', 'image/jpeg')
        AND coalesce((object.metadata ->> 'size')::bigint, 0)
          BETWEEN 1 AND 2097152
    ) THEN
    RAISE EXCEPTION 'Company logo object was not found.'
      USING ERRCODE = '23503';
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
    v_actor_id,
    'organization',
    p_organization_id,
    'logo_updated',
    jsonb_build_object('logo_storage_path', v_previous_path),
    jsonb_build_object('logo_storage_path', v_logo_storage_path)
  );

  RETURN v_logo_storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_logo(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_organization_logo(uuid, text)
  TO authenticated;

CREATE POLICY "Members can read organization assets"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'organization-assets'
    AND app_private.is_org_member(
      app_private.storage_object_org_id(name)
    )
  );

CREATE POLICY "Super Admins can upload organization assets"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'organization-assets'
    AND app_private.is_org_admin(
      app_private.storage_object_org_id(name)
    )
    AND name ~ (
      '^' || app_private.storage_object_org_id(name)::text ||
      '/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
    )
  );

CREATE POLICY "Super Admins can delete organization assets"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-assets'
    AND app_private.is_org_admin(
      app_private.storage_object_org_id(name)
    )
  );
