-- Display only the labels attached to tasks the caller can already read.
-- Property/People directory permissions and assignment authority stay separate.
CREATE FUNCTION app_private.maintenance_task_labels(
  p_organization_id uuid, p_task_ids uuid[]
)
RETURNS TABLE(task_id uuid, property_label text, assignee_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.cardinality(p_task_ids) > 1000 THEN
    RAISE EXCEPTION 'Maintenance label query is limited to 1000 tasks'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT task.id, property.code || ' - ' || property.name, assignee.display_name
  FROM public.tasks AS task
  JOIN public.properties AS property
    ON property.organization_id = task.organization_id
   AND property.id = task.property_id
  LEFT JOIN public.people AS assignee
    ON assignee.organization_id = task.organization_id
   AND assignee.id = task.assignee_person_id
  WHERE task.organization_id = p_organization_id
    AND task.id = ANY(p_task_ids)
    AND app_private.can_read_maintenance_task(task.organization_id, task.id)
  ORDER BY task.id;
END;
$$;

CREATE FUNCTION public.get_maintenance_task_labels(
  p_organization_id uuid, p_task_ids uuid[]
)
RETURNS TABLE(task_id uuid, property_label text, assignee_label text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT * FROM app_private.maintenance_task_labels(p_organization_id, p_task_ids);
$$;

REVOKE ALL ON FUNCTION app_private.maintenance_task_labels(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_maintenance_task_labels(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.maintenance_task_labels(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_task_labels(uuid, uuid[]) TO authenticated;
