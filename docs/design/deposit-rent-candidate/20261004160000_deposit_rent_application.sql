-- LOCAL REVIEW DRAFT: NOT A RELEASE MIGRATION; NEVER EXECUTED.
-- No backfill, reinterpretation of legacy applications, cash receipt creation,
-- Other Income, fee retention, owner entitlement allocation or publication write.
-- SQL compile/concurrency/role tests and the choices in DEPOSIT-REVIEW.md gate
-- promotion to a new forward-only migration through the protected main release.

CREATE TABLE public.deposit_rent_custody_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  lease_deposit_id uuid NOT NULL UNIQUE REFERENCES public.lease_deposits(id),
  liability_account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  custodian text NOT NULL CHECK(custodian IN ('ips','owner')),
  owner_person_id uuid REFERENCES public.people(id),
  confirmed_on date NOT NULL,
  verified_held_amount numeric(14,2) NOT NULL CHECK(verified_held_amount>=0 AND verified_held_amount::text NOT IN ('NaN','Infinity','-Infinity')),
  evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 8 AND 200),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((custodian='owner')=(owner_person_id IS NOT NULL)),
  UNIQUE(organization_id,id)
);
CREATE TABLE public.deposit_rent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  unit_id uuid REFERENCES public.units(id),
  lease_deposit_id uuid NOT NULL REFERENCES public.lease_deposits(id),
  custody_confirmation_id uuid NOT NULL REFERENCES public.deposit_rent_custody_confirmations(id),
  deposit_event_id uuid NOT NULL UNIQUE REFERENCES public.lease_deposit_events(id),
  invoice_id uuid NOT NULL REFERENCES public.tenant_invoices(id),
  settlement_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
  currency public.currency_code NOT NULL,
  liability_account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  custodian text NOT NULL CHECK(custodian IN ('ips','owner')),
  owner_person_id uuid REFERENCES public.people(id),
  reversal_of_application_id uuid UNIQUE REFERENCES public.deposit_rent_applications(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 200),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((custodian='owner')=(owner_person_id IS NOT NULL)),
  CHECK(reversal_of_application_id IS DISTINCT FROM id),
  UNIQUE(organization_id,id,property_id,invoice_id)
);
CREATE TABLE public.deposit_rent_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  application_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL REFERENCES public.tenant_invoice_lines(id),
  amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
  reversal_of_allocation_id uuid UNIQUE REFERENCES public.deposit_rent_allocations(id),
  signed_amount numeric(14,2) GENERATED ALWAYS AS
    (CASE WHEN reversal_of_allocation_id IS NULL THEN amount ELSE -amount END) STORED,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,application_id,property_id,invoice_id)
    REFERENCES public.deposit_rent_applications(organization_id,id,property_id,invoice_id),
  UNIQUE(application_id,invoice_line_id),
  CHECK(reversal_of_allocation_id IS DISTINCT FROM id)
);
CREATE INDEX deposit_rent_line_idx ON public.deposit_rent_allocations(organization_id,invoice_line_id);
CREATE INDEX deposit_rent_scope_idx ON public.deposit_rent_applications(organization_id,property_id,settlement_date);
ALTER TABLE public.deposit_rent_custody_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_rent_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_rent_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deposit_rent_custody_confirmations,public.deposit_rent_applications,
  public.deposit_rent_allocations FROM PUBLIC,anon,authenticated,service_role;
-- Only amount/identity allocation rows need client SELECT for the existing
-- security-invoker balance views. Evidence/reasons stay behind curated readers.
CREATE POLICY deposit_rent_allocations_read ON public.deposit_rent_allocations
FOR SELECT TO authenticated USING(app_private.can_access_property(organization_id,property_id,'finance.view') IS TRUE);
GRANT SELECT ON public.deposit_rent_allocations TO authenticated;
-- The above grant/policy is a NEW-TABLE-only draft choice, not executed here.

CREATE FUNCTION app_private.deposit_rent_authorize(p_org uuid,p_property uuid,p_permission public.organization_permission_key DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_property IS NULL OR app_private.can_access_property(p_org,p_property,'finance.view') IS NOT TRUE
    OR (p_permission IS NOT NULL AND (app_private.can_access_property(p_org,p_property,p_permission) IS NOT TRUE
      OR app_private.can_access_property(p_org,p_property,'leases.change_terms') IS NOT TRUE))
    THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
END; $$;
CREATE FUNCTION app_private.deposit_rent_held(p_org uuid,p_deposit uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(sum(CASE WHEN e.event_type='received' THEN e.amount ELSE -e.amount END),0)
  FROM public.lease_deposit_events e WHERE e.organization_id=p_org AND e.lease_deposit_id=p_deposit
    AND e.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.lease_deposit_events r
      WHERE r.organization_id=p_org AND r.reversal_of_id=e.id);
$$;
CREATE FUNCTION app_private.deposit_rent_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Immutable settlement history; use linked reversal' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER deposit_rent_custody_immutable BEFORE UPDATE OR DELETE ON public.deposit_rent_custody_confirmations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();
CREATE TRIGGER deposit_rent_header_immutable BEFORE UPDATE OR DELETE ON public.deposit_rent_applications
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();
CREATE TRIGGER deposit_rent_allocation_immutable BEFORE UPDATE OR DELETE ON public.deposit_rent_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();

-- Custody is independently attested, not derived from invoice collection route.
-- A single deposit cannot mix IPS/owner custody under this first version.
CREATE FUNCTION public.confirm_deposit_rent_custody(p_org uuid,p_deposit uuid,p_liability_account uuid,p_custodian text,p_owner uuid,
  p_date date,p_expected_held numeric,p_evidence text,p_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.lease_deposits%ROWTYPE; l public.leases%ROWTYPE; claim record; result uuid;
  payload jsonb; replay jsonb; actor uuid:=auth.uid(); locked_property uuid; locked_currency public.currency_code; account_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  SELECT * INTO d FROM public.lease_deposits WHERE organization_id=p_org AND id=p_deposit;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=d.lease_id FOR SHARE;
  PERFORM app_private.deposit_rent_authorize(p_org,l.property_id,'finance.correct_records');
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

-- Shared private transaction body. No actor, branch or privilege flags supplied
-- by callers; auth.uid and existing can_access_property are the authorities.
CREATE FUNCTION app_private.deposit_rent_command(p_org uuid,p_deposit uuid,p_invoice uuid,p_original uuid,
  p_date date,p_allocations jsonb,p_reason text,p_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.lease_deposits%ROWTYPE; l public.leases%ROWTYPE; i public.tenant_invoices%ROWTYPE;
  custody public.deposit_rent_custody_confirmations%ROWTYPE; original public.deposit_rent_applications%ROWTYPE;
  line public.tenant_invoice_lines%ROWTYPE; item jsonb; amount numeric; total numeric:=0;
  locked_property uuid; locked_currency public.currency_code; account_id uuid; result uuid:=gen_random_uuid(); event_id uuid; actor uuid:=auth.uid(); claim record; payload jsonb; replay jsonb;
  operation text:=CASE WHEN p_original IS NULL THEN 'apply_deposit_to_rent' ELSE 'reverse_deposit_rent_application' END;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_original IS NOT NULL THEN
    SELECT * INTO original FROM public.deposit_rent_applications WHERE organization_id=p_org AND id=p_original;
    p_deposit:=original.lease_deposit_id; p_invoice:=original.invoice_id;
  END IF;
  SELECT * INTO i FROM public.tenant_invoices WHERE organization_id=p_org AND id=p_invoice;
  PERFORM app_private.deposit_rent_authorize(p_org,i.property_id,
    CASE WHEN p_original IS NULL THEN 'finance.record_payments'::public.organization_permission_key
      ELSE 'finance.correct_records'::public.organization_permission_key END);
  IF p_date IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 200
    OR length(btrim(coalesce(p_key,''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Date, reason and idempotency key required' USING ERRCODE='22023'; END IF;
  IF p_original IS NULL THEN
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' THEN
      RAISE EXCEPTION 'Explicit allocation array required' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_allocations) x WHERE jsonb_typeof(x)<>'object'
        OR NOT(x?'lineId' AND x?'amount') OR x-'lineId'-'amount'<>'{}'::jsonb)
      OR (SELECT count(*)<>count(DISTINCT x->>'lineId') FROM jsonb_array_elements(p_allocations) x) THEN
      RAISE EXCEPTION 'Unique explicit rent allocations required' USING ERRCODE='22023'; END IF;
    SELECT jsonb_agg(x ORDER BY x->>'lineId') INTO p_allocations FROM jsonb_array_elements(p_allocations) x;
    FOR item IN SELECT x FROM jsonb_array_elements(p_allocations) x LOOP
      IF jsonb_typeof(item->'amount')<>'string' OR coalesce(item->>'amount','')!~'^[0-9]+\.[0-9]{2}$' THEN
        RAISE EXCEPTION 'Amount must be exact cents text' USING ERRCODE='22023'; END IF;
      amount:=(item->>'amount')::numeric;
      IF amount<=0 OR amount>999999999999.99 THEN RAISE EXCEPTION 'Positive bounded amount required' USING ERRCODE='22023'; END IF;
      total:=total+amount;
    END LOOP;
  ELSE total:=original.amount; p_allocations:='[]'::jsonb;
  END IF;
  IF total>999999999999.99 THEN RAISE EXCEPTION 'Amount bound exceeded' USING ERRCODE='22023'; END IF;
  payload:=jsonb_build_object('deposit',p_deposit,'invoice',p_invoice,'original',p_original,'date',p_date,'allocations',p_allocations,'reason',btrim(p_reason));
  replay:=app_private.get_financial_idempotency_replay(p_org,operation,btrim(p_key),actor,payload);
  IF replay IS NOT NULL THEN RETURN (replay->>'applicationId')::uuid; END IF;
  locked_property:=i.property_id; locked_currency:=i.currency;
  PERFORM app_private.lock_property_financial_month(p_org,i.property_id,i.currency,p_date);
  PERFORM app_private.lock_open_property_financial_month(p_org,i.property_id,i.currency,p_date);
  SELECT * INTO STRICT claim FROM app_private.claim_financial_idempotency(p_org,operation,btrim(p_key),actor,payload);
  IF claim.is_replay THEN RETURN (claim.result_ids->>'applicationId')::uuid; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tenant_invoice_payment_v1',p_org,p_invoice),0));
  SELECT * INTO d FROM public.lease_deposits WHERE organization_id=p_org AND id=p_deposit FOR UPDATE;
  IF NOT FOUND OR (p_original IS NULL AND d.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE='23503'; END IF;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=d.lease_id FOR SHARE;
  SELECT * INTO i FROM public.tenant_invoices WHERE organization_id=p_org AND id=p_invoice FOR SHARE;
  IF NOT FOUND OR i.property_id IS DISTINCT FROM locked_property OR i.currency IS DISTINCT FROM locked_currency OR i.lease_id IS DISTINCT FROM l.id OR i.property_id IS DISTINCT FROM l.property_id
    OR i.unit_id IS DISTINCT FROM l.unit_id OR i.currency<>d.currency
    OR (p_original IS NULL AND i.lifecycle<>'issued') THEN
    RAISE EXCEPTION 'Deposit and invoice scope mismatch' USING ERRCODE='23514'; END IF;
  PERFORM app_private.deposit_rent_authorize(p_org,l.property_id,
    CASE WHEN p_original IS NULL THEN 'finance.record_payments'::public.organization_permission_key
      ELSE 'finance.correct_records'::public.organization_permission_key END);
  SELECT * INTO custody FROM public.deposit_rent_custody_confirmations WHERE organization_id=p_org
    AND lease_deposit_id=p_deposit AND property_id=l.property_id;
  IF NOT FOUND OR p_date<custody.confirmed_on OR EXISTS(SELECT 1 FROM public.lease_deposit_events e
    WHERE e.organization_id=p_org AND e.lease_deposit_id=p_deposit AND e.event_date>p_date) THEN
    RAISE EXCEPTION 'Verified custody and non-backdated event order required' USING ERRCODE='23514'; END IF;
  IF p_original IS NULL THEN
    IF total>app_private.deposit_rent_held(p_org,p_deposit) THEN RAISE EXCEPTION 'Insufficient held deposit' USING ERRCODE='22023'; END IF;
    IF total>coalesce((SELECT balance_due FROM public.tenant_invoice_balances WHERE organization_id=p_org AND id=p_invoice),0) THEN
      RAISE EXCEPTION 'Application exceeds invoice outstanding' USING ERRCODE='22023'; END IF;
    FOR item IN SELECT x FROM jsonb_array_elements(p_allocations) x LOOP
      SELECT * INTO line FROM public.tenant_invoice_lines WHERE organization_id=p_org AND id=(item->>'lineId')::uuid FOR SHARE;
      IF NOT FOUND OR line.invoice_id<>p_invoice OR line.line_type<>'rent' OR line.reversal_of_id IS NOT NULL
        OR line.amount<=0 OR EXISTS(SELECT 1 FROM public.tenant_invoice_lines r WHERE r.organization_id=p_org AND r.reversal_of_id=line.id) THEN
        RAISE EXCEPTION 'Active rent line on selected invoice required' USING ERRCODE='23514'; END IF;
      IF (item->>'amount')::numeric>coalesce(app_private.tenant_invoice_line_outstanding(p_org,line.id),0) THEN
        RAISE EXCEPTION 'Application exceeds rent outstanding' USING ERRCODE='22023'; END IF;
    END LOOP;
  ELSE
    SELECT * INTO original FROM public.deposit_rent_applications WHERE organization_id=p_org AND id=p_original FOR UPDATE;
    IF original.reversal_of_application_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.deposit_rent_applications r WHERE r.reversal_of_application_id=p_original)
      OR p_date<original.settlement_date OR app_private.deposit_rent_held(p_org,p_deposit)+total>d.amount THEN
      RAISE EXCEPTION 'Already reversed, reversal chain, earlier date or custody restoration exceeds obligation' USING ERRCODE='23514'; END IF;
  END IF;
  -- Never default/select/create an account. Preserve the explicitly reviewed identity.
  account_id:=custody.liability_account_id;
  IF p_original IS NOT NULL AND original.liability_account_id IS DISTINCT FROM account_id THEN
    RAISE EXCEPTION 'Reversal liability identity mismatch' USING ERRCODE='23514'; END IF;
  IF app_private.resolve_chart_deposit_liability(p_org,account_id,l.property_id) IS DISTINCT FROM account_id THEN
    RAISE EXCEPTION 'Liability identity mismatch' USING ERRCODE='23514'; END IF;
  INSERT INTO public.lease_deposit_events(organization_id,property_id,lease_deposit_id,liability_account_id,event_type,event_date,amount,currency,reference,reversal_of_id,created_by)
  VALUES(p_org,l.property_id,p_deposit,account_id,CASE WHEN p_original IS NULL THEN 'applied' ELSE 'reversed' END,
    p_date,total,d.currency,btrim(p_reason),CASE WHEN p_original IS NULL THEN NULL ELSE original.deposit_event_id END,actor) RETURNING id INTO event_id;
  INSERT INTO public.deposit_rent_applications(id,organization_id,property_id,unit_id,lease_deposit_id,custody_confirmation_id,
    deposit_event_id,invoice_id,settlement_date,amount,currency,liability_account_id,custodian,owner_person_id,reversal_of_application_id,reason,created_by)
  VALUES(result,p_org,l.property_id,l.unit_id,p_deposit,custody.id,event_id,p_invoice,p_date,total,d.currency,account_id,custody.custodian,custody.owner_person_id,p_original,btrim(p_reason),actor);
  IF p_original IS NULL THEN
    INSERT INTO public.deposit_rent_allocations(organization_id,property_id,application_id,invoice_id,invoice_line_id,amount,created_by)
    SELECT p_org,l.property_id,result,p_invoice,(x->>'lineId')::uuid,(x->>'amount')::numeric,actor FROM jsonb_array_elements(p_allocations) x;
  ELSE
    INSERT INTO public.deposit_rent_allocations(organization_id,property_id,application_id,invoice_id,invoice_line_id,amount,reversal_of_allocation_id,created_by)
    SELECT p_org,l.property_id,result,p_invoice,x.invoice_line_id,x.amount,x.id,actor FROM public.deposit_rent_allocations x WHERE x.application_id=p_original AND x.organization_id=p_org;
  END IF;
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_org,actor,'lease',l.id,operation,jsonb_build_object('applicationId',result,'depositEventId',event_id,
    'invoiceId',p_invoice,'amount',total,'date',p_date,'custodian',custody.custodian,'reversalOf',p_original,'externalCashReceived','0.00'));
  PERFORM app_private.complete_financial_idempotency(claim.request_id,p_org,actor,jsonb_build_object('applicationId',result,'depositEventId',event_id));
  RETURN result;
END; $$;
CREATE FUNCTION public.apply_deposit_to_rent(p_org uuid,p_deposit uuid,p_invoice uuid,p_date date,p_allocations jsonb,p_reason text,p_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT app_private.deposit_rent_command(p_org,p_deposit,p_invoice,NULL,p_date,p_allocations,p_reason,p_key);
$$;
CREATE FUNCTION public.reverse_deposit_rent_application(p_org uuid,p_original uuid,p_date date,p_reason text,p_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT app_private.deposit_rent_command(p_org,NULL,NULL,p_original,p_date,NULL,p_reason,p_key);
$$;

-- Deferred event/header/line checks make single-sided legacy reversals fail.
CREATE FUNCTION app_private.deposit_rent_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE app_id uuid; a public.deposit_rent_applications%ROWTYPE; e public.lease_deposit_events%ROWTYPE;
  o public.deposit_rent_applications%ROWTYPE; dep uuid; org uuid; held numeric; prefix_min numeric;
BEGIN
  IF TG_TABLE_NAME='deposit_rent_allocations' THEN app_id:=NEW.application_id;
  ELSIF TG_TABLE_NAME='deposit_rent_applications' THEN app_id:=NEW.id;
  ELSE
    dep:=coalesce(NEW.lease_deposit_id,OLD.lease_deposit_id); org:=coalesce(NEW.organization_id,OLD.organization_id);
    IF EXISTS(SELECT 1 FROM public.deposit_rent_custody_confirmations WHERE organization_id=org AND lease_deposit_id=dep) THEN
      held:=app_private.deposit_rent_held(org,dep);
      IF held<0 OR held>(SELECT amount FROM public.lease_deposits WHERE id=dep AND organization_id=org) THEN
        RAISE EXCEPTION 'Custody balance outside verified obligation' USING ERRCODE='23514'; END IF;
      WITH daily AS (SELECT x.event_date,sum(CASE WHEN x.reversal_of_id IS NULL THEN
        CASE WHEN x.event_type='received' THEN x.amount ELSE -x.amount END
        ELSE CASE WHEN original.event_type='received' THEN -x.amount ELSE x.amount END END) amount
        FROM public.lease_deposit_events x LEFT JOIN public.lease_deposit_events original ON original.id=x.reversal_of_id
        AND original.organization_id=x.organization_id WHERE x.organization_id=org AND x.lease_deposit_id=dep GROUP BY x.event_date)
      SELECT min(running) INTO prefix_min FROM(SELECT sum(amount) OVER(ORDER BY event_date) running FROM daily) p;
      IF prefix_min<0 THEN RAISE EXCEPTION 'Historical custody prefix would become negative' USING ERRCODE='23514'; END IF;
      IF TG_OP<>'DELETE' AND NEW.event_type='applied' AND NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications WHERE deposit_event_id=NEW.id) THEN
        RAISE EXCEPTION 'Verified-custody application requires linked rent settlement' USING ERRCODE='23514'; END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN NULL; END IF;
    SELECT id INTO app_id FROM public.deposit_rent_applications WHERE deposit_event_id=NEW.id;
    IF app_id IS NULL AND NEW.reversal_of_id IS NOT NULL THEN
      SELECT r.id INTO app_id FROM public.deposit_rent_applications original
      LEFT JOIN public.deposit_rent_applications r ON r.reversal_of_application_id=original.id WHERE original.deposit_event_id=NEW.reversal_of_id;
      IF FOUND AND app_id IS NULL THEN RAISE EXCEPTION 'Linked application requires atomic reversal' USING ERRCODE='23514'; END IF;
    END IF;
    IF app_id IS NULL THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO STRICT a FROM public.deposit_rent_applications WHERE id=app_id;
  SELECT * INTO STRICT e FROM public.lease_deposit_events WHERE id=a.deposit_event_id;
  IF e.organization_id<>a.organization_id OR e.property_id<>a.property_id OR e.lease_deposit_id<>a.lease_deposit_id
    OR e.liability_account_id IS DISTINCT FROM a.liability_account_id OR e.event_date<>a.settlement_date OR e.amount<>a.amount OR e.currency<>a.currency
    OR (a.reversal_of_application_id IS NULL AND (e.event_type<>'applied' OR e.reversal_of_id IS NOT NULL))
    OR (SELECT coalesce(sum(amount),0) FROM public.deposit_rent_allocations WHERE application_id=a.id)<>a.amount
    OR NOT EXISTS(SELECT 1 FROM public.deposit_rent_custody_confirmations c WHERE c.id=a.custody_confirmation_id
      AND c.organization_id=a.organization_id AND c.property_id=a.property_id AND c.lease_deposit_id=a.lease_deposit_id
      AND c.liability_account_id=a.liability_account_id AND c.custodian=a.custodian AND c.owner_person_id IS NOT DISTINCT FROM a.owner_person_id)
    OR NOT EXISTS(SELECT 1 FROM public.tenant_invoices i JOIN public.lease_deposits d ON d.organization_id=i.organization_id AND d.lease_id=i.lease_id
      WHERE i.id=a.invoice_id AND i.organization_id=a.organization_id AND i.property_id=a.property_id
      AND i.unit_id IS NOT DISTINCT FROM a.unit_id AND i.currency=a.currency AND d.id=a.lease_deposit_id AND d.currency=a.currency)
    OR EXISTS(SELECT 1 FROM public.deposit_rent_allocations x LEFT JOIN public.tenant_invoice_lines l ON l.id=x.invoice_line_id
      WHERE x.application_id=a.id AND (l.id IS NULL OR l.organization_id<>a.organization_id OR l.invoice_id<>a.invoice_id OR l.line_type<>'rent'))
    THEN RAISE EXCEPTION 'Application source linkage or conservation failed' USING ERRCODE='23514'; END IF;
  IF a.reversal_of_application_id IS NOT NULL THEN
    SELECT * INTO STRICT o FROM public.deposit_rent_applications WHERE id=a.reversal_of_application_id;
    IF o.liability_account_id IS DISTINCT FROM a.liability_account_id OR o.reversal_of_application_id IS NOT NULL OR o.organization_id<>a.organization_id OR o.invoice_id<>a.invoice_id
      OR o.lease_deposit_id<>a.lease_deposit_id OR o.custody_confirmation_id<>a.custody_confirmation_id
      OR o.amount<>a.amount OR e.event_type<>'reversed' OR e.reversal_of_id IS DISTINCT FROM o.deposit_event_id OR a.settlement_date<o.settlement_date
      OR EXISTS(SELECT 1 FROM public.deposit_rent_allocations x LEFT JOIN public.deposit_rent_allocations original ON original.id=x.reversal_of_allocation_id
        WHERE x.application_id=a.id AND (original.id IS NULL OR original.application_id<>o.id OR original.invoice_line_id<>x.invoice_line_id OR original.amount<>x.amount))
      OR (SELECT count(*) FROM public.deposit_rent_allocations WHERE application_id=a.id)<>
        (SELECT count(*) FROM public.deposit_rent_allocations WHERE application_id=o.id)
      THEN RAISE EXCEPTION 'Reversal must restore the exact original custody and allocations' USING ERRCODE='23514'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.deposit_rent_allocations WHERE application_id=a.id AND reversal_of_allocation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Original cannot contain reversal allocations' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER deposit_rent_header_conservation AFTER INSERT ON public.deposit_rent_applications
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_validate();
CREATE CONSTRAINT TRIGGER deposit_rent_allocation_conservation AFTER INSERT ON public.deposit_rent_allocations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_validate();
CREATE CONSTRAINT TRIGGER deposit_rent_custody_conservation AFTER INSERT OR UPDATE OR DELETE ON public.lease_deposit_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_validate();
CREATE FUNCTION app_private.deposit_rent_linked_event_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications WHERE deposit_event_id=OLD.id) THEN
    RAISE EXCEPTION 'Linked custody event is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER deposit_rent_linked_event_immutable BEFORE UPDATE OR DELETE ON public.lease_deposit_events
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_linked_event_immutable();

-- Replace only the forward projection helper; its released migration stays
-- immutable. Existing grants/owner/search path on this function are preserved.
CREATE OR REPLACE FUNCTION app_private.tenant_invoice_line_outstanding(p_organization_id uuid,p_invoice_line_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT CASE WHEN l.reversal_of_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.tenant_invoice_lines r
  WHERE r.organization_id=l.organization_id AND r.reversal_of_id=l.id) THEN 0::numeric(14,2)
ELSE greatest(l.amount
  +coalesce((SELECT sum(x.amount) FROM public.expense_customer_adjustments x WHERE x.organization_id=p_organization_id
    AND x.responsibility='tenant' AND x.tenant_income_item_id=l.income_item_id),0)
  -coalesce((SELECT sum(x.signed_amount) FROM public.finance_receipt_allocations x WHERE x.organization_id=p_organization_id AND x.income_item_id=l.income_item_id),0)
  -coalesce((SELECT sum(x.signed_amount) FROM public.owner_collection_confirmation_allocations x WHERE x.organization_id=p_organization_id
    AND x.invoice_line_id=l.id AND x.settlement_contract_version='owner_collection.v1'),0)
  -coalesce((SELECT sum(x.signed_amount) FROM public.deposit_rent_allocations x WHERE x.organization_id=p_organization_id AND x.invoice_line_id=l.id),0),0)::numeric(14,2) END
FROM public.tenant_invoice_lines l WHERE l.organization_id=p_organization_id AND l.id=p_invoice_line_id;
$$;

-- Preserve every current view column/due-date correction by wrapping its exact
-- current definition, instead of copying an obsolete baseline. Fail on missing
-- contract fields. New settlement amount is separate from both cash columns.
DO $balance_views$
DECLARE body text; columns_sql text; name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['tenant_invoice_balances','tenant_invoice_line_balances'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||name)::regclass AND reloptions @> ARRAY['security_invoker=true']) THEN
      RAISE EXCEPTION 'Balance view security contract changed'; END IF;
    body:=rtrim(pg_get_viewdef(('public.'||name)::regclass,true),E'; \n');
    IF position('deposit_rent_allocations' IN body)>0 THEN RAISE EXCEPTION 'Deposit projection already integrated'; END IF;
    IF name='tenant_invoice_line_balances' THEN
      SELECT string_agg(CASE WHEN attname='balance_due' THEN
        'greatest(legacy.balance_due-coalesce(dep.amount,0),0)::numeric(14,2) AS balance_due'
        ELSE format('legacy.%I',attname) END,',' ORDER BY attnum) INTO columns_sql
      FROM pg_attribute WHERE attrelid=('public.'||name)::regclass AND attnum>0 AND NOT attisdropped;
      IF position(' AS balance_due' IN columns_sql)=0 THEN RAISE EXCEPTION 'Line balance contract changed'; END IF;
      EXECUTE 'CREATE OR REPLACE VIEW public.tenant_invoice_line_balances WITH(security_invoker=true) AS WITH legacy AS ('||body||'),dep AS ('||
        'SELECT organization_id,invoice_line_id,sum(signed_amount)::numeric(14,2) amount FROM public.deposit_rent_allocations GROUP BY organization_id,invoice_line_id)'||
        'SELECT '||columns_sql||',coalesce(dep.amount,0)::numeric(14,2) AS deposit_settled_amount FROM legacy LEFT JOIN dep ON dep.organization_id=legacy.organization_id AND dep.invoice_line_id=legacy.id';
    ELSE
      IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.tenant_invoice_balances'::regclass AND attname IN
        ('balance_due','payment_status','is_overdue','total_amount','lifecycle','due_date','paid_through_ips','collected_by_owner') AND NOT attisdropped)<>8 THEN
        RAISE EXCEPTION 'Invoice balance contract changed'; END IF;
      SELECT string_agg(CASE attname WHEN 'balance_due' THEN
          'greatest(legacy.balance_due-coalesce(dep.amount,0),0)::numeric(14,2) AS balance_due'
        WHEN 'payment_status' THEN 'CASE WHEN legacy.lifecycle=''void'' THEN ''voided'' WHEN legacy.balance_due-coalesce(dep.amount,0)<=0 THEN ''paid'' WHEN legacy.total_amount-legacy.balance_due+coalesce(dep.amount,0)>0 THEN ''partly_paid'' ELSE ''unpaid'' END AS payment_status'
        WHEN 'is_overdue' THEN '(legacy.lifecycle=''issued'' AND legacy.due_date<current_date AND legacy.balance_due-coalesce(dep.amount,0)>0) AS is_overdue'
        ELSE format('legacy.%I',attname) END,',' ORDER BY attnum) INTO columns_sql
      FROM pg_attribute WHERE attrelid='public.tenant_invoice_balances'::regclass AND attnum>0 AND NOT attisdropped;
      EXECUTE 'CREATE OR REPLACE VIEW public.tenant_invoice_balances WITH(security_invoker=true) AS WITH legacy AS ('||body||'),dep AS ('||
        'SELECT organization_id,invoice_id,sum(signed_amount)::numeric(14,2) amount FROM public.deposit_rent_allocations GROUP BY organization_id,invoice_id)'||
        'SELECT '||columns_sql||',coalesce(dep.amount,0)::numeric(14,2) AS deposit_settled_amount FROM legacy LEFT JOIN dep ON dep.organization_id=legacy.organization_id AND dep.invoice_id=legacy.id';
    END IF;
  END LOOP;
END; $balance_views$;

-- Protect the authoritative settlement layers, not tenant payment allocation
-- projections (that would count a receipt twice). Ordinary cash commands must
-- serialize against the new deposit settlement even if their initial check ran
-- earlier. Apply guard to receipts + owner-direct allocations and new originals.
CREATE FUNCTION app_private.deposit_rent_settlement_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.tenant_invoice_lines%ROWTYPE; invoice uuid; amount numeric;
BEGIN
  IF NEW.reversal_of_allocation_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='finance_receipt_allocations' THEN
    SELECT * INTO l FROM public.tenant_invoice_lines WHERE organization_id=NEW.organization_id AND income_item_id=NEW.income_item_id
      AND reversal_of_id IS NULL ORDER BY id LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
  ELSE SELECT * INTO l FROM public.tenant_invoice_lines WHERE organization_id=NEW.organization_id AND id=NEW.invoice_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rent settlement line unavailable' USING ERRCODE='23503'; END IF;
  END IF;
  invoice:=l.invoice_id; amount:=NEW.amount;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tenant_invoice_payment_v1',NEW.organization_id,invoice),0));
  IF (TG_TABLE_NAME='deposit_rent_allocations' OR EXISTS(SELECT 1 FROM public.deposit_rent_allocations x
      WHERE x.organization_id=NEW.organization_id AND x.invoice_line_id=l.id))
    AND (amount>coalesce(app_private.tenant_invoice_line_outstanding(NEW.organization_id,l.id),0)
      OR amount>coalesce((SELECT balance_due FROM public.tenant_invoice_balances WHERE organization_id=NEW.organization_id AND id=invoice),0)) THEN
    RAISE EXCEPTION 'Combined rent settlements exceed outstanding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER deposit_rent_allocation_overpayment BEFORE INSERT ON public.deposit_rent_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_settlement_guard();
CREATE TRIGGER receipt_after_deposit_overpayment BEFORE INSERT ON public.finance_receipt_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_settlement_guard();
CREATE TRIGGER direct_after_deposit_overpayment BEFORE INSERT ON public.owner_collection_confirmation_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_settlement_guard();

-- A correction/void with an active application must first use its full linked
-- reversal. Keep historic rows, never delete/re-enter a financial replacement.
CREATE FUNCTION app_private.deposit_rent_correction_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invoice uuid; target uuid; org uuid;
BEGIN
  org:=coalesce(NEW.organization_id,OLD.organization_id);
  IF TG_TABLE_NAME='tenant_invoices' THEN invoice:=OLD.id;
  ELSIF TG_TABLE_NAME='tenant_invoice_lines' THEN
    invoice:=coalesce(NEW.invoice_id,OLD.invoice_id);
    target:=CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.reversal_of_id,NEW.supersedes_line_id) ELSE OLD.id END;
  ELSE invoice:=coalesce(NEW.tenant_invoice_id,OLD.tenant_invoice_id); END IF;
  IF invoice IS NULL OR (TG_TABLE_NAME='tenant_invoice_lines' AND target IS NULL) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tenant_invoice_payment_v1',org,invoice),0));
  IF EXISTS(SELECT 1 FROM public.deposit_rent_allocations x WHERE x.organization_id=org AND x.invoice_id=invoice
    AND (target IS NULL OR x.invoice_line_id=target) GROUP BY x.invoice_line_id HAVING sum(x.signed_amount)>0) THEN
    RAISE EXCEPTION 'Reverse linked deposit settlement before changing settled rent obligation' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER deposit_rent_line_correction BEFORE INSERT OR UPDATE OF amount,invoice_id,income_item_id,line_type,reversal_of_id,supersedes_line_id OR DELETE ON public.tenant_invoice_lines
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_correction_guard();
CREATE TRIGGER deposit_rent_invoice_correction BEFORE UPDATE OF lifecycle,total_amount,property_id,unit_id,lease_id,currency OR DELETE ON public.tenant_invoices
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_correction_guard();
CREATE TRIGGER deposit_rent_adjustment_correction BEFORE INSERT OR UPDATE OR DELETE ON public.expense_customer_adjustments
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_correction_guard();

-- Narrow root reader, consistent with the existing authorized finance context:
-- derive actor; validate every company/property/unit; STABLE single statement;
-- no private capability, superadmin elevation, old policy rewrite or free text.
CREATE FUNCTION public.get_deposit_rent_report_sources(p_org uuid,p_properties uuid[],p_end date,p_unit uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p uuid; events jsonb; deposits jsonb; applications jsonb; fees jsonb; n integer; packet jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_end IS NULL OR p_properties IS NULL OR cardinality(p_properties) NOT BETWEEN 1 AND 100
    OR array_position(p_properties,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(p_properties) id)<>cardinality(p_properties)
    OR (p_unit IS NOT NULL AND cardinality(p_properties)<>1) THEN
    RAISE EXCEPTION 'Valid bounded report scope required' USING ERRCODE='22023'; END IF;
  FOREACH p IN ARRAY p_properties LOOP PERFORM app_private.deposit_rent_authorize(p_org,p,NULL); END LOOP;
  IF p_unit IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units WHERE organization_id=p_org AND property_id=p_properties[1] AND id=p_unit) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.lease_deposit_events e
    LEFT JOIN public.lease_deposits d ON d.id=e.lease_deposit_id AND d.organization_id=e.organization_id
    LEFT JOIN public.leases l ON l.id=d.lease_id AND l.organization_id=d.organization_id
    WHERE e.organization_id=p_org AND e.property_id=ANY(p_properties) AND e.event_date<=p_end
    AND (l.id IS NULL OR l.property_id IS DISTINCT FROM e.property_id))
    OR EXISTS(SELECT 1 FROM public.management_fee_occurrences f
      LEFT JOIN public.tenant_invoices i ON i.id=f.tenant_invoice_id AND i.organization_id=f.organization_id
      WHERE f.organization_id=p_org AND f.property_id=ANY(p_properties) AND f.fee_date<=p_end
      AND (i.id IS NULL OR i.property_id IS DISTINCT FROM f.property_id)) THEN
    RAISE EXCEPTION 'Source parent scope inconsistent; no partial root set returned' USING ERRCODE='23514'; END IF;
  WITH roots AS (SELECT d.id,d.lease_id,d.amount::text,d.currency,d.status,d.archived_at,l.property_id,l.unit_id,
    c.id custody_confirmation_id,c.custodian,c.owner_person_id,c.confirmed_on FROM public.lease_deposits d
    JOIN public.leases l ON l.id=d.lease_id AND l.organization_id=d.organization_id
    LEFT JOIN public.deposit_rent_custody_confirmations c ON c.lease_deposit_id=d.id AND c.organization_id=d.organization_id
    WHERE d.organization_id=p_org AND l.property_id=ANY(p_properties) AND (p_unit IS NULL OR l.unit_id=p_unit OR l.unit_id IS NULL)
    ORDER BY d.id LIMIT 5001) SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),count(*) INTO deposits,n FROM roots r;
  IF n>5000 THEN RAISE EXCEPTION 'Deposit root cap exceeded; source unavailable' USING ERRCODE='54000'; END IF;
  WITH roots AS (SELECT e.id,e.lease_deposit_id,e.property_id,l.unit_id,e.event_type,e.event_date,e.amount::text,e.currency,e.reversal_of_id
    FROM public.lease_deposit_events e JOIN public.lease_deposits d ON d.id=e.lease_deposit_id AND d.organization_id=e.organization_id
    JOIN public.leases l ON l.id=d.lease_id AND l.organization_id=d.organization_id
    WHERE e.organization_id=p_org AND e.property_id=ANY(p_properties) AND e.property_id=l.property_id
    AND e.event_date<=p_end AND (p_unit IS NULL OR l.unit_id=p_unit OR l.unit_id IS NULL) ORDER BY e.id LIMIT 5001)
    SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),count(*) INTO events,n FROM roots r;
  IF n>5000 THEN RAISE EXCEPTION 'Deposit event cap exceeded; source unavailable' USING ERRCODE='54000'; END IF;
  WITH roots AS (SELECT x.id,x.application_id,a.amount::text application_amount,a.deposit_event_id,a.lease_deposit_id,a.invoice_id,x.invoice_line_id,a.property_id,a.unit_id,
    a.currency,a.settlement_date,a.custodian,a.owner_person_id,x.signed_amount::text,x.reversal_of_allocation_id,a.reversal_of_application_id,
    a.custody_confirmation_id,l.line_type FROM public.deposit_rent_allocations x JOIN public.deposit_rent_applications a
    ON a.id=x.application_id AND a.organization_id=x.organization_id JOIN public.tenant_invoice_lines l
    ON l.id=x.invoice_line_id AND l.organization_id=x.organization_id WHERE a.organization_id=p_org AND a.property_id=ANY(p_properties)
    AND a.settlement_date<=p_end AND (p_unit IS NULL OR a.unit_id=p_unit OR a.unit_id IS NULL) ORDER BY x.id LIMIT 5001)
    SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),count(*) INTO applications,n FROM roots r;
  IF n>5000 THEN RAISE EXCEPTION 'Deposit settlement cap exceeded; source unavailable' USING ERRCODE='54000'; END IF;
  WITH roots AS (SELECT f.id,f.property_id,f.lease_id,f.tenant_invoice_id,i.unit_id,f.fee_date,f.amount::text,f.currency,f.reversal_of_id
    FROM public.management_fee_occurrences f LEFT JOIN public.tenant_invoices i ON i.id=f.tenant_invoice_id AND i.organization_id=f.organization_id
    WHERE f.organization_id=p_org AND f.property_id=ANY(p_properties) AND f.fee_date<=p_end
    AND (p_unit IS NULL OR i.unit_id=p_unit OR i.unit_id IS NULL) ORDER BY f.id LIMIT 5001)
    SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),count(*) INTO fees,n FROM roots r;
  IF n>5000 THEN RAISE EXCEPTION 'Fee root cap exceeded; source unavailable' USING ERRCODE='54000'; END IF;
  packet:=jsonb_build_object('contractVersion','deposit_rent_sources.review.v1','organizationId',p_org,'propertyIds',p_properties,
    'unitId',p_unit,'periodEnd',p_end,'consistency','statement_snapshot','rootCoverageCertified',false,
    'accountingInterpretationCertified',false,'deposits',deposits,'events',events,'allocations',applications,'fees',fees);
  IF octet_length(packet::text)>8388608 THEN RAISE EXCEPTION 'Source packet byte cap exceeded' USING ERRCODE='54000'; END IF;
  RETURN packet;
END; $$;

REVOKE ALL ON FUNCTION app_private.deposit_rent_authorize(uuid,uuid,public.organization_permission_key),app_private.deposit_rent_held(uuid,uuid),
  app_private.deposit_rent_immutable(),app_private.deposit_rent_command(uuid,uuid,uuid,uuid,date,jsonb,text,text),
  app_private.deposit_rent_validate(),app_private.deposit_rent_linked_event_immutable(),app_private.deposit_rent_settlement_guard(),
  app_private.deposit_rent_correction_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.confirm_deposit_rent_custody(uuid,uuid,uuid,text,uuid,date,numeric,text,text),
  public.apply_deposit_to_rent(uuid,uuid,uuid,date,jsonb,text,text),public.reverse_deposit_rent_application(uuid,uuid,date,text,text),
  public.get_deposit_rent_report_sources(uuid,uuid[],date,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Proposed public EXECUTE grants are HELD; compile + role + command + reporting
-- acceptance and explicit security/accounting review must precede granting.
