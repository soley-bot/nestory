-- Opening owner-balance authority depends on an exact, date-scoped ownership
-- roster. Legacy rows are reported and block this migration; nothing here
-- guesses a start date or assigns a sole owner 100 percent.

DO $$
BEGIN
  IF to_regprocedure('app_private.sync_property_primary_owner(uuid,uuid,uuid)') IS NULL
    OR md5(pg_get_functiondef('app_private.sync_property_primary_owner(uuid,uuid,uuid)'::regprocedure))
      <> 'e06b2111585b3df04e598d81f5d06307'
  THEN
    RAISE EXCEPTION 'Unexpected predecessor definition: app_private.sync_property_primary_owner(uuid,uuid,uuid)';
  END IF;

  IF to_regprocedure('public.create_property(uuid,text,text,text,text,text,text,date,text,uuid)') IS NULL
    OR md5(pg_get_functiondef('public.create_property(uuid,text,text,text,text,text,text,date,text,uuid)'::regprocedure))
      <> '054025de2c313eb300422f7d6e6b122a'
  THEN
    RAISE EXCEPTION 'Unexpected predecessor definition: public.create_property';
  END IF;

  IF to_regprocedure('public.update_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid)') IS NULL
    OR md5(pg_get_functiondef('public.update_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid)'::regprocedure))
      <> '7e51865729ffa84b1a2eaab7cbd76c16'
  THEN
    RAISE EXCEPTION 'Unexpected predecessor definition: public.update_property';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_roster_legacy_preflight(p_cutover_date date)
RETURNS TABLE (
  organization_id uuid,
  property_id uuid,
  boundary_date date,
  next_boundary_date date,
  issue_code text,
  property_owner_ids uuid[],
  active_owner_count integer,
  ownership_percent_total numeric(9,3),
  canonical_roster text,
  ownership_roster_hash text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH
  relevant_properties AS (
    SELECT p.organization_id, p.id AS property_id
    FROM public.properties AS p
    WHERE p.archived_at IS NULL
  ),
  owners AS (
    SELECT
      po.organization_id,
      po.property_id,
      po.id AS property_owner_id,
      po.person_id AS owner_person_id,
      po.ownership_percent,
      po.started_on,
      po.ended_on,
      pe.archived_at AS person_archived_at,
      EXISTS (
        SELECT 1
        FROM public.person_roles AS pr
        WHERE pr.organization_id = po.organization_id
          AND pr.person_id = po.person_id
          AND pr.role = 'owner'
          AND pr.status = 'active'
          AND pr.archived_at IS NULL
      ) AS has_active_owner_role
    FROM public.property_owners AS po
    JOIN public.people AS pe
      ON pe.organization_id = po.organization_id
     AND pe.id = po.person_id
    WHERE po.archived_at IS NULL
  ),
  raw_boundaries AS (
    SELECT rp.organization_id, rp.property_id, p_cutover_date AS boundary_date
    FROM relevant_properties AS rp
    UNION
    SELECT o.organization_id, o.property_id, o.started_on FROM owners AS o WHERE o.started_on IS NOT NULL
    UNION
    SELECT o.organization_id, o.property_id, o.ended_on FROM owners AS o WHERE o.ended_on IS NOT NULL
  ),
  boundaries AS (
    SELECT
      raw.organization_id,
      raw.property_id,
      raw.boundary_date,
      lead(raw.boundary_date) OVER (
        PARTITION BY raw.organization_id, raw.property_id
        ORDER BY raw.boundary_date
      ) AS next_boundary_date
    FROM raw_boundaries AS raw
  ),
  active AS (
    SELECT
      b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date,
      o.property_owner_id, o.owner_person_id, o.ownership_percent,
      o.started_on, o.ended_on, o.person_archived_at, o.has_active_owner_role
    FROM boundaries AS b
    JOIN owners AS o
      ON o.organization_id = b.organization_id
     AND o.property_id = b.property_id
     AND o.started_on IS NOT NULL
     AND o.ownership_percent IS NOT NULL
     AND o.started_on <= b.boundary_date
     AND (o.ended_on IS NULL OR b.boundary_date < o.ended_on)
  ),
  summaries AS (
    SELECT
      b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date,
      count(a.property_owner_id)::integer AS active_owner_count,
      coalesce(sum(a.ownership_percent), 0)::numeric(9,3) AS ownership_percent_total,
      coalesce(array_agg(a.property_owner_id ORDER BY lower(a.property_owner_id::text))
        FILTER (WHERE a.property_owner_id IS NOT NULL), ARRAY[]::uuid[]) AS property_owner_ids,
      string_agg(
        lower(a.property_owner_id::text) || '|' || lower(a.owner_person_id::text) || '|' ||
        to_char(a.ownership_percent, 'FM990.000') || '|' || to_char(a.started_on, 'YYYY-MM-DD') || '|' ||
        coalesce(to_char(a.ended_on, 'YYYY-MM-DD'), ''),
        E'\n' ORDER BY lower(a.property_owner_id::text)
      ) AS canonical_roster,
      bool_or(a.person_archived_at IS NOT NULL OR NOT a.has_active_owner_role) AS has_inactive_owner,
      count(a.property_owner_id) <> count(DISTINCT a.owner_person_id) AS has_overlap
    FROM boundaries AS b
    LEFT JOIN active AS a
      ON a.organization_id = b.organization_id
     AND a.property_id = b.property_id
     AND a.boundary_date = b.boundary_date
    GROUP BY b.organization_id, b.property_id, b.boundary_date, b.next_boundary_date
  ),
  boundary_issue_sets AS (
    SELECT
      s.*,
      array_remove(ARRAY[
        CASE WHEN s.active_owner_count = 0 THEN 'owner_roster_missing' END,
        CASE WHEN s.active_owner_count > 0 AND s.ownership_percent_total <> 100.000 THEN 'owner_share_total_not_100' END,
        CASE WHEN coalesce(s.has_inactive_owner, false) THEN 'owner_person_inactive' END,
        CASE WHEN coalesce(s.has_overlap, false) THEN 'owner_interval_overlap' END
      ], NULL)::text[] AS issue_codes
    FROM summaries AS s
  ),
  boundary_rows AS (
    SELECT
      s.organization_id,
      s.property_id,
      s.boundary_date,
      s.next_boundary_date,
      issue.issue_code,
      s.property_owner_ids,
      s.active_owner_count,
      s.ownership_percent_total,
      CASE WHEN issue.issue_code IS NULL THEN s.canonical_roster ELSE NULL END AS canonical_roster,
      CASE WHEN issue.issue_code IS NULL AND s.canonical_roster IS NOT NULL
        THEN encode(extensions.digest(s.canonical_roster, 'sha256'), 'hex') ELSE NULL END AS ownership_roster_hash
    FROM boundary_issue_sets AS s
    LEFT JOIN LATERAL unnest(
      CASE WHEN cardinality(s.issue_codes) = 0 THEN ARRAY[NULL::text] ELSE s.issue_codes END
    ) AS issue(issue_code) ON true
  ),
  intrinsic_rows AS (
    SELECT
      o.organization_id,
      o.property_id,
      p_cutover_date AS boundary_date,
      NULL::date AS next_boundary_date,
      issue.issue_code,
      ARRAY[o.property_owner_id]::uuid[] AS property_owner_ids,
      0::integer AS active_owner_count,
      0::numeric(9,3) AS ownership_percent_total,
      NULL::text AS canonical_roster,
      NULL::text AS ownership_roster_hash
    FROM owners AS o
    CROSS JOIN LATERAL unnest(array_remove(ARRAY[
      CASE WHEN o.started_on IS NULL THEN 'owner_start_missing' END,
      CASE WHEN o.ownership_percent IS NULL THEN 'owner_share_missing' END,
      CASE WHEN o.ownership_percent IS NOT NULL AND (o.ownership_percent <= 0 OR o.ownership_percent > 100)
        THEN 'owner_share_invalid' END,
      CASE WHEN o.started_on IS NOT NULL AND o.ended_on IS NOT NULL AND o.ended_on <= o.started_on
        THEN 'owner_interval_invalid' END
    ], NULL)) AS issue(issue_code)
  )
  SELECT * FROM boundary_rows
  UNION ALL
  SELECT * FROM intrinsic_rows
  ORDER BY organization_id, property_id, boundary_date, issue_code NULLS FIRST, property_owner_ids;
$$;

ALTER FUNCTION app_private.owner_roster_legacy_preflight(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_roster_legacy_preflight(date) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  issue_count bigint;
  preflight_hash text;
BEGIN
  SELECT
    count(*) FILTER (WHERE p.issue_code IS NOT NULL),
    encode(extensions.digest(coalesce(string_agg(
      p.organization_id::text || '|' || p.property_id::text || '|' || p.boundary_date::text || '|' ||
      coalesce(p.issue_code, 'ready'), E'\n' ORDER BY p.organization_id, p.property_id, p.boundary_date, p.issue_code
    ), ''), 'sha256'), 'hex')
  INTO issue_count, preflight_hash
  FROM app_private.owner_roster_legacy_preflight(current_date) AS p;

  IF issue_count > 0 THEN
    RAISE EXCEPTION 'Owner roster preflight is not clean (% issue rows, hash %). Run the read-only preflight and explicitly remediate; no ownership data was backfilled.', issue_count, preflight_hash
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.property_owners
  DROP CONSTRAINT property_owners_date_range_check,
  DROP CONSTRAINT property_owners_percent_check;

ALTER TABLE public.property_owners
  ADD COLUMN effective_range daterange
    GENERATED ALWAYS AS (daterange(started_on, ended_on, '[)')) STORED,
  ADD CONSTRAINT property_owners_unarchived_start_required_check
    CHECK (archived_at IS NOT NULL OR started_on IS NOT NULL),
  ADD CONSTRAINT property_owners_unarchived_share_required_check
    CHECK (archived_at IS NOT NULL OR (ownership_percent IS NOT NULL AND ownership_percent > 0 AND ownership_percent <= 100)),
  ADD CONSTRAINT property_owners_half_open_date_check
    CHECK (archived_at IS NOT NULL OR ended_on IS NULL OR ended_on > started_on),
  ADD CONSTRAINT property_owners_unarchived_person_effective_range_excl
    EXCLUDE USING gist (
      organization_id WITH =,
      property_id WITH =,
      person_id WITH =,
      effective_range WITH &&
    ) WHERE (archived_at IS NULL);

DROP POLICY IF EXISTS "Admins can manage property owners" ON public.property_owners;
REVOKE ALL ON public.property_owners FROM anon, authenticated, service_role;
GRANT SELECT ON public.property_owners TO authenticated;

CREATE OR REPLACE FUNCTION app_private.validate_owner_roster_on_date(
  p_organization_id uuid,
  p_property_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  property_owner_id uuid,
  owner_person_id uuid,
  ownership_percent numeric(6,3),
  started_on date,
  ended_on date,
  roster_hash text
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  roster_count integer;
  share_total numeric(9,3);
  inactive_count integer;
  canonical text;
  canonical_hash text;
BEGIN
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'owner_roster_effective_date_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties AS p
    WHERE p.organization_id = p_organization_id
      AND p.id = p_property_id
      AND p.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner_roster_property_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(po.ownership_percent), 0)::numeric(9,3),
    count(*) FILTER (WHERE pe.archived_at IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.person_roles AS pr
      WHERE pr.organization_id = po.organization_id
        AND pr.person_id = po.person_id
        AND pr.role = 'owner' AND pr.status = 'active' AND pr.archived_at IS NULL
    ))::integer,
    string_agg(
      lower(po.id::text) || '|' || lower(po.person_id::text) || '|' ||
      to_char(po.ownership_percent, 'FM990.000') || '|' || to_char(po.started_on, 'YYYY-MM-DD') || '|' ||
      coalesce(to_char(po.ended_on, 'YYYY-MM-DD'), ''),
      E'\n' ORDER BY lower(po.id::text)
    )
  INTO roster_count, share_total, inactive_count, canonical
  FROM public.property_owners AS po
  JOIN public.people AS pe
    ON pe.organization_id = po.organization_id AND pe.id = po.person_id
  WHERE po.organization_id = p_organization_id
    AND po.property_id = p_property_id
    AND po.archived_at IS NULL
    AND po.started_on <= p_effective_date
    AND (po.ended_on IS NULL OR p_effective_date < po.ended_on);

  IF roster_count = 0 THEN
    RAISE EXCEPTION 'owner_roster_missing' USING ERRCODE = '23514';
  END IF;
  IF share_total <> 100.000 THEN
    RAISE EXCEPTION 'owner_share_total_not_100: expected 100.000, got %', to_char(share_total, 'FM990.000') USING ERRCODE = '23514';
  END IF;
  IF inactive_count > 0 THEN
    RAISE EXCEPTION 'owner_person_inactive' USING ERRCODE = '23514';
  END IF;

  canonical_hash := encode(extensions.digest(canonical, 'sha256'), 'hex');
  RETURN QUERY
  SELECT po.id, po.person_id, po.ownership_percent, po.started_on, po.ended_on, canonical_hash
  FROM public.property_owners AS po
  WHERE po.organization_id = p_organization_id
    AND po.property_id = p_property_id
    AND po.archived_at IS NULL
    AND po.started_on <= p_effective_date
    AND (po.ended_on IS NULL OR p_effective_date < po.ended_on)
  ORDER BY lower(po.id::text);
END;
$$;

ALTER FUNCTION app_private.validate_owner_roster_on_date(uuid, uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.validate_owner_roster_on_date(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_owner_roster_readiness(p_organization_id uuid, p_cutover_date date)
RETURNS TABLE (
  organization_id uuid,
  property_id uuid,
  boundary_date date,
  next_boundary_date date,
  issue_code text,
  property_owner_ids uuid[],
  active_owner_count integer,
  ownership_percent_total numeric(9,3),
  canonical_roster text,
  ownership_roster_hash text,
  setup_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.organization_id,
    p.property_id,
    p.boundary_date,
    p.next_boundary_date,
    p.issue_code,
    p.property_owner_ids,
    p.active_owner_count,
    p.ownership_percent_total,
    p.canonical_roster,
    p.ownership_roster_hash,
    '/properties/' || p.property_id::text
  FROM app_private.owner_roster_legacy_preflight(p_cutover_date) AS p
  WHERE p.organization_id = p_organization_id
    AND p.issue_code IS NOT NULL
  ORDER BY p.property_id, p.boundary_date, p.issue_code, p.property_owner_ids;
END;
$$;

ALTER FUNCTION public.get_owner_roster_readiness(uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_roster_readiness(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_roster_readiness(uuid, date) TO authenticated;

DROP FUNCTION app_private.sync_property_primary_owner(uuid, uuid, uuid);

CREATE FUNCTION app_private.sync_property_primary_owner(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_owner_started_on date,
  p_owner_ownership_percent numeric
)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public', 'app_private'
AS $$
DECLARE
  current_owner public.property_owners%ROWTYPE;
  previous_owner_ids uuid[];
BEGIN
  IF (p_owner_person_id IS NULL) <> (p_owner_started_on IS NULL)
    OR (p_owner_person_id IS NULL) <> (p_owner_ownership_percent IS NULL)
  THEN
    RAISE EXCEPTION 'Owner, ownership start date, and ownership share must be supplied together' USING ERRCODE = '22023';
  END IF;

  IF p_owner_person_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.property_owners
      WHERE organization_id = p_organization_id AND property_id = p_property_id
        AND is_primary AND archived_at IS NULL AND ended_on IS NULL
    ) THEN
      RAISE EXCEPTION 'Clearing a current owner requires an explicit ownership correction' USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  IF p_owner_ownership_percent <= 0 OR p_owner_ownership_percent > 100
    OR p_owner_ownership_percent <> trunc(p_owner_ownership_percent, 3)
  THEN
    RAISE EXCEPTION 'Ownership share must be greater than 0, at most 100, and use at most 3 decimal places' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE organization_id = p_organization_id AND id = p_owner_person_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Owner person not found' USING ERRCODE = '23503';
  END IF;

  SELECT coalesce(array_agg(person_id ORDER BY person_id), ARRAY[]::uuid[])
  INTO previous_owner_ids
  FROM public.property_owners
  WHERE organization_id = p_organization_id AND property_id = p_property_id
    AND is_primary AND archived_at IS NULL AND ended_on IS NULL;

  SELECT * INTO current_owner
  FROM public.property_owners
  WHERE organization_id = p_organization_id AND property_id = p_property_id
    AND person_id = p_owner_person_id AND is_primary AND archived_at IS NULL AND ended_on IS NULL
  FOR UPDATE;

  IF FOUND THEN
    IF current_owner.started_on <> p_owner_started_on THEN
      RAISE EXCEPTION 'Existing owner start date does not match the explicit authority date' USING ERRCODE = '22023';
    END IF;
    UPDATE public.property_owners
    SET ownership_percent = p_owner_ownership_percent, updated_by = auth.uid()
    WHERE id = current_owner.id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.property_owners
      WHERE organization_id = p_organization_id AND property_id = p_property_id
        AND is_primary AND archived_at IS NULL AND ended_on IS NULL
        AND started_on >= p_owner_started_on
    ) THEN
      RAISE EXCEPTION 'Ownership replacement would create an empty interval' USING ERRCODE = '22023';
    END IF;

    UPDATE public.property_owners
    SET ended_on = p_owner_started_on, updated_by = auth.uid()
    WHERE organization_id = p_organization_id AND property_id = p_property_id
      AND is_primary AND archived_at IS NULL AND ended_on IS NULL;

    INSERT INTO public.property_owners (
      organization_id, property_id, person_id, ownership_label, is_primary,
      ownership_percent, started_on, created_by, updated_by
    ) VALUES (
      p_organization_id, p_property_id, p_owner_person_id, 'Primary', true,
      p_owner_ownership_percent, p_owner_started_on, auth.uid(), auth.uid()
    );
  END IF;

  UPDATE public.person_roles
  SET archived_at = NULL, archived_by = NULL, status = 'active', updated_by = auth.uid()
  WHERE organization_id = p_organization_id AND person_id = p_owner_person_id AND role = 'owner';
  IF NOT FOUND THEN
    INSERT INTO public.person_roles (organization_id, person_id, role, status, created_by, updated_by)
    VALUES (p_organization_id, p_owner_person_id, 'owner', 'active', auth.uid(), auth.uid());
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    p_organization_id, auth.uid(), 'property', p_property_id, 'property_owner_updated',
    jsonb_build_object('owner_person_ids', previous_owner_ids),
    jsonb_build_object('owner_person_id', p_owner_person_id, 'started_on', p_owner_started_on,
      'ownership_percent', to_char(p_owner_ownership_percent, 'FM990.000'))
  );
END;
$$;

ALTER FUNCTION app_private.sync_property_primary_owner(uuid, uuid, uuid, date, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.sync_property_primary_owner(uuid, uuid, uuid, date, numeric) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid);

CREATE FUNCTION public.create_property(
  p_organization_id uuid, p_name text, p_code text, p_property_type text,
  p_owner text, p_address text, p_status text, p_acquisition_date date,
  p_notes text, p_owner_person_id uuid DEFAULT NULL,
  p_owner_started_on date DEFAULT NULL, p_owner_ownership_percent numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'app_private'
AS $$
DECLARE
  new_property_id uuid;
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF normalized_name = '' OR length(normalized_name) > 120 THEN RAISE EXCEPTION 'Property name is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_code = '' OR length(normalized_code) > 24 THEN RAISE EXCEPTION 'Property code is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_type = '' OR length(normalized_type) > 80 THEN RAISE EXCEPTION 'Property type is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.properties (
    organization_id, name, code, property_type, owner, address, status,
    acquisition_date, notes, created_by, updated_by
  ) VALUES (
    p_organization_id, normalized_name, normalized_code, normalized_type,
    nullif(trim(coalesce(p_owner, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
    normalized_status, p_acquisition_date, nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
  ) RETURNING id INTO new_property_id;

  PERFORM app_private.sync_property_primary_owner(
    p_organization_id, new_property_id, p_owner_person_id, p_owner_started_on, p_owner_ownership_percent
  );
  INSERT INTO public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, new_values)
  VALUES (p_organization_id, auth.uid(), 'property', new_property_id, 'property_created',
    jsonb_build_object('name', normalized_name, 'code', normalized_code, 'property_type', normalized_type,
      'owner_person_id', p_owner_person_id, 'owner_started_on', p_owner_started_on,
      'owner_ownership_percent', p_owner_ownership_percent));
  RETURN new_property_id;
END;
$$;

ALTER FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid, date, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid, date, numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid, date, numeric) TO authenticated;

DROP FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid);

CREATE FUNCTION public.update_property(
  p_property_id uuid, p_organization_id uuid, p_name text, p_code text,
  p_property_type text, p_owner text, p_address text, p_status text,
  p_acquisition_date date, p_notes text, p_owner_person_id uuid,
  p_owner_started_on date, p_owner_ownership_percent numeric, p_owner_mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'app_private'
AS $$
DECLARE
  old_property public.properties%ROWTYPE;
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO old_property FROM public.properties
  WHERE id = p_property_id AND organization_id = p_organization_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503'; END IF;
  IF normalized_name = '' OR length(normalized_name) > 120 THEN RAISE EXCEPTION 'Property name is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_code = '' OR length(normalized_code) > 24 THEN RAISE EXCEPTION 'Property code is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_type = '' OR length(normalized_type) > 80 THEN RAISE EXCEPTION 'Property type is invalid' USING ERRCODE = '22023'; END IF;
  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023'; END IF;
  IF p_owner_mode NOT IN ('replace', 'preserve') THEN RAISE EXCEPTION 'Property owner mode is not supported' USING ERRCODE = '22023'; END IF;
  IF p_owner_mode = 'preserve'
    AND (p_owner_person_id IS NOT NULL OR p_owner_started_on IS NOT NULL OR p_owner_ownership_percent IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Preserve-owner mode cannot carry replacement ownership facts' USING ERRCODE = '22023';
  END IF;

  UPDATE public.properties SET
    name = normalized_name, code = normalized_code, property_type = normalized_type,
    owner = nullif(trim(coalesce(p_owner, '')), ''), address = nullif(trim(coalesce(p_address, '')), ''),
    status = normalized_status, acquisition_date = p_acquisition_date,
    notes = nullif(trim(coalesce(p_notes, '')), ''), updated_by = auth.uid()
  WHERE id = p_property_id;

  IF p_owner_mode = 'replace' THEN
    PERFORM app_private.sync_property_primary_owner(
      p_organization_id, p_property_id, p_owner_person_id, p_owner_started_on, p_owner_ownership_percent
    );
  END IF;
  INSERT INTO public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values)
  VALUES (p_organization_id, auth.uid(), 'property', p_property_id, 'property_updated',
    to_jsonb(old_property), jsonb_build_object('name', normalized_name, 'code', normalized_code,
      'owner_person_id', p_owner_person_id, 'owner_started_on', p_owner_started_on,
      'owner_ownership_percent', p_owner_ownership_percent, 'owner_mode', p_owner_mode));
  RETURN p_property_id;
END;
$$;

ALTER FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid, date, numeric, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid, date, numeric, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid, date, numeric, text) TO authenticated;

CREATE FUNCTION public.update_property(
  p_property_id uuid, p_organization_id uuid, p_name text, p_code text,
  p_property_type text, p_owner text, p_address text, p_status text,
  p_acquisition_date date, p_notes text, p_owner_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_owner_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy import compatibility accepts only a null owner and preserves existing ownership'
      USING ERRCODE = '22023';
  END IF;
  RETURN public.update_property(
    p_property_id, p_organization_id, p_name, p_code, p_property_type,
    p_owner, p_address, p_status, p_acquisition_date, p_notes,
    NULL::uuid, NULL::date, NULL::numeric, 'preserve'::text
  );
END;
$$;

ALTER FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid) TO authenticated;
