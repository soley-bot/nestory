import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { assertPilotCredentialCliInstallation, pilotCredentialCliEnvironment, pilotCredentialCliRequest, selectPilotHostedCredential,
  exercisePilotCredentialRead, collectPilotCredentialOutput, PILOT_HOSTED_PROJECT_REF } from './local-backup-file-credential.mjs';

const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const key = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', ref: PILOT_HOSTED_PROJECT_REF, role: 'service_role', exp: 4102444800 })}.syntheticSignatureNeverARealKey`;
const legacy = value => ({ name: 'service_role', id: 'service_role', type: 'legacy', api_key: value, hash: 'synthetic-hash' });
const secret = value => ({ name: 'default', id: '00000000-0000-4000-8000-000000000001', type: 'secret', api_key: value, secret_jwt_template: { role: 'service_role' } });
// Build the documented prefix at runtime; this fixture is deliberately not a
// complete provider credential literal in repository source.
const syntheticServerValue = ['sb', 'secret', 'syntheticNeverARealCredential'].join('_');
const bytes = rows => Buffer.from(JSON.stringify(rows));

test('fixed installed launcher and native binary match lockfile and independent byte pins offline', { skip: process.platform !== 'win32' }, async () => {
  const evidence = await assertPilotCredentialCliInstallation();
  assert.equal(evidence.version, '2.108.0'); assert.match(evidence.launcherSha256, /^[a-f0-9]{64}$/);
});
test('request pins executable, project, JSON output and optional reveal without any key argument', () => {
  const normal = pilotCredentialCliRequest(false, { SUPABASE_ACCESS_TOKEN: 'synthetic-token' });
  assert.equal(normal.executable, process.execPath);
  assert.match(normal.args[0], /node_modules[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
  assert.deepEqual(normal.args.slice(1), ['projects', 'api-keys', '--project-ref', PILOT_HOSTED_PROJECT_REF, '--output', 'json']);
  assert.deepEqual(pilotCredentialCliRequest(true).args, [...normal.args, '--reveal']);
  assert.equal(normal.options.cwd, 'C:\\Windows\\System32');
  assert.equal(normal.options.shell, false); assert.equal(normal.options.windowsHide, true);
  assert.deepEqual(normal.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.doesNotMatch(JSON.stringify(normal), /synthetic-token/);
});
test('only normal profile plumbing survives; endpoint, token, executable, debug and Node/proxy overrides do not', () => {
  const env = pilotCredentialCliEnvironment({ USERPROFILE: 'C:\\synthetic', SUPABASE_CLI_BINARY_OVERRIDE: 'evil', SUPABASE_API_URL: 'evil',
    SUPABASE_ACCESS_TOKEN: 'dummy',
    SUPABASE_PROFILE: 'evil', SUPABASE_DEBUG: '1', NODE_OPTIONS: 'evil', NODE_PATH: 'evil', HTTPS_PROXY: 'evil',
    supabase_api_url: 'evil', SystemRoot: 'evil', PATH: 'evil', DO_NOT_TRACK: '0' });
  assert.equal(env.USERPROFILE, 'C:\\synthetic'); assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.DO_NOT_TRACK, '1'); assert.equal(env.SUPABASE_TELEMETRY_DISABLED, '1');
  assert.doesNotMatch(JSON.stringify(env), /evil|dummy/);
});
test('selects exact legacy service role and does not confuse anon or other secret keys', () => {
  const result = selectPilotHostedCredential(bytes([{ name: 'anon', api_key: 'synthetic-anon' }, legacy(key), secret(syntheticServerValue)]));
  assert.equal(result.key === key, true); assert.equal(result.redacted, false);
});
test('selects only one current typed server secret if no legacy exists', () => {
  const result = selectPilotHostedCredential(bytes([secret(syntheticServerValue)]));
  assert.equal(result.redacted, false);
});
for (const [name, input, code] of [
  ['malformed JSON', Buffer.from('{'), 'response_invalid'],
  ['wrapped output instead of fixed JSON array', bytes({ keys: [legacy(key)] }), 'response_invalid'],
  ['missing api_key', bytes([{ name: 'service_role' }]), 'response_invalid'],
  ['unknown empty list', bytes([]), 'response_invalid'],
  ['duplicate service role', bytes([legacy(key), legacy(key)]), 'ambiguous'],
  ['duplicate current secret', bytes([secret(syntheticServerValue), secret(syntheticServerValue)]), 'ambiguous'],
  ['anon only', bytes([{ name: 'anon', api_key: key }]), 'missing'],
  ['masked partial key', bytes([legacy('eyJh***synthetic-not-a-complete-key')]), 'key_invalid'],
  ['wrong role project JWT', bytes([legacy(`${encode({ alg: 'HS256' })}.${encode({ iss: 'supabase', ref: 'wrong-project', role: 'service_role', exp: 4102444800 })}.synthetic`)]), 'key_invalid'],
  ['expired JWT', bytes([legacy(`${encode({ alg: 'HS256' })}.${encode({ iss: 'supabase', ref: PILOT_HOSTED_PROJECT_REF, role: 'service_role', exp: 1 })}.synthetic`)]), 'key_invalid'],
  ['typed secret without server role', bytes([{ ...secret(syntheticServerValue), secret_jwt_template: null }]), 'response_invalid'],
]) test(`rejects ${name} with fixed diagnostic only`, () => {
  assert.throws(() => selectPilotHostedCredential(input), { message: `local_backup_files_cli_credential_${code}` });
});
test('unredacted legacy needs one request and captured response buffer is erased', async () => {
  const output = bytes([legacy(key)]), calls = [];
  const result = await exercisePilotCredentialRead(async reveal => { calls.push(reveal); return output; });
  assert.equal(result === key, true); assert.deepEqual(calls, [false]); assert.equal(output.every(n => n === 0), true);
});
test('redacted selection reveals exactly once and preserves key identity', async () => {
  const calls = [], outputs = [bytes([legacy(null)]), bytes([legacy(key)])];
  assert.equal(await exercisePilotCredentialRead(async reveal => { calls.push(reveal); return outputs[calls.length - 1]; }) === key, true);
  assert.deepEqual(calls, [false, true]); assert.ok(outputs.every(b => b.every(n => n === 0)));
});
test('changed identity during reveal rejects instead of selecting another key', async () => {
  let count = 0;
  await assert.rejects(exercisePilotCredentialRead(async () => bytes([count++ ? { ...legacy(key), hash: 'changed' } : legacy(null)])), /reveal_changed/);
});
test('provider errors never include subprocess errors or credential bytes and are not retried', async () => {
  let calls = 0;
  await assert.rejects(exercisePilotCredentialRead(async () => { calls++; throw Error(`private synthetic detail ${key}`); }), { message: 'local_backup_files_cli_credential_request_failed' });
  assert.equal(calls, 1);
});
function child() { const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); return c; }
test('bounded pipe collector discards stderr and delivers stdout only on successful completion', async () => {
  const c = child(), output = bytes([legacy(key)]); let stopped = 0;
  const result = collectPilotCredentialOutput(c, () => stopped++);
  c.stderr.write(Buffer.from('synthetic discarded diagnostics')); c.stdout.write(Buffer.from(output)); c.emit('close', 0, null);
  const value = await result; assert.equal(value.equals(output), true); value.fill(0); output.fill(0); assert.equal(stopped, 0);
});
for (const [name, trigger, error] of [
  ['spawn error', c => c.emit('error', Error('sensitive synthetic diagnostic')), 'request_failed'],
  ['output budget', c => c.stdout.write(Buffer.alloc(128 * 1024 + 1)), 'output_limit'],
  ['stderr budget', c => c.stderr.write(Buffer.alloc(32 * 1024 + 1)), 'output_limit'],
]) test(`collector stops owned process tree on ${name}`, async () => {
  const c = child(); let stopped = 0; const pending = collectPilotCredentialOutput(c, () => stopped++);
  trigger(c); await assert.rejects(pending, { message: `local_backup_files_cli_credential_${error}` }); assert.equal(stopped, 1);
});
test('failed exit is sanitized without killing a potentially recycled closed PID', async () => {
  const c = child(); let stopped = 0; const pending = collectPilotCredentialOutput(c, () => stopped++);
  c.emit('close', 1, null); await assert.rejects(pending, { message: 'local_backup_files_cli_credential_request_failed' }); assert.equal(stopped, 0);
});
test('collector timeout has no retry and terminates whole owned tree', async () => {
  let stopped = 0;
  await assert.rejects(collectPilotCredentialOutput(child(), () => stopped++, 5), /credential_timeout/); assert.equal(stopped, 1);
});
test('production entry does not accept caller transport and never persists or prints keys', async () => {
  const source = await readFile(new URL('./local-backup-file-credential.mjs', import.meta.url), 'utf8');
  assert.match(source, /readPilotHostedServiceCredential\(\)/);
  assert.match(source, /exercisePilotCredentialRead\(invokeFixedCli\)/);
  assert.match(source, /'\/T', '\/F'/);
  assert.doesNotMatch(source, /writeFile|console\.|process\.(?:stdout|stderr)\.write|\.env\.local'\s*,\s*'utf8'/);
});
