CREATE OR REPLACE FUNCTION app_private.reverse_lease_deposit_event(
  p_organization_id uuid, p_event_id uuid, p_event_date date, p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target public.lease_deposit_events%ROWTYPE; locked_deposit_id uuid; new_event_id uuid; held_balance numeric; projected_balance numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT event.lease_deposit_id INTO locked_deposit_id FROM public.lease_deposit_events event WHERE event.id=p_event_id AND event.organization_id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit event not found'; END IF;
  PERFORM 1 FROM public.lease_deposits deposit WHERE deposit.id=locked_deposit_id AND deposit.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease deposit not found'; END IF;
  SELECT * INTO target FROM public.lease_deposit_events WHERE id=p_event_id AND organization_id=p_organization_id AND lease_deposit_id=locked_deposit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit event not found'; END IF;
  IF target.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.lease_deposit_events WHERE reversal_of_id=target.id) THEN RAISE EXCEPTION 'Deposit event is already reversed'; END IF;
  SELECT coalesce(sum(CASE WHEN event.event_type='received' THEN event.amount ELSE -event.amount END),0) INTO held_balance
  FROM public.lease_deposit_events event WHERE event.organization_id=p_organization_id AND event.lease_deposit_id=locked_deposit_id
    AND event.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.lease_deposit_events reversal WHERE reversal.reversal_of_id=event.id);
  projected_balance:=held_balance+CASE WHEN target.event_type='received' THEN -target.amount ELSE target.amount END;
  IF projected_balance<0 THEN RAISE EXCEPTION 'Reversal would create a negative held deposit balance'; END IF;
  INSERT INTO public.lease_deposit_events(organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reference,reversal_of_id,created_by)
  VALUES(target.organization_id,target.property_id,target.lease_deposit_id,'reversed',p_event_date,target.amount,target.currency,NULLIF(trim(coalesce(p_reference,'')),''),target.id,(SELECT auth.uid())) RETURNING id INTO new_event_id;
  RETURN new_event_id;
END $$;

COMMENT ON FUNCTION app_private.reverse_lease_deposit_event(uuid,uuid,date,text) IS
'Serializes deposit mutations by locking lease_deposits before lease_deposit_events, matching record_lease_deposit_event lock ordering.';
