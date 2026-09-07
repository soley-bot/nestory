-- Additive read contracts. No base-table authority or finance mutation context
-- changes. Every private entry point checks the calling identity and property scope.
CREATE FUNCTION app_private.scoped_leases_with_effective_rent(
  p_organization_id uuid, p_effective_date date
) RETURNS TABLE(id uuid, property_id uuid, unit_id uuid, tenant_name text, primary_tenant_person_id uuid, lease_start_date date, lease_end_date date, monthly_rent_amount numeric, monthly_rent_currency public.currency_code, deposit_amount numeric, deposit_currency public.currency_code, status text, archived_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'leases.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT lease.id,lease.property_id,lease.unit_id,person.display_name,
    lease.primary_tenant_person_id,term.start_date,term.end_date,term.rent_amount,
    term.rent_currency,lease.deposit_amount,lease.deposit_currency,lease.status,lease.archived_at
  FROM public.leases lease
  JOIN public.properties property ON property.id=lease.property_id
    AND property.organization_id=lease.organization_id
  JOIN public.people person ON person.organization_id=lease.organization_id
    AND person.id=lease.primary_tenant_person_id
  JOIN LATERAL (
    SELECT candidate.start_date,candidate.end_date,candidate.rent_amount,candidate.rent_currency
    FROM public.lease_terms candidate
    WHERE candidate.organization_id=lease.organization_id AND candidate.lease_id=lease.id
      AND candidate.authority_kind='authoritative' AND candidate.status<>'superseded'
      AND candidate.archived_at IS NULL
    ORDER BY CASE WHEN p_effective_date BETWEEN candidate.start_date AND candidate.end_date
      THEN 0 ELSE 1 END,candidate.start_date DESC,candidate.term_sequence DESC
    LIMIT 1
  ) term ON true
  WHERE lease.organization_id=p_organization_id
    AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
    AND (lease.unit_id IS NULL OR EXISTS (
      SELECT 1 FROM public.units unit WHERE unit.id=lease.unit_id
        AND unit.organization_id=lease.organization_id AND unit.property_id=lease.property_id));
END;
$$;
CREATE FUNCTION public.get_scoped_leases_with_effective_rent(
  p_organization_id uuid,p_effective_date date
) RETURNS TABLE(id uuid, property_id uuid, unit_id uuid, tenant_name text, primary_tenant_person_id uuid, lease_start_date date, lease_end_date date, monthly_rent_amount numeric, monthly_rent_currency public.currency_code, deposit_amount numeric, deposit_currency public.currency_code, status text, archived_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT * FROM app_private.scoped_leases_with_effective_rent(p_organization_id,p_effective_date); $$;

CREATE FUNCTION app_private.lease_read_context(
  p_organization_id uuid,p_lease_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'leases.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF cardinality(p_lease_ids)>1000 THEN
    RAISE EXCEPTION 'Lease context is limited to 1000 leases' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_lease_ids) requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leases lease
      JOIN public.properties property ON property.organization_id=lease.organization_id
        AND property.id=lease.property_id
      WHERE lease.organization_id=p_organization_id AND lease.id=requested.id
        AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
        AND (lease.unit_id IS NULL OR EXISTS (
          SELECT 1 FROM public.units unit WHERE unit.id=lease.unit_id
            AND unit.organization_id=lease.organization_id AND unit.property_id=lease.property_id))
    )
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  -- NULL or [] returns selector/availability context only, never full detail.
  WITH properties AS MATERIALIZED (
    SELECT property.id,property.code,property.name,property.rental_structure,property.archived_at
    FROM public.properties property WHERE property.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
  ), units AS MATERIALIZED (
    SELECT unit.id,unit.property_id,unit.unit_number,unit.floor,unit.status,unit.archived_at
    FROM public.units unit JOIN properties property ON property.id=unit.property_id
    WHERE unit.organization_id=p_organization_id
  ), allowed_leases AS MATERIALIZED (
    SELECT lease.id,lease.property_id,lease.unit_id,lease.archived_at,lease.primary_tenant_person_id
    FROM public.leases lease JOIN properties property ON property.id=lease.property_id
    WHERE lease.organization_id=p_organization_id
      AND (lease.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM units unit WHERE unit.id=lease.unit_id AND unit.property_id=lease.property_id))
  ), selected_leases AS MATERIALIZED (
    SELECT lease.* FROM allowed_leases lease WHERE lease.id=ANY(p_lease_ids)
  ), availability_leases AS (
    SELECT lease.id,lease.unit_id,lease.archived_at FROM allowed_leases lease WHERE lease.unit_id IS NOT NULL
  ), availability_terms AS (
    SELECT term.lease_id,term.start_date,term.end_date,term.status,term.archived_at
    FROM public.lease_terms term JOIN allowed_leases lease ON lease.id=term.lease_id
    WHERE term.organization_id=p_organization_id AND lease.archived_at IS NULL
      AND lease.unit_id IS NOT NULL AND term.status IN ('active','draft','upcoming')
  ), parties AS MATERIALIZED (
    SELECT party.id,party.lease_id,party.person_id,party.party_role,party.is_primary,
      party.started_on,party.ended_on,party.archived_at
    FROM public.lease_parties party JOIN selected_leases lease ON lease.id=party.lease_id
    JOIN public.people person ON person.organization_id=party.organization_id AND person.id=party.person_id
    WHERE party.organization_id=p_organization_id
  ), terms AS (
    SELECT term.id,term.lease_id,term.term_sequence,term.start_date,term.end_date,term.rent_amount,
      term.rent_currency,term.rent_due_day,term.payment_frequency,term.status,term.archived_at
    FROM public.lease_terms term JOIN selected_leases lease ON lease.id=term.lease_id
    WHERE term.organization_id=p_organization_id
  ), billing_terms AS MATERIALIZED (
    SELECT billing.archived_at, billing.billing_recipient_kind, billing.billing_recipient_person_id, billing.charge_management_fee_when_active, billing.charge_through_lease_end, billing.collection_route, billing.created_at, billing.effective_from, billing.effective_to, billing.final_period_prorated_amount, billing.first_period_prorated_amount, billing.full_management_fee_during_proration, billing.id, billing.lease_end_proration_rule, billing.lease_id, billing.lease_start_proration_rule, billing.management_fee_mode, billing.management_fee_value, billing.mid_period_rent_change_rule, billing.organization_id, billing.property_id, billing.rent_calculation_timezone, billing.rule_source, billing.short_month_due_day_rule
    FROM public.lease_billing_terms billing JOIN selected_leases lease
      ON lease.id=billing.lease_id AND lease.property_id=billing.property_id
    WHERE billing.organization_id=p_organization_id
      AND (billing.billing_recipient_person_id IS NULL OR EXISTS (
        SELECT 1 FROM public.people person WHERE person.organization_id=billing.organization_id
          AND person.id=billing.billing_recipient_person_id))
  ), people AS (
    SELECT person.id,person.display_name FROM public.people person
    WHERE person.organization_id=p_organization_id AND (
      EXISTS (SELECT 1 FROM selected_leases lease WHERE lease.primary_tenant_person_id=person.id)
      OR EXISTS (SELECT 1 FROM parties party WHERE party.person_id=person.id)
      OR EXISTS (SELECT 1 FROM billing_terms billing WHERE billing.billing_recipient_person_id=person.id))
  ), occupancies AS (
    SELECT occupancy.id,occupancy.lease_id,occupancy.unit_id,occupancy.status,
      occupancy.business_lifecycle,occupancy.evidence_state,
      occupancy.scheduled_move_in_date,occupancy.scheduled_move_in_kind,occupancy.scheduled_move_in_confidence,
      occupancy.actual_move_in_date,occupancy.actual_move_in_kind,occupancy.actual_move_in_confidence,
      occupancy.scheduled_move_out_date,occupancy.scheduled_move_out_kind,occupancy.scheduled_move_out_confidence,
      occupancy.actual_move_out_date,occupancy.actual_move_out_kind,occupancy.actual_move_out_confidence,
      occupancy.archived_at,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',participant.id,
        'business_lifecycle',participant.business_lifecycle,'evidence_state',participant.evidence_state)
        ORDER BY participant.id) FROM public.lease_occupancy_participants participant
        JOIN public.lease_parties party ON party.organization_id=participant.organization_id
          AND party.id=participant.lease_party_id AND party.lease_id=lease.id
        WHERE participant.organization_id=p_organization_id
          AND participant.lease_occupancy_id=occupancy.id),'[]'::jsonb) participants
    FROM public.lease_occupancies occupancy JOIN selected_leases lease ON lease.id=occupancy.lease_id
    WHERE occupancy.organization_id=p_organization_id AND occupancy.property_id=lease.property_id
      AND (occupancy.unit_id IS NULL OR EXISTS (SELECT 1 FROM units unit
        WHERE unit.id=occupancy.unit_id AND unit.property_id=lease.property_id))
    ORDER BY occupancy.updated_at DESC,occupancy.id
  ), deposits AS (
    SELECT deposit.id,deposit.lease_id,deposit.deposit_type,deposit.amount,deposit.currency,
      deposit.status,deposit.archived_at
    FROM public.lease_deposits deposit JOIN selected_leases lease ON lease.id=deposit.lease_id
    WHERE deposit.organization_id=p_organization_id ORDER BY deposit.updated_at DESC,deposit.id
  )
  SELECT jsonb_build_object(
    'properties',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.code,row.id) FROM properties row),'[]'::jsonb),
    'units',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.unit_number,row.id) FROM units row),'[]'::jsonb),
    'availability_leases',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM availability_leases row),'[]'::jsonb),
    'availability_terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.lease_id,row.start_date) FROM availability_terms row),'[]'::jsonb),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.display_name,row.id) FROM people row),'[]'::jsonb),
    'parties',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.is_primary DESC,row.party_role,row.id) FROM parties row),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.term_sequence DESC,row.id) FROM terms row),'[]'::jsonb),
    'billing_terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.effective_from DESC,row.created_at DESC,row.id) FROM billing_terms row),'[]'::jsonb),
    'occupancies',coalesce((SELECT jsonb_agg(to_jsonb(row)) FROM occupancies row),'[]'::jsonb),
    'deposits',coalesce((SELECT jsonb_agg(to_jsonb(row)) FROM deposits row),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
CREATE FUNCTION public.get_lease_read_context(p_organization_id uuid,p_lease_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT app_private.lease_read_context(p_organization_id,p_lease_ids); $$;

CREATE FUNCTION app_private.finance_read_context(
  p_organization_id uuid,p_requested_property_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_requested_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties property
    WHERE property.organization_id=p_organization_id AND property.id=p_requested_property_id
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  -- Selectors deliberately keep all authorized choices. Archive/date filtering is
  -- consumer-specific: Finance history needs archived labels; live reports do not.
  WITH properties AS MATERIALIZED (
    SELECT property.id,property.code,property.name,property.archived_at
    FROM public.properties property WHERE property.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ), units AS MATERIALIZED (
    SELECT unit.id,unit.property_id,unit.unit_number,unit.archived_at
    FROM public.units unit JOIN properties property ON property.id=unit.property_id
    WHERE unit.organization_id=p_organization_id
  ), allowed_leases AS MATERIALIZED (
    SELECT lease.id,lease.property_id,lease.primary_tenant_person_id
    FROM public.leases lease JOIN properties property ON property.id=lease.property_id
    WHERE lease.organization_id=p_organization_id
      AND (lease.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM units unit WHERE unit.id=lease.unit_id AND unit.property_id=lease.property_id))
  ), leases AS (
    -- Keep the released view's CURRENT_DATE choice and fallback ordering exactly.
    SELECT current.id,current.property_id,current.unit_id,current.primary_tenant_person_id,
      current.tenant_name,current.status,current.lease_start_date,current.lease_end_date,
      current.monthly_rent_amount,current.archived_at
    FROM public.current_leases current JOIN allowed_leases lease ON lease.id=current.id
    WHERE current.organization_id=p_organization_id
  ), terms AS (
    SELECT term.lease_id,term.start_date,term.end_date,term.rent_amount
    FROM public.lease_terms term JOIN allowed_leases lease ON lease.id=term.lease_id
    WHERE term.organization_id=p_organization_id AND term.authority_kind='authoritative'
      AND term.status<>'superseded' AND term.archived_at IS NULL
  ), billing_terms AS MATERIALIZED (
    SELECT billing.archived_at, billing.billing_recipient_kind, billing.billing_recipient_person_id, billing.charge_management_fee_when_active, billing.charge_through_lease_end, billing.collection_route, billing.created_at, billing.effective_from, billing.effective_to, billing.final_period_prorated_amount, billing.first_period_prorated_amount, billing.full_management_fee_during_proration, billing.id, billing.lease_end_proration_rule, billing.lease_id, billing.lease_start_proration_rule, billing.management_fee_mode, billing.management_fee_value, billing.mid_period_rent_change_rule, billing.organization_id, billing.property_id, billing.rent_calculation_timezone, billing.rule_source, billing.short_month_due_day_rule
    FROM public.lease_billing_terms billing JOIN allowed_leases lease
      ON lease.id=billing.lease_id AND lease.property_id=billing.property_id
    WHERE billing.organization_id=p_organization_id
      AND (billing.billing_recipient_person_id IS NULL OR EXISTS (
        SELECT 1 FROM public.people person WHERE person.organization_id=billing.organization_id
          AND person.id=billing.billing_recipient_person_id))
  ), owner_assignments AS MATERIALIZED (
    SELECT assignment.id,assignment.property_id,assignment.person_id,assignment.is_primary,
      assignment.started_on,assignment.ended_on,assignment.archived_at
    FROM public.property_owners assignment JOIN properties property ON property.id=assignment.property_id
    JOIN public.people person ON person.organization_id=assignment.organization_id AND person.id=assignment.person_id
    WHERE assignment.organization_id=p_organization_id
  ), people AS (
    SELECT person.id,person.display_name,person.party_type,person.archived_at FROM public.people person
    WHERE person.organization_id=p_organization_id AND (
      EXISTS (SELECT 1 FROM allowed_leases lease WHERE lease.primary_tenant_person_id=person.id)
      OR EXISTS (SELECT 1 FROM billing_terms billing WHERE billing.billing_recipient_person_id=person.id)
      OR EXISTS (SELECT 1 FROM owner_assignments assignment WHERE assignment.person_id=person.id))
  )
  SELECT jsonb_build_object(
    'properties',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.code,row.id) FROM properties row),'[]'::jsonb),
    'units',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.unit_number,row.id) FROM units row),'[]'::jsonb),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.display_name,row.id) FROM people row),'[]'::jsonb),
    'owner_assignments',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.started_on,row.id) FROM owner_assignments row),'[]'::jsonb),
    'leases',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.lease_start_date DESC,row.id) FROM leases row),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.lease_id,row.start_date) FROM terms row),'[]'::jsonb),
    'billing_terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.effective_from DESC,row.created_at DESC,row.id) FROM billing_terms row),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
CREATE FUNCTION public.get_finance_read_context(p_organization_id uuid,p_requested_property_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT app_private.finance_read_context(p_organization_id,p_requested_property_id); $$;


-- Readiness algorithm copied from 20260818221103 without changing term, policy,
-- due-day, frequency or repair semantics. Only the new parent access check differs.
CREATE FUNCTION app_private.scoped_authoritative_lease_term(
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
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_count integer;
  v_property_structure text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'leases.view') OR NOT EXISTS (
    SELECT 1 FROM public.leases lease
    JOIN public.properties property ON property.id=lease.property_id
      AND property.organization_id=lease.organization_id
    WHERE lease.organization_id=p_organization_id AND lease.id=p_lease_id
      AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
      AND (lease.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM public.units unit WHERE unit.id=lease.unit_id
          AND unit.organization_id=lease.organization_id AND unit.property_id=lease.property_id))
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;

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

ALTER FUNCTION app_private.scoped_authoritative_lease_term(uuid, uuid, date)
OWNER TO postgres;

CREATE FUNCTION app_private.scoped_lease_rent_readiness(
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
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_term record;
  v_billing public.lease_billing_terms%ROWTYPE;
  v_policy public.rent_policy_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  SELECT *
  INTO v_term
  FROM app_private.scoped_authoritative_lease_term(
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

ALTER FUNCTION app_private.scoped_lease_rent_readiness(uuid, uuid, date)
OWNER TO postgres;

CREATE FUNCTION public.get_scoped_lease_rent_readiness(
  p_organization_id uuid,p_lease_id uuid,p_effective_date date
) RETURNS TABLE(
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
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT * FROM app_private.scoped_lease_rent_readiness(p_organization_id,p_lease_id,p_effective_date); $$;

ALTER FUNCTION app_private.scoped_leases_with_effective_rent(uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.scoped_leases_with_effective_rent(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.scoped_leases_with_effective_rent(uuid,date) TO authenticated;

ALTER FUNCTION public.get_scoped_leases_with_effective_rent(uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_scoped_leases_with_effective_rent(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_scoped_leases_with_effective_rent(uuid,date) TO authenticated;

ALTER FUNCTION app_private.lease_read_context(uuid,uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lease_read_context(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.lease_read_context(uuid,uuid[]) TO authenticated;

ALTER FUNCTION public.get_lease_read_context(uuid,uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_lease_read_context(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_lease_read_context(uuid,uuid[]) TO authenticated;

ALTER FUNCTION app_private.finance_read_context(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.finance_read_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.finance_read_context(uuid,uuid) TO authenticated;

ALTER FUNCTION public.get_finance_read_context(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_finance_read_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_read_context(uuid,uuid) TO authenticated;

ALTER FUNCTION app_private.scoped_lease_rent_readiness(uuid,uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.scoped_lease_rent_readiness(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.scoped_lease_rent_readiness(uuid,uuid,date) TO authenticated;

ALTER FUNCTION public.get_scoped_lease_rent_readiness(uuid,uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_scoped_lease_rent_readiness(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_scoped_lease_rent_readiness(uuid,uuid,date) TO authenticated;

REVOKE ALL ON FUNCTION app_private.scoped_authoritative_lease_term(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
