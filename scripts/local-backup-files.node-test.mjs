import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { STORAGE_REFERENCES } from './pilot-finance-reset-registry.mjs';
import { PILOT_BACKUP_ORGANIZATION, LOCAL_CAPTURE_POLICY } from './local-backup-capture.mjs';
import { backupHash } from './local-backup-crypto.mjs';
import { buildLocalFileCapturePlan, exerciseLocalFileCaptureProtocol, createLocalFileReadProtocol, LOCAL_FILES_LIMITS, assertStoredLocalFileManifest, verifyStoredLocalFilePlaintexts } from './local-backup-files.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = Buffer.from([0, 128, 255]);
function fixture() {
  const manifest = { format: 'nestory-local-pilot-business-capture-v1', scope: 'selected-org-business', operationId: id(90),
    organizationId: PILOT_BACKUP_ORGANIZATION, authBackupIncluded: false, securityMetadataIncluded: true,
    excludedCredentialRelations: ['auth.*', ...LOCAL_CAPTURE_POLICY.filter(p => p.capture === 'count-and-hash-only').map(p => p.table)],
    tables: [], storageReferences: [], storageMetadata: [] };
  STORAGE_REFERENCES.forEach((rule, i) => {
    const path = `${PILOT_BACKUP_ORGANIZATION}/synthetic/${i}/file.bin`, objectId = id(i + 1);
    const row = { id: rule.table === 'public.organizations' ? PILOT_BACKUP_ORGANIZATION : id(20 + i), organization_id: PILOT_BACKUP_ORGANIZATION, [rule.pathColumn]: path };
    if (rule.objectColumn) row[rule.objectColumn] = objectId;
    const primaryKey = { id: row.id }, rowText = JSON.stringify(row);
    manifest.tables.push({ table_name: rule.table, capture: 'full-row-image', row_count: 1,
      rows: [{ primaryKey, rowText, rowSha256: backupHash(rowText) }] });
    manifest.storageReferences.push({ table_name: rule.table, primary_key: primaryKey, bucket: rule.bucket, path, object_id: rule.objectColumn ? objectId : null });
    const metadataText = JSON.stringify({ id: objectId, bucket_id: rule.bucket, name: path, version: 'fixture-version-1', metadata: { size: body.length } });
    manifest.storageMetadata.push({ rowText: metadataText, rowSha256: backupHash(metadataText) });
  });
  return manifest;
}
function plan(m = fixture()) { const bytes = Buffer.from(JSON.stringify(m)); return buildLocalFileCapturePlan(bytes, backupHash(bytes)); }
function ports(p) {
  const events = [], counts = new Map();
  return { events, counts, plan: p, observeSourceWitness: async () => ({ sourceSha256: p.sourceSha256 }),
    reader: {
      async assertPrivateBucket(bucket) { events.push(`private:${bucket}`); },
      async info(o) { events.push(`info:${o.id}`); return { id: o.id, bucket_id: o.bucket, name: o.name, version: o.version, size: o.bytes }; },
      async download(o) { counts.set(o.id, (counts.get(o.id) ?? 0) + 1); events.push(`get:${o.id}`); return Buffer.from(body); },
    },
    async sealAndPersist(bytes) { events.push('encrypt-and-persist'); assert.deepEqual(bytes, body);
      return { archiveId: randomUUID(), ciphertextSha256: backupHash('offline-opaque-ciphertext'), ciphertextBytes: 99 }; },
  };
}

test('all nine registry reference columns, including preserved photos and logos, are covered', () => {
  const p = plan(); assert.equal(STORAGE_REFERENCES.length, 9); assert.equal(p.referenceColumns.length, 9); assert.equal(p.objects.length, 9);
  assert.equal(p.scope, 'selected-org-business');
  assert.ok(p.references.some(r => r.table_name === 'public.asset_photos')); assert.ok(p.references.some(r => r.table_name === 'public.organizations'));
});
for (const [name, change] of [
  ['missing preserved table', m => { m.tables = m.tables.filter(t => t.table_name !== 'public.asset_photos'); }],
  ['missing logo reference', m => { m.storageReferences.pop(); }],
  ['foreign organization', m => { m.organizationId = id(99); }],
  ['obsolete security scope', m => { delete m.securityMetadataIncluded; m.securityRowsIncluded = false; }],
  ['credential exclusion mismatch', m => { m.excludedCredentialRelations = ['auth.*']; }],
  ['reference body tamper', m => { m.tables[0].rows[0].rowText += ' '; }],
  ['duplicate metadata', m => { m.storageMetadata.push(m.storageMetadata[0]); }],
  ['unresolved object', m => { m.storageMetadata.pop(); }],
  ['foreign path namespace', m => { const r = JSON.parse(m.storageMetadata[0].rowText); r.name = `${id(99)}/foreign.bin`; const s = JSON.stringify(r); m.storageMetadata[0] = { rowText: s, rowSha256: backupHash(s) }; }],
  ['unknown bucket', m => { const r = JSON.parse(m.storageMetadata[0].rowText); r.bucket_id = 'unknown-private'; const s = JSON.stringify(r); m.storageMetadata[0] = { rowText: s, rowSha256: backupHash(s) }; }],
  ['oversize object', m => { const r = JSON.parse(m.storageMetadata[0].rowText); r.metadata.size = LOCAL_FILES_LIMITS.objectBytes + 1; const s = JSON.stringify(r); m.storageMetadata[0] = { rowText: s, rowSha256: backupHash(s) }; }],
  ['total byte budget exceeded', m => { m.storageMetadata = m.storageMetadata.map(item => { const r = JSON.parse(item.rowText); r.metadata.size = LOCAL_FILES_LIMITS.objectBytes; const s = JSON.stringify(r); return { rowText: s, rowSha256: backupHash(s) }; }); }],
]) test(`manifest refuses ${name}`, () => { const m = fixture(); change(m); assert.throws(() => plan(m), /local_backup_files_/); });
test('source plaintext digest mismatch refuses parsing', () => {
  const bytes = Buffer.from(JSON.stringify(fixture())); assert.throws(() => buildLocalFileCapturePlan(bytes, 'f'.repeat(64)), /manifest_hash_changed/);
});
test('legitimate zero-reference capture still requires all nine source tables', async () => {
  const m = fixture(); m.storageReferences = []; m.storageMetadata = [];
  for (const t of m.tables) { t.rows = []; t.row_count = 0; }
  const p = plan(m), o = ports(p); const result = await exerciseLocalFileCaptureProtocol(o);
  assert.equal(result.totalBytes, 0); assert.equal(result.objects.length, 0); assert.deepEqual(o.events, []);
});
test('offline protocol double GETs exact binary bytes and persists ciphertext before second GET', async () => {
  const p = plan(), o = ports(p), result = await exerciseLocalFileCaptureProtocol(o);
  assert.equal(result.totalBytes, 27); assert.equal(result.objects.length, 9);
  for (const object of p.objects) assert.equal(o.counts.get(object.id), 2);
  assert.equal(o.events[2], `get:${p.objects[0].id}`); assert.equal(o.events[3], 'encrypt-and-persist'); assert.equal(o.events[4], `get:${p.objects[0].id}`);
  assert.equal(result.objects[0].plaintextSha256, backupHash(body));
  assert.equal(Object.hasOwn(result, 'freshProcessByteRestoreVerified'), false, 'offline port tests cannot mint actual restore proof');
  assert.equal(assertStoredLocalFileManifest(result), result);
});

for (const [label, change] of [
  ['duplicate object', m => { m.objects.push(m.objects[0]); m.totalBytes += m.objects[0].bytes; }],
  ['duplicate archive locator', m => { m.objects[1].archiveId = m.objects[0].archiveId; }],
  ['foreign reference', m => { m.references[0].table_name = 'public.foreign_table'; }],
  ['missing reference', m => { m.references.pop(); }],
  ['duplicate reference', m => { m.references.push(m.references[0]); }],
  ['forged object metadata', m => { m.objects[0].version = 'changed'; }],
  ['changed total', m => { m.totalBytes++; }],
  ['missing registry column', m => { m.referenceColumns.pop(); }],
  ['extra proof claim', m => { m.byteRestoreVerified = true; }],
]) test(`fresh verifier schema refuses ${label} before reading ciphertext`, async () => {
  const m = await exerciseLocalFileCaptureProtocol(ports(plan())); change(m);
  assert.throws(() => assertStoredLocalFileManifest(m), /local_backup_files_/);
});
test('content changes between GETs fail even with stable metadata', async () => {
  const o = ports(plan()); let n = 0;
  o.reader.download = async () => ++n === 1 ? Buffer.from(body) : Buffer.from([1, 128, 255]);
  await assert.rejects(exerciseLocalFileCaptureProtocol(o), /download_changed/);
});
test('metadata and full source-witness drift both fail capture', async () => {
  const o = ports(plan()); const original = o.reader.info; let n = 0;
  o.reader.info = async object => ({ ...await original(object), etag: ++n === 1 ? 'before' : 'after' });
  await assert.rejects(exerciseLocalFileCaptureProtocol(o), /object_metadata_changed/);
  const p = ports(plan()); let calls = 0;
  p.observeSourceWitness = async () => ({ sourceSha256: ++calls === 1 ? p.plan.sourceSha256 : 'a'.repeat(64) });
  await assert.rejects(exerciseLocalFileCaptureProtocol(p), /source_changed/);
});
test('plaintext buffers are zeroed on failed encryption', async () => {
  const o = ports(plan()); const supplied = Buffer.from(body); o.reader.download = async () => supplied;
  o.sealAndPersist = async () => { throw Error('offline crypto failure'); };
  await assert.rejects(exerciseLocalFileCaptureProtocol(o)); assert.deepEqual(supplied, Buffer.alloc(3));
});
test('batch-restored bytes require every exact object and correct total', async () => {
  const m = await exerciseLocalFileCaptureProtocol(ports(plan())), restored = m.objects.map(() => Buffer.from(body));
  assert.equal(verifyStoredLocalFilePlaintexts(m, restored), 27);
  assert.throws(() => verifyStoredLocalFilePlaintexts(m, restored.slice(1)), /coverage_changed/);
  restored[4][0] ^= 1;
  assert.throws(() => verifyStoredLocalFilePlaintexts(m, restored), /bytes_changed/);
});
function response(url, bytes, headers = {}) {
  const r = new Response(bytes, { status: 200, headers }); Object.defineProperty(r, 'url', { value: url }); return r;
}
test('HTTP reader uses GET only, fixed project, private bucket check and authenticated object route', async () => {
  const o = plan().objects[0], calls = [];
  const reader = createLocalFileReadProtocol(async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/bucket/')) return response(url, JSON.stringify({ id: o.bucket, public: false }));
    if (url.includes('/object/info/')) return response(url, JSON.stringify({ id: o.id, version: o.version, name: o.name, bucket_id: o.bucket, size: o.bytes }));
    return response(url, body, { 'content-length': '3' });
  }, 'offline-credential-never-real');
  await reader.assertPrivateBucket(o.bucket); await reader.info(o); assert.deepEqual(await reader.download(o), body);
  assert.equal(calls.length, 3);
  for (const c of calls) { assert.equal(c.options.method, 'GET'); assert.equal(c.options.redirect, 'error'); assert.equal(c.options.cache, 'no-store'); assert.match(c.url, /^https:\/\/pfvmztxktkwyewvxfgot\.supabase\.co\/storage\/v1\//); }
  assert.match(calls[2].url, /\/object\/authenticated\//);
});
test('public buckets, redirects, unexpected decompression and size overrun all fail closed', async () => {
  const o = plan().objects[0];
  const pub = createLocalFileReadProtocol(async url => response(url, JSON.stringify({ id: o.bucket, public: true })), 'offline');
  await assert.rejects(pub.assertPrivateBucket(o.bucket), /private_bucket_required/);
  const redirect = createLocalFileReadProtocol(async () => response('https://other.invalid/file', body), 'offline');
  await assert.rejects(redirect.download(o), /http_response_invalid/);
  const compressed = createLocalFileReadProtocol(async url => response(url, body, { 'content-encoding': 'gzip' }), 'offline');
  await assert.rejects(compressed.download(o), /http_response_invalid/);
  const oversized = createLocalFileReadProtocol(async url => response(url, body, { 'content-length': String(LOCAL_FILES_LIMITS.objectBytes + 1) }), 'offline');
  await assert.rejects(oversized.download(o), /http_size_limit/);
});
test('network errors are sanitized and object paths cannot escape reviewed org namespace', async () => {
  const o = plan().objects[0], reader = createLocalFileReadProtocol(async () => { throw Error('Bearer offline-secret-detail'); }, 'offline');
  await assert.rejects(reader.download(o), e => e.message === 'local_backup_files_http_unavailable');
  for (const name of ['https://other.invalid/file', `${PILOT_BACKUP_ORGANIZATION}/../file`, `${PILOT_BACKUP_ORGANIZATION}/%2fescape`])
    await assert.rejects(reader.download({ ...o, name }), /object_path_invalid/);
});
test('capture entrypoint has no implicit CLI network or environment read at import', async () => {
  const source = await readFile(new URL('./local-backup-files.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.argv\[2\] !== 'verify'/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.match(source, /await readPilotHostedServiceCredential\(\)/);
  assert.doesNotMatch(source, /\.env\.local|credentialFromFixedEnvironmentFile/);
});
