BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- This file runs against the complete local migration chain, including exact
-- row-gate integration. No hosted data, trigger disabling, or replica role.
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa231010-0000-4000-8000-000000000010','authenticated','authenticated','reset-foundation@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa231010-0000-4000-8000-000000000001','Reset foundation fixture','reset-foundation-test'),
 ('fa231010-0000-4000-8000-000000000009','Reset foreign fixture','reset-foundation-foreign');
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason) VALUES
 ('fa231010-0000-4000-8000-000000000030','fa231010-0000-4000-8000-000000000001','2026-09-01','fa231010-0000-4000-8000-000000000010','Original archive source'),
 ('fa231010-0000-4000-8000-000000000031','fa231010-0000-4000-8000-000000000001','2026-08-01','fa231010-0000-4000-8000-000000000010','Unreviewed same organization'),
 ('fa231010-0000-4000-8000-000000000039','fa231010-0000-4000-8000-000000000009','2026-09-01','fa231010-0000-4000-8000-000000000010','Foreign organization');
CREATE TEMP TABLE reset_foundation_fixture AS
SELECT to_jsonb(t) AS original, app_private.financial_reset_primary_key('public.financial_month_locks'::regclass,to_jsonb(t)) AS pk
FROM public.financial_month_locks t WHERE id='fa231010-0000-4000-8000-000000000030';
SELECT is((SELECT app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,pk,
 'fa231010-0000-4000-8000-000000000001',true) FROM reset_foundation_fixture),
 (SELECT original FROM reset_foundation_fixture),'indexed shared-lock lookup returns the exact original row');
SELECT is((SELECT app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,pk,
 'fa231010-0000-4000-8000-000000000001',false) FROM reset_foundation_fixture),
 (SELECT original FROM reset_foundation_fixture),'unlocked coverage lookup returns the same exact row');
SELECT is((SELECT app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,pk,
 'fa231010-0000-4000-8000-000000000009',true) FROM reset_foundation_fixture),NULL::jsonb,
 'typed primary key never substitutes for the organization predicate');
SELECT is((SELECT app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,pk||'{"extra":1}'::jsonb,
 'fa231010-0000-4000-8000-000000000001',true) FROM reset_foundation_fixture),NULL::jsonb,
 'the original JSON primary-key residual rejects extra key fields');
SELECT is((SELECT app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,jsonb_build_object('id',upper(pk->>'id')),
 'fa231010-0000-4000-8000-000000000001',true) FROM reset_foundation_fixture),NULL::jsonb,
 'typed UUID equivalence cannot admit a noncanonical JSON primary key');
SELECT is(app_private.financial_reset_lookup_row('public.financial_month_locks'::regclass,
 '{"id":"fa231010-0000-4000-8000-000000000099"}', 'fa231010-0000-4000-8000-000000000001',true),NULL::jsonb,
 'missing indexed source remains missing');
SELECT throws_ok($$SELECT app_private.financial_reset_lookup_row('public.organizations'::regclass,
 '{"id":"fa231010-0000-4000-8000-000000000001"}','fa231010-0000-4000-8000-000000000001',true)$$,
 '23514','financial_reset_relation_not_allowed','lookup cannot select an unregistered relation');
CREATE TEMP TABLE reset_foundation_inputs(kind text PRIMARY KEY,actions jsonb,binding jsonb);
INSERT INTO reset_foundation_inputs(kind,actions)
SELECT 'reset',jsonb_build_array(jsonb_build_object('action_id','fa231010-0000-4000-8000-000000000101','ordinal',1,
 'relation_name','public.financial_month_locks','primary_key',pk,'kind','archive-delete',
 'before_row_text',original::text,'after_row_text',NULL,'before_sha256',app_private.financial_reset_hash(original),'after_sha256',NULL))
FROM reset_foundation_fixture;
CREATE FUNCTION pg_temp.reset_foundation_binding(p_id uuid,p_kind text,p_source integer,p_restore uuid,p_actions jsonb) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT jsonb_build_object('operation_id',p_id,'organization_id','fa231010-0000-4000-8000-000000000001','operation_kind',p_kind,'restore_of',p_restore,
 'source_generation',p_source,'target_generation',p_source+1,'manifest_sha256',repeat('1',64),'plan_sha256',repeat('2',64),'schema_sha256',repeat('3',64),
 'archive_count',1,'action_count',jsonb_array_length(p_actions),'audit_timestamp',to_jsonb('2026-10-23T00:00:00Z'::timestamptz),'audit_actor',NULL,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks','primary_key',pk,'row_sha256',app_private.financial_reset_hash(original)))) FROM reset_foundation_fixture),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('action_id',a->'action_id','ordinal',a->'ordinal','relation_name',a->'relation_name','primary_key',a->'primary_key',
   'kind',a->'kind','before_sha256',a->'before_sha256','after_sha256',a->'after_sha256') ORDER BY (a->>'ordinal')::integer)) FROM jsonb_array_elements(p_actions) a))
$$;
UPDATE reset_foundation_inputs SET binding=pg_temp.reset_foundation_binding('fa231010-0000-4000-8000-000000000100','reset',0,NULL,actions) WHERE kind='reset';
CREATE FUNCTION pg_temp.reset_foundation_archive_payload(p_row jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
 'primary_key',app_private.financial_reset_primary_key('public.financial_month_locks'::regclass,p_row),
 'row_text',p_row::text,'row_sha256',app_private.financial_reset_hash(p_row)))
$$;

SELECT is((SELECT count(*) FROM app_private.financial_reset_relation_rules WHERE archive_remove),63::bigint,'archive-delete authority is the closed 63-table set');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='app_private.financial_reset_relation_rules'::regclass AND attname='relation_oid' AND NOT attisdropped),
 'durable relation rules contain no source-instance OIDs after logical restore');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) role(name)
 WHERE n.nspname='app_private' AND p.proname LIKE '%financial_reset%' AND has_function_privilege(role.name,p.oid,'EXECUTE')),
 'no application role can execute any foundation helper');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) role(name)
 WHERE n.nspname='app_private' AND c.relname LIKE 'financial_reset_%' AND c.relkind='r'
 AND (NOT c.relrowsecurity OR has_table_privilege(role.name,c.oid,'SELECT,INSERT,UPDATE,DELETE'))),
 'foundation metadata has RLS and no application table privileges');
SELECT is(app_private.financial_reset_action_allowed('public.financial_month_locks'::regclass,'DELETE',(SELECT original FROM reset_foundation_fixture),NULL),false,'owner without capability receives no exemption');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_operation((SELECT binding FROM reset_foundation_inputs WHERE kind='reset'))$$,
 '55000','financial_reset_frozen_generation_required','operation cannot prepare before frozen reservation');
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa231010-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
SELECT lives_ok($$SELECT app_private.prepare_financial_reset_operation((SELECT binding FROM reset_foundation_inputs WHERE kind='reset'))$$,'prepare binds the frozen generation and review hashes');
SELECT is(app_private.prepare_financial_reset_operation((SELECT binding FROM reset_foundation_inputs WHERE kind='reset')),'fa231010-0000-4000-8000-000000000100'::uuid,'same UUID and exact binding is retry-safe');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_operation((SELECT binding||jsonb_build_object('plan_sha256',repeat('4',64)) FROM reset_foundation_inputs WHERE kind='reset'))$$,
 '23514','financial_reset_operation_id_reused','same UUID cannot name a different plan');
SELECT throws_ok($$UPDATE app_private.financial_reset_operations SET archive_count=2 WHERE operation_id='fa231010-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_binding_immutable','archive count cannot be weakened after binding');
SELECT throws_ok($$SELECT app_private.seal_financial_reset_operation('fa231010-0000-4000-8000-000000000100')$$,
 '23514','financial_reset_manifest_counts_or_digest_mismatch','missing archive/action rows cannot seal');
SELECT throws_ok($$SELECT app_private.archive_financial_reset_rows('fa231010-0000-4000-8000-000000000100',pg_temp.reset_foundation_archive_payload((SELECT original||'{"reason":"Invented before image"}'::jsonb FROM reset_foundation_fixture)))$$,
 '40001','financial_reset_archive_source_mismatch','self-consistent invented row/hash does not substitute for source');
SELECT throws_ok($$SELECT app_private.archive_financial_reset_rows('fa231010-0000-4000-8000-000000000100',pg_temp.reset_foundation_archive_payload((SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231010-0000-4000-8000-000000000039')))$$,
 '23514','financial_reset_archive_image_invalid','cross-organization archive is rejected');
SELECT throws_ok($$SELECT app_private.archive_financial_reset_rows('fa231010-0000-4000-8000-000000000100',jsonb_set(pg_temp.reset_foundation_archive_payload((SELECT original FROM reset_foundation_fixture)),'{0,row_sha256}',to_jsonb(repeat('f',64))))$$,
 '23514','financial_reset_original_row_text_required','archive SHA must hash full original PostgreSQL text');
SELECT lives_ok($$SELECT app_private.archive_financial_reset_rows('fa231010-0000-4000-8000-000000000100',pg_temp.reset_foundation_archive_payload((SELECT original FROM reset_foundation_fixture)))$$,'archive copies exact current full row');
SELECT is((SELECT organization_id FROM app_private.financial_reset_archive_rows WHERE operation_id='fa231010-0000-4000-8000-000000000100'),
 'fa231010-0000-4000-8000-000000000001'::uuid,'archive organization is derived from operation');
SELECT throws_ok($$UPDATE app_private.financial_reset_archive_rows SET row_json=row_json||'{"reason":"changed"}'::jsonb WHERE operation_id='fa231010-0000-4000-8000-000000000100'$$,
 '23514','financial_reset_evidence_immutable','original archive cannot be overwritten');
SELECT lives_ok($$SELECT app_private.prepare_financial_reset_actions('fa231010-0000-4000-8000-000000000100',(SELECT actions FROM reset_foundation_inputs WHERE kind='reset'))$$,'prepare exact one-row deletion');
SELECT is(app_private.financial_reset_archive_digest('fa231010-0000-4000-8000-000000000100'),(SELECT binding->>'archive_sha256' FROM reset_foundation_inputs WHERE kind='reset'),'archive digest binds exact ordered keys and row hashes');
SELECT is(app_private.financial_reset_action_digest('fa231010-0000-4000-8000-000000000100'),(SELECT binding->>'action_sha256' FROM reset_foundation_inputs WHERE kind='reset'),'action digest binds exact order and full image hashes');
SELECT lives_ok($$SELECT app_private.seal_financial_reset_operation('fa231010-0000-4000-8000-000000000100')$$,'complete exact archive and action chain seals');
SELECT throws_ok($$SELECT app_private.archive_financial_reset_rows('fa231010-0000-4000-8000-000000000100',pg_temp.reset_foundation_archive_payload((SELECT to_jsonb(t) FROM public.financial_month_locks t WHERE id='fa231010-0000-4000-8000-000000000031')))$$,
 '23514','financial_reset_archive_not_preparable','sealed archive cannot gain unreviewed rows');
SELECT throws_ok($$SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000100','fa231010-0000-4000-8000-000000000101')$$,
 '55000','financial_reset_execution_transaction_required','sealing does not implicitly arm a write');
SELECT lives_ok($$SELECT app_private.start_financial_reset_actions('fa231010-0000-4000-8000-000000000100')$$,'start binds current backend and top-level transaction');
SELECT throws_ok($$SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000100','fa231010-0000-4000-8000-000000000199')$$,
 '23514','financial_reset_next_action_required','unknown action cannot be armed');
SELECT lives_ok($$SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000100','fa231010-0000-4000-8000-000000000101')$$,'exact next action can be armed');
SELECT is((SELECT organization_id FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()),'fa231010-0000-4000-8000-000000000001'::uuid,'capability scope is derived and FK bound');
SELECT throws_ok($$SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000100','fa231010-0000-4000-8000-000000000101')$$,
 '55000','financial_reset_capability_already_active','second arm cannot overwrite active authority');
SELECT throws_ok($$SELECT app_private.financial_reset_action_allowed('public.financial_month_locks'::regclass,'DELETE',(SELECT original FROM reset_foundation_fixture),NULL)$$,
 '55000','financial_reset_capability_context_invalid','plain function call cannot enter a row action');
SELECT throws_ok($$UPDATE app_private.financial_reset_transaction_capabilities SET entered=true WHERE backend_pid=pg_backend_pid()$$,
 '23514','financial_reset_capability_entry_invalid','manual metadata update cannot simulate row gate entry');
SELECT throws_ok($$DELETE FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000031'$$,
 '23514','financial_reset_exact_row_action_mismatch','active capability rejects another row in same organization');
SELECT throws_ok($$DELETE FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000039'$$,
 '23514','financial_reset_exact_row_action_mismatch','active capability rejects a foreign organization row');
SELECT throws_ok($$UPDATE public.financial_month_locks SET reason='Wrong operation' WHERE id='fa231010-0000-4000-8000-000000000030'$$,
 '23514','financial_reset_exact_row_action_mismatch','DELETE authority cannot be used for UPDATE');
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_transaction_incomplete','unconsumed capability cannot escape transaction completion');
SELECT is((SELECT entered FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()),false,'failed attempts roll back gate entry without consuming the approved action');
SAVEPOINT reset_action_rollback;
DELETE FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000030';
SELECT is((SELECT count(*) FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()),0::bigint,'exact successful row consumes capability');
SELECT ok((SELECT applied_at IS NOT NULL FROM app_private.financial_reset_actions WHERE action_id='fa231010-0000-4000-8000-000000000101'),'exact successful row marks action applied');
ROLLBACK TO SAVEPOINT reset_action_rollback;
SELECT is((SELECT count(*) FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000030'),1::bigint,'savepoint rollback restores row');
SELECT is((SELECT entered FROM app_private.financial_reset_transaction_capabilities WHERE backend_pid=pg_backend_pid()),false,'savepoint rollback restores only the original unentered capability');
SELECT is((SELECT applied_at FROM app_private.financial_reset_actions WHERE action_id='fa231010-0000-4000-8000-000000000101'),NULL::timestamptz,'savepoint rollback restores unapplied status');
SELECT lives_ok($$DELETE FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000030'$$,'same original exact action can execute after savepoint rollback');
SELECT throws_ok($$SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000100','fa231010-0000-4000-8000-000000000101')$$,
 '23514','financial_reset_next_action_required','consumed action cannot be replayed');
SELECT lives_ok($$SELECT app_private.complete_financial_reset_actions('fa231010-0000-4000-8000-000000000100')$$,'all exact actions finish without claiming known zero');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'completed action sequence passes deferred checks');
SET CONSTRAINTS ALL DEFERRED;
SELECT is(app_private.financial_reset_operation_status('fa231010-0000-4000-8000-000000000100')->>'status','actions_complete','status supports unknown-commit resolution');
SELECT is(app_private.financial_reset_operation_status('fa231010-0000-4000-8000-000000000100')->>'known_zero_verified','false','foundation never claims known-zero proof');
SELECT throws_ok($$SELECT app_private.start_financial_reset_actions('fa231010-0000-4000-8000-000000000100')$$,
 '55000','financial_reset_operation_not_sealed','completed operation cannot restart');
SELECT throws_ok($$DELETE FROM public.financial_month_locks WHERE id='fa231010-0000-4000-8000-000000000031'$$,
 '55000','financial_writes_frozen','owner again has no exemption after capability consumption');

-- Restore is a fresh operation/generation, never rebinding retained retired intent.
UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa231010-0000-4000-8000-000000000001';
INSERT INTO reset_foundation_inputs(kind,actions)
SELECT 'restore',jsonb_build_array(jsonb_build_object('action_id','fa231010-0000-4000-8000-000000000201','ordinal',1,
 'relation_name','public.financial_month_locks','primary_key',pk,'kind','restore','before_row_text',NULL,'before_sha256',NULL,
 'after_row_text',(CASE WHEN original ? 'financial_generation' THEN jsonb_set(original,'{financial_generation}','2'::jsonb) ELSE original END)::text,
 'after_sha256',app_private.financial_reset_hash(CASE WHEN original ? 'financial_generation' THEN jsonb_set(original,'{financial_generation}','2'::jsonb) ELSE original END)))
FROM reset_foundation_fixture;
UPDATE reset_foundation_inputs SET binding=pg_temp.reset_foundation_binding('fa231010-0000-4000-8000-000000000200','restore',1,'fa231010-0000-4000-8000-000000000100',actions) WHERE kind='restore';
SELECT lives_ok($$SELECT app_private.prepare_financial_reset_operation((SELECT binding FROM reset_foundation_inputs WHERE kind='restore'))$$,'restore references immutable original archive at next frozen generation');
SELECT lives_ok($$SELECT app_private.prepare_financial_reset_actions('fa231010-0000-4000-8000-000000000200',(SELECT actions FROM reset_foundation_inputs WHERE kind='restore'))$$,'restore accepts exact original with only approved generation change');
SELECT app_private.seal_financial_reset_operation('fa231010-0000-4000-8000-000000000200');
SELECT app_private.start_financial_reset_actions('fa231010-0000-4000-8000-000000000200');
SELECT app_private.arm_financial_reset_action('fa231010-0000-4000-8000-000000000200','fa231010-0000-4000-8000-000000000201');
SELECT lives_ok($$INSERT INTO public.financial_month_locks SELECT r.* FROM jsonb_populate_record(NULL::public.financial_month_locks,
 (SELECT (actions->0->>'after_row_text')::jsonb FROM reset_foundation_inputs WHERE kind='restore')) r$$,'exact archived INSERT passes restored row guards');
SELECT app_private.complete_financial_reset_actions('fa231010-0000-4000-8000-000000000200');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'full original tuple restoration satisfies deferred constraints');
SELECT is((SELECT app_private.financial_reset_hash(to_jsonb(t)) FROM public.financial_month_locks t WHERE id='fa231010-0000-4000-8000-000000000030'),
 (SELECT actions->0->>'after_sha256' FROM reset_foundation_inputs WHERE kind='restore'),'actual stored restore tuple equals the full bound after hash');
SELECT is((SELECT row_sha256 FROM app_private.financial_reset_archive_rows WHERE operation_id='fa231010-0000-4000-8000-000000000100'),
 (SELECT app_private.financial_reset_hash(original) FROM reset_foundation_fixture),'reset and restore never mutate original archive bytes');
SELECT is((SELECT count(*) FROM app_private.financial_reset_transaction_capabilities),0::bigint,'no transaction capabilities remain');
SELECT * FROM finish();
ROLLBACK;
