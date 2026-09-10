BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Isolated historical sources: no seed identities, synthetic openings or manual
-- component movements. All assertions exercise the authenticated posting RPC.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES ('d4590000-0000-4000-8000-000000000010', 'authenticated', 'authenticated',
  'distribution-reconciliation@test.invalid', '{"provider":"email","providers":["email"]}', '{}');
INSERT INTO public.organizations (id, name, slug)
VALUES ('d4590000-0000-4000-8000-000000000001', 'Distribution reconciliation test', 'distribution-reconciliation-test');
INSERT INTO public.organization_members (organization_id,user_id,role)
VALUES ('d4590000-0000-4000-8000-000000000001','d4590000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people (id,organization_id,display_name)
VALUES ('d4590000-0000-4000-8000-000000000003','d4590000-0000-4000-8000-000000000001','Reconciliation owner');
INSERT INTO public.person_roles (organization_id,person_id,role,status)
VALUES ('d4590000-0000-4000-8000-000000000001','d4590000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.person_roles (organization_id,person_id,role,status)
VALUES ('d4590000-0000-4000-8000-000000000001','d4590000-0000-4000-8000-000000000003','tenant','active');

CREATE FUNCTION pg_temp.reconciliation_property(n integer, future_credit numeric, future_debt numeric, credit_after_debt boolean DEFAULT false, prepaid_fee boolean DEFAULT false, same_day_replacement boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  org uuid := 'd4590000-0000-4000-8000-000000000001';
  actor uuid := 'd4590000-0000-4000-8000-000000000010';
  owner_id uuid := 'd4590000-0000-4000-8000-000000000003';
  property_id uuid := ('d4590000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid;
  lease_id uuid := gen_random_uuid(); term_id uuid := gen_random_uuid();
  invoice_id uuid := gen_random_uuid(); fee_id uuid := gen_random_uuid();
  deposit_id uuid := gen_random_uuid();
  line_id uuid;
  cash_id uuid := CASE WHEN same_day_replacement THEN 'd4590000-0000-4000-8002-000000000001'::uuid ELSE gen_random_uuid() END;
  fee_amount numeric := CASE WHEN same_day_replacement THEN 40 ELSE 100 END;
  past date := (date_trunc('month',current_date)-interval '1 month')::date;
BEGIN
  INSERT INTO public.properties(id,organization_id,name,code,property_type)
  VALUES(property_id,org,'Reconciliation '||n,'ODR-'||n,'Apartment');
  INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
  VALUES(org,property_id,owner_id,100,past-365,true);
  INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id)
  VALUES(lease_id,org,property_id,owner_id);
  INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency)
  VALUES(deposit_id,org,lease_id,5000,'USD');
  INSERT INTO public.lease_deposit_events(organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,created_by)
  VALUES(org,property_id,deposit_id,'received',past,5000,'USD',actor);
  INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,confirmed_by)
  VALUES(term_id,org,lease_id,property_id,past,past+365,actor);
  INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,
    billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount,created_by)
  VALUES(invoice_id,org,'ODR-TEN-'||n,property_id,lease_id,term_id,past,(past+interval '1 month - 1 day')::date,
    past,past+5,'through_ips','individual',owner_id,'Fixture tenant',1000,actor);
  INSERT INTO public.management_fee_occurrences(id,organization_id,property_id,lease_id,tenant_invoice_id,
    billing_term_id,fee_date,amount,fee_mode,fee_value,created_by)
  VALUES(fee_id,org,property_id,lease_id,invoice_id,term_id,past+CASE WHEN prepaid_fee THEN 26 ELSE 0 END,fee_amount,'flat',fee_amount,actor);
  SELECT id INTO STRICT line_id FROM public.owner_invoice_lines
  WHERE organization_id=org AND source_type='management_fee' AND source_id=fee_id;
  INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by)
  VALUES(cash_id,org,property_id,line_id,past+1,fee_amount,actor);
  IF same_day_replacement THEN
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by,reversal_of_id)
    VALUES('d4590000-0000-4000-8002-000000000002',org,property_id,line_id,past+1,-40,actor,cash_id);
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by)
    VALUES('d4590000-0000-4000-8002-000000000003',org,property_id,line_id,past+1,40,actor);
  END IF;
  -- The legacy source exists, but its owner event has never been allocated.
  PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
  INSERT INTO public.owner_cash_events(organization_id,property_id,owner_person_id,currency,event_type,event_date,amount,reason,idempotency_key,payload_hash,created_by)
  VALUES(org,property_id,owner_id,'USD','owner_contribution',past,CASE WHEN same_day_replacement THEN 50 ELSE 1000 END,'Historical source','odr-source-'||n,repeat('a',64),actor);
  IF future_credit > 0 THEN
    INSERT INTO public.owner_cash_events(organization_id,property_id,owner_person_id,currency,event_type,event_date,amount,reason,idempotency_key,payload_hash,created_by)
    VALUES(org,property_id,owner_id,'USD','owner_contribution',past+CASE WHEN credit_after_debt THEN 24 ELSE 21 END,
      future_credit,'Later source','odr-future-source-'||n,repeat('b',64),actor);
  END IF;
  IF future_debt > 0 THEN
    INSERT INTO public.property_withdrawals(organization_id,property_id,owner_person_id,withdrawal_date,amount,currency,reference,idempotency_key,created_by)
    VALUES(org,property_id,owner_id,past+22,future_debt,'USD','Existing later withdrawal','odr-future-withdrawal-'||n,actor);
  END IF;
  RETURN property_id;
END;
$$;
SELECT pg_temp.reconciliation_property(1,500,400);
SELECT pg_temp.reconciliation_property(2,500,0);
SELECT pg_temp.reconciliation_property(3,500,400,true);
SELECT pg_temp.reconciliation_property(4,500,0,false,true);
SELECT pg_temp.reconciliation_property(5,0,0,false,false,true);

SELECT is((SELECT count(*) FROM public.owner_component_movements WHERE organization_id='d4590000-0000-4000-8000-000000000001'),0::bigint,
  'legacy fixtures begin without owner component movements');

CREATE FUNCTION pg_temp.payout(n integer, amount numeric, request_key text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.record_owner_distribution('d4590000-0000-4000-8000-000000000001',
    ('d4590000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
    'd4590000-0000-4000-8000-000000000003','USD',amount,
    (date_trunc('month',current_date)-interval '1 month')::date+15,'Historical partial payout',request_key)
$$;
SELECT set_config('request.jwt.claim.sub','d4590000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;

SELECT throws_ok($$SELECT pg_temp.payout(2,900.01,'odr-historical-overdraw')$$,
  '23514','insufficient_authoritative_held_cash','historical capacity excludes the later 500 credit');
SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets WHERE property_id='d4590000-0000-4000-8001-000000000002'),0::bigint,
  'overdraw rolls back every prerequisite allocation');
SELECT is((SELECT count(*) FROM public.property_withdrawals WHERE property_id='d4590000-0000-4000-8001-000000000002'),0::bigint,
  'overdraw leaves no withdrawal');

SELECT throws_ok($$SELECT pg_temp.payout(3,800,'odr-future-debt-overdraw')$$,
  '23514','insufficient_authoritative_held_cash','payout cannot consume cash needed by a later debt before its later credit');
SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets WHERE property_id='d4590000-0000-4000-8001-000000000003'),0::bigint,
  'future debt failure rolls back the payout and all historical reconciliation');
SELECT is((SELECT count(*) FROM public.property_withdrawals WHERE property_id='d4590000-0000-4000-8001-000000000003'),1::bigint,
  'failed future validation preserves only the preexisting later withdrawal');

SELECT lives_ok($$SELECT pg_temp.payout(1,200,'odr-partial-success')$$,
  'partial historical payout reconciles original fee, legacy settlement and cash sources atomically');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'
    AND event_date <= (date_trunc('month',current_date)-interval '1 month')::date+15),700::numeric,
  'exact historical held cash is 1000 less 100 settlement less 200 payout');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'),800::numeric,
  'later 500 credit and 400 existing debt remain represented after the payout');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='owner_due_to_ips'),0::numeric,
  'fee obligation and legacy cash settlement cancel exactly');
SELECT is((SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='d4590000-0000-4000-8000-000000000001'),0::bigint,
  'reconciliation never manufactures an opening balance');
SELECT is((SELECT sum(c.consumed_amount) FROM public.owner_cash_source_consumptions c
  JOIN public.owner_component_movements m ON m.id=c.consumer_movement_id
  JOIN public.owner_event_owner_allocations a ON a.id=m.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets s ON s.id=a.allocation_set_id
  JOIN public.property_withdrawals w ON w.id=s.source_line_id
  WHERE w.idempotency_key='odr-partial-success'),200::numeric,
  'new payout retains exact cash-source consumption lineage');
SELECT is((pg_temp.payout(1,200,'odr-partial-success')->>'status'),'replayed',
  'same request replays even after the future consumer has been allocated');
SELECT is((SELECT count(*) FROM public.property_withdrawals WHERE property_id='d4590000-0000-4000-8001-000000000001'),2::bigint,
  'replay creates neither a second payout nor a duplicate future withdrawal');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'),800::numeric,
  'replay does not duplicate source movements');

SELECT throws_ok($$SELECT pg_temp.payout(4,900.01,'odr-prepaid-overdraw')$$,
  '23514','insufficient_authoritative_held_cash',
  'preallocating a later fee original never makes later cash available to the historical payout');
SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets WHERE property_id='d4590000-0000-4000-8001-000000000004'),0::bigint,
  'prepaid-fee overdraw rolls back the future original and earlier cash reconciliation');
SELECT lives_ok($$SELECT pg_temp.payout(4,200,'odr-prepaid-success')$$,
  'an earlier cash settlement can resolve its later-dated fee original before a valid partial payout');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000004' AND component='ips_held_owner_cash'
    AND event_date <= (date_trunc('month',current_date)-interval '1 month')::date+15),700::numeric,
  'prepaid fee consumes historical held cash without borrowing the later 500 contribution');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000004' AND component='owner_due_to_ips'
    AND event_date <= (date_trunc('month',current_date)-interval '1 month')::date+15),(-100)::numeric,
  'prepaid settlement retains its original earlier date rather than moving the future fee backwards');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000004' AND component='owner_due_to_ips'),0::numeric,
  'later original fee reconciles exactly with its earlier settlement');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000004' AND component='security_deposit_custody'),5000::numeric,
  'deposit receipts are reconciled as custody and never increase payout capacity');

SELECT lives_ok($$SELECT pg_temp.payout(5,5,'odr-same-day-replacement')$$,
  'same-day reversal restores the original 40 before its replacement consumes the 50 held cash');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
  WHERE property_id='d4590000-0000-4000-8001-000000000005' AND component='ips_held_owner_cash'),5::numeric,
  'same-day settlement chain leaves exactly 50 minus net40 minus payout5');
SELECT is((SELECT count(*) FROM public.owner_component_movements reversal
  JOIN public.owner_component_movements original ON original.id=reversal.reversal_of_movement_id
  JOIN public.owner_event_owner_allocations ra ON ra.id=reversal.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets rs ON rs.id=ra.allocation_set_id
  JOIN public.owner_event_owner_allocations oa ON oa.id=original.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets os ON os.id=oa.allocation_set_id
  WHERE rs.source_type='reversal' AND rs.source_line_id='d4590000-0000-4000-8002-000000000002'
    AND os.source_type='owner_invoice_payment' AND os.source_line_id='d4590000-0000-4000-8002-000000000001'
    AND reversal.component=original.component AND reversal.signed_amount=-original.signed_amount),2::bigint,
  'cash and owner-due reversals retain exact original movement lineage');
SELECT is((SELECT sum(c.consumed_amount) FROM public.owner_cash_source_consumptions c
  JOIN public.owner_component_movements m ON m.id=c.consumer_movement_id
  JOIN public.owner_event_owner_allocations a ON a.id=m.owner_event_owner_allocation_id
  JOIN public.owner_event_allocation_sets s ON s.id=a.allocation_set_id
  WHERE s.source_type='owner_invoice_payment' AND s.source_line_id='d4590000-0000-4000-8002-000000000003'),40::numeric,
  'replacement settlement records its own exact 40 cash consumption');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
