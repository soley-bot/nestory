-- Human-entered paid costs remain non-financial until an authorized Finance
-- reviewer approves the immutable submission snapshot.  Approved effects use
-- payment-allocation identity for their Ledger and journal projection.

CREATE TABLE public.expense_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  unit_id uuid,
  source_type text NOT NULL DEFAULT 'general',
  source_id uuid,
  customer_category text NOT NULL,
  vendor_label text NOT NULL,
  expense_date date NOT NULL,
  internal_cost_amount numeric(14, 2) NOT NULL,
  internal_markup_amount numeric(14, 2) NOT NULL DEFAULT 0,
  customer_total_amount numeric(14, 2)
    GENERATED ALWAYS AS (
      internal_cost_amount + internal_markup_amount
    ) STORED,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  responsibility text NOT NULL,
  tenant_invoice_id uuid,
  reconciliation_source_id uuid NOT NULL,
  supporting_document_id uuid,
  vendor_person_id uuid,
  reference text,
  status text NOT NULL DEFAULT 'submitted',
  idempotency_key text NOT NULL,
  request_payload_hash text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_reason text,
  approved_finance_expense_item_id uuid,
  approved_payment_id uuid,
  approved_payment_allocation_id uuid,
  approved_responsibility_id uuid,
  approved_ledger_entry_id uuid,
  approved_journal_entry_id uuid,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reversal_reason text,
  reversal_payment_id uuid,
  reversal_payment_allocation_id uuid,
  reversal_ledger_entry_id uuid,
  reversal_journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_submissions_org_identity_unique
    UNIQUE (organization_id, id),
  CONSTRAINT expense_submissions_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT expense_submissions_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_source_task_fkey
    FOREIGN KEY (source_id) REFERENCES public.tasks(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_tenant_invoice_fkey
    FOREIGN KEY (organization_id, tenant_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_reconciliation_source_fkey
    FOREIGN KEY (organization_id, reconciliation_source_id)
    REFERENCES public.financial_reconciliation_sources(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_document_fkey
    FOREIGN KEY (supporting_document_id)
    REFERENCES public.documents(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_vendor_fkey
    FOREIGN KEY (organization_id, vendor_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_expense_fkey
    FOREIGN KEY (organization_id, approved_finance_expense_item_id)
    REFERENCES public.finance_expense_items(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_payment_fkey
    FOREIGN KEY (organization_id, approved_payment_id)
    REFERENCES public.finance_payments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_responsibility_fkey
    FOREIGN KEY (organization_id, approved_responsibility_id)
    REFERENCES public.ips_expense_responsibilities(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_ledger_fkey
    FOREIGN KEY (approved_ledger_entry_id)
    REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_journal_fkey
    FOREIGN KEY (approved_journal_entry_id)
    REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_reversal_payment_fkey
    FOREIGN KEY (organization_id, reversal_payment_id)
    REFERENCES public.finance_payments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_reversal_ledger_fkey
    FOREIGN KEY (reversal_ledger_entry_id)
    REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_reversal_journal_fkey
    FOREIGN KEY (reversal_journal_entry_id)
    REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  CONSTRAINT expense_submissions_source_check
    CHECK (
      (source_type = 'general' AND source_id IS NULL)
      OR (source_type = 'maintenance_task' AND source_id IS NOT NULL)
    ),
  CONSTRAINT expense_submissions_category_check
    CHECK (
      customer_category IN (
        'cleaning',
        'utility',
        'repairs_maintenance',
        'other'
      )
    ),
  CONSTRAINT expense_submissions_vendor_label_check
    CHECK (length(trim(vendor_label)) BETWEEN 2 AND 120),
  CONSTRAINT expense_submissions_amount_check
    CHECK (
      internal_cost_amount > 0
      AND internal_cost_amount = round(internal_cost_amount, 2)
      AND internal_markup_amount >= 0
      AND internal_markup_amount = round(internal_markup_amount, 2)
    ),
  CONSTRAINT expense_submissions_responsibility_check
    CHECK (responsibility IN ('owner', 'tenant')),
  CONSTRAINT expense_submissions_destination_check
    CHECK (
      (responsibility = 'owner' AND tenant_invoice_id IS NULL)
      OR (responsibility = 'tenant' AND tenant_invoice_id IS NOT NULL)
    ),
  CONSTRAINT expense_submissions_status_check
    CHECK (status IN ('submitted', 'approved', 'rejected', 'reversed')),
  CONSTRAINT expense_submissions_idempotency_check
    CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 160),
  CONSTRAINT expense_submissions_payload_hash_check
    CHECK (request_payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT expense_submissions_reference_check
    CHECK (reference IS NULL OR length(trim(reference)) BETWEEN 1 AND 160),
  CONSTRAINT expense_submissions_review_reason_check
    CHECK (
      review_reason IS NULL
      OR length(trim(review_reason)) BETWEEN 3 AND 500
    ),
  CONSTRAINT expense_submissions_reversal_reason_check
    CHECK (
      reversal_reason IS NULL
      OR length(trim(reversal_reason)) BETWEEN 3 AND 500
    ),
  CONSTRAINT expense_submissions_lifecycle_evidence_check
    CHECK (
      (
        status = 'submitted'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND review_reason IS NULL
        AND approved_finance_expense_item_id IS NULL
        AND approved_payment_id IS NULL
        AND approved_payment_allocation_id IS NULL
        AND approved_responsibility_id IS NULL
        AND approved_ledger_entry_id IS NULL
        AND approved_journal_entry_id IS NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
        AND reversal_journal_entry_id IS NULL
      )
      OR (
        status = 'rejected'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND review_reason IS NOT NULL
        AND approved_finance_expense_item_id IS NULL
        AND approved_payment_id IS NULL
        AND approved_payment_allocation_id IS NULL
        AND approved_responsibility_id IS NULL
        AND approved_ledger_entry_id IS NULL
        AND approved_journal_entry_id IS NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
        AND reversal_journal_entry_id IS NULL
      )
      OR (
        status = 'approved'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND approved_finance_expense_item_id IS NOT NULL
        AND approved_payment_id IS NOT NULL
        AND approved_payment_allocation_id IS NOT NULL
        AND approved_responsibility_id IS NOT NULL
        AND approved_ledger_entry_id IS NOT NULL
        AND approved_journal_entry_id IS NOT NULL
        AND reversed_at IS NULL
        AND reversed_by IS NULL
        AND reversal_reason IS NULL
        AND reversal_payment_id IS NULL
        AND reversal_payment_allocation_id IS NULL
        AND reversal_ledger_entry_id IS NULL
        AND reversal_journal_entry_id IS NULL
      )
      OR (
        status = 'reversed'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND approved_finance_expense_item_id IS NOT NULL
        AND approved_payment_id IS NOT NULL
        AND approved_payment_allocation_id IS NOT NULL
        AND approved_responsibility_id IS NOT NULL
        AND approved_ledger_entry_id IS NOT NULL
        AND approved_journal_entry_id IS NOT NULL
        AND reversed_at IS NOT NULL
        AND reversed_by IS NOT NULL
        AND reversal_reason IS NOT NULL
        AND reversal_payment_id IS NOT NULL
        AND reversal_payment_allocation_id IS NOT NULL
        AND reversal_ledger_entry_id IS NOT NULL
        AND reversal_journal_entry_id IS NOT NULL
      )
    )
);

CREATE INDEX expense_submissions_review_queue_idx
  ON public.expense_submissions(
    organization_id,
    status,
    submitted_at DESC,
    id
  );
CREATE INDEX expense_submissions_property_idx
  ON public.expense_submissions(
    organization_id,
    property_id,
    expense_date DESC,
    id
  );
CREATE UNIQUE INDEX expense_submissions_active_maintenance_task_idx
  ON public.expense_submissions(organization_id, source_id)
  WHERE source_type = 'maintenance_task'
    AND status IN ('submitted', 'approved');

CREATE TRIGGER set_expense_submissions_updated_at
BEFORE UPDATE ON public.expense_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expense_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read expense submissions"
ON public.expense_submissions
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.expense_submissions
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.expense_submissions TO authenticated;

ALTER TABLE public.finance_payment_allocations
  ADD COLUMN property_id uuid,
  ADD COLUMN unit_id uuid,
  ADD COLUMN vendor_person_id_snapshot uuid,
  ADD COLUMN currency public.currency_code,
  ADD COLUMN paid_date date,
  ADD COLUMN reconciliation_source_id uuid,
  ADD COLUMN economic_scope_snapshot text,
  ADD COLUMN expense_type_snapshot text,
  ADD COLUMN signed_amount numeric(14, 2),
  ADD COLUMN settlement_contract_version text,
  ADD COLUMN reversal_of_allocation_id uuid,
  ADD COLUMN ledger_entry_id uuid;

ALTER TABLE public.finance_payment_allocations
  ADD CONSTRAINT finance_payment_allocations_org_id_unique
    UNIQUE (organization_id, id),
  ADD CONSTRAINT finance_payment_allocations_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_org_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_vendor_fkey
    FOREIGN KEY (organization_id, vendor_person_id_snapshot)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_reconciliation_source_fkey
    FOREIGN KEY (organization_id, reconciliation_source_id)
    REFERENCES public.financial_reconciliation_sources(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_reversal_scope_fkey
    FOREIGN KEY (organization_id, reversal_of_allocation_id)
    REFERENCES public.finance_payment_allocations(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_ledger_fkey
    FOREIGN KEY (ledger_entry_id)
    REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_payment_allocations_reversal_unique
    UNIQUE (reversal_of_allocation_id),
  ADD CONSTRAINT finance_payment_allocations_ledger_unique
    UNIQUE (ledger_entry_id),
  ADD CONSTRAINT finance_payment_allocations_snapshot_check
    CHECK (
      settlement_contract_version IS NULL
      OR (
        settlement_contract_version = 'expense_approval.v1'
        AND property_id IS NOT NULL
        AND currency IS NOT NULL
        AND paid_date IS NOT NULL
        AND reconciliation_source_id IS NOT NULL
        AND economic_scope_snapshot IN (
          'property_expense',
          'company_advance',
          'company_cost'
        )
        AND expense_type_snapshot IN (
          'vendor_bill',
          'maintenance',
          'utilities',
          'supplies',
          'owner_payout',
          'refund',
          'other'
        )
        AND signed_amount IS NOT NULL
        AND abs(signed_amount) = amount
        AND (
          (reversal_of_allocation_id IS NULL AND signed_amount < 0)
          OR (
            reversal_of_allocation_id IS NOT NULL
            AND signed_amount > 0
          )
        )
      )
    );

CREATE INDEX finance_payment_allocations_snapshot_scope_idx
  ON public.finance_payment_allocations(
    organization_id,
    property_id,
    currency,
    paid_date,
    id
  )
  WHERE settlement_contract_version IS NOT NULL;

ALTER TABLE public.expense_submissions
  ADD CONSTRAINT expense_submissions_payment_allocation_fkey
    FOREIGN KEY (organization_id, approved_payment_allocation_id)
    REFERENCES public.finance_payment_allocations(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT expense_submissions_reversal_allocation_fkey
    FOREIGN KEY (organization_id, reversal_payment_allocation_id)
    REFERENCES public.finance_payment_allocations(organization_id, id)
    ON DELETE RESTRICT;

CREATE TABLE public.expense_customer_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL,
  property_id uuid NOT NULL,
  responsibility_id uuid NOT NULL,
  responsibility text NOT NULL,
  owner_invoice_id uuid,
  tenant_invoice_id uuid,
  tenant_income_item_id uuid,
  adjustment_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_org_identity_unique
    UNIQUE (organization_id, id),
  CONSTRAINT expense_customer_adjustments_submission_unique
    UNIQUE (organization_id, submission_id),
  CONSTRAINT expense_customer_adjustments_submission_fkey
    FOREIGN KEY (organization_id, submission_id)
    REFERENCES public.expense_submissions(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_responsibility_fkey
    FOREIGN KEY (organization_id, responsibility_id)
    REFERENCES public.ips_expense_responsibilities(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_owner_invoice_fkey
    FOREIGN KEY (organization_id, owner_invoice_id)
    REFERENCES public.owner_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_tenant_invoice_fkey
    FOREIGN KEY (organization_id, tenant_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_tenant_income_fkey
    FOREIGN KEY (organization_id, tenant_income_item_id)
    REFERENCES public.finance_income_items(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_customer_adjustments_responsibility_check
    CHECK (responsibility IN ('owner', 'tenant')),
  CONSTRAINT expense_customer_adjustments_destination_check
    CHECK (
      (
        responsibility = 'owner'
        AND owner_invoice_id IS NOT NULL
        AND tenant_invoice_id IS NULL
        AND tenant_income_item_id IS NULL
      )
      OR (
        responsibility = 'tenant'
        AND owner_invoice_id IS NULL
        AND tenant_invoice_id IS NOT NULL
        AND tenant_income_item_id IS NOT NULL
      )
    ),
  CONSTRAINT expense_customer_adjustments_amount_check CHECK (amount < 0),
  CONSTRAINT expense_customer_adjustments_reason_check
    CHECK (length(trim(reason)) BETWEEN 3 AND 500)
);

CREATE INDEX expense_customer_adjustments_owner_invoice_idx
  ON public.expense_customer_adjustments(organization_id, owner_invoice_id)
  WHERE owner_invoice_id IS NOT NULL;
CREATE INDEX expense_customer_adjustments_tenant_invoice_idx
  ON public.expense_customer_adjustments(organization_id, tenant_invoice_id)
  WHERE tenant_invoice_id IS NOT NULL;

ALTER TABLE public.expense_customer_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read expense customer adjustments"
ON public.expense_customer_adjustments
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.expense_customer_adjustments
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.expense_customer_adjustments TO authenticated;

ALTER TABLE public.owner_charge_cash_allocations
  ADD COLUMN reversal_of_id uuid,
  ADD CONSTRAINT owner_charge_cash_allocations_reversal_fkey
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.owner_charge_cash_allocations(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_charge_cash_allocations_reversal_unique
    UNIQUE (reversal_of_id),
  DROP CONSTRAINT owner_charge_cash_allocations_amount_check,
  ADD CONSTRAINT owner_charge_cash_allocations_amount_check
    CHECK (
      (reversal_of_id IS NULL AND amount > 0)
      OR (reversal_of_id IS NOT NULL AND amount < 0)
    );

CREATE OR REPLACE FUNCTION app_private.ensure_expense_accounting_bootstrap(
  p_organization_id uuid,
  p_currency public.currency_code
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  -- The shared bootstrap predates role-specific Finance review and checks for
  -- Super Admin itself. This private wrapper is reachable only after the
  -- review capability check and invokes that bootstrap as database authority.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM app_private.ensure_accounting_books_and_accounts(
    p_organization_id,
    p_currency
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    coalesce(v_claim_sub, ''),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.ensure_expense_accounting_bootstrap(
  uuid, public.currency_code
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.create_expense_payment_projection(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_actor_id uuid,
  p_is_reversal boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allocation public.finance_payment_allocations%ROWTYPE;
  v_expense public.finance_expense_items%ROWTYPE;
  v_mapping record;
  v_book_id uuid;
  v_ledger_entry_id uuid;
  v_journal_entry_id uuid;
  v_description text;
  v_lines jsonb;
BEGIN
  IF p_organization_id IS NULL
    OR p_allocation_id IS NULL
    OR p_actor_id IS NULL
    OR p_is_reversal IS NULL THEN
    RAISE EXCEPTION 'Expense projection identity is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT allocation.*
  INTO v_allocation
  FROM public.finance_payment_allocations AS allocation
  WHERE allocation.organization_id = p_organization_id
    AND allocation.id = p_allocation_id
    AND allocation.settlement_contract_version = 'expense_approval.v1'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense payment allocation not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_allocation.ledger_entry_id IS NOT NULL THEN
    SELECT ledger.accounting_journal_entry_id
    INTO STRICT v_journal_entry_id
    FROM public.ledger_entries AS ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.id = v_allocation.ledger_entry_id;

    RETURN jsonb_build_object(
      'ledger_entry_id', v_allocation.ledger_entry_id,
      'journal_entry_id', v_journal_entry_id
    );
  END IF;

  IF (v_allocation.reversal_of_allocation_id IS NOT NULL)
    IS DISTINCT FROM p_is_reversal THEN
    RAISE EXCEPTION 'Expense projection reversal identity is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT expense.*
  INTO STRICT v_expense
  FROM public.finance_expense_items AS expense
  WHERE expense.organization_id = p_organization_id
    AND expense.id = v_allocation.expense_item_id
  FOR UPDATE;

  SELECT mapping.*
  INTO STRICT v_mapping
  FROM app_private.resolve_legacy_accounting_mapping(
    'finance_expense',
    'expense',
    v_expense.category,
    NULL,
    v_allocation.expense_type_snapshot,
    v_allocation.economic_scope_snapshot
  ) AS mapping;

  PERFORM app_private.ensure_expense_accounting_bootstrap(
    p_organization_id,
    v_allocation.currency
  );

  SELECT book.id
  INTO STRICT v_book_id
  FROM public.accounting_books AS book
  WHERE book.organization_id = p_organization_id
    AND book.book_type = v_mapping.book_type
    AND book.currency = v_allocation.currency
    AND book.is_default
    AND book.archived_at IS NULL;

  v_description := CASE WHEN p_is_reversal
    THEN 'Reversal - ' || concat_ws(' - ', v_expense.vendor_label, v_expense.description)
    ELSE concat_ws(' - ', v_expense.vendor_label, v_expense.description)
  END;

  PERFORM app_private.set_financial_projection_context(true);

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
    v_allocation.property_id,
    v_allocation.unit_id,
    v_allocation.paid_date,
    CASE WHEN p_is_reversal THEN 'income' ELSE 'expense' END,
    CASE WHEN p_is_reversal
      THEN 'Expense reversal - ' || v_expense.category
      ELSE v_expense.category
    END,
    v_allocation.amount,
    v_allocation.currency,
    v_description,
    'payment_allocation',
    v_allocation.id,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO v_ledger_entry_id;

  v_lines := jsonb_build_array(
    jsonb_strip_nulls(
      jsonb_build_object(
        'account_system_code',
          CASE WHEN p_is_reversal
            THEN v_mapping.credit_system_code
            ELSE v_mapping.debit_system_code
          END,
        'description', v_description,
        'debit_amount', v_allocation.amount,
        'credit_amount', 0,
        'property_id', v_allocation.property_id,
        'unit_id', v_allocation.unit_id,
        'vendor_person_id', v_allocation.vendor_person_id_snapshot
      )
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'account_system_code',
          CASE WHEN p_is_reversal
            THEN v_mapping.debit_system_code
            ELSE v_mapping.credit_system_code
          END,
        'description', v_description,
        'debit_amount', 0,
        'credit_amount', v_allocation.amount,
        'property_id', v_allocation.property_id,
        'unit_id', v_allocation.unit_id,
        'vendor_person_id', v_allocation.vendor_person_id_snapshot
      )
    )
  );

  v_journal_entry_id := app_private.post_accounting_journal_internal(
    p_organization_id,
    v_book_id,
    'payment_allocation',
    v_allocation.id,
    CASE WHEN p_is_reversal THEN 'reversed' ELSE 'paid' END,
    v_allocation.paid_date,
    v_allocation.currency,
    v_description,
    v_expense.reference,
    v_lines,
    p_actor_id,
    v_ledger_entry_id
  );

  UPDATE public.ledger_entries
  SET accounting_journal_entry_id = v_journal_entry_id,
      updated_by = p_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_ledger_entry_id;

  UPDATE public.finance_payment_allocations
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_allocation.id;

  PERFORM app_private.set_financial_projection_context(false);

  RETURN jsonb_build_object(
    'ledger_entry_id', v_ledger_entry_id,
    'journal_entry_id', v_journal_entry_id
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_expense_payment_projection(
  uuid, uuid, uuid, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_expense(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_customer_category text,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_currency public.currency_code,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_reconciliation_source_id uuid,
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
  v_source_type text := lower(trim(coalesce(p_source_type, 'general')));
  v_category text := lower(trim(coalesce(p_customer_category, '')));
  v_vendor_label text := trim(coalesce(p_vendor_label, ''));
  v_responsibility text := lower(trim(coalesce(p_responsibility, '')));
  v_reference text := NULLIF(trim(coalesce(p_reference, '')), '');
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_markup numeric(14, 2) := coalesce(p_internal_markup_amount, 0);
  v_payload jsonb;
  v_payload_hash text;
  v_request_id uuid;
  v_is_replay boolean;
  v_replay_result jsonb;
  v_submission_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_submit_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_source_type <> 'general' OR p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'General expenses cannot claim an operational source'
      USING ERRCODE = '22023';
  END IF;

  IF p_expense_date IS NULL
    OR p_currency IS NULL
    OR p_internal_cost_amount IS NULL
    OR p_internal_cost_amount <= 0
    OR p_internal_cost_amount <> round(p_internal_cost_amount, 2)
    OR v_markup < 0
    OR v_markup <> round(v_markup, 2) THEN
    RAISE EXCEPTION 'Enter a date and exact positive cost with a non-negative markup'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_vendor_label) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Vendor must contain between 2 and 120 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_category NOT IN (
    'cleaning',
    'utility',
    'repairs_maintenance',
    'other'
  ) THEN
    RAISE EXCEPTION 'Choose Cleaning, Utility, Repairs and Maintenance, or Other'
      USING ERRCODE = '22023';
  END IF;

  IF v_responsibility NOT IN ('owner', 'tenant') THEN
    RAISE EXCEPTION 'Choose Owner or Tenant' USING ERRCODE = '22023';
  END IF;

  IF length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_reference IS NOT NULL AND length(v_reference) > 160 THEN
    RAISE EXCEPTION 'Reference must contain at most 160 characters'
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
    RAISE EXCEPTION 'Unit does not belong to property'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_reconciliation_sources AS source
    WHERE source.organization_id = p_organization_id
      AND source.id = p_reconciliation_source_id
      AND source.currency = p_currency
      AND source.archived_at IS NULL
      AND (
        source.scope_kind = 'organization_pooled'
        OR (
          source.scope_kind = 'property_dedicated'
          AND source.property_id = p_property_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Funding source does not belong to this property and currency'
      USING ERRCODE = '23503';
  END IF;

  IF p_vendor_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.people AS vendor
    WHERE vendor.organization_id = p_organization_id
      AND vendor.id = p_vendor_person_id
      AND vendor.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Vendor does not belong to organization'
      USING ERRCODE = '23503';
  END IF;

  IF p_supporting_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.organization_id = p_organization_id
      AND document.id = p_supporting_document_id
      AND document.archived_at IS NULL
      AND (
        document.property_id IS NULL
        OR document.property_id = p_property_id
      )
  ) THEN
    RAISE EXCEPTION 'Supporting receipt does not belong to property'
      USING ERRCODE = '23503';
  END IF;

  IF v_responsibility = 'tenant' THEN
    IF p_tenant_invoice_id IS NULL THEN
      RAISE EXCEPTION 'Choose the tenant invoice for this charge'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.id = p_tenant_invoice_id
        AND invoice.property_id = p_property_id
        AND invoice.currency = p_currency
        AND invoice.lifecycle = 'issued'
        AND (
          p_unit_id IS NULL
          OR invoice.unit_id IS NOT DISTINCT FROM p_unit_id
        )
    ) THEN
      RAISE EXCEPTION 'Tenant invoice does not belong to this property, unit, and currency'
        USING ERRCODE = '23503';
    END IF;
  ELSE
    IF p_tenant_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Owner expenses do not use a tenant invoice'
        USING ERRCODE = '22023';
    END IF;

    PERFORM app_private.resolve_property_owner(
      p_organization_id,
      p_property_id,
      p_expense_date
    );
  END IF;

  PERFORM app_private.lock_open_property_reporting_period(
    p_organization_id,
    p_property_id,
    p_currency,
    p_expense_date
  );

  v_payload := jsonb_build_object(
    'property_id', p_property_id,
    'unit_id', p_unit_id,
    'source_type', v_source_type,
    'source_id', p_source_id,
    'customer_category', v_category,
    'vendor_label', v_vendor_label,
    'expense_date', p_expense_date,
    'internal_cost_amount', p_internal_cost_amount,
    'internal_markup_amount', v_markup,
    'currency', p_currency,
    'responsibility', v_responsibility,
    'tenant_invoice_id', p_tenant_invoice_id,
    'reconciliation_source_id', p_reconciliation_source_id,
    'supporting_document_id', p_supporting_document_id,
    'vendor_person_id', p_vendor_person_id,
    'reference', v_reference
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  SELECT claim.request_id, claim.is_replay, claim.result_ids
  INTO STRICT v_request_id, v_is_replay, v_replay_result
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'submit_expense',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_is_replay THEN
    RETURN v_replay_result;
  END IF;

  INSERT INTO public.expense_submissions (
    organization_id,
    property_id,
    unit_id,
    source_type,
    source_id,
    customer_category,
    vendor_label,
    expense_date,
    internal_cost_amount,
    internal_markup_amount,
    currency,
    responsibility,
    tenant_invoice_id,
    reconciliation_source_id,
    supporting_document_id,
    vendor_person_id,
    reference,
    idempotency_key,
    request_payload_hash,
    submitted_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    v_source_type,
    p_source_id,
    v_category,
    v_vendor_label,
    p_expense_date,
    p_internal_cost_amount,
    v_markup,
    p_currency,
    v_responsibility,
    p_tenant_invoice_id,
    p_reconciliation_source_id,
    p_supporting_document_id,
    p_vendor_person_id,
    v_reference,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_submission_id;

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
    'expense_submission',
    v_submission_id,
    'submitted',
    v_payload
  );

  v_result := jsonb_build_object(
    'submission_id', v_submission_id,
    'status', 'submitted'
  );

  RETURN app_private.complete_financial_idempotency(
    v_request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.approve_expense_submission(
  p_organization_id uuid,
  p_submission_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.expense_submissions%ROWTYPE;
  v_customer_label text;
  v_expense_type text;
  v_income_type text;
  v_economic_scope text;
  v_owner_person_id uuid;
  v_responsible_person_id uuid;
  v_expense_id uuid;
  v_payment_id uuid;
  v_allocation_id uuid;
  v_responsibility_id uuid := gen_random_uuid();
  v_owner_line_id uuid;
  v_tenant_line_id uuid;
  v_income_item_id uuid;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_sort_order integer;
  v_projection jsonb;
  v_ledger_entry_id uuid;
  v_journal_entry_id uuid;
BEGIN
  SELECT submission.*
  INTO v_submission
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense submission not found' USING ERRCODE = '23503';
  END IF;

  IF v_submission.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted expense can be approved'
      USING ERRCODE = '22023';
  END IF;

  v_customer_label := CASE v_submission.customer_category
    WHEN 'cleaning' THEN 'Cleaning'
    WHEN 'utility' THEN 'Utility'
    WHEN 'repairs_maintenance' THEN 'Repairs and Maintenance'
    ELSE 'Other'
  END;
  v_expense_type := CASE v_submission.customer_category
    WHEN 'utility' THEN 'utilities'
    WHEN 'cleaning' THEN 'maintenance'
    WHEN 'repairs_maintenance' THEN 'maintenance'
    ELSE 'other'
  END;
  v_income_type := CASE WHEN v_submission.customer_category = 'utility'
    THEN 'utility_reimbursement'
    ELSE 'other'
  END;
  v_economic_scope := CASE WHEN v_submission.responsibility = 'owner'
    THEN 'property_expense'
    ELSE 'company_cost'
  END;

  IF v_submission.responsibility = 'tenant' THEN
    SELECT invoice.*
    INTO v_invoice
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = v_submission.tenant_invoice_id
      AND invoice.property_id = v_submission.property_id
      AND invoice.currency = v_submission.currency
      AND invoice.lifecycle = 'issued'
    FOR UPDATE;

    IF NOT FOUND
      OR (
        v_submission.unit_id IS NOT NULL
        AND v_invoice.unit_id IS DISTINCT FROM v_submission.unit_id
      ) THEN
      RAISE EXCEPTION 'Tenant invoice is no longer available for this expense'
        USING ERRCODE = '23503';
    END IF;

    v_responsible_person_id := v_invoice.recipient_person_id;
  ELSE
    v_owner_person_id := app_private.resolve_property_owner(
      p_organization_id,
      v_submission.property_id,
      v_submission.expense_date
    );
    v_responsible_person_id := v_owner_person_id;
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
    v_submission.property_id,
    v_submission.unit_id,
    CASE WHEN v_submission.source_type = 'maintenance_task'
      THEN v_submission.source_id
      ELSE NULL
    END,
    v_submission.vendor_person_id,
    v_expense_type,
    v_submission.vendor_label,
    v_submission.expense_date,
    v_submission.expense_date,
    v_submission.internal_cost_amount,
    v_submission.currency,
    v_customer_label,
    'approved',
    v_economic_scope,
    'not_billable',
    0,
    0,
    0,
    v_customer_label,
    v_submission.reference,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.finance_payments (
    organization_id,
    property_id,
    paid_date,
    amount,
    currency,
    payee_label,
    reference,
    reconciliation_source_id,
    created_by
  )
  VALUES (
    p_organization_id,
    v_submission.property_id,
    v_submission.expense_date,
    v_submission.internal_cost_amount,
    v_submission.currency,
    v_submission.vendor_label,
    v_submission.reference,
    v_submission.reconciliation_source_id,
    p_actor_id
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.finance_payment_allocations (
    organization_id,
    payment_id,
    expense_item_id,
    amount,
    created_by,
    property_id,
    unit_id,
    vendor_person_id_snapshot,
    currency,
    paid_date,
    reconciliation_source_id,
    economic_scope_snapshot,
    expense_type_snapshot,
    signed_amount,
    settlement_contract_version
  )
  VALUES (
    p_organization_id,
    v_payment_id,
    v_expense_id,
    v_submission.internal_cost_amount,
    p_actor_id,
    v_submission.property_id,
    v_submission.unit_id,
    v_submission.vendor_person_id,
    v_submission.currency,
    v_submission.expense_date,
    v_submission.reconciliation_source_id,
    v_economic_scope,
    v_expense_type,
    -v_submission.internal_cost_amount,
    'expense_approval.v1'
  )
  RETURNING id INTO v_allocation_id;

  v_projection := app_private.create_expense_payment_projection(
    p_organization_id,
    v_allocation_id,
    p_actor_id,
    false
  );
  v_ledger_entry_id := (v_projection->>'ledger_entry_id')::uuid;
  v_journal_entry_id := (v_projection->>'journal_entry_id')::uuid;

  UPDATE public.finance_expense_items
  SET ledger_entry_id = v_ledger_entry_id,
      updated_by = p_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_expense_id;

  PERFORM app_private.refresh_finance_expense_compatibility(
    v_expense_id,
    p_actor_id
  );

  IF v_submission.responsibility = 'owner' THEN
    v_owner_line_id := app_private.create_owner_invoice_line(
      p_organization_id,
      v_submission.property_id,
      v_owner_person_id,
      v_submission.expense_date,
      'owner_expense',
      v_responsibility_id,
      v_customer_label,
      v_submission.vendor_label,
      v_submission.customer_total_amount,
      p_actor_id
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
      v_submission.property_id,
      v_expense_id,
      'owner',
      v_responsible_person_id,
      v_submission.customer_category,
      v_customer_label,
      v_submission.internal_cost_amount,
      v_submission.internal_markup_amount,
      v_submission.customer_total_amount,
      0,
      v_submission.customer_total_amount,
      v_owner_line_id,
      v_submission.supporting_document_id,
      'expense-approval:' || v_submission.id::text,
      p_actor_id,
      p_actor_id
    );

    PERFORM app_private.apply_available_owner_cash(
      p_organization_id,
      v_submission.property_id,
      v_submission.expense_date,
      p_actor_id
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
      v_submission.property_id,
      v_invoice.unit_id,
      v_invoice.lease_id,
      v_income_type,
      v_invoice.recipient_person_id,
      v_invoice.recipient_label,
      v_invoice.due_date,
      v_submission.customer_total_amount,
      0,
      v_invoice.currency,
      'open',
      v_customer_label,
      v_submission.reference,
      p_actor_id,
      p_actor_id
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
      v_submission.customer_category,
      v_customer_label,
      v_submission.vendor_label,
      v_submission.customer_total_amount,
      v_submission.internal_cost_amount,
      v_submission.internal_markup_amount,
      v_sort_order,
      p_actor_id
    )
    RETURNING id INTO v_tenant_line_id;

    UPDATE public.tenant_invoices
    SET total_amount = total_amount + v_submission.customer_total_amount
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
      v_submission.property_id,
      v_expense_id,
      'tenant',
      v_responsible_person_id,
      v_submission.customer_category,
      v_customer_label,
      v_submission.internal_cost_amount,
      v_submission.internal_markup_amount,
      v_submission.customer_total_amount,
      0,
      v_submission.internal_cost_amount,
      v_tenant_line_id,
      v_submission.supporting_document_id,
      'expense-approval:' || v_submission.id::text,
      p_actor_id,
      p_actor_id
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
    p_actor_id,
    'expense_submission',
    v_submission.id,
    'approved',
    jsonb_build_object(
      'finance_expense_item_id', v_expense_id,
      'payment_id', v_payment_id,
      'payment_allocation_id', v_allocation_id,
      'responsibility_id', v_responsibility_id,
      'ledger_entry_id', v_ledger_entry_id,
      'journal_entry_id', v_journal_entry_id,
      'tenant_invoice_line_id', v_tenant_line_id,
      'owner_invoice_line_id', v_owner_line_id
    )
  );

  RETURN jsonb_build_object(
    'submission_id', v_submission.id,
    'status', 'approved',
    'finance_expense_item_id', v_expense_id,
    'payment_id', v_payment_id,
    'payment_allocation_id', v_allocation_id,
    'responsibility_id', v_responsibility_id,
    'ledger_entry_id', v_ledger_entry_id,
    'journal_entry_id', v_journal_entry_id,
    'tenant_invoice_line_id', v_tenant_line_id,
    'owner_invoice_line_id', v_owner_line_id
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.approve_expense_submission(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_expense(
  p_organization_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_snapshot public.expense_submissions%ROWTYPE;
  v_submission public.expense_submissions%ROWTYPE;
  v_payload jsonb;
  v_request_id uuid;
  v_is_replay boolean;
  v_replay_result jsonb;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_review_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Choose approve or reject' USING ERRCODE = '22023';
  END IF;

  IF v_decision = 'reject' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NOT NULL AND length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Review reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT submission.*
  INTO v_snapshot
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense submission not found' USING ERRCODE = '23503';
  END IF;

  IF v_decision = 'approve' THEN
    PERFORM app_private.lock_open_property_reporting_period(
      p_organization_id,
      v_snapshot.property_id,
      v_snapshot.currency,
      v_snapshot.expense_date
    );
  ELSE
    PERFORM app_private.lock_property_reporting_period(
      p_organization_id,
      v_snapshot.property_id,
      v_snapshot.currency,
      v_snapshot.expense_date
    );
  END IF;

  v_payload := jsonb_build_object(
    'submission_id', p_submission_id,
    'decision', v_decision,
    'reason', v_reason
  );

  SELECT claim.request_id, claim.is_replay, claim.result_ids
  INTO STRICT v_request_id, v_is_replay, v_replay_result
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'review_expense',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_is_replay THEN
    RETURN v_replay_result;
  END IF;

  SELECT submission.*
  INTO v_submission
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id
  FOR UPDATE;

  IF v_submission.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted expense can be reviewed'
      USING ERRCODE = '22023';
  END IF;

  IF to_jsonb(v_submission) - ARRAY['updated_at']::text[]
    IS DISTINCT FROM to_jsonb(v_snapshot) - ARRAY['updated_at']::text[] THEN
    RAISE EXCEPTION 'Expense submission changed during review'
      USING ERRCODE = '40001';
  END IF;

  IF v_decision = 'reject' THEN
    UPDATE public.expense_submissions
    SET status = 'rejected',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        review_reason = v_reason
    WHERE organization_id = p_organization_id
      AND id = p_submission_id;

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
      'expense_submission',
      p_submission_id,
      'rejected',
      jsonb_build_object('reason', v_reason)
    );

    v_result := jsonb_build_object(
      'submission_id', p_submission_id,
      'status', 'rejected'
    );
  ELSE
    v_result := app_private.approve_expense_submission(
      p_organization_id,
      p_submission_id,
      v_actor_id
    );

    UPDATE public.expense_submissions
    SET status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        review_reason = v_reason,
        approved_finance_expense_item_id =
          (v_result->>'finance_expense_item_id')::uuid,
        approved_payment_id = (v_result->>'payment_id')::uuid,
        approved_payment_allocation_id =
          (v_result->>'payment_allocation_id')::uuid,
        approved_responsibility_id =
          (v_result->>'responsibility_id')::uuid,
        approved_ledger_entry_id =
          (v_result->>'ledger_entry_id')::uuid,
        approved_journal_entry_id =
          (v_result->>'journal_entry_id')::uuid
    WHERE organization_id = p_organization_id
      AND id = p_submission_id;
  END IF;

  RETURN app_private.complete_financial_idempotency(
    v_request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.guard_reversed_owner_expense_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.reversal_of_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.owner_invoice_lines AS line
      JOIN public.expense_customer_adjustments AS adjustment
        ON adjustment.organization_id = line.organization_id
       AND adjustment.responsibility_id = line.source_id
       AND adjustment.responsibility = 'owner'
      WHERE line.organization_id = NEW.organization_id
        AND line.id = NEW.owner_invoice_line_id
        AND line.source_type = 'owner_expense'
    ) THEN
    RAISE EXCEPTION 'Reversed owner expense cannot receive held cash'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_reversed_owner_expense_allocation
BEFORE INSERT ON public.owner_charge_cash_allocations
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_reversed_owner_expense_allocation();

REVOKE ALL ON FUNCTION app_private.guard_reversed_owner_expense_allocation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_expense(
  p_organization_id uuid,
  p_submission_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_snapshot public.expense_submissions%ROWTYPE;
  v_submission public.expense_submissions%ROWTYPE;
  v_original_payment public.finance_payments%ROWTYPE;
  v_original_allocation public.finance_payment_allocations%ROWTYPE;
  v_responsibility public.ips_expense_responsibilities%ROWTYPE;
  v_owner_invoice_line public.owner_invoice_lines%ROWTYPE;
  v_tenant_invoice_line public.tenant_invoice_lines%ROWTYPE;
  v_payload jsonb;
  v_request_id uuid;
  v_is_replay boolean;
  v_replay_result jsonb;
  v_reversal_payment_id uuid;
  v_reversal_allocation_id uuid;
  v_projection jsonb;
  v_reversal_ledger_id uuid;
  v_reversal_journal_id uuid;
  v_adjustment_id uuid;
  v_result jsonb;
  v_held_allocation public.owner_charge_cash_allocations%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_reverse_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_reversal_date IS NULL THEN
    RAISE EXCEPTION 'Reversal date is required' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Reversal reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT submission.*
  INTO v_snapshot
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense submission not found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_open_property_reporting_period(
    p_organization_id,
    v_snapshot.property_id,
    v_snapshot.currency,
    p_reversal_date
  );

  v_payload := jsonb_build_object(
    'submission_id', p_submission_id,
    'reversal_date', p_reversal_date,
    'reason', v_reason
  );

  SELECT claim.request_id, claim.is_replay, claim.result_ids
  INTO STRICT v_request_id, v_is_replay, v_replay_result
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'reverse_expense',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_is_replay THEN
    RETURN v_replay_result;
  END IF;

  SELECT submission.*
  INTO v_submission
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id
  FOR UPDATE;

  IF v_submission.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved expense can be reversed'
      USING ERRCODE = '22023';
  END IF;

  IF to_jsonb(v_submission) - ARRAY['updated_at']::text[]
    IS DISTINCT FROM to_jsonb(v_snapshot) - ARRAY['updated_at']::text[] THEN
    RAISE EXCEPTION 'Expense submission changed during reversal'
      USING ERRCODE = '40001';
  END IF;

  SELECT payment.*
  INTO STRICT v_original_payment
  FROM public.finance_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = v_submission.approved_payment_id
  FOR UPDATE;

  SELECT allocation.*
  INTO STRICT v_original_allocation
  FROM public.finance_payment_allocations AS allocation
  WHERE allocation.organization_id = p_organization_id
    AND allocation.id = v_submission.approved_payment_allocation_id
    AND allocation.payment_id = v_original_payment.id
    AND allocation.expense_item_id =
      v_submission.approved_finance_expense_item_id
    AND allocation.settlement_contract_version = 'expense_approval.v1'
    AND allocation.reversal_of_allocation_id IS NULL
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.finance_payments AS reversal
    WHERE reversal.organization_id = p_organization_id
      AND reversal.reversal_of_id = v_original_payment.id
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_payment_allocations AS reversal_allocation
    WHERE reversal_allocation.organization_id = p_organization_id
      AND reversal_allocation.reversal_of_allocation_id =
        v_original_allocation.id
  ) THEN
    RAISE EXCEPTION 'Expense payment is already reversed'
      USING ERRCODE = '22023';
  END IF;

  SELECT responsibility.*
  INTO STRICT v_responsibility
  FROM public.ips_expense_responsibilities AS responsibility
  WHERE responsibility.organization_id = p_organization_id
    AND responsibility.id = v_submission.approved_responsibility_id
    AND responsibility.finance_expense_item_id =
      v_submission.approved_finance_expense_item_id
  FOR UPDATE;

  IF v_responsibility.responsibility = 'owner' THEN
    SELECT line.*
    INTO STRICT v_owner_invoice_line
    FROM public.owner_invoice_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.id = v_responsibility.owner_invoice_line_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.owner_payment_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_owner_invoice_line.id
    ) THEN
      RAISE EXCEPTION 'Owner payment already settled this charge; use a customer correction'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT line.*
    INTO STRICT v_tenant_invoice_line
    FROM public.tenant_invoice_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.id = v_responsibility.tenant_invoice_line_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoice_payment_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.invoice_line_id = v_tenant_invoice_line.id
    ) OR EXISTS (
      SELECT 1
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.invoice_line_id = v_tenant_invoice_line.id
    ) THEN
      RAISE EXCEPTION 'Tenant payment already settled this charge; use a customer correction'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.finance_payments (
    organization_id,
    property_id,
    paid_date,
    amount,
    currency,
    payee_label,
    reference,
    reversal_of_id,
    reconciliation_source_id,
    created_by
  )
  VALUES (
    p_organization_id,
    v_original_payment.property_id,
    p_reversal_date,
    v_original_payment.amount,
    v_original_payment.currency,
    v_original_payment.payee_label,
    v_reason,
    v_original_payment.id,
    v_original_payment.reconciliation_source_id,
    v_actor_id
  )
  RETURNING id INTO v_reversal_payment_id;

  INSERT INTO public.finance_payment_allocations (
    organization_id,
    payment_id,
    expense_item_id,
    amount,
    created_by,
    property_id,
    unit_id,
    vendor_person_id_snapshot,
    currency,
    paid_date,
    reconciliation_source_id,
    economic_scope_snapshot,
    expense_type_snapshot,
    signed_amount,
    settlement_contract_version,
    reversal_of_allocation_id
  )
  VALUES (
    p_organization_id,
    v_reversal_payment_id,
    v_original_allocation.expense_item_id,
    v_original_allocation.amount,
    v_actor_id,
    v_original_allocation.property_id,
    v_original_allocation.unit_id,
    v_original_allocation.vendor_person_id_snapshot,
    v_original_allocation.currency,
    p_reversal_date,
    v_original_allocation.reconciliation_source_id,
    v_original_allocation.economic_scope_snapshot,
    v_original_allocation.expense_type_snapshot,
    v_original_allocation.amount,
    'expense_approval.v1',
    v_original_allocation.id
  )
  RETURNING id INTO v_reversal_allocation_id;

  v_projection := app_private.create_expense_payment_projection(
    p_organization_id,
    v_reversal_allocation_id,
    v_actor_id,
    true
  );
  v_reversal_ledger_id := (v_projection->>'ledger_entry_id')::uuid;
  v_reversal_journal_id := (v_projection->>'journal_entry_id')::uuid;

  PERFORM app_private.refresh_finance_expense_compatibility(
    v_original_allocation.expense_item_id,
    v_actor_id
  );

  IF v_responsibility.responsibility = 'owner' THEN
    INSERT INTO public.expense_customer_adjustments (
      organization_id,
      submission_id,
      property_id,
      responsibility_id,
      responsibility,
      owner_invoice_id,
      adjustment_date,
      amount,
      currency,
      reason,
      created_by
    )
    VALUES (
      p_organization_id,
      v_submission.id,
      v_submission.property_id,
      v_responsibility.id,
      'owner',
      v_owner_invoice_line.invoice_id,
      p_reversal_date,
      -v_responsibility.customer_total_amount,
      v_submission.currency,
      v_reason,
      v_actor_id
    )
    RETURNING id INTO v_adjustment_id;

    FOR v_held_allocation IN
      SELECT allocation.*
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_owner_invoice_line.id
        AND allocation.reversal_of_id IS NULL
      ORDER BY allocation.created_at, allocation.id
      FOR UPDATE
    LOOP
      INSERT INTO public.owner_charge_cash_allocations (
        organization_id,
        property_id,
        owner_invoice_line_id,
        allocation_date,
        amount,
        reversal_of_id,
        created_by
      )
      VALUES (
        p_organization_id,
        v_held_allocation.property_id,
        v_held_allocation.owner_invoice_line_id,
        p_reversal_date,
        -v_held_allocation.amount,
        v_held_allocation.id,
        v_actor_id
      );
    END LOOP;
  ELSE
    INSERT INTO public.expense_customer_adjustments (
      organization_id,
      submission_id,
      property_id,
      responsibility_id,
      responsibility,
      tenant_invoice_id,
      tenant_income_item_id,
      adjustment_date,
      amount,
      currency,
      reason,
      created_by
    )
    VALUES (
      p_organization_id,
      v_submission.id,
      v_submission.property_id,
      v_responsibility.id,
      'tenant',
      v_tenant_invoice_line.invoice_id,
      v_tenant_invoice_line.income_item_id,
      p_reversal_date,
      -v_responsibility.customer_total_amount,
      v_submission.currency,
      v_reason,
      v_actor_id
    )
    RETURNING id INTO v_adjustment_id;

    UPDATE public.tenant_invoices
    SET total_amount = total_amount - v_responsibility.customer_total_amount
    WHERE organization_id = p_organization_id
      AND id = v_tenant_invoice_line.invoice_id
      AND total_amount >= v_responsibility.customer_total_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant invoice cannot accept this exact reversal'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.finance_income_items
    SET status = 'void',
        updated_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_tenant_invoice_line.income_item_id
      AND amount_received = 0
      AND status = 'open';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant charge can no longer be reversed exactly'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.expense_submissions
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_actor_id,
      reversal_reason = v_reason,
      reversal_payment_id = v_reversal_payment_id,
      reversal_payment_allocation_id = v_reversal_allocation_id,
      reversal_ledger_entry_id = v_reversal_ledger_id,
      reversal_journal_entry_id = v_reversal_journal_id
  WHERE organization_id = p_organization_id
    AND id = v_submission.id;

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
    v_actor_id,
    'expense_submission',
    v_submission.id,
    'reversed',
    jsonb_build_object('status', 'approved'),
    jsonb_build_object(
      'status', 'reversed',
      'reason', v_reason,
      'payment_id', v_reversal_payment_id,
      'payment_allocation_id', v_reversal_allocation_id,
      'ledger_entry_id', v_reversal_ledger_id,
      'journal_entry_id', v_reversal_journal_id,
      'customer_adjustment_id', v_adjustment_id
    )
  );

  v_result := jsonb_build_object(
    'submission_id', v_submission.id,
    'status', 'reversed',
    'payment_id', v_reversal_payment_id,
    'payment_allocation_id', v_reversal_allocation_id,
    'ledger_entry_id', v_reversal_ledger_id,
    'journal_entry_id', v_reversal_journal_id,
    'customer_adjustment_id', v_adjustment_id
  );

  RETURN app_private.complete_financial_idempotency(
    v_request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

CREATE OR REPLACE VIEW public.owner_invoice_balances
WITH (security_invoker = true)
AS
WITH line_totals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(line.amount)::numeric(14, 2) AS total_amount
  FROM public.owner_invoice_lines AS line
  GROUP BY line.organization_id, line.invoice_id
), adjustment_totals AS (
  SELECT
    adjustment.organization_id,
    adjustment.owner_invoice_id AS invoice_id,
    sum(adjustment.amount)::numeric(14, 2) AS total_amount
  FROM public.expense_customer_adjustments AS adjustment
  WHERE adjustment.owner_invoice_id IS NOT NULL
  GROUP BY adjustment.organization_id, adjustment.owner_invoice_id
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
), owner_payment_totals AS (
  SELECT
    allocation.organization_id,
    allocation.owner_invoice_id AS invoice_id,
    sum(allocation.amount)::numeric(14, 2) AS paid_by_owner
  FROM public.owner_payment_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.owner_invoice_id
), totals AS (
  SELECT
    invoice.organization_id,
    invoice.id AS invoice_id,
    (
      coalesce(line_totals.total_amount, 0)
      + coalesce(adjustment_totals.total_amount, 0)
    )::numeric(14, 2) AS total_amount,
    coalesce(cash_totals.paid_from_held_cash, 0)::numeric(14, 2)
      AS paid_from_held_cash,
    coalesce(owner_payment_totals.paid_by_owner, 0)::numeric(14, 2)
      AS paid_by_owner
  FROM public.owner_invoices AS invoice
  LEFT JOIN line_totals
    ON line_totals.organization_id = invoice.organization_id
   AND line_totals.invoice_id = invoice.id
  LEFT JOIN adjustment_totals
    ON adjustment_totals.organization_id = invoice.organization_id
   AND adjustment_totals.invoice_id = invoice.id
  LEFT JOIN cash_totals
    ON cash_totals.organization_id = invoice.organization_id
   AND cash_totals.invoice_id = invoice.id
  LEFT JOIN owner_payment_totals
    ON owner_payment_totals.organization_id = invoice.organization_id
   AND owner_payment_totals.invoice_id = invoice.id
)
SELECT
  invoice.id,
  invoice.organization_id,
  invoice.property_id,
  invoice.owner_person_id,
  invoice.invoice_number,
  invoice.billing_period_start,
  invoice.issue_date,
  invoice.due_date,
  invoice.currency,
  invoice.lifecycle,
  invoice.idempotency_key,
  invoice.voided_at,
  invoice.voided_by,
  invoice.created_at,
  invoice.created_by,
  totals.total_amount,
  totals.paid_from_held_cash,
  totals.paid_by_owner,
  greatest(
    totals.total_amount
      - totals.paid_from_held_cash
      - totals.paid_by_owner,
    0
  )::numeric(14, 2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN totals.total_amount <= 0 THEN 'paid'
    WHEN totals.paid_from_held_cash + totals.paid_by_owner <= 0
      THEN 'unpaid'
    WHEN totals.paid_from_held_cash + totals.paid_by_owner
      >= totals.total_amount THEN 'paid'
    ELSE 'partly_paid'
  END AS payment_status
FROM public.owner_invoices AS invoice
JOIN totals
  ON totals.organization_id = invoice.organization_id
 AND totals.invoice_id = invoice.id;

CREATE OR REPLACE VIEW public.property_account_entries
WITH (security_invoker = true)
AS
WITH events AS (
  SELECT
    allocation.organization_id,
    invoice.property_id,
    invoice.unit_id,
    invoice.lease_id,
    payment.received_date AS event_date,
    'rent_income'::text AS category,
    'Rent'::text AS label,
    'Collected by IPS'::text AS note,
    allocation.amount::numeric(14, 2) AS amount,
    allocation.amount::numeric(14, 2) AS balance_effect,
    'tenant_invoice_payment'::text AS source_type,
    allocation.id AS source_id,
    allocation.created_at
  FROM public.tenant_invoice_payment_allocations AS allocation
  JOIN public.tenant_invoice_payments AS payment
    ON payment.organization_id = allocation.organization_id
   AND payment.id = allocation.payment_id
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = allocation.organization_id
   AND line.id = allocation.invoice_line_id
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.invoice_id
  JOIN public.finance_receipts AS receipt
    ON receipt.organization_id = allocation.organization_id
   AND receipt.id = allocation.finance_receipt_id
  WHERE line.line_type = 'rent'
    AND receipt.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = receipt.organization_id
        AND reversal.reversal_of_id = receipt.id
    )

  UNION ALL

  SELECT
    allocation.organization_id,
    invoice.property_id,
    invoice.unit_id,
    invoice.lease_id,
    confirmation.confirmed_date,
    'rent_income',
    'Rent',
    'Collected by owner',
    allocation.amount::numeric(14, 2),
    allocation.amount::numeric(14, 2),
    'owner_collection_confirmation',
    allocation.id,
    allocation.created_at
  FROM public.owner_collection_confirmation_allocations AS allocation
  JOIN public.owner_collection_confirmations AS confirmation
    ON confirmation.organization_id = allocation.organization_id
   AND confirmation.id = allocation.confirmation_id
  JOIN public.tenant_invoice_lines AS line
    ON line.organization_id = allocation.organization_id
   AND line.id = allocation.invoice_line_id
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.invoice_id
  WHERE line.line_type = 'rent'

  UNION ALL

  SELECT
    fee.organization_id,
    fee.property_id,
    invoice.unit_id,
    fee.lease_id,
    fee.fee_date,
    'management_fee_expense',
    'Management fee',
    NULL::text,
    fee.amount::numeric(14, 2),
    -fee.amount::numeric(14, 2),
    'management_fee_occurrence',
    fee.id,
    fee.created_at
  FROM public.management_fee_occurrences AS fee
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id = fee.organization_id
   AND invoice.id = fee.tenant_invoice_id

  UNION ALL

  SELECT
    responsibility.organization_id,
    responsibility.property_id,
    expense.unit_id,
    NULL::uuid,
    expense.invoice_date,
    'owner_expense',
    responsibility.customer_label,
    expense.vendor_label,
    responsibility.customer_total_amount::numeric(14, 2),
    -responsibility.customer_total_amount::numeric(14, 2),
    'ips_expense_responsibility',
    responsibility.id,
    responsibility.created_at
  FROM public.ips_expense_responsibilities AS responsibility
  JOIN public.finance_expense_items AS expense
    ON expense.organization_id = responsibility.organization_id
   AND expense.id = responsibility.finance_expense_item_id
  WHERE responsibility.responsibility = 'owner'

  UNION ALL

  SELECT
    adjustment.organization_id,
    adjustment.property_id,
    expense.unit_id,
    NULL::uuid,
    adjustment.adjustment_date,
    'owner_expense_reversal',
    'Expense reversal',
    adjustment.reason,
    adjustment.amount::numeric(14, 2),
    -adjustment.amount::numeric(14, 2),
    'expense_customer_adjustment',
    adjustment.id,
    adjustment.created_at
  FROM public.expense_customer_adjustments AS adjustment
  JOIN public.expense_submissions AS submission
    ON submission.organization_id = adjustment.organization_id
   AND submission.id = adjustment.submission_id
  JOIN public.finance_expense_items AS expense
    ON expense.organization_id = submission.organization_id
   AND expense.id = submission.approved_finance_expense_item_id
  WHERE adjustment.responsibility = 'owner'

  UNION ALL

  SELECT
    withdrawal.organization_id,
    withdrawal.property_id,
    NULL::uuid,
    NULL::uuid,
    withdrawal.withdrawal_date,
    'withdrawal',
    'Owner withdrawal',
    withdrawal.reference,
    withdrawal.amount::numeric(14, 2),
    -withdrawal.amount::numeric(14, 2),
    'property_withdrawal',
    withdrawal.id,
    withdrawal.created_at
  FROM public.property_withdrawals AS withdrawal
)
SELECT
  event.organization_id,
  event.property_id,
  event.unit_id,
  event.lease_id,
  event.event_date,
  event.category,
  event.label,
  event.note,
  event.amount,
  event.balance_effect,
  sum(event.balance_effect) OVER (
    PARTITION BY event.organization_id, event.property_id
    ORDER BY
      event.event_date,
      event.created_at,
      event.source_type,
      event.source_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )::numeric(14, 2) AS running_balance,
  event.source_type,
  event.source_id,
  event.created_at
FROM events AS event;

CREATE OR REPLACE VIEW public.property_finance_positions
WITH (security_invoker = true)
AS
WITH current_owner AS (
  SELECT
    owner_link.organization_id,
    owner_link.property_id,
    owner_link.person_id AS owner_person_id
  FROM public.property_owners AS owner_link
  WHERE owner_link.is_primary
    AND owner_link.archived_at IS NULL
    AND (owner_link.started_on IS NULL OR owner_link.started_on <= current_date)
    AND (owner_link.ended_on IS NULL OR owner_link.ended_on >= current_date)
), rent_income AS (
  SELECT
    entry.organization_id,
    entry.property_id,
    sum(entry.amount)::numeric(14, 2) AS amount
  FROM public.property_account_entries AS entry
  WHERE entry.category = 'rent_income'
  GROUP BY entry.organization_id, entry.property_id
), fee_expense AS (
  SELECT
    fee.organization_id,
    fee.property_id,
    sum(fee.amount)::numeric(14, 2) AS amount
  FROM public.management_fee_occurrences AS fee
  GROUP BY fee.organization_id, fee.property_id
), owner_expense AS (
  SELECT
    effect.organization_id,
    effect.property_id,
    sum(effect.amount)::numeric(14, 2) AS amount
  FROM (
    SELECT
      responsibility.organization_id,
      responsibility.property_id,
      responsibility.customer_total_amount AS amount
    FROM public.ips_expense_responsibilities AS responsibility
    WHERE responsibility.responsibility = 'owner'

    UNION ALL

    SELECT
      adjustment.organization_id,
      adjustment.property_id,
      adjustment.amount
    FROM public.expense_customer_adjustments AS adjustment
    WHERE adjustment.responsibility = 'owner'
  ) AS effect
  GROUP BY effect.organization_id, effect.property_id
), withdrawal_total AS (
  SELECT
    withdrawal.organization_id,
    withdrawal.property_id,
    sum(withdrawal.amount)::numeric(14, 2) AS amount
  FROM public.property_withdrawals AS withdrawal
  GROUP BY withdrawal.organization_id, withdrawal.property_id
), ips_rent_cash AS (
  SELECT
    invoice.organization_id,
    invoice.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
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
  WHERE line.line_type = 'rent'
    AND receipt.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = receipt.organization_id
        AND reversal.reversal_of_id = receipt.id
    )
  GROUP BY invoice.organization_id, invoice.property_id
), charge_cash AS (
  SELECT
    allocation.organization_id,
    allocation.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.owner_charge_cash_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.property_id
), owner_charge_total AS (
  SELECT
    charge.organization_id,
    charge.property_id,
    sum(charge.amount)::numeric(14, 2) AS amount
  FROM (
    SELECT
      line.organization_id,
      line.property_id,
      line.amount
    FROM public.owner_invoice_lines AS line

    UNION ALL

    SELECT
      adjustment.organization_id,
      adjustment.property_id,
      adjustment.amount
    FROM public.expense_customer_adjustments AS adjustment
    WHERE adjustment.responsibility = 'owner'
  ) AS charge
  GROUP BY charge.organization_id, charge.property_id
), owner_paid AS (
  SELECT
    invoice.organization_id,
    invoice.property_id,
    sum(allocation.amount)::numeric(14, 2) AS amount
  FROM public.owner_payment_allocations AS allocation
  JOIN public.owner_invoices AS invoice
    ON invoice.organization_id = allocation.organization_id
   AND invoice.id = allocation.owner_invoice_id
  GROUP BY invoice.organization_id, invoice.property_id
)
SELECT
  property.organization_id,
  property.id AS property_id,
  property.code AS property_code,
  property.name AS property_name,
  current_owner.owner_person_id,
  'USD'::public.currency_code AS currency,
  coalesce(rent_income.amount, 0)::numeric(14, 2) AS rent_income,
  coalesce(fee_expense.amount, 0)::numeric(14, 2)
    AS management_fee_expense,
  coalesce(owner_expense.amount, 0)::numeric(14, 2) AS owner_expense,
  coalesce(withdrawal_total.amount, 0)::numeric(14, 2) AS withdrawals,
  (
    coalesce(rent_income.amount, 0)
      - coalesce(fee_expense.amount, 0)
      - coalesce(owner_expense.amount, 0)
      - coalesce(withdrawal_total.amount, 0)
  )::numeric(14, 2) AS running_balance,
  greatest(
    coalesce(ips_rent_cash.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(withdrawal_total.amount, 0),
    0
  )::numeric(14, 2) AS cash_held_by_ips,
  greatest(
    coalesce(owner_charge_total.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(owner_paid.amount, 0),
    0
  )::numeric(14, 2) AS owner_owes_ips,
  greatest(
    coalesce(ips_rent_cash.amount, 0)
      - coalesce(charge_cash.amount, 0)
      - coalesce(withdrawal_total.amount, 0),
    0
  )::numeric(14, 2) AS available_withdrawal
FROM public.properties AS property
LEFT JOIN current_owner
  ON current_owner.organization_id = property.organization_id
 AND current_owner.property_id = property.id
LEFT JOIN rent_income
  ON rent_income.organization_id = property.organization_id
 AND rent_income.property_id = property.id
LEFT JOIN fee_expense
  ON fee_expense.organization_id = property.organization_id
 AND fee_expense.property_id = property.id
LEFT JOIN owner_expense
  ON owner_expense.organization_id = property.organization_id
 AND owner_expense.property_id = property.id
LEFT JOIN withdrawal_total
  ON withdrawal_total.organization_id = property.organization_id
 AND withdrawal_total.property_id = property.id
LEFT JOIN ips_rent_cash
  ON ips_rent_cash.organization_id = property.organization_id
 AND ips_rent_cash.property_id = property.id
LEFT JOIN charge_cash
  ON charge_cash.organization_id = property.organization_id
 AND charge_cash.property_id = property.id
LEFT JOIN owner_charge_total
  ON owner_charge_total.organization_id = property.organization_id
 AND owner_charge_total.property_id = property.id
LEFT JOIN owner_paid
  ON owner_paid.organization_id = property.organization_id
 AND owner_paid.property_id = property.id
WHERE property.archived_at IS NULL;

REVOKE ALL ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_expense(uuid, uuid, text, text, text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_expense(uuid, uuid, date, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_expense(uuid, uuid, text, text, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_expense(uuid, uuid, date, text, text)
TO authenticated;

-- Existing records remain readable and reversible through the new boundary,
-- but no authenticated caller can create an already-paid expense directly.
REVOKE EXECUTE ON FUNCTION public.record_ips_paid_expense(
  uuid, uuid, uuid, text, text, date, numeric, numeric, text, uuid, uuid,
  uuid, text, text
) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_finance_expense_item(
  uuid, uuid, uuid, uuid, uuid, text, text, date, date, numeric, text, text,
  text, text, text, numeric, numeric, numeric
) FROM authenticated, service_role;

COMMENT ON TABLE public.expense_submissions IS
  'Immutable paid-cost evidence awaiting Finance review. No financial effect exists before approval.';
COMMENT ON TABLE public.expense_customer_adjustments IS
  'Append-only customer-side correction created by an exact approved-expense reversal.';
COMMENT ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) IS
  'Finance Member or Super Admin submits paid-cost evidence without creating financial effects.';
COMMENT ON FUNCTION public.review_expense(uuid, uuid, text, text, text) IS
  'Finance Manager or Super Admin approves or rejects one immutable expense submission.';
COMMENT ON FUNCTION public.reverse_expense(uuid, uuid, date, text, text) IS
  'Super Admin appends exact payment, Ledger, journal, and customer reversal evidence.';
