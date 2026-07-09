ALTER TABLE public.finance_income_items
  DROP CONSTRAINT IF EXISTS finance_income_items_income_type_check;

ALTER TABLE public.finance_income_items
  ADD CONSTRAINT finance_income_items_income_type_check
  CHECK (income_type IN (
    'rent',
    'security_deposit',
    'utility_reimbursement',
    'parking',
    'late_fee',
    'owner_contribution',
    'management_fee',
    'leasing_commission',
    'service_fee',
    'maintenance_markup',
    'other'
  ));

ALTER TABLE public.finance_expense_items
  DROP CONSTRAINT IF EXISTS finance_expense_items_expense_type_check;

ALTER TABLE public.finance_expense_items
  ADD CONSTRAINT finance_expense_items_expense_type_check
  CHECK (expense_type IN (
    'vendor_bill',
    'maintenance',
    'utilities',
    'supplies',
    'owner_payout',
    'refund',
    'other'
  ));

ALTER TABLE public.finance_expense_items
  ADD COLUMN IF NOT EXISTS economic_scope text NOT NULL DEFAULT 'property_expense',
  ADD COLUMN IF NOT EXISTS owner_bill_status text NOT NULL DEFAULT 'not_billable',
  ADD COLUMN IF NOT EXISTS owner_reimbursable_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_reimbursed_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_loss_amount numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.finance_expense_items
  DROP CONSTRAINT IF EXISTS finance_expense_items_economic_scope_check,
  DROP CONSTRAINT IF EXISTS finance_expense_items_owner_bill_status_check,
  DROP CONSTRAINT IF EXISTS finance_expense_items_company_amounts_check,
  DROP CONSTRAINT IF EXISTS finance_expense_items_company_handling_check;

ALTER TABLE public.finance_expense_items
  ADD CONSTRAINT finance_expense_items_economic_scope_check
    CHECK (economic_scope IN ('property_expense', 'company_advance', 'company_cost')),
  ADD CONSTRAINT finance_expense_items_owner_bill_status_check
    CHECK (owner_bill_status IN (
      'not_billable',
      'billable',
      'billed',
      'partially_reimbursed',
      'reimbursed',
      'written_off'
    )),
  ADD CONSTRAINT finance_expense_items_company_amounts_check
    CHECK (
      owner_reimbursable_amount >= 0
      AND owner_reimbursed_amount >= 0
      AND owner_reimbursed_amount <= owner_reimbursable_amount
      AND company_loss_amount >= 0
      AND company_loss_amount <= amount
    ),
  ADD CONSTRAINT finance_expense_items_company_handling_check
    CHECK (
      (
        economic_scope = 'company_advance'
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

CREATE INDEX IF NOT EXISTS finance_expense_items_org_company_scope_idx
  ON public.finance_expense_items (
    organization_id,
    economic_scope,
    owner_bill_status,
    invoice_date DESC
  )
  WHERE archived_at IS NULL;

DROP FUNCTION IF EXISTS public.create_finance_expense_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.create_finance_expense_item(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_task_id uuid,
  p_vendor_person_id uuid,
  p_expense_type text,
  p_vendor_label text,
  p_invoice_date date,
  p_due_date date,
  p_amount numeric,
  p_category text,
  p_description text,
  p_reference text,
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
  new_expense_id uuid;
  normalized_expense_type text := lower(trim(coalesce(p_expense_type, 'vendor_bill')));
  normalized_vendor_label text := NULLIF(trim(coalesce(p_vendor_label, '')), '');
  normalized_category text := NULLIF(trim(coalesce(p_category, '')), '');
  normalized_economic_scope text := lower(trim(coalesce(p_economic_scope, 'property_expense')));
  normalized_owner_bill_status text := lower(trim(coalesce(p_owner_bill_status, 'not_billable')));
  normalized_owner_reimbursable_amount numeric := coalesce(p_owner_reimbursable_amount, 0);
  normalized_owner_reimbursed_amount numeric := coalesce(p_owner_reimbursed_amount, 0);
  normalized_company_loss_amount numeric := coalesce(p_company_loss_amount, 0);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_vendor_label IS NULL THEN
    RAISE EXCEPTION 'Vendor is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_category IS NULL THEN
    RAISE EXCEPTION 'Category is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero' USING ERRCODE = '22023';
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

  IF normalized_economic_scope = 'company_advance' THEN
    IF normalized_owner_bill_status = 'not_billable' THEN
      normalized_owner_bill_status := 'billable';
    END IF;

    IF normalized_owner_reimbursable_amount <= 0 THEN
      normalized_owner_reimbursable_amount := p_amount;
    END IF;
  ELSE
    normalized_owner_bill_status := 'not_billable';
    normalized_owner_reimbursable_amount := 0;
    normalized_owner_reimbursed_amount := 0;
  END IF;

  IF normalized_economic_scope = 'company_cost' AND normalized_company_loss_amount <= 0 THEN
    normalized_company_loss_amount := p_amount;
  END IF;

  IF normalized_owner_reimbursed_amount > normalized_owner_reimbursable_amount THEN
    RAISE EXCEPTION 'Owner reimbursed amount cannot exceed billable amount' USING ERRCODE = '22023';
  END IF;

  IF normalized_company_loss_amount > p_amount THEN
    RAISE EXCEPTION 'Company loss cannot exceed expense amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_expense_items (
    organization_id,
    property_id,
    unit_id,
    task_id,
    vendor_person_id,
    expense_type,
    vendor_label,
    invoice_date,
    due_date,
    amount,
    category,
    economic_scope,
    owner_bill_status,
    owner_reimbursable_amount,
    owner_reimbursed_amount,
    company_loss_amount,
    description,
    reference,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_task_id,
    p_vendor_person_id,
    normalized_expense_type,
    normalized_vendor_label,
    p_invoice_date,
    p_due_date,
    p_amount,
    normalized_category,
    normalized_economic_scope,
    normalized_owner_bill_status,
    normalized_owner_reimbursable_amount,
    normalized_owner_reimbursed_amount,
    normalized_company_loss_amount,
    NULLIF(trim(coalesce(p_description, '')), ''),
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_expense_id;

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
    new_expense_id,
    'created',
    (SELECT auth.uid()),
    jsonb_build_object(
      'expense_type', normalized_expense_type,
      'vendor_label', normalized_vendor_label,
      'amount', p_amount,
      'status', 'draft',
      'economic_scope', normalized_economic_scope,
      'owner_bill_status', normalized_owner_bill_status,
      'owner_reimbursable_amount', normalized_owner_reimbursable_amount,
      'owner_reimbursed_amount', normalized_owner_reimbursed_amount,
      'company_loss_amount', normalized_company_loss_amount
    )
  );

  RETURN new_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_expense_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_finance_expense_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) TO authenticated;
