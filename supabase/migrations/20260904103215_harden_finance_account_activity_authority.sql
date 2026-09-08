-- Bound the non-disclosing activity authority contract and make exact workflow
-- bindings authoritative for both their original event and any reversal.
DROP FUNCTION public.get_finance_account_activity_authorities(uuid, uuid, uuid);

CREATE INDEX finance_account_activity_authority_history_lookup_idx
  ON app_private.finance_account_activity_authority_history (
    organization_id, account_id, valid_from, valid_to
  );

CREATE FUNCTION public.get_finance_account_activity_authorities(
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
          OR candidate.valid_from <= allocation_set.created_at)
        AND (candidate.valid_to IS NULL
          OR allocation_set.created_at < candidate.valid_to)
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
) IS 'Returns bounded non-disclosing historical Chart authority plus tri-state exact event overrides for one readable account/property scope.';
