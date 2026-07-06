CREATE TABLE IF NOT EXISTS public.finance_income_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  ledger_entry_id uuid UNIQUE REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  income_type text NOT NULL DEFAULT 'rent'
    CHECK (income_type IN (
      'rent',
      'security_deposit',
      'utility_reimbursement',
      'parking',
      'late_fee',
      'owner_contribution',
      'other'
    )),
  payer_label text NOT NULL,
  due_date date NOT NULL,
  received_date date,
  amount_due numeric(14, 2) NOT NULL CHECK (amount_due >= 0),
  amount_received numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_received', 'received', 'posted', 'void')),
  description text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT finance_income_items_amount_due_positive_check
    CHECK (amount_due > 0 OR amount_received > 0),
  CONSTRAINT finance_income_items_received_status_check
    CHECK (
      status IN ('open', 'void')
      OR amount_received > 0
    )
);

CREATE TABLE IF NOT EXISTS public.finance_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  vendor_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ledger_entry_id uuid UNIQUE REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  expense_type text NOT NULL DEFAULT 'vendor_bill'
    CHECK (expense_type IN (
      'vendor_bill',
      'maintenance',
      'utilities',
      'supplies',
      'owner_payout',
      'refund',
      'other'
    )),
  vendor_label text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  paid_date date,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'posted', 'paid', 'void')),
  description text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_finance_income_items_updated_at
ON public.finance_income_items;

CREATE TRIGGER set_finance_income_items_updated_at
BEFORE UPDATE ON public.finance_income_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_finance_expense_items_updated_at
ON public.finance_expense_items;

CREATE TRIGGER set_finance_expense_items_updated_at
BEFORE UPDATE ON public.finance_expense_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_income_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage finance income items"
ON public.finance_income_items;

CREATE POLICY "Admins can manage finance income items"
ON public.finance_income_items
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can manage finance expense items"
ON public.finance_expense_items;

CREATE POLICY "Admins can manage finance expense items"
ON public.finance_expense_items
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE INDEX IF NOT EXISTS finance_income_items_org_due_idx
  ON public.finance_income_items (organization_id, due_date DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_income_items_org_status_idx
  ON public.finance_income_items (organization_id, status, due_date DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_income_items_org_property_idx
  ON public.finance_income_items (organization_id, property_id, due_date DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_expense_items_org_invoice_idx
  ON public.finance_expense_items (organization_id, invoice_date DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_expense_items_org_status_idx
  ON public.finance_expense_items (organization_id, status, invoice_date DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_expense_items_org_property_idx
  ON public.finance_expense_items (organization_id, property_id, invoice_date DESC)
  WHERE archived_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON
  public.finance_income_items,
  public.finance_expense_items
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_finance_income_item(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_income_type text,
  p_payer_label text,
  p_due_date date,
  p_amount_due numeric,
  p_amount_received numeric,
  p_received_date date,
  p_description text,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_income_id uuid;
  normalized_income_type text := lower(trim(coalesce(p_income_type, 'rent')));
  normalized_payer_label text := NULLIF(trim(coalesce(p_payer_label, '')), '');
  normalized_amount_due numeric := coalesce(p_amount_due, 0);
  normalized_amount_received numeric := coalesce(p_amount_received, 0);
  next_status text := 'open';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_payer_label IS NULL THEN
    RAISE EXCEPTION 'Payer is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_due <= 0 AND normalized_amount_received <= 0 THEN
    RAISE EXCEPTION 'Income amount is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received > 0 THEN
    next_status := CASE
      WHEN normalized_amount_received >= normalized_amount_due THEN 'received'
      ELSE 'partially_received'
    END;
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
    description,
    reference,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    normalized_income_type,
    normalized_payer_label,
    p_due_date,
    normalized_amount_due,
    normalized_amount_received,
    p_received_date,
    next_status,
    NULLIF(trim(coalesce(p_description, '')), ''),
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_income_id;

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
    new_income_id,
    'created',
    (SELECT auth.uid()),
    jsonb_build_object(
      'income_type', normalized_income_type,
      'payer_label', normalized_payer_label,
      'amount_due', normalized_amount_due,
      'amount_received', normalized_amount_received,
      'status', next_status
    )
  );

  RETURN new_income_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_finance_income_payment(
  p_income_item_id uuid,
  p_organization_id uuid,
  p_amount_received numeric,
  p_received_date date,
  p_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  target_income public.finance_income_items%ROWTYPE;
  normalized_amount_received numeric := coalesce(p_amount_received, 0);
  next_status text;
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

  IF target_income.status IN ('posted', 'void') THEN
    RAISE EXCEPTION 'Income item cannot be changed in this status' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received <= 0 THEN
    RAISE EXCEPTION 'Received amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  next_status := CASE
    WHEN normalized_amount_received >= target_income.amount_due THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.finance_income_items
  SET amount_received = normalized_amount_received,
      received_date = p_received_date,
      reference = NULLIF(trim(coalesce(p_reference, reference, '')), ''),
      status = next_status,
      updated_by = (SELECT auth.uid())
  WHERE id = target_income.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    target_income.id,
    'payment_recorded',
    (SELECT auth.uid()),
    jsonb_build_object(
      'amount_received', target_income.amount_received,
      'status', target_income.status
    ),
    jsonb_build_object(
      'amount_received', normalized_amount_received,
      'status', next_status
    )
  );
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
    'posted',
    (SELECT auth.uid()),
    jsonb_build_object('ledger_entry_id', new_ledger_entry_id)
  );

  RETURN new_ledger_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_finance_income_item(
  p_income_item_id uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  target_income public.finance_income_items%ROWTYPE;
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

  IF target_income.status = 'posted' THEN
    RAISE EXCEPTION 'Posted income stays in the ledger; archive the ledger entry if needed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_income_items
  SET status = 'void',
      archived_at = now(),
      archived_by = (SELECT auth.uid()),
      updated_by = (SELECT auth.uid())
  WHERE id = target_income.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    target_income.id,
    'voided',
    (SELECT auth.uid()),
    jsonb_build_object('status', target_income.status),
    jsonb_build_object('status', 'void')
  );
END;
$$;

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
  p_reference text
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
      'status', 'draft'
    )
  );

  RETURN new_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_finance_expense_status(
  p_expense_item_id uuid,
  p_organization_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  target_expense public.finance_expense_items%ROWTYPE;
  normalized_status text := lower(trim(p_status));
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

  IF normalized_status NOT IN ('approved', 'paid', 'void') THEN
    RAISE EXCEPTION 'Unsupported expense status' USING ERRCODE = '22023';
  END IF;

  IF target_expense.status = 'posted' AND normalized_status = 'approved' THEN
    RAISE EXCEPTION 'Posted expenses cannot move back to approved' USING ERRCODE = '22023';
  END IF;

  IF normalized_status = 'paid' AND target_expense.ledger_entry_id IS NULL THEN
    RAISE EXCEPTION 'Post the expense before marking it paid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_expense_items
  SET status = normalized_status,
      paid_date = CASE WHEN normalized_status = 'paid' THEN current_date ELSE paid_date END,
      archived_at = CASE WHEN normalized_status = 'void' THEN now() ELSE archived_at END,
      archived_by = CASE WHEN normalized_status = 'void' THEN (SELECT auth.uid()) ELSE archived_by END,
      updated_by = (SELECT auth.uid())
  WHERE id = target_expense.id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_expense_item',
    target_expense.id,
    normalized_status,
    (SELECT auth.uid()),
    jsonb_build_object('status', target_expense.status),
    jsonb_build_object('status', normalized_status)
  );
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
    'posted',
    (SELECT auth.uid()),
    jsonb_build_object('ledger_entry_id', new_ledger_entry_id)
  );

  RETURN new_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_finance_income_item(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_finance_income_item(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_finance_expense_item(
  uuid, uuid, uuid, uuid, uuid, text, text, date, date, numeric, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_finance_expense_status(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_finance_expense_item(uuid, uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_finance_income_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_finance_income_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_expense_item(
  uuid, uuid, uuid, uuid, uuid, text, text, date, date, numeric, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_finance_expense_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_finance_expense_item(uuid, uuid, date) TO authenticated;
