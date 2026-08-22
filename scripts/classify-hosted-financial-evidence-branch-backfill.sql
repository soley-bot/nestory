WITH targets(id, organization_id, branch_id) AS (
  VALUES
    (
      '1759ac8e-881d-4e01-8c91-f671f2d7361b'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid
    ),
    (
      '19a60225-b17b-4d1d-ad6b-c1bcc25ce10d'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid
    ),
    (
      '71a9b2e7-2e03-4504-89e4-1b822290117f'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid
    )
), ledger AS (
  SELECT
    count(*)::integer AS hosted_ledger_count,
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
  SELECT encode(
    extensions.digest(
      convert_to(pg_get_functiondef(
        'app_private.guard_financial_evidence_document()'::regprocedure
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  ) AS definition_sha256
), document_state AS (
  SELECT
    count(*)::integer AS target_count,
    count(*) FILTER (
      WHERE document.organization_id = targets.organization_id
        AND app_private.is_financial_evidence_document_locked(document.id)
    )::integer AS exact_locked_count,
    count(*) FILTER (
      WHERE to_jsonb(document) ? 'branch_id'
        AND (to_jsonb(document) ->> 'branch_id')::uuid = targets.branch_id
    )::integer AS exact_branch_count
  FROM targets
  LEFT JOIN public.documents AS document ON document.id = targets.id
), classified AS (
  SELECT CASE
    WHEN ledger.hosted_ledger_count = 105
      AND ledger.hosted_ledger_head = '20260822061424'
      AND ledger.package_versions_present = 2
      AND guard.definition_sha256 = 'db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba'
      AND document_state.target_count = 3
      AND document_state.exact_locked_count = 3
      AND document_state.exact_branch_count = 0
    THEN 'required'
    WHEN ledger.hosted_ledger_count = 105
      AND ledger.hosted_ledger_head = '20260822061424'
      AND ledger.package_versions_present = 2
      AND guard.definition_sha256 = 'f506bedd184ad63775b2b3bdd0c7c72bc4bbc32ef5aeb93db7b23b1489a397dc'
      AND document_state.target_count = 3
      AND document_state.exact_locked_count = 3
      AND document_state.exact_branch_count = 0
    THEN 'restore_required'
    WHEN ledger.hosted_ledger_count = 106
      AND ledger.hosted_ledger_head = '20260822071638'
      AND ledger.package_versions_present = 3
      AND guard.definition_sha256 = 'db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba'
      AND document_state.target_count = 3
      AND document_state.exact_locked_count = 3
      AND document_state.exact_branch_count = 3
    THEN 'resume'
    WHEN ledger.hosted_ledger_count = 106
      AND ledger.hosted_ledger_head = '20260822071638'
      AND ledger.package_versions_present = 3
      AND guard.definition_sha256 = 'f506bedd184ad63775b2b3bdd0c7c72bc4bbc32ef5aeb93db7b23b1489a397dc'
      AND document_state.target_count = 3
      AND document_state.exact_locked_count = 3
      AND document_state.exact_branch_count = 3
    THEN 'restore_resume'
    WHEN ledger.package_versions_present = 4
      AND ledger.hosted_ledger_count >= 107
      AND guard.definition_sha256 = 'db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba'
    THEN 'complete'
    ELSE NULL
  END AS recovery_state
  FROM ledger
  CROSS JOIN guard
  CROSS JOIN document_state
)
SELECT recovery_state
FROM classified
WHERE recovery_state IS NOT NULL;
