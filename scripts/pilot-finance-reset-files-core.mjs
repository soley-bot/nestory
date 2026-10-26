// Synthetic file coverage guard. Reuses the reset inventory/registry; no SQL,
// credentials, HTTP, customer archive support, or destructive restore operation.
import { TARGET, json, registrySha256, sha256 } from './pilot-finance-reset-core.mjs';
import { STORAGE_REFERENCES } from './pilot-finance-reset-registry.mjs';

export const FILE_LIMITS = Object.freeze({ objects: 256, objectBytes: 4 * 1024 ** 2, totalBytes: 32 * 1024 ** 2 });
const hashPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = code => { throw new Error(`files_${code}`); };
const same = (a, b) => json(a) === json(b);
const sorted = values => [...values].sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0);
const copy = value => JSON.parse(json(value));
const hash = value => sha256(json(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && same(Object.keys(value).sort(), [...keys].sort());
const objectKey = object => json([object.bucket, object.name]);
const referenceKey = reference => json([reference.table, reference.pk]);

export function assertFileObjectBinding(value) {
  if (!exactKeys(value, ['id', 'bucket', 'name', 'version', 'metadataSha256']) ||
      !uuidPattern.test(value.id ?? '') || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value.bucket ?? '') ||
      typeof value.name !== 'string' || Buffer.byteLength(value.name) > 1024 ||
      Buffer.from(value.name).toString('utf8') !== value.name ||
      value.name.split('/').some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/.test(part)) ||
      typeof value.version !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(value.version) ||
      !hashPattern.test(value.metadataSha256 ?? '')) fail('object_binding_invalid');
  return value;
}

export function binaryBytes(value) {
  // Never turn a Buffer into UTF-8 text or accept a JSON/string representation.
  if (!(value instanceof Uint8Array)) fail('binary_bytes_required');
  if (value.byteLength > FILE_LIMITS.objectBytes) fail('object_size_exceeded');
  return Buffer.from(value);
}

export function buildFilesPlan(manifest, expectedManifestSha256) {
  if (!record(manifest)) fail('inventory_invalid');
  const { manifestSha256, ...payload } = manifest;
  if (!hashPattern.test(expectedManifestSha256 ?? '') || manifestSha256 !== expectedManifestSha256 ||
      hash(payload) !== manifestSha256 || manifest.format !== 'nestory-local-finance-reset-inventory-v1' ||
      manifest.syntheticOnly !== true || manifest.inventoryAccepted !== true || manifest.executionSupported !== false ||
      !Array.isArray(manifest.issues) || manifest.issues.length || !uuidPattern.test(manifest.operationId ?? '') ||
      manifest.binding?.organization !== TARGET.organization || manifest.binding?.project !== TARGET.project ||
      manifest.binding?.registrySha256 !== registrySha256() ||
      !/^[a-f0-9]{40}$/.test(manifest.binding?.candidateHead ?? '') ||
      !Array.isArray(manifest.tables) || !Array.isArray(manifest.storage)) fail('inventory_invalid');
  const tableNames = new Set(), expected = new Map();
  for (const table of manifest.tables) {
    if (tableNames.has(table.table) || !Array.isArray(table.columns) || !Array.isArray(table.selectedRows)) fail('duplicate_or_invalid_table');
    tableNames.add(table.table);
    const rule = STORAGE_REFERENCES.find(item => item.table === table.table);
    if (!rule) continue;
    const rowKeys = new Set();
    for (const row of table.selectedRows) {
      if (!Array.isArray(row.pk) || !row.pk.length || row.pk.some(value => value == null) ||
          !hashPattern.test(row.sha256 ?? '') || !record(row.references)) fail('source_row_invalid');
      const key = referenceKey({ table: table.table, pk: row.pk });
      if (rowKeys.has(key)) fail('duplicate_reference');
      rowKeys.add(key);
      if (!Object.hasOwn(row.references, rule.pathColumn)) fail('reference_capture_missing');
      const objectColumn = rule.objectColumn && table.columns.includes(rule.objectColumn);
      if (objectColumn && !Object.hasOwn(row.references, rule.objectColumn)) fail('reference_capture_missing');
      const name = row.references[rule.pathColumn], id = objectColumn ? row.references[rule.objectColumn] : null;
      if (name == null && id == null) continue;
      if (name != null && (typeof name !== 'string' || !name) || id != null && !uuidPattern.test(id)) fail('reference_invalid');
      expected.set(key, { table: table.table, pk: row.pk, rowSha256: row.sha256, path: name, objectId: id, bucket: rule.bucket });
    }
  }
  const references = [], objects = new Map(), ids = new Map(), seen = new Set();
  for (const reference of manifest.storage) {
    const key = referenceKey(reference), source = expected.get(key);
    if (seen.has(key)) fail('duplicate_reference');
    seen.add(key);
    if (!source || reference.resolved !== true || !same(reference.pk, source.pk) ||
        reference.path !== source.path || reference.objectId !== source.objectId) fail('reference_drift');
    const object = assertFileObjectBinding(reference.metadata);
    if (object.bucket !== source.bucket || source.path != null && object.name !== source.path ||
        source.objectId != null && object.id !== source.objectId) fail('reference_object_mismatch');
    const location = objectKey(object);
    if (objects.has(location) && !same(objects.get(location), object) || ids.has(object.id) && ids.get(object.id) !== location) fail('ambiguous_object_binding');
    objects.set(location, copy(object)); ids.set(object.id, location);
    references.push({ ...source, object: copy(object) });
  }
  if (seen.size !== expected.size || [...expected.keys()].some(key => !seen.has(key))) fail('reference_coverage_missing');
  if (objects.size < 1 || objects.size > FILE_LIMITS.objects) fail('object_count_invalid');
  const plan = { format: 'nestory-synthetic-reset-files-plan-v1', syntheticOnly: true,
    executionSupported: false, customerRecoveryProven: false, operationId: manifest.operationId,
    project: TARGET.project, organization: TARGET.organization, candidateHead: manifest.binding.candidateHead,
    inventorySha256: manifestSha256, registrySha256: registrySha256(),
    references: sorted(references), objects: sorted([...objects.values()]) };
  return { ...plan, planSha256: hash(plan) };
}

export function assertFilesPlan(plan, expectedPlanSha256) {
  if (!record(plan)) fail('plan_invalid');
  const { planSha256, ...payload } = plan;
  if (!exactKeys(plan, ['format', 'syntheticOnly', 'executionSupported', 'customerRecoveryProven', 'operationId',
    'project', 'organization', 'candidateHead', 'inventorySha256', 'registrySha256', 'references', 'objects', 'planSha256']) ||
      !hashPattern.test(expectedPlanSha256 ?? '') || expectedPlanSha256 !== planSha256 || hash(payload) !== planSha256 ||
      plan.format !== 'nestory-synthetic-reset-files-plan-v1' || plan.syntheticOnly !== true ||
      plan.executionSupported !== false || plan.customerRecoveryProven !== false ||
      plan.project !== TARGET.project || plan.organization !== TARGET.organization ||
      !uuidPattern.test(plan.operationId ?? '') || !hashPattern.test(plan.inventorySha256 ?? '') ||
      !/^[a-f0-9]{40}$/.test(plan.candidateHead ?? '') ||
      plan.registrySha256 !== registrySha256() || !Array.isArray(plan.references) || !plan.references.length ||
      !Array.isArray(plan.objects) || !plan.objects.length || plan.objects.length > FILE_LIMITS.objects) fail('plan_invalid');
  const names = new Set(), ids = new Set(), refs = new Set();
  for (const object of plan.objects) {
    assertFileObjectBinding(object);
    if (names.has(objectKey(object)) || ids.has(object.id)) fail('duplicate_object');
    names.add(objectKey(object)); ids.add(object.id);
  }
  for (const ref of plan.references) {
    const rule = STORAGE_REFERENCES.find(item => item.table === ref?.table);
    if (!exactKeys(ref, ['table', 'pk', 'rowSha256', 'path', 'objectId', 'bucket', 'object']) || !rule ||
        !Array.isArray(ref.pk) || !ref.pk.length || ref.pk.some(value => value == null) ||
        !hashPattern.test(ref.rowSha256 ?? '') || ref.bucket !== rule.bucket || ref.object?.bucket !== rule.bucket ||
        ref.path == null && ref.objectId == null || ref.path != null && ref.path !== ref.object?.name ||
        ref.objectId != null && ref.objectId !== ref.object?.id) fail('reference_object_mismatch');
    if (refs.has(referenceKey(ref))) fail('duplicate_reference');
    refs.add(referenceKey(ref));
    if (!plan.objects.some(object => same(object, ref.object))) fail('reference_object_mismatch');
  }
  if (plan.objects.some(object => !plan.references.some(ref => same(ref.object, object)))) fail('unreferenced_object');
  return copy(plan);
}

export const filesObservation = plan => ({ references: copy(plan.references), objects: copy(plan.objects) });

export function assertFilesObservation(plan, observation) {
  if (!exactKeys(observation, ['references', 'objects']) || !Array.isArray(observation.references) || !Array.isArray(observation.objects) ||
      !same(sorted(observation.references), sorted(plan.references)) || !same(sorted(observation.objects), sorted(plan.objects))) fail('reference_or_metadata_drift');
}

export async function captureFilesArchive({ plan, expectedPlanSha256, observe, download }) {
  plan = assertFilesPlan(plan, expectedPlanSha256);
  await assertFilesObservation(plan, await observe());
  const objects = [];
  let totalBytes = 0;
  for (const object of plan.objects) {
    await assertFilesObservation(plan, await observe());
    const bytes = binaryBytes(await download(copy(object)));
    // A second protected read detects byte drift even when a provider's metadata
    // observer incorrectly appears stable. It does not establish provider trust.
    const repeated = binaryBytes(await download(copy(object)));
    if (!bytes.equals(repeated)) fail('download_bytes_changed');
    totalBytes += bytes.length;
    if (totalBytes > FILE_LIMITS.totalBytes) fail('archive_size_exceeded');
    objects.push({ binding: object, byteLength: bytes.length, sha256: sha256(bytes), base64: bytes.toString('base64') });
    await assertFilesObservation(plan, await observe());
  }
  await assertFilesObservation(plan, await observe());
  const archive = { format: 'nestory-synthetic-reset-files-archive-v1', syntheticOnly: true, encrypted: false,
    customerRecoveryProven: false, planSha256: plan.planSha256, inventorySha256: plan.inventorySha256,
    operationId: plan.operationId, totalBytes, objects };
  const bytes = Buffer.from(`${json(archive)}\n`);
  return { bytes, archiveSha256: sha256(bytes), objectCount: objects.length, totalBytes };
}

export function verifyFilesArchive({ plan, expectedPlanSha256, bytes, expectedArchiveSha256 }) {
  plan = assertFilesPlan(plan, expectedPlanSha256);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > FILE_LIMITS.totalBytes * 2 ||
      !hashPattern.test(expectedArchiveSha256 ?? '') || sha256(bytes) !== expectedArchiveSha256) fail('archive_digest_mismatch');
  let archive;
  try { archive = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { fail('archive_invalid'); }
  // A single canonical representation also refuses duplicate JSON keys, invalid
  // UTF-8 replacement, extra fields, and noncanonical base64 spellings.
  if (!Buffer.from(`${json(archive)}\n`).equals(Buffer.from(bytes)) ||
      !exactKeys(archive, ['format', 'syntheticOnly', 'encrypted', 'customerRecoveryProven', 'planSha256', 'inventorySha256', 'operationId', 'totalBytes', 'objects']) ||
      archive.format !== 'nestory-synthetic-reset-files-archive-v1' || archive.syntheticOnly !== true || archive.encrypted !== false ||
      archive.customerRecoveryProven !== false || archive.planSha256 !== plan.planSha256 ||
      archive.inventorySha256 !== plan.inventorySha256 || archive.operationId !== plan.operationId ||
      !Array.isArray(archive.objects) || archive.objects.length !== plan.objects.length) fail('archive_invalid');
  const entries = [], seen = new Set();
  let totalBytes = 0;
  for (const entry of archive.objects) {
    if (!exactKeys(entry, ['binding', 'byteLength', 'sha256', 'base64']) || typeof entry.base64 !== 'string' ||
        !hashPattern.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) fail('archive_entry_invalid');
    assertFileObjectBinding(entry.binding);
    if (seen.has(objectKey(entry.binding))) fail('duplicate_object');
    seen.add(objectKey(entry.binding));
    if (!plan.objects.some(object => same(object, entry.binding))) fail('archive_binding_mismatch');
    const decoded = binaryBytes(Buffer.from(entry.base64, 'base64'));
    if (decoded.toString('base64') !== entry.base64 || decoded.length !== entry.byteLength || sha256(decoded) !== entry.sha256) fail('archive_bytes_mismatch');
    totalBytes += decoded.length;
    if (totalBytes > FILE_LIMITS.totalBytes) fail('archive_size_exceeded');
    entries.push({ binding: entry.binding, sha256: entry.sha256, byteLength: entry.byteLength, bytes: decoded });
  }
  if (totalBytes !== archive.totalBytes) fail('archive_total_mismatch');
  return { archiveSha256: expectedArchiveSha256, planSha256: plan.planSha256, entries, totalBytes,
    syntheticOnly: true, encrypted: false, customerRecoveryProven: false };
}

export function createSyntheticRestoreIntent({ plan, archiveBytes, archiveSha256, runId }) {
  const verified = verifyFilesArchive({ plan, expectedPlanSha256: plan.planSha256, bytes: archiveBytes, expectedArchiveSha256: archiveSha256 });
  if (!uuidPattern.test(runId ?? '')) fail('restore_run_invalid');
  const intent = { format: 'nestory-synthetic-files-restore-intent-v1', syntheticOnly: true,
    archiveSha256, planSha256: plan.planSha256, runId,
    objects: verified.entries.map(entry => ({ source: entry.binding, sha256: entry.sha256, byteLength: entry.byteLength,
      target: { bucket: entry.binding.bucket, name: `${TARGET.organization}/pilot-reset-files-${runId}/restored-${hash(entry.binding)}.bin` } })) };
  return { ...intent, intentSha256: hash(intent) };
}

export function restoreMarker(intent, item) {
  return { nestorySyntheticRecovery: 'v1', runId: intent.runId, intentSha256: intent.intentSha256,
    sourceBindingSha256: hash(item.source), archiveSha256: intent.archiveSha256, sha256: item.sha256 };
}

// This is deliberately read-only: after a started request, absent/unreadable is
// UNKNOWN, never permission to retry. Exact new target identity is reported
// separately; an API upload does not recreate the original object id/version.
export function reconcileSyntheticRestore({ intent, expectedIntentSha256, item, started, observation, bytes }) {
  if (!record(intent)) fail('restore_intent_invalid');
  const { intentSha256, ...payload } = intent;
  if (!hashPattern.test(expectedIntentSha256 ?? '') || intentSha256 !== expectedIntentSha256 || hash(payload) !== intentSha256 ||
      intent.format !== 'nestory-synthetic-files-restore-intent-v1' || intent.syntheticOnly !== true ||
      !Array.isArray(intent.objects) || !intent.objects.some(candidate => same(candidate, item)) || started !== true) fail('restore_intent_invalid');
  if (observation == null) return { status: 'unknown', mutationAllowed: false, retryAllowed: false, originalIdentityRestored: false };
  assertFileObjectBinding(observation.binding);
  if (observation.binding.bucket !== item.target.bucket || observation.binding.name !== item.target.name ||
      !same(observation.userMetadata, restoreMarker(intent, item))) fail('restore_target_conflict');
  const downloaded = binaryBytes(bytes);
  if (downloaded.length !== item.byteLength || sha256(downloaded) !== item.sha256) fail('restore_bytes_mismatch');
  return { status: 'verified', mutationAllowed: false, retryAllowed: false, originalIdentityRestored: false,
    source: copy(item.source), target: copy(observation.binding), sha256: item.sha256, byteLength: item.byteLength };
}
