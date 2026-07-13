CREATE OR REPLACE FUNCTION app_private.reverse_lease_deposit_event(
  p_organization_id uuid, p_event_id uuid, p_event_date date, p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target public.lease_deposit_events%ROWTYPE; new_event_id uuid; held_balance numeric; projected_balance numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO target FROM public.lease_deposit_events WHERE id=p_event_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit event not found'; END IF;
  IF target.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.lease_deposit_events WHERE reversal_of_id=target.id) THEN RAISE EXCEPTION 'Deposit event is already reversed'; END IF;
  SELECT coalesce(sum(CASE WHEN event.event_type='received' THEN event.amount ELSE -event.amount END),0)
  INTO held_balance FROM public.lease_deposit_events event
  WHERE event.organization_id=p_organization_id AND event.lease_deposit_id=target.lease_deposit_id
    AND event.reversal_of_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.lease_deposit_events reversal WHERE reversal.reversal_of_id=event.id);
  projected_balance := held_balance + CASE WHEN target.event_type='received' THEN -target.amount ELSE target.amount END;
  IF projected_balance < 0 THEN RAISE EXCEPTION 'Reversal would create a negative held deposit balance'; END IF;
  INSERT INTO public.lease_deposit_events(organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reference,reversal_of_id,created_by)
  VALUES(target.organization_id,target.property_id,target.lease_deposit_id,'reversed',p_event_date,target.amount,target.currency,NULLIF(trim(coalesce(p_reference,'')),''),target.id,(SELECT auth.uid()))
  RETURNING id INTO new_event_id;
  RETURN new_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_finance_payment_drilldown(
  p_organization_id uuid, p_paid_from date, p_paid_before date,
  p_property_id uuid DEFAULT NULL, p_unit_id uuid DEFAULT NULL,
  p_expense_type text DEFAULT NULL, p_status text DEFAULT NULL,
  p_query text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(expense jsonb, payment_id uuid, paid_date date, allocation_amount numeric,
  payment_reference text, reversal_of_id uuid, total_count bigint, scoped_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT to_jsonb(item) AS expense, payment.id AS payment_id, payment.paid_date,
      allocation.amount AS allocation_amount, payment.reference AS payment_reference,
      payment.reversal_of_id,
      CASE WHEN payment.reversal_of_id IS NULL THEN allocation.amount ELSE -allocation.amount END AS signed_amount
    FROM public.finance_payments payment
    JOIN public.finance_payment_allocations allocation ON allocation.payment_id=payment.id AND allocation.organization_id=payment.organization_id
    JOIN public.finance_expense_items item ON item.id=allocation.expense_item_id AND item.organization_id=allocation.organization_id
    WHERE payment.organization_id=p_organization_id AND payment.paid_date>=p_paid_from AND payment.paid_date<p_paid_before
      AND item.archived_at IS NULL
      AND (p_property_id IS NULL OR payment.property_id=p_property_id)
      AND (p_unit_id IS NULL OR item.unit_id=p_unit_id)
      AND (p_expense_type IS NULL OR item.expense_type=p_expense_type)
      AND (p_status IS NULL OR p_status='paid' OR item.status=p_status)
      AND (coalesce(trim(p_query),'')='' OR concat_ws(' ',item.vendor_label,item.category,item.description,item.reference,payment.reference) ILIKE '%'||trim(p_query)||'%')
  )
  SELECT scoped.expense,scoped.payment_id,scoped.paid_date,scoped.allocation_amount,
    scoped.payment_reference,scoped.reversal_of_id,count(*) OVER (),sum(scoped.signed_amount) OVER ()
  FROM scoped ORDER BY scoped.paid_date DESC,scoped.payment_id DESC
  LIMIT greatest(p_limit,0) OFFSET greatest(p_offset,0);
END $$;

REVOKE ALL ON FUNCTION public.get_finance_payment_drilldown(uuid,date,date,uuid,uuid,text,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_payment_drilldown(uuid,date,date,uuid,uuid,text,text,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_expense_scoped_summary(
  p_organization_id uuid,p_invoice_from date,p_invoice_before date,p_today date,
  p_property_id uuid DEFAULT NULL,p_unit_id uuid DEFAULT NULL,p_expense_type text DEFAULT NULL,
  p_status text DEFAULT NULL,p_query text DEFAULT NULL
) RETURNS TABLE(approved_count bigint,draft_count bigint,overdue_count bigint,posted_total numeric,unposted_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT
    count(*) FILTER(WHERE item.status='approved'),count(*) FILTER(WHERE item.status='draft'),
    count(*) FILTER(WHERE item.due_date<p_today AND item.status IN('draft','approved')),
    coalesce(sum(item.amount) FILTER(WHERE item.status IN('posted','paid')),0),
    coalesce(sum(item.amount) FILTER(WHERE item.status NOT IN('posted','paid')),0)
  FROM public.finance_expense_items item
  WHERE item.organization_id=p_organization_id AND item.archived_at IS NULL
    AND item.invoice_date>=p_invoice_from AND item.invoice_date<p_invoice_before
    AND (p_property_id IS NULL OR item.property_id=p_property_id)
    AND (p_unit_id IS NULL OR item.unit_id=p_unit_id)
    AND (p_expense_type IS NULL OR item.expense_type=p_expense_type)
    AND (p_status IS NULL OR item.status=p_status)
    AND (coalesce(trim(p_query),'')='' OR concat_ws(' ',item.vendor_label,item.category,item.description,item.reference) ILIKE '%'||trim(p_query)||'%');
END $$;
REVOKE ALL ON FUNCTION public.get_finance_expense_scoped_summary(uuid,date,date,date,uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_expense_scoped_summary(uuid,date,date,date,uuid,uuid,text,text,text) TO authenticated;
