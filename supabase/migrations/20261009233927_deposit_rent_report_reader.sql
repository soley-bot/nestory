-- LOCAL UNEXECUTED reader companion. No grant, production endpoint or activation.
-- Requires the existing leases.view + finance.view/property boundary. Never calls
-- get_deposit_rent_report_sources (the separate finance-only proposal).
CREATE FUNCTION public.get_local_lease_deposit_report_snapshot(p_organization_id uuid,p_property_ids uuid[],
  p_period_start date,p_period_end date,p_unit_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE lease_ids uuid[]; deposit_rows jsonb; event_rows jsonb; allocation_rows jsonb; bridge_rows jsonb;
  census jsonb; packet jsonb; actor uuid:=auth.uid(); n integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_property_ids IS NULL OR cardinality(p_property_ids) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM unnest(p_property_ids) x WHERE x IS NULL)
    OR (SELECT count(DISTINCT x) FROM unnest(p_property_ids) x)<>cardinality(p_property_ids)
    OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_start<>date_trunc('month',p_period_start)::date
    OR p_period_end<>(p_period_start+interval '1 month - 1 day')::date
    OR (p_unit_id IS NOT NULL AND cardinality(p_property_ids)<>1) THEN
    RAISE EXCEPTION 'Explicit bounded monthly scope required' USING ERRCODE='22023'; END IF;
  IF app_private.has_org_permission(p_organization_id,'leases.view') IS NOT TRUE
    OR app_private.has_org_permission(p_organization_id,'finance.view') IS NOT TRUE
    OR EXISTS(SELECT 1 FROM unnest(p_property_ids) p
      WHERE app_private.can_access_property(p_organization_id,p,'leases.view') IS NOT TRUE
        OR app_private.can_access_property(p_organization_id,p,'finance.view') IS NOT TRUE) THEN
    RAISE EXCEPTION 'Both lease and finance property authority required for the whole scope' USING ERRCODE='42501'; END IF;
  IF p_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units u WHERE u.organization_id=p_organization_id
    AND u.id=p_unit_id AND u.property_id=ANY(p_property_ids)) THEN
    RAISE EXCEPTION 'Unit outside requested property' USING ERRCODE='42501'; END IF;
  SELECT array_agg(l.id ORDER BY l.id),count(*) INTO lease_ids,n FROM public.leases l
    WHERE l.organization_id=p_organization_id AND l.property_id=ANY(p_property_ids)
      AND (p_unit_id IS NULL OR l.unit_id=p_unit_id OR l.unit_id IS NULL);
  IF n>1000 THEN RAISE EXCEPTION 'Lease scope exceeds existing reader cap' USING ERRCODE='54000'; END IF;
  lease_ids:=coalesce(lease_ids,'{}'::uuid[]);
  -- Reuse the actual existing lease reader's requested-ID and unit-parent checks.
  PERFORM public.get_lease_read_context(p_organization_id,lease_ids);
  IF EXISTS(SELECT 1 FROM public.lease_deposits d JOIN public.leases l ON l.id=d.lease_id
    WHERE d.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND l.organization_id<>d.organization_id)
    OR EXISTS(SELECT 1 FROM public.lease_deposit_events e LEFT JOIN public.lease_deposits d ON d.organization_id=e.organization_id AND d.id=e.lease_deposit_id
      LEFT JOIN public.leases l ON l.organization_id=d.organization_id AND l.id=d.lease_id
      WHERE e.organization_id=p_organization_id
        AND (e.property_id=ANY(p_property_ids) OR d.lease_id=ANY(lease_ids)) AND e.event_date<=p_period_end
        AND (l.id IS NULL OR l.property_id<>e.property_id OR d.currency<>e.currency)) THEN
    RAISE EXCEPTION 'Deposit source parent/scope evidence inconsistent' USING ERRCODE='23514'; END IF;
  -- No inner-join omission of a damaged application/allocation in selected scope.
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications a LEFT JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
    WHERE a.organization_id=p_organization_id AND a.property_id=ANY(p_property_ids) AND a.settlement_date<=p_period_end
      AND (d.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.leases l WHERE l.organization_id=p_organization_id AND l.id=d.lease_id
        AND l.property_id=a.property_id AND l.unit_id IS NOT DISTINCT FROM a.unit_id)))
    OR EXISTS(SELECT 1 FROM public.deposit_rent_allocations x LEFT JOIN public.deposit_rent_applications a ON a.organization_id=x.organization_id AND a.id=x.application_id
      WHERE x.organization_id=p_organization_id AND x.property_id=ANY(p_property_ids) AND a.id IS NULL) THEN
    RAISE EXCEPTION 'Application source parent/scope evidence inconsistent' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.lease_deposits d WHERE d.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids))>5000
    OR (SELECT count(*) FROM public.lease_deposit_events e JOIN public.lease_deposits d ON d.organization_id=e.organization_id AND d.id=e.lease_deposit_id WHERE e.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND e.event_date<=p_period_end)>5000
    OR (SELECT count(*) FROM public.deposit_rent_allocations x JOIN public.deposit_rent_applications a ON a.organization_id=x.organization_id AND a.id=x.application_id JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id WHERE x.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end)>5000
    OR (SELECT count(*) FROM public.deposit_rent_applications a JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id WHERE a.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end)>5000 THEN
    RAISE EXCEPTION 'Snapshot exceeds source cap' USING ERRCODE='54000'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'property_id',l.property_id,'unit_id',l.unit_id) ORDER BY d.id),'[]'::jsonb)
    INTO deposit_rows FROM public.lease_deposits d JOIN public.leases l ON l.organization_id=d.organization_id AND l.id=d.lease_id
    WHERE d.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'lease_deposit_id',e.lease_deposit_id,'property_id',l.property_id,'unit_id',l.unit_id,
    'event_type',e.event_type,'event_date',e.event_date,'amount',e.amount::text,'currency',e.currency,'reversal_of_id',e.reversal_of_id) ORDER BY e.id),'[]'::jsonb)
    INTO event_rows FROM public.lease_deposit_events e JOIN public.lease_deposits d ON d.organization_id=e.organization_id AND d.id=e.lease_deposit_id
    JOIN public.leases l ON l.organization_id=d.organization_id AND l.id=d.lease_id
    WHERE e.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND e.event_date<=p_period_end;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'application_id',a.id,'application_amount',a.amount::text,'deposit_event_id',a.deposit_event_id,
    'lease_deposit_id',a.lease_deposit_id,'invoice_id',a.invoice_id,'invoice_line_id',x.invoice_line_id,'property_id',a.property_id,'unit_id',a.unit_id,
    'currency',a.currency,'settlement_date',a.settlement_date,'custodian',a.custodian,'owner_person_id',a.owner_person_id,
    'signed_amount',x.signed_amount::text,'reversal_of_allocation_id',x.reversal_of_allocation_id,'reversal_of_application_id',a.reversal_of_application_id,
    'custody_confirmation_id',a.custody_confirmation_id,'line_type',line.line_type) ORDER BY x.id),'[]'::jsonb)
    INTO allocation_rows FROM public.deposit_rent_allocations x JOIN public.deposit_rent_applications a ON a.organization_id=x.organization_id AND a.id=x.application_id
    JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
    JOIN public.tenant_invoice_lines line ON line.organization_id=x.organization_id AND line.id=x.invoice_line_id
    WHERE a.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end;
  -- Resolver validates official owner-set identity/fingerprint and rejects missing bridges.
  PERFORM resolved.source_id FROM public.deposit_rent_applications a JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
    CROSS JOIN LATERAL app_private.resolve_owner_event_source(p_organization_id,'deposit_rent_application',a.id) resolved
    WHERE a.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end;
  SELECT coalesce(jsonb_agg(jsonb_build_object('applicationId',a.id,'propertyOwnerId',b.property_owner_id,'ownerPersonId',b.owner_person_id,
    'liabilityAccountId',b.liability_account_id,'allocationSetId',b.allocation_set_id,'custodian',a.custodian,
    'custodySignedAmount',b.custody_signed_amount::text,'ipsHeldSignedAmount',b.ips_held_signed_amount::text,'singleUnchangedOwner',true) ORDER BY a.id),'[]'::jsonb)
    INTO bridge_rows FROM public.deposit_rent_applications a JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
    JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id
    WHERE a.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end;
  -- Separate authoritative table-ID census, not IDs derived from serialized rows.
  SELECT jsonb_build_object('leases',to_jsonb(lease_ids),
    'deposits',coalesce((SELECT jsonb_agg(d.id ORDER BY d.id) FROM public.lease_deposits d WHERE d.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids)),'[]'::jsonb),
    'events',coalesce((SELECT jsonb_agg(e.id ORDER BY e.id) FROM public.lease_deposit_events e JOIN public.lease_deposits d ON d.organization_id=e.organization_id AND d.id=e.lease_deposit_id WHERE e.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND e.event_date<=p_period_end),'[]'::jsonb),
    'allocations',coalesce((SELECT jsonb_agg(x.id ORDER BY x.id) FROM public.deposit_rent_allocations x JOIN public.deposit_rent_applications a ON a.organization_id=x.organization_id AND a.id=x.application_id JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id WHERE x.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end),'[]'::jsonb),
    'ownerBridges',coalesce((SELECT jsonb_agg(a.id ORDER BY a.id) FROM public.deposit_rent_applications a JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id WHERE a.organization_id=p_organization_id AND d.lease_id=ANY(lease_ids) AND a.settlement_date<=p_period_end),'[]'::jsonb)) INTO census;
  IF jsonb_array_length(deposit_rows)<>jsonb_array_length(census->'deposits')
    OR jsonb_array_length(event_rows)<>jsonb_array_length(census->'events')
    OR jsonb_array_length(allocation_rows)<>jsonb_array_length(census->'allocations')
    OR jsonb_array_length(bridge_rows)<>jsonb_array_length(census->'ownerBridges') THEN
    RAISE EXCEPTION 'Source identity census mismatch; no partial packet' USING ERRCODE='23514'; END IF;
  packet:=jsonb_build_object('version',1,'purpose','deposit-rent-validation-only','actorId',actor,'organizationId',p_organization_id,
    'propertyIds',to_jsonb(p_property_ids),'unitId',p_unit_id,'periodStart',p_period_start,'periodEnd',p_period_end,
    'consistency','statement_snapshot','complete',true,'fullOwnerProfitCertified',false,
    'deposits',deposit_rows,'events',event_rows,'allocations',allocation_rows,'ownerBridges',bridge_rows,'census',census);
  packet:=packet||jsonb_build_object('fingerprint',app_private.canonical_financial_payload_hash(packet));
  IF octet_length(packet::text)>8388608 THEN RAISE EXCEPTION 'Snapshot exceeds byte cap' USING ERRCODE='54000'; END IF;
  RETURN packet;
END; $$;
ALTER FUNCTION public.get_local_lease_deposit_report_snapshot(uuid,uuid[],date,date,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_local_lease_deposit_report_snapshot(uuid,uuid[],date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No execution grant. Sensitive finance-only expansion is a separate unapproved decision.
