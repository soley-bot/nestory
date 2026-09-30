-- Delegate one current issued rent correction to the property-scoped Finance
-- Manager permission without widening historical, management-fee, or reopen
-- authority. The existing audited correction implementation retains its
-- preview hash, idempotency, settlement replay, owner-cash, and close guards.
CREATE FUNCTION app_private.can_edit_current_issued_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_due_day integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(EXISTS (
    SELECT 1
    FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_invoice_id
      AND invoice.lifecycle = 'issued'
      AND invoice.generation_source = 'lease_rules_v1'
      AND app_private.rent_business_date(p_organization_id)
        BETWEEN invoice.billing_period_start AND invoice.billing_period_end
      AND p_corrected_due_day = extract(day FROM invoice.due_date)::integer
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_corrections AS correction
        WHERE correction.organization_id = invoice.organization_id
          AND correction.tenant_invoice_id = invoice.id
          AND correction.action = 'historical_rent'
      )
      AND app_private.can_access_property(
        p_organization_id,
        invoice.property_id,
        'finance.correct_records'::public.organization_permission_key
      )
  ), false);
$$;

ALTER FUNCTION app_private.can_edit_current_issued_rent(uuid, uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.can_edit_current_issued_rent(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION app_private.can_edit_current_issued_rent(uuid, uuid, integer)
IS 'Fail-closed authority for one current issued lease-rent amount: Super Admin remains on the historical path; ordinary callers need finance.correct_records on the invoice Property exact active assigned branch and cannot change its due date.';

CREATE OR REPLACE FUNCTION public.preview_historical_rent_correction(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_rent_amount numeric,
  p_corrected_due_day integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT (
      app_private.is_org_admin(p_organization_id)
      OR app_private.can_edit_current_issued_rent(
        p_organization_id,
        p_invoice_id,
        p_corrected_due_day
      )
    ) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN app_private.build_historical_rent_correction_preview(
    p_organization_id,
    p_invoice_id,
    p_corrected_rent_amount,
    p_corrected_due_day
  );
END;
$$;

DO $migration$
DECLARE
  definition text;
  old_guard text;
  new_guard text;
BEGIN
  definition := replace(pg_get_functiondef(
    'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)'::regprocedure
  ), chr(13), '');
  old_guard := $guard$IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN$guard$;
  new_guard := $guard$IF v_actor_id IS NULL
    OR NOT (
      app_private.is_org_admin(p_organization_id)
      OR EXISTS (
        SELECT 1
        FROM public.tenant_invoices AS replay_invoice
        WHERE replay_invoice.organization_id = p_organization_id
          AND replay_invoice.id = p_invoice_id
          AND replay_invoice.generation_source = 'lease_rules_v1'
          AND p_corrected_due_day = extract(day FROM replay_invoice.due_date)::integer
          AND app_private.can_access_property(
            p_organization_id,
            replay_invoice.property_id,
            'finance.correct_records'::public.organization_permission_key
          )
      )
    ) THEN$guard$;
  IF array_length(string_to_array(definition, old_guard), 1) <> 2 THEN
    RAISE EXCEPTION 'current_rent_apply_authority_guard_mismatch';
  END IF;
  definition := replace(definition, old_guard, new_guard);

  old_guard := $guard$  SELECT invoice.* INTO v_invoice$guard$;
  new_guard := $guard$  IF NOT (
      app_private.is_org_admin(p_organization_id)
      OR app_private.can_edit_current_issued_rent(
        p_organization_id,
        p_invoice_id,
        p_corrected_due_day
      )
    ) THEN$guard$;
  IF array_length(string_to_array(definition, old_guard), 1) <> 2 THEN
    RAISE EXCEPTION 'current_rent_apply_lock_guard_mismatch';
  END IF;
  EXECUTE replace(definition, old_guard, new_guard || E'\n    RAISE EXCEPTION ''historical_rent_correction_forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n\n  SELECT invoice.* INTO v_invoice');
END;
$migration$;

COMMENT ON FUNCTION public.preview_historical_rent_correction(
  uuid, uuid, numeric, integer
) IS 'Previews an audited issued-rent correction. Super Admin retains historical authority; a property-scoped finance.correct_records delegate may preview only the current issued period.';

COMMENT ON FUNCTION public.correct_historical_rent(
  uuid, uuid, numeric, integer, text, text, text
) IS 'Applies an append-only issued-rent replacement with checked settlement replay. Super Admin retains historical authority; a property-scoped finance.correct_records delegate may correct only the current issued period.';
