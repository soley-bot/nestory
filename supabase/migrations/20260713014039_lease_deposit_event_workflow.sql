CREATE OR REPLACE FUNCTION public.record_finance_receipt(p_organization_id uuid,p_income_item_id uuid,p_amount numeric,p_received_date date,p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN RETURN app_private.record_finance_receipt($1,$2,$3,$4,$5); END $$;
CREATE OR REPLACE FUNCTION public.record_finance_payment(p_organization_id uuid,p_expense_item_id uuid,p_amount numeric,p_paid_date date,p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN RETURN app_private.record_finance_payment($1,$2,$3,$4,$5); END $$;
CREATE OR REPLACE FUNCTION public.reverse_finance_receipt(p_organization_id uuid,p_receipt_id uuid,p_reversal_date date,p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN RETURN app_private.reverse_finance_receipt($1,$2,$3,$4); END $$;
CREATE OR REPLACE FUNCTION public.reverse_finance_payment(p_organization_id uuid,p_payment_id uuid,p_reversal_date date,p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN RETURN app_private.reverse_finance_payment($1,$2,$3,$4); END $$;

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
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_deposit public.lease_deposits%ROWTYPE;
  target_property_id uuid;
  held_balance numeric;
  received_balance numeric;
  new_event_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_event_type NOT IN ('received', 'applied', 'retained', 'refunded') THEN
    RAISE EXCEPTION 'Unsupported deposit event type' USING ERRCODE = '22023';
  END IF;
  IF p_event_date IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Deposit event date and positive amount are required' USING ERRCODE = '22023';
  END IF;

  SELECT deposit.*
  INTO target_deposit
  FROM public.lease_deposits AS deposit
  WHERE deposit.id = p_lease_deposit_id
    AND deposit.organization_id = p_organization_id
    AND deposit.archived_at IS NULL
  FOR UPDATE OF deposit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease deposit not found';
  END IF;
  SELECT lease.property_id INTO target_property_id
  FROM public.leases AS lease
  WHERE lease.id = target_deposit.lease_id
    AND lease.organization_id = p_organization_id
    AND lease.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  SELECT
    coalesce(sum(CASE WHEN event.event_type = 'received' THEN event.amount ELSE -event.amount END), 0),
    coalesce(sum(CASE WHEN event.event_type = 'received' THEN event.amount ELSE 0 END), 0)
  INTO held_balance, received_balance
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.lease_deposit_id = p_lease_deposit_id
    AND event.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lease_deposit_events AS reversal
      WHERE reversal.reversal_of_id = event.id
    );

  IF p_event_type = 'received' AND received_balance + p_amount > target_deposit.amount THEN
    RAISE EXCEPTION 'Deposit receipts exceed the deposit obligation';
  END IF;
  IF p_event_type <> 'received' AND p_amount > held_balance THEN
    RAISE EXCEPTION '% exceeds held deposit balance', initcap(p_event_type);
  END IF;

  INSERT INTO public.lease_deposit_events (
    organization_id, property_id, lease_deposit_id, event_type, event_date,
    amount, currency, reference, created_by
  ) VALUES (
    p_organization_id, target_property_id, target_deposit.id, p_event_type,
    p_event_date, p_amount, target_deposit.currency,
    NULLIF(trim(coalesce(p_reference, '')), ''), (SELECT auth.uid())
  ) RETURNING id INTO new_event_id;
  RETURN new_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.reverse_lease_deposit_event(
  p_organization_id uuid,
  p_event_id uuid,
  p_event_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.lease_deposit_events%ROWTYPE;
  new_event_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO target FROM public.lease_deposit_events
  WHERE id = p_event_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit event not found'; END IF;
  IF target.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.lease_deposit_events WHERE reversal_of_id = target.id) THEN
    RAISE EXCEPTION 'Deposit event is already reversed';
  END IF;
  INSERT INTO public.lease_deposit_events (
    organization_id, property_id, lease_deposit_id, event_type, event_date,
    amount, currency, reference, reversal_of_id, created_by
  ) VALUES (
    target.organization_id, target.property_id, target.lease_deposit_id,
    'reversed', p_event_date, target.amount, target.currency,
    NULLIF(trim(coalesce(p_reference, '')), ''), target.id, (SELECT auth.uid())
  ) RETURNING id INTO new_event_id;
  RETURN new_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event(p_organization_id uuid, p_lease_deposit_id uuid, p_event_type text, p_event_date date, p_amount numeric, p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT app_private.record_lease_deposit_event($1,$2,$3,$4,$5,$6) $$;
CREATE OR REPLACE FUNCTION public.reverse_lease_deposit_event(p_organization_id uuid, p_event_id uuid, p_event_date date, p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT app_private.reverse_lease_deposit_event($1,$2,$3,$4) $$;

REVOKE ALL ON FUNCTION app_private.record_finance_receipt(uuid,uuid,numeric,date,text) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.record_finance_payment(uuid,uuid,numeric,date,text) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.reverse_finance_receipt(uuid,uuid,date,text) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.reverse_finance_payment(uuid,uuid,date,text) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event(uuid,uuid,text,date,numeric,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION app_private.reverse_lease_deposit_event(uuid,uuid,date,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_lease_deposit_event(uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_lease_deposit_event(uuid,uuid,date,text) TO authenticated;
