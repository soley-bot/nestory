-- Parent-level authority for one paid expense with one or more property lines.
-- Existing expense_submissions remain the immutable financial child records so
-- Ledger, P&L, owner balance, reversal, and historical single-line behavior
-- continue through their established boundaries.

CREATE TABLE public.expense_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payee_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  external_payee_label text,
  payee_label text NOT NULL,
  expense_date date NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reconciliation_source_id uuid NOT NULL
    REFERENCES public.financial_reconciliation_sources(id) ON DELETE RESTRICT,
  supporting_document_id uuid NOT NULL
    REFERENCES public.documents(id) ON DELETE RESTRICT,
  reference text,
  responsibility text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'submitted',
  idempotency_key text NOT NULL,
  request_payload_hash text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_reason text,
  review_idempotency_key text,
  review_payload_hash text,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reversal_reason text,
  reversal_idempotency_key text,
  reversal_payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_transactions_payee_check CHECK (
    (payee_person_id IS NOT NULL AND external_payee_label IS NULL)
    OR (payee_person_id IS NULL AND external_payee_label IS NOT NULL)
  ),
  CONSTRAINT expense_transactions_external_payee_check CHECK (
    external_payee_label IS NULL
    OR length(btrim(external_payee_label)) BETWEEN 2 AND 120
  ),
  CONSTRAINT expense_transactions_payee_label_check CHECK (
    length(btrim(payee_label)) BETWEEN 2 AND 120
  ),
  CONSTRAINT expense_transactions_reference_check CHECK (
    reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 160
  ),
  CONSTRAINT expense_transactions_responsibility_check CHECK (
    responsibility IN ('owner', 'tenant')
  ),
  CONSTRAINT expense_transactions_status_check CHECK (
    status IN ('submitted', 'approved', 'rejected', 'reversed')
  ),
  CONSTRAINT expense_transactions_idempotency_check CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  CONSTRAINT expense_transactions_payload_hash_check CHECK (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT expense_transactions_review_check CHECK (
    (
      status = 'submitted'
      AND reviewed_at IS NULL
      AND reviewed_by IS NULL
      AND review_reason IS NULL
      AND review_idempotency_key IS NULL
      AND review_payload_hash IS NULL
    ) OR (
      status IN ('approved', 'rejected', 'reversed')
      AND reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND review_idempotency_key IS NOT NULL
      AND review_payload_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT expense_transactions_reversal_check CHECK (
    (
      status <> 'reversed'
      AND reversed_at IS NULL
      AND reversed_by IS NULL
      AND reversal_reason IS NULL
      AND reversal_idempotency_key IS NULL
      AND reversal_payload_hash IS NULL
    ) OR (
      status = 'reversed'
      AND reversed_at IS NOT NULL
      AND reversed_by IS NOT NULL
      AND length(btrim(reversal_reason)) BETWEEN 3 AND 500
      AND reversal_idempotency_key IS NOT NULL
      AND reversal_payload_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE public.expense_transaction_scopes (
  organization_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  property_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, property_id),
  FOREIGN KEY (organization_id, transaction_id)
    REFERENCES public.expense_transactions(organization_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.expense_transaction_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  sort_order integer NOT NULL,
  description text NOT NULL,
  owner_cash_amount numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, transaction_id)
    REFERENCES public.expense_transactions(organization_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submission_id)
    REFERENCES public.expense_submissions(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_transaction_lines_sort_check CHECK (sort_order > 0),
  CONSTRAINT expense_transaction_lines_description_check CHECK (
    length(btrim(description)) BETWEEN 2 AND 500
  ),
  CONSTRAINT expense_transaction_lines_owner_cash_check CHECK (
    owner_cash_amount IS NULL
    OR (
      owner_cash_amount >= 0
      AND owner_cash_amount = round(owner_cash_amount, 2)
    )
  ),
  UNIQUE (transaction_id, sort_order),
  UNIQUE (submission_id)
);

CREATE INDEX expense_transactions_org_status_submitted_idx
  ON public.expense_transactions(organization_id, status, submitted_at DESC);
CREATE INDEX expense_transaction_scopes_org_property_idx
  ON public.expense_transaction_scopes(organization_id, property_id, transaction_id);
CREATE INDEX expense_transaction_lines_org_transaction_idx
  ON public.expense_transaction_lines(organization_id, transaction_id, sort_order);

ALTER TABLE public.expense_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_transaction_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_transaction_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_private.can_read_expense_transaction(
  p_organization_id uuid,
  p_transaction_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_transactions AS transaction
    WHERE transaction.organization_id = p_organization_id
      AND transaction.id = p_transaction_id
      AND EXISTS (
        SELECT 1
        FROM public.expense_transaction_scopes AS scope
        WHERE scope.organization_id = transaction.organization_id
          AND scope.transaction_id = transaction.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_transaction_scopes AS scope
        WHERE scope.organization_id = transaction.organization_id
          AND scope.transaction_id = transaction.id
          AND NOT app_private.can_read_finance_property(
            scope.organization_id,
            scope.property_id
          )
      )
  );
$$;

CREATE POLICY expense_transactions_select
  ON public.expense_transactions
  FOR SELECT TO authenticated
  USING (app_private.can_read_expense_transaction(organization_id, id));

CREATE POLICY expense_transaction_scopes_select
  ON public.expense_transaction_scopes
  FOR SELECT TO authenticated
  USING (app_private.can_read_finance_property(organization_id, property_id));

CREATE POLICY expense_transaction_lines_select
  ON public.expense_transaction_lines
  FOR SELECT TO authenticated
  USING (app_private.can_read_expense_transaction(organization_id, transaction_id));

REVOKE ALL ON TABLE public.expense_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_transaction_scopes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_transaction_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_transactions TO authenticated;
GRANT SELECT ON TABLE public.expense_transaction_scopes TO authenticated;
GRANT SELECT ON TABLE public.expense_transaction_lines TO authenticated;

REVOKE ALL ON FUNCTION app_private.can_read_expense_transaction(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.expense_transactions IS
  'Maker-checker parent record for common paid-expense facts; financial effects remain in linked expense_submissions.';
COMMENT ON TABLE public.expense_transaction_lines IS
  'Ordered descriptions and optional exact owner-cash instructions linked to immutable expense submissions.';

CREATE OR REPLACE FUNCTION app_private.assert_paid_cost_evidence_eligible(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_submitting_actor_id uuid,
  p_submission_idempotency_key text,
  p_submission_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_key text := pg_catalog.btrim(coalesce(p_submission_idempotency_key, ''));
  v_transaction_setting text := current_setting(
    'app.expense_transaction_id',
    true
  );
  v_transaction_id uuid;
BEGIN
  IF coalesce(v_transaction_setting, '') ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_transaction_id := v_transaction_setting::uuid;
  END IF;

  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_document_id IS NULL
    OR p_submitting_actor_id IS NULL
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'paid_cost_evidence_use_v1',
        p_organization_id,
        p_document_id
      ),
      0
    )
  );

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.organization_id = p_organization_id
    AND document.id = p_document_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR (
      v_document.property_id IS DISTINCT FROM p_property_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_transactions AS transaction
        JOIN public.expense_transaction_scopes AS document_scope
          ON document_scope.organization_id = transaction.organization_id
         AND document_scope.transaction_id = transaction.id
         AND document_scope.property_id = v_document.property_id
        JOIN public.expense_transaction_scopes AS requested_scope
          ON requested_scope.organization_id = transaction.organization_id
         AND requested_scope.transaction_id = transaction.id
         AND requested_scope.property_id = p_property_id
        WHERE transaction.organization_id = p_organization_id
          AND transaction.id = v_transaction_id
          AND transaction.supporting_document_id = p_document_id
          AND transaction.submitted_by = p_submitting_actor_id
      )
    )
    OR v_document.category IS DISTINCT FROM 'Paid cost evidence'
    OR v_document.archived_at IS NOT NULL
    OR v_document.uploaded_by IS DISTINCT FROM p_submitting_actor_id
    OR v_document.storage_path NOT LIKE
      p_organization_id::text || '/paid-cost-evidence/%'
    OR app_private.storage_object_org_id(v_document.storage_path)
      IS DISTINCT FROM p_organization_id
    OR v_document.mime_type NOT IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
    OR v_document.size_bytes NOT BETWEEN 1 AND 10485760
    OR v_document.content_sha256 IS NULL
    OR v_document.content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_document.storage_path
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_object.metadata->>'mimetype' IS DISTINCT FROM v_document.mime_type
    OR (CASE
      WHEN coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (v_object.metadata->>'size')::bigint
      ELSE NULL
    END) IS DISTINCT FROM v_document.size_bytes THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    WHERE activity.organization_id = p_organization_id
      AND activity.actor_id = p_submitting_actor_id
      AND activity.entity_type = 'document'
      AND activity.entity_id = p_document_id
      AND activity.action = 'paid_cost_evidence_registered'
      AND activity.new_values->>'property_id' = v_document.property_id::text
      AND activity.new_values->>'storage_path' = v_document.storage_path
      AND activity.new_values->>'content_sha256' = v_document.content_sha256
      AND activity.new_values->>'size_bytes' = v_document.size_bytes::text
      AND activity.new_values->>'content_type' = v_document.mime_type
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.source_type = 'general'
      AND submission.supporting_document_id = p_document_id
      AND (
        p_submission_id IS NULL
        AND (
          submission.submitted_by IS DISTINCT FROM p_submitting_actor_id
          OR submission.idempotency_key IS DISTINCT FROM v_key
        )
        OR p_submission_id IS NOT NULL
        AND submission.id IS DISTINCT FROM p_submission_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_transaction_lines AS line
        WHERE line.organization_id = submission.organization_id
          AND line.submission_id = submission.id
          AND line.transaction_id = v_transaction_id
      )
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_already_used'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.apply_available_owner_cash(
  p_organization_id uuid,
  p_property_id uuid,
  p_allocation_date date,
  p_actor_id uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_available numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_after_outstanding numeric(14, 2);
  v_apply_amount numeric(14, 2);
  v_total_applied numeric(14, 2) := 0;
  v_line record;
  v_transaction_setting text := current_setting(
    'app.expense_transaction_id',
    true
  );
  v_transaction_id uuid;
BEGIN
  IF coalesce(v_transaction_setting, '') ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_transaction_id := v_transaction_setting::uuid;
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    'USD'::public.currency_code,
    p_allocation_date
  );

  FOR v_line IN
    SELECT DISTINCT invoice.owner_person_id
    FROM public.owner_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.property_id = p_property_id
      AND invoice.lifecycle = 'issued'
    ORDER BY invoice.owner_person_id
  LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id,
      p_property_id,
      v_line.owner_person_id,
      'USD'::public.currency_code
    );
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_property_id::text || ':owner-cash',
      0
    )
  );

  IF current_setting('app.expense_owner_cash_mode', true) = 'explicit' THEN
    RETURN 0;
  END IF;

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
      app_private.owner_invoice_line_outstanding(
        line.organization_id,
        line.id
      ) AS outstanding,
      coalesce((
        SELECT sum(allocation.amount)
        FROM public.owner_charge_cash_allocations AS allocation
        WHERE allocation.organization_id = line.organization_id
          AND allocation.owner_invoice_line_id = line.id
      ), 0)::numeric(14, 2) AS cash_allocated,
      coalesce((
        SELECT sum(allocation.amount)
        FROM public.owner_payment_allocations AS allocation
        WHERE allocation.organization_id = line.organization_id
          AND allocation.owner_invoice_line_id = line.id
      ), 0)::numeric(14, 2) AS owner_paid
    FROM public.owner_invoice_lines AS line
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND invoice.lifecycle = 'issued'
      AND app_private.owner_invoice_line_outstanding(
        line.organization_id,
        line.id
      ) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_transaction_lines AS transaction_line
        WHERE transaction_line.organization_id = line.organization_id
          AND transaction_line.transaction_id = v_transaction_id
          AND transaction_line.owner_cash_amount IS NOT NULL
          AND line.source_type = 'owner_expense'
          AND line.source_id = (
            SELECT responsibility.id
            FROM public.ips_expense_responsibilities AS responsibility
            WHERE responsibility.organization_id = line.organization_id
              AND responsibility.owner_invoice_line_id = line.id
              AND responsibility.idempotency_key =
                'expense-approval:' || transaction_line.submission_id::text
          )
      )
    ORDER BY invoice.issue_date, line.sort_order, line.id
  LOOP
    EXIT WHEN v_available <= 0;
    v_outstanding := v_line.outstanding::numeric(14, 2);
    CONTINUE WHEN v_outstanding <= 0;
    v_apply_amount := least(v_available, v_outstanding)::numeric(14, 2);

    INSERT INTO public.owner_charge_cash_allocations (
      organization_id,
      property_id,
      owner_invoice_line_id,
      allocation_date,
      amount,
      created_by
    ) VALUES (
      p_organization_id,
      p_property_id,
      v_line.id,
      p_allocation_date,
      v_apply_amount,
      p_actor_id
    );

    v_available := (v_available - v_apply_amount)::numeric(14, 2);
    v_total_applied := (v_total_applied + v_apply_amount)::numeric(14, 2);
    v_after_outstanding := app_private.owner_invoice_line_outstanding(
      p_organization_id,
      v_line.id
    );

    IF v_line.source_type = 'management_fee' THEN
      UPDATE public.management_fee_occurrences AS fee
      SET settlement_status = CASE
        WHEN v_after_outstanding <= 0 AND v_line.owner_paid > 0 THEN 'settled'
        WHEN v_after_outstanding <= 0 THEN 'held_cash'
        ELSE 'split'
      END
      WHERE fee.organization_id = p_organization_id
        AND fee.id = v_line.source_id;
    ELSIF v_line.source_type = 'owner_expense' THEN
      UPDATE public.ips_expense_responsibilities AS responsibility
      SET held_cash_amount = least(
            responsibility.customer_total_amount,
            v_line.cash_allocated + v_apply_amount
          ),
          ips_advance_amount = greatest(v_after_outstanding, 0),
          updated_by = p_actor_id
      WHERE responsibility.organization_id = p_organization_id
        AND responsibility.id = v_line.source_id;
    END IF;
  END LOOP;

  RETURN v_total_applied;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.apply_owner_cash_to_expense_line(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_invoice_line_id uuid,
  p_amount numeric,
  p_allocation_date date,
  p_actor_id uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_available numeric(14,2);
  v_cash_allocated numeric(14,2);
  v_currency public.currency_code;
  v_owner_person_id uuid;
  v_outstanding numeric(14,2);
  v_after_outstanding numeric(14,2);
  v_responsibility_id uuid;
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_owner_invoice_line_id IS NULL
    OR p_amount IS NULL
    OR p_amount < 0
    OR p_amount <> round(p_amount, 2)
    OR p_allocation_date IS NULL
    OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Owner cash amount is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT invoice.owner_person_id, invoice.currency
  INTO v_owner_person_id, v_currency
  FROM public.owner_invoice_lines AS line
  JOIN public.owner_invoices AS invoice
    ON invoice.organization_id = line.organization_id
   AND invoice.id = line.invoice_id
  WHERE line.organization_id = p_organization_id
    AND line.property_id = p_property_id
    AND line.id = p_owner_invoice_line_id
    AND line.source_type = 'owner_expense'
    AND invoice.lifecycle = 'issued';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner expense line is unavailable' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    v_currency,
    p_allocation_date
  );
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id,
    p_property_id,
    v_owner_person_id,
    v_currency
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_property_id::text || ':owner-cash',
      0
    )
  );

  SELECT
    line.source_id,
    app_private.owner_invoice_line_outstanding(
      line.organization_id,
      line.id
    ),
    coalesce(sum(allocation.amount), 0)::numeric(14,2)
  INTO v_responsibility_id, v_outstanding, v_cash_allocated
  FROM public.owner_invoice_lines AS line
  JOIN public.owner_invoices AS invoice
    ON invoice.organization_id = line.organization_id
   AND invoice.id = line.invoice_id
  LEFT JOIN public.owner_charge_cash_allocations AS allocation
    ON allocation.organization_id = line.organization_id
   AND allocation.owner_invoice_line_id = line.id
  WHERE line.organization_id = p_organization_id
    AND line.property_id = p_property_id
    AND line.id = p_owner_invoice_line_id
    AND line.source_type = 'owner_expense'
    AND invoice.lifecycle = 'issued'
  GROUP BY line.organization_id, line.id, line.source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner expense line is unavailable' USING ERRCODE = '23503';
  END IF;

  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Owner cash cannot exceed the expense line amount'
      USING ERRCODE = '22023';
  END IF;

  v_available := app_private.property_held_cash_balance(
    p_organization_id,
    p_property_id
  );
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Owner cash amount exceeds IPS-held cash available at approval'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.owner_charge_cash_allocations (
    organization_id,
    property_id,
    owner_invoice_line_id,
    allocation_date,
    amount,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_owner_invoice_line_id,
    p_allocation_date,
    p_amount,
    p_actor_id
  );

  v_after_outstanding := app_private.owner_invoice_line_outstanding(
    p_organization_id,
    p_owner_invoice_line_id
  );

  UPDATE public.ips_expense_responsibilities AS responsibility
  SET held_cash_amount = least(
        responsibility.customer_total_amount,
        v_cash_allocated + p_amount
      ),
      ips_advance_amount = greatest(v_after_outstanding, 0),
      updated_by = p_actor_id
  WHERE responsibility.organization_id = p_organization_id
    AND responsibility.id = v_responsibility_id;

  RETURN p_amount::numeric(14,2);
END;
$$;

REVOKE ALL ON FUNCTION app_private.apply_owner_cash_to_expense_line(
  uuid, uuid, uuid, numeric, date, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.create_expense_payment_projection(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_actor_id uuid,
  p_is_reversal boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_allocation public.finance_payment_allocations%ROWTYPE;
  v_expense public.finance_expense_items%ROWTYPE;
  v_original_ledger_entry_id uuid;
  v_ledger_entry_id uuid;
  v_description text;
  v_line_description text := nullif(
    btrim(current_setting('app.expense_line_description', true)),
    ''
  );
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

  IF p_is_reversal THEN
    SELECT original_allocation.ledger_entry_id
    INTO v_original_ledger_entry_id
    FROM public.finance_payment_allocations AS original_allocation
    WHERE original_allocation.organization_id = p_organization_id
      AND original_allocation.id = v_allocation.reversal_of_allocation_id
      AND original_allocation.settlement_contract_version = 'expense_approval.v1';

    IF v_original_ledger_entry_id IS NULL THEN
      RAISE EXCEPTION 'Original expense Ledger event not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_description := CASE WHEN p_is_reversal
    THEN 'Reversal - ' || concat_ws(
      ' - ',
      v_expense.vendor_label,
      coalesce(v_line_description, v_expense.description)
    )
    ELSE concat_ws(
      ' - ',
      v_expense.vendor_label,
      coalesce(v_line_description, v_expense.description)
    )
  END;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
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
    v_original_ledger_entry_id
  );

  UPDATE public.finance_payment_allocations
  SET ledger_entry_id = v_ledger_entry_id
  WHERE organization_id = p_organization_id
    AND id = v_allocation.id
    AND ledger_entry_id IS DISTINCT FROM v_ledger_entry_id;

  RETURN jsonb_build_object('ledger_entry_id', v_ledger_entry_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_transaction(
  p_organization_id uuid,
  p_payee_person_id uuid,
  p_external_payee_label text,
  p_expense_date date,
  p_currency public.currency_code,
  p_reconciliation_source_id uuid,
  p_reference text,
  p_supporting_document_id uuid,
  p_responsibility text,
  p_lines jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_existing public.expense_transactions%ROWTYPE;
  v_external_payee_label text := nullif(btrim(coalesce(p_external_payee_label, '')), '');
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_line jsonb;
  v_line_amount numeric;
  v_line_category text;
  v_line_description text;
  v_line_markup numeric;
  v_line_owner_cash numeric;
  v_line_property_id uuid;
  v_line_submission_id uuid;
  v_line_tenant_invoice_id uuid;
  v_line_unit_id uuid;
  v_ordinality bigint;
  v_payee_label text;
  v_payload jsonb;
  v_payload_hash text;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_responsibility text := lower(btrim(coalesce(p_responsibility, '')));
  v_result jsonb;
  v_transaction_id uuid := gen_random_uuid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_submit_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expense_date IS NULL
    OR p_currency IS NULL
    OR p_reconciliation_source_id IS NULL
    OR p_supporting_document_id IS NULL
    OR length(v_idempotency_key) NOT BETWEEN 8 AND 160
    OR v_responsibility NOT IN ('owner', 'tenant')
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Paid expense transaction is incomplete'
      USING ERRCODE = '22023';
  END IF;
  IF v_responsibility = 'tenant' AND jsonb_array_length(p_lines) <> 1 THEN
    RAISE EXCEPTION 'Tenant recovery remains a single-line expense workflow'
      USING ERRCODE = '22023';
  END IF;

  IF p_payee_person_id IS NOT NULL AND v_external_payee_label IS NULL THEN
    SELECT person.display_name
    INTO v_payee_label
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_payee_person_id
      AND person.archived_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected payee is unavailable' USING ERRCODE = '23503';
    END IF;
  ELSIF p_payee_person_id IS NULL
    AND length(v_external_payee_label) BETWEEN 2 AND 120 THEN
    v_payee_label := v_external_payee_label;
  ELSE
    RAISE EXCEPTION 'Choose one existing person or one-time external payee'
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'currency', p_currency,
    'expense_date', p_expense_date,
    'external_payee_label', v_external_payee_label,
    'lines', p_lines,
    'payee_person_id', p_payee_person_id,
    'reconciliation_source_id', p_reconciliation_source_id,
    'reference', v_reference,
    'responsibility', v_responsibility,
    'supporting_document_id', p_supporting_document_id
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'submit_expense_transaction_v1',
        p_organization_id,
        v_idempotency_key
      ),
      0
    )
  );

  SELECT transaction.*
  INTO v_existing
  FROM public.expense_transactions AS transaction
  WHERE transaction.organization_id = p_organization_id
    AND transaction.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.submitted_by IS DISTINCT FROM v_actor_id
      OR v_existing.request_payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'Conflicting paid expense transaction request'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'status', v_existing.status
    );
  END IF;

  INSERT INTO public.expense_transactions (
    id,
    organization_id,
    payee_person_id,
    external_payee_label,
    payee_label,
    expense_date,
    currency,
    reconciliation_source_id,
    supporting_document_id,
    reference,
    responsibility,
    idempotency_key,
    request_payload_hash,
    submitted_by
  ) VALUES (
    v_transaction_id,
    p_organization_id,
    p_payee_person_id,
    v_external_payee_label,
    btrim(v_payee_label),
    p_expense_date,
    p_currency,
    p_reconciliation_source_id,
    p_supporting_document_id,
    v_reference,
    v_responsibility,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  );

  FOR v_line, v_ordinality IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    BEGIN
      v_line_property_id := nullif(v_line->>'property_id', '')::uuid;
      v_line_unit_id := nullif(v_line->>'unit_id', '')::uuid;
      v_line_tenant_invoice_id := nullif(v_line->>'tenant_invoice_id', '')::uuid;
      v_line_amount := (v_line->>'amount')::numeric(14,2);
      v_line_markup := coalesce(nullif(v_line->>'internal_markup_amount', '')::numeric(14,2), 0);
      v_line_owner_cash := CASE
        WHEN v_line ? 'owner_cash_amount'
          AND jsonb_typeof(v_line->'owner_cash_amount') <> 'null'
          THEN (v_line->>'owner_cash_amount')::numeric(14,2)
        ELSE NULL
      END;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Expense line % contains an invalid value', v_ordinality
        USING ERRCODE = '22023';
    END;
    v_line_category := btrim(coalesce(v_line->>'category', ''));
    v_line_description := btrim(coalesce(v_line->>'description', ''));

    IF v_line_property_id IS NULL
      OR length(v_line_category) < 1
      OR length(v_line_description) NOT BETWEEN 2 AND 500
      OR v_line_amount <= 0
      OR v_line_amount <> round(v_line_amount, 2)
      OR v_line_markup < 0
      OR v_line_markup <> round(v_line_markup, 2)
      OR (v_line_owner_cash IS NOT NULL AND (
        v_line_owner_cash < 0
        OR v_line_owner_cash <> round(v_line_owner_cash, 2)
        OR v_line_owner_cash > v_line_amount
      ))
      OR (v_responsibility = 'tenant' AND v_line_tenant_invoice_id IS NULL)
      OR (v_responsibility = 'owner' AND v_line_tenant_invoice_id IS NOT NULL)
      OR (v_responsibility = 'tenant' AND v_line_owner_cash IS NOT NULL) THEN
      RAISE EXCEPTION 'Expense line % is incomplete or invalid', v_ordinality
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.expense_transaction_scopes (
      organization_id,
      transaction_id,
      property_id
    ) VALUES (
      p_organization_id,
      v_transaction_id,
      v_line_property_id
    ) ON CONFLICT (transaction_id, property_id) DO NOTHING;
  END LOOP;

  IF p_payee_person_id IS NOT NULL THEN
    FOR v_line_property_id IN
      SELECT scope.property_id
      FROM public.expense_transaction_scopes AS scope
      WHERE scope.organization_id = p_organization_id
        AND scope.transaction_id = v_transaction_id
      ORDER BY scope.property_id
    LOOP
      PERFORM app_private.assert_person_in_property_branch(
        p_organization_id,
        v_line_property_id,
        p_payee_person_id
      );
    END LOOP;
  END IF;

  PERFORM set_config('app.expense_transaction_id', v_transaction_id::text, true);

  FOR v_line, v_ordinality IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_line_property_id := (v_line->>'property_id')::uuid;
    v_line_unit_id := nullif(v_line->>'unit_id', '')::uuid;
    v_line_tenant_invoice_id := nullif(v_line->>'tenant_invoice_id', '')::uuid;
    v_line_amount := (v_line->>'amount')::numeric(14,2);
    v_line_markup := coalesce(nullif(v_line->>'internal_markup_amount', '')::numeric(14,2), 0);
    v_line_owner_cash := CASE
      WHEN v_line ? 'owner_cash_amount'
        AND jsonb_typeof(v_line->'owner_cash_amount') <> 'null'
        THEN (v_line->>'owner_cash_amount')::numeric(14,2)
      ELSE NULL
    END;
    v_line_category := btrim(v_line->>'category');
    v_line_description := btrim(v_line->>'description');

    v_result := public.submit_expense(
      p_organization_id,
      v_line_property_id,
      v_line_unit_id,
      'general',
      NULL,
      v_line_category,
      v_payee_label,
      p_expense_date,
      v_line_amount,
      v_line_markup,
      p_currency,
      v_responsibility,
      v_line_tenant_invoice_id,
      p_reconciliation_source_id,
      p_supporting_document_id,
      p_payee_person_id,
      v_reference,
      'expense-line:' || v_transaction_id::text || ':' || v_ordinality::text
    );
    v_line_submission_id := (v_result->>'submission_id')::uuid;

    INSERT INTO public.expense_transaction_lines (
      organization_id,
      transaction_id,
      submission_id,
      sort_order,
      description,
      owner_cash_amount
    ) VALUES (
      p_organization_id,
      v_transaction_id,
      v_line_submission_id,
      v_ordinality::integer,
      v_line_description,
      v_line_owner_cash
    );
  END LOOP;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'expense_transaction',
    v_transaction_id,
    'submitted',
    jsonb_build_object(
      'line_count', jsonb_array_length(p_lines),
      'payee_label', v_payee_label,
      'responsibility', v_responsibility
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'status', 'submitted',
    'line_count', jsonb_array_length(p_lines)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_expense_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_explicit_pass boolean;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_line record;
  v_owner_invoice_line_id uuid;
  v_owner_person_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
  v_target_status text;
  v_transaction public.expense_transactions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_review_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_id IS NULL
    OR v_decision NOT IN ('approve', 'reject')
    OR length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Expense review request is invalid' USING ERRCODE = '22023';
  END IF;

  v_target_status := CASE v_decision
    WHEN 'approve' THEN 'approved'
    ELSE 'rejected'
  END;
  v_payload := jsonb_build_object(
    'decision', v_decision,
    'reason', v_reason,
    'transaction_id', p_transaction_id
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'review_expense_transaction_v1',
        p_organization_id,
        p_transaction_id
      ),
      0
    )
  );

  SELECT transaction.*
  INTO v_transaction
  FROM public.expense_transactions AS transaction
  WHERE transaction.organization_id = p_organization_id
    AND transaction.id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense transaction not found' USING ERRCODE = '23503';
  END IF;

  IF v_transaction.status <> 'submitted' THEN
    IF v_transaction.status = v_target_status
      AND v_transaction.reviewed_by IS NOT DISTINCT FROM v_actor_id
      AND v_transaction.review_idempotency_key IS NOT DISTINCT FROM v_idempotency_key
      AND v_transaction.review_payload_hash IS NOT DISTINCT FROM v_payload_hash THEN
      RETURN jsonb_build_object(
        'transaction_id', v_transaction.id,
        'status', v_transaction.status
      );
    END IF;
    RAISE EXCEPTION 'Only a submitted expense transaction can be reviewed'
      USING ERRCODE = '22023';
  END IF;

  IF v_transaction.submitted_by = v_actor_id THEN
    RAISE EXCEPTION 'The submitter cannot review the same expense transaction'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'app.expense_transaction_id',
    p_transaction_id::text,
    true
  );

  IF v_decision = 'approve' THEN
    FOR v_line IN
      SELECT
        submission.property_id,
        sum(line.owner_cash_amount)::numeric(14,2) AS requested_amount
      FROM public.expense_transaction_lines AS line
      JOIN public.expense_submissions AS submission
        ON submission.organization_id = line.organization_id
       AND submission.id = line.submission_id
      WHERE line.organization_id = p_organization_id
        AND line.transaction_id = p_transaction_id
        AND line.owner_cash_amount IS NOT NULL
      GROUP BY submission.property_id
      ORDER BY submission.property_id
    LOOP
      PERFORM app_private.lock_property_financial_month(
        p_organization_id,
        v_line.property_id,
        v_transaction.currency,
        v_transaction.expense_date
      );
      FOR v_owner_person_id IN
        SELECT DISTINCT invoice.owner_person_id
        FROM public.owner_invoices AS invoice
        WHERE invoice.organization_id = p_organization_id
          AND invoice.property_id = v_line.property_id
          AND invoice.lifecycle = 'issued'
        ORDER BY invoice.owner_person_id
      LOOP
        PERFORM app_private.lock_owner_balance_lifecycle(
          p_organization_id,
          v_line.property_id,
          v_owner_person_id,
          v_transaction.currency
        );
      END LOOP;
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          p_organization_id::text || ':' || v_line.property_id::text || ':owner-cash',
          0
        )
      );
      IF v_line.requested_amount > app_private.property_held_cash_balance(
        p_organization_id,
        v_line.property_id
      ) THEN
        RAISE EXCEPTION 'Owner cash amount exceeds IPS-held cash available at approval'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- Explicit lines go first so a legacy automatic line cannot consume cash
    -- that the maker deliberately reserved for a specific new charge.
    FOREACH v_explicit_pass IN ARRAY ARRAY[true, false]
    LOOP
      FOR v_line IN
        SELECT
          line.description,
          line.id,
          line.owner_cash_amount,
          line.sort_order,
          line.submission_id,
          submission.property_id,
          submission.responsibility
        FROM public.expense_transaction_lines AS line
        JOIN public.expense_submissions AS submission
          ON submission.organization_id = line.organization_id
         AND submission.id = line.submission_id
        WHERE line.organization_id = p_organization_id
          AND line.transaction_id = p_transaction_id
          AND (line.owner_cash_amount IS NOT NULL) = v_explicit_pass
        ORDER BY line.sort_order
      LOOP
        PERFORM set_config(
          'app.expense_owner_cash_mode',
          CASE WHEN v_explicit_pass THEN 'explicit' ELSE '' END,
          true
        );
        PERFORM set_config(
          'app.expense_line_description',
          v_line.description,
          true
        );

        v_result := public.review_expense(
          p_organization_id,
          v_line.submission_id,
          'approve',
          v_reason,
          'expense-transaction-review:' || p_transaction_id::text || ':' || v_line.id::text,
          v_transaction.reconciliation_source_id
        );

        v_owner_invoice_line_id := nullif(
          v_result->>'owner_invoice_line_id',
          ''
        )::uuid;
        IF v_explicit_pass THEN
          IF v_line.responsibility <> 'owner'
            OR v_owner_invoice_line_id IS NULL THEN
            RAISE EXCEPTION 'Explicit owner cash requires an owner expense line'
              USING ERRCODE = '23514';
          END IF;
          PERFORM app_private.apply_owner_cash_to_expense_line(
            p_organization_id,
            v_line.property_id,
            v_owner_invoice_line_id,
            v_line.owner_cash_amount,
            v_transaction.expense_date,
            v_actor_id
          );
        END IF;

        UPDATE public.finance_expense_items AS expense
        SET description = v_line.description,
            updated_by = v_actor_id
        WHERE expense.organization_id = p_organization_id
          AND expense.id = nullif(v_result->>'finance_expense_item_id', '')::uuid;

        UPDATE public.owner_invoice_lines AS owner_line
        SET description = v_line.description
        WHERE owner_line.organization_id = p_organization_id
          AND owner_line.id = v_owner_invoice_line_id;

        UPDATE public.tenant_invoice_lines AS tenant_line
        SET description = v_line.description
        WHERE tenant_line.organization_id = p_organization_id
          AND tenant_line.id = nullif(v_result->>'tenant_invoice_line_id', '')::uuid;

        UPDATE public.finance_income_items AS income
        SET description = v_line.description,
            updated_by = v_actor_id
        WHERE income.organization_id = p_organization_id
          AND income.id = (
            SELECT tenant_line.income_item_id
            FROM public.tenant_invoice_lines AS tenant_line
            WHERE tenant_line.organization_id = p_organization_id
              AND tenant_line.id = nullif(
                v_result->>'tenant_invoice_line_id',
                ''
              )::uuid
          );
      END LOOP;
    END LOOP;
  ELSE
    FOR v_line IN
      SELECT line.id, line.submission_id
      FROM public.expense_transaction_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.transaction_id = p_transaction_id
      ORDER BY line.sort_order
    LOOP
      PERFORM public.review_expense(
        p_organization_id,
        v_line.submission_id,
        'reject',
        v_reason,
        'expense-transaction-review:' || p_transaction_id::text || ':' || v_line.id::text,
        v_transaction.reconciliation_source_id
      );
    END LOOP;
  END IF;

  UPDATE public.expense_transactions AS transaction
  SET status = v_target_status,
      reviewed_at = now(),
      reviewed_by = v_actor_id,
      review_reason = v_reason,
      review_idempotency_key = v_idempotency_key,
      review_payload_hash = v_payload_hash,
      updated_at = now()
  WHERE transaction.organization_id = p_organization_id
    AND transaction.id = p_transaction_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'expense_transaction',
    p_transaction_id,
    v_target_status,
    jsonb_build_object('reason', v_reason)
  );

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'status', v_target_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_expense_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_line record;
  v_payload jsonb;
  v_payload_hash text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_transaction public.expense_transactions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_reverse_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_id IS NULL
    OR p_reversal_date IS NULL
    OR length(v_reason) NOT BETWEEN 3 AND 500
    OR length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Expense reversal request is invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'reason', v_reason,
    'reversal_date', p_reversal_date,
    'transaction_id', p_transaction_id
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'reverse_expense_transaction_v1',
        p_organization_id,
        p_transaction_id
      ),
      0
    )
  );

  SELECT transaction.*
  INTO v_transaction
  FROM public.expense_transactions AS transaction
  WHERE transaction.organization_id = p_organization_id
    AND transaction.id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense transaction not found' USING ERRCODE = '23503';
  END IF;

  IF v_transaction.status = 'reversed'
    AND v_transaction.reversed_by IS NOT DISTINCT FROM v_actor_id
    AND v_transaction.reversal_idempotency_key IS NOT DISTINCT FROM v_idempotency_key
    AND v_transaction.reversal_payload_hash IS NOT DISTINCT FROM v_payload_hash THEN
    RETURN jsonb_build_object(
      'transaction_id', v_transaction.id,
      'status', v_transaction.status
    );
  END IF;
  IF v_transaction.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved expense transaction can be reversed'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT line.description, line.id, line.submission_id
    FROM public.expense_transaction_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.transaction_id = p_transaction_id
    ORDER BY line.sort_order
  LOOP
    PERFORM set_config(
      'app.expense_line_description',
      v_line.description,
      true
    );
    PERFORM public.reverse_expense(
      p_organization_id,
      v_line.submission_id,
      p_reversal_date,
      v_reason,
      'expense-transaction-reverse:' || p_transaction_id::text || ':' || v_line.id::text
    );
  END LOOP;

  UPDATE public.expense_transactions AS transaction
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_actor_id,
      reversal_reason = v_reason,
      reversal_idempotency_key = v_idempotency_key,
      reversal_payload_hash = v_payload_hash,
      updated_at = now()
  WHERE transaction.organization_id = p_organization_id
    AND transaction.id = p_transaction_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'expense_transaction',
    p_transaction_id,
    'reversed',
    jsonb_build_object(
      'reason', v_reason,
      'reversal_date', p_reversal_date
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'status', 'reversed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_expense_transaction(
  uuid, uuid, text, date, public.currency_code, uuid, text, uuid, text, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense_transaction(
  uuid, uuid, text, date, public.currency_code, uuid, text, uuid, text, jsonb, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_expense_transaction(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_expense_transaction(
  uuid, uuid, text, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reverse_expense_transaction(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_expense_transaction(
  uuid, uuid, date, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_expense_transaction(
  uuid, uuid, text, date, public.currency_code, uuid, text, uuid, text, jsonb, text
) IS 'Submits one evidence-backed paid-expense transaction with ordered property lines and actor-bound idempotency.';
COMMENT ON FUNCTION public.review_expense_transaction(
  uuid, uuid, text, text, text
) IS 'Approves or rejects every child line atomically while preserving maker-checker and explicit owner-cash intent.';
COMMENT ON FUNCTION public.reverse_expense_transaction(
  uuid, uuid, date, text, text
) IS 'Atomically appends established child reversals for every line in an approved paid-expense transaction.';
