-- Harden Pilot finance reads and keep voided tenant obligations aligned
-- with their authoritative invoices.

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

-- A checked invoice void appends reversal lines and then moves the invoice
-- lifecycle to void. Keep the source obligations aligned at that exact
-- lifecycle boundary. Do not react to generic reversal lines because the
-- historical/current-rent correction workflows may replay settlements before
-- their replacement lines are complete.
CREATE OR REPLACE FUNCTION app_private.sync_voided_tenant_invoice_income_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.lifecycle IS DISTINCT FROM 'void'
    OR OLD.lifecycle IS NOT DISTINCT FROM NEW.lifecycle THEN
    RETURN NEW;
  END IF;

  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  UPDATE public.finance_income_items AS income
  SET
    status = 'void',
    updated_by = coalesce(NEW.voided_by, income.updated_by, income.created_by)
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = NEW.organization_id
    AND line.invoice_id = NEW.id
    AND line.reversal_of_id IS NULL
    AND line.income_item_id IS NOT NULL
    AND income.organization_id = NEW.organization_id
    AND income.id = line.income_item_id
    AND income.status IS DISTINCT FROM 'void';

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RAISE;
END;
$$;

ALTER FUNCTION app_private.sync_voided_tenant_invoice_income_status()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.sync_voided_tenant_invoice_income_status()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_voided_tenant_invoice_income_status
  ON public.tenant_invoices;
CREATE TRIGGER sync_voided_tenant_invoice_income_status
AFTER UPDATE OF lifecycle ON public.tenant_invoices
FOR EACH ROW
WHEN (
  NEW.lifecycle = 'void'
  AND OLD.lifecycle IS DISTINCT FROM NEW.lifecycle
)
EXECUTE FUNCTION app_private.sync_voided_tenant_invoice_income_status();

-- Backfill source obligations for invoices that were already void before this
-- invariant existed. This changes only the source obligation lifecycle; the
-- invoice correction, reversal lines, balances, and audit history stay intact.
DO $$
BEGIN
  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  UPDATE public.finance_income_items AS income
  SET
    status = 'void',
    updated_by = coalesce(invoice.voided_by, income.updated_by, income.created_by)
  FROM public.tenant_invoices AS invoice
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = invoice.organization_id
   AND line.invoice_id = invoice.id
   AND line.reversal_of_id IS NULL
   AND line.income_item_id IS NOT NULL
  WHERE invoice.lifecycle = 'void'
    AND income.organization_id = invoice.organization_id
    AND income.id = line.income_item_id
    AND income.status IS DISTINCT FROM 'void';

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
EXCEPTION WHEN OTHERS THEN
  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RAISE;
END;
$$;
