BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE rent_complete_fixture AS SELECT gen_random_uuid() org,gen_random_uuid() property_id,
 gen_random_uuid() tenant,gen_random_uuid() owner_id,gen_random_uuid() actor,date_trunc('month',current_date)::date AS month;
CREATE TEMP TABLE rent_complete_leases AS SELECT kind,gen_random_uuid() id,gen_random_uuid() term_id,
 gen_random_uuid() billing_id,gen_random_uuid() invoice_id,gen_random_uuid() income_id FROM unnest(
 ARRAY['expired_active','active','partial_then_free','ended_overlap','ended_past','draft','future','zero']) kind;

-- Synthetic fixture only, isolated in this rollback-only test. Suppress domain
-- posting hooks during setup; all behavior assertions below run with hooks on.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) SELECT actor,actor||'@rent-completeness.test' FROM rent_complete_fixture;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Rent completeness fixture','rent-'||org FROM rent_complete_fixture;
INSERT INTO public.people(id,organization_id,display_name) SELECT tenant,org,'Synthetic tenant' FROM rent_complete_fixture
 UNION ALL SELECT owner_id,org,'Synthetic owner' FROM rent_complete_fixture;
INSERT INTO public.properties(id,organization_id,name,code,property_type)
 SELECT property_id,org,'Synthetic rent property','RENT','apartment' FROM rent_complete_fixture;
INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id,status)
 SELECT l.id,f.org,f.property_id,f.tenant,CASE WHEN l.kind LIKE 'ended%' THEN 'ended' WHEN l.kind='draft' THEN 'draft' ELSE 'active' END
 FROM rent_complete_leases l CROSS JOIN rent_complete_fixture f;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
 rent_due_day,payment_frequency,status,confirmed_at,confirmed_by)
 SELECT l.term_id,f.org,l.id,1,CASE WHEN l.kind='future' THEN (f.month+interval '2 months')::date ELSE f.month-60 END,
 CASE WHEN l.kind IN ('expired_active','ended_past') THEN f.month-1
   WHEN l.kind='partial_then_free' THEN f.month+13 ELSE (f.month+interval '3 months')::date END,
 CASE WHEN l.kind='zero' THEN 0 ELSE 100 END,'USD'::public.currency_code,
 1,'monthly','active',now(),f.actor FROM rent_complete_leases l CROSS JOIN rent_complete_fixture f;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
 rent_due_day,payment_frequency,status,confirmed_at,confirmed_by)
 SELECT gen_random_uuid(),f.org,l.id,2,f.month+14,(f.month+interval '3 months')::date,0,'USD',
 1,'monthly','active',now(),f.actor FROM rent_complete_leases l CROSS JOIN rent_complete_fixture f
 WHERE l.kind='partial_then_free';
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,confirmed_by)
 SELECT l.billing_id,f.org,l.id,f.property_id,f.month-60,(f.month+interval '3 months')::date,f.actor
 FROM rent_complete_leases l CROSS JOIN rent_complete_fixture f;
SET LOCAL session_replication_role=origin;
CREATE FUNCTION pg_temp.rent_completeness() RETURNS jsonb LANGUAGE sql AS $$
 SELECT app_private.owner_month_rent_completeness(org,property_id,'USD',month) FROM rent_complete_fixture;
$$;
SELECT is(jsonb_array_length(pg_temp.rent_completeness()->'expected'),4,'active expired and historical overlapping leases require rent; draft future and wholly free do not');
SELECT is(jsonb_array_length(pg_temp.rent_completeness()->'gaps'),4,'absence of invoices cannot appear as zero income');
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.rent_completeness()->'gaps') g
 WHERE g->>'lease_id'=(SELECT id::text FROM rent_complete_leases WHERE kind='partial_then_free')),
 'a later zero-rent term does not erase an earlier charged segment of the month');
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.rent_completeness()->'gaps') g
 WHERE g->>'lease_id'=(SELECT id::text FROM rent_complete_leases WHERE kind='expired_active')),'expired continuing lease is explicitly incomplete');
SELECT ok(app_private.build_owner_close_readiness(f.org,f.property_id,f.owner_id,'USD',f.month)->'blockers'
 @> '[{"code":"monthly_rent_invoice_missing"}]'::jsonb,'owner-close readiness exposes a billing completeness blocker') FROM rent_complete_fixture f;
SELECT throws_ok($$INSERT INTO public.owner_close_revisions(organization_id,property_id,owner_person_id,currency,month_start,status)
 SELECT org,property_id,owner_id,'USD',month,'closed' FROM rent_complete_fixture$$,
 '23514','owner_month_rent_incomplete','closed revision guard rejects missing billing before accepting authority');
CREATE TEMP TABLE rent_hash_before AS SELECT s.input_hash FROM rent_complete_fixture f CROSS JOIN LATERAL
 app_private.owner_close_input_snapshot(f.org,f.property_id,f.owner_id,'USD',f.month) s;

SET LOCAL session_replication_role=replica;
INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,
 billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount)
 SELECT l.invoice_id,f.org,'RENT-'||l.kind,f.property_id,l.id,l.billing_id,f.month,(f.month+interval '1 month'-interval '1 day')::date,
 f.month,f.month,'through_ips','individual',f.tenant,'Synthetic tenant',100
 FROM rent_complete_fixture f CROSS JOIN rent_complete_leases l WHERE l.kind IN ('expired_active','active','partial_then_free','ended_overlap');
INSERT INTO public.finance_income_items(id,organization_id,property_id,lease_id,income_type,payer_label,due_date,amount_due)
 SELECT l.income_id,f.org,f.property_id,l.id,'rent','Synthetic tenant',f.month,100
 FROM rent_complete_fixture f CROSS JOIN rent_complete_leases l WHERE l.kind IN ('expired_active','active','partial_then_free','ended_overlap');
INSERT INTO public.tenant_invoice_lines(organization_id,invoice_id,income_item_id,line_type,customer_label,amount,sort_order,property_id,currency,recognized_on)
 SELECT f.org,l.invoice_id,l.income_id,CASE WHEN l.kind='active' THEN 'other' ELSE 'rent' END,'Synthetic charge',100,1,f.property_id,'USD',f.month
 FROM rent_complete_fixture f CROSS JOIN rent_complete_leases l WHERE l.kind IN ('expired_active','active','partial_then_free','ended_overlap');
SET LOCAL session_replication_role=origin;
SELECT is(jsonb_array_length(pg_temp.rent_completeness()->'gaps'),1,'issued non-rent invoice does not satisfy rent completeness');
SELECT isnt((SELECT s.input_hash FROM rent_complete_fixture f CROSS JOIN LATERAL
 app_private.owner_close_input_snapshot(f.org,f.property_id,f.owner_id,'USD',f.month) s),
 (SELECT input_hash FROM rent_hash_before),'close fingerprint changes when invoice completeness changes');
SET LOCAL session_replication_role=replica;
UPDATE public.tenant_invoice_lines SET line_type='rent' WHERE invoice_id=(SELECT invoice_id FROM rent_complete_leases WHERE kind='active');
SET LOCAL session_replication_role=origin;
SELECT is(jsonb_array_length(pg_temp.rent_completeness()->'gaps'),0,'one issued rent invoice satisfies each expected lease');
SELECT ok(NOT(app_private.build_owner_close_readiness(f.org,f.property_id,f.owner_id,'USD',f.month)->'blockers'
 @> '[{"code":"monthly_rent_invoice_missing"}]'::jsonb),'billing blocker clears while independent readiness rules remain') FROM rent_complete_fixture f;
SET LOCAL session_replication_role=replica;
UPDATE public.tenant_invoices SET lifecycle='void',voided_at=now(),voided_by=(SELECT actor FROM rent_complete_fixture)
 WHERE id=(SELECT invoice_id FROM rent_complete_leases WHERE kind='active');
SET LOCAL session_replication_role=origin;
SELECT is(jsonb_array_length(pg_temp.rent_completeness()->'gaps'),1,'void rent invoice does not certify billing completeness');
SELECT * FROM finish();
ROLLBACK;
