-- A lease that starts and ends in one billing month has only one boundary.
-- Preserve any historical conflicting rows without rewriting them, reject all
-- new authoritative conflicts, and fail rent generation closed if an old row
-- is encountered.
CREATE FUNCTION app_private.assert_single_same_month_proration_override(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease_end date;
  v_lease_start date;
BEGIN
  IF p_organization_id IS NULL OR p_lease_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'lease_billing_rule_v2', p_organization_id, p_lease_id
      ),
      0
    )
  );

  SELECT pg_catalog.min(term.start_date), pg_catalog.max(term.end_date)
  INTO v_lease_start, v_lease_end
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status <> 'superseded'
    AND term.archived_at IS NULL;

  IF v_lease_start IS NOT NULL
    AND v_lease_end IS NOT NULL
    AND pg_catalog.date_trunc('month', v_lease_start::timestamp)::date =
      pg_catalog.date_trunc('month', v_lease_end::timestamp)::date
    AND EXISTS (
      SELECT 1
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = p_organization_id
        AND billing.lease_id = p_lease_id
        AND billing.rule_source = 'lease_default_v1'
        AND billing.archived_at IS NULL
        AND billing.first_period_prorated_amount IS NOT NULL
        AND billing.final_period_prorated_amount IS NOT NULL
    ) THEN
    RAISE EXCEPTION
      'Same-month leases allow only one explicit boundary proration override'
      USING ERRCODE = '23514',
        DETAIL = 'lease_same_month_proration_override_conflict';
  END IF;
END;
$$;

CREATE FUNCTION app_private.guard_same_month_billing_override_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_single_same_month_proration_override(
    NEW.organization_id,
    NEW.lease_id
  );
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_private.guard_same_month_lease_term_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM app_private.assert_single_same_month_proration_override(
      OLD.organization_id,
      OLD.lease_id
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM app_private.assert_single_same_month_proration_override(
      NEW.organization_id,
      NEW.lease_id
    );
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER guard_same_month_billing_override_write
AFTER INSERT OR UPDATE OF
  organization_id,
  lease_id,
  archived_at,
  rule_source,
  first_period_prorated_amount,
  final_period_prorated_amount
ON public.lease_billing_terms
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_same_month_billing_override_write();

CREATE TRIGGER guard_same_month_lease_term_write
AFTER INSERT OR UPDATE OF
  organization_id,
  lease_id,
  start_date,
  end_date,
  status,
  archived_at,
  authority_kind
ON public.lease_terms
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_same_month_lease_term_write();

CREATE TRIGGER guard_same_month_lease_term_delete
AFTER DELETE ON public.lease_terms
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_same_month_lease_term_write();

-- Both invoice-generator overloads currently share the same proration branch.
-- Patch the exact branch and fail migration application if either definition
-- has drifted.
DO $patch_generators$
DECLARE
  v_definition text;
  v_function regprocedure;
  v_new constant text := $new$  IF pg_catalog.date_trunc(
      'month', v_lease_period_start
    )::date = p_billing_period_start
    AND pg_catalog.date_trunc('month', v_lease_period_end)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    RAISE EXCEPTION
      'Same-month leases allow only one explicit boundary proration override'
      USING ERRCODE = '23514',
        DETAIL = 'lease_same_month_proration_override_conflict';
  END IF;

  IF pg_catalog.date_trunc('month', v_lease_period_start)::date =
      p_billing_period_start$new$;
  v_old constant text := $old$  IF pg_catalog.date_trunc('month', v_lease_period_start)::date =
      p_billing_period_start$old$;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure,
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) <> pg_catalog.length(v_old) THEN
      RAISE EXCEPTION
        'Expected one same-month proration anchor in %', v_function;
    END IF;
    EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
  END LOOP;
END;
$patch_generators$;

-- Surface the compatibility failure as a specific operational exception from
-- both guarded generation entry points.
DO $patch_try_generators$
DECLARE
  v_definition text;
  v_function regprocedure;
  v_new_code constant text := $new$    v_error_code := CASE
      WHEN v_error_message LIKE
        'Same-month leases allow only one explicit boundary proration override%'
        THEN 'billing_proration_override_conflict'
      WHEN v_error_message LIKE 'A Super Admin is required%' THEN$new$;
  v_new_message constant text := $new$    v_safe_message := CASE v_error_code
      WHEN 'billing_proration_override_conflict' THEN
        'Remove either the first-period or final-period override for this same-month Lease.'
      WHEN 'missing_super_admin' THEN$new$;
  v_old_code constant text := $old$    v_error_code := CASE
      WHEN v_error_message LIKE 'A Super Admin is required%' THEN$old$;
  v_old_message constant text := $old$    v_safe_message := CASE v_error_code
      WHEN 'missing_super_admin' THEN$old$;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure,
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old_code, ''))
    ) <> pg_catalog.length(v_old_code) THEN
      RAISE EXCEPTION
        'Expected one generation exception-code anchor in %', v_function;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old_code, v_new_code);

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old_message, ''))
    ) <> pg_catalog.length(v_old_message) THEN
      RAISE EXCEPTION
        'Expected one generation safe-message anchor in %', v_function;
    END IF;
    EXECUTE pg_catalog.replace(
      v_definition,
      v_old_message,
      v_new_message
    );
  END LOOP;
END;
$patch_try_generators$;

ALTER FUNCTION app_private.assert_single_same_month_proration_override(
  uuid, uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.assert_single_same_month_proration_override(
  uuid, uuid
) SET search_path = '';
ALTER FUNCTION app_private.guard_same_month_billing_override_write()
  OWNER TO postgres;
ALTER FUNCTION app_private.guard_same_month_billing_override_write()
  SET search_path = '';
ALTER FUNCTION app_private.guard_same_month_lease_term_write()
  OWNER TO postgres;
ALTER FUNCTION app_private.guard_same_month_lease_term_write()
  SET search_path = '';

REVOKE ALL ON FUNCTION app_private.assert_single_same_month_proration_override(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_same_month_billing_override_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_same_month_lease_term_write()
  FROM PUBLIC, anon, authenticated, service_role;
