-- The two existing scalar SELECTs are unchanged. Cache their query plans inside
-- PL/pgSQL instead of repeatedly preparing nested permission reads per document.
-- Same-session synthetic profiling identified these helpers, not the outer
-- can_access_document wrapper, as the remaining planning cost. Authorization,
-- volatility, owner, search path and grants are retained.
DO $guard$
DECLARE predecessor record; previous_search_path text := pg_catalog.current_setting('search_path');
BEGIN
  PERFORM pg_catalog.set_config('search_path','',true);
  FOR predecessor IN SELECT * FROM (VALUES
    ('app_private.document_required_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)',
     'dba56ecb4f51236911c9aa341ed5b67032a85a6924c8d3b3c28f47c91721af38'),
    ('app_private.can_access_branch(uuid,uuid)',
     'aa6c07db25cf178a42cbd0afb9efe88e1411f00f4e920e616f4e732811d0a89f')
  ) AS expected(signature,sha256)
  LOOP
    IF pg_catalog.encode(extensions.digest(
      pg_catalog.replace(pg_catalog.pg_get_functiondef(predecessor.signature::regprocedure),E'\r\n',E'\n'),
      'sha256'),'hex') IS DISTINCT FROM predecessor.sha256 THEN
      RAISE EXCEPTION 'document_permission_plan_predecessor_changed: %',predecessor.signature;
    END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('search_path',previous_search_path,true);
END;
$guard$;

CREATE OR REPLACE FUNCTION app_private.document_required_permission(p_organization_id uuid, p_property_id uuid, p_unit_id uuid, p_lease_id uuid, p_timeline_event_id uuid, p_ledger_entry_id uuid, p_task_id uuid, p_tenant_request_id uuid, p_operation text)
 RETURNS public.organization_permission_key
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT CASE
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
  END);
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.can_access_branch(p_organization_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT
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
    ));
END;
$function$;
