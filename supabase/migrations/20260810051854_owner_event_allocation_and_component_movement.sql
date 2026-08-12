ALTER TABLE public.owner_event_allocation_sets
  ADD COLUMN idempotency_key text NOT NULL,
  ADD COLUMN command_payload_hash text NOT NULL,
  ADD CONSTRAINT owner_event_allocation_sets_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  ADD CONSTRAINT owner_event_allocation_sets_idempotency_check CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  ADD CONSTRAINT owner_event_allocation_sets_command_hash_check CHECK (
    command_payload_hash ~ '^[0-9a-f]{64}$'
  );

CREATE OR REPLACE FUNCTION app_private.owner_event_source_rule(
  p_source_type text
)
RETURNS TABLE (
  allocation_basis text,
  component public.owner_balance_component,
  gross_sign integer,
  activity_only boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT rule.allocation_basis, rule.component, rule.gross_sign, rule.activity_only
  FROM (
    VALUES
      ('tenant_rent_receipt', 'effective_roster', 'ips_held_owner_cash'::public.owner_balance_component, 1, false),
      ('owner_direct_rent_receipt', 'explicit_owner', NULL::public.owner_balance_component, 1, true),
      ('management_fee_occurrence', 'effective_roster', 'owner_due_to_ips'::public.owner_balance_component, 1, false),
      ('owner_paid_cost', 'effective_roster', 'owner_due_to_ips'::public.owner_balance_component, 1, false),
      ('owner_invoice_payment', 'explicit_owner', 'owner_due_to_ips'::public.owner_balance_component, -1, false),
      ('owner_contribution', 'explicit_owner', 'ips_held_owner_cash'::public.owner_balance_component, 1, false),
      ('owner_reimbursement', 'explicit_owner', 'ips_due_to_owner'::public.owner_balance_component, -1, false),
      ('owner_distribution', 'explicit_owner', 'ips_held_owner_cash'::public.owner_balance_component, -1, false),
      ('security_deposit_receipt', 'effective_roster', 'security_deposit_custody'::public.owner_balance_component, 1, false),
      ('security_deposit_refund', 'effective_roster', 'security_deposit_custody'::public.owner_balance_component, -1, false),
      ('owner_component_transfer', 'explicit_owner', NULL::public.owner_balance_component, 0, false),
      ('reversal', 'original_snapshot', NULL::public.owner_balance_component, -1, false)
  ) AS rule(source_type, allocation_basis, component, gross_sign, activity_only)
  WHERE rule.source_type = p_source_type;
$$;

ALTER FUNCTION app_private.owner_event_source_rule(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_event_source_rule(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.resolve_owner_event_source(
  p_organization_id uuid,
  p_source_type text,
  p_source_line_id uuid
)
RETURNS TABLE (
  source_id uuid,
  property_id uuid,
  currency public.currency_code,
  event_date date,
  gross_signed_amount numeric(14,2),
  allocation_basis text,
  explicit_owner_person_id uuid,
  component public.owner_balance_component,
  activity_only boolean,
  source_fingerprint text,
  reversal_of_allocation_set_id uuid
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_source_type text := pg_catalog.btrim(p_source_type);
  v_reversal record;
  v_reversal_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_private.owner_event_source_rule(v_source_type)
  ) THEN
    RAISE EXCEPTION 'source_unsupported' USING ERRCODE = '22023';
  END IF;

  IF v_source_type = 'tenant_rent_receipt' THEN
    RETURN QUERY
    SELECT
      allocation.payment_id,
      invoice.property_id,
      payment.currency,
      payment.received_date,
      allocation.signed_amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'ips_held_owner_cash'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'payment_id', allocation.payment_id::text,
          'invoice_id', allocation.invoice_id::text,
          'invoice_line_id', allocation.invoice_line_id::text,
          'property_id', invoice.property_id::text,
          'currency', payment.currency::text,
          'event_date', payment.received_date::text,
          'signed_amount', pg_catalog.to_char(allocation.signed_amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_payments AS payment
      ON payment.organization_id = allocation.organization_id
      AND payment.id = allocation.payment_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = allocation.organization_id
      AND invoice.id = allocation.invoice_id
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
      AND line.id = allocation.invoice_line_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND allocation.signed_amount > 0
      AND line.line_type = 'rent';
  ELSIF v_source_type = 'owner_direct_rent_receipt' THEN
    RETURN QUERY
    SELECT
      allocation.confirmation_id,
      allocation.property_id,
      allocation.currency,
      allocation.confirmed_date,
      allocation.signed_amount::numeric(14,2),
      'explicit_owner'::text,
      allocation.owner_person_id_snapshot,
      NULL::public.owner_balance_component,
      true,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'confirmation_id', allocation.confirmation_id::text,
          'invoice_line_id', allocation.invoice_line_id::text,
          'property_id', allocation.property_id::text,
          'owner_person_id', allocation.owner_person_id_snapshot::text,
          'currency', allocation.currency::text,
          'event_date', allocation.confirmed_date::text,
          'signed_amount', pg_catalog.to_char(allocation.signed_amount, 'FM999999999990.00'),
          'contract', allocation.settlement_contract_version
        )
      ),
      NULL::uuid
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND allocation.signed_amount > 0
      AND allocation.settlement_contract_version = 'owner_collection.v1';
  ELSIF v_source_type = 'management_fee_occurrence' THEN
    RETURN QUERY
    SELECT
      fee.id,
      fee.property_id,
      fee.currency,
      fee.fee_date,
      fee.amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', fee.id::text,
          'tenant_invoice_id', fee.tenant_invoice_id::text,
          'property_id', fee.property_id::text,
          'currency', fee.currency::text,
          'event_date', fee.fee_date::text,
          'amount', pg_catalog.to_char(fee.amount, 'FM999999999990.00'),
          'fee_mode', fee.fee_mode,
          'fee_value', fee.fee_value::text
        )
      ),
      NULL::uuid
    FROM public.management_fee_occurrences AS fee
    WHERE fee.organization_id = p_organization_id
      AND fee.id = p_source_line_id;
  ELSIF v_source_type = 'owner_paid_cost' THEN
    RETURN QUERY
    SELECT
      responsibility.finance_expense_item_id,
      responsibility.property_id,
      expense.currency,
      expense.invoice_date,
      responsibility.customer_total_amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', responsibility.id::text,
          'finance_expense_item_id', responsibility.finance_expense_item_id::text,
          'property_id', responsibility.property_id::text,
          'currency', expense.currency::text,
          'event_date', expense.invoice_date::text,
          'amount', pg_catalog.to_char(responsibility.customer_total_amount, 'FM999999999990.00'),
          'responsibility', responsibility.responsibility,
          'responsible_person_id', responsibility.responsible_person_id::text
        )
      ),
      NULL::uuid
    FROM public.ips_expense_responsibilities AS responsibility
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
      AND expense.id = responsibility.finance_expense_item_id
    WHERE responsibility.organization_id = p_organization_id
      AND responsibility.id = p_source_line_id
      AND responsibility.responsibility = 'owner'
      AND expense.status IN ('approved', 'posted', 'paid')
      AND expense.archived_at IS NULL;
  ELSIF v_source_type = 'owner_invoice_payment' THEN
    RETURN QUERY
    SELECT
      allocation.owner_payment_id,
      payment.property_id,
      payment.currency,
      payment.received_date,
      (-allocation.amount)::numeric(14,2),
      'explicit_owner'::text,
      payment.owner_person_id,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'owner_payment_id', allocation.owner_payment_id::text,
          'owner_invoice_line_id', allocation.owner_invoice_line_id::text,
          'property_id', payment.property_id::text,
          'owner_person_id', payment.owner_person_id::text,
          'currency', payment.currency::text,
          'event_date', payment.received_date::text,
          'signed_amount', pg_catalog.to_char(-allocation.amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.owner_payment_allocations AS allocation
    JOIN public.owner_payments AS payment
      ON payment.organization_id = allocation.organization_id
      AND payment.id = allocation.owner_payment_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND payment.reversal_of_id IS NULL;
  ELSIF v_source_type IN ('owner_contribution', 'owner_reimbursement') THEN
    RETURN QUERY
    SELECT
      event.id,
      event.property_id,
      event.currency,
      event.event_date,
      (CASE
        WHEN event.event_type = 'owner_contribution' THEN event.amount
        ELSE -event.amount
      END)::numeric(14,2),
      'explicit_owner'::text,
      event.owner_person_id,
      (CASE
        WHEN event.event_type = 'owner_contribution'
          THEN 'ips_held_owner_cash'::public.owner_balance_component
        ELSE 'ips_due_to_owner'::public.owner_balance_component
      END),
      false,
      event.payload_hash,
      NULL::uuid
    FROM public.owner_cash_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.id = p_source_line_id
      AND event.event_type = v_source_type;
  ELSIF v_source_type = 'owner_distribution' THEN
    RETURN QUERY
    SELECT
      withdrawal.id,
      withdrawal.property_id,
      withdrawal.currency,
      withdrawal.withdrawal_date,
      (-withdrawal.amount)::numeric(14,2),
      'explicit_owner'::text,
      withdrawal.owner_person_id,
      'ips_held_owner_cash'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', withdrawal.id::text,
          'property_id', withdrawal.property_id::text,
          'owner_person_id', withdrawal.owner_person_id::text,
          'currency', withdrawal.currency::text,
          'event_date', withdrawal.withdrawal_date::text,
          'signed_amount', pg_catalog.to_char(-withdrawal.amount, 'FM999999999990.00'),
          'reference', withdrawal.reference
        )
      ),
      NULL::uuid
    FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.id = p_source_line_id
      AND withdrawal.reversal_of_id IS NULL;
  ELSIF v_source_type IN ('security_deposit_receipt', 'security_deposit_refund') THEN
    RETURN QUERY
    SELECT
      event.lease_deposit_id,
      event.property_id,
      event.currency,
      event.event_date,
      (CASE WHEN event.event_type = 'received' THEN event.amount ELSE -event.amount END)::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'security_deposit_custody'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', event.id::text,
          'lease_deposit_id', event.lease_deposit_id::text,
          'property_id', event.property_id::text,
          'currency', event.currency::text,
          'event_date', event.event_date::text,
          'event_type', event.event_type,
          'amount', pg_catalog.to_char(event.amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.id = p_source_line_id
      AND event.reversal_of_id IS NULL
      AND (
        (v_source_type = 'security_deposit_receipt' AND event.event_type = 'received')
        OR
        (v_source_type = 'security_deposit_refund' AND event.event_type = 'refunded')
      );
  ELSIF v_source_type = 'owner_component_transfer' THEN
    RETURN QUERY
    SELECT
      line.transfer_instruction_id,
      instruction.property_id,
      instruction.currency,
      instruction.effective_date,
      line.signed_amount::numeric(14,2),
      'explicit_owner'::text,
      line.owner_person_id,
      instruction.component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', line.id::text,
          'instruction_id', instruction.id::text,
          'property_id', instruction.property_id::text,
          'owner_person_id', line.owner_person_id::text,
          'currency', instruction.currency::text,
          'event_date', instruction.effective_date::text,
          'component', instruction.component::text,
          'signed_amount', pg_catalog.to_char(line.signed_amount, 'FM999999999990.00'),
          'evidence_sha256', instruction.evidence_sha256
        )
      ),
      NULL::uuid
    FROM public.owner_component_transfer_lines AS line
    JOIN public.owner_component_transfer_instructions AS instruction
      ON instruction.organization_id = line.organization_id
      AND instruction.id = line.transfer_instruction_id
    WHERE line.organization_id = p_organization_id
      AND line.id = p_source_line_id;
  ELSIF v_source_type = 'reversal' THEN
    FOR v_reversal IN
      SELECT candidate.*
      FROM (
        SELECT
          reversal.payment_id AS source_id,
          original_set.property_id,
          payment.currency,
          payment.received_date AS event_date,
          (-original_set.gross_signed_amount)::numeric(14,2) AS gross_signed_amount,
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id AS reversal_line_id,
          original_set.id AS reversal_of_allocation_set_id,
          original_set.source_fingerprint
        FROM public.tenant_invoice_payment_allocations AS reversal
        JOIN public.tenant_invoice_payments AS payment
          ON payment.organization_id = reversal.organization_id
          AND payment.id = reversal.payment_id
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'tenant_rent_receipt'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.confirmation_id,
          original_set.property_id,
          reversal.currency,
          reversal.confirmed_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.owner_collection_confirmation_allocations AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_direct_rent_receipt'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.lease_deposit_id,
          original_set.property_id,
          reversal.currency,
          reversal.event_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.lease_deposit_events AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type IN ('security_deposit_receipt', 'security_deposit_refund')
          AND original_set.source_line_id = reversal.reversal_of_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.owner_payment_id,
          original_set.property_id,
          payment.currency,
          payment.received_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.owner_payment_allocations AS reversal
        JOIN public.owner_payments AS payment
          ON payment.organization_id = reversal.organization_id
          AND payment.id = reversal.owner_payment_id
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_invoice_payment'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.id,
          original_set.property_id,
          reversal.currency,
          reversal.withdrawal_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.property_withdrawals AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_distribution'
          AND original_set.source_line_id = reversal.reversal_of_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_id IS NOT NULL
      ) AS candidate
    LOOP
      v_reversal_count := v_reversal_count + 1;
      IF v_reversal_count > 1 THEN
        RAISE EXCEPTION 'ambiguous_event_ownership' USING ERRCODE = '23514';
      END IF;

      source_id := v_reversal.source_id;
      property_id := v_reversal.property_id;
      currency := v_reversal.currency;
      event_date := v_reversal.event_date;
      gross_signed_amount := v_reversal.gross_signed_amount;
      allocation_basis := v_reversal.allocation_basis;
      explicit_owner_person_id := v_reversal.explicit_owner_person_id;
      component := NULL;
      activity_only := false;
      source_fingerprint := app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', 'reversal',
          'source_line_id', p_source_line_id::text,
          'source_id', v_reversal.source_id::text,
          'event_date', v_reversal.event_date::text,
          'gross_signed_amount', pg_catalog.to_char(v_reversal.gross_signed_amount, 'FM999999999990.00'),
          'reversal_of_allocation_set_id', v_reversal.reversal_of_allocation_set_id::text,
          'original_source_fingerprint', v_reversal.source_fingerprint
        )
      );
      reversal_of_allocation_set_id := v_reversal.reversal_of_allocation_set_id;
      RETURN NEXT;
    END LOOP;

    IF v_reversal_count = 0 THEN
      RAISE EXCEPTION 'source_not_found' USING ERRCODE = '23503';
    END IF;
    RETURN;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = '23503';
  END IF;
END;
$$;

ALTER FUNCTION app_private.resolve_owner_event_source(uuid, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.resolve_owner_event_source(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.allocate_owner_roster_amount(
  p_organization_id uuid,
  p_property_id uuid,
  p_event_date date,
  p_gross_signed_amount numeric
)
RETURNS TABLE (
  property_owner_id uuid,
  owner_person_id uuid,
  ownership_percent numeric(6,3),
  started_on date,
  ended_on date,
  ownership_roster_hash text,
  allocated_amount numeric(14,2),
  allocation_order integer
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_total_cents bigint;
  v_sign integer;
BEGIN
  IF p_gross_signed_amount IS NULL
    OR p_gross_signed_amount = 0
    OR p_gross_signed_amount <> pg_catalog.round(p_gross_signed_amount, 2) THEN
    RAISE EXCEPTION 'owner_allocation_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_total_cents := pg_catalog.round(pg_catalog.abs(p_gross_signed_amount) * 100)::bigint;
  v_sign := CASE WHEN p_gross_signed_amount < 0 THEN -1 ELSE 1 END;

  RETURN QUERY
  WITH roster AS MATERIALIZED (
    SELECT validated.*
    FROM app_private.validate_owner_roster_on_date(
      p_organization_id,
      p_property_id,
      p_event_date
    ) AS validated
  ), raw_allocations AS (
    SELECT
      roster.*,
      (v_total_cents::numeric * roster.ownership_percent / 100.000) AS exact_cents,
      pg_catalog.floor(
        v_total_cents::numeric * roster.ownership_percent / 100.000
      )::bigint AS base_cents
    FROM roster
  ), ranked AS (
    SELECT
      raw_allocations.*,
      pg_catalog.row_number() OVER (
        ORDER BY
          (raw_allocations.exact_cents - raw_allocations.base_cents) DESC,
          raw_allocations.property_owner_id ASC
      ) AS remainder_rank,
      pg_catalog.row_number() OVER (
        ORDER BY raw_allocations.property_owner_id ASC
      ) AS stable_order,
      (
        v_total_cents - pg_catalog.sum(raw_allocations.base_cents) OVER ()
      )::bigint AS remainder_cents
    FROM raw_allocations
  )
  SELECT
    ranked.property_owner_id,
    ranked.owner_person_id,
    ranked.ownership_percent,
    ranked.started_on,
    ranked.ended_on,
    ranked.ownership_roster_hash,
    (
      v_sign * (
        ranked.base_cents
        + CASE WHEN ranked.remainder_rank <= ranked.remainder_cents THEN 1 ELSE 0 END
      )::numeric / 100
    )::numeric(14,2),
    ranked.stable_order::integer
  FROM ranked
  ORDER BY ranked.stable_order;
END;
$$;

ALTER FUNCTION app_private.allocate_owner_roster_amount(uuid, uuid, date, numeric)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.allocate_owner_roster_amount(uuid, uuid, date, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_owner_cash_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_event_type text := pg_catalog.btrim(p_event_type);
  v_reason text := pg_catalog.btrim(p_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_existing public.owner_cash_events%ROWTYPE;
  v_owner record;
  v_event_id uuid;
  v_allocation_set_id uuid;
  v_owner_allocation_id uuid;
  v_movement_id uuid;
  v_component public.owner_balance_component;
  v_signed_amount numeric(14,2);
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_cash_event_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_event_type NOT IN ('owner_contribution', 'owner_reimbursement') THEN
    RAISE EXCEPTION 'owner_cash_event_type_unsupported' USING ERRCODE = '22023';
  END IF;
  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'owner_cash_event_date_required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
    OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'owner_cash_event_amount_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_cash_event_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_cash_event_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'event_type', v_event_type,
    'event_date', p_event_date::text,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'reason', v_reason
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'record_owner_cash_event',
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
    p_event_date
  );

  IF app_private.is_financial_month_locked(p_organization_id, p_event_date) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_balance_source_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text,
        p_event_date::text,
        v_event_type,
        v_idempotency_key
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_owner_cash_event',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT event.*
  INTO v_existing
  FROM public.owner_cash_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT allocation_set.id
    INTO STRICT v_allocation_set_id
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = v_event_type
      AND allocation_set.source_line_id = v_existing.id;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'owner_cash_event_id', v_existing.id::text,
      'allocation_set_id', v_allocation_set_id::text
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
  END IF;

  SELECT roster.*
  INTO v_owner
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id,
    p_property_id,
    p_event_date
  ) AS roster
  WHERE roster.owner_person_id = p_owner_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'explicit_owner_not_in_effective_roster'
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context',
    'checked-owner-balance-v1',
    true
  );

  INSERT INTO public.owner_cash_events (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    event_type,
    event_date,
    amount,
    reason,
    idempotency_key,
    payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    v_event_type,
    p_event_date,
    p_amount::numeric(14,2),
    v_reason,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_event_id;

  v_signed_amount := CASE
    WHEN v_event_type = 'owner_contribution' THEN p_amount
    ELSE -p_amount
  END::numeric(14,2);
  v_component := CASE
    WHEN v_event_type = 'owner_contribution'
      THEN 'ips_held_owner_cash'::public.owner_balance_component
    ELSE 'ips_due_to_owner'::public.owner_balance_component
  END;

  INSERT INTO public.owner_event_allocation_sets (
    organization_id,
    property_id,
    currency,
    event_date,
    source_type,
    source_id,
    source_line_id,
    gross_signed_amount,
    source_fingerprint,
    allocation_basis,
    explicit_owner_person_id,
    idempotency_key,
    command_payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_currency,
    p_event_date,
    v_event_type,
    v_event_id,
    v_event_id,
    v_signed_amount,
    v_payload_hash,
    'explicit_owner',
    p_owner_person_id,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_allocation_set_id;

  INSERT INTO public.owner_event_owner_allocations (
    allocation_set_id,
    organization_id,
    property_owner_id,
    owner_person_id,
    ownership_percent_snapshot,
    ownership_started_on_snapshot,
    ownership_ended_on_snapshot,
    ownership_roster_hash,
    allocated_gross_signed_amount,
    allocation_order,
    created_by
  ) VALUES (
    v_allocation_set_id,
    p_organization_id,
    v_owner.property_owner_id,
    p_owner_person_id,
    100.000,
    v_owner.started_on,
    v_owner.ended_on,
    v_owner.ownership_roster_hash,
    v_signed_amount,
    1,
    v_actor_id
  )
  RETURNING id INTO v_owner_allocation_id;

  INSERT INTO public.owner_component_movements (
    organization_id,
    owner_event_owner_allocation_id,
    property_id,
    owner_person_id,
    currency,
    event_date,
    month_start,
    component,
    signed_amount,
    movement_order,
    created_by
  ) VALUES (
    p_organization_id,
    v_owner_allocation_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_event_date,
    pg_catalog.date_trunc('month', p_event_date)::date,
    v_component,
    v_signed_amount,
    1,
    v_actor_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );
  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'source_allocation_changed'
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.currency = p_currency
    AND period.month_start >= pg_catalog.date_trunc('month', p_event_date)::date
    AND period.status IN ('ready', 'stale');

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'owner_cash_event_id', v_event_id::text,
    'allocation_set_id', v_allocation_set_id::text,
    'owner_allocation_id', v_owner_allocation_id::text,
    'movement_id', v_movement_id::text,
    'amount', pg_catalog.to_char(v_signed_amount, 'FM999999999990.00'),
    'component', v_component::text
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

ALTER FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_owner_event(
  p_organization_id uuid,
  p_source_type text,
  p_source_line_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source_type text := pg_catalog.btrim(p_source_type);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_source record;
  v_existing public.owner_event_allocation_sets%ROWTYPE;
  v_original public.owner_event_allocation_sets%ROWTYPE;
  v_original_owner record;
  v_original_movement record;
  v_allocation record;
  v_owner record;
  v_source_movement record;
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_allocation_set_id uuid;
  v_owner_allocation_id uuid;
  v_movement_id uuid;
  v_owner_count integer := 0;
  v_movement_count integer := 0;
  v_available numeric(14,2);
  v_remaining numeric(14,2);
  v_unconsumed numeric(14,2);
  v_consume numeric(14,2);
  v_downstream jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_event_allocation_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app_private.owner_event_source_rule(v_source_type)
  ) THEN
    RAISE EXCEPTION 'source_unsupported' USING ERRCODE = '22023';
  END IF;
  IF p_source_line_id IS NULL THEN
    RAISE EXCEPTION 'source_line_id_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'allocation_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'source_type', v_source_type,
    'source_line_id', p_source_line_id::text
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'allocate_owner_event',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT resolved.*
  INTO STRICT v_source
  FROM app_private.resolve_owner_event_source(
    p_organization_id,
    v_source_type,
    p_source_line_id
  ) AS resolved;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    v_source.property_id,
    v_source.currency,
    v_source.event_date
  );

  IF app_private.is_financial_month_locked(
    p_organization_id,
    v_source.event_date
  ) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_balance_source_v1',
        p_organization_id::text,
        v_source_type,
        p_source_line_id::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'allocate_owner_event',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT allocation_set.*
  INTO v_existing
  FROM public.owner_event_allocation_sets AS allocation_set
  WHERE allocation_set.organization_id = p_organization_id
    AND allocation_set.source_type = v_source_type
    AND allocation_set.source_line_id = p_source_line_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.source_fingerprint IS DISTINCT FROM v_source.source_fingerprint THEN
      RAISE EXCEPTION 'source_fingerprint_drift' USING ERRCODE = '23514';
    END IF;
    IF v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key THEN
      RAISE EXCEPTION 'duplicate_source' USING ERRCODE = '23505';
    END IF;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'allocation_set_id', v_existing.id::text,
      'source_type', v_existing.source_type,
      'source_line_id', v_existing.source_line_id::text
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
  END IF;

  SELECT resolved.*
  INTO STRICT v_source
  FROM app_private.resolve_owner_event_source(
    p_organization_id,
    v_source_type,
    p_source_line_id
  ) AS resolved;

  IF v_source_type = 'reversal' THEN
    SELECT allocation_set.*
    INTO STRICT v_original
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.id = v_source.reversal_of_allocation_set_id
    FOR KEY SHARE;

    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'consumer_source_type', consumer_set.source_type,
        'consumer_source_id', consumer_set.source_id::text,
        'consumer_source_line_id', consumer_set.source_line_id::text,
        'consumed_amount', pg_catalog.to_char(consumption.consumed_amount, 'FM999999999990.00')
      ) ORDER BY consumer_set.source_type, consumer_set.source_line_id
    )
    INTO v_downstream
    FROM public.owner_component_movements AS original_movement
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
    WHERE original_movement.organization_id = p_organization_id
      AND original_movement.owner_event_owner_allocation_id IN (
        SELECT original_owner.id
        FROM public.owner_event_owner_allocations AS original_owner
        WHERE original_owner.organization_id = p_organization_id
          AND original_owner.allocation_set_id = v_original.id
      )
      AND original_movement.component = 'ips_held_owner_cash'
      AND original_movement.signed_amount > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_movements AS consumer_reversal
        WHERE consumer_reversal.reversal_of_movement_id = consumer_movement.id
      );

    IF v_downstream IS NOT NULL THEN
      RAISE EXCEPTION 'dependent_owner_cash:%', v_downstream::text
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context',
    'checked-owner-balance-v1',
    true
  );

  INSERT INTO public.owner_event_allocation_sets (
    organization_id,
    property_id,
    currency,
    event_date,
    source_type,
    source_id,
    source_line_id,
    gross_signed_amount,
    source_fingerprint,
    allocation_basis,
    explicit_owner_person_id,
    reversal_of_allocation_set_id,
    idempotency_key,
    command_payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    v_source.property_id,
    v_source.currency,
    v_source.event_date,
    v_source_type,
    v_source.source_id,
    p_source_line_id,
    v_source.gross_signed_amount,
    v_source.source_fingerprint,
    v_source.allocation_basis,
    v_source.explicit_owner_person_id,
    v_source.reversal_of_allocation_set_id,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_allocation_set_id;

  IF v_source_type = 'reversal' THEN
    FOR v_original_owner IN
      SELECT original_owner.*
      FROM public.owner_event_owner_allocations AS original_owner
      WHERE original_owner.organization_id = p_organization_id
        AND original_owner.allocation_set_id = v_original.id
      ORDER BY original_owner.allocation_order
    LOOP
      INSERT INTO public.owner_event_owner_allocations (
        allocation_set_id,
        organization_id,
        property_owner_id,
        owner_person_id,
        ownership_percent_snapshot,
        ownership_started_on_snapshot,
        ownership_ended_on_snapshot,
        ownership_roster_hash,
        allocated_gross_signed_amount,
        allocation_order,
        created_by
      ) VALUES (
        v_allocation_set_id,
        p_organization_id,
        v_original_owner.property_owner_id,
        v_original_owner.owner_person_id,
        v_original_owner.ownership_percent_snapshot,
        v_original_owner.ownership_started_on_snapshot,
        v_original_owner.ownership_ended_on_snapshot,
        v_original_owner.ownership_roster_hash,
        -v_original_owner.allocated_gross_signed_amount,
        v_original_owner.allocation_order,
        v_actor_id
      )
      RETURNING id INTO v_owner_allocation_id;
      v_owner_count := v_owner_count + 1;

      FOR v_original_movement IN
        SELECT original_movement.*
        FROM public.owner_component_movements AS original_movement
        WHERE original_movement.organization_id = p_organization_id
          AND original_movement.owner_event_owner_allocation_id = v_original_owner.id
        ORDER BY original_movement.movement_order
      LOOP
        INSERT INTO public.owner_component_movements (
          organization_id,
          owner_event_owner_allocation_id,
          property_id,
          owner_person_id,
          currency,
          event_date,
          month_start,
          component,
          signed_amount,
          movement_order,
          reversal_of_movement_id,
          created_by
        ) VALUES (
          p_organization_id,
          v_owner_allocation_id,
          v_original_movement.property_id,
          v_original_movement.owner_person_id,
          v_original_movement.currency,
          v_source.event_date,
          pg_catalog.date_trunc('month', v_source.event_date)::date,
          v_original_movement.component,
          -v_original_movement.signed_amount,
          v_original_movement.movement_order,
          v_original_movement.id,
          v_actor_id
        );
        v_movement_count := v_movement_count + 1;
      END LOOP;
    END LOOP;
  ELSE
    IF v_source.allocation_basis = 'effective_roster' THEN
      FOR v_allocation IN
        SELECT roster_allocation.*
        FROM app_private.allocate_owner_roster_amount(
          p_organization_id,
          v_source.property_id,
          v_source.event_date,
          v_source.gross_signed_amount
        ) AS roster_allocation
        ORDER BY roster_allocation.allocation_order
      LOOP
        INSERT INTO public.owner_event_owner_allocations (
          allocation_set_id,
          organization_id,
          property_owner_id,
          owner_person_id,
          ownership_percent_snapshot,
          ownership_started_on_snapshot,
          ownership_ended_on_snapshot,
          ownership_roster_hash,
          allocated_gross_signed_amount,
          allocation_order,
          created_by
        ) VALUES (
          v_allocation_set_id,
          p_organization_id,
          v_allocation.property_owner_id,
          v_allocation.owner_person_id,
          v_allocation.ownership_percent,
          v_allocation.started_on,
          v_allocation.ended_on,
          v_allocation.ownership_roster_hash,
          v_allocation.allocated_amount,
          v_allocation.allocation_order,
          v_actor_id
        );
      END LOOP;
    ELSE
      IF v_source_type = 'owner_component_transfer' THEN
        SELECT
          property_owner.id AS property_owner_id,
          property_owner.person_id AS owner_person_id,
          property_owner.ownership_percent,
          property_owner.started_on,
          property_owner.ended_on,
          app_private.canonical_financial_payload_hash(
            pg_catalog.jsonb_build_object(
              'transfer_property_owner_id', property_owner.id::text,
              'owner_person_id', property_owner.person_id::text,
              'ownership_percent', pg_catalog.to_char(property_owner.ownership_percent, 'FM990.000'),
              'started_on', property_owner.started_on::text,
              'ended_on', property_owner.ended_on::text
            )
          ) AS ownership_roster_hash
        INTO v_owner
        FROM public.property_owners AS property_owner
        WHERE property_owner.organization_id = p_organization_id
          AND property_owner.property_id = v_source.property_id
          AND property_owner.person_id = v_source.explicit_owner_person_id
          AND property_owner.archived_at IS NULL
          AND property_owner.started_on <= v_source.event_date
        ORDER BY
          CASE
            WHEN property_owner.ended_on IS NULL
              OR v_source.event_date < property_owner.ended_on THEN 0
            ELSE 1
          END,
          property_owner.ended_on DESC NULLS FIRST,
          property_owner.id
        LIMIT 1;
      ELSE
        SELECT roster.*
        INTO v_owner
        FROM app_private.validate_owner_roster_on_date(
          p_organization_id,
          v_source.property_id,
          v_source.event_date
        ) AS roster
        WHERE roster.owner_person_id = v_source.explicit_owner_person_id;
      END IF;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'explicit_owner_not_in_effective_roster'
          USING ERRCODE = '23503';
      END IF;

      INSERT INTO public.owner_event_owner_allocations (
        allocation_set_id,
        organization_id,
        property_owner_id,
        owner_person_id,
        ownership_percent_snapshot,
        ownership_started_on_snapshot,
        ownership_ended_on_snapshot,
        ownership_roster_hash,
        allocated_gross_signed_amount,
        allocation_order,
        created_by
      ) VALUES (
        v_allocation_set_id,
        p_organization_id,
        v_owner.property_owner_id,
        v_source.explicit_owner_person_id,
        100.000,
        v_owner.started_on,
        v_owner.ended_on,
        v_owner.ownership_roster_hash,
        v_source.gross_signed_amount,
        1,
        v_actor_id
      );
    END IF;

    IF NOT v_source.activity_only AND v_source.component IS NOT NULL THEN
      FOR v_allocation IN
        SELECT owner_allocation.*
        FROM public.owner_event_owner_allocations AS owner_allocation
        WHERE owner_allocation.organization_id = p_organization_id
          AND owner_allocation.allocation_set_id = v_allocation_set_id
        ORDER BY owner_allocation.allocation_order
      LOOP
        IF v_source.component = 'ips_held_owner_cash'
          AND v_allocation.allocated_gross_signed_amount < 0 THEN
          SELECT (
            coalesce((
              SELECT pg_catalog.sum(entry.signed_amount)
              FROM public.owner_opening_balance_entries AS entry
              WHERE entry.organization_id = p_organization_id
                AND entry.property_id = v_source.property_id
                AND entry.owner_person_id = v_allocation.owner_person_id
                AND entry.currency = v_source.currency
                AND entry.component = 'ips_held_owner_cash'
                AND entry.effective_date <= v_source.event_date
            ), 0)
            + coalesce((
              SELECT pg_catalog.sum(movement.signed_amount)
              FROM public.owner_component_movements AS movement
              WHERE movement.organization_id = p_organization_id
                AND movement.property_id = v_source.property_id
                AND movement.owner_person_id = v_allocation.owner_person_id
                AND movement.currency = v_source.currency
                AND movement.component = 'ips_held_owner_cash'
                AND movement.event_date <= v_source.event_date
            ), 0)
          )::numeric(14,2)
          INTO v_available;

          IF v_available < -v_allocation.allocated_gross_signed_amount THEN
            RAISE EXCEPTION 'insufficient_authoritative_held_cash'
              USING ERRCODE = '23514';
          END IF;
        END IF;

        INSERT INTO public.owner_component_movements (
          organization_id,
          owner_event_owner_allocation_id,
          property_id,
          owner_person_id,
          currency,
          event_date,
          month_start,
          component,
          signed_amount,
          movement_order,
          created_by
        ) VALUES (
          p_organization_id,
          v_allocation.id,
          v_source.property_id,
          v_allocation.owner_person_id,
          v_source.currency,
          v_source.event_date,
          pg_catalog.date_trunc('month', v_source.event_date)::date,
          v_source.component,
          v_allocation.allocated_gross_signed_amount,
          1,
          v_actor_id
        )
        RETURNING id INTO v_movement_id;
        v_movement_count := v_movement_count + 1;

        IF v_source.component = 'ips_held_owner_cash'
          AND v_allocation.allocated_gross_signed_amount < 0 THEN
          v_remaining := -v_allocation.allocated_gross_signed_amount;
          FOR v_source_movement IN
            SELECT
              positive_movement.*,
              (
                positive_movement.signed_amount
                - coalesce((
                  SELECT pg_catalog.sum(consumption.consumed_amount)
                  FROM public.owner_cash_source_consumptions AS consumption
                  WHERE consumption.organization_id = p_organization_id
                    AND consumption.source_movement_id = positive_movement.id
                    AND NOT EXISTS (
                      SELECT 1
                      FROM public.owner_component_movements AS consumer_reversal
                      WHERE consumer_reversal.reversal_of_movement_id =
                        consumption.consumer_movement_id
                    )
                ), 0)
              )::numeric(14,2) AS unconsumed_amount
            FROM public.owner_component_movements AS positive_movement
            WHERE positive_movement.organization_id = p_organization_id
              AND positive_movement.property_id = v_source.property_id
              AND positive_movement.owner_person_id = v_allocation.owner_person_id
              AND positive_movement.currency = v_source.currency
              AND positive_movement.component = 'ips_held_owner_cash'
              AND positive_movement.signed_amount > 0
              AND positive_movement.event_date <= v_source.event_date
            ORDER BY positive_movement.event_date, positive_movement.id
            FOR UPDATE
          LOOP
            EXIT WHEN v_remaining <= 0;
            v_unconsumed := greatest(v_source_movement.unconsumed_amount, 0);
            IF v_unconsumed > 0 THEN
              v_consume := least(v_unconsumed, v_remaining);
              INSERT INTO public.owner_cash_source_consumptions (
                organization_id,
                source_movement_id,
                consumer_movement_id,
                consumed_amount,
                created_by
              ) VALUES (
                p_organization_id,
                v_source_movement.id,
                v_movement_id,
                v_consume,
                v_actor_id
              );
              v_remaining := v_remaining - v_consume;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    SELECT count(*)::integer
    INTO v_owner_count
    FROM public.owner_event_owner_allocations AS owner_allocation
    WHERE owner_allocation.organization_id = p_organization_id
      AND owner_allocation.allocation_set_id = v_allocation_set_id;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );
  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'source_allocation_changed'
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_source.property_id
    AND period.currency = v_source.currency
    AND period.month_start >= pg_catalog.date_trunc('month', v_source.event_date)::date
    AND period.status IN ('ready', 'stale');

  v_result := pg_catalog.jsonb_build_object(
    'status', 'allocated',
    'allocation_set_id', v_allocation_set_id::text,
    'source_type', v_source_type,
    'source_line_id', p_source_line_id::text,
    'owner_allocation_count', v_owner_count,
    'movement_count', v_movement_count,
    'gross_signed_amount', pg_catalog.to_char(v_source.gross_signed_amount, 'FM999999999990.00')
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

ALTER FUNCTION public.allocate_owner_event(uuid, text, uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.allocate_owner_event(uuid, text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_owner_event(uuid, text, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_owner_event_allocation_queue(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date
) RETURNS TABLE (
  source_type text,
  source_id uuid,
  source_line_id uuid,
  event_date date,
  gross_signed_amount text,
  allocation_state text,
  remediation_code text,
  remediation_detail jsonb,
  allocation_set_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_event_queue_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'owner_event_queue_period_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate_ids AS MATERIALIZED (
    SELECT
      CASE
        WHEN allocation.reversal_of_allocation_id IS NULL
          THEN 'tenant_rent_receipt'
        ELSE 'reversal'
      END AS source_type,
      allocation.id AS source_line_id
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
      AND line.id = allocation.invoice_line_id
    WHERE allocation.organization_id = p_organization_id
      AND line.line_type = 'rent'

    UNION ALL

    SELECT
      CASE
        WHEN allocation.reversal_of_allocation_id IS NULL
          THEN 'owner_direct_rent_receipt'
        ELSE 'reversal'
      END,
      allocation.id
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.settlement_contract_version = 'owner_collection.v1'

    UNION ALL
    SELECT 'management_fee_occurrence', fee.id
    FROM public.management_fee_occurrences AS fee
    WHERE fee.organization_id = p_organization_id

    UNION ALL
    SELECT 'owner_paid_cost', responsibility.id
    FROM public.ips_expense_responsibilities AS responsibility
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
      AND expense.id = responsibility.finance_expense_item_id
    WHERE responsibility.organization_id = p_organization_id
      AND responsibility.responsibility = 'owner'
      AND expense.status IN ('approved', 'posted', 'paid')
      AND expense.archived_at IS NULL

    UNION ALL
    SELECT
      CASE
        WHEN allocation.reversal_of_allocation_id IS NULL
          THEN 'owner_invoice_payment'
        ELSE 'reversal'
      END,
      allocation.id
    FROM public.owner_payment_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id

    UNION ALL
    SELECT event.event_type, event.id
    FROM public.owner_cash_events AS event
    WHERE event.organization_id = p_organization_id

    UNION ALL
    SELECT
      CASE
        WHEN withdrawal.reversal_of_id IS NULL THEN 'owner_distribution'
        ELSE 'reversal'
      END,
      withdrawal.id
    FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id

    UNION ALL
    SELECT
      CASE
        WHEN event.reversal_of_id IS NOT NULL THEN 'reversal'
        WHEN event.event_type = 'received' THEN 'security_deposit_receipt'
        ELSE 'security_deposit_refund'
      END,
      event.id
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND (event.reversal_of_id IS NOT NULL OR event.event_type IN ('received', 'refunded'))

    UNION ALL
    SELECT 'owner_component_transfer', line.id
    FROM public.owner_component_transfer_lines AS line
    WHERE line.organization_id = p_organization_id
  ), candidates AS MATERIALIZED (
    SELECT candidate_ids.source_type, candidate_ids.source_line_id, resolved.*
    FROM candidate_ids
    CROSS JOIN LATERAL app_private.resolve_owner_event_source(
      p_organization_id,
      candidate_ids.source_type,
      candidate_ids.source_line_id
    ) AS resolved
  ), assessed AS (
    SELECT
      candidates.*,
      allocation_set.id AS existing_allocation_set_id,
      allocation_set.source_fingerprint AS existing_source_fingerprint,
      roster.active_count,
      roster.share_total,
      roster.inactive_count,
      roster.explicit_owner_match_count
    FROM candidates
    LEFT JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = candidates.source_type
      AND allocation_set.source_line_id = candidates.source_line_id
    CROSS JOIN LATERAL (
      SELECT
        count(*)::integer AS active_count,
        coalesce(sum(property_owner.ownership_percent), 0)::numeric(9,3) AS share_total,
        count(*) FILTER (
          WHERE person.archived_at IS NOT NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.person_roles AS role
              WHERE role.organization_id = property_owner.organization_id
                AND role.person_id = property_owner.person_id
                AND role.role = 'owner'
                AND role.status = 'active'
                AND role.archived_at IS NULL
            )
        )::integer AS inactive_count,
        count(*) FILTER (
          WHERE property_owner.person_id = candidates.explicit_owner_person_id
        )::integer AS explicit_owner_match_count
      FROM public.property_owners AS property_owner
      JOIN public.people AS person
        ON person.organization_id = property_owner.organization_id
        AND person.id = property_owner.person_id
      WHERE property_owner.organization_id = p_organization_id
        AND property_owner.property_id = candidates.property_id
        AND property_owner.archived_at IS NULL
        AND property_owner.started_on <= candidates.event_date
        AND (
          property_owner.ended_on IS NULL
          OR candidates.event_date < property_owner.ended_on
        )
    ) AS roster
    WHERE candidates.property_id = p_property_id
      AND candidates.currency = p_currency
      AND candidates.event_date BETWEEN p_period_start AND p_period_end
  )
  SELECT
    assessed.source_type,
    assessed.source_id,
    assessed.source_line_id,
    assessed.event_date,
    pg_catalog.to_char(assessed.gross_signed_amount, 'FM999999999990.00'),
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint = assessed.source_fingerprint
        THEN 'allocated'
      WHEN assessed.existing_allocation_set_id IS NOT NULL THEN 'blocked'
      WHEN assessed.active_count = 0 THEN 'blocked'
      WHEN assessed.share_total <> 100.000 THEN 'blocked'
      WHEN assessed.inactive_count > 0 THEN 'blocked'
      WHEN assessed.allocation_basis = 'explicit_owner'
        AND assessed.explicit_owner_match_count <> 1 THEN 'blocked'
      ELSE 'pending'
    END,
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint <> assessed.source_fingerprint
        THEN 'source_fingerprint_drift'
      WHEN assessed.active_count = 0 THEN 'owner_roster_missing'
      WHEN assessed.share_total <> 100.000 THEN 'owner_share_total_not_100'
      WHEN assessed.inactive_count > 0 THEN 'owner_person_inactive'
      WHEN assessed.allocation_basis = 'explicit_owner'
        AND assessed.explicit_owner_match_count <> 1
        THEN 'ambiguous_event_ownership'
      ELSE NULL
    END,
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint <> assessed.source_fingerprint
        THEN pg_catalog.jsonb_build_object(
          'persisted_fingerprint', assessed.existing_source_fingerprint,
          'current_fingerprint', assessed.source_fingerprint
        )
      WHEN assessed.active_count = 0
        OR assessed.share_total <> 100.000
        OR assessed.inactive_count > 0
        OR (
          assessed.allocation_basis = 'explicit_owner'
          AND assessed.explicit_owner_match_count <> 1
        )
        THEN pg_catalog.jsonb_build_object(
          'active_owner_count', assessed.active_count,
          'ownership_percent_total', pg_catalog.to_char(assessed.share_total, 'FM990.000'),
          'inactive_owner_count', assessed.inactive_count,
          'explicit_owner_match_count', assessed.explicit_owner_match_count
        )
      ELSE NULL
    END,
    assessed.existing_allocation_set_id
  FROM assessed
  ORDER BY assessed.event_date, assessed.source_type, assessed.source_line_id;
END;
$$;

ALTER FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) TO authenticated;
