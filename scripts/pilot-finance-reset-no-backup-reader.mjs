// Concrete fixed read-only psql adapter. No credential discovery, general SQL,
// mutation, consent verification, or durable-attempt provisioning.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, hostedNoBackupBinding, assertNoBackupHostedBinding, verifyNoBackupSourceContents }
  from './pilot-finance-reset-no-backup-core.mjs';
import { noBackupObservationQuery, validateNoBackupDatabaseObservation } from './pilot-finance-reset-no-backup-transport.mjs';
import { observationSql, literal, timestampMicros } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { assertReopeningHostedBinding, noBackupReopeningAuditQuery, validateNoBackupReopeningAudit, reopeningObservationQuery }
  from './pilot-finance-reset-reopening-protocol.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fail = code => { throw new Error(`no_backup_reader_${code}`); };
const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...fields].sort());
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const concreteResults = new WeakMap();
const connectionFields = ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath'];
export const NO_BACKUP_READER_LIMITS = Object.freeze({ processTimeoutMs: 60000, stdoutBytes: 16 * 1024 * 1024, stderrBytes: 8192 });

function absolute(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\0\r\n]/.test(value) && !/^(?:\\\\|\/\/)/.test(value) &&
    !value.split(/[\\/]/).some(part => part === '.' || part === '..') && (path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}
function validateConnection(packet, connection) {
  if (!exact(connection, connectionFields) || connection.expectedProjectRef !== packet.operation.projectRef ||
    connection.host !== `db.${packet.operation.projectRef}.supabase.co` || connection.port !== 5432 || connection.database !== 'postgres' ||
    typeof connection.user !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(connection.user) ||
    !['psqlPath', 'sslRootCertPath', 'passwordFilePath'].every(field => absolute(connection[field])) ||
    !/^psql(?:\.exe)?$/i.test(connection.psqlPath.split(/[\\/]/).at(-1))) fail('connection_invalid');
}

async function readSources(packet) {
  const sourceContents = {};
  for (const source of packet.sourceFiles) {
    try { sourceContents[source.path] = await readFile(path.join(root, source.path)); }
    catch { fail('source_unavailable'); }
  }
  try { verifyNoBackupSourceContents(packet, sourceContents); } catch { fail('source_changed'); }
  return sourceContents;
}

function runPsql(connection, input, spawnProcess) {
  return new Promise((resolve, reject) => {
    let child, done = false, timer, stdoutBytes = 0, stderrBytes = 0;
    const chunks = [];
    const stop = code => {
      if (done) return; done = true; clearTimeout(timer);
      try { child?.kill('SIGKILL'); } catch { /* Suppress private process details. */ }
      reject(new Error(`no_backup_reader_${code}`));
    };
    try {
      child = spawnProcess(connection.psqlPath, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off'], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
          PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable', PGSSLROOTCERT: connection.sslRootCertPath,
          PGPASSFILE: connection.passwordFilePath, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nestory_no_backup_fixed_reader' },
      });
    } catch { stop('process_start_failed'); return; }
    if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function' || typeof child.stdin?.end !== 'function' ||
      [child.stdin, child.stdout, child.stderr].some(stream => typeof stream?.on !== 'function' || typeof stream?.once !== 'function')) { stop('process_invalid'); return; }
    timer = setTimeout(() => stop('process_timeout'), NO_BACKUP_READER_LIMITS.processTimeoutMs);
    for (const stream of [child, child.stdin, child.stdout, child.stderr]) stream.once('error', () => stop('process_failed'));
    child.stdout.on('data', data => {
      if (done) return;
      const content = Buffer.from(data); stdoutBytes += content.byteLength;
      if (stdoutBytes > NO_BACKUP_READER_LIMITS.stdoutBytes) { stop('output_limit'); return; }
      chunks.push(content);
    });
    child.stderr.on('data', data => {
      if (done) return; stderrBytes += Buffer.byteLength(data);
      if (stderrBytes > NO_BACKUP_READER_LIMITS.stderrBytes) stop('output_limit');
    });
    child.once('close', (code, signal) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code !== 0 || signal || stderrBytes) { reject(new Error('no_backup_reader_process_failed')); return; }
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { reject(new Error('no_backup_reader_output_invalid')); }
    });
    try { child.stdin.end(input, 'utf8'); } catch { stop('process_failed'); }
  });
}

const identitySql = "SELECT jsonb_build_object('database',current_database(),'sessionUser',session_user,'readOnly',current_setting('transaction_read_only')) AS no_backup_reader_identity;";
function hardenRead(sql) {
  if (!sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;') || !sql.endsWith('\nCOMMIT;') ||
    sql.split('\nSELECT ').length < 2) fail('fixed_query_changed');
  return sql.replace('\nSELECT ', `\nSET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='25s';\n${identitySql}\nSELECT `);
}
function baseObservationSql(packet, binding, authorizationId) {
  const sql = observationSql(packet, binding, authorizationId, authorizationId === null ? null : 'execute');
  const anchor = "SELECT jsonb_build_object('catalog',";
  if (sql.split(anchor).length !== 2) fail('fixed_query_changed');
  return sql.replace(anchor, `SELECT jsonb_build_object('reservationHashValid',(SELECT r.binding_sha256=app_private.financial_reset_hash(r.binding) FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=${literal(binding.operation_id)}::uuid),'catalog',`);
}
function appendFixedQuery(base, query, name) {
  if (!query || !query.text.startsWith('SELECT jsonb_build_object(') || !Array.isArray(query.values) || query.values.length !== 3 ||
    !uuid(query.values[0]) || !uuid(query.values[2]) || !base.endsWith('\nCOMMIT;')) fail('fixed_query_changed');
  return `${base.slice(0, -8)}\nPREPARE ${name}(uuid,jsonb,uuid) AS\n${query.text};\nEXECUTE ${name}(${literal(query.values[0])}::uuid,${literal(canonicalJson(query.values[1]))}::jsonb,${literal(query.values[2])}::uuid);\nCOMMIT;`;
}

function parseRows(output, count, connection) {
  let rows;
  try {
    const lines = output.trim().split(/\r?\n/);
    if (lines.length !== count + 1) fail('output_count_invalid');
    rows = lines.map(line => JSON.parse(line));
  } catch { fail('output_invalid'); }
  const identity = rows.shift();
  if (!exact(identity, ['database', 'sessionUser', 'readOnly']) || identity.database !== 'postgres' ||
    identity.sessionUser !== connection.user || identity.readOnly !== 'on') fail('database_identity_invalid');
  return rows;
}
function validateAuthorization(value, expectedId, actorId) {
  if (!exact(value, ['authorizationId', 'actorId', 'status', 'bindingMatches', 'backendPid', 'transactionId', 'expiresAt', 'observedAt']) ||
    value.authorizationId !== expectedId || typeof value.bindingMatches !== 'boolean' ||
    !['pending', 'consumed', 'expired', 'revoked', 'missing', 'mismatch'].includes(value.status) ||
    (value.bindingMatches ? value.actorId !== actorId : value.actorId !== null) ||
    (value.backendPid !== null && (!Number.isSafeInteger(value.backendPid) || value.backendPid < 1)) ||
    (value.transactionId !== null && (typeof value.transactionId !== 'string' || !/^[1-9][0-9]*$/.test(value.transactionId))) ||
    (value.expiresAt !== null && timestampMicros(value.expiresAt) === null) || timestampMicros(value.observedAt) === null) fail('authorization_output_invalid');
}
function validateReceipt(value, binding, authorizationId) {
  if (!exact(value, ['receipt', 'control', 'authorization', 'authorizationSessionId']) ||
    (value.authorizationSessionId !== null && !uuid(value.authorizationSessionId))) fail('receipt_output_invalid');
  validateAuthorization(value.authorization, authorizationId, binding.continuation_semantic.actor_id);
  if (value.control !== null && (!exact(value.control, ['status', 'generation', 'cutoff']) || !['open', 'frozen'].includes(value.control.status) ||
    !Number.isSafeInteger(value.control.generation) || value.control.generation < 0 ||
    (value.control.cutoff !== null && timestampMicros(`${value.control.cutoff}T00:00:00Z`) === null))) fail('receipt_output_invalid');
  const receipt = value.receipt;
  if (receipt !== null && (!exact(receipt, ['operationId', 'binding', 'bindingSha256', 'evidenceSha256', 'checkpointSha256', 'afterSha256',
    'authorizationId', 'actorId', 'sessionId', 'backendPid', 'transactionId', 'result', 'sha256', 'hashValid']) ||
    receipt.operationId !== binding.operation_id || !same(receipt.binding, binding) || receipt.authorizationId !== authorizationId ||
    receipt.actorId !== binding.continuation_semantic.actor_id || !uuid(receipt.sessionId) || !Number.isSafeInteger(receipt.backendPid) || receipt.backendPid < 1 ||
    typeof receipt.transactionId !== 'string' || !/^[1-9][0-9]*$/.test(receipt.transactionId) || receipt.hashValid !== true ||
    !['bindingSha256', 'evidenceSha256', 'checkpointSha256', 'afterSha256', 'sha256'].every(key => digest(receipt[key])) ||
    !receipt.result || Object.getPrototypeOf(receipt.result) !== Object.prototype)) fail('receipt_binding_changed');
}

function createReader(options, spawnProcess, synthetic) {
  if (!exact(options, ['packet', 'postgresSemanticText', 'connection'])) fail('options_invalid');
  const packet = structuredClone(options.packet), connection = structuredClone(options.connection);
  assertNoBackupPacket(packet); validateConnection(packet, connection);
  let semanticText, semantic;
  try {
    if (!(typeof options.postgresSemanticText === 'string' || options.postgresSemanticText instanceof Uint8Array)) throw Error();
    semanticText = Buffer.from(options.postgresSemanticText);
    semantic = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(semanticText));
    hostedNoBackupBinding(packet, semantic, semanticText);
  } catch { fail('semantic_binding_invalid'); }
  const complete = (kind, sql, payload) => {
    const result = freeze({ format: 'nestory-no-backup-fixed-read-result-v1', kind, operationId: packet.operation.operationId,
      packetSha256: packet.packetSha256, sourcesSha256: packet.sourcesSha256, querySha256: hashBytes(sql),
      transport: synthetic ? 'synthetic-process' : 'fixed-read-only-psql', runtimeProvenanceVerified: false, authorityVerified: false, ...payload });
    if (!synthetic) concreteResults.set(result, { operationId: result.operationId, packetSha256: result.packetSha256,
      querySha256: result.querySha256, kind });
    return result;
  };
  const execute = async (sql, count) => {
    const files = await readSources(packet), output = await runPsql(connection, sql, spawnProcess), rows = parseRows(output, count, connection);
    await readSources(packet);
    return { files, rows };
  };
  return Object.freeze({
    async readForward(request) {
      if (!exact(request, ['binding', 'action', 'authorizationId', 'previousIntent'])) fail('request_invalid');
      const input = structuredClone(request);
      const query = noBackupObservationQuery({ packet, postgresSemanticText: semanticText, ...input }), sql = hardenRead(query.text);
      const { files, rows } = await execute(sql, query.observationCount);
      rows.forEach((row, index) => {
        validateNoBackupDatabaseObservation({ packet, sourceContents: files, observation: row });
        validateAuthorization(row.authorization, index === 0 ? input.authorizationId : input.previousIntent.authorizationId, input.binding.continuation_semantic.actor_id);
      });
      return complete('forward', sql, { observation: rows[0], previousObservation: rows[1] ?? null });
    },
    async readReopeningAudit(request) {
      if (!exact(request, ['binding', 'authorizationId'])) fail('request_invalid');
      const { binding, authorizationId } = structuredClone(request);
      assertNoBackupHostedBinding(packet, binding, semanticText);
      const query = noBackupReopeningAuditQuery({ packet, binding, postgresSemanticText: semanticText, authorizationId });
      const sql = hardenRead(appendFixedQuery(baseObservationSql(packet, binding, authorizationId), query, 'nestory_no_backup_reopening_audit'));
      const { files, rows: [observation, audit] } = await execute(sql, 2);
      validateNoBackupDatabaseObservation({ packet, sourceContents: files, observation });
      validateAuthorization(observation.authorization, authorizationId, binding.continuation_semantic.actor_id);
      const proof = validateNoBackupReopeningAudit({ packet, binding, postgresSemanticText: semanticText, observation, audit });
      if (observation.sourceSha256 !== proof.afterSha256) fail('current_checkpoint_source_changed');
      return complete('reopening-audit', sql, { observation, audit, proof });
    },
    async readReopeningReceipt(request) {
      if (!exact(request, ['binding', 'authorizationId'])) fail('request_invalid');
      const { binding, authorizationId } = structuredClone(request);
      assertReopeningHostedBinding(packet, binding, semanticText);
      const query = reopeningObservationQuery({ packet, binding, authorizationId, postgresSemanticText: semanticText });
      // Historical acknowledgment is independent of later financial entries or
      // schema releases. It cannot supply current mutation/reopening readiness.
      // Fresh protected read authority remains a separate runtime requirement.
      const sql = appendFixedQuery(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='25s'; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC';
${identitySql}
COMMIT;`, query, 'nestory_no_backup_reopening_receipt');
      const { rows: [receiptObservation] } = await execute(sql, 1);
      validateReceipt(receiptObservation, binding, authorizationId);
      return complete('historical-reopening-receipt', sql, { receiptObservation, currentReadinessVerified: false });
    },
  });
}

// Production construction accepts no observation/provider/process callbacks.
export function createNoBackupReadOnlyReader(options) { return createReader(options, spawn, false); }

// Explicit process simulation for offline tests. Its results never acquire the
// concrete-reader brand and cannot be promoted by copying their JSON fields.
export function createSyntheticNoBackupReaderForTests(options, spawnProcess) {
  if (typeof spawnProcess !== 'function') fail('test_process_invalid');
  return createReader(options, spawnProcess, true);
}
export function assertConcreteNoBackupReaderResult(result) {
  const provenance = result && typeof result === 'object' ? concreteResults.get(result) : null;
  if (!provenance) fail('concrete_process_result_required');
  // This attests fixed code/process custody only. Protected configuration,
  // current human authority and consent remain separate required checks.
  return freeze({ ...provenance, runtimeProvenanceVerified: false, authorityVerified: false });
}
