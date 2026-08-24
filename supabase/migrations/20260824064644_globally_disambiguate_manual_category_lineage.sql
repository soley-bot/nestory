CREATE OR REPLACE FUNCTION app_private.valid_finance_category_idempotency_result(
  p_organization_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_require_seal boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result_id uuid;
BEGIN
  IF p_operation = 'submit_expense' THEN
    SELECT submission.id
    INTO v_result_id
    FROM app_private.financial_idempotency_requests AS request
    JOIN public.expense_submissions AS submission
      ON submission.organization_id = request.organization_id
     AND submission.id = CASE
       WHEN request.result_ids->>'submission_id' ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (request.result_ids->>'submission_id')::uuid
       ELSE NULL
     END
     AND submission.idempotency_key = request.idempotency_key
     AND submission.request_payload_hash = request.payload_hash
     AND submission.submitted_by = request.actor_id
     AND submission.responsibility IN ('owner', 'tenant')
    WHERE request.organization_id = p_organization_id
      AND request.operation = p_operation
      AND request.idempotency_key = p_idempotency_key
      AND request.status = 'completed'
      AND (
        NOT p_require_seal
        OR EXISTS (
          SELECT 1
          FROM app_private.finance_category_idempotency_result_seals AS seal
          WHERE seal.organization_id = request.organization_id
            AND seal.operation = request.operation
            AND seal.idempotency_key = request.idempotency_key
            AND seal.result_id = submission.id
        )
      );
  ELSIF p_operation = 'create_manual_tenant_charge' THEN
    WITH request_row AS (
      SELECT request.*
      FROM app_private.financial_idempotency_requests AS request
      WHERE request.organization_id = p_organization_id
        AND request.operation = p_operation
        AND request.idempotency_key = p_idempotency_key
        AND request.status = 'completed'
        AND request.actor_id IS NOT NULL
    ), candidates AS (
      SELECT
        request.organization_id,
        request.operation,
        request.idempotency_key,
        request.result_ids,
        activity.id AS activity_id,
        invoice.id AS invoice_id,
        invoice.lease_id,
        line.id AS line_id
      FROM request_row AS request
      JOIN public.activity_logs AS activity
        ON activity.organization_id = request.organization_id
       AND activity.actor_id = request.actor_id
       AND activity.entity_type = 'tenant_invoice'
       AND activity.action = 'manual_tenant_charge_created'
       AND lower(btrim(coalesce(activity.new_values->>'chargeType', '')))
         IN ('utilities', 'cleaning', 'repairs_maintenance', 'other')
       AND app_private.canonical_financial_payload_hash(
         activity.new_values - 'invoiceId' - 'lineId'
       ) = request.payload_hash
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id = request.organization_id
       AND invoice.id = CASE
         WHEN activity.new_values->>'invoiceId' ~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (activity.new_values->>'invoiceId')::uuid
         ELSE NULL
       END
       AND activity.entity_id = invoice.id
       AND activity.new_values->>'leaseId' = invoice.lease_id::text
      JOIN public.tenant_invoice_lines AS line
        ON line.organization_id = invoice.organization_id
       AND line.id = CASE
         WHEN activity.new_values->>'lineId' ~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (activity.new_values->>'lineId')::uuid
         ELSE NULL
       END
       AND line.invoice_id = invoice.id
       AND line.line_type <> 'rent'
       AND line.income_item_id IS NOT NULL
      JOIN public.finance_income_items AS income
        ON income.organization_id = line.organization_id
       AND income.id = line.income_item_id
       AND income.lease_id = invoice.lease_id
       AND income.income_type <> 'rent'
    ), unique_candidate AS (
      SELECT candidate.*
      FROM candidates AS candidate
      CROSS JOIN (
        SELECT pg_catalog.count(*) AS candidate_count
        FROM candidates
      ) AS cardinality
      WHERE cardinality.candidate_count = 1
    )
    SELECT candidate.line_id
    INTO v_result_id
    FROM unique_candidate AS candidate
    WHERE candidate.invoice_id = CASE
        WHEN candidate.result_ids->>'invoiceId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (candidate.result_ids->>'invoiceId')::uuid
        ELSE NULL
      END
      AND candidate.lease_id = CASE
        WHEN candidate.result_ids->>'leaseId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (candidate.result_ids->>'leaseId')::uuid
        ELSE NULL
      END
      AND candidate.line_id = CASE
        WHEN candidate.result_ids->>'lineId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (candidate.result_ids->>'lineId')::uuid
        ELSE NULL
      END
      AND (
        NOT p_require_seal
        OR EXISTS (
          SELECT 1
          FROM app_private.finance_category_idempotency_result_seals AS seal
          WHERE seal.organization_id = candidate.organization_id
            AND seal.operation = candidate.operation
            AND seal.idempotency_key = candidate.idempotency_key
            AND seal.result_id = candidate.line_id
        )
      );
  END IF;

  RETURN v_result_id;
END;
$$;

ALTER FUNCTION app_private.valid_finance_category_idempotency_result(
  uuid, text, text, boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.valid_finance_category_idempotency_result(
  uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

DELETE FROM app_private.finance_category_idempotency_bindings AS binding
WHERE binding.operation = 'create_manual_tenant_charge'
  AND app_private.valid_finance_category_idempotency_result(
    binding.organization_id,
    binding.operation,
    binding.idempotency_key,
    false
  ) IS NULL;
