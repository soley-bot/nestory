BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Use existing disposable baseline rows so this test transaction has not
-- already acquired their month/owner locks while creating a fixture. Every
-- mutation below is rolled back, including the exact reset/restore journals.
CREATE TEMP TABLE legacy_lock_fixture AS
WITH allocation AS (
 SELECT 'public.owner_charge_cash_allocations'::text AS relation_name,to_jsonb(a) AS original,
  a.organization_id,a.property_id,i.owner_person_id,i.currency,a.allocation_date AS effective_date
 FROM public.owner_charge_cash_allocations a JOIN public.owner_invoice_lines l
  ON l.organization_id=a.organization_id AND l.id=a.owner_invoice_line_id
 JOIN public.owner_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
 WHERE a.reversal_of_id IS NULL AND i.owner_person_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.owner_charge_cash_allocations reversal WHERE reversal.reversal_of_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM public.expense_customer_adjustments adjustment WHERE adjustment.organization_id=l.organization_id
   AND adjustment.responsibility_id=l.source_id AND adjustment.responsibility='owner')
 ORDER BY a.id LIMIT 1
), adjustment AS (
 SELECT 'public.expense_customer_adjustments'::text AS relation_name,to_jsonb(a) AS original,
  a.organization_id,a.property_id,i.owner_person_id,i.currency,a.adjustment_date AS effective_date
 FROM public.expense_customer_adjustments a JOIN public.owner_invoices i
  ON i.organization_id=a.organization_id AND i.id=a.owner_invoice_id
 WHERE a.responsibility='owner' AND i.owner_person_id IS NOT NULL ORDER BY a.id LIMIT 1
)
SELECT row_number() OVER(ORDER BY relation_name)::integer AS fixture_no,*,
 hashtextextended(concat_ws(':','financial_month_v1',organization_id,date_trunc('month',effective_date)::date),0) AS month_key,
 hashtextextended(concat_ws(':','owner_balance_lifecycle_v1',organization_id,property_id,owner_person_id,currency),0) AS owner_key
FROM (SELECT * FROM allocation UNION ALL SELECT * FROM adjustment) rows;
SELECT is((SELECT count(*) FROM legacy_lock_fixture),2::bigint,'baseline supplies both exact legacy owner effect shapes');

CREATE FUNCTION pg_temp.legacy_lock_held(p_key bigint) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted AND mode='ExclusiveLock'
  AND classid::bigint=((p_key>>32)&4294967295) AND objid::bigint=(p_key&4294967295) AND objsubid=1)
$$;
CREATE FUNCTION pg_temp.legacy_lock_probe(p_fixture integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; v_reset uuid:=extensions.gen_random_uuid(); v_restore uuid:=extensions.gen_random_uuid();
 v_delete uuid:=extensions.gen_random_uuid(); v_insert uuid:=extensions.gen_random_uuid(); v_pk jsonb;
 v_expected jsonb; v_archive text; v_actions jsonb; v_binding jsonb; v_result jsonb:='{}'; v_after jsonb;
BEGIN
 SELECT * INTO STRICT r FROM legacy_lock_fixture WHERE fixture_no=p_fixture;
 v_pk:=app_private.financial_reset_primary_key(to_regclass(r.relation_name)::oid,r.original);
 v_expected:=CASE WHEN r.original ? 'financial_generation' THEN jsonb_set(r.original,'{financial_generation}','2'::jsonb) ELSE r.original END;
 v_archive:=app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name',r.relation_name,'primary_key',v_pk,'row_sha256',app_private.financial_reset_hash(r.original))));
 v_result:=jsonb_build_object('initialLocksAbsent',NOT pg_temp.legacy_lock_held(r.month_key) AND NOT pg_temp.legacy_lock_held(r.owner_key));
 -- The exception subtransaction rolls back this complete probe, including its
 -- acquired locks. Local result variables retain the observed proof values.
 BEGIN
  INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
  VALUES(r.organization_id,1,'frozen','2026-10-01')
  ON CONFLICT(organization_id) DO UPDATE SET generation=1,status='frozen',financial_start_date='2026-10-01';
  BEGIN
   PERFORM app_private.lock_owner_balance_mutation(r.organization_id,r.property_id,r.owner_person_id,r.currency,r.effective_date);
   v_result:=v_result||'{"ordinaryFrozenDenied":false}';
  EXCEPTION WHEN SQLSTATE '55000' THEN
   v_result:=v_result||jsonb_build_object('ordinaryFrozenDenied',SQLERRM='financial_writes_frozen');
  END;
  v_actions:=jsonb_build_array(jsonb_build_object('action_id',v_delete,'ordinal',1,'relation_name',r.relation_name,
   'primary_key',v_pk,'kind','archive-delete','before_row_text',r.original::text,'before_sha256',app_private.financial_reset_hash(r.original),
   'after_row_text',NULL,'after_sha256',NULL));
  v_binding:=jsonb_build_object('operation_id',v_reset,'organization_id',r.organization_id,'operation_kind','reset','restore_of',NULL,
   'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
   'archive_count',1,'archive_sha256',v_archive,'action_count',1,'action_sha256',app_private.financial_reset_hash(jsonb_build_array((v_actions->0)-ARRAY['before_row_text','after_row_text'])),
   'audit_timestamp',now(),'audit_actor',NULL);
  PERFORM app_private.prepare_financial_reset_operation(v_binding);
  PERFORM app_private.archive_financial_reset_rows(v_reset,jsonb_build_array(jsonb_build_object('relation_name',r.relation_name,
   'primary_key',v_pk,'row_text',r.original::text,'row_sha256',app_private.financial_reset_hash(r.original))));
  PERFORM app_private.prepare_financial_reset_actions(v_reset,v_actions);
  PERFORM app_private.seal_financial_reset_operation(v_reset);
  PERFORM app_private.start_financial_reset_actions(v_reset);
  PERFORM app_private.arm_financial_reset_action(v_reset,v_delete);
  EXECUTE format('DELETE FROM %s t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2',to_regclass(r.relation_name)) USING to_regclass(r.relation_name)::oid,v_pk;
  PERFORM app_private.complete_financial_reset_actions(v_reset);
  BEGIN
   EXECUTE format('INSERT INTO %s SELECT x.* FROM jsonb_populate_record(NULL::%s,$1) x',to_regclass(r.relation_name),to_regclass(r.relation_name)) USING r.original;
   v_result:=v_result||'{"ownerWithoutCapabilityDenied":false}';
  EXCEPTION WHEN SQLSTATE '55000' THEN
   v_result:=v_result||jsonb_build_object('ownerWithoutCapabilityDenied',SQLERRM='financial_writes_frozen');
  END;
  UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id=r.organization_id;
  v_actions:=jsonb_build_array(jsonb_build_object('action_id',v_insert,'ordinal',1,'relation_name',r.relation_name,
   'primary_key',v_pk,'kind','restore','before_row_text',NULL,'before_sha256',NULL,
   'after_row_text',v_expected::text,'after_sha256',app_private.financial_reset_hash(v_expected)));
  v_binding:=v_binding||jsonb_build_object('operation_id',v_restore,'operation_kind','restore','restore_of',v_reset,'source_generation',1,'target_generation',2,
   'action_sha256',app_private.financial_reset_hash(jsonb_build_array((v_actions->0)-ARRAY['before_row_text','after_row_text'])));
  PERFORM app_private.prepare_financial_reset_operation(v_binding);
  PERFORM app_private.prepare_financial_reset_actions(v_restore,v_actions);
  PERFORM app_private.seal_financial_reset_operation(v_restore);
  PERFORM app_private.start_financial_reset_actions(v_restore);
  PERFORM app_private.arm_financial_reset_action(v_restore,v_insert);
  BEGIN
   EXECUTE format('INSERT INTO %s SELECT x.* FROM jsonb_populate_record(NULL::%s,$1) x',to_regclass(r.relation_name),to_regclass(r.relation_name))
   USING v_expected||jsonb_build_object('id',extensions.gen_random_uuid());
   v_result:=v_result||'{"otherRowDenied":false}';
  EXCEPTION WHEN SQLSTATE '23514' THEN
   v_result:=v_result||jsonb_build_object('otherRowDenied',SQLERRM='financial_reset_exact_row_action_mismatch');
  END;
  BEGIN
   EXECUTE format('INSERT INTO %s SELECT x.* FROM jsonb_populate_record(NULL::%s,$1) x',to_regclass(r.relation_name),to_regclass(r.relation_name))
   USING v_expected||jsonb_build_object('property_id',extensions.gen_random_uuid());
   v_result:=v_result||'{"wrongScopeDenied":false}';
  EXCEPTION WHEN SQLSTATE '23514' THEN
   v_result:=v_result||jsonb_build_object('wrongScopeDenied',SQLERRM='financial_reset_exact_row_action_mismatch');
  END;
  v_result:=v_result||jsonb_build_object('locksAbsentBeforeReplay',NOT pg_temp.legacy_lock_held(r.month_key) AND NOT pg_temp.legacy_lock_held(r.owner_key));
  EXECUTE format('INSERT INTO %s SELECT x.* FROM jsonb_populate_record(NULL::%s,$1) x',to_regclass(r.relation_name),to_regclass(r.relation_name)) USING v_expected;
  v_result:=v_result||jsonb_build_object('monthLockHeld',pg_temp.legacy_lock_held(r.month_key),'ownerLockHeld',pg_temp.legacy_lock_held(r.owner_key),
   'capabilityConsumed',NOT EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=v_restore));
  PERFORM app_private.complete_financial_reset_actions(v_restore);
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2',to_regclass(r.relation_name)) INTO v_after USING to_regclass(r.relation_name)::oid,v_pk;
  v_result:=v_result||jsonb_build_object('fullStoredImageMatches',app_private.financial_reset_hash(v_after)=app_private.financial_reset_hash(v_expected));
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'rollback_completed_lock_probe' USING ERRCODE='PZ001';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
 END;
 RETURN v_result||jsonb_build_object('locksReleasedAfterRollback',NOT pg_temp.legacy_lock_held(r.month_key) AND NOT pg_temp.legacy_lock_held(r.owner_key));
END;
$$;
CREATE TEMP TABLE legacy_lock_results AS SELECT fixture_no,relation_name,pg_temp.legacy_lock_probe(fixture_no) AS proof FROM legacy_lock_fixture;
SELECT ok((proof->>'initialLocksAbsent')::boolean,relation_name||': test does not inherit fixture locks') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'ordinaryFrozenDenied')::boolean,relation_name||': ordinary month/owner helper remains frozen') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'ownerWithoutCapabilityDenied')::boolean,relation_name||': postgres without capability remains frozen') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'otherRowDenied')::boolean AND (proof->>'wrongScopeDenied')::boolean,relation_name||': exact capability rejects another row or property') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'locksAbsentBeforeReplay')::boolean,relation_name||': no month or owner lock before exact replay') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'monthLockHeld')::boolean AND (proof->>'ownerLockHeld')::boolean,relation_name||': exact replay acquires both unchanged advisory keys') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'capabilityConsumed')::boolean AND (proof->>'fullStoredImageMatches')::boolean,relation_name||': full archived row restored and one-use capability consumed') FROM legacy_lock_results ORDER BY fixture_no;
SELECT ok((proof->>'locksReleasedAfterRollback')::boolean,relation_name||': rollback releases both acquired locks') FROM legacy_lock_results ORDER BY fixture_no;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.owner_charge_cash_allocations DEFAULT VALUES$$,'42501','permission denied for table owner_charge_cash_allocations','ordinary role gains no direct allocation insertion grant');
SELECT throws_ok($$INSERT INTO public.expense_customer_adjustments DEFAULT VALUES$$,'42501','permission denied for table expense_customer_adjustments','ordinary role gains no direct adjustment insertion grant');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
