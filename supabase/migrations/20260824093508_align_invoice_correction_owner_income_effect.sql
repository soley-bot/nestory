-- Keep invoice-correction owner effects aligned with the authoritative Owner
-- P&L resolver. Tenant-expense pass-through lines are excluded; all other
-- issued tenant lines, including their reversals, are owner-income evidence.

DO $migration$
DECLARE
  v_function regprocedure :=
    'app_private.mark_tenant_rent_owner_periods_stale(uuid,uuid,public.currency_code,uuid[],uuid,uuid)'::regprocedure;
  v_definition text;
  v_old text := $old$        AND line.line_type = 'rent'$old$;
  v_new text := $new$        AND NOT EXISTS (
          SELECT 1
          FROM public.ips_expense_responsibilities AS responsibility
          WHERE responsibility.organization_id = line.organization_id
            AND responsibility.responsibility = 'tenant'
            AND responsibility.tenant_invoice_line_id = coalesce(
              line.reversal_of_id,
              line.id
            )
        )$new$;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_function)
  INTO STRICT v_definition;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');
  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 2 THEN
    RAISE EXCEPTION
      'owner-period staling predicate drifted: expected 2 rent-only anchors, found %',
      v_occurrences;
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$migration$;

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.correct_tenant_invoice(uuid,uuid,text,uuid,text,text)'::regprocedure;
  v_definition text;
  v_old_classifier text :=
    $old$    pg_catalog.bool_or(line.line_type = 'rent')$old$;
  v_new_classifier text := $new$    pg_catalog.bool_or(NOT EXISTS (
      SELECT 1
      FROM public.ips_expense_responsibilities AS responsibility
      WHERE responsibility.organization_id = line.organization_id
        AND responsibility.responsibility = 'tenant'
        AND responsibility.tenant_invoice_line_id = coalesce(
          line.reversal_of_id,
          line.id
        )
    ))$new$;
  v_old_guard text := $old$        AND line.line_type = 'rent'$old$;
  v_new_guard text := $new$        AND NOT EXISTS (
          SELECT 1
          FROM public.ips_expense_responsibilities AS responsibility
          WHERE responsibility.organization_id = line.organization_id
            AND responsibility.responsibility = 'tenant'
            AND responsibility.tenant_invoice_line_id = coalesce(
              line.reversal_of_id,
              line.id
            )
        )$new$;
  v_old_fee_scope text := $old$    WHERE fee.organization_id = p_organization_id
      AND fee.tenant_invoice_id = p_invoice_id
      AND fee.reversal_of_id IS NULL$old$;
  v_new_fee_scope text := $new$    WHERE fee.organization_id = p_organization_id
      AND fee.tenant_invoice_id = p_invoice_id
      AND EXISTS (
        SELECT 1
        FROM public.tenant_invoice_lines AS target_line
        WHERE target_line.organization_id = p_organization_id
          AND target_line.id = ANY(v_target_line_ids)
          AND target_line.line_type = 'rent'
      )
      AND fee.reversal_of_id IS NULL$new$;
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_function)
  INTO STRICT v_definition;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition,
          v_old_classifier,
          ''
        ))
  ) / pg_catalog.length(v_old_classifier);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'invoice-correction classifier drifted: expected 1 rent-only anchor, found %',
      v_occurrences;
  END IF;
  v_definition := pg_catalog.replace(
    v_definition,
    v_old_classifier,
    v_new_classifier
  );

  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old_guard, ''))
  ) / pg_catalog.length(v_old_guard);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'invoice-correction closed-period guard drifted: expected 1 rent-only anchor, found %',
      v_occurrences;
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old_guard, v_new_guard);

  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition,
          v_old_fee_scope,
          ''
        ))
  ) / pg_catalog.length(v_old_fee_scope);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'invoice-correction fee scope drifted: expected 1 target anchor, found %',
      v_occurrences;
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old_fee_scope, v_new_fee_scope);
END;
$migration$;

ALTER FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  uuid, uuid, public.currency_code, uuid[], uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  uuid, uuid, public.currency_code, uuid[], uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) TO authenticated;

DO $migration$
DECLARE
  v_private regprocedure :=
    'app_private.mark_tenant_rent_owner_periods_stale(uuid,uuid,public.currency_code,uuid[],uuid,uuid)'::regprocedure;
  v_public regprocedure :=
    'public.correct_tenant_invoice(uuid,uuid,text,uuid,text,text)'::regprocedure;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid IN (v_private, v_public)
      AND (
        NOT procedure.prosecdef
        OR procedure.proowner <> 'postgres'::regrole
        OR NOT coalesce(
          procedure.proconfig @> ARRAY['search_path=""']::text[],
          false
        )
      )
  ) THEN
    RAISE EXCEPTION
      'invoice-correction function security contract was not preserved';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  uuid, uuid, public.currency_code, uuid[], uuid, uuid
) IS
  'Marks owner periods stale for corrected tenant-invoice owner-income evidence, excluding tenant-expense pass-throughs.';

COMMENT ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) IS
  'Atomically appends tenant, management-fee, owner-charge, and owner-balance reversals after settlement and responsibility-based Owner Close guards.';
