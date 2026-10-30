BEGIN;
SET search_path = public, extensions;
-- Raw TAP allows this rollback-only read fixture to run on native PostgreSQL
-- as well as the Supabase pg_prove runner without extension dependencies.
CREATE TEMP TABLE scale_assertions(n integer);
INSERT INTO scale_assertions VALUES(0);
CREATE FUNCTION pg_temp.scale_ok(p_ok boolean,p_label text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_n integer;
BEGIN
  UPDATE pg_temp.scale_assertions SET n=n+1 RETURNING n INTO v_n;
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'not ok % - %',v_n,p_label; END IF;
  RETURN 'ok '||v_n||' - '||p_label;
END; $$;
CREATE FUNCTION pg_temp.scale_is(p_actual anycompatible,p_expected anycompatible,p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.scale_ok(p_actual IS NOT DISTINCT FROM p_expected,p_label);
$$;

CREATE TEMP TABLE portfolio_scale AS SELECT gen_random_uuid() org, gen_random_uuid() other_org,
  gen_random_uuid() admin, gen_random_uuid() restricted, gen_random_uuid() no_finance,
  gen_random_uuid() branch_a, gen_random_uuid() branch_b, gen_random_uuid() role_id, gen_random_uuid() limited_role;
GRANT SELECT ON portfolio_scale TO authenticated;
INSERT INTO auth.users(id, email) SELECT id, id || '@portfolio-scale.invalid' FROM portfolio_scale s,
  LATERAL unnest(ARRAY[s.admin, s.restricted, s.no_finance]) id;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Synthetic portfolio scale','scale-'||org FROM portfolio_scale
  UNION ALL SELECT other_org,'Other scale organization','scale-'||other_org FROM portfolio_scale;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
  SELECT branch_a,org,'A','A','active' FROM portfolio_scale UNION ALL SELECT branch_b,org,'B','B','active' FROM portfolio_scale;
INSERT INTO public.organization_roles(id,organization_id,name,status)
  SELECT role_id,org,'Scoped portfolio reader','active' FROM portfolio_scale UNION ALL SELECT limited_role,org,'Property only reader','active' FROM portfolio_scale;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
  SELECT org,role_id,p::public.organization_permission_key FROM portfolio_scale CROSS JOIN unnest(ARRAY['properties.view','leases.view','people.view','finance.view']) p
  UNION ALL SELECT org,limited_role,'properties.view' FROM portfolio_scale;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
  SELECT org,admin,'super_admin',NULL,NULL FROM portfolio_scale UNION ALL
  SELECT org,restricted,'custom',branch_a,role_id FROM portfolio_scale UNION ALL
  SELECT org,no_finance,'custom',branch_a,limited_role FROM portfolio_scale;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM portfolio_scale);

CREATE TEMP TABLE scale_properties AS SELECT i,gen_random_uuid() id FROM generate_series(1,5000) i;
CREATE TEMP TABLE scale_units AS SELECT i,gen_random_uuid() id,((i-1)/4+1) property_number FROM generate_series(1,20000) i;
GRANT SELECT ON scale_properties,scale_units TO authenticated;
-- Large synthetic source population only; all constraints remain installed.
-- Disable user triggers for fixture speed, then restore them before any reads.
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,status,address,rental_structure)
  SELECT p.id,s.org,CASE WHEN p.i<=2500 THEN s.branch_a ELSE s.branch_b END,
    'P'||p.i,'Property '||p.i,'apartment','active',CASE WHEN p.i=5000 THEN 'last address' END,'multi_unit'
  FROM scale_properties p CROSS JOIN portfolio_scale s;
ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
  SELECT u.id,s.org,p.id,'U'||u.i,'vacant',u.i,'USD' FROM scale_units u JOIN scale_properties p ON p.i=u.property_number CROSS JOIN portfolio_scale s;
ALTER TABLE public.units ENABLE TRIGGER USER;
ALTER TABLE public.ledger_entries DISABLE TRIGGER USER;
INSERT INTO public.ledger_entries(organization_id,property_id,unit_id,transaction_date,direction,category,amount,currency)
  SELECT s.org,p.id,u.id,CASE WHEN g.i<=50000 THEN date '2024-01-01' ELSE date '2026-10-01' END,
    CASE WHEN g.i%4=0 THEN 'expense' ELSE 'income' END,
    CASE WHEN g.i%4=0 THEN 'Repair service' ELSE 'Rent income' END,1.01,'USD'
  FROM generate_series(1,100001) g(i) CROSS JOIN portfolio_scale s CROSS JOIN scale_properties p CROSS JOIN scale_units u
  WHERE p.i=1 AND u.i=1;
INSERT INTO public.ledger_entries(organization_id,property_id,unit_id,transaction_date,direction,category,amount,currency,archived_at)
  SELECT s.org,p.id,u.id,'2026-10-01','income','Rent',999999,'USD',now() FROM portfolio_scale s CROSS JOIN scale_properties p CROSS JOIN scale_units u WHERE p.i=1 AND u.i=1;
INSERT INTO public.ledger_entries(organization_id,property_id,unit_id,transaction_date,direction,category,amount,currency)
  SELECT s.org,p.id,u.id,'2026-10-01','expense','Repair',300,'USD' FROM portfolio_scale s CROSS JOIN scale_properties p CROSS JOIN scale_units u WHERE p.i=5000 AND u.i=20000;
ALTER TABLE public.ledger_entries ENABLE TRIGGER USER;
CREATE TEMP TABLE reversal_scale AS SELECT gen_random_uuid() id;
ALTER TABLE public.ledger_entries DISABLE TRIGGER USER;
INSERT INTO public.ledger_entries(id,organization_id,property_id,unit_id,transaction_date,direction,category,amount,currency,source_type,source_id)
  SELECT r.id,s.org,p.id,u.id,'2025-10-29','income','Rent',50,'USD','receipt_allocation',gen_random_uuid()
  FROM reversal_scale r CROSS JOIN portfolio_scale s CROSS JOIN scale_properties p CROSS JOIN scale_units u WHERE p.i=2 AND u.i=5;
INSERT INTO public.ledger_entries(organization_id,property_id,unit_id,transaction_date,direction,category,amount,currency,source_type,source_id,reversal_of_ledger_entry_id)
  SELECT s.org,p.id,u.id,'2025-10-29','income','Rent',-50,'USD','receipt_allocation',gen_random_uuid(),r.id
  FROM reversal_scale r CROSS JOIN portfolio_scale s CROSS JOIN scale_properties p CROSS JOIN scale_units u WHERE p.i=2 AND u.i=5;
ALTER TABLE public.ledger_entries ENABLE TRIGGER USER;
ANALYZE public.properties; ANALYZE public.units; ANALYZE public.ledger_entries;

SELECT pg_temp.scale_ok(public.matches_register_search('P#-5.000',ARRAY['P5000']), 'compact property search preserves punctuation semantics');
SELECT pg_temp.scale_ok(public.matches_register_search('Ｕ２００００',ARRAY['U20000']), 'full-width NFKC search finds the last unit');
SELECT pg_temp.scale_ok(NOT public.matches_register_search('%_',ARRAY['anything']), 'wildcard characters remain literal');
SELECT pg_temp.scale_ok(public.register_natural_sort_key('P2') < public.register_natural_sort_key('P10'), 'natural numeric order is preserved');
SELECT pg_temp.scale_ok(NOT has_function_privilege('anon','public.get_portfolio_ledger_totals(uuid,uuid[],uuid[],date)','EXECUTE'), 'anonymous aggregate execution is denied');
SELECT pg_temp.scale_ok(NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (
  'public.get_portfolio_ledger_totals(uuid,uuid[],uuid[],date)'::regprocedure,
  'public.get_property_register_page(uuid,jsonb,integer,integer)'::regprocedure,
  'public.get_unit_register_page(uuid,jsonb,integer,integer)'::regprocedure) AND prosecdef), 'all portfolio readers preserve caller RLS');
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM portfolio_scale),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.scale_is((public.get_property_register_page((SELECT org FROM portfolio_scale),'{}',1,10)->>'total_count')::int,5000,'property count exceeds API cap');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{}',500,10)->'ids'->>9,(SELECT id::text FROM scale_properties WHERE i=5000),'late property page is complete and naturally ordered');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{}',99999,10),public.get_property_register_page((SELECT org FROM portfolio_scale),'{}',500,10),'out-of-range page clamps to last page');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{"query":"notpresent"}',1,10),'{"ids":[],"total_count":0}'::jsonb,'no-match search returns no source rows');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{"query":"U20000"}',1,10)->'ids'->>0,(SELECT id::text FROM scale_properties WHERE i=5000),'relationship search finds a late unit property');
SELECT pg_temp.scale_is((public.get_property_register_page((SELECT org FROM portfolio_scale),'{"ownerStatus":"missing"}',1,10)->>'total_count')::int,5000,'missing owner filter has no IN-list limit');
SELECT pg_temp.scale_is((public.get_unit_register_page((SELECT org FROM portfolio_scale),'{"sort":"rent_desc"}',1,10)->>'total_count')::int,20000,'unit count covers large catalogue');
SELECT pg_temp.scale_is(public.get_unit_register_page((SELECT org FROM portfolio_scale),'{"sort":"rent_desc"}',1,10)->'ids'->>0,(SELECT id::text FROM scale_units WHERE i=20000),'rent sorting occurs before pagination');
SELECT pg_temp.scale_is(public.get_unit_register_page((SELECT org FROM portfolio_scale),'{"sort":"unit_asc"}',2000,10)->'ids'->>9,(SELECT id::text FROM scale_units WHERE i=20000),'late unit page remains complete');
SELECT pg_temp.scale_is((public.get_unit_register_page((SELECT org FROM portfolio_scale),'{"occupancy":"unoccupied"}',1,10)->>'total_count')::int,20000,'derived occupancy filter counts the full dataset');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{"sort":"net_desc"}',1,10)->'ids'->>0,(SELECT id::text FROM scale_properties WHERE i=1),'net sort uses full ledger totals');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{"netStatus":"negative"}',1,10)->'ids'->>0,(SELECT id::text FROM scale_properties WHERE i=5000),'negative-net filter includes late property');
CREATE TEMP TABLE scale_totals AS SELECT public.get_portfolio_ledger_totals(
  (SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=1)],ARRAY[(SELECT id FROM scale_units WHERE i=1)],'2025-10-29') data;
SELECT pg_temp.scale_is((SELECT sum((b->>'entry_count')::bigint) FROM scale_totals,LATERAL jsonb_array_elements(data) b WHERE b->>'scope_type'='property'),100001::numeric,'aggregate counts every unarchived ledger row beyond 100000');
SELECT pg_temp.scale_is((SELECT sum((b->>'amount')::numeric * CASE WHEN b->>'direction'='expense' THEN -1 ELSE 1 END) FROM scale_totals,LATERAL jsonb_array_elements(data) b WHERE b->>'scope_type'='property'),50501.01::numeric,'property aggregate reconciles exact decimal net');
SELECT pg_temp.scale_is((SELECT sum((b->>'amount')::numeric * CASE WHEN b->>'direction'='expense' THEN -1 ELSE 1 END) FROM scale_totals,LATERAL jsonb_array_elements(data) b WHERE b->>'scope_type'='unit'),50501.01::numeric,'unit aggregate reconciles to its property');
SELECT pg_temp.scale_is((SELECT sum((b->>'amount')::numeric) FROM scale_totals,LATERAL jsonb_array_elements(data) b WHERE b->>'scope_type'='unit' AND b->>'direction'='expense' AND b->>'transaction_date'>='2025-10-29' AND b->>'category' LIKE '%maintenance%'),12625::numeric,'trailing maintenance total retains period and category semantics');
SELECT pg_temp.scale_ok((SELECT jsonb_array_length(data)<=8 FROM scale_totals),'financial result size is independent of ledger history');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale)),'[]'::jsonb,'empty scope cannot turn into an organization-wide ledger read');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=2)],ARRAY[]::uuid[],'2025-10-29')->0->>'amount','0.00','reversed income nets to zero without dropping either entry');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=2)],ARRAY[]::uuid[],'2025-10-29')->0->>'entry_count','2','reversal and original both remain in aggregate record count');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=2)],ARRAY[]::uuid[],'2025-10-29')->0->>'transaction_date','2025-10-29','exact period boundary remains included');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT other_org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=1)]),'[]'::jsonb,'foreign organization cannot aggregate known property IDs');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT other_org FROM portfolio_scale),'{}',1,10),'{"ids":[],"total_count":0}'::jsonb,'cross-organization register is empty');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT restricted::text FROM portfolio_scale),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.scale_is((public.get_property_register_page((SELECT org FROM portfolio_scale),'{}',1,10)->>'total_count')::int,2500,'branch-scoped property count excludes hidden branch');
SELECT pg_temp.scale_is((public.get_unit_register_page((SELECT org FROM portfolio_scale),'{"sort":"rent_desc"}',1,10)->>'total_count')::int,10000,'branch-scoped unit count excludes hidden branch');
SELECT pg_temp.scale_is(public.get_property_register_page((SELECT org FROM portfolio_scale),'{"query":"P5000"}',1,10),'{"ids":[],"total_count":0}'::jsonb,'relationship search does not reveal another branch');
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=5000)]),'[]'::jsonb,'aggregate does not reveal another branch');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT no_finance::text FROM portfolio_scale),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=1)]),'[]'::jsonb,'property visibility never grants finance visibility');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.scale_is(public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=1)]),'[]'::jsonb,'a missing session cannot use the private aggregate reader');
RESET ROLE;
CREATE POLICY portfolio_fixture_guard ON public.ledger_entries AS RESTRICTIVE FOR SELECT TO authenticated USING (true);
CREATE FUNCTION pg_temp.policy_guard_rejects() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.get_portfolio_ledger_totals((SELECT org FROM portfolio_scale),ARRAY[(SELECT id FROM scale_properties WHERE i=1)]);
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END; $$;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM portfolio_scale),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.scale_ok(pg_temp.policy_guard_rejects(),'aggregate fails closed if a future ledger policy changes visibility');
RESET ROLE;
DROP POLICY portfolio_fixture_guard ON public.ledger_entries;
SELECT '1..'||n FROM scale_assertions;
ROLLBACK;
