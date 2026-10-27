import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { SESSION_TESTS, databaseTestPlan, localDatabaseTestTarget, verifyPgTapOutput } from './run-database-tests.mjs';

test('all eleven privileged tests stay classified and every other SQL test remains ordinary', () => {
  const root = new URL('../supabase/tests/', import.meta.url);
  const files = readdirSync(root).filter(name => name.endsWith('.sql')).map(name => ({ name, source: readFileSync(new URL(name, root), 'utf8') }));
  const plan = databaseTestPlan(files);
  assert.equal(plan.session.length, 11);
  assert.ok(plan.session.some(file => file.name === 'financial_reset_empty_books_test.sql'));
  assert.equal(plan.ordinary.length + plan.session.length, files.length);
  assert.throws(() => databaseTestPlan(files.filter(file => file.name !== SESSION_TESTS[0])), /exactly once/);
  assert.throws(() => databaseTestPlan([...files, { name: 'unexpected.sql', source: 'SET SESSION AUTHORIZATION authenticator;' }]), /classification/);
  assert.throws(() => databaseTestPlan([...files, files.find(file => file.name === SESSION_TESTS[0])]), /exactly once/);
});

test('strict TAP validation rejects failures, missing assertions and missing plans', () => {
  assert.equal(verifyPgTapOutput('ok 1 - first\nok 2 - second\n1..2\n', 'proof'), 2);
  assert.equal(verifyPgTapOutput('1..2\nok 1 - first\nok 2 # SKIP Original-date success path is eligible only during October 2026; no clock override is used.\n', 'financial_reset_original_invoice_dates_test.sql'), 2);
  assert.equal(verifyPgTapOutput('1..2\nok 1 - first\nok 2 # SKIP October-only success path is not executed with a fabricated database clock.\n', 'financial_reset_empty_books_test.sql'), 2);
  assert.throws(() => verifyPgTapOutput('1..1\nok 1 # SKIP unexpected\n', 'financial_reset_empty_books_test.sql'));
  for (const bad of ['ok 1 - first', '1..2\nok 1 - first', '1..1\nnot ok 1 - failed', '1..1\nBail out! denied', '1..1\nok 2 - wrong', '1..1\nok 1 - ignored # TODO later', '1..0 # SKIP all', '1..1\n1..1\nok 1 - first', '1..1\nok 1 # SKIP unexpected']) {
    assert.throws(() => verifyPgTapOutput(bad, 'proof'));
  }
});

function fixture(overrides = {}) {
  const calls = [];
  let identity = { id: 'a'.repeat(64), name: '/supabase_db_owned', project: 'owned', running: true };
  const execute = (command, args, input) => {
    calls.push({ command, args, input });
    if (args[0] === 'context' && args[1] === 'show') return 'default';
    if (args[0] === 'context') return '"unix:///var/run/docker.sock"';
    if (args[2] === 'inspect') return JSON.stringify(identity);
    return 't\n';
  };
  return { calls, setIdentity: value => { identity = value; }, options: { config: 'project_id = "owned"', execute, env: {}, platform: 'linux', ...overrides } };
}

test('target binds configured local project, immutable container ID and existing Unix-socket administrator', async () => {
  const f = fixture(); const target = await localDatabaseTestTarget(f.options); target.run('SELECT 1;');
  const psql = f.calls.find(call => call.args.includes('psql'));
  assert.deepEqual(psql.args.slice(-10), ['-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']);
  assert.ok(f.calls.every(call => !call.args.includes('ALTER ROLE')));
  f.setIdentity({ id: 'b'.repeat(64), name: '/supabase_db_owned', project: 'owned', running: true });
  assert.throws(() => target.run('SELECT 1;'), /replaced/);
});

test('target rejects remote or conflicting connections before SQL', async () => {
  for (const env of [{ DATABASE_URL: 'forbidden' }, { PGHOST: 'remote' }, { PGUSER: 'other' }, { PGPASSWORD: 'not-read' }, { PGOPTIONS: 'override' }, { DOCKER_HOST: 'tcp://remote' }, { SUPABASE_DB_CONTAINER: 'supabase_db_other' }]) {
    const f = fixture({ env }); await assert.rejects(localDatabaseTestTarget(f.options));
    assert.ok(!f.calls.some(call => call.args.includes('psql')));
  }
  const f = fixture(); f.setIdentity({ id: 'a'.repeat(64), name: '/supabase_db_owned', project: 'other', running: true });
  await assert.rejects(localDatabaseTestTarget(f.options));
  assert.ok(!f.calls.some(call => call.args.includes('psql')));
});
