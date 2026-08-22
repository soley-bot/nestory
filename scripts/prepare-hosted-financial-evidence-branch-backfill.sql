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
  exact_documents integer;
  remaining_newline_targets integer;
  definition text;
  temporary_definition text;
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

  IF hosted_ledger_count <> 105
    OR hosted_ledger_head <> '20260822061424'
    OR package_versions_present <> 2
  THEN
    RAISE EXCEPTION 'Financial evidence recovery ledger precondition failed'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'branch_id'
  ) THEN
    RAISE EXCEPTION 'Document branch column already exists at the recovery checkpoint'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_branches AS branch
    WHERE branch.organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid
      AND branch.id = 'a8120000-0000-4000-8000-000000000001'::uuid
      AND branch.status = 'active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Approved document branch is not active'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    id,
    document_row_sha256,
    financial_reference_sha256,
    expense_reference_count,
    active_opening_reference_count
  ) AS (
    VALUES
      (
        '1759ac8e-881d-4e01-8c91-f671f2d7361b'::uuid,
        '5c1eed5acfe780771360e8aefc580345bbd379fedeb1b35ae0c554a5255ade36',
        '2e709c2269424c28626a88554f62403c2dfd5e61a35f72a9c40f3293c39febd7',
        1,
        0
      ),
      (
        '19a60225-b17b-4d1d-ad6b-c1bcc25ce10d'::uuid,
        '37a99d408f2abe9e68b257db3c3d476ffa7bed92e36169278abe812c3775f3b2',
        '7e9859df80871fd1559de45325033c1ded97cb5b69e51271683dbec3f05972ef',
        1,
        0
      ),
      (
        '71a9b2e7-2e03-4504-89e4-1b822290117f'::uuid,
        '97210808b2b73170ea6db5dd1ae9b9e65139e5041de7bd627b2e9c857ef2f525',
        'cd9da1a9f6be9aedd84a9a9640c89ecc66c47d3e3264d8f7d748eededbc62308',
        1,
        0
      )
  ), observed AS (
    SELECT
      expected.*,
      document.organization_id,
      encode(
        extensions.digest(
          convert_to((to_jsonb(document) - 'branch_id')::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) AS actual_document_row_sha256,
      app_private.is_financial_evidence_document_locked(document.id) AS is_locked,
      (
        SELECT count(*)::integer
        FROM public.expense_submissions AS submission
        WHERE submission.supporting_document_id = document.id
      ) AS actual_expense_reference_count,
      (
        SELECT count(*)::integer
        FROM public.owner_opening_balance_requests AS request
        WHERE request.supporting_document_id = document.id
          AND request.status IN ('submitted', 'approved')
      ) AS actual_opening_reference_count,
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
      ) AS actual_financial_reference_sha256
    FROM expected
    JOIN public.documents AS document ON document.id = expected.id
  )
  SELECT count(*)::integer
  INTO exact_documents
  FROM observed
  WHERE organization_id = '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid
    AND is_locked
    AND actual_document_row_sha256 = document_row_sha256
    AND actual_financial_reference_sha256 = financial_reference_sha256
    AND actual_expense_reference_count = expense_reference_count
    AND actual_opening_reference_count = active_opening_reference_count;

  IF exact_documents <> 3 OR (SELECT count(*) FROM public.documents) <> 3 THEN
    RAISE EXCEPTION 'Approved financial evidence document state changed'
      USING ERRCODE = '55000';
  END IF;

  WITH targets(signature, normalized_sha256) AS (
    VALUES
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
  )
  SELECT count(*)::integer
  INTO remaining_newline_targets
  FROM targets
  WHERE to_regprocedure(signature) IS NOT NULL
    AND encode(
      extensions.digest(
        convert_to(pg_get_functiondef(to_regprocedure(signature)), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) = normalized_sha256;

  IF remaining_newline_targets <> 4 THEN
    RAISE EXCEPTION 'Remaining migration predecessor definitions changed'
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

  IF metadata_before IS DISTINCT FROM expected_metadata
    OR encode(
      extensions.digest(convert_to(definition, 'UTF8'), 'sha256'),
      'hex'
    ) <> strict_definition_sha256
    OR (length(definition) - length(replace(definition, strict_body, '')))
      / length(strict_body) <> 1
  THEN
    RAISE EXCEPTION 'Strict financial evidence guard precondition changed'
      USING ERRCODE = '55000';
  END IF;

  temporary_definition := replace(definition, strict_body, temporary_body);
  IF encode(
    extensions.digest(convert_to(temporary_definition, 'UTF8'), 'sha256'),
    'hex'
  ) <> temporary_definition_sha256 THEN
    RAISE EXCEPTION 'Temporary financial evidence guard descriptor changed'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE temporary_definition;

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
    ) <> temporary_definition_sha256
  THEN
    RAISE EXCEPTION 'Temporary financial evidence guard postcondition failed'
      USING ERRCODE = '55000';
  END IF;
END
$recovery$;
