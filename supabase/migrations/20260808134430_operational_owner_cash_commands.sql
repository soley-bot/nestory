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
  v_idempotency_key text := NULLIF(trim(coalesce(p_idempotency_key, '')), '');
  v_reference text := NULLIF(trim(coalesce(p_reference, '')), '');
  v_invoice public.owner_invoices%ROWTYPE;
  v_property_id uuid;
  v_existing public.owner_payments%ROWTYPE;
  v_payment_id uuid := gen_random_uuid();
  v_payment_number text;
  v_balance numeric(14, 2);
  v_remaining numeric(14, 2);
  v_line_balance numeric(14, 2);
  v_allocate numeric(14, 2);
  v_order integer := 0;
  v_line record;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_received_date IS NULL
    OR coalesce(p_amount, 0) <= 0
    OR p_amount IS DISTINCT FROM round(p_amount, 2) THEN
    RAISE EXCEPTION 'Payment date and positive exact amount are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'financial_idempotency_v1',
        p_organization_id,
        'record_owner_invoice_payment',
        v_idempotency_key
      ),
      0
    )
  );

  SELECT payment.*
  INTO v_existing
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.owner_invoice_id IS DISTINCT FROM p_owner_invoice_id
      OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.received_date IS DISTINCT FROM p_received_date
      OR v_existing.reference IS DISTINCT FROM v_reference
      OR v_existing.created_by IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'Conflicting owner payment idempotency request'
        USING ERRCODE = '22023';
    END IF;

    IF v_existing.ledger_entry_id IS NOT NULL THEN
      RETURN v_existing.id;
    END IF;

    PERFORM app_private.lock_open_financial_month(
      p_organization_id,
      v_existing.received_date
    );

    v_ledger_entry_id := app_private.create_operational_ledger_event(
      p_organization_id,
      v_existing.property_id,
      NULL,
      v_existing.received_date,
      'income',
      'Owner payment',
      v_existing.amount,
      v_existing.currency,
      concat_ws(' - ', v_existing.payment_number, v_existing.reference),
      'owner_cash_event',
      v_existing.id,
      v_actor_id,
      NULL
    );

    UPDATE public.owner_payments
    SET ledger_entry_id = v_ledger_entry_id
    WHERE organization_id = p_organization_id
      AND id = v_existing.id;

    RETURN v_existing.id;
  END IF;

  SELECT invoice.property_id
  INTO v_property_id
  FROM public.owner_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_owner_invoice_id
    AND invoice.lifecycle = 'issued';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner invoice not found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_received_date
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || v_property_id::text || ':owner-cash',
      0
    )
  );

  SELECT invoice.*
  INTO v_invoice
  FROM public.owner_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_owner_invoice_id
    AND invoice.lifecycle = 'issued'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner invoice not found' USING ERRCODE = '23503';
  END IF;

  SELECT coalesce(
    sum(
      app_private.owner_invoice_line_outstanding(
        line.organization_id,
        line.id
      )
    ),
    0
  )::numeric(14, 2)
  INTO v_balance
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = v_invoice.id;

  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Owner payment exceeds invoice balance'
      USING ERRCODE = '22023';
  END IF;

  v_payment_number := pg_catalog.format(
    'OPAY-%s-%s',
    to_char(p_received_date, 'YYYYMM'),
    lpad(nextval('public.owner_payment_number_seq')::text, 6, '0')
  );

  INSERT INTO public.owner_payments (
    id,
    organization_id,
    owner_invoice_id,
    property_id,
    owner_person_id,
    payment_number,
    received_date,
    amount,
    currency,
    reference,
    idempotency_key,
    created_by
  )
  VALUES (
    v_payment_id,
    p_organization_id,
    v_invoice.id,
    v_invoice.property_id,
    v_invoice.owner_person_id,
    v_payment_number,
    p_received_date,
    p_amount,
    v_invoice.currency,
    v_reference,
    v_idempotency_key,
    v_actor_id
  );

  v_remaining := p_amount;

  FOR v_line IN
    SELECT
      line.id,
      line.source_type,
      line.source_id,
      app_private.owner_invoice_line_outstanding(
        line.organization_id,
        line.id
      ) AS line_balance,
      coalesce(cash.amount, 0)::numeric(14, 2) AS cash_paid
    FROM public.owner_invoice_lines AS line
    LEFT JOIN LATERAL (
      SELECT sum(allocation.amount)::numeric(14, 2) AS amount
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = line.organization_id
        AND allocation.owner_invoice_line_id = line.id
    ) AS cash ON true
    WHERE line.organization_id = p_organization_id
      AND line.invoice_id = v_invoice.id
    ORDER BY line.sort_order, line.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_line_balance := coalesce(v_line.line_balance, 0)::numeric(14, 2);
    CONTINUE WHEN v_line_balance <= 0;

    v_allocate := least(v_remaining, v_line_balance)::numeric(14, 2);
    v_order := v_order + 1;

    INSERT INTO public.owner_payment_allocations (
      organization_id,
      owner_payment_id,
      owner_invoice_id,
      owner_invoice_line_id,
      amount,
      allocation_order,
      created_by
    )
    VALUES (
      p_organization_id,
      v_payment_id,
      v_invoice.id,
      v_line.id,
      v_allocate,
      v_order,
      v_actor_id
    );

    IF v_line.source_type = 'management_fee' THEN
      UPDATE public.management_fee_occurrences AS fee
      SET settlement_status = CASE
        WHEN v_allocate >= v_line_balance THEN 'settled'
        ELSE 'split'
      END
      WHERE fee.organization_id = p_organization_id
        AND fee.id = v_line.source_id;
    ELSIF v_line.source_type = 'owner_expense' THEN
      UPDATE public.ips_expense_responsibilities AS responsibility
      SET held_cash_amount = v_line.cash_paid,
          ips_advance_amount = greatest(v_line_balance - v_allocate, 0),
          updated_by = v_actor_id
      WHERE responsibility.organization_id = p_organization_id
        AND responsibility.id = v_line.source_id;
    END IF;

    v_remaining := (v_remaining - v_allocate)::numeric(14, 2);
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Owner payment did not fully allocate'
      USING ERRCODE = '23514';
  END IF;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_invoice.property_id,
    NULL,
    p_received_date,
    'income',
    'Owner payment',
    p_amount,
    v_invoice.currency,
    concat_ws(' - ', v_payment_number, v_reference),
    'owner_cash_event',
    v_payment_id,
    v_actor_id,
    NULL
  );

  UPDATE public.owner_payments
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_payment_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'owner_payment',
    v_payment_id,
    'owner_payment_recorded',
    jsonb_build_object(
      'owner_invoice_id', v_invoice.id,
      'property_id', v_invoice.property_id,
      'amount', p_amount,
      'received_date', p_received_date
    )
  );

  RETURN v_payment_id;
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
  v_idempotency_key text := NULLIF(trim(coalesce(p_idempotency_key, '')), '');
  v_reference text := NULLIF(trim(coalesce(p_reference, '')), '');
  v_existing public.property_withdrawals%ROWTYPE;
  v_owner_person_id uuid;
  v_available numeric(14, 2);
  v_withdrawal_id uuid;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_withdrawal_date IS NULL
    OR coalesce(p_amount, 0) <= 0
    OR p_amount IS DISTINCT FROM round(p_amount, 2) THEN
    RAISE EXCEPTION 'Withdrawal date and positive exact amount are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'financial_idempotency_v1',
        p_organization_id,
        'record_property_withdrawal',
        v_idempotency_key
      ),
      0
    )
  );

  SELECT withdrawal.*
  INTO v_existing
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.property_id IS DISTINCT FROM p_property_id
      OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.withdrawal_date IS DISTINCT FROM p_withdrawal_date
      OR v_existing.reference IS DISTINCT FROM v_reference
      OR v_existing.created_by IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'Conflicting withdrawal idempotency request'
        USING ERRCODE = '22023';
    END IF;

    IF v_existing.ledger_entry_id IS NOT NULL THEN
      RETURN v_existing.id;
    END IF;

    PERFORM app_private.lock_open_financial_month(
      p_organization_id,
      v_existing.withdrawal_date
    );

    v_ledger_entry_id := app_private.create_operational_ledger_event(
      p_organization_id,
      v_existing.property_id,
      NULL,
      v_existing.withdrawal_date,
      'expense',
      'Owner withdrawal',
      v_existing.amount,
      v_existing.currency,
      v_existing.reference,
      'owner_cash_event',
      v_existing.id,
      v_actor_id,
      NULL
    );

    UPDATE public.property_withdrawals
    SET ledger_entry_id = v_ledger_entry_id
    WHERE organization_id = p_organization_id
      AND id = v_existing.id;

    RETURN v_existing.id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_withdrawal_date
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_property_id::text || ':owner-cash',
      0
    )
  );

  v_owner_person_id := app_private.resolve_property_owner(
    p_organization_id,
    p_property_id,
    p_withdrawal_date
  );

  PERFORM app_private.apply_available_owner_cash(
    p_organization_id,
    p_property_id,
    p_withdrawal_date,
    v_actor_id
  );

  v_available := app_private.property_held_cash_balance(
    p_organization_id,
    p_property_id
  );

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Withdrawal exceeds available property cash'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.property_withdrawals (
    organization_id,
    property_id,
    owner_person_id,
    withdrawal_date,
    amount,
    currency,
    reference,
    idempotency_key,
    created_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    v_owner_person_id,
    p_withdrawal_date,
    p_amount,
    'USD',
    v_reference,
    v_idempotency_key,
    v_actor_id
  )
  RETURNING id INTO v_withdrawal_id;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    p_property_id,
    NULL,
    p_withdrawal_date,
    'expense',
    'Owner withdrawal',
    p_amount,
    'USD',
    v_reference,
    'owner_cash_event',
    v_withdrawal_id,
    v_actor_id,
    NULL
  );

  UPDATE public.property_withdrawals
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_withdrawal_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'property_withdrawal',
    v_withdrawal_id,
    'owner_withdrawal_recorded',
    jsonb_build_object(
      'property_id', p_property_id,
      'owner_person_id', v_owner_person_id,
      'amount', p_amount,
      'withdrawal_date', p_withdrawal_date,
      'available_after', v_available - p_amount
    )
  );

  RETURN v_withdrawal_id;
END;
$$;

DROP FUNCTION public.record_owner_invoice_payment_operational_unchecked(
  uuid,
  uuid,
  numeric,
  date,
  text,
  text
);

DROP FUNCTION public.record_property_withdrawal_operational_unchecked(
  uuid,
  uuid,
  numeric,
  date,
  text,
  text
);

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
