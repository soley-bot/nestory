CREATE OR REPLACE FUNCTION public.get_finance_submission_actor_labels(
  p_organization_id uuid,
  p_user_ids uuid[]
)
RETURNS TABLE (
  user_id uuid,
  label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Finance access is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    membership.user_id,
    coalesce(
      nullif(btrim(account.email::text), ''),
      initcap(replace(membership.role, '_', ' '))
    ) AS label
  FROM public.organization_members AS membership
  JOIN auth.users AS account
    ON account.id = membership.user_id
  JOIN public.expense_submissions AS submission
    ON submission.organization_id = membership.organization_id
   AND submission.submitted_by = membership.user_id
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = ANY(coalesce(p_user_ids, ARRAY[]::uuid[]))
  ORDER BY membership.user_id;
END;
$$;

ALTER FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  OWNER TO postgres;

COMMENT ON FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  IS 'Returns operator-safe labels only for requested organization members who submitted paid costs and only to Finance-readable workspaces.';

REVOKE ALL ON FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  FROM anon;
REVOKE ALL ON FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_submission_actor_labels(uuid, uuid[])
  TO authenticated;
