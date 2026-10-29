BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

SELECT has_table('public', 'workspace_saved_views', 'saved view preferences exist');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.workspace_saved_views'::regclass), 'preferences force RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.workspace_saved_views', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous users have no table grants');

INSERT INTO auth.users(id) VALUES ('e55a0000-0000-4000-8000-000000000001'), ('e55a0000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id, name, slug) VALUES
  ('e55a0000-0000-4000-8000-000000000011', 'Saved views test one', 'saved-views-test-one'),
  ('e55a0000-0000-4000-8000-000000000012', 'Saved views test two', 'saved-views-test-two');
INSERT INTO public.organization_members(organization_id, user_id, role) VALUES
  ('e55a0000-0000-4000-8000-000000000011', 'e55a0000-0000-4000-8000-000000000001', 'super_admin'),
  ('e55a0000-0000-4000-8000-000000000011', 'e55a0000-0000-4000-8000-000000000002', 'super_admin'),
  ('e55a0000-0000-4000-8000-000000000012', 'e55a0000-0000-4000-8000-000000000002', 'super_admin');
SELECT set_config('request.jwt.claim.sub', 'e55a0000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.workspace_saved_views(organization_id,user_id,resource,name,query)
  VALUES('e55a0000-0000-4000-8000-000000000011','e55a0000-0000-4000-8000-000000000001','/units','Vacancies','occupancy=unoccupied')$$, 'members can save their own view');
SELECT lives_ok($$UPDATE public.workspace_saved_views SET query='status=vacant' WHERE name='Vacancies'$$, 'members can update their own preferences');
SELECT throws_ok($$INSERT INTO public.workspace_saved_views(organization_id,user_id,resource,name,query)
  VALUES('e55a0000-0000-4000-8000-000000000011','e55a0000-0000-4000-8000-000000000002','/units','Forged user','')$$, '42501', NULL, 'cannot write another user preference');
SELECT throws_ok($$INSERT INTO public.workspace_saved_views(organization_id,user_id,resource,name,query)
  VALUES('e55a0000-0000-4000-8000-000000000012','e55a0000-0000-4000-8000-000000000001','/units','Forged workspace','')$$, '42501', NULL, 'cannot write outside workspace membership');
INSERT INTO public.workspace_saved_views(organization_id,user_id,resource,name,query)
  SELECT 'e55a0000-0000-4000-8000-000000000011','e55a0000-0000-4000-8000-000000000001','/units','View ' || n,'' FROM generate_series(1,11) n;
SELECT throws_ok($$INSERT INTO public.workspace_saved_views(organization_id,user_id,resource,name,query)
  VALUES('e55a0000-0000-4000-8000-000000000011','e55a0000-0000-4000-8000-000000000001','/units','Thirteenth','')$$, '23514', NULL, 'enforces a bounded view count');
SELECT set_config('request.jwt.claim.sub', 'e55a0000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*) FROM public.workspace_saved_views), 0::bigint, 'same-workspace administrator cannot read another user views');
WITH removed AS (DELETE FROM public.workspace_saved_views RETURNING 1)
SELECT is((SELECT count(*) FROM removed), 0::bigint, 'cannot delete another user views');
WITH changed AS (UPDATE public.workspace_saved_views SET query='changed' RETURNING 1)
SELECT is((SELECT count(*) FROM changed), 0::bigint, 'cannot update another user views');
SELECT * FROM finish();
ROLLBACK;
