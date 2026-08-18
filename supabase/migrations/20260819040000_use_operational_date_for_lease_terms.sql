-- Lease activation already uses the organization's operational date. Keep the
-- authoritative term validators on that same clock so a local "today" lease
-- does not fail around UTC midnight.
CREATE OR REPLACE FUNCTION app_private.rent_business_date(
  p_organization_id uuid,
  p_clock timestamptz DEFAULT pg_catalog.now()
) RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (
    p_clock AT TIME ZONE coalesce(
      (
        SELECT policy.rent_calculation_timezone
        FROM public.rent_policy_versions AS policy
        WHERE policy.organization_id = p_organization_id
          AND policy.lifecycle = 'approved'
          AND policy.rent_calculation_timezone IS NOT NULL
          AND policy.effective_from <= (
            p_clock AT TIME ZONE policy.rent_calculation_timezone
          )::date
        ORDER BY
          policy.effective_from DESC,
          policy.version_number DESC,
          policy.id DESC
        LIMIT 1
      ),
      (
        SELECT organization.operational_timezone
        FROM public.organizations AS organization
        WHERE organization.id = p_organization_id
      ),
      'UTC'
    )
  )::date;
$$;

DO $migration$
DECLARE
  v_definition text;
  v_anchor text := replace($anchor$  IF v_status = 'active'
    AND current_date NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date'
      USING ERRCODE = '22023';
  END IF;

  IF v_status = 'upcoming' AND p_start_date <= current_date THEN
    RAISE EXCEPTION 'An upcoming term must start in the future'
      USING ERRCODE = '22023';
  END IF;$anchor$, E'\r\n', E'\n');
  v_replacement text := replace($replacement$  IF v_status = 'active'
    AND app_private.rent_business_date(
      p_organization_id,
      pg_catalog.statement_timestamp()
    ) NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date'
      USING ERRCODE = '22023';
  END IF;

  IF v_status = 'upcoming'
    AND p_start_date <= app_private.rent_business_date(
      p_organization_id,
      pg_catalog.statement_timestamp()
    ) THEN
    RAISE EXCEPTION 'An upcoming term must start in the future'
      USING ERRCODE = '22023';
  END IF;$replacement$, E'\r\n', E'\n');
  v_anchor_count integer;
  v_function constant regprocedure :=
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_function) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor);

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Unit Lease term date-validation anchor in %, found %',
      v_function,
      v_anchor_count;
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_anchor text := replace($anchor$  IF v_status = 'active' AND current_date NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'upcoming' AND p_start_date <= current_date THEN
    RAISE EXCEPTION 'An upcoming term must start in the future' USING ERRCODE = '22023';
  END IF;$anchor$, E'\r\n', E'\n');
  v_replacement text := replace($replacement$  IF v_status = 'active'
    AND app_private.rent_business_date(
      p_organization_id,
      pg_catalog.statement_timestamp()
    ) NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'upcoming'
    AND p_start_date <= app_private.rent_business_date(
      p_organization_id,
      pg_catalog.statement_timestamp()
    ) THEN
    RAISE EXCEPTION 'An upcoming term must start in the future' USING ERRCODE = '22023';
  END IF;$replacement$, E'\r\n', E'\n');
  v_anchor_count integer;
  v_function constant regprocedure :=
    'app_private.create_authoritative_property_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_function) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor);

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Property Lease term date-validation anchor in %, found %',
      v_function,
      v_anchor_count;
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;
