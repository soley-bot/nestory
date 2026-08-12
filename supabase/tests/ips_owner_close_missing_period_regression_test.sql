BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT lives_ok(
  $$
    SELECT public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      DATE '2036-01-01'
    )
  $$,
  'missing owner period returns a blocker envelope instead of raising'
);

SELECT is(
  public.get_owner_close_readiness(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD',
    DATE '2036-01-01'
  )->>'is_ready',
  'false',
  'missing owner period is explicitly not close-ready'
);

SELECT ok(
  public.get_owner_close_readiness(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD',
    DATE '2036-01-01'
  )->'blockers' @> '[{"code":"owner_balance_period_missing"}]'::jsonb,
  'missing owner period exposes the stable repair blocker'
);

SELECT * FROM finish();
ROLLBACK;
