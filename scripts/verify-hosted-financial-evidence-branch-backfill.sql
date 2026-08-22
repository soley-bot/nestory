WITH expected_targets(
  id,
  organization_id,
  branch_id,
  document_row_sha256,
  financial_reference_sha256
) AS (
  VALUES
    (
      '1759ac8e-881d-4e01-8c91-f671f2d7361b'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '5c1eed5acfe780771360e8aefc580345bbd379fedeb1b35ae0c554a5255ade36',
      '2e709c2269424c28626a88554f62403c2dfd5e61a35f72a9c40f3293c39febd7'
    ),
    (
      '19a60225-b17b-4d1d-ad6b-c1bcc25ce10d'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '37a99d408f2abe9e68b257db3c3d476ffa7bed92e36169278abe812c3775f3b2',
      '7e9859df80871fd1559de45325033c1ded97cb5b69e51271683dbec3f05972ef'
    ),
    (
      '71a9b2e7-2e03-4504-89e4-1b822290117f'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '97210808b2b73170ea6db5dd1ae9b9e65139e5041de7bd627b2e9c857ef2f525',
      'cd9da1a9f6be9aedd84a9a9640c89ecc66c47d3e3264d8f7d748eededbc62308'
    )
), observed AS (
  SELECT
    document.id,
    document.organization_id,
    document.branch_id,
    encode(
      extensions.digest(
        convert_to((to_jsonb(document) - 'branch_id')::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) AS document_row_sha256,
    encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'expense_submissions', coalesce((
              SELECT jsonb_agg(to_jsonb(submission) ORDER BY submission.id)
              FROM public.expense_submissions AS submission
              WHERE submission.supporting_document_id = document.id
            ), '[]'::jsonb),
            'owner_opening_balance_requests', coalesce((
              SELECT jsonb_agg(to_jsonb(request) ORDER BY request.id)
              FROM public.owner_opening_balance_requests AS request
              WHERE request.supporting_document_id = document.id
            ), '[]'::jsonb)
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS financial_reference_sha256,
    app_private.is_financial_evidence_document_locked(document.id) AS is_locked
  FROM public.documents AS document
  JOIN expected_targets ON expected_targets.id = document.id
), ledger AS (
  SELECT
    count(*)::integer AS hosted_ledger_count,
    count(DISTINCT version)::integer AS unique_hosted_versions,
    max(version) AS hosted_ledger_head,
    count(DISTINCT version) FILTER (
      WHERE version IN (
        '20260822053215',
        '20260822061424',
        '20260822071638',
        '20260822091214'
      )
    )::integer AS package_versions_present
  FROM supabase_migrations.schema_migrations
), guard AS (
  SELECT
    encode(
      extensions.digest(convert_to(pg_get_functiondef(p.oid), 'UTF8'), 'sha256'),
      'hex'
    ) AS definition_sha256,
    p.oid::text AS oid,
    pg_get_userbyid(p.proowner) AS owner,
    coalesce(p.proacl::text, '<null>') AS acl,
    obj_description(p.oid, 'pg_proc') AS comment,
    p.prosecdef AS security_definer,
    coalesce(p.proconfig::text, '<null>') AS config,
    (
      SELECT count(*)::integer
      FROM pg_trigger AS trigger_record
      WHERE trigger_record.oid::text = '29990'
        AND trigger_record.tgrelid = 'public.documents'::regclass
        AND trigger_record.tgname = 'guard_financial_evidence_document'
        AND trigger_record.tgenabled = 'O'
        AND NOT trigger_record.tgdeferrable
        AND NOT trigger_record.tginitdeferred
        AND NOT trigger_record.tgisinternal
        AND obj_description(trigger_record.oid, 'pg_trigger') IS NULL
    ) AS exact_trigger_count
  FROM pg_proc AS p
  WHERE p.oid = 'app_private.guard_financial_evidence_document()'::regprocedure
), exact_documents AS (
  SELECT count(*)::integer AS count
  FROM observed
  JOIN expected_targets USING (id, organization_id, branch_id)
  WHERE observed.document_row_sha256 = expected_targets.document_row_sha256
    AND observed.financial_reference_sha256 = expected_targets.financial_reference_sha256
    AND observed.is_locked
)
SELECT jsonb_build_object(
  'hosted_ledger_count', 107,
  'hosted_ledger_head', '20260822091214',
  'target_count', 3,
  'branch_id', 'a8120000-0000-4000-8000-000000000001',
  'strict_guard_restored', true
) AS financial_evidence_recovery_descriptor
FROM ledger
CROSS JOIN guard
CROSS JOIN exact_documents
WHERE ledger.hosted_ledger_count = 107
  AND ledger.unique_hosted_versions = 107
  AND ledger.hosted_ledger_head = '20260822091214'
  AND ledger.package_versions_present = 4
  AND exact_documents.count = 3
  AND (SELECT count(*) FROM public.documents) = 3
  AND guard.definition_sha256 = 'db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba'
  AND guard.oid = '29988'
  AND guard.owner = 'postgres'
  AND guard.acl = '{postgres=X/postgres}'
  AND guard.comment IS NULL
  AND guard.security_definer
  AND guard.config = '{"search_path=\"\""}'
  AND guard.exact_trigger_count = 1;
