BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
 ('fa910000-0000-4000-8000-000000000001','unit-retry-a@example.test'),
 ('fa910000-0000-4000-8000-000000000002','unit-retry-b@example.test');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa910000-0000-4000-8000-000000000010','Unit retry','unit-creation-retry-test');
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT 'fa910000-0000-4000-8000-000000000010',id,'super_admin'
 FROM auth.users WHERE id IN ('fa910000-0000-4000-8000-000000000001','fa910000-0000-4000-8000-000000000002');
INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES
 ('fa910000-0000-4000-8000-000000000020','fa910000-0000-4000-8000-000000000010','First','ONE'),
 ('fa910000-0000-4000-8000-000000000021','fa910000-0000-4000-8000-000000000010','Second','TWO');
INSERT INTO public.properties(id,organization_id,name,code,property_type,status) VALUES
 ('fa910000-0000-4000-8000-000000000030','fa910000-0000-4000-8000-000000000010','First','UR1','apartment','active'),
 ('fa910000-0000-4000-8000-000000000031','fa910000-0000-4000-8000-000000000010','Second','UR2','apartment','active');
SELECT set_config('request.jwt.claim.sub','fa910000-0000-4000-8000-000000000001',true);
SELECT public.assign_property_branch('fa910000-0000-4000-8000-000000000010',id,'fa910000-0000-4000-8000-000000000020')
 FROM public.properties WHERE organization_id='fa910000-0000-4000-8000-000000000010';
CREATE TEMP TABLE unit_retry_state(id uuid);
GRANT ALL ON unit_retry_state TO authenticated;
CREATE FUNCTION pg_temp.retry_unit(
 p_key text DEFAULT 'unit-retry-original', p_number text DEFAULT 'Étage 1',
 p_size numeric DEFAULT 1.005, p_bed numeric DEFAULT NULL,
 p_property uuid DEFAULT 'fa910000-0000-4000-8000-000000000030'
) RETURNS uuid LANGUAGE sql AS $$
 SELECT public.create_unit('fa910000-0000-4000-8000-000000000010',p_property,
   p_number,NULL,p_size,p_bed,0,'vacant',p_key);
$$;

SELECT ok(has_function_privilege('authenticated',
 'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text,text)','EXECUTE'),'authenticated may use keyed creation');
SELECT ok(NOT has_function_privilege('anon',
 'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text,text)','EXECUTE'),'anonymous cannot use keyed creation');
SELECT ok(NOT has_function_privilege('service_role',
 'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text,text)','EXECUTE'),'service role cannot impersonate the creator');
SELECT ok(NOT has_table_privilege('authenticated','app_private.unit_creation_requests','SELECT,INSERT,UPDATE,DELETE'),'receipts are private');
SELECT ok(has_function_privilege('authenticated',
 'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)','EXECUTE'),'eight-argument compatibility remains');
SELECT ok(has_function_privilege('authenticated',
 'public.create_unit(uuid,uuid,text,text,numeric,text)','EXECUTE'),'six-argument compatibility remains');

SET LOCAL ROLE authenticated;
INSERT INTO unit_retry_state SELECT pg_temp.retry_unit();
SELECT is(pg_temp.retry_unit(),(SELECT id FROM unit_retry_state),'retry returns original server UUID');
SELECT is((SELECT count(*) FROM public.units WHERE property_id='fa910000-0000-4000-8000-000000000030'),1::bigint,'one unit only');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id=(SELECT id FROM unit_retry_state) AND action='unit_created'),1::bigint,'one creation audit only');
SELECT is((SELECT size_sqm FROM public.units WHERE id=(SELECT id FROM unit_retry_state)),1.01::numeric,'database rounding preserved');
SELECT is((SELECT unit_number FROM public.units WHERE id=(SELECT id FROM unit_retry_state)),'Étage 1','Unicode and NBSP preserved');
SELECT ok((SELECT floor IS NULL AND bedroom_count IS NULL AND bathroom_count=0 FROM public.units WHERE id=(SELECT id FROM unit_retry_state)),'null and zero stay distinct');
SELECT throws_ok($$SELECT pg_temp.retry_unit('short')$$,'22023','A valid unit creation key is required','short keys rejected');
SELECT throws_ok($$SELECT pg_temp.retry_unit('unit-retry-original','Changed')$$,'22023','Conflicting unit creation request','changed label rejected');
SELECT throws_ok($$SELECT pg_temp.retry_unit('unit-retry-original','Étage 1',1.01)$$,'22023','Conflicting unit creation request','different raw size with same stored rounding rejected');
SELECT throws_ok($$SELECT pg_temp.retry_unit('unit-retry-original','Étage 1',1.005,0)$$,'22023','Conflicting unit creation request','null-to-zero payload change rejected');
SELECT throws_ok($$SELECT pg_temp.retry_unit('unit-retry-original','Étage 1',1.005,NULL,'fa910000-0000-4000-8000-000000000031')$$,'22023','Conflicting unit creation request','different parent rejected');
SELECT set_config('request.jwt.claim.sub','fa910000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT pg_temp.retry_unit()$$,'22023','Conflicting unit creation request','different authorized actor cannot adopt receipt');
SELECT set_config('request.jwt.claim.sub','fa910000-0000-4000-8000-000000000001',true);
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.unit_creation_requests WHERE organization_id='fa910000-0000-4000-8000-000000000010'),1::bigint,'retries and conflicts retain one receipt');
UPDATE public.units SET floor='changed' WHERE id=(SELECT id FROM unit_retry_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.retry_unit()$$,'55000','Created unit changed; review the existing unit','mutated unit is never adopted');
RESET ROLE;
UPDATE public.units SET floor=NULL,archived_at=now(),archived_by='fa910000-0000-4000-8000-000000000001' WHERE id=(SELECT id FROM unit_retry_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.retry_unit()$$,'55000','Created unit changed; review the existing unit','archived unit is never recreated');
RESET ROLE;
UPDATE public.units SET archived_at=NULL,archived_by=NULL WHERE id=(SELECT id FROM unit_retry_state);
UPDATE public.organization_branches SET status='inactive' WHERE id='fa910000-0000-4000-8000-000000000020';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.retry_unit()$$,'42501','Not authorized','inactive branch blocks even a super admin replay');
RESET ROLE;
UPDATE public.organization_branches SET status='active' WHERE id='fa910000-0000-4000-8000-000000000020';
DELETE FROM public.organization_members WHERE organization_id='fa910000-0000-4000-8000-000000000010' AND user_id='fa910000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.retry_unit()$$,'42501','Not authorized','revoked membership blocks replay');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.units WHERE organization_id='fa910000-0000-4000-8000-000000000010'),1::bigint,'all rejected replays preserve exact inventory');
SELECT * FROM finish();
ROLLBACK;
