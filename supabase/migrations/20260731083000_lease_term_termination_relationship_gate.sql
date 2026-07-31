-- TB-02 review remediation: existing-Lease termination stays fail-closed
-- until TB-03 owns the checked impact contract and relationship transitions.
-- Archive remains available only after exact accepted terminal evidence exists.

CREATE OR REPLACE FUNCTION
  app_private.assert_lease_archive_relationships_ready(
    p_organization_id uuid,
    p_lease_id uuid,
    p_lease_status text,
    p_primary_tenant_person_id uuid,
    p_property_id uuid,
    p_unit_id uuid
  )
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  -- The caller is updating or already holds the parent Lease row. Lock every
  -- current child row in deterministic order, then evaluate the same snapshot.
  PERFORM parties.id
  FROM public.lease_parties AS parties
  WHERE parties.organization_id = p_organization_id
    AND parties.lease_id = p_lease_id
    AND parties.archived_at IS NULL
  ORDER BY parties.id
  FOR UPDATE;

  PERFORM occupancies.id
  FROM public.lease_occupancies AS occupancies
  WHERE occupancies.organization_id = p_organization_id
    AND occupancies.lease_id = p_lease_id
    AND occupancies.archived_at IS NULL
  ORDER BY occupancies.id
  FOR UPDATE;

  PERFORM participants.id
  FROM public.lease_occupancy_participants AS participants
  JOIN public.lease_occupancies AS occupancies
    ON occupancies.organization_id = participants.organization_id
    AND occupancies.id = participants.lease_occupancy_id
  WHERE occupancies.organization_id = p_organization_id
    AND occupancies.lease_id = p_lease_id
    AND occupancies.archived_at IS NULL
  ORDER BY participants.id
  FOR UPDATE OF participants;

  IF v_expected_occupancy_lifecycle IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancies
      WHERE occupancies.organization_id = p_organization_id
        AND occupancies.lease_id = p_lease_id
        AND occupancies.archived_at IS NULL
        AND occupancies.evidence_state = 'accepted'
        AND occupancies.property_id = p_property_id
        AND occupancies.unit_id IS NOT DISTINCT FROM p_unit_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancies
      WHERE occupancies.organization_id = p_organization_id
        AND occupancies.lease_id = p_lease_id
        AND occupancies.archived_at IS NULL
        AND (
          occupancies.evidence_state = 'legacy_unresolved'
          OR (
            occupancies.evidence_state = 'accepted'
            AND occupancies.business_lifecycle
              <> v_expected_occupancy_lifecycle
          )
        )
    ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted occupancy before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lease_parties AS parties
    WHERE parties.organization_id = p_organization_id
      AND parties.lease_id = p_lease_id
      AND parties.archived_at IS NULL
      AND parties.evidence_state = 'accepted'
      AND parties.party_role = 'primary_tenant'
      AND parties.is_primary
      AND parties.person_id = p_primary_tenant_person_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_parties AS parties
    WHERE parties.organization_id = p_organization_id
      AND parties.lease_id = p_lease_id
      AND parties.archived_at IS NULL
      AND (
        parties.evidence_state = 'legacy_unresolved'
        OR (
          parties.evidence_state = 'accepted'
          AND parties.business_lifecycle <> v_expected_party_lifecycle
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participants
    JOIN public.lease_occupancies AS occupancies
      ON occupancies.organization_id = participants.organization_id
      AND occupancies.id = participants.lease_occupancy_id
    WHERE occupancies.organization_id = p_organization_id
      AND occupancies.lease_id = p_lease_id
      AND occupancies.archived_at IS NULL
      AND (
        participants.evidence_state = 'legacy_unresolved'
        OR (
          participants.evidence_state = 'accepted'
          AND participants.business_lifecycle
            <> v_expected_party_lifecycle
        )
      )
  ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted Lease relationship before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.assert_lease_archive_relationships_ready(
    uuid,
    uuid,
    text,
    uuid,
    uuid,
    uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_checked_archive boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.lease_archive_context', true),
      ''
    ) = 'checked-lease-archive-v1';
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.people_leases_skip_sync', true),
      ''
    ) = 'on';
  v_expected_occupancy_lifecycle text;
  v_expected_party_lifecycle text;
BEGIN
  IF v_trusted_fixture THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Lease history cannot be deleted'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_history_delete_forbidden';
  END IF;

  IF OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION
      'Lease restore requires checked relationship, occupancy, and dependency review'
      USING
        ERRCODE = '0A000',
        DETAIL = 'lease_restore_transition_required';
  END IF;

  IF OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NOT NULL
    AND (
      NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
    ) THEN
    RAISE EXCEPTION
      'Lease archive metadata is immutable after the first archive'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_archive_metadata_immutable';
  END IF;

  IF NEW.primary_tenant_person_id
    IS DISTINCT FROM OLD.primary_tenant_person_id THEN
    RAISE EXCEPTION
      'Changing the primary Tenant requires a checked relationship transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
    RAISE EXCEPTION
      'Changing Lease property or Unit requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Changing Lease lifecycle status requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF OLD.archived_at IS NULL
    AND NEW.archived_at IS NOT NULL THEN
    v_expected_occupancy_lifecycle := CASE
      WHEN OLD.status = 'cancelled' THEN 'cancelled_before_effective'
      WHEN OLD.status IN ('ended', 'terminated') THEN 'vacated'
    END;
    v_expected_party_lifecycle := CASE
      WHEN OLD.status = 'cancelled' THEN 'cancelled_before_effective'
      WHEN OLD.status IN ('ended', 'terminated') THEN 'ended'
    END;

    IF v_expected_occupancy_lifecycle IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.lease_occupancies AS occupancies
        WHERE occupancies.organization_id = OLD.organization_id
          AND occupancies.lease_id = OLD.id
          AND occupancies.archived_at IS NULL
          AND occupancies.evidence_state = 'accepted'
          AND occupancies.property_id = OLD.property_id
          AND occupancies.unit_id IS NOT DISTINCT FROM OLD.unit_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_occupancies AS occupancies
        WHERE occupancies.organization_id = OLD.organization_id
          AND occupancies.lease_id = OLD.id
          AND occupancies.archived_at IS NULL
          AND (
            occupancies.evidence_state = 'legacy_unresolved'
            OR (
              occupancies.evidence_state = 'accepted'
              AND occupancies.business_lifecycle
                <> v_expected_occupancy_lifecycle
            )
          )
      ) THEN
      RAISE EXCEPTION
        'End or cancel every accepted occupancy before archiving this Lease'
        USING
          ERRCODE = '55000',
          DETAIL = 'occupancy_transition_required';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      WHERE parties.organization_id = OLD.organization_id
        AND parties.lease_id = OLD.id
        AND parties.archived_at IS NULL
        AND parties.evidence_state = 'accepted'
        AND parties.party_role = 'primary_tenant'
        AND parties.is_primary
        AND parties.person_id = OLD.primary_tenant_person_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      WHERE parties.organization_id = OLD.organization_id
        AND parties.lease_id = OLD.id
        AND parties.archived_at IS NULL
        AND (
          parties.evidence_state = 'legacy_unresolved'
          OR (
            parties.evidence_state = 'accepted'
            AND parties.business_lifecycle <> v_expected_party_lifecycle
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancy_participants AS participants
      JOIN public.lease_occupancies AS occupancies
        ON occupancies.organization_id = participants.organization_id
        AND occupancies.id = participants.lease_occupancy_id
      WHERE occupancies.organization_id = OLD.organization_id
        AND occupancies.lease_id = OLD.id
        AND occupancies.archived_at IS NULL
        AND (
          participants.evidence_state = 'legacy_unresolved'
          OR (
            participants.evidence_state = 'accepted'
            AND participants.business_lifecycle
              <> v_expected_party_lifecycle
          )
        )
    ) THEN
      RAISE EXCEPTION
        'End or cancel every accepted Lease relationship before archiving this Lease'
        USING
          ERRCODE = '55000',
          DETAIL = 'relationship_transition_required';
    END IF;

    IF NOT v_checked_archive THEN
      RAISE EXCEPTION
        'Lease archive requires the checked archive operation'
        USING
          ERRCODE = '42501',
          DETAIL = 'lease_archive_checked_operation_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_lease_history_transition()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.archive_lease(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archive_context text :=
    current_setting('app.lease_archive_context', true);
  v_lease public.leases%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_lease.archived_at IS NOT NULL THEN
    RETURN v_lease.id;
  END IF;

  PERFORM app_private.assert_lease_archive_relationships_ready(
    v_lease.organization_id,
    v_lease.id,
    v_lease.status,
    v_lease.primary_tenant_person_id,
    v_lease.property_id,
    v_lease.unit_id
  );

  PERFORM set_config(
    'app.lease_archive_context',
    'checked-lease-archive-v1',
    true
  );

  UPDATE public.leases
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  PERFORM set_config(
    'app.lease_archive_context',
    coalesce(v_archive_context, 'off'),
    true
  );

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_lease(uuid, uuid)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.archive_lease(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.terminate_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_term_id uuid,
  p_effective_date date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Retain the Plan 04 public signature without consulting or mutating any
  -- target row until TB-03 supplies the checked transition contract.
  PERFORM p_lease_id, p_term_id, p_effective_date, p_idempotency_key;

  RAISE EXCEPTION
    'Lease termination requires the TB-03 checked impact and transition workflow'
    USING
      ERRCODE = '55000',
      DETAIL = 'relationship_transition_required';
END;
$$;

REVOKE ALL ON FUNCTION
  public.terminate_authoritative_lease_term(
    uuid,
    uuid,
    uuid,
    date,
    text
  )
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.terminate_authoritative_lease_term(
    uuid,
    uuid,
    uuid,
    date,
    text
  )
TO authenticated;
