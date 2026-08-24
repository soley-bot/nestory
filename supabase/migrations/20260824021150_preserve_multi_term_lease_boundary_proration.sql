-- Preserve next-full-month rate-change authority without allowing it to erase
-- lease-boundary proration. Both overloads share the same generated body, so
-- patch them fail closed from their exact current definitions.
DO $migration$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure,
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);

    v_old := $old$  v_lease record;
  v_line_id uuid := gen_random_uuid();$old$;
    v_new := $new$  v_lease record;
  v_lease_period_end date;
  v_lease_period_start date;
  v_line_id uuid := gen_random_uuid();$new$;

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) <> pg_catalog.length(v_old) THEN
      RAISE EXCEPTION
        'Expected one lease-boundary declaration anchor in %', v_function;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old, v_new);

    v_old := $old$  SELECT pg_catalog.count(*)::integer
  INTO v_term_count
  FROM public.lease_terms AS term$old$;
    v_new := $new$  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.min(term.start_date),
    pg_catalog.max(term.end_date)
  INTO v_term_count, v_lease_period_start, v_lease_period_end
  FROM public.lease_terms AS term$new$;

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) <> pg_catalog.length(v_old) THEN
      RAISE EXCEPTION
        'Expected one eligible-term aggregate anchor in %', v_function;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old, v_new);

    v_old := $old$  IF v_term_count > 1 THEN
    -- The only currently supported lease-owned change rule keeps the opening
    -- monthly rate until the following month.
    v_is_prorated := false;
    v_segment_rule := 'next_full_period';
  ELSIF pg_catalog.date_trunc('month', v_term.start_date)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF pg_catalog.date_trunc('month', v_term.end_date)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF v_term.start_date > p_billing_period_start
    OR v_term.end_date < v_period_end THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (
          least(v_term.end_date, v_period_end)
          - greatest(v_term.start_date, p_billing_period_start)
          + 1
        )
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  END IF;$old$;
    v_new := $new$  IF pg_catalog.date_trunc('month', v_lease_period_start)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF pg_catalog.date_trunc('month', v_lease_period_end)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
    v_segment_rule := 'billing_override';
  ELSIF v_lease_period_start > p_billing_period_start
    OR v_lease_period_end < v_period_end THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (
          least(v_lease_period_end, v_period_end)
          - greatest(v_lease_period_start, p_billing_period_start)
          + 1
        )
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  ELSIF v_term_count > 1 THEN
    -- Rate changes remain deferred until the next full month. The selected
    -- opening rate still observes the lease's outer start and end boundaries.
    v_is_prorated := false;
    v_segment_rule := 'next_full_period';
  END IF;$new$;

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) <> pg_catalog.length(v_old) THEN
      RAISE EXCEPTION
        'Expected one multi-term proration branch in %', v_function;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old, v_new);

    v_old := $old$    CASE WHEN v_term_count = 1 THEN v_segment_rule ELSE 'next_full_period' END,$old$;
    v_new := $new$    CASE WHEN term.id = v_term.id THEN v_segment_rule ELSE 'next_full_period' END,$new$;

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) <> pg_catalog.length(v_old) THEN
      RAISE EXCEPTION
        'Expected one rent-segment proration-rule anchor in %', v_function;
    END IF;
    v_definition := pg_catalog.replace(v_definition, v_old, v_new);

    EXECUTE v_definition;
  END LOOP;
END;
$migration$;
