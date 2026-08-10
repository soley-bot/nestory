-- Track 4B: immutable numbered Owner Statement publication and retained
-- byte-verified artifact authority. Accounting inputs remain Track 4A frozen
-- close revisions, lines, and source links only.

CREATE TABLE public.owner_statement_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_close_revision_id uuid NOT NULL,
  statement_number text NOT NULL,
  content_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  generated_by uuid NOT NULL,
  supersedes_publication_id uuid,
  CONSTRAINT owner_statement_publications_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_statement_publications_revision_unique
    UNIQUE (owner_close_revision_id),
  CONSTRAINT owner_statement_publications_number_unique
    UNIQUE (organization_id, statement_number),
  CONSTRAINT owner_statement_publications_supersedes_unique
    UNIQUE (supersedes_publication_id),
  CONSTRAINT owner_statement_publications_revision_fk
    FOREIGN KEY (organization_id, owner_close_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_statement_publications_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_publication_id)
    REFERENCES public.owner_statement_publications (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_statement_publications_actor_fk
    FOREIGN KEY (generated_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_statement_publications_number_check CHECK (
    statement_number ~ '^OS-[0-9]{6}-[0-9A-F]{12}$'
  ),
  CONSTRAINT owner_statement_publications_hash_check CHECK (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_statement_publications_not_self_superseding CHECK (
    supersedes_publication_id IS NULL OR supersedes_publication_id <> id
  )
);

CREATE TABLE public.owner_statement_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  format text NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_statement_artifacts_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_statement_artifacts_publication_format_unique
    UNIQUE (publication_id, format),
  CONSTRAINT owner_statement_artifacts_storage_path_unique
    UNIQUE (storage_path),
  CONSTRAINT owner_statement_artifacts_publication_fk
    FOREIGN KEY (organization_id, publication_id)
    REFERENCES public.owner_statement_publications (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_statement_artifacts_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_statement_artifacts_format_check CHECK (
    format IN ('pdf', 'xlsx')
  ),
  CONSTRAINT owner_statement_artifacts_path_check CHECK (
    pg_catalog.length(storage_path) BETWEEN 20 AND 300
    AND storage_path = pg_catalog.btrim(storage_path)
  ),
  CONSTRAINT owner_statement_artifacts_hash_check CHECK (
    sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_statement_artifacts_size_check CHECK (size_bytes > 0)
);

CREATE INDEX owner_statement_publications_revision_idx
  ON public.owner_statement_publications (
    organization_id, owner_close_revision_id
  );
CREATE INDEX owner_statement_artifacts_publication_idx
  ON public.owner_statement_artifacts (
    organization_id, publication_id, format
  );

CREATE OR REPLACE FUNCTION app_private.guard_owner_statement_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting(
      'app.owner_statement_write_context', true
    ) IS DISTINCT FROM 'checked-owner-statement-v1' THEN
    RAISE EXCEPTION 'owner statement writes require a checked path'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'owner statement authority is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'owner_statement_publications'
      OR OLD.content_hash <> pg_catalog.repeat('0', 64)
      OR NEW.content_hash = pg_catalog.repeat('0', 64)
      OR (pg_catalog.to_jsonb(NEW) - 'content_hash')
        IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'content_hash') THEN
      RAISE EXCEPTION 'owner statement authority is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_statement_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_statement_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_statement_publications_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_statement_publications
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_statement_write();
CREATE TRIGGER guard_owner_statement_artifacts_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_statement_artifacts
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_statement_write();

ALTER TABLE public.owner_statement_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_statement_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_statement_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_statement_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read owner statement publications"
  ON public.owner_statement_publications
  FOR SELECT TO authenticated
  USING ((SELECT app_private.can_read_finance(organization_id)));
CREATE POLICY "Finance roles can read owner statement artifacts"
  ON public.owner_statement_artifacts
  FOR SELECT TO authenticated
  USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.owner_statement_publications
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.owner_statement_artifacts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_statement_publications TO authenticated;
GRANT SELECT ON TABLE public.owner_statement_artifacts TO authenticated;

CREATE OR REPLACE FUNCTION app_private.owner_statement_storage_path(
  p_organization_id uuid,
  p_publication_id uuid,
  p_statement_number text,
  p_format text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT p_organization_id::text || '/' || p_publication_id::text || '/' ||
    p_format || '/owner-statement-' || p_statement_number || '.' || p_format;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_statement_canonical_payload(
  p_organization_id uuid,
  p_publication_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'publication_id', publication.id::text,
    'organization_id', publication.organization_id::text,
    'owner_close_revision_id', revision.id::text,
    'statement_number', publication.statement_number,
    'generated_at', pg_catalog.to_char(
      publication.generated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'generated_by', publication.generated_by::text,
    'supersedes_publication_id', publication.supersedes_publication_id::text,
    'property_id', revision.property_id::text,
    'owner_person_id', revision.owner_person_id::text,
    'currency', revision.currency::text,
    'month_start', revision.month_start::text,
    'revision_number', revision.revision_number,
    'supersedes_revision_id', revision.supersedes_revision_id::text,
    'input_hash', revision.input_hash,
    'close_content_hash', revision.content_hash,
    'closed_at', pg_catalog.to_char(
      revision.closed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'closed_by', revision.closed_by::text,
    'close_reason', revision.close_reason,
    'components', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'component', component_value.component::text,
          'opening_amount', pg_catalog.to_char(
            component_value.opening_amount, 'FM999999999990.00'
          ),
          'movement_amount', pg_catalog.to_char(
            component_value.movement_amount, 'FM999999999990.00'
          ),
          'closing_amount', pg_catalog.to_char(
            component_value.closing_amount, 'FM999999999990.00'
          )
        ) ORDER BY app_private.owner_close_component_rank(
          component_value.component
        )
      )
      FROM (
        SELECT component.component,
          COALESCE(pg_catalog.sum(line.signed_amount)
            FILTER (WHERE line.line_kind = 'opening'), 0) AS opening_amount,
          COALESCE(pg_catalog.sum(line.signed_amount)
            FILTER (WHERE line.line_kind = 'movement'), 0) AS movement_amount,
          COALESCE(pg_catalog.sum(line.signed_amount)
            FILTER (WHERE line.line_kind = 'closing'), 0) AS closing_amount
        FROM (
          SELECT pg_catalog.unnest(
            enum_range(NULL::public.owner_balance_component)
          ) AS component
        ) AS component
        LEFT JOIN public.owner_close_lines AS line
          ON line.organization_id = p_organization_id
         AND line.owner_close_revision_id = revision.id
         AND line.component = component.component
        GROUP BY component.component
      ) AS component_value
    ), '[]'::jsonb),
    'lines', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', line.id::text,
          'line_number', line.line_number,
          'line_kind', line.line_kind,
          'component', line.component::text,
          'description', line.description,
          'business_date', line.business_date::text,
          'signed_amount', pg_catalog.to_char(
            line.signed_amount, 'FM999999999990.00'
          ),
          'source_count', line.source_count,
          'sources', COALESCE((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', source.id::text,
                'source_type', source.source_type,
                'source_id', source.source_id::text,
                'source_line_id', source.source_line_id::text,
                'source_fingerprint', source.source_fingerprint
              ) ORDER BY source.source_type, source.source_line_id, source.id
            )
            FROM public.owner_close_line_sources AS source
            WHERE source.organization_id = p_organization_id
              AND source.owner_close_revision_id = revision.id
              AND source.close_line_id = line.id
          ), '[]'::jsonb)
        ) ORDER BY line.line_number
      )
      FROM public.owner_close_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.owner_close_revision_id = revision.id
    ), '[]'::jsonb),
    'revision_history', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'owner_close_revision_id', history.id::text,
          'revision_number', history.revision_number,
          'supersedes_revision_id', history.supersedes_revision_id::text,
          'close_content_hash', history.content_hash
        ) ORDER BY history.revision_number
      )
      FROM public.owner_close_revisions AS history
      WHERE history.organization_id = p_organization_id
        AND history.owner_close_series_id = revision.owner_close_series_id
        AND history.status = 'closed'
        AND history.revision_number <= revision.revision_number
    ), '[]'::jsonb)
  )
  FROM public.owner_statement_publications AS publication
  JOIN public.owner_close_revisions AS revision
    ON revision.organization_id = publication.organization_id
   AND revision.id = publication.owner_close_revision_id
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_statement_readiness(
  p_organization_id uuid,
  p_owner_close_revision_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_revision public.owner_close_revisions%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_publication public.owner_statement_publications%ROWTYPE;
  v_blockers jsonb := '[]'::jsonb;
  v_artifact_count integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_owner_balance_authority(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_readiness_forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT revision.* INTO v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id;
  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_revision_not_found'
      USING ERRCODE = '23503';
  END IF;

  SELECT series.* INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id;
  SELECT publication.* INTO v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.owner_close_revision_id = v_revision.id;

  IF v_revision.status <> 'closed' THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'owner_statement_revision_not_closed')
    );
  END IF;
  IF v_series.state <> 'closed'
    OR v_series.current_closed_revision_id IS DISTINCT FROM v_revision.id THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'owner_statement_revision_not_current')
    );
  END IF;
  IF v_publication.id IS NOT NULL THEN
    SELECT pg_catalog.count(*) INTO v_artifact_count
    FROM public.owner_statement_artifacts AS artifact
    WHERE artifact.organization_id = p_organization_id
      AND artifact.publication_id = v_publication.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'revision_id', v_revision.id::text,
    'is_ready', pg_catalog.jsonb_array_length(v_blockers) = 0
      AND v_publication.id IS NULL,
    'blockers', v_blockers,
    'existing_publication_id', v_publication.id::text,
    'artifact_count', v_artifact_count,
    'artifacts_complete', v_artifact_count = 2
  );
END;
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

  SELECT publication.id INTO v_supersedes_publication_id
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.owner_close_revision_id = v_revision.supersedes_revision_id;

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

CREATE OR REPLACE FUNCTION public.register_owner_statement_artifact(
  p_organization_id uuid,
  p_publication_id uuid,
  p_format text,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_format text := pg_catalog.lower(pg_catalog.btrim(p_format));
  v_path text := pg_catalog.btrim(p_storage_path);
  v_hash text := pg_catalog.btrim(p_sha256);
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_publication public.owner_statement_publications%ROWTYPE;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_artifact_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_publish_owner_statement(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_artifact_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF v_format NOT IN ('pdf', 'xlsx')
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR p_size_bytes IS NULL OR p_size_bytes <= 0
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_statement_artifact_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'publication_id', p_publication_id::text,
    'format', v_format,
    'storage_path', v_path,
    'sha256', v_hash,
    'size_bytes', p_size_bytes
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'register_owner_statement_artifact', v_key,
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
    p_organization_id, 'register_owner_statement_artifact', v_key,
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

  IF v_path IS DISTINCT FROM app_private.owner_statement_storage_path(
    p_organization_id, v_publication.id, v_publication.statement_number, v_format
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_path_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS object
    WHERE object.bucket_id = 'owner-statements'
      AND object.name = v_path
  ) THEN
    RAISE EXCEPTION 'owner_statement_artifact_object_missing'
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_statement_write_context', 'checked-owner-statement-v1', true
  );
  INSERT INTO public.owner_statement_artifacts (
    organization_id, publication_id, format, storage_path, sha256,
    size_bytes, created_by
  ) VALUES (
    p_organization_id, v_publication.id, v_format, v_path, v_hash,
    p_size_bytes, v_actor_id
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
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_statement_publication(
  p_organization_id uuid,
  p_publication_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_publication public.owner_statement_publications%ROWTYPE;
  v_payload jsonb;
  v_recomputed_hash text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_owner_balance_authority(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_publication_forbidden'
      USING ERRCODE = '42501';
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = p_publication_id;
  IF v_publication.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_publication_not_found'
      USING ERRCODE = '23503';
  END IF;

  v_payload := app_private.owner_statement_canonical_payload(
    p_organization_id, p_publication_id
  );
  v_recomputed_hash := pg_catalog.encode(
    extensions.digest(v_payload::text, 'sha256'), 'hex'
  );
  IF v_recomputed_hash IS DISTINCT FROM v_publication.content_hash THEN
    RAISE EXCEPTION 'owner_statement_content_hash_mismatch'
      USING ERRCODE = '22000';
  END IF;

  RETURN v_payload || pg_catalog.jsonb_build_object(
    'content_hash', v_publication.content_hash,
    'artifacts', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', artifact.id::text,
          'format', artifact.format,
          'storage_path', artifact.storage_path,
          'sha256', artifact.sha256,
          'size_bytes', artifact.size_bytes,
          'created_at', pg_catalog.to_char(
            artifact.created_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          'created_by', artifact.created_by::text
        ) ORDER BY artifact.format
      )
      FROM public.owner_statement_artifacts AS artifact
      WHERE artifact.organization_id = p_organization_id
        AND artifact.publication_id = p_publication_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_statement_artifact_download(
  p_organization_id uuid,
  p_artifact_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_artifact public.owner_statement_artifacts%ROWTYPE;
  v_publication public.owner_statement_publications%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_owner_balance_authority(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_download_forbidden'
      USING ERRCODE = '42501';
  END IF;
  SELECT artifact.* INTO v_artifact
  FROM public.owner_statement_artifacts AS artifact
  WHERE artifact.organization_id = p_organization_id
    AND artifact.id = p_artifact_id;
  IF v_artifact.id IS NULL THEN
    RAISE EXCEPTION 'owner_statement_artifact_not_found'
      USING ERRCODE = '23503';
  END IF;
  SELECT publication.* INTO STRICT v_publication
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = p_organization_id
    AND publication.id = v_artifact.publication_id;

  RETURN pg_catalog.jsonb_build_object(
    'artifact_id', v_artifact.id::text,
    'publication_id', v_artifact.publication_id::text,
    'statement_number', v_publication.statement_number,
    'format', v_artifact.format,
    'storage_path', v_artifact.storage_path,
    'sha256', v_artifact.sha256,
    'size_bytes', v_artifact.size_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_statement_publications_for_series(
  p_organization_id uuid,
  p_owner_close_series_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_owner_balance_authority(p_organization_id) THEN
    RAISE EXCEPTION 'owner_statement_publication_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.owner_close_series AS series
    WHERE series.organization_id = p_organization_id
      AND series.id = p_owner_close_series_id
  ) THEN
    RAISE EXCEPTION 'owner_close_series_not_found'
      USING ERRCODE = '23503';
  END IF;

  RETURN COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', publication.id::text,
        'owner_close_revision_id', publication.owner_close_revision_id::text,
        'revision_number', revision.revision_number,
        'statement_number', publication.statement_number,
        'content_hash', publication.content_hash,
        'generated_at', pg_catalog.to_char(
          publication.generated_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'supersedes_publication_id', publication.supersedes_publication_id::text,
        'superseded_by_publication_id', successor.id::text,
        'artifacts', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', artifact.id::text,
              'format', artifact.format
            ) ORDER BY artifact.format
          )
          FROM public.owner_statement_artifacts AS artifact
          WHERE artifact.organization_id = p_organization_id
            AND artifact.publication_id = publication.id
        ), '[]'::jsonb)
      ) ORDER BY revision.revision_number DESC
    )
    FROM public.owner_statement_publications AS publication
    JOIN public.owner_close_revisions AS revision
      ON revision.organization_id = publication.organization_id
     AND revision.id = publication.owner_close_revision_id
    LEFT JOIN public.owner_statement_publications AS successor
      ON successor.organization_id = publication.organization_id
     AND successor.supersedes_publication_id = publication.id
    WHERE publication.organization_id = p_organization_id
      AND revision.owner_close_series_id = p_owner_close_series_id
  ), '[]'::jsonb);
END;
$$;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'owner-statements', 'owner-statements', false, 10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION app_private.is_owner_statement_artifact_registered(
  p_storage_path text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_statement_artifacts AS artifact
    WHERE artifact.storage_path = p_storage_path
  );
$$;

ALTER FUNCTION app_private.owner_statement_storage_path(
  uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION app_private.owner_statement_canonical_payload(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION app_private.is_owner_statement_artifact_registered(text)
  OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.publish_owner_statement(uuid, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.register_owner_statement_artifact(
  uuid, uuid, text, text, text, bigint, text
) OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_publication(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_artifact_download(uuid, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_publications_for_series(uuid, uuid)
  OWNER TO postgres;
ALTER TABLE public.owner_statement_publications OWNER TO postgres;
ALTER TABLE public.owner_statement_artifacts OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.owner_statement_storage_path(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.owner_statement_canonical_payload(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.is_owner_statement_artifact_registered(text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.publish_owner_statement(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.register_owner_statement_artifact(
  uuid, uuid, text, text, text, bigint, text
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_publication(uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_artifact_download(uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_publications_for_series(uuid, uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_owner_statement(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_owner_statement_artifact(
  uuid, uuid, text, text, text, bigint, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_publication(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_artifact_download(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_publications_for_series(uuid, uuid)
  TO authenticated;

CREATE POLICY "Finance roles can read retained owner statements"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'owner-statements'
    AND app_private.can_read_finance(
      app_private.storage_object_org_id(name)
    )
  );
CREATE POLICY "Super Admin can create owner statement artifacts"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'owner-statements'
    AND app_private.is_org_admin(
      app_private.storage_object_org_id(name)
    )
  );
CREATE POLICY "Super Admin can remove unregistered owner statement artifacts"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'owner-statements'
    AND app_private.is_org_admin(
      app_private.storage_object_org_id(name)
    )
    AND NOT app_private.is_owner_statement_artifact_registered(name)
  );
