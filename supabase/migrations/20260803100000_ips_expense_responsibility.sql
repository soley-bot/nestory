-- IPS Finance operational rework: simple Owner/Tenant responsibility for
-- IPS-paid costs, private markup, and property-specific owner charges.

CREATE SEQUENCE public.owner_invoice_number_seq;

CREATE TABLE public.owner_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  invoice_number text NOT NULL,
  billing_period_start date NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  lifecycle text NOT NULL DEFAULT 'issued',
  idempotency_key text,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_invoices_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_invoices_number_unique UNIQUE (organization_id, invoice_number),
  CONSTRAINT owner_invoices_property_period_unique
    UNIQUE (organization_id, property_id, billing_period_start),
  CONSTRAINT owner_invoices_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT owner_invoices_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_invoices_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_invoices_period_check
    CHECK (billing_period_start = date_trunc('month', billing_period_start)::date),
  CONSTRAINT owner_invoices_date_check CHECK (due_date >= issue_date),
  CONSTRAINT owner_invoices_lifecycle_check CHECK (lifecycle IN ('issued', 'void')),
  CONSTRAINT owner_invoices_void_evidence_check
    CHECK (
      (lifecycle = 'issued' AND voided_at IS NULL AND voided_by IS NULL)
      OR (lifecycle = 'void' AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
    ),
  CONSTRAINT owner_invoices_idempotency_check
    CHECK (idempotency_key IS NULL OR length(trim(idempotency_key)) >= 8)
);

CREATE TABLE public.owner_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  property_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  customer_label text NOT NULL,
  description text,
  amount numeric(14, 2) NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_invoice_lines_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_invoice_lines_source_unique
    UNIQUE (organization_id, source_type, source_id),
  CONSTRAINT owner_invoice_lines_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.owner_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_invoice_lines_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_invoice_lines_source_check
    CHECK (source_type IN ('management_fee', 'owner_expense')),
  CONSTRAINT owner_invoice_lines_label_check CHECK (length(trim(customer_label)) > 0),
  CONSTRAINT owner_invoice_lines_amount_check CHECK (amount > 0),
  CONSTRAINT owner_invoice_lines_sort_check CHECK (sort_order > 0)
);

CREATE TABLE public.owner_charge_cash_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  owner_invoice_line_id uuid NOT NULL,
  allocation_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_charge_cash_allocations_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_charge_cash_allocations_line_fkey
    FOREIGN KEY (organization_id, owner_invoice_line_id)
    REFERENCES public.owner_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_charge_cash_allocations_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_charge_cash_allocations_amount_check CHECK (amount > 0)
);

CREATE TABLE public.ips_expense_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  finance_expense_item_id uuid NOT NULL,
  responsibility text NOT NULL,
  responsible_person_id uuid NOT NULL,
  customer_category text NOT NULL,
  customer_label text NOT NULL,
  internal_cost_amount numeric(14, 2) NOT NULL,
  internal_markup_amount numeric(14, 2) NOT NULL DEFAULT 0,
  customer_total_amount numeric(14, 2) NOT NULL,
  held_cash_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ips_advance_amount numeric(14, 2) NOT NULL DEFAULT 0,
  tenant_invoice_line_id uuid,
  owner_invoice_line_id uuid,
  supporting_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ips_expense_responsibilities_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT ips_expense_responsibilities_expense_unique
    UNIQUE (organization_id, finance_expense_item_id),
  CONSTRAINT ips_expense_responsibilities_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT ips_expense_responsibilities_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_expense_responsibilities_expense_fkey
    FOREIGN KEY (organization_id, finance_expense_item_id)
    REFERENCES public.finance_expense_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_expense_responsibilities_person_fkey
    FOREIGN KEY (organization_id, responsible_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_expense_responsibilities_tenant_line_fkey
    FOREIGN KEY (organization_id, tenant_invoice_line_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_expense_responsibilities_owner_line_fkey
    FOREIGN KEY (organization_id, owner_invoice_line_id)
    REFERENCES public.owner_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ips_expense_responsibilities_responsibility_check
    CHECK (responsibility IN ('owner', 'tenant')),
  CONSTRAINT ips_expense_responsibilities_category_check
    CHECK (customer_category IN ('cleaning', 'utility', 'repairs_maintenance', 'other')),
  CONSTRAINT ips_expense_responsibilities_label_check CHECK (length(trim(customer_label)) > 0),
  CONSTRAINT ips_expense_responsibilities_amounts_check
    CHECK (
      internal_cost_amount > 0
      AND internal_markup_amount >= 0
      AND customer_total_amount = internal_cost_amount + internal_markup_amount
      AND held_cash_amount >= 0
      AND ips_advance_amount >= 0
      AND held_cash_amount + ips_advance_amount <= customer_total_amount
    ),
  CONSTRAINT ips_expense_responsibilities_destination_check
    CHECK (
      (
        responsibility = 'owner'
        AND tenant_invoice_line_id IS NULL
        AND owner_invoice_line_id IS NOT NULL
      )
      OR (
        responsibility = 'tenant'
        AND tenant_invoice_line_id IS NOT NULL
        AND owner_invoice_line_id IS NULL
        AND held_cash_amount = 0
      )
    ),
  CONSTRAINT ips_expense_responsibilities_idempotency_check
    CHECK (length(trim(idempotency_key)) >= 8)
);

CREATE INDEX owner_invoices_worklist_idx
  ON public.owner_invoices(organization_id, lifecycle, due_date, id);
CREATE INDEX owner_invoice_lines_invoice_idx
  ON public.owner_invoice_lines(organization_id, invoice_id, sort_order, id);
CREATE INDEX owner_charge_cash_allocations_property_idx
  ON public.owner_charge_cash_allocations(organization_id, property_id, allocation_date, id);
CREATE INDEX ips_expense_responsibilities_property_idx
  ON public.ips_expense_responsibilities(organization_id, property_id, created_at DESC);

CREATE TRIGGER set_ips_expense_responsibilities_updated_at
BEFORE UPDATE ON public.ips_expense_responsibilities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.owner_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_charge_cash_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ips_expense_responsibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read owner invoices"
ON public.owner_invoices FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY "Organization members can read owner invoice lines"
ON public.owner_invoice_lines FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY "Organization members can read owner cash allocations"
ON public.owner_charge_cash_allocations FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY "Organization members can read IPS expense responsibility"
ON public.ips_expense_responsibilities FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

REVOKE ALL ON SEQUENCE public.owner_invoice_number_seq
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE
  public.owner_invoices,
  public.owner_invoice_lines,
  public.owner_charge_cash_allocations,
  public.ips_expense_responsibilities
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.owner_invoices,
  public.owner_invoice_lines,
  public.owner_charge_cash_allocations,
  public.ips_expense_responsibilities
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.resolve_property_owner(
  p_organization_id uuid,
  p_property_id uuid,
  p_as_of_date date
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_person_id uuid;
  v_owner_count integer;
BEGIN
  SELECT count(*)
  INTO v_owner_count
  FROM public.property_owners AS owner_link
  WHERE owner_link.organization_id = p_organization_id
    AND owner_link.property_id = p_property_id
    AND owner_link.is_primary
    AND owner_link.archived_at IS NULL
    AND (owner_link.started_on IS NULL OR owner_link.started_on <= p_as_of_date)
    AND (owner_link.ended_on IS NULL OR owner_link.ended_on >= p_as_of_date);

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'Property must have exactly one active primary owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT owner_link.person_id
  INTO STRICT v_owner_person_id
  FROM public.property_owners AS owner_link
  WHERE owner_link.organization_id = p_organization_id
    AND owner_link.property_id = p_property_id
    AND owner_link.is_primary
    AND owner_link.archived_at IS NULL
    AND (owner_link.started_on IS NULL OR owner_link.started_on <= p_as_of_date)
    AND (owner_link.ended_on IS NULL OR owner_link.ended_on >= p_as_of_date);

  RETURN v_owner_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.get_or_create_owner_invoice(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_issue_date date,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id uuid;
  v_period_start date := date_trunc('month', p_issue_date)::date;
  v_invoice_number text;
BEGIN
  SELECT invoice.id
  INTO v_invoice_id
  FROM public.owner_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.property_id = p_property_id
    AND invoice.billing_period_start = v_period_start
    AND invoice.lifecycle = 'issued'
  FOR UPDATE;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.owner_invoices AS invoice
      WHERE invoice.id = v_invoice_id
        AND invoice.owner_person_id = p_owner_person_id
    ) THEN
      RAISE EXCEPTION 'Owner changed inside an open owner billing period'
        USING ERRCODE = '22023';
    END IF;

    RETURN v_invoice_id;
  END IF;

  v_invoice_number := pg_catalog.format(
    'OWN-%s-%s',
    to_char(v_period_start, 'YYYYMM'),
    lpad(nextval('public.owner_invoice_number_seq')::text, 6, '0')
  );

  INSERT INTO public.owner_invoices (
    organization_id,
    property_id,
    owner_person_id,
    invoice_number,
    billing_period_start,
    issue_date,
    due_date,
    created_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    v_invoice_number,
    v_period_start,
    p_issue_date,
    p_issue_date + 14,
    p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.create_owner_invoice_line(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_issue_date date,
  p_source_type text,
  p_source_id uuid,
  p_customer_label text,
  p_description text,
  p_amount numeric,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id uuid;
  v_line_id uuid;
  v_sort_order integer;
BEGIN
  SELECT line.id
  INTO v_line_id
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.source_type = p_source_type
    AND line.source_id = p_source_id;

  IF FOUND THEN
    RETURN v_line_id;
  END IF;

  v_invoice_id := app_private.get_or_create_owner_invoice(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_issue_date,
    p_actor_id
  );

  SELECT coalesce(max(line.sort_order), 0) + 1
  INTO v_sort_order
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = v_invoice_id;

  INSERT INTO public.owner_invoice_lines (
    organization_id,
    invoice_id,
    property_id,
    source_type,
    source_id,
    customer_label,
    description,
    amount,
    sort_order,
    created_by
  )
  VALUES (
    p_organization_id,
    v_invoice_id,
    p_property_id,
    p_source_type,
    p_source_id,
    trim(p_customer_label),
    NULLIF(trim(coalesce(p_description, '')), ''),
    p_amount,
    v_sort_order,
    p_actor_id
  )
  RETURNING id INTO v_line_id;

  RETURN v_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.property_held_cash_balance(
  p_organization_id uuid,
  p_property_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH rent_cash AS (
    SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2) AS amount
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
     AND line.id = allocation.invoice_line_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = allocation.organization_id
     AND invoice.id = allocation.invoice_id
    JOIN public.finance_receipts AS receipt
      ON receipt.organization_id = allocation.organization_id
     AND receipt.id = allocation.finance_receipt_id
    WHERE allocation.organization_id = p_organization_id
      AND invoice.property_id = p_property_id
      AND line.line_type = 'rent'
      AND receipt.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_receipts AS reversal
        WHERE reversal.organization_id = receipt.organization_id
          AND reversal.reversal_of_id = receipt.id
      )
  ), charge_cash AS (
    SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2) AS amount
    FROM public.owner_charge_cash_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.property_id = p_property_id
  )
  SELECT greatest(rent_cash.amount - charge_cash.amount, 0)::numeric(14, 2)
  FROM rent_cash CROSS JOIN charge_cash;
$$;

CREATE OR REPLACE FUNCTION app_private.apply_available_owner_cash(
  p_organization_id uuid,
  p_property_id uuid,
  p_allocation_date date,
  p_actor_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_available numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_apply_amount numeric(14, 2);
  v_total_applied numeric(14, 2) := 0;
  v_line record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_property_id::text || ':owner-cash',
      0
    )
  );

  v_available := app_private.property_held_cash_balance(
    p_organization_id,
    p_property_id
  );

  IF v_available <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_line IN
    SELECT
      line.id,
      line.source_type,
      line.source_id,
      line.amount,
      coalesce(sum(allocation.amount), 0)::numeric(14, 2) AS allocated
    FROM public.owner_invoice_lines AS line
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    LEFT JOIN public.owner_charge_cash_allocations AS allocation
      ON allocation.organization_id = line.organization_id
     AND allocation.owner_invoice_line_id = line.id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND invoice.lifecycle = 'issued'
    GROUP BY line.id, line.source_type, line.source_id, line.amount, invoice.issue_date
    HAVING line.amount > coalesce(sum(allocation.amount), 0)
    ORDER BY invoice.issue_date, line.sort_order, line.id
  LOOP
    EXIT WHEN v_available <= 0;
    v_outstanding := (v_line.amount - v_line.allocated)::numeric(14, 2);
    v_apply_amount := least(v_available, v_outstanding)::numeric(14, 2);

    INSERT INTO public.owner_charge_cash_allocations (
      organization_id,
      property_id,
      owner_invoice_line_id,
      allocation_date,
      amount,
      created_by
    )
    VALUES (
      p_organization_id,
      p_property_id,
      v_line.id,
      p_allocation_date,
      v_apply_amount,
      p_actor_id
    );

    v_available := (v_available - v_apply_amount)::numeric(14, 2);
    v_total_applied := (v_total_applied + v_apply_amount)::numeric(14, 2);

    IF v_line.source_type = 'management_fee' THEN
      UPDATE public.management_fee_occurrences AS fee
      SET settlement_status = CASE
        WHEN v_line.allocated + v_apply_amount >= v_line.amount THEN 'held_cash'
        WHEN v_line.allocated + v_apply_amount > 0 THEN 'split'
        ELSE 'owner_due'
      END
      WHERE fee.organization_id = p_organization_id
        AND fee.id = v_line.source_id;
    ELSIF v_line.source_type = 'owner_expense' THEN
      UPDATE public.ips_expense_responsibilities AS responsibility
      SET held_cash_amount = least(
            responsibility.customer_total_amount,
            v_line.allocated + v_apply_amount
          ),
          ips_advance_amount = greatest(
            responsibility.customer_total_amount - v_line.allocated - v_apply_amount,
            0
          ),
          updated_by = p_actor_id
      WHERE responsibility.organization_id = p_organization_id
        AND responsibility.id = v_line.source_id;
    END IF;
  END LOOP;

  RETURN v_total_applied;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.create_management_fee_owner_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_person_id uuid;
BEGIN
  v_owner_person_id := app_private.resolve_property_owner(
    NEW.organization_id,
    NEW.property_id,
    NEW.fee_date
  );

  PERFORM app_private.create_owner_invoice_line(
    NEW.organization_id,
    NEW.property_id,
    v_owner_person_id,
    NEW.fee_date,
    'management_fee',
    NEW.id,
    'Management fee',
    NULL,
    NEW.amount,
    NEW.created_by
  );

  NEW.settlement_status := 'owner_due';
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_management_fee_owner_charge
BEFORE INSERT ON public.management_fee_occurrences
FOR EACH ROW EXECUTE FUNCTION app_private.create_management_fee_owner_charge();

CREATE OR REPLACE FUNCTION app_private.apply_owner_cash_after_tenant_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
  v_received_date date;
BEGIN
  SELECT invoice.property_id, payment.received_date
  INTO v_property_id, v_received_date
  FROM public.tenant_invoices AS invoice
  JOIN public.tenant_invoice_payments AS payment
    ON payment.organization_id = invoice.organization_id
   AND payment.id = NEW.payment_id
  WHERE invoice.organization_id = NEW.organization_id
    AND invoice.id = NEW.invoice_id;

  PERFORM app_private.apply_available_owner_cash(
    NEW.organization_id,
    v_property_id,
    v_received_date,
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_owner_cash_after_tenant_payment
AFTER INSERT ON public.tenant_invoice_payment_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.apply_owner_cash_after_tenant_payment();

CREATE VIEW public.owner_invoice_balances
WITH (security_invoker = true)
AS
WITH line_totals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(line.amount)::numeric(14, 2) AS total_amount
  FROM public.owner_invoice_lines AS line
  GROUP BY line.organization_id, line.invoice_id
), cash_totals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS paid_from_held_cash
  FROM public.owner_invoice_lines AS line
  JOIN public.owner_charge_cash_allocations AS allocation
    ON allocation.organization_id = line.organization_id
   AND allocation.owner_invoice_line_id = line.id
  GROUP BY line.organization_id, line.invoice_id
)
SELECT
  invoice.*,
  coalesce(line_totals.total_amount, 0)::numeric(14, 2) AS total_amount,
  coalesce(cash_totals.paid_from_held_cash, 0)::numeric(14, 2) AS paid_from_held_cash,
  greatest(
    coalesce(line_totals.total_amount, 0) - coalesce(cash_totals.paid_from_held_cash, 0),
    0
  )::numeric(14, 2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN coalesce(cash_totals.paid_from_held_cash, 0) <= 0 THEN 'unpaid'
    WHEN coalesce(cash_totals.paid_from_held_cash, 0) >= coalesce(line_totals.total_amount, 0)
      THEN 'paid'
    ELSE 'partly_paid'
  END AS payment_status
FROM public.owner_invoices AS invoice
LEFT JOIN line_totals
  ON line_totals.organization_id = invoice.organization_id
 AND line_totals.invoice_id = invoice.id
LEFT JOIN cash_totals
  ON cash_totals.organization_id = invoice.organization_id
 AND cash_totals.invoice_id = invoice.id;

REVOKE ALL ON TABLE public.owner_invoice_balances
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_invoice_balances TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_ips_paid_expense(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_customer_category text,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_supporting_document_id uuid,
  p_vendor_person_id uuid,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_category text := lower(trim(coalesce(p_customer_category, '')));
  v_responsibility text := lower(trim(coalesce(p_responsibility, '')));
  v_vendor_label text := NULLIF(trim(coalesce(p_vendor_label, '')), '');
  v_idempotency_key text := NULLIF(trim(coalesce(p_idempotency_key, '')), '');
  v_customer_label text;
  v_expense_type text;
  v_income_type text;
  v_markup numeric(14, 2) := coalesce(p_internal_markup_amount, 0);
  v_total numeric(14, 2);
  v_owner_person_id uuid;
  v_responsible_person_id uuid;
  v_expense_id uuid;
  v_payment_id uuid;
  v_responsibility_id uuid := gen_random_uuid();
  v_owner_line_id uuid;
  v_tenant_line_id uuid;
  v_income_item_id uuid;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_sort_order integer;
  v_existing public.ips_expense_responsibilities%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (SELECT app_private.is_org_admin(p_organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Idempotency key must contain at least 8 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT responsibility.*
  INTO v_existing
  FROM public.ips_expense_responsibilities AS responsibility
  WHERE responsibility.organization_id = p_organization_id
    AND responsibility.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'responsibility_id', v_existing.id,
      'expense_item_id', v_existing.finance_expense_item_id,
      'tenant_invoice_line_id', v_existing.tenant_invoice_line_id,
      'owner_invoice_line_id', v_existing.owner_invoice_line_id
    );
  END IF;

  IF p_expense_date IS NULL
    OR coalesce(p_internal_cost_amount, 0) <= 0
    OR v_markup < 0 THEN
    RAISE EXCEPTION 'Expense date, positive cost, and non-negative markup are required'
      USING ERRCODE = '22023';
  END IF;

  IF v_vendor_label IS NULL THEN
    RAISE EXCEPTION 'Vendor is required' USING ERRCODE = '22023';
  END IF;

  IF v_category NOT IN ('cleaning', 'utility', 'repairs_maintenance', 'other') THEN
    RAISE EXCEPTION 'Choose Cleaning, Utility, Repairs and Maintenance, or Other'
      USING ERRCODE = '22023';
  END IF;

  IF v_responsibility NOT IN ('owner', 'tenant') THEN
    RAISE EXCEPTION 'Choose Owner or Tenant'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.organization_id = p_organization_id
      AND unit.property_id = p_property_id
      AND unit.id = p_unit_id
      AND unit.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to property' USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS vendor
    WHERE vendor.organization_id = p_organization_id
      AND vendor.id = p_vendor_person_id
      AND vendor.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor does not belong to organization' USING ERRCODE = '23503';
  END IF;

  IF p_supporting_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.organization_id = p_organization_id
      AND document.id = p_supporting_document_id
      AND document.archived_at IS NULL
      AND (document.property_id IS NULL OR document.property_id = p_property_id)
  ) THEN
    RAISE EXCEPTION 'Supporting receipt does not belong to property'
      USING ERRCODE = '23503';
  END IF;

  v_total := (p_internal_cost_amount + v_markup)::numeric(14, 2);
  v_customer_label := CASE v_category
    WHEN 'cleaning' THEN 'Cleaning'
    WHEN 'utility' THEN 'Utility'
    WHEN 'repairs_maintenance' THEN 'Repairs and Maintenance'
    ELSE 'Other'
  END;
  v_expense_type := CASE v_category
    WHEN 'utility' THEN 'utilities'
    WHEN 'cleaning' THEN 'maintenance'
    WHEN 'repairs_maintenance' THEN 'maintenance'
    ELSE 'other'
  END;
  v_income_type := CASE WHEN v_category = 'utility'
    THEN 'utility_reimbursement' ELSE 'other' END;

  IF v_responsibility = 'tenant' THEN
    IF p_tenant_invoice_id IS NULL THEN
      RAISE EXCEPTION 'Choose the tenant invoice for this charge'
        USING ERRCODE = '22023';
    END IF;

    SELECT invoice.*
    INTO v_invoice
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_tenant_invoice_id
      AND invoice.property_id = p_property_id
      AND invoice.lifecycle = 'issued'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant invoice not found' USING ERRCODE = '23503';
    END IF;

    IF p_unit_id IS NOT NULL AND v_invoice.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Tenant invoice does not belong to unit'
        USING ERRCODE = '23503';
    END IF;

    v_responsible_person_id := v_invoice.recipient_person_id;
  ELSE
    IF p_tenant_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Owner expenses do not use a tenant invoice'
        USING ERRCODE = '22023';
    END IF;

    v_owner_person_id := app_private.resolve_property_owner(
      p_organization_id,
      p_property_id,
      p_expense_date
    );
    v_responsible_person_id := v_owner_person_id;
  END IF;

  INSERT INTO public.finance_expense_items (
    organization_id,
    property_id,
    unit_id,
    vendor_person_id,
    expense_type,
    vendor_label,
    invoice_date,
    due_date,
    amount,
    currency,
    category,
    status,
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
    p_vendor_person_id,
    v_expense_type,
    v_vendor_label,
    p_expense_date,
    p_expense_date,
    p_internal_cost_amount,
    'USD',
    v_customer_label,
    'approved',
    CASE WHEN v_responsibility = 'owner' THEN 'property_expense' ELSE 'company_cost' END,
    'not_billable',
    0,
    0,
    0,
    v_customer_label,
    NULLIF(trim(coalesce(p_reference, '')), ''),
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_expense_id;

  v_payment_id := app_private.record_finance_payment(
    p_organization_id,
    v_expense_id,
    p_internal_cost_amount,
    p_expense_date,
    p_reference
  );

  IF v_responsibility = 'owner' THEN
    v_owner_line_id := app_private.create_owner_invoice_line(
      p_organization_id,
      p_property_id,
      v_owner_person_id,
      p_expense_date,
      'owner_expense',
      v_responsibility_id,
      v_customer_label,
      v_vendor_label,
      v_total,
      v_actor_id
    );

    INSERT INTO public.ips_expense_responsibilities (
      id,
      organization_id,
      property_id,
      finance_expense_item_id,
      responsibility,
      responsible_person_id,
      customer_category,
      customer_label,
      internal_cost_amount,
      internal_markup_amount,
      customer_total_amount,
      held_cash_amount,
      ips_advance_amount,
      owner_invoice_line_id,
      supporting_document_id,
      idempotency_key,
      created_by,
      updated_by
    )
    VALUES (
      v_responsibility_id,
      p_organization_id,
      p_property_id,
      v_expense_id,
      'owner',
      v_responsible_person_id,
      v_category,
      v_customer_label,
      p_internal_cost_amount,
      v_markup,
      v_total,
      0,
      v_total,
      v_owner_line_id,
      p_supporting_document_id,
      v_idempotency_key,
      v_actor_id,
      v_actor_id
    );

    PERFORM app_private.apply_available_owner_cash(
      p_organization_id,
      p_property_id,
      p_expense_date,
      v_actor_id
    );
  ELSE
    INSERT INTO public.finance_income_items (
      organization_id,
      property_id,
      unit_id,
      lease_id,
      income_type,
      payer_person_id,
      payer_label,
      due_date,
      amount_due,
      amount_received,
      currency,
      status,
      description,
      reference,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      p_property_id,
      v_invoice.unit_id,
      v_invoice.lease_id,
      v_income_type,
      v_invoice.recipient_person_id,
      v_invoice.recipient_label,
      v_invoice.due_date,
      v_total,
      0,
      v_invoice.currency,
      'open',
      v_customer_label,
      NULLIF(trim(coalesce(p_reference, '')), ''),
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_income_item_id;

    SELECT coalesce(max(line.sort_order), 0) + 1
    INTO v_sort_order
    FROM public.tenant_invoice_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.invoice_id = v_invoice.id;

    INSERT INTO public.tenant_invoice_lines (
      organization_id,
      invoice_id,
      income_item_id,
      line_type,
      customer_label,
      description,
      amount,
      internal_cost_amount,
      internal_markup_amount,
      sort_order,
      created_by
    )
    VALUES (
      p_organization_id,
      v_invoice.id,
      v_income_item_id,
      v_category,
      v_customer_label,
      v_vendor_label,
      v_total,
      p_internal_cost_amount,
      v_markup,
      v_sort_order,
      v_actor_id
    )
    RETURNING id INTO v_tenant_line_id;

    UPDATE public.tenant_invoices
    SET total_amount = total_amount + v_total
    WHERE organization_id = p_organization_id
      AND id = v_invoice.id;

    INSERT INTO public.ips_expense_responsibilities (
      id,
      organization_id,
      property_id,
      finance_expense_item_id,
      responsibility,
      responsible_person_id,
      customer_category,
      customer_label,
      internal_cost_amount,
      internal_markup_amount,
      customer_total_amount,
      held_cash_amount,
      ips_advance_amount,
      tenant_invoice_line_id,
      supporting_document_id,
      idempotency_key,
      created_by,
      updated_by
    )
    VALUES (
      v_responsibility_id,
      p_organization_id,
      p_property_id,
      v_expense_id,
      'tenant',
      v_responsible_person_id,
      v_category,
      v_customer_label,
      p_internal_cost_amount,
      v_markup,
      v_total,
      0,
      p_internal_cost_amount,
      v_tenant_line_id,
      p_supporting_document_id,
      v_idempotency_key,
      v_actor_id,
      v_actor_id
    );
  END IF;

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
    v_actor_id,
    'ips_expense_responsibility',
    v_responsibility_id,
    'expense_recorded',
    jsonb_build_object(
      'property_id', p_property_id,
      'expense_item_id', v_expense_id,
      'finance_payment_id', v_payment_id,
      'responsibility', v_responsibility,
      'customer_category', v_category,
      'internal_cost_amount', p_internal_cost_amount,
      'internal_markup_amount', v_markup,
      'customer_total_amount', v_total,
      'tenant_invoice_line_id', v_tenant_line_id,
      'owner_invoice_line_id', v_owner_line_id
    )
  );

  v_result := jsonb_build_object(
    'responsibility_id', v_responsibility_id,
    'expense_item_id', v_expense_id,
    'finance_payment_id', v_payment_id,
    'tenant_invoice_line_id', v_tenant_line_id,
    'owner_invoice_line_id', v_owner_line_id
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ips_paid_expense(
  uuid, uuid, uuid, text, text, date, numeric, numeric, text, uuid, uuid, uuid, text, text
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_ips_paid_expense(
  uuid, uuid, uuid, text, text, date, numeric, numeric, text, uuid, uuid, uuid, text, text
)
TO authenticated;

REVOKE ALL ON FUNCTION app_private.resolve_property_owner(uuid, uuid, date)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.get_or_create_owner_invoice(uuid, uuid, uuid, date, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.create_owner_invoice_line(uuid, uuid, uuid, date, text, uuid, text, text, numeric, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.property_held_cash_balance(uuid, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.apply_available_owner_cash(uuid, uuid, date, uuid)
FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ips_expense_responsibilities IS
  'Operational responsibility overlay for an IPS-paid cost. Markup remains internal; customer documents show one simple total.';
COMMENT ON TABLE public.owner_invoices IS
  'Property-specific owner invoices for management fees and IPS advances that held rent cash has not covered.';
COMMENT ON VIEW public.owner_invoice_balances IS
  'Owner invoice totals and payment state derived from typed owner charge lines and held-cash allocations.';
