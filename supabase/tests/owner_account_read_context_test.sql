BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE opening_scope_state AS SELECT
  gen_random_uuid() org, gen_random_uuid() other_org,
  gen_random_uuid() branch_a, gen_random_uuid() branch_b,
  gen_random_uuid() reader, gen_random_uuid() member_reader,
  gen_random_uuid() non_finance, gen_random_uuid() admin,
  gen_random_uuid() finance_role, gen_random_uuid() other_role;
GRANT SELECT ON opening_scope_state TO authenticated;
INSERT INTO auth.users(id,email)
SELECT reader, 'roster-reader@example.test' FROM opening_scope_state UNION ALL
SELECT member_reader, 'roster-member@example.test' FROM opening_scope_state UNION ALL
SELECT non_finance, 'roster-nonfinance@example.test' FROM opening_scope_state UNION ALL
SELECT admin, 'roster-admin@example.test' FROM opening_scope_state;
INSERT INTO public.organizations(id,name,slug)
SELECT org,'Scoped roster','roster-'||org FROM opening_scope_state UNION ALL
SELECT other_org,'Other roster','roster-'||other_org FROM opening_scope_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_a,org,'A','A','active' FROM opening_scope_state UNION ALL
SELECT branch_b,org,'B','B','active' FROM opening_scope_state;
INSERT INTO public.organization_roles(id,organization_id,name,status)
SELECT finance_role,org,'Roster finance reader','active' FROM opening_scope_state UNION ALL
SELECT other_role,org,'Roster nonfinance reader','active' FROM opening_scope_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,finance_role,'finance.view'::public.organization_permission_key FROM opening_scope_state UNION ALL
SELECT org,other_role,'maintenance.view'::public.organization_permission_key FROM opening_scope_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,reader,'custom',branch_a,finance_role FROM opening_scope_state UNION ALL
SELECT org,member_reader,'custom',branch_a,finance_role FROM opening_scope_state UNION ALL
SELECT org,non_finance,'custom',branch_a,other_role FROM opening_scope_state UNION ALL
SELECT org,admin,'super_admin',NULL,NULL FROM opening_scope_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id=(SELECT org FROM opening_scope_state);

CREATE TEMP TABLE opening_scope_properties AS
SELECT kind, gen_random_uuid() property_id, gen_random_uuid() person_id,
  gen_random_uuid() assignment_id,
  CASE WHEN kind LIKE '%_b' THEN state.branch_b WHEN kind='unresolved' THEN NULL ELSE state.branch_a END branch_id,
  CASE WHEN kind LIKE 'bad_%' THEN 90.000 ELSE 100.000 END ownership_percent
FROM opening_scope_state state CROSS JOIN unnest(ARRAY['ready_a','bad_a','ready_b','bad_b','unresolved']) AS kind;
GRANT SELECT ON opening_scope_properties TO authenticated;
ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type,rental_structure)
SELECT p.property_id,s.org,p.branch_id,p.kind,p.kind,'apartment','multi_unit'
FROM opening_scope_properties p CROSS JOIN opening_scope_state s;
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.people(id,organization_id,display_name)
SELECT p.person_id,s.org,p.kind||' owner' FROM opening_scope_properties p CROSS JOIN opening_scope_state s;
INSERT INTO public.person_roles(organization_id,person_id,role,status)
SELECT s.org,p.person_id,'owner','active' FROM opening_scope_properties p CROSS JOIN opening_scope_state s;
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on)
SELECT p.assignment_id,s.org,p.property_id,p.person_id,p.ownership_percent,DATE '2026-07-01'
FROM opening_scope_properties p CROSS JOIN opening_scope_state s;
ALTER TABLE public.property_owners ENABLE TRIGGER USER;


-- Preserve ended ownership as account context, independent of roster readiness.
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
UPDATE public.property_owners SET ended_on='2026-08-01'
WHERE id=(SELECT assignment_id FROM opening_scope_properties WHERE kind='ready_a');
ALTER TABLE public.property_owners ENABLE TRIGGER USER;

SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.properties WHERE organization_id=(SELECT org FROM opening_scope_state)),0,
  'Finance account labels do not grant administrative property access');
CREATE TEMP TABLE account_scope_result AS
SELECT public.get_owner_account_read_context((SELECT org FROM opening_scope_state)) value;
SELECT is((SELECT jsonb_array_length(value->'properties') FROM account_scope_result),2,'only current branch property selectors are returned');
SELECT is((SELECT jsonb_array_length(value->'people') FROM account_scope_result),2,'only owners attached to authorized properties are returned');
SELECT is((SELECT jsonb_array_length(value->'assignments') FROM account_scope_result),2,'invalid and historical rosters remain inspectable accounts');
SELECT ok((SELECT value->'assignments' @> jsonb_build_array(jsonb_build_object('id',p.assignment_id,'ended_on','2026-08-01'))
  FROM account_scope_result CROSS JOIN opening_scope_properties p WHERE p.kind='ready_a'),
  'historical ended ownership keeps original identity and end date');
SELECT ok((SELECT value->'properties' @> jsonb_build_array(jsonb_build_object('id',p.property_id,'name','bad_a','code','bad_a'))
  FROM account_scope_result CROSS JOIN opening_scope_properties p WHERE p.kind='bad_a'),
  'invalid-share property retains its real label for issue inspection');
SELECT ok((SELECT value->'people' @> jsonb_build_array(jsonb_build_object('id',p.person_id,'display_name','bad_a owner'))
  FROM account_scope_result CROSS JOIN opening_scope_properties p WHERE p.kind='bad_a'),
  'owner selector preserves existing display label');
SELECT is(public.get_owner_account_read_context((SELECT org FROM opening_scope_state),(SELECT property_id FROM opening_scope_properties WHERE kind='ready_a')),
  (SELECT value FROM account_scope_result),'selected authorized property does not remove other allowed selector choices');
SELECT ok(NOT EXISTS (SELECT 1 FROM account_scope_result r CROSS JOIN opening_scope_properties p
  WHERE p.kind IN ('ready_b','bad_b','unresolved') AND (
    strpos(r.value::text,p.property_id::text)>0 OR strpos(r.value::text,p.person_id::text)>0
    OR strpos(r.value::text,p.assignment_id::text)>0 OR strpos(r.value::text,p.kind)>0
  )), 'hidden branch and unresolved IDs, labels and assignment details never leave context');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM account_scope_result,
  LATERAL jsonb_object_keys(value->'assignments'->0) key),
  '{ended_on,id,person_id,property_id,started_on}','context contains no shares, hashes, balances or financial authority');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM account_scope_result,
  LATERAL jsonb_object_keys(value->'people'->0) key),'{display_name,id}','owner context excludes contact details and private person fields');
SELECT throws_ok(format('SELECT public.get_owner_account_read_context(%L,%L)',
  (SELECT org FROM opening_scope_state),(SELECT property_id FROM opening_scope_properties WHERE kind='ready_b')),
  '42501',NULL,'explicit hidden property fails closed rather than an empty account');
SELECT throws_ok(format('SELECT public.get_owner_account_read_context(%L,%L)',
  (SELECT org FROM opening_scope_state),gen_random_uuid()),'42501',NULL,'unknown or foreign property identity fails closed');
SELECT throws_ok(format('SELECT public.get_owner_account_read_context(%L)',(SELECT other_org FROM opening_scope_state)),
  '42501',NULL,'foreign organization cannot enumerate labels or assignment metadata');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT member_reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_owner_account_read_context((SELECT org FROM opening_scope_state)),(SELECT value FROM account_scope_result),
  'Finance Member has the same existing read projection without write permissions');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT non_finance::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_owner_account_read_context(%L)',(SELECT org FROM opening_scope_state)),
  '42501',NULL,'non-Finance member cannot enumerate owner account context');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SELECT public.archive_person((SELECT org FROM opening_scope_state),(SELECT person_id FROM opening_scope_properties WHERE kind='ready_a'));
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_account_read_context((SELECT org FROM opening_scope_state))->'people'),1,
  'archived person remains excluded by original selector semantics');
SELECT is(jsonb_array_length(public.get_owner_account_read_context((SELECT org FROM opening_scope_state))->'assignments'),1,
  'archived person cannot create a phantom visible account');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SELECT public.archive_property((SELECT property_id FROM opening_scope_properties WHERE kind='bad_a'),(SELECT org FROM opening_scope_state));
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_account_read_context((SELECT org FROM opening_scope_state))->'properties'),1,
  'archived property remains excluded by original selector semantics');
SELECT is(jsonb_array_length(public.get_owner_account_read_context((SELECT org FROM opening_scope_state))->'assignments'),0,
  'archived property assignments do not seed a visible account');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.get_owner_account_read_context(uuid,uuid)','EXECUTE'),'anonymous context execution revoked');
SELECT ok(NOT has_function_privilege('service_role','public.get_owner_account_read_context(uuid,uuid)','EXECUTE'),'service role is not an account context bypass');
SELECT * FROM finish();
ROLLBACK;
