CREATE TABLE public.lease_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  transition text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  expected_occupancy_id uuid NOT NULL,
  occupancy_id uuid NOT NULL,
  term_id uuid,
  effective_date date NOT NULL,
  scheduled_move_out_date date,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT lease_lifecycle_events_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT lease_lifecycle_events_occupancy_fk
    FOREIGN KEY (occupancy_id)
    REFERENCES public.lease_occupancies(id)
    ON DELETE RESTRICT,
  CONSTRAINT lease_lifecycle_events_expected_occupancy_fk
    FOREIGN KEY (expected_occupancy_id)
    REFERENCES public.lease_occupancies(id)
    ON DELETE RESTRICT,
  CONSTRAINT lease_lifecycle_events_term_fk
    FOREIGN KEY (term_id)
    REFERENCES public.lease_terms(id)
    ON DELETE RESTRICT,
  CONSTRAINT lease_lifecycle_events_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,
  CONSTRAINT lease_lifecycle_events_transition_check CHECK (
    transition IN ('activate', 'give_notice', 'end', 'terminate', 'cancel')
  ),
  CONSTRAINT lease_lifecycle_events_status_check CHECK (
    from_status IN (
      'draft', 'active', 'notice_given', 'ended', 'terminated', 'cancelled'
    )
    AND to_status IN (
      'draft', 'active', 'notice_given', 'ended', 'terminated', 'cancelled'
    )
  ),
  CONSTRAINT lease_lifecycle_events_reason_not_blank_check CHECK (
    length(trim(reason)) >= 8
  ),
  CONSTRAINT lease_lifecycle_events_idempotency_not_blank_check CHECK (
    length(trim(idempotency_key)) > 0
  ),
  CONSTRAINT lease_lifecycle_events_idempotency_key
    UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX lease_lifecycle_events_lease_created_idx
  ON public.lease_lifecycle_events(organization_id, lease_id, created_at DESC);

ALTER TABLE public.lease_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read Lease lifecycle events"
ON public.lease_lifecycle_events
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.lease_lifecycle_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lease_lifecycle_events TO authenticated;
GRANT ALL ON TABLE public.lease_lifecycle_events TO service_role;

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
      OR (
        TG_OP IN ('INSERT', 'UPDATE')
        AND v_context = 'checked-lease-lifecycle-v1'
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

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_checked_archive boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('app.lease_archive_context', true), '') =
      'checked-lease-archive-v1';
  v_checked_lifecycle boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('app.lease_lifecycle_write_context', true), '') =
      'checked-lease-lifecycle-v1';
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

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lease history cannot be deleted'
      USING ERRCODE = '42501', DETAIL = 'lease_history_delete_forbidden';
  END IF;

  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION
      'Lease restore requires relationship, occupancy, and dependency review'
      USING ERRCODE = '0A000', DETAIL = 'lease_restore_transition_required';
  END IF;

  IF OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NOT NULL
    AND (
      NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
    ) THEN
    RAISE EXCEPTION
      'Lease archive metadata is immutable after the first archive'
      USING ERRCODE = '55000', DETAIL = 'lease_archive_metadata_immutable';
  END IF;

  IF NEW.primary_tenant_person_id IS DISTINCT FROM OLD.primary_tenant_person_id THEN
    RAISE EXCEPTION
      'Changing the primary Tenant requires a relationship transition'
      USING ERRCODE = '55000', DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
    RAISE EXCEPTION
      'Changing Lease property or Unit requires an occupancy transition'
      USING ERRCODE = '55000', DETAIL = 'occupancy_transition_required';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_checked_lifecycle THEN
    RAISE EXCEPTION
      'Changing Lease lifecycle status requires an occupancy transition'
      USING ERRCODE = '55000', DETAIL = 'occupancy_transition_required';
  END IF;

  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    IF NOT v_checked_archive THEN
      RAISE EXCEPTION 'Lease archive requires the checked archive operation'
        USING
          ERRCODE = '42501',
          DETAIL = 'lease_archive_checked_operation_required';
    END IF;

    PERFORM app_private.assert_lease_archive_relationships_ready(
      OLD.organization_id,
      OLD.id,
      OLD.status,
      OLD.primary_tenant_person_id,
      OLD.property_id,
      OLD.unit_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_lease_history_transition() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.assert_lease_archive_relationships_ready(
  p_organization_id uuid,
  p_lease_id uuid,
  p_lease_status text,
  p_primary_tenant_person_id uuid,
  p_property_id uuid,
  p_unit_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_expected_occupancy_lifecycle text := CASE
    WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN p_lease_status IN ('ended', 'terminated') THEN 'vacated'
  END;
  v_expected_party_lifecycle text := CASE
    WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN p_lease_status IN ('ended', 'terminated') THEN 'ended'
  END;
BEGIN
  PERFORM party.id
  FROM public.lease_parties AS party
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
  ORDER BY party.id
  FOR UPDATE;

  PERFORM occupancy.id
  FROM public.lease_occupancies AS occupancy
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.archived_at IS NULL
  ORDER BY occupancy.id
  FOR UPDATE;

  PERFORM participant.id
  FROM public.lease_occupancy_participants AS participant
  JOIN public.lease_occupancies AS occupancy
    ON occupancy.organization_id = participant.organization_id
    AND occupancy.id = participant.lease_occupancy_id
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.archived_at IS NULL
  ORDER BY participant.id
  FOR UPDATE OF participant;

  IF v_expected_occupancy_lifecycle IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = p_organization_id
        AND occupancy.lease_id = p_lease_id
        AND occupancy.archived_at IS NULL
        AND occupancy.evidence_state = 'accepted'
        AND occupancy.business_lifecycle = v_expected_occupancy_lifecycle
        AND occupancy.property_id = p_property_id
        AND occupancy.unit_id IS NOT DISTINCT FROM p_unit_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = p_organization_id
        AND occupancy.lease_id = p_lease_id
        AND occupancy.archived_at IS NULL
        AND occupancy.evidence_state = 'accepted'
        AND occupancy.business_lifecycle <> v_expected_occupancy_lifecycle
    ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted occupancy before archiving this Lease'
      USING ERRCODE = '55000', DETAIL = 'occupancy_transition_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lease_parties AS party
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND party.evidence_state = 'accepted'
      AND party.business_lifecycle = v_expected_party_lifecycle
      AND party.party_role = 'primary_tenant'
      AND party.is_primary
      AND party.person_id = p_primary_tenant_person_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_parties AS party
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND party.evidence_state = 'accepted'
      AND party.business_lifecycle <> v_expected_party_lifecycle
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participant
    JOIN public.lease_occupancies AS occupancy
      ON occupancy.organization_id = participant.organization_id
      AND occupancy.id = participant.lease_occupancy_id
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.lease_id = p_lease_id
      AND occupancy.archived_at IS NULL
      AND participant.evidence_state = 'accepted'
      AND participant.business_lifecycle <> v_expected_party_lifecycle
  ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted Lease relationship before archiving this Lease'
      USING ERRCODE = '55000', DETAIL = 'relationship_transition_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_lease_archive_relationships_ready(
  uuid, uuid, text, uuid, uuid, uuid
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.transition_lease_lifecycle(
  p_organization_id uuid,
  p_lease_id uuid,
  p_expected_status text,
  p_expected_occupancy_id uuid,
  p_transition text,
  p_effective_date date,
  p_scheduled_move_out_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

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
      OR v_event.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Conflicting Lease lifecycle idempotency request'
        USING ERRCODE = '22023', DETAIL = 'lease_lifecycle_idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'eventId', v_event.id,
      'leaseId', v_event.lease_id,
      'occupancyId', v_event.occupancy_id,
      'termId', v_event.term_id,
      'status', v_event.to_status
    );
  END IF;

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
      OR (v_transition = 'end' AND v_expected_status IN ('active', 'notice_given'))
      OR (v_transition = 'terminate' AND v_expected_status IN ('active', 'notice_given'))
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
  ELSE
    v_term_id := v_current_term.id;
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
      ELSE v_old_occupancy.actual_move_in_date
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
      ELSE v_old_occupancy.actual_move_in_kind
    END,
    CASE
      WHEN v_transition = 'activate' THEN 'confirmed'
      WHEN v_transition = 'cancel' THEN 'unknown'
      ELSE v_old_occupancy.actual_move_in_confidence
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
          ELSE v_party.started_on
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
          ELSE v_party.started_on_kind
        END,
        CASE
          WHEN v_transition = 'activate' THEN 'confirmed'
          WHEN v_transition = 'cancel' THEN 'unknown'
          ELSE v_party.started_on_confidence
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
        ELSE v_participant.started_on
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
        ELSE v_participant.started_on_kind
      END,
      CASE
        WHEN v_transition = 'activate' THEN 'confirmed'
        ELSE v_participant.started_on_confidence
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
    'lease_lifecycle_' || v_transition,
    jsonb_build_object(
      'status', v_expected_status,
      'occupancyId', p_expected_occupancy_id
    ),
    jsonb_build_object(
      'status', v_new_status,
      'occupancyId', v_new_occupancy_id,
      'effectiveDate', p_effective_date,
      'scheduledMoveOutDate', p_scheduled_move_out_date,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'eventId', v_event.id,
    'leaseId', p_lease_id,
    'occupancyId', v_new_occupancy_id,
    'termId', v_term_id,
    'status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) TO authenticated;

COMMENT ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) IS 'Atomically advances Lease, occupancy, resident, party, and authoritative term lifecycle state while preserving append-only predecessor lineage.';
