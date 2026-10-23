BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE artifact_generation_fixture AS SELECT gen_random_uuid() org,gen_random_uuid() property_id,
 gen_random_uuid() actor,gen_random_uuid() tenant,gen_random_uuid() lease_id,gen_random_uuid() invoice_id,
 gen_random_uuid() revision_id,gen_random_uuid() publication_id,gen_random_uuid() tenant_artifact_id,
 gen_random_uuid() owner_artifact_id,date_trunc('month',current_date)::date AS month;

-- Generation-boundary fixture only. Domain authenticity and Storage byte
-- registration are covered by their existing suites; no hosted data is used.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) SELECT actor,actor||'@artifact-generation.test' FROM artifact_generation_fixture;
INSERT INTO public.organizations(id,name,slug) SELECT org,'Artifact generation','artifact-'||org FROM artifact_generation_fixture;
INSERT INTO public.organization_members(organization_id,user_id,role) SELECT org,actor,'super_admin' FROM artifact_generation_fixture;
INSERT INTO public.ips_cutover_batches(id,organization_id,authority_start_date,data_owner,manifest,manifest_sha256,staged_by)
 SELECT invoice_id,org,month,'Synthetic owner','{}',repeat('b',64),actor FROM artifact_generation_fixture;
INSERT INTO public.import_runs(id,organization_id,import_type,source_file_name)
 SELECT invoice_id,org,'leases','synthetic-retained-import.csv' FROM artifact_generation_fixture;
INSERT INTO public.people(id,organization_id,display_name) SELECT tenant,org,'Synthetic tenant' FROM artifact_generation_fixture;
INSERT INTO public.properties(id,organization_id,name,code,property_type)
 SELECT property_id,org,'Artifact property','ARTIFACT','apartment' FROM artifact_generation_fixture;
INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,
 billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount)
 SELECT invoice_id,org,'ARTIFACT-INVOICE',property_id,lease_id,gen_random_uuid(),month,month,month,month,
 'through_ips','individual',tenant,'Synthetic tenant',100 FROM artifact_generation_fixture;
INSERT INTO public.tenant_commercial_document_artifacts(id,organization_id,source_kind,source_id,document_number,publication_status,failure_message)
 SELECT tenant_artifact_id,org,'invoice',invoice_id,'ARTIFACT-INVOICE','failed','Synthetic retained failure' FROM artifact_generation_fixture;
INSERT INTO public.owner_close_revisions(id,owner_close_series_id,organization_id,property_id,owner_person_id,currency,month_start,
 revision_number,status,prepared_by)
 SELECT revision_id,gen_random_uuid(),org,property_id,tenant,'USD',month,1,'preparing',actor FROM artifact_generation_fixture;
INSERT INTO public.owner_statement_publications(id,organization_id,owner_close_revision_id,statement_number,content_hash,generated_by)
 SELECT publication_id,org,revision_id,'OS-202610-123456789ABC',repeat('a',64),actor FROM artifact_generation_fixture;
INSERT INTO public.owner_statement_artifacts(id,organization_id,publication_id,format,storage_path,sha256,size_bytes,created_by,
 storage_object_id,storage_object_version,content_type)
 SELECT owner_artifact_id,org,publication_id,'pdf',org||'/synthetic-retained-artifact.pdf',repeat('a',64),100,actor,
 gen_random_uuid(),'synthetic-version','application/pdf' FROM artifact_generation_fixture;
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM artifact_generation_fixture),true);
SELECT is(app_private.tenant_commercial_document_property_id(org,'invoice',invoice_id),property_id,'unenrolled invoice source retains current behavior') FROM artifact_generation_fixture;
SELECT is(app_private.tenant_commercial_document_property_id(org,'artifact',tenant_artifact_id),property_id,'unenrolled tenant artifact resolves') FROM artifact_generation_fixture;
SELECT is(app_private.owner_statement_property_id(org,'publication',publication_id),property_id,'unenrolled owner publication resolves') FROM artifact_generation_fixture;
SELECT is(app_private.owner_statement_property_id(org,'artifact',owner_artifact_id),property_id,'unenrolled owner artifact resolves') FROM artifact_generation_fixture;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 SELECT org,1,'frozen',month FROM artifact_generation_fixture;
SELECT ok(NOT app_private.financial_row_is_current(org,1),'freeze denies even matching-generation artifact reads') FROM artifact_generation_fixture;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM artifact_generation_fixture);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT is(app_private.tenant_commercial_document_property_id(org,'invoice',invoice_id),NULL::uuid,'old invoice cannot publish a new current document') FROM artifact_generation_fixture;
SELECT is(app_private.tenant_commercial_document_property_id(org,'artifact',tenant_artifact_id),NULL::uuid,'old tenant artifact is unavailable in new generation') FROM artifact_generation_fixture;
SELECT is(app_private.owner_statement_property_id(org,'revision',revision_id),NULL::uuid,'old close revision cannot publish in new generation') FROM artifact_generation_fixture;
SELECT is(app_private.owner_statement_property_id(org,'publication',publication_id),NULL::uuid,'old publication cannot resume as current') FROM artifact_generation_fixture;
SELECT is(app_private.owner_statement_property_id(org,'artifact',owner_artifact_id),NULL::uuid,'old owner artifact cannot download as current') FROM artifact_generation_fixture;
SELECT throws_ok($$UPDATE public.tenant_invoices SET total_amount=total_amount WHERE id=(SELECT invoice_id FROM artifact_generation_fixture)$$,
 '55000','financial_intent_retired','a fresh header cannot mutate an old financial source');
SELECT throws_ok($$UPDATE public.tenant_commercial_document_artifacts SET failure_message='Replayed historical failure' WHERE id=(SELECT tenant_artifact_id FROM artifact_generation_fixture)$$,
 '55000','financial_intent_retired','old publication state cannot be revived by an update');
SELECT throws_ok($$SELECT public.commit_ips_cutover_batch(org,invoice_id,'Reviewed synthetic reset','fresh-key-for-old-batch') FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','new generation and new key cannot commit an old staged batch');
SELECT throws_ok($$SELECT public.abandon_ips_cutover_batch(org,invoice_id,'Reviewed synthetic reset','fresh-abandon-key') FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','old batch cannot execute a new lifecycle transition');
SELECT throws_ok($$SELECT public.get_ips_cutover_readiness(org,invoice_id) FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','old batch cannot claim current readiness');
SELECT throws_ok($$SELECT public.get_ips_cutover_batch(org,invoice_id) FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','old batch result cannot be returned as current');
SELECT throws_ok($$SELECT public.commit_generic_import_run(invoice_id,org) FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','old lease import cannot commit with fresh caller context');
SELECT throws_ok($$SELECT public.commit_unit_import_run(invoice_id,org) FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','old import rejects before typed commit or replay');
SELECT throws_ok($$INSERT INTO public.ips_cutover_transitions(organization_id,batch_id) SELECT org,invoice_id FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','direct child transition cannot revive old batch');
SELECT throws_ok($$INSERT INTO public.import_rows(organization_id,import_run_id) SELECT org,invoice_id FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','direct child write cannot revive old import');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$INSERT INTO public.import_rows(organization_id,import_run_id) SELECT org,invoice_id FROM artifact_generation_fixture$$,
 '55000','financial_intent_retired','operator without JWT still cannot mutate a retired import parent');
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM artifact_generation_fixture),true);
SELECT is((SELECT financial_generation FROM public.ips_cutover_batches WHERE id=(SELECT invoice_id FROM artifact_generation_fixture)),0,
 'staged batch provenance remains retained');
SELECT ok(app_private.financial_row_is_current(org,1),'current generation remains eligible') FROM artifact_generation_fixture;
SELECT is((SELECT financial_generation FROM public.tenant_invoices WHERE id=(SELECT invoice_id FROM artifact_generation_fixture)),0,
 'retirement preserves original invoice evidence');
SELECT is((SELECT count(*) FROM public.owner_statement_artifacts WHERE id=(SELECT owner_artifact_id FROM artifact_generation_fixture)),1::bigint,
 'retirement does not delete immutable artifact evidence');
SELECT * FROM finish();
ROLLBACK;
