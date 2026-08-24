-- A deposit amount on a Lease is an obligation, not proof that cash was
-- received. This checked wrapper preserves the existing Lease creation
-- authority and optionally records the first receipt and Ledger evidence in
-- the same transaction.

CREATE OR REPLACE FUNCTION app_private.record_lease_deposit_event(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deposit public.lease_deposits%ROWTYPE;
  v_event_id uuid;
  v_held_balance numeric;
  v_property_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_event_type NOT IN ('received', 'applied', 'retained', 'refunded') THEN
    RAISE EXCEPTION 'Unsupported deposit event type' USING ERRCODE = '22023';
  END IF;

  IF p_event_date IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Deposit event date and positive amount are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT deposit.*
  INTO v_deposit
  FROM public.lease_deposits AS deposit
  WHERE deposit.id = p_lease_deposit_id
    AND deposit.organization_id = p_organization_id
    AND deposit.archived_at IS NULL
  FOR UPDATE OF deposit;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease deposit not found' USING ERRCODE = '23503';
  END IF;

  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.id = v_deposit.lease_id
    AND lease.organization_id = p_organization_id
    AND lease.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF NOT app_private.can_access_property(
    p_organization_id,
    v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    sum(
      CASE
        WHEN event.event_type = 'received' THEN event.amount
        ELSE -event.amount
      END
    ),
    0
  )
  INTO v_held_balance
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.lease_deposit_id = p_lease_deposit_id
    AND event.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lease_deposit_events AS reversal
      WHERE reversal.reversal_of_id = event.id
    );

  IF p_event_type = 'received'
    AND v_held_balance + p_amount > v_deposit.amount THEN
    RAISE EXCEPTION 'Deposit receipts exceed the currently unheld obligation'
      USING ERRCODE = '22023';
  END IF;

  IF p_event_type <> 'received' AND p_amount > v_held_balance THEN
    RAISE EXCEPTION '% exceeds held deposit balance', initcap(p_event_type)
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lease_deposit_events (
    organization_id,
    property_id,
    lease_deposit_id,
    event_type,
    event_date,
    amount,
    currency,
    reference,
    created_by
  )
  VALUES (
    p_organization_id,
    v_property_id,
    v_deposit.id,
    p_event_type,
    p_event_date,
    p_amount,
    v_deposit.currency,
    NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid())
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION app_private.record_lease_deposit_event(
  uuid, uuid, text, date, numeric, text
) IS
  'Records property-scoped deposit activity for operators with leases.change_terms and caps new receipts against current cash held, allowing a later top-up after refund, retention, or reversal.';

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_event public.lease_deposit_events%ROWTYPE;
  v_event_id uuid;
  v_ledger_entry_id uuid;
  v_property_id uuid;
  v_unit_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'Deposit event date is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lease.property_id
  INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id
    AND deposit.archived_at IS NULL
    AND lease.archived_at IS NULL;

  IF v_property_id IS NULL
    OR NOT app_private.can_access_property(
      p_organization_id,
      v_property_id,
      'leases.change_terms'::public.organization_permission_key
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_event_date
  );

  v_event_id := app_private.record_lease_deposit_event(
    p_organization_id,
    p_lease_deposit_id,
    p_event_type,
    p_event_date,
    p_amount,
    p_reference
  );

  SELECT event.*
  INTO v_event
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.id = v_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit event not found' USING ERRCODE = '23503';
  END IF;

  SELECT lease.unit_id
  INTO STRICT v_unit_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = v_event.lease_deposit_id;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_event.property_id,
    v_unit_id,
    v_event.event_date,
    CASE WHEN v_event.event_type = 'received' THEN 'income' ELSE 'expense' END,
    'Security deposit - ' || replace(v_event.event_type, '_', ' '),
    v_event.amount,
    v_event.currency,
    v_event.reference,
    'deposit_event',
    v_event.id,
    v_actor_id,
    NULL
  );

  UPDATE public.lease_deposit_events
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_event.id;

  RETURN v_event.id;
END;
$$;

COMMENT ON FUNCTION public.record_lease_deposit_event(
  uuid, uuid, text, date, numeric, text
) IS
  'Records property-scoped deposit activity and matching Ledger evidence for operators with leases.change_terms.';

CREATE FUNCTION public.create_lease_with_deposit_receipt(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_relationship_payload jsonb,
  p_billing_rule jsonb,
  p_deposit_received boolean,
  p_deposit_received_amount numeric,
  p_deposit_received_on date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_deposit_event_id uuid;
  v_deposit_id uuid;
  v_lease_id uuid;
  v_received_amount numeric;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(p_deposit_received, false) THEN
    IF coalesce(p_deposit_amount, 0) <= 0 OR p_deposit_currency IS NULL THEN
      RAISE EXCEPTION 'A positive deposit obligation is required before recording receipt'
        USING ERRCODE = '22023';
    END IF;

    IF p_deposit_received_on IS NULL THEN
      RAISE EXCEPTION 'Deposit received date is required'
        USING ERRCODE = '22023';
    END IF;

    v_received_amount := coalesce(p_deposit_received_amount, p_deposit_amount);

    IF v_received_amount <= 0 OR v_received_amount > p_deposit_amount THEN
      RAISE EXCEPTION 'Deposit received amount must be positive and cannot exceed the obligation'
        USING ERRCODE = '22023';
    END IF;
  ELSIF p_deposit_received_amount IS NOT NULL OR p_deposit_received_on IS NOT NULL THEN
    RAISE EXCEPTION 'Deposit receipt details require an explicit received choice'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_lease_with_deposit_receipt',
    p_idempotency_key,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'primaryTenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status,
      'relationshipPayload', p_relationship_payload,
      'billingRule', p_billing_rule,
      'depositReceived', coalesce(p_deposit_received, false),
      'depositReceivedAmount', v_received_amount,
      'depositReceivedOn', p_deposit_received_on
    )
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  v_result := public.create_lease_with_billing_rules(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_term_status,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status,
    p_relationship_payload,
    p_billing_rule,
    p_idempotency_key
  );

  v_lease_id := (v_result ->> 'leaseId')::uuid;

  IF coalesce(p_deposit_received, false) THEN
    SELECT deposit.id
    INTO v_deposit_id
    FROM public.lease_deposits AS deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.lease_id = v_lease_id
      AND deposit.deposit_type = 'security'
      AND deposit.archived_at IS NULL
    ORDER BY deposit.created_at, deposit.id
    LIMIT 1
    FOR UPDATE;

    IF v_deposit_id IS NULL THEN
      RAISE EXCEPTION 'Lease deposit obligation not found'
        USING ERRCODE = '23503';
    END IF;

    v_deposit_event_id := public.record_lease_deposit_event(
      p_organization_id,
      v_deposit_id,
      'received',
      p_deposit_received_on,
      v_received_amount,
      'Recorded with lease creation'
    );

    v_result := v_result || pg_catalog.jsonb_build_object(
      'depositEventId', v_deposit_event_id
    );
  END IF;

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_lease_with_deposit_receipt(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb,
  boolean, numeric, date, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_lease_with_deposit_receipt(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb,
  boolean, numeric, date, text
) TO authenticated;

COMMENT ON FUNCTION public.create_lease_with_deposit_receipt(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, text, numeric, public.currency_code, text, jsonb, jsonb,
  boolean, numeric, date, text
) IS
  'Atomically creates the Lease deposit obligation and, only when explicitly selected, its initial received event and Ledger evidence.';
