BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Isolated historical sources: no seed identities, synthetic openings or manual
-- component movements. All assertions exercise the authenticated posting RPC.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES ('d4600000-0000-4000-8000-000000000010', 'authenticated', 'authenticated',
  'historical-auto-cash@test.invalid', '{"provider":"email","providers":["email"]}', '{}');
INSERT INTO public.organizations (id, name, slug)
VALUES ('d4600000-0000-4000-8000-000000000001', 'Historical auto cash test', 'historical-auto-cash-test');
INSERT INTO public.organization_members (organization_id,user_id,role)
VALUES ('d4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people (id,organization_id,display_name)
VALUES ('d4600000-0000-4000-8000-000000000003','d4600000-0000-4000-8000-000000000001','Reconciliation owner');
INSERT INTO public.person_roles (organization_id,person_id,role,status)
VALUES ('d4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.person_roles (organization_id,person_id,role,status)
VALUES ('d4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000003','tenant','active');


CREATE TEMP TABLE auto_cash_fixture(property_id uuid, invoice_id uuid, line_id uuid, source_id uuid, day date);
DO $$
DECLARE
 org uuid := 'd4600000-0000-4000-8000-000000000001';
 actor uuid := 'd4600000-0000-4000-8000-000000000010';
 owner_id uuid := 'd4600000-0000-4000-8000-000000000003';
 prop uuid := gen_random_uuid(); lease uuid := gen_random_uuid(); term uuid := gen_random_uuid();
 invoice uuid := gen_random_uuid(); income uuid := gen_random_uuid(); line uuid := gen_random_uuid(); source uuid := gen_random_uuid();
 past date := (date_trunc('month',current_date)-interval '1 month')::date;
BEGIN
 INSERT INTO public.properties(id,organization_id,name,code,property_type) VALUES(prop,org,'Historical cash','HAC-1','Apartment');
 INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary) VALUES(org,prop,owner_id,100,past-365,true);
 INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id) VALUES(lease,org,prop,owner_id);
 INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,confirmed_by) VALUES(term,org,lease,prop,past,past+365,actor);
 INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount,created_by)
 VALUES(invoice,org,'HAC-TEN',prop,lease,term,past,(past+interval '1 month - 1 day')::date,past,past+5,'through_ips','individual',owner_id,'Tenant',500,actor);
 PERFORM set_config('app.rent_generation_context','lease-derived-v1',true);
 INSERT INTO public.finance_income_items(id,organization_id,property_id,payer_label,due_date,amount_due,income_type,lease_id) VALUES(income,org,prop,'Tenant',past+5,500,'rent',lease);
 INSERT INTO public.tenant_invoice_lines(id,organization_id,invoice_id,income_item_id,line_type,customer_label,description,amount,sort_order,property_id,currency,recognized_on,created_by) VALUES(line,org,invoice,income,'rent','Rent','Monthly rental for the garden apartment',500,1,prop,'USD',past,actor);
 INSERT INTO public.management_fee_occurrences(organization_id,property_id,lease_id,tenant_invoice_id,billing_term_id,fee_date,amount,fee_mode,fee_value,created_by)
 VALUES(org,prop,lease,invoice,term,past+20,40,'flat',40,actor);
 -- A later document issue date must not block a charge recognized earlier.
 UPDATE public.owner_invoices SET issue_date=past+25 WHERE property_id=prop;
 PERFORM set_config('app.financial_reconciliation_source_context','on',true);
 INSERT INTO public.financial_reconciliation_sources(id,organization_id,currency,code,display_name,source_kind,scope_kind) VALUES(source,org,'USD','HAC_BANK','Historical cash bank','bank','organization_pooled');
 INSERT INTO auto_cash_fixture VALUES(prop,invoice,line,source,past+5);
END $$;
GRANT SELECT ON auto_cash_fixture TO authenticated;
SELECT set_config('request.jwt.claim.sub','d4600000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.record_tenant_invoice_payment(
 'd4600000-0000-4000-8000-000000000001',invoice_id,500,day,source_id,'Historical receipt',
 jsonb_build_array(jsonb_build_object('lineId',line_id,'amount',500)),'historical-auto-cash-payment') FROM auto_cash_fixture$$,
 'historical rent can be recorded when a later fee already exists');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d4600000-0000-4000-8000-000000000010',true);
SELECT public.allocate_owner_event('d4600000-0000-4000-8000-000000000001','tenant_rent_receipt',id,'description-rent-allocation')
 FROM public.tenant_invoice_payment_allocations WHERE invoice_id=(SELECT invoice_id FROM auto_cash_fixture) AND reversal_of_allocation_id IS NULL;
SELECT is((SELECT app_private.owner_statement_source_description(organization_id,id)
 FROM public.owner_event_allocation_sets WHERE property_id=(SELECT property_id FROM auto_cash_fixture)
 AND source_type='tenant_rent_receipt'),'Monthly rental for the garden apartment',
 'owner statement resolves the actual rent invoice description after authenticated receipt posting');

SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),0::bigint,
 'recording historical rent never settles a fee before its recognition date');
SELECT is((SELECT count(*) FROM app_private.deferred_owner_cash WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),1::bigint,
 'future charge has a durable deferred settlement request');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((app_private.run_deferred_owner_cash((SELECT day::timestamp AT TIME ZONE 'UTC' FROM auto_cash_fixture))->>'failed'),'0',
 'scheduled worker can run before eligibility without allocating early');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),0::bigint,
 'scheduled worker never pays before recognition');
SELECT set_config('request.jwt.claim.sub','d4600000-0000-4000-8000-000000000010',true);
SELECT public.set_financial_month_lock('d4600000-0000-4000-8000-000000000001',(SELECT day FROM auto_cash_fixture),true,'Test deferred settlement lock');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((app_private.run_deferred_owner_cash((SELECT (day+15)::timestamp AT TIME ZONE 'UTC' FROM auto_cash_fixture))->>'failed'),'1',
 'scheduled settlement refuses a locked period');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),0::bigint,
 'locked-period failure leaves financial records unchanged');
SELECT set_config('request.jwt.claim.sub','d4600000-0000-4000-8000-000000000010',true);
SELECT public.set_financial_month_lock('d4600000-0000-4000-8000-000000000001',(SELECT day FROM auto_cash_fixture),false,'Unlock deferred settlement test');
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('d4600000-0000-4000-8000-000000000021','d4600000-0000-4000-8000-000000000001','Settlement branch','HAC-A','active'),
 ('d4600000-0000-4000-8000-000000000022','d4600000-0000-4000-8000-000000000001','Other branch','HAC-B','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
UPDATE public.properties SET branch_id='d4600000-0000-4000-8000-000000000021' WHERE id=(SELECT property_id FROM auto_cash_fixture);
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.financial_month_locks(organization_id,branch_id,month_start,is_locked,reason,locked_by,locked_at)
SELECT 'd4600000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000022',date_trunc('month',day)::date,true,'Other branch lock','d4600000-0000-4000-8000-000000000010',now() FROM auto_cash_fixture;
-- Fixture-only source dates exercise the pooled cash guard independently of UI.
SELECT app_private.set_finance_settlement_context(true);
UPDATE public.finance_receipts SET received_date=(SELECT day+40 FROM auto_cash_fixture)
 WHERE property_id=(SELECT property_id FROM auto_cash_fixture);
SELECT is((app_private.run_deferred_owner_cash((SELECT (day+16)::timestamp AT TIME ZONE 'UTC' FROM auto_cash_fixture))->>'failed'),'1',
 'future active rent cannot fund a scheduled settlement');
UPDATE public.finance_receipts SET received_date=(SELECT day FROM auto_cash_fixture)
 WHERE property_id=(SELECT property_id FROM auto_cash_fixture);
INSERT INTO public.finance_receipts(organization_id,property_id,received_date,amount,payer_label,reconciliation_source_id,settlement_contract_version)
SELECT 'd4600000-0000-4000-8000-000000000001',property_id,day+40,10,'Non-rent future receipt',source_id,'income_settlement.v1' FROM auto_cash_fixture;
SELECT app_private.set_finance_settlement_context(false);
SELECT is((app_private.run_deferred_owner_cash((SELECT (day+16)::timestamp AT TIME ZONE 'UTC' FROM auto_cash_fixture))->>'failed'),'0',
 'delayed settlement ignores another branch lock and unrelated future non-rent receipts');
SELECT is((SELECT sum(amount) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),40::numeric,
 'scheduled settlement applies exactly the outstanding fee');
SELECT is((SELECT min(allocation_date) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),
 (SELECT day+16 FROM auto_cash_fixture),'delayed settlement records actual processing date rather than inventing past cash movement');
SELECT is((SELECT count(*) FROM app_private.deferred_owner_cash WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),0::bigint,
 'fully settled charge leaves the queue');
SELECT app_private.run_deferred_owner_cash((SELECT (day+15)::timestamp AT TIME ZONE 'UTC' FROM auto_cash_fixture));
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),1::bigint,
 'repeated scheduled run does not duplicate settlement');
SELECT ok(NOT has_function_privilege('authenticated','app_private.run_deferred_owner_cash(timestamptz)','EXECUTE'),
 'browser users cannot invoke the scheduler');
SELECT * FROM finish();
ROLLBACK;
