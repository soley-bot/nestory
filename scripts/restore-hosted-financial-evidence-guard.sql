DO $recovery$
DECLARE
  strict_definition_sha256 constant text := 'db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba';
  temporary_definition_sha256 constant text := 'f506bedd184ad63775b2b3bdd0c7c72bc4bbc32ef5aeb93db7b23b1489a397dc';
  strict_body constant text := $strict$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF app_private.is_financial_evidence_document_locked(OLD.id) THEN
    RAISE EXCEPTION 'Financial evidence document is immutable while referenced'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$strict$;
  temporary_body constant text := $temporary$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid
    AND OLD.id IN (
      '1759ac8e-881d-4e01-8c91-f671f2d7361b'::uuid,
      '19a60225-b17b-4d1d-ad6b-c1bcc25ce10d'::uuid,
      '71a9b2e7-2e03-4504-89e4-1b822290117f'::uuid
    )
    AND app_private.is_financial_evidence_document_locked(OLD.id)
    AND to_jsonb(OLD) ? 'branch_id'
    AND to_jsonb(NEW) ? 'branch_id'
    AND to_jsonb(OLD) -> 'branch_id' = 'null'::jsonb
    AND (to_jsonb(NEW) ->> 'branch_id')::uuid
      = 'a8120000-0000-4000-8000-000000000001'::uuid
    AND to_jsonb(NEW) - 'branch_id'
      IS NOT DISTINCT FROM to_jsonb(OLD) - 'branch_id' THEN
    RETURN NEW;
  END IF;

  IF app_private.is_financial_evidence_document_locked(OLD.id) THEN
    RAISE EXCEPTION 'Financial evidence document is immutable while referenced'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$temporary$;
  expected_metadata jsonb := jsonb_build_object(
    'oid', '29988',
    'owner', 'postgres',
    'acl', '{postgres=X/postgres}',
    'language', 'plpgsql',
    'kind', 'f',
    'security_definer', true,
    'leakproof', false,
    'strict', false,
    'returns_set', false,
    'volatility', 'v',
    'parallel', 'u',
    'config', '{"search_path=\"\""}',
    'cost', '100',
    'rows', '0',
    'comment', NULL,
    'trigger', jsonb_build_object(
      'oid', '29990',
      'name', 'guard_financial_evidence_document',
      'enabled', 'O',
      'deferrable', false,
      'initially_deferred', false,
      'definition', 'CREATE TRIGGER guard_financial_evidence_document BEFORE DELETE OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_evidence_document()',
      'comment', NULL
    )
  );
  hosted_ledger_count integer;
  hosted_ledger_head text;
  package_versions_present integer;
  definition text;
  definition_sha256 text;
  restored_definition text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  SELECT
    count(*)::integer,
    max(version),
    count(DISTINCT version) FILTER (
      WHERE version IN (
        '20260822053215',
        '20260822061424',
        '20260822071638',
        '20260822091214'
      )
    )::integer
  INTO hosted_ledger_count, hosted_ledger_head, package_versions_present
  FROM supabase_migrations.schema_migrations;

  IF (hosted_ledger_count, hosted_ledger_head, package_versions_present) NOT IN (
    (105, '20260822061424', 2),
    (106, '20260822071638', 3),
    (107, '20260822091214', 4)
  ) THEN
    RAISE EXCEPTION 'Financial evidence guard restoration ledger precondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_get_functiondef(p.oid),
    jsonb_build_object(
      'oid', p.oid::text,
      'owner', pg_get_userbyid(p.proowner),
      'acl', coalesce(p.proacl::text, '<null>'),
      'language', language.lanname,
      'kind', p.prokind,
      'security_definer', p.prosecdef,
      'leakproof', p.proleakproof,
      'strict', p.proisstrict,
      'returns_set', p.proretset,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'config', coalesce(p.proconfig::text, '<null>'),
      'cost', p.procost::text,
      'rows', p.prorows::text,
      'comment', obj_description(p.oid, 'pg_proc'),
      'trigger', (
        SELECT jsonb_build_object(
          'oid', trigger_record.oid::text,
          'name', trigger_record.tgname,
          'enabled', trigger_record.tgenabled,
          'deferrable', trigger_record.tgdeferrable,
          'initially_deferred', trigger_record.tginitdeferred,
          'definition', pg_get_triggerdef(trigger_record.oid, true),
          'comment', obj_description(trigger_record.oid, 'pg_trigger')
        )
        FROM pg_trigger AS trigger_record
        WHERE trigger_record.tgrelid = 'public.documents'::regclass
          AND trigger_record.tgname = 'guard_financial_evidence_document'
          AND NOT trigger_record.tgisinternal
      )
    )
  INTO definition, metadata_before
  FROM pg_proc AS p
  JOIN pg_language AS language ON language.oid = p.prolang
  WHERE p.oid = 'app_private.guard_financial_evidence_document()'::regprocedure;

  definition_sha256 := encode(
    extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
    'hex'
  );

  IF metadata_before IS DISTINCT FROM expected_metadata
    OR definition_sha256 NOT IN (
      strict_definition_sha256,
      temporary_definition_sha256
    )
  THEN
    RAISE EXCEPTION 'Financial evidence guard restoration precondition changed'
      USING ERRCODE = '55000';
  END IF;

  IF definition_sha256 = temporary_definition_sha256 THEN
    IF (length(definition) - length(replace(definition, temporary_body, '')))
      / length(temporary_body) <> 1
    THEN
      RAISE EXCEPTION 'Temporary financial evidence guard body changed'
        USING ERRCODE = '55000';
    END IF;

    restored_definition := replace(definition, temporary_body, strict_body);
    IF encode(
      extensions.digest(convert_to(restored_definition, 'UTF8'), 'sha256'),
      'hex'
    ) <> strict_definition_sha256 THEN
      RAISE EXCEPTION 'Strict financial evidence guard descriptor changed'
        USING ERRCODE = '55000';
    END IF;

    EXECUTE restored_definition;
  END IF;

  SELECT
    pg_get_functiondef(p.oid),
    jsonb_build_object(
      'oid', p.oid::text,
      'owner', pg_get_userbyid(p.proowner),
      'acl', coalesce(p.proacl::text, '<null>'),
      'language', language.lanname,
      'kind', p.prokind,
      'security_definer', p.prosecdef,
      'leakproof', p.proleakproof,
      'strict', p.proisstrict,
      'returns_set', p.proretset,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'config', coalesce(p.proconfig::text, '<null>'),
      'cost', p.procost::text,
      'rows', p.prorows::text,
      'comment', obj_description(p.oid, 'pg_proc'),
      'trigger', (
        SELECT jsonb_build_object(
          'oid', trigger_record.oid::text,
          'name', trigger_record.tgname,
          'enabled', trigger_record.tgenabled,
          'deferrable', trigger_record.tgdeferrable,
          'initially_deferred', trigger_record.tginitdeferred,
          'definition', pg_get_triggerdef(trigger_record.oid, true),
          'comment', obj_description(trigger_record.oid, 'pg_trigger')
        )
        FROM pg_trigger AS trigger_record
        WHERE trigger_record.tgrelid = 'public.documents'::regclass
          AND trigger_record.tgname = 'guard_financial_evidence_document'
          AND NOT trigger_record.tgisinternal
      )
    )
  INTO definition, metadata_after
  FROM pg_proc AS p
  JOIN pg_language AS language ON language.oid = p.prolang
  WHERE p.oid = 'app_private.guard_financial_evidence_document()'::regprocedure;

  IF metadata_before IS DISTINCT FROM metadata_after
    OR metadata_after IS DISTINCT FROM expected_metadata
    OR encode(
      extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
      'hex'
    ) <> strict_definition_sha256
  THEN
    RAISE EXCEPTION 'Strict financial evidence guard restoration failed'
      USING ERRCODE = '55000';
  END IF;
END
$recovery$;
