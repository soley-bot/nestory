-- Raw TAP: rollback-only scale/authorization verification, no pgTAP required.
BEGIN;
SET LOCAL statement_timeout='120s';
CREATE TEMP SEQUENCE reference_test_number;
GRANT USAGE ON SEQUENCE reference_test_number TO authenticated;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint := nextval('pg_temp.reference_test_number');
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'not ok % - %',n,message; END IF;
  RETURN 'ok '||n||' - '||message;
END $$;
CREATE TEMP TABLE reference_state AS SELECT gen_random_uuid() org,gen_random_uuid() other_org,gen_random_uuid() admin,
  gen_random_uuid() reader,gen_random_uuid() role_id,gen_random_uuid() branch_a,gen_random_uuid() branch_b,
  gen_random_uuid() property_a,gen_random_uuid() property_b;
GRANT SELECT ON reference_state TO authenticated;
INSERT INTO auth.users(id,email) SELECT actor,actor||'@reference-scale.invalid' FROM reference_state,
  LATERAL unnest(ARRAY[admin,reader]) actor;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Reference scale','references-'||org FROM reference_state UNION ALL
  SELECT other_org,'Other references','references-'||other_org FROM reference_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_a,org,'A','A','active' FROM reference_state UNION ALL SELECT branch_b,org,'B','B','active' FROM reference_state;
INSERT INTO public.organization_roles(id,organization_id,name,status) SELECT role_id,org,'Scoped references','active' FROM reference_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,role_id,permission::public.organization_permission_key FROM reference_state,
  LATERAL unnest(ARRAY['leases.view','finance.view','people.view']) permission;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,admin,'super_admin',NULL,NULL FROM reference_state UNION ALL SELECT org,reader,'custom',branch_a,role_id FROM reference_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM reference_state);
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
SELECT property_a,org,branch_a,'REF-A','Visible property','apartment','multi_unit' FROM reference_state UNION ALL
SELECT property_b,org,branch_b,'REF-B','Hidden property','apartment','multi_unit' FROM reference_state;
ALTER TABLE public.properties ENABLE TRIGGER USER;
CREATE TEMP TABLE reference_rows AS SELECT n,
 ('c7010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid person_id,
 ('c7020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid account_id,
 ('c7030000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid lease_id,
 ('c7040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid unit_id
FROM generate_series(1,5000) n;
GRANT SELECT ON reference_rows TO authenticated;
ALTER TABLE public.people DISABLE TRIGGER USER;
ALTER TABLE public.person_roles DISABLE TRIGGER USER;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT person_id,org,'Reference tenant '||lpad(n::text,5,'0'),'individual' FROM reference_rows CROSS JOIN reference_state;
INSERT INTO public.person_roles(organization_id,person_id,role,status)
SELECT org,person_id,'tenant','active' FROM reference_rows CROSS JOIN reference_state;
ALTER TABLE public.person_roles ENABLE TRIGGER USER;
ALTER TABLE public.people ENABLE TRIGGER USER;
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
SELECT unit_id,org,CASE WHEN n=5000 THEN property_a ELSE property_b END,'Unit '||n,'vacant' FROM reference_rows CROSS JOIN reference_state;
ALTER TABLE public.units ENABLE TRIGGER USER;
ALTER TABLE public.leases DISABLE TRIGGER USER;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status)
SELECT lease_id,org,CASE WHEN n=5000 THEN property_a ELSE property_b END,unit_id,person_id,'active' FROM reference_rows CROSS JOIN reference_state;
ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.finance_accounts DISABLE TRIGGER USER;
INSERT INTO public.finance_accounts(id,organization_id,account_class,account_subtype,account_number,display_name,created_by)
SELECT account_id,org,'asset','bank',n::text,'Reference account '||n,admin FROM reference_rows CROSS JOIN reference_state;
UPDATE public.finance_accounts SET parent_account_id=(SELECT account_id FROM reference_rows WHERE n=1)
WHERE id=(SELECT account_id FROM reference_rows WHERE n=5000);
ALTER TABLE public.finance_accounts ENABLE TRIGGER USER;
ANALYZE public.people;
ANALYZE public.person_roles;
ANALYZE public.leases;
ANALYZE public.units;
ANALYZE public.finance_accounts;

SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM reference_state),true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE reference_results AS SELECT
  public.get_finance_account_register_page(org,'Reference','asset','active',1,50) accounts, NULL::jsonb people, NULL::jsonb leases
FROM reference_state;
UPDATE reference_results SET people=(SELECT public.get_person_select_page(org,ARRAY['tenant'],'',1,(SELECT person_id FROM reference_rows WHERE n=5000)) FROM reference_state);
UPDATE reference_results SET leases=(SELECT public.get_lease_register_context(org,ARRAY[(SELECT lease_id FROM reference_rows WHERE n=5000)]) FROM reference_state);
SELECT pg_temp.assert_true((SELECT (accounts->'pagination'->>'totalCount')::integer=5000 AND jsonb_array_length(accounts->'accounts')=50 FROM reference_results),'5000 accounts yield exact count and 50 screen rows');
SELECT pg_temp.assert_true((SELECT accounts->'accounts'->1->>'id'=(SELECT account_id::text FROM reference_rows WHERE n=5000) FROM reference_results),'late child remains adjacent to its parent');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_finance_account_register_page(org,'Reference','asset','active',100,50)->'accounts')=50 FROM reference_state),'deep account page stays bounded');
SELECT pg_temp.assert_true((SELECT (public.get_finance_account_register_page(org,'Reference account 5000','asset','active',1,50)->'pagination'->>'totalCount')::integer=1 FROM reference_state),'last account remains searchable');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(people->'options')=25 AND (people->>'hasMore')::boolean AND people->'selectedOption'->>'id'=(SELECT person_id::text FROM reference_rows WHERE n=5000) FROM reference_results),'selected person outside page resolves directly');
SELECT pg_temp.assert_true((SELECT public.get_person_select_page(org,ARRAY['tenant'],'Reference tenant 05000',1)->'options'->0->>'id'=(SELECT person_id::text FROM reference_rows WHERE n=5000) FROM reference_state),'last tenant is found by database search');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_person_select_page(org,ARRAY['tenant'],'',200)->'options')=25 FROM reference_state),'last person page has all 25 rows');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(leases->'properties')=1 AND jsonb_array_length(leases->'units')=1 AND jsonb_array_length(leases->'availability_leases')=0 AND jsonb_array_length(leases->'availability_terms')=0 FROM reference_results),'selected lease hydration excludes 4999 unrelated units and all availability');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_lease_register_context(org,ARRAY[]::uuid[],true)->'units')=5000 FROM reference_state),'filter intent retains every authorized unit');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_lease_register_context(org)->'units')=0 FROM reference_state),'empty register context never returns a portfolio');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_lease_read_context(org)->'units')=5000 FROM reference_state),'existing form context contract is unchanged');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM reference_state),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.get_lease_register_context(org,ARRAY[]::uuid[],true)->'units')=1 FROM reference_state),'filter options obey branch scope');
CREATE TEMP TABLE branch_reference_people AS SELECT public.get_person_select_page(org,ARRAY['tenant'],'',1,(SELECT person_id FROM reference_rows WHERE n=1)) people FROM reference_state;
SELECT pg_temp.assert_true((SELECT jsonb_array_length(people->'options')=1 FROM branch_reference_people),'person selector obeys branch relationship visibility');
SELECT pg_temp.assert_true((SELECT people->'selectedOption'='null'::jsonb FROM branch_reference_people),'selected-ID hydration cannot expose a person from another branch');
DO $$ BEGIN
  PERFORM public.get_lease_register_context((SELECT org FROM reference_state),ARRAY[(SELECT lease_id FROM reference_rows WHERE n=1)]);
  RAISE EXCEPTION 'Hidden branch lease was exposed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT pg_temp.assert_true(true,'hidden branch lease is rejected');
DO $$ BEGIN
  PERFORM public.get_finance_account_register_page((SELECT other_org FROM reference_state));
  RAISE EXCEPTION 'Other organization chart was exposed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT pg_temp.assert_true(true,'other organization account chart is rejected');
SELECT '1..16';
ROLLBACK;
