// One-off protected execution on an independently provisioned POSIX runner.
// This file provisions nothing, accepts no token/SQL/module/URL inputs, and has
// no fallback when the genuine-session bridge or persistent provider is absent.
import { execFile } from 'node:child_process';
import { createSecretKey } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertOperatorPacket, canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { createExclusiveDirectoryStore, openExistingDirectoryStoreReadOnly, createJsonJournal } from './pilot-finance-reset-durable-store.mjs';
import { createEncryptedArtifactProvider, createBoundArtifactReader } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { createSupplementalRecoveryReader } from './pilot-finance-reset-recovery-artifact-reader.mjs';
import { createHostedResetActor, createHostedActorAuthorizationReader } from './pilot-finance-reset-hosted-actor.mjs';
import { createHostedResetTransport, assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';
import { createNoBackupReopeningPreparation } from './pilot-finance-reset-reopening-protocol.mjs';
import { RESET_REPOSITORY, RESET_CONFIGURATION_PATH, RESET_PERSISTENT_ROOT, RESET_WORKFLOW_PATH,
  parseHostedWorkflowArguments, assertHostedConfiguration, assertPrivatePathObservation, assertPersistentMount,
  assertWorkflowInvocation, assertRuntimeEvidence, validateHostedDescriptors, assertProtectedEnvironment,
  assertHostedSourceCoverage, requiresSupplementalRecovery, assertSupplementalRecoveryEvidence, isNoBackupWorkflow } from './pilot-finance-reset-hosted-workflow-core.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const executeFile = promisify(execFile);
const fail = code => { throw new Error(code); };

async function checkedPath(filename, kind = 'file', privateLeaf = true) {
  const pieces = filename.split('/').filter(Boolean);
  const names = ['/', ...pieces.map((_, index) => `/${pieces.slice(0, index + 1).join('/')}`)];
  const ancestors = [];
  try {
    for (const name of names) {
      const stat = await lstat(name);
      ancestors.push({ path: name, type: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
        uid: stat.uid, mode: stat.mode & 0o7777 });
    }
    assertPrivatePathObservation({ requested: filename, resolved: await realpath(filename), ancestors, uid: process.getuid(), kind, privateLeaf });
  } catch { fail('hosted_workflow_path_untrusted'); }
}

async function readPrivate(filename, maxBytes = 2 * 1024 * 1024) {
  await checkedPath(filename);
  const stat = await lstat(filename);
  if (stat.size < 1 || stat.size > maxBytes) fail('hosted_workflow_file_size_invalid');
  const bytes = await readFile(filename);
  await checkedPath(filename);
  const after = await lstat(filename);
  if (stat.ino !== after.ino || stat.dev !== after.dev || bytes.length !== stat.size || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) fail('hosted_workflow_file_changed');
  return bytes;
}

function json(bytes) {
  try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); }
  catch { fail('hosted_workflow_document_invalid'); }
}

async function github(resource, token) {
  // resource is constructed only from constants and validated numeric run IDs.
  const url = `https://api.github.com/repos/${RESET_REPOSITORY}/${resource}`;
  let response;
  try { response = await fetch(url, { method: 'GET', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000) }); }
  catch { fail('hosted_workflow_github_unavailable'); }
  if (!response.ok || response.redirected || response.url !== url || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) fail('hosted_workflow_github_unavailable');
  const reader = response.body?.getReader();
  if (!reader) fail('hosted_workflow_github_unavailable');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) { await reader.cancel(); fail('hosted_workflow_github_response_limit'); }
      chunks.push(value);
    }
    return json(Buffer.concat(chunks));
  } catch { fail('hosted_workflow_github_unavailable'); }
}

async function observeWorkflow(environment, token, packet, configuration, input) {
  if (!/^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ATTEMPT ?? '')) fail('hosted_workflow_run_invalid');
  const [head, main, run, jobs, protectedEnvironment, branches] = await Promise.all([
    executeFile('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 }),
    github('commits/main', token), github(`actions/runs/${environment.GITHUB_RUN_ID}`, token),
    github(`actions/runs/${environment.GITHUB_RUN_ID}/attempts/${environment.GITHUB_RUN_ATTEMPT}/jobs?per_page=100`, token),
    github('environments/production-database', token), github('branches?protected=true&per_page=100', token),
  ]);
  if (!Array.isArray(branches) || branches.length >= 100 || head.stderr) fail('hosted_workflow_repository_observation_invalid');
  const policies = protectedEnvironment.deployment_branch_policy?.custom_branch_policies ?
    await github('environments/production-database/deployment-branch-policies?per_page=100', token) : null;
  assertProtectedEnvironment(protectedEnvironment, branches.map(branch => branch.name).sort(), policies);
  return assertWorkflowInvocation({ input, packet, configuration, environment, gitHead: head.stdout.trim(), currentMain: main.sha,
    run, jobs, workflowBytes: await readFile(path.join(repositoryRoot, RESET_WORKFLOW_PATH)), now: Date.now() });
}

async function verifySourceFiles(packet) {
  assertHostedSourceCoverage(packet);
  for (const source of packet.sourceFiles) {
    let bytes;
    try { bytes = await readFile(path.join(repositoryRoot, source.path)); }
    catch { fail('hosted_workflow_source_unavailable'); }
    if (hashSourceBytes(bytes) !== source.sha256) fail('hosted_workflow_source_changed');
  }
}

async function assertHistoricalCheckout(packet) {
  const head = await executeFile('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
  const status = await executeFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  if (head.stderr || head.stdout.trim() !== packet.operation.mainSha || status.stderr || status.stdout) fail('hosted_workflow_retained_checkout_changed');
}

async function runNoBackupWorkflow(input, historicalReadOnly) {
  const { createNoBackupProtectedRuntime, assertNoBackupReopeningContext } = await import('./pilot-finance-reset-no-backup-runtime.mjs');
  const runtime = createNoBackupProtectedRuntime({ input, historicalReadOnly });
  if (input.action === 'inspect') return runtime.inspect();
  if (input.action === 'reconcile') return runtime.reconcile();
  if (input.action === 'complete-receipt') return runtime.finalizeReceipt();
  if (input.action === 'reopen') {
    const context = await runtime.getReopeningContext();
    const provenance = assertNoBackupReopeningContext(context);
    if (provenance.historicalReadOnly || context.historicalReadOnly || !context.auditResult) fail('hosted_workflow_historical_read_only');
    const preparation = createNoBackupReopeningPreparation({ packet: context.packet, postgresSemanticText: context.postgresSemanticText,
      journalStore: context.journalStore, verifyReopeningAuthority: context.verifyReopeningAuthority });
    const prepared = await preparation.prepare({ binding: context.binding, observation: context.auditResult.observation, audit: context.auditResult.audit });
    return runtime.dispatchReopening(prepared);
  }
  return runtime.dispatch();
}

async function runFixedWorkflow(args, historicalReadOnly) {
  const input = parseHostedWorkflowArguments(args);
  if (historicalReadOnly && input.action !== 'reconcile') fail('hosted_workflow_historical_read_only');
  // An incomplete pipeline must not freeze an organization it cannot finish.
  // No packet/configuration flag can override this implementation gate.
  if (!['inspect', 'reconcile'].includes(input.action)) assertHostedTransportDispatchImplemented();
  if (process.platform !== 'linux' || typeof process.getuid !== 'function' || Number(process.versions.node.split('.')[0]) !== 24) fail('hosted_workflow_provisioned_linux_required');
  const environment = Object.fromEntries(['GITHUB_ACTIONS', 'RUNNER_OS', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_REF',
    'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'].map(name => [name, process.env[name]]));
  // Refuse unsupported workflow origins before reading private configuration.
  if (!historicalReadOnly && (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REPOSITORY !== RESET_REPOSITORY || environment.GITHUB_REF !== 'refs/heads/main' ||
    environment.GITHUB_WORKFLOW_REF !== `${RESET_REPOSITORY}/${RESET_WORKFLOW_PATH}@refs/heads/main` ||
    environment.GITHUB_WORKFLOW_SHA !== environment.GITHUB_SHA)) fail('hosted_workflow_invocation_invalid');
  const expectedConfigSha256 = process.env.PILOT_RESET_CONFIG_SHA256;
  const configurationBytes = await readPrivate(RESET_CONFIGURATION_PATH);
  const configuration = assertHostedConfiguration(json(configurationBytes), expectedConfigSha256, configurationBytes);
  // The fixed v2 runtime independently rereads/pins configuration and every
  // current authority input. It never enters the v1 archive/key/recovery path.
  if (isNoBackupWorkflow(configuration)) {
    delete process.env.PILOT_RESET_ENCRYPTION_KEY;
    return runNoBackupWorkflow(input, historicalReadOnly);
  }
  if (['reopen', 'complete-receipt'].includes(input.action) || input['reconcile-action'] === 'reopen') fail('hosted_workflow_no_backup_configuration_required');
  const operationRoot = `${RESET_PERSISTENT_ROOT}/operations/${input['operation-id']}`;
  await checkedPath(RESET_PERSISTENT_ROOT, 'directory');
  assertPersistentMount(configuration, await readFile('/proc/self/mountinfo', 'utf8'));
  const packetBytes = await readPrivate(`${operationRoot}/packet.json`, 16 * 1024 * 1024), packet = json(packetBytes);
  assertOperatorPacket(packet);
  await verifySourceFiles(packet);
  if (historicalReadOnly) await assertHistoricalCheckout(packet);
  const descriptorsBytes = await readPrivate(`${operationRoot}/descriptors.json`), descriptors = json(descriptorsBytes);
  validateHostedDescriptors(descriptors, input, packet, configuration, descriptorsBytes);
  const provisioningBytes = await readPrivate(`${RESET_PERSISTENT_ROOT}/provisioning.json`), provisioning = json(provisioningBytes);
  const authorityBytes = await readPrivate(`${operationRoot}/authority.json`), authority = json(authorityBytes);
  const evidence = { configuration, input, packet, provisioning, authority, provisioningBytes, authorityBytes };
  if (historicalReadOnly) {
    evidence.readAuthorityBytes = await readPrivate(`${operationRoot}/reconciliation-authority.json`);
    evidence.readAuthority = json(evidence.readAuthorityBytes);
  }
  assertRuntimeEvidence({ ...evidence, now: Date.now() });
  let supplemental = null;
  if (requiresSupplementalRecovery(input)) {
    const enrolled = configuration.operations[0].recovery;
    if (!enrolled) fail('hosted_workflow_separate_recovery_enrollment_required');
    const root = `${operationRoot}/recovery/${enrolled.operationId}`;
    const expectedBytes = await readPrivate(`${root}/expected.json`);
    const descriptorBytes = await readPrivate(`${root}/descriptor.json`);
    const recoveryAuthorityBytes = await readPrivate(`${root}/authority.json`);
    supplemental = { root, expected: json(expectedBytes), descriptor: json(descriptorBytes), authority: json(recoveryAuthorityBytes),
      expectedBytes, descriptorBytes, authorityBytes: recoveryAuthorityBytes };
    assertSupplementalRecoveryEvidence({ ...evidence, ...supplemental, now: Date.now() });
    // These are separately reviewed recovery documents, not aliases for the
    // original reset consent or proof. Their exact content is independently
    // pinned in protected configuration; this program never approves them.
    for (const name of ['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256']) {
      const proof = await readPrivate(`${root}/proofs/${supplemental.authority[name]}.json`);
      if (hashBytes(proof) !== supplemental.authority[name]) fail('hosted_workflow_recovery_proof_changed');
    }
  }
  // The protected config hash enrolls exact independently reviewed documents.
  // Read/hash their content too; existence of fsync alone never replaces review.
  for (const name of ['privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256']) {
    const proof = await readPrivate(`${RESET_PERSISTENT_ROOT}/proofs/${provisioning[name]}.json`);
    if (hashBytes(proof) !== provisioning[name]) fail('hosted_workflow_provisioning_proof_changed');
  }
  const token = process.env.GH_TOKEN;
  if (!historicalReadOnly) {
    if (typeof token !== 'string' || token.length < 1) fail('hosted_workflow_github_identity_missing');
    await observeWorkflow(environment, token, packet, configuration, input);
  }
  await checkedPath(configuration.connection.psqlPath, 'file', false);
  await checkedPath(configuration.connection.sslRootCertPath);
  await checkedPath(configuration.connection.passwordFilePath);
  if (hashBytes(await readFile(configuration.connection.psqlPath)) !== configuration.psqlBinarySha256 ||
    hashBytes(await readFile(configuration.connection.sslRootCertPath)) !== configuration.sslRootCertSha256) fail('hosted_workflow_database_client_changed');
  for (const name of ['journal', 'artifacts']) await checkedPath(`${RESET_PERSISTENT_ROOT}/${name}`, 'directory');
  const openStore = historicalReadOnly ? openExistingDirectoryStoreReadOnly : createExclusiveDirectoryStore;
  const journalStore = await openStore({ directory: `${RESET_PERSISTENT_ROOT}/journal`, storeId: configuration.journalStoreId });
  const artifactStore = await openStore({ directory: `${RESET_PERSISTENT_ROOT}/artifacts`, storeId: configuration.artifactStoreId });
  let rawKey = process.env.PILOT_RESET_ENCRYPTION_KEY;
  delete process.env.PILOT_RESET_ENCRYPTION_KEY;
  if (typeof rawKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(rawKey)) fail('hosted_workflow_existing_encryption_key_required');
  const keyBytes = Buffer.from(rawKey, 'base64'); rawKey = undefined;
  if (keyBytes.length !== 32) { keyBytes.fill(0); fail('hosted_workflow_existing_encryption_key_required'); }
  const key = createSecretKey(keyBytes); keyBytes.fill(0);
  const provider = createEncryptedArtifactProvider({ store: artifactStore, keyProvider: {
    async resolveKey({ keyId, purpose }) {
      if (keyId !== configuration.keyId || purpose !== 'decrypt') fail('hosted_workflow_key_use_refused');
      return key;
    },
  } });
  const receipts = new WeakSet();
  const refresh = async () => {
    const configNow = await readPrivate(RESET_CONFIGURATION_PATH);
    assertHostedConfiguration(json(configNow), expectedConfigSha256, configNow);
    if (!configNow.equals(configurationBytes) || !(await readPrivate(`${operationRoot}/authority.json`)).equals(authorityBytes) ||
      !(await readPrivate(`${RESET_PERSISTENT_ROOT}/provisioning.json`)).equals(provisioningBytes)) fail('hosted_workflow_authority_changed');
    assertPersistentMount(configuration, await readFile('/proc/self/mountinfo', 'utf8'));
    await verifySourceFiles(packet);
    if (historicalReadOnly) {
      await assertHistoricalCheckout(packet);
      if (!(await readPrivate(`${operationRoot}/reconciliation-authority.json`)).equals(evidence.readAuthorityBytes)) fail('hosted_workflow_read_authority_changed');
    } else await observeWorkflow(environment, token, packet, configuration, input);
    const current = assertRuntimeEvidence({ ...evidence, now: Date.now() });
    if (!supplemental) return current;
    for (const [name, bytes] of [['expected', supplemental.expectedBytes], ['descriptor', supplemental.descriptorBytes], ['authority', supplemental.authorityBytes]]) {
      if (!(await readPrivate(`${supplemental.root}/${name}.json`)).equals(bytes)) fail('hosted_workflow_recovery_evidence_changed');
    }
    for (const name of ['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256']) {
      const proof = await readPrivate(`${supplemental.root}/proofs/${supplemental.authority[name]}.json`);
      if (hashBytes(proof) !== supplemental.authority[name]) fail('hosted_workflow_recovery_proof_changed');
    }
    return assertSupplementalRecoveryEvidence({ ...evidence, ...supplemental, now: Date.now() });
  };
  const originalArtifacts = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority: async observed => {
    if (observed.operationId !== packet.operation.operationId || observed.packetSha256 !== packet.packetSha256 ||
      observed.mechanism?.storeId !== configuration.artifactStoreId || observed.mechanism?.kind !== 'exclusive-file-and-directory-fsync') fail('hosted_workflow_recovery_provider_changed');
    await refresh();
    const receipt = Object.freeze({ authoritySha256: input['authority-sha256'] }); receipts.add(receipt); return receipt;
  } });
  let artifacts = originalArtifacts;
  if (supplemental) {
    const recovery = createSupplementalRecoveryReader({ provider, originalPacket: packet, descriptor: supplemental.descriptor,
      expected: supplemental.expected, verifyRecoveryAuthority: async observed => {
        if (observed.packetSha256 !== packet.packetSha256 || canonicalJson(observed.originalPacket) !== canonicalJson(packet) ||
          canonicalJson(observed.expected) !== canonicalJson(supplemental.expected) ||
          canonicalJson(observed.descriptor) !== canonicalJson(supplemental.descriptor) ||
          observed.artifactSha256 !== supplemental.descriptor.ciphertextSha256) fail('hosted_workflow_recovery_provider_changed');
        return refresh();
      } });
    artifacts = Object.freeze({ read: role => originalArtifacts.read(role),
      inspectRecoveryCheckpoint: () => originalArtifacts.inspectRecoveryCheckpoint(), readRecoveryReview: () => recovery.readRecoveryReview() });
  }
  const runtime = { async assertCurrent({ packet: current, action, checkpoint }) {
    if (historicalReadOnly) fail('hosted_workflow_historical_read_only');
    if (current.packetSha256 !== packet.packetSha256 || !configuration.operations[0].actions.includes(action) || !receipts.has(checkpoint)) fail('hosted_workflow_runtime_receipt_invalid');
    return refresh();
  } };
  const observeAuthorization = historicalReadOnly ? null : createHostedActorAuthorizationReader({ packet, connection: configuration.connection });
  const actor = { async consume(authorizationId, { packet: current, action, binding }) {
    if (historicalReadOnly) fail('hosted_workflow_historical_read_only');
    const bridge = createHostedResetActor({ packet, binding, observeAuthorization });
    const handle = await bridge.load({ authorizationId, action });
    return bridge.consume(handle, { packet: current, action, binding });
  } };
  const transport = createHostedResetTransport({ packet, connection: configuration.connection, artifacts, journal: createJsonJournal({ store: journalStore }), runtime, actor });
  if (historicalReadOnly) {
    await refresh();
    return transport.reconcile({ action: input['reconcile-action'] });
  }
  if (input.action === 'inspect') {
    const observed = await transport.inspect();
    // Full DB observations contain definitions/row-hash census; never log them.
    return { status: 'observed-read-only', operationId: packet.operation.operationId, observationSha256: hashBytes(canonicalJson(observed)) };
  }
  if (input.action === 'reconcile') return transport.reconcile({ action: input['reconcile-action'] });
  return transport.dispatch({ action: input.action, authorization: input['authorization-id'] });
}

export const runHostedWorkflow = args => runFixedWorkflow(args, false);
// This separately authorized read path uses retained original source, not the
// latest main. It cannot initialize stores, consume an actor, dispatch or retry.
// Catalog/ledger drift still refuses inspection pending compatibility review.
export const runHistoricalReadOnlyReconciliation = args => runFixedWorkflow(args, true);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(canonicalJson(await runHostedWorkflow(process.argv.slice(2)))); }
  catch (error) {
    const code = typeof error?.message === 'string' && /^(?:hosted_workflow|hosted_transport|hosted_actor|operator|artifact|durable_store|reset_recovery_artifact|no_backup_runtime|no_backup_reader|no_backup|current_session|reset_reopening)_[a-z0-9_]+$/.test(error.message) ? error.message : 'hosted_workflow_failed';
    console.error(canonicalJson({ status: 'stopped', code, automaticRetryAllowed: false, preserveOriginalIntent: true }));
    process.exitCode = 1;
  }
}
