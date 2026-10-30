BEGIN;
SET search_path = public, extensions;
SET LOCAL statement_timeout = '120s';
-- Rollback-only synthetic data and raw TAP work with pg_prove and native PG.
CREATE TEMP TABLE search_assertions(n integer);
INSERT INTO search_assertions VALUES(0);
CREATE FUNCTION pg_temp.search_ok(p_ok boolean,p_label text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_n integer;
BEGIN
  UPDATE pg_temp.search_assertions SET n=n+1 RETURNING n INTO v_n;
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'not ok % - %',v_n,p_label; END IF;
  RETURN 'ok '||v_n||' - '||p_label;
END; $$;
CREATE FUNCTION pg_temp.search_is(p_actual anycompatible,p_expected anycompatible,p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.search_ok(p_actual IS NOT DISTINCT FROM p_expected,
    CASE WHEN p_actual IS DISTINCT FROM p_expected THEN p_label||format(' [actual=%s expected=%s]',p_actual,p_expected) ELSE p_label END);
$$;
CREATE FUNCTION pg_temp.search_rejects(p_sql text,p_label text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation THEN v_failed:=true; END;
  RETURN pg_temp.search_ok(v_failed,p_label);
END; $$;
CREATE TEMP TABLE search_state AS SELECT gen_random_uuid() org,gen_random_uuid() other_org,
  gen_random_uuid() admin,gen_random_uuid() restricted,gen_random_uuid() lease_reader,gen_random_uuid() denied,
  gen_random_uuid() branch_a,gen_random_uuid() branch_b,gen_random_uuid() reader_role,gen_random_uuid() lease_role,gen_random_uuid() denied_role;
GRANT SELECT ON search_state TO authenticated;
INSERT INTO auth.users(id,email) SELECT id,id||'@search-test.invalid' FROM search_state s,
  LATERAL unnest(ARRAY[s.admin,s.restricted,s.lease_reader,s.denied]) id;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Synthetic search','search-'||org FROM search_state
  UNION ALL SELECT other_org,'Other search','search-'||other_org FROM search_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
  SELECT branch_a,org,'A','A','active' FROM search_state UNION ALL SELECT branch_b,org,'B','B','active' FROM search_state;
INSERT INTO public.organization_roles(id,organization_id,name,status)
  SELECT reader_role,org,'Search reader','active' FROM search_state UNION ALL
  SELECT lease_role,org,'Lease search only','active' FROM search_state UNION ALL
  SELECT denied_role,org,'No search authority','active' FROM search_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
  SELECT org,reader_role,p::public.organization_permission_key FROM search_state CROSS JOIN unnest(ARRAY['properties.view','leases.view','finance.view','maintenance.view']) p
  UNION ALL SELECT org,lease_role,'leases.view' FROM search_state
  UNION ALL SELECT org,denied_role,'people.view' FROM search_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
  SELECT org,admin,'super_admin',NULL,NULL FROM search_state UNION ALL
  SELECT org,restricted,'custom',branch_a,reader_role FROM search_state UNION ALL
  SELECT org,lease_reader,'custom',branch_a,lease_role FROM search_state UNION ALL
  SELECT org,denied,'custom',branch_a,denied_role FROM search_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM search_state);
CREATE TEMP TABLE search_properties AS SELECT i,gen_random_uuid() id,gen_random_uuid() unit_id,
  gen_random_uuid() lease_id,gen_random_uuid() tenant_id FROM generate_series(1,1200) i;
CREATE TEMP TABLE search_rows AS SELECT i,gen_random_uuid() document_id,gen_random_uuid() ledger_id,gen_random_uuid() event_id,
  ((i-1)%1200)+1 property_number FROM generate_series(1,10000) i;
GRANT SELECT ON search_properties,search_rows TO authenticated;
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
  SELECT p.id,s.org,CASE WHEN p.i<=600 THEN s.branch_a ELSE s.branch_b END,'SEARCH-'||p.i,'Shared property '||p.i,'apartment','multi_unit'
  FROM search_properties p CROSS JOIN search_state s;
ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
  SELECT p.unit_id,s.org,p.id,'U'||p.i,'vacant' FROM search_properties p CROSS JOIN search_state s;
ALTER TABLE public.units ENABLE TRIGGER USER;
INSERT INTO public.people(id,organization_id,display_name)
  SELECT p.tenant_id,s.org,'Tenant '||p.i FROM search_properties p CROSS JOIN search_state s;
ALTER TABLE public.leases DISABLE TRIGGER USER;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,archived_at)
  SELECT p.lease_id,s.org,p.id,CASE WHEN p.i%2=0 THEN p.unit_id END,p.tenant_id,
  CASE WHEN p.i%4=0 THEN 'notice_given' ELSE 'active' END,CASE WHEN p.i%10=0 THEN now() END
  FROM search_properties p CROSS JOIN search_state s;
ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.lease_terms DISABLE TRIGGER USER;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,status,confirmed_at,confirmed_by)
  SELECT s.org,p.lease_id,1,'2026-01-01',CASE WHEN p.i=1 THEN date '2026-10-31' ELSE date '2027-12-31' END,p.i,'USD',5,'active',now(),s.admin FROM search_properties p CROSS JOIN search_state s;
-- A future authoritative term changes the selected effective rent and order.
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,status,confirmed_at,confirmed_by)
  SELECT s.org,p.lease_id,2,'2026-11-01','2027-12-31',7777,'USD',5,'upcoming',now(),s.admin FROM search_properties p CROSS JOIN search_state s WHERE p.i=1;
ALTER TABLE public.lease_terms ENABLE TRIGGER USER;
ALTER TABLE public.ledger_entries DISABLE TRIGGER USER;
INSERT INTO public.ledger_entries(id,organization_id,property_id,unit_id,transaction_date,direction,category,description,amount,currency,created_at,archived_at)
  SELECT r.ledger_id,s.org,p.id,CASE WHEN r.i%2=0 THEN p.unit_id END,
    CASE WHEN r.i%3=0 THEN date '2025-01-01' ELSE date '2026-10-01' END,
    CASE WHEN r.i%4=0 THEN 'expense' ELSE 'income' END,
    CASE WHEN r.i%2=0 THEN 'Roof' ELSE 'Other' END,'Synthetic ledger',r.i,'USD',timestamp '2026-10-01'+r.i*interval '1 second',CASE WHEN r.i%10=0 THEN now() END
  FROM search_rows r JOIN search_properties p ON p.i=r.property_number CROSS JOIN search_state s;
ALTER TABLE public.ledger_entries ENABLE TRIGGER USER;
ALTER TABLE public.timeline_events DISABLE TRIGGER USER;
INSERT INTO public.timeline_events(id,organization_id,property_id,unit_id,lease_id,ledger_entry_id,event_date,event_type,title,description,cost_amount,cost_currency,archived_at)
  SELECT r.event_id,s.org,p.id,CASE WHEN r.i%2=0 THEN p.unit_id END,CASE WHEN r.i%5=0 THEN p.lease_id END,
    CASE WHEN r.i%4=0 THEN r.ledger_id END,CASE WHEN r.i%3=0 THEN date '2025-01-01' ELSE date '2026-10-01' END,
    CASE WHEN r.i%4=0 THEN 'Repair'::public.timeline_event_type ELSE 'General Note'::public.timeline_event_type END,
    CASE WHEN r.i%2=0 THEN 'Roof' ELSE 'Other' END,'Synthetic timeline',CASE WHEN r.i%7=0 THEN r.i END,'USD',CASE WHEN r.i%10=0 THEN now() END
  FROM search_rows r JOIN search_properties p ON p.i=r.property_number CROSS JOIN search_state s;
ALTER TABLE public.timeline_events ENABLE TRIGGER USER;
ALTER TABLE public.documents DISABLE TRIGGER USER;
INSERT INTO public.documents(id,organization_id,branch_id,property_id,unit_id,lease_id,timeline_event_id,category,file_name,storage_path,mime_type,size_bytes,uploaded_at,archived_at)
  SELECT r.document_id,s.org,CASE WHEN p.i<=600 THEN s.branch_a ELSE s.branch_b END,p.id,CASE WHEN r.i%2=0 THEN p.unit_id END,CASE WHEN r.i%5=0 THEN p.lease_id END,r.event_id,
    'General',CASE WHEN r.i%2=0 THEN 'Roof.pdf' ELSE 'Other.pdf' END,'synthetic/search/'||r.document_id,'application/pdf',1,
    timestamp '2026-10-01'+r.i*interval '1 second',CASE WHEN r.i%10=0 THEN now() END
  FROM search_rows r JOIN search_properties p ON p.i=r.property_number CROSS JOIN search_state s;
UPDATE public.documents SET file_name='50%_,(quoted)" O''Brien * literal' WHERE id=(SELECT document_id FROM search_rows WHERE i=1);
ALTER TABLE public.documents ENABLE TRIGGER USER;
ANALYZE public.documents; ANALYZE public.ledger_entries; ANALYZE public.timeline_events; ANALYZE public.leases; ANALYZE public.lease_terms;
CREATE TEMP TABLE search_groups AS SELECT jsonb_build_array(jsonb_build_array(jsonb_build_object('field','property_id','operator','in','value',jsonb_agg(id::text ORDER BY i)))) groups FROM search_properties;
GRANT SELECT ON search_groups TO authenticated;

SELECT pg_temp.search_ok(NOT has_function_privilege('anon','public.get_bounded_register_page(uuid,text,jsonb,jsonb,text,integer,integer,date)','EXECUTE'),'anonymous search is denied');
SELECT pg_temp.search_ok((SELECT NOT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.get_bounded_register_page(uuid,text,jsonb,jsonb,text,integer,integer,date)'::regprocedure),'search preserves caller authority and one stable snapshot');
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM search_state),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"all"}','uploaded_desc',9990,10)->>'total_count')::int,10000,'documents count all 10000 source records');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"all"}','uploaded_desc',9990,10)->'ids',
  (SELECT jsonb_agg(document_id ORDER BY i DESC) FROM search_rows WHERE i<=10),'last document page contains exact ordered identities');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"all"}','uploaded_desc',999999,10),
  public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"all"}','uploaded_desc',9990,10),'oversized page clamps to the final page');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups)||'[[{"field":"file_name","operator":"ilike","value":"%roof%"}]]','{"archive_state":"active"}','uploaded_desc',0,10)->>'total_count')::int,4000,'AND token groups and archive filtering happen before count and page');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"archived"}','uploaded_desc',0,10)->>'total_count')::int,1000,'archived filter remains exact');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents','[[{"field":"file_name","operator":"ilike","value":"%unmatched%"}]]','{}','uploaded_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'no matches do not return any source rows');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents',jsonb_build_array(jsonb_build_array(jsonb_build_object('field','file_name','operator','ilike','value','%50\%\_,(quoted)" O''Brien \* literal%'))),'{}','uploaded_desc',0,10)->'ids',
  (SELECT jsonb_build_array(document_id) FROM search_rows WHERE i=1),'quoted punctuation and escaped percent underscore and star stay literal');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents','[[{"field":"file_name","operator":"eq","value":"'' OR true --"}]]','{}','uploaded_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'SQL-looking values remain quoted data');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),
  (SELECT jsonb_build_object('archive_state','all','property_id',id,'unit_id',unit_id,'lease_id',lease_id) FROM search_properties WHERE i=10),'uploaded_desc',0,50)->>'total_count')::int,9,'document property unit and lease filters compose');

SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups),'{"archive_state":"all"}','amount_desc',9990,10)->>'total_count')::int,10000,'ledger count all 10000 entries');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups),'{"archive_state":"all"}','amount_desc',9990,10)->'ids',
  (SELECT jsonb_agg(ledger_id ORDER BY i DESC) FROM search_rows WHERE i<=10),'late ledger amount ordering is complete');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups),'{"archive_state":"active","direction":"expense","financial_start_date":"2026-01-01","date_from":"2026-10-01","date_before":"2026-11-01","min_amount":9000}','date_asc',0,50)->>'total_count')::int,
  (SELECT count(*)::int FROM search_rows WHERE i%10<>0 AND i%4=0 AND i%3<>0 AND i>=9000),'ledger direction period cutoff date window and minimum amount compose exactly');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups)||'[[{"field":"category","operator":"ilike","value":"*roof*"},{"field":"direction","operator":"eq","value":"expense"}]]','{"archive_state":"all"}','amount_asc',0,50)->>'total_count')::int,5000,'OR alternatives inside each search token preserve wildcard aliases');

SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{"archive_state":"all"}','date_desc',9990,10)->>'total_count')::int,10000,'timeline count all 10000 events');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{"archive_state":"all"}','date_desc',9990,10)->'ids',
  (SELECT jsonb_agg(id) FROM (SELECT id FROM public.timeline_events WHERE organization_id=(SELECT org FROM search_state) ORDER BY event_date DESC,id DESC OFFSET 9990 LIMIT 10) p),'late timeline ordering retains descending tie breaker');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{"archive_state":"active","scope":"financial","financial_start_date":"2026-01-01","date_from":"2026-10-01","date_to":"2026-10-01"}','date_asc',0,50)->>'total_count')::int,
  (SELECT count(*)::int FROM search_rows WHERE i%10<>0 AND i%3<>0 AND (i%4=0 OR i%7=0)),'financial timeline applies route scope and cutoff to count');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{"archive_state":"all","scope":"maintenance","event_type":"Repair"}','type_asc',0,50)->>'total_count')::int,2500,'maintenance event-type scope matches the original register');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups)||'[[{"field":"unit_id","operator":"not.is","value":null}]]','{"archive_state":"all"}','property_asc',0,50)->>'total_count')::int,5000,'nonnull search alternatives keep null semantics');

SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',1190,10,'2026-10-01')->>'total_count')::int,1200,'lease source counts all 1200 scoped effective-rent rows');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',1190,10,'2026-10-01')->'ids',
  (SELECT jsonb_agg(lease_id ORDER BY i DESC) FROM search_properties WHERE i<=10),'late rent page uses effective rent order');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',0,10,'2026-11-01')->'ids',
  (SELECT jsonb_agg(id) FROM (SELECT id FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM search_state),'2026-11-01') ORDER BY monthly_rent_amount DESC,tenant_name,id LIMIT 10) p),'effective-date term uses the authoritative scoped lease source');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',0,10,'2026-11-01')->'ids'->>0,
  (SELECT lease_id::text FROM search_properties WHERE i=1),'future rent term moves the lowest-rent lease to the first page');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"active","status":"current","tenant_missing":false,"end_from":"2027-01-01","end_before":"2028-01-01","currency":"USD"}','end_asc',0,50,'2026-10-01')->>'total_count')::int,1079,'lease current status end-date and currency filters compose');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all","tenant_missing":true}','start_desc',0,50,'2026-10-01')->>'total_count')::int,0,'missing tenant filter honors current not-null tenant constraint');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups)||'[[{"field":"monthly_rent_amount","operator":"eq","value":"1200.00"}]]','{"archive_state":"all"}','start_desc',0,50,'2026-10-01')->'ids',
  (SELECT jsonb_build_array(lease_id) FROM search_properties WHERE i=1200),'numeric equality preserves decimal lease search');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','tenant_asc',0,50,'2026-10-01')->'ids',
  (SELECT jsonb_agg(id) FROM (SELECT id FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM search_state),'2026-10-01') ORDER BY archived_at ASC NULLS FIRST,tenant_name ASC,lease_start_date DESC,id ASC LIMIT 50) p),'archive-all lease ordering retains active-first behavior');

SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents;DROP TABLE documents'',''[]'',''{}'',''uploaded_desc'',0,10)',(SELECT org FROM search_state)),'entity injection is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[[{"field":"file_name) OR true --","operator":"eq","value":"x"}]]'',''{}'',''uploaded_desc'',0,10)',(SELECT org FROM search_state)),'field injection is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[[{"field":"file_name","operator":"like","value":"x"}]]'',''{}'',''uploaded_desc'',0,10)',(SELECT org FROM search_state)),'unsupported operator is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[]'',''{"where":"true"}'',''uploaded_desc'',0,10)',(SELECT org FROM search_state)),'unknown filter expression is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[]'',''{}'',''id;DROP TABLE documents'',0,10)',(SELECT org FROM search_state)),'sort injection is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[[]]'',''{}'',''uploaded_desc'',0,10)',(SELECT org FROM search_state)),'empty OR group is rejected');
SELECT pg_temp.search_rejects(format('SELECT public.get_bounded_register_page(%L,''documents'',''[]'',''{}'',''uploaded_desc'',0,501)',(SELECT org FROM search_state)),'response size is bounded');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT other_org FROM search_state),'documents',(SELECT groups FROM search_groups),'{}','uploaded_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'cross-organization source is empty');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT restricted::text FROM search_state),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{"archive_state":"all"}','uploaded_desc',0,10)->>'total_count')::int,5200,'document count obeys branch RLS');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups),'{"archive_state":"all"}','amount_desc',0,10)->>'total_count')::int,5200,'ledger count obeys branch RLS');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{"archive_state":"all"}','date_desc',0,10)->>'total_count')::int,5200,'timeline count obeys branch RLS');
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',0,10,'2026-10-01')->>'total_count')::int,600,'lease count obeys scoped branch authority');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT lease_reader::text FROM search_state),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.search_is((public.get_bounded_register_page((SELECT org FROM search_state),'leases',(SELECT groups FROM search_groups),'{"archive_state":"all"}','rent_desc',0,10,'2026-10-01')->>'total_count')::int,600,'lease-only permission retains scoped effective-rent search');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'ledger',(SELECT groups FROM search_groups),'{}','amount_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'lease visibility never grants ledger visibility');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT denied::text FROM search_state),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'documents',(SELECT groups FROM search_groups),'{}','uploaded_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'missing document permission reveals no rows or count');
SELECT pg_temp.search_is(public.get_bounded_register_page((SELECT org FROM search_state),'timeline',(SELECT groups FROM search_groups),'{}','date_desc',0,10),'{"ids":[],"total_count":0}'::jsonb,'missing timeline permission reveals no rows or count');
RESET ROLE;
SELECT '1..'||n FROM search_assertions;
ROLLBACK;
