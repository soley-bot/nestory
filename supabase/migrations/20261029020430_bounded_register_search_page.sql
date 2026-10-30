-- Oversized register searches travel in a POST body, never as an unbounded
-- application-side scan. Only fixed sources, fields, operators and sorts can
-- enter the generated SQL. Every caller retains the source's RLS authority.
CREATE OR REPLACE FUNCTION public.get_bounded_register_page(
  p_organization_id uuid,
  p_entity text,
  p_groups jsonb,
  p_filters jsonb,
  p_sort text,
  p_offset integer,
  p_limit integer,
  p_effective_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_source text;
  v_types jsonb := '{"id":"uuid","property_id":"uuid","unit_id":"uuid"}'::jsonb;
  v_allowed_filters text[] := ARRAY['archive_state','id','property_id','unit_id'];
  v_order text;
  v_where text;
  v_group jsonb;
  v_condition jsonb;
  v_field text;
  v_operator text;
  v_value text;
  v_type text;
  v_alternatives text[];
  v_values text;
  v_pattern text;
  v_char text;
  v_escaped boolean;
  v_index integer;
  v_key text;
  v_date_field text;
  v_page jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 500
    OR jsonb_typeof(p_groups) IS DISTINCT FROM 'array' OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid register search request' USING ERRCODE = '22023';
  END IF;

  CASE p_entity
    WHEN 'documents' THEN
      v_source := 'public.documents';
      v_types := v_types || '{"file_name":"text","category":"text"}'::jsonb;
      v_allowed_filters := v_allowed_filters || ARRAY['lease_id','task_id'];
      IF p_sort IS DISTINCT FROM 'uploaded_desc' THEN RAISE EXCEPTION 'Invalid document sort' USING ERRCODE='22023'; END IF;
      v_order := 'r.uploaded_at DESC, r.id ASC';
    WHEN 'ledger' THEN
      v_source := 'public.ledger_entries';
      v_types := v_types || '{"category":"text","description":"text","direction":"text"}'::jsonb;
      v_allowed_filters := v_allowed_filters || ARRAY['direction','date_from','date_before','min_amount','financial_start_date'];
      v_date_field := 'transaction_date';
      v_order := CASE p_sort
        WHEN 'date_asc' THEN 'r.transaction_date ASC, r.created_at ASC, r.id ASC'
        WHEN 'date_desc' THEN 'r.transaction_date DESC, r.created_at DESC, r.id ASC'
        WHEN 'amount_asc' THEN 'r.amount ASC, r.transaction_date DESC, r.id ASC'
        WHEN 'amount_desc' THEN 'r.amount DESC, r.transaction_date DESC, r.id ASC'
        WHEN 'property_asc' THEN 'r.property_id ASC, r.transaction_date DESC, r.id ASC' END;
    WHEN 'timeline' THEN
      v_source := 'public.timeline_events';
      v_types := v_types || '{"title":"text","description":"text","lease_id":"uuid","ledger_entry_id":"uuid"}'::jsonb;
      v_allowed_filters := v_allowed_filters || ARRAY['date_from','date_to','event_type','scope','financial_start_date'];
      v_date_field := 'event_date';
      v_order := CASE p_sort
        WHEN 'date_asc' THEN 'r.event_date ASC, r.id ASC'
        WHEN 'date_desc' THEN 'r.event_date DESC, r.id DESC'
        WHEN 'type_asc' THEN 'r.event_type ASC, r.event_date DESC, r.id ASC'
        WHEN 'property_asc' THEN 'r.property_id ASC, r.event_date DESC, r.id ASC' END;
    WHEN 'leases' THEN
      IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Lease effective date is required' USING ERRCODE='22023'; END IF;
      -- Keep effective-rent calculations and their existing scoped authority.
      v_source := format('public.get_scoped_leases_with_effective_rent(%L::uuid,%L::date)', p_organization_id, p_effective_date);
      v_types := v_types || '{"tenant_name":"text","status":"text","monthly_rent_amount":"numeric","deposit_amount":"numeric","monthly_rent_currency":"text","deposit_currency":"text"}'::jsonb;
      v_allowed_filters := v_allowed_filters || ARRAY['status','tenant_missing','end_from','end_before','currency'];
      v_date_field := 'lease_end_date';
      v_order := CASE p_sort
        WHEN 'start_desc' THEN 'r.lease_start_date DESC, r.tenant_name ASC, r.id ASC'
        WHEN 'end_asc' THEN 'r.lease_end_date ASC, r.tenant_name ASC, r.id ASC'
        WHEN 'tenant_asc' THEN 'r.tenant_name ASC, r.lease_start_date DESC, r.id ASC'
        WHEN 'rent_desc' THEN 'r.monthly_rent_amount DESC, r.tenant_name ASC, r.id ASC'
        WHEN 'none' THEN 'r.id ASC' END;
      IF p_filters->>'archive_state' = 'all' AND p_sort NOT IN ('rent_desc','none') THEN
        v_order := 'r.archived_at ASC NULLS FIRST, ' || v_order;
      END IF;
    ELSE RAISE EXCEPTION 'Unsupported register entity' USING ERRCODE='22023';
  END CASE;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Invalid register sort' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE NOT k = ANY(v_allowed_filters)) THEN
    RAISE EXCEPTION 'Unsupported register filter' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_filters) f WHERE jsonb_typeof(f.value) NOT IN ('string','number','boolean','null')) THEN
    RAISE EXCEPTION 'Invalid register filter value' USING ERRCODE='22023';
  END IF;
  -- The scoped lease function already enforces its organization argument and
  -- deliberately does not expose organization_id in its public projection.
  v_where := CASE WHEN p_entity='leases' THEN 'true' ELSE format('r.organization_id = %L::uuid', p_organization_id) END;
  CASE coalesce(p_filters->>'archive_state','active')
    WHEN 'active' THEN v_where := v_where || ' AND r.archived_at IS NULL';
    WHEN 'archived' THEN v_where := v_where || ' AND r.archived_at IS NOT NULL';
    WHEN 'all' THEN NULL;
    ELSE RAISE EXCEPTION 'Invalid archive filter' USING ERRCODE='22023';
  END CASE;
  FOREACH v_key IN ARRAY ARRAY['id','property_id','unit_id','lease_id','task_id'] LOOP
    v_value := nullif(nullif(p_filters->>v_key,'all'),'');
    IF v_value IS NOT NULL THEN v_where := v_where || format(' AND r.%I = %L::uuid', v_key, v_value::uuid); END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['direction','event_type','currency'] LOOP
    v_value := nullif(nullif(p_filters->>v_key,'all'),'');
    IF v_value IS NOT NULL THEN
      v_where := v_where || format(' AND r.%I::text = %L', CASE WHEN v_key='currency' THEN 'monthly_rent_currency' ELSE v_key END, v_value);
    END IF;
  END LOOP;
  v_value := nullif(nullif(p_filters->>'status','all'),'');
  IF v_value='current' THEN v_where := v_where || ' AND r.status::text IN (''active'',''notice_given'')';
  ELSIF v_value IS NOT NULL THEN v_where := v_where || format(' AND r.status::text = %L', v_value); END IF;
  IF p_filters ? 'tenant_missing' AND jsonb_typeof(p_filters->'tenant_missing') <> 'boolean' THEN
    RAISE EXCEPTION 'Invalid tenant filter' USING ERRCODE='22023';
  END IF;
  IF p_filters->>'tenant_missing'='true' THEN v_where := v_where || ' AND r.primary_tenant_person_id IS NULL'; END IF;
  IF p_filters->>'min_amount' IS NOT NULL THEN
    v_where := v_where || format(' AND r.amount >= %L::numeric', (p_filters->>'min_amount')::numeric);
  END IF;
  FOREACH v_key IN ARRAY ARRAY['date_from','date_before','date_to','financial_start_date','end_from','end_before'] LOOP
    v_value := nullif(p_filters->>v_key,'');
    IF v_value IS NOT NULL THEN
      v_where := v_where || format(' AND r.%I %s %L::date', v_date_field,
        CASE WHEN v_key IN ('date_before','end_before') THEN '<' WHEN v_key='date_to' THEN '<=' ELSE '>=' END, v_value::date);
    END IF;
  END LOOP;
  IF p_entity='timeline' THEN
    CASE coalesce(p_filters->>'scope','global')
      WHEN 'global' THEN NULL;
      WHEN 'property' THEN NULL;
      WHEN 'maintenance' THEN v_where := v_where || ' AND r.event_type::text IN (''Maintenance'',''Repair'',''Renovation'',''Inspection'')';
      WHEN 'financial' THEN v_where := v_where || ' AND (r.ledger_entry_id IS NOT NULL OR r.cost_amount IS NOT NULL)';
      ELSE RAISE EXCEPTION 'Invalid timeline scope' USING ERRCODE='22023';
    END CASE;
  END IF;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    IF jsonb_typeof(v_group) <> 'array' OR jsonb_array_length(v_group)=0 THEN
      RAISE EXCEPTION 'Invalid register search group' USING ERRCODE='22023';
    END IF;
    v_alternatives := ARRAY[]::text[];
    FOR v_condition IN SELECT value FROM jsonb_array_elements(v_group) LOOP
      IF jsonb_typeof(v_condition) <> 'object' OR NOT (v_condition ?& ARRAY['field','operator','value']) OR
        EXISTS (SELECT 1 FROM jsonb_object_keys(v_condition) k WHERE k NOT IN ('field','operator','value')) THEN
        RAISE EXCEPTION 'Invalid register search condition' USING ERRCODE='22023';
      END IF;
      v_field := v_condition->>'field';
      v_operator := v_condition->>'operator';
      v_type := v_types->>v_field;
      IF v_type IS NULL THEN RAISE EXCEPTION 'Unsupported register search field' USING ERRCODE='22023'; END IF;
      IF v_operator='not.is' AND v_condition->'value'='null'::jsonb THEN
        v_alternatives := array_append(v_alternatives,format('r.%I IS NOT NULL',v_field));
      ELSIF v_operator='in' THEN
        IF jsonb_typeof(v_condition->'value') <> 'array' OR jsonb_array_length(v_condition->'value')=0 OR
          EXISTS (SELECT 1 FROM jsonb_array_elements(v_condition->'value') a WHERE jsonb_typeof(a) <> 'string') THEN
          RAISE EXCEPTION 'Invalid register search list' USING ERRCODE='22023';
        END IF;
        SELECT string_agg(format('%L',value),',') INTO v_values FROM jsonb_array_elements_text(v_condition->'value');
        v_alternatives := array_append(v_alternatives,format('r.%I::%s = ANY(ARRAY[%s]::%s[])',v_field,v_type,v_values,v_type));
      ELSIF v_operator IN ('eq','ilike') AND jsonb_typeof(v_condition->'value')='string' THEN
        v_value := v_condition->>'value';
        IF v_operator='eq' THEN
          v_alternatives := array_append(v_alternatives,format('r.%I::%s = %L::%s',v_field,v_type,v_value,v_type));
        ELSE
          IF v_type <> 'text' THEN RAISE EXCEPTION 'Unsupported text search field' USING ERRCODE='22023'; END IF;
          -- PostgREST accepts * as the % alias; escaped wildcards stay literal.
          v_pattern := ''; v_escaped := false;
          FOR v_index IN 1..length(v_value) LOOP
            v_char := substr(v_value,v_index,1);
            IF v_escaped THEN
              v_pattern := v_pattern || CASE WHEN v_char IN ('%','_',chr(92)) THEN chr(92) ELSE '' END || v_char;
              v_escaped := false;
            ELSIF v_char=chr(92) THEN v_escaped := true;
            ELSE v_pattern := v_pattern || CASE WHEN v_char='*' THEN '%' ELSE v_char END;
            END IF;
          END LOOP;
          IF v_escaped THEN v_pattern := v_pattern || chr(92) || chr(92); END IF;
          v_alternatives := array_append(v_alternatives,format('r.%I::text ILIKE %L',v_field,v_pattern));
        END IF;
      ELSE RAISE EXCEPTION 'Unsupported register search operator' USING ERRCODE='22023';
      END IF;
    END LOOP;
    v_where := v_where || ' AND (' || array_to_string(v_alternatives,' OR ') || ')';
  END LOOP;
  -- Count and page share one source evaluation and snapshot. Ranking stays in
  -- PostgreSQL; neither the source rows nor all matching IDs reach the app.
  EXECUTE format($query$
    WITH matching AS MATERIALIZED (
      SELECT r.id, row_number() OVER (ORDER BY %s) AS position FROM %s r WHERE %s
    ), totals AS (SELECT count(*) AS total FROM matching), page AS (
      SELECT matching.id, matching.position FROM matching CROSS JOIN totals
      WHERE matching.position > least(%s::bigint,greatest(0,(totals.total-1)/%s)*%s)
      ORDER BY matching.position LIMIT %s
    )
    SELECT jsonb_build_object('ids',coalesce((SELECT jsonb_agg(page.id ORDER BY page.position) FROM page),'[]'::jsonb),'total_count',totals.total)
    FROM totals
  $query$,v_order,v_source,v_where,p_offset,p_limit,p_limit,p_limit) INTO v_page;
  RETURN v_page;
END;
$$;
REVOKE ALL ON FUNCTION public.get_bounded_register_page(uuid,text,jsonb,jsonb,text,integer,integer,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bounded_register_page(uuid,text,jsonb,jsonb,text,integer,integer,date) TO authenticated;
COMMENT ON FUNCTION public.get_bounded_register_page(uuid,text,jsonb,jsonb,text,integer,integer,date) IS
  'Bounded register search page and exact count; fixed grammar, caller RLS, scoped effective-rent lease source.';
