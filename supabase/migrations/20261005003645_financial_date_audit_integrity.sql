CREATE FUNCTION app_private.stamp_financial_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
  previous jsonb;
  stamps jsonb;
  actor uuid := (SELECT auth.uid());
  recorded_at timestamptz := statement_timestamp();
BEGIN
  IF TG_OP = 'INSERT' THEN
    stamps := jsonb_build_object('created_at', recorded_at);
    IF incoming ? 'created_by' AND actor IS NOT NULL THEN
      stamps := stamps || jsonb_build_object('created_by', actor);
    END IF;
  ELSE
    previous := to_jsonb(OLD);
    IF incoming->'created_at' IS DISTINCT FROM previous->'created_at'
      OR incoming->'created_by' IS DISTINCT FROM previous->'created_by' THEN
      RAISE EXCEPTION 'Financial record creation time and actor are immutable'
        USING ERRCODE = '22023';
    END IF;
    stamps := '{}'::jsonb;
  END IF;

  IF incoming ? 'updated_at' THEN
    stamps := stamps || jsonb_build_object('updated_at', recorded_at);
  END IF;
  IF incoming ? 'updated_by' AND actor IS NOT NULL THEN
    stamps := stamps || jsonb_build_object('updated_by', actor);
  END IF;
  NEW := jsonb_populate_record(NEW, stamps);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.stamp_financial_record() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ledger_entries', 'finance_income_items', 'finance_expense_items',
    'finance_receipts', 'finance_receipt_allocations', 'finance_payments',
    'finance_payment_allocations', 'tenant_invoices', 'tenant_invoice_lines',
    'tenant_invoice_payments', 'tenant_invoice_payment_allocations',
    'owner_collection_confirmations', 'owner_collection_confirmation_allocations',
    'owner_invoices', 'owner_invoice_lines', 'owner_payments', 'owner_payment_allocations',
    'owner_charge_cash_allocations', 'property_withdrawals', 'owner_cash_events',
    'lease_deposit_events', 'expense_submissions', 'expense_transactions',
    'expense_customer_adjustments', 'management_fee_occurrences',
    'fee_payment_date_corrections'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER zz_stamp_financial_record BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.stamp_financial_record()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE FUNCTION app_private.stamp_financial_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Activity history is immutable' USING ERRCODE = '22023';
  END IF;
  NEW.created_at := statement_timestamp();
  NEW.actor_id := coalesce((SELECT auth.uid()), NEW.actor_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.stamp_financial_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_stamp_financial_activity
BEFORE INSERT OR UPDATE OR DELETE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION app_private.stamp_financial_activity();
