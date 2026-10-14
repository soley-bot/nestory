import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDepositCandidateTarget, configuredDepositContainer, selectDepositContainer } from './deposit-candidate-target.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { custodyConcurrency } from './test-deposit-custody-concurrency.mjs';
import { propertyConcurrencyTarget } from './property-concurrency-target.mjs';

const config = 'project_id = "nestory-ips-readiness-20261014"\n';
const container = 'supabase_db_nestory-ips-readiness-20261014';
const target = { config, container, db: 'deposit_candidate_1791972000000', endpoint: 'unix:///var/run/docker.sock' };

test('selects only the configured worktree container even when the default stack is running', () => {
  assert.equal(selectDepositContainer(config, ['supabase_db_nestory', container]), container);
  assert.equal(selectDepositContainer(config, [container], container), container);
  assert.equal(selectDepositContainer('project_id = "nestory"', ['supabase_db_nestory']), 'supabase_db_nestory');
});

test('never falls back to another running stack or a conflicting explicit target', () => {
  assert.throws(() => selectDepositContainer(config, ['supabase_db_nestory']), /not running/);
  assert.throws(() => selectDepositContainer(config, ['supabase_db_nestory', container], 'supabase_db_nestory'), /does not match/);
});

test('requires one valid configured project identity', () => {
  for (const invalid of ['', 'project_id = "bad/name"', 'project_id = "one"\nproject_id = "two"', 'project_id = ""']) {
    assert.throws(() => configuredDepositContainer(invalid), /project_id/);
  }
});

test('creation, workers and cleanup can target only the generated disposable database', () => {
  assert.doesNotThrow(() => assertDepositCandidateTarget(target, 'linux'));
  for (const db of ['postgres', 'deposit_candidate_', 'deposit_candidate_123;DROP DATABASE postgres', 'other_123', undefined]) {
    assert.throws(() => assertDepositCandidateTarget({ ...target, db }, 'linux'), /process-owned/);
  }
  assert.throws(() => assertDepositCandidateTarget({ ...target, container: 'supabase_db_nestory' }, 'linux'), /configured/);
});

test('rejects remote engines and accepts only supported local endpoints', () => {
  for (const endpoint of ['ssh://remote', 'tcp://127.0.0.1:2375', 'tcp://remote:2376', 'unix:///tmp/other.sock']) {
    assert.throws(() => assertDepositCandidateTarget({ ...target, endpoint }, 'linux'), /local Docker endpoint/);
  }
  for (const endpoint of ['npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine']) {
    assert.doesNotThrow(() => assertDepositCandidateTarget({ ...target, endpoint }, 'win32'));
  }
});

test('concurrency rejects an unowned target before starting workers or querying a database', async () => {
  let queried = false;
  const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : target.endpoint;
  await assert.rejects(custodyConcurrency({ ...target, endpoint, db: 'postgres', sql: () => { queried = true; } }), /process-owned/);
  assert.equal(queried, false);
});

test('Docker discovery pins inspection and execution to its verified local endpoint', async () => {
  const calls = [];
  const execute = (command, args, input, options) => {
    calls.push({ command, args, input, options });
    if (args[0] === 'context' && args[1] === 'show') return 'default\n';
    if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify(target.endpoint);
    return `${container}\n`;
  };
  const { docker, endpoint } = await localRecoveryDocker({ execute, platform: 'linux', env: { PATH: '/test/path' } });
  assert.equal(endpoint, target.endpoint);
  const running = docker(['ps', '--format', '{{.Names}}']).trim().split('\n');
  assert.equal(selectDepositContainer(config, running), container);
  assert.deepEqual(calls.at(-1).args, ['--host', target.endpoint, 'ps', '--format', '{{.Names}}']);
  assert.deepEqual(calls.at(-1).options.env, { PATH: '/test/path' });
});

test('Docker environment overrides fail before any discovery or execution', async () => {
  for (const variable of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'DOCKER_API_VERSION']) {
    let executed = false;
    await assert.rejects(localRecoveryDocker({ execute: () => { executed = true; }, env: { [variable]: 'override' } }), /overrides/);
    assert.equal(executed, false);
  }
});

function propertyHarness(overrides = {}) {
  const calls = [];
  const localEndpoint = overrides.platform === 'win32' ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : target.endpoint;
  let metadata = { id: 'a'.repeat(64), name: `/${container}`, project: 'nestory-ips-readiness-20261014', running: true };
  const worker = { syntheticWorker: true };
  const execute = (command, args, input, options = {}) => {
    calls.push({ command, args, input, options });
    if (args[0] === 'context' && args[1] === 'show') return 'default\n';
    if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify(overrides.endpoint ?? localEndpoint);
    assert.deepEqual(args.slice(0, 2), ['--host', localEndpoint]);
    if (args[2] === 'ps') return `${container}\nsupabase_db_nestory\n`;
    if (args[2] === 'inspect') return JSON.stringify(metadata);
    if (options.worker) return worker;
    return 'synthetic-result\n';
  };
  return { calls, worker, replace: value => { metadata = { ...metadata, ...value }; },
    options: { config, execute, platform: overrides.platform ?? 'linux', env: { PATH: '/synthetic', PROPERTY_CONCURRENCY_DB_CONTAINER: container, ...overrides.env } } };
}

test('property target refuses remote environment overrides before any Docker discovery or worker', async () => {
  for (const env of [{ DOCKER_HOST: 'ssh://remote' }, { DOCKER_HOST: 'tcp://remote:2376' }, { DOCKER_CONTEXT: 'remote' }, { DOCKER_CONFIG: '/remote/config' }]) {
    const h = propertyHarness({ env });
    await assert.rejects(propertyConcurrencyTarget(h.options), /overrides/);
    assert.equal(h.calls.length, 0);
  }
});

test('property target refuses remote active contexts before container discovery or SQL', async () => {
  for (const endpoint of ['ssh://remote', 'tcp://remote:2376', 'tcp://127.0.0.1:2375', 'unix:///tmp/unapproved.sock']) {
    const h = propertyHarness({ endpoint });
    await assert.rejects(propertyConcurrencyTarget(h.options), /local Docker endpoint/);
    assert.deepEqual(h.calls.map(call => call.args.slice(0, 2)), [['context', 'show'], ['context', 'inspect']]);
  }
});

test('property discovery, every SQL call, cleanup and worker keep the pinned local endpoint and full identity', async () => {
  const h = propertyHarness();
  const database = await propertyConcurrencyTarget(h.options);
  h.options.env.DOCKER_HOST = 'ssh://later-override';
  h.options.env.DOCKER_CONTEXT = 'later-override';
  assert.equal(database.run('SELECT synthetic_read;'), 'synthetic-result');
  assert.equal(database.spawnWorker(), h.worker);
  assert.equal(database.run('DELETE synthetic_owned_fixture;'), 'synthetic-result');
  const executions = h.calls.filter(call => call.args[2] === 'exec');
  assert.equal(executions.length, 3);
  for (const call of h.calls.slice(2)) {
    assert.deepEqual(call.args.slice(0, 2), ['--host', target.endpoint]);
    assert.equal(call.options.env.DOCKER_HOST, undefined);
    assert.equal(call.options.env.DOCKER_CONTEXT, undefined);
  }
  for (const call of executions) assert.deepEqual(call.args.slice(2, 6), ['exec', '-i', 'a'.repeat(64), 'psql']);
  assert.equal(h.calls.filter(call => call.args[2] === 'inspect').length, 4);
  assert.deepEqual(executions.map(call => Boolean(call.options.worker)), [false, true, false]);
});

test('property target fails closed for replaced or foreign containers before SQL and workers', async () => {
  for (const change of [{ id: 'b'.repeat(64) }, { name: '/supabase_db_other' }, { project: 'other' }, { running: false }]) {
    const h = propertyHarness();
    const database = await propertyConcurrencyTarget(h.options);
    h.replace(change);
    assert.throws(() => database.run('SELECT should_not_run;'));
    assert.throws(() => database.spawnWorker());
    assert.equal(h.calls.filter(call => call.args[2] === 'exec').length, 0);
  }
});

test('property target retains explicit isolated development and configured CI target requirements', async () => {
  for (const env of [
    { PROPERTY_CONCURRENCY_DB_CONTAINER: undefined },
    { PROPERTY_CONCURRENCY_DB_CONTAINER: 'supabase_db_nestory' },
    { CI: 'true', PROPERTY_CONCURRENCY_DB_CONTAINER: 'supabase_db_other' },
    { SUPABASE_DB_CONTAINER: 'supabase_db_other' },
  ]) {
    const h = propertyHarness({ env });
    await assert.rejects(propertyConcurrencyTarget(h.options));
    assert.equal(h.calls.filter(call => call.args[2] === 'exec').length, 0);
  }
  for (const platform of ['linux', 'win32']) {
    const ci = propertyHarness({ platform, env: { CI: 'true', PROPERTY_CONCURRENCY_DB_CONTAINER: undefined } });
    const database = await propertyConcurrencyTarget(ci.options);
    assert.equal(database.container, container);
    assert.equal(database.run('SELECT synthetic_read;'), 'synthetic-result');
    assert.equal(database.spawnWorker(), ci.worker);
  }
});
