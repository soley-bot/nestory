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
    ),
    (
      'public.archive_asset_photo(uuid,uuid)',
      '35a73f2c86f509da0d6a46934de71ba79e9fe806cead3e9626f16426644c1f31'
    ),
    (
      'public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)',
      '6e242f86bd40c532cd0f1fe960b2896a63056c8b2abd4bc9a22f301d9cd81e9d'
    ),
    (
      'public.set_asset_photo_cover(uuid,uuid)',
      'd57f7c4ec83ab385ff8ae805c03d089743480ce6c1c6946a459b23ded60dacbe'
    ),
    (
      'app_private.commit_generic_import_run_internal(uuid,uuid)',
      '7281ce6240771f5a8e03108577b76599395be828ec1c55db70878dd9e0add8c8'
    ),
    (
      'app_private.create_lease_core_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      '14ab67a6414ea72a409dfb841e21d19125c56ffea5fc97db0b4cba985fadfea4'
    ),
    (
      'app_private.update_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      'f296430f7b8394494f9051353f2d18118b00c74ef607aa83ee89de0ce00f1724'
    ),
    (
      'public.archive_lease(uuid,uuid)',
      '99a1d240de1d18458579c72256f1717223ade9043ec08b1505494a44c0a75eca'
    ),
    (
      'public.correct_authoritative_lease_term(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text)',
      '5f5f2009d436d3bd8b8a04b6be4a991697757f169e26ced408b0b55c4564d87c'
    ),
    (
      'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)',
      '1b2396f86ba5388cf07e88f34d31f271812489438daeaa39a3aeafc855c651f5'
    ),
    (
      'public.restore_lease(uuid,uuid)',
      '92bab17ef16f879adb2d2ddacafd8a549865ac1dc2abc593b3f25ef5efdde5b9'
    ),
    (
      'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)',
      '1da9b7506e2ac081a91b957de38182deb3ea0e064128f4eb0d2fb0b0a288aaea'
    ),
    (
      'public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      '6952d2a435a766264205c9f5aa0ac36783d162ce6f48da50fed563b8053caa6f'
    ),
    (
      'app_private.create_maintenance_task_baseline_track10(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      '65d6e375de72781daa65f9736a78408a967ecb26da0c8938cd2c36c2d3c54b59'
    ),
    (
      'app_private.create_maintenance_task_internal(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'f34e944ee364d27ba4d4b7112b7a23ca0072d35974e405b5497d1b01b0b2d375'
    ),
    (
      'app_private.update_maintenance_task_baseline_track10(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'a98d13dbe686805d0bfefcbe53e50f5b3df1585e1efb66261edac3c57ed96216'
    ),
    (
      'app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      '5673f36119dad04acfe6ce00d96865db3ec8e65d36d662891272d1d582903921'
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
  'target_count', 21,
  'normalization', 'CRLF to LF only'
) AS recovery_descriptor
FROM hashed
CROSS JOIN ledger
GROUP BY
  ledger.hosted_ledger_count,
  ledger.hosted_ledger_head,
  ledger.pending_versions_present
HAVING count(*) = 21
  AND count(DISTINCT signature) = 21
  AND bool_and(function_identity IS NOT NULL)
  AND bool_and(actual_sha256 = normalized_sha256)
  AND bool_and(strpos(definition, E'\r') = 0)
  AND ledger.hosted_ledger_count = 103
  AND ledger.hosted_ledger_head = '20260822045638'
  AND ledger.pending_versions_present = 0;
