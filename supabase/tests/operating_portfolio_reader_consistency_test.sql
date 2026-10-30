BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(20);

-- Synthetic fixtures roll back. Reads use the real authenticated branch-scoped RLS.
CREATE TEMP TABLE operating_fixture AS SELECT gen_random_uuid() org, gen_random_uuid() foreign_org,
  gen_random_uuid() actor, gen_random_uuid() branch_a, gen_random_uuid() branch_b, gen_random_uuid() role_id,
  gen_random_uuid() tenant, gen_random_uuid() lease, gen_random_uuid() admin;
CREATE TEMP TABLE operating_properties AS SELECT i, gen_random_uuid() id FROM generate_series(1,5) i;
CREATE TEMP TABLE operating_units AS SELECT i, gen_random_uuid() id FROM generate_series(1,18) i;
GRANT SELECT ON operating_fixture, operating_properties, operating_units TO authenticated;
INSERT INTO auth.users(id,email) SELECT id, id||'@operating-reader.invalid' FROM operating_fixture f,
  LATERAL unnest(ARRAY[f.actor,f.admin]) id;
INSERT INTO public.organizations(id,name,slug)
  SELECT org,'Operating reader fixture','operating-'||org FROM operating_fixture
  UNION ALL SELECT foreign_org,'Foreign fixture','operating-'||foreign_org FROM operating_fixture;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
  SELECT branch_a,org,'A','A','active' FROM operating_fixture
  UNION ALL SELECT branch_b,org,'B','B','active' FROM operating_fixture;
INSERT INTO public.organization_roles(id,organization_id,name,status)
  SELECT role_id,org,'Operating reader','active' FROM operating_fixture;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
  SELECT org,role_id,p::public.organization_permission_key FROM operating_fixture
  CROSS JOIN unnest(ARRAY['properties.view','leases.view','people.view','finance.view']) p;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
  SELECT org,actor,'custom',branch_a,role_id FROM operating_fixture
  UNION ALL SELECT org,admin,'super_admin',null,null FROM operating_fixture;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
  WHERE organization_id=(SELECT org FROM operating_fixture);
SET LOCAL session_replication_role=replica;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure,status,archived_at)
  SELECT p.id,CASE WHEN p.i=5 THEN f.foreign_org ELSE f.org END,
    CASE WHEN p.i=5 THEN null WHEN p.i=4 THEN f.branch_b ELSE f.branch_a END,
    'P'||p.i,'Operating '||p.i,'apartment','multi_unit',CASE WHEN p.i=2 THEN 'inactive' ELSE 'active' END,
    CASE WHEN p.i=3 THEN now() END FROM operating_properties p CROSS JOIN operating_fixture f;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,archived_at)
  SELECT u.id,CASE WHEN u.i=18 THEN f.foreign_org ELSE f.org END,p.id,'U'||u.i,
    CASE WHEN u.i=13 THEN 'inactive' WHEN u.i=2 THEN 'occupied' ELSE 'vacant' END,
    CASE WHEN u.i=14 THEN now() END
  FROM operating_units u CROSS JOIN operating_fixture f JOIN operating_properties p
    ON p.i=CASE WHEN u.i=15 THEN 2 WHEN u.i=16 THEN 3 WHEN u.i=17 THEN 4 WHEN u.i=18 THEN 5 ELSE 1 END;
INSERT INTO public.people(id,organization_id,display_name) SELECT tenant,org,'Synthetic tenant' FROM operating_fixture;
INSERT INTO public.person_roles(organization_id,person_id,role) SELECT org,tenant,'tenant' FROM operating_fixture;
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id) SELECT org,tenant,branch_a FROM operating_fixture;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,status,primary_tenant_person_id)
  SELECT f.lease,f.org,p.id,u.id,'active',f.tenant FROM operating_fixture f CROSS JOIN operating_properties p CROSS JOIN operating_units u
  WHERE p.i=1 AND u.i=1;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,confirmed_at,confirmed_by)
  SELECT org,lease,1,'2026-01-01','2026-11-30',100,'USD',now(),actor FROM operating_fixture;
SET LOCAL session_replication_role=origin;

SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (
  'public.get_unit_register_page(uuid,jsonb,integer,integer)'::regprocedure,
  'public.get_overview_summary(uuid,date,date,uuid,date)'::regprocedure) AND prosecdef), 'integrated public readers retain invoker RLS');
SELECT ok(NOT has_function_privilege('anon','public.get_unit_register_page(uuid,jsonb,integer,integer)','EXECUTE')
  AND NOT has_function_privilege('anon','public.get_overview_summary(uuid,date,date,uuid,date)','EXECUTE'), 'replacement retains anonymous execution denial');
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM operating_fixture),true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE operating_overview AS SELECT public.get_overview_summary((SELECT org FROM operating_fixture),'2026-10-29','2026-10-01') value;
SELECT is((SELECT (value#>>'{counts,unitCount}')::int FROM operating_overview),13,'overview excludes inactive, archived and foreign units');
SELECT is((SELECT (value#>>'{counts,activeLeaseCount}')::int FROM operating_overview),1,'fixture contains one visible operational current lease');
SELECT is((SELECT (value#>>'{counts,occupiedUnits}')::int FROM operating_overview),1,'only current lease evidence counts as occupied');
SELECT is((SELECT (value#>>'{counts,leaseGapUnits}')::int FROM operating_overview),12,'every operating unit without a current lease is a gap');
SELECT is((SELECT (value#>>'{counts,vacantUnits}')::int FROM operating_overview),11,'vacant status with a current lease is not a vacancy');
SELECT is((SELECT (value#>>'{properties,0,unoccupiedUnits}')::int FROM operating_overview),11,'property chart uses the same lease evidence');
SELECT is((public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied"}',1,10)->>'total_count')::int,12,'unit count matches the dashboard before paging');
SELECT is(public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied"}',2,10)->'ids',
  (SELECT jsonb_agg(id ORDER BY i) FROM operating_units WHERE i IN (12,17)),'final filtered page contains the exact remaining identities');
SELECT is(public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied"}',999,10),
  public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied"}',2,10),'page clamping uses the scoped count');
SELECT is((public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied","status":"vacant"}',1,10)->>'total_count')::int,11,'vacancy drill-through matches overview');
SELECT is(public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"occupancy":"unoccupied","status":"occupied"}',1,10)->'ids',
  (SELECT jsonb_build_array(id) FROM operating_units WHERE i=2),'stale occupied status stays visible as a lease gap');
SELECT is(public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true,"status":"inactive"}',1,10),
  '{"ids":[],"total_count":0}'::jsonb,'operating scope cannot include inactive units');
SELECT is((public.get_unit_register_page((SELECT org FROM operating_fixture),'{"status":"inactive"}',1,10)->>'total_count')::int,1,'ordinary register still supports inactive unit review');
SELECT is((public.get_unit_register_page((SELECT org FROM operating_fixture),jsonb_build_object('operationalOnly',true,'propertyId',(SELECT id FROM operating_properties WHERE i=2)),1,10)->>'total_count')::int,0,'selected inactive property remains outside operating scope');
SELECT is((public.get_unit_register_page((SELECT foreign_org FROM operating_fixture),'{"operationalOnly":true}',1,10)->>'total_count')::int,0,'operating filter cannot bypass organization RLS');
SELECT is((public.get_overview_summary((SELECT foreign_org FROM operating_fixture),'2026-10-29','2026-10-01')#>>'{counts,unitCount}')::int,0,'overview cannot bypass organization RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM operating_fixture),true);
SET LOCAL ROLE authenticated;
SELECT is((public.get_unit_register_page((SELECT org FROM operating_fixture),'{"operationalOnly":true}',1,10)->>'total_count')::int,12,'operating register still enforces the restricted actor branch');
SELECT is((public.get_overview_summary((SELECT org FROM operating_fixture),'2026-10-29','2026-10-01')#>>'{counts,unitCount}')::int,12,'overview still enforces the restricted actor branch');
SELECT * FROM finish();
ROLLBACK;
