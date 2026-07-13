REVOKE ALL ON FUNCTION public.execute_assigned_maintenance_task(
  uuid, uuid, text, text, boolean, text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_assigned_maintenance_task(
  uuid, uuid, text, text, boolean, text
)
TO authenticated;

REVOKE ALL ON FUNCTION public.review_maintenance_task_completion(
  uuid, uuid, text, text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_maintenance_task_completion(
  uuid, uuid, text, text
)
TO authenticated;
