WITH targets(signature, normalized_sha256) AS (
  VALUES
    (
      'public.archive_person(uuid,uuid)',
      '9a6ae2109e090224622d214b9d36dc2ff257f1221b9905e3d89a3c64dffac60d'
    ),
    (
      'public.archive_property(uuid,uuid)',
      'd89cb737223fd868c60aa7243fba0381f122b1aa88aa5eba9227136975347c87'
    ),
    (
      'public.restore_person(uuid,uuid)',
      '94f21962a9273e73b72883b18e1fc2dfbfd65f247457cae361659d8a1deae79a'
    ),
    (
      'public.restore_property(uuid,uuid)',
      'bc708433a87f1522ad917f7a460214967203670db0036372c00843b20ffd358e'
    ),
    (
      'public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])',
      '24186ec6f8f4a8a0b989d4d874f7526cb92c96f2b5dcde29e3966ec7f1efb5fb'
    )
), observed AS (
  SELECT
    targets.signature,
    targets.normalized_sha256,
    to_regprocedure(targets.signature) AS function_identity,
    pg_get_functiondef(to_regprocedure(targets.signature)) AS definition
  FROM targets
), hashed AS (
  SELECT
    signature,
    normalized_sha256,
    function_identity,
    definition,
    encode(
      extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
      'hex'
    ) AS actual_sha256
  FROM observed
), ledger AS (
  SELECT
    count(*)::integer AS hosted_ledger_count,
    max(version) AS hosted_ledger_head,
    count(*) FILTER (
      WHERE version IN (
        '20260822053215',
        '20260822061424',
        '20260822071638',
        '20260822091214'
      )
    )::integer AS pending_versions_present
  FROM supabase_migrations.schema_migrations
)
SELECT jsonb_build_object(
  'hosted_ledger_count', ledger.hosted_ledger_count,
  'hosted_ledger_head', ledger.hosted_ledger_head,
  'target_count', 5,
  'normalization', 'CRLF to LF only'
) AS recovery_descriptor
FROM hashed
CROSS JOIN ledger
GROUP BY
  ledger.hosted_ledger_count,
  ledger.hosted_ledger_head,
  ledger.pending_versions_present
HAVING count(*) = 5
  AND count(DISTINCT signature) = 5
  AND bool_and(function_identity IS NOT NULL)
  AND bool_and(actual_sha256 = normalized_sha256)
  AND bool_and(strpos(definition, E'\r') = 0)
  AND ledger.hosted_ledger_count = 103
  AND ledger.hosted_ledger_head = '20260822045638'
  AND ledger.pending_versions_present = 0;
