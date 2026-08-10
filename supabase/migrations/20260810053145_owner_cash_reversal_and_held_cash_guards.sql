ALTER TABLE public.property_withdrawals
  ADD COLUMN command_payload_hash text,
  ADD CONSTRAINT property_withdrawals_command_payload_hash_check CHECK (
    command_payload_hash IS NULL OR command_payload_hash ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.owner_payments
  ADD COLUMN command_payload_hash text,
  ADD CONSTRAINT owner_payments_command_payload_hash_check CHECK (
    command_payload_hash IS NULL OR command_payload_hash ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.owner_payment_allocations
  ADD COLUMN signed_amount numeric(14,2);

UPDATE public.owner_payment_allocations
SET signed_amount = amount;

ALTER TABLE public.owner_payment_allocations
  ALTER COLUMN signed_amount SET NOT NULL,
  ADD CONSTRAINT owner_payment_allocations_signed_amount_check CHECK (
    (
      reversal_of_allocation_id IS NULL
      AND signed_amount = amount
    )
    OR
    (
      reversal_of_allocation_id IS NOT NULL
      AND signed_amount = -amount
    )
  );

CREATE OR REPLACE FUNCTION app_private.derive_owner_payment_allocation_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.signed_amount := CASE
    WHEN NEW.reversal_of_allocation_id IS NULL THEN NEW.amount
    ELSE -NEW.amount
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.derive_owner_payment_allocation_sign() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.derive_owner_payment_allocation_sign()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER derive_owner_payment_allocation_sign
  BEFORE INSERT ON public.owner_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app_private.derive_owner_payment_allocation_sign();

CREATE OR REPLACE FUNCTION app_private.guard_owner_payment_allocation_outstanding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_outstanding numeric(14,2);
  v_original public.owner_payment_allocations%ROWTYPE;
BEGIN
  IF NEW.reversal_of_allocation_id IS NOT NULL THEN
    SELECT allocation.*
    INTO v_original
    FROM public.owner_payment_allocations AS allocation
    WHERE allocation.organization_id = NEW.organization_id
      AND allocation.id = NEW.reversal_of_allocation_id
    FOR KEY SHARE;
    IF NOT FOUND
      OR v_original.reversal_of_allocation_id IS NOT NULL
      OR ROW(
        NEW.owner_invoice_id,
        NEW.owner_invoice_line_id,
        NEW.amount
      ) IS DISTINCT FROM ROW(
        v_original.owner_invoice_id,
        v_original.owner_invoice_line_id,
        v_original.amount
      ) THEN
      RAISE EXCEPTION 'owner_payment_reversal_allocation_mismatch'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  v_outstanding := app_private.owner_invoice_line_outstanding(
    NEW.organization_id,
    NEW.owner_invoice_line_id
  );
  IF v_outstanding IS NOT NULL AND NEW.amount > v_outstanding THEN
    RAISE EXCEPTION 'Owner payment exceeds adjusted invoice line balance'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_payment_allocation_outstanding() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_payment_allocation_outstanding()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.owner_invoice_balances
WITH (security_invoker = true)
AS
WITH line_totals AS (
  SELECT line.organization_id, line.invoice_id,
    pg_catalog.sum(line.amount)::numeric(14,2) AS total_amount
  FROM public.owner_invoice_lines AS line
  GROUP BY line.organization_id, line.invoice_id
), adjustment_totals AS (
  SELECT adjustment.organization_id,
    adjustment.owner_invoice_id AS invoice_id,
    pg_catalog.sum(adjustment.amount)::numeric(14,2) AS total_amount
  FROM public.expense_customer_adjustments AS adjustment
  WHERE adjustment.owner_invoice_id IS NOT NULL
  GROUP BY adjustment.organization_id, adjustment.owner_invoice_id
), cash_totals AS (
  SELECT line.organization_id, line.invoice_id,
    pg_catalog.sum(allocation.amount)::numeric(14,2) AS paid_from_held_cash
  FROM public.owner_invoice_lines AS line
  JOIN public.owner_charge_cash_allocations AS allocation
    ON allocation.organization_id = line.organization_id
    AND allocation.owner_invoice_line_id = line.id
  GROUP BY line.organization_id, line.invoice_id
), owner_payment_totals AS (
  SELECT allocation.organization_id,
    allocation.owner_invoice_id AS invoice_id,
    pg_catalog.sum(allocation.signed_amount)::numeric(14,2) AS paid_by_owner
  FROM public.owner_payment_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.owner_invoice_id
), totals AS (
  SELECT
    invoice.organization_id,
    invoice.id AS invoice_id,
    (
      coalesce(line_totals.total_amount, 0)
      + coalesce(adjustment_totals.total_amount, 0)
    )::numeric(14,2) AS total_amount,
    coalesce(cash_totals.paid_from_held_cash, 0)::numeric(14,2)
      AS paid_from_held_cash,
    coalesce(owner_payment_totals.paid_by_owner, 0)::numeric(14,2)
      AS paid_by_owner
  FROM public.owner_invoices AS invoice
  LEFT JOIN line_totals
    ON line_totals.organization_id = invoice.organization_id
    AND line_totals.invoice_id = invoice.id
  LEFT JOIN adjustment_totals
    ON adjustment_totals.organization_id = invoice.organization_id
    AND adjustment_totals.invoice_id = invoice.id
  LEFT JOIN cash_totals
    ON cash_totals.organization_id = invoice.organization_id
    AND cash_totals.invoice_id = invoice.id
  LEFT JOIN owner_payment_totals
    ON owner_payment_totals.organization_id = invoice.organization_id
    AND owner_payment_totals.invoice_id = invoice.id
)
SELECT
  invoice.id,
  invoice.organization_id,
  invoice.property_id,
  invoice.owner_person_id,
  invoice.invoice_number,
  invoice.billing_period_start,
  invoice.issue_date,
  invoice.due_date,
  invoice.currency,
  invoice.lifecycle,
  invoice.idempotency_key,
  invoice.voided_at,
  invoice.voided_by,
  invoice.created_at,
  invoice.created_by,
  totals.total_amount,
  totals.paid_from_held_cash,
  totals.paid_by_owner,
  greatest(
    totals.total_amount - totals.paid_from_held_cash - totals.paid_by_owner,
    0
  )::numeric(14,2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN totals.total_amount <= 0 THEN 'paid'
    WHEN totals.paid_from_held_cash + totals.paid_by_owner <= 0 THEN 'unpaid'
    WHEN totals.paid_from_held_cash + totals.paid_by_owner >= totals.total_amount
      THEN 'paid'
    ELSE 'partly_paid'
  END AS payment_status
FROM public.owner_invoices AS invoice
JOIN totals
  ON totals.organization_id = invoice.organization_id
  AND totals.invoice_id = invoice.id;

CREATE OR REPLACE FUNCTION public.get_owner_available_withdrawal(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_as_of_date date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_opening numeric(14,2);
  v_movements numeric(14,2);
  v_pending numeric(14,2);
  v_authoritative numeric(14,2);
  v_available numeric(14,2);
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_withdrawal_capacity_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_as_of_date IS NULL THEN
    RAISE EXCEPTION 'owner_withdrawal_as_of_date_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner_withdrawal_property_not_found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_owner_person_id
  ) THEN
    RAISE EXCEPTION 'owner_withdrawal_owner_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT coalesce(pg_catalog.sum(entry.signed_amount), 0)::numeric(14,2)
  INTO v_opening
  FROM public.owner_opening_balance_entries AS entry
  WHERE entry.organization_id = p_organization_id
    AND entry.property_id = p_property_id
    AND entry.owner_person_id = p_owner_person_id
    AND entry.currency = p_currency
    AND entry.component = 'ips_held_owner_cash'
    AND entry.effective_date <= p_as_of_date;

  SELECT coalesce(pg_catalog.sum(movement.signed_amount), 0)::numeric(14,2)
  INTO v_movements
  FROM public.owner_component_movements AS movement
  WHERE movement.organization_id = p_organization_id
    AND movement.property_id = p_property_id
    AND movement.owner_person_id = p_owner_person_id
    AND movement.currency = p_currency
    AND movement.component = 'ips_held_owner_cash'
    AND movement.event_date <= p_as_of_date;

  SELECT coalesce(pg_catalog.sum(withdrawal.amount), 0)::numeric(14,2)
  INTO v_pending
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.property_id = p_property_id
    AND withdrawal.owner_person_id = p_owner_person_id
    AND withdrawal.currency = p_currency
    AND withdrawal.withdrawal_date <= p_as_of_date
    AND withdrawal.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = withdrawal.organization_id
        AND allocation_set.source_type = 'owner_distribution'
        AND allocation_set.source_line_id = withdrawal.id
    );

  v_authoritative := (v_opening + v_movements)::numeric(14,2);
  v_available := greatest(v_authoritative - v_pending, 0)::numeric(14,2);

  RETURN pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'as_of_date', p_as_of_date::text,
    'authoritative_held_cash', pg_catalog.to_char(v_authoritative, 'FM999999999990.00'),
    'committed_reserved', pg_catalog.to_char(v_pending, 'FM999999999990.00'),
    'available_withdrawal', pg_catalog.to_char(v_available, 'FM999999999990.00')
  );
END;
$$;

ALTER FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_owner_distribution(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_amount numeric,
  p_distribution_date date,
  p_reference text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reference text := nullif(pg_catalog.btrim(p_reference), '');
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_existing public.property_withdrawals%ROWTYPE;
  v_roster record;
  v_capacity jsonb;
  v_available numeric(14,2);
  v_withdrawal_id uuid;
  v_allocation_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_distribution_date IS NULL THEN
    RAISE EXCEPTION 'owner_distribution_date_required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
    OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'owner_distribution_amount_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_reference IS NULL OR pg_catalog.length(v_reference) > 240 THEN
    RAISE EXCEPTION 'owner_distribution_reference_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_distribution_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'distribution_date', p_distribution_date::text,
    'reference', v_reference
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'record_owner_distribution',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_distribution_date
  );
  IF app_private.is_financial_month_locked(p_organization_id, p_distribution_date) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_held_cash_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text,
        pg_catalog.date_trunc('month', p_distribution_date)::date::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_owner_distribution',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT roster.*
  INTO v_roster
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id,
    p_property_id,
    p_distribution_date
  ) AS roster
  WHERE roster.owner_person_id = p_owner_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'explicit_owner_not_in_effective_roster'
      USING ERRCODE = '23503';
  END IF;

  SELECT withdrawal.*
  INTO v_existing
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.idempotency_key = v_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.command_payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'property_withdrawal_id', v_existing.id::text,
      'allocation_set_id', allocation_set.id::text,
      'amount', pg_catalog.to_char(v_existing.amount, 'FM999999999990.00')
    )
    INTO STRICT v_allocation_result
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = 'owner_distribution'
      AND allocation_set.source_line_id = v_existing.id;
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_allocation_result
    );
    RETURN v_allocation_result;
  END IF;

  v_capacity := public.get_owner_available_withdrawal(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_distribution_date
  );
  v_available := (v_capacity->>'available_withdrawal')::numeric(14,2);
  IF v_available < p_amount THEN
    RAISE EXCEPTION 'insufficient_authoritative_held_cash'
      USING ERRCODE = '23514';
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
    created_by,
    command_payload_hash
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_distribution_date,
    p_amount::numeric(14,2),
    p_currency,
    v_reference,
    v_idempotency_key,
    v_actor_id,
    v_payload_hash
  )
  RETURNING id INTO v_withdrawal_id;

  v_allocation_result := public.allocate_owner_event(
    p_organization_id,
    'owner_distribution',
    v_withdrawal_id,
    v_idempotency_key
  );

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'property_withdrawal_id', v_withdrawal_id::text,
    'allocation_set_id', v_allocation_result->>'allocation_set_id',
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'available_after', pg_catalog.to_char(v_available - p_amount, 'FM999999999990.00')
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_property_withdrawal(
  p_organization_id uuid,
  p_withdrawal_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_original public.property_withdrawals%ROWTYPE;
  v_existing public.property_withdrawals%ROWTYPE;
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_reversal_id uuid;
  v_allocation_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_reversal_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reversal_date IS NULL THEN
    RAISE EXCEPTION 'owner_distribution_reversal_date_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_distribution_reversal_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_distribution_reversal_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'withdrawal_id', p_withdrawal_id::text,
    'reversal_date', p_reversal_date::text,
    'reason', v_reason
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'reverse_property_withdrawal',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT withdrawal.*
  INTO v_original
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = p_withdrawal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_distribution_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_original.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'owner_distribution_reversal_target_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_reversal_date < v_original.withdrawal_date THEN
    RAISE EXCEPTION 'owner_distribution_reversal_date_precedes_original'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    v_original.property_id,
    v_original.currency,
    p_reversal_date
  );
  IF app_private.is_financial_month_locked(p_organization_id, p_reversal_date) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_held_cash_v1',
        p_organization_id::text,
        v_original.property_id::text,
        v_original.owner_person_id::text,
        v_original.currency::text,
        pg_catalog.date_trunc('month', p_reversal_date)::date::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'reverse_property_withdrawal',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT withdrawal.*
  INTO STRICT v_original
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = p_withdrawal_id
  FOR UPDATE;

  SELECT withdrawal.*
  INTO v_existing
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.reversal_of_id = p_withdrawal_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key
      OR v_existing.command_payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'owner_distribution_already_reversed' USING ERRCODE = '23505';
    END IF;
    SELECT allocation_set.id
    INTO STRICT v_reversal_id
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = 'reversal'
      AND allocation_set.source_line_id = v_existing.id;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'property_withdrawal_id', v_existing.id::text,
      'allocation_set_id', v_reversal_id::text,
      'amount', pg_catalog.to_char(v_existing.amount, 'FM999999999990.00')
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
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
    created_by,
    reversal_of_id,
    reversal_reason,
    command_payload_hash
  ) VALUES (
    p_organization_id,
    v_original.property_id,
    v_original.owner_person_id,
    p_reversal_date,
    v_original.amount,
    v_original.currency,
    v_original.reference,
    v_idempotency_key,
    v_actor_id,
    v_original.id,
    v_reason,
    v_payload_hash
  )
  RETURNING id INTO v_reversal_id;

  v_allocation_result := public.allocate_owner_event(
    p_organization_id,
    'reversal',
    v_reversal_id,
    v_idempotency_key
  );

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'property_withdrawal_id', v_reversal_id::text,
    'reversal_of_id', v_original.id::text,
    'allocation_set_id', v_allocation_result->>'allocation_set_id',
    'amount', pg_catalog.to_char(v_original.amount, 'FM999999999990.00')
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.record_property_withdrawal(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_owner_invoice_payment(
  p_organization_id uuid,
  p_owner_payment_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_original public.owner_payments%ROWTYPE;
  v_existing public.owner_payments%ROWTYPE;
  v_original_allocation record;
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_allocation_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_allocation_result jsonb;
  v_allocation_set_ids jsonb := '[]'::jsonb;
  v_allocation_count integer := 0;
  v_downstream jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_payment_reversal_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reversal_date IS NULL THEN
    RAISE EXCEPTION 'owner_payment_reversal_date_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_payment_reversal_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 145 THEN
    RAISE EXCEPTION 'owner_payment_reversal_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'owner_payment_id', p_owner_payment_id::text,
    'reversal_date', p_reversal_date::text,
    'reason', v_reason
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'reverse_owner_invoice_payment',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT payment.*
  INTO v_original
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = p_owner_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_payment_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_original.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'owner_payment_reversal_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_reversal_date < v_original.received_date THEN
    RAISE EXCEPTION 'owner_payment_reversal_date_precedes_original'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    v_original.property_id,
    v_original.currency,
    p_reversal_date
  );
  IF app_private.is_financial_month_locked(p_organization_id, p_reversal_date) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_payment_reversal_v1',
        p_organization_id::text,
        v_original.property_id::text,
        v_original.owner_person_id::text,
        v_original.currency::text,
        p_owner_payment_id::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'reverse_owner_invoice_payment',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT payment.*
  INTO STRICT v_original
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = p_owner_payment_id
  FOR UPDATE;

  SELECT payment.*
  INTO v_existing
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.reversal_of_id = p_owner_payment_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key
      OR v_existing.command_payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'owner_payment_already_reversed' USING ERRCODE = '23505';
    END IF;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'owner_payment_id', v_existing.id::text,
      'reversal_of_id', p_owner_payment_id::text,
      'amount', pg_catalog.to_char(v_existing.amount, 'FM999999999990.00')
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_payment_allocations AS original_allocation
    WHERE original_allocation.organization_id = p_organization_id
      AND original_allocation.owner_payment_id = p_owner_payment_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_event_allocation_sets AS allocation_set
        WHERE allocation_set.organization_id = p_organization_id
          AND allocation_set.source_type = 'owner_invoice_payment'
          AND allocation_set.source_line_id = original_allocation.id
      )
  ) THEN
    RAISE EXCEPTION 'owner_payment_source_allocation_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'consumer_source_type', consumer_set.source_type,
      'consumer_source_id', consumer_set.source_id::text,
      'consumer_source_line_id', consumer_set.source_line_id::text,
      'consumed_amount', pg_catalog.to_char(consumption.consumed_amount, 'FM999999999990.00')
    ) ORDER BY consumer_set.source_type, consumer_set.source_line_id
  )
  INTO v_downstream
  FROM public.owner_payment_allocations AS original_payment_allocation
  JOIN public.owner_event_allocation_sets AS original_set
    ON original_set.organization_id = original_payment_allocation.organization_id
    AND original_set.source_type = 'owner_invoice_payment'
    AND original_set.source_line_id = original_payment_allocation.id
  JOIN public.owner_event_owner_allocations AS original_owner
    ON original_owner.organization_id = original_set.organization_id
    AND original_owner.allocation_set_id = original_set.id
  JOIN public.owner_component_movements AS original_movement
    ON original_movement.organization_id = original_owner.organization_id
    AND original_movement.owner_event_owner_allocation_id = original_owner.id
  JOIN public.owner_cash_source_consumptions AS consumption
    ON consumption.organization_id = original_movement.organization_id
    AND consumption.source_movement_id = original_movement.id
  JOIN public.owner_component_movements AS consumer_movement
    ON consumer_movement.organization_id = consumption.organization_id
    AND consumer_movement.id = consumption.consumer_movement_id
  JOIN public.owner_event_owner_allocations AS consumer_owner
    ON consumer_owner.organization_id = consumer_movement.organization_id
    AND consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets AS consumer_set
    ON consumer_set.organization_id = consumer_owner.organization_id
    AND consumer_set.id = consumer_owner.allocation_set_id
  WHERE original_payment_allocation.organization_id = p_organization_id
    AND original_payment_allocation.owner_payment_id = p_owner_payment_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.owner_component_movements AS consumer_reversal
      WHERE consumer_reversal.reversal_of_movement_id = consumer_movement.id
    );
  IF v_downstream IS NOT NULL THEN
    RAISE EXCEPTION 'dependent_owner_cash:%', v_downstream::text
      USING ERRCODE = '23514';
  END IF;

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
    created_by,
    reversal_of_id,
    reversal_reason,
    command_payload_hash
  ) VALUES (
    v_reversal_id,
    p_organization_id,
    v_original.owner_invoice_id,
    v_original.property_id,
    v_original.owner_person_id,
    'OPR-' || upper(pg_catalog.left(pg_catalog.replace(v_reversal_id::text, '-', ''), 12)),
    p_reversal_date,
    v_original.amount,
    v_original.currency,
    'Reversal of ' || v_original.payment_number,
    v_idempotency_key,
    v_actor_id,
    v_original.id,
    v_reason,
    v_payload_hash
  );

  FOR v_original_allocation IN
    SELECT allocation.*
    FROM public.owner_payment_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.owner_payment_id = p_owner_payment_id
    ORDER BY allocation.allocation_order, allocation.id
  LOOP
    v_allocation_count := v_allocation_count + 1;
    INSERT INTO public.owner_payment_allocations (
      organization_id,
      owner_payment_id,
      owner_invoice_id,
      owner_invoice_line_id,
      amount,
      allocation_order,
      created_by,
      reversal_of_allocation_id
    ) VALUES (
      p_organization_id,
      v_reversal_id,
      v_original_allocation.owner_invoice_id,
      v_original_allocation.owner_invoice_line_id,
      v_original_allocation.amount,
      v_original_allocation.allocation_order,
      v_actor_id,
      v_original_allocation.id
    )
    RETURNING id INTO v_reversal_allocation_id;

    v_allocation_result := public.allocate_owner_event(
      p_organization_id,
      'reversal',
      v_reversal_allocation_id,
      v_idempotency_key || ':' || pg_catalog.lpad(v_allocation_count::text, 3, '0')
    );
    v_allocation_set_ids := v_allocation_set_ids ||
      pg_catalog.jsonb_build_array(v_allocation_result->>'allocation_set_id');
  END LOOP;

  IF v_allocation_count = 0 THEN
    RAISE EXCEPTION 'owner_payment_has_no_allocations' USING ERRCODE = '23514';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'owner_payment_id', v_reversal_id::text,
    'reversal_of_id', v_original.id::text,
    'amount', pg_catalog.to_char(v_original.amount, 'FM999999999990.00'),
    'allocation_count', v_allocation_count,
    'allocation_set_ids', v_allocation_set_ids
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_owner_balance_component(
  p_organization_id uuid,
  p_property_id uuid,
  p_from_owner_person_id uuid,
  p_to_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_component public.owner_balance_component,
  p_amount numeric,
  p_reason text,
  p_evidence_reference text,
  p_evidence_sha256 text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_evidence_reference text := pg_catalog.btrim(p_evidence_reference);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_existing public.owner_component_transfer_instructions%ROWTYPE;
  v_to_roster record;
  v_balance numeric(14,2);
  v_instruction_id uuid;
  v_from_line_id uuid;
  v_to_line_id uuid;
  v_from_allocation jsonb;
  v_to_allocation jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR app_private.current_workspace_role(p_organization_id) IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'owner_component_transfer_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_from_owner_person_id IS NULL OR p_to_owner_person_id IS NULL
    OR p_from_owner_person_id = p_to_owner_person_id THEN
    RAISE EXCEPTION 'owner_component_transfer_owners_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'owner_component_transfer_date_required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
    OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'owner_component_transfer_amount_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_component_transfer_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_evidence_reference) NOT BETWEEN 3 AND 240
    OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'owner_component_transfer_evidence_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 150 THEN
    RAISE EXCEPTION 'owner_component_transfer_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'from_owner_person_id', p_from_owner_person_id::text,
    'to_owner_person_id', p_to_owner_person_id::text,
    'currency', p_currency::text,
    'effective_date', p_effective_date::text,
    'component', p_component::text,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'reason', v_reason,
    'evidence_reference', v_evidence_reference,
    'evidence_sha256', p_evidence_sha256
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'transfer_owner_balance_component',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );
  IF app_private.is_financial_month_locked(p_organization_id, p_effective_date) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_component_transfer_v1',
        p_organization_id::text,
        p_property_id::text,
        least(p_from_owner_person_id::text, p_to_owner_person_id::text),
        greatest(p_from_owner_person_id::text, p_to_owner_person_id::text),
        p_currency::text,
        pg_catalog.date_trunc('month', p_effective_date)::date::text,
        p_component::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'transfer_owner_balance_component',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT instruction.*
  INTO v_existing
  FROM public.owner_component_transfer_instructions AS instruction
  WHERE instruction.organization_id = p_organization_id
    AND instruction.idempotency_key = v_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'transfer_instruction_id', v_existing.id::text,
      'amount', pg_catalog.to_char(v_existing.amount, 'FM999999999990.00'),
      'component', v_existing.component::text
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.property_owners AS property_owner
    WHERE property_owner.organization_id = p_organization_id
      AND property_owner.property_id = p_property_id
      AND property_owner.person_id = p_from_owner_person_id
      AND property_owner.archived_at IS NULL
      AND property_owner.started_on <= p_effective_date
  ) THEN
    RAISE EXCEPTION 'transfer_from_owner_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT roster.*
  INTO v_to_roster
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id,
    p_property_id,
    p_effective_date
  ) AS roster
  WHERE roster.owner_person_id = p_to_owner_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_to_owner_not_effective' USING ERRCODE = '23503';
  END IF;

  SELECT (
    coalesce((
      SELECT pg_catalog.sum(entry.signed_amount)
      FROM public.owner_opening_balance_entries AS entry
      WHERE entry.organization_id = p_organization_id
        AND entry.property_id = p_property_id
        AND entry.owner_person_id = p_from_owner_person_id
        AND entry.currency = p_currency
        AND entry.component = p_component
        AND entry.effective_date <= p_effective_date
    ), 0)
    + coalesce((
      SELECT pg_catalog.sum(movement.signed_amount)
      FROM public.owner_component_movements AS movement
      WHERE movement.organization_id = p_organization_id
        AND movement.property_id = p_property_id
        AND movement.owner_person_id = p_from_owner_person_id
        AND movement.currency = p_currency
        AND movement.component = p_component
        AND movement.event_date <= p_effective_date
    ), 0)
  )::numeric(14,2)
  INTO v_balance;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_authoritative_component_balance'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context',
    'checked-owner-balance-v1',
    true
  );
  INSERT INTO public.owner_component_transfer_instructions (
    organization_id,
    property_id,
    from_owner_person_id,
    to_owner_person_id,
    currency,
    effective_date,
    component,
    amount,
    reason,
    evidence_reference,
    evidence_sha256,
    idempotency_key,
    payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_from_owner_person_id,
    p_to_owner_person_id,
    p_currency,
    p_effective_date,
    p_component,
    p_amount::numeric(14,2),
    v_reason,
    v_evidence_reference,
    p_evidence_sha256,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_instruction_id;

  INSERT INTO public.owner_component_transfer_lines (
    organization_id,
    transfer_instruction_id,
    owner_person_id,
    line_direction,
    signed_amount,
    created_by
  ) VALUES (
    p_organization_id,
    v_instruction_id,
    p_from_owner_person_id,
    'from_owner',
    -p_amount,
    v_actor_id
  )
  RETURNING id INTO v_from_line_id;

  INSERT INTO public.owner_component_transfer_lines (
    organization_id,
    transfer_instruction_id,
    owner_person_id,
    line_direction,
    signed_amount,
    created_by
  ) VALUES (
    p_organization_id,
    v_instruction_id,
    p_to_owner_person_id,
    'to_owner',
    p_amount,
    v_actor_id
  )
  RETURNING id INTO v_to_line_id;

  v_from_allocation := public.allocate_owner_event(
    p_organization_id,
    'owner_component_transfer',
    v_from_line_id,
    v_idempotency_key || ':from'
  );
  v_to_allocation := public.allocate_owner_event(
    p_organization_id,
    'owner_component_transfer',
    v_to_line_id,
    v_idempotency_key || ':to'
  );

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'transfer_instruction_id', v_instruction_id::text,
    'from_source_line_id', v_from_line_id::text,
    'to_source_line_id', v_to_line_id::text,
    'from_allocation_set_id', v_from_allocation->>'allocation_set_id',
    'to_allocation_set_id', v_to_allocation->>'allocation_set_id',
    'component', p_component::text,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00')
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) TO authenticated;

DO $clone_guarded_tenant_reversal$
DECLARE
  v_definition text;
  v_guarded_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reverse_tenant_invoice_payment(uuid,uuid,date,text,text)'::regprocedure
  )
  INTO v_definition;

  v_guarded_definition := pg_catalog.replace(
    v_definition,
    'CREATE OR REPLACE FUNCTION public.reverse_tenant_invoice_payment',
    'CREATE OR REPLACE FUNCTION app_private.reverse_tenant_invoice_payment_after_owner_cash_guard'
  );
  v_guarded_definition := pg_catalog.replace(
    v_guarded_definition,
    'OR NOT app_private.is_org_admin(p_organization_id)',
    'OR NOT app_private.can_correct_finance(p_organization_id)'
  );

  IF v_guarded_definition = v_definition
    OR pg_catalog.strpos(
      v_guarded_definition,
      'app_private.reverse_tenant_invoice_payment_after_owner_cash_guard'
    ) = 0
    OR pg_catalog.strpos(
      v_guarded_definition,
      'app_private.can_correct_finance(p_organization_id)'
    ) = 0 THEN
    RAISE EXCEPTION 'tenant_reversal_clone_contract_changed'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE v_guarded_definition;
END;
$clone_guarded_tenant_reversal$;

ALTER FUNCTION app_private.reverse_tenant_invoice_payment_after_owner_cash_guard(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.reverse_tenant_invoice_payment_after_owner_cash_guard(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_tenant_invoice_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property_id uuid;
  v_currency public.currency_code;
  v_original_movement record;
  v_reversal_payment_id uuid;
  v_reversal_allocation record;
  v_allocation_result jsonb;
  v_downstream jsonb;
  v_index integer := 0;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_payment_reversal_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT invoice.property_id, payment.currency
  INTO v_property_id, v_currency
  FROM public.tenant_invoice_payments AS payment
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = payment.organization_id
    AND invoice.id = payment.invoice_id
  WHERE payment.organization_id = p_organization_id
    AND payment.id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_payment_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    v_property_id,
    v_currency,
    p_reversal_date
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_held_cash_reversal_v1',
        p_organization_id::text,
        v_property_id::text,
        v_currency::text,
        p_payment_id::text
      ),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.tenant_invoice_payment_allocations AS payment_allocation
    JOIN public.tenant_invoice_lines AS invoice_line
      ON invoice_line.organization_id = payment_allocation.organization_id
      AND invoice_line.id = payment_allocation.invoice_line_id
    WHERE payment_allocation.organization_id = p_organization_id
      AND payment_allocation.payment_id = p_payment_id
      AND payment_allocation.reversal_of_allocation_id IS NULL
      AND invoice_line.line_type = 'rent'
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_event_allocation_sets AS allocation_set
        WHERE allocation_set.organization_id = p_organization_id
          AND allocation_set.source_type = 'tenant_rent_receipt'
          AND allocation_set.source_line_id = payment_allocation.id
      )
  ) THEN
    RAISE EXCEPTION 'tenant_payment_owner_allocation_required'
      USING ERRCODE = '23514';
  END IF;

  FOR v_original_movement IN
    SELECT movement.id
    FROM public.tenant_invoice_payment_allocations AS payment_allocation
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = payment_allocation.organization_id
      AND allocation_set.source_type = 'tenant_rent_receipt'
      AND allocation_set.source_line_id = payment_allocation.id
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
      AND owner_allocation.allocation_set_id = allocation_set.id
    JOIN public.owner_component_movements AS movement
      ON movement.organization_id = owner_allocation.organization_id
      AND movement.owner_event_owner_allocation_id = owner_allocation.id
    WHERE payment_allocation.organization_id = p_organization_id
      AND payment_allocation.payment_id = p_payment_id
      AND movement.component = 'ips_held_owner_cash'
      AND movement.signed_amount > 0
    ORDER BY owner_allocation.owner_person_id, movement.id
    FOR UPDATE OF movement
  LOOP
    NULL;
  END LOOP;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'consumer_source_type', consumer_set.source_type,
      'consumer_source_id', consumer_set.source_id::text,
      'consumer_source_line_id', consumer_set.source_line_id::text,
      'consumed_amount', pg_catalog.to_char(consumption.consumed_amount, 'FM999999999990.00')
    ) ORDER BY consumer_set.source_type, consumer_set.source_line_id
  )
  INTO v_downstream
  FROM public.tenant_invoice_payment_allocations AS payment_allocation
  JOIN public.owner_event_allocation_sets AS allocation_set
    ON allocation_set.organization_id = payment_allocation.organization_id
    AND allocation_set.source_type = 'tenant_rent_receipt'
    AND allocation_set.source_line_id = payment_allocation.id
  JOIN public.owner_event_owner_allocations AS owner_allocation
    ON owner_allocation.organization_id = allocation_set.organization_id
    AND owner_allocation.allocation_set_id = allocation_set.id
  JOIN public.owner_component_movements AS source_movement
    ON source_movement.organization_id = owner_allocation.organization_id
    AND source_movement.owner_event_owner_allocation_id = owner_allocation.id
  JOIN public.owner_cash_source_consumptions AS consumption
    ON consumption.organization_id = source_movement.organization_id
    AND consumption.source_movement_id = source_movement.id
  JOIN public.owner_component_movements AS consumer_movement
    ON consumer_movement.organization_id = consumption.organization_id
    AND consumer_movement.id = consumption.consumer_movement_id
  JOIN public.owner_event_owner_allocations AS consumer_owner
    ON consumer_owner.organization_id = consumer_movement.organization_id
    AND consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets AS consumer_set
    ON consumer_set.organization_id = consumer_owner.organization_id
    AND consumer_set.id = consumer_owner.allocation_set_id
  WHERE payment_allocation.organization_id = p_organization_id
    AND payment_allocation.payment_id = p_payment_id
    AND source_movement.component = 'ips_held_owner_cash'
    AND source_movement.signed_amount > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.owner_component_movements AS consumer_reversal
      WHERE consumer_reversal.reversal_of_movement_id = consumer_movement.id
    );
  IF v_downstream IS NOT NULL THEN
    RAISE EXCEPTION 'dependent_owner_cash:%', v_downstream::text
      USING ERRCODE = '23514';
  END IF;

  v_reversal_payment_id :=
    app_private.reverse_tenant_invoice_payment_after_owner_cash_guard(
      p_organization_id,
      p_payment_id,
      p_reversal_date,
      p_reason,
      p_idempotency_key
    );

  FOR v_reversal_allocation IN
    SELECT reversal.*
    FROM public.tenant_invoice_payment_allocations AS reversal
    JOIN public.tenant_invoice_lines AS invoice_line
      ON invoice_line.organization_id = reversal.organization_id
      AND invoice_line.id = reversal.invoice_line_id
    WHERE reversal.organization_id = p_organization_id
      AND reversal.payment_id = v_reversal_payment_id
      AND reversal.reversal_of_allocation_id IS NOT NULL
      AND invoice_line.line_type = 'rent'
    ORDER BY reversal.allocation_order, reversal.id
  LOOP
    v_index := v_index + 1;
    v_allocation_result := public.allocate_owner_event(
      p_organization_id,
      'reversal',
      v_reversal_allocation.id,
      pg_catalog.left(p_idempotency_key, 140) || ':owner:' ||
        pg_catalog.lpad(v_index::text, 3, '0')
    );
  END LOOP;

  RETURN v_reversal_payment_id;
END;
$$;

ALTER FUNCTION public.reverse_tenant_invoice_payment(uuid, uuid, date, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_tenant_invoice_payment(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_tenant_invoice_payment(uuid, uuid, date, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_correct_finance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

ALTER FUNCTION app_private.can_correct_finance(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.can_correct_finance(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_correct_finance(uuid) TO authenticated;
