CREATE OR REPLACE FUNCTION app_private.can_submit_paid_cost_as_actor(
  p_organization_id uuid,
  p_actor_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.role IN ('super_admin', 'finance_member')
      AND membership.branch_id IS NULL
      AND membership.person_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_paid_cost_evidence_object(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_storage_path text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_path text := pg_catalog.btrim(p_storage_path);
  v_object storage.objects%ROWTYPE;
  v_content_type text;
  v_size_bytes bigint;
BEGIN
  IF NOT app_private.can_submit_paid_cost_as_actor(
    p_organization_id,
    p_actor_id
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'paid_cost_property_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id
    OR v_path NOT LIKE p_organization_id::text || '/paid-cost-evidence/%' THEN
    RAISE EXCEPTION 'paid_cost_evidence_path_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_path;

  IF v_object.id IS NULL OR v_object.version IS NULL THEN
    RAISE EXCEPTION 'paid_cost_evidence_object_missing'
      USING ERRCODE = '23503';
  END IF;

  v_content_type := v_object.metadata->>'mimetype';
  v_size_bytes := (v_object.metadata->>'size')::bigint;
  IF v_content_type NOT IN (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) OR v_size_bytes NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'paid_cost_evidence_object_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'storage_object_id', v_object.id::text,
    'storage_object_version', v_object.version,
    'content_type', v_content_type,
    'metadata_size_bytes', v_size_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_paid_cost_evidence_verified(
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
  v_file_name text := pg_catalog.btrim(p_file_name);
  v_path text := pg_catalog.btrim(p_storage_path);
  v_content_type text := pg_catalog.btrim(p_content_type);
  v_hash text := pg_catalog.btrim(p_content_sha256);
  v_object_version text := pg_catalog.btrim(p_storage_object_version);
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_object storage.objects%ROWTYPE;
  v_existing public.documents%ROWTYPE;
  v_document_id uuid;
  v_result jsonb;
BEGIN
  IF NOT app_private.can_submit_paid_cost_as_actor(
    p_organization_id,
    p_actor_id
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'paid_cost_property_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF pg_catalog.length(v_file_name) NOT BETWEEN 1 AND 240
    OR v_content_type NOT IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
    OR p_size_bytes NOT BETWEEN 1 AND 10485760
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR p_storage_object_id IS NULL
    OR pg_catalog.length(v_object_version) NOT BETWEEN 1 AND 200
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160
    OR app_private.storage_object_org_id(v_path) IS DISTINCT FROM p_organization_id
    OR v_path NOT LIKE p_organization_id::text || '/paid-cost-evidence/%' THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'actor_id', p_actor_id::text,
    'property_id', p_property_id::text,
    'file_name', v_file_name,
    'storage_path', v_path,
    'content_type', v_content_type,
    'size_bytes', p_size_bytes,
    'content_sha256', v_hash,
    'storage_object_id', p_storage_object_id::text,
    'storage_object_version', v_object_version
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'register_paid_cost_evidence_verified',
    v_key,
    p_actor_id,
    v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'paid_cost_evidence_v1',
        p_organization_id,
        v_path
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'register_paid_cost_evidence_verified',
    v_key,
    p_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object(
      'status',
      'replayed'
    );
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_path
    AND object.id = p_storage_object_id
    AND object.version = v_object_version
  FOR KEY SHARE;

  IF v_object.id IS NULL THEN
    RAISE EXCEPTION 'paid_cost_evidence_object_changed'
      USING ERRCODE = '40001';
  END IF;
  IF v_object.metadata->>'mimetype' IS DISTINCT FROM v_content_type
    OR (v_object.metadata->>'size')::bigint IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'paid_cost_evidence_metadata_mismatch'
      USING ERRCODE = '22000';
  END IF;

  SELECT document.*
  INTO v_existing
  FROM public.documents AS document
  WHERE document.storage_path = v_path
  FOR KEY SHARE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.organization_id IS DISTINCT FROM p_organization_id
      OR v_existing.property_id IS DISTINCT FROM p_property_id
      OR v_existing.category IS DISTINCT FROM 'Paid cost evidence'
      OR v_existing.file_name IS DISTINCT FROM v_file_name
      OR v_existing.mime_type IS DISTINCT FROM v_content_type
      OR v_existing.size_bytes IS DISTINCT FROM p_size_bytes
      OR v_existing.content_sha256 IS DISTINCT FROM v_hash
      OR v_existing.uploaded_by IS DISTINCT FROM p_actor_id
      OR v_existing.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'paid_cost_evidence_conflict'
        USING ERRCODE = '23505';
    END IF;

    v_result := pg_catalog.jsonb_build_object(
      'status', 'existing',
      'document_id', v_existing.id::text,
      'storage_path', v_existing.storage_path,
      'content_sha256', v_existing.content_sha256,
      'size_bytes', v_existing.size_bytes
    );
    RETURN app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      p_actor_id,
      v_result
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'app.document_content_write_context',
    'checked-v1',
    true
  );
  INSERT INTO public.documents (
    organization_id,
    property_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    content_sha256,
    uploaded_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    'Paid cost evidence',
    v_file_name,
    v_path,
    v_content_type,
    p_size_bytes,
    v_hash,
    p_actor_id
  ) RETURNING id INTO v_document_id;
  PERFORM pg_catalog.set_config(
    'app.document_content_write_context',
    'off',
    true
  );

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    p_actor_id,
    'document',
    v_document_id,
    'paid_cost_evidence_registered',
    pg_catalog.jsonb_build_object(
      'property_id', p_property_id,
      'storage_path', v_path,
      'content_sha256', v_hash,
      'size_bytes', p_size_bytes,
      'content_type', v_content_type
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'status', 'registered',
    'document_id', v_document_id::text,
    'storage_path', v_path,
    'content_sha256', v_hash,
    'size_bytes', p_size_bytes
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    p_actor_id,
    v_result
  );
END;
$$;

ALTER FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) RENAME TO submit_expense_baseline;

ALTER FUNCTION public.submit_expense_baseline(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) SET SCHEMA app_private;

CREATE FUNCTION public.submit_expense(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_customer_category text,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_currency public.currency_code,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_reconciliation_source_id uuid,
  p_supporting_document_id uuid,
  p_vendor_person_id uuid,
  p_reference text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_submit_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_type, 'general'))) =
    'general' THEN
    IF p_supporting_document_id IS NULL THEN
      RAISE EXCEPTION 'Paid cost evidence document is required'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN app_private.submit_expense_baseline(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_source_type,
    p_source_id,
    p_customer_category,
    p_vendor_label,
    p_expense_date,
    p_internal_cost_amount,
    p_internal_markup_amount,
    p_currency,
    p_responsibility,
    p_tenant_invoice_id,
    p_reconciliation_source_id,
    p_supporting_document_id,
    p_vendor_person_id,
    p_reference,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_expense_evidence_object_locked(
  p_storage_path text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.storage_path = p_storage_path
      AND app_private.storage_object_org_id(document.storage_path) =
        document.organization_id
      AND (
        document.category = 'Paid cost evidence'
        OR EXISTS (
          SELECT 1
          FROM public.expense_submissions AS submission
          WHERE submission.supporting_document_id = document.id
        )
      )
  );
$$;

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
  AND NOT app_private.is_expense_evidence_object_locked(name)
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
  AND NOT app_private.is_expense_evidence_object_locked(name)
)
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND name NOT LIKE app_private.storage_object_org_id(name)::text ||
    '/paid-cost-evidence/%'
  AND NOT app_private.is_expense_evidence_object_locked(name)
);

ALTER FUNCTION app_private.can_submit_paid_cost_as_actor(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.get_paid_cost_evidence_object(uuid, uuid, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION app_private.submit_expense_baseline(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION app_private.is_expense_evidence_object_locked(text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.can_submit_paid_cost_as_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.submit_expense_baseline(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) TO authenticated;

COMMENT ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text
) IS 'Service-only lookup of one scoped immutable paid-cost evidence object.';
COMMENT ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text
) IS 'Service-only registration of retained paid-cost evidence verified by the server.';
COMMENT ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) IS 'Finance Member or Super Admin submits an already-paid cost with immutable evidence and no financial effect before review.';
