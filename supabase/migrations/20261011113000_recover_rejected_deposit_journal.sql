-- Preserve original attempt identity and immutable evidence while allowing
-- replacement after a proved command rollback or an authorized role change.
-- No backfill, grants, custody changes or new production reader access.
ALTER TABLE app_private.deposit_rent_journal_intents
  DROP CONSTRAINT deposit_rent_journal_intents_state_check,
  DROP CONSTRAINT deposit_rent_journal_intents_check,
  ADD CONSTRAINT deposit_rent_journal_intents_state_check CHECK(state IN ('preview','attempted','resolved','rejected')),
  ADD CONSTRAINT deposit_rent_journal_intents_check CHECK(
    state='resolved' AND result_id IS NOT NULL AND result_message IS NOT NULL
    OR state='rejected' AND result_id IS NULL AND result_message IS NOT NULL
    OR state IN ('preview','attempted') AND result_id IS NULL AND result_message IS NULL);


CREATE OR REPLACE FUNCTION app_private.deposit_rent_journal_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $journal$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'preview' OR NEW.revision<>1 OR NEW.result_id IS NOT NULL OR NEW.result_message IS NOT NULL THEN
      RAISE EXCEPTION 'Intent must begin as a fresh preview' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Journal evidence cannot be deleted' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW)-'state'-'revision'-'result_id'-'result_message') IS DISTINCT FROM
     (to_jsonb(OLD)-'state'-'revision'-'result_id'-'result_message')
    OR NEW.revision<>OLD.revision+1
    OR NOT (OLD.state='preview' AND NEW.state='attempted' OR OLD.state='attempted' AND NEW.state IN ('resolved','rejected'))
    OR OLD.result_id IS NOT NULL OR OLD.result_message IS NOT NULL THEN
    RAISE EXCEPTION 'Immutable intent or invalid journal transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $journal$;

CREATE OR REPLACE FUNCTION app_private.deposit_rent_journal_parent_scope(p_record app_private.deposit_rent_journal_intents,p_authority jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $journal$
BEGIN
  IF p_record.payload_hash IS DISTINCT FROM app_private.deposit_rent_journal_payload_hash(p_record.payload)
    OR (p_record.payload->>'leaseId')::uuid IS DISTINCT FROM p_record.lease_id THEN
    RAISE EXCEPTION 'Stored intent payload evidence inconsistent' USING ERRCODE='23514'; END IF;
  IF p_record.actor_id IS DISTINCT FROM auth.uid()
    OR p_record.property_id IS DISTINCT FROM (p_authority->>'property')::uuid OR p_record.unit_id IS DISTINCT FROM (p_authority->>'unit')::uuid
    OR NOT EXISTS(SELECT 1 FROM public.lease_deposits d WHERE d.organization_id=p_record.organization_id AND d.id=p_record.deposit_id AND d.lease_id=p_record.lease_id)
    OR NOT EXISTS(SELECT 1 FROM public.tenant_invoices i WHERE i.organization_id=p_record.organization_id AND i.id=p_record.invoice_id
      AND i.lease_id=p_record.lease_id AND i.property_id=p_record.property_id AND i.unit_id IS NOT DISTINCT FROM p_record.unit_id) THEN
    RAISE EXCEPTION 'Original parent scope changed; review required' USING ERRCODE='42501'; END IF;
END $journal$;

CREATE OR REPLACE FUNCTION app_private.deposit_rent_journal_scope(p_record app_private.deposit_rent_journal_intents,p_authority jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $journal$
BEGIN
  PERFORM app_private.deposit_rent_journal_parent_scope(p_record,p_authority);
  IF p_record.authorization_hash IS DISTINCT FROM p_authority->>'authorizationHash' THEN
    RAISE EXCEPTION 'Original authority changed; review required' USING ERRCODE='42501';
  END IF;
END $journal$;

CREATE OR REPLACE FUNCTION app_private.deposit_rent_journal_packet(p_record app_private.deposit_rent_journal_intents)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $journal$
 SELECT jsonb_build_object('scope',jsonb_build_object('organizationId',p_record.organization_id,'actorId',p_record.actor_id,'leaseId',p_record.lease_id),
 'selectedScope',jsonb_build_object('propertyId',p_record.property_id,'unitId',p_record.unit_id),'token',p_record.token,'idempotencyKey',p_record.idempotency_key,'payload',p_record.payload,'payloadHash',p_record.payload_hash,
 'snapshotHash',p_record.snapshot_hash,'authorizationHash',p_record.authorization_hash,'expiresAt',floor(extract(epoch FROM p_record.expires_at)*1000),
 'revision',p_record.revision,'state',p_record.state)
 || CASE WHEN p_record.state='resolved' THEN jsonb_build_object('result',jsonb_build_object('commandId',p_record.result_id,'message',p_record.result_message)) WHEN p_record.state='rejected' THEN jsonb_build_object('rejection',jsonb_build_object('message',p_record.result_message)) ELSE '{}'::jsonb END;
$journal$;

CREATE OR REPLACE FUNCTION public.get_deposit_rent_journal(p_org uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; token_id uuid; r app_private.deposit_rent_journal_intents%ROWTYPE;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  SELECT current_token INTO token_id FROM app_private.deposit_rent_journal_slots
    WHERE organization_id=p_org AND actor_id=auth.uid() AND lease_id=p_lease FOR UPDATE;
  IF token_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM app_private.deposit_rent_journal_intents WHERE token=token_id FOR UPDATE;
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  PERFORM app_private.deposit_rent_journal_parent_scope(r,authority);
  IF r.state='attempted' THEN PERFORM app_private.deposit_rent_journal_scope(r,authority); END IF;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

CREATE OR REPLACE FUNCTION public.prepare_deposit_rent_journal(p_org uuid,p_lease uuid,p_payload jsonb,p_expected_snapshot text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; packet jsonb; old_token uuid; previous app_private.deposit_rent_journal_intents%ROWTYPE;
  r app_private.deposit_rent_journal_intents%ROWTYPE; canonical jsonb; dep jsonb; inv jsonb; line jsonb; original jsonb;
  dep_id uuid; inv_id uuid; amount numeric; op text; business_date date; chosen_date date;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>2048 THEN
    RAISE EXCEPTION 'Bounded explicit payload required' USING ERRCODE='22023'; END IF;
  op:=p_payload->>'operation'; authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,op);
  IF (p_payload->>'leaseId')::uuid IS DISTINCT FROM p_lease OR op IS NULL
    OR jsonb_typeof(p_payload->'date') IS DISTINCT FROM 'string' OR (p_payload->>'date')!~'^\d{4}-\d{2}-\d{2}$'
    OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'reason')) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Lease/date/reason required' USING ERRCODE='22023'; END IF;
  chosen_date:=(p_payload->>'date')::date;
  -- Lock the durable slot before comparing/replacing a preview.
  INSERT INTO app_private.deposit_rent_journal_slots(organization_id,actor_id,lease_id) VALUES(p_org,auth.uid(),p_lease) ON CONFLICT DO NOTHING;
  SELECT current_token INTO old_token FROM app_private.deposit_rent_journal_slots
    WHERE organization_id=p_org AND actor_id=auth.uid() AND lease_id=p_lease FOR UPDATE;
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,op);
  IF old_token IS NOT NULL THEN
    SELECT * INTO STRICT previous FROM app_private.deposit_rent_journal_intents WHERE token=old_token FOR UPDATE;
    PERFORM app_private.deposit_rent_journal_parent_scope(previous,authority);
    IF previous.state='attempted' THEN
      PERFORM app_private.deposit_rent_journal_scope(previous,authority);
      RAISE EXCEPTION 'Original attempt remains unconfirmed' USING ERRCODE='55000';
    END IF;
  END IF;
  packet:=public.get_local_deposit_rent_candidates(p_org,p_lease);
  IF packet->>'fingerprint' IS DISTINCT FROM p_expected_snapshot THEN RAISE EXCEPTION 'Candidate snapshot changed' USING ERRCODE='23514'; END IF;
  business_date:=(packet->>'businessDate')::date;
  IF op='apply' THEN
    IF p_payload-'operation'-'leaseId'-'date'-'reason'-'depositId'-'invoiceId'-'lineId'-'amount'<>'{}'::jsonb
      OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' OR coalesce(p_payload->>'amount','')!~'^\d{1,12}\.\d{2}$' THEN
      RAISE EXCEPTION 'Exact apply payload required' USING ERRCODE='22023'; END IF;
    dep_id:=(p_payload->>'depositId')::uuid; inv_id:=(p_payload->>'invoiceId')::uuid; amount:=(p_payload->>'amount')::numeric;
    canonical:=jsonb_build_object('operation',op,'leaseId',p_lease,'date',chosen_date,'reason',btrim(p_payload->>'reason'),
      'depositId',dep_id,'invoiceId',inv_id,'lineId',(p_payload->>'lineId')::uuid,'amount',to_char(amount,'FM999999999999990.00'));
  ELSE
    IF p_payload-'operation'-'leaseId'-'date'-'reason'-'applicationId'<>'{}'::jsonb THEN RAISE EXCEPTION 'Exact reverse payload required' USING ERRCODE='22023'; END IF;
    SELECT value INTO original FROM jsonb_array_elements(packet->'applications') WHERE value->>'id'=p_payload->>'applicationId';
    IF original IS NULL OR original->>'reversalOf' IS NOT NULL OR (original->>'active')::boolean IS NOT TRUE OR (original->>'consumed')::boolean IS NOT FALSE
      OR chosen_date<(original->>'date')::date THEN RAISE EXCEPTION 'Original full reversal unavailable' USING ERRCODE='23514'; END IF;
    dep_id:=(original->>'depositId')::uuid; inv_id:=(original->>'invoiceId')::uuid; amount:=(original->>'amount')::numeric;
    canonical:=jsonb_build_object('operation',op,'leaseId',p_lease,'date',chosen_date,'reason',btrim(p_payload->>'reason'),'applicationId',(original->>'id')::uuid);
  END IF;
  SELECT value INTO dep FROM jsonb_array_elements(packet->'deposits') WHERE value->>'id'=dep_id::text;
  SELECT value INTO inv FROM jsonb_array_elements(packet->'invoices') WHERE value->>'id'=inv_id::text;
  IF dep IS NULL OR inv IS NULL OR (dep->>'custodyVerified')::boolean IS NOT TRUE OR dep->>'custodian' IS NULL
    OR (dep->>'singleUnchangedOwner')::boolean IS NOT TRUE OR (dep->>'custodyReconciles')::boolean IS NOT TRUE
    OR chosen_date>business_date OR chosen_date<(dep->>'earliestDate')::date
    OR packet->'closedMonths' ? to_char(chosen_date,'YYYY-MM') THEN RAISE EXCEPTION 'Verified custody/date/owner scope unavailable' USING ERRCODE='23514'; END IF;
  IF op='apply' THEN
    SELECT value INTO line FROM jsonb_array_elements(inv->'rentLines') WHERE value->>'id'=canonical->>'lineId';
    IF (dep->>'archived')::boolean IS NOT FALSE OR (inv->>'issued')::boolean IS NOT TRUE OR line IS NULL OR amount<=0
      OR amount>(dep->>'held')::numeric OR amount>(inv->>'outstanding')::numeric OR amount>(line->>'outstanding')::numeric THEN
      RAISE EXCEPTION 'Deposit/rent amount unavailable' USING ERRCODE='22023'; END IF;
  ELSIF (dep->>'held')::numeric+amount>(dep->>'obligation')::numeric THEN RAISE EXCEPTION 'Full reversal exceeds obligation' USING ERRCODE='23514'; END IF;
  INSERT INTO app_private.deposit_rent_journal_intents(organization_id,actor_id,lease_id,property_id,unit_id,deposit_id,invoice_id,
    payload,payload_hash,snapshot_hash,authorization_hash,expires_at)
    VALUES(p_org,auth.uid(),p_lease,(authority->>'property')::uuid,(authority->>'unit')::uuid,dep_id,inv_id,canonical,
      app_private.deposit_rent_journal_payload_hash(canonical),packet->>'fingerprint',authority->>'authorizationHash',clock_timestamp()+interval '5 minutes') RETURNING * INTO r;
  UPDATE app_private.deposit_rent_journal_slots SET current_token=r.token WHERE organization_id=p_org AND actor_id=auth.uid() AND lease_id=p_lease;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

CREATE OR REPLACE FUNCTION public.execute_deposit_rent_journal(p_org uuid,p_lease uuid,p_token uuid,p_key uuid,p_payload_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; r app_private.deposit_rent_journal_intents%ROWTYPE; result_uuid uuid; message text;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  r:=app_private.deposit_rent_journal_locked(p_org,p_lease,p_token,p_key,p_payload_hash);
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,r.payload->>'operation');
  PERFORM app_private.deposit_rent_journal_scope(r,authority);
  IF r.state='preview' THEN RAISE EXCEPTION 'Attempt must be durably recorded first' USING ERRCODE='55000'; END IF;
  IF r.state IN ('resolved','rejected') THEN RETURN app_private.deposit_rent_journal_packet(r); END IF;
  -- The checked command runs in a subtransaction. A returned business rejection
  -- rolls back all its writes before persisting a terminal rejection. Unknown
  -- outcomes, authorization failures and serialization errors retain the attempt.
  BEGIN
  IF r.payload->>'operation'='apply' THEN
    result_uuid:=public.apply_deposit_to_rent(p_org,r.deposit_id,r.invoice_id,(r.payload->>'date')::date,
      jsonb_build_array(jsonb_build_object('lineId',r.payload->>'lineId','amount',r.payload->>'amount')),r.payload->>'reason',r.idempotency_key::text);
    message:='Deposit applied to rent. No new bank payment was recorded.';
  ELSE
    result_uuid:=public.reverse_deposit_rent_application(p_org,(r.payload->>'applicationId')::uuid,(r.payload->>'date')::date,r.payload->>'reason',r.idempotency_key::text);
    message:='The full deposit application was reversed. No new bank payment was recorded.';
  END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '23514' OR SQLSTATE '23503' THEN
    -- Existing idempotency evidence may represent a committed original outcome;
    -- never relabel that outcome as rejected or release its slot.
    IF EXISTS(SELECT 1 FROM app_private.financial_idempotency_requests f
      WHERE f.organization_id=p_org AND f.idempotency_key=r.idempotency_key::text) THEN RAISE; END IF;
    UPDATE app_private.deposit_rent_journal_intents
      SET state='rejected',revision=revision+1,
        result_message='The saved action was rejected because its financial details changed. No changes from this attempt were saved. Review current details and prepare a new preview.'
      WHERE token=r.token RETURNING * INTO r;
    RETURN app_private.deposit_rent_journal_packet(r);
  END;
  IF result_uuid IS NULL OR NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=p_org AND a.id=result_uuid
    AND a.property_id=r.property_id AND a.unit_id IS NOT DISTINCT FROM r.unit_id AND a.lease_deposit_id=r.deposit_id AND a.invoice_id=r.invoice_id
    AND a.reversal_of_application_id IS NOT DISTINCT FROM (CASE WHEN r.payload->>'operation'='reverse' THEN (r.payload->>'applicationId')::uuid ELSE NULL END)) THEN
    RAISE EXCEPTION 'Checked command result could not be verified' USING ERRCODE='23514'; END IF;
  UPDATE app_private.deposit_rent_journal_intents SET state='resolved',revision=revision+1,result_id=result_uuid,result_message=message
    WHERE token=r.token RETURNING * INTO r;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_parent_scope(app_private.deposit_rent_journal_intents,jsonb) FROM PUBLIC,anon,authenticated,service_role;
