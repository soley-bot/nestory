DO $migration$
DECLARE
  definition text;
  start_pos integer;
  end_pos integer;
BEGIN
  definition := pg_get_functiondef(
    'app_private.generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    '  v_lease public.leases%ROWTYPE;',
    '  v_lease record;'
  );

  start_pos := strpos(
    definition,
    E'  SELECT lease.*\n  INTO v_lease\n  FROM public.current_leases AS lease'
  );
  end_pos := strpos(definition, E'  IF NOT FOUND OR (');
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not replace rent-generation lease lookup';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  SELECT lease.*, person.display_name AS tenant_name\n'
    || E'  INTO v_lease\n'
    || E'  FROM public.leases AS lease\n'
    || E'  JOIN public.people AS person\n'
    || E'    ON person.organization_id = lease.organization_id\n'
    || E'    AND person.id = lease.primary_tenant_person_id\n'
    || E'  WHERE lease.organization_id = p_organization_id\n'
    || E'    AND lease.id = p_lease_id\n'
    || E'    AND lease.archived_at IS NULL\n'
    || E'  FOR SHARE OF lease, person;\n\n'
    || substring(definition FROM end_pos);

  start_pos := strpos(definition, E'  v_period_end := (');
  end_pos := strpos(
    definition,
    E'  IF v_term.payment_frequency IS DISTINCT FROM ''monthly'' THEN'
  );
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not replace rent-generation term selection';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  v_period_end := (\n'
    || E'    p_billing_period_start + interval ''1 month - 1 day''\n'
    || E'  )::date;\n\n'
    || E'  IF app_private.is_financial_month_locked(\n'
    || E'    p_organization_id,\n'
    || E'    p_billing_period_start\n'
    || E'  ) THEN\n'
    || E'    RAISE EXCEPTION ''This month is locked; unlock it before generating rent''\n'
    || E'      USING ERRCODE = ''55000'';\n'
    || E'  END IF;\n\n'
    || E'  SELECT count(*)::integer\n'
    || E'  INTO v_term_count\n'
    || E'  FROM public.lease_terms AS term\n'
    || E'  WHERE term.organization_id = p_organization_id\n'
    || E'    AND term.lease_id = p_lease_id\n'
    || E'    AND term.authority_kind = ''authoritative''\n'
    || E'    AND (\n'
    || E'      (\n'
    || E'        p_generation_source = ''manual_recovery''\n'
    || E'        AND term.status IN (''active'', ''upcoming'', ''expired'', ''terminated'')\n'
    || E'      )\n'
    || E'      OR (\n'
    || E'        p_generation_source <> ''manual_recovery''\n'
    || E'        AND term.status IN (''active'', ''upcoming'')\n'
    || E'      )\n'
    || E'    )\n'
    || E'    AND term.archived_at IS NULL\n'
    || E'    AND term.start_date <= v_period_end\n'
    || E'    AND term.end_date >= p_billing_period_start;\n\n'
    || E'  IF v_term_count <> 1 THEN\n'
    || E'    RAISE EXCEPTION ''Confirm one authoritative lease term for this month''\n'
    || E'      USING ERRCODE = ''23514'';\n'
    || E'  END IF;\n\n'
    || E'  SELECT term.*\n'
    || E'  INTO STRICT v_term\n'
    || E'  FROM public.lease_terms AS term\n'
    || E'  WHERE term.organization_id = p_organization_id\n'
    || E'    AND term.lease_id = p_lease_id\n'
    || E'    AND term.authority_kind = ''authoritative''\n'
    || E'    AND (\n'
    || E'      (\n'
    || E'        p_generation_source = ''manual_recovery''\n'
    || E'        AND term.status IN (''active'', ''upcoming'', ''expired'', ''terminated'')\n'
    || E'      )\n'
    || E'      OR (\n'
    || E'        p_generation_source <> ''manual_recovery''\n'
    || E'        AND term.status IN (''active'', ''upcoming'')\n'
    || E'      )\n'
    || E'    )\n'
    || E'    AND term.archived_at IS NULL\n'
    || E'    AND term.start_date <= v_period_end\n'
    || E'    AND term.end_date >= p_billing_period_start;\n\n'
    || E'  v_effective_date := greatest(\n'
    || E'    p_billing_period_start,\n'
    || E'    v_term.start_date\n'
    || E'  );\n\n'
    || substring(definition FROM end_pos);
  definition := replace(
    definition,
    'v_lease.lease_start_date',
    'v_term.start_date'
  );
  definition := replace(
    definition,
    'v_lease.lease_end_date',
    'v_term.end_date'
  );
  EXECUTE definition;

  definition := pg_get_functiondef(
    'app_private.try_current_month_rent(uuid,uuid,text,timestamp with time zone)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    'FROM public.current_leases AS lease',
    'FROM public.leases AS lease'
  );
  start_pos := strpos(
    definition,
    E'  IF v_lease.lease_start_date > v_period_end'
  );
  end_pos := strpos(definition, E'  SELECT membership.user_id');
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not remove lease-header date precheck';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || substring(definition FROM end_pos);
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)'::regprocedure
  );
  definition := replace(
    definition,
    '  v_lease public.leases%ROWTYPE;',
    '  v_lease public.current_leases%ROWTYPE;'
  );
  EXECUTE definition;
END;
$migration$;
