import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { concurrencyIdentityProfile } from './concurrency-fixture-identities.mjs';

export function fixtureAdmissionSql(ids) {
  assert.ok(ids.length > 0);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
  const values = `ARRAY[${ids.map(id => `'${id}'::uuid`).join(',')}]`;
  return `
SET LOCAL lock_timeout = '5s';
DO $concurrency_admission$
DECLARE c record; collision boolean;
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres'
    OR inet_server_addr() IS NOT NULL
    OR current_setting('app.settings.jwt_secret',true) IS DISTINCT FROM
      'super-secret-jwt-token-with-at-least-32-characters-long' THEN
    RAISE EXCEPTION 'Concurrency fixture requires the local synthetic database';
  END IF;
  FOR c IN SELECT n.nspname,t.relname,a.attname
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname IN ('public','app_private','auth') AND t.relkind='r'
      AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid='uuid'::regtype
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = ANY($1))',
      c.nspname,c.relname,c.attname) INTO collision USING ${values};
    IF collision THEN RAISE EXCEPTION 'Concurrency fixture identity collision; existing rows preserved'; END IF;
  END LOOP;
END;
$concurrency_admission$;
CREATE TEMP TABLE concurrency_preserved_scope(relation regclass PRIMARY KEY, digest text) ON COMMIT DROP;
-- to_jsonb(timestamptz) follows the session timezone. The seed intentionally
-- changes business timezone; compare both snapshots in one canonical timezone.
-- Function SET restores the caller's timezone on return, including on error.
CREATE FUNCTION pg_temp.concurrency_relation_digest(p_relation regclass,p_ids uuid[])
RETURNS text LANGUAGE plpgsql SET timezone='UTC' AS $digest$
DECLARE signature text;
BEGIN
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text, E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r WHERE organization_id <> ALL($1)',p_relation)
    INTO signature USING p_ids;
  RETURN signature;
END;
$digest$;
DO $concurrency_snapshot$
DECLARE c record; signature text;
BEGIN
  FOR c IN SELECT DISTINCT t.oid::regclass AS relation
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname IN ('public','app_private') AND t.relkind='r'
      AND a.attname='organization_id' AND NOT a.attisdropped AND a.atttypid='uuid'::regtype
  LOOP
    signature := pg_temp.concurrency_relation_digest(c.relation,${values});
    INSERT INTO concurrency_preserved_scope VALUES(c.relation,signature);
  END LOOP;
END;
$concurrency_snapshot$;
CREATE FUNCTION pg_temp.assert_concurrency_preserved() RETURNS void LANGUAGE plpgsql AS $preserved$
DECLARE c record; signature text;
BEGIN
  FOR c IN SELECT * FROM concurrency_preserved_scope LOOP
    signature := pg_temp.concurrency_relation_digest(c.relation,${values});
    IF signature IS DISTINCT FROM c.digest THEN
      RAISE EXCEPTION 'Concurrency fixture changed an existing organization in %', c.relation;
    END IF;
  END LOOP;
END;
$preserved$;
`;
}

export function guardConcurrencySetup(source, profile) {
  assert.match(source, /^\s*BEGIN\s*;/i, 'The case seed must be one explicit transaction.');
  assert.match(source, /COMMIT\s*;\s*$/i);
  assert.equal((source.match(/^\s*COMMIT\s*;/gim) ?? []).length, 1);
  return profile.sql(source)
    .replace(/^\s*BEGIN\s*;/i, `BEGIN;\n${fixtureAdmissionSql(profile.mappedIds())}`)
    .replace(/COMMIT\s*;\s*$/i, 'RESET ROLE; SELECT pg_temp.assert_concurrency_preserved();\nCOMMIT;');
}

export function concurrencyBaselineSql(baseline, profile) {
  const marker = 'WITH fixture_users(user_id, email, display_name) AS (';
  assert.equal(baseline.split(marker).length, 2, 'Review changed baseline seed boundary.');
  let body = marker + baseline.split(marker)[1];
  const scheduler = 'SELECT app_private.run_due_rent_generation(now());';
  assert.equal(body.split(scheduler).length, 2, 'Review changed fixture rent scheduler.');
  body = body.replace(scheduler, `DO $case_rent_scheduler$
    DECLARE lease_scope record;
    BEGIN
      FOR lease_scope IN SELECT runtime.organization_id, lease.id
        FROM fixture_runtime runtime JOIN public.leases lease
          ON lease.organization_id=runtime.organization_id
        WHERE lease.archived_at IS NULL AND lease.status IN ('active','notice_given')
        ORDER BY lease.id
      LOOP
        IF NOT app_private.begin_financial_scheduled_scope(lease_scope.organization_id) THEN
          RAISE EXCEPTION 'Fresh concurrency organization must permit scoped rent scheduling';
        END IF;
        PERFORM app_private.try_current_month_rent(
          lease_scope.organization_id, lease_scope.id, 'scheduled', now());
      END LOOP;
    END;
    $case_rent_scheduler$;`);
  assert.doesNotMatch(body, /\b(?:TRUNCATE|DELETE\s+FROM)\b/i);
  return guardConcurrencySetup(`BEGIN; SET LOCAL TIME ZONE 'Asia/Phnom_Penh';\n${body}`, profile);
}

export function createConcurrencyFixture({ repoRoot, container, sourceFiles = [] }) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Fresh-organization fixtures run only in disposable GitHub CI.');
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^[0-9]+$/);
  assert.equal(process.env.NESTORY_DAILY_FIXTURE_IDENTITIES, undefined);
  for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH',
    'DOCKER_API_VERSION','DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS']) {
    assert.ok(!process.env[key], 'Concurrency fixtures refuse connection overrides.');
  }
  const config = readFileSync(path.join(repoRoot, 'supabase/config.toml'), 'utf8');
  const project = config.match(/^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m)?.[1];
  assert.ok(project);
  assert.equal(container, `supabase_db_${project}`);
  assert.ok(!process.env.SUPABASE_DB_CONTAINER || process.env.SUPABASE_DB_CONTAINER === container);
  const execute = (command, args, input, env = process.env) => {
    const result = spawnSync(command, args, { cwd: repoRoot, input, env, encoding: 'utf8',
      shell: false, windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    assert.ok(!result.error, result.error?.message);
    assert.equal(result.status, 0, result.stderr || 'Synthetic fixture command failed.');
    return result.stdout;
  };
  const context = execute('docker', ['context','show']).trim();
  assert.match(context, /^[A-Za-z0-9_.-]+$/);
  const endpoint = JSON.parse(execute('docker', ['context','inspect',context,'--format','{{json .Endpoints.docker.Host}}']));
  const endpoints = process.platform === 'win32'
    ? ['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine'] : ['unix:///var/run/docker.sock'];
  assert.ok(endpoints.includes(endpoint), 'Concurrency fixtures require a local Docker socket.');
  const docker = (args, input) => execute('docker', ['--host', endpoint, ...args], input);
  const inspect = () => JSON.parse(docker(['inspect',container,'--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}']));
  const admitted = inspect();
  assert.match(admitted.id, /^[0-9a-f]{64}$/);
  assert.equal(admitted.name, `/${container}`);
  assert.equal(admitted.project, project);
  assert.equal(admitted.running, true);
  const baseline = readFileSync(path.join(repoRoot, 'supabase/test-fixtures/baseline.sql'), 'utf8');
  const sources = [baseline, ...sourceFiles.map(file => {
    const relative = path.relative(repoRoot, path.resolve(file));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    return readFileSync(file, 'utf8');
  })];
  const profile = concurrencyIdentityProfile(randomUUID(), sources);
  const verify = () => assert.deepEqual(inspect(), admitted, 'The owned CI database was replaced.');
  return Object.freeze({ ...profile,
    guardSetup: sql => { verify(); return guardConcurrencySetup(sql, profile); },
    loadBaseline({ paidCost = false } = {}) {
      verify();
      docker(['exec','-i',admitted.id,'psql','-X','-qAt','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
        concurrencyBaselineSql(baseline, profile));
      if (paidCost) {
        verify();
        execute(process.execPath, [path.join(repoRoot,'node_modules/tsx/dist/cli.mjs'),
          path.join(repoRoot,'scripts/load-paid-cost-scenarios-fixture.ts')], undefined,
        { ...process.env, NESTORY_CONCURRENCY_FIXTURE_NAMESPACE: profile.namespace, SUPABASE_DB_CONTAINER: container });
      }
    },
  });
}
