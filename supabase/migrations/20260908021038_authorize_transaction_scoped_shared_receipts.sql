-- Follow-up to 20260908015355: both retained canonical child routines also
-- validate the receipt property. Allow the shared receipt only inside the
-- signed, checked parent workflow; preserve every existing receipt check.
CREATE FUNCTION app_private.expense_transaction_evidence_covers_property(
  p_organization_id uuid, p_property_id uuid, p_document_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_transactions AS transaction
    JOIN public.documents AS document
      ON document.organization_id = transaction.organization_id
     AND document.id = transaction.supporting_document_id
    WHERE transaction.organization_id = p_organization_id
      AND transaction.supporting_document_id = p_document_id
      AND transaction.id::text = current_setting('app.expense_transaction_id', true)
      AND current_setting('app.expense_transaction_operation', true) IN ('submit', 'review')
      AND app_private.has_expense_transaction_context(p_organization_id, transaction.id, NULL)
      AND EXISTS (
        SELECT 1 FROM public.expense_transaction_scopes AS scope
        WHERE scope.organization_id = transaction.organization_id
          AND scope.transaction_id = transaction.id
          AND scope.property_id = p_property_id
      )
      AND EXISTS (
        SELECT 1 FROM public.expense_transaction_scopes AS scope
        WHERE scope.organization_id = transaction.organization_id
          AND scope.transaction_id = transaction.id
          AND scope.property_id = document.property_id
      )
  );
$$;
REVOKE ALL ON FUNCTION app_private.expense_transaction_evidence_covers_property(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $transaction_receipt_scope$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_old := E'        OR document.property_id = p_property_id\n      )';
  v_new := E'        OR document.property_id = p_property_id\n        OR app_private.expense_transaction_evidence_covers_property(\n          p_organization_id, p_property_id, document.id\n        )\n      )';
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'expense_transaction_submit_receipt_scope_contract_changed';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  SELECT pg_catalog.pg_get_functiondef(
    'app_private.review_expense_baseline_track6_evidence(uuid,uuid,text,text,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_old := E'          OR document.property_id = v_submission.property_id\n        )';
  v_new := E'          OR document.property_id = v_submission.property_id\n          OR app_private.expense_transaction_evidence_covers_property(\n            p_organization_id, v_submission.property_id, document.id\n          )\n        )';
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'expense_transaction_review_receipt_scope_contract_changed';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$transaction_receipt_scope$;
