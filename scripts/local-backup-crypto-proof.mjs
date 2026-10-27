// Explicit synthetic C: custody proof. Never receives production data or secrets.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { backupHash, encryptLocalBackup, decryptLocalBackup, writePrivateBackupFile, readPrivateBackupFile, loadRecoveryPublicKey } from './local-backup-crypto.mjs';
const self = fileURLToPath(import.meta.url);
const sample = () => Buffer.from(Array.from({ length: 16384 }, (_, i) => i % 256));
try {
  const [action, keyId, archiveId, expected] = process.argv.slice(2);
  if (action === 'verify' && process.argv.length === 6) {
    const sealed = await readPrivateBackupFile(archiveId, 'synthetic.pgp');
    const plaintext = await decryptLocalBackup(keyId, sealed);
    try { if (backupHash(plaintext) !== expected || !plaintext.equals(sample())) throw new Error(); }
    finally { plaintext.fill(0); }
    const tampered = Buffer.from(sealed); tampered[tampered.length - 8] ^= 1;
    let denied = false;
    try { const bad = await decryptLocalBackup(keyId, tampered); bad.fill(0); } catch { denied = true; }
    if (!denied) throw new Error();
    process.stdout.write(JSON.stringify({ freshProcessDecryptionVerified: true, tamperDenied: true, ciphertextSha256: backupHash(sealed) }));
  } else if (action === 'create' && process.argv.length === 4) {
    const id = randomUUID(), plaintext = sample(), digest = backupHash(plaintext);
    const sealed = await encryptLocalBackup(keyId, plaintext); plaintext.fill(0);
    await writePrivateBackupFile(id, 'synthetic.pgp', sealed);
    const observed = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [self, 'verify', keyId, id, digest], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = []; let length = 0, stopped = false;
      const timer = setTimeout(() => { stopped = true; child.kill(); }, 60000);
      child.stdout.on('data', value => { length += value.length; if (length > 4096) { stopped = true; child.kill(); } else chunks.push(value); });
      child.stderr.on('data', () => { stopped = true; child.kill(); });
      child.on('error', reject); child.on('close', code => { clearTimeout(timer); if (stopped || code !== 0) reject(new Error()); else { try { resolve(JSON.parse(Buffer.concat(chunks))); } catch { reject(new Error()); } } });
    });
    const { metadata } = await loadRecoveryPublicKey(keyId);
    const proof = { format: 'nestory-synthetic-local-crypto-proof-v1', archiveId: id, keyId, keyFingerprint: metadata.fingerprint,
      plaintextBytes: 16384, plaintextSha256: digest, ciphertextBytes: sealed.length, ...observed,
      syntheticOnly: true, customerDataCaptured: false, databaseRestoreProven: false, offHostKeyRecoveryProven: false, at: new Date().toISOString() };
    await writePrivateBackupFile(id, 'proof.json', Buffer.from(JSON.stringify(proof)));
    process.stdout.write(`${JSON.stringify(proof)}\n`);
  } else throw new Error();
} catch { process.stderr.write('local_backup_synthetic_crypto_proof_failed\n'); process.exitCode = 1; }
