-- Restore the policy-safe generalized evidence predicate after Track 6 added
-- paid-cost fingerprints. Fingerprinted paid-cost documents are already
-- covered by is_financial_evidence_object_locked(); the legacy expense-only
-- helper remains private so callers cannot probe document identities.

DROP POLICY IF EXISTS "Admins can delete Nestory documents"
  ON storage.objects;
CREATE POLICY "Admins can delete Nestory documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND name NOT LIKE app_private.storage_object_org_id(name)::text ||
    '/paid-cost-evidence/%'
  AND NOT app_private.is_financial_evidence_object_locked(name)
);

DROP POLICY IF EXISTS "Admins can update Nestory documents"
  ON storage.objects;
CREATE POLICY "Admins can update Nestory documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND name NOT LIKE app_private.storage_object_org_id(name)::text ||
    '/paid-cost-evidence/%'
  AND NOT app_private.is_financial_evidence_object_locked(name)
)
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND name NOT LIKE app_private.storage_object_org_id(name)::text ||
    '/paid-cost-evidence/%'
  AND NOT app_private.is_financial_evidence_object_locked(name)
);

REVOKE ALL ON FUNCTION app_private.is_expense_evidence_object_locked(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.is_financial_evidence_object_locked(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_financial_evidence_object_locked(text)
  TO authenticated;
