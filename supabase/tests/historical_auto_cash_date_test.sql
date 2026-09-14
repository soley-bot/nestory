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
 INSERT INTO public.tenant_invoice_lines(id,organization_id,invoice_id,income_item_id,line_type,customer_label,amount,sort_order,property_id,currency,recognized_on,created_by) VALUES(line,org,invoice,income,'rent','Rent',500,1,prop,'USD',past,actor);
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
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),0::bigint,
 'recording historical rent never settles a fee before its recognition date');
SELECT is(app_private.apply_available_owner_cash('d4600000-0000-4000-8000-000000000001',
 (SELECT property_id FROM auto_cash_fixture),(SELECT day+15 FROM auto_cash_fixture),'d4600000-0000-4000-8000-000000000010'),40::numeric,
 'automatic settlement still works on the recognition date despite a later invoice issue date');
SELECT is((SELECT min(allocation_date) FROM public.owner_charge_cash_allocations WHERE property_id=(SELECT property_id FROM auto_cash_fixture)),
 (SELECT day+15 FROM auto_cash_fixture),'automatic settlement retains the eligible date');
SELECT * FROM finish();
ROLLBACK;
