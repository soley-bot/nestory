BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

CREATE TEMP TABLE report_document_snapshot_test_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO report_document_snapshot_test_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('report-document-snapshot-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
FROM (
  SELECT admin_id, 'report-snapshot-admin-' || admin_id::text || '@example.test'
  FROM report_document_snapshot_test_state
  UNION ALL
  SELECT member_id, 'report-snapshot-member-' || member_id::text || '@example.test'
  FROM report_document_snapshot_test_state
) AS fixture_users(user_id, email);

INSERT INTO public.organizations (id, name, slug)
SELECT
  organization_id,
  'Report snapshot test',
  'report-snapshot-' || left(organization_id::text, 8)
FROM report_document_snapshot_test_state
UNION ALL
SELECT
  cross_organization_id,
  'Report snapshot cross test',
  'report-snapshot-cross-' || left(cross_organization_id::text, 8)
FROM report_document_snapshot_test_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM report_document_snapshot_test_state
UNION ALL
SELECT organization_id, member_id, 'finance_member'
FROM report_document_snapshot_test_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Report snapshot property',
  'RSP-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM report_document_snapshot_test_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Report snapshot cross property',
  'RSC-' || left(cross_property_id::text, 8),
  'apartment',
  'active'
FROM report_document_snapshot_test_state;

INSERT INTO public.documents (
  id,
  organization_id,
  property_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  archived_at
)
SELECT
  'f3900000-0000-4000-8000-000000000001'::uuid,
  organization_id,
  property_id,
  'other',
  'a-active.pdf',
  organization_id::text || '/a-active.pdf',
  'application/pdf',
  1,
  NULL::timestamptz
FROM report_document_snapshot_test_state
UNION ALL
SELECT
  'f3900000-0000-4000-8000-000000000002'::uuid,
  organization_id,
  property_id,
  'other',
  'b-active.pdf',
  organization_id::text || '/b-active.pdf',
  'application/pdf',
  1,
  NULL::timestamptz
FROM report_document_snapshot_test_state
UNION ALL
SELECT
  'f3900000-0000-4000-8000-000000000003'::uuid,
  organization_id,
  property_id,
  'other',
  'archived.pdf',
  organization_id::text || '/archived.pdf',
  'application/pdf',
  1,
  now()
FROM report_document_snapshot_test_state
UNION ALL
SELECT
  'f3900000-0000-4000-8000-000000000004'::uuid,
  cross_organization_id,
  cross_property_id,
  'other',
  'cross.pdf',
  cross_organization_id::text || '/cross.pdf',
  'application/pdf',
  1,
  NULL::timestamptz
FROM report_document_snapshot_test_state;

SELECT has_function(
  'public',
  'get_report_documents_snapshot',
  ARRAY['uuid'],
  'trusted reports have one atomic organization-document snapshot RPC'
);
SELECT function_privs_are(
  'public',
  'get_report_documents_snapshot',
  ARRAY['uuid'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated callers can execute the RLS-scoped snapshot RPC'
);
SELECT function_privs_are(
  'public',
  'get_report_documents_snapshot',
  ARRAY['uuid'],
  'anon',
  ARRAY[]::text[],
  'anonymous callers cannot execute the snapshot RPC'
);
SELECT function_privs_are(
  'public',
  'get_report_documents_snapshot',
  ARRAY['uuid'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot bypass user-scoped document evidence through the snapshot RPC'
);
SELECT ok(
  NOT (
    SELECT prosecdef
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.get_report_documents_snapshot(uuid)'::regprocedure
  ),
  'the snapshot RPC is security invoker and retains document RLS'
);
SELECT ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.get_report_documents_snapshot(uuid)'::regprocedure
    ),
    'AS MATERIALIZED'
  ) = 0,
  'the bounded snapshot payload does not materialize the full active population'
);

GRANT SELECT ON report_document_snapshot_test_state TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM report_document_snapshot_test_state),
  true
);

SELECT is(
  (
    public.get_report_documents_snapshot(
      (SELECT organization_id FROM report_document_snapshot_test_state)
    ) ->> 'count'
  )::integer,
  2,
  'admin snapshot includes active organization-wide documents only'
);
SELECT is(
  public.get_report_documents_snapshot(
    (SELECT organization_id FROM report_document_snapshot_test_state)
  ) #>> '{documents,0,file_name}',
  'a-active.pdf',
  'snapshot documents are ordered deterministically by ID'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM report_document_snapshot_test_state),
  true
);
SELECT is(
  (
    public.get_report_documents_snapshot(
      (SELECT organization_id FROM report_document_snapshot_test_state)
    ) ->> 'count'
  )::integer,
  0,
  'non-admin callers receive no document rows through existing RLS'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
