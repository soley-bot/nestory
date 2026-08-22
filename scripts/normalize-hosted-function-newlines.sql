DO $recovery$
DECLARE
  targets constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'signature', 'public.archive_person(uuid,uuid)',
      'raw_sha256', 'c089e21d926145922a41a0cc47460d119d80511688c21db26a83b1c9fc4b08df',
      'normalized_sha256', '9a6ae2109e090224622d214b9d36dc2ff257f1221b9905e3d89a3c64dffac60d'
    ),
    jsonb_build_object(
      'signature', 'public.archive_property(uuid,uuid)',
      'raw_sha256', '080166e6959e245c20397353d1b5e3b32cb2daa63b9c3e32108a234c4912528d',
      'normalized_sha256', 'd89cb737223fd868c60aa7243fba0381f122b1aa88aa5eba9227136975347c87'
    ),
    jsonb_build_object(
      'signature', 'public.restore_person(uuid,uuid)',
      'raw_sha256', 'e346a1cb0dbceab8d2b641064360f3ed909b9a35923dba12040c00573203bf05',
      'normalized_sha256', '94f21962a9273e73b72883b18e1fc2dfbfd65f247457cae361659d8a1deae79a'
    ),
    jsonb_build_object(
      'signature', 'public.restore_property(uuid,uuid)',
      'raw_sha256', '29952b0525a61d797ffff75c1c4745213565b2e5024d62653b08dece7ce6fa0b',
      'normalized_sha256', 'bc708433a87f1522ad917f7a460214967203670db0036372c00843b20ffd358e'
    ),
    jsonb_build_object(
      'signature', 'public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])',
      'raw_sha256', '3db86d5f86fc0f36e0799b789280b3b4725decccfb5e3bacfceae68f79a0b25e',
      'normalized_sha256', '24186ec6f8f4a8a0b989d4d874f7526cb92c96f2b5dcde29e3966ec7f1efb5fb'
    )
  );
  target jsonb;
  signature text;
  function_oid oid;
  function_identity regprocedure;
  definition text;
  normalized_definition text;
  expected_raw_sha256 text;
  expected_normalized_sha256 text;
  actual_sha256 text;
  fixed_role_predicate_crlf constant text :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || E'\r\n' ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || E'\r\n' ||
    '  END IF;';
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

  IF jsonb_array_length(targets) <> 5 THEN
    RAISE EXCEPTION 'Recovery descriptor must contain exactly five targets'
      USING ERRCODE = '55000';
  END IF;

  FOR target IN SELECT value FROM jsonb_array_elements(targets)
  LOOP
    signature := target ->> 'signature';
    expected_raw_sha256 := target ->> 'raw_sha256';
    expected_normalized_sha256 := target ->> 'normalized_sha256';

    IF signature IS NULL
      OR expected_raw_sha256 !~ '^[0-9a-f]{64}$'
      OR expected_normalized_sha256 !~ '^[0-9a-f]{64}$'
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

    actual_sha256 := encode(
      extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
      'hex'
    );

    IF actual_sha256 = expected_normalized_sha256 THEN
      IF strpos(definition, E'\r') <> 0
        OR strpos(definition, fixed_role_predicate_lf) = 0
      THEN
        RAISE EXCEPTION 'Normalized recovery target has unexpected content: %', signature
          USING ERRCODE = '55000';
      END IF;
    ELSIF actual_sha256 = expected_raw_sha256 THEN
      IF strpos(definition, E'\r\n') = 0
        OR strpos(replace(definition, E'\r\n', ''), E'\r') <> 0
        OR strpos(definition, fixed_role_predicate_crlf) = 0
      THEN
        RAISE EXCEPTION 'Recovery target has unexpected line endings or predicate: %', signature
          USING ERRCODE = '55000';
      END IF;

      normalized_definition := replace(definition, E'\r\n', E'\n');
      IF encode(
        extensions.digest(convert_to(normalized_definition, 'UTF8'), 'sha256'),
        'hex'
      ) <> expected_normalized_sha256
        OR strpos(normalized_definition, E'\r') <> 0
        OR strpos(normalized_definition, fixed_role_predicate_lf) = 0
      THEN
        RAISE EXCEPTION 'Recovery normalization mismatch: %', signature
          USING ERRCODE = '55000';
      END IF;

      EXECUTE normalized_definition;
      normalized_signatures := normalized_signatures + 1;
    ELSE
      RAISE EXCEPTION 'Recovery hash mismatch for %: %', signature, actual_sha256
        USING ERRCODE = '55000';
    END IF;

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

    processed_signatures := processed_signatures + 1;
  END LOOP;

  IF processed_signatures <> 5
    OR cardinality(seen_signatures) <> 5
    OR normalized_signatures NOT IN (0, 5)
  THEN
    RAISE EXCEPTION
      'Recovery target count failed: processed %, unique %, normalized %',
      processed_signatures,
      cardinality(seen_signatures),
      normalized_signatures
      USING ERRCODE = '55000';
  END IF;
END
$recovery$;
