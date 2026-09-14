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

CREATE FUNCTION pg_temp.reconciliation_property(n integer, future_credit numeric, future_debt numeric, credit_after_debt boolean DEFAULT false, prepaid_fee boolean DEFAULT false, same_day_replacement boolean DEFAULT false, opening_cash numeric DEFAULT 1000, cash_day integer DEFAULT 1)
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
  VALUES(cash_id,org,property_id,line_id,past+cash_day,fee_amount,actor);
  IF same_day_replacement THEN
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by,reversal_of_id)
    VALUES('d4590000-0000-4000-8002-000000000002',org,property_id,line_id,past+1,-40,actor,cash_id);
    INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by)
    VALUES('d4590000-0000-4000-8002-000000000003',org,property_id,line_id,past+1,40,actor);
  END IF;
  -- The legacy source exists, but its owner event has never been allocated.
  PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
  INSERT INTO public.owner_cash_events(organization_id,property_id,owner_person_id,currency,event_type,event_date,amount,reason,idempotency_key,payload_hash,created_by)
  VALUES(org,property_id,owner_id,'USD','owner_contribution',past,CASE WHEN same_day_replacement THEN 50 ELSE opening_cash END,'Historical source','odr-source-'||n,repeat('a',64),actor);
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
SELECT pg_temp.reconciliation_property(1,0,0);
SELECT pg_temp.reconciliation_property(2,0,0);
CREATE TEMP TABLE fee_date_state AS
SELECT c.id AS allocation_id,c.property_id,c.allocation_date,c.amount,
 l.id AS line_id, f.lease_id,
 NULL::jsonb AS preview, NULL::jsonb AS result
FROM public.owner_charge_cash_allocations c
JOIN public.owner_invoice_lines l ON l.id=c.owner_invoice_line_id
JOIN public.management_fee_occurrences f ON f.id=l.source_id
WHERE c.organization_id='d4590000-0000-4000-8000-000000000001';
GRANT ALL ON fee_date_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','d4590000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.list_fee_payment_date_candidates(
 'd4590000-0000-4000-8000-000000000001',(SELECT lease_id FROM fee_date_state LIMIT 1))),1,
 'authorized staff can select an existing fee cash settlement');

UPDATE fee_date_state SET preview=public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+10);
SELECT ok((SELECT bool_and((preview->>'canApply')::boolean) FROM fee_date_state),
 'funded later-date correction previews successfully');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations
 WHERE organization_id='d4590000-0000-4000-8000-000000000001'),2::bigint,
 'preview never leaves reversal or replacement cash rows');
SELECT is((SELECT count(*) FROM public.owner_component_movements
 WHERE organization_id='d4590000-0000-4000-8000-000000000001'),0::bigint,
 'preview leaves no canonicalization side effects');

UPDATE fee_date_state SET result=public.correct_fee_payment_date(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+10,
 'Actual deduction date from legacy statement',preview->>'previewHash','fee-date-correct-1')
WHERE property_id='d4590000-0000-4000-8001-000000000001';
SELECT ok((SELECT result->>'correctionId' IS NOT NULL FROM fee_date_state
 WHERE property_id='d4590000-0000-4000-8001-000000000001'),'correction returns an audit identity');
SELECT is((SELECT c.allocation_date FROM public.owner_charge_cash_allocations c
 JOIN fee_date_state s ON s.allocation_id=c.id WHERE s.property_id='d4590000-0000-4000-8001-000000000001'),
 (SELECT allocation_date FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000001'),
 'original cash record retains its date');
SELECT is((SELECT sum(amount) FROM public.owner_charge_cash_allocations
 WHERE property_id='d4590000-0000-4000-8001-000000000001'),100::numeric,
 'correction leaves total fee cash unchanged');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations
 WHERE property_id='d4590000-0000-4000-8001-000000000001'),3::bigint,
 'correction appends one reversal and one replacement');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'),900::numeric,
 'current owner cash is unchanged');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'
 AND event_date<=(SELECT allocation_date+5 FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000001')),1000::numeric,
 'cash is restored between original and corrected dates');
SELECT is((SELECT public.correct_fee_payment_date(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+10,
 'Actual deduction date from legacy statement',preview->>'previewHash','fee-date-correct-1')->>'correctionId'
 FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000001'),
 (SELECT result->>'correctionId' FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000001'),
 'retry returns the same correction without duplicating cash');
SELECT ok(NOT (public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',
 (SELECT allocation_id FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000002'),
 (SELECT allocation_date-2 FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000002'))->>'canApply')::boolean,
 'correction before cash arrival is blocked');
SELECT public.set_financial_month_lock('d4590000-0000-4000-8000-000000000001',
 (SELECT allocation_date FROM fee_date_state LIMIT 1),true,'Protect original payment period');
SELECT ok(NOT (public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',
 (SELECT allocation_id FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000002'),
 (SELECT allocation_date+10 FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000002'))->>'canApply')::boolean,
 'locked original period blocks date correction');
SELECT public.set_financial_month_lock('d4590000-0000-4000-8000-000000000001',
 (SELECT allocation_date FROM fee_date_state LIMIT 1),false,'Release test lock');
SELECT public.record_owner_distribution('d4590000-0000-4000-8000-000000000001',
 'd4590000-0000-4000-8001-000000000002','d4590000-0000-4000-8000-000000000003',
 'USD',100,current_date,'Changed after fee preview','fee-date-stale-payout');
SELECT throws_ok($$SELECT public.correct_fee_payment_date(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+10,
 'Actual deduction date from legacy statement',preview->>'previewHash','fee-date-stale')
 FROM fee_date_state WHERE property_id='d4590000-0000-4000-8001-000000000002'$$,
 '40001',NULL,'another financial action invalidates the old preview');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations
 WHERE property_id='d4590000-0000-4000-8001-000000000002'),1::bigint,
 'stale confirmation leaves no partial correction');
SELECT set_config('request.jwt.claim.sub','d4590000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.list_fee_payment_date_candidates(
 'd4590000-0000-4000-8000-000000000001',(SELECT lease_id FROM fee_date_state LIMIT 1))$$,
 '42501',NULL,'unrelated user cannot read settlement candidates');
SELECT throws_ok($$SELECT public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+10)
 FROM fee_date_state LIMIT 1$$,'42501',NULL,'unrelated user cannot preview a correction');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d4590000-0000-4000-8000-000000000010',true);
SELECT pg_temp.reconciliation_property(3,0,0,false,true);
SELECT pg_temp.reconciliation_property(4,100,950,true,false,false,1000,25);
SET LOCAL ROLE authenticated;
SELECT ok((public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',
 (SELECT id FROM public.owner_charge_cash_allocations WHERE property_id='d4590000-0000-4000-8001-000000000003'),
 (date_trunc('month',current_date)-interval '1 month')::date+27)->>'canApply')::boolean,
 'legacy automatic payment before fee recognition can be corrected to the actual later date');
SELECT ok(NOT (public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',
 (SELECT id FROM public.owner_charge_cash_allocations WHERE property_id='d4590000-0000-4000-8001-000000000004'),
 (date_trunc('month',current_date)-interval '1 month')::date+10)->>'canApply')::boolean,
 'moving a payment earlier cannot underfund an intervening payout despite sufficient current cash');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations
 WHERE property_id='d4590000-0000-4000-8001-000000000004'),1::bigint,
 'failed dated balance preview leaves original cash untouched');
UPDATE fee_date_state SET allocation_id=(SELECT c.replacement_allocation_id
 FROM public.fee_payment_date_corrections c WHERE c.id=(fee_date_state.result->>'correctionId')::uuid)
WHERE result IS NOT NULL;
UPDATE fee_date_state SET preview=public.preview_fee_payment_date_correction(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+5)
WHERE result IS NOT NULL;
SELECT ok((SELECT (preview->>'canApply')::boolean FROM fee_date_state WHERE result IS NOT NULL),
 'a corrected settlement can later be moved to another funded earlier date');
SELECT lives_ok($$SELECT public.correct_fee_payment_date(
 'd4590000-0000-4000-8000-000000000001',allocation_id,allocation_date+5,
 'Second source-backed date correction',preview->>'previewHash','fee-date-correct-again')
 FROM fee_date_state WHERE result IS NOT NULL$$,'correction chains preserve reusable settlement history');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE property_id='d4590000-0000-4000-8001-000000000001' AND component='ips_held_owner_cash'),900::numeric,
 'a second correction does not create additional cash');
SELECT is((SELECT reason FROM public.fee_payment_date_corrections WHERE idempotency_key='fee-date-correct-again'),
 'Second source-backed date correction','staff correction reason remains readable in audit history');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
