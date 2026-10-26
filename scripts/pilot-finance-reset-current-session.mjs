// Fixed, read-only inspection of an explicitly supplied current user credential.
// No credential discovery, refresh, persistence, action issuance or consent claim.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, assertNoBackupHostedBinding, hostedNoBackupBinding, verifyNoBackupSourceContents }
  from './pilot-finance-reset-no-backup-core.mjs';
import { catalogExpression, ledgerExpression, literal, timestampMicros }
  from './pilot-finance-reset-hosted-transport-protocol.mjs';

const root = path.resolve(import.meta.dirname, '..');
const self = 'scripts/pilot-finance-reset-current-session.mjs';
const actorMigration = 'supabase/migrations/20261024013623_financial_reset_genuine_session_actor_bridge.sql';
const fail = code => { throw new Error(`current_session_${code}`); };
const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...fields].sort());
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const concrete = new WeakMap();
const connectionFields = ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath'];
export const CURRENT_SESSION_LIMITS = Object.freeze({ authTimeoutMs: 15000, processTimeoutMs: 60000,
  authBytes: 65536, stdoutBytes: 16 * 1024 * 1024, stderrBytes: 8192, freshnessMs: 30000 });

// These are the exact function-definition pins already checked by the scoped
// session migration. Its super-admin branch gives all three existing reset
// permissions. Check the whole catalog too; do not copy a permission rule into
// a new RPC or manufacture auth.uid() to call the request-bound helpers.
export const CURRENT_SESSION_PERMISSION_PINS = Object.freeze({
  'app_private.has_org_permission(uuid,public.organization_permission_key)': 'b74a848e7b11362210ba48325f41c48ab4aea1b0138c79e5605e6f04178d40be',
  'app_private.is_super_admin(uuid)': '488bb5dc8355c43170d3dc96b779dc705ad097405d0390b6cdfaa500a5218089',
  'app_private.current_workspace_role(uuid)': '64655fe523c72a9fd769b42783b9130c95e4d819c0242447b0e183469261d4ea',
});

function absolute(value) {
  return typeof value === 'string' && value.length <= 4096 && !/[\0\r\n]/.test(value) && !/^(?:\\\\|\/\/)/.test(value) &&
    !value.split(/[\\/]/).some(part => part === '.' || part === '..') && (path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}
function validateConnection(packet, c) {
  if (!exact(c, connectionFields) || c.expectedProjectRef !== packet.operation.projectRef ||
    c.host !== `db.${packet.operation.projectRef}.supabase.co` || c.port !== 5432 || c.database !== 'postgres' ||
    typeof c.user !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(c.user) ||
    !['psqlPath', 'sslRootCertPath', 'passwordFilePath'].every(field => absolute(c[field])) ||
    !/^psql(?:\.exe)?$/i.test(c.psqlPath.split(/[\\/]/).at(-1))) fail('connection_invalid');
}
function decodeClaims(token, origin) {
  // Unsigned decoding can only reject an input. The same complete token must
  // succeed at the fixed Auth server before any session is accepted.
  try {
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const c = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(token.split('.')[1], 'base64url')));
    if (!uuid(c.sub) || !uuid(c.session_id) || c.iss !== `${origin}/auth/v1` || c.role !== 'authenticated' ||
      c.aud !== 'authenticated' || c.is_anonymous !== false || !Number.isSafeInteger(c.exp) ||
      c.exp <= Math.floor(Date.now() / 1000) || c.exp > 253402300799) throw Error();
    return { actorId: c.sub, sessionId: c.session_id, exp: c.exp };
  } catch { fail('credential_invalid'); }
}
function publicKey(key, projectRef) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._-]{16,16384}$/.test(key)) fail('public_key_invalid');
  if (key.startsWith('sb_publishable_')) return;
  try {
    const parts = key.split('.'), claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (parts.length !== 3 || claims.role !== 'anon' || claims.ref !== projectRef) throw Error();
  } catch { fail('public_key_invalid'); }
}

async function sources(packet) {
  const contents = {};
  if (!packet.sourceFiles.some(source => source.path === self)) fail('source_coverage_invalid');
  for (const source of packet.sourceFiles) {
    try { contents[source.path] = await readFile(path.join(root, source.path)); }
    catch { fail('source_unavailable'); }
  }
  try { verifyNoBackupSourceContents(packet, contents); } catch { fail('source_changed'); }
  const text = contents[actorMigration]?.toString('utf8').replace(/\r\n?/g, '\n');
  const anchor = 'CREATE FUNCTION app_private.financial_reset_actor_is_current(';
  if (!text || text.split(anchor).length !== 2) fail('actor_source_changed');
  const match = text.slice(text.indexOf(anchor)).match(/ AS \$\$([\s\S]*?)\$\$;/);
  if (!match) fail('actor_source_changed');
  return hashBytes(match[1]);
}

function authUser(origin, accessToken, publishableKey, request) {
  return new Promise((resolve, reject) => {
    let client, timer, finished = false;
    const end = (code, value) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (code) { try { client?.destroy(); } catch { /* No private details. */ } reject(new Error(`current_session_${code}`)); }
      else resolve(value);
    };
    try {
      client = request(`${origin}/auth/v1/user`, { method: 'GET', agent: false, rejectUnauthorized: true,
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-store' } }, response => {
        if (response.statusCode !== 200 || !/^application\/json(?:;|$)/i.test(response.headers?.['content-type'] ?? '')) {
          response.resume?.(); end('auth_rejected'); return;
        }
        let size = 0; const chunks = [];
        response.on('data', data => {
          if (finished) return; const chunk = Buffer.from(data); size += chunk.length;
          if (size > CURRENT_SESSION_LIMITS.authBytes) { end('auth_response_invalid'); return; }
          chunks.push(chunk);
        });
        response.once('aborted', () => end('auth_unavailable'));
        response.once('error', () => end('auth_unavailable'));
        response.once('end', () => {
          if (finished) return;
          try { end(null, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
          catch { end('auth_response_invalid'); }
        });
      });
      if (!client || typeof client.once !== 'function' || typeof client.end !== 'function' || typeof client.destroy !== 'function') {
        end('auth_unavailable'); return;
      }
      client.once('error', () => end('auth_unavailable'));
      timer = setTimeout(() => end('auth_timeout'), CURRENT_SESSION_LIMITS.authTimeoutMs);
      client.end();
    } catch { end('auth_unavailable'); }
  });
}

function sessionSql(binding, claims) {
  const organization = `${literal(binding.organization_id)}::uuid`, actor = `${literal(claims.actorId)}::uuid`, session = `${literal(claims.sessionId)}::uuid`;
  const pins = Object.keys(CURRENT_SESSION_PERMISSION_PINS).map(signature => `${literal(signature)},encode(extensions.digest(replace(pg_get_functiondef(${literal(signature)}::regprocedure),E'\\r\\n',E'\\n'),'sha256'),'hex')`).join(',');
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='25s'; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC';
SELECT jsonb_build_object('database',current_database(),'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'),
 'authSubject',auth.uid(),'catalog',${catalogExpression},'ledger',${ledgerExpression},'permissionPins',jsonb_build_object(${pins}),
 'actorSourceSha256',(SELECT encode(extensions.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') FROM pg_proc p WHERE p.oid='app_private.financial_reset_actor_is_current(uuid,uuid,uuid)'::regprocedure),
 'organizationId',${organization},'actorId',${actor},'sessionId',${session},'observedAt',clock_timestamp(),
 'actorCurrent',app_private.financial_reset_actor_is_current(${organization},${actor},${session}),
 'sessionNotAfter',(SELECT s.not_after FROM auth.sessions s WHERE s.id=${session} AND s.user_id=${actor}),
 'stepUpExpiresAt',(SELECT g.expires_at FROM app_private.privileged_email_step_up_grants g
   WHERE g.organization_id=${organization} AND g.user_id=${actor} AND g.session_id=${session} AND g.revoked_at IS NULL
    AND coalesce((SELECT enforcement_enabled FROM app_private.privileged_email_step_up_policies WHERE organization_id=${organization}),false))) AS current_session_inspection;
COMMIT;`;
}
function runPsql(connection, input, spawnProcess) {
  return new Promise((resolve, reject) => {
    let child, done = false, timer, stdoutBytes = 0, stderrBytes = 0; const chunks = [];
    const stop = code => {
      if (done) return; done = true; clearTimeout(timer);
      try { child?.kill('SIGKILL'); } catch { /* No private details. */ }
      reject(new Error(`current_session_${code}`));
    };
    try {
      child = spawnProcess(connection.psqlPath, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off'], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
          PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable', PGSSLROOTCERT: connection.sslRootCertPath,
          PGPASSFILE: connection.passwordFilePath, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nestory_current_session_reader' },
      });
    } catch { stop('process_start_failed'); return; }
    if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function' || typeof child.stdin?.end !== 'function' ||
      [child.stdin, child.stdout, child.stderr].some(stream => typeof stream?.on !== 'function' || typeof stream?.once !== 'function')) { stop('process_invalid'); return; }
    timer = setTimeout(() => stop('process_timeout'), CURRENT_SESSION_LIMITS.processTimeoutMs);
    for (const stream of [child, child.stdin, child.stdout, child.stderr]) stream.once('error', () => stop('process_failed'));
    child.stdout.on('data', data => {
      if (done) return; const content = Buffer.from(data); stdoutBytes += content.byteLength;
      if (stdoutBytes > CURRENT_SESSION_LIMITS.stdoutBytes) { stop('output_limit'); return; } chunks.push(content);
    });
    child.stderr.on('data', data => { if (!done) { stderrBytes += Buffer.byteLength(data); if (stderrBytes > CURRENT_SESSION_LIMITS.stderrBytes) stop('output_limit'); } });
    child.once('close', (code, signal) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code !== 0 || signal || stderrBytes) { reject(new Error('current_session_process_failed')); return; }
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { reject(new Error('current_session_output_invalid')); }
    });
    try { child.stdin.end(input, 'utf8'); } catch { stop('process_failed'); }
  });
}

function validateObservation(output, packet, connection, claims, actorSourceSha256) {
  let o;
  try { if (output.trim().split(/\r?\n/).length !== 1) throw Error(); o = JSON.parse(output); }
  catch { fail('output_invalid'); }
  if (!exact(o, ['database', 'sessionUser', 'readOnly', 'authSubject', 'catalog', 'ledger', 'permissionPins', 'actorSourceSha256',
    'organizationId', 'actorId', 'sessionId', 'observedAt', 'actorCurrent', 'sessionNotAfter', 'stepUpExpiresAt']) ||
    o.database !== 'postgres' || o.sessionUser !== connection.user || o.readOnly !== 'on' || o.authSubject !== null) fail('database_identity_invalid');
  if (hashBytes(canonicalJson(o.catalog)) !== packet.schemaSha256 || hashBytes(canonicalJson(o.ledger)) !== packet.ledgerSha256 ||
    !same(o.permissionPins, CURRENT_SESSION_PERMISSION_PINS) || o.actorSourceSha256 !== actorSourceSha256) fail('database_definition_changed');
  if (o.organizationId !== packet.operation.organizationId || o.actorId !== claims.actorId || o.sessionId !== claims.sessionId || o.actorCurrent !== true)
    fail('current_authority_required');
  const now = BigInt(Date.now()) * 1000n, observed = timestampMicros(o.observedAt), credential = BigInt(claims.exp) * 1000000n;
  if (observed === null || observed > now || now - observed > BigInt(CURRENT_SESSION_LIMITS.freshnessMs) * 1000n) fail('observation_stale');
  const expirations = [credential, observed + BigInt(CURRENT_SESSION_LIMITS.freshnessMs) * 1000n];
  for (const field of ['sessionNotAfter', 'stepUpExpiresAt']) {
    if (o[field] !== null) { const expiry = timestampMicros(o[field]); if (expiry === null || expiry <= now) fail('current_authority_required'); expirations.push(expiry); }
  }
  const expires = expirations.reduce((a, b) => a < b ? a : b);
  // Floor to milliseconds; metadata must never extend a microsecond DB expiry.
  if (expires / 1000n * 1000n <= now) fail('current_authority_required');
  return { observedAt: o.observedAt, credentialExpiresAt: new Date(claims.exp * 1000).toISOString(),
    sessionNotAfter: o.sessionNotAfter, stepUpExpiresAt: o.stepUpExpiresAt, expiresAt: new Date(Number(expires / 1000n)).toISOString() };
}

function createReader(options, request, spawnProcess, synthetic) {
  if (!exact(options, ['packet', 'postgresSemanticText', 'connection'])) fail('options_invalid');
  const packet = structuredClone(options.packet), connection = structuredClone(options.connection);
  assertNoBackupPacket(packet); validateConnection(packet, connection);
  let semanticText, binding;
  try {
    if (!(typeof options.postgresSemanticText === 'string' || options.postgresSemanticText instanceof Uint8Array)) throw Error();
    semanticText = Buffer.from(options.postgresSemanticText);
    binding = hostedNoBackupBinding(packet, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(semanticText)), semanticText);
  } catch { fail('semantic_binding_invalid'); }
  const origin = `https://${packet.operation.projectRef}.supabase.co`;
  return Object.freeze({ async inspect(input) {
    if (!exact(input, ['accessToken', 'publishableKey'])) fail('input_invalid');
    // Keep the credential only in this call. It is never retained in the reader,
    // SQL, child arguments/environment, output, hash, journal or error message.
    const { accessToken, publishableKey } = input;
    const claims = decodeClaims(accessToken, origin); publicKey(publishableKey, packet.operation.projectRef);
    if (claims.actorId !== binding.continuation_semantic.actor_id) fail('actor_mismatch');
    const actorSourceSha256 = await sources(packet);
    const user = await authUser(origin, accessToken, publishableKey, request);
    if (!user || user.id !== claims.actorId || user.role !== 'authenticated' || user.is_anonymous !== false) fail('auth_identity_mismatch');
    if (!same(decodeClaims(accessToken, origin), claims)) fail('credential_invalid');
    const query = sessionSql(binding, claims), output = await runPsql(connection, query, spawnProcess);
    const metadata = validateObservation(output, packet, connection, claims, actorSourceSha256);
    await sources(packet); decodeClaims(accessToken, origin);
    if (timestampMicros(metadata.expiresAt) <= BigInt(Date.now()) * 1000n) fail('observation_stale');
    const result = freeze({ format: 'nestory-current-genuine-session-inspection-v1', operationId: packet.operation.operationId,
      organizationId: packet.operation.organizationId, projectRef: packet.operation.projectRef, packetSha256: packet.packetSha256,
      sourcesSha256: packet.sourcesSha256, schemaSha256: packet.schemaSha256, ledgerSha256: packet.ledgerSha256,
      baseBindingSha256: hashBytes(canonicalJson(binding)), querySha256: hashBytes(query), actorId: claims.actorId, sessionId: claims.sessionId,
      ...metadata, transport: synthetic ? 'synthetic-auth-and-process' : 'fixed-auth-and-read-only-psql',
      authorizationIssued: false, protectedRuntimeVerified: false, customerApprovalVerified: false, dispatchSupported: false });
    if (!synthetic) concrete.set(result, { packetSha256: packet.packetSha256, baseBindingSha256: result.baseBindingSha256 });
    return result;
  } });
}

// Production has no endpoint, callback, clock, process or response overrides.
export function createCurrentSessionReader(options) { return createReader(options, httpsRequest, spawn, false); }
// Offline simulations remain unbranded, even if their JSON claims otherwise.
export function createSyntheticCurrentSessionReaderForTests(options, ports) {
  if (!exact(ports, ['request', 'spawnProcess']) || typeof ports.request !== 'function' || typeof ports.spawnProcess !== 'function') fail('test_ports_invalid');
  return createReader(options, ports.request, ports.spawnProcess, true);
}
export function assertConcreteCurrentSession(result, expected) {
  if (!exact(expected, ['packet', 'binding', 'postgresSemanticText'])) fail('expectation_invalid');
  assertNoBackupHostedBinding(expected.packet, expected.binding, expected.postgresSemanticText);
  const provenance = result && typeof result === 'object' ? concrete.get(result) : null;
  if (!provenance || provenance.packetSha256 !== expected.packet.packetSha256 ||
    provenance.baseBindingSha256 !== hashBytes(canonicalJson(expected.binding)) || result.actorId !== expected.binding.continuation_semantic.actor_id)
    fail('concrete_current_session_required');
  const now = BigInt(Date.now()) * 1000n, observed = timestampMicros(result.observedAt), expires = timestampMicros(result.expiresAt);
  if (observed === null || expires === null || observed > now || now - observed > BigInt(CURRENT_SESSION_LIMITS.freshnessMs) * 1000n || expires <= now)
    fail('observation_stale');
  // Only current session evidence. The protected verifier still needs its own
  // reviewed scope/consent/containment/audit evidence. A new genuine reopen RPC
  // and consumed locator must independently match this actor/session/binding.
  return result;
}
