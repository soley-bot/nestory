ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id uuid;

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check
  CHECK (source_type IN (
    'manual',
    'finance_income',
    'finance_expense',
    'petty_cash',
    'maintenance_task'
  ));

CREATE INDEX IF NOT EXISTS ledger_entries_org_source_idx
  ON public.ledger_entries (organization_id, source_type, source_id)
  WHERE archived_at IS NULL;

UPDATE public.ledger_entries AS ledger
SET source_type = 'finance_income',
    source_id = income.id
FROM public.finance_income_items AS income
WHERE income.ledger_entry_id = ledger.id;

UPDATE public.ledger_entries AS ledger
SET source_type = 'finance_expense',
    source_id = expense.id
FROM public.finance_expense_items AS expense
WHERE expense.ledger_entry_id = ledger.id;

UPDATE public.ledger_entries AS ledger
SET source_type = 'petty_cash',
    source_id = entry.id
FROM public.petty_cash_entries AS entry
WHERE entry.ledger_entry_id = ledger.id;

ALTER TABLE public.petty_cash_entries
  ADD COLUMN IF NOT EXISTS economic_scope text NOT NULL DEFAULT 'property_expense',
  ADD COLUMN IF NOT EXISTS owner_bill_status text NOT NULL DEFAULT 'not_billable',
  ADD COLUMN IF NOT EXISTS owner_reimbursable_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_reimbursed_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_loss_amount numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.petty_cash_entries
  DROP CONSTRAINT IF EXISTS petty_cash_entries_economic_scope_check,
  DROP CONSTRAINT IF EXISTS petty_cash_entries_owner_bill_status_check,
  DROP CONSTRAINT IF EXISTS petty_cash_entries_company_amounts_check,
  DROP CONSTRAINT IF EXISTS petty_cash_entries_company_handling_check;

ALTER TABLE public.petty_cash_entries
  ADD CONSTRAINT petty_cash_entries_economic_scope_check
    CHECK (economic_scope IN ('property_expense', 'company_advance', 'company_cost')),
  ADD CONSTRAINT petty_cash_entries_owner_bill_status_check
    CHECK (owner_bill_status IN (
      'not_billable',
      'billable',
      'billed',
      'partially_reimbursed',
      'reimbursed',
      'written_off'
    )),
  ADD CONSTRAINT petty_cash_entries_company_amounts_check
    CHECK (
      owner_reimbursable_amount >= 0
      AND owner_reimbursed_amount >= 0
      AND owner_reimbursed_amount <= owner_reimbursable_amount
      AND company_loss_amount >= 0
      AND company_loss_amount <= greatest(out_amount, in_amount)
    ),
  ADD CONSTRAINT petty_cash_entries_company_handling_check
    CHECK (
      (
        entry_kind = 'expense'
        AND economic_scope = 'company_advance'
        AND owner_bill_status <> 'not_billable'
        AND owner_reimbursable_amount > 0
      )
      OR (
        economic_scope <> 'company_advance'
        AND owner_bill_status = 'not_billable'
        AND owner_reimbursable_amount = 0
        AND owner_reimbursed_amount = 0
      )
    );

CREATE INDEX IF NOT EXISTS petty_cash_entries_org_company_scope_idx
  ON public.petty_cash_entries (
    organization_id,
    economic_scope,
    owner_bill_status,
    invoice_date DESC
  )
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS finance_income_items_org_lease_rent_due_unique
  ON public.finance_income_items (organization_id, lease_id, due_date, income_type)
  WHERE archived_at IS NULL
    AND lease_id IS NOT NULL
    AND income_type = 'rent';

CREATE OR REPLACE FUNCTION public.generate_monthly_rent_income_items(
  p_organization_id uuid,
  p_month date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  generated_count integer := 0;
  month_start date := date_trunc('month', coalesce(p_month, CURRENT_DATE))::date;
  month_end date := (date_trunc('month', coalesce(p_month, CURRENT_DATE)) + interval '1 month - 1 day')::date;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.finance_income_items (
    organization_id,
    property_id,
    unit_id,
    lease_id,
    income_type,
    payer_label,
    due_date,
    amount_due,
    amount_received,
    received_date,
    status,
    currency,
    description,
    reference,
    created_by,
    updated_by
  )
  SELECT
    lease.organization_id,
    lease.property_id,
    lease.unit_id,
    lease.id,
    'rent',
    lease.tenant_name,
    month_start,
    lease.monthly_rent_amount,
    0,
    NULL,
    'open',
    lease.monthly_rent_currency,
    'Monthly rent',
    to_char(month_start, 'YYYY-MM'),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.archived_at IS NULL
    AND lease.status IN ('active', 'notice_given')
    AND lease.monthly_rent_amount > 0
    AND lease.lease_start_date <= month_end
    AND lease.lease_end_date >= month_start
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS generated_count = ROW_COUNT;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    p_organization_id,
    'generated_monthly_rent',
    (SELECT auth.uid()),
    jsonb_build_object(
      'month', month_start,
      'generated_count', generated_count
    )
  );

  RETURN generated_count;
END;
$$;

DROP FUNCTION IF EXISTS public.create_petty_cash_entry(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.create_petty_cash_entry(
  p_organization_id uuid,
  p_account_id uuid,
  p_period_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_invoice_date date,
  p_clear_date date,
  p_entry_kind text,
  p_status text,
  p_category text,
  p_supplier text,
  p_description text,
  p_amount numeric,
  p_receipt_reference text DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_economic_scope text DEFAULT 'property_expense',
  p_owner_bill_status text DEFAULT 'not_billable',
  p_owner_reimbursable_amount numeric DEFAULT 0,
  p_owner_reimbursed_amount numeric DEFAULT 0,
  p_company_loss_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_entry_id uuid;
  normalized_category text := NULLIF(trim(coalesce(p_category, '')), '');
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_entry_kind text := lower(trim(coalesce(p_entry_kind, 'expense')));
  normalized_status text := lower(trim(coalesce(p_status, 'draft')));
  normalized_supplier text := NULLIF(trim(coalesce(p_supplier, '')), '');
  normalized_receipt_reference text := NULLIF(trim(coalesce(p_receipt_reference, '')), '');
  normalized_remark text := NULLIF(trim(coalesce(p_remark, '')), '');
  normalized_economic_scope text := lower(trim(coalesce(p_economic_scope, 'property_expense')));
  normalized_owner_bill_status text := lower(trim(coalesce(p_owner_bill_status, 'not_billable')));
  normalized_owner_reimbursable_amount numeric := coalesce(p_owner_reimbursable_amount, 0);
  normalized_owner_reimbursed_amount numeric := coalesce(p_owner_reimbursed_amount, 0);
  normalized_company_loss_amount numeric := coalesce(p_company_loss_amount, 0);
  cash_in_amount numeric := 0;
  cash_out_amount numeric := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts
    WHERE id = p_account_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Petty cash account not found' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_periods
    WHERE id = p_period_id
      AND account_id = p_account_id
      AND organization_id = p_organization_id
      AND status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'Open petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_entry_kind NOT IN ('expense', 'advance', 'cash_in') THEN
    RAISE EXCEPTION 'Petty cash type is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('draft', 'cleared') THEN
    RAISE EXCEPTION 'New petty cash rows can only be draft or cleared'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_category IS NULL THEN
    RAISE EXCEPTION 'Category is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_description IS NULL THEN
    RAISE EXCEPTION 'Description is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF normalized_entry_kind = 'expense' THEN
    cash_out_amount := p_amount;

    IF p_property_id IS NULL THEN
      RAISE EXCEPTION 'Expense rows need a property before posting'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    cash_in_amount := p_amount;
    normalized_economic_scope := 'property_expense';
    normalized_owner_bill_status := 'not_billable';
    normalized_owner_reimbursable_amount := 0;
    normalized_owner_reimbursed_amount := 0;
    normalized_company_loss_amount := 0;
  END IF;

  IF normalized_economic_scope NOT IN ('property_expense', 'company_advance', 'company_cost') THEN
    RAISE EXCEPTION 'Choose a valid company handling option' USING ERRCODE = '22023';
  END IF;

  IF normalized_owner_bill_status NOT IN (
    'not_billable',
    'billable',
    'billed',
    'partially_reimbursed',
    'reimbursed',
    'written_off'
  ) THEN
    RAISE EXCEPTION 'Choose a valid owner bill status' USING ERRCODE = '22023';
  END IF;

  IF normalized_entry_kind = 'expense'
    AND normalized_economic_scope = 'company_advance' THEN
    IF normalized_owner_bill_status = 'not_billable' THEN
      normalized_owner_bill_status := 'billable';
    END IF;

    IF normalized_owner_reimbursable_amount <= 0 THEN
      normalized_owner_reimbursable_amount := p_amount;
    END IF;
  ELSIF normalized_economic_scope <> 'company_advance' THEN
    normalized_owner_bill_status := 'not_billable';
    normalized_owner_reimbursable_amount := 0;
    normalized_owner_reimbursed_amount := 0;
  END IF;

  IF normalized_entry_kind = 'expense'
    AND normalized_economic_scope = 'company_cost'
    AND normalized_company_loss_amount <= 0 THEN
    normalized_company_loss_amount := p_amount;
  END IF;

  IF normalized_owner_reimbursed_amount > normalized_owner_reimbursable_amount THEN
    RAISE EXCEPTION 'Owner reimbursed amount cannot exceed billable amount'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_company_loss_amount > p_amount THEN
    RAISE EXCEPTION 'Company loss cannot exceed petty cash amount'
      USING ERRCODE = '22023';
  END IF;

  IF p_property_id IS NOT NULL
    AND NOT EXISTS (
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

  INSERT INTO public.petty_cash_entries (
    organization_id,
    account_id,
    period_id,
    property_id,
    unit_id,
    invoice_date,
    clear_date,
    entry_kind,
    status,
    category,
    supplier,
    description,
    receipt_reference,
    out_amount,
    in_amount,
    economic_scope,
    owner_bill_status,
    owner_reimbursable_amount,
    owner_reimbursed_amount,
    company_loss_amount,
    remark,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_account_id,
    p_period_id,
    p_property_id,
    p_unit_id,
    p_invoice_date,
    p_clear_date,
    normalized_entry_kind,
    normalized_status,
    normalized_category,
    normalized_supplier,
    normalized_description,
    normalized_receipt_reference,
    cash_out_amount,
    cash_in_amount,
    normalized_economic_scope,
    normalized_owner_bill_status,
    normalized_owner_reimbursable_amount,
    normalized_owner_reimbursed_amount,
    normalized_company_loss_amount,
    normalized_remark,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_entry_id;

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
    (SELECT auth.uid()),
    'petty_cash_entry',
    new_entry_id,
    'created',
    jsonb_build_object(
      'account_id', p_account_id,
      'period_id', p_period_id,
      'entry_kind', normalized_entry_kind,
      'status', normalized_status,
      'category', normalized_category,
      'amount', p_amount,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'economic_scope', normalized_economic_scope,
      'owner_bill_status', normalized_owner_bill_status,
      'owner_reimbursable_amount', normalized_owner_reimbursable_amount,
      'owner_reimbursed_amount', normalized_owner_reimbursed_amount,
      'company_loss_amount', normalized_company_loss_amount
    )
  );

  RETURN new_entry_id;
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
  target_income public.finance_income_items%ROWTYPE;
  new_ledger_entry_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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

  new_ledger_entry_id := public.create_ledger_entry(
    p_organization_id,
    target_income.property_id,
    target_income.unit_id,
    target_income.received_date,
    'income',
    replace(initcap(replace(target_income.income_type, '_', ' ')), ' ', ' '),
    target_income.amount_received,
    target_income.currency,
    concat_ws(' - ', target_income.payer_label, target_income.description)
  );

  UPDATE public.ledger_entries
  SET source_type = 'finance_income',
      source_id = target_income.id
  WHERE id = new_ledger_entry_id;

  UPDATE public.finance_income_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      updated_by = (SELECT auth.uid())
  WHERE id = target_income.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    target_income.id,
    'posted_to_ledger',
    (SELECT auth.uid()),
    jsonb_build_object('ledger_entry_id', new_ledger_entry_id)
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
  target_expense public.finance_expense_items%ROWTYPE;
  new_ledger_entry_id uuid;
  transaction_date date;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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

  IF target_expense.status IN ('posted', 'paid') AND target_expense.ledger_entry_id IS NOT NULL THEN
    RETURN target_expense.ledger_entry_id;
  END IF;

  IF target_expense.status = 'void' THEN
    RAISE EXCEPTION 'Voided expense cannot be posted' USING ERRCODE = '22023';
  END IF;

  IF target_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'Approve the expense before posting' USING ERRCODE = '22023';
  END IF;

  transaction_date := coalesce(p_paid_date, target_expense.paid_date, target_expense.invoice_date);

  new_ledger_entry_id := public.create_ledger_entry(
    p_organization_id,
    target_expense.property_id,
    target_expense.unit_id,
    transaction_date,
    'expense',
    target_expense.category,
    target_expense.amount,
    target_expense.currency,
    concat_ws(' - ', target_expense.vendor_label, target_expense.description)
  );

  UPDATE public.ledger_entries
  SET source_type = 'finance_expense',
      source_id = target_expense.id
  WHERE id = new_ledger_entry_id;

  UPDATE public.finance_expense_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      paid_date = transaction_date,
      updated_by = (SELECT auth.uid())
  WHERE id = target_expense.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_expense_item',
    target_expense.id,
    'posted_to_ledger',
    (SELECT auth.uid()),
    jsonb_build_object('ledger_entry_id', new_ledger_entry_id)
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
  target_entry public.petty_cash_entries%ROWTYPE;
  new_ledger_entry_id uuid;
  ledger_description text;
  ledger_transaction_date date;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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

  IF app_private.is_ledger_period_locked(p_organization_id, ledger_transaction_date) THEN
    RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
  END IF;

  ledger_description := concat_ws(
    E'\n',
    NULLIF('Supplier: ' || coalesce(target_entry.supplier, ''), 'Supplier: '),
    'Petty cash: ' || target_entry.description,
    NULLIF('Receipt: ' || coalesce(target_entry.receipt_reference, ''), 'Receipt: '),
    NULLIF('Remark: ' || coalesce(target_entry.remark, ''), 'Remark: ')
  );

  new_ledger_entry_id := public.create_ledger_entry(
    p_organization_id,
    target_entry.property_id,
    target_entry.unit_id,
    ledger_transaction_date,
    'expense',
    'Petty Cash - ' || target_entry.category,
    target_entry.out_amount,
    target_entry.currency,
    ledger_description
  );

  UPDATE public.ledger_entries
  SET source_type = 'petty_cash',
      source_id = target_entry.id
  WHERE id = new_ledger_entry_id;

  UPDATE public.petty_cash_entries
  SET
    clear_date = ledger_transaction_date,
    status = 'posted',
    ledger_entry_id = new_ledger_entry_id,
    updated_by = (SELECT auth.uid())
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
    (SELECT auth.uid()),
    'petty_cash_entry',
    p_entry_id,
    'posted_to_ledger',
    jsonb_build_object(
      'status', target_entry.status,
      'ledger_entry_id', target_entry.ledger_entry_id
    ),
    jsonb_build_object(
      'status', 'posted',
      'ledger_entry_id', new_ledger_entry_id
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_rent_income_items(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_monthly_rent_income_items(uuid, date)
TO authenticated;

REVOKE ALL ON FUNCTION public.create_petty_cash_entry(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_petty_cash_entry(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) TO authenticated;
