ALTER TABLE public.import_runs
  ADD COLUMN source_claim_hash text,
  ADD COLUMN snapshot_hash text,
  ADD CONSTRAINT import_runs_claim_snapshot_hash_pair_check
  CHECK (
    (
      source_claim_hash IS NULL
      AND snapshot_hash IS NULL
    )
    OR (
      source_claim_hash IS NOT NULL
      AND snapshot_hash IS NOT NULL
      AND
      source_claim_hash ~ '^[0-9a-f]{64}$'
      AND snapshot_hash ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX import_runs_org_source_claim_hash_unique
  ON public.import_runs(organization_id, source_claim_hash)
  WHERE source_claim_hash IS NOT NULL;

COMMENT ON COLUMN public.import_runs.source_claim_hash IS
  'Database-computed SHA-256 claim over organization, import contract, headers, mapping, and ordered raw rows.';

COMMENT ON COLUMN public.import_runs.snapshot_hash IS
  'Database-computed SHA-256 over the exact canonical staged semantic rows inserted for this claim.';

CREATE OR REPLACE FUNCTION app_private.guard_atomic_import_run_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actual_created integer;
  v_actual_failed integer;
  v_actual_skipped integer;
  v_actual_updated integer;
  v_context jsonb;
  v_context_matches boolean := false;
  v_operation text;
  v_row public.import_runs%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.source_claim_hash IS DISTINCT FROM OLD.source_claim_hash
      OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
    ) THEN
    RAISE EXCEPTION 'Atomic import identity is immutable after insert'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_hash_immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF v_row.source_claim_hash IS NULL AND v_row.snapshot_hash IS NULL THEN
    RETURN v_row;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin') THEN
    BEGIN
      v_context := nullif(
        current_setting('app.atomic_import_write_context', true),
        ''
      )::jsonb;
      v_operation := v_context ->> 'operation';
      v_context_matches :=
        v_operation IN ('stage-v1', 'commit-v1')
        AND v_context ->> 'organizationId' = v_row.organization_id::text
        AND v_context ->> 'sourceClaimHash' = v_row.source_claim_hash
        AND v_context ->> 'runId' = v_row.id::text;
    EXCEPTION WHEN OTHERS THEN
      v_context_matches := false;
    END;
  END IF;

  IF NOT v_context_matches THEN
    RAISE EXCEPTION 'Atomic import runs can only be written by their checked RPC'
      USING
        ERRCODE = '42501',
        DETAIL = 'import_atomic_run_rpc_required';
  END IF;

  IF v_operation = 'stage-v1' THEN
    IF TG_OP = 'INSERT'
      AND NEW.status = 'staged'
      AND NEW.created_count = 0
      AND NEW.updated_count = 0
      AND NEW.failed_count = 0
      AND NEW.skipped_count = 0
      AND NEW.error_message IS NULL
      AND NEW.committed_at IS NULL
      AND NEW.created_by IS NOT DISTINCT FROM (SELECT auth.uid())
      AND NEW.updated_by IS NOT DISTINCT FROM (SELECT auth.uid()) THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE'
      AND OLD.status = 'staged'
      AND OLD.created_count = 0
      AND OLD.updated_count = 0
      AND OLD.failed_count = 0
      AND OLD.skipped_count = 0
      AND OLD.error_message IS NULL
      AND OLD.committed_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.import_rows AS rows
        WHERE rows.import_run_id = OLD.id
          AND rows.organization_id = OLD.organization_id
          AND (
            rows.row_status NOT IN ('ready', 'warning', 'error')
            OR rows.result_action IS NOT NULL
            OR rows.result_unit_id IS NOT NULL
            OR rows.result_lease_id IS NOT NULL
            OR rows.result_lease_party_id IS NOT NULL
            OR rows.result_lease_occupancy_id IS NOT NULL
            OR rows.error_message IS NOT NULL
            OR EXISTS (
              SELECT 1
              FROM public.lease_parties AS parties
              WHERE parties.organization_id = rows.organization_id
                AND parties.source_import_row_id = rows.id
            )
            OR EXISTS (
              SELECT 1
              FROM public.lease_occupancies AS occupancies
              WHERE occupancies.organization_id = rows.organization_id
                AND occupancies.source_import_row_id = rows.id
            )
            OR EXISTS (
              SELECT 1
              FROM public.lease_occupancy_participants AS participants
              WHERE participants.organization_id = rows.organization_id
                AND participants.source_import_row_id = rows.id
            )
          )
      ) THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Atomic staging permits only pristine insert or clean replacement delete'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_stage_run_transition_invalid';
  END IF;

  IF TG_OP <> 'UPDATE'
    OR (
      to_jsonb(NEW) - ARRAY[
        'status', 'created_count', 'updated_count', 'failed_count',
        'skipped_count', 'error_message', 'committed_at', 'updated_at',
        'updated_by'
      ]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'status', 'created_count', 'updated_count', 'failed_count',
        'skipped_count', 'error_message', 'committed_at', 'updated_at',
        'updated_by'
      ]
    ) THEN
    RAISE EXCEPTION 'Atomic commit attempted to rewrite staged run evidence'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_commit_run_transition_invalid';
  END IF;

  IF OLD.status = 'staged'
    AND NEW.status = 'committing'
    AND NEW.created_count = 0
    AND NEW.updated_count = 0
    AND NEW.failed_count = 0
    AND NEW.skipped_count = 0
    AND NEW.error_message IS NULL
    AND NEW.committed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'committing'
    AND NEW.status IN ('committed', 'committed_with_errors', 'failed')
    AND NEW.committed_at IS NOT NULL THEN
    SELECT
      count(*) FILTER (
        WHERE rows.row_status = 'committed'
          AND rows.result_action = 'created'
      )::integer,
      count(*) FILTER (
        WHERE rows.row_status = 'committed'
          AND rows.result_action = 'updated'
      )::integer,
      count(*) FILTER (WHERE rows.row_status = 'failed')::integer,
      count(*) FILTER (WHERE rows.row_status = 'error')::integer
    INTO
      v_actual_created,
      v_actual_updated,
      v_actual_failed,
      v_actual_skipped
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = OLD.id
      AND rows.organization_id = OLD.organization_id;

    IF EXISTS (
      SELECT 1
      FROM public.import_rows AS rows
      WHERE rows.import_run_id = OLD.id
        AND rows.organization_id = OLD.organization_id
        AND rows.row_status IN ('ready', 'warning')
    ) OR NEW.created_count <> v_actual_created
      OR NEW.updated_count <> v_actual_updated
      OR NEW.failed_count <> v_actual_failed
      OR NEW.skipped_count <> v_actual_skipped
      OR NEW.total_rows <>
        v_actual_created + v_actual_updated + v_actual_failed + v_actual_skipped
      OR NEW.status <> (
        CASE
          WHEN v_actual_failed > 0
            AND v_actual_created + v_actual_updated > 0
            THEN 'committed_with_errors'
          WHEN v_actual_failed > 0 THEN 'failed'
          ELSE 'committed'
        END
      )
      OR NEW.error_message IS DISTINCT FROM (
        CASE
          WHEN v_actual_failed > 0
            THEN 'Some rows could not be committed.'
          ELSE NULL
        END
      ) THEN
      RAISE EXCEPTION 'Atomic import terminal summary does not match finalized rows'
        USING
          ERRCODE = '55000',
          DETAIL = 'import_atomic_commit_summary_mismatch';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Atomic import run transition is not a checked commit transition'
    USING
      ERRCODE = '55000',
      DETAIL = 'import_atomic_commit_run_transition_invalid';

END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_atomic_import_run_write()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_guard_atomic_import_run_write
BEFORE INSERT OR UPDATE OR DELETE ON public.import_runs
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_atomic_import_run_write();

CREATE OR REPLACE FUNCTION app_private.guard_atomic_import_row_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_atomic_run public.import_runs%ROWTYPE;
  v_context jsonb;
  v_context_matches boolean := false;
  v_issue_append_allowed boolean := false;
  v_operation text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT runs.*
    INTO v_atomic_run
    FROM public.import_runs AS runs
    WHERE runs.id = OLD.import_run_id
      AND runs.organization_id = OLD.organization_id
      AND runs.source_claim_hash IS NOT NULL
      AND runs.snapshot_hash IS NOT NULL;
  END IF;

  IF NOT FOUND OR TG_OP = 'INSERT' THEN
    IF TG_OP <> 'DELETE' THEN
      SELECT runs.*
      INTO v_atomic_run
      FROM public.import_runs AS runs
      WHERE runs.id = NEW.import_run_id
        AND runs.organization_id = NEW.organization_id
        AND runs.source_claim_hash IS NOT NULL
        AND runs.snapshot_hash IS NOT NULL;
    END IF;
  END IF;

  IF NOT FOUND THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF current_user IN ('postgres', 'supabase_admin') THEN
    BEGIN
      v_context := nullif(
        current_setting('app.atomic_import_write_context', true),
        ''
      )::jsonb;
      v_operation := v_context ->> 'operation';
      v_context_matches :=
        v_operation IN ('stage-v1', 'commit-v1')
        AND v_context ->> 'organizationId' = v_atomic_run.organization_id::text
        AND v_context ->> 'sourceClaimHash' = v_atomic_run.source_claim_hash
        AND v_context ->> 'runId' = v_atomic_run.id::text;
    EXCEPTION WHEN OTHERS THEN
      v_context_matches := false;
    END;
  END IF;

  IF NOT v_context_matches THEN
    RAISE EXCEPTION 'Atomic import rows can only be written by their checked RPC'
      USING
        ERRCODE = '42501',
        DETAIL = 'import_atomic_row_rpc_required';
  END IF;

  IF v_operation = 'stage-v1' THEN
    IF TG_OP = 'INSERT'
      AND NEW.row_status IN ('ready', 'warning', 'error')
      AND NEW.result_action IS NULL
      AND NEW.result_unit_id IS NULL
      AND NEW.result_lease_id IS NULL
      AND NEW.result_lease_party_id IS NULL
      AND NEW.result_lease_occupancy_id IS NULL
      AND NEW.error_message IS NULL THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Atomic staging permits only pristine row insert or parent-owned cascade'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_stage_row_transition_invalid';
  END IF;

  IF v_atomic_run.status <> 'committing' THEN
    RAISE EXCEPTION 'Atomic import rows can only finalize while their run is committing'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_commit_row_transition_invalid';
  END IF;

  IF TG_OP <> 'UPDATE'
    OR (
      to_jsonb(NEW) - ARRAY[
        'row_status', 'result_action', 'result_unit_id', 'result_lease_id',
        'result_lease_party_id', 'result_lease_occupancy_id',
        'error_message', 'issues', 'updated_at'
      ]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'row_status', 'result_action', 'result_unit_id', 'result_lease_id',
        'result_lease_party_id', 'result_lease_occupancy_id',
        'error_message', 'issues', 'updated_at'
      ]
    ) THEN
    RAISE EXCEPTION 'Atomic commit attempted to rewrite staged row evidence'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_commit_row_transition_invalid';
  END IF;

  v_issue_append_allowed :=
    OLD.row_status IN ('ready', 'warning')
    AND NEW.row_status = 'failed'
    AND NULLIF(trim(NEW.error_message), '') IS NOT NULL
    AND jsonb_typeof(OLD.issues) = 'array'
    AND jsonb_typeof(NEW.issues) = 'array'
    AND jsonb_array_length(NEW.issues) = jsonb_array_length(OLD.issues) + 1
    AND NEW.issues -> -1 ->> 'level' = 'error'
    AND NEW.issues -> -1 ->> 'message' = NEW.error_message
    AND (
      NEW.issues - (jsonb_array_length(NEW.issues) - 1)
    ) IS NOT DISTINCT FROM OLD.issues;

  IF OLD.row_status NOT IN ('ready', 'warning')
    OR OLD.result_action IS NOT NULL
    OR OLD.result_unit_id IS NOT NULL
    OR OLD.result_lease_id IS NOT NULL
    OR OLD.result_lease_party_id IS NOT NULL
    OR OLD.result_lease_occupancy_id IS NOT NULL
    OR OLD.error_message IS NOT NULL THEN
    RAISE EXCEPTION 'Atomic import row is not pristine staged evidence'
      USING
        ERRCODE = '55000',
        DETAIL = 'import_atomic_commit_row_transition_invalid';
  END IF;

  IF NEW.row_status = 'committed'
    AND NEW.result_action IN ('created', 'updated')
    AND NEW.error_message IS NULL
    AND NEW.issues IS NOT DISTINCT FROM OLD.issues THEN
    RETURN NEW;
  END IF;

  IF NEW.row_status = 'failed'
    AND NEW.result_action IS NULL
    AND NEW.result_unit_id IS NULL
    AND NEW.result_lease_id IS NULL
    AND NEW.result_lease_party_id IS NULL
    AND NEW.result_lease_occupancy_id IS NULL
    AND v_issue_append_allowed THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Atomic import row transition is not a checked commit outcome'
    USING
      ERRCODE = '55000',
      DETAIL = CASE
        WHEN NEW.issues IS DISTINCT FROM OLD.issues
          THEN 'import_atomic_commit_row_issues_immutable'
        ELSE 'import_atomic_commit_row_transition_invalid'
      END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_atomic_import_row_write()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_guard_atomic_import_row_write
BEFORE INSERT OR UPDATE OR DELETE ON public.import_rows
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_atomic_import_row_write();

CREATE OR REPLACE FUNCTION public.stage_import_run_v1(
  p_organization_id uuid,
  p_import_type text,
  p_source_file_name text,
  p_source_file_size bigint,
  p_source_mime_type text,
  p_headers jsonb,
  p_mapping jsonb,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual_row_count integer;
  v_atomic_context text;
  v_blocked_rows integer;
  v_canonical_rows jsonb;
  v_claim_hash text;
  v_claim_payload jsonb;
  v_has_provenance boolean;
  v_ready_rows integer;
  v_requested_raw_rows jsonb;
  v_previous_atomic_context text :=
    current_setting('app.atomic_import_write_context', true);
  v_run public.import_runs%ROWTYPE;
  v_run_id uuid;
  v_snapshot_hash text;
  v_snapshot_payload jsonb;
  v_stored_rows jsonb;
  v_stored_raw_rows jsonb;
  v_total_rows integer;
  v_warning_rows integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_import_type IS NULL
    OR p_import_type NOT IN ('properties', 'units', 'people', 'leases')
    OR p_source_file_name IS NULL
    OR length(trim(p_source_file_name)) NOT BETWEEN 1 AND 255
    OR p_source_file_size IS NULL
    OR p_source_file_size NOT BETWEEN 0 AND 12582912
    OR length(coalesce(p_source_mime_type, '')) > 120 THEN
    RAISE EXCEPTION 'Import staging payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_headers) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_mapping) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import staging payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_headers) NOT BETWEEN 1 AND 100
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Import staging payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_headers) AS header(value)
    WHERE jsonb_typeof(header.value) IS DISTINCT FROM 'string'
      OR length(trim(header.value #>> '{}')) NOT BETWEEN 1 AND 120
  ) THEN
    RAISE EXCEPTION 'Import staging payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
      OR NOT (
        item.value ?& ARRAY[
          'source_row_number',
          'row_status',
          'action_label',
          'raw_data',
          'normalized_data',
          'issues'
        ]
      )
      OR jsonb_typeof(item.value -> 'source_row_number')
        IS DISTINCT FROM 'number'
      OR NOT coalesce(
        (item.value ->> 'source_row_number') ~ '^[1-9][0-9]*$',
        false
      )
      OR length(item.value ->> 'source_row_number') > 10
      OR (
        length(item.value ->> 'source_row_number') = 10
        AND item.value ->> 'source_row_number' > '2147483647'
      )
      OR jsonb_typeof(item.value -> 'row_status') IS DISTINCT FROM 'string'
      OR item.value ->> 'row_status' NOT IN ('ready', 'warning', 'error')
      OR jsonb_typeof(item.value -> 'action_label') IS DISTINCT FROM 'string'
      OR length(trim(item.value ->> 'action_label')) NOT BETWEEN 1 AND 120
      OR jsonb_typeof(item.value -> 'raw_data') IS DISTINCT FROM 'object'
      OR jsonb_typeof(item.value -> 'normalized_data') IS DISTINCT FROM 'object'
      OR jsonb_typeof(item.value -> 'issues') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'Import row payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        (item.value ->> 'source_row_number')::integer AS source_row_number,
        lag((item.value ->> 'source_row_number')::integer)
          OVER (ORDER BY item.ordinality) AS previous_source_row_number
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS item(value, ordinality)
    ) AS ordered_rows
    WHERE ordered_rows.previous_source_row_number IS NOT NULL
      AND ordered_rows.source_row_number
        <= ordered_rows.previous_source_row_number
  ) THEN
    RAISE EXCEPTION
      'Import rows must have unique, strictly increasing source row numbers'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'source_row_number',
      (item.value ->> 'source_row_number')::integer,
      'row_status',
      item.value ->> 'row_status',
      'action_label',
      trim(item.value ->> 'action_label'),
      'raw_data',
      item.value -> 'raw_data',
      'normalized_data',
      item.value -> 'normalized_data',
      'issues',
      item.value -> 'issues'
    )
    ORDER BY item.ordinality
  )
  INTO v_canonical_rows
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS item(value, ordinality);

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE item.value ->> 'row_status' IN ('ready', 'warning')
    )::integer,
    count(*) FILTER (
      WHERE item.value ->> 'row_status' = 'warning'
    )::integer,
    count(*) FILTER (
      WHERE item.value ->> 'row_status' = 'error'
    )::integer,
    jsonb_agg(
      jsonb_build_object(
        'source_row_number',
        (item.value ->> 'source_row_number')::integer,
        'raw_data',
        item.value -> 'raw_data'
      )
      ORDER BY item.ordinality
    )
  INTO
    v_total_rows,
    v_ready_rows,
    v_warning_rows,
    v_blocked_rows,
    v_requested_raw_rows
  FROM jsonb_array_elements(v_canonical_rows)
    WITH ORDINALITY AS item(value, ordinality);

  v_claim_payload := jsonb_build_object(
    'contract', 'nestory_import_claim_v1',
    'organizationId', p_organization_id,
    'importType', p_import_type,
    'headers', p_headers,
    'mapping', p_mapping,
    'rows', v_requested_raw_rows
  );
  v_claim_hash := pg_catalog.encode(
    extensions.digest(v_claim_payload::text, 'sha256'),
    'hex'
  );

  v_snapshot_payload := jsonb_build_object(
    'contract', 'nestory_import_snapshot_v1',
    'sourceClaimHash', v_claim_hash,
    'rows', v_canonical_rows
  );
  v_snapshot_hash := pg_catalog.encode(
    extensions.digest(v_snapshot_payload::text, 'sha256'),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || v_claim_hash,
      0
    )
  );

  v_atomic_context := jsonb_build_object(
    'operation', 'stage-v1',
    'organizationId', p_organization_id,
    'sourceClaimHash', v_claim_hash,
    'runId', NULL
  )::text;

  SELECT runs.*
  INTO v_run
  FROM public.import_runs AS runs
  WHERE runs.organization_id = p_organization_id
    AND runs.source_claim_hash = v_claim_hash
  FOR UPDATE;

  IF FOUND THEN
    SELECT
      count(*)::integer,
      jsonb_agg(
        jsonb_build_object(
          'source_row_number', rows.source_row_number,
          'raw_data', rows.raw_data
        )
        ORDER BY rows.source_row_number
      ),
      jsonb_agg(
        jsonb_build_object(
          'source_row_number', rows.source_row_number,
          'row_status', rows.row_status,
          'action_label', rows.action_label,
          'raw_data', rows.raw_data,
          'normalized_data', rows.normalized_data,
          'issues', rows.issues
        )
        ORDER BY rows.source_row_number
      )
    INTO v_actual_row_count, v_stored_raw_rows, v_stored_rows
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = v_run.id
      AND rows.organization_id = v_run.organization_id;

    IF v_run.import_type IS DISTINCT FROM p_import_type
      OR v_run.headers IS DISTINCT FROM p_headers
      OR v_run.mapping IS DISTINCT FROM p_mapping
      OR v_run.total_rows IS DISTINCT FROM v_total_rows
      OR v_actual_row_count IS DISTINCT FROM v_total_rows
      OR v_stored_raw_rows IS DISTINCT FROM v_requested_raw_rows THEN
      RAISE EXCEPTION 'Import source claim collision or tamper detected'
        USING
          ERRCODE = '23505',
          DETAIL = 'import_source_claim_payload_mismatch';
    END IF;

    IF v_run.status <> 'staged' THEN
      PERFORM set_config(
        'app.atomic_import_write_context',
        coalesce(v_previous_atomic_context, ''),
        true
      );
      RETURN jsonb_build_object(
        'runId', v_run.id,
        'status', v_run.status,
        'sourceFileName', v_run.source_file_name,
        'total', v_run.total_rows,
        'ready', v_run.ready_rows,
        'warnings', v_run.warning_rows,
        'blocked', v_run.error_rows,
        'created', v_run.created_count,
        'updated', v_run.updated_count,
        'failed', v_run.failed_count,
        'skipped', v_run.skipped_count
      );
    END IF;

    IF v_run.snapshot_hash = v_snapshot_hash THEN
      IF v_stored_rows IS DISTINCT FROM v_canonical_rows THEN
        RAISE EXCEPTION 'Import staged snapshot collision or tamper detected'
          USING
            ERRCODE = '23505',
            DETAIL = 'import_snapshot_payload_mismatch';
      END IF;

      PERFORM set_config(
        'app.atomic_import_write_context',
        coalesce(v_previous_atomic_context, ''),
        true
      );
      RETURN jsonb_build_object(
        'runId', v_run.id,
        'status', v_run.status,
        'sourceFileName', v_run.source_file_name,
        'total', v_run.total_rows,
        'ready', v_run.ready_rows,
        'warnings', v_run.warning_rows,
        'blocked', v_run.error_rows,
        'created', v_run.created_count,
        'updated', v_run.updated_count,
        'failed', v_run.failed_count,
        'skipped', v_run.skipped_count
      );
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.import_rows AS rows
      WHERE rows.import_run_id = v_run.id
        AND (
          rows.row_status NOT IN ('ready', 'warning', 'error')
          OR rows.result_action IS NOT NULL
          OR rows.result_unit_id IS NOT NULL
          OR rows.result_lease_id IS NOT NULL
          OR rows.result_lease_party_id IS NOT NULL
          OR rows.result_lease_occupancy_id IS NOT NULL
          OR rows.error_message IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public.lease_parties AS parties
            WHERE parties.organization_id = rows.organization_id
              AND parties.source_import_row_id = rows.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.lease_occupancies AS occupancies
            WHERE occupancies.organization_id = rows.organization_id
              AND occupancies.source_import_row_id = rows.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.lease_occupancy_participants AS participants
            WHERE participants.organization_id = rows.organization_id
              AND participants.source_import_row_id = rows.id
          )
        )
    )
    INTO v_has_provenance;

    IF v_has_provenance THEN
      RAISE EXCEPTION 'Import staged snapshot is not clean for replacement'
        USING
          ERRCODE = '55000',
          DETAIL = 'import_staged_replacement_not_clean';
    END IF;

    v_atomic_context := jsonb_set(
      v_atomic_context::jsonb,
      '{runId}',
      to_jsonb(v_run.id::text)
    )::text;
    PERFORM set_config(
      'app.atomic_import_write_context',
      v_atomic_context,
      true
    );

    DELETE FROM public.import_runs
    WHERE id = v_run.id
      AND organization_id = p_organization_id
      AND status = 'staged';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Import staged snapshot changed during replacement'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  v_run_id := gen_random_uuid();

  v_atomic_context := jsonb_set(
    v_atomic_context::jsonb,
    '{runId}',
    to_jsonb(v_run_id::text)
  )::text;
  PERFORM set_config(
    'app.atomic_import_write_context',
    v_atomic_context,
    true
  );

  INSERT INTO public.import_runs(
    id,
    organization_id,
    import_type,
    status,
    source_file_name,
    source_file_size,
    source_mime_type,
    headers,
    mapping,
    source_claim_hash,
    snapshot_hash,
    total_rows,
    ready_rows,
    warning_rows,
    error_rows,
    created_by,
    updated_by
  )
  VALUES (
    v_run_id,
    p_organization_id,
    p_import_type,
    'staged',
    trim(p_source_file_name),
    p_source_file_size,
    nullif(trim(coalesce(p_source_mime_type, '')), ''),
    p_headers,
    p_mapping,
    v_claim_hash,
    v_snapshot_hash,
    v_total_rows,
    v_ready_rows,
    v_warning_rows,
    v_blocked_rows,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING * INTO v_run;

  INSERT INTO public.import_rows(
    import_run_id,
    organization_id,
    source_row_number,
    row_status,
    action_label,
    raw_data,
    normalized_data,
    issues
  )
  SELECT
    v_run.id,
    p_organization_id,
    (item.value ->> 'source_row_number')::integer,
    item.value ->> 'row_status',
    item.value ->> 'action_label',
    item.value -> 'raw_data',
    item.value -> 'normalized_data',
    item.value -> 'issues'
  FROM jsonb_array_elements(v_canonical_rows)
    WITH ORDINALITY AS item(value, ordinality)
  ORDER BY item.ordinality;

  PERFORM set_config(
    'app.atomic_import_write_context',
    coalesce(v_previous_atomic_context, ''),
    true
  );

  RETURN jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'sourceFileName', v_run.source_file_name,
    'total', v_run.total_rows,
    'ready', v_run.ready_rows,
    'warnings', v_run.warning_rows,
    'blocked', v_run.error_rows,
    'created', v_run.created_count,
    'updated', v_run.updated_count,
    'failed', v_run.failed_count,
    'skipped', v_run.skipped_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_import_run_v1(
  uuid,
  text,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.stage_import_run_v1(
  uuid,
  text,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb
) TO authenticated, service_role;

-- Commit implementations remain intact, but only the checked public wrappers
-- below may invoke them after claim serialization and completeness checks.
ALTER FUNCTION public.commit_unit_import_run(uuid, uuid)
  RENAME TO commit_unit_import_run_legacy_unchecked;
ALTER FUNCTION public.commit_unit_import_run_legacy_unchecked(uuid, uuid)
  SET SCHEMA app_private;

ALTER FUNCTION public.commit_generic_import_run(uuid, uuid)
  RENAME TO commit_generic_import_run_checked_lease_legacy;
ALTER FUNCTION public.commit_generic_import_run_checked_lease_legacy(uuid, uuid)
  SET SCHEMA app_private;

REVOKE ALL ON FUNCTION
  app_private.commit_unit_import_run_legacy_unchecked(uuid, uuid),
  app_private.commit_generic_import_run_checked_lease_legacy(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_unit_import_run(
  p_import_run_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual_error_rows integer;
  v_actual_ready_rows integer;
  v_actual_total_rows integer;
  v_actual_warning_rows integer;
  v_claim_hash text;
  v_commit_result jsonb;
  v_previous_atomic_context text :=
    current_setting('app.atomic_import_write_context', true);
  v_run public.import_runs%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT runs.source_claim_hash
  INTO v_claim_hash
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type = 'units';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF v_claim_hash IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_organization_id::text || ':' || v_claim_hash,
        0
      )
    );
  END IF;

  SELECT runs.*
  INTO v_run
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type = 'units'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF v_run.source_claim_hash IS DISTINCT FROM v_claim_hash THEN
    RAISE EXCEPTION 'Import run claim changed before commit'
      USING ERRCODE = '40001';
  END IF;

  IF v_run.status <> 'staged' THEN
    RAISE EXCEPTION 'Import run must be staged before commit'
      USING ERRCODE = '22023';
  END IF;

  IF v_claim_hash IS NULL OR v_run.snapshot_hash IS NULL THEN
    RAISE EXCEPTION 'Legacy staged import must be re-uploaded before commit'
      USING
        ERRCODE = '23514',
        DETAIL = 'legacy_import_staging_not_atomic';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE rows.row_status IN ('ready', 'warning')
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'warning'
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'error'
    )::integer
  INTO
    v_actual_total_rows,
    v_actual_ready_rows,
    v_actual_warning_rows,
    v_actual_error_rows
  FROM public.import_rows AS rows
  WHERE rows.import_run_id = v_run.id
    AND rows.organization_id = p_organization_id;

  IF v_run.total_rows <> v_actual_total_rows
    OR v_run.ready_rows <> v_actual_ready_rows
    OR v_run.warning_rows <> v_actual_warning_rows
    OR v_run.error_rows <> v_actual_error_rows THEN
    RAISE EXCEPTION
      'Import run staging summary does not match its complete row set'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_staging_summary_mismatch';
  END IF;

  IF v_actual_ready_rows = 0 THEN
    RAISE EXCEPTION 'Import run has no ready rows to commit'
      USING
        ERRCODE = '22023',
        DETAIL = 'import_staging_has_no_ready_rows';
  END IF;

  PERFORM set_config(
    'app.atomic_import_write_context',
    jsonb_build_object(
      'operation', 'commit-v1',
      'organizationId', p_organization_id,
      'sourceClaimHash', v_claim_hash,
      'runId', p_import_run_id
    )::text,
    true
  );

  BEGIN
    v_commit_result := app_private.commit_unit_import_run_legacy_unchecked(
      p_import_run_id,
      p_organization_id
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.atomic_import_write_context',
      coalesce(v_previous_atomic_context, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.atomic_import_write_context',
    coalesce(v_previous_atomic_context, ''),
    true
  );
  RETURN v_commit_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_generic_import_run(
  p_import_run_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual_error_rows integer;
  v_actual_ready_rows integer;
  v_actual_total_rows integer;
  v_actual_warning_rows integer;
  v_claim_hash text;
  v_commit_result jsonb;
  v_previous_atomic_context text :=
    current_setting('app.atomic_import_write_context', true);
  v_run public.import_runs%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT runs.source_claim_hash
  INTO v_claim_hash
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type IN ('properties', 'people', 'leases');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF v_claim_hash IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_organization_id::text || ':' || v_claim_hash,
        0
      )
    );
  END IF;

  SELECT runs.*
  INTO v_run
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type IN ('properties', 'people', 'leases')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF v_run.source_claim_hash IS DISTINCT FROM v_claim_hash THEN
    RAISE EXCEPTION 'Import run claim changed before commit'
      USING ERRCODE = '40001';
  END IF;

  IF v_run.status <> 'staged' THEN
    RAISE EXCEPTION 'Import run must be staged before commit'
      USING ERRCODE = '22023';
  END IF;

  IF v_claim_hash IS NULL OR v_run.snapshot_hash IS NULL THEN
    RAISE EXCEPTION 'Legacy staged import must be re-uploaded before commit'
      USING
        ERRCODE = '23514',
        DETAIL = 'legacy_import_staging_not_atomic';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE rows.row_status IN ('ready', 'warning')
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'warning'
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'error'
    )::integer
  INTO
    v_actual_total_rows,
    v_actual_ready_rows,
    v_actual_warning_rows,
    v_actual_error_rows
  FROM public.import_rows AS rows
  WHERE rows.import_run_id = v_run.id
    AND rows.organization_id = p_organization_id;

  IF v_run.total_rows <> v_actual_total_rows
    OR v_run.ready_rows <> v_actual_ready_rows
    OR v_run.warning_rows <> v_actual_warning_rows
    OR v_run.error_rows <> v_actual_error_rows THEN
    RAISE EXCEPTION
      'Import run staging summary does not match its complete row set'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_staging_summary_mismatch';
  END IF;

  IF v_actual_ready_rows = 0 THEN
    RAISE EXCEPTION 'Import run has no ready rows to commit'
      USING
        ERRCODE = '22023',
        DETAIL = 'import_staging_has_no_ready_rows';
  END IF;

  PERFORM set_config(
    'app.atomic_import_write_context',
    jsonb_build_object(
      'operation', 'commit-v1',
      'organizationId', p_organization_id,
      'sourceClaimHash', v_claim_hash,
      'runId', p_import_run_id
    )::text,
    true
  );

  BEGIN
    v_commit_result := app_private.commit_generic_import_run_checked_lease_legacy(
      p_import_run_id,
      p_organization_id
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.atomic_import_write_context',
      coalesce(v_previous_atomic_context, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.atomic_import_write_context',
    coalesce(v_previous_atomic_context, ''),
    true
  );
  RETURN v_commit_result;
END;
$$;

REVOKE ALL ON FUNCTION
  public.commit_unit_import_run(uuid, uuid),
  public.commit_generic_import_run(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.commit_unit_import_run(uuid, uuid),
  public.commit_generic_import_run(uuid, uuid)
TO authenticated;

-- The preceding Lease hardening migration already exposes the legacy staging
-- columns through explicit column grants. The new identity columns remain
-- database-owned while legacy DML and its trigger-level regression contract
-- stay intact.
REVOKE INSERT (source_claim_hash, snapshot_hash),
  UPDATE (source_claim_hash, snapshot_hash)
ON public.import_runs FROM authenticated;

GRANT SELECT, DELETE ON public.import_runs TO authenticated;
GRANT SELECT ON public.import_rows TO authenticated;
