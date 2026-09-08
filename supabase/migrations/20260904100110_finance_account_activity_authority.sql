-- Preserve the account identity that owned an operational authority at the
-- time activity was recorded. Current mapping tables remain the write-path
-- authority; this private history is read only and append/close only.
CREATE TABLE app_private.finance_account_activity_authority_history (
  organization_id uuid NOT NULL,
  authority_kind text NOT NULL,
  authority_id text NOT NULL,
  account_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  CONSTRAINT finance_account_activity_authority_history_pkey
    PRIMARY KEY (organization_id, authority_kind, authority_id, account_id, valid_from),
  CONSTRAINT finance_account_activity_authority_history_kind_check
    CHECK (authority_kind IN ('source', 'category', 'role', 'system_role')),
  CONSTRAINT finance_account_activity_authority_history_range_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT finance_account_activity_authority_history_account_fkey
    FOREIGN KEY (organization_id, account_id)
    REFERENCES public.finance_accounts (organization_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX finance_account_activity_authority_history_open_idx
  ON app_private.finance_account_activity_authority_history (
    organization_id, authority_kind, authority_id
  ) WHERE valid_to IS NULL;

ALTER TABLE app_private.finance_account_activity_authority_history OWNER TO postgres;
REVOKE ALL ON TABLE app_private.finance_account_activity_authority_history
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO app_private.finance_account_activity_authority_history (
  organization_id, authority_kind, authority_id, account_id, valid_from
)
SELECT organization_id, 'source', source_id::text, account_id, '-infinity'::timestamptz
FROM public.finance_account_source_links
UNION ALL
SELECT organization_id, 'category', category_id::text, account_id, '-infinity'::timestamptz
FROM public.finance_account_category_links
UNION ALL
SELECT organization_id, 'role', role_code, account_id, '-infinity'::timestamptz
FROM public.finance_account_roles
UNION ALL
SELECT organization_id, 'system_role', system_role, id, '-infinity'::timestamptz
FROM public.finance_accounts
WHERE system_role IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE FUNCTION app_private.track_finance_account_activity_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_at timestamptz := transaction_timestamp();
  v_old_kind text;
  v_old_authority text;
  v_old_org uuid;
  v_old_account uuid;
  v_new_kind text;
  v_new_authority text;
  v_new_org uuid;
  v_new_account uuid;
BEGIN
  IF TG_TABLE_NAME = 'finance_account_source_links' THEN
    v_old_kind := 'source'; v_new_kind := 'source';
    IF TG_OP <> 'INSERT' THEN v_old_org := OLD.organization_id; v_old_account := OLD.account_id; v_old_authority := OLD.source_id::text; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_org := NEW.organization_id; v_new_account := NEW.account_id; v_new_authority := NEW.source_id::text; END IF;
  ELSIF TG_TABLE_NAME = 'finance_account_category_links' THEN
    v_old_kind := 'category'; v_new_kind := 'category';
    IF TG_OP <> 'INSERT' THEN v_old_org := OLD.organization_id; v_old_account := OLD.account_id; v_old_authority := OLD.category_id::text; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_org := NEW.organization_id; v_new_account := NEW.account_id; v_new_authority := NEW.category_id::text; END IF;
  ELSIF TG_TABLE_NAME = 'finance_account_roles' THEN
    v_old_kind := 'role'; v_new_kind := 'role';
    IF TG_OP <> 'INSERT' THEN v_old_org := OLD.organization_id; v_old_account := OLD.account_id; v_old_authority := OLD.role_code; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_org := NEW.organization_id; v_new_account := NEW.account_id; v_new_authority := NEW.role_code; END IF;
  ELSE
    v_old_kind := 'system_role'; v_new_kind := 'system_role';
    IF TG_OP <> 'INSERT' THEN v_old_org := OLD.organization_id; v_old_account := OLD.id; v_old_authority := OLD.system_role; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_org := NEW.organization_id; v_new_account := NEW.id; v_new_authority := NEW.system_role; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND v_old_org IS NOT DISTINCT FROM v_new_org
    AND v_old_account IS NOT DISTINCT FROM v_new_account
    AND v_old_authority IS NOT DISTINCT FROM v_new_authority THEN
    RETURN NEW;
  END IF;

  IF v_old_authority IS NOT NULL THEN
    UPDATE app_private.finance_account_activity_authority_history
    SET valid_to = v_at
    WHERE organization_id = v_old_org AND authority_kind = v_old_kind
      AND authority_id = v_old_authority AND account_id = v_old_account
      AND valid_to IS NULL;
  END IF;
  IF v_new_authority IS NOT NULL THEN
    INSERT INTO app_private.finance_account_activity_authority_history (
      organization_id, authority_kind, authority_id, account_id, valid_from
    ) VALUES (v_new_org, v_new_kind, v_new_authority, v_new_account, v_at);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER finance_account_activity_source_history
AFTER INSERT OR UPDATE OR DELETE ON public.finance_account_source_links
FOR EACH ROW EXECUTE FUNCTION app_private.track_finance_account_activity_authority();
CREATE TRIGGER finance_account_activity_category_history
AFTER INSERT OR UPDATE OR DELETE ON public.finance_account_category_links
FOR EACH ROW EXECUTE FUNCTION app_private.track_finance_account_activity_authority();
CREATE TRIGGER finance_account_activity_role_history
AFTER INSERT OR UPDATE OR DELETE ON public.finance_account_roles
FOR EACH ROW EXECUTE FUNCTION app_private.track_finance_account_activity_authority();
CREATE TRIGGER finance_account_activity_system_role_history
AFTER INSERT OR UPDATE OF system_role OR DELETE ON public.finance_accounts
FOR EACH ROW EXECUTE FUNCTION app_private.track_finance_account_activity_authority();

REVOKE ALL ON FUNCTION app_private.track_finance_account_activity_authority()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_finance_account_activity_authorities(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid DEFAULT NULL
)
RETURNS TABLE (
  authority_kind text,
  authority_id text,
  valid_from timestamptz,
  valid_to timestamptz,
  event_key text,
  event_matches boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH authorized_account AS (
    SELECT account.id
    FROM public.finance_accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id = p_account_id
      AND (p_property_id IS NULL OR account.property_id IS NULL
        OR account.property_id = p_property_id)
      AND app_private.can_read_finance_account(
        account.organization_id, account.property_id
      )
      AND (p_property_id IS NULL OR app_private.can_read_finance_property(
        p_organization_id, p_property_id
      ))
  ), exact_events AS (
    SELECT 'tenant_invoice_line:' || (request.result_ids->>'lineId') AS event_key,
      binding.primary_account_id AS account_id,
      invoice.property_id
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    JOIN app_private.financial_idempotency_requests AS request
      USING (organization_id, operation, idempotency_key)
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = request.organization_id
     AND line.id = CASE WHEN request.result_ids->>'lineId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'lineId')::uuid END
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'create_manual_tenant_charge'
      AND request.status = 'completed'
      AND request.result_ids->>'lineId' ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT CASE responsibility.responsibility
        WHEN 'owner' THEN 'owner_invoice_line:' || responsibility.owner_invoice_line_id::text
        ELSE 'tenant_invoice_line:' || responsibility.tenant_invoice_line_id::text
      END,
      binding.primary_account_id, submission.property_id
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    JOIN app_private.financial_idempotency_requests AS request
      USING (organization_id, operation, idempotency_key)
    JOIN public.expense_submissions AS submission
      ON submission.organization_id = request.organization_id
     AND submission.id = CASE WHEN request.result_ids->>'submission_id' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'submission_id')::uuid END
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.organization_id = submission.organization_id
     AND responsibility.id = submission.approved_responsibility_id
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'submit_expense'
      AND request.status = 'completed'
      AND submission.approved_responsibility_id IS NOT NULL
    UNION ALL
    SELECT 'payment_allocation:' || (request.result_ids->>'payment_allocation_id'),
      binding.primary_account_id, allocation.property_id
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    JOIN app_private.financial_idempotency_requests AS request
      USING (organization_id, operation, idempotency_key)
    JOIN public.finance_payment_allocations AS allocation
      ON allocation.organization_id = request.organization_id
     AND allocation.id = CASE WHEN request.result_ids->>'payment_allocation_id' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'payment_allocation_id')::uuid END
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'review_expense'
      AND request.status = 'completed'
      AND request.result_ids->>'payment_allocation_id' ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT 'receipt_allocation:' || allocation.id::text,
      binding.primary_account_id, allocation.property_id
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    JOIN app_private.financial_idempotency_requests AS request
      USING (organization_id, operation, idempotency_key)
    JOIN public.tenant_invoice_payment_allocations AS tenant_allocation
      ON tenant_allocation.organization_id = request.organization_id
     AND tenant_allocation.payment_id = CASE WHEN request.result_ids->>'paymentId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'paymentId')::uuid END
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.organization_id = tenant_allocation.organization_id
     AND allocation.receipt_id = tenant_allocation.finance_receipt_id
     AND allocation.income_item_id = tenant_allocation.income_item_id
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'record_tenant_invoice_payment'
      AND request.status = 'completed'
      AND request.result_ids->>'paymentId' ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT 'deposit_event:' || event.id::text, event.liability_account_id,
      event.property_id
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.liability_account_id IS NOT NULL
  )
  SELECT history.authority_kind, history.authority_id,
    history.valid_from, history.valid_to, NULL::text, true
  FROM app_private.finance_account_activity_authority_history AS history
  JOIN authorized_account ON authorized_account.id = history.account_id
  WHERE history.organization_id = p_organization_id
  UNION ALL
  SELECT 'event', exact.event_key, '-infinity'::timestamptz, NULL::timestamptz,
    exact.event_key, exact.account_id = p_account_id
  FROM exact_events AS exact
  CROSS JOIN authorized_account
  WHERE (p_property_id IS NULL OR exact.property_id = p_property_id)
    AND app_private.can_read_finance_property(p_organization_id, exact.property_id);
$$;

ALTER FUNCTION public.get_finance_account_activity_authorities(uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_finance_account_activity_authorities(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_account_activity_authorities(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_finance_account_activity_authorities(uuid, uuid, uuid)
IS 'Returns non-disclosing historical Chart authority and exact event overrides for one readable account/property scope.';
