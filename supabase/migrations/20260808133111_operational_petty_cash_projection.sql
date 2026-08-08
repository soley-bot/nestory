CREATE OR REPLACE FUNCTION public.post_petty_cash_entry(
  p_organization_id uuid,
  p_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_preflight public.petty_cash_entries%ROWTYPE;
  v_entry public.petty_cash_entries%ROWTYPE;
  v_ledger_entry_id uuid;
  v_description text;
  v_transaction_date date;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT entry.*
  INTO v_preflight
  FROM public.petty_cash_entries AS entry
  WHERE entry.id = p_entry_id
    AND entry.organization_id = p_organization_id
    AND entry.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash entry not found' USING ERRCODE = '23503';
  END IF;

  IF v_preflight.status = 'posted'
    AND v_preflight.ledger_entry_id IS NOT NULL THEN
    RETURN v_preflight.ledger_entry_id;
  END IF;

  v_transaction_date := coalesce(
    v_preflight.clear_date,
    v_preflight.invoice_date
  );

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    v_transaction_date
  );

  SELECT entry.*
  INTO v_entry
  FROM public.petty_cash_entries AS entry
  WHERE entry.id = p_entry_id
    AND entry.organization_id = p_organization_id
    AND entry.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash entry not found' USING ERRCODE = '23503';
  END IF;

  IF v_entry.status = 'posted' AND v_entry.ledger_entry_id IS NOT NULL THEN
    RETURN v_entry.ledger_entry_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_accounts AS account
    WHERE account.id = v_entry.account_id
      AND account.organization_id = p_organization_id
      AND account.status = 'active'
      AND account.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active petty cash account not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_entry.entry_kind <> 'expense' THEN
    RAISE EXCEPTION 'Only petty cash expenses post to the Ledger'
      USING ERRCODE = '22023';
  END IF;

  IF v_entry.ledger_entry_id IS NOT NULL OR v_entry.status = 'posted' THEN
    RAISE EXCEPTION 'Petty cash posting state is inconsistent'
      USING ERRCODE = '22023';
  END IF;

  IF v_entry.status = 'void' THEN
    RAISE EXCEPTION 'Void petty cash entries cannot be posted'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_periods AS period
    WHERE period.id = v_entry.period_id
      AND period.account_id = v_entry.account_id
      AND period.organization_id = p_organization_id
      AND period.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Open petty cash period not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_entry.property_id IS NULL THEN
    RAISE EXCEPTION 'Petty cash expense needs a property before posting'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_entry.clear_date, v_entry.invoice_date)
      IS DISTINCT FROM v_transaction_date THEN
    RAISE EXCEPTION 'Petty cash entry changed while locking'
      USING ERRCODE = '40001';
  END IF;

  v_description := concat_ws(
    E'\n',
    nullif('Counterparty: ' || coalesce(v_entry.supplier, ''), 'Counterparty: '),
    'Petty cash: ' || v_entry.description,
    nullif('Receipt: ' || coalesce(v_entry.receipt_reference, ''), 'Receipt: '),
    nullif('Remark: ' || coalesce(v_entry.remark, ''), 'Remark: ')
  );

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_entry.property_id,
    v_entry.unit_id,
    v_transaction_date,
    'expense',
    'Petty Cash - ' || v_entry.category,
    v_entry.out_amount,
    v_entry.currency,
    v_description,
    'petty_cash_entry',
    v_entry.id,
    v_actor_id,
    NULL
  );

  UPDATE public.petty_cash_entries
  SET clear_date = v_transaction_date,
      status = 'posted',
      ledger_entry_id = v_ledger_entry_id,
      updated_by = v_actor_id
  WHERE id = p_entry_id
    AND organization_id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'petty_cash_entry',
    p_entry_id,
    'posted_to_ledger',
    jsonb_build_object(
      'status', v_entry.status,
      'ledger_entry_id', v_entry.ledger_entry_id
    ),
    jsonb_build_object(
      'status', 'posted',
      'ledger_entry_id', v_ledger_entry_id
    )
  );

  RETURN v_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_petty_cash_entry(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_petty_cash_entry(uuid, uuid)
TO authenticated;
