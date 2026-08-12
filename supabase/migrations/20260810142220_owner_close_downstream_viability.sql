-- Track 4A correction round 3: a correction that lowers one component must
-- preserve nonnegative authority through every known downstream period.

DO $patch_owner_close_correction_downstream_viability$
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

  v_old := E'  v_opening_entry_count integer;\n  v_correction_id uuid;';
  v_new := E'  v_opening_entry_count integer;\n  v_propagated_closing numeric(14,2);\n  v_downstream record;\n  v_correction_id uuid;';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_downstream_declarations_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  IF v_authoritative_opening + v_complete_movements + p_signed_amount < 0 THEN
    RAISE EXCEPTION 'owner_close_correction_negative_component'
      USING ERRCODE = '23514';
  END IF;

  SELECT roster.*
$old$;
  v_new := $new$
  v_propagated_closing := (
    v_authoritative_opening + v_complete_movements + p_signed_amount
  )::numeric(14,2);
  IF v_propagated_closing < 0 THEN
    RAISE EXCEPTION 'owner_close_correction_negative_component'
      USING ERRCODE = '23514';
  END IF;

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
    v_propagated_closing := (
      v_propagated_closing + v_downstream.complete_movements
    )::numeric(14,2);
    IF v_propagated_closing < 0 THEN
      RAISE EXCEPTION 'owner_close_correction_downstream_negative'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT roster.*
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_downstream_check_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_close_correction_downstream_viability$;
