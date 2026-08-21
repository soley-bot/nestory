-- A zero value means that the Lease has no deposit requirement. Normalize it
-- at the database write boundary as well as in the server action so every
-- caller gets the same durable state.
DO $$
DECLARE
  v_definition text;
  v_anchor constant text := pg_catalog.replace($anchor$
BEGIN
  PERFORM 1
$anchor$, E'\r\n', E'\n');
  v_replacement constant text := pg_catalog.replace($replacement$
BEGIN
  IF p_deposit_amount = 0 THEN
    p_deposit_amount := NULL;
    p_deposit_currency := NULL;
  END IF;

  PERFORM 1
$replacement$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_lease_record_internal(uuid,uuid,uuid,uuid,numeric,public.currency_code,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected Lease creation deposit boundary was not found';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_replacement);
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_anchor constant text := pg_catalog.replace($anchor$
BEGIN
  SELECT lease.*
$anchor$, E'\r\n', E'\n');
  v_replacement constant text := pg_catalog.replace($replacement$
BEGIN
  IF p_deposit_amount = 0 THEN
    p_deposit_amount := NULL;
    p_deposit_currency := NULL;
  END IF;

  SELECT lease.*
$replacement$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.update_lease_record_internal(uuid,uuid,uuid,uuid,uuid,numeric,public.currency_code,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected Lease update deposit boundary was not found';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_replacement);
END;
$$;

-- Any deposit event is retained financial evidence, including a receipt that
-- was later reversed. A normal Lease edit must never archive that history.
DO $$
DECLARE
  v_definition text;
  v_anchor constant text := pg_catalog.replace($anchor$
    SELECT count(*)
    INTO v_settled_event_count
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.lease_deposit_id = v_deposit_id
      AND event.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_deposit_events AS reversal
        WHERE reversal.reversal_of_id = event.id
      );
$anchor$, E'\r\n', E'\n');
  v_replacement constant text := pg_catalog.replace($replacement$
    SELECT count(*)
    INTO v_settled_event_count
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.lease_deposit_id = v_deposit_id;
$replacement$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.update_lease_record_internal(uuid,uuid,uuid,uuid,uuid,numeric,public.currency_code,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected Lease deposit-evidence guard was not found';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_replacement);
END;
$$;

-- Terminal lifecycle transitions used to supersede only the newest selected
-- term. Close every remaining non-terminal authoritative term while retaining
-- every row and the appended terminal event/term lineage.
DO $$
DECLARE
  v_definition text;
  v_anchor constant text := pg_catalog.replace($anchor$
  ELSE
    v_term_id := v_current_term.id;
  END IF;

  v_new_occupancy_status := CASE v_transition
$anchor$, E'\r\n', E'\n');
  v_replacement constant text := pg_catalog.replace($replacement$
  ELSE
    v_term_id := v_current_term.id;
  END IF;

  IF v_transition IN ('end', 'terminate', 'cancel') THEN
    UPDATE public.lease_terms AS term
    SET status = 'superseded',
        updated_at = statement_timestamp(),
        updated_by = v_actor_id
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.id <> v_term_id
      AND term.authority_kind = 'authoritative'
      AND term.status NOT IN ('superseded', 'terminated')
      AND term.archived_at IS NULL;
  END IF;

  v_new_occupancy_status := CASE v_transition
$replacement$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'public.transition_lease_lifecycle(uuid,uuid,text,uuid,text,date,date,text,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected Lease terminal term transition was not found';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_replacement);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.repair_pilot_zero_deposit()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_organization_id constant uuid :=
    '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid;
  v_lease_id constant uuid :=
    '4cc6c6ef-f37f-45cf-94cf-0cc4fc34cba8'::uuid;
  v_property_id constant uuid :=
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef'::uuid;
  v_unit_id constant uuid :=
    '23a55cc6-0a9c-4a5c-8abd-06fc811d42e7'::uuid;
  v_deposit_id constant uuid :=
    'eccc7414-feb2-4f26-91cb-7b86e2c302ae'::uuid;
  v_lease public.leases%ROWTYPE;
  v_deposit public.lease_deposits%ROWTYPE;
  v_changed integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_organization_id
  ) THEN
    RETURN 'pilot_not_present';
  END IF;

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = v_organization_id
    AND lease.id = v_lease_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_lease.property_id IS DISTINCT FROM v_property_id
    OR v_lease.unit_id IS DISTINCT FROM v_unit_id
    OR v_lease.status IS DISTINCT FROM 'cancelled'
    OR v_lease.archived_at IS DISTINCT FROM
      '2026-08-21 09:10:49.34408+00'::timestamptz THEN
    RAISE EXCEPTION 'Pilot zero-deposit Lease precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_zero_deposit_lease_shape_changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = v_organization_id
      AND property.id = v_property_id
      AND property.archived_at =
        '2026-08-19 07:22:47.618714+00'::timestamptz
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.organization_id = v_organization_id
      AND unit.id = v_unit_id
      AND unit.property_id = v_property_id
      AND unit.archived_at =
        '2026-08-19 07:22:13.155322+00'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Pilot zero-deposit scope precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_zero_deposit_scope_shape_changed';
  END IF;

  SELECT deposit.*
  INTO v_deposit
  FROM public.lease_deposits AS deposit
  WHERE deposit.organization_id = v_organization_id
    AND deposit.id = v_deposit_id
    AND deposit.lease_id = v_lease_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_deposit.deposit_type IS DISTINCT FROM 'security'
    OR v_deposit.amount IS DISTINCT FROM 0::numeric
    OR v_deposit.currency IS DISTINCT FROM 'USD'::public.currency_code
    OR v_deposit.status IS DISTINCT FROM 'pending'
    OR v_deposit.received_on IS NOT NULL
    OR v_deposit.returned_on IS NOT NULL
    OR v_deposit.notes IS NOT NULL
    OR (
      SELECT count(*) FROM public.lease_deposits AS deposit
      WHERE deposit.organization_id = v_organization_id
        AND deposit.lease_id = v_lease_id
    ) <> 1 THEN
    RAISE EXCEPTION 'Pilot zero-deposit artifact precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_zero_deposit_artifact_shape_changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = v_organization_id
      AND event.lease_deposit_id = v_deposit_id
  ) OR EXISTS (
    SELECT 1
    FROM public.ledger_entries AS entry
    WHERE entry.organization_id = v_organization_id
      AND entry.source_id = v_deposit_id
  ) THEN
    RAISE EXCEPTION 'Pilot zero deposit now has financial evidence'
      USING ERRCODE = '55000', DETAIL = 'pilot_zero_deposit_evidence_present';
  END IF;

  IF v_lease.deposit_amount IS NULL
    AND v_lease.deposit_currency IS NULL
    AND v_deposit.archived_at IS NOT NULL THEN
    RETURN 'already_repaired';
  END IF;

  IF v_lease.deposit_amount IS DISTINCT FROM 0::numeric
    OR v_lease.deposit_currency IS DISTINCT FROM
      'USD'::public.currency_code
    OR v_deposit.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pilot zero-deposit repair state is partial or changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_zero_deposit_state_changed';
  END IF;

  UPDATE public.leases
  SET deposit_amount = NULL,
      deposit_currency = NULL,
      updated_at = statement_timestamp()
  WHERE organization_id = v_organization_id
    AND id = v_lease_id
    AND deposit_amount = 0
    AND deposit_currency = 'USD';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Pilot zero-deposit Lease update did not match exactly once';
  END IF;

  UPDATE public.lease_deposits
  SET archived_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE organization_id = v_organization_id
    AND id = v_deposit_id
    AND archived_at IS NULL;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Pilot zero-deposit artifact update did not match exactly once';
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  SELECT
    v_organization_id,
    NULL,
    'lease',
    v_lease_id,
    'lease_zero_deposit_normalized',
    jsonb_build_object('depositAmount', 0, 'depositCurrency', 'USD'),
    jsonb_build_object('depositRequired', false)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.activity_logs AS log
    WHERE log.organization_id = v_organization_id
      AND log.entity_type = 'lease'
      AND log.entity_id = v_lease_id
      AND log.action = 'lease_zero_deposit_normalized'
  );

  RETURN 'repaired';
END;
$$;

ALTER FUNCTION app_private.repair_pilot_zero_deposit() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.repair_pilot_zero_deposit()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.repair_pilot_stale_rent_term()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_organization_id constant uuid :=
    '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid;
  v_lease_id constant uuid :=
    '0f7dd6c8-7a1e-4772-b415-9e8b3c483b12'::uuid;
  v_property_id constant uuid :=
    '17e1d5fe-d0b4-463e-881b-48c8724f3fef'::uuid;
  v_unit_id constant uuid :=
    'ec2a01f5-1fea-48cf-87df-68e7f2acda31'::uuid;
  v_target_term_id constant uuid :=
    'ffceebfe-cc6d-4188-bd64-9044f1bc651c'::uuid;
  v_manifest jsonb;
  v_before_manifest constant jsonb :=
    '[["f07b0734-025c-49b6-8781-bda08d682fd3",1,"2026-08-15","2026-10-24","superseded",1000,"USD",5,"monthly",""],["ffceebfe-cc6d-4188-bd64-9044f1bc651c",2,"2026-08-15","2026-08-15","active",1000,"USD",5,"monthly","f07b0734-025c-49b6-8781-bda08d682fd3"],["0cd38538-8a00-49b4-9188-c637d59c8ea8",3,"2026-08-16","2026-10-24","superseded",1000,"USD",5,"monthly","ffceebfe-cc6d-4188-bd64-9044f1bc651c"],["980a5152-e5f5-478a-8e09-6129fb3a804f",4,"2026-08-16","2026-08-21","terminated",1000,"USD",5,"monthly","0cd38538-8a00-49b4-9188-c637d59c8ea8"]]'::jsonb;
  v_after_manifest constant jsonb :=
    '[["f07b0734-025c-49b6-8781-bda08d682fd3",1,"2026-08-15","2026-10-24","superseded",1000,"USD",5,"monthly",""],["ffceebfe-cc6d-4188-bd64-9044f1bc651c",2,"2026-08-15","2026-08-15","superseded",1000,"USD",5,"monthly","f07b0734-025c-49b6-8781-bda08d682fd3"],["0cd38538-8a00-49b4-9188-c637d59c8ea8",3,"2026-08-16","2026-10-24","superseded",1000,"USD",5,"monthly","ffceebfe-cc6d-4188-bd64-9044f1bc651c"],["980a5152-e5f5-478a-8e09-6129fb3a804f",4,"2026-08-16","2026-08-21","terminated",1000,"USD",5,"monthly","0cd38538-8a00-49b4-9188-c637d59c8ea8"]]'::jsonb;
  v_lease public.leases%ROWTYPE;
  v_changed integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_organization_id
  ) THEN
    RETURN 'pilot_not_present';
  END IF;

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = v_organization_id
    AND lease.id = v_lease_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_lease.property_id IS DISTINCT FROM v_property_id
    OR v_lease.unit_id IS DISTINCT FROM v_unit_id
    OR v_lease.status IS DISTINCT FROM 'terminated'
    OR v_lease.archived_at IS DISTINCT FROM
      '2026-08-21 09:15:52.228399+00'::timestamptz THEN
    RAISE EXCEPTION 'Pilot stale-term Lease precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_stale_term_lease_shape_changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = v_organization_id
      AND property.id = v_property_id
      AND property.archived_at =
        '2026-08-19 07:22:47.618714+00'::timestamptz
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.units AS unit
    WHERE unit.organization_id = v_organization_id
      AND unit.id = v_unit_id
      AND unit.property_id = v_property_id
      AND unit.archived_at =
        '2026-08-19 07:21:55.87346+00'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Pilot stale-term scope precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_stale_term_scope_shape_changed';
  END IF;

  PERFORM 1
  FROM public.lease_terms AS term
  WHERE term.organization_id = v_organization_id
    AND term.lease_id = v_lease_id
  FOR UPDATE;

  SELECT jsonb_agg(
    jsonb_build_array(
      term.id::text,
      term.term_sequence,
      term.start_date::text,
      term.end_date::text,
      term.status,
      term.rent_amount,
      term.rent_currency::text,
      term.rent_due_day,
      term.payment_frequency,
      coalesce(term.supersedes_term_id::text, '')
    )
    ORDER BY term.term_sequence, term.id
  )
  INTO v_manifest
  FROM public.lease_terms AS term
  WHERE term.organization_id = v_organization_id
    AND term.lease_id = v_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.archived_at IS NULL;

  IF v_manifest = v_after_manifest THEN
    RETURN 'already_repaired';
  END IF;

  IF v_manifest IS DISTINCT FROM v_before_manifest
    OR (
      SELECT count(*)
      FROM public.lease_terms AS term
      WHERE term.organization_id = v_organization_id
        AND term.lease_id = v_lease_id
    ) <> 4
    OR NOT EXISTS (
      SELECT 1
      FROM public.lease_lifecycle_events AS event
      WHERE event.organization_id = v_organization_id
        AND event.id = 'd62d7e16-1430-4da0-8022-bed51bb42512'
        AND event.lease_id = v_lease_id
        AND event.transition = 'terminate'
        AND event.to_status = 'terminated'
        AND event.term_id = '980a5152-e5f5-478a-8e09-6129fb3a804f'
        AND event.effective_date = DATE '2026-08-21'
    ) THEN
    RAISE EXCEPTION 'Pilot stale-term history precondition changed'
      USING ERRCODE = '55000', DETAIL = 'pilot_stale_term_history_shape_changed';
  END IF;

  UPDATE public.lease_terms
  SET status = 'superseded',
      updated_at = statement_timestamp()
  WHERE organization_id = v_organization_id
    AND lease_id = v_lease_id
    AND id = v_target_term_id
    AND status = 'active';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Pilot stale-term update did not match exactly once';
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  SELECT
    v_organization_id,
    NULL,
    'lease',
    v_lease_id,
    'lease_stale_term_closed',
    jsonb_build_object('termId', v_target_term_id, 'status', 'active'),
    jsonb_build_object('termId', v_target_term_id, 'status', 'superseded')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.activity_logs AS log
    WHERE log.organization_id = v_organization_id
      AND log.entity_type = 'lease'
      AND log.entity_id = v_lease_id
      AND log.action = 'lease_stale_term_closed'
  );

  RETURN 'repaired';
END;
$$;

ALTER FUNCTION app_private.repair_pilot_stale_rent_term() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.repair_pilot_stale_rent_term()
FROM PUBLIC, anon, authenticated, service_role;

SELECT app_private.repair_pilot_zero_deposit();
SELECT app_private.repair_pilot_stale_rent_term();

COMMENT ON FUNCTION app_private.repair_pilot_zero_deposit() IS
  'Idempotent, fail-closed repair for the inspected Pilot zero-value deposit artifact only.';

COMMENT ON FUNCTION app_private.repair_pilot_stale_rent_term() IS
  'Idempotent, fail-closed repair for the inspected Pilot stale historical rent-term status only.';

COMMENT ON FUNCTION app_private.create_lease_record_internal(
  uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) IS
  'Creates a Lease record and normalizes a zero deposit to no deposit required.';

COMMENT ON FUNCTION app_private.update_lease_record_internal(
  uuid, uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) IS
  'Updates Lease header facts, normalizes zero to no deposit, and protects deposits with recorded activity.';

COMMENT ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) IS
  'Checked Lease lifecycle writer; terminal transitions supersede every remaining non-terminal authoritative term while preserving history.';
