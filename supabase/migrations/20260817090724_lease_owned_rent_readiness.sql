CREATE OR REPLACE FUNCTION public.resolve_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE(
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
SET search_path TO ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_count integer;
  v_property_structure text;
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

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'blocked', 'scope_mismatch', p_organization_id, NULL::uuid, NULL::uuid,
      p_lease_id, NULL::uuid, NULL::integer, NULL::daterange, NULL::date,
      NULL::date, NULL::numeric, NULL::public.currency_code, NULL::integer,
      NULL::text;
    RETURN;
  END IF;

  IF v_lease.unit_id IS NULL THEN
    SELECT property.rental_structure
    INTO v_property_structure
    FROM public.properties AS property
    WHERE property.id = v_lease.property_id
      AND property.organization_id = v_lease.organization_id
      AND property.archived_at IS NULL;

    IF NOT FOUND OR v_property_structure <> 'single_space' THEN
      RETURN QUERY SELECT
        'blocked', 'scope_mismatch', v_lease.organization_id,
        v_lease.property_id, NULL::uuid, v_lease.id, NULL::uuid,
        NULL::integer, NULL::daterange, NULL::date, NULL::date,
        NULL::numeric, NULL::public.currency_code, NULL::integer,
        NULL::text;
      RETURN;
    END IF;
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

ALTER FUNCTION public.resolve_authoritative_lease_term(uuid, uuid, date)
OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.resolve_lease_rent_readiness(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE(
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
SET search_path TO ''
AS $$
DECLARE
  v_term record;
  v_billing public.lease_billing_terms%ROWTYPE;
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

  SELECT billing.*
  INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND p_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF FOUND AND v_billing.rule_source = 'lease_default_v1' THEN
    IF v_term.payment_frequency <> 'monthly' THEN
      RETURN QUERY SELECT
        'unsupported_frequency', 'unsupported_frequency',
        v_term.organization_id, v_term.property_id, v_term.unit_id,
        v_term.lease_id, v_term.term_id, NULL::uuid, NULL::integer,
        p_effective_date, v_term.rent_amount, v_term.rent_currency,
        v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object(
          'repair', 'replace_term_with_monthly_frequency',
          'supportedFrequencies', jsonb_build_array('monthly')
        );
      RETURN;
    END IF;

    IF v_term.rent_due_day IS NULL THEN
      RETURN QUERY SELECT
        'missing_due_day', 'missing_due_day', v_term.organization_id,
        v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
        NULL::uuid, NULL::integer, p_effective_date, v_term.rent_amount,
        v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object('repair', 'replace_term_with_explicit_due_day');
      RETURN;
    END IF;

    RETURN QUERY SELECT
      'ready', 'ready', v_term.organization_id, v_term.property_id,
      v_term.unit_id, v_term.lease_id, v_term.term_id, NULL::uuid,
      NULL::integer, p_effective_date, v_term.rent_amount,
      v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
      jsonb_build_object(
        'termId', v_term.term_id,
        'billingRuleSource', v_billing.rule_source
      );
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

ALTER FUNCTION public.resolve_lease_rent_readiness(uuid, uuid, date)
OWNER TO postgres;
