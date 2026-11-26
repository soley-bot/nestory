BEGIN;

CREATE FUNCTION app_private.check_pilot_bulk_rent_month(p_org uuid, p_month date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  control app_private.financial_write_controls%ROWTYPE;
BEGIN
  IF NOT app_private.pilot_rent_posting_admin(p_org) THEN
    RAISE EXCEPTION 'bulk_rent_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO control FROM app_private.financial_write_controls WHERE organization_id = p_org;
  IF NOT FOUND OR control.status <> 'open' THEN
    RAISE EXCEPTION 'financial_writes_frozen' USING ERRCODE = '55000';
  END IF;
  IF p_month IS NULL OR NOT isfinite(p_month) OR p_month <> date_trunc('month', p_month)::date
    OR p_month >= date_trunc('month', app_private.rent_business_date(p_org, now()))::date THEN
    RAISE EXCEPTION 'bulk_rent_choose_past_month' USING ERRCODE = '22023';
  END IF;
  IF p_month < control.financial_start_date THEN
    RAISE EXCEPTION 'financial_date_before_start' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- The review is read-only. At issue time the canonical generator must produce
-- the exact reviewed amounts, recipient and dates before its writes can commit.
CREATE FUNCTION app_private.pilot_bulk_rent_quote(p_org uuid, p_month date, p_lease uuid, p_property uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  lease record;
  terms record;
  term public.lease_terms%ROWTYPE;
  rule public.lease_billing_terms%ROWTYPE;
  invoice public.tenant_invoices%ROWTYPE;
  recipient public.people%ROWTYPE;
  last_day date := (p_month + interval '1 month - 1 day')::date;
  issue_day date;
  rent numeric;
  fee numeric := 0;
  fee_base numeric;
  prorated boolean;
  first_override numeric;
  final_override numeric;
  problem text;
  row_data jsonb;
BEGIN
  SELECT l.id, l.property_id, l.unit_id, l.primary_tenant_person_id, l.status, l.archived_at,
    p.code, p.name, u.unit_number, coalesce(t.display_name, 'Unknown tenant') AS tenant,
    p.archived_at IS NOT NULL OR u.archived_at IS NOT NULL AS archived_location
    INTO lease FROM public.leases l
    JOIN public.properties p ON p.organization_id = l.organization_id AND p.id = l.property_id
    LEFT JOIN public.units u ON u.organization_id = l.organization_id AND u.id = l.unit_id
    LEFT JOIN public.people t ON t.organization_id = l.organization_id AND t.id = l.primary_tenant_person_id
    WHERE l.organization_id = p_org AND l.id = p_lease AND (p_property IS NULL OR l.property_id = p_property);
  IF NOT FOUND THEN RETURN NULL; END IF;
  row_data := jsonb_build_object('leaseId', p_lease, 'property', concat_ws(' · ', lease.code, lease.name),
    'unit', lease.unit_number, 'tenant', lease.tenant);
  SELECT * INTO invoice FROM public.tenant_invoices i
    WHERE i.organization_id = p_org AND i.lease_id = p_lease AND i.billing_period_start = p_month;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.tenant_invoice_lines il WHERE il.organization_id = p_org
      AND il.invoice_id = invoice.id AND il.line_type = 'rent') THEN
      RETURN row_data || jsonb_build_object('status', 'existing', 'invoiceId', invoice.id, 'note',
        concat_ws(' · ', invoice.invoice_number, CASE WHEN invoice.voided_at IS NOT NULL THEN 'Voided' END));
    END IF;
    RETURN row_data || jsonb_build_object('status', 'blocked', 'note', 'An invoice already uses this lease month. Review its charges.', 'invoiceId', invoice.id);
  END IF;

  SELECT min(t.start_date) AS start_date, max(t.end_date) AS end_date, count(*) AS count,
    bool_and(t.payment_frequency = 'monthly') AS monthly, count(DISTINCT t.rent_currency) AS currencies,
    (array_agg(t.id ORDER BY t.start_date, t.term_sequence, t.id))[1] AS opening_term_id
    INTO terms FROM public.lease_terms t
    WHERE t.organization_id = p_org AND t.lease_id = p_lease AND t.authority_kind = 'authoritative'
      AND t.status IN ('active','upcoming','expired','terminated') AND t.archived_at IS NULL
      AND t.start_date <= last_day AND t.end_date >= p_month;
  SELECT * INTO term FROM public.lease_terms WHERE id = terms.opening_term_id;
  SELECT * INTO rule FROM public.lease_billing_terms b
    WHERE b.organization_id = p_org AND b.lease_id = p_lease AND b.archived_at IS NULL
      AND b.rule_source = 'lease_default_v1' AND greatest(p_month, term.start_date) BETWEEN b.effective_from AND b.effective_to
    ORDER BY b.effective_from DESC, b.created_at DESC, b.id DESC LIMIT 1;
  SELECT * INTO recipient FROM public.people WHERE organization_id = p_org AND id = rule.billing_recipient_person_id;
  issue_day := (now() AT TIME ZONE rule.rent_calculation_timezone)::date;
  first_override := CASE WHEN terms.start_date >= p_month THEN rule.first_period_prorated_amount END;
  final_override := CASE WHEN terms.end_date <= last_day THEN rule.final_period_prorated_amount END;
  prorated := terms.start_date > p_month OR terms.end_date < last_day OR first_override IS NOT NULL OR final_override IS NOT NULL;

  problem := CASE
    WHEN lease.archived_at IS NOT NULL OR lease.archived_location OR lease.status NOT IN ('active','notice_given','ended','terminated')
      THEN 'Review the archived or inactive lease.'
    WHEN terms.count = 0 THEN 'Confirm the lease term covering this month.'
    WHEN terms.monthly IS NOT TRUE OR terms.currencies <> 1 THEN 'Confirm monthly terms in one currency.'
    WHEN term.rent_amount <= 0 OR term.rent_amount IS NULL OR term.rent_due_day IS NULL THEN 'Complete the rent amount and due day.'
    WHEN rule.id IS NULL OR rule.charge_through_lease_end IS NOT TRUE OR rule.management_fee_mode IS NULL
      OR rule.management_fee_value IS NULL OR rule.collection_route IS NULL OR rule.rent_calculation_timezone IS NULL
      OR rule.short_month_due_day_rule IS NULL OR rule.lease_start_proration_rule IS NULL OR rule.lease_end_proration_rule IS NULL
      OR rule.mid_period_rent_change_rule IS NULL THEN 'Complete the lease billing and fee setup.'
    WHEN recipient.id IS NULL OR recipient.party_type IS DISTINCT FROM rule.billing_recipient_kind THEN 'Review the billing recipient.'
    WHEN p_month >= date_trunc('month', issue_day)::date THEN 'This month is still current for this lease.'
    WHEN first_override IS NOT NULL AND final_override IS NOT NULL THEN 'Review the two proration overrides on this lease.'
    WHEN EXISTS (SELECT 1 FROM public.financial_month_locks m WHERE m.organization_id = p_org AND m.month_start = p_month AND m.is_locked)
      THEN 'The financial month is locked.'
    WHEN EXISTS (SELECT 1 FROM public.owner_close_series s WHERE s.organization_id = p_org AND s.property_id = lease.property_id
      AND s.currency = term.rent_currency AND s.month_start = p_month AND s.state = 'closed') THEN 'The owner month is closed.'
    WHEN EXISTS (SELECT 1 FROM public.finance_income_items i WHERE i.organization_id = p_org AND i.lease_id = p_lease
      AND i.income_type = 'rent' AND i.rent_billing_period_start = p_month AND i.archived_at IS NULL)
      THEN 'Rent activity already exists for this month. Review the lease ledger.'
  END;
  IF problem IS NOT NULL THEN RETURN row_data || jsonb_build_object('status', 'blocked', 'note', problem); END IF;
  rent := coalesce(first_override, final_override, CASE WHEN prorated THEN
    round(term.rent_amount * (least(terms.end_date, last_day) - greatest(terms.start_date, p_month) + 1) / (last_day - p_month + 1), 2)
    ELSE term.rent_amount END);
  IF rent <= 0 THEN RETURN row_data || jsonb_build_object('status','blocked','note','Review the zero rent for this month.'); END IF;
  IF rule.charge_management_fee_when_active THEN
    fee_base := CASE WHEN prorated AND NOT rule.full_management_fee_during_proration THEN rent ELSE term.rent_amount END;
    fee := CASE rule.management_fee_mode WHEN 'percentage' THEN round(fee_base * rule.management_fee_value / 100, 2)
      WHEN 'flat' THEN round(rule.management_fee_value * fee_base / term.rent_amount, 2) END;
  END IF;
  row_data := row_data || jsonb_build_object('status','ready','rent',rent,'fee',fee,'currency',term.rent_currency,
    'from',greatest(terms.start_date,p_month),'through',least(terms.end_date,last_day),'prorated',prorated,'issueDate',issue_day,
    'recipient',recipient.display_name,'recipientId',recipient.id,'propertyId',lease.property_id,'unitId',lease.unit_id,
    'termId',term.id,'ruleId',rule.id,'route',rule.collection_route,
    'note', CASE WHEN terms.count > 1 THEN 'Multiple terms · opening rate applies' WHEN lease.status IN ('ended','terminated') THEN 'Ended lease' END);
  RETURN row_data || jsonb_build_object('token', md5(jsonb_build_array(p_org,p_month,row_data,lease.primary_tenant_person_id)::text));
END;
$$;

CREATE FUNCTION app_private.preview_pilot_bulk_rent(p_org uuid, p_month date, p_after uuid, p_property uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM app_private.check_pilot_bulk_rent_month(p_org, p_month);
  SELECT coalesce(jsonb_agg(app_private.pilot_bulk_rent_quote(p_org,p_month,selected.id,p_property) ORDER BY selected.id), '[]'::jsonb)
  INTO result FROM (
    SELECT l.id FROM public.leases l WHERE l.organization_id = p_org AND (p_after IS NULL OR l.id > p_after)
      AND (p_property IS NULL OR l.property_id = p_property) AND (
        EXISTS (SELECT 1 FROM public.tenant_invoices i WHERE i.organization_id = p_org AND i.lease_id = l.id AND i.billing_period_start = p_month)
        OR (l.archived_at IS NULL AND l.status IN ('active','notice_given','ended','terminated') AND EXISTS (
          SELECT 1 FROM public.lease_terms t WHERE t.organization_id = p_org AND t.lease_id = l.id AND t.archived_at IS NULL
            AND t.status IN ('active','upcoming','expired','terminated') AND t.start_date < p_month + interval '1 month' AND t.end_date >= p_month))
      ) ORDER BY l.id LIMIT 100
  ) selected;
  RETURN result;
END;
$$;

CREATE FUNCTION app_private.post_pilot_bulk_rent(p_org uuid, p_month date, p_items jsonb, p_property uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  item record;
  quote jsonb;
  issued jsonb;
  invoice public.tenant_invoices%ROWTYPE;
  result jsonb := '[]'::jsonb;
  outcome jsonb;
BEGIN
  PERFORM app_private.check_pilot_bulk_rent_month(p_org,p_month);
  PERFORM app_private.assert_financial_write_allowed(p_org,p_month);
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid rent selection' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) x(id uuid,token text)
    GROUP BY x.id HAVING x.id IS NULL OR count(*) > 1 OR NOT bool_and(coalesce(x.token,'') ~ '^[0-9a-f]{32}$')
  ) THEN RAISE EXCEPTION 'Invalid rent selection' USING ERRCODE='22023'; END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) x(id uuid,token text) ORDER BY x.id LOOP
    BEGIN
      IF NOT pg_try_advisory_xact_lock(hashtextextended(concat_ws(':','lease_derived_rent_v1',p_org,item.id,p_month),0)) THEN
        outcome := jsonb_build_object('status','review','message','Another user is processing this lease. Review it again.');
      ELSE
        -- Use the same month lock as owner close and ordinary generation before rereading the quote.
        PERFORM app_private.lock_financial_month_scope(p_org,NULL,p_month);
        quote := app_private.pilot_bulk_rent_quote(p_org,p_month,item.id,p_property);
        IF quote->>'status' = 'ready' THEN
          PERFORM app_private.lock_property_financial_month(p_org,(quote->>'propertyId')::uuid,(quote->>'currency')::public.currency_code,p_month);
          quote := app_private.pilot_bulk_rent_quote(p_org,p_month,item.id,p_property);
        END IF;
        IF quote->>'status' = 'existing' THEN
          outcome := jsonb_build_object('status','existing','invoiceId',quote->>'invoiceId','message','Already invoiced.');
        ELSIF quote->>'status' IS DISTINCT FROM 'ready' OR quote->>'token' IS DISTINCT FROM item.token THEN
          outcome := jsonb_build_object('status','review','message',coalesce(quote->>'note','Lease details changed. Review the month again.'));
        ELSE
          issued := app_private.try_generate_lease_rent_invoice(p_org,item.id,p_month,(quote->>'issueDate')::date,'manual_recovery',(SELECT auth.uid()));
          IF issued->>'status' = 'generated' THEN
            SELECT * INTO STRICT invoice FROM public.tenant_invoices WHERE organization_id = p_org AND id = (issued->>'invoiceId')::uuid;
            IF invoice.lease_id IS DISTINCT FROM item.id OR invoice.billing_period_start IS DISTINCT FROM p_month
              OR invoice.currency::text IS DISTINCT FROM quote->>'currency' OR invoice.total_amount IS DISTINCT FROM (quote->>'rent')::numeric
              OR invoice.management_fee_amount IS DISTINCT FROM (quote->>'fee')::numeric OR invoice.recipient_label IS DISTINCT FROM quote->>'recipient'
              OR invoice.recipient_person_id IS DISTINCT FROM (quote->>'recipientId')::uuid
              OR invoice.property_id IS DISTINCT FROM (quote->>'propertyId')::uuid OR invoice.unit_id IS DISTINCT FROM (quote->>'unitId')::uuid
              OR invoice.lease_term_id IS DISTINCT FROM (quote->>'termId')::uuid OR invoice.billing_term_id IS DISTINCT FROM (quote->>'ruleId')::uuid
              OR invoice.collection_route::text IS DISTINCT FROM quote->>'route' OR invoice.issue_date IS DISTINCT FROM (quote->>'issueDate')::date
              OR invoice.due_date IS DISTINCT FROM invoice.issue_date THEN
              RAISE EXCEPTION 'bulk_rent_quote_changed' USING ERRCODE='PBR01';
            END IF;
            outcome := jsonb_build_object('status','generated','invoiceId',invoice.id,'message',invoice.invoice_number);
          ELSE
            outcome := jsonb_build_object('status','review','message',coalesce(issued->>'message','Review the lease billing setup.'));
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN SQLSTATE 'PBR01' THEN
      outcome := jsonb_build_object('status','review','message','Billing details changed. Review the month again.');
    END;
    result := result || jsonb_build_array(outcome || jsonb_build_object('leaseId',item.id));
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION public.preview_pilot_bulk_rent(p_org uuid, p_month date, p_after uuid DEFAULT NULL, p_property uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.preview_pilot_bulk_rent(p_org,p_month,p_after,p_property);
$$;
CREATE FUNCTION public.post_pilot_bulk_rent(p_org uuid, p_month date, p_items jsonb, p_property uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.post_pilot_bulk_rent(p_org,p_month,p_items,p_property);
$$;
REVOKE ALL ON FUNCTION app_private.check_pilot_bulk_rent_month(uuid,date),
  app_private.pilot_bulk_rent_quote(uuid,date,uuid,uuid),
  app_private.preview_pilot_bulk_rent(uuid,date,uuid,uuid), public.preview_pilot_bulk_rent(uuid,date,uuid,uuid),
  app_private.post_pilot_bulk_rent(uuid,date,jsonb,uuid), public.post_pilot_bulk_rent(uuid,date,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.preview_pilot_bulk_rent(uuid,date,uuid,uuid), public.preview_pilot_bulk_rent(uuid,date,uuid,uuid),
  app_private.post_pilot_bulk_rent(uuid,date,jsonb,uuid), public.post_pilot_bulk_rent(uuid,date,jsonb,uuid) TO authenticated;
COMMIT;
