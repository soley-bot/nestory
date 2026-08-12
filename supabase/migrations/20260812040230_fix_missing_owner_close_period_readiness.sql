ALTER FUNCTION app_private.build_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) RENAME TO build_owner_close_readiness_with_period_20260812;

CREATE FUNCTION app_private.build_owner_close_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_blockers jsonb := '[]'::jsonb;
  v_series public.owner_close_series%ROWTYPE;
BEGIN
  IF p_month_start IS NULL
    OR p_month_start <> pg_catalog.date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'owner_close_month_start_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_currency <> 'USD'::public.currency_code THEN
    RAISE EXCEPTION 'owner_close_currency_unsupported' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner_close_property_not_found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_owner_person_id
  ) THEN
    RAISE EXCEPTION 'owner_close_owner_not_found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = p_organization_id
      AND period.property_id = p_property_id
      AND period.owner_person_id = p_owner_person_id
      AND period.currency = p_currency
      AND period.month_start = p_month_start
  ) THEN
    RETURN app_private.build_owner_close_readiness_with_period_20260812(
      p_organization_id,
      p_property_id,
      p_owner_person_id,
      p_currency,
      p_month_start
    );
  END IF;

  IF NOT app_private.is_financial_month_locked(
    p_organization_id, p_month_start
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'financial_month_not_locked',
        'month_start', p_month_start::text
      )
    );
  END IF;
  v_blockers := v_blockers || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'code', 'owner_balance_period_missing',
      'property_id', p_property_id::text,
      'owner_person_id', p_owner_person_id::text,
      'month_start', p_month_start::text
    )
  );

  SELECT series.*
  INTO v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.property_id = p_property_id
    AND series.owner_person_id = p_owner_person_id
    AND series.currency = p_currency
    AND series.month_start = p_month_start;

  RETURN pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'month_start', p_month_start::text,
    'period_id', NULL,
    'series_id', CASE
      WHEN v_series.id IS NULL THEN NULL ELSE v_series.id::text
    END,
    'series_state', v_series.state,
    'is_ready', false,
    'blockers', v_blockers,
    'components', '[]'::jsonb,
    'input_watermark', NULL,
    'input_hash', NULL
  );
END;
$$;

ALTER FUNCTION app_private.build_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.build_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION app_private.build_owner_close_readiness_with_period_20260812(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION
  app_private.build_owner_close_readiness_with_period_20260812(
    uuid, uuid, uuid, public.currency_code, date
  ) FROM PUBLIC, anon, authenticated, service_role;
