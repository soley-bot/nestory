-- Track 3 delegates only the ordinary settlement corrections whose immutable
-- owner sources are already registered. Exceptional/expense reversals remain
-- Super Admin-only.

DO $clone_guarded_direct_owner_reversal$
DECLARE
  v_definition text;
  v_guarded_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reverse_owner_collection_confirmation(uuid,uuid,date,text,text)'::regprocedure
  )
  INTO v_definition;

  v_guarded_definition := pg_catalog.replace(
    v_definition,
    'CREATE OR REPLACE FUNCTION public.reverse_owner_collection_confirmation',
    'CREATE OR REPLACE FUNCTION app_private.reverse_owner_collection_after_allocation_guard'
  );
  v_guarded_definition := pg_catalog.replace(
    v_guarded_definition,
    'OR NOT app_private.is_org_admin(p_organization_id)',
    'OR NOT app_private.can_correct_finance(p_organization_id)'
  );

  IF v_guarded_definition = v_definition
    OR pg_catalog.strpos(
      v_guarded_definition,
      'app_private.reverse_owner_collection_after_allocation_guard'
    ) = 0
    OR pg_catalog.strpos(
      v_guarded_definition,
      'app_private.can_correct_finance(p_organization_id)'
    ) = 0 THEN
    RAISE EXCEPTION 'owner_collection_reversal_clone_contract_changed'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE v_guarded_definition;
END;
$clone_guarded_direct_owner_reversal$;

ALTER FUNCTION app_private.reverse_owner_collection_after_allocation_guard(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.reverse_owner_collection_after_allocation_guard(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_owner_collection_confirmation(
  p_organization_id uuid,
  p_confirmation_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_original public.owner_collection_confirmations%ROWTYPE;
  v_original_allocation record;
  v_reversal_confirmation_id uuid;
  v_reversal_allocation record;
  v_allocation_result jsonb;
  v_original_count integer := 0;
  v_index integer := 0;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_confirmation_id IS NULL
    OR p_reversal_date IS NULL
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Complete owner collection reversal details are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT confirmation.*
  INTO v_original
  FROM public.owner_collection_confirmations AS confirmation
  WHERE confirmation.organization_id = p_organization_id
    AND confirmation.id = p_confirmation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner collection confirmation not found'
      USING ERRCODE = '23503';
  END IF;
  IF v_original.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'An owner collection reversal cannot be reversed'
      USING ERRCODE = '22023';
  END IF;
  IF p_reversal_date < v_original.confirmed_date THEN
    RAISE EXCEPTION 'Reversal date cannot be before the confirmation date'
      USING ERRCODE = '22023';
  END IF;

  FOR v_original_allocation IN
    SELECT allocation.*
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.confirmation_id = p_confirmation_id
      AND allocation.reversal_of_allocation_id IS NULL
    ORDER BY allocation.allocation_order, allocation.id
    FOR UPDATE
  LOOP
    v_original_count := v_original_count + 1;
    IF NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = p_organization_id
        AND allocation_set.source_type = 'owner_direct_rent_receipt'
        AND allocation_set.source_line_id = v_original_allocation.id
    ) THEN
      RAISE EXCEPTION 'owner_collection_owner_allocation_required'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF v_original_count = 0 THEN
    RAISE EXCEPTION 'owner_collection_has_no_allocations'
      USING ERRCODE = '23514';
  END IF;

  v_reversal_confirmation_id :=
    app_private.reverse_owner_collection_after_allocation_guard(
      p_organization_id,
      p_confirmation_id,
      p_reversal_date,
      p_reason,
      p_idempotency_key
    );

  FOR v_reversal_allocation IN
    SELECT reversal.*
    FROM public.owner_collection_confirmation_allocations AS reversal
    WHERE reversal.organization_id = p_organization_id
      AND reversal.confirmation_id = v_reversal_confirmation_id
      AND reversal.reversal_of_allocation_id IS NOT NULL
    ORDER BY reversal.allocation_order, reversal.id
  LOOP
    v_index := v_index + 1;
    v_allocation_result := public.allocate_owner_event(
      p_organization_id,
      'reversal',
      v_reversal_allocation.id,
      pg_catalog.left(p_idempotency_key, 140) || ':owner:' ||
        pg_catalog.lpad(v_index::text, 3, '0')
    );
  END LOOP;

  RETURN v_reversal_confirmation_id;
END;
$$;

ALTER FUNCTION public.reverse_owner_collection_confirmation(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_owner_collection_confirmation(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_owner_collection_confirmation(
  uuid, uuid, date, text, text
) TO authenticated;

-- Preserve the established validation precedence before the Track 3 tenant
-- cash-dependency guard so invalid dates do not masquerade as allocation gaps.
DO $clone_tenant_reversal_with_owner_guard$
DECLARE
  v_definition text;
  v_private_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reverse_tenant_invoice_payment(uuid,uuid,date,text,text)'::regprocedure
  )
  INTO v_definition;

  v_private_definition := pg_catalog.replace(
    v_definition,
    'CREATE OR REPLACE FUNCTION public.reverse_tenant_invoice_payment',
    'CREATE OR REPLACE FUNCTION app_private.reverse_tenant_invoice_payment_after_date_validation'
  );

  IF v_private_definition = v_definition
    OR pg_catalog.strpos(
      v_private_definition,
      'app_private.reverse_tenant_invoice_payment_after_date_validation'
    ) = 0 THEN
    RAISE EXCEPTION 'tenant_reversal_validation_clone_contract_changed'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE v_private_definition;
END;
$clone_tenant_reversal_with_owner_guard$;

ALTER FUNCTION app_private.reverse_tenant_invoice_payment_after_date_validation(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.reverse_tenant_invoice_payment_after_date_validation(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_tenant_invoice_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_received_date date;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_payment_reversal_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT payment.received_date
  INTO v_received_date
  FROM public.tenant_invoice_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = p_payment_id;

  IF FOUND
    AND p_reversal_date IS NOT NULL
    AND p_reversal_date < v_received_date THEN
    RAISE EXCEPTION 'Reversal date cannot be before the payment date'
      USING ERRCODE = '22023';
  END IF;

  RETURN app_private.reverse_tenant_invoice_payment_after_date_validation(
    p_organization_id,
    p_payment_id,
    p_reversal_date,
    p_reason,
    p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.reverse_tenant_invoice_payment(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_tenant_invoice_payment(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_tenant_invoice_payment(
  uuid, uuid, date, text, text
) TO authenticated;
