-- A Lease deposit that already carries unreversed deposit activity owns real
-- cash evidence. Editing the Lease header must not silently rewrite that
-- obligation or archive the deposit away from its events and Ledger rows.
-- Correcting a settled deposit requires reversing its events first, matching
-- how property, Unit, and primary Tenant changes already fail closed here.

CREATE OR REPLACE FUNCTION "app_private"."update_lease_record_internal"("p_lease_id" "uuid", "p_organization_id" "uuid", "p_property_id" "uuid", "p_unit_id" "uuid", "p_primary_tenant_person_id" "uuid", "p_deposit_amount" numeric, "p_deposit_currency" "public"."currency_code", "p_status" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_deposit_id uuid;
  v_deposit_amount numeric;
  v_deposit_currency public.currency_code;
  v_settled_event_count integer;
  v_existing public.leases%ROWTYPE;
BEGIN
  SELECT lease.*
  INTO v_existing
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF (v_existing.property_id, v_existing.unit_id,
      v_existing.primary_tenant_person_id)
    IS DISTINCT FROM
      (p_property_id, p_unit_id, p_primary_tenant_person_id) THEN
    RAISE EXCEPTION
      'Property, Unit, and primary Tenant require an explicit transition workflow'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_relationship_transition_required';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_currency IS NULL THEN
    RAISE EXCEPTION 'Deposit currency is required when a deposit is recorded'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.leases
  SET deposit_amount = p_deposit_amount,
      deposit_currency = p_deposit_currency,
      status = lower(trim(p_status)),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_lease_id;

  SELECT deposit.id, deposit.amount, deposit.currency
  INTO v_deposit_id, v_deposit_amount, v_deposit_currency
  FROM public.lease_deposits AS deposit
  WHERE deposit.organization_id = p_organization_id
    AND deposit.lease_id = p_lease_id
    AND deposit.deposit_type = 'security'
    AND deposit.archived_at IS NULL
  ORDER BY deposit.created_at, deposit.id
  LIMIT 1
  FOR UPDATE;

  IF v_deposit_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_settled_event_count
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.lease_deposit_id = v_deposit_id
      AND event.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_deposit_events AS reversal
        WHERE reversal.reversal_of_id = event.id
      );

    IF v_settled_event_count > 0
      AND (
        p_deposit_amount IS NULL
        OR p_deposit_amount IS DISTINCT FROM v_deposit_amount
        OR p_deposit_currency IS DISTINCT FROM v_deposit_currency
      ) THEN
      RAISE EXCEPTION
        'Deposit already has recorded activity and cannot be changed here'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_deposit_activity_recorded';
    END IF;
  END IF;

  IF p_deposit_amount IS NULL THEN
    IF v_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET archived_at = now(),
          archived_by = v_actor_id,
          updated_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND id = v_deposit_id;
    END IF;
  ELSIF v_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      p_lease_id,
      'security',
      p_deposit_amount,
      p_deposit_currency,
      'held',
      v_actor_id,
      v_actor_id
    );
  ELSE
    UPDATE public.lease_deposits
    SET amount = p_deposit_amount,
        currency = p_deposit_currency,
        updated_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_deposit_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'lease',
    p_lease_id,
    'lease_updated',
    jsonb_build_object(
      'depositAmount', v_existing.deposit_amount,
      'depositCurrency', v_existing.deposit_currency,
      'status', v_existing.status
    ),
    jsonb_build_object(
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'status', lower(trim(p_status))
    )
  );

  RETURN p_lease_id;
END;
$$;

COMMENT ON FUNCTION "app_private"."update_lease_record_internal"("p_lease_id" "uuid", "p_organization_id" "uuid", "p_property_id" "uuid", "p_unit_id" "uuid", "p_primary_tenant_person_id" "uuid", "p_deposit_amount" numeric, "p_deposit_currency" "public"."currency_code", "p_status" "text") IS
  'Updates Lease header facts. Refuses to rewrite or archive a security deposit that still has unreversed deposit events.';
