// Fixed protected runtime for the explicitly reviewed no-backup packet. Import
// and construction perform no I/O. Dispatch remains unconditionally held.
// Existing protected files and an existing journal are required; nothing here
// provisions credentials, a runner, storage, permissions, or a recovery copy.
import { execFile, spawn } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertNoBackupPacket, hostedNoBackupBinding, verifyNoBackupSourceContents, NO_BACKUP_EVIDENCE_ROLES }
  from './pilot-finance-reset-no-backup-core.mjs';
import { NO_BACKUP_FORWARD_ACTIONS, noBackupActionSlot, prepareNoBackupAction, reconcileNoBackupAction,
  validateNoBackupDatabaseObservation, assertNoBackupTransportDispatchImplemented } from './pilot-finance-reset-no-backup-transport.mjs';
import { createNoBackupReadOnlyReader, createSyntheticNoBackupReaderForTests, assertConcreteNoBackupReaderResult }
  from './pilot-finance-reset-no-backup-reader.mjs';
import { createHostedResetActor, createHostedActorAuthorizationReader } from './pilot-finance-reset-hosted-actor.mjs';
import { createCurrentSessionReader, assertConcreteCurrentSession } from './pilot-finance-reset-current-session.mjs';
import { createExclusiveDirectoryStore, openExistingDirectoryStoreReadOnly, createJsonJournal, inspectLocalStoreMechanism }
  from './pilot-finance-reset-durable-store.mjs';
import { digestJson, digestDatabaseJson, observationSql, literal, validateArtifacts, timestampMicros } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { validateNoBackupCompletionHistory, assertReopeningDispatchImplemented, assertReopeningHostedBinding,
  assertPreparedReopening, reopeningMutationSql, reconcileReopening } from './pilot-finance-reset-reopening-protocol.mjs';
import * as policy from './pilot-finance-reset-hosted-workflow-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ownSource = 'scripts/pilot-finance-reset-no-backup-runtime.mjs';
const executeFile = promisify(execFile);
const args = ['action', 'operation-id', 'packet-sha256', 'descriptors-sha256', 'authority-sha256', 'authorization-id', 'reconcile-action'];
const environmentNames = ['GITHUB_ACTIONS', 'RUNNER_OS', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_REF',
  'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'];
const contexts = new WeakMap();
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = code => { throw new Error(`no_backup_runtime_${code}`); };
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const copy = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    for (const item of Object.values(value)) freeze(item); Object.freeze(value);
  }
  return value;
};
function json(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('document_invalid'); }
}
function uncertain() {
  const error = new Error('no_backup_runtime_outcome_uncertain_reconcile_original');
  error.requiresReconciliation = true; throw error;
}
const production = () => ({ readFile, lstat, realpath, execFile: executeFile, fetch: globalThis.fetch, spawnProcess: spawn,
  environment: Object.fromEntries(environmentNames.map(name => [name, process.env[name]])),
  configSha256: process.env.PILOT_RESET_CONFIG_SHA256, githubToken: process.env.GH_TOKEN,
  platform: process.platform, nodeMajor: Number(process.versions.node.split('.')[0]),
  uid: typeof process.getuid === 'function' ? process.getuid() : null, now: Date.now,
  openStore: (options, readOnly) => (readOnly ? openExistingDirectoryStoreReadOnly : createExclusiveDirectoryStore)(options) });

async function privatePath(io, filename, kind = 'file', privateLeaf = true) {
  const pieces = filename.split('/').filter(Boolean), ancestors = [];
  try {
    for (const name of ['/', ...pieces.map((_, index) => `/${pieces.slice(0, index + 1).join('/')}`)]) {
      const stat = await io.lstat(name);
      ancestors.push({ path: name, type: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
        uid: stat.uid, mode: stat.mode & 0o7777 });
    }
    policy.assertPrivatePathObservation({ requested: filename, resolved: await io.realpath(filename), ancestors, uid: io.uid, kind, privateLeaf });
  } catch { fail('path_untrusted'); }
}
async function readPrivate(io, filename, maximum = 2 * 1024 * 1024) {
  await privatePath(io, filename);
  try {
    const before = await io.lstat(filename);
    if (before.nlink !== 1 || before.size < 1 || before.size > maximum) fail('file_size_or_identity_invalid');
    const bytes = Buffer.from(await io.readFile(filename));
    await privatePath(io, filename);
    const after = await io.lstat(filename);
    if (after.nlink !== 1 || before.ino !== after.ino || before.dev !== after.dev || before.size !== bytes.length ||
      before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('file_changed');
    return bytes;
  } catch (error) {
    if (/^no_backup_runtime_/.test(error?.message)) throw error;
    fail('private_file_unavailable');
  }
}
async function github(io, resource) {
  // No caller supplies this resource or a URL. Even test transport receives only
  // these same fixed repository read endpoints and validated numeric run IDs.
  if (!/^(?:commits\/main|environments\/production-database(?:\/deployment-branch-policies\?per_page=100)?|branches\?protected=true&per_page=100|actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*\/jobs\?per_page=100)?)$/.test(resource) ||
    typeof io.githubToken !== 'string' || !io.githubToken.length) fail('github_identity_missing');
  const url = `https://api.github.com/repos/${policy.RESET_REPOSITORY}/${resource}`;
  try {
    const response = await io.fetch(url, { method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${io.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15000) });
    if (!response.ok || response.redirected || response.url !== url || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error();
    const reader = response.body?.getReader(); if (!reader) throw Error();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error(); }
      chunks.push(value);
    }
    return json(Buffer.concat(chunks));
  } catch { fail('github_observation_failed'); }
}
function origin(io, historical) {
  if (io.platform !== 'linux' || io.nodeMajor !== 24 || !Number.isSafeInteger(io.uid) || io.uid < 0) fail('provisioned_linux_required');
  const e = io.environment;
  if (!historical && (e.GITHUB_ACTIONS !== 'true' || e.RUNNER_OS !== 'Linux' || e.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    e.GITHUB_REPOSITORY !== policy.RESET_REPOSITORY || e.GITHUB_REF !== 'refs/heads/main' ||
    e.GITHUB_WORKFLOW_REF !== `${policy.RESET_REPOSITORY}/${policy.RESET_WORKFLOW_PATH}@refs/heads/main` ||
    e.GITHUB_WORKFLOW_SHA !== e.GITHUB_SHA || !/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID ?? '') ||
    !/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ATTEMPT ?? ''))) fail('workflow_origin_invalid');
}
async function checkout(io, state) {
  try {
    const head = await io.execFile('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
    const status = await io.execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    if (head.stderr || status.stderr || status.stdout || head.stdout.trim() !== state.packet.operation.mainSha) fail('checkout_changed');
    if (state.historicalReadOnly) return;
    const e = io.environment;
    const [main, run, jobs, environment, branches] = await Promise.all([
      github(io, 'commits/main'), github(io, `actions/runs/${e.GITHUB_RUN_ID}`),
      github(io, `actions/runs/${e.GITHUB_RUN_ID}/attempts/${e.GITHUB_RUN_ATTEMPT}/jobs?per_page=100`),
      github(io, 'environments/production-database'), github(io, 'branches?protected=true&per_page=100'),
    ]);
    if (!Array.isArray(branches) || branches.length >= 100) fail('github_observation_failed');
    const policies = environment.deployment_branch_policy?.custom_branch_policies ?
      await github(io, 'environments/production-database/deployment-branch-policies?per_page=100') : null;
    policy.assertProtectedEnvironment(environment, branches.map(branch => branch.name).sort(), policies);
    policy.assertWorkflowInvocation({ input: state.input, packet: state.packet, configuration: state.configuration, environment: e,
      gitHead: head.stdout.trim(), currentMain: main.sha, run, jobs,
      workflowBytes: await io.readFile(path.join(root, policy.RESET_WORKFLOW_PATH)), now: io.now() });
  } catch (error) {
    if (/^(?:no_backup_runtime|hosted_workflow)_/.test(error?.message)) throw error;
    fail('checkout_observation_failed');
  }
}
async function sources(io, packet) {
  policy.assertHostedSourceCoverage(packet);
  if (!packet.sourceFiles.some(source => source.path === ownSource)) fail('runtime_source_pin_missing');
  const result = {};
  try { for (const source of packet.sourceFiles) result[source.path] = Buffer.from(await io.readFile(path.join(root, source.path))); }
  catch { fail('source_unavailable'); }
  verifyNoBackupSourceContents(packet, result); return result;
}
function runPsql(io, connection, sql) {
  return new Promise((resolve, reject) => {
    let child, done = false, timer, outputSize = 0, diagnosticSize = 0; const chunks = [];
    const stop = () => {
      if (done) return; done = true; clearTimeout(timer);
      try { child?.kill('SIGKILL'); } catch { /* Driver details stay private. */ }
      reject(new Error('no_backup_runtime_database_process_failed'));
    };
    try {
      child = io.spawnProcess(connection.psqlPath, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off'], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
          PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable', PGSSLROOTCERT: connection.sslRootCertPath,
          PGPASSFILE: connection.passwordFilePath, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nestory_no_backup_fixed_runtime' },
      });
      if (!child || typeof child.kill !== 'function' || typeof child.stdin?.end !== 'function' ||
        [child, child.stdin, child.stdout, child.stderr].some(stream => typeof stream?.once !== 'function' || typeof stream?.on !== 'function')) { stop(); return; }
      timer = setTimeout(stop, 180000);
      for (const stream of [child, child.stdin, child.stdout, child.stderr]) stream.once('error', stop);
      child.stdout.on('data', data => { if (done) return; outputSize += Buffer.byteLength(data); if (outputSize > 16 * 1024 * 1024) { stop(); return; } chunks.push(Buffer.from(data)); });
      child.stderr.on('data', data => { diagnosticSize += Buffer.byteLength(data); if (diagnosticSize > 8192) stop(); });
      child.once('close', (code, signal) => {
        if (done) return; done = true; clearTimeout(timer);
        if (code !== 0 || signal || diagnosticSize) { reject(new Error('no_backup_runtime_database_process_failed')); return; }
        try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { reject(new Error('no_backup_runtime_database_output_invalid')); }
      });
      child.stdin.end(sql, 'utf8');
    } catch { stop(); }
  });
}

const issuanceFields = ['format', 'operationId', 'packetSha256', 'bindingSha256', 'preparationSha256', 'requestSha256',
  'actorId', 'sessionId', 'authoritySha256', 'createdAt'];
function issuanceScope(packet, binding, postgresSemanticText, intent) {
  assertReopeningHostedBinding(packet, binding, postgresSemanticText);
  if (!exact(intent, issuanceFields) || intent.format !== 'nestory-no-backup-reopening-authorization-intent-v1' ||
    intent.operationId !== binding.operation_id || intent.packetSha256 !== packet.packetSha256 ||
    intent.bindingSha256 !== digestJson(binding) || intent.actorId !== binding.continuation_semantic.actor_id || !uuid(intent.sessionId) ||
    !digest(intent.preparationSha256) || !digest(intent.authoritySha256) || timestampMicros(intent.createdAt) === null ||
    intent.requestSha256 !== digestJson({ p_binding: binding, p_action: 'reopen' })) fail('authorization_intent_changed');
}
// This pure observation check never provides process, session, consent or
// protected-runtime provenance. The fixed private caller supplies its read.
export function validateNoBackupReopeningAuthorizationObservation(request) {
  if (!exact(request, ['packet', 'binding', 'postgresSemanticText', 'intent', 'observation', 'expectedAuthorizationId', 'now'])) fail('authorization_read_invalid');
  const { packet, binding, postgresSemanticText, intent, observation: o, expectedAuthorizationId, now } = request;
  issuanceScope(packet, binding, postgresSemanticText, intent);
  const a = o?.authorization, observed = timestampMicros(a?.observedAt), expires = timestampMicros(a?.expiresAt),
    issued = timestampMicros(o?.issuedAt), credential = timestampMicros(o?.credentialExpiresAt);
  if (!Number.isSafeInteger(now) || now < 0 || !exact(o, ['count', 'authorization', 'sessionId', 'issuedAt', 'credentialExpiresAt', 'bindingHashValid']) ||
    o.count !== 1 || !exact(a, ['authorizationId', 'actorId', 'status', 'bindingMatches', 'backendPid', 'transactionId', 'expiresAt', 'observedAt']) ||
    !uuid(a.authorizationId) || expectedAuthorizationId !== null && a.authorizationId !== expectedAuthorizationId ||
    a.actorId !== intent.actorId || o.sessionId !== intent.sessionId || a.status !== 'pending' || a.bindingMatches !== true ||
    a.backendPid !== null || a.transactionId !== null || o.bindingHashValid !== true || observed === null || expires === null || issued === null ||
    credential === null || issued < timestampMicros(intent.createdAt) || observed < issued || expires <= BigInt(now) * 1000n ||
    expires > credential || expires <= issued || expires - issued > 300000000n ||
    (observed > BigInt(now) * 1000n ? observed - BigInt(now) * 1000n : BigInt(now) * 1000n - observed) > 30000000n) fail('authorization_not_uniquely_current');
  return freeze({ authorizationId: a.authorizationId, actorId: a.actorId, sessionId: o.sessionId,
    observedAt: a.observedAt, authorizationProvenanceVerified: false });
}
// This history classification never turns an expired, revoked or consumed
// authorization into current authority. It only describes the retained attempt.
export function reconcileNoBackupReopeningAuthorizationObservation(request) {
  if (!exact(request, ['packet', 'binding', 'postgresSemanticText', 'intent', 'observation', 'expectedAuthorizationId', 'now'])) fail('authorization_read_invalid');
  const { packet, binding, postgresSemanticText, intent, observation: o, expectedAuthorizationId, now } = request;
  issuanceScope(packet, binding, postgresSemanticText, intent);
  if (!Number.isSafeInteger(now) || now < 0 || !exact(o, ['count', 'authorization', 'sessionId', 'issuedAt', 'credentialExpiresAt', 'bindingHashValid'])) fail('authorization_read_invalid');
  if (o.count === 0) {
    if (expectedAuthorizationId !== null || Object.entries(o).some(([key, value]) => key !== 'count' && value !== null)) fail('authorization_read_invalid');
    return freeze({ outcome: 'authorization-not-observed', authorizationId: null, authorizationStatus: 'missing',
      currentMutationAuthorityVerified: false, automaticRetryAllowed: false, nextAction: 'operator-review-required' });
  }
  const a = o.authorization, observed = timestampMicros(a?.observedAt), expires = timestampMicros(a?.expiresAt),
    issued = timestampMicros(o.issuedAt), credential = timestampMicros(o.credentialExpiresAt), instant = BigInt(now) * 1000n;
  if (o.count !== 1 || !exact(a, ['authorizationId', 'actorId', 'status', 'bindingMatches', 'backendPid', 'transactionId', 'expiresAt', 'observedAt']) ||
    !uuid(a.authorizationId) || expectedAuthorizationId !== null && a.authorizationId !== expectedAuthorizationId ||
    a.actorId !== intent.actorId || o.sessionId !== intent.sessionId || a.bindingMatches !== true || o.bindingHashValid !== true ||
    !['pending', 'expired', 'revoked', 'consumed'].includes(a.status) || observed === null || expires === null || issued === null || credential === null ||
    issued < timestampMicros(intent.createdAt) || observed < issued || expires > credential || expires <= issued || expires - issued > 300000000n ||
    (observed > instant ? observed - instant : instant - observed) > 30000000n ||
    (a.status === 'consumed' ? !Number.isSafeInteger(a.backendPid) || a.backendPid < 1 || !/^[1-9][0-9]*$/.test(a.transactionId ?? '') : a.backendPid !== null || a.transactionId !== null) ||
    a.status === 'expired' && expires > instant || ['pending', 'revoked'].includes(a.status) && expires <= instant) fail('authorization_read_invalid');
  return freeze({ outcome: 'authorization-observed-mutation-not-reconciled', authorizationId: a.authorizationId,
    authorizationStatus: a.status, actorId: a.actorId, sessionId: o.sessionId, observedAt: a.observedAt,
    currentMutationAuthorityVerified: false, automaticRetryAllowed: false, nextAction: 'operator-review-required' });
}
function issuanceObservationSql(packet, binding, postgresSemanticText, intent) {
  issuanceScope(packet, binding, postgresSemanticText, intent);
  const body = `${literal(canonicalJson(binding))}::jsonb`;
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='25s'; SET LOCAL timezone='UTC';
WITH exact_authorizations AS (SELECT a.* FROM app_private.financial_reset_actor_authorizations a
 WHERE a.organization_id=${literal(binding.organization_id)}::uuid AND a.operation_id=${literal(binding.operation_id)}::uuid
 AND a.action='reopen' AND a.actor_id=${literal(intent.actorId)}::uuid AND a.session_id=${literal(intent.sessionId)}::uuid AND a.binding=${body})
SELECT jsonb_build_object('count',(SELECT count(*) FROM exact_authorizations),
 'authorization',(SELECT app_private.financial_reset_hosted_actor_authorization_status(a.authorization_id,${body},'reopen') FROM exact_authorizations a ORDER BY authorization_id LIMIT 1),
 'sessionId',(SELECT session_id FROM exact_authorizations ORDER BY authorization_id LIMIT 1),
 'issuedAt',(SELECT issued_at FROM exact_authorizations ORDER BY authorization_id LIMIT 1),
 'credentialExpiresAt',(SELECT credential_expires_at FROM exact_authorizations ORDER BY authorization_id LIMIT 1),
 'bindingHashValid',(SELECT binding_sha256=app_private.financial_reset_hash(binding) FROM exact_authorizations ORDER BY authorization_id LIMIT 1));
COMMIT;`;
}
async function issueReopening(io, packet, binding, credentials) {
  // Called only after the unchanged production hold and exclusive issuance
  // intent. There is one POST, no retry, redirect, configurable URL or RPC.
  const url = `https://${packet.operation.projectRef}.supabase.co/rest/v1/rpc/authorize_financial_reset_hosted_action`;
  const response = await io.fetch(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: credentials.publishableKey, Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: canonicalJson({ p_binding: binding, p_action: 'reopen' }) });
  if (!response.ok || response.redirected || response.url !== url || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) uncertain();
  const reader = response.body?.getReader(); if (!reader) uncertain();
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength; if (length > 65536) { await reader.cancel(); uncertain(); } chunks.push(value);
  }
  const result = json(Buffer.concat(chunks)); if (!uuid(result)) uncertain(); return result;
}

function createRuntime(options, getIo, synthetic) {
  if (!exact(options, ['input', 'historicalReadOnly']) || typeof options.historicalReadOnly !== 'boolean' || !exact(options.input, args)) fail('options_invalid');
  const input = policy.parseHostedWorkflowArguments(args.flatMap(key => [`--${key}`, options.input[key]]));
  const historicalReadOnly = options.historicalReadOnly;
  if (historicalReadOnly && input.action !== 'reconcile') fail('historical_read_only');
  if (['prepare-recovery', 'execute-recovery'].includes(input.action) || input['reconcile-action'].endsWith('recovery')) fail('recovery_unsupported');
  let pending; const attempted = new Set(), plannedMutations = [];
  async function load() {
    if (pending) return pending;
    pending = (async () => {
      const io = getIo(); origin(io, historicalReadOnly);
      const pinned = new Map();
      const retain = async (filename, maximum) => {
        const bytes = await readPrivate(io, filename, maximum);
        if (pinned.has(filename) && !pinned.get(filename).equals(bytes)) fail('reviewed_input_changed');
        pinned.set(filename, bytes); return bytes;
      };
      const configurationBytes = await retain(policy.RESET_CONFIGURATION_PATH);
      const configuration = policy.assertHostedConfiguration(json(configurationBytes), io.configSha256, configurationBytes);
      if (!policy.isNoBackupWorkflow(configuration)) fail('explicit_no_backup_configuration_required');
      const operationRoot = `${policy.RESET_PERSISTENT_ROOT}/operations/${input['operation-id']}`;
      await privatePath(io, policy.RESET_PERSISTENT_ROOT, 'directory');
      policy.assertPersistentMount(configuration, await io.readFile('/proc/self/mountinfo', 'utf8'));
      const packet = json(await retain(`${operationRoot}/packet.json`, 16 * 1024 * 1024)); assertNoBackupPacket(packet);
      const sourceContents = await sources(io, packet);
      const descriptorsBytes = await retain(`${operationRoot}/descriptors.json`), descriptors = json(descriptorsBytes), inputBytes = {}, evidenceBytes = {};
      for (const role of policy.NO_BACKUP_RUNTIME_INPUT_ROLES) inputBytes[role] = await retain(`${operationRoot}/inputs/${role}.json`, 64 * 1024 * 1024);
      for (const role of NO_BACKUP_EVIDENCE_ROLES) evidenceBytes[role] = await retain(`${operationRoot}/evidence/${role}.json`, 16 * 1024 * 1024);
      policy.validateNoBackupRuntimeInputs(descriptors, input, packet, configuration, descriptorsBytes, inputBytes, evidenceBytes);
      const artifacts = Object.fromEntries(policy.NO_BACKUP_RUNTIME_INPUT_ROLES.filter(role => role !== 'postgresSemantic').map(role => [role, json(inputBytes[role])]));
      artifacts.zeroPlanText = new TextDecoder('utf-8', { fatal: true }).decode(inputBytes.zeroPlan);
      validateArtifacts(packet, artifacts);
      const postgresSemanticText = new TextDecoder('utf-8', { fatal: true }).decode(inputBytes.postgresSemantic);
      const binding = hostedNoBackupBinding(packet, artifacts.continuationPlan, postgresSemanticText);
      const provisioningBytes = await retain(`${policy.RESET_PERSISTENT_ROOT}/provisioning.json`), provisioning = json(provisioningBytes);
      const authorityBytes = await retain(`${operationRoot}/authority.json`), authority = json(authorityBytes);
      const state = { io, pinned, retain, input, historicalReadOnly, operationRoot, configuration, configurationBytes, packet, artifacts,
        sourceContents, postgresSemanticText, binding, evidenceBytes, provisioning, provisioningBytes, authority, authorityBytes };
      if (historicalReadOnly) {
        state.readAuthorityBytes = await retain(`${operationRoot}/reconciliation-authority.json`); state.readAuthority = json(state.readAuthorityBytes);
      }
      policy.assertRuntimeEvidence({ ...state, now: io.now() });
      for (const role of ['privateAccessReviewSha256', 'crossRunDurabilityProofSha256']) {
        const proof = await retain(`${policy.RESET_PERSISTENT_ROOT}/proofs/${provisioning[role]}.json`);
        if (hashBytes(proof) !== provisioning[role]) fail('provisioning_review_changed');
      }
      for (const name of ['psqlPath', 'sslRootCertPath', 'passwordFilePath']) await privatePath(io, configuration.connection[name], 'file', name !== 'psqlPath');
      if (hashBytes(await io.readFile(configuration.connection.psqlPath)) !== configuration.psqlBinarySha256 ||
        hashBytes(await retain(configuration.connection.sslRootCertPath)) !== configuration.sslRootCertSha256) fail('database_client_changed');
      await checkout(io, state);
      const directory = `${policy.RESET_PERSISTENT_ROOT}/journal`;
      await privatePath(io, directory, 'directory');
      const marker = await retain(`${directory}/store.json`);
      if (marker.toString('utf8') !== canonicalJson({ format: 'nestory-exclusive-store-v1', storeId: configuration.journalStoreId,
        writeProtocol: 'exclusive-file-and-directory-fsync' })) fail('existing_durable_journal_required');
      const readOnly = historicalReadOnly || ['inspect', 'reconcile'].includes(input.action);
      const journalStore = await io.openStore({ directory, storeId: configuration.journalStoreId }, readOnly);
      if (!synthetic && inspectLocalStoreMechanism(journalStore).kind !== 'exclusive-file-and-directory-fsync') fail('durable_journal_required');
      state.journalStore = journalStore; state.journal = createJsonJournal({ store: journalStore });
      const readerOptions = { packet, postgresSemanticText, connection: configuration.connection };
      state.reader = synthetic ? createSyntheticNoBackupReaderForTests(readerOptions, io.spawnProcess) : createNoBackupReadOnlyReader(readerOptions);
      state.observeAuthorization = createHostedActorAuthorizationReader({ ...readerOptions, ...(synthetic ? { spawnProcess: io.spawnProcess } : {}) });
      state.refresh = async () => {
        origin(io, historicalReadOnly);
        for (const [filename, expected] of pinned) if (!(await readPrivate(io, filename, 64 * 1024 * 1024)).equals(expected)) fail('reviewed_input_changed');
        policy.assertHostedConfiguration(json(configurationBytes), io.configSha256, configurationBytes);
        policy.assertPersistentMount(configuration, await io.readFile('/proc/self/mountinfo', 'utf8'));
        state.sourceContents = await sources(io, packet);
        policy.assertRuntimeEvidence({ ...state, now: io.now() });
        await privatePath(io, configuration.connection.passwordFilePath);
        await privatePath(io, configuration.connection.psqlPath, 'file', false);
        if (hashBytes(await io.readFile(configuration.connection.psqlPath)) !== configuration.psqlBinarySha256) fail('database_client_changed');
        await checkout(io, state);
      };
      return state;
    })();
    return pending;
  }
  async function journalRead(state, key) { try { return await state.journal.read(key); } catch { uncertain(); } }
  async function journalSave(state, key, value) {
    const text = canonicalJson(value);
    try { if (await state.journal.putIfAbsent(key, text) !== 'created' || await state.journal.read(key) !== text) uncertain(); }
    catch { uncertain(); }
  }
  async function intentFor(state, action) {
    const text = await journalRead(state, `${noBackupActionSlot(state.packet, action)}/intent`);
    if (text === null) fail('original_intent_missing');
    const intent = json(Buffer.from(text));
    if (intent.authoritySha256 !== state.authority.stageAuthorities[action]) fail('original_stage_authority_changed');
    return intent;
  }
  async function previousFor(state, action) {
    const index = NO_BACKUP_FORWARD_ACTIONS.indexOf(action);
    if (index < 0) fail('forward_action_invalid');
    return index === 0 ? null : intentFor(state, NO_BACKUP_FORWARD_ACTIONS[index - 1]);
  }
  function receiptMatches(receipt, intent, expected = null) {
    if (!receipt || receipt.format !== 'nestory-no-backup-action-reconciliation-v1' || receipt.operationId !== intent.operationId ||
      receipt.packetSha256 !== intent.packetSha256 || receipt.action !== intent.action || receipt.outcome !== 'committed-evidence-matches' ||
      receipt.originalIntentSha256 !== digestJson(intent) || receipt.authoritySha256 !== intent.authoritySha256 || !digest(receipt.observationSha256) ||
      receipt.observationProvenanceVerified !== false || receipt.mutationAllowed !== false || receipt.mutationRetried !== false || receipt.normalWritesReopened !== false) fail('stored_receipt_changed');
    if (expected) {
      const left = copy(receipt), right = copy(expected); delete left.observationSha256; delete right.observationSha256;
      if (!same(left, right)) fail('stored_receipt_changed');
    }
  }
  async function requirePreviousReceipt(state, action, previousIntent, observation) {
    if (!previousIntent) return;
    const text = await journalRead(state, `${noBackupActionSlot(state.packet, previousIntent.action)}/receipt`);
    if (text === null) fail('previous_receipt_completion_required');
    const receipt = json(Buffer.from(text)); receiptMatches(receipt, previousIntent);
    if (['prepare', 'seal'].includes(previousIntent.action) && receipt.actionReceiptSha256 !== observation.actionReceipt?.sha256) fail('stored_receipt_changed');
    if (NO_BACKUP_FORWARD_ACTIONS.indexOf(previousIntent.action) !== NO_BACKUP_FORWARD_ACTIONS.indexOf(action) - 1) fail('previous_receipt_changed');
  }
  async function readForward(state, action, authorizationId, previousIntent) {
    const result = await state.reader.readForward({ binding: state.binding, action, authorizationId, previousIntent });
    if (!synthetic) assertConcreteNoBackupReaderResult(result);
    return result;
  }
  async function reconcile(state, action, intent) {
    const previousIntent = await previousFor(state, action), observed = await readForward(state, action, intent.authorizationId, previousIntent);
    const native = reconcileNoBackupAction({ packet: state.packet, artifacts: state.artifacts, postgresSemanticText: state.postgresSemanticText,
      sourceContents: state.sourceContents, action, intent, observation: observed.observation,
      previous: previousIntent ? { intent: previousIntent, observation: observed.previousObservation } : null });
    await state.refresh();
    return native;
  }
  async function dispatch(syntheticDispatch) {
    if (!syntheticDispatch) assertNoBackupTransportDispatchImplemented();
    if (syntheticDispatch && !synthetic) fail('synthetic_only');
    if (historicalReadOnly || !NO_BACKUP_FORWARD_ACTIONS.includes(input.action)) fail('forward_action_invalid');
    const state = await load(), action = input.action, slot = noBackupActionSlot(state.packet, action);
    if (attempted.has(action) || await journalRead(state, `${slot}/intent`) !== null || await journalRead(state, `${slot}/receipt`) !== null) fail('existing_attempt_reconcile_required');
    await state.refresh();
    const authorityText = await state.retain(`${state.operationRoot}/stages/${action}-authority.json`);
    if (hashBytes(authorityText) !== state.authority.stageAuthorities[action]) fail('stage_authority_changed');
    const bridge = createHostedResetActor({ packet: state.packet, binding: state.binding, postgresSemanticText: state.postgresSemanticText,
      observeAuthorization: state.observeAuthorization });
    const handle = await bridge.load({ authorizationId: input['authorization-id'], action });
    const authorization = await bridge.consume(handle, { packet: state.packet, binding: state.binding, action });
    const previousIntent = await previousFor(state, action), observed = await readForward(state, action, authorization.authorizationId, previousIntent);
    await requirePreviousReceipt(state, action, previousIntent, observed.previousObservation);
    const request = { packet: state.packet, artifacts: state.artifacts, postgresSemanticText: state.postgresSemanticText,
      sourceContents: state.sourceContents, action, authorizationId: authorization.authorizationId, observation: observed.observation,
      previous: previousIntent ? { intent: previousIntent, observation: observed.previousObservation } : null,
      authorityText, evidenceBytes: state.evidenceBytes, now: state.io.now(), existingIntent: null };
    const prepared = prepareNoBackupAction(request);
    await state.refresh();
    // Re-run time-sensitive consent/actor/predecessor checks immediately before
    // the one exclusive intent. A failed or partial claim is never retried.
    const current = prepareNoBackupAction({ ...request, sourceContents: state.sourceContents, now: state.io.now() });
    if (!same(current.intent, prepared.intent)) fail('prepared_action_changed');
    attempted.add(action); await journalSave(state, `${slot}/intent`, prepared.intent);
    await state.refresh();
    prepareNoBackupAction({ ...request, sourceContents: state.sourceContents, now: state.io.now() });
    if (synthetic) {
      // Never send mutation SQL to a test callback, child, network, or external
      // store. Static read-only replies may describe a simulated committed DB.
      plannedMutations.push({ action, sqlSha256: hashBytes(prepared.sql), dispatched: false });
    } else {
      try { await runPsql(state.io, state.configuration.connection, prepared.sql); }
      catch { /* A lost response is reconciled from the original durable intent. */ }
    }
    let result; try { result = await reconcile(state, action, prepared.intent); } catch { uncertain(); }
    if (result.outcome !== 'committed-evidence-matches') uncertain();
    await journalSave(state, `${slot}/receipt`, result);
    return freeze({ format: 'nestory-no-backup-runtime-result-v1', synthetic, protectedRuntimeVerified: !synthetic,
      liveDispatchHeld: true, plannedMutations: copy(plannedMutations), reconciliation: result });
  }
  const runtime = {
    async inspect() {
      if (arguments.length || input.action !== 'inspect' || historicalReadOnly) fail('inspect_request_invalid');
      const state = await load(); await state.refresh();
      const anchor = "SELECT jsonb_build_object('catalog',", original = observationSql(state.packet, state.binding, null, null);
      if (original.split(anchor).length !== 2) fail('fixed_inspection_changed');
      const sql = original.replace(anchor, `SELECT jsonb_build_object('reservationHashValid',(SELECT r.binding_sha256=app_private.financial_reset_hash(r.binding) FROM app_private.financial_reset_hosted_reservations r WHERE r.operation_id=${literal(state.binding.operation_id)}::uuid),'catalog',`);
      let observation; try { observation = json(Buffer.from((await runPsql(state.io, state.configuration.connection, sql)).trim())); } catch { fail('inspection_failed'); }
      validateNoBackupDatabaseObservation({ packet: state.packet, sourceContents: state.sourceContents, observation });
      await state.refresh();
      return freeze({ status: 'observed-read-only', operationId: state.packet.operation.operationId,
        observationSha256: digestDatabaseJson(observation), synthetic, protectedRuntimeVerified: !synthetic, liveDispatchHeld: true });
    },
    async dispatch() { if (arguments.length) fail('dispatch_request_invalid'); return dispatch(false); },
    async reconcile() {
      if (arguments.length || input.action !== 'reconcile') fail('reconcile_request_invalid');
      const state = await load(); await state.refresh();
      if (input['reconcile-action'] === 'reopen') return reconcileOpening(state);
      if (!NO_BACKUP_FORWARD_ACTIONS.includes(input['reconcile-action'])) fail('reconcile_request_invalid');
      const action = input['reconcile-action'], intent = await intentFor(state, action), result = await reconcile(state, action, intent);
      const saved = await journalRead(state, `${noBackupActionSlot(state.packet, action)}/receipt`);
      if (saved !== null && result.outcome === 'committed-evidence-matches') receiptMatches(json(Buffer.from(saved)), intent, result);
      // Reconciliation never repairs/writes an absent receipt or dispatches SQL.
      return freeze({ format: 'nestory-no-backup-runtime-result-v1', synthetic, protectedRuntimeVerified: !synthetic,
        currentMutationAuthorityVerified: false, liveDispatchHeld: true, reconciliation: result });
    },
    async finalizeReceipt() { if (arguments.length) fail('receipt_completion_request_invalid'); return finalizeReceipt(false); },
    async dispatchReopening(prepared) {
      assertReopeningDispatchImplemented();
      if (arguments.length !== 1 || input.action !== 'reopen' || historicalReadOnly || synthetic) fail('reopening_request_invalid');
      const state = await load(); await state.refresh();
      assertPreparedReopening(prepared, { packet: state.packet, binding: state.binding,
        postgresSemanticText: state.postgresSemanticText, journalStore: state.journalStore });
      assertReopeningHostedBinding(state.packet, prepared?.binding, state.postgresSemanticText);
      const slot = `financial-reset/${state.binding.operation_id}/reopening/${state.binding.operation_id}`;
      if (prepared.slot !== slot || !state.reopeningAuthorityInput) fail('verified_reopening_preparation_required');
      for (const suffix of ['preparation', 'authorization-intent', 'authorization-receipt', 'intent', 'receipt']) {
        if (await journalRead(state, `${slot}/${suffix}`) !== null) fail('existing_attempt_reconcile_required');
      }
      const authority = await verifyReopeningAuthority(state, state.reopeningAuthorityInput, false);
      const evidence = json(Buffer.from(prepared.evidenceText));
      const comparable = value => { const result = copy(value); delete result.observedAt; return result; };
      if (!same(comparable(evidence.authority_receipt), comparable(authority))) fail('reopening_authority_changed');
      const retained = { format: 'nestory-no-backup-retained-reopening-preparation-v1', operationId: state.binding.operation_id,
        packetSha256: state.packet.packetSha256, binding: prepared.binding, evidenceText: prepared.evidenceText,
        slot, observationSha256: prepared.observationSha256 };
      await journalSave(state, `${slot}/preparation`, retained);
      let authorizationId, issueIntent;
      await withCurrentSession(state, async (credentials, session) => {
        if (session.actorId !== authority.actorId || session.sessionId !== authority.sessionId) fail('reopening_session_changed');
        issueIntent = { format: 'nestory-no-backup-reopening-authorization-intent-v1', operationId: state.binding.operation_id,
          packetSha256: state.packet.packetSha256, bindingSha256: digestJson(prepared.binding), preparationSha256: digestJson(retained),
          requestSha256: digestJson({ p_binding: prepared.binding, p_action: 'reopen' }), actorId: session.actorId, sessionId: session.sessionId,
          authoritySha256: state.configuration.operations[0].reopening.authoritySha256, createdAt: session.observedAt };
        const query = issuanceObservationSql(state.packet, prepared.binding, state.postgresSemanticText, issueIntent);
        const prior = json(Buffer.from((await runPsql(state.io, state.configuration.connection, query)).trim()));
        if (prior.count !== 0 || prior.authorization !== null) fail('existing_authorization_reconcile_required');
        await state.refresh(); await journalSave(state, `${slot}/authorization-intent`, issueIntent);
        let reply = null;
        try { reply = await issueReopening(state.io, state.packet, prepared.binding, credentials); }
        catch { /* Exactly one issuance attempt; reconcile the original scope. */ }
        const observed = json(Buffer.from((await runPsql(state.io, state.configuration.connection, query)).trim()));
        const reconciled = validateNoBackupReopeningAuthorizationObservation({ packet: state.packet, binding: prepared.binding,
          postgresSemanticText: state.postgresSemanticText, intent: issueIntent, observation: observed, expectedAuthorizationId: reply, now: state.io.now() });
        authorizationId = reconciled.authorizationId;
        await journalSave(state, `${slot}/authorization-receipt`, { format: 'nestory-no-backup-reopening-authorization-receipt-v1',
          operationId: state.binding.operation_id, packetSha256: state.packet.packetSha256, intentSha256: digestJson(issueIntent),
          bindingSha256: digestJson(prepared.binding), authorizationId, actorId: reconciled.actorId, sessionId: reconciled.sessionId, observedAt: reconciled.observedAt });
      });
      const bridge = createHostedResetActor({ packet: state.packet, binding: prepared.binding, postgresSemanticText: state.postgresSemanticText,
        observeAuthorization: state.observeAuthorization });
      const handle = await bridge.load({ authorizationId, action: 'reopen' });
      await bridge.consume(handle, { packet: state.packet, binding: prepared.binding, action: 'reopen' });
      const sql = await reopeningMutationSql(prepared, authorizationId), intent = { format: 'nestory-reset-reopening-intent-v1',
        operationId: state.binding.operation_id, packetSha256: state.packet.packetSha256, bindingSha256: digestJson(prepared.binding),
        evidenceSha256: prepared.binding.reopening.evidence_sha256, authorizationId, sqlSha256: hashBytes(sql) };
      await journalSave(state, `${slot}/intent`, intent);
      await verifyReopeningAuthority(state, state.reopeningAuthorityInput, false);
      try { await runPsql(state.io, state.configuration.connection, sql); } catch { /* Never replay; read immutable receipt. */ }
      const result = await reconcileOpening(state);
      if (result.outcome !== 'committed-and-verified') uncertain();
      await journalSave(state, `${slot}/receipt`, result); return result;
    },
    async getReopeningContext() {
      if (arguments.length || !['reopen', 'reconcile'].includes(input.action) ||
        input.action === 'reconcile' && input['reconcile-action'] !== 'reopen') fail('reopening_request_invalid');
      const state = await load(); await state.refresh();
      // The coordinator uses this branded fixed context; caller-created JSON
      // and test ports cannot acquire a protected runtime identity.
      if (synthetic) fail('synthetic_reopening_context_forbidden');
      const historical = input.action === 'reconcile';
      let auditResult = null;
      if (!historical) {
        const intent = await intentFor(state, 'execute');
        auditResult = await state.reader.readReopeningAudit({ binding: state.binding, authorizationId: intent.authorizationId });
        assertConcreteNoBackupReaderResult(auditResult);
        const history = [];
        for (const action of NO_BACKUP_FORWARD_ACTIONS) history.push({ action,
          intentText: await journalRead(state, `${noBackupActionSlot(state.packet, action)}/intent`),
          reconciliationText: await journalRead(state, `${noBackupActionSlot(state.packet, action)}/receipt`) });
        const completion = validateNoBackupCompletionHistory({ packet: state.packet, binding: state.binding,
          postgresSemanticText: state.postgresSemanticText, observation: auditResult.observation, audit: auditResult.audit, history });
        const reviewText = await journalRead(state, `financial-reset/${state.binding.operation_id}/reopening/${state.binding.operation_id}/review`);
        if (reviewText === null) fail('reopening_review_missing');
        await verifyReopeningAuthority(state, freeze({ packet: copy(state.packet), binding: copy(state.binding), proof: copy(auditResult.proof),
          review: json(Buffer.from(reviewText)), databaseAudit: copy(auditResult.audit), journalMechanism: inspectLocalStoreMechanism(state.journalStore),
          completionIntent: completion.completionIntent, completionReconciliation: completion.completionReconciliation,
          completionHistory: completion.history, completionHistoryProvenanceVerified: false }), false);
      }
      const context = Object.freeze({ packet: freeze(copy(state.packet)), binding: freeze(copy(state.binding)),
        postgresSemanticText: state.postgresSemanticText, journalStore: state.journalStore, reader: state.reader, auditResult,
        historicalReadOnly: historical, verifyReopeningAuthority: request => verifyReopeningAuthority(state, request, historical) });
      contexts.set(context, { operationId: state.packet.operation.operationId, packetSha256: state.packet.packetSha256, historicalReadOnly: historical });
      return context;
    },
  };
  async function withCurrentSession(state, consumeSession) {
    const content = await readPrivate(state.io, policy.RESET_CURRENT_SESSION_PATH, 32768);
    let credentials;
    try {
      credentials = json(content); if (!exact(credentials, ['accessToken', 'publishableKey'])) fail('session_input_invalid');
      const current = await createCurrentSessionReader({ packet: state.packet, postgresSemanticText: state.postgresSemanticText,
        connection: state.configuration.connection }).inspect(credentials);
      assertConcreteCurrentSession(current, { packet: state.packet, binding: state.binding, postgresSemanticText: state.postgresSemanticText });
      return await consumeSession(credentials, current);
    } finally { content.fill(0); if (credentials) { credentials.accessToken = ''; credentials.publishableKey = ''; } }
  }
  async function reconcileOpening(state) {
    const slot = `financial-reset/${state.binding.operation_id}/reopening/${state.binding.operation_id}`;
    const preparationText = await journalRead(state, `${slot}/preparation`), intentText = await journalRead(state, `${slot}/intent`);
    if (preparationText === null) fail('original_reopening_intent_missing');
    const prepared = json(Buffer.from(preparationText));
    if (!exact(prepared, ['format', 'operationId', 'packetSha256', 'binding', 'evidenceText', 'slot', 'observationSha256']) ||
      prepared.format !== 'nestory-no-backup-retained-reopening-preparation-v1' || prepared.operationId !== state.binding.operation_id ||
      prepared.packetSha256 !== state.packet.packetSha256 || prepared.slot !== slot || !digest(prepared.observationSha256) ||
      hashBytes(prepared.evidenceText) !== prepared.binding?.reopening?.evidence_sha256) fail('retained_reopening_preparation_changed');
    assertReopeningHostedBinding(state.packet, prepared.binding, state.postgresSemanticText);
    if (intentText === null) {
      const issuanceText = await journalRead(state, `${slot}/authorization-intent`);
      if (issuanceText === null) {
        await state.refresh();
        return freeze({ outcome: 'reopening-preparation-retained-no-authorization-intent', currentMutationAuthorityVerified: false,
          automaticRetryAllowed: false, normalWritesReopened: false, nextAction: 'operator-review-required' });
      }
      const intent = json(Buffer.from(issuanceText));
      if (intent.preparationSha256 !== digestJson(prepared) || intent.authoritySha256 !== state.configuration.operations[0].reopening?.authoritySha256)
        fail('authorization_intent_changed');
      const saved = await journalRead(state, `${slot}/authorization-receipt`);
      let expectedAuthorizationId = null;
      if (saved !== null) {
        const receipt = json(Buffer.from(saved));
        if (!exact(receipt, ['format', 'operationId', 'packetSha256', 'intentSha256', 'bindingSha256', 'authorizationId', 'actorId', 'sessionId', 'observedAt']) ||
          receipt.format !== 'nestory-no-backup-reopening-authorization-receipt-v1' || receipt.operationId !== state.binding.operation_id ||
          receipt.packetSha256 !== state.packet.packetSha256 || receipt.intentSha256 !== digestJson(intent) || receipt.bindingSha256 !== digestJson(prepared.binding) ||
          !uuid(receipt.authorizationId) || receipt.actorId !== intent.actorId || receipt.sessionId !== intent.sessionId || timestampMicros(receipt.observedAt) === null)
          fail('authorization_receipt_changed');
        expectedAuthorizationId = receipt.authorizationId;
      }
      const sql = issuanceObservationSql(state.packet, prepared.binding, state.postgresSemanticText, intent);
      const observation = json(Buffer.from((await runPsql(state.io, state.configuration.connection, sql)).trim()));
      const result = reconcileNoBackupReopeningAuthorizationObservation({ packet: state.packet, binding: prepared.binding,
        postgresSemanticText: state.postgresSemanticText, intent, observation, expectedAuthorizationId, now: state.io.now() });
      await state.refresh();
      return freeze({ ...result, normalWritesReopened: false, databaseMutationVerified: false });
    }
    const intent = json(Buffer.from(intentText));
    const result = await state.reader.readReopeningReceipt({ binding: prepared.binding, authorizationId: intent.authorizationId });
    if (!synthetic) assertConcreteNoBackupReaderResult(result);
    const receipt = reconcileReopening({ packet: state.packet, binding: prepared.binding, postgresSemanticText: state.postgresSemanticText,
      authorizationId: intent.authorizationId, intent, observation: result.receiptObservation });
    const saved = await journalRead(state, `${slot}/receipt`);
    if (saved !== null && receipt.outcome === 'committed-and-verified') {
      const left = json(Buffer.from(saved)), right = copy(receipt);
      delete left.observationSha256; delete left.currentlyOpen; delete right.observationSha256; delete right.currentlyOpen;
      if (!same(left, right)) fail('stored_receipt_changed');
    }
    await state.refresh(); return receipt;
  }
  async function finalizeReceipt(simulated) {
    if (!simulated) assertNoBackupTransportDispatchImplemented();
    if (simulated && !synthetic || historicalReadOnly || input.action !== 'complete-receipt') fail('receipt_completion_request_invalid');
    const state = await load(); await state.refresh(); const action = input['reconcile-action'];
    let result, slot;
    if (action === 'reopen') { result = await reconcileOpening(state); slot = `financial-reset/${state.binding.operation_id}/reopening/${state.binding.operation_id}`; }
    else {
      if (!NO_BACKUP_FORWARD_ACTIONS.includes(action)) fail('receipt_completion_request_invalid');
      slot = noBackupActionSlot(state.packet, action); const intent = await intentFor(state, action);
      result = await reconcile(state, action, intent);
    }
    if (await journalRead(state, `${slot}/receipt`) !== null) fail('receipt_already_present');
    if (!['committed-evidence-matches', 'committed-and-verified'].includes(result.outcome)) uncertain();
    await state.refresh(); await journalSave(state, `${slot}/receipt`, result);
    return freeze({ status: 'missing-receipt-completed', action, synthetic, databaseMutationDispatched: false,
      automaticRetryAllowed: false, liveDispatchHeld: true, reconciliation: result });
  }
  async function verifyReopeningAuthority(state, request, historical) {
    if (historical || historicalReadOnly) fail('historical_read_only');
    if (!exact(request, ['packet', 'binding', 'proof', 'review', 'databaseAudit', 'journalMechanism', 'completionIntent',
      'completionReconciliation', 'completionHistory', 'completionHistoryProvenanceVerified']) || !same(request.packet, state.packet) ||
      !same(request.binding, state.binding) || request.completionHistoryProvenanceVerified !== false) fail('reopening_scope_changed');
    await state.refresh();
    const enrollment = state.configuration.operations[0].reopening;
    if (!enrollment || typeof policy.validateNoBackupReopeningRuntimeEvidence !== 'function') fail('current_reopening_enrollment_required');
    const authorityBytes = await readPrivate(state.io, `${state.operationRoot}/reopening/authority.json`);
    const accessReviewBytes = await readPrivate(state.io, `${policy.RESET_PERSISTENT_ROOT}/proofs/${enrollment.sessionAccessReviewSha256}.json`);
    const history = [];
    for (const action of NO_BACKUP_FORWARD_ACTIONS) history.push({ action,
      intentText: await journalRead(state, `${noBackupActionSlot(state.packet, action)}/intent`),
      reconciliationText: await journalRead(state, `${noBackupActionSlot(state.packet, action)}/receipt`) });
    const result = await state.reader.readReopeningAudit({ binding: state.binding, authorizationId: request.completionIntent.authorizationId });
    assertConcreteNoBackupReaderResult(result);
    const completion = validateNoBackupCompletionHistory({ packet: state.packet, binding: state.binding,
      postgresSemanticText: state.postgresSemanticText, observation: result.observation, audit: result.audit, history });
    if (!same(result.proof, request.proof) || !same(result.audit, request.databaseAudit) ||
      !same(completion.history, request.completionHistory) || !same(completion.completionIntent, request.completionIntent) ||
      !same(completion.completionReconciliation, request.completionReconciliation) ||
      !same(inspectLocalStoreMechanism(state.journalStore), request.journalMechanism)) fail('reopening_history_changed');
    const reviewText = await journalRead(state, `financial-reset/${state.binding.operation_id}/reopening/${state.binding.operation_id}/review`);
    const session = await withCurrentSession(state, async (_credentials, current) => current);
    await state.refresh();
    const receipt = policy.validateNoBackupReopeningRuntimeEvidence({ evidence: state, authorityInput: request,
      reopeningAuthority: json(authorityBytes), reopeningAuthorityBytes: authorityBytes, reviewText,
      sessionAccessReviewBytes: accessReviewBytes, postgresSemanticText: state.postgresSemanticText,
      databaseRead: result, currentSession: session, now: state.io.now() });
    state.reopeningAuthorityInput = freeze(copy(request)); return receipt;
  }
  if (synthetic) {
    runtime.simulateDispatchForTests = () => dispatch(true);
    runtime.simulateFinalizeReceiptForTests = () => finalizeReceipt(true);
    runtime.syntheticJournalForTests = async () => copy((await load()).io.journalEntries);
  }
  return Object.freeze(runtime);
}

export function createNoBackupProtectedRuntime(options) { return createRuntime(options, production, false); }
export function assertNoBackupReopeningContext(context) {
  const provenance = context && typeof context === 'object' ? contexts.get(context) : null;
  if (!provenance) fail('concrete_reopening_context_required');
  return freeze({ ...provenance, liveDispatchHeld: true });
}
// Explicit offline ports never acquire concrete runtime/context provenance.
// Production construction has no I/O, endpoint, clock, credential or SQL ports.
export function createSyntheticNoBackupRuntimeForTests(options, ports) {
  if (!exact(ports, ['readFile', 'lstat', 'realpath', 'execFile', 'fetch', 'spawnProcess', 'environment', 'configSha256', 'githubToken',
    'platform', 'nodeMajor', 'uid', 'now', 'journalEntries']) || !ports.journalEntries ||
    Object.getPrototypeOf(ports.journalEntries) !== Object.prototype || Object.values(ports.journalEntries).some(value => typeof value !== 'string') ||
    ['readFile', 'lstat', 'realpath', 'execFile', 'fetch', 'spawnProcess', 'now'].some(key => typeof ports[key] !== 'function')) fail('synthetic_ports_invalid');
  const journalEntries = copy(ports.journalEntries), memory = Object.freeze({
    async read(key) { return Object.hasOwn(journalEntries, key) ? Buffer.from(journalEntries[key]) : null; },
    async putIfAbsent(key, bytes) {
      if (Object.hasOwn(journalEntries, key)) return 'exists'; journalEntries[key] = Buffer.from(bytes).toString('utf8'); return 'created';
    },
  });
  const io = { ...ports, journalEntries, openStore: async (_options, readOnly) => readOnly ? Object.freeze({ read: memory.read,
    async putIfAbsent() { fail('historical_read_only'); } }) : memory };
  return createRuntime(options, () => io, true);
}
