-- UNRELEASED REVIEW PROPOSAL. No execution/grants; preserves PR225 audit actor deletion semantics.
CREATE OR REPLACE FUNCTION app_private.stamp_financial_activity()
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
    OR starts_with(activity->>'action', 'lease_deposit_')
    OR activity->>'action' IN ('apply_deposit_to_rent', 'reverse_deposit_rent_application', 'deposit_rent_custody_confirmed');
  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD);
    financial := financial OR previous->>'entity_type' = ANY(financial_entities)
      OR starts_with(previous->>'action', 'lease_deposit_')
      OR previous->>'action' IN ('apply_deposit_to_rent', 'reverse_deposit_rent_application', 'deposit_rent_custody_confirmed');
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
