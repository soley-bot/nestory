BEGIN;

-- A confirmed move-out can leave an unpaid rent invoice whose linked fee
-- was already paid out of owner cash. Release that application in the same
-- transaction as the checked invoice void. External payments stay guarded.
CREATE FUNCTION app_private.release_departed_rent_fee(p_org uuid,p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invoice public.tenant_invoices%ROWTYPE;
  fee public.management_fee_occurrences%ROWTYPE;
  cash public.owner_charge_cash_allocations%ROWTYPE;
  owner_line uuid;
  reversal_id uuid;
  actor uuid := auth.uid();
BEGIN
  IF NOT app_private.pilot_rent_posting_admin(p_org) THEN RETURN; END IF;
  SELECT i.* INTO invoice FROM public.tenant_invoices i
    JOIN public.leases l ON l.organization_id=i.organization_id AND l.id=i.lease_id
    WHERE i.organization_id=p_org AND i.id=p_invoice AND i.lifecycle='issued' AND i.voided_at IS NULL
      AND i.generation_source='lease_rules_v1' AND l.status IN ('ended','terminated')
      AND EXISTS (SELECT 1 FROM public.lease_occupancies o WHERE o.organization_id=p_org AND o.lease_id=l.id
        AND o.evidence_state='accepted' AND o.archived_at IS NULL AND o.superseded_by_lease_occupancy_id IS NULL
        AND o.actual_move_out_date<i.billing_period_start)
      AND NOT EXISTS (SELECT 1 FROM public.lease_terms t WHERE t.organization_id=p_org AND t.lease_id=l.id
        AND t.authority_kind='authoritative' AND t.status IN ('active','upcoming','expired','terminated') AND t.archived_at IS NULL
        AND t.start_date<=i.billing_period_end AND t.end_date>=i.billing_period_start)
      AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_lines il WHERE il.organization_id=p_org AND il.invoice_id=i.id AND il.line_type<>'rent')
      AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_payments ip WHERE ip.organization_id=p_org AND ip.invoice_id=i.id)
      AND NOT EXISTS (SELECT 1 FROM public.owner_collection_confirmations oc WHERE oc.organization_id=p_org AND oc.invoice_id=i.id)
    FOR SHARE OF l;
  IF NOT FOUND OR NOT app_private.can_access_property(p_org,invoice.property_id,'finance.correct_records') THEN RETURN; END IF;
  SELECT f.* INTO fee FROM public.management_fee_occurrences f WHERE f.organization_id=p_org AND f.tenant_invoice_id=p_invoice
    AND f.reversal_of_id IS NULL AND f.correction_occurrence_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences r WHERE r.organization_id=p_org AND r.reversal_of_id=f.id) FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT l.id INTO owner_line FROM public.owner_invoice_lines l WHERE l.organization_id=p_org AND l.source_type='management_fee'
    AND l.source_id=fee.id AND l.reversal_of_id IS NULL FOR UPDATE;
  IF owner_line IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.owner_close_series s WHERE s.organization_id=p_org AND s.property_id=invoice.property_id
    AND s.currency=invoice.currency AND s.current_closed_revision_id IS NOT NULL
    AND s.month_start>=least(invoice.billing_period_start,date_trunc('month',fee.fee_date)::date)) THEN
    RAISE EXCEPTION 'owner_close_period_closed' USING ERRCODE='55000';
  END IF;
  FOR cash IN SELECT a.* FROM public.owner_charge_cash_allocations a WHERE a.organization_id=p_org
    AND a.owner_invoice_line_id=owner_line AND a.reversal_of_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations r WHERE r.organization_id=p_org AND r.reversal_of_id=a.id)
    ORDER BY a.allocation_date,a.id FOR UPDATE LOOP
    PERFORM app_private.assert_financial_write_allowed(p_org,cash.allocation_date);
    PERFORM app_private.lock_open_property_financial_month(p_org,invoice.property_id,invoice.currency,cash.allocation_date);
    IF NOT EXISTS (SELECT 1 FROM public.owner_event_allocation_sets s WHERE s.organization_id=p_org
      AND s.source_type='management_fee_occurrence' AND s.source_line_id=fee.id) THEN
      PERFORM public.allocate_owner_event(p_org,'management_fee_occurrence',fee.id,'departed-rent-fee-' || fee.id::text);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.owner_event_allocation_sets s WHERE s.organization_id=p_org
      AND s.source_type='owner_invoice_payment' AND s.source_line_id=cash.id) THEN
      PERFORM public.allocate_owner_event(p_org,'owner_invoice_payment',cash.id,'departed-rent-owner-cash-' || cash.id::text);
    END IF;
    INSERT INTO public.owner_charge_cash_allocations(organization_id,property_id,owner_invoice_line_id,allocation_date,amount,reversal_of_id,created_by)
      VALUES(p_org,invoice.property_id,owner_line,cash.allocation_date,-cash.amount,cash.id,actor) RETURNING id INTO reversal_id;
    PERFORM public.allocate_owner_event(p_org,'reversal',reversal_id,'departed-rent-return-' || cash.id::text);
  END LOOP;
END;
$$;
ALTER FUNCTION app_private.release_departed_rent_fee(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.release_departed_rent_fee(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE
  definition text := replace(pg_get_functiondef('public.void_tenant_invoice_checked(uuid,uuid,date,jsonb,text,text)'::regprocedure),chr(13),'');
  original text := '  v_result := public.correct_tenant_invoice(';
BEGIN
  IF encode(extensions.digest(definition,'sha256'),'hex') <> '8ffa90a272b5319996784adb4a9665a320fd9d43f319eba9465050d69ccb804a'
    OR cardinality(string_to_array(definition,original))<>2 THEN RAISE EXCEPTION 'Unexpected invoice void authority'; END IF;
  EXECUTE replace(definition,original,'  PERFORM app_private.release_departed_rent_fee(p_organization_id,p_invoice_id);' || chr(10) || original);
END;
$migration$;

COMMIT;
