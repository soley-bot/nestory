-- An existing rent invoice is immutable period evidence. The generator already
-- returns it idempotently under its authority checks and advisory lock, but the
-- wrapper used to reject a retry as soon as today's billing rule had expired.
-- Allow that existing-evidence path through without authorizing any new charge
-- from an expired or missing rule. No financial rows are changed by migration.
DO $repair_retry$
DECLARE
  v_signature text;
  v_definition text;
  v_old constant text := '    IF NOT v_uses_lease_rule THEN';
  v_new constant text := $replacement$    IF NOT v_uses_lease_rule AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id = p_organization_id
        AND invoice.lease_id = p_lease_id
        AND invoice.billing_period_start = p_billing_period_start
        AND EXISTS (
          SELECT 1
          FROM public.tenant_invoice_lines AS line
          WHERE line.organization_id = invoice.organization_id
            AND line.invoice_id = invoice.id
            AND line.line_type = 'rent'
        )
    ) THEN$replacement$;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)',
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid,uuid)'
  ] LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_signature::regprocedure);
    IF (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, '')))
      / pg_catalog.length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Expected rent retry preflight anchor missing or ambiguous: %', v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
  END LOOP;
END;
$repair_retry$;

-- Finance Manager recovery keeps its actor, branch, current-month and open-
-- exception checks. Existing period evidence also permits its idempotent path
-- when the clock no longer selects a billing rule; new invoices still need one.
DO $repair_checked_retry$
DECLARE
  v_signature constant regprocedure :=
    'app_private.is_checked_current_rent_retry_generation(uuid,uuid,date,date,text,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_old constant text := 'WHERE resolved.billing_term_id IS NOT NULL';
  v_new constant text := $replacement$WHERE (resolved.billing_term_id IS NOT NULL OR EXISTS (
          SELECT 1
          FROM public.tenant_invoices AS invoice
          WHERE invoice.organization_id = p_organization_id
            AND invoice.lease_id = p_lease_id
            AND invoice.billing_period_start = p_billing_period_start
            AND EXISTS (
              SELECT 1
              FROM public.tenant_invoice_lines AS line
              WHERE line.organization_id = invoice.organization_id
                AND line.invoice_id = invoice.id
                AND line.line_type = 'rent'
            )
        ))$replacement$;
BEGIN
  IF (pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, '')))
    / pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected checked rent retry anchor missing or ambiguous';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$repair_checked_retry$;
