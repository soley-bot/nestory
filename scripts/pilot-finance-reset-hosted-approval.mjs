// Concrete genuine-session approval transport; never executes a financial reset.
// No CLI, environment lookup, user provisioning, JWT minting or private SQL write.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { HOSTED_SOURCE_FILES, assertApprovalPacket, isNoBackupApprovalPacket, approvalIdentity, approvalObservationQuery, approvalRequest,
  approvalTimestampMicros, approvalReadinessMatches, immutableEndorsement, digestJson, exactKeys, fail, same, validateApprovalObservation } from './pilot-finance-reset-hosted-protocol.mjs';

const root = path.resolve(import.meta.dirname, '..');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const intentFields = ['format', 'packetSha256', 'operationId', 'approvalKind', 'approvedBy', 'zeroReviewSha256', 'requestSha256', 'createdAt'];
const receiptFields = ['format', 'intentSha256', 'packetSha256', 'operationId', 'approvalKind', 'approval', 'observationSha256'];
const renewalIntentFields = ['format', 'packetSha256', 'operationId', 'approvalKind', 'renewalAttempt', 'zeroReviewSha256', 'requestSha256',
  'originalApproval', 'predecessor', 'endorsementNumber', 'sessionId', 'credentialExpiresAt', 'createdAt'];
const renewalReceiptFields = ['format', 'intentSha256', 'packetSha256', 'operationId', 'approvalKind', 'renewalAttempt', 'originalApproval', 'endorsement', 'observationSha256'];
const approvalFields = ['operationId', 'organizationId', 'kind', 'reviewSha256', 'approvedBy', 'approvedAt'];
const endorsementFields = ['endorsementId', 'operationId', 'organizationId', 'kind', 'number', 'reviewSha256', 'actorId', 'sessionId', 'credentialExpiresAt', 'endorsedAt'];
// Bound the append-only journal scan. Reaching this limit refuses another RPC;
// it never skips evidence or permits reusing a prior slot.
const maxRenewalAttempts = 128;
const safeFailure = (code, renewalAttempt) => {
  const error = new Error(code); error.requiresReconciliation = true;
  if (renewalAttempt !== undefined) error.renewalAttempt = renewalAttempt;
  throw error;
};
const validApproval = (packet, kind, a) => exactKeys(a, approvalFields) && a.operationId === packet.operation.operationId &&
  a.organizationId === packet.operation.organizationId && a.kind === kind && a.reviewSha256 === packet.databaseBinding.zeroReviewSha256 &&
  uuid.test(a.approvedBy) && approvalTimestampMicros(a.approvedAt) !== null;
const validEndorsement = (packet, kind, approval, e) => exactKeys(e, endorsementFields) && uuid.test(e.endorsementId) &&
  e.operationId === packet.operation.operationId && e.organizationId === packet.operation.organizationId && e.kind === kind &&
  e.reviewSha256 === packet.databaseBinding.zeroReviewSha256 && e.actorId === approval.approvedBy && uuid.test(e.sessionId) &&
  Number.isSafeInteger(e.number) && e.number > 0 && e.number <= 2147483647 && approvalTimestampMicros(e.endorsedAt) !== null &&
  approvalTimestampMicros(e.credentialExpiresAt) !== null && approvalTimestampMicros(e.credentialExpiresAt) > approvalTimestampMicros(e.endorsedAt);
function renewalTargetMatches(packet, kind, intent, target) {
  return validEndorsement(packet, kind, intent.originalApproval, target) && target.number === intent.endorsementNumber &&
    target.endorsementId !== intent.predecessor?.endorsementId && target.sessionId === intent.sessionId &&
    approvalTimestampMicros(target.credentialExpiresAt) === approvalTimestampMicros(intent.credentialExpiresAt);
}

async function verifySources(packet) {
  for (const name of isNoBackupApprovalPacket(packet) ? packet.sourceFiles.map(source => source.path) : HOSTED_SOURCE_FILES) {
    const expected = packet.sourceFiles.find(f => f.path === name);
    let actual;
    try { actual = hashSourceBytes(await readFile(path.join(root, name))); }
    catch { fail('hosted_approval_source_unavailable'); }
    if (!expected || actual !== expected.sha256) fail('hosted_approval_source_changed');
  }
}

function sessionClaims(token, origin, now) {
  // These unsigned fields only refuse wrong/expired inputs. Identity is never
  // accepted from this decode: a fresh Auth server response is required below.
  try {
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!uuid.test(claims.sub) || !uuid.test(claims.session_id) || claims.iss !== `${origin}/auth/v1` || claims.role !== 'authenticated' ||
      claims.is_anonymous === true || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now / 1000) || claims.exp > 253402300799) throw Error();
    return claims;
  } catch { fail('hosted_approval_session_invalid'); }
}

function validatePublicKey(key, projectRef) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._-]{16,16384}$/.test(key)) fail('hosted_approval_public_key_invalid');
  if (key.startsWith('sb_publishable_')) return;
  try {
    const parts = key.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (parts.length !== 3 || claims.role !== 'anon' || claims.ref !== projectRef) throw Error();
  } catch { fail('hosted_approval_public_key_invalid'); }
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) fail('hosted_approval_auth_response_invalid');
  const parts = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); fail('hosted_approval_auth_response_invalid'); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch { fail('hosted_approval_auth_response_invalid'); }
}

function assertResponseOrigin(response, url) {
  if (!response || response.redirected || (response.url && response.url !== url) || response.status >= 300 && response.status < 400) fail('hosted_approval_redirect_refused');
}

// Ports are implementation boundaries, not evidence flags. The protected reader
// must pin its connection independently; the journal must provide durable atomic
// create-if-absent and strongly consistent byte reads. Neither provider is selected
// here. A memory/mock port proves protocol behavior only, never provider durability.
export function createHostedApprovalClient(options) {
  if (!options || Object.keys(options).some(k => !['fetchImpl', 'observeDatabase', 'journal', 'clock'].includes(k)) ||
    typeof options.observeDatabase !== 'function' || typeof options.journal?.putIfAbsent !== 'function' || typeof options.journal?.read !== 'function' ||
    (options.fetchImpl !== undefined && typeof options.fetchImpl !== 'function') || (options.clock !== undefined && typeof options.clock !== 'function')) fail('hosted_approval_ports_required');
  const { observeDatabase, journal, fetchImpl = globalThis.fetch, clock = Date.now } = options;
  const attemptedSlots = new Set();
  const uncertainRenewals = new Set();
  const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) fail('hosted_approval_clock_invalid'); return value; };
  const observe = async (packet, endorsementNumber = null) => {
    let rows;
    try { rows = await observeDatabase(approvalObservationQuery(packet, endorsementNumber)); }
    catch { fail('hosted_approval_observation_unavailable'); }
    return validateApprovalObservation(packet, structuredClone(rows), endorsementNumber);
  };
  const read = async key => {
    try { const value = await journal.read(key); if (value !== null && typeof value !== 'string') throw Error(); return value; }
    catch { safeFailure('hosted_approval_journal_read_uncertain'); }
  };
  const put = async (key, value, allowExisting = false) => {
    const bytes = canonicalJson(value);
    let created;
    try { created = await journal.putIfAbsent(key, bytes); }
    catch { safeFailure('hosted_approval_journal_write_uncertain'); }
    if (created !== 'created' && !(allowExisting && created === 'exists')) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
    if (await read(key) !== bytes) safeFailure('hosted_approval_journal_readback_mismatch');
  };
  const inspectIntent = (packet, kind, bytes) => {
    let intent;
    try { intent = JSON.parse(bytes); } catch { fail('hosted_approval_intent_invalid'); }
    if (!exactKeys(intent, intentFields) || intent.format !== 'nestory-zero-approval-intent-v1' ||
      intent.packetSha256 !== packet.packetSha256 || intent.operationId !== packet.operation.operationId || intent.approvalKind !== kind ||
      intent.zeroReviewSha256 !== packet.databaseBinding.zeroReviewSha256 || intent.requestSha256 !== digestJson(approvalRequest(packet)) ||
      !uuid.test(intent.approvedBy) || typeof intent.createdAt !== 'string' || !Number.isFinite(Date.parse(intent.createdAt)) || canonicalJson(intent) !== bytes) fail('hosted_approval_intent_binding_changed');
    return intent;
  };
  const recordReconciled = async (packet, kind, intent, observation) => {
    const approval = observation.approvals.find(a => a.kind === kind);
    if (!approval || approval.approvedBy !== intent.approvedBy) safeFailure('hosted_approval_not_durably_observed');
    const key = `${approvalIdentity(packet, kind)}/receipt`;
    const existing = await read(key);
    let receipt;
    if (existing !== null) {
      try { receipt = JSON.parse(existing); } catch { fail('hosted_approval_receipt_invalid'); }
      if (!exactKeys(receipt, receiptFields) || receipt.format !== 'nestory-zero-approval-receipt-v1' ||
        receipt.intentSha256 !== digestJson(intent) || receipt.packetSha256 !== packet.packetSha256 || receipt.operationId !== packet.operation.operationId ||
        receipt.approvalKind !== kind || !same(receipt.approval, approval) || !/^[0-9a-f]{64}$/.test(receipt.observationSha256) ||
        canonicalJson(receipt) !== existing) fail('hosted_approval_receipt_binding_changed');
    } else {
      receipt = { format: 'nestory-zero-approval-receipt-v1', intentSha256: digestJson(intent), packetSha256: packet.packetSha256,
        operationId: packet.operation.operationId, approvalKind: kind, approval, observationSha256: digestJson(observation) };
      await put(key, receipt, true);
    }
    return { operationId: packet.operation.operationId, approvalKind: kind, outcome: 'approval-recorded-and-reconciled',
      receiptSha256: digestJson(receipt), resetExecutionSupported: false, privateActorBridgeImplemented: false };
  };

  const renewalSlot = (packet, kind, attempt) => `${approvalIdentity(packet, kind)}/renewal/${attempt}`;
  const inspectRenewalIntent = (packet, kind, attempt, bytes) => {
    let intent;
    try { intent = JSON.parse(bytes); } catch { fail('hosted_approval_renewal_intent_invalid'); }
    if (!exactKeys(intent, renewalIntentFields) || intent.format !== 'nestory-zero-endorsement-intent-v1' || canonicalJson(intent) !== bytes ||
      intent.packetSha256 !== packet.packetSha256 || intent.operationId !== packet.operation.operationId || intent.approvalKind !== kind ||
      intent.renewalAttempt !== attempt || intent.zeroReviewSha256 !== packet.databaseBinding.zeroReviewSha256 ||
      intent.requestSha256 !== digestJson(approvalRequest(packet)) || !validApproval(packet, kind, intent.originalApproval) ||
      (intent.predecessor !== null && !validEndorsement(packet, kind, intent.originalApproval, intent.predecessor)) ||
      intent.endorsementNumber !== (intent.predecessor?.number ?? 0) + 1 || intent.endorsementNumber > 2147483647 ||
      !uuid.test(intent.sessionId) || approvalTimestampMicros(intent.createdAt) === null || approvalTimestampMicros(intent.credentialExpiresAt) === null ||
      approvalTimestampMicros(intent.credentialExpiresAt) <= approvalTimestampMicros(intent.createdAt) ||
      (intent.predecessor?.sessionId === intent.sessionId && approvalTimestampMicros(intent.credentialExpiresAt) <= approvalTimestampMicros(intent.predecessor.credentialExpiresAt)))
      fail('hosted_approval_renewal_intent_binding_changed');
    return intent;
  };
  const inspectRenewalReceipt = (packet, kind, intent, bytes) => {
    let receipt;
    try { receipt = JSON.parse(bytes); } catch { fail('hosted_approval_renewal_receipt_invalid'); }
    if (!exactKeys(receipt, renewalReceiptFields) || receipt.format !== 'nestory-zero-endorsement-receipt-v1' || canonicalJson(receipt) !== bytes ||
      receipt.intentSha256 !== digestJson(intent) || receipt.packetSha256 !== packet.packetSha256 || receipt.operationId !== packet.operation.operationId ||
      receipt.approvalKind !== kind || receipt.renewalAttempt !== intent.renewalAttempt || !same(receipt.originalApproval, intent.originalApproval) ||
      !renewalTargetMatches(packet, kind, intent, receipt.endorsement) || !/^[a-f0-9]{64}$/.test(receipt.observationSha256)) fail('hosted_approval_renewal_receipt_binding_changed');
    return receipt;
  };
  const nextRenewal = async (packet, kind, approval) => {
    const base = approvalIdentity(packet, kind);
    if (uncertainRenewals.has(base)) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
    const original = await read(`${base}/intent`);
    if (original !== null) {
      const intent = inspectIntent(packet, kind, original);
      if (await read(`${base}/receipt`) === null) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
      await recordReconciled(packet, kind, intent, { approvals: [approval] });
    }
    // Sequential local slots also catch an unresolved attempt when an external
    // genuine renewal advanced the database beyond its intended ordinal.
    for (let attempt = 1; attempt <= maxRenewalAttempts; attempt++) {
      const slot = renewalSlot(packet, kind, attempt), bytes = await read(`${slot}/intent`);
      if (bytes === null) return { attempt, slot };
      const intent = inspectRenewalIntent(packet, kind, attempt, bytes), receipt = await read(`${slot}/receipt`);
      if (receipt === null) safeFailure('hosted_approval_existing_intent_requires_reconciliation', attempt);
      const saved = inspectRenewalReceipt(packet, kind, intent, receipt);
      if (!same(saved.originalApproval, approval)) fail('hosted_approval_original_approval_changed');
    }
    fail('hosted_approval_renewal_journal_limit');
  };
  const recordRenewal = async (packet, kind, intent, observation) => {
    const approval = observation.approvals.find(a => a.kind === kind);
    const target = observation.targetEndorsements.find(e => e.kind === kind);
    if (!same(approval, intent.originalApproval) || !renewalTargetMatches(packet, kind, intent, target))
      safeFailure('hosted_approval_new_endorsement_not_durably_observed', intent.renewalAttempt);
    const key = `${renewalSlot(packet, kind, intent.renewalAttempt)}/receipt`, existing = await read(key);
    let receipt;
    if (existing !== null) {
      receipt = inspectRenewalReceipt(packet, kind, intent, existing);
      if (!same(receipt.endorsement, target)) fail('hosted_approval_renewal_receipt_binding_changed');
    } else {
      receipt = { format: 'nestory-zero-endorsement-receipt-v1', intentSha256: digestJson(intent), packetSha256: packet.packetSha256,
        operationId: packet.operation.operationId, approvalKind: kind, renewalAttempt: intent.renewalAttempt,
        originalApproval: intent.originalApproval, endorsement: target, observationSha256: digestJson(observation) };
      await put(key, receipt, true);
    }
    const latest = observation.endorsements.find(e => e.kind === kind);
    let currentStatus = latest?.endorsementId === target.endorsementId ? latest.availability.status : 'superseded';
    if (currentStatus === 'current' && !approvalReadinessMatches(packet, observation)) currentStatus = 'operation-not-ready';
    uncertainRenewals.delete(approvalIdentity(packet, kind));
    return { operationId: packet.operation.operationId, approvalKind: kind, renewalAttempt: intent.renewalAttempt,
      endorsementNumber: target.number, outcome: 'endorsement-recorded-and-reconciled', currentlyUsable: currentStatus === 'current', currentStatus,
      receiptSha256: digestJson(receipt), resetExecutionSupported: false, privateActorBridgeImplemented: false };
  };

  return Object.freeze({
    async renew(input) {
      if (!exactKeys(input, ['packet', 'kind', 'accessToken', 'publishableKey'])) fail('hosted_approval_input_invalid');
      const { kind, accessToken, publishableKey } = input, packet = structuredClone(input.packet);
      assertApprovalPacket(packet);
      if (packet.evidenceBlockers.some(blocker => blocker !== 'missing_actorApprovals')) fail('hosted_approval_review_evidence_incomplete');
      const base = approvalIdentity(packet, kind);
      await verifySources(packet);
      validatePublicKey(publishableKey, packet.operation.projectRef);
      const origin = `https://${packet.operation.projectRef}.supabase.co`, claims = sessionClaims(accessToken, origin, now());
      const before = await observe(packet), approval = before.approvals.find(a => a.kind === kind);
      if (!approval) fail('hosted_approval_original_approval_required');
      const predecessor = immutableEndorsement(before.endorsements.find(e => e.kind === kind));
      const { attempt, slot } = await nextRenewal(packet, kind, approval);
      const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
      const requestOptions = { redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
      const authUrl = `${origin}/auth/v1/user`;
      let response;
      try { response = await fetchImpl(authUrl, { ...requestOptions, method: 'GET', headers, signal: AbortSignal.timeout(15000) }); }
      catch { fail('hosted_approval_auth_unavailable'); }
      assertResponseOrigin(response, authUrl);
      if (response.status !== 200) fail('hosted_approval_session_rejected');
      const user = await boundedJson(response);
      if (user?.id !== approval.approvedBy || user.id !== claims.sub || user.role !== 'authenticated' || user.is_anonymous !== false) fail('hosted_approval_actor_mismatch');
      sessionClaims(accessToken, origin, now());
      const current = await observe(packet), latest = current.endorsements.find(e => e.kind === kind);
      if (!same(current.approvals.find(a => a.kind === kind), approval) || !same(immutableEndorsement(latest), predecessor)) fail('hosted_approval_pre_dispatch_changed');
      const credentialExpiresAt = new Date(claims.exp * 1000).toISOString();
      if (predecessor?.sessionId === claims.session_id && approvalTimestampMicros(credentialExpiresAt) <= approvalTimestampMicros(predecessor.credentialExpiresAt)) {
        if (latest.availability.status !== 'current') fail('hosted_approval_endorsement_not_current');
        return { operationId: packet.operation.operationId, approvalKind: kind, outcome: 'endorsement-unchanged',
          endorsementNumber: predecessor.number, currentlyUsable: true, resetExecutionSupported: false, privateActorBridgeImplemented: false };
      }
      await verifySources(packet);
      const request = approvalRequest(packet), intent = { format: 'nestory-zero-endorsement-intent-v1', packetSha256: packet.packetSha256,
        operationId: packet.operation.operationId, approvalKind: kind, renewalAttempt: attempt, zeroReviewSha256: packet.databaseBinding.zeroReviewSha256,
        requestSha256: digestJson(request), originalApproval: approval, predecessor, endorsementNumber: (predecessor?.number ?? 0) + 1,
        sessionId: claims.session_id, credentialExpiresAt, createdAt: new Date(now()).toISOString() };
      inspectRenewalIntent(packet, kind, attempt, canonicalJson(intent));
      if (attemptedSlots.has(slot) || uncertainRenewals.has(base)) safeFailure('hosted_approval_existing_intent_requires_reconciliation', attempt);
      attemptedSlots.add(slot); uncertainRenewals.add(base);
      try { await put(`${slot}/intent`, intent); }
      catch { safeFailure('hosted_approval_renewal_journal_requires_reconciliation', attempt); }
      try {
        if (isNoBackupApprovalPacket(packet)) await verifySources(packet);
        sessionClaims(accessToken, origin, now());
        response = await fetchImpl(request.url, { ...requestOptions, method: request.method, body: request.body,
          headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
        assertResponseOrigin(response, request.url);
        if (![200, 204].includes(response.status)) throw Error();
        await response.body?.cancel();
      } catch { safeFailure('hosted_approval_dispatch_outcome_requires_reconciliation', attempt); }
      try { return await recordRenewal(packet, kind, intent, await observe(packet, intent.endorsementNumber)); }
      catch { safeFailure('hosted_approval_renewal_receipt_requires_reconciliation', attempt); }
    },
    async reconcileRenewal(input) {
      if (!exactKeys(input, ['packet', 'kind', 'renewalAttempt']) || !Number.isSafeInteger(input.renewalAttempt) ||
        input.renewalAttempt < 1 || input.renewalAttempt > maxRenewalAttempts) fail('hosted_approval_input_invalid');
      const { kind, renewalAttempt } = input, packet = structuredClone(input.packet);
      assertApprovalPacket(packet);
      const slot = renewalSlot(packet, kind, renewalAttempt);
      await verifySources(packet);
      const bytes = await read(`${slot}/intent`);
      if (bytes === null) fail('hosted_approval_original_intent_required');
      const intent = inspectRenewalIntent(packet, kind, renewalAttempt, bytes);
      return recordRenewal(packet, kind, intent, await observe(packet, intent.endorsementNumber));
    },
    async approve(input) {
      if (!exactKeys(input, ['packet', 'kind', 'accessToken', 'publishableKey'])) fail('hosted_approval_input_invalid');
      const { kind, accessToken, publishableKey } = input;
      const packet = structuredClone(input.packet);
      assertApprovalPacket(packet);
      // Collecting approvals must not require the resulting approval artifact
      // already to exist. Its absence remains a reset-readiness blocker; all
      // other reviewed evidence is still required before this limited RPC.
      if (packet.evidenceBlockers.some(blocker => blocker !== 'missing_actorApprovals')) fail('hosted_approval_review_evidence_incomplete');
      const slot = approvalIdentity(packet, kind);
      await verifySources(packet);
      if (attemptedSlots.has(slot)) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
      if (await read(`${slot}/intent`) !== null) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
      validatePublicKey(publishableKey, packet.operation.projectRef);
      const origin = `https://${packet.operation.projectRef}.supabase.co`;
      const claims = sessionClaims(accessToken, origin, now());
      const before = await observe(packet);
      if (before.approvals.some(a => a.kind === kind)) fail('hosted_approval_already_recorded');
      const actorId = before.zeroPlan[`${kind}ActorId`];
      const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
      const requestOptions = { redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
      const authUrl = `${origin}/auth/v1/user`;
      let response;
      try { response = await fetchImpl(authUrl, { ...requestOptions, method: 'GET', headers, signal: AbortSignal.timeout(15000) }); }
      catch { fail('hosted_approval_auth_unavailable'); }
      assertResponseOrigin(response, authUrl);
      if (response.status !== 200) fail('hosted_approval_session_rejected');
      const user = await boundedJson(response);
      if (user?.id !== actorId || user.id !== claims.sub || user.role !== 'authenticated' || user.is_anonymous !== false) fail('hosted_approval_actor_mismatch');
      // The server response established identity; revalidate expiry and unchanged
      // operation/role immediately before durable intent and the only POST.
      sessionClaims(accessToken, origin, now());
      const current = await observe(packet);
      if (current.zeroPlan[`${kind}ActorId`] !== actorId || current.approvals.some(a => a.kind === kind)) fail('hosted_approval_pre_dispatch_changed');
      await verifySources(packet);
      const request = approvalRequest(packet);
      const intent = { format: 'nestory-zero-approval-intent-v1', packetSha256: packet.packetSha256, operationId: packet.operation.operationId,
        approvalKind: kind, approvedBy: actorId, zeroReviewSha256: packet.databaseBinding.zeroReviewSha256,
        requestSha256: digestJson(request), createdAt: new Date(now()).toISOString() };
      if (attemptedSlots.has(slot)) safeFailure('hosted_approval_existing_intent_requires_reconciliation');
      // Quarantine this client even if the durable intent write itself loses its
      // acknowledgement. A restarted worker also needs operator reconciliation
      // of any journal outage; an empty local cache is not restart permission.
      attemptedSlots.add(slot);
      await put(`${slot}/intent`, intent);
      try {
        if (isNoBackupApprovalPacket(packet)) await verifySources(packet);
        sessionClaims(accessToken, origin, now());
        response = await fetchImpl(request.url, { ...requestOptions, method: request.method, body: request.body,
          headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
        assertResponseOrigin(response, request.url);
        // HTTP success is insufficient. Every lost/rejected/malformed outcome
        // leaves the original intent for a separate read-only reconciliation.
        if (![200, 204].includes(response.status)) throw Error();
        await response.body?.cancel();
      } catch { safeFailure('hosted_approval_dispatch_outcome_requires_reconciliation'); }
      try { return await recordReconciled(packet, kind, intent, await observe(packet)); }
      catch { safeFailure('hosted_approval_receipt_requires_reconciliation'); }
    },
    async reconcile(input) {
      if (!exactKeys(input, ['packet', 'kind'])) fail('hosted_approval_input_invalid');
      const { kind } = input;
      const packet = structuredClone(input.packet);
      assertApprovalPacket(packet);
      const slot = approvalIdentity(packet, kind);
      await verifySources(packet);
      const bytes = await read(`${slot}/intent`);
      if (bytes === null) fail('hosted_approval_original_intent_required');
      const intent = inspectIntent(packet, kind, bytes);
      return recordReconciled(packet, kind, intent, await observe(packet));
    },
  });
}
