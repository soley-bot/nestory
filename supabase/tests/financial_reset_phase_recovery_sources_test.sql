BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Pure classification and refusal checks. A real empty action operation is
-- completed below; no completed zero/billing journal is invented. Actual
-- checked-phase commit -> fresh-generation recovery requires the owned-clone
-- multi-transaction rehearsal, because the phase fence rejects a generation
-- change in the same transaction that created the authority.
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa231100-0000-4000-8000-000000000001','Recovery source fixture','recovery-source-test');
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa231100-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
CREATE FUNCTION pg_temp.recovery_source_binding(p_id uuid,p_kind text,p_source integer,p_restore uuid) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT jsonb_build_object('operation_id',p_id,'organization_id','fa231100-0000-4000-8000-000000000001',
 'operation_kind',p_kind,'restore_of',p_restore,'source_generation',p_source,'target_generation',p_source+1,
 'manifest_sha256',repeat('1',64),'plan_sha256',repeat('2',64),'schema_sha256',repeat('3',64),
 'archive_count',0,'action_count',0,'archive_sha256',app_private.financial_reset_hash('[]'::jsonb),
 'action_sha256',app_private.financial_reset_hash('[]'::jsonb),'audit_timestamp','2026-10-23T00:00:00Z','audit_actor',NULL)
$$;
SELECT app_private.prepare_financial_reset_operation(pg_temp.recovery_source_binding('fa231100-0000-4000-8000-000000000100','reset',0,NULL));
SELECT app_private.seal_financial_reset_operation('fa231100-0000-4000-8000-000000000100');
SELECT app_private.start_financial_reset_actions('fa231100-0000-4000-8000-000000000100');
SELECT app_private.complete_financial_reset_actions('fa231100-0000-4000-8000-000000000100');

SELECT is((SELECT count(*) FROM app_private.financial_reset_relation_rules WHERE archive_remove),63::bigint,
 'phase recovery does not broaden the reset deletion table set');
SELECT is((SELECT count(*) FROM app_private.financial_reset_relation_rules WHERE relation_name IN ('public.lease_terms','public.lease_billing_terms')
 AND NOT archive_remove AND NOT restore_allowed AND normalize_columns='{}'::text[] AND generated_columns=ARRAY['effective_range']),2::bigint,
 'contract relations have recovery-only rules with exact generated-column projection');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='app_private.financial_reset_relation_rules'::regclass AND attname='relation_oid' AND NOT attisdropped),
 'durable recovery rules never persist another database table OID');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) role(name)
 WHERE n.nspname='app_private' AND p.proname LIKE '%financial_reset%recovery%'
 AND has_function_privilege(role.name,p.oid,'EXECUTE')),'application roles cannot invoke recovery helpers');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) role(name)
 WHERE n.nspname='app_private' AND c.relname IN ('financial_reset_recovery_plans','financial_reset_recovery_sources')
 AND (NOT c.relrowsecurity OR has_table_privilege(role.name,c.oid,'SELECT,INSERT,UPDATE,DELETE'))),
 'recovery evidence has RLS and no application table access');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('app_private.financial_reset_recovery_plans'::regclass,'app_private.financial_reset_recovery_sources'::regclass)
 AND tgfoid='app_private.guard_financial_reset_immutable()'::regprocedure AND (tgtype::integer & 1)=1 AND (tgtype::integer & 2)=2
 AND (tgtype::integer & 8)=8 AND (tgtype::integer & 16)=16),2::bigint,'both recovery evidence tables reject update and deletion');
SELECT is((SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid IN ('app_private.financial_reset_recovery_plans'::regclass,'app_private.financial_reset_recovery_sources'::regclass)
 AND confrelid='app_private.financial_reset_operations'::regclass AND array_length(conkey,1)=2),2::bigint,
 'both recovery evidence tables bind operation and organization together');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidates('fa231100-0000-4000-8000-000000000100')$$,
 'P0002','query returned no rows','actions_complete alone is not completed zero authority');
SELECT is(app_private.financial_reset_recovery_source_rows('fa231100-0000-4000-8000-000000000100'),'[]'::jsonb,
 'no immutable recovery sources exist without checked phase preparation');

CREATE TEMP TABLE recovery_source_proposals AS
SELECT to_jsonb(jsonb_populate_record(NULL::public.owner_opening_balance_requests,
 '{"id":"fa231100-0000-4000-8000-000000000030","organization_id":"fa231100-0000-4000-8000-000000000001"}'::jsonb)) AS opening,
 to_jsonb(jsonb_populate_record(NULL::public.lease_terms,
 '{"id":"fa231100-0000-4000-8000-000000000040","organization_id":"fa231100-0000-4000-8000-000000000001","status":"expired"}'::jsonb)) AS term;
SELECT is(app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.owner_opening_balance_requests',
 (SELECT opening FROM recovery_source_proposals),NULL,'known-zero')->>'before_sha256',
 (SELECT app_private.financial_reset_hash(opening) FROM recovery_source_proposals),
 'pure source classification preserves the full typed before-image hash');
SELECT is(app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),(SELECT term||'{"status":"active"}'::jsonb FROM recovery_source_proposals),'continuation')->>'kind',
 'recovery-repair','only the reverse expired-to-active predecessor transition classifies as repair');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term||'{"organization_id":"fa231100-0000-4000-8000-000000000009"}'::jsonb FROM recovery_source_proposals),NULL,'continuation')$$,
 '23514','financial_reset_recovery_source_scope_invalid','foreign source organization is rejected');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),(SELECT term||'{"status":"active","organization_id":"fa231100-0000-4000-8000-000000000009"}'::jsonb FROM recovery_source_proposals),'continuation')$$,
 '23514','financial_reset_recovery_source_scope_invalid','repair cannot move a row across organizations');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),NULL,'known-zero')$$,
 '23514','financial_reset_recovery_zero_source_invalid','zero authority cannot authorize contract pruning');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.owner_opening_balance_requests',
 (SELECT opening FROM recovery_source_proposals),(SELECT opening FROM recovery_source_proposals),'known-zero')$$,
 '23514','financial_reset_recovery_zero_source_invalid','zero authority only permits removal of phase-created rows');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.properties',
 (SELECT term FROM recovery_source_proposals),NULL,'continuation')$$,
 '23514','financial_reset_recovery_relation_not_allowed','preserved property records cannot become recovery sources');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),NULL,NULL)$$,
 '23514','financial_reset_recovery_relation_not_allowed','missing provenance fails closed');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),(SELECT term||'{"status":"active","id":"fa231100-0000-4000-8000-000000000041"}'::jsonb FROM recovery_source_proposals),'continuation')$$,
 '23514','financial_reset_recovery_repair_not_allowed','repair cannot change contract identity');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term FROM recovery_source_proposals),(SELECT term||'{"status":"draft"}'::jsonb FROM recovery_source_proposals),'continuation')$$,
 '23514','financial_reset_recovery_repair_not_allowed','repair cannot invent a different contract status');
SELECT throws_ok($$SELECT app_private.financial_reset_recovery_candidate('fa231100-0000-4000-8000-000000000100','public.lease_terms',
 (SELECT term||'{"invented_field":1}'::jsonb FROM recovery_source_proposals),NULL,'continuation')$$,
 '23514','financial_reset_full_typed_row_required','unrecognized fields cannot be hidden in a self-consistent source hash');
SELECT is(app_private.financial_reset_action_allowed('public.lease_terms'::regclass,'DELETE',(SELECT term FROM recovery_source_proposals),NULL),false,
 'classifying a proposal does not grant row-write authority');
SELECT is((SELECT count(*) FROM app_private.financial_reset_recovery_sources WHERE organization_id='fa231100-0000-4000-8000-000000000001'),0::bigint,
 'classification never inserts a source journal');

UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa231100-0000-4000-8000-000000000001';
SELECT app_private.prepare_financial_reset_operation(pg_temp.recovery_source_binding('fa231100-0000-4000-8000-000000000200','restore',1,'fa231100-0000-4000-8000-000000000100'));
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_recovery('fa231100-0000-4000-8000-000000000200','{}'::jsonb)$$,
 'P0002','query returned no rows','a restore operation cannot manufacture missing completed phase evidence');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_actions('fa231100-0000-4000-8000-000000000200',
 (SELECT jsonb_build_array(jsonb_build_object('action_id','fa231100-0000-4000-8000-000000000201','ordinal',1,
 'relation_name','public.lease_terms','primary_key',jsonb_build_object('id',term->'id'),'kind','recovery-prune',
 'before_row_text',term::text,'before_sha256',app_private.financial_reset_hash(term),'after_row_text',NULL,'after_sha256',NULL)) FROM recovery_source_proposals))$$,
 '23514','financial_reset_recovery_action_source_mismatch','typed self-consistent pruning cannot substitute for immutable phase-derived sources');
SELECT is((SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id='fa231100-0000-4000-8000-000000000200'),0::bigint,
 'failed recovery preparation leaves no partial actions');
SELECT lives_ok($$SELECT app_private.seal_financial_reset_operation('fa231100-0000-4000-8000-000000000200')$$,
 'an empty raw archive restore remains distinct from checked-phase recovery');
SELECT is((SELECT count(*) FROM app_private.financial_reset_transaction_capabilities WHERE organization_id='fa231100-0000-4000-8000-000000000001'),0::bigint,
 'negative preparation tests leave no write capabilities');
SELECT * FROM finish();
ROLLBACK;
