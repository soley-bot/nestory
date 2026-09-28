-- Record confirmed past occupancy directly as ended, preserving predecessor evidence.
CREATE OR REPLACE FUNCTION public.record_completed_draft_lease(p_organization_id uuid, p_lease_id uuid, p_expected_status text, p_expected_occupancy_id uuid, p_transition text, p_effective_date date, p_scheduled_move_out_date date, p_reason text, p_idempotency_key text, p_move_in_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_transition text := lower(trim(coalesce(p_transition, '')));
  v_expected_status text := lower(trim(coalesce(p_expected_status, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_lease public.leases%ROWTYPE;
  v_old_occupancy public.lease_occupancies%ROWTYPE;
  v_new_occupancy_id uuid := gen_random_uuid();
  v_new_status text;
  v_new_occupancy_status text;
  v_new_occupancy_lifecycle text;
  v_event public.lease_lifecycle_events%ROWTYPE;
  v_current_term public.lease_terms%ROWTYPE;
  v_term_id uuid;
  v_term_end_date date;
  v_party public.lease_parties%ROWTYPE;
  v_new_party_id uuid;
  v_party_id_map jsonb := '{}'::jsonb;
  v_primary_party_id uuid;
  v_participant public.lease_occupancy_participants%ROWTYPE;
  v_new_participant_id uuid;
  v_new_participant_party_id uuid;
  v_primary_participant_present boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM app_private.assert_lease_permission(
    p_organization_id,
    p_lease_id,
    CASE WHEN v_transition = 'activate'
      THEN 'leases.activate'::public.organization_permission_key
      ELSE 'leases.close'::public.organization_permission_key
    END
  );

  SELECT event.* INTO v_event
  FROM public.lease_lifecycle_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_event.lease_id IS DISTINCT FROM p_lease_id
      OR v_event.from_status IS DISTINCT FROM v_expected_status
      OR v_event.expected_occupancy_id IS DISTINCT FROM p_expected_occupancy_id
      OR v_event.transition IS DISTINCT FROM v_transition
      OR v_event.effective_date IS DISTINCT FROM p_effective_date
      OR v_event.scheduled_move_out_date IS DISTINCT FROM p_scheduled_move_out_date
      OR v_event.reason IS DISTINCT FROM v_reason
      OR NOT EXISTS (SELECT 1 FROM public.lease_occupancies o
        WHERE o.id=v_event.occupancy_id AND o.actual_move_in_date=p_move_in_date) THEN
      RAISE EXCEPTION 'Conflicting Lease lifecycle idempotency request'
        USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_idempotency_conflict';
    END IF;

    DELETE FROM app_private.lease_lifecycle_authority_tokens AS token
  WHERE token.backend_pid=pg_catalog.pg_backend_pid()
    AND token.transaction_id=pg_catalog.txid_current()
    AND token.organization_id=p_organization_id
    AND token.lease_id=p_lease_id;

  RETURN jsonb_build_object(
      'eventId', v_event.id,
      'leaseId', v_event.lease_id,
      'occupancyId', v_event.occupancy_id,
      'termId', v_event.term_id,
      'status', v_event.to_status
    );
  END IF;

  IF v_transition <> 'end' OR v_expected_status <> 'draft'
    OR p_move_in_date IS NULL OR p_effective_date IS NULL
    OR p_move_in_date > p_effective_date
    OR p_effective_date > app_private.rent_business_date(p_organization_id)
    OR p_scheduled_move_out_date IS NOT NULL THEN
    RAISE EXCEPTION 'Choose actual move-in and move-out dates for a completed draft lease'
      USING ERRCODE = '22023', DETAIL = 'lease_history_dates_invalid';
  END IF;
  PERFORM app_private.assert_lease_permission(p_organization_id, p_lease_id, 'leases.activate');

  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Lifecycle effective date is required'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_effective_date_required';
  END IF;

  IF length(v_reason) < 8 THEN
    RAISE EXCEPTION 'Lifecycle evidence reason is required'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_reason_required';
  END IF;

  IF length(v_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'Lifecycle idempotency key is required'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_idempotency_required';
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
  FOR UPDATE;

  IF NOT FOUND OR v_lease.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_lease.status IS DISTINCT FROM v_expected_status THEN
    RAISE EXCEPTION 'Lease lifecycle changed after this form was opened'
      USING ERRCODE = '40001', DETAIL = 'lease_lifecycle_stale_status';
  END IF;

  v_new_status := CASE v_transition
    WHEN 'activate' THEN 'active'
    WHEN 'give_notice' THEN 'notice_given'
    WHEN 'end' THEN 'ended'
    WHEN 'terminate' THEN 'terminated'
    WHEN 'cancel' THEN 'cancelled'
  END;

  IF v_new_status IS NULL
    OR NOT (
      (v_transition = 'activate' AND v_expected_status = 'draft')
      OR (v_transition = 'give_notice' AND v_expected_status = 'active')
      OR (v_transition = 'end' AND v_expected_status IN ('draft', 'active', 'notice_given'))
      OR (v_transition = 'terminate' AND v_expected_status IN ('draft', 'active', 'notice_given'))
      OR (v_transition = 'cancel' AND v_expected_status = 'draft')
    ) THEN
    RAISE EXCEPTION 'Unsupported Lease lifecycle transition'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_transition_invalid';
  END IF;

  IF v_transition = 'give_notice'
    AND (
      p_scheduled_move_out_date IS NULL
      OR p_scheduled_move_out_date < p_effective_date
    ) THEN
    RAISE EXCEPTION 'Notice requires a planned move-out on or after the notice date'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_notice_move_out_required';
  END IF;

  SELECT occupancy.* INTO v_old_occupancy
  FROM public.lease_occupancies AS occupancy
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.id = p_expected_occupancy_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_old_occupancy.evidence_state <> 'accepted'
    OR v_old_occupancy.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Occupancy evidence changed after this form was opened'
      USING ERRCODE = '40001', DETAIL = 'lease_lifecycle_stale_occupancy';
  END IF;

  IF v_old_occupancy.property_id IS DISTINCT FROM v_lease.property_id
    OR v_old_occupancy.unit_id IS DISTINCT FROM v_lease.unit_id THEN
    RAISE EXCEPTION 'Occupancy evidence no longer matches the Lease scope'
      USING ERRCODE = '40001', DETAIL = 'lease_lifecycle_scope_changed';
  END IF;

  IF v_transition IN ('end', 'terminate')
    AND v_old_occupancy.actual_move_in_date IS NOT NULL
    AND p_effective_date < v_old_occupancy.actual_move_in_date THEN
    RAISE EXCEPTION 'Move-out cannot be before confirmed move-in'
      USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_move_out_before_move_in';
  END IF;

  SELECT term.* INTO v_current_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status NOT IN ('superseded', 'terminated')
    AND term.archived_at IS NULL
  ORDER BY term.term_sequence DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authoritative Lease term not found'
      USING ERRCODE = '23503', DETAIL = 'lease_lifecycle_term_required';
  END IF;

  IF p_move_in_date < v_current_term.start_date OR p_move_in_date > v_current_term.end_date
    OR p_effective_date > v_current_term.end_date THEN
    RAISE EXCEPTION 'Actual occupancy dates must be within the recorded lease term'
      USING ERRCODE = '22023', DETAIL = 'lease_history_dates_outside_term';
  END IF;

  INSERT INTO app_private.lease_lifecycle_authority_tokens(
    backend_pid,transaction_id,organization_id,lease_id
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    p_organization_id,p_lease_id
  ) ON CONFLICT DO NOTHING;

  IF v_transition = 'activate' THEN
    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      v_current_term.start_date,
      v_current_term.end_date,
      v_current_term.rent_amount,
      v_current_term.rent_currency,
      v_current_term.rent_due_day,
      v_current_term.payment_frequency,
      'active',
      v_current_term.id,
      v_idempotency_key || ':term'
    );
  ELSIF v_transition IN ('end', 'terminate', 'cancel') THEN
    v_term_end_date := CASE
      WHEN v_transition = 'cancel' THEN v_current_term.end_date
      ELSE greatest(
        v_current_term.start_date,
        least(v_current_term.end_date, p_effective_date)
      )
    END;
    INSERT INTO app_private.lease_scope_terminal_recovery_tokens (
      backend_pid,
      transaction_id,
      organization_id,
      lease_id
    )
    VALUES (
      pg_catalog.pg_backend_pid(),
      pg_catalog.txid_current(),
      p_organization_id,
      p_lease_id
    );

    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      v_current_term.start_date,
      v_term_end_date,
      v_current_term.rent_amount,
      v_current_term.rent_currency,
      v_current_term.rent_due_day,
      v_current_term.payment_frequency,
      'terminated',
      v_current_term.id,
      v_idempotency_key || ':term'
    );

    DELETE FROM app_private.lease_scope_terminal_recovery_tokens AS recovery
    WHERE recovery.backend_pid = pg_catalog.pg_backend_pid()
      AND recovery.transaction_id = pg_catalog.txid_current()
      AND recovery.organization_id = p_organization_id
      AND recovery.lease_id = p_lease_id;
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
    WHEN 'activate' THEN 'occupied'
    WHEN 'give_notice' THEN 'notice_given'
    WHEN 'end' THEN 'vacated'
    WHEN 'terminate' THEN 'vacated'
    WHEN 'cancel' THEN 'cancelled'
  END;
  v_new_occupancy_lifecycle := CASE
    WHEN v_transition = 'cancel' THEN 'cancelled_before_effective'
    ELSE v_new_occupancy_status
  END;

  PERFORM set_config(
    'app.lease_history_write_context',
    'checked-lease-lifecycle-v1',
    true
  );

  UPDATE public.lease_occupancies
  SET
    evidence_state = 'superseded',
    updated_at = statement_timestamp(),
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_old_occupancy.id;

  INSERT INTO public.lease_occupancies (
    id, organization_id, lease_id, property_id, unit_id, status,
    scheduled_move_in_date, actual_move_in_date, notice_date,
    scheduled_move_out_date, actual_move_out_date,
    evidence_state, business_lifecycle, record_source,
    scheduled_move_in_kind, scheduled_move_in_confidence,
    scheduled_move_out_kind, scheduled_move_out_confidence,
    actual_move_in_kind, actual_move_in_confidence,
    actual_move_out_kind, actual_move_out_confidence,
    notice_kind, notice_confidence,
    supersedes_lease_occupancy_id, correction_reason,
    evidence_recorded_at, evidence_recorded_by, evidence_reason,
    created_by, updated_by
  ) VALUES (
    v_new_occupancy_id,
    p_organization_id,
    p_lease_id,
    v_lease.property_id,
    v_lease.unit_id,
    v_new_occupancy_status,
    v_old_occupancy.scheduled_move_in_date,
    CASE
      WHEN v_transition = 'activate' THEN p_effective_date
      WHEN v_transition = 'cancel' THEN NULL
      ELSE p_move_in_date
    END,
    CASE
      WHEN v_transition = 'give_notice' THEN p_effective_date
      WHEN v_transition = 'cancel' THEN NULL
      ELSE v_old_occupancy.notice_date
    END,
    CASE
      WHEN v_transition = 'give_notice' THEN p_scheduled_move_out_date
      ELSE v_old_occupancy.scheduled_move_out_date
    END,
    CASE
      WHEN v_transition IN ('end', 'terminate') THEN p_effective_date
      ELSE NULL
    END,
    'accepted',
    v_new_occupancy_lifecycle,
    'operator_confirmed',
    v_old_occupancy.scheduled_move_in_kind,
    v_old_occupancy.scheduled_move_in_confidence,
    CASE
      WHEN v_transition = 'give_notice' THEN 'known'
      ELSE v_old_occupancy.scheduled_move_out_kind
    END,
    CASE
      WHEN v_transition = 'give_notice' THEN 'confirmed'
      ELSE v_old_occupancy.scheduled_move_out_confidence
    END,
    CASE
      WHEN v_transition = 'activate' THEN 'known'
      WHEN v_transition = 'cancel' THEN 'unknown'
      ELSE 'known'
    END,
    CASE
      WHEN v_transition = 'activate' THEN 'confirmed'
      WHEN v_transition = 'cancel' THEN 'unknown'
      ELSE 'confirmed'
    END,
    CASE
      WHEN v_transition IN ('end', 'terminate') THEN 'known'
      WHEN v_transition IN ('activate', 'give_notice') THEN 'open_current'
      ELSE 'unknown'
    END,
    CASE
      WHEN v_transition IN ('activate', 'give_notice', 'end', 'terminate')
        THEN 'confirmed'
      ELSE 'unknown'
    END,
    CASE
      WHEN v_transition = 'give_notice' THEN 'known'
      WHEN v_transition = 'cancel' THEN 'unknown'
      ELSE v_old_occupancy.notice_kind
    END,
    CASE
      WHEN v_transition = 'give_notice' THEN 'confirmed'
      WHEN v_transition = 'cancel' THEN 'unknown'
      ELSE v_old_occupancy.notice_confidence
    END,
    v_old_occupancy.id,
    v_reason,
    statement_timestamp(),
    v_actor_id,
    v_reason,
    v_actor_id,
    v_actor_id
  );

  UPDATE public.lease_occupancies
  SET
    superseded_by_lease_occupancy_id = v_new_occupancy_id,
    updated_at = statement_timestamp(),
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_old_occupancy.id;

  IF v_transition <> 'give_notice' THEN
    FOR v_party IN
      SELECT party.*
      FROM public.lease_parties AS party
      WHERE party.organization_id = p_organization_id
        AND party.lease_id = p_lease_id
        AND party.evidence_state = 'accepted'
        AND party.archived_at IS NULL
      ORDER BY party.id
      FOR UPDATE
    LOOP
      v_new_party_id := gen_random_uuid();

      UPDATE public.lease_parties
      SET
        evidence_state = 'superseded',
        updated_at = statement_timestamp(),
        updated_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND id = v_party.id;

      INSERT INTO public.lease_parties (
        id, organization_id, lease_id, person_id, party_role, is_primary,
        started_on, ended_on, evidence_state, business_lifecycle,
        record_source, started_on_kind, started_on_confidence,
        ended_on_kind, ended_on_confidence,
        supersedes_lease_party_id, correction_reason,
        evidence_recorded_at, evidence_recorded_by, evidence_reason,
        created_by, updated_by
      ) VALUES (
        v_new_party_id,
        p_organization_id,
        p_lease_id,
        v_party.person_id,
        v_party.party_role,
        v_party.is_primary,
        CASE
          WHEN v_transition = 'activate' THEN p_effective_date
          WHEN v_transition = 'cancel' THEN NULL
          ELSE p_move_in_date
        END,
        CASE
          WHEN v_transition IN ('end', 'terminate') THEN p_effective_date
          ELSE NULL
        END,
        'accepted',
        CASE
          WHEN v_transition = 'activate' THEN 'effective'
          WHEN v_transition = 'cancel' THEN 'cancelled_before_effective'
          ELSE 'ended'
        END,
        'operator_confirmed',
        CASE
          WHEN v_transition = 'activate' THEN 'known'
          WHEN v_transition = 'cancel' THEN 'unknown'
          ELSE 'known'
        END,
        CASE
          WHEN v_transition = 'activate' THEN 'confirmed'
          WHEN v_transition = 'cancel' THEN 'unknown'
          ELSE 'confirmed'
        END,
        CASE
          WHEN v_transition IN ('end', 'terminate') THEN 'known'
          WHEN v_transition = 'activate' THEN 'open_current'
          ELSE 'unknown'
        END,
        CASE
          WHEN v_transition IN ('activate', 'end', 'terminate') THEN 'confirmed'
          ELSE 'unknown'
        END,
        v_party.id,
        v_reason,
        statement_timestamp(),
        v_actor_id,
        v_reason,
        v_actor_id,
        v_actor_id
      );

      UPDATE public.lease_parties
      SET
        superseded_by_lease_party_id = v_new_party_id,
        updated_at = statement_timestamp(),
        updated_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND id = v_party.id;

      v_party_id_map := v_party_id_map || jsonb_build_object(
        v_party.id::text,
        v_new_party_id::text
      );

      IF v_party.is_primary AND v_party.party_role = 'primary_tenant' THEN
        v_primary_party_id := v_new_party_id;
      END IF;
    END LOOP;
  ELSE
    SELECT party.id INTO v_primary_party_id
    FROM public.lease_parties AS party
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.evidence_state = 'accepted'
      AND party.is_primary
      AND party.party_role = 'primary_tenant'
    ORDER BY party.created_at DESC
    LIMIT 1;
  END IF;

  FOR v_participant IN
    SELECT participant.*
    FROM public.lease_occupancy_participants AS participant
    WHERE participant.organization_id = p_organization_id
      AND participant.lease_occupancy_id = v_old_occupancy.id
      AND participant.evidence_state = 'accepted'
    ORDER BY participant.id
    FOR UPDATE
  LOOP
    v_new_participant_id := gen_random_uuid();
    v_new_participant_party_id := coalesce(
      (v_party_id_map ->> v_participant.lease_party_id::text)::uuid,
      v_participant.lease_party_id
    );
    v_primary_participant_present :=
      v_primary_participant_present
      OR v_new_participant_party_id = v_primary_party_id;

    UPDATE public.lease_occupancy_participants
    SET
      evidence_state = 'superseded',
      updated_at = statement_timestamp(),
      updated_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_participant.id;

    INSERT INTO public.lease_occupancy_participants (
      id, organization_id, lease_occupancy_id, lease_party_id,
      started_on, ended_on, evidence_state, business_lifecycle,
      record_source, started_on_kind, started_on_confidence,
      ended_on_kind, ended_on_confidence,
      supersedes_participant_id, correction_reason,
      evidence_recorded_at, evidence_recorded_by, evidence_reason,
      created_by, updated_by
    ) VALUES (
      v_new_participant_id,
      p_organization_id,
      v_new_occupancy_id,
      v_new_participant_party_id,
      CASE
        WHEN v_transition = 'activate' THEN p_effective_date
        ELSE p_move_in_date
      END,
      CASE
        WHEN v_transition IN ('end', 'terminate') THEN p_effective_date
        ELSE NULL
      END,
      'accepted',
      CASE
        WHEN v_transition IN ('end', 'terminate') THEN 'ended'
        ELSE 'present'
      END,
      'operator_confirmed',
      CASE
        WHEN v_transition = 'activate' THEN 'known'
        ELSE 'known'
      END,
      CASE
        WHEN v_transition = 'activate' THEN 'confirmed'
        ELSE 'confirmed'
      END,
      CASE
        WHEN v_transition IN ('end', 'terminate') THEN 'known'
        ELSE 'open_current'
      END,
      'confirmed',
      v_participant.id,
      v_reason,
      statement_timestamp(),
      v_actor_id,
      v_reason,
      v_actor_id,
      v_actor_id
    );

    UPDATE public.lease_occupancy_participants
    SET
      superseded_by_participant_id = v_new_participant_id,
      updated_at = statement_timestamp(),
      updated_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_participant.id;
  END LOOP;

  IF v_transition = 'activate' AND NOT v_primary_participant_present THEN
    IF v_primary_party_id IS NULL THEN
      RAISE EXCEPTION 'Accepted primary Tenant relationship not found'
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.lease_occupancy_participants (
      organization_id, lease_occupancy_id, lease_party_id,
      started_on, ended_on, evidence_state, business_lifecycle,
      record_source, started_on_kind, started_on_confidence,
      ended_on_kind, ended_on_confidence,
      correction_reason, evidence_recorded_at, evidence_recorded_by,
      evidence_reason, created_by, updated_by
    ) VALUES (
      p_organization_id,
      v_new_occupancy_id,
      v_primary_party_id,
      p_effective_date,
      NULL,
      'accepted',
      'present',
      'operator_confirmed',
      'known',
      'confirmed',
      'open_current',
      'confirmed',
      v_reason,
      statement_timestamp(),
      v_actor_id,
      v_reason,
      v_actor_id,
      v_actor_id
    );
  END IF;

  IF NOT v_primary_participant_present THEN
    RAISE EXCEPTION 'Accepted primary Tenant relationship not found' USING ERRCODE='23503';
  END IF;

  PERFORM set_config(
    'app.lease_lifecycle_write_context',
    'checked-lease-lifecycle-v1',
    true
  );

  UPDATE public.leases
  SET
    status = v_new_status,
    updated_at = statement_timestamp(),
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_lease_id;

  PERFORM set_config('app.lease_lifecycle_write_context', 'off', true);
  PERFORM set_config('app.lease_history_write_context', 'off', true);

  INSERT INTO public.lease_lifecycle_events (
    organization_id, lease_id, transition, from_status, to_status,
    expected_occupancy_id, occupancy_id, term_id, effective_date,
    scheduled_move_out_date, reason, idempotency_key, created_by
  ) VALUES (
    p_organization_id, p_lease_id, v_transition, v_expected_status,
    v_new_status, p_expected_occupancy_id, v_new_occupancy_id, v_term_id,
    p_effective_date, p_scheduled_move_out_date, v_reason,
    v_idempotency_key, v_actor_id
  )
  RETURNING * INTO v_event;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'lease',
    p_lease_id,
    'lease_history_completed',
    jsonb_build_object(
      'status', v_expected_status,
      'occupancyId', p_expected_occupancy_id
    ),
    jsonb_build_object(
      'status', v_new_status,
      'occupancyId', v_new_occupancy_id,
      'effectiveDate', p_effective_date,
      'actualMoveInDate', p_move_in_date,
      'scheduledMoveOutDate', p_scheduled_move_out_date,
      'reason', v_reason
    )
  );

  DELETE FROM app_private.lease_lifecycle_authority_tokens AS token
  WHERE token.backend_pid=pg_catalog.pg_backend_pid()
    AND token.transaction_id=pg_catalog.txid_current()
    AND token.organization_id=p_organization_id
    AND token.lease_id=p_lease_id;

  RETURN jsonb_build_object(
    'eventId', v_event.id,
    'leaseId', p_lease_id,
    'occupancyId', v_new_occupancy_id,
    'termId', v_term_id,
    'status', v_new_status
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.record_completed_draft_lease(uuid,uuid,text,uuid,text,date,date,text,text,date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_completed_draft_lease(uuid,uuid,text,uuid,text,date,date,text,text,date) TO authenticated;

