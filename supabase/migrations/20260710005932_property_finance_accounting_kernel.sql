CREATE TABLE public.accounting_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  book_type text NOT NULL
    CHECK (book_type IN ('client', 'management_company')),
  name text NOT NULL,
  currency public.currency_code NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT accounting_books_name_length_check
    CHECK (length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX accounting_books_active_default_unique_idx
  ON public.accounting_books (organization_id, book_type, currency)
  WHERE is_default AND archived_at IS NULL;

CREATE INDEX accounting_books_organization_idx
  ON public.accounting_books (organization_id, book_type, currency)
  WHERE archived_at IS NULL;

CREATE INDEX accounting_books_created_by_idx
  ON public.accounting_books (created_by);

CREATE INDEX accounting_books_updated_by_idx
  ON public.accounting_books (updated_by);

CREATE INDEX accounting_books_archived_by_idx
  ON public.accounting_books (archived_by);

CREATE TABLE public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  book_id uuid NOT NULL
    REFERENCES public.accounting_books(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_balance text NOT NULL
    CHECK (normal_balance IN ('debit', 'credit')),
  system_code text NOT NULL,
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT accounting_accounts_code_length_check
    CHECK (length(trim(code)) BETWEEN 1 AND 32),
  CONSTRAINT accounting_accounts_name_length_check
    CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT accounting_accounts_system_code_length_check
    CHECK (length(trim(system_code)) BETWEEN 1 AND 80),
  CONSTRAINT accounting_accounts_book_code_unique UNIQUE (book_id, code),
  CONSTRAINT accounting_accounts_book_system_code_unique
    UNIQUE (book_id, system_code)
);

CREATE INDEX accounting_accounts_organization_idx
  ON public.accounting_accounts (organization_id, book_id, account_type)
  WHERE archived_at IS NULL AND is_active;

CREATE INDEX accounting_accounts_book_id_idx
  ON public.accounting_accounts (book_id);

CREATE INDEX accounting_accounts_created_by_idx
  ON public.accounting_accounts (created_by);

CREATE INDEX accounting_accounts_updated_by_idx
  ON public.accounting_accounts (updated_by);

CREATE INDEX accounting_accounts_archived_by_idx
  ON public.accounting_accounts (archived_by);

CREATE TABLE public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  book_id uuid NOT NULL
    REFERENCES public.accounting_books(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locked')),
  locked_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lock_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT accounting_periods_month_start_check
    CHECK (period_start = date_trunc('month', period_start)::date),
  CONSTRAINT accounting_periods_lock_state_check
    CHECK (
      (status = 'open' AND locked_at IS NULL AND locked_by IS NULL)
      OR (status = 'locked' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    ),
  CONSTRAINT accounting_periods_reason_length_check
    CHECK (lock_reason IS NULL OR length(lock_reason) <= 400),
  CONSTRAINT accounting_periods_book_month_unique UNIQUE (book_id, period_start)
);

CREATE INDEX accounting_periods_organization_idx
  ON public.accounting_periods (organization_id, period_start DESC);

CREATE INDEX accounting_periods_book_id_idx
  ON public.accounting_periods (book_id);

CREATE INDEX accounting_periods_locked_by_idx
  ON public.accounting_periods (locked_by);

CREATE INDEX accounting_periods_created_by_idx
  ON public.accounting_periods (created_by);

CREATE INDEX accounting_periods_updated_by_idx
  ON public.accounting_periods (updated_by);

CREATE TABLE public.accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  book_id uuid NOT NULL
    REFERENCES public.accounting_books(id) ON DELETE RESTRICT,
  entry_date date NOT NULL,
  currency public.currency_code NOT NULL,
  description text NOT NULL,
  reference text,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  reversal_of_id uuid
    REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  reversed_by_id uuid
    REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  legacy_ledger_entry_id uuid
    REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_journal_description_length_check
    CHECK (length(trim(description)) BETWEEN 1 AND 500),
  CONSTRAINT accounting_journal_source_type_length_check
    CHECK (length(trim(source_type)) BETWEEN 1 AND 80),
  CONSTRAINT accounting_journal_posting_key_length_check
    CHECK (length(trim(posting_key)) BETWEEN 1 AND 120),
  CONSTRAINT accounting_journal_payload_hash_length_check
    CHECK (length(payload_hash) = 64),
  CONSTRAINT accounting_journal_reversal_check
    CHECK (reversal_of_id IS NULL OR reversal_of_id <> id),
  CONSTRAINT accounting_journal_source_posting_unique
    UNIQUE (organization_id, book_id, source_type, source_id, posting_key)
);

CREATE INDEX accounting_journal_entries_organization_date_idx
  ON public.accounting_journal_entries (organization_id, entry_date DESC, id DESC);

CREATE INDEX accounting_journal_entries_book_id_idx
  ON public.accounting_journal_entries (book_id, entry_date DESC);

CREATE INDEX accounting_journal_entries_reversal_of_id_idx
  ON public.accounting_journal_entries (reversal_of_id);

CREATE INDEX accounting_journal_entries_reversed_by_id_idx
  ON public.accounting_journal_entries (reversed_by_id);

CREATE INDEX accounting_journal_entries_legacy_ledger_entry_id_idx
  ON public.accounting_journal_entries (legacy_ledger_entry_id);

CREATE INDEX accounting_journal_entries_posted_by_idx
  ON public.accounting_journal_entries (posted_by);

CREATE TABLE public.accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL
    REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL
    REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text,
  debit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  credit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  lease_id uuid REFERENCES public.leases(id) ON DELETE RESTRICT,
  owner_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  tenant_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  vendor_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_journal_lines_single_side_check
    CHECK (
      (debit_amount > 0 AND credit_amount = 0)
      OR (credit_amount > 0 AND debit_amount = 0)
    ),
  CONSTRAINT accounting_journal_lines_entry_number_unique
    UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX accounting_journal_lines_organization_idx
  ON public.accounting_journal_lines (organization_id, journal_entry_id);

CREATE INDEX accounting_journal_lines_journal_entry_id_idx
  ON public.accounting_journal_lines (journal_entry_id);

CREATE INDEX accounting_journal_lines_account_id_idx
  ON public.accounting_journal_lines (account_id);

CREATE INDEX accounting_journal_lines_property_id_idx
  ON public.accounting_journal_lines (property_id);

CREATE INDEX accounting_journal_lines_unit_id_idx
  ON public.accounting_journal_lines (unit_id);

CREATE INDEX accounting_journal_lines_lease_id_idx
  ON public.accounting_journal_lines (lease_id);

CREATE INDEX accounting_journal_lines_owner_person_id_idx
  ON public.accounting_journal_lines (owner_person_id);

CREATE INDEX accounting_journal_lines_tenant_person_id_idx
  ON public.accounting_journal_lines (tenant_person_id);

CREATE INDEX accounting_journal_lines_vendor_person_id_idx
  ON public.accounting_journal_lines (vendor_person_id);

ALTER TABLE public.ledger_entries
  ADD COLUMN accounting_journal_entry_id uuid
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

CREATE INDEX ledger_entries_accounting_journal_entry_id_idx
  ON public.ledger_entries (accounting_journal_entry_id);

CREATE TRIGGER set_accounting_books_updated_at
BEFORE UPDATE ON public.accounting_books
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_accounting_accounts_updated_at
BEFORE UPDATE ON public.accounting_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_accounting_periods_updated_at
BEFORE UPDATE ON public.accounting_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_accounting_journal_entries_updated_at
BEFORE UPDATE ON public.accounting_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.accounting_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read accounting books"
ON public.accounting_books
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

CREATE POLICY "Admins can read accounting accounts"
ON public.accounting_accounts
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

CREATE POLICY "Admins can read accounting periods"
ON public.accounting_periods
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

CREATE POLICY "Admins can read accounting journals"
ON public.accounting_journal_entries
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

CREATE POLICY "Admins can read accounting journal lines"
ON public.accounting_journal_lines
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

REVOKE ALL ON TABLE
  public.accounting_books,
  public.accounting_accounts,
  public.accounting_periods,
  public.accounting_journal_entries,
  public.accounting_journal_lines
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.accounting_books,
  public.accounting_accounts,
  public.accounting_periods,
  public.accounting_journal_entries,
  public.accounting_journal_lines
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.ensure_accounting_books_and_accounts(
  target_organization_id uuid,
  target_currency public.currency_code
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  client_book_id uuid;
  company_book_id uuid;
BEGIN
  IF target_currency IS NULL THEN
    RAISE EXCEPTION 'Accounting book currency is required'
      USING ERRCODE = '22023';
  END IF;

  IF actor_id IS NOT NULL
    AND NOT app_private.is_org_admin(target_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.accounting_books (
    organization_id,
    book_type,
    name,
    currency,
    is_default,
    created_by,
    updated_by
  )
  VALUES (
    target_organization_id,
    'client',
    concat(target_currency::text, ' client books'),
    target_currency,
    true,
    actor_id,
    actor_id
  )
  ON CONFLICT (organization_id, book_type, currency)
    WHERE is_default AND archived_at IS NULL
  DO NOTHING;

  INSERT INTO public.accounting_books (
    organization_id,
    book_type,
    name,
    currency,
    is_default,
    created_by,
    updated_by
  )
  VALUES (
    target_organization_id,
    'management_company',
    concat(target_currency::text, ' management company books'),
    target_currency,
    true,
    actor_id,
    actor_id
  )
  ON CONFLICT (organization_id, book_type, currency)
    WHERE is_default AND archived_at IS NULL
  DO NOTHING;

  SELECT id
  INTO STRICT client_book_id
  FROM public.accounting_books
  WHERE organization_id = target_organization_id
    AND book_type = 'client'
    AND currency = target_currency
    AND is_default
    AND archived_at IS NULL;

  SELECT id
  INTO STRICT company_book_id
  FROM public.accounting_books
  WHERE organization_id = target_organization_id
    AND book_type = 'management_company'
    AND currency = target_currency
    AND is_default
    AND archived_at IS NULL;

  INSERT INTO public.accounting_accounts (
    organization_id,
    book_id,
    code,
    name,
    account_type,
    normal_balance,
    system_code,
    is_control_account,
    created_by,
    updated_by
  )
  SELECT
    target_organization_id,
    client_book_id,
    account.code,
    account.name,
    account.account_type,
    account.normal_balance,
    account.system_code,
    account.is_control_account,
    actor_id,
    actor_id
  FROM (
    VALUES
      ('1000', 'Client cash clearing', 'asset', 'debit', 'client_cash_clearing', true),
      ('1010', 'Security deposit cash clearing', 'asset', 'debit', 'security_deposit_cash_clearing', true),
      ('1100', 'Tenant receivable', 'asset', 'debit', 'tenant_receivable', true),
      ('2000', 'Accounts payable', 'liability', 'credit', 'accounts_payable', true),
      ('2100', 'Refundable security deposits', 'liability', 'credit', 'refundable_security_deposits', true),
      ('2200', 'Owner funds held', 'liability', 'credit', 'owner_funds_held', true),
      ('2300', 'Due to management company', 'liability', 'credit', 'due_to_management_company', true),
      ('3999', 'Legacy balance offset', 'equity', 'credit', 'legacy_balance_offset', true),
      ('4000', 'Rental income', 'income', 'credit', 'rental_income', false),
      ('4090', 'Other property income', 'income', 'credit', 'other_property_income', false),
      ('5000', 'Property operating expense', 'expense', 'debit', 'property_operating_expense', false),
      ('5100', 'Management fee expense', 'expense', 'debit', 'management_fee_expense', false)
  ) AS account(
    code,
    name,
    account_type,
    normal_balance,
    system_code,
    is_control_account
  )
  ON CONFLICT (book_id, system_code) DO NOTHING;

  INSERT INTO public.accounting_accounts (
    organization_id,
    book_id,
    code,
    name,
    account_type,
    normal_balance,
    system_code,
    is_control_account,
    created_by,
    updated_by
  )
  SELECT
    target_organization_id,
    company_book_id,
    account.code,
    account.name,
    account.account_type,
    account.normal_balance,
    account.system_code,
    account.is_control_account,
    actor_id,
    actor_id
  FROM (
    VALUES
      ('1000', 'Company cash clearing', 'asset', 'debit', 'company_cash_clearing', true),
      ('1100', 'Due from client books', 'asset', 'debit', 'due_from_client_books', true),
      ('1200', 'Owner reimbursement receivable', 'asset', 'debit', 'owner_reimbursement_receivable', true),
      ('3999', 'Legacy balance offset', 'equity', 'credit', 'legacy_balance_offset', true),
      ('4000', 'Management fee revenue', 'income', 'credit', 'management_fee_revenue', false),
      ('4010', 'Leasing commission revenue', 'income', 'credit', 'leasing_commission_revenue', false),
      ('4020', 'Service fee revenue', 'income', 'credit', 'service_fee_revenue', false),
      ('4030', 'Maintenance markup revenue', 'income', 'credit', 'maintenance_markup_revenue', false),
      ('5000', 'Company operating expense', 'expense', 'debit', 'company_operating_expense', false),
      ('5100', 'Company advance expense', 'expense', 'debit', 'company_advance_expense', false)
  ) AS account(
    code,
    name,
    account_type,
    normal_balance,
    system_code,
    is_control_account
  )
  ON CONFLICT (book_id, system_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION app_private.ensure_accounting_books_and_accounts(
  uuid,
  public.currency_code
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.ensure_accounting_books_and_accounts(
  uuid,
  public.currency_code
) TO service_role;
