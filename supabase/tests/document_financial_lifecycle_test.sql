BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa230950-0000-4000-8000-000000000010','authenticated','authenticated','document-fence@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa230950-0000-4000-8000-000000000001','Document fence fixture','document-fence-test'),
 ('fa230950-0000-4000-8000-000000000009','Document other fixture','document-fence-other');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('fa230950-0000-4000-8000-000000000001','fa230950-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
VALUES('fa230950-0000-4000-8000-000000000020','fa230950-0000-4000-8000-000000000001','Document branch','DOCF','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('fa230950-0000-4000-8000-000000000002','fa230950-0000-4000-8000-000000000001','Document property','DOCF','Apartment','fa230950-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('nestory-documents','fa230950-0000-4000-8000-000000000001/branches/fa230950-0000-4000-8000-000000000020/documents/created.pdf'),
 ('nestory-documents','fa230950-0000-4000-8000-000000000001/branches/fa230950-0000-4000-8000-000000000020/documents/frozen.pdf');
INSERT INTO public.documents(id,organization_id,property_id,category,file_name,storage_path,mime_type,size_bytes,uploaded_by,uploaded_at)
VALUES('fa230950-0000-4000-8000-000000000030','fa230950-0000-4000-8000-000000000001','fa230950-0000-4000-8000-000000000002','property','legacy.pdf','fa230950-0000-4000-8000-000000000001/branches/fa230950-0000-4000-8000-000000000020/documents/legacy.pdf','application/pdf',4,'fa230950-0000-4000-8000-000000000010','2020-01-01');
CREATE TEMP TABLE document_test_state(id uuid);
INSERT INTO document_test_state VALUES(NULL);
GRANT SELECT,UPDATE ON document_test_state TO authenticated;
SELECT set_config('request.jwt.claim.sub','fa230950-0000-4000-8000-000000000010',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
UPDATE document_test_state SET id=public.create_document(
 'fa230950-0000-4000-8000-000000000001','property','created.pdf',
 'fa230950-0000-4000-8000-000000000001/branches/fa230950-0000-4000-8000-000000000020/documents/created.pdf',
 'application/pdf',4,repeat('a',64),'fa230950-0000-4000-8000-000000000002');
SELECT is((SELECT count(*) FROM public.documents WHERE organization_id='fa230950-0000-4000-8000-000000000001'),2::bigint,'ordinary checked create is visible through existing document RLS');
SELECT throws_ok($$UPDATE public.documents SET file_name='unauthorized.pdf' WHERE id='fa230950-0000-4000-8000-000000000030'$$,'42501','permission denied for table documents','ordinary direct document mutation remains unavailable');
SELECT lives_ok($$SELECT public.update_document(id,'fa230950-0000-4000-8000-000000000001','inspection','fa230950-0000-4000-8000-000000000002') FROM document_test_state$$,'ordinary checked metadata update remains available');
RESET ROLE;
SELECT lives_ok($$SELECT app_private.assert_financial_report_source_lifetime()$$,'document revision source has an enforced organization lifetime');
SELECT throws_ok($$UPDATE public.documents SET file_name='changed.pdf' WHERE id=(SELECT id FROM document_test_state)$$,'22023','Fingerprinted document bytes and fingerprint are immutable','document coverage preserves fingerprinted filename immutability');
SELECT throws_ok($$DELETE FROM public.documents WHERE id=(SELECT id FROM document_test_state)$$,'22023','Fingerprinted document rows cannot be deleted','document coverage preserves fingerprinted hard-delete protection');

INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa230950-0000-4000-8000-000000000001',1,'frozen','2026-10-01');
CREATE TEMP TABLE document_revision_before AS SELECT sum(revision) AS revision FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.create_document('fa230950-0000-4000-8000-000000000001','property','frozen.pdf','fa230950-0000-4000-8000-000000000001/branches/fa230950-0000-4000-8000-000000000020/documents/frozen.pdf','application/pdf',4,repeat('b',64),'fa230950-0000-4000-8000-000000000002')$$,'55000','financial_writes_frozen','checked document create observes freeze');
SELECT throws_ok($$SELECT public.update_document(id,'fa230950-0000-4000-8000-000000000001','frozen','fa230950-0000-4000-8000-000000000002') FROM document_test_state$$,'55000','financial_writes_frozen','checked document metadata update observes freeze');
SELECT throws_ok($$SELECT public.archive_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state$$,'55000','financial_writes_frozen','checked document archive observes freeze');
RESET ROLE;
SELECT throws_ok($$UPDATE public.documents SET file_name='frozen.pdf' WHERE id='fa230950-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','privileged legacy rename observes freeze');
SELECT throws_ok($$DELETE FROM public.documents WHERE id='fa230950-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','privileged legacy delete observes freeze');
SELECT throws_ok($$UPDATE public.documents SET organization_id='fa230950-0000-4000-8000-000000000009' WHERE id='fa230950-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','moving a document out of a frozen organization fails');
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001'),(SELECT revision FROM document_revision_before),'rejected frozen writes publish no revision');
SELECT is((SELECT file_name FROM public.documents WHERE id='fa230950-0000-4000-8000-000000000030'),'legacy.pdf','rejected frozen rename leaves metadata unchanged');
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa230950-0000-4000-8000-000000000001';
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa230950-0000-4000-8000-000000000009',2,'frozen','2026-10-01');
SELECT throws_ok($$UPDATE public.documents SET organization_id='fa230950-0000-4000-8000-000000000009' WHERE id='fa230950-0000-4000-8000-000000000030'$$,'55000','financial_writes_frozen','moving a document into a frozen organization fails');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.update_document('fa230950-0000-4000-8000-000000000030','fa230950-0000-4000-8000-000000000001','historic','fa230950-0000-4000-8000-000000000002')$$,'historic document metadata needs no financial header or new upload date');
SELECT lives_ok($$SELECT public.archive_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state$$,'unreferenced evidence can still be archived through the checked command');
RESET ROLE;
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id='fa230950-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.restore_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state$$,'55000','financial_writes_frozen','checked document restore observes freeze');
RESET ROLE;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa230950-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.restore_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state$$,'unreferenced evidence can still be restored through the checked command');
RESET ROLE;
SELECT is((SELECT uploaded_at FROM public.documents WHERE id='fa230950-0000-4000-8000-000000000030'),'2020-01-01'::timestamptz,'historical document upload date survives lifecycle enrollment');

-- Separate document-only publication from fixture writes in this transaction.
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-950
 WHERE organization_id='fa230950-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
UPDATE document_revision_before SET revision=(SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001');
SAVEPOINT document_revision_rollback;
UPDATE public.documents SET file_name='rolled-back.pdf' WHERE id='fa230950-0000-4000-8000-000000000030';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001'),(SELECT revision+1 FROM document_revision_before),'document-only legacy rename advances report source stamp');
ROLLBACK TO SAVEPOINT document_revision_rollback;
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001'),(SELECT revision FROM document_revision_before),'rolled-back document change publishes no revision');
SELECT is((SELECT file_name FROM public.documents WHERE id='fa230950-0000-4000-8000-000000000030'),'legacy.pdf','rollback restores document metadata alongside source stamp');
SET LOCAL ROLE authenticated;
SELECT public.archive_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state;
RESET ROLE;
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001'),(SELECT revision+1 FROM document_revision_before),'ordinary archive advances document report source stamp');
UPDATE app_private.financial_report_source_revisions SET last_transaction_id=-951
 WHERE organization_id='fa230950-0000-4000-8000-000000000001' AND last_transaction_id=pg_catalog.txid_current();
DELETE FROM public.documents WHERE id='fa230950-0000-4000-8000-000000000030';
SELECT is((SELECT sum(revision) FROM app_private.financial_report_source_revisions WHERE organization_id='fa230950-0000-4000-8000-000000000001'),(SELECT revision+2 FROM document_revision_before),'permitted legacy removal advances document report source stamp');

-- A real financial reference retains its stronger immutability after reopening.
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
INSERT INTO public.people(id,organization_id,display_name)
VALUES('fa230950-0000-4000-8000-000000000040','fa230950-0000-4000-8000-000000000001','Document evidence owner');
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on)
VALUES('fa230950-0000-4000-8000-000000000041','fa230950-0000-4000-8000-000000000001','fa230950-0000-4000-8000-000000000002','fa230950-0000-4000-8000-000000000040',100,'2026-10-01');
SET LOCAL ROLE authenticated;
SELECT public.restore_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state;
SELECT public.update_document(id,'fa230950-0000-4000-8000-000000000001','owner_opening_balance_evidence','fa230950-0000-4000-8000-000000000002') FROM document_test_state;
RESET ROLE;
INSERT INTO public.owner_opening_balance_requests(
 organization_id,property_id,owner_person_id,property_owner_id,ownership_percent_snapshot,ownership_roster_hash,currency,
 effective_date,component,request_kind,proposed_amount,status,reason,supporting_document_id,evidence_sha256,payload_hash,submitted_by)
SELECT 'fa230950-0000-4000-8000-000000000001','fa230950-0000-4000-8000-000000000002','fa230950-0000-4000-8000-000000000040','fa230950-0000-4000-8000-000000000041',100,repeat('8',64),'USD',
 '2026-10-01','ips_held_owner_cash','initial',0,'submitted','Document lifecycle evidence regression',id,repeat('a',64),repeat('7',64),'fa230950-0000-4000-8000-000000000010'
FROM document_test_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.update_document(id,'fa230950-0000-4000-8000-000000000001','changed','fa230950-0000-4000-8000-000000000002') FROM document_test_state$$,'22023','Financial evidence document is immutable while referenced','checked metadata change cannot alter referenced financial evidence after reopening');
SELECT throws_ok($$SELECT public.archive_document(id,'fa230950-0000-4000-8000-000000000001') FROM document_test_state$$,'22023','Financial evidence document is immutable while referenced','checked archive cannot hide referenced financial evidence after reopening');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
