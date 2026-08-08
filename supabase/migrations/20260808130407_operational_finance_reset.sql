-- Nestory has one operational financial authority per organization and month.
-- The application does not expose accounting periods or a full close workflow.

CREATE TABLE public.financial_month_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  is_locked boolean NOT NULL DEFAULT true,
  reason text,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid NOT NULL REFERENCES auth.users(id),
  unlocked_at timestamptz,
  unlocked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_month_locks_organization_month_key
    UNIQUE (organization_id, month_start),
  CONSTRAINT financial_month_locks_month_start_check
    CHECK (month_start = date_trunc('month', month_start)::date),
  CONSTRAINT financial_month_locks_reason_check
    CHECK (reason IS NULL OR char_length(reason) <= 400),
  CONSTRAINT financial_month_locks_state_check
    CHECK (
      (
        is_locked
        AND unlocked_at IS NULL
        AND unlocked_by IS NULL
      )
      OR (
        NOT is_locked
        AND unlocked_at IS NOT NULL
        AND unlocked_by IS NOT NULL
      )
    )
);

CREATE INDEX financial_month_locks_organization_locked_month_idx
  ON public.financial_month_locks (organization_id, is_locked, month_start);

ALTER TABLE public.financial_month_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financial_month_locks
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.financial_month_locks TO authenticated;

CREATE POLICY financial_month_locks_finance_select
ON public.financial_month_locks
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));

CREATE OR REPLACE FUNCTION app_private.is_financial_month_locked(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financial_month_locks AS month_lock
    WHERE month_lock.organization_id = p_organization_id
      AND month_lock.month_start = date_trunc('month', p_effective_date)::date
      AND month_lock.is_locked
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_financial_month(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month_start date;
BEGIN
  IF p_organization_id IS NULL OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Financial month identity is required'
      USING ERRCODE = '22004';
  END IF;

  v_month_start := date_trunc('month', p_effective_date)::date;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'financial_month_v1',
        p_organization_id,
        v_month_start
      ),
      0
    )
  );

  IF app_private.is_financial_month_locked(
    p_organization_id,
    v_month_start
  ) THEN
    RAISE EXCEPTION 'Financial month is locked'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_financial_month_lock(
  p_organization_id uuid,
  p_month_start date,
  p_locked boolean,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lock_id uuid;
  v_month_start date;
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR p_month_start IS NULL
    OR p_locked IS NULL THEN
    RAISE EXCEPTION 'Financial month lock details are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 400 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = '22023';
  END IF;

  v_month_start := date_trunc('month', p_month_start)::date;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'financial_month_v1',
        p_organization_id,
        v_month_start
      ),
      0
    )
  );

  INSERT INTO public.financial_month_locks (
    organization_id,
    month_start,
    is_locked,
    reason,
    locked_at,
    locked_by,
    unlocked_at,
    unlocked_by,
    updated_at
  )
  VALUES (
    p_organization_id,
    v_month_start,
    p_locked,
    v_reason,
    now(),
    v_actor_id,
    CASE WHEN p_locked THEN NULL ELSE now() END,
    CASE WHEN p_locked THEN NULL ELSE v_actor_id END,
    now()
  )
  ON CONFLICT (organization_id, month_start) DO UPDATE
  SET
    is_locked = EXCLUDED.is_locked,
    reason = EXCLUDED.reason,
    locked_at = CASE
      WHEN EXCLUDED.is_locked THEN now()
      ELSE public.financial_month_locks.locked_at
    END,
    locked_by = CASE
      WHEN EXCLUDED.is_locked THEN v_actor_id
      ELSE public.financial_month_locks.locked_by
    END,
    unlocked_at = CASE WHEN EXCLUDED.is_locked THEN NULL ELSE now() END,
    unlocked_by = CASE WHEN EXCLUDED.is_locked THEN NULL ELSE v_actor_id END,
    updated_at = now()
  RETURNING id INTO v_lock_id;

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
    v_actor_id,
    'financial_month',
    v_lock_id,
    CASE WHEN p_locked THEN 'locked' ELSE 'unlocked' END,
    jsonb_build_object(
      'month_start', v_month_start,
      'reason', v_reason
    )
  );

  RETURN v_lock_id;
END;
$$;

-- Transitional callers use these existing private names until their source
-- workflow definitions are replaced later in this reset migration.
CREATE OR REPLACE FUNCTION app_private.is_ledger_period_locked(
  target_organization_id uuid,
  target_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_financial_month_locked(
    target_organization_id,
    target_date
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_financial_authority_period_shared(
  p_organization_id uuid,
  p_currency public.currency_code,
  p_period_start date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_currency IS NULL THEN
    RAISE EXCEPTION 'Financial authority currency is required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_period_start
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.is_financial_month_locked(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_open_financial_month(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.is_ledger_period_locked(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_financial_authority_period_shared(
  uuid,
  public.currency_code,
  date
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_financial_month_lock(uuid, date, boolean, text)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_financial_month_lock(uuid, date, boolean, text)
TO authenticated;
