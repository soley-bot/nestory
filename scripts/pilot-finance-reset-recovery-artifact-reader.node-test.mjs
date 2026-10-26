// Offline synthetic evidence only. Real AES and exclusive filesystem records;
// no customer data, DB, network, persistent keys or hosted durability claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createSecretKey, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, hashBytes, prepareOperatorPacket, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { createSyntheticDirectoryStore, inspectLocalStoreMechanism } from './pilot-finance-reset-durable-store.mjs';
import { artifactSlot, createEncryptedArtifactProvider } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { createSupplementalRecoveryReader } from './pilot-finance-reset-recovery-artifact-reader.mjs';
import { hostedBinding, mutationSql, validateArtifacts } from './pilot-finance-reset-hosted-transport-protocol.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const copy = value => JSON.parse(canonicalJson(value));
const quoted = JSON.stringify;
const originalZeroPlan = (operation,binding) => ({ operation_id:operation.operationId,organization_id:operation.organizationId,
  manifest_sha256:binding.manifestSha256,reset_plan_sha256:binding.planSha256,effective_date:operation.cutoff });
// Fixed native PostgreSQL jsonb text vectors, independently spelling out the
// key order and spaces used by financial_reset_action_digest. No generic JSON
// serializer under test is reused to build expected database hashes.
const primaryText = value => Object.keys(value).length === 1 ? `{"id": ${quoted(value.id)}}` :
  `{"z": ${quoted(value.z)}, "aa": ${quoted(value.aa)}, "id": ${quoted(value.id)}}`;
function mappingText(actions) {
  return `[${actions.map(a => `{"kind": ${quoted(a.kind)}, "ordinal": ${a.ordinal}, "action_id": ${quoted(a.action_id)}, "primary_key": ${primaryText(a.primary_key)}, "after_sha256": ${quoted(a.after_sha256)}, "before_sha256": ${quoted(a.before_sha256)}, "relation_name": ${quoted(a.relation_name)}}`).join(', ')}]`;
}
function phaseText(p) {
  return `{"schema_sha256": ${quoted(p.schema_sha256)}, "source_sha256": ${quoted(p.source_sha256)}, "sources_sha256": ${quoted(p.sources_sha256)}, "zero_review_sha256": ${quoted(p.zero_review_sha256)}, "zero_authority_sha256": ${quoted(p.zero_authority_sha256)}, "report_checkpoint_sha256": ${quoted(p.report_checkpoint_sha256)}, "continuation_after_sha256": ${quoted(p.continuation_after_sha256)}, "continuation_before_sha256": ${quoted(p.continuation_before_sha256)}, "continuation_review_sha256": ${quoted(p.continuation_review_sha256)}}`;
}
async function filesystem(t) {
  const parent = await realpath(os.tmpdir()), directory = await mkdtemp(path.join(parent, 'pilot-reset-supplemental-test-'));
  t.after(async () => {
    const actual = await realpath(directory);
    assert.equal(path.dirname(actual), parent);
    assert.match(path.basename(actual), /^pilot-reset-supplemental-test-/);
    await rm(actual, { recursive: true });
  });
  const options = { directory, storeId: randomUUID() };
  return { storeOptions: options, store: await createSyntheticDirectoryStore(options) };
}
function originalFixture() {
  const encrypted = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, `synthetic-original-encrypted-${role}`]));
  const review = { format: 'nestory-protected-reset-review-v1', operation: { operationId: id(10), organizationId: id(11),
    projectRef: 's'.repeat(20), mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01',
    issueDate: '2026-10-01', timezone: 'Asia/Phnom_Penh', executionBusinessDate: '2026-10-23', invoiceDatePolicy: 'original-reviewed-october' },
  schemaSha256: 'a'.repeat(64), ledgerSha256: 'b'.repeat(64), sourceSnapshotSha256: 'c'.repeat(64), archiveRows: 1, actionCount: 1,
  databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256',
    'continuationSemanticSha256', 'reportReviewSha256'].map((name, index) => [name, String(index + 1).repeat(64)])),
  artifacts: Object.fromEntries(Object.entries(encrypted).map(([role, bytes]) => [role, hashBytes(bytes)])) };
  review.databaseBinding.zeroReviewSha256=hashBytes(JSON.stringify(originalZeroPlan(review.operation,review.databaseBinding)));
  const sources = [...SOURCE_ENTRYPOINTS, 'supabase/migrations/20261024013620_financial_reset_report_finalization_checkpoint.sql']
    .map(name => ({ path: name, sha256: hashBytes(name) }));
  return prepareOperatorPacket({ review, sources, artifacts: encrypted, candidateHead: review.operation.mainSha });
}
function action({ kind = 'restore', relation = 'public.financial_month_locks', number = 30, primary = { id: id(number) }, before = null, after } = {}) {
  const image = { ...primary, organization_id: id(11), note: 'synthetic-only' };
  const beforeText = before === null ? null : JSON.stringify({ ...image, ...before });
  const afterText = kind === 'recovery-prune' ? null : JSON.stringify({ ...image, ...after });
  return { action_id: id(number + 100), ordinal: 1, relation_name: relation, primary_key: primary, kind,
    before_row_text: beforeText, after_row_text: afterText, before_sha256: beforeText === null ? null : hashBytes(beforeText),
    after_sha256: afterText === null ? null : hashBytes(afterText), changed_columns: before === null || kind === 'recovery-prune' ? [] : ['status'],
    ...(before === null && kind === 'restore' ? { insert_columns: Object.keys(JSON.parse(afterText)) } : {}) };
}
function recoveryFixture(packet, actions = [action()]) {
  const b = packet.databaseBinding, o = packet.operation;
  const phaseBinding = { schema_sha256: packet.schemaSha256, zero_review_sha256: b.zeroReviewSha256,
    zero_authority_sha256: 'd'.repeat(64), continuation_review_sha256: 'e'.repeat(64), continuation_before_sha256: 'f'.repeat(64),
    continuation_after_sha256: '8'.repeat(64), report_checkpoint_sha256: '9'.repeat(64), source_sha256: 'a'.repeat(64), sources_sha256: 'b'.repeat(64) };
  const review = { operation: { operation_id: id(20), organization_id: o.organizationId, operation_kind: 'restore', restore_of: o.operationId,
    source_generation: o.targetGeneration, target_generation: o.targetGeneration + 1, manifest_sha256: b.manifestSha256,
    plan_sha256: 'c'.repeat(64), schema_sha256: packet.schemaSha256, archive_sha256: b.archiveSha256, archive_count: packet.archiveRows,
    action_sha256: hashBytes(mappingText(actions)), action_count: actions.length, audit_timestamp: '2026-10-23T23:17:09.123456+00:00', audit_actor: null },
  actions, phaseBinding, phaseBindingSha256: hashBytes(phaseText(phaseBinding)), executionBusinessDate: '2026-10-24' };
  const expected = { restoreOperationId: review.operation.operation_id, originalOperationId: o.operationId, projectRef: o.projectRef,
    organizationId: o.organizationId, mainSha: o.mainSha, sourcesSha256: packet.sourcesSha256,
    reportCheckpointSha256: phaseBinding.report_checkpoint_sha256, postSourceSha256: phaseBinding.source_sha256,
    recoverySourcesSha256: phaseBinding.sources_sha256, phaseBindingSha256: review.phaseBindingSha256,
    actionMappingSha256: review.operation.action_sha256, executionBusinessDate: review.executionBusinessDate };
  return { review, expected };
}
async function fixture(t, changes = {}) {
  const f = await filesystem(t), packet = originalFixture();
  const initial = recoveryFixture(packet, changes.actions), review = copy(initial.review), expected = copy(initial.expected);
  changes.review?.(review); changes.expected?.(expected);
  const secret = createSecretKey(randomBytes(32)), keyProvider = { resolveKey: async () => secret };
  const provider = createEncryptedArtifactProvider({ store: f.store, keyProvider });
  const binding = { operationId: initial.expected.restoreOperationId, projectRef: packet.operation.projectRef,
    organizationId: packet.operation.organizationId, mainSha: packet.operation.mainSha,
    sourceSnapshotSha256: initial.expected.postSourceSha256, sourcesSha256: packet.sourcesSha256, role: 'recoveryPlan' };
  const prepared = await provider.prepare({ binding, keyId: 'synthetic-transient-recovery-key',
    plaintext: Buffer.from(changes.encode ? changes.encode(review) : canonicalJson(review)) });
  const slot = artifactSlot(binding);
  await provider.putPrepared({ slot, prepared });
  // The test verifier authenticates separately pinned evidence with a distinct
  // transient HMAC key. This tests the callback boundary, not customer consent.
  const authorityKey = createSecretKey(randomBytes(32));
  const approved = { packetSha256: packet.packetSha256, expected: initial.expected,
    reviewSha256: hashBytes(canonicalJson(initial.review)), artifactSha256: prepared.descriptor.ciphertextSha256 };
  const signature = createHmac('sha256', authorityKey).update(canonicalJson(approved)).digest();
  let revoked = false, calls = 0, observed;
  async function verifyRecoveryAuthority(value) {
    calls++; observed = value;
    const current = { packetSha256: value.packetSha256, expected: value.expected,
      reviewSha256: hashBytes(canonicalJson(value.review)), artifactSha256: value.artifactSha256 };
    const actual = createHmac('sha256', authorityKey).update(canonicalJson(current)).digest();
    if (revoked || !timingSafeEqual(signature, actual) || value.originalPacket.packetSha256 !== approved.packetSha256) throw Error('synthetic authority refused');
    return Object.freeze({ authoritySha256: hashBytes(signature) });
  }
  const options = { provider, originalPacket: packet, descriptor: prepared.descriptor, expected, verifyRecoveryAuthority };
  return { ...f, packet, review, expected, initial, prepared, slot, keyProvider, provider, options,
    get calls() { return calls; }, get observed() { return observed; }, revoke() { revoked = true; } };
}
function interceptProvider(f, read) {
  return createEncryptedArtifactProvider({ keyProvider: f.keyProvider, store: { read,
    putIfAbsent() { throw Error('reader attempted a write'); } } });
}
const readWith = (f, extra = {}) => createSupplementalRecoveryReader({ ...f.options, ...extra }).readRecoveryReview();

test('real AES committed read returns the new ciphertext digest and independently bound immutable review', async t => {
  const f = await fixture(t), original = canonicalJson(f.packet), result = await readWith(f);
  assert.deepEqual(result, { review: f.review, artifactSha256: f.prepared.descriptor.ciphertextSha256 });
  assert.notEqual(result.artifactSha256, f.prepared.descriptor.plaintextSha256);
  assert.notEqual(result.artifactSha256, f.packet.artifacts.recoveryPlan.sha256);
  assert.equal(Object.isFrozen(result.review.actions[0]), true);
  assert.equal(canonicalJson(f.packet), original);
  assert.equal(f.packet.operation.issueDate, '2026-10-01');
  assert.equal(result.review.operation.audit_timestamp, '2026-10-23T23:17:09.123456+00:00');
  assert.equal(f.observed.originalPacket.sourceSnapshotSha256, f.packet.sourceSnapshotSha256);
  assert.equal(f.observed.descriptor.binding.sourceSnapshotSha256, f.expected.postSourceSha256);
  assert.notEqual(f.observed.originalPacket.sourceSnapshotSha256, f.expected.postSourceSha256);
  assert.equal(f.observed.slot, `financial-reset/${f.expected.restoreOperationId}/artifact/recoveryPlan`);
  assert.equal(f.calls, 1);
  assert.equal(inspectLocalStoreMechanism(f.store).kind, 'synthetic-file-sync-only', 'Windows file sync is not strict POSIX durability evidence.');
  const bytes = await f.store.read(`${f.slot}/ciphertext`);
  assert.equal(bytes.includes(Buffer.from(canonicalJson(f.review))), false);
  assert.equal(JSON.parse(bytes).algorithm, 'aes-256-gcm');
});

test('filesystem/provider restart rereads receipt and independently rechecks authority without writing', async t => {
  const f = await fixture(t);
  await readWith(f);
  const store = await createSyntheticDirectoryStore(f.storeOptions);
  const provider = interceptProvider(f, key => store.read(key));
  assert.deepEqual(await readWith(f, { provider }), { review: f.review, artifactSha256: f.prepared.descriptor.ciphertextSha256 });
  f.revoke();
  await assert.rejects(readWith(f, { provider }), /authority_unavailable/);
  assert.equal(f.calls, 3);
});

test('one committed observation requires the receipt and refuses its later disappearance', async t => {
  const f = await fixture(t); let receiptReads = 0;
  const provider = interceptProvider(f, async key => {
    if (key === `${f.slot}/receipt` && ++receiptReads > 1) return null;
    return f.store.read(key);
  });
  const reader = createSupplementalRecoveryReader({ ...f.options, provider: { readCommitted: provider.readCommitted,
    read() { assert.fail('permissive read'); }, reconcile() { assert.fail('separate reconciliation'); } } });
  await reader.readRecoveryReview();
  assert.equal(receiptReads, 1);
  await assert.rejects(reader.readRecoveryReview(), /committed_read_unavailable/);
  assert.equal(receiptReads, 2); assert.equal(f.calls, 1);
});

test('absent/altered receipt, intent and ciphertext and wrong AES key all fail before authority', async t => {
  const f = await fixture(t);
  for (const [part, replacement] of [['receipt', null], ['receipt', Buffer.from('{}')], ['intent', null], ['ciphertext', Buffer.from('{}')]]) {
    const provider = interceptProvider(f, key => key === `${f.slot}/${part}` ? replacement : f.store.read(key));
    await assert.rejects(readWith(f, { provider }), /committed_read_unavailable/);
  }
  const provider = createEncryptedArtifactProvider({ store: f.store, keyProvider: { resolveKey: async () => createSecretKey(randomBytes(32)) } });
  await assert.rejects(readWith(f, { provider }), /committed_read_unavailable/);
  assert.equal(f.calls, 0);
});

test('configuration pins exact expected fields, original packet and new restore descriptor before I/O', async t => {
  const f = await fixture(t); let reads = 0;
  const base = { ...f.options, provider: { async readCommitted() { reads++; assert.fail('configuration must fail first'); } } };
  for (const name of Object.keys(f.expected)) {
    const expected = copy(f.expected); delete expected[name];
    assert.throws(() => createSupplementalRecoveryReader({ ...base, expected }), /expected_invalid/);
  }
  for (const name of ['originalOperationId', 'restoreOperationId', 'projectRef', 'organizationId', 'mainSha', 'sourcesSha256', 'postSourceSha256']) {
    const expected = copy(f.expected); expected[name] = name.endsWith('Id') ? id(900) : name === 'projectRef' ? 'q'.repeat(20) : name === 'mainSha' ? 'b'.repeat(40) : 'f'.repeat(64);
    assert.throws(() => createSupplementalRecoveryReader({ ...base, expected }), /binding_mismatch/);
  }
  for (const change of [d => { d.extra = true; }, d => { d.binding.role = 'archive'; },
    d => { d.binding.operationId = f.packet.operation.operationId; }, d => { d.binding.sourceSnapshotSha256 = f.packet.sourceSnapshotSha256; },
    d => { d.binding.sourcesSha256 = 'f'.repeat(64); }]) {
    const descriptor = copy(f.prepared.descriptor); change(descriptor);
    assert.throws(() => createSupplementalRecoveryReader({ ...base, descriptor }), /descriptor_/);
  }
  assert.throws(() => createSupplementalRecoveryReader({ ...base, expected: { ...f.expected, approval: true } }), /expected_invalid/);
  assert.throws(() => createSupplementalRecoveryReader({ ...base, expected: { ...f.expected, restoreOperationId: f.expected.originalOperationId } }), /expected_invalid/);
  assert.throws(() => createSupplementalRecoveryReader({ ...base, expected: { ...f.expected, executionBusinessDate: '2026-02-30' } }), /expected_invalid/);
  assert.equal(reads, 0); assert.equal(f.calls, 0);
});

test('authenticated but wrong checkpoint, source, phase, action map or operation cannot reach authority', async t => {
  const cases = [r => { r.operation.restore_of = id(999); }, r => { r.operation.operation_id = id(999); },
    r => { r.operation.archive_sha256 = 'f'.repeat(64); }, r => { r.operation.audit_actor = id(999); },
    r => { r.phaseBinding.report_checkpoint_sha256 = 'f'.repeat(64); }, r => { r.phaseBinding.source_sha256 = 'f'.repeat(64); },
    r => { r.phaseBinding.sources_sha256 = 'f'.repeat(64); }, r => { r.phaseBinding.zero_review_sha256 = 'f'.repeat(64); },
    r => { r.phaseBindingSha256 = hashBytes(canonicalJson(r.phaseBinding)); },
    r => { r.actions[0].action_id = id(998); }, r => { r.operation.action_sha256 = 'f'.repeat(64); },
    r => { r.executionBusinessDate = '2026-10-25'; }, r => { r.phaseBinding.extra = 'f'.repeat(64); },
    r => { r.actions[0].sql = 'unreviewed'; }, r => { r.extra = true; }];
  for (const change of cases) {
    const f = await fixture(t, { review: change });
    await assert.rejects(readWith(f), /reset_recovery_artifact_/);
    assert.equal(f.calls, 0);
  }
});

test('descriptor ciphertext substitution and malformed plaintext cannot bypass committed authentication', async t => {
  const f = await fixture(t), descriptor = copy(f.prepared.descriptor);
  descriptor.ciphertextSha256 = 'f'.repeat(64);
  await assert.rejects(readWith(f, { descriptor }), /committed_read_unavailable/);
  for (const encode of [() => '{broken', r => JSON.stringify(r, null, 2), r => `{"executionBusinessDate":"ignored",${canonicalJson(r).slice(1)}`]) {
    const invalid = await fixture(t, { encode });
    await assert.rejects(readWith(invalid), /reset_recovery_artifact_/);
    assert.equal(invalid.calls, 0);
  }
});

test('authority is mandatory, authenticated independently, sanitized and never cached', async t => {
  const f = await fixture(t);
  for (const receipt of [true, false, null, undefined, 42, 'approved', []]) {
    await assert.rejects(readWith(f, { verifyRecoveryAuthority: async () => receipt }), /authority_receipt_missing/);
  }
  await assert.rejects(readWith(f, { verifyRecoveryAuthority() { throw Error('SYNTHETIC_PRIVATE_AUTHORITY_DETAIL'); } }),
    error => error.message === 'reset_recovery_artifact_authority_unavailable' && error.requiresReconciliation === true);
  const wrong = await fixture(t, { review(r) { r.operation.plan_sha256 = 'e'.repeat(64); } });
  await assert.rejects(readWith(wrong), /authority_unavailable/);
  assert.equal(wrong.calls, 1, 'A structurally valid but separately unapproved review must still be refused.');
  await readWith(f); f.revoke(); await assert.rejects(readWith(f), /authority_unavailable/);
});

test('reader snapshots caller and verifier inputs, clears raw plaintext, and returns fresh frozen values', async t => {
  const f = await fixture(t), expected = copy(f.expected), descriptor = copy(f.prepared.descriptor), originalPacket = copy(f.packet);
  let plaintext;
  const provider = { async readCommitted(request) { plaintext = await f.provider.readCommitted(request); return plaintext; } };
  const reader = createSupplementalRecoveryReader({ ...f.options, provider, expected, descriptor, originalPacket,
    async verifyRecoveryAuthority(observed) {
      const receipt = await f.options.verifyRecoveryAuthority(observed);
      observed.review.actions[0].relation_name = 'public.people'; observed.expected.postSourceSha256 = 'f'.repeat(64);
      assert.equal(plaintext.every(value => value === 0), true);
      return receipt;
    } });
  expected.postSourceSha256 = 'f'.repeat(64); descriptor.binding.role = 'archive'; originalPacket.operation.operationId = id(999);
  const first = await reader.readRecoveryReview();
  assert.deepEqual(first.review, f.review);
  assert.throws(() => { first.review.operation.operation_id = id(999); }, TypeError);
  const second = await reader.readRecoveryReview();
  assert.deepEqual(second, first); assert.notEqual(second.review, first.review);
});

test('bounded native mapping preserves key order, Unicode/escaping and safe integer primary keys', async t => {
  const primary = { id: id(30), aa: 'Café 雪 😀 \" \\ \n\t\b\f\r / \u2028', z: 9007199254740991 };
  const f = await fixture(t, { actions: [action({ primary })] });
  assert.match(mappingText(f.review.actions), /"primary_key": \{"z": 9007199254740991, "aa":/);
  assert.notEqual(hashBytes(canonicalJson(f.review.phaseBinding)), f.expected.phaseBindingSha256);
  assert.notEqual(hashBytes(canonicalJson(f.review.actions)), f.expected.actionMappingSha256);
  assert.deepEqual((await readWith(f)).review, f.review);
  for (const value of ['\ud800', '\0']) {
    const invalid = await fixture(t, { actions: [action({ primary: { id: value } })] });
    await assert.rejects(readWith(invalid), /mapping_value_unsupported/);
    assert.equal(invalid.calls, 0);
  }
});

test('fractional, unsafe and negative-zero primary keys cannot be silently normalized into a reviewed mapping', async t => {
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, -0]) {
    const f = await fixture(t, { review(r) {
      r.actions[0].primary_key.id = value;
      const row = JSON.parse(r.actions[0].after_row_text); row.id = value;
      r.actions[0].after_row_text = JSON.stringify(row);
      r.actions[0].after_sha256 = hashBytes(r.actions[0].after_row_text);
    }, encode(r) {
      const encoded = JSON.stringify(r);
      return Object.is(value, -0) ? encoded.replace('"primary_key":{"id":0}', '"primary_key":{"id":-0}') : encoded;
    } });
    await assert.rejects(readWith(f), /reset_recovery_artifact_/);
    assert.equal(f.calls, 0);
  }
});

test('recovery-specific generated contracts and exact repair remain distinct from reset deletion scope', async t => {
  const actions = [action({ kind: 'recovery-prune', relation: 'public.lease_billing_terms', number: 31, before: {} }),
    action({ kind: 'recovery-repair', relation: 'public.lease_terms', number: 32, before: { status: 'expired' }, after: { status: 'active' } }), action()]
    .map((value, index) => ({ ...value, ordinal: index + 1 }));
  const f = await fixture(t, { actions });
  assert.deepEqual((await readWith(f)).review.actions, actions);
  for (const change of [r => { r.actions[0].relation_name = 'public.people'; }, r => { r.actions[1].changed_columns = ['id']; },
    r => { r.actions[1].kind = 'normalization'; }, r => { r.actions[0].changed_columns = ['status']; },
    r => { r.actions[2].after_sha256 = 'f'.repeat(64); }]) {
    const invalid = await fixture(t, { actions, review: change });
    await assert.rejects(readWith(invalid), /reset_recovery_artifact_/); assert.equal(invalid.calls, 0);
  }
});

test('returned API is consumed by current hosted validation, binding and recovery SQL construction', async t => {
  const f = await fixture(t), p = f.packet, o = p.operation, b = p.databaseBinding, recovery = await readWith(f);
  const row = f.review.actions[0], originalOperation = { ...f.review.operation, operation_id: o.operationId, operation_kind: 'reset',
    restore_of: null, source_generation: o.sourceGeneration, target_generation: o.targetGeneration, plan_sha256: b.planSha256,
    action_sha256: b.actionSha256, action_count: 1 };
  const artifacts = { manifest: { manifest_sha256: b.manifestSha256, source_snapshot_sha256: p.sourceSnapshotSha256,
    schema_sha256: p.schemaSha256, ledger_sha256: p.ledgerSha256 },
  actions: { operation: originalOperation, actions: [{ ...row, kind: 'archive-delete', before_row_text: row.after_row_text,
    before_sha256: row.after_sha256, after_row_text: null, after_sha256: null }] },
  archive: [{ relation_name: row.relation_name, primary_key: row.primary_key, row_text: row.after_row_text, row_sha256: row.after_sha256 }],
  zeroPlan: originalZeroPlan(o,b),zeroPlanText:JSON.stringify(originalZeroPlan(o,b)),
  continuationPlan: { actor_id: id(1), billing_period_start: o.cutoff, issue_date: o.issueDate },
  reportPlan: { report_review_sha256: b.reportReviewSha256 } };
  validateArtifacts(p, artifacts, recovery);
  const binding = hostedBinding(p, artifacts.continuationPlan, recovery);
  assert.equal(binding.recovery.operation_id, f.expected.restoreOperationId);
  assert.equal(binding.recovery.review_artifact_sha256, f.prepared.descriptor.ciphertextSha256);
  const sql = mutationSql({ binding, action: 'prepare-recovery', authorizationId: id(99), authoritySha256: 'e'.repeat(64),
    observation: { catalog: [], ledger: [] }, artifacts, recovery });
  assert.ok(sql.includes(`prepare_financial_reset_recovery('${f.expected.restoreOperationId}'::uuid`));
  assert.ok(sql.includes(f.expected.phaseBindingSha256));
  assert.equal(canonicalJson(p), canonicalJson(f.packet));
});
