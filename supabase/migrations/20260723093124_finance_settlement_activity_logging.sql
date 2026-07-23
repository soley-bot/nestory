CREATE OR REPLACE FUNCTION app_private.record_finance_receipt(
  p_organization_id uuid,
  p_income_item_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.finance_income_items%ROWTYPE;
  updated_target public.finance_income_items%ROWTYPE;
  new_receipt_id uuid;
  allocated numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target
  FROM public.finance_income_items
  WHERE id = p_income_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
    AND status <> 'void'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found';
  END IF;

  IF target.status = 'posted' OR target.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Posted income cannot accept receipt changes; reverse the ledger posting first'
      USING ERRCODE = '55000';
  END IF;

  SELECT coalesce(sum(
    CASE WHEN receipt.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
  ), 0)
  INTO allocated
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.income_item_id = target.id;

  IF coalesce(p_amount, 0) <= 0 OR allocated + p_amount > target.amount_due THEN
    RAISE EXCEPTION 'Receipt allocation exceeds open balance';
  END IF;

  INSERT INTO public.finance_receipts (
    organization_id,
    property_id,
    received_date,
    amount,
    currency,
    payer_label,
    reference,
    created_by
  )
  VALUES (
    p_organization_id,
    target.property_id,
    p_received_date,
    p_amount,
    target.currency,
    target.payer_label,
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_receipt_id;

  INSERT INTO public.finance_receipt_allocations (
    organization_id,
    receipt_id,
    income_item_id,
    amount,
    created_by
  )
  VALUES (
    p_organization_id,
    new_receipt_id,
    target.id,
    p_amount,
    (SELECT auth.uid())
  );

  UPDATE public.finance_income_items
  SET reference = coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), reference)
  WHERE id = target.id;

  PERFORM app_private.refresh_finance_income_compatibility(
    target.id,
    (SELECT auth.uid())
  );

  SELECT *
  INTO STRICT updated_target
  FROM public.finance_income_items
  WHERE id = target.id
    AND organization_id = p_organization_id;

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
    (SELECT auth.uid()),
    'finance_income_item',
    target.id,
    'receipt_recorded',
    jsonb_build_object(
      'income_type', target.income_type,
      'payer_label', target.payer_label,
      'amount_received', target.amount_received,
      'received_date', target.received_date,
      'status', target.status
    ),
    jsonb_build_object(
      'income_type', updated_target.income_type,
      'payer_label', updated_target.payer_label,
      'amount_received', updated_target.amount_received,
      'received_date', updated_target.received_date,
      'status', updated_target.status,
      'receipt_amount', p_amount,
      'receipt_date', p_received_date
    )
  );

  RETURN new_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_finance_payment(
  p_organization_id uuid,
  p_expense_item_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.finance_expense_items%ROWTYPE;
  updated_target public.finance_expense_items%ROWTYPE;
  new_payment_id uuid;
  allocated numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target
  FROM public.finance_expense_items
  WHERE id = p_expense_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
    AND status <> 'void'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense item not found';
  END IF;

  SELECT coalesce(sum(
    CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
  ), 0)
  INTO allocated
  FROM public.finance_payment_allocations AS allocation
  JOIN public.finance_payments AS payment
    ON payment.id = allocation.payment_id
   AND payment.organization_id = allocation.organization_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.expense_item_id = target.id;

  IF coalesce(p_amount, 0) <= 0 OR allocated + p_amount > target.amount THEN
    RAISE EXCEPTION 'Payment allocation exceeds open balance';
  END IF;

  INSERT INTO public.finance_payments (
    organization_id,
    property_id,
    paid_date,
    amount,
    currency,
    payee_label,
    reference,
    created_by
  )
  VALUES (
    p_organization_id,
    target.property_id,
    p_paid_date,
    p_amount,
    target.currency,
    target.vendor_label,
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_payment_id;

  INSERT INTO public.finance_payment_allocations (
    organization_id,
    payment_id,
    expense_item_id,
    amount,
    created_by
  )
  VALUES (
    p_organization_id,
    new_payment_id,
    target.id,
    p_amount,
    (SELECT auth.uid())
  );

  UPDATE public.finance_expense_items
  SET reference = coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), reference)
  WHERE id = target.id;

  PERFORM app_private.refresh_finance_expense_compatibility(
    target.id,
    (SELECT auth.uid())
  );

  SELECT *
  INTO STRICT updated_target
  FROM public.finance_expense_items
  WHERE id = target.id
    AND organization_id = p_organization_id;

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
    (SELECT auth.uid()),
    'finance_expense_item',
    target.id,
    'payment_recorded',
    jsonb_build_object(
      'expense_type', target.expense_type,
      'vendor_label', target.vendor_label,
      'amount_paid', allocated,
      'paid_date', target.paid_date,
      'status', target.status
    ),
    jsonb_build_object(
      'expense_type', updated_target.expense_type,
      'vendor_label', updated_target.vendor_label,
      'amount_paid', allocated + p_amount,
      'paid_date', updated_target.paid_date,
      'status', updated_target.status,
      'payment_amount', p_amount,
      'payment_date', p_paid_date
    )
  );

  RETURN new_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.reverse_finance_receipt(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_reversal_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.finance_receipts%ROWTYPE;
  allocation_record public.finance_receipt_allocations%ROWTYPE;
  income_before public.finance_income_items%ROWTYPE;
  income_after public.finance_income_items%ROWTYPE;
  new_reversal_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target
  FROM public.finance_receipts
  WHERE id = p_receipt_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance receipt not found' USING ERRCODE = '23503';
  END IF;

  IF target.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_receipts AS reversal
    WHERE reversal.reversal_of_id = target.id
  ) THEN
    RAISE EXCEPTION 'Finance receipt is already reversed' USING ERRCODE = '22023';
  END IF;

  PERFORM income_item.id
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_income_items AS income_item
    ON income_item.id = allocation.income_item_id
   AND income_item.organization_id = allocation.organization_id
  WHERE allocation.receipt_id = target.id
    AND allocation.organization_id = target.organization_id
  FOR UPDATE OF income_item;

  IF EXISTS (
    SELECT 1
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_income_items AS income_item
      ON income_item.id = allocation.income_item_id
     AND income_item.organization_id = allocation.organization_id
    WHERE allocation.receipt_id = target.id
      AND allocation.organization_id = target.organization_id
      AND (income_item.status = 'posted' OR income_item.ledger_entry_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Posted income cannot reverse receipts; reverse the ledger posting first'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.finance_receipts (
    organization_id,
    property_id,
    received_date,
    amount,
    currency,
    payer_label,
    reference,
    reversal_of_id,
    created_by
  )
  VALUES (
    target.organization_id,
    target.property_id,
    p_reversal_date,
    target.amount,
    target.currency,
    target.payer_label,
    coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), 'REVERSAL-' || target.id::text),
    target.id,
    (SELECT auth.uid())
  )
  RETURNING id INTO new_reversal_id;

  FOR allocation_record IN
    SELECT allocation.*
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.receipt_id = target.id
      AND allocation.organization_id = target.organization_id
    ORDER BY allocation.id
  LOOP
    SELECT *
    INTO STRICT income_before
    FROM public.finance_income_items
    WHERE id = allocation_record.income_item_id
      AND organization_id = target.organization_id
    FOR UPDATE;

    INSERT INTO public.finance_receipt_allocations (
      organization_id,
      receipt_id,
      income_item_id,
      amount,
      created_by
    )
    VALUES (
      target.organization_id,
      new_reversal_id,
      allocation_record.income_item_id,
      allocation_record.amount,
      (SELECT auth.uid())
    );

    PERFORM app_private.refresh_finance_income_compatibility(
      allocation_record.income_item_id,
      (SELECT auth.uid())
    );

    SELECT *
    INTO STRICT income_after
    FROM public.finance_income_items
    WHERE id = allocation_record.income_item_id
      AND organization_id = target.organization_id;

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
      target.organization_id,
      (SELECT auth.uid()),
      'finance_income_item',
      allocation_record.income_item_id,
      'receipt_reversed',
      jsonb_build_object(
        'income_type', income_before.income_type,
        'payer_label', income_before.payer_label,
        'amount_received', income_before.amount_received,
        'received_date', income_before.received_date,
        'status', income_before.status
      ),
      jsonb_build_object(
        'income_type', income_after.income_type,
        'payer_label', income_after.payer_label,
        'amount_received', income_after.amount_received,
        'received_date', income_after.received_date,
        'status', income_after.status,
        'reversal_amount', allocation_record.amount,
        'reversal_date', p_reversal_date
      )
    );
  END LOOP;

  RETURN new_reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.reverse_finance_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reversal_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.finance_payments%ROWTYPE;
  allocation_record public.finance_payment_allocations%ROWTYPE;
  expense_before public.finance_expense_items%ROWTYPE;
  expense_after public.finance_expense_items%ROWTYPE;
  new_reversal_id uuid;
  allocated_before numeric;
  allocated_after numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target
  FROM public.finance_payments
  WHERE id = p_payment_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance payment not found' USING ERRCODE = '23503';
  END IF;

  IF target.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_payments AS reversal
    WHERE reversal.reversal_of_id = target.id
  ) THEN
    RAISE EXCEPTION 'Finance payment is already reversed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_payments (
    organization_id,
    property_id,
    paid_date,
    amount,
    currency,
    payee_label,
    reference,
    reversal_of_id,
    created_by
  )
  VALUES (
    target.organization_id,
    target.property_id,
    p_reversal_date,
    target.amount,
    target.currency,
    target.payee_label,
    coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), 'REVERSAL-' || target.id::text),
    target.id,
    (SELECT auth.uid())
  )
  RETURNING id INTO new_reversal_id;

  FOR allocation_record IN
    SELECT allocation.*
    FROM public.finance_payment_allocations AS allocation
    WHERE allocation.payment_id = target.id
      AND allocation.organization_id = target.organization_id
    ORDER BY allocation.id
  LOOP
    SELECT *
    INTO STRICT expense_before
    FROM public.finance_expense_items
    WHERE id = allocation_record.expense_item_id
      AND organization_id = target.organization_id
    FOR UPDATE;

    SELECT coalesce(sum(
      CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0)
    INTO allocated_before
    FROM public.finance_payment_allocations AS allocation
    JOIN public.finance_payments AS payment
      ON payment.id = allocation.payment_id
     AND payment.organization_id = allocation.organization_id
    WHERE allocation.organization_id = target.organization_id
      AND allocation.expense_item_id = allocation_record.expense_item_id;

    INSERT INTO public.finance_payment_allocations (
      organization_id,
      payment_id,
      expense_item_id,
      amount,
      created_by
    )
    VALUES (
      target.organization_id,
      new_reversal_id,
      allocation_record.expense_item_id,
      allocation_record.amount,
      (SELECT auth.uid())
    );

    PERFORM app_private.refresh_finance_expense_compatibility(
      allocation_record.expense_item_id,
      (SELECT auth.uid())
    );

    SELECT *
    INTO STRICT expense_after
    FROM public.finance_expense_items
    WHERE id = allocation_record.expense_item_id
      AND organization_id = target.organization_id;

    SELECT coalesce(sum(
      CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0)
    INTO allocated_after
    FROM public.finance_payment_allocations AS allocation
    JOIN public.finance_payments AS payment
      ON payment.id = allocation.payment_id
     AND payment.organization_id = allocation.organization_id
    WHERE allocation.organization_id = target.organization_id
      AND allocation.expense_item_id = allocation_record.expense_item_id;

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
      target.organization_id,
      (SELECT auth.uid()),
      'finance_expense_item',
      allocation_record.expense_item_id,
      'payment_reversed',
      jsonb_build_object(
        'expense_type', expense_before.expense_type,
        'vendor_label', expense_before.vendor_label,
        'amount_paid', allocated_before,
        'paid_date', expense_before.paid_date,
        'status', expense_before.status
      ),
      jsonb_build_object(
        'expense_type', expense_after.expense_type,
        'vendor_label', expense_after.vendor_label,
        'amount_paid', allocated_after,
        'paid_date', expense_after.paid_date,
        'status', expense_after.status,
        'reversal_amount', allocation_record.amount,
        'reversal_date', p_reversal_date
      )
    );
  END LOOP;

  RETURN new_reversal_id;
END;
$$;
