ALTER TABLE public.documents
  ADD COLUMN content_sha256 text;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_content_sha256_check
  CHECK (
    content_sha256 IS NULL
    OR content_sha256 ~ '^[0-9a-f]{64}$'
  );

COMMENT ON COLUMN public.documents.content_sha256 IS
  'Application-computed SHA-256 of exact uploaded bytes. PostgreSQL validates immutable metadata equality but cannot independently hash ordinary Storage object bytes.';

CREATE OR REPLACE FUNCTION app_private.has_document_content_write_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    current_setting('app.document_content_write_context', true),
    ''
  ) = 'checked-v1';
$$;

ALTER FUNCTION app_private.has_document_content_write_context() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.has_document_content_write_context()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_document_cleanup_context(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    current_setting('app.document_cleanup_context', true),
    ''
  ) = p_document_id::text;
$$;

ALTER FUNCTION app_private.has_document_cleanup_context(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.has_document_cleanup_context(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.assert_document_storage_object_exists(
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'nestory-documents'
      AND object.name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Document Storage object does not exist'
      USING ERRCODE = '23503';
  END IF;
END;
$$;

ALTER FUNCTION app_private.assert_document_storage_object_exists(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_document_storage_object_exists(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_financial_evidence_document_locked(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.expense_submissions AS submission
      WHERE submission.supporting_document_id = p_document_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_requests AS request
      WHERE request.supporting_document_id = p_document_id
        AND request.status IN ('submitted', 'approved')
    );
$$;

ALTER FUNCTION app_private.is_financial_evidence_document_locked(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.is_financial_evidence_document_locked(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_financial_evidence_object_locked(
  p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.storage_path = p_storage_path
      AND app_private.storage_object_org_id(document.storage_path) =
        document.organization_id
      AND (
        document.content_sha256 IS NOT NULL
        OR app_private.is_financial_evidence_document_locked(document.id)
      )
  );
$$;

ALTER FUNCTION app_private.is_financial_evidence_object_locked(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.is_financial_evidence_object_locked(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_financial_evidence_object_locked(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION app_private.assert_owner_opening_evidence_eligible(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_evidence_sha256 text
)
RETURNS void
LANGUAGE plpgsql
STABLE
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
  WHERE document.id = p_document_id;

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
    IF OLD.content_sha256 IS NOT NULL
      AND NOT app_private.has_document_cleanup_context(OLD.id) THEN
      RAISE EXCEPTION 'Fingerprinted document rows cannot be deleted directly'
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

CREATE OR REPLACE FUNCTION app_private.guard_financial_evidence_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF app_private.is_financial_evidence_document_locked(OLD.id) THEN
    RAISE EXCEPTION 'Financial evidence document is immutable while referenced'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_financial_evidence_document() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_financial_evidence_document()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_expense_evidence_document ON public.documents;
DROP FUNCTION IF EXISTS app_private.guard_expense_evidence_document();

CREATE TRIGGER guard_document_content_fingerprint
  BEFORE INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_document_content_fingerprint();

CREATE TRIGGER guard_financial_evidence_document
  BEFORE UPDATE OR DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_financial_evidence_document();

CREATE OR REPLACE FUNCTION app_private.guard_financial_evidence_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_path text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.name END;
BEGIN
  IF OLD.bucket_id = 'nestory-documents'
    AND coalesce((SELECT auth.role())::text, '') = 'service_role' THEN
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

DROP TRIGGER IF EXISTS guard_financial_evidence_storage_object
  ON storage.objects;
CREATE TRIGGER guard_financial_evidence_storage_object
  BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_financial_evidence_storage_object();

CREATE OR REPLACE FUNCTION app_private.guard_financial_evidence_storage_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role text := coalesce(
    (SELECT auth.role())::text,
    nullif(current_setting('role', true), 'none'),
    session_user::text
  );
BEGIN
  IF v_caller_role IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'App roles cannot truncate Storage objects'
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION app_private.guard_financial_evidence_storage_truncate()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_financial_evidence_storage_truncate()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_financial_evidence_storage_truncate
  ON storage.objects;
CREATE TRIGGER guard_financial_evidence_storage_truncate
  BEFORE TRUNCATE ON storage.objects
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_private.guard_financial_evidence_storage_truncate();

DROP FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, uuid, uuid, uuid, uuid, uuid, uuid,
  uuid, text, uuid, text, jsonb
);

CREATE FUNCTION public.create_document(
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
  p_timeline_event_id uuid DEFAULT NULL,
  p_ledger_entry_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_tenant_request_id uuid DEFAULT NULL,
  p_activity_entity_type text DEFAULT 'document',
  p_activity_entity_id uuid DEFAULT NULL,
  p_activity_action text DEFAULT 'created',
  p_activity_new_values jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_document_id uuid;
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

  IF length(v_category) = 0 OR length(v_category) > 80 THEN
    RAISE EXCEPTION 'Document category is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(v_file_name) = 0 THEN
    RAISE EXCEPTION 'Document file name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_storage_path) = 0 THEN
    RAISE EXCEPTION 'Document storage path is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_mime_type) = 0 THEN
    RAISE EXCEPTION 'Document MIME type is required' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes < 0 THEN
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

  PERFORM app_private.assert_document_storage_object_exists(v_storage_path);
  PERFORM app_private.validate_document_links(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_timeline_event_id,
    p_ledger_entry_id,
    p_task_id,
    p_tenant_request_id
  );

  PERFORM set_config('app.document_content_write_context', 'checked-v1', true);

  INSERT INTO public.documents (
    organization_id, property_id, unit_id, lease_id, timeline_event_id,
    ledger_entry_id, task_id, tenant_request_id, category, file_name,
    storage_path, mime_type, size_bytes, content_sha256, uploaded_by
  )
  VALUES (
    p_organization_id, p_property_id, p_unit_id, p_lease_id,
    p_timeline_event_id, p_ledger_entry_id, p_task_id, p_tenant_request_id,
    v_category, v_file_name, v_storage_path, v_mime_type, p_size_bytes,
    p_content_sha256, v_actor_id
  )
  RETURNING id INTO v_document_id;

  PERFORM set_config('app.document_content_write_context', 'off', true);

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    coalesce(nullif(btrim(p_activity_entity_type), ''), 'document'),
    coalesce(p_activity_entity_id, v_document_id),
    coalesce(nullif(btrim(p_activity_action), ''), 'created'),
    coalesce(p_activity_new_values, '{}'::jsonb) || jsonb_build_object(
      'document_id', v_document_id,
      'category', v_category,
      'file_name', v_file_name,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'lease_id', p_lease_id,
      'timeline_event_id', p_timeline_event_id,
      'ledger_entry_id', p_ledger_entry_id,
      'task_id', p_task_id,
      'tenant_request_id', p_tenant_request_id,
      'content_sha256', p_content_sha256
    )
  );

  RETURN v_document_id;
END;
$$;

ALTER FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) OWNER TO postgres;

CREATE FUNCTION public.fingerprint_document_content(
  p_document_id uuid,
  p_organization_id uuid,
  p_content_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_content_sha256 IS NULL
    OR p_content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Document content fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.id = p_document_id
    AND document.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;
  IF v_document.content_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'Document content fingerprint is already recorded'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.assert_document_storage_object_exists(
    v_document.storage_path
  );
  PERFORM set_config('app.document_content_write_context', 'checked-v1', true);

  UPDATE public.documents
  SET content_sha256 = p_content_sha256
  WHERE id = p_document_id;

  PERFORM set_config('app.document_content_write_context', 'off', true);

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'document',
    p_document_id,
    'content_fingerprinted',
    jsonb_build_object('content_sha256', p_content_sha256)
  );

  RETURN p_document_id;
END;
$$;

ALTER FUNCTION public.fingerprint_document_content(uuid, uuid, text)
  OWNER TO postgres;

DROP FUNCTION public.update_document(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, text, bigint
);

CREATE FUNCTION public.update_document(
  p_document_id uuid,
  p_organization_id uuid,
  p_category text,
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
  v_old public.documents%ROWTYPE;
  v_new public.documents%ROWTYPE;
  v_category text := btrim(coalesce(p_category, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;
  IF length(v_category) = 0 OR length(v_category) > 80 THEN
    RAISE EXCEPTION 'Document category is invalid' USING ERRCODE = '22023';
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

  UPDATE public.documents
  SET category = v_category,
      property_id = p_property_id,
      unit_id = p_unit_id,
      lease_id = p_lease_id,
      task_id = p_task_id
  WHERE id = p_document_id
  RETURNING * INTO v_new;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'document',
    p_document_id,
    'updated',
    jsonb_build_object(
      'category', v_old.category,
      'property_id', v_old.property_id,
      'unit_id', v_old.unit_id,
      'lease_id', v_old.lease_id,
      'task_id', v_old.task_id
    ),
    jsonb_build_object(
      'category', v_new.category,
      'property_id', v_new.property_id,
      'unit_id', v_new.unit_id,
      'lease_id', v_new.lease_id,
      'task_id', v_new.task_id
    )
  );

  RETURN p_document_id;
END;
$$;

ALTER FUNCTION public.update_document(uuid, uuid, text, uuid, uuid, uuid, uuid)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.archive_document(
  p_document_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.documents%ROWTYPE;
  v_new public.documents%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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
    AND document.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.documents
  SET archived_at = now(), archived_by = (SELECT auth.uid())
  WHERE id = p_document_id
  RETURNING * INTO v_new;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  VALUES (
    p_organization_id, (SELECT auth.uid()), 'document', p_document_id,
    'archived', jsonb_build_object('archived_at', v_old.archived_at),
    jsonb_build_object('archived_at', v_new.archived_at)
  );

  RETURN p_document_id;
END;
$$;

ALTER FUNCTION public.archive_document(uuid, uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.restore_document(
  p_document_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.documents%ROWTYPE;
  v_new public.documents%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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
    AND document.archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.documents
  SET archived_at = NULL, archived_by = NULL
  WHERE id = p_document_id
  RETURNING * INTO v_new;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  VALUES (
    p_organization_id, (SELECT auth.uid()), 'document', p_document_id,
    'restored', jsonb_build_object('archived_at', v_old.archived_at),
    jsonb_build_object('archived_at', v_new.archived_at)
  );

  RETURN p_document_id;
END;
$$;

ALTER FUNCTION public.restore_document(uuid, uuid) OWNER TO postgres;

CREATE FUNCTION public.discard_unreferenced_document_upload(
  p_document_id uuid,
  p_organization_id uuid,
  p_storage_path text,
  p_content_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_document public.documents%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.id = p_document_id
    AND document.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_document.uploaded_by IS DISTINCT FROM v_actor_id
    OR v_document.storage_path IS DISTINCT FROM p_storage_path
    OR v_document.content_sha256 IS DISTINCT FROM p_content_sha256
    OR v_document.uploaded_at < statement_timestamp() - interval '1 hour'
    OR app_private.is_financial_evidence_document_locked(p_document_id) THEN
    RAISE EXCEPTION 'Document upload is not eligible for orphan cleanup'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config(
    'app.document_cleanup_context',
    p_document_id::text,
    true
  );
  DELETE FROM public.documents WHERE id = p_document_id;
  PERFORM set_config('app.document_cleanup_context', 'off', true);

  RETURN p_document_id;
END;
$$;

ALTER FUNCTION public.discard_unreferenced_document_upload(
  uuid, uuid, text, text
) OWNER TO postgres;

DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
CREATE POLICY "Admins can read documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (app_private.is_org_admin(organization_id));

REVOKE ALL ON TABLE public.documents
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.documents TO authenticated;

REVOKE TRUNCATE ON TABLE storage.objects
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can delete Nestory documents" ON storage.objects;
CREATE POLICY "Admins can delete Nestory documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nestory-documents'
    AND app_private.is_org_admin(app_private.storage_object_org_id(name))
    AND NOT app_private.is_financial_evidence_object_locked(name)
  );

DROP POLICY IF EXISTS "Admins can update Nestory documents" ON storage.objects;
CREATE POLICY "Admins can update Nestory documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nestory-documents'
    AND app_private.is_org_admin(app_private.storage_object_org_id(name))
    AND NOT app_private.is_financial_evidence_object_locked(name)
  )
  WITH CHECK (
    bucket_id = 'nestory-documents'
    AND app_private.is_org_admin(app_private.storage_object_org_id(name))
    AND NOT app_private.is_financial_evidence_object_locked(name)
  );

REVOKE ALL ON FUNCTION app_private.is_expense_evidence_object_locked(text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.archive_document(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discard_unreferenced_document_upload(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fingerprint_document_content(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.restore_document(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_document(
  uuid, uuid, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.archive_document(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_unreferenced_document_upload(
  uuid, uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fingerprint_document_content(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_document(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_document(
  uuid, uuid, text, uuid, uuid, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION app_private.assert_owner_opening_evidence_eligible(
  uuid, uuid, uuid, text
) IS
  'Checks immutable document metadata, scope, category, archive state, hash equality, and object existence. PostgreSQL does not independently re-hash ordinary Storage bytes.';

COMMENT ON FUNCTION public.fingerprint_document_content(uuid, uuid, text) IS
  'Records a once-only hash computed by the server action from bytes actually downloaded and read. PostgreSQL verifies object presence and immutable metadata, not the object byte hash itself.';
