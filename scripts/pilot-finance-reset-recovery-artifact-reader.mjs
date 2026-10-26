// Read-only supplemental inverse review. It never replaces the original packet,
// reserves a generation, issues SQL, supplies consent or selects storage/keys.
import { assertOperatorPacket, canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { artifactSlot } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';

const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const column = /^[a-z][a-z0-9_]*$/;
const MAX_PLAINTEXT = 32 * 1024 * 1024;
const expectedFields = ['restoreOperationId', 'originalOperationId', 'projectRef', 'organizationId', 'mainSha',
  'sourcesSha256', 'reportCheckpointSha256', 'postSourceSha256', 'recoverySourcesSha256',
  'phaseBindingSha256', 'actionMappingSha256', 'executionBusinessDate'];
const bindingFields = ['operationId', 'projectRef', 'organizationId', 'mainSha', 'sourceSnapshotSha256', 'sourcesSha256', 'role'];
const descriptorFields = ['format', 'algorithm', 'keyId', 'binding', 'plaintextSha256', 'byteLength', 'ciphertextSha256', 'ciphertextByteLength'];
const operationFields = ['operation_id', 'organization_id', 'operation_kind', 'restore_of', 'source_generation', 'target_generation',
  'manifest_sha256', 'plan_sha256', 'schema_sha256', 'archive_sha256', 'action_sha256', 'archive_count', 'action_count', 'audit_timestamp', 'audit_actor'];
const phaseFields = ['continuation_after_sha256', 'continuation_before_sha256', 'continuation_review_sha256',
  'report_checkpoint_sha256', 'schema_sha256', 'source_sha256', 'sources_sha256', 'zero_authority_sha256', 'zero_review_sha256'];
const actionFields = ['action_id', 'ordinal', 'relation_name', 'primary_key', 'kind', 'before_row_text', 'after_row_text',
  'before_sha256', 'after_sha256', 'changed_columns'];
const mappingFields = ['action_id', 'ordinal', 'relation_name', 'primary_key', 'kind', 'before_sha256', 'after_sha256'];
const pruneRelations = new Set([
  'public.owner_opening_balance_requests', 'public.owner_opening_balance_entries',
  'public.lease_terms', 'public.lease_billing_terms', 'public.finance_income_items', 'public.tenant_invoices',
  'public.tenant_invoice_lines', 'public.tenant_invoice_rent_segments', 'public.management_fee_occurrences',
  'public.owner_invoices', 'public.owner_invoice_lines', 'public.rent_generation_exceptions',
  'public.owner_event_allocation_sets', 'public.owner_event_owner_allocations', 'public.owner_component_movements',
  'public.owner_balance_periods', 'public.owner_balance_period_components',
]);
const snapshot = value => JSON.parse(canonicalJson(value));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const object = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, names) => object(value) && same(Object.keys(value).sort(), [...names].sort());
class RecoveryArtifactError extends Error {
  constructor(code) { super(`reset_recovery_artifact_${code}`); this.requiresReconciliation = true; }
}
const fail = code => { throw new RecoveryArtifactError(code); };
const sanitize = (error, code) => { if (error instanceof RecoveryArtifactError) throw error; fail(code); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function businessDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// Only hash-only phase fields and the native action mapping use this encoder.
// PostgreSQL jsonb text orders object keys by UTF-8 byte length then byte value,
// with a space after each colon/comma. Row text is NEVER parsed/reserialized for
// hashing. Numeric primary keys must be exact safe integers; other JSON numeric
// forms and unpaired surrogates/NUL are outside this bounded representation.
function postgresMappingText(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!value.isWellFormed() || value.includes('\0')) fail('mapping_value_unsupported');
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
  if (Array.isArray(value)) return `[${value.map(postgresMappingText).join(', ')}]`;
  if (object(value)) {
    const names = Object.keys(value);
    if (names.some(name => !column.test(name))) fail('mapping_value_unsupported');
    names.sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
    return `{${names.map(name => `${JSON.stringify(name)}: ${postgresMappingText(value[name])}`).join(', ')}}`;
  }
  fail('mapping_value_unsupported');
}
function checkConfiguration(packet, descriptor, expected) {
  assertOperatorPacket(packet);
  if (!keys(expected, expectedFields) || !uuid.test(expected.restoreOperationId) || !uuid.test(expected.originalOperationId) ||
      expected.restoreOperationId === expected.originalOperationId || !businessDate(expected.executionBusinessDate) ||
      ['sourcesSha256', 'reportCheckpointSha256', 'postSourceSha256', 'recoverySourcesSha256', 'phaseBindingSha256', 'actionMappingSha256']
        .some(name => !digest.test(expected[name]))) fail('expected_invalid');
  const operation = packet.operation;
  if (expected.originalOperationId !== operation.operationId || expected.organizationId !== operation.organizationId ||
      expected.projectRef !== operation.projectRef || expected.mainSha !== operation.mainSha || expected.sourcesSha256 !== packet.sourcesSha256 ||
      operation.targetGeneration >= 2147483647 || packet.evidenceBlockers.length) fail('original_packet_binding_mismatch');
  if (!keys(descriptor, descriptorFields) || descriptor.format !== 'nestory-reset-aes-gcm-v1' || descriptor.algorithm !== 'aes-256-gcm' ||
      typeof descriptor.keyId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(descriptor.keyId) ||
      !digest.test(descriptor.plaintextSha256) || !digest.test(descriptor.ciphertextSha256) ||
      !Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength < 1 || descriptor.byteLength > MAX_PLAINTEXT ||
      !Number.isSafeInteger(descriptor.ciphertextByteLength) || descriptor.ciphertextByteLength < 1 ||
      descriptor.ciphertextByteLength > 48 * 1024 * 1024 || !keys(descriptor.binding, bindingFields)) fail('descriptor_invalid');
  if (!same(descriptor.binding, { operationId: expected.restoreOperationId, projectRef: expected.projectRef,
    organizationId: expected.organizationId, mainSha: expected.mainSha, sourceSnapshotSha256: expected.postSourceSha256,
    sourcesSha256: expected.sourcesSha256, role: 'recoveryPlan' })) fail('descriptor_binding_mismatch');
}
function columns(value) {
  return Array.isArray(value) && value.every(name => typeof name === 'string' && column.test(name)) && new Set(value).size === value.length;
}
function rowImage(action, prefix, organization) {
  const text = action[`${prefix}_row_text`], sha256 = action[`${prefix}_sha256`];
  if (text === null && sha256 === null) return null;
  if (typeof text !== 'string' || !digest.test(sha256) || hashBytes(text) !== sha256) fail('row_digest_mismatch');
  let row;
  try { row = JSON.parse(text); } catch { fail('row_shape_invalid'); }
  if (!object(row) || row.organization_id !== organization ||
      Object.entries(action.primary_key).some(([key, value]) => !Object.hasOwn(row, key) || row[key] !== value)) fail('row_scope_mismatch');
  return row;
}
function checkActions(actions, organization) {
  if (!Array.isArray(actions) || !actions.length) fail('actions_invalid');
  const ids = new Set();
  for (const [index, action] of actions.entries()) {
    if ((!keys(action, actionFields) && !keys(action, [...actionFields, 'insert_columns'])) ||
        !uuid.test(action.action_id) || ids.has(action.action_id) || action.ordinal !== index + 1 ||
        !object(action.primary_key) || !Object.keys(action.primary_key).length || !columns(action.changed_columns) ||
        Object.hasOwn(action, 'insert_columns') && !columns(action.insert_columns)) fail('action_shape_invalid');
    ids.add(action.action_id);
    for (const [key, value] of Object.entries(action.primary_key)) {
      if (!column.test(key) || !(typeof value === 'string' || typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0))) fail('primary_key_invalid');
    }
    const rule = RESET_REGISTRY[action.relation_name];
    if (!rule || !(action.kind === 'restore' && ['archive-remove', 'normalize-reviewed', 'retire-intent'].includes(rule.disposition) ||
      action.kind === 'recovery-prune' && pruneRelations.has(action.relation_name) ||
      action.kind === 'recovery-repair' && action.relation_name === 'public.lease_terms')) fail('action_scope_invalid');
    const before = rowImage(action, 'before', organization), after = rowImage(action, 'after', organization);
    if (action.kind === 'recovery-prune') {
      if (!before || after !== null || action.changed_columns.length) fail('prune_shape_invalid');
    } else if (!after) fail('restore_shape_invalid');
    else if (before === null) {
      if (action.kind !== 'restore' || action.changed_columns.length || !action.insert_columns?.length ||
          action.insert_columns.some(name => !Object.hasOwn(after, name))) fail('insert_shape_invalid');
    } else {
      if (!action.changed_columns.length || action.changed_columns.some(name => Object.hasOwn(action.primary_key, name) ||
        name === 'organization_id' || !Object.hasOwn(before, name) || !Object.hasOwn(after, name))) fail('update_shape_invalid');
      if (action.kind === 'recovery-repair' && (before.status !== 'expired' || after.status !== 'active' ||
        !action.changed_columns.includes('status') || action.changed_columns.some(name => !['status', 'updated_at', 'updated_by'].includes(name)))) fail('repair_shape_invalid');
    }
  }
  return hashBytes(postgresMappingText(actions.map(action => Object.fromEntries(mappingFields.map(name => [name, action[name]])))));
}
function checkReview(review, packet, expected) {
  if (!keys(review, ['operation', 'actions', 'phaseBinding', 'phaseBindingSha256', 'executionBusinessDate']) ||
      !keys(review.operation, operationFields) || !keys(review.phaseBinding, phaseFields)) fail('review_shape_invalid');
  const operation = review.operation, original = packet.operation, binding = packet.databaseBinding, phase = review.phaseBinding;
  if (operation.operation_id !== expected.restoreOperationId || operation.restore_of !== expected.originalOperationId ||
      operation.organization_id !== expected.organizationId || operation.operation_kind !== 'restore' || operation.audit_actor !== null ||
      operation.source_generation !== original.targetGeneration || operation.target_generation !== original.targetGeneration + 1 ||
      operation.manifest_sha256 !== binding.manifestSha256 || operation.schema_sha256 !== packet.schemaSha256 ||
      operation.archive_sha256 !== binding.archiveSha256 || operation.archive_count !== packet.archiveRows ||
      !digest.test(operation.plan_sha256) || operation.action_sha256 !== expected.actionMappingSha256 ||
      !Number.isSafeInteger(operation.action_count) || operation.action_count < 1 || operation.action_count !== review.actions?.length ||
      typeof operation.audit_timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(operation.audit_timestamp) ||
      !Number.isFinite(Date.parse(operation.audit_timestamp)) || review.executionBusinessDate !== expected.executionBusinessDate) fail('operation_binding_mismatch');
  if (Object.values(phase).some(value => !digest.test(value)) || phase.schema_sha256 !== packet.schemaSha256 ||
      phase.zero_review_sha256 !== binding.zeroReviewSha256 || phase.report_checkpoint_sha256 !== expected.reportCheckpointSha256 ||
      phase.source_sha256 !== expected.postSourceSha256 || phase.sources_sha256 !== expected.recoverySourcesSha256 ||
      review.phaseBindingSha256 !== expected.phaseBindingSha256 || hashBytes(postgresMappingText(phase)) !== expected.phaseBindingSha256) fail('phase_binding_mismatch');
  if (checkActions(review.actions, expected.organizationId) !== expected.actionMappingSha256) fail('action_mapping_mismatch');
}

// expected and descriptor must come from separately pinned, approved post-reset
// evidence. The trusted verifier independently checks current inverse consent,
// original checkpoint/source/candidate mapping and storage/key recovery against
// this exact context. It returns an opaque non-boolean receipt or throws. The
// receipt is never manufactured here or treated as proof of POSIX durability.
export function createSupplementalRecoveryReader(options) {
  let packet, descriptor, expected, readCommitted, verifyRecoveryAuthority;
  try {
    if (!keys(options, ['provider', 'originalPacket', 'descriptor', 'expected', 'verifyRecoveryAuthority']) ||
        typeof options.provider?.readCommitted !== 'function' || typeof options.verifyRecoveryAuthority !== 'function') fail('configuration_invalid');
    packet = snapshot(options.originalPacket); descriptor = snapshot(options.descriptor); expected = snapshot(options.expected);
    checkConfiguration(packet, descriptor, expected);
    readCommitted = options.provider.readCommitted.bind(options.provider);
    verifyRecoveryAuthority = options.verifyRecoveryAuthority;
  } catch (error) { sanitize(error, 'configuration_invalid'); }
  const slot = artifactSlot(descriptor.binding);
  return Object.freeze({
    async readRecoveryReview() {
      let plaintext, review;
      try {
        // This single provider observation authenticates intent, ciphertext and
        // required completion receipt together. No permissive read/reconcile.
        plaintext = await readCommitted({ slot, descriptor: snapshot(descriptor) });
        if (!(plaintext instanceof Uint8Array) || plaintext.length !== descriptor.byteLength ||
            hashBytes(plaintext) !== descriptor.plaintextSha256) fail('plaintext_binding_mismatch');
        review = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
        if (!Buffer.from(canonicalJson(review)).equals(plaintext)) fail('review_encoding_invalid');
        checkReview(review, packet, expected);
      } catch (error) { sanitize(error, 'committed_read_unavailable'); }
      finally { if (plaintext instanceof Uint8Array) plaintext.fill(0); }
      try {
        const receipt = await verifyRecoveryAuthority(snapshot({ originalPacket: packet, packetSha256: packet.packetSha256,
          expected, slot, descriptor, review, artifactSha256: descriptor.ciphertextSha256 }));
        if (receipt === null || typeof receipt !== 'object' && typeof receipt !== 'symbol' || Array.isArray(receipt)) fail('authority_receipt_missing');
      } catch (error) { sanitize(error, 'authority_unavailable'); }
      // Transport consumes this exact pair; the original recoveryPlan remains
      // untouched, and its hash must never stand in for the new ciphertext hash.
      return freeze({ review, artifactSha256: descriptor.ciphertextSha256 });
    },
  });
}
