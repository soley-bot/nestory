-- Event writers already require READ COMMITTED through the financial lifecycle
-- fence. Serialize on the deposit without manufacturing another row version:
-- updating it twice in one transaction can recheck its lease foreign key and
-- wait on a lifecycle command holding the lease before its financial-month lock.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.lock_lease_deposit_event_chronology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_organization_id uuid;
  v_old_deposit_id uuid;
  v_new_organization_id uuid;
  v_new_deposit_id uuid;
  v_scope record;
BEGIN
  -- A row lock alone cannot refresh a fixed transaction snapshot. Reject it
  -- explicitly before taking the lock, including for privileged direct writes.
  PERFORM app_private.assert_financial_lifecycle_isolation();

  IF TG_OP <> 'INSERT' THEN
    v_old_organization_id := OLD.organization_id;
    v_old_deposit_id := OLD.lease_deposit_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_organization_id := NEW.organization_id;
    v_new_deposit_id := NEW.lease_deposit_id;
  END IF;

  -- Match the checked commands' deposit lock, with stable ordering for both
  -- scopes of a privileged reassignment. The deferred signed-prefix validator
  -- sees committed predecessors after this lock is acquired at READ COMMITTED.
  FOR v_scope IN
    SELECT DISTINCT scope.organization_id, scope.deposit_id
    FROM (VALUES
      (v_old_organization_id, v_old_deposit_id),
      (v_new_organization_id, v_new_deposit_id)
    ) AS scope(organization_id, deposit_id)
    WHERE scope.organization_id IS NOT NULL AND scope.deposit_id IS NOT NULL
    ORDER BY scope.organization_id, scope.deposit_id
  LOOP
    PERFORM 1
    FROM public.lease_deposits AS deposit
    WHERE deposit.organization_id = v_scope.organization_id
      AND deposit.id = v_scope.deposit_id
    FOR UPDATE;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_lease_deposit_event_chronology() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_lease_deposit_event_chronology()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
