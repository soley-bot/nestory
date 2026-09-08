-- Supports only the pinned original 148 shape or the complete compatibility
-- shape installed atomically by the authorized, unreleased 139 amendment.
-- Never restore the former role-before-account adapter at this boundary.
DO $compatibility_guard$
DECLARE
  v_original oid := to_regprocedure('public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)');
  v_core oid := to_regprocedure('app_private.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)');
  v_function record;
  v_expected record;
BEGIN
  IF v_core IS NULL THEN
    IF v_original IS NULL OR encode(extensions.digest(pg_get_functiondef(v_original),'sha256'),'hex')
      IS DISTINCT FROM '0ac627eebbe787cfb2349275e8dd2449ea2d4721468ec3aba72e5f22859a376a'
      OR to_regprocedure('app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text)') IS NOT NULL
    THEN
      RAISE EXCEPTION 'Unknown original legacy deposit shape; compatibility migration refused';
    END IF;
    ALTER FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
      RENAME TO record_lease_deposit_event_legacy_checked_core;
    ALTER FUNCTION public.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)
      SET SCHEMA app_private;
    REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)
      FROM PUBLIC,anon,authenticated,service_role;
  ELSE
    -- The complete predecessor must match exact known bodies (normalizing only
    -- CRLF source line endings), function metadata, owner and effective ACLs.
    FOR v_expected IN
      SELECT * FROM (VALUES
        ('public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)', $expected_body_0$
  SELECT app_private.record_lease_deposit_event_legacy_adapter(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
$expected_body_0$, 'sql', false, ARRAY['p_organization_id','p_lease_deposit_id','p_event_type','p_event_date','p_amount','p_reference']::text[]),
        ('public.record_lease_deposit_event_with_account(uuid,uuid,uuid,text,date,numeric,text)', $expected_body_1$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id=deposit.organization_id AND lease.id=deposit.lease_id
  WHERE deposit.organization_id=p_organization_id AND deposit.id=p_lease_deposit_id
    AND deposit.archived_at IS NULL AND lease.archived_at IS NULL;
  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id,v_property_id,'leases.change_terms'::public.organization_permission_key
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_account_id:=app_private.resolve_chart_deposit_liability(
    p_organization_id,p_liability_account_id,v_property_id
  );
  v_event_id:=app_private.record_lease_deposit_event_legacy_checked_core(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
  UPDATE public.lease_deposit_events SET liability_account_id=v_account_id
  WHERE organization_id=p_organization_id AND id=v_event_id;
  RETURN v_event_id;
END;
$expected_body_1$, 'plpgsql', true, ARRAY['p_organization_id','p_lease_deposit_id','p_liability_account_id','p_event_type','p_event_date','p_amount','p_reference']::text[]),
        ('app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text)', $expected_body_2$
DECLARE
  v_property_id uuid;
  v_account_id uuid;
  v_locked_account_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id
    AND deposit.archived_at IS NULL
    AND lease.archived_at IS NULL;

  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id, v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT role.account_id INTO v_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits';

  -- This checked resolver obtains SHARE on the account and validates its
  -- organization, active status, liability class/subtype and deposit capability.
  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id, v_account_id, v_property_id
  );

  SELECT role.account_id INTO v_locked_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits'
  FOR SHARE;

  IF NOT FOUND OR v_locked_account_id IS DISTINCT FROM v_account_id THEN
    RAISE EXCEPTION 'Security deposit default changed. Retry the deposit recording.'
      USING ERRCODE = '40001';
  END IF;

  -- Both authority rows are now stable. Preserve the checked event writer,
  -- month lock, held-balance checks, Ledger projection and liability lineage.
  RETURN public.record_lease_deposit_event_with_account(
    p_organization_id, p_lease_deposit_id, v_account_id,
    p_event_type, p_event_date, p_amount, p_reference
  );
END;
$expected_body_2$, 'plpgsql', true, ARRAY['p_organization_id','p_lease_deposit_id','p_event_type','p_event_date','p_amount','p_reference']::text[])
      ) AS known(signature, body, language_name, security_definer, argument_names)
    LOOP
      SELECT procedure.*, language.lanname INTO v_function
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_language AS language ON language.oid = procedure.prolang
      WHERE procedure.oid = to_regprocedure(v_expected.signature);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Missing compatibility function: %', v_expected.signature;
      END IF;
      IF replace(v_function.prosrc,E'\r\n',E'\n') IS DISTINCT FROM replace(v_expected.body,E'\r\n',E'\n')
        OR v_function.lanname IS DISTINCT FROM v_expected.language_name
        OR v_function.prosecdef IS DISTINCT FROM v_expected.security_definer
        OR v_function.proargnames IS DISTINCT FROM v_expected.argument_names
        OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
        OR v_function.proowner IS DISTINCT FROM 'postgres'::regrole
        OR v_function.prorettype IS DISTINCT FROM 'uuid'::regtype
        OR v_function.prokind <> 'f' OR v_function.proretset
        OR v_function.provolatile <> 'v' OR v_function.proparallel <> 'u'
        OR v_function.proleakproof OR v_function.pronargdefaults <> 0
        OR NOT has_function_privilege('authenticated',v_function.oid,'EXECUTE')
        OR has_function_privilege('anon',v_function.oid,'EXECUTE')
        OR has_function_privilege('service_role',v_function.oid,'EXECUTE')
        OR EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(coalesce(
            v_function.proacl,pg_catalog.acldefault('f',v_function.proowner)
          )) AS privilege
          WHERE privilege.grantee NOT IN (v_function.proowner,'authenticated'::regrole)
            OR privilege.privilege_type <> 'EXECUTE'
            OR (privilege.grantee = 'authenticated'::regrole AND privilege.is_grantable)
        )
      THEN
        RAISE EXCEPTION 'Unknown compatibility body or ACL: %', v_expected.signature;
      END IF;
    END LOOP;
  END IF;

  v_core := to_regprocedure('app_private.record_lease_deposit_event_legacy_checked_core(uuid,uuid,text,date,numeric,text)');
  IF v_core IS NULL OR encode(extensions.digest(pg_get_functiondef(v_core),'sha256'),'hex')
      IS DISTINCT FROM '49124fcc688a38e4febf8999b7289f5e1faf9c33e90cc79ca9b31ca9cec48387'
    OR (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=v_core)
      IS DISTINCT FROM 'postgres'::regrole
    OR has_function_privilege('authenticated',v_core,'EXECUTE')
    OR has_function_privilege('anon',v_core,'EXECUTE')
    OR has_function_privilege('service_role',v_core,'EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure,
        LATERAL pg_catalog.aclexplode(coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege
      WHERE procedure.oid = v_core AND
        (procedure.proowner <> 'postgres'::regrole OR privilege.grantee <> procedure.proowner)
    )
  THEN
    RAISE EXCEPTION 'Unknown checked deposit core or ACL; compatibility migration refused';
  END IF;
END;
$compatibility_guard$;

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event_with_account(
  p_organization_id uuid,p_lease_deposit_id uuid,p_liability_account_id uuid,
  p_event_type text,p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account_id uuid; v_event_id uuid; v_property_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id=deposit.organization_id AND lease.id=deposit.lease_id
  WHERE deposit.organization_id=p_organization_id AND deposit.id=p_lease_deposit_id
    AND deposit.archived_at IS NULL AND lease.archived_at IS NULL;
  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id,v_property_id,'leases.change_terms'::public.organization_permission_key
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_account_id:=app_private.resolve_chart_deposit_liability(
    p_organization_id,p_liability_account_id,v_property_id
  );
  v_event_id:=app_private.record_lease_deposit_event_legacy_checked_core(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
  UPDATE public.lease_deposit_events SET liability_account_id=v_account_id
  WHERE organization_id=p_organization_id AND id=v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.record_lease_deposit_event_legacy_adapter(
  p_organization_id uuid,
  p_lease_deposit_id uuid,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
  v_account_id uuid;
  v_locked_account_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.lease_deposits AS deposit
  JOIN public.leases AS lease
    ON lease.organization_id = deposit.organization_id
   AND lease.id = deposit.lease_id
  WHERE deposit.organization_id = p_organization_id
    AND deposit.id = p_lease_deposit_id
    AND deposit.archived_at IS NULL
    AND lease.archived_at IS NULL;

  IF v_property_id IS NULL OR NOT app_private.can_access_property(
    p_organization_id, v_property_id,
    'leases.change_terms'::public.organization_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT role.account_id INTO v_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits';

  -- This checked resolver obtains SHARE on the account and validates its
  -- organization, active status, liability class/subtype and deposit capability.
  v_account_id := app_private.resolve_chart_deposit_liability(
    p_organization_id, v_account_id, v_property_id
  );

  SELECT role.account_id INTO v_locked_account_id
  FROM public.finance_account_roles AS role
  WHERE role.organization_id = p_organization_id
    AND role.role_code = 'security_deposits'
  FOR SHARE;

  IF NOT FOUND OR v_locked_account_id IS DISTINCT FROM v_account_id THEN
    RAISE EXCEPTION 'Security deposit default changed. Retry the deposit recording.'
      USING ERRCODE = '40001';
  END IF;

  -- Both authority rows are now stable. Preserve the checked event writer,
  -- month lock, held-balance checks, Ledger projection and liability lineage.
  RETURN public.record_lease_deposit_event_with_account(
    p_organization_id, p_lease_deposit_id, v_account_id,
    p_event_type, p_event_date, p_amount, p_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_lease_deposit_event(
  p_organization_id uuid,p_lease_deposit_id uuid,p_event_type text,
  p_event_date date,p_amount numeric,p_reference text
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.record_lease_deposit_event_legacy_adapter(
    p_organization_id,p_lease_deposit_id,p_event_type,p_event_date,p_amount,p_reference
  );
$$;
REVOKE ALL ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(uuid,uuid,text,date,numeric,text) TO authenticated;
COMMENT ON FUNCTION public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)
 IS 'Checked rolling-deploy compatibility adapter: resolves the organization security-deposit default and preserves Chart liability, property, month and cash authority.';
