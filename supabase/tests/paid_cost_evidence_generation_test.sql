BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE evidence_state AS SELECT
  '00000000-0000-0000-0000-000000000001'::uuid AS org,
  '10000000-0000-0000-0000-000000000001'::uuid AS property_id,
  '00000000-0000-0000-0000-000000000801'::uuid AS maker,
  '00000000-0000-0000-0000-000000000701'::uuid AS checker,
  NULL::uuid AS old_document, NULL::uuid AS new_document,
  NULL::uuid AS submission_id,
  (SELECT id FROM public.financial_reconciliation_sources
   WHERE organization_id='00000000-0000-0000-0000-000000000001'
     AND currency='USD' AND archived_at IS NULL ORDER BY id LIMIT 1) AS source_id;
INSERT INTO storage.objects(bucket_id,name,version,metadata)
SELECT 'nestory-documents',org::text||'/paid-cost-evidence/'||repeat(kind,64),
  gen_random_uuid()::text,jsonb_build_object('mimetype','application/pdf','size',25)
FROM evidence_state CROSS JOIN unnest(ARRAY['d','e']) kind;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM evidence_state;
UPDATE evidence_state s SET old_document=(public.register_paid_cost_evidence_verified(
  s.org,s.maker,s.property_id,'old.pdf',o.name,'application/pdf',25,
  repeat('d',64),o.id,o.version,'evidence-generation-old')->>'document_id')::uuid
FROM storage.objects o WHERE o.name=s.org::text||'/paid-cost-evidence/'||repeat('d',64);
SELECT is(r.financial_generation,0,'pre-enrollment evidence records its original generation')
FROM app_private.paid_cost_evidence_registrations r JOIN evidence_state s ON s.old_document=r.document_id;
SELECT lives_ok(format('SELECT app_private.assert_paid_cost_evidence_eligible(%L,%L,%L,%L,%L)',
  org,property_id,old_document,maker,'evidence-before-reset'),'ordinary existing evidence is eligible before enrollment') FROM evidence_state;
CREATE TEMP TABLE evidence_original AS
SELECT to_jsonb(r) AS registration, to_jsonb(d) AS document, to_jsonb(o) AS object
FROM evidence_state s JOIN app_private.paid_cost_evidence_registrations r ON r.document_id=s.old_document
JOIN public.documents d ON d.id=s.old_document JOIN storage.objects o ON o.id=r.storage_object_id;

GRANT SELECT ON evidence_state TO authenticated;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE evidence_submission AS
SELECT public.submit_expense(org,property_id,NULL,'general',NULL,'other','Generation test vendor',
  CURRENT_DATE,10,0,'USD','owner',NULL,source_id,old_document,NULL,
  'Evidence retirement test','evidence-generation-submission') AS result FROM evidence_state;
RESET ROLE;
UPDATE evidence_state SET submission_id=(SELECT (result->>'submission_id')::uuid FROM evidence_submission);

-- A lifecycle transition is fixture setup, not the reset executor. No financial
-- rows are deleted here: this isolates evidence authority after generation change.
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT org,1,'frozen','2026-10-01' FROM evidence_state;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM evidence_state);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok(format('SELECT app_private.assert_paid_cost_evidence_eligible(%L,%L,%L,%L,%L)',
  org,property_id,old_document,maker,'evidence-after-reset'),
  '55000','paid_cost_evidence_retired','old upload cannot authorize a new submission with a fresh key') FROM evidence_state;
SELECT throws_ok(format('SELECT public.register_paid_cost_evidence_verified(%L,%L,%L,%L,%L,%L,25,%L,%L,%L,%L)',
  s.org,s.maker,s.property_id,'old.pdf',o.name,'application/pdf',repeat('d',64),o.id,o.version,'evidence-generation-new-key'),
  '55000','paid_cost_evidence_retired','registrar cannot re-register the preserved object under a fresh key')
FROM evidence_state s JOIN storage.objects o ON o.name=s.org::text||'/paid-cost-evidence/'||repeat('d',64);
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE idempotency_key='evidence-generation-new-key'),
  0::bigint,'failed re-registration rolls back its fresh idempotency claim');
SELECT throws_ok(format('UPDATE app_private.paid_cost_evidence_registrations SET financial_generation=1 WHERE document_id=%L',old_document),
  '55000','financial_intent_retired','retired registration cannot be rebased in place') FROM evidence_state;
SELECT throws_ok(format('DELETE FROM app_private.paid_cost_evidence_registrations WHERE document_id=%L',old_document),
  '55000','financial_intent_retired','retired registration remains a durable Storage protection record') FROM evidence_state;

SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM evidence_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.submit_expense(%L,%L,NULL,''general'',NULL,''other'',''Fresh key'',CURRENT_DATE,10,0,''USD'',''owner'',NULL,%L,%L,NULL,NULL,''evidence-generation-reuse'')',
  org,property_id,source_id,old_document),'55000','paid_cost_evidence_retired',
  'ordinary authenticated submission rejects retired evidence') FROM evidence_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM evidence_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.review_expense(%L,%L,''approve'',NULL,''evidence-generation-review'',NULL)',org,submission_id),
  '55000','paid_cost_evidence_retired','ordinary approval revalidates evidence generation before financial effects') FROM evidence_state;
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE idempotency_key IN ('evidence-generation-reuse','evidence-generation-review')),
  0::bigint,'denied submission and review leave no new idempotency authority');
SELECT is((SELECT status::text FROM public.expense_submissions WHERE id=(SELECT submission_id FROM evidence_state)),
  'submitted','denied review preserves the original submitted record');

SELECT is(public.begin_paid_cost_evidence_cleanup(org,org::text||'/paid-cost-evidence/'||repeat('d',64)),false,
  'retired registration continues to protect original Storage bytes') FROM evidence_state;
SELECT is((SELECT count(*) FROM public.list_paid_cost_evidence_orphans(300) o JOIN evidence_state s
  ON o.storage_path=s.org::text||'/paid-cost-evidence/'||repeat('d',64)),0::bigint,
  'retired registered object is never listed as an orphan');
SELECT ok((SELECT original.registration=to_jsonb(r) AND original.document=to_jsonb(d) AND original.object=to_jsonb(o)
  FROM evidence_original original CROSS JOIN evidence_state s
  JOIN app_private.paid_cost_evidence_registrations r ON r.document_id=s.old_document
  JOIN public.documents d ON d.id=s.old_document JOIN storage.objects o ON o.id=r.storage_object_id),
  'retirement preserves exact registration, document metadata and Storage metadata');

SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM evidence_state;
UPDATE evidence_state s SET new_document=(public.register_paid_cost_evidence_verified(
  s.org,s.maker,s.property_id,'new.pdf',o.name,'application/pdf',25,
  repeat('e',64),o.id,o.version,'evidence-generation-current')->>'document_id')::uuid
FROM storage.objects o WHERE o.name=s.org::text||'/paid-cost-evidence/'||repeat('e',64);
SELECT is(r.financial_generation,1,'new evidence is bound to the active generation')
FROM app_private.paid_cost_evidence_registrations r JOIN evidence_state s ON s.new_document=r.document_id;
SELECT lives_ok(format('SELECT app_private.assert_paid_cost_evidence_eligible(%L,%L,%L,%L,%L)',
  org,property_id,new_document,maker,'evidence-current-submit'),'fresh registration remains eligible') FROM evidence_state;
SELECT throws_ok(format('UPDATE app_private.paid_cost_evidence_registrations SET financial_generation=0 WHERE document_id=%L',new_document),
  '23514','financial_intent_generation_immutable','current evidence generation also cannot be rewritten') FROM evidence_state;
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=(SELECT org FROM evidence_state);
SELECT throws_ok(format('SELECT public.register_paid_cost_evidence_verified(%L,%L,%L,%L,%L,%L,25,%L,%L,%L,%L)',
  s.org,s.maker,s.property_id,'new.pdf',o.name,'application/pdf',repeat('e',64),o.id,o.version,'evidence-frozen-register'),
  '55000','financial_writes_frozen','frozen organization rejects registration before replay')
FROM evidence_state s JOIN storage.objects o ON o.name=s.org::text||'/paid-cost-evidence/'||repeat('e',64);
SELECT ok(NOT has_table_privilege('authenticated','app_private.paid_cost_evidence_registrations','SELECT'),
  'registration authority stays private');
SELECT ok(NOT has_function_privilege('service_role','app_private.assert_paid_cost_evidence_eligible(uuid,uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'service role cannot call private eligibility directly');
SELECT * FROM finish();
ROLLBACK;
