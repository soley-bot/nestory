CREATE OR REPLACE FUNCTION app_private.lock_financial_authority_period_shared(
  p_organization_id uuid,
  p_currency public.currency_code,
  p_period_start date
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period_start date;
BEGIN
  IF p_organization_id IS NULL
    OR p_currency IS NULL
    OR p_period_start IS NULL THEN
    RAISE EXCEPTION 'Financial authority period identity is required'
      USING ERRCODE = '22004';
  END IF;

  v_period_start := pg_catalog.date_trunc('month', p_period_start)::date;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'financial_authority_period_v1',
        p_organization_id,
        p_currency,
        v_period_start
      ),
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_financial_authority_period_exclusive(
  p_organization_id uuid,
  p_currency public.currency_code,
  p_period_start date
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period_start date;
BEGIN
  IF p_organization_id IS NULL
    OR p_currency IS NULL
    OR p_period_start IS NULL THEN
    RAISE EXCEPTION 'Financial authority period identity is required'
      USING ERRCODE = '22004';
  END IF;

  v_period_start := pg_catalog.date_trunc('month', p_period_start)::date;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'financial_authority_period_v1',
        p_organization_id,
        p_currency,
        v_period_start
      ),
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_ledger_authority_period_exclusive(
  p_organization_id uuid,
  p_period_start date
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency public.currency_code;
BEGIN
  IF p_organization_id IS NULL OR p_period_start IS NULL THEN
    RAISE EXCEPTION 'Ledger authority period identity is required'
      USING ERRCODE = '22004';
  END IF;

  -- Ledger periods are organization-wide. Acquire every supported currency
  -- key in enum order so future currencies cannot introduce a deadlock.
  FOR v_currency IN
    SELECT currency_value
    FROM pg_catalog.unnest(
      pg_catalog.enum_range(NULL::public.currency_code)
    ) AS currency_value
    ORDER BY currency_value
  LOOP
    PERFORM app_private.lock_financial_authority_period_exclusive(
      p_organization_id,
      v_currency,
      p_period_start
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.lock_financial_authority_period_shared(
    uuid,
    public.currency_code,
    date
  ),
  app_private.lock_financial_authority_period_exclusive(
    uuid,
    public.currency_code,
    date
  ),
  app_private.lock_ledger_authority_period_exclusive(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_property_reporting_period_internal(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_assert_open boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period_start date;
  v_previous_period_context text;
  v_reporting_period public.property_reporting_periods%ROWTYPE;
  v_locked_book_id uuid;
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_currency IS NULL
    OR p_effective_date IS NULL
    OR p_assert_open IS NULL THEN
    RAISE EXCEPTION 'Property reporting-period identity is required'
      USING ERRCODE = '22004';
  END IF;

  v_period_start := pg_catalog.date_trunc('month', p_effective_date)::date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.id = p_property_id
      AND property.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Property is outside the requested organization'
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'property_reporting_period_v1',
        p_organization_id,
        p_property_id,
        p_currency,
        v_period_start
      ),
      0
    )
  );

  v_previous_period_context := coalesce(
    pg_catalog.current_setting(
      'app.financial_authority_period_context',
      true
    ),
    'off'
  );

  PERFORM pg_catalog.set_config(
    'app.financial_authority_period_context',
    'on',
    true
  );

  INSERT INTO public.property_reporting_periods (
    organization_id,
    property_id,
    currency,
    period_start
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_currency,
    v_period_start
  )
  ON CONFLICT (organization_id, property_id, currency, period_start)
  DO NOTHING;

  PERFORM pg_catalog.set_config(
    'app.financial_authority_period_context',
    v_previous_period_context,
    true
  );

  SELECT reporting_period.*
  INTO STRICT v_reporting_period
  FROM public.property_reporting_periods AS reporting_period
  WHERE reporting_period.organization_id = p_organization_id
    AND reporting_period.property_id = p_property_id
    AND reporting_period.currency = p_currency
    AND reporting_period.period_start = v_period_start
  FOR UPDATE;

  IF p_assert_open THEN
    -- This shared authority lock follows the property advisory/header locks.
    -- It makes both status reads atomic with broader lock and unlock writers.
    PERFORM app_private.lock_financial_authority_period_shared(
      p_organization_id,
      p_currency,
      v_period_start
    );

    IF v_reporting_period.lifecycle_status NOT IN ('open', 'reopened') THEN
      RAISE EXCEPTION 'Property reporting period is not open'
        USING ERRCODE = '22023';
    END IF;

    IF app_private.is_ledger_period_locked(
      p_organization_id,
      v_period_start
    ) THEN
      RAISE EXCEPTION 'Organization Ledger period is locked'
        USING ERRCODE = '22023';
    END IF;

    SELECT book.id
    INTO v_locked_book_id
    FROM public.accounting_books AS book
    JOIN public.accounting_periods AS accounting_period
      ON accounting_period.book_id = book.id
     AND accounting_period.organization_id = book.organization_id
    WHERE book.organization_id = p_organization_id
      AND book.book_type = 'client'
      AND book.currency = p_currency
      AND book.archived_at IS NULL
      AND accounting_period.period_start = v_period_start
      AND accounting_period.status = 'locked'
    ORDER BY book.id
    LIMIT 1;

    IF v_locked_book_id IS NOT NULL THEN
      RAISE EXCEPTION 'Accounting book period is locked'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_reporting_period.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ledger_period_lock(
  p_organization_id uuid,
  p_period_start date,
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
  v_normalized_period date;
  v_normalized_reason text :=
    NULLIF(pg_catalog.btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR p_period_start IS NULL
    OR p_locked IS NULL THEN
    RAISE EXCEPTION 'Ledger period lock details are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_normalized_reason IS NOT NULL
    AND pg_catalog.length(v_normalized_reason) > 400 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = '22023';
  END IF;

  v_normalized_period :=
    pg_catalog.date_trunc('month', p_period_start)::date;

  PERFORM app_private.lock_ledger_authority_period_exclusive(
    p_organization_id,
    v_normalized_period
  );

  INSERT INTO public.ledger_period_locks (
    organization_id,
    period_start,
    locked_at,
    locked_by,
    reason
  )
  VALUES (
    p_organization_id,
    v_normalized_period,
    CASE WHEN p_locked THEN pg_catalog.now() ELSE NULL END,
    CASE WHEN p_locked THEN v_actor_id ELSE NULL END,
    v_normalized_reason
  )
  ON CONFLICT (organization_id, period_start) DO UPDATE
  SET
    locked_at =
      CASE WHEN p_locked THEN pg_catalog.now() ELSE NULL END,
    locked_by =
      CASE WHEN p_locked THEN v_actor_id ELSE NULL END,
    reason = v_normalized_reason
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
    'ledger_period',
    v_lock_id,
    CASE WHEN p_locked THEN 'locked' ELSE 'unlocked' END,
    pg_catalog.jsonb_build_object(
      'period_start', v_normalized_period,
      'reason', v_normalized_reason
    )
  );

  RETURN v_lock_id;
END;
$$;

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
    CASE
      WHEN p_locked
      THEN NULLIF(pg_catalog.btrim(coalesce(p_reason, '')), '')
      ELSE NULL
    END,
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
      'reason',
      CASE
        WHEN p_locked
        THEN NULLIF(pg_catalog.btrim(coalesce(p_reason, '')), '')
        ELSE NULL
      END
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_accounting_period_lock(
  p_organization_id uuid,
  p_book_id uuid,
  p_period_start date,
  p_locked boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.set_accounting_period_lock_internal(
    p_organization_id,
    p_book_id,
    p_period_start,
    p_locked,
    p_reason,
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.set_accounting_period_lock_internal(
    uuid,
    uuid,
    date,
    boolean,
    text,
    uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.set_ledger_period_lock(uuid, date, boolean, text),
  public.set_accounting_period_lock(uuid, uuid, date, boolean, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.set_ledger_period_lock(uuid, date, boolean, text),
  public.set_accounting_period_lock(uuid, uuid, date, boolean, text)
TO authenticated;
