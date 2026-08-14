-- Keep document-bucket immutability intact while allowing the Storage API to
-- delete one exact paid-cost orphan that has an active cleanup claim.

CREATE OR REPLACE FUNCTION app_private.guard_financial_evidence_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_path text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.name END;
  v_is_claimed_paid_cost_cleanup boolean := false;
BEGIN
  IF TG_OP = 'DELETE'
    AND OLD.bucket_id = 'nestory-documents'
    AND coalesce((SELECT auth.role())::text, '') = 'service_role' THEN
    SELECT EXISTS (
      SELECT 1
      FROM app_private.paid_cost_evidence_cleanup_claims AS claim
      WHERE claim.storage_path = OLD.name
        AND claim.organization_id = app_private.storage_object_org_id(OLD.name)
        AND claim.storage_object_id = OLD.id
        AND claim.storage_object_version = OLD.version
        AND NOT EXISTS (
          SELECT 1
          FROM public.documents AS document
          WHERE document.organization_id = claim.organization_id
            AND document.storage_path = claim.storage_path
        )
        AND NOT EXISTS (
          SELECT 1
          FROM app_private.paid_cost_evidence_registrations AS registration
          WHERE registration.organization_id = claim.organization_id
            AND registration.storage_path = claim.storage_path
        )
    ) INTO v_is_claimed_paid_cost_cleanup;
  END IF;

  IF OLD.bucket_id = 'nestory-documents'
    AND coalesce((SELECT auth.role())::text, '') = 'service_role'
    AND NOT v_is_claimed_paid_cost_cleanup THEN
    RAISE EXCEPTION 'No service-role document object writer exists'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.bucket_id = 'nestory-documents'
    AND app_private.is_financial_evidence_object_locked(v_old_path) THEN
    RAISE EXCEPTION 'Fingerprinted financial evidence bytes are immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION app_private.guard_financial_evidence_storage_object()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_financial_evidence_storage_object()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.guard_financial_evidence_storage_object() IS
  'Blocks document-object mutation except an exact service-role paid-cost orphan DELETE protected by a cleanup claim.';
