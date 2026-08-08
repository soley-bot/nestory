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
  v_unit_id uuid;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'Deposit event date is required'
      USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.reverse_lease_deposit_event(
  p_organization_id uuid,
  p_event_id uuid,
  p_event_date date,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_original public.lease_deposit_events%ROWTYPE;
  v_reversal public.lease_deposit_events%ROWTYPE;
  v_reversal_id uuid;
  v_unit_id uuid;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'Deposit reversal date is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT event.*
  INTO v_original
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit event not found' USING ERRCODE = '23503';
  END IF;

  IF v_original.ledger_entry_id IS NULL THEN
    RAISE EXCEPTION 'Original deposit Ledger event not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_event_date
  );

  v_reversal_id := app_private.reverse_lease_deposit_event(
    p_organization_id,
    p_event_id,
    p_event_date,
    p_reference
  );

  SELECT reversal.*
  INTO v_reversal
  FROM public.lease_deposit_events AS reversal
  WHERE reversal.organization_id = p_organization_id
    AND reversal.id = v_reversal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit reversal not found' USING ERRCODE = '23503';
  END IF;

  SELECT lease.unit_id
  INTO STRICT v_unit_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = v_reversal.lease_deposit_id;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_reversal.property_id,
    v_unit_id,
    v_reversal.event_date,
    CASE WHEN v_original.event_type = 'received' THEN 'expense' ELSE 'income' END,
    'Security deposit reversal - ' || replace(v_original.event_type, '_', ' '),
    v_reversal.amount,
    v_reversal.currency,
    v_reversal.reference,
    'deposit_event',
    v_reversal.id,
    v_actor_id,
    v_original.ledger_entry_id
  );

  UPDATE public.lease_deposit_events
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_reversal.id;

  RETURN v_reversal.id;
END;
$$;

DROP FUNCTION public.record_lease_deposit_event_operational_unchecked(
  uuid,
  uuid,
  text,
  date,
  numeric,
  text
);

DROP FUNCTION public.reverse_lease_deposit_event_operational_unchecked(
  uuid,
  uuid,
  date,
  text
);

REVOKE ALL ON FUNCTION public.record_lease_deposit_event(
  uuid, uuid, text, date, numeric, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event(
  uuid, uuid, text, date, numeric, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_lease_deposit_event(
  uuid, uuid, date, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_lease_deposit_event(
  uuid, uuid, date, text
) TO authenticated;
