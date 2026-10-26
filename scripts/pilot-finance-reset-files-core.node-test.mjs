import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, link } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, TARGET, json, sha256 } from './pilot-finance-reset-core.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { buildFilesPlan, filesObservation, captureFilesArchive, verifyFilesArchive, createSyntheticRestoreIntent,
  restoreMarker, reconcileSyntheticRestore, FILE_LIMITS } from './pilot-finance-reset-files-core.mjs';
import { writeSyntheticPrivateArtifact, readSyntheticPrivateArtifact, readAndVerifyFilesArchive } from './pilot-finance-reset-files-archive.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64);
const copy = value => structuredClone(value);
const bytes = Buffer.concat([Buffer.from(Array.from({ length: 256 }, (_, n) => n)), Buffer.from([0, 0xff, 0xc0, 0xaf, 0xed, 0xa0, 0x80, 13, 10])]);
const binding = (name = 'fixture/source.bin', objectId = id) => ({ id: objectId, bucket: 'nestory-documents', name, version: id2, metadataSha256: hash });
function fixture() {
  const object = binding();
  return buildManifest({ operationId: id, binding: { ...TARGET, candidateHead: 'a'.repeat(40), migrationsSha256: hash, containerId: hash, authUsers: [] },
    tables: [{ table: 'public.documents', columns: ['id', 'organization_id', 'storage_path', 'storage_object_id'],
      pk: ['id'], jsonColumns: [], unconstrainedUuidColumns: [], foreignKeys: [] }],
    rows: [{ table: 'public.documents', scope: TARGET.organization, pk: [id], sha256: hash,
      references: { id, storage_path: object.name, storage_object_id: object.id } }],
    schema: [], storageObjects: [object], registry: { 'public.documents': RESET_REGISTRY['public.documents'] } });
}
function rehash(manifest) {
  const payload = { ...manifest };
  delete payload.manifestSha256;
  return { ...payload, manifestSha256: sha256(json(payload)) };
}
const planFor = manifest => buildFilesPlan(manifest, manifest.manifestSha256);
const capture = plan => captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256, observe: async () => filesObservation(plan), download: async () => bytes });
const verify = (plan, archive) => verifyFilesArchive({ plan, expectedPlanSha256: plan.planSha256, bytes: archive.bytes, expectedArchiveSha256: archive.archiveSha256 });

test('full binary archive roundtrip preserves every byte and original id/version/metadata/row binding', async () => {
  const plan = planFor(fixture()), archive = await capture(plan), verified = verify(plan, archive);
  assert.deepEqual(verified.entries[0].bytes, bytes);
  assert.deepEqual(verified.entries[0].binding, binding());
  assert.equal(plan.references[0].rowSha256, hash);
  assert.equal(verified.encrypted, false);
  assert.equal(verified.customerRecoveryProven, false);
});

test('several row references can share one exact object without a duplicate archive entry', async () => {
  const manifest = fixture();
  const row = copy(manifest.tables[0].selectedRows[0]); row.pk = [id2]; row.references.id = id2;
  manifest.tables[0].selectedRows.push(row);
  manifest.storage.push({ ...copy(manifest.storage[0]), pk: [id2] });
  const plan = planFor(rehash(manifest)), archive = await capture(plan);
  assert.equal(plan.references.length, 2); assert.equal(archive.objectCount, 1);
});

test('zero byte objects and typed-array slices retain binary length faithfully', async () => {
  for (const value of [new Uint8Array(0), new Uint8Array(bytes.buffer, bytes.byteOffset + 1, 3)]) {
    const plan = planFor(fixture());
    const archive = await captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256,
      observe: async () => filesObservation(plan), download: async () => value });
    assert.deepEqual(verify(plan, archive).entries[0].bytes, Buffer.from(value));
  }
});

test('unaccepted, nonlocal, unbound, or customer inventory cannot reach downloads', () => {
  for (const mutate of [m => { m.syntheticOnly = false; }, m => { m.inventoryAccepted = false; },
    m => { m.executionSupported = true; }, m => { m.issues.push({ code: 'unresolved' }); },
    m => { m.binding.project = 'hosted'; }, m => { m.binding.organization = id2; },
    m => { m.binding.registrySha256 = 'b'.repeat(64); }, m => { delete m.binding.candidateHead; }]) {
    const manifest = fixture(); mutate(manifest);
    assert.throws(() => planFor(rehash(manifest)), /files_inventory_invalid/);
  }
  const manifest = fixture();
  assert.throws(() => buildFilesPlan(manifest, 'b'.repeat(64)), /files_inventory_invalid/);
  manifest.operationId = id2;
  assert.throws(() => planFor(manifest), /files_inventory_invalid/);
});

test('missing, unresolved, duplicate and stale row references refuse complete coverage', () => {
  for (const mutate of [m => { m.storage = []; }, m => { m.storage[0].resolved = false; },
    m => { m.storage.push(copy(m.storage[0])); }, m => { m.storage[0].pk = [id2]; },
    m => { m.storage[0].path = 'different'; }, m => { m.storage[0].objectId = id2; },
    m => { delete m.tables[0].selectedRows[0].references.storage_path; },
    m => { m.tables[0].selectedRows.push(copy(m.tables[0].selectedRows[0])); },
    m => { m.tables.push(copy(m.tables[0])); }]) {
    const manifest = fixture(); mutate(manifest);
    assert.throws(() => planFor(rehash(manifest)), /files_/);
  }
});

test('bucket, object, path, version and metadata digest are all mandatory bindings', () => {
  for (const mutate of [o => { o.bucket = 'wrong-bucket'; }, o => { o.id = id2; },
    o => { o.name = 'other.bin'; }, o => { o.version = null; }, o => { o.version = ''; },
    o => { o.metadataSha256 = 'invalid'; }, o => { o.name = '../escape'; },
    o => { o.name = 'fixture\\escape'; }, o => { o.name = 'fixture\nline'; },
    o => { o.extra = 'unreviewed'; }]) {
    const manifest = fixture(); mutate(manifest.storage[0].metadata);
    assert.throws(() => planFor(rehash(manifest)), /files_/);
  }
});

test('a reused object path with divergent version or metadata is refused even across separate references', () => {
  const manifest = fixture(), other = copy(manifest.tables[0].selectedRows[0]);
  other.pk = [id2]; manifest.tables[0].selectedRows.push(other);
  manifest.storage.push({ ...copy(manifest.storage[0]), pk: [id2] });
  manifest.storage[1].metadata.version = 'next-version';
  assert.throws(() => planFor(rehash(manifest)), /files_ambiguous_object_binding/);
});

test('missing object and read failures abort without returning an archive', async () => {
  const plan = planFor(fixture());
  await assert.rejects(captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256,
    observe: async () => filesObservation(plan), download: async () => { throw Error('object_missing'); } }), /object_missing/);
  await assert.rejects(captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256,
    observe: async () => ({ references: plan.references, objects: [] }), download: async () => assert.fail('download') }), /files_reference_or_metadata_drift/);
});

test('every object and row-reference drift is checked before and after binary downloads', async () => {
  const plan = planFor(fixture());
  for (const mutate of [s => { s.objects[0].id = id2; }, s => { s.objects[0].bucket = 'wrong'; },
    s => { s.objects[0].name = 'other'; }, s => { s.objects[0].version = 'changed'; },
    s => { s.objects[0].metadataSha256 = 'b'.repeat(64); }, s => { s.references[0].rowSha256 = 'b'.repeat(64); },
    s => { s.references.push(copy(s.references[0])); }, s => { s.references = []; }]) {
    let observations = 0;
    await assert.rejects(captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256,
      observe: async () => { const observed = filesObservation(plan); if (++observations >= 3) mutate(observed); return observed; },
      download: async () => bytes }), /files_reference_or_metadata_drift/);
  }
});

test('changed download bytes, text coercion and oversized objects are refused', async () => {
  const plan = planFor(fixture());
  for (const download of [async () => bytes.toString(), async () => Buffer.alloc(FILE_LIMITS.objectBytes + 1),
    (() => { let calls = 0; return async () => ++calls === 1 ? bytes : Buffer.from('changed'); })()]) {
    await assert.rejects(captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256, observe: async () => filesObservation(plan), download }), /files_/);
  }
});

test('mutating the caller plan while awaiting a download cannot change the captured bindings', async () => {
  const plan = planFor(fixture()), original = copy(plan);
  const archive = await captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256,
    observe: async () => filesObservation(original), download: async () => { plan.objects[0].name = 'changed'; return bytes; } });
  assert.deepEqual(verify(original, archive).entries[0].binding, original.objects[0]);
});

test('archive requires independent exact digest and refuses all byte, size, metadata and coverage tampering', async () => {
  const plan = planFor(fixture()), archive = await capture(plan);
  assert.throws(() => verify(plan, { ...archive, archiveSha256: 'b'.repeat(64) }), /files_archive_digest_mismatch/);
  for (const mutate of [a => { a.objects[0].base64 = Buffer.from('tampered').toString('base64'); },
    a => { a.objects[0].byteLength++; }, a => { a.objects[0].sha256 = 'b'.repeat(64); },
    a => { a.objects[0].binding.version = 'changed'; }, a => { a.objects[0].binding.metadataSha256 = 'b'.repeat(64); },
    a => { a.objects = []; }, a => { a.objects.push(copy(a.objects[0])); }, a => { a.totalBytes++; },
    a => { a.objects[0].base64 += '\n'; }, a => { a.encrypted = true; },
    a => { a.customerRecoveryProven = true; }, a => { a.extra = 'unknown'; }]) {
    const body = JSON.parse(archive.bytes.toString()); mutate(body);
    const modified = Buffer.from(`${json(body)}\n`);
    assert.throws(() => verify(plan, { bytes: modified, archiveSha256: sha256(modified) }), /files_/);
  }
});

test('noncanonical JSON and duplicate JSON keys cannot conceal archive fields', async () => {
  const plan = planFor(fixture()), archive = await capture(plan);
  for (const text of [archive.bytes.toString().replace('"encrypted":false', '"encrypted":true,"encrypted":false'),
    JSON.stringify(JSON.parse(archive.bytes.toString()), null, 2)]) {
    const modified = Buffer.from(text);
    assert.throws(() => verify(plan, { bytes: modified, archiveSha256: sha256(modified) }), /files_archive_invalid/);
  }
});

test('restart reconciliation verifies the exact new target and never grants retries or original-identity restoration', async () => {
  const plan = planFor(fixture()), archive = await capture(plan);
  const intent = createSyntheticRestoreIntent({ plan, archiveBytes: archive.bytes, archiveSha256: archive.archiveSha256, runId: id2 });
  const item = intent.objects[0];
  const target = { ...binding(item.target.name, id2), version: 'new-version' };
  const args = { intent: JSON.parse(json(intent)), expectedIntentSha256: intent.intentSha256, item, started: true };
  assert.deepEqual(reconcileSyntheticRestore({ ...args, observation: null }),
    { status: 'unknown', mutationAllowed: false, retryAllowed: false, originalIdentityRestored: false });
  const result = reconcileSyntheticRestore({ ...args, observation: { binding: target, userMetadata: restoreMarker(intent, item) }, bytes });
  assert.equal(result.status, 'verified'); assert.equal(result.retryAllowed, false);
  assert.equal(result.originalIdentityRestored, false); assert.deepEqual(result.source, binding());
  assert.notEqual(result.source.id, result.target.id); assert.notEqual(result.source.version, result.target.version);
  for (const change of [a => { a.observation.binding.name = 'other'; }, a => { a.observation.userMetadata.runId = id; },
    a => { a.bytes = Buffer.from('changed'); }, a => { a.started = false; }, a => { a.expectedIntentSha256 = hash; }]) {
    const input = { ...copy(args), observation: { binding: copy(target), userMetadata: restoreMarker(intent, item) }, bytes };
    change(input); assert.throws(() => reconcileSyntheticRestore(input), /files_/);
  }
});

async function temporary(testContext) {
  const base = path.resolve(os.tmpdir()), directory = await mkdtemp(path.join(base, 'nestory-files-test-'));
  testContext.after(async () => {
    const resolved = path.resolve(directory), relative = path.relative(base, resolved);
    assert.ok(relative.startsWith('nestory-files-test-') && !relative.includes(path.sep));
    await rm(resolved, { recursive: true, force: true });
  });
  return directory;
}

test('exclusive private-directory output roundtrips exact bytes and never replaces a prior artifact', async t => {
  const directory = await temporary(t), file = path.join(directory, 'archive.json');
  const plan = planFor(fixture()), archive = await capture(plan);
  const receipt = await writeSyntheticPrivateArtifact(file, archive.bytes);
  assert.equal(receipt.sha256, archive.archiveSha256);
  assert.equal(receipt.customerArchiveAuthorityEstablished, false);
  if (process.platform === 'win32') assert.equal(receipt.filesystemPrivacyVerified, false);
  const restored = await readAndVerifyFilesArchive({ inputPath: file, expectedArchiveSha256: archive.archiveSha256, plan, expectedPlanSha256: plan.planSha256 });
  assert.deepEqual(restored.entries[0].bytes, bytes);
  await assert.rejects(writeSyntheticPrivateArtifact(file, Buffer.from('replace')), /files_artifact_exists_no_overwrite/);
  assert.deepEqual(await readFile(file), archive.bytes);
});

test('missing, partial and tampered files fail readback; failed files remain for reconciliation', async t => {
  const directory = await temporary(t), file = path.join(directory, 'partial');
  await assert.rejects(readSyntheticPrivateArtifact(file, hash), /files_artifact_read_failed/);
  await writeFile(file, Buffer.from('partial'), { mode: 0o600 });
  await assert.rejects(readSyntheticPrivateArtifact(file, hash), /files_artifact_digest_mismatch/);
  assert.equal((await readFile(file)).toString(), 'partial');
});

test('checkout and relative paths refuse archive IO', async () => {
  await assert.rejects(writeSyntheticPrivateArtifact('relative', bytes), /files_absolute_artifact_path_required/);
  await assert.rejects(writeSyntheticPrivateArtifact(path.resolve(import.meta.dirname, '..', 'forbidden-archive'), bytes), /files_artifact_inside_checkout/);
});

test('redirected directories refuse archive IO where link creation is permitted', async t => {
  const directory = await temporary(t), target = path.join(directory, 'target'), redirected = path.join(directory, 'redirected');
  await mkdir(target, { mode: 0o700 });
  try { await symlink(target, redirected, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Sandbox does not permit creating a synthetic symlink/junction.'); return; } throw error; }
  await assert.rejects(writeSyntheticPrivateArtifact(path.join(redirected, 'archive'), bytes), /files_artifact_directory_redirected/);
});

test('hardlinks refuse archive IO where link creation is permitted', async t => {
  const directory = await temporary(t);
  const original = path.join(directory, 'original'), hardlink = path.join(directory, 'hardlink');
  await writeFile(original, bytes, { mode: 0o600 });
  try { await link(original, hardlink); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Sandbox does not permit creating a synthetic hardlink.'); return; } throw error; }
  await assert.rejects(readSyntheticPrivateArtifact(hardlink, sha256(bytes)), /files_artifact_redirected/);
});
