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
  v_items jsonb := '[]'::jsonb;
  v_property_ready boolean;
  v_unit_ready boolean;
  v_owner_ready boolean;
  v_lease_ready boolean;
  v_occupancy_ready boolean;
  v_billing_ready boolean;
  v_policy_ready boolean;
  v_opening_ready boolean;
  v_deposit_ready boolean;
  v_owner_count integer := 0;
  v_opening_count integer := 0;
  v_deposit_amount numeric := 0;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_manage_operations(p_organization_id)
    AND NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Choose a readiness date' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) INTO v_property_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'property', 'label', 'Property record', 'ready', v_property_ready,
    'repairHref', '/properties'
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.units AS unit
    WHERE unit.organization_id = p_organization_id
      AND unit.property_id = p_property_id
      AND unit.id = p_unit_id
      AND unit.archived_at IS NULL
  ) INTO v_unit_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'unit', 'label', 'Unit record', 'ready', v_unit_ready,
    'repairHref', '/properties/' || coalesce(p_property_id::text, '')
  ));

  SELECT NOT EXISTS (
    SELECT 1
    FROM app_private.owner_roster_legacy_preflight(p_effective_date) AS issue
    WHERE issue.organization_id = p_organization_id
      AND issue.property_id = p_property_id
      AND issue.issue_code IS NOT NULL
  ) AND EXISTS (
    SELECT 1 FROM public.property_owners AS owner
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND owner.archived_at IS NULL
      AND owner.effective_range @> p_effective_date
  ) INTO v_owner_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'owner_roster', 'label', 'Owner roster', 'ready', v_owner_ready,
    'repairHref', '/properties/' || coalesce(p_property_id::text, '')
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.current_leases AS lease
    WHERE lease.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease.unit_id = p_unit_id
      AND lease.id = p_lease_id
      AND lease.archived_at IS NULL
      AND lease.status IN ('active', 'notice_given')
  ), coalesce(max(lease.deposit_amount), 0)
  INTO v_lease_ready, v_deposit_amount
  FROM public.current_leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'lease', 'label', 'Active lease', 'ready', v_lease_ready,
    'repairHref', '/leases'
  ));

  SELECT EXISTS (
    SELECT 1
    FROM public.lease_occupancies AS occupancy
    JOIN public.lease_occupancy_participants AS participant
      ON participant.organization_id = occupancy.organization_id
     AND participant.lease_occupancy_id = occupancy.id
     AND participant.evidence_state = 'accepted'
     AND participant.business_lifecycle = 'present'
     AND participant.started_on_confidence = 'confirmed'
     AND participant.ended_on_confidence = 'confirmed'
     AND participant.effective_range @> p_effective_date
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.lease_id = p_lease_id
      AND occupancy.property_id = p_property_id
      AND occupancy.unit_id = p_unit_id
      AND occupancy.evidence_state = 'accepted'
      AND occupancy.business_lifecycle IN ('occupied', 'notice_given')
      AND occupancy.actual_move_in_kind = 'known'
      AND occupancy.actual_move_in_confidence = 'confirmed'
      AND occupancy.actual_move_out_kind IN ('known', 'open_current')
      AND occupancy.actual_move_out_confidence = 'confirmed'
      AND occupancy.actual_effective_range @> p_effective_date
      AND occupancy.archived_at IS NULL
  ) INTO v_occupancy_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'occupancy', 'label', 'Confirmed resident and actual occupancy',
    'ready', v_occupancy_ready,
    'reason', CASE WHEN v_occupancy_ready THEN NULL
      ELSE 'confirmed_actual_occupancy_required' END,
    'repairHref', '/leases'
  ));

  SELECT EXISTS (
    SELECT 1 FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.archived_at IS NULL
      AND billing.superseded_at IS NULL
      AND billing.effective_range @> p_effective_date
      AND billing.confirmed_at IS NOT NULL
  ) INTO v_billing_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'billing', 'label', 'Billing terms', 'ready', v_billing_ready,
    'repairHref', '/rent-income?leaseId=' || coalesce(p_lease_id::text, '') || '&action=billing'
  ));

  SELECT readiness.readiness_status = 'ready', readiness.reason_code
  INTO v_policy_ready, v_reason
  FROM public.resolve_lease_rent_readiness(
    p_organization_id, p_lease_id, p_effective_date
  ) AS readiness;
  v_policy_ready := coalesce(v_policy_ready, false);
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'rent_policy', 'label', 'Approved rent policy and term',
    'ready', v_policy_ready, 'reason', coalesce(v_reason, 'rent_not_ready'),
    'repairHref', '/settings/rent-policy'
  ));

  SELECT count(*) INTO v_owner_count
  FROM public.property_owners AS owner
  WHERE owner.organization_id = p_organization_id
    AND owner.property_id = p_property_id
    AND owner.archived_at IS NULL
    AND owner.effective_range @> p_effective_date;
  SELECT count(DISTINCT authority.owner_person_id::text || ':' || authority.component::text)
  INTO v_opening_count
  FROM public.owner_opening_balance_known_authority_v1 AS authority
  JOIN public.property_owners AS owner
    ON owner.organization_id = authority.organization_id
   AND owner.property_id = authority.property_id
   AND owner.person_id = authority.owner_person_id
   AND owner.archived_at IS NULL
   AND owner.effective_range @> p_effective_date
  JOIN public.organizations AS organization
    ON organization.id = authority.organization_id
   AND organization.preferred_currency = authority.currency
  WHERE authority.organization_id = p_organization_id
    AND authority.property_id = p_property_id
    AND authority.effective_date <= p_effective_date
    AND authority.authority_state = 'known';
  v_opening_ready := v_owner_count > 0 AND v_opening_count >= v_owner_count * 4;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'opening_balance', 'label', 'Owner opening balances',
    'ready', v_opening_ready,
    'repairHref', '/balances?propertyId=' || coalesce(p_property_id::text, '')
  ));

  SELECT v_deposit_amount <= 0 OR EXISTS (
    SELECT 1 FROM public.lease_deposits AS deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.lease_id = p_lease_id
      AND deposit.archived_at IS NULL
      AND (
        deposit.status = 'waived'
        OR (
          deposit.status IN (
            'received', 'held', 'partially_returned', 'returned', 'forfeited'
          )
          AND EXISTS (
            SELECT 1
            FROM public.lease_deposit_events AS event
            WHERE event.organization_id = deposit.organization_id
              AND event.lease_deposit_id = deposit.id
              AND event.event_type = 'received'
              AND event.reversal_of_id IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM public.lease_deposit_events AS reversal
                WHERE reversal.reversal_of_id = event.id
              )
          )
        )
      )
  ) INTO v_deposit_ready;
  v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'code', 'deposit', 'label', 'Deposit handling', 'ready', v_deposit_ready,
    'repairHref', '/leases'
  ));

  RETURN pg_catalog.jsonb_build_object(
    'ready', v_property_ready AND v_unit_ready AND v_owner_ready
      AND v_lease_ready AND v_occupancy_ready AND v_billing_ready
      AND v_policy_ready AND v_opening_ready AND v_deposit_ready,
    'organizationId', p_organization_id,
    'propertyId', p_property_id,
    'unitId', p_unit_id,
    'leaseId', p_lease_id,
    'effectiveDate', p_effective_date,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  TO authenticated;

COMMENT ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date) IS
  'Returns compositional IPS readiness and requires accepted confirmed actual occupancy plus contained resident evidence; scheduled dates alone never establish physical occupancy.';
