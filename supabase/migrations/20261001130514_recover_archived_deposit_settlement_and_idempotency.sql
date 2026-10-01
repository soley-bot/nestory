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
    AND (lease.archived_at IS NULL OR (
      p_event_type = 'refunded' AND lease.status IN ('ended', 'terminated', 'cancelled')
    ));

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

CREATE OR REPLACE FUNCTION app_private.record_lease_deposit_event_legacy_checked_core(
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
    AND (lease.archived_at IS NULL OR (
      p_event_type = 'refunded' AND lease.status IN ('ended', 'terminated', 'cancelled')
    ));

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

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event_with_account(
  p_organization_id uuid,p_lease_deposit_id uuid,p_liability_account_id uuid,
  p_event_type text,p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid; v_lease_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  SELECT lease.property_id, lease.id INTO v_property_id, v_lease_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id=deposit.organization_id AND lease.id=deposit.lease_id
  WHERE deposit.organization_id=p_organization_id AND deposit.id=p_lease_deposit_id
    AND deposit.archived_at IS NULL AND (lease.archived_at IS NULL OR (
      p_event_type = 'refunded' AND lease.status IN ('ended', 'terminated', 'cancelled')
    ));
  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id,v_property_id,'leases.change_terms'::public.organization_permission_key
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_account_id:=app_private.resolve_chart_deposit_liability(
    p_organization_id,p_liability_account_id,v_property_id
  );
  v_event_id:=app_private.record_lease_deposit_event_legacy_checked_core(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
  UPDATE public.lease_deposit_events SET liability_account_id=v_account_id
  WHERE organization_id=p_organization_id AND id=v_event_id;
  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, new_values
  ) VALUES (
    p_organization_id, (SELECT auth.uid()), 'lease', v_lease_id,
    'lease_deposit_event_recorded', jsonb_build_object(
      'depositId', p_lease_deposit_id, 'eventId', v_event_id,
      'eventType', p_event_type, 'eventDate', p_event_date,
      'amount', p_amount, 'liabilityAccountId', v_account_id
    )
  );
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_lease_deposit_event_legacy_adapter(
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
  v_property_id uuid;
  v_account_id uuid;
  v_locked_account_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id
    AND deposit.archived_at IS NULL
    AND (lease.archived_at IS NULL OR (
      p_event_type = 'refunded' AND lease.status IN ('ended', 'terminated', 'cancelled')
    ));

  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id, v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT role.account_id INTO v_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits';
  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id, v_account_id, v_property_id
  );

  SELECT role.account_id INTO v_locked_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits'
  FOR SHARE;

  IF NOT FOUND OR v_locked_account_id IS DISTINCT FROM v_account_id THEN
    RAISE EXCEPTION 'Security deposit default changed. Retry the deposit recording.'
      USING ERRCODE = '40001';
  END IF;
  RETURN public.record_lease_deposit_event_with_account(
    p_organization_id, p_lease_deposit_id, v_account_id,
    p_event_type, p_event_date, p_amount, p_reference
  );
END;
$$;

CREATE FUNCTION public.record_lease_deposit_event_idempotent(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_liability_account_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property_id uuid;
  v_account_id uuid;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_event_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id AND deposit.archived_at IS NULL;

  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id, v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN ('received', 'retained', 'refunded')
    OR p_event_date IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_amount <> round(p_amount, 2)
    OR length(v_key) NOT BETWEEN 8 AND 200
    OR length(coalesce(v_reference, '')) > 200 THEN
    RAISE EXCEPTION 'Valid deposit activity and idempotency key are required'
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'depositId', p_lease_deposit_id, 'liabilityAccountId', p_liability_account_id,
    'eventType', p_event_type, 'eventDate', p_event_date,
    'amount', p_amount::numeric(14, 2), 'reference', v_reference
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'record_lease_deposit_event', v_key, v_actor_id, v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN (v_replay ->> 'eventId')::uuid;
  END IF;

  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id, p_liability_account_id, v_property_id
  );
  PERFORM app_private.lock_open_financial_month(p_organization_id, p_event_date);
  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id, 'record_lease_deposit_event', v_key, v_actor_id, v_payload
  );
  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'eventId')::uuid;
  END IF;

  v_event_id := public.record_lease_deposit_event_with_account(
    p_organization_id, p_lease_deposit_id, v_account_id,
    p_event_type, p_event_date, p_amount, v_reference
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id,
    jsonb_build_object('eventId', v_event_id)
  );
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_lease_deposit_event_idempotent(
  uuid, uuid, uuid, text, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event_idempotent(
  uuid, uuid, uuid, text, date, numeric, text, text
) TO authenticated;
