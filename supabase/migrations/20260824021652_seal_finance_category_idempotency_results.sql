CREATE TABLE app_private.finance_category_idempotency_result_seals (
  organization_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  result_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_category_idempotency_result_seals_pkey
    PRIMARY KEY (organization_id, operation, idempotency_key),
  CONSTRAINT finance_category_idempotency_result_seals_operation_check
    CHECK (operation IN ('submit_expense', 'create_manual_tenant_charge')),
  CONSTRAINT finance_category_idempotency_result_seals_request_fkey
    FOREIGN KEY (organization_id, operation, idempotency_key)
    REFERENCES app_private.financial_idempotency_requests (
      organization_id, operation, idempotency_key
    )
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE app_private.finance_category_idempotency_result_seals
  OWNER TO postgres;
REVOKE ALL ON TABLE app_private.finance_category_idempotency_result_seals
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.finance_category_idempotency_result_seals IS
  'Append-only request-to-business-result identity validated from durable Finance lineage.';

CREATE FUNCTION app_private.reject_finance_category_result_seal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Finance category idempotency result seals are immutable'
    USING ERRCODE = '55000',
      DETAIL = 'finance_category_idempotency_result_seal_immutable';
END;
$$;

ALTER FUNCTION app_private.reject_finance_category_result_seal_mutation()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  app_private.reject_finance_category_result_seal_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER finance_category_idempotency_result_seals_immutable
BEFORE UPDATE OR DELETE
ON app_private.finance_category_idempotency_result_seals
FOR EACH ROW
EXECUTE FUNCTION app_private.reject_finance_category_result_seal_mutation();

CREATE FUNCTION app_private.valid_finance_category_idempotency_result(
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
    SELECT line.id
    INTO v_result_id
    FROM app_private.financial_idempotency_requests AS request
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = request.organization_id
     AND line.id = CASE
       WHEN request.result_ids->>'lineId' ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (request.result_ids->>'lineId')::uuid
       ELSE NULL
     END
     AND line.line_type <> 'rent'
     AND line.income_item_id IS NOT NULL
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
     AND invoice.id = CASE
       WHEN request.result_ids->>'invoiceId' ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (request.result_ids->>'invoiceId')::uuid
       ELSE NULL
     END
     AND invoice.lease_id = CASE
       WHEN request.result_ids->>'leaseId' ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (request.result_ids->>'leaseId')::uuid
       ELSE NULL
     END
    JOIN public.finance_income_items AS income
      ON income.organization_id = line.organization_id
     AND income.id = line.income_item_id
     AND income.lease_id = invoice.lease_id
     AND income.income_type <> 'rent'
    WHERE request.organization_id = p_organization_id
      AND request.operation = p_operation
      AND request.idempotency_key = p_idempotency_key
      AND request.status = 'completed'
      AND request.actor_id IS NOT NULL
      AND 1 = (
        SELECT pg_catalog.count(*)
        FROM public.activity_logs AS activity
        WHERE activity.organization_id = request.organization_id
          AND activity.actor_id = request.actor_id
          AND activity.entity_type = 'tenant_invoice'
          AND activity.entity_id = invoice.id
          AND activity.action = 'manual_tenant_charge_created'
          AND activity.new_values->>'invoiceId' = invoice.id::text
          AND activity.new_values->>'lineId' = line.id::text
          AND activity.new_values->>'leaseId' = invoice.lease_id::text
          AND lower(btrim(coalesce(activity.new_values->>'chargeType', '')))
            IN ('utilities', 'cleaning', 'repairs_maintenance', 'other')
          AND app_private.canonical_financial_payload_hash(
            activity.new_values - 'invoiceId' - 'lineId'
          ) = request.payload_hash
      )
      AND (
        NOT p_require_seal
        OR EXISTS (
          SELECT 1
          FROM app_private.finance_category_idempotency_result_seals AS seal
          WHERE seal.organization_id = request.organization_id
            AND seal.operation = request.operation
            AND seal.idempotency_key = request.idempotency_key
            AND seal.result_id = line.id
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

INSERT INTO app_private.finance_category_idempotency_result_seals (
  organization_id,
  operation,
  idempotency_key,
  result_id
)
SELECT
  request.organization_id,
  request.operation,
  request.idempotency_key,
  validated.result_id
FROM app_private.financial_idempotency_requests AS request
CROSS JOIN LATERAL (
  SELECT app_private.valid_finance_category_idempotency_result(
    request.organization_id,
    request.operation,
    request.idempotency_key,
    false
  ) AS result_id
) AS validated
WHERE request.operation IN ('submit_expense', 'create_manual_tenant_charge')
  AND request.status = 'completed'
  AND validated.result_id IS NOT NULL
ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

DELETE FROM app_private.finance_category_idempotency_bindings AS binding
WHERE binding.operation IN ('submit_expense', 'create_manual_tenant_charge')
  AND NOT EXISTS (
    SELECT 1
    FROM app_private.finance_category_idempotency_result_seals AS seal
    WHERE seal.organization_id = binding.organization_id
      AND seal.operation = binding.operation
      AND seal.idempotency_key = binding.idempotency_key
  );

DO $migration$
DECLARE
  v_function constant regprocedure :=
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text;
  v_new text;
BEGIN
  v_old := $old$  v_unbound_request_exists boolean := false;
BEGIN$old$;
  v_new := $new$  v_unbound_request_exists boolean := false;
  v_validated_result_id uuid;
BEGIN$new$;
  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Expected one expense lineage declaration anchor';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$  PERFORM 1
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.operation = 'submit_expense'
    AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    AND request.status = 'completed'
    AND request.result_ids->>'submission_id' = v_submission_id::text
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  PERFORM 1
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.id = v_submission_id
    AND submission.responsibility = v_responsibility
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;$old$;
  v_new := $new$  v_validated_result_id :=
    app_private.valid_finance_category_idempotency_result(
      p_organization_id,
      'submit_expense',
      btrim(coalesce(p_idempotency_key, '')),
      NOT coalesce(v_binding_inserted, false)
    );
  IF v_validated_result_id IS DISTINCT FROM v_submission_id THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  IF coalesce(v_binding_inserted, false) THEN
    INSERT INTO app_private.finance_category_idempotency_result_seals (
      organization_id, operation, idempotency_key, result_id
    ) VALUES (
      p_organization_id, 'submit_expense',
      btrim(coalesce(p_idempotency_key, '')), v_submission_id
    )
    ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

    PERFORM 1
    FROM app_private.finance_category_idempotency_result_seals AS seal
    WHERE seal.organization_id = p_organization_id
      AND seal.operation = 'submit_expense'
      AND seal.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
      AND seal.result_id = v_submission_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Finance category idempotency result is unavailable'
        USING ERRCODE = '23514',
          DETAIL = 'finance_category_idempotency_result_missing';
    END IF;
  END IF;$new$;
  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Expected one expense result-validation block';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_function constant regprocedure :=
    'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text;
  v_new text;
BEGIN
  v_old := $old$  v_unbound_request_exists boolean := false;
BEGIN$old$;
  v_new := $new$  v_unbound_request_exists boolean := false;
  v_validated_result_id uuid;
BEGIN$new$;
  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Expected one manual-charge lineage declaration anchor';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$      SELECT line.description
      INTO v_effective_description
      FROM app_private.financial_idempotency_requests AS request
      JOIN public.tenant_invoice_lines AS line
        ON request.result_ids->>'lineId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND line.organization_id = request.organization_id
       AND line.id = (request.result_ids->>'lineId')::uuid
      WHERE request.organization_id = p_organization_id
        AND request.operation = 'create_manual_tenant_charge'
        AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
        AND request.status = 'completed';$old$;
  v_new := $new$      v_line_id := app_private.valid_finance_category_idempotency_result(
        p_organization_id,
        'create_manual_tenant_charge',
        btrim(coalesce(p_idempotency_key, '')),
        true
      );
      SELECT line.description
      INTO v_effective_description
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.id = v_line_id;$new$;
  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Expected one manual-charge historical-description block';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$  PERFORM 1
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.operation = 'create_manual_tenant_charge'
    AND request.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    AND request.status = 'completed'
    AND request.result_ids->>'lineId' = v_line_id::text
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  PERFORM 1
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = v_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;$old$;
  v_new := $new$  v_validated_result_id :=
    app_private.valid_finance_category_idempotency_result(
      p_organization_id,
      'create_manual_tenant_charge',
      btrim(coalesce(p_idempotency_key, '')),
      NOT coalesce(v_binding_inserted, false)
    );
  IF v_validated_result_id IS DISTINCT FROM v_line_id THEN
    RAISE EXCEPTION 'Finance category idempotency result is unavailable'
      USING ERRCODE = '23514',
        DETAIL = 'finance_category_idempotency_result_missing';
  END IF;

  IF coalesce(v_binding_inserted, false) THEN
    INSERT INTO app_private.finance_category_idempotency_result_seals (
      organization_id, operation, idempotency_key, result_id
    ) VALUES (
      p_organization_id, 'create_manual_tenant_charge',
      btrim(coalesce(p_idempotency_key, '')), v_line_id
    )
    ON CONFLICT (organization_id, operation, idempotency_key) DO NOTHING;

    PERFORM 1
    FROM app_private.finance_category_idempotency_result_seals AS seal
    WHERE seal.organization_id = p_organization_id
      AND seal.operation = 'create_manual_tenant_charge'
      AND seal.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
      AND seal.result_id = v_line_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Finance category idempotency result is unavailable'
        USING ERRCODE = '23514',
          DETAIL = 'finance_category_idempotency_result_missing';
    END IF;
  END IF;$new$;
  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Expected one manual-charge result-validation block';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END;
$migration$;
