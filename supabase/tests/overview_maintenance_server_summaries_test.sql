BEGIN;
-- Raw TAP keeps this regression runnable both through supabase test db and a
-- disposable native PostgreSQL installation without the optional pgTAP package.
CREATE TEMP SEQUENCE summary_test_number;
CREATE FUNCTION pg_temp.summary_assert(p_ok boolean, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint := nextval('pg_temp.summary_test_number');
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'summary assertion % failed: %', n, p_label; END IF;
  RETURN 'ok ' || n || ' - ' || p_label;
END $$;
GRANT USAGE ON SEQUENCE summary_test_number TO authenticated;

INSERT INTO auth.users(id,email) VALUES
 ('b9000000-0000-4000-8000-000000000001','summary-admin@example.test'),
 ('b9000000-0000-4000-8000-000000000002','summary-branch@example.test');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('b9010000-0000-4000-8000-000000000001','Summary synthetic organization','summary-synthetic'),
 ('b9010000-0000-4000-8000-000000000002','Summary isolation organization','summary-isolation');
INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
 ('b9020000-0000-4000-8000-000000000001','b9010000-0000-4000-8000-000000000001','Summary branch','SUMMARY','active'),
 ('b9020000-0000-4000-8000-000000000002','b9010000-0000-4000-8000-000000000001','Other branch','OTHER','active');
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('b9030000-0000-4000-8000-000000000000','b9010000-0000-4000-8000-000000000001','Summary operator');
INSERT INTO public.person_roles(organization_id,person_id,role) VALUES
 ('b9010000-0000-4000-8000-000000000001','b9030000-0000-4000-8000-000000000000','staff');
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id) VALUES
 ('b9010000-0000-4000-8000-000000000001','b9030000-0000-4000-8000-000000000000','b9020000-0000-4000-8000-000000000001');
INSERT INTO public.organization_roles(id,organization_id,name) VALUES
 ('b90a0000-0000-4000-8000-000000000001','b9010000-0000-4000-8000-000000000001','Summary branch coordinator');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT 'b9010000-0000-4000-8000-000000000001','b90a0000-0000-4000-8000-000000000001',permission::public.organization_permission_key
FROM unnest(ARRAY['maintenance.view','maintenance.create_assign','maintenance.complete','maintenance.review','properties.view','people.view','leases.view','finance.view']) permission;
INSERT INTO public.organization_members(organization_id,user_id,role,person_id,branch_id,custom_role_id) VALUES
 ('b9010000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','super_admin',null,null,null),
 ('b9010000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000002','custom','b9030000-0000-4000-8000-000000000000','b9020000-0000-4000-8000-000000000001','b90a0000-0000-4000-8000-000000000001');
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id='b9010000-0000-4000-8000-000000000001';

-- Synthetic bulk seeding skips operational write triggers only inside this
-- rollback transaction. All measured reads below use the real authenticated RLS.
SET LOCAL session_replication_role = replica;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure,status)
SELECT ('b9040000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 'b9020000-0000-4000-8000-000000000001','S'||lpad(i::text,4,'0'),'Synthetic '||i,'apartment','multi_unit','active'
FROM generate_series(1,1005) i;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure,status) VALUES
 ('b9040000-0000-4000-8000-000000009001','b9010000-0000-4000-8000-000000000001','b9020000-0000-4000-8000-000000000002','OTHER','Other branch','apartment','multi_unit','active'),
 ('b9040000-0000-4000-8000-000000009002','b9010000-0000-4000-8000-000000000002',null,'FOREIGN','Other organization','apartment','multi_unit','active');
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
SELECT ('b9050000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 ('b9040000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'U'||i,'occupied' FROM generate_series(1,1005) i;
INSERT INTO public.people(id,organization_id,display_name,primary_email)
SELECT ('b9030000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001','Synthetic tenant '||i,
 case when i=1005 then null else 'tenant-'||i||'@example.test' end FROM generate_series(1,1005) i;
INSERT INTO public.person_roles(organization_id,person_id,role)
SELECT 'b9010000-0000-4000-8000-000000000001',('b9030000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'tenant' FROM generate_series(1,1005) i;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status)
SELECT ('b9060000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 ('b9040000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('b9050000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('b9030000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'active' FROM generate_series(1,1005) i;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,confirmed_at,confirmed_by)
SELECT ('b9070000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 ('b9060000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,1,'2026-01-01','2026-11-01',0.01,'USD',now(),'b9000000-0000-4000-8000-000000000001'
FROM generate_series(1,1005) i;
INSERT INTO public.documents(organization_id,property_id,category,file_name,storage_path,mime_type,size_bytes)
SELECT 'b9010000-0000-4000-8000-000000000001',('b9040000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'General','synthetic.txt','synthetic/'||i,'text/plain',1 FROM generate_series(1,1005) i;
INSERT INTO public.tenant_requests(id,organization_id,property_id,title)
VALUES('b9080000-0000-4000-8000-000000000001','b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','Synthetic request');
INSERT INTO public.tasks(id,organization_id,tenant_request_id,property_id,unit_id,branch_id,assignee_person_id,title,status,priority,due_date,created_at,cost_estimate_amount,cost_estimate_currency)
SELECT ('b9090000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 'b9080000-0000-4000-8000-000000000001',('b9040000-0000-4000-8000-'||lpad(least(i,1005)::text,12,'0'))::uuid,
 case when i=1205 then 'b9050000-0000-4000-8000-000000001005'::uuid else null end,
 'b9020000-0000-4000-8000-000000000001','b9030000-0000-4000-8000-000000000000',
 case when i=1205 then 'Unique late inspection' else 'Synthetic repair '||i end,'pending','high','2026-10-14','2026-10-01',0.01,'USD'
FROM generate_series(1,1205) i;
INSERT INTO public.tasks(id,organization_id,tenant_request_id,property_id,branch_id,assignee_person_id,title,status,priority,due_date,reminder_date,reminder_time,archived_at)
SELECT ('b9090000-0000-4000-8000-'||lpad((9000+i)::text,12,'0'))::uuid,'b9010000-0000-4000-8000-000000000001',
 'b9080000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001',
 'b9020000-0000-4000-8000-000000000001','b9030000-0000-4000-8000-000000000000','Boundary '||i,
 (array['ready_for_review','blocked','completed','cancelled','pending'])[i], 'normal',
 case when i=2 then '2026-10-22'::date else '2026-10-15'::date end,'2026-10-15','09:00:59',
 case when i=5 then now() else null end FROM generate_series(1,5) i;
INSERT INTO public.tasks(id,organization_id,tenant_request_id,property_id,branch_id,title,status,priority,due_date) VALUES
 ('b9090000-0000-4000-8000-000000009101','b9010000-0000-4000-8000-000000000001','b9080000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000009001','b9020000-0000-4000-8000-000000000002','Hidden branch repair','pending','high','2026-10-14'),
 ('b9090000-0000-4000-8000-000000009102','b9010000-0000-4000-8000-000000000002','b9080000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000009002',null,'Foreign repair','pending','high','2026-10-14');
INSERT INTO public.ledger_entries(organization_id,property_id,transaction_date,direction,category,amount,currency)
SELECT 'b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001',
 case when i>25000 then '2026-09-30'::date else '2026-10-01'::date end,
 case when i between 20001 and 25000 then 'expense' else 'income' end,'Synthetic',
 case when i between 20001 and 25000 then 0.10 else 1 end,'USD' FROM generate_series(1,25100) i;
SET LOCAL session_replication_role = origin;
ANALYZE public.tasks;
ANALYZE public.ledger_entries;

CREATE TEMP TABLE summary_results(name text primary key, value jsonb);
GRANT ALL ON summary_results TO authenticated;
SELECT set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000001',true);
-- All large aggregate and search assertions run as the actual authenticated
-- role. The caller cannot disable RLS or elevate inside either public RPC.
SET LOCAL ROLE authenticated;
INSERT INTO summary_results VALUES ('overview',public.get_overview_summary('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',null,'2026-10-01'));
INSERT INTO summary_results VALUES ('maintenance',public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","propertyId":"all","unitId":"all","taskId":"all","status":"all","priority":"all","review":"open","searchTokens":[],"page":121,"pageSize":10,"sort":"due_asc"}',
 '2026-10-15','09:00','2026-10-01',true));
SELECT pg_temp.summary_assert((SELECT (value#>>'{counts,activeLeaseCount}')::int=1005 AND (value#>>'{counts,unitCount}')::int=1005 FROM summary_results WHERE name='overview'),'overview retains more than 1000 operational leases and units');
SELECT pg_temp.summary_assert((SELECT value#>'{expectedRent}'='{"leaseCount":1005,"amount":10.05}'::jsonb FROM summary_results WHERE name='overview'),'expected monthly rent is exact across all current authoritative terms');
SELECT pg_temp.summary_assert((SELECT (value#>>'{counts,ledgerEntryCount}')::int=25000 AND jsonb_array_length(value->'ledger')=2 FROM summary_results WHERE name='overview'),'financial start date and grouped ledger payload replace 25100 raw entries');
SELECT pg_temp.summary_assert((SELECT sum((bucket->>'amount')::numeric * case when bucket->>'direction'='expense' then -1 else 1 end)=19500 FROM summary_results,jsonb_array_elements(value->'ledger') bucket WHERE name='overview'),'cash buckets reconcile income and expenses to the cent');
SELECT pg_temp.summary_assert((SELECT jsonb_array_length(value->'properties')=1006 FROM summary_results WHERE name='overview'),'full portfolio chart rows remain complete');
SELECT pg_temp.summary_assert((SELECT sum((p->>'documentCount')::int)=1005 AND max(jsonb_array_length(p->'cases'))=6 FROM summary_results,jsonb_array_elements(value->'properties') p WHERE name='overview'),'document totals are exact and attention previews stay bounded at six');
SELECT pg_temp.summary_assert((SELECT (p->>'openCount')::int=201 AND jsonb_array_length(p->'cases')=6
 FROM summary_results,jsonb_array_elements(value->'properties') p WHERE name='overview' AND p->>'id'='b9040000-0000-4000-8000-000000001005'),
 'late property retains every one of its 201 tasks while its preview remains six');
SELECT pg_temp.summary_assert((SELECT (value#>>'{summary,total}')::int=1208 AND jsonb_array_length(value->'pageIds')=8 AND (value->>'page')::int=121 FROM summary_results WHERE name='maintenance'),'maintenance returns the complete last page beyond 1000 rows');
SELECT pg_temp.summary_assert((SELECT value->'queueCounts'='{"total":1210,"open":1208,"overdue":1206,"completed":1,"readyForReview":1,"upcoming":2}'::jsonb FROM summary_results WHERE name='maintenance'),'queue destinations include completed while filtered summary stays open');
SELECT pg_temp.summary_assert((SELECT (value#>>'{summary,estimateCostAmount}')::numeric=12.05 AND octet_length(value::text)<12000 FROM summary_results WHERE name='maintenance'),'maintenance exact costs and preview payload do not grow with task count');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","searchTokens":["unique","late"],"page":999,"pageSize":10}',
 '2026-10-15','09:00','2026-10-01')->'pageIds')='["b9090000-0000-4000-8000-000000001205"]'::jsonb,'late multi-token search matches before page clamping');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","searchTokens":["u1005"],"page":999,"pageSize":10}',
 '2026-10-15','09:00','2026-10-01')->'pageIds')='["b9090000-0000-4000-8000-000000001205"]'::jsonb,
 'referenced unit search includes the late match beyond 1000 units and tasks');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","searchTokens":["not-found"]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=0,'no-match search returns exact zero without scanning rows in the application');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","review":"reminders","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=1,'reminder clock preserves minute precision and excludes ready-for-review and terminal tasks');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","review":"upcoming","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=2,'upcoming includes today and the inclusive seven-day boundary');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"archived","taskId":"all","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=1,'archived summary remains independently selectable');
SET LOCAL ROLE authenticated;
SELECT pg_temp.summary_assert((public.get_overview_summary('b9010000-0000-4000-8000-000000000002','2026-10-15','2026-10-01')#>>'{counts,openMaintenanceCount}')::int=0,'overview cannot expose another organization through the RPC');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
INSERT INTO summary_results VALUES ('branch-overview',public.get_overview_summary('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',null,'2026-10-01'));
SELECT pg_temp.summary_assert((SELECT jsonb_array_length(value->'properties')=1005
 AND (value#>>'{counts,unitCount}')::int=1005 AND (value#>>'{counts,tenantCount}')::int=1005
 AND (value#>>'{counts,ledgerEntryCount}')::int=25000 FROM summary_results WHERE name='branch-overview'),
 'branch dashboard retains every permitted unit, tenant and ledger entry while hiding the sibling branch');
INSERT INTO summary_results VALUES ('branch',public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","actorScope":"organization","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01',true));
SELECT pg_temp.summary_assert((SELECT (value#>>'{summary,total}')::int=1209 FROM summary_results WHERE name='branch'),'actual branch RLS remains effective even when caller requests organization scope');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"b9090000-0000-4000-8000-000000009101","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=0,'focused task cannot bypass branch visibility');
SELECT pg_temp.summary_assert((public.get_maintenance_summary('b9010000-0000-4000-8000-000000000001',
 '{"archiveState":"active","taskId":"all","actorScope":"assigned","searchTokens":[]}',
 '2026-10-15','09:00','2026-10-01')#>>'{summary,total}')::int=0,'missing assigned actor context fails closed');
RESET ROLE;
SELECT pg_temp.summary_assert(NOT has_function_privilege('anon','public.get_overview_summary(uuid,date,date,uuid,date)','EXECUTE') AND NOT has_function_privilege('anon','public.get_maintenance_summary(uuid,jsonb,date,time,date,boolean)','EXECUTE'),'anonymous execution is denied');
SELECT pg_temp.summary_assert((SELECT bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE oid IN ('public.get_overview_summary(uuid,date,date,uuid,date)'::regprocedure,'public.get_maintenance_summary(uuid,jsonb,date,time,date,boolean)'::regprocedure)),'aggregate functions retain invoker RLS and a pinned search path');
-- Aggregate-only ledger authority must match the underlying SELECT policy,
-- including hidden rows that exist and recent-window/cutoff boundaries.
SET LOCAL session_replication_role = replica;
INSERT INTO public.ledger_entries(organization_id,property_id,transaction_date,direction,category,amount,currency,archived_at) VALUES
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000009001','2026-10-10','income','Hidden branch',999,'USD',null),
 ('b9010000-0000-4000-8000-000000000002','b9040000-0000-4000-8000-000000009002','2026-10-10','income','Foreign organization',999,'USD',null),
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','2026-09-14','expense','Before recent window',1000,'USD',null),
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','2026-09-15','expense','At recent window',1000,'USD',null),
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','2026-10-15','expense','Today',1000,'USD',null),
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','2026-10-16','expense','Future within chart month',1000,'USD',null),
 ('b9010000-0000-4000-8000-000000000001','b9040000-0000-4000-8000-000000000001','2026-10-15','expense','Archived',9999,'USD',now());
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.summary_assert((SELECT count(*)=0 FROM app_private.overview_ledger_buckets(
 'b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01','b9040000-0000-4000-8000-000000009001',null)),
 'ledger helper excludes existing sibling-branch money');
SELECT pg_temp.summary_assert((SELECT count(*)=0 FROM app_private.overview_ledger_buckets(
 'b9010000-0000-4000-8000-000000000002','2026-10-15','2026-10-01',null,null)),
 'ledger helper excludes existing foreign-organization money');
SELECT pg_temp.summary_assert((SELECT sum(entry_count)=25104 AND sum(large_expense_count)=2
 AND sum(window_count)=25104 AND sum(amount*case when direction='expense' then -1 else 1 end)=15600
 FROM app_private.overview_ledger_buckets('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',null,'2026-09-01')),
 'ledger grouping preserves inclusive recent boundary, today, future monthly amounts, archived exclusion and exact cents');
SELECT pg_temp.summary_assert((SELECT sum(entry_count)=25002 AND sum(large_expense_count)=1
 AND sum(amount*case when direction='expense' then -1 else 1 end)=17500
 FROM app_private.overview_ledger_buckets('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',null,'2026-10-01')),
 'financial cutoff applies to lifetime count, recent expenses and monthly money together');
RESET ROLE;
SET LOCAL session_replication_role = replica;
DELETE FROM public.organization_role_permissions WHERE role_id='b90a0000-0000-4000-8000-000000000001' AND permission_key='finance.view';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.summary_assert((public.get_overview_summary('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',
 'b9040000-0000-4000-8000-000000000001','2026-10-01')#>>'{counts,ledgerEntryCount}')::integer=0,
 'public invoker dashboard cannot reveal ledger aggregates without finance permission');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.summary_assert((SELECT count(*)=0 FROM app_private.overview_ledger_buckets(
 'b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01',null,null)),
 'private aggregate returns no rows without an authenticated actor');
RESET ROLE;
SELECT pg_temp.summary_assert((SELECT prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=""']
 AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',oid,'EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0)
 FROM pg_proc WHERE oid='app_private.overview_ledger_buckets(uuid,date,date,uuid,date)'::regprocedure),
 'private aggregate keeps a pinned path and authenticated-only execution');
CREATE FUNCTION pg_temp.overview_rejects_changed_ledger_policy() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 PERFORM public.get_overview_summary('b9010000-0000-4000-8000-000000000001','2026-10-15','2026-10-01');
 RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN SQLERRM LIKE 'Ledger read policy changed%';
END $$;
CREATE POLICY summary_future_ledger_restriction ON public.ledger_entries AS RESTRICTIVE FOR SELECT TO authenticated USING(false);
SELECT set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.summary_assert(pg_temp.overview_rejects_changed_ledger_policy(),
 'future restrictive ledger policy fails the aggregate closed until authority is reviewed');
RESET ROLE;
DROP POLICY summary_future_ledger_restriction ON public.ledger_entries;
ALTER POLICY ledger_entries_branch_select ON public.ledger_entries USING(true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.summary_assert(pg_temp.overview_rejects_changed_ledger_policy(),
 'changed sole ledger authority expression also fails the aggregate closed');
RESET ROLE;
SELECT '1..32';
ROLLBACK;
