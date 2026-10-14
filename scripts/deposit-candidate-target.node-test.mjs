import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDepositCandidateTarget, configuredDepositContainer, selectDepositContainer } from './deposit-candidate-target.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { custodyConcurrency } from './test-deposit-custody-concurrency.mjs';

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
