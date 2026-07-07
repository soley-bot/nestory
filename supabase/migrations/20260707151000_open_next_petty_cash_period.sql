CREATE OR REPLACE FUNCTION public.open_next_petty_cash_period(
  p_organization_id uuid,
  p_account_id uuid,
  p_period_id uuid,
  p_advance_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  target_account public.petty_cash_accounts%ROWTYPE;
  target_period public.petty_cash_periods%ROWTYPE;
  next_period_id uuid;
  next_period_start date;
  has_advance_rows boolean;
  movement_total numeric;
  closing_balance numeric;
  normalized_advance_amount numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_account
  FROM public.petty_cash_accounts
  WHERE id = p_account_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash account not found' USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO target_period
  FROM public.petty_cash_periods
  WHERE id = p_period_id
    AND account_id = p_account_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash period not found' USING ERRCODE = '23503';
  END IF;

  IF target_period.status = 'closed' THEN
    RAISE EXCEPTION 'Petty cash period is already closed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.petty_cash_entries entry
    WHERE entry.period_id = target_period.id
      AND entry.organization_id = p_organization_id
      AND entry.entry_kind = 'expense'
      AND entry.status NOT IN ('posted', 'void')
      AND entry.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Post or void petty cash expenses before opening the next month'
      USING ERRCODE = '22023';
  END IF;

  IF p_advance_amount IS NOT NULL AND p_advance_amount < 0 THEN
    RAISE EXCEPTION 'Advance amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.petty_cash_entries entry
    WHERE entry.period_id = target_period.id
      AND entry.organization_id = p_organization_id
      AND entry.entry_kind = 'advance'
      AND entry.archived_at IS NULL
  )
  INTO has_advance_rows;

  SELECT coalesce(sum(entry.in_amount - entry.out_amount), 0)
  INTO movement_total
  FROM public.petty_cash_entries entry
  WHERE entry.period_id = target_period.id
    AND entry.organization_id = p_organization_id
    AND entry.archived_at IS NULL;

  closing_balance :=
    target_period.opening_balance_amount
    + CASE WHEN has_advance_rows THEN 0 ELSE target_period.advance_amount END
    + movement_total;
  normalized_advance_amount :=
    coalesce(p_advance_amount, greatest(target_account.float_amount - closing_balance, 0));
  next_period_start := (target_period.period_start + interval '1 month')::date;

  INSERT INTO public.petty_cash_periods (
    organization_id,
    account_id,
    period_start,
    opening_balance_amount,
    advance_amount,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_account_id,
    next_period_start,
    closing_balance,
    normalized_advance_amount,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  ON CONFLICT (account_id, period_start) DO NOTHING
  RETURNING id INTO next_period_id;

  IF next_period_id IS NULL THEN
    SELECT id
    INTO next_period_id
    FROM public.petty_cash_periods
    WHERE account_id = p_account_id
      AND period_start = next_period_start;
  END IF;

  UPDATE public.petty_cash_periods
  SET
    counted_cash_amount = closing_balance,
    status = 'closed',
    reviewed_at = now(),
    reviewed_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = target_period.id;

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
    (SELECT auth.uid()),
    'petty_cash_period',
    next_period_id,
    'opened_next_month',
    jsonb_build_object(
      'period_id', target_period.id,
      'period_start', target_period.period_start,
      'closing_balance', closing_balance
    ),
    jsonb_build_object(
      'period_start', next_period_start,
      'opening_balance_amount', closing_balance,
      'advance_amount', normalized_advance_amount
    )
  );

  RETURN next_period_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_next_petty_cash_period(
  uuid,
  uuid,
  uuid,
  numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.open_next_petty_cash_period(
  uuid,
  uuid,
  uuid,
  numeric
) TO authenticated;
