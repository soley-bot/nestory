-- Retain the exact pre-reset journal and its slot. A fresh ordinary action may
-- replace only a proved retired, non-attempted slot after checked reopening has
-- committed. This migration performs no cutover, backfill or slot mutation.
BEGIN;

-- These relations may be archived, but never deleted, normalized or restored by
-- reset authority. The catalogue remains immutable outside this DDL transaction.
DROP TRIGGER financial_reset_rules_immutable ON app_private.financial_reset_relation_rules;
INSERT INTO app_private.financial_reset_relation_rules
 (relation_name,archive_remove,normalize_columns,generated_columns,restore_allowed)
VALUES
 ('app_private.deposit_rent_journal_intents',false,'{}','{}',false),
 ('app_private.deposit_rent_journal_slots',false,'{}','{}',false);
CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE
 ON app_private.financial_reset_relation_rules
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.deposit_rent_journal_slot_is_retired(
 p_record app_private.deposit_rent_journal_intents,p_authority jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_control app_private.financial_write_controls%ROWTYPE;
 v_slot app_private.deposit_rent_journal_slots%ROWTYPE;
 v_actual jsonb;
BEGIN
 -- Lock order matches prepare: lifecycle, slot, then immutable intent. A freeze
 -- cannot overtake this proof or the checked preparation which follows it.
 PERFORM app_private.assert_financial_lifecycle_isolation();
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
  'financial_write_lifecycle_v1:'||p_record.organization_id::text,0));
 SELECT * INTO v_control FROM app_private.financial_write_controls
  WHERE organization_id=p_record.organization_id;
 IF NOT FOUND OR p_record.financial_generation>=v_control.generation THEN RETURN false; END IF;
 PERFORM app_private.assert_financial_write_allowed(p_record.organization_id);
 IF p_record.state NOT IN ('preview','resolved','rejected')
  OR p_record.actor_id IS DISTINCT FROM auth.uid()
  OR p_record.actor_id IS DISTINCT FROM (p_authority->>'actor')::uuid
  OR p_record.property_id IS DISTINCT FROM (p_authority->>'property')::uuid
  OR p_record.unit_id IS DISTINCT FROM (p_authority->>'unit')::uuid
  OR (p_record.payload->>'leaseId')::uuid IS DISTINCT FROM p_record.lease_id
  OR p_record.payload_hash IS DISTINCT FROM app_private.deposit_rent_journal_payload_hash(p_record.payload)
 THEN RETURN false; END IF;
 SELECT * INTO v_slot FROM app_private.deposit_rent_journal_slots
  WHERE organization_id=p_record.organization_id AND actor_id=p_record.actor_id
   AND lease_id=p_record.lease_id FOR UPDATE;
 IF NOT FOUND OR v_slot.current_token IS DISTINCT FROM p_record.token THEN RETURN false; END IF;
 SELECT to_jsonb(i) INTO v_actual FROM app_private.deposit_rent_journal_intents i
  WHERE i.token=p_record.token FOR UPDATE;
 IF v_actual IS DISTINCT FROM to_jsonb(p_record) THEN RETURN false; END IF;

 -- Older generation alone proves no retirement decision. Both complete source
 -- rows must be in the same sealed archive, tied to its finished reset and to
 -- the current checked reset checkpoint and committed reopening.
 -- No original deposit or invoice parent is required to survive the reset.
 RETURN EXISTS(
  SELECT 1
  FROM app_private.financial_reset_operations original
  JOIN app_private.financial_reset_archive_rows intent
   ON intent.operation_id=original.operation_id AND intent.organization_id=original.organization_id
   AND intent.relation_name='app_private.deposit_rent_journal_intents'
   AND intent.relation_oid='app_private.deposit_rent_journal_intents'::regclass
   AND intent.primary_key=jsonb_build_object('token',p_record.token)
   AND intent.row_json=to_jsonb(p_record)
   AND intent.row_sha256=app_private.financial_reset_hash(to_jsonb(p_record))
  JOIN app_private.financial_reset_archive_rows slot
   ON slot.operation_id=original.operation_id AND slot.organization_id=original.organization_id
   AND slot.relation_name='app_private.deposit_rent_journal_slots'
   AND slot.relation_oid='app_private.deposit_rent_journal_slots'::regclass
   AND slot.primary_key=jsonb_build_object('organization_id',v_slot.organization_id,
    'actor_id',v_slot.actor_id,'lease_id',v_slot.lease_id)
   AND slot.row_json=to_jsonb(v_slot)
   AND slot.row_sha256=app_private.financial_reset_hash(to_jsonb(v_slot))
  JOIN app_private.financial_reset_verification_checkpoints checkpoint
   ON checkpoint.operation_id=original.operation_id
   AND checkpoint.organization_id=original.organization_id
   AND checkpoint.generation=v_control.generation
   AND checkpoint.checkpoint_kind='checked-reports'
  JOIN app_private.financial_reset_reopening_receipts reopening
   ON reopening.operation_id=original.operation_id
   AND reopening.organization_id=original.organization_id
   AND reopening.generation=v_control.generation
   AND reopening.cutoff=v_control.financial_start_date
   AND reopening.checkpoint_sha256=checkpoint.checkpoint_sha256
   AND reopening.transaction_id<>pg_catalog.pg_current_xact_id()
  WHERE original.organization_id=p_record.organization_id
   AND original.operation_kind='reset' AND original.status='actions_complete'
   AND original.source_generation=p_record.financial_generation
   AND original.target_generation=v_control.generation
   AND original.execution_xid<>pg_catalog.pg_current_xact_id()
   AND checkpoint.execution_xid<>pg_catalog.pg_current_xact_id()
   AND original.database_name=pg_catalog.current_database()
   AND original.database_oid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
 );
END;
$$;
REVOKE ALL ON FUNCTION app_private.deposit_rent_journal_slot_is_retired(
 app_private.deposit_rent_journal_intents,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Exact effective predecessors captured read-only from the validated schema.
-- Retain all existing candidate, authority, custody, date, amount, immutable
-- state and slot checks. Only the proved-retired old-parent lookup is skipped.
DO $journal_retirement$
DECLARE d text; b text; a text; replacement text;
BEGIN
 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO d,b
 FROM pg_proc WHERE oid='public.prepare_deposit_rent_journal(uuid,uuid,jsonb,text)'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'aa426f57871527144f82d9f12c0674119c31b6d57330d4e81e75b96b6df2ec2c' THEN
  RAISE EXCEPTION 'financial_journal_retirement_prepare_predecessor_changed';
 END IF;
 a:=E'    PERFORM app_private.deposit_rent_journal_parent_scope(previous,authority);\n    IF previous.state=''attempted'' THEN\n      PERFORM app_private.deposit_rent_journal_scope(previous,authority);\n      RAISE EXCEPTION ''Original attempt remains unconfirmed'' USING ERRCODE=''55000'';\n    END IF;';
 replacement:=E'    IF NOT app_private.deposit_rent_journal_slot_is_retired(previous,authority) THEN\n'||a||E'\n    END IF;';
 IF (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_journal_retirement_prepare_anchor_changed';
 END IF;
 EXECUTE replace(d,b,replace(b,a,replacement));

 SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n'),replace(prosrc,E'\r\n',E'\n') INTO d,b
 FROM pg_proc WHERE oid='public.get_deposit_rent_journal(uuid,uuid)'::regprocedure;
 IF encode(extensions.digest(b,'sha256'),'hex')<>'a46501a71982fb258ea99b898c8f2670b95e1b2c3a0ff3772a3d68f367459710' THEN
  RAISE EXCEPTION 'financial_journal_retirement_read_predecessor_changed';
 END IF;
 -- Acquire lifecycle before the reader's existing slot/intent locks. Current
 -- records keep their original authority and parent checks below unchanged.
 a:='  SELECT current_token INTO token_id FROM app_private.deposit_rent_journal_slots';
 replacement:=E'  IF app_private.financial_scope_is_frozen(p_org) THEN\n    RAISE EXCEPTION ''financial_writes_frozen'' USING ERRCODE=''55000'';\n  END IF;\n'||a;
 IF (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_journal_retirement_read_lock_anchor_changed';
 END IF;
 b:=replace(b,a,replacement);
 a:='  PERFORM app_private.deposit_rent_journal_parent_scope(r,authority);';
 IF (length(b)-length(replace(b,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_journal_retirement_read_anchor_changed';
 END IF;
 replacement:=E'  IF app_private.deposit_rent_journal_slot_is_retired(r,authority) THEN RETURN NULL; END IF;\n'||a;
 -- The source body in d is still the pinned predecessor.
 EXECUTE replace(d,(SELECT replace(prosrc,E'\r\n',E'\n') FROM pg_proc
  WHERE oid='public.get_deposit_rent_journal(uuid,uuid)'::regprocedure),replace(b,a,replacement));
END;
$journal_retirement$;

COMMIT;
