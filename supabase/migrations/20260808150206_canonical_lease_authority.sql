-- Pre-release cleanup: every retained lease record is canonical. There is no
-- unresolved compatibility state to preserve because the product has no users.
SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-bootstrap-v1',
  true
);

UPDATE public.lease_parties
SET evidence_state = 'accepted',
    record_source = 'system_transition',
    started_on_kind = CASE
      WHEN started_on IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    started_on_confidence = CASE
      WHEN started_on IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    ended_on_kind = CASE
      WHEN ended_on IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    ended_on_confidence = CASE
      WHEN ended_on IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    evidence_reason = 'pre_release_normalization'
WHERE evidence_state = 'legacy_unresolved'
   OR record_source = 'legacy_inferred';

UPDATE public.lease_occupancies
SET evidence_state = 'accepted',
    record_source = 'system_transition',
    scheduled_move_in_kind = CASE
      WHEN scheduled_move_in_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    scheduled_move_in_confidence = CASE
      WHEN scheduled_move_in_date IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    scheduled_move_out_kind = CASE
      WHEN scheduled_move_out_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    scheduled_move_out_confidence = CASE
      WHEN scheduled_move_out_date IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    actual_move_in_kind = CASE
      WHEN actual_move_in_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    actual_move_in_confidence = CASE
      WHEN actual_move_in_date IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    actual_move_out_kind = CASE
      WHEN actual_move_out_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    actual_move_out_confidence = CASE
      WHEN actual_move_out_date IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    notice_kind = CASE
      WHEN notice_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    notice_confidence = CASE
      WHEN notice_date IS NULL THEN 'unknown'
      ELSE 'inferred'
    END,
    evidence_reason = 'pre_release_normalization'
WHERE evidence_state = 'legacy_unresolved'
   OR record_source = 'legacy_inferred';

UPDATE public.lease_occupancy_participants
SET evidence_state = 'accepted',
    record_source = 'system_transition',
    evidence_reason = 'pre_release_normalization'
WHERE evidence_state = 'legacy_unresolved'
   OR record_source = 'legacy_inferred';

SELECT set_config('app.lease_history_write_context', 'off', true);

ALTER TABLE public.lease_terms
  ALTER COLUMN authority_kind SET DEFAULT 'authoritative',
  DROP CONSTRAINT lease_terms_authority_kind_check,
  DROP CONSTRAINT lease_terms_authoritative_confirmation_check,
  ADD CONSTRAINT lease_terms_authority_kind_check
    CHECK (authority_kind = 'authoritative'),
  ADD CONSTRAINT lease_terms_authoritative_confirmation_check
    CHECK (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL);

ALTER TABLE public.lease_parties
  ALTER COLUMN evidence_state SET DEFAULT 'accepted',
  ALTER COLUMN record_source SET DEFAULT 'system_transition',
  ALTER COLUMN evidence_reason SET DEFAULT 'lease_recorded',
  DROP CONSTRAINT lease_parties_evidence_state_check,
  DROP CONSTRAINT lease_parties_record_source_check,
  DROP CONSTRAINT lease_parties_started_boundary_check,
  DROP CONSTRAINT lease_parties_ended_boundary_check,
  ADD CONSTRAINT lease_parties_evidence_state_check
    CHECK (evidence_state IN ('accepted', 'superseded', 'voided')),
  ADD CONSTRAINT lease_parties_record_source_check
    CHECK (record_source IN (
      'operator_confirmed', 'imported_explicit', 'system_transition'
    )),
  ADD CONSTRAINT lease_parties_started_boundary_check
    CHECK (
      (started_on_kind = 'known' AND started_on IS NOT NULL)
      OR (started_on_kind = 'unknown' AND started_on IS NULL)
    ),
  ADD CONSTRAINT lease_parties_ended_boundary_check
    CHECK (
      (ended_on_kind = 'known' AND ended_on IS NOT NULL)
      OR (ended_on_kind IN ('open_current', 'unknown') AND ended_on IS NULL)
    );

ALTER TABLE public.lease_occupancies
  ALTER COLUMN evidence_state SET DEFAULT 'accepted',
  ALTER COLUMN record_source SET DEFAULT 'system_transition',
  ALTER COLUMN evidence_reason SET DEFAULT 'lease_recorded',
  DROP CONSTRAINT lease_occupancies_evidence_state_check,
  DROP CONSTRAINT lease_occupancies_record_source_check,
  DROP CONSTRAINT lease_occupancies_scheduled_in_boundary_check,
  DROP CONSTRAINT lease_occupancies_scheduled_out_boundary_check,
  DROP CONSTRAINT lease_occupancies_actual_in_boundary_check,
  DROP CONSTRAINT lease_occupancies_actual_out_boundary_check,
  DROP CONSTRAINT lease_occupancies_notice_boundary_check,
  ADD CONSTRAINT lease_occupancies_evidence_state_check
    CHECK (evidence_state IN ('accepted', 'superseded', 'voided')),
  ADD CONSTRAINT lease_occupancies_record_source_check
    CHECK (record_source IN (
      'operator_confirmed', 'imported_explicit', 'system_transition'
    )),
  ADD CONSTRAINT lease_occupancies_scheduled_in_boundary_check
    CHECK (
      (scheduled_move_in_kind = 'known' AND scheduled_move_in_date IS NOT NULL)
      OR (scheduled_move_in_kind = 'unknown' AND scheduled_move_in_date IS NULL)
    ),
  ADD CONSTRAINT lease_occupancies_scheduled_out_boundary_check
    CHECK (
      (scheduled_move_out_kind = 'known' AND scheduled_move_out_date IS NOT NULL)
      OR (
        scheduled_move_out_kind IN ('open_current', 'unknown')
        AND scheduled_move_out_date IS NULL
      )
    ),
  ADD CONSTRAINT lease_occupancies_actual_in_boundary_check
    CHECK (
      (actual_move_in_kind = 'known' AND actual_move_in_date IS NOT NULL)
      OR (actual_move_in_kind = 'unknown' AND actual_move_in_date IS NULL)
    ),
  ADD CONSTRAINT lease_occupancies_actual_out_boundary_check
    CHECK (
      (actual_move_out_kind = 'known' AND actual_move_out_date IS NOT NULL)
      OR (
        actual_move_out_kind IN ('open_current', 'unknown')
        AND actual_move_out_date IS NULL
      )
    ),
  ADD CONSTRAINT lease_occupancies_notice_boundary_check
    CHECK (
      (notice_kind = 'known' AND notice_date IS NOT NULL)
      OR (notice_kind = 'unknown' AND notice_date IS NULL)
    );

ALTER TABLE public.lease_occupancy_participants
  DROP CONSTRAINT lease_participants_evidence_state_check,
  DROP CONSTRAINT lease_participants_record_source_check,
  ADD CONSTRAINT lease_participants_evidence_state_check
    CHECK (evidence_state IN ('accepted', 'superseded', 'voided')),
  ADD CONSTRAINT lease_participants_record_source_check
    CHECK (record_source IN (
      'operator_confirmed', 'imported_explicit', 'system_transition'
    ));

DROP INDEX public.lease_parties_one_unbounded_primary_tenant_idx;
CREATE UNIQUE INDEX lease_parties_one_unbounded_primary_tenant_idx
ON public.lease_parties (organization_id, lease_id)
WHERE evidence_state = 'accepted'
  AND business_lifecycle IN ('planned', 'effective')
  AND party_role = 'primary_tenant'
  AND is_primary
  AND archived_at IS NULL
  AND ended_on IS NULL;

DROP INDEX public.lease_parties_one_unbounded_person_role_idx;
CREATE UNIQUE INDEX lease_parties_one_unbounded_person_role_idx
ON public.lease_parties (organization_id, lease_id, person_id, party_role)
WHERE evidence_state = 'accepted'
  AND business_lifecycle IN ('planned', 'effective')
  AND archived_at IS NULL
  AND ended_on IS NULL;

DROP INDEX public.lease_occupancies_one_unbounded_active_unit_idx;
CREATE UNIQUE INDEX lease_occupancies_one_unbounded_active_unit_idx
ON public.lease_occupancies (organization_id, unit_id)
WHERE unit_id IS NOT NULL
  AND archived_at IS NULL
  AND evidence_state = 'accepted'
  AND business_lifecycle IN ('reserved', 'occupied', 'notice_given')
  AND (
    protected_occupancy_range IS NULL
    OR upper_inf(protected_occupancy_range)
  );

DROP TRIGGER classify_legacy_lease_party ON public.lease_parties;
DROP TRIGGER classify_legacy_lease_occupancy ON public.lease_occupancies;
DROP FUNCTION app_private.classify_legacy_lease_party();
DROP FUNCTION app_private.classify_legacy_lease_occupancy();

DROP FUNCTION public.get_leases_with_effective_rent(uuid, date);
DROP VIEW public.current_leases;
DROP TRIGGER ensure_leases_primary_tenant ON public.leases;
DROP FUNCTION public.ensure_lease_primary_tenant();

ALTER TABLE public.leases
  DROP COLUMN tenant_name,
  ALTER COLUMN primary_tenant_person_id SET NOT NULL;

CREATE VIEW public.current_leases
WITH (security_invoker = true)
AS
SELECT
  lease.id,
  lease.organization_id,
  lease.property_id,
  lease.unit_id,
  person.display_name AS tenant_name,
  lease.primary_tenant_person_id,
  term.start_date AS lease_start_date,
  term.end_date AS lease_end_date,
  term.rent_amount AS monthly_rent_amount,
  term.rent_currency AS monthly_rent_currency,
  lease.deposit_amount,
  lease.deposit_currency,
  lease.status,
  lease.created_at,
  lease.created_by,
  lease.updated_at,
  lease.updated_by,
  lease.archived_at,
  lease.archived_by,
  term.id AS lease_term_id
FROM public.leases AS lease
JOIN public.people AS person
  ON person.organization_id = lease.organization_id
  AND person.id = lease.primary_tenant_person_id
JOIN LATERAL (
  SELECT candidate.*
  FROM public.lease_terms AS candidate
  WHERE candidate.organization_id = lease.organization_id
    AND candidate.lease_id = lease.id
    AND candidate.authority_kind = 'authoritative'
    AND candidate.status <> 'superseded'
    AND candidate.archived_at IS NULL
  ORDER BY
    CASE
      WHEN current_date BETWEEN candidate.start_date AND candidate.end_date
        THEN 0
      ELSE 1
    END,
    candidate.start_date DESC,
    candidate.term_sequence DESC
  LIMIT 1
) AS term ON true;

REVOKE ALL ON public.current_leases FROM PUBLIC, anon;
GRANT SELECT ON public.current_leases TO authenticated;

CREATE FUNCTION public.get_leases_with_effective_rent(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  unit_id uuid,
  tenant_name text,
  primary_tenant_person_id uuid,
  lease_start_date date,
  lease_end_date date,
  monthly_rent_amount numeric,
  monthly_rent_currency public.currency_code,
  deposit_amount numeric,
  deposit_currency public.currency_code,
  status text,
  archived_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    lease.id,
    lease.property_id,
    lease.unit_id,
    person.display_name,
    lease.primary_tenant_person_id,
    term.start_date,
    term.end_date,
    term.rent_amount,
    term.rent_currency,
    lease.deposit_amount,
    lease.deposit_currency,
    lease.status,
    lease.archived_at
  FROM public.leases AS lease
  JOIN public.people AS person
    ON person.organization_id = lease.organization_id
    AND person.id = lease.primary_tenant_person_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM public.lease_terms AS candidate
    WHERE candidate.organization_id = lease.organization_id
      AND candidate.lease_id = lease.id
      AND candidate.authority_kind = 'authoritative'
      AND candidate.status <> 'superseded'
      AND candidate.archived_at IS NULL
    ORDER BY
      CASE
        WHEN p_effective_date BETWEEN candidate.start_date AND candidate.end_date
          THEN 0
        ELSE 1
      END,
      candidate.start_date DESC,
      candidate.term_sequence DESC
    LIMIT 1
  ) AS term ON true
  WHERE lease.organization_id = p_organization_id;
$$;

REVOKE ALL ON FUNCTION public.get_leases_with_effective_rent(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leases_with_effective_rent(uuid, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  resolution_status text,
  blocker_code text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  term_id uuid,
  term_sequence integer,
  effective_range daterange,
  start_date date,
  end_date date,
  rent_amount numeric,
  rent_currency public.currency_code,
  rent_due_day integer,
  payment_frequency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT candidate.*
  INTO v_lease
  FROM public.leases AS candidate
  WHERE candidate.id = p_lease_id
    AND candidate.organization_id = p_organization_id
    AND candidate.archived_at IS NULL;

  IF NOT FOUND OR v_lease.unit_id IS NULL THEN
    RETURN QUERY SELECT
      'blocked', 'scope_mismatch', p_organization_id, NULL::uuid, NULL::uuid,
      p_lease_id, NULL::uuid, NULL::integer, NULL::daterange, NULL::date,
      NULL::date, NULL::numeric, NULL::public.currency_code, NULL::integer,
      NULL::text;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status NOT IN ('draft', 'superseded')
    AND terms.archived_at IS NULL
    AND p_effective_date <@ terms.effective_range;

  IF v_count <> 1 THEN
    RETURN QUERY SELECT
      'blocked',
      CASE WHEN v_count > 1 THEN 'term_conflict' ELSE 'no_authoritative_term' END,
      v_lease.organization_id, v_lease.property_id, v_lease.unit_id,
      v_lease.id, NULL::uuid, NULL::integer, NULL::daterange, NULL::date,
      NULL::date, NULL::numeric, NULL::public.currency_code, NULL::integer,
      NULL::text;
    RETURN;
  END IF;

  SELECT terms.*
  INTO STRICT v_term
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status NOT IN ('draft', 'superseded')
    AND terms.archived_at IS NULL
    AND p_effective_date <@ terms.effective_range;

  RETURN QUERY SELECT
    'resolved', NULL::text, v_lease.organization_id, v_lease.property_id,
    v_lease.unit_id, v_lease.id, v_term.id, v_term.term_sequence,
    v_term.effective_range, v_term.start_date, v_term.end_date,
    v_term.rent_amount, v_term.rent_currency, v_term.rent_due_day,
    v_term.payment_frequency;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_lease_rent_readiness(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  readiness_status text,
  reason_code text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  term_id uuid,
  policy_id uuid,
  policy_version integer,
  effective_date date,
  rent_amount numeric,
  rent_currency public.currency_code,
  rent_due_day integer,
  payment_frequency text,
  repair_context jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_term record;
  v_policy public.rent_policy_versions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_term
  FROM public.resolve_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_effective_date
  );

  IF v_term.resolution_status <> 'resolved' THEN
    RETURN QUERY SELECT
      CASE WHEN v_term.blocker_code = 'term_conflict'
        THEN 'term_conflict' ELSE 'blocked' END,
      v_term.blocker_code,
      v_term.organization_id,
      v_term.property_id,
      v_term.unit_id,
      v_term.lease_id,
      v_term.term_id,
      NULL::uuid,
      NULL::integer,
      p_effective_date,
      v_term.rent_amount,
      v_term.rent_currency,
      v_term.rent_due_day,
      v_term.payment_frequency,
      jsonb_build_object('repair', 'repair_lease_term_authority');
    RETURN;
  END IF;

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id
    AND policy.lifecycle = 'approved'
    AND policy.effective_from <= p_effective_date
  ORDER BY policy.effective_from DESC, policy.version_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.rent_policy_versions AS policy
      WHERE policy.organization_id = p_organization_id
        AND policy.lifecycle = 'draft'
        AND policy.effective_from <= p_effective_date
    ) THEN
      RETURN QUERY SELECT
        'policy_unapproved', 'policy_unapproved', v_term.organization_id,
        v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
        NULL::uuid, NULL::integer, p_effective_date, v_term.rent_amount,
        v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object('repair', 'complete_and_approve_rent_policy');
    ELSE
      RETURN QUERY SELECT
        'blocked', 'policy_not_effective', v_term.organization_id,
        v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
        NULL::uuid, NULL::integer, p_effective_date, v_term.rent_amount,
        v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object('repair', 'create_effective_rent_policy');
    END IF;
    RETURN;
  END IF;

  IF NOT (v_term.payment_frequency = ANY(v_policy.supported_frequencies)) THEN
    RETURN QUERY SELECT
      'unsupported_frequency', 'unsupported_frequency',
      v_term.organization_id, v_term.property_id, v_term.unit_id,
      v_term.lease_id, v_term.term_id, v_policy.id,
      v_policy.version_number, p_effective_date, v_term.rent_amount,
      v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
      jsonb_build_object(
        'repair', 'approve_frequency_or_replace_term',
        'supportedFrequencies', v_policy.supported_frequencies
      );
    RETURN;
  END IF;

  IF v_policy.due_day_source = 'term' AND v_term.rent_due_day IS NULL THEN
    RETURN QUERY SELECT
      'missing_due_day', 'missing_due_day', v_term.organization_id,
      v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
      v_policy.id, v_policy.version_number, p_effective_date,
      v_term.rent_amount, v_term.rent_currency, v_term.rent_due_day,
      v_term.payment_frequency,
      jsonb_build_object('repair', 'replace_term_with_explicit_due_day');
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'ready', 'ready', v_term.organization_id, v_term.property_id,
    v_term.unit_id, v_term.lease_id, v_term.term_id, v_policy.id,
    v_policy.version_number, p_effective_date, v_term.rent_amount,
    v_term.rent_currency,
    CASE
      WHEN v_policy.due_day_source = 'term' THEN v_term.rent_due_day
      ELSE v_policy.policy_default_due_day
    END,
    v_term.payment_frequency,
    jsonb_build_object(
      'termId', v_term.term_id,
      'policyId', v_policy.id,
      'policyVersion', v_policy.version_number
    );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.create_lease_record_internal(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_history_context text :=
    current_setting('app.lease_history_write_context', true);
  v_lease_id uuid;
  v_occupancy_lifecycle text;
  v_occupancy_status text;
  v_party_lifecycle text;
BEGIN
  PERFORM 1
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND person.id = p_primary_tenant_person_id
    AND person.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = '23503';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_currency IS NULL THEN
    RAISE EXCEPTION 'Deposit currency is required when a deposit is recorded'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.leases (
    organization_id,
    property_id,
    unit_id,
    primary_tenant_person_id,
    deposit_amount,
    deposit_currency,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_deposit_amount,
    p_deposit_currency,
    lower(trim(p_status)),
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_lease_id;

  v_party_lifecycle := CASE lower(trim(p_status))
    WHEN 'draft' THEN 'planned'
    WHEN 'cancelled' THEN 'cancelled_before_effective'
    WHEN 'ended' THEN 'ended'
    WHEN 'terminated' THEN 'ended'
    ELSE 'effective'
  END;
  v_occupancy_lifecycle := CASE lower(trim(p_status))
    WHEN 'draft' THEN 'reserved'
    WHEN 'notice_given' THEN 'notice_given'
    WHEN 'cancelled' THEN 'cancelled_before_effective'
    WHEN 'ended' THEN 'vacated'
    WHEN 'terminated' THEN 'vacated'
    ELSE 'occupied'
  END;
  v_occupancy_status := CASE v_occupancy_lifecycle
    WHEN 'cancelled_before_effective' THEN 'cancelled'
    ELSE v_occupancy_lifecycle
  END;

  PERFORM set_config(
    'app.lease_history_write_context',
    'checked-lease-create-v2',
    true
  );

  INSERT INTO public.lease_parties (
    organization_id,
    lease_id,
    person_id,
    party_role,
    is_primary,
    evidence_state,
    business_lifecycle,
    record_source,
    started_on_kind,
    started_on_confidence,
    ended_on_kind,
    ended_on_confidence,
    evidence_recorded_at,
    evidence_recorded_by,
    evidence_reason,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    v_lease_id,
    p_primary_tenant_person_id,
    'primary_tenant',
    true,
    'accepted',
    v_party_lifecycle,
    'system_transition',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    now(),
    v_actor_id,
    'lease_created',
    v_actor_id,
    v_actor_id
  );

  INSERT INTO public.lease_occupancies (
    organization_id,
    lease_id,
    property_id,
    unit_id,
    status,
    evidence_state,
    business_lifecycle,
    record_source,
    scheduled_move_in_kind,
    scheduled_move_in_confidence,
    scheduled_move_out_kind,
    scheduled_move_out_confidence,
    actual_move_in_kind,
    actual_move_in_confidence,
    actual_move_out_kind,
    actual_move_out_confidence,
    notice_kind,
    notice_confidence,
    evidence_recorded_at,
    evidence_recorded_by,
    evidence_reason,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    v_lease_id,
    p_property_id,
    p_unit_id,
    v_occupancy_status,
    'accepted',
    v_occupancy_lifecycle,
    'system_transition',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    'unknown',
    now(),
    v_actor_id,
    'lease_created',
    v_actor_id,
    v_actor_id
  );

  PERFORM set_config(
    'app.lease_history_write_context',
    coalesce(v_history_context, 'off'),
    true
  );

  IF p_deposit_amount IS NOT NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      v_lease_id,
      'security',
      p_deposit_amount,
      p_deposit_currency,
      'held',
      v_actor_id,
      v_actor_id
    );
  END IF;

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
    'lease',
    v_lease_id,
    'lease_created',
    jsonb_build_object(
      'primaryTenantPersonId', p_primary_tenant_person_id,
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'status', lower(trim(p_status))
    )
  );

  RETURN v_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.update_lease_record_internal(
  p_lease_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_deposit_id uuid;
  v_existing public.leases%ROWTYPE;
BEGIN
  SELECT lease.*
  INTO v_existing
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF (v_existing.property_id, v_existing.unit_id,
      v_existing.primary_tenant_person_id)
    IS DISTINCT FROM
      (p_property_id, p_unit_id, p_primary_tenant_person_id) THEN
    RAISE EXCEPTION
      'Property, Unit, and primary Tenant require an explicit transition workflow'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_relationship_transition_required';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_currency IS NULL THEN
    RAISE EXCEPTION 'Deposit currency is required when a deposit is recorded'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.leases
  SET deposit_amount = p_deposit_amount,
      deposit_currency = p_deposit_currency,
      status = lower(trim(p_status)),
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_lease_id;

  SELECT deposit.id
  INTO v_deposit_id
  FROM public.lease_deposits AS deposit
  WHERE deposit.organization_id = p_organization_id
    AND deposit.lease_id = p_lease_id
    AND deposit.deposit_type = 'security'
    AND deposit.archived_at IS NULL
  ORDER BY deposit.created_at, deposit.id
  LIMIT 1
  FOR UPDATE;

  IF p_deposit_amount IS NULL THEN
    IF v_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET archived_at = now(),
          archived_by = v_actor_id,
          updated_by = v_actor_id
      WHERE organization_id = p_organization_id
        AND id = v_deposit_id;
    END IF;
  ELSIF v_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      p_lease_id,
      'security',
      p_deposit_amount,
      p_deposit_currency,
      'held',
      v_actor_id,
      v_actor_id
    );
  ELSE
    UPDATE public.lease_deposits
    SET amount = p_deposit_amount,
        currency = p_deposit_currency,
        updated_by = v_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_deposit_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'lease',
    p_lease_id,
    'lease_updated',
    jsonb_build_object(
      'depositAmount', v_existing.deposit_amount,
      'depositCurrency', v_existing.deposit_currency,
      'status', v_existing.status
    ),
    jsonb_build_object(
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'status', lower(trim(p_status))
    )
  );

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_lease_record_internal(
  uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.update_lease_record_internal(
  uuid, uuid, uuid, uuid, uuid, numeric, public.currency_code, text
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.create_lease_with_authoritative_term(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, integer,
  text, text, numeric, public.currency_code, text, text
);
