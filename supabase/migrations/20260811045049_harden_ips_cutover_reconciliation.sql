ALTER TABLE public.ips_cutover_batches
  ADD COLUMN reconciliation_differences jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ips_cutover_batches_reconciliation_differences_check
    CHECK (jsonb_typeof(reconciliation_differences) = 'array');

ALTER TABLE public.ips_cutover_reconciliations
  ADD COLUMN expected_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN actual_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ips_cutover_reconciliations_expected_counts_check
    CHECK (jsonb_typeof(expected_counts) = 'object'),
  ADD CONSTRAINT ips_cutover_reconciliations_actual_counts_check
    CHECK (jsonb_typeof(actual_counts) = 'object');

CREATE OR REPLACE FUNCTION app_private.assert_ips_cutover_manifest_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_count
  FROM (
    SELECT value->>'importType' AS import_type
    FROM jsonb_array_elements(NEW.manifest->'importRuns')
    GROUP BY value->>'importType'
  ) AS import_types
  WHERE import_type IN ('properties', 'units', 'people', 'leases');
  IF jsonb_array_length(NEW.manifest->'importRuns') <> 4 OR v_count <> 4 THEN
    RAISE EXCEPTION 'cutover_manifest_import_types_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(NEW.manifest->'tenantOpeningBalances') < 1 THEN
    RAISE EXCEPTION 'cutover_manifest_tenant_opening_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(NEW.manifest->'ownerOpeningComponents') < 4
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.manifest->'ownerOpeningComponents') AS opening(value)
      GROUP BY value->>'propertyCode', value->>'currency'
      HAVING count(*) <> 4
        OR count(DISTINCT value->>'component') <> 4
        OR count(*) FILTER (
          WHERE value->>'component' IN (
            'ips_held_owner_cash',
            'owner_due_to_ips',
            'ips_due_to_owner',
            'security_deposit_custody'
          )
        ) <> 4
    ) THEN
    RAISE EXCEPTION 'cutover_manifest_owner_components_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM (
    SELECT value->>'sourceKey' AS source_key FROM jsonb_array_elements(NEW.manifest->'importRuns')
    UNION ALL
    SELECT value->>'sourceKey' FROM jsonb_array_elements(NEW.manifest->'tenantOpeningBalances')
    UNION ALL
    SELECT value->>'sourceKey' FROM jsonb_array_elements(NEW.manifest->'ownerOpeningComponents')
    UNION ALL
    SELECT value->>'sourceKey' FROM jsonb_array_elements(NEW.manifest->'signedExceptions')
  ) AS source_keys
  GROUP BY source_key
  HAVING count(*) > 1
  LIMIT 1;
  IF v_count IS NOT NULL THEN
    RAISE EXCEPTION 'cutover_source_key_duplicate' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER assert_ips_cutover_manifest_shape
  BEFORE INSERT ON public.ips_cutover_batches
  FOR EACH ROW EXECUTE FUNCTION app_private.assert_ips_cutover_manifest_shape();

CREATE OR REPLACE FUNCTION public.get_ips_cutover_readiness(p_organization_id uuid, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id uuid := (SELECT auth.uid()); v_batch public.ips_cutover_batches%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'status', v_batch.status,
    'is_ready', v_batch.status = 'staged' AND v_batch.blocker_count = 0,
    'blockers',
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('source_key', source_key, 'issue_code', issue_code, 'issue_detail', issue_detail) ORDER BY source_key)
        FROM public.ips_cutover_items
        WHERE batch_id = v_batch.id AND validation_status = 'blocked'
      ), '[]'::jsonb)
      || CASE
        WHEN jsonb_array_length(v_batch.reconciliation_differences) > 0
          THEN jsonb_build_array(jsonb_build_object(
            'source_key', 'reconciliation',
            'issue_code', 'cutover_reconciliation_mismatch',
            'issue_detail', v_batch.reconciliation_differences
          ))
        ELSE '[]'::jsonb
      END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ips_cutover_batch(p_organization_id uuid, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor_id uuid := (SELECT auth.uid()); v_batch public.ips_cutover_batches%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'cutover_not_authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.ips_cutover_batches WHERE organization_id = p_organization_id AND id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_batch_not_found' USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object(
    'batch_id', v_batch.id, 'authority_start_date', v_batch.authority_start_date,
    'data_owner', v_batch.data_owner, 'manifest_sha256', v_batch.manifest_sha256,
    'status', v_batch.status, 'blocker_count', v_batch.blocker_count,
    'reconciliation_differences', v_batch.reconciliation_differences,
    'manifest', v_batch.manifest,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', item_kind, 'source_key', source_key, 'status', validation_status, 'issue_code', issue_code, 'payload', payload) ORDER BY item_kind, source_key) FROM public.ips_cutover_items WHERE batch_id = v_batch.id), '[]'::jsonb),
    'reconciliation', (SELECT jsonb_build_object(
      'id', id,
      'expected_counts', expected_counts,
      'actual_counts', actual_counts,
      'expected_totals', expected_totals,
      'actual_totals', actual_totals,
      'differences', differences,
      'sha256', reconciliation_sha256
    ) FROM public.ips_cutover_reconciliations WHERE batch_id = v_batch.id)
  );
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
  v_property_id uuid;
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

  FOR v_item IN SELECT payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'tenant_opening_balance' ORDER BY source_key LOOP
    SELECT lease.id, lease.property_id, (v_item.payload->>'currency')::public.currency_code
    INTO STRICT v_lease_id, v_property_id, v_currency
    FROM public.leases AS lease
    JOIN public.properties AS property ON property.organization_id = lease.organization_id AND property.id = lease.property_id
    JOIN public.units AS unit ON unit.organization_id = lease.organization_id AND unit.id = lease.unit_id
    WHERE lease.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode' AND unit.unit_number = v_item.payload->>'unitNumber' AND lease.archived_at IS NULL;
    FOR v_month IN SELECT jsonb_array_elements_text(v_item.payload->'selectedRentMonths') ORDER BY 1 LOOP
      PERFORM app_private.lock_open_property_financial_month(p_organization_id, v_property_id, v_currency, v_month::date);
    END LOOP;
  END LOOP;

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
      SELECT lease.id, lease.property_id, (v_item.payload->>'currency')::public.currency_code
      INTO STRICT v_lease_id, v_property_id, v_currency
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
        AND invoice.billing_period_start IN (SELECT value::date FROM jsonb_array_elements_text(v_item.payload->'selectedRentMonths'));
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, to_char(v_expected, 'FM999999999990.00'));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, to_char(v_actual, 'FM999999999990.00'));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'kind', 'money', 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;

    FOR v_item IN SELECT source_key, payload FROM public.ips_cutover_items WHERE batch_id = p_batch_id AND item_kind = 'owner_opening_component' ORDER BY source_key LOOP
      v_expected := (v_item.payload->>'amount')::numeric(14,2);
      SELECT coalesce(sum(entry.signed_amount), 0)::numeric(14,2) INTO v_actual
      FROM public.owner_opening_balance_entries AS entry
      JOIN public.owner_opening_balance_requests AS request ON request.organization_id = entry.organization_id AND request.id = entry.request_id
      JOIN public.properties AS property ON property.organization_id = entry.organization_id AND property.id = entry.property_id
      WHERE entry.organization_id = p_organization_id AND property.code = v_item.payload->>'propertyCode'
        AND request.source_reference = v_item.payload->>'sourceReference' AND entry.component::text = v_item.payload->>'component' AND entry.currency::text = v_item.payload->>'currency' AND request.status = 'approved';
      v_expected_totals := v_expected_totals || jsonb_build_object(v_item.source_key, to_char(v_expected, 'FM999999999990.00'));
      v_actual_totals := v_actual_totals || jsonb_build_object(v_item.source_key, to_char(v_actual, 'FM999999999990.00'));
      IF v_actual IS DISTINCT FROM v_expected THEN v_differences := v_differences || jsonb_build_array(jsonb_build_object('source_key', v_item.source_key, 'kind', 'money', 'expected', to_char(v_expected, 'FM999999999990.00'), 'actual', to_char(v_actual, 'FM999999999990.00'))); END IF;
    END LOOP;

    IF jsonb_array_length(v_differences) > 0 THEN
      RAISE EXCEPTION 'cutover_reconciliation_mismatch' USING ERRCODE = 'P0001', DETAIL = v_differences::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'cutover_reconciliation_mismatch' THEN RAISE; END IF;
    GET STACKED DIAGNOSTICS v_mismatch_detail = PG_EXCEPTION_DETAIL;
    PERFORM pg_catalog.set_config('app.ips_cutover_checked_write', 'on', true);
    UPDATE public.ips_cutover_batches
    SET status = 'blocked',
        blocker_count = jsonb_array_length(v_mismatch_detail::jsonb),
        reconciliation_differences = v_mismatch_detail::jsonb
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

ALTER FUNCTION app_private.assert_ips_cutover_manifest_shape() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_ips_cutover_manifest_shape() FROM PUBLIC, anon, authenticated, service_role;
