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

SELECT has_table(
  'app_private',
  'tenant_commercial_document_cleanup_claims',
  'orphan cleanup authority is retained in a private claim table'
);

SELECT has_column(
  'app_private',
  'tenant_commercial_document_cleanup_claims',
  'id',
  'cleanup claims have a durable resume identity'
);

SELECT has_function(
  'public',
  'begin_tenant_commercial_document_cleanup',
  ARRAY['uuid','text','uuid','text','uuid','text'],
  'service cleanup atomically claims one exact source object'
);

SELECT function_returns(
  'public',
  'begin_tenant_commercial_document_cleanup',
  ARRAY['uuid','text','uuid','text','uuid','text'],
  'uuid',
  'cleanup begin returns a durable claim identity'
);

SELECT has_function(
  'public',
  'finish_tenant_commercial_document_cleanup',
  ARRAY['uuid','text','uuid','text','uuid','text','uuid'],
  'service cleanup finishes only after the exact claimed object is gone'
);

SELECT has_trigger(
  'storage',
  'objects',
  'guard_tenant_commercial_document_storage_object',
  'tenant commercial document Storage mutation requires an exact cleanup claim'
);

SELECT ok(
  COALESCE((
    SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'app_private'
      AND relation.relname = 'tenant_commercial_document_cleanup_claims'
  ), false),
  'cleanup claims enable and force RLS'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.table_privileges AS privilege
    WHERE privilege.table_schema = 'app_private'
      AND privilege.table_name = 'tenant_commercial_document_cleanup_claims'
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ),
  0,
  'cleanup claims expose no direct Data API table privilege'
);

SELECT ok(
  (
    SELECT count(*) FILTER (
      WHERE privilege.grantee = 'service_role'
    ) = 2
    AND count(*) FILTER (
      WHERE privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) = 0
    FROM information_schema.routine_privileges AS privilege
    WHERE privilege.specific_schema = 'public'
      AND privilege.routine_name IN (
        'begin_tenant_commercial_document_cleanup',
        'finish_tenant_commercial_document_cleanup'
      )
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'cleanup claim RPCs are executable only by service_role'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_proc AS function
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = function.pronamespace
    WHERE namespace.nspname = 'public'
      AND function.proname IN (
        'attest_tenant_commercial_document_upload',
        'register_tenant_commercial_document_artifact',
        'mark_tenant_commercial_document_publication_failed',
        'begin_tenant_commercial_document_cleanup',
        'finish_tenant_commercial_document_cleanup'
      )
      AND pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(function.oid),
        'tenant_commercial_document_source_v1'
      ) > 0
  ),
  5,
  'attestation, registration, failure, and cleanup use the same source lock key'
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
  ARRAY[
    'uuid','text','uuid','uuid','text','uuid','text','text','bigint','text','jsonb'
  ],
  'one service-only RPC binds bytes, renderer, and presentation snapshot'
);

SELECT has_column(
  'app_private',
  'tenant_commercial_document_upload_attestations',
  'renderer_version',
  'upload attestation binds the trusted renderer version'
);

SELECT has_column(
  'app_private',
  'tenant_commercial_document_upload_attestations',
  'presentation_snapshot_sha256',
  'upload attestation binds the canonical presentation snapshot hash'
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
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)',
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
      'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)'::regprocedure
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
  receipt_artifact_id uuid,
  cleanup_claim_id text,
  replacement_cleanup_claim_id text
) ON COMMIT DROP;
INSERT INTO tenant_commercial_document_test_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON tenant_commercial_document_test_state TO authenticated, service_role;

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
  ),
  (
    'a7000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    '__A',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-04-01', '2026-04-30', '2026-04-01', '2026-04-05',
    'through_ips', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'issued', NULL, NULL,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001',
    'INV-CLEAN-1005',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-05-01', '2026-05-31', '2026-05-01', '2026-05-05',
    'through_ips', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'issued', NULL, NULL,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000001',
    'INV-CLEAN-1006',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-06-01', '2026-06-30', '2026-06-01', '2026-06-05',
    'through_ips', 'individual',
    'a3000000-0000-4000-8000-000000000001',
    'Tenant Document Fixture', 'USD', 1000, 'issued', NULL, NULL,
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a7000000-0000-4000-8000-000000000007',
    'a0000000-0000-4000-8000-000000000001',
    'INV-CLEAN-1007',
    'a4000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    '2026-07-01', '2026-07-31', '2026-07-01', '2026-07-05',
    'through_ips', 'individual',
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

SELECT is(
  public.get_tenant_commercial_document_publication_source(
    'a0000000-0000-4000-8000-000000000001',
    'receipt',
    'a9000000-0000-4000-8000-000000000001'
  )->'payment'->>'amount_previously_paid',
  '0.00',
  'the first Receipt publication source preserves exact two-decimal money'
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
      1024,
      'commercial-pdf-v1',
      '{"paymentInstructions":"Bank transfer","kind":"invoice"}'::jsonb
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
      1024,
      'commercial-pdf-v1',
      '{"paymentInstructions":"Bank transfer","kind":"invoice"}'::jsonb
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

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('d', 64), 1024, 'commercial-pdf-v2', 'INV-1001',
      '{"kind":"invoice","paymentInstructions":"Bank transfer"}'::jsonb
    )
  $$,
  '22023',
  'tenant_commercial_document_upload_attestation_mismatch',
  'registration rejects a renderer version not bound by service attestation'
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
      repeat('d', 64), 1024, 'commercial-pdf-v1', 'INV-1001',
      '{"kind":"invoice","paymentInstructions":"Wire to forged account"}'::jsonb
    )
  $$,
  '22023',
  'tenant_commercial_document_upload_attestation_mismatch',
  'registration rejects presentation claims not bound by service attestation'
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

SELECT throws_ok(
  $$
    SELECT *
    FROM public.get_tenant_commercial_document_artifact_download(
      'a0000000-0000-4000-8000-000000000001',
      (SELECT receipt_artifact_id FROM tenant_commercial_document_test_state)
    )
  $$,
  '55000',
  'tenant_commercial_document_artifact_not_published',
  'download metadata rejects failed publications with null integrity fields'
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
      2048,
      'commercial-pdf-v1',
      '{"amount":"400.00","kind":"receipt"}'::jsonb
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
-- Simulate out-of-band metadata replacement while keeping the production
-- trigger's normal UPDATE denial covered below.
SET LOCAL session_replication_role = replica;
UPDATE storage.objects
SET version = 'tenant-commercial-document-v1-receipt-replaced'
WHERE id = 'c0000000-0000-4000-8000-000000000002';
SET LOCAL session_replication_role = origin;
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

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    INSERT INTO storage.objects (
      id, bucket_id, name, owner_id, metadata, version
    ) VALUES (
      'c0000000-0000-4000-8000-000000000006',
      'tenant-commercial-documents',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000004/A.pdf',
      'a1000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/pdf","size":512}'::jsonb,
      'tenant-commercial-document-v1-invoice-short-safe-number'
    )
  $$,
  'Storage accepts a one-character basename derived from an authoritative number'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000004',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000004/A.pdf',
      'c0000000-0000-4000-8000-000000000006',
      'tenant-commercial-document-v1-invoice-short-safe-number',
      repeat('7', 64),
      512,
      'commercial-pdf-v1',
      '{"kind":"invoice","edge":"short-safe-number"}'::jsonb
    )
  $$,
  'service attestation accepts the exact one-character sanitized object path'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000004',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000004/A.pdf',
      repeat('7', 64), 512, 'commercial-pdf-v1', '__A',
      '{"edge":"short-safe-number","kind":"invoice"}'::jsonb
    )
  $$,
  'registration accepts a one-character server-derived safe number'
);

SELECT results_eq(
  $$
    SELECT artifact.filename, artifact.storage_path
    FROM public.tenant_commercial_document_artifacts AS artifact
    WHERE artifact.organization_id = 'a0000000-0000-4000-8000-000000000001'
      AND artifact.source_kind = 'invoice'
      AND artifact.source_id = 'a7000000-0000-4000-8000-000000000004'
  $$,
  $$VALUES (
    'invoice-A.pdf'::text,
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000004/A.pdf'::text
  )$$,
  'registration derives a consistent immutable filename from the short safe number'
);

RESET ROLE;

INSERT INTO storage.objects (
  id, bucket_id, name, owner_id, metadata, version
) VALUES
  (
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-documents',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'a1000000-0000-4000-8000-000000000001',
    '{"mimetype":"application/pdf","size":768}'::jsonb,
    'tenant-commercial-document-cleanup-v1'
  ),
  (
    'c0000000-0000-4000-8000-000000000008',
    'tenant-commercial-documents',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000006/INV-CLEAN-1006.pdf',
    'a1000000-0000-4000-8000-000000000001',
    '{"mimetype":"application/pdf","size":800}'::jsonb,
    'tenant-commercial-document-cleanup-v1-other-source'
  ),
  (
    'c0000000-0000-4000-8000-000000000010',
    'tenant-commercial-documents',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
    'a1000000-0000-4000-8000-000000000001',
    '{"mimetype":"application/pdf","size":820}'::jsonb,
    'tenant-commercial-document-cleanup-replaced-old'
  );

INSERT INTO app_private.tenant_commercial_document_upload_attestations (
  organization_id, source_kind, source_id, storage_path, storage_object_id,
  storage_object_version, size_bytes, sha256, renderer_version,
  presentation_snapshot_sha256, attested_by
) VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'invoice',
  'a7000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000006/INV-CLEAN-1006.pdf',
  'c0000000-0000-4000-8000-000000000099',
  'stale-object-version',
  800,
  repeat('9', 64),
  'commercial-pdf-v1',
  app_private.tenant_commercial_document_snapshot_sha256(
    '{"kind":"invoice","cleanup":"stale"}'::jsonb
  ),
  'a1000000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
SELECT pg_catalog.set_config('storage.allow_delete_query', 'true', true);

SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
      'c0000000-0000-4000-8000-000000000007',
      'tenant-commercial-document-cleanup-v1',
      repeat('8', 64),
      768,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"candidate"}'::jsonb
    )
  $$,
  'cleanup candidate has an exact unconsumed service attestation'
);

SELECT throws_ok(
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'tenant-commercial-documents'
      AND id = 'c0000000-0000-4000-8000-000000000007'
  $$,
  '42501',
  'tenant_commercial_document_storage_delete_forbidden',
  'service Storage deletion without an exact cleanup claim is denied'
);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000099',
    'tenant-commercial-document-cleanup-v1'
  )::text,
  NULL::text,
  'cleanup cannot claim a path with a mismatched Storage object identity'
);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000001/INV-1001.pdf',
    'c0000000-0000-4000-8000-000000000001',
    'tenant-commercial-document-v1-invoice-current'
  )::text,
  NULL::text,
  'cleanup cannot claim an object backing a published artifact'
);

SELECT throws_ok(
  $$
    SELECT public.begin_tenant_commercial_document_cleanup(
      'b0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
      'c0000000-0000-4000-8000-000000000007',
      'tenant-commercial-document-cleanup-v1'
    )
  $$,
  '22023',
  'tenant_commercial_document_cleanup_invalid',
  'cleanup rejects a cross-organization source and path combination'
);

SELECT throws_ok(
  $$
    SELECT public.begin_tenant_commercial_document_cleanup(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000006',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
      'c0000000-0000-4000-8000-000000000007',
      'tenant-commercial-document-cleanup-v1'
    )
  $$,
  '22023',
  'tenant_commercial_document_cleanup_invalid',
  'cleanup rejects a cross-source path combination'
);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000006/INV-CLEAN-1006.pdf',
    'c0000000-0000-4000-8000-000000000008',
    'tenant-commercial-document-cleanup-v1-other-source'
  )::text,
  NULL::text,
  'cleanup rejects a current object whose existing attestation binds stale identity'
);

UPDATE tenant_commercial_document_test_state
SET cleanup_claim_id = public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1'
  )::text;

SELECT ok(
  (SELECT cleanup_claim_id
   FROM tenant_commercial_document_test_state) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'the first cleanup worker receives a durable claim UUID'
);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1'
  )::text,
  (SELECT cleanup_claim_id FROM tenant_commercial_document_test_state),
  'a crash-resume begin returns the same exact durable claim UUID'
);

SELECT is(
  public.finish_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1',
    (SELECT cleanup_claim_id::uuid
     FROM tenant_commercial_document_test_state)
  ),
  false,
  'finish fails closed while the exact claimed Storage object still exists'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_cleanup_claims
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005'),
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_upload_attestations
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005'
         AND consumed_at IS NULL)
  $$,
  $$VALUES (1, 1)$$,
  'failed finish preserves both the cleanup claim and unconsumed attestation'
);

-- Simulate an authoritative number correction while the old exact object is
-- durably claimed, then stage the replacement path Task 3 would publish.
SET LOCAL session_replication_role = replica;
UPDATE public.tenant_invoices
SET invoice_number = 'INV-CLEAN-1005-RENAMED'
WHERE id = 'a7000000-0000-4000-8000-000000000005';
SET LOCAL session_replication_role = origin;

INSERT INTO storage.objects (
  id, bucket_id, name, owner_id, metadata, version
) VALUES (
  'c0000000-0000-4000-8000-000000000009',
  'tenant-commercial-documents',
  'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
  'a1000000-0000-4000-8000-000000000001',
  '{"mimetype":"application/pdf","size":900}'::jsonb,
  'tenant-commercial-document-cleanup-v2-renamed'
);

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1'
  )::text,
  (SELECT cleanup_claim_id FROM tenant_commercial_document_test_state),
  'the exact old cleanup claim remains resumable after an authoritative number change'
);

SELECT is(
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
    'c0000000-0000-4000-8000-000000000009',
    'tenant-commercial-document-cleanup-v2-renamed'
  )::text,
  NULL::text,
  'a different object and path cannot steal or resume an active source claim'
);

SELECT throws_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
      'c0000000-0000-4000-8000-000000000009',
      'tenant-commercial-document-cleanup-v2-renamed',
      repeat('b', 64),
      900,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"replacement"}'::jsonb
    )
  $$,
  '55000',
  'tenant_commercial_document_cleanup_in_progress',
  'an active source claim blocks attestation after an authoritative path change'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT throws_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
      repeat('b', 64), 900, 'commercial-pdf-v1', 'INV-CLEAN-1005-RENAMED',
      '{"kind":"invoice","cleanup":"replacement"}'::jsonb
    )
  $$,
  '55000',
  'tenant_commercial_document_cleanup_in_progress',
  'an active source claim blocks registration after an authoritative path change'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer
       FROM public.tenant_commercial_document_artifacts
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005'),
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_upload_attestations
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005'
         AND consumed_at IS NULL)
  $$,
  $$VALUES (0, 1)$$,
  'blocked registration inserts no artifact and consumes no attestation'
);

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000006',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000006/INV-CLEAN-1006.pdf',
      'c0000000-0000-4000-8000-000000000008',
      'tenant-commercial-document-cleanup-v1-other-source',
      repeat('a', 64),
      800,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"other-source"}'::jsonb
    )
  $$,
  'a cleanup claim does not block attestation for another source'
);

SELECT throws_ok(
  $$
    UPDATE storage.objects
    SET version = 'tenant-commercial-document-cleanup-mutated'
    WHERE bucket_id = 'tenant-commercial-documents'
      AND id = 'c0000000-0000-4000-8000-000000000007'
  $$,
  '42501',
  'tenant_commercial_document_storage_update_forbidden',
  'tenant commercial document objects cannot be updated even with a cleanup claim'
);

SELECT lives_ok(
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'tenant-commercial-documents'
      AND id = 'c0000000-0000-4000-8000-000000000007'
      AND version = 'tenant-commercial-document-cleanup-v1'
  $$,
  'service Storage deletion succeeds only for the exact claimed object identity and version'
);

SELECT is(
  public.finish_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1',
    'd0000000-0000-4000-8000-000000000001'
  ),
  false,
  'finish with the wrong cleanup claim UUID preserves the exact durable claim'
);

SELECT is(
  public.finish_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005.pdf',
    'c0000000-0000-4000-8000-000000000007',
    'tenant-commercial-document-cleanup-v1',
    (SELECT cleanup_claim_id::uuid
     FROM tenant_commercial_document_test_state)
  ),
  true,
  'finish removes cleanup authority only after the exact claimed object is gone'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_cleanup_claims
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005'),
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_upload_attestations
       WHERE source_id = 'a7000000-0000-4000-8000-000000000005')
  $$,
  $$VALUES (0, 0)$$,
  'successful finish removes the exact claim and unconsumed attestation'
);

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
      'c0000000-0000-4000-8000-000000000009',
      'tenant-commercial-document-cleanup-v2-renamed',
      repeat('b', 64),
      900,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"replacement"}'::jsonb
    )
  $$,
  'attestation can resume on the replacement path after exact cleanup finishes'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000005',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf',
      repeat('b', 64), 900, 'commercial-pdf-v1', 'INV-CLEAN-1005-RENAMED',
      '{"kind":"invoice","cleanup":"replacement"}'::jsonb
    )
  $$,
  'publication can proceed on the authoritative replacement path after cleanup finishes'
);

SELECT results_eq(
  $$
    SELECT artifact.filename, artifact.storage_path, artifact.publication_status
    FROM public.tenant_commercial_document_artifacts AS artifact
    WHERE artifact.source_id = 'a7000000-0000-4000-8000-000000000005'
  $$,
  $$VALUES (
    'invoice-INV-CLEAN-1005-RENAMED.pdf'::text,
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000005/INV-CLEAN-1005-RENAMED.pdf'::text,
    'published'::text
  )$$,
  'post-cleanup publication persists the new authoritative artifact'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000007',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
      'c0000000-0000-4000-8000-000000000010',
      'tenant-commercial-document-cleanup-replaced-old',
      repeat('c', 64),
      820,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"replaced-old"}'::jsonb
    )
  $$,
  'the original same-path object receives an exact unconsumed attestation'
);

UPDATE tenant_commercial_document_test_state
SET replacement_cleanup_claim_id =
  public.begin_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000007',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
    'c0000000-0000-4000-8000-000000000010',
    'tenant-commercial-document-cleanup-replaced-old'
  )::text;

SELECT ok(
  (SELECT replacement_cleanup_claim_id
   FROM tenant_commercial_document_test_state) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'same-path replacement cleanup begins with a durable exact claim'
);

RESET ROLE;
-- Simulate an out-of-band provider replacement at the claimed path without
-- weakening the production trigger, as in the existing changed-object test.
SET LOCAL session_replication_role = replica;
UPDATE storage.objects
SET id = 'c0000000-0000-4000-8000-000000000011',
    metadata = '{"mimetype":"application/pdf","size":821}'::jsonb,
    version = 'tenant-commercial-document-cleanup-replaced-new'
WHERE bucket_id = 'tenant-commercial-documents'
  AND name = 'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf'
  AND id = 'c0000000-0000-4000-8000-000000000010'
  AND version = 'tenant-commercial-document-cleanup-replaced-old';
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT is(
  public.finish_tenant_commercial_document_cleanup(
    'a0000000-0000-4000-8000-000000000001',
    'invoice',
    'a7000000-0000-4000-8000-000000000007',
    'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
    'c0000000-0000-4000-8000-000000000010',
    'tenant-commercial-document-cleanup-replaced-old',
    (SELECT replacement_cleanup_claim_id::uuid
     FROM tenant_commercial_document_test_state)
  ),
  true,
  'finish succeeds when the claimed path now resolves to a different object identity and version'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_cleanup_claims
       WHERE source_id = 'a7000000-0000-4000-8000-000000000007'),
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_upload_attestations
       WHERE source_id = 'a7000000-0000-4000-8000-000000000007'),
      (SELECT count(*)::integer
       FROM storage.objects
       WHERE bucket_id = 'tenant-commercial-documents'
         AND name = 'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf'
         AND id = 'c0000000-0000-4000-8000-000000000011'
         AND version = 'tenant-commercial-document-cleanup-replaced-new'),
      (SELECT count(*)::integer
       FROM app_private.tenant_commercial_document_upload_attestations
       WHERE source_id = 'a7000000-0000-4000-8000-000000000006')
  $$,
  $$VALUES (0, 0, 1, 1)$$,
  'finish clears only the old attestation and claim while preserving the replacement and unrelated attestation'
);

SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT lives_ok(
  $$
    SELECT public.attest_tenant_commercial_document_upload(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000007',
      'a1000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
      'c0000000-0000-4000-8000-000000000011',
      'tenant-commercial-document-cleanup-replaced-new',
      repeat('d', 64),
      821,
      'commercial-pdf-v1',
      '{"kind":"invoice","cleanup":"replaced-new"}'::jsonb
    )
  $$,
  'normal authority can attest the replacement object after exact cleanup finishes'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT public.register_tenant_commercial_document_artifact(
      'a0000000-0000-4000-8000-000000000001',
      'invoice',
      'a7000000-0000-4000-8000-000000000007',
      'a0000000-0000-4000-8000-000000000001/invoice/a7000000-0000-4000-8000-000000000007/INV-CLEAN-1007.pdf',
      repeat('d', 64), 821, 'commercial-pdf-v1', 'INV-CLEAN-1007',
      '{"kind":"invoice","cleanup":"replaced-new"}'::jsonb
    )
  $$,
  'normal publication authority can register the replacement object after cleanup finishes'
);

SELECT results_eq(
  $$
    SELECT artifact.storage_object_id, artifact.storage_object_version,
           artifact.publication_status
    FROM public.tenant_commercial_document_artifacts AS artifact
    WHERE artifact.source_id = 'a7000000-0000-4000-8000-000000000007'
  $$,
  $$VALUES (
    'c0000000-0000-4000-8000-000000000011'::uuid,
    'tenant-commercial-document-cleanup-replaced-new'::text,
    'published'::text
  )$$,
  'post-cleanup publication binds the preserved same-path replacement identity and version'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

SELECT throws_ok(
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'tenant-commercial-documents'
      AND id = 'c0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'tenant_commercial_document_storage_delete_forbidden',
  'a published tenant commercial document object remains immutable'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
