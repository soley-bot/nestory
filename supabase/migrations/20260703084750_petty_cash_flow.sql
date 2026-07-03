CREATE TABLE IF NOT EXISTS public.petty_cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  name text NOT NULL,
  custodian_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  float_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (float_amount >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT petty_cash_accounts_number_unique
    UNIQUE (organization_id, account_number)
);

CREATE TABLE IF NOT EXISTS public.petty_cash_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  opening_balance_amount numeric(14, 2) NOT NULL DEFAULT 0,
  advance_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
  counted_cash_amount numeric(14, 2) CHECK (counted_cash_amount IS NULL OR counted_cash_amount >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'closed')),
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT petty_cash_periods_month_start_check
    CHECK (period_start = date_trunc('month', period_start)::date),
  CONSTRAINT petty_cash_periods_unique_period
    UNIQUE (account_id, period_start)
);

CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.petty_cash_periods(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  clear_date date,
  entry_kind text NOT NULL DEFAULT 'expense'
    CHECK (entry_kind IN ('expense', 'advance', 'cash_in')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'cleared', 'posted', 'void')),
  category text NOT NULL,
  supplier text,
  description text NOT NULL,
  receipt_reference text,
  out_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (out_amount >= 0),
  in_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (in_amount >= 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT petty_cash_entries_amount_direction_check CHECK (
    (entry_kind = 'expense' AND out_amount > 0 AND in_amount = 0)
    OR (entry_kind IN ('advance', 'cash_in') AND in_amount > 0 AND out_amount = 0)
  ),
  CONSTRAINT petty_cash_entries_expense_property_check CHECK (
    entry_kind <> 'expense' OR property_id IS NOT NULL
  ),
  CONSTRAINT petty_cash_entries_ledger_once_unique
    UNIQUE (ledger_entry_id)
);

DROP TRIGGER IF EXISTS set_petty_cash_accounts_updated_at
ON public.petty_cash_accounts;

CREATE TRIGGER set_petty_cash_accounts_updated_at
BEFORE UPDATE ON public.petty_cash_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_petty_cash_periods_updated_at
ON public.petty_cash_periods;

CREATE TRIGGER set_petty_cash_periods_updated_at
BEFORE UPDATE ON public.petty_cash_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_petty_cash_entries_updated_at
ON public.petty_cash_entries;

CREATE TRIGGER set_petty_cash_entries_updated_at
BEFORE UPDATE ON public.petty_cash_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.petty_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage petty cash accounts"
ON public.petty_cash_accounts;

CREATE POLICY "Admins can manage petty cash accounts"
ON public.petty_cash_accounts
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage petty cash periods"
ON public.petty_cash_periods;

CREATE POLICY "Admins can manage petty cash periods"
ON public.petty_cash_periods
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage petty cash entries"
ON public.petty_cash_entries;

CREATE POLICY "Admins can manage petty cash entries"
ON public.petty_cash_entries
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE INDEX IF NOT EXISTS petty_cash_accounts_org_status_idx
  ON public.petty_cash_accounts (organization_id, status)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS petty_cash_periods_account_period_idx
  ON public.petty_cash_periods (account_id, period_start DESC);

CREATE INDEX IF NOT EXISTS petty_cash_entries_period_date_idx
  ON public.petty_cash_entries (period_id, invoice_date DESC, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS petty_cash_entries_org_ledger_idx
  ON public.petty_cash_entries (organization_id, ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON
  public.petty_cash_accounts,
  public.petty_cash_periods,
  public.petty_cash_entries
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_petty_cash_account(
  p_organization_id uuid,
  p_account_number text,
  p_name text,
  p_float_amount numeric,
  p_custodian_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_account_id uuid;
  normalized_account_number text := upper(trim(p_account_number));
  normalized_name text := NULLIF(trim(coalesce(p_name, '')), '');
  normalized_float_amount numeric := coalesce(p_float_amount, 0);
  current_period_start date := date_trunc('month', current_date)::date;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
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
      FROM public.people
      WHERE id = p_custodian_person_id
        AND organization_id = p_organization_id
        AND archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Custodian not found' USING ERRCODE = '23503';
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
    (SELECT auth.uid()),
    (SELECT auth.uid())
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
    0,
    normalized_float_amount,
    (SELECT auth.uid()),
    (SELECT auth.uid())
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
    (SELECT auth.uid()),
    'petty_cash_account',
    new_account_id,
    'created',
    jsonb_build_object(
      'account_number', normalized_account_number,
      'name', normalized_name,
      'float_amount', normalized_float_amount
    )
  );

  RETURN new_account_id;
END;
$$;

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
  p_remark text DEFAULT NULL
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
      'unit_id', p_unit_id
    )
  );

  RETURN new_entry_id;
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

REVOKE ALL ON FUNCTION public.create_petty_cash_account(
  uuid,
  text,
  text,
  numeric,
  uuid
) FROM PUBLIC;

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
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.post_petty_cash_entry(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_petty_cash_account(
  uuid,
  text,
  text,
  numeric,
  uuid
) TO authenticated;

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
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.post_petty_cash_entry(uuid, uuid)
TO authenticated;

INSERT INTO public.petty_cash_accounts (
  organization_id,
  account_number,
  name,
  float_amount,
  status
)
SELECT
  id,
  'PM-CASH',
  'Petty Cash PM',
  290,
  'active'
FROM public.organizations
ON CONFLICT (organization_id, account_number) DO NOTHING;

INSERT INTO public.petty_cash_periods (
  organization_id,
  account_id,
  period_start,
  opening_balance_amount,
  advance_amount
)
SELECT
  account.organization_id,
  account.id,
  date_trunc('month', current_date)::date,
  0,
  account.float_amount
FROM public.petty_cash_accounts account
WHERE account.archived_at IS NULL
ON CONFLICT (account_id, period_start) DO NOTHING;
