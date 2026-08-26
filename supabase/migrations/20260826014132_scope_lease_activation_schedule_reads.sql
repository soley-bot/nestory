DROP POLICY IF EXISTS "Organization members can read Lease activation schedules"
  ON public.lease_activation_schedules;

CREATE POLICY lease_activation_schedules_branch_select
  ON public.lease_activation_schedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leases AS visible_lease
      WHERE visible_lease.organization_id = lease_activation_schedules.organization_id
        AND visible_lease.id = lease_activation_schedules.lease_id
        AND (
          app_private.can_access_property(
            visible_lease.organization_id,
            visible_lease.property_id,
            'leases.view'::public.organization_permission_key
          )
          OR app_private.can_read_finance_property(
            visible_lease.organization_id,
            visible_lease.property_id
          )
        )
    )
  );

COMMENT ON POLICY lease_activation_schedules_branch_select
  ON public.lease_activation_schedules
  IS 'Lease activation schedules are readable only when the caller can read the referenced Lease through its Property scope.';
