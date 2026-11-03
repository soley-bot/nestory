-- Change only the agreed requirement. Cash events, custody and rent are independent.
CREATE OR REPLACE FUNCTION public.update_lease_deposit_requirement(
  p_organization_id uuid,
  p_lease_id uuid,
  p_amount numeric,
  p_expected_amount numeric,
  p_reason text,
  p_idempotency_key text,
  p_expected_deposit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_lease public.leases%ROWTYPE;
  v_deposit public.lease_deposits%ROWTYPE;
  v_claim record;
  v_held numeric := 0;
  v_currency public.currency_code;
BEGIN
  v_actor := app_private.assert_lease_permission(
    p_organization_id, p_lease_id, 'leases.change_terms'::public.organization_permission_key
  );
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);

  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_amount < 0 OR p_amount > 999999999999.99 OR p_amount <> round(p_amount, 2)
    OR p_expected_amount IS NULL OR p_expected_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_expected_amount < 0 OR p_expected_amount > 999999999999.99
    OR p_expected_amount <> round(p_expected_amount, 2)
    OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 8 AND 500
    OR length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'deposit_requirement_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id, 'update_lease_deposit_requirement', btrim(p_idempotency_key), v_actor,
    jsonb_build_object('leaseId', p_lease_id, 'amount', p_amount,
      'expectedAmount', p_expected_amount, 'expectedDepositId', p_expected_deposit_id,
      'reason', btrim(p_reason))
  );
  IF v_claim.is_replay THEN RETURN (v_claim.result_ids->>'leaseId')::uuid; END IF;

  -- Serialize new deposit creation and lease closure; keep FK key-share locks compatible.
  SELECT * INTO v_lease FROM public.leases
  WHERE organization_id = p_organization_id AND id = p_lease_id
  FOR NO KEY UPDATE;
  PERFORM app_private.assert_lease_permission(
    p_organization_id, p_lease_id, 'leases.change_terms'::public.organization_permission_key
  );
  IF v_lease.archived_at IS NOT NULL OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RAISE EXCEPTION 'deposit_requirement_active_lease_required' USING ERRCODE = '55000';
  END IF;

  -- Fail closed on ambiguous historical headers instead of choosing one silently.
  IF (SELECT count(*) FROM public.lease_deposits
      WHERE organization_id = p_organization_id AND lease_id = p_lease_id
        AND deposit_type = 'security' AND archived_at IS NULL) > 1 THEN
    RAISE EXCEPTION 'deposit_requirement_ambiguous' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_deposit FROM public.lease_deposits
  WHERE organization_id = p_organization_id AND lease_id = p_lease_id
    AND deposit_type = 'security' AND archived_at IS NULL
  FOR UPDATE;

  IF v_deposit.id IS DISTINCT FROM p_expected_deposit_id
    OR coalesce(v_deposit.amount, v_lease.deposit_amount, 0) IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'deposit_requirement_changed' USING ERRCODE = '40001';
  END IF;
  v_currency := coalesce(v_deposit.currency, v_lease.deposit_currency, 'USD'::public.currency_code);
  IF v_deposit.id IS NOT NULL THEN
    v_held := app_private.deposit_rent_held(p_organization_id, v_deposit.id);
    -- Legacy Ledger-only evidence is not an independently verified held balance.
    IF EXISTS (SELECT 1 FROM public.ledger_entries
      WHERE organization_id = p_organization_id AND source_id = v_deposit.id) THEN
      RAISE EXCEPTION 'deposit_requirement_legacy_evidence' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF v_held < 0 OR p_amount < v_held THEN
    RAISE EXCEPTION 'deposit_requirement_below_held' USING ERRCODE = '22023';
  END IF;

  IF v_deposit.id IS NULL AND p_amount > 0 THEN
    INSERT INTO public.lease_deposits (
      organization_id, lease_id, deposit_type, amount, currency, status, created_by, updated_by
    ) VALUES (p_organization_id, p_lease_id, 'security', p_amount, v_currency, 'pending', v_actor, v_actor)
    RETURNING * INTO v_deposit;
  ELSIF v_deposit.id IS NOT NULL THEN
    UPDATE public.lease_deposits SET amount = p_amount, updated_by = v_actor
    WHERE organization_id = p_organization_id AND id = v_deposit.id;
  END IF;
  UPDATE public.leases
  SET deposit_amount = nullif(p_amount, 0),
      deposit_currency = CASE WHEN p_amount > 0 THEN v_currency ELSE NULL END,
      updated_by = v_actor
  WHERE organization_id = p_organization_id AND id = p_lease_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor, 'lease', p_lease_id, 'deposit_requirement_changed',
    jsonb_build_object('depositAmount', p_expected_amount, 'currency', v_currency),
    jsonb_build_object('depositAmount', p_amount, 'currency', v_currency,
      'depositId', v_deposit.id, 'heldAmount', v_held, 'reason', btrim(p_reason))
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor, jsonb_build_object('leaseId', p_lease_id)
  );
  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_lease_deposit_requirement(uuid,uuid,numeric,numeric,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_lease_deposit_requirement(uuid,uuid,numeric,numeric,text,text,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.update_lease_deposit_requirement(uuid,uuid,numeric,numeric,text,text,uuid)
  IS 'Audited, scoped, retry-safe active Lease deposit requirement edit. Never rewrites rent, custody or deposit cash history.';
