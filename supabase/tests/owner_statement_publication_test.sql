BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table(
  'public',
  'owner_statement_publications',
  'immutable owner statement publication authority exists'
);

SELECT has_table(
  'public',
  'owner_statement_artifacts',
  'immutable retained owner statement artifact authority exists'
);

SELECT has_function(
  'public',
  'get_owner_statement_readiness',
  ARRAY['uuid', 'uuid'],
  'Finance roles inspect typed publication readiness for one frozen revision'
);

SELECT ok(
  NOT pg_catalog.has_function_privilege(
    'authenticated', 'app_private.is_owner_statement_artifact_registered(text)', 'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon', 'app_private.is_owner_statement_artifact_registered(text)', 'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role', 'app_private.is_owner_statement_artifact_registered(text)', 'EXECUTE'
  ),
  'the retired Storage delete-policy helper is private from every application role'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)::integer
    FROM pg_catalog.pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.cmd = 'DELETE'
      AND policy.policyname = 'Super Admin can remove unregistered owner statement artifacts'
  ),
  0,
  'authenticated sessions can never delete official Owner Statement paths'
);

SELECT has_function(
  'public',
  'publish_owner_statement',
  ARRAY['uuid', 'uuid', 'text'],
  'Super Admin publishes one closed current revision idempotently'
);

SELECT has_function(
  'public',
  'register_owner_statement_artifact',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'bigint', 'text'],
  'Super Admin registers create-only retained artifact metadata idempotently'
);

SELECT has_function(
  'public',
  'resume_owner_statement_publication',
  ARRAY['uuid', 'uuid', 'text'],
  'an incomplete publication has an explicit checked resume operation'
);

SELECT has_function(
  'public',
  'get_owner_statement_artifact_object',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text'],
  'the trusted server resolves one immutable Storage object identity'
);

SELECT has_function(
  'public',
  'register_owner_statement_artifact_verified',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text', 'uuid', 'text', 'text', 'text', 'bigint', 'text'],
  'the trusted server registers only a byte-verified retained object'
);

SELECT ok(
  NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.register_owner_statement_artifact(uuid,uuid,text,text,text,bigint,text)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.register_owner_statement_artifact(uuid,uuid,text,text,text,bigint,text)',
    'EXECUTE'
  ),
  'no application role can register caller-asserted artifact metadata'
);

SELECT ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.get_owner_statement_artifact_object(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.register_owner_statement_artifact_verified(uuid,uuid,uuid,text,text,uuid,text,text,text,bigint,text)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.register_owner_statement_artifact_verified(uuid,uuid,uuid,text,text,uuid,text,text,text,bigint,text)',
    'EXECUTE'
  ),
  'only the trusted server can resolve and register authoritative Storage objects'
);

SELECT has_function(
  'public',
  'get_owner_statement_publication',
  ARRAY['uuid', 'uuid'],
  'Finance roles load one frozen canonical publication model'
);

SELECT has_function(
  'public',
  'get_owner_statement_artifact_download',
  ARRAY['uuid', 'uuid'],
  'Finance roles load checked immutable artifact download metadata'
);

SELECT has_function(
  'public',
  'get_owner_statement_publications_for_series',
  ARRAY['uuid', 'uuid'],
  'Finance roles list every retained publication and artifact for one close series'
);

WITH authority_tables(table_name) AS (
  VALUES ('owner_statement_publications'), ('owner_statement_artifacts')
)
SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      relation.relrowsecurity AND relation.relforcerowsecurity
      AND pg_catalog.has_table_privilege(
        'authenticated', 'public.' || authority_tables.table_name, 'SELECT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'authenticated', 'public.' || authority_tables.table_name, 'INSERT,UPDATE,DELETE,TRUNCATE'
      )
      AND NOT pg_catalog.has_table_privilege(
        'anon', 'public.' || authority_tables.table_name, 'SELECT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', 'public.' || authority_tables.table_name, 'SELECT'
      )
    )
    FROM authority_tables
    JOIN pg_catalog.pg_class AS relation
      ON relation.relname = authority_tables.table_name
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  ),
  'both publication tables have FORCE RLS, authenticated read, and no application mutation grant'
);

CREATE TEMP TABLE owner_statement_test_runtime (
  revision_one_id uuid,
  revision_two_id uuid,
  publication_one_id uuid,
  publication_two_id uuid,
  revision_three_id uuid,
  revision_four_id uuid,
  publication_four_id uuid,
  publication_one_snapshot text,
  publication_one_hash text,
  statement_one_number text,
  pdf_object_id uuid,
  pdf_object_version text,
  xlsx_object_id uuid,
  xlsx_object_version text
) ON COMMIT DROP;
GRANT ALL ON owner_statement_test_runtime TO authenticated, service_role;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

SELECT public.set_financial_month_lock(
  '00000000-0000-0000-0000-000000000001',
  pg_catalog.date_trunc('month', current_date)::date,
  true,
  'Track 4B publication pgTAP'
);
SELECT public.review_owner_opening_balance(
  request.organization_id, request.id, 'reject',
  'Resolve pending fixture correction before publication',
  'track-4b-reject-pending-correction'
)
FROM public.owner_opening_balance_requests AS request
WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
  AND request.property_id = '10000000-0000-0000-0000-000000000001'
  AND request.owner_person_id = '80000000-0000-0000-0000-000000000004'
  AND request.status = 'submitted';

INSERT INTO owner_statement_test_runtime (revision_one_id)
SELECT (public.close_owner_month(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'Track 4B approved revision one close',
  'track-4b-close-r1'
)->>'revision_id')::uuid;

SELECT is(
  public.get_owner_statement_readiness(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime)
  )->>'is_ready',
  'true',
  'the closed current revision is publication-ready'
);

WITH published AS (
  SELECT public.publish_owner_statement(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime),
    'track-4b-publish-r1'
  ) AS result
)
UPDATE owner_statement_test_runtime
SET publication_one_id = (published.result->>'publication_id')::uuid,
  publication_one_hash = published.result->>'content_hash',
  statement_one_number = published.result->>'statement_number'
FROM published;

SELECT matches(
  (SELECT statement_one_number FROM owner_statement_test_runtime),
  '^OS-[0-9]{6}-[0-9A-F]{12}$',
  'the official statement number is non-PII and canonical'
);

SELECT is(
  public.publish_owner_statement(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime),
    'track-4b-publish-r1'
  )->>'publication_id',
  (SELECT publication_one_id::text FROM owner_statement_test_runtime),
  'an exact completed publication replay returns the original publication'
);

SELECT is(
  public.get_owner_statement_publication(
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime)
  )->>'content_hash',
  (SELECT publication_one_hash FROM owner_statement_test_runtime),
  'the canonical publication payload independently reproduces its stored hash'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true
);
SELECT lives_ok(
  pg_catalog.format(
    'SELECT public.get_owner_statement_publication(%L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime)
  ),
  'Finance Manager can read the frozen official publication'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.publish_owner_statement(%L, %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime),
    'track-4b-finance-publish-denied'
  ),
  '42501', 'owner_statement_publish_forbidden',
  'Finance Manager cannot publish'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.get_owner_statement_publication(%L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime)
  ),
  '42501', 'owner_statement_publication_forbidden',
  'Operations cannot read official publications'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
UPDATE owner_statement_test_runtime
SET publication_one_snapshot = (
  SELECT pg_catalog.row_to_json(publication)::text
  FROM public.owner_statement_publications AS publication
  WHERE publication.id = owner_statement_test_runtime.publication_one_id
);

SELECT is(
  public.get_owner_statement_readiness(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime)
  )->'blockers'->0->>'code',
  'owner_statement_artifacts_incomplete',
  'a published statement with no retained artifacts exposes typed remediation'
);

SELECT is(
  public.resume_owner_statement_publication(
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime),
    'track-4b-resume-r1-fresh-page'
  )->>'publication_id',
  (SELECT publication_one_id::text FROM owner_statement_test_runtime),
  'a fresh recovery command resumes the same incomplete publication and number'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.reopen_owner_month(%L, (SELECT owner_close_series_id FROM public.owner_close_revisions WHERE id = %L), %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime),
    'Must retain both official artifacts first',
    'track-4b-reopen-incomplete-zero'
  ),
  '55000', 'owner_statement_artifacts_incomplete',
  'reopen fails closed before any retained artifact exists'
);

SET LOCAL ROLE postgres;
INSERT INTO storage.objects (bucket_id, name, version, metadata)
SELECT 'owner-statements',
  app_private.owner_statement_storage_path(
    '00000000-0000-0000-0000-000000000001', runtime.publication_one_id,
    runtime.statement_one_number, 'pdf'
  ), pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object('mimetype', 'application/pdf', 'size', 4)
FROM owner_statement_test_runtime AS runtime;
UPDATE owner_statement_test_runtime AS runtime
SET pdf_object_id = object.id, pdf_object_version = object.version
FROM storage.objects AS object
WHERE object.bucket_id = 'owner-statements'
  AND object.name LIKE '%owner-statement-' || runtime.statement_one_number || '.pdf';
SET LOCAL ROLE service_role;

SELECT is(
  public.register_owner_statement_artifact_verified(
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime),
    '00000000-0000-0000-0000-000000000101',
    'pdf',
    '00000000-0000-0000-0000-000000000001/' ||
      (SELECT publication_one_id FROM owner_statement_test_runtime)::text ||
      '/pdf/owner-statement-' ||
      (SELECT statement_one_number FROM owner_statement_test_runtime) || '.pdf',
    (SELECT pdf_object_id FROM owner_statement_test_runtime),
    (SELECT pdf_object_version FROM owner_statement_test_runtime),
    'application/pdf', repeat('1', 64), 4, 'track-4b-register-r1-pdf'
  )->>'status',
  'registered',
  'the first create-only artifact registers independently'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.reopen_owner_month(%L, (SELECT owner_close_series_id FROM public.owner_close_revisions WHERE id = %L), %L, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_one_id FROM owner_statement_test_runtime),
    'Must retain Excel first',
    'track-4b-reopen-incomplete-one'
  ),
  '55000', 'owner_statement_artifacts_incomplete',
  'reopen still fails closed after only one retained artifact'
);

SET LOCAL ROLE service_role;
SELECT is(
  public.register_owner_statement_artifact_verified(
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime),
    '00000000-0000-0000-0000-000000000101',
    'pdf',
    '00000000-0000-0000-0000-000000000001/' ||
      (SELECT publication_one_id FROM owner_statement_test_runtime)::text ||
      '/pdf/owner-statement-' ||
      (SELECT statement_one_number FROM owner_statement_test_runtime) || '.pdf',
    (SELECT pdf_object_id FROM owner_statement_test_runtime),
    (SELECT pdf_object_version FROM owner_statement_test_runtime),
    'application/pdf', repeat('1', 64), 4, 'track-4b-register-r1-pdf'
  )->>'status',
  'replayed',
  'the same artifact registration retry replays without replacement'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.register_owner_statement_artifact_verified(%L, %L, %L, %L, %L, %L, %L, %L, %L, %s, %L)',
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime),
    '00000000-0000-0000-0000-000000000101', 'pdf',
    '00000000-0000-0000-0000-000000000001/' ||
      (SELECT publication_one_id FROM owner_statement_test_runtime)::text ||
      '/pdf/owner-statement-' ||
      (SELECT statement_one_number FROM owner_statement_test_runtime) || '.pdf',
    (SELECT pdf_object_id FROM owner_statement_test_runtime),
    (SELECT pdf_object_version FROM owner_statement_test_runtime),
    'application/pdf', repeat('2', 64), 4, 'track-4b-register-r1-pdf-conflict'
  ),
  '23505', NULL,
  'a different registration cannot replace the retained PDF authority'
);

SET LOCAL ROLE postgres;
INSERT INTO storage.objects (bucket_id, name, version, metadata)
SELECT 'owner-statements',
  app_private.owner_statement_storage_path(
    '00000000-0000-0000-0000-000000000001', runtime.publication_one_id,
    runtime.statement_one_number, 'xlsx'
  ), pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object(
    'mimetype', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'size', 5
  )
FROM owner_statement_test_runtime AS runtime;
UPDATE owner_statement_test_runtime AS runtime
SET xlsx_object_id = object.id, xlsx_object_version = object.version
FROM storage.objects AS object
WHERE object.bucket_id = 'owner-statements'
  AND object.name LIKE '%owner-statement-' || runtime.statement_one_number || '.xlsx';
SET LOCAL ROLE service_role;

SELECT is(
  public.register_owner_statement_artifact_verified(
    '00000000-0000-0000-0000-000000000001',
    (SELECT publication_one_id FROM owner_statement_test_runtime),
    '00000000-0000-0000-0000-000000000101',
    'xlsx',
    '00000000-0000-0000-0000-000000000001/' ||
      (SELECT publication_one_id FROM owner_statement_test_runtime)::text ||
      '/xlsx/owner-statement-' ||
      (SELECT statement_one_number FROM owner_statement_test_runtime) || '.xlsx',
    (SELECT xlsx_object_id FROM owner_statement_test_runtime),
    (SELECT xlsx_object_version FROM owner_statement_test_runtime),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    repeat('3', 64), 5, 'track-4b-register-r1-xlsx'
  )->>'status',
  'registered',
  'the second retained format completes the publication authority'
);
SET LOCAL ROLE authenticated;

WITH reopened AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT revision.owner_close_series_id
      FROM public.owner_close_revisions AS revision
      WHERE revision.id = runtime.revision_one_id
    ),
    'Track 4B superseding publication revision',
    'track-4b-reopen-r2'
  ) AS result
  FROM owner_statement_test_runtime AS runtime
)
UPDATE owner_statement_test_runtime
SET revision_two_id = (reopened.result->>'revision_id')::uuid
FROM reopened;

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD', pg_catalog.date_trunc('month', current_date)::date,
      'track-4b-reroll-r2'
    )
  $$,
  'the reopened period rerolls before its superseding publication'
);
SELECT is(
  public.close_owner_month(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD', pg_catalog.date_trunc('month', current_date)::date,
    'Track 4B approved revision two close',
    'track-4b-close-r2'
  )->>'revision_id',
  (SELECT revision_two_id::text FROM owner_statement_test_runtime),
  'revision two recloses as the current authority'
);

WITH published AS (
  SELECT public.publish_owner_statement(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_two_id FROM owner_statement_test_runtime),
    'track-4b-publish-r2'
  ) AS result
)
UPDATE owner_statement_test_runtime
SET publication_two_id = (published.result->>'publication_id')::uuid
FROM published;

SELECT is(
  (
    SELECT publication.supersedes_publication_id::text
    FROM public.owner_statement_publications AS publication
    WHERE publication.id = runtime.publication_two_id
  ),
  (SELECT publication_one_id::text FROM owner_statement_test_runtime),
  'publication N plus 1 explicitly supersedes publication N'
)
FROM owner_statement_test_runtime AS runtime;

SELECT is(
  pg_catalog.jsonb_array_length(public.get_owner_statement_publications_for_series(
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT revision.owner_close_series_id
      FROM public.owner_close_revisions AS revision
      WHERE revision.id = (SELECT revision_one_id FROM owner_statement_test_runtime)
    )
  )),
  2,
  'publication history retains both numbered revisions for read-only display'
);

SELECT is(
  (
    SELECT pg_catalog.row_to_json(publication)::text
    FROM public.owner_statement_publications AS publication
    WHERE publication.id = runtime.publication_one_id
  ),
  (SELECT publication_one_snapshot FROM owner_statement_test_runtime),
  'publishing N plus 1 does not change the prior immutable publication row'
)
FROM owner_statement_test_runtime AS runtime;

SET LOCAL ROLE postgres;
SELECT pg_catalog.set_config(
  'app.owner_statement_write_context', 'checked-owner-statement-v1', true
);
INSERT INTO public.owner_statement_artifacts (
  organization_id, publication_id, format, storage_path, sha256,
  size_bytes, created_by, storage_object_id, storage_object_version,
  content_type
)
SELECT
  '00000000-0000-0000-0000-000000000001', runtime.publication_two_id,
  format.value,
  app_private.owner_statement_storage_path(
    '00000000-0000-0000-0000-000000000001', runtime.publication_two_id,
    publication.statement_number, format.value
  ),
  pg_catalog.repeat(CASE format.value WHEN 'pdf' THEN '4' ELSE '5' END, 64),
  CASE format.value WHEN 'pdf' THEN 6 ELSE 7 END,
  '00000000-0000-0000-0000-000000000101',
  pg_catalog.gen_random_uuid(), 'retained-r2-' || format.value,
  CASE format.value
    WHEN 'pdf' THEN 'application/pdf'
    ELSE 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  END
FROM owner_statement_test_runtime AS runtime
JOIN public.owner_statement_publications AS publication
  ON publication.id = runtime.publication_two_id
CROSS JOIN (VALUES ('pdf'), ('xlsx')) AS format(value);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

WITH reopened AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    revision.owner_close_series_id,
    'Create an unpublished intervening close revision',
    'track-4b-reopen-r3-unpublished'
  ) AS result
  FROM owner_statement_test_runtime AS runtime
  JOIN public.owner_close_revisions AS revision ON revision.id = runtime.revision_two_id
)
UPDATE owner_statement_test_runtime
SET revision_three_id = (reopened.result->>'revision_id')::uuid
FROM reopened;

SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'track-4b-reroll-r3-unpublished'
);
SELECT public.close_owner_month(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'Close revision three without publication',
  'track-4b-close-r3-unpublished'
);

WITH reopened AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    revision.owner_close_series_id,
    'Publish after an intentionally skipped revision',
    'track-4b-reopen-r4-after-skip'
  ) AS result
  FROM owner_statement_test_runtime AS runtime
  JOIN public.owner_close_revisions AS revision ON revision.id = runtime.revision_three_id
)
UPDATE owner_statement_test_runtime
SET revision_four_id = (reopened.result->>'revision_id')::uuid
FROM reopened;

SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'track-4b-reroll-r4-after-skip'
);
SELECT public.close_owner_month(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'Close revision four after skipped publication',
  'track-4b-close-r4-after-skip'
);

WITH published AS (
  SELECT public.publish_owner_statement(
    '00000000-0000-0000-0000-000000000001',
    (SELECT revision_four_id FROM owner_statement_test_runtime),
    'track-4b-publish-r4-after-skip'
  ) AS result
)
UPDATE owner_statement_test_runtime
SET publication_four_id = (published.result->>'publication_id')::uuid
FROM published;

SELECT is(
  publication.supersedes_publication_id::text,
  runtime.publication_two_id::text,
  'a publication supersedes the nearest earlier retained publication across an unpublished revision'
)
FROM owner_statement_test_runtime AS runtime
JOIN public.owner_statement_publications AS publication
  ON publication.id = runtime.publication_four_id;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.owner_statement_publications AS publication
    JOIN public.owner_close_revisions AS revision
      ON revision.id = publication.owner_close_revision_id
    WHERE revision.owner_close_series_id = series.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_statement_publications AS successor
        WHERE successor.supersedes_publication_id = publication.id
      )
  ),
  1,
  'skipped revision history retains exactly one current official publication'
)
FROM owner_statement_test_runtime AS runtime
JOIN public.owner_close_revisions AS revision ON revision.id = runtime.revision_four_id
JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id;

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.owner_statement_publications SET statement_number = %L WHERE id = %L',
    'OS-202608-FFFFFFFFFFFF',
    (SELECT publication_one_id FROM owner_statement_test_runtime)
  ),
  '42501', 'permission denied for table owner_statement_publications',
  'direct publication mutation is denied'
);

SELECT * FROM finish();
ROLLBACK;
