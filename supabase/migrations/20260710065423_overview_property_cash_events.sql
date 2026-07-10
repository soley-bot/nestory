CREATE TABLE public.finance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  received_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  payer_label text NOT NULL CHECK (length(trim(payer_label)) > 0),
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.finance_receipts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.finance_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.finance_receipts(id) ON DELETE RESTRICT,
  income_item_id uuid NOT NULL REFERENCES public.finance_income_items(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (receipt_id, income_item_id)
);

CREATE TABLE public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  paid_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  payee_label text NOT NULL CHECK (length(trim(payee_label)) > 0),
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.finance_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
  expense_item_id uuid NOT NULL REFERENCES public.finance_expense_items(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (payment_id, expense_item_id)
);

CREATE TABLE public.lease_deposit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lease_deposit_id uuid NOT NULL REFERENCES public.lease_deposits(id) ON DELETE RESTRICT,
  event_type text NOT NULL
    CHECK (event_type IN ('received', 'applied', 'retained', 'refunded', 'reversed')),
  event_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.lease_deposit_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX finance_receipts_org_date_idx
  ON public.finance_receipts (organization_id, received_date DESC, id DESC);
CREATE INDEX finance_receipt_allocations_org_income_idx
  ON public.finance_receipt_allocations (organization_id, income_item_id, created_at DESC);
CREATE INDEX finance_receipt_allocations_receipt_idx
  ON public.finance_receipt_allocations (receipt_id);
CREATE INDEX finance_payments_org_date_idx
  ON public.finance_payments (organization_id, paid_date DESC, id DESC);
CREATE INDEX finance_payment_allocations_org_expense_idx
  ON public.finance_payment_allocations (organization_id, expense_item_id, created_at DESC);
CREATE INDEX finance_payment_allocations_payment_idx
  ON public.finance_payment_allocations (payment_id);
CREATE INDEX lease_deposit_events_org_date_idx
  ON public.lease_deposit_events (organization_id, event_date DESC, id DESC);
CREATE INDEX lease_deposit_events_deposit_idx
  ON public.lease_deposit_events (lease_deposit_id, event_date DESC, id DESC);

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_deposit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage finance receipts"
ON public.finance_receipts
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage finance receipt allocations"
ON public.finance_receipt_allocations
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage finance payments"
ON public.finance_payments
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage finance payment allocations"
ON public.finance_payment_allocations
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage lease deposit events"
ON public.lease_deposit_events
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE ON
  public.finance_receipts,
  public.finance_receipt_allocations,
  public.finance_payments,
  public.finance_payment_allocations,
  public.lease_deposit_events
TO authenticated;

GRANT ALL PRIVILEGES ON
  public.finance_receipts,
  public.finance_receipt_allocations,
  public.finance_payments,
  public.finance_payment_allocations,
  public.lease_deposit_events
TO service_role;

CREATE OR REPLACE FUNCTION public.record_finance_receipt(
  p_organization_id uuid,
  p_income_item_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.finance_income_items%ROWTYPE;
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

  SELECT coalesce(sum(amount), 0)
  INTO allocated
  FROM public.finance_receipt_allocations
  WHERE organization_id = p_organization_id
    AND income_item_id = target.id;

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
  SET amount_received = allocated + p_amount,
      received_date = p_received_date,
      reference = coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), reference),
      status = CASE
        WHEN allocated + p_amount = amount_due THEN 'received'
        ELSE 'partially_received'
      END,
      updated_by = (SELECT auth.uid())
  WHERE id = target.id;

  RETURN new_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_finance_payment(
  p_organization_id uuid,
  p_expense_item_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.finance_expense_items%ROWTYPE;
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

  SELECT coalesce(sum(amount), 0)
  INTO allocated
  FROM public.finance_payment_allocations
  WHERE organization_id = p_organization_id
    AND expense_item_id = target.id;

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
  SET paid_date = CASE
        WHEN allocated + p_amount = amount THEN p_paid_date
        ELSE paid_date
      END,
      reference = coalesce(NULLIF(trim(coalesce(p_reference, '')), ''), reference),
      status = CASE
        WHEN allocated + p_amount = amount THEN 'paid'
        ELSE status
      END,
      updated_by = (SELECT auth.uid())
  WHERE id = target.id;

  RETURN new_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_finance_income_payment(
  p_income_item_id uuid,
  p_organization_id uuid,
  p_amount_received numeric,
  p_received_date date,
  p_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.record_finance_receipt(
    p_organization_id,
    p_income_item_id,
    p_amount_received,
    p_received_date,
    p_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.backfill_property_cash_events()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  income_record public.finance_income_items%ROWTYPE;
  expense_record public.finance_expense_items%ROWTYPE;
  new_event_id uuid;
BEGIN
  FOR income_record IN
    SELECT income_item.*
    FROM public.finance_income_items AS income_item
    WHERE income_item.amount_received > 0
      AND income_item.status <> 'void'
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_receipt_allocations AS allocation
        WHERE allocation.income_item_id = income_item.id
      )
    ORDER BY income_item.id
    FOR UPDATE
  LOOP
    INSERT INTO public.finance_receipts (
      organization_id,
      property_id,
      received_date,
      amount,
      currency,
      payer_label,
      reference,
      created_at,
      created_by
    )
    VALUES (
      income_record.organization_id,
      income_record.property_id,
      coalesce(income_record.received_date, income_record.due_date),
      income_record.amount_received,
      income_record.currency,
      income_record.payer_label,
      'BACKFILL-INCOME-' || income_record.id::text,
      income_record.created_at,
      coalesce(income_record.updated_by, income_record.created_by)
    )
    RETURNING id INTO new_event_id;

    INSERT INTO public.finance_receipt_allocations (
      organization_id,
      receipt_id,
      income_item_id,
      amount,
      created_at,
      created_by
    )
    VALUES (
      income_record.organization_id,
      new_event_id,
      income_record.id,
      income_record.amount_received,
      income_record.created_at,
      coalesce(income_record.updated_by, income_record.created_by)
    );
  END LOOP;

  FOR expense_record IN
    SELECT expense_item.*
    FROM public.finance_expense_items AS expense_item
    WHERE expense_item.status <> 'void'
      AND (expense_item.paid_date IS NOT NULL OR expense_item.status = 'paid')
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_payment_allocations AS allocation
        WHERE allocation.expense_item_id = expense_item.id
      )
    ORDER BY expense_item.id
    FOR UPDATE
  LOOP
    INSERT INTO public.finance_payments (
      organization_id,
      property_id,
      paid_date,
      amount,
      currency,
      payee_label,
      reference,
      created_at,
      created_by
    )
    VALUES (
      expense_record.organization_id,
      expense_record.property_id,
      coalesce(expense_record.paid_date, expense_record.invoice_date),
      expense_record.amount,
      expense_record.currency,
      expense_record.vendor_label,
      'BACKFILL-EXPENSE-' || expense_record.id::text,
      expense_record.created_at,
      coalesce(expense_record.updated_by, expense_record.created_by)
    )
    RETURNING id INTO new_event_id;

    INSERT INTO public.finance_payment_allocations (
      organization_id,
      payment_id,
      expense_item_id,
      amount,
      created_at,
      created_by
    )
    VALUES (
      expense_record.organization_id,
      new_event_id,
      expense_record.id,
      expense_record.amount,
      expense_record.created_at,
      coalesce(expense_record.updated_by, expense_record.created_by)
    );
  END LOOP;
END;
$$;

SELECT app_private.backfill_property_cash_events();

REVOKE ALL ON FUNCTION public.record_finance_receipt(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_finance_payment(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.backfill_property_cash_events() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_finance_receipt(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
