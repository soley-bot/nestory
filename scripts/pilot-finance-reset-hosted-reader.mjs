// Fixed metadata reader for a pre-provisioned protected psql runner.
// No CLI, environment discovery, credential reads, general SQL or reset writes.
// Process mocks establish this contract only, never real hosted TLS or identity.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertApprovalPacket, isNoBackupApprovalPacket, approvalObservationQuery, exactKeys, validateApprovalObservation } from './pilot-finance-reset-hosted-protocol.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sourceFiles = Object.freeze([
  'scripts/pilot-finance-reset-operator-core.mjs',
  'scripts/pilot-finance-reset-no-backup-core.mjs',
  'scripts/pilot-finance-reset-hosted-protocol.mjs',
  'scripts/pilot-finance-reset-hosted-reader.mjs',
]);
const connectionFields = ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath'];
const processTimeoutMs = 20000;
const stdoutLimit = 65536;
const stderrLimit = 8192;
const fail = code => { throw new Error(code); };

function absoluteLocalPath(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\0\r\n]/.test(value) &&
    !/^(?:\\\\|\/\/)/.test(value) && !value.split(/[\\/]/).some(part => part === '.' || part === '..') &&
    (path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}

function validateConnection(packet, connection) {
  if (!exactKeys(connection, connectionFields) || !/^[a-z0-9]{20}$/.test(connection.expectedProjectRef) ||
    connection.expectedProjectRef !== packet.operation.projectRef ||
    connection.host !== `db.${connection.expectedProjectRef}.supabase.co` || connection.port !== 5432 || connection.database !== 'postgres' ||
    typeof connection.user !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(connection.user) ||
    !['psqlPath', 'sslRootCertPath', 'passwordFilePath'].every(field => absoluteLocalPath(connection[field])) ||
    !/^psql(?:\.exe)?$/i.test(connection.psqlPath.split(/[\\/]/).at(-1))) fail('hosted_reader_connection_invalid');
}

async function verifySources(packet) {
  for (const name of isNoBackupApprovalPacket(packet) ? packet.sourceFiles.map(source => source.path) : sourceFiles) {
    let bytes;
    try { bytes = await readFile(path.join(root, name)); }
    catch { fail('hosted_reader_source_unavailable'); }
    if (packet.sourceFiles.find(source => source.path === name)?.sha256 !== hashSourceBytes(bytes)) fail('hosted_reader_source_changed');
  }
}

function statementFor(packet, query) {
  // The operation UUID has already passed the packet's strict UUID validator;
  // callers cannot supply SQL or psql variable interpolation. A fresh process
  // executes exactly this prepared statement inside one read-only transaction.
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL timezone = 'UTC';
PREPARE nestory_financial_reset_approval_observation(uuid,integer) AS
${query.text};
EXECUTE nestory_financial_reset_approval_observation('${packet.operation.operationId}'::uuid,${query.values[1] ?? 'NULL'}::integer);
COMMIT;
`;
}

function runPsql(connection, input, spawnProcess) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(connection.psqlPath, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off'], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        // Explicit environment prevents inherited PGHOST/PGSERVICE/PGOPTIONS or
        // PGPASSWORD from changing the target, auth path or transaction behavior.
        // Credentials remain in an existing protected passfile; never argv/stdin.
        env: {
          PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
          PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable', PGSSLROOTCERT: connection.sslRootCertPath, PGPASSFILE: connection.passwordFilePath,
          PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nestory_financial_reset_approval_reader',
        },
      });
    } catch { reject(new Error('hosted_reader_process_start_failed')); return; }
    let complete = false, timer;
    const chunks = [];
    let stdoutBytes = 0, stderrBytes = 0;
    const stop = code => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* No driver errors may escape. */ }
      reject(new Error(code));
    };
    if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function' ||
      typeof child.stdin?.end !== 'function' || typeof child.stdin?.on !== 'function' ||
      typeof child.stdout?.on !== 'function' || typeof child.stderr?.on !== 'function') {
      stop('hosted_reader_process_invalid'); return;
    }
    timer = setTimeout(() => stop('hosted_reader_process_timeout'), processTimeoutMs);
    child.once('error', () => stop('hosted_reader_process_failed'));
    child.stdin.on('error', () => stop('hosted_reader_process_failed'));
    child.stdout.on('error', () => stop('hosted_reader_process_failed'));
    child.stderr.on('error', () => stop('hosted_reader_process_failed'));
    child.stdout.on('data', data => {
      if (complete) return;
      const bytes = Buffer.from(data);
      stdoutBytes += bytes.byteLength;
      if (stdoutBytes > stdoutLimit) { stop('hosted_reader_output_limit'); return; }
      chunks.push(bytes);
    });
    child.stderr.on('data', data => {
      if (complete) return;
      // Count without retaining or exposing stderr, which may contain paths or
      // authentication details from libpq. Even a warning makes this read fail.
      stderrBytes += Buffer.byteLength(data);
      if (stderrBytes > stderrLimit) stop('hosted_reader_output_limit');
    });
    child.once('close', (code, signal) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      if (code !== 0 || signal || stderrBytes) { reject(new Error('hosted_reader_process_failed')); return; }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    try { child.stdin.end(input, 'utf8'); }
    catch { stop('hosted_reader_process_failed'); }
  });
}

// The independently supplied connection belongs to the protected runner, not to
// the review packet. TLS/CA/passfile provisioning and real permissions are runtime
// dependencies. This module neither creates them nor certifies them from mocks.
export function createHostedApprovalReader(options) {
  if (!exactKeys(options, ['packet', 'connection']) && !exactKeys(options, ['packet', 'connection', 'spawnProcess'])) fail('hosted_reader_options_invalid');
  if (options.spawnProcess !== undefined && typeof options.spawnProcess !== 'function') fail('hosted_reader_options_invalid');
  const packet = structuredClone(options.packet), connection = structuredClone(options.connection);
  assertApprovalPacket(packet);
  validateConnection(packet, connection);
  const spawnProcess = options.spawnProcess ?? spawn;
  return async function observeDatabase(query) {
    // Exact descriptor comparison rejects altered statement, transaction, target,
    // operation parameters, extra fields and callbacks before any process runs.
    let actualQuery, expectedQuery;
    try {
      actualQuery = canonicalJson(query);
      expectedQuery = approvalObservationQuery(packet, query?.values?.[1]);
    }
    catch { fail('hosted_reader_query_invalid'); }
    if (actualQuery !== canonicalJson(expectedQuery)) fail('hosted_reader_query_invalid');
    await verifySources(packet);
    const output = await runPsql(connection, statementFor(packet, expectedQuery), spawnProcess);
    let observation;
    try { observation = JSON.parse(output.trim()); }
    catch { fail('hosted_reader_output_invalid'); }
    const rows = [{ financial_reset_approval_observation: observation }];
    validateApprovalObservation(packet, rows, expectedQuery.values[1]);
    if (isNoBackupApprovalPacket(packet)) await verifySources(packet);
    return rows;
  };
}
