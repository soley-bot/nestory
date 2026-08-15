BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SET LOCAL search_path TO public, extensions;

SELECT plan(10);

SELECT has_function(
  'public',
  'list_paid_cost_evidence_orphans',
  ARRAY['integer'],
  'service cleanup exposes an aged-orphan inventory'
);

SELECT has_function(
  'public',
  'begin_paid_cost_evidence_cleanup',
  ARRAY['uuid', 'text'],
  'service cleanup can atomically claim an unregistered object'
);

SELECT has_function(
  'public',
  'finish_paid_cost_evidence_cleanup',
  ARRAY['uuid', 'text'],
  'service cleanup can release its claim'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.list_paid_cost_evidence_orphans(integer)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.begin_paid_cost_evidence_cleanup(uuid,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.finish_paid_cost_evidence_cleanup(uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.list_paid_cost_evidence_orphans(integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.begin_paid_cost_evidence_cleanup(uuid,text)',
    'EXECUTE'
  ),
  'cleanup inventory and claims remain service-only'
);

INSERT INTO storage.objects (
  bucket_id,
  name,
  version,
  metadata,
  created_at
) VALUES (
  'nestory-documents',
  '00000000-0000-4000-8000-000000000001/paid-cost-evidence/' || repeat('a', 64),
  pg_catalog.gen_random_uuid()::text,
  pg_catalog.jsonb_build_object('mimetype', 'application/pdf', 'size', 42),
  statement_timestamp() - interval '2 days'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_paid_cost_evidence_orphans(86400)
    WHERE storage_path =
      '00000000-0000-4000-8000-000000000001/paid-cost-evidence/' || repeat('a', 64)
  ),
  1,
  'an aged unregistered paid-cost object is inventoried'
);

SELECT is(
  public.begin_paid_cost_evidence_cleanup(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001/paid-cost-evidence/' || repeat('a', 64)
  ),
  true,
  'the first cleanup worker claims the orphan'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_paid_cost_evidence_orphans(86400)
  ),
  0,
  'claimed objects disappear from the cleanup inventory'
);

SELECT is(
  public.begin_paid_cost_evidence_cleanup(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001/paid-cost-evidence/' || repeat('a', 64)
  ),
  false,
  'a second cleanup worker cannot claim the same object'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('storage.allow_delete_query', 'true', true);

SELECT lives_ok(
  $$DELETE FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name = '00000000-0000-4000-8000-000000000001/paid-cost-evidence/$$ ||
      repeat('a', 64) || $$'$$,
  'the Storage API service role can delete only the exactly claimed orphan'
);

SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('storage.allow_delete_query', 'false', true);

SELECT is(
  public.finish_paid_cost_evidence_cleanup(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001/paid-cost-evidence/' || repeat('a', 64)
  ),
  true,
  'the cleanup worker releases its claim after the Storage API call'
);

SELECT * FROM finish();

ROLLBACK;
