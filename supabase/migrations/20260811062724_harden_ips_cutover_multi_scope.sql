CREATE OR REPLACE FUNCTION app_private.is_canonical_ips_cutover_approval_timestamp(
  p_value text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_timestamp timestamptz;
BEGIN
  IF p_value IS NULL
    OR p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' THEN
    RETURN false;
  END IF;
  BEGIN
    v_timestamp := p_value::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN pg_catalog.to_char(
    v_timestamp AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
  ) = p_value;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.validate_ips_cutover_item(
  p_organization_id uuid,
  p_authority_start_date date,
  p_item_kind text,
  p_payload jsonb
)
RETURNS TABLE(validation_status text, issue_code text, issue_detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
  v_amount numeric(14,2);
  v_expected numeric(14,2);
  v_month text;
BEGIN
  IF p_item_kind = 'import_run' THEN
    IF coalesce(p_payload->>'sourceClaimHash', '') !~ '^[0-9a-f]{64}$'
      OR coalesce(p_payload->>'importType', '') NOT IN ('properties', 'units', 'people', 'leases')
      OR coalesce(p_payload->>'expectedCommittedRows', '') !~ '^[0-9]+$' THEN
      RETURN QUERY SELECT 'blocked', 'cutover_import_claim_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    SELECT count(*)::integer INTO v_count
    FROM public.import_runs AS run
    WHERE run.organization_id = p_organization_id
      AND run.import_type = p_payload->>'importType'
      AND run.source_claim_hash = p_payload->>'sourceClaimHash'
      AND run.status IN ('committed', 'committed_with_errors')
      AND run.failed_count = 0
      AND run.created_count + run.updated_count = (p_payload->>'expectedCommittedRows')::integer;
    IF v_count <> 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_import_run_not_reconciled', jsonb_build_object('matching_runs', v_count);
      RETURN;
    END IF;
  ELSIF p_item_kind = 'owner_opening_component' THEN
    IF coalesce(p_payload->>'currency', '') <> 'USD' THEN
      RETURN QUERY SELECT 'blocked', 'cutover_currency_unsupported', jsonb_build_object('currency', p_payload->>'currency', 'supported', jsonb_build_array('USD'));
      RETURN;
    END IF;
    IF coalesce(p_payload->>'amount', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$'
      OR coalesce(p_payload->>'sourceReference', '') = ''
      OR coalesce(p_payload->>'propertyCode', '') = ''
      OR coalesce(p_payload->>'component', '') NOT IN ('ips_held_owner_cash', 'owner_due_to_ips', 'ips_due_to_owner', 'security_deposit_custody') THEN
      RETURN QUERY SELECT 'blocked', 'cutover_owner_opening_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    v_expected := (p_payload->>'amount')::numeric(14,2);
    SELECT count(*)::integer, coalesce(sum(entry.signed_amount), 0)::numeric(14,2)
    INTO v_count, v_amount
    FROM public.owner_opening_balance_entries AS entry
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id AND request.id = entry.request_id
    JOIN public.properties AS property
      ON property.organization_id = entry.organization_id AND property.id = entry.property_id
    WHERE entry.organization_id = p_organization_id
      AND property.code = p_payload->>'propertyCode'
      AND request.source_reference = p_payload->>'sourceReference'
      AND entry.component::text = p_payload->>'component'
      AND entry.currency::text = p_payload->>'currency'
      AND request.status = 'approved';
    IF v_count < 1 OR v_amount IS DISTINCT FROM v_expected THEN
      RETURN QUERY SELECT 'blocked', 'cutover_owner_opening_mismatch', jsonb_build_object('actual', to_char(v_amount, 'FM999999999990.00'), 'expected', p_payload->>'amount', 'currency', p_payload->>'currency');
      RETURN;
    END IF;
  ELSIF p_item_kind = 'tenant_opening_balance' THEN
    IF coalesce(p_payload->>'currency', '') <> 'USD' THEN
      RETURN QUERY SELECT 'blocked', 'cutover_currency_unsupported', jsonb_build_object('currency', p_payload->>'currency', 'supported', jsonb_build_array('USD'));
      RETURN;
    END IF;
    IF coalesce(p_payload->>'expectedBalance', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$'
      OR coalesce(p_payload->>'propertyCode', '') = ''
      OR coalesce(p_payload->>'unitNumber', '') = ''
      OR jsonb_typeof(p_payload->'selectedRentMonths') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'selectedRentMonths') < 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_tenant_opening_invalid', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
    SELECT count(*)::integer INTO v_count
    FROM public.leases AS lease
    JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
    JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
    WHERE lease.organization_id = p_organization_id
      AND property.code = p_payload->>'propertyCode'
      AND unit.unit_number = p_payload->>'unitNumber'
      AND lease.archived_at IS NULL;
    IF v_count <> 1 THEN
      RETURN QUERY SELECT 'blocked', 'cutover_tenant_relationship_ambiguous', jsonb_build_object('matching_leases', v_count);
      RETURN;
    END IF;
    FOR v_month IN SELECT jsonb_array_elements_text(p_payload->'selectedRentMonths') LOOP
      IF v_month !~ '^[0-9]{4}-[0-9]{2}-01$' OR v_month::date >= p_authority_start_date THEN
        RETURN QUERY SELECT 'blocked', 'cutover_rent_month_invalid', jsonb_build_object('month_start', v_month);
        RETURN;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.leases AS lease
        JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
        JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
        JOIN public.lease_terms AS term ON term.organization_id = lease.organization_id AND term.lease_id = lease.id
        WHERE lease.organization_id = p_organization_id
          AND property.code = p_payload->>'propertyCode'
          AND unit.unit_number = p_payload->>'unitNumber'
          AND lease.archived_at IS NULL
          AND term.archived_at IS NULL
          AND term.status = 'active'
          AND term.effective_range @> v_month::date
          AND term.rent_currency::text = p_payload->>'currency'
      ) THEN
        RETURN QUERY SELECT 'blocked', 'cutover_currency_mismatch', jsonb_build_object('currency', p_payload->>'currency', 'month_start', v_month);
        RETURN;
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(p_payload->'selectedRentMonths')) AS month) <> jsonb_array_length(p_payload->'selectedRentMonths') THEN
      RETURN QUERY SELECT 'blocked', 'cutover_rent_month_duplicate', jsonb_build_object('months', p_payload->'selectedRentMonths');
      RETURN;
    END IF;
  ELSIF p_item_kind = 'signed_exception' THEN
    IF length(pg_catalog.btrim(coalesce(p_payload->>'reason', ''))) < 8
      OR length(pg_catalog.btrim(coalesce(p_payload->>'approvedBy', ''))) < 3
      OR NOT app_private.is_canonical_ips_cutover_approval_timestamp(p_payload->>'approvedAt') THEN
      RETURN QUERY SELECT 'blocked', 'cutover_exception_unsigned', jsonb_build_object('payload', p_payload);
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT 'blocked', 'cutover_item_kind_unsupported', jsonb_build_object('item_kind', p_item_kind);
    RETURN;
  END IF;
  RETURN QUERY SELECT 'ready', NULL::text, NULL::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.lock_ips_cutover_selected_months(
  p_organization_id uuid,
  p_batch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_scope record;
BEGIN
  IF p_organization_id IS NULL OR p_batch_id IS NULL THEN
    RAISE EXCEPTION 'cutover_month_scope_required' USING ERRCODE = '22004';
  END IF;
  FOR v_scope IN
    SELECT DISTINCT
      selected_month.value::date AS month_start,
      lease.property_id,
      (item.payload->>'currency')::public.currency_code AS currency
    FROM public.ips_cutover_items AS item
    JOIN public.leases AS lease
      ON lease.organization_id = item.organization_id
     AND lease.archived_at IS NULL
    JOIN public.properties AS property
      ON property.organization_id = lease.organization_id
     AND property.id = lease.property_id
     AND property.code = item.payload->>'propertyCode'
    JOIN public.units AS unit
      ON unit.organization_id = lease.organization_id
     AND unit.id = lease.unit_id
     AND unit.unit_number = item.payload->>'unitNumber'
    CROSS JOIN LATERAL jsonb_array_elements_text(item.payload->'selectedRentMonths') AS selected_month(value)
    WHERE item.organization_id = p_organization_id
      AND item.batch_id = p_batch_id
      AND item.item_kind = 'tenant_opening_balance'
    ORDER BY selected_month.value::date, lease.property_id, (item.payload->>'currency')::public.currency_code
  LOOP
    PERFORM app_private.lock_open_property_financial_month(
      p_organization_id,
      v_scope.property_id,
      v_scope.currency,
      v_scope.month_start
    );
  END LOOP;

  FOR v_scope IN
    SELECT DISTINCT lease.id
    FROM public.ips_cutover_items AS item
    JOIN public.leases AS lease
      ON lease.organization_id = item.organization_id
     AND lease.archived_at IS NULL
    JOIN public.properties AS property
      ON property.organization_id = lease.organization_id
     AND property.id = lease.property_id
     AND property.code = item.payload->>'propertyCode'
    JOIN public.units AS unit
      ON unit.organization_id = lease.organization_id
     AND unit.id = lease.unit_id
     AND unit.unit_number = item.payload->>'unitNumber'
    WHERE item.organization_id = p_organization_id
      AND item.batch_id = p_batch_id
      AND item.item_kind = 'tenant_opening_balance'
    ORDER BY lease.id
  LOOP
    PERFORM 1 FROM public.leases AS lease WHERE lease.id = v_scope.id FOR SHARE;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_ips_cutover_batch(
  p_organization_id uuid,
  p_batch_id uuid,
  p_signoff_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_batch public.ips_cutover_batches%ROWTYPE;
  v_claim record;
  v_item record;
  v_month text;
  v_lease_id uuid;
  v_currency public.currency_code;
  v_expected numeric(14,2);
  v_actual numeric(14,2);
  v_expected_count integer;
  v_actual_count integer;
  v_expected_counts jsonb := '{}'::jsonb;
  v_actual_counts jsonb := '{}'::jsonb;
  v_expected_totals jsonb := '{}'::jsonb;
  v_actual_totals jsonb := '{}'::jsonb;
  v_differences jsonb := '[]'::jsonb;
  v_mismatch_detail text;
  v_reconciliation_id uuid;
  v_reconciliation_hash text;
  v_result jsonb;
  v_payload jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  IF length(pg_catalog.btrim(coalesce(p_signoff_reason, ''))) < 8 THEN RAISE EXCEPTION 'cutover_signoff_required' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.lock_ips_cutover_scope(p_organization_id);
  v_payload := jsonb_build_object('batch_id', p_batch_id, 'signoff_reason', pg_catalog.btrim(p_signoff_reason));
  SELECT * INTO v_claim FROM app_private.claim_financial_idempotency(p_organization_id, 'commit_ips_cutover_batch', p_idempotency_key, v_actor_id, v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  IF v_batch.status <> 'staged' OR v_batch.blocker_count <> 0 THEN RAISE EXCEPTION 'cutover_batch_not_ready' USING ERRCODE = '23514'; END IF;

  PERFORM app_private.lock_ips_cutover_selected_months(p_organization_id, p_batch_id);

  BEGIN
    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'import_run' ORDER BY source_key LOOP
      v_expected_count := (v_item.payload->>'expectedCommittedRows')::integer;
      SELECT coalesce(sum(run.created_count + run.updated_count), 0)::integer INTO v_actual_count
      FROM public.import_runs AS run
      WHERE run.organization_id = p_organization_id
        AND run.import_type = v_item.payload->>'importType'
        AND run.source_claim_hash = v_item.payload->>'sourceClaimHash'
        AND run.status IN ('committed', 'committed_with_errors')
        AND run.failed_count = 0;
      v_expected_counts := v_expected_counts || jsonb_build_object(v_item.source_key, v_expected_count);
      v_actual_counts := v_actual_counts || jsonb_build_object(v_item.source_key, v_actual_count);
      IF v_actual_count IS DISTINCT FROM v_expected_count THEN
        v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'kind', 'count', 'expected', v_expected_count, 'actual', v_actual_count));
      END IF;
    END LOOP;

    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'tenant_opening_balance' ORDER BY source_key LOOP
      SELECT lease.id, (v_item.payload->>'currency')::public.currency_code
      INTO STRICT v_lease_id, v_currency
      FROM public.leases AS lease
      JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
      JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
      WHERE lease.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode' AND unit.unit_number = v_item.payload->>'unitNumber' AND lease.archived_at IS NULL
      FOR SHARE OF lease;
      FOR v_month IN SELECT jsonb_array_elements_text(v_item.payload->'selectedRentMonths') ORDER BY 1 LOOP
        PERFORM app_private.generate_lease_rent_invoice(p_organization_id, v_lease_id, v_month::date, v_month::date, 'manual_recovery', v_actor_id);
      END LOOP;
      v_expected := (v_item.payload->>'expectedBalance')::numeric(14,2);
      SELECT coalesce(sum(balance.balance_due), 0)::numeric(14,2) INTO v_actual
      FROM public.tenant_invoice_balances AS balance
      JOIN public.tenant_invoices AS invoice ON invoice.id = balance.id
      WHERE invoice.organization_id = p_organization_id AND invoice.lease_id = v_lease_id
        AND invoice.currency = v_currency
        AND invoice.billing_period_start IN (SELECT value::date FROM jsonb_array_elements_text(v_item.payload->'selectedRentMonths'));
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, jsonb_build_object('amount', to_char(v_expected, 'FM999999999990.00'), 'currency', v_currency::text));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, jsonb_build_object('amount', to_char(v_actual, 'FM999999999990.00'), 'currency', v_currency::text));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'kind', 'money', 'currency', v_currency::text, 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;

    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'owner_opening_component' ORDER BY source_key LOOP
      v_expected := (v_item.payload->>'amount')::numeric(14,2);
      v_currency := (v_item.payload->>'currency')::public.currency_code;
      SELECT coalesce(sum(entry.signed_amount), 0)::numeric(14,2) INTO v_actual
      FROM public.owner_opening_balance_entries AS entry
      JOIN public.owner_opening_balance_requests AS request ON request.organization_id = entry.organization_id AND request.id = entry.request_id
      JOIN public.properties AS property ON property.organization_id = entry.organization_id AND property.id = entry.property_id
      WHERE entry.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode'
        AND request.source_reference = v_item.payload->>'sourceReference' AND entry.component::text = v_item.payload->>'component' AND entry.currency = v_currency AND request.status = 'approved';
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, jsonb_build_object('amount', to_char(v_expected, 'FM999999999990.00'), 'currency', v_currency::text));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, jsonb_build_object('amount', to_char(v_actual, 'FM999999999990.00'), 'currency', v_currency::text));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'kind', 'money', 'currency', v_currency::text, 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;

    IF jsonb_array_length(v_differences) > 0 THEN
      RAISE EXCEPTION 'cutover_reconciliation_mismatch' USING ERRCODE = 'P0001', DETAIL = v_differences::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'cutover_reconciliation_mismatch' THEN RAISE; END IF;
    GET STACKED DIAGNOSTICS v_mismatch_detail = PG_EXCEPTION_DETAIL;
    PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
    UPDATE public.ips_cutover_batches
    SET status = 'blocked', blocker_count = jsonb_array_length(v_mismatch_detail::jsonb), reconciliation_differences = v_mismatch_detail::jsonb
    WHERE id = p_batch_id;
    INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
    VALUES (p_organization_id, p_batch_id, 'staged', 'blocked', 'Cutover reconciliation mismatch', v_actor_id);
    v_result := jsonb_build_object('batch_id', p_batch_id, 'status', 'blocked', 'blocker_count', jsonb_array_length(v_mismatch_detail::jsonb));
    PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
    RETURN v_result;
  END;

  v_reconciliation_hash := app_private.ips_cutover_sha256(jsonb_build_object(
    'manifest_sha256', v_batch.manifest_sha256,
    'expected_counts', v_expected_counts,
    'actual_counts', v_actual_counts,
    'expected_totals', v_expected_totals,
    'actual_totals', v_actual_totals,
    'differences', v_differences
  ));
  PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
  INSERT INTO public.ips_cutover_reconciliations (organization_id, batch_id, expected_counts, actual_counts, expected_totals, actual_totals, differences, reconciliation_sha256, reconciled_by)
  VALUES (p_organization_id, p_batch_id, v_expected_counts, v_actual_counts, v_expected_totals, v_actual_totals, v_differences, v_reconciliation_hash, v_actor_id)
  RETURNING id INTO v_reconciliation_id;
  UPDATE public.ips_cutover_batches SET status = 'reconciled', reconciled_at = now(), reconciled_by = v_actor_id, signoff_reason = pg_catalog.btrim(p_signoff_reason) WHERE id = p_batch_id;
  INSERT INTO public.ips_cutover_transitions (organization_id, batch_id, from_status, to_status, reason, actor_id)
  VALUES (p_organization_id, p_batch_id, 'staged', 'reconciled', pg_catalog.btrim(p_signoff_reason), v_actor_id);
  v_result := jsonb_build_object('batch_id', p_batch_id, 'reconciliation_id', v_reconciliation_id, 'reconciliation_sha256', v_reconciliation_hash, 'status', 'reconciled');
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id, p_organization_id, v_actor_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION app_private.is_canonical_ips_cutover_approval_timestamp(text) OWNER TO postgres;
ALTER FUNCTION app_private.validate_ips_cutover_item(uuid,date,text,jsonb) OWNER TO postgres;
ALTER FUNCTION app_private.lock_ips_cutover_selected_months(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.commit_ips_cutover_batch(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.is_canonical_ips_cutover_approval_timestamp(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.validate_ips_cutover_item(uuid,date,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_ips_cutover_selected_months(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
