-- Receipt references are already nullable in storage. Allow absent receipt evidence
-- on paid expenses, retaining all eligibility checks whenever evidence is supplied.
-- Replace the existing private evidence wrappers; outer permission, branch, Chart,
-- transaction and review boundaries remain in force.
ALTER TABLE public.expense_transactions
  ALTER COLUMN supporting_document_id DROP NOT NULL;
ALTER TABLE public.expense_submissions
  DROP CONSTRAINT expense_submissions_evidence_check;

CREATE OR REPLACE FUNCTION app_private.submit_expense_baseline_branch106(
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
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source_type text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_source_type, ''))
  );
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_submit_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_source_type = 'general' AND p_supporting_document_id IS NOT NULL THEN
    PERFORM app_private.assert_paid_cost_evidence_eligible(
      p_organization_id,
      p_property_id,
      p_supporting_document_id,
      v_actor_id,
      p_idempotency_key,
      NULL
    );
  END IF;

  RETURN app_private.submit_expense_baseline(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_source_type,
    p_source_id,
    p_customer_category,
    p_vendor_label,
    p_expense_date,
    p_internal_cost_amount,
    p_internal_markup_amount,
    p_currency,
    p_responsibility,
    p_tenant_invoice_id,
    p_reconciliation_source_id,
    p_supporting_document_id,
    p_vendor_person_id,
    p_reference,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.review_expense_baseline_branch106(
  p_organization_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text,
  p_reconciliation_source_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_decision text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_decision, ''))
  );
  v_submission public.expense_submissions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_review_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_decision = 'approve' THEN
    SELECT submission.*
    INTO v_submission
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.id = p_submission_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense submission not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_submission.source_type = 'general'
      AND v_submission.supporting_document_id IS NOT NULL THEN
      PERFORM app_private.assert_paid_cost_evidence_eligible(
        p_organization_id,
        v_submission.property_id,
        v_submission.supporting_document_id,
        v_submission.submitted_by,
        v_submission.idempotency_key,
        v_submission.id
      );
    END IF;
  END IF;

  RETURN app_private.review_expense_baseline_track6_evidence(
    p_organization_id,
    p_submission_id,
    p_decision,
    p_reason,
    p_idempotency_key,
    p_reconciliation_source_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_transaction(
  p_organization_id uuid,
  p_payee_person_id uuid,
  p_external_payee_label text,
  p_expense_date date,
  p_currency public.currency_code,
  p_pay_from_account_id uuid,
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
  v_reconciliation_source_id uuid;
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
  IF NOT app_private.is_super_admin(p_organization_id)
    AND NOT app_private.has_org_permission(
      p_organization_id,
      'finance.submit_expenses'
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expense_date IS NULL
    OR p_currency IS NULL
    OR p_pay_from_account_id IS NULL
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
    JOIN public.person_roles AS vendor_role
      ON vendor_role.organization_id = person.organization_id
      AND vendor_role.person_id = person.id
      AND vendor_role.role = 'vendor'
      AND vendor_role.status = 'active'
      AND vendor_role.archived_at IS NULL
    WHERE person.organization_id = p_organization_id
      AND person.id = p_payee_person_id
      AND person.archived_at IS NULL
    FOR SHARE OF person, vendor_role;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected payee is unavailable' USING ERRCODE = '23503';
    END IF;
  ELSIF p_payee_person_id IS NULL
    AND length(v_external_payee_label) BETWEEN 2 AND 120 THEN
    v_payee_label := v_external_payee_label;
  ELSE
    RAISE EXCEPTION 'Choose one vendor or one-time external payee'
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'currency', p_currency,
    'expense_date', p_expense_date,
    'external_payee_label', v_external_payee_label,
    'lines', p_lines,
    'payee_person_id', p_payee_person_id,
    'pay_from_account_id', p_pay_from_account_id,
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
    FOR v_line_property_id IN
      SELECT scope.property_id
      FROM public.expense_transaction_scopes AS scope
      WHERE scope.organization_id = p_organization_id
        AND scope.transaction_id = v_existing.id
      ORDER BY scope.property_id
    LOOP
      PERFORM app_private.assert_property_permission(
        p_organization_id, v_line_property_id, 'finance.submit_expenses'
      );
    END LOOP;
    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'status', v_existing.status
    );
  END IF;

  v_reconciliation_source_id := app_private.resolve_chart_source_for_workflow_v2(
    p_organization_id, p_pay_from_account_id, (p_lines->0->>'property_id')::uuid,
    true, false
  );

  INSERT INTO public.expense_transactions (
    id,
    organization_id,
    payee_person_id,
    external_payee_label,
    payee_label,
    expense_date,
    currency,
    reconciliation_source_id,
    pay_from_account_id,
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
    v_reconciliation_source_id,
    p_pay_from_account_id,
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
      v_line_amount := (v_line->>'amount')::numeric;
      v_line_markup := coalesce(nullif(v_line->>'internal_markup_amount', '')::numeric, 0);
      v_line_owner_cash := CASE
        WHEN v_line ? 'owner_cash_amount'
          AND jsonb_typeof(v_line->'owner_cash_amount') <> 'null'
          THEN (v_line->>'owner_cash_amount')::numeric
        ELSE NULL
      END;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Expense line % contains an invalid value', v_ordinality
        USING ERRCODE = '22023';
    END;
    v_line_category := btrim(coalesce(v_line->>'category_account_id', ''));
    v_line_description := btrim(coalesce(v_line->>'description', ''));

    IF v_line_property_id IS NULL
      OR length(v_line_category) < 1
      OR length(v_line_description) NOT BETWEEN 2 AND 500
      OR v_line_amount IS NULL
      OR v_line_amount::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_line_markup::text IN ('NaN', 'Infinity', '-Infinity')
      OR coalesce(v_line_owner_cash::text IN ('NaN', 'Infinity', '-Infinity'), false)
      OR v_line_amount >= 1000000000000
      OR v_line_markup >= 1000000000000
      OR v_line_amount + v_line_markup >= 1000000000000
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

    PERFORM app_private.assert_property_permission(
      p_organization_id,
      v_line_property_id,
      'finance.submit_expenses'
    );

    PERFORM app_private.resolve_chart_source_for_workflow_v2(
      p_organization_id, p_pay_from_account_id, v_line_property_id, true, false
    );
    PERFORM app_private.resolve_chart_expense_category(
      p_organization_id, v_line_category::uuid,
      CASE v_responsibility WHEN 'owner' THEN 'owner_expense' ELSE 'tenant_billing' END,
      v_line_property_id, false
    );

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

  PERFORM app_private.set_expense_transaction_context(
    p_organization_id, v_transaction_id, 'submit', true
  );

  FOR v_line, v_ordinality IN
    SELECT candidate.value, candidate.ordinality
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS candidate(value, ordinality)
  LOOP
    v_line_property_id := (v_line->>'property_id')::uuid;
    v_line_unit_id := nullif(v_line->>'unit_id', '')::uuid;
    v_line_tenant_invoice_id := nullif(v_line->>'tenant_invoice_id', '')::uuid;
    v_line_amount := (v_line->>'amount')::numeric;
    v_line_markup := coalesce(nullif(v_line->>'internal_markup_amount', '')::numeric, 0);
    v_line_owner_cash := CASE
      WHEN v_line ? 'owner_cash_amount'
        AND jsonb_typeof(v_line->'owner_cash_amount') <> 'null'
        THEN (v_line->>'owner_cash_amount')::numeric
      ELSE NULL
    END;
    v_line_category := btrim(v_line->>'category_account_id');
    v_line_description := btrim(v_line->>'description');

    v_result := public.submit_expense_with_accounts(
      p_organization_id,
      v_line_property_id,
      v_line_unit_id,
      'general',
      NULL,
      v_line_category::uuid,
      v_payee_label,
      p_expense_date,
      v_line_amount,
      v_line_markup,
      p_currency,
      v_responsibility,
      v_line_tenant_invoice_id,
      p_pay_from_account_id,
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
      category_account_id,
      sort_order,
      description,
      owner_cash_amount
    ) VALUES (
      p_organization_id,
      v_transaction_id,
      v_line_submission_id,
      v_line_category::uuid,
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

  PERFORM app_private.set_expense_transaction_context(p_organization_id, v_transaction_id, 'submit', false);
  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'status', 'submitted',
    'line_count', jsonb_array_length(p_lines)
  );
END;
$$;

-- Preserve later receipt-scope changes to the canonical submission routine.
DO $optional_receipt$
DECLARE
  v_definition text;
  v_old text := $old$  IF p_supporting_document_id IS NULL AND v_reference IS NULL THEN
    RAISE EXCEPTION 'Add a supporting document or receipt reference'
      USING ERRCODE = '22023';
  END IF;
$old$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_old := replace(v_old, E'\r\n', E'\n');
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'optional_expense_receipt_contract_changed';
  END IF;
  EXECUTE replace(v_definition, v_old, '');
END;
$optional_receipt$;

CREATE OR REPLACE FUNCTION app_private.guard_paid_cost_approval_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'approved'
    AND OLD.status IS DISTINCT FROM 'approved'
    AND (NEW.source_type <> 'general' OR NEW.supporting_document_id IS NOT NULL)
    AND (
      NEW.supporting_document_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.documents AS document
        JOIN app_private.paid_cost_evidence_registrations AS registration
          ON registration.document_id = document.id
         AND registration.organization_id = document.organization_id
        WHERE document.organization_id = NEW.organization_id
          AND (
            document.property_id = NEW.property_id
            OR (
              NEW.source_type = 'general'
              AND app_private.expense_transaction_evidence_covers_property(
                NEW.organization_id, NEW.property_id, document.id
              )
            )
          )
          AND document.id = NEW.supporting_document_id
          AND document.archived_at IS NULL
          AND (
            NEW.source_type <> 'maintenance_task'
            OR document.task_id = NEW.source_id
          )
      )
    ) THEN
    RAISE EXCEPTION 'Paid cost approval requires exclusive registered evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
