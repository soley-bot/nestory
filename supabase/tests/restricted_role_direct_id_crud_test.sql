BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
('da000000-0000-0000-0000-000000000001','restricted-writer@example.test'),
('da000000-0000-0000-0000-000000000002','restricted-viewer@example.test');
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
('db000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000002','custom','dc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002');
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
('d2000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000002','Other request');
INSERT INTO public.tasks(id,organization_id,tenant_request_id,property_id,branch_id,title,category,priority,status) VALUES
('d1000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','dc000000-0000-0000-0000-000000000001','Own maintenance','Repairs','normal','pending'),
('d1000000-0000-0000-0000-000000000002','db000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000002','dc000000-0000-0000-0000-000000000002','Other maintenance','Repairs','normal','pending');

SELECT set_config('request.jwt.claim.sub','da000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.archive_maintenance_task('db000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001')$$,'database permits custom create_assign maintenance archive despite Super Admin application gate');
SELECT lives_ok($$SELECT public.restore_maintenance_task('db000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001')$$,'database permits custom create_assign maintenance restore');
SELECT throws_ok($$SELECT public.archive_maintenance_task('db000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002')$$,'42501',NULL,'delegated maintenance archive still denies other branch direct ID');
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
SELECT is((SELECT count(*) FROM public.units),2::bigint,'viewer reads allowed Units including writer-created record');
SELECT throws_ok($$SELECT public.create_unit('db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','Denied','1',50,'vacant')$$,'42501',NULL,'viewer cannot create same-branch Unit');
SELECT throws_ok($$SELECT public.update_unit('df000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','A1','99',55,'vacant')$$,'42501',NULL,'viewer cannot update visible direct ID');
SELECT throws_ok($$SELECT public.archive_property('de000000-0000-0000-0000-000000000001','db000000-0000-0000-0000-000000000001')$$,'42501',NULL,'viewer cannot archive visible direct ID');
RESET ROLE;
SELECT is((SELECT floor FROM public.units WHERE id='df000000-0000-0000-0000-000000000001'),'2','denied writes preserve successful writer value');
SELECT is((SELECT property_id FROM public.units WHERE id='df000000-0000-0000-0000-000000000001'),'de000000-0000-0000-0000-000000000001'::uuid,'denied branch move preserves parent');
SELECT is((SELECT count(*) FROM public.units),4::bigint,'denied creates and delete leave fixture cardinality intact');
SELECT * FROM finish();
ROLLBACK;
