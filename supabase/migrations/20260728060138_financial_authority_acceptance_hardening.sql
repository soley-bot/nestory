-- Authority state is writable only by checked, serialized transition functions.
-- Supabase default grants had left TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on these
-- public tables for anon and/or service_role even though ordinary row DML was
-- already denied. TRUNCATE bypasses RLS and would erase authority state without
-- taking the mandatory exclusive authority lock.
REVOKE ALL
ON TABLE
  public.ledger_period_locks,
  public.accounting_periods
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
ON TABLE
  public.ledger_period_locks,
  public.accounting_periods
TO authenticated;

-- Current authority rows describe only current state, so reopen clears
-- lock_reason. The append-only activity payload retains the normalized reason
-- supplied for the reopen transition.
CREATE OR REPLACE FUNCTION app_private.set_accounting_period_lock_internal(
  p_organization_id uuid,
  p_book_id uuid,
  p_period_start date,
  p_locked boolean,
  p_reason text,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_book_currency public.currency_code;
  v_normalized_reason text :=
    NULLIF(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_normalized_period_start date;
  v_target_period_id uuid;
BEGIN
  IF p_organization_id IS NULL
    OR p_book_id IS NULL
    OR p_period_start IS NULL
    OR p_locked IS NULL THEN
    RAISE EXCEPTION 'Accounting period lock details are required'
      USING ERRCODE = '22023';
  END IF;

  IF v_normalized_reason IS NOT NULL
    AND pg_catalog.length(v_normalized_reason) > 400 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT book.currency
  INTO v_book_currency
  FROM public.accounting_books AS book
  WHERE book.id = p_book_id
    AND book.organization_id = p_organization_id
    AND book.archived_at IS NULL;

  IF v_book_currency IS NULL THEN
    RAISE EXCEPTION 'Accounting book not found'
      USING ERRCODE = '23503';
  END IF;

  v_normalized_period_start :=
    pg_catalog.date_trunc('month', p_period_start)::date;

  PERFORM app_private.lock_financial_authority_period_exclusive(
    p_organization_id,
    v_book_currency,
    v_normalized_period_start
  );

  INSERT INTO public.accounting_periods (
    organization_id,
    book_id,
    period_start,
    status,
    locked_at,
    locked_by,
    lock_reason,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_book_id,
    v_normalized_period_start,
    CASE WHEN p_locked THEN 'locked' ELSE 'open' END,
    CASE WHEN p_locked THEN pg_catalog.now() ELSE NULL END,
    CASE WHEN p_locked THEN p_actor_id ELSE NULL END,
    CASE WHEN p_locked THEN v_normalized_reason ELSE NULL END,
    p_actor_id,
    p_actor_id
  )
  ON CONFLICT (book_id, period_start)
  DO UPDATE SET
    status = excluded.status,
    locked_at = excluded.locked_at,
    locked_by = excluded.locked_by,
    lock_reason = excluded.lock_reason,
    updated_by = excluded.updated_by
  RETURNING id INTO v_target_period_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    p_actor_id,
    'accounting_period',
    v_target_period_id,
    CASE
      WHEN p_locked THEN 'accounting_period_locked'
      ELSE 'accounting_period_reopened'
    END,
    pg_catalog.jsonb_build_object(
      'book_id', p_book_id,
      'period_start', v_normalized_period_start,
      'status', CASE WHEN p_locked THEN 'locked' ELSE 'open' END,
      'reason', v_normalized_reason
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_accounting_period_lock_internal(
  uuid,
  uuid,
  date,
  boolean,
  text,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;
