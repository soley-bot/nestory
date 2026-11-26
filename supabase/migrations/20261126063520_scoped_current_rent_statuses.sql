-- Read one lease-local billing month per visible lease, independent of invoice pagination.
BEGIN;

CREATE FUNCTION app_private.scoped_current_rent_statuses(p_organization_id uuid,p_lease_ids uuid[])
RETURNS TABLE(lease_id uuid,billing_period_start date,status text,invoice_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_lease_ids IS NULL OR cardinality(p_lease_ids)>100 THEN
    RAISE EXCEPTION 'Invalid rent status batch' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  WITH visible_leases AS MATERIALIZED (
    SELECT l.id,l.property_id,l.unit_id
    FROM public.leases l
    JOIN public.properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
    WHERE l.organization_id=p_organization_id AND l.id=ANY(p_lease_ids)
      AND l.archived_at IS NULL AND p.archived_at IS NULL AND l.status IN ('active','notice_given')
      AND app_private.can_access_property(p_organization_id,p.id,'finance.view')
      AND (l.unit_id IS NULL OR EXISTS(SELECT 1 FROM public.units u WHERE u.organization_id=l.organization_id
        AND u.property_id=p.id AND u.id=l.unit_id AND u.archived_at IS NULL))
  ), periods AS MATERIALIZED (
    SELECT l.*,clock.billing_term_id,date_trunc('month',clock.business_date)::date AS month_start
    FROM visible_leases l
    CROSS JOIN LATERAL app_private.resolve_lease_billing_clock(p_organization_id,l.id,now()) clock
  ), charges AS (
    SELECT p.*,i.id AS invoice,i.lifecycle,
      i.property_id=p.property_id AND i.unit_id IS NOT DISTINCT FROM p.unit_id AND EXISTS (
        SELECT 1 FROM public.tenant_invoice_lines line WHERE line.organization_id=p_organization_id
          AND line.invoice_id=i.id AND line.line_type='rent'
      ) AS is_rent_invoice
    FROM periods p LEFT JOIN public.tenant_invoices i ON i.organization_id=p_organization_id
      AND i.lease_id=p.id AND i.billing_period_start=p.month_start
  )
  SELECT c.id,c.month_start,
    CASE WHEN c.invoice IS NOT NULL THEN
      CASE WHEN NOT c.is_rent_invoice THEN 'unknown' WHEN c.lifecycle='void' THEN 'voided' ELSE 'posted' END
    WHEN c.billing_term_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.lease_terms t WHERE t.organization_id=p_organization_id AND t.lease_id=c.id
        AND t.authority_kind='authoritative' AND t.archived_at IS NULL AND t.status IN ('active','upcoming','expired','terminated')
        AND t.start_date < c.month_start + interval '1 month' AND t.end_date >= c.month_start
        AND t.payment_frequency='monthly' AND t.rent_due_day IS NOT NULL
    ) THEN 'setup_needed'
    WHEN app_private.is_financial_month_locked(p_organization_id,c.property_id,c.month_start) THEN 'unknown'
    ELSE 'missing' END,
    CASE WHEN c.is_rent_invoice THEN c.invoice END
  FROM charges c ORDER BY c.id;
END;
$$;

CREATE FUNCTION public.get_scoped_current_rent_statuses(p_organization_id uuid,p_lease_ids uuid[])
RETURNS TABLE(lease_id uuid,billing_period_start date,status text,invoice_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT * FROM app_private.scoped_current_rent_statuses(p_organization_id,p_lease_ids);
$$;
REVOKE ALL ON FUNCTION app_private.scoped_current_rent_statuses(uuid,uuid[]),public.get_scoped_current_rent_statuses(uuid,uuid[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.scoped_current_rent_statuses(uuid,uuid[]),public.get_scoped_current_rent_statuses(uuid,uuid[])
  TO authenticated;
-- The recovery list already comes from the property-authorized base lease table.
-- Its termless leases also need a unit and tenant label in the rent register.
DO $rent_unit_metadata$
DECLARE
  definition text := pg_get_functiondef('app_private.finance_read_context(uuid,uuid)'::regprocedure);
  anchor constant text := '''id'',base.id,''property_id'',base.property_id,''archived_at'',base.archived_at';
BEGIN
  IF cardinality(string_to_array(definition,anchor)) <> 2 THEN
    RAISE EXCEPTION 'Unexpected base lease projection in the finance read context';
  END IF;
  EXECUTE replace(definition,anchor,anchor || ',''unit_id'',base.unit_id,''status'',base.status,''primary_tenant_person_id'',base.primary_tenant_person_id');
END;
$rent_unit_metadata$;
COMMIT;
