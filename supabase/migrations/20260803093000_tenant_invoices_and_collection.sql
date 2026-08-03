-- IPS Finance operational rework: tenant invoices, IPS payments, direct-owner
-- confirmations, and one management-fee occurrence per rent invoice.

CREATE TABLE public.tenant_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  lease_id uuid NOT NULL,
  billing_term_id uuid NOT NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  collection_route text NOT NULL,
  recipient_kind text NOT NULL,
  recipient_person_id uuid NOT NULL,
  recipient_label text NOT NULL,
  occupant_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  currency public.currency_code NOT NULL DEFAULT 'USD',
  total_amount numeric(14, 2) NOT NULL,
  lifecycle text NOT NULL DEFAULT 'issued',
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_invoices_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT tenant_invoices_number_unique UNIQUE (organization_id, invoice_number),
  CONSTRAINT tenant_invoices_lease_period_unique
    UNIQUE (organization_id, lease_id, billing_period_start),
  CONSTRAINT tenant_invoices_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoices_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoices_billing_term_fkey
    FOREIGN KEY (organization_id, lease_id, billing_term_id)
    REFERENCES public.lease_billing_terms(organization_id, lease_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_invoices_recipient_fkey
    FOREIGN KEY (organization_id, recipient_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoices_period_check
    CHECK (
      billing_period_end >= billing_period_start
      AND billing_period_start = date_trunc('month', billing_period_start)::date
    ),
  CONSTRAINT tenant_invoices_route_check
    CHECK (collection_route IN ('through_ips', 'direct_to_owner')),
  CONSTRAINT tenant_invoices_recipient_kind_check
    CHECK (recipient_kind IN ('individual', 'company')),
  CONSTRAINT tenant_invoices_recipient_label_check
    CHECK (length(trim(recipient_label)) > 0),
  CONSTRAINT tenant_invoices_amount_check CHECK (total_amount > 0),
  CONSTRAINT tenant_invoices_lifecycle_check CHECK (lifecycle IN ('issued', 'void')),
  CONSTRAINT tenant_invoices_void_evidence_check
    CHECK (
      (lifecycle = 'issued' AND voided_at IS NULL AND voided_by IS NULL)
      OR (lifecycle = 'void' AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE TABLE public.tenant_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  income_item_id uuid NOT NULL,
  line_type text NOT NULL,
  customer_label text NOT NULL,
  description text,
  amount numeric(14, 2) NOT NULL,
  internal_cost_amount numeric(14, 2),
  internal_markup_amount numeric(14, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_invoice_lines_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT tenant_invoice_lines_invoice_line_unique UNIQUE (invoice_id, id),
  CONSTRAINT tenant_invoice_lines_income_unique UNIQUE (organization_id, income_item_id),
  CONSTRAINT tenant_invoice_lines_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_lines_income_fkey
    FOREIGN KEY (organization_id, income_item_id)
    REFERENCES public.finance_income_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_lines_type_check
    CHECK (line_type IN ('rent', 'cleaning', 'utility', 'repairs_maintenance', 'other')),
  CONSTRAINT tenant_invoice_lines_label_check CHECK (length(trim(customer_label)) > 0),
  CONSTRAINT tenant_invoice_lines_amount_check CHECK (amount > 0),
  CONSTRAINT tenant_invoice_lines_internal_split_check
    CHECK (
      internal_markup_amount >= 0
      AND (internal_cost_amount IS NULL OR internal_cost_amount >= 0)
      AND (
        internal_cost_amount IS NULL
        OR amount = internal_cost_amount + internal_markup_amount
      )
    ),
  CONSTRAINT tenant_invoice_lines_sort_check CHECK (sort_order > 0)
);

CREATE TABLE public.tenant_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  receipt_number text NOT NULL,
  received_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reconciliation_source_id uuid NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_invoice_payments_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT tenant_invoice_payments_number_unique UNIQUE (organization_id, receipt_number),
  CONSTRAINT tenant_invoice_payments_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payments_source_fkey
    FOREIGN KEY (organization_id, reconciliation_source_id)
    REFERENCES public.financial_reconciliation_sources(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payments_amount_check CHECK (amount > 0)
);

CREATE TABLE public.tenant_invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  income_item_id uuid NOT NULL,
  finance_receipt_id uuid NOT NULL,
  amount numeric(14, 2) NOT NULL,
  allocation_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_invoice_payment_allocations_payment_line_unique
    UNIQUE (payment_id, invoice_line_id),
  CONSTRAINT tenant_invoice_payment_allocations_receipt_unique
    UNIQUE (finance_receipt_id),
  CONSTRAINT tenant_invoice_payment_allocations_payment_fkey
    FOREIGN KEY (organization_id, payment_id)
    REFERENCES public.tenant_invoice_payments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payment_allocations_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payment_allocations_line_fkey
    FOREIGN KEY (organization_id, invoice_line_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payment_allocations_income_fkey
    FOREIGN KEY (organization_id, income_item_id)
    REFERENCES public.finance_income_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payment_allocations_receipt_fkey
    FOREIGN KEY (organization_id, finance_receipt_id)
    REFERENCES public.finance_receipts(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_payment_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT tenant_invoice_payment_allocations_order_check CHECK (allocation_order > 0)
);

CREATE TABLE public.owner_collection_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  confirmation_number text NOT NULL,
  confirmed_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_collection_confirmations_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_collection_confirmations_number_unique
    UNIQUE (organization_id, confirmation_number),
  CONSTRAINT owner_collection_confirmations_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmations_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmations_amount_check CHECK (amount > 0)
);

CREATE TABLE public.owner_collection_confirmation_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  confirmation_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  income_item_id uuid NOT NULL,
  amount numeric(14, 2) NOT NULL,
  allocation_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT owner_collection_confirmation_allocations_line_unique
    UNIQUE (confirmation_id, invoice_line_id),
  CONSTRAINT owner_collection_confirmation_allocations_confirmation_fkey
    FOREIGN KEY (organization_id, confirmation_id)
    REFERENCES public.owner_collection_confirmations(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmation_allocations_invoice_fkey
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmation_allocations_line_fkey
    FOREIGN KEY (organization_id, invoice_line_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmation_allocations_income_fkey
    FOREIGN KEY (organization_id, income_item_id)
    REFERENCES public.finance_income_items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_collection_confirmation_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT owner_collection_confirmation_allocations_order_check CHECK (allocation_order > 0)
);

CREATE TABLE public.management_fee_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  tenant_invoice_id uuid NOT NULL,
  billing_term_id uuid NOT NULL,
  fee_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  fee_mode text NOT NULL,
  fee_value numeric(14, 4) NOT NULL,
  settlement_status text NOT NULL DEFAULT 'unsettled',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT management_fee_occurrences_org_identity_unique UNIQUE (organization_id, id),
  CONSTRAINT management_fee_occurrences_invoice_unique UNIQUE (organization_id, tenant_invoice_id),
  CONSTRAINT management_fee_occurrences_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT management_fee_occurrences_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT management_fee_occurrences_invoice_fkey
    FOREIGN KEY (organization_id, tenant_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT management_fee_occurrences_billing_term_fkey
    FOREIGN KEY (organization_id, lease_id, billing_term_id)
    REFERENCES public.lease_billing_terms(organization_id, lease_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT management_fee_occurrences_amount_check CHECK (amount > 0),
  CONSTRAINT management_fee_occurrences_mode_check CHECK (fee_mode IN ('flat', 'percentage')),
  CONSTRAINT management_fee_occurrences_value_check CHECK (fee_value >= 0),
  CONSTRAINT management_fee_occurrences_status_check
    CHECK (settlement_status IN ('unsettled', 'held_cash', 'owner_due', 'split', 'settled'))
);

CREATE INDEX tenant_invoices_worklist_idx
  ON public.tenant_invoices(organization_id, lifecycle, due_date, id);
CREATE INDEX tenant_invoices_property_period_idx
  ON public.tenant_invoices(organization_id, property_id, billing_period_start DESC);
CREATE INDEX tenant_invoice_lines_invoice_idx
  ON public.tenant_invoice_lines(organization_id, invoice_id, sort_order, id);
CREATE INDEX tenant_invoice_payments_invoice_idx
  ON public.tenant_invoice_payments(organization_id, invoice_id, received_date DESC);
CREATE INDEX tenant_invoice_payment_allocations_line_idx
  ON public.tenant_invoice_payment_allocations(organization_id, invoice_line_id);
CREATE INDEX owner_collection_confirmations_invoice_idx
  ON public.owner_collection_confirmations(organization_id, invoice_id, confirmed_date DESC);
CREATE INDEX owner_collection_confirmation_allocations_line_idx
  ON public.owner_collection_confirmation_allocations(organization_id, invoice_line_id);
CREATE INDEX management_fee_occurrences_property_idx
  ON public.management_fee_occurrences(organization_id, property_id, fee_date DESC);

ALTER TABLE public.tenant_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_collection_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_collection_confirmation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_fee_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read tenant invoices"
ON public.tenant_invoices FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Organization members can read tenant invoice lines"
ON public.tenant_invoice_lines FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Organization members can read tenant invoice payments"
ON public.tenant_invoice_payments FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Members can read tenant payment allocations"
ON public.tenant_invoice_payment_allocations FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Organization members can read owner collection confirmations"
ON public.owner_collection_confirmations FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Organization members can read owner collection allocations"
ON public.owner_collection_confirmation_allocations FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY "Organization members can read management fee occurrences"
ON public.management_fee_occurrences FOR SELECT TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

REVOKE ALL ON TABLE
  public.tenant_invoices,
  public.tenant_invoice_lines,
  public.tenant_invoice_payments,
  public.tenant_invoice_payment_allocations,
  public.owner_collection_confirmations,
  public.owner_collection_confirmation_allocations,
  public.management_fee_occurrences
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.tenant_invoices,
  public.tenant_invoice_lines,
  public.tenant_invoice_payments,
  public.tenant_invoice_payment_allocations,
  public.owner_collection_confirmations,
  public.owner_collection_confirmation_allocations,
  public.management_fee_occurrences
TO authenticated, service_role;

CREATE VIEW public.tenant_invoice_balances
WITH (security_invoker = true)
AS
WITH ips_paid AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.tenant_invoice_lines AS line
  JOIN public.finance_receipt_allocations AS allocation
    ON allocation.organization_id = line.organization_id
   AND allocation.income_item_id = line.income_item_id
  JOIN public.finance_receipts AS receipt
    ON receipt.organization_id = allocation.organization_id
   AND receipt.id = allocation.receipt_id
  WHERE receipt.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = receipt.organization_id
        AND reversal.reversal_of_id = receipt.id
    )
  GROUP BY line.organization_id, line.invoice_id
), owner_paid AS (
  SELECT
    allocation.organization_id,
    allocation.invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.owner_collection_confirmation_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.invoice_id
)
SELECT
  invoice.*,
  coalesce(ips_paid.amount, 0)::numeric(14, 2) AS paid_through_ips,
  coalesce(owner_paid.amount, 0)::numeric(14, 2) AS collected_by_owner,
  greatest(
    invoice.total_amount - coalesce(ips_paid.amount, 0) - coalesce(owner_paid.amount, 0),
    0
  )::numeric(14, 2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN coalesce(ips_paid.amount, 0) + coalesce(owner_paid.amount, 0) >= invoice.total_amount
      THEN 'paid'
    WHEN coalesce(ips_paid.amount, 0) + coalesce(owner_paid.amount, 0) > 0
      THEN 'partly_paid'
    ELSE 'unpaid'
  END AS payment_status,
  (
    invoice.lifecycle = 'issued'
    AND invoice.due_date < current_date
    AND coalesce(ips_paid.amount, 0) + coalesce(owner_paid.amount, 0) < invoice.total_amount
  ) AS is_overdue
FROM public.tenant_invoices AS invoice
LEFT JOIN ips_paid
  ON ips_paid.organization_id = invoice.organization_id
 AND ips_paid.invoice_id = invoice.id
LEFT JOIN owner_paid
  ON owner_paid.organization_id = invoice.organization_id
 AND owner_paid.invoice_id = invoice.id;

REVOKE ALL ON TABLE public.tenant_invoice_balances
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_invoice_balances
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.tenant_invoice_line_outstanding(
  p_organization_id uuid,
  p_invoice_line_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(
    line.amount
      - coalesce((
          SELECT sum(allocation.amount)
          FROM public.finance_receipt_allocations AS allocation
          JOIN public.finance_receipts AS receipt
            ON receipt.organization_id = allocation.organization_id
           AND receipt.id = allocation.receipt_id
          WHERE allocation.organization_id = p_organization_id
            AND allocation.income_item_id = line.income_item_id
            AND receipt.reversal_of_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.finance_receipts AS reversal
              WHERE reversal.organization_id = receipt.organization_id
                AND reversal.reversal_of_id = receipt.id
            )
        ), 0)
      - coalesce((
          SELECT sum(allocation.amount)
          FROM public.owner_collection_confirmation_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.invoice_line_id = p_invoice_line_id
        ), 0),
    0
  )::numeric(14, 2)
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = p_invoice_line_id;
$$;

REVOKE ALL ON FUNCTION app_private.tenant_invoice_line_outstanding(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_tenant_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lease public.leases%ROWTYPE;
  v_billing public.lease_billing_terms%ROWTYPE;
  v_recipient public.people%ROWTYPE;
  v_rent record;
  v_period_end date;
  v_effective_date date;
  v_due_date date;
  v_due_day integer;
  v_days_in_month integer;
  v_rent_amount numeric(14, 2);
  v_fee_base numeric(14, 2);
  v_fee_amount numeric(14, 2);
  v_is_prorated boolean := false;
  v_invoice_id uuid := gen_random_uuid();
  v_income_item_id uuid;
  v_existing_income public.finance_income_items%ROWTYPE;
  v_line_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_occupant_labels text[];
  v_payload jsonb;
  v_claim record;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_issue_date IS NULL
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR p_billing_period_start IS DISTINCT FROM
      pg_catalog.date_trunc('month', p_billing_period_start)::date THEN
    RAISE EXCEPTION 'A monthly billing period and issue date are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RAISE EXCEPTION 'Only an active lease can be billed'
      USING ERRCODE = '23514';
  END IF;

  v_period_end := (
    p_billing_period_start + interval '1 month - 1 day'
  )::date;

  IF v_lease.lease_start_date > v_period_end
    OR v_lease.lease_end_date < p_billing_period_start THEN
    RAISE EXCEPTION 'The lease is not active in this billing period'
      USING ERRCODE = '23514';
  END IF;

  v_effective_date := greatest(p_billing_period_start, v_lease.lease_start_date);

  SELECT billing.*
  INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complete lease billing setup before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_rent
  FROM public.resolve_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    v_effective_date
  );

  IF v_rent.resolution_status IS DISTINCT FROM 'resolved'
    OR v_rent.payment_frequency IS DISTINCT FROM 'monthly'
    OR v_rent.rent_currency::text IS DISTINCT FROM 'USD'
    OR v_rent.rent_due_day IS NULL THEN
    RAISE EXCEPTION 'Lease rent is not ready for monthly billing'
      USING ERRCODE = '23514';
  END IF;

  SELECT people.*
  INTO v_recipient
  FROM public.people AS people
  WHERE people.organization_id = p_organization_id
    AND people.id = v_billing.billing_recipient_person_id
    AND people.archived_at IS NULL;

  IF NOT FOUND OR v_recipient.party_type IS DISTINCT FROM v_billing.billing_recipient_kind THEN
    RAISE EXCEPTION 'Billing recipient is no longer valid'
      USING ERRCODE = '23503';
  END IF;

  v_rent_amount := v_rent.rent_amount::numeric(14, 2);

  IF pg_catalog.date_trunc('month', v_lease.lease_start_date)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
  ELSIF pg_catalog.date_trunc('month', v_lease.lease_end_date)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
  END IF;

  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'Rent invoice amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  v_due_day := v_rent.rent_due_day;
  v_days_in_month := extract(day FROM v_period_end)::integer;
  v_due_date := pg_catalog.make_date(
    extract(year FROM p_billing_period_start)::integer,
    extract(month FROM p_billing_period_start)::integer,
    least(v_due_day, v_days_in_month)
  );

  SELECT coalesce(
    array_agg(people.display_name ORDER BY party.is_primary DESC, people.display_name),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS people
    ON people.organization_id = party.organization_id
   AND people.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN ('primary_tenant', 'co_tenant', 'authorized_occupant')
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND people.archived_at IS NULL;

  v_payload := pg_catalog.jsonb_build_object(
    'leaseId', p_lease_id,
    'billingPeriodStart', p_billing_period_start,
    'issueDate', p_issue_date,
    'billingTermId', v_billing.id,
    'leaseTermId', v_rent.term_id,
    'rentAmount', v_rent_amount
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'generate_tenant_rent_invoice',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'invoiceId')::uuid;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'tenant_invoice_v1',
        p_organization_id,
        p_lease_id,
        p_billing_period_start
      ),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.lease_id = p_lease_id
      AND invoice.billing_period_start = p_billing_period_start
  ) THEN
    RAISE EXCEPTION 'Rent invoice already exists for this lease and period'
      USING ERRCODE = '23505';
  END IF;

  v_invoice_number := pg_catalog.concat(
    'INV-',
    pg_catalog.to_char(p_billing_period_start, 'YYYYMM'),
    '-',
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_invoice_id::text, '-', ''), 1, 8))
  );

  SELECT income.*
  INTO v_existing_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.lease_id = p_lease_id
    AND income.due_date = v_due_date
    AND income.income_type = 'rent'
    AND income.archived_at IS NULL
  FOR SHARE;

  IF FOUND THEN
    IF v_existing_income.amount_due IS DISTINCT FROM v_rent_amount
      OR v_existing_income.currency::text IS DISTINCT FROM 'USD'
      OR v_existing_income.status = 'void'
      OR EXISTS (
        SELECT 1
        FROM public.tenant_invoice_lines AS existing_line
        WHERE existing_line.organization_id = p_organization_id
          AND existing_line.income_item_id = v_existing_income.id
      )
      OR (
        v_billing.collection_route = 'direct_to_owner'
        AND EXISTS (
          SELECT 1
          FROM public.finance_receipt_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.income_item_id = v_existing_income.id
        )
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this invoice setup'
        USING ERRCODE = '23514';
    END IF;

    v_income_item_id := v_existing_income.id;
  ELSE
    v_income_item_id := gen_random_uuid();

    INSERT INTO public.finance_income_items (
    id,
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
    v_income_item_id,
    p_organization_id,
    v_lease.property_id,
    v_lease.unit_id,
    p_lease_id,
    'rent',
    v_recipient.id,
    v_recipient.display_name,
    v_due_date,
    v_rent_amount,
    0,
    'USD',
    'open',
    'Rent',
    v_invoice_number,
    v_actor_id,
      v_actor_id
    );
  END IF;

  INSERT INTO public.tenant_invoices (
    id,
    organization_id,
    invoice_number,
    property_id,
    unit_id,
    lease_id,
    billing_term_id,
    billing_period_start,
    billing_period_end,
    issue_date,
    due_date,
    collection_route,
    recipient_kind,
    recipient_person_id,
    recipient_label,
    occupant_labels,
    currency,
    total_amount,
    created_by
  )
  VALUES (
    v_invoice_id,
    p_organization_id,
    v_invoice_number,
    v_lease.property_id,
    v_lease.unit_id,
    p_lease_id,
    v_billing.id,
    p_billing_period_start,
    v_period_end,
    p_issue_date,
    v_due_date,
    v_billing.collection_route,
    v_billing.billing_recipient_kind,
    v_recipient.id,
    v_recipient.display_name,
    v_occupant_labels,
    'USD',
    v_rent_amount,
    v_actor_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
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
    v_line_id,
    p_organization_id,
    v_invoice_id,
    v_income_item_id,
    'rent',
    'Rent',
    pg_catalog.concat(
      pg_catalog.to_char(p_billing_period_start, 'Mon YYYY'),
      CASE WHEN v_is_prorated THEN ' - prorated' ELSE '' END
    ),
    v_rent_amount,
    NULL,
    0,
    1,
    v_actor_id
  );

  IF v_billing.charge_management_fee_when_active THEN
    v_fee_base := CASE
      WHEN v_is_prorated AND NOT v_billing.full_management_fee_during_proration
        THEN v_rent_amount
      ELSE v_rent.rent_amount::numeric(14, 2)
    END;

    v_fee_amount := CASE
      WHEN v_billing.management_fee_mode = 'percentage'
        THEN pg_catalog.round(
          v_fee_base * v_billing.management_fee_value / 100,
          2
        )
      ELSE pg_catalog.round(v_billing.management_fee_value, 2)
    END;

    IF v_fee_amount > 0 THEN
      INSERT INTO public.management_fee_occurrences (
        organization_id,
        property_id,
        lease_id,
        tenant_invoice_id,
        billing_term_id,
        fee_date,
        amount,
        currency,
        fee_mode,
        fee_value,
        created_by
      )
      VALUES (
        p_organization_id,
        v_lease.property_id,
        p_lease_id,
        v_invoice_id,
        v_billing.id,
        p_issue_date,
        v_fee_amount,
        'USD',
        v_billing.management_fee_mode,
        v_billing.management_fee_value,
        v_actor_id
      );
    END IF;
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
    'tenant_invoice',
    v_invoice_id,
    'tenant_rent_invoice_generated',
    pg_catalog.jsonb_build_object(
      'invoiceNumber', v_invoice_number,
      'leaseId', p_lease_id,
      'billingPeriodStart', p_billing_period_start,
      'collectionRoute', v_billing.collection_route,
      'amount', v_rent_amount,
      'managementFeeAmount', coalesce(v_fee_amount, 0)
    )
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'invoiceId', v_invoice_id,
      'invoiceLineId', v_line_id,
      'incomeItemId', v_income_item_id
    )
  );

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tenant_rent_invoice(
  uuid, uuid, date, date, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.generate_tenant_rent_invoice(
  uuid, uuid, date, date, text
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.record_tenant_invoice_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reconciliation_source_id uuid,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_balance numeric(14, 2);
  v_payment_id uuid := gen_random_uuid();
  v_receipt_number text;
  v_payload jsonb;
  v_claim record;
  v_line record;
  v_requested jsonb;
  v_requested_amount numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_remaining numeric(14, 2) := p_amount;
  v_allocated numeric(14, 2) := 0;
  v_allocation_order integer := 0;
  v_receipt_result jsonb;
  v_receipt_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_invoice_id IS NULL
    OR p_received_date IS NULL
    OR p_reconciliation_source_id IS NULL
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR coalesce(p_amount, 0) <= 0
    OR p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2)
    OR (
      p_allocations IS NOT NULL
      AND pg_catalog.jsonb_typeof(p_allocations) IS DISTINCT FROM 'array'
    ) THEN
    RAISE EXCEPTION 'Complete invoice payment details are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT invoice.*
  INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id
  FOR SHARE;

  IF NOT FOUND OR v_invoice.lifecycle <> 'issued' THEN
    RAISE EXCEPTION 'Tenant invoice was not found or is void'
      USING ERRCODE = '23503';
  END IF;

  IF v_invoice.collection_route <> 'through_ips' THEN
    RAISE EXCEPTION 'Use owner collection confirmation for this invoice'
      USING ERRCODE = '23514';
  END IF;

  SELECT balance.balance_due
  INTO v_invoice_balance
  FROM public.tenant_invoice_balances AS balance
  WHERE balance.organization_id = p_organization_id
    AND balance.id = p_invoice_id;

  IF p_amount > coalesce(v_invoice_balance, 0) THEN
    RAISE EXCEPTION 'Payment exceeds the invoice balance'
      USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NOT NULL
    AND pg_catalog.jsonb_array_length(p_allocations) > 0
    AND (
      SELECT count(*) <> count(DISTINCT item.value->>'lineId')
      FROM pg_catalog.jsonb_array_elements(p_allocations) AS item(value)
    ) THEN
    RAISE EXCEPTION 'Each invoice line can appear only once'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'invoiceId', p_invoice_id,
    'amount', p_amount,
    'receivedDate', p_received_date,
    'reconciliationSourceId', p_reconciliation_source_id,
    'reference', NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    'allocations', coalesce(p_allocations, '[]'::jsonb)
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_tenant_invoice_payment',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'paymentId')::uuid;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', 'tenant_invoice_payment_v1', p_organization_id, p_invoice_id),
      0
    )
  );

  v_receipt_number := pg_catalog.concat(
    'PAY-',
    pg_catalog.to_char(p_received_date, 'YYYYMMDD'),
    '-',
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_payment_id::text, '-', ''), 1, 8))
  );

  INSERT INTO public.tenant_invoice_payments (
    id,
    organization_id,
    invoice_id,
    receipt_number,
    received_date,
    amount,
    currency,
    reconciliation_source_id,
    reference,
    created_by
  )
  VALUES (
    v_payment_id,
    p_organization_id,
    p_invoice_id,
    v_receipt_number,
    p_received_date,
    p_amount,
    v_invoice.currency,
    p_reconciliation_source_id,
    NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    v_actor_id
  );

  IF p_allocations IS NULL OR pg_catalog.jsonb_array_length(p_allocations) = 0 THEN
    FOR v_line IN
      SELECT
        line.*,
        app_private.tenant_invoice_line_outstanding(
          p_organization_id,
          line.id
        ) AS outstanding
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
      ORDER BY
        CASE WHEN line.line_type = 'rent' THEN 0 ELSE 1 END,
        line.sort_order,
        line.id
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_requested_amount := least(v_remaining, v_line.outstanding)::numeric(14, 2);

      IF v_requested_amount <= 0 THEN
        CONTINUE;
      END IF;

      v_allocation_order := v_allocation_order + 1;
      v_receipt_result := public.record_finance_receipt_v2(
        p_organization_id,
        v_line.income_item_id,
        v_requested_amount,
        p_received_date,
        p_reconciliation_source_id,
        NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
        pg_catalog.concat(p_idempotency_key, ':', v_line.id)
      );
      v_receipt_id := (v_receipt_result->>'receipt_id')::uuid;

      INSERT INTO public.tenant_invoice_payment_allocations (
        organization_id,
        payment_id,
        invoice_id,
        invoice_line_id,
        income_item_id,
        finance_receipt_id,
        amount,
        allocation_order,
        created_by
      )
      VALUES (
        p_organization_id,
        v_payment_id,
        p_invoice_id,
        v_line.id,
        v_line.income_item_id,
        v_receipt_id,
        v_requested_amount,
        v_allocation_order,
        v_actor_id
      );

      v_remaining := (v_remaining - v_requested_amount)::numeric(14, 2);
      v_allocated := (v_allocated + v_requested_amount)::numeric(14, 2);
    END LOOP;
  ELSE
    FOR v_requested IN
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(p_allocations) AS item(value)
    LOOP
      v_requested_amount := (v_requested->>'amount')::numeric(14, 2);

      SELECT line.*
      INTO v_line
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
        AND line.id = (v_requested->>'lineId')::uuid;

      IF NOT FOUND
        OR v_requested_amount <= 0
        OR v_requested_amount IS DISTINCT FROM pg_catalog.round(v_requested_amount, 2) THEN
        RAISE EXCEPTION 'Payment allocation is invalid'
          USING ERRCODE = '22023';
      END IF;

      v_outstanding := app_private.tenant_invoice_line_outstanding(
        p_organization_id,
        v_line.id
      );

      IF v_requested_amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment allocation exceeds the invoice line balance'
          USING ERRCODE = '22023';
      END IF;

      v_allocation_order := v_allocation_order + 1;
      v_receipt_result := public.record_finance_receipt_v2(
        p_organization_id,
        v_line.income_item_id,
        v_requested_amount,
        p_received_date,
        p_reconciliation_source_id,
        NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
        pg_catalog.concat(p_idempotency_key, ':', v_line.id)
      );
      v_receipt_id := (v_receipt_result->>'receipt_id')::uuid;

      INSERT INTO public.tenant_invoice_payment_allocations (
        organization_id,
        payment_id,
        invoice_id,
        invoice_line_id,
        income_item_id,
        finance_receipt_id,
        amount,
        allocation_order,
        created_by
      )
      VALUES (
        p_organization_id,
        v_payment_id,
        p_invoice_id,
        v_line.id,
        v_line.income_item_id,
        v_receipt_id,
        v_requested_amount,
        v_allocation_order,
        v_actor_id
      );

      v_allocated := (v_allocated + v_requested_amount)::numeric(14, 2);
    END LOOP;
  END IF;

  IF v_allocated IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment allocations must equal the payment amount'
      USING ERRCODE = '23514';
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
    'tenant_invoice_payment',
    v_payment_id,
    'tenant_invoice_payment_recorded',
    pg_catalog.jsonb_build_object(
      'invoiceId', p_invoice_id,
      'receiptNumber', v_receipt_number,
      'amount', p_amount,
      'collectionRoute', 'through_ips'
    )
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'invoiceId', p_invoice_id,
      'paymentId', v_payment_id
    )
  );

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_invoice_payment(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.refresh_finance_income_compatibility(
  p_income_item_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_compatibility_amount numeric(14, 2);
  v_compatibility_date date;
BEGIN
  SELECT
    coalesce(sum(source.signed_amount), 0)::numeric(14, 2),
    max(source.settled_date) FILTER (WHERE source.signed_amount > 0)
  INTO v_compatibility_amount, v_compatibility_date
  FROM (
    SELECT
      CASE
        WHEN allocation.settlement_contract_version = 'plan05.v1'
          THEN allocation.signed_amount
        WHEN receipt.reversal_of_id IS NULL THEN allocation.amount
        ELSE -allocation.amount
      END AS signed_amount,
      receipt.received_date AS settled_date
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_receipts AS receipt
      ON receipt.id = allocation.receipt_id
     AND receipt.organization_id = allocation.organization_id
    WHERE allocation.income_item_id = p_income_item_id

    UNION ALL

    SELECT
      allocation.amount AS signed_amount,
      confirmation.confirmed_date AS settled_date
    FROM public.owner_collection_confirmation_allocations AS allocation
    JOIN public.owner_collection_confirmations AS confirmation
      ON confirmation.id = allocation.confirmation_id
     AND confirmation.organization_id = allocation.organization_id
    WHERE allocation.income_item_id = p_income_item_id
  ) AS source;

  UPDATE public.finance_income_items
  SET
    amount_received = v_compatibility_amount,
    received_date = CASE
      WHEN v_compatibility_amount > 0 THEN v_compatibility_date
      ELSE NULL
    END,
    status = CASE
      WHEN status = 'posted' OR ledger_entry_id IS NOT NULL THEN status
      WHEN v_compatibility_amount <= 0 THEN 'open'
      WHEN v_compatibility_amount >= amount_due THEN 'received'
      ELSE 'partially_received'
    END,
    updated_by = p_actor_id
  WHERE id = p_income_item_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.refresh_finance_income_compatibility(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_invoice_income_allocation_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_income_item_id uuid := NEW.income_item_id;
  v_amount_due numeric(14, 2);
  v_receipt_total numeric(14, 2);
  v_owner_total numeric(14, 2);
  v_new_amount numeric(14, 2);
BEGIN
  IF TG_TABLE_NAME = 'finance_receipt_allocations' THEN
    IF NEW.reversal_of_allocation_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT income.amount_due
  INTO v_amount_due
  FROM public.finance_income_items AS income
  WHERE income.id = v_income_item_id
    AND income.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(
    CASE
      WHEN allocation.settlement_contract_version = 'plan05.v1'
        THEN allocation.signed_amount
      WHEN receipt.reversal_of_id IS NULL THEN allocation.amount
      ELSE -allocation.amount
    END
  ), 0)::numeric(14, 2)
  INTO v_receipt_total
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.organization_id = NEW.organization_id
    AND allocation.income_item_id = v_income_item_id;

  SELECT coalesce(sum(allocation.amount), 0)::numeric(14, 2)
  INTO v_owner_total
  FROM public.owner_collection_confirmation_allocations AS allocation
  WHERE allocation.organization_id = NEW.organization_id
    AND allocation.income_item_id = v_income_item_id;

  IF TG_TABLE_NAME = 'finance_receipt_allocations' THEN
    v_new_amount := coalesce(NEW.signed_amount, NEW.amount);
  ELSE
    v_new_amount := NEW.amount;
  END IF;

  IF v_receipt_total + v_owner_total + v_new_amount > v_amount_due THEN
    RAISE EXCEPTION 'Income settlement exceeds the invoice line balance'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_invoice_total_on_receipt_allocation
BEFORE INSERT ON public.finance_receipt_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_invoice_income_allocation_total();

CREATE TRIGGER enforce_invoice_total_on_owner_confirmation
BEFORE INSERT ON public.owner_collection_confirmation_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_invoice_income_allocation_total();

REVOKE ALL ON FUNCTION app_private.enforce_invoice_income_allocation_total()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_owner_collected_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_confirmed_date date,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_invoice public.tenant_invoices%ROWTYPE;
  v_invoice_balance numeric(14, 2);
  v_owner_person_id uuid;
  v_confirmation_id uuid := gen_random_uuid();
  v_confirmation_number text;
  v_payload jsonb;
  v_claim record;
  v_line record;
  v_requested jsonb;
  v_requested_amount numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_remaining numeric(14, 2) := p_amount;
  v_allocated numeric(14, 2) := 0;
  v_allocation_order integer := 0;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_invoice_id IS NULL
    OR p_confirmed_date IS NULL
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR coalesce(p_amount, 0) <= 0
    OR p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2)
    OR (
      p_allocations IS NOT NULL
      AND pg_catalog.jsonb_typeof(p_allocations) IS DISTINCT FROM 'array'
    ) THEN
    RAISE EXCEPTION 'Complete owner collection details are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT invoice.*
  INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id
  FOR SHARE;

  IF NOT FOUND OR v_invoice.lifecycle <> 'issued' THEN
    RAISE EXCEPTION 'Tenant invoice was not found or is void'
      USING ERRCODE = '23503';
  END IF;

  IF v_invoice.collection_route <> 'direct_to_owner' THEN
    RAISE EXCEPTION 'Record an IPS payment for this invoice'
      USING ERRCODE = '23514';
  END IF;

  SELECT owner.person_id
  INTO v_owner_person_id
  FROM public.property_owners AS owner
  WHERE owner.organization_id = p_organization_id
    AND owner.property_id = v_invoice.property_id
    AND owner.is_primary
    AND owner.archived_at IS NULL
    AND (owner.started_on IS NULL OR owner.started_on <= p_confirmed_date)
    AND (owner.ended_on IS NULL OR owner.ended_on >= p_confirmed_date)
  ORDER BY owner.started_on DESC NULLS LAST, owner.created_at DESC, owner.id DESC
  LIMIT 1;

  IF v_owner_person_id IS NULL THEN
    RAISE EXCEPTION 'Property owner is not active on the confirmation date'
      USING ERRCODE = '23514';
  END IF;

  SELECT balance.balance_due
  INTO v_invoice_balance
  FROM public.tenant_invoice_balances AS balance
  WHERE balance.organization_id = p_organization_id
    AND balance.id = p_invoice_id;

  IF p_amount > coalesce(v_invoice_balance, 0) THEN
    RAISE EXCEPTION 'Owner collection exceeds the invoice balance'
      USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NOT NULL
    AND pg_catalog.jsonb_array_length(p_allocations) > 0
    AND (
      SELECT count(*) <> count(DISTINCT item.value->>'lineId')
      FROM pg_catalog.jsonb_array_elements(p_allocations) AS item(value)
    ) THEN
    RAISE EXCEPTION 'Each invoice line can appear only once'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'invoiceId', p_invoice_id,
    'amount', p_amount,
    'confirmedDate', p_confirmed_date,
    'reference', NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    'allocations', coalesce(p_allocations, '[]'::jsonb)
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'confirm_owner_collected_rent',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'confirmationId')::uuid;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', 'owner_collection_v1', p_organization_id, p_invoice_id),
      0
    )
  );

  v_confirmation_number := pg_catalog.concat(
    'OWN-',
    pg_catalog.to_char(p_confirmed_date, 'YYYYMMDD'),
    '-',
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_confirmation_id::text, '-', ''), 1, 8))
  );

  INSERT INTO public.owner_collection_confirmations (
    id,
    organization_id,
    invoice_id,
    owner_person_id,
    confirmation_number,
    confirmed_date,
    amount,
    currency,
    reference,
    created_by
  )
  VALUES (
    v_confirmation_id,
    p_organization_id,
    p_invoice_id,
    v_owner_person_id,
    v_confirmation_number,
    p_confirmed_date,
    p_amount,
    v_invoice.currency,
    NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    v_actor_id
  );

  PERFORM app_private.set_finance_settlement_context(true);

  IF p_allocations IS NULL OR pg_catalog.jsonb_array_length(p_allocations) = 0 THEN
    FOR v_line IN
      SELECT
        line.*,
        app_private.tenant_invoice_line_outstanding(
          p_organization_id,
          line.id
        ) AS outstanding
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
      ORDER BY
        CASE WHEN line.line_type = 'rent' THEN 0 ELSE 1 END,
        line.sort_order,
        line.id
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_requested_amount := least(v_remaining, v_line.outstanding)::numeric(14, 2);

      IF v_requested_amount <= 0 THEN
        CONTINUE;
      END IF;

      v_allocation_order := v_allocation_order + 1;

      INSERT INTO public.owner_collection_confirmation_allocations (
        organization_id,
        confirmation_id,
        invoice_id,
        invoice_line_id,
        income_item_id,
        amount,
        allocation_order,
        created_by
      )
      VALUES (
        p_organization_id,
        v_confirmation_id,
        p_invoice_id,
        v_line.id,
        v_line.income_item_id,
        v_requested_amount,
        v_allocation_order,
        v_actor_id
      );

      PERFORM app_private.refresh_finance_income_compatibility(
        v_line.income_item_id,
        v_actor_id
      );

      v_remaining := (v_remaining - v_requested_amount)::numeric(14, 2);
      v_allocated := (v_allocated + v_requested_amount)::numeric(14, 2);
    END LOOP;
  ELSE
    FOR v_requested IN
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(p_allocations) AS item(value)
    LOOP
      v_requested_amount := (v_requested->>'amount')::numeric(14, 2);

      SELECT line.*
      INTO v_line
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
        AND line.id = (v_requested->>'lineId')::uuid;

      IF NOT FOUND
        OR v_requested_amount <= 0
        OR v_requested_amount IS DISTINCT FROM pg_catalog.round(v_requested_amount, 2) THEN
        RAISE EXCEPTION 'Owner collection allocation is invalid'
          USING ERRCODE = '22023';
      END IF;

      v_outstanding := app_private.tenant_invoice_line_outstanding(
        p_organization_id,
        v_line.id
      );

      IF v_requested_amount > v_outstanding THEN
        RAISE EXCEPTION 'Owner collection allocation exceeds the invoice line balance'
          USING ERRCODE = '22023';
      END IF;

      v_allocation_order := v_allocation_order + 1;

      INSERT INTO public.owner_collection_confirmation_allocations (
        organization_id,
        confirmation_id,
        invoice_id,
        invoice_line_id,
        income_item_id,
        amount,
        allocation_order,
        created_by
      )
      VALUES (
        p_organization_id,
        v_confirmation_id,
        p_invoice_id,
        v_line.id,
        v_line.income_item_id,
        v_requested_amount,
        v_allocation_order,
        v_actor_id
      );

      PERFORM app_private.refresh_finance_income_compatibility(
        v_line.income_item_id,
        v_actor_id
      );

      v_allocated := (v_allocated + v_requested_amount)::numeric(14, 2);
    END LOOP;
  END IF;

  PERFORM app_private.set_finance_settlement_context(false);

  IF v_allocated IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Owner collection allocations must equal the confirmed amount'
      USING ERRCODE = '23514';
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
    'owner_collection_confirmation',
    v_confirmation_id,
    'owner_collection_confirmed',
    pg_catalog.jsonb_build_object(
      'invoiceId', p_invoice_id,
      'confirmationNumber', v_confirmation_number,
      'amount', p_amount,
      'collectionRoute', 'direct_to_owner'
    )
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'invoiceId', p_invoice_id,
      'confirmationId', v_confirmation_id
    )
  );

  RETURN v_confirmation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.enforce_settled_income_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.ledger_entry_id IS DISTINCT FROM NEW.ledger_entry_id
    OR (
      OLD.status IS DISTINCT FROM NEW.status
      AND (OLD.status = 'posted' OR NEW.status = 'posted')
    )
  )
    AND NOT app_private.has_finance_settlement_context() THEN
    RAISE EXCEPTION
      'Income obligation posting requires the checked settlement workflow'
      USING ERRCODE = '42501';
  END IF;

  IF (
    EXISTS (
      SELECT 1
      FROM public.finance_receipt_allocations AS allocation
      WHERE allocation.organization_id = OLD.organization_id
        AND allocation.income_item_id = OLD.id
        AND allocation.settlement_contract_version = 'plan05.v1'
    )
    OR EXISTS (
      SELECT 1
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.organization_id = OLD.organization_id
        AND allocation.income_item_id = OLD.id
    )
  )
    AND (
      OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.property_id IS DISTINCT FROM NEW.property_id
      OR OLD.unit_id IS DISTINCT FROM NEW.unit_id
      OR OLD.lease_id IS DISTINCT FROM NEW.lease_id
      OR OLD.payer_person_id IS DISTINCT FROM NEW.payer_person_id
      OR OLD.payer_label IS DISTINCT FROM NEW.payer_label
      OR OLD.income_type IS DISTINCT FROM NEW.income_type
      OR OLD.due_date IS DISTINCT FROM NEW.due_date
      OR OLD.amount_due IS DISTINCT FROM NEW.amount_due
      OR OLD.amount_received IS DISTINCT FROM NEW.amount_received
      OR OLD.received_date IS DISTINCT FROM NEW.received_date
      OR OLD.currency IS DISTINCT FROM NEW.currency
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.ledger_entry_id IS DISTINCT FROM NEW.ledger_entry_id
      OR OLD.archived_at IS DISTINCT FROM NEW.archived_at
    )
    AND NOT app_private.has_finance_settlement_context() THEN
    RAISE EXCEPTION
      'Settled income material requires the checked settlement workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.tenant_invoices IS
  'Operational customer invoices. Payment state is derived and direct-owner confirmations do not create IPS cash receipts.';
COMMENT ON TABLE public.management_fee_occurrences IS
  'One IPS management-fee income and owner-expense occurrence per generated rent invoice.';
