BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();

CREATE TEMP TABLE invoice_page_state AS SELECT gen_random_uuid() org,gen_random_uuid() other_org,
  gen_random_uuid() actor,gen_random_uuid() denied_actor,gen_random_uuid() role_id,
  gen_random_uuid() branch_a,gen_random_uuid() branch_b;
GRANT SELECT ON invoice_page_state TO authenticated;
INSERT INTO auth.users(id,email) SELECT actor,actor||'@invoice-page.test' FROM invoice_page_state UNION ALL
  SELECT denied_actor,denied_actor||'@invoice-page.test' FROM invoice_page_state;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Invoice page','page-'||org FROM invoice_page_state UNION ALL
  SELECT other_org,'Other invoice page','page-'||other_org FROM invoice_page_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
  SELECT branch_a,org,'A','A','active' FROM invoice_page_state UNION ALL SELECT branch_b,org,'B','B','active' FROM invoice_page_state;
INSERT INTO public.organization_roles(id,organization_id,name,status) SELECT role_id,org,'Invoice finance reader','active' FROM invoice_page_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
  SELECT org,role_id,'finance.view' FROM invoice_page_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
  SELECT org,actor,'custom',branch_a,role_id FROM invoice_page_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM invoice_page_state);
CREATE TEMP TABLE invoice_page_properties AS SELECT kind,
  CASE WHEN kind='other_org' THEN other_org ELSE org END organization_id,
  CASE WHEN kind='hidden' THEN branch_b WHEN kind='other_org' THEN NULL ELSE branch_a END branch_id,
  gen_random_uuid() property_id,gen_random_uuid() unit_id,gen_random_uuid() lease_id,
  gen_random_uuid() billing_id,gen_random_uuid() tenant_id,gen_random_uuid() owner_id
FROM invoice_page_state CROSS JOIN unnest(ARRAY['primary','sibling','hidden','other_org']) kind;
GRANT SELECT ON invoice_page_properties TO authenticated;
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
  SELECT property_id,organization_id,branch_id,upper(kind),'House '||kind,'apartment','multi_unit' FROM invoice_page_properties;
ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
  SELECT unit_id,organization_id,property_id,'7F-D2','vacant' FROM invoice_page_properties;
ALTER TABLE public.units ENABLE TRIGGER USER;
INSERT INTO public.people(id,organization_id,display_name)
  SELECT tenant_id,organization_id,'Tenant '||kind FROM invoice_page_properties UNION ALL
  SELECT owner_id,organization_id,'Morgan '||kind FROM invoice_page_properties;
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,is_primary,started_on)
  SELECT organization_id,property_id,owner_id,100,true,'1900-01-01' FROM invoice_page_properties;
ALTER TABLE public.property_owners ENABLE TRIGGER USER;
ALTER TABLE public.leases DISABLE TRIGGER USER;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status)
  SELECT lease_id,organization_id,property_id,unit_id,tenant_id,'active' FROM invoice_page_properties;
ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.lease_billing_terms DISABLE TRIGGER USER;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,confirmed_by)
  SELECT billing_id,organization_id,lease_id,property_id,'1900-01-01','2300-12-31',s.actor FROM invoice_page_properties CROSS JOIN invoice_page_state s;
ALTER TABLE public.lease_billing_terms ENABLE TRIGGER USER;
CREATE TEMP TABLE invoice_page_rows AS SELECT p.*,n,gen_random_uuid() invoice_id,gen_random_uuid() income_id,
  gen_random_uuid() line_id,gen_random_uuid() confirmation_id FROM invoice_page_properties p,
  LATERAL generate_series(1,CASE WHEN kind='primary' THEN 1551 ELSE 1 END) n;
GRANT SELECT ON invoice_page_rows TO authenticated;
-- Synthetic sources are confined to this rollback-only test. Disable user
-- posting hooks while retaining FK/check constraints; exercise real read RPCs.
ALTER TABLE public.tenant_invoices DISABLE TRIGGER USER;
INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,unit_id,lease_id,billing_term_id,
  billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,occupant_labels,total_amount,created_by)
  SELECT invoice_id,r.organization_id,'PAGE-'||kind||'-'||n,property_id,unit_id,lease_id,billing_id,
    ('1900-01-01'::date+(n-1)*interval '1 month')::date,('1900-01-01'::date+n*interval '1 month'-interval '1 day')::date,
    current_date-21,current_date-20,'direct_to_owner','individual',tenant_id,'Tenant '||kind,ARRAY['Occupant '||kind],10.25,s.actor
  FROM invoice_page_rows r CROSS JOIN invoice_page_state s;
ALTER TABLE public.tenant_invoices ENABLE TRIGGER USER;
ALTER TABLE public.finance_income_items DISABLE TRIGGER USER;
INSERT INTO public.finance_income_items(id,organization_id,property_id,unit_id,lease_id,income_type,payer_label,due_date,amount_due)
  SELECT income_id,organization_id,property_id,unit_id,lease_id,'rent','Tenant',current_date-20,10.25 FROM invoice_page_rows;
ALTER TABLE public.finance_income_items ENABLE TRIGGER USER;
ALTER TABLE public.tenant_invoice_lines DISABLE TRIGGER USER;
INSERT INTO public.tenant_invoice_lines(id,organization_id,property_id,unit_id,currency,recognized_on,invoice_id,income_item_id,line_type,customer_label,amount,sort_order)
  SELECT line_id,organization_id,property_id,unit_id,'USD',current_date-20,invoice_id,income_id,'rent','Monthly rent',10.25,1 FROM invoice_page_rows;
ALTER TABLE public.tenant_invoice_lines ENABLE TRIGGER USER;
ALTER TABLE public.owner_collection_confirmations DISABLE TRIGGER USER;
INSERT INTO public.owner_collection_confirmations(id,organization_id,invoice_id,owner_person_id,confirmation_number,confirmed_date,amount)
  SELECT confirmation_id,organization_id,invoice_id,owner_id,'CONF-'||n,current_date-20,10.25 FROM invoice_page_rows WHERE kind='primary' AND n>1251;
ALTER TABLE public.owner_collection_confirmations ENABLE TRIGGER USER;
ALTER TABLE public.owner_collection_confirmation_allocations DISABLE TRIGGER USER;
INSERT INTO public.owner_collection_confirmation_allocations(organization_id,confirmation_id,invoice_id,invoice_line_id,income_item_id,amount,allocation_order,signed_amount)
  SELECT organization_id,confirmation_id,invoice_id,line_id,income_id,10.25,1,10.25 FROM invoice_page_rows WHERE kind='primary' AND n>1251;
ALTER TABLE public.owner_collection_confirmation_allocations ENABLE TRIGGER USER;

SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM invoice_page_state),true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE invoice_page_result AS SELECT public.get_rent_invoice_page(s.org,p.property_id,p_page=>2,
  p_selected_invoice_id=>(SELECT invoice_id FROM invoice_page_rows WHERE kind='primary' ORDER BY invoice_id DESC LIMIT 1)) result
  FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is(jsonb_array_length(result->'invoices'),50,'only 50 invoice balance rows leave the database') FROM invoice_page_result;
SELECT is((result#>>'{pagination,totalCount}')::integer,1551,'count includes all 1551 invoices beyond the API cap') FROM invoice_page_result;
SELECT is((result#>>'{pagination,totalPages}')::integer,32,'page count includes every paid history row') FROM invoice_page_result;
SELECT is((result#>>'{totalsByCurrency,0,outstanding}')::numeric,12822.75::numeric,'outstanding uses all 1251 open invoices') FROM invoice_page_result;
SELECT is((result#>>'{totalsByCurrency,0,collected}')::numeric,3075::numeric,'collected includes 300 older paid invoices') FROM invoice_page_result;
SELECT is(result#>>'{totalsByCurrency,0,currency}','USD','totals retain explicit currency') FROM invoice_page_result;
SELECT is(result#>>'{selectedInvoice,id}',(SELECT invoice_id::text FROM invoice_page_rows WHERE kind='primary' ORDER BY invoice_id DESC LIMIT 1),'report selection survives outside the page') FROM invoice_page_result;
SELECT is((SELECT count(*)::integer FROM public.people WHERE organization_id=(SELECT org FROM invoice_page_state)),0,'finance-only users still cannot enumerate People');
SELECT is((SELECT count(*)::integer FROM public.properties WHERE organization_id=(SELECT org FROM invoice_page_state)),0,'projection adds no property-table authority');
SELECT ok(NOT EXISTS(SELECT 1 FROM invoice_page_result,LATERAL jsonb_array_elements(result->'invoices') row
  WHERE row->>'property_id'<>(SELECT property_id::text FROM invoice_page_properties WHERE kind='primary')),'page excludes sibling and hidden properties');
SELECT ok(NOT EXISTS(SELECT 1 FROM invoice_page_result,invoice_page_properties hidden WHERE hidden.kind IN ('hidden','other_org')
  AND strpos(result::text,hidden.property_id::text)>0),'page and selector metadata exclude hidden branch and other company');

CREATE TEMP TABLE invoice_all_pages AS SELECT page,public.get_rent_invoice_page(s.org,p.property_id,p_page=>page) result
FROM invoice_page_state s CROSS JOIN invoice_page_properties p CROSS JOIN generate_series(1,32) page WHERE p.kind='primary';
SELECT is((SELECT count(*)::integer FROM invoice_all_pages,LATERAL jsonb_array_elements(result->'invoices') row),1551,'all pages cover the full register');
SELECT is((SELECT count(DISTINCT row->>'id')::integer FROM invoice_all_pages,LATERAL jsonb_array_elements(result->'invoices') row),1551,'equal due dates cause no duplicate or missing rows');
SELECT results_eq(
  $$SELECT row->>'id' FROM invoice_all_pages,LATERAL jsonb_array_elements(result->'invoices') WITH ORDINALITY x(row,ordinal) ORDER BY page,ordinal$$,
  $$SELECT invoice_id::text FROM invoice_page_rows WHERE kind='primary' ORDER BY invoice_id$$,
  'due-date ties use the unique invoice ID order across pages');
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_status=>'paid',p_page=>6)#>>'{pagination,totalCount}')::integer,300,'paid filter includes older history beyond 250')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is(jsonb_array_length(public.get_rent_invoice_page(s.org,p.property_id,p_status=>'paid',p_page=>6)->'invoices'),50,'last paid page is reachable')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_query=>'MORGAN 7FD2 monthly')#>>'{pagination,totalCount}')::integer,1551,'owner, compact unit and line tokens match across full history')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_query=>'primary sibling')#>>'{pagination,totalCount}')::integer,0,'tokens must match the same invoice')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_status=>'open',p_overdue_days=>7)#>>'{pagination,totalCount}')::integer,1251,'aging excludes settled invoices')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_page=>2147483647)#>>'{pagination,page}')::integer,32,'out of range pages clamp without overflow')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT throws_ok(format('SELECT public.get_rent_invoice_page(%L,%L)',s.org,p.property_id),'42501',NULL,'explicit hidden property fails closed')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='hidden';
SELECT throws_ok(format('SELECT public.get_rent_invoice_page(%L)',other_org),'42501',NULL,'cross-company access fails closed') FROM invoice_page_state;
SELECT throws_ok(format('SELECT public.get_rent_invoice_page(%L,p_page_size=>1000)',org),'22023',NULL,'caller cannot remove the page bound') FROM invoice_page_state;
SELECT is(public.get_rent_invoice_page(s.org,p.property_id,p_selected_invoice_id=>hidden.invoice_id)->'selectedInvoice','null'::jsonb,'selected invoice cannot escape branch scope')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p CROSS JOIN invoice_page_rows hidden WHERE p.kind='primary' AND hidden.kind='hidden';
SELECT is((public.get_rent_invoice_page(s.org,p.property_id,p_unit_id=>p.unit_id,p_lease_id=>p.lease_id)#>>'{pagination,totalCount}')::integer,1551,'unit and lease context is applied before paging')
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';

-- Reproducible synthetic transfer comparison. The old invoker view can spend
-- much longer evaluating RLS than the authorized projection. Bound diagnostics
-- so a slow benchmark cannot discard completed correctness assertions.
RESET ROLE;
CREATE FUNCTION pg_temp.invoice_old_transfer(org uuid,property uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE result jsonb; BEGIN
  SELECT jsonb_build_object('old_actionable_rows',count(*),'old_actionable_json_bytes',octet_length(jsonb_agg(to_jsonb(invoice))::text)) INTO result
  FROM public.tenant_invoice_balances invoice WHERE invoice.organization_id=org AND invoice.property_id=property AND invoice.balance_due>0;
  RETURN result::text;
EXCEPTION WHEN query_canceled THEN RETURN '{"old_query_timed_out":true,"timeout_ms":5000}'; END; $$;
CREATE FUNCTION pg_temp.invoice_explain(query text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE plan json; BEGIN EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '||query INTO plan; RETURN plan::text;
EXCEPTION WHEN query_canceled THEN RETURN '{"explain_timed_out":true,"timeout_ms":5000}'; END; $$;
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout='5s';
SELECT diag(jsonb_build_object('synthetic_benchmark',true,'fixture_open_invoice_count',1251,
  'new_page_rows',jsonb_array_length(result->'invoices'),'new_page_json_bytes',octet_length((result->'invoices')::text),
  'new_response_json_bytes',octet_length(result::text))::text) FROM invoice_page_result;
SELECT diag(pg_temp.invoice_old_transfer(s.org,p.property_id)) FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT diag('Synthetic old actionable plan: '||pg_temp.invoice_explain(format(
  'SELECT * FROM public.tenant_invoice_balances WHERE organization_id=%L AND property_id=%L AND balance_due>0 ORDER BY due_date DESC,id',s.org,p.property_id)))
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SELECT diag('Synthetic bounded RPC plan: '||pg_temp.invoice_explain(format(
  'SELECT public.get_rent_invoice_page(%L,%L)',s.org,p.property_id)))
FROM invoice_page_state s CROSS JOIN invoice_page_properties p WHERE p.kind='primary';
SET LOCAL statement_timeout=0;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT denied_actor::text FROM invoice_page_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_rent_invoice_page(%L)',org),'42501',NULL,'actor without finance permission is denied') FROM invoice_page_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_rent_invoice_page(%L)',org),'28000',NULL,'missing authenticated identity is denied') FROM invoice_page_state;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
