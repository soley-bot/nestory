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

CREATE TEMP TABLE opening_hidden_roster AS
SELECT roster.canonical_roster, roster.ownership_roster_hash
FROM app_private.owner_roster_legacy_preflight('2026-08-01') roster
JOIN opening_scope_properties p ON p.property_id=roster.property_id
WHERE p.kind IN ('ready_b','unresolved') AND roster.boundary_date='2026-08-01' AND roster.issue_code IS NULL;
GRANT SELECT ON opening_hidden_roster TO authenticated;

SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.properties WHERE organization_id=(SELECT org FROM opening_scope_state)),0,
  'Finance view does not grant the administrative property table');
SELECT throws_ok(format('SELECT public.get_owner_roster_readiness(%L,%L)',(SELECT org FROM opening_scope_state),'2026-08-01'),
  '42501',NULL,'legacy organization-wide readiness still denies ordinary Finance reader');
CREATE TEMP TABLE opening_scope_result AS
SELECT public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01') value;
SELECT is((SELECT jsonb_array_length(value->'assignments') FROM opening_scope_result),1,
  'Finance reader receives exactly its valid effective branch roster');
SELECT is((SELECT value#>>'{assignments,0,id}' FROM opening_scope_result),
  (SELECT assignment_id::text FROM opening_scope_properties WHERE kind='ready_a'),
  'returned assignment identity is the authorized roster, not a fabricated empty account');
SELECT is((SELECT value#>>'{assignments,0,ownership_percent_text}' FROM opening_scope_result),'100.000',
  'ownership share remains exact text');
SELECT ok((SELECT value->'readiness' @> jsonb_build_array(jsonb_build_object('property_id',p.property_id,'issue_code','owner_share_total_not_100'))
  FROM opening_scope_result CROSS JOIN opening_scope_properties p WHERE p.kind='bad_a'),
  'invalid in-branch shares remain visible readiness blockers');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM opening_scope_result r CROSS JOIN opening_scope_properties p
  WHERE p.kind IN ('ready_b','bad_b','unresolved') AND (
    r.value::text LIKE '%'||p.property_id||'%' OR r.value::text LIKE '%'||p.person_id||'%'
    OR r.value::text LIKE '%'||p.assignment_id||'%'
  )), 'cross-branch and unresolved property, person and assignment identities never leave the RPC');
SELECT ok(NOT EXISTS (SELECT 1 FROM opening_scope_result r CROSS JOIN opening_hidden_roster h
  WHERE strpos(r.value::text,h.ownership_roster_hash)>0 OR strpos(r.value::text,h.canonical_roster)>0),
  'hidden branch canonical rosters and authority hashes never leave the RPC');
SELECT throws_ok(format('SELECT public.get_owner_opening_roster_scope(%L,%L,%L)',
  (SELECT org FROM opening_scope_state),'2026-08-01',(SELECT property_id FROM opening_scope_properties WHERE kind='ready_b')),
  '42501',NULL,'explicit cross-branch property is denied, not empty success');
SELECT throws_ok(format('SELECT public.get_owner_opening_roster_scope(%L,%L)',
  (SELECT other_org FROM opening_scope_state),'2026-08-01'), '42501',NULL,'foreign organization denied');
SELECT throws_ok(format('SELECT public.get_owner_opening_roster_scope(%L,NULL)',(SELECT org FROM opening_scope_state)),
  '22023',NULL,'missing boundary date is not empty success');
SELECT set_config('app.finance_branch_authority_context',(SELECT branch_b::text FROM opening_scope_state),true);
SELECT is(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01'),
  (SELECT value FROM opening_scope_result),'forged client branch setting does not widen the roster');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT member_reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),1,
  'Finance Member read-only authority works without payment or property permissions');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT non_finance::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_owner_opening_roster_scope(%L,%L)',(SELECT org FROM opening_scope_state),'2026-08-01'),
  '42501',NULL,'non-Finance member cannot enumerate readiness, roster IDs or shares');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),3,
  'organization Super Admin retains valid rosters across branches including unresolved branch');
RESET ROLE;

-- Validation remains authoritative even though Finance cannot inspect these
-- administrative tables. Mutations below are isolated test fixture setup.
SELECT public.archive_person((SELECT org FROM opening_scope_state),(SELECT person_id FROM opening_scope_properties WHERE kind='ready_a'));
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),0,
  'inactive owner person cannot seed an apparently ready account');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SELECT public.restore_person((SELECT org FROM opening_scope_state),(SELECT person_id FROM opening_scope_properties WHERE kind='ready_a'));
UPDATE public.person_roles SET archived_at=now() WHERE person_id=(SELECT person_id FROM opening_scope_properties WHERE kind='ready_a') AND role='owner';
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),0,
  'inactive owner role cannot seed an apparently ready account');
RESET ROLE;
UPDATE public.person_roles SET archived_at=NULL WHERE person_id=(SELECT person_id FROM opening_scope_properties WHERE kind='ready_a') AND role='owner';
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
UPDATE public.property_owners SET ended_on='2026-08-01' WHERE id=(SELECT assignment_id FROM opening_scope_properties WHERE kind='ready_a');
ALTER TABLE public.property_owners ENABLE TRIGGER USER;
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),0,
  'assignment ending on cutover is excluded by half-open dates');
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-07-31')->'assignments'),1,
  'same assignment is valid immediately before its end boundary');
RESET ROLE;
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
UPDATE public.property_owners SET ended_on=NULL WHERE id=(SELECT assignment_id FROM opening_scope_properties WHERE kind='ready_a');
ALTER TABLE public.property_owners ENABLE TRIGGER USER;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SELECT public.archive_property((SELECT property_id FROM opening_scope_properties WHERE kind='ready_a'),(SELECT org FROM opening_scope_state));
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.get_owner_opening_roster_scope((SELECT org FROM opening_scope_state),'2026-08-01')->'assignments'),0,
  'archived property does not seed an active roster');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM opening_scope_state),true);
SELECT public.restore_property((SELECT property_id FROM opening_scope_properties WHERE kind='ready_a'),(SELECT org FROM opening_scope_state));

UPDATE public.organization_branches SET status='inactive' WHERE id=(SELECT branch_a FROM opening_scope_state);
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM opening_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_owner_opening_roster_scope(%L,%L,%L)',
  (SELECT org FROM opening_scope_state),'2026-08-01',(SELECT property_id FROM opening_scope_properties WHERE kind='ready_a')),
  '42501',NULL,'inactive current branch fails closed for an explicit roster');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.get_owner_opening_roster_scope(uuid,date,uuid)','EXECUTE'), 'anonymous RPC execution revoked');
SELECT ok(NOT has_function_privilege('service_role','public.get_owner_opening_roster_scope(uuid,date,uuid)','EXECUTE'), 'service role is not a roster bypass');
SELECT * FROM finish();
ROLLBACK;
