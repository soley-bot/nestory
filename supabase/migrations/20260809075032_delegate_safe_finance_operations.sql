-- Delegate only append-only, capacity-checked Finance operations. The function
-- definitions are carried forward from the immediately preceding schema; the
-- checked organization predicate and owner-confirmation replay preflight are
-- the only body changes made here.
DO $delegate_safe_finance_operations$
DECLARE
  v_definition text;
  v_target regprocedure;
BEGIN
  FOR v_target IN
    SELECT target
    FROM unnest(ARRAY[
      'public.record_tenant_invoice_payment(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure,
      'public.record_tenant_invoice_payment_internal(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure,
      'public.confirm_owner_collected_rent(uuid,uuid,numeric,date,text,jsonb,text)'::regprocedure,
      'public.confirm_owner_collected_rent_internal(uuid,uuid,numeric,date,text,jsonb,text)'::regprocedure,
      'public.record_owner_invoice_payment(uuid,uuid,numeric,date,text,text)'::regprocedure,
      'public.record_property_withdrawal(uuid,uuid,numeric,date,text,text)'::regprocedure,
      'app_private.settle_income_item_internal(uuid,uuid,numeric,date,uuid,text,text)'::regprocedure
    ]) AS functions(target)
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_target)
    INTO STRICT v_definition;

    IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
        v_definition,
        'app_private.is_org_admin(p_organization_id)',
        ''
      ))
    ) / pg_catalog.length('app_private.is_org_admin(p_organization_id)') <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one administrator predicate in %', v_target;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      'app_private.is_org_admin(p_organization_id)',
      'app_private.can_operate_finance(p_organization_id)'
    );

    IF v_target = 'public.confirm_owner_collected_rent_internal(uuid,uuid,numeric,date,text,jsonb,text)'::regprocedure THEN
      IF pg_catalog.strpos(v_definition, '  SELECT balance.balance_due') = 0 THEN
        RAISE EXCEPTION 'Expected owner-collection balance preflight is absent from %', v_target;
      END IF;

      -- Claim before mutable-balance validation so an exact completed retry
      -- returns its original immutable confirmation instead of being mistaken
      -- for a new over-settlement. The existing later claim safely reuses the
      -- same pending request during the first execution.
      v_definition := pg_catalog.replace(
        v_definition,
        '  SELECT balance.balance_due',
        $early_owner_collection_replay$
  v_payload := pg_catalog.jsonb_build_object(
    'invoiceId', p_invoice_id,
    'amount', p_amount,
    'confirmedDate', p_confirmed_date,
    'reference', NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    'allocations', coalesce(p_allocations, '[]'::jsonb)
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'confirm_owner_collected_rent',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'confirmationId')::uuid;
  END IF;

  SELECT balance.balance_due$early_owner_collection_replay$
      );
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$delegate_safe_finance_operations$;

CREATE OR REPLACE FUNCTION public.recover_rent_generation_exception(
  p_organization_id uuid,
  p_exception_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_exception public.rent_generation_exceptions%ROWTYPE;
  v_business_date date;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_retry_current_rent(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id = p_organization_id
    AND exception.id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found'
      USING ERRCODE = '23503';
  END IF;

  v_business_date := app_private.rent_business_date(
    p_organization_id,
    pg_catalog.now()
  );

  IF NOT app_private.is_super_admin(p_organization_id)
    AND v_exception.billing_period_start
      <> pg_catalog.date_trunc('month', v_business_date)::date THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    v_exception.lease_id,
    v_exception.billing_period_start,
    v_business_date,
    'manual_recovery',
    v_actor_id
  );
END;
$$;

COMMENT ON FUNCTION public.recover_rent_generation_exception(uuid, uuid)
IS 'Checked retry for one automatic-rent exception; Finance Manager is restricted to the current business month while Super Admin retains historical correction authority.';

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment(uuid, uuid, numeric, date, uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment(uuid, uuid, numeric, date, uuid, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_tenant_invoice_payment(uuid, uuid, numeric, date, uuid, text, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment_internal(uuid, uuid, numeric, date, uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment_internal(uuid, uuid, numeric, date, uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment_internal(uuid, uuid, numeric, date, uuid, text, jsonb, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(uuid, uuid, numeric, date, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(uuid, uuid, numeric, date, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_owner_collected_rent(uuid, uuid, numeric, date, text, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent_internal(uuid, uuid, numeric, date, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent_internal(uuid, uuid, numeric, date, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent_internal(uuid, uuid, numeric, date, text, jsonb, text) FROM authenticated;

REVOKE ALL ON FUNCTION app_private.settle_income_item_internal(uuid, uuid, numeric, date, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.settle_income_item_internal(uuid, uuid, numeric, date, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION app_private.settle_income_item_internal(uuid, uuid, numeric, date, uuid, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.record_owner_invoice_payment(uuid, uuid, numeric, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_owner_invoice_payment(uuid, uuid, numeric, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_owner_invoice_payment(uuid, uuid, numeric, date, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.record_property_withdrawal(uuid, uuid, numeric, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_property_withdrawal(uuid, uuid, numeric, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_property_withdrawal(uuid, uuid, numeric, date, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.recover_rent_generation_exception(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_rent_generation_exception(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recover_rent_generation_exception(uuid, uuid) TO authenticated;
