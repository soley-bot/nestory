-- Reject a future attestation before idempotency claims or immutable custody writes.
-- Use the existing organization business-date authority. CREATE OR REPLACE keeps
-- the checked function identity, owner and approved execution ACL unchanged.
CREATE OR REPLACE FUNCTION public.confirm_deposit_rent_custody(p_org uuid,p_deposit uuid,p_liability_account uuid,p_custodian text,p_owner uuid,
  p_date date,p_expected_held numeric,p_evidence text,p_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.lease_deposits%ROWTYPE; l public.leases%ROWTYPE; claim record; result uuid;
  payload jsonb; replay jsonb; actor uuid:=auth.uid(); locked_property uuid; locked_currency public.currency_code; account_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  SELECT * INTO d FROM public.lease_deposits WHERE organization_id=p_org AND id=p_deposit;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=d.lease_id FOR SHARE;
  PERFORM app_private.deposit_rent_authorize(p_org,l.property_id,'finance.correct_records');
  IF p_date > app_private.rent_business_date(p_org,pg_catalog.statement_timestamp()) THEN
    RAISE EXCEPTION 'Custody verification date cannot be in the future' USING ERRCODE='22023';
  END IF;
  IF p_date IS NULL OR p_custodian IS NULL OR p_custodian NOT IN ('ips','owner')
    OR (p_custodian='owner') IS DISTINCT FROM (p_owner IS NOT NULL)
    OR p_expected_held IS NULL OR p_expected_held::text IN ('NaN','Infinity','-Infinity')
    OR p_expected_held<0 OR p_expected_held>999999999999.99 OR p_expected_held<>round(p_expected_held,2)
    OR length(btrim(coalesce(p_evidence,''))) NOT BETWEEN 8 AND 200
    OR length(btrim(coalesce(p_key,''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Exact held amount and explicit custody evidence required' USING ERRCODE='22023'; END IF;
  payload:=jsonb_build_object('deposit',p_deposit,'custodian',p_custodian,'owner',p_owner,
    'account',p_liability_account,'date',p_date,'held',p_expected_held,'evidence',btrim(p_evidence));
  replay:=app_private.get_financial_idempotency_replay(p_org,'confirm_deposit_rent_custody',btrim(p_key),actor,payload);
  IF replay IS NOT NULL THEN RETURN (replay->>'confirmationId')::uuid; END IF;
  locked_property:=l.property_id; locked_currency:=d.currency;
  PERFORM app_private.lock_property_financial_month(p_org,l.property_id,d.currency,p_date);
  PERFORM app_private.lock_open_property_financial_month(p_org,l.property_id,d.currency,p_date);
  SELECT * INTO STRICT claim FROM app_private.claim_financial_idempotency(p_org,'confirm_deposit_rent_custody',btrim(p_key),actor,payload);
  IF claim.is_replay THEN RETURN (claim.result_ids->>'confirmationId')::uuid; END IF;
  SELECT * INTO d FROM public.lease_deposits WHERE organization_id=p_org AND id=p_deposit FOR UPDATE;
  IF NOT FOUND OR d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE='23503'; END IF;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=d.lease_id FOR SHARE;
  IF l.property_id IS DISTINCT FROM locked_property OR d.currency IS DISTINCT FROM locked_currency THEN
    RAISE EXCEPTION 'Deposit scope changed; retry after refresh' USING ERRCODE='40001'; END IF;
  PERFORM app_private.deposit_rent_authorize(p_org,l.property_id,'finance.correct_records');
  IF p_expected_held<>app_private.deposit_rent_held(p_org,p_deposit)
    OR EXISTS(SELECT 1 FROM public.lease_deposit_events e WHERE e.organization_id=p_org AND e.lease_deposit_id=p_deposit
      AND (e.event_date>p_date OR e.event_type='applied')) THEN
    RAISE EXCEPTION 'Custody changed or unlinked legacy application requires separate review' USING ERRCODE='23514'; END IF;
  IF p_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.property_owners o WHERE o.organization_id=p_org
    AND o.property_id=l.property_id AND o.person_id=p_owner AND o.archived_at IS NULL
    AND o.started_on<=p_date AND (o.ended_on IS NULL OR p_date<o.ended_on)) THEN
    RAISE EXCEPTION 'Owner custody identity outside effective property roster' USING ERRCODE='23514'; END IF;
  account_id:=app_private.resolve_chart_deposit_liability(p_org,p_liability_account,l.property_id);
  INSERT INTO public.deposit_rent_custody_confirmations(organization_id,property_id,lease_deposit_id,liability_account_id,custodian,
    owner_person_id,confirmed_on,verified_held_amount,evidence_reference,created_by)
  VALUES(p_org,l.property_id,p_deposit,account_id,p_custodian,p_owner,p_date,p_expected_held,btrim(p_evidence),actor) RETURNING id INTO result;
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_org,actor,'lease',l.id,'deposit_rent_custody_confirmed',jsonb_build_object('confirmationId',result,'custodian',p_custodian,'held',p_expected_held));
  PERFORM app_private.complete_financial_idempotency(claim.request_id,p_org,actor,jsonb_build_object('confirmationId',result));
  RETURN result;
END; $$;
