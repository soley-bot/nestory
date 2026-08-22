WITH ledger AS (
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
), classified AS (
  SELECT
    CASE
      WHEN hosted_ledger_count = 103
        AND hosted_ledger_head = '20260822045638'
        AND package_versions_present = 0
      THEN 'required'
      WHEN hosted_ledger_count = 105
        AND hosted_ledger_head = '20260822061424'
        AND package_versions_present = 2
      THEN 'complete'
      WHEN hosted_ledger_count = 106
        AND hosted_ledger_head = '20260822071638'
        AND package_versions_present = 3
      THEN 'complete'
      WHEN package_versions_present = 4
      THEN 'complete'
      ELSE NULL
    END AS recovery_state
  FROM ledger
)
SELECT recovery_state
FROM classified
WHERE recovery_state IS NOT NULL;
