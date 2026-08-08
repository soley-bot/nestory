CREATE OR REPLACE FUNCTION app_private.create_income_settlement_projection(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_book_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_payer_person_id uuid,
  p_income_type text,
  p_effective_date date,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text,
  p_reference text,
  p_actor_id uuid,
  p_is_reversal boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allocation public.finance_receipt_allocations%ROWTYPE;
  v_original_ledger_entry_id uuid;
  v_ledger_entry_id uuid;
  v_category text;
BEGIN
  IF p_organization_id IS NULL
    OR p_allocation_id IS NULL
    OR p_property_id IS NULL
    OR p_effective_date IS NULL
    OR p_amount IS NULL
    OR p_amount <= 0
    OR p_currency IS NULL
    OR p_actor_id IS NULL
    OR p_is_reversal IS NULL THEN
    RAISE EXCEPTION 'Income projection identity is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT allocation.*
  INTO v_allocation
  FROM public.finance_receipt_allocations AS allocation
  WHERE allocation.organization_id = p_organization_id
    AND allocation.id = p_allocation_id
    AND allocation.settlement_contract_version = 'plan05.v1'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income receipt allocation not found'
      USING ERRCODE = '23503';
  END IF;

  IF (v_allocation.reversal_of_allocation_id IS NOT NULL)
    IS DISTINCT FROM p_is_reversal
    OR v_allocation.property_id IS DISTINCT FROM p_property_id
    OR v_allocation.unit_id IS DISTINCT FROM p_unit_id
    OR v_allocation.lease_id IS DISTINCT FROM p_lease_id
    OR v_allocation.payer_person_id_snapshot
      IS DISTINCT FROM p_payer_person_id
    OR v_allocation.income_type_snapshot
      IS DISTINCT FROM p_income_type
    OR v_allocation.received_date IS DISTINCT FROM p_effective_date
    OR v_allocation.amount IS DISTINCT FROM p_amount
    OR v_allocation.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'Income projection snapshot is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_is_reversal THEN
    SELECT original_allocation.ledger_entry_id
    INTO v_original_ledger_entry_id
    FROM public.finance_receipt_allocations AS original_allocation
    WHERE original_allocation.organization_id = p_organization_id
      AND original_allocation.id = v_allocation.reversal_of_allocation_id
      AND original_allocation.settlement_contract_version = 'plan05.v1';

    IF v_original_ledger_entry_id IS NULL THEN
      RAISE EXCEPTION 'Original income Ledger event not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_category := replace(
    pg_catalog.initcap(replace(p_income_type, '_', ' ')),
    '  ',
    ' '
  );

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_effective_date,
    'income',
    CASE WHEN p_is_reversal
      THEN 'Reversal - ' || v_category
      ELSE v_category
    END,
    CASE WHEN p_is_reversal THEN -p_amount ELSE p_amount END,
    p_currency,
    p_description,
    'receipt_allocation',
    p_allocation_id,
    p_actor_id,
    v_original_ledger_entry_id
  );

  UPDATE public.finance_receipt_allocations
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = p_allocation_id
    AND ledger_entry_id IS DISTINCT FROM v_ledger_entry_id;

  RETURN pg_catalog.jsonb_build_object(
    'ledger_entry_id', v_ledger_entry_id,
    'journal_entry_ids', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_income_settlement_projection(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  date,
  numeric,
  public.currency_code,
  text,
  text,
  uuid,
  boolean
)
FROM PUBLIC, anon, authenticated, service_role;
