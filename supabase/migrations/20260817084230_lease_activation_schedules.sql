CREATE TABLE public.lease_activation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  lease_id uuid NOT NULL,
  expected_occupancy_id uuid NOT NULL,
  activation_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'cancelled', 'failed')),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  processed_at timestamptz,
  cancelled_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_activation_schedules_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lease_activation_schedules_occupancy_fkey
    FOREIGN KEY (organization_id, expected_occupancy_id)
    REFERENCES public.lease_occupancies(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lease_activation_schedules_idempotency_unique
    UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX lease_activation_schedules_one_pending_per_lease
  ON public.lease_activation_schedules(organization_id, lease_id)
  WHERE status = 'pending';

CREATE INDEX lease_activation_schedules_due_idx
  ON public.lease_activation_schedules(organization_id, activation_date, created_at)
  WHERE status = 'pending';

ALTER TABLE public.lease_activation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read Lease activation schedules"
  ON public.lease_activation_schedules
  FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id));

GRANT SELECT ON public.lease_activation_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.lease_activation_schedules TO service_role;

CREATE TRIGGER set_lease_activation_schedules_updated_at
  BEFORE UPDATE ON public.lease_activation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.create_authoritative_property_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_status text,
  p_supersedes_term_id uuid,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim record;
  v_frequency text := lower(btrim(coalesce(p_payment_frequency, '')));
  v_lease public.leases%ROWTYPE;
  v_payload jsonb;
  v_previous public.lease_terms%ROWTYPE;
  v_sequence integer;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
    OR p_rent_amount IS NULL OR p_rent_amount < 0
    OR p_rent_due_day IS NULL OR p_rent_due_day NOT BETWEEN 1 AND 31
    OR v_frequency NOT IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_time')
    OR v_status NOT IN ('draft', 'upcoming', 'active', 'expired', 'terminated') THEN
    RAISE EXCEPTION 'Authoritative lease term inputs are incomplete or invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_rent_currency::text <> 'USD' THEN
    RAISE EXCEPTION 'Only USD lease terms are currently supported' USING ERRCODE = '0A000';
  END IF;
  IF v_status = 'active' AND current_date NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'upcoming' AND p_start_date <= current_date THEN
    RAISE EXCEPTION 'An upcoming term must start in the future' USING ERRCODE = '22023';
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  JOIN public.properties AS property
    ON property.organization_id = lease.organization_id
   AND property.id = lease.property_id
   AND property.archived_at IS NULL
   AND property.rental_structure = 'single_space'
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.unit_id IS NULL
    AND lease.archived_at IS NULL
  FOR UPDATE OF lease;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Whole-Property Lease scope is not supported or no longer exists'
      USING ERRCODE = '23503';
  END IF;
  IF v_lease.status IN ('ended', 'terminated', 'cancelled')
    AND v_status IN ('active', 'upcoming') THEN
    RAISE EXCEPTION 'An inactive lease cannot retain an active or upcoming authoritative term'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.lock_open_lease_term_periods(
    p_organization_id, v_lease.property_id, p_rent_currency, p_start_date, p_end_date
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'lease_term_v1', p_organization_id, p_lease_id), 0
    )
  );

  v_payload := jsonb_build_object(
    'leaseId', p_lease_id, 'startDate', p_start_date, 'endDate', p_end_date,
    'rentAmount', p_rent_amount, 'rentCurrency', p_rent_currency,
    'rentDueDay', p_rent_due_day, 'paymentFrequency', v_frequency,
    'status', v_status, 'supersedesTermId', p_supersedes_term_id
  );
  SELECT * INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'create_authoritative_lease_term',
    p_idempotency_key, v_actor_id, v_payload
  );
  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'termId')::uuid;
  END IF;

  IF p_supersedes_term_id IS NOT NULL THEN
    SELECT term.* INTO v_previous
    FROM public.lease_terms AS term
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.id = p_supersedes_term_id
      AND term.archived_at IS NULL
      AND term.status NOT IN ('superseded', 'terminated')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Superseded lease term was not found' USING ERRCODE = '23503';
    END IF;
    UPDATE public.lease_terms
    SET status = 'superseded', updated_at = statement_timestamp(), updated_by = v_actor_id
    WHERE id = v_previous.id;
  END IF;

  SELECT coalesce(max(term.term_sequence), 0) + 1 INTO v_sequence
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id AND term.lease_id = p_lease_id;

  INSERT INTO public.lease_terms (
    organization_id, lease_id, term_sequence, start_date, end_date,
    rent_amount, rent_currency, rent_due_day, payment_frequency, status,
    authority_kind, supersedes_term_id, confirmed_at, confirmed_by,
    created_by, updated_by
  ) VALUES (
    p_organization_id, p_lease_id, v_sequence, p_start_date, p_end_date,
    p_rent_amount, p_rent_currency, p_rent_due_day, v_frequency, v_status,
    'authoritative', p_supersedes_term_id, statement_timestamp(), v_actor_id,
    v_actor_id, v_actor_id
  ) RETURNING id INTO v_term_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'lease_term', v_term_id,
    CASE WHEN p_supersedes_term_id IS NULL
      THEN 'authoritative_lease_term_created'
      ELSE 'authoritative_lease_term_superseded' END,
    CASE WHEN p_supersedes_term_id IS NULL THEN NULL ELSE to_jsonb(v_previous) END,
    v_payload || jsonb_build_object('termId', v_term_id, 'termSequence', v_sequence)
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id,
    jsonb_build_object('leaseId', p_lease_id, 'termId', v_term_id)
  );
  RETURN v_term_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_authoritative_property_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code, integer, text, text, uuid, text
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_status text,
  p_supersedes_term_id uuid,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_property_only boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT lease.unit_id IS NULL INTO v_is_property_only
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id AND lease.id = p_lease_id;

  IF v_is_property_only THEN
    RETURN app_private.create_authoritative_property_lease_term(
      p_organization_id, p_lease_id, p_start_date, p_end_date, p_rent_amount,
      p_rent_currency, p_rent_due_day, p_payment_frequency, p_status,
      p_supersedes_term_id, p_idempotency_key
    );
  END IF;

  RETURN app_private.create_authoritative_lease_term_internal(
    p_organization_id, p_lease_id, p_start_date, p_end_date, p_rent_amount,
    p_rent_currency, p_rent_due_day, p_payment_frequency, p_status,
    p_supersedes_term_id, p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_lease_activation(
  p_organization_id uuid,
  p_lease_id uuid,
  p_expected_status text,
  p_expected_occupancy_id uuid,
  p_activation_date date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_business_date date;
  v_existing public.lease_activation_schedules%ROWTYPE;
  v_lease public.leases%ROWTYPE;
  v_schedule public.lease_activation_schedules%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_transition jsonb;
  v_timezone text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RAISE EXCEPTION 'Activation idempotency key is required'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_idempotency_required';
  END IF;

  SELECT schedule.* INTO v_existing
  FROM public.lease_activation_schedules AS schedule
  WHERE schedule.organization_id = p_organization_id
    AND schedule.idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.lease_id IS DISTINCT FROM p_lease_id
      OR v_existing.expected_occupancy_id IS DISTINCT FROM p_expected_occupancy_id
      OR v_existing.activation_date IS DISTINCT FROM p_activation_date THEN
      RAISE EXCEPTION 'Conflicting Lease activation idempotency request'
        USING ERRCODE = '22023', DETAIL = 'lease_activation_idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'activationDate', v_existing.activation_date,
      'leaseId', v_existing.lease_id,
      'scheduleId', v_existing.id,
      'status', CASE WHEN v_existing.status = 'processed' THEN 'active' ELSE v_existing.status END
    );
  END IF;

  IF lower(btrim(coalesce(p_expected_status, ''))) <> 'draft' THEN
    RAISE EXCEPTION 'Only a Draft Lease can be activated'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_draft_required';
  END IF;

  SELECT organization.operational_timezone INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  v_business_date := (statement_timestamp() AT TIME ZONE v_timezone)::date;

  IF p_activation_date IS NULL OR p_activation_date < v_business_date THEN
    RAISE EXCEPTION 'Activation date cannot be before today'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_date_in_past';
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
  FOR UPDATE;

  IF NOT FOUND OR v_lease.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_lease.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Lease lifecycle changed after this form was opened'
      USING ERRCODE = '40001', DETAIL = 'lease_activation_stale_status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.lease_id = p_lease_id
      AND occupancy.id = p_expected_occupancy_id
      AND occupancy.evidence_state = 'accepted'
      AND occupancy.archived_at IS NULL
      AND occupancy.property_id = v_lease.property_id
      AND occupancy.unit_id IS NOT DISTINCT FROM v_lease.unit_id
  ) THEN
    RAISE EXCEPTION 'Occupancy evidence changed after this form was opened'
      USING ERRCODE = '40001', DETAIL = 'lease_activation_stale_occupancy';
  END IF;

  SELECT term.* INTO v_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.status NOT IN ('superseded', 'terminated')
    AND term.archived_at IS NULL
  ORDER BY term.term_sequence DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR p_activation_date < v_term.start_date OR p_activation_date > v_term.end_date THEN
    RAISE EXCEPTION 'Activation date must be within the Lease term'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_outside_term';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.archived_at IS NULL
      AND billing.rule_source <> 'unresolved_history'
      AND p_activation_date BETWEEN billing.effective_from AND billing.effective_to
  ) THEN
    RAISE EXCEPTION 'Lease billing rules must be resolved before activation'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_billing_rules_required';
  END IF;

  INSERT INTO public.lease_activation_schedules (
    organization_id, lease_id, expected_occupancy_id, activation_date,
    idempotency_key, created_by, updated_by
  ) VALUES (
    p_organization_id, p_lease_id, p_expected_occupancy_id, p_activation_date,
    btrim(p_idempotency_key), v_actor_id, v_actor_id
  ) RETURNING * INTO v_schedule;

  IF p_activation_date > v_business_date THEN
    RETURN jsonb_build_object(
      'activationDate', v_schedule.activation_date,
      'leaseId', p_lease_id,
      'scheduleId', v_schedule.id,
      'status', 'scheduled'
    );
  END IF;

  v_transition := public.transition_lease_lifecycle(
    p_organization_id,
    p_lease_id,
    'draft',
    p_expected_occupancy_id,
    'activate',
    p_activation_date,
    NULL,
    'Lease activated by operator request',
    btrim(p_idempotency_key) || ':execute'
  );

  UPDATE public.lease_activation_schedules
  SET status = 'processed', processed_at = statement_timestamp(), updated_by = v_actor_id
  WHERE organization_id = p_organization_id AND id = v_schedule.id;

  RETURN v_transition || jsonb_build_object(
    'activationDate', p_activation_date,
    'scheduleId', v_schedule.id,
    'status', 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_lease_activation(
  p_organization_id uuid,
  p_schedule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_schedule public.lease_activation_schedules%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT schedule.* INTO v_schedule
  FROM public.lease_activation_schedules AS schedule
  WHERE schedule.organization_id = p_organization_id
    AND schedule.id = p_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease activation schedule not found' USING ERRCODE = '23503';
  END IF;

  IF v_schedule.status = 'pending' THEN
    UPDATE public.lease_activation_schedules
    SET status = 'cancelled', cancelled_at = statement_timestamp(), updated_by = v_actor_id
    WHERE organization_id = p_organization_id AND id = p_schedule_id;
  ELSIF v_schedule.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Only a pending activation can be cancelled'
      USING ERRCODE = '22023', DETAIL = 'lease_activation_not_pending';
  END IF;

  RETURN jsonb_build_object(
    'leaseId', v_schedule.lease_id,
    'scheduleId', v_schedule.id,
    'status', 'cancelled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_due_lease_activations(
  p_organization_id uuid,
  p_through_date date DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_business_date date;
  v_failed integer := 0;
  v_processed integer := 0;
  v_schedule public.lease_activation_schedules%ROWTYPE;
  v_timezone text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT organization.operational_timezone INTO STRICT v_timezone
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  v_business_date := coalesce(
    p_through_date,
    (statement_timestamp() AT TIME ZONE v_timezone)::date
  );

  FOR v_schedule IN
    SELECT schedule.*
    FROM public.lease_activation_schedules AS schedule
    WHERE schedule.organization_id = p_organization_id
      AND schedule.status = 'pending'
      AND schedule.activation_date <= v_business_date
    ORDER BY schedule.activation_date, schedule.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.transition_lease_lifecycle(
        p_organization_id,
        v_schedule.lease_id,
        'draft',
        v_schedule.expected_occupancy_id,
        'activate',
        v_schedule.activation_date,
        NULL,
        'Lease activated on scheduled date',
        v_schedule.idempotency_key || ':execute'
      );

      UPDATE public.lease_activation_schedules
      SET status = 'processed', processed_at = statement_timestamp(),
        failure_code = NULL, failure_message = NULL, updated_by = v_actor_id
      WHERE organization_id = p_organization_id AND id = v_schedule.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.lease_activation_schedules
      SET status = 'failed', failure_code = SQLSTATE,
        failure_message = left(SQLERRM, 500), updated_by = v_actor_id
      WHERE organization_id = p_organization_id AND id = v_schedule.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('failed', v_failed, 'processed', v_processed);
END;
$$;

REVOKE ALL ON FUNCTION public.request_lease_activation(uuid, uuid, text, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_lease_activation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_due_lease_activations(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_lease_activation(uuid, uuid, text, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_lease_activation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_lease_activations(uuid, date, integer) TO authenticated, service_role;

COMMENT ON TABLE public.lease_activation_schedules IS
  'One visible, cancellable activation request for a Draft Lease. Processing remains idempotent.';
COMMENT ON FUNCTION public.request_lease_activation(uuid, uuid, text, uuid, date, text) IS
  'Activates today or records one future activation without requiring an operator-written explanation.';
