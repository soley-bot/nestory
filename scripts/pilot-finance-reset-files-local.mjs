// Importable rehearsal only. The sole runtime owner supplies its pinned internal
// Storage transport and exact metadata observer. This module never launches a
// process, reads a credential, accepts a URL, deletes objects, or edits the DB.
import { randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { buildManifest, TARGET, json, sha256 } from './pilot-finance-reset-core.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { assertFileObjectBinding, binaryBytes, buildFilesPlan, captureFilesArchive, filesObservation,
  createSyntheticRestoreIntent, reconcileSyntheticRestore, restoreMarker } from './pilot-finance-reset-files-core.mjs';
import { writeSyntheticPrivateArtifact, readSyntheticPrivateArtifact, readAndVerifyFilesArchive } from './pilot-finance-reset-files-archive.mjs';

const fail = code => { throw new Error(`files_${code}`); };
const same = (a, b) => json(a) === json(b);
const bucket = 'nestory-documents';
const route = (object, authenticated = false) => `/object/${authenticated ? 'authenticated/' : ''}${object.bucket}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
const storageErrorCodes = new Set(['InvalidMimeType', 'invalid_mime_type', 'InvalidJWT', 'invalid_jwt',
  'AccessDenied', 'access_denied', 'Unauthorized', 'Forbidden', 'KeyAlreadyExists', 'ResourceAlreadyExists',
  'EntityTooLarge', 'NoSuchBucket', 'NoSuchKey', 'BucketNotFound', 'UnexpectedError']);

function rejectedCode(bytes) {
  if (bytes.length > 16 * 1024) return 'unclassified_storage_error';
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return [value?.code, value?.error].find(code => storageErrorCodes.has(code)) ?? 'unclassified_storage_error';
  } catch { return 'unclassified_storage_error'; }
}

// A real, bounded PNG accepted by the existing private document bucket. Stored
// deflate blocks retain all 256 pixel-byte values; no MIME policy change is needed.
export function createSyntheticPng(runId) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId)) fail('fixture_run_invalid');
  const checksum = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const tag = Buffer.from(type, 'ascii'), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length); crc.writeUInt32BE(checksum(Buffer.concat([tag, data])));
    return Buffer.concat([size, tag, data, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8;
  const pixels = Buffer.alloc(16 * 17);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pixels[y * 17 + x + 1] = y * 16 + x;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('tEXt', Buffer.from(`SyntheticRun\0${runId}`, 'ascii')), chunk('IDAT', deflateSync(pixels, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

export async function runSyntheticFilesApiProof({ runtimeId, candidateHead, outputDirectory, request, observeObject, assertRuntime }) {
  if (!/^[a-f0-9]{64}$/.test(runtimeId ?? '') || !/^[a-f0-9]{40}$/.test(candidateHead ?? '') ||
      ![request, observeObject, assertRuntime].every(value => typeof value === 'function') ||
      !path.isAbsolute(outputDirectory)) fail('local_runtime_handoff_required');
  const root = path.resolve(import.meta.dirname, '..'), relative = path.relative(root, outputDirectory);
  if (relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ||
      await realpath(outputDirectory) !== path.resolve(outputDirectory)) fail('artifact_directory_invalid');
  const runId = randomUUID(), directory = path.join(outputDirectory, runId);
  await mkdir(directory, { mode: 0o700 });
  const report = { format: 'nestory-synthetic-storage-api-proof-v1', runId, runtimeId, candidateHead,
    syntheticOnly: true, actualStorageApiBytesVerified: false, actualResetReferenceCensusProven: false,
    originalObjectIdentityRestored: false, customerRecoveryProven: false, encrypted: false,
    customerArchiveAuthorityEstablished: false, requestCounts: { GET: 0, POST: 0 }, requestRejections: [], cleanupOwner: 'runtime-owner',
    sourceUnchanged: false, lostAcknowledgmentReconciled: false, source: null, restored: null };
  let phase = 'runtime';
  const save = async (name, value) => writeSyntheticPrivateArtifact(path.join(directory, name), Buffer.from(`${json(value)}\n`));
  const send = async (method, object, body, marker) => {
    await assertRuntime();
    report.requestCounts[method]++;
    const headers = method === 'POST' ? { 'content-type': 'image/png', 'cache-control': 'max-age=0',
      'x-upsert': 'false', 'x-metadata': Buffer.from(json(marker)).toString('base64') } : {};
    const result = await request({ method, path: route(object, method === 'GET'), headers,
      ...(method === 'POST' ? { body: binaryBytes(body) } : {}) });
    if (!result || !Number.isInteger(result.status) || result.status < 100 || result.status > 599 || !(result.body instanceof Uint8Array)) fail('api_response_invalid');
    if (result.status < 200 || result.status >= 300) {
      // Never retain arbitrary provider messages, response bodies or code-like
      // strings. The known-code allowlist and numeric status are diagnostic only.
      report.requestRejections.push({ method, httpStatus: result.status, code: rejectedCode(result.body) });
      fail('api_request_rejected');
    }
    return binaryBytes(result.body);
  };
  const observe = async object => { await assertRuntime(); return observeObject({ bucket: object.bucket, name: object.name }); };
  const download = object => send('GET', object);
  try {
    await assertRuntime();
    const source = { bucket, name: `${TARGET.organization}/pilot-reset-files-${runId}/source.bin` };
    const sourceBytes = createSyntheticPng(runId);
    const marker = { nestorySyntheticRecovery: 'source-v1', runId, sha256: sha256(sourceBytes) };
    phase = 'source_absence';
    if (await observe(source) !== null) fail('source_already_exists');
    // Persist before sending; an interrupted run must use these exact paths for
    // observation, never repeat POST based on an absent response alone.
    await save('source-request-started.json', { syntheticOnly: true, runtimeId, runId, source, marker, observedAbsent: true, requestStarted: true });
    phase = 'source_create_once';
    let sourceAcknowledged = false;
    try { await send('POST', source, sourceBytes, marker); sourceAcknowledged = true; } catch { /* Reconcile once, read-only. */ }
    const sourceObserved = await observe(source);
    if (sourceObserved == null) fail('source_outcome_unknown_no_retry');
    assertFileObjectBinding(sourceObserved.binding);
    if (sourceObserved.binding.bucket !== source.bucket || sourceObserved.binding.name !== source.name ||
        !same(sourceObserved.userMetadata, marker) || !(await download(source)).equals(sourceBytes)) fail('source_conflict');
    if (!same(await observe(source), sourceObserved)) fail('source_metadata_drift');
    report.source = sourceObserved.binding;
    report.sourceAcknowledged = sourceAcknowledged;
    phase = 'reference_plan';
    // These references are constructed fixture evidence, explicitly not a live
    // database row census. Complete census capture remains a separate reset gate.
    const manifest = buildManifest({ operationId: runId,
      binding: { ...TARGET, candidateHead, containerId: runtimeId, migrationsSha256: sha256('synthetic-api-proof-no-db-census'),
        authUsers: [], sourceKind: 'generated-storage-api-proof-not-database-census' },
      tables: [{ table: 'public.documents', columns: ['id', 'organization_id', 'storage_path', 'storage_object_id'],
        pk: ['id'], jsonColumns: [], unconstrainedUuidColumns: [], foreignKeys: [] }],
      rows: [{ table: 'public.documents', scope: TARGET.organization, pk: [runId], sha256: sha256(json(sourceObserved)),
        references: { id: runId, storage_path: source.name, storage_object_id: sourceObserved.binding.id } }],
      schema: [], storageObjects: [sourceObserved.binding], registry: { 'public.documents': RESET_REGISTRY['public.documents'] } });
    const plan = buildFilesPlan(manifest, manifest.manifestSha256);
    await save('plan.json', plan);
    const observeBindings = async () => ({ ...filesObservation(plan), objects: [(await observe(source))?.binding] });
    phase = 'capture_archive';
    const archive = await captureFilesArchive({ plan, expectedPlanSha256: plan.planSha256, observe: observeBindings, download });
    const archivePath = path.join(directory, 'synthetic-files.archive');
    report.archive = await writeSyntheticPrivateArtifact(archivePath, archive.bytes);
    const verified = await readAndVerifyFilesArchive({ inputPath: archivePath, expectedArchiveSha256: archive.archiveSha256,
      plan, expectedPlanSha256: plan.planSha256 });
    const savedBytes = await readSyntheticPrivateArtifact(archivePath, archive.archiveSha256);
    const intent = createSyntheticRestoreIntent({ plan, archiveBytes: savedBytes, archiveSha256: archive.archiveSha256, runId });
    const item = intent.objects[0];
    await save('restore-intent.json', intent);
    phase = 'restore_absence';
    if (await observe(item.target) !== null) fail('restore_target_already_exists');
    const started = { syntheticOnly: true, runtimeId, intentSha256: intent.intentSha256, target: item.target, observedAbsent: true, requestStarted: true };
    const startedReceipt = await save('restore-request-started.json', started);
    phase = 'restore_create_once';
    // Deliberately discard the acknowledgment. The only completion decision
    // below uses the durable intent and protected readback, exercising the same
    // recovery path as an acknowledgment lost after the provider wrote bytes.
    try { await send('POST', item.target, verified.entries[0].bytes, restoreMarker(intent, item)); }
    catch { /* Never retry a possibly completed write. */ }
    await readSyntheticPrivateArtifact(path.join(directory, 'restore-request-started.json'), startedReceipt.sha256);
    phase = 'restore_reconciliation';
    const observed = await observe(item.target);
    const restoredBytes = observed == null ? undefined : await download(item.target);
    const reconciled = reconcileSyntheticRestore({ intent, expectedIntentSha256: intent.intentSha256, item,
      started: true, observation: observed, bytes: restoredBytes });
    if (reconciled.status !== 'verified') fail('restore_outcome_unknown_no_retry');
    if (!same(await observe(item.target), observed) || !(await download(item.target)).equals(restoredBytes) ||
        !same(await observe(item.target), observed)) fail('restored_metadata_or_bytes_drift');
    phase = 'source_preservation';
    if (!(await download(source)).equals(sourceBytes) || !same(await observe(source), sourceObserved)) fail('source_changed');
    report.restored = reconciled;
    report.sourceUnchanged = true;
    report.lostAcknowledgmentReconciled = true;
    report.actualStorageApiBytesVerified = true;
    report.planSha256 = plan.planSha256;
    report.intentSha256 = intent.intentSha256;
    report.byteLength = sourceBytes.length;
    report.sha256 = sha256(sourceBytes);
    await save('proof.json', report);
    return report;
  } catch (error) {
    // Driver errors can contain commands or credentials. Only fixed codes leave
    // the module. The runtime owner retains exact started markers for cleanup.
    report.failure = { phase, code: /^files_[a-z_]+$/.test(error.message) ? error.message : 'files_runtime_or_transport_failed' };
    try { await save('failure.json', report); } catch { report.failureEvidenceUnconfirmed = true; }
    const sanitized = new Error(report.failure.code);
    sanitized.proof = report;
    throw sanitized;
  }
}
