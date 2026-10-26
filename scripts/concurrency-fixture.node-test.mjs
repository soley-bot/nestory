import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { concurrencyIdentityProfile, FIXTURE_UUID } from './concurrency-fixture-identities.mjs';
import { concurrencyBaselineSql, guardConcurrencySetup, createConcurrencyFixture } from './concurrency-fixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
const baseline = readFileSync(path.join(root, 'supabase/test-fixtures/baseline.sql'), 'utf8');
const historical = readFileSync(path.join(root, 'supabase/tests/historical_rent_correction_execution_test.sql'), 'utf8');
const zero = '00000000-0000-0000-0000-000000000000';

test('each case remaps all fixed UUIDs and emails without rewriting generated IDs or Auth sentinel', () => {
  const a = concurrencyIdentityProfile(randomUUID(), [baseline, historical]);
  const b = concurrencyIdentityProfile(randomUUID(), [baseline, historical]);
  const ids = [...new Set((baseline + historical).match(FIXTURE_UUID))];
  for (const id of ids) {
    if (id === zero) assert.equal(a.id(id), id);
    else {
      assert.notEqual(a.id(id), b.id(id));
      assert.match(a.id(id), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(a.sql(a.id(id)), a.id(id));
      assert.ok(!a.sql(baseline + historical).includes(id));
    }
  }
  const generated = randomUUID();
  assert.equal(a.sql(generated), generated);
  assert.equal(a.sql('nestory@gmail.com'), a.email('nestory@gmail.com'));
  assert.notEqual(a.email('nestory@gmail.com'), b.email('nestory@gmail.com'));
  assert.doesNotMatch(a.sql(historical), /'@lease-rent\.test'|'lease-rent-test'/);
  assert.doesNotMatch(a.sql(baseline), /'nestory-sample-operations'/);
});

test('new case seed admits collisions before writes and checks prior organizations before commit', () => {
  const profile = concurrencyIdentityProfile(randomUUID(), [baseline]);
  const sql = concurrencyBaselineSql(baseline, profile);
  assert.ok(sql.indexOf('Concurrency fixture identity collision') < sql.indexOf('INSERT INTO auth.users'));
  assert.match(sql, /inet_server_addr\(\) IS NOT NULL/);
  assert.match(sql, /concurrency_preserved_scope/);
  assert.match(sql, /RESET ROLE; SELECT pg_temp.assert_concurrency_preserved\(\);\s*COMMIT;\s*$/);
  assert.doesNotMatch(sql, /run_due_rent_generation|\bTRUNCATE\b|DELETE\s+FROM/i);
  assert.match(sql, /lease_scope.organization_id, lease_scope.id, 'scheduled', now\(\)/);
  assert.match(sql, /begin_financial_scheduled_scope\(lease_scope.organization_id\)/);
  assert.match(sql, /lease.organization_id=runtime.organization_id/);
  assert.match(baseline, /fixture_fresh_database/);
  assert.match(baseline, /requires a fresh disposable database/);
});

test('historical seed gets the same guard without baseline reload and transaction shape changes fail closed', () => {
  const profile = concurrencyIdentityProfile(randomUUID(), [historical]);
  const seed = historical.split('SELECT lives_ok($$SELECT public.preview_historical_rent_correction(')[0]
    .replace('SELECT no_plan();', '') + '\nCOMMIT;';
  const sql = guardConcurrencySetup(seed, profile);
  assert.match(sql, /Concurrency fixture identity collision/);
  assert.match(sql, /assert_concurrency_preserved/);
  assert.doesNotMatch(sql, /a1000000-0000-0000-0000-000000000001|'@lease-rent\.test'|'lease-rent-test'/);
  assert.throws(() => guardConcurrencySetup('SELECT 1;', profile));
  assert.throws(() => guardConcurrencySetup('BEGIN;\nCOMMIT;\nBEGIN;\nCOMMIT;', profile));
});

test('preservation fingerprints share a timezone-pinned function across the business timezone change', () => {
  const profile = concurrencyIdentityProfile(randomUUID(), [baseline]);
  const sql = concurrencyBaselineSql(baseline, profile);
  assert.match(sql, /CREATE FUNCTION pg_temp.concurrency_relation_digest\(p_relation regclass,p_ids uuid\[\]\)\s*RETURNS text LANGUAGE plpgsql SET timezone='UTC'/);
  assert.equal((sql.match(/signature := pg_temp\.concurrency_relation_digest\(c\.relation,/g) ?? []).length, 2);
  assert.equal((sql.match(/string_agg\(to_jsonb\(r\)::text/g) ?? []).length, 1);
  assert.match(sql, /SET LOCAL TIME ZONE 'Asia\/Phnom_Penh'/);
  assert.match(sql, /Concurrency fixture changed an existing organization in %/);
});

test('case factory rejects non-CI before any Docker or database operation', () => {
  const previous = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = 'false';
  try { assert.throws(() => createConcurrencyFixture({ repoRoot: root, container: 'supabase_db_nestory' }), /disposable GitHub CI/); }
  finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});
