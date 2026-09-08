-- Connect Chart of Accounts choices to the existing checked finance mutations.

ALTER TABLE public.financial_reconciliation_sources
  DROP CONSTRAINT financial_reconciliation_sources_source_kind_check;
ALTER TABLE public.financial_reconciliation_sources
  ADD CONSTRAINT financial_reconciliation_sources_source_kind_check
  CHECK (source_kind IN ('bank','cash','petty_cash','clearing','credit_card','other'));

CREATE OR REPLACE FUNCTION app_private.finance_account_source_is_compatible(
  p_source_kind text,
  p_account_class text,
  p_account_subtype text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_source_kind
    WHEN 'bank' THEN p_account_class = 'asset' AND p_account_subtype = 'bank'
    WHEN 'cash' THEN p_account_class = 'asset' AND p_account_subtype IN ('cash','petty_cash')
    WHEN 'petty_cash' THEN p_account_class = 'asset' AND p_account_subtype = 'petty_cash'
    WHEN 'clearing' THEN p_account_class = 'asset' AND p_account_subtype = 'other_current_asset'
    WHEN 'credit_card' THEN p_account_class = 'liability' AND p_account_subtype = 'credit_card'
    WHEN 'other' THEN p_account_class = 'asset' AND p_account_subtype IN ('cash','other_current_asset','other_asset')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_finance_account_source(
  p_organization_id uuid,
  p_account_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_source_id uuid;
  v_source_code text;
  v_source_kind text;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '23503';
  END IF;

  IF NOT (
      (v_account.account_class = 'asset' AND v_account.account_subtype IN ('bank','cash','petty_cash'))
      OR (v_account.account_class = 'liability' AND v_account.account_subtype = 'credit_card')
    ) OR EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    ) THEN
    RETURN;
  END IF;

  v_source_kind := CASE
    WHEN v_account.account_class = 'liability' THEN 'credit_card'
    WHEN v_account.account_subtype = 'bank' THEN 'bank'
    WHEN v_account.account_subtype = 'petty_cash' THEN 'petty_cash'
    ELSE 'cash'
  END;

  LOOP
    v_source_id := gen_random_uuid();
    v_source_code := 'I' || upper(replace(v_source_id::text, '-', ''));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.financial_reconciliation_sources AS source
      WHERE source.organization_id = p_organization_id
        AND source.code = v_source_code
    );
  END LOOP;

  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'on', true);
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'on', true);
  INSERT INTO public.financial_reconciliation_sources (
    id, organization_id, property_id, currency, code, display_name,
    source_kind, scope_kind, created_by, updated_by
  )
  SELECT
    v_source_id, p_organization_id, v_account.property_id,
    organization.preferred_currency, v_source_code, v_account.display_name,
    v_source_kind,
    CASE WHEN v_account.property_id IS NULL THEN 'organization_pooled' ELSE 'property_dedicated' END,
    p_actor_id, p_actor_id
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;

  INSERT INTO app_private.finance_account_internal_sources (organization_id, source_id)
  VALUES (p_organization_id, v_source_id);
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'off', true);
  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'off', true);

  INSERT INTO public.finance_account_source_links (organization_id, account_id, source_id)
  VALUES (p_organization_id, p_account_id, v_source_id)
  ON CONFLICT DO NOTHING;
END;
$$;

DO $$
DECLARE v_account record;
BEGIN
  FOR v_account IN
    SELECT account.organization_id, account.id
    FROM public.finance_accounts AS account
    WHERE account.account_class = 'liability'
      AND account.account_subtype = 'credit_card'
      AND account.archived_at IS NULL
    ORDER BY account.organization_id, account.id
  LOOP
    PERFORM app_private.ensure_finance_account_source(
      v_account.organization_id, v_account.id, NULL
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.resolve_chart_source_for_workflow(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid,
  p_allow_credit_card boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_source_id uuid;
BEGIN
  SELECT source.id INTO v_source_id
  FROM public.finance_accounts AS account
  JOIN public.finance_account_source_links AS link
    ON link.organization_id = account.organization_id
   AND link.account_id = account.id
  JOIN public.financial_reconciliation_sources AS source
    ON source.organization_id = link.organization_id
   AND source.id = link.source_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND account.archived_at IS NULL
    AND source.archived_at IS NULL
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
    AND source.property_id IS NOT DISTINCT FROM account.property_id
    AND (
      (account.account_class = 'asset' AND account.account_subtype IN ('bank','cash','petty_cash'))
      OR (
        p_allow_credit_card
        AND account.account_class = 'liability'
        AND account.account_subtype = 'credit_card'
      )
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

CREATE OR REPLACE FUNCTION app_private.resolve_chart_category_for_workflow(
  p_organization_id uuid,
  p_account_id uuid,
  p_namespace text,
  p_property_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_category_code text;
BEGIN
  SELECT category.code INTO v_category_code
  FROM public.finance_accounts AS account
  JOIN public.finance_account_category_links AS link
    ON link.organization_id = account.organization_id
   AND link.account_id = account.id
  JOIN public.finance_categories AS category
    ON category.organization_id = link.organization_id
   AND category.id = link.category_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND account.archived_at IS NULL
    AND category.archived_at IS NULL
    AND category.namespace = p_namespace
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
    AND (
      (p_namespace = 'owner_expense' AND account.account_class = 'expense')
      OR (
        p_namespace = 'tenant_billing'
        AND (
          (account.account_class = 'income' AND account.use_for_lease_charges)
          OR (account.account_class = 'expense' AND account.use_for_lease_credits)
        )
      )
    )
  FOR SHARE OF account, link, category;

  IF v_category_code IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active category account'
      USING ERRCODE = '22023', DETAIL = 'finance_account_category_incompatible';
  END IF;
  RETURN v_category_code;
END;
$$;

CREATE FUNCTION public.submit_expense_with_accounts(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_category_account_id uuid,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_currency public.currency_code,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_pay_from_account_id uuid,
  p_supporting_document_id uuid,
  p_vendor_person_id uuid,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_category text; v_source_id uuid; v_namespace text;
BEGIN
  v_namespace := CASE lower(btrim(coalesce(p_responsibility, '')))
    WHEN 'owner' THEN 'owner_expense' WHEN 'tenant' THEN 'tenant_billing' ELSE NULL END;
  IF v_namespace IS NULL THEN RAISE EXCEPTION 'Choose Owner or Tenant' USING ERRCODE = '22023'; END IF;
  v_category := app_private.resolve_chart_category_for_workflow(
    p_organization_id, p_category_account_id, v_namespace, p_property_id
  );
  v_source_id := app_private.resolve_chart_source_for_workflow(
    p_organization_id, p_pay_from_account_id, p_property_id, true
  );
  RETURN public.submit_expense(
    p_organization_id,p_property_id,p_unit_id,p_source_type,p_source_id,
    v_category,p_vendor_label,p_expense_date,p_internal_cost_amount,
    p_internal_markup_amount,p_currency,p_responsibility,p_tenant_invoice_id,
    v_source_id,p_supporting_document_id,p_vendor_person_id,p_reference,
    p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.review_expense_with_account(
  p_organization_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text,
  p_pay_from_account_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_property_id uuid; v_source_id uuid;
BEGIN
  SELECT submission.property_id INTO v_property_id
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = p_submission_id
  FOR SHARE;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF p_pay_from_account_id IS NOT NULL THEN
    v_source_id := app_private.resolve_chart_source_for_workflow(
      p_organization_id, p_pay_from_account_id, v_property_id, true
    );
  END IF;
  RETURN public.review_expense(
    p_organization_id,p_submission_id,p_decision,p_reason,p_idempotency_key,v_source_id
  );
END;
$$;

CREATE FUNCTION public.create_manual_tenant_charge_with_account(
  p_organization_id uuid,
  p_lease_id uuid,
  p_category_account_id uuid,
  p_billing_period_start date,
  p_due_date date,
  p_amount numeric,
  p_description text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_category text; v_property_id uuid;
BEGIN
  SELECT lease.property_id INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id AND lease.id = p_lease_id
  FOR SHARE;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  v_category := app_private.resolve_chart_category_for_workflow(
    p_organization_id,p_category_account_id,'tenant_billing',v_property_id
  );
  RETURN public.create_manual_tenant_charge(
    p_organization_id,p_lease_id,v_category,p_billing_period_start,p_due_date,
    p_amount,p_description,p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.record_tenant_invoice_payment_with_account(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_received_date date,
  p_receiving_account_id uuid,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_property_id uuid; v_source_id uuid;
BEGIN
  SELECT invoice.property_id INTO v_property_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id AND invoice.id = p_invoice_id
  FOR SHARE;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  v_source_id := app_private.resolve_chart_source_for_workflow(
    p_organization_id,p_receiving_account_id,v_property_id,false
  );
  RETURN public.record_tenant_invoice_payment(
    p_organization_id,p_invoice_id,p_amount,p_received_date,v_source_id,
    p_reference,p_allocations,p_idempotency_key
  );
END;
$$;

ALTER TABLE public.lease_deposit_events
  ADD COLUMN liability_account_id uuid;
ALTER TABLE public.lease_deposit_events
  ADD CONSTRAINT lease_deposit_events_org_liability_account_fkey
  FOREIGN KEY (organization_id, liability_account_id)
  REFERENCES public.finance_accounts(organization_id, id) ON DELETE RESTRICT;
CREATE INDEX lease_deposit_events_liability_account_idx
  ON public.lease_deposit_events(organization_id, liability_account_id)
  WHERE liability_account_id IS NOT NULL;

CREATE FUNCTION app_private.resolve_chart_deposit_liability(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account.id INTO v_account_id
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
    AND account.archived_at IS NULL
    AND account.account_class = 'liability'
    AND account.account_subtype = 'current_liability'
    AND account.use_for_lease_deposits
    AND (account.property_id IS NULL OR account.property_id = p_property_id)
  FOR SHARE;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Choose a compatible active deposit liability account'
      USING ERRCODE = '22023', DETAIL = 'finance_deposit_liability_incompatible';
  END IF;
  RETURN v_account_id;
END;
$$;

CREATE FUNCTION public.record_lease_deposit_event_with_account(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_liability_account_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid;
BEGIN
  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id AND deposit.id = p_lease_deposit_id
  FOR SHARE OF deposit, lease;
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

CREATE FUNCTION app_private.inherit_lease_deposit_liability_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.reversal_of_id IS NOT NULL AND NEW.liability_account_id IS NULL THEN
    SELECT original.liability_account_id INTO NEW.liability_account_id
    FROM public.lease_deposit_events AS original
    WHERE original.organization_id = NEW.organization_id
      AND original.id = NEW.reversal_of_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inherit_lease_deposit_liability_account
BEFORE INSERT ON public.lease_deposit_events
FOR EACH ROW EXECUTE FUNCTION app_private.inherit_lease_deposit_liability_account();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'finance_accounts','finance_account_roles',
    'finance_account_source_links','finance_account_category_links'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER privileged_email_step_up_enforcement '
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation()',
      v_table
    );
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', v_table);
    EXECUTE pg_catalog.format('GRANT SELECT ON public.%I TO authenticated', v_table);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION app_private.resolve_chart_source_for_workflow(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resolve_chart_category_for_workflow(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resolve_chart_deposit_liability(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.inherit_lease_deposit_liability_account() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_expense_with_accounts(uuid,uuid,uuid,text,uuid,uuid,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense_with_accounts(uuid,uuid,uuid,text,uuid,uuid,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.review_expense_with_account(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_expense_with_account(uuid,uuid,text,text,text,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_manual_tenant_charge_with_account(uuid,uuid,uuid,date,date,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_tenant_charge_with_account(uuid,uuid,uuid,date,date,numeric,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment_with_account(uuid,uuid,numeric,date,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_invoice_payment_with_account(uuid,uuid,numeric,date,uuid,text,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_lease_deposit_event_with_account(uuid,uuid,uuid,text,date,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event_with_account(uuid,uuid,uuid,text,date,numeric,text) TO authenticated;
