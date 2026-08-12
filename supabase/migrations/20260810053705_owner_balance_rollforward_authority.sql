CREATE OR REPLACE FUNCTION public.generate_owner_balance_period(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay_result jsonb;
  v_claim record;
  v_period public.owner_balance_periods%ROWTYPE;
  v_previous public.owner_balance_periods%ROWTYPE;
  v_period_id uuid;
  v_opening_count integer := 0;
  v_pending_count integer := 0;
  v_source_count integer := 0;
  v_movement_count integer := 0;
  v_blocked_reason text;
  v_blocked_detail jsonb;
  v_source_canonical text := '';
  v_movement_canonical text := '';
  v_base_canonical text := '';
  v_input_hash text;
  v_input_watermark text;
  v_held_opening numeric(14,2);
  v_owner_due_opening numeric(14,2);
  v_ips_due_opening numeric(14,2);
  v_deposit_opening numeric(14,2);
  v_held_movement numeric(14,2) := 0;
  v_owner_due_movement numeric(14,2) := 0;
  v_ips_due_movement numeric(14,2) := 0;
  v_deposit_movement numeric(14,2) := 0;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_balance_generation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL
    OR p_month_start <> pg_catalog.date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'owner_balance_month_start_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_balance_generation_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner_balance_property_not_found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_owner_person_id
  ) THEN
    RAISE EXCEPTION 'owner_balance_owner_not_found' USING ERRCODE = '23503';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'month_start', p_month_start::text
  );

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'generate_owner_balance_period',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_month_start
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_balance_period_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text,
        p_month_start::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'generate_owner_balance_period',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  SELECT period.*
  INTO v_period
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = p_month_start
  FOR UPDATE;
  IF FOUND AND v_period.status = 'closed' THEN
    RAISE EXCEPTION 'owner_balance_period_closed' USING ERRCODE = '55000';
  END IF;

  SELECT period.*
  INTO v_previous
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = (p_month_start - INTERVAL '1 month')::date;

  IF FOUND THEN
    IF v_previous.status <> 'ready' THEN
      v_blocked_reason := 'prior_period_not_ready';
      v_blocked_detail := pg_catalog.jsonb_build_object(
        'prior_period_id', v_previous.id::text,
        'prior_status', v_previous.status
      );
    ELSE
      SELECT
        max(component.closing_amount) FILTER (
          WHERE component.component = 'ips_held_owner_cash'
        ),
        max(component.closing_amount) FILTER (
          WHERE component.component = 'owner_due_to_ips'
        ),
        max(component.closing_amount) FILTER (
          WHERE component.component = 'ips_due_to_owner'
        ),
        max(component.closing_amount) FILTER (
          WHERE component.component = 'security_deposit_custody'
        ),
        count(*)::integer
      INTO
        v_held_opening,
        v_owner_due_opening,
        v_ips_due_opening,
        v_deposit_opening,
        v_opening_count
      FROM public.owner_balance_period_components AS component
      WHERE component.organization_id = p_organization_id
        AND component.owner_balance_period_id = v_previous.id;

      IF v_opening_count <> 4 THEN
        v_blocked_reason := 'prior_period_continuity_broken';
        v_blocked_detail := pg_catalog.jsonb_build_object(
          'prior_period_id', v_previous.id::text,
          'component_count', v_opening_count
        );
      END IF;
      v_base_canonical := 'prior|' || v_previous.id::text || '|' || v_previous.input_hash;
    END IF;
  ELSE
    SELECT
      pg_catalog.sum(entry.signed_amount) FILTER (
        WHERE entry.component = 'ips_held_owner_cash'
      )::numeric(14,2),
      pg_catalog.sum(entry.signed_amount) FILTER (
        WHERE entry.component = 'owner_due_to_ips'
      )::numeric(14,2),
      pg_catalog.sum(entry.signed_amount) FILTER (
        WHERE entry.component = 'ips_due_to_owner'
      )::numeric(14,2),
      pg_catalog.sum(entry.signed_amount) FILTER (
        WHERE entry.component = 'security_deposit_custody'
      )::numeric(14,2),
      count(DISTINCT entry.component)::integer,
      coalesce(
        pg_catalog.string_agg(
          entry.component::text || '|' || entry.id::text || '|' ||
          pg_catalog.to_char(entry.signed_amount, 'FM999999999990.00'),
          E'\n' ORDER BY entry.component::text, entry.created_at, entry.id
        ),
        ''
      )
    INTO
      v_held_opening,
      v_owner_due_opening,
      v_ips_due_opening,
      v_deposit_opening,
      v_opening_count,
      v_base_canonical
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = p_property_id
      AND entry.owner_person_id = p_owner_person_id
      AND entry.currency = p_currency
      AND entry.effective_date = p_month_start;

    IF v_opening_count <> 4 THEN
      IF EXISTS (
        SELECT 1
        FROM public.owner_opening_balance_entries AS earlier
        WHERE earlier.organization_id = p_organization_id
          AND earlier.property_id = p_property_id
          AND earlier.owner_person_id = p_owner_person_id
          AND earlier.currency = p_currency
          AND earlier.effective_date < p_month_start
      ) THEN
        v_blocked_reason := 'prior_period_missing';
      ELSE
        v_blocked_reason := 'opening_component_unknown';
      END IF;
      v_blocked_detail := pg_catalog.jsonb_build_object(
        'known_component_count', v_opening_count,
        'required_component_count', 4
      );
    END IF;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(movement.signed_amount) FILTER (
      WHERE movement.component = 'ips_held_owner_cash'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(movement.signed_amount) FILTER (
      WHERE movement.component = 'owner_due_to_ips'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(movement.signed_amount) FILTER (
      WHERE movement.component = 'ips_due_to_owner'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(movement.signed_amount) FILTER (
      WHERE movement.component = 'security_deposit_custody'
    ), 0)::numeric(14,2),
    count(*)::integer,
    coalesce(
      pg_catalog.string_agg(
        movement.event_date::text || '|' || movement.id::text || '|' ||
        movement.component::text || '|' ||
        pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00'),
        E'\n' ORDER BY movement.event_date, movement.id
      ),
      ''
    )
  INTO
    v_held_movement,
    v_owner_due_movement,
    v_ips_due_movement,
    v_deposit_movement,
    v_movement_count,
    v_movement_canonical
  FROM public.owner_component_movements AS movement
  WHERE movement.organization_id = p_organization_id
    AND movement.property_id = p_property_id
    AND movement.owner_person_id = p_owner_person_id
    AND movement.currency = p_currency
    AND movement.month_start = p_month_start;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE queue.allocation_state <> 'allocated')::integer,
    coalesce(
      pg_catalog.string_agg(
        queue.source_type || '|' || queue.source_line_id::text || '|' ||
        queue.gross_signed_amount || '|' || queue.allocation_state || '|' ||
        coalesce(queue.remediation_code, ''),
        E'\n' ORDER BY queue.event_date, queue.source_type, queue.source_line_id
      ),
      ''
    ),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'source_type', queue.source_type,
          'source_line_id', queue.source_line_id::text,
          'state', queue.allocation_state,
          'remediation_code', queue.remediation_code
        ) ORDER BY queue.event_date, queue.source_type, queue.source_line_id
      ) FILTER (WHERE queue.allocation_state <> 'allocated'),
      '[]'::jsonb
    )
  INTO v_source_count, v_pending_count, v_source_canonical, v_blocked_detail
  FROM public.get_owner_event_allocation_queue(
    p_organization_id,
    p_property_id,
    p_currency,
    p_month_start,
    (p_month_start + INTERVAL '1 month - 1 day')::date
  ) AS queue;

  IF v_pending_count > 0 THEN
    v_blocked_reason := 'source_allocation_incomplete';
    v_blocked_detail := pg_catalog.jsonb_build_object(
      'sources', v_blocked_detail
    );
  ELSIF v_blocked_reason IS NOT NULL AND v_blocked_detail IS NULL THEN
    v_blocked_detail := '{}'::jsonb;
  END IF;

  v_input_watermark := pg_catalog.concat_ws(
    ';',
    'sources=' || v_source_count::text,
    'movements=' || v_movement_count::text,
    'month=' || p_month_start::text
  );
  v_input_hash := pg_catalog.encode(
    extensions.digest(
      v_base_canonical || E'\n--sources--\n' || v_source_canonical ||
      E'\n--movements--\n' || v_movement_canonical,
      'sha256'
    ),
    'hex'
  );

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );

  IF v_blocked_reason IS NOT NULL THEN
    IF v_period.id IS NULL THEN
      INSERT INTO public.owner_balance_periods (
        organization_id,
        property_id,
        owner_person_id,
        currency,
        month_start,
        status,
        input_watermark,
        input_hash,
        blocked_reason_code,
        blocked_reason_detail,
        generated_at,
        generated_by
      ) VALUES (
        p_organization_id,
        p_property_id,
        p_owner_person_id,
        p_currency,
        p_month_start,
        'blocked',
        v_input_watermark,
        v_input_hash,
        v_blocked_reason,
        v_blocked_detail,
        pg_catalog.now(),
        v_actor_id
      )
      RETURNING id INTO v_period_id;
    ELSE
      UPDATE public.owner_balance_periods AS period
      SET
        status = 'blocked',
        input_watermark = v_input_watermark,
        input_hash = v_input_hash,
        blocked_reason_code = v_blocked_reason,
        blocked_reason_detail = v_blocked_detail,
        generated_at = pg_catalog.now(),
        generated_by = v_actor_id,
        stale_at = NULL,
        stale_reason = NULL
      WHERE period.id = v_period.id;
      v_period_id := v_period.id;
      DELETE FROM public.owner_balance_period_components AS component
      WHERE component.owner_balance_period_id = v_period_id;
    END IF;

    v_result := pg_catalog.jsonb_build_object(
      'status', 'blocked',
      'period_id', v_period_id::text,
      'blocked_reason_code', v_blocked_reason,
      'blocked_reason_detail', v_blocked_detail,
      'input_hash', v_input_hash
    );
    RETURN app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
  END IF;

  IF v_period.id IS NOT NULL
    AND v_period.status = 'ready'
    AND v_period.input_hash = v_input_hash THEN
    v_result := pg_catalog.jsonb_build_object(
      'status', 'ready',
      'period_id', v_period.id::text,
      'input_hash', v_input_hash,
      'component_count', 4,
      'replayed', true
    );
    RETURN app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
  END IF;

  IF v_period.id IS NULL THEN
    INSERT INTO public.owner_balance_periods (
      organization_id,
      property_id,
      owner_person_id,
      currency,
      month_start,
      status,
      input_watermark,
      input_hash,
      generated_at,
      generated_by
    ) VALUES (
      p_organization_id,
      p_property_id,
      p_owner_person_id,
      p_currency,
      p_month_start,
      'ready',
      v_input_watermark,
      v_input_hash,
      pg_catalog.now(),
      v_actor_id
    )
    RETURNING id INTO v_period_id;
  ELSE
    UPDATE public.owner_balance_periods AS period
    SET
      status = 'ready',
      input_watermark = v_input_watermark,
      input_hash = v_input_hash,
      blocked_reason_code = NULL,
      blocked_reason_detail = NULL,
      generated_at = pg_catalog.now(),
      generated_by = v_actor_id,
      stale_at = NULL,
      stale_reason = NULL
    WHERE period.id = v_period.id;
    v_period_id := v_period.id;
    DELETE FROM public.owner_balance_period_components AS component
    WHERE component.owner_balance_period_id = v_period_id;
  END IF;

  INSERT INTO public.owner_balance_period_components (
    owner_balance_period_id,
    organization_id,
    component,
    opening_amount,
    movement_amount,
    closing_amount,
    created_by
  )
  VALUES
    (
      v_period_id, p_organization_id, 'ips_held_owner_cash',
      v_held_opening, v_held_movement, v_held_opening + v_held_movement,
      v_actor_id
    ),
    (
      v_period_id, p_organization_id, 'owner_due_to_ips',
      v_owner_due_opening, v_owner_due_movement,
      v_owner_due_opening + v_owner_due_movement, v_actor_id
    ),
    (
      v_period_id, p_organization_id, 'ips_due_to_owner',
      v_ips_due_opening, v_ips_due_movement,
      v_ips_due_opening + v_ips_due_movement, v_actor_id
    ),
    (
      v_period_id, p_organization_id, 'security_deposit_custody',
      v_deposit_opening, v_deposit_movement,
      v_deposit_opening + v_deposit_movement, v_actor_id
    );

  v_result := pg_catalog.jsonb_build_object(
    'status', 'ready',
    'period_id', v_period_id::text,
    'input_hash', v_input_hash,
    'input_watermark', v_input_watermark,
    'component_count', 4,
    'replayed', false
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

ALTER FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.generate_owner_balance_period(
  uuid, uuid, uuid, public.currency_code, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_owner_balance_ledger(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date
) RETURNS TABLE (
  period_id uuid,
  month_start date,
  period_status text,
  component public.owner_balance_component,
  opening_amount text,
  movement_amount text,
  closing_amount text,
  available_withdrawal text,
  input_watermark text,
  input_hash text,
  blocked_reason_code text,
  blocked_reason_detail jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_balance_ledger_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start
    OR p_period_start <> pg_catalog.date_trunc('month', p_period_start)::date
    OR p_period_end <> pg_catalog.date_trunc('month', p_period_end)::date THEN
    RAISE EXCEPTION 'owner_balance_ledger_period_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    period.id,
    period.month_start,
    period.status,
    period_component.component,
    CASE WHEN period_component.id IS NULL THEN NULL ELSE
      pg_catalog.to_char(period_component.opening_amount, 'FM999999999990.00')
    END,
    CASE WHEN period_component.id IS NULL THEN NULL ELSE
      pg_catalog.to_char(period_component.movement_amount, 'FM999999999990.00')
    END,
    CASE WHEN period_component.id IS NULL THEN NULL ELSE
      pg_catalog.to_char(period_component.closing_amount, 'FM999999999990.00')
    END,
    CASE WHEN held.closing_amount IS NULL THEN NULL ELSE
      pg_catalog.to_char(greatest(held.closing_amount, 0), 'FM999999999990.00')
    END,
    period.input_watermark,
    period.input_hash,
    period.blocked_reason_code,
    period.blocked_reason_detail
  FROM public.owner_balance_periods AS period
  LEFT JOIN public.owner_balance_period_components AS period_component
    ON period_component.organization_id = period.organization_id
    AND period_component.owner_balance_period_id = period.id
  LEFT JOIN public.owner_balance_period_components AS held
    ON held.organization_id = period.organization_id
    AND held.owner_balance_period_id = period.id
    AND held.component = 'ips_held_owner_cash'
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start BETWEEN p_period_start AND p_period_end
  ORDER BY period.month_start, period_component.component;
END;
$$;

ALTER FUNCTION public.get_owner_balance_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_balance_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_balance_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.mark_owner_balance_periods_stale_after_opening_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );

  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'opening_authority_changed'
  WHERE period.organization_id = NEW.organization_id
    AND period.property_id = NEW.property_id
    AND period.owner_person_id = NEW.owner_person_id
    AND period.currency = NEW.currency
    AND period.month_start >= pg_catalog.date_trunc(
      'month', NEW.effective_date
    )::date
    AND period.status IN ('ready', 'stale');

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.mark_owner_balance_periods_stale_after_opening_entry()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.mark_owner_balance_periods_stale_after_opening_entry()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER mark_owner_balance_periods_stale_after_opening_entry
  AFTER INSERT ON public.owner_opening_balance_entries
  FOR EACH ROW
  EXECUTE FUNCTION app_private.mark_owner_balance_periods_stale_after_opening_entry();
