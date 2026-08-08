ALTER TABLE public.owner_payments
  ADD COLUMN ledger_entry_id uuid;

ALTER TABLE public.owner_payments
  ADD CONSTRAINT owner_payments_ledger_entry_fkey
    FOREIGN KEY (ledger_entry_id)
    REFERENCES public.ledger_entries(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_payments_ledger_entry_unique
    UNIQUE (ledger_entry_id);

ALTER TABLE public.property_withdrawals
  ADD COLUMN ledger_entry_id uuid;

ALTER TABLE public.property_withdrawals
  ADD CONSTRAINT property_withdrawals_ledger_entry_fkey
    FOREIGN KEY (ledger_entry_id)
    REFERENCES public.ledger_entries(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT property_withdrawals_ledger_entry_unique
    UNIQUE (ledger_entry_id);

ALTER FUNCTION public.record_owner_invoice_payment(
  uuid, uuid, numeric, date, text, text
)
RENAME TO record_owner_invoice_payment_operational_unchecked;

ALTER FUNCTION public.record_property_withdrawal(
  uuid, uuid, numeric, date, text, text
)
RENAME TO record_property_withdrawal_operational_unchecked;

REVOKE ALL ON FUNCTION public.record_owner_invoice_payment_operational_unchecked(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_property_withdrawal_operational_unchecked(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_owner_invoice_payment(
  p_organization_id uuid,
  p_owner_invoice_id uuid,
  p_amount numeric,
  p_received_date date,
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
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_payment public.owner_payments%ROWTYPE;
  v_payment_id uuid;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_key IS NULL OR length(v_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.idempotency_key = v_key;

  IF FOUND THEN
    IF v_payment.owner_invoice_id IS DISTINCT FROM p_owner_invoice_id
      OR v_payment.amount IS DISTINCT FROM p_amount
      OR v_payment.received_date IS DISTINCT FROM p_received_date
      OR v_payment.reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'Owner payment idempotency key conflicts with the existing payment'
        USING ERRCODE = '23505';
    END IF;

    IF v_payment.ledger_entry_id IS NOT NULL THEN
      RETURN v_payment.id;
    END IF;
  END IF;

  IF p_received_date IS NULL THEN
    RAISE EXCEPTION 'Owner payment date is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_received_date
  );

  IF v_payment.id IS NULL THEN
    v_payment_id := public.record_owner_invoice_payment_operational_unchecked(
      p_organization_id,
      p_owner_invoice_id,
      p_amount,
      p_received_date,
      v_reference,
      v_key
    );
  ELSE
    v_payment_id := v_payment.id;
  END IF;

  SELECT payment.*
  INTO STRICT v_payment
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = v_payment_id
  FOR UPDATE;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_payment.property_id,
    NULL,
    v_payment.received_date,
    'income',
    'Owner payment',
    v_payment.amount,
    v_payment.currency,
    concat_ws(' - ', v_payment.payment_number, v_payment.reference),
    'owner_cash_event',
    v_payment.id,
    v_actor_id,
    NULL
  );

  UPDATE public.owner_payments
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_payment.id
    AND ledger_entry_id IS DISTINCT FROM v_ledger_entry_id;

  RETURN v_payment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_property_withdrawal(
  p_organization_id uuid,
  p_property_id uuid,
  p_amount numeric,
  p_withdrawal_date date,
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
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_withdrawal public.property_withdrawals%ROWTYPE;
  v_withdrawal_id uuid;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_key IS NULL OR length(v_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT withdrawal.*
  INTO v_withdrawal
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.idempotency_key = v_key;

  IF FOUND THEN
    IF v_withdrawal.property_id IS DISTINCT FROM p_property_id
      OR v_withdrawal.amount IS DISTINCT FROM p_amount
      OR v_withdrawal.withdrawal_date IS DISTINCT FROM p_withdrawal_date
      OR v_withdrawal.reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'Withdrawal idempotency key conflicts with the existing withdrawal'
        USING ERRCODE = '23505';
    END IF;

    IF v_withdrawal.ledger_entry_id IS NOT NULL THEN
      RETURN v_withdrawal.id;
    END IF;
  END IF;

  IF p_withdrawal_date IS NULL THEN
    RAISE EXCEPTION 'Withdrawal date is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_withdrawal_date
  );

  IF v_withdrawal.id IS NULL THEN
    v_withdrawal_id := public.record_property_withdrawal_operational_unchecked(
      p_organization_id,
      p_property_id,
      p_amount,
      p_withdrawal_date,
      v_reference,
      v_key
    );
  ELSE
    v_withdrawal_id := v_withdrawal.id;
  END IF;

  SELECT withdrawal.*
  INTO STRICT v_withdrawal
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = v_withdrawal_id
  FOR UPDATE;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_withdrawal.property_id,
    NULL,
    v_withdrawal.withdrawal_date,
    'expense',
    'Owner withdrawal',
    v_withdrawal.amount,
    v_withdrawal.currency,
    v_withdrawal.reference,
    'owner_cash_event',
    v_withdrawal.id,
    v_actor_id,
    NULL
  );

  UPDATE public.property_withdrawals
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_withdrawal.id
    AND ledger_entry_id IS DISTINCT FROM v_ledger_entry_id;

  RETURN v_withdrawal.id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_owner_invoice_payment(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_invoice_payment(
  uuid, uuid, numeric, date, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_property_withdrawal(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_property_withdrawal(
  uuid, uuid, numeric, date, text, text
) TO authenticated;
