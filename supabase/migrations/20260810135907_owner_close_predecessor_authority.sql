-- Track 4A correction round 2: evaluate correction capacity from current
-- predecessor/opening authority rather than a stale target-period snapshot.

DO $patch_owner_close_correction_predecessor_authority$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'public.record_owner_close_correction(uuid,uuid,public.owner_balance_component,date,numeric,text,text,text,text)'::regprocedure
    ), E'\r\n', E'\n'
  ) INTO v_definition;

  v_old := E'  v_authoritative_opening numeric(14,2);\n  v_complete_movements numeric(14,2);';
  v_new := E'  v_authoritative_opening numeric(14,2);\n  v_complete_movements numeric(14,2);\n  v_predecessor_period_id uuid;\n  v_opening_entry_count integer;';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_predecessor_declarations_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  PERFORM app_private.lock_owner_close_recovery_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
$old$;
  v_new := $new$
  PERFORM app_private.lock_owner_close_recovery_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency,
    (v_series.month_start - INTERVAL '1 month')::date
  );
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_recovery_scope_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  SELECT component.opening_amount
  INTO STRICT v_authoritative_opening
  FROM public.owner_balance_periods AS period
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start = v_series.month_start
    AND component.component = p_component
  FOR KEY SHARE OF component;
$old$;
  v_new := $new$
  SELECT period.id
  INTO v_predecessor_period_id
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start = (
      v_series.month_start - INTERVAL '1 month'
    )::date;

  IF v_predecessor_period_id IS NOT NULL THEN
    SELECT component.closing_amount
    INTO v_authoritative_opening
    FROM public.owner_balance_periods AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
    JOIN public.owner_close_series AS predecessor_series
      ON predecessor_series.organization_id = period.organization_id
     AND predecessor_series.property_id = period.property_id
     AND predecessor_series.owner_person_id = period.owner_person_id
     AND predecessor_series.currency = period.currency
     AND predecessor_series.month_start = period.month_start
    WHERE period.organization_id = p_organization_id
      AND period.id = v_predecessor_period_id
      AND period.status = 'closed'
      AND period.closed_revision_id IS NOT NULL
      AND predecessor_series.state = 'closed'
      AND predecessor_series.current_closed_revision_id = period.closed_revision_id
      AND predecessor_series.active_revision_id = period.closed_revision_id
      AND component.component = p_component
    FOR KEY SHARE OF component, predecessor_series;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'owner_close_correction_predecessor_not_current'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.owner_balance_periods AS earlier
      WHERE earlier.organization_id = p_organization_id
        AND earlier.property_id = v_series.property_id
        AND earlier.owner_person_id = v_series.owner_person_id
        AND earlier.currency = v_series.currency
        AND earlier.month_start < v_series.month_start
    ) THEN
      RAISE EXCEPTION 'owner_close_correction_predecessor_not_current'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = v_series.property_id
      AND entry.owner_person_id = v_series.owner_person_id
      AND entry.currency = v_series.currency
      AND entry.effective_date = v_series.month_start
      AND entry.component = p_component
    ORDER BY entry.created_at, entry.id
    FOR KEY SHARE;

    SELECT
      coalesce(pg_catalog.sum(entry.signed_amount), 0)::numeric(14,2),
      count(*)::integer
    INTO v_authoritative_opening, v_opening_entry_count
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = v_series.property_id
      AND entry.owner_person_id = v_series.owner_person_id
      AND entry.currency = v_series.currency
      AND entry.effective_date = v_series.month_start
      AND entry.component = p_component;

    IF v_opening_entry_count = 0 THEN
      RAISE EXCEPTION 'owner_close_correction_opening_not_current'
        USING ERRCODE = '23514';
    END IF;
  END IF;
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_opening_authority_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_close_correction_predecessor_authority$;
