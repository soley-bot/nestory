-- Track 4A correction round 4: movement-only future months participate in
-- canonical recovery locking and downstream nonnegative propagation.

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_recovery_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_from_month date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_month date;
BEGIN
  FOR v_month IN
    SELECT scope_month.month_start
    FROM (
      SELECT p_from_month AS month_start
      UNION
      SELECT period.month_start
      FROM public.owner_balance_periods AS period
      WHERE period.organization_id = p_organization_id
        AND period.property_id = p_property_id
        AND period.owner_person_id = p_owner_person_id
        AND period.currency = p_currency
        AND period.month_start >= p_from_month
      UNION
      SELECT series.month_start
      FROM public.owner_close_series AS series
      WHERE series.organization_id = p_organization_id
        AND series.property_id = p_property_id
        AND series.owner_person_id = p_owner_person_id
        AND series.currency = p_currency
        AND series.month_start >= p_from_month
      UNION
      SELECT movement.month_start
      FROM public.owner_component_movements AS movement
      WHERE movement.organization_id = p_organization_id
        AND movement.property_id = p_property_id
        AND movement.owner_person_id = p_owner_person_id
        AND movement.currency = p_currency
        AND movement.month_start >= p_from_month
    ) AS scope_month
    ORDER BY scope_month.month_start
  LOOP
    PERFORM app_private.lock_property_financial_month(
      p_organization_id, p_property_id, p_currency, v_month
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':', 'owner_balance_period_v1', p_organization_id::text,
          p_property_id::text, p_owner_person_id::text, p_currency::text,
          v_month::text
        ),
        0
      )
    );
  END LOOP;

  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );

  PERFORM 1
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start >= p_from_month
  ORDER BY period.month_start
  FOR UPDATE;

  PERFORM 1
  FROM public.owner_component_movements AS movement
  WHERE movement.organization_id = p_organization_id
    AND movement.property_id = p_property_id
    AND movement.owner_person_id = p_owner_person_id
    AND movement.currency = p_currency
    AND movement.month_start >= p_from_month
  ORDER BY movement.month_start, movement.id
  FOR KEY SHARE;
END;
$$;

ALTER FUNCTION app_private.lock_owner_close_recovery_scope(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_recovery_scope(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch_owner_close_correction_movement_only_scope$
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

  v_old := $old$
  FOR v_downstream IN
    SELECT
      period.month_start,
      coalesce(pg_catalog.sum(movement.signed_amount), 0)::numeric(14,2)
        AS complete_movements
    FROM public.owner_balance_periods AS period
    LEFT JOIN public.owner_component_movements AS movement
      ON movement.organization_id = period.organization_id
     AND movement.property_id = period.property_id
     AND movement.owner_person_id = period.owner_person_id
     AND movement.currency = period.currency
     AND movement.month_start = period.month_start
     AND movement.component = p_component
    WHERE period.organization_id = p_organization_id
      AND period.property_id = v_series.property_id
      AND period.owner_person_id = v_series.owner_person_id
      AND period.currency = v_series.currency
      AND period.month_start > v_series.month_start
    GROUP BY period.month_start
    ORDER BY period.month_start
  LOOP
$old$;
  v_new := $new$
  FOR v_downstream IN
    SELECT
      scope_month.month_start,
      coalesce(pg_catalog.sum(movement.signed_amount), 0)::numeric(14,2)
        AS complete_movements
    FROM (
      SELECT period.month_start
      FROM public.owner_balance_periods AS period
      WHERE period.organization_id = p_organization_id
        AND period.property_id = v_series.property_id
        AND period.owner_person_id = v_series.owner_person_id
        AND period.currency = v_series.currency
        AND period.month_start > v_series.month_start
      UNION
      SELECT movement_month.month_start
      FROM public.owner_component_movements AS movement_month
      WHERE movement_month.organization_id = p_organization_id
        AND movement_month.property_id = v_series.property_id
        AND movement_month.owner_person_id = v_series.owner_person_id
        AND movement_month.currency = v_series.currency
        AND movement_month.month_start > v_series.month_start
    ) AS scope_month
    LEFT JOIN public.owner_component_movements AS movement
      ON movement.organization_id = p_organization_id
     AND movement.property_id = v_series.property_id
     AND movement.owner_person_id = v_series.owner_person_id
     AND movement.currency = v_series.currency
     AND movement.month_start = scope_month.month_start
     AND movement.component = p_component
    GROUP BY scope_month.month_start
    ORDER BY scope_month.month_start
  LOOP
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_movement_only_scope_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_close_correction_movement_only_scope$;
