-- `charge_through_lease_end = false` has never had a defined calculation
-- meaning. Preserve existing rows as repairable history, reject new false
-- snapshots, and prevent every live generation overload from silently treating
-- them as true.

DO $patch_normalization$
DECLARE
  v_function constant regprocedure :=
    'app_private.normalize_lease_billing_rule(uuid,uuid,date,jsonb)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text := $old$
  v_charge_through_lease_end :=
    (p_billing_rule ->> 'chargeThroughLeaseEnd')::boolean;

  IF v_billing_recipient_person_id IS NULL$old$;
  v_new text := $new$
  v_charge_through_lease_end :=
    (p_billing_rule ->> 'chargeThroughLeaseEnd')::boolean;

  IF NOT v_charge_through_lease_end THEN
    RAISE EXCEPTION 'Rent must run through the Lease end date'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END IF;

  IF v_billing_recipient_person_id IS NULL$new$;
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) / pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected Lease billing normalization anchor is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_normalization$;

-- A persisted false row is incomplete current authority. That lets an operator
-- repair it in place with the row id used as the optimistic concurrency token;
-- no historical row is rewritten by this migration itself.
DO $patch_repair$
DECLARE
  v_function constant regprocedure :=
    'public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text := 'AND v_current.charge_through_lease_end IS NOT NULL;';
  v_new text := 'AND v_current.charge_through_lease_end;';
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) / pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected Lease billing repair anchor is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_repair$;

-- Patch both the general six-argument historical path and the exact-rule
-- seven-argument current path. The guard is intentionally after the existing
-- invoice replay and rule lookup, but before recipient checks or financial
-- inserts, so issued evidence remains idempotent while new writes fail closed.
DO $patch_generation$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old constant text := E'\n  SELECT person.*';
  v_new constant text := $new$
  IF NOT v_billing.charge_through_lease_end THEN
    RAISE EXCEPTION 'Complete the Lease billing setup before generating rent'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_billing_charge_through_lease_end_required';
  END IF;

  SELECT person.*$new$;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure,
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'::regprocedure
  ] LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);

    IF (
        pg_catalog.length(v_definition)
        - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
      ) / pg_catalog.length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Expected Lease rent generation anchor is missing or ambiguous: %',
        v_function
        USING ERRCODE = '55000';
    END IF;

    EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
  END LOOP;
END;
$patch_generation$;
