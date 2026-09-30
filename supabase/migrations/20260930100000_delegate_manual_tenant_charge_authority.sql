DO $$
DECLARE
  v_definition text;
  v_old_guard text;
  v_new_guard text;
BEGIN
  v_definition := pg_get_functiondef(
    'app_private.create_manual_tenant_charge_before_category_connection(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure
  );
  v_old_guard := 'IF auth.uid() IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN';
  v_new_guard := $guard$IF auth.uid() IS NULL OR NOT (
    app_private.is_org_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.leases AS authority_lease
      WHERE authority_lease.organization_id = p_organization_id
        AND authority_lease.id = p_lease_id
        AND app_private.can_access_property(
          p_organization_id,
          authority_lease.property_id,
          'finance.record_payments'
        )
    )
  ) THEN$guard$;
  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Manual tenant charge category authority guard was not found';
  END IF;
  EXECUTE replace(v_definition, v_old_guard, v_new_guard);

  v_definition := pg_get_functiondef(
    'app_private.create_manual_tenant_charge_before_month_lock(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure
  );
  v_old_guard := 'IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN';
  v_new_guard := $guard$IF v_actor_id IS NULL OR NOT (
    app_private.is_org_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.leases AS authority_lease
      WHERE authority_lease.organization_id = p_organization_id
        AND authority_lease.id = p_lease_id
        AND app_private.can_access_property(
          p_organization_id,
          authority_lease.property_id,
          'finance.record_payments'
        )
    )
  ) THEN$guard$;
  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Manual tenant charge write authority guard was not found';
  END IF;
  EXECUTE replace(v_definition, v_old_guard, v_new_guard);
END;
$$;

COMMENT ON FUNCTION app_private.create_manual_tenant_charge_before_category_connection(
  uuid, uuid, text, date, date, numeric, text, text
) IS 'Checks month locks for manual tenant charges and permits organization admins or property-scoped finance.record_payments delegates.';

COMMENT ON FUNCTION app_private.create_manual_tenant_charge_before_month_lock(
  uuid, uuid, text, date, date, numeric, text, text
) IS 'Creates audited tenant invoice, income, and line records for organization admins or property-scoped finance.record_payments delegates.';
