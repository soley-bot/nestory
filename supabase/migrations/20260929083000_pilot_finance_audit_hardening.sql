-- Harden Pilot finance reads and keep corrected tenant obligations aligned
-- with their authoritative invoice lines.

-- property_finance_positions joins receipt allocations under RLS. These
-- organization-first indexes let Postgres use the receipt/payment join keys
-- without repeatedly scanning every allocation in the tenant.
CREATE INDEX IF NOT EXISTS tenant_invoice_payment_allocations_org_receipt_idx
  ON public.tenant_invoice_payment_allocations (
    organization_id,
    finance_receipt_id
  );

CREATE INDEX IF NOT EXISTS tenant_invoice_payment_allocations_org_payment_idx
  ON public.tenant_invoice_payment_allocations (
    organization_id,
    payment_id
  );

-- Invoice corrections append reversal lines instead of deleting history.
-- Keep the source obligation lifecycle aligned with that authoritative
-- reversal so older readers cannot continue to surface an "open" charge.
CREATE OR REPLACE FUNCTION app_private.sync_corrected_tenant_income_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_income_item_id uuid;
BEGIN
  IF NEW.reversal_of_id IS NULL OR NEW.correction_occurrence_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT original.income_item_id
  INTO v_income_item_id
  FROM public.tenant_invoice_lines AS original
  WHERE original.organization_id = NEW.organization_id
    AND original.id = NEW.reversal_of_id;

  IF v_income_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.organization_id = NEW.organization_id
      AND allocation.income_item_id = v_income_item_id
    GROUP BY allocation.organization_id, allocation.income_item_id
    HAVING pg_catalog.sum(allocation.signed_amount) <> 0
  ) OR EXISTS (
    SELECT 1
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = NEW.organization_id
      AND allocation.income_item_id = v_income_item_id
    GROUP BY allocation.organization_id, allocation.income_item_id
    HAVING pg_catalog.sum(allocation.signed_amount) <> 0
  ) THEN
    RAISE EXCEPTION 'corrected_tenant_income_still_settled'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  UPDATE public.finance_income_items AS income
  SET
    status = 'void',
    updated_by = NEW.created_by
  WHERE income.organization_id = NEW.organization_id
    AND income.id = v_income_item_id
    AND income.status IS DISTINCT FROM 'void';

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RAISE;
END;
$$;

ALTER FUNCTION app_private.sync_corrected_tenant_income_status()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.sync_corrected_tenant_income_status()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_corrected_tenant_income_status
  ON public.tenant_invoice_lines;
CREATE TRIGGER sync_corrected_tenant_income_status
AFTER INSERT ON public.tenant_invoice_lines
FOR EACH ROW
WHEN (
  NEW.reversal_of_id IS NOT NULL
  AND NEW.correction_occurrence_id IS NOT NULL
)
EXECUTE FUNCTION app_private.sync_corrected_tenant_income_status();

-- Backfill corrections created before the trigger existed. Only obligations
-- with no remaining settlement are eligible.
DO $$
BEGIN
  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  UPDATE public.finance_income_items AS income
  SET
    status = 'void',
    updated_by = coalesce(reversal.created_by, income.updated_by, income.created_by)
  FROM public.tenant_invoice_lines AS original
  JOIN public.tenant_invoice_lines AS reversal
    ON reversal.organization_id = original.organization_id
   AND reversal.reversal_of_id = original.id
   AND reversal.correction_occurrence_id IS NOT NULL
  WHERE income.organization_id = original.organization_id
    AND income.id = original.income_item_id
    AND income.status IS DISTINCT FROM 'void'
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipt_allocations AS allocation
      WHERE allocation.organization_id = income.organization_id
        AND allocation.income_item_id = income.id
      GROUP BY allocation.organization_id, allocation.income_item_id
      HAVING pg_catalog.sum(allocation.signed_amount) <> 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.organization_id = income.organization_id
        AND allocation.income_item_id = income.id
      GROUP BY allocation.organization_id, allocation.income_item_id
      HAVING pg_catalog.sum(allocation.signed_amount) <> 0
    );

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
EXCEPTION WHEN OTHERS THEN
  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RAISE;
END;
$$;
