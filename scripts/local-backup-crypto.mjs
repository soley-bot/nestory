import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import * as pgp from 'openpgp';

export const LOCAL_BACKUP_ROOT = 'C:\\Users\\USer\\Nestory-Recovery\\pilot-october-2026';
const helper = path.join(import.meta.dirname, 'local-backup-windows.ps1');
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const config = Object.freeze({ v6Keys: false, aeadProtect: false, preferredSymmetricAlgorithm: pgp.enums.symmetric.aes256,
  preferredCompressionAlgorithm: pgp.enums.compression.uncompressed, allowUnauthenticatedMessages: false, allowUnauthenticatedStream: false });
const fail = code => { throw new Error(`local_backup_${code}`); };
export const backupHash = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const checkId = id => { if (!idPattern.test(id)) fail('id_invalid'); return id; };
const filename = (id, kind) => `local-backup-${checkId(id)}.${kind}`;

function windows(action, name, bytes) {
  if (process.platform !== 'win32') fail('windows_required');
  const body = Buffer.from(JSON.stringify({ action, name, payload: bytes == null ? null : Buffer.from(bytes).toString('base64') }));
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' } });
    const chunks = []; let count = 0, failed = false;
    const stop = () => { failed = true; child.kill(); };
    const timer = setTimeout(stop, 60000);
    child.stdout.on('data', chunk => { count += chunk.length; if (count > 92000000) stop(); else chunks.push(chunk); });
    child.stderr.on('data', stop); child.stdin.on('error', stop); child.on('error', stop);
    child.once('close', code => {
      clearTimeout(timer); body.fill(0);
      if (failed || code !== 0) return reject(new Error('local_backup_windows_helper_failed'));
      let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new Error('local_backup_windows_output_invalid')); }
      for (const chunk of chunks) chunk.fill(0);
      if (value.status !== 'ok' || typeof value.payload !== 'string') return reject(new Error('local_backup_windows_output_invalid'));
      const result = Buffer.from(value.payload, 'base64');
      if (result.toString('base64') !== value.payload || value.sha256 && backupHash(result) !== value.sha256 || value.bytes && result.length !== value.bytes) {
        result.fill(0); return reject(new Error('local_backup_windows_readback_invalid'));
      }
      resolve(result);
    });
    child.stdin.end(body);
  });
}
const writeCustodyFile = (id, kind, bytes) => windows('write', filename(id, kind), bytes);
export async function writePrivateBackupFile(id, kind, bytes) {
  if (!['synthetic.pgp', 'archive.pgp', 'proof.json'].includes(kind)) fail('artifact_kind_invalid');
  if (kind.endsWith('.pgp')) {
    try {
      const message = await pgp.readMessage({ binaryMessage: bytes, config });
      if (!message.getEncryptionKeyIDs().length) fail('encrypted_artifact_required');
    } catch { fail('encrypted_artifact_required'); }
  }
  return writeCustodyFile(id, kind, bytes);
}
export const readPrivateBackupFile = (id, kind) => windows('read', filename(id, kind), null);

export async function createLocalRecoveryKey() {
  const id = randomUUID();
  let generated, wrapped;
  try {
    generated = await pgp.generateKey({ type: 'rsa', rsaBits: 3072, userIDs: [{ name: `Nestory Pilot recovery ${id}` }], format: 'binary', config });
    const privateKey = await pgp.readPrivateKey({ binaryKey: generated.privateKey, config });
    if (privateKey.keyPacket.version !== 4 || privateKey.getAlgorithmInfo().bits !== 3072) fail('key_format_invalid');
    const publicKey = privateKey.toPublic().armor(config);
    wrapped = await windows('protect', null, generated.privateKey);
    const unwrapped = await windows('unprotect', null, wrapped);
    try { if (backupHash(unwrapped) !== backupHash(generated.privateKey)) fail('key_wrap_mismatch'); }
    finally { unwrapped.fill(0); }
    const metadata = { format: 'nestory-local-recovery-key-v1', id, fingerprint: privateKey.getFingerprint(),
      algorithm: 'RSA-3072-OpenPGP-v4-AES256-MDC', custody: 'DPAPI-CurrentUser', offHostRecoveryProven: false,
      publicKeySha256: backupHash(publicKey), wrappedKeySha256: backupHash(wrapped), createdAt: new Date().toISOString() };
    await writeCustodyFile(id, 'private.dpapi', wrapped);
    await writeCustodyFile(id, 'public.asc', Buffer.from(publicKey));
    await writeCustodyFile(id, 'metadata.json', Buffer.from(JSON.stringify(metadata)));
    return metadata;
  } catch { fail('key_creation_failed'); }
  finally { generated?.privateKey?.fill(0); wrapped?.fill(0); }
}
export async function loadRecoveryPublicKey(id) {
  const metadata = JSON.parse((await readPrivateBackupFile(id, 'metadata.json')).toString('utf8'));
  const fields = ['format','id','fingerprint','algorithm','custody','offHostRecoveryProven','publicKeySha256','wrappedKeySha256','createdAt'];
  if (Object.keys(metadata).sort().join(',') !== fields.sort().join(',') || metadata.format !== 'nestory-local-recovery-key-v1' ||
      metadata.algorithm !== 'RSA-3072-OpenPGP-v4-AES256-MDC' || metadata.custody !== 'DPAPI-CurrentUser' || metadata.offHostRecoveryProven !== false ||
      !/^[a-f0-9]{64}$/.test(metadata.publicKeySha256) || !/^[a-f0-9]{64}$/.test(metadata.wrappedKeySha256) ||
      !Number.isFinite(Date.parse(metadata.createdAt))) fail('key_metadata_invalid');
  const armored = (await readPrivateBackupFile(id, 'public.asc')).toString('utf8');
  const key = await pgp.readKey({ armoredKey: armored, config });
  if (metadata.id !== id || metadata.publicKeySha256 !== backupHash(armored) || metadata.fingerprint !== key.getFingerprint() ||
      key.isPrivate() || key.keyPacket.version !== 4 || key.getAlgorithmInfo().bits !== 3072) fail('public_key_binding_invalid');
  return { metadata, armored, key };
}
export async function encryptLocalBackup(id, plaintext) {
  if (!(plaintext instanceof Uint8Array) || plaintext.length > 48 * 1024 * 1024) fail('plaintext_limit');
  const { key } = await loadRecoveryPublicKey(id);
  return Buffer.from(await pgp.encrypt({ message: await pgp.createMessage({ binary: plaintext }), encryptionKeys: key, format: 'binary', config }));
}
export async function decryptLocalBackup(id, encrypted) {
  return (await decryptLocalBackupChunks(id, [encrypted]))[0];
}
export async function decryptLocalBackupChunks(id, encryptedChunks) {
  if (!Array.isArray(encryptedChunks) || encryptedChunks.length < 1 || encryptedChunks.length > 4096 ||
      encryptedChunks.some(chunk => !(chunk instanceof Uint8Array)) ||
      encryptedChunks.reduce((n, chunk) => n + chunk.length, 0) > 64 * 1024 * 1024) fail('ciphertext_limit');
  let wrapped, raw;
  const plaintext = [];
  try {
    const { metadata } = await loadRecoveryPublicKey(id);
    wrapped = await readPrivateBackupFile(id, 'private.dpapi');
    if (backupHash(wrapped) !== metadata.wrappedKeySha256) fail('wrapped_key_binding_invalid');
    raw = await windows('unprotect', null, wrapped);
    const key = await pgp.readPrivateKey({ binaryKey: raw, config });
    if (key.getFingerprint() !== metadata.fingerprint) fail('private_key_binding_invalid');
    let total = 0;
    for (const encrypted of encryptedChunks) {
      const result = await pgp.decrypt({ message: await pgp.readMessage({ binaryMessage: encrypted, config }), decryptionKeys: key, format: 'binary', config });
      if (!(result.data instanceof Uint8Array) || (total += result.data.length) > 48 * 1024 * 1024) fail('plaintext_limit');
      plaintext.push(Buffer.from(result.data));
    }
    return plaintext;
  } catch { for (const bytes of plaintext) bytes.fill(0); fail('decryption_failed'); }
  finally { wrapped?.fill(0); raw?.fill(0); }
}
