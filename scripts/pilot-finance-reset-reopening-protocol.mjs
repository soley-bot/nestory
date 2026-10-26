// Fixed read-only proof preparation and SQL construction. No connection, token,
// hosted dispatch, provider selection, key creation or automatic retry.
import { assertOperatorPacket, canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { createBoundArtifactReader, artifactSlot } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { createJsonJournal, inspectLocalStoreMechanism } from './pilot-finance-reset-durable-store.mjs';
import { exactKeys, same } from './pilot-finance-reset-hosted-protocol.mjs';
import { hostedBinding, digestJson, digestDatabaseJson, jsonSql, literal, timestampMicros } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { assertNoBackupPacket, assertNoBackupHostedBinding, NO_BACKUP_POLICY } from './pilot-finance-reset-no-backup-core.mjs';

const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const roles = ['archive', 'containmentProof', 'liveConsent', 'restoreProof', 'storageProof'];
const preparedReviews = new WeakMap();
const copy = value => JSON.parse(canonicalJson(value));
const fail = code => { const error = new Error(`reset_reopening_${code}`); error.requiresReconciliation = true; throw error; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const requestFields = ['version', 'request_id', 'operation_id', 'generation', 'cutoff', 'checkpoint_sha256', 'after_sha256',
  'foreign_sha256', 'evidence_sha256', 'review_sha256', 'execution_business_date'];
const reviewFields = ['format', 'requestId', 'operationId', 'originalOperationId', 'organizationId', 'packetSha256',
  'checkpointSha256', 'afterSha256', 'foreignSha256', 'generation', 'cutoff', 'executionBusinessDate'];

const noBackup = packet => packet?.format === 'nestory-protected-reset-no-backup-preparation-v1';
function baseBinding(packet, value, postgresSemanticText) {
  if (noBackup(packet)) {
    assertNoBackupHostedBinding(packet, value, postgresSemanticText);
    return { operationId: value.operation_id, generation: value.target_generation, action: 'execute' };
  }
  assertOperatorPacket(packet);
  const base = copy(value); delete base.recovery;
  if (!same(base, hostedBinding(packet, value.continuation_semantic))) fail('original_binding_changed');
  if (Object.hasOwn(value, 'recovery')) {
    const r = value.recovery;
    if (!exactKeys(r, ['operation_id', 'source_generation', 'target_generation', 'plan_sha256', 'action_sha256', 'action_count',
      'report_checkpoint_sha256', 'phase_binding_sha256', 'review_artifact_sha256', 'execution_business_date'])
      || !uuid.test(r.operation_id) || r.operation_id === value.operation_id || r.source_generation !== value.target_generation
      || r.target_generation !== r.source_generation + 1 || !Number.isSafeInteger(r.action_count) || r.action_count < 1
      || !['plan_sha256', 'action_sha256', 'report_checkpoint_sha256', 'phase_binding_sha256', 'review_artifact_sha256'].every(key => digest.test(r[key]))) fail('inverse_binding_invalid');
  }
  return { operationId: value.recovery?.operation_id ?? value.operation_id,
    generation: value.recovery?.target_generation ?? value.target_generation,
    action: value.recovery ? 'execute-recovery' : 'execute' };
}
function checkBinding(packet, binding, postgresSemanticText) {
  const base = copy(binding); delete base.reopening;
  const target = baseBinding(packet, base, postgresSemanticText), r = binding.reopening;
  if (!exactKeys(r, requestFields) || r.version !== 1 || !uuid.test(r.request_id) || r.operation_id !== target.operationId
    || r.generation !== target.generation || r.cutoff !== base.cutoff
    || !['checkpoint_sha256', 'after_sha256', 'foreign_sha256', 'evidence_sha256', 'review_sha256'].every(key => digest.test(r[key]))
    || timestampMicros(`${r.execution_business_date}T00:00:00Z`) === null
    || noBackup(packet) && r.foreign_sha256 !== packet.foreignSnapshotSha256) fail('binding_invalid');
  return target;
}
export function assertReopeningHostedBinding(packet, binding, postgresSemanticText) {
  checkBinding(packet, binding, postgresSemanticText);
  return binding;
}
const sameTransaction = (left, right) => Boolean(left && right && Number.isSafeInteger(left.backendPid)
  && left.backendPid > 0 && left.backendPid === right.backendPid && /^[1-9][0-9]*$/.test(left.transactionId)
  && left.transactionId === right.transactionId);

// The observation is the existing fixed transport read for execute or inverse.
// The SQL reopening function independently rechecks these facts under locks.
export function validateReopeningObservation(packet, binding, observation, postgresSemanticText) {
  const target = baseBinding(packet, binding, postgresSemanticText), o = observation, c = o?.checkpoint;
  const rootBinding = copy(binding); delete rootBinding.recovery;
  if (!o || o.control?.status !== 'frozen' || o.control.generation !== target.generation || o.control.cutoff !== binding.cutoff
    || o.timezone !== binding.timezone || timestampMicros(`${o.businessDate}T00:00:00Z`) === null
    || o.operation?.operation_id !== target.operationId || o.operation.organization_id !== binding.organization_id
    || o.operation.status !== 'actions_complete' || o.operation.target_generation !== target.generation
    || o.operation.operation_kind !== (binding.recovery ? 'restore' : 'reset')
    || o.operation.restore_of !== (binding.recovery ? binding.operation_id : null)
    || o.appliedCount !== o.operation.action_count || o.actionCount !== o.operation.action_count || o.capabilityCount !== 0
    || !o.reservation || !same(o.reservation.binding, rootBinding) || o.reservation.foreignSha256 !== o.foreignSha256
    || !digest.test(o.foreignSha256) || !o.recoveryCheckpoint || o.recoveryCheckpoint.bindingSha256 !== o.reservation.bindingSha256
    || o.recoveryCheckpoint.sourceSha256 !== packet.sourceSnapshotSha256 || o.recoveryCheckpoint.foreignSha256 !== o.foreignSha256
    || !c || c.kind !== (binding.recovery ? 'phase-recovery' : 'checked-reports') || c.generation !== target.generation
    || !digest.test(c.sha256) || c.hashValid !== true || c.currentImagesMatch !== true || !digest.test(c.result?.after_sha256)
    || c.result.control_reopened !== false || !sameTransaction(c, { backendPid: o.operation.execution_backend, transactionId: o.operation.execution_xid })
    || o.authorization?.status !== 'consumed' || o.authorization.bindingMatches !== true || !sameTransaction(c, o.authorization)
    || noBackup(packet) && o.foreignSha256 !== packet.foreignSnapshotSha256) fail('committed_checkpoint_required');
  if (binding.recovery) {
    if (!o.recoveryReservation || !same(o.recoveryReservation.binding, binding) || c.result.report_checkpoint_sha256 !== binding.recovery.report_checkpoint_sha256) fail('inverse_checkpoint_required');
  } else if (o.zero?.status !== 'complete' || o.zero.reviewSha256 !== binding.zero_review_sha256
    || o.continuation?.status !== 'complete' || !same(o.continuation.semantic, binding.continuation_semantic)
    || !Array.isArray(o.phaseFences) || !same(o.phaseFences.map(fence => fence.phase).sort(), ['continuation', 'known-zero', 'reports'])
    || !o.phaseFences.every(fence => sameTransaction(fence, c))
    || c.result.report_review_sha256 !== binding.report_review_sha256 || c.result.continuation_semantic_sha256 !== binding.continuation_semantic_sha256
    || c.result.reports_persisted !== true || c.result.close_published !== false) fail('checked_reports_required');
  // billing_complete=false is allowed only as part of the exact checked report;
  // reviewed deferred leases do not become a reason to fabricate readiness.
  return freeze({ operationId: target.operationId, generation: target.generation, checkpointSha256: c.sha256,
    afterSha256: c.result.after_sha256, foreignSha256: o.foreignSha256, businessDate: o.businessDate });
}

export function assertReopeningDispatchImplemented() { fail('integration_incomplete'); }

export function createReopeningPreparation(options) {
  if (!exactKeys(options, ['packet', 'provider', 'descriptors', 'journalStore', 'verifyRecoveryAuthority', 'verifyReopeningAuthority'])
    || typeof options.verifyReopeningAuthority !== 'function') fail('provider_configuration_invalid');
  const packet = copy(options.packet), descriptors = copy(options.descriptors);
  const provider = options.provider, verifyReopeningAuthority = options.verifyReopeningAuthority;
  assertOperatorPacket(packet);
  // Caller-shaped provider or journal objects do not acquire provenance. Both
  // mechanisms must come from the existing fixed provider implementation.
  let mechanism;
  try { mechanism = inspectLocalStoreMechanism(options.journalStore); } catch { fail('unrecognized_journal_provider'); }
  if (mechanism.kind !== 'exclusive-file-and-directory-fsync') fail('synthetic_journal_not_hosted');
  const reader = createBoundArtifactReader({ provider, packet, descriptors,
    verifyRecoveryAuthority: options.verifyRecoveryAuthority });
  const journal = createJsonJournal({ store: options.journalStore });
  async function artifactReceipts() {
    const receipts = {};
    for (const role of roles) {
      const bytes = await reader.read(role);
      try {
        if (!(bytes instanceof Uint8Array) || !bytes.length) fail('artifact_unavailable');
        const observed = await provider.reconcile({ slot: artifactSlot(descriptors[role].binding), descriptor: copy(descriptors[role]) });
        if (observed.receipt !== 'present' || !digest.test(observed.receiptSha256)
          || !same(observed.descriptor, descriptors[role])) fail('artifact_receipt_missing');
        receipts[role] = { artifact_sha256: descriptors[role].ciphertextSha256, receipt_sha256: observed.receiptSha256 };
      } finally { if (bytes instanceof Uint8Array) bytes.fill(0); }
    }
    return receipts;
  }
  return Object.freeze({
    async prepare(request) {
      if (!exactKeys(request, ['binding', 'observation'])) fail('request_invalid');
      const binding = copy(request.binding), observation = copy(request.observation);
      const target = baseBinding(packet, binding), proof = validateReopeningObservation(packet, binding, observation);
      const slot = `financial-reset/${packet.operation.operationId}/reopening/${target.operationId}`;
      if (await journal.read(`${slot}/intent`) !== null || await journal.read(`${slot}/receipt`) !== null) fail('existing_attempt_reconcile_required');
      const reviewText = await journal.read(`${slot}/review`);
      if (reviewText === null) fail('durable_review_missing');
      const review = JSON.parse(reviewText);
      if (!exactKeys(review, reviewFields) || review.format !== 'nestory-reset-reopening-review-v1' || !uuid.test(review.requestId)
        || review.operationId !== target.operationId || review.originalOperationId !== packet.operation.operationId
        || review.organizationId !== packet.operation.organizationId || review.packetSha256 !== packet.packetSha256
        || review.checkpointSha256 !== proof.checkpointSha256 || review.afterSha256 !== proof.afterSha256
        || review.foreignSha256 !== proof.foreignSha256 || review.generation !== proof.generation || review.cutoff !== binding.cutoff
        || review.executionBusinessDate !== proof.businessDate) fail('review_changed');
      const completionSlot = `financial-reset/${packet.operation.operationId}/hosted-action/${target.action}`;
      const intentText = await journal.read(`${completionSlot}/intent`), reconciliationText = await journal.read(`${completionSlot}/receipt`);
      if (intentText === null || reconciliationText === null) fail('completion_journal_missing');
      const intent = JSON.parse(intentText), reconciliation = JSON.parse(reconciliationText);
      if (intent.format !== 'nestory-hosted-reset-action-intent-v1' || intent.operationId !== packet.operation.operationId
        || intent.packetSha256 !== packet.packetSha256 || intent.action !== target.action || intent.bindingSha256 !== digestJson(binding)
        || intent.authorizationId !== observation.authorization.authorizationId || !digest.test(intent.authoritySha256)
        || reconciliation.format !== 'nestory-hosted-reset-action-reconciliation-v1' || reconciliation.operationId !== packet.operation.operationId
        || reconciliation.packetSha256 !== packet.packetSha256 || reconciliation.action !== target.action
        || reconciliation.outcome !== 'committed-and-verified' || reconciliation.mutationRetried !== false
        || reconciliation.normalWritesReopened !== false || reconciliation.checkpointSha256 !== proof.checkpointSha256
        || reconciliation.authoritySha256 !== intent.authoritySha256 || !digest.test(reconciliation.observationSha256)) fail('completion_journal_unproven');
      const recoveryAuthority = await reader.inspectRecoveryCheckpoint();
      const receipts = await artifactReceipts();
      let authority;
      const authorityInput = { packet, binding, proof, review,
        recoveryAuthority, artifactReceipts: receipts, journalMechanism: mechanism,
        completionIntent: intent, completionReconciliation: reconciliation };
      try { authority = await verifyReopeningAuthority(freeze(copy(authorityInput))); }
      catch { fail('reopening_authority_unavailable'); }
      if (!authority || typeof authority !== 'object' || Array.isArray(authority) || !Object.keys(authority).length) fail('reopening_authority_receipt_missing');
      const reviewSha256 = hashBytes(reviewText);
      const evidence = { format: 'nestory-reset-reopening-evidence-v1', operation_id: target.operationId,
        organization_id: binding.organization_id, packet_sha256: packet.packetSha256, checkpoint_sha256: proof.checkpointSha256,
        after_sha256: proof.afterSha256, review_sha256: reviewSha256, artifact_receipts: receipts,
        authority_receipt: { recovery: copy(recoveryAuthority), reopening: copy(authority) },
        completion_intent_sha256: hashBytes(intentText), completion_reconciliation_sha256: hashBytes(reconciliationText) };
      const evidenceText = canonicalJson(evidence);
      const reopening = { version: 1, request_id: review.requestId, operation_id: target.operationId, generation: target.generation,
        cutoff: binding.cutoff, checkpoint_sha256: proof.checkpointSha256, after_sha256: proof.afterSha256,
        foreign_sha256: proof.foreignSha256, evidence_sha256: hashBytes(evidenceText), review_sha256: reviewSha256,
        execution_business_date: proof.businessDate };
      const prepared = freeze({ binding: { ...binding, reopening }, evidenceText, slot, observationSha256: digestJson(observation) });
      // Do not let caller mutation or serialization manufacture a provider proof.
      preparedReviews.set(prepared, { packet, journal, journalStore: options.journalStore, intentText, reconciliationText, reviewText,
        async refresh() {
          if (await journal.read(`${completionSlot}/intent`) !== intentText || await journal.read(`${completionSlot}/receipt`) !== reconciliationText) fail('completion_journal_changed');
          if (!same(await reader.inspectRecoveryCheckpoint(), recoveryAuthority) || !same(await artifactReceipts(), receipts)) fail('recovery_authority_changed');
          let current;
          try { current = await verifyReopeningAuthority(freeze(copy(authorityInput))); } catch { fail('reopening_authority_unavailable'); }
          if (!same(current, authority)) fail('reopening_authority_changed');
        } });
      return prepared;
    },
  });
}

const auditFields = ['archive_count', 'archive_sha256', 'action_count', 'action_sha256', 'prepare_receipt_sha256',
  'seal_receipt_sha256', 'completion_authorization_id', 'completion_backend_pid', 'completion_transaction_id'];
const authorityFields = ['format', 'recoveryPolicy', 'operationId', 'organizationId', 'packetSha256', 'bindingSha256',
  'checkpointSha256', 'afterSha256', 'foreignSha256', 'reviewSha256', 'databaseAudit', 'evidenceReferences',
  'actorId', 'sessionId', 'executionBusinessDate', 'observedAt', 'expiresAt'];

// A fixed read-only database query supplies these audit facts. The checked SQL
// independently recomputes them; neither this result nor a preparation packet is
// authorization. No archive is exported by this query.
const noBackupAuditSql = `SELECT jsonb_build_object(
 'operationId',$1::uuid,'organizationId',($2::jsonb->>'organization_id')::uuid,
 'bindingSha256',app_private.financial_reset_hash($2::jsonb),'checkpointSha256',c.checkpoint_sha256,
 'databaseAudit',jsonb_build_object(
  'archive_count',(SELECT count(*) FROM app_private.financial_reset_archive_rows WHERE operation_id=$1::uuid),
  'archive_sha256',app_private.financial_reset_archive_digest($1::uuid),
  'action_count',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=$1::uuid),
  'action_sha256',app_private.financial_reset_action_digest($1::uuid),
  'prepare_receipt_sha256',(SELECT result_sha256 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=$1::uuid AND action='prepare'),
  'seal_receipt_sha256',(SELECT result_sha256 FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id=$1::uuid AND action='seal'),
  'completion_authorization_id',a.authorization_id,'completion_backend_pid',a.backend_pid,'completion_transaction_id',a.transaction_id::text),
 'archiveRowsValid',NOT EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows r WHERE r.operation_id=$1::uuid
  AND (r.organization_id IS DISTINCT FROM ($2::jsonb->>'organization_id')::uuid OR r.row_sha256 IS DISTINCT FROM app_private.financial_reset_hash(r.row_json))),
 'stageReceiptsValid',(SELECT count(*)=2 FROM app_private.financial_reset_hosted_action_receipts s WHERE s.operation_id=$1::uuid
  AND s.organization_id=($2::jsonb->>'organization_id')::uuid AND s.action IN ('prepare','seal') AND s.binding=$2::jsonb
  AND s.binding_sha256=app_private.financial_reset_hash($2::jsonb) AND s.result_sha256=app_private.financial_reset_hash(s.result_json)),
 'completionAuthorization',jsonb_build_object('authorizationId',a.authorization_id,'actorId',a.actor_id,'sessionId',a.session_id,
  'backendPid',a.backend_pid,'transactionId',a.transaction_id::text,
  'hashValid',a.binding_sha256=app_private.financial_reset_hash(a.binding) AND a.consumed_at IS NOT NULL)) AS financial_reset_no_backup_reopening_audit
 FROM app_private.financial_reset_verification_checkpoints c
 JOIN app_private.financial_reset_actor_authorizations a ON a.authorization_id=$3::uuid AND a.operation_id=c.operation_id
  AND a.action='execute' AND a.binding=$2::jsonb AND a.backend_pid=c.execution_backend AND a.transaction_id=c.execution_xid
 WHERE c.operation_id=$1::uuid AND c.checkpoint_kind='checked-reports'`;

export function noBackupReopeningAuditQuery({ packet, binding, postgresSemanticText, authorizationId }) {
  assertNoBackupHostedBinding(packet, binding, postgresSemanticText);
  if (!uuid.test(authorizationId)) fail('authorization_locator_invalid');
  return freeze({ name: 'financial-reset-no-backup-reopening-audit-v1', projectRef: packet.operation.projectRef,
    packetSha256: packet.packetSha256, transaction: { isolation: 'repeatable read', readOnly: true }, text: noBackupAuditSql,
    values: [binding.operation_id, copy(binding), authorizationId] });
}

export function validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText, observation, audit }) {
  assertNoBackupHostedBinding(packet, binding, postgresSemanticText);
  const proof = validateReopeningObservation(packet, binding, observation, postgresSemanticText), a = audit?.databaseAudit;
  const actor = audit?.completionAuthorization;
  if (!exactKeys(audit, ['operationId', 'organizationId', 'bindingSha256', 'checkpointSha256', 'databaseAudit',
    'archiveRowsValid', 'stageReceiptsValid', 'completionAuthorization']) || audit.operationId !== binding.operation_id
    || audit.organizationId !== binding.organization_id || !digest.test(audit.bindingSha256)
    || audit.bindingSha256 !== observation.reservation.bindingSha256 || audit.checkpointSha256 !== proof.checkpointSha256
    || audit.archiveRowsValid !== true || audit.stageReceiptsValid !== true || !exactKeys(a, auditFields)
    || a.archive_count !== binding.archive_count || a.archive_sha256 !== binding.archive_sha256
    || a.action_count !== binding.action_count || a.action_sha256 !== binding.action_sha256
    || !digest.test(a.prepare_receipt_sha256) || !digest.test(a.seal_receipt_sha256)
    || a.completion_authorization_id !== observation.authorization.authorizationId
    || !sameTransaction({ backendPid: a.completion_backend_pid, transactionId: a.completion_transaction_id }, observation.checkpoint)
    || !exactKeys(actor, ['authorizationId', 'actorId', 'sessionId', 'backendPid', 'transactionId', 'hashValid'])
    || actor.authorizationId !== a.completion_authorization_id || actor.actorId !== binding.continuation_semantic.actor_id
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(actor.sessionId)
    || actor.hashValid !== true || !sameTransaction(actor, observation.checkpoint)) fail('no_backup_database_audit_required');
  return proof;
}

// This checks the closed result contract for the trusted runtime verifier. It
// never turns reference bytes into consent, containment or actor provenance.
// A fixed protected implementation of that verifier is still an integration
// prerequisite; the unconditional dispatch hold remains in force.
export function validateNoBackupReopeningAuthority({ packet, binding, proof, reviewSha256, audit, receipt }) {
  assertNoBackupPacket(packet);
  const observed = timestampMicros(receipt?.observedAt), expires = timestampMicros(receipt?.expiresAt), now = BigInt(Date.now()) * 1000n;
  if (packet.evidenceBlockers.length || !exactKeys(receipt, authorityFields)
    || receipt.format !== 'nestory-no-backup-reopening-authority-v1' || receipt.recoveryPolicy !== NO_BACKUP_POLICY
    || receipt.operationId !== binding.operation_id || receipt.organizationId !== binding.organization_id
    || receipt.packetSha256 !== packet.packetSha256 || receipt.bindingSha256 !== audit.bindingSha256
    || receipt.checkpointSha256 !== proof.checkpointSha256 || receipt.afterSha256 !== proof.afterSha256
    || receipt.foreignSha256 !== proof.foreignSha256 || receipt.reviewSha256 !== reviewSha256
    || receipt.executionBusinessDate !== proof.businessDate
    || !same(receipt.databaseAudit, audit.databaseAudit) || !same(receipt.evidenceReferences, packet.evidenceReferences)
    || receipt.actorId !== binding.continuation_semantic.actor_id
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(receipt.sessionId)
    || observed === null || expires === null || observed > now || now - observed > 30000000n || expires <= now
    || expires - observed > 300000000n) fail('no_backup_current_authority_required');
  return freeze(copy(receipt));
}

const completionActions = ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'];
const completionIntentFields = ['format', 'operationId', 'packetSha256', 'action', 'bindingSha256', 'authorizationId',
  'authoritySha256', 'deletionScopeSha256', 'liveConsentSha256', 'waiverSha256', 'sourceObservationSha256', 'previousIntentSha256', 'sqlSha256'];
const completionReceiptFields = ['format', 'operationId', 'packetSha256', 'action', 'outcome', 'observationProvenanceVerified',
  'mutationAllowed', 'mutationRetried', 'normalWritesReopened', 'originalIntentSha256', 'observationSha256', 'authoritySha256',
  'actionReceiptSha256', 'checkpointSha256', 'runtimeGates'];
const completionRuntimeGates = ['fixed_no_backup_reader_and_runtime_provenance_not_integrated',
  'independent_final_consent_and_current_authority_verification_required',
  'durable_original_attempt_custody_not_integrated', 'protected_live_dispatch_held'];
const completionSlot = (binding, action) => `financial-reset/${binding.operation_id}/hosted-action/${action}`;

// Native forward records are evidence claims, never provider or human authority.
// Keep the original bytes and their complete immediate-predecessor chain. The
// independently protected verifier still receives and must verify that history.
export function validateNoBackupCompletionHistory(request) {
  if (!exactKeys(request, ['packet', 'binding', 'postgresSemanticText', 'observation', 'audit', 'history'])) fail('completion_history_invalid');
  const { packet, binding, postgresSemanticText, observation, audit, history } = request;
  const proof = validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText, observation, audit });
  if (!Array.isArray(history) || history.length !== completionActions.length) fail('completion_history_missing');
  const scopeSha256 = digestJson({ format: 'nestory-no-backup-deletion-scope-v1', recoveryPolicy: packet.recoveryPolicy,
    operation: packet.operation, sourcesSha256: packet.sourcesSha256, schemaSha256: packet.schemaSha256, ledgerSha256: packet.ledgerSha256,
    sourceSnapshotSha256: packet.sourceSnapshotSha256, foreignSnapshotSha256: packet.foreignSnapshotSha256,
    databaseBinding: packet.databaseBinding, archiveRows: packet.archiveRows, actionCount: packet.actionCount });
  const entries = [], authorizations = new Set();
  for (let index = 0; index < completionActions.length; index++) {
    const action = completionActions[index], entry = history[index];
    if (!exactKeys(entry, ['action', 'intentText', 'reconciliationText']) || entry.action !== action ||
      typeof entry.intentText !== 'string' || typeof entry.reconciliationText !== 'string') fail('completion_history_invalid');
    let intent, reconciliation;
    try {
      intent = JSON.parse(entry.intentText); reconciliation = JSON.parse(entry.reconciliationText);
      if (canonicalJson(intent) !== entry.intentText || canonicalJson(reconciliation) !== entry.reconciliationText) throw Error();
    } catch { fail('completion_journal_unproven'); }
    if (!exactKeys(intent, completionIntentFields) || intent.format !== 'nestory-no-backup-action-intent-v1' ||
      intent.operationId !== binding.operation_id || intent.packetSha256 !== packet.packetSha256 || intent.action !== action ||
      intent.bindingSha256 !== digestJson(binding) || !uuid.test(intent.authorizationId) || authorizations.has(intent.authorizationId) ||
      !['authoritySha256', 'sourceObservationSha256', 'sqlSha256'].every(key => digest.test(intent[key])) ||
      intent.deletionScopeSha256 !== scopeSha256 || intent.waiverSha256 !== packet.evidenceReferences.waiver?.sha256 ||
      intent.liveConsentSha256 !== packet.evidenceReferences.liveConsent?.sha256 ||
      intent.previousIntentSha256 !== (index === 0 ? null : digestJson(entries[index - 1].intent))) fail('completion_journal_unproven');
    authorizations.add(intent.authorizationId);
    const stageSha256 = action === 'prepare' ? audit.databaseAudit.prepare_receipt_sha256
      : action === 'seal' ? audit.databaseAudit.seal_receipt_sha256 : null;
    if (!exactKeys(reconciliation, completionReceiptFields) || reconciliation.format !== 'nestory-no-backup-action-reconciliation-v1' ||
      reconciliation.operationId !== binding.operation_id || reconciliation.packetSha256 !== packet.packetSha256 || reconciliation.action !== action ||
      reconciliation.outcome !== 'committed-evidence-matches' || reconciliation.observationProvenanceVerified !== false ||
      reconciliation.mutationAllowed !== false || reconciliation.mutationRetried !== false || reconciliation.normalWritesReopened !== false ||
      reconciliation.originalIntentSha256 !== digestJson(intent) || reconciliation.authoritySha256 !== intent.authoritySha256 ||
      !digest.test(reconciliation.observationSha256) || reconciliation.actionReceiptSha256 !== stageSha256 ||
      reconciliation.checkpointSha256 !== (action === 'execute' ? proof.checkpointSha256 : null) ||
      !same(reconciliation.runtimeGates, completionRuntimeGates) ||
      action === 'execute' && intent.authorizationId !== audit.databaseAudit.completion_authorization_id) fail('completion_journal_unproven');
    entries.push({ ...entry, intent, reconciliation });
  }
  const completion = entries.at(-1);
  return freeze({ format: 'nestory-no-backup-completion-history-v1', history: entries,
    completionIntent: completion.intent, completionReconciliation: completion.reconciliation,
    authorityProvenanceVerified: false });
}

export function createNoBackupReopeningPreparation(options) {
  if (!exactKeys(options, ['packet', 'postgresSemanticText', 'journalStore', 'verifyReopeningAuthority'])
    || typeof options.verifyReopeningAuthority !== 'function') fail('provider_configuration_invalid');
  const packet = copy(options.packet), postgresSemanticText = typeof options.postgresSemanticText === 'string'
    ? options.postgresSemanticText : Buffer.from(options.postgresSemanticText ?? []);
  const verifyReopeningAuthority = options.verifyReopeningAuthority;
  assertNoBackupPacket(packet);
  if (packet.evidenceBlockers.length) fail('no_backup_evidence_missing');
  let mechanism;
  try { mechanism = inspectLocalStoreMechanism(options.journalStore); } catch { fail('unrecognized_journal_provider'); }
  if (mechanism.kind !== 'exclusive-file-and-directory-fsync') fail('synthetic_journal_not_hosted');
  const journal = createJsonJournal({ store: options.journalStore });
  return Object.freeze({
    async prepare(request) {
      if (!exactKeys(request, ['binding', 'observation', 'audit'])) fail('request_invalid');
      const { binding, observation, audit } = structuredClone(request);
      const proof = validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText, observation, audit });
      const slot = `financial-reset/${binding.operation_id}/reopening/${binding.operation_id}`;
      if (await journal.read(`${slot}/intent`) !== null || await journal.read(`${slot}/receipt`) !== null) fail('existing_attempt_reconcile_required');
      const reviewText = await journal.read(`${slot}/review`);
      if (reviewText === null) fail('durable_review_missing');
      const review = JSON.parse(reviewText), reviewSha256 = hashBytes(reviewText);
      if (!exactKeys(review, [...reviewFields, 'recoveryPolicy']) || review.format !== 'nestory-no-backup-reset-reopening-review-v1'
        || review.recoveryPolicy !== NO_BACKUP_POLICY || !uuid.test(review.requestId) || review.operationId !== binding.operation_id
        || review.originalOperationId !== binding.operation_id || review.organizationId !== binding.organization_id
        || review.packetSha256 !== packet.packetSha256 || review.checkpointSha256 !== proof.checkpointSha256
        || review.afterSha256 !== proof.afterSha256 || review.foreignSha256 !== proof.foreignSha256
        || review.generation !== proof.generation || review.cutoff !== binding.cutoff || review.executionBusinessDate !== proof.businessDate) fail('review_changed');
      const history = [];
      for (const action of completionActions) {
        const prefix = completionSlot(binding, action), intentText = await journal.read(`${prefix}/intent`),
          reconciliationText = await journal.read(`${prefix}/receipt`);
        if (intentText === null || reconciliationText === null) fail('completion_journal_missing');
        history.push({ action, intentText, reconciliationText });
      }
      const completion = validateNoBackupCompletionHistory({ packet, binding, postgresSemanticText, observation, audit, history });
      const { completionIntent: intent, completionReconciliation: reconciliation } = completion;
      const { intentText, reconciliationText } = history.at(-1);
      const authorityInput = freeze(copy({ packet, binding, proof, review, databaseAudit: audit, journalMechanism: mechanism,
        completionIntent: intent, completionReconciliation: reconciliation,
        completionHistory: completion.history, completionHistoryProvenanceVerified: false }));
      async function currentAuthority() {
        let receipt;
        try { receipt = await verifyReopeningAuthority(authorityInput); } catch { fail('reopening_authority_unavailable'); }
        return validateNoBackupReopeningAuthority({ packet, binding, proof, reviewSha256, audit, receipt });
      }
      const authority = await currentAuthority();
      const evidence = { format: 'nestory-reset-reopening-evidence-v2', recovery_policy: NO_BACKUP_POLICY,
        operation_id: binding.operation_id, organization_id: binding.organization_id, packet_sha256: packet.packetSha256,
        checkpoint_sha256: proof.checkpointSha256, after_sha256: proof.afterSha256, review_sha256: reviewSha256,
        database_audit: audit.databaseAudit, evidence_references: packet.evidenceReferences, authority_receipt: authority,
        completion_intent_sha256: hashBytes(intentText), completion_reconciliation_sha256: hashBytes(reconciliationText) };
      const evidenceText = canonicalJson(evidence), reopening = { version: 1, request_id: review.requestId, operation_id: binding.operation_id,
        generation: binding.target_generation, cutoff: binding.cutoff, checkpoint_sha256: proof.checkpointSha256,
        after_sha256: proof.afterSha256, foreign_sha256: proof.foreignSha256, evidence_sha256: hashBytes(evidenceText),
        review_sha256: reviewSha256, execution_business_date: proof.businessDate };
      const prepared = freeze({ binding: { ...binding, reopening }, evidenceText, slot, observationSha256: digestDatabaseJson(observation) });
      preparedReviews.set(prepared, { packet, postgresSemanticText, journal, journalStore: options.journalStore, reviewText,
        async refresh() {
          for (const entry of history) {
            const prefix = completionSlot(binding, entry.action);
            if (await journal.read(`${prefix}/intent`) !== entry.intentText ||
              await journal.read(`${prefix}/receipt`) !== entry.reconciliationText) fail('completion_journal_changed');
          }
          const current = copy(await currentAuthority()), original = copy(authority);
          delete current.observedAt; delete original.observedAt;
          if (!same(current, original)) fail('reopening_authority_changed');
        } });
      return prepared;
    },
  });
}

// Check capability identity before an authorization request or journal write.
// A serialized preparation, a different store handle, or another operation's
// otherwise valid preparation cannot acquire the current runtime's custody.
// Fresh authority and journal checks still run in reopeningMutationSql.
export function assertPreparedReopening(prepared, expected) {
  const provenance = preparedReviews.get(prepared);
  if (!provenance) fail('verified_provider_preparation_required');
  if (!exactKeys(expected, ['packet', 'binding', 'postgresSemanticText', 'journalStore'])
    || !same(provenance.packet, expected.packet) || provenance.journalStore !== expected.journalStore
    || provenance.postgresSemanticText !== expected.postgresSemanticText) fail('preparation_context_changed');
  const base = copy(prepared.binding); delete base.reopening;
  if (!same(base, expected.binding)) fail('preparation_context_changed');
  checkBinding(provenance.packet, prepared.binding, provenance.postgresSemanticText);
  return prepared;
}

export async function reopeningMutationSql(prepared, authorizationId) {
  const provenance = preparedReviews.get(prepared);
  if (!provenance || !uuid.test(authorizationId)) fail('verified_provider_preparation_required');
  checkBinding(provenance.packet, prepared.binding, provenance.postgresSemanticText);
  if (await provenance.journal.read(`${prepared.slot}/intent`) !== null || await provenance.journal.read(`${prepared.slot}/receipt`) !== null
    || await provenance.journal.read(`${prepared.slot}/review`) !== provenance.reviewText) fail('existing_attempt_or_review_changed');
  await provenance.refresh();
  return ['BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;',
    "SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='5s'; SET LOCAL timezone='UTC';",
    `SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||${literal(prepared.binding.organization_id)},0));`,
    `SELECT app_private.consume_financial_reset_actor_authorization(${literal(authorizationId)}::uuid,${jsonSql(prepared.binding)},'reopen');`,
    `SELECT app_private.reopen_financial_reset_checked(${jsonSql(prepared.binding)},${literal(prepared.evidenceText)});`, 'COMMIT;'].join('\n');
}

const receiptSql = `SELECT jsonb_build_object(
 'receipt',(SELECT jsonb_build_object('operationId',r.operation_id,'binding',r.binding,'bindingSha256',r.binding_sha256,
  'evidenceSha256',r.evidence_sha256,'checkpointSha256',r.checkpoint_sha256,'afterSha256',r.after_sha256,'authorizationId',r.authorization_id,
  'actorId',r.actor_id,'sessionId',r.session_id,'backendPid',r.backend_pid,'transactionId',r.transaction_id::text,
  'result',r.result_json,'sha256',r.result_sha256,'hashValid',r.result_sha256=app_private.financial_reset_hash(r.result_json)
   AND r.binding_sha256=app_private.financial_reset_hash(r.binding) AND r.evidence_sha256=encode(extensions.digest(r.evidence_text,'sha256'),'hex'))
  FROM app_private.financial_reset_reopening_receipts r WHERE r.operation_id=$1::uuid),
 'control',(SELECT jsonb_build_object('status',status,'generation',generation,'cutoff',financial_start_date)
  FROM app_private.financial_write_controls WHERE organization_id=($2::jsonb->>'organization_id')::uuid),
 'authorization',app_private.financial_reset_hosted_actor_authorization_status($3::uuid,$2::jsonb,'reopen'),
 'authorizationSessionId',(SELECT session_id FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=$3::uuid)) AS financial_reset_reopening_observation`;

export function reopeningObservationQuery({ packet, binding, authorizationId, postgresSemanticText }) {
  const target = checkBinding(packet, binding, postgresSemanticText);
  if (!uuid.test(authorizationId)) fail('authorization_locator_invalid');
  return freeze({ name: 'financial-reset-reopening-observation-v1', projectRef: packet.operation.projectRef, packetSha256: packet.packetSha256,
    transaction: { isolation: 'repeatable read', readOnly: true }, text: receiptSql, values: [target.operationId, copy(binding), authorizationId] });
}

export function reconcileReopening({ packet, binding, authorizationId, intent, observation, postgresSemanticText }) {
  const target = checkBinding(packet, binding, postgresSemanticText), r = observation?.receipt, a = observation?.authorization;
  if (!exactKeys(intent, ['format', 'operationId', 'packetSha256', 'bindingSha256', 'evidenceSha256', 'authorizationId', 'sqlSha256'])
    || intent.format !== 'nestory-reset-reopening-intent-v1' || intent.operationId !== target.operationId
    || intent.packetSha256 !== packet.packetSha256 || intent.bindingSha256 !== digestJson(binding)
    || intent.evidenceSha256 !== binding.reopening.evidence_sha256 || intent.authorizationId !== authorizationId || !digest.test(intent.sqlSha256)) fail('original_intent_mismatch');
  const proven = Boolean(r && r.operationId === target.operationId && r.binding && same(r.binding, binding) && r.hashValid === true
    && digest.test(r.sha256) && digest.test(r.bindingSha256) && r.evidenceSha256 === binding.reopening.evidence_sha256
    && r.checkpointSha256 === binding.reopening.checkpoint_sha256 && r.afterSha256 === binding.reopening.after_sha256
    && r.authorizationId === authorizationId && r.actorId === binding.continuation_semantic.actor_id
    && a?.authorizationId === authorizationId && a.actorId === r.actorId && a.status === 'consumed' && a.bindingMatches === true && sameTransaction(r, a)
    && observation.authorizationSessionId === r.sessionId
    && r.result?.operation_id === target.operationId && r.result.request_id === binding.reopening.request_id
    && r.result.status === 'open' && r.result.generation === target.generation && r.result.cutoff === binding.cutoff
    && r.result.organization_id === binding.organization_id && r.result.checkpoint_sha256 === binding.reopening.checkpoint_sha256
    && r.result.after_sha256 === binding.reopening.after_sha256 && r.result.evidence_sha256 === binding.reopening.evidence_sha256
    && r.result.review_sha256 === binding.reopening.review_sha256
    && r.result.authorization_id === authorizationId && r.result.actor_id === r.actorId && r.result.session_id === r.sessionId
    && timestampMicros(r.result.opened_at) !== null);
  return freeze({ format: 'nestory-reset-reopening-reconciliation-v1', operationId: target.operationId, packetSha256: packet.packetSha256,
    outcome: proven ? 'committed-and-verified' : 'not-proven-do-not-retry', mutationRetried: false,
    currentlyOpen: proven && observation.control?.status === 'open' && observation.control.generation === target.generation
      && observation.control.cutoff === binding.cutoff, receiptSha256: proven ? r.sha256 : null,
    observationSha256: digestJson(observation) });
}
