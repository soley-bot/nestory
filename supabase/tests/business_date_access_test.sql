-- Business-date access regression, validated against the full disposable schema.
-- Requires the authorize_business_date_by_view_permission migration.
-- Never run against a shared database or a hosted project.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE business_date_state AS
SELECT gen_random_uuid() org, gen_random_uuid() other_org, gen_random_uuid() legacy_org,
  gen_random_uuid() branch_a, gen_random_uuid() branch_b,
  gen_random_uuid() other_branch, gen_random_uuid() other_role, gen_random_uuid() legacy_branch,
  gen_random_uuid() admin, gen_random_uuid() stranger,
  gen_random_uuid() property_a, gen_random_uuid() property_b;
CREATE TEMP TABLE business_date_actors AS
SELECT kind, gen_random_uuid() user_id, gen_random_uuid() role_id,
  permissions::public.organization_permission_key[] permissions
FROM (VALUES
  ('manager', ARRAY['finance.view','leases.view','maintenance.view']),
  ('member', ARRAY['finance.view','leases.view']),
  ('lease_reader', ARRAY['leases.view']),
  ('finance_reader', ARRAY['finance.view']),
  ('property_reader', ARRAY['properties.view']),
  ('branch_b_reader', ARRAY['finance.view']),
  ('maintenance_only', ARRAY['maintenance.view']),
  ('people_only', ARRAY['people.view']),
  ('empty_role', ARRAY[]::text[]),
  ('legacy_manager', ARRAY[]::text[]),
  ('legacy_member', ARRAY[]::text[]),
  ('legacy_operations', ARRAY[]::text[])
) actor(kind, permissions);
GRANT SELECT ON business_date_state, business_date_actors TO authenticated, anon;
INSERT INTO auth.users(id,email)
SELECT user_id,user_id||'@business-date.test' FROM business_date_actors UNION ALL
SELECT admin,admin||'@business-date.test' FROM business_date_state UNION ALL
SELECT stranger,stranger||'@business-date.test' FROM business_date_state;
INSERT INTO public.organizations(id,name,slug,operational_timezone)
SELECT org,'Business date','date-'||org,'Asia/Phnom_Penh' FROM business_date_state UNION ALL
SELECT other_org,'Other business date','date-'||other_org,'UTC' FROM business_date_state UNION ALL
SELECT legacy_org,'Legacy business date','date-'||legacy_org,'UTC' FROM business_date_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_a,org,'A','A','active' FROM business_date_state UNION ALL
SELECT branch_b,org,'B','B','active' FROM business_date_state UNION ALL
SELECT other_branch,other_org,'Other','Other','active' FROM business_date_state UNION ALL
SELECT legacy_branch,legacy_org,'Legacy','Legacy','active' FROM business_date_state;
INSERT INTO public.organization_roles(id,organization_id,name,status)
SELECT role_id,org,'Date fixture '||kind,'active'
FROM business_date_actors CROSS JOIN business_date_state
WHERE kind NOT LIKE 'legacy_%' UNION ALL
SELECT other_role,other_org,'Other finance role','active' FROM business_date_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,role_id,permission_key FROM business_date_actors CROSS JOIN business_date_state
CROSS JOIN LATERAL unnest(permissions) permission_key UNION ALL
SELECT other_org,other_role,'finance.view'::public.organization_permission_key FROM business_date_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,user_id,'custom',CASE WHEN kind='branch_b_reader' THEN branch_b ELSE branch_a END,role_id
FROM business_date_actors CROSS JOIN business_date_state WHERE kind NOT LIKE 'legacy_%' AND kind<>'empty_role' UNION ALL
SELECT org,admin,'super_admin',NULL,NULL FROM business_date_state UNION ALL
SELECT legacy_org,user_id,CASE kind WHEN 'legacy_manager' THEN 'finance_manager' ELSE 'finance_member' END,NULL,NULL
FROM business_date_actors CROSS JOIN business_date_state WHERE kind IN ('legacy_manager','legacy_member');
-- Legacy operations needs a person-scoped branch membership.
INSERT INTO public.people(id,organization_id,display_name)
SELECT user_id,legacy_org,'Legacy operations fixture' FROM business_date_actors CROSS JOIN business_date_state
WHERE kind='legacy_operations';
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,person_id)
SELECT legacy_org,user_id,'operations_member',legacy_branch,user_id
FROM business_date_actors CROSS JOIN business_date_state WHERE kind='legacy_operations';
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id IN (SELECT org FROM business_date_state UNION ALL SELECT other_org FROM business_date_state);

-- Use the existing private fixture capability; leave every trigger enabled.
SELECT set_config('app.property_branch_assignment_context',
  (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
SELECT property_a,org,branch_a,'DATE-A','Date A','apartment','multi_unit' FROM business_date_state UNION ALL
SELECT property_b,org,branch_b,'DATE-B','Date B','apartment','multi_unit' FROM business_date_state;
SELECT set_config('app.property_branch_assignment_context','off',true);

SELECT ok(has_function_privilege('authenticated','public.get_lease_rent_business_date(uuid)','EXECUTE'),
  'authenticated retains execute permission');
SELECT ok(NOT has_function_privilege('anon','public.get_lease_rent_business_date(uuid)','EXECUTE'),
  'anonymous has no execute permission');
SELECT ok(NOT has_function_privilege('service_role','public.get_lease_rent_business_date(uuid)','EXECUTE'),
  'service role gets no new execute permission');
SELECT is(pg_get_userbyid(proowner),'postgres','existing function owner is preserved')
FROM pg_proc WHERE oid='public.get_lease_rent_business_date(uuid)'::regprocedure;
SELECT is(provolatile::text,'s','business-date RPC remains stable')
FROM pg_proc WHERE oid='public.get_lease_rent_business_date(uuid)'::regprocedure;
SELECT ok(prosecdef AND proconfig @> ARRAY['search_path=""'],'definer keeps empty search path')
FROM pg_proc WHERE oid='public.get_lease_rent_business_date(uuid)'::regprocedure;

SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'Super Admin retains the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'manager can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='member'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'member can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='lease_reader'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'lease_reader can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='finance_reader'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'finance_reader can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='property_reader'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'property_reader can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='branch_b_reader'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(org),(statement_timestamp() AT TIME ZONE 'Asia/Phnom_Penh')::date,
  'branch_b_reader can read the authoritative company date') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='maintenance_only'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','maintenance_only denied while ordinary custom access is enabled') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='people_only'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','people_only denied while ordinary custom access is enabled') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='empty_role'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','empty_role denied while ordinary custom access is enabled') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','legacy_manager denied for another company') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_member'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','legacy_member denied for another company') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_operations'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','legacy_operations denied for another company') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',other_org),
  '42501','Not authorized','cross-company request denied') FROM business_date_state;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',NULL::uuid),
  '42501','Not authorized','null organization denied') FROM business_date_state;

SELECT ok(app_private.can_access_property(org,property_a,'finance.view'),'manager retains own-branch property access')
FROM business_date_state;
SELECT ok(NOT app_private.can_access_property(org,property_b,'finance.view'),'date access grants no other-branch property access')
FROM business_date_state;
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L,%L)',org,property_b),
  '42501',NULL,'public finance context still denies the other branch') FROM business_date_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT stranger::text FROM business_date_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','non-member denied') FROM business_date_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','missing authenticated subject denied') FROM business_date_state;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),'42501',NULL,
  'anonymous RPC execution denied') FROM business_date_state;
RESET ROLE;

-- Every revocation starts from the same valid manager membership. Roll back the
-- isolated mutation before moving to the next scenario.

SAVEPOINT permission_revoked;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
DELETE FROM public.organization_role_permissions WHERE role_id=(SELECT role_id FROM business_date_actors WHERE kind='manager')
  AND permission_key IN ('finance.view','leases.view');
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','all relevant permissions revoked') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT permission_revoked;
RELEASE SAVEPOINT permission_revoked;

SAVEPOINT member_revoked;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
DELETE FROM public.organization_members WHERE organization_id=(SELECT org FROM business_date_state) AND user_id=(SELECT user_id FROM business_date_actors WHERE kind='manager');
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','membership revoked') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT member_revoked;
RELEASE SAVEPOINT member_revoked;

SAVEPOINT ordinary_disabled;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
UPDATE public.organization_authorization_states SET ordinary_access_enabled=false WHERE organization_id=(SELECT org FROM business_date_state);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','ordinary custom access disabled') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT ordinary_disabled;
RELEASE SAVEPOINT ordinary_disabled;

SAVEPOINT role_archived;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
SELECT throws_ok(
  'UPDATE public.organization_roles SET status=''archived'',archived_at=now()
   WHERE id=(SELECT role_id FROM business_date_actors WHERE kind=''manager'')',
  '55000','Assigned roles cannot be archived.','assigned role archive guard is unchanged');
DELETE FROM public.organization_members WHERE organization_id=(SELECT org FROM business_date_state)
  AND user_id=(SELECT user_id FROM business_date_actors WHERE kind='manager');
UPDATE public.organization_roles SET status='archived',archived_at=now(),archived_by=(SELECT admin FROM business_date_state) WHERE id=(SELECT role_id FROM business_date_actors WHERE kind='manager');
SELECT throws_ok(
  'INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
   SELECT org,user_id,''custom'',branch_a,role_id FROM business_date_actors CROSS JOIN business_date_state WHERE kind=''manager''',
  '23514','An active role with permissions in this organization is required.','archived role cannot regain a membership');
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','custom role archived') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT role_archived;
RELEASE SAVEPOINT role_archived;

SAVEPOINT branch_inactive;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
UPDATE public.organization_branches SET status='inactive' WHERE id=(SELECT branch_a FROM business_date_state);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','assigned branch inactive') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT branch_inactive;
RELEASE SAVEPOINT branch_inactive;

SAVEPOINT branch_archived;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
UPDATE public.organization_branches SET status='inactive',archived_at=now(),archived_by=(SELECT admin FROM business_date_state) WHERE id=(SELECT branch_a FROM business_date_state);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='manager'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',org),
  '42501','Not authorized','assigned branch archived') FROM business_date_state;
RESET ROLE;
ROLLBACK TO SAVEPOINT branch_archived;
RELEASE SAVEPOINT branch_archived;

-- Invalid foreign-company branch/role assignment must remain unrepresentable.
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM business_date_state),true);
SELECT throws_ok(
  'UPDATE public.organization_members SET branch_id=(SELECT other_branch FROM business_date_state)
   WHERE user_id=(SELECT user_id FROM business_date_actors WHERE kind=''manager'')',
  '23514','An active branch in this organization is required.','foreign-company branch assignment rejected');
SELECT throws_ok(
  'UPDATE public.organization_members SET custom_role_id=(SELECT other_role FROM business_date_state)
   WHERE user_id=(SELECT user_id FROM business_date_actors WHERE kind=''manager'')',
  '23514','An active role with permissions in this organization is required.','foreign-company role assignment rejected');
SELECT throws_ok(
  'INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
   SELECT org,user_id,''custom'',branch_a,role_id FROM business_date_actors CROSS JOIN business_date_state WHERE kind=''empty_role''',
  '23514','An active role with permissions in this organization is required.','empty role cannot gain membership');
SELECT throws_ok(
  'INSERT INTO public.organization_members(organization_id,user_id,role)
   SELECT org,stranger,''finance_member'' FROM business_date_state',
  '55000','Legacy ordinary assignments are disabled after ordinary access activation.',
  'legacy assignment cannot bypass enabled custom access');

-- Preserve the existing canonical DB transition fallback, without enabling
-- legacy ordinary roles in the current application membership resolver.

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_manager'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(legacy_org),(statement_timestamp() AT TIME ZONE 'UTC')::date,
  'legacy_manager retains canonical disabled-transition DB fallback') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_member'),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_lease_rent_business_date(legacy_org),(statement_timestamp() AT TIME ZONE 'UTC')::date,
  'legacy_member retains canonical disabled-transition DB fallback') FROM business_date_state;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM business_date_actors WHERE kind='legacy_operations'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_rent_business_date(%L)',legacy_org),
  '42501','Not authorized','legacy operations has no supported view permission') FROM business_date_state;
RESET ROLE;

-- The date calculation itself is unchanged. These explicit clocks cover the
-- first day of a month and the UTC / company-day boundary without wall-clock assumptions.
SELECT is(app_private.rent_business_date(org,'2026-09-30 16:59:59+00'::timestamptz),
  '2026-09-30'::date,'company date before month boundary') FROM business_date_state;
SELECT is(app_private.rent_business_date(org,'2026-09-30 17:00:00+00'::timestamptz),
  '2026-10-01'::date,'company date at month boundary') FROM business_date_state;
SELECT is(app_private.rent_business_date(org,'2026-10-01 00:00:00+00'::timestamptz),
  '2026-10-01'::date,'company date at UTC month boundary') FROM business_date_state;
SELECT * FROM finish();
ROLLBACK;
