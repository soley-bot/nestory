-- Serialize tenant draft keys before chart/category locks; check collisions only
-- after the original RPC has authorized and evaluated its result. A conflict
-- raises within the same statement and rolls back all nested financial writes.
CREATE FUNCTION app_private.lock_tenant_expense_intent(p_org uuid,p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','submit_expense_transaction_v1',p_org,btrim(coalesce(p_key,''))),0));
END;
$$;
CREATE FUNCTION app_private.check_tenant_expense_intent_result(
  p_org uuid,p_key text,p_grouped boolean,p_responsibility text,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text:=btrim(coalesce(p_key,''));
BEGIN
  IF lower(btrim(coalesce(p_responsibility,'')))='tenant' AND (
    (p_grouped AND EXISTS(SELECT 1 FROM public.expense_submissions s
      WHERE s.organization_id=p_org AND s.idempotency_key=k))
    OR (NOT p_grouped AND EXISTS(SELECT 1 FROM public.expense_transactions t
      WHERE t.organization_id=p_org AND t.idempotency_key=k))) THEN
    RAISE EXCEPTION 'Conflicting tenant expense submission intent' USING ERRCODE='22023';
  END IF;
  RETURN p_result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.lock_tenant_expense_intent(uuid,text),
  app_private.check_tenant_expense_intent_result(uuid,text,boolean,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

-- Preserve all signatures, ACLs and existing authorization/accounting code.
-- Exact comparisons distinguish generated child keys without a prefix bypass.
-- Historical keys already used in both representations fail closed.
DO $patch$
DECLARE n text; d text; pos integer; guard text; grouped text;
BEGIN
  FOREACH n IN ARRAY ARRAY['submit_expense_with_accounts','submit_expense','submit_expense_transaction'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT d FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname=n;
    d:=replace(d,E'\r\n',E'\n');
    pos:=strpos(d,E'\nBEGIN\n');
    IF pos=0 OR d !~ 'RETURN [^;]+;' THEN
      RAISE EXCEPTION 'tenant_expense_intent_contract_changed: %',n;
    END IF;
    guard:=E'  IF lower(btrim(coalesce(p_responsibility, ''''))) = ''tenant'' THEN\n    PERFORM app_private.lock_tenant_expense_intent(p_organization_id,p_idempotency_key);\n  END IF;\n';
    d:=overlay(d PLACING E'\nBEGIN\n'||guard FROM pos FOR length(E'\nBEGIN\n'));
    grouped:=CASE WHEN n='submit_expense_transaction' THEN 'true' ELSE 'false' END;
    -- The final argument is evaluated before the private checker runs, including
    -- with_accounts' delegated submit call and all of its original guards.
    d:=regexp_replace(d,'RETURN ([^;]+);',
      'RETURN app_private.check_tenant_expense_intent_result(p_organization_id,p_idempotency_key,'||grouped||',p_responsibility,\1);','g');
    EXECUTE d;
  END LOOP;
END;
$patch$;
