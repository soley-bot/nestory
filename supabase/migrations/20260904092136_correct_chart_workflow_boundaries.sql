-- Keep Chart account choices exact at the checked workflow boundary. The
-- canonical mutations still own business validation, idempotency, and their
-- established update-lock order.

CREATE TABLE app_private.finance_chart_workflow_idempotency_bindings (
  organization_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  primary_account_id uuid NOT NULL,
  secondary_account_id uuid,
  resolved_category_code text,
  resolved_source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_chart_workflow_idempotency_bindings_pkey
    PRIMARY KEY (organization_id, operation, idempotency_key),
  CONSTRAINT finance_chart_workflow_idempotency_bindings_operation_check
    CHECK (operation IN (
      'submit_expense',
      'review_expense',
      'create_manual_tenant_charge',
      'record_tenant_invoice_payment'
    )),
  CONSTRAINT finance_chart_workflow_idempotency_bindings_request_fkey
    FOREIGN KEY (organization_id, operation, idempotency_key)
    REFERENCES app_private.financial_idempotency_requests (
      organization_id, operation, idempotency_key
    ) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT finance_chart_workflow_primary_account_fkey
    FOREIGN KEY (organization_id, primary_account_id)
    REFERENCES public.finance_accounts (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_chart_workflow_secondary_account_fkey
    FOREIGN KEY (organization_id, secondary_account_id)
    REFERENCES public.finance_accounts (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_chart_workflow_source_fkey
    FOREIGN KEY (organization_id, resolved_source_id)
    REFERENCES public.financial_reconciliation_sources (organization_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE app_private.finance_chart_workflow_idempotency_bindings OWNER TO postgres;
REVOKE ALL ON TABLE app_private.finance_chart_workflow_idempotency_bindings
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.reject_finance_chart_workflow_binding_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Chart workflow idempotency bindings are immutable'
    USING ERRCODE = '55000', DETAIL = 'finance_chart_workflow_binding_immutable';
END;
$$;

CREATE TRIGGER finance_chart_workflow_idempotency_bindings_immutable
BEFORE UPDATE OR DELETE ON app_private.finance_chart_workflow_idempotency_bindings
FOR EACH ROW EXECUTE FUNCTION app_private.reject_finance_chart_workflow_binding_mutation();

CREATE FUNCTION app_private.resolve_chart_source_for_workflow_v2(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid,
  p_allow_credit_card boolean,
  p_allow_archived_account boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_source_id uuid;
BEGIN
  SELECT source.id INTO v_source_id
  FROM public.finance_accounts AS account
  JOIN public.finance_account_source_links AS link
    ON link.organization_id = account.organization_id AND link.account_id = account.id
  JOIN public.financial_reconciliation_sources AS source
    ON source.organization_id = link.organization_id AND source.id = link.source_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND (p_allow_archived_account OR account.archived_at IS NULL)
    AND source.archived_at IS NULL
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
    AND source.property_id IS NOT DISTINCT FROM account.property_id
    AND (
      (account.account_class = 'asset' AND account.account_subtype IN ('bank','cash','petty_cash'))
      OR (p_allow_credit_card AND account.account_class = 'liability'
        AND account.account_subtype = 'credit_card')
    )
    AND app_private.finance_account_source_is_compatible(
      source.source_kind, account.account_class, account.account_subtype
    )
  FOR SHARE OF account, link, source;
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active account'
      USING ERRCODE = '22023', DETAIL = 'finance_account_source_incompatible';
  END IF;
  RETURN v_source_id;
END;
$$;

CREATE FUNCTION app_private.resolve_chart_expense_category(
  p_organization_id uuid,
  p_account_id uuid,
  p_namespace text,
  p_property_id uuid,
  p_allow_archived boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_category_code text;
BEGIN
  SELECT category.code INTO v_category_code
  FROM public.finance_accounts AS account
  JOIN public.finance_account_category_links AS link
    ON link.organization_id = account.organization_id AND link.account_id = account.id
  JOIN public.finance_categories AS category
    ON category.organization_id = link.organization_id AND category.id = link.category_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND (p_allow_archived OR (account.archived_at IS NULL AND category.archived_at IS NULL))
    AND category.namespace = p_namespace
    AND account.account_class = 'expense'
    AND (p_namespace = 'owner_expense'
      OR (p_namespace = 'tenant_billing' AND account.use_for_lease_credits))
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
  FOR SHARE OF account, link, category;
  IF v_category_code IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active expense account'
      USING ERRCODE = '22023', DETAIL = 'finance_expense_account_incompatible';
  END IF;
  RETURN v_category_code;
END;
$$;

CREATE FUNCTION app_private.resolve_chart_lease_charge_category(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid,
  p_allow_archived boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_category_code text;
BEGIN
  SELECT category.code INTO v_category_code
  FROM public.finance_accounts AS account
  JOIN public.finance_account_category_links AS link
    ON link.organization_id = account.organization_id AND link.account_id = account.id
  JOIN public.finance_categories AS category
    ON category.organization_id = link.organization_id AND category.id = link.category_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND (p_allow_archived OR (account.archived_at IS NULL AND category.archived_at IS NULL))
    AND category.namespace = 'tenant_billing'
    AND account.account_class = 'income'
    AND account.use_for_lease_charges
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
  FOR SHARE OF account, link, category;
  IF v_category_code IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active lease-charge account'
      USING ERRCODE = '22023', DETAIL = 'finance_lease_charge_account_incompatible';
  END IF;
  RETURN v_category_code;
END;
$$;

CREATE FUNCTION app_private.bind_chart_workflow_accounts(
  p_organization_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_primary_account_id uuid,
  p_secondary_account_id uuid,
  p_resolved_category_code text,
  p_resolved_source_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
BEGIN
  INSERT INTO app_private.finance_chart_workflow_idempotency_bindings (
    organization_id, operation, idempotency_key, primary_account_id,
    secondary_account_id, resolved_category_code, resolved_source_id
  ) VALUES (
    p_organization_id, p_operation, btrim(coalesce(p_idempotency_key, '')),
    p_primary_account_id, p_secondary_account_id, p_resolved_category_code,
    p_resolved_source_id
  ) ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

  SELECT binding.* INTO STRICT v_binding
  FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  WHERE binding.organization_id = p_organization_id
    AND binding.operation = p_operation
    AND binding.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  FOR UPDATE;

  IF v_binding.primary_account_id IS DISTINCT FROM p_primary_account_id
    OR v_binding.secondary_account_id IS DISTINCT FROM p_secondary_account_id
    OR v_binding.resolved_category_code IS DISTINCT FROM p_resolved_category_code
    OR v_binding.resolved_source_id IS DISTINCT FROM p_resolved_source_id
  THEN
    RAISE EXCEPTION 'Conflicting Chart account idempotency request'
      USING ERRCODE = '22023', DETAIL = 'finance_chart_workflow_idempotency_conflict';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_with_accounts(
  p_organization_id uuid,p_property_id uuid,p_unit_id uuid,p_source_type text,
  p_source_id uuid,p_category_account_id uuid,p_vendor_label text,p_expense_date date,
  p_internal_cost_amount numeric,p_internal_markup_amount numeric,p_currency public.currency_code,
  p_responsibility text,p_tenant_invoice_id uuid,p_pay_from_account_id uuid,
  p_supporting_document_id uuid,p_vendor_person_id uuid,p_reference text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
  v_category text; v_source_id uuid; v_namespace text; v_replay boolean;
BEGIN
  v_namespace := CASE lower(btrim(coalesce(p_responsibility, '')))
    WHEN 'owner' THEN 'owner_expense' WHEN 'tenant' THEN 'tenant_billing' ELSE NULL END;
  IF v_namespace IS NULL THEN RAISE EXCEPTION 'Choose Owner or Tenant' USING ERRCODE = '22023'; END IF;
  SELECT binding.* INTO v_binding
  FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  WHERE binding.organization_id=p_organization_id AND binding.operation='submit_expense'
    AND binding.idempotency_key=btrim(coalesce(p_idempotency_key,'')) FOR UPDATE;
  IF FOUND THEN
    IF v_binding.primary_account_id IS DISTINCT FROM p_category_account_id
      OR v_binding.secondary_account_id IS DISTINCT FROM p_pay_from_account_id THEN
      RAISE EXCEPTION 'Conflicting Chart account idempotency request'
        USING ERRCODE='22023',DETAIL='finance_chart_workflow_idempotency_conflict';
    END IF;
    v_category:=v_binding.resolved_category_code; v_source_id:=v_binding.resolved_source_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM app_private.financial_idempotency_requests AS request
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'submit_expense'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed'
    ) INTO v_replay;
    v_category := app_private.resolve_chart_expense_category(
      p_organization_id,p_category_account_id,v_namespace,p_property_id,v_replay
    );
    v_source_id := app_private.resolve_chart_source_for_workflow_v2(
      p_organization_id,p_pay_from_account_id,p_property_id,true,v_replay
    );
    PERFORM app_private.bind_chart_workflow_accounts(
      p_organization_id,'submit_expense',p_idempotency_key,p_category_account_id,
      p_pay_from_account_id,v_category,v_source_id
    );
  END IF;
  RETURN public.submit_expense(
    p_organization_id,p_property_id,p_unit_id,p_source_type,p_source_id,v_category,
    p_vendor_label,p_expense_date,p_internal_cost_amount,p_internal_markup_amount,
    p_currency,p_responsibility,p_tenant_invoice_id,v_source_id,p_supporting_document_id,
    p_vendor_person_id,p_reference,p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_expense_with_account(
  p_organization_id uuid,p_submission_id uuid,p_decision text,p_reason text,
  p_idempotency_key text,p_pay_from_account_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
  v_property_id uuid; v_source_id uuid; v_replay boolean;
BEGIN
  SELECT submission.property_id INTO v_property_id
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id AND submission.id = p_submission_id;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF p_pay_from_account_id IS NOT NULL THEN
    SELECT binding.* INTO v_binding
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    WHERE binding.organization_id=p_organization_id AND binding.operation='review_expense'
      AND binding.idempotency_key=btrim(coalesce(p_idempotency_key,'')) FOR UPDATE;
    IF FOUND THEN
      IF v_binding.primary_account_id IS DISTINCT FROM p_pay_from_account_id THEN
        RAISE EXCEPTION 'Conflicting Chart account idempotency request'
          USING ERRCODE='22023',DETAIL='finance_chart_workflow_idempotency_conflict';
      END IF;
      v_source_id:=v_binding.resolved_source_id;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM app_private.financial_idempotency_requests AS request
        WHERE request.organization_id = p_organization_id
          AND request.operation = 'review_expense'
          AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
          AND request.status = 'completed'
      ) INTO v_replay;
      v_source_id := app_private.resolve_chart_source_for_workflow_v2(
        p_organization_id,p_pay_from_account_id,v_property_id,true,v_replay
      );
      PERFORM app_private.bind_chart_workflow_accounts(
        p_organization_id,'review_expense',p_idempotency_key,p_pay_from_account_id,
        NULL,NULL,v_source_id
      );
    END IF;
  END IF;
  RETURN public.review_expense(
    p_organization_id,p_submission_id,p_decision,p_reason,p_idempotency_key,v_source_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_tenant_charge_with_account(
  p_organization_id uuid,p_lease_id uuid,p_category_account_id uuid,
  p_billing_period_start date,p_due_date date,p_amount numeric,p_description text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
  v_category text; v_property_id uuid; v_replay boolean;
BEGIN
  SELECT lease.property_id INTO v_property_id FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id AND lease.id = p_lease_id;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT binding.* INTO v_binding
  FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  WHERE binding.organization_id=p_organization_id
    AND binding.operation='create_manual_tenant_charge'
    AND binding.idempotency_key=btrim(coalesce(p_idempotency_key,'')) FOR UPDATE;
  IF FOUND THEN
    IF v_binding.primary_account_id IS DISTINCT FROM p_category_account_id THEN
      RAISE EXCEPTION 'Conflicting Chart account idempotency request'
        USING ERRCODE='22023',DETAIL='finance_chart_workflow_idempotency_conflict';
    END IF;
    v_category:=v_binding.resolved_category_code;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM app_private.financial_idempotency_requests AS request
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'create_manual_tenant_charge'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed'
    ) INTO v_replay;
    v_category := app_private.resolve_chart_lease_charge_category(
      p_organization_id,p_category_account_id,v_property_id,v_replay
    );
    PERFORM app_private.bind_chart_workflow_accounts(
      p_organization_id,'create_manual_tenant_charge',p_idempotency_key,
      p_category_account_id,NULL,v_category,NULL
    );
  END IF;
  RETURN public.create_manual_tenant_charge(
    p_organization_id,p_lease_id,v_category,p_billing_period_start,p_due_date,
    p_amount,p_description,p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tenant_invoice_payment_with_account(
  p_organization_id uuid,p_invoice_id uuid,p_amount numeric,p_received_date date,
  p_receiving_account_id uuid,p_reference text,p_allocations jsonb,p_idempotency_key text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_binding app_private.finance_chart_workflow_idempotency_bindings%ROWTYPE;
  v_property_id uuid; v_source_id uuid; v_replay boolean;
BEGIN
  SELECT invoice.property_id INTO v_property_id FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id AND invoice.id = p_invoice_id;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT binding.* INTO v_binding
  FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  WHERE binding.organization_id=p_organization_id
    AND binding.operation='record_tenant_invoice_payment'
    AND binding.idempotency_key=btrim(coalesce(p_idempotency_key,'')) FOR UPDATE;
  IF FOUND THEN
    IF v_binding.primary_account_id IS DISTINCT FROM p_receiving_account_id THEN
      RAISE EXCEPTION 'Conflicting Chart account idempotency request'
        USING ERRCODE='22023',DETAIL='finance_chart_workflow_idempotency_conflict';
    END IF;
    v_source_id:=v_binding.resolved_source_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM app_private.financial_idempotency_requests AS request
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'record_tenant_invoice_payment'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed'
    ) INTO v_replay;
    v_source_id := app_private.resolve_chart_source_for_workflow_v2(
      p_organization_id,p_receiving_account_id,v_property_id,false,v_replay
    );
    PERFORM app_private.bind_chart_workflow_accounts(
      p_organization_id,'record_tenant_invoice_payment',p_idempotency_key,
      p_receiving_account_id,NULL,NULL,v_source_id
    );
  END IF;
  RETURN public.record_tenant_invoice_payment(
    p_organization_id,p_invoice_id,p_amount,p_received_date,v_source_id,
    p_reference,p_allocations,p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event_with_account(
  p_organization_id uuid,p_lease_deposit_id uuid,p_liability_account_id uuid,
  p_event_type text,p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid;
BEGIN
  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id AND deposit.id = p_lease_deposit_id;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id,p_liability_account_id,v_property_id
  );
  v_event_id := public.record_lease_deposit_event(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
  UPDATE public.lease_deposit_events
  SET liability_account_id = v_account_id
  WHERE organization_id = p_organization_id AND id = v_event_id;
  RETURN v_event_id;
END;
$$;

-- Revoke the raw path; install its checked compatibility adapter below before commit.
REVOKE EXECUTE ON FUNCTION public.record_lease_deposit_event(
  uuid,uuid,text,date,numeric,text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION app_private.reject_finance_chart_workflow_binding_mutation()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resolve_chart_source_for_workflow_v2(uuid,uuid,uuid,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resolve_chart_expense_category(uuid,uuid,text,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resolve_chart_lease_charge_category(uuid,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.bind_chart_workflow_accounts(uuid,text,text,uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Unreleased migration amendment: install rolling-application compatibility in
-- the same transaction as revoking the raw signature above. See the provenance
-- and prefix-rehearsal requirements in the compatibility amendment runbook.
-- Keep the released application's deposit signature usable during DB-first
-- rollout and app-only rollback, without bypassing Chart liability selection.
-- Preserve the exact checked Ledger/money implementation as a private core.
DO $$
BEGIN
  IF encode(extensions.digest(pg_get_functiondef(
    'public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)'::regprocedure
  ),'sha256'),'hex') <> '0ac627eebbe787cfb2349275e8dd2449ea2d4721468ec3aba72e5f22859a376a' THEN
    RAISE EXCEPTION 'Unexpected legacy deposit implementation; compatibility migration refused';
  END IF;
END;
$$;

ALTER FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
  RENAME TO record_lease_deposit_event_legacy_checked_core;
ALTER FUNCTION public.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)
  SET SCHEMA app_private;
REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event_with_account(
  p_organization_id uuid,p_lease_deposit_id uuid,p_liability_account_id uuid,
  p_event_type text,p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id=deposit.organization_id AND lease.id=deposit.lease_id
  WHERE deposit.organization_id=p_organization_id AND deposit.id=p_lease_deposit_id
    AND deposit.archived_at IS NULL AND lease.archived_at IS NULL;
  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id,v_property_id,'leases.change_terms'::public.organization_permission_key
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_account_id:=app_private.resolve_chart_deposit_liability(
    p_organization_id,p_liability_account_id,v_property_id
  );
  v_event_id:=app_private.record_lease_deposit_event_legacy_checked_core(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
  UPDATE public.lease_deposit_events SET liability_account_id=v_account_id
  WHERE organization_id=p_organization_id AND id=v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_lease_deposit_event_legacy_adapter(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
  v_account_id uuid;
  v_locked_account_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id
    AND deposit.archived_at IS NULL
    AND lease.archived_at IS NULL;

  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id, v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT role.account_id INTO v_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits';

  -- This checked resolver obtains SHARE on the account and validates its
  -- organization, active status, liability class/subtype and deposit capability.
  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id, v_account_id, v_property_id
  );

  SELECT role.account_id INTO v_locked_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits'
  FOR SHARE;

  IF NOT FOUND OR v_locked_account_id IS DISTINCT FROM v_account_id THEN
    RAISE EXCEPTION 'Security deposit default changed. Retry the deposit recording.'
      USING ERRCODE = '40001';
  END IF;

  -- Both authority rows are now stable. Preserve the checked event writer,
  -- month lock, held-balance checks, Ledger projection and liability lineage.
  RETURN public.record_lease_deposit_event_with_account(
    p_organization_id, p_lease_deposit_id, v_account_id,
    p_event_type, p_event_date, p_amount, p_reference
  );
END;
$$;

CREATE FUNCTION public.record_lease_deposit_event(
  p_organization_id uuid,p_lease_deposit_id uuid,p_event_type text,
  p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.record_lease_deposit_event_legacy_adapter(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
$$;
REVOKE ALL ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text) TO authenticated;
COMMENT ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
 IS 'Checked rolling-deploy compatibility adapter: resolves the organization security-deposit default and preserves Chart liability, property, month and cash authority.';
