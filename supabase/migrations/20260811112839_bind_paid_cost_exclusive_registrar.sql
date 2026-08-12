-- Make paid-cost evidence authority an exclusive service-registrar record.
-- Ordinary authenticated uploads, document creation, and activity insertion
-- cannot create or imitate this authority.

CREATE TABLE app_private.paid_cost_evidence_registrations (
  document_id uuid PRIMARY KEY
    REFERENCES public.documents(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  content_sha256 text NOT NULL
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  )),
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL
    CHECK (length(storage_object_version) BETWEEN 1 AND 200),
  registrar_version text NOT NULL
    CHECK (registrar_version = 'paid-cost-evidence-registrar-v1'),
  registered_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

ALTER TABLE app_private.paid_cost_evidence_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.paid_cost_evidence_registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.paid_cost_evidence_registrations OWNER TO postgres;
REVOKE ALL ON TABLE app_private.paid_cost_evidence_registrations
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) RENAME TO register_paid_cost_evidence_verified_baseline_track6_registrar;
ALTER FUNCTION public.register_paid_cost_evidence_verified_baseline_track6_registrar(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) SET SCHEMA app_private;

CREATE FUNCTION public.register_paid_cost_evidence_verified(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_content_sha256 text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_path text := pg_catalog.btrim(p_storage_path);
  v_content_type text := pg_catalog.btrim(p_content_type);
  v_hash text := pg_catalog.btrim(p_content_sha256);
  v_object_version text := pg_catalog.btrim(p_storage_object_version);
  v_document public.documents%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_registration app_private.paid_cost_evidence_registrations%ROWTYPE;
  v_result jsonb;
  v_document_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'paid_cost_evidence_v1', p_organization_id, v_path
      ),
      0
    )
  );

  v_result := app_private.register_paid_cost_evidence_verified_baseline_track6_registrar(
    p_organization_id,
    p_actor_id,
    p_property_id,
    p_file_name,
    v_path,
    v_content_type,
    p_size_bytes,
    v_hash,
    p_storage_object_id,
    v_object_version,
    p_idempotency_key
  );
  v_document_id := (v_result->>'document_id')::uuid;

  SELECT document.*
  INTO STRICT v_document
  FROM public.documents AS document
  WHERE document.id = v_document_id
    AND document.organization_id = p_organization_id
  FOR KEY SHARE;

  SELECT object.*
  INTO STRICT v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_path
    AND object.id = p_storage_object_id
    AND object.version = v_object_version
  FOR KEY SHARE;

  IF v_document.property_id IS DISTINCT FROM p_property_id
    OR v_document.category IS DISTINCT FROM 'Paid cost evidence'
    OR v_document.storage_path IS DISTINCT FROM v_path
    OR v_document.mime_type IS DISTINCT FROM v_content_type
    OR v_document.size_bytes IS DISTINCT FROM p_size_bytes
    OR v_document.content_sha256 IS DISTINCT FROM v_hash
    OR v_document.uploaded_by IS DISTINCT FROM p_actor_id
    OR v_document.archived_at IS NOT NULL
    OR v_object.metadata->>'mimetype' IS DISTINCT FROM v_content_type
    OR (CASE
      WHEN coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (v_object.metadata->>'size')::bigint
      ELSE NULL
    END) IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'paid_cost_evidence_binding_mismatch'
      USING ERRCODE = '22000';
  END IF;

  SELECT registration.*
  INTO v_registration
  FROM app_private.paid_cost_evidence_registrations AS registration
  WHERE registration.document_id = v_document_id
    OR registration.storage_path = v_path
  FOR KEY SHARE;

  IF FOUND THEN
    IF v_registration.document_id IS DISTINCT FROM v_document_id
      OR v_registration.organization_id IS DISTINCT FROM p_organization_id
      OR v_registration.property_id IS DISTINCT FROM p_property_id
      OR v_registration.actor_id IS DISTINCT FROM p_actor_id
      OR v_registration.storage_path IS DISTINCT FROM v_path
      OR v_registration.content_sha256 IS DISTINCT FROM v_hash
      OR v_registration.size_bytes IS DISTINCT FROM p_size_bytes
      OR v_registration.mime_type IS DISTINCT FROM v_content_type
      OR v_registration.storage_object_id IS DISTINCT FROM p_storage_object_id
      OR v_registration.storage_object_version IS DISTINCT FROM v_object_version
      OR v_registration.registrar_version IS DISTINCT FROM
        'paid-cost-evidence-registrar-v1' THEN
      RAISE EXCEPTION 'paid_cost_evidence_binding_conflict'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO app_private.paid_cost_evidence_registrations (
      document_id,
      organization_id,
      property_id,
      actor_id,
      storage_path,
      content_sha256,
      size_bytes,
      mime_type,
      storage_object_id,
      storage_object_version,
      registrar_version
    ) VALUES (
      v_document_id,
      p_organization_id,
      p_property_id,
      p_actor_id,
      v_path,
      v_hash,
      p_size_bytes,
      v_content_type,
      p_storage_object_id,
      v_object_version,
      'paid-cost-evidence-registrar-v1'
    );
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) TO service_role;
REVOKE ALL ON FUNCTION
  app_private.register_paid_cost_evidence_verified_baseline_track6_registrar(
    uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
  ) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) RENAME TO create_document_baseline_track6_registrar;
ALTER FUNCTION public.create_document_baseline_track6_registrar(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) SET SCHEMA app_private;

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
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_category text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_category, '')));
  v_path text := pg_catalog.btrim(coalesce(p_storage_path, ''));
  v_action text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_activity_action, ''))
  );
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_category = 'paid cost evidence'
    OR v_path LIKE p_organization_id::text || '/paid-cost-evidence/%'
    OR v_action = 'paid_cost_evidence_registered' THEN
    RAISE EXCEPTION 'paid_cost_evidence_service_only'
      USING ERRCODE = '42501';
  END IF;

  RETURN app_private.create_document_baseline_track6_registrar(
    p_organization_id,
    p_category,
    p_file_name,
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_content_sha256,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_timeline_event_id,
    p_ledger_entry_id,
    p_task_id,
    p_tenant_request_id,
    p_activity_entity_type,
    p_activity_entity_id,
    p_activity_action,
    p_activity_new_values
  );
END;
$$;

ALTER FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_document(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.create_document_baseline_track6_registrar(
  uuid, text, text, text, text, bigint, text, uuid, uuid, uuid, uuid, uuid,
  uuid, uuid, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can upload Nestory documents"
  ON storage.objects;
CREATE POLICY "Admins can upload Nestory documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND name NOT LIKE app_private.storage_object_org_id(name)::text ||
    '/paid-cost-evidence/%'
);

DROP POLICY IF EXISTS "Admins can create activity logs"
  ON public.activity_logs;
CREATE POLICY "Admins can create activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.is_org_admin(organization_id)
  AND pg_catalog.lower(pg_catalog.btrim(action)) <>
    'paid_cost_evidence_registered'
);

CREATE OR REPLACE FUNCTION app_private.assert_paid_cost_evidence_eligible(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_submitting_actor_id uuid,
  p_submission_idempotency_key text,
  p_submission_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_registration app_private.paid_cost_evidence_registrations%ROWTYPE;
  v_key text := pg_catalog.btrim(
    coalesce(p_submission_idempotency_key, '')
  );
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_document_id IS NULL
    OR p_submitting_actor_id IS NULL
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'paid_cost_evidence_use_v1', p_organization_id, p_document_id
      ),
      0
    )
  );

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.organization_id = p_organization_id
    AND document.id = p_document_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_document.property_id IS DISTINCT FROM p_property_id
    OR v_document.category IS DISTINCT FROM 'Paid cost evidence'
    OR v_document.archived_at IS NOT NULL
    OR v_document.uploaded_by IS DISTINCT FROM p_submitting_actor_id
    OR v_document.storage_path NOT LIKE
      p_organization_id::text || '/paid-cost-evidence/%'
    OR app_private.storage_object_org_id(v_document.storage_path)
      IS DISTINCT FROM p_organization_id
    OR v_document.mime_type NOT IN (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
    )
    OR v_document.size_bytes NOT BETWEEN 1 AND 10485760
    OR v_document.content_sha256 IS NULL
    OR v_document.content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_document.storage_path
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_object.metadata->>'mimetype' IS DISTINCT FROM v_document.mime_type
    OR (CASE
      WHEN coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (v_object.metadata->>'size')::bigint
      ELSE NULL
    END) IS DISTINCT FROM v_document.size_bytes THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT registration.*
  INTO v_registration
  FROM app_private.paid_cost_evidence_registrations AS registration
  WHERE registration.document_id = p_document_id
    AND registration.organization_id = p_organization_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_registration.property_id IS DISTINCT FROM p_property_id
    OR v_registration.actor_id IS DISTINCT FROM p_submitting_actor_id
    OR v_registration.storage_path IS DISTINCT FROM v_document.storage_path
    OR v_registration.content_sha256 IS DISTINCT FROM
      v_document.content_sha256
    OR v_registration.size_bytes IS DISTINCT FROM v_document.size_bytes
    OR v_registration.mime_type IS DISTINCT FROM v_document.mime_type
    OR v_registration.storage_object_id IS DISTINCT FROM v_object.id
    OR v_registration.storage_object_version IS DISTINCT FROM v_object.version
    OR v_registration.registrar_version IS DISTINCT FROM
      'paid-cost-evidence-registrar-v1' THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.source_type = 'general'
      AND submission.supporting_document_id = p_document_id
      AND (
        p_submission_id IS NULL
        AND (
          submission.submitted_by IS DISTINCT FROM p_submitting_actor_id
          OR submission.idempotency_key IS DISTINCT FROM v_key
        )
        OR p_submission_id IS NOT NULL
        AND submission.id IS DISTINCT FROM p_submission_id
      )
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_already_used'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER FUNCTION app_private.assert_paid_cost_evidence_eligible(
  uuid, uuid, uuid, uuid, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_paid_cost_evidence_eligible(
  uuid, uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.paid_cost_evidence_registrations IS
  'Immutable service-registrar authority binding retained paid-cost bytes to one document and submitting actor.';
COMMENT ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) IS
  'Service-only registration of retained paid-cost evidence plus an exclusive immutable registrar binding.';
