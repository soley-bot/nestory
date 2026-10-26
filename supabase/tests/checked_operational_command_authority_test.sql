BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('fa231000-0000-4000-8000-000000000010','authenticated','authenticated','command-admin@test.invalid','{"provider":"email","providers":["email"]}','{}'),
 ('fa231000-0000-4000-8000-000000000011','authenticated','authenticated','command-member@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa231000-0000-4000-8000-000000000001','Command fixture','checked-command-test'),
 ('fa231000-0000-4000-8000-000000000009','Foreign command fixture','checked-command-other');
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
VALUES('fa231000-0000-4000-8000-000000000020','fa231000-0000-4000-8000-000000000001','Command branch','CMD','active');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('fa231000-0000-4000-8000-000000000012','fa231000-0000-4000-8000-000000000001','Restricted staff');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000012','staff','active');
INSERT INTO public.organization_roles(id,organization_id,name,status)
VALUES('fa231000-0000-4000-8000-000000000013','fa231000-0000-4000-8000-000000000001','Read-only operational fixture','active');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT 'fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000013',permission::public.organization_permission_key
FROM unnest(ARRAY['properties.view','maintenance.view']) permission;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,person_id,custom_role_id) VALUES
 ('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000010','super_admin',NULL,NULL,NULL),
 ('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000011','custom','fa231000-0000-4000-8000-000000000020','fa231000-0000-4000-8000-000000000012','fa231000-0000-4000-8000-000000000013');
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='fa231000-0000-4000-8000-000000000001';
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id) VALUES
 ('fa231000-0000-4000-8000-000000000002','fa231000-0000-4000-8000-000000000001','Command property','CMD-A','Apartment','fa231000-0000-4000-8000-000000000020'),
 ('fa231000-0000-4000-8000-000000000003','fa231000-0000-4000-8000-000000000001','Other property','CMD-B','Apartment','fa231000-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.units(id,organization_id,property_id,unit_number)
VALUES('fa231000-0000-4000-8000-000000000004','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002','CMD-1');
INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title)
VALUES('fa231000-0000-4000-8000-000000000030','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002','2026-10-01','Inspection','Command note');
INSERT INTO public.tenant_requests(id,organization_id,property_id,title)
VALUES('fa231000-0000-4000-8000-000000000040','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002','Command request');
INSERT INTO public.tasks(id,organization_id,property_id,unit_id,tenant_request_id,title,branch_id)
VALUES('fa231000-0000-4000-8000-000000000041','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002','fa231000-0000-4000-8000-000000000004','fa231000-0000-4000-8000-000000000040','Command task','fa231000-0000-4000-8000-000000000020');
CREATE TEMP TABLE command_cases(name text,command text);
INSERT INTO command_cases VALUES
 ('create timeline',$$SELECT public.create_timeline_event('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002',NULL,'2026-10-01','Inspection','Checked create',NULL,NULL,NULL)$$),
 ('update timeline',$$SELECT public.update_timeline_event('fa231000-0000-4000-8000-000000000030','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002',NULL,'2026-10-01','Inspection','Checked update',NULL,NULL,NULL)$$),
 ('archive timeline',$$SELECT public.archive_timeline_event('fa231000-0000-4000-8000-000000000030','fa231000-0000-4000-8000-000000000001')$$),
 ('restore timeline',$$SELECT public.restore_timeline_event('fa231000-0000-4000-8000-000000000030','fa231000-0000-4000-8000-000000000001')$$),
 ('archive task',$$SELECT public.archive_maintenance_task('fa231000-0000-4000-8000-000000000041','fa231000-0000-4000-8000-000000000001')$$),
 ('restore task',$$SELECT public.restore_maintenance_task('fa231000-0000-4000-8000-000000000041','fa231000-0000-4000-8000-000000000001')$$);
-- Test harness data only; no product permissions are widened.
GRANT SELECT ON command_cases TO authenticated;
SELECT ok(NOT has_function_privilege('authenticated','app_private.assert_property_permission(uuid,uuid,public.organization_permission_key)','EXECUTE'),'private property assertion remains inaccessible');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('timeline_events','tasks','activity_logs') AND cmd<>'SELECT'),0::bigint,'product tables retain SELECT-only RLS');
SELECT ok(p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'),p.proname||' retains checked context and closed execution ACL')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('create_timeline_event','update_timeline_event','archive_timeline_event','restore_timeline_event','archive_maintenance_task','restore_maintenance_task');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(command,'28000','Not authenticated',name||' rejects missing actor') FROM command_cases;
SELECT set_config('request.jwt.claim.sub','fa231000-0000-4000-8000-000000000099',true);
SELECT throws_ok(command,'42501','Not authorized',name||' rejects actor without membership') FROM command_cases;
SELECT set_config('request.jwt.claim.sub','fa231000-0000-4000-8000-000000000011',true);
SELECT is((SELECT count(*) FROM public.timeline_events WHERE id='fa231000-0000-4000-8000-000000000030'),1::bigint,'restricted member has active ordinary read access');
SELECT throws_ok(command,'42501','Not authorized',name||' rejects member without required permission') FROM command_cases;
SELECT set_config('request.jwt.claim.sub','fa231000-0000-4000-8000-000000000010',true);
SELECT throws_ok(replace(command,'fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000009'),'42501','Not authorized',name||' rejects foreign organization') FROM command_cases;
SELECT throws_ok($$INSERT INTO public.timeline_events(organization_id,property_id,event_date,event_type,title) VALUES('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000002','2026-10-01','Inspection','Direct bypass')$$,'42501','new row violates row-level security policy for table "timeline_events"','direct timeline insert remains denied');
WITH changed AS (UPDATE public.timeline_events SET title='Direct bypass' WHERE id='fa231000-0000-4000-8000-000000000030' RETURNING id)
SELECT is(count(*),0::bigint,'direct timeline update remains denied') FROM changed;
SELECT throws_ok($$UPDATE public.tasks SET archived_at=now() WHERE id='fa231000-0000-4000-8000-000000000041'$$,
 '42501','permission denied for table tasks','direct task archive retains its table-permission denial');
SELECT throws_ok($$SELECT public.create_timeline_event('fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000003','fa231000-0000-4000-8000-000000000004','2026-10-01','Inspection','Wrong unit',NULL,NULL,NULL)$$,'23503','Unit not found for property','timeline create rejects another property unit');
SELECT throws_ok($$SELECT public.update_timeline_event('fa231000-0000-4000-8000-000000000030','fa231000-0000-4000-8000-000000000001','fa231000-0000-4000-8000-000000000003','fa231000-0000-4000-8000-000000000004','2026-10-01','Inspection','Wrong unit',NULL,NULL,NULL)$$,'23503','Unit not found for property','timeline update rejects another property unit');
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='create timeline';
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='update timeline';
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='archive timeline';
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='restore timeline';
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='archive task';
SELECT lives_ok(command,name||' succeeds for authorized ordinary-session caller') FROM command_cases WHERE name='restore task';
RESET ROLE;
SELECT ok((SELECT archived_at IS NULL AND updated_by='fa231000-0000-4000-8000-000000000010' FROM public.tasks WHERE id='fa231000-0000-4000-8000-000000000041'),'task restore records actual actor');
SELECT ok((SELECT archived_at IS NULL AND title='Checked update' AND updated_by='fa231000-0000-4000-8000-000000000010' FROM public.timeline_events WHERE id='fa231000-0000-4000-8000-000000000030'),'timeline update and restore record actual actor');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='fa231000-0000-4000-8000-000000000001' AND entity_type IN ('timeline_event','task') AND actor_id='fa231000-0000-4000-8000-000000000010'),6::bigint,'six successful commands append actor-owned audit evidence');
SET LOCAL ROLE authenticated;
SELECT public.archive_maintenance_task('fa231000-0000-4000-8000-000000000041','fa231000-0000-4000-8000-000000000001');
RESET ROLE;
UPDATE public.units SET property_id='fa231000-0000-4000-8000-000000000003' WHERE id='fa231000-0000-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.restore_maintenance_task('fa231000-0000-4000-8000-000000000041','fa231000-0000-4000-8000-000000000001')$$,'23503','Unit not found','task restore rechecks a unit moved to another property');
RESET ROLE;
SELECT ok((SELECT archived_at IS NOT NULL FROM public.tasks WHERE id='fa231000-0000-4000-8000-000000000041'),'rejected unit binding leaves task archived');
SELECT * FROM finish();
ROLLBACK;
