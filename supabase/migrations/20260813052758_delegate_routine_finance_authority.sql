-- Routine Finance work must not queue behind workspace governance. Finance
-- Members prepare owner authority; Finance Managers independently review it,
-- configure recurring rent, close reconciled months, and publish statements.
-- Super Admin retains access governance and exceptional reopen/reversal paths.

CREATE OR REPLACE FUNCTION app_private.can_configure_leases(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

ALTER FUNCTION app_private.can_configure_leases(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.can_configure_leases(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_configure_leases(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_review_owner_opening_balance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_close_owner_month(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_publish_owner_statement(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_publish_owner_statement_as_actor(
  p_organization_id uuid,
  p_actor_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.role IN ('super_admin', 'finance_manager')
      AND membership.branch_id IS NULL
      AND membership.person_id IS NULL
  );
$$;

ALTER FUNCTION app_private.can_review_owner_opening_balance(uuid)
  OWNER TO postgres;
ALTER FUNCTION app_private.can_close_owner_month(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_publish_owner_statement(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_publish_owner_statement_as_actor(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.can_review_owner_opening_balance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_close_owner_month(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_publish_owner_statement(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_publish_owner_statement_as_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.can_create_owner_statement_artifact(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager'),
    false
  );
$$;

ALTER FUNCTION app_private.can_create_owner_statement_artifact(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.can_create_owner_statement_artifact(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_create_owner_statement_artifact(uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Super Admin can create owner statement artifacts"
  ON storage.objects;
DROP POLICY IF EXISTS "Finance Manager or Super Admin can create owner statement artifacts"
  ON storage.objects;
CREATE POLICY "Finance Manager or Super Admin can create owner statement artifacts"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'owner-statements'
    AND app_private.can_create_owner_statement_artifact(
      app_private.storage_object_org_id(name)
    )
  );

DO $delegate_lease_configuration$
DECLARE
  v_count integer := 0;
  v_definition text;
  v_replacement text;
  v_routine oid;
BEGIN
  FOR v_routine IN
    SELECT procedure.oid
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'approve_rent_policy_version',
        'archive_lease',
        'create_lease_with_relationships',
        'create_rent_policy_draft',
        'record_current_lease_occupancy_evidence',
        'record_lease_deposit_event',
        'restore_lease',
        'reverse_lease_deposit_event',
        'schedule_authoritative_lease_term',
        'set_lease_billing_term',
        'update_lease_with_authoritative_term',
        'update_rent_policy_draft'
      ])
  LOOP
    v_count := v_count + 1;
    v_definition := pg_catalog.pg_get_functiondef(v_routine);
    v_replacement := pg_catalog.replace(
      v_definition,
      'app_private.is_org_admin(p_organization_id)',
      'app_private.can_configure_leases(p_organization_id)'
    );

    IF v_replacement = v_definition THEN
      RAISE EXCEPTION 'lease_configuration_authority_anchor_changed: %',
        v_routine::regprocedure;
    END IF;

    EXECUTE v_replacement;
  END LOOP;

  IF v_count <> 12 THEN
    RAISE EXCEPTION
      'lease_configuration_authority_function_count_changed: expected 12, found %',
      v_count;
  END IF;
END;
$delegate_lease_configuration$;

COMMENT ON FUNCTION app_private.can_configure_leases(uuid) IS
  'Allows Super Admin and Finance Manager to maintain checked lease, billing, deposit, occupancy, and rent-policy authority.';
COMMENT ON FUNCTION app_private.can_review_owner_opening_balance(uuid) IS
  'Allows Super Admin or Finance Manager to independently review Finance Member opening submissions.';
COMMENT ON FUNCTION app_private.can_close_owner_month(uuid) IS
  'Allows Super Admin or Finance Manager to close a reconciled owner month; reopen remains Super Admin-only.';
COMMENT ON FUNCTION app_private.can_publish_owner_statement(uuid) IS
  'Allows Super Admin or Finance Manager to publish a closed owner statement through the checked artifact workflow.';
COMMENT ON FUNCTION app_private.can_create_owner_statement_artifact(uuid) IS
  'Storage RLS predicate allowing Super Admin or Finance Manager to create canonical owner-statement artifacts; deletion and exceptional recovery remain separately restricted.';
