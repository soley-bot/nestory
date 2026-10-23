-- Exact recovery gates for contracts created by the checked reset phase.
-- Normal overlap, availability, permission and source-revision guards remain.
BEGIN;
DO $integration$
DECLARE r record; v_definition text; v_hash text; v_position integer; v_relation regclass;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('app_private.enforce_lease_unit_term_availability()','b9de87e7eea40ffbce9efab8e6745b738c5067fa383a1aec8ef3774b311ac43d'),
  ('app_private.enforce_privileged_email_step_up_on_organization_mutation()','1e520b36b68923ee8bfa4c40c48ea88a7042e56a528dd368988537589b627c8f'),
  ('app_private.guard_same_month_billing_override_write()','9521057d6d19d45ec9a96f8379a20585d7626888ef0df1d189bb21108859c534'),
  ('app_private.catch_up_lease_rent()','5cbeb69bb9ccb89749fad0d3889897e77887ca90ac3977d3576909c5ede641d2'),
  ('app_private.advance_financial_report_source_revision()','7548ecc849c42fb4677a2f64af6cd9658dbdc3724b3f20a64182e3b9c6978ad0'),
  ('public.set_updated_at()','5ec9030de2f6f2283999a99439b9ed23abe39ba3aee6a53ac27806c3a4e1c2ee'),
  ('app_private.create_default_lease_billing_rules()','3e81959805ecd1b7c2272237fcfd25ebda8de382b88bfae170c4e65459f9097a'),
  ('app_private.guard_same_month_lease_term_write()','d3425932935bde14a0c75166e6e0f0e967fc9653162718ab9d1bfd4922bfe6b9'),
  ('app_private.guard_preserved_write_row()','b17fdea36124d8e545985d09ea35e14e9d2539e2dcb484aacb2d1595fb15939e')
 ) pins(signature,sha256) LOOP
  IF encode(extensions.digest(replace(pg_get_functiondef(r.signature::regprocedure),E'\r\n',E'\n'),'sha256'),'hex')<>r.sha256 THEN
   RAISE EXCEPTION 'financial_reset_contract_predecessor_changed: %',r.signature;
  END IF;
 END LOOP;
 FOR r IN SELECT * FROM (VALUES
  ('public.lease_terms','db720775db07f9c69c0bd3db6727e02adacb2fd0b9bed8ccaac343ba9f661a1c',9),
  ('public.lease_billing_terms','f3da1809e6c1ceb4c0208cba19453038c17a69670816524d1b427af7361ce1d0',6)
 ) pins(relation,sha256,trigger_count) LOOP
  v_relation:=r.relation::regclass;
  SELECT encode(extensions.digest(coalesce(string_agg(t.tgname::text||chr(31)||t.tgenabled::text||chr(31)||replace(pg_get_triggerdef(t.oid),E'\r\n',E'\n'),E'\n' ORDER BY t.tgname COLLATE "C"),''),'sha256'),'hex') INTO v_hash
  FROM pg_trigger t WHERE t.tgrelid=v_relation AND NOT t.tgisinternal;
  IF v_hash<>r.sha256 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=v_relation AND NOT tgisinternal)<>r.trigger_count THEN
   RAISE EXCEPTION 'financial_reset_contract_trigger_layout_changed: %',r.relation;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=v_relation AND NOT tgisinternal
   AND ((tgtype&2<>0 AND tgname COLLATE "C"<='000_financial_reset_row_action') OR (tgtype&2=0 AND NOT tgdeferrable AND tgname COLLATE "C">='zzzz_financial_reset_row_action_complete'))) THEN
   RAISE EXCEPTION 'financial_reset_contract_trigger_order_unproven';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_relation_rules WHERE relation_name=r.relation AND pg_catalog.to_regclass(relation_name)=v_relation AND NOT archive_remove AND NOT restore_allowed AND cardinality(normalize_columns)=0) THEN
   RAISE EXCEPTION 'financial_reset_contract_recovery_rule_required';
  END IF;
 END LOOP;
 v_definition:=replace(pg_get_functiondef('app_private.catch_up_lease_rent()'::regprocedure),E'\r\n',E'\n');
 v_position:=strpos(v_definition,E'\nBEGIN');
 IF v_position=0 THEN RAISE EXCEPTION 'financial_reset_contract_catch_up_body_unrecognized'; END IF;
 v_definition:=overlay(v_definition placing E'\nBEGIN\n  -- Exact recovery of the archived predecessor must not create fresh rent.\n  IF TG_RELID=''public.lease_terms''::regclass AND TG_OP=''UPDATE'' THEN\n    IF app_private.financial_reset_action_allowed(TG_RELID,TG_OP,to_jsonb(OLD),to_jsonb(NEW)) THEN\n      RETURN NEW;\n    END IF;\n  END IF;' from v_position for length(E'\nBEGIN'));
 EXECUTE v_definition;
 FOREACH v_relation IN ARRAY ARRAY['public.lease_terms'::regclass,'public.lease_billing_terms'::regclass] LOOP
  EXECUTE format('CREATE TRIGGER "000_financial_reset_row_action" BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.begin_financial_reset_row_action()',v_relation);
  EXECUTE format('CREATE TRIGGER zzzz_financial_reset_row_action_complete AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.finish_financial_reset_row_action()',v_relation);
 END LOOP;
END;
$integration$;
COMMIT;
