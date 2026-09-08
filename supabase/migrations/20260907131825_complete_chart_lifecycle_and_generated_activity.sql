-- Complete bootstrap through the existing category allocator: existing IDs,
-- links, and the private source UUID registry remain untouched.
CREATE TABLE app_private.finance_account_generated_categories (
  organization_id uuid NOT NULL,
  category_code text NOT NULL CHECK (category_code = 'management_fee'),
  category_id uuid NOT NULL,
  PRIMARY KEY (organization_id, category_code),
  FOREIGN KEY (organization_id, category_id)
    REFERENCES public.finance_categories (organization_id, id) ON DELETE RESTRICT
);
REVOKE ALL ON app_private.finance_account_generated_categories
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.complete_finance_account_catalog(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account record; v_category_id uuid;
BEGIN
  FOR v_account IN
    SELECT id FROM public.finance_accounts
    WHERE organization_id = p_organization_id AND archived_at IS NULL
      AND (account_class = 'expense'
        OR (account_class = 'income' AND use_for_lease_charges))
    ORDER BY id
  LOOP
    PERFORM app_private.ensure_finance_account_categories(
      p_organization_id, v_account.id, NULL
    );
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM app_private.finance_account_generated_categories
    WHERE organization_id = p_organization_id AND category_code = 'management_fee') THEN
    SELECT category.id INTO STRICT v_category_id
    FROM public.finance_accounts AS account
    JOIN public.finance_account_category_links AS link
      ON link.organization_id = account.organization_id AND link.account_id = account.id
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id AND category.id = link.category_id
    WHERE account.organization_id = p_organization_id
      AND account.account_class = 'expense' AND account.normalized_name = 'management fees'
      AND category.namespace = 'owner_expense';
    INSERT INTO app_private.finance_account_generated_categories
    VALUES (p_organization_id, 'management_fee', v_category_id);
    -- The generated workflow existed before Chart. Its initial category authority
    -- must cover that legacy history; subsequent transfers retain real timestamps.
    UPDATE app_private.finance_account_activity_authority_history
    SET valid_from = '-infinity'::timestamptz
    WHERE organization_id = p_organization_id AND authority_kind = 'category'
      AND authority_id = v_category_id::text AND valid_to IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app_private.finance_account_activity_authority_history AS previous
        WHERE previous.organization_id = p_organization_id
          AND previous.authority_kind = 'category'
          AND previous.authority_id = v_category_id::text AND previous.valid_to IS NOT NULL
      );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.complete_finance_account_catalog(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.complete_inserted_finance_account_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.complete_finance_account_catalog(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.complete_inserted_finance_account_catalog()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zzz_complete_finance_account_catalog
AFTER INSERT ON public.organizations FOR EACH ROW
EXECUTE FUNCTION app_private.complete_inserted_finance_account_catalog();
DO $$
DECLARE v_org uuid;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations ORDER BY id LOOP
    PERFORM app_private.complete_finance_account_catalog(v_org);
  END LOOP;
END;
$$;

-- Serialize hierarchy changes on the organization row, including direct DML.
-- A BEFORE trigger makes deferred constraint mode unable to admit grandchildren.
CREATE OR REPLACE FUNCTION app_private.enforce_finance_account_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_parent public.finance_accounts%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF NEW.parent_account_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.finance_accounts
    WHERE organization_id = NEW.organization_id AND id = NEW.parent_account_id
    FOR SHARE;
    IF NOT FOUND OR v_parent.account_class <> NEW.account_class
      OR v_parent.id = NEW.id OR v_parent.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Choose a parent with the same account type' USING ERRCODE = '23514';
    END IF;
    IF v_parent.parent_account_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.finance_accounts
      WHERE organization_id = NEW.organization_id AND parent_account_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Accounts support only one level of sub-accounts' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_accounts
    WHERE organization_id = NEW.organization_id AND parent_account_id = NEW.id
      AND account_class <> NEW.account_class) THEN
    RAISE EXCEPTION 'Choose a parent with the same account type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER enforce_finance_account_parent ON public.finance_accounts;
CREATE TRIGGER enforce_finance_account_parent
BEFORE INSERT OR UPDATE OF organization_id, parent_account_id, account_class
ON public.finance_accounts FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_account_parent();

CREATE OR REPLACE FUNCTION public.set_finance_account_archived(
  p_organization_id uuid,
  p_account_id uuid,
  p_archived boolean,
  p_replacement_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_account public.finance_accounts%ROWTYPE;
  v_replacement public.finance_accounts%ROWTYPE;
  v_needs_replacement boolean;
  v_source_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT source_id INTO v_source_id FROM public.finance_account_source_links
  WHERE organization_id = p_organization_id AND account_id = p_account_id;

  IF NOT coalesce(p_archived, true) THEN
    IF v_source_id IS NOT NULL THEN
      PERFORM public.restore_financial_reconciliation_source(p_organization_id, v_source_id);
    END IF;
    UPDATE public.finance_accounts AS account
    SET archived_at = NULL,
        archived_by = NULL,
        updated_by = v_actor_id
    WHERE account.organization_id = p_organization_id
      AND account.id = p_account_id;
    RETURN p_account_id;
  END IF;

  IF v_account.archived_at IS NOT NULL THEN
    RETURN p_account_id;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.finance_account_roles AS role
      WHERE role.organization_id = p_organization_id
        AND role.account_id = p_account_id
    )
    OR EXISTS (
      SELECT 1 FROM public.finance_account_category_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    )
  INTO v_needs_replacement;

  IF v_needs_replacement AND p_replacement_account_id IS NULL THEN
    RAISE EXCEPTION 'Choose a replacement default before making this account inactive'
      USING ERRCODE = '55000';
  END IF;

  IF p_replacement_account_id IS NOT NULL THEN
    SELECT account.* INTO v_replacement
    FROM public.finance_accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id = p_replacement_account_id
      AND account.id <> p_account_id
      AND account.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_replacement.account_class <> v_account.account_class THEN
      RAISE EXCEPTION 'Choose an active replacement with the same account type'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.finance_account_roles AS role
      WHERE role.organization_id = p_organization_id
        AND role.account_id = p_account_id
        AND NOT app_private.finance_account_role_is_compatible(
          role.role_code,
          v_replacement.account_class,
          v_replacement.account_subtype,
          v_replacement.use_for_lease_charges,
          v_replacement.use_for_lease_deposits
        )
    ) THEN
      RAISE EXCEPTION 'Replacement account is incompatible with the required default'
        USING ERRCODE = '22023';
    END IF;

    IF v_source_id IS NOT NULL AND (
      v_replacement.account_subtype <> v_account.account_subtype
      OR v_replacement.property_id IS DISTINCT FROM v_account.property_id
      OR NOT EXISTS (
        SELECT 1 FROM public.finance_account_source_links AS link
        JOIN public.financial_reconciliation_sources AS source
          ON source.organization_id = link.organization_id AND source.id = link.source_id
        WHERE link.organization_id = p_organization_id
          AND link.account_id = p_replacement_account_id AND source.archived_at IS NULL
          AND source.property_id IS NOT DISTINCT FROM v_replacement.property_id
          AND app_private.finance_account_source_is_compatible(
            source.source_kind, v_replacement.account_class, v_replacement.account_subtype
          )
      )
    ) THEN
      RAISE EXCEPTION 'Choose a replacement with the same account type and property availability'
        USING ERRCODE = '22023';
    END IF;

    -- Preserve each account's source identity; no balance or history is moved.
    UPDATE public.finance_account_category_links AS link
    SET account_id = p_replacement_account_id
    WHERE link.organization_id = p_organization_id
      AND link.account_id = p_account_id;

    UPDATE public.finance_account_roles AS role
    SET account_id = p_replacement_account_id
    WHERE role.organization_id = p_organization_id
      AND role.account_id = p_account_id;

    IF v_account.system_role IS NOT NULL THEN
      IF v_replacement.system_role IS NOT NULL THEN
        RAISE EXCEPTION 'Replacement account is already a protected default'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.finance_accounts AS account
      SET system_role = NULL,
          updated_by = v_actor_id
      WHERE account.organization_id = p_organization_id
        AND account.id = p_account_id;

      UPDATE public.finance_accounts AS account
      SET system_role = v_account.system_role,
          updated_by = v_actor_id
      WHERE account.organization_id = p_organization_id
        AND account.id = p_replacement_account_id;
    END IF;
  END IF;

  IF v_source_id IS NOT NULL THEN
    PERFORM public.archive_financial_reconciliation_source(p_organization_id, v_source_id);
  END IF;

  UPDATE public.finance_accounts AS account
  SET archived_at = now(),
      archived_by = v_actor_id,
      updated_by = v_actor_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id;

  RETURN p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.finance_account_role_is_compatible(text, text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.finance_account_source_is_compatible(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Resolve owner-allocation reversals against the account authority that applied
-- when the original allocation was created, so later role transfers cannot
-- relabel historical reversal activity.
CREATE OR REPLACE FUNCTION public.get_finance_account_activity_authorities(
  p_organization_id uuid,
  p_account_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  authority_kind text,
  authority_id text,
  valid_from timestamptz,
  valid_to timestamptz,
  event_key text,
  event_matches boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start
    OR p_period_end - p_period_start + 1 > 366 THEN
    RAISE EXCEPTION 'Activity period must be between 1 and 366 days.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
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
  ), exact_roots AS (
    SELECT 'tenant_invoice_line'::text AS event_type, line.id AS event_id,
      binding.primary_account_id AS account_id, line.property_id,
      line.recognized_on AS event_date
    FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
    JOIN app_private.financial_idempotency_requests AS request
      USING (organization_id, operation, idempotency_key)
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = request.organization_id
     AND line.id = CASE WHEN request.result_ids->>'lineId' ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (request.result_ids->>'lineId')::uuid END
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'create_manual_tenant_charge'
      AND request.status = 'completed'

    UNION ALL
    SELECT CASE responsibility.responsibility
        WHEN 'owner' THEN 'owner_invoice_line' ELSE 'tenant_invoice_line' END,
      coalesce(responsibility.owner_invoice_line_id,
        responsibility.tenant_invoice_line_id),
      binding.primary_account_id, submission.property_id,
      coalesce(owner_line.recognized_on, tenant_line.recognized_on)
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
    LEFT JOIN public.owner_invoice_lines AS owner_line
      ON owner_line.organization_id = responsibility.organization_id
     AND owner_line.id = responsibility.owner_invoice_line_id
    LEFT JOIN public.tenant_invoice_lines AS tenant_line
      ON tenant_line.organization_id = responsibility.organization_id
     AND tenant_line.id = responsibility.tenant_invoice_line_id
    WHERE binding.organization_id = p_organization_id
      AND binding.operation = 'submit_expense'
      AND request.status = 'completed'

    UNION ALL
    SELECT 'payment_allocation', allocation.id, binding.primary_account_id,
      allocation.property_id, allocation.paid_date
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

    UNION ALL
    SELECT 'receipt_allocation', allocation.id, binding.primary_account_id,
      allocation.property_id, allocation.received_date
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
    UNION ALL
    -- Generated rent has no Finance category ID. Resolve the actual default at
    -- original creation time, never today's account name or event date.
    SELECT 'tenant_invoice_line', line.id, history.account_id,
      line.property_id, line.recognized_on
    FROM public.tenant_invoice_lines AS line
    JOIN LATERAL (
      SELECT candidate.account_id
      FROM app_private.finance_account_activity_authority_history AS candidate
      WHERE candidate.organization_id = line.organization_id
        AND candidate.authority_kind = 'system_role'
        AND candidate.authority_id = 'rental_income'
        AND candidate.valid_from <= line.created_at
        AND (candidate.valid_to IS NULL OR line.created_at < candidate.valid_to)
      ORDER BY candidate.valid_from DESC LIMIT 1
    ) AS history ON true
    WHERE line.organization_id = p_organization_id
      AND line.line_type = 'rent' AND line.finance_category_id IS NULL
      AND line.reversal_of_id IS NULL

    UNION ALL
    -- The private canonical category registry survives display-name edits.
    -- Its ordinary category-link history also records lifecycle transfers.
    SELECT 'management_fee_occurrence', fee.id, history.account_id,
      fee.property_id, fee.fee_date
    FROM public.management_fee_occurrences AS fee
    JOIN app_private.finance_account_generated_categories AS generated
      ON generated.organization_id = fee.organization_id
     AND generated.category_code = 'management_fee'
    JOIN LATERAL (
      SELECT candidate.account_id
      FROM app_private.finance_account_activity_authority_history AS candidate
      WHERE candidate.organization_id = fee.organization_id
        AND candidate.authority_kind = 'category'
        AND candidate.authority_id = generated.category_id::text
        AND candidate.valid_from <= fee.created_at
        AND (candidate.valid_to IS NULL OR fee.created_at < candidate.valid_to)
      ORDER BY candidate.valid_from DESC LIMIT 1
    ) AS history ON true
    WHERE fee.organization_id = p_organization_id AND fee.reversal_of_id IS NULL
  ), exact_events AS (
    SELECT root.event_type || ':' || root.event_id::text AS event_key,
      root.account_id, root.property_id, root.event_date
    FROM exact_roots AS root
    WHERE root.event_date BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT 'tenant_invoice_line:' || reversal.id::text, root.account_id,
      reversal.property_id, reversal.recognized_on
    FROM exact_roots AS root
    JOIN public.tenant_invoice_lines AS reversal
      ON root.event_type = 'tenant_invoice_line'
     AND reversal.organization_id = p_organization_id
     AND reversal.reversal_of_id = root.event_id
    WHERE reversal.recognized_on BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT 'owner_invoice_line:' || reversal.id::text, root.account_id,
      reversal.property_id, reversal.recognized_on
    FROM exact_roots AS root
    JOIN public.owner_invoice_lines AS reversal
      ON root.event_type = 'owner_invoice_line'
     AND reversal.organization_id = p_organization_id
     AND reversal.reversal_of_id = root.event_id
    WHERE reversal.recognized_on BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT 'payment_allocation:' || reversal.id::text, root.account_id,
      reversal.property_id, reversal.paid_date
    FROM exact_roots AS root
    JOIN public.finance_payment_allocations AS reversal
      ON root.event_type = 'payment_allocation'
     AND reversal.organization_id = p_organization_id
     AND reversal.reversal_of_allocation_id = root.event_id
    WHERE reversal.paid_date BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT 'receipt_allocation:' || reversal.id::text, root.account_id,
      reversal.property_id, reversal.received_date
    FROM exact_roots AS root
    JOIN public.finance_receipt_allocations AS reversal
      ON root.event_type = 'receipt_allocation'
     AND reversal.organization_id = p_organization_id
     AND reversal.reversal_of_allocation_id = root.event_id
    WHERE reversal.received_date BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT 'management_fee_occurrence:' || reversal.id::text, root.account_id,
      reversal.property_id, reversal.fee_date
    FROM exact_roots AS root
    JOIN public.management_fee_occurrences AS reversal
      ON root.event_type = 'management_fee_occurrence'
     AND reversal.organization_id = p_organization_id
     AND reversal.reversal_of_id = root.event_id
    WHERE reversal.fee_date BETWEEN p_period_start AND p_period_end
    UNION ALL
    SELECT DISTINCT 'owner_balance_source:' || allocation_set.id::text,
      history.account_id, allocation_set.property_id, allocation_set.event_date
    FROM public.owner_event_allocation_sets AS allocation_set
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation_set.organization_id
     AND original_set.id = allocation_set.reversal_of_allocation_set_id
    JOIN LATERAL (
      SELECT candidate.account_id
      FROM app_private.finance_account_activity_authority_history AS candidate
      WHERE candidate.organization_id = allocation_set.organization_id
        AND candidate.authority_kind IN ('role', 'system_role')
        AND candidate.authority_id = CASE coalesce(
          original_set.source_type, allocation_set.source_type
        )
          WHEN 'owner_contribution' THEN 'owner_contributions'
          WHEN 'owner_distribution' THEN 'owner_distributions'
        END
        AND (candidate.valid_from = '-infinity'::timestamptz
          OR candidate.valid_from <= coalesce(
            original_set.created_at, allocation_set.created_at
          ))
        AND (candidate.valid_to IS NULL
          OR coalesce(original_set.created_at, allocation_set.created_at)
            < candidate.valid_to)
      ORDER BY CASE candidate.authority_kind
          WHEN 'system_role' THEN 0 ELSE 1 END,
        candidate.valid_from DESC, candidate.account_id
      LIMIT 1
    ) AS history ON true
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.event_date BETWEEN p_period_start AND p_period_end
      AND coalesce(original_set.source_type, allocation_set.source_type)
        IN ('owner_contribution', 'owner_distribution')
    UNION ALL
    SELECT 'deposit_event:' || event.id::text,
      coalesce(event.liability_account_id, original.liability_account_id),
      event.property_id, event.event_date
    FROM public.lease_deposit_events AS event
    LEFT JOIN public.lease_deposit_events AS original
      ON original.organization_id = event.organization_id
     AND original.id = event.reversal_of_id
    WHERE event.organization_id = p_organization_id
      AND coalesce(event.liability_account_id, original.liability_account_id)
        IS NOT NULL
      AND event.event_date BETWEEN p_period_start AND p_period_end
  )
  SELECT history.authority_kind, history.authority_id,
    history.valid_from, history.valid_to, NULL::text, true
  FROM app_private.finance_account_activity_authority_history AS history
  JOIN authorized_account ON authorized_account.id = history.account_id
  WHERE history.organization_id = p_organization_id
    AND history.valid_from < (p_period_end + 1)::timestamptz
    AND (history.valid_to IS NULL
      OR history.valid_to >= p_period_start::timestamptz)
  UNION ALL
  SELECT 'event', exact.event_key, '-infinity'::timestamptz,
    NULL::timestamptz, exact.event_key, exact.account_id = p_account_id
  FROM exact_events AS exact
  CROSS JOIN authorized_account
  WHERE (p_property_id IS NULL OR exact.property_id = p_property_id)
    AND app_private.can_read_finance_property(
      p_organization_id, exact.property_id
    );
END;
$$;

ALTER FUNCTION public.get_finance_account_activity_authorities(
  uuid, uuid, uuid, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_finance_account_activity_authorities(
  uuid, uuid, uuid, date, date
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_account_activity_authorities(
  uuid, uuid, uuid, date, date
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_finance_account_activity_authorities(
  uuid, uuid, uuid, date, date
) IS 'Returns bounded non-disclosing historical Chart authority plus tri-state exact event overrides, preserving original owner-allocation authority for reversals.';
