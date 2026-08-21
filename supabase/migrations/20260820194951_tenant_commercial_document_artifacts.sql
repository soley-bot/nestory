CREATE TABLE public.tenant_commercial_document_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('invoice', 'receipt')),
  source_id uuid NOT NULL,
  document_number text NOT NULL CHECK (length(btrim(document_number)) BETWEEN 3 AND 80),
  filename text,
  storage_path text UNIQUE,
  storage_object_id uuid UNIQUE,
  storage_object_version text CHECK (
    pg_catalog.length(storage_object_version) BETWEEN 1 AND 200
    AND storage_object_version = pg_catalog.btrim(storage_object_version)
  ),
  content_type text CHECK (content_type = 'application/pdf'),
  size_bytes bigint CHECK (size_bytes > 0),
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  renderer_version text CHECK (length(btrim(renderer_version)) BETWEEN 1 AND 40),
  presentation_snapshot jsonb CHECK (jsonb_typeof(presentation_snapshot) = 'object'),
  publication_status text NOT NULL
    CHECK (publication_status IN ('published', 'failed')),
  failure_message text,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_kind, source_id),
  CHECK (
    (publication_status = 'published'
      AND filename IS NOT NULL
      AND storage_path IS NOT NULL
      AND storage_object_id IS NOT NULL
      AND storage_object_version IS NOT NULL
      AND content_type = 'application/pdf'
      AND size_bytes IS NOT NULL
      AND sha256 IS NOT NULL
      AND renderer_version IS NOT NULL
      AND presentation_snapshot IS NOT NULL
      AND failure_message IS NULL
      AND published_at IS NOT NULL)
    OR
    (publication_status = 'failed'
      AND filename IS NULL
      AND storage_path IS NULL
      AND storage_object_id IS NULL
      AND storage_object_version IS NULL
      AND content_type IS NULL
      AND size_bytes IS NULL
      AND sha256 IS NULL
      AND renderer_version IS NULL
      AND presentation_snapshot IS NULL
      AND failure_message IS NOT NULL
      AND published_at IS NULL)
  )
);

CREATE TABLE app_private.tenant_commercial_document_upload_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('invoice', 'receipt')),
  source_id uuid NOT NULL,
  storage_path text NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(storage_path)) BETWEEN 8 AND 512
    AND storage_path = pg_catalog.btrim(storage_path)
  ),
  storage_object_id uuid NOT NULL UNIQUE,
  storage_object_version text NOT NULL CHECK (
    pg_catalog.length(storage_object_version) BETWEEN 1 AND 200
    AND storage_object_version = pg_catalog.btrim(storage_object_version)
  ),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  renderer_version text NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(renderer_version)) BETWEEN 1 AND 40
    AND renderer_version = pg_catalog.btrim(renderer_version)
  ),
  presentation_snapshot_sha256 text NOT NULL CHECK (
    presentation_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  attested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attested_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (organization_id, source_kind, source_id),
  CHECK (
    (consumed_at IS NULL AND consumed_by IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_by IS NOT NULL)
  )
);

ALTER TABLE app_private.tenant_commercial_document_upload_attestations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.tenant_commercial_document_upload_attestations
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app_private.tenant_commercial_document_upload_attestations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE app_private.tenant_commercial_document_cleanup_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('invoice', 'receipt')),
  source_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE CHECK (
    pg_catalog.length(pg_catalog.btrim(storage_path)) BETWEEN 8 AND 512
    AND storage_path = pg_catalog.btrim(storage_path)
  ),
  storage_object_id uuid NOT NULL UNIQUE,
  storage_object_version text NOT NULL CHECK (
    pg_catalog.length(storage_object_version) BETWEEN 1 AND 200
    AND storage_object_version = pg_catalog.btrim(storage_object_version)
  ),
  claimed_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  UNIQUE (organization_id, source_kind, source_id),
  CHECK (
    app_private.storage_object_org_id(storage_path) = organization_id
    AND pg_catalog.cardinality(pg_catalog.string_to_array(storage_path, '/')) = 4
    AND pg_catalog.split_part(storage_path, '/', 2) = source_kind
    AND pg_catalog.split_part(storage_path, '/', 3) = source_id::text
    AND pg_catalog.split_part(storage_path, '/', 4) ~
      '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.pdf$'
  )
);

ALTER TABLE app_private.tenant_commercial_document_cleanup_claims
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.tenant_commercial_document_cleanup_claims
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app_private.tenant_commercial_document_cleanup_claims
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX tenant_commercial_document_artifacts_org_status_idx
  ON public.tenant_commercial_document_artifacts (
    organization_id, publication_status, source_kind, created_at DESC
  );

ALTER TABLE public.tenant_commercial_document_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_commercial_document_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read tenant commercial document artifacts"
  ON public.tenant_commercial_document_artifacts
  FOR SELECT TO authenticated
  USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.tenant_commercial_document_artifacts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_commercial_document_artifacts
  TO authenticated;

CREATE OR REPLACE FUNCTION app_private.tenant_commercial_document_safe_number(
  p_document_number text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_document_number),
      '[^A-Za-z0-9._-]+',
      '-',
      'g'
    ),
    '.-_'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.tenant_commercial_document_storage_path(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_document_number text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT p_organization_id::text || '/' || p_source_kind || '/' ||
    p_source_id::text || '/' ||
    app_private.tenant_commercial_document_safe_number(p_document_number) ||
    '.pdf';
$$;

CREATE OR REPLACE FUNCTION app_private.tenant_commercial_document_filename(
  p_source_kind text,
  p_document_number text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT pg_catalog.lower(pg_catalog.btrim(p_source_kind)) || '-' ||
    app_private.tenant_commercial_document_safe_number(p_document_number) ||
    '.pdf';
$$;

-- Canonical snapshot hash contract: lowercase SHA-256 hex over the UTF-8 bytes
-- of PostgreSQL's jsonb::text representation. Callers pass the same JSON value
-- to attestation and registration; they never supply or authorize this digest.
CREATE OR REPLACE FUNCTION app_private.tenant_commercial_document_snapshot_sha256(
  p_presentation_snapshot jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_presentation_snapshot::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

ALTER TABLE public.tenant_commercial_document_artifacts
  ADD CONSTRAINT tenant_commercial_document_artifacts_filename_matches_source
  CHECK (
    filename IS NULL
    OR filename = app_private.tenant_commercial_document_filename(
      source_kind,
      document_number
    )
  );

CREATE OR REPLACE FUNCTION app_private.guard_tenant_commercial_document_artifact_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_context text := pg_catalog.current_setting(
    'app.tenant_commercial_document_artifact_write_context',
    true
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF current_user <> 'postgres'
    OR v_context IS DISTINCT FROM 'checked-commercial-document-v1' THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.publication_status <> 'failed'
    OR NEW.publication_status <> 'published'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.document_number IS DISTINCT FROM OLD.document_number
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_tenant_commercial_document_artifact_write
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.tenant_commercial_document_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_tenant_commercial_document_artifact_write();

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'tenant-commercial-documents',
  'tenant-commercial-documents',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION app_private.is_tenant_commercial_document_registered(
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_commercial_document_artifacts AS artifact
    WHERE artifact.storage_path = p_storage_path
      AND artifact.storage_object_id = p_storage_object_id
      AND artifact.storage_object_version = p_storage_object_version
      AND artifact.publication_status = 'published'
      AND (SELECT auth.uid()) IS NOT NULL
      AND app_private.can_read_finance(artifact.organization_id)
  );
$$;

CREATE POLICY "Finance roles can read registered tenant commercial documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-commercial-documents'
    AND app_private.can_read_finance(
      app_private.storage_object_org_id(name)
    )
    AND app_private.is_tenant_commercial_document_registered(name, id, version)
  );

CREATE POLICY "Finance operators can create tenant commercial documents"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-commercial-documents'
    AND app_private.can_operate_finance(
      app_private.storage_object_org_id(name)
    )
    AND pg_catalog.cardinality(pg_catalog.string_to_array(name, '/')) = 4
    AND pg_catalog.split_part(name, '/', 2) IN ('invoice', 'receipt')
    AND pg_catalog.split_part(name, '/', 3) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND pg_catalog.split_part(name, '/', 4) ~
      '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.pdf$'
  );

CREATE OR REPLACE FUNCTION app_private.can_attest_tenant_commercial_document_as_actor(
  p_organization_id uuid,
  p_actor_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.role IN ('super_admin', 'finance_manager')
      AND membership.branch_id IS NULL
      AND membership.person_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.begin_tenant_commercial_document_cleanup(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_attestation app_private.tenant_commercial_document_upload_attestations%ROWTYPE;
  v_claim app_private.tenant_commercial_document_cleanup_claims%ROWTYPE;
  v_expected_number text;
  v_expected_path text;
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_object storage.objects%ROWTYPE;
  v_path text := pg_catalog.btrim(p_storage_path);
  v_storage_object_version text := pg_catalog.btrim(p_storage_object_version);
BEGIN
  IF COALESCE((SELECT auth.role())::text, '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR v_kind NOT IN ('invoice', 'receipt')
    OR p_source_id IS NULL
    OR p_storage_object_id IS NULL
    OR pg_catalog.length(v_storage_object_version) NOT BETWEEN 1 AND 200
    OR app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id
    OR pg_catalog.cardinality(pg_catalog.string_to_array(v_path, '/')) <> 4
    OR pg_catalog.split_part(v_path, '/', 2) IS DISTINCT FROM v_kind
    OR pg_catalog.split_part(v_path, '/', 3) IS DISTINCT FROM p_source_id::text
    OR pg_catalog.split_part(v_path, '/', 4) !~
      '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.pdf$' THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_commercial_document_source_v1',
        p_organization_id,
        v_kind,
        p_source_id
      ),
      0
    )
  );

  -- An exact durable claim is the resume token. Check it before current-source
  -- validation so a worker can recover after a crash even if the authoritative
  -- document number changed or the exact Storage object was already removed.
  SELECT claim.*
  INTO v_claim
  FROM app_private.tenant_commercial_document_cleanup_claims AS claim
  WHERE claim.organization_id = p_organization_id
    AND claim.source_kind = v_kind
    AND claim.source_id = p_source_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.storage_path IS NOT DISTINCT FROM v_path
      AND v_claim.storage_object_id IS NOT DISTINCT FROM p_storage_object_id
      AND v_claim.storage_object_version IS NOT DISTINCT FROM v_storage_object_version THEN
      RETURN v_claim.id;
    END IF;

    RETURN NULL;
  END IF;

  IF v_kind = 'invoice' THEN
    SELECT invoice.invoice_number
    INTO v_expected_number
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_source_id
    FOR KEY SHARE;
  ELSE
    SELECT payment.receipt_number
    INTO v_expected_number
    FROM public.tenant_invoice_payments AS payment
    WHERE payment.organization_id = p_organization_id
      AND payment.id = p_source_id
    FOR KEY SHARE;
  END IF;

  IF v_expected_number IS NULL
    OR app_private.tenant_commercial_document_safe_number(v_expected_number) = '' THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_expected_path := app_private.tenant_commercial_document_storage_path(
    p_organization_id,
    v_kind,
    p_source_id,
    v_expected_number
  );

  IF v_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'tenant-commercial-documents'
    AND object.name = v_path
  FOR KEY SHARE;

  IF v_object.id IS NULL
    OR v_object.id IS DISTINCT FROM p_storage_object_id
    OR v_object.version IS DISTINCT FROM v_storage_object_version
    OR EXISTS (
      SELECT 1
      FROM public.tenant_commercial_document_artifacts AS artifact
      WHERE artifact.organization_id = p_organization_id
        AND artifact.source_kind = v_kind
        AND artifact.source_id = p_source_id
        AND artifact.publication_status = 'published'
    ) THEN
    RETURN NULL;
  END IF;

  SELECT attestation.*
  INTO v_attestation
  FROM app_private.tenant_commercial_document_upload_attestations AS attestation
  WHERE attestation.organization_id = p_organization_id
    AND attestation.source_kind = v_kind
    AND attestation.source_id = p_source_id
  FOR UPDATE;

  IF FOUND AND (
    v_attestation.consumed_at IS NOT NULL
    OR v_attestation.storage_path IS DISTINCT FROM v_path
    OR v_attestation.storage_object_id IS DISTINCT FROM p_storage_object_id
    OR v_attestation.storage_object_version IS DISTINCT FROM v_storage_object_version
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO app_private.tenant_commercial_document_cleanup_claims (
    organization_id,
    source_kind,
    source_id,
    storage_path,
    storage_object_id,
    storage_object_version
  ) VALUES (
    p_organization_id,
    v_kind,
    p_source_id,
    v_path,
    p_storage_object_id,
    v_storage_object_version
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_claim.id;

  RETURN v_claim.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_tenant_commercial_document_cleanup(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_cleanup_claim_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_claim app_private.tenant_commercial_document_cleanup_claims%ROWTYPE;
  v_deleted_count integer := 0;
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_storage_object_version text := pg_catalog.btrim(p_storage_object_version);
BEGIN
  IF COALESCE((SELECT auth.role())::text, '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR v_kind NOT IN ('invoice', 'receipt')
    OR p_source_id IS NULL
    OR p_storage_object_id IS NULL
    OR p_cleanup_claim_id IS NULL
    OR pg_catalog.length(v_storage_object_version) NOT BETWEEN 1 AND 200
    OR app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id
    OR pg_catalog.cardinality(pg_catalog.string_to_array(v_path, '/')) <> 4
    OR pg_catalog.split_part(v_path, '/', 2) IS DISTINCT FROM v_kind
    OR pg_catalog.split_part(v_path, '/', 3) IS DISTINCT FROM p_source_id::text THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_commercial_document_source_v1',
        p_organization_id,
        v_kind,
        p_source_id
      ),
      0
    )
  );

  SELECT claim.*
  INTO v_claim
  FROM app_private.tenant_commercial_document_cleanup_claims AS claim
  WHERE claim.organization_id = p_organization_id
    AND claim.id = p_cleanup_claim_id
    AND claim.source_kind = v_kind
    AND claim.source_id = p_source_id
    AND claim.storage_path = v_path
    AND claim.storage_object_id = p_storage_object_id
    AND claim.storage_object_version = v_storage_object_version
  FOR UPDATE;

  IF v_claim.storage_path IS NULL
    OR EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'tenant-commercial-documents'
        AND object.name = v_path
        AND object.id = p_storage_object_id
        AND object.version = v_storage_object_version
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_commercial_document_artifacts AS artifact
      WHERE artifact.organization_id = p_organization_id
        AND artifact.source_kind = v_kind
        AND artifact.source_id = p_source_id
        AND artifact.publication_status = 'published'
    ) THEN
    RETURN false;
  END IF;

  DELETE FROM app_private.tenant_commercial_document_upload_attestations AS attestation
  WHERE attestation.organization_id = p_organization_id
    AND attestation.source_kind = v_kind
    AND attestation.source_id = p_source_id
    AND attestation.storage_path = v_path
    AND attestation.storage_object_id = p_storage_object_id
    AND attestation.storage_object_version = v_storage_object_version
    AND attestation.consumed_at IS NULL;

  DELETE FROM app_private.tenant_commercial_document_cleanup_claims AS claim
  WHERE claim.organization_id = p_organization_id
    AND claim.id = p_cleanup_claim_id
    AND claim.source_kind = v_kind
    AND claim.source_id = p_source_id
    AND claim.storage_path = v_path
    AND claim.storage_object_id = p_storage_object_id
    AND claim.storage_object_version = v_storage_object_version;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.guard_tenant_commercial_document_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.bucket_id IS DISTINCT FROM 'tenant-commercial-documents' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'tenant_commercial_document_storage_update_forbidden'
      USING ERRCODE = '42501';
  END IF;

  -- The Storage API supplies no request-scoped attempt token to this trigger.
  -- Under the globally trusted service_role boundary, deletion therefore
  -- requires both service_role and a durable claim matching OLD exactly.
  IF COALESCE((SELECT auth.role())::text, '') IS DISTINCT FROM 'service_role'
    OR NOT EXISTS (
      SELECT 1
      FROM app_private.tenant_commercial_document_cleanup_claims AS claim
      WHERE claim.organization_id = app_private.storage_object_org_id(OLD.name)
        AND claim.source_kind = pg_catalog.split_part(OLD.name, '/', 2)
        AND claim.source_id::text = pg_catalog.split_part(OLD.name, '/', 3)
        AND claim.storage_path = OLD.name
        AND claim.storage_object_id = OLD.id
        AND claim.storage_object_version = OLD.version
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_commercial_document_artifacts AS artifact
          WHERE artifact.organization_id = claim.organization_id
            AND artifact.source_kind = claim.source_kind
            AND artifact.source_id = claim.source_id
            AND artifact.publication_status = 'published'
        )
    ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_storage_delete_forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER guard_tenant_commercial_document_storage_object
  BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_tenant_commercial_document_storage_object();

CREATE OR REPLACE FUNCTION public.attest_tenant_commercial_document_upload(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_actor_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_sha256 text,
  p_size_bytes bigint,
  p_renderer_version text,
  p_presentation_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_attestation app_private.tenant_commercial_document_upload_attestations%ROWTYPE;
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_presentation_snapshot_sha256 text;
  v_renderer_version text := pg_catalog.btrim(p_renderer_version);
  v_sha256 text := pg_catalog.btrim(p_sha256);
  v_storage_object storage.objects%ROWTYPE;
  v_storage_object_version text := pg_catalog.btrim(p_storage_object_version);
BEGIN
  IF NOT app_private.can_attest_tenant_commercial_document_as_actor(
    p_organization_id,
    p_actor_id
  ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_kind NOT IN ('invoice', 'receipt')
    OR p_source_id IS NULL
    OR p_storage_object_id IS NULL
    OR pg_catalog.length(v_storage_object_version) NOT BETWEEN 1 AND 200
    OR pg_catalog.length(v_renderer_version) NOT BETWEEN 1 AND 40
    OR pg_catalog.jsonb_typeof(p_presentation_snapshot) IS DISTINCT FROM 'object'
    OR v_sha256 !~ '^[0-9a-f]{64}$'
    OR p_size_bytes IS NULL OR p_size_bytes <= 0
    OR app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id
    OR pg_catalog.cardinality(pg_catalog.string_to_array(v_path, '/')) <> 4
    OR pg_catalog.split_part(v_path, '/', 2) IS DISTINCT FROM v_kind
    OR pg_catalog.split_part(v_path, '/', 3) IS DISTINCT FROM p_source_id::text
    OR pg_catalog.split_part(v_path, '/', 4) !~
      '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.pdf$' THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_presentation_snapshot_sha256 :=
    app_private.tenant_commercial_document_snapshot_sha256(
      p_presentation_snapshot
    );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_commercial_document_source_v1',
        p_organization_id,
        v_kind,
        p_source_id
      ),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM app_private.tenant_commercial_document_cleanup_claims AS claim
    WHERE claim.organization_id = p_organization_id
      AND claim.source_kind = v_kind
      AND claim.source_id = p_source_id
  ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_in_progress'
      USING ERRCODE = '55000';
  END IF;

  SELECT object.*
  INTO v_storage_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'tenant-commercial-documents'
    AND object.name = v_path
    AND object.id = p_storage_object_id
    AND object.version = v_storage_object_version
  FOR SHARE;

  IF v_storage_object.id IS NULL
    OR v_storage_object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf'
    OR v_storage_object.metadata->>'size' IS DISTINCT FROM p_size_bytes::text THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_object_invalid'
      USING ERRCODE = '23503';
  END IF;

  -- PostgreSQL cannot hash provider-held bytes. Trust in this digest comes only
  -- from this service_role-only interface; Task 3 must compute it from the exact
  -- bytes before upload/attestation and re-hash every download.
  SELECT attestation.*
  INTO v_attestation
  FROM app_private.tenant_commercial_document_upload_attestations AS attestation
  WHERE attestation.organization_id = p_organization_id
    AND attestation.source_kind = v_kind
    AND attestation.source_id = p_source_id
  FOR UPDATE;

  IF FOUND AND v_attestation.consumed_at IS NOT NULL THEN
    IF v_attestation.storage_path IS DISTINCT FROM v_path
      OR v_attestation.storage_object_id IS DISTINCT FROM p_storage_object_id
      OR v_attestation.storage_object_version IS DISTINCT FROM v_storage_object_version
      OR v_attestation.size_bytes IS DISTINCT FROM p_size_bytes
      OR v_attestation.sha256 IS DISTINCT FROM v_sha256
      OR v_attestation.renderer_version IS DISTINCT FROM v_renderer_version
      OR v_attestation.presentation_snapshot_sha256 IS DISTINCT FROM
        v_presentation_snapshot_sha256 THEN
      RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_conflict'
        USING ERRCODE = '23514';
    END IF;
    RETURN v_attestation.id;
  END IF;

  IF FOUND THEN
    UPDATE app_private.tenant_commercial_document_upload_attestations AS attestation
    SET storage_path = v_path,
        storage_object_id = p_storage_object_id,
        storage_object_version = v_storage_object_version,
        size_bytes = p_size_bytes,
        sha256 = v_sha256,
        renderer_version = v_renderer_version,
        presentation_snapshot_sha256 = v_presentation_snapshot_sha256,
        attested_by = p_actor_id,
        attested_at = pg_catalog.now()
    WHERE attestation.id = v_attestation.id;
    RETURN v_attestation.id;
  END IF;

  INSERT INTO app_private.tenant_commercial_document_upload_attestations (
    organization_id,
    source_kind,
    source_id,
    storage_path,
    storage_object_id,
    storage_object_version,
    size_bytes,
    sha256,
    renderer_version,
    presentation_snapshot_sha256,
    attested_by
  ) VALUES (
    p_organization_id,
    v_kind,
    p_source_id,
    v_path,
    p_storage_object_id,
    v_storage_object_version,
    p_size_bytes,
    v_sha256,
    v_renderer_version,
    v_presentation_snapshot_sha256,
    p_actor_id
  ) RETURNING id INTO v_attestation.id;

  RETURN v_attestation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_commercial_document_publication_source(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_kind NOT IN ('invoice', 'receipt') THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'invoice' THEN
    SELECT pg_catalog.jsonb_build_object(
      'source_kind', 'invoice',
      'source_id', invoice.id::text,
      'document_number', invoice.invoice_number,
      'source_state', CASE
        WHEN invoice.lifecycle = 'void' THEN 'voided'
        ELSE 'current'
      END,
      'issuer', pg_catalog.jsonb_build_object(
        'organization_id', organization.id::text,
        'name', organization.name
      ),
      'recipient', pg_catalog.jsonb_build_object(
        'person_id', recipient.id::text,
        'label', invoice.recipient_label,
        'kind', invoice.recipient_kind,
        'email', recipient.primary_email,
        'phone', recipient.primary_phone
      ),
      'property', pg_catalog.jsonb_build_object(
        'id', property.id::text,
        'code', property.code,
        'name', property.name,
        'unit_id', unit.id::text,
        'unit_number', unit.unit_number
      ),
      'invoice', pg_catalog.jsonb_build_object(
        'billing_period_start', invoice.billing_period_start::text,
        'billing_period_end', invoice.billing_period_end::text,
        'issue_date', invoice.issue_date::text,
        'due_date', invoice.due_date::text,
        'currency', invoice.currency::text,
        'total_amount', invoice.total_amount::text,
        'collection_route', invoice.collection_route,
        'lifecycle', invoice.lifecycle
      ),
      'lines', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', line.id::text,
            'line_type', line.line_type,
            'label', line.customer_label,
            'description', line.description,
            'amount', line.amount::text,
            'sort_order', line.sort_order
          ) ORDER BY line.sort_order, line.id
        )
        FROM public.tenant_invoice_lines AS line
        WHERE line.organization_id = invoice.organization_id
          AND line.invoice_id = invoice.id
      ), '[]'::jsonb),
      'artifact', (
        SELECT pg_catalog.to_jsonb(existing_artifact)
          - 'organization_id' - 'presentation_snapshot'
        FROM public.tenant_commercial_document_artifacts AS existing_artifact
        WHERE existing_artifact.organization_id = invoice.organization_id
          AND existing_artifact.source_kind = 'invoice'
          AND existing_artifact.source_id = invoice.id
      )
    )
    INTO v_result
    FROM public.tenant_invoices AS invoice
    JOIN public.organizations AS organization
      ON organization.id = invoice.organization_id
    JOIN public.people AS recipient
      ON recipient.organization_id = invoice.organization_id
     AND recipient.id = invoice.recipient_person_id
    JOIN public.properties AS property
      ON property.organization_id = invoice.organization_id
     AND property.id = invoice.property_id
    LEFT JOIN public.units AS unit
      ON unit.organization_id = invoice.organization_id
     AND unit.id = invoice.unit_id
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_source_id;
  ELSE
    WITH source_payment AS (
      SELECT payment.*
      FROM public.tenant_invoice_payments AS payment
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id = payment.organization_id
       AND invoice.id = payment.invoice_id
      JOIN public.financial_reconciliation_sources AS source
        ON source.organization_id = payment.organization_id
       AND source.id = payment.reconciliation_source_id
      WHERE payment.organization_id = p_organization_id
        AND payment.id = p_source_id
        AND payment.reversal_of_id IS NULL
        AND invoice.collection_route = 'through_ips'
        AND source.code = 'IPS_COLLECTIONS'
    ), settlement_events AS (
      SELECT
        payment.received_date AS event_date,
        payment.created_at,
        payment.id,
        CASE WHEN payment.reversal_of_id IS NULL
          THEN payment.amount ELSE -payment.amount END AS signed_amount
      FROM public.tenant_invoice_payments AS payment
      JOIN source_payment AS source
        ON source.organization_id = payment.organization_id
       AND source.invoice_id = payment.invoice_id
      UNION ALL
      SELECT
        confirmation.confirmed_date,
        confirmation.created_at,
        confirmation.id,
        CASE WHEN confirmation.reversal_of_id IS NULL
          THEN confirmation.amount ELSE -confirmation.amount END
      FROM public.owner_collection_confirmations AS confirmation
      JOIN source_payment AS source
        ON source.organization_id = confirmation.organization_id
       AND source.invoice_id = confirmation.invoice_id
    ), previous_settlement AS (
      SELECT COALESCE(pg_catalog.sum(event.signed_amount), 0) AS amount
      FROM settlement_events AS event
      CROSS JOIN source_payment AS source
      WHERE (event.event_date, event.created_at, event.id)
        < (source.received_date, source.created_at, source.id)
    )
    SELECT pg_catalog.jsonb_build_object(
      'source_kind', 'receipt',
      'source_id', payment.id::text,
      'document_number', payment.receipt_number,
      'source_state', CASE
        WHEN payment.reversal_of_id IS NOT NULL THEN 'reversal'
        WHEN EXISTS (
          SELECT 1
          FROM public.tenant_invoice_payments AS reversal
          WHERE reversal.organization_id = payment.organization_id
            AND reversal.reversal_of_id = payment.id
        ) THEN 'reversed'
        ELSE 'current'
      END,
      'issuer', pg_catalog.jsonb_build_object(
        'organization_id', organization.id::text,
        'name', organization.name
      ),
      'recipient', pg_catalog.jsonb_build_object(
        'person_id', recipient.id::text,
        'label', invoice.recipient_label,
        'kind', invoice.recipient_kind
      ),
      'property', pg_catalog.jsonb_build_object(
        'id', property.id::text,
        'code', property.code,
        'name', property.name,
        'unit_id', unit.id::text,
        'unit_number', unit.unit_number
      ),
      'invoice', pg_catalog.jsonb_build_object(
        'id', invoice.id::text,
        'invoice_number', invoice.invoice_number,
        'currency', invoice.currency::text,
        'total_amount', invoice.total_amount::text,
        'lifecycle', invoice.lifecycle
      ),
      'payment', pg_catalog.jsonb_build_object(
        'received_date', payment.received_date::text,
        'amount', payment.amount::text,
        'reference', payment.reference,
        'reversal_of_id', payment.reversal_of_id::text,
        'amount_previously_paid', previous.amount::text,
        'remaining_balance',
          (invoice.total_amount - previous.amount - payment.amount)::text
      ),
      'allocations', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'invoice_line_id', allocation.invoice_line_id::text,
            'label', line.customer_label,
            'description', line.description,
            'amount', allocation.amount::text,
            'allocation_order', allocation.allocation_order
          ) ORDER BY allocation.allocation_order, allocation.id
        )
        FROM public.tenant_invoice_payment_allocations AS allocation
        JOIN public.tenant_invoice_lines AS line
          ON line.organization_id = allocation.organization_id
         AND line.id = allocation.invoice_line_id
        WHERE allocation.organization_id = payment.organization_id
          AND allocation.payment_id = payment.id
      ), '[]'::jsonb),
      'artifact', (
        SELECT pg_catalog.to_jsonb(existing_artifact)
          - 'organization_id' - 'presentation_snapshot'
        FROM public.tenant_commercial_document_artifacts AS existing_artifact
        WHERE existing_artifact.organization_id = payment.organization_id
          AND existing_artifact.source_kind = 'receipt'
          AND existing_artifact.source_id = payment.id
      )
    )
    INTO v_result
    FROM source_payment AS payment
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = payment.organization_id
     AND invoice.id = payment.invoice_id
    JOIN public.organizations AS organization
      ON organization.id = payment.organization_id
    JOIN public.people AS recipient
      ON recipient.organization_id = invoice.organization_id
     AND recipient.id = invoice.recipient_person_id
    JOIN public.properties AS property
      ON property.organization_id = invoice.organization_id
     AND property.id = invoice.property_id
    LEFT JOIN public.units AS unit
      ON unit.organization_id = invoice.organization_id
     AND unit.id = invoice.unit_id
    CROSS JOIN previous_settlement AS previous;
  END IF;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_not_found'
      USING ERRCODE = '23503';
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_tenant_commercial_document_artifact(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_renderer_version text,
  p_document_number text,
  p_presentation_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_artifact public.tenant_commercial_document_artifacts%ROWTYPE;
  v_attestation app_private.tenant_commercial_document_upload_attestations%ROWTYPE;
  v_document_number text := pg_catalog.btrim(p_document_number);
  v_expected_number text;
  v_expected_path text;
  v_filename text;
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_presentation_snapshot_sha256 text;
  v_renderer_version text := pg_catalog.btrim(p_renderer_version);
  v_sha256 text := pg_catalog.btrim(p_sha256);
  v_storage_object storage.objects%ROWTYPE;
  v_was_failed boolean := false;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_commercial_document_register_forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_presentation_snapshot_sha256 :=
    app_private.tenant_commercial_document_snapshot_sha256(
      p_presentation_snapshot
    );

  IF v_kind NOT IN ('invoice', 'receipt') THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_source_id IS NULL
    OR pg_catalog.length(v_document_number) NOT BETWEEN 3 AND 80
    OR pg_catalog.length(v_renderer_version) NOT BETWEEN 1 AND 40
    OR v_sha256 !~ '^[0-9a-f]{64}$'
    OR p_size_bytes IS NULL OR p_size_bytes <= 0
    OR pg_catalog.jsonb_typeof(p_presentation_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_commercial_document_source_v1',
        p_organization_id,
        v_kind,
        p_source_id
      ),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM app_private.tenant_commercial_document_cleanup_claims AS claim
    WHERE claim.organization_id = p_organization_id
      AND claim.source_kind = v_kind
      AND claim.source_id = p_source_id
  ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_cleanup_in_progress'
      USING ERRCODE = '55000';
  END IF;

  IF v_kind = 'invoice' THEN
    SELECT invoice.invoice_number
    INTO v_expected_number
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_source_id
    FOR KEY SHARE;

    IF v_expected_number IS NULL THEN
      RAISE EXCEPTION 'tenant_commercial_document_source_not_found'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.id = p_source_id
        AND invoice.lifecycle = 'void'
    ) THEN
      RAISE EXCEPTION 'tenant_commercial_document_invoice_void'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT payment.receipt_number
    INTO v_expected_number
    FROM public.tenant_invoice_payments AS payment
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = payment.organization_id
     AND invoice.id = payment.invoice_id
    JOIN public.financial_reconciliation_sources AS source
      ON source.organization_id = payment.organization_id
     AND source.id = payment.reconciliation_source_id
    WHERE payment.organization_id = p_organization_id
      AND payment.id = p_source_id
      AND invoice.collection_route = 'through_ips'
      AND source.code = 'IPS_COLLECTIONS'
    FOR KEY SHARE OF payment;

    IF v_expected_number IS NULL THEN
      RAISE EXCEPTION 'tenant_commercial_document_source_not_found'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoice_payments AS payment
      WHERE payment.organization_id = p_organization_id
        AND payment.id = p_source_id
        AND payment.reversal_of_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'tenant_commercial_document_payment_reversal'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_document_number IS DISTINCT FROM v_expected_number THEN
    RAISE EXCEPTION 'tenant_commercial_document_number_mismatch'
      USING ERRCODE = '22023';
  END IF;

  v_expected_path := app_private.tenant_commercial_document_storage_path(
    p_organization_id,
    v_kind,
    p_source_id,
    v_expected_number
  );
  v_filename := app_private.tenant_commercial_document_filename(
    v_kind,
    v_expected_number
  );
  IF app_private.tenant_commercial_document_safe_number(v_expected_number) = ''
    OR v_path IS DISTINCT FROM v_expected_path
    OR app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'tenant_commercial_document_storage_path_invalid'
      USING ERRCODE = '22023';
  END IF;

  -- storage.objects contains metadata, not the provider bytes. Persisting its
  -- database-assigned identity/version prevents a path from being rebound
  -- unnoticed. The server must still hash actual bytes before registration and
  -- re-hash downloaded bytes before returning them.
  SELECT object.*
  INTO v_storage_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'tenant-commercial-documents'
    AND object.name = v_path
  FOR SHARE;

  IF v_storage_object.id IS NULL
    OR v_storage_object.version IS NULL
    OR pg_catalog.length(pg_catalog.btrim(v_storage_object.version))
      NOT BETWEEN 1 AND 200
    OR v_storage_object.version IS DISTINCT FROM
      pg_catalog.btrim(v_storage_object.version)
    OR v_storage_object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf'
    OR v_storage_object.metadata->>'size' IS DISTINCT FROM p_size_bytes::text THEN
    RAISE EXCEPTION 'tenant_commercial_document_storage_object_invalid'
      USING ERRCODE = '23503';
  END IF;

  SELECT artifact.*
  INTO v_artifact
  FROM public.tenant_commercial_document_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.source_kind = v_kind
    AND artifact.source_id = p_source_id
  FOR UPDATE;

  IF FOUND AND v_artifact.publication_status = 'published' THEN
    IF v_artifact.document_number IS DISTINCT FROM v_expected_number
      OR v_artifact.filename IS DISTINCT FROM v_filename
      OR v_artifact.storage_path IS DISTINCT FROM v_path
      OR v_artifact.storage_object_id IS DISTINCT FROM v_storage_object.id
      OR v_artifact.storage_object_version IS DISTINCT FROM v_storage_object.version
      OR v_artifact.content_type IS DISTINCT FROM 'application/pdf'
      OR v_artifact.size_bytes IS DISTINCT FROM p_size_bytes
      OR v_artifact.sha256 IS DISTINCT FROM v_sha256
      OR v_artifact.renderer_version IS DISTINCT FROM v_renderer_version
      OR v_artifact.presentation_snapshot IS DISTINCT FROM p_presentation_snapshot THEN
      RAISE EXCEPTION 'tenant_commercial_document_artifact_conflict'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_artifact.id;
  END IF;

  v_was_failed := FOUND AND v_artifact.publication_status = 'failed';

  SELECT attestation.*
  INTO v_attestation
  FROM app_private.tenant_commercial_document_upload_attestations AS attestation
  WHERE attestation.organization_id = p_organization_id
    AND attestation.source_kind = v_kind
    AND attestation.source_id = p_source_id
  FOR UPDATE;

  IF v_attestation.id IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_unattested'
      USING ERRCODE = '23503';
  END IF;

  IF v_attestation.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_consumed'
      USING ERRCODE = '23514';
  END IF;

  IF v_attestation.attested_by IS DISTINCT FROM v_actor_id
    OR v_attestation.storage_path IS DISTINCT FROM v_path
    OR v_attestation.storage_object_id IS DISTINCT FROM v_storage_object.id
    OR v_attestation.storage_object_version IS DISTINCT FROM v_storage_object.version
    OR v_attestation.size_bytes IS DISTINCT FROM p_size_bytes
    OR v_attestation.sha256 IS DISTINCT FROM v_sha256
    OR v_attestation.renderer_version IS DISTINCT FROM v_renderer_version
    OR v_attestation.presentation_snapshot_sha256 IS DISTINCT FROM
      v_presentation_snapshot_sha256 THEN
    RAISE EXCEPTION 'tenant_commercial_document_upload_attestation_mismatch'
      USING ERRCODE = '22023';
  END IF;

  UPDATE app_private.tenant_commercial_document_upload_attestations AS attestation
  SET consumed_at = pg_catalog.now(),
      consumed_by = v_actor_id
  WHERE attestation.id = v_attestation.id;

  PERFORM pg_catalog.set_config(
    'app.tenant_commercial_document_artifact_write_context',
    'checked-commercial-document-v1',
    true
  );

  IF v_artifact.id IS NULL THEN
    INSERT INTO public.tenant_commercial_document_artifacts (
      organization_id,
      source_kind,
      source_id,
      document_number,
      filename,
      storage_path,
      storage_object_id,
      storage_object_version,
      content_type,
      size_bytes,
      sha256,
      renderer_version,
      presentation_snapshot,
      publication_status,
      published_at,
      published_by
    ) VALUES (
      p_organization_id,
      v_kind,
      p_source_id,
      v_expected_number,
      v_filename,
      v_path,
      v_storage_object.id,
      v_storage_object.version,
      'application/pdf',
      p_size_bytes,
      v_sha256,
      v_renderer_version,
      p_presentation_snapshot,
      'published',
      pg_catalog.now(),
      v_actor_id
    ) RETURNING id INTO v_artifact.id;
  ELSE
    UPDATE public.tenant_commercial_document_artifacts AS artifact
    SET filename = v_filename,
        storage_path = v_path,
        storage_object_id = v_storage_object.id,
        storage_object_version = v_storage_object.version,
        content_type = 'application/pdf',
        size_bytes = p_size_bytes,
        sha256 = v_sha256,
        renderer_version = v_renderer_version,
        presentation_snapshot = p_presentation_snapshot,
        publication_status = 'published',
        failure_message = NULL,
        published_at = pg_catalog.now(),
        published_by = v_actor_id
    WHERE artifact.id = v_artifact.id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'tenant_commercial_document_artifact',
    v_artifact.id,
    CASE
      WHEN v_was_failed THEN
        'tenant_' || v_kind || '_pdf_publication_retried'
      ELSE
        'tenant_' || v_kind || '_pdf_published'
    END,
    pg_catalog.jsonb_build_object(
      'source_kind', v_kind,
      'source_id', p_source_id,
      'artifact_id', v_artifact.id,
      'publication_status', 'published'
    )
  );

  RETURN v_artifact.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_tenant_commercial_document_publication_failed(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_failure_message text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_artifact public.tenant_commercial_document_artifacts%ROWTYPE;
  v_document_number text;
  v_failure_message text := pg_catalog.btrim(p_failure_message);
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_commercial_document_failure_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_kind NOT IN ('invoice', 'receipt') THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_source_id IS NULL
    OR pg_catalog.length(v_failure_message) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'tenant_commercial_document_failure_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_commercial_document_source_v1',
        p_organization_id,
        v_kind,
        p_source_id
      ),
      0
    )
  );

  IF v_kind = 'invoice' THEN
    SELECT invoice.invoice_number
    INTO v_document_number
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_source_id
      AND invoice.lifecycle = 'issued';
  ELSE
    SELECT payment.receipt_number
    INTO v_document_number
    FROM public.tenant_invoice_payments AS payment
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = payment.organization_id
     AND invoice.id = payment.invoice_id
    JOIN public.financial_reconciliation_sources AS source
      ON source.organization_id = payment.organization_id
     AND source.id = payment.reconciliation_source_id
    WHERE payment.organization_id = p_organization_id
      AND payment.id = p_source_id
      AND payment.reversal_of_id IS NULL
      AND invoice.collection_route = 'through_ips'
      AND source.code = 'IPS_COLLECTIONS';
  END IF;

  IF v_document_number IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_not_found'
      USING ERRCODE = '23503';
  END IF;

  SELECT artifact.*
  INTO v_artifact
  FROM public.tenant_commercial_document_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.source_kind = v_kind
    AND artifact.source_id = p_source_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_artifact.publication_status = 'failed' THEN
      INSERT INTO public.activity_logs (
        organization_id,
        actor_id,
        entity_type,
        entity_id,
        action,
        new_values
      ) VALUES (
        p_organization_id,
        v_actor_id,
        'tenant_commercial_document_artifact',
        v_artifact.id,
        'tenant_' || v_kind || '_pdf_publication_retry_failed',
        pg_catalog.jsonb_build_object(
          'source_kind', v_kind,
          'source_id', p_source_id,
          'artifact_id', v_artifact.id,
          'publication_status', 'failed'
        )
      );
    END IF;
    RETURN v_artifact.id;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.tenant_commercial_document_artifact_write_context',
    'checked-commercial-document-v1',
    true
  );

  INSERT INTO public.tenant_commercial_document_artifacts (
    organization_id,
    source_kind,
    source_id,
    document_number,
    publication_status,
    failure_message
  ) VALUES (
    p_organization_id,
    v_kind,
    p_source_id,
    v_document_number,
    'failed',
    v_failure_message
  ) RETURNING id INTO v_artifact.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'tenant_commercial_document_artifact',
    v_artifact.id,
    'tenant_' || v_kind || '_pdf_publication_failed',
    pg_catalog.jsonb_build_object(
      'source_kind', v_kind,
      'source_id', p_source_id,
      'artifact_id', v_artifact.id,
      'publication_status', 'failed'
    )
  );

  RETURN v_artifact.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_commercial_document_artifact_download(
  p_organization_id uuid,
  p_artifact_id uuid
) RETURNS TABLE (
  id uuid,
  source_kind text,
  source_id uuid,
  document_number text,
  filename text,
  storage_path text,
  content_type text,
  size_bytes bigint,
  sha256 text,
  renderer_version text,
  publication_status text,
  source_state text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_artifact public.tenant_commercial_document_artifacts%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_commercial_document_download_forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT artifact.*
  INTO v_artifact
  FROM public.tenant_commercial_document_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.id = p_artifact_id;

  IF v_artifact.id IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF v_artifact.publication_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'tenant_commercial_document_artifact_not_published'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'tenant-commercial-documents'
        AND object.name = v_artifact.storage_path
        AND object.id = v_artifact.storage_object_id
        AND object.version = v_artifact.storage_object_version
        AND object.metadata->>'mimetype' = v_artifact.content_type
        AND object.metadata->>'size' = v_artifact.size_bytes::text
    ) THEN
    RAISE EXCEPTION 'tenant_commercial_document_storage_object_changed'
      USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  SELECT
    artifact.id,
    artifact.source_kind,
    artifact.source_id,
    artifact.document_number,
    artifact.filename,
    artifact.storage_path,
    artifact.content_type,
    artifact.size_bytes,
    artifact.sha256,
    artifact.renderer_version,
    artifact.publication_status,
    CASE
      WHEN artifact.source_kind = 'invoice' THEN COALESCE((
        SELECT CASE WHEN invoice.lifecycle = 'void' THEN 'voided' ELSE 'current' END
        FROM public.tenant_invoices AS invoice
        WHERE invoice.organization_id = artifact.organization_id
          AND invoice.id = artifact.source_id
      ), 'missing')
      ELSE CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.tenant_invoice_payments AS reversal
          WHERE reversal.organization_id = artifact.organization_id
            AND reversal.reversal_of_id = artifact.source_id
        ) THEN 'reversed'
        WHEN EXISTS (
          SELECT 1
          FROM public.tenant_invoice_payments AS payment
          WHERE payment.organization_id = artifact.organization_id
            AND payment.id = artifact.source_id
            AND payment.reversal_of_id IS NULL
        ) THEN 'current'
        ELSE 'missing'
      END
    END AS source_state
  FROM public.tenant_commercial_document_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.id = p_artifact_id;

END;
$$;

ALTER TABLE public.tenant_commercial_document_artifacts OWNER TO postgres;
ALTER TABLE app_private.tenant_commercial_document_upload_attestations
  OWNER TO postgres;
ALTER TABLE app_private.tenant_commercial_document_cleanup_claims
  OWNER TO postgres;
ALTER FUNCTION app_private.tenant_commercial_document_safe_number(text)
  OWNER TO postgres;
ALTER FUNCTION app_private.tenant_commercial_document_storage_path(
  uuid, text, uuid, text
) OWNER TO postgres;
ALTER FUNCTION app_private.tenant_commercial_document_filename(text, text)
  OWNER TO postgres;
ALTER FUNCTION app_private.tenant_commercial_document_snapshot_sha256(jsonb)
  OWNER TO postgres;
ALTER FUNCTION app_private.guard_tenant_commercial_document_artifact_write()
  OWNER TO postgres;
ALTER FUNCTION app_private.is_tenant_commercial_document_registered(text, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION app_private.can_attest_tenant_commercial_document_as_actor(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.begin_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text
) OWNER TO postgres;
ALTER FUNCTION public.finish_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text, uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.guard_tenant_commercial_document_storage_object()
  OWNER TO postgres;
ALTER FUNCTION public.attest_tenant_commercial_document_upload(
  uuid, text, uuid, uuid, text, uuid, text, text, bigint, text, jsonb
) OWNER TO postgres;
ALTER FUNCTION public.get_tenant_commercial_document_publication_source(
  uuid, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.register_tenant_commercial_document_artifact(
  uuid, text, uuid, text, text, bigint, text, text, jsonb
) OWNER TO postgres;
ALTER FUNCTION public.mark_tenant_commercial_document_publication_failed(
  uuid, text, uuid, text
) OWNER TO postgres;
ALTER FUNCTION public.get_tenant_commercial_document_artifact_download(
  uuid, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.tenant_commercial_document_safe_number(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.tenant_commercial_document_storage_path(
  uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.tenant_commercial_document_filename(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.tenant_commercial_document_snapshot_sha256(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_tenant_commercial_document_artifact_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.is_tenant_commercial_document_registered(text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_commercial_document_registered(text, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.can_attest_tenant_commercial_document_as_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_tenant_commercial_document_storage_object()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.attest_tenant_commercial_document_upload(
  uuid, text, uuid, uuid, text, uuid, text, text, bigint, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attest_tenant_commercial_document_upload(
  uuid, text, uuid, uuid, text, uuid, text, text, bigint, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.get_tenant_commercial_document_publication_source(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_tenant_commercial_document_artifact(
  uuid, text, uuid, text, text, bigint, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_tenant_commercial_document_publication_failed(
  uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tenant_commercial_document_artifact_download(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_tenant_commercial_document_publication_source(
  uuid, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_tenant_commercial_document_artifact(
  uuid, text, uuid, text, text, bigint, text, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_tenant_commercial_document_publication_failed(
  uuid, text, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_commercial_document_artifact_download(
  uuid, uuid
) TO authenticated;

COMMENT ON TABLE app_private.tenant_commercial_document_cleanup_claims IS
  'Durable exact-object claims that serialize tenant commercial document orphan deletion against source-wide attestation and registration.';
COMMENT ON FUNCTION public.begin_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text
) IS
  'Returns a durable UUID for a new or exactly resumed unregistered tenant commercial document Storage cleanup claim; conflicting attempts return null.';
COMMENT ON FUNCTION public.finish_tenant_commercial_document_cleanup(
  uuid, text, uuid, text, uuid, text, uuid
) IS
  'Releases the identified exact cleanup claim and unconsumed attestation only after the claimed Storage object is absent or replaced.';
