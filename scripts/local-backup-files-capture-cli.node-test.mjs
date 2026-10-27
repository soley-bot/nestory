import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFileCaptureStart, createFileSourceWitnessHandshake } from './local-backup-files-capture-cli.mjs';
const id = '11111111-1111-4111-8111-111111111111', hash = 'a'.repeat(64);
const start = () => ({ format: 'nestory-local-files-capture-start-v1', keyId: id, archiveId: id, archiveSha256: hash, sourceSha256: hash });
test('capture start accepts only fixed private archive locators and digests', () => {
  assert.deepEqual(assertFileCaptureStart(start()), start());
  for (const v of [{ ...start(), path: 'C:\\private.json' }, { ...start(), url: 'https://other.invalid' },
    { ...start(), keyId: '../escape' }, { ...start(), sourceSha256: '' }]) assert.throws(() => assertFileCaptureStart(v));
});
test('source witness requires two separate parent replies with fresh challenges', async () => {
  const requests = []; let expected;
  const witness = createFileSourceWitnessHandshake({ writeLine: request => { requests.push(request); expected = request; },
    readLine: async () => ({ format: 'nestory-local-files-source-witness-response-v1', sequence: expected.sequence,
      challenge: expected.challenge, sourceSha256: hash }) });
  assert.deepEqual(await witness(), { sourceSha256: hash });
  assert.deepEqual(await witness(), { sourceSha256: hash });
  assert.deepEqual(requests.map(r => r.phase), ['before-downloads', 'after-downloads']);
  assert.notEqual(requests[0].challenge, requests[1].challenge);
  for (const r of requests) assert.deepEqual(Object.keys(r).sort(), ['challenge', 'format', 'phase', 'sequence']);
  await assert.rejects(witness());
});
test('replaying the before witness as the after witness is rejected', async () => {
  let saved;
  const witness = createFileSourceWitnessHandshake({ writeLine: request => { saved ??= request; },
    readLine: async () => ({ format: 'nestory-local-files-source-witness-response-v1', sequence: saved.sequence,
      challenge: saved.challenge, sourceSha256: hash }) });
  await witness(); await assert.rejects(witness());
});
for (const [name, alter] of [
  ['wrong challenge', r => { r.challenge = id; }], ['wrong sequence', r => { r.sequence = 2; }],
  ['raw row payload', r => { r.rows = ['private']; }], ['invalid hash', r => { r.sourceSha256 = 'unchanged'; }],
]) test(`witness refuses ${name}`, async () => {
  let request;
  const witness = createFileSourceWitnessHandshake({ writeLine: r => { request = r; }, readLine: async () => {
    const r = { format: 'nestory-local-files-source-witness-response-v1', sequence: request.sequence, challenge: request.challenge, sourceSha256: hash };
    alter(r); return r;
  } });
  await assert.rejects(witness());
});
test('missing parent result cannot turn into a constant saved source assertion', async () => {
  let requested = 0;
  const witness = createFileSourceWitnessHandshake({ writeLine: () => { requested++; }, readLine: async () => { throw Error('parent unavailable'); } });
  await assert.rejects(witness()); assert.equal(requested, 1);
});
test('concurrent witness requests fail before requesting a second observation', async () => {
  let request, resolve;
  const witness = createFileSourceWitnessHandshake({ writeLine: r => { request = r; }, readLine: () => new Promise(r => { resolve = r; }) });
  const first = witness(); await assert.rejects(witness());
  resolve({ format: 'nestory-local-files-source-witness-response-v1', sequence: request.sequence, challenge: request.challenge, sourceSha256: hash });
  await first;
});
