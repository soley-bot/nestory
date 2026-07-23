ALTER TABLE public.petty_cash_entries
  ADD COLUMN counterparty_person_id uuid
    REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN void_reason text;

CREATE INDEX petty_cash_entries_org_counterparty_idx
  ON public.petty_cash_entries (organization_id, counterparty_person_id)
  WHERE counterparty_person_id IS NOT NULL;

-- Normalize the legacy aggregate-advance representation without changing the
-- balance users saw before this migration. If an active advance row already
-- itemized the period funding, the old register ignored advance_amount; all
-- other periods fold that aggregate into opening cash before clearing it.
WITH normalized_periods AS (
  SELECT
    period.id,
    period.organization_id,
    period.opening_balance_amount AS previous_opening_balance_amount,
    period.advance_amount AS previous_advance_amount,
    period.opening_balance_amount
      + CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.petty_cash_entries AS entry
            WHERE entry.period_id = period.id
              AND entry.organization_id = period.organization_id
              AND entry.entry_kind = 'advance'
              AND entry.status <> 'void'
              AND entry.archived_at IS NULL
          )
          THEN 0
          ELSE period.advance_amount
        END AS normalized_opening_balance_amount
  FROM public.petty_cash_periods AS period
  WHERE period.advance_amount <> 0
),
updated_periods AS (
  UPDATE public.petty_cash_periods AS period
  SET
    opening_balance_amount = normalization.normalized_opening_balance_amount,
    advance_amount = 0
  FROM normalized_periods AS normalization
  WHERE period.id = normalization.id
  RETURNING
    period.id,
    period.organization_id,
    normalization.previous_opening_balance_amount,
    normalization.previous_advance_amount,
    period.opening_balance_amount
)
INSERT INTO public.activity_logs (
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  previous_values,
  new_values
)
SELECT
  period.organization_id,
  NULL,
  'petty_cash_period',
  period.id,
  'advance_storage_normalized',
  jsonb_build_object(
    'opening_balance_amount', period.previous_opening_balance_amount,
    'advance_amount', period.previous_advance_amount
  ),
  jsonb_build_object(
    'opening_balance_amount', period.opening_balance_amount,
    'advance_amount', 0
  )
FROM updated_periods AS period;

CREATE OR REPLACE FUNCTION public.create_petty_cash_account(
  p_organization_id uuid,
  p_account_number text,
  p_name text,
  p_float_amount numeric,
  p_custodian_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  new_account_id uuid;
  normalized_account_number text := upper(trim(p_account_number));
  normalized_name text := NULLIF(trim(coalesce(p_name, '')), '');
  normalized_float_amount numeric := coalesce(p_float_amount, 0);
  current_period_start date := date_trunc('month', current_date)::date;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_account_number) < 2 THEN
    RAISE EXCEPTION 'Account number is too short' USING ERRCODE = '22023';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Account name is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_float_amount < 0 THEN
    RAISE EXCEPTION 'Float amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_custodian_person_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS role
        ON role.organization_id = person.organization_id
       AND role.person_id = person.id
      WHERE person.id = p_custodian_person_id
        AND person.organization_id = p_organization_id
        AND person.archived_at IS NULL
        AND role.role = 'staff'
        AND role.status = 'active'
        AND role.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Custodian must be active Staff in this organization'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.petty_cash_accounts (
    organization_id,
    account_number,
    name,
    custodian_person_id,
    float_amount,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    normalized_account_number,
    normalized_name,
    p_custodian_person_id,
    normalized_float_amount,
    actor_id,
    actor_id
  )
  RETURNING id INTO new_account_id;

  INSERT INTO public.petty_cash_periods (
    organization_id,
    account_id,
    period_start,
    opening_balance_amount,
    advance_amount,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    new_account_id,
    current_period_start,
    normalized_float_amount,
    0,
    actor_id,
    actor_id
  )
  ON CONFLICT (account_id, period_start) DO NOTHING;

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
    'petty_cash_account',
    new_account_id,
    'created',
    jsonb_build_object(
      'account_number', normalized_account_number,
      'name', normalized_name,
      'custodian_person_id', p_custodian_person_id,
      'float_amount', normalized_float_amount
    )
  );

  RETURN new_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_petty_cash_entry(
  p_organization_id uuid,
  p_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
-- This wrapper is the checked privilege boundary for the two app_private
-- ledger helpers, whose EXECUTE privilege intentionally remains revoked from
-- authenticated callers. Every target is re-scoped to the authenticated
-- actor's administrator organization before the privileged write occurs.
SECURITY DEFINER
SET search_path = ''
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

  IF target_entry.status = 'posted'
    AND target_entry.ledger_entry_id IS NOT NULL THEN
    RETURN target_entry.ledger_entry_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts
    WHERE id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'active'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active petty cash account not found' USING ERRCODE = '23503';
  END IF;

  IF target_entry.entry_kind <> 'expense' THEN
    RAISE EXCEPTION 'Only petty cash expenses post to the ledger'
      USING ERRCODE = '22023';
  END IF;

  IF target_entry.ledger_entry_id IS NOT NULL OR target_entry.status = 'posted' THEN
    RAISE EXCEPTION 'Petty cash posting state is inconsistent'
      USING ERRCODE = '22023';
  END IF;

  IF target_entry.status = 'void' THEN
    RAISE EXCEPTION 'Void petty cash entries cannot be posted'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_periods
    WHERE id = target_entry.period_id
      AND account_id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Open petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF target_entry.property_id IS NULL THEN
    RAISE EXCEPTION 'Petty cash expense needs a property before posting'
      USING ERRCODE = '22023';
  END IF;

  ledger_transaction_date := coalesce(target_entry.clear_date, target_entry.invoice_date);
  ledger_description := concat_ws(
    E'\n',
    NULLIF('Counterparty: ' || coalesce(target_entry.supplier, ''), 'Counterparty: '),
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
  SET
    clear_date = ledger_transaction_date,
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

CREATE OR REPLACE FUNCTION public.open_next_petty_cash_period(
  p_organization_id uuid,
  p_account_id uuid,
  p_period_id uuid,
  p_advance_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_account public.petty_cash_accounts%ROWTYPE;
  target_period public.petty_cash_periods%ROWTYPE;
  next_period_id uuid;
  next_period_start date;
  has_advance_rows boolean;
  movement_total numeric;
  closing_balance numeric;
  normalized_advance_amount numeric;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_account
  FROM public.petty_cash_accounts
  WHERE id = p_account_id
    AND organization_id = p_organization_id
    AND status = 'active'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active petty cash account not found' USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO target_period
  FROM public.petty_cash_periods
  WHERE id = p_period_id
    AND account_id = p_account_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF target_period.status = 'closed' THEN
    RAISE EXCEPTION 'Petty cash period is already closed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.petty_cash_entries AS entry
    WHERE entry.period_id = target_period.id
      AND entry.organization_id = p_organization_id
      AND entry.entry_kind = 'expense'
      AND entry.status NOT IN ('posted', 'void')
      AND entry.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Post or void petty cash expenses before opening the next month'
      USING ERRCODE = '22023';
  END IF;

  IF p_advance_amount IS NOT NULL AND p_advance_amount < 0 THEN
    RAISE EXCEPTION 'Advance amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.petty_cash_entries AS entry
    WHERE entry.period_id = target_period.id
      AND entry.organization_id = p_organization_id
      AND entry.entry_kind = 'advance'
      AND entry.status <> 'void'
      AND entry.archived_at IS NULL
  )
  INTO has_advance_rows;

  SELECT coalesce(sum(entry.in_amount - entry.out_amount), 0)
  INTO movement_total
  FROM public.petty_cash_entries AS entry
  WHERE entry.period_id = target_period.id
    AND entry.organization_id = p_organization_id
    AND entry.status <> 'void'
    AND entry.archived_at IS NULL;

  closing_balance :=
    target_period.opening_balance_amount
    + CASE WHEN has_advance_rows THEN 0 ELSE target_period.advance_amount END
    + movement_total;
  normalized_advance_amount :=
    coalesce(p_advance_amount, greatest(target_account.float_amount - closing_balance, 0));
  next_period_start := (target_period.period_start + interval '1 month')::date;

  -- New periods store cash already on hand, including the rollover top-up, in
  -- opening_balance_amount. Keeping advance_amount at zero avoids making a
  -- later explicit advance row replace unrelated opening cash. The register
  -- calculator still understands nonzero advance_amount for historical
  -- periods created before this migration.
  INSERT INTO public.petty_cash_periods (
    organization_id,
    account_id,
    period_start,
    opening_balance_amount,
    advance_amount,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_account_id,
    next_period_start,
    closing_balance + normalized_advance_amount,
    0,
    actor_id,
    actor_id
  )
  ON CONFLICT (account_id, period_start) DO NOTHING
  RETURNING id INTO next_period_id;

  IF next_period_id IS NULL THEN
    SELECT id
    INTO next_period_id
    FROM public.petty_cash_periods
    WHERE account_id = p_account_id
      AND period_start = next_period_start;
  END IF;

  UPDATE public.petty_cash_periods
  SET
    counted_cash_amount = closing_balance,
    status = 'closed',
    reviewed_at = now(),
    reviewed_by = actor_id,
    updated_by = actor_id
  WHERE id = target_period.id;

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
    'petty_cash_period',
    next_period_id,
    'opened_next_month',
    jsonb_build_object(
      'period_id', target_period.id,
      'period_start', target_period.period_start,
      'closing_balance', closing_balance
    ),
    jsonb_build_object(
      'period_start', next_period_start,
      'opening_balance_amount', closing_balance + normalized_advance_amount,
      'advance_amount', 0,
      'top_up_amount', normalized_advance_amount
    )
  );

  RETURN next_period_id;
END;
$$;

CREATE FUNCTION public.update_petty_cash_entry(
  p_organization_id uuid,
  p_entry_id uuid,
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
  p_counterparty_person_id uuid DEFAULT NULL,
  p_receipt_reference text DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_economic_scope text DEFAULT 'property_expense',
  p_owner_bill_status text DEFAULT 'not_billable',
  p_owner_reimbursable_amount numeric DEFAULT 0,
  p_owner_reimbursed_amount numeric DEFAULT 0,
  p_company_loss_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_entry public.petty_cash_entries%ROWTYPE;
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
  previous_values jsonb;
  next_values jsonb;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts
    WHERE id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'active'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active petty cash account not found' USING ERRCODE = '23503';
  END IF;

  IF target_entry.ledger_entry_id IS NOT NULL
    OR target_entry.status NOT IN ('draft', 'cleared') THEN
    RAISE EXCEPTION 'Only unposted draft or cleared petty cash rows can be edited'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_periods
    WHERE id = target_entry.period_id
      AND account_id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Open petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_entry_kind NOT IN ('expense', 'advance', 'cash_in') THEN
    RAISE EXCEPTION 'Petty cash type is invalid' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('draft', 'cleared') THEN
    RAISE EXCEPTION 'Edited petty cash rows can only be draft or cleared'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_category IS NULL OR normalized_description IS NULL THEN
    RAISE EXCEPTION 'Category and description are required' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_date IS NULL THEN
    RAISE EXCEPTION 'Invoice date is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_counterparty_person_id IS NOT NULL THEN
    IF p_counterparty_person_id = target_entry.counterparty_person_id THEN
      normalized_supplier := target_entry.supplier;
    ELSE
      SELECT person.display_name
      INTO normalized_supplier
      FROM public.people AS person
      WHERE person.id = p_counterparty_person_id
        AND person.organization_id = p_organization_id
        AND person.archived_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.person_roles AS role
          WHERE role.organization_id = p_organization_id
            AND role.person_id = person.id
            AND role.role IN ('tenant', 'owner', 'vendor', 'staff')
            AND role.status = 'active'
            AND role.archived_at IS NULL
        );

      IF normalized_supplier IS NULL THEN
        RAISE EXCEPTION 'Counterparty must be an active person in this organization'
          USING ERRCODE = '23503';
      END IF;
    END IF;
  ELSIF normalized_supplier IS NULL THEN
    RAISE EXCEPTION 'Choose a linked person or name an external party'
      USING ERRCODE = '22023';
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

  IF normalized_economic_scope NOT IN (
    'property_expense',
    'company_advance',
    'company_cost'
  ) THEN
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

  IF normalized_owner_reimbursable_amount < 0
    OR normalized_owner_reimbursed_amount < 0
    OR normalized_company_loss_amount < 0
    OR normalized_owner_reimbursed_amount > normalized_owner_reimbursable_amount
    OR normalized_company_loss_amount > p_amount THEN
    RAISE EXCEPTION 'Petty cash financial amounts are invalid'
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

  previous_values := jsonb_build_object(
    'entry_kind', target_entry.entry_kind,
    'status', target_entry.status,
    'invoice_date', target_entry.invoice_date,
    'clear_date', target_entry.clear_date,
    'category', target_entry.category,
    'supplier', target_entry.supplier,
    'counterparty_person_id', target_entry.counterparty_person_id,
    'description', target_entry.description,
    'receipt_reference', target_entry.receipt_reference,
    'amount', target_entry.in_amount + target_entry.out_amount,
    'property_id', target_entry.property_id,
    'unit_id', target_entry.unit_id,
    'economic_scope', target_entry.economic_scope,
    'owner_bill_status', target_entry.owner_bill_status,
    'owner_reimbursable_amount', target_entry.owner_reimbursable_amount,
    'owner_reimbursed_amount', target_entry.owner_reimbursed_amount,
    'company_loss_amount', target_entry.company_loss_amount,
    'remark', target_entry.remark
  );

  next_values := jsonb_build_object(
    'entry_kind', normalized_entry_kind,
    'status', normalized_status,
    'invoice_date', p_invoice_date,
    'clear_date', p_clear_date,
    'category', normalized_category,
    'supplier', normalized_supplier,
    'counterparty_person_id', p_counterparty_person_id,
    'description', normalized_description,
    'receipt_reference', normalized_receipt_reference,
    'amount', p_amount,
    'property_id', p_property_id,
    'unit_id', p_unit_id,
    'economic_scope', normalized_economic_scope,
    'owner_bill_status', normalized_owner_bill_status,
    'owner_reimbursable_amount', normalized_owner_reimbursable_amount,
    'owner_reimbursed_amount', normalized_owner_reimbursed_amount,
    'company_loss_amount', normalized_company_loss_amount,
    'remark', normalized_remark
  );

  UPDATE public.petty_cash_entries
  SET
    property_id = p_property_id,
    unit_id = p_unit_id,
    counterparty_person_id = p_counterparty_person_id,
    invoice_date = p_invoice_date,
    clear_date = p_clear_date,
    entry_kind = normalized_entry_kind,
    status = normalized_status,
    category = normalized_category,
    supplier = normalized_supplier,
    description = normalized_description,
    receipt_reference = normalized_receipt_reference,
    out_amount = cash_out_amount,
    in_amount = cash_in_amount,
    economic_scope = normalized_economic_scope,
    owner_bill_status = normalized_owner_bill_status,
    owner_reimbursable_amount = normalized_owner_reimbursable_amount,
    owner_reimbursed_amount = normalized_owner_reimbursed_amount,
    company_loss_amount = normalized_company_loss_amount,
    remark = normalized_remark,
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
    'updated',
    previous_values,
    next_values
  );

  RETURN jsonb_build_object(
    'entry_id', p_entry_id,
    'previous_property_id', target_entry.property_id,
    'previous_unit_id', target_entry.unit_id,
    'property_id', p_property_id,
    'unit_id', p_unit_id
  );
END;
$$;

CREATE FUNCTION public.void_petty_cash_entry(
  p_organization_id uuid,
  p_entry_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_entry public.petty_cash_entries%ROWTYPE;
  normalized_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
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

  IF target_entry.status = 'void' THEN
    RETURN target_entry.id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts
    WHERE id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'active'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active petty cash account not found' USING ERRCODE = '23503';
  END IF;

  IF target_entry.ledger_entry_id IS NOT NULL
    OR target_entry.status NOT IN ('draft', 'cleared') THEN
    RAISE EXCEPTION 'Only unposted draft or cleared petty cash rows can be voided'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_periods
    WHERE id = target_entry.period_id
      AND account_id = target_entry.account_id
      AND organization_id = p_organization_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Open petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'Void reason is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_reason) > 400 THEN
    RAISE EXCEPTION 'Void reason is too long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.petty_cash_entries
  SET
    status = 'void',
    voided_at = now(),
    voided_by = actor_id,
    void_reason = normalized_reason,
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
    'voided',
    jsonb_build_object(
      'status', target_entry.status,
      'voided_at', target_entry.voided_at,
      'voided_by', target_entry.voided_by,
      'void_reason', target_entry.void_reason,
      'in_amount', target_entry.in_amount,
      'out_amount', target_entry.out_amount
    ),
    jsonb_build_object(
      'status', 'void',
      'voided_by', actor_id,
      'void_reason', normalized_reason,
      'in_amount', target_entry.in_amount,
      'out_amount', target_entry.out_amount,
      'effective_in_amount', 0,
      'effective_out_amount', 0
    )
  );

  RETURN p_entry_id;
END;
$$;

DROP FUNCTION public.create_petty_cash_entry(
  uuid, uuid, uuid, uuid, uuid, date, date, text, text, text,
  text, text, numeric, text, text, text, text, numeric, numeric, numeric
);

CREATE FUNCTION public.create_petty_cash_entry(
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
  p_counterparty_person_id uuid DEFAULT NULL,
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
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
  IF actor_id IS NULL THEN
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
      AND status = 'active'
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
      AND status = 'open'
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

  IF p_invoice_date IS NULL THEN
    RAISE EXCEPTION 'Invoice date is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_counterparty_person_id IS NOT NULL THEN
    SELECT person.display_name
    INTO normalized_supplier
    FROM public.people AS person
    WHERE person.id = p_counterparty_person_id
      AND person.organization_id = p_organization_id
      AND person.archived_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.person_roles AS role
        WHERE role.organization_id = p_organization_id
          AND role.person_id = person.id
          AND role.role IN ('tenant', 'owner', 'vendor', 'staff')
          AND role.status = 'active'
          AND role.archived_at IS NULL
      );

    IF normalized_supplier IS NULL THEN
      RAISE EXCEPTION 'Counterparty must be an active person in this organization'
        USING ERRCODE = '23503';
    END IF;
  ELSIF normalized_supplier IS NULL THEN
    RAISE EXCEPTION 'Choose a linked person or name an external party'
      USING ERRCODE = '22023';
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

  IF normalized_economic_scope NOT IN (
    'property_expense',
    'company_advance',
    'company_cost'
  ) THEN
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

  IF normalized_owner_reimbursable_amount < 0
    OR normalized_owner_reimbursed_amount < 0
    OR normalized_company_loss_amount < 0 THEN
    RAISE EXCEPTION 'Petty cash financial amounts cannot be negative'
      USING ERRCODE = '22023';
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
    counterparty_person_id,
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
    p_counterparty_person_id,
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
    actor_id,
    actor_id
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
    actor_id,
    'petty_cash_entry',
    new_entry_id,
    'created',
    jsonb_build_object(
      'account_id', p_account_id,
      'period_id', p_period_id,
      'entry_kind', normalized_entry_kind,
      'status', normalized_status,
      'category', normalized_category,
      'supplier', normalized_supplier,
      'counterparty_person_id', p_counterparty_person_id,
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

REVOKE ALL ON FUNCTION public.create_petty_cash_account(
  uuid, text, text, numeric, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_petty_cash_account(
  uuid, text, text, numeric, uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_petty_cash_entry(
  uuid, uuid, uuid, uuid, uuid, date, date, text, text, text,
  text, text, numeric, uuid, text, text, text, text, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_petty_cash_entry(
  uuid, uuid, uuid, uuid, uuid, date, date, text, text, text,
  text, text, numeric, uuid, text, text, text, text, numeric, numeric, numeric
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_petty_cash_entry(
  uuid, uuid, uuid, uuid, date, date, text, text, text,
  text, text, numeric, uuid, text, text, text, text, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_petty_cash_entry(
  uuid, uuid, uuid, uuid, date, date, text, text, text,
  text, text, numeric, uuid, text, text, text, text, numeric, numeric, numeric
) TO authenticated;

REVOKE ALL ON FUNCTION public.void_petty_cash_entry(
  uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_petty_cash_entry(
  uuid, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.post_petty_cash_entry(
  uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_petty_cash_entry(
  uuid, uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.open_next_petty_cash_period(
  uuid, uuid, uuid, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_next_petty_cash_period(
  uuid, uuid, uuid, numeric
) TO authenticated;

-- All Petty Cash writes must pass through the checked RPC boundaries above so
-- period locks, organization/person scope, audit logs, and posted immutability
-- cannot be bypassed with direct Data API table mutations.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE
  public.petty_cash_accounts,
  public.petty_cash_periods,
  public.petty_cash_entries
FROM authenticated, anon;
