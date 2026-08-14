-- Coordinate physical cleanup of abandoned paid-cost evidence with the
-- immutable registrar. Storage deletion remains an API operation; these
-- claims only close the registration race while that deletion is in flight.

CREATE TABLE app_private.paid_cost_evidence_cleanup_claims (
  storage_path text PRIMARY KEY,
  organization_id uuid NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (
    storage_path = organization_id::text || '/paid-cost-evidence/' ||
      split_part(storage_path, '/', 3)
    AND split_part(storage_path, '/', 3) ~ '^[0-9a-f]{64}$'
  ),
  CHECK (length(storage_object_version) BETWEEN 1 AND 200)
);

ALTER TABLE app_private.paid_cost_evidence_cleanup_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.paid_cost_evidence_cleanup_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.paid_cost_evidence_cleanup_claims OWNER TO postgres;
REVOKE ALL ON TABLE app_private.paid_cost_evidence_cleanup_claims
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.begin_paid_cost_evidence_cleanup(
  p_organization_id uuid,
  p_storage_path text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_claimed_count integer := 0;
  v_object storage.objects%ROWTYPE;
  v_path text := pg_catalog.btrim(coalesce(p_storage_path, ''));
BEGIN
  IF p_organization_id IS NULL
    OR v_path NOT LIKE p_organization_id::text || '/paid-cost-evidence/%'
    OR split_part(v_path, '/', 3) !~ '^[0-9a-f]{64}$'
    OR array_length(string_to_array(v_path, '/'), 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'paid_cost_evidence_cleanup_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'paid_cost_evidence_v1', p_organization_id, v_path
      ),
      0
    )
  );

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_path
  FOR KEY SHARE;

  IF NOT FOUND
    OR EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.organization_id = p_organization_id
        AND document.storage_path = v_path
    )
    OR EXISTS (
      SELECT 1
      FROM app_private.paid_cost_evidence_registrations AS registration
      WHERE registration.organization_id = p_organization_id
        AND registration.storage_path = v_path
    ) THEN
    RETURN false;
  END IF;

  INSERT INTO app_private.paid_cost_evidence_cleanup_claims (
    storage_path,
    organization_id,
    storage_object_id,
    storage_object_version
  ) VALUES (
    v_path,
    p_organization_id,
    v_object.id,
    v_object.version
  )
  ON CONFLICT (storage_path) DO NOTHING;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
  RETURN v_claimed_count = 1;
END;
$$;

CREATE FUNCTION public.finish_paid_cost_evidence_cleanup(
  p_organization_id uuid,
  p_storage_path text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  DELETE FROM app_private.paid_cost_evidence_cleanup_claims AS claim
  WHERE claim.organization_id = p_organization_id
    AND claim.storage_path = pg_catalog.btrim(coalesce(p_storage_path, ''));

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count = 1;
END;
$$;

CREATE FUNCTION public.list_paid_cost_evidence_orphans(
  p_grace_seconds integer DEFAULT 86400
) RETURNS TABLE (
  organization_id uuid,
  storage_path text,
  storage_object_id uuid,
  storage_object_version text,
  created_at timestamptz,
  mime_type text,
  size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_grace_seconds NOT BETWEEN 300 AND 2592000 THEN
    RAISE EXCEPTION 'paid_cost_evidence_cleanup_grace_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    app_private.storage_object_org_id(object.name),
    object.name,
    object.id,
    object.version,
    object.created_at,
    object.metadata->>'mimetype',
    CASE
      WHEN coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (object.metadata->>'size')::bigint
      ELSE NULL
    END
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND split_part(object.name, '/', 2) = 'paid-cost-evidence'
    AND split_part(object.name, '/', 3) ~ '^[0-9a-f]{64}$'
    AND array_length(string_to_array(object.name, '/'), 1) = 3
    AND object.created_at <= statement_timestamp() -
      pg_catalog.make_interval(secs => p_grace_seconds)
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.storage_path = object.name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM app_private.paid_cost_evidence_registrations AS registration
      WHERE registration.storage_path = object.name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM app_private.paid_cost_evidence_cleanup_claims AS claim
      WHERE claim.storage_path = object.name
    )
  ORDER BY object.created_at, object.name;
END;
$$;

CREATE FUNCTION app_private.guard_paid_cost_evidence_cleanup_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.category = 'Paid cost evidence'
    AND EXISTS (
      SELECT 1
      FROM app_private.paid_cost_evidence_cleanup_claims AS claim
      WHERE claim.organization_id = NEW.organization_id
        AND claim.storage_path = NEW.storage_path
    ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_cleanup_in_progress'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_paid_cost_evidence_cleanup_claim_before_write
BEFORE INSERT OR UPDATE OF organization_id, category, storage_path
ON public.documents
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_paid_cost_evidence_cleanup_claim();

ALTER FUNCTION public.begin_paid_cost_evidence_cleanup(uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.finish_paid_cost_evidence_cleanup(uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.list_paid_cost_evidence_orphans(integer)
  OWNER TO postgres;
ALTER FUNCTION app_private.guard_paid_cost_evidence_cleanup_claim()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.begin_paid_cost_evidence_cleanup(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_paid_cost_evidence_cleanup(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_paid_cost_evidence_orphans(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_paid_cost_evidence_cleanup_claim()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.begin_paid_cost_evidence_cleanup(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_paid_cost_evidence_cleanup(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_paid_cost_evidence_orphans(integer)
  TO service_role;

COMMENT ON TABLE app_private.paid_cost_evidence_cleanup_claims IS
  'Short-lived service claims that serialize Storage deletion against paid-cost evidence registration.';
COMMENT ON FUNCTION public.list_paid_cost_evidence_orphans(integer) IS
  'Service-only inventory of aged paid-cost Storage objects with no document or registrar authority.';
