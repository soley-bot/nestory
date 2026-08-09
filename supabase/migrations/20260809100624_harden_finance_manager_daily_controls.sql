-- Finance Manager month lock is an operational write gate, not Owner Close.
-- Keep Super Admin's existing arbitrary-month lock/unlock authority unchanged.
DO $migration$
DECLARE
  v_definition text;
  v_anchor constant text := $anchor$  INSERT INTO public.financial_month_locks ($anchor$;
  v_replacement constant text := $replacement$  IF p_locked
    AND NOT app_private.is_super_admin(p_organization_id) THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Finance Manager lock reason is required'
        USING ERRCODE = '22023';
    END IF;

    IF v_month_start IS DISTINCT FROM pg_catalog.date_trunc(
      'month',
      app_private.rent_business_date(p_organization_id, pg_catalog.now())
    )::date THEN
      RAISE EXCEPTION 'Finance Manager can lock only the current operational month'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.financial_month_locks AS month_lock
    WHERE month_lock.organization_id = p_organization_id
      AND month_lock.month_start = v_month_start
      AND month_lock.is_locked
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION 'Financial month is already locked'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.financial_month_locks ($replacement$;
  v_anchor_count integer;
  v_function constant regprocedure :=
    'public.set_financial_month_lock(uuid,date,boolean,text)'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;
  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor);

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one financial-month insert anchor in %, found %',
      v_function,
      v_anchor_count;
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

-- A resolved current-month exception is a natural-identity replay. Return its
-- original invoice rather than asking the unresolved-only internal path to find it.
DO $migration$
DECLARE
  v_definition text;
  v_anchor constant text := $anchor$  IF app_private.is_super_admin(p_organization_id) THEN$anchor$;
  v_replacement constant text := $replacement$  IF NOT app_private.is_super_admin(p_organization_id)
    AND v_exception.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_generated',
      'invoiceId', v_exception.resolved_invoice_id,
      'exceptionId', v_exception.id
    );
  END IF;

  IF app_private.is_super_admin(p_organization_id) THEN$replacement$;
  v_anchor_count integer;
  v_function constant regprocedure :=
    'public.recover_rent_generation_exception(uuid,uuid)'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;
  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor);

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one current-rent Super Admin branch anchor in %, found %',
      v_function,
      v_anchor_count;
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

-- Petty Cash row creation is a material financial mutation. Require an exact
-- request identity, fingerprint the entire normalized input, and return the
-- original row for a matching replay before mutable account/period checks.
DO $migration$
DECLARE
  v_definition text;
  v_signature_anchor constant text := $anchor$p_company_loss_amount numeric DEFAULT 0)
 RETURNS uuid$anchor$;
  v_signature_replacement constant text := $replacement$p_company_loss_amount numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid$replacement$;
  v_declare_anchor constant text := $anchor$  cash_out_amount numeric := 0;$anchor$;
  v_declare_replacement constant text := $replacement$  cash_out_amount numeric := 0;
  v_payload jsonb;
  v_claim record;$replacement$;
  v_authorization_anchor constant text := E'  IF NOT EXISTS (\r\n    SELECT 1\r\n    FROM public.petty_cash_accounts';
  v_authorization_replacement constant text := $replacement$  v_payload := jsonb_build_object(
    'accountId', p_account_id,
    'periodId', p_period_id,
    'propertyId', p_property_id,
    'unitId', p_unit_id,
    'invoiceDate', p_invoice_date,
    'clearDate', p_clear_date,
    'entryKind', normalized_entry_kind,
    'status', normalized_status,
    'category', normalized_category,
    'supplier', normalized_supplier,
    'description', normalized_description,
    'amount', p_amount,
    'counterpartyPersonId', p_counterparty_person_id,
    'receiptReference', normalized_receipt_reference,
    'remark', normalized_remark,
    'economicScope', normalized_economic_scope,
    'ownerBillStatus', normalized_owner_bill_status,
    'ownerReimbursableAmount', normalized_owner_reimbursable_amount,
    'ownerReimbursedAmount', normalized_owner_reimbursed_amount,
    'companyLossAmount', normalized_company_loss_amount
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_petty_cash_entry',
    p_idempotency_key,
    actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'entryId')::uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts$replacement$;
  v_return_anchor constant text := E'  RETURN new_entry_id;\r\nEND;';
  v_return_replacement constant text := $replacement$  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    actor_id,
    jsonb_build_object('entryId', new_entry_id)
  );

  RETURN new_entry_id;
END;$replacement$;
  v_anchor_count integer;
  v_old_function constant regprocedure :=
    'public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(v_old_function) INTO v_definition;

  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_signature_anchor, ''))
  ) / length(v_signature_anchor);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Petty Cash signature anchor, found %', v_anchor_count;
  END IF;
  v_definition := replace(v_definition, v_signature_anchor, v_signature_replacement);

  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_declare_anchor, ''))
  ) / length(v_declare_anchor);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Petty Cash declare anchor, found %', v_anchor_count;
  END IF;
  v_definition := replace(v_definition, v_declare_anchor, v_declare_replacement);

  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_authorization_anchor, ''))
  ) / length(v_authorization_anchor);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Petty Cash authorization anchor, found %', v_anchor_count;
  END IF;
  v_definition := replace(v_definition, v_authorization_anchor, v_authorization_replacement);

  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_return_anchor, ''))
  ) / length(v_return_anchor);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Petty Cash return anchor, found %', v_anchor_count;
  END IF;
  v_definition := replace(v_definition, v_return_anchor, v_return_replacement);

  EXECUTE v_definition;
  EXECUTE 'DROP FUNCTION public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)';
END;
$migration$;

REVOKE ALL ON FUNCTION public.create_petty_cash_entry(
  uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,
  uuid,text,text,text,text,numeric,numeric,numeric,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_petty_cash_entry(
  uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,
  uuid,text,text,text,text,numeric,numeric,numeric,text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_petty_cash_entry(
  uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,
  uuid,text,text,text,text,numeric,numeric,numeric,text
) TO authenticated;

COMMENT ON FUNCTION public.create_petty_cash_entry(
  uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,
  uuid,text,text,text,text,numeric,numeric,numeric,text
) IS 'Checked payload-idempotent Petty Cash row creation for an existing active account and open period.';
