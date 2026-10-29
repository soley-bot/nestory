-- Register identities use caller RLS. Ledger aggregates evaluate the exact
-- canonical SELECT predicate once per distinct property, rather than once per
-- entry. Only bounded identities / aggregate buckets cross PostgREST.
CREATE FUNCTION public.normalize_register_search(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT lower(btrim(regexp_replace(regexp_replace(normalize(coalesce(p_value, ''), NFKC), '\\[tnr]', ' ', 'g'), '[[:space:]]+', ' ', 'g')));
$function$;

CREATE FUNCTION public.matches_register_search(p_query text, p_values text[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(string_to_array(public.normalize_register_search(p_query), ' ')) AS token(value)
    WHERE token.value <> ''
      AND strpos(public.normalize_register_search(array_to_string(p_values, ' ')), token.value) = 0
      AND (translate(token.value, '#.-', '') = '' OR NOT EXISTS (
        SELECT 1 FROM unnest(p_values) AS item(value)
        CROSS JOIN LATERAL unnest(string_to_array(public.normalize_register_search(item.value), ' ')) AS word(value)
        WHERE strpos(translate(word.value, '#.-', ''), translate(token.value, '#.-', '')) > 0
      ))
  );
$function$;

-- Numeric runs sort by magnitude (P2 precedes P10) without an ICU dependency.
-- Equal natural keys always fall through to the immutable record identity.
CREATE FUNCTION public.register_natural_sort_key(p_value text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT coalesce(array_agg(CASE WHEN part[1] ~ '^[0-9]+$'
    THEN chr(1) || lpad(length(coalesce(nullif(ltrim(part[1], '0'), ''), '0'))::text, 8, '0') || coalesce(nullif(ltrim(part[1], '0'), ''), '0')
    ELSE part[1] END ORDER BY ordinal), ARRAY[]::text[])
  FROM regexp_matches(lower(regexp_replace(normalize(coalesce(p_value, ''), NFKD), U&'[\0300-\036f]', '', 'g')), '[0-9]+|[^0-9]+', 'g') WITH ORDINALITY AS parts(part, ordinal);
$function$;

-- This private reader factors the sole ledger SELECT policy without copying
-- its authority rules. Fail closed if that policy changes, including any new
-- restrictive policy, so a future policy cannot silently be bypassed here.
CREATE FUNCTION app_private.portfolio_ledger_totals(
  p_organization_id uuid,
  p_property_ids uuid[], p_unit_ids uuid[], p_period_start date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid = 'public.ledger_entries'::regclass AND polcmd IN ('r', '*')) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'public.ledger_entries'::regclass
        AND polname = 'ledger_entries_branch_select' AND polcmd = 'r' AND polpermissive
        AND polroles = ARRAY['authenticated'::regrole::oid]
        AND pg_catalog.pg_get_expr(polqual, polrelid) = 'app_private.can_read_finance_property(organization_id, property_id)'
    ) THEN
    RAISE EXCEPTION 'Ledger read policy changed; review aggregate authorization before continuing' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH scoped AS MATERIALIZED (
      SELECT 'property'::text AS scope_type, e.property_id AS scope_id, e.property_id, e.amount, e.currency, e.direction, e.category, e.transaction_date
      FROM public.ledger_entries e
      WHERE e.organization_id = p_organization_id AND e.archived_at IS NULL AND e.property_id = ANY(p_property_ids)
      UNION ALL
      SELECT 'unit', e.unit_id, e.property_id, e.amount, e.currency, e.direction, e.category, e.transaction_date
      FROM public.ledger_entries e
      WHERE e.organization_id = p_organization_id AND e.archived_at IS NULL AND e.unit_id = ANY(p_unit_ids)
    ), property_scope AS MATERIALIZED (
      SELECT DISTINCT property_id FROM scoped
    ), authorized AS MATERIALIZED (
      SELECT property_id FROM property_scope
      WHERE app_private.can_read_finance_property(p_organization_id, property_id)
    ), buckets AS (
      SELECT scope_type, scope_id, currency, direction,
        CASE WHEN p_period_start IS NOT NULL AND transaction_date >= p_period_start THEN p_period_start ELSE date '0001-01-01' END AS transaction_date,
        CASE WHEN p_period_start IS NULL THEN '' ELSE
          (CASE WHEN lower(category) LIKE '%rent%' OR lower(category) LIKE '%lease%' THEN 'rent ' ELSE '' END) ||
          (CASE WHEN lower(category) LIKE ANY(ARRAY['%maintenance%', '%repair%', '%renovation%', '%service%']) THEN 'maintenance' ELSE '' END)
        END AS category,
        amount
      FROM scoped JOIN authorized USING (property_id)
    ), totals AS (
      SELECT scope_type, scope_id, currency, direction, transaction_date, category, sum(amount) AS amount, count(*) AS entry_count
      FROM buckets GROUP BY scope_type, scope_id, currency, direction, transaction_date, category
    )
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY scope_type, scope_id, currency, direction, transaction_date, category), '[]'::jsonb) FROM totals t
  );
END;
$function$;

REVOKE ALL ON FUNCTION app_private.portfolio_ledger_totals(uuid, uuid[], uuid[], date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.portfolio_ledger_totals(uuid, uuid[], uuid[], date) TO authenticated;

CREATE FUNCTION public.get_portfolio_ledger_totals(
  p_organization_id uuid,
  p_property_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_unit_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_period_start date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF coalesce(cardinality(p_property_ids), 0) > 100 OR coalesce(cardinality(p_unit_ids), 0) > 100 THEN
    RAISE EXCEPTION 'At most 100 property and unit identities may be aggregated per request' USING ERRCODE = '22023';
  END IF;
  RETURN app_private.portfolio_ledger_totals(p_organization_id, p_property_ids, p_unit_ids, p_period_start);
END;
$function$;

CREATE FUNCTION public.get_property_register_page(
  p_organization_id uuid, p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_query text := coalesce(p_filters->>'query', '');
  v_sort text := coalesce(p_filters->>'sort', 'code_asc');
  v_archive text := coalesce(p_filters->>'archiveState', 'active');
  v_status text := coalesce(p_filters->>'status', 'all');
  v_owner text := coalesce(p_filters->>'ownerStatus', 'all');
  v_lease text := coalesce(p_filters->>'leaseStatus', 'all');
  v_net text := coalesce(p_filters->>'netStatus', 'all');
  v_review text := coalesce(p_filters->>'review', 'all');
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 10)));
BEGIN
  RETURN (
    WITH base AS MATERIALIZED (
      SELECT p.*, CASE
        WHEN regexp_replace(lower(btrim(p.status)), '[-[:space:]]+', '_', 'g') IN ('renovation', 'under_renovation') THEN 'under_renovation'
        WHEN lower(btrim(p.status)) = 'inactive' THEN 'inactive' ELSE 'active' END AS normalized_status
      FROM public.properties p
      WHERE p.organization_id = p_organization_id
        AND (v_archive = 'all' OR (v_archive = 'archived' AND p.archived_at IS NOT NULL) OR (v_archive = 'active' AND p.archived_at IS NULL))
    ), ledger_totals AS MATERIALIZED (
      SELECT b.scope_id, sum(CASE WHEN b.direction = 'expense' THEN -b.amount ELSE b.amount END) AS net
      FROM jsonb_to_recordset(CASE WHEN v_sort IN ('net_asc', 'net_desc') OR v_net <> 'all'
        THEN app_private.portfolio_ledger_totals(p_organization_id, ARRAY(SELECT id FROM base), ARRAY[]::uuid[], NULL)
        ELSE '[]'::jsonb END) AS b(scope_id uuid, direction text, amount numeric)
      GROUP BY b.scope_id
    ), candidates AS (
      SELECT p.*, coalesce(owners.names, CASE WHEN p.owner IS NOT NULL THEN ARRAY[p.owner] ELSE ARRAY[]::text[] END) AS owner_names,
        owners.primary_name, coalesce(owners.has_primary, false) AS has_primary,
        coalesce(units.active_count, 0) AS active_unit_count, coalesce(units.numbers, ARRAY[]::text[]) AS unit_numbers,
        coalesce(leases.lease_count, 0) AS lease_count, coalesce(leases.unit_count, 0) AS leased_unit_count,
        coalesce(ledger.net, 0) AS ledger_net
      FROM base p
      LEFT JOIN LATERAL (
        SELECT array_agg(coalesce(person.display_name, '') || ' ' || coalesce(person.legal_name, '') ORDER BY o.id) AS names,
          bool_or(o.is_primary) AS has_primary,
          (array_agg(coalesce(person.display_name, 'Linked owner') ORDER BY o.id DESC) FILTER (WHERE o.is_primary))[1] AS primary_name
        FROM public.property_owners o LEFT JOIN public.people person ON person.id = o.person_id AND person.organization_id = p_organization_id
        WHERE o.organization_id = p_organization_id AND o.property_id = p.id AND o.archived_at IS NULL AND o.ended_on IS NULL
          AND (v_query <> '' OR v_owner <> 'all')
      ) owners ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE u.archived_at IS NULL) AS active_count,
          array_agg(u.unit_number ORDER BY u.id) FILTER (WHERE v_query <> '') AS numbers
        FROM public.units u WHERE u.organization_id = p_organization_id AND u.property_id = p.id
          AND (v_query <> '' OR v_lease <> 'all' OR v_review = 'needs_units')
      ) units ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS lease_count, count(DISTINCT l.unit_id) AS unit_count FROM public.current_leases l
        WHERE l.organization_id = p_organization_id AND l.property_id = p.id AND l.archived_at IS NULL AND l.status IN ('active', 'notice_given')
          AND v_lease <> 'all'
      ) leases ON true
      LEFT JOIN ledger_totals ledger ON ledger.scope_id = p.id
      WHERE (v_status = 'all' OR p.normalized_status = v_status)
    ), filtered AS MATERIALIZED (
      SELECT p.* FROM candidates p WHERE
        (v_owner <> 'missing' OR NOT p.has_primary)
        AND (v_net <> 'negative' OR p.ledger_net < 0)
        AND (v_lease = 'all' OR (v_lease = 'missing') =
          CASE WHEN p.active_unit_count > 0 THEN p.active_unit_count > p.leased_unit_count ELSE p.lease_count = 0 END)
        AND (v_review <> 'needs_units' OR p.active_unit_count = 0)
        AND (v_review <> 'missing_address' OR coalesce(p.address, 'No address recorded') = 'No address recorded')
        AND (v_review <> 'missing_photos' OR (
          NOT EXISTS (SELECT 1 FROM public.asset_photos photo WHERE photo.organization_id = p_organization_id AND photo.property_id = p.id AND photo.unit_id IS NULL AND photo.archived_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.organization_id = p_organization_id AND d.property_id = p.id AND d.archived_at IS NULL AND d.mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
        ))
        AND public.matches_register_search(v_query,
          ARRAY[p.name, p.code, p.property_type, coalesce(p.primary_name, p.owner, 'Unassigned'), coalesce(p.address, 'No address recorded'), replace(p.normalized_status, '_', ' ')] || p.owner_names || p.unit_numbers)
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY
        CASE WHEN v_sort = 'net_asc' THEN ledger_net END ASC,
        CASE WHEN v_sort = 'net_desc' THEN ledger_net END DESC,
        CASE WHEN v_sort = 'name_asc' THEN public.register_natural_sort_key(name) END,
        CASE WHEN v_sort = 'status_asc' THEN public.register_natural_sort_key(normalized_status) END,
        public.register_natural_sort_key(code), id) AS position
      FROM filtered
    ), bounds AS (
      SELECT count(*) AS total_count, (least(greatest(coalesce(p_page, 1), 1)::bigint, greatest(1, (count(*) + v_size - 1) / v_size)) - 1) * v_size AS skip FROM filtered
    )
    SELECT jsonb_build_object('total_count', b.total_count, 'ids', coalesce((SELECT jsonb_agg(r.id ORDER BY r.position) FROM ranked r WHERE r.position > b.skip AND r.position <= b.skip + v_size), '[]'::jsonb)) FROM bounds b
  );
END;
$function$;

CREATE FUNCTION public.get_unit_register_page(
  p_organization_id uuid, p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_query text := coalesce(p_filters->>'query', '');
  v_sort text := coalesce(p_filters->>'sort', 'property_asc');
  v_archive text := coalesce(p_filters->>'archiveState', 'active');
  v_status text := coalesce(p_filters->>'status', 'all');
  v_property text := coalesce(p_filters->>'propertyId', 'all');
  v_lease text := coalesce(p_filters->>'leaseStatus', 'all');
  v_occupancy text := coalesce(p_filters->>'occupancy', 'all');
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 10)));
BEGIN
  RETURN (
    WITH property_records AS MATERIALIZED (
      -- Check each property's visibility once even when it has many units.
      SELECT p.id, p.code, p.name, p.owner FROM public.properties p
      WHERE p.organization_id = p_organization_id
        AND (v_property = 'all' OR p.id::text = v_property)
    ), base AS MATERIALIZED (
      SELECT u.*, coalesce(p.code, 'Unknown') AS property_code, coalesce(p.name, 'Unknown property') AS property_name, p.owner AS legacy_owner,
        CASE WHEN lower(btrim(u.status)) IN ('occupied', 'reserved', 'maintenance', 'inactive') THEN lower(btrim(u.status)) ELSE 'vacant' END AS normalized_status
      FROM public.units u LEFT JOIN property_records p ON p.id = u.property_id
      WHERE u.organization_id = p_organization_id
        AND (v_property = 'all' OR u.property_id::text = v_property)
        AND (v_archive = 'all' OR (v_archive = 'archived' AND u.archived_at IS NOT NULL) OR (v_archive = 'active' AND u.archived_at IS NULL))
    ), ledger_totals AS MATERIALIZED (
      SELECT b.scope_id, sum(CASE WHEN b.direction = 'expense' THEN -b.amount ELSE b.amount END) AS net
      FROM jsonb_to_recordset(CASE WHEN v_sort = 'net_desc'
        THEN app_private.portfolio_ledger_totals(p_organization_id, ARRAY[]::uuid[], ARRAY(SELECT id FROM base), NULL)
        ELSE '[]'::jsonb END) AS b(scope_id uuid, direction text, amount numeric)
      GROUP BY b.scope_id
    ), current_unit_leases AS MATERIALIZED (
      SELECT DISTINCT ON (l.unit_id) l.unit_id, l.status, l.tenant_name, l.monthly_rent_amount
      FROM public.current_leases l
      WHERE l.organization_id = p_organization_id AND l.archived_at IS NULL AND l.status IN ('active', 'notice_given', 'draft')
        AND l.unit_id IN (SELECT id FROM base)
      ORDER BY l.unit_id, (l.status IN ('active', 'notice_given')) DESC, l.lease_start_date DESC, l.id DESC
    ), candidates AS (
      SELECT u.*, l.status AS lease_status, coalesce(l.tenant_name || ' / ' || initcap(replace(l.status, '_', ' ')), 'No lease') AS lease_label,
        coalesce(l.status IN ('active', 'notice_given'), false) AS has_active_lease,
        CASE WHEN l.status IN ('active', 'notice_given') THEN coalesce(l.monthly_rent_amount, 0)
          WHEN u.current_rent_currency IS NOT NULL THEN coalesce(u.current_rent_amount, 0) ELSE 0 END AS rent,
        coalesce(owners.names, CASE WHEN u.legacy_owner IS NOT NULL THEN ARRAY[u.legacy_owner] ELSE ARRAY[]::text[] END) AS owner_names,
        owners.primary_name, event.title AS event_title, coalesce(ledger.net, 0) AS ledger_net
      FROM base u
      LEFT JOIN current_unit_leases l ON l.unit_id = u.id
      LEFT JOIN LATERAL (
        SELECT array_agg(coalesce(person.display_name, '') || ' ' || coalesce(person.legal_name, '') ORDER BY o.id) AS names,
          (array_agg(person.display_name ORDER BY o.id DESC) FILTER (WHERE o.is_primary))[1] AS primary_name
        FROM public.property_owners o LEFT JOIN public.people person ON person.id = o.person_id AND person.organization_id = p_organization_id
        WHERE o.organization_id = p_organization_id AND o.property_id = u.property_id AND o.archived_at IS NULL AND o.ended_on IS NULL AND v_query <> ''
      ) owners ON true
      LEFT JOIN LATERAL (
        SELECT t.title FROM public.timeline_events t WHERE t.organization_id = p_organization_id AND t.unit_id = u.id AND t.archived_at IS NULL AND v_query <> ''
        ORDER BY t.event_date DESC, t.id DESC LIMIT 1
      ) event ON true
      LEFT JOIN ledger_totals ledger ON ledger.scope_id = u.id
      WHERE v_status = 'all' OR u.normalized_status = v_status
    ), filtered AS MATERIALIZED (
      SELECT u.* FROM candidates u WHERE
        (v_lease <> 'missing' OR NOT has_active_lease)
        AND (v_occupancy = 'all' OR (v_occupancy = 'occupied' AND has_active_lease) OR (v_occupancy = 'unoccupied' AND NOT has_active_lease))
        AND public.matches_register_search(v_query, ARRAY[u.unit_number, u.property_code, u.property_name, u.primary_name,
          coalesce(u.floor, 'Not set'), replace(u.status, '_', ' '), u.lease_label, u.event_title] || u.owner_names)
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY
        CASE WHEN v_sort = 'rent_desc' THEN rent END DESC,
        CASE WHEN v_sort = 'net_desc' THEN ledger_net END DESC,
        CASE WHEN v_sort = 'status_asc' THEN NOT has_active_lease END,
        CASE WHEN v_sort = 'unit_asc' THEN public.register_natural_sort_key(unit_number) END,
        CASE WHEN v_sort = 'property_asc' THEN archived_at IS NOT NULL END,
        public.register_natural_sort_key(property_code),
        CASE WHEN v_sort = 'property_asc' THEN public.register_natural_sort_key(property_name) END,
        public.register_natural_sort_key(unit_number), id) AS position FROM filtered
    ), bounds AS (
      SELECT count(*) AS total_count, (least(greatest(coalesce(p_page, 1), 1)::bigint, greatest(1, (count(*) + v_size - 1) / v_size)) - 1) * v_size AS skip FROM filtered
    )
    SELECT jsonb_build_object('total_count', b.total_count, 'ids', coalesce((SELECT jsonb_agg(r.id ORDER BY r.position) FROM ranked r WHERE r.position > b.skip AND r.position <= b.skip + v_size), '[]'::jsonb)) FROM bounds b
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.normalize_register_search(text), public.matches_register_search(text, text[]), public.register_natural_sort_key(text), public.get_portfolio_ledger_totals(uuid, uuid[], uuid[], date), public.get_property_register_page(uuid, jsonb, integer, integer), public.get_unit_register_page(uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_register_search(text), public.matches_register_search(text, text[]), public.register_natural_sort_key(text), public.get_portfolio_ledger_totals(uuid, uuid[], uuid[], date), public.get_property_register_page(uuid, jsonb, integer, integer), public.get_unit_register_page(uuid, jsonb, integer, integer) TO authenticated;
