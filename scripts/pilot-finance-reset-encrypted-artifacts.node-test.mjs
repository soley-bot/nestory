import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, hashBytes, prepareOperatorPacket, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { createSyntheticDirectoryStore, createExclusiveDirectoryStore } from './pilot-finance-reset-durable-store.mjs';
import { artifactSlot, createEncryptedArtifactProvider, createBoundArtifactReader } from './pilot-finance-reset-encrypted-artifacts.mjs';

const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const binding = () => ({ operationId: '10000000-0000-4000-8000-000000000010', projectRef: 's'.repeat(20),
  organizationId: '10000000-0000-4000-8000-000000000011', mainSha: 'a'.repeat(40),
  sourceSnapshotSha256: 'b'.repeat(64), sourcesSha256: 'c'.repeat(64), role: 'archive' });
const keyProvider = () => {
  const key = createSecretKey(randomBytes(32));
  return { resolveKey: async () => key };
};
function memoryStore(fault = () => {}) {
  const records = new Map(), puts = [];
  return { records, puts,
    async read(key) { fault('read', key); return records.has(key) ? Buffer.from(records.get(key)) : null; },
    async putIfAbsent(key, bytes) {
      puts.push(key); fault('before', key);
      if (records.has(key)) return 'exists';
      records.set(key, Buffer.from(bytes)); fault('after', key); return 'created';
    },
  };
}
const prepare = provider => provider.prepare({ binding: binding(), plaintext: binary, keyId: 'synthetic-key-v1' });
const input = prepared => ({ slot: artifactSlot(prepared.descriptor.binding), prepared });
const readInput = prepared => ({ slot: artifactSlot(prepared.descriptor.binding), descriptor: prepared.descriptor });
function repack(prepared, change) {
  const envelope = JSON.parse(prepared.sealedBytes); change(envelope);
  const sealedBytes = Buffer.from(canonicalJson(envelope));
  const descriptor = { ...prepared.descriptor, ciphertextSha256: hashBytes(sealedBytes), ciphertextByteLength: sealedBytes.length };
  return { sealedBytes, descriptor };
}

async function filesystem(t, strict = false) {
  const parent = await realpath(strict ? path.resolve(import.meta.dirname, '../..') : os.tmpdir());
  const directory = await mkdtemp(path.join(parent, 'pilot-reset-crypto-test-'));
  t.after(async () => {
    const actual = await realpath(directory);
    assert.equal(path.dirname(actual), parent); assert.match(path.basename(actual), /^pilot-reset-crypto-test-/);
    await rm(actual, { recursive: true });
  });
  const options = { directory, storeId: randomUUID() };
  return { options, store: await (strict ? createExclusiveDirectoryStore : createSyntheticDirectoryStore)(options) };
}

test('AES-256-GCM protects arbitrary binary with fresh nonces and an exact external descriptor', async () => {
  const provider = createEncryptedArtifactProvider({ store: memoryStore(), keyProvider: keyProvider() });
  const first = await prepare(provider), second = await prepare(provider);
  assert.deepEqual(await provider.open(first), binary);
  assert.notEqual(first.descriptor.ciphertextSha256, second.descriptor.ciphertextSha256);
  assert.notEqual(JSON.parse(first.sealedBytes).nonce, JSON.parse(second.sealedBytes).nonce);
  assert.equal(JSON.parse(first.sealedBytes).algorithm, 'aes-256-gcm');
  assert.equal(Buffer.from(JSON.parse(first.sealedBytes).tag, 'base64').length, 16);
  assert.equal(Buffer.from(JSON.parse(first.sealedBytes).nonce, 'base64').length, 12);
  assert.equal(first.sealedBytes.includes(binary), false);
});

test('ciphertext, authentication tag, nonce and malformed encoding refuse plaintext', async () => {
  const provider = createEncryptedArtifactProvider({ store: memoryStore(), keyProvider: keyProvider() });
  const prepared = await prepare(provider);
  const corrupt = { ...prepared, sealedBytes: Buffer.from(prepared.sealedBytes) }; corrupt.sealedBytes[0] ^= 1;
  await assert.rejects(provider.open(corrupt), /ciphertext_digest_mismatch/);
  await assert.rejects(provider.open({ ...prepared, sealedBytes: prepared.sealedBytes.subarray(0, -1) }), /ciphertext_digest_mismatch/);
  for (const field of ['ciphertext', 'tag', 'nonce']) {
    await assert.rejects(provider.open(repack(prepared, envelope => {
      const bytes = Buffer.from(envelope[field], 'base64'); bytes[0] ^= 1; envelope[field] = bytes.toString('base64');
    })), /authentication_failed/);
    await assert.rejects(provider.open(repack(prepared, envelope => { envelope[field] += '\n'; })), /encoding_invalid/);
  }
  for (const [field, length] of [['nonce', 11], ['tag', 15]]) {
    await assert.rejects(provider.open(repack(prepared, envelope => { envelope[field] = Buffer.alloc(length).toString('base64'); })), /encoding_invalid/);
  }
});

test('every scope field is authenticated even if a caller repins the changed ciphertext hash', async () => {
  const provider = createEncryptedArtifactProvider({ store: memoryStore(), keyProvider: keyProvider() });
  const prepared = await prepare(provider);
  const changedValues = { operationId: randomUUID(), organizationId: randomUUID(), projectRef: 'q'.repeat(20), mainSha: 'd'.repeat(40),
    sourceSnapshotSha256: 'e'.repeat(64), sourcesSha256: 'f'.repeat(64), role: 'manifest' };
  for (const [field, value] of Object.entries(changedValues)) {
    const modified = repack(prepared, envelope => { envelope.binding[field] = value; });
    modified.descriptor.binding = { ...modified.descriptor.binding, [field]: value };
    await assert.rejects(provider.open(modified), /authentication_failed/);
  }
  const modified = repack(prepared, envelope => { envelope.keyId = 'synthetic-other-key'; });
  modified.descriptor.keyId = 'synthetic-other-key';
  await assert.rejects(provider.open(modified), /authentication_failed/);
  await assert.rejects(provider.open({ ...prepared, descriptor: { ...prepared.descriptor, unexpected: true } }), /descriptor_invalid/);
  const extra = repack(prepared, envelope => { envelope.unexpected = true; });
  await assert.rejects(provider.open(extra), /envelope_binding_mismatch/);
});

test('wrong, unavailable, non-KeyObject and short keys are refused with sanitized errors', async () => {
  const store = memoryStore(), provider = createEncryptedArtifactProvider({ store, keyProvider: keyProvider() });
  const prepared = await prepare(provider);
  await assert.rejects(createEncryptedArtifactProvider({ store, keyProvider: keyProvider() }).open(prepared), /authentication_failed/);
  for (const key of [Buffer.alloc(32), createSecretKey(Buffer.alloc(16)), null]) {
    await assert.rejects(prepare(createEncryptedArtifactProvider({ store, keyProvider: { resolveKey: async () => key } })), /key_invalid/);
  }
  const failed = createEncryptedArtifactProvider({ store, keyProvider: { resolveKey() { throw new Error('Bearer confidential'); } } });
  await assert.rejects(failed.open(prepared), error => error.message === 'reset_artifact_key_unavailable');
  assert.equal(store.puts.length, 0);
});

test('prepare/open/put freeze caller-owned buffers and source descriptors before async key lookup', async () => {
  const store = memoryStore(), baseKey = keyProvider();
  let hook = () => {};
  const provider = createEncryptedArtifactProvider({ store, keyProvider: { resolveKey: async args => { hook(); return baseKey.resolveKey(args); } } });
  const plain = Buffer.from(binary), source = binding();
  hook = () => { plain.fill(0); source.mainSha = 'd'.repeat(40); };
  const prepared = await provider.prepare({ binding: source, plaintext: plain, keyId: 'synthetic-key-v1' });
  hook = () => {};
  assert.deepEqual(await provider.open(prepared), binary);
  assert.equal(prepared.descriptor.binding.mainSha, 'a'.repeat(40));
  const openCandidate = structuredClone(prepared);
  hook = () => { openCandidate.sealedBytes.fill(0); openCandidate.descriptor.binding.role = 'manifest'; };
  assert.deepEqual(await provider.open(openCandidate), binary);
  const putCandidate = structuredClone(prepared);
  hook = () => { putCandidate.sealedBytes.fill(0); putCandidate.descriptor.binding.role = 'manifest'; };
  const receipt = await provider.putPrepared(input(putCandidate));
  hook = () => {};
  assert.equal(receipt.descriptor.binding.role, 'archive');
  assert.deepEqual(await provider.read(readInput(prepared)), binary);
});

test('exclusive encrypted artifact survives provider/filesystem restart and never persists plaintext or key', async t => {
  const f = await filesystem(t), keys = keyProvider();
  const provider = createEncryptedArtifactProvider({ store: f.store, keyProvider: keys });
  const prepared = await prepare(provider), slot = artifactSlot(prepared.descriptor.binding);
  const receipt = await provider.putPrepared(input(prepared));
  assert.equal(receipt.receipt, 'present');
  assert.equal(receipt.writeAllowed, false);
  assert.deepEqual(await provider.read(readInput(prepared)), binary);
  const restarted = createEncryptedArtifactProvider({ store: await createSyntheticDirectoryStore(f.options), keyProvider: keys });
  assert.deepEqual(await restarted.read(readInput(prepared)), binary);
  await assert.rejects(restarted.putPrepared(input(prepared)), /existing_attempt_reconcile_required/);
  assert.deepEqual(await f.store.read(`${slot}/ciphertext`), prepared.sealedBytes);
  assert.equal((await f.store.read(`${slot}/intent`)).includes(binary), false);
  assert.equal((await f.store.read(`${slot}/receipt`)).includes(binary), false);
});

for (const stage of ['intent', 'ciphertext', 'receipt']) {
  for (const phase of ['before', 'after']) {
    test(`lost ${phase} ${stage} write acknowledgement never triggers an artifact retry`, async () => {
      let faultEnabled = true;
      const store = memoryStore((at, key) => { if (faultEnabled && at === phase && key.endsWith(`/${stage}`)) throw new Error('credentials=confidential'); });
      const keys = keyProvider(), provider = createEncryptedArtifactProvider({ store, keyProvider: keys });
      const prepared = await prepare(provider);
      await assert.rejects(provider.putPrepared(input(prepared)), error => error.message === 'reset_artifact_store_write_unknown');
      const priorPuts = store.puts.length;
      faultEnabled = false;
      await assert.rejects(provider.putPrepared(input(prepared)), /existing_attempt_reconcile_required/);
      assert.equal(store.puts.length, priorPuts);
      const restarted = createEncryptedArtifactProvider({ store, keyProvider: keys });
      if (stage === 'intent' && phase === 'before') {
        // No ciphertext request was ever made, and absent intent still cannot
        // turn read-only reconciliation into a write or successful readback.
        await assert.rejects(restarted.reconcile(readInput(prepared)), /intent_absent_reconcile_required/);
        assert.equal(store.puts.some(key => key.endsWith('/ciphertext')), false);
      } else {
        await assert.rejects(restarted.putPrepared(input(prepared)), /existing_attempt_reconcile_required/);
        assert.equal(store.puts.filter(key => key.endsWith('/ciphertext')).length, stage === 'intent' ? 0 : 1);
        if (stage === 'intent' || stage === 'ciphertext' && phase === 'before') {
          await assert.rejects(restarted.reconcile(readInput(prepared)), /ciphertext_absent_reconcile_required/);
        } else {
          const reconciled = await restarted.reconcile(readInput(prepared));
          assert.equal(reconciled.receipt, stage === 'receipt' && phase === 'after' ? 'present' : 'absent');
          assert.equal(reconciled.writeAllowed, false);
          assert.deepEqual(await restarted.read(readInput(prepared)), binary);
        }
      }
    });
  }
}

test('source changes and duplicate prepared envelopes cannot acquire a new attempt slot', async () => {
  const store = memoryStore(), provider = createEncryptedArtifactProvider({ store, keyProvider: keyProvider() });
  const first = await prepare(provider);
  await provider.putPrepared(input(first));
  const changed = await provider.prepare({ binding: { ...binding(), mainSha: 'd'.repeat(40) }, plaintext: binary, keyId: 'synthetic-key-v1' });
  assert.equal(artifactSlot(changed.descriptor.binding), artifactSlot(first.descriptor.binding));
  await assert.rejects(provider.putPrepared(input(changed)), /existing_attempt_reconcile_required/);
  await assert.rejects(provider.read(readInput(changed)), /intent_binding_mismatch/);
  await assert.rejects(provider.putPrepared({ ...input(changed), slot: 'some/new/slot' }), /slot_scope_mismatch/);
  assert.equal(store.puts.filter(key => key.endsWith('/ciphertext')).length, 1);
});

test('read outage, missing committed ciphertext and tampered receipts fail closed without writes', async () => {
  let outage = false;
  const store = memoryStore(at => { if (outage && at === 'read') throw new Error('Bearer confidential'); });
  const provider = createEncryptedArtifactProvider({ store, keyProvider: keyProvider() }), prepared = await prepare(provider);
  await provider.putPrepared(input(prepared));
  const writes = store.puts.length, slot = artifactSlot(prepared.descriptor.binding);
  outage = true;
  await assert.rejects(provider.reconcile(readInput(prepared)), error => error.message === 'reset_artifact_store_read_unknown');
  outage = false;
  store.records.set(`${slot}/receipt`, Buffer.from('{}'));
  await assert.rejects(provider.read(readInput(prepared)), /receipt_binding_mismatch/);
  store.records.delete(`${slot}/ciphertext`); // Model provider data loss, never production cleanup.
  await assert.rejects(provider.read(readInput(prepared)), /ciphertext_absent_reconcile_required/);
  assert.equal(store.puts.length, writes);
});

async function packetFixture(provider) {
  const operation = { ...Object.fromEntries(['operationId', 'projectRef', 'organizationId', 'mainSha'].map(key => [key, binding()[key]])),
    sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-23', timezone: 'Asia/Phnom_Penh' };
  const sources = [...SOURCE_ENTRYPOINTS, 'supabase/migrations/20261023161622_reviewed_dispositions.sql']
    .map(name => ({ path: name, sha256: 'a'.repeat(64) })).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const sourcesSha256 = hashBytes(canonicalJson(sources));
  const descriptors = {}, artifacts = {};
  for (const role of REQUIRED_ARTIFACTS) {
    const prepared = await provider.prepare({ binding: { ...binding(), role, sourcesSha256 }, plaintext: binary, keyId: 'synthetic-key-v1' });
    descriptors[role] = prepared.descriptor; artifacts[role] = prepared.sealedBytes;
    await provider.putPrepared(input(prepared));
  }
  const review = { format: 'nestory-protected-reset-review-v1', operation, schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64),
    sourceSnapshotSha256: binding().sourceSnapshotSha256, archiveRows: 7, actionCount: 6,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256',
      'continuationSemanticSha256', 'reportReviewSha256'].map((name, i) => [name, String(i + 1).repeat(64)])),
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([role, bytes]) => [role, hashBytes(bytes)])) };
  return { packet: prepareOperatorPacket({ review, sources, artifacts, candidateHead: operation.mainSha }), descriptors };
}

test('bound reader pins packet/role/ciphertext/source descriptors and refuses synthetic hosted authority', async t => {
  const f = await filesystem(t), provider = createEncryptedArtifactProvider({ store: f.store, keyProvider: keyProvider() });
  const { packet, descriptors } = await packetFixture(provider);
  let calls = 0;
  const reader = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority() { calls++; return { authority: 'synthetic-only' }; } });
  assert.deepEqual(await reader.read('archive'), binary);
  await assert.rejects(reader.read('arbitraryRole'), /reader_role_invalid/);
  await assert.rejects(reader.inspectRecoveryCheckpoint(), /synthetic_provider_not_hosted/);
  assert.equal(calls, 0);
  const changed = structuredClone(descriptors); changed.archive.binding.sourceSnapshotSha256 = 'f'.repeat(64);
  assert.throws(() => createBoundArtifactReader({ provider, packet, descriptors: changed, verifyRecoveryAuthority() {} }), /reader_packet_binding_mismatch/);
  descriptors.archive.binding.role = 'manifest'; packet.sourceSnapshotSha256 = 'f'.repeat(64);
  assert.deepEqual(await reader.read('archive'), binary);
});

test('bound reader rejects a missing receipt for every hosted input; raw reconciliation stays read-only', async () => {
  const store = memoryStore(), provider = createEncryptedArtifactProvider({ store, keyProvider: keyProvider() });
  const { packet, descriptors } = await packetFixture(provider);
  const reader = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority() { throw new Error('not provisioned'); } });
  const role = 'actions', slot = artifactSlot(descriptors[role].binding), descriptor = descriptors[role];
  store.records.delete(`${slot}/receipt`); // Model a lost acknowledgement before receipt creation.
  const count = store.puts.length;
  assert.equal((await provider.reconcile({ slot, descriptor })).receipt, 'absent');
  assert.deepEqual(await provider.read({ slot, descriptor }), binary);
  await assert.rejects(reader.read(role), /reader_receipt_absent/);
  assert.equal(store.puts.length, count);
});

test('bound reader uses one committed observation when a receipt disappears between possible reads', async () => {
  const store = memoryStore(), provider = createEncryptedArtifactProvider({ store, keyProvider: keyProvider() });
  const { packet, descriptors } = await packetFixture(provider);
  const reader = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority() {} });
  const role = 'actions', slot = artifactSlot(descriptors[role].binding), originalRead = store.read;
  let receiptReads = 0;
  store.read = async key => {
    const bytes = await originalRead(key);
    if (key === `${slot}/receipt`) { receiptReads++; store.records.delete(key); }
    return bytes;
  };
  assert.deepEqual(await reader.read(role), binary);
  assert.equal(receiptReads, 1, 'Hosted reads must not verify a receipt and then start a separate permissive observation.');
  await assert.rejects(reader.read(role), /reader_receipt_absent/);
  assert.equal(receiptReads, 2);
});

test('strict filesystem receipt remains dependent on external retention/recovery authority', { skip: process.platform === 'win32' && 'Directory fsync unavailable; Windows synthetic mode cannot claim hosted readiness.' }, async t => {
  let f;
  try { f = await filesystem(t, true); }
  catch (error) { if (/directory_ancestor_untrusted/.test(error.message)) { t.skip('No trusted ancestor chain in this test workspace.'); return; } throw error; }
  const provider = createEncryptedArtifactProvider({ store: f.store, keyProvider: keyProvider() });
  const { packet, descriptors } = await packetFixture(provider);
  const opaqueReceipt = Symbol('verified-by-test-callback-only');
  let call;
  const reader = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority(value) { call = value; return opaqueReceipt; } });
  assert.equal(await reader.inspectRecoveryCheckpoint(), opaqueReceipt);
  assert.deepEqual(Object.keys(call.artifacts).sort(), ['manifest', 'archive', 'restoreProof', 'storageProof', 'containmentProof', 'recoveryPlan', 'rehearsalProof'].sort());
  assert.equal(call.packetSha256, packet.packetSha256);
  const refused = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority() { return true; } });
  await assert.rejects(refused.inspectRecoveryCheckpoint(), /runtime_authority_receipt_missing/);
});
