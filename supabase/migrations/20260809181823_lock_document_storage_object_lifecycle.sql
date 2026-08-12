CREATE OR REPLACE FUNCTION app_private.assert_document_storage_object_exists(
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = p_storage_path
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document Storage object does not exist'
      USING ERRCODE = '23503';
  END IF;
END;
$$;

ALTER FUNCTION app_private.assert_document_storage_object_exists(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_document_storage_object_exists(text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.assert_document_storage_object_exists(text) IS
  'Locks the exact Nestory document Storage object through the caller transaction so checked metadata cannot outlive a concurrent object deletion.';
