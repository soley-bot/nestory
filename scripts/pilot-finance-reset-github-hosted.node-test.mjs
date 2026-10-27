import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runGithubHostedWorkflow } from './pilot-finance-reset-github-hosted-runner.mjs';
import { prepareGithubHostedBootstrapFiles } from './pilot-finance-reset-github-hosted-bootstrap.mjs';
import { canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { RESET_REPOSITORY, RESET_PROJECT, RESET_ORGANIZATION } from './pilot-finance-reset-hosted-workflow-core.mjs';
import { GITHUB_HOSTED_RESET_WORKFLOW, GITHUB_HOSTED_RESET_JOB, GITHUB_HOSTED_RESET_SOURCES,
  assertGithubHostedConfiguration, assertGithubHostedInput, assertGithubHostedInvocation, assertGithubHostedEvidence,
  assertGithubHostedSourceCoverage, assertGithubHostedRecoveryEvidence } from './pilot-finance-reset-github-hosted-core.mjs';

const id = d => `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`;
const h = d => d.repeat(64);
const bytes = v => Buffer.from(canonicalJson(v));
// All observations and proof documents are synthetic policy inputs. No runner,
// provider, customer approval or real PostgreSQL execution is represented.
function fixture() {
  const workflowBytes = Buffer.from('synthetic workflow bytes only');
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, Buffer.from(`synthetic ${role}`)]));
  const operation = { operationId: id('1'), projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, mainSha: 'a'.repeat(40),
    sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01',
    executionBusinessDate: '2026-10-27', invoiceDatePolicy: 'empty-books-no-invoices', timezone: 'Asia/Phnom_Penh' };
  const review = { format: 'nestory-protected-reset-review-v1', operation, schemaSha256: h('1'), ledgerSha256: h('2'),
    sourceSnapshotSha256: h('3'), archiveRows: 5, actionCount: 5,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256'].map(k => [k, h('4')])),
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, hashBytes(artifacts[role])])) };
  const sources = [...new Set([...SOURCE_ENTRYPOINTS, ...GITHUB_HOSTED_RESET_SOURCES])].map(p => ({ path: p,
    sha256: p === GITHUB_HOSTED_RESET_WORKFLOW ? hashSourceBytes(workflowBytes) : h('5') }));
  const packet = prepareOperatorPacket({ review, sources, artifacts, candidateHead: operation.mainSha });
  const proofs = Object.fromEntries(['privateAccessReviewSha256', 'keyRecoveryProofSha256', 'crossRunDurabilityProofSha256', 'retentionPolicySha256'].map(k => [k, Buffer.from(`synthetic ${k}`)]));
  const provisioning = { format: 'nestory-github-hosted-reset-provisioning-v1', providerConfigurationSha256: h('6'), journalStoreId: id('2'),
    artifactStoreId: id('3'), keyId: 'existing-key', validUntil: '2026-10-28T00:00:00Z', retainedUntil: '2027-10-28T00:00:00Z',
    ...Object.fromEntries(Object.entries(proofs).map(([k, v]) => [k, hashBytes(v)])) };
  const provisioningBytes = bytes(provisioning);
  const authority = { format: 'nestory-reset-reviewed-execution-authority-v1', operationId: operation.operationId, packetSha256: packet.packetSha256,
    mainSha: operation.mainSha, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, actions: ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'],
    validUntil: '2026-10-27T23:00:00Z', provisioningSha256: hashBytes(provisioningBytes),
    ...Object.fromEntries(['liveConsent', 'containmentProof', 'restoreProof', 'storageProof'].map(k => [`${k}Sha256`, packet.artifacts[k].sha256])) };
  const authorityBytes = bytes(authority);
  const configuration = { format: 'nestory-github-hosted-reset-v1', repository: RESET_REPOSITORY, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    runnerLabel: 'ubuntu-24.04', providerConfigurationSha256: provisioning.providerConfigurationSha256, journalStoreId: id('2'), artifactStoreId: id('3'), keyId: 'existing-key',
    psqlBinarySha256: h('7'), sslRootCertSha256: h('8'), provisioningSha256: hashBytes(provisioningBytes),
    connection: { expectedProjectRef: RESET_PROJECT, host: `db.${RESET_PROJECT}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres',
      psqlPath: '/usr/bin/psql', sslRootCertPath: '/etc/nestory-reset/database-ca.pem', passwordFilePath: '/etc/nestory-reset/database.pgpass' },
    operation: { operationId: operation.operationId, packetSha256: packet.packetSha256, descriptorsSha256: h('9'), authoritySha256: hashBytes(authorityBytes), mainSha: operation.mainSha, actions: authority.actions } };
  const input = { action: 'inspect', 'operation-id': operation.operationId, 'packet-sha256': packet.packetSha256, 'descriptors-sha256': h('9'),
    'authority-sha256': hashBytes(authorityBytes), 'authorization-id': 'none', 'reconcile-action': 'none' };
  const environment = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', RUNNER_NAME: 'GitHub Actions 42',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: RESET_REPOSITORY, GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: `${RESET_REPOSITORY}/${GITHUB_HOSTED_RESET_WORKFLOW}@refs/heads/main`, GITHUB_WORKFLOW_SHA: operation.mainSha,
    GITHUB_SHA: operation.mainSha, GITHUB_RUN_ID: '500', GITHUB_RUN_ATTEMPT: '1' };
  const run = { id: 500, run_attempt: 1, head_sha: operation.mainSha, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress',
    path: GITHUB_HOSTED_RESET_WORKFLOW, repository: { full_name: RESET_REPOSITORY } };
  const jobs = { total_count: 1, jobs: [{ id: 600, run_id: 500, run_attempt: 1, head_sha: operation.mainSha, name: GITHUB_HOSTED_RESET_JOB,
    status: 'in_progress', runner_id: 42, runner_name: environment.RUNNER_NAME, labels: ['ubuntu-24.04'] }] };
  return { packet, configuration, input, provisioning, provisioningBytes, authority, authorityBytes, proofs, environment, run, jobs, workflowBytes,
    gitHead: operation.mainSha, currentMain: operation.mainSha, now: Date.parse('2026-10-27T12:00:00Z'), protectedBranchNames: ['main'], deploymentPolicies: null,
    protectedEnvironment: { name: 'production-database', protection_rules: [{ type: 'branch_policy' }], deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } } };
}
function checkConfig(c) { return assertGithubHostedConfiguration(c, hashBytes(bytes(c)), bytes(c)); }
function repin(f) {
  f.provisioningBytes = bytes(f.provisioning); f.configuration.provisioningSha256 = hashBytes(f.provisioningBytes);
  f.authority.provisioningSha256 = f.configuration.provisioningSha256; f.authorityBytes = bytes(f.authority);
  f.input['authority-sha256'] = hashBytes(f.authorityBytes); f.configuration.operation.authoritySha256 = f.input['authority-sha256']; return f;
}

test('external-store configuration and fresh job identity preserve operation authority bindings', () => {
  const f = fixture(); checkConfig(f.configuration); assertGithubHostedSourceCoverage(f.packet);
  assert.equal(assertGithubHostedInvocation(f).jobId, 600);
  assert.deepEqual(assertGithubHostedEvidence(f), { authoritySha256: f.input['authority-sha256'] });
  f.environment.GITHUB_RUN_ID = '501'; f.run.id = 501; f.jobs.jobs[0].run_id = 501;
  f.jobs.jobs[0].id = 601; f.jobs.jobs[0].runner_id = 43; f.jobs.jobs[0].runner_name = f.environment.RUNNER_NAME = 'GitHub Actions 43';
  assert.equal(assertGithubHostedInvocation(f).runnerId, 43);
});
for (const [name, change] of [
  ['persistent runner id', c => { c.runnerId = 42; }], ['temporary persistence', c => { c.persistentRoot = '/tmp'; }],
  ['arbitrary provider URL', c => { c.providerUrl = 'https://example.test'; }], ['self-hosted image', c => { c.runnerLabel = 'self-hosted'; }],
  ['shared journal archive identity', c => { c.journalStoreId = c.artifactStoreId; }], ['credential in config', c => { c.connection.password = 'synthetic'; }],
  ['unreviewed recovery', c => { c.operation.actions.push('execute-recovery'); }], ['reopening', c => { c.operation.actions.push('reopen'); }],
  ['foreign host', c => { c.connection.host = 'localhost'; }], ['invalid provider binding', c => { c.providerConfigurationSha256 = ''; }],
]) test(`configuration rejects ${name}`, () => { const f = fixture(); change(f.configuration); assert.throws(() => checkConfig(f.configuration), /github_hosted_reset_/); });

for (const [name, change] of [
  ['self-hosted environment', f => { f.environment.RUNNER_ENVIRONMENT = 'self-hosted'; }], ['wrong architecture', f => { f.environment.RUNNER_ARCH = 'ARM64'; }],
  ['pull request origin', f => { f.environment.GITHUB_EVENT_NAME = 'pull_request'; }], ['different main', f => { f.currentMain = 'b'.repeat(40); }],
  ['workflow SHA drift', f => { f.environment.GITHUB_WORKFLOW_SHA = 'b'.repeat(40); }], ['wrong workflow', f => { f.run.path = '.github/workflows/ci.yml'; }],
  ['different repository', f => { f.run.repository.full_name = 'example/other'; }], ['missing attempt', f => { delete f.jobs.jobs[0].run_attempt; }],
  ['prior attempt', f => { f.jobs.jobs[0].run_attempt = 2; }], ['different job head', f => { f.jobs.jobs[0].head_sha = 'b'.repeat(40); }],
  ['another runner', f => { f.jobs.jobs[0].runner_name = 'other'; }], ['different label', f => { f.jobs.jobs[0].labels = ['ubuntu-latest']; }],
  ['duplicate matching job', f => { f.jobs.jobs.push(structuredClone(f.jobs.jobs[0])); f.jobs.total_count++; }],
  ['incomplete jobs response', f => { f.jobs.total_count++; }], ['missing environment', f => { f.protectedEnvironment = null; }],
  ['multiple protected branches', f => { f.protectedBranchNames.push('other'); }], ['changed workflow bytes', f => { f.workflowBytes = Buffer.from('changed'); }],
]) test(`invocation rejects ${name}`, () => { const f = fixture(); change(f); assert.throws(() => assertGithubHostedInvocation(f)); });

for (const [name, change] of [
  ['provider drift', f => { f.provisioning.providerConfigurationSha256 = h('a'); }], ['expired provisioning', f => { f.provisioning.validUntil = '2026-10-26T00:00:00Z'; }],
  ['expired human authority', f => { f.authority.validUntil = '2026-10-26T00:00:00Z'; }], ['short retention', f => { f.provisioning.retainedUntil = '2026-10-27T00:00:00Z'; }],
  ['different operation authority', f => { f.authority.operationId = id('9'); }], ['missing restore proof', f => { f.authority.restoreProofSha256 = h('b'); }],
  ['runner identity posing as authorization', f => { f.authority.runnerId = 42; }], ['missing access review bytes', f => { delete f.proofs.privateAccessReviewSha256; }],
  ['changed key recovery proof', f => { f.proofs.keyRecoveryProofSha256 = Buffer.from('changed'); }],
]) test(`evidence rejects ${name}`, () => { const f = fixture(); change(f); repin(f); assert.throws(() => assertGithubHostedEvidence(f), /github_hosted_reset_/); });

test('configuration and evidence reject parsed objects differing from pinned document bytes', () => {
  const f = fixture(), original = bytes(f.configuration); f.configuration.keyId = 'other';
  assert.throws(() => assertGithubHostedConfiguration(f.configuration, hashBytes(original), original), /configuration_invalid/);
  f.configuration.keyId = 'existing-key'; f.provisioning.keyId = 'other';
  assert.throws(() => assertGithubHostedEvidence(f), /evidence_digest_changed/);
});
test('forward actions require an existing authorization locator; reads cannot carry one', () => {
  const f = fixture(); f.input.action = 'execute';
  assert.throws(() => assertGithubHostedInput(f.input, f.packet, f.configuration), /input_invalid/);
  f.input['authorization-id'] = id('4'); assertGithubHostedInput(f.input, f.packet, f.configuration);
  f.input.action = 'inspect'; assert.throws(() => assertGithubHostedInput(f.input, f.packet, f.configuration), /input_invalid/);
});
test('reconciliation is bound to a previously enrolled forward stage', () => {
  const f = fixture(); f.input.action = 'reconcile'; f.input['reconcile-action'] = 'execute';
  assertGithubHostedInput(f.input, f.packet, f.configuration);
  for (const a of ['none', 'execute-recovery', 'reopen']) { f.input['reconcile-action'] = a; assert.throws(() => assertGithubHostedInput(f.input, f.packet, f.configuration), /input_invalid/); }
});

function recoveryFixture() {
  const f = fixture();
  const expected = { restoreOperationId: id('4'), originalOperationId: f.packet.operation.operationId, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    mainSha: f.packet.operation.mainSha, sourcesSha256: f.packet.sourcesSha256, reportCheckpointSha256: h('a'), postSourceSha256: h('b'),
    recoverySourcesSha256: h('c'), phaseBindingSha256: h('d'), actionMappingSha256: h('e'), executionBusinessDate: '2026-10-27' };
  const descriptor = { keyId: 'existing-key', ciphertextSha256: h('a'), binding: { operationId: id('4'), projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    mainSha: f.packet.operation.mainSha, sourceSnapshotSha256: expected.postSourceSha256, sourcesSha256: f.packet.sourcesSha256, role: 'recoveryPlan' } };
  const proofs = Object.fromEntries(['liveConsentSha256', 'containmentProofSha256', 'restoreProofSha256', 'storageProofSha256'].map(k => [k, Buffer.from(`new synthetic recovery ${k}`)]));
  const authority = { format: 'nestory-reset-reviewed-recovery-authority-v1', originalOperationId: f.packet.operation.operationId, restoreOperationId: id('4'),
    originalPacketSha256: f.packet.packetSha256, mainSha: f.packet.operation.mainSha, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    actions: ['prepare-recovery', 'execute-recovery'], validUntil: '2026-10-27T23:00:00Z', expectedSha256: hashBytes(bytes(expected)),
    descriptorSha256: hashBytes(bytes(descriptor)), artifactSha256: descriptor.ciphertextSha256, provisioningSha256: f.configuration.provisioningSha256,
    ...Object.fromEntries(Object.entries(proofs).map(([k, v]) => [k, hashBytes(v)])) };
  f.configuration.operation.actions.push('prepare-recovery', 'execute-recovery');
  f.configuration.operation.recovery = { operationId: id('4'), expectedSha256: authority.expectedSha256,
    descriptorSha256: authority.descriptorSha256, authoritySha256: hashBytes(bytes(authority)) };
  f.input.action = 'execute-recovery'; f.input['authorization-id'] = id('5');
  return { ...f, expected, expectedBytes: bytes(expected), descriptor, descriptorBytes: bytes(descriptor), authority, authorityBytes: bytes(authority), proofs };
}
test('recovery is a separately bound inverse operation with its own unexpired authority', () => {
  const f = recoveryFixture(); checkConfig(f.configuration); assertGithubHostedInput(f.input, f.packet, f.configuration);
  assert.deepEqual(assertGithubHostedRecoveryEvidence(f), { authoritySha256: f.configuration.operation.recovery.authoritySha256 });
});
for (const [name, change] of [
  ['expired recovery authority', f => { f.authority.validUntil = '2026-10-26T00:00:00Z'; f.authorityBytes = bytes(f.authority); f.configuration.operation.recovery.authoritySha256 = hashBytes(f.authorityBytes); }],
  ['mismatched recovery consent proof', f => { f.proofs.liveConsentSha256 = Buffer.from('different'); }],
  ['invented inverse source', f => { f.expected.postSourceSha256 = h('f'); }],
  ['read-authority expiry exemption', f => { f.readAuthority = {}; }],
  ['unbound recovery artifact', f => { f.descriptor.ciphertextSha256 = h('f'); }],
]) test(`recovery rejects ${name}`, () => { const f = recoveryFixture(); change(f); assert.throws(() => assertGithubHostedRecoveryEvidence(f)); });

function bootstrapFixture() {
  const f = fixture();
  const stores = { format: 'nestory-github-hosted-reset-stores-v1', journal: { storeId: f.configuration.journalStoreId, accessMode: 'append-only' },
    artifacts: { storeId: f.configuration.artifactStoreId, accessMode: 'read-only' } };
  const ca = '-----BEGIN CERTIFICATE-----\nsynthetic test only\n-----END CERTIFICATE-----\n';
  f.configuration.providerConfigurationSha256 = hashBytes(bytes(stores)); f.configuration.sslRootCertSha256 = hashBytes(ca);
  return { PILOT_RESET_GITHUB_HOSTED_CONFIG_JSON: canonicalJson(f.configuration), PILOT_RESET_GITHUB_HOSTED_CONFIG_SHA256: hashBytes(bytes(f.configuration)),
    PILOT_RESET_EXTERNAL_STORES_JSON: canonicalJson(stores), PILOT_RESET_DATABASE_CA_PEM: ca, PILOT_RESET_DATABASE_PASSWORD: 'synthetic:with\\escape' };
}
test('bootstrap prepares only fixed transient files and escapes the passfile password', () => {
  const files = prepareGithubHostedBootstrapFiles(bootstrapFixture());
  assert.deepEqual(Object.keys(files).sort(), ['database-ca.pem', 'database.pgpass', 'external-store.json', 'github-hosted.json']);
  assert.match(files['database.pgpass'].toString(), /:synthetic\\:with\\\\escape\n$/);
  assert.equal(files['github-hosted.json'].includes('synthetic:with'), false);
});
for (const [name, change] of [
  ['config digest mismatch', e => { e.PILOT_RESET_GITHUB_HOSTED_CONFIG_SHA256 = h('f'); }],
  ['store digest mismatch', e => { e.PILOT_RESET_EXTERNAL_STORES_JSON += ' '; }],
  ['CA mismatch', e => { e.PILOT_RESET_DATABASE_CA_PEM += '\n'; }],
  ['multiple passfile entries', e => { e.PILOT_RESET_DATABASE_PASSWORD = 'synthetic\nsecond'; }],
  ['missing password', e => { delete e.PILOT_RESET_DATABASE_PASSWORD; }],
]) test(`bootstrap rejects ${name}`, () => { const e = bootstrapFixture(); change(e); assert.throws(() => prepareGithubHostedBootstrapFiles(e)); });

for (const action of ['freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'prepare-recovery', 'execute-recovery']) {
  test(`fixed runner ${action} stops before Linux/files/provider/credentials at unconditional dispatch hold`, async () => {
    const f = fixture(); f.input.action = action; f.input['authorization-id'] = id('5');
    const args = Object.entries(f.input).flatMap(([k, v]) => [`--${k}`, v]);
    await assert.rejects(runGithubHostedWorkflow(args), /hosted_transport_integration_incomplete/);
  });
}
test('new runtime import closure and installed dependency manifests are source-pinned', async () => {
  const seen = new Set(), root = path.resolve(import.meta.dirname, '..');
  async function walk(relative) {
    if (seen.has(relative)) return; seen.add(relative);
    assert.ok(GITHUB_HOSTED_RESET_SOURCES.includes(relative), `missing ${relative}`);
    const source = await readFile(path.join(root, relative), 'utf8');
    const references = [...source.matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"\n]+\.mjs)\1/g)];
    for (const [, , reference] of references) await walk(path.posix.normalize(path.posix.join(path.posix.dirname(relative), reference)));
  }
  await walk('scripts/pilot-finance-reset-github-hosted-runner.mjs');
  await walk('scripts/pilot-finance-reset-github-hosted-bootstrap.mjs');
  assert.ok(GITHUB_HOSTED_RESET_SOURCES.includes('package.json')); assert.ok(GITHUB_HOSTED_RESET_SOURCES.includes('package-lock.json'));
});

test('GitHub-hosted workflow retains manual exact-main protected single-writer routing', async () => {
  const source = await readFile(new URL('../.github/workflows/pilot-financial-reset-github-hosted.yml', import.meta.url), 'utf8');
  const trigger = source.split(/^on:\s*$/m)[1]?.split(/^permissions:/m)[0];
  assert.ok(trigger); assert.match(trigger, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(trigger, /^  (?:push|pull_request|pull_request_target|workflow_run|workflow_call|schedule):/m);
  assert.match(source, /if: github\.ref == 'refs\/heads\/main' && github\.workflow_sha == github\.sha && vars\.PILOT_RESET_GITHUB_HOSTED_ENABLED == 'reviewed-operation-only'/);
  assert.match(source, /runs-on: ubuntu-24\.04/); assert.match(source, /environment: production-database/);
  assert.match(source, /concurrency:\s*\n\s*group: production-supabase\s*\n\s*cancel-in-progress: false/);
  assert.match(source, /persist-credentials: false/); assert.match(source, /clean: true/);
  const actionReferences = [...source.matchAll(/^\s*uses: (\S+)/gm)].map(m => m[1]);
  assert.ok(actionReferences.length >= 3);
  for (const ref of actionReferences) assert.match(ref, /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/);
  const hold = source.indexOf('assertHostedTransportDispatchImplemented();');
  assert.ok(hold > 0 && hold < source.indexOf('PILOT_RESET_GITHUB_HOSTED_CONFIG_JSON:') && hold < source.indexOf('uses: aws-actions/configure-aws-credentials@'));
  assert.match(source, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(source, /uses:.*(?:actions\/cache|upload-artifact|download-artifact)/);
  assert.doesNotMatch(source, /(?:supabase db (?:push|reset)|psql\s.*(?:-c|--command)|DROP TABLE|TRUNCATE TABLE)/i);
  const runBlocks = [...source.matchAll(/^\s{8}run: \|\r?\n((?:\s{10}[^\r\n]*\r?\n|\r?\n)*)/gm)].map(m => m[1]);
  assert.ok(runBlocks.length >= 3);
  for (const body of runBlocks) assert.doesNotMatch(body, /\$\{\{/);
  const invocation = runBlocks.find(body => body.includes('node scripts/pilot-finance-reset-github-hosted-runner.mjs'));
  assert.ok(invocation);
  assert.deepEqual([...invocation.matchAll(/--([a-z0-9-]+) "\$RESET_[A-Z0-9_]+"/g)].map(m => m[1]),
    ['action', 'operation-id', 'packet-sha256', 'descriptors-sha256', 'authority-sha256', 'authorization-id', 'reconcile-action']);
});
