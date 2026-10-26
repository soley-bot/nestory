BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_relation_rules
 WHERE relation_name='app_private.tenant_commercial_document_upload_attestations'
 AND NOT archive_remove AND cardinality(normalize_columns)=0
 AND cardinality(generated_columns)=0 AND NOT restore_allowed),
 'reset authority retains every attestation column without deletion, normalization or restore');
SELECT throws_ok($$UPDATE app_private.financial_reset_relation_rules SET restore_allowed=true
 WHERE relation_name='app_private.tenant_commercial_document_upload_attestations'$$,
 '23514','financial_reset_evidence_immutable','retained rule remains immutable');
SELECT is((SELECT normalize_columns FROM app_private.financial_reset_relation_rules
 WHERE relation_name='public.expense_transactions'),ARRAY['replaces_transaction_id'],
 'expense cycle stage permits only its reviewed nullable predecessor pointer');
SELECT ok(has_function_privilege('service_role',
 'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated',
 'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon',
 'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)','EXECUTE'),
 'attestation RPC retains its service-role-only ACL');

-- Isolate the RPC's existing-row generation boundary: current, authorized
-- sources deliberately share old attestation keys. Domain setup is synthetic,
-- transaction-local and rollback-only; the calls below use normal guards.
CREATE TEMP TABLE upload_retirement_scope AS SELECT gen_random_uuid() org,
 gen_random_uuid() actor,gen_random_uuid() outsider,gen_random_uuid() property_id,
 gen_random_uuid() tenant,date_trunc('month',current_date)::date AS period_start;
CREATE TEMP TABLE upload_retirement_case AS SELECT s.*,kind,gen_random_uuid() source_id,
 gen_random_uuid() object_id,gen_random_uuid() attestation_id,
 kind NOT LIKE '%unconsumed' AS consumed,
 CASE WHEN kind LIKE 'stale%' THEN 0 ELSE 1 END AS generation,
 NULL::text path
 FROM upload_retirement_scope s CROSS JOIN unnest(ARRAY[
 'stale-consumed','stale-unconsumed','current-consumed','current-unconsumed','new-unconsumed']) kind;
UPDATE upload_retirement_case SET path=org||'/invoice/'||source_id||'/retirement.pdf';
GRANT SELECT ON upload_retirement_case TO service_role;

SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) SELECT actor,actor||'@upload-retirement.test' FROM upload_retirement_scope
 UNION ALL SELECT outsider,outsider||'@upload-retirement.test' FROM upload_retirement_scope;
INSERT INTO public.organizations(id,name,slug)
 SELECT org,'Upload retirement fixture','upload-retirement-'||org FROM upload_retirement_scope;
INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
 SELECT org,true,false FROM upload_retirement_scope;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT org,actor,'super_admin' FROM upload_retirement_scope;
INSERT INTO public.people(id,organization_id,display_name)
 SELECT tenant,org,'Upload retirement tenant' FROM upload_retirement_scope;
INSERT INTO public.properties(id,organization_id,name,code,property_type)
 SELECT property_id,org,'Upload retirement property','UPLOAD','apartment' FROM upload_retirement_scope;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 SELECT org,1,'open',period_start FROM upload_retirement_scope;
INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,
 billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,
 recipient_label,total_amount,financial_generation)
 SELECT source_id,org,'UPLOAD-'||kind,property_id,gen_random_uuid(),gen_random_uuid(),
 period_start,period_start,period_start,period_start,'through_ips','individual',tenant,'Upload tenant',100,1 FROM upload_retirement_case;
INSERT INTO storage.objects(id,bucket_id,name,version,metadata)
 SELECT object_id,'tenant-commercial-documents',path,'retirement-v1',
 '{"mimetype":"application/pdf","size":100}'::jsonb FROM upload_retirement_case;
INSERT INTO app_private.tenant_commercial_document_upload_attestations(id,organization_id,source_kind,source_id,
 storage_path,storage_object_id,storage_object_version,size_bytes,sha256,renderer_version,
 presentation_snapshot_sha256,attested_by,attested_at,consumed_at,consumed_by,financial_generation)
 SELECT attestation_id,org,'invoice',source_id,path,object_id,'retirement-v1',100,repeat('a',64),'retirement-v1',
 app_private.tenant_commercial_document_snapshot_sha256('{}'::jsonb),actor,now(),
 CASE WHEN consumed THEN now() END,CASE WHEN consumed THEN actor END,generation
 FROM upload_retirement_case WHERE kind<>'new-unconsumed';
SET LOCAL session_replication_role=origin;
CREATE TEMP TABLE upload_retirement_before AS
 SELECT a.id,to_jsonb(a) row_json FROM app_private.tenant_commercial_document_upload_attestations a
 JOIN upload_retirement_scope s ON s.org=a.organization_id;
CREATE TEMP TABLE upload_retirement_objects_before AS
 SELECT o.id,to_jsonb(o) row_json FROM storage.objects o JOIN upload_retirement_case c ON c.object_id=o.id;

SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM upload_retirement_scope),true);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='stale-consumed'$$,
 '55000','financial_intent_retired','same-input consumed stale replay rejects before returning the old id');
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='stale-unconsumed'$$,
 '55000','financial_intent_retired','unconsumed stale attestation rejects before update');
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('b',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='stale-consumed'$$,
 '55000','financial_intent_retired','changed-input stale replay rejects before conflict handling');
SELECT is(public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb),attestation_id,
 'current consumed same-input replay retains its existing id')
 FROM upload_retirement_case WHERE kind='current-consumed';
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('b',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='current-consumed'$$,
 '23514','tenant_commercial_document_upload_attestation_conflict','current consumed conflicting replay remains rejected');
SELECT is(public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb),attestation_id,
 'current unconsumed attestation still permits its existing update path')
 FROM upload_retirement_case WHERE kind='current-unconsumed';
SELECT ok(public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb) IS NOT NULL,
 'missing attestation still permits a new current-generation insert')
 FROM upload_retirement_case WHERE kind='new-unconsumed';
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,outsider,path,
 object_id,'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='stale-consumed'$$,
 '42501','tenant_commercial_document_upload_attestation_forbidden','source authorization still precedes retained-row lookup');
SELECT throws_ok($$SELECT public.attest_tenant_commercial_document_upload(org,'invoice',source_id,actor,path,
 gen_random_uuid(),'retirement-v1',repeat('a',64),100,'retirement-v1','{}'::jsonb)
 FROM upload_retirement_case WHERE kind='stale-consumed'$$,
 '23503','tenant_commercial_document_upload_attestation_object_invalid','exact Storage object validation still precedes retirement');
RESET ROLE;

SELECT ok(NOT EXISTS(SELECT 1 FROM upload_retirement_before b
 LEFT JOIN app_private.tenant_commercial_document_upload_attestations a ON a.id=b.id
 WHERE a.id IS NULL OR to_jsonb(a) IS DISTINCT FROM b.row_json),
 'retirement and replay preserve complete existing attestation evidence');
SELECT ok(NOT EXISTS(SELECT 1 FROM upload_retirement_objects_before b
 LEFT JOIN storage.objects o ON o.id=b.id WHERE o.id IS NULL OR to_jsonb(o) IS DISTINCT FROM b.row_json),
 'retirement leaves every exact Storage object record untouched');
SELECT is((SELECT a.financial_generation FROM app_private.tenant_commercial_document_upload_attestations a
 JOIN upload_retirement_case c ON c.source_id=a.source_id WHERE c.kind='new-unconsumed'),1,
 'fresh insert uses current financial generation');
SELECT * FROM finish();
ROLLBACK;
