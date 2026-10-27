// Synthetic encrypted backup proof only. Customer intake is deliberately closed
// until actual WSL swap/crash custody and the complete restore contract exist.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { backupHash, loadRecoveryPublicKey, encryptLocalBackup, decryptLocalBackup,
  writePrivateBackupFile, readPrivateBackupFile } from './local-backup-crypto.mjs';

export const RAM_POSTGRES_IMAGE = 'sha256:f6cdd6bf9b556934e8a761d92d082488db206deeec9349c4e938a72d65677e80';
const label = 'nestory.local-backup.run';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const memory = 512 * 1024 * 1024;
const tmpfs = 'rw,nosuid,nodev,noexec,size=320m,uid=100,gid=101,mode=0700';
const fail = code => { throw new Error(`local_backup_restore_${code}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const literal = text => `'${text.replaceAll("'", "''")}'`;
const exact = (value, keys) => value && same(Object.keys(value).sort(), [...keys].sort());
export const RESTORE_SOURCE_FILES = Object.freeze(['local-backup-restore.mjs', 'local-backup-crypto.mjs',
  'local-backup-windows.ps1', 'local-recovery-docker.mjs']);
const sources = async () => Promise.all(RESTORE_SOURCE_FILES.map(async name => ({ name,
  sha256: backupHash((await readFile(path.join(import.meta.dirname, name), 'utf8')).replaceAll('\r\n', '\n')) })));

export function assertRehearsalMode(mode) {
  // Neither a supplied Boolean nor synthetic success can grant customer custody.
  if (mode !== 'synthetic') fail('customer_intake_spill_custody_unverified');
}

export function assertRamContainer(binding, c, running = true) {
  if (!exact(binding, ['runId', 'stage', 'id']) || !uuid.test(binding.runId) ||
      !['capture', 'restore'].includes(binding.stage) || !digest.test(binding.id)) fail('binding_invalid');
  const h = c?.HostConfig;
  if (c?.Id !== binding.id || c.Image !== RAM_POSTGRES_IMAGE || c.Name !== `/nestory-local-backup-${binding.runId}-${binding.stage}` ||
      c.Config?.Labels?.[label] !== binding.runId || c.Config?.Labels?.['nestory.local-backup.stage'] !== binding.stage ||
      c.Config?.User !== '100:101' || c.State?.Running !== running || !h || h.ReadonlyRootfs !== true ||
      h.NetworkMode !== 'none' || h.Privileged !== false || h.LogConfig?.Type !== 'none' ||
      h.Memory !== memory || h.MemorySwap !== memory || h.PidsLimit !== 64 ||
      !same(h.CapDrop, ['ALL']) || (h.CapAdd?.length ?? 0) !== 0 ||
      !h.SecurityOpt?.some(v => v === 'no-new-privileges' || v === 'no-new-privileges:true') ||
      !h.Ulimits?.some(v => v.Name === 'core' && v.Hard === 0 && v.Soft === 0) ||
      !exact(h.Tmpfs, ['/db']) || h.Tmpfs['/db'] !== tmpfs ||
      (h.Binds?.length ?? 0) !== 0 || (h.VolumesFrom?.length ?? 0) !== 0 ||
      Object.keys(h.PortBindings ?? {}).length !== 0 || (h.Devices?.length ?? 0) !== 0 ||
      !Array.isArray(c.Mounts) || c.Mounts.some(m => m.Type !== 'tmpfs' || m.Destination !== '/db') ||
      Object.keys(c.NetworkSettings?.Networks ?? {}).some(n => n !== 'none') ||
      c.Config?.Volumes && Object.keys(c.Config.Volumes).length) fail('container_custody_changed');
  return true;
}

export function assertCaptureReceipt(r) {
  if (!exact(r, ['format', 'syntheticOnly', 'runId', 'keyId', 'archiveId', 'cipherSha256', 'dumpSha256',
    'dumpBytes', 'rowsSha256', 'sourceContainerId', 'sourceRemoved', 'capturePid', 'pgcryptoInterop', 'image', 'sourceFiles']) ||
    r.format !== 'nestory-synthetic-ram-backup-capture-v1' || r.syntheticOnly !== true ||
    ![r.runId, r.keyId, r.archiveId].every(v => uuid.test(v)) ||
    ![r.cipherSha256, r.dumpSha256, r.rowsSha256, r.sourceContainerId].every(v => digest.test(v)) ||
    !Number.isSafeInteger(r.dumpBytes) || r.dumpBytes < 1 || r.dumpBytes > 32 * 1024 * 1024 ||
    !Number.isSafeInteger(r.capturePid) || r.capturePid < 1 || r.sourceRemoved !== true || r.pgcryptoInterop !== true ||
    r.image !== RAM_POSTGRES_IMAGE || !Array.isArray(r.sourceFiles) || r.sourceFiles.length !== RESTORE_SOURCE_FILES.length ||
    r.sourceFiles.some((v, i) => !exact(v, ['name', 'sha256']) || v.name !== RESTORE_SOURCE_FILES[i] || !digest.test(v.sha256))) fail('capture_receipt_invalid');
  return r;
}

// All subprocess errors are fixed codes. SQL, ciphertext and decrypted bytes are
// stdin/stdout pipes, never arguments, environment, labels or Docker metadata.
function execute(file, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, windowsHide: true, env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0, broken = false;
    const stop = () => { broken = true; child.kill(); };
    const timer = setTimeout(stop, options.timeoutMs ?? 120000);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 64 * 1024 * 1024) stop(); else chunks.push(chunk); });
    child.stderr.on('data', () => {});
    child.stdin.on('error', stop); child.on('error', stop);
    child.once('close', code => {
      clearTimeout(timer);
      if (broken || code !== 0) { for (const c of chunks) c.fill(0); reject(new Error('local_backup_restore_process_failed')); }
      else { const result = Buffer.concat(chunks); for (const c of chunks) c.fill(0); resolve(result); }
    });
    child.stdin.end(input ?? '');
  });
}

async function localDocker() {
  const result = await localRecoveryDocker({ execute: async (...args) => (await execute(...args)).toString('utf8') });
  const docker = (args, input) => execute('docker', ['--host', result.endpoint, ...args], input);
  return docker;
}

async function createRamDatabase(runId, stage) {
  if (!uuid.test(runId) || !['capture', 'restore'].includes(stage)) fail('runtime_identity_invalid');
  const docker = await localDocker();
  const info = JSON.parse((await docker(['image', 'inspect', RAM_POSTGRES_IMAGE])).toString('utf8'));
  if (info.length !== 1 || info[0].Id !== RAM_POSTGRES_IMAGE || Object.keys(info[0].Config?.Volumes ?? {}).length) fail('image_changed');
  const name = `nestory-local-backup-${runId}-${stage}`;
  // Source bytes never enter the image layers. Every write, including PG logs,
  // sockets, dump staging and WAL, is confined to the single /db tmpfs.
  const start = 'set -eu; initdb -D /db/pg --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject >/dev/null; exec postgres -D /db/pg -c listen_addresses= -c unix_socket_directories=/db -c logging_collector=off -c shared_buffers=32MB -c log_statement=none -c log_min_error_statement=panic';
  const id = (await docker(['run', '-d', '--name', name, '--label', `${label}=${runId}`, '--label', `nestory.local-backup.stage=${stage}`,
    '--network', 'none', '--read-only', '--log-driver', 'none', '--user', '100:101', '--memory', `${memory}`, '--memory-swap', `${memory}`,
    '--pids-limit', '64', '--ulimit', 'core=0', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--tmpfs', `/db:${tmpfs}`,
    '--entrypoint', '/bin/sh', RAM_POSTGRES_IMAGE, '-c', start])).toString('utf8').trim();
  const binding = { runId, stage, id };
  async function inspect() {
    const values = JSON.parse((await docker(['inspect', id])).toString('utf8'));
    if (values.length !== 1) fail('container_unavailable');
    assertRamContainer(binding, values[0]);
  }
  async function exec(args, input) {
    await inspect();
    const output = await docker(['exec', '-i', id, ...args], input);
    try { await inspect(); return output; } catch (error) { output.fill(0); throw error; }
  }
  const sql = async text => (await exec(['psql', '-X', '-qAt', '-h', '/db', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], text)).toString('utf8').trim();
  const remove = async () => {
    await inspect(); // A replaced or unowned target is never cleaned up.
    await docker(['rm', '-f', id]);
    const ids = (await docker(['ps', '-aq', '--no-trunc', '--filter', `id=${id}`])).toString('utf8').trim();
    if (ids) fail('source_removal_unconfirmed');
  };
  try {
    await inspect();
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if (await sql('SELECT 1;') === '1') { ready = true; break; } } catch { /* Bounded startup only, before fixture input. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) fail('postgres_start_failed');
    const limits = (await exec(['/bin/sh', '-c', 'cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max'])).toString('utf8').trim();
    if (limits !== `${memory}\n0`) fail('cgroup_swap_not_disabled');
    return { binding, exec, sql, remove };
  } catch (error) {
    try { await remove(); } catch { fail('runtime_failure_cleanup_unconfirmed'); }
    throw error;
  }
}

const fixtureSql = `CREATE SCHEMA proof;
CREATE TABLE proof.contracts(id integer PRIMARY KEY, amount numeric(12,2), terms text NOT NULL);
CREATE TABLE proof.activity(id integer PRIMARY KEY, contract_id integer REFERENCES proof.contracts(id), amount numeric(12,2));
INSERT INTO proof.contracts VALUES(1,1234.56,'Synthetic complete contract'),(2,0,'Synthetic terminal contract');
INSERT INTO proof.activity VALUES(1,1,98.76),(2,2,-4.50);
CREATE EXTENSION pgcrypto WITH SCHEMA public;`;
const censusSql = `SELECT json_build_object('contracts',(SELECT json_agg(t ORDER BY id) FROM proof.contracts t),
'activity',(SELECT json_agg(t ORDER BY id) FROM proof.activity t))::text;`;
const fixtureCensus = JSON.stringify({ contracts: [{ id: 1, amount: 1234.56, terms: 'Synthetic complete contract' },
  { id: 2, amount: 0, terms: 'Synthetic terminal contract' }], activity: [{ id: 1, contract_id: 1, amount: 98.76 }, { id: 2, contract_id: 2, amount: -4.5 }] });
const census = async runtime => {
  const value = JSON.stringify(JSON.parse(await runtime.sql(censusSql)));
  if (value !== fixtureCensus) fail('restored_rows_mismatch');
  return backupHash(value);
};

async function capture(keyId) {
  if (!uuid.test(keyId)) fail('key_identity_invalid');
  const sourceFiles = await sources();
  const runId = randomUUID(), archiveId = randomUUID();
  const runtime = await createRamDatabase(runId, 'capture');
  let dump, encrypted, saved, removed = false;
  try {
    await runtime.sql(fixtureSql);
    const rowsSha256 = await census(runtime);
    const publicKey = await loadRecoveryPublicKey(keyId);
    const interopBytes = Buffer.from('Synthetic pgcrypto to OpenPGP recovery proof\0\u00ff', 'utf8');
    const serverCipher = Buffer.from(await runtime.sql(`SELECT encode(pgp_pub_encrypt_bytea(decode('${interopBytes.toString('hex')}','hex'),
dearmor(${literal(publicKey.armored)}),'cipher-algo=aes256,compress-algo=0'),'base64');`), 'base64');
    const interopPlaintext = await decryptLocalBackup(keyId, serverCipher);
    const pgcryptoInterop = interopPlaintext.equals(interopBytes); interopPlaintext.fill(0); serverCipher.fill(0);
    if (!pgcryptoInterop) fail('pgcrypto_interoperability_failed');
    dump = await runtime.exec(['pg_dump', '-h', '/db', '-U', 'postgres', '-d', 'postgres', '--format=custom', '--no-owner', '--no-acl']);
    encrypted = await encryptLocalBackup(keyId, dump);
    saved = await writePrivateBackupFile(archiveId, 'synthetic.pgp', encrypted);
    if (!saved.equals(encrypted)) fail('ciphertext_readback_mismatch');
    const receipt = { format: 'nestory-synthetic-ram-backup-capture-v1', syntheticOnly: true, runId, keyId, archiveId,
      cipherSha256: backupHash(saved), dumpSha256: backupHash(dump), dumpBytes: dump.length, rowsSha256,
      sourceContainerId: runtime.binding.id, sourceRemoved: true, capturePid: process.pid, pgcryptoInterop,
      image: RAM_POSTGRES_IMAGE, sourceFiles };
    await runtime.remove(); removed = true;
    if (!same(sourceFiles, await sources())) fail('implementation_changed');
    return assertCaptureReceipt(receipt);
  } finally {
    dump?.fill(0); encrypted?.fill(0); saved?.fill(0);
    if (!removed) await runtime.remove();
  }
}

async function restore(receipt) {
  const r = assertCaptureReceipt(receipt);
  if (r.capturePid === process.pid) fail('fresh_process_required');
  if (!same(r.sourceFiles, await sources())) fail('implementation_changed');
  const docker = await localDocker();
  if ((await docker(['ps', '-aq', '--no-trunc', '--filter', `id=${r.sourceContainerId}`])).toString('utf8').trim()) fail('original_source_still_exists');
  // The decryption child receives only a receipt. Its plaintext comes solely
  // from persisted ciphertext and the newly reloaded DPAPI-wrapped private key.
  const saved = await readPrivateBackupFile(r.archiveId, 'synthetic.pgp');
  if (backupHash(saved) !== r.cipherSha256) fail('saved_ciphertext_changed');
  let plaintext, runtime, removed = false;
  try {
    plaintext = await decryptLocalBackup(r.keyId, saved);
    if (plaintext.length !== r.dumpBytes || backupHash(plaintext) !== r.dumpSha256) fail('decrypted_dump_mismatch');
    runtime = await createRamDatabase(r.runId, 'restore');
    if (runtime.binding.id === r.sourceContainerId) fail('fresh_database_required');
    await runtime.exec(['pg_restore', '-h', '/db', '-U', 'postgres', '-d', 'postgres', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], plaintext);
    const restoredRowsSha256 = await census(runtime);
    if (restoredRowsSha256 !== r.rowsSha256) fail('restored_census_changed');
    await runtime.remove(); removed = true;
    if (!same(r.sourceFiles, await sources())) fail('implementation_changed');
    const proof = { format: 'nestory-synthetic-encrypted-ram-restore-proof-v1', ...r, restorePid: process.pid,
      restoredContainerId: runtime.binding.id, restoredRowsSha256, restoreRemoved: true, processRestartProven: true,
      savedCiphertextRestoreProven: true, customerArchiveProven: false, customerSpillCustodyVerified: false,
      financialResetInverseProven: false, physicalStorageRecoveryProven: false, offHostKeyRecoveryProven: false };
    proof.format = 'nestory-synthetic-encrypted-ram-restore-proof-v1';
    await writePrivateBackupFile(r.archiveId, 'proof.json', Buffer.from(JSON.stringify(proof)));
    return proof;
  } finally {
    saved.fill(0); plaintext?.fill(0);
    if (runtime && !removed) await runtime.remove();
  }
}

async function readRequest() {
  const chunks = []; let length = 0;
  for await (const chunk of process.stdin) { length += chunk.length; if (length > 16384) fail('request_limit'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('request_invalid'); }
}

export async function runSyntheticEncryptedRestore(keyId) {
  if (!uuid.test(keyId)) fail('key_identity_invalid');
  // The capture process must finish (and destroy its database) before a new
  // process can read/decrypt the saved archive. Parent sees no plaintext bytes.
  const script = fileURLToPath(import.meta.url);
  const captured = JSON.parse((await execute(process.execPath, [script, '--synthetic-capture'], JSON.stringify({ keyId }))).toString('utf8'));
  assertCaptureReceipt(captured);
  return JSON.parse((await execute(process.execPath, [script, '--synthetic-restore'], JSON.stringify(captured))).toString('utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); let result;
    if (same(args, ['--synthetic-capture'])) { const r = await readRequest(); if (!exact(r, ['keyId'])) fail('request_invalid'); result = await capture(r.keyId); }
    else if (same(args, ['--synthetic-restore'])) result = await restore(await readRequest());
    else if (args.length === 3 && args[0] === '--synthetic' && args[1] === '--key-id') { assertRehearsalMode('synthetic'); result = await runSyntheticEncryptedRestore(args[2]); }
    else fail('customer_intake_spill_custody_unverified');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('{"status":"stopped","code":"local_backup_restore_failed","customerCustodyEstablished":false}\n');
    process.exitCode = 1;
  }
}
