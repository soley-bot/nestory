-- Official Owner Statement objects are retained create-only. A failed or
-- ambiguous registration leaves a reusable object for checked resume; no
-- authenticated request may race registration by deleting the canonical path.

DROP POLICY IF EXISTS "Super Admin can remove unregistered owner statement artifacts"
  ON storage.objects;

REVOKE ALL ON FUNCTION app_private.is_owner_statement_artifact_registered(text)
  FROM PUBLIC, anon, authenticated, service_role;
