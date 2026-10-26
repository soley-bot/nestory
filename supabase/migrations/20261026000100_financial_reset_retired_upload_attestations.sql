-- Retain upload/consumption evidence exactly while retiring its generation.
-- No financial source, actor, Storage object, or attestation row is changed here.
BEGIN;

DROP TRIGGER financial_reset_rules_immutable ON app_private.financial_reset_relation_rules;
INSERT INTO app_private.financial_reset_relation_rules
 (relation_name,archive_remove,normalize_columns,generated_columns,restore_allowed)
VALUES
 ('app_private.tenant_commercial_document_upload_attestations',false,'{}','{}',false);

-- The existing expense predecessor cycle may stage only this nullable pointer.
-- Keep its deletion/restoration/generated-column rules exactly as installed.
DO $expense_rule$
DECLARE v_changed integer;
BEGIN
 UPDATE app_private.financial_reset_relation_rules
 SET normalize_columns=ARRAY['replaces_transaction_id']
 WHERE relation_name='public.expense_transactions'
  AND archive_remove AND normalize_columns='{}'::text[];
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>1 THEN RAISE EXCEPTION 'financial_expense_reset_rule_predecessor_changed'; END IF;
END;
$expense_rule$;

CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE
 ON app_private.financial_reset_relation_rules
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

-- The row trigger covers writes, but consumed same-input replay returns before
-- a write. Check the locked existing row before either replay or mutation.
-- Replace only this body fragment so every authorization, input, object and
-- conflict check remains, along with the function's owner and existing ACL.
DO $attestation_retirement$
DECLARE
 v_signature regprocedure :=
  'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)'::regprocedure;
 v_definition text;
 v_body text;
 v_anchor text := E'  IF FOUND AND v_attestation.consumed_at IS NOT NULL THEN';
 v_guard text := E'  IF FOUND AND NOT app_private.financial_row_is_current(\n    p_organization_id,v_attestation.financial_generation) THEN\n    RAISE EXCEPTION ''financial_intent_retired'' USING ERRCODE=''55000'';\n  END IF;\n\n';
BEGIN
 SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'),
        pg_catalog.replace(p.prosrc,E'\r\n',E'\n')
 INTO STRICT v_definition,v_body
 FROM pg_catalog.pg_proc p WHERE p.oid=v_signature;
 IF pg_catalog.length(v_body)-pg_catalog.length(pg_catalog.replace(v_body,v_anchor,''))<>pg_catalog.length(v_anchor)
  OR pg_catalog.strpos(v_body,'app_private.assert_financial_write_allowed(p_organization_id)')=0
  OR pg_catalog.strpos(v_body,'app_private.can_attest_tenant_commercial_document_source_as_actor(')=0
  OR pg_catalog.strpos(v_body,'app_private.financial_row_is_current(')<>0
 THEN RAISE EXCEPTION 'financial_upload_attestation_predecessor_changed'; END IF;
 EXECUTE pg_catalog.replace(v_definition,v_body,pg_catalog.replace(v_body,v_anchor,v_guard||v_anchor));
END;
$attestation_retirement$;

COMMIT;
