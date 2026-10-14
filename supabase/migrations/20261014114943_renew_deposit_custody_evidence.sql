-- Renew explicit evidence without editing original custody or financial history.
-- No inferred attestation/backfill, identity change, new grant or new cash.
CREATE TABLE app_private.deposit_rent_custody_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  custody_confirmation_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 1000),
  confirmed_on date NOT NULL,
  verified_held_amount numeric(14,2) NOT NULL CHECK (verified_held_amount >= 0 AND verified_held_amount::text NOT IN ('NaN','Infinity','-Infinity')),
  net_applied_amount numeric(14,2) NOT NULL CHECK (net_applied_amount >= 0 AND net_applied_amount::text NOT IN ('NaN','Infinity','-Infinity')),
  events_hash text NOT NULL CHECK (events_hash ~ '^[a-f0-9]{64}$'),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 8 AND 200),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id,custody_confirmation_id) REFERENCES public.deposit_rent_custody_confirmations(organization_id,id),
  UNIQUE (custody_confirmation_id,revision),
  UNIQUE (organization_id,id)
);
CREATE TABLE app_private.deposit_rent_application_attestations (
  application_id uuid PRIMARY KEY REFERENCES public.deposit_rent_applications(id),
  organization_id uuid NOT NULL,
  attestation_id uuid NOT NULL,
  FOREIGN KEY (organization_id,attestation_id) REFERENCES app_private.deposit_rent_custody_attestations(organization_id,id)
);
ALTER TABLE app_private.deposit_rent_custody_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.deposit_rent_application_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.deposit_rent_custody_attestations,app_private.deposit_rent_application_attestations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deposit_custody_attestation_immutable BEFORE UPDATE OR DELETE ON app_private.deposit_rent_custody_attestations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();
CREATE TRIGGER deposit_application_attestation_immutable BEFORE UPDATE OR DELETE ON app_private.deposit_rent_application_attestations
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();
CREATE TRIGGER privileged_email_step_up_enforcement BEFORE INSERT OR UPDATE OR DELETE ON app_private.deposit_rent_custody_attestations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();
CREATE TRIGGER privileged_email_step_up_enforcement BEFORE INSERT OR UPDATE OR DELETE ON app_private.deposit_rent_application_attestations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();

-- Exclude only linked rent application/reversal events. Receipts, refunds,
-- retentions and their reversals remain in the exact covered event set, even
-- when backdated or offsetting one another to leave the same nominal balance.
CREATE FUNCTION app_private.deposit_rent_custody_evidence(p_org uuid,p_deposit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE events jsonb; net numeric;
BEGIN
  IF (SELECT count(*) FROM public.lease_deposit_events WHERE organization_id=p_org AND lease_deposit_id=p_deposit)>5000
    OR (SELECT count(*) FROM public.deposit_rent_applications WHERE organization_id=p_org AND lease_deposit_id=p_deposit)>1000 THEN
    RAISE EXCEPTION 'Custody evidence exceeds source cap' USING ERRCODE='54000'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) INTO events
  FROM public.lease_deposit_events e WHERE e.organization_id=p_org AND e.lease_deposit_id=p_deposit
    AND NOT EXISTS (SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=e.organization_id
      AND a.lease_deposit_id=e.lease_deposit_id AND a.deposit_event_id=e.id);
  IF octet_length(events::text)>8388608 THEN RAISE EXCEPTION 'Custody evidence exceeds byte cap' USING ERRCODE='54000'; END IF;
  SELECT coalesce(sum(CASE WHEN reversal_of_application_id IS NULL THEN amount ELSE -amount END),0) INTO net
  FROM public.deposit_rent_applications WHERE organization_id=p_org AND lease_deposit_id=p_deposit;
  IF net<0 OR net>999999999999.99 THEN RAISE EXCEPTION 'Custody application balance invalid' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('eventsHash',app_private.canonical_financial_payload_hash(events),'netApplied',net);
END; $$;
CREATE FUNCTION app_private.deposit_rent_custody_current(p_org uuid,p_deposit uuid,p_date date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.deposit_rent_custody_confirmations%ROWTYPE; a app_private.deposit_rent_custody_attestations%ROWTYPE; evidence jsonb;
BEGIN
  SELECT * INTO c FROM public.deposit_rent_custody_confirmations WHERE organization_id=p_org AND lease_deposit_id=p_deposit;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO a FROM app_private.deposit_rent_custody_attestations WHERE organization_id=p_org AND custody_confirmation_id=c.id ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND OR p_date IS NULL OR p_date<a.confirmed_on THEN RETURN false; END IF;
  evidence:=app_private.deposit_rent_custody_evidence(p_org,p_deposit);
  RETURN a.events_hash=evidence->>'eventsHash'
    AND app_private.deposit_rent_held(p_org,p_deposit)=a.verified_held_amount+a.net_applied_amount-(evidence->>'netApplied')::numeric;
END; $$;

-- The command has already locked the deposit row before inserting its header.
-- This last write guard runs for direct RPCs as well as journal execution and
-- atomically rolls back event/header/claim on stale evidence. Preserve original
-- evidence on full reversal; renewal never relabels an earlier application.
-- Keep the trigger VOLATILE: its SELECT sees the newly inserted header before
-- the STABLE evidence helpers take their shared statement snapshot.
CREATE FUNCTION app_private.bind_deposit_rent_custody_attestation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attestation uuid;
BEGIN
  IF NEW.reversal_of_application_id IS NULL THEN
    IF app_private.deposit_rent_custody_current(NEW.organization_id,NEW.lease_deposit_id,NEW.settlement_date) IS NOT TRUE THEN
      RAISE EXCEPTION 'Deposit activity changed; renew custody evidence before applying rent' USING ERRCODE='23514'; END IF;
    SELECT id INTO STRICT attestation FROM app_private.deposit_rent_custody_attestations
      WHERE organization_id=NEW.organization_id AND custody_confirmation_id=NEW.custody_confirmation_id ORDER BY revision DESC LIMIT 1;
  ELSE
    SELECT attestation_id INTO attestation FROM app_private.deposit_rent_application_attestations
      WHERE organization_id=NEW.organization_id AND application_id=NEW.reversal_of_application_id;
    -- Existing pre-release history remains reversible without inferring evidence.
    IF attestation IS NULL THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO app_private.deposit_rent_application_attestations(application_id,organization_id,attestation_id)
    VALUES(NEW.id,NEW.organization_id,attestation);
  RETURN NEW;
END; $$;
CREATE TRIGGER bind_deposit_rent_custody_attestation AFTER INSERT ON public.deposit_rent_applications
FOR EACH ROW EXECUTE FUNCTION app_private.bind_deposit_rent_custody_attestation();
REVOKE ALL ON FUNCTION app_private.deposit_rent_custody_evidence(uuid,uuid),app_private.deposit_rent_custody_current(uuid,uuid,date),
  app_private.bind_deposit_rent_custody_attestation() FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.confirm_deposit_rent_custody(p_org uuid,p_deposit uuid,p_liability_account uuid,p_custodian text,p_owner uuid,
  p_date date,p_expected_held numeric,p_evidence text,p_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.lease_deposits%ROWTYPE; l public.leases%ROWTYPE; claim record; result uuid;
  payload jsonb; replay jsonb; actor uuid:=auth.uid(); locked_property uuid; locked_currency public.currency_code; account_id uuid; existing public.deposit_rent_custody_confirmations%ROWTYPE; evidence jsonb; revision integer; attestation uuid; expected_fingerprint text; latest_confirmed_on date;
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
      AND (e.event_date>p_date OR e.event_type='applied' AND NOT EXISTS (
        SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=p_org AND a.deposit_event_id=e.id))) THEN
    RAISE EXCEPTION 'Custody changed or unlinked legacy application requires separate review' USING ERRCODE='23514'; END IF;
  IF p_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.property_owners o WHERE o.organization_id=p_org
    AND o.property_id=l.property_id AND o.person_id=p_owner AND o.archived_at IS NULL
    AND o.started_on<=p_date AND (o.ended_on IS NULL OR p_date<o.ended_on)) THEN
    RAISE EXCEPTION 'Owner custody identity outside effective property roster' USING ERRCODE='23514'; END IF;
  SELECT * INTO existing FROM public.deposit_rent_custody_confirmations WHERE organization_id=p_org AND lease_deposit_id=p_deposit;
  SELECT a.confirmed_on INTO latest_confirmed_on FROM app_private.deposit_rent_custody_attestations a
    WHERE a.organization_id=p_org AND a.custody_confirmation_id=existing.id ORDER BY a.revision DESC LIMIT 1;
  IF existing.id IS NOT NULL AND (existing.custodian IS DISTINCT FROM p_custodian OR existing.owner_person_id IS DISTINCT FROM p_owner
    OR existing.liability_account_id IS DISTINCT FROM p_liability_account
    OR p_date<greatest(existing.confirmed_on,latest_confirmed_on)) THEN
    RAISE EXCEPTION 'Renew evidence using the original custody identities and a non-earlier date' USING ERRCODE='23514'; END IF;
  -- New product keys bind the displayed checked snapshot. Plain historical keys
  -- remain valid only for first confirmation and original idempotent replay.
  IF btrim(p_key) ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}:[a-f0-9]{64}$' THEN expected_fingerprint:=split_part(btrim(p_key),':',2);
  ELSIF existing.id IS NOT NULL THEN RAISE EXCEPTION 'Renew custody from a fresh checked snapshot' USING ERRCODE='23514'; END IF;
  IF expected_fingerprint IS NOT NULL AND (public.get_local_deposit_rent_candidates(p_org,l.id)->>'fingerprint') IS DISTINCT FROM expected_fingerprint THEN
    RAISE EXCEPTION 'Deposit snapshot changed; reload before confirming custody' USING ERRCODE='23514'; END IF;
  account_id:=app_private.resolve_chart_deposit_liability(p_org,p_liability_account,l.property_id);
  IF existing.id IS NULL THEN
  INSERT INTO public.deposit_rent_custody_confirmations(organization_id,property_id,lease_deposit_id,liability_account_id,custodian,
    owner_person_id,confirmed_on,verified_held_amount,evidence_reference,created_by)
  VALUES(p_org,l.property_id,p_deposit,account_id,p_custodian,p_owner,p_date,p_expected_held,btrim(p_evidence),actor) RETURNING id INTO result;
  ELSE result:=existing.id; END IF;
  evidence:=app_private.deposit_rent_custody_evidence(p_org,p_deposit);
  SELECT coalesce(max(a.revision),0)+1 INTO revision FROM app_private.deposit_rent_custody_attestations a WHERE a.organization_id=p_org AND a.custody_confirmation_id=result;
  IF revision>1000 THEN RAISE EXCEPTION 'Custody attestation cap exceeded' USING ERRCODE='54000'; END IF;
  INSERT INTO app_private.deposit_rent_custody_attestations(organization_id,custody_confirmation_id,revision,confirmed_on,
    verified_held_amount,net_applied_amount,events_hash,evidence_reference,created_by)
  VALUES(p_org,result,revision,p_date,p_expected_held,(evidence->>'netApplied')::numeric,evidence->>'eventsHash',btrim(p_evidence),actor) RETURNING id INTO attestation;
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_org,actor,'lease',l.id,'deposit_rent_custody_confirmed',jsonb_build_object('confirmationId',result,'attestationId',attestation,'revision',revision,'custodian',p_custodian,'held',p_expected_held));
  PERFORM app_private.complete_financial_idempotency(claim.request_id,p_org,actor,jsonb_build_object('confirmationId',result));
  RETURN result;
END; $$;


CREATE OR REPLACE FUNCTION public.get_local_deposit_rent_candidates(p_organization_id uuid,p_lease_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.leases%ROWTYPE; prop public.properties%ROWTYPE; actor uuid:=auth.uid(); today date;
  deposit_ids uuid[]; invoice_ids uuid[]; application_ids uuid[]; event_ids uuid[]; set_ids uuid[];
  deposits jsonb; invoices jsonb; applications jsonb; census jsonb; packet jsonb; source_hash text; lease_label text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_organization_id IS NULL OR p_lease_id IS NULL THEN RAISE EXCEPTION 'Explicit lease scope required' USING ERRCODE='22023'; END IF;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_organization_id AND id=p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease outside authorized scope' USING ERRCODE='42501'; END IF;
  IF app_private.has_org_permission(p_organization_id,'leases.view') IS NOT TRUE OR app_private.has_org_permission(p_organization_id,'finance.view') IS NOT TRUE
    OR app_private.can_access_property(p_organization_id,l.property_id,'leases.view') IS NOT TRUE
    OR app_private.can_access_property(p_organization_id,l.property_id,'finance.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Both existing lease and finance property authority required' USING ERRCODE='42501'; END IF;
  PERFORM public.get_lease_read_context(p_organization_id,ARRAY[p_lease_id]);
  PERFORM public.get_finance_read_context(p_organization_id,l.property_id);
  SELECT * INTO STRICT prop FROM public.properties WHERE organization_id=p_organization_id AND id=l.property_id;
  IF l.unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units u WHERE u.organization_id=p_organization_id AND u.id=l.unit_id AND u.property_id=l.property_id) THEN
    RAISE EXCEPTION 'Unit parent inconsistent' USING ERRCODE='23514'; END IF;
  SELECT left(p.display_name||' - '||prop.name,120) INTO lease_label FROM public.people p WHERE p.organization_id=p_organization_id AND p.id=l.primary_tenant_person_id;
  IF lease_label IS NULL THEN RAISE EXCEPTION 'Lease tenant parent missing' USING ERRCODE='23514'; END IF;
  today:=app_private.rent_business_date(p_organization_id);
  IF (SELECT count(*) FROM public.lease_deposits WHERE organization_id=p_organization_id AND lease_id=p_lease_id)>100 THEN
    RAISE EXCEPTION 'Candidate root cap exceeded' USING ERRCODE='54000'; END IF;
  SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO deposit_ids FROM public.lease_deposits WHERE organization_id=p_organization_id AND lease_id=p_lease_id;
  -- Historical paid/void invoices are validated below without occupying the
  -- operation packet. Include every currently payable invoice and every invoice
  -- referenced by deposit application history, including full-reversal sources.
  SELECT coalesce(array_agg(i.id ORDER BY i.id),'{}'::uuid[]) INTO invoice_ids
    FROM public.tenant_invoices i
    LEFT JOIN public.tenant_invoice_balances balance ON balance.organization_id=i.organization_id AND balance.id=i.id
    WHERE i.organization_id=p_organization_id AND i.lease_id=p_lease_id
      AND (i.lifecycle='issued' AND (balance.id IS NULL OR balance.balance_due>0)
        OR EXISTS(SELECT 1 FROM public.deposit_rent_applications a
          WHERE a.organization_id=p_organization_id AND a.invoice_id=i.id));
  IF cardinality(deposit_ids)>100 OR cardinality(invoice_ids)>1000 THEN RAISE EXCEPTION 'Candidate root cap exceeded' USING ERRCODE='54000'; END IF;
  -- Selected-parent events cannot escape validation via a corrupted stored property.
  IF EXISTS(SELECT 1 FROM public.lease_deposit_events e LEFT JOIN public.lease_deposits d ON d.organization_id=e.organization_id AND d.id=e.lease_deposit_id
      LEFT JOIN public.leases parent ON parent.organization_id=d.organization_id AND parent.id=d.lease_id
      WHERE e.organization_id=p_organization_id AND (d.lease_id=p_lease_id OR e.property_id=l.property_id)
        AND (parent.id IS NULL OR parent.property_id<>e.property_id OR d.currency<>e.currency
          OR e.reversal_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lease_deposit_events original WHERE original.organization_id=e.organization_id AND original.id=e.reversal_of_id
            AND original.lease_deposit_id=e.lease_deposit_id AND original.currency=e.currency AND original.amount=e.amount AND original.event_date<=e.event_date AND original.reversal_of_id IS NULL AND original.event_type<>'reversed')))
    OR EXISTS(SELECT 1 FROM public.tenant_invoices i WHERE i.organization_id=p_organization_id AND i.lease_id=p_lease_id AND (i.property_id<>l.property_id OR i.unit_id IS DISTINCT FROM l.unit_id OR i.currency<>'USD'))
    OR EXISTS(SELECT 1 FROM public.deposit_rent_custody_confirmations c LEFT JOIN public.lease_deposits d ON d.organization_id=c.organization_id AND d.id=c.lease_deposit_id
      LEFT JOIN public.leases custody_parent ON custody_parent.organization_id=d.organization_id AND custody_parent.id=d.lease_id
      WHERE c.organization_id=p_organization_id AND (d.lease_id=p_lease_id OR c.property_id=l.property_id)
        AND (d.id IS NULL OR custody_parent.id IS NULL OR custody_parent.property_id IS DISTINCT FROM c.property_id OR c.property_id<>l.property_id OR NOT EXISTS(SELECT 1 FROM public.finance_accounts account WHERE account.organization_id=c.organization_id AND account.id=c.liability_account_id
          AND account.archived_at IS NULL AND account.account_class='liability' AND account.account_subtype='current_liability' AND account.use_for_lease_deposits AND (account.property_id IS NULL OR account.property_id=l.property_id)))) THEN
    RAISE EXCEPTION 'Candidate parent/currency evidence inconsistent' USING ERRCODE='23514'; END IF;
  -- Reversal rows intentionally have no income_item_id; validate their original
  -- and correction lineage separately. All lines retain their own exact scope.
  IF EXISTS(SELECT 1 FROM public.tenant_invoice_lines line
      LEFT JOIN public.tenant_invoices i ON i.organization_id=line.organization_id AND i.id=line.invoice_id
      LEFT JOIN public.finance_income_items income ON income.organization_id=line.organization_id AND income.id=line.income_item_id
      LEFT JOIN public.tenant_invoice_lines original ON original.organization_id=line.organization_id AND original.id=line.reversal_of_id
      LEFT JOIN public.tenant_invoice_lines superseded ON superseded.organization_id=line.organization_id AND superseded.id=line.supersedes_line_id
      LEFT JOIN public.tenant_invoice_corrections correction ON correction.organization_id=line.organization_id AND correction.id=line.correction_occurrence_id
      WHERE line.organization_id=p_organization_id AND (i.lease_id=p_lease_id OR income.lease_id=p_lease_id OR original.invoice_id=ANY(invoice_ids) OR superseded.invoice_id=ANY(invoice_ids))
        AND (i.id IS NULL OR i.lease_id IS DISTINCT FROM p_lease_id
          OR line.property_id IS DISTINCT FROM i.property_id OR line.unit_id IS DISTINCT FROM i.unit_id OR line.currency IS DISTINCT FROM i.currency
          OR line.reversal_of_id IS NULL AND (
            line.amount<=0 OR income.id IS NULL OR income.lease_id IS DISTINCT FROM p_lease_id OR income.property_id IS DISTINCT FROM l.property_id
            OR income.unit_id IS DISTINCT FROM l.unit_id OR income.currency IS DISTINCT FROM i.currency
            OR line.property_id IS DISTINCT FROM income.property_id OR line.unit_id IS DISTINCT FROM income.unit_id OR line.currency IS DISTINCT FROM income.currency
            OR line.supersedes_line_id IS NULL AND line.correction_occurrence_id IS NOT NULL
            OR line.supersedes_line_id IS NOT NULL AND (superseded.id IS NULL OR superseded.id=line.id OR superseded.reversal_of_id IS NOT NULL
              OR superseded.invoice_id IS DISTINCT FROM line.invoice_id OR superseded.property_id IS DISTINCT FROM line.property_id
              OR superseded.unit_id IS DISTINCT FROM line.unit_id OR superseded.currency IS DISTINCT FROM line.currency OR superseded.line_type IS DISTINCT FROM line.line_type
              OR correction.id IS NULL OR correction.action<>'historical_rent' OR correction.tenant_invoice_id IS DISTINCT FROM line.invoice_id
              OR correction.target_invoice_line_id IS DISTINCT FROM superseded.id OR correction.property_id IS DISTINCT FROM line.property_id
              OR correction.unit_id IS DISTINCT FROM line.unit_id OR correction.currency IS DISTINCT FROM line.currency
              OR income.supersedes_income_item_id IS DISTINCT FROM superseded.income_item_id OR income.correction_occurrence_id IS DISTINCT FROM correction.id
              OR NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines reversal WHERE reversal.organization_id=line.organization_id
                AND reversal.reversal_of_id=superseded.id AND reversal.invoice_id=line.invoice_id AND reversal.correction_occurrence_id=correction.id)))
          OR line.reversal_of_id IS NOT NULL AND (
            line.income_item_id IS NOT NULL OR line.supersedes_line_id IS NOT NULL OR original.id IS NULL OR original.id=line.id OR original.reversal_of_id IS NOT NULL
            OR original.invoice_id IS DISTINCT FROM line.invoice_id OR original.property_id IS DISTINCT FROM line.property_id
            OR original.unit_id IS DISTINCT FROM line.unit_id OR original.currency IS DISTINCT FROM line.currency OR original.line_type IS DISTINCT FROM line.line_type
            OR line.amount IS DISTINCT FROM -original.amount OR line.recognized_on IS DISTINCT FROM original.recognized_on
            OR correction.id IS NULL OR correction.tenant_invoice_id IS DISTINCT FROM line.invoice_id OR correction.property_id IS DISTINCT FROM line.property_id
            OR correction.unit_id IS DISTINCT FROM line.unit_id OR correction.currency IS DISTINCT FROM line.currency
            OR (correction.action='void' AND correction.target_invoice_line_id IS NOT NULL)
            OR (correction.action IN ('line_correction','historical_rent') AND correction.target_invoice_line_id IS DISTINCT FROM original.id)
            OR correction.action NOT IN ('void','line_correction','historical_rent')))) THEN
    RAISE EXCEPTION 'Invoice line parent/correction evidence inconsistent' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.lease_deposit_events WHERE organization_id=p_organization_id AND lease_deposit_id=ANY(deposit_ids))>5000
    OR (SELECT count(*) FROM public.deposit_rent_applications a LEFT JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
      LEFT JOIN public.tenant_invoices i ON i.organization_id=a.organization_id AND i.id=a.invoice_id
      WHERE a.organization_id=p_organization_id AND (a.lease_deposit_id=ANY(deposit_ids) OR a.invoice_id=ANY(invoice_ids) OR a.property_id=l.property_id AND (d.id IS NULL OR i.id IS NULL)))>1000 THEN
    RAISE EXCEPTION 'Candidate source cap exceeded' USING ERRCODE='54000'; END IF;
  SELECT coalesce(array_agg(e.id ORDER BY e.id),'{}'::uuid[]) INTO event_ids FROM public.lease_deposit_events e WHERE e.organization_id=p_organization_id AND e.lease_deposit_id=ANY(deposit_ids);
  SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}'::uuid[]) INTO application_ids FROM public.deposit_rent_applications a
    LEFT JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
    LEFT JOIN public.tenant_invoices i ON i.organization_id=a.organization_id AND i.id=a.invoice_id
    WHERE a.organization_id=p_organization_id AND (a.lease_deposit_id=ANY(deposit_ids) OR a.invoice_id=ANY(invoice_ids) OR a.property_id=l.property_id AND (d.id IS NULL OR i.id IS NULL));
  IF cardinality(event_ids)>5000 OR cardinality(application_ids)>1000
    OR (SELECT count(*) FROM public.tenant_invoice_lines WHERE organization_id=p_organization_id AND invoice_id=ANY(invoice_ids))>1000
    OR (SELECT count(*) FROM public.deposit_rent_allocations WHERE organization_id=p_organization_id AND (application_id=ANY(application_ids) OR invoice_id=ANY(invoice_ids)))>5000 THEN
    RAISE EXCEPTION 'Candidate source cap exceeded' USING ERRCODE='54000'; END IF;
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications a LEFT JOIN public.lease_deposits d ON d.organization_id=a.organization_id AND d.id=a.lease_deposit_id
      LEFT JOIN public.tenant_invoices i ON i.organization_id=a.organization_id AND i.id=a.invoice_id
      LEFT JOIN public.lease_deposit_events e ON e.organization_id=a.organization_id AND e.id=a.deposit_event_id
      LEFT JOIN public.deposit_rent_custody_confirmations c ON c.organization_id=a.organization_id AND c.id=a.custody_confirmation_id
      LEFT JOIN public.deposit_rent_applications original ON original.organization_id=a.organization_id AND original.id=a.reversal_of_application_id
      WHERE a.id=ANY(application_ids) AND (d.id IS NULL OR i.id IS NULL OR e.id IS NULL OR c.id IS NULL OR d.lease_id<>p_lease_id OR i.lease_id<>p_lease_id
        OR a.property_id<>l.property_id OR a.unit_id IS DISTINCT FROM l.unit_id OR a.currency<>d.currency OR a.currency<>i.currency
        OR c.lease_deposit_id<>d.id OR c.property_id<>l.property_id OR c.liability_account_id<>a.liability_account_id OR c.custodian<>a.custodian OR c.owner_person_id IS DISTINCT FROM a.owner_person_id
        OR (SELECT coalesce(sum(x.amount),0) FROM public.deposit_rent_allocations x WHERE x.organization_id=a.organization_id AND x.application_id=a.id)<>a.amount
        OR e.lease_deposit_id<>d.id OR e.amount<>a.amount OR e.event_date<>a.settlement_date
        OR (a.reversal_of_application_id IS NULL AND e.event_type<>'applied')
        OR (a.reversal_of_application_id IS NOT NULL AND (original.id IS NULL OR original.reversal_of_application_id IS NOT NULL OR original.lease_deposit_id<>d.id OR original.invoice_id<>i.id
          OR original.amount<>a.amount OR e.event_type<>'reversed' OR e.reversal_of_id IS DISTINCT FROM original.deposit_event_id))))
    OR EXISTS(SELECT 1 FROM public.lease_deposit_events e WHERE e.id=ANY(event_ids) AND (e.event_type='applied'
        OR EXISTS(SELECT 1 FROM public.lease_deposit_events original WHERE original.id=e.reversal_of_id AND original.event_type='applied'))
      AND NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=e.organization_id AND a.deposit_event_id=e.id))
    OR EXISTS(SELECT 1 FROM public.deposit_rent_allocations x LEFT JOIN public.deposit_rent_applications a ON a.organization_id=x.organization_id AND a.id=x.application_id
      LEFT JOIN public.tenant_invoice_lines line ON line.organization_id=x.organization_id AND line.id=x.invoice_line_id
      LEFT JOIN public.deposit_rent_allocations original ON original.organization_id=x.organization_id AND original.id=x.reversal_of_allocation_id
      WHERE x.organization_id=p_organization_id AND (x.application_id=ANY(application_ids) OR x.invoice_id=ANY(invoice_ids))
        AND (a.id IS NULL OR line.id IS NULL OR x.property_id<>l.property_id OR x.invoice_id<>a.invoice_id OR line.invoice_id<>x.invoice_id OR line.line_type<>'rent'
          OR a.reversal_of_application_id IS NULL AND x.reversal_of_allocation_id IS NOT NULL
          OR a.reversal_of_application_id IS NOT NULL AND (original.id IS NULL OR original.application_id<>a.reversal_of_application_id OR original.invoice_line_id<>x.invoice_line_id OR original.amount<>x.amount))) THEN
    RAISE EXCEPTION 'Application/reversal parent evidence inconsistent' USING ERRCODE='23514'; END IF;
  PERFORM resolved.source_id FROM public.deposit_rent_applications a CROSS JOIN LATERAL app_private.resolve_owner_event_source(p_organization_id,'deposit_rent_application',a.id) resolved WHERE a.id=ANY(application_ids);
  IF (SELECT count(*) FROM public.owner_event_allocation_sets s WHERE s.organization_id=p_organization_id
    AND (s.source_line_id=ANY(event_ids) OR s.source_type='deposit_rent_application' AND s.source_line_id=ANY(application_ids)))>6000 THEN
    RAISE EXCEPTION 'Candidate owner source cap exceeded' USING ERRCODE='54000'; END IF;
  SELECT coalesce(array_agg(s.id ORDER BY s.id),'{}'::uuid[]) INTO set_ids FROM public.owner_event_allocation_sets s WHERE s.organization_id=p_organization_id
    AND (s.source_line_id=ANY(event_ids) OR s.source_type='deposit_rent_application' AND s.source_line_id=ANY(application_ids));
  IF cardinality(set_ids)>6000 OR (SELECT count(*) FROM public.owner_event_owner_allocations WHERE organization_id=p_organization_id AND allocation_set_id=ANY(set_ids))>6000
    OR (SELECT count(*) FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id WHERE m.organization_id=p_organization_id AND o.allocation_set_id=ANY(set_ids))>12000
    OR (SELECT count(*) FROM public.property_owners WHERE organization_id=p_organization_id AND property_id=l.property_id)>1000 THEN
    RAISE EXCEPTION 'Candidate owner source cap exceeded' USING ERRCODE='54000'; END IF;
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications a JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id
      CROSS JOIN LATERAL (SELECT CASE WHEN a.reversal_of_application_id IS NULL THEN a.amount ELSE -a.amount END signed) effect
      WHERE a.id=ANY(application_ids) AND (
        (SELECT count(*) FROM public.owner_event_owner_allocations o WHERE o.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id)<>1
        OR b.custody_signed_amount<>-effect.signed OR b.ips_held_signed_amount<>(CASE WHEN a.custodian='ips' THEN effect.signed ELSE 0 END)
        OR (SELECT count(*) FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
          WHERE m.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id)<>(CASE WHEN a.custodian='ips' THEN 2 ELSE 1 END)
        OR (SELECT coalesce(sum(m.signed_amount),0) FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
          WHERE m.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id AND m.component='security_deposit_custody')<>-effect.signed
        OR (SELECT coalesce(sum(m.signed_amount),0) FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
          WHERE m.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id AND m.component='ips_held_owner_cash')<>(CASE WHEN a.custodian='ips' THEN effect.signed ELSE 0 END)
        OR EXISTS(SELECT 1 FROM public.owner_component_movements m JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
          LEFT JOIN public.owner_component_movements original ON original.organization_id=m.organization_id AND original.id=m.reversal_of_movement_id
          LEFT JOIN public.owner_event_owner_allocations original_owner ON original_owner.organization_id=original.organization_id AND original_owner.id=original.owner_event_owner_allocation_id
          LEFT JOIN public.deposit_rent_owner_bridges original_bridge ON original_bridge.organization_id=original_owner.organization_id AND original_bridge.allocation_set_id=original_owner.allocation_set_id
          WHERE m.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id AND (m.property_id<>a.property_id OR m.owner_person_id<>b.owner_person_id OR m.currency<>a.currency OR m.event_date<>a.settlement_date
            OR a.reversal_of_application_id IS NOT NULL AND (original.id IS NULL OR original_bridge.application_id IS DISTINCT FROM a.reversal_of_application_id OR original.signed_amount<>-m.signed_amount OR original.component<>m.component OR original.movement_order<>m.movement_order))))) THEN
    RAISE EXCEPTION 'Existing application owner bridge conservation/lineage failure' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.lease_deposits d WHERE d.id=ANY(deposit_ids) AND (d.currency<>'USD' OR app_private.deposit_rent_held(p_organization_id,d.id)<0 OR app_private.deposit_rent_held(p_organization_id,d.id)>d.amount))
    OR (SELECT count(*) FROM public.financial_month_locks WHERE organization_id=p_organization_id AND is_locked AND (branch_id IS NULL OR prop.branch_id IS NULL OR branch_id=prop.branch_id))>1000 THEN
    RAISE EXCEPTION 'Held custody or month inventory inconsistent/unbounded' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements m ON m.organization_id=c.organization_id AND m.id=c.source_movement_id
      JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id WHERE c.organization_id=p_organization_id AND o.allocation_set_id=ANY(set_ids))>12000 THEN
    RAISE EXCEPTION 'Candidate consumption source cap exceeded' USING ERRCODE='54000'; END IF;
  IF EXISTS(SELECT 1 FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements m ON m.organization_id=c.organization_id AND m.id=c.source_movement_id
      JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
      LEFT JOIN public.owner_component_movements consumer ON consumer.organization_id=c.organization_id AND consumer.id=c.consumer_movement_id
      LEFT JOIN public.owner_event_owner_allocations consumer_owner ON consumer_owner.organization_id=consumer.organization_id AND consumer_owner.id=consumer.owner_event_owner_allocation_id
      LEFT JOIN public.owner_event_allocation_sets consumer_set ON consumer_set.organization_id=consumer_owner.organization_id AND consumer_set.id=consumer_owner.allocation_set_id
      WHERE c.organization_id=p_organization_id AND o.allocation_set_id=ANY(set_ids) AND (consumer.id IS NULL OR consumer_owner.id IS NULL OR consumer_set.id IS NULL
        OR m.component IS DISTINCT FROM 'ips_held_owner_cash' OR consumer.component IS DISTINCT FROM 'ips_held_owner_cash'
        OR m.signed_amount<=0 OR consumer.signed_amount>=0
        OR consumer.property_id IS DISTINCT FROM m.property_id OR consumer.owner_person_id IS DISTINCT FROM m.owner_person_id OR consumer.currency IS DISTINCT FROM m.currency
        OR consumer_owner.owner_person_id IS DISTINCT FROM consumer.owner_person_id OR consumer_set.property_id IS DISTINCT FROM consumer.property_id OR consumer_set.currency IS DISTINCT FROM consumer.currency)) THEN
    RAISE EXCEPTION 'Consumption parent/scope inconsistent' USING ERRCODE='23514'; END IF;
  IF coalesce((SELECT sum(octet_length(to_jsonb(e)::text)) FROM public.lease_deposit_events e WHERE e.id=ANY(event_ids)),0)
    +coalesce((SELECT sum(octet_length(to_jsonb(o)::text)) FROM public.property_owners o WHERE o.organization_id=p_organization_id AND o.property_id=l.property_id),0)>8388608 THEN
    RAISE EXCEPTION 'Candidate source fingerprint input exceeds byte cap' USING ERRCODE='54000'; END IF;
  -- Return complete bounded operation roots, including archived deposits and all application/reversal sources; never silently select one.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'leaseId',d.lease_id,
      'label',left(initcap(replace(d.deposit_type,'_',' '))||' deposit - '||coalesce(d.received_on::text,'date not recorded')||' - USD '||d.amount::text,120),
      'held',app_private.deposit_rent_held(p_organization_id,d.id)::numeric(14,2)::text,'obligation',d.amount::text,
      'custodyVerified',c.id IS NOT NULL,'custodyCurrent',app_private.deposit_rent_custody_current(p_organization_id,d.id,today),'custodian',c.custodian,'singleUnchangedOwner',(owner.evidence->>'singleUnchangedOwner')::boolean,
      'custodyReconciles',(owner.evidence->>'custodyReconciles')::boolean,'archived',d.archived_at IS NOT NULL,
      'earliestDate',greatest(coalesce((SELECT a.confirmed_on FROM app_private.deposit_rent_custody_attestations a WHERE a.organization_id=p_organization_id AND a.custody_confirmation_id=c.id ORDER BY a.revision DESC LIMIT 1),c.confirmed_on,today),coalesce((SELECT max(e.event_date) FROM public.lease_deposit_events e WHERE e.organization_id=p_organization_id AND e.lease_deposit_id=d.id),today))) ORDER BY d.id),'[]'::jsonb)
    INTO deposits FROM public.lease_deposits d LEFT JOIN public.deposit_rent_custody_confirmations c ON c.organization_id=d.organization_id AND c.lease_deposit_id=d.id
    CROSS JOIN LATERAL (SELECT app_private.local_deposit_rent_owner_candidate(p_organization_id,d.id,today) evidence) owner WHERE d.id=ANY(deposit_ids);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'leaseId',i.lease_id,'label',left(i.invoice_number||' - '||i.billing_period_start::text,120),
      'outstanding',balance.balance_due::numeric(14,2)::text,'issued',i.lifecycle='issued',
      'rentLines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',line.id,'label',left(line.customer_label||' - line '||line.sort_order::text,120),'outstanding',app_private.tenant_invoice_line_outstanding(p_organization_id,line.id)::numeric(14,2)::text) ORDER BY line.sort_order,line.id)
        FROM public.tenant_invoice_lines line WHERE line.organization_id=i.organization_id AND line.invoice_id=i.id AND line.line_type='rent' AND line.reversal_of_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines reversed WHERE reversed.organization_id=line.organization_id AND reversed.reversal_of_id=line.id)), '[]'::jsonb)) ORDER BY i.id),'[]'::jsonb)
    INTO invoices FROM public.tenant_invoices i JOIN public.tenant_invoice_balances balance ON balance.organization_id=i.organization_id AND balance.id=i.id WHERE i.id=ANY(invoice_ids);
  IF jsonb_array_length(invoices)<>cardinality(invoice_ids) THEN RAISE EXCEPTION 'Invoice balance completeness failure' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'depositId',a.lease_deposit_id,'invoiceId',a.invoice_id,
      'label','Rent application on '||a.settlement_date::text||' - USD '||a.amount::text,'amount',a.amount::text,'date',a.settlement_date,
      'reversalOf',a.reversal_of_application_id,'active',a.reversal_of_application_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications r WHERE r.organization_id=a.organization_id AND r.reversal_of_application_id=a.id),
      'consumed',EXISTS(SELECT 1 FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements m ON m.organization_id=c.organization_id AND m.id=c.source_movement_id
        JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
        WHERE c.organization_id=a.organization_id AND o.allocation_set_id=b.allocation_set_id AND NOT EXISTS(SELECT 1 FROM public.owner_component_movements r WHERE r.organization_id=c.organization_id AND r.reversal_of_movement_id=c.consumer_movement_id))) ORDER BY a.id),'[]'::jsonb)
    INTO applications FROM public.deposit_rent_applications a JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id WHERE a.id=ANY(application_ids);
  -- Independent table-ID census; selected root/event/application sets never derived from output rows.
  SELECT jsonb_build_object('deposits',to_jsonb(deposit_ids),'invoices',to_jsonb(invoice_ids),'events',to_jsonb(event_ids),'applications',to_jsonb(application_ids),
    'rentLines',coalesce((SELECT jsonb_agg(line.id ORDER BY line.id) FROM public.tenant_invoice_lines line WHERE line.organization_id=p_organization_id AND line.invoice_id=ANY(invoice_ids) AND line.line_type='rent' AND line.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines r WHERE r.organization_id=line.organization_id AND r.reversal_of_id=line.id)),'[]'::jsonb),
    'allocations',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM public.deposit_rent_allocations WHERE organization_id=p_organization_id AND application_id=ANY(application_ids)),'[]'::jsonb),
    'custody',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM public.deposit_rent_custody_confirmations WHERE organization_id=p_organization_id AND lease_deposit_id=ANY(deposit_ids)),'[]'::jsonb),
    'bridges',coalesce((SELECT jsonb_agg(application_id ORDER BY application_id) FROM public.deposit_rent_owner_bridges WHERE organization_id=p_organization_id AND application_id=ANY(application_ids)),'[]'::jsonb)) INTO census;
  IF jsonb_array_length(deposits)<>cardinality(deposit_ids) OR jsonb_array_length(applications)<>cardinality(application_ids)
    OR jsonb_array_length(census->'bridges')<>cardinality(application_ids) THEN RAISE EXCEPTION 'Candidate identity completeness failure' USING ERRCODE='23514'; END IF;
  SELECT app_private.canonical_financial_payload_hash(jsonb_build_object('events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.lease_deposit_events e WHERE e.id=ANY(event_ids)),
    'custody',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.deposit_rent_custody_confirmations c WHERE c.organization_id=p_organization_id AND c.lease_deposit_id=ANY(deposit_ids)),
    'custodyAttestations',(SELECT jsonb_agg(latest.record ORDER BY latest.custody_confirmation_id) FROM (
      SELECT DISTINCT ON (a.custody_confirmation_id) a.custody_confirmation_id,to_jsonb(a) AS record
      FROM app_private.deposit_rent_custody_attestations a JOIN public.deposit_rent_custody_confirmations c ON c.organization_id=a.organization_id AND c.id=a.custody_confirmation_id
      WHERE a.organization_id=p_organization_id AND c.lease_deposit_id=ANY(deposit_ids) ORDER BY a.custody_confirmation_id,a.revision DESC) latest),
    'applications',(SELECT jsonb_agg(app_private.deposit_rent_owner_fingerprint(p_organization_id,a.id) ORDER BY a.id) FROM public.deposit_rent_applications a WHERE a.id=ANY(application_ids)),
    'ownerHistory',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.property_owners o WHERE o.organization_id=p_organization_id AND o.property_id=l.property_id))) INTO source_hash;
  packet:=jsonb_build_object('version',1,'purpose','local-deposit-rent-candidates','actorId',actor,'organizationId',p_organization_id,'leaseId',p_lease_id,
    'propertyId',l.property_id,'unitId',l.unit_id,'leaseLabel',lease_label,'businessDate',today,'consistency','statement_snapshot','complete',true,
    'deposits',deposits,'invoices',invoices,'applications',applications,'census',census,'sourceHash',source_hash,
    'closedMonths',coalesce((SELECT jsonb_agg(month_key ORDER BY month_key) FROM (SELECT DISTINCT to_char(month_start,'YYYY-MM') AS month_key FROM public.financial_month_locks WHERE organization_id=p_organization_id AND is_locked
      AND (branch_id IS NULL OR prop.branch_id IS NULL OR branch_id=prop.branch_id)) closed),'[]'::jsonb));
  packet:=packet||jsonb_build_object('fingerprint',app_private.canonical_financial_payload_hash(packet));
  IF octet_length(packet::text)>8388608 THEN RAISE EXCEPTION 'Candidate packet exceeds byte cap' USING ERRCODE='54000'; END IF;
  RETURN packet;
END; $$;
