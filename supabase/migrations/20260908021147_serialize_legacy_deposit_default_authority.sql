-- The released deposit signature resolves a default account. Match Chart
-- retirement's account-before-role lock order so a default replacement cannot
-- deadlock recording. The unlocked lookup is only a candidate: after locking
-- its checked account, lock and recheck the role before any financial write.
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

REVOKE ALL ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(
  uuid,uuid,text,date,numeric,text
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.record_lease_deposit_event_legacy_adapter(
  uuid,uuid,text,date,numeric,text
) TO authenticated;
