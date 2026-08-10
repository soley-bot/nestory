-- Track 4A correction round: retain exact close inputs, preserve zero-value
-- evidence, serialize cross-month recovery, and make replay authoritative.

ALTER TABLE public.owner_close_revisions
  ADD COLUMN input_canonical text;

ALTER TABLE public.owner_close_revisions
  DROP CONSTRAINT owner_close_revisions_status_fields_check;
ALTER TABLE public.owner_close_revisions
  ADD CONSTRAINT owner_close_revisions_status_fields_check CHECK (
    (
      status = 'preparing'
      AND input_watermark IS NULL
      AND input_canonical IS NULL
      AND input_hash IS NULL
      AND content_hash IS NULL
      AND closed_at IS NULL
      AND closed_by IS NULL
      AND close_reason IS NULL
    ) OR (
      status = 'closed'
      AND pg_catalog.length(input_watermark) > 0
      AND pg_catalog.length(input_canonical) > 0
      AND input_hash ~ '^[0-9a-f]{64}$'
      AND content_hash ~ '^[0-9a-f]{64}$'
      AND closed_at IS NOT NULL
      AND closed_by IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(close_reason)) BETWEEN 3 AND 500
    )
  );

ALTER TABLE public.owner_close_lines
  DROP CONSTRAINT owner_close_lines_amount_check;
ALTER TABLE public.owner_close_lines
  ADD CONSTRAINT owner_close_lines_amount_check CHECK (
    signed_amount = pg_catalog.round(signed_amount, 2)
  );
ALTER TABLE public.owner_close_lines
  DROP CONSTRAINT owner_close_lines_source_count_check;
ALTER TABLE public.owner_close_lines
  ADD CONSTRAINT owner_close_lines_source_count_check CHECK (
    source_count >= 0
    AND (
      source_count > 0
      OR (line_kind = 'opening' AND signed_amount = 0)
    )
  );

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id, p_property_id, p_currency, p_month_start
  );
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_series(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS void
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'owner_close_series_v1', p_organization_id::text,
        p_property_id::text, p_owner_person_id::text, p_currency::text,
        p_month_start::text
      ),
      0
    )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_recovery_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_from_month date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_month date;
BEGIN
  FOR v_month IN
    SELECT scope_month.month_start
    FROM (
      SELECT p_from_month AS month_start
      UNION
      SELECT period.month_start
      FROM public.owner_balance_periods AS period
      WHERE period.organization_id = p_organization_id
        AND period.property_id = p_property_id
        AND period.owner_person_id = p_owner_person_id
        AND period.currency = p_currency
        AND period.month_start >= p_from_month
      UNION
      SELECT series.month_start
      FROM public.owner_close_series AS series
      WHERE series.organization_id = p_organization_id
        AND series.property_id = p_property_id
        AND series.owner_person_id = p_owner_person_id
        AND series.currency = p_currency
        AND series.month_start >= p_from_month
    ) AS scope_month
    ORDER BY scope_month.month_start
  LOOP
    PERFORM app_private.lock_property_financial_month(
      p_organization_id, p_property_id, p_currency, v_month
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':', 'owner_balance_period_v1', p_organization_id::text,
          p_property_id::text, p_owner_person_id::text, p_currency::text,
          v_month::text
        ),
        0
      )
    );
  END LOOP;

  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );

  PERFORM 1
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start >= p_from_month
  ORDER BY period.month_start
  FOR UPDATE;
END;
$$;

ALTER FUNCTION app_private.lock_owner_close_scope(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.lock_owner_close_series(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.lock_owner_close_recovery_scope(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_scope(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_series(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_recovery_scope(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch_owner_close_readiness_pending_claim$
DECLARE
  v_definition text;
  v_old text := E'      AND request.status = ''pending''\n  ) THEN';
  v_new text := E'      AND request.status = ''pending''\n      AND request.id IS DISTINCT FROM nullif(\n        pg_catalog.current_setting(''app.owner_close_claim_request_id'', true), ''''\n      )::uuid\n  ) THEN';
BEGIN
  SELECT pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'app_private.build_owner_close_readiness(uuid,uuid,uuid,public.currency_code,date)'::regprocedure
    ), E'\r\n', E'\n'
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_readiness_pending_claim_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_close_readiness_pending_claim$;

DO $patch_close_owner_month_corrections$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'public.close_owner_month(uuid,uuid,uuid,public.currency_code,date,text,text)'::regprocedure
    ), E'\r\n', E'\n'
  ) INTO v_definition;

  v_old := $old$
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );

  v_readiness := app_private.build_owner_close_readiness(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
  IF NOT (v_readiness->>'is_ready')::boolean THEN
    RAISE EXCEPTION 'owner_close_blocked'
      USING ERRCODE = '23514', DETAIL = (v_readiness->'blockers')::text;
  END IF;

  SELECT snapshot.*
  INTO STRICT v_input_before
  FROM app_private.owner_close_input_snapshot(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  ) AS snapshot;

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'close_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;
$old$;
  v_new := $new$
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'close_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;
  PERFORM pg_catalog.set_config(
    'app.owner_close_claim_request_id', v_claim.request_id::text, true
  );
  PERFORM app_private.lock_owner_close_series(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );

  v_readiness := app_private.build_owner_close_readiness(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
  IF NOT (v_readiness->>'is_ready')::boolean THEN
    RAISE EXCEPTION 'owner_close_blocked'
      USING ERRCODE = '23514', DETAIL = (v_readiness->'blockers')::text;
  END IF;

  SELECT snapshot.*
  INTO STRICT v_input_before
  FROM app_private.owner_close_input_snapshot(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  ) AS snapshot;
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'close_owner_month_claim_order_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := E'    input_watermark = v_input_after.input_watermark,\n    input_hash = v_input_after.input_hash,';
  v_new := E'    input_watermark = v_input_after.input_watermark,\n    input_canonical = v_input_after.input_canonical,\n    input_hash = v_input_after.input_hash,';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'close_owner_month_input_evidence_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_close_owner_month_corrections$;

DO $patch_reopen_owner_month_corrections$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'public.reopen_owner_month(uuid,uuid,text,text)'::regprocedure
    ), E'\r\n', E'\n'
  ) INTO v_definition;

  v_old := $old$
  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = p_owner_close_series_id
  FOR UPDATE;

  IF v_series.state NOT IN ('closed', 'stale')
    OR v_series.current_closed_revision_id IS NULL THEN
    RAISE EXCEPTION 'owner_close_series_not_closed' USING ERRCODE = '22023';
  END IF;

  SELECT revision.*
  INTO STRICT v_current
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_series.current_closed_revision_id
    AND revision.status = 'closed'
  FOR KEY SHARE;

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'reopen_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;
$old$;
  v_new := $new$
  PERFORM app_private.lock_owner_close_recovery_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'reopen_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;
  PERFORM app_private.lock_owner_close_series(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = p_owner_close_series_id
  FOR UPDATE;

  IF v_series.state NOT IN ('closed', 'stale')
    OR v_series.current_closed_revision_id IS NULL THEN
    RAISE EXCEPTION 'owner_close_series_not_closed' USING ERRCODE = '22023';
  END IF;

  SELECT revision.*
  INTO STRICT v_current
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_series.current_closed_revision_id
    AND revision.status = 'closed'
  FOR KEY SHARE;
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'reopen_owner_month_claim_order_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := E'    AND later_series.month_start > v_series.month_start\n    AND later_series.current_closed_revision_id IS NOT NULL;';
  v_new := E'    AND later_series.month_start > v_series.month_start\n    AND later_series.current_closed_revision_id IS NOT NULL\n    AND later_series.state <> ''preparing'';';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'reopen_owner_month_nested_preparing_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_reopen_owner_month_corrections$;

DO $patch_owner_close_correction_corrections$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'public.record_owner_close_correction(uuid,uuid,public.owner_balance_component,date,numeric,text,text,text,text)'::regprocedure
    ), E'\r\n', E'\n'
  ) INTO v_definition;

  v_old := E'  v_current_closing numeric(14,2);\n  v_existing_corrections numeric(14,2);';
  v_new := E'  v_authoritative_opening numeric(14,2);\n  v_complete_movements numeric(14,2);';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_amount_declarations_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id
  FOR UPDATE;
  SELECT revision.*
  INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id
  FOR UPDATE;

  IF v_series.state <> 'preparing'
    OR v_series.active_revision_id <> v_revision.id
    OR v_revision.status <> 'preparing' THEN
    RAISE EXCEPTION 'owner_close_correction_requires_preparing_revision'
      USING ERRCODE = '22023';
  END IF;
$old$;
  v_new := $new$
  PERFORM app_private.lock_owner_close_recovery_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'record_owner_close_correction', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;
  PERFORM app_private.lock_owner_close_series(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id
  FOR UPDATE;
  SELECT revision.*
  INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id
  FOR UPDATE;

  IF v_series.state <> 'preparing'
    OR v_series.active_revision_id <> v_revision.id
    OR v_revision.status <> 'preparing' THEN
    RAISE EXCEPTION 'owner_close_correction_requires_preparing_revision'
      USING ERRCODE = '22023';
  END IF;
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_claim_order_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  SELECT component.closing_amount
  INTO STRICT v_current_closing
  FROM public.owner_balance_periods AS period
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start = v_series.month_start
    AND component.component = p_component;

  SELECT coalesce(pg_catalog.sum(correction.signed_amount), 0)::numeric(14,2)
  INTO v_existing_corrections
  FROM public.owner_close_corrections AS correction
  WHERE correction.organization_id = p_organization_id
    AND correction.owner_close_revision_id = v_revision.id
    AND correction.component = p_component;

  IF v_current_closing + v_existing_corrections + p_signed_amount < 0 THEN
$old$;
  v_new := $new$
  SELECT component.opening_amount
  INTO STRICT v_authoritative_opening
  FROM public.owner_balance_periods AS period
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start = v_series.month_start
    AND component.component = p_component
  FOR KEY SHARE OF component;

  SELECT coalesce(pg_catalog.sum(movement.signed_amount), 0)::numeric(14,2)
  INTO v_complete_movements
  FROM public.owner_component_movements AS movement
  WHERE movement.organization_id = p_organization_id
    AND movement.property_id = v_series.property_id
    AND movement.owner_person_id = v_series.owner_person_id
    AND movement.currency = v_series.currency
    AND movement.month_start = v_series.month_start
    AND movement.component = p_component;

  IF v_authoritative_opening + v_complete_movements + p_signed_amount < 0 THEN
$new$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_negative_check_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'record_owner_close_correction', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

$old$;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_old_claim_missing';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, '');

  v_old := E'    AND later_series.month_start > v_series.month_start\n    AND later_series.current_closed_revision_id IS NOT NULL;';
  v_new := E'    AND later_series.month_start > v_series.month_start\n    AND later_series.current_closed_revision_id IS NOT NULL\n    AND later_series.state <> ''preparing'';';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_close_correction_nested_preparing_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_close_correction_corrections$;

-- Repair any pre-existing contradictory later preparing pointer without
-- changing closed revision history.
DO $repair_nested_preparing_series$
BEGIN
  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', 'checked-owner-close-v1', true
  );
  WITH latest_preparing AS (
    SELECT DISTINCT ON (
      revision.organization_id, revision.owner_close_series_id
    )
      revision.organization_id,
      revision.owner_close_series_id,
      revision.id,
      revision.prepared_by
    FROM public.owner_close_revisions AS revision
    WHERE revision.status = 'preparing'
    ORDER BY revision.organization_id, revision.owner_close_series_id,
      revision.revision_number DESC
  )
  UPDATE public.owner_close_series AS series
  SET state = 'preparing',
    active_revision_id = preparing.id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = preparing.prepared_by
  FROM latest_preparing AS preparing
  WHERE series.state = 'stale'
    AND preparing.organization_id = series.organization_id
    AND preparing.owner_close_series_id = series.id;
END;
$repair_nested_preparing_series$;
