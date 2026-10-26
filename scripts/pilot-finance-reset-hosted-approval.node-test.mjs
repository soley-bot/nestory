import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket, reconcileOperatorState } from './pilot-finance-reset-operator-core.mjs';
import { HOSTED_SOURCE_FILES, approvalIdentity, approvalObservationQuery, approvalRequest, digestJson, immutableEndorsement, validateApprovalObservation } from './pilot-finance-reset-hosted-protocol.mjs';
import { createHostedApprovalClient } from './pilot-finance-reset-hosted-approval.mjs';
import { NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_REQUIRED_SOURCE_FILES,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';

const now = Date.parse('2026-10-23T12:00:00Z');
const actor = '10000000-0000-4000-8000-000000000001', reviewer = '10000000-0000-4000-8000-000000000002';
const root = path.resolve(import.meta.dirname, '..');
const sourceDigests = new Map(await Promise.all(HOSTED_SOURCE_FILES.map(async name => [name, hashSourceBytes(await readFile(path.join(root, name)))])));
const noBackupSourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name => [name, await readFile(path.join(root, name))])));
const jwt = claims => `${Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic_signature`;
const tokenFor = (packet, extra = {}) => jwt({ sub: actor, session_id: '10000000-0000-4000-8000-000000000003',
  iss: `https://${packet.operation.projectRef}.supabase.co/auth/v1`, role: 'authenticated', exp: Math.floor(now / 1000) + 3600, ...extra });
const reseal = packet => {
  packet.sourcesSha256 = digestJson(packet.sourceFiles);
  const body = { ...packet };
  delete body.packetSha256;
  packet.packetSha256 = digestJson(body);
  return packet;
};
function packetFixture() {
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, `synthetic-${name}`]));
  const review = { format: 'nestory-protected-reset-review-v1', operation: {
    operationId: '10000000-0000-4000-8000-000000000010', projectRef: 'syntheticprojectrefa', organizationId: '10000000-0000-4000-8000-000000000011',
    mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-23', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), archiveRows: 7, actionCount: 6,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256',
      'continuationSemanticSha256', 'reportReviewSha256'].map((name, index) => [name, String(index + 1).repeat(64)])),
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, hashBytes(value)])) };
  const names = [...new Set([...SOURCE_ENTRYPOINTS, ...HOSTED_SOURCE_FILES, 'supabase/migrations/20261023161622_reviewed_dispositions.sql'])].sort();
  return prepareOperatorPacket({ review, artifacts, candidateHead: review.operation.mainSha,
    sources: names.map(name => ({ path: name, sha256: sourceDigests.get(name) ?? 'a'.repeat(64) })) });
}
function noBackupFixture(missingEvidence = []) {
  const continuation = { version: 3, actor_id: actor, billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-23', invoice_date_policy: 'original-reviewed-october', leases: [{
      lease_id: '10000000-0000-4000-8000-000000000020', term_id: '10000000-0000-4000-8000-000000000021',
      billing_rule_id: '10000000-0000-4000-8000-000000000022', disposition: 'bill', continue_month_to_month: false,
      rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: reviewer,
      collection_route: 'through_ips', due_date: '2026-10-07' }], original_invoice_sources: [{
      lease_id: '10000000-0000-4000-8000-000000000020', invoice_id: '10000000-0000-4000-8000-000000000023', row_sha256: '8'.repeat(64) }] };
  // Synthetic byte witness and reference documents: never real PostgreSQL,
  // customer consent, actor authority, or protected provisioning evidence.
  const postgresSemanticText = JSON.stringify(continuation, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.filter(role => !missingEvidence.includes(role)).map(role => [role, `synthetic-only ${role}`]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: '10000000-0000-4000-8000-000000000010', kind: 'reset', restoreOf: null,
      projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1,
      cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07', executionBusinessDate: '2026-10-23',
      invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), foreignSnapshotSha256: 'e'.repeat(64),
    archiveRows: 7, actionCount: 6, databaseBinding: { manifestSha256: '1'.repeat(64), planSha256: '2'.repeat(64), archiveSha256: '3'.repeat(64),
      actionSha256: '4'.repeat(64), zeroReviewSha256: '5'.repeat(64), continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: '7'.repeat(64) },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, missingEvidence.includes(role) ? null : hashBytes(evidence[role])])) };
  const packet = prepareNoBackupPacket({ review, sources: Object.entries(noBackupSourceContents).map(([name, bytes]) => ({ path: name, sha256: hashSourceBytes(bytes) })),
    sourceContents: noBackupSourceContents, evidence, candidateHead: review.operation.mainSha, observedBusinessDate: review.operation.executionBusinessDate });
  return { packet, continuation, postgresSemanticText };
}
function observationFixture(packet, noBackup = null) {
  const b = packet.databaseBinding, op = packet.operation;
  return { operation: { operationId: op.operationId, organizationId: op.organizationId, kind: 'reset', restoreOf: null,
    status: 'sealed', sourceGeneration: op.sourceGeneration, targetGeneration: op.targetGeneration,
    manifestSha256: b.manifestSha256, planSha256: b.planSha256, schemaSha256: packet.schemaSha256,
    archiveSha256: b.archiveSha256, actionSha256: b.actionSha256, archiveRows: packet.archiveRows, actionCount: packet.actionCount, appliedCount: 0 },
    control: { status: 'frozen', generation: op.targetGeneration, cutoff: op.cutoff, timezone: op.timezone, businessDate: op.executionBusinessDate ?? op.issueDate },
    zeroPlan: { status: 'prepared', reviewSha256: b.zeroReviewSha256, canonicalSha256: b.zeroReviewSha256, operationId: op.operationId,
      organizationId: op.organizationId, manifestSha256: b.manifestSha256, planSha256: b.planSha256, effectiveDate: op.cutoff,
      makerActorId: actor, reviewerActorId: reviewer }, approvals: [], endorsements: [], targetEndorsements: [], capabilityCount: 0,
    ...(noBackup ? { reservation: { binding: hostedNoBackupBinding(packet, noBackup.continuation, noBackup.postgresSemanticText),
      bindingSha256: '9'.repeat(64), canonicalSha256: '9'.repeat(64), foreignSha256: packet.foreignSnapshotSha256,
      continuationSemanticText: noBackup.postgresSemanticText } } : {}) };
}
const approved = (packet, kind = 'maker') => ({ operationId: packet.operation.operationId, organizationId: packet.operation.organizationId,
  kind, reviewSha256: packet.databaseBinding.zeroReviewSha256, approvedBy: kind === 'maker' ? actor : reviewer, approvedAt: '2026-10-23T12:00:01+00:00' });
const endorsed = (packet, { number = 1, kind = 'maker', sessionId = '10000000-0000-4000-8000-000000000003', expiry = now + 3600000 } = {}) => ({
  endorsementId: `10000000-0000-4000-8000-${String(100 + number).padStart(12, '0')}`, operationId: packet.operation.operationId,
  organizationId: packet.operation.organizationId, kind, number, reviewSha256: packet.databaseBinding.zeroReviewSha256,
  actorId: kind === 'maker' ? actor : reviewer, sessionId, credentialExpiresAt: new Date(expiry).toISOString(), endorsedAt: '2026-10-23T12:00:01+00:00',
  availability: { status: 'current', observedAt: '2026-10-23T12:00:02+00:00' } });
const rows = observation => [{ financial_reset_approval_observation: structuredClone(observation) }];
const authResponse = (extra = {}) => new Response(JSON.stringify({ id: actor, role: 'authenticated', is_anonymous: false, ...extra }), {
  status: 200, headers: { 'content-type': 'application/json' } });
function harness(config = {}) {
  const noBackup = config.noBackup ? noBackupFixture(config.missingEvidence) : null;
  const packet = noBackup?.packet ?? packetFixture(), observation = observationFixture(packet, noBackup), records = new Map(), events = [], requests = [], endorsementHistory = [];
  const databasePacket = structuredClone(packet);
  const input = { packet, kind: 'maker', accessToken: tokenFor(packet), publishableKey: 'sb_publishable_synthetic_fixture_only' };
  const ports = {
    clock: () => now,
    journal: {
      async read(key) { events.push(`read:${key.split('/').at(-1)}`); return records.get(key) ?? null; },
      async putIfAbsent(key, body) { events.push(`put:${key.split('/').at(-1)}`); if (records.has(key)) return 'exists'; records.set(key, body); return 'created'; },
    },
    async observeDatabase(query) {
      events.push('database'); assert.deepEqual(query, approvalObservationQuery(packet, query.values[1]));
      return rows({ ...observation, targetEndorsements: endorsementHistory.filter(e => e.number === query.values[1]).map(immutableEndorsement) });
    },
    async fetchImpl(url, options) {
      requests.push({ url, options }); events.push(options.method);
      if (options.method === 'GET') return authResponse();
      observation.approvals = [approved(databasePacket, input.kind)];
      const claims = JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1], 'base64url').toString('utf8'));
      const predecessor = observation.endorsements.find(e => e.kind === input.kind);
      if (!predecessor || predecessor.sessionId !== claims.session_id || Date.parse(predecessor.credentialExpiresAt) < claims.exp * 1000) {
        const entry = endorsed(databasePacket, { number: (predecessor?.number ?? 0) + 1, kind: input.kind, sessionId: claims.session_id, expiry: claims.exp * 1000 });
        endorsementHistory.push(entry); observation.endorsements = [entry];
      }
      return new Response(null, { status: 204 });
    },
  };
  config.configure?.({ packet, observation, records, events, requests, input, ports, endorsementHistory });
  return { packet, observation, records, events, requests, input, ports, endorsementHistory, client: createHostedApprovalClient(ports) };
}
const postCount = h => h.requests.filter(r => r.options.method === 'POST').length;

test('explicit no-backup approval uses the registered v2 packet and genuine-session path without granting reset authority', async () => {
  const h = harness({ noBackup: true }), original = structuredClone(h.packet);
  const result = await h.client.approve(h.input);
  assert.equal(result.outcome, 'approval-recorded-and-reconciled'); assert.equal(result.resetExecutionSupported, false);
  assert.deepEqual(h.packet, original); assert.equal(h.packet.executionSupported, false); assert.equal(h.packet.customerApprovalVerified, false);
  assert.equal(Object.hasOwn(h.packet, 'artifacts'), false); assert.equal(h.observation.reservation.binding.archive_artifact_sha256, null);
  assert.equal(postCount(h), 1); assert.equal(h.requests[0].options.method, 'GET');
  assert.equal(h.requests[0].url, `https://${NO_BACKUP_PROJECT}.supabase.co/auth/v1/user`);
  assert.equal(h.requests[1].url, approvalRequest(h.packet).url);
  for (const bytes of h.records.values()) {
    assert.equal(bytes.includes(h.input.accessToken), false); assert.equal(bytes.includes(h.input.publishableKey), false);
    assert.equal(JSON.parse(bytes).packetSha256, h.packet.packetSha256);
  }
});

test('no-backup reviewer is authenticated independently as the exact assigned reviewer', async () => {
  const h = harness({ noBackup: true, configure(h) {
    h.input.kind = 'reviewer'; h.input.accessToken = tokenFor(h.packet, { sub: reviewer });
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => options.method === 'GET' ? authResponse({ id: reviewer }) : original(url, options);
  } });
  assert.equal((await h.client.approve(h.input)).approvalKind, 'reviewer');
});

test('no-backup collection permits only its missing approval reference and retains the readiness blocker', async () => {
  const h = harness({ noBackup: true, missingEvidence: ['actorApprovals'] });
  assert.equal((await h.client.approve(h.input)).resetExecutionSupported, false);
  assert.deepEqual(h.packet.evidenceBlockers, ['missing_actorApprovals']);
});

for (const role of ['waiver', 'liveConsent', 'containmentProof', 'rehearsalProof']) test(`no-backup missing ${role} blocks before any observation or Auth call`, async () => {
  const h = harness({ noBackup: true, missingEvidence: [role] });
  await assert.rejects(h.client.approve(h.input), /review_evidence_incomplete/);
  assert.deepEqual(h.events, []); assert.equal(h.records.size, 0);
});

for (const [name, change] of [
  ['missing reservation', o => { delete o.reservation; }],
  ['unregistered operation', o => { o.reservation = null; }],
  ['packet', o => { o.reservation.binding.packet_sha256 = 'f'.repeat(64); }],
  ['recovery policy', o => { o.reservation.binding.recovery_policy = 'backed-up'; }],
  ['legacy binding', o => { o.reservation.binding.version = 1; delete o.reservation.binding.recovery_policy; }],
  ['fake external archive', o => { o.reservation.binding.archive_artifact_sha256 = 'f'.repeat(64); }],
  ['foreign tenant', o => { o.reservation.binding.organization_id = reviewer; }],
  ['foreign census', o => { o.reservation.foreignSha256 = 'f'.repeat(64); }],
  ['stored binding hash', o => { o.reservation.canonicalSha256 = 'f'.repeat(64); }],
  ['source closure', o => { o.reservation.binding.sources_sha256 = 'f'.repeat(64); }],
  ['PostgreSQL semantic bytes', o => { o.reservation.continuationSemanticText = JSON.stringify(o.reservation.binding.continuation_semantic); }],
  ['original invoice date', o => { o.reservation.binding.continuation_semantic.issue_date = '2026-10-23'; }],
  ['recovery extension', o => { o.reservation.binding.recovery = {}; }],
]) test(`no-backup ${name} drift blocks before Auth or durable intent`, async () => {
  const h = harness({ noBackup: true, configure(h) { change(h.observation); } });
  await assert.rejects(h.client.approve(h.input), /hosted_approval_(?:reservation_changed|observation_shape_invalid)/);
  assert.equal(h.requests.length, 0); assert.equal(h.records.size, 0);
});

test('v2 metadata query is fixed, read-only and bound without changing the v1 observation shape', () => {
  const h = harness({ noBackup: true }), v2 = approvalObservationQuery(h.packet), v1 = approvalObservationQuery(packetFixture());
  assert.equal(v2.name, 'financial-reset-zero-approval-no-backup-observation-v1');
  assert.deepEqual(v2.values, [h.packet.operation.operationId, null]);
  assert.deepEqual(v2.transaction, { isolation: 'repeatable read', readOnly: true });
  assert.match(v2.text, /financial_reset_hosted_reservations/); assert.match(v2.text, /continuation_semantic'\)::text/);
  assert.doesNotMatch(v2.text, /\b(?:INSERT|UPDATE|DELETE|CALL|ALTER|CREATE|SET)\b/i);
  assert.equal(v2.text.includes(h.packet.operation.operationId), false);
  assert.equal(v2.text.includes('row_json'), false); assert.equal(v1.text.includes('financial_reset_hosted_reservations'), false);
  assert.equal(v1.name, 'financial-reset-zero-approval-observation-v2');
});

for (const source of ['scripts/pilot-finance-reset-no-backup-core.mjs', 'supabase/migrations/20261024023749_financial_reset_explicit_no_backup_binding.sql']) {
  test(`no-backup approval checks actual source bytes for ${source}`, async () => {
    const h = harness({ noBackup: true });
    h.packet.sourceFiles.find(entry => entry.path === source).sha256 = 'f'.repeat(64); reseal(h.packet);
    await assert.rejects(h.client.approve(h.input), /hosted_approval_source_changed/);
    assert.deepEqual(h.events, []); assert.equal(h.records.size, 0);
  });
}

test('a v2 reservation change during the fresh Auth check is caught before POST', async () => {
  const h = harness({ noBackup: true, configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => {
      const response = await original(url, options);
      if (options.method === 'GET') h.observation.reservation.binding.packet_sha256 = 'f'.repeat(64);
      return response;
    };
  } });
  await assert.rejects(h.client.approve(h.input), /reservation_changed/);
  assert.equal(postCount(h), 0); assert.equal(h.records.size, 0);
});

for (const [name, change] of [
  ['expired credential', h => { h.input.accessToken = tokenFor(h.packet, { exp: now / 1000 }); }],
  ['foreign issuer', h => { h.input.accessToken = tokenFor(h.packet, { iss: 'https://otherprojectrefaaaaaa.supabase.co/auth/v1' }); }],
  ['service role', h => { h.input.accessToken = tokenFor(h.packet, { role: 'service_role' }); }],
]) test(`no-backup ${name} cannot authorize approval`, async () => {
  const h = harness({ noBackup: true, configure: change });
  await assert.rejects(h.client.approve(h.input), /session_invalid/); assert.equal(h.requests.length, 0); assert.equal(h.records.size, 0);
});

test('no-backup token expiry during durable intent leaves reconciliation required and never retries', async () => {
  const h = harness({ noBackup: true, configure(h) {
    let expired = false; h.ports.clock = () => now + (expired ? 3600000 : 0);
    const original = h.ports.journal.putIfAbsent;
    h.ports.journal.putIfAbsent = async (key, bytes) => { const result = await original(key, bytes); if (key.endsWith('/intent')) expired = true; return result; };
  } });
  await assert.rejects(h.client.approve(h.input), /dispatch_outcome_requires_reconciliation/);
  assert.equal(postCount(h), 0); assert.equal(h.records.size, 1);
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
});

test('lost no-backup approval acknowledgement reconciles only the original attempt without another POST', async () => {
  const h = harness({ noBackup: true, configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => { const response = await original(url, options); if (options.method === 'POST') throw Error('synthetic lost response'); return response; };
  } });
  await assert.rejects(h.client.approve(h.input), /dispatch_outcome_requires_reconciliation/);
  await assert.rejects(createHostedApprovalClient(h.ports).approve(h.input), /existing_intent_requires_reconciliation/);
  assert.equal((await h.client.reconcile({ packet: h.packet, kind: 'maker' })).outcome, 'approval-recorded-and-reconciled');
  assert.equal(postCount(h), 1);
});

test('no-backup historical endorsement receipt cannot renew after reset execution or recover an expired execution authority', async () => {
  const h = harness({ noBackup: true }); await h.client.approve(h.input);
  await h.client.renew(freshRenewal(h));
  h.observation.operation.status = 'actions_complete'; h.observation.operation.appliedCount = h.packet.actionCount;
  h.observation.zeroPlan.status = 'complete'; h.observation.control.status = 'open'; h.observation.control.businessDate = '2026-10-24';
  h.observation.endorsements[0].availability = { status: 'expired', observedAt: '2026-10-24T12:00:00Z' };
  const posts = postCount(h), result = await reconcileRenewal(h);
  assert.equal(result.currentlyUsable, false); assert.equal(result.resetExecutionSupported, false);
  await assert.rejects(h.client.renew(freshRenewal(h)), /operation_changed/); assert.equal(postCount(h), posts);
});

test('real approval protocol persists intent before one fixed POST and immutable DB reconciliation before receipt', async () => {
  const h = harness();
  const result = await h.client.approve(h.input);
  assert.equal(result.outcome, 'approval-recorded-and-reconciled');
  assert.equal(result.resetExecutionSupported, false);
  assert.equal(result.privateActorBridgeImplemented, false);
  assert.deepEqual(h.events, ['read:intent', 'database', 'GET', 'database', 'put:intent', 'read:intent', 'POST', 'database', 'read:receipt', 'put:receipt', 'read:receipt']);
  assert.equal(postCount(h), 1);
  const post = h.requests[1];
  assert.equal(post.url, approvalRequest(h.packet).url);
  assert.equal(post.options.body, approvalRequest(h.packet).body);
  for (const request of h.requests) {
    assert.equal(request.options.redirect, 'error'); assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.headers.Authorization, `Bearer ${h.input.accessToken}`);
    assert.equal(new URL(request.url).search, '');
  }
  for (const bytes of h.records.values()) {
    assert.equal(bytes.includes(h.input.accessToken), false);
    assert.equal(bytes.includes(h.input.publishableKey), false);
  }
});

test('reviewer must authenticate as the distinct reviewer stored in the exact zero plan', async () => {
  const h = harness({ configure(h) {
    h.input.kind = 'reviewer'; h.input.accessToken = tokenFor(h.packet, { sub: reviewer });
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => options.method === 'GET' ? authResponse({ id: reviewer }) : original(url, options);
  } });
  assert.equal((await h.client.approve(h.input)).approvalKind, 'reviewer');
});

test('approval collection permits its absent resulting artifact without declaring the reset ready', async () => {
  const h = harness();
  h.packet.artifacts.actorApprovals = null;
  h.packet.evidenceBlockers = ['missing_actorApprovals']; reseal(h.packet);
  const result = await h.client.approve(h.input);
  assert.equal(result.outcome, 'approval-recorded-and-reconciled');
  assert.equal(result.resetExecutionSupported, false);
  assert.deepEqual(h.packet.evidenceBlockers, ['missing_actorApprovals']);
  const gate = reconcileOperatorState(h.packet, {
    operation: h.packet.operation, packetSha256: h.packet.packetSha256, currentMainSha: h.packet.operation.mainSha,
    sourcesSha256: h.packet.sourcesSha256, schemaSha256: h.packet.schemaSha256, ledgerSha256: h.packet.ledgerSha256,
    businessDate: h.packet.operation.issueDate, control: null, durable: null, checkpoint: null, approvals: null, contained: true,
    writerLease: { environment: 'production-database', group: 'production-supabase', cancelInProgress: false, held: true },
  });
  assert.equal(gate.next, 'blocked');
  assert.equal(gate.reason, 'operation_evidence_incomplete');
  assert.equal(gate.mutationAllowed, false);
});

for (const role of ['liveConsent', 'archive', 'storageProof', 'restoreProof']) test(`missing ${role} still blocks approval before transport`, async () => {
  const h = harness();
  h.packet.artifacts[role] = null;
  h.packet.evidenceBlockers = [`missing_${role}`]; reseal(h.packet);
  await assert.rejects(h.client.approve(h.input), /(?:review_evidence_incomplete|operator_packet_evidence_invalid)/);
  assert.deepEqual(h.events, []);
});

for (const role of ['liveConsent', 'archive']) test(`changed ${role} digest invalidates the reviewed packet before transport`, async () => {
  const h = harness(); h.packet.artifacts[role].sha256 = 'f'.repeat(64);
  await assert.rejects(h.client.approve(h.input), /operator_packet_binding_invalid/);
  assert.deepEqual(h.events, []);
});

for (const [name, mutate] of [
  ['malformed token', h => { h.input.accessToken = 'secret-invalid-token'; }],
  ['expired token', h => { h.input.accessToken = tokenFor(h.packet, { exp: Math.floor(now / 1000) }); }],
  ['wrong project issuer', h => { h.input.accessToken = tokenFor(h.packet, { iss: 'https://otherprojectrefaaaaaa.supabase.co/auth/v1' }); }],
  ['service actor token', h => { h.input.accessToken = tokenFor(h.packet, { role: 'service_role' }); }],
  ['anonymous session', h => { h.input.accessToken = tokenFor(h.packet, { is_anonymous: true }); }],
  ['missing session identity', h => { h.input.accessToken = tokenFor(h.packet, { session_id: null }); }],
  ['secret API key', h => { h.input.publishableKey = ['sb', 'secret', 'synthetic', 'do', 'not', 'send'].join('_'); }],
  ['legacy service API key', h => { h.input.publishableKey = jwt({ role: 'service_role', ref: h.packet.operation.projectRef }); }],
  ['wrong legacy API key project', h => { h.input.publishableKey = jwt({ role: 'anon', ref: 'otherprojectrefaaaaaa' }); }],
]) test(`${name} is refused before network dispatch`, async () => {
  const h = harness({ configure: mutate });
  await assert.rejects(h.client.approve(h.input), /hosted_approval_(session|public_key)_invalid/);
  assert.equal(h.requests.length, 0); assert.equal(h.records.size, 0);
});

test('an existing legacy anon key is accepted without using it as user authority', async () => {
  const h = harness(); h.input.publishableKey = jwt({ role: 'anon', ref: h.packet.operation.projectRef });
  assert.equal((await h.client.approve(h.input)).outcome, 'approval-recorded-and-reconciled');
});

for (const [name, response] of [
  ['wrong authenticated user', () => authResponse({ id: reviewer })],
  ['metadata pretending to be the assigned user', () => authResponse({ id: reviewer, user_metadata: { sub: actor } })],
  ['anonymous Auth user', () => authResponse({ is_anonymous: true })],
  ['rejected session', () => new Response(null, { status: 401 })],
  ['redirect response', () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid' } })],
  ['malformed Auth JSON', () => new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } })],
  ['oversized Auth JSON', () => authResponse({ padding: 'x'.repeat(65536) })],
]) test(`${name} cannot create an approval intent`, async () => {
  const h = harness({ configure(h) { h.ports.fetchImpl = async (url, options) => { h.requests.push({ url, options }); return response(); }; } });
  await assert.rejects(h.client.approve(h.input), /hosted_approval_/);
  assert.equal(postCount(h), 0); assert.equal(h.records.size, 0);
});

test('redirected final origin is refused even if a transport reports HTTP200', async () => {
  const h = harness({ configure(h) { h.ports.fetchImpl = async () => {
    const response = authResponse(); Object.defineProperty(response, 'url', { value: 'https://elsewhere.invalid/auth/v1/user' }); return response;
  }; } });
  await assert.rejects(h.client.approve(h.input), /redirect_refused/);
  assert.equal(h.records.size, 0);
});

for (const [name, mutate] of [
  ['operation identity', o => { o.operation.operationId = reviewer; }],
  ['target generation', o => { o.control.generation = 2; }],
  ['open control', o => { o.control.status = 'open'; }],
  ['timezone', o => { o.control.timezone = 'UTC'; }],
  ['business date', o => { o.control.businessDate = '2026-10-24'; }],
  ['plan digest', o => { o.zeroPlan.reviewSha256 = 'f'.repeat(64); }],
  ['canonical plan hash', o => { o.zeroPlan.canonicalSha256 = 'f'.repeat(64); }],
  ['manifest', o => { o.operation.manifestSha256 = 'f'.repeat(64); }],
  ['stored archive digest', o => { o.operation.archiveSha256 = 'f'.repeat(64); }],
  ['schema', o => { o.operation.schemaSha256 = 'f'.repeat(64); }],
  ['action count', o => { o.operation.actionCount++; }],
  ['partial application', o => { o.operation.appliedCount = 1; }],
  ['same maker/reviewer', o => { o.zeroPlan.reviewerActorId = actor; }],
  ['active row capability', o => { o.capabilityCount = 1; }],
]) test(`${name} drift refuses approval before contacting Auth`, async () => {
  const h = harness({ configure(h) { mutate(h.observation); } });
  await assert.rejects(h.client.approve(h.input), /hosted_approval_/);
  assert.equal(h.requests.length, 0); assert.equal(h.records.size, 0);
});

test('fixed observation query is one parameterized SELECT in a read-only transaction', () => {
  const packet = packetFixture(), query = approvalObservationQuery(packet);
  assert.deepEqual(query.values, [packet.operation.operationId, null]);
  assert.deepEqual(query.transaction, { isolation: 'repeatable read', readOnly: true });
  assert.doesNotMatch(query.text, /\b(?:INSERT|UPDATE|DELETE|CALL|ALTER|CREATE|SET)\b/i);
  assert.equal(query.text.includes(packet.operation.operationId), false);
  assert.equal(query.text.includes('row_json'), false);
  const observation = observationFixture(packet); observation.approvals = [approved(packet), approved(packet)];
  assert.throws(() => validateApprovalObservation(packet, rows(observation)), /approval_rows_invalid/);
  assert.throws(() => validateApprovalObservation(packet, []), /shape_invalid/);
});

test('unreviewed URL or RPC overrides are not accepted', async () => {
  const h = harness();
  assert.throws(() => createHostedApprovalClient({ ...h.ports, baseUrl: 'https://elsewhere.invalid' }), /ports_required/);
  await assert.rejects(h.client.approve({ ...h.input, rpc: 'arbitrary_sql' }), /input_invalid/);
  assert.equal(h.requests.length, 0);
});

test('source changes or missing bound client sources stop before database or HTTP', async () => {
  for (const source of HOSTED_SOURCE_FILES) for (const mutation of [p => { p.sourceFiles = p.sourceFiles.filter(s => s.path !== source); },
    p => { p.sourceFiles.find(s => s.path === source).sha256 = 'f'.repeat(64); }]) {
    const h = harness(); mutation(h.packet); reseal(h.packet);
    await assert.rejects(h.client.approve(h.input), /(?:source_changed|source_coverage_incomplete)/);
    assert.deepEqual(h.events, []);
  }
});

test('caller mutation while awaiting Auth cannot replace the approved operation packet', async () => {
  const h = harness({ configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => {
      if (options.method === 'GET') { h.input.packet.operation.operationId = reviewer; reseal(h.input.packet); }
      return original(url, options);
    };
    h.ports.observeDatabase = async () => rows(h.observation);
  } });
  const originalOperation = h.packet.operation.operationId;
  await h.client.approve(h.input);
  assert.equal(JSON.parse(h.requests[1].options.body).p_operation_id, originalOperation);
});

test('parallel invocations atomically reserve only one dispatch slot', async () => {
  const h = harness();
  const results = await Promise.allSettled([h.client.approve(h.input), h.client.approve(h.input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(postCount(h), 1);
});

test('duplicate invocation never contacts Auth or resends approval', async () => {
  const h = harness(); await h.client.approve(h.input);
  const count = h.requests.length;
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
  assert.equal(h.requests.length, count);
});

for (const committed of [false, true]) test(`lost POST acknowledgement with committed=${committed} requires explicit read-only reconciliation`, async () => {
  const h = harness({ configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => {
      if (options.method === 'GET') return original(url, options);
      h.requests.push({ url, options });
      if (committed) h.observation.approvals = [approved(h.packet)];
      throw Error(`private transport failure ${h.input.accessToken}`);
    };
  } });
  await assert.rejects(h.client.approve(h.input), error => error.message === 'hosted_approval_dispatch_outcome_requires_reconciliation' && error.requiresReconciliation);
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
  if (committed) assert.equal((await h.client.reconcile({ packet: h.packet, kind: 'maker' })).outcome, 'approval-recorded-and-reconciled');
  else await assert.rejects(h.client.reconcile({ packet: h.packet, kind: 'maker' }), /not_durably_observed/);
  assert.equal(postCount(h), 1);
});

test('HTTP success without the exact immutable database approval is not success', async () => {
  const h = harness({ configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => options.method === 'GET' ? original(url, options) : new Response(null, { status: 204 });
  } });
  await assert.rejects(h.client.approve(h.input), /receipt_requires_reconciliation/);
  assert.equal([...h.records.keys()].some(k => k.endsWith('/receipt')), false);
});

for (const phase of ['intent', 'receipt']) for (const stored of [false, true]) test(`uncertain ${phase} journal write stored=${stored} never permits another POST`, async () => {
  const h = harness({ configure(h) {
    const original = h.ports.journal.putIfAbsent;
    h.ports.journal.putIfAbsent = async (key, body) => {
      if (!key.endsWith(`/${phase}`)) return original(key, body);
      if (stored) await original(key, body);
      throw Error(`private journal path ${h.input.accessToken}`);
    };
  } });
  await assert.rejects(h.client.approve(h.input), /hosted_approval_(journal_write_uncertain|receipt_requires_reconciliation)/);
  assert.equal(postCount(h), phase === 'receipt' ? 1 : 0);
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
});

test('journal readback mismatch stops before POST and never exposes token or driver details', async () => {
  const h = harness({ configure(h) {
    const original = h.ports.journal.read;
    h.ports.journal.read = async key => (await original(key)) === null ? null : 'different bytes';
  } });
  await assert.rejects(h.client.approve(h.input), error => {
    assert.equal(JSON.stringify(error).includes(h.input.accessToken), false);
    return error.message === 'hosted_approval_journal_readback_mismatch';
  });
  assert.equal(postCount(h), 0);
});

test('separate reconciliation retains original intent and immutable receipt without network traffic', async () => {
  const h = harness(); const first = await h.client.approve(h.input), count = h.requests.length;
  const again = await h.client.reconcile({ packet: h.packet, kind: 'maker' });
  assert.deepEqual(again, first); assert.equal(h.requests.length, count);
  const key = `${approvalIdentity(h.packet, 'maker')}/intent`;
  const altered = JSON.parse(h.records.get(key)); altered.zeroReviewSha256 = 'f'.repeat(64); h.records.set(key, canonicalJson(altered));
  await assert.rejects(h.client.reconcile({ packet: h.packet, kind: 'maker' }), /intent_binding_changed/);
  assert.equal(h.requests.length, count);
});

test('database generation drift after POST leaves no success receipt', async () => {
  const h = harness({ configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => { const response = await original(url, options); if (options.method === 'POST') h.observation.control.generation++; return response; };
  } });
  await assert.rejects(h.client.approve(h.input), /receipt_requires_reconciliation/);
  assert.equal(postCount(h), 1);
  assert.equal([...h.records.keys()].some(k => k.endsWith('/receipt')), false);
});

for (const status of [302, 401, 503]) test(`approval POST status ${status} keeps original intent and requires reconciliation`, async () => {
  const h = harness({ configure(h) {
    const original = h.ports.fetchImpl;
    h.ports.fetchImpl = async (url, options) => {
      if (options.method === 'GET') return original(url, options);
      h.requests.push({ url, options });
      return new Response(null, { status, headers: { location: 'https://elsewhere.invalid' } });
    };
  } });
  await assert.rejects(h.client.approve(h.input), /dispatch_outcome_requires_reconciliation/);
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
  assert.equal(postCount(h), 1);
  assert.equal([...h.records.keys()].some(k => k.endsWith('/receipt')), false);
});

test('session expiry during durable intent retention prevents POST and keeps the original intent', async () => {
  const h = harness({ configure(h) {
    let expired = false;
    h.ports.clock = () => now + (expired ? 3600000 : 0);
    const original = h.ports.journal.putIfAbsent;
    h.ports.journal.putIfAbsent = async (key, body) => {
      const result = await original(key, body);
      if (key.endsWith('/intent')) expired = true;
      return result;
    };
  } });
  await assert.rejects(h.client.approve(h.input), /dispatch_outcome_requires_reconciliation/);
  assert.equal(postCount(h), 0);
  assert.equal(h.records.size, 1);
  await assert.rejects(h.client.approve(h.input), /existing_intent_requires_reconciliation/);
});

for (const [name, drift] of [
  ['business-date rollover', o => { o.control.businessDate = '2026-10-24'; }],
  ['operation advancement', o => { o.operation.status = 'actions_complete'; o.zeroPlan.status = 'completed'; }],
]) test(`historical approval after ${name} cannot be mistaken for current prepared readiness`, async () => {
  const h = harness();
  await h.client.approve(h.input);
  const requests = h.requests.length;
  drift(h.observation);
  await assert.rejects(h.client.reconcile({ packet: h.packet, kind: 'maker' }), /hosted_approval_(frozen_context|operation)_changed/);
  assert.equal(h.requests.length, requests);
});

const freshRenewal = (h, extra = {}) => ({ ...h.input, accessToken: tokenFor(h.packet, {
  session_id: '10000000-0000-4000-8000-000000000004', exp: Math.floor(now / 1000) + 7200, ...extra }) });
const reconcileRenewal = h => h.client.reconcileRenewal({ packet: h.packet, kind: 'maker', renewalAttempt: 1 });

test('renewal appends a unique durable attempt and exact new endorsement without replacing the original approval', async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = [...h.records.entries()], originalApproval = structuredClone(h.observation.approvals[0]), input = freshRenewal(h);
  const result = await h.client.renew(input);
  assert.equal(result.outcome, 'endorsement-recorded-and-reconciled'); assert.equal(result.renewalAttempt, 1);
  assert.equal(result.endorsementNumber, 2); assert.equal(result.currentlyUsable, true); assert.equal(result.resetExecutionSupported, false);
  assert.deepEqual(h.observation.approvals[0], originalApproval); assert.equal(h.endorsementHistory.length, 2);
  for (const [key, bytes] of original) assert.equal(h.records.get(key), bytes);
  const slot = `${approvalIdentity(h.packet, 'maker')}/renewal/1`, intent = JSON.parse(h.records.get(`${slot}/intent`));
  assert.deepEqual(intent.originalApproval, originalApproval); assert.deepEqual(intent.predecessor, immutableEndorsement(h.endorsementHistory[0]));
  assert.equal(intent.sessionId, '10000000-0000-4000-8000-000000000004'); assert.equal(intent.endorsementNumber, 2);
  for (const bytes of h.records.values()) assert.equal(bytes.includes(input.accessToken), false);
  const post = h.requests.filter(r => r.options.method === 'POST').at(-1);
  assert.equal(post.options.body, approvalRequest(h.packet).body); assert.equal(post.url, approvalRequest(h.packet).url);
  assert.ok(h.events.lastIndexOf('put:intent') < h.events.lastIndexOf('POST'));
  const calls = h.requests.length;
  assert.deepEqual(await reconcileRenewal(h), result); assert.equal(h.requests.length, calls);
  const second = await h.client.renew(freshRenewal(h, { session_id: '10000000-0000-4000-8000-000000000005' }));
  assert.equal(second.renewalAttempt, 2); assert.equal(second.endorsementNumber, 3);
  assert.equal(h.records.has(`${approvalIdentity(h.packet, 'maker')}/renewal/2/intent`), true);
});

test('same live credential is an explicit no-op, while a later expiry for that session appends', async () => {
  const h = harness(); await h.client.approve(h.input);
  const records = [...h.records.entries()], posts = postCount(h);
  assert.equal((await h.client.renew(h.input)).outcome, 'endorsement-unchanged');
  assert.equal(postCount(h), posts); assert.deepEqual([...h.records.entries()], records);
  const result = await h.client.renew(freshRenewal(h, { session_id: '10000000-0000-4000-8000-000000000003' }));
  assert.equal(result.endorsementNumber, 2); assert.equal(postCount(h), posts + 1);
});

test('an original legacy approval without session evidence requires its first actual new endorsement', async () => {
  const h = harness(); h.observation.approvals = [approved(h.packet)];
  const original = structuredClone(h.observation.approvals[0]);
  const result = await h.client.renew(h.input);
  assert.equal(result.endorsementNumber, 1); assert.equal(result.currentlyUsable, true);
  assert.deepEqual(h.observation.approvals[0], original); assert.equal(postCount(h), 1);
});

for (const committed of [false, true]) test(`lost renewal response committed=${committed} cannot be proven by the original approval or retried`, async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => {
    if (options.method === 'GET') return original(url, options);
    if (committed) await original(url, options); else h.requests.push({ url, options });
    throw Error('private transport loss');
  };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), e => e.requiresReconciliation && e.renewalAttempt === 1);
  for (const client of [h.client, createHostedApprovalClient(h.ports)]) {
    await assert.rejects(client.renew(freshRenewal(h, { session_id: '10000000-0000-4000-8000-000000000005' })), /existing_intent_requires_reconciliation/);
  }
  const requests = h.requests.length;
  if (committed) assert.equal((await reconcileRenewal(h)).outcome, 'endorsement-recorded-and-reconciled');
  else await assert.rejects(reconcileRenewal(h), /new_endorsement_not_durably_observed/);
  assert.equal(h.requests.length, requests); assert.equal(postCount(h), 2);
});

test('a later external endorsement cannot skip unresolved local intent and exact historical reconciliation remains read-only', async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => { const response = await original(url, options); if (options.method === 'POST') throw Error('lost'); return response; };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), /dispatch_outcome_requires_reconciliation/);
  const external = endorsed(h.packet, { number: 3, sessionId: '10000000-0000-4000-8000-000000000005' });
  h.endorsementHistory.push(external); h.observation.endorsements = [external];
  const restarted = createHostedApprovalClient(h.ports), requests = h.requests.length;
  await assert.rejects(restarted.renew(freshRenewal(h)), /existing_intent_requires_reconciliation/);
  const result = await restarted.reconcileRenewal({ packet: h.packet, kind: 'maker', renewalAttempt: 1 });
  assert.equal(result.outcome, 'endorsement-recorded-and-reconciled'); assert.equal(result.currentlyUsable, false); assert.equal(result.currentStatus, 'superseded');
  assert.equal(h.requests.length, requests);
});

test('expiry or revocation after committed renewal changes usability but preserves exact historical receipt', async () => {
  const h = harness(); await h.client.approve(h.input);
  const first = await h.client.renew(freshRenewal(h));
  for (const status of ['expired', 'not-current']) {
    h.observation.endorsements[0].availability = { status, observedAt: '2026-10-23T15:00:00Z' };
    const result = await reconcileRenewal(h);
    assert.equal(result.outcome, 'endorsement-recorded-and-reconciled'); assert.equal(result.currentlyUsable, false);
    assert.equal(result.currentStatus, status); assert.equal(result.receiptSha256, first.receiptSha256);
  }
});

test('lost renewal response reconciles its immutable target after execution and date advancement without authorizing another renewal', async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => { const response = await original(url, options); if (options.method === 'POST') throw Error('lost'); return response; };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), /dispatch_outcome_requires_reconciliation/);
  h.observation.operation.status = 'actions_complete'; h.observation.operation.appliedCount = h.packet.actionCount;
  h.observation.zeroPlan.status = 'complete'; h.observation.control.status = 'open'; h.observation.control.generation++;
  h.observation.control.businessDate = '2026-10-24';
  const requests = h.requests.length, result = await reconcileRenewal(h);
  assert.equal(result.outcome, 'endorsement-recorded-and-reconciled'); assert.equal(result.currentlyUsable, false);
  assert.equal(result.currentStatus, 'operation-not-ready'); assert.equal(h.requests.length, requests);
  await assert.rejects(h.client.renew(freshRenewal(h)), /operation_changed/); assert.equal(h.requests.length, requests);
});

for (const change of [
  h => { h.observation.approvals[0].approvedAt = '2026-10-23T11:59:00Z'; },
  h => { h.observation.endorsements[0].sessionId = '10000000-0000-4000-8000-000000000006'; },
  h => { h.observation.endorsements[0].credentialExpiresAt = '2026-10-23T14:00:00.000001Z'; },
]) test('renewal receipt rejects changed original approval or a different target credential', async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => { const response = await original(url, options); if (options.method === 'POST') change(h); return response; };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), /renewal_receipt_requires_reconciliation/);
  assert.equal(h.records.has(`${approvalIdentity(h.packet, 'maker')}/renewal/1/receipt`), false);
});

test('a rejected fresh session cannot be replaced by an older valid endorsement', async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => options.method === 'GET' ? original(url, options) : new Response(null, { status: 401 });
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), /dispatch_outcome_requires_reconciliation/);
  await assert.rejects(reconcileRenewal(h), /new_endorsement_not_durably_observed/);
});

for (const status of ['expired', 'not-current']) test(`same credential no-op refuses ${status} latest endorsement`, async () => {
  const h = harness(); await h.client.approve(h.input);
  h.observation.endorsements[0].availability = { status, observedAt: '2026-10-23T14:00:00Z' };
  await assert.rejects(h.client.renew(h.input), /endorsement_not_current/); assert.equal(postCount(h), 1);
});

for (const phase of ['intent', 'receipt']) for (const stored of [false, true]) test(`uncertain renewal ${phase} stored=${stored} preserves quarantine`, async () => {
  const h = harness(); await h.client.approve(h.input);
  const original = h.ports.journal.putIfAbsent;
  h.ports.journal.putIfAbsent = async (key, bytes) => {
    if (!key.includes('/renewal/') || !key.endsWith(`/${phase}`)) return original(key, bytes);
    if (stored) await original(key, bytes);
    throw Error('private persistence failure');
  };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), e => e.requiresReconciliation && e.renewalAttempt === 1);
  await assert.rejects(h.client.renew(freshRenewal(h)), /existing_intent_requires_reconciliation/);
  assert.equal(postCount(h), phase === 'receipt' ? 2 : 1);
});

test('renewal refuses execution advancement, mutable selectors, and a changed predecessor before POST', async () => {
  const h = harness(); await h.client.approve(h.input);
  await assert.rejects(h.client.renew({ ...freshRenewal(h), renewalAttempt: 99 }), /input_invalid/);
  h.observation.operation.status = 'actions_complete';
  await assert.rejects(h.client.renew(freshRenewal(h)), /operation_changed/);
  h.observation.operation.status = 'sealed';
  const original = h.ports.fetchImpl;
  h.ports.fetchImpl = async (url, options) => {
    const response = await original(url, options);
    if (options.method === 'GET') h.observation.endorsements = [endorsed(h.packet, { number: 2 })];
    return response;
  };
  h.client = createHostedApprovalClient(h.ports);
  await assert.rejects(h.client.renew(freshRenewal(h)), /pre_dispatch_changed/); assert.equal(postCount(h), 1);
});

test('concurrent renewal clients share one atomic attempt slot and one renewal POST', async () => {
  const h = harness(); await h.client.approve(h.input);
  const other = createHostedApprovalClient(h.ports);
  const results = await Promise.allSettled([h.client.renew(freshRenewal(h)), other.renew(freshRenewal(h))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(postCount(h), 2);
  assert.equal([...h.records.keys()].filter(k => k.includes('/renewal/') && k.endsWith('/intent')).length, 1);
});

test('unresolved original approval and tampered renewal history cannot be skipped by another renewal', async () => {
  const h = harness(); await h.client.approve(h.input);
  const originalReceiptKey = `${approvalIdentity(h.packet, 'maker')}/receipt`, receipt = h.records.get(originalReceiptKey);
  h.records.delete(originalReceiptKey);
  await assert.rejects(h.client.renew(freshRenewal(h)), /existing_intent_requires_reconciliation/); assert.equal(postCount(h), 1);
  h.records.set(originalReceiptKey, receipt);
  await h.client.renew(freshRenewal(h));
  const intentKey = `${approvalIdentity(h.packet, 'maker')}/renewal/1/intent`, intent = JSON.parse(h.records.get(intentKey));
  intent.sessionId = '10000000-0000-4000-8000-000000000099'; h.records.set(intentKey, canonicalJson(intent));
  await assert.rejects(h.client.renew(freshRenewal(h, { session_id: '10000000-0000-4000-8000-000000000005' })), /renewal_receipt_binding_changed/);
  assert.equal(postCount(h), 2);
});
