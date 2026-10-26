// Pure synthetic policy and held-entrypoint checks. No private file, Auth or DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';
import { noBackupDeletionScope, NO_BACKUP_RUNTIME_GATES } from './pilot-finance-reset-no-backup-transport.mjs';
import { validateNoBackupCompletionHistory, validateNoBackupReopeningAudit } from './pilot-finance-reset-reopening-protocol.mjs';
import { parseHostedWorkflowArguments, assertHostedConfiguration, assertNoBackupRuntimeEvidence,
  validateNoBackupReopeningRuntimeEvidence, RESET_REPOSITORY, RESET_PERSISTENT_ROOT } from './pilot-finance-reset-hosted-workflow-core.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, d = c => c.repeat(64);
const bytes = v => Buffer.from(canonicalJson(v)), digest = v => hashBytes(canonicalJson(v));
const actions = ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'];
const cli = input => ['action', 'operation-id', 'packet-sha256', 'descriptors-sha256', 'authority-sha256', 'authorization-id', 'reconcile-action']
  .flatMap(name => [`--${name}`, input[name]]);

function fixture() {
  const now = Date.now(), date = offset => new Date(now + offset).toISOString();
  const semantic = { version: 3, actor_id: id(3), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(10), term_id: id(11), billing_rule_id: id(12), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', due_date: '2026-10-07' },
    ], original_invoice_sources: [{ lease_id: id(10), invoice_id: id(14), row_sha256: d('a') }] };
  const postgresSemanticText = JSON.stringify(semantic, null, 1);
  const sourceContents = Object.fromEntries(NO_BACKUP_REQUIRED_SOURCE_FILES.map(name => [name, Buffer.from(`synthetic-only ${name}`)]));
  const references = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, `synthetic-only ${role}`]));
  const preparationReview = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(1), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07',
      executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: d('c'), ledgerSha256: d('b'), sourceSnapshotSha256: d('d'), foreignSnapshotSha256: d('e'), archiveRows: 9, actionCount: 9,
    databaseBinding: { manifestSha256: d('1'), planSha256: d('2'), archiveSha256: d('3'), actionSha256: d('4'), zeroReviewSha256: d('5'),
      continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: d('7') },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(references[role])])) };
  const packet = prepareNoBackupPacket({ review: preparationReview, sources: Object.entries(sourceContents).map(([name, content]) =>
    ({ path: name, sha256: hashSourceBytes(content) })), sourceContents, evidence: references,
    candidateHead: preparationReview.operation.mainSha, observedBusinessDate: '2026-10-24' });
  const binding = hostedNoBackupBinding(packet, semantic, postgresSemanticText), tx = { backendPid: 81, transactionId: '12345' };
  const observation = { businessDate: '2026-10-25', timezone: binding.timezone, foreignSha256: packet.foreignSnapshotSha256,
    control: { status: 'frozen', generation: 1, cutoff: '2026-10-01' },
    operation: { operation_id: id(1), organization_id: NO_BACKUP_ORGANIZATION, operation_kind: 'reset', restore_of: null,
      status: 'actions_complete', target_generation: 1, action_count: 9, execution_backend: tx.backendPid, execution_xid: tx.transactionId },
    appliedCount: 9, actionCount: 9, capabilityCount: 0,
    reservation: { binding, bindingSha256: d('8'), foreignSha256: packet.foreignSnapshotSha256 },
    recoveryCheckpoint: { bindingSha256: d('8'), sourceSha256: packet.sourceSnapshotSha256, foreignSha256: packet.foreignSnapshotSha256 },
    authorization: { authorizationId: id(104), actorId: id(3), status: 'consumed', bindingMatches: true, ...tx },
    zero: { status: 'complete', reviewSha256: binding.zero_review_sha256, plan: { scopes: [{ ownership_percent: 25.5 }] } },
    continuation: { status: 'complete', semantic }, phaseFences: ['known-zero', 'continuation', 'reports'].map(phase => ({ phase, ...tx })),
    checkpoint: { kind: 'checked-reports', generation: 1, sha256: d('9'), hashValid: true, currentImagesMatch: true, ...tx,
      result: { after_sha256: d('f'), report_review_sha256: binding.report_review_sha256, continuation_semantic_sha256: binding.continuation_semantic_sha256,
        reports_persisted: true, control_reopened: false, close_published: false, billing_complete: false } } };
  const audit = { operationId: id(1), organizationId: NO_BACKUP_ORGANIZATION, bindingSha256: d('8'), checkpointSha256: d('9'),
    archiveRowsValid: true, stageReceiptsValid: true,
    databaseAudit: { archive_count: 9, archive_sha256: binding.archive_sha256, action_count: 9, action_sha256: binding.action_sha256,
      prepare_receipt_sha256: d('a'), seal_receipt_sha256: d('b'), completion_authorization_id: id(104),
      completion_backend_pid: tx.backendPid, completion_transaction_id: tx.transactionId },
    completionAuthorization: { authorizationId: id(104), actorId: id(3), sessionId: id(4), hashValid: true, ...tx } };
  const history = [];
  for (const [index, action] of actions.entries()) {
    const intent = { format: 'nestory-no-backup-action-intent-v1', operationId: id(1), packetSha256: packet.packetSha256, action,
      bindingSha256: digest(binding), authorizationId: id(100 + index), authoritySha256: d('a'), deletionScopeSha256: digest(noBackupDeletionScope(packet)),
      liveConsentSha256: packet.evidenceReferences.liveConsent.sha256, waiverSha256: packet.evidenceReferences.waiver.sha256,
      sourceObservationSha256: d('b'), previousIntentSha256: index === 0 ? null : hashBytes(history.at(-1).intentText), sqlSha256: d('c') };
    const receipt = { format: 'nestory-no-backup-action-reconciliation-v1', operationId: id(1), packetSha256: packet.packetSha256, action,
      outcome: 'committed-evidence-matches', observationProvenanceVerified: false, mutationAllowed: false, mutationRetried: false,
      normalWritesReopened: false, originalIntentSha256: digest(intent), observationSha256: d('b'), authoritySha256: d('a'),
      actionReceiptSha256: action === 'prepare' ? d('a') : action === 'seal' ? d('b') : null,
      checkpointSha256: action === 'execute' ? d('9') : null, runtimeGates: [...NO_BACKUP_RUNTIME_GATES] };
    history.push({ action, intentText: canonicalJson(intent), reconciliationText: canonicalJson(receipt) });
  }
  const proof = validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText, observation, audit });
  const completion = validateNoBackupCompletionHistory({ packet, binding, postgresSemanticText, observation, audit, history });
  const review = { format: 'nestory-no-backup-reset-reopening-review-v1', recoveryPolicy: NO_BACKUP_POLICY, requestId: id(200),
    operationId: id(1), originalOperationId: id(1), organizationId: NO_BACKUP_ORGANIZATION, packetSha256: packet.packetSha256,
    checkpointSha256: d('9'), afterSha256: d('f'), foreignSha256: packet.foreignSnapshotSha256, generation: 1, cutoff: binding.cutoff,
    executionBusinessDate: proof.businessDate }, reviewText = canonicalJson(review), sessionAccessReviewBytes = Buffer.from('synthetic-only session source review');
  const provisioning = { format: 'nestory-reset-reviewed-no-backup-provisioning-v1', runnerId: 42, persistentRoot: RESET_PERSISTENT_ROOT,
    journalStoreId: id(2), validUntil: date(3600000), privateAccessReviewSha256: d('a'), crossRunDurabilityProofSha256: d('b') }, provisioningBytes = bytes(provisioning);
  const configuration = { format: 'nestory-protected-reset-runner-v2', recoveryPolicy: NO_BACKUP_POLICY, repository: RESET_REPOSITORY,
    projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, runnerId: 42, persistentRoot: RESET_PERSISTENT_ROOT,
    mountSourceSha256: d('a'), mountFilesystem: 'ext4', journalStoreId: id(2), psqlBinarySha256: d('a'), sslRootCertSha256: d('b'),
    provisioningSha256: hashBytes(provisioningBytes), connection: { expectedProjectRef: NO_BACKUP_PROJECT, host: `db.${NO_BACKUP_PROJECT}.supabase.co`,
      port: 5432, database: 'postgres', user: 'postgres', psqlPath: '/usr/bin/psql', sslRootCertPath: '/etc/nestory-reset/database-ca.pem', passwordFilePath: '/etc/nestory-reset/database.pgpass' },
    operations: [{ operationId: id(1), packetSha256: packet.packetSha256, descriptorsSha256: d('a'), authoritySha256: '', mainSha: packet.operation.mainSha,
      actions: [...actions, 'reopen'], reopening: { reviewSha256: hashBytes(reviewText), authoritySha256: '', sessionAccessReviewSha256: hashBytes(sessionAccessReviewBytes) } }] };
  const authority = { format: 'nestory-reset-reviewed-no-backup-runtime-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: id(1), packetSha256: packet.packetSha256, mainSha: packet.operation.mainSha, projectRef: NO_BACKUP_PROJECT,
    organizationId: NO_BACKUP_ORGANIZATION, actions, issuedAt: date(-3600000), validUntil: date(-1800000), evidenceReferences: packet.evidenceReferences,
    stageAuthorities: Object.fromEntries(actions.map(action => [action, d('a')])), provisioningSha256: configuration.provisioningSha256 }, authorityBytes = bytes(authority);
  configuration.operations[0].authoritySha256 = hashBytes(authorityBytes);
  const input = { action: 'reopen', 'operation-id': id(1), 'packet-sha256': packet.packetSha256, 'descriptors-sha256': d('a'),
    'authority-sha256': hashBytes(authorityBytes), 'authorization-id': 'none', 'reconcile-action': 'none' };
  const reopeningAuthority = { format: 'nestory-reset-reviewed-no-backup-reopening-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: id(1), packetSha256: packet.packetSha256, mainSha: packet.operation.mainSha, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
    reviewSha256: hashBytes(reviewText), bindingSha256: audit.bindingSha256, checkpointSha256: proof.checkpointSha256, afterSha256: proof.afterSha256,
    foreignSha256: proof.foreignSha256, executionBusinessDate: proof.businessDate, databaseAudit: audit.databaseAudit,
    completionHistorySha256: digest(history.map(entry => ({ action: entry.action, intentSha256: hashBytes(entry.intentText), reconciliationSha256: hashBytes(entry.reconciliationText) }))),
    actorId: id(3), sessionId: id(5), issuedAt: date(-1000), validUntil: date(60000), evidenceReferences: packet.evidenceReferences,
    provisioningSha256: configuration.provisioningSha256, sessionAccessReviewSha256: hashBytes(sessionAccessReviewBytes) };
  const reopeningAuthorityBytes = bytes(reopeningAuthority); configuration.operations[0].reopening.authoritySha256 = hashBytes(reopeningAuthorityBytes);
  const currentSession = { operationId: id(1), organizationId: NO_BACKUP_ORGANIZATION, projectRef: NO_BACKUP_PROJECT,
    packetSha256: packet.packetSha256, sourcesSha256: packet.sourcesSha256, schemaSha256: packet.schemaSha256, ledgerSha256: packet.ledgerSha256,
    baseBindingSha256: digest(binding), actorId: id(3), sessionId: id(5), observedAt: date(-1000), expiresAt: date(20000),
    credentialExpiresAt: date(300000), sessionNotAfter: null, stepUpExpiresAt: null };
  return { evidence: { configuration, input, packet, provisioning, authority, provisioningBytes, authorityBytes },
    authorityInput: { packet, binding, proof, review, databaseAudit: audit,
      journalMechanism: { kind: 'exclusive-file-and-directory-fsync', storeId: id(2) }, completionIntent: completion.completionIntent,
      completionReconciliation: completion.completionReconciliation, completionHistory: completion.history, completionHistoryProvenanceVerified: false },
    reopeningAuthority, reopeningAuthorityBytes, reviewText, sessionAccessReviewBytes, postgresSemanticText,
    databaseRead: { kind: 'reopening-audit', observation, audit, proof }, currentSession, now };
}
function reseal(f) { f.reopeningAuthorityBytes = bytes(f.reopeningAuthority); f.evidence.configuration.operations[0].reopening.authoritySha256 = hashBytes(f.reopeningAuthorityBytes); }

test('v2 reopening enrollment is separate; expired original authority supplies no current permission', () => {
  const f = fixture(), c = f.evidence.configuration;
  assertHostedConfiguration(c, digest(c), bytes(c));
  assert.deepEqual(parseHostedWorkflowArguments(cli(f.evidence.input)), f.evidence.input);
  assert.deepEqual(assertNoBackupRuntimeEvidence({ ...f.evidence, now: f.now }), { authoritySha256: c.operations[0].reopening.authoritySha256, requiresReopeningEvidence: true });
  for (const field of ['artifactStoreId', 'keyId']) assert.equal(Object.hasOwn(c, field), false);
  const forward = { ...f.evidence, input: { ...f.evidence.input, action: 'execute', 'authorization-id': id(104) }, now: f.now };
  assert.throws(() => assertNoBackupRuntimeEvidence(forward), /action_authority_unverified/);
  assert.throws(() => parseHostedWorkflowArguments(cli({ ...f.evidence.input, 'authorization-id': id(104) })), /arguments_invalid/);
});
test('fresh separately reviewed reopening binds raw native history, actual audit shape and current session', () => {
  const f = fixture(), receipt = validateNoBackupReopeningRuntimeEvidence(f);
  assert.equal(receipt.actorId, id(3)); assert.equal(receipt.sessionId, id(5));
  assert.equal(receipt.expiresAt, f.reopeningAuthority.validUntil); assert.equal(receipt.executionBusinessDate, '2026-10-25');
  assert.equal(f.authorityInput.binding.execution_business_date, '2026-10-24'); assert.equal(f.authorityInput.binding.issue_date, '2026-10-01');
  assert.equal(f.authorityInput.binding.continuation_semantic.leases[0].due_date, '2026-10-07');
  assert.equal(receipt.bindingSha256, d('8')); assert.notEqual(receipt.bindingSha256, f.currentSession.baseBindingSha256);
  assert.equal(f.authorityInput.completionReconciliation.observationProvenanceVerified, false);
});
for (const [name, mutate] of [
  ['foreign operation', f => { f.reopeningAuthority.operationId = id(99); }],
  ['foreign project', f => { f.reopeningAuthority.projectRef = 'foreign'; }],
  ['different base PG hash', f => { f.reopeningAuthority.bindingSha256 = f.currentSession.baseBindingSha256; }],
  ['different original history', f => { f.reopeningAuthority.completionHistorySha256 = d('0'); }],
  ['different reviewer document', f => { f.reopeningAuthority.reviewSha256 = d('0'); }],
  ['wrong execution day', f => { f.reopeningAuthority.executionBusinessDate = '2026-10-24'; }],
  ['expired new authority', f => { f.reopeningAuthority.validUntil = new Date(f.now - 1).toISOString(); }],
  ['future authority', f => { f.reopeningAuthority.issuedAt = new Date(f.now + 1).toISOString(); }],
  ['overlong new authority', f => { f.reopeningAuthority.validUntil = new Date(f.now + 300001).toISOString(); }],
  ['different current session', f => { f.currentSession.sessionId = id(4); }],
  ['stale current session', f => { f.currentSession.observedAt = new Date(f.now - 30001).toISOString(); }],
  ['expired credential', f => { f.currentSession.credentialExpiresAt = new Date(f.now - 1).toISOString(); }],
  ['earlier stepup expiry', f => { f.currentSession.stepUpExpiresAt = new Date(f.now + 10000).toISOString(); }],
  ['earlier session expiry', f => { f.currentSession.sessionNotAfter = new Date(f.now + 10000).toISOString(); }],
  ['stale inspection', f => { f.currentSession.expiresAt = new Date(f.now).toISOString(); }],
  ['scope-relabelled completion', f => { f.authorityInput.completionHistoryProvenanceVerified = true; }],
  ['changed native observation claim', f => { f.authorityInput.completionReconciliation = { ...f.authorityInput.completionReconciliation, outcome: 'committed-and-verified' }; }],
  ['missing predecessor', f => { f.authorityInput.completionHistory = f.authorityInput.completionHistory.slice(1); }],
  ['changed durable review bytes', f => { f.reviewText += ' '; }],
  ['missing session access review', f => { f.sessionAccessReviewBytes = Buffer.from('different'); }],
]) test(`fresh reopening refuses ${name} even if its synthetic authority hash is resealed`, () => {
  const f = fixture(); mutate(f); reseal(f); assert.throws(() => validateNoBackupReopeningRuntimeEvidence(f));
});
test('unreviewed reopening and all no-backup inverse enrollment remain refused', () => {
  for (const mutate of [c => { delete c.operations[0].reopening; }, c => { c.operations[0].reopening.extra = true; },
    c => { c.operations[0].actions.push('execute-recovery'); }, c => { c.operations[0].recovery = {}; }]) {
    const c = fixture().evidence.configuration; mutate(c); assert.throws(() => assertHostedConfiguration(c, digest(c), bytes(c)));
  }
});
test('public reopening invocation still stops before configuration, session, network or SQL', () => {
  const f = fixture();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./pilot-finance-reset-hosted-runner.mjs', import.meta.url)), ...cli(f.evidence.input)],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, env: { NODE_OPTIONS: '', NODE_PATH: '' } });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr.trim()), { status: 'stopped', code: 'hosted_transport_integration_incomplete', automaticRetryAllowed: false, preserveOriginalIntent: true });
});
test('receipt completion names an enrolled original stage and needs current protected authority', () => {
  const f = fixture(); f.evidence.input.action = 'complete-receipt'; f.evidence.input['reconcile-action'] = 'execute';
  assert.deepEqual(parseHostedWorkflowArguments(cli(f.evidence.input)), f.evidence.input);
  assert.throws(() => assertNoBackupRuntimeEvidence({ ...f.evidence, now: f.now }), /action_authority_unverified/);
  f.evidence.authority.validUntil = new Date(f.now + 60000).toISOString(); f.evidence.authorityBytes = bytes(f.evidence.authority);
  f.evidence.input['authority-sha256'] = hashBytes(f.evidence.authorityBytes);
  f.evidence.configuration.operations[0].authoritySha256 = f.evidence.input['authority-sha256'];
  assert.deepEqual(assertNoBackupRuntimeEvidence({ ...f.evidence, now: f.now }), { authoritySha256: f.evidence.input['authority-sha256'] });
  for (const target of ['none', 'complete-receipt', 'inspect', 'sql'])
    assert.throws(() => parseHostedWorkflowArguments(cli({ ...f.evidence.input, 'reconcile-action': target })), /arguments_invalid/);
  assert.throws(() => assertNoBackupRuntimeEvidence({ ...f.evidence, input: { ...f.evidence.input, 'reconcile-action': 'execute-recovery' }, now: f.now }));
  assert.throws(() => assertNoBackupRuntimeEvidence({ ...f.evidence, readAuthority: {}, now: f.now }));
});
test('public receipt completion retains the live hold and cannot be a read-only reconciliation', () => {
  const f = fixture(), input = { ...f.evidence.input, action: 'complete-receipt', 'reconcile-action': 'execute' };
  for (const [script, code] of [['hosted-runner', 'hosted_transport_integration_incomplete'], ['hosted-reconcile', 'hosted_workflow_historical_read_only']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(`./pilot-finance-reset-${script}.mjs`, import.meta.url)), ...cli(input)],
      { encoding: 'utf8', windowsHide: true, timeout: 10000, env: { NODE_OPTIONS: '', NODE_PATH: '' } });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr.trim()), { status: 'stopped', code, automaticRetryAllowed: false, preserveOriginalIntent: true });
  }
});
test('fixed v2 route precedes legacy archive/key reads and preserves the workflow single writer', async () => {
  const runner = await readFile(new URL('./pilot-finance-reset-hosted-runner.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pilot-financial-reset.yml', import.meta.url), 'utf8');
  const route = runner.indexOf('if (isNoBackupWorkflow(configuration))');
  assert.ok(route > 0 && route < runner.indexOf('assertOperatorPacket(packet)'));
  assert.ok(route < runner.indexOf('const artifactStore =') && route < runner.indexOf('let rawKey ='));
  assert.match(runner, /createNoBackupReopeningPreparation/); assert.match(runner, /assertNoBackupReopeningContext\(context\)/);
  assert.match(runner, /runtime\.dispatchReopening\(prepared\)/); assert.match(runner, /runtime\.reconcile\(\)/);
  assert.match(runner, /runtime\.finalizeReceipt\(\)/);
  assert.match(workflow, /group: production-supabase\s+cancel-in-progress: false/); assert.match(workflow, /environment: production-database/);
  assert.match(workflow, /github\.workflow_sha == github\.sha/); assert.match(workflow, /execute-recovery, reopen\]/);
  assert.doesNotMatch(workflow, /upload-artifact|supabase db push|--access-token|--sql/);
});
