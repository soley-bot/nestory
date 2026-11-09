-- Use the same database-backed permission authority as the Operations pages.
-- Cost history remains branch-scoped, and executors see only assigned tasks.
CREATE OR REPLACE FUNCTION public.get_maintenance_cost_status_history(
  p_organization_id uuid,
  p_task_ids uuid[]
) RETURNS TABLE(
  task_id uuid,
  submission_id uuid,
  status text,
  review_reason text,
  submitted_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_is_admin boolean := app_private.is_super_admin(p_organization_id);
  v_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
  v_person_id uuid := app_private.current_org_person_id(p_organization_id);
  v_can_coordinate boolean :=
    app_private.has_org_permission(p_organization_id, 'maintenance.create_assign')
    OR app_private.has_org_permission(p_organization_id, 'maintenance.review');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT coalesce(v_is_admin OR
    app_private.has_org_permission(p_organization_id, 'maintenance.view'), false)
    OR (NOT v_is_admin AND v_branch_id IS NULL) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF coalesce(pg_catalog.cardinality(p_task_ids), 0) = 0 THEN RETURN; END IF;
  IF pg_catalog.cardinality(p_task_ids) > 1000 THEN
    RAISE EXCEPTION 'Maintenance cost status query is limited to 1000 tasks'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT submission.source_id, submission.id, submission.status,
    submission.review_reason, submission.submitted_at
  FROM public.expense_submissions AS submission
  JOIN public.tasks AS task
    ON task.organization_id = submission.organization_id
   AND task.id = submission.source_id
  JOIN public.properties AS property
    ON property.organization_id = task.organization_id
   AND property.id = task.property_id
  WHERE submission.organization_id = p_organization_id
    AND submission.source_type = 'maintenance_task'
    AND submission.source_id = ANY(p_task_ids)
    AND (v_is_admin OR (
      task.branch_id = v_branch_id
      AND property.branch_id = v_branch_id
      AND (v_can_coordinate OR task.assignee_person_id = v_person_id)
    ))
  ORDER BY submission.source_id, submission.submitted_at DESC, submission.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_cost_status_history(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maintenance_cost_status_history(uuid, uuid[]) TO authenticated;
