-- Delegate only append-only, capacity-checked Finance operations. The function
-- definitions are carried forward from the immediately preceding schema; the
-- checked organization predicate, completed-settlement replay preflights, and
-- the exact current-exception retry actor path are the only body changes here.
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
    v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

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

    IF v_target = 'public.record_tenant_invoice_payment_internal(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure THEN
      IF (
        pg_catalog.length(v_definition)
        - pg_catalog.length(pg_catalog.replace(
          v_definition,
          '  SELECT balance.balance_due',
          ''
        ))
      ) / pg_catalog.length('  SELECT balance.balance_due') <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one tenant-payment balance preflight in %', v_target;
      END IF;

      -- Claim before mutable-balance validation so an exact completed retry
      -- of a fully settled invoice returns the original immutable payment.
      -- The existing later claim safely reuses the pending request on first run.
      v_definition := pg_catalog.replace(
        v_definition,
        '  SELECT balance.balance_due',
        pg_catalog.replace($early_tenant_payment_replay$
  v_payload := pg_catalog.jsonb_build_object(
    'invoiceId', p_invoice_id,
    'amount', p_amount,
    'receivedDate', p_received_date,
    'reconciliationSourceId', p_reconciliation_source_id,
    'reference', NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    'allocations', coalesce(p_allocations, '[]'::jsonb)
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_tenant_invoice_payment',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'paymentId')::uuid;
  END IF;

  SELECT balance.balance_due$early_tenant_payment_replay$, E'\r\n', E'\n')
      );
    END IF;

    IF v_target = 'public.confirm_owner_collected_rent_internal(uuid,uuid,numeric,date,text,jsonb,text)'::regprocedure THEN
      IF (
        pg_catalog.length(v_definition)
        - pg_catalog.length(pg_catalog.replace(
          v_definition,
          '  SELECT balance.balance_due',
          ''
        ))
      ) / pg_catalog.length('  SELECT balance.balance_due') <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one owner-collection balance preflight in %', v_target;
      END IF;

      -- Claim before mutable-balance validation so an exact completed retry
      -- returns its original immutable confirmation instead of being mistaken
      -- for a new over-settlement. The existing later claim safely reuses the
      -- same pending request during the first execution.
      v_definition := pg_catalog.replace(
        v_definition,
        '  SELECT balance.balance_due',
        pg_catalog.replace($early_owner_collection_replay$
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

  SELECT balance.balance_due$early_owner_collection_replay$, E'\r\n', E'\n')
      );
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$delegate_safe_finance_operations$;

CREATE OR REPLACE FUNCTION app_private.is_checked_current_rent_retry_generation(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_actor_id IS NOT NULL
    AND p_actor_id = (SELECT auth.uid())
    AND app_private.can_retry_current_rent(p_organization_id)
    AND p_generation_source = 'manual_recovery'
    AND p_issue_date = app_private.rent_business_date(
      p_organization_id,
      pg_catalog.now()
    )
    AND p_billing_period_start = pg_catalog.date_trunc(
      'month',
      app_private.rent_business_date(p_organization_id, pg_catalog.now())
    )::date
    AND EXISTS (
      SELECT 1
      FROM public.rent_generation_exceptions AS exception
      WHERE exception.organization_id = p_organization_id
        AND exception.lease_id = p_lease_id
        AND exception.billing_period_start = p_billing_period_start
        AND exception.resolved_at IS NULL
    );
$$;

COMMENT ON FUNCTION app_private.is_checked_current_rent_retry_generation(uuid, uuid, date, date, text, uuid)
IS 'Fail-closed actor, operation, current-business-period, and unresolved-exception predicate used only by checked current-rent retry generation.';

REVOKE ALL ON FUNCTION app_private.is_checked_current_rent_retry_generation(uuid, uuid, date, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_checked_current_rent_retry_generation(uuid, uuid, date, date, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.is_checked_current_rent_retry_generation(uuid, uuid, date, date, text, uuid) FROM authenticated;

DO $delegate_checked_current_rent_generation$
DECLARE
  v_definition text;
  v_original_guard text := pg_catalog.replace($original_super_admin_guard$  IF p_actor_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = p_actor_id
        AND membership.role = 'super_admin'
    ) THEN
    RAISE EXCEPTION 'A Super Admin is required for automatic rent generation'
      USING ERRCODE = '42501';
  END IF;$original_super_admin_guard$, E'\r\n', E'\n');
  v_checked_guard text := pg_catalog.replace($checked_current_retry_guard$  IF p_actor_id IS NULL
    OR NOT (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS membership
        WHERE membership.organization_id = p_organization_id
          AND membership.user_id = p_actor_id
          AND membership.role = 'super_admin'
      )
      OR app_private.is_checked_current_rent_retry_generation(
        p_organization_id,
        p_lease_id,
        p_billing_period_start,
        p_issue_date,
        p_generation_source,
        p_actor_id
      )
    ) THEN
    RAISE EXCEPTION 'A Super Admin is required for automatic rent generation'
      USING ERRCODE = '42501';
  END IF;$checked_current_retry_guard$, E'\r\n', E'\n');
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure
  )
  INTO STRICT v_definition;

  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  IF (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_original_guard, ''))
  ) / pg_catalog.length(v_original_guard) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one rent-generation actor guard';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_original_guard,
    v_checked_guard
  );

  EXECUTE v_definition;
END;
$delegate_checked_current_rent_generation$;

CREATE OR REPLACE FUNCTION app_private.try_generate_current_rent_retry(
  p_organization_id uuid,
  p_exception_id uuid,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_date date;
  v_exception public.rent_generation_exceptions%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL
    OR p_actor_id IS DISTINCT FROM (SELECT auth.uid())
    OR NOT app_private.can_retry_current_rent(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_business_date := app_private.rent_business_date(
    p_organization_id,
    pg_catalog.now()
  );

  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id = p_organization_id
    AND exception.id = p_exception_id
    AND exception.resolved_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_exception.billing_period_start
    <> pg_catalog.date_trunc('month', v_business_date)::date THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    v_exception.lease_id,
    v_exception.billing_period_start,
    v_business_date,
    'manual_recovery',
    p_actor_id
  );
END;
$$;

COMMENT ON FUNCTION app_private.try_generate_current_rent_retry(uuid, uuid, uuid)
IS 'Private checked generator for one unresolved current-business-month exception attributed to the authenticated retry actor.';

REVOKE ALL ON FUNCTION app_private.try_generate_current_rent_retry(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.try_generate_current_rent_retry(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.try_generate_current_rent_retry(uuid, uuid, uuid) FROM authenticated;

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

  IF app_private.is_super_admin(p_organization_id) THEN
    RETURN app_private.try_generate_lease_rent_invoice(
      p_organization_id,
      v_exception.lease_id,
      v_exception.billing_period_start,
      v_business_date,
      'manual_recovery',
      v_actor_id
    );
  END IF;

  RETURN app_private.try_generate_current_rent_retry(
    p_organization_id,
    p_exception_id,
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
