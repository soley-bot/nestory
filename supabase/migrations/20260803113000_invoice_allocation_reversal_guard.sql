-- Keep invoice settlement limits compatible with legacy receipt-level reversals.

CREATE OR REPLACE FUNCTION app_private.enforce_invoice_income_allocation_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_income_item_id uuid := NEW.income_item_id;
  v_amount_due numeric(14, 2);
  v_receipt_total numeric(14, 2);
  v_owner_total numeric(14, 2);
  v_new_amount numeric(14, 2);
  v_receipt_is_reversal boolean;
BEGIN
  IF TG_TABLE_NAME = 'finance_receipt_allocations' THEN
    IF NEW.reversal_of_allocation_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT income.amount_due
  INTO v_amount_due
  FROM public.finance_income_items AS income
  WHERE income.id = v_income_item_id
    AND income.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(
    CASE
      WHEN allocation.settlement_contract_version = 'plan05.v1'
        THEN allocation.signed_amount
      WHEN receipt.reversal_of_id IS NULL THEN allocation.amount
      ELSE -allocation.amount
    END
  ), 0)::numeric(14, 2)
  INTO v_receipt_total
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.organization_id = NEW.organization_id
    AND allocation.income_item_id = v_income_item_id;

  SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2)
  INTO v_owner_total
  FROM public.owner_collection_confirmation_allocations AS allocation
  WHERE allocation.organization_id = NEW.organization_id
    AND allocation.income_item_id = v_income_item_id;

  IF TG_TABLE_NAME = 'finance_receipt_allocations' THEN
    IF NEW.settlement_contract_version = 'plan05.v1' THEN
      v_new_amount := NEW.signed_amount;
    ELSE
      SELECT receipt.reversal_of_id IS NOT NULL
      INTO v_receipt_is_reversal
      FROM public.finance_receipts AS receipt
      WHERE receipt.id = NEW.receipt_id
        AND receipt.organization_id = NEW.organization_id;

      v_new_amount := CASE
        WHEN coalesce(v_receipt_is_reversal, false) THEN -NEW.amount
        ELSE NEW.amount
      END;
    END IF;
  ELSE
    v_new_amount := NEW.amount;
  END IF;

  IF v_receipt_total + v_owner_total + v_new_amount > v_amount_due THEN
    RAISE EXCEPTION 'Income settlement exceeds the invoice line balance'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_invoice_income_allocation_total()
FROM PUBLIC, anon, authenticated, service_role;
