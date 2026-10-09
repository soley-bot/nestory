-- DORMANT REVIEW DRAFT, outside installed migration chain. NO GRANTS/ACTIVATION.
-- Requires the pinned accepted candidate and checked financial/owner companions.
-- No custody inference, liability-account default, financial backfill or reset.
DO $journal$ BEGIN
  IF to_regprocedure('public.get_local_deposit_rent_candidates(uuid,uuid)') IS NULL
    OR to_regprocedure('public.apply_deposit_to_rent(uuid,uuid,uuid,date,jsonb,text,text)') IS NULL
    OR to_regprocedure('public.reverse_deposit_rent_application(uuid,uuid,date,text,text)') IS NULL
    OR to_regprocedure('app_private.canonical_financial_payload_hash(jsonb)') IS NULL
    OR to_regclass('public.deposit_rent_owner_bridges') IS NULL THEN
    RAISE EXCEPTION 'Pinned compatible financial/candidate companions required' USING ERRCODE='55000'; END IF;
  -- Initial bundle only. Existing application history requires a separate
  -- reviewed compatibility/reconciliation plan, never retrospective backfill.
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications) THEN
    RAISE EXCEPTION 'Initial rollout requires empty application ledger' USING ERRCODE='55000'; END IF;
  IF to_regclass('app_private.deposit_rent_journal_intents') IS NOT NULL OR to_regclass('app_private.deposit_rent_journal_slots') IS NOT NULL THEN
    RAISE EXCEPTION 'Journal already exists; no reset or identity reuse' USING ERRCODE='55000'; END IF;
END $journal$;

CREATE TABLE app_private.deposit_rent_journal_intents (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, actor_id uuid NOT NULL, lease_id uuid NOT NULL,
  property_id uuid NOT NULL, unit_id uuid, deposit_id uuid NOT NULL, invoice_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
  snapshot_hash text NOT NULL CHECK(snapshot_hash~'^[a-f0-9]{64}$'), authorization_hash text NOT NULL CHECK(authorization_hash~'^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL DEFAULT 'preview' CHECK(state IN ('preview','attempted','resolved')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), result_id uuid, result_message text,
  CHECK(state='resolved' AND result_id IS NOT NULL AND result_message IS NOT NULL OR state<>'resolved' AND result_id IS NULL AND result_message IS NULL),
  CHECK(result_message IS NULL OR length(result_message) BETWEEN 1 AND 300),
  UNIQUE(organization_id,actor_id,lease_id,token)
);
CREATE TABLE app_private.deposit_rent_journal_slots (
  organization_id uuid NOT NULL, actor_id uuid NOT NULL, lease_id uuid NOT NULL, current_token uuid,
  PRIMARY KEY(organization_id,actor_id,lease_id),
  FOREIGN KEY(organization_id,actor_id,lease_id,current_token)
    REFERENCES app_private.deposit_rent_journal_intents(organization_id,actor_id,lease_id,token)
);
ALTER TABLE app_private.deposit_rent_journal_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.deposit_rent_journal_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.deposit_rent_journal_intents,app_private.deposit_rent_journal_slots FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.deposit_rent_journal_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $journal$
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
    OR NOT (OLD.state='preview' AND NEW.state='attempted' OR OLD.state='attempted' AND NEW.state='resolved')
    OR OLD.result_id IS NOT NULL OR OLD.result_message IS NOT NULL THEN
    RAISE EXCEPTION 'Immutable intent or invalid journal transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $journal$;
CREATE TRIGGER deposit_rent_journal_immutable BEFORE INSERT OR UPDATE OR DELETE ON app_private.deposit_rent_journal_intents
  FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_journal_immutable();



CREATE FUNCTION app_private.deposit_rent_journal_slot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $journal$
DECLARE previous_state text; next_state text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Journal slot cannot be deleted' USING ERRCODE='55000'; END IF;
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id THEN
  RAISE EXCEPTION 'Slot scope immutable' USING ERRCODE='23514'; END IF;
 IF OLD.current_token IS NOT NULL THEN
  SELECT state INTO STRICT previous_state FROM app_private.deposit_rent_journal_intents WHERE token=OLD.current_token;
  IF previous_state='attempted' THEN RAISE EXCEPTION 'Unconfirmed attempt cannot be replaced' USING ERRCODE='55000'; END IF;
 END IF;
 IF NEW.current_token IS NULL THEN RAISE EXCEPTION 'Current evidence cannot be cleared' USING ERRCODE='55000'; END IF;
 SELECT state INTO STRICT next_state FROM app_private.deposit_rent_journal_intents WHERE token=NEW.current_token;
 IF next_state<>'preview' THEN RAISE EXCEPTION 'Replacement must be a fresh preview' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $journal$;
CREATE TRIGGER deposit_rent_journal_slot_guard BEFORE UPDATE OR DELETE ON app_private.deposit_rent_journal_slots
 FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_journal_slot_guard();

-- Versioned ordered string array, compact JSON UTF-8; shared JS/SQL vectors
-- attest escaping/Unicode/cents. No dependence on jsonb object-key ordering.
CREATE FUNCTION app_private.deposit_rent_journal_payload_text(p_payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $journal$
 SELECT array_to_json(CASE WHEN p_payload->>'operation'='apply' THEN
  ARRAY['deposit-rent-journal-payload-v1','apply',((p_payload->>'leaseId')::uuid)::text,((p_payload->>'date')::date)::text,btrim(p_payload->>'reason'),
   ((p_payload->>'depositId')::uuid)::text,((p_payload->>'invoiceId')::uuid)::text,((p_payload->>'lineId')::uuid)::text,to_char((p_payload->>'amount')::numeric,'FM999999999999990.00')]
 ELSE ARRAY['deposit-rent-journal-payload-v1','reverse',((p_payload->>'leaseId')::uuid)::text,((p_payload->>'date')::date)::text,btrim(p_payload->>'reason'),((p_payload->>'applicationId')::uuid)::text] END)::text;
$journal$;
CREATE FUNCTION app_private.deposit_rent_journal_payload_hash(p_payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $journal$
 SELECT encode(extensions.digest(convert_to(app_private.deposit_rent_journal_payload_text(p_payload),'UTF8'),'sha256'),'hex');
$journal$;

CREATE FUNCTION app_private.deposit_rent_journal_authority(p_org uuid,p_lease uuid,p_operation text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $journal$
DECLARE actor uuid:=auth.uid(); l public.leases%ROWTYPE; membership jsonb; evidence jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  SELECT * INTO l FROM public.leases WHERE organization_id=p_org AND id=p_lease;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease scope denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('role',m.role,'branch',m.branch_id,'roleId',m.custom_role_id) INTO membership
    FROM public.organization_members m WHERE m.organization_id=p_org AND m.user_id=actor;
  IF membership IS NULL OR app_private.has_org_permission(p_org,'leases.view') IS NOT TRUE
    OR app_private.has_org_permission(p_org,'finance.view') IS NOT TRUE
    OR app_private.can_access_property(p_org,l.property_id,'leases.view') IS NOT TRUE
    OR app_private.can_access_property(p_org,l.property_id,'finance.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Both current lease and finance authority required' USING ERRCODE='42501'; END IF;
  PERFORM public.get_lease_read_context(p_org,ARRAY[p_lease]);
  PERFORM public.get_finance_read_context(p_org,l.property_id);
  IF l.unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units u WHERE u.organization_id=p_org AND u.id=l.unit_id AND u.property_id=l.property_id) THEN
    RAISE EXCEPTION 'Unit parent inconsistent' USING ERRCODE='23514'; END IF;
  IF p_operation IS NOT NULL THEN
    IF p_operation NOT IN ('apply','reverse') THEN RAISE EXCEPTION 'Unknown journal operation' USING ERRCODE='22023'; END IF;
    PERFORM app_private.deposit_rent_authorize(p_org,l.property_id,
      CASE p_operation WHEN 'apply' THEN 'finance.record_payments'::public.organization_permission_key ELSE 'finance.correct_records'::public.organization_permission_key END);
  END IF;
  evidence:=jsonb_build_object('actor',actor,'org',p_org,'lease',p_lease,'property',l.property_id,'unit',l.unit_id,'membership',membership,
    'permissions',jsonb_build_array(app_private.can_access_property(p_org,l.property_id,'leases.view'),
      app_private.can_access_property(p_org,l.property_id,'finance.view'),app_private.can_access_property(p_org,l.property_id,'leases.change_terms'),
      app_private.can_access_property(p_org,l.property_id,'finance.record_payments'),app_private.can_access_property(p_org,l.property_id,'finance.correct_records')));
  RETURN jsonb_build_object('actor',actor,'property',l.property_id,'unit',l.unit_id,'authorizationHash',app_private.canonical_financial_payload_hash(evidence));
END $journal$;

CREATE FUNCTION app_private.deposit_rent_journal_packet(p_record app_private.deposit_rent_journal_intents)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $journal$
 SELECT jsonb_build_object('scope',jsonb_build_object('organizationId',p_record.organization_id,'actorId',p_record.actor_id,'leaseId',p_record.lease_id),
 'selectedScope',jsonb_build_object('propertyId',p_record.property_id,'unitId',p_record.unit_id),'token',p_record.token,'idempotencyKey',p_record.idempotency_key,'payload',p_record.payload,'payloadHash',p_record.payload_hash,
 'snapshotHash',p_record.snapshot_hash,'authorizationHash',p_record.authorization_hash,'expiresAt',floor(extract(epoch FROM p_record.expires_at)*1000),
 'revision',p_record.revision,'state',p_record.state)
 || CASE WHEN p_record.state='resolved' THEN jsonb_build_object('result',jsonb_build_object('commandId',p_record.result_id,'message',p_record.result_message)) ELSE '{}'::jsonb END;
$journal$;

-- Existing slot then intent: consistent lock order for every mutating/recovery RPC.
CREATE FUNCTION app_private.deposit_rent_journal_locked(p_org uuid,p_lease uuid,p_token uuid,p_key uuid,p_hash text)
RETURNS app_private.deposit_rent_journal_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE current_id uuid; r app_private.deposit_rent_journal_intents%ROWTYPE;
BEGIN
  SELECT current_token INTO current_id FROM app_private.deposit_rent_journal_slots
    WHERE organization_id=p_org AND actor_id=auth.uid() AND lease_id=p_lease FOR UPDATE;
  IF current_id IS NULL OR current_id IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'Stale intent token' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT r FROM app_private.deposit_rent_journal_intents WHERE token=current_id FOR UPDATE;
  IF r.idempotency_key IS DISTINCT FROM p_key OR r.payload_hash IS DISTINCT FROM p_hash THEN
    RAISE EXCEPTION 'Original key/payload conflict' USING ERRCODE='23514'; END IF;
  RETURN r;
END $journal$;

CREATE FUNCTION app_private.deposit_rent_journal_scope(p_record app_private.deposit_rent_journal_intents,p_authority jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $journal$
BEGIN
  IF p_record.payload_hash IS DISTINCT FROM app_private.deposit_rent_journal_payload_hash(p_record.payload)
    OR (p_record.payload->>'leaseId')::uuid IS DISTINCT FROM p_record.lease_id THEN
    RAISE EXCEPTION 'Stored intent payload evidence inconsistent' USING ERRCODE='23514'; END IF;
  IF p_record.actor_id IS DISTINCT FROM auth.uid() OR p_record.authorization_hash IS DISTINCT FROM p_authority->>'authorizationHash'
    OR p_record.property_id IS DISTINCT FROM (p_authority->>'property')::uuid OR p_record.unit_id IS DISTINCT FROM (p_authority->>'unit')::uuid
    OR NOT EXISTS(SELECT 1 FROM public.lease_deposits d WHERE d.organization_id=p_record.organization_id AND d.id=p_record.deposit_id AND d.lease_id=p_record.lease_id)
    OR NOT EXISTS(SELECT 1 FROM public.tenant_invoices i WHERE i.organization_id=p_record.organization_id AND i.id=p_record.invoice_id
      AND i.lease_id=p_record.lease_id AND i.property_id=p_record.property_id AND i.unit_id IS NOT DISTINCT FROM p_record.unit_id) THEN
    RAISE EXCEPTION 'Original authority or parent scope changed; review required' USING ERRCODE='42501'; END IF;
END $journal$;

CREATE FUNCTION public.get_deposit_rent_journal(p_org uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; token_id uuid; r app_private.deposit_rent_journal_intents%ROWTYPE;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  SELECT current_token INTO token_id FROM app_private.deposit_rent_journal_slots
    WHERE organization_id=p_org AND actor_id=auth.uid() AND lease_id=p_lease FOR UPDATE;
  IF token_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM app_private.deposit_rent_journal_intents WHERE token=token_id FOR UPDATE;
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  PERFORM app_private.deposit_rent_journal_scope(r,authority);
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

CREATE FUNCTION public.prepare_deposit_rent_journal(p_org uuid,p_lease uuid,p_payload jsonb,p_expected_snapshot text) RETURNS jsonb
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
    PERFORM app_private.deposit_rent_journal_scope(previous,authority);
    IF previous.state='attempted' THEN RAISE EXCEPTION 'Original attempt remains unconfirmed' USING ERRCODE='55000'; END IF;
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

CREATE FUNCTION public.begin_deposit_rent_journal_attempt(p_org uuid,p_lease uuid,p_token uuid,p_key uuid,p_payload_hash text,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; r app_private.deposit_rent_journal_intents%ROWTYPE; packet jsonb;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  r:=app_private.deposit_rent_journal_locked(p_org,p_lease,p_token,p_key,p_payload_hash);
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,r.payload->>'operation');
  PERFORM app_private.deposit_rent_journal_scope(r,authority);
  IF r.state='preview' THEN
    IF r.revision IS DISTINCT FROM p_revision OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Unused preview expired or changed' USING ERRCODE='23514'; END IF;
    packet:=public.get_local_deposit_rent_candidates(p_org,p_lease);
    IF packet->>'fingerprint' IS DISTINCT FROM r.snapshot_hash THEN RAISE EXCEPTION 'Unused preview snapshot changed' USING ERRCODE='23514'; END IF;
    UPDATE app_private.deposit_rent_journal_intents SET state='attempted',revision=revision+1 WHERE token=r.token RETURNING * INTO r;
  END IF;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

CREATE FUNCTION public.execute_deposit_rent_journal(p_org uuid,p_lease uuid,p_token uuid,p_key uuid,p_payload_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; r app_private.deposit_rent_journal_intents%ROWTYPE; result_uuid uuid; message text;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  r:=app_private.deposit_rent_journal_locked(p_org,p_lease,p_token,p_key,p_payload_hash);
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,r.payload->>'operation');
  PERFORM app_private.deposit_rent_journal_scope(r,authority);
  IF r.state='preview' THEN RAISE EXCEPTION 'Attempt must be durably recorded first' USING ERRCODE='55000'; END IF;
  IF r.state='resolved' THEN RETURN app_private.deposit_rent_journal_packet(r); END IF;
  -- No exception swallowing: command and result persistence roll back together.
  IF r.payload->>'operation'='apply' THEN
    result_uuid:=public.apply_deposit_to_rent(p_org,r.deposit_id,r.invoice_id,(r.payload->>'date')::date,
      jsonb_build_array(jsonb_build_object('lineId',r.payload->>'lineId','amount',r.payload->>'amount')),r.payload->>'reason',r.idempotency_key::text);
    message:='Deposit applied to rent. No new bank payment was recorded.';
  ELSE
    result_uuid:=public.reverse_deposit_rent_application(p_org,(r.payload->>'applicationId')::uuid,(r.payload->>'date')::date,r.payload->>'reason',r.idempotency_key::text);
    message:='The full deposit application was reversed. No new bank payment was recorded.';
  END IF;
  IF result_uuid IS NULL OR NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=p_org AND a.id=result_uuid
    AND a.property_id=r.property_id AND a.unit_id IS NOT DISTINCT FROM r.unit_id AND a.lease_deposit_id=r.deposit_id AND a.invoice_id=r.invoice_id
    AND a.reversal_of_application_id IS NOT DISTINCT FROM (CASE WHEN r.payload->>'operation'='reverse' THEN (r.payload->>'applicationId')::uuid ELSE NULL END)) THEN
    RAISE EXCEPTION 'Checked command result could not be verified' USING ERRCODE='23514'; END IF;
  UPDATE app_private.deposit_rent_journal_intents SET state='resolved',revision=revision+1,result_id=result_uuid,result_message=message
    WHERE token=r.token RETURNING * INTO r;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;

REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_immutable() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_authority(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_packet(app_private.deposit_rent_journal_intents) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_locked(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_scope(app_private.deposit_rent_journal_intents,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_deposit_rent_journal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_deposit_rent_journal(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_deposit_rent_journal_attempt(uuid,uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.execute_deposit_rent_journal(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
-- No grant statements, no production execution, no feature mount.

REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_payload_text(jsonb),app_private.deposit_rent_journal_payload_hash(jsonb) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_slot_guard() FROM PUBLIC,anon,authenticated,service_role;
