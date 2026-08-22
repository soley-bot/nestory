BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(54);

INSERT INTO auth.users (id, email)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'mutation-super@example.test'),
  ('91000000-0000-0000-0000-000000000002', 'mutation-writer@example.test'),
  ('91000000-0000-0000-0000-000000000003', 'mutation-viewer@example.test'),
  ('91000000-0000-0000-0000-000000000004', 'mutation-other-branch@example.test'),
  ('91000000-0000-0000-0000-000000000005', 'mutation-contained@example.test');

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('92000000-0000-0000-0000-000000000001', 'Mutation A', 'mutation-a'),
  ('92000000-0000-0000-0000-000000000002', 'Mutation B', 'mutation-b');

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'A One', 'M-A1'),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'A Two', 'M-A2'),
  ('93000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', 'A Inactive', 'M-AI'),
  ('93000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', 'A Archived', 'M-AA'),
  ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', 'B One', 'M-B1');

UPDATE public.organization_branches
SET status='inactive'
WHERE id IN (
  '93000000-0000-0000-0000-000000000004',
  '93000000-0000-0000-0000-000000000005'
);
UPDATE public.organization_branches
SET archived_at=now(), archived_by='91000000-0000-0000-0000-000000000001'
WHERE id='93000000-0000-0000-0000-000000000005';

INSERT INTO public.organization_roles (id, organization_id, name)
VALUES
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Core writer'),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'View only');

INSERT INTO public.organization_role_permissions (organization_id, role_id, permission_key)
VALUES
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'properties.view'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'properties.write'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'properties.archive'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'people.view'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'people.write'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'people.archive'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002', 'properties.view'),
  ('92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002', 'people.view');

INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id)
VALUES
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'super_admin', NULL, NULL),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'custom', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'custom', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'custom', '93000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000005', 'finance_member', NULL, NULL);

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = '92000000-0000-0000-0000-000000000001';

SELECT has_table('public', 'person_branch_relationships', 'Person branch relationship register exists');
SELECT col_is_pk('public', 'person_branch_relationships', ARRAY['id'], 'Person branch relationship has stable identity');
SELECT has_column('public', 'person_branch_relationships', 'organization_id', 'relationship stores organization');
SELECT has_column('public', 'person_branch_relationships', 'person_id', 'relationship stores Person');
SELECT has_column('public', 'person_branch_relationships', 'branch_id', 'relationship stores branch');
SELECT has_column('public', 'person_branch_relationships', 'archived_at', 'relationship has lifecycle');

SELECT has_function('public', 'create_property_minimal', ARRAY['uuid','uuid','text','text','text','text','date','text','uuid','date','numeric'], 'branch-aware minimal Property overload exists');
SELECT has_function('public', 'create_property', ARRAY['uuid','uuid','text','text','text','text','text','text','date','text','uuid','date','numeric'], 'branch-aware full Property overload exists');
SELECT has_function('public', 'create_person', ARRAY['uuid','text','text','text','text','text','text','text','text[]','uuid'], 'branch-aware Person overload exists');
SELECT has_function('public', 'create_person', ARRAY['uuid','text','text','text','text','text','text','text','text[]','text','date','date','uuid'], 'branch-aware Person travel-document overload exists');
SELECT has_function('public', 'archive_person_branch_relationship', ARRAY['uuid','uuid'], 'checked Person relationship archive exists');
SELECT has_function('public', 'create_person_branch_relationship', ARRAY['uuid','uuid','uuid'], 'checked existing-Person relationship creation API exists');

SELECT ok(
  to_regclass('public.person_branch_relationships_org_branch_active_idx') IS NOT NULL
  AND to_regclass('public.person_branch_relationships_org_branch_idx') IS NOT NULL
  AND to_regclass('public.person_branch_relationships_org_person_idx') IS NOT NULL,
  'active scope and historical Person relationship foreign keys are indexed'
);
SELECT ok(
  to_regclass('public.person_branch_relationships_org_person_active_idx') IS NULL,
  'redundant non-unique active Person index is absent'
);
SELECT ok(
  to_regclass('public.person_branch_relationships_created_by_idx') IS NOT NULL
  AND to_regclass('public.person_branch_relationships_archived_by_idx') IS NOT NULL,
  'Person relationship auth-user foreign keys have supporting indexes'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'person_branch_relationships'
      AND grantee IN ('anon','authenticated','service_role')
      AND privilege_type <> 'SELECT'
  ),
  'Person relationship Data API grant is read-only and explicit'
);

SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','Scoped Property','SP-1','apartment','Address',current_date,'prop-scope-1',NULL,NULL,NULL)$$,
  'ordinary writer creates a Property only in assigned branch'
);
SELECT throws_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002','Other Property','SP-2','apartment','Address',current_date,'prop-scope-2',NULL,NULL,NULL)$$,
  '42501', NULL, 'ordinary writer cannot create in another branch'
);
SELECT throws_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000003','Cross Property','SP-X','apartment','Address',current_date,'prop-scope-x',NULL,NULL,NULL)$$,
  '42501', NULL, 'ordinary writer cannot create across organizations'
);

SELECT lives_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Scoped Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'93000000-0000-0000-0000-000000000001')$$,
  'ordinary writer atomically creates a Person relationship in assigned branch'
);
SELECT throws_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Other Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'93000000-0000-0000-0000-000000000002')$$,
  '42501', NULL, 'ordinary writer cannot create a Person relationship in another branch'
);
SELECT is(
  (SELECT count(*) FROM public.person_branch_relationships WHERE organization_id='92000000-0000-0000-0000-000000000001' AND branch_id='93000000-0000-0000-0000-000000000001' AND archived_at IS NULL),
  1::bigint,
  'atomic Person creation records one active branch relationship'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.people WHERE display_name='Scoped Person'),
  'explicit Person branch relationship grants ordinary same-branch people.view visibility'
);

SELECT throws_ok(
  $$SELECT public.create_person_branch_relationship('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.people WHERE display_name='Scoped Person'),'93000000-0000-0000-0000-000000000002')$$,
  '42501', NULL, 'ordinary user cannot link an existing Person by guessed identifier'
);
SELECT throws_ok(
  $$SELECT public.archive_person_branch_relationship('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.person_branch_relationships WHERE person_id=(SELECT id FROM public.people WHERE display_name='Scoped Person') AND branch_id='93000000-0000-0000-0000-000000000001' AND archived_at IS NULL))$$,
  '42501', NULL, 'ordinary user cannot remove an existing Person branch relationship'
);

SELECT lives_ok(
  $$SELECT public.create_unit('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.properties WHERE code='SP-1'),'U-NEW','1',50,2,1,'vacant')$$,
  'room-count Unit overload accepts same-branch properties.write'
);
SELECT lives_ok(
  $$SELECT public.create_unit('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.properties WHERE code='SP-1'),'U-OLD','1',45,'vacant')$$,
  'legacy Unit overload accepts same-branch properties.write'
);
SELECT lives_ok(
  $$SELECT public.update_unit((SELECT id FROM public.units WHERE unit_number='U-NEW'),'92000000-0000-0000-0000-000000000001',(SELECT id FROM public.properties WHERE code='SP-1'),'U-NEW','2',55,3,2,'vacant')$$,
  'room-count Unit update overload accepts same-branch properties.write'
);
SELECT lives_ok(
  $$SELECT public.update_unit((SELECT id FROM public.units WHERE unit_number='U-NEW'),'92000000-0000-0000-0000-000000000001',(SELECT id FROM public.properties WHERE code='SP-1'),'U-NEW','3',60,'vacant')$$,
  'legacy Unit update overload remains callable'
);
SELECT is((SELECT bedroom_count FROM public.units WHERE unit_number='U-NEW'), 3::smallint, 'legacy Unit update preserves bedroom count');
SELECT is((SELECT bathroom_count FROM public.units WHERE unit_number='U-NEW'), 2::smallint, 'legacy Unit update preserves bathroom count');
SELECT throws_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','Legacy Unscoped',NULL,'apartment',NULL,current_date,'legacy-unscoped-1',NULL,NULL,NULL)$$,
  '42501', NULL, 'old unscoped Property overload remains rejected for an authorized writer after activation'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','Denied Property','SP-D','apartment','Address',current_date,'prop-denied',NULL,NULL,NULL)$$,
  '42501', NULL, 'same branch without properties.write cannot create Property'
);
SELECT throws_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Denied Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'93000000-0000-0000-0000-000000000001')$$,
  '42501', NULL, 'same branch without people.write cannot create Person'
);
SELECT throws_ok(
  $$UPDATE public.properties SET notes='direct' WHERE code='SP-1'$$,
  '42501', NULL, 'authenticated direct Property DML is closed'
);
SELECT throws_ok(
  $$UPDATE public.people SET notes='direct' WHERE display_name='Scoped Person'$$,
  '42501', NULL, 'authenticated direct Person DML is closed'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002','Admin Scoped','SP-A','apartment','Address',current_date,'prop-admin',NULL,NULL,NULL)$$,
  'Super Admin may choose any active branch in own organization'
);
SELECT throws_ok(
  $$SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','Replay Property','SP-R','apartment','Address',current_date,'prop-replay-1',NULL,NULL,NULL); SELECT public.create_property_minimal('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002','Replay Property','SP-R','apartment','Address',current_date,'prop-replay-1',NULL,NULL,NULL)$$,
  '22023', NULL, 'minimal Property replay cannot cross branches before owner replay'
);
SELECT lives_ok(
  $$SELECT public.create_property('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','Full Property','SP-F','apartment',NULL,'Address','active',current_date,NULL,NULL,NULL,NULL)$$,
  'full branch-aware Property overload is executable'
);
SELECT lives_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Admin Standalone',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'])$$,
  'standalone Person creation remains Super-Admin-only compatibility'
);
SELECT throws_ok(
  $$SELECT public.create_person_branch_relationship('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.people WHERE display_name='Scoped Person'),'93000000-0000-0000-0000-000000000004')$$,
  '42501', NULL, 'Super Admin cannot link an existing Person to an inactive branch'
);
SELECT throws_ok(
  $$SELECT public.create_person_branch_relationship('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.people WHERE display_name='Scoped Person'),'93000000-0000-0000-0000-000000000005')$$,
  '42501', NULL, 'Super Admin cannot link an existing Person to an archived branch'
);
SELECT throws_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Inactive Scoped Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'93000000-0000-0000-0000-000000000004')$$,
  '42501', NULL, 'Super Admin cannot atomically create a Person in an inactive branch'
);
SELECT throws_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Archived Scoped Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'93000000-0000-0000-0000-000000000005')$$,
  '42501', NULL, 'Super Admin cannot atomically create a Person in an archived branch'
);
SELECT lives_ok(
  $$SELECT public.create_person('92000000-0000-0000-0000-000000000001','Scoped Travel Person',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'],'P123',current_date + 365,NULL,'93000000-0000-0000-0000-000000000001')$$,
  'branch-aware Person travel-document overload is executable'
);
SELECT lives_ok(
  $$SELECT public.create_person_branch_relationship('92000000-0000-0000-0000-000000000001',(SELECT id FROM public.people WHERE display_name='Scoped Person'),'93000000-0000-0000-0000-000000000002')$$,
  'Super Admin may link an existing Person to a second active branch'
);
SELECT is(
  (SELECT count(*) FROM public.person_branch_relationships WHERE person_id=(SELECT id FROM public.people WHERE display_name='Scoped Person') AND archived_at IS NULL),
  2::bigint,
  'Person identity can have multiple active branch relationships'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  EXISTS (SELECT 1 FROM public.people WHERE display_name='Scoped Person'),
  'second-branch ordinary user sees the shared Person only after explicit relationship creation'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  (SELECT count(*) FROM public.activity_logs WHERE organization_id='92000000-0000-0000-0000-000000000001' AND action='person_branch_relationship_created') >= 1,
  'Person branch relationship creation is audited'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','app_private')
      AND p.proname IN ('create_person_branch_relationship_checked','archive_person_branch_relationship_checked')
      AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
  ),
  'new privileged functions have no accidental PUBLIC execute'
);
SELECT ok(
  NOT has_function_privilege('anon','public.create_person_branch_relationship(uuid,uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.create_person_branch_relationship(uuid,uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.create_person_branch_relationship(uuid,uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.archive_person_branch_relationship(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.archive_person_branch_relationship(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.archive_person_branch_relationship(uuid,uuid)','EXECUTE'),
  'public Person relationship APIs have exact authenticated-only ACLs'
);
SELECT ok(
  NOT has_function_privilege('authenticated','app_private.create_person_branch_relationship_checked(uuid,uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','app_private.archive_person_branch_relationship_checked(uuid,uuid)','EXECUTE'),
  'internal Person relationship mutators are not directly callable'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.oid IN (
        'public.create_property(uuid,text,text,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure,
        'public.create_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure,
        'public.create_property_minimal(uuid,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure,
        'public.create_property_minimal(uuid,uuid,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure,
        'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)'::regprocedure,
        'public.update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)'::regprocedure,
        'public.create_person(uuid,text,text,text,text,text,text,text,text[])'::regprocedure,
        'public.create_person(uuid,text,text,text,text,text,text,text,text[],uuid)'::regprocedure,
        'public.create_person(uuid,text,text,text,text,text,text,text,text[],text,date,date)'::regprocedure,
        'public.create_person(uuid,text,text,text,text,text,text,text,text[],text,date,date,uuid)'::regprocedure
      )
      AND NOT ('search_path=""' = ANY(coalesce(p.proconfig,'{}'::text[])))
  ),
  'every touched privileged compatibility function has an empty effective search path'
);
SELECT ok(
  NOT has_table_privilege('anon','public.person_branch_relationships','SELECT')
  AND has_table_privilege('authenticated','public.person_branch_relationships','SELECT'),
  'Person relationship table is exposed only to authenticated reads'
);

SELECT * FROM finish();
ROLLBACK;
