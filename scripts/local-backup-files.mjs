// Selected-organization business file capture. No upload/delete, public URL,
// caller endpoint, plaintext disk output or implicit capture at module import.
import { readPilotHostedServiceCredential, PILOT_HOSTED_ORIGIN } from './local-backup-file-credential.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { STORAGE_REFERENCES, RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { PILOT_BACKUP_ORGANIZATION, LOCAL_CAPTURE_POLICY } from './local-backup-capture.mjs';
import { backupHash, encryptLocalBackup, decryptLocalBackup, decryptLocalBackupChunks, writePrivateBackupFile, readPrivateBackupFile } from './local-backup-crypto.mjs';
import { holdBusinessSpillCustody } from './local-backup-business-runtime.mjs';

export const LOCAL_FILES_LIMITS = Object.freeze({ objects: 256, objectBytes: 4 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 });
const origin = PILOT_HOSTED_ORIGIN;
const buckets = new Set(STORAGE_REFERENCES.map(r => r.bucket));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(`local_backup_files_${code}`); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
const text = value => JSON.stringify(sorted(value));
const hash = value => backupHash(text(value));
const same = (a, b) => text(a) === text(b);
const exact = (v, names) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...names].sort());
const json = bytes => { try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); } catch { fail('document_invalid'); } };
function objectPath(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 || !value.startsWith(`${PILOT_BACKUP_ORGANIZATION}/`) ||
    Buffer.from(value).toString('utf8') !== value || value.split('/').some(v => !v || v === '.' || v === '..' || /[\\%\u0000-\u001f\u007f]/.test(v))) fail('object_path_invalid');
  return value;
}
function metadata(entry) {
  if (!exact(entry, ['rowText', 'rowSha256']) || typeof entry.rowText !== 'string' || backupHash(entry.rowText) !== entry.rowSha256) fail('metadata_hash_changed');
  const row = json(Buffer.from(entry.rowText));
  if (!uuid.test(row.id) || !buckets.has(row.bucket_id) || typeof row.version !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(row.version) ||
    !Number.isSafeInteger(row.metadata?.size) || row.metadata.size < 0 || row.metadata.size > LOCAL_FILES_LIMITS.objectBytes) fail('metadata_invalid');
  objectPath(row.name);
  return { id: row.id, bucket: row.bucket_id, name: row.name, version: row.version, bytes: row.metadata.size,
    metadataRowText: entry.rowText, metadataSha256: entry.rowSha256 };
}

export function buildLocalFileCapturePlan(manifestBytes, expectedSourceSha256) {
  if (!(manifestBytes instanceof Uint8Array) || manifestBytes.length > LOCAL_FILES_LIMITS.totalBytes || !digest.test(expectedSourceSha256) ||
    backupHash(manifestBytes) !== expectedSourceSha256) fail('manifest_hash_changed');
  const m = json(manifestBytes);
  if (m.format !== 'nestory-local-pilot-business-capture-v1' || m.scope !== 'selected-org-business' || m.organizationId !== PILOT_BACKUP_ORGANIZATION ||
    !uuid.test(m.operationId) || m.authBackupIncluded !== false || m.securityMetadataIncluded !== true ||
    !same(m.excludedCredentialRelations, ['auth.*', ...LOCAL_CAPTURE_POLICY.filter(p => p.capture === 'count-and-hash-only').map(p => p.table)]) || !Array.isArray(m.tables) ||
    !Array.isArray(m.storageReferences) || !Array.isArray(m.storageMetadata)) fail('manifest_scope_invalid');
  const tableNames = m.tables.map(t => t.table_name);
  if (new Set(tableNames).size !== tableNames.length) fail('table_coverage_invalid');
  const references = [];
  for (const rule of STORAGE_REFERENCES) {
    const table = m.tables.find(t => t.table_name === rule.table);
    if (!table || table.capture !== 'full-row-image' || !Array.isArray(table.rows) || table.row_count !== table.rows.length) fail('reference_table_missing');
    const keys = new Set();
    for (const entry of table.rows) {
      if (!exact(entry, ['primaryKey', 'rowText', 'rowSha256']) || backupHash(entry.rowText) !== entry.rowSha256 ||
        !entry.primaryKey || !Object.keys(entry.primaryKey).length) fail('reference_row_invalid');
      const row = json(Buffer.from(entry.rowText));
      if (row[RESET_REGISTRY[rule.table].scope] !== PILOT_BACKUP_ORGANIZATION || !Object.hasOwn(row, rule.pathColumn) ||
        (rule.objectColumn && !Object.hasOwn(row, rule.objectColumn)) ||
        Object.entries(entry.primaryKey).some(([k, v]) => !same(row[k], v)) || keys.has(text(entry.primaryKey))) fail('reference_row_scope_invalid');
      keys.add(text(entry.primaryKey));
      const location = row[rule.pathColumn], id = rule.objectColumn ? row[rule.objectColumn] ?? null : null;
      if (location === null && id === null) continue;
      if (location !== null) objectPath(location);
      if (id !== null && !uuid.test(id)) fail('reference_object_invalid');
      references.push({ table_name: rule.table, primary_key: entry.primaryKey, bucket: rule.bucket, path: location, object_id: id });
    }
  }
  const order = values => [...values].sort((a, b) => text(a).localeCompare(text(b)));
  if (!same(order(references), order(m.storageReferences))) fail('reference_coverage_changed');
  const objects = m.storageMetadata.map(metadata), used = new Set();
  if (objects.length > LOCAL_FILES_LIMITS.objects || new Set(objects.map(o => o.id)).size !== objects.length ||
    new Set(objects.map(o => `${o.bucket}/${o.name}`)).size !== objects.length || objects.reduce((n, o) => n + o.bytes, 0) > LOCAL_FILES_LIMITS.totalBytes) fail('object_coverage_invalid');
  for (const ref of references) {
    const matches = objects.filter(o => o.bucket === ref.bucket && (ref.path === null || o.name === ref.path) && (ref.object_id === null || o.id === ref.object_id));
    if (matches.length !== 1) fail('reference_resolution_invalid');
    used.add(matches[0].id);
  }
  if (used.size !== objects.length) fail('unreferenced_object_refused');
  const plan = { format: 'nestory-local-business-files-plan-v1', scope: 'selected-org-business', operationId: m.operationId,
    organizationId: m.organizationId, sourceSha256: expectedSourceSha256,
    referenceColumns: STORAGE_REFERENCES.map(r => ({ ...r })), references: order(references), objects: order(objects) };
  return Object.freeze({ ...plan, planSha256: hash(plan) });
}
function assertPlan(plan) {
  const { planSha256, ...body } = plan ?? {};
  if (!digest.test(planSha256) || hash(body) !== planSha256 || body.format !== 'nestory-local-business-files-plan-v1' ||
    body.scope !== 'selected-org-business' || body.organizationId !== PILOT_BACKUP_ORGANIZATION || !uuid.test(body.operationId) ||
    !digest.test(body.sourceSha256) || !same(body.referenceColumns, STORAGE_REFERENCES) || !Array.isArray(body.objects) ||
    body.objects.length > LOCAL_FILES_LIMITS.objects || body.objects.some(o => !uuid.test(o.id) || !buckets.has(o.bucket) ||
      !Number.isSafeInteger(o.bytes) || o.bytes < 0 || o.bytes > LOCAL_FILES_LIMITS.objectBytes)) fail('plan_invalid');
  if (!exact(body, ['format', 'scope', 'operationId', 'organizationId', 'sourceSha256', 'referenceColumns', 'references', 'objects']) ||
    !Array.isArray(body.references) || new Set(body.references.map(text)).size !== body.references.length ||
    new Set(body.objects.map(o => o.id)).size !== body.objects.length ||
    new Set(body.objects.map(o => `${o.bucket}/${o.name}`)).size !== body.objects.length ||
    body.objects.reduce((n, o) => n + o.bytes, 0) > LOCAL_FILES_LIMITS.totalBytes) fail('plan_coverage_invalid');
  for (const object of body.objects) {
    const parsed = metadata({ rowText: object.metadataRowText, rowSha256: object.metadataSha256 });
    if (!same(parsed, object)) fail('plan_metadata_changed');
  }
  const used = new Set();
  for (const ref of body.references) {
    const rule = STORAGE_REFERENCES.find(r => r.table === ref.table_name && r.bucket === ref.bucket);
    if (!exact(ref, ['table_name', 'primary_key', 'bucket', 'path', 'object_id']) || !rule ||
      !ref.primary_key || Object.getPrototypeOf(ref.primary_key) !== Object.prototype || !Object.keys(ref.primary_key).length ||
      Object.values(ref.primary_key).some(v => typeof v !== 'string' && !Number.isSafeInteger(v)) ||
      (ref.path === null && ref.object_id === null) || (ref.object_id !== null && (!rule.objectColumn || !uuid.test(ref.object_id)))) fail('plan_reference_invalid');
    if (ref.path !== null) objectPath(ref.path);
    const matches = body.objects.filter(o => o.bucket === ref.bucket && (ref.path === null || o.name === ref.path) && (ref.object_id === null || o.id === ref.object_id));
    if (matches.length !== 1) fail('plan_reference_resolution_invalid');
    used.add(matches[0].id);
  }
  if (used.size !== body.objects.length) fail('plan_unreferenced_object');
  return plan;
}

// Pure independent validation used in the fresh process before opening any
// object ciphertext. It validates metadata, reference closure and the original
// plan digest, rather than trusting self-reported object totals.
export function assertStoredLocalFileManifest(manifest) {
  if (!exact(manifest, ['format', 'scope', 'operationId', 'organizationId', 'sourceSha256', 'planSha256', 'referenceColumns', 'references', 'objects', 'totalBytes']) ||
    manifest.format !== 'nestory-local-business-files-archive-v1' || !Array.isArray(manifest.objects) ||
    !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0 || manifest.totalBytes > LOCAL_FILES_LIMITS.totalBytes) fail('stored_manifest_invalid');
  const objects = manifest.objects.map(object => {
    if (!exact(object, ['id', 'bucket', 'name', 'version', 'bytes', 'metadataRowText', 'metadataSha256', 'plaintextSha256', 'archiveId', 'ciphertextSha256', 'ciphertextBytes']) ||
      !uuid.test(object.archiveId) || !digest.test(object.ciphertextSha256) || !digest.test(object.plaintextSha256) ||
      !Number.isSafeInteger(object.ciphertextBytes) || object.ciphertextBytes < 1 || object.ciphertextBytes > 8 * 1024 * 1024) fail('stored_object_invalid');
    const { plaintextSha256, archiveId, ciphertextSha256, ciphertextBytes, ...source } = object;
    return source;
  });
  if (new Set(manifest.objects.map(o => o.archiveId)).size !== objects.length ||
    objects.reduce((n, o) => n + o.bytes, 0) !== manifest.totalBytes) fail('stored_coverage_invalid');
  const { totalBytes, ...plan } = manifest;
  assertPlan({ ...plan, format: 'nestory-local-business-files-plan-v1', objects });
  return manifest;
}

export function verifyStoredLocalFilePlaintexts(manifest, restored) {
  assertStoredLocalFileManifest(manifest);
  if (!Array.isArray(restored) || restored.length !== manifest.objects.length) fail('restored_coverage_changed');
  let total = 0;
  for (const [index, bytes] of restored.entries()) {
    const object = manifest.objects[index];
    if (!(bytes instanceof Uint8Array) || bytes.length !== object.bytes || backupHash(bytes) !== object.plaintextSha256 ||
      (total += bytes.length) > LOCAL_FILES_LIMITS.totalBytes) fail('restored_bytes_changed');
  }
  if (total !== manifest.totalBytes) fail('restored_total_changed');
  return total;
}
function checkInfo(info, object) {
  if (info?.id !== object.id || info.version !== object.version || info.name !== object.name || info.bucket_id !== object.bucket || info.size !== object.bytes) fail('object_info_changed');
}
async function bounded(response, limit) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel(); fail('http_size_limit'); }
  const reader = response.body?.getReader(); if (!reader) fail('http_body_unavailable');
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); fail('http_size_limit'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { for (const chunk of chunks) chunk.fill(0); }
}

// Fixed-host GET implementation. Injected request is for portable protocol tests
// only; the concrete capture below always uses global fetch and fixed env input.
export function createLocalFileReadProtocol(request, credential) {
  async function get(route, limit) {
    const url = `${origin}/storage/v1/${route}`;
    let response;
    try {
      response = await request(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        headers: { apikey: credential, Authorization: `Bearer ${credential}`, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } });
      if (!response.ok || response.status !== 200 || response.redirected || response.url !== url ||
        ![null, 'identity'].includes(response.headers.get('content-encoding'))) { await response.body?.cancel(); fail('http_response_invalid'); }
      return await bounded(response, limit);
    } catch (e) { if (/^local_backup_files_/.test(e?.message ?? '')) throw e; fail('http_unavailable'); }
  }
  const route = object => {
    if (!buckets.has(object.bucket)) fail('bucket_invalid'); objectPath(object.name);
    return `${object.bucket}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
  };
  return Object.freeze({
    async assertPrivateBucket(bucket) {
      if (!buckets.has(bucket)) fail('bucket_invalid');
      const bytes = await get(`bucket/${bucket}`, 65536);
      try { const info = json(bytes); if (info.id !== bucket || info.public !== false) fail('private_bucket_required'); }
      finally { bytes.fill(0); }
    },
    async info(object) { const bytes = await get(`object/info/${route(object)}`, 65536); try { return json(bytes); } finally { bytes.fill(0); } },
    // Official private-bucket route: https://supabase.com/docs/guides/storage/serving/downloads
    async download(object) { return get(`object/authenticated/${route(object)}`, LOCAL_FILES_LIMITS.objectBytes); },
  });
}

// Algorithm ports can be exercised offline; no provider/restore authority is
// minted by this function. Only the concrete capture performs a fresh-process
// verification of the actual stored ciphertext before returning a proof.
export async function exerciseLocalFileCaptureProtocol({ plan, reader, sealAndPersist, observeSourceWitness, onProgress }) {
  assertPlan(plan);
  const verifySource = async () => { const observed = await observeSourceWitness(); if (!exact(observed, ['sourceSha256']) || observed.sourceSha256 !== plan.sourceSha256) fail('source_changed'); };
  await verifySource();
  const captured = []; let total = 0;
  for (const object of plan.objects) {
    await reader.assertPrivateBucket(object.bucket);
    const before = await reader.info(object); checkInfo(before, object);
    let first, second;
    try {
      first = await reader.download(object);
      if (!(first instanceof Uint8Array) || first.length !== object.bytes || (total += first.length) > LOCAL_FILES_LIMITS.totalBytes) fail('download_size_changed');
      const plaintextSha256 = backupHash(first);
      const sealed = await sealAndPersist(first);
      first.fill(0); first = null;
      if (!exact(sealed, ['archiveId', 'ciphertextSha256', 'ciphertextBytes']) || !uuid.test(sealed.archiveId) ||
        !digest.test(sealed.ciphertextSha256) || !Number.isSafeInteger(sealed.ciphertextBytes) || sealed.ciphertextBytes < 1 || sealed.ciphertextBytes > 8 * 1024 * 1024) fail('ciphertext_receipt_invalid');
      second = await reader.download(object);
      if (!(second instanceof Uint8Array) || second.length !== object.bytes || backupHash(second) !== plaintextSha256) fail('download_changed');
      const after = await reader.info(object); checkInfo(after, object);
      if (!same(before, after)) fail('object_metadata_changed');
      await reader.assertPrivateBucket(object.bucket);
      captured.push({ ...object, plaintextSha256, ...sealed });
      await onProgress?.({ completedObjects: captured.length, totalObjects: plan.objects.length, totalBytes: total });
    } finally { first?.fill(0); second?.fill(0); }
  }
  await verifySource();
  return { format: 'nestory-local-business-files-archive-v1', scope: 'selected-org-business', operationId: plan.operationId,
    organizationId: plan.organizationId, sourceSha256: plan.sourceSha256, planSha256: plan.planSha256,
    referenceColumns: plan.referenceColumns, references: plan.references, objects: captured, totalBytes: total };
}

async function sealFile(keyId, plaintext) {
  const archiveId = randomUUID(), encrypted = await encryptLocalBackup(keyId, plaintext);
  try {
    const readback = await writePrivateBackupFile(archiveId, 'archive.pgp', encrypted);
    try { if (!readback.equals(encrypted)) fail('ciphertext_readback_changed'); }
    finally { readback.fill(0); }
    return { archiveId, ciphertextSha256: backupHash(encrypted), ciphertextBytes: encrypted.length };
  } finally { encrypted.fill(0); }
}
export async function verifyStoredLocalFileCapture(request) {
  if (!exact(request, ['keyId', 'archiveId', 'ciphertextSha256', 'plaintextSha256']) || !uuid.test(request.keyId) || !uuid.test(request.archiveId) ||
    !digest.test(request.ciphertextSha256) || !digest.test(request.plaintextSha256)) fail('verification_request_invalid');
  const custody = await holdBusinessSpillCustody();
  let encrypted, plaintext;
  try {
  encrypted = await readPrivateBackupFile(request.archiveId, 'archive.pgp');
  if (backupHash(encrypted) !== request.ciphertextSha256) fail('manifest_ciphertext_changed');
  plaintext = await decryptLocalBackup(request.keyId, encrypted);
    if (backupHash(plaintext) !== request.plaintextSha256) fail('manifest_plaintext_changed');
    const manifest = assertStoredLocalFileManifest(json(plaintext));
    let total = 0;
    const ciphertexts = []; let restored = [];
    try {
      for (const object of manifest.objects) {
        const cipher = await readPrivateBackupFile(object.archiveId, 'archive.pgp');
        ciphertexts.push(cipher);
        if (backupHash(cipher) !== object.ciphertextSha256 || cipher.length !== object.ciphertextBytes) fail('stored_ciphertext_changed');
      }
      // One DPAPI unwrap/public-key check for the bounded file set, rather than
      // four Windows helper processes per file. All plaintext remains in memory.
      restored = ciphertexts.length ? await decryptLocalBackupChunks(request.keyId, ciphertexts) : [];
      total = verifyStoredLocalFilePlaintexts(manifest, restored);
    } finally { for (const bytes of [...restored, ...ciphertexts]) bytes.fill(0); }
    if (total !== manifest.totalBytes) fail('restored_total_changed');
    await custody.check();
    return { format: 'nestory-local-files-byte-restore-proof-v1', scope: 'selected-org-business', archiveId: request.archiveId,
      ciphertextSha256: request.ciphertextSha256, sourceSha256: manifest.sourceSha256, planSha256: manifest.planSha256,
      objects: manifest.objects.length, totalBytes: total, byteRestoreVerified: true };
  } finally { plaintext?.fill(0); encrypted?.fill(0); await custody.close(); }
}
function freshVerification(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'verify'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' } });
    let output = '', broken = false;
    const stop = () => { broken = true; child.kill(); };
    const timer = setTimeout(stop, 300000);
    child.stdout.on('data', bytes => { output += bytes.toString('utf8'); if (output.length > 8192) stop(); });
    child.stderr.on('data', stop); child.stdin.on('error', stop); child.on('error', stop);
    child.on('close', code => { clearTimeout(timer); if (broken || code !== 0) return reject(new Error('local_backup_files_fresh_verification_failed'));
      try {
        const { verifierPid, ...proof } = JSON.parse(output);
        if (verifierPid !== child.pid || verifierPid === process.pid || proof.byteRestoreVerified !== true) throw new Error();
        resolve({ ...proof, freshProcessByteRestoreVerified: true });
      } catch { reject(new Error('local_backup_files_fresh_verification_failed')); } });
    child.stdin.end(JSON.stringify(request));
  });
}
export async function captureLocalBackupFiles({ manifestBytes, expectedSourceSha256, keyId, observeSourceWitness, onProgress }) {
  try {
  if (!uuid.test(keyId) || typeof observeSourceWitness !== 'function') fail('capture_request_invalid');
  const plan = buildLocalFileCapturePlan(manifestBytes, expectedSourceSha256);
  const reader = createLocalFileReadProtocol(fetch, await readPilotHostedServiceCredential());
  const archive = await exerciseLocalFileCaptureProtocol({ plan, reader, observeSourceWitness, onProgress, sealAndPersist: bytes => sealFile(keyId, bytes) });
  const plaintext = Buffer.from(text(archive)); let sealed;
  try { sealed = await sealFile(keyId, plaintext); } finally { plaintext.fill(0); }
  const request = { keyId, archiveId: sealed.archiveId, ciphertextSha256: sealed.ciphertextSha256, plaintextSha256: hash(archive) };
  const proof = await freshVerification(request);
  if (proof.archiveId !== sealed.archiveId || proof.ciphertextSha256 !== sealed.ciphertextSha256 || proof.sourceSha256 !== plan.sourceSha256 ||
    proof.planSha256 !== plan.planSha256 || proof.objects !== archive.objects.length || proof.totalBytes !== archive.totalBytes || proof.freshProcessByteRestoreVerified !== true) fail('fresh_verification_changed');
  const readback = await writePrivateBackupFile(sealed.archiveId, 'proof.json', Buffer.from(text(proof))); readback.fill(0);
  return proof;
  } catch (error) {
    if (/^local_backup_files_[a-z0-9_]+$/.test(error?.message ?? '')) throw error;
    fail('capture_failed');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'verify') fail('command_invalid');
    const chunks = []; let total = 0;
    for await (const chunk of process.stdin) { total += chunk.length; if (total > 4096) fail('request_limit'); chunks.push(chunk); }
    process.stdout.write(JSON.stringify({ ...await verifyStoredLocalFileCapture(json(Buffer.concat(chunks))), verifierPid: process.pid }));
  } catch { process.stderr.write('local_backup_files_verification_failed\n'); process.exitCode = 1; }
}
