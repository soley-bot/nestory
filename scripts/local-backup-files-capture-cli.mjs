// Parent-assisted source witnessing only. The parent obtains each fresh digest
// through the reviewed read-only SQL/MCP path; this process cannot assert one.
// Stdin/out carry bounded metadata, never plaintext rows, files or credentials.
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { backupHash, readPrivateBackupFile, decryptLocalBackup, decryptLocalBackupChunks, loadRecoveryPublicKey } from './local-backup-crypto.mjs';
import { verifyCaptureChunk, verifyCaptureCompleteness } from './local-backup-capture.mjs';
import { buildLocalFileCapturePlan, captureLocalBackupFiles } from './local-backup-files.mjs';
import { holdBusinessSpillCustody } from './local-backup-business-runtime.mjs';

const fail = () => { throw Error('local_backup_files_capture_cli_failed'); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const exact = (o, keys) => o && Object.getPrototypeOf(o) === Object.prototype && Object.keys(o).sort().join(',') === [...keys].sort().join(',');
const parse = bytes => JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
export function assertFileCaptureStart(value) {
  if (!exact(value, ['format', 'keyId', 'archiveId', 'archiveSha256', 'sourceSha256']) ||
    value.format !== 'nestory-local-files-capture-start-v1' || !uuid.test(value.keyId) || !uuid.test(value.archiveId) ||
    !digest.test(value.archiveSha256) || !digest.test(value.sourceSha256)) fail();
  return value;
}

// The source replies are trusted only as the parent's actual fresh MCP results.
// A random per-request challenge prevents queued/replayed before/after replies;
// a reply is never synthesized from the requested or saved source digest.
export function createFileSourceWitnessHandshake({ readLine, writeLine }) {
  let sequence = 0, waiting = false;
  return async () => {
    if (waiting || sequence >= 2) fail();
    waiting = true; const current = ++sequence, challenge = randomUUID();
    try {
      await writeLine({ format: 'nestory-local-files-source-witness-request-v1', sequence: current,
        phase: current === 1 ? 'before-downloads' : 'after-downloads', challenge });
      const reply = await readLine();
      if (!exact(reply, ['format', 'sequence', 'challenge', 'sourceSha256']) ||
        reply.format !== 'nestory-local-files-source-witness-response-v1' || reply.sequence !== current ||
        reply.challenge !== challenge || !digest.test(reply.sourceSha256)) fail();
      return { sourceSha256: reply.sourceSha256 };
    } finally { waiting = false; }
  };
}

export async function loadCapturedManifestForFiles(request) {
  assertFileCaptureStart(request);
  let stage = 'archive-read';
  const sealed = await readPrivateBackupFile(request.archiveId, 'archive.pgp');
  if (backupHash(sealed) !== request.archiveSha256) fail();
  let packageBytes, chunks = [], payload;
  try {
    stage = 'package-decrypt';
    packageBytes = await decryptLocalBackup(request.keyId, sealed);
    stage = 'package-shape';
    const p = parse(packageBytes);
    if (!exact(p, ['format', 'keyId', 'before', 'after', 'observations']) || p.format !== 'nestory-encrypted-pilot-capture-package-v1' ||
      p.keyId !== request.keyId || !Array.isArray(p.observations) || p.observations.length < 1 || p.observations.length > 4096 ||
      p.before?.sourceSha256 !== request.sourceSha256) fail();
    stage = 'public-key';
    const { metadata } = await loadRecoveryPublicKey(request.keyId);
    if (p.before.publicKeySha256 !== metadata.publicKeySha256) fail();
    stage = 'chunk-binding';
    const encrypted = p.observations.map((o, index) => verifyCaptureChunk(o, { ...p.before, chunkIndex: index }));
    stage = 'chunk-decrypt';
    try { chunks = await decryptLocalBackupChunks(request.keyId, encrypted); }
    finally { encrypted.forEach(bytes => bytes.fill(0)); }
    stage = 'source-completeness';
    payload = verifyCaptureCompleteness({ before: p.before, after: p.after, observations: p.observations, plaintextChunks: chunks });
    stage = 'file-plan';
    buildLocalFileCapturePlan(payload, request.sourceSha256);
    return payload;
  } catch (error) {
    payload?.fill(0);
    if (stage === 'file-plan' && /^local_backup_files_[a-z0-9_]+$/.test(error?.message ?? '')) throw error;
    throw Error(`local_backup_files_capture_${stage.replaceAll('-', '_')}_failed`);
  }
  finally { sealed.fill(0); packageBytes?.fill(0); chunks.forEach(bytes => bytes.fill(0)); }
}

async function main() {
  if (process.platform !== 'win32' || process.argv.length !== 3 || process.argv[2] !== 'capture') fail();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator](); let inputBytes = 0;
  const readLine = async () => {
    let timer;
    try {
      const result = await Promise.race([iterator.next(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('source_witness_timeout')), 300000);
      })]);
      if (result.done || (inputBytes += Buffer.byteLength(result.value)) > 16384 || Buffer.byteLength(result.value) > 4096) fail();
      try { return JSON.parse(result.value); } catch { throw Error('local_backup_files_capture_input_invalid'); }
    } finally { clearTimeout(timer); }
  };
  // Whole stdin is bounded even if a sender never terminates a line.
  let rawInputBytes = 0;
  process.stdin.on('error', () => {}); // The line iterator reports failure; never emit an unhandled native stack.
  process.stdin.on('data', bytes => { rawInputBytes += bytes.length; if (rawInputBytes > 16384) process.stdin.destroy(Error('input_limit')); });
  const writeLine = value => process.stdout.write(`${JSON.stringify(value)}\n`);
  let manifestBytes, custody;
  try {
    const start = assertFileCaptureStart(await readLine());
    custody = await holdBusinessSpillCustody();
    manifestBytes = await loadCapturedManifestForFiles(start);
    const witness = createFileSourceWitnessHandshake({ readLine, writeLine });
    const observeSourceWitness = async () => {
      await custody.check();
      const result = await witness();
      await custody.check();
      return result;
    };
    const proof = await captureLocalBackupFiles({ manifestBytes, expectedSourceSha256: start.sourceSha256, keyId: start.keyId, observeSourceWitness,
      onProgress: summary => { if (summary.completedObjects % 5 === 0 || summary.completedObjects === summary.totalObjects)
        writeLine({ format: 'nestory-local-files-capture-progress-v1', ...summary }); },
    });
    await custody.check();
    writeLine({ format: 'nestory-local-files-capture-result-v1', proof });
  } finally { manifestBytes?.fill(0); await custody?.close(); lines.close(); process.stdin.destroy(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    const safeCodes = ['local_backup_files_capture_input_invalid', 'local_backup_files_local_credential_unavailable',
      ...['platform_unsupported', 'installation_changed', 'response_invalid', 'ambiguous', 'missing', 'key_invalid', 'reveal_changed', 'request_failed', 'output_limit', 'timeout'].map(code => `local_backup_files_cli_credential_${code}`),
      'local_backup_files_local_credential_ambiguous', 'local_backup_files_local_credential_invalid', 'local_backup_files_local_project_mismatch',
      'local_backup_files_capture_package_decrypt_failed', 'local_backup_files_capture_package_shape_failed',
      'local_backup_files_capture_public_key_failed', 'local_backup_files_capture_chunk_binding_failed',
      'local_backup_files_capture_chunk_decrypt_failed', 'local_backup_files_capture_source_completeness_failed'];
    process.stderr.write(`${safeCodes.includes(error?.message) ? error.message : 'local_backup_files_capture_cli_failed'}\n`); process.exitCode = 1;
  });
}
