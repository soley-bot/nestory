BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*) FROM pg_trigger t JOIN app_private.financial_reset_relation_rules r ON pg_catalog.to_regclass(r.relation_name)=t.tgrelid WHERE t.tgname='000_financial_reset_row_action' AND (r.archive_remove OR cardinality(r.normalize_columns)>0)),68::bigint,'every reset-removal or normalization relation has an exact-action entry gate');
SELECT is((SELECT count(*) FROM pg_trigger t JOIN app_private.financial_reset_relation_rules r ON pg_catalog.to_regclass(r.relation_name)=t.tgrelid WHERE t.tgname='zzzz_financial_reset_row_action_complete' AND (r.archive_remove OR cardinality(r.normalize_columns)>0)),68::bigint,'every reset-removal or normalization relation verifies and consumes its final stored image');
SELECT is((SELECT count(*) FROM pg_trigger gate JOIN pg_trigger other ON other.tgrelid=gate.tgrelid
 WHERE gate.tgname='000_financial_reset_row_action' AND NOT other.tgisinternal AND other.tgtype&2<>0
 AND other.tgname COLLATE "C"<gate.tgname COLLATE "C"),0::bigint,'entry gate runs before ordinary row mutators');
SELECT is((SELECT count(*) FROM pg_trigger completion JOIN pg_trigger other ON other.tgrelid=completion.tgrelid
 WHERE completion.tgname='zzzz_financial_reset_row_action_complete' AND NOT other.tgisinternal AND NOT other.tgdeferrable
 AND other.tgtype&2=0 AND other.tgname COLLATE "C">completion.tgname COLLATE "C"
 -- The later checkpoint/reopening seal checks the transaction after the action
 -- capability is consumed; it does not change the completed business row.
 AND NOT (other.tgname='zzzzz_financial_reset_checkpoint_seal'
  AND other.tgfoid='app_private.guard_financial_reset_checkpoint_row()'::regprocedure
  AND other.tgtype=29 AND other.tgenabled='O' AND other.tgconstraint=0)),0::bigint,
 'completion follows immediate business effects and source stamps; only the exact checkpoint seal follows it');
SELECT is((SELECT count(*) FROM pg_trigger completion
 WHERE completion.tgname='zzzz_financial_reset_row_action_complete'
 AND NOT EXISTS(SELECT 1 FROM pg_trigger seal WHERE seal.tgrelid=completion.tgrelid
  AND seal.tgname='zzzzz_financial_reset_checkpoint_seal'
  AND seal.tgfoid='app_private.guard_financial_reset_checkpoint_row()'::regprocedure
  AND seal.tgtype=29 AND seal.tgenabled='O' AND seal.tgconstraint=0
  AND NOT seal.tgisinternal AND NOT seal.tgdeferrable
  AND seal.tgname COLLATE "C">completion.tgname COLLATE "C")),0::bigint,
 'every action completion is followed by its enabled exact checkpoint seal');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_trigger t ON t.tgfoid=p.oid
 WHERE t.tgdeferrable AND p.prosrc LIKE '%Exact bound reset action:%'),'deferred conservation and completeness checks have no reset exemption');

INSERT INTO public.organizations(id,name,slug)
VALUES('fa231020-0000-4000-8000-000000000001','Exact reset guard fixture','reset-guard-test');
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
VALUES('fa231020-0000-4000-8000-000000000020','fa231020-0000-4000-8000-000000000001','Reset branch','RST','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('fa231020-0000-4000-8000-000000000002','fa231020-0000-4000-8000-000000000001','Reset property','RST','Apartment','fa231020-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title,cost_amount,cost_currency,created_at,updated_at)
VALUES('fa231020-0000-4000-8000-000000000030','fa231020-0000-4000-8000-000000000001','fa231020-0000-4000-8000-000000000002','2026-09-01','Inspection','Historical reset source',5,'USD','2001-01-01 00:00:00+00','2001-01-02 00:00:00+00');
CREATE TEMP TABLE reset_guard_images AS SELECT to_jsonb(event) AS original,
 to_jsonb(event)||'{"cost_amount":null,"cost_currency":null}'::jsonb AS normalized
FROM public.timeline_events event WHERE id='fa231020-0000-4000-8000-000000000030';
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa231020-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT throws_ok($$UPDATE public.timeline_events SET cost_amount=NULL,cost_currency=NULL WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 '55000','financial_writes_frozen','owner connection alone cannot normalize frozen financial history');
SELECT set_config('app.financial_reset_context','claimed-reset',true);
SELECT throws_ok($$UPDATE public.timeline_events SET cost_amount=NULL,cost_currency=NULL WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 '55000','financial_writes_frozen','caller-selected reset setting grants no authority');

-- Build the same public contract consumed by the private clone adapter. No
-- test-only capability, table grant, trigger disable or context override.
CREATE FUNCTION pg_temp.prepare_guard_probe(p_restore boolean) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
 v_op uuid:=CASE WHEN p_restore THEN 'fa231020-0000-4000-8000-000000000101' ELSE 'fa231020-0000-4000-8000-000000000100' END;
 v_action uuid:=CASE WHEN p_restore THEN 'fa231020-0000-4000-8000-000000000111' ELSE 'fa231020-0000-4000-8000-000000000110' END;
 v_original jsonb; v_before jsonb; v_after jsonb;
 v_pk jsonb:='{"id":"fa231020-0000-4000-8000-000000000030"}';
 v_kind text:=CASE WHEN p_restore THEN 'restore' ELSE 'normalization' END;
 v_archive_digest text; v_action_digest text;
BEGIN
 SELECT original,CASE WHEN p_restore THEN normalized ELSE original END,CASE WHEN p_restore THEN original ELSE normalized END
 INTO v_original,v_before,v_after FROM reset_guard_images;
 v_archive_digest:=app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object(
  'relation_name','public.timeline_events','primary_key',v_pk,'row_sha256',app_private.financial_reset_hash(v_original))));
 v_action_digest:=app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object(
  'action_id',v_action,'ordinal',1,'relation_name','public.timeline_events','primary_key',v_pk,'kind',v_kind,
  'before_sha256',app_private.financial_reset_hash(v_before),'after_sha256',app_private.financial_reset_hash(v_after))));
 PERFORM app_private.prepare_financial_reset_operation(jsonb_build_object(
  'operation_id',v_op,'organization_id','fa231020-0000-4000-8000-000000000001','operation_kind',CASE WHEN p_restore THEN 'restore' ELSE 'reset' END,
  'source_generation',CASE WHEN p_restore THEN 1 ELSE 0 END,'target_generation',CASE WHEN p_restore THEN 2 ELSE 1 END,
  'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
  'archive_sha256',v_archive_digest,'action_sha256',v_action_digest,'archive_count',1,'action_count',1,
  'audit_timestamp',now(),'audit_actor',NULL,'restore_of',CASE WHEN p_restore THEN 'fa231020-0000-4000-8000-000000000100'::uuid ELSE NULL END));
 IF NOT p_restore THEN
  PERFORM app_private.archive_financial_reset_rows(v_op,jsonb_build_array(jsonb_build_object(
   'relation_name','public.timeline_events','primary_key',v_pk,'row_text',v_original::text,'row_sha256',app_private.financial_reset_hash(v_original))));
 END IF;
 PERFORM app_private.prepare_financial_reset_actions(v_op,jsonb_build_array(jsonb_build_object(
  'action_id',v_action,'ordinal',1,'relation_name','public.timeline_events','primary_key',v_pk,'kind',v_kind,
  'before_row_text',v_before::text,'after_row_text',v_after::text,'before_sha256',app_private.financial_reset_hash(v_before),'after_sha256',app_private.financial_reset_hash(v_after))));
 PERFORM app_private.seal_financial_reset_operation(v_op);
 PERFORM app_private.start_financial_reset_actions(v_op);
 PERFORM app_private.arm_financial_reset_action(v_op,v_action);
 RETURN v_op;
END;
$$;
SELECT lives_ok($$SELECT pg_temp.prepare_guard_probe(false)$$,'sealed exact normalization can arm a frozen action');
SELECT throws_ok($$UPDATE public.timeline_events SET title='Unreviewed title',cost_amount=NULL,cost_currency=NULL WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 '23514','financial_reset_exact_row_action_mismatch','armed normalization cannot change unreviewed historical fields');
CREATE TEMP TABLE reset_guard_revision AS SELECT sum(revision) AS revision FROM app_private.financial_report_source_revisions
 WHERE organization_id='fa231020-0000-4000-8000-000000000001';
SAVEPOINT reset_guard_cancelled_action;
SELECT lives_ok($$UPDATE public.timeline_events SET cost_amount=NULL,cost_currency=NULL WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 'exact normalization passes frozen and historical-date guards');
SELECT is((SELECT count(*) FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()),0::bigint,'completion consumes the action capability');
ROLLBACK TO SAVEPOINT reset_guard_cancelled_action;
SELECT is((SELECT to_jsonb(event) FROM public.timeline_events event WHERE id='fa231020-0000-4000-8000-000000000030'),(SELECT original FROM reset_guard_images),'savepoint rollback restores the original complete image');
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa231020-0000-4000-8000-000000000001'),(SELECT revision FROM reset_guard_revision),'savepoint rollback publishes no report revision');
SELECT lives_ok($$UPDATE public.timeline_events SET cost_amount=NULL,cost_currency=NULL WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 'rolled-back action remains armed and can execute its exact transition');
SELECT app_private.complete_financial_reset_actions('fa231020-0000-4000-8000-000000000100');
SELECT is((SELECT to_jsonb(event) FROM public.timeline_events event WHERE id='fa231020-0000-4000-8000-000000000030'),(SELECT normalized FROM reset_guard_images),'normalization preserves exact bound historical audit timestamps');
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa231020-0000-4000-8000-000000000001'),(SELECT revision FROM reset_guard_revision),'same-transaction maintenance coalesces with the fixture source change');
SELECT is((SELECT count(*) FROM app_private.financial_report_source_revisions WHERE organization_id='fa231020-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current()),1::bigint,'maintenance retains exactly one committed-source candidate for this transaction');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.timeline_events'::regclass AND tgname='financial_report_source_revision' AND tgenabled='O' AND tgfoid='app_private.advance_financial_report_source_revision()'::regprocedure)
 AND (SELECT prosrc NOT LIKE '%Exact bound reset action:%' FROM pg_proc WHERE oid='app_private.advance_financial_report_source_revision()'::regprocedure),'report-source trigger remains enabled and has no maintenance exemption');
SELECT throws_ok($$UPDATE public.timeline_events SET title='Reused capability' WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 '55000','financial_writes_frozen','consumed capability cannot authorize another write');
UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa231020-0000-4000-8000-000000000001';
SELECT lives_ok($$SELECT pg_temp.prepare_guard_probe(true)$$,'restore is a new operation bound to a fresh generation');
SELECT lives_ok($$UPDATE public.timeline_events SET cost_amount=5,cost_currency='USD' WHERE id='fa231020-0000-4000-8000-000000000030'$$,
 'exact archive restoration can restore a historical financial projection while frozen');
SELECT app_private.complete_financial_reset_actions('fa231020-0000-4000-8000-000000000101');
SELECT is((SELECT to_jsonb(event) FROM public.timeline_events event WHERE id='fa231020-0000-4000-8000-000000000030'),(SELECT original FROM reset_guard_images),'restored timeline image exactly matches the immutable original archive');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'completed exact actions satisfy deferred checks');
SELECT * FROM finish();
ROLLBACK;
