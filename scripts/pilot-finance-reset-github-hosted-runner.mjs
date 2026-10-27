// Fixed GitHub-hosted adapter. The VM holds transient inputs only; recovery and
// intent bytes belong to separately provisioned immutable external stores.
// This file creates no buckets, roles, keys, sessions or authorization locators.
import { execFile } from 'node:child_process';
import { createSecretKey } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { createJsonJournal } from './pilot-finance-reset-durable-store.mjs';
import { createEncryptedArtifactProvider, createBoundArtifactReader } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { createSupplementalRecoveryReader } from './pilot-finance-reset-recovery-artifact-reader.mjs';
import { createHostedResetActor, createHostedActorAuthorizationReader } from './pilot-finance-reset-hosted-actor.mjs';
import { createHostedResetTransport, assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';
import { createAwsS3RecoveryStore, inspectExternalStoreMechanism } from './pilot-finance-reset-external-store.mjs';
import { RESET_REPOSITORY, parseHostedWorkflowArguments, assertPrivatePathObservation, validateHostedDescriptors,
  summarizeHostedInspection, requiresSupplementalRecovery } from './pilot-finance-reset-hosted-workflow-core.mjs';
import { GITHUB_HOSTED_RESET_WORKFLOW, assertGithubHostedConfiguration, assertGithubHostedInput, assertGithubHostedInvocation, assertGithubHostedJobObservation,
  assertGithubHostedSourceCoverage, assertGithubHostedEvidence, assertGithubHostedRecoveryEvidence } from './pilot-finance-reset-github-hosted-core.mjs';

export const GITHUB_HOSTED_CONFIGURATION_PATH = '/etc/nestory-reset/github-hosted.json';
export const GITHUB_HOSTED_STORES_PATH = '/etc/nestory-reset/external-store.json';
const root = path.resolve(import.meta.dirname, '..');
const execute = promisify(execFile);
const fail = code => { throw new Error(`github_hosted_reset_${code}`); };
const parse = bytes => {
  try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); }
  catch { fail('document_invalid'); }
};
const sameBytes = (a, b) => Buffer.from(a).equals(Buffer.from(b));
async function checkedPath(filename, privateLeaf = true) {
  const pieces = filename.split('/').filter(Boolean);
  const names = ['/', ...pieces.map((_, i) => `/${pieces.slice(0, i + 1).join('/')}`)];
  const ancestors = [];
  for (const name of names) {
    const s = await lstat(name);
    ancestors.push({ path: name, type: s.isSymbolicLink() ? 'symlink' : s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other', uid: s.uid, mode: s.mode & 0o7777 });
  }
  assertPrivatePathObservation({ requested: filename, resolved: await realpath(filename), ancestors, uid: process.getuid(), kind: 'file', privateLeaf });
}
async function privateBytes(filename) {
  await checkedPath(filename);
  const before = await lstat(filename);
  if (before.size < 1 || before.size > 2 * 1024 * 1024 || before.nlink !== 1) fail('input_size_invalid');
  const bytes = await readFile(filename);
  await checkedPath(filename);
  const after = await lstat(filename);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || after.nlink !== 1 || bytes.length !== after.size) fail('input_changed');
  return bytes;
}
async function github(resource, token) {
  const url = `https://api.github.com/repos/${RESET_REPOSITORY}/${resource}`;
  let response;
  try { response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }); }
  catch { fail('github_unavailable'); }
  if (!response.ok || response.url !== url || response.redirected || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) fail('github_unavailable');
  const reader = response.body?.getReader();
  if (!reader) fail('github_unavailable');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2 * 1024 * 1024) { await reader.cancel(); fail('github_response_limit'); }
    chunks.push(value);
  }
  return parse(Buffer.concat(chunks));
}
async function checkout(packet) {
  assertGithubHostedSourceCoverage(packet);
  await cleanCheckout();
  for (const source of packet.sourceFiles) {
    if (hashSourceBytes(await readFile(path.join(root, source.path))) !== source.sha256) fail('source_changed');
  }
}
async function cleanCheckout() {
  const status = await execute('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, timeout: 10000, maxBuffer: 1024 * 1024 });
  if (status.stderr || status.stdout) fail('checkout_changed');
}
async function workflow({ environment, token, packet, configuration, input }) {
  const runId = environment.GITHUB_RUN_ID, attempt = environment.GITHUB_RUN_ATTEMPT;
  if (!/^[1-9][0-9]*$/.test(runId ?? '') || !/^[1-9][0-9]*$/.test(attempt ?? '')) fail('run_invalid');
  const [head, main, run, jobs, protectedEnvironment, branches] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 10000, maxBuffer: 4096 }), github('commits/main', token),
    github(`actions/runs/${runId}`, token), github(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`, token),
    github('environments/production-database', token), github('branches?protected=true&per_page=100', token),
  ]);
  if (head.stderr || !Array.isArray(branches) || branches.length >= 100) fail('repository_observation_invalid');
  const deploymentPolicies = protectedEnvironment.deployment_branch_policy?.custom_branch_policies ?
    await github('environments/production-database/deployment-branch-policies?per_page=100', token) : null;
  const observation = { environment, packet, configuration, input, gitHead: head.stdout.trim(), currentMain: main.sha,
    run, jobs, protectedEnvironment, protectedBranchNames: branches.map(b => b.name).sort(), deploymentPolicies,
    workflowBytes: await readFile(path.join(root, GITHUB_HOSTED_RESET_WORKFLOW)), now: Date.now() };
  return packet ? assertGithubHostedInvocation(observation) : assertGithubHostedJobObservation(observation);
}
async function required(store, key, limit = 2 * 1024 * 1024) {
  const value = await store.read(key);
  if (!(value instanceof Uint8Array) || value.length < 1 || value.length > limit) fail('external_document_unavailable');
  return Buffer.from(value);
}

export async function runGithubHostedWorkflow(args) {
  const input = parseHostedWorkflowArguments(args);
  // FIRST: before paths, provider credentials, remote storage or actor readers.
  // No configuration, CLI input or environment variable can override this hold.
  if (!['inspect', 'reconcile'].includes(input.action)) assertHostedTransportDispatchImplemented();
  if (process.platform !== 'linux' || typeof process.getuid !== 'function' || Number(process.versions.node.split('.')[0]) !== 24) fail('linux_node24_required');
  const environment = Object.fromEntries(['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME',
    'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA', 'GITHUB_SHA',
    'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'].map(k => [k, process.env[k]]));
  if (environment.GITHUB_ACTIONS !== 'true' || environment.RUNNER_ENVIRONMENT !== 'github-hosted' || environment.RUNNER_OS !== 'Linux' ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' || environment.GITHUB_REPOSITORY !== RESET_REPOSITORY || environment.GITHUB_REF !== 'refs/heads/main' ||
    environment.GITHUB_WORKFLOW_REF !== `${RESET_REPOSITORY}/${GITHUB_HOSTED_RESET_WORKFLOW}@refs/heads/main` ||
    environment.GITHUB_WORKFLOW_SHA !== environment.GITHUB_SHA) fail('origin_invalid');
  const expected = process.env.PILOT_RESET_GITHUB_HOSTED_CONFIG_SHA256;
  const configurationBytes = await privateBytes(GITHUB_HOSTED_CONFIGURATION_PATH);
  const configuration = assertGithubHostedConfiguration(parse(configurationBytes), expected, configurationBytes);
  const storesBytes = await privateBytes(GITHUB_HOSTED_STORES_PATH), stores = parse(storesBytes);
  if (hashBytes(storesBytes) !== configuration.providerConfigurationSha256 ||
    canonicalJson(Object.keys(stores).sort()) !== canonicalJson(['artifacts', 'format', 'journal']) ||
    stores.format !== 'nestory-github-hosted-reset-stores-v1' || stores.journal?.storeId !== configuration.journalStoreId ||
    stores.artifacts?.storeId !== configuration.artifactStoreId || stores.journal?.accessMode !== 'append-only' || stores.artifacts?.accessMode !== 'read-only' ||
    stores.journal?.bucket === stores.artifacts?.bucket && stores.journal?.prefix === stores.artifacts?.prefix) fail('external_configuration_invalid');
  const token = process.env.GH_TOKEN;
  if (!token) fail('github_identity_missing');
  await cleanCheckout();
  // Establish the real current-main job and environment before opening external
  // storage. Packet source coverage follows its authenticated immutable read.
  await workflow({ environment, token, configuration, input });
  const credentials = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, sessionToken: process.env.AWS_SESSION_TOKEN };
  for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete process.env[k];
  const journalStore = await createAwsS3RecoveryStore({ configuration: stores.journal, credentials });
  const artifactStore = await createAwsS3RecoveryStore({ configuration: stores.artifacts, credentials });
  const prefix = `operation/${input['operation-id']}`;
  const packetBytes = await required(journalStore, `${prefix}/packet`, 16 * 1024 * 1024), packet = parse(packetBytes);
  assertGithubHostedInput(input, packet, configuration);
  await checkout(packet);
  const descriptorsBytes = await required(journalStore, `${prefix}/descriptors`), descriptors = parse(descriptorsBytes);
  validateHostedDescriptors(descriptors, input, packet, configuration, descriptorsBytes);
  const provisioningBytes = await required(journalStore, `provisioning/${configuration.provisioningSha256}`), provisioning = parse(provisioningBytes);
  const authorityBytes = await required(journalStore, `${prefix}/authority/${input['authority-sha256']}`), authority = parse(authorityBytes);
  const proofs = {};
  for (const k of ['privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256']) {
    if (!/^[a-f0-9]{64}$/.test(provisioning[k] ?? '')) fail('provisioning_unverified');
    proofs[k] = await required(journalStore, `proof/${provisioning[k]}`);
  }
  const evidence = { input, packet, configuration, provisioning, provisioningBytes, authority, authorityBytes, proofs };
  assertGithubHostedEvidence({ ...evidence, now: Date.now() });
  let supplemental = null;
  if (requiresSupplementalRecovery(input)) {
    const enrollment = configuration.operation.recovery;
    if (!enrollment) fail('recovery_enrollment_required');
    const recoveryPrefix = `${prefix}/recovery/${enrollment.operationId}`;
    const expectedBytes = await required(journalStore, `${recoveryPrefix}/expected/${enrollment.expectedSha256}`);
    const descriptorBytes = await required(journalStore, `${recoveryPrefix}/descriptor/${enrollment.descriptorSha256}`);
    const authorityBytes = await required(journalStore, `${recoveryPrefix}/authority/${enrollment.authoritySha256}`);
    supplemental = { expected: parse(expectedBytes), descriptor: parse(descriptorBytes), authority: parse(authorityBytes), expectedBytes, descriptorBytes, authorityBytes, proofs: {} };
    for (const k of ['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256']) {
      if (!/^[a-f0-9]{64}$/.test(supplemental.authority[k] ?? '')) fail('recovery_proof_changed');
      supplemental.proofs[k] = await required(journalStore, `proof/${supplemental.authority[k]}`);
    }
    assertGithubHostedRecoveryEvidence({ ...evidence, ...supplemental, now: Date.now() });
  }
  async function refresh() {
    if (!sameBytes(configurationBytes, await privateBytes(GITHUB_HOSTED_CONFIGURATION_PATH)) || !sameBytes(storesBytes, await privateBytes(GITHUB_HOSTED_STORES_PATH))) fail('configuration_changed');
    if (!sameBytes(provisioningBytes, await required(journalStore, `provisioning/${configuration.provisioningSha256}`)) ||
      !sameBytes(authorityBytes, await required(journalStore, `${prefix}/authority/${input['authority-sha256']}`))) fail('authority_changed');
    for (const [field, content] of Object.entries(proofs)) {
      if (!sameBytes(content, await required(journalStore, `proof/${provisioning[field]}`))) fail('provisioning_proof_changed');
    }
    for (const [store, c] of [[journalStore, stores.journal], [artifactStore, stores.artifacts]]) {
      await store.assertCurrent();
      const mechanism = inspectExternalStoreMechanism(store);
      if (mechanism.kind !== 'aws-s3-conditional-versioned-object-lock' || mechanism.storeId !== c.storeId ||
        mechanism.configurationSha256 !== hashBytes(canonicalJson(c)) || Date.parse(mechanism.retentionUntil) < Date.parse(provisioning.retainedUntil)) fail('external_provider_changed');
    }
    await checkout(packet);
    await workflow({ environment, token, input, packet, configuration });
    const result = assertGithubHostedEvidence({ ...evidence, now: Date.now() });
    if (!supplemental) return result;
    const enrollment = configuration.operation.recovery, recoveryPrefix = `${prefix}/recovery/${enrollment.operationId}`;
    for (const [role, digest, bytes] of [['expected', enrollment.expectedSha256, supplemental.expectedBytes],
      ['descriptor', enrollment.descriptorSha256, supplemental.descriptorBytes], ['authority', enrollment.authoritySha256, supplemental.authorityBytes]]) {
      if (!sameBytes(bytes, await required(journalStore, `${recoveryPrefix}/${role}/${digest}`))) fail('recovery_changed');
    }
    for (const [field, content] of Object.entries(supplemental.proofs)) {
      if (!sameBytes(content, await required(journalStore, `proof/${supplemental.authority[field]}`))) fail('recovery_proof_changed');
    }
    return assertGithubHostedRecoveryEvidence({ ...evidence, ...supplemental, now: Date.now() });
  }
  await refresh();
  await checkedPath(configuration.connection.psqlPath, false);
  await checkedPath(configuration.connection.sslRootCertPath);
  await checkedPath(configuration.connection.passwordFilePath);
  if (hashBytes(await readFile(configuration.connection.psqlPath)) !== configuration.psqlBinarySha256 ||
    hashBytes(await readFile(configuration.connection.sslRootCertPath)) !== configuration.sslRootCertSha256) fail('database_client_changed');
  let encoded = process.env.PILOT_RESET_ENCRYPTION_KEY; delete process.env.PILOT_RESET_ENCRYPTION_KEY;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) fail('existing_key_required');
  const keyBytes = Buffer.from(encoded, 'base64'); encoded = undefined;
  const key = createSecretKey(keyBytes); keyBytes.fill(0);
  const provider = createEncryptedArtifactProvider({ store: artifactStore, keyProvider: { async resolveKey({ keyId, purpose }) {
    if (keyId !== configuration.keyId || purpose !== 'decrypt') fail('key_use_refused'); return key;
  } } });
  const receipts = new WeakSet();
  const original = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority: async observed => {
    if (observed.packetSha256 !== packet.packetSha256 || observed.operationId !== packet.operation.operationId ||
      observed.mechanism?.storeId !== configuration.artifactStoreId || observed.mechanism?.kind !== 'aws-s3-conditional-versioned-object-lock') fail('external_provider_changed');
    const receipt = await refresh(); receipts.add(receipt); return receipt;
  } });
  let artifacts = original;
  if (supplemental) {
    const recovery = createSupplementalRecoveryReader({ provider, originalPacket: packet, expected: supplemental.expected, descriptor: supplemental.descriptor,
      verifyRecoveryAuthority: async observed => {
        if (observed.packetSha256 !== packet.packetSha256 || canonicalJson(observed.originalPacket) !== canonicalJson(packet) ||
          canonicalJson(observed.expected) !== canonicalJson(supplemental.expected) || canonicalJson(observed.descriptor) !== canonicalJson(supplemental.descriptor) ||
          observed.artifactSha256 !== supplemental.descriptor.ciphertextSha256) fail('recovery_changed');
        return refresh();
      } });
    artifacts = Object.freeze({ read: role => original.read(role), inspectRecoveryCheckpoint: () => original.inspectRecoveryCheckpoint(), readRecoveryReview: () => recovery.readRecoveryReview() });
  }
  const runtime = { async assertCurrent({ packet: current, action, checkpoint }) {
    if (current.packetSha256 !== packet.packetSha256 || !configuration.operation.actions.includes(action) || !receipts.has(checkpoint)) fail('runtime_receipt_invalid');
    return refresh();
  } };
  const readOnly = ['inspect', 'reconcile'].includes(input.action);
  const observeAuthorization = readOnly ? null : createHostedActorAuthorizationReader({ packet, connection: configuration.connection });
  const actor = { async consume(authorizationId, request) {
    if (readOnly) fail('read_only');
    const bridge = createHostedResetActor({ packet, binding: request.binding, observeAuthorization });
    const handle = await bridge.load({ authorizationId, action: request.action }); return bridge.consume(handle, request);
  } };
  const journal = createJsonJournal({ store: readOnly ? Object.freeze({ read: key => journalStore.read(key),
    async putIfAbsent() { fail('read_only'); } }) : journalStore });
  const transport = createHostedResetTransport({ packet, connection: configuration.connection, artifacts, journal, runtime, actor });
  if (input.action === 'inspect') return summarizeHostedInspection(packet, await transport.inspect());
  if (input.action === 'reconcile') return transport.reconcile({ action: input['reconcile-action'] });
  return transport.dispatch({ action: input.action, authorization: input['authorization-id'] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(canonicalJson(await runGithubHostedWorkflow(process.argv.slice(2)))); }
  catch (error) {
    const code = /^(?:github_hosted_reset|hosted_transport|hosted_actor|hosted_workflow|reset_artifact|reset_store|reset_recovery_artifact|reset_external_store)_[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'github_hosted_reset_failed';
    console.error(canonicalJson({ status: 'stopped', code, automaticRetryAllowed: false, preserveOriginalIntent: true })); process.exitCode = 1;
  }
}
