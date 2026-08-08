ALTER TABLE public.ledger_entries
  ADD COLUMN reversal_of_ledger_entry_id uuid;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_reversal_of_ledger_entry_fkey
    FOREIGN KEY (reversal_of_ledger_entry_id)
    REFERENCES public.ledger_entries(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT ledger_entries_reversal_not_self_check
    CHECK (
      reversal_of_ledger_entry_id IS NULL
      OR reversal_of_ledger_entry_id <> id
    );

CREATE UNIQUE INDEX ledger_entries_reversal_unique_idx
  ON public.ledger_entries (reversal_of_ledger_entry_id)
  WHERE reversal_of_ledger_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.create_operational_ledger_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_transaction_date date,
  p_direction text,
  p_category text,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text,
  p_source_type text,
  p_source_id uuid,
  p_actor_id uuid,
  p_reversal_of_ledger_entry_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_category text := btrim(coalesce(p_category, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_amount numeric(14, 2) := p_amount;
  v_existing public.ledger_entries%ROWTYPE;
  v_original public.ledger_entries%ROWTYPE;
  v_ledger_entry_id uuid;
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_transaction_date IS NULL
    OR p_currency IS NULL
    OR p_source_id IS NULL
    OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Operational Ledger identity is required'
      USING ERRCODE = '22004';
  END IF;

  IF v_direction NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Operational Ledger direction is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_category = '' OR char_length(v_category) > 120 THEN
    RAISE EXCEPTION 'Operational Ledger category is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'Operational Ledger description is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.is_reserved_financial_source_type(v_source_type) THEN
    RAISE EXCEPTION 'Operational Ledger source type is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_amount IS NULL OR v_amount = 0 THEN
    RAISE EXCEPTION 'Operational Ledger amount must be non-zero'
      USING ERRCODE = '22023';
  END IF;

  IF v_amount < 0
    AND NOT (
      v_source_type = 'receipt_allocation'
      AND v_direction = 'income'
      AND p_reversal_of_ledger_entry_id IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'Negative Operational Ledger amount is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM public.properties AS property
  WHERE property.id = p_property_id
    AND property.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found'
      USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL THEN
    PERFORM 1
    FROM public.units AS unit
    WHERE unit.id = p_unit_id
      AND unit.organization_id = p_organization_id
      AND unit.property_id = p_property_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM 1
  FROM auth.users AS actor
  WHERE actor.id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT ledger.*
  INTO v_existing
  FROM public.ledger_entries AS ledger
  WHERE ledger.organization_id = p_organization_id
    AND lower(btrim(ledger.source_type)) = v_source_type
    AND ledger.source_id = p_source_id;

  IF FOUND THEN
    IF v_existing.property_id = p_property_id
      AND v_existing.unit_id IS NOT DISTINCT FROM p_unit_id
      AND v_existing.transaction_date = p_transaction_date
      AND v_existing.direction = v_direction
      AND v_existing.category = v_category
      AND v_existing.amount = v_amount
      AND v_existing.currency = p_currency
      AND v_existing.description IS NOT DISTINCT FROM v_description
      AND v_existing.reversal_of_ledger_entry_id
        IS NOT DISTINCT FROM p_reversal_of_ledger_entry_id
      AND v_existing.archived_at IS NULL THEN
      RETURN v_existing.id;
    END IF;

    RAISE EXCEPTION 'Operational Ledger source conflicts with the existing event'
      USING ERRCODE = '23505';
  END IF;

  IF p_reversal_of_ledger_entry_id IS NOT NULL THEN
    SELECT ledger.*
    INTO v_original
    FROM public.ledger_entries AS ledger
    WHERE ledger.id = p_reversal_of_ledger_entry_id
      AND ledger.organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Original Operational Ledger event not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_original.property_id <> p_property_id
      OR v_original.unit_id IS DISTINCT FROM p_unit_id
      OR v_original.currency <> p_currency
      OR v_original.reversal_of_ledger_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'Operational Ledger reversal scope is invalid'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_transaction_date
  );

  PERFORM app_private.set_financial_projection_context(true);

  INSERT INTO public.ledger_entries (
    organization_id,
    property_id,
    unit_id,
    transaction_date,
    direction,
    category,
    amount,
    currency,
    description,
    source_type,
    source_id,
    reversal_of_ledger_entry_id,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_transaction_date,
    v_direction,
    v_category,
    v_amount,
    p_currency,
    v_description,
    v_source_type,
    p_source_id,
    p_reversal_of_ledger_entry_id,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO v_ledger_entry_id;

  PERFORM app_private.set_financial_projection_context(false);

  RETURN v_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_operational_ledger_event(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.expense_submissions
  DROP CONSTRAINT expense_submissions_lifecycle_evidence_check;

ALTER TABLE public.expense_submissions
  ADD CONSTRAINT expense_submissions_lifecycle_evidence_check
  CHECK (
    approved_journal_entry_id IS NULL
    AND reversal_journal_entry_id IS NULL
    AND (
      (
        status = 'submitted'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND review_reason IS NULL
        AND approved_finance_expense_item_id IS NULL
        AND approved_payment_id IS NULL
        AND approved_payment_allocation_id IS NULL
        AND approved_responsibility_id IS NULL
        AND approved_ledger_entry_id IS NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
      )
      OR (
        status = 'rejected'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND review_reason IS NOT NULL
        AND approved_finance_expense_item_id IS NULL
        AND approved_payment_id IS NULL
        AND approved_payment_allocation_id IS NULL
        AND approved_responsibility_id IS NULL
        AND approved_ledger_entry_id IS NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
      )
      OR (
        status = 'approved'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND approved_finance_expense_item_id IS NOT NULL
        AND approved_payment_id IS NOT NULL
        AND approved_payment_allocation_id IS NOT NULL
        AND approved_responsibility_id IS NOT NULL
        AND approved_ledger_entry_id IS NOT NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
      )
      OR (
        status = 'reversed'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND approved_finance_expense_item_id IS NOT NULL
        AND approved_payment_id IS NOT NULL
        AND approved_payment_allocation_id IS NOT NULL
        AND approved_responsibility_id IS NOT NULL
        AND approved_ledger_entry_id IS NOT NULL
        AND reversed_at IS NOT NULL
        AND reversed_by IS NOT NULL
        AND reversal_reason IS NOT NULL
        AND reversal_payment_id IS NOT NULL
        AND reversal_payment_allocation_id IS NOT NULL
        AND reversal_ledger_entry_id IS NOT NULL
      )
    )
  );

CREATE OR REPLACE FUNCTION app_private.create_expense_payment_projection(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_actor_id uuid,
  p_is_reversal boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allocation public.finance_payment_allocations%ROWTYPE;
  v_expense public.finance_expense_items%ROWTYPE;
  v_original_ledger_entry_id uuid;
  v_ledger_entry_id uuid;
  v_description text;
BEGIN
  IF p_organization_id IS NULL
    OR p_allocation_id IS NULL
    OR p_actor_id IS NULL
    OR p_is_reversal IS NULL THEN
    RAISE EXCEPTION 'Expense projection identity is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT allocation.*
  INTO v_allocation
  FROM public.finance_payment_allocations AS allocation
  WHERE allocation.organization_id = p_organization_id
    AND allocation.id = p_allocation_id
    AND allocation.settlement_contract_version = 'expense_approval.v1'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense payment allocation not found'
      USING ERRCODE = '23503';
  END IF;

  IF (v_allocation.reversal_of_allocation_id IS NOT NULL)
    IS DISTINCT FROM p_is_reversal THEN
    RAISE EXCEPTION 'Expense projection reversal identity is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT expense.*
  INTO STRICT v_expense
  FROM public.finance_expense_items AS expense
  WHERE expense.organization_id = p_organization_id
    AND expense.id = v_allocation.expense_item_id
  FOR UPDATE;

  IF p_is_reversal THEN
    SELECT original_allocation.ledger_entry_id
    INTO v_original_ledger_entry_id
    FROM public.finance_payment_allocations AS original_allocation
    WHERE original_allocation.organization_id = p_organization_id
      AND original_allocation.id = v_allocation.reversal_of_allocation_id
      AND original_allocation.settlement_contract_version = 'expense_approval.v1';

    IF v_original_ledger_entry_id IS NULL THEN
      RAISE EXCEPTION 'Original expense Ledger event not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_description := CASE WHEN p_is_reversal
    THEN 'Reversal - ' || concat_ws(' - ', v_expense.vendor_label, v_expense.description)
    ELSE concat_ws(' - ', v_expense.vendor_label, v_expense.description)
  END;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_allocation.property_id,
    v_allocation.unit_id,
    v_allocation.paid_date,
    CASE WHEN p_is_reversal THEN 'income' ELSE 'expense' END,
    CASE WHEN p_is_reversal
      THEN 'Expense reversal - ' || v_expense.category
      ELSE v_expense.category
    END,
    v_allocation.amount,
    v_allocation.currency,
    v_description,
    'payment_allocation',
    v_allocation.id,
    p_actor_id,
    v_original_ledger_entry_id
  );

  UPDATE public.finance_payment_allocations
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_allocation.id
    AND ledger_entry_id IS DISTINCT FROM v_ledger_entry_id;

  RETURN jsonb_build_object(
    'ledger_entry_id', v_ledger_entry_id,
    'journal_entry_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_expense_payment_projection(
  uuid, uuid, uuid, boolean
) FROM PUBLIC, anon, authenticated, service_role;
