// Pure preparation only. No connections, exports, dispatch, or execution authority.
// Same-database before-images remain transaction/audit witnesses, not a backup.
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';

const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const octoberDate = /^2026-10-(?:0[1-9]|[12][0-9]|3[01])$/;
const isDigest = value => typeof value === 'string' && digest.test(value);
const isUuid = value => typeof value === 'string' && uuid.test(value);
const fail = code => { throw new Error(`no_backup_${code}`); };
const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...fields].sort());
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const hashJson = value => hashBytes(canonicalJson(value));
const bytes = value => (typeof value === 'string' || value instanceof Uint8Array) && value.length > 0;

export const NO_BACKUP_POLICY = 'no-backup-user-waived';
export const NO_BACKUP_PROJECT = 'pfvmztxktkwyewvxfgot';
export const NO_BACKUP_ORGANIZATION = '752a87b8-bd04-4a45-9cb8-00687af66e73';
// actorApprovals binds the independently reviewed named maker/reviewer scope
// available before freeze. It is not the future DB zero-approval/endorsement
// receipt. Those fresh genuine-session records are required separately before
// execution; adding them never replaces this packet or its reservation binding.
// Reference bytes alone establish neither reviewer provenance nor authority.
export const NO_BACKUP_EVIDENCE_ROLES = Object.freeze(['waiver', 'liveConsent', 'actorApprovals', 'containmentProof', 'rehearsalProof']);
export const NO_BACKUP_DATABASE_FIELDS = Object.freeze(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256',
  'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256']);
export const NO_BACKUP_ACTIONS = Object.freeze(['inspect', 'reconcile', 'freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'reopen', 'complete-receipt']);
export const NO_BACKUP_VERIFICATION_BLOCKERS = Object.freeze([
  'no_backup_waiver_not_independently_verified', 'exact_scope_live_consent_not_independently_verified',
  'current_actor_authority_not_independently_verified', 'current_containment_not_independently_verified',
  'rehearsal_provenance_not_independently_verified', 'protected_live_dispatch_held',
]);
export const NO_BACKUP_RECOVERY = Object.freeze({ available: false, backupSupported: false, restoreSupported: false,
  exportSupported: false, beforeImages: 'same-database-transaction-audit-only' });
const writer = Object.freeze({ environment: 'production-database', concurrencyGroup: 'production-supabase', cancelInProgress: false });

// Pin the complete existing runner import graph and the separate preparation and
// reopening entrypoints. Hashing an existing recovery helper does not enable it.
// New runtime helpers require an explicit source-contract update; additive SQL
// files may be pinned alongside the mandatory safety migrations below.
export const NO_BACKUP_REQUIRED_SOURCE_FILES = Object.freeze([
  '.github/workflows/ci.yml', '.github/workflows/pilot-financial-reset.yml',
  ...['no-backup-core', 'no-backup-runtime', 'no-backup-transport', 'no-backup-reader', 'current-session', 'retired-journal-core', 'operator-core', 'hosted-runner', 'hosted-reconcile', 'hosted-workflow-core',
    'hosted-actor', 'hosted-approval', 'hosted-reader', 'hosted-transport', 'hosted-transport-protocol',
    'hosted-protocol', 'durable-store', 'encrypted-artifacts', 'recovery-artifact-reader', 'reopening-protocol',
    'executor-local', 'executor-plan', 'core', 'recovery-core', 'registry'].map(name => `scripts/pilot-finance-reset-${name}.mjs`),
  'scripts/local-recovery-docker.mjs', 'scripts/ips-readiness-recovery-core.mjs', 'scripts/hosted-migration-parity-core.mjs',
  ...[
    '20261024013600_financial_write_lifecycle_fence',
    '20261024013604_financial_artifact_generation_retirement',
    '20261024013612_financial_reset_private_action_foundation',
    '20261024013613_financial_reset_exact_row_guard_integration',
    '20261024013615_financial_reset_known_zero_checked_phase',
    '20261024013616_financial_reset_checked_continuation_billing',
    '20261024013620_financial_reset_report_finalization_checkpoint',
    '20261024013621_financial_reset_reviewed_deferred_leases_and_deposits',
    '20261024013622_financial_reset_reviewed_original_invoice_dates',
    '20261024013623_financial_reset_genuine_session_actor_bridge',
    '20261024013624_financial_reset_hosted_operation_reservation',
    '20261024013625_financial_reset_scoped_session_commands',
    '20261024013626_financial_reset_scoped_continuation_reports',
    '20261024015702_financial_reset_checked_reopening',
    '20261024021544_financial_reset_retired_deposit_journal_slots',
    '20261024023749_financial_reset_explicit_no_backup_binding',
  ].map(name => `supabase/migrations/${name}.sql`),
].sort());

export const NO_BACKUP_OPERATION_FIELDS = Object.freeze(['operationId', 'kind', 'restoreOf', 'projectRef', 'organizationId',
  'mainSha', 'sourceGeneration', 'targetGeneration', 'cutoff', 'issueDate', 'dueDate', 'executionBusinessDate', 'invoiceDatePolicy', 'timezone']);
export const NO_BACKUP_REVIEW_FIELDS = Object.freeze(['format', 'recoveryPolicy', 'operation', 'schemaSha256', 'ledgerSha256',
  'sourceSnapshotSha256', 'foreignSnapshotSha256', 'archiveRows', 'actionCount', 'databaseBinding', 'evidenceReferences']);
export const NO_BACKUP_PACKET_FIELDS = Object.freeze(['format', 'recoveryPolicy', 'operation', 'reviewSha256', 'schemaSha256',
  'ledgerSha256', 'sourceSnapshotSha256', 'foreignSnapshotSha256', 'archiveRows', 'actionCount', 'databaseBinding',
  'sourceHashFormat', 'sourceFiles', 'sourcesSha256', 'evidenceReferences', 'evidenceBlockers', 'verificationBlockers',
  'executionSupported', 'customerApprovalVerified', 'recovery', 'writer', 'endState', 'packetSha256']);

function validateOperation(operation) {
  if (!exact(operation, NO_BACKUP_OPERATION_FIELDS) || !isUuid(operation.operationId) || operation.kind !== 'reset' ||
    operation.restoreOf !== null || operation.projectRef !== NO_BACKUP_PROJECT || operation.organizationId !== NO_BACKUP_ORGANIZATION ||
    typeof operation.mainSha !== 'string' || !/^[a-f0-9]{40}$/.test(operation.mainSha) || !Number.isSafeInteger(operation.sourceGeneration) ||
    operation.sourceGeneration < 0 || operation.sourceGeneration >= 2147483647 || operation.targetGeneration !== operation.sourceGeneration + 1 ||
    operation.cutoff !== '2026-10-01' || operation.issueDate !== '2026-10-01' || operation.dueDate !== '2026-10-07' ||
    typeof operation.executionBusinessDate !== 'string' || !octoberDate.test(operation.executionBusinessDate) || operation.invoiceDatePolicy !== 'original-reviewed-october' ||
    operation.timezone !== 'Asia/Phnom_Penh') fail('operation_scope_invalid');
}

function validateWitnesses(value) {
  if (![value.schemaSha256, value.ledgerSha256, value.sourceSnapshotSha256, value.foreignSnapshotSha256].every(isDigest) ||
    !Number.isSafeInteger(value.archiveRows) || value.archiveRows < 1 || !Number.isSafeInteger(value.actionCount) || value.actionCount < 1 ||
    !exact(value.databaseBinding, NO_BACKUP_DATABASE_FIELDS) || !Object.values(value.databaseBinding).every(isDigest)) fail('database_witness_invalid');
}

function validateSources(sources) {
  if (!Array.isArray(sources)) fail('source_coverage_invalid');
  const names = new Set();
  for (const source of sources) {
    if (!exact(source, ['path', 'sha256']) || typeof source.path !== 'string' || !isDigest(source.sha256) || names.has(source.path) ||
      (!NO_BACKUP_REQUIRED_SOURCE_FILES.includes(source.path) && !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(source.path))) fail('source_descriptor_invalid');
    names.add(source.path);
  }
  if (NO_BACKUP_REQUIRED_SOURCE_FILES.some(name => !names.has(name))) fail('source_coverage_incomplete');
  return sources.map(source => ({ ...source })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

// The caller supplies bytes from its checkout. The protected runtime must still
// prove the checkout/main identity and recheck these pins; caller hashes alone
// are not deployment or authorization evidence.
function verifySourceContents(sourceFiles, sourceContents) {
  if (!exact(sourceContents, sourceFiles.map(source => source.path))) fail('source_bytes_incomplete');
  for (const source of sourceFiles) if (!bytes(sourceContents[source.path]) || hashSourceBytes(sourceContents[source.path]) !== source.sha256) fail('source_bytes_changed');
  return true;
}

export function verifyNoBackupSourceContents(packet, sourceContents) {
  assertNoBackupPacket(packet);
  return verifySourceContents(packet.sourceFiles, sourceContents);
}

export function prepareNoBackupPacket(input) {
  if (!exact(input, ['review', 'sources', 'sourceContents', 'evidence', 'candidateHead', 'observedBusinessDate'])) fail('preparation_input_invalid');
  const { review, sources, sourceContents, evidence, candidateHead, observedBusinessDate } = input;
  if (!exact(review, NO_BACKUP_REVIEW_FIELDS) || review.format !== 'nestory-protected-reset-no-backup-review-v1' ||
    review.recoveryPolicy !== NO_BACKUP_POLICY || !exact(review.evidenceReferences, NO_BACKUP_EVIDENCE_ROLES) ||
    Object.values(review.evidenceReferences).some(value => value !== null && !isDigest(value))) fail('review_invalid');
  validateOperation(review.operation);
  validateWitnesses(review);
  if (candidateHead !== review.operation.mainSha) fail('checkout_changed');
  if (observedBusinessDate !== review.operation.executionBusinessDate) fail('business_date_changed');
  const sourceFiles = validateSources(sources);
  verifySourceContents(sourceFiles, sourceContents);
  if (!evidence || Object.getPrototypeOf(evidence) !== Object.prototype || Object.keys(evidence).some(role => !NO_BACKUP_EVIDENCE_ROLES.includes(role))) fail('evidence_roles_invalid');
  const evidenceReferences = {}, evidenceBlockers = [];
  for (const role of NO_BACKUP_EVIDENCE_ROLES) {
    const expected = review.evidenceReferences[role], content = evidence[role];
    if (expected === null) {
      if (Object.hasOwn(evidence, role)) fail('unreviewed_evidence');
      evidenceReferences[role] = null;
      evidenceBlockers.push(`missing_${role}`);
    } else {
      if (!bytes(content) || hashBytes(content) !== expected) fail('evidence_digest_mismatch');
      evidenceReferences[role] = { sha256: expected, bytes: Buffer.byteLength(content) };
    }
  }
  const body = {
    format: 'nestory-protected-reset-no-backup-preparation-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: structuredClone(review.operation), reviewSha256: hashJson(review), schemaSha256: review.schemaSha256,
    ledgerSha256: review.ledgerSha256, sourceSnapshotSha256: review.sourceSnapshotSha256, foreignSnapshotSha256: review.foreignSnapshotSha256,
    archiveRows: review.archiveRows, actionCount: review.actionCount, databaseBinding: structuredClone(review.databaseBinding),
    sourceHashFormat: 'utf8-lf-v1', sourceFiles, sourcesSha256: hashJson(sourceFiles), evidenceReferences, evidenceBlockers,
    verificationBlockers: [...NO_BACKUP_VERIFICATION_BLOCKERS], executionSupported: false, customerApprovalVerified: false,
    recovery: { ...NO_BACKUP_RECOVERY }, writer: { ...writer }, endState: 'verified-frozen-checkpoint',
  };
  return { ...body, packetSha256: hashJson(body) };
}

export function assertNoBackupPacket(packet) {
  if (!exact(packet, NO_BACKUP_PACKET_FIELDS)) fail('packet_shape_invalid');
  const { packetSha256, ...body } = packet;
  if (!isDigest(packetSha256) || hashJson(body) !== packetSha256 || packet.format !== 'nestory-protected-reset-no-backup-preparation-v1' ||
    packet.recoveryPolicy !== NO_BACKUP_POLICY || packet.sourceHashFormat !== 'utf8-lf-v1' || packet.executionSupported !== false ||
    packet.customerApprovalVerified !== false || !same(packet.recovery, NO_BACKUP_RECOVERY) || !same(packet.writer, writer) ||
    !same(packet.verificationBlockers, NO_BACKUP_VERIFICATION_BLOCKERS) || packet.endState !== 'verified-frozen-checkpoint' || !isDigest(packet.reviewSha256)) fail('packet_binding_invalid');
  validateOperation(packet.operation);
  validateWitnesses(packet);
  const ordered = validateSources(packet.sourceFiles);
  if (!same(ordered, packet.sourceFiles) || hashJson(ordered) !== packet.sourcesSha256) fail('source_binding_invalid');
  if (!exact(packet.evidenceReferences, NO_BACKUP_EVIDENCE_ROLES)) fail('evidence_shape_invalid');
  for (const reference of Object.values(packet.evidenceReferences)) if (reference !== null &&
    (!exact(reference, ['sha256', 'bytes']) || !isDigest(reference.sha256) || !Number.isSafeInteger(reference.bytes) || reference.bytes < 1)) fail('evidence_shape_invalid');
  if (!same(packet.evidenceBlockers, NO_BACKUP_EVIDENCE_ROLES.filter(role => packet.evidenceReferences[role] === null).map(role => `missing_${role}`))) fail('evidence_blockers_changed');
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: packet.recoveryPolicy, operation: packet.operation,
    schemaSha256: packet.schemaSha256, ledgerSha256: packet.ledgerSha256, sourceSnapshotSha256: packet.sourceSnapshotSha256,
    foreignSnapshotSha256: packet.foreignSnapshotSha256, archiveRows: packet.archiveRows, actionCount: packet.actionCount,
    databaseBinding: packet.databaseBinding, evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, packet.evidenceReferences[role]?.sha256 ?? null])) };
  if (hashJson(review) !== packet.reviewSha256) fail('review_binding_changed');
  return packet;
}

export function assertNoBackupAction(action) {
  if (!NO_BACKUP_ACTIONS.includes(action)) fail('action_unsupported');
  return action;
}

function validateContinuation(packet, continuation, postgresSemanticText) {
  if (!bytes(postgresSemanticText) || hashBytes(postgresSemanticText) !== packet.databaseBinding.continuationSemanticSha256) fail('semantic_bytes_mismatch');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(typeof postgresSemanticText === 'string' ? Buffer.from(postgresSemanticText) : postgresSemanticText)); }
  catch { fail('semantic_bytes_invalid'); }
  if (!same(parsed, continuation) || !exact(continuation, ['version', 'actor_id', 'billing_period_start', 'issue_date', 'leases',
    'execution_business_date', 'invoice_date_policy', 'original_invoice_sources']) || continuation.version !== 3 || !isUuid(continuation.actor_id) ||
    continuation.billing_period_start !== packet.operation.cutoff || continuation.issue_date !== packet.operation.issueDate ||
    continuation.execution_business_date !== packet.operation.executionBusinessDate || continuation.invoice_date_policy !== packet.operation.invoiceDatePolicy ||
    !Array.isArray(continuation.leases) || !continuation.leases.length || !Array.isArray(continuation.original_invoice_sources)) fail('semantic_scope_invalid');
  const leaseIds = new Set(), billed = new Set();
  for (const lease of continuation.leases) {
    if (!lease || !['lease_id', 'term_id', 'billing_rule_id'].every(field => isUuid(lease[field])) || leaseIds.has(lease.lease_id)) fail('lease_scope_invalid');
    leaseIds.add(lease.lease_id);
    if (lease.disposition === 'defer-expired-unbilled') {
      if (!exact(lease, ['lease_id', 'term_id', 'billing_rule_id', 'disposition', 'reason', 'source_sha256']) ||
        lease.reason !== 'renewal-unconfirmed' || !isDigest(lease.source_sha256)) fail('deferred_lease_invalid');
    } else {
      if (!exact(lease, ['lease_id', 'term_id', 'billing_rule_id', 'disposition', 'continue_month_to_month', 'rent_amount',
        'management_fee_amount', 'currency', 'recipient_person_id', 'collection_route', 'due_date']) || lease.disposition !== 'bill' ||
        lease.continue_month_to_month !== false || lease.due_date !== packet.operation.dueDate || lease.currency !== 'USD' ||
        !isUuid(lease.recipient_person_id) || !['through_ips', 'direct_to_owner'].includes(lease.collection_route) ||
        !['rent_amount', 'management_fee_amount'].every(field => typeof lease[field] === 'string' && /^\d+(?:\.\d{1,2})?$/.test(lease[field]))) fail('billed_lease_invalid');
      if (/[1-9]/.test(lease.rent_amount)) billed.add(lease.lease_id);
    }
  }
  const sourceLeases = new Set(), invoiceIds = new Set();
  for (const source of continuation.original_invoice_sources) {
    if (!exact(source, ['lease_id', 'invoice_id', 'row_sha256']) || !isUuid(source.lease_id) || !isUuid(source.invoice_id) ||
      !isDigest(source.row_sha256) || !billed.has(source.lease_id) || sourceLeases.has(source.lease_id) || invoiceIds.has(source.invoice_id)) fail('original_invoice_scope_invalid');
    sourceLeases.add(source.lease_id); invoiceIds.add(source.invoice_id);
  }
  if (!billed.size || billed.size !== sourceLeases.size) fail('original_invoice_scope_incomplete');
}

export const NO_BACKUP_HOSTED_BINDING_FIELDS = Object.freeze(['version', 'recovery_policy', 'operation_id', 'project_ref', 'organization_id',
  'packet_sha256', 'main_sha', 'sources_sha256', 'schema_sha256', 'ledger_sha256', 'source_snapshot_sha256', 'foreign_snapshot_sha256',
  'source_generation', 'target_generation', 'cutoff', 'issue_date', 'timezone', 'execution_business_date', 'invoice_date_policy',
  'manifest_sha256', 'plan_sha256', 'archive_sha256', 'action_sha256', 'archive_artifact_sha256', 'archive_count', 'action_count',
  'zero_review_sha256', 'continuation_semantic_sha256', 'report_review_sha256', 'continuation_semantic']);

// This binds a proposed protocol value, never an authorization or SQL command.
// DB-canonical bytes are kept distinct from JavaScript's canonical JSON digest.
export function hostedNoBackupBinding(packet, continuation, postgresSemanticText) {
  assertNoBackupPacket(packet);
  validateContinuation(packet, continuation, postgresSemanticText);
  const o = packet.operation, b = packet.databaseBinding;
  return { version: 2, recovery_policy: NO_BACKUP_POLICY, operation_id: o.operationId, project_ref: o.projectRef, organization_id: o.organizationId,
    packet_sha256: packet.packetSha256, main_sha: o.mainSha, sources_sha256: packet.sourcesSha256, schema_sha256: packet.schemaSha256,
    ledger_sha256: packet.ledgerSha256, source_snapshot_sha256: packet.sourceSnapshotSha256, foreign_snapshot_sha256: packet.foreignSnapshotSha256,
    source_generation: o.sourceGeneration, target_generation: o.targetGeneration, cutoff: o.cutoff, issue_date: o.issueDate, timezone: o.timezone,
    execution_business_date: o.executionBusinessDate, invoice_date_policy: o.invoiceDatePolicy, manifest_sha256: b.manifestSha256,
    plan_sha256: b.planSha256, archive_sha256: b.archiveSha256, action_sha256: b.actionSha256, archive_artifact_sha256: null,
    archive_count: packet.archiveRows, action_count: packet.actionCount, zero_review_sha256: b.zeroReviewSha256,
    continuation_semantic_sha256: b.continuationSemanticSha256, report_review_sha256: b.reportReviewSha256,
    continuation_semantic: structuredClone(continuation) };
}

export function assertNoBackupHostedBinding(packet, binding, postgresSemanticText) {
  if (!exact(binding, NO_BACKUP_HOSTED_BINDING_FIELDS) || !same(binding, hostedNoBackupBinding(packet, binding.continuation_semantic, postgresSemanticText))) fail('hosted_binding_invalid');
  return binding;
}
