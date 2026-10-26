import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { sha256, json } from './pilot-finance-reset-core.mjs';
import { createSyntheticPng, runSyntheticFilesApiProof } from './pilot-finance-reset-files-local.mjs';

async function setup(t, mode = 'normal') {
  const base = path.resolve(os.tmpdir()), outputDirectory = await mkdtemp(path.join(base, 'nestory-files-api-test-'));
  t.after(async () => {
    const relative = path.relative(base, path.resolve(outputDirectory));
    assert.ok(relative.startsWith('nestory-files-api-test-') && !relative.includes(path.sep));
    await rm(outputDirectory, { recursive: true, force: true });
  });
  const baseline = { bytes: Buffer.from('unrelated-baseline'), marker: {}, id: randomUUID() };
  const objects = new Map([['unrelated-baseline', baseline]]), calls = [];
  let runtimeChecks = 0, targetReads = 0;
  const metadata = (object, name) => ({ binding: { id: object.id, bucket: 'nestory-documents', name,
    version: object.version, metadataSha256: sha256(json({ id: object.id, version: object.version, marker: object.marker, name, bytes: object.bytes.length })) }, userMetadata: object.marker });
  const args = { runtimeId: '1'.repeat(64), candidateHead: 'a'.repeat(40), outputDirectory,
    assertRuntime: async () => { runtimeChecks++; if (mode === 'runtime-rejected') throw Error('driver-secret-must-never-escape'); },
    observeObject: async ({ bucket, name }) => {
      assert.equal(bucket, 'nestory-documents');
      assert.match(name, /^00000000-0000-0000-0000-000000000001\/pilot-reset-files-[a-f0-9-]+\/(source\.bin|restored-[a-f0-9]{64}\.bin)$/);
      if (mode === 'target-preexisting' && name.includes('/restored-') && !objects.has(name)) {
        objects.set(name, { id: randomUUID(), version: randomUUID(), marker: {}, bytes: Buffer.from('prior') });
      }
      const object = objects.get(name);
      return object ? structuredClone(metadata(object, name)) : null;
    },
    request: async request => {
      calls.push({ method: request.method, path: request.path });
      assert.ok(['GET', 'POST'].includes(request.method));
      const pattern = request.method === 'GET' ? /^\/object\/authenticated\/nestory-documents\/(.+)$/ : /^\/object\/nestory-documents\/(.+)$/;
      const match = request.path.match(pattern); assert.ok(match);
      const name = match[1].split('/').map(decodeURIComponent).join('/');
      if (request.method === 'POST') {
        assert.equal(request.headers['x-upsert'], 'false');
        assert.equal(request.headers['content-type'], 'image/png');
        assert.ok(request.body instanceof Uint8Array);
        assert.equal(objects.has(name), false, 'no prior object may be overwritten');
        if (mode.startsWith('http-rejected-')) return { status: 415, body: Buffer.from(JSON.stringify({
          error: mode === 'http-rejected-known' ? 'InvalidMimeType' : 'driver-secret-must-never-escape',
          message: 'driver-secret-must-never-escape' })) };
        const restored = name.includes('/restored-');
        if (restored && mode === 'lost-before-commit') throw Error('driver-secret-must-never-escape');
        const marker = JSON.parse(Buffer.from(request.headers['x-metadata'], 'base64').toString());
        objects.set(name, { id: randomUUID(), version: randomUUID(), marker: restored && mode === 'marker-conflict' ? {} : marker, bytes: Buffer.from(request.body) });
        if (restored && mode === 'target-bytes-corrupt') objects.get(name).bytes[0] ^= 255;
        if (restored && mode === 'source-mutated') {
          const source = [...objects.entries()].find(([key]) => key.endsWith('/source.bin'))[1];
          source.bytes[0] ^= 255;
        }
        if (restored && mode === 'lost-after-commit') throw Error('driver-secret-must-never-escape');
        return { status: 200, body: Buffer.from('{}') };
      }
      const object = objects.get(name);
      assert.ok(object, 'only existing exact owned objects can be read');
      if (mode === 'target-drift' && name.includes('/restored-') && ++targetReads === 1) object.version = randomUUID();
      return { status: 200, body: Buffer.from(object.bytes) };
    } };
  return { args, calls, objects, baseline, runtimeChecks: () => runtimeChecks };
}

test('synthetic fixture is a valid PNG with native-verified CRCs and all 256 grayscale values', () => {
  const runId = randomUUID(), png = createSyntheticPng(runId);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    assert.equal(png.readUInt32BE(offset + 8 + length), crc32(png.subarray(offset + 4, offset + 8 + length)));
    chunks.push({ type, data }); offset += length + 12;
  }
  assert.equal(offset, png.length);
  assert.deepEqual(chunks.map(chunk => chunk.type), ['IHDR', 'tEXt', 'IDAT', 'IEND']);
  assert.equal(chunks[0].data.readUInt32BE(0), 16); assert.equal(chunks[0].data.readUInt32BE(4), 16);
  assert.deepEqual([...chunks[0].data.subarray(8)], [8, 0, 0, 0, 0]);
  assert.equal(chunks[1].data.toString('ascii'), `SyntheticRun\0${runId}`);
  const raw = inflateSync(chunks[2].data);
  assert.equal(raw.length, 16 * 17);
  for (let y = 0; y < 16; y++) {
    assert.equal(raw[y * 17], 0);
    assert.deepEqual([...raw.subarray(y * 17 + 1, y * 17 + 17)], Array.from({ length: 16 }, (_, x) => y * 16 + x));
  }
  assert.equal(new Set(png).size, 256);
  assert.throws(() => createSyntheticPng('not-a-uuid'), /files_fixture_run_invalid/);
});

test('mocked API rehearsal archives all binary values, preserves source/baseline and uses exactly two no-upsert creates', async t => {
  const fixture = await setup(t);
  const report = await runSyntheticFilesApiProof(fixture.args);
  assert.equal(report.actualStorageApiBytesVerified, true); // Mock transport contract only, not actual API evidence.
  assert.equal(report.actualResetReferenceCensusProven, false);
  assert.equal(report.originalObjectIdentityRestored, false);
  assert.equal(report.customerRecoveryProven, false);
  assert.equal(report.lostAcknowledgmentReconciled, true);
  assert.equal(report.sourceUnchanged, true);
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 2);
  assert.ok(fixture.runtimeChecks() > fixture.calls.length);
  assert.equal(fixture.objects.get('unrelated-baseline'), fixture.baseline);
  const [source, target] = [...fixture.objects.entries()].filter(([name]) => name !== 'unrelated-baseline').map(([, object]) => object);
  assert.deepEqual(source.bytes, target.bytes);
  assert.equal(new Set(source.bytes).size, 256);
  assert.notEqual(source.id, target.id);
  const proof = JSON.parse(await readFile(path.join(fixture.args.outputDirectory, report.runId, 'proof.json'), 'utf8'));
  assert.equal(proof.archive.encrypted, false);
});

test('lost acknowledgment after the provider write reconciles without repeating POST', async t => {
  const fixture = await setup(t, 'lost-after-commit');
  const report = await runSyntheticFilesApiProof(fixture.args);
  assert.equal(report.lostAcknowledgmentReconciled, true);
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 2);
});

test('absence after a lost request stays unknown and never retries or deletes the source', async t => {
  const fixture = await setup(t, 'lost-before-commit');
  await assert.rejects(runSyntheticFilesApiProof(fixture.args), error => {
    assert.equal(error.message, 'files_restore_outcome_unknown_no_retry');
    assert.equal(error.proof.actualStorageApiBytesVerified, false);
    return true;
  });
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 2);
  assert.equal([...fixture.objects.keys()].filter(name => name.endsWith('/source.bin')).length, 1);
  const [runId] = await readdir(fixture.args.outputDirectory);
  const files = await readdir(path.join(fixture.args.outputDirectory, runId));
  assert.ok(files.includes('restore-request-started.json'));
  assert.ok(files.includes('failure.json'));
  const failure = await readFile(path.join(fixture.args.outputDirectory, runId, 'failure.json'), 'utf8');
  assert.ok(!failure.includes('driver-secret'));
});

test('preexisting target stops before a restore request', async t => {
  const fixture = await setup(t, 'target-preexisting');
  await assert.rejects(runSyntheticFilesApiProof(fixture.args), /files_restore_target_already_exists/);
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1);
  const prior = [...fixture.objects.entries()].find(([name]) => name.includes('/restored-'))[1];
  assert.equal(prior.bytes.toString(), 'prior');
});

test('foreign target marker and metadata drift refuse completion without cleanup mutations', async t => {
  for (const mode of ['marker-conflict', 'target-drift']) {
    const fixture = await setup(t, mode);
    await assert.rejects(runSyntheticFilesApiProof(fixture.args), /files_restore_target_conflict|files_restored_metadata_or_bytes_drift/);
    assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 2);
    assert.equal(fixture.objects.size, 3);
  }
});

test('same-size binary corruption and later source mutation refuse API proof', async t => {
  for (const mode of ['target-bytes-corrupt', 'source-mutated']) {
    const fixture = await setup(t, mode);
    await assert.rejects(runSyntheticFilesApiProof(fixture.args), /files_restore_bytes_mismatch|files_source_changed/);
    assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 2);
    assert.equal(fixture.objects.size, 3);
  }
});

test('runtime ownership rejection makes zero API requests and sanitizes driver messages', async t => {
  const fixture = await setup(t, 'runtime-rejected');
  await assert.rejects(runSyntheticFilesApiProof(fixture.args), error => {
    assert.equal(error.message, 'files_runtime_or_transport_failed');
    assert.ok(!JSON.stringify(error.proof).includes('driver-secret'));
    return true;
  });
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.objects.size, 1);
});

test('rejected HTTP diagnostics retain only numeric status and allowlisted error code without retry', async t => {
  for (const mode of ['http-rejected-known', 'http-rejected-unknown']) {
    const fixture = await setup(t, mode);
    await assert.rejects(runSyntheticFilesApiProof(fixture.args), error => {
      assert.equal(error.message, 'files_source_outcome_unknown_no_retry');
      assert.deepEqual(error.proof.requestRejections, [{ method: 'POST', httpStatus: 415,
        code: mode === 'http-rejected-known' ? 'InvalidMimeType' : 'unclassified_storage_error' }]);
      assert.ok(!JSON.stringify(error.proof).includes('driver-secret'));
      return true;
    });
    assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1);
    assert.equal(fixture.objects.size, 1);
  }
});
