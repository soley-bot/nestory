BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table(
  'public',
  'tenant_commercial_document_artifacts',
  'commercial document artifacts are first-class immutable records'
);

SELECT has_table(
  'app_private',
  'tenant_commercial_document_upload_attestations',
  'server-computed upload attestations are retained in a private schema'
);

SELECT has_function(
  'public',
  'get_tenant_commercial_document_publication_source',
  ARRAY['uuid', 'text', 'uuid'],
  'publication reads one authoritative Invoice or IPS payment source'
);

SELECT has_function(
  'public',
  'register_tenant_commercial_document_artifact',
  ARRAY['uuid','text','uuid','text','text','bigint','text','text','jsonb'],
  'artifact registration is guarded by one RPC'
);

SELECT has_function(
  'public',
  'attest_tenant_commercial_document_upload',
  ARRAY['uuid','text','uuid','uuid','text','uuid','text','text','bigint'],
  'one service-only RPC records the server-computed byte attestation'
);

SELECT has_function(
  'public',
  'mark_tenant_commercial_document_publication_failed',
  ARRAY['uuid', 'text', 'uuid', 'text'],
  'receipt publication failures are durable and retryable'
);

SELECT has_function(
  'public',
  'get_tenant_commercial_document_artifact_download',
  ARRAY['uuid', 'uuid'],
  'artifact download metadata is resolved through one guarded RPC'
);

SELECT col_is_unique(
  'public',
  'tenant_commercial_document_artifacts',
  ARRAY['organization_id','source_kind','source_id'],
  'each source publishes at most one artifact'
);

SELECT has_column(
  'public',
  'tenant_commercial_document_artifacts',
  'filename',
  'published artifacts retain one server-derived immutable download filename'
);

SELECT has_column(
  'public',
  'tenant_commercial_document_artifacts',
  'storage_object_id',
  'published metadata is bound to a Storage-assigned object identity'
);

SELECT has_column(
  'public',
  'tenant_commercial_document_artifacts',
  'storage_object_version',
  'published metadata is bound to a Storage-assigned object version'
);

SELECT col_is_unique(
  'public',
  'tenant_commercial_document_artifacts',
  ARRAY['storage_object_id'],
  'one Storage object identity cannot back multiple artifacts'
);

SELECT policies_are(
  'public',
  'tenant_commercial_document_artifacts',
  ARRAY['Finance roles can read tenant commercial document artifacts'],
  'artifact rows expose read-only finance access'
);

SELECT ok(
  (
    SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'tenant_commercial_document_artifacts'
  ),
  'artifact authority enables and forces RLS'
);

SELECT ok(
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.tenant_commercial_document_artifacts',
    'SELECT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.tenant_commercial_document_artifacts',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  )
  AND NOT pg_catalog.has_table_privilege(
    'anon',
    'public.tenant_commercial_document_artifacts',
    'SELECT'
  ),
  'authenticated receives SELECT only and anon receives no artifact-table access'
);

SELECT results_eq(
  $$
    SELECT public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'tenant-commercial-documents'
  $$,
  $$VALUES (
    false,
    10485760::bigint,
    ARRAY['application/pdf']::text[]
  )$$,
  'tenant commercial documents use one private PDF-only 10 MiB bucket'
);

SELECT results_eq(
  $$
    SELECT cmd, count(*)::bigint
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE '%tenant commercial document%'
    GROUP BY cmd
    ORDER BY cmd
  $$,
  $$VALUES ('INSERT'::text, 1::bigint), ('SELECT'::text, 1::bigint)$$,
  'commercial-document Storage has create and read policies but no update or delete path'
);

SELECT ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        function.proacl,
        pg_catalog.acldefault('f', function.proowner)
      )
    ) AS privilege
    WHERE function.oid =
      'public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'registration is callable only by authenticated sessions'
);

SELECT ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        function.proacl,
        pg_catalog.acldefault('f', function.proowner)
      )
    ) AS privilege
    WHERE function.oid =
      'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'upload attestation is executable only by service_role'
);

SELECT ok(
  NOT pg_catalog.has_table_privilege(
    'authenticated',
    'app_private.tenant_commercial_document_upload_attestations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
  )
  AND NOT pg_catalog.has_table_privilege(
    'service_role',
    'app_private.tenant_commercial_document_upload_attestations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  'attestation rows cannot be read or altered directly by authenticated or service roles'
);

CREATE TEMP TABLE tenant_commercial_document_test_state (
  invoice_artifact_id uuid,
  receipt_artifact_id uuid
) ON COMMIT DROP;
INSERT INTO tenant_commercial_document_test_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON tenant_commercial_document_test_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'docs-manager-a@example.test',
    extensions.crypt('tenant-doc-test', extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'docs-member-a@example.test',
    extensions.crypt('tenant-doc-test', extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'docs-manager-b@example.test',
    extensions.crypt('tenant-doc-test', extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Document Authority A', 'document-authority-a'),
  ('b0000000-0000-4000-8000-000000000001', 'Document Authority B', 'document-authority-b');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'finance_manager'
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'finance_member'
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'finance_manager'
  );

SELECT pg_catalog.set_config(
  'app.financial_reconciliation_source_context',
  'on',
  true
);

INSERT INTO public.financial_reconciliation_sources (
  id,
  organization_id,
  currency,
  code,
  display_name,
  source_kind,
  scope_kind,
  created_by,
  updated_by
) VALUES (
  'a8000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'USD',
  'OTHER_COLLECTIONS',
  'Other collections fixture',
  'other',
  'organization_pooled',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001'
);

SELECT pg_catalog.set_config(
  'app.financial_reconciliation_source_context',
  'off',
  true
);

SELECT pg_catalog.set_config('app.people_leases_skip_sync', 'on', true);

INSERT INTO public.people (id, organization_id, display_name)
VALUES (
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Tenant Document Fixture'
);

INSERT INTO public.person_roles (organization_id, person_id, role)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'tenant'
);

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, rental_structure
)
VALUES (
  'a4000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Commercial Document Property',
  'DOC-A',
  'apartment',
  'single_space'
);

INSERT INTO public.leases (
  id, organization_id, property_id, primary_tenant_person_id, status
)
VALUES (
  'a5000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'draft'
);

INSERT INTO public.lease_billing_terms (
  id, organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  billing_recipient_kind, billing_recipient_person_id, confirmed_by,
  rule_source
)
VALUES (
  'a6000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  '2026-01-01', '2026-12-31', 'through_ips', 'flat', 0,
  'individual', 'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001', 'lease_default_v1'
);

INSERT INTO public.tenant_invoices (
  id, organization_id, invoice_number, property_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, currency, total_amount, lifecycle, voided_at, voided_by,
  created_by
)
VALUES
  (
    'a7000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'INV-1001',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-01-01', '2026-01-31', '2026-01-01', '2026-01-05',
    'through_ips', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'issued', NULL, NULL,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'INV-VOID-1002',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-02-01', '2026-02-28', '2026-02-01', '2026-02-05',
    'through_ips', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'void',
    '2026-02-02 09:00:00+00',
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'INV-OWNER-1003',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-05',
    'direct_to_owner', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'issued', NULL, NULL,
    'a1000000-0000-4000-8000-000000000001'
  );

INSERT INTO public.tenant_invoice_payments (
  id, organization_id, invoice_id, receipt_number, received_date, amount,
  currency, reconciliation_source_id, reference, created_at, created_by,
  reversal_of_id, reversal_reason
)
VALUES
  (
    'a9000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    'RCP-1001', '2026-01-15', 400, 'USD',
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
        AND code = 'IPS_COLLECTIONS'
    ),
    'IPS transfer',
    '2026-01-15 10:00:00+00',
    'a1000000-0000-4000-8000-000000000001', NULL, NULL
  ),
  (
    'a9000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    'RCP-REV-1002', '2026-01-16', 400, 'USD',
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
        AND code = 'IPS_COLLECTIONS'
    ),
    'IPS reversal',
    '2026-01-16 10:00:00+00',
    'a1000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000001', 'Payment reversed'
  ),
  (
    'a9000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000003',
    'RCP-OWNER-1003', '2026-03-15', 400, 'USD',
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
        AND code = 'IPS_COLLECTIONS'
    ),
    'Invalid direct-owner receipt fixture',
    '2026-03-15 10:00:00+00',
    'a1000000-0000-4000-8000-000000000001', NULL, NULL
  ),
  (
    'a9000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001',
    'RCP-NON-IPS-1004', '2026-01-17', 100, 'USD',
    'a8000000-0000-4000-8000-000000000001',
    'Non-IPS source fixture',
    '2026-01-17 10:00:00+00',
    'a1000000-0000-4000-8000-000000000001', NULL, NULL
  );

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    INSERT INTO storage.objects (id, bucket_id, name, owner_id, metadata, version)
    VALUES
      (
        'c0000000-0000-4000-8000-000000000001',
        'tenant-commercial-documents',
        'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
        'a1000000-0000-4000-8000-000000000001',
        '{"mimetype":"application/pdf","size":1024}'::jsonb,
        'tenant-commercial-document-v1-invoice-current'
      ),
      (
        'c0000000-0000-4000-8000-000000000002',
        'tenant-commercial-documents',
        'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000001/RCP-1001.pdf',
        'a1000000-0000-4000-8000-000000000001',
        '{"mimetype":"application/pdf","size":2048}'::jsonb,
        'tenant-commercial-document-v1-receipt-current'
      ),
      (
        'c0000000-0000-4000-8000-000000000003',
        'tenant-commercial-documents',
        'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000002/INV-VOID-1002.pdf',
        'a1000000-0000-4000-8000-000000000001',
        '{"mimetype":"application/pdf","size":1024}'::jsonb,
        'tenant-commercial-document-v1-invoice-void'
      ),
      (
        'c0000000-0000-4000-8000-000000000004',
        'tenant-commercial-documents',
        'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000002/RCP-REV-1002.pdf',
        'a1000000-0000-4000-8000-000000000001',
        '{"mimetype":"application/pdf","size":2048}'::jsonb,
        'tenant-commercial-document-v1-receipt-reversal'
      ),
      (
        'c0000000-0000-4000-8000-000000000005',
        'tenant-commercial-documents',
        'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000003/RCP-OWNER-1003.pdf',
        'a1000000-0000-4000-8000-000000000001',
        '{"mimetype":"application/pdf","size":2048}'::jsonb,
        'tenant-commercial-document-v1-receipt-direct-owner'
      )
  $$,
  'Finance Manager can upload create-only PDFs inside valid organization/source paths'
);

SELECT is(
  public.get_tenant_commercial_document_publication_source(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000001'
  )->>'document_number',
  'INV-1001',
  'Finance Manager can load the authoritative issued Invoice publication source'
);

SELECT throws_ok(
  $$
    SELECT public.get_tenant_commercial_document_publication_source(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000002'
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a reversal payment is not a normal Receipt publication source'
);

SELECT throws_ok(
  $$
    SELECT public.get_tenant_commercial_document_publication_source(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000003'
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a direct-to-owner payment is not a normal Receipt publication source'
);

SELECT throws_ok(
  $$
    SELECT public.get_tenant_commercial_document_publication_source(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000004'
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a payment outside the IPS reconciliation source is not a Receipt publication source'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'b0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('a', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
      '{"kind":"invoice"}'::jsonb
    )
  $$,
  '42501',
  'tenant_commercial_document_register_forbidden',
  'cross-organization registration fails closed before source lookup'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000002/INV-VOID-1002.pdf',
      repeat('b', 64), 1024, 'commercial-pdf-v1', 'INV-VOID-1002',
      '{"kind":"invoice"}'::jsonb
    )
  $$,
  '23514',
  'tenant_commercial_document_invoice_void',
  'a void Invoice cannot publish a new artifact'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000002/RCP-REV-1002.pdf',
      repeat('c', 64), 2048, 'commercial-pdf-v1', 'RCP-REV-1002',
      '{"kind":"receipt"}'::jsonb
    )
  $$,
  '23514',
  'tenant_commercial_document_payment_reversal',
  'a reversal payment cannot publish a normal Receipt artifact'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000003',
      'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000003/RCP-OWNER-1003.pdf',
      repeat('9', 64), 2048, 'commercial-pdf-v1', 'RCP-OWNER-1003',
      '{"kind":"receipt"}'::jsonb
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a direct-to-owner payment cannot register a normal Receipt artifact'
);

SELECT throws_ok(
  $$
    SELECT public.mark_tenant_commercial_document_publication_failed(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000003',
      'storage_unavailable'
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a direct-to-owner payment cannot create a failed Receipt publication row'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000004',
      'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000004/RCP-NON-IPS-1004.pdf',
      repeat('8', 64), 2048, 'commercial-pdf-v1', 'RCP-NON-IPS-1004',
      '{"kind":"receipt"}'::jsonb
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a non-IPS payment cannot register a normal Receipt artifact'
);

SELECT throws_ok(
  $$
    SELECT public.mark_tenant_commercial_document_publication_failed(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000004',
      'storage_unavailable'
    )
  $$,
  '23503',
  'tenant_commercial_document_source_not_found',
  'a non-IPS payment cannot create a failed Receipt publication row'
);

SELECT throws_ok(
  $$
    SELECT public.mark_tenant_commercial_document_publication_failed(
      'a0000000-0000-4000-8000-000000000001',
      'statement',
      'a9000000-0000-4000-8000-000000000001',
      'storage_unavailable'
    )
  $$,
  '22023',
  'tenant_commercial_document_source_kind_invalid',
  'source kind is restricted to Invoice or Receipt'
);

SELECT throws_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      'c0000000-0000-4000-8000-000000000001',
      'tenant-commercial-document-v1-invoice-current',
      repeat('d', 64),
      1024
    )
  $$,
  '42501', NULL,
  'authenticated finance operators cannot write upload attestations'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('d', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
      '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
    )
  $$,
  '23503',
  'tenant_commercial_document_upload_unattested',
  'an unattested object cannot be registered even with valid Storage metadata'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      'c0000000-0000-4000-8000-000000000001',
      'tenant-commercial-document-v1-invoice-current',
      repeat('d', 64),
      1024
    )
  $$,
  'service_role can attest the server-computed Invoice byte hash'
);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

UPDATE tenant_commercial_document_test_state
SET invoice_artifact_id = public.register_tenant_commercial_document_artifact(
  'a0000000-0000-4000-8000-000000000001',
  'invoice',
  'a7000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
  repeat('d', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
  '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
);

SELECT results_eq(
  $$
    SELECT filename, storage_object_id, storage_object_version
    FROM public.tenant_commercial_document_artifacts
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  $$VALUES (
    'invoice-INV-1001.pdf'::text,
    'c0000000-0000-4000-8000-000000000001'::uuid,
    'tenant-commercial-document-v1-invoice-current'::text
  )$$,
  'registration persists the Storage-assigned object identity and version'
);

UPDATE tenant_commercial_document_test_state
SET receipt_artifact_id = public.mark_tenant_commercial_document_publication_failed(
  'a0000000-0000-4000-8000-000000000001',
  'receipt',
  'a9000000-0000-4000-8000-000000000001',
  'storage_unavailable'
);

SELECT results_eq(
  $$
    SELECT publication_status, failure_message, filename, storage_path
    FROM public.tenant_commercial_document_artifacts
    WHERE id = (
      SELECT receipt_artifact_id
      FROM tenant_commercial_document_test_state
    )
  $$,
  $$VALUES (
    'failed'::text,
    'storage_unavailable'::text,
    NULL::text,
    NULL::text
  )$$,
  'a failed Receipt publication persists no false artifact metadata'
);

SELECT is(
  public.mark_tenant_commercial_document_publication_failed(
    'a0000000-0000-4000-8000-000000000001',
    'receipt',
    'a9000000-0000-4000-8000-000000000001',
    'retry_storage_unavailable'
  ),
  (SELECT receipt_artifact_id FROM tenant_commercial_document_test_state),
  'a repeated failed Receipt publication preserves the same source row'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'receipt',
      'a9000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000001/RCP-1001.pdf',
      'c0000000-0000-4000-8000-000000000002',
      'tenant-commercial-document-v1-receipt-current',
      repeat('e', 64),
      2048
    )
  $$,
  'service_role can attest the server-computed Receipt byte hash for retry'
);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT is(
  public.register_tenant_commercial_document_artifact(
    'a0000000-0000-4000-8000-000000000001',
    'receipt',
    'a9000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001/receipt/a9000000-0000-4000-8000-000000000001/RCP-1001.pdf',
    repeat('e', 64), 2048, 'commercial-pdf-v1', 'RCP-1001',
    '{"kind":"receipt","amount":"400.00"}'::jsonb
  ),
  (SELECT receipt_artifact_id FROM tenant_commercial_document_test_state),
  'a guarded retry promotes the same failed source row to published'
);

SELECT is(
  public.register_tenant_commercial_document_artifact(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
    repeat('d', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
    '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
  ),
  (SELECT invoice_artifact_id FROM tenant_commercial_document_test_state),
  'an exact duplicate registration returns the original artifact ID'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('f', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
      '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
    )
  $$,
  '22023',
  'tenant_commercial_document_artifact_conflict',
  'a different digest cannot replay an existing artifact registration'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_commercial_document_artifacts
  ),
  2,
  'Finance Member can read published artifacts in its organization'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM storage.objects
    WHERE bucket_id = 'tenant-commercial-documents'
  ),
  2,
  'Finance Member can read only registered objects in its organization'
);

SELECT results_eq(
  $$
    SELECT source_kind, document_number, filename, publication_status, source_state
    FROM public.get_tenant_commercial_document_artifact_download(
      'a0000000-0000-4000-8000-000000000001',
      (SELECT receipt_artifact_id FROM tenant_commercial_document_test_state)
    )
  $$,
  $$VALUES (
    'receipt'::text,
    'RCP-1001'::text,
    'receipt-RCP-1001.pdf'::text,
    'published'::text,
    'reversed'::text
  )$$,
  'Finance Member download metadata preserves the original Receipt and exposes its reversed source state'
);

RESET ROLE;
UPDATE storage.objects
SET version = 'tenant-commercial-document-v1-receipt-replaced'
WHERE id = 'c0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM storage.objects
    WHERE id = 'c0000000-0000-4000-8000-000000000002'
  ),
  0,
  'Storage SELECT hides an object whose version no longer matches registration'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.get_tenant_commercial_document_artifact_download(
      'a0000000-0000-4000-8000-000000000001',
      (SELECT receipt_artifact_id FROM tenant_commercial_document_test_state)
    )
  $$,
  '40001',
  'tenant_commercial_document_storage_object_changed',
  'download fails closed when the Storage object version no longer matches registration'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('d', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
      '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
    )
  $$,
  '42501',
  'tenant_commercial_document_register_forbidden',
  'Finance Member cannot publish or retry a commercial document'
);

SELECT throws_ok(
  $$
    INSERT INTO public.tenant_commercial_document_artifacts (
      organization_id, source_kind, source_id, document_number,
      publication_status, failure_message
    ) VALUES (
      'a0000000-0000-4000-8000-000000000001',
      'invoice', gen_random_uuid(), 'INV-DIRECT', 'failed', 'direct_write'
    )
  $$,
  '42501', NULL,
  'authenticated direct INSERT is denied'
);

SELECT throws_ok(
  $$
    UPDATE public.tenant_commercial_document_artifacts
    SET failure_message = 'direct_update'
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  '42501', NULL,
  'authenticated direct UPDATE is denied'
);

SELECT throws_ok(
  $$
    DELETE FROM public.tenant_commercial_document_artifacts
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  '42501', NULL,
  'authenticated direct DELETE is denied'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_commercial_document_artifacts
  ),
  0,
  'cross-organization artifact rows are invisible'
);

SELECT is(
  app_private.is_tenant_commercial_document_registered(
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
    'c0000000-0000-4000-8000-000000000001',
    'tenant-commercial-document-v1-invoice-current'
  ),
  false,
  'the Storage registration helper does not reveal cross-organization artifact identity'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.get_tenant_commercial_document_artifact_download(
      'a0000000-0000-4000-8000-000000000001',
      (SELECT invoice_artifact_id FROM tenant_commercial_document_test_state)
    )
  $$,
  '42501',
  'tenant_commercial_document_download_forbidden',
  'cross-organization download resolution fails closed'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      activity.action,
      activity.new_values->>'source_kind',
      activity.new_values->>'source_id',
      activity.new_values->>'artifact_id',
      activity.new_values->>'publication_status'
    FROM public.activity_logs AS activity
    WHERE activity.organization_id = 'a0000000-0000-4000-8000-000000000001'
      AND activity.entity_type = 'tenant_commercial_document_artifact'
    ORDER BY activity.action
  $$,
  $$VALUES
    (
      'tenant_invoice_pdf_published'::text,
      'invoice'::text,
      'a7000000-0000-4000-8000-000000000001'::text,
      (SELECT invoice_artifact_id::text FROM tenant_commercial_document_test_state),
      'published'::text
    ),
    (
      'tenant_receipt_pdf_publication_failed'::text,
      'receipt'::text,
      'a9000000-0000-4000-8000-000000000001'::text,
      (SELECT receipt_artifact_id::text FROM tenant_commercial_document_test_state),
      'failed'::text
    ),
    (
      'tenant_receipt_pdf_publication_retried'::text,
      'receipt'::text,
      'a9000000-0000-4000-8000-000000000001'::text,
      (SELECT receipt_artifact_id::text FROM tenant_commercial_document_test_state),
      'published'::text
    ),
    (
      'tenant_receipt_pdf_publication_retry_failed'::text,
      'receipt'::text,
      'a9000000-0000-4000-8000-000000000001'::text,
      (SELECT receipt_artifact_id::text FROM tenant_commercial_document_test_state),
      'failed'::text
    )
  $$,
  'first publish, failed publication, and retry success write concise atomic activity evidence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.activity_logs AS activity
    WHERE activity.entity_type = 'tenant_commercial_document_artifact'
      AND activity.new_values ?| ARRAY[
        'storage_path',
        'sha256',
        'presentation_snapshot',
        'failure_message',
        'payment_instructions',
        'stack_trace'
      ]
  ),
  0,
  'commercial-document activity excludes sensitive publication payloads and stack traces'
);

SELECT throws_ok(
  $$
    UPDATE public.tenant_commercial_document_artifacts
    SET renderer_version = 'mutated-v2'
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  '42501',
  'tenant_commercial_document_artifact_immutable',
  'even the table owner cannot mutate a published artifact outside the guarded path'
);

SELECT throws_ok(
  $$
    UPDATE public.tenant_commercial_document_artifacts
    SET filename = 'client-controlled.pdf'
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  '42501',
  'tenant_commercial_document_artifact_immutable',
  'the server-derived published filename is immutable'
);

SELECT throws_ok(
  $$
    DELETE FROM public.tenant_commercial_document_artifacts
    WHERE id = (
      SELECT invoice_artifact_id FROM tenant_commercial_document_test_state
    )
  $$,
  '42501',
  'tenant_commercial_document_artifact_immutable',
  'published artifacts cannot be deleted'
);

SELECT * FROM finish();
ROLLBACK;
