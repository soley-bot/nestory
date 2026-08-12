CREATE OR REPLACE FUNCTION public.get_paid_cost_submission_evidence(
  p_organization_id uuid,
  p_submission_ids uuid[]
)
RETURNS TABLE(
  submission_id uuid,
  document_id uuid,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  content_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(pg_catalog.cardinality(p_submission_ids), 0) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.cardinality(p_submission_ids) > 500 THEN
    RAISE EXCEPTION 'Paid-cost evidence query is limited to 500 submissions'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    submission.id,
    document.id,
    document.file_name,
    document.storage_path,
    document.mime_type,
    document.size_bytes,
    document.content_sha256
  FROM public.expense_submissions AS submission
  JOIN public.documents AS document
    ON document.organization_id = submission.organization_id
   AND document.id = submission.supporting_document_id
  WHERE submission.organization_id = p_organization_id
    AND submission.id = ANY(p_submission_ids)
    AND document.archived_at IS NULL
    AND document.content_sha256 IS NOT NULL
    AND app_private.storage_object_org_id(document.storage_path) =
      document.organization_id
    AND EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'nestory-documents'
        AND object.name = document.storage_path
    );
END;
$function$;

ALTER FUNCTION public.get_paid_cost_submission_evidence(uuid, uuid[])
  OWNER TO postgres;

COMMENT ON FUNCTION public.get_paid_cost_submission_evidence(uuid, uuid[]) IS
  'Returns immutable filename, size, MIME, and SHA-256 metadata for Finance-visible paid-cost evidence.';

REVOKE ALL ON FUNCTION public.get_paid_cost_submission_evidence(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_paid_cost_submission_evidence(uuid, uuid[])
  TO authenticated;
