ALTER TABLE public.documents
  ADD CONSTRAINT documents_storage_path_key UNIQUE (storage_path);

CREATE OR REPLACE FUNCTION app_private.guard_document_content_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.content_sha256 IS NOT NULL
      AND NOT app_private.has_document_content_write_context() THEN
      RAISE EXCEPTION 'Document fingerprint requires the checked document workflow'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.content_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'Fingerprinted document rows cannot be deleted'
        USING ERRCODE = '22023';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.content_sha256 IS NOT NULL AND (
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.file_name IS DISTINCT FROM OLD.file_name
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
  ) THEN
    RAISE EXCEPTION 'Fingerprinted document bytes and fingerprint are immutable'
      USING ERRCODE = '22023';
  END IF;

  IF OLD.content_sha256 IS NULL AND NEW.content_sha256 IS NOT NULL THEN
    IF NOT app_private.has_document_content_write_context() THEN
      RAISE EXCEPTION 'Document fingerprint requires the checked document workflow'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
      OR NEW.file_name IS DISTINCT FROM OLD.file_name
      OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
      OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
      OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
      RAISE EXCEPTION 'Legacy fingerprinting cannot replace document bytes'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_document_content_fingerprint() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_document_content_fingerprint()
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.discard_unreferenced_document_upload(uuid, uuid, text, text);
DROP FUNCTION app_private.has_document_cleanup_context(uuid);

CREATE FUNCTION public.replace_document(
  p_document_id uuid,
  p_organization_id uuid,
  p_category text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_content_sha256 text,
  p_property_id uuid,
  p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_old public.documents%ROWTYPE;
  v_new_id uuid;
  v_category text := btrim(coalesce(p_category, ''));
  v_file_name text := btrim(coalesce(p_file_name, ''));
  v_mime_type text := btrim(coalesce(p_mime_type, ''));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT document.*
  INTO v_old
  FROM public.documents AS document
  WHERE document.id = p_document_id
    AND document.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND OR v_old.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active document not found' USING ERRCODE = '23503';
  END IF;
  IF app_private.is_financial_evidence_document_locked(p_document_id) THEN
    RAISE EXCEPTION 'Financial evidence document is immutable while referenced'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_category) = 0 OR length(v_category) > 80 THEN
    RAISE EXCEPTION 'Document category is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(v_file_name) = 0 THEN
    RAISE EXCEPTION 'Document file name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_storage_path) = 0
    OR v_storage_path = v_old.storage_path THEN
    RAISE EXCEPTION 'Replacement Storage path is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(v_mime_type) = 0 THEN
    RAISE EXCEPTION 'Document MIME type is required' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes < 0 THEN
    RAISE EXCEPTION 'Document size is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_content_sha256 IS NULL
    OR p_content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Document content fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF app_private.storage_object_org_id(v_storage_path)
    IS DISTINCT FROM p_organization_id
    OR v_storage_path NOT LIKE p_organization_id::text || '/%' THEN
    RAISE EXCEPTION 'Document storage path must belong to its organization'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_storage_path
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document Storage object does not exist'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.validate_document_links(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    v_old.timeline_event_id,
    v_old.ledger_entry_id,
    p_task_id,
    v_old.tenant_request_id
  );

  PERFORM set_config('app.document_content_write_context', 'checked-v1', true);

  INSERT INTO public.documents (
    organization_id, property_id, unit_id, lease_id, timeline_event_id,
    ledger_entry_id, task_id, tenant_request_id, category, file_name,
    storage_path, mime_type, size_bytes, content_sha256, uploaded_by
  )
  VALUES (
    p_organization_id, p_property_id, p_unit_id, p_lease_id,
    v_old.timeline_event_id, v_old.ledger_entry_id, p_task_id,
    v_old.tenant_request_id, v_category, v_file_name, v_storage_path,
    v_mime_type, p_size_bytes, p_content_sha256, v_actor_id
  )
  RETURNING id INTO v_new_id;

  PERFORM set_config('app.document_content_write_context', 'off', true);

  UPDATE public.documents
  SET archived_at = now(), archived_by = v_actor_id
  WHERE id = p_document_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'document',
    p_document_id,
    'replaced',
    jsonb_build_object(
      'document_id', p_document_id,
      'storage_path', v_old.storage_path,
      'content_sha256', v_old.content_sha256,
      'archived_at', v_old.archived_at
    ),
    jsonb_build_object(
      'document_id', v_new_id,
      'storage_path', v_storage_path,
      'content_sha256', p_content_sha256,
      'category', v_category,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'lease_id', p_lease_id,
      'timeline_event_id', v_old.timeline_event_id,
      'ledger_entry_id', v_old.ledger_entry_id,
      'task_id', p_task_id,
      'tenant_request_id', v_old.tenant_request_id
    )
  );

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.replace_document(
  uuid, uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_document(
  uuid, uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_document(
  uuid, uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.assert_owner_opening_evidence_eligible(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_evidence_sha256 text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
BEGIN
  IF p_evidence_sha256 IS NULL
    OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Opening evidence fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.id = p_document_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_document.organization_id IS DISTINCT FROM p_organization_id
    OR v_document.property_id IS DISTINCT FROM p_property_id
    OR v_document.category IS DISTINCT FROM 'owner_opening_balance_evidence'
    OR v_document.archived_at IS NOT NULL
    OR v_document.content_sha256 IS NULL
    OR v_document.content_sha256 IS DISTINCT FROM p_evidence_sha256
    OR v_document.storage_path NOT LIKE p_organization_id::text || '/%'
    OR app_private.storage_object_org_id(v_document.storage_path)
      IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Opening evidence document is not eligible'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_document_storage_object_exists(
    v_document.storage_path
  );
END;
$$;

ALTER FUNCTION app_private.assert_owner_opening_evidence_eligible(
  uuid, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_owner_opening_evidence_eligible(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_evidence_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.supporting_document_id IS NOT NULL THEN
    PERFORM app_private.assert_owner_opening_evidence_eligible(
      NEW.organization_id,
      NEW.property_id,
      NEW.supporting_document_id,
      NEW.evidence_sha256
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_evidence_reference()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_evidence_reference()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER lock_owner_opening_evidence_reference
  BEFORE INSERT ON public.owner_opening_balance_requests
  FOR EACH ROW
  EXECUTE FUNCTION app_private.lock_owner_opening_evidence_reference();

CREATE OR REPLACE FUNCTION app_private.lock_expense_evidence_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_storage_path text;
BEGIN
  IF NEW.supporting_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT document.storage_path
  INTO v_storage_path
  FROM public.documents AS document
  WHERE document.id = NEW.supporting_document_id
    AND document.organization_id = NEW.organization_id
    AND document.archived_at IS NULL
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supporting evidence document is unavailable'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.assert_document_storage_object_exists(v_storage_path);
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_expense_evidence_reference() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_expense_evidence_reference()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER lock_expense_evidence_reference
  BEFORE INSERT ON public.expense_submissions
  FOR EACH ROW
  EXECUTE FUNCTION app_private.lock_expense_evidence_reference();

COMMENT ON FUNCTION public.replace_document(
  uuid, uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid
) IS
  'Atomically creates a new fingerprinted document row and archives the locked unreferenced old row. Uploaded bytes remain separate Storage objects and are never deleted by this RPC.';
