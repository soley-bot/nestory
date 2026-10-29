-- Preserve every permission expression, owner, volatility, search path and ACL.
-- SQL-language SECURITY DEFINER helpers repeatedly prepare nested queries for
-- each protected row. A PL/pgSQL scalar RETURN caches the same query plan.
-- Each released predecessor is pinned before replacing its implementation;
-- callers, RLS policies and all authorization predicates remain unchanged.
-- Full original/new function and RLS differential tests accompany this change.
DO $guard$
DECLARE predecessor record; previous_search_path text := pg_catalog.current_setting('search_path');
BEGIN
  -- pg_get_functiondef qualifies argument/result types using the active path.
  PERFORM pg_catalog.set_config('search_path', '', true);
  FOR predecessor IN SELECT * FROM (VALUES
    ('app_private.can_access_property(uuid,uuid,public.organization_permission_key)', 'e5290b64f0400d682547f1257a2a6ff751a7e2889adbe0ed50c6aad72eedf7f4'),
    ('app_private.current_active_branch_id(uuid)', '35ad393db1ddbc5ec88e75f2fd4e1f2aace5fb51b406e6eac9d0f89125f59eaf'),
    ('app_private.current_workspace_role(uuid)', '64655fe523c72a9fd769b42783b9130c95e4d819c0242447b0e183469261d4ea'),
    ('app_private.has_org_permission(uuid,public.organization_permission_key)', '57f148d42a59923dae55a78c1168c21d1bedf9bf5492a5ba5eac9128ff4166ad'),
    ('app_private.is_org_admin(uuid)', 'f72ceff8f2c6cade04fd419e5b69edd38053b70983b1cfcdac90001a8bd59416'),
    ('app_private.is_super_admin(uuid)', '488bb5dc8355c43170d3dc96b779dc705ad097405d0390b6cdfaa500a5218089'),
    ('app_private.property_branch_id(uuid,uuid)', '9630cb2e4714e35b26d3e115e07bb4e8c816f64d294b8713e63c0e364560ad1f')
  ) AS expected(signature, sha256)
  LOOP
    IF pg_catalog.encode(extensions.digest(
      pg_catalog.replace(pg_catalog.pg_get_functiondef(predecessor.signature::regprocedure), E'\r\n', E'\n'),
      'sha256'), 'hex') IS DISTINCT FROM predecessor.sha256 THEN
      RAISE EXCEPTION 'permission_query_plan_predecessor_changed: %', predecessor.signature;
    END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('search_path', previous_search_path, true);
END;
$guard$;

CREATE OR REPLACE FUNCTION app_private.can_access_property(p_organization_id uuid, p_property_id uuid, p_permission_key public.organization_permission_key)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR (
      p_property_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.properties AS property
        WHERE property.organization_id=p_organization_id
          AND property.id=p_property_id
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
        )
        OR app_private.current_active_branch_id(p_organization_id)
          =app_private.property_branch_id(p_organization_id,p_property_id)
      )
      AND app_private.has_org_permission(
        p_organization_id,p_permission_key
      )
    ),
    false
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.current_active_branch_id(p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT member.branch_id
  FROM public.organization_members AS member
  JOIN public.organization_authorization_states AS authorization_state
    ON authorization_state.organization_id = member.organization_id
   AND authorization_state.ordinary_access_enabled
  JOIN public.organization_branches AS branch
    ON branch.organization_id = member.organization_id
   AND branch.id = member.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  JOIN public.organization_roles AS role_record
    ON role_record.organization_id = member.organization_id
   AND role_record.id = member.custom_role_id
   AND role_record.status = 'active'
   AND role_record.archived_at IS NULL
  WHERE member.organization_id = p_organization_id
    AND member.user_id = (SELECT auth.uid())
    AND member.role = 'custom'
    AND member.branch_id IS NOT NULL
    AND member.custom_role_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_role_permissions AS permission_record
      WHERE permission_record.organization_id = role_record.organization_id
        AND permission_record.role_id = role_record.id
    )
  LIMIT 1);
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.current_workspace_role(target_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT membership.role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = (SELECT auth.uid())
    AND (
      (
        membership.role IN ('super_admin', 'finance_manager', 'finance_member')
        AND membership.branch_id IS NULL
        AND membership.person_id IS NULL
      )
      OR (
        membership.role IN ('operations_manager', 'operations_member')
        AND membership.branch_id IS NOT NULL
        AND membership.person_id IS NOT NULL
      )
    )
  LIMIT 1);
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.has_org_permission(p_organization_id uuid, p_permission_key public.organization_permission_key)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT
    app_private.is_super_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND authorization_state.ordinary_access_enabled
      JOIN public.organization_branches AS branch
        ON branch.organization_id=member.organization_id
       AND branch.id=member.branch_id
       AND branch.status='active'
       AND branch.archived_at IS NULL
      JOIN public.organization_roles AS role_record
        ON role_record.organization_id=member.organization_id
       AND role_record.id=member.custom_role_id
       AND role_record.status='active'
       AND role_record.archived_at IS NULL
      JOIN public.organization_role_permissions AS permission_record
        ON permission_record.organization_id=role_record.organization_id
       AND permission_record.role_id=role_record.id
       AND permission_record.permission_key=p_permission_key
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role='custom'
        AND member.branch_id IS NOT NULL
        AND member.custom_role_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND NOT authorization_state.ordinary_access_enabled
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role IN (
          'finance_manager','finance_member',
          'operations_manager','operations_member'
        )
        AND app_private.legacy_role_has_permission(
          member.role,p_permission_key
        )
    ));
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.is_org_admin(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT app_private.is_super_admin(target_organization_id));
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.is_super_admin(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.property_branch_id(p_organization_id uuid, p_property_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT property.branch_id
  FROM public.properties AS property
  JOIN public.organization_branches AS branch
    ON branch.organization_id = property.organization_id
   AND branch.id = property.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
  LIMIT 1);
END;
$function$;
