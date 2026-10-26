// Concrete metadata reader and in-process locator custody. This module never
// creates sessions, receives tokens, writes SQL, or claims a reset was committed.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertOperatorPacket, canonicalJson, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { exactKeys, same } from './pilot-finance-reset-hosted-protocol.mjs';
import { HOSTED_ACTIONS, TRANSPORT_SOURCE_FILES, hostedBinding } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { assertNoBackupPacket, assertNoBackupHostedBinding, NO_BACKUP_REQUIRED_SOURCE_FILES } from './pilot-finance-reset-no-backup-core.mjs';
import { assertReopeningHostedBinding } from './pilot-finance-reset-reopening-protocol.mjs';

export const ACTOR_SOURCE_FILES = Object.freeze([...new Set([...TRANSPORT_SOURCE_FILES,
  'scripts/pilot-finance-reset-hosted-actor.mjs',
  'scripts/pilot-finance-reset-no-backup-core.mjs',
  'scripts/pilot-finance-reset-reopening-protocol.mjs',
  'scripts/pilot-finance-reset-encrypted-artifacts.mjs',
  'scripts/pilot-finance-reset-durable-store.mjs',
  'scripts/pilot-finance-reset-retired-journal-core.mjs',
  'scripts/pilot-finance-reset-core.mjs',
  'scripts/pilot-finance-reset-recovery-core.mjs',
  'scripts/local-recovery-docker.mjs',
  'supabase/migrations/20261024013623_financial_reset_genuine_session_actor_bridge.sql',
  'supabase/migrations/20261024015702_financial_reset_checked_reopening.sql',
  'supabase/migrations/20261024023749_financial_reset_explicit_no_backup_binding.sql'])].sort());
const root = path.resolve(import.meta.dirname, '..');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(`hosted_actor_${code}`); };
const sql = 'SELECT app_private.financial_reset_hosted_actor_authorization_status($1::uuid,$2::jsonb,$3::text) AS financial_reset_actor_authorization_observation';
const observationFields = ['authorizationId', 'actorId', 'status', 'bindingMatches', 'backendPid', 'transactionId', 'expiresAt', 'observedAt'];
const connectionFields = ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath'];
const noBackup = packet => packet?.format === 'nestory-protected-reset-no-backup-preparation-v1';
const semanticFields = packet => noBackup(packet) ? ['postgresSemanticText'] : [];
const semanticOptions = (packet, value) => noBackup(packet) ? { postgresSemanticText: value } : {};
const copySemantic = value => value instanceof Uint8Array ? new Uint8Array(value) : value;
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};

function assertPacket(packet, options) {
  if (noBackup(packet)) {
    assertNoBackupPacket(packet);
    if (!Object.hasOwn(options, 'postgresSemanticText') ||
        !(typeof options.postgresSemanticText === 'string' || options.postgresSemanticText instanceof Uint8Array) ||
        !options.postgresSemanticText.length) fail('semantic_bytes_required');
  } else {
    if (Object.hasOwn(options, 'postgresSemanticText')) fail('options_invalid');
    assertOperatorPacket(packet);
  }
}

function assertBinding(packet, binding, action, postgresSemanticText) {
  if ((!HOSTED_ACTIONS.includes(action) && action !== 'reopen') || !binding || typeof binding !== 'object' || Array.isArray(binding) ||
      !uuid.test(binding.continuation_semantic?.actor_id) || canonicalJson(binding).length > 1024 * 1024 ||
      Object.hasOwn(binding.continuation_semantic, 'source_sha256')) fail('binding_invalid');
  if (action === 'reopen') {
    const base = structuredClone(binding); delete base.reopening;
    assertBinding(packet, base, Object.hasOwn(base, 'recovery') ? 'execute-recovery' : 'execute', postgresSemanticText);
    assertReopeningHostedBinding(packet, binding, postgresSemanticText);
    return;
  }
  if (noBackup(packet)) {
    if (!['freeze', 'checkpoint', 'prepare', 'seal', 'execute'].includes(action)) fail('binding_invalid');
    assertNoBackupHostedBinding(packet, binding, postgresSemanticText);
    return;
  }
  const base = structuredClone(binding); delete base.recovery;
  if (!same(base, hostedBinding(packet, binding.continuation_semantic))) fail('binding_invalid');
  const recoveryAction = ['prepare-recovery', 'execute-recovery'].includes(action);
  if (recoveryAction !== Object.hasOwn(binding, 'recovery')) fail('binding_invalid');
  if (recoveryAction) {
    const r = binding.recovery;
    if (!exactKeys(r, ['operation_id', 'source_generation', 'target_generation', 'plan_sha256', 'action_sha256', 'action_count',
      'report_checkpoint_sha256', 'phase_binding_sha256', 'review_artifact_sha256', 'execution_business_date']) ||
      !uuid.test(r.operation_id) || r.operation_id === binding.operation_id || r.source_generation !== binding.target_generation ||
      r.target_generation !== r.source_generation + 1 || !Number.isSafeInteger(r.action_count) || r.action_count < 1 ||
      !['plan_sha256', 'action_sha256', 'report_checkpoint_sha256', 'phase_binding_sha256', 'review_artifact_sha256'].every(k => digest.test(r[k])) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.execution_business_date)) fail('binding_invalid');
  }
}

async function verifySources(packet) {
  const names = noBackup(packet) ? new Set([...ACTOR_SOURCE_FILES, ...NO_BACKUP_REQUIRED_SOURCE_FILES]) : ACTOR_SOURCE_FILES;
  for (const name of names) {
    let bytes;
    try { bytes = await readFile(path.join(root, name)); } catch { fail('source_unavailable'); }
    if (packet.sourceFiles.find(f => f.path === name)?.sha256 !== hashSourceBytes(bytes)) fail('source_changed');
  }
}

export function actorAuthorizationObservationQuery(options) {
  const { packet, binding, authorizationId, action, postgresSemanticText } = options;
  assertPacket(packet, options);
  assertBinding(packet, binding, action, postgresSemanticText);
  if (!uuid.test(authorizationId)) fail('locator_invalid');
  return freeze({ name: 'financial-reset-actor-authorization-observation-v1', projectRef: packet.operation.projectRef,
    packetSha256: packet.packetSha256, transaction: { isolation: 'repeatable read', readOnly: true }, text: sql,
    values: [authorizationId, structuredClone(binding), action] });
}

function observation(rows, authorizationId) {
  if (!Array.isArray(rows) || rows.length !== 1 || !exactKeys(rows[0], ['financial_reset_actor_authorization_observation'])) fail('observation_invalid');
  const o = rows[0].financial_reset_actor_authorization_observation;
  if (!exactKeys(o, observationFields) || o.authorizationId !== authorizationId || typeof o.bindingMatches !== 'boolean' ||
      !['pending', 'consumed', 'expired', 'revoked', 'missing', 'mismatch'].includes(o.status) ||
      o.actorId !== null && !uuid.test(o.actorId) || o.backendPid !== null && (!Number.isSafeInteger(o.backendPid) || o.backendPid < 1) ||
      o.transactionId !== null && (typeof o.transactionId !== 'string' || !/^[1-9]\d*$/.test(o.transactionId)) ||
      o.expiresAt !== null && (typeof o.expiresAt !== 'string' || !Number.isFinite(Date.parse(o.expiresAt))) ||
      typeof o.observedAt !== 'string' || !Number.isFinite(Date.parse(o.observedAt))) fail('observation_invalid');
  return o;
}

// The WeakMap handle is process-local custody, not database authority. The
// private DB consumer must still recheck and atomically consume the locator in
// the same transaction as the intended action; a successful read is no receipt.
export function createHostedResetActor(options) {
  if (!exactKeys(options, ['packet', 'binding', 'observeAuthorization', ...semanticFields(options?.packet)]) || typeof options.observeAuthorization !== 'function') fail('options_invalid');
  const packet = structuredClone(options.packet), binding = structuredClone(options.binding);
  assertPacket(packet, options);
  const postgresSemanticText = copySemantic(options.postgresSemanticText);
  const handles = new WeakMap(), attempted = new Set(), observeAuthorization = options.observeAuthorization;
  const observe = async (authorizationId, action) => {
    const query = actorAuthorizationObservationQuery({ packet, binding, authorizationId, action, ...semanticOptions(packet, postgresSemanticText) });
    await verifySources(packet);
    let rows;
    try { rows = await observeAuthorization(query); } catch { fail('observation_unavailable'); }
    const o = observation(structuredClone(rows), authorizationId), observed = Date.parse(o.observedAt), expires = Date.parse(o.expiresAt);
    if (o.status !== 'pending' || o.bindingMatches !== true || o.actorId !== binding.continuation_semantic.actor_id ||
        o.backendPid !== null || o.transactionId !== null || !(expires > observed) || expires - observed > 300000 ||
        Math.abs(Date.now() - observed) > 30000 || expires <= Date.now()) fail('authorization_unavailable');
    return o;
  };
  return Object.freeze({
    async load(input) {
      if (!exactKeys(input, ['authorizationId', 'action']) || !uuid.test(input.authorizationId)) fail('locator_invalid');
      const { authorizationId, action } = input;
      assertBinding(packet, binding, action, postgresSemanticText);
      if (attempted.has(authorizationId)) fail('locator_already_loaded');
      attempted.add(authorizationId);
      await observe(authorizationId, action);
      const handle = Object.freeze(Object.create(null));
      handles.set(handle, { authorizationId, action });
      return handle;
    },
    async consume(handle, request) {
      const pending = handle && typeof handle === 'object' ? handles.get(handle) : null;
      if (!pending) fail('opaque_handle_required');
      // Burn the handle before validation or async work; concurrent calls, changed
      // packets and uncertain reads must not manufacture another dispatch slot.
      handles.delete(handle);
      if (!exactKeys(request, ['packet', 'action', 'binding']) || !same(request.packet, packet) ||
          request.action !== pending.action || !same(request.binding, binding)) fail('handle_binding_changed');
      await observe(pending.authorizationId, pending.action);
      return freeze({ authorizationId: pending.authorizationId, binding: structuredClone(binding), action: pending.action });
    },
  });
}

function absoluteLocalPath(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\0\r\n]/.test(value) && !/^(?:\\\\|\/\/)/.test(value) &&
    !value.split(/[\\/]/).some(part => part === '.' || part === '..') && (path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}

function validateConnection(packet, c) {
  if (!exactKeys(c, connectionFields) || c.expectedProjectRef !== packet.operation.projectRef ||
      c.host !== `db.${packet.operation.projectRef}.supabase.co` || c.port !== 5432 || c.database !== 'postgres' ||
      typeof c.user !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(c.user) ||
      !['psqlPath', 'sslRootCertPath', 'passwordFilePath'].every(k => absoluteLocalPath(c[k])) ||
      !/^psql(?:\.exe)?$/i.test(c.psqlPath.split(/[\\/]/).at(-1))) fail('connection_invalid');
}

function runPsql(connection, input, spawnProcess) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(connection.psqlPath, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off'], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
          PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable', PGSSLROOTCERT: connection.sslRootCertPath,
          PGPASSFILE: connection.passwordFilePath, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nestory_financial_reset_actor_reader' },
      });
    } catch { reject(new Error('hosted_actor_process_failed')); return; }
    let complete = false, timer, stdoutBytes = 0, stderrBytes = 0;
    const chunks = [];
    const stop = code => {
      if (complete) return;
      complete = true; clearTimeout(timer);
      try { child?.kill('SIGKILL'); } catch { /* Never expose driver errors. */ }
      reject(new Error(`hosted_actor_${code}`));
    };
    if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function' ||
        typeof child.stdin?.end !== 'function' || typeof child.stdin?.on !== 'function' ||
        typeof child.stdout?.on !== 'function' || typeof child.stderr?.on !== 'function') { stop('process_invalid'); return; }
    timer = setTimeout(() => stop('process_timeout'), 20000);
    for (const stream of [child, child.stdin, child.stdout, child.stderr]) stream.once('error', () => stop('process_failed'));
    child.stdout.on('data', chunk => {
      if (complete) return;
      const bytes = Buffer.from(chunk); stdoutBytes += bytes.byteLength;
      if (stdoutBytes > 65536) { stop('output_limit'); return; }
      chunks.push(bytes);
    });
    child.stderr.on('data', chunk => {
      if (complete) return;
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > 8192) stop('output_limit');
    });
    child.once('close', (code, signal) => {
      if (complete) return;
      complete = true; clearTimeout(timer);
      if (code !== 0 || signal || stderrBytes) { reject(new Error('hosted_actor_process_failed')); return; }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    try { child.stdin.end(input, 'utf8'); } catch { stop('process_failed'); }
  });
}

export function createHostedActorAuthorizationReader(options) {
  const fields = ['packet', 'connection', ...semanticFields(options?.packet)];
  if (!exactKeys(options, fields) && !exactKeys(options, [...fields, 'spawnProcess'])) fail('reader_options_invalid');
  if (options.spawnProcess !== undefined && typeof options.spawnProcess !== 'function') fail('reader_options_invalid');
  const packet = structuredClone(options.packet), connection = structuredClone(options.connection);
  assertPacket(packet, options); validateConnection(packet, connection);
  const postgresSemanticText = copySemantic(options.postgresSemanticText);
  const spawnProcess = options.spawnProcess ?? spawn;
  return async query => {
    let expected;
    try {
      if (!Array.isArray(query?.values) || query.values.length !== 3) throw Error();
      expected = actorAuthorizationObservationQuery({ packet, authorizationId: query.values[0], binding: query.values[1], action: query.values[2],
        ...semanticOptions(packet, postgresSemanticText) });
      if (!same(query, expected)) throw Error();
    } catch { fail('query_invalid'); }
    await verifySources(packet);
    // Exact comparison above closes SQL/target/parameter/transaction injection.
    // Quotes are escaped with standard_conforming_strings on; input is stdin,
    // never a shell command, psql variable, environment credential or argv value.
    const literal = value => `'${String(value).replace(/'/g, "''")}'`;
    const [authorizationId, binding, action] = expected.values;
    const statement = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on;
SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='15s';
SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC';
PREPARE nestory_financial_reset_actor_observation(uuid,jsonb,text) AS
${sql};
EXECUTE nestory_financial_reset_actor_observation(${literal(authorizationId)}::uuid,${literal(canonicalJson(binding))}::jsonb,${literal(action)}::text);
COMMIT;
`;
    let parsed;
    try { parsed = JSON.parse((await runPsql(connection, statement, spawnProcess)).trim()); }
    catch (error) {
      if (/^hosted_actor_(process_failed|process_invalid|process_timeout|output_limit)$/.test(error?.message)) throw error;
      fail('output_invalid');
    }
    const rows = [{ financial_reset_actor_authorization_observation: parsed }];
    observation(rows, authorizationId);
    return rows;
  };
}
