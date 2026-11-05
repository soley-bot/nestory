BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
('da000000-0000-0000-0000-000000000001','restricted-writer@example.test'),
('da000000-0000-0000-0000-000000000002','restricted-viewer@example.test'),
('da000000-0000-0000-0000-000000000003','restricted-superadmin@example.test');
INSERT INTO public.organizations(id,name,slug) VALUES
('db000000-0000-0000-0000-000000000001','Restricted company A','restricted-company-a'),
('db000000-0000-0000-0000-000000000002','Restricted company B','restricted-company-b');
INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES
('dc000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','Branch A','A'),
('dc000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','Branch B','B'),
('dc000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002','Foreign branch','F');
INSERT INTO public.organization_roles(id,organization_id,name) VALUES
('dd000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','Restricted writer'),
('dd000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','Restricted viewer');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT 'db000000-0000-0000-0000-000000000001'::uuid,'dd000000-0000-0000-0000-000000000001'::uuid,key::public.organization_permission_key
FROM unnest(ARRAY['properties.view','properties.write','properties.archive','maintenance.view','maintenance.create_assign']) key;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES
('db000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002','properties.view');
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES
('db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000001','custom','dc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001'),
('db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000002','custom','dc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002'),
('db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000003','super_admin',NULL,NULL);
ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type) VALUES
('de000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','dc000000-0000-0000-0000-000000000001','Own property','RA','apartment'),
('de000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','dc000000-0000-0000-0000-000000000002','Other branch property','RB','apartment'),
('de000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000003','Foreign property','RF','apartment'),
('de000000-0000-0000-0000-000000000004','db000000-0000-0000-0000-000000000001','dc000000-0000-0000-0000-000000000001','Empty lifecycle property','RE','apartment');
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.units(id,organization_id,property_id,unit_number) VALUES
('df000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','A1'),
('df000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000002','B1'),
('df000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000003','F1');
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='db000000-0000-0000-0000-000000000001';
INSERT INTO public.tenant_requests(id,organization_id,property_id,title) VALUES
('d2000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','Own request'),
('d2000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000002','Other request'),
('d2000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000003','Foreign request');
INSERT INTO public.tasks(id,organization_id,tenant_request_id,property_id,branch_id,title,category,priority,status) VALUES
('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','dc000000-0000-0000-0000-000000000001','Own maintenance','Repairs','normal','pending'),
('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000002','Other maintenance','Repairs','normal','pending'),
('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000003','de000000-0000-0000-0000-000000000003','dc000000-0000-0000-0000-000000000003','Foreign maintenance','Repairs','normal','pending');

SELECT set_config('request.jwt.claim.sub','da000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is(public.archive_maintenance_task(p_task_id=>'d1000000-0000-0000-000000000001',p_organization_id=>'db000000-0000-0000-0000-000000000001'),'d1000000-0000-0000-000000000001'::uuid,'database permits existing create_assign archive and returns exact task ID');
SELECT ok((SELECT archived_at IS NOT NULL AND archived_by=auth.uid() FROM public.tasks WHERE id='d1000000-0000-0000-0000-000000000001'),'archive persists caller attribution');
SELECT is(public.restore_maintenance_task(p_task_id=>'d1000000-0000-0000-0000-000000000001',p_organization_id=>'db000000-0000-0000-0000-000000000001'),'d1000000-0000-0000-0000-000000000001'::uuid,'database permits existing create_assign restore and returns exact task ID');
SELECT ok((SELECT archived_at IS NULL AND archived_by IS NULL AND updated_by=auth.uid() FROM public.tasks WHERE id='d1000000-0000-0000-0000-000000000001'),'restore clears archive state and retains caller attribution');
SELECT throws_ok($$SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'delegated maintenance archive still denies other branch direct ID');
SELECT throws_ok($$SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'delegated maintenance restore denies other branch before lifecycle lookup');
SELECT throws_ok($$SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002')$$,'42501',NULL,'delegated maintenance archive denies foreign company');
SELECT throws_ok($$SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002')$$,'42501',NULL,'delegated maintenance restore denies foreign company');
SELECT throws_ok($$SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'mismatched task/company pair is denied');
SELECT throws_ok($$SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000099','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'missing task is denied without leaking lifecycle');
SELECT is((SELECT count(*) FROM public.properties),2::bigint,'writer reads only assigned branch');
SELECT is_empty($$SELECT id FROM public.properties WHERE id='de000000-0000-0000-0000-000000000002'$$,'guessed other-branch Property ID is hidden');
SELECT is_empty($$SELECT id FROM public.properties WHERE id='de000000-0000-0000-0000-000000000003'$$,'guessed other-company Property ID is hidden');
SELECT is((SELECT count(*) FROM public.units u JOIN public.properties p ON p.id=u.property_id),1::bigint,'linked Unit join cannot expand Property scope');
SELECT lives_ok($$SELECT public.create_unit('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','A2','1',50,'vacant')$$,'writer creates linked Unit in assigned branch');
SELECT lives_ok($$SELECT public.update_unit('df000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','A1','2',55,'vacant')$$,'writer updates known same-branch Unit ID');
SELECT throws_ok($$SELECT public.update_unit('df000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000002','A1','2',55,'vacant')$$,'42501',NULL,'writer cannot move Unit to other branch by direct ID');
SELECT throws_ok($$SELECT public.create_unit('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000002','Denied','1',50,'vacant')$$,'42501',NULL,'writer cannot create linked Unit in other branch');
SELECT throws_ok($$SELECT public.create_unit('db000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000003','Denied','1',50,'vacant')$$,'42501',NULL,'writer cannot create Unit in other company');
SELECT throws_ok($$SELECT public.archive_property('de000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'writer cannot archive guessed other-branch ID');
SELECT throws_ok($$SELECT public.archive_property('de000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002')$$,'42501',NULL,'writer cannot archive guessed foreign-company ID');
SELECT throws_ok($$DELETE FROM public.units WHERE id='df000000-0000-0000-0000-000000000001'$$,'42501',NULL,'physical delete remains closed even for writer');
SELECT throws_ok($$INSERT INTO public.units(organization_id,property_id,unit_number) VALUES('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','Raw')$$,'42501',NULL,'raw Data API insert cannot bypass checked RPC');
SELECT throws_ok($$UPDATE public.units SET floor='99' WHERE id='df000000-0000-0000-0000-000000000001'$$,'42501',NULL,'raw Data API update cannot bypass checked RPC');
SELECT lives_ok($$SELECT public.archive_property('de000000-0000-0000-0000-000000000004','db000000-0000-0000-0000-000000000001')$$,'writer archives allowed empty Property through lifecycle RPC');
SELECT lives_ok($$SELECT public.restore_property('de000000-0000-0000-0000-000000000004','db000000-0000-0000-0000-000000000001')$$,'writer restores allowed Property through lifecycle RPC');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','da000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$,'42501',NULL,'viewer lacking maintenance.create_assign cannot archive same-branch task');
SELECT throws_ok($SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$,'42501',NULL,'viewer lacking maintenance.create_assign cannot restore same-branch task');
SELECT is((SELECT count(*) FROM public.units),2::bigint,'viewer reads allowed Units including writer-created record');
SELECT throws_ok($$SELECT public.create_unit('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','Denied','1',50,'vacant')$$,'42501',NULL,'viewer cannot create same-branch Unit');
SELECT throws_ok($$SELECT public.update_unit('df000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','A1','99',55,'vacant')$$,'42501',NULL,'viewer cannot update visible direct ID');
SELECT throws_ok($$SELECT public.archive_property('de000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'viewer cannot archive visible direct ID');
RESET ROLE;
SELECT is((SELECT floor FROM public.units WHERE id='df000000-0000-0000-0000-000000000001'),'2','denied writes preserve successful writer value');
SELECT is((SELECT property_id FROM public.units WHERE id='df000000-0000-0000-0000-000000000001'),'de000000-0000-0000-0000-000000000001'::uuid,'denied branch move preserves parent');
SELECT is((SELECT count(*) FROM public.units),4::bigint,'denied creates and delete leave fixture cardinality intact');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id='d1000000-0000-0000-0000-000000000001' AND actor_id='da000000-0000-0000-0000-000000000001' AND action IN('archived','restored')),2::bigint,'delegated lifecycle writes remain audited under actual actor');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.tasks WHERE id IN('d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000003') AND archived_at IS NOT NULL),'denied operations leave other scopes unchanged');
SELECT set_config('request.jwt.claim.sub','da000000-0000-0000-0000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001')$,'Super Admin can archive another branch in own company');
SELECT lives_ok($SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001')$,'Super Admin can restore another branch in own company');
SELECT throws_ok($SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002')$,'42501',NULL,'Super Admin cannot archive a foreign company task');
SELECT throws_ok($SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000003','db000000-0000-0000-0000-000000000002')$,'42501',NULL,'Super Admin cannot restore a foreign company task');
SELECT throws_ok($SELECT app_private.assert_property_permission('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','maintenance.create_assign')$,'42501',NULL,'even Super Admin cannot execute private helper directly as authenticated');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($SELECT public.archive_maintenance_task('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$,'28000',NULL,'authenticated database role without user identity cannot archive');
SELECT throws_ok($SELECT public.restore_maintenance_task('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$,'28000',NULL,'authenticated database role without user identity cannot restore');
RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated','app_private.assert_property_permission(uuid,uuid,public.organization_permission_key)','EXECUTE') AND NOT has_function_privilege('anon','app_private.assert_property_permission(uuid,uuid,public.organization_permission_key)','EXECUTE'),'helper remains private with no authenticated or anonymous execution grant');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='app_private.assert_property_permission(uuid,uuid,public.organization_permission_key)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'helper has no PUBLIC execution grant');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN('public.archive_maintenance_task(uuid,uuid)'::regprocedure,'public.restore_maintenance_task(uuid,uuid)'::regprocedure) AND (NOT p.prosecdef OR NOT ('search_path=""'=ANY(coalesce(p.proconfig,'{}'))))),'only checked lifecycle entrypoints run with hardened definer context');
SELECT ok(has_function_privilege('authenticated','public.archive_maintenance_task(uuid,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.restore_maintenance_task(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.archive_maintenance_task(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.restore_maintenance_task(uuid,uuid)','EXECUTE'),'lifecycle RPC execution ACL remains authenticated-only');
SELECT * FROM finish();
ROLLBACK;
