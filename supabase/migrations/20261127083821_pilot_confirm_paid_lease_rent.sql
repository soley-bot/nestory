BEGIN;

-- Use the same lease quote for issuance and reclassification. Only the latter
-- can exclude its own invoice from the existing-invoice check.
DO $migration$
DECLARE
  definition text := replace(pg_get_functiondef('app_private.pilot_bulk_rent_quote(uuid,date,uuid,uuid)'::regprocedure),chr(13),'');
BEGIN
  IF encode(extensions.digest(definition,'sha256'),'hex') <> 'c17681b3999157a86e81e2666c69c25b4f749fe46bc4852f6829013886a9e839' THEN
    RAISE EXCEPTION 'Unexpected Pilot rent quote definition';
  END IF;
  definition := replace(definition,
    'app_private.pilot_bulk_rent_quote(p_org uuid, p_month date, p_lease uuid, p_property uuid)',
    'app_private.pilot_lease_rent_quote(p_org uuid, p_month date, p_lease uuid, p_property uuid, p_review_invoice uuid)');
  EXECUTE replace(definition,'AND i.billing_period_start = p_month;',
    'AND i.billing_period_start = p_month AND i.id IS DISTINCT FROM p_review_invoice;');
END;
$migration$;
REVOKE ALL ON FUNCTION app_private.pilot_lease_rent_quote(uuid,date,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION app_private.pilot_bulk_rent_quote(p_org uuid,p_month date,p_lease uuid,p_property uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.pilot_lease_rent_quote(p_org,p_month,p_lease,p_property,NULL);
$$;

CREATE FUNCTION app_private.review_paid_lease_rent(p_org uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invoice public.tenant_invoices%ROWTYPE;
  source record;
  quote jsonb;
  review jsonb;
BEGIN
  IF NOT app_private.pilot_rent_posting_admin(p_org) THEN
    RAISE EXCEPTION 'paid_rent_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO invoice FROM public.tenant_invoices WHERE organization_id=p_org AND id=p_invoice;
  IF NOT FOUND OR NOT app_private.can_access_property(p_org,invoice.property_id,'finance.correct_records') THEN
    RAISE EXCEPTION 'paid_rent_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.check_pilot_bulk_rent_month(p_org,invoice.billing_period_start);
  IF invoice.lifecycle <> 'issued' OR invoice.voided_at IS NOT NULL OR invoice.generation_source IS NOT NULL
    OR invoice.collection_route <> 'through_ips' OR invoice.total_amount <= 0 THEN
    RAISE EXCEPTION 'paid_rent_not_eligible' USING ERRCODE='22023';
  END IF;

  SELECT line.id AS line_id, line.finance_category_id, line.customer_label, line.recognized_on,
    income.id AS income_id, allocation.id AS allocation_id, payment.id AS payment_id,
    payment.receipt_number, payment.received_date, receipt.id AS cash_receipt_id
  INTO source
  FROM public.tenant_invoice_lines line
  JOIN public.finance_categories category ON category.organization_id=line.organization_id AND category.id=line.finance_category_id
  JOIN public.finance_account_category_links mapping ON mapping.organization_id=category.organization_id AND mapping.category_id=category.id
  JOIN public.finance_accounts account ON account.organization_id=mapping.organization_id AND account.id=mapping.account_id AND account.system_role='rental_income'
  JOIN public.finance_income_items income ON income.organization_id=line.organization_id AND income.id=line.income_item_id
  JOIN public.tenant_invoice_payment_allocations allocation ON allocation.organization_id=line.organization_id
    AND allocation.invoice_id=line.invoice_id AND allocation.invoice_line_id=line.id AND allocation.income_item_id=income.id
  JOIN public.tenant_invoice_payments payment ON payment.organization_id=allocation.organization_id
    AND payment.invoice_id=allocation.invoice_id AND payment.id=allocation.payment_id
  JOIN public.finance_receipts receipt ON receipt.organization_id=allocation.organization_id AND receipt.id=allocation.finance_receipt_id
  WHERE line.organization_id=p_org AND line.invoice_id=p_invoice AND line.line_type='other'
    AND category.namespace='tenant_billing'
    AND income.income_type='other' AND income.rent_billing_period_start IS NULL AND income.archived_at IS NULL
    AND income.status='received' AND income.lease_id=invoice.lease_id AND income.property_id=invoice.property_id
    AND income.unit_id IS NOT DISTINCT FROM invoice.unit_id AND income.ledger_entry_id IS NULL
    AND line.correction_occurrence_id IS NULL AND income.correction_occurrence_id IS NULL
    AND line.amount=invoice.total_amount AND income.amount_due=line.amount AND income.amount_received=line.amount
    AND allocation.signed_amount=line.amount AND allocation.reversal_of_allocation_id IS NULL
    AND payment.reversal_of_id IS NULL AND payment.amount=line.amount AND payment.currency=invoice.currency
    AND receipt.reversal_of_id IS NULL AND receipt.amount=line.amount AND receipt.currency=invoice.currency
    AND payment.received_date=receipt.received_date AND payment.received_date=income.received_date
    AND payment.received_date BETWEEN invoice.billing_period_start AND invoice.billing_period_end
    AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_lines l WHERE l.organization_id=p_org AND l.invoice_id=p_invoice AND l.id<>line.id)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_payments p WHERE p.organization_id=p_org AND p.invoice_id=p_invoice AND p.id<>payment.id)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_payment_allocations a WHERE a.organization_id=p_org AND a.invoice_id=p_invoice AND a.id<>allocation.id)
    AND NOT EXISTS (SELECT 1 FROM public.finance_receipts r WHERE r.organization_id=p_org AND r.reversal_of_id=receipt.id)
    AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences f WHERE f.organization_id=p_org AND f.tenant_invoice_id=p_invoice)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_corrections c WHERE c.organization_id=p_org AND c.tenant_invoice_id=p_invoice)
    AND NOT EXISTS (SELECT 1 FROM public.owner_event_allocation_sets s WHERE s.organization_id=p_org
      AND s.source_type='tenant_rent_receipt' AND s.source_line_id=allocation.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'paid_rent_not_eligible' USING ERRCODE='22023'; END IF;
  quote := app_private.pilot_lease_rent_quote(p_org,invoice.billing_period_start,invoice.lease_id,invoice.property_id,p_invoice);
  IF quote->>'status' IS DISTINCT FROM 'ready' OR (quote->>'rent')::numeric IS DISTINCT FROM invoice.total_amount
    OR quote->>'currency' IS DISTINCT FROM invoice.currency::text OR quote->>'route' IS DISTINCT FROM invoice.collection_route::text
    OR (quote->>'recipientId')::uuid IS DISTINCT FROM invoice.recipient_person_id
    OR (quote->>'unitId')::uuid IS DISTINCT FROM invoice.unit_id
    OR (quote->>'ruleId')::uuid IS DISTINCT FROM invoice.billing_term_id
    OR (quote->>'from')::date IS DISTINCT FROM invoice.billing_period_start OR (quote->>'through')::date IS DISTINCT FROM invoice.billing_period_end THEN
    RAISE EXCEPTION 'paid_rent_lease_mismatch' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.owner_close_series s WHERE s.organization_id=p_org AND s.property_id=invoice.property_id
    AND s.currency=invoice.currency AND s.current_closed_revision_id IS NOT NULL
    AND s.month_start>=least(invoice.billing_period_start,date_trunc('month',source.recognized_on)::date)) THEN
    RAISE EXCEPTION 'paid_rent_closed' USING ERRCODE='55000';
  END IF;
  review := jsonb_build_object('invoiceId',p_invoice,'month',invoice.billing_period_start,'rent',invoice.total_amount,
    'fee',(quote->>'fee')::numeric,'currency',invoice.currency,'receipt',source.receipt_number,'receivedDate',source.received_date,
    'paymentId',source.payment_id,'allocationId',source.allocation_id,'cashReceiptId',source.cash_receipt_id,'incomeId',source.income_id,
    'lineId',source.line_id,'oldCategoryId',source.finance_category_id,'oldLabel',source.customer_label,'recognizedOn',source.recognized_on);
  RETURN review || jsonb_build_object('token',md5(jsonb_build_array(quote->>'token',review)::text));
END;
$$;

CREATE FUNCTION app_private.confirm_paid_lease_rent(p_org uuid,p_invoice uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invoice public.tenant_invoices%ROWTYPE;
  rule public.lease_billing_terms%ROWTYPE;
  review jsonb;
  completed jsonb;
  fee_id uuid;
  actor uuid := auth.uid();
  previous_context text := current_setting('app.rent_generation_context',true);
  day date;
BEGIN
  IF NOT app_private.pilot_rent_posting_admin(p_org) THEN RAISE EXCEPTION 'paid_rent_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO invoice FROM public.tenant_invoices WHERE organization_id=p_org AND id=p_invoice;
  IF NOT FOUND OR NOT app_private.can_access_property(p_org,invoice.property_id,'finance.correct_records') THEN
    RAISE EXCEPTION 'paid_rent_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.assert_financial_write_allowed(p_org,invoice.billing_period_start);
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','lease_derived_rent_v1',p_org,invoice.lease_id,invoice.billing_period_start),0));
  SELECT * INTO STRICT invoice FROM public.tenant_invoices WHERE organization_id=p_org AND id=p_invoice FOR UPDATE;
  SELECT l.new_values INTO completed FROM public.activity_logs l WHERE l.organization_id=p_org AND l.entity_type='tenant_invoice'
    AND l.entity_id=p_invoice AND l.action='confirmed_monthly_rent' AND l.new_values->>'token'=p_token;
  IF FOUND THEN RETURN completed; END IF;
  PERFORM 1 FROM public.tenant_invoice_lines WHERE organization_id=p_org AND invoice_id=p_invoice FOR UPDATE;
  PERFORM 1 FROM public.tenant_invoice_payments WHERE organization_id=p_org AND invoice_id=p_invoice FOR UPDATE;
  PERFORM 1 FROM public.finance_income_items i JOIN public.tenant_invoice_lines l ON l.organization_id=i.organization_id AND l.income_item_id=i.id
    WHERE l.organization_id=p_org AND l.invoice_id=p_invoice FOR UPDATE OF i;
  review := app_private.review_paid_lease_rent(p_org,p_invoice);
  FOR day IN SELECT DISTINCT proposed FROM unnest(ARRAY[invoice.billing_period_start,invoice.issue_date,
    (review->>'recognizedOn')::date,(review->>'receivedDate')::date]) proposed ORDER BY proposed LOOP
    PERFORM app_private.assert_financial_write_allowed(p_org,day);
    PERFORM app_private.lock_financial_month_scope(p_org,NULL,day);
    PERFORM app_private.lock_open_property_financial_month(p_org,invoice.property_id,invoice.currency,day);
  END LOOP;
  SELECT * INTO STRICT rule FROM public.lease_billing_terms WHERE organization_id=p_org AND id=invoice.billing_term_id FOR SHARE;
  review := app_private.review_paid_lease_rent(p_org,p_invoice);
  IF p_token IS DISTINCT FROM review->>'token' THEN RAISE EXCEPTION 'paid_rent_changed' USING ERRCODE='40001'; END IF;

  PERFORM app_private.set_finance_settlement_context(true);
  PERFORM set_config('app.rent_generation_context','lease-derived-v1',true);
  UPDATE public.finance_income_items SET income_type='rent',rent_billing_period_start=invoice.billing_period_start,updated_by=actor
    WHERE organization_id=p_org AND id=(review->>'incomeId')::uuid;
  PERFORM set_config('app.rent_generation_context',coalesce(previous_context,''),true);
  PERFORM app_private.set_finance_settlement_context(false);
  UPDATE public.tenant_invoice_lines SET line_type='rent',customer_label='Rent',finance_category_id=NULL
    WHERE organization_id=p_org AND id=(review->>'lineId')::uuid;
  IF (review->>'fee')::numeric > 0 THEN
    INSERT INTO public.management_fee_occurrences(organization_id,property_id,lease_id,tenant_invoice_id,billing_term_id,
      fee_date,amount,currency,fee_mode,fee_value,settlement_status,created_by)
    VALUES(p_org,invoice.property_id,invoice.lease_id,p_invoice,rule.id,invoice.billing_period_start,
      (review->>'fee')::numeric,invoice.currency,rule.management_fee_mode,rule.management_fee_value,'owner_due',actor) RETURNING id INTO fee_id;
    PERFORM public.allocate_owner_event(p_org,'management_fee_occurrence',fee_id,'paid-rent-fee-' || p_invoice::text);
  END IF;
  PERFORM public.allocate_owner_event(p_org,'tenant_rent_receipt',(review->>'allocationId')::uuid,'paid-rent-receipt-' || p_invoice::text);
  completed := review || jsonb_build_object('feeId',fee_id);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
  VALUES(p_org,actor,'tenant_invoice',p_invoice,'confirmed_monthly_rent',
    jsonb_build_object('lineType','other','incomeType','other','label',review->'oldLabel','categoryId',review->'oldCategoryId'),completed);
  RETURN completed;
END;
$$;

CREATE FUNCTION public.preview_paid_lease_rent(p_org uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.review_paid_lease_rent(p_org,p_invoice); $$;
CREATE FUNCTION public.confirm_paid_lease_rent(p_org uuid,p_invoice uuid,p_token text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.confirm_paid_lease_rent(p_org,p_invoice,p_token); $$;
REVOKE ALL ON FUNCTION public.preview_paid_lease_rent(uuid,uuid),public.confirm_paid_lease_rent(uuid,uuid,text),
  app_private.review_paid_lease_rent(uuid,uuid),app_private.confirm_paid_lease_rent(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.preview_paid_lease_rent(uuid,uuid),public.confirm_paid_lease_rent(uuid,uuid,text),
  app_private.review_paid_lease_rent(uuid,uuid),app_private.confirm_paid_lease_rent(uuid,uuid,text) TO authenticated;

COMMIT;
