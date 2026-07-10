CREATE OR REPLACE FUNCTION app_private.create_legacy_ledger_entry_internal(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_transaction_date date,
  p_direction text,
  p_category text,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text,
  p_source_type text,
  p_source_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  new_ledger_entry_id uuid;
  new_timeline_event_id uuid;
  normalized_category text := NULLIF(trim(coalesce(p_category, '')), '');
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_direction text := lower(trim(coalesce(p_direction, '')));
  normalized_source_type text := lower(trim(coalesce(p_source_type, 'manual')));
  timeline_cost_amount numeric;
  timeline_cost_currency public.currency_code;
  timeline_event_type public.timeline_event_type := 'General Note'::public.timeline_event_type;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.units
      WHERE id = p_unit_id
        AND property_id = p_property_id
        AND organization_id = p_organization_id
        AND archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF p_transaction_date IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'Transaction date and currency are required'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_direction NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Ledger direction must be income or expense'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_category IS NULL OR length(normalized_category) < 2 THEN
    RAISE EXCEPTION 'Category is too short' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF normalized_source_type NOT IN (
    'manual',
    'finance_income',
    'finance_expense',
    'petty_cash',
    'maintenance_task'
  ) THEN
    RAISE EXCEPTION 'Ledger source type is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_direction = 'expense' THEN
    timeline_cost_amount := p_amount;
    timeline_cost_currency := p_currency;

    IF lower(normalized_category) LIKE '%maintenance%' THEN
      timeline_event_type := 'Maintenance'::public.timeline_event_type;
    ELSIF lower(normalized_category) LIKE '%repair%' THEN
      timeline_event_type := 'Repair'::public.timeline_event_type;
    ELSIF lower(normalized_category) LIKE '%renovation%' THEN
      timeline_event_type := 'Renovation'::public.timeline_event_type;
    END IF;
  END IF;

  INSERT INTO public.ledger_entries (
    organization_id,
    property_id,
    unit_id,
    transaction_date,
    direction,
    category,
    amount,
    currency,
    description,
    source_type,
    source_id,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_transaction_date,
    normalized_direction,
    normalized_category,
    p_amount,
    p_currency,
    normalized_description,
    normalized_source_type,
    p_source_id,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO new_ledger_entry_id;

  INSERT INTO public.timeline_events (
    organization_id,
    property_id,
    unit_id,
    ledger_entry_id,
    event_date,
    event_type,
    title,
    description,
    cost_amount,
    cost_currency,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    new_ledger_entry_id,
    p_transaction_date,
    timeline_event_type,
    initcap(normalized_direction) || ': ' || normalized_category,
    normalized_description,
    timeline_cost_amount,
    timeline_cost_currency,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO new_timeline_event_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES
  (
    p_organization_id,
    p_actor_id,
    'ledger_entry',
    new_ledger_entry_id,
    'created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'transaction_date', p_transaction_date,
      'direction', normalized_direction,
      'category', normalized_category,
      'amount', p_amount,
      'currency', p_currency,
      'source_type', normalized_source_type,
      'source_id', p_source_id,
      'timeline_event_id', new_timeline_event_id
    )
  ),
  (
    p_organization_id,
    p_actor_id,
    'timeline_event',
    new_timeline_event_id,
    'created_from_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'event_date', p_transaction_date,
      'event_type', timeline_event_type,
      'title', initcap(normalized_direction) || ': ' || normalized_category,
      'cost_amount', timeline_cost_amount,
      'cost_currency', timeline_cost_currency
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.post_legacy_ledger_accounting_internal(
  p_ledger_entry_id uuid,
  p_income_type text,
  p_expense_type text,
  p_economic_scope text,
  p_lease_id uuid,
  p_vendor_person_id uuid,
  p_posting_key text,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  target_ledger public.ledger_entries%ROWTYPE;
  mapping_record record;
  target_book_id uuid;
  target_journal_id uuid;
  target_lines jsonb;
  source_identity uuid;
BEGIN
  SELECT *
  INTO target_ledger
  FROM public.ledger_entries
  WHERE id = p_ledger_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = '23503';
  END IF;

  IF target_ledger.accounting_journal_entry_id IS NOT NULL THEN
    RETURN target_ledger.accounting_journal_entry_id;
  END IF;

  SELECT *
  INTO STRICT mapping_record
  FROM app_private.resolve_legacy_accounting_mapping(
    target_ledger.source_type,
    target_ledger.direction,
    target_ledger.category,
    p_income_type,
    p_expense_type,
    p_economic_scope
  );

  PERFORM app_private.ensure_accounting_books_and_accounts(
    target_ledger.organization_id,
    target_ledger.currency
  );

  SELECT id
  INTO STRICT target_book_id
  FROM public.accounting_books
  WHERE organization_id = target_ledger.organization_id
    AND book_type = mapping_record.book_type
    AND currency = target_ledger.currency
    AND is_default
    AND archived_at IS NULL;

  target_lines := jsonb_build_array(
    jsonb_strip_nulls(
      jsonb_build_object(
        'account_system_code', mapping_record.debit_system_code,
        'description', target_ledger.description,
        'debit_amount', target_ledger.amount,
        'credit_amount', 0,
        'property_id', target_ledger.property_id,
        'unit_id', target_ledger.unit_id,
        'lease_id', p_lease_id,
        'vendor_person_id', p_vendor_person_id
      )
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'account_system_code', mapping_record.credit_system_code,
        'description', target_ledger.description,
        'debit_amount', 0,
        'credit_amount', target_ledger.amount,
        'property_id', target_ledger.property_id,
        'unit_id', target_ledger.unit_id,
        'lease_id', p_lease_id,
        'vendor_person_id', p_vendor_person_id
      )
    )
  );

  source_identity := coalesce(target_ledger.source_id, target_ledger.id);

  target_journal_id := app_private.post_accounting_journal_internal(
    target_ledger.organization_id,
    target_book_id,
    target_ledger.source_type,
    source_identity,
    p_posting_key,
    target_ledger.transaction_date,
    target_ledger.currency,
    coalesce(
      NULLIF(trim(target_ledger.description), ''),
      concat(initcap(target_ledger.direction), ': ', target_ledger.category)
    ),
    target_ledger.category,
    target_lines,
    p_actor_id,
    target_ledger.id
  );

  UPDATE public.ledger_entries
  SET accounting_journal_entry_id = target_journal_id,
      updated_by = p_actor_id
  WHERE id = target_ledger.id;

  RETURN target_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_legacy_ledger_entry_internal(
  uuid, uuid, uuid, date, text, text, numeric, public.currency_code,
  text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.post_legacy_ledger_accounting_internal(
  uuid, text, text, text, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_transaction_date date,
  p_direction text,
  p_category text,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  new_ledger_entry_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_transaction_date,
    p_direction,
    p_category,
    p_amount,
    p_currency,
    p_description,
    'manual',
    NULL,
    actor_id
  );

  PERFORM app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'posted',
    actor_id
  );

  RETURN new_ledger_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_finance_income_item(
  p_income_item_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_income public.finance_income_items%ROWTYPE;
  new_ledger_entry_id uuid;
  journal_entry_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_income
  FROM public.finance_income_items
  WHERE id = p_income_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  IF target_income.status = 'posted' AND target_income.ledger_entry_id IS NOT NULL THEN
    RETURN target_income.ledger_entry_id;
  END IF;

  IF target_income.status = 'void' THEN
    RAISE EXCEPTION 'Voided income cannot be posted' USING ERRCODE = '22023';
  END IF;

  IF target_income.amount_received <= 0 OR target_income.received_date IS NULL THEN
    RAISE EXCEPTION 'Record received money before posting' USING ERRCODE = '22023';
  END IF;

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    target_income.property_id,
    target_income.unit_id,
    target_income.received_date,
    'income',
    replace(initcap(replace(target_income.income_type, '_', ' ')), '  ', ' '),
    target_income.amount_received,
    target_income.currency,
    concat_ws(' - ', target_income.payer_label, target_income.description),
    'finance_income',
    target_income.id,
    actor_id
  );

  journal_entry_id := app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    target_income.income_type,
    NULL,
    NULL,
    target_income.lease_id,
    NULL,
    'received',
    actor_id
  );

  UPDATE public.finance_income_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      updated_by = actor_id
  WHERE id = target_income.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    actor_id,
    'finance_income_item',
    target_income.id,
    'posted_to_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'accounting_journal_entry_id', journal_entry_id
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_finance_expense_item(
  p_expense_item_id uuid,
  p_organization_id uuid,
  p_paid_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_expense public.finance_expense_items%ROWTYPE;
  new_ledger_entry_id uuid;
  journal_entry_id uuid;
  transaction_date date;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_expense
  FROM public.finance_expense_items
  WHERE id = p_expense_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense item not found' USING ERRCODE = '23503';
  END IF;

  IF target_expense.status IN ('posted', 'paid')
    AND target_expense.ledger_entry_id IS NOT NULL THEN
    RETURN target_expense.ledger_entry_id;
  END IF;

  IF target_expense.status = 'void' THEN
    RAISE EXCEPTION 'Voided expense cannot be posted' USING ERRCODE = '22023';
  END IF;

  IF target_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'Approve the expense before posting' USING ERRCODE = '22023';
  END IF;

  IF target_expense.expense_type = 'owner_payout' THEN
    RAISE EXCEPTION 'Use the owner distribution workflow'
      USING ERRCODE = '22023';
  END IF;

  transaction_date := coalesce(
    p_paid_date,
    target_expense.paid_date,
    target_expense.invoice_date
  );

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    target_expense.property_id,
    target_expense.unit_id,
    transaction_date,
    'expense',
    target_expense.category,
    target_expense.amount,
    target_expense.currency,
    concat_ws(' - ', target_expense.vendor_label, target_expense.description),
    'finance_expense',
    target_expense.id,
    actor_id
  );

  journal_entry_id := app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    NULL,
    target_expense.expense_type,
    target_expense.economic_scope,
    NULL,
    target_expense.vendor_person_id,
    'paid',
    actor_id
  );

  UPDATE public.finance_expense_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      paid_date = transaction_date,
      updated_by = actor_id
  WHERE id = target_expense.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    actor_id,
    'finance_expense_item',
    target_expense.id,
    'posted_to_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'accounting_journal_entry_id', journal_entry_id
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_petty_cash_entry(
  p_organization_id uuid,
  p_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_entry public.petty_cash_entries%ROWTYPE;
  new_ledger_entry_id uuid;
  journal_entry_id uuid;
  ledger_description text;
  ledger_transaction_date date;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_entry
  FROM public.petty_cash_entries
  WHERE id = p_entry_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash entry not found' USING ERRCODE = '23503';
  END IF;

  IF target_entry.entry_kind <> 'expense' THEN
    RAISE EXCEPTION 'Only petty cash expenses post to the ledger'
      USING ERRCODE = '22023';
  END IF;

  IF target_entry.ledger_entry_id IS NOT NULL OR target_entry.status = 'posted' THEN
    RAISE EXCEPTION 'Petty cash entry is already posted'
      USING ERRCODE = '22023';
  END IF;

  IF target_entry.status = 'void' THEN
    RAISE EXCEPTION 'Void petty cash entries cannot be posted'
      USING ERRCODE = '22023';
  END IF;

  IF target_entry.property_id IS NULL THEN
    RAISE EXCEPTION 'Petty cash expense needs a property before posting'
      USING ERRCODE = '22023';
  END IF;

  ledger_transaction_date := coalesce(target_entry.clear_date, target_entry.invoice_date);
  ledger_description := concat_ws(
    E'\n',
    NULLIF('Supplier: ' || coalesce(target_entry.supplier, ''), 'Supplier: '),
    'Petty cash: ' || target_entry.description,
    NULLIF('Receipt: ' || coalesce(target_entry.receipt_reference, ''), 'Receipt: '),
    NULLIF('Remark: ' || coalesce(target_entry.remark, ''), 'Remark: ')
  );

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    target_entry.property_id,
    target_entry.unit_id,
    ledger_transaction_date,
    'expense',
    'Petty Cash - ' || target_entry.category,
    target_entry.out_amount,
    target_entry.currency,
    ledger_description,
    'petty_cash',
    target_entry.id,
    actor_id
  );

  journal_entry_id := app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    NULL,
    NULL,
    target_entry.economic_scope,
    NULL,
    NULL,
    'cleared',
    actor_id
  );

  UPDATE public.petty_cash_entries
  SET clear_date = ledger_transaction_date,
      status = 'posted',
      ledger_entry_id = new_ledger_entry_id,
      updated_by = actor_id
  WHERE id = p_entry_id;

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
    actor_id,
    'petty_cash_entry',
    p_entry_id,
    'posted_to_ledger',
    jsonb_build_object(
      'status', target_entry.status,
      'ledger_entry_id', target_entry.ledger_entry_id
    ),
    jsonb_build_object(
      'status', 'posted',
      'ledger_entry_id', new_ledger_entry_id,
      'accounting_journal_entry_id', journal_entry_id
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ledger_entry(
  uuid, uuid, uuid, date, text, text, numeric, public.currency_code, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_ledger_entry(
  uuid, uuid, uuid, date, text, text, numeric, public.currency_code, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.post_finance_income_item(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_finance_income_item(uuid, uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.post_finance_expense_item(uuid, uuid, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_finance_expense_item(uuid, uuid, date)
TO authenticated;

REVOKE ALL ON FUNCTION public.post_petty_cash_entry(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_petty_cash_entry(uuid, uuid)
TO authenticated;
