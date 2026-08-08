CREATE OR REPLACE FUNCTION app_private.is_financial_month_locked(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT month_lock.is_locked
    FROM public.financial_month_locks AS month_lock
    WHERE month_lock.organization_id = p_organization_id
      AND month_lock.month_start = date_trunc('month', p_effective_date)::date
  ), false);
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_property_financial_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_currency IS NULL
    OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Complete property month scope is required'
      USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_effective_date
  );
END;
$$;

-- Move the current checked finance commands onto the single product month lock.
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
    WHERE procedure.prokind = 'f'
      AND namespace.nspname IN ('public', 'app_private')
      AND procedure.oid NOT IN (
        'app_private.lock_open_property_reporting_period(uuid,uuid,public.currency_code,date)'::regprocedure,
        'app_private.lock_open_property_financial_month(uuid,uuid,public.currency_code,date)'::regprocedure
      )
      AND strpos(
        pg_get_functiondef(procedure.oid),
        'app_private.lock_open_property_reporting_period'
      ) > 0
  LOOP
    definition := replace(
      pg_get_functiondef(routine.oid),
      'app_private.lock_open_property_reporting_period',
      'app_private.lock_open_property_financial_month'
    );
    EXECUTE definition;
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION app_private.enforce_ledger_entry_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app_private.is_financial_month_locked(
      NEW.organization_id,
      NEW.transaction_date
    ) THEN
      RAISE EXCEPTION 'Financial month is locked' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF app_private.is_financial_month_locked(
      OLD.organization_id,
      OLD.transaction_date
    ) OR app_private.is_financial_month_locked(
      NEW.organization_id,
      NEW.transaction_date
    ) THEN
      RAISE EXCEPTION 'Financial month is locked' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_timeline_financial_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_is_financial boolean := false;
  new_is_financial boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_is_financial := NEW.cost_amount IS NOT NULL
      OR NEW.ledger_entry_id IS NOT NULL;

    IF new_is_financial
      AND app_private.is_financial_month_locked(
        NEW.organization_id,
        NEW.event_date
      ) THEN
      RAISE EXCEPTION 'Financial month is locked' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_is_financial := OLD.cost_amount IS NOT NULL
      OR OLD.ledger_entry_id IS NOT NULL;
    new_is_financial := NEW.cost_amount IS NOT NULL
      OR NEW.ledger_entry_id IS NOT NULL;

    IF (
      old_is_financial
      AND app_private.is_financial_month_locked(
        OLD.organization_id,
        OLD.event_date
      )
    ) OR (
      new_is_financial
      AND app_private.is_financial_month_locked(
        NEW.organization_id,
        NEW.event_date
      )
    ) THEN
      RAISE EXCEPTION 'Financial month is locked' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_timeline_event(
  p_event_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  old_event public.timeline_events%ROWTYPE;
  new_event public.timeline_events%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT event.*
  INTO old_event
  FROM public.timeline_events AS event
  WHERE event.id = p_event_id
    AND event.organization_id = p_organization_id
    AND event.archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeline event not found' USING ERRCODE = '23503';
  END IF;

  IF old_event.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ledger-linked timeline events must be restored from Ledger'
      USING ERRCODE = '22023';
  END IF;

  IF old_event.cost_amount IS NOT NULL
    AND app_private.is_financial_month_locked(
      p_organization_id,
      old_event.event_date
    ) THEN
    RAISE EXCEPTION 'Financial month is locked' USING ERRCODE = '22023';
  END IF;

  UPDATE public.timeline_events
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_event_id
  RETURNING * INTO new_event;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'timeline_event',
    p_event_id,
    'restored',
    jsonb_build_object(
      'title', old_event.title,
      'event_date', old_event.event_date,
      'archived_at', old_event.archived_at,
      'archived_by', old_event.archived_by
    ),
    jsonb_build_object(
      'title', new_event.title,
      'event_date', new_event.event_date,
      'archived_at', new_event.archived_at,
      'archived_by', new_event.archived_by
    )
  );

  RETURN p_event_id;
END;
$$;

-- Remove journal-shaped return data and storage from the approved-expense path.
DO $migration$
DECLARE
  definition text;
BEGIN
  definition := pg_get_functiondef(
    'app_private.create_expense_payment_projection(uuid,uuid,uuid,boolean)'::regprocedure
  );
  definition := regexp_replace(
    definition,
    E'''ledger_entry_id'', v_ledger_entry_id,\\s*''journal_entry_id'', NULL',
    E'''ledger_entry_id'', v_ledger_entry_id'
  );
  EXECUTE definition;

  definition := pg_get_functiondef(
    'app_private.approve_expense_submission(uuid,uuid,uuid)'::regprocedure
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*v_journal_entry_id uuid;',
    '',
    'g'
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*v_journal_entry_id := \\(v_projection->>''journal_entry_id''\\)::uuid;',
    '',
    'g'
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*''journal_entry_id'', v_journal_entry_id,',
    '',
    'g'
  );
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.review_expense(uuid,uuid,text,text,text,uuid)'::regprocedure
  );
  definition := regexp_replace(
    definition,
    E'approved_ledger_entry_id =\\s*\\(v_result->>''ledger_entry_id''\\)::uuid,\\s*approved_journal_entry_id =\\s*\\(v_result->>''journal_entry_id''\\)::uuid',
    E'approved_ledger_entry_id =\n            (v_result->>''ledger_entry_id'')::uuid'
  );
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.reverse_expense(uuid,uuid,date,text,text)'::regprocedure
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*v_reversal_journal_id uuid;',
    '',
    'g'
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*v_reversal_journal_id := \\(v_projection->>''journal_entry_id''\\)::uuid;',
    '',
    'g'
  );
  definition := regexp_replace(
    definition,
    E'reversal_ledger_entry_id = v_reversal_ledger_id,\\s*reversal_journal_entry_id = v_reversal_journal_id',
    E'reversal_ledger_entry_id = v_reversal_ledger_id'
  );
  definition := regexp_replace(
    definition,
    E'\\n\\s*''journal_entry_id'', v_reversal_journal_id,',
    '',
    'g'
  );
  EXECUTE definition;
END;
$migration$;

DROP FUNCTION IF EXISTS public.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
);
DROP FUNCTION IF EXISTS app_private.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
);
DROP FUNCTION IF EXISTS public.get_finance_income_owner_state_v1(
  uuid, text, uuid, text, date
);

DO $migration$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT procedure.oid
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND procedure.proname = ANY (ARRAY[
        'backfill_accounting_journals',
        'backfill_property_cash_events',
        'enforce_allocation_journal_append_only',
        'enforce_close_revision_append_only',
        'enforce_property_period_mutation_context',
        'enforce_reserved_journal_projection',
        'ensure_accounting_books_and_accounts',
        'ensure_expense_accounting_bootstrap',
        'finance_inventory_reconciliation_source_id',
        'is_ledger_period_locked',
        'lock_open_property_reporting_period',
        'lock_property_reporting_period',
        'lock_property_reporting_period_internal',
        'post_accounting_journal',
        'post_accounting_journal_internal',
        'post_legacy_ledger_accounting_internal',
        'prevent_accounting_journal_line_mutation',
        'prevent_accounting_journal_mutation',
        'resolve_legacy_accounting_mapping',
        'reverse_accounting_journal',
        'reverse_accounting_journal_internal',
        'set_accounting_period_lock',
        'set_accounting_period_lock_internal',
        'set_ledger_period_lock'
      ])
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', routine.oid::regprocedure);
  END LOOP;
END;
$migration$;

DROP TABLE IF EXISTS public.finance_receipt_allocation_journals CASCADE;
DROP TABLE IF EXISTS public.property_close_revisions CASCADE;
DROP TABLE IF EXISTS public.property_reporting_periods CASCADE;
DROP TABLE IF EXISTS public.ledger_period_locks CASCADE;
DROP TABLE IF EXISTS public.accounting_journal_lines CASCADE;
DROP TABLE IF EXISTS public.accounting_journal_entries CASCADE;
DROP TABLE IF EXISTS public.accounting_periods CASCADE;
DROP TABLE IF EXISTS public.accounting_accounts CASCADE;
DROP TABLE IF EXISTS public.accounting_books CASCADE;

ALTER TABLE public.ledger_entries
  DROP COLUMN IF EXISTS accounting_journal_entry_id;

ALTER TABLE public.expense_submissions
  DROP COLUMN IF EXISTS approved_journal_entry_id,
  DROP COLUMN IF EXISTS reversal_journal_entry_id;

REVOKE ALL ON FUNCTION app_private.is_financial_month_locked(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_open_property_financial_month(
  uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
