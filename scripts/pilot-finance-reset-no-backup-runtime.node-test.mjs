// Offline process/filesystem simulations only. No protected files or credentials are read.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import nodeTest from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';
import { digestJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { ACTOR_SOURCE_FILES } from './pilot-finance-reset-hosted-actor.mjs';
import { NO_BACKUP_FORWARD_ACTIONS, noBackupDeletionScope, noBackupActionSlot,
  prepareNoBackupAction, reconcileNoBackupAction } from './pilot-finance-reset-no-backup-transport.mjs';
import { HOSTED_RUNTIME_SOURCE_FILES, RESET_WORKFLOW_PATH } from './pilot-finance-reset-hosted-workflow-core.mjs';
import { createNoBackupProtectedRuntime, createSyntheticNoBackupRuntimeForTests, assertNoBackupReopeningContext,
  validateNoBackupReopeningAuthorizationObservation, reconcileNoBackupReopeningAuthorizationObservation }
  from './pilot-finance-reset-no-backup-runtime.mjs';
const test = (name, run) => nodeTest(name, { concurrency: false }, async t => { t.mock.method(Date, 'now', () => now); await run(t); });
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, d = c => c.repeat(64), copy = x => structuredClone(x);
const now = Date.parse('2026-10-24T04:00:00Z');
// The simulated composition still uses the real actor source verifier. Pin its
// complete closure, including additive migrations inherited from the transport.
const sourceContents = Object.fromEntries(await Promise.all([...new Set([...NO_BACKUP_REQUIRED_SOURCE_FILES, ...HOSTED_RUNTIME_SOURCE_FILES, ...ACTOR_SOURCE_FILES, 'scripts/pilot-finance-reset-no-backup-runtime.mjs'])].map(async name =>
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
function reconcileRequest(f, stage, step) {
  return { packet: f.packet, artifacts: f.artifacts, postgresSemanticText: f.postgresSemanticText, sourceContents: f.sourceContents,
    action: stage, intent: step.prepared.intent, observation: step.observed, previous: step.prior };
}

const bytes = value => Buffer.from(typeof value === 'string' ? value : canonicalJson(value));
function harness(action = 'freeze', change = () => {}) {
  const f = fixture(), journalEntries = {};
  const selected = NO_BACKUP_FORWARD_ACTIONS.includes(action) ? action : 'freeze';
  for (const previous of NO_BACKUP_FORWARD_ACTIONS.slice(0, NO_BACKUP_FORWARD_ACTIONS.indexOf(selected))) {
    const step = advance(f, previous), prefix = noBackupActionSlot(f.packet, previous);
    journalEntries[`${prefix}/intent`] = canonicalJson(step.prepared.intent);
    journalEntries[`${prefix}/receipt`] = canonicalJson(reconcileNoBackupAction(reconcileRequest(f, previous, step)));
  }
  const request = preparationRequest(f, selected), prepared = prepareNoBackupAction(request);
  const after = commitEvidence(f, selected, prepared, request.observation);
  const operationRoot = `/var/lib/nestory-reset/operations/${f.packet.operation.operationId}`;
  const inputBytes = Object.fromEntries(['manifest', 'actions', 'archive', 'zeroPlan', 'continuationPlan', 'reportPlan'].map(role =>
    [role, bytes(role === 'zeroPlan' ? f.artifacts.zeroPlanText : f.artifacts[role])]));
  inputBytes.postgresSemantic = bytes(f.postgresSemanticText);
  const descriptors = { format: 'nestory-no-backup-reviewed-inputs-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: f.packet.operation.operationId, packetSha256: f.packet.packetSha256,
    inputs: Object.fromEntries(Object.entries(inputBytes).map(([role, value]) => [role, { sha256: hashBytes(value), bytes: value.length }])) };
  const accessReview = bytes({ synthetic: 'private-access-review' }), durabilityReview = bytes({ synthetic: 'cross-run-durability-review' });
  const provisioning = { format: 'nestory-reset-reviewed-no-backup-provisioning-v1', runnerId: 7,
    persistentRoot: '/var/lib/nestory-reset', journalStoreId: id(90), validUntil: '2026-10-25T04:00:00Z',
    privateAccessReviewSha256: hashBytes(accessReview), crossRunDurabilityProofSha256: hashBytes(durabilityReview) };
  const stageTexts = Object.fromEntries(NO_BACKUP_FORWARD_ACTIONS.map(stage => [stage, bytes(authority(f, stage))]));
  const runtimeAuthority = { format: 'nestory-reset-reviewed-no-backup-runtime-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: f.packet.operation.operationId, packetSha256: f.packet.packetSha256, mainSha: f.packet.operation.mainSha,
    projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, actions: [...NO_BACKUP_FORWARD_ACTIONS],
    issuedAt: '2026-10-24T03:30:00Z', validUntil: '2026-10-24T05:00:00Z', evidenceReferences: copy(f.packet.evidenceReferences),
    stageAuthorities: Object.fromEntries(Object.entries(stageTexts).map(([stage, text]) => [stage, hashBytes(text)])),
    provisioningSha256: hashBytes(bytes(provisioning)) };
  const connection = { expectedProjectRef: NO_BACKUP_PROJECT, host: `db.${NO_BACKUP_PROJECT}.supabase.co`, port: 5432,
    database: 'postgres', user: 'postgres', psqlPath: '/usr/bin/psql', sslRootCertPath: '/etc/nestory-reset/database-ca.pem',
    passwordFilePath: '/etc/nestory-reset/database.pgpass' };
  const client = bytes('synthetic psql bytes'), certificate = bytes('synthetic certificate bytes');
  const configuration = { format: 'nestory-protected-reset-runner-v2', recoveryPolicy: NO_BACKUP_POLICY,
    repository: 'soley-bot/nestory', projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, runnerId: 7,
    persistentRoot: '/var/lib/nestory-reset', mountFilesystem: 'ext4', mountSourceSha256: hashBytes('/dev/fixture-persistent'),
    journalStoreId: id(90), connection, psqlBinarySha256: hashBytes(client), sslRootCertSha256: hashBytes(certificate),
    provisioningSha256: hashBytes(bytes(provisioning)), operations: [{ operationId: f.packet.operation.operationId,
      packetSha256: f.packet.packetSha256, descriptorsSha256: hashBytes(bytes(descriptors)), authoritySha256: hashBytes(bytes(runtimeAuthority)),
      mainSha: f.packet.operation.mainSha, actions: [...NO_BACKUP_FORWARD_ACTIONS] }] };
  const input = { action, 'operation-id': f.packet.operation.operationId, 'packet-sha256': f.packet.packetSha256,
    'descriptors-sha256': configuration.operations[0].descriptorsSha256, 'authority-sha256': configuration.operations[0].authoritySha256,
    'authorization-id': NO_BACKUP_FORWARD_ACTIONS.includes(action) ? pending(action).authorizationId : 'none',
    'reconcile-action': action === 'reconcile' || action === 'complete-receipt' ? selected : 'none' };
  const files = new Map([
    ['/etc/nestory-reset/runner.json', bytes(configuration)], [`${operationRoot}/packet.json`, bytes(f.packet)],
    [`${operationRoot}/descriptors.json`, bytes(descriptors)], [`${operationRoot}/authority.json`, bytes(runtimeAuthority)],
    ['/var/lib/nestory-reset/provisioning.json', bytes(provisioning)],
    [`/var/lib/nestory-reset/proofs/${provisioning.privateAccessReviewSha256}.json`, accessReview],
    [`/var/lib/nestory-reset/proofs/${provisioning.crossRunDurabilityProofSha256}.json`, durabilityReview],
    ['/var/lib/nestory-reset/journal/store.json', bytes({ format: 'nestory-exclusive-store-v1', storeId: configuration.journalStoreId,
      writeProtocol: 'exclusive-file-and-directory-fsync' })],
    [connection.psqlPath, client], [connection.sslRootCertPath, certificate],
    ['/proc/self/mountinfo', bytes('42 1 8:2 / /var/lib/nestory-reset rw,relatime - ext4 /dev/fixture-persistent rw\n')],
    ...Object.entries(sourceContents).map(([name, value]) => [path.resolve(import.meta.dirname, '..', name), Buffer.from(value)]),
    ...Object.entries(inputBytes).map(([role, value]) => [`${operationRoot}/inputs/${role}.json`, value]),
    ...Object.entries(f.evidenceBytes).map(([role, value]) => [`${operationRoot}/evidence/${role}.json`, bytes(value)]),
    ...Object.entries(stageTexts).map(([stage, value]) => [`${operationRoot}/stages/${stage}-authority.json`, value]),
  ]);
  const identity = { database: 'postgres', sessionUser: 'postgres', readOnly: 'on' };
  const forward = observation => [identity, observation, ...(f.previous ? [f.previous.observation] : [])].map(JSON.stringify).join('\n') + '\n';
  const responses = [JSON.stringify(pending(selected)), JSON.stringify(pending(selected)), forward(request.observation), forward(after)];
  const calls = { reads: [], github: [], processes: [], stdin: [], git: [] };
  const environment = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'soley-bot/nestory', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: `soley-bot/nestory/${RESET_WORKFLOW_PATH}@refs/heads/main`, GITHUB_WORKFLOW_SHA: f.packet.operation.mainSha,
    GITHUB_SHA: f.packet.operation.mainSha, GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '1' };
  const run = { id: 12, run_attempt: 1, head_sha: f.packet.operation.mainSha, head_branch: 'main', event: 'workflow_dispatch',
    status: 'in_progress', path: RESET_WORKFLOW_PATH, repository: { full_name: 'soley-bot/nestory' } };
  const documents = { 'commits/main': { sha: f.packet.operation.mainSha }, 'actions/runs/12': run,
    'actions/runs/12/attempts/1/jobs?per_page=100': { total_count: 1, jobs: [{ name: 'Pilot financial reset', status: 'in_progress', runner_id: 7, run_id: 12, run_attempt: 1 }] },
    'environments/production-database': { name: 'production-database', protection_rules: [{ type: 'branch_policy' }],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }, 'branches?protected=true&per_page=100': [{ name: 'main' }] };
  const ports = {
    async readFile(filename, encoding) { calls.reads.push(filename); const value = files.get(filename); if (!value) throw Error('PRIVATE missing fixture'); return encoding ? value.toString(encoding) : Buffer.from(value); },
    async lstat(filename) { const file = files.has(filename) || filename === connection.passwordFilePath; return { uid: 1000, mode: filename === connection.psqlPath ? 0o755 : file ? 0o600 : 0o700,
      nlink: 1, ino: 1, dev: 1, size: files.get(filename)?.length ?? 1, mtimeMs: 0, ctimeMs: 0,
      isFile: () => file, isDirectory: () => !file, isSymbolicLink: () => false }; },
    async realpath(filename) { return filename; },
    async execFile(command, parameters) { calls.git.push({ command, parameters }); return { stdout: parameters[0] === 'rev-parse' ? f.packet.operation.mainSha + '\n' : '', stderr: '' }; },
    async fetch(url, options) {
      calls.github.push({ url, options }); const relative = url.replace('https://api.github.com/repos/soley-bot/nestory/', '');
      if (!Object.hasOwn(documents, relative)) throw Error('unexpected network target');
      const body = new ReadableStream({ start(controller) { controller.enqueue(bytes(documents[relative])); controller.close(); } });
      return { ok: true, redirected: false, url, headers: new Headers({ 'content-type': 'application/json' }), body };
    },
    spawnProcess(command, parameters, options) {
      calls.processes.push({ command, parameters, options });
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {};
      child.stdin.end = sql => {
        calls.stdin.push(sql); const response = responses.shift();
        queueMicrotask(() => {
          if (response === undefined) { child.emit('error', Error('PRIVATE missing process reply')); return; }
          if (typeof response === 'object') { if (response.stderr) child.stderr.emit('data', Buffer.from(response.stderr)); if (response.output) child.stdout.emit('data', bytes(response.output)); child.emit('close', response.code ?? 1, null); }
          else { child.stdout.emit('data', Buffer.from(response)); child.emit('close', 0, null); }
        });
      };
      return child;
    }, environment, configSha256: hashBytes(bytes(configuration)), githubToken: 'synthetic-github-token',
    platform: 'linux', nodeMajor: 24, uid: 1000, now: () => now, journalEntries,
  };
  const h = { f, input, files, ports, responses, calls, configuration, provisioning, runtimeAuthority, operationRoot, request, prepared, after, forward, journalEntries };
  change(h);
  h.runtime = createSyntheticNoBackupRuntimeForTests({ input, historicalReadOnly: h.historicalReadOnly ?? false }, ports);
  return h;
}

test('production construction is inert and all mutation paths retain the unconditional hold before private I/O', async () => {
  const h = harness(), runtime = createNoBackupProtectedRuntime({ input: h.input, historicalReadOnly: false });
  assert.equal(runtime.simulateDispatchForTests, undefined);
  await assert.rejects(runtime.dispatch(), /hosted_transport_integration_incomplete/);
  await assert.rejects(runtime.dispatchReopening({}), /reset_reopening_integration_incomplete/);
  await assert.rejects(runtime.finalizeReceipt(), /hosted_transport_integration_incomplete/);
  assert.throws(() => createNoBackupProtectedRuntime({ input: h.input, historicalReadOnly: false, spawnProcess() {} }), /options_invalid/);
  assert.throws(() => assertNoBackupReopeningContext({ packet: h.f.packet }), /concrete_reopening_context_required/);
  assert.equal(h.calls.reads.length, 0);
});

test('synthetic forward composition records only planned writes and never supplies mutation SQL or POST to a port', async () => {
  const h = harness(), result = await h.runtime.simulateDispatchForTests();
  assert.equal(result.synthetic, true); assert.equal(result.protectedRuntimeVerified, false);
  assert.equal(result.reconciliation.outcome, 'committed-evidence-matches');
  assert.deepEqual(result.plannedMutations, [{ action: 'freeze', sqlSha256: hashBytes(h.prepared.sql), dispatched: false }]);
  assert.equal(h.calls.stdin.length, 4);
  assert.ok(h.calls.stdin.every(sql => /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/.test(sql)));
  assert.ok(h.calls.github.every(call => call.options.method === 'GET' && call.url.startsWith('https://api.github.com/repos/soley-bot/nestory/')));
  assert.ok(!h.calls.reads.includes(h.configuration.connection.passwordFilePath));
  assert.ok(!h.calls.reads.some(name => name === '/etc/nestory-reset/current-session.json' || name.startsWith('/var/lib/nestory-reset/artifacts/') || name.includes('encryption-key')));
  const journal = await h.runtime.syntheticJournalForTests();
  assert.equal(JSON.parse(journal[`${noBackupActionSlot(h.f.packet, 'freeze')}/receipt`]).outcome, 'committed-evidence-matches');
});

test('the real fixed TLS/psql argument contract is used for all simulated database reads', async () => {
  const h = harness(); await h.runtime.simulateDispatchForTests();
  for (const call of h.calls.processes) {
    assert.equal(call.command, '/usr/bin/psql'); assert.equal(call.options.shell, false);
    assert.equal(call.options.env.PGHOST, `db.${NO_BACKUP_PROJECT}.supabase.co`);
    assert.equal(call.options.env.PGSSLMODE, 'verify-full'); assert.equal(call.options.env.PGPASSFILE, '/etc/nestory-reset/database.pgpass');
    assert.equal(call.options.env.PGPASSWORD, undefined); assert.equal(call.options.env.GH_TOKEN, undefined);
    assert.ok(!call.parameters.some(value => value.includes('SELECT') || value.includes('synthetic-github-token')));
  }
});

for (const [name, change, pattern] of [
  ['forked workflow', h => { h.ports.environment.GITHUB_REPOSITORY = 'other/repository'; }, /workflow_origin_invalid/],
  ['Windows host', h => { h.ports.platform = 'win32'; }, /provisioned_linux_required/],
  ['wrong configuration digest', h => { h.ports.configSha256 = d('0'); }, /configuration_invalid/],
  ['missing preexisting journal', h => { h.files.delete('/var/lib/nestory-reset/journal/store.json'); }, /path_untrusted|private_file_unavailable/],
  ['modified raw zero-plan scale', h => { h.files.set(`${h.operationRoot}/inputs/zeroPlan.json`, bytes(JSON.stringify(h.f.artifacts.zeroPlan))); }, /input_bytes_changed|database_text_changed/],
  ['modified final consent', h => { h.files.set(`${h.operationRoot}/evidence/liveConsent.json`, bytes({ approved: true })); }, /evidence_scope_changed/],
  ['modified stage authority', h => { h.files.set(`${h.operationRoot}/stages/freeze-authority.json`, bytes({ passed: true })); }, /stage_authority_changed/],
  ['expired current authority', h => { h.ports.now = () => Date.parse('2026-10-24T06:00:00Z'); }, /action_authority_unverified/],
  ['changed psql bytes', h => { h.files.set('/usr/bin/psql', bytes('changed')); }, /database_client_changed/],
  ['changed source', h => { h.files.set(path.resolve(import.meta.dirname, 'pilot-finance-reset-no-backup-runtime.mjs'), bytes('changed source')); }, /source_bytes_changed/],
]) test(`fixed runtime refuses ${name} before a planned mutation`, async () => {
  const h = harness('freeze', change); await assert.rejects(h.runtime.simulateDispatchForTests(), pattern);
  assert.ok(h.calls.stdin.every(sql => /READ ONLY/.test(sql)));
});

test('an already retained intent blocks any new attempt before actor or DB access', async () => {
  const h = harness('freeze', value => { value.journalEntries[`${noBackupActionSlot(value.f.packet, 'freeze')}/intent`] = canonicalJson(value.prepared.intent); });
  await assert.rejects(h.runtime.simulateDispatchForTests(), /existing_attempt_reconcile_required/);
  assert.equal(h.calls.processes.length, 0);
});

test('a successful invocation cannot be repeated within the same runtime', async () => {
  const h = harness(); await h.runtime.simulateDispatchForTests(); const count = h.calls.stdin.length;
  await assert.rejects(h.runtime.simulateDispatchForTests(), /existing_attempt_reconcile_required/);
  assert.equal(h.calls.stdin.length, count);
});

test('a failed post-write read preserves the original intent and never plans a second mutation', async () => {
  const h = harness('freeze', value => { value.responses[3] = { stderr: 'PRIVATE driver failure', code: 1 }; });
  await assert.rejects(h.runtime.simulateDispatchForTests(), error => error.requiresReconciliation && !error.message.includes('PRIVATE'));
  const saved = await h.runtime.syntheticJournalForTests(), prefix = noBackupActionSlot(h.f.packet, 'freeze');
  assert.ok(saved[`${prefix}/intent`]); assert.equal(saved[`${prefix}/receipt`], undefined);
  await assert.rejects(h.runtime.simulateDispatchForTests(), /existing_attempt_reconcile_required/);
  assert.equal(h.calls.stdin.length, 4);
});

test('matching read-only reconciliation after process death does not repair the missing receipt', async () => {
  const h = harness('reconcile', value => {
    value.journalEntries[`${noBackupActionSlot(value.f.packet, 'freeze')}/intent`] = canonicalJson(value.prepared.intent);
    value.responses.splice(0, value.responses.length, value.forward(value.after));
  });
  const result = await h.runtime.reconcile();
  assert.equal(result.reconciliation.outcome, 'committed-evidence-matches');
  const saved = await h.runtime.syntheticJournalForTests();
  assert.equal(saved[`${noBackupActionSlot(h.f.packet, 'freeze')}/receipt`], undefined);
  assert.equal(h.calls.stdin.length, 1);
});

function retainedCommittedAttempt(h) {
  h.journalEntries[`${noBackupActionSlot(h.f.packet, 'freeze')}/intent`] = canonicalJson(h.prepared.intent);
  h.responses.splice(0, h.responses.length, h.forward(h.after));
}

test('explicit receipt completion preserves the original intent and appends one database-proven receipt without replay', async () => {
  const h = harness('complete-receipt', retainedCommittedAttempt), prefix = noBackupActionSlot(h.f.packet, 'freeze');
  const original = canonicalJson(h.prepared.intent), result = await h.runtime.simulateFinalizeReceiptForTests();
  assert.equal(result.status, 'missing-receipt-completed');
  assert.equal(result.databaseMutationDispatched, false); assert.equal(result.automaticRetryAllowed, false);
  assert.equal(result.reconciliation.outcome, 'committed-evidence-matches');
  const saved = await h.runtime.syntheticJournalForTests();
  assert.equal(saved[`${prefix}/intent`], original);
  assert.equal(saved[`${prefix}/receipt`], canonicalJson(result.reconciliation));
  assert.equal(h.journalEntries[`${prefix}/receipt`], undefined, 'the caller cannot supply a real writable journal');
  assert.equal(h.calls.stdin.length, 1);
  assert.ok(h.calls.stdin.every(sql => /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/.test(sql)));
  assert.ok(h.calls.github.every(call => call.options.method === 'GET'));
});

test('receipt completion cannot replace an existing receipt or renew the retained authority', async () => {
  const h = harness('complete-receipt', value => {
    retainedCommittedAttempt(value);
    value.journalEntries[`${noBackupActionSlot(value.f.packet, 'freeze')}/receipt`] = canonicalJson({ retained: 'receipt bytes' });
  });
  await assert.rejects(h.runtime.simulateFinalizeReceiptForTests(), /receipt_already_present/);
  const saved = await h.runtime.syntheticJournalForTests();
  assert.equal(saved[`${noBackupActionSlot(h.f.packet, 'freeze')}/receipt`], canonicalJson({ retained: 'receipt bytes' }));
  assert.equal(saved[`${noBackupActionSlot(h.f.packet, 'freeze')}/intent`], canonicalJson(h.prepared.intent));
});

test('receipt completion rejects a missing original intent before any database query', async () => {
  const h = harness('complete-receipt');
  await assert.rejects(h.runtime.simulateFinalizeReceiptForTests(), /original_intent_missing/);
  assert.equal(h.calls.processes.length, 0);
});

test('receipt completion rejects an altered original authority without writing or issuing SQL', async () => {
  const h = harness('complete-receipt', value => {
    retainedCommittedAttempt(value);
    const intent = copy(value.prepared.intent); intent.authoritySha256 = d('0');
    value.journalEntries[`${noBackupActionSlot(value.f.packet, 'freeze')}/intent`] = canonicalJson(intent);
  });
  await assert.rejects(h.runtime.simulateFinalizeReceiptForTests(), /original_stage_authority_changed/);
  assert.equal(h.calls.processes.length, 0);
});

test('receipt completion requires current protected authority even though the original intent is retained', async () => {
  const h = harness('complete-receipt', value => { retainedCommittedAttempt(value); value.ports.now = () => Date.parse('2026-10-24T06:00:00Z'); });
  await assert.rejects(h.runtime.simulateFinalizeReceiptForTests(), /action_authority_unverified/);
  assert.equal(h.calls.processes.length, 0);
});

test('uncommitted or unavailable database evidence cannot produce a completed receipt', async () => {
  for (const missing of [false, true]) {
    const h = harness('complete-receipt', value => {
      retainedCommittedAttempt(value);
      value.responses[0] = missing ? { stderr: 'PRIVATE unavailable', code: 1 } : value.forward(value.request.observation);
    });
    await assert.rejects(h.runtime.simulateFinalizeReceiptForTests());
    const saved = await h.runtime.syntheticJournalForTests();
    assert.equal(saved[`${noBackupActionSlot(h.f.packet, 'freeze')}/receipt`], undefined);
    assert.equal(h.calls.stdin.length, 1);
  }
});

test('a later reset stage cannot advance past a missing predecessor receipt', async () => {
  const h = harness('checkpoint', value => { delete value.journalEntries[`${noBackupActionSlot(value.f.packet, 'freeze')}/receipt`]; });
  await assert.rejects(h.runtime.simulateDispatchForTests(), /previous_receipt_completion_required/);
  const saved = await h.runtime.syntheticJournalForTests();
  assert.equal(saved[`${noBackupActionSlot(h.f.packet, 'checkpoint')}/intent`], undefined);
  assert.ok(h.calls.stdin.every(sql => /READ ONLY/.test(sql)));
});

test('historical mode cannot complete receipts or obtain a reopening context', async () => {
  const h = harness();
  assert.throws(() => createSyntheticNoBackupRuntimeForTests({ input: { ...h.input, action: 'complete-receipt',
    'authorization-id': 'none', 'reconcile-action': 'freeze' }, historicalReadOnly: true }, h.ports), /historical_read_only/);
  await assert.rejects(h.runtime.getReopeningContext(), /reopening_request_invalid/);
});

function reopeningIssuance(f) {
  const binding = { ...f.binding, reopening: { version: 1, request_id: id(70), operation_id: f.binding.operation_id,
    generation: f.binding.target_generation, cutoff: f.binding.cutoff, checkpoint_sha256: d('6'), after_sha256: d('7'),
    foreign_sha256: f.packet.foreignSnapshotSha256, evidence_sha256: hashBytes('synthetic reopening evidence'),
    review_sha256: d('8'), execution_business_date: '2026-10-24' } };
  const slot = `financial-reset/${f.binding.operation_id}/reopening/${f.binding.operation_id}`;
  const prepared = { format: 'nestory-no-backup-retained-reopening-preparation-v1', operationId: f.binding.operation_id,
    packetSha256: f.packet.packetSha256, binding, evidenceText: 'synthetic reopening evidence', slot, observationSha256: d('9') };
  const intent = { format: 'nestory-no-backup-reopening-authorization-intent-v1', operationId: f.binding.operation_id,
    packetSha256: f.packet.packetSha256, bindingSha256: digestJson(binding), preparationSha256: digestJson(prepared),
    requestSha256: digestJson({ p_binding: binding, p_action: 'reopen' }), actorId: id(3), sessionId: id(72), authoritySha256: d('a'),
    createdAt: '2026-10-24T03:59:59.123455Z' };
  const observation = { count: 1, authorization: { authorizationId: id(73), actorId: id(3), status: 'pending', bindingMatches: true,
    backendPid: null, transactionId: null, expiresAt: '2026-10-24T04:04:59.123456Z', observedAt: '2026-10-24T04:00:00Z' },
    sessionId: id(72), issuedAt: '2026-10-24T03:59:59.123456Z', credentialExpiresAt: '2026-10-24T05:00:00Z', bindingHashValid: true };
  return { prepared, slot, request: { packet: f.packet, binding, postgresSemanticText: f.postgresSemanticText,
    intent, observation, expectedAuthorizationId: null, now } };
}

test('one lost authorization response can be verified by its exact binding, current session and microsecond issuance time', () => {
  const { request } = reopeningIssuance(fixture()), receipt = validateNoBackupReopeningAuthorizationObservation(request);
  assert.equal(receipt.authorizationId, id(73)); assert.equal(receipt.authorizationProvenanceVerified, false);
  const earlier = copy(request); earlier.observation.issuedAt = '2026-10-24T03:59:59.123454Z';
  assert.throws(() => validateNoBackupReopeningAuthorizationObservation(earlier), /authorization_not_uniquely_current/);
});

for (const [name, change] of [
  ['duplicate binding', r => { r.observation.count = 2; }],
  ['different session', r => { r.observation.sessionId = id(74); }],
  ['different actor', r => { r.observation.authorization.actorId = id(74); }],
  ['mismatched returned locator', r => { r.expectedAuthorizationId = id(74); }],
  ['wrong request hash', r => { r.intent.requestSha256 = d('0'); }],
  ['expired authority', r => { r.now = Date.parse('2026-10-24T04:05:00Z'); }],
  ['revoked actor', r => { r.observation.authorization.status = 'revoked'; }],
  ['already consumed authorization', r => { r.observation.authorization.status = 'consumed'; r.observation.authorization.backendPid = 51; r.observation.authorization.transactionId = '99'; }],
]) test(`reopening issuance refuses ${name} as current authority`, () => {
  const { request } = reopeningIssuance(fixture()); change(request);
  assert.throws(() => validateNoBackupReopeningAuthorizationObservation(request), /authorization_/);
});

function interruptedReopening(change = () => {}) {
  return harness('reconcile', h => {
    const issuance = reopeningIssuance(h.f); h.issuance = issuance;
    h.input['reconcile-action'] = 'reopen';
    h.configuration.operations[0].actions.push('reopen');
    h.configuration.operations[0].reopening = { reviewSha256: d('8'), authoritySha256: d('a'), sessionAccessReviewSha256: d('b') };
    h.files.set('/etc/nestory-reset/runner.json', bytes(h.configuration)); h.ports.configSha256 = hashBytes(bytes(h.configuration));
    h.journalEntries[`${issuance.slot}/preparation`] = canonicalJson(issuance.prepared);
    h.journalEntries[`${issuance.slot}/authorization-intent`] = canonicalJson(issuance.request.intent);
    h.responses.splice(0, h.responses.length, JSON.stringify(issuance.request.observation));
    change(h);
  });
}

test('a crash after authorization POST and before mutation intent can be classified read-only without replay', async () => {
  const h = interruptedReopening(), before = copy(h.journalEntries), result = await h.runtime.reconcile();
  assert.equal(result.outcome, 'authorization-observed-mutation-not-reconciled');
  assert.equal(result.authorizationStatus, 'pending');
  assert.equal(result.currentMutationAuthorityVerified, false);
  assert.equal(result.automaticRetryAllowed, false);
  assert.equal(result.nextAction, 'operator-review-required');
  assert.equal(result.databaseMutationVerified, false);
  assert.deepEqual(await h.runtime.syntheticJournalForTests(), before);
  assert.equal(h.calls.stdin.length, 1);
  assert.ok(h.calls.stdin.every(sql => /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/.test(sql)));
  assert.ok(h.calls.github.every(call => call.options.method === 'GET'));
});

test('a retained preparation without an issuance intent stays held and cannot invent an authorization', async () => {
  const h = interruptedReopening(value => { delete value.journalEntries[`${value.issuance.slot}/authorization-intent`]; });
  const result = await h.runtime.reconcile();
  assert.equal(result.outcome, 'reopening-preparation-retained-no-authorization-intent');
  assert.equal(result.automaticRetryAllowed, false); assert.equal(h.calls.stdin.length, 0);
});

test('absent, expired, revoked or consumed authorization history never provides retry or current mutation authority', () => {
  for (const status of ['missing', 'expired', 'revoked', 'consumed']) {
    const { request } = reopeningIssuance(fixture());
    if (status === 'missing') request.observation = { count: 0, authorization: null, sessionId: null, issuedAt: null, credentialExpiresAt: null, bindingHashValid: null };
    else {
      request.observation.authorization.status = status;
      if (status === 'expired') {
        request.observation.authorization.expiresAt = '2026-10-24T03:59:59.999999Z';
      } else if (status === 'consumed') {
        request.observation.authorization.backendPid = 51; request.observation.authorization.transactionId = '99';
      }
    }
    const result = reconcileNoBackupReopeningAuthorizationObservation(request);
    assert.equal(result.authorizationStatus, status); assert.equal(result.currentMutationAuthorityVerified, false);
    assert.equal(result.automaticRetryAllowed, false);
  }
});

test('intermediate authorization reconciliation refuses a changed retained preparation hash', async () => {
  const h = interruptedReopening(value => {
    const intent = copy(value.issuance.request.intent); intent.preparationSha256 = d('0');
    value.journalEntries[`${value.issuance.slot}/authorization-intent`] = canonicalJson(intent);
  });
  await assert.rejects(h.runtime.reconcile(), /authorization_intent_changed/); assert.equal(h.calls.stdin.length, 0);
});

test('arbitrary process and network errors are sanitized without exposing private details', async () => {
  const h = harness('freeze', value => { value.ports.fetch = async () => { throw Error('PRIVATE synthetic token'); }; });
  await assert.rejects(h.runtime.simulateDispatchForTests(), error => /github_observation_failed/.test(error.message) && !error.message.includes('PRIVATE'));
  assert.equal(h.calls.processes.length, 0);
});

test('no production providers, callbacks or arbitrary SQL are accepted as synthetic authority', () => {
  const h = harness();
  for (const extra of [{ openStore() {} }, { sql: 'DELETE FROM anything' }, { live: true }]) {
    assert.throws(() => createSyntheticNoBackupRuntimeForTests({ input: h.input, historicalReadOnly: false }, { ...h.ports, ...extra }), /synthetic_ports_invalid/);
  }
});
