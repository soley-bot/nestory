-- Legacy billing snapshots remain valid historical invoice evidence, but they
-- are not current Lease authority. An unused snapshot can be converted in
-- place using its immutable row id as the optimistic concurrency token. When
-- issued evidence uses the snapshot, preserve it and start lease_default_v1 at
-- the first unbilled Lease-local month.

DO $patch_save_legacy_authority$
DECLARE
  v_function constant regprocedure :=
    'public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old_complete constant text := $old$
    v_current_is_complete :=
      v_current.collection_route IS NOT NULL$old$;
  v_new_complete constant text := $new$
    v_current_is_complete :=
      v_current.rule_source = 'lease_default_v1'
      AND v_current.collection_route IS NOT NULL$new$;
  v_old_candidate constant text := $old$
      v_candidate_effective_from := (
        pg_catalog.date_trunc('month', v_local_date::timestamp)
        + interval '1 month'
      )::date;

      IF v_latest_billed_month IS NOT NULL THEN$old$;
  v_new_candidate constant text := $new$
      v_candidate_effective_from := (
        pg_catalog.date_trunc('month', v_local_date::timestamp)
        + CASE
          WHEN v_current.rule_source IN (
            'historical_policy_snapshot', 'unresolved_history'
          ) THEN interval '0 months'
          ELSE interval '1 month'
        END
      )::date;

      IF v_latest_billed_month IS NOT NULL THEN$new$;
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
        pg_catalog.replace(v_definition, v_old_complete, '')
      )
    ) / pg_catalog.length(v_old_complete) <> 1 THEN
    RAISE EXCEPTION 'Expected Lease billing completeness anchor is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
        pg_catalog.replace(v_definition, v_old_candidate, '')
      )
    ) / pg_catalog.length(v_old_candidate) <> 1 THEN
    RAISE EXCEPTION 'Expected Lease billing effective-month anchor is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_old_complete,
    v_new_complete
  );
  v_definition := pg_catalog.replace(
    v_definition,
    v_old_candidate,
    v_new_candidate
  );

  EXECUTE v_definition;
END;
$patch_save_legacy_authority$;

ALTER FUNCTION public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)
  SET search_path = '';
REVOKE ALL ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) TO authenticated;
