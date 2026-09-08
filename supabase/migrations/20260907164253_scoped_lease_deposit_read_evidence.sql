-- Forward correction to 20260907162632; its SQL and ledger entry stay immutable.
-- A Lease read alone does not authorize deposit finances. Return deposit metadata
-- and minimal event evidence only with additional per-property finance.view.
-- Existing event math, direct evidence reads, write authority and base RLS stay
-- unchanged. CREATE OR REPLACE preserves this private function's owner and ACL.
CREATE OR REPLACE FUNCTION app_private.lease_read_context(
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
    WHERE deposit.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,lease.property_id,'finance.view')
    ORDER BY deposit.updated_at DESC,deposit.id
  ), deposit_events AS (
    SELECT event.id,event.lease_deposit_id,event.event_type,event.event_date,event.amount,
      event.currency,NULL::text AS reference,event.reversal_of_id
    FROM public.lease_deposit_events event
    JOIN deposits deposit ON deposit.id=event.lease_deposit_id
    JOIN selected_leases lease ON lease.id=deposit.lease_id
    WHERE event.organization_id=p_organization_id AND event.property_id=lease.property_id
    -- Identity, amount and dates are enough for the existing held-balance math.
    -- Free-text references remain available only through independent base RLS.
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
    'deposits',coalesce((SELECT jsonb_agg(to_jsonb(row)) FROM deposits row),'[]'::jsonb),
    'deposit_events',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.event_date DESC,row.id) FROM deposit_events row),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
