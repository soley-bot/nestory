// Offline synthetic protocol tests. No process, SQL, Auth session or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';
import { digestJson, digestDatabaseJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { NO_BACKUP_FORWARD_ACTIONS, NO_BACKUP_RUNTIME_GATES, noBackupDeletionScope, noBackupActionSlot, noBackupObservationQuery,
  prepareNoBackupAction, reconcileNoBackupAction, assertNoBackupTransportDispatchImplemented } from './pilot-finance-reset-no-backup-transport.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, d = c => c.repeat(64), copy = x => structuredClone(x);
const now = Date.parse('2026-10-24T04:00:00Z');
const sourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name =>
  [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const sources = Object.entries(sourceContents).map(([name, content]) => ({ path: name, sha256: hashSourceBytes(content) }));
const catalog = [{ kind: 'function', name: 'app_private.synthetic_only()', sha256: d('b') }];
const ledger = Object.entries(sourceContents).filter(([name]) => name.endsWith('.sql')).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => {
  const base = name.split('/').at(-1), body = bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/^[\t\n\r ;]+/, '');
  return { version: base.slice(0, 14), name: base.slice(15, -4), statements: [{ byteLength: Buffer.byteLength(body), sha256: hashBytes(body) }] };
});

function fixture(options = {}) {
  const invoice = { id: id(40), organization_id: NO_BACKUP_ORGANIZATION, lease_id: id(10), lease_term_id: id(11), billing_term_id: id(12),
    billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', issue_date: '2026-10-01', due_date: '2026-10-07',
    lifecycle: 'issued', voided_at: null, voided_by: null, currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', total: '1000.00' };
  const rowText = JSON.stringify(invoice), rowHash = hashBytes(rowText);
  const continuationPlan = { version: 3, actor_id: id(3), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(10), term_id: id(11), billing_rule_id: id(12), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', due_date: '2026-10-07' },
      { lease_id: id(30), term_id: id(31), billing_rule_id: id(32), disposition: 'defer-expired-unbilled', reason: 'renewal-unconfirmed', source_sha256: d('9') },
    ], original_invoice_sources: [{ lease_id: id(10), invoice_id: id(40), row_sha256: rowHash }] };
  const postgresSemanticText = JSON.stringify(continuationPlan, null, 1);
  const zeroPlan = { operation_id: id(1), organization_id: NO_BACKUP_ORGANIZATION, manifest_sha256: d('1'), reset_plan_sha256: d('2'),
    effective_date: '2026-10-01', maker_actor_id: id(3), reviewer_actor_id: options.zeroReviewerId ?? id(4), currencies: ['USD'], scopes: [
      { property_id: id(60), property_owner_id: id(61), owner_person_id: id(62), ownership_percent: 25.5,
        ownership_roster_hash: d('a'), property_row_sha256: d('b'), property_archived_at: null, currency: 'USD' },
    ] };
  // Synthetic PostgreSQL-style numeric lexeme. JSON.parse preserves the value
  // but JSON.stringify loses its scale; the reviewed raw byte hash must win.
  const zeroPlanText = JSON.stringify(zeroPlan, null, 1).replace('"ownership_percent": 25.5', '"ownership_percent": 25.50');
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(1), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07',
      executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: digestJson(catalog), ledgerSha256: digestJson(ledger), sourceSnapshotSha256: d('d'), foreignSnapshotSha256: d('e'), archiveRows: 1, actionCount: 1,
    databaseBinding: { manifestSha256: d('1'), planSha256: d('2'), archiveSha256: d('3'), actionSha256: d('4'),
      zeroReviewSha256: hashBytes(zeroPlanText), continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: d('7') },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, null])) };
  const packetInput = { review, sources, sourceContents, evidence: {}, candidateHead: review.operation.mainSha, observedBusinessDate: '2026-10-24' };
  const draft = prepareNoBackupPacket(packetInput), deletionScopeSha256 = digestJson(noBackupDeletionScope(draft));
  const waiver = { format: 'nestory-no-backup-waiver-v1', deletionScopeSha256, recoveryPolicy: NO_BACKUP_POLICY,
    decision: 'waive-external-backup-and-restore', acknowledgesUnrecoverableDeletion: true, issuedAt: '2026-10-24T03:00:00Z' };
  const consent = { format: 'nestory-no-backup-live-consent-v1', deletionScopeSha256, recoveryPolicy: NO_BACKUP_POLICY,
    decision: 'approve-exact-reset-deletion', issuedAt: '2026-10-24T03:30:00Z', validUntil: '2026-10-24T05:00:00Z' };
  const actorReview = { format: 'nestory-no-backup-actor-review-v1', operationId: review.operation.operationId,
    organizationId: review.operation.organizationId, deletionScopeSha256, zeroReviewSha256: review.databaseBinding.zeroReviewSha256,
    makerActorId: zeroPlan.maker_actor_id, reviewerActorId: zeroPlan.reviewer_actor_id, issuedAt: '2026-10-24T03:00:00Z' };
  options.waiver?.(waiver); options.consent?.(consent);
  options.actorReview?.(actorReview);
  const evidenceBytes = { waiver: canonicalJson(waiver), liveConsent: canonicalJson(consent), actorApprovals: options.actorReviewBytes ?? canonicalJson(actorReview),
    containmentProof: 'synthetic-only containment review', rehearsalProof: 'synthetic-only rehearsal review' };
  packetInput.evidence = evidenceBytes;
  review.evidenceReferences = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidenceBytes[role])]));
  const packet = prepareNoBackupPacket(packetInput), b = packet.databaseBinding, o = packet.operation;
  const operation = { operation_id: o.operationId, organization_id: o.organizationId, operation_kind: 'reset', restore_of: null,
    source_generation: 0, target_generation: 1, manifest_sha256: b.manifestSha256, plan_sha256: b.planSha256, schema_sha256: packet.schemaSha256,
    archive_sha256: b.archiveSha256, action_sha256: b.actionSha256, archive_count: 1, action_count: 1,
    audit_timestamp: '2026-10-24T03:59:00.123456Z', audit_actor: null };
  const rowAction = { action_id: id(50), ordinal: 1, relation_name: 'public.tenant_invoices', primary_key: { id: id(40) }, kind: 'archive-delete',
    before_row_text: rowText, after_row_text: null, before_sha256: rowHash, after_sha256: null, changed_columns: [] };
  const artifacts = { manifest: { manifest_sha256: b.manifestSha256, source_snapshot_sha256: packet.sourceSnapshotSha256,
    schema_sha256: packet.schemaSha256, ledger_sha256: packet.ledgerSha256 }, actions: { operation, actions: [rowAction] },
    archive: [{ relation_name: rowAction.relation_name, primary_key: rowAction.primary_key, row_text: rowText, row_sha256: rowHash }],
    zeroPlan, zeroPlanText, continuationPlan,
    reportPlan: { report_review_sha256: b.reportReviewSha256 } };
  const binding = hostedNoBackupBinding(packet, continuationPlan, postgresSemanticText);
  const observation = { catalog: copy(catalog), ledger: copy(ledger), businessDate: o.executionBusinessDate, timezone: o.timezone,
    sourceSha256: packet.sourceSnapshotSha256, foreignSha256: packet.foreignSnapshotSha256, control: null, reservation: null, reservationHashValid: null,
    recoveryReservation: null, recoveryCheckpoint: null, actionReceipt: null, operation: null, appliedCount: 0, archiveCount: 0, actionCount: 0,
    capabilityCount: 0, zero: null, continuation: null, phaseFences: [], approvalCount: 0, checkpoint: null, authorization: null };
  return { packet, artifacts, postgresSemanticText, sourceContents, evidenceBytes, binding, observation, previous: null };
}

function pending(stage) {
  return { authorizationId: id(100 + NO_BACKUP_FORWARD_ACTIONS.indexOf(stage)), actorId: id(3), status: 'pending', bindingMatches: true,
    backendPid: null, transactionId: null, expiresAt: '2026-10-24T04:04:00Z', observedAt: '2026-10-24T04:00:00Z' };
}
function authority(f, stage) {
  return { format: 'nestory-no-backup-execution-authority-v1', operationId: f.packet.operation.operationId, packetSha256: f.packet.packetSha256,
    bindingSha256: digestJson(f.binding), deletionScopeSha256: digestJson(noBackupDeletionScope(f.packet)), action: stage,
    issuedAt: '2026-10-24T03:59:00Z', validUntil: '2026-10-24T04:15:00Z',
    ...Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [`${role}Sha256`, f.packet.evidenceReferences[role].sha256])) };
}
function preparationRequest(f, stage) {
  const observation = copy(f.observation); observation.authorization = pending(stage); observation.actionReceipt = null;
  return { packet: f.packet, artifacts: f.artifacts, postgresSemanticText: f.postgresSemanticText, sourceContents: f.sourceContents,
    action: stage, authorizationId: observation.authorization.authorizationId, observation, previous: f.previous,
    authorityText: canonicalJson(authority(f, stage)), evidenceBytes: f.evidenceBytes, now, existingIntent: null };
}

function commitEvidence(f, stage, prepared, before) {
  const observed = copy(before), index = NO_BACKUP_FORWARD_ACTIONS.indexOf(stage), tx = { backendPid: 81 + index, transactionId: String(12345 + index) };
  observed.authorization = { ...pending(stage), status: 'consumed', ...tx };
  if (stage === 'freeze') {
    observed.control = { status: 'frozen', generation: 1, cutoff: '2026-10-01' };
    observed.reservation = { binding: copy(f.binding), bindingSha256: d('8'), foreignSha256: f.packet.foreignSnapshotSha256, ...tx };
    observed.reservationHashValid = true;
  }
  if (stage === 'checkpoint') observed.recoveryCheckpoint = { bindingSha256: d('8'), sourceSha256: f.packet.sourceSnapshotSha256,
    foreignSha256: f.packet.foreignSnapshotSha256, authoritySha256: prepared.intent.authoritySha256, ...tx };
  if (['prepare', 'seal'].includes(stage)) {
    observed.operation = { ...copy(f.artifacts.actions.operation), status: stage === 'prepare' ? 'prepared' : 'sealed' };
    observed.archiveCount = 1; observed.actionCount = 1;
    if (stage === 'seal') {
      observed.zero = { status: 'prepared', reviewSha256: f.binding.zero_review_sha256, planSha256: f.binding.zero_review_sha256, plan: copy(f.artifacts.zeroPlan) };
      observed.approvalCount = 2;
    }
    observed.actionReceipt = { operationId: f.binding.operation_id, organizationId: f.binding.organization_id, action: stage,
      binding: copy(f.binding), bindingSha256: d('8'), authorizationId: prepared.intent.authorizationId, authoritySha256: prepared.intent.authoritySha256,
      actorId: id(3), ...tx, sha256: d('a'), hashValid: true, result: { version: 1, action: stage, operation: copy(observed.operation),
        appliedCount: 0, archiveCount: 1, actionCount: 1, archiveSha256: f.binding.archive_sha256, actionSha256: f.binding.action_sha256,
        zero: copy(observed.zero) } };
  }
  if (stage === 'execute') {
    observed.operation = { ...copy(f.artifacts.actions.operation), status: 'actions_complete', execution_backend: tx.backendPid, execution_xid: tx.transactionId };
    observed.appliedCount = 1; observed.zero = { ...observed.zero, status: 'complete', ...tx };
    observed.continuation = { status: 'complete', semantic: copy(f.artifacts.continuationPlan), reviewSha256: d('9') };
    observed.phaseFences = ['known-zero', 'continuation', 'reports'].map(phase => ({ phase, ...tx }));
    observed.sourceSha256 = d('f');
    observed.checkpoint = { kind: 'checked-reports', generation: 1, sha256: d('9'), hashValid: true, currentImagesMatch: true, ...tx,
      result: { after_sha256: observed.sourceSha256, report_review_sha256: f.binding.report_review_sha256,
        continuation_semantic_sha256: f.binding.continuation_semantic_sha256, reports_persisted: true, control_reopened: false,
        close_published: false, billing_complete: false, deferred_lease_count: 1 } };
  }
  return observed;
}

function advance(f, stage) {
  const request = preparationRequest(f, stage), prepared = prepareNoBackupAction(request), prior = f.previous;
  const observed = commitEvidence(f, stage, prepared, request.observation);
  f.previous = { intent: prepared.intent, observation: observed }; f.observation = observed;
  return { request, prepared, observed, prior };
}
function atStage(stage, options) {
  const f = fixture(options);
  for (const previous of NO_BACKUP_FORWARD_ACTIONS.slice(0, NO_BACKUP_FORWARD_ACTIONS.indexOf(stage))) advance(f, previous);
  return f;
}
function reconcileRequest(f, stage, step) {
  return { packet: f.packet, artifacts: f.artifacts, postgresSemanticText: f.postgresSemanticText, sourceContents: f.sourceContents,
    action: stage, intent: step.prepared.intent, observation: step.observed, previous: step.prior };
}

test('all five stages produce fixed transaction SQL and reconcile matching same-DB evidence while dispatch stays held', () => {
  const f = fixture();
  for (const stage of NO_BACKUP_FORWARD_ACTIONS) {
    const step = advance(f, stage), p = step.prepared;
    assert.equal(p.executionSupported, false); assert.equal(p.authorityProvenanceVerified, false);
    assert.deepEqual(p.runtimeGates, NO_BACKUP_RUNTIME_GATES);
    assert.match(p.sql, /^BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;/);
    assert.match(p.sql, /pg_advisory_xact_lock/); assert.match(p.sql, /consume_financial_reset_actor_authorization/);
    assert.match(p.sql, /"version":2/); assert.match(p.sql, /"archive_artifact_sha256":null/); assert.match(p.sql, /COMMIT;$/);
    if (stage === 'seal') assert.ok(p.sql.includes(f.artifacts.zeroPlanText), 'seal must preserve exact reviewed raw zero-plan text');
    assert.doesNotMatch(p.sql, /set_config\('request\.jwt|prepare_financial_reset_recovery|reserve_financial_reset_hosted_recovery/);
    const result = reconcileNoBackupAction(reconcileRequest(f, stage, step));
    assert.equal(result.outcome, 'committed-evidence-matches'); assert.equal(result.observationProvenanceVerified, false);
    assert.equal(result.mutationAllowed, false); assert.equal(result.mutationRetried, false); assert.equal(result.normalWritesReopened, false);
  }
  assert.throws(assertNoBackupTransportDispatchImplemented, /hosted_transport_integration_incomplete/);
  assert.equal(f.observation.checkpoint.result.billing_complete, false);
});

test('fixed observation reads current and immediate prior proof in one read-only transaction', () => {
  for (const stage of NO_BACKUP_FORWARD_ACTIONS) {
    const f = atStage(stage), query = noBackupObservationQuery({ packet: f.packet, binding: f.binding, postgresSemanticText: f.postgresSemanticText,
      action: stage, authorizationId: pending(stage).authorizationId, previousIntent: f.previous?.intent ?? null });
    assert.equal(query.observationCount, stage === 'freeze' ? 1 : 2);
    assert.equal((query.text.match(/BEGIN TRANSACTION/g) ?? []).length, 1);
    assert.equal((query.text.match(/COMMIT;/g) ?? []).length, 1);
    assert.match(query.text, /REPEATABLE READ READ ONLY/); assert.match(query.text, /reservationHashValid/);
    assert.doesNotMatch(query.text, /consume_financial_reset_actor_authorization|archive_financial_reset_rows/);
  }
});

test('every future, recovery, export and reopen selector is refused by the forward protocol', () => {
  const f = fixture();
  for (const stage of ['reopen', 'prepare-recovery', 'execute-recovery', 'backup', 'export', 'restore', 'drop-all']) {
    assert.throws(() => prepareNoBackupAction({ ...preparationRequest(f, 'freeze'), action: stage }), /action_unsupported/);
  }
  const request = preparationRequest(f, 'freeze');
  assert.throws(() => prepareNoBackupAction({ ...request, sql: 'caller SQL' }), /preparation_shape_invalid/);
  assert.throws(() => prepareNoBackupAction({ ...request, runtime: { assertCurrent: () => true } }), /preparation_shape_invalid/);
});

test('waiver is not final deletion consent; both exact documents are required with their original bytes', () => {
  for (const options of [{ consent: c => { c.decision = 'waive-backup'; } }, { consent: c => { c.deletionScopeSha256 = d('f'); } },
    { consent: c => { c.validUntil = '2026-10-24T04:00:00Z'; } }, { consent: c => { c.issuedAt = '2026-10-24T04:01:00Z'; } },
    { waiver: w => { w.acknowledgesUnrecoverableDeletion = false; } }, { waiver: w => { w.deletionScopeSha256 = d('f'); } }]) {
    const f = fixture(options);
    assert.throws(() => prepareNoBackupAction(preparationRequest(f, 'freeze')), /consent|waiver/);
  }
  const request = preparationRequest(fixture(), 'freeze'); request.evidenceBytes = { ...request.evidenceBytes, liveConsent: d('a') };
  assert.throws(() => prepareNoBackupAction(request), /evidence_bytes_changed/);
});

test('authority must be a current exact action document, not a hash or optimistic readiness object', () => {
  for (const change of [a => { a.validUntil = '2026-10-24T04:00:00Z'; }, a => { a.validUntil = '2026-10-24T05:01:00Z'; },
    a => { a.issuedAt = '2026-10-24T04:01:00Z'; }, a => { a.action = 'execute'; }, a => { a.packetSha256 = d('f'); },
    a => { a.bindingSha256 = d('f'); }, a => { a.containmentProofSha256 = d('f'); }, a => { a.verified = true; }]) {
    const f = fixture(), request = preparationRequest(f, 'freeze'), a = authority(f, 'freeze'); change(a); request.authorityText = canonicalJson(a);
    assert.throws(() => prepareNoBackupAction(request), /authority_scope_or_expiry_invalid/);
  }
  const request = preparationRequest(fixture(), 'freeze'); request.authorityText = d('a');
  assert.throws(() => prepareNoBackupAction(request), /authority_invalid/);
});

test('current genuine authorization must be pending, exact actor/binding, fresh and unexpired', () => {
  for (const change of [a => { a.status = 'consumed'; }, a => { a.status = 'revoked'; }, a => { a.status = 'expired'; },
    a => { a.bindingMatches = false; }, a => { a.actorId = id(999); }, a => { a.backendPid = 81; },
    a => { a.transactionId = '123'; }, a => { a.expiresAt = '2026-10-24T04:00:00Z'; },
    a => { a.observedAt = '2026-10-24T03:59:00Z'; }, a => { a.expiresAt = '2026-10-24T05:00:00Z'; }]) {
    const request = preparationRequest(fixture(), 'freeze'); change(request.observation.authorization);
    assert.throws(() => prepareNoBackupAction(request), /current_genuine_authorization_required/);
  }
});

test('source/schema/ledger/foreign drift and any leaked capability stop preparation', () => {
  for (const change of [o => { o.catalog[0].sha256 = d('f'); }, o => { o.ledger.pop(); }, o => { o.sourceSha256 = d('f'); },
    o => { o.foreignSha256 = d('f'); }, o => { o.capabilityCount = 1; }, o => { o.timezone = 'UTC'; },
    o => { o.businessDate = '2026-10-25'; }, o => { o.recoveryReservation = {}; }]) {
    const request = preparationRequest(fixture(), 'freeze'); change(request.observation);
    assert.throws(() => prepareNoBackupAction(request));
  }
  const request = preparationRequest(fixture(), 'freeze'); request.sourceContents = { ...request.sourceContents,
    'scripts/pilot-finance-reset-no-backup-transport.mjs': Buffer.from('// changed') };
  assert.throws(() => prepareNoBackupAction(request), /source_bytes_changed/);
});

test('a changed migration cannot be hidden by recomputing only the observed ledger digest', () => {
  const request = preparationRequest(fixture(), 'freeze');
  request.observation.ledger[0].statements[0].sha256 = d('f');
  assert.throws(() => prepareNoBackupAction(request), /installed_schema_or_ledger_changed/);
});

test('exact same-tenant row images remain mandatory without an external backup', () => {
  const request = preparationRequest(fixture(), 'freeze'); request.artifacts = copy(request.artifacts);
  request.artifacts.archive[0].row_text = request.artifacts.archive[0].row_text.replace(NO_BACKUP_ORGANIZATION, id(999));
  request.artifacts.archive[0].row_sha256 = hashBytes(request.artifacts.archive[0].row_text);
  assert.throws(() => prepareNoBackupAction(request), /archive_scope_invalid/);
});

test('there is exactly one immediate prior stage; skipped, missing or wrong-session proof is refused', () => {
  for (const stage of NO_BACKUP_FORWARD_ACTIONS.slice(1)) {
    const f = atStage(stage), request = preparationRequest(f, stage);
    assert.throws(() => prepareNoBackupAction({ ...request, previous: null }), /immediate_previous_stage_required/);
    const wrong = copy(request); wrong.previous.intent.action = stage;
    assert.throws(() => prepareNoBackupAction(wrong), /original_intent_mismatch/);
    const session = copy(request); session.previous.observation.authorization.transactionId = '999';
    assert.throws(() => prepareNoBackupAction(session), /previous_stage_not_proven/);
  }
});

test('execute additionally requires two independent approvals and the exact sealed zero plan', () => {
  for (const change of [o => { o.approvalCount = 1; }, o => { o.zero.status = 'complete'; }, o => { o.zero.planSha256 = d('f'); },
    o => { o.zero.plan.reviewer_actor_id = id(999); }, o => { o.operation.status = 'prepared'; }]) {
    const request = preparationRequest(atStage('execute'), 'execute'); change(request.observation);
    assert.throws(() => prepareNoBackupAction(request), /approvals|stage_precondition/);
  }
});

test('predeclared actor review stays immutable through seal and cannot replace later genuine DB approvals', () => {
  const f = fixture(), originalPacket = copy(f.packet), review = JSON.parse(f.evidenceBytes.actorApprovals);
  assert.equal(review.format, 'nestory-no-backup-actor-review-v1'); assert.equal(Object.hasOwn(review, 'packetSha256'), false);
  assert.equal(review.makerActorId, f.artifacts.zeroPlan.maker_actor_id); assert.equal(review.reviewerActorId, f.artifacts.zeroPlan.reviewer_actor_id);
  for (const stage of ['freeze', 'checkpoint', 'prepare', 'seal']) {
    const step = advance(f, stage);
    assert.equal(step.prepared.authorityProvenanceVerified, false); assert.equal(step.prepared.executionSupported, false);
    assert.deepEqual(f.packet, originalPacket);
  }
  const request = preparationRequest(f, 'execute'); request.observation.approvalCount = 0;
  assert.throws(() => prepareNoBackupAction(request), /independent_approvals_required/);
  assert.deepEqual(f.packet, originalPacket);
});

for (const [name, change] of [
  ['future approval receipt', a => { a.format = 'nestory-zero-approval-receipt-v1'; }],
  ['different operation', a => { a.operationId = id(999); }],
  ['foreign organization', a => { a.organizationId = id(999); }],
  ['different deletion scope', a => { a.deletionScopeSha256 = d('f'); }],
  ['different zero plan', a => { a.zeroReviewSha256 = d('f'); }],
  ['unassigned maker', a => { a.makerActorId = id(999); }],
  ['unassigned reviewer', a => { a.reviewerActorId = id(999); }],
  ['future review', a => { a.issuedAt = '2026-10-24T05:00:00Z'; }],
  ['caller readiness claim', a => { a.approved = true; }],
]) test(`predeclared actor evidence rejects ${name} even with matching packet reference bytes`, () => {
  assert.throws(() => prepareNoBackupAction(preparationRequest(fixture({ actorReview: change }), 'freeze')), /actor_review_scope_invalid/);
});

test('an arbitrary actor reference digest is not accepted as a structured assignment review', () => {
  assert.throws(() => prepareNoBackupAction(preparationRequest(fixture({ actorReviewBytes: 'synthetic arbitrary bytes' }), 'freeze')), /actor_review_invalid/);
});

test('an approval count cannot stand in for two distinct reviewed actors', () => {
  const request = preparationRequest(fixture({ zeroReviewerId: id(3) }), 'freeze');
  assert.throws(() => prepareNoBackupAction(request), /independent_actor_review_invalid/);
});

test('zero-plan decimal scale is bound to raw PostgreSQL bytes, not JavaScript reserialization', () => {
  const f = atStage('seal'), request = preparationRequest(f, 'seal');
  assert.equal(f.artifacts.zeroPlan.scopes[0].ownership_percent, 25.5);
  assert.match(f.artifacts.zeroPlanText, /"ownership_percent": 25\.50/);
  assert.equal(f.packet.databaseBinding.zeroReviewSha256, hashBytes(f.artifacts.zeroPlanText));
  assert.notEqual(f.packet.databaseBinding.zeroReviewSha256, hashBytes(JSON.stringify(f.artifacts.zeroPlan)));
  const rewritten = copy(request); rewritten.artifacts.zeroPlanText = JSON.stringify(rewritten.artifacts.zeroPlan);
  assert.throws(() => prepareNoBackupAction(rewritten), /zero_plan_text/);
  const mismatch = copy(request); mismatch.artifacts.zeroPlan.scopes[0].ownership_percent = 25.75;
  assert.throws(() => prepareNoBackupAction(mismatch), /zero_plan_text/);
  const missing = copy(request); delete missing.artifacts.zeroPlanText;
  assert.throws(() => prepareNoBackupAction(missing), /forward_artifact_shape_invalid/);
});

test('fractional observation metadata digests remain separate from reviewed PostgreSQL zero-plan hashes', () => {
  const f = atStage('execute'), request = preparationRequest(f, 'execute'), prepared = prepareNoBackupAction(request);
  assert.equal(prepared.intent.sourceObservationSha256, digestDatabaseJson(request.observation));
  assert.equal(request.observation.zero.plan.scopes[0].ownership_percent, 25.5);
  const observed = commitEvidence(f, 'execute', prepared, request.observation);
  const result = reconcileNoBackupAction({ packet: f.packet, artifacts: f.artifacts, postgresSemanticText: f.postgresSemanticText,
    sourceContents, action: 'execute', intent: prepared.intent, observation: observed, previous: f.previous });
  assert.equal(result.observationSha256, digestDatabaseJson(observed));
  assert.equal(result.outcome, 'committed-evidence-matches');
  assert.equal(observed.zero.planSha256, hashBytes(f.artifacts.zeroPlanText));
});

test('unknown outcomes never become a replay, even when a command could have rolled back', () => {
  const f = fixture(), request = preparationRequest(f, 'freeze'), prepared = prepareNoBackupAction(request);
  const result = reconcileNoBackupAction({ packet: f.packet, artifacts: f.artifacts, postgresSemanticText: f.postgresSemanticText,
    sourceContents, action: 'freeze', intent: prepared.intent, observation: request.observation, previous: null });
  assert.equal(result.outcome, 'not-proven-do-not-retry'); assert.equal(result.mutationRetried, false); assert.equal(result.mutationAllowed, false);
  assert.throws(() => prepareNoBackupAction({ ...request, existingIntent: prepared.intent }), /existing_attempt_reconcile_required/);
  const committed = commitEvidence(f, 'freeze', prepared, request.observation); committed.authorization = pending('freeze');
  assert.throws(() => prepareNoBackupAction({ ...request, observation: committed }), /freeze_precondition_failed/);
});

test('prepare/seal acknowledgments require exact consumed transaction, authority and immutable result hashes', () => {
  for (const stage of ['prepare', 'seal']) for (const change of [o => { o.actionReceipt = null; },
    o => { o.actionReceipt.transactionId = '999'; }, o => { o.actionReceipt.authoritySha256 = d('f'); },
    o => { o.actionReceipt.hashValid = false; }, o => { o.actionReceipt.result.actionCount++; },
    o => { o.authorization.status = 'pending'; }, o => { o.authorization.actorId = id(999); }]) {
    const f = atStage(stage), step = advance(f, stage), request = reconcileRequest(f, stage, step); change(request.observation);
    assert.equal(reconcileNoBackupAction(request).outcome, 'not-proven-do-not-retry');
  }
});

test('completed row actions alone do not prove checked zero, continuation and report completion', () => {
  for (const change of [o => { o.checkpoint = null; }, o => { o.checkpoint.currentImagesMatch = false; },
    o => { o.checkpoint.hashValid = false; }, o => { o.checkpoint.transactionId = '999'; },
    o => { o.checkpoint.result.reports_persisted = false; }, o => { o.checkpoint.result.control_reopened = true; },
    o => { o.checkpoint.result.close_published = true; }, o => { o.checkpoint.result.report_review_sha256 = d('f'); },
    o => { o.zero.status = 'prepared'; }, o => { o.zero.transactionId = '999'; }, o => { o.continuation.status = 'prepared'; },
    o => { o.phaseFences[0].phase = 'reports'; }, o => { o.phaseFences[1].transactionId = '999'; },
    o => { o.operation.execution_xid = '999'; }, o => { o.authorization.authorizationId = id(999); }]) {
    const f = atStage('execute'), step = advance(f, 'execute'), request = reconcileRequest(f, 'execute', step); change(request.observation);
    assert.equal(reconcileNoBackupAction(request).outcome, 'not-proven-do-not-retry');
  }
});

test('reconciliation preserves original intent and immediate predecessor instead of minting a replacement', () => {
  const f = atStage('prepare'), step = advance(f, 'prepare');
  const changed = reconcileRequest(f, 'prepare', step); changed.intent = { ...changed.intent, authorizationId: id(999) };
  assert.equal(reconcileNoBackupAction(changed).outcome, 'not-proven-do-not-retry');
  const prior = reconcileRequest(f, 'prepare', step); prior.intent = { ...prior.intent, previousIntentSha256: d('f') };
  assert.equal(reconcileNoBackupAction(prior).outcome, 'not-proven-do-not-retry');
  const wrongPacket = reconcileRequest(f, 'prepare', step); wrongPacket.intent = { ...wrongPacket.intent, packetSha256: d('f') };
  assert.throws(() => reconcileNoBackupAction(wrongPacket), /original_intent_mismatch/);
  assert.equal(noBackupActionSlot(f.packet, 'prepare'), `financial-reset/${f.packet.operation.operationId}/hosted-action/prepare`);
});

test('consumed historical authority is receipt evidence only and never revives mutation authority', () => {
  const f = fixture(), step = advance(f, 'freeze'), request = reconcileRequest(f, 'freeze', step);
  request.observation.authorization.expiresAt = '2026-10-24T03:00:00Z';
  assert.equal(reconcileNoBackupAction(request).outcome, 'committed-evidence-matches');
  assert.throws(assertNoBackupTransportDispatchImplemented, /integration_incomplete/);
});
