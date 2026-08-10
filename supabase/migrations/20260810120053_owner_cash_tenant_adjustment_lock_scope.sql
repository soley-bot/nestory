-- Tenant-responsible expense reversal adjustments have no owner invoice and no
-- owner-cash effect. Keep Track 3's canonical owner mutation locks for owner
-- adjustments and owner cash allocations, but do not resolve an owner scope
-- for a tenant-only row.
CREATE OR REPLACE FUNCTION app_private.lock_legacy_owner_cash_effect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_owner_person_id uuid;
  v_currency public.currency_code;
  v_effective_date date;
BEGIN
  IF TG_TABLE_NAME = 'expense_customer_adjustments' THEN
    IF NEW.responsibility = 'tenant' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'owner_charge_cash_allocations' THEN
    SELECT invoice.owner_person_id, invoice.currency
    INTO STRICT v_owner_person_id, v_currency
    FROM public.owner_invoice_lines AS line
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE line.organization_id = NEW.organization_id
      AND line.id = NEW.owner_invoice_line_id;
    v_effective_date := NEW.allocation_date;
  ELSE
    SELECT invoice.owner_person_id, invoice.currency
    INTO STRICT v_owner_person_id, v_currency
    FROM public.owner_invoices AS invoice
    WHERE invoice.organization_id = NEW.organization_id
      AND invoice.id = NEW.owner_invoice_id;
    v_effective_date := NEW.adjustment_date;
  END IF;

  PERFORM app_private.lock_owner_balance_mutation(
    NEW.organization_id,
    NEW.property_id,
    v_owner_person_id,
    v_currency,
    v_effective_date
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_legacy_owner_cash_effect() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_legacy_owner_cash_effect()
  FROM PUBLIC, anon, authenticated, service_role;
