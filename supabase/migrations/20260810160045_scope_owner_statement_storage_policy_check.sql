CREATE OR REPLACE FUNCTION app_private.is_owner_statement_artifact_registered(
  p_storage_path text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT app_private.is_org_admin(
    app_private.storage_object_org_id(p_storage_path)
  ) AND EXISTS (
    SELECT 1 FROM public.owner_statement_artifacts AS artifact
    WHERE artifact.storage_path = p_storage_path
  );
$$;

ALTER FUNCTION app_private.is_owner_statement_artifact_registered(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.is_owner_statement_artifact_registered(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_owner_statement_artifact_registered(text)
  TO authenticated;
