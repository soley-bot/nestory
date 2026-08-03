-- IPS Finance operational rework: owner payments, safe withdrawals, and a
-- compact per-property owner account without exposing a configurable GL.

CREATE SEQUENCE public.owner_payment_number_seq;

CREATE TABLE public.owner_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_invoice_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  payment_number text NOT NULL,
  received_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reference text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_payments_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_payments_number_unique UNIQUE (organization_id, payment_number),
  CONSTRAINT owner_payments_idempotency_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT owner_payments_invoice_fkey
    FOREIGN KEY (organization_id, owner_invoice_id)
    REFERENCES public.owner_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payments_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payments_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payments_amount_check CHECK (amount > 0),
  CONSTRAINT owner_payments_idempotency_check CHECK (length(trim(idempotency_key)) >= 8)
);

CREATE TABLE public.owner_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_payment_id uuid NOT NULL,
  owner_invoice_id uuid NOT NULL,
  owner_invoice_line_id uuid NOT NULL,
  amount numeric(14, 2) NOT NULL,
  allocation_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_payment_allocations_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_payment_allocations_payment_line_unique
    UNIQUE (owner_payment_id, owner_invoice_line_id),
  CONSTRAINT owner_payment_allocations_payment_fkey
    FOREIGN KEY (organization_id, owner_payment_id)
    REFERENCES public.owner_payments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payment_allocations_invoice_fkey
    FOREIGN KEY (organization_id, owner_invoice_id)
    REFERENCES public.owner_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payment_allocations_line_fkey
    FOREIGN KEY (organization_id, owner_invoice_line_id)
    REFERENCES public.owner_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_payment_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT owner_payment_allocations_order_check CHECK (allocation_order > 0)
);

CREATE TABLE public.property_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  withdrawal_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reference text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT property_withdrawals_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT property_withdrawals_idempotency_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT property_withdrawals_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT property_withdrawals_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT property_withdrawals_amount_check CHECK (amount > 0),
  CONSTRAINT property_withdrawals_idempotency_check CHECK (length(trim(idempotency_key)) >= 8)
);

CREATE INDEX owner_payments_invoice_idx
  ON public.owner_payments(organization_id, owner_invoice_id, received_date, id);
CREATE INDEX owner_payment_allocations_line_idx
  ON public.owner_payment_allocations(organization_id, owner_invoice_line_id);
CREATE INDEX property_withdrawals_property_idx
  ON public.property_withdrawals(organization_id, property_id, withdrawal_date DESC, id DESC);

ALTER TABLE public.owner_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read owner payments"
ON public.owner_payments FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY "Organization members can read owner payment allocations"
ON public.owner_payment_allocations FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY "Organization members can read property withdrawals"
ON public.property_withdrawals FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

REVOKE ALL ON SEQUENCE public.owner_payment_number_seq
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE
  public.owner_payments,
  public.owner_payment_allocations,
  public.property_withdrawals
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.owner_payments,
  public.owner_payment_allocations,
  public.property_withdrawals
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.property_held_cash_balance(
  p_organization_id uuid,
  p_property_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH rent_cash AS (
    SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2) AS amount
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
     AND line.id = allocation.invoice_line_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = allocation.organization_id
     AND invoice.id = allocation.invoice_id
    JOIN public.finance_receipts AS receipt
      ON receipt.organization_id = allocation.organization_id
     AND receipt.id = allocation.finance_receipt_id
    WHERE allocation.organization_id = p_organization_id
      AND invoice.property_id = p_property_id
      AND line.line_type = 'rent'
      AND receipt.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_receipts AS reversal
        WHERE reversal.organization_id = receipt.organization_id
          AND reversal.reversal_of_id = receipt.id
      )
  ), charge_cash AS (
    SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2) AS amount
    FROM public.owner_charge_cash_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.property_id = p_property_id
  ), withdrawals AS (
    SELECT coalesce(sum(withdrawal.amount), 0)::numeric(14, 2) AS amount
    FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.property_id = p_property_id
  )
  SELECT greatest(
    rent_cash.amount - charge_cash.amount - withdrawals.amount,
    0
  )::numeric(14, 2)
  FROM rent_cash CROSS JOIN charge_cash CROSS JOIN withdrawals;
$$;

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
  v_invoice public.owner_invoices%ROWTYPE;
  v_existing_id uuid;
  v_payment_id uuid := gen_random_uuid();
  v_payment_number text;
  v_invoice_total numeric(14, 2);
  v_paid_total numeric(14, 2);
  v_balance numeric(14, 2);
  v_remaining numeric(14, 2);
  v_line_balance numeric(14, 2);
  v_allocate numeric(14, 2);
  v_order integer := 0;
  v_line record;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (SELECT app_private.is_org_admin(p_organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT payment.id
  INTO v_existing_id
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  IF p_received_date IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment date and positive amount are required'
      USING ERRCODE = '22023';
  END IF;

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

  SELECT
    coalesce(sum(line.amount), 0),
    coalesce(sum(cash.amount), 0) + coalesce(sum(owner_paid.amount), 0)
  INTO v_invoice_total, v_paid_total
  FROM public.owner_invoice_lines AS line
  LEFT JOIN LATERAL (
    SELECT sum(allocation.amount)::numeric(14, 2) AS amount
    FROM public.owner_charge_cash_allocations AS allocation
    WHERE allocation.organization_id = line.organization_id
      AND allocation.owner_invoice_line_id = line.id
  ) AS cash ON true
  LEFT JOIN LATERAL (
    SELECT sum(allocation.amount)::numeric(14, 2) AS amount
    FROM public.owner_payment_allocations AS allocation
    WHERE allocation.organization_id = line.organization_id
      AND allocation.owner_invoice_line_id = line.id
  ) AS owner_paid ON true
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = v_invoice.id;

  v_balance := greatest(v_invoice_total - v_paid_total, 0)::numeric(14, 2);

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
    NULLIF(trim(coalesce(p_reference, '')), ''),
    v_idempotency_key,
    v_actor_id
  );

  v_remaining := p_amount;

  FOR v_line IN
    SELECT
      line.id,
      line.source_type,
      line.source_id,
      line.amount,
      coalesce(cash.amount, 0)::numeric(14, 2) AS cash_paid,
      coalesce(owner_paid.amount, 0)::numeric(14, 2) AS owner_paid
    FROM public.owner_invoice_lines AS line
    LEFT JOIN LATERAL (
      SELECT sum(allocation.amount)::numeric(14, 2) AS amount
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = line.organization_id
        AND allocation.owner_invoice_line_id = line.id
    ) AS cash ON true
    LEFT JOIN LATERAL (
      SELECT sum(allocation.amount)::numeric(14, 2) AS amount
      FROM public.owner_payment_allocations AS allocation
      WHERE allocation.organization_id = line.organization_id
        AND allocation.owner_invoice_line_id = line.id
    ) AS owner_paid ON true
    WHERE line.organization_id = p_organization_id
      AND line.invoice_id = v_invoice.id
    ORDER BY line.sort_order, line.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_line_balance := greatest(
      v_line.amount - v_line.cash_paid - v_line.owner_paid,
      0
    )::numeric(14, 2);
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
        WHEN v_line.cash_paid + v_line.owner_paid + v_allocate >= v_line.amount
          THEN 'settled'
        ELSE 'split'
      END
      WHERE fee.organization_id = p_organization_id
        AND fee.id = v_line.source_id;
    ELSIF v_line.source_type = 'owner_expense' THEN
      UPDATE public.ips_expense_responsibilities AS responsibility
      SET held_cash_amount = v_line.cash_paid,
          ips_advance_amount = greatest(
            v_line.amount - v_line.cash_paid - v_line.owner_paid - v_allocate,
            0
          ),
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
  v_existing_id uuid;
  v_owner_person_id uuid;
  v_available numeric(14, 2);
  v_withdrawal_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (SELECT app_private.is_org_admin(p_organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT withdrawal.id
  INTO v_existing_id
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  IF p_withdrawal_date IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Withdrawal date and positive amount are required'
      USING ERRCODE = '22023';
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
    NULLIF(trim(coalesce(p_reference, '')), ''),
    v_idempotency_key,
    v_actor_id
  )
  RETURNING id INTO v_withdrawal_id;

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

DROP VIEW public.owner_invoice_balances;

CREATE VIEW public.owner_invoice_balances
WITH (security_invoker = true)
AS
WITH line_totals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(line.amount)::numeric(14, 2) AS total_amount
  FROM public.owner_invoice_lines AS line
  GROUP BY line.organization_id, line.invoice_id
), cash_totals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS paid_from_held_cash
  FROM public.owner_invoice_lines AS line
  JOIN public.owner_charge_cash_allocations AS allocation
    ON allocation.organization_id = line.organization_id
   AND allocation.owner_invoice_line_id = line.id
  GROUP BY line.organization_id, line.invoice_id
), owner_payment_totals AS (
  SELECT
    allocation.organization_id,
    allocation.owner_invoice_id AS invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS paid_by_owner
  FROM public.owner_payment_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.owner_invoice_id
)
SELECT
  invoice.*,
  coalesce(line_totals.total_amount, 0)::numeric(14, 2) AS total_amount,
  coalesce(cash_totals.paid_from_held_cash, 0)::numeric(14, 2) AS paid_from_held_cash,
  coalesce(owner_payment_totals.paid_by_owner, 0)::numeric(14, 2) AS paid_by_owner,
  greatest(
    coalesce(line_totals.total_amount, 0)
      - coalesce(cash_totals.paid_from_held_cash, 0)
      - coalesce(owner_payment_totals.paid_by_owner, 0),
    0
  )::numeric(14, 2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN coalesce(cash_totals.paid_from_held_cash, 0)
       + coalesce(owner_payment_totals.paid_by_owner, 0) <= 0 THEN 'unpaid'
    WHEN coalesce(cash_totals.paid_from_held_cash, 0)
       + coalesce(owner_payment_totals.paid_by_owner, 0)
       >= coalesce(line_totals.total_amount, 0) THEN 'paid'
    ELSE 'partly_paid'
  END AS payment_status
FROM public.owner_invoices AS invoice
LEFT JOIN line_totals
  ON line_totals.organization_id = invoice.organization_id
 AND line_totals.invoice_id = invoice.id
LEFT JOIN cash_totals
  ON cash_totals.organization_id = invoice.organization_id
 AND cash_totals.invoice_id = invoice.id
LEFT JOIN owner_payment_totals
  ON owner_payment_totals.organization_id = invoice.organization_id
 AND owner_payment_totals.invoice_id = invoice.id;

CREATE VIEW public.property_account_entries
WITH (security_invoker = true)
AS
WITH events AS (
  SELECT
    allocation.organization_id,
    invoice.property_id,
    invoice.unit_id,
    invoice.lease_id,
    payment.received_date AS event_date,
    'rent_income'::text AS category,
    'Rent'::text AS label,
    'Collected by IPS'::text AS note,
    allocation.amount::numeric(14, 2) AS amount,
    allocation.amount::numeric(14, 2) AS balance_effect,
    'tenant_invoice_payment'::text AS source_type,
    allocation.id AS source_id,
    allocation.created_at
  FROM public.tenant_invoice_payment_allocations AS allocation
  JOIN public.tenant_invoice_payments AS payment
    ON payment.organization_id = allocation.organization_id
   AND payment.id = allocation.payment_id
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = allocation.organization_id
   AND line.id = allocation.invoice_line_id
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.invoice_id
  JOIN public.finance_receipts AS receipt
    ON receipt.organization_id = allocation.organization_id
   AND receipt.id = allocation.finance_receipt_id
  WHERE line.line_type = 'rent'
    AND receipt.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = receipt.organization_id
        AND reversal.reversal_of_id = receipt.id
    )

  UNION ALL

  SELECT
    allocation.organization_id,
    invoice.property_id,
    invoice.unit_id,
    invoice.lease_id,
    confirmation.confirmed_date,
    'rent_income',
    'Rent',
    'Collected by owner',
    allocation.amount::numeric(14, 2),
    allocation.amount::numeric(14, 2),
    'owner_collection_confirmation',
    allocation.id,
    allocation.created_at
  FROM public.owner_collection_confirmation_allocations AS allocation
  JOIN public.owner_collection_confirmations AS confirmation
    ON confirmation.organization_id = allocation.organization_id
   AND confirmation.id = allocation.confirmation_id
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = allocation.organization_id
   AND line.id = allocation.invoice_line_id
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.invoice_id
  WHERE line.line_type = 'rent'

  UNION ALL

  SELECT
    fee.organization_id,
    fee.property_id,
    invoice.unit_id,
    fee.lease_id,
    fee.fee_date,
    'management_fee_expense',
    'Management fee',
    NULL::text,
    fee.amount::numeric(14, 2),
    -fee.amount::numeric(14, 2),
    'management_fee_occurrence',
    fee.id,
    fee.created_at
  FROM public.management_fee_occurrences AS fee
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = fee.organization_id
   AND invoice.id = fee.tenant_invoice_id

  UNION ALL

  SELECT
    responsibility.organization_id,
    responsibility.property_id,
    expense.unit_id,
    NULL::uuid,
    expense.invoice_date,
    'owner_expense',
    responsibility.customer_label,
    expense.vendor_label,
    responsibility.customer_total_amount::numeric(14, 2),
    -responsibility.customer_total_amount::numeric(14, 2),
    'ips_expense_responsibility',
    responsibility.id,
    responsibility.created_at
  FROM public.ips_expense_responsibilities AS responsibility
  JOIN public.finance_expense_items AS expense
    ON expense.organization_id = responsibility.organization_id
   AND expense.id = responsibility.finance_expense_item_id
  WHERE responsibility.responsibility = 'owner'

  UNION ALL

  SELECT
    withdrawal.organization_id,
    withdrawal.property_id,
    NULL::uuid,
    NULL::uuid,
    withdrawal.withdrawal_date,
    'withdrawal',
    'Owner withdrawal',
    withdrawal.reference,
    withdrawal.amount::numeric(14, 2),
    -withdrawal.amount::numeric(14, 2),
    'property_withdrawal',
    withdrawal.id,
    withdrawal.created_at
  FROM public.property_withdrawals AS withdrawal
)
SELECT
  event.organization_id,
  event.property_id,
  event.unit_id,
  event.lease_id,
  event.event_date,
  event.category,
  event.label,
  event.note,
  event.amount,
  event.balance_effect,
  sum(event.balance_effect) OVER (
    PARTITION BY event.organization_id, event.property_id
    ORDER BY event.event_date, event.created_at, event.source_type, event.source_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )::numeric(14, 2) AS running_balance,
  event.source_type,
  event.source_id,
  event.created_at
FROM events AS event;

CREATE VIEW public.property_finance_positions
WITH (security_invoker = true)
AS
WITH current_owner AS (
  SELECT
    owner_link.organization_id,
    owner_link.property_id,
    owner_link.person_id AS owner_person_id
  FROM public.property_owners AS owner_link
  WHERE owner_link.is_primary
    AND owner_link.archived_at IS NULL
    AND (owner_link.started_on IS NULL OR owner_link.started_on <= current_date)
    AND (owner_link.ended_on IS NULL OR owner_link.ended_on >= current_date)
), rent_income AS (
  SELECT
    entry.organization_id,
    entry.property_id,
    sum(entry.amount)::numeric(14, 2) AS amount
  FROM public.property_account_entries AS entry
  WHERE entry.category = 'rent_income'
  GROUP BY entry.organization_id, entry.property_id
), fee_expense AS (
  SELECT
    fee.organization_id,
    fee.property_id,
    sum(fee.amount)::numeric(14, 2) AS amount
  FROM public.management_fee_occurrences AS fee
  GROUP BY fee.organization_id, fee.property_id
), owner_expense AS (
  SELECT
    responsibility.organization_id,
    responsibility.property_id,
    sum(responsibility.customer_total_amount)::numeric(14, 2) AS amount
  FROM public.ips_expense_responsibilities AS responsibility
  WHERE responsibility.responsibility = 'owner'
  GROUP BY responsibility.organization_id, responsibility.property_id
), withdrawal_total AS (
  SELECT
    withdrawal.organization_id,
    withdrawal.property_id,
    sum(withdrawal.amount)::numeric(14, 2) AS amount
  FROM public.property_withdrawals AS withdrawal
  GROUP BY withdrawal.organization_id, withdrawal.property_id
), ips_rent_cash AS (
  SELECT
    invoice.organization_id,
    invoice.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.tenant_invoice_payment_allocations AS allocation
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = allocation.organization_id
   AND line.id = allocation.invoice_line_id
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.invoice_id
  JOIN public.finance_receipts AS receipt
    ON receipt.organization_id = allocation.organization_id
   AND receipt.id = allocation.finance_receipt_id
  WHERE line.line_type = 'rent'
    AND receipt.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = receipt.organization_id
        AND reversal.reversal_of_id = receipt.id
    )
  GROUP BY invoice.organization_id, invoice.property_id
), charge_cash AS (
  SELECT
    allocation.organization_id,
    allocation.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.owner_charge_cash_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.property_id
), owner_charge_total AS (
  SELECT
    line.organization_id,
    line.property_id,
    sum(line.amount)::numeric(14, 2) AS amount
  FROM public.owner_invoice_lines AS line
  GROUP BY line.organization_id, line.property_id
), owner_paid AS (
  SELECT
    invoice.organization_id,
    invoice.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.owner_payment_allocations AS allocation
  JOIN public.owner_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.owner_invoice_id
  GROUP BY invoice.organization_id, invoice.property_id
)
SELECT
  property.organization_id,
  property.id AS property_id,
  property.code AS property_code,
  property.name AS property_name,
  current_owner.owner_person_id,
  'USD'::public.currency_code AS currency,
  coalesce(rent_income.amount, 0)::numeric(14, 2) AS rent_income,
  coalesce(fee_expense.amount, 0)::numeric(14, 2) AS management_fee_expense,
  coalesce(owner_expense.amount, 0)::numeric(14, 2) AS owner_expense,
  coalesce(withdrawal_total.amount, 0)::numeric(14, 2) AS withdrawals,
  (
    coalesce(rent_income.amount, 0)
      - coalesce(fee_expense.amount, 0)
      - coalesce(owner_expense.amount, 0)
      - coalesce(withdrawal_total.amount, 0)
  )::numeric(14, 2) AS running_balance,
  greatest(
    coalesce(ips_rent_cash.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(withdrawal_total.amount, 0),
    0
  )::numeric(14, 2) AS cash_held_by_ips,
  greatest(
    coalesce(owner_charge_total.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(owner_paid.amount, 0),
    0
  )::numeric(14, 2) AS owner_owes_ips,
  greatest(
    coalesce(ips_rent_cash.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(withdrawal_total.amount, 0),
    0
  )::numeric(14, 2) AS available_withdrawal
FROM public.properties AS property
LEFT JOIN current_owner
  ON current_owner.organization_id = property.organization_id
 AND current_owner.property_id = property.id
LEFT JOIN rent_income
  ON rent_income.organization_id = property.organization_id
 AND rent_income.property_id = property.id
LEFT JOIN fee_expense
  ON fee_expense.organization_id = property.organization_id
 AND fee_expense.property_id = property.id
LEFT JOIN owner_expense
  ON owner_expense.organization_id = property.organization_id
 AND owner_expense.property_id = property.id
LEFT JOIN withdrawal_total
  ON withdrawal_total.organization_id = property.organization_id
 AND withdrawal_total.property_id = property.id
LEFT JOIN ips_rent_cash
  ON ips_rent_cash.organization_id = property.organization_id
 AND ips_rent_cash.property_id = property.id
LEFT JOIN charge_cash
  ON charge_cash.organization_id = property.organization_id
 AND charge_cash.property_id = property.id
LEFT JOIN owner_charge_total
  ON owner_charge_total.organization_id = property.organization_id
 AND owner_charge_total.property_id = property.id
LEFT JOIN owner_paid
  ON owner_paid.organization_id = property.organization_id
 AND owner_paid.property_id = property.id
WHERE property.archived_at IS NULL;

REVOKE ALL ON TABLE
  public.owner_invoice_balances,
  public.property_account_entries,
  public.property_finance_positions
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.owner_invoice_balances,
  public.property_account_entries,
  public.property_finance_positions
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_owner_invoice_payment(uuid, uuid, numeric, date, text, text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_property_withdrawal(uuid, uuid, numeric, date, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_owner_invoice_payment(uuid, uuid, numeric, date, text, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_property_withdrawal(uuid, uuid, numeric, date, text, text)
TO authenticated;

COMMENT ON VIEW public.property_finance_positions IS
  'Compact property-level owner finance position: recognized rent, fees, owner costs, withdrawals, held cash, owner due, and safe withdrawal.';
COMMENT ON VIEW public.property_account_entries IS
  'Simple property owner account entries with rent, management fee, owner expense, withdrawal, and a running balance.';
