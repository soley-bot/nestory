DO $recovery$
DECLARE
  targets constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.archive_person(uuid,uuid)',
      'raw_sha256', 'c089e21d926145922a41a0cc47460d119d80511688c21db26a83b1c9fc4b08df',
      'normalized_sha256', '9a6ae2109e090224622d214b9d36dc2ff257f1221b9905e3d89a3c64dffac60d'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.archive_property(uuid,uuid)',
      'raw_sha256', '080166e6959e245c20397353d1b5e3b32cb2daa63b9c3e32108a234c4912528d',
      'normalized_sha256', 'd89cb737223fd868c60aa7243fba0381f122b1aa88aa5eba9227136975347c87'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.restore_person(uuid,uuid)',
      'raw_sha256', 'e346a1cb0dbceab8d2b641064360f3ed909b9a35923dba12040c00573203bf05',
      'normalized_sha256', '94f21962a9273e73b72883b18e1fc2dfbfd65f247457cae361659d8a1deae79a'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.restore_property(uuid,uuid)',
      'raw_sha256', '29952b0525a61d797ffff75c1c4745213565b2e5024d62653b08dece7ce6fa0b',
      'normalized_sha256', 'bc708433a87f1522ad917f7a460214967203670db0036372c00843b20ffd358e'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])',
      'raw_sha256', '3db86d5f86fc0f36e0799b789280b3b4725decccfb5e3bacfceae68f79a0b25e',
      'normalized_sha256', '24186ec6f8f4a8a0b989d4d874f7526cb92c96f2b5dcde29e3966ec7f1efb5fb'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.archive_asset_photo(uuid,uuid)',
      'raw_sha256', 'b45c5e72657877ea3e7cc2e5d85540db10f5dfd7f3b6543e462e0368b2029cc4',
      'normalized_sha256', '35a73f2c86f509da0d6a46934de71ba79e9fe806cead3e9626f16426644c1f31'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)',
      'raw_sha256', '2b1d105dd6902af272128ae1ee8fa0087e8b74581004e856c47d1414241bbe85',
      'normalized_sha256', '6e242f86bd40c532cd0f1fe960b2896a63056c8b2abd4bc9a22f301d9cd81e9d'
    ),
    jsonb_build_object(
      'target_group', 'previously_normalized',
      'signature', 'public.set_asset_photo_cover(uuid,uuid)',
      'raw_sha256', '1e3644c091625eb6d44cb3669b4868e68a1c2316b86c5edb5f8ebe598d5cb45f',
      'normalized_sha256', 'd57f7c4ec83ab385ff8ae805c03d089743480ce6c1c6946a459b23ded60dacbe'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.commit_generic_import_run_internal(uuid,uuid)',
      'raw_sha256', '22ace458068cc7a664792cbc7f3fc036e0517a957a7f36efd9d358c023721b1a',
      'normalized_sha256', '7281ce6240771f5a8e03108577b76599395be828ec1c55db70878dd9e0add8c8'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.create_lease_core_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      'raw_sha256', 'e562bcd22d581cfdc4abee5a6984c1c2ed35e9714bb502b1dc4f1963911073c3',
      'normalized_sha256', '14ab67a6414ea72a409dfb841e21d19125c56ffea5fc97db0b4cba985fadfea4'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.update_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      'raw_sha256', '67718919899d197f534e262097a83d39b60cd61e5bfd12b430e6e409df72a7ba',
      'normalized_sha256', 'f296430f7b8394494f9051353f2d18118b00c74ef607aa83ee89de0ce00f1724'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.archive_lease(uuid,uuid)',
      'raw_sha256', '2d231d952d4d2f2975f73c1a99539ccb23f54f8ebd50b6f809565cd10fe018f7',
      'normalized_sha256', '99a1d240de1d18458579c72256f1717223ade9043ec08b1505494a44c0a75eca'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.correct_authoritative_lease_term(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text)',
      'raw_sha256', '018042d2d893af393227dbbcd9e3c1c6e720f5ae70885d4e3ac7a8ae4d46edbd',
      'normalized_sha256', '5f5f2009d436d3bd8b8a04b6be4a991697757f169e26ced408b0b55c4564d87c'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)',
      'raw_sha256', 'a2bb1d6933370dbf2df78b48f179d8f1f3d0c745251378086d4abfb8e27d3e50',
      'normalized_sha256', '1b2396f86ba5388cf07e88f34d31f271812489438daeaa39a3aeafc855c651f5'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.restore_lease(uuid,uuid)',
      'raw_sha256', 'e45c887bf36607679939160e440fcf3b5e02b1eccb177e9f4c87a0d0c28c478a',
      'normalized_sha256', '92bab17ef16f879adb2d2ddacafd8a549865ac1dc2abc593b3f25ef5efdde5b9'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)',
      'raw_sha256', '9d3736c9087a7c0e52b1d80a1afb695fd37185cdcbce05ebb0966d1de32b753a',
      'normalized_sha256', '1da9b7506e2ac081a91b957de38182deb3ea0e064128f4eb0d2fb0b0a288aaea'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)',
      'raw_sha256', 'ca91d38b5a91591c62e8fa40c1d839e8cea72d0ef4d82aaf7911d979cb93ed21',
      'normalized_sha256', '6952d2a435a766264205c9f5aa0ac36783d162ce6f48da50fed563b8053caa6f'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.create_maintenance_task_baseline_track10(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'raw_sha256', 'a1f4a94213a7935058614c45b0e32e989a0b4bb2959dba05e2b25a4d1a3230e4',
      'normalized_sha256', '65d6e375de72781daa65f9736a78408a967ecb26da0c8938cd2c36c2d3c54b59'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.create_maintenance_task_internal(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'raw_sha256', 'bc6511b10bca5be34cb527e86131ec2eabb7bcd7c65ebdeec90eabf546c0d32e',
      'normalized_sha256', 'f34e944ee364d27ba4d4b7112b7a23ca0072d35974e405b5497d1b01b0b2d375'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.update_maintenance_task_baseline_track10(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'raw_sha256', '2d531b43bc7cbe51ee04be7e3f78458ed88e471945baad5497096c985b74bc0a',
      'normalized_sha256', 'a98d13dbe686805d0bfefcbe53e50f5b3df1585e1efb66261edac3c57ed96216'
    ),
    jsonb_build_object(
      'target_group', 'new_recovery_target',
      'signature', 'app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)',
      'raw_sha256', '171db6c1a4b9641ba1f54058fc627c3846306139bc64b2527330bd3ecb6d99b8',
      'normalized_sha256', '5673f36119dad04acfe6ce00d96865db3ec8e65d36d662891272d1d582903921'
    )
  );
  target jsonb;
  target_group text;
  signature text;
  function_oid oid;
  function_identity regprocedure;
  definition text;
  normalized_definition text;
  expected_raw_sha256 text;
  expected_normalized_sha256 text;
  actual_sha256 text;
  fixed_role_predicate_lf constant text :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || E'\n' ||
    '  END IF;';
  metadata_before jsonb;
  metadata_after jsonb;
  hosted_ledger_count integer;
  hosted_ledger_head text;
  pending_versions_present integer;
  processed_signatures integer := 0;
  previously_normalized_targets integer := 0;
  new_recovery_targets integer := 0;
  raw_recovery_targets integer := 0;
  normalized_recovery_targets integer := 0;
  normalized_signatures integer := 0;
  seen_signatures text[] := ARRAY[]::text[];
BEGIN
  SELECT count(*)::integer, max(version)
  INTO hosted_ledger_count, hosted_ledger_head
  FROM supabase_migrations.schema_migrations;

  SELECT count(*)::integer
  INTO pending_versions_present
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '20260822053215',
    '20260822061424',
    '20260822071638',
    '20260822091214'
  );

  IF hosted_ledger_count <> 103
    OR hosted_ledger_head <> '20260822045638'
    OR pending_versions_present <> 0
  THEN
    RAISE EXCEPTION
      'Hosted ledger precondition failed: count %, head %, pending recovery versions %',
      hosted_ledger_count,
      hosted_ledger_head,
      pending_versions_present
      USING ERRCODE = '55000';
  END IF;

  IF jsonb_array_length(targets) <> 21 THEN
    RAISE EXCEPTION 'Recovery descriptor must contain exactly twenty-one targets'
      USING ERRCODE = '55000';
  END IF;

  -- Validate the complete state before executing any definition. The eight
  -- earlier targets must already be normalized; the thirteen newly approved
  -- targets must be either all raw or all normalized.
  FOR target IN SELECT value FROM jsonb_array_elements(targets)
  LOOP
    target_group := target ->> 'target_group';
    signature := target ->> 'signature';
    expected_raw_sha256 := target ->> 'raw_sha256';
    expected_normalized_sha256 := target ->> 'normalized_sha256';

    IF target_group NOT IN ('previously_normalized', 'new_recovery_target')
      OR signature IS NULL
      OR expected_raw_sha256 !~ '^[0-9a-f]{64}$'
      OR expected_normalized_sha256 !~ '^[0-9a-f]{64}$'
      OR expected_raw_sha256 = expected_normalized_sha256
    THEN
      RAISE EXCEPTION 'Invalid recovery descriptor'
        USING ERRCODE = '55000';
    END IF;

    IF signature = ANY(seen_signatures) THEN
      RAISE EXCEPTION 'Duplicate recovery target: %', signature
        USING ERRCODE = '55000';
    END IF;
    seen_signatures := array_append(seen_signatures, signature);

    function_identity := to_regprocedure(signature);
    IF function_identity IS NULL THEN
      RAISE EXCEPTION 'Missing recovery target: %', signature
        USING ERRCODE = '55000';
    END IF;

    definition := pg_get_functiondef(function_identity);
    actual_sha256 := encode(
      extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
      'hex'
    );

    IF target_group = 'previously_normalized' THEN
      previously_normalized_targets := previously_normalized_targets + 1;
      IF actual_sha256 <> expected_normalized_sha256
        OR strpos(definition, E'\r') <> 0
        OR strpos(definition, fixed_role_predicate_lf) = 0
      THEN
        RAISE EXCEPTION 'Previously normalized target changed: %', signature
          USING ERRCODE = '55000';
      END IF;
    ELSE
      new_recovery_targets := new_recovery_targets + 1;
      IF actual_sha256 = expected_raw_sha256 THEN
        IF strpos(definition, E'\r\n') = 0
          OR strpos(replace(definition, E'\r\n', ''), E'\r') <> 0
        THEN
          RAISE EXCEPTION 'Recovery target has unexpected line endings: %', signature
            USING ERRCODE = '55000';
        END IF;

        normalized_definition := replace(definition, E'\r\n', E'\n');
        IF encode(
          extensions.digest(convert_to(normalized_definition, 'UTF8'), 'sha256'),
          'hex'
        ) <> expected_normalized_sha256
          OR strpos(normalized_definition, E'\r') <> 0
        THEN
          RAISE EXCEPTION 'Recovery normalization mismatch: %', signature
            USING ERRCODE = '55000';
        END IF;
        raw_recovery_targets := raw_recovery_targets + 1;
      ELSIF actual_sha256 = expected_normalized_sha256 THEN
        IF strpos(definition, E'\r') <> 0 THEN
          RAISE EXCEPTION 'Normalized recovery target changed: %', signature
            USING ERRCODE = '55000';
        END IF;
        normalized_recovery_targets := normalized_recovery_targets + 1;
      ELSE
        RAISE EXCEPTION 'Recovery hash mismatch for %: %', signature, actual_sha256
          USING ERRCODE = '55000';
      END IF;
    END IF;

    processed_signatures := processed_signatures + 1;
  END LOOP;

  IF processed_signatures <> 21
    OR cardinality(seen_signatures) <> 21
    OR previously_normalized_targets <> 8
    OR new_recovery_targets <> 13
    OR raw_recovery_targets NOT IN (0, 13)
    OR normalized_recovery_targets NOT IN (0, 13)
    OR raw_recovery_targets + normalized_recovery_targets <> 13
  THEN
    RAISE EXCEPTION
      'Recovery state rejected: processed %, prior %, new %, raw %, normalized %',
      processed_signatures,
      previously_normalized_targets,
      new_recovery_targets,
      raw_recovery_targets,
      normalized_recovery_targets
      USING ERRCODE = '55000';
  END IF;

  IF raw_recovery_targets = 13 THEN
    FOR target IN
      SELECT item.value
      FROM jsonb_array_elements(targets) AS item(value)
      WHERE item.value ->> 'target_group' = 'new_recovery_target'
    LOOP
      signature := target ->> 'signature';
      expected_raw_sha256 := target ->> 'raw_sha256';
      expected_normalized_sha256 := target ->> 'normalized_sha256';
      function_identity := to_regprocedure(signature);
      function_oid := function_identity::oid;

      SELECT
        pg_get_functiondef(p.oid),
        jsonb_build_object(
          'oid', p.oid,
          'owner', p.proowner,
          'acl', coalesce(p.proacl::text, '<null>'),
          'language', p.prolang,
          'kind', p.prokind,
          'security_definer', p.prosecdef,
          'leakproof', p.proleakproof,
          'strict', p.proisstrict,
          'returns_set', p.proretset,
          'volatility', p.provolatile,
          'parallel', p.proparallel,
          'config', coalesce(p.proconfig::text, '<null>'),
          'support', p.prosupport,
          'cost', p.procost,
          'rows', p.prorows
        )
      INTO definition, metadata_before
      FROM pg_proc AS p
      WHERE p.oid = function_oid;

      IF encode(
        extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
        'hex'
      ) <> expected_raw_sha256
      THEN
        RAISE EXCEPTION 'Recovery target changed before execution: %', signature
          USING ERRCODE = '55000';
      END IF;

      normalized_definition := replace(definition, E'\r\n', E'\n');
      IF encode(
        extensions.digest(convert_to(normalized_definition, 'UTF8'), 'sha256'),
        'hex'
      ) <> expected_normalized_sha256
        OR strpos(normalized_definition, E'\r') <> 0
      THEN
        RAISE EXCEPTION 'Recovery normalization changed before execution: %', signature
          USING ERRCODE = '55000';
      END IF;

      EXECUTE normalized_definition;

      SELECT
        pg_get_functiondef(p.oid),
        jsonb_build_object(
          'oid', p.oid,
          'owner', p.proowner,
          'acl', coalesce(p.proacl::text, '<null>'),
          'language', p.prolang,
          'kind', p.prokind,
          'security_definer', p.prosecdef,
          'leakproof', p.proleakproof,
          'strict', p.proisstrict,
          'returns_set', p.proretset,
          'volatility', p.provolatile,
          'parallel', p.proparallel,
          'config', coalesce(p.proconfig::text, '<null>'),
          'support', p.prosupport,
          'cost', p.procost,
          'rows', p.prorows
        )
      INTO definition, metadata_after
      FROM pg_proc AS p
      WHERE p.oid = function_oid;

      IF metadata_before IS DISTINCT FROM metadata_after
        OR encode(
          extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
          'hex'
        ) <> expected_normalized_sha256
        OR strpos(definition, E'\r') <> 0
      THEN
        RAISE EXCEPTION 'Recovery postcondition failed: %', signature
          USING ERRCODE = '55000';
      END IF;

      normalized_signatures := normalized_signatures + 1;
    END LOOP;
  END IF;

  IF normalized_signatures NOT IN (0, 13) THEN
    RAISE EXCEPTION 'Recovery execution count failed: %', normalized_signatures
      USING ERRCODE = '55000';
  END IF;
END
$recovery$;
