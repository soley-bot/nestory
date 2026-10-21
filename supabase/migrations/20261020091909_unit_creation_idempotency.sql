-- A committed Unit request can be retried after an HTTP response is lost.
-- The receipt is written in the same transaction as the existing checked RPC.
-- It is not exposed through the Data API and grants no new asset authority.
CREATE TABLE app_private.unit_creation_requests (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  actor_id uuid NOT NULL,
  property_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  unit_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key),
  UNIQUE (unit_id)
);
ALTER TABLE app_private.unit_creation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.unit_creation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.unit_creation_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.create_unit_idempotent_checked(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_bedroom_count numeric,
  p_bathroom_count numeric,
  p_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_branch uuid;
  v_parent public.properties%ROWTYPE;
  v_unit public.units%ROWTYPE;
  v_receipt app_private.unit_creation_requests%ROWTYPE;
  v_id uuid;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_number text := pg_catalog.btrim(coalesce(p_unit_number, ''));
  v_floor text := nullif(pg_catalog.btrim(coalesce(p_floor, '')), '');
  v_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  v_payload jsonb;
BEGIN
  -- Deny unauthorized reads before looking up a receipt or parent details.
  PERFORM app_private.assert_property_permission(
    p_organization_id, p_property_id, 'properties.write'::public.organization_permission_key);
  IF pg_catalog.length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A valid unit creation key is required'
      USING ERRCODE = '22023', DETAIL = 'unit_creation_key_required';
  END IF;

  SELECT property.branch_id INTO v_branch
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id AND property.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  -- Lock authorization, current membership and the active branch before the
  -- parent row, then recheck its branch in case a move won the row lock.
  v_actor := app_private.assert_branch_permission(
    p_organization_id, v_branch, 'properties.write'::public.organization_permission_key);
  SELECT * INTO v_parent FROM public.properties
  WHERE organization_id = p_organization_id AND id = p_property_id
    AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;
  IF v_parent.branch_id IS DISTINCT FROM v_branch THEN
    RAISE EXCEPTION 'Property branch changed; review the unit request'
      USING ERRCODE = '40001', DETAIL = 'unit_creation_branch_changed';
  END IF;
  PERFORM app_private.assert_property_permission(
    p_organization_id, p_property_id, 'properties.write'::public.organization_permission_key);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_organization_id::text || ':unit_creation_v1:' || v_key, 0));
  v_payload := pg_catalog.jsonb_build_object(
    'property_id', p_property_id, 'branch_id', v_branch,
    'unit_number', v_number, 'floor', v_floor, 'size_sqm', p_size_sqm,
    'bedroom_count', p_bedroom_count, 'bathroom_count', p_bathroom_count,
    'status', v_status
  );
  SELECT * INTO v_receipt FROM app_private.unit_creation_requests
  WHERE organization_id = p_organization_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_receipt.actor_id IS DISTINCT FROM v_actor
      OR v_receipt.property_id IS DISTINCT FROM p_property_id
      OR v_receipt.branch_id IS DISTINCT FROM v_branch
      OR v_receipt.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Conflicting unit creation request'
        USING ERRCODE = '22023', DETAIL = 'unit_creation_idempotency_conflict';
    END IF;
    -- Replay only reads the committed result. Do not lock the unit after its
    -- parent: existing unit editors lock the unit before their parent trigger.
    -- A concurrent edit may follow this snapshot; later replay rejects its drift.
    SELECT * INTO v_unit FROM public.units
    WHERE organization_id = p_organization_id AND id = v_receipt.unit_id;
    IF NOT FOUND OR v_unit.archived_at IS NOT NULL
      OR (v_unit.property_id, v_unit.unit_number, v_unit.floor, v_unit.size_sqm,
          v_unit.bedroom_count, v_unit.bathroom_count, v_unit.status, v_unit.created_by)
        IS DISTINCT FROM
         (p_property_id, v_number, v_floor, p_size_sqm::numeric(10,2),
          p_bedroom_count::smallint, p_bathroom_count::smallint, v_status, v_actor) THEN
      RAISE EXCEPTION 'Created unit changed; review the existing unit'
        USING ERRCODE = '55000', DETAIL = 'unit_creation_result_changed';
    END IF;
    RETURN v_receipt.unit_id;
  END IF;

  -- Preserve the existing validation, branch permission, insert, rental
  -- structure promotion and single creation audit rather than duplicate them.
  v_id := public.create_unit(
    p_organization_id, p_property_id, p_unit_number, p_floor, p_size_sqm,
    p_bedroom_count, p_bathroom_count, p_status);
  INSERT INTO app_private.unit_creation_requests(
    organization_id, idempotency_key, actor_id, property_id, branch_id,
    request_payload, unit_id
  ) VALUES (
    p_organization_id, v_key, v_actor, p_property_id, v_branch, v_payload, v_id);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_unit(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_number text,
  p_floor text,
  p_size_sqm numeric,
  p_bedroom_count numeric,
  p_bathroom_count numeric,
  p_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.create_unit_idempotent_checked($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

REVOKE ALL ON FUNCTION app_private.create_unit_idempotent_checked(
  uuid,uuid,text,text,numeric,numeric,numeric,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.create_unit_idempotent_checked(
  uuid,uuid,text,text,numeric,numeric,numeric,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_unit(
  uuid,uuid,text,text,numeric,numeric,numeric,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_unit(
  uuid,uuid,text,text,numeric,numeric,numeric,text,text) TO authenticated;

COMMENT ON FUNCTION public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text,text)
IS 'Same-key Unit creation retry with atomic private receipt, original actor and payload binding, current active-branch authority, and no duplicate creation audit.';
