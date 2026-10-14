-- Display-only finance projection. No custody/command grant or table access.
-- May precede the unpublished deposit schema; absence fails closed at runtime.
CREATE FUNCTION app_private.deposit_statement_source(
  p_organization_id uuid, p_property_id uuid, p_owner_person_id uuid,
  p_application_id uuid, p_source_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source record; lineage record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF p_organization_id IS NULL OR p_property_id IS NULL OR p_owner_person_id IS NULL
    OR p_application_id IS NULL OR p_source_fingerprint IS NULL
    OR p_source_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid deposit statement scope' USING ERRCODE='22023';
  END IF;
  IF app_private.has_org_permission(p_organization_id,'finance.view') IS NOT TRUE
    OR app_private.can_access_property(p_organization_id,p_property_id,'finance.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF to_regclass('public.deposit_rent_applications') IS NULL
    OR to_regclass('public.deposit_rent_owner_bridges') IS NULL THEN
    RAISE EXCEPTION 'Deposit statement source unavailable' USING ERRCODE='55000';
  END IF;
  -- The canonical resolver recomputes the fingerprint from financial evidence
  -- and validates the official owner allocation bridge. Never echo requested proof.
  SELECT * INTO source FROM app_private.resolve_owner_event_source(
    p_organization_id,'deposit_rent_application',p_application_id);
  IF NOT FOUND OR source.source_id IS DISTINCT FROM p_application_id
    OR source.property_id IS DISTINCT FROM p_property_id
    OR source.explicit_owner_person_id IS DISTINCT FROM p_owner_person_id
    OR source.source_fingerprint IS DISTINCT FROM p_source_fingerprint THEN
    RAISE EXCEPTION 'Deposit statement source mismatch' USING ERRCODE='23514';
  END IF;
  SELECT a.id, a.organization_id, a.property_id, b.owner_person_id,
    source.source_fingerprint AS fingerprint, l.id AS lease_id, a.unit_id,
    a.reversal_of_application_id AS original_id
  INTO lineage
  FROM public.deposit_rent_applications a
  JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id
  JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
  JOIN public.leases l ON l.organization_id=d.organization_id AND l.id=d.lease_id AND l.property_id=a.property_id
    AND l.unit_id IS NOT DISTINCT FROM a.unit_id
  JOIN public.tenant_invoices invoice ON invoice.organization_id=a.organization_id AND invoice.id=a.invoice_id
    AND invoice.lease_id=l.id AND invoice.property_id=a.property_id
  WHERE a.organization_id=p_organization_id AND a.id=p_application_id
    AND a.property_id=p_property_id AND b.owner_person_id=p_owner_person_id
    AND (a.unit_id IS NULL OR EXISTS(SELECT 1 FROM public.units u WHERE u.organization_id=a.organization_id
      AND u.property_id=a.property_id AND u.id=a.unit_id))
    AND (a.reversal_of_application_id IS NULL OR EXISTS(
      SELECT 1 FROM public.deposit_rent_applications original
      JOIN public.deposit_rent_owner_bridges ob ON ob.organization_id=original.organization_id AND ob.application_id=original.id
      WHERE original.organization_id=a.organization_id AND original.id=a.reversal_of_application_id
        AND original.id<>a.id AND original.reversal_of_application_id IS NULL
        AND original.lease_deposit_id=a.lease_deposit_id AND original.invoice_id=a.invoice_id
        AND original.property_id=a.property_id AND original.unit_id IS NOT DISTINCT FROM a.unit_id
        AND original.currency=a.currency AND original.amount=a.amount AND original.custodian=a.custodian
        AND ob.owner_person_id=b.owner_person_id AND ob.property_owner_id=b.property_owner_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit statement lineage mismatch' USING ERRCODE='23514';
  END IF;
  IF lineage.original_id IS NOT NULL THEN
    -- Validate original evidence too, not merely a syntactically valid UUID.
    PERFORM * FROM app_private.resolve_owner_event_source(p_organization_id,'deposit_rent_application',lineage.original_id);
  END IF;
  RETURN jsonb_build_object('version',1,'purpose','deposit-statement-display',
    'organizationId',lineage.organization_id,'propertyId',lineage.property_id,
    'ownerPersonId',lineage.owner_person_id,'applicationId',lineage.id,
    'sourceFingerprint',lineage.fingerprint,'leaseId',lineage.lease_id,'unitId',lineage.unit_id,
    'operation',CASE WHEN lineage.original_id IS NULL THEN 'apply' ELSE 'full-reversal' END,
    'originalApplicationId',lineage.original_id);
END; $$;

CREATE FUNCTION public.get_deposit_statement_source(
  p_organization_id uuid,p_property_id uuid,p_owner_person_id uuid,
  p_application_id uuid,p_source_fingerprint text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.deposit_statement_source(p_organization_id,p_property_id,p_owner_person_id,p_application_id,p_source_fingerprint);
$$;
ALTER FUNCTION app_private.deposit_statement_source(uuid,uuid,uuid,uuid,text) OWNER TO postgres;
ALTER FUNCTION public.get_deposit_statement_source(uuid,uuid,uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.deposit_statement_source(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_deposit_statement_source(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.deposit_statement_source(uuid,uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deposit_statement_source(uuid,uuid,uuid,uuid,text) TO authenticated;
