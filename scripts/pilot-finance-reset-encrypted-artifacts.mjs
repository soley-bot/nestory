// AES-GCM artifact bytes and read-only reconciliation. No key creation/loading,
// environment access, network dispatch, provider selection, cleanup or DB write.
// The injected resolver supplies an already authorized key, never a token.
import { createCipheriv, createDecipheriv, KeyObject, randomBytes } from 'node:crypto';
import { assertOperatorPacket, canonicalJson, hashBytes, REQUIRED_ARTIFACTS } from './pilot-finance-reset-operator-core.mjs';
import { inspectLocalStoreMechanism } from './pilot-finance-reset-durable-store.mjs';
import { inspectExternalStoreMechanism } from './pilot-finance-reset-external-store.mjs';

const FORMAT = 'nestory-reset-aes-gcm-v1';
const ALGORITHM = 'aes-256-gcm';
const MAX_PLAINTEXT = 32 * 1024 * 1024;
const MAX_ENVELOPE = 48 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const bindingFields = ['operationId', 'projectRef', 'organizationId', 'mainSha', 'sourceSnapshotSha256', 'sourcesSha256', 'role'];
const headerFields = ['format', 'algorithm', 'keyId', 'binding', 'plaintextSha256', 'byteLength'];
const descriptorFields = [...headerFields, 'ciphertextSha256', 'ciphertextByteLength'];
const snapshot = value => JSON.parse(canonicalJson(value));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const keys = (value, names) => value && Object.getPrototypeOf(value) === Object.prototype && same(Object.keys(value).sort(), [...names].sort());
const providerStores = new WeakMap();
class ArtifactError extends Error {
  constructor(code) { super(`reset_artifact_${code}`); this.requiresReconciliation = true; }
}
const fail = code => { throw new ArtifactError(code); };
const sanitize = (error, code) => { if (error instanceof ArtifactError) throw error; fail(code); };

function checkBinding(value) {
  if (!keys(value, bindingFields) || !uuid.test(value.operationId) || !uuid.test(value.organizationId) ||
      !/^[a-z0-9]{20}$/.test(value.projectRef) || !/^[a-f0-9]{40}$/.test(value.mainSha) ||
      !digest.test(value.sourceSnapshotSha256) || !digest.test(value.sourcesSha256) || !REQUIRED_ARTIFACTS.includes(value.role)) fail('binding_invalid');
  return snapshot(value);
}
function checkHeader(value) {
  if (value.format !== FORMAT || value.algorithm !== ALGORITHM ||
      typeof value.keyId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(value.keyId) ||
      !digest.test(value.plaintextSha256) || !Number.isSafeInteger(value.byteLength) ||
      value.byteLength < 1 || value.byteLength > MAX_PLAINTEXT) fail('header_invalid');
  checkBinding(value.binding);
}
function descriptorCopy(value) {
  if (!keys(value, descriptorFields)) fail('descriptor_invalid');
  checkHeader(value);
  if (!digest.test(value.ciphertextSha256) || !Number.isSafeInteger(value.ciphertextByteLength) ||
      value.ciphertextByteLength < 1 || value.ciphertextByteLength > MAX_ENVELOPE) fail('descriptor_invalid');
  return snapshot(value);
}
const headerOf = value => Object.fromEntries(headerFields.map(key => [key, value[key]]));
function unbase64(value, length) {
  if (typeof value !== 'string') fail('encoding_invalid');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length !== length) fail('encoding_invalid');
  return bytes;
}
export function artifactSlot(binding) {
  checkBinding(binding);
  // Source/packet changes cannot mint a new attempt slot for this operation.
  return `financial-reset/${binding.operationId}/artifact/${binding.role}`;
}
function checkSlot(slot, descriptor) {
  if (slot !== artifactSlot(descriptor.binding)) fail('slot_scope_mismatch');
}
const intentBytes = (slot, descriptor) => Buffer.from(canonicalJson({ format: 'nestory-reset-artifact-intent-v1', slot, descriptor }));
const receiptBytes = (slot, descriptor) => Buffer.from(canonicalJson({ format: 'nestory-reset-artifact-readback-v1', slot,
  descriptor, intentSha256: hashBytes(intentBytes(slot, descriptor)) }));

export function createEncryptedArtifactProvider({ store, keyProvider }) {
  if (typeof store?.putIfAbsent !== 'function' || typeof store?.read !== 'function' ||
      typeof keyProvider?.resolveKey !== 'function') fail('provider_invalid');
  const attempted = new Set();
  async function resolveKey(keyId, purpose) {
    let key;
    try { key = await keyProvider.resolveKey(Object.freeze({ keyId, purpose })); }
    catch { fail('key_unavailable'); }
    if (!(key instanceof KeyObject) || key.type !== 'secret' || key.symmetricKeySize !== 32) fail('key_invalid');
    return key;
  }
  async function openSealed(input) {
    // Copy every caller-owned value before the first await, including buffers.
    const descriptor = descriptorCopy(input.descriptor);
    if (!(input.sealedBytes instanceof Uint8Array) || input.sealedBytes.length > MAX_ENVELOPE) fail('envelope_invalid');
    const bytes = Buffer.from(input.sealedBytes);
    if (bytes.length !== descriptor.ciphertextByteLength || hashBytes(bytes) !== descriptor.ciphertextSha256) fail('ciphertext_digest_mismatch');
    let envelope;
    try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail('envelope_invalid'); }
    if (!keys(envelope, [...headerFields, 'nonce', 'tag', 'ciphertext']) ||
        !Buffer.from(canonicalJson(envelope)).equals(bytes) || !same(headerOf(envelope), headerOf(descriptor))) fail('envelope_binding_mismatch');
    checkHeader(envelope);
    const nonce = unbase64(envelope.nonce, 12), tag = unbase64(envelope.tag, 16);
    const encrypted = unbase64(envelope.ciphertext, descriptor.byteLength);
    const key = await resolveKey(descriptor.keyId, 'decrypt');
    let unauthenticated, plaintext;
    try {
      const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(canonicalJson(headerOf(envelope))));
      decipher.setAuthTag(tag);
      unauthenticated = decipher.update(encrypted);
      plaintext = Buffer.concat([unauthenticated, decipher.final()]);
      if (plaintext.length !== descriptor.byteLength || hashBytes(plaintext) !== descriptor.plaintextSha256) fail('plaintext_digest_mismatch');
      return plaintext;
    } catch (error) {
      plaintext?.fill(0);
      sanitize(error, 'authentication_failed');
    } finally { unauthenticated?.fill(0); }
  }
  async function readBytes(key) {
    let value;
    try { value = await store.read(key); } catch { fail('store_read_unknown'); }
    if (value === null) return null;
    if (!(value instanceof Uint8Array) || value.length > MAX_ENVELOPE) fail('store_read_invalid');
    return Buffer.from(value);
  }
  async function createOnce(key, bytes) {
    let outcome;
    try { outcome = await store.putIfAbsent(key, Buffer.from(bytes)); }
    catch { fail('store_write_unknown'); }
    if (outcome === 'exists') fail('existing_attempt_reconcile_required');
    if (outcome !== 'created') fail('store_write_unknown');
    const observed = await readBytes(key);
    if (observed === null || !observed.equals(bytes)) fail('store_readback_mismatch');
  }
  async function observe(input, requireReceipt = false) {
    const descriptor = descriptorCopy(input.descriptor), slot = input.slot;
    checkSlot(slot, descriptor);
    const expectedIntent = intentBytes(slot, descriptor);
    const intent = await readBytes(`${slot}/intent`);
    if (intent === null) fail('intent_absent_reconcile_required');
    if (!intent.equals(expectedIntent)) fail('intent_binding_mismatch');
    const sealedBytes = await readBytes(`${slot}/ciphertext`);
    if (sealedBytes === null) fail('ciphertext_absent_reconcile_required');
    const plaintext = await openSealed({ sealedBytes, descriptor });
    try {
      const receipt = await readBytes(`${slot}/receipt`);
      if (requireReceipt && receipt === null) fail('reader_receipt_absent');
      if (receipt !== null && !receipt.equals(receiptBytes(slot, descriptor))) fail('receipt_binding_mismatch');
      return { plaintext, evidence: { format: 'nestory-reset-authenticated-readback-v1', slot, descriptor,
        intentSha256: hashBytes(intent), receipt: receipt === null ? 'absent' : 'present',
        receiptSha256: receipt === null ? null : hashBytes(receipt), writeAllowed: false } };
    } catch (error) { plaintext.fill(0); throw error; }
  }
  const provider = Object.freeze({
    async prepare(input) {
      const binding = checkBinding(input.binding), keyId = input.keyId;
      if (!(input.plaintext instanceof Uint8Array) || input.plaintext.length < 1 || input.plaintext.length > MAX_PLAINTEXT) fail('plaintext_invalid');
      const plaintext = Buffer.from(input.plaintext);
      const header = { format: FORMAT, algorithm: ALGORITHM, keyId, binding,
        plaintextSha256: hashBytes(plaintext), byteLength: plaintext.length };
      checkHeader(header);
      try {
        const key = await resolveKey(keyId, 'encrypt'), nonce = randomBytes(12);
        const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
        cipher.setAAD(Buffer.from(canonicalJson(header)));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const sealedBytes = Buffer.from(canonicalJson({ ...header, nonce: nonce.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
        const descriptor = { ...header, ciphertextSha256: hashBytes(sealedBytes), ciphertextByteLength: sealedBytes.length };
        return { sealedBytes, descriptor };
      } catch (error) { sanitize(error, 'encryption_failed'); }
      finally { plaintext.fill(0); }
    },
    open: openSealed,
    async putPrepared(input) {
      const descriptor = descriptorCopy(input.prepared.descriptor), slot = input.slot;
      checkSlot(slot, descriptor);
      if (!(input.prepared.sealedBytes instanceof Uint8Array)) fail('envelope_invalid');
      const sealedBytes = Buffer.from(input.prepared.sealedBytes);
      // Authenticate BEFORE creating the durable upload intent, but pin all
      // inputs before key lookup. A failed local validation dispatches nothing.
      (await openSealed({ sealedBytes, descriptor })).fill(0);
      if (attempted.has(slot)) fail('existing_attempt_reconcile_required');
      attempted.add(slot);
      if (await readBytes(`${slot}/intent`) !== null) fail('existing_attempt_reconcile_required');
      await createOnce(`${slot}/intent`, intentBytes(slot, descriptor));
      await createOnce(`${slot}/ciphertext`, sealedBytes);
      (await openSealed({ sealedBytes: await readBytes(`${slot}/ciphertext`), descriptor })).fill(0);
      await createOnce(`${slot}/receipt`, receiptBytes(slot, descriptor));
      const observed = await observe({ slot, descriptor });
      observed.plaintext.fill(0);
      return observed.evidence;
    },
    async read(input) { return (await observe(input)).plaintext; },
    async readCommitted(input) { return (await observe(input, true)).plaintext; },
    async reconcile(input) {
      const observed = await observe(input);
      observed.plaintext.fill(0);
      return observed.evidence;
    },
  });
  providerStores.set(provider, store);
  return provider;
}

const recoveryRoles = ['manifest', 'archive', 'restoreProof', 'storageProof', 'containmentProof', 'recoveryPlan', 'rehearsalProof'];
export function createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority }) {
  assertOperatorPacket(packet);
  const pinnedPacket = snapshot(packet), pinned = snapshot(descriptors);
  if (typeof provider?.readCommitted !== 'function' || typeof provider?.reconcile !== 'function' ||
      typeof verifyRecoveryAuthority !== 'function' || !keys(pinned, REQUIRED_ARTIFACTS)) fail('reader_configuration_invalid');
  for (const role of REQUIRED_ARTIFACTS) {
    const descriptor = descriptorCopy(pinned[role]), artifact = pinnedPacket.artifacts[role];
    if (!artifact || artifact.sha256 !== descriptor.ciphertextSha256 || artifact.bytes !== descriptor.ciphertextByteLength ||
        !same(descriptor.binding, { ...Object.fromEntries(['operationId', 'projectRef', 'organizationId', 'mainSha'].map(key => [key, pinnedPacket.operation[key]])),
          sourceSnapshotSha256: pinnedPacket.sourceSnapshotSha256, sourcesSha256: pinnedPacket.sourcesSha256, role })) fail('reader_packet_binding_mismatch');
  }
  return Object.freeze({
    async read(role) {
      if (!REQUIRED_ARTIFACTS.includes(role)) fail('reader_role_invalid');
      const request = { slot: artifactSlot(pinned[role].binding), descriptor: snapshot(pinned[role]) };
      // Require the receipt in the same authenticated observation that returns
      // bytes. A separate permissive recovery read could miss a vanished receipt.
      return provider.readCommitted(request);
    },
    async inspectRecoveryCheckpoint() {
      const store = providerStores.get(provider);
      let mechanism;
      try { mechanism = inspectLocalStoreMechanism(store); }
      catch {
        try { mechanism = inspectExternalStoreMechanism(store); await store.assertCurrent(); }
        catch { fail('runtime_provider_verification_required'); }
      }
      if (!['exclusive-file-and-directory-fsync', 'aws-s3-conditional-versioned-object-lock'].includes(mechanism.kind)) fail('synthetic_provider_not_hosted');
      const artifacts = {};
      for (const role of recoveryRoles) {
        const observed = await provider.reconcile({ slot: artifactSlot(pinned[role].binding), descriptor: snapshot(pinned[role]) });
        if (observed.receipt !== 'present') fail('recovery_receipt_absent');
        artifacts[role] = observed;
      }
      // fsync is not cross-job retention, private access, key escrow, verified
      // restore, or customer consent. A trusted runtime callback must verify all
      // required external authority against these exact bindings. Its opaque
      // receipt belongs to that verifier; this module never mints one.
      try {
        const receipt = await verifyRecoveryAuthority(snapshot({ packetSha256: pinnedPacket.packetSha256,
          operationId: pinnedPacket.operation.operationId, mechanism, artifacts }));
        if (receipt === null || receipt === undefined || typeof receipt === 'boolean') fail('runtime_authority_receipt_missing');
        return receipt;
      } catch (error) { sanitize(error, 'runtime_authority_unavailable'); }
    },
  });
}
