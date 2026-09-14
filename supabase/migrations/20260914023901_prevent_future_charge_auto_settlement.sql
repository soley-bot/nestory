-- Only charges deferred by a new automatic-allocation request enter this queue.
-- Existing Pilot history is not enrolled or rewritten by this migration.
CREATE TABLE app_private.deferred_owner_cash (
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 owner_invoice_line_id uuid NOT NULL,
 eligible_on date NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 last_attempt_at timestamptz,
 last_error_code text,
 PRIMARY KEY (organization_id, owner_invoice_line_id),
 FOREIGN KEY (organization_id, owner_invoice_line_id) REFERENCES public.owner_invoice_lines(organization_id,id),
 FOREIGN KEY (organization_id, property_id) REFERENCES public.properties(organization_id,id)
);
REVOKE ALL ON app_private.deferred_owner_cash FROM PUBLIC, anon, authenticated, service_role;
-- Automatic settlement triggered by a historical receipt must not turn later
-- charges into earlier payments. Explicit, evidenced prepayments are separate.
DO $patch$
DECLARE
  definition text;
  marker text := E'      AND invoice.lifecycle = ''issued''\n      AND app_private.owner_invoice_line_outstanding(';
BEGIN
  SELECT pg_get_functiondef('app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure)
    INTO definition;
  IF strpos(definition, marker) = 0 THEN
    RAISE EXCEPTION 'auto_cash_date_predecessor_changed';
  END IF;
  definition := replace(definition, marker,
    E'      AND invoice.lifecycle = ''issued''\n      AND line.recognized_on <= p_allocation_date\n      AND app_private.owner_invoice_line_outstanding(');
  definition := replace(definition, '  v_available := app_private.property_held_cash_balance(', $insert$
  INSERT INTO app_private.deferred_owner_cash(organization_id,property_id,owner_invoice_line_id,eligible_on)
  SELECT line.organization_id,line.property_id,line.id,line.recognized_on
  FROM public.owner_invoice_lines line JOIN public.owner_invoices invoice
    ON invoice.organization_id=line.organization_id AND invoice.id=line.invoice_id
  WHERE line.organization_id=p_organization_id AND line.property_id=p_property_id
    AND invoice.lifecycle='issued' AND line.recognized_on>p_allocation_date
    AND coalesce(current_setting('app.deferred_owner_cash_only',true),'off')<>'on'
    AND app_private.owner_invoice_line_outstanding(line.organization_id,line.id)>0
  ON CONFLICT DO NOTHING;

  v_available := app_private.property_held_cash_balance($insert$);
  definition := replace(definition, '      AND line.recognized_on <= p_allocation_date', $scope$
      AND line.recognized_on <= p_allocation_date
      AND (coalesce(current_setting('app.deferred_owner_cash_only',true),'off') <> 'on'
        OR EXISTS (SELECT 1 FROM app_private.deferred_owner_cash deferred
          WHERE deferred.organization_id=line.organization_id AND deferred.owner_invoice_line_id=line.id))$scope$);
  EXECUTE definition;
END;
$patch$;

CREATE FUNCTION app_private.run_deferred_owner_cash(p_clock timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE item record; business_day date; applied numeric; processed integer:=0; failed integer:=0;
BEGIN
 IF p_clock IS NULL THEN RAISE EXCEPTION 'deferred_cash_clock_required'; END IF;
 FOR item IN
  SELECT q.organization_id,q.property_id,o.operational_timezone
  FROM app_private.deferred_owner_cash q JOIN public.organizations o ON o.id=q.organization_id
  WHERE q.eligible_on <= (p_clock AT TIME ZONE o.operational_timezone)::date
  GROUP BY q.organization_id,q.property_id,o.operational_timezone
  ORDER BY min(q.last_attempt_at) NULLS FIRST,q.organization_id,q.property_id LIMIT 100
 LOOP
  business_day := (p_clock AT TIME ZONE item.operational_timezone)::date;
  BEGIN
   PERFORM app_private.lock_property_financial_month(item.organization_id,item.property_id,'USD',business_day);
   IF app_private.is_financial_month_locked(item.organization_id,business_day) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE='55000';
   END IF;
   -- The legacy pooled balance is not date-scoped. Fail closed if it could
   -- include a receipt that has not occurred at this processing date.
   IF EXISTS (SELECT 1 FROM public.finance_receipts r
     WHERE r.organization_id=item.organization_id AND r.property_id=item.property_id
       AND r.received_date>business_day AND r.amount>0) THEN
    RAISE EXCEPTION 'future_cash_source_requires_review' USING ERRCODE='23514';
   END IF;
   PERFORM set_config('app.deferred_owner_cash_only','on',true);
   applied := app_private.apply_available_owner_cash(item.organization_id,item.property_id,business_day,NULL);
   PERFORM set_config('app.deferred_owner_cash_only','off',true);
   DELETE FROM app_private.deferred_owner_cash q USING public.owner_invoices i,public.owner_invoice_lines l
   WHERE q.organization_id=item.organization_id AND q.property_id=item.property_id
     AND l.organization_id=q.organization_id AND l.id=q.owner_invoice_line_id
     AND i.organization_id=l.organization_id AND i.id=l.invoice_id
     AND (i.lifecycle<>'issued' OR app_private.owner_invoice_line_outstanding(l.organization_id,l.id)<=0);
   UPDATE app_private.deferred_owner_cash SET last_attempt_at=p_clock,last_error_code=NULL
    WHERE organization_id=item.organization_id AND property_id=item.property_id AND eligible_on<=business_day;
   processed := processed+1;
  EXCEPTION WHEN OTHERS THEN
   -- Per-property subtransaction rolls back every financial effect on error.
   PERFORM set_config('app.deferred_owner_cash_only','off',true);
   UPDATE app_private.deferred_owner_cash SET last_attempt_at=p_clock,last_error_code=SQLSTATE
    WHERE organization_id=item.organization_id AND property_id=item.property_id AND eligible_on<=business_day;
   failed := failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('processed',processed,'failed',failed);
END;
$$;
REVOKE ALL ON FUNCTION app_private.run_deferred_owner_cash(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('nestory-deferred-owner-cash','41 * * * *','SELECT app_private.run_deferred_owner_cash();');
