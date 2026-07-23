BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT has_table(
  'public',
  'public_interest_requests',
  'public interest request intake exists'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_interest_requests'::regclass),
  'public interest requests enforce row level security'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.public_interest_requests', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.public_interest_requests', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.public_interest_requests', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.public_interest_requests', 'DELETE'),
  'anonymous database clients cannot access public interest requests'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.public_interest_requests', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.public_interest_requests', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.public_interest_requests', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.public_interest_requests', 'DELETE'),
  'authenticated database clients cannot access public interest requests'
);

SELECT ok(
  has_table_privilege('service_role', 'public.public_interest_requests', 'SELECT')
  AND has_table_privilege('service_role', 'public.public_interest_requests', 'INSERT')
  AND has_table_privilege('service_role', 'public.public_interest_requests', 'UPDATE')
  AND has_table_privilege('service_role', 'public.public_interest_requests', 'DELETE'),
  'service role can manage public interest requests'
);

SELECT lives_ok(
  $$INSERT INTO public.public_interest_requests (
    request_type,
    full_name,
    work_email,
    company_name,
    portfolio_size,
    message
  ) VALUES (
    'demo',
    'Mara Sok',
    'mara@example.com',
    'Central Property Group',
    '101-500',
    'We want to review portfolio controls.'
  )$$,
  'a valid request can be stored'
);

SELECT throws_ok(
  $$INSERT INTO public.public_interest_requests (
    request_type,
    full_name,
    work_email,
    company_name
  ) VALUES (
    'information',
    'Mara Sok',
    'MARA@example.com',
    'Central Property Group'
  )$$,
  '23514',
  NULL,
  'request emails must be normalized'
);

SELECT throws_ok(
  $$INSERT INTO public.public_interest_requests (
    request_type,
    full_name,
    work_email,
    company_name
  ) VALUES (
    'demo',
    'Mara Sok',
    'mara@example.com',
    'Central Property Group'
  )$$,
  '23505',
  NULL,
  'the same email and request type are deduplicated per day'
);

SELECT * FROM finish();
ROLLBACK;
