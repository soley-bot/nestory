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

ALTER TABLE public.finance_income_items
  ADD CONSTRAINT finance_income_items_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE public.finance_expense_items
  ADD CONSTRAINT finance_expense_items_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE public.lease_deposits
  ADD CONSTRAINT lease_deposits_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.finance_receipts
  ADD CONSTRAINT finance_receipts_organization_id_id_key UNIQUE (organization_id, id),
  ADD CONSTRAINT finance_receipts_reversal_scope_key
    UNIQUE (organization_id, property_id, currency, id),
  ADD CONSTRAINT finance_receipts_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT finance_receipts_scope_reversal_fkey
    FOREIGN KEY (organization_id, property_id, currency, reversal_of_id)
    REFERENCES public.finance_receipts (organization_id, property_id, currency, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipts_not_self_reversal_check
    CHECK (reversal_of_id IS NULL OR reversal_of_id <> id);

ALTER TABLE public.finance_receipt_allocations
  ADD CONSTRAINT finance_receipt_allocations_org_receipt_fkey
    FOREIGN KEY (organization_id, receipt_id)
    REFERENCES public.finance_receipts (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipt_allocations_org_income_item_fkey
    FOREIGN KEY (organization_id, income_item_id)
    REFERENCES public.finance_income_items (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_organization_id_id_key UNIQUE (organization_id, id),
  ADD CONSTRAINT finance_payments_reversal_scope_key
    UNIQUE (organization_id, property_id, currency, id),
  ADD CONSTRAINT finance_payments_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT finance_payments_scope_reversal_fkey
    FOREIGN KEY (organization_id, property_id, currency, reversal_of_id)
    REFERENCES public.finance_payments (organization_id, property_id, currency, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payments_not_self_reversal_check
    CHECK (reversal_of_id IS NULL OR reversal_of_id <> id);

ALTER TABLE public.finance_payment_allocations
  ADD CONSTRAINT finance_payment_allocations_org_payment_fkey
    FOREIGN KEY (organization_id, payment_id)
    REFERENCES public.finance_payments (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_org_expense_item_fkey
    FOREIGN KEY (organization_id, expense_item_id)
    REFERENCES public.finance_expense_items (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE public.lease_deposit_events
  ADD CONSTRAINT lease_deposit_events_reversal_scope_key
    UNIQUE (organization_id, property_id, currency, id),
  ADD CONSTRAINT lease_deposit_events_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT lease_deposit_events_org_deposit_fkey
    FOREIGN KEY (organization_id, lease_deposit_id)
    REFERENCES public.lease_deposits (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT lease_deposit_events_scope_reversal_fkey
    FOREIGN KEY (organization_id, property_id, currency, reversal_of_id)
    REFERENCES public.lease_deposit_events (organization_id, property_id, currency, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT lease_deposit_events_not_self_reversal_check
    CHECK (reversal_of_id IS NULL OR reversal_of_id <> id),
  ADD CONSTRAINT lease_deposit_events_reversal_type_check
    CHECK (
      (reversal_of_id IS NULL AND event_type <> 'reversed')
      OR (reversal_of_id IS NOT NULL AND event_type = 'reversed')
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
CREATE UNIQUE INDEX finance_receipts_backfill_target_idx
  ON public.finance_receipts (reference)
  WHERE reference LIKE 'BACKFILL-INCOME-%';
CREATE UNIQUE INDEX finance_payments_backfill_target_idx
  ON public.finance_payments (reference)
  WHERE reference LIKE 'BACKFILL-EXPENSE-%';

CREATE OR REPLACE FUNCTION app_private.validate_property_cash_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_reversal_id uuid;
  target_amount numeric;
BEGIN
  IF NEW.reversal_of_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'finance_receipts' THEN
    SELECT reversal_of_id, amount
    INTO target_reversal_id, target_amount
    FROM public.finance_receipts
    WHERE id = NEW.reversal_of_id;
  ELSIF TG_TABLE_NAME = 'finance_payments' THEN
    SELECT reversal_of_id, amount
    INTO target_reversal_id, target_amount
    FROM public.finance_payments
    WHERE id = NEW.reversal_of_id;
  ELSIF TG_TABLE_NAME = 'lease_deposit_events' THEN
    SELECT reversal_of_id, amount
    INTO target_reversal_id, target_amount
    FROM public.lease_deposit_events
    WHERE id = NEW.reversal_of_id;
  ELSE
    RAISE EXCEPTION 'Unsupported property cash reversal table';
  END IF;

  IF target_reversal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE = '22023';
  END IF;

  IF target_amount IS NOT NULL AND NEW.amount <> target_amount THEN
    RAISE EXCEPTION 'Reversal amount must equal the original event amount'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_finance_receipt_reversal
BEFORE INSERT OR UPDATE OF reversal_of_id, amount
ON public.finance_receipts
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_property_cash_reversal();

CREATE TRIGGER validate_finance_payment_reversal
BEFORE INSERT OR UPDATE OF reversal_of_id, amount
ON public.finance_payments
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_property_cash_reversal();

CREATE TRIGGER validate_lease_deposit_event_reversal
BEFORE INSERT OR UPDATE OF reversal_of_id, amount
ON public.lease_deposit_events
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_property_cash_reversal();

CREATE OR REPLACE FUNCTION app_private.enforce_finance_settlement_derived_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  table_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(table_record.relowner)
  INTO table_owner
  FROM pg_catalog.pg_class AS table_record
  WHERE table_record.oid = TG_RELID;

  IF TG_TABLE_NAME = 'finance_income_items' THEN
    IF TG_OP = 'INSERT' THEN
      IF (
        NEW.amount_received <> 0
        OR NEW.received_date IS NOT NULL
        OR NEW.status IN ('partially_received', 'received', 'posted')
      ) AND current_user <> table_owner THEN
        RAISE EXCEPTION 'Income settlement fields are event-derived'
          USING ERRCODE = '55000';
      END IF;

      RETURN NEW;
    END IF;

    IF (
      NEW.amount_received IS DISTINCT FROM OLD.amount_received
      OR NEW.received_date IS DISTINCT FROM OLD.received_date
      OR (
        NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('open', 'partially_received', 'received')
      )
    ) AND current_user <> table_owner THEN
      RAISE EXCEPTION 'Income settlement fields are event-derived'
        USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'finance_expense_items' THEN
    IF TG_OP = 'INSERT' THEN
      IF (
        NEW.paid_date IS NOT NULL
        OR NEW.status = 'paid'
      ) AND current_user <> table_owner THEN
        RAISE EXCEPTION 'Expense settlement fields are event-derived'
          USING ERRCODE = '55000';
      END IF;

      RETURN NEW;
    END IF;

    IF (
      NEW.paid_date IS DISTINCT FROM OLD.paid_date
      OR (
        NEW.status IS DISTINCT FROM OLD.status
        AND (NEW.status = 'paid' OR OLD.status = 'paid')
      )
    ) AND current_user <> table_owner THEN
      RAISE EXCEPTION 'Expense settlement fields are event-derived'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_finance_income_settlement_derived_fields
BEFORE INSERT OR UPDATE OF amount_received, received_date, status
ON public.finance_income_items
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_settlement_derived_fields();

CREATE TRIGGER enforce_finance_expense_settlement_derived_fields
BEFORE INSERT OR UPDATE OF paid_date, status
ON public.finance_expense_items
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_settlement_derived_fields();

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

REVOKE ALL ON
  public.finance_receipts,
  public.finance_receipt_allocations,
  public.finance_payments,
  public.finance_payment_allocations,
  public.lease_deposit_events
FROM anon, authenticated, service_role;

GRANT SELECT ON
  public.finance_receipts,
  public.finance_receipt_allocations,
  public.finance_payments,
  public.finance_payment_allocations,
  public.lease_deposit_events
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.refresh_finance_income_compatibility(
  p_income_item_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  compatibility_amount numeric;
  compatibility_date date;
BEGIN
  SELECT
    coalesce(sum(
      CASE WHEN receipt.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0),
    max(receipt.received_date) FILTER (
      WHERE receipt.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.finance_receipts AS reversal
          WHERE reversal.reversal_of_id = receipt.id
        )
    )
  INTO compatibility_amount, compatibility_date
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.income_item_id = p_income_item_id;

  UPDATE public.finance_income_items
  SET amount_received = compatibility_amount,
      received_date = CASE WHEN compatibility_amount > 0 THEN compatibility_date ELSE NULL END,
      status = CASE
        WHEN status = 'posted' OR ledger_entry_id IS NOT NULL THEN status
        WHEN compatibility_amount <= 0 THEN 'open'
        WHEN compatibility_amount >= amount_due THEN 'received'
        ELSE 'partially_received'
      END,
      updated_by = p_actor_id
  WHERE id = p_income_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.refresh_finance_expense_compatibility(
  p_expense_item_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  compatibility_amount numeric;
  compatibility_date date;
BEGIN
  SELECT
    coalesce(sum(
      CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END
    ), 0),
    max(payment.paid_date) FILTER (
      WHERE payment.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.finance_payments AS reversal
          WHERE reversal.reversal_of_id = payment.id
        )
    )
  INTO compatibility_amount, compatibility_date
  FROM public.finance_payment_allocations AS allocation
  JOIN public.finance_payments AS payment
    ON payment.id = allocation.payment_id
   AND payment.organization_id = allocation.organization_id
  WHERE allocation.expense_item_id = p_expense_item_id;

  UPDATE public.finance_expense_items
  SET paid_date = CASE WHEN compatibility_amount >= amount THEN compatibility_date ELSE NULL END,
      status = CASE
        WHEN compatibility_amount >= amount THEN 'paid'
        WHEN status = 'paid' AND ledger_entry_id IS NOT NULL THEN 'posted'
        WHEN status = 'paid' THEN 'approved'
        ELSE status
      END,
      updated_by = p_actor_id
  WHERE id = p_expense_item_id;
END;
$$;

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
    PERFORM 1
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
    PERFORM 1
    FROM public.finance_expense_items
    WHERE id = allocation_record.expense_item_id
      AND organization_id = target.organization_id
    FOR UPDATE;

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
  END LOOP;

  RETURN new_reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_finance_receipt(
  p_organization_id uuid,
  p_income_item_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT app_private.record_finance_receipt(
    p_organization_id,
    p_income_item_id,
    p_amount,
    p_received_date,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.record_finance_payment(
  p_organization_id uuid,
  p_expense_item_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT app_private.record_finance_payment(
    p_organization_id,
    p_expense_item_id,
    p_amount,
    p_paid_date,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.reverse_finance_receipt(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_reversal_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT app_private.reverse_finance_receipt(
    p_organization_id,
    p_receipt_id,
    p_reversal_date,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.reverse_finance_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reversal_date date,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT app_private.reverse_finance_payment(
    p_organization_id,
    p_payment_id,
    p_reversal_date,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.create_finance_income_item(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_income_type text,
  p_payer_label text,
  p_due_date date,
  p_amount_due numeric,
  p_amount_received numeric,
  p_received_date date,
  p_description text,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_income_id uuid;
  normalized_income_type text := lower(trim(coalesce(p_income_type, 'rent')));
  normalized_payer_label text := NULLIF(trim(coalesce(p_payer_label, '')), '');
  normalized_amount_due numeric := coalesce(p_amount_due, 0);
  normalized_amount_received numeric := coalesce(p_amount_received, 0);
  derived_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_payer_label IS NULL THEN
    RAISE EXCEPTION 'Payer is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_due <= 0 THEN
    RAISE EXCEPTION 'Income amount is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received < 0
    OR normalized_amount_received > normalized_amount_due THEN
    RAISE EXCEPTION 'Initial received amount exceeds income amount due'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received > 0 AND p_received_date IS NULL THEN
    RAISE EXCEPTION 'Received date is required for initial received income'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_income_items (
    organization_id,
    property_id,
    unit_id,
    lease_id,
    income_type,
    payer_label,
    due_date,
    amount_due,
    amount_received,
    received_date,
    status,
    description,
    reference,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    normalized_income_type,
    normalized_payer_label,
    p_due_date,
    normalized_amount_due,
    0,
    NULL,
    'open',
    NULLIF(trim(coalesce(p_description, '')), ''),
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_income_id;

  IF normalized_amount_received > 0 THEN
    PERFORM public.record_finance_receipt(
      p_organization_id,
      new_income_id,
      normalized_amount_received,
      p_received_date,
      p_reference
    );
  END IF;

  SELECT status
  INTO derived_status
  FROM public.finance_income_items
  WHERE id = new_income_id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    new_income_id,
    'created',
    (SELECT auth.uid()),
    jsonb_build_object(
      'income_type', normalized_income_type,
      'payer_label', normalized_payer_label,
      'amount_due', normalized_amount_due,
      'amount_received', normalized_amount_received,
      'status', derived_status
    )
  );

  RETURN new_income_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_finance_expense_status(
  p_expense_item_id uuid,
  p_organization_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_expense public.finance_expense_items%ROWTYPE;
  normalized_status text := lower(trim(p_status));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_expense
  FROM public.finance_expense_items
  WHERE id = p_expense_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense item not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_status NOT IN ('approved', 'paid', 'void') THEN
    RAISE EXCEPTION 'Unsupported expense status' USING ERRCODE = '22023';
  END IF;

  IF normalized_status = 'paid' THEN
    RAISE EXCEPTION 'Use record_finance_payment to settle expenses'
      USING ERRCODE = '22023';
  END IF;

  IF target_expense.status = 'posted' AND normalized_status = 'approved' THEN
    RAISE EXCEPTION 'Posted expenses cannot move back to approved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_expense_items
  SET status = normalized_status,
      archived_at = CASE WHEN normalized_status = 'void' THEN now() ELSE archived_at END,
      archived_by = CASE
        WHEN normalized_status = 'void' THEN (SELECT auth.uid())
        ELSE archived_by
      END,
      updated_by = (SELECT auth.uid())
  WHERE id = target_expense.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_expense_item',
    target_expense.id,
    normalized_status,
    (SELECT auth.uid()),
    jsonb_build_object('status', target_expense.status),
    jsonb_build_object('status', normalized_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_finance_expense_item(
  p_expense_item_id uuid,
  p_organization_id uuid,
  p_paid_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_expense public.finance_expense_items%ROWTYPE;
  new_ledger_entry_id uuid;
  journal_entry_id uuid;
  transaction_date date;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_expense
  FROM public.finance_expense_items
  WHERE id = p_expense_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense item not found' USING ERRCODE = '23503';
  END IF;

  IF target_expense.status IN ('posted', 'paid')
    AND target_expense.ledger_entry_id IS NOT NULL THEN
    RETURN target_expense.ledger_entry_id;
  END IF;

  IF target_expense.status = 'void' THEN
    RAISE EXCEPTION 'Voided expense cannot be posted' USING ERRCODE = '22023';
  END IF;

  IF target_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'Approve the expense before posting' USING ERRCODE = '22023';
  END IF;

  IF target_expense.expense_type = 'owner_payout' THEN
    RAISE EXCEPTION 'Use the owner distribution workflow'
      USING ERRCODE = '22023';
  END IF;

  transaction_date := coalesce(p_paid_date, target_expense.invoice_date);

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    target_expense.property_id,
    target_expense.unit_id,
    transaction_date,
    'expense',
    target_expense.category,
    target_expense.amount,
    target_expense.currency,
    concat_ws(' - ', target_expense.vendor_label, target_expense.description),
    'finance_expense',
    target_expense.id,
    actor_id
  );

  journal_entry_id := app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    NULL,
    target_expense.expense_type,
    target_expense.economic_scope,
    NULL,
    target_expense.vendor_person_id,
    'paid',
    actor_id
  );

  UPDATE public.finance_expense_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      updated_by = actor_id
  WHERE id = target_expense.id;

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
    actor_id,
    'finance_expense_item',
    target_expense.id,
    'posted_to_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'accounting_journal_entry_id', journal_entry_id
    )
  );

  RETURN new_ledger_entry_id;
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
SET search_path = pg_catalog, public
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
SET search_path = pg_catalog, public
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
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('finance-income:' || income_record.id::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.finance_receipt_allocations AS allocation
      WHERE allocation.income_item_id = income_record.id
    ) THEN
      CONTINUE;
    END IF;

    new_event_id := (
      substr(md5('BACKFILL-INCOME-' || income_record.id::text), 1, 8) || '-' ||
      substr(md5('BACKFILL-INCOME-' || income_record.id::text), 9, 4) || '-' ||
      substr(md5('BACKFILL-INCOME-' || income_record.id::text), 13, 4) || '-' ||
      substr(md5('BACKFILL-INCOME-' || income_record.id::text), 17, 4) || '-' ||
      substr(md5('BACKFILL-INCOME-' || income_record.id::text), 21, 12)
    )::uuid;

    INSERT INTO public.finance_receipts (
      id,
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
      new_event_id,
      income_record.organization_id,
      income_record.property_id,
      coalesce(income_record.received_date, income_record.due_date),
      income_record.amount_received,
      income_record.currency,
      income_record.payer_label,
      'BACKFILL-INCOME-' || income_record.id::text,
      income_record.created_at,
      coalesce(income_record.updated_by, income_record.created_by)
    );

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
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('finance-expense:' || expense_record.id::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.finance_payment_allocations AS allocation
      WHERE allocation.expense_item_id = expense_record.id
    ) THEN
      CONTINUE;
    END IF;

    new_event_id := (
      substr(md5('BACKFILL-EXPENSE-' || expense_record.id::text), 1, 8) || '-' ||
      substr(md5('BACKFILL-EXPENSE-' || expense_record.id::text), 9, 4) || '-' ||
      substr(md5('BACKFILL-EXPENSE-' || expense_record.id::text), 13, 4) || '-' ||
      substr(md5('BACKFILL-EXPENSE-' || expense_record.id::text), 17, 4) || '-' ||
      substr(md5('BACKFILL-EXPENSE-' || expense_record.id::text), 21, 12)
    )::uuid;

    INSERT INTO public.finance_payments (
      id,
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
      new_event_id,
      expense_record.organization_id,
      expense_record.property_id,
      coalesce(expense_record.paid_date, expense_record.invoice_date),
      expense_record.amount,
      expense_record.currency,
      expense_record.vendor_label,
      'BACKFILL-EXPENSE-' || expense_record.id::text,
      expense_record.created_at,
      coalesce(expense_record.updated_by, expense_record.created_by)
    );

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
REVOKE ALL ON FUNCTION public.reverse_finance_receipt(
  uuid, uuid, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_finance_payment(
  uuid, uuid, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.backfill_property_cash_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.record_finance_receipt(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.record_finance_payment(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.reverse_finance_receipt(
  uuid, uuid, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.reverse_finance_payment(
  uuid, uuid, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.refresh_finance_income_compatibility(uuid, uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.refresh_finance_expense_compatibility(uuid, uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.validate_property_cash_reversal() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_finance_settlement_derived_fields()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_finance_receipt(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_finance_receipt(
  uuid, uuid, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_finance_payment(
  uuid, uuid, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_finance_receipt(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_finance_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.reverse_finance_receipt(
  uuid, uuid, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.reverse_finance_payment(
  uuid, uuid, date, text
) TO authenticated;
