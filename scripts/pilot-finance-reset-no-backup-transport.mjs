// Fixed forward preparation and evidence reconciliation. No I/O or dispatch.
// Input documents and DB observations are validated, never promoted into a
// trusted provider. A concrete protected reader/runtime integration is pending.
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, assertNoBackupHostedBinding, hostedNoBackupBinding,
  verifyNoBackupSourceContents, NO_BACKUP_POLICY, NO_BACKUP_EVIDENCE_ROLES } from './pilot-finance-reset-no-backup-core.mjs';
import { validateArtifacts, observationSql, mutationSql, digestJson, digestDatabaseJson, sameDatabaseJson, sortDescriptors, timestampMicros, literal }
  from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';
import { reconstructLocalMigrationDescriptors } from './hosted-migration-parity-core.mjs';
import { validateReopeningObservation } from './pilot-finance-reset-reopening-protocol.mjs';

export const NO_BACKUP_FORWARD_ACTIONS = Object.freeze(['freeze', 'checkpoint', 'prepare', 'seal', 'execute']);
export const NO_BACKUP_RUNTIME_GATES = Object.freeze([
  'fixed_no_backup_reader_and_runtime_provenance_not_integrated',
  'independent_final_consent_and_current_authority_verification_required',
  'durable_original_attempt_custody_not_integrated', 'protected_live_dispatch_held',
]);
const fail = code => { throw new Error(`no_backup_transport_${code}`); };
const exact = (v, fields) => v && Object.getPrototypeOf(v) === Object.prototype &&
  canonicalJson(Object.keys(v).sort()) === canonicalJson([...fields].sort());
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const copy = value => structuredClone(value);
const artifactFields = ['manifest', 'actions', 'archive', 'zeroPlan', 'zeroPlanText', 'continuationPlan', 'reportPlan'];
const observationFields = ['catalog', 'ledger', 'businessDate', 'timezone', 'sourceSha256', 'foreignSha256', 'control', 'reservation',
  'reservationHashValid', 'recoveryReservation', 'recoveryCheckpoint', 'actionReceipt', 'operation', 'appliedCount', 'archiveCount',
  'actionCount', 'capabilityCount', 'zero', 'continuation', 'phaseFences', 'approvalCount', 'checkpoint', 'authorization'];
const intentFields = ['format', 'operationId', 'packetSha256', 'action', 'bindingSha256', 'authorizationId', 'authoritySha256',
  'deletionScopeSha256', 'liveConsentSha256', 'waiverSha256', 'sourceObservationSha256', 'previousIntentSha256', 'sqlSha256'];
const authorizationFields = ['authorizationId', 'actorId', 'status', 'bindingMatches', 'backendPid', 'transactionId', 'expiresAt', 'observedAt'];

function action(value) {
  if (!NO_BACKUP_FORWARD_ACTIONS.includes(value)) fail('action_unsupported');
  return value;
}
const previousAction = value => NO_BACKUP_FORWARD_ACTIONS[NO_BACKUP_FORWARD_ACTIONS.indexOf(action(value)) - 1] ?? null;
const sameTransaction = (a, b) => Boolean(a && b && Number.isSafeInteger(a.backendPid) && a.backendPid > 0 &&
  a.backendPid === b.backendPid && typeof a.transactionId === 'string' && /^[1-9][0-9]*$/.test(a.transactionId) && a.transactionId === b.transactionId);

export function noBackupDeletionScope(packet) {
  assertNoBackupPacket(packet);
  // No packet digest: consent references participate in that digest. This exact
  // scope instead binds all reviewed deletion/accounting/source identities.
  return freeze({ format: 'nestory-no-backup-deletion-scope-v1', recoveryPolicy: packet.recoveryPolicy, operation: copy(packet.operation),
    sourcesSha256: packet.sourcesSha256, schemaSha256: packet.schemaSha256, ledgerSha256: packet.ledgerSha256,
    sourceSnapshotSha256: packet.sourceSnapshotSha256, foreignSnapshotSha256: packet.foreignSnapshotSha256,
    databaseBinding: copy(packet.databaseBinding), archiveRows: packet.archiveRows, actionCount: packet.actionCount });
}

export function noBackupActionSlot(packet, requestedAction) {
  assertNoBackupPacket(packet); action(requestedAction);
  return `financial-reset/${packet.operation.operationId}/hosted-action/${requestedAction}`;
}

function inputs(packet, artifacts, postgresSemanticText, sourceContents) {
  assertNoBackupPacket(packet);
  verifyNoBackupSourceContents(packet, sourceContents);
  if (!exact(artifacts, artifactFields)) fail('forward_artifact_shape_invalid');
  validateArtifacts(packet, artifacts);
  if (!uuid(artifacts.zeroPlan.maker_actor_id) || !uuid(artifacts.zeroPlan.reviewer_actor_id) ||
    artifacts.zeroPlan.maker_actor_id === artifacts.zeroPlan.reviewer_actor_id) fail('independent_actor_review_invalid');
  const binding = hostedNoBackupBinding(packet, artifacts.continuationPlan, postgresSemanticText);
  return { binding, files: new Map(Object.entries(sourceContents).map(([name, content]) =>
    [name, new TextDecoder('utf-8', { fatal: true }).decode(typeof content === 'string' ? Buffer.from(content) : content).replace(/\r\n/g, '\n')])) };
}

function assertObserved(packet, observed, files) {
  if (!exact(observed, observationFields) || !Array.isArray(observed.catalog) || !Array.isArray(observed.ledger) ||
    digestJson(sortDescriptors(observed.catalog)) !== packet.schemaSha256 || digestJson(observed.ledger) !== packet.ledgerSha256) fail('installed_schema_or_ledger_changed');
  const catalogKeys = new Set();
  for (const item of observed.catalog) {
    const key = canonicalJson([item?.kind, item?.name]);
    if (!exact(item, ['kind', 'name', 'sha256']) || typeof item.kind !== 'string' || typeof item.name !== 'string' ||
      !digest(item.sha256) || catalogKeys.has(key)) fail('catalog_invalid');
    catalogKeys.add(key);
  }
  const migrations = [...files.keys()].filter(name => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (migrations.length !== observed.ledger.length) fail('migration_roster_changed');
  for (const [index, name] of migrations.entries()) {
    const m = observed.ledger[index], base = name.split('/').at(-1);
    if (!exact(m, ['version', 'name', 'statements']) || m.version !== base.slice(0, 14) || m.name !== base.slice(15, -4) ||
      !Array.isArray(m.statements) || !m.statements.length || m.statements.some(s => !exact(s, ['byteLength', 'sha256']) ||
        !Number.isSafeInteger(s.byteLength) || s.byteLength < 0 || !digest(s.sha256)) ||
      reconstructLocalMigrationDescriptors(files.get(name), m.statements).issue) fail('installed_migration_content_changed');
  }
  if (observed.timezone !== packet.operation.timezone || !digest(observed.sourceSha256) ||
    observed.foreignSha256 !== packet.foreignSnapshotSha256 || observed.capabilityCount !== 0 || observed.recoveryReservation !== null ||
    !Array.isArray(observed.phaseFences) || !['appliedCount', 'archiveCount', 'actionCount', 'approvalCount'].every(k =>
      Number.isSafeInteger(observed[k]) && observed[k] >= 0) ||
    (observed.reservation === null ? observed.reservationHashValid !== null : observed.reservationHashValid !== true)) fail('observation_scope_changed');
}

// Shared with the fixed read-only adapter. This checks observed values and
// source bytes; it does not certify their issuer or any execution authority.
export function validateNoBackupDatabaseObservation(request) {
  if (!exact(request, ['packet', 'sourceContents', 'observation'])) fail('database_observation_shape_invalid');
  const { packet, sourceContents, observation } = request;
  assertNoBackupPacket(packet); verifyNoBackupSourceContents(packet, sourceContents);
  const files = new Map(Object.entries(sourceContents).map(([name, content]) => [name,
    new TextDecoder('utf-8', { fatal: true }).decode(typeof content === 'string' ? Buffer.from(content) : content).replace(/\r\n/g, '\n')]));
  assertObserved(packet, observation, files);
  return freeze(copy(observation));
}

function assertAuthorization(observed, binding, authorizationId, pending, now) {
  const a = observed.authorization;
  if (!exact(a, authorizationFields) || a.authorizationId !== authorizationId || a.actorId !== binding.continuation_semantic.actor_id ||
    a.bindingMatches !== true || a.status !== (pending ? 'pending' : 'consumed') || timestampMicros(a.observedAt) === null ||
    timestampMicros(a.expiresAt) === null) return false;
  if (!pending) return sameTransaction(a, a);
  const observedAt = timestampMicros(a.observedAt), expires = timestampMicros(a.expiresAt), clock = BigInt(now) * 1000n;
  return a.backendPid === null && a.transactionId === null && expires > clock && expires > observedAt &&
    expires - observedAt <= 300000000n && (observedAt > clock ? observedAt - clock : clock - observedAt) <= 30000000n;
}

function operationMatches(operation, expected) {
  return Boolean(operation && Object.entries(expected).filter(([key]) => key !== 'audit_actor').every(([key, value]) =>
    key === 'audit_timestamp' ? timestampMicros(value) !== null && timestampMicros(operation[key]) === timestampMicros(value) :
      Object.hasOwn(operation, key) && same(operation[key], value)));
}

function commonState(packet, binding, observed) {
  return Boolean(observed.reservation && same(observed.reservation.binding, binding) && digest(observed.reservation.bindingSha256) &&
    observed.reservationHashValid === true && observed.reservation.foreignSha256 === packet.foreignSnapshotSha256 &&
    observed.control?.status === 'frozen' && observed.control.generation === binding.target_generation && observed.control.cutoff === binding.cutoff);
}
function retainedCheckpoint(packet, observed) {
  const c = observed.recoveryCheckpoint;
  return Boolean(c && c.bindingSha256 === observed.reservation?.bindingSha256 && c.sourceSha256 === packet.sourceSnapshotSha256 &&
    c.foreignSha256 === packet.foreignSnapshotSha256 && digest(c.authoritySha256) && sameTransaction(c, c));
}

function stageMatches(requestedAction, packet, binding, artifacts, observed, intent) {
  const r = observed.actionReceipt, s = r?.result;
  return Boolean(r && r.operationId === binding.operation_id && r.organizationId === binding.organization_id && r.action === requestedAction &&
    same(r.binding, binding) && r.bindingSha256 === observed.reservation?.bindingSha256 && r.authorizationId === intent.authorizationId &&
    r.authoritySha256 === intent.authoritySha256 && r.actorId === binding.continuation_semantic.actor_id &&
    sameTransaction(r, observed.authorization) && r.hashValid === true && digest(r.sha256) && s?.version === 1 && s.action === requestedAction &&
    operationMatches(s.operation, artifacts.actions.operation) && s.operation.status === (requestedAction === 'prepare' ? 'prepared' : 'sealed') &&
    s.appliedCount === 0 && s.archiveCount === packet.archiveRows && s.actionCount === packet.actionCount &&
    s.archiveSha256 === binding.archive_sha256 && s.actionSha256 === binding.action_sha256 &&
    (requestedAction === 'prepare' ? s.zero === null : s.zero?.status === 'prepared' && s.zero.reviewSha256 === binding.zero_review_sha256 &&
      s.zero.planSha256 === binding.zero_review_sha256 && sameDatabaseJson(s.zero.plan, artifacts.zeroPlan)));
}

function assertIntent(packet, binding, requestedAction, intent) {
  if (!exact(intent, intentFields) || intent.format !== 'nestory-no-backup-action-intent-v1' || intent.operationId !== packet.operation.operationId ||
    intent.packetSha256 !== packet.packetSha256 || intent.action !== requestedAction || intent.bindingSha256 !== digestJson(binding) ||
    !uuid(intent.authorizationId) || !['authoritySha256', 'deletionScopeSha256', 'liveConsentSha256', 'waiverSha256',
      'sourceObservationSha256', 'sqlSha256'].every(k => digest(intent[k])) ||
    intent.deletionScopeSha256 !== digestJson(noBackupDeletionScope(packet)) || intent.liveConsentSha256 !== packet.evidenceReferences.liveConsent?.sha256 ||
    intent.waiverSha256 !== packet.evidenceReferences.waiver?.sha256 ||
    (previousAction(requestedAction) === null ? intent.previousIntentSha256 !== null : !digest(intent.previousIntentSha256))) fail('original_intent_mismatch');
}

function matchesCommitted(requestedAction, packet, binding, artifacts, observed, intent, postgresSemanticText) {
  if (!assertAuthorization(observed, binding, intent.authorizationId, false) || !commonState(packet, binding, observed)) return false;
  if (requestedAction === 'freeze') return observed.sourceSha256 === packet.sourceSnapshotSha256 && sameTransaction(observed.reservation, observed.authorization);
  if (!retainedCheckpoint(packet, observed)) return false;
  if (requestedAction === 'checkpoint') return observed.sourceSha256 === packet.sourceSnapshotSha256 &&
    observed.recoveryCheckpoint.authoritySha256 === intent.authoritySha256 && sameTransaction(observed.recoveryCheckpoint, observed.authorization);
  if (['prepare', 'seal'].includes(requestedAction)) return stageMatches(requestedAction, packet, binding, artifacts, observed, intent);
  if (!operationMatches(observed.operation, artifacts.actions.operation) || observed.archiveCount !== packet.archiveRows ||
    observed.actionCount !== packet.actionCount || observed.zero?.planSha256 !== binding.zero_review_sha256 ||
    !sameDatabaseJson(observed.zero?.plan, artifacts.zeroPlan) || !sameTransaction(observed.zero, observed.checkpoint) ||
    observed.checkpoint?.result?.after_sha256 !== observed.sourceSha256) return false;
  try { validateReopeningObservation(packet, binding, observed, postgresSemanticText); return true; }
  catch { return false; }
}

function precondition(requestedAction, packet, binding, artifacts, observed) {
  if (observed.businessDate !== binding.execution_business_date || observed.sourceSha256 !== packet.sourceSnapshotSha256) fail('current_source_or_date_changed');
  if (requestedAction === 'freeze') {
    if (observed.reservation !== null || observed.operation !== null || observed.recoveryCheckpoint !== null || observed.checkpoint !== null ||
      observed.zero !== null || observed.continuation !== null || observed.actionReceipt !== null || observed.phaseFences.length ||
      observed.appliedCount || observed.archiveCount || observed.actionCount || observed.approvalCount ||
      (observed.control === null ? binding.source_generation !== 0 : !exact(observed.control, ['status', 'generation', 'cutoff']) ||
        observed.control.status !== 'open' || observed.control.generation !== binding.source_generation ||
        (observed.control.cutoff !== null && observed.control.cutoff !== binding.cutoff))) fail('freeze_precondition_failed');
    return;
  }
  if (!commonState(packet, binding, observed)) fail('reservation_precondition_failed');
  if (observed.appliedCount !== 0 || observed.checkpoint !== null || observed.continuation !== null || observed.phaseFences.length ||
    observed.actionReceipt !== null) fail('existing_action_reconcile_required');
  if (requestedAction === 'checkpoint') {
    if (observed.recoveryCheckpoint !== null || observed.operation !== null || observed.archiveCount || observed.actionCount || observed.zero !== null || observed.approvalCount) fail('checkpoint_precondition_failed');
    return;
  }
  if (!retainedCheckpoint(packet, observed)) fail('checkpoint_required');
  if (requestedAction === 'prepare') {
    if (observed.operation !== null || observed.archiveCount || observed.actionCount || observed.zero !== null || observed.approvalCount) fail('prepare_precondition_failed');
    return;
  }
  if (!operationMatches(observed.operation, artifacts.actions.operation) || observed.archiveCount !== packet.archiveRows || observed.actionCount !== packet.actionCount ||
    observed.operation.status !== (requestedAction === 'seal' ? 'prepared' : 'sealed')) fail('stage_precondition_failed');
  if (requestedAction === 'seal' && (observed.zero !== null || observed.approvalCount)) fail('seal_precondition_failed');
  if (requestedAction === 'execute' && (observed.approvalCount !== 2 || observed.zero?.status !== 'prepared' ||
    observed.zero.reviewSha256 !== binding.zero_review_sha256 || observed.zero.planSha256 !== binding.zero_review_sha256 ||
    !sameDatabaseJson(observed.zero.plan, artifacts.zeroPlan))) fail('independent_approvals_required');
}

function decode(bytes, code) {
  try {
    if (!(typeof bytes === 'string' || bytes instanceof Uint8Array) || !bytes.length) fail(code);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
  } catch { fail(code); }
}
function currentWindow(document, now) {
  const start = timestampMicros(document.issuedAt), end = timestampMicros(document.validUntil), clock = BigInt(now) * 1000n;
  return start !== null && end !== null && start <= clock && end > clock && end > start;
}

function authorityEvidence(packet, binding, zeroPlan, requestedAction, authorityText, evidenceBytes, now) {
  if (!Number.isSafeInteger(now) || now < 0 || packet.evidenceBlockers.length || !exact(evidenceBytes, NO_BACKUP_EVIDENCE_ROLES)) fail('current_authority_and_final_consent_required');
  for (const role of NO_BACKUP_EVIDENCE_ROLES) {
    const value = evidenceBytes[role], reference = packet.evidenceReferences[role];
    if (!(typeof value === 'string' || value instanceof Uint8Array) || hashBytes(value) !== reference.sha256 ||
      Buffer.byteLength(value) !== reference.bytes) fail('evidence_bytes_changed');
  }
  const scopeSha256 = digestJson(noBackupDeletionScope(packet)), waiver = decode(evidenceBytes.waiver, 'waiver_invalid'),
    consent = decode(evidenceBytes.liveConsent, 'final_consent_invalid'), authority = decode(authorityText, 'authority_invalid'),
    actorReview = decode(evidenceBytes.actorApprovals, 'actor_review_invalid');
  // This immutable pre-freeze assignment review avoids a circular packet hash.
  // It never substitutes for real DB approvals/endorsements after seal. A fixed
  // protected issuer must still establish this document's reviewer provenance;
  // matching fields or hashes do not grant authority or enable dispatch.
  if (!exact(actorReview, ['format', 'operationId', 'organizationId', 'deletionScopeSha256', 'zeroReviewSha256',
    'makerActorId', 'reviewerActorId', 'issuedAt']) || actorReview.format !== 'nestory-no-backup-actor-review-v1' ||
    actorReview.operationId !== packet.operation.operationId || actorReview.organizationId !== packet.operation.organizationId ||
    actorReview.deletionScopeSha256 !== scopeSha256 || actorReview.zeroReviewSha256 !== packet.databaseBinding.zeroReviewSha256 ||
    actorReview.makerActorId !== zeroPlan.maker_actor_id || actorReview.reviewerActorId !== zeroPlan.reviewer_actor_id ||
    timestampMicros(actorReview.issuedAt) === null || timestampMicros(actorReview.issuedAt) > BigInt(now) * 1000n) fail('actor_review_scope_invalid');
  if (!exact(waiver, ['format', 'deletionScopeSha256', 'recoveryPolicy', 'decision', 'acknowledgesUnrecoverableDeletion', 'issuedAt']) ||
    waiver.format !== 'nestory-no-backup-waiver-v1' || waiver.deletionScopeSha256 !== scopeSha256 || waiver.recoveryPolicy !== NO_BACKUP_POLICY ||
    waiver.decision !== 'waive-external-backup-and-restore' || waiver.acknowledgesUnrecoverableDeletion !== true ||
    timestampMicros(waiver.issuedAt) === null || timestampMicros(waiver.issuedAt) > BigInt(now) * 1000n) fail('waiver_scope_invalid');
  if (!exact(consent, ['format', 'deletionScopeSha256', 'recoveryPolicy', 'decision', 'issuedAt', 'validUntil']) ||
    consent.format !== 'nestory-no-backup-live-consent-v1' || consent.deletionScopeSha256 !== scopeSha256 || consent.recoveryPolicy !== NO_BACKUP_POLICY ||
    consent.decision !== 'approve-exact-reset-deletion' || !currentWindow(consent, now)) fail('final_consent_scope_or_expiry_invalid');
  const referenceFields = NO_BACKUP_EVIDENCE_ROLES.map(role => `${role}Sha256`);
  if (!exact(authority, ['format', 'operationId', 'packetSha256', 'bindingSha256', 'deletionScopeSha256', 'action', 'issuedAt', 'validUntil', ...referenceFields]) ||
    authority.format !== 'nestory-no-backup-execution-authority-v1' || authority.operationId !== packet.operation.operationId ||
    authority.packetSha256 !== packet.packetSha256 || authority.bindingSha256 !== digestJson(binding) || authority.deletionScopeSha256 !== scopeSha256 ||
    authority.action !== requestedAction || !currentWindow(authority, now) || timestampMicros(authority.validUntil) > timestampMicros(consent.validUntil) ||
    NO_BACKUP_EVIDENCE_ROLES.some(role => authority[`${role}Sha256`] !== packet.evidenceReferences[role].sha256)) fail('authority_scope_or_expiry_invalid');
  return { authoritySha256: hashBytes(authorityText), scopeSha256 };
}

export function noBackupObservationQuery(request) {
  if (!exact(request, ['packet', 'binding', 'postgresSemanticText', 'action', 'authorizationId', 'previousIntent'])) fail('observation_query_shape_invalid');
  const { packet, binding, postgresSemanticText, action: requestedAction, authorizationId, previousIntent } = request;
  action(requestedAction); assertNoBackupHostedBinding(packet, binding, postgresSemanticText);
  if (!uuid(authorizationId)) fail('authorization_locator_invalid');
  const prior = previousAction(requestedAction);
  if (prior === null ? previousIntent !== null : !previousIntent) fail('immediate_previous_intent_required');
  if (prior) assertIntent(packet, binding, prior, previousIntent);
  const build = (id, stage) => {
    const source = observationSql(packet, binding, id, stage), anchor = "SELECT jsonb_build_object('catalog',";
    if (source.split(anchor).length !== 2 || !source.endsWith('\nCOMMIT;')) fail('observation_builder_changed');
    return source.replace(anchor, `SELECT jsonb_build_object('reservationHashValid',(SELECT r.binding_sha256=app_private.financial_reset_hash(r.binding) FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=${literal(binding.operation_id)}::uuid),'catalog',`);
  };
  let sql = build(authorizationId, requestedAction);
  if (prior) {
    const other = build(previousIntent.authorizationId, prior), start = other.indexOf('\nSELECT ');
    if (start < 0 || other.slice(0, start) !== sql.slice(0, sql.indexOf('\nSELECT '))) fail('observation_builder_changed');
    sql = `${sql.slice(0, -8)}\n${other.slice(start + 1, -8)}\nCOMMIT;`;
  }
  return freeze({ format: 'nestory-no-backup-forward-observation-v1', operationId: packet.operation.operationId,
    packetSha256: packet.packetSha256, action: requestedAction, transaction: { isolation: 'repeatable read', readOnly: true },
    observationCount: prior ? 2 : 1, text: sql });
}

export function prepareNoBackupAction(request) {
  if (!exact(request, ['packet', 'artifacts', 'postgresSemanticText', 'sourceContents', 'action', 'authorizationId', 'observation',
    'previous', 'authorityText', 'evidenceBytes', 'now', 'existingIntent'])) fail('preparation_shape_invalid');
  const { packet, artifacts, postgresSemanticText, sourceContents, action: requestedAction, authorizationId, observation: observed,
    previous, authorityText, evidenceBytes, now, existingIntent } = request;
  action(requestedAction);
  if (existingIntent !== null) fail('existing_attempt_reconcile_required');
  const { binding, files } = inputs(packet, artifacts, postgresSemanticText, sourceContents);
  const authority = authorityEvidence(packet, binding, artifacts.zeroPlan, requestedAction, authorityText, evidenceBytes, now);
  assertObserved(packet, observed, files);
  if (!uuid(authorizationId) || !assertAuthorization(observed, binding, authorizationId, true, now)) fail('current_genuine_authorization_required');
  const prior = previousAction(requestedAction);
  if (prior === null) { if (previous !== null) fail('unexpected_previous_stage'); }
  else {
    if (!exact(previous, ['intent', 'observation'])) fail('immediate_previous_stage_required');
    assertIntent(packet, binding, prior, previous.intent);
    assertObserved(packet, previous.observation, files);
    if (!matchesCommitted(prior, packet, binding, artifacts, previous.observation, previous.intent, postgresSemanticText)) fail('previous_stage_not_proven');
  }
  precondition(requestedAction, packet, binding, artifacts, observed);
  const sql = mutationSql({ binding, action: requestedAction, authorizationId, authoritySha256: authority.authoritySha256, observation: observed, artifacts });
  const intent = { format: 'nestory-no-backup-action-intent-v1', operationId: packet.operation.operationId, packetSha256: packet.packetSha256,
    action: requestedAction, bindingSha256: digestJson(binding), authorizationId, authoritySha256: authority.authoritySha256,
    deletionScopeSha256: authority.scopeSha256, liveConsentSha256: packet.evidenceReferences.liveConsent.sha256,
    waiverSha256: packet.evidenceReferences.waiver.sha256, sourceObservationSha256: digestDatabaseJson(observed),
    previousIntentSha256: prior ? digestJson(previous.intent) : null, sqlSha256: hashBytes(sql) };
  return freeze({ format: 'nestory-no-backup-forward-preparation-v1', action: requestedAction, slot: noBackupActionSlot(packet, requestedAction),
    binding, sql, intent, executionSupported: false, authorityProvenanceVerified: false, runtimeGates: [...NO_BACKUP_RUNTIME_GATES] });
}

export function reconcileNoBackupAction(request) {
  if (!exact(request, ['packet', 'artifacts', 'postgresSemanticText', 'sourceContents', 'action', 'intent', 'observation', 'previous'])) fail('reconciliation_shape_invalid');
  const { packet, artifacts, postgresSemanticText, sourceContents, action: requestedAction, intent, observation: observed, previous } = request;
  action(requestedAction);
  const { binding, files } = inputs(packet, artifacts, postgresSemanticText, sourceContents);
  assertIntent(packet, binding, requestedAction, intent);
  assertObserved(packet, observed, files);
  const prior = previousAction(requestedAction);
  let priorMatches = prior === null && previous === null;
  if (prior !== null) {
    if (!exact(previous, ['intent', 'observation'])) fail('immediate_previous_stage_required');
    assertIntent(packet, binding, prior, previous.intent);
    assertObserved(packet, previous.observation, files);
    priorMatches = intent.previousIntentSha256 === digestJson(previous.intent) &&
      matchesCommitted(prior, packet, binding, artifacts, previous.observation, previous.intent, postgresSemanticText);
  }
  const matches = priorMatches && matchesCommitted(requestedAction, packet, binding, artifacts, observed, intent, postgresSemanticText);
  return freeze({ format: 'nestory-no-backup-action-reconciliation-v1', operationId: packet.operation.operationId, packetSha256: packet.packetSha256,
    action: requestedAction, outcome: matches ? 'committed-evidence-matches' : 'not-proven-do-not-retry',
    observationProvenanceVerified: false, mutationAllowed: false, mutationRetried: false, normalWritesReopened: false,
    originalIntentSha256: digestJson(intent), observationSha256: digestDatabaseJson(observed), authoritySha256: intent.authoritySha256,
    actionReceiptSha256: matches && ['prepare', 'seal'].includes(requestedAction) ? observed.actionReceipt.sha256 : null,
    checkpointSha256: matches && requestedAction === 'execute' ? observed.checkpoint.sha256 : null,
    runtimeGates: [...NO_BACKUP_RUNTIME_GATES] });
}

// Intentionally no process, connection, callback or provider can override this.
export function assertNoBackupTransportDispatchImplemented() { assertHostedTransportDispatchImplemented(); }
