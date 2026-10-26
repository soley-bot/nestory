// Offline protocol checks; these do not claim Auth, database, or retained-file proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { digestJson, digestDatabaseJson, hostedBinding } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { validateReopeningObservation, createReopeningPreparation, reopeningMutationSql, reopeningObservationQuery,
  reconcileReopening, assertReopeningDispatchImplemented, noBackupReopeningAuditQuery, validateNoBackupReopeningAudit,
  validateNoBackupReopeningAuthority, createNoBackupReopeningPreparation, assertReopeningHostedBinding,
  validateNoBackupCompletionHistory, assertPreparedReopening } from './pilot-finance-reset-reopening-protocol.mjs';
import { prepareNoBackupPacket, hostedNoBackupBinding, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_REQUIRED_SOURCE_FILES } from './pilot-finance-reset-no-backup-core.mjs';
import { NO_BACKUP_FORWARD_ACTIONS, NO_BACKUP_RUNTIME_GATES, noBackupDeletionScope } from './pilot-finance-reset-no-backup-transport.mjs';
import { createExclusiveDirectoryStore, createJsonJournal } from './pilot-finance-reset-durable-store.mjs';

const id = value => `fd240157-0000-4000-8000-${String(value).padStart(12, '0')}`;
const d = value => String(value).repeat(64);
function fixture(inverse = false) {
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, Buffer.from(`synthetic-encrypted-${role}`)]));
  const review = { format: 'nestory-protected-reset-review-v1', operation: { operationId: id(100), projectRef: 'syntheticprojectrefa',
    organizationId: id(1), mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01',
    issueDate: '2026-10-01', timezone: 'Asia/Phnom_Penh', executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october' },
  schemaSha256: d('1'), ledgerSha256: d('2'), sourceSnapshotSha256: d('3'), archiveRows: 1, actionCount: 1,
  databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256'].map((key, index) => [key, d(index + 1)])),
  artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, bytes]) => [key, hashBytes(bytes)])) };
  const packet = prepareOperatorPacket({ review, artifacts, candidateHead: review.operation.mainSha,
    sources: [...SOURCE_ENTRYPOINTS, 'supabase/migrations/20261024015702_financial_reset_checked_reopening.sql'].map(path => ({ path, sha256: d('a') })) });
  const semantic = { version: 3, actor_id: id(10), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [] };
  const base = hostedBinding(packet, semantic);
  const binding = inverse ? { ...base, recovery: { operation_id: id(101), source_generation: 1, target_generation: 2,
    plan_sha256: d('8'), action_sha256: d('9'), action_count: 1, report_checkpoint_sha256: d('b'),
    phase_binding_sha256: d('c'), review_artifact_sha256: d('d'), execution_business_date: '2026-10-24' } } : base;
  const operationId = inverse ? id(101) : id(100), generation = inverse ? 2 : 1;
  const transaction = { backendPid: 81, transactionId: '123456789' };
  const observation = { timezone: binding.timezone, businessDate: '2026-10-24', foreignSha256: d('f'),
    control: { status: 'frozen', generation, cutoff: '2026-10-01' },
    operation: { operation_id: operationId, organization_id: id(1), operation_kind: inverse ? 'restore' : 'reset',
      restore_of: inverse ? id(100) : null, status: 'actions_complete', target_generation: generation,
      action_count: 1, execution_backend: transaction.backendPid, execution_xid: transaction.transactionId },
    appliedCount: 1, actionCount: 1, capabilityCount: 0,
    reservation: { binding: base, bindingSha256: d('a'), foreignSha256: d('f') },
    recoveryReservation: inverse ? { binding } : null,
    recoveryCheckpoint: { bindingSha256: d('a'), sourceSha256: packet.sourceSnapshotSha256, foreignSha256: d('f') },
    zero: { status: 'complete', reviewSha256: binding.zero_review_sha256, ...transaction },
    continuation: { status: 'complete', semantic },
    phaseFences: ['known-zero', 'continuation', 'reports'].map(phase => ({ phase, ...transaction })),
    authorization: { authorizationId: id(99), status: 'consumed', bindingMatches: true, ...transaction },
    checkpoint: { kind: inverse ? 'phase-recovery' : 'checked-reports', generation, sha256: d('e'), hashValid: true,
      currentImagesMatch: true, ...transaction, result: { after_sha256: d('d'), control_reopened: false,
        report_checkpoint_sha256: inverse ? binding.recovery.report_checkpoint_sha256 : undefined,
        report_review_sha256: binding.report_review_sha256, continuation_semantic_sha256: binding.continuation_semantic_sha256,
        reports_persisted: true, close_published: false, billing_complete: false, deferred_lease_count: 5 } } };
  delete observation.checkpoint.result.report_checkpoint_sha256;
  if (inverse) observation.checkpoint.result.report_checkpoint_sha256 = binding.recovery.report_checkpoint_sha256;
  return { packet, binding, observation, operationId, generation };
}
function completedOpening(inverse = false) {
  const f = fixture(inverse), authorizationId = id(150);
  f.binding = { ...f.binding, reopening: { version: 1, request_id: id(200), operation_id: f.operationId, generation: f.generation,
    cutoff: '2026-10-01', checkpoint_sha256: d('e'), after_sha256: d('d'), foreign_sha256: d('f'),
    evidence_sha256: d('b'), review_sha256: d('c'), execution_business_date: '2026-10-24' } };
  const intent = { format: 'nestory-reset-reopening-intent-v1', operationId: f.operationId, packetSha256: f.packet.packetSha256,
    bindingSha256: digestJson(f.binding), evidenceSha256: d('b'), authorizationId, sqlSha256: d('a') };
  const transaction = { backendPid: 82, transactionId: '123456790' };
  const receipt = { operationId: f.operationId, binding: f.binding, bindingSha256: d('1'), evidenceSha256: d('b'), checkpointSha256: d('e'),
    afterSha256: d('d'), authorizationId, actorId: id(10), sessionId: id(12), ...transaction, sha256: d('2'), hashValid: true,
    result: { operation_id: f.operationId, request_id: id(200), status: 'open', generation: f.generation, cutoff: '2026-10-01',
      organization_id: id(1), checkpoint_sha256: d('e'), after_sha256: d('d'), evidence_sha256: d('b'), review_sha256: d('c'),
      authorization_id: authorizationId, actor_id: id(10), session_id: id(12), opened_at: '2026-10-24T00:04:00.123456Z' } };
  return { ...f, authorizationId, intent, observation: { receipt, authorization: { authorizationId, actorId: id(10), status: 'consumed', bindingMatches: true, ...transaction },
    authorizationSessionId: id(12),
    control: { status: 'open', generation: f.generation, cutoff: '2026-10-01' } } };
}

for (const inverse of [false, true]) {
  test(`${inverse ? 'inverse' : 'reset'} validates exact completed frozen checkpoint without inventing full billing`, () => {
    const f = fixture(inverse), result = validateReopeningObservation(f.packet, f.binding, f.observation);
    assert.equal(result.operationId, f.operationId); assert.equal(result.generation, f.generation);
    assert.equal(f.observation.checkpoint.result.billing_complete, false);
  });
}
const drifts = [
  ['control open', f => { f.observation.control.status = 'open'; }],
  ['generation changed', f => { f.observation.control.generation++; }],
  ['cutoff changed', f => { f.observation.control.cutoff = '2026-11-01'; }],
  ['source drift or later entries', f => { f.observation.checkpoint.currentImagesMatch = false; }],
  ['checkpoint missing', f => { f.observation.checkpoint = null; }],
  ['checkpoint hash mismatch', f => { f.observation.checkpoint.hashValid = false; }],
  ['operation incomplete', f => { f.observation.operation.status = 'sealed'; }],
  ['unapplied action', f => { f.observation.appliedCount = 0; }],
  ['remaining capability', f => { f.observation.capabilityCount = 1; }],
  ['different completion transaction', f => { f.observation.authorization.transactionId = '987654321'; }],
  ['unconsumed completion authority', f => { f.observation.authorization.status = 'pending'; }],
  ['foreign snapshot changed', f => { f.observation.foreignSha256 = d('0'); }],
  ['initial archive checkpoint missing', f => { f.observation.recoveryCheckpoint = null; }],
  ['zero phase incomplete', f => { f.observation.zero.status = 'prepared'; }],
  ['continuation incomplete', f => { f.observation.continuation.status = 'prepared'; }],
  ['report review changed', f => { f.observation.checkpoint.result.report_review_sha256 = d('0'); }],
  ['phase witness missing', f => { f.observation.phaseFences.pop(); }],
  ['published close', f => { f.observation.checkpoint.result.close_published = true; }],
];
for (const [label, change] of drifts) test(`reopening refuses ${label}`, () => {
  const f = fixture(); change(f); assert.throws(() => validateReopeningObservation(f.packet, f.binding, f.observation), /reset_reopening_/);
});
test('inverse requires original recovery reservation and report link', () => {
  const f = fixture(true); f.observation.recoveryReservation = null;
  assert.throws(() => validateReopeningObservation(f.packet, f.binding, f.observation), /inverse_checkpoint_required/);
});
test('provider-shaped objects and a claimed fsync kind cannot manufacture journal provenance', () => {
  const f = fixture();
  assert.throws(() => createReopeningPreparation({ packet: f.packet, provider: { readCommitted() {}, reconcile() {} }, descriptors: {},
    journalStore: { kind: 'exclusive-file-and-directory-fsync', read() {}, putIfAbsent() {} }, verifyRecoveryAuthority() {}, verifyReopeningAuthority() {} }), /unrecognized_journal_provider/);
});
test('caller hashes, booleans and serialized reviews cannot mint a SQL capability', async () => {
  for (const candidate of [{ ready: true }, { binding: completedOpening().binding, evidenceText: '{}' }, Object.freeze({ verified: true })]) {
    assert.throws(() => assertPreparedReopening(candidate, {}), /verified_provider_preparation_required/);
    await assert.rejects(reopeningMutationSql(candidate, id(150)), /verified_provider_preparation_required/);
  }
});
test('dispatch remains unconditionally held', () => {
  assert.throws(assertReopeningDispatchImplemented, /integration_incomplete/);
});
for (const inverse of [false, true]) test(`${inverse ? 'inverse' : 'reset'} lost reply reconciles the exact immutable opening`, () => {
  const f = completedOpening(inverse), result = reconcileReopening(f);
  assert.equal(result.outcome, 'committed-and-verified'); assert.equal(result.currentlyOpen, true); assert.equal(result.mutationRetried, false);
});
test('historical opening reconciles after a later ordinary entry, refreeze or generation change', () => {
  const f = completedOpening();
  // The immutable receipt remains proof after normal source changes. Inverse
  // readiness remains independently protected by the snapshot predicate above.
  f.observation.currentSourceSha256 = d('9');
  assert.equal(reconcileReopening(f).outcome, 'committed-and-verified');
  f.observation.control = { status: 'frozen', generation: 2, cutoff: '2026-10-01' };
  const result = reconcileReopening(f);
  assert.equal(result.outcome, 'committed-and-verified'); assert.equal(result.currentlyOpen, false);
});
for (const [label, mutate] of [
  ['absent receipt', f => { f.observation.receipt = null; }],
  ['old request', f => { f.observation.receipt.result.request_id = id(201); }],
  ['different backend', f => { f.observation.authorization.backendPid++; }],
  ['different transaction', f => { f.observation.receipt.transactionId = '99'; }],
  ['different actor', f => { f.observation.receipt.actorId = id(13); }],
  ['different session', f => { f.observation.receipt.result.session_id = id(14); }],
  ['different authorization session', f => { f.observation.authorizationSessionId = id(14); }],
  ['different checkpoint result', f => { f.observation.receipt.result.checkpoint_sha256 = d('0'); }],
  ['bad result hash', f => { f.observation.receipt.hashValid = false; }],
  ['invalid calendar timestamp', f => { f.observation.receipt.result.opened_at = '2026-02-30T00:00:00Z'; }],
]) test(`lost opening stays quarantined for ${label}`, () => {
  const f = completedOpening(); mutate(f);
  assert.equal(reconcileReopening(f).outcome, 'not-proven-do-not-retry');
});
test('unknown intent cannot borrow another opening receipt', () => {
  const f = completedOpening(); f.intent.authorizationId = id(151);
  assert.throws(() => reconcileReopening(f), /original_intent_mismatch/);
});
test('fixed read-only receipt query binds only operation, original binding and exact authorization', () => {
  const f = completedOpening(), query = reopeningObservationQuery(f);
  assert.equal(query.transaction.readOnly, true); assert.equal(query.values[0], f.operationId);
  assert.equal(query.values[2], f.authorizationId); assert.deepEqual(query.values[1], f.binding);
  assert.match(query.text, /financial_reset_reopening_receipts/); assert.doesNotMatch(query.text, /\b(?:UPDATE|INSERT|DELETE)\b/);
});
test('migration preserves ACLs, exact prior-commit boundary and actual control-event receipt', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261024015702_financial_reset_checked_reopening.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /^\s*GRANT\s/m);
  assert.match(sql, /o\.execution_xid=pg_current_xact_id\(\)/);
  assert.match(sql, /financial_reset_reopening_actual_transition_required/);
  assert.match(sql, /financial_reset_temporary_open_must_commit_frozen/);
  assert.match(sql, /financial_reset_reopening_transaction_sealed/);
  assert.match(sql, /financial_reset_checked_reopening_required/);
  assert.doesNotMatch(sql, /credential_expires_at\s*=/);
});
test('canonical evidence hashes preserve exact reviewed bytes', () => {
  assert.notEqual(hashBytes('{"a":1}'), hashBytes('{ "a": 1 }'));
  assert.equal(canonicalJson({ a: 1 }), '{"a":1}');
});

// Every byte and database observation in these fixtures is synthetic. A valid
// contract does not prove customer consent, actual SQL completion or authority.
function noBackupFixture() {
  const f = fixture(), semantic = { ...f.binding.continuation_semantic, leases: [
    { lease_id: id(40), term_id: id(41), billing_rule_id: id(42), disposition: 'bill', continue_month_to_month: false,
      rent_amount: '100.00', management_fee_amount: '10.00', currency: 'USD', recipient_person_id: id(43),
      collection_route: 'through_ips', due_date: '2026-10-07' },
    { lease_id: id(45), term_id: id(46), billing_rule_id: id(47), disposition: 'defer-expired-unbilled',
      reason: 'renewal-unconfirmed', source_sha256: d('9') },
  ], original_invoice_sources: [{ lease_id: id(40), invoice_id: id(44), row_sha256: d('8') }] };
  const postgresSemanticText = JSON.stringify(semantic, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, Buffer.from(`synthetic-reference-${role}`)]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { ...f.packet.operation, kind: 'reset', restoreOf: null, dueDate: '2026-10-07',
      projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION }, schemaSha256: f.packet.schemaSha256,
    ledgerSha256: f.packet.ledgerSha256, sourceSnapshotSha256: f.packet.sourceSnapshotSha256, foreignSnapshotSha256: d('f'),
    archiveRows: 1, actionCount: 1, databaseBinding: { ...f.packet.databaseBinding, continuationSemanticSha256: hashBytes(postgresSemanticText) },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  const sourceContents = Object.fromEntries(NO_BACKUP_REQUIRED_SOURCE_FILES.map(name => [name, Buffer.from(`synthetic-source-${name}`)]));
  const packet = prepareNoBackupPacket({ review, evidence, sourceContents,
    sources: Object.entries(sourceContents).map(([path, bytes]) => ({ path, sha256: hashSourceBytes(bytes) })),
    candidateHead: review.operation.mainSha, observedBusinessDate: '2026-10-24' });
  const binding = hostedNoBackupBinding(packet, semantic, postgresSemanticText), observation = f.observation;
  observation.operation.organization_id = binding.organization_id;
  observation.reservation.binding = binding; observation.continuation.semantic = semantic;
  observation.checkpoint.result.continuation_semantic_sha256 = binding.continuation_semantic_sha256;
  const audit = { operationId: binding.operation_id, organizationId: binding.organization_id,
    bindingSha256: observation.reservation.bindingSha256, checkpointSha256: observation.checkpoint.sha256,
    archiveRowsValid: true, stageReceiptsValid: true,
    databaseAudit: { archive_count: binding.archive_count, archive_sha256: binding.archive_sha256,
      action_count: binding.action_count, action_sha256: binding.action_sha256, prepare_receipt_sha256: d('b'), seal_receipt_sha256: d('c'),
      completion_authorization_id: observation.authorization.authorizationId, completion_backend_pid: observation.checkpoint.backendPid,
      completion_transaction_id: observation.checkpoint.transactionId },
    completionAuthorization: { authorizationId: observation.authorization.authorizationId, actorId: id(10), sessionId: id(12),
      backendPid: observation.checkpoint.backendPid, transactionId: observation.checkpoint.transactionId, hashValid: true } };
  return { ...f, packet, binding, postgresSemanticText, observation, audit };
}
function noBackupAuthorityFixture(businessDate) {
  const f = noBackupFixture();
  if (businessDate !== undefined) f.observation.businessDate = businessDate;
  const proof = validateNoBackupReopeningAudit(f), reviewSha256 = d('7'), now = Date.now();
  return { ...f, proof, reviewSha256, receipt: { format: 'nestory-no-backup-reopening-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: f.binding.operation_id, organizationId: f.binding.organization_id, packetSha256: f.packet.packetSha256,
    bindingSha256: f.audit.bindingSha256, checkpointSha256: proof.checkpointSha256, afterSha256: proof.afterSha256,
    foreignSha256: proof.foreignSha256, reviewSha256, databaseAudit: f.audit.databaseAudit, evidenceReferences: f.packet.evidenceReferences,
    actorId: id(10), sessionId: id(12), executionBusinessDate: proof.businessDate,
    observedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString() } };
}
test('no-backup preparation binds exact database audit and permits reviewed deferred billing', () => {
  const f = noBackupFixture(), proof = validateNoBackupReopeningAudit(f);
  assert.equal(proof.operationId, f.binding.operation_id); assert.equal(f.packet.executionSupported, false);
  assert.equal(f.binding.archive_artifact_sha256, null); assert.equal(f.observation.checkpoint.result.billing_complete, false);
});
for (const [label, mutate] of [
  ['missing archive rows', f => { f.audit.databaseAudit.archive_count = 0; }],
  ['different archive image', f => { f.audit.databaseAudit.archive_sha256 = d('0'); }],
  ['changed action audit', f => { f.audit.databaseAudit.action_sha256 = d('0'); }],
  ['invalid row image', f => { f.audit.archiveRowsValid = false; }],
  ['missing real stage receipt', f => { f.audit.stageReceiptsValid = false; }],
  ['missing stage hash', f => { f.audit.databaseAudit.prepare_receipt_sha256 = null; }],
  ['different completion authorization', f => { f.audit.databaseAudit.completion_authorization_id = id(90); }],
  ['different completion transaction', f => { f.audit.databaseAudit.completion_transaction_id = '42'; }],
  ['different completion actor', f => { f.audit.completionAuthorization.actorId = id(90); }],
  ['different original binding', f => { f.audit.bindingSha256 = d('0'); }],
  ['foreign image changed from packet', f => { f.observation.foreignSha256 = d('0'); }],
]) test(`no-backup reopening rejects ${label}`, () => {
  const f = noBackupFixture(); mutate(f); assert.throws(() => validateNoBackupReopeningAudit(f), /reset_reopening_/);
});
test('no-backup reopening rejects inverse, invented artifact and missing exact PostgreSQL bytes', () => {
  for (const mutate of [f => { f.binding.recovery = fixture(true).binding.recovery; },
    f => { f.binding.archive_artifact_sha256 = d('a'); }, f => { delete f.postgresSemanticText; }]) {
    const f = noBackupFixture(); mutate(f); assert.throws(() => validateNoBackupReopeningAudit(f), /no_backup_/);
  }
});
test('no-backup fixed audit query is read-only and pins the original completion authorization', () => {
  const f = noBackupFixture(), query = noBackupReopeningAuditQuery({ ...f, authorizationId: id(99) });
  assert.deepEqual(query.values, [f.binding.operation_id, f.binding, id(99)]);
  assert.equal(query.transaction.readOnly, true); assert.match(query.text, /financial_reset_archive_digest/);
  assert.match(query.text, /financial_reset_action_digest/); assert.match(query.text, /financial_reset_hosted_action_receipts/);
  assert.doesNotMatch(query.text, /\b(?:INSERT|UPDATE|DELETE)\b/);
});
test('typed no-backup verifier result preserves actual evidence references and freshness', () => {
  const f = noBackupAuthorityFixture(); assert.deepEqual(validateNoBackupReopeningAuthority(f), f.receipt);
});
for (const [label, mutate] of [
  ['boolean', f => { f.receipt = true; }],
  ['arbitrary hash', f => { f.receipt = { sha256: d('a') }; }],
  ['different packet', f => { f.receipt.packetSha256 = d('0'); }],
  ['different base binding', f => { f.receipt.bindingSha256 = d('0'); }],
  ['different checkpoint', f => { f.receipt.checkpointSha256 = d('0'); }],
  ['different foreign image', f => { f.receipt.foreignSha256 = d('0'); }],
  ['different actor', f => { f.receipt.actorId = id(90); }],
  ['missing session', f => { delete f.receipt.sessionId; }],
  ['missing consent reference', f => { f.receipt.evidenceReferences = { ...f.receipt.evidenceReferences, liveConsent: null }; }],
  ['different completion audit', f => { f.receipt.databaseAudit = { ...f.receipt.databaseAudit, completion_transaction_id: '42' }; }],
  ['expired proof', f => { f.receipt.expiresAt = new Date(Date.now() - 1).toISOString(); }],
  ['stale observation', f => { f.receipt.observedAt = new Date(Date.now() - 60000).toISOString(); }],
  ['future observation', f => { f.receipt.observedAt = new Date(Date.now() + 60000).toISOString(); }],
  ['overlong authority', f => { f.receipt.expiresAt = new Date(Date.now() + 600000).toISOString(); }],
]) test(`no-backup verifier refuses ${label}`, () => {
  const f = noBackupAuthorityFixture(); mutate(f); assert.throws(() => validateNoBackupReopeningAuthority(f), /no_backup_current_authority_required/);
});
test('no-backup provider-shaped journal and caller callback cannot mint recognized provenance', () => {
  const f = noBackupFixture();
  assert.throws(() => createNoBackupReopeningPreparation({ packet: f.packet, postgresSemanticText: f.postgresSemanticText,
    journalStore: { kind: 'exclusive-file-and-directory-fsync', read() {}, putIfAbsent() {} }, verifyReopeningAuthority: () => true }), /unrecognized_journal_provider/);
});
test('no-backup opening still reconciles historically after a later ordinary write', () => {
  const f = noBackupFixture(), opened = completedOpening();
  opened.packet = f.packet; opened.postgresSemanticText = f.postgresSemanticText;
  opened.binding = { ...f.binding, reopening: opened.binding.reopening };
  opened.intent.packetSha256 = f.packet.packetSha256; opened.intent.bindingSha256 = digestJson(opened.binding);
  opened.observation.receipt.binding = opened.binding; opened.observation.receipt.result.organization_id = f.binding.organization_id;
  opened.observation.currentSourceSha256 = d('0');
  assert.equal(reconcileReopening(opened).outcome, 'committed-and-verified');
  assert.equal(reopeningObservationQuery(opened).transaction.readOnly, true);
  opened.observation.receipt = null; assert.equal(reconcileReopening(opened).outcome, 'not-proven-do-not-retry');
});
test('SQL mode checks recompute audit facts and lock precedes authorization consumption', async () => {
  const [sql, protocol] = await Promise.all([
    readFile(new URL('../supabase/migrations/20261024015702_financial_reset_checked_reopening.sql', import.meta.url), 'utf8'),
    readFile(new URL('./pilot-finance-reset-reopening-protocol.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(sql, /financial_reset_reopening_no_backup_database_audit_required/);
  assert.match(sql, /e->'database_audit' IS DISTINCT FROM v_audit/);
  assert.match(sql, /v_authority->>'sessionId' IS DISTINCT FROM v_reopening_actor.session_id::text/);
  assert.match(sql, /v_authority->>'expiresAt'\)::timestamptz>v_reopening_actor.credential_expires_at/);
  const builder = protocol.slice(protocol.indexOf('export async function reopeningMutationSql'));
  assert.ok(builder.indexOf('pg_advisory_xact_lock') < builder.indexOf('consume_financial_reset_actor_authorization'));
});
test('actor integration can validate a reopening binding without minting authority', () => {
  const f = completedOpening(); assert.equal(assertReopeningHostedBinding(f.packet, f.binding), f.binding);
  assert.throws(() => assertReopeningHostedBinding(f.packet, { ...f.binding, extra: true }), /reset_reopening_/);
  const n = noBackupFixture(), binding = { ...n.binding, reopening: f.binding.reopening };
  assert.equal(assertReopeningHostedBinding(n.packet, binding, n.postgresSemanticText), binding);
  assert.throws(() => assertReopeningHostedBinding(n.packet, binding), /no_backup_semantic_bytes_mismatch/);
});
test('deferred commit independently rejects an expired immutable authority receipt', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261024015702_financial_reset_checked_reopening.sql', import.meta.url), 'utf8');
  const commit = sql.slice(sql.indexOf('CREATE FUNCTION app_private.assert_financial_reset_reopening_commit()'),
    sql.indexOf('CREATE CONSTRAINT TRIGGER financial_reset_checked_open_commit'));
  assert.match(commit, /assert_financial_reset_hosted_actor_context\(r.binding,'reopen'\)/);
  assert.match(commit, /r.evidence_text::jsonb->'authority_receipt'->>'expiresAt'/);
  assert.match(commit, /'-infinity'::timestamptz\)<=clock_timestamp\(\)/);
  assert.match(commit, /financial_reset_reopening_no_backup_authority_expired_before_commit' USING ERRCODE='42501'/);
  assert.ok(commit.indexOf('expired_before_commit') < commit.indexOf('financial_reset_reopening_changed_before_commit'));
});
test('fresh next-day reopening preserves the immutable reset and original invoice dates', () => {
  const f = noBackupAuthorityFixture('2026-10-25'), opening = completedOpening().binding.reopening;
  const binding = { ...f.binding, reopening: { ...opening, execution_business_date: f.proof.businessDate } };
  assert.equal(f.binding.execution_business_date, '2026-10-24');
  assert.equal(f.binding.continuation_semantic.execution_business_date, '2026-10-24');
  assert.equal(f.binding.issue_date, '2026-10-01'); assert.equal(f.binding.continuation_semantic.leases[0].due_date, '2026-10-07');
  assert.equal(assertReopeningHostedBinding(f.packet, binding, f.postgresSemanticText), binding);
  assert.equal(validateNoBackupReopeningAuthority(f).executionBusinessDate, '2026-10-25');
});
test('date rollover never makes stale review dates or expired authority usable', () => {
  const f = noBackupAuthorityFixture('2026-10-25');
  f.receipt.executionBusinessDate = '2026-10-24';
  assert.throws(() => validateNoBackupReopeningAuthority(f), /no_backup_current_authority_required/);
  f.receipt.executionBusinessDate = '2026-10-25'; f.receipt.expiresAt = new Date(Date.now() - 1).toISOString();
  assert.throws(() => validateNoBackupReopeningAuthority(f), /no_backup_current_authority_required/);
});
test('held-transaction regression uses actual checked opening and verifies complete rollback', async () => {
  const sql = await readFile(new URL('./fixtures/pilot-finance-reset-reopening-expiry.sql', import.meta.url), 'utf8');
  assert.match(sql, /pilot_reset_receipts_/);
  assert.match(sql, /app_private.reopen_financial_reset_checked\(f.binding,f.evidence_text\)/);
  assert.match(sql, /PERFORM pg_sleep\(hold_seconds\)/);
  assert.match(sql, /a.expires_at<=expiry_at\+interval '30 seconds'/);
  assert.match(sql, /a.credential_expires_at<=expiry_at\+interval '30 seconds'/);
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('consume_financial_reset_actor_authorization'));
  assert.match(sql, /reopening_expiry_sqlstate'='42501'/);
  assert.match(sql, /reopening_expiry_fixture_rollback_unproven/);
  assert.doesNotMatch(sql, /\bSET\s+(?:SESSION\s+AUTHORIZATION|ROLE)\b|\bDISABLE\s+TRIGGER\b|\bGRANT\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE)\s+(?:auth\.|app_private\.financial_reset_)/i);
});

function nativeCompletionFixture() {
  const { packet, binding, postgresSemanticText, observation, audit } = noBackupFixture(), history = [];
  for (const [index, action] of NO_BACKUP_FORWARD_ACTIONS.entries()) {
    const intent = { format: 'nestory-no-backup-action-intent-v1', operationId: binding.operation_id, packetSha256: packet.packetSha256,
      action, bindingSha256: digestJson(binding), authorizationId: action === 'execute' ? audit.databaseAudit.completion_authorization_id : id(300 + index),
      authoritySha256: d(index + 1), deletionScopeSha256: digestJson(noBackupDeletionScope(packet)),
      liveConsentSha256: packet.evidenceReferences.liveConsent.sha256, waiverSha256: packet.evidenceReferences.waiver.sha256,
      sourceObservationSha256: d('6'), previousIntentSha256: index === 0 ? null : digestJson(JSON.parse(history[index - 1].intentText)), sqlSha256: d('7') };
    const reconciliation = { format: 'nestory-no-backup-action-reconciliation-v1', operationId: binding.operation_id, packetSha256: packet.packetSha256,
      action, outcome: 'committed-evidence-matches', observationProvenanceVerified: false, mutationAllowed: false,
      mutationRetried: false, normalWritesReopened: false, originalIntentSha256: digestJson(intent),
      observationSha256: digestDatabaseJson(observation), authoritySha256: intent.authoritySha256,
      actionReceiptSha256: action === 'prepare' ? audit.databaseAudit.prepare_receipt_sha256 : action === 'seal' ? audit.databaseAudit.seal_receipt_sha256 : null,
      checkpointSha256: action === 'execute' ? observation.checkpoint.sha256 : null, runtimeGates: [...NO_BACKUP_RUNTIME_GATES] };
    history.push({ action, intentText: canonicalJson(intent), reconciliationText: canonicalJson(reconciliation) });
  }
  return { packet, binding, postgresSemanticText, observation, audit, history };
}
function changeNative(f, index, part, mutate) {
  const field = part === 'intent' ? 'intentText' : 'reconciliationText', value = JSON.parse(f.history[index][field]);
  mutate(value); f.history[index][field] = canonicalJson(value);
}
function relinkNative(f) {
  for (const [index, entry] of f.history.entries()) {
    const intent = JSON.parse(entry.intentText);
    intent.previousIntentSha256 = index === 0 ? null : digestJson(JSON.parse(f.history[index - 1].intentText));
    entry.intentText = canonicalJson(intent);
    changeNative(f, index, 'receipt', r => { r.originalIntentSha256 = digestJson(intent); r.authoritySha256 = intent.authoritySha256; });
  }
}

test('native completion preserves all exact stage bytes and never promotes evidence matching into provenance', async () => {
  const f = nativeCompletionFixture(), before = structuredClone(f), result = validateNoBackupCompletionHistory(f);
  assert.deepEqual(f, before); assert.equal(Object.isFrozen(result.history), true);
  assert.deepEqual(result.history.map(({ action, intentText, reconciliationText }) => ({ action, intentText, reconciliationText })), f.history);
  assert.equal(result.completionIntent.format, 'nestory-no-backup-action-intent-v1');
  assert.equal(result.completionReconciliation.format, 'nestory-no-backup-action-reconciliation-v1');
  assert.equal(result.completionReconciliation.outcome, 'committed-evidence-matches');
  assert.equal(result.authorityProvenanceVerified, false);
  assert.equal(result.completionReconciliation.observationProvenanceVerified, false);
  assert.deepEqual(result.completionReconciliation.runtimeGates, NO_BACKUP_RUNTIME_GATES);
  await assert.rejects(reopeningMutationSql(result, id(150)), /verified_provider_preparation_required/);
  await assert.rejects(reopeningMutationSql(structuredClone(result), id(150)), /verified_provider_preparation_required/);
  assert.throws(assertReopeningDispatchImplemented, /integration_incomplete/);
});

test('native completion requires every immediate predecessor in order, with its exact closed record shape', () => {
  for (const change of [f => { f.history.pop(); }, f => { f.history.shift(); }, f => { f.history.reverse(); },
    f => { f.history[2] = f.history[1]; }, f => { f.history[0].extra = true; }, f => { f.extra = true; },
    f => { f.history[2].intentText = null; }, f => { f.history[3].reconciliationText = {}; }]) {
    const f = nativeCompletionFixture(); change(f);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_history/);
  }
  for (const index of [0, 1, 2, 3, 4]) {
    const f = nativeCompletionFixture(); changeNative(f, index, 'intent', i => { i.previousIntentSha256 = d('0'); });
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('rehashing a foreign packet, binding, consent or deletion scope cannot make a native intent eligible', () => {
  for (const index of [0, 1, 2, 3, 4]) for (const change of [i => { i.operationId = id(900); }, i => { i.packetSha256 = d('0'); },
    i => { i.bindingSha256 = d('0'); }, i => { i.deletionScopeSha256 = d('0'); }, i => { i.waiverSha256 = d('0'); },
    i => { i.liveConsentSha256 = d('0'); }, i => { i.action = 'execute-recovery'; }, i => { i.extra = true; }]) {
    const f = nativeCompletionFixture(); changeNative(f, index, 'intent', change); relinkNative(f);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('native history rejects reused locators, wrong completion authority and invalid evidence digests', () => {
  for (const [index, change] of [[2, i => { i.authorizationId = id(300); }], [4, i => { i.authorizationId = id(999); }],
    [0, i => { i.authorizationId = 'not-a-locator'; }], [1, i => { i.authoritySha256 = true; }],
    [2, i => { i.sourceObservationSha256 = 'bad'; }], [3, i => { i.sqlSha256 = 'bad'; }]]) {
    const f = nativeCompletionFixture(); changeNative(f, index, 'intent', change); relinkNative(f);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('native receipts cannot claim authority, mutation or a legacy outcome', () => {
  for (const index of [0, 1, 2, 3, 4]) for (const change of [r => { r.outcome = 'committed-and-verified'; },
    r => { r.outcome = 'not-proven-do-not-retry'; }, r => { r.observationProvenanceVerified = true; },
    r => { r.mutationAllowed = true; }, r => { r.mutationRetried = true; }, r => { r.normalWritesReopened = true; },
    r => { r.runtimeGates = []; }, r => { r.extra = true; }, r => { delete r.observationProvenanceVerified; }]) {
    const f = nativeCompletionFixture(); changeNative(f, index, 'receipt', change);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('native receipts bind original intent, authority, real stage receipts and checked checkpoint', () => {
  for (const [index, change] of [[0, r => { r.originalIntentSha256 = d('0'); }], [1, r => { r.authoritySha256 = d('0'); }],
    [1, r => { r.observationSha256 = false; }], [2, r => { r.actionReceiptSha256 = d('0'); }],
    [3, r => { r.actionReceiptSha256 = null; }], [4, r => { r.checkpointSha256 = d('0'); }],
    [0, r => { r.actionReceiptSha256 = d('b'); }], [2, r => { r.checkpointSha256 = d('e'); }],
    [2, r => { r.operationId = id(999); }], [3, r => { r.packetSha256 = d('0'); }], [4, r => { r.action = 'seal'; }]]) {
    const f = nativeCompletionFixture(); changeNative(f, index, 'receipt', change);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('native history cannot substitute legacy formats or ambiguous journal bytes', () => {
  for (const change of [f => { changeNative(f, 4, 'intent', i => { i.format = 'nestory-hosted-reset-action-intent-v1'; }); relinkNative(f); },
    f => { changeNative(f, 4, 'receipt', r => { r.format = 'nestory-hosted-reset-action-reconciliation-v1'; }); },
    f => { f.history[0].intentText = ` ${f.history[0].intentText}`; },
    f => { f.history[1].reconciliationText = '{bad'; },
    f => { f.history[0].intentText = f.history[0].intentText.replace('{', '{"action":"freeze",'); }]) {
    const f = nativeCompletionFixture(); change(f);
    assert.throws(() => validateNoBackupCompletionHistory(f), /completion_journal_unproven/);
  }
});

test('native completion still requires the exact current frozen database audit', () => {
  for (const change of [f => { f.audit.archiveRowsValid = false; }, f => { f.audit.stageReceiptsValid = false; },
    f => { f.audit.databaseAudit.completion_authorization_id = id(900); }, f => { f.observation.control.status = 'open'; },
    f => { f.observation.checkpoint.currentImagesMatch = false; }, f => { f.observation.foreignSha256 = d('0'); },
    f => { delete f.postgresSemanticText; }]) {
    const f = nativeCompletionFixture(); change(f);
    assert.throws(() => validateNoBackupCompletionHistory(f), /reset_reopening_|no_backup_/);
  }
});

test('parsed fractional observation metadata stays separate from authoritative intent and database hashes', () => {
  const f = nativeCompletionFixture(); f.observation.zero.plan = { ownership_fraction: 0.333333 };
  assert.throws(() => digestJson(f.observation));
  const metadataSha256 = digestDatabaseJson(f.observation);
  assert.match(metadataSha256, /^[a-f0-9]{64}$/);
  const result = validateNoBackupCompletionHistory(f);
  assert.equal(result.authorityProvenanceVerified, false);
  assert.equal(result.completionIntent.bindingSha256, digestJson(f.binding));
  assert.equal(result.completionReconciliation.checkpointSha256, f.observation.checkpoint.sha256);
});

test('native preparation uses a real exclusive journal and preserves held dispatch', {
  skip: process.platform === 'win32' ? 'Strict directory fsync requires POSIX; no synthetic journal substitutes for it.' : false,
}, async t => {
  const parent = await realpath(path.resolve(import.meta.dirname, '../..'));
  const directory = await mkdtemp(path.join(parent, 'pilot-reset-native-reopening-test-'));
  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.match(path.basename(resolved), /^pilot-reset-native-reopening-test-/);
    await rm(resolved, { recursive: true });
  });
  const journalStore = await createExclusiveDirectoryStore({ directory, storeId: id(990) }), journal = createJsonJournal({ store: journalStore });
  const f = nativeCompletionFixture(); f.observation.zero.plan = { ownership_fraction: 0.333333 };
  const proof = validateNoBackupReopeningAudit(f), slot = `financial-reset/${f.binding.operation_id}/reopening/${f.binding.operation_id}`;
  const review = { format: 'nestory-no-backup-reset-reopening-review-v1', recoveryPolicy: NO_BACKUP_POLICY, requestId: id(200),
    operationId: f.binding.operation_id, originalOperationId: f.binding.operation_id, organizationId: f.binding.organization_id,
    packetSha256: f.packet.packetSha256, checkpointSha256: proof.checkpointSha256, afterSha256: proof.afterSha256,
    foreignSha256: proof.foreignSha256, generation: proof.generation, cutoff: f.binding.cutoff, executionBusinessDate: proof.businessDate };
  const reviewText = canonicalJson(review); await journal.putIfAbsent(`${slot}/review`, reviewText);
  for (const entry of f.history) {
    const prefix = `financial-reset/${f.binding.operation_id}/hosted-action/${entry.action}`;
    await journal.putIfAbsent(`${prefix}/intent`, entry.intentText); await journal.putIfAbsent(`${prefix}/receipt`, entry.reconciliationText);
  }
  const authority = noBackupAuthorityFixture().receipt; authority.reviewSha256 = hashBytes(reviewText);
  authority.expiresAt = new Date(Date.now() + 120000).toISOString(); let verificationCount = 0;
  const prepare = createNoBackupReopeningPreparation({ packet: f.packet, postgresSemanticText: f.postgresSemanticText, journalStore,
    verifyReopeningAuthority(input) {
      verificationCount++;
      assert.equal(input.completionHistoryProvenanceVerified, false);
      assert.equal(input.completionHistory.length, 5);
      assert.equal(input.completionReconciliation.outcome, 'committed-evidence-matches');
      return { ...authority, observedAt: new Date().toISOString() };
    } });
  const prepared = await prepare.prepare({ binding: f.binding, observation: f.observation, audit: f.audit });
  const context = { packet: f.packet, binding: f.binding, postgresSemanticText: f.postgresSemanticText, journalStore };
  assert.equal(assertPreparedReopening(prepared, context), prepared);
  assert.throws(() => assertPreparedReopening(JSON.parse(canonicalJson(prepared)), context), /verified_provider_preparation_required/);
  for (const changed of [
    { ...context, packet: { ...f.packet, packetSha256: d('0') } },
    { ...context, binding: { ...f.binding, operation_id: id(999) } },
    { ...context, postgresSemanticText: `${f.postgresSemanticText} ` },
    { ...context, journalStore: { ...journalStore } },
  ]) assert.throws(() => assertPreparedReopening(prepared, changed), /preparation_context_changed/);
  assert.equal(prepared.observationSha256, digestDatabaseJson(f.observation));
  const sql = await reopeningMutationSql(prepared, id(150));
  assert.match(sql, /reopen_financial_reset_checked/); assert.equal(verificationCount, 2);
  assert.throws(assertReopeningDispatchImplemented, /integration_incomplete/);
  await journal.putIfAbsent(`${slot}/intent`, canonicalJson({ fixture: 'another original attempt' }));
  await assert.rejects(reopeningMutationSql(prepared, id(150)), /existing_attempt_or_review_changed/);
});
