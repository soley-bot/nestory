BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

CREATE TEMP TABLE rental_space_state AS SELECT gen_random_uuid() org, gen_random_uuid() reader,
  gen_random_uuid() role_id, gen_random_uuid() branch_a, gen_random_uuid() branch_b,
  gen_random_uuid() property_a, gen_random_uuid() property_b;
GRANT SELECT ON rental_space_state TO authenticated;
INSERT INTO auth.users(id,email) SELECT reader,reader||'@rental-space.test' FROM rental_space_state;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Rental space report','rental-space-'||org FROM rental_space_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_a,org,'A','A','active' FROM rental_space_state UNION ALL
SELECT branch_b,org,'B','B','active' FROM rental_space_state;
INSERT INTO public.organization_roles(id,organization_id,name,status)
SELECT role_id,org,'Finance only reader','active' FROM rental_space_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,role_id,'finance.view'::public.organization_permission_key FROM rental_space_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,reader,'custom',branch_a,role_id FROM rental_space_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id=(SELECT org FROM rental_space_state);
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
SELECT property_a,org,branch_a,'VACANT-A','Vacant A','apartment','single_space' FROM rental_space_state UNION ALL
SELECT property_b,org,branch_b,'HIDDEN-B','Hidden B','apartment','single_space' FROM rental_space_state;
ALTER TABLE public.properties ENABLE TRIGGER USER;

SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM rental_space_state),true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE rental_space_result AS SELECT public.get_finance_read_context(org,property_a) payload FROM rental_space_state;
SELECT is((SELECT count(*)::integer FROM public.properties WHERE organization_id=(SELECT org FROM rental_space_state)),0,
  'Finance-only reader has no base property access');
SELECT is((SELECT jsonb_array_length(payload->'properties') FROM rental_space_result),1,
  'checked context includes vacant property only in the assigned branch');
SELECT is((SELECT payload->'properties'->0->>'id' FROM rental_space_result),(SELECT property_a::text FROM rental_space_state),
  'vacant single-space property retains its own identity');
SELECT is((SELECT payload->'properties'->0->>'rental_structure' FROM rental_space_result),'single_space',
  'rental structure is available independently of any lease');
SELECT is((SELECT jsonb_array_length(payload->'units') FROM rental_space_result),0,
  'vacant property requires no artificial unit');
SELECT is((SELECT jsonb_array_length(payload->'leases') FROM rental_space_result),0,
  'vacant property requires no lease history');
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L,%L)',
  (SELECT org FROM rental_space_state),(SELECT property_b FROM rental_space_state)),'42501',NULL,
  'explicit property outside the assigned branch remains denied');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.get_finance_read_context(uuid,uuid)','EXECUTE'),
  'anonymous callers retain no context access');
SELECT * FROM finish();
ROLLBACK;
