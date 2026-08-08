-- Tenant-invoice settlement retains the atomic receipt implementation as a private helper.
ALTER FUNCTION public.record_finance_receipt_v2_internal(
  uuid, uuid, numeric, date, uuid, text, text
) SET SCHEMA app_private;
ALTER FUNCTION app_private.record_finance_receipt_v2_internal(
  uuid, uuid, numeric, date, uuid, text, text
) RENAME TO settle_income_item_internal;

DO $migration$
DECLARE
  routine record;
  definition text;
BEGIN
  FOR routine IN
    SELECT procedure.oid
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND procedure.prokind IN ('f', 'p')
      AND (
        pg_get_functiondef(procedure.oid) LIKE '%public.record_finance_receipt_v2_internal%'
        OR pg_get_functiondef(procedure.oid) LIKE '%public.record_finance_receipt_v2(%'
      )
  LOOP
    definition := pg_get_functiondef(routine.oid);
    definition := replace(
      definition,
      'public.record_finance_receipt_v2_internal',
      'app_private.settle_income_item_internal'
    );
    IF routine.oid = 'public.record_tenant_invoice_payment_internal(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure THEN
      definition := replace(
        definition,
        'public.record_finance_receipt_v2(',
        'app_private.settle_income_item_internal('
      );
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION app_private.settle_income_item_internal(
  uuid, uuid, numeric, date, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.record_finance_receipt_v2(
  uuid, uuid, numeric, date, uuid, text, text
);

-- Generic obligation/payment commands are not product entrypoints. Current writes
-- go through lease generation, tenant invoices, or expense approval.
DROP FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text,
  uuid
);
DROP FUNCTION public.create_finance_expense_item(
  uuid, uuid, uuid, uuid, uuid, text, text, date, date, numeric, text, text,
  text, text, text, numeric, numeric, numeric
);

DROP FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
);
DROP FUNCTION public.record_finance_income_payment_internal(
  uuid, uuid, numeric, date, text
);
DROP FUNCTION public.record_finance_payment(uuid, uuid, numeric, date, text);
DROP FUNCTION public.record_finance_payment_internal(
  uuid, uuid, numeric, date, text
);
DROP FUNCTION public.record_finance_receipt(uuid, uuid, numeric, date, text);
DROP FUNCTION public.record_finance_receipt_internal(
  uuid, uuid, numeric, date, text
);
DROP FUNCTION public.reverse_finance_payment(uuid, uuid, date, text);
DROP FUNCTION public.reverse_finance_payment_internal(uuid, uuid, date, text);
DROP FUNCTION public.reverse_finance_receipt(uuid, uuid, date, text);
DROP FUNCTION public.reverse_finance_receipt_internal(uuid, uuid, date, text);
DROP FUNCTION public.reverse_finance_receipt_v2(
  uuid, uuid, date, uuid, text, text
);
DROP FUNCTION public.reverse_finance_receipt_v2_internal(
  uuid, uuid, date, uuid, text, text
);
DROP FUNCTION public.set_finance_expense_status(uuid, uuid, text);
DROP FUNCTION public.set_finance_expense_status_internal(uuid, uuid, text);
DROP FUNCTION public.void_finance_income_item(uuid, uuid);
DROP FUNCTION public.void_finance_income_item_internal(uuid, uuid);
