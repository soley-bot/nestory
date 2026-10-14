ALTER FUNCTION public.archive_maintenance_task(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.archive_maintenance_task(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.restore_maintenance_task(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.restore_maintenance_task(uuid, uuid) SET search_path = '';
