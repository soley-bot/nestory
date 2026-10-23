BEGIN;
-- The branch authority migration removed direct write policies and installed
-- checked property assertions, but left these six commands as invokers. Keep
-- SELECT-only table RLS and private helper ACLs; execute only the already
-- authorized command bodies with the same boundary used by other commands.
DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_permission text;
  v_row text;
  v_locked_checks text;
  v_anchor text := E'    WHERE id = old_task.unit_id\n      AND organization_id = p_organization_id\n      AND archived_at IS NULL';
BEGIN
  -- A unit can move after a task is archived. Revalidate its property when the
  -- task is restored, rather than relying on a formerly RLS-filtered lookup.
  v_signature := 'public.restore_maintenance_task(uuid,uuid)'::regprocedure;
  v_definition := replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n');
  IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected maintenance restore unit-scope predecessor';
  END IF;
  EXECUTE replace(v_definition,v_anchor,
    E'    WHERE id = old_task.unit_id\n      AND organization_id = p_organization_id\n      AND property_id = old_task.property_id\n      AND archived_at IS NULL');

  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_timeline_event(uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure,
    'public.update_timeline_event(uuid,uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure,
    'public.archive_timeline_event(uuid,uuid)'::regprocedure,
    'public.restore_timeline_event(uuid,uuid)'::regprocedure,
    'public.archive_maintenance_task(uuid,uuid)'::regprocedure,
    'public.restore_maintenance_task(uuid,uuid)'::regprocedure
  ] LOOP
    v_definition := replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n');
    IF strpos(v_definition,'IF (SELECT auth.uid()) IS NULL THEN')=0
      OR strpos(v_definition,'app_private.assert_property_permission(')=0
      OR strpos(v_definition,'INSERT INTO public.activity_logs')=0 THEN
      RAISE EXCEPTION 'Unexpected checked operational command predecessor: %',v_signature;
    END IF;
    IF v_signature <> 'public.create_timeline_event(uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure THEN
      v_row := CASE WHEN v_signature::text LIKE '%maintenance_task%' THEN 'old_task' ELSE 'old_event' END;
      v_permission := CASE WHEN v_row='old_task' THEN 'maintenance.create_assign'
        WHEN v_signature::text LIKE '%update_timeline_event%' THEN 'properties.write'
        ELSE 'properties.archive' END;
      v_anchor := E'  IF NOT FOUND THEN\n    RAISE EXCEPTION ' || quote_literal(
        CASE WHEN v_row='old_task' THEN 'Maintenance task not found' ELSE 'Timeline event not found' END)
        || E' USING ERRCODE = ''23503'';\n  END IF;';
      IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 THEN
        RAISE EXCEPTION 'Unexpected locked operational source predecessor: %',v_signature;
      END IF;
      -- The source may have moved while FOR UPDATE waited. Check the locked
      -- row's property, not only the earlier statement's source snapshot.
      v_locked_checks := format(
        E'\n\n  PERFORM app_private.assert_property_permission(p_organization_id,%s.property_id,%L);',v_row,v_permission);
      IF v_signature='public.update_timeline_event(uuid,uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure THEN
        v_locked_checks := v_locked_checks || E'\n  PERFORM app_private.assert_property_permission(p_organization_id,p_property_id,''properties.write'');';
      END IF;
      v_definition := replace(v_definition,v_anchor,v_anchor || v_locked_checks);
      EXECUTE v_definition;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',v_signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L',v_signature,'');
    -- ALTER preserves the existing authenticated-only EXECUTE ACL. Never grant
    -- helper access or table writes as a substitute for the checked command.
  END LOOP;
END;
$migration$;
COMMIT;
