// Protected-operator preparation and durable-state reconciliation only.
// No database transport, arbitrary SQL, actor impersonation, or execution authority.
import { createHash } from 'node:crypto';

const digest = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = code => { throw new Error(code); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...names].sort());
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

export const IMPLEMENTATION_BLOCKERS = Object.freeze([
  'genuine_session_actor_bridge_unimplemented',
  'prepare_and_seal_same_transaction_receipts_unimplemented',
  'separately_approved_recovery_artifact_reader_unimplemented',
]);
export const REQUIRED_ARTIFACTS = Object.freeze([
  'manifest', 'actions', 'archive', 'zeroPlan', 'continuationPlan', 'reportPlan', 'recoveryPlan',
  'restoreProof', 'storageProof', 'actorApprovals', 'containmentProof', 'rehearsalProof', 'liveConsent',
]);
export const SOURCE_ENTRYPOINTS = Object.freeze([
  '.github/workflows/ci.yml',
  'scripts/pilot-finance-reset-operator-core.mjs', 'scripts/pilot-finance-reset-operator-prepare.mjs',
  'scripts/pilot-finance-reset-executor-plan.mjs', 'scripts/pilot-finance-reset-registry.mjs',
  'scripts/pilot-finance-reset-retired-journal-core.mjs',
]);
const databaseDigestFields = ['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256',
  'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256'];

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('operator_noncanonical_value');
}
export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
// Source text has the same digest on a CRLF checkout and an LF runner. Artifact
// bytes remain byte-exact, including ciphertext and PostgreSQL-generated JSON.
export function hashSourceBytes(bytes) {
  try { return hashBytes(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n')); }
  catch { fail('operator_source_encoding_invalid'); }
}
const hashJson = value => hashBytes(canonicalJson(value));

// An explicitly reviewed original-date replay keeps issuance separate from the
// actual organization business date. Legacy packets retain their exact shape.
export const operationBusinessDate = operation => operation.executionBusinessDate ?? operation.issueDate;
export const operationInvoiceDatePolicy = operation => operation.invoiceDatePolicy ?? 'execution-business-date';

function validateOperation(operation) {
  const baseFields = ['operationId', 'projectRef', 'organizationId', 'mainSha', 'sourceGeneration',
    'targetGeneration', 'cutoff', 'issueDate', 'timezone'];
  const originalDates = keys(operation, [...baseFields, 'executionBusinessDate', 'invoiceDatePolicy']);
  if ((!keys(operation, baseFields) && !originalDates) || !uuid.test(operation.operationId) ||
    !/^[a-z0-9]{20}$/.test(operation.projectRef) || !uuid.test(operation.organizationId) ||
    !gitSha.test(operation.mainSha) || !Number.isSafeInteger(operation.sourceGeneration) ||
    operation.sourceGeneration < 0 || operation.sourceGeneration >= 2147483647 ||
    operation.targetGeneration !== operation.sourceGeneration + 1 || operation.cutoff !== '2026-10-01' ||
    !/^2026-10-(?:0[1-9]|[12][0-9]|3[01])$/.test(operation.issueDate) ||
    typeof operation.timezone !== 'string' || operation.timezone.length > 100) fail('operator_scope_invalid');
  if (originalDates && (operation.invoiceDatePolicy !== 'original-reviewed-october' || operation.issueDate !== '2026-10-01' ||
    !/^2026-10-(?:0[1-9]|[12][0-9]|3[01])$/.test(operation.executionBusinessDate) ||
    operation.executionBusinessDate < operation.issueDate)) fail('operator_invoice_date_policy_invalid');
  try { new Intl.DateTimeFormat('en-CA', { timeZone: operation.timezone }).format(); }
  catch { fail('operator_timezone_invalid'); }
}

function validateSources(sources) {
  if (!Array.isArray(sources) || !sources.length) fail('operator_sources_missing');
  const names = new Set();
  for (const source of sources) {
    if (!keys(source, ['path', 'sha256']) || !digest.test(source.sha256) || typeof source.path !== 'string' ||
      source.path.includes('\\') || !/^[a-zA-Z0-9_./-]+$/.test(source.path) ||
      source.path.split('/').some(part => !part || part === '.' || part === '..') || names.has(source.path)) fail('operator_source_invalid');
    names.add(source.path);
  }
  if (SOURCE_ENTRYPOINTS.some(name => !names.has(name)) ||
      !sources.some(source => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(source.path))) fail('operator_source_coverage_incomplete');
  return [...sources].sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function validateReview(review) {
  if (!keys(review, ['format', 'operation', 'schemaSha256', 'ledgerSha256', 'sourceSnapshotSha256',
    'archiveRows', 'actionCount', 'databaseBinding', 'artifacts']) || review.format !== 'nestory-protected-reset-review-v1') fail('operator_review_invalid');
  validateOperation(review.operation);
  if (![review.schemaSha256, review.ledgerSha256, review.sourceSnapshotSha256].every(value => digest.test(value)) ||
    !Number.isSafeInteger(review.archiveRows) || review.archiveRows < 1 ||
    !Number.isSafeInteger(review.actionCount) || review.actionCount < 1 ||
    !keys(review.databaseBinding, databaseDigestFields) || !Object.values(review.databaseBinding).every(value => digest.test(value)) ||
    !keys(review.artifacts, REQUIRED_ARTIFACTS) ||
    Object.values(review.artifacts).some(value => value !== null && !digest.test(value))) fail('operator_review_binding_invalid');
  if (review.artifacts.manifest === null || review.artifacts.actions === null || review.artifacts.archive === null) fail('operator_exact_row_artifacts_required');
}

// Artifact bytes are hashed in memory and discarded. The output contains only
// digests/counts. A digest establishes identity, not human consent or provenance.
// Real approval, backup and isolation evidence must later be verified by a
// protected reader, independent of this locally supplied packet.
export function prepareOperatorPacket({ review, sources, artifacts, candidateHead }) {
  validateReview(review);
  if (candidateHead !== review.operation.mainSha) fail('operator_checkout_changed');
  const sourceFiles = validateSources(sources);
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts) ||
    Object.keys(artifacts).some(role => !REQUIRED_ARTIFACTS.includes(role))) fail('operator_artifact_roles_invalid');
  const verifiedArtifacts = {};
  const evidenceBlockers = [];
  for (const role of REQUIRED_ARTIFACTS) {
    const expected = review.artifacts[role], bytes = artifacts[role];
    if (expected === null) {
      if (bytes !== undefined) fail('operator_unreviewed_artifact');
      evidenceBlockers.push(`missing_${role}`);
      verifiedArtifacts[role] = null;
    } else {
      if (!(typeof bytes === 'string' || bytes instanceof Uint8Array) || !bytes.length || hashBytes(bytes) !== expected) fail('operator_artifact_digest_mismatch');
      verifiedArtifacts[role] = { sha256: expected, bytes: Buffer.byteLength(bytes) };
    }
  }
  const body = {
    format: 'nestory-protected-reset-preparation-v1', operation: structuredClone(review.operation),
    reviewSha256: hashJson(review), schemaSha256: review.schemaSha256, ledgerSha256: review.ledgerSha256,
    sourceSnapshotSha256: review.sourceSnapshotSha256, archiveRows: review.archiveRows, actionCount: review.actionCount,
    // PostgreSQL canonical row/action digests and encrypted artifact file hashes
    // have different meanings; neither may be substituted for the other.
    databaseBinding: structuredClone(review.databaseBinding),
    sourceHashFormat: 'utf8-lf-v1', sourceFiles, sourcesSha256: hashJson(sourceFiles), artifacts: verifiedArtifacts,
    evidenceBlockers, implementationBlockers: [...IMPLEMENTATION_BLOCKERS],
    executionSupported: false, customerApprovalVerified: false,
    writer: { environment: 'production-database', concurrencyGroup: 'production-supabase', cancelInProgress: false },
    endState: 'verified-frozen-checkpoint',
  };
  return { ...body, packetSha256: hashJson(body) };
}

export function assertOperatorPacket(packet) {
  if (!keys(packet, ['format', 'operation', 'reviewSha256', 'schemaSha256', 'ledgerSha256', 'sourceSnapshotSha256',
    'archiveRows', 'actionCount', 'databaseBinding', 'sourceHashFormat', 'sourceFiles', 'sourcesSha256', 'artifacts', 'evidenceBlockers', 'implementationBlockers',
    'executionSupported', 'customerApprovalVerified', 'writer', 'endState', 'packetSha256'])) fail('operator_packet_invalid');
  const { packetSha256, ...body } = packet;
  if (!digest.test(packetSha256) || hashJson(body) !== packetSha256 || packet.format !== 'nestory-protected-reset-preparation-v1' ||
    packet.executionSupported !== false || packet.customerApprovalVerified !== false || packet.sourceHashFormat !== 'utf8-lf-v1' ||
    packet.endState !== 'verified-frozen-checkpoint' || !same(packet.implementationBlockers, IMPLEMENTATION_BLOCKERS) ||
    !same(packet.writer, { environment: 'production-database', concurrencyGroup: 'production-supabase', cancelInProgress: false })) fail('operator_packet_binding_invalid');
  validateOperation(packet.operation);
  if (hashJson(validateSources(packet.sourceFiles)) !== packet.sourcesSha256 ||
    ![packet.reviewSha256, packet.schemaSha256, packet.ledgerSha256, packet.sourceSnapshotSha256].every(value => digest.test(value)) ||
    !Number.isSafeInteger(packet.archiveRows) || packet.archiveRows < 1 ||
    !Number.isSafeInteger(packet.actionCount) || packet.actionCount < 1 ||
    !keys(packet.databaseBinding, databaseDigestFields) || !Object.values(packet.databaseBinding).every(value => digest.test(value)) ||
    !keys(packet.artifacts, REQUIRED_ARTIFACTS)) fail('operator_packet_evidence_invalid');
  for (const artifact of Object.values(packet.artifacts)) if (artifact !== null &&
    (!keys(artifact, ['sha256', 'bytes']) || !digest.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1)) fail('operator_packet_evidence_invalid');
  if (packet.artifacts.manifest === null || packet.artifacts.actions === null || packet.artifacts.archive === null ||
    !same(packet.evidenceBlockers, REQUIRED_ARTIFACTS.filter(role => packet.artifacts[role] === null).map(role => `missing_${role}`))) fail('operator_packet_evidence_invalid');
  return packet;
}

function assertObservedBinding(packet, observation) {
  if (!keys(observation, ['operation', 'packetSha256', 'currentMainSha', 'sourcesSha256', 'schemaSha256', 'ledgerSha256',
    'businessDate', 'control', 'durable', 'checkpoint', 'approvals', 'contained', 'writerLease']) ||
    !same(observation.operation, packet.operation) || observation.packetSha256 !== packet.packetSha256 ||
    observation.currentMainSha !== packet.operation.mainSha || observation.sourcesSha256 !== packet.sourcesSha256 ||
    observation.schemaSha256 !== packet.schemaSha256 || observation.ledgerSha256 !== packet.ledgerSha256 ||
    observation.businessDate !== operationBusinessDate(packet.operation) || observation.contained !== true ||
    !keys(observation.writerLease, ['environment', 'group', 'cancelInProgress', 'held']) ||
    !same(observation.writerLease, { environment: 'production-database', group: 'production-supabase', cancelInProgress: false, held: true })) fail('operator_observation_binding_invalid');
}

// This produces a reviewable NEXT requirement, never a command to execute. The
// future transport must obtain observations from durable database state while
// holding the shared writer lane. A local receipt cannot settle a lost COMMIT.
export function reconcileOperatorState(packet, observation) {
  assertOperatorPacket(packet);
  assertObservedBinding(packet, observation);
  const result = (next, reason) => ({ operationId: packet.operation.operationId, packetSha256: packet.packetSha256,
    next, reason, mutationAllowed: false, implementationBlockers: [...IMPLEMENTATION_BLOCKERS] });
  if (packet.evidenceBlockers.length) return result('blocked', 'operation_evidence_incomplete');
  const control = observation.control;
  if (!keys(control, ['status', 'generation', 'cutoff']) || !['unenrolled', 'open', 'frozen'].includes(control.status) ||
      !Number.isSafeInteger(control.generation) || control.generation < 0 ||
      (control.status === 'unenrolled' && (control.generation !== 0 || control.cutoff !== null)) ||
      (control.cutoff !== null && control.cutoff !== packet.operation.cutoff)) fail('operator_control_invalid');
  if (observation.durable === null && control.generation === packet.operation.sourceGeneration) {
    if (observation.checkpoint !== null || observation.approvals !== null) fail('operator_unprepared_evidence_present');
    return result('freeze-and-reserve-generation', 'requires_separate_action_time_approval_and_protected_transport');
  }
  if (control.status !== 'frozen' || control.generation !== packet.operation.targetGeneration || control.cutoff !== packet.operation.cutoff) fail('operator_frozen_generation_changed');
  if (observation.durable === null) {
    if (observation.approvals !== null) fail('operator_unprepared_evidence_present');
    if (observation.checkpoint === null) return result('capture-frozen-recovery-checkpoint', 'never_archive_or_remove_before_verified_recovery_checkpoint');
    validateRecoveryCheckpoint(packet, observation.checkpoint);
    return result('prepare-original-operation', 'archive_and_seal_only_the_reviewed_rows_and_hashes');
  }
  validateRecoveryCheckpoint(packet, observation.checkpoint);
  const durable = observation.durable;
  if (!keys(durable, ['operationId', 'packetSha256', 'manifestSha256', 'planSha256', 'actionSha256', 'archiveSha256',
    'archiveRows', 'actionCount', 'appliedCount', 'status', 'finalCheckpoint']) ||
    durable.operationId !== packet.operation.operationId || durable.packetSha256 !== packet.packetSha256 ||
    durable.manifestSha256 !== packet.databaseBinding.manifestSha256 || durable.planSha256 !== packet.databaseBinding.planSha256 ||
    durable.actionSha256 !== packet.databaseBinding.actionSha256 || durable.archiveSha256 !== packet.databaseBinding.archiveSha256 || durable.archiveRows !== packet.archiveRows ||
    durable.actionCount !== packet.actionCount || !Number.isSafeInteger(durable.appliedCount) || durable.appliedCount < 0 ||
    durable.appliedCount > packet.actionCount || !['prepared', 'sealed', 'executing', 'actions_complete'].includes(durable.status)) fail('operator_original_operation_changed');
  if (durable.status === 'executing') return result('inspect-original-operation', 'commit_outcome_unresolved_never_replay_or_replace_uuid');
  if (durable.status !== 'actions_complete' && (durable.appliedCount !== 0 || durable.finalCheckpoint !== null)) fail('operator_partial_checkpoint_invalid');
  if (durable.status === 'prepared') return result('seal-original-operation', 'verify_archived_images_and_exact_action_graph');
  if (observation.approvals === null) return result('verify-authenticated-approvals', 'operator_actor_ids_and_artifact_digests_are_not_session_approval');
  validateApprovals(packet, observation.approvals);
  if (durable.status === 'sealed') return result('execute-original-checked-transaction', 'same_uuid_no_automatic_retry_after_unknown_result');
  if (durable.appliedCount !== packet.actionCount || !keys(durable.finalCheckpoint, ['status', 'kind', 'sha256', 'generation', 'cutoff',
    'sourceSha256', 'currentSourceSha256', 'reportsVerified', 'recoverySourcesVerified', 'capabilitiesAbsent']) ||
    durable.finalCheckpoint.status !== 'complete' || durable.finalCheckpoint.kind !== 'checked-reports' ||
    !digest.test(durable.finalCheckpoint.sha256) || durable.finalCheckpoint.generation !== packet.operation.targetGeneration ||
    durable.finalCheckpoint.cutoff !== packet.operation.cutoff || !digest.test(durable.finalCheckpoint.sourceSha256) ||
    durable.finalCheckpoint.currentSourceSha256 !== durable.finalCheckpoint.sourceSha256 ||
    durable.finalCheckpoint.reportsVerified !== true || durable.finalCheckpoint.recoverySourcesVerified !== true ||
    durable.finalCheckpoint.capabilitiesAbsent !== true) return result('inspect-original-operation', 'completed_actions_do_not_prove_checked_checkpoint_or_recovery');
  return result('retain-frozen-checkpoint', 'committed_result_reconciled_without_replay_reopening_is_a_separate_operation');
}

function validateRecoveryCheckpoint(packet, checkpoint) {
  if (!keys(checkpoint, ['operationId', 'sourceSha256', 'archiveSha256', 'archiveArtifactSha256', 'restoreProofSha256', 'storageProofSha256',
    'contained', 'isolatedRestoreVerified', 'encryptedRetentionVerified', 'foreignOrganizationsPreserved']) ||
    checkpoint.operationId !== packet.operation.operationId || checkpoint.sourceSha256 !== packet.sourceSnapshotSha256 ||
    checkpoint.archiveSha256 !== packet.databaseBinding.archiveSha256 || checkpoint.archiveArtifactSha256 !== packet.artifacts.archive.sha256 ||
    checkpoint.restoreProofSha256 !== packet.artifacts.restoreProof.sha256 ||
    checkpoint.storageProofSha256 !== packet.artifacts.storageProof.sha256 ||
    ['contained', 'isolatedRestoreVerified', 'encryptedRetentionVerified', 'foreignOrganizationsPreserved'].some(key => checkpoint[key] !== true)) fail('operator_recovery_checkpoint_unverified');
}

function validateApprovals(packet, approvals) {
  if (!keys(approvals, ['operationId', 'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256', 'liveConsentSha256',
    'makerActorId', 'reviewerActorId', 'continuationActorId', 'independentAuthenticatedApprovals', 'continuationContextVerified']) ||
    approvals.operationId !== packet.operation.operationId || approvals.zeroReviewSha256 !== packet.databaseBinding.zeroReviewSha256 ||
    approvals.continuationSemanticSha256 !== packet.databaseBinding.continuationSemanticSha256 || approvals.reportReviewSha256 !== packet.databaseBinding.reportReviewSha256 ||
    approvals.liveConsentSha256 !== packet.artifacts.liveConsent.sha256 ||
    ![approvals.makerActorId, approvals.reviewerActorId, approvals.continuationActorId].every(value => uuid.test(value)) ||
    approvals.makerActorId === approvals.reviewerActorId || approvals.independentAuthenticatedApprovals !== true ||
    approvals.continuationContextVerified !== true) fail('operator_authenticated_approval_unverified');
}
