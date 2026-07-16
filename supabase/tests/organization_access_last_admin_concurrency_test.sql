CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

UPDATE public.organization_members
SET role = 'admin'
WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;

UPDATE public.organization_members
SET role = 'manager'
WHERE id = '00000000-0000-0000-0000-000000000503'::uuid;

DROP ROLE IF EXISTS nestory_concurrency_test;
CREATE ROLE nestory_concurrency_test
LOGIN PASSWORD 'nestory-concurrency-test';
GRANT authenticated TO nestory_concurrency_test;

SELECT plan(2);

SELECT extensions.dblink_connect(
  'admin_a',
  'host=supabase_db_nestory dbname=postgres user=nestory_concurrency_test password=nestory-concurrency-test sslmode=disable'
);
SELECT extensions.dblink_connect(
  'admin_b',
  'host=supabase_db_nestory dbname=postgres user=nestory_concurrency_test password=nestory-concurrency-test sslmode=disable'
);

SELECT extensions.dblink_exec(
  'admin_a',
  $$SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101'$$
);

SELECT extensions.dblink_exec(
  'admin_a',
  $$UPDATE public.organization_members
    SET role = 'admin'
    WHERE id = '00000000-0000-0000-0000-000000000503'::uuid$$
);

SELECT extensions.dblink_exec(
  'admin_a',
  $$SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000501'$$
);
SELECT extensions.dblink_exec(
  'admin_b',
  $$SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000501'$$
);

SELECT extensions.dblink_exec('admin_a', 'BEGIN');
SELECT extensions.dblink_exec(
  'admin_a',
  $$UPDATE public.organization_members
    SET role = 'manager'
    WHERE id = '00000000-0000-0000-0000-000000000201'::uuid$$
);

SELECT extensions.dblink_exec(
  'admin_b',
  $remote$
    CREATE OR REPLACE FUNCTION pg_temp.try_final_admin_demotion()
    RETURNS text
    LANGUAGE plpgsql
    AS $body$
    BEGIN
      UPDATE public.organization_members
      SET role = 'member'
      WHERE id = '00000000-0000-0000-0000-000000000503'::uuid;
      RETURN 'allowed';
    EXCEPTION
      WHEN OTHERS THEN
        RETURN SQLSTATE || ':' || SQLERRM;
    END;
    $body$;
  $remote$
);

SELECT extensions.dblink_send_query(
  'admin_b',
  'SELECT pg_temp.try_final_admin_demotion() AS outcome'
);

SELECT pg_sleep(0.2);

SELECT is(
  extensions.dblink_is_busy('admin_b'),
  1,
  'a concurrent demotion waits for the organization invariant lock'
);

SELECT extensions.dblink_exec('admin_a', 'COMMIT');

SELECT is(
  (
    SELECT outcome
    FROM extensions.dblink_get_result('admin_b') AS result(outcome text)
  ),
  'P0001:Cannot demote the last administrator',
  'the second concurrent demotion is rejected after the first commits'
);

SELECT count(*)
FROM extensions.dblink_get_result('admin_b') AS result(outcome text);

SELECT extensions.dblink_exec(
  'admin_a',
  $$UPDATE public.organization_members
    SET role = 'admin'
    WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;
    UPDATE public.organization_members
    SET role = 'manager'
    WHERE id = '00000000-0000-0000-0000-000000000503'::uuid$$
);

SELECT extensions.dblink_exec(
  'admin_b',
  'DROP FUNCTION pg_temp.try_final_admin_demotion()'
);

SELECT extensions.dblink_disconnect('admin_a');
SELECT extensions.dblink_disconnect('admin_b');

DROP ROLE nestory_concurrency_test;

SELECT * FROM finish();
