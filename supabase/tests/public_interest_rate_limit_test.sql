BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(18);

SELECT has_table(
  'app_private',
  'public_interest_rate_limit_windows',
  'public intake rate-limit windows are stored outside the public schema'
);

SELECT ok(
  (SELECT relrowsecurity
   FROM pg_class
   WHERE oid = 'app_private.public_interest_rate_limit_windows'::regclass),
  'rate-limit windows enforce row level security'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app_private'
      AND table_name = 'public_interest_rate_limit_windows'
      AND column_name IN (
        'ip', 'ip_address', 'organization_id', 'user_agent', 'request_headers'
      )
  ),
  'rate-limit storage has no raw network identity or organization columns'
);

SELECT ok(
  NOT has_table_privilege('anon', 'app_private.public_interest_rate_limit_windows', 'SELECT')
  AND NOT has_table_privilege('anon', 'app_private.public_interest_rate_limit_windows', 'INSERT')
  AND NOT has_table_privilege('anon', 'app_private.public_interest_rate_limit_windows', 'UPDATE')
  AND NOT has_table_privilege('anon', 'app_private.public_interest_rate_limit_windows', 'DELETE'),
  'anon cannot access rate-limit windows'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'app_private.public_interest_rate_limit_windows', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'app_private.public_interest_rate_limit_windows', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'app_private.public_interest_rate_limit_windows', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'app_private.public_interest_rate_limit_windows', 'DELETE'),
  'authenticated cannot access rate-limit windows'
);

SELECT ok(
  has_table_privilege('service_role', 'app_private.public_interest_rate_limit_windows', 'SELECT')
  AND has_table_privilege('service_role', 'app_private.public_interest_rate_limit_windows', 'INSERT')
  AND has_table_privilege('service_role', 'app_private.public_interest_rate_limit_windows', 'UPDATE')
  AND has_table_privilege('service_role', 'app_private.public_interest_rate_limit_windows', 'DELETE'),
  'service_role can maintain rate-limit windows'
);

SELECT has_function(
  'public',
  'submit_public_interest_request_limited',
  ARRAY['bytea', 'text', 'text', 'text', 'text', 'text', 'text'],
  'the atomic public intake limiter RPC exists'
);

SELECT ok(
  NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.submit_public_interest_request_limited(bytea,text,text,text,text,text,text)'::regprocedure
  ),
  'the public intake limiter runs with invoker privileges'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.submit_public_interest_request_limited(bytea,text,text,text,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.submit_public_interest_request_limited(bytea,text,text,text,text,text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.submit_public_interest_request_limited(bytea,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'only service_role can execute the public intake limiter RPC'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.submit_public_interest_request_limited(bytea,text,text,text,text,text,text)'::regprocedure
      AND 'p_organization_id' = ANY (proargnames)
  ),
  'the public intake limiter has no organization authority input'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.submit_public_interest_request_limited(
    decode(repeat('ab', 32), 'hex'),
    'demo',
    'Rate Limit Test',
    'rate-limit-test@example.com',
    'Rate Limit Test Company',
    '1-25',
    'Atomic intake test'
  ),
  'accepted',
  'the first request is accepted'
);

SELECT is(
  public.submit_public_interest_request_limited(
    decode(repeat('ab', 32), 'hex'),
    'demo',
    'Rate Limit Test',
    'rate-limit-test@example.com',
    'Rate Limit Test Company',
    '1-25',
    'Atomic intake test'
  ),
  'duplicate',
  'a daily email and request-type duplicate is neutral'
);

DO $test$
BEGIN
  FOR counter IN 1..8 LOOP
    PERFORM public.submit_public_interest_request_limited(
      decode(repeat('ab', 32), 'hex'),
      'information',
      'Rate Limit Test',
      format('rate-limit-test-%s@example.com', counter),
      'Rate Limit Test Company',
      NULL,
      NULL
    );
  END LOOP;
END;
$test$;

SELECT is(
  public.submit_public_interest_request_limited(
    decode(repeat('ab', 32), 'hex'),
    'information',
    'Rate Limit Test',
    'rate-limit-test-limited@example.com',
    'Rate Limit Test Company',
    NULL,
    NULL
  ),
  'limited',
  'the eleventh request is limited without exposing that result to the client'
);

SELECT throws_ok(
  $$SELECT public.submit_public_interest_request_limited(
    decode(repeat('cd', 32), 'hex'),
    'demo',
    'Rate Limit Test',
    'NOT-NORMALIZED@example.com',
    'Rate Limit Test Company',
    NULL,
    NULL
  )$$,
  '23514',
  NULL,
  'invalid lead data fails the atomic statement'
);

RESET ROLE;

SELECT is(
  (SELECT attempt_count
   FROM app_private.public_interest_rate_limit_windows
   WHERE subject_digest = decode(repeat('ab', 32), 'hex')),
  11,
  'the counter is atomically capped at its limiting sentinel'
);

SELECT is(
  (SELECT count(*)
   FROM public.public_interest_requests
   WHERE work_email = 'rate-limit-test@example.com'),
  1::bigint,
  'the neutral duplicate result stores only one lead'
);

SELECT is(
  (SELECT count(*)
   FROM app_private.public_interest_rate_limit_windows
   WHERE subject_digest = decode(repeat('cd', 32), 'hex')),
  0::bigint,
  'a failed lead insert rolls back its rate counter'
);

SELECT ok(
  (SELECT expires_at <= (bucket_date + 2)::timestamp AT TIME ZONE 'utc'
   FROM app_private.public_interest_rate_limit_windows
   WHERE subject_digest = decode(repeat('ab', 32), 'hex')),
  'rate-limit digests expire within two UTC days'
);

SELECT * FROM finish();

ROLLBACK;
