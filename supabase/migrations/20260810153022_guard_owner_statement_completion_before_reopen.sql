CREATE OR REPLACE FUNCTION app_private.guard_owner_statement_completion_before_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_publication_id uuid;
  v_artifact_count integer;
BEGIN
  IF OLD.current_closed_revision_id IS NULL
    OR OLD.state NOT IN ('closed', 'stale')
    OR NEW.state <> 'preparing' THEN
    RETURN NEW;
  END IF;

  SELECT publication.id INTO v_publication_id
  FROM public.owner_statement_publications AS publication
  WHERE publication.organization_id = OLD.organization_id
    AND publication.owner_close_revision_id = OLD.current_closed_revision_id;
  IF v_publication_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.count(DISTINCT artifact.format)::integer
  INTO v_artifact_count
  FROM public.owner_statement_artifacts AS artifact
  WHERE artifact.organization_id = OLD.organization_id
    AND artifact.publication_id = v_publication_id
    AND artifact.format IN ('pdf', 'xlsx');
  IF v_artifact_count <> 2 THEN
    RAISE EXCEPTION 'owner_statement_artifacts_incomplete'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_owner_statement_completion_before_reopen
  ON public.owner_close_series;
CREATE TRIGGER guard_owner_statement_completion_before_reopen
BEFORE UPDATE OF state, active_revision_id, current_closed_revision_id
ON public.owner_close_series
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_owner_statement_completion_before_reopen();

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
    SELECT pg_catalog.count(DISTINCT artifact.format)::integer
    INTO v_artifact_count
    FROM public.owner_statement_artifacts AS artifact
    WHERE artifact.organization_id = p_organization_id
      AND artifact.publication_id = v_publication.id;
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', CASE WHEN v_artifact_count = 2
          THEN 'owner_statement_already_published'
          ELSE 'owner_statement_artifacts_incomplete'
        END,
        'artifact_count', v_artifact_count,
        'required_formats', pg_catalog.jsonb_build_array('pdf', 'xlsx')
      )
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'revision_id', v_revision.id::text,
    'is_ready', pg_catalog.jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'existing_publication_id', v_publication.id::text,
    'artifact_count', v_artifact_count,
    'artifacts_complete', v_artifact_count = 2
  );
END;
$$;

ALTER FUNCTION app_private.guard_owner_statement_completion_before_reopen()
  OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_statement_completion_before_reopen()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_readiness(uuid, uuid)
  TO authenticated;
