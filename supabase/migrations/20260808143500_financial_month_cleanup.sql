CREATE OR REPLACE FUNCTION app_private.lock_property_financial_month(
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
DECLARE
  v_month_start date;
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

  v_month_start := date_trunc('month', p_effective_date)::date;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', 'financial_month_v1', p_organization_id, v_month_start),
      0
    )
  );
END;
$$;

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
      AND procedure.oid <> 'app_private.is_financial_month_locked(uuid,date)'::regprocedure
      AND (
        strpos(
          pg_get_functiondef(procedure.oid),
          'app_private.is_ledger_period_locked'
        ) > 0
        OR strpos(
          pg_get_functiondef(procedure.oid),
          'app_private.lock_property_reporting_period'
        ) > 0
      )
  LOOP
    definition := replace(
      pg_get_functiondef(routine.oid),
      'app_private.is_ledger_period_locked',
      'app_private.is_financial_month_locked'
    );
    definition := replace(
      definition,
      'app_private.lock_property_reporting_period',
      'app_private.lock_property_financial_month'
    );
    definition := replace(
      definition,
      'Property reporting period is not open%',
      'Financial month is locked%'
    );
    definition := replace(
      definition,
      'Organization Ledger period is locked%',
      'Financial month is locked%'
    );
    definition := replace(
      definition,
      'Accounting book period is locked%',
      'Financial month is locked%'
    );
    EXECUTE definition;
  END LOOP;

  definition := pg_get_functiondef(
    'app_private.create_income_settlement_projection(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,date,numeric,public.currency_code,text,text,uuid,boolean)'::regprocedure
  );
  definition := regexp_replace(
    definition,
    E'''ledger_entry_id'', v_ledger_entry_id,\\s*''journal_entry_ids'', ''\\[\\]''::jsonb',
    E'''ledger_entry_id'', v_ledger_entry_id'
  );
  EXECUTE definition;
END;
$migration$;

DROP FUNCTION IF EXISTS public.post_finance_expense_item(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.post_finance_expense_item_expense_approval_unchecked(
  uuid, uuid, date
);
DROP FUNCTION IF EXISTS public.post_finance_income_item(uuid, uuid);
DROP FUNCTION IF EXISTS public.post_finance_income_item_expense_approval_unchecked(
  uuid, uuid
);

REVOKE ALL ON FUNCTION app_private.lock_property_financial_month(
  uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
