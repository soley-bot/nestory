// Pure GitHub-hosted policy. Provider identity and human/session authority are
// separate: an Actions identity is never a financial-reset authorization.
import { assertOperatorPacket, canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { RESET_REPOSITORY, RESET_PROJECT, RESET_ORGANIZATION, HOSTED_BOUND_SOURCE_FILES,
  assertProtectedEnvironment, assertSupplementalRecoveryEvidence } from './pilot-finance-reset-hosted-workflow-core.mjs';

export const GITHUB_HOSTED_RESET_WORKFLOW = '.github/workflows/pilot-financial-reset-github-hosted.yml';
export const GITHUB_HOSTED_RESET_JOB = 'Pilot financial reset (GitHub-hosted)';
export const GITHUB_HOSTED_RESET_LABEL = 'ubuntu-24.04';
export const GITHUB_HOSTED_RESET_ACTIONS = Object.freeze(['freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'prepare-recovery', 'execute-recovery']);
export const GITHUB_HOSTED_RESET_SOURCES = Object.freeze([...new Set([...HOSTED_BOUND_SOURCE_FILES,
  GITHUB_HOSTED_RESET_WORKFLOW, 'scripts/pilot-finance-reset-github-hosted-core.mjs',
  'scripts/pilot-finance-reset-github-hosted-runner.mjs', 'scripts/pilot-finance-reset-github-hosted-bootstrap.mjs',
  'scripts/pilot-finance-reset-external-store.mjs', 'package.json', 'package-lock.json'])].sort());
const digest = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
const fail = code => { throw new Error(`github_hosted_reset_${code}`); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const current = (expiry, now) => typeof expiry === 'string' && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > now;
const bytesMatch = (value, bytes) => {
  try { return same(value, JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))); } catch { return false; }
};

export function assertGithubHostedConfiguration(configuration, expectedSha256, bytes) {
  if (!digest.test(expectedSha256) || hashBytes(bytes) !== expectedSha256 || !bytesMatch(configuration, bytes) ||
    !exact(configuration, ['format', 'repository', 'projectRef', 'organizationId', 'runnerLabel', 'providerConfigurationSha256',
      'journalStoreId', 'artifactStoreId', 'keyId', 'connection', 'psqlBinarySha256', 'sslRootCertSha256', 'provisioningSha256', 'operation']) ||
    configuration.format !== 'nestory-github-hosted-reset-v1' || configuration.repository !== RESET_REPOSITORY ||
    configuration.projectRef !== RESET_PROJECT || configuration.organizationId !== RESET_ORGANIZATION ||
    configuration.runnerLabel !== GITHUB_HOSTED_RESET_LABEL || !uuid.test(configuration.journalStoreId) ||
    !uuid.test(configuration.artifactStoreId) || configuration.journalStoreId === configuration.artifactStoreId ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(configuration.keyId) ||
    !['providerConfigurationSha256', 'psqlBinarySha256', 'sslRootCertSha256', 'provisioningSha256'].every(k => digest.test(configuration[k]))) fail('configuration_invalid');
  const c = configuration.connection;
  if (!exact(c, ['expectedProjectRef', 'host', 'port', 'database', 'user', 'psqlPath', 'sslRootCertPath', 'passwordFilePath']) ||
    c.expectedProjectRef !== RESET_PROJECT || c.host !== `db.${RESET_PROJECT}.supabase.co` || c.port !== 5432 || c.database !== 'postgres' ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(c.user) || !/^\/(?:usr\/bin|usr\/lib\/postgresql\/[1-9][0-9]*\/bin)\/psql$/.test(c.psqlPath) ||
    c.sslRootCertPath !== '/etc/nestory-reset/database-ca.pem' || c.passwordFilePath !== '/etc/nestory-reset/database.pgpass') fail('connection_invalid');
  const o = configuration.operation;
  if (!exact(o, ['operationId', 'packetSha256', 'descriptorsSha256', 'authoritySha256', 'mainSha', 'actions', ...(Object.hasOwn(o, 'recovery') ? ['recovery'] : [])]) ||
    !uuid.test(o.operationId) || !sha.test(o.mainSha) || !['packetSha256', 'descriptorsSha256', 'authoritySha256'].every(k => digest.test(o[k])) ||
    !Array.isArray(o.actions) || !o.actions.length || new Set(o.actions).size !== o.actions.length ||
    o.actions.some(action => !GITHUB_HOSTED_RESET_ACTIONS.includes(action))) fail('operation_invalid');
  if (o.actions.some(a => a.endsWith('recovery')) !== Object.hasOwn(o, 'recovery') || o.recovery &&
    (!exact(o.recovery, ['operationId', 'expectedSha256', 'descriptorSha256', 'authoritySha256']) ||
      !uuid.test(o.recovery.operationId) || o.recovery.operationId === o.operationId ||
      !['expectedSha256', 'descriptorSha256', 'authoritySha256'].every(k => digest.test(o.recovery[k])) ||
      !['prepare-recovery', 'execute-recovery'].every(a => o.actions.includes(a)))) fail('recovery_enrollment_invalid');
  return configuration;
}

export function assertGithubHostedInput(input, packet, configuration) {
  assertOperatorPacket(packet);
  const o = configuration.operation;
  if (!exact(input, ['action', 'operation-id', 'packet-sha256', 'descriptors-sha256', 'authority-sha256', 'authorization-id', 'reconcile-action']) ||
    !['inspect', 'reconcile', ...GITHUB_HOSTED_RESET_ACTIONS].includes(input.action) ||
    input['operation-id'] !== o.operationId || o.operationId !== packet.operation.operationId ||
    input['packet-sha256'] !== o.packetSha256 || o.packetSha256 !== packet.packetSha256 ||
    input['descriptors-sha256'] !== o.descriptorsSha256 || input['authority-sha256'] !== o.authoritySha256 ||
    o.mainSha !== packet.operation.mainSha || packet.operation.projectRef !== RESET_PROJECT || packet.operation.organizationId !== RESET_ORGANIZATION ||
    (input.action === 'reconcile' ? !o.actions.includes(input['reconcile-action']) : input['reconcile-action'] !== 'none') ||
    (['inspect', 'reconcile'].includes(input.action) ? input['authorization-id'] !== 'none' : !o.actions.includes(input.action) || !uuid.test(input['authorization-id']))) fail('input_invalid');
}

export function assertGithubHostedSourceCoverage(packet) {
  assertOperatorPacket(packet);
  if (!GITHUB_HOSTED_RESET_SOURCES.every(p => packet.sourceFiles.some(f => f.path === p))) fail('source_coverage_incomplete');
}

// Observations must be fetched by the fixed runtime from GitHub, never supplied
// as workflow inputs. This pure check does not authenticate its own arguments.
export function assertGithubHostedJobObservation({ configuration, environment: e, gitHead, currentMain,
  run, jobs, protectedEnvironment, protectedBranchNames, deploymentPolicies, now }) {
  assertProtectedEnvironment(protectedEnvironment, protectedBranchNames, deploymentPolicies);
  if (!Number.isSafeInteger(now) || now < 0 || e.GITHUB_ACTIONS !== 'true' || e.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    e.RUNNER_OS !== 'Linux' || e.RUNNER_ARCH !== 'X64' || typeof e.RUNNER_NAME !== 'string' || !e.RUNNER_NAME ||
    e.GITHUB_EVENT_NAME !== 'workflow_dispatch' || e.GITHUB_REPOSITORY !== RESET_REPOSITORY || e.GITHUB_REF !== 'refs/heads/main' ||
    e.GITHUB_WORKFLOW_REF !== `${RESET_REPOSITORY}/${GITHUB_HOSTED_RESET_WORKFLOW}@refs/heads/main` ||
    e.GITHUB_WORKFLOW_SHA !== e.GITHUB_SHA || !sha.test(e.GITHUB_SHA ?? '') || gitHead !== e.GITHUB_SHA || currentMain !== gitHead ||
    configuration.operation.mainSha !== gitHead || !/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ATTEMPT ?? '') ||
    !run || !positive(run.id) || String(run.id) !== e.GITHUB_RUN_ID || String(run.run_attempt) !== e.GITHUB_RUN_ATTEMPT ||
    run.head_sha !== gitHead || run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.status !== 'in_progress' ||
    run.path !== GITHUB_HOSTED_RESET_WORKFLOW || run.repository?.full_name !== RESET_REPOSITORY ||
    !Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length) fail('invocation_invalid');
  const active = jobs.jobs.filter(j => j.name === GITHUB_HOSTED_RESET_JOB && j.status === 'in_progress');
  if (active.length !== 1) fail('job_unverified');
  const job = active[0];
  if (!positive(job.id) || !positive(job.runner_id) || job.run_id !== run.id || job.run_attempt !== run.run_attempt ||
    job.head_sha !== gitHead || job.runner_name !== e.RUNNER_NAME || !same(job.labels, [GITHUB_HOSTED_RESET_LABEL])) fail('job_unverified');
  return Object.freeze({ runId: run.id, runAttempt: run.run_attempt, jobId: job.id, runnerId: job.runner_id,
    mainSha: gitHead, observedAt: new Date(now).toISOString() });
}

export function assertGithubHostedInvocation(observation) {
  const { input, packet, configuration, workflowBytes } = observation;
  assertGithubHostedInput(input, packet, configuration);
  const receipt = assertGithubHostedJobObservation(observation);
  const source = packet.sourceFiles.find(f => f.path === GITHUB_HOSTED_RESET_WORKFLOW);
  if (!source || source.sha256 !== hashSourceBytes(workflowBytes)) fail('workflow_source_changed');
  return Object.freeze({ ...receipt, workflowSourceSha256: source.sha256 });
}

export function assertGithubHostedEvidence({ input, packet, configuration: c, provisioning: p, provisioningBytes,
  authority: a, authorityBytes, proofs, now }) {
  assertGithubHostedInput(input, packet, c);
  if (!Number.isSafeInteger(now) || now < 0 || hashBytes(provisioningBytes) !== c.provisioningSha256 || !bytesMatch(p, provisioningBytes) ||
    hashBytes(authorityBytes) !== input['authority-sha256'] || !bytesMatch(a, authorityBytes)) fail('evidence_digest_changed');
  const proofFields = ['privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256'];
  if (!exact(p, ['format', 'providerConfigurationSha256', 'journalStoreId', 'artifactStoreId', 'keyId', 'validUntil', 'retainedUntil', ...proofFields]) ||
    p.format !== 'nestory-github-hosted-reset-provisioning-v1' || p.providerConfigurationSha256 !== c.providerConfigurationSha256 ||
    p.journalStoreId !== c.journalStoreId || p.artifactStoreId !== c.artifactStoreId || p.keyId !== c.keyId ||
    !current(p.validUntil, now) || !Number.isFinite(Date.parse(p.retainedUntil)) || Date.parse(p.retainedUntil) < Date.parse(p.validUntil) ||
    !proofFields.every(k => digest.test(p[k]))) fail('provisioning_unverified');
  if (!exact(a, ['format', 'operationId', 'packetSha256', 'mainSha', 'projectRef', 'organizationId', 'actions', 'validUntil',
    'liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256', 'provisioningSha256']) ||
    a.format !== 'nestory-reset-reviewed-execution-authority-v1' || a.operationId !== packet.operation.operationId ||
    a.packetSha256 !== packet.packetSha256 || a.mainSha !== packet.operation.mainSha || a.projectRef !== RESET_PROJECT ||
    a.organizationId !== RESET_ORGANIZATION || !same(a.actions, c.operation.actions) || a.provisioningSha256 !== c.provisioningSha256 ||
    !current(a.validUntil, now) || Date.parse(a.validUntil) > Date.parse(p.validUntil)) fail('authority_unverified');
  const authorityRoles = { liveConsentSha256: 'liveConsent', containmentProofSha256: 'containmentProof', restoreProofSha256: 'restoreProof', storageProofSha256: 'storageProof' };
  for (const [field, role] of Object.entries(authorityRoles)) {
    if (!digest.test(a[field]) || a[field] !== packet.artifacts[role]?.sha256) fail('authority_scope_changed');
  }
  // Review hashes are not real-world proof. Require exact document bytes, while
  // the provider must independently verify its configured resource on each use.
  if (!exact(proofs, proofFields) || proofFields.some(k => !(proofs[k] instanceof Uint8Array) || hashBytes(proofs[k]) !== p[k])) fail('provisioning_proof_changed');
  return Object.freeze({ authoritySha256: hashBytes(authorityBytes) });
}

export function assertGithubHostedRecoveryEvidence(evidence) {
  const { configuration, expected, descriptor, authority, expectedBytes, descriptorBytes, authorityBytes, proofs } = evidence;
  if (Object.hasOwn(evidence, 'readAuthority') || Object.hasOwn(evidence, 'readAuthorityBytes') ||
    !bytesMatch(expected, expectedBytes) || !bytesMatch(descriptor, descriptorBytes) || !bytesMatch(authority, authorityBytes)) fail('recovery_document_changed');
  // Only adapt the operation-list shape. Preserve the existing independently
  // bound inverse operation, checkpoint, source hashes, consent and expiry.
  const result = assertSupplementalRecoveryEvidence({ ...evidence,
    configuration: { ...configuration, operations: [configuration.operation] } });
  const fields = ['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256'];
  if (!exact(proofs, fields) || fields.some(k => !(proofs[k] instanceof Uint8Array) || hashBytes(proofs[k]) !== authority[k])) fail('recovery_proof_changed');
  return result;
}
