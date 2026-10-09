-- LOCAL UNEXECUTED COMPANION, install only after the preserved baseline draft
-- 20B3D6F4C5C9E597B357C5A2192117116088A51C06B93C46F97BAF82FD8CD727.
-- Approved business behavior for local implementation/tests only. No grants,
-- RLS expansion, bank receipts, fees, withdrawals, publication or activation.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.deposit_rent_applications) THEN
    RAISE EXCEPTION 'Owner bridge requires an empty application ledger; no retrospective adoption/backfill';
  END IF;
END; $$;

CREATE TABLE public.deposit_rent_owner_bridges (
  application_id uuid PRIMARY KEY REFERENCES public.deposit_rent_applications(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  allocation_set_id uuid NOT NULL UNIQUE REFERENCES public.owner_event_allocation_sets(id),
  property_owner_id uuid NOT NULL REFERENCES public.property_owners(id),
  owner_person_id uuid NOT NULL REFERENCES public.people(id),
  liability_account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  custody_signed_amount numeric(14,2) NOT NULL,
  ips_held_signed_amount numeric(14,2) NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deposit_rent_owner_bridges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deposit_rent_owner_bridges FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deposit_rent_bridge_immutable BEFORE UPDATE OR DELETE ON public.deposit_rent_owner_bridges
FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_immutable();

-- Preserve every current owner source type; extend only this local source contract.
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
  WHERE conrelid='public.owner_event_allocation_sets'::regclass
    AND conname='owner_event_allocation_sets_source_type_check' AND contype='c' AND convalidated;
  IF left(definition,6)<>'CHECK ' THEN RAISE EXCEPTION 'Unexpected owner source contract'; END IF;
  ALTER TABLE public.owner_event_allocation_sets DROP CONSTRAINT owner_event_allocation_sets_source_type_check;
  EXECUTE format('ALTER TABLE public.owner_event_allocation_sets ADD CONSTRAINT owner_event_allocation_sets_source_type_check CHECK ((%s) OR source_type = %L)',
    substring(definition FROM 7),'deposit_rent_application');
END; $$;

CREATE FUNCTION app_private.deposit_rent_owner_fingerprint(p_org uuid,p_application uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT app_private.canonical_financial_payload_hash(jsonb_build_object(
    'application',to_jsonb(a),'event',to_jsonb(e),'custody',to_jsonb(c),
    'allocations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.deposit_rent_allocations x
      WHERE x.organization_id=p_org AND x.application_id=a.id)))
  FROM public.deposit_rent_applications a
  JOIN public.lease_deposit_events e ON e.organization_id=a.organization_id AND e.id=a.deposit_event_id
  JOIN public.deposit_rent_custody_confirmations c ON c.organization_id=a.organization_id AND c.id=a.custody_confirmation_id
  WHERE a.organization_id=p_org AND a.id=p_application;
$$;

-- Wrapper preserves the installed resolver for all existing source families.
ALTER FUNCTION app_private.resolve_owner_event_source(uuid,text,uuid) RENAME TO resolve_owner_event_source_before_deposit_rent;
CREATE FUNCTION app_private.resolve_owner_event_source(p_organization_id uuid,p_source_type text,p_source_line_id uuid)
RETURNS TABLE(source_id uuid,property_id uuid,currency public.currency_code,event_date date,gross_signed_amount numeric,
  allocation_basis text,explicit_owner_person_id uuid,component public.owner_balance_component,activity_only boolean,
  source_fingerprint text,reversal_of_allocation_set_id uuid)
LANGUAGE plpgsql STABLE SET search_path='' AS $$ BEGIN
  IF btrim(p_source_type)='deposit_rent_application' THEN
    IF NOT EXISTS(
      SELECT 1 FROM public.deposit_rent_applications a
      JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id
      JOIN public.owner_event_allocation_sets s ON s.organization_id=b.organization_id AND s.id=b.allocation_set_id
      JOIN public.owner_event_owner_allocations o ON o.organization_id=s.organization_id AND o.allocation_set_id=s.id
      LEFT JOIN public.deposit_rent_owner_bridges original ON original.organization_id=a.organization_id
        AND original.application_id=a.reversal_of_application_id
      WHERE a.organization_id=p_organization_id AND a.id=p_source_line_id
        AND b.liability_account_id=a.liability_account_id AND b.owner_person_id=o.owner_person_id
        AND b.property_owner_id=o.property_owner_id AND o.ownership_percent_snapshot=100
        AND s.property_id=a.property_id AND s.currency=a.currency AND s.event_date=a.settlement_date
        AND s.source_type='deposit_rent_application' AND s.source_id=a.id AND s.source_line_id=a.id
        AND s.explicit_owner_person_id=b.owner_person_id
        AND s.gross_signed_amount=CASE WHEN a.reversal_of_application_id IS NULL THEN a.amount ELSE -a.amount END
        AND o.allocated_gross_signed_amount=s.gross_signed_amount
        AND s.source_fingerprint=app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id)
        AND (a.reversal_of_application_id IS NULL OR original.application_id IS NOT NULL)
        AND s.reversal_of_allocation_set_id IS NOT DISTINCT FROM original.allocation_set_id
    ) THEN
      RAISE EXCEPTION 'Deposit application owner bridge source evidence unavailable or mismatched' USING ERRCODE='23514';
    END IF;
    RETURN QUERY SELECT a.id,a.property_id,a.currency,a.settlement_date,
      CASE WHEN a.reversal_of_application_id IS NULL THEN a.amount ELSE -a.amount END,
      'explicit_owner'::text,b.owner_person_id,NULL::public.owner_balance_component,false,
      app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id),original.allocation_set_id
    FROM public.deposit_rent_applications a
    JOIN public.deposit_rent_owner_bridges b ON b.organization_id=a.organization_id AND b.application_id=a.id
    LEFT JOIN public.deposit_rent_owner_bridges original ON original.organization_id=a.organization_id
      AND original.application_id=a.reversal_of_application_id
    WHERE a.organization_id=p_organization_id AND a.id=p_source_line_id;
  ELSE
    RETURN QUERY SELECT * FROM app_private.resolve_owner_event_source_before_deposit_rent(p_organization_id,p_source_type,p_source_line_id);
  END IF;
END; $$;

ALTER FUNCTION app_private.owner_statement_source_description(uuid,uuid) RENAME TO owner_statement_source_description_before_deposit_rent;
CREATE FUNCTION app_private.owner_statement_source_description(p_org uuid,p_set uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path='' AS $$ DECLARE result text; BEGIN
  SELECT CASE WHEN a.reversal_of_application_id IS NULL THEN 'Deposit applied to rent' ELSE 'Reversal: deposit applied to rent' END
    || CASE WHEN a.custodian='ips' THEN ' (IPS custody reclassification; no new bank receipt)' ELSE ' (owner-held; no IPS receipt)' END
    INTO result FROM public.owner_event_allocation_sets s JOIN public.deposit_rent_applications a
      ON a.organization_id=s.organization_id AND a.id=s.source_line_id
    WHERE s.organization_id=p_org AND s.id=p_set AND s.source_type='deposit_rent_application';
  IF FOUND THEN RETURN result; END IF;
  RETURN app_private.owner_statement_source_description_before_deposit_rent(p_org,p_set);
END; $$;

CREATE FUNCTION app_private.deposit_rent_write_owner_bridge(p_org uuid,p_application uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.deposit_rent_applications%ROWTYPE; owner public.property_owners%ROWTYPE;
  prior public.deposit_rent_owner_bridges%ROWTYPE; original_owner public.owner_event_owner_allocations%ROWTYPE;
  movement public.owner_component_movements%ROWTYPE; owner_count integer; first_date date; owner_hash text;
  signed numeric; expected_held numeric; actual_held numeric; set_id uuid; owner_id uuid; previous_context text;
BEGIN
  SELECT * INTO STRICT a FROM public.deposit_rent_applications WHERE organization_id=p_org AND id=p_application FOR UPDATE;
  PERFORM app_private.deposit_rent_authorize(p_org,a.property_id,
    CASE WHEN a.reversal_of_application_id IS NULL THEN 'finance.record_payments'::public.organization_permission_key
      ELSE 'finance.correct_records'::public.organization_permission_key END);
  -- Replay performs current authorization but never adds duplicate owner movements.
  IF EXISTS(SELECT 1 FROM public.deposit_rent_owner_bridges WHERE organization_id=p_org AND application_id=a.id) THEN RETURN; END IF;
  SELECT min(event_date) INTO first_date FROM public.lease_deposit_events
    WHERE organization_id=p_org AND lease_deposit_id=a.lease_deposit_id;
  IF first_date IS NULL THEN RAISE EXCEPTION 'Deposit history missing' USING ERRCODE='23514'; END IF;
  PERFORM app_private.lock_owner_opening_roster_inputs(p_org,a.property_id,a.settlement_date);
  -- Include archived/history rows so an ownership change cannot be hidden by archiving.
  SELECT count(*) INTO owner_count FROM public.property_owners o WHERE o.organization_id=p_org AND o.property_id=a.property_id
    AND o.started_on<=a.settlement_date AND (o.ended_on IS NULL OR o.ended_on>first_date);
  SELECT * INTO owner FROM public.property_owners o WHERE o.organization_id=p_org AND o.property_id=a.property_id
    AND o.archived_at IS NULL AND o.ownership_percent=100 AND o.started_on<=first_date
    AND (o.ended_on IS NULL OR a.settlement_date<o.ended_on) FOR SHARE;
  IF owner_count<>1 OR NOT FOUND OR (a.custodian='owner' AND a.owner_person_id IS DISTINCT FROM owner.person_id)
    OR NOT EXISTS(SELECT 1 FROM public.people p WHERE p.organization_id=p_org AND p.id=owner.person_id AND p.archived_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.person_roles r WHERE r.organization_id=p_org AND r.person_id=owner.person_id AND r.role='owner' AND r.status='active' AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Only one unchanged active 100-percent owner is supported' USING ERRCODE='23514'; END IF;
  PERFORM app_private.lock_owner_balance_mutation(p_org,a.property_id,owner.person_id,a.currency,a.settlement_date);
  PERFORM app_private.lock_open_property_financial_month(p_org,a.property_id,a.currency,a.settlement_date);
  signed:=CASE WHEN a.reversal_of_application_id IS NULL THEN a.amount ELSE -a.amount END;
  IF a.reversal_of_application_id IS NOT NULL THEN
    SELECT * INTO STRICT prior FROM public.deposit_rent_owner_bridges WHERE organization_id=p_org AND application_id=a.reversal_of_application_id;
    IF prior.property_owner_id<>owner.id OR prior.owner_person_id<>owner.person_id OR prior.liability_account_id<>a.liability_account_id THEN
      RAISE EXCEPTION 'Original owner/account identity changed' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT original_owner FROM public.owner_event_owner_allocations WHERE organization_id=p_org AND allocation_set_id=prior.allocation_set_id;
    IF owner.started_on IS DISTINCT FROM original_owner.ownership_started_on_snapshot
      OR owner.ended_on IS DISTINCT FROM original_owner.ownership_ended_on_snapshot THEN
      RAISE EXCEPTION 'Original owner assignment interval changed' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements m
      ON m.organization_id=c.organization_id AND m.id=c.source_movement_id
      WHERE c.organization_id=p_org AND m.owner_event_owner_allocation_id=original_owner.id
      AND NOT EXISTS(SELECT 1 FROM public.owner_component_movements r WHERE r.organization_id=p_org AND r.reversal_of_movement_id=c.consumer_movement_id)) THEN
      RAISE EXCEPTION 'Linked owner cash has active downstream consumers; reverse them first' USING ERRCODE='23514'; END IF;
    owner_hash:=original_owner.ownership_roster_hash;
  ELSE
    SELECT ownership_roster_hash INTO STRICT owner_hash FROM app_private.allocate_owner_roster_amount(p_org,a.property_id,a.settlement_date,a.amount);
  END IF;
  IF EXISTS(SELECT 1 FROM public.owner_event_owner_allocations allocated
    JOIN public.owner_event_allocation_sets source ON source.organization_id=allocated.organization_id AND source.id=allocated.allocation_set_id
    JOIN public.lease_deposit_events event ON event.organization_id=source.organization_id AND event.id=source.source_line_id
    WHERE allocated.organization_id=p_org AND event.lease_deposit_id=a.lease_deposit_id
      AND (allocated.property_owner_id<>owner.id OR allocated.owner_person_id<>owner.person_id OR allocated.ownership_percent_snapshot<>100
        OR allocated.ownership_started_on_snapshot IS DISTINCT FROM owner.started_on
        OR allocated.ownership_ended_on_snapshot IS DISTINCT FROM owner.ended_on)) THEN
    RAISE EXCEPTION 'Deposit custody owner snapshots changed or were split' USING ERRCODE='23514'; END IF;
  -- Existing deposit custody must already be independently allocated in the official ledger.
  -- No backfill/opening balance guess or silent conversion of unallocated legacy custody.
  SELECT coalesce(sum(m.signed_amount),0) INTO actual_held FROM public.owner_component_movements m
  JOIN public.owner_event_owner_allocations o ON o.organization_id=m.organization_id AND o.id=m.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets s ON s.organization_id=o.organization_id AND s.id=o.allocation_set_id
  WHERE m.organization_id=p_org AND m.property_id=a.property_id AND m.owner_person_id=owner.person_id
    AND m.currency=a.currency AND m.component='security_deposit_custody'
    AND (EXISTS(SELECT 1 FROM public.lease_deposit_events e WHERE e.organization_id=p_org AND e.lease_deposit_id=a.lease_deposit_id AND e.id=s.source_line_id)
      OR EXISTS(SELECT 1 FROM public.deposit_rent_applications linked WHERE linked.organization_id=p_org AND linked.lease_deposit_id=a.lease_deposit_id
        AND linked.id=s.source_line_id AND s.source_type='deposit_rent_application'));
  expected_held:=app_private.deposit_rent_held(p_org,a.lease_deposit_id)+signed;
  IF actual_held<>expected_held THEN RAISE EXCEPTION 'Official deposit custody does not reconcile; review source allocations first' USING ERRCODE='23514'; END IF;
  previous_context:=current_setting('app.owner_balance_write_context',true);
  PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
  INSERT INTO public.owner_event_allocation_sets(organization_id,property_id,currency,event_date,source_type,source_id,source_line_id,
    gross_signed_amount,source_fingerprint,allocation_basis,explicit_owner_person_id,reversal_of_allocation_set_id,idempotency_key,command_payload_hash,created_by)
  VALUES(p_org,a.property_id,a.currency,a.settlement_date,'deposit_rent_application',a.id,a.id,signed,
    app_private.deposit_rent_owner_fingerprint(p_org,a.id),'explicit_owner',owner.person_id,prior.allocation_set_id,
    'deposit-rent-owner:'||a.id,app_private.canonical_financial_payload_hash(jsonb_build_object('application',a.id,'owner',owner.person_id)),auth.uid()) RETURNING id INTO set_id;
  INSERT INTO public.owner_event_owner_allocations(allocation_set_id,organization_id,property_owner_id,owner_person_id,ownership_percent_snapshot,
    ownership_started_on_snapshot,ownership_ended_on_snapshot,ownership_roster_hash,allocated_gross_signed_amount,allocation_order,created_by)
  VALUES(set_id,p_org,owner.id,owner.person_id,100,coalesce(original_owner.ownership_started_on_snapshot,owner.started_on),
    CASE WHEN a.reversal_of_application_id IS NULL THEN owner.ended_on ELSE original_owner.ownership_ended_on_snapshot END,owner_hash,signed,1,auth.uid()) RETURNING id INTO owner_id;
  IF a.reversal_of_application_id IS NULL THEN
    INSERT INTO public.owner_component_movements(organization_id,owner_event_owner_allocation_id,property_id,owner_person_id,currency,event_date,month_start,component,signed_amount,movement_order,created_by)
    VALUES(p_org,owner_id,a.property_id,owner.person_id,a.currency,a.settlement_date,date_trunc('month',a.settlement_date)::date,'security_deposit_custody',-signed,1,auth.uid());
    IF a.custodian='ips' THEN
      INSERT INTO public.owner_component_movements(organization_id,owner_event_owner_allocation_id,property_id,owner_person_id,currency,event_date,month_start,component,signed_amount,movement_order,created_by)
      VALUES(p_org,owner_id,a.property_id,owner.person_id,a.currency,a.settlement_date,date_trunc('month',a.settlement_date)::date,'ips_held_owner_cash',signed,2,auth.uid());
    END IF;
  ELSE
    FOR movement IN SELECT * FROM public.owner_component_movements WHERE organization_id=p_org AND owner_event_owner_allocation_id=original_owner.id ORDER BY movement_order LOOP
      INSERT INTO public.owner_component_movements(organization_id,owner_event_owner_allocation_id,property_id,owner_person_id,currency,event_date,month_start,component,signed_amount,movement_order,reversal_of_movement_id,created_by)
      VALUES(p_org,owner_id,movement.property_id,movement.owner_person_id,movement.currency,a.settlement_date,date_trunc('month',a.settlement_date)::date,
        movement.component,-movement.signed_amount,movement.movement_order,movement.id,auth.uid());
    END LOOP;
  END IF;
  INSERT INTO public.deposit_rent_owner_bridges(application_id,organization_id,allocation_set_id,property_owner_id,owner_person_id,liability_account_id,custody_signed_amount,ips_held_signed_amount,created_by)
  VALUES(a.id,p_org,set_id,owner.id,owner.person_id,a.liability_account_id,-signed,CASE WHEN a.custodian='ips' THEN signed ELSE 0 END,auth.uid());
  PERFORM set_config('app.owner_balance_write_context',coalesce(previous_context,''),true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.owner_balance_write_context',coalesce(previous_context,''),true); RAISE;
END; $$;

-- Same transaction: core settlement + owner bridge + idempotency + audit.
-- A bridge failure rolls back the core, even after its internal claim completes.
ALTER FUNCTION app_private.deposit_rent_command(uuid,uuid,uuid,uuid,date,jsonb,text,text) RENAME TO deposit_rent_command_before_owner_bridge;
CREATE FUNCTION app_private.deposit_rent_command(p_org uuid,p_deposit uuid,p_invoice uuid,p_original uuid,p_date date,p_allocations jsonb,p_reason text,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE result uuid; BEGIN
  result:=app_private.deposit_rent_command_before_owner_bridge(p_org,p_deposit,p_invoice,p_original,p_date,p_allocations,p_reason,p_key);
  PERFORM app_private.deposit_rent_write_owner_bridge(p_org,result);
  RETURN result;
END; $$;
-- Rebind SQL public wrappers to the new private function; signatures/ACL held.
CREATE OR REPLACE FUNCTION public.apply_deposit_to_rent(p_org uuid,p_deposit uuid,p_invoice uuid,p_date date,p_allocations jsonb,p_reason text,p_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT app_private.deposit_rent_command(p_org,p_deposit,p_invoice,NULL,p_date,p_allocations,p_reason,p_key); $$;
CREATE OR REPLACE FUNCTION public.reverse_deposit_rent_application(p_org uuid,p_original uuid,p_date date,p_reason text,p_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT app_private.deposit_rent_command(p_org,NULL,NULL,p_original,p_date,NULL,p_reason,p_key); $$;

REVOKE ALL ON FUNCTION app_private.deposit_rent_owner_fingerprint(uuid,uuid),
  app_private.resolve_owner_event_source(uuid,text,uuid),app_private.owner_statement_source_description(uuid,uuid),
  app_private.deposit_rent_write_owner_bridge(uuid,uuid),app_private.deposit_rent_command(uuid,uuid,uuid,uuid,date,jsonb,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
-- No new caller privileges or public command EXECUTE grants.

CREATE FUNCTION app_private.deposit_rent_validate_owner_bridge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.deposit_rent_applications%ROWTYPE; b public.deposit_rent_owner_bridges%ROWTYPE;
  allocation public.owner_event_owner_allocations%ROWTYPE; signed numeric; custody numeric; held numeric; n integer;
BEGIN
  SELECT * INTO STRICT a FROM public.deposit_rent_applications WHERE id=NEW.id;
  SELECT * INTO STRICT b FROM public.deposit_rent_owner_bridges WHERE application_id=a.id AND organization_id=a.organization_id;
  signed:=CASE WHEN a.reversal_of_application_id IS NULL THEN a.amount ELSE -a.amount END;
  SELECT * INTO STRICT allocation FROM public.owner_event_owner_allocations WHERE organization_id=a.organization_id AND allocation_set_id=b.allocation_set_id;
  SELECT coalesce(sum(m.signed_amount) FILTER(WHERE m.component='security_deposit_custody'),0),
    coalesce(sum(m.signed_amount) FILTER(WHERE m.component='ips_held_owner_cash'),0),count(*) INTO custody,held,n
  FROM public.owner_component_movements m WHERE m.organization_id=a.organization_id AND m.owner_event_owner_allocation_id=allocation.id;
  IF b.liability_account_id<>a.liability_account_id OR b.property_owner_id<>allocation.property_owner_id
    OR b.owner_person_id<>allocation.owner_person_id OR allocation.allocated_gross_signed_amount<>signed
    OR allocation.ownership_percent_snapshot<>100
    OR NOT EXISTS(SELECT 1 FROM public.owner_event_allocation_sets s WHERE s.organization_id=a.organization_id AND s.id=b.allocation_set_id
      AND s.property_id=a.property_id AND s.currency=a.currency AND s.event_date=a.settlement_date AND s.source_type='deposit_rent_application'
      AND s.source_id=a.id AND s.source_line_id=a.id AND s.gross_signed_amount=signed AND s.explicit_owner_person_id=b.owner_person_id
      AND s.source_fingerprint=app_private.deposit_rent_owner_fingerprint(a.organization_id,a.id))
    OR EXISTS(SELECT 1 FROM public.owner_component_movements m WHERE m.organization_id=a.organization_id AND m.owner_event_owner_allocation_id=allocation.id
      AND (m.property_id<>a.property_id OR m.owner_person_id<>b.owner_person_id OR m.currency<>a.currency OR m.event_date<>a.settlement_date))
    OR custody<>-signed OR held<>(CASE WHEN a.custodian='ips' THEN signed ELSE 0 END)
    OR b.custody_signed_amount<>custody OR b.ips_held_signed_amount<>held
    OR n<>(CASE WHEN a.custodian='ips' THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Atomic owner bridge conservation failure' USING ERRCODE='23514'; END IF;
  IF a.reversal_of_application_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.owner_component_movements m
    LEFT JOIN public.owner_component_movements original ON original.organization_id=m.organization_id AND original.id=m.reversal_of_movement_id
    LEFT JOIN public.owner_event_owner_allocations original_owner ON original_owner.organization_id=original.organization_id AND original_owner.id=original.owner_event_owner_allocation_id
    LEFT JOIN public.deposit_rent_owner_bridges original_bridge ON original_bridge.organization_id=original_owner.organization_id AND original_bridge.allocation_set_id=original_owner.allocation_set_id
    WHERE m.organization_id=a.organization_id AND m.owner_event_owner_allocation_id=allocation.id
      AND (original.id IS NULL OR original_bridge.application_id IS DISTINCT FROM a.reversal_of_application_id
        OR original.signed_amount<>-m.signed_amount OR original.component<>m.component OR original.movement_order<>m.movement_order)) THEN
    RAISE EXCEPTION 'Owner bridge reversal lineage failure' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER deposit_rent_owner_bridge_complete AFTER INSERT ON public.deposit_rent_applications
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.deposit_rent_validate_owner_bridge();
REVOKE ALL ON FUNCTION app_private.deposit_rent_validate_owner_bridge() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the installed queue's authorization, remediation and existing families.
-- Linked custody events are already atomically allocated under application identity.
DO $deposit_queue$
DECLARE definition text; old_filter text; new_filter text; old_union text; new_union text;
BEGIN
  definition:=pg_get_functiondef('app_private.get_owner_event_allocation_queue_baseline(uuid,uuid,public.currency_code,date,date)'::regprocedure);
  old_filter:=E'WHERE event.organization_id = p_organization_id\n      AND (event.reversal_of_id IS NOT NULL OR event.event_type IN (''received'', ''refunded''))';
  new_filter:=old_filter||E'\n      AND NOT EXISTS (SELECT 1 FROM public.deposit_rent_applications linked\n        WHERE linked.organization_id=event.organization_id AND linked.deposit_event_id=event.id)';
  old_union:=E'UNION ALL\n    SELECT ''owner_component_transfer'', line.id';
  new_union:=E'UNION ALL\n    SELECT ''deposit_rent_application'', application.id\n    FROM public.deposit_rent_applications application\n    WHERE application.organization_id=p_organization_id AND application.property_id=p_property_id\n      AND application.currency=p_currency AND application.settlement_date BETWEEN p_period_start AND p_period_end\n\n    '||old_union;
  IF position(old_filter IN definition)=0 OR position(old_union IN definition)=0 THEN
    RAISE EXCEPTION 'Owner allocation queue discovery contract changed';
  END IF;
  IF position('deposit_rent_application' IN definition)>0 THEN
    RAISE EXCEPTION 'Deposit application queue discovery already integrated';
  END IF;
  definition:=replace(replace(definition,old_filter,new_filter),old_union,new_union);
  EXECUTE definition;
END; $deposit_queue$;
