BEGIN;
SET search_path=public,extensions;
CREATE TEMP TABLE document_plan_assertions(n integer);
INSERT INTO document_plan_assertions VALUES(0);
CREATE FUNCTION pg_temp.document_plan_ok(p_ok boolean,p_label text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_n integer;
BEGIN
  UPDATE pg_temp.document_plan_assertions SET n=n+1 RETURNING n INTO v_n;
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'not ok % - %',v_n,p_label; END IF;
  RETURN 'ok '||v_n||' - '||p_label;
END; $$;
-- These references are copied from the released migrations, not reconstructed
-- from the new wrappers. Only the temporary function names change.
-- Released reference: 20260822041743_branch_scope_domain_enforcement.sql
CREATE FUNCTION pg_temp.original_can_access_branch(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_branches AS branch
        ON branch.organization_id = member.organization_id
       AND branch.id = p_branch_id
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'super_admin'
    )
    OR (
      app_private.current_active_branch_id(p_organization_id) = p_branch_id
      AND EXISTS (
        SELECT 1
        FROM public.organization_branches AS branch
        WHERE branch.organization_id = p_organization_id
          AND branch.id = p_branch_id
          AND branch.status = 'active'
          AND branch.archived_at IS NULL
      )
    );
$$;

-- Released reference: 20260822071638_remaining_branch_scope_domain_enforcement.sql
CREATE FUNCTION pg_temp.original_document_required_permission(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_timeline_event_id uuid,
  p_ledger_entry_id uuid,
  p_task_id uuid,
  p_tenant_request_id uuid,
  p_operation text
)
RETURNS public.organization_permission_key
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_ledger_entry_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND event.ledger_entry_id IS NOT NULL
      )
    THEN CASE WHEN p_operation='read' THEN 'finance.view'::public.organization_permission_key
      ELSE 'finance.correct_records'::public.organization_permission_key END
    WHEN p_task_id IS NOT NULL OR p_tenant_request_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND event.event_type IN ('Maintenance','Repair','Renovation','Inspection')
      )
    THEN CASE WHEN p_operation='read' THEN 'maintenance.view'::public.organization_permission_key
      ELSE 'maintenance.create_assign'::public.organization_permission_key END
    WHEN p_lease_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND (event.lease_id IS NOT NULL OR event.event_type IN (
            'Lease Started','Lease Ended','Tenant Move In','Tenant Move Out','Rent Increase'
          ))
      )
    THEN CASE
      WHEN p_operation='read' THEN 'leases.view'::public.organization_permission_key
      WHEN p_operation='archive' THEN 'leases.archive'::public.organization_permission_key
      ELSE 'leases.change_terms'::public.organization_permission_key
    END
    ELSE CASE
      WHEN p_operation='read' THEN 'properties.view'::public.organization_permission_key
      WHEN p_operation='archive' THEN 'properties.archive'::public.organization_permission_key
      ELSE 'properties.write'::public.organization_permission_key
    END
  END;
$$;

CREATE TEMP TABLE document_plan_state AS SELECT gen_random_uuid() org,gen_random_uuid() other_org,
  gen_random_uuid() admin,gen_random_uuid() reader_a,gen_random_uuid() reader_b,gen_random_uuid() outsider,
  gen_random_uuid() branch_a,gen_random_uuid() branch_b,gen_random_uuid() inactive_branch,gen_random_uuid() archived_branch,
  gen_random_uuid() foreign_branch,gen_random_uuid() missing_branch,gen_random_uuid() role_id,gen_random_uuid() property_id,
  gen_random_uuid() ledger_id,gen_random_uuid() financial_event,gen_random_uuid() maintenance_event,gen_random_uuid() lease_event,gen_random_uuid() property_event;
INSERT INTO auth.users(id,email) SELECT id,id||'@document-plan.invalid' FROM document_plan_state s,
  LATERAL unnest(ARRAY[s.admin,s.reader_a,s.reader_b,s.outsider]) id;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Document plan test','document-plan-'||org FROM document_plan_state
  UNION ALL SELECT other_org,'Other document plan','document-plan-'||other_org FROM document_plan_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status,archived_at)
  SELECT branch_a,org,'A','A','active',NULL::timestamptz FROM document_plan_state UNION ALL
  SELECT branch_b,org,'B','B','active',NULL FROM document_plan_state UNION ALL
  SELECT inactive_branch,org,'Inactive','INACTIVE','inactive',NULL FROM document_plan_state UNION ALL
  SELECT archived_branch,org,'Archived','ARCHIVED','active',now() FROM document_plan_state UNION ALL
  SELECT foreign_branch,other_org,'Foreign','FOREIGN','active',NULL FROM document_plan_state;
INSERT INTO public.organization_roles(id,organization_id,name,status) SELECT role_id,org,'Scoped test reader','active' FROM document_plan_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) SELECT org,role_id,'properties.view' FROM document_plan_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
  SELECT org,admin,'super_admin',NULL,NULL FROM document_plan_state UNION ALL
  SELECT org,reader_a,'custom',branch_a,role_id FROM document_plan_state UNION ALL
  SELECT org,reader_b,'custom',branch_b,role_id FROM document_plan_state UNION ALL
  SELECT other_org,outsider,'super_admin',NULL,NULL FROM document_plan_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM document_plan_state);
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure)
  SELECT property_id,org,branch_a,'PLAN','Plan property','apartment','multi_unit' FROM document_plan_state;
ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.ledger_entries DISABLE TRIGGER USER;
INSERT INTO public.ledger_entries(id,organization_id,property_id,transaction_date,direction,category,amount,currency)
  SELECT ledger_id,org,property_id,'2026-10-01','income','Rent',1,'USD' FROM document_plan_state;
ALTER TABLE public.ledger_entries ENABLE TRIGGER USER;
ALTER TABLE public.timeline_events DISABLE TRIGGER USER;
INSERT INTO public.timeline_events(id,organization_id,property_id,ledger_entry_id,event_date,event_type,title)
  SELECT financial_event,org,property_id,ledger_id,date '2026-10-01','General Note'::public.timeline_event_type,'Financial' FROM document_plan_state UNION ALL
  SELECT maintenance_event,org,property_id,NULL,'2026-10-01','Repair','Maintenance' FROM document_plan_state UNION ALL
  SELECT lease_event,org,property_id,NULL,'2026-10-01','Lease Started','Lease' FROM document_plan_state UNION ALL
  SELECT property_event,org,property_id,NULL,'2026-10-01','General Note','Property' FROM document_plan_state;
ALTER TABLE public.timeline_events ENABLE TRIGGER USER;

CREATE TEMP TABLE document_plan_branches AS SELECT organization_id,branch_id FROM document_plan_state s,
  LATERAL unnest(ARRAY[s.org,s.other_org,NULL::uuid]) organization_id,
  LATERAL unnest(ARRAY[s.branch_a,s.branch_b,s.inactive_branch,s.archived_branch,s.foreign_branch,s.missing_branch,NULL::uuid]) branch_id;
CREATE FUNCTION pg_temp.document_plan_compare_branches(p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.document_plan_ok(bool_and(
    app_private.can_access_branch(organization_id,branch_id) IS NOT DISTINCT FROM
    pg_temp.original_can_access_branch(organization_id,branch_id)),p_label) FROM pg_temp.document_plan_branches;
$$;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM document_plan_state),true);
SELECT pg_temp.document_plan_compare_branches('super admin branch decisions equal released SQL across 21 scopes');
SELECT pg_temp.document_plan_ok(app_private.can_access_branch((SELECT org FROM document_plan_state),(SELECT archived_branch FROM document_plan_state)),'super admin retains existing archived-branch authority');
SELECT set_config('request.jwt.claim.sub',(SELECT reader_a::text FROM document_plan_state),true);
SELECT pg_temp.document_plan_compare_branches('branch A decisions equal released SQL across 21 scopes');
SELECT pg_temp.document_plan_ok(app_private.can_access_branch((SELECT org FROM document_plan_state),(SELECT branch_a FROM document_plan_state)) AND NOT app_private.can_access_branch((SELECT org FROM document_plan_state),(SELECT branch_b FROM document_plan_state)),'ordinary caller sees only assigned branch');
SELECT set_config('request.jwt.claim.sub',(SELECT reader_b::text FROM document_plan_state),true);
SELECT pg_temp.document_plan_compare_branches('branch B decisions equal released SQL across 21 scopes');
SELECT set_config('request.jwt.claim.sub',(SELECT outsider::text FROM document_plan_state),true);
SELECT pg_temp.document_plan_compare_branches('foreign member decisions equal released SQL including NULL results');
SELECT pg_temp.document_plan_ok(app_private.can_access_branch((SELECT org FROM document_plan_state),(SELECT branch_a FROM document_plan_state)) IS NULL,'unresolved branch preserves SQL NULL rather than widening authority');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.document_plan_compare_branches('anonymous decisions equal released SQL across 21 scopes');
SELECT set_config('request.jwt.claim.sub',(SELECT reader_a::text FROM document_plan_state),true);
UPDATE public.organization_authorization_states SET ordinary_access_enabled=false WHERE organization_id=(SELECT org FROM document_plan_state);
SELECT pg_temp.document_plan_compare_branches('disabled ordinary authority equals released SQL in the same session');
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM document_plan_state);
DELETE FROM public.organization_members WHERE custom_role_id=(SELECT role_id FROM document_plan_state);
UPDATE public.organization_roles SET status='archived',archived_at=now() WHERE id=(SELECT role_id FROM document_plan_state);
SELECT pg_temp.document_plan_compare_branches('membership removal and role archival immediately affect cached-plan decisions');

CREATE TEMP TABLE document_permission_cases AS
SELECT 'empty'::text name,NULL::uuid property_id,NULL::uuid unit_id,NULL::uuid lease_id,NULL::uuid event_id,NULL::uuid ledger_id,NULL::uuid task_id,NULL::uuid request_id
UNION ALL SELECT 'property',property_id,NULL,NULL,NULL,NULL,NULL,NULL FROM document_plan_state
UNION ALL SELECT 'unit',NULL,gen_random_uuid(),NULL,NULL,NULL,NULL,NULL
UNION ALL SELECT 'lease',NULL,NULL,gen_random_uuid(),NULL,NULL,NULL,NULL
UNION ALL SELECT 'ledger',NULL,NULL,NULL,NULL,gen_random_uuid(),NULL,NULL
UNION ALL SELECT 'task',NULL,NULL,NULL,NULL,NULL,gen_random_uuid(),NULL
UNION ALL SELECT 'request',NULL,NULL,NULL,NULL,NULL,NULL,gen_random_uuid()
UNION ALL SELECT 'all links',property_id,gen_random_uuid(),gen_random_uuid(),maintenance_event,ledger_id,gen_random_uuid(),gen_random_uuid() FROM document_plan_state
UNION ALL SELECT 'financial event',NULL,NULL,NULL,financial_event,NULL,NULL,NULL FROM document_plan_state
UNION ALL SELECT 'maintenance event',NULL,NULL,NULL,maintenance_event,NULL,NULL,NULL FROM document_plan_state
UNION ALL SELECT 'lease event',NULL,NULL,NULL,lease_event,NULL,NULL,NULL FROM document_plan_state
UNION ALL SELECT 'property event',NULL,NULL,NULL,property_event,NULL,NULL,NULL FROM document_plan_state
UNION ALL SELECT 'missing event',NULL,NULL,NULL,gen_random_uuid(),NULL,NULL,NULL;
SELECT pg_temp.document_plan_ok(bool_and(
  app_private.document_required_permission(org_id,c.property_id,c.unit_id,c.lease_id,c.event_id,c.ledger_id,c.task_id,c.request_id,operation)
  IS NOT DISTINCT FROM pg_temp.original_document_required_permission(org_id,c.property_id,c.unit_id,c.lease_id,c.event_id,c.ledger_id,c.task_id,c.request_id,operation)),
  '195 document domain/operation/organization combinations equal released SQL')
  FROM document_permission_cases c CROSS JOIN document_plan_state s,
  LATERAL unnest(ARRAY[s.org,s.other_org,NULL::uuid]) org_id,
  LATERAL unnest(ARRAY['read','archive','write','unknown',NULL]) operation;
SELECT pg_temp.document_plan_ok(app_private.document_required_permission((SELECT org FROM document_plan_state),NULL,NULL,NULL,NULL,(SELECT ledger_id FROM document_plan_state),gen_random_uuid(),NULL,'read')='finance.view','finance link keeps precedence over maintenance link');
SELECT pg_temp.document_plan_ok(app_private.document_required_permission((SELECT org FROM document_plan_state),NULL,NULL,NULL,(SELECT maintenance_event FROM document_plan_state),NULL,NULL,NULL,'read')='maintenance.view','timeline maintenance provenance keeps its required permission');
SELECT pg_temp.document_plan_ok(NOT has_function_privilege('anon','app_private.can_access_branch(uuid,uuid)','EXECUTE') AND has_function_privilege('authenticated','app_private.can_access_branch(uuid,uuid)','EXECUTE'),'branch helper execute ACL remains authenticated-only');
SELECT pg_temp.document_plan_ok(NOT has_function_privilege('authenticated','app_private.document_required_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','app_private.document_required_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE'),'internal document classifier retains its non-public ACL');
SELECT pg_temp.document_plan_ok(bool_and(prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=""'] AND pg_get_userbyid(proowner)='postgres' AND l.lanname='plpgsql'),
  'both wrappers retain owner stable definer and fixed search path')
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid IN (
    'app_private.can_access_branch(uuid,uuid)'::regprocedure,
    'app_private.document_required_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure);
SELECT '1..'||n FROM document_plan_assertions;
ROLLBACK;
