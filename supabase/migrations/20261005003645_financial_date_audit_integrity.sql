CREATE FUNCTION app_private.stamp_financial_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
  previous jsonb;
  stamps jsonb;
  actors jsonb;
  actor uuid := (SELECT auth.uid());
  recorded_at timestamptz := statement_timestamp();
  detached boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    stamps := jsonb_build_object('created_at', recorded_at);
    IF incoming ? 'created_by' AND actor IS NOT NULL THEN
      stamps := stamps || jsonb_build_object('created_by', actor);
    END IF;
    actors := jsonb_build_object('createdBy', coalesce(to_jsonb(actor), incoming->'created_by'));
  ELSE
    previous := to_jsonb(OLD);
    IF pg_trigger_depth() > 1
      AND incoming - ARRAY['created_by', 'updated_by', 'updated_at']
        = previous - ARRAY['created_by', 'updated_by', 'updated_at']
      AND (incoming->'created_by' IS DISTINCT FROM previous->'created_by'
        OR incoming->'updated_by' IS DISTINCT FROM previous->'updated_by') THEN
      detached := true;
      IF incoming->'created_by' IS DISTINCT FROM previous->'created_by' THEN
        detached := incoming->>'created_by' IS NULL
          AND previous->>'created_by' IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (previous->>'created_by')::uuid);
      END IF;
      IF incoming->'updated_by' IS DISTINCT FROM previous->'updated_by' THEN
        detached := detached AND incoming->>'updated_by' IS NULL
          AND previous->>'updated_by' IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (previous->>'updated_by')::uuid);
      END IF;
    END IF;
    IF incoming->'created_at' IS DISTINCT FROM previous->'created_at'
      OR (incoming->'created_by' IS DISTINCT FROM previous->'created_by' AND NOT detached) THEN
      RAISE EXCEPTION 'Financial record creation time and actor are immutable'
        USING ERRCODE = '22023';
    END IF;
    actors := coalesce(nullif(previous->'audit_actors', 'null'::jsonb),
      jsonb_build_object('createdBy', previous->'created_by', 'updatedBy', previous->'updated_by'));
    IF detached THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(
        'updated_at', previous->'updated_at', 'audit_actors', actors));
      RETURN NEW;
    END IF;
    stamps := '{}'::jsonb;
  END IF;

  IF incoming ? 'updated_at' THEN
    stamps := stamps || jsonb_build_object('updated_at', recorded_at);
  END IF;
  IF incoming ? 'updated_by' AND actor IS NOT NULL THEN
    stamps := stamps || jsonb_build_object('updated_by', actor);
  END IF;
  actors := actors || jsonb_build_object('updatedBy', coalesce(to_jsonb(actor), incoming->'updated_by', actors->'createdBy'));
  NEW := jsonb_populate_record(NEW, stamps || jsonb_build_object('audit_actors', actors));
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
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN audit_actors jsonb', table_name);
    EXECUTE format(
      'CREATE TRIGGER zz_stamp_financial_record BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.stamp_financial_record()',
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.activity_logs ADD COLUMN recorded_actor_id uuid;

CREATE FUNCTION app_private.stamp_financial_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  activity jsonb;
  previous jsonb;
  financial boolean;
  financial_entities text[] := ARRAY[
    'ledger_entry', 'financial_month', 'finance_income_item', 'finance_expense_item',
    'finance_receipt', 'finance_receipt_allocation', 'finance_payment',
    'finance_payment_allocation', 'tenant_invoice', 'tenant_invoice_line',
    'tenant_invoice_payment', 'tenant_invoice_payment_allocation',
    'owner_collection_confirmation', 'owner_collection_confirmation_allocation',
    'owner_invoice', 'owner_invoice_line', 'owner_payment', 'owner_payment_allocation',
    'owner_charge_cash_allocation', 'property_withdrawal', 'owner_cash_event',
    'lease_deposit_event', 'expense_submission', 'expense_transaction',
    'expense_customer_adjustment', 'management_fee_occurrence',
    'fee_payment_date_correction', 'owner_opening_balance_request',
    'petty_cash_entry', 'petty_cash_account', 'petty_cash_period'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    activity := to_jsonb(OLD);
  ELSE
    activity := to_jsonb(NEW);
  END IF;
  financial := activity->>'entity_type' = ANY(financial_entities)
    OR starts_with(activity->>'action', 'lease_deposit_');
  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD);
    financial := financial OR previous->>'entity_type' = ANY(financial_entities)
      OR starts_with(previous->>'action', 'lease_deposit_');
  END IF;
  IF NOT financial THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1
      AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Activity history is immutable' USING ERRCODE = '22023';
  ELSIF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1 AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
      AND activity - 'actor_id' = previous - 'actor_id'
      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.actor_id) THEN
      NEW.recorded_actor_id := coalesce(OLD.recorded_actor_id, OLD.actor_id);
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Activity history is immutable' USING ERRCODE = '22023';
  END IF;
  NEW.created_at := statement_timestamp();
  NEW.actor_id := coalesce((SELECT auth.uid()), NEW.actor_id);
  NEW.recorded_actor_id := NEW.actor_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.stamp_financial_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_stamp_financial_activity
BEFORE INSERT OR UPDATE OR DELETE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION app_private.stamp_financial_activity();
