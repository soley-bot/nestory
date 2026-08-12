DO $enforce_unresolved_owner_transfer_period_block$
DECLARE
  v_definition text;
  v_target text := $target$  IF v_pending_count > 0 THEN
    v_blocked_reason := 'source_allocation_incomplete';
    v_blocked_detail := pg_catalog.jsonb_build_object(
      'sources', v_blocked_detail
    );
  ELSIF v_blocked_reason IS NOT NULL AND v_blocked_detail IS NULL THEN
    v_blocked_detail := '{}'::jsonb;
  END IF;$target$;
  v_replacement text := $replacement$  DECLARE
    v_transfer_detail jsonb;
  BEGIN
    v_transfer_detail := app_private.get_unresolved_owner_transfer_detail(
      p_organization_id,
      p_property_id,
      p_owner_person_id,
      p_currency,
      p_month_start
    );

    IF v_transfer_detail IS NOT NULL THEN
      v_blocked_reason := 'unresolved_transfer';
      v_blocked_detail := v_transfer_detail;
    ELSIF v_pending_count > 0 THEN
      v_blocked_reason := 'source_allocation_incomplete';
      v_blocked_detail := pg_catalog.jsonb_build_object(
        'sources', v_blocked_detail
      );
    ELSIF v_blocked_reason IS NOT NULL AND v_blocked_detail IS NULL THEN
      v_blocked_detail := '{}'::jsonb;
    END IF;
  END;$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)'::regprocedure
  )
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_target) = 0 THEN
    RAISE EXCEPTION
      'generate_owner_balance_period transfer insertion point not found';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_target,
    v_replacement
  );
  EXECUTE v_definition;
END;
$enforce_unresolved_owner_transfer_period_block$;

ALTER FUNCTION app_private.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) FROM PUBLIC, anon, authenticated, service_role;
