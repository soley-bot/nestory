CREATE OR REPLACE FUNCTION app_private.guard_lease_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_context text := current_setting('app.lease_history_write_context', true);
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(current_setting('app.people_leases_skip_sync', true), '') = 'on';
BEGIN
  IF v_trusted_fixture THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin')
    AND (
      (TG_OP = 'INSERT' AND v_context = 'checked-lease-create-v1')
      OR (TG_OP IN ('INSERT', 'UPDATE') AND v_context = 'checked-lease-create-v2')
      OR (TG_OP = 'UPDATE' AND v_context = 'checked-lease-bootstrap-v1')
      OR (
        TG_OP IN ('INSERT', 'UPDATE')
        AND v_context = 'checked-lease-occupancy-evidence-v1'
      )
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Lease relationship history can only be changed by a checked internal workflow'
    USING ERRCODE = '42501', DETAIL = 'lease_history_mutation_forbidden';
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_lease_history_mutation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.build_checked_lease_import_relationship_payload(
  p_source_import_row_id uuid,
  p_normalized_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SET search_path TO ''
AS $$
DECLARE
  v_lease_status text := lower(trim(p_normalized_data ->> 'status'));
  v_party_lifecycle text;
  v_occupancy_lifecycle text;
  v_participant_lifecycle text;
  v_scheduled_move_in date := NULLIF(p_normalized_data ->> 'scheduledMoveInDate', '')::date;
  v_scheduled_move_out date := NULLIF(p_normalized_data ->> 'scheduledMoveOutDate', '')::date;
  v_actual_move_in date := NULLIF(p_normalized_data ->> 'actualMoveInDate', '')::date;
  v_actual_move_out date := NULLIF(p_normalized_data ->> 'actualMoveOutDate', '')::date;
  v_actual_is_current boolean;
  v_participants jsonb := '[]'::jsonb;
BEGIN
  IF v_lease_status NOT IN (
    'active', 'cancelled', 'draft', 'ended', 'notice_given', 'terminated'
  ) THEN
    RAISE EXCEPTION 'Unsupported checked Lease import status'
      USING ERRCODE = '22023', DETAIL = 'lease_import_status_unsupported';
  END IF;

  v_party_lifecycle := CASE
    WHEN v_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN v_lease_status IN ('ended', 'terminated') THEN 'ended'
    WHEN v_lease_status IN ('active', 'notice_given') THEN 'effective'
    ELSE 'planned'
  END;
  v_occupancy_lifecycle := CASE
    WHEN v_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN v_lease_status IN ('ended', 'terminated') THEN 'vacated'
    WHEN v_lease_status = 'notice_given' THEN 'notice_given'
    WHEN v_lease_status = 'active' THEN 'occupied'
    ELSE 'reserved'
  END;
  v_participant_lifecycle := CASE
    WHEN v_lease_status IN ('ended', 'terminated') THEN 'ended'
    ELSE 'present'
  END;
  v_actual_is_current :=
    v_actual_move_in IS NOT NULL
    AND v_lease_status IN ('active', 'notice_given');

  IF v_actual_move_in IS NOT NULL THEN
    v_participants := jsonb_build_array(jsonb_build_object(
      'personId', (p_normalized_data ->> 'tenantPersonId')::uuid,
      'lifecycle', v_participant_lifecycle,
      'recordSource', 'imported_explicit',
      'reason', 'lease_import_explicit_occupancy',
      'startedOn', jsonb_build_object(
        'date', v_actual_move_in, 'kind', 'known', 'confidence', 'confirmed'
      ),
      'endedOn', CASE
        WHEN v_actual_is_current THEN jsonb_build_object(
          'date', NULL, 'kind', 'open_current', 'confidence', 'confirmed'
        )
        WHEN v_actual_move_out IS NOT NULL THEN jsonb_build_object(
          'date', v_actual_move_out, 'kind', 'known', 'confidence', 'confirmed'
        )
        ELSE jsonb_build_object(
          'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
        )
      END
    ));
  END IF;

  RETURN jsonb_build_object(
    'sourceImportRowId', p_source_import_row_id,
    'primaryParty', jsonb_build_object(
      'personId', (p_normalized_data ->> 'tenantPersonId')::uuid,
      'lifecycle', v_party_lifecycle,
      'recordSource', 'imported_explicit',
      'reason', 'lease_import_explicit_identity',
      'startedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL, 'kind', 'unknown', 'confidence', 'unknown'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', v_occupancy_lifecycle,
      'recordSource', 'imported_explicit',
      'reason', 'lease_import_explicit_scope',
      'scheduledMoveIn', CASE WHEN v_scheduled_move_in IS NULL
        THEN jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
        ELSE jsonb_build_object('date', v_scheduled_move_in, 'kind', 'known', 'confidence', 'confirmed')
      END,
      'scheduledMoveOut', CASE WHEN v_scheduled_move_out IS NULL
        THEN jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
        ELSE jsonb_build_object('date', v_scheduled_move_out, 'kind', 'known', 'confidence', 'confirmed')
      END,
      'actualMoveIn', CASE WHEN v_actual_move_in IS NULL
        THEN jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
        ELSE jsonb_build_object('date', v_actual_move_in, 'kind', 'known', 'confidence', 'confirmed')
      END,
      'actualMoveOut', CASE
        WHEN v_actual_is_current THEN jsonb_build_object(
          'date', NULL, 'kind', 'open_current', 'confidence', 'confirmed'
        )
        WHEN v_actual_move_out IS NOT NULL THEN jsonb_build_object(
          'date', v_actual_move_out, 'kind', 'known', 'confidence', 'confirmed'
        )
        ELSE jsonb_build_object('date', NULL, 'kind', 'unknown', 'confidence', 'unknown')
      END
    ),
    'participants', v_participants
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.build_checked_lease_import_relationship_payload(uuid, jsonb)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_current_lease_occupancy_evidence(
  p_organization_id uuid,
  p_lease_id uuid,
  p_expected_occupancy_id uuid,
  p_scheduled_move_in_date date,
  p_scheduled_move_out_date date,
  p_actual_move_in_date date,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_lease public.leases%ROWTYPE;
  v_old public.lease_occupancies%ROWTYPE;
  v_successor public.lease_occupancies%ROWTYPE;
  v_primary_party public.lease_parties%ROWTYPE;
  v_new_occupancy_id uuid := gen_random_uuid();
  v_participant_id uuid := gen_random_uuid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_scheduled_move_in_date date;
  v_scheduled_move_out_date date;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_actual_move_in_date IS NULL THEN
    RAISE EXCEPTION 'Confirmed move-in is required'
      USING ERRCODE = '22023', DETAIL = 'occupancy_actual_move_in_required';
  END IF;
  IF length(v_reason) < 8 THEN
    RAISE EXCEPTION 'Occupancy evidence reason is required'
      USING ERRCODE = '22023', DETAIL = 'occupancy_evidence_reason_required';
  END IF;
  IF p_scheduled_move_in_date IS NOT NULL
    AND p_scheduled_move_out_date IS NOT NULL
    AND p_scheduled_move_out_date < p_scheduled_move_in_date THEN
    RAISE EXCEPTION 'Scheduled move-out cannot be before scheduled move-in'
      USING ERRCODE = '22023';
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
  FOR UPDATE;
  IF NOT FOUND OR v_lease.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;
  IF v_lease.status NOT IN ('active', 'notice_given') OR v_lease.unit_id IS NULL THEN
    RAISE EXCEPTION 'Only a current unit-bound Lease can record current occupancy'
      USING ERRCODE = '22023', DETAIL = 'occupancy_repair_lease_not_current';
  END IF;

  SELECT occupancy.* INTO v_old
  FROM public.lease_occupancies AS occupancy
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.id = p_expected_occupancy_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected occupancy evidence not found' USING ERRCODE = '23503';
  END IF;

  v_scheduled_move_in_date := coalesce(
    p_scheduled_move_in_date,
    CASE WHEN v_old.scheduled_move_in_kind = 'known'
      THEN v_old.scheduled_move_in_date END
  );
  v_scheduled_move_out_date := coalesce(
    p_scheduled_move_out_date,
    CASE WHEN v_old.scheduled_move_out_kind = 'known'
      THEN v_old.scheduled_move_out_date END
  );

  IF v_old.evidence_state = 'superseded'
    AND v_old.superseded_by_lease_occupancy_id IS NOT NULL THEN
    SELECT occupancy.* INTO v_successor
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.id = v_old.superseded_by_lease_occupancy_id;

    IF v_successor.evidence_state = 'accepted'
      AND v_successor.actual_move_in_date = p_actual_move_in_date
      AND v_successor.actual_move_out_kind = 'open_current'
      AND v_successor.scheduled_move_in_date IS NOT DISTINCT FROM v_scheduled_move_in_date
      AND v_successor.scheduled_move_out_date IS NOT DISTINCT FROM v_scheduled_move_out_date
      AND v_successor.evidence_reason = v_reason THEN
      RETURN v_successor.id;
    END IF;

    RAISE EXCEPTION 'Occupancy evidence changed after this repair form was opened'
      USING ERRCODE = '40001', DETAIL = 'occupancy_repair_stale_evidence';
  END IF;

  IF v_old.evidence_state <> 'accepted' OR v_old.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Expected occupancy evidence is not accepted'
      USING ERRCODE = '40001', DETAIL = 'occupancy_repair_stale_evidence';
  END IF;
  IF v_old.property_id IS DISTINCT FROM v_lease.property_id
    OR v_old.unit_id IS DISTINCT FROM v_lease.unit_id THEN
    RAISE EXCEPTION 'Occupancy evidence no longer matches the Lease scope'
      USING ERRCODE = '40001', DETAIL = 'occupancy_repair_scope_changed';
  END IF;
  IF v_old.scheduled_move_in_kind = 'known'
    AND p_scheduled_move_in_date IS NOT NULL
    AND p_scheduled_move_in_date IS DISTINCT FROM v_old.scheduled_move_in_date THEN
    RAISE EXCEPTION 'Known scheduled move-in cannot be replaced by this repair'
      USING ERRCODE = '22023', DETAIL = 'occupancy_repair_known_fact_conflict';
  END IF;
  IF v_old.scheduled_move_out_kind = 'known'
    AND p_scheduled_move_out_date IS NOT NULL
    AND p_scheduled_move_out_date IS DISTINCT FROM v_old.scheduled_move_out_date THEN
    RAISE EXCEPTION 'Known scheduled move-out cannot be replaced by this repair'
      USING ERRCODE = '22023', DETAIL = 'occupancy_repair_known_fact_conflict';
  END IF;
  IF v_old.actual_move_in_kind = 'known'
    AND v_old.actual_move_in_date IS DISTINCT FROM p_actual_move_in_date THEN
    RAISE EXCEPTION 'Known actual move-in cannot be replaced by this repair'
      USING ERRCODE = '22023', DETAIL = 'occupancy_repair_known_fact_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lease_occupancy_participants AS participant
    WHERE participant.organization_id = p_organization_id
      AND participant.lease_occupancy_id = v_old.id
      AND participant.evidence_state = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Current resident evidence already exists'
      USING ERRCODE = '22023', DETAIL = 'occupancy_repair_participant_exists';
  END IF;

  SELECT party.* INTO v_primary_party
  FROM public.lease_parties AS party
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.is_primary
    AND party.party_role = 'primary_tenant'
    AND party.evidence_state = 'accepted'
    AND party.business_lifecycle = 'effective'
  ORDER BY party.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted primary Tenant relationship not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config(
    'app.lease_history_write_context',
    'checked-lease-occupancy-evidence-v1',
    true
  );

  UPDATE public.lease_occupancies
  SET evidence_state = 'superseded', updated_at = statement_timestamp(),
    updated_by = v_actor_id
  WHERE id = v_old.id AND organization_id = p_organization_id;

  INSERT INTO public.lease_occupancies(
    id, organization_id, lease_id, property_id, unit_id, status,
    scheduled_move_in_date, scheduled_move_out_date,
    actual_move_in_date, actual_move_out_date,
    evidence_state, business_lifecycle, record_source,
    scheduled_move_in_kind, scheduled_move_in_confidence,
    scheduled_move_out_kind, scheduled_move_out_confidence,
    actual_move_in_kind, actual_move_in_confidence,
    actual_move_out_kind, actual_move_out_confidence,
    supersedes_lease_occupancy_id, correction_reason,
    evidence_recorded_at, evidence_recorded_by, evidence_reason,
    created_by, updated_by
  ) VALUES (
    v_new_occupancy_id, p_organization_id, p_lease_id,
    v_lease.property_id, v_lease.unit_id,
    CASE WHEN v_lease.status = 'notice_given' THEN 'notice_given' ELSE 'occupied' END,
    v_scheduled_move_in_date, v_scheduled_move_out_date,
    p_actual_move_in_date, NULL,
    'accepted',
    CASE WHEN v_lease.status = 'notice_given' THEN 'notice_given' ELSE 'occupied' END,
    'operator_confirmed',
    CASE WHEN v_scheduled_move_in_date IS NULL THEN 'unknown' ELSE 'known' END,
    CASE WHEN v_scheduled_move_in_date IS NULL THEN 'unknown' ELSE 'confirmed' END,
    CASE WHEN v_scheduled_move_out_date IS NULL THEN 'unknown' ELSE 'known' END,
    CASE WHEN v_scheduled_move_out_date IS NULL THEN 'unknown' ELSE 'confirmed' END,
    'known', 'confirmed', 'open_current', 'confirmed',
    v_old.id, v_reason, statement_timestamp(), v_actor_id, v_reason,
    v_actor_id, v_actor_id
  );

  UPDATE public.lease_occupancies
  SET superseded_by_lease_occupancy_id = v_new_occupancy_id,
    updated_at = statement_timestamp(), updated_by = v_actor_id
  WHERE id = v_old.id AND organization_id = p_organization_id;

  INSERT INTO public.lease_occupancy_participants(
    id, organization_id, lease_occupancy_id, lease_party_id,
    started_on, ended_on, evidence_state, business_lifecycle, record_source,
    started_on_kind, started_on_confidence,
    ended_on_kind, ended_on_confidence,
    correction_reason, evidence_recorded_at, evidence_recorded_by,
    evidence_reason, created_by, updated_by
  ) VALUES (
    v_participant_id, p_organization_id, v_new_occupancy_id,
    v_primary_party.id, p_actual_move_in_date, NULL,
    'accepted', 'present', 'operator_confirmed',
    'known', 'confirmed', 'open_current', 'confirmed',
    v_reason, statement_timestamp(), v_actor_id, v_reason,
    v_actor_id, v_actor_id
  );

  PERFORM set_config('app.lease_history_write_context', 'off', true);
  RETURN v_new_occupancy_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_current_lease_occupancy_evidence(
  uuid, uuid, uuid, date, date, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_current_lease_occupancy_evidence(
  uuid, uuid, uuid, date, date, date, text
) TO authenticated;

COMMENT ON FUNCTION public.record_current_lease_occupancy_evidence(
  uuid, uuid, uuid, date, date, date, text
) IS 'Appends accepted current occupancy and contained primary-resident evidence while preserving explicit predecessor lineage; never derives occupancy from Lease term dates.';

ALTER FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  RENAME TO get_ips_setup_readiness_before_occupancy_repair;
ALTER FUNCTION public.get_ips_setup_readiness_before_occupancy_repair(
  uuid, uuid, uuid, uuid, date
) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION app_private.get_ips_setup_readiness_before_occupancy_repair(
  uuid, uuid, uuid, uuid, date
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ips_setup_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_effective_date date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_items jsonb;
BEGIN
  v_result := app_private.get_ips_setup_readiness_before_occupancy_repair(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_effective_date
  );

  SELECT coalesce(
    jsonb_agg(
      CASE WHEN item ->> 'code' = 'occupancy' THEN
        jsonb_set(
          item,
          '{repairHref}',
          to_jsonb(
            '/leases?leaseId=' || coalesce(p_lease_id::text, '') ||
            '#occupancy-evidence'
          )
        )
      ELSE item END
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM jsonb_array_elements(v_result -> 'items') AS item;

  RETURN jsonb_set(v_result, '{items}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  TO authenticated;

COMMENT ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date) IS
  'Returns compositional IPS readiness with an exact Lease occupancy evidence repair target.';
