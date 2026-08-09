BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_column(
  'public',
  'documents',
  'content_sha256',
  'documents store a nullable content SHA-256 fingerprint'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'content_sha256'
      AND data_type = 'text'
      AND is_nullable = 'YES'
  ),
  'content_sha256 remains nullable for deliberately unfingerprinted legacy rows'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.documents')
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%content_sha256%^[0-9a-f]{64}$%'
  ),
  'document fingerprints accept only lowercase 64-hex SHA-256 values'
);

SELECT is(
  (
    SELECT jsonb_agg(
      jsonb_build_array(procedure.proname, pg_get_function_identity_arguments(procedure.oid))
      ORDER BY procedure.proname, pg_get_function_identity_arguments(procedure.oid)
    )
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'create_document',
        'discard_unreferenced_document_upload',
        'fingerprint_document_content',
        'update_document'
      )
  ),
  '[
    ["create_document", "p_organization_id uuid, p_category text, p_file_name text, p_storage_path text, p_mime_type text, p_size_bytes bigint, p_content_sha256 text, p_property_id uuid, p_unit_id uuid, p_lease_id uuid, p_timeline_event_id uuid, p_ledger_entry_id uuid, p_task_id uuid, p_tenant_request_id uuid, p_activity_entity_type text, p_activity_entity_id uuid, p_activity_action text, p_activity_new_values jsonb"],
    ["discard_unreferenced_document_upload", "p_document_id uuid, p_organization_id uuid, p_storage_path text, p_content_sha256 text"],
    ["fingerprint_document_content", "p_document_id uuid, p_organization_id uuid, p_content_sha256 text"],
    ["update_document", "p_document_id uuid, p_organization_id uuid, p_category text, p_property_id uuid, p_unit_id uuid, p_lease_id uuid, p_task_id uuid"]
  ]'::jsonb,
  'only checked create, once-only fingerprint, and metadata-only update signatures remain'
);

SELECT ok(
  (
    SELECT count(*) = 6
      AND bool_and(procedure.prosecdef)
      AND bool_and(procedure.proconfig @> ARRAY['search_path=""'])
      AND bool_and(owner.rolname = 'postgres')
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'archive_document',
        'create_document',
        'discard_unreferenced_document_upload',
        'fingerprint_document_content',
        'restore_document',
        'update_document'
      )
  ),
  'document write RPCs are postgres-owned SECURITY DEFINER functions with an empty search path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN (VALUES ('anon'), ('service_role')) AS role_name(name)
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'archive_document',
        'create_document',
        'discard_unreferenced_document_upload',
        'fingerprint_document_content',
        'restore_document',
        'update_document'
      )
      AND has_function_privilege(
        role_name.name,
        procedure.oid,
        'EXECUTE'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS function_acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'archive_document',
        'create_document',
        'discard_unreferenced_document_upload',
        'fingerprint_document_content',
        'restore_document',
        'update_document'
      )
      AND function_acl.grantee = 0
      AND function_acl.privilege_type = 'EXECUTE'
  )
  AND (
    SELECT count(*) = 6
      AND bool_and(has_function_privilege('authenticated', procedure.oid, 'EXECUTE'))
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'archive_document',
        'create_document',
        'discard_unreferenced_document_upload',
        'fingerprint_document_content',
        'restore_document',
        'update_document'
      )
  ),
  'only authenticated can execute checked document write RPCs'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS role_name(name)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privilege_name(name)
    WHERE coalesce(
      has_table_privilege(
        role_name.name,
        to_regclass('public.documents'),
        privilege_name.name
      ),
      false
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.documents')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  )
  AND coalesce(
    has_table_privilege('authenticated', to_regclass('public.documents'), 'SELECT'),
    false
  )
  AND NOT coalesce(
    has_table_privilege('anon', to_regclass('public.documents'), 'SELECT'),
    false
  )
  AND NOT coalesce(
    has_table_privilege('service_role', to_regclass('public.documents'), 'SELECT'),
    false
  ),
  'direct document mutations are revoked from all app roles while authenticated keeps scoped read access'
);

SELECT is(
  (
    SELECT jsonb_agg(jsonb_build_array(policyname, cmd) ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
  ),
  '[["Admins can read documents","SELECT"]]'::jsonb,
  'documents expose one organization-scoped authenticated read policy and no write policy'
);

SELECT ok(
  (
    SELECT count(*) >= 5
      AND bool_and(procedure.prosecdef)
      AND bool_and(procedure.proconfig @> ARRAY['search_path=""'])
      AND bool_and(owner.rolname = 'postgres')
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname IN (
        'assert_owner_opening_evidence_eligible',
        'guard_financial_evidence_document',
        'guard_document_content_fingerprint',
        'is_financial_evidence_document_locked',
        'is_financial_evidence_object_locked'
      )
  ),
  'private evidence helpers are postgres-owned SECURITY DEFINER functions with an empty search path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN (VALUES ('anon'), ('service_role')) AS role_name(name)
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname IN (
        'assert_owner_opening_evidence_eligible',
        'guard_financial_evidence_document',
        'guard_document_content_fingerprint',
        'is_financial_evidence_document_locked',
        'is_financial_evidence_object_locked'
      )
      AND has_function_privilege(role_name.name, procedure.oid, 'EXECUTE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS function_acl
    WHERE namespace.nspname = 'app_private'
      AND procedure.proname IN (
        'assert_owner_opening_evidence_eligible',
        'guard_financial_evidence_document',
        'guard_document_content_fingerprint',
        'is_financial_evidence_document_locked',
        'is_financial_evidence_object_locked'
      )
      AND function_acl.grantee = 0
      AND function_acl.privilege_type = 'EXECUTE'
  )
  AND NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.assert_owner_opening_evidence_eligible(uuid,uuid,uuid,text)'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.is_financial_evidence_document_locked(uuid)'),
      'EXECUTE'
    ),
    false
  ),
  'private workflow helpers are not directly executable by app roles'
);

SELECT ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.is_financial_evidence_object_locked(text)'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure('app_private.is_financial_evidence_object_locked(text)'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('app_private.is_financial_evidence_object_locked(text)'),
      'EXECUTE'
    ),
    false
  ),
  'only authenticated can evaluate the private Storage-policy lock predicate'
);

SELECT ok(
  (
    SELECT count(*) = 2
      AND bool_and(qual LIKE '%is_financial_evidence_object_locked%')
      AND bool_and(qual NOT LIKE '%is_expense_evidence_object_locked%')
    FROM (
      SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS qual
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname IN (
          'Admins can delete Nestory documents',
          'Admins can update Nestory documents'
        )
    ) AS storage_policy
  ),
  'Storage update/delete policies use the generalized fingerprint and financial-evidence lock'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger
    JOIN pg_proc AS procedure ON procedure.oid = trigger.tgfoid
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE trigger.tgrelid = 'storage.objects'::regclass
      AND trigger.tgname = 'guard_financial_evidence_storage_truncate'
      AND NOT trigger.tgisinternal
      AND namespace.nspname = 'app_private'
      AND procedure.proname = 'guard_financial_evidence_storage_truncate'
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']
  ),
  'a hardened trigger prevents app-role Storage TRUNCATE even when local Storage regrants table ACLs'
);

SELECT (
  to_regprocedure(
    'app_private.assert_owner_opening_evidence_eligible(uuid,uuid,uuid,text)'
  ) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'content_sha256'
  )
) AS evidence_schema_ready \gset

\if :evidence_schema_ready

CREATE TEMP TABLE evidence_test_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operations_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  archived_document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  absent_object_document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  referenced_document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reference_only_request_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO evidence_test_state DEFAULT VALUES;
GRANT SELECT ON evidence_test_state TO authenticated, service_role;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('evidence-fingerprint-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM evidence_test_state
  UNION ALL SELECT finance_manager_id, 'finance-manager' FROM evidence_test_state
  UNION ALL SELECT finance_member_id, 'finance-member' FROM evidence_test_state
  UNION ALL SELECT operations_manager_id, 'operations-manager' FROM evidence_test_state
  UNION ALL SELECT operations_member_id, 'operations-member' FROM evidence_test_state
  UNION ALL SELECT cross_super_admin_id, 'cross-super-admin' FROM evidence_test_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Evidence fingerprint organization', 'evidence-' || left(organization_id::text, 8)
FROM evidence_test_state
UNION ALL
SELECT cross_organization_id, 'Cross evidence organization', 'cross-evidence-' || left(cross_organization_id::text, 8)
FROM evidence_test_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin' FROM evidence_test_state
UNION ALL SELECT organization_id, finance_manager_id, 'finance_manager' FROM evidence_test_state
UNION ALL SELECT organization_id, finance_member_id, 'finance_member' FROM evidence_test_state
UNION ALL SELECT cross_organization_id, cross_super_admin_id, 'super_admin' FROM evidence_test_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, address
)
SELECT
  property_id, organization_id, 'Evidence property', 'EVID', 'Apartment',
  'Evidence address'
FROM evidence_test_state
UNION ALL
SELECT
  cross_property_id, cross_organization_id, 'Cross evidence property', 'XEVID',
  'Apartment', 'Cross address'
FROM evidence_test_state;

INSERT INTO public.people (id, organization_id, display_name)
SELECT owner_person_id, organization_id, 'Evidence owner'
FROM evidence_test_state;

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
SELECT
  property_owner_id, organization_id, property_id, owner_person_id, 100.000, '2026-01-01'
FROM evidence_test_state;

CREATE OR REPLACE FUNCTION pg_temp.evidence_path(p_suffix text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT organization_id::text || '/documents/' || p_suffix
  FROM evidence_test_state;
$$;

INSERT INTO storage.objects (bucket_id, name)
SELECT 'nestory-documents', pg_temp.evidence_path('legacy.pdf')
UNION ALL SELECT 'nestory-documents', pg_temp.evidence_path('archived.pdf')
UNION ALL SELECT 'nestory-documents', pg_temp.evidence_path('referenced.pdf')
UNION ALL SELECT 'nestory-documents', pg_temp.evidence_path('valid-create.pdf');

INSERT INTO public.documents (
  id, organization_id, property_id, category, file_name, storage_path,
  mime_type, size_bytes, uploaded_by, archived_at
)
SELECT
  legacy_document_id, organization_id, property_id,
  'owner_opening_balance_evidence', 'legacy.pdf',
  pg_temp.evidence_path('legacy.pdf'), 'application/pdf', 6,
  super_admin_id, NULL
FROM evidence_test_state
UNION ALL
SELECT
  archived_document_id, organization_id, property_id,
  'owner_opening_balance_evidence', 'archived.pdf',
  pg_temp.evidence_path('archived.pdf'), 'application/pdf', 8,
  super_admin_id, now()
FROM evidence_test_state
UNION ALL
SELECT
  absent_object_document_id, organization_id, property_id,
  'owner_opening_balance_evidence', 'absent.pdf',
  pg_temp.evidence_path('absent.pdf'), 'application/pdf', 6,
  super_admin_id, NULL
FROM evidence_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM evidence_test_state),
  true
);

CREATE OR REPLACE FUNCTION pg_temp.call_evidence_assertion(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_evidence_sha256 text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regprocedure(
    'app_private.assert_owner_opening_evidence_eligible(uuid,uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Task 2.2A evidence assertion is missing';
  END IF;

  EXECUTE
    'SELECT app_private.assert_owner_opening_evidence_eligible($1,$2,$3,$4)'
    USING p_organization_id, p_property_id, p_document_id, p_evidence_sha256;
END;
$$;

SELECT throws_ok(
  format(
    'SELECT public.create_document(%L,%L,%L,%L,%L,%s,%L,%L)',
    organization_id,
    'owner_opening_balance_evidence',
    'malformed.pdf',
    pg_temp.evidence_path('valid-create.pdf'),
    'application/pdf',
    4,
    'ABC',
    property_id
  ),
  '22023',
  NULL,
  'checked document create rejects a malformed content hash'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT public.create_document(%L,%L,%L,%L,%L,%s,%L,%L)',
    organization_id,
    'owner_opening_balance_evidence',
    'missing.pdf',
    pg_temp.evidence_path('missing-create.pdf'),
    'application/pdf',
    4,
    repeat('a', 64),
    property_id
  ),
  '23503',
  NULL,
  'checked document create rejects absent Storage object metadata'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    property_id,
    legacy_document_id,
    repeat('a', 64)
  ),
  '22023',
  NULL,
  'an existing null-hash document is ineligible as opening evidence'
)
FROM evidence_test_state;

SELECT lives_ok(
  format(
    'SELECT public.fingerprint_document_content(%L,%L,%L)',
    legacy_document_id,
    organization_id,
    repeat('a', 64)
  ),
  'a legacy null-hash document can be fingerprinted once through the checked RPC'
)
FROM evidence_test_state;

SELECT is(
  (
    SELECT document.content_sha256
    FROM public.documents AS document
    JOIN evidence_test_state AS state ON state.legacy_document_id = document.id
  ),
  repeat('a', 64),
  'the checked legacy fingerprint stores the exact supplied lowercase hash'
);

SELECT throws_ok(
  format(
    'SELECT public.fingerprint_document_content(%L,%L,%L)',
    legacy_document_id,
    organization_id,
    repeat('b', 64)
  ),
  '22023',
  NULL,
  'a non-null document fingerprint cannot be changed or cleared'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'UPDATE public.documents SET content_sha256=%L WHERE id=%L',
    repeat('b', 64),
    legacy_document_id
  ),
  '22023',
  NULL,
  'direct DML cannot replace a fingerprint'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'UPDATE public.documents SET storage_path=%L, file_name=%L WHERE id=%L',
    pg_temp.evidence_path('replacement.pdf'),
    'replacement.pdf',
    legacy_document_id
  ),
  '22023',
  NULL,
  'fingerprinted bytes cannot be replaced in the existing document row'
)
FROM evidence_test_state;

SELECT lives_ok(
  format(
    'SELECT public.update_document(%L,%L,%L,%L)',
    legacy_document_id,
    organization_id,
    'lease',
    property_id
  ),
  'unreferenced fingerprinted documents allow metadata-only updates'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    property_id,
    legacy_document_id,
    repeat('a', 64)
  ),
  '22023',
  NULL,
  'opening evidence rejects the wrong document category'
)
FROM evidence_test_state;

SELECT public.update_document(
  legacy_document_id,
  organization_id,
  'owner_opening_balance_evidence',
  property_id
)
FROM evidence_test_state;

SELECT lives_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    property_id,
    legacy_document_id,
    repeat('a', 64)
  ),
  'a correctly scoped, categorized, present, active, hash-equal document is eligible'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    cross_organization_id,
    property_id,
    legacy_document_id,
    repeat('a', 64)
  ),
  '22023',
  NULL,
  'opening evidence rejects the wrong organization'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    cross_property_id,
    legacy_document_id,
    repeat('a', 64)
  ),
  '22023',
  NULL,
  'opening evidence rejects the wrong property'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    property_id,
    legacy_document_id,
    repeat('b', 64)
  ),
  '22023',
  NULL,
  'opening evidence rejects a request hash that differs from document metadata'
)
FROM evidence_test_state;

SELECT lives_ok(
  format(
    'SELECT public.fingerprint_document_content(%L,%L,%L)',
    archived_document_id,
    organization_id,
    repeat('c', 64)
  ),
  'an archived legacy row can be fingerprinted for retention without becoming eligible'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT pg_temp.call_evidence_assertion(%L,%L,%L,%L)',
    organization_id,
    property_id,
    archived_document_id,
    repeat('c', 64)
  ),
  '22023',
  NULL,
  'archived documents are ineligible as opening evidence'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'SELECT public.fingerprint_document_content(%L,%L,%L)',
    absent_object_document_id,
    organization_id,
    repeat('d', 64)
  ),
  '23503',
  NULL,
  'legacy fingerprinting rejects a document whose Storage object is absent'
)
FROM evidence_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM evidence_test_state),
  true
);

SELECT lives_ok(
  format(
    'SELECT public.create_document(%L,%L,%L,%L,%L,%s,%L,%L)',
    organization_id,
    'owner_opening_balance_evidence',
    'valid-create.pdf',
    pg_temp.evidence_path('valid-create.pdf'),
    'application/pdf',
    12,
    repeat('e', 64),
    property_id
  ),
  'Super Admin can create a checked document after the Storage object exists'
)
FROM evidence_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM evidence_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.create_document(%L,%L,%L,%L,%L,%s,%L,%L)',
    organization_id,
    'owner_opening_balance_evidence',
    'denied.pdf',
    pg_temp.evidence_path('valid-create.pdf'),
    'application/pdf',
    12,
    repeat('f', 64),
    property_id
  ),
  '42501',
  NULL,
  'Finance Manager cannot use the Super Admin document writer'
)
FROM evidence_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_super_admin_id::text FROM evidence_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.fingerprint_document_content(%L,%L,%L)',
    legacy_document_id,
    organization_id,
    repeat('a', 64)
  ),
  '42501',
  NULL,
  'a cross-organization Super Admin cannot fingerprint another organization document'
)
FROM evidence_test_state;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.documents (
  id, organization_id, property_id, category, file_name, storage_path,
  mime_type, size_bytes, uploaded_by
)
SELECT
  referenced_document_id, organization_id, property_id,
  'owner_opening_balance_evidence', 'referenced.pdf',
  pg_temp.evidence_path('referenced.pdf'), 'application/pdf', 10,
  super_admin_id
FROM evidence_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM evidence_test_state),
  true
);

SELECT public.fingerprint_document_content(
  referenced_document_id,
  organization_id,
  repeat('9', 64)
)
FROM evidence_test_state;

INSERT INTO public.owner_opening_balance_requests (
  organization_id, property_id, owner_person_id, property_owner_id,
  ownership_percent_snapshot, ownership_roster_hash, currency,
  effective_date, component, request_kind, proposed_amount, status, reason,
  source_reference, supporting_document_id, evidence_sha256, payload_hash,
  submitted_by
)
SELECT
  organization_id, property_id, owner_person_id, property_owner_id,
  100.000, repeat('8', 64), 'USD', '2026-01-01',
  'ips_held_owner_cash', 'initial', 0.00, 'submitted',
  'Verified opening evidence', NULL, referenced_document_id,
  repeat('9', 64), repeat('7', 64), super_admin_id
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'UPDATE public.documents SET category=%L WHERE id=%L',
    'changed-category',
    referenced_document_id
  ),
  '22023',
  NULL,
  'opening evidence metadata is locked after submitted reference'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'UPDATE public.documents SET archived_at=now() WHERE id=%L',
    referenced_document_id
  ),
  '22023',
  NULL,
  'opening evidence cannot be archived after submitted reference'
)
FROM evidence_test_state;

SELECT throws_ok(
  format(
    'DELETE FROM public.documents WHERE id=%L',
    referenced_document_id
  ),
  '22023',
  NULL,
  'opening evidence document rows cannot be deleted after submitted reference'
)
FROM evidence_test_state;

SELECT ok(
  app_private.is_financial_evidence_object_locked(
    pg_temp.evidence_path('referenced.pdf')
  ),
  'the generalized Storage predicate locks submitted opening evidence bytes'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT throws_ok(
  'TRUNCATE TABLE storage.objects',
  '42501',
  NULL,
  'service_role cannot bypass evidence retention with Storage TRUNCATE'
);

SELECT throws_ok(
  format(
    'UPDATE storage.objects SET metadata=%L::jsonb WHERE bucket_id=%L AND name=%L',
    '{"attempt":"replace"}',
    'nestory-documents',
    pg_temp.evidence_path('referenced.pdf')
  ),
  '42501',
  NULL,
  'service_role cannot bypass the Storage trigger to mutate locked evidence bytes'
)
FROM evidence_test_state;

RESET ROLE;

INSERT INTO public.owner_opening_balance_requests (
  id, organization_id, property_id, owner_person_id, property_owner_id,
  ownership_percent_snapshot, ownership_roster_hash, currency,
  effective_date, component, request_kind, proposed_amount, status, reason,
  source_reference, supporting_document_id, evidence_sha256, payload_hash,
  submitted_by
)
SELECT
  reference_only_request_id, organization_id, property_id, owner_person_id,
  property_owner_id, 100.000, repeat('6', 64), 'USD', '2026-02-01',
  'ips_due_to_owner', 'initial', 0.00, 'submitted',
  'Reference-only opening evidence', 'migration-manifest-row-1', NULL,
  repeat('5', 64), repeat('4', 64), super_admin_id
FROM evidence_test_state;

SELECT is(
  (
    SELECT supporting_document_id
    FROM public.owner_opening_balance_requests AS request
    JOIN evidence_test_state AS state
      ON state.reference_only_request_id = request.id
  ),
  NULL::uuid,
  'reference-only evidence stores no fake document identity'
);

SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name LIKE '%migration-manifest-row-1%'
  ),
  0::bigint,
  'reference-only evidence invents no Storage object'
);

\endif

SELECT * FROM finish();

ROLLBACK;
