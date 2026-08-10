-- Track 4B correction: server-verified retained bytes, resumable partial
-- publication, nearest-retained supersession, and collision-safe registration.

ALTER TABLE public.owner_statement_artifacts
  ADD COLUMN storage_object_id uuid NOT NULL,
  ADD COLUMN storage_object_version text NOT NULL,
  ADD COLUMN content_type text NOT NULL;

ALTER TABLE public.owner_statement_artifacts
  ADD CONSTRAINT owner_statement_artifacts_storage_object_unique
    UNIQUE (storage_object_id),
  ADD CONSTRAINT owner_statement_artifacts_object_version_check CHECK (
    pg_catalog.length(storage_object_version) BETWEEN 1 AND 200
    AND storage_object_version = pg_catalog.btrim(storage_object_version)
  ),
  ADD CONSTRAINT owner_statement_artifacts_content_type_check CHECK (
    (format = 'pdf' AND content_type = 'application/pdf')
    OR (
      format = 'xlsx'
      AND content_type =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  );

CREATE OR REPLACE FUNCTION app_private.can_publish_owner_statement_as_actor(
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
      AND membership.role = 'super_admin'
      AND membership.branch_id IS NULL
      AND membership.person_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_owner_statement(
  p_organization_id uuid,
  p_owner_close_revision_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_publication_id uuid := gen_random_uuid();
  v_statement_number text;
  v_supersedes_publication_id uuid;
  v_canonical jsonb;
  v_content_hash text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_publish_owner_statement(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_publish_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF p_owner_close_revision_id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_revision_required'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_statement_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'owner_close_revision_id', p_owner_close_revision_id::text
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'publish_owner_statement', v_key,
    v_actor_id, v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT revision.* INTO v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id;
  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_revision_not_found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'publish_owner_statement', v_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT revision.* INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id
  FOR KEY SHARE;
  SELECT series.* INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id
  FOR UPDATE;

  IF v_revision.status <> 'closed' THEN
    RAISE EXCEPTION 'owner_statement_revision_not_closed'
      USING ERRCODE = '23514';
  END IF;
  IF v_series.state <> 'closed'
    OR v_series.current_closed_revision_id IS DISTINCT FROM v_revision.id THEN
    RAISE EXCEPTION 'owner_statement_revision_not_current'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.owner_statement_publications AS publication
    WHERE publication.owner_close_revision_id = v_revision.id
  ) THEN
    RAISE EXCEPTION 'owner_statement_revision_already_published'
      USING ERRCODE = '23505';
  END IF;

  SELECT prior_publication.id INTO v_supersedes_publication_id
  FROM public.owner_statement_publications AS prior_publication
  JOIN public.owner_close_revisions AS prior_revision
    ON prior_revision.organization_id = prior_publication.organization_id
   AND prior_revision.id = prior_publication.owner_close_revision_id
  WHERE prior_publication.organization_id = p_organization_id
    AND prior_revision.owner_close_series_id = v_revision.owner_close_series_id
    AND prior_revision.revision_number < v_revision.revision_number
  ORDER BY prior_revision.revision_number DESC
  LIMIT 1;

  v_statement_number := 'OS-' ||
    pg_catalog.to_char(v_revision.month_start, 'YYYYMM') || '-' ||
    pg_catalog.upper(pg_catalog.left(
      pg_catalog.replace(v_publication_id::text, '-', ''), 12
    ));
  PERFORM pg_catalog.set_config(
    'app.owner_statement_write_context', 'checked-owner-statement-v1', true
  );
  INSERT INTO public.owner_statement_publications (
    id, organization_id, owner_close_revision_id, statement_number,
    content_hash, generated_by, supersedes_publication_id
  ) VALUES (
    v_publication_id, p_organization_id, v_revision.id, v_statement_number,
    pg_catalog.repeat('0', 64), v_actor_id, v_supersedes_publication_id
  );

  v_canonical := app_private.owner_statement_canonical_payload(
    p_organization_id, v_publication_id
  );
  v_content_hash := pg_catalog.encode(
    extensions.digest(v_canonical::text, 'sha256'), 'hex'
  );
  UPDATE public.owner_statement_publications AS publication
  SET content_hash = v_content_hash
  WHERE publication.organization_id = p_organization_id
    AND publication.id = v_publication_id;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'published',
    'publication_id', v_publication_id::text,
    'statement_number', v_statement_number,
    'content_hash', v_content_hash,
    'supersedes_publication_id', v_supersedes_publication_id::text
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_owner_statement_publication(
  p_organization_id uuid,
  p_publication_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_publication public.owner_statement_publications%ROWTYPE;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_artifact_count integer;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_publish_owner_statement(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_resume_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF p_publication_id IS NULL
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_statement_resume_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'publication_id', p_publication_id::text
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'resume_owner_statement_publication', v_key,
    v_actor_id, v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT publication.* INTO v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id;
  IF v_publication.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_publication_not_found'
      USING ERRCODE = '23503';
  END IF;
  SELECT revision.* INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_publication.owner_close_revision_id;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'resume_owner_statement_publication', v_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT publication.* INTO STRICT v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id
  FOR KEY SHARE;
  SELECT revision.* INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_publication.owner_close_revision_id
  FOR KEY SHARE;
  SELECT series.* INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id
  FOR UPDATE;
  IF v_revision.status <> 'closed'
    OR v_series.state <> 'closed'
    OR v_series.current_closed_revision_id IS DISTINCT FROM v_revision.id THEN
    RAISE EXCEPTION 'owner_statement_resume_not_current'
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*)::integer INTO v_artifact_count
  FROM public.owner_statement_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.publication_id = v_publication.id;

  v_result := pg_catalog.jsonb_build_object(
    'status', CASE WHEN v_artifact_count = 2 THEN 'complete' ELSE 'resumable' END,
    'publication_id', v_publication.id::text,
    'statement_number', v_publication.statement_number,
    'content_hash', v_publication.content_hash,
    'artifact_count', v_artifact_count
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_statement_artifact_object(
  p_organization_id uuid,
  p_publication_id uuid,
  p_actor_id uuid,
  p_format text,
  p_storage_path text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_publication public.owner_statement_publications%ROWTYPE;
  v_format text := pg_catalog.lower(pg_catalog.btrim(p_format));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_expected_content_type text;
  v_object storage.objects%ROWTYPE;
BEGIN
  IF NOT app_private.can_publish_owner_statement_as_actor(
    p_organization_id, p_actor_id
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_forbidden'
      USING ERRCODE = '42501';
  END IF;
  v_expected_content_type := CASE v_format
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'xlsx' THEN
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ELSE NULL
  END;
  IF v_expected_content_type IS NULL THEN
    RAISE EXCEPTION 'owner_statement_artifact_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT publication.* INTO v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id;
  IF v_publication.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_publication_not_found'
      USING ERRCODE = '23503';
  END IF;
  IF v_path IS DISTINCT FROM app_private.owner_statement_storage_path(
    p_organization_id, v_publication.id, v_publication.statement_number, v_format
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_path_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT object.* INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'owner-statements'
    AND object.name = v_path;
  IF v_object.id IS NULL OR v_object.version IS NULL THEN
    RAISE EXCEPTION 'owner_statement_artifact_object_missing'
      USING ERRCODE = '23503';
  END IF;
  IF v_object.metadata->>'mimetype' IS DISTINCT FROM v_expected_content_type THEN
    RAISE EXCEPTION 'owner_statement_artifact_content_type_mismatch'
      USING ERRCODE = '22000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'storage_object_id', v_object.id::text,
    'storage_object_version', v_object.version,
    'content_type', v_expected_content_type,
    'metadata_size_bytes', (v_object.metadata->>'size')::bigint
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_owner_statement_artifact_verified(
  p_organization_id uuid,
  p_publication_id uuid,
  p_actor_id uuid,
  p_format text,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_content_type text,
  p_sha256 text,
  p_size_bytes bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_format text := pg_catalog.lower(pg_catalog.btrim(p_format));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_object_version text := pg_catalog.btrim(p_storage_object_version);
  v_content_type text := pg_catalog.btrim(p_content_type);
  v_hash text := pg_catalog.btrim(p_sha256);
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_expected_content_type text;
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_publication public.owner_statement_publications%ROWTYPE;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_existing public.owner_statement_artifacts%ROWTYPE;
  v_artifact_id uuid;
  v_result jsonb;
BEGIN
  IF NOT app_private.can_publish_owner_statement_as_actor(
    p_organization_id, p_actor_id
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_forbidden'
      USING ERRCODE = '42501';
  END IF;
  v_expected_content_type := CASE v_format
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'xlsx' THEN
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ELSE NULL
  END;
  IF v_expected_content_type IS NULL
    OR v_content_type IS DISTINCT FROM v_expected_content_type
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR p_size_bytes IS NULL OR p_size_bytes <= 0
    OR p_storage_object_id IS NULL
    OR pg_catalog.length(v_object_version) NOT BETWEEN 1 AND 200
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_statement_artifact_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'publication_id', p_publication_id::text,
    'actor_id', p_actor_id::text,
    'format', v_format,
    'storage_path', v_path,
    'storage_object_id', p_storage_object_id::text,
    'storage_object_version', v_object_version,
    'content_type', v_content_type,
    'sha256', v_hash,
    'size_bytes', p_size_bytes
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'register_owner_statement_artifact_verified', v_key,
    p_actor_id, v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT publication.* INTO v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id;
  IF v_publication.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_publication_not_found'
      USING ERRCODE = '23503';
  END IF;
  SELECT revision.* INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_publication.owner_close_revision_id;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_revision.property_id, v_revision.owner_person_id,
    v_revision.currency, v_revision.month_start
  );
  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'register_owner_statement_artifact_verified', v_key,
    p_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT publication.* INTO STRICT v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id
  FOR KEY SHARE;
  IF v_path IS DISTINCT FROM app_private.owner_statement_storage_path(
    p_organization_id, v_publication.id, v_publication.statement_number, v_format
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_path_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT object.* INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'owner-statements'
    AND object.name = v_path
    AND object.id = p_storage_object_id
    AND object.version = v_object_version
  FOR KEY SHARE;
  IF v_object.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_artifact_object_changed'
      USING ERRCODE = '40001';
  END IF;
  IF v_object.metadata->>'mimetype' IS DISTINCT FROM v_expected_content_type
    OR (v_object.metadata->>'size')::bigint IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'owner_statement_artifact_metadata_mismatch'
      USING ERRCODE = '22000';
  END IF;

  SELECT artifact.* INTO v_existing
  FROM public.owner_statement_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.publication_id = v_publication.id
    AND artifact.format = v_format
  FOR KEY SHARE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.storage_path IS DISTINCT FROM v_path
      OR v_existing.storage_object_id IS DISTINCT FROM p_storage_object_id
      OR v_existing.storage_object_version IS DISTINCT FROM v_object_version
      OR v_existing.content_type IS DISTINCT FROM v_content_type
      OR v_existing.sha256 IS DISTINCT FROM v_hash
      OR v_existing.size_bytes IS DISTINCT FROM p_size_bytes THEN
      RAISE EXCEPTION 'owner_statement_artifact_conflict'
        USING ERRCODE = '23505';
    END IF;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'existing',
      'artifact_id', v_existing.id::text,
      'publication_id', v_existing.publication_id::text,
      'format', v_existing.format,
      'storage_path', v_existing.storage_path,
      'sha256', v_existing.sha256,
      'size_bytes', v_existing.size_bytes
    );
    RETURN app_private.complete_financial_idempotency(
      v_claim.request_id, p_organization_id, p_actor_id, v_result
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_statement_write_context', 'checked-owner-statement-v1', true
  );
  INSERT INTO public.owner_statement_artifacts (
    organization_id, publication_id, format, storage_path, sha256,
    size_bytes, created_by, storage_object_id, storage_object_version,
    content_type
  ) VALUES (
    p_organization_id, v_publication.id, v_format, v_path, v_hash,
    p_size_bytes, p_actor_id, p_storage_object_id, v_object_version,
    v_content_type
  ) RETURNING id INTO v_artifact_id;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'registered',
    'artifact_id', v_artifact_id::text,
    'publication_id', v_publication.id::text,
    'format', v_format,
    'storage_path', v_path,
    'sha256', v_hash,
    'size_bytes', p_size_bytes
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, p_actor_id, v_result
  );
END;
$$;

ALTER FUNCTION app_private.can_publish_owner_statement_as_actor(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.publish_owner_statement(uuid, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.resume_owner_statement_publication(uuid, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_artifact_object(
  uuid, uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION public.register_owner_statement_artifact_verified(
  uuid, uuid, uuid, text, text, uuid, text, text, text, bigint, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.can_publish_owner_statement_as_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_owner_statement_artifact(
  uuid, uuid, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_owner_statement_publication(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_artifact_object(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_owner_statement_artifact_verified(
  uuid, uuid, uuid, text, text, uuid, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resume_owner_statement_publication(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_artifact_object(
  uuid, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_owner_statement_artifact_verified(
  uuid, uuid, uuid, text, text, uuid, text, text, text, bigint, text
) TO service_role;
