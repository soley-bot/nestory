// Exclusive local persistence primitives, not provider/retention authority.
// A protected persistent mount must be independently authorized and verified.
// An ephemeral CI workspace remains ephemeral even when fsync succeeds.
// No network, environment credentials, replacement, deletion or recovery write.
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';

const LIMIT = 64 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const checkout = path.resolve(import.meta.dirname, '..');
const mechanisms = new WeakMap();
class StoreError extends Error {
  constructor(code) { super(`reset_store_${code}`); this.requiresReconciliation = true; }
}
const fail = code => { throw new StoreError(code); };
const sanitize = (error, code) => { if (error instanceof StoreError) throw error; fail(code); };
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const privateMode = stat => process.platform === 'win32' || !(stat.mode & 0o077) && stat.uid === process.getuid();
const snapshot = value => JSON.parse(canonicalJson(value));

function slotKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]{0,511}$/.test(key) || key.split('/').some(v => !v)) fail('key_invalid');
  return hashBytes(key);
}

async function inspectDirectory(directory, expected) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory ||
      expected && !sameIdentity(stat, expected) || !privateMode(stat)) fail('directory_identity_invalid');
  return stat;
}

async function inspectAncestors(root) {
  // A no-follow leaf open alone cannot prevent replacement by another user who
  // controls an ancestor. Strict mode requires a non-writable, nonlink chain
  // owned by this process's UID or root. The mount authority is still external.
  let current = path.dirname(root);
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(current) !== current ||
        stat.mode & 0o022 || ![0, process.getuid()].includes(stat.uid)) fail('directory_ancestor_untrusted');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function readFileExact(file, maximum, synchronize = false) {
  let handle;
  try {
    const entry = await lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || !privateMode(entry) || entry.size > maximum) fail('file_identity_invalid');
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (!sameIdentity(entry, before) || before.nlink !== 1 || await realpath(file) !== file) fail('file_identity_invalid');
    const bytes = await handle.readFile();
    // A complete file may be visible after interruption just before its writer
    // flushed it. Strict reconciliation flushes the verified open handle; it
    // never rewrites bytes, repairs a partial record or retries an operation.
    if (synchronize) await handle.sync();
    const after = await handle.stat(), current = await lstat(file);
    if (!sameIdentity(before, after) || !sameIdentity(after, current) || current.nlink !== 1 ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
        bytes.length !== before.size || current.isSymbolicLink() || !privateMode(current)) fail('file_changed');
    return bytes;
  } finally { await handle?.close(); }
}

async function writeExclusive(file, bytes) {
  let handle;
  try {
    handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    const written = await handle.stat(), current = await lstat(file);
    if (!sameIdentity(written, current) || current.isSymbolicLink() || current.nlink !== 1 ||
        current.size !== bytes.length || !privateMode(current)) fail('write_identity_invalid');
  } finally { await handle?.close(); }
  if (!(await readFileExact(file, LIMIT)).equals(bytes)) fail('write_readback_mismatch');
}

async function openDirectoryStore({ directory, storeId }, synthetic, readOnly = false) {
  try {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || !uuid.test(storeId ?? '')) fail('configuration_invalid');
    const root = path.resolve(directory);
    if (within(checkout, root)) fail('checkout_forbidden');
    const rootIdentity = await inspectDirectory(root);
    async function syncDirectory(name) {
      if (synthetic || readOnly) return;
      let handle;
      try { handle = await open(name, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)); await handle.sync(); }
      catch { fail('directory_sync_unavailable'); }
      finally { await handle?.close(); }
    }
    // Probe before creating even the store marker. Windows test mode is exposed
    // by a separate constructor and cannot qualify as a hosted provider.
    await syncDirectory(root);
    if (!synthetic) await inspectAncestors(root);
    const kind = synthetic ? 'synthetic-file-sync-only' : 'exclusive-file-and-directory-fsync';
    const marker = Buffer.from(canonicalJson({ format: 'nestory-exclusive-store-v1', storeId, writeProtocol: kind }));
    const markerPath = path.join(root, 'store.json');
    const entries = await readdir(root);
    if (!entries.includes('store.json')) {
      if (readOnly) fail('existing_store_required');
      if (entries.length) fail('unidentified_nonempty_directory');
      try { await writeExclusive(markerPath, marker); await syncDirectory(root); }
      catch (error) { sanitize(error, 'initialization_unknown'); }
    }
    async function assertRoot() {
      if (!synthetic) await inspectAncestors(root);
      await inspectDirectory(root, rootIdentity);
      if (!(await readFileExact(markerPath, 4096, !synthetic && !readOnly)).equals(marker)) fail('store_identity_changed');
    }
    await assertRoot();
    const uncertain = new Set();
    async function readInternal(key) {
      const keySha256 = slotKey(key), slot = path.join(root, keySha256);
      await assertRoot();
      let identity;
      try { identity = await inspectDirectory(slot); }
      catch (error) {
        if (error.code === 'ENOENT') { await assertRoot(); return null; }
        throw error;
      }
      // A claim without a complete commit is UNKNOWN. No function completes,
      // deletes or retries such a slot, including after process restart.
      const names = await readdir(slot);
      if (canonicalJson(names.sort()) !== canonicalJson(['claim.json', 'commit.json', 'payload.bin'])) fail('slot_incomplete_or_foreign');
      const claimBytes = await readFileExact(path.join(slot, 'claim.json'), 4096, !synthetic && !readOnly);
      const commitBytes = await readFileExact(path.join(slot, 'commit.json'), 4096, !synthetic && !readOnly);
      const bytes = await readFileExact(path.join(slot, 'payload.bin'), LIMIT, !synthetic && !readOnly);
      const binding = { format: 'nestory-exclusive-slot-v1', storeId, keySha256, sha256: hashBytes(bytes), byteLength: bytes.length };
      if (!claimBytes.equals(Buffer.from(canonicalJson(binding))) ||
          !commitBytes.equals(Buffer.from(canonicalJson({ ...binding, claimSha256: hashBytes(claimBytes) })))) fail('slot_binding_mismatch');
      await syncDirectory(slot);
      await syncDirectory(root);
      await inspectDirectory(slot, identity);
      await assertRoot();
      return bytes;
    }
    const store = Object.freeze({
      async putIfAbsent(key, input) {
        if (readOnly) fail('read_only_store');
        const keySha256 = slotKey(key);
        if (!(input instanceof Uint8Array) || input.length > LIMIT) fail('bytes_invalid');
        const bytes = Buffer.from(input);
        if (uncertain.has(keySha256)) fail('previous_outcome_unknown');
        let writeAttempted = false;
        try {
          await assertRoot();
          const slot = path.join(root, keySha256);
          writeAttempted = true;
          try { await mkdir(slot, { mode: 0o700 }); }
          catch (error) {
            if (error.code !== 'EEXIST') throw error;
            await readInternal(key); // Refuse incomplete or tampered existing data.
            return 'exists';
          }
          const slotIdentity = await inspectDirectory(slot);
          await syncDirectory(root); // Persist the exclusive claim's directory entry.
          const claim = Buffer.from(canonicalJson({ format: 'nestory-exclusive-slot-v1', storeId, keySha256,
            sha256: hashBytes(bytes), byteLength: bytes.length }));
          await writeExclusive(path.join(slot, 'claim.json'), claim);
          await syncDirectory(slot);
          await inspectDirectory(slot, slotIdentity);
          await writeExclusive(path.join(slot, 'payload.bin'), bytes);
          await syncDirectory(slot);
          await inspectDirectory(slot, slotIdentity);
          await writeExclusive(path.join(slot, 'commit.json'), Buffer.from(canonicalJson({ ...JSON.parse(claim), claimSha256: hashBytes(claim) })));
          await syncDirectory(slot);
          await syncDirectory(root);
          if (!(await readInternal(key)).equals(bytes)) fail('write_readback_mismatch');
          return 'created';
        } catch (error) {
          // The marker survives ordinary process interruption. If the underlying
          // mount loses acknowledged fsync data, only external reconciliation can
          // establish history; this library does not claim storage authority.
          if (writeAttempted) uncertain.add(keySha256);
          sanitize(error, 'write_outcome_unknown');
        }
      },
      async read(key) {
        try { return await readInternal(key); }
        catch (error) { sanitize(error, 'read_outcome_unknown'); }
      },
    });
    mechanisms.set(store, Object.freeze({ format: 'nestory-local-persistence-mechanism-v1', storeId,
      kind,
      storageAuthority: 'external-persistent-mount-verification-required',
      retentionAuthority: 'external-verification-required', privacyAuthority: 'external-verification-required' }));
    return store;
  } catch (error) { sanitize(error, 'open_failed'); }
}

export const createExclusiveDirectoryStore = options => openDirectoryStore(options, false);
// Historical inspection must not initialize a marker, claim a slot, repair a
// record or even flush an interrupted writer. Missing evidence stays missing.
export const openExistingDirectoryStoreReadOnly = options => openDirectoryStore(options, false, true);
// Tests only: proves process-restart behavior without claiming directory fsync.
export const createSyntheticDirectoryStore = options => openDirectoryStore(options, true);
export const openSyntheticDirectoryStoreReadOnly = options => openDirectoryStore(options, true, true);
export function inspectLocalStoreMechanism(store) {
  const mechanism = mechanisms.get(store);
  if (!mechanism) fail('unrecognized_local_provider');
  return snapshot(mechanism);
}

const forbiddenField = /^(?:authorization|access_?token|refresh_?token|id_?token|api_?key|service_?role_?key|password|secret|credentials?|session)$/i;
function checkJournalValue(value, depth = 0) {
  if (depth > 16) fail('journal_shape_invalid');
  if (typeof value === 'string' && (/\bBearer\s+\S+/i.test(value) || /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value))) fail('journal_credential_forbidden');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenField.test(key)) fail('journal_credential_forbidden');
      checkJournalValue(child, depth + 1);
    }
  }
}

// Callers must construct fixed metadata allowlists; this extra filter is not a
// general secret detector. Records must never contain row images or auth tokens.
export function createJsonJournal({ store }) {
  if (typeof store?.putIfAbsent !== 'function' || typeof store?.read !== 'function') fail('journal_store_invalid');
  function encode(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024) fail('journal_bytes_invalid');
    let parsed;
    try { parsed = JSON.parse(value); } catch { fail('journal_shape_invalid'); }
    checkJournalValue(parsed);
    if (canonicalJson(parsed) !== value) fail('journal_noncanonical');
    return Buffer.from(value);
  }
  return Object.freeze({
    async putIfAbsent(key, value) {
      const bytes = encode(value);
      try {
        const result = await store.putIfAbsent(key, bytes);
        if (!['created', 'exists'].includes(result)) fail('journal_outcome_unknown');
        return result;
      } catch (error) { sanitize(error, 'journal_write_unknown'); }
    },
    async read(key) {
      try {
        const bytes = await store.read(key);
        if (bytes === null) return null;
        if (!(bytes instanceof Uint8Array) || bytes.length > 1024 * 1024) fail('journal_read_invalid');
        const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!encode(value).equals(Buffer.from(bytes))) fail('journal_read_invalid');
        return value;
      } catch (error) { sanitize(error, 'journal_read_unknown'); }
    },
  });
}
