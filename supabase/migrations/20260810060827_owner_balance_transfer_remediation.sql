CREATE OR REPLACE FUNCTION app_private.get_unresolved_owner_transfer_detail(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH successor AS MATERIALIZED (
    SELECT assignment.started_on
    FROM public.property_owners AS assignment
    WHERE assignment.organization_id = p_organization_id
      AND assignment.property_id = p_property_id
      AND assignment.person_id = p_owner_person_id
      AND assignment.archived_at IS NULL
      AND assignment.started_on < (p_month_start + INTERVAL '1 month')::date
      AND (assignment.ended_on IS NULL OR assignment.ended_on > p_month_start)
    ORDER BY assignment.started_on DESC, assignment.id
    LIMIT 1
  ), predecessor_periods AS MATERIALIZED (
    SELECT
      predecessor.person_id AS previous_owner_person_id,
      successor.started_on AS ownership_started_on,
      prior_period.id AS owner_balance_period_id
    FROM successor
    JOIN public.property_owners AS predecessor
      ON predecessor.organization_id = p_organization_id
      AND predecessor.property_id = p_property_id
      AND predecessor.person_id <> p_owner_person_id
      AND predecessor.archived_at IS NULL
      AND predecessor.ended_on = successor.started_on
    JOIN LATERAL (
      SELECT period.id
      FROM public.owner_balance_periods AS period
      WHERE period.organization_id = p_organization_id
        AND period.property_id = p_property_id
        AND period.owner_person_id = predecessor.person_id
        AND period.currency = p_currency
        AND period.month_start < pg_catalog.date_trunc(
          'month', successor.started_on
        )::date
        AND period.status IN ('ready', 'stale', 'closed')
      ORDER BY period.month_start DESC, period.id
      LIMIT 1
    ) AS prior_period ON true
  ), unresolved AS MATERIALIZED (
    SELECT
      predecessor_periods.previous_owner_person_id,
      predecessor_periods.ownership_started_on,
      component.component,
      component.closing_amount
    FROM predecessor_periods
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = p_organization_id
      AND component.owner_balance_period_id = predecessor_periods.owner_balance_period_id
    WHERE component.closing_amount <> 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_transfer_instructions AS instruction
        WHERE instruction.organization_id = p_organization_id
          AND instruction.property_id = p_property_id
          AND instruction.from_owner_person_id = predecessor_periods.previous_owner_person_id
          AND instruction.to_owner_person_id = p_owner_person_id
          AND instruction.currency = p_currency
          AND instruction.component = component.component
          AND instruction.effective_date >= predecessor_periods.ownership_started_on
          AND instruction.effective_date < (p_month_start + INTERVAL '1 month')::date
      )
  )
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE pg_catalog.jsonb_build_object(
    'previous_owner_person_id', CASE
      WHEN count(DISTINCT previous_owner_person_id) = 1
        THEN min(previous_owner_person_id::text)
      ELSE NULL
    END,
    'previous_owner_person_ids', pg_catalog.to_jsonb(
      ARRAY(
        SELECT DISTINCT item.previous_owner_person_id::text
        FROM unresolved AS item
        ORDER BY item.previous_owner_person_id::text
      )
    ),
    'ownership_started_on', min(ownership_started_on)::text,
    'unsettled_component_count', count(*),
    'unsettled_components', pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'previous_owner_person_id', previous_owner_person_id::text,
        'component', component::text,
        'closing_amount', pg_catalog.to_char(closing_amount, 'FM999999999990.00')
      )
      ORDER BY previous_owner_person_id::text, component::text
    ),
    'setup_path', '/balances'
  ) END
  FROM unresolved;
$$;

ALTER FUNCTION app_private.get_unresolved_owner_transfer_detail(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.get_unresolved_owner_transfer_detail(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.apply_owner_transfer_remediation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_detail jsonb;
BEGIN
  IF NEW.status = 'blocked' THEN
    v_detail := app_private.get_unresolved_owner_transfer_detail(
      NEW.organization_id,
      NEW.property_id,
      NEW.owner_person_id,
      NEW.currency,
      NEW.month_start
    );
    IF v_detail IS NOT NULL THEN
      NEW.blocked_reason_code := 'unresolved_transfer';
      NEW.blocked_reason_detail := v_detail;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.apply_owner_transfer_remediation() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.apply_owner_transfer_remediation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER owner_balance_period_transfer_remediation
  BEFORE INSERT OR UPDATE ON public.owner_balance_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.apply_owner_transfer_remediation();

ALTER FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) SET SCHEMA app_private;
REVOKE ALL ON FUNCTION app_private.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_owner_balance_period(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_period public.owner_balance_periods%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_balance_generation_forbidden' USING ERRCODE = '42501';
  END IF;

  v_result := app_private.generate_owner_balance_period(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_month_start,
    p_idempotency_key
  );

  IF v_result->>'period_id' IS NOT NULL THEN
    SELECT period.*
    INTO v_period
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = p_organization_id
      AND period.id = (v_result->>'period_id')::uuid;

    IF v_period.id IS NOT NULL THEN
      v_result := pg_catalog.jsonb_set(
        v_result,
        '{status}',
        pg_catalog.to_jsonb(v_period.status),
        true
      );
      v_result := pg_catalog.jsonb_set(
        v_result,
        '{blocked_reason_code}',
        coalesce(pg_catalog.to_jsonb(v_period.blocked_reason_code), 'null'::jsonb),
        true
      );
      v_result := pg_catalog.jsonb_set(
        v_result,
        '{blocked_reason_detail}',
        coalesce(v_period.blocked_reason_detail, 'null'::jsonb),
        true
      );
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) TO authenticated;
