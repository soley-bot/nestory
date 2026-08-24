-- The prior corrective guard sat after the incomplete-billing compatibility
-- branch. Move it immediately after successful billing lookup so a persisted
-- false snapshot cannot reach that branch, while the earlier issued-invoice
-- replay remains unchanged.
DO $move_false_guard$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_late_guard constant text := $guard$
  IF NOT v_billing.charge_through_lease_end THEN
    RAISE EXCEPTION 'Complete the Lease billing setup before generating rent'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_billing_charge_through_lease_end_required';
  END IF;
$guard$;
  v_fallback_anchor constant text := E'\n  IF v_billing.collection_route IS NULL';
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure,
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure
  ] LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);

    IF (
        pg_catalog.length(v_definition)
        - pg_catalog.length(pg_catalog.replace(v_definition, v_late_guard, ''))
      ) / pg_catalog.length(v_late_guard) <> 1 THEN
      RAISE EXCEPTION 'Expected later Lease rent cutoff guard is missing or ambiguous: %',
        v_function
        USING ERRCODE = '55000';
    END IF;

    v_definition := pg_catalog.replace(v_definition, v_late_guard, '');

    IF (
        pg_catalog.length(v_definition)
        - pg_catalog.length(pg_catalog.replace(v_definition, v_fallback_anchor, ''))
      ) / pg_catalog.length(v_fallback_anchor) <> 1 THEN
      RAISE EXCEPTION 'Expected incomplete Lease billing fallback is missing or ambiguous: %',
        v_function
        USING ERRCODE = '55000';
    END IF;

    EXECUTE pg_catalog.replace(
      v_definition,
      v_fallback_anchor,
      v_late_guard || v_fallback_anchor
    );
  END LOOP;
END;
$move_false_guard$;
