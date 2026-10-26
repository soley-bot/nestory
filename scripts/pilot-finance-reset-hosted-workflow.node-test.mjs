import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecretKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createEncryptedArtifactProvider, createBoundArtifactReader, artifactSlot } from './pilot-finance-reset-encrypted-artifacts.mjs';
import { canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { RESET_REPOSITORY, RESET_PROJECT, RESET_ORGANIZATION, RESET_WORKFLOW_PATH, RESET_PERSISTENT_ROOT,
  parseHostedWorkflowArguments, assertHostedConfiguration, assertPrivatePathObservation, assertPersistentMount,
  assertWorkflowInvocation, assertRuntimeEvidence, validateHostedDescriptors, assertProtectedEnvironment,
  HOSTED_RUNTIME_SOURCE_FILES, assertHostedSourceCoverage, requiresSupplementalRecovery, assertSupplementalRecoveryEvidence,
  assertHistoricalReadAuthority, isNoBackupWorkflow, NO_BACKUP_RUNTIME_INPUT_ROLES, validateNoBackupRuntimeInputs } from './pilot-finance-reset-hosted-workflow-core.mjs';
import { NO_BACKUP_POLICY, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_REQUIRED_SOURCE_FILES, prepareNoBackupPacket }
  from './pilot-finance-reset-no-backup-core.mjs';

const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const hash = digit => digit.repeat(64);
const bytes = object => Buffer.from(canonicalJson(object));
function fixture() {
  const workflowBytes = Buffer.from('fixture workflow bytes; never executable');
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, Buffer.from(`synthetic encrypted ${role}`)]));
  const operation = { operationId: id('1'), projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, mainSha: 'a'.repeat(40),
    sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01',
    executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' };
  const review = { format: 'nestory-protected-reset-review-v1', operation, schemaSha256: hash('1'), ledgerSha256: hash('2'),
    sourceSnapshotSha256: hash('3'), archiveRows: 5, actionCount: 5,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256', 'continuationSemanticSha256', 'reportReviewSha256'].map(name => [name, hash('4')])),
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, hashBytes(artifacts[role])])) };
  const sources = [...SOURCE_ENTRYPOINTS, RESET_WORKFLOW_PATH, 'supabase/migrations/20261023185247_fixture.sql'].map(name => ({ path: name, sha256: name === RESET_WORKFLOW_PATH ? hashSourceBytes(workflowBytes) : hash('5') }));
  const packet = prepareOperatorPacket({ review, sources, artifacts, candidateHead: operation.mainSha });
  const descriptors = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, { keyId: 'existing-key-1', binding: { role, operationId: operation.operationId,
    projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, mainSha: operation.mainSha, sourceSnapshotSha256: packet.sourceSnapshotSha256,
    sourcesSha256: packet.sourcesSha256 }, plaintextSha256: hash('6'), byteLength: 1,
  ciphertextSha256: packet.artifacts[role].sha256, ciphertextByteLength: packet.artifacts[role].bytes }]));
  const provisioning = { format: 'nestory-reset-reviewed-provisioning-v1', runnerId: 42, persistentRoot: RESET_PERSISTENT_ROOT,
    journalStoreId: id('2'), artifactStoreId: id('3'), keyId: 'existing-key-1', retainedUntil: '2027-10-25T00:00:00Z', validUntil: '2026-10-25T00:00:00Z',
    privateAccessReviewSha256: hash('7'), keyRecoveryProofSha256: hash('8'), crossRunDurabilityProofSha256: hash('9'), retentionPolicySha256: hash('a') };
  const authority = { format: 'nestory-reset-reviewed-execution-authority-v1', operationId: operation.operationId, packetSha256: packet.packetSha256,
    mainSha: operation.mainSha, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, actions: ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'],
    validUntil: '2026-10-24T01:00:00Z', liveConsentSha256: packet.artifacts.liveConsent.sha256, containmentProofSha256: packet.artifacts.containmentProof.sha256,
    restoreProofSha256: packet.artifacts.restoreProof.sha256, storageProofSha256: packet.artifacts.storageProof.sha256, provisioningSha256: hashBytes(bytes(provisioning)) };
  const args = ['--action', 'freeze', '--operation-id', operation.operationId, '--packet-sha256', packet.packetSha256,
    '--descriptors-sha256', hashBytes(bytes(descriptors)), '--authority-sha256', hashBytes(bytes(authority)), '--authorization-id', id('4'), '--reconcile-action', 'none'];
  const input = parseHostedWorkflowArguments(args);
  const configuration = { format: 'nestory-protected-reset-runner-v1', repository: RESET_REPOSITORY, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    runnerId: 42, persistentRoot: RESET_PERSISTENT_ROOT, mountSourceSha256: hashBytes('/dev/fixture-persistent'), mountFilesystem: 'ext4',
    journalStoreId: id('2'), artifactStoreId: id('3'), keyId: 'existing-key-1', psqlBinarySha256: hash('b'), sslRootCertSha256: hash('c'), provisioningSha256: hashBytes(bytes(provisioning)),
    connection: { expectedProjectRef: RESET_PROJECT, host: `db.${RESET_PROJECT}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres',
      psqlPath: '/usr/bin/psql', sslRootCertPath: '/etc/nestory-reset/database-ca.pem', passwordFilePath: '/etc/nestory-reset/database.pgpass' },
    operations: [{ operationId: operation.operationId, packetSha256: packet.packetSha256, descriptorsSha256: input['descriptors-sha256'],
      authoritySha256: input['authority-sha256'], mainSha: operation.mainSha, actions: authority.actions }] };
  const environment = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: RESET_REPOSITORY,
    GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${RESET_REPOSITORY}/${RESET_WORKFLOW_PATH}@refs/heads/main`, GITHUB_WORKFLOW_SHA: operation.mainSha,
    GITHUB_SHA: operation.mainSha, GITHUB_RUN_ID: '500', GITHUB_RUN_ATTEMPT: '1' };
  const run = { id: 500, run_attempt: 1, head_sha: operation.mainSha, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress', path: RESET_WORKFLOW_PATH, repository: { full_name: RESET_REPOSITORY } };
  const jobs = { total_count: 1, jobs: [{ name: 'Pilot financial reset', status: 'in_progress', runner_id: 42, run_id: 500, run_attempt: 1 }] };
  return { args, input, packet, descriptors, configuration, provisioning, authority, environment, run, jobs, workflowBytes, review, sources,
    gitHead: operation.mainSha, currentMain: operation.mainSha, now: Date.parse('2026-10-23T20:00:00Z') };
}

// Pure policy fixtures: all source bytes, inputs, provisioner facts and authority
// references below are synthetic. They establish no provider, customer consent,
// executable financial plan, actual PostgreSQL observation or hosted readiness.
function noBackupFixture() {
  const base = fixture(), operation = { ...base.packet.operation, kind: 'reset', restoreOf: null, dueDate: '2026-10-07' };
  const sourceContents = Object.fromEntries(NO_BACKUP_REQUIRED_SOURCE_FILES.map(name => [name, Buffer.from(`synthetic source ${name}`)]));
  const evidenceBytes = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, bytes({ syntheticOnly: true, role })]));
  const inputBytes = Object.fromEntries(NO_BACKUP_RUNTIME_INPUT_ROLES.map(role => [role, bytes({ syntheticOnly: true, role })]));
  inputBytes.zeroPlan = Buffer.from('{"syntheticOnly": true, "ownership_percent": 25.50}');
  inputBytes.postgresSemantic = Buffer.from('{"version": 3, "syntheticOnly": true}');
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY, operation,
    schemaSha256: hash('1'), ledgerSha256: hash('2'), sourceSnapshotSha256: hash('3'), foreignSnapshotSha256: hash('a'), archiveRows: 5, actionCount: 5,
    databaseBinding: { ...base.packet.databaseBinding, zeroReviewSha256: hashBytes(inputBytes.zeroPlan), continuationSemanticSha256: hashBytes(inputBytes.postgresSemantic) },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidenceBytes[role])])) };
  const packet = prepareNoBackupPacket({ review, sources: Object.entries(sourceContents).map(([name, content]) => ({ path: name, sha256: hashSourceBytes(content) })),
    sourceContents, evidence: evidenceBytes, candidateHead: operation.mainSha, observedBusinessDate: operation.executionBusinessDate });
  const descriptors = { format: 'nestory-no-backup-reviewed-inputs-v1', recoveryPolicy: NO_BACKUP_POLICY, operationId: operation.operationId,
    packetSha256: packet.packetSha256, inputs: Object.fromEntries(NO_BACKUP_RUNTIME_INPUT_ROLES.map(role =>
      [role, { sha256: hashBytes(inputBytes[role]), bytes: inputBytes[role].length }])) };
  const provisioning = { format: 'nestory-reset-reviewed-no-backup-provisioning-v1', runnerId: 42, persistentRoot: RESET_PERSISTENT_ROOT,
    journalStoreId: id('2'), validUntil: '2026-10-25T00:00:00Z', privateAccessReviewSha256: hash('7'), crossRunDurabilityProofSha256: hash('9') };
  const configuration = { ...base.configuration, format: 'nestory-protected-reset-runner-v2', recoveryPolicy: NO_BACKUP_POLICY,
    provisioningSha256: hashBytes(bytes(provisioning)), operations: [{ operationId: operation.operationId, packetSha256: packet.packetSha256,
      descriptorsSha256: hashBytes(bytes(descriptors)), authoritySha256: hash('a'), mainSha: operation.mainSha,
      actions: ['freeze', 'checkpoint', 'prepare', 'seal', 'execute'] }] };
  delete configuration.artifactStoreId; delete configuration.keyId;
  const authority = { format: 'nestory-reset-reviewed-no-backup-runtime-authority-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operationId: operation.operationId, packetSha256: packet.packetSha256, mainSha: operation.mainSha, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    actions: [...configuration.operations[0].actions], issuedAt: '2026-10-23T19:00:00Z', validUntil: '2026-10-24T01:00:00Z',
    evidenceReferences: structuredClone(packet.evidenceReferences), stageAuthorities: Object.fromEntries(configuration.operations[0].actions.map(action =>
      [action, hashBytes(bytes({ syntheticOnly: true, action }))])), provisioningSha256: configuration.provisioningSha256 };
  const input = { ...base.input, 'packet-sha256': packet.packetSha256, 'descriptors-sha256': hashBytes(bytes(descriptors)), 'authority-sha256': hashBytes(bytes(authority)) };
  configuration.operations[0].authoritySha256 = input['authority-sha256'];
  return { ...base, packet, input, configuration, provisioning, authority, descriptors, inputBytes, evidenceBytes,
    workflowBytes: sourceContents[RESET_WORKFLOW_PATH], provisioningBytes: bytes(provisioning), authorityBytes: bytes(authority) };
}
function repinSyntheticPolicy(f) {
  f.provisioningBytes = bytes(f.provisioning); f.configuration.provisioningSha256 = hashBytes(f.provisioningBytes);
  f.authority.provisioningSha256 = f.configuration.provisioningSha256;
  f.authorityBytes = bytes(f.authority); f.input['authority-sha256'] = hashBytes(f.authorityBytes);
  f.configuration.operations[0].authoritySha256 = f.input['authority-sha256'];
  return f;
}
function checkNoBackupInputs(f) {
  return validateNoBackupRuntimeInputs(f.descriptors, f.input, f.packet, f.configuration, bytes(f.descriptors), f.inputBytes, f.evidenceBytes);
}

test('v2 pure policy accepts exact forward references without archive store, key, retention or recovery resources', () => {
  const f = noBackupFixture(), before = canonicalJson(f.packet);
  assert.equal(isNoBackupWorkflow(f.configuration), true);
  assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration));
  assert.equal(assertWorkflowInvocation(f).runnerId, 42);
  assert.deepEqual(assertRuntimeEvidence(f), { authoritySha256: f.input['authority-sha256'] });
  assert.equal(checkNoBackupInputs(f), true); assert.equal(canonicalJson(f.packet), before);
  for (const field of ['artifactStoreId', 'keyId', 'retainedUntil', 'retentionPolicySha256', 'keyRecoveryProofSha256']) {
    assert.equal(Object.hasOwn(f.configuration, field), false); assert.equal(Object.hasOwn(f.provisioning, field), false);
  }
  assert.equal(f.packet.executionSupported, false); assert.equal(f.packet.customerApprovalVerified, false);
  assert.equal(f.packet.recovery.available, false);
});

test('receipt-completion invocation binds the enrolled original stage, not a new mutation action', () => {
  const f = noBackupFixture();
  f.input = { ...f.input, action: 'complete-receipt', 'authorization-id': 'none', 'reconcile-action': 'execute' };
  assert.equal(assertWorkflowInvocation(f).runnerId, 42);
  for (const target of ['none', 'complete-receipt', 'inspect', 'reopen', 'execute-recovery']) {
    assert.throws(() => assertWorkflowInvocation({ ...f, input: { ...f.input, 'reconcile-action': target } }), /operation_not_enrolled/);
  }
  const missing = structuredClone(f); missing.configuration.operations[0].actions = ['freeze'];
  assert.throws(() => assertWorkflowInvocation(missing), /operation_not_enrolled/);
  const legacy = fixture();
  legacy.input = { ...legacy.input, action: 'complete-receipt', 'authorization-id': 'none', 'reconcile-action': 'execute' };
  assert.throws(() => assertWorkflowInvocation(legacy), /operation_not_enrolled/);
});

for (const [name, change] of [
  ['foreign project', c => { c.projectRef = 'otherprojectrefaaaaaa'; }],
  ['foreign organization', c => { c.organizationId = id('9'); }],
  ['wrong recovery policy', c => { c.recoveryPolicy = 'backed-up'; }],
  ['missing journal identity', c => { delete c.journalStoreId; }],
  ['unknown mount', c => { c.mountFilesystem = 'tmpfs'; }],
  ['alternate database host', c => { c.connection.host = '127.0.0.1'; }],
  ['extra secret field', c => { c.connection.password = null; }],
  ['inverse action', c => { c.operations[0].actions.push('execute-recovery'); }],
  ['unenrolled reopening action', c => { c.operations[0].actions.push('reopen'); }],
  ['duplicate stage', c => { c.operations[0].actions.push('freeze'); }],
  ['unreviewed extra operation', c => { c.operations.push(structuredClone(c.operations[0])); }],
  ['legacy archive key', c => { c.keyId = 'invented'; }],
  ['inverse enrollment', c => { c.operations[0].recovery = {}; }],
]) test(`v2 closed configuration rejects ${name}`, () => {
  const f = noBackupFixture(); change(f.configuration);
  assert.throws(() => assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration)), /^Error: hosted_workflow_/);
});

for (const [name, change] of [
  ['different operation input', f => { f.input['operation-id'] = id('9'); }],
  ['different packet input', f => { f.input['packet-sha256'] = hash('f'); }],
  ['different descriptor input', f => { f.input['descriptors-sha256'] = hash('f'); }],
  ['different enrolled main', f => { f.configuration.operations[0].mainSha = 'f'.repeat(40); }],
  ['unenrolled reopening dispatch', f => { f.input.action = 'reopen'; }],
  ['unsupported reconciliation target', f => { f.input.action = 'reconcile'; f.input['reconcile-action'] = 'sql'; }],
  ['inverse reconciliation target', f => { f.input.action = 'reconcile'; f.input['reconcile-action'] = 'execute-recovery'; }],
  ['unenrolled forward action', f => { f.configuration.operations[0].actions = ['execute']; }],
]) test(`v2 authority envelope rejects ${name}`, () => {
  const f = noBackupFixture(); change(f); assert.throws(() => assertRuntimeEvidence(f), /^Error: hosted_workflow_/);
});

for (const [name, change] of [
  ['expired provisioning', f => { f.provisioning.validUntil = '2026-10-23T20:00:00Z'; }],
  ['wrong provisioned runner', f => { f.provisioning.runnerId = 99; }],
  ['wrong durable journal', f => { f.provisioning.journalStoreId = id('9'); }],
  ['absent independent access review', f => { delete f.provisioning.privateAccessReviewSha256; }],
  ['absent cross-run custody proof', f => { delete f.provisioning.crossRunDurabilityProofSha256; }],
  ['expired action authority', f => { f.authority.validUntil = '2026-10-23T20:00:00Z'; }],
  ['future action authority', f => { f.authority.issuedAt = '2026-10-23T20:00:01Z'; }],
  ['authority outliving provisioning', f => { f.authority.validUntil = '2026-10-26T00:00:00Z'; }],
  ['different authority packet', f => { f.authority.packetSha256 = hash('f'); }],
  ['different live consent', f => { f.authority.evidenceReferences.liveConsent.sha256 = hash('f'); }],
  ['different waiver', f => { f.authority.evidenceReferences.waiver.sha256 = hash('f'); }],
  ['absent stage authority reference', f => { delete f.authority.stageAuthorities.execute; }],
  ['unknown stage authority', f => { f.authority.stageAuthorities.reopen = hash('f'); }],
  ['boolean authority claim', f => { f.authority.verified = true; }],
]) test(`v2 policy rejects ${name} even when synthetic reference hashes are repinned`, () => {
  const f = noBackupFixture(); change(f); repinSyntheticPolicy(f);
  assert.throws(() => assertRuntimeEvidence(f), /^Error: hosted_workflow_/);
});

test('v2 retains actual raw PostgreSQL text bytes, including fractional numeric scale', () => {
  const f = noBackupFixture(); assert.equal(checkNoBackupInputs(f), true);
  f.inputBytes.zeroPlan = Buffer.from(JSON.stringify(JSON.parse(f.inputBytes.zeroPlan)));
  assert.throws(() => checkNoBackupInputs(f), /input_bytes_changed/);
  f.descriptors.inputs.zeroPlan = { sha256: hashBytes(f.inputBytes.zeroPlan), bytes: f.inputBytes.zeroPlan.length };
  f.input['descriptors-sha256'] = hashBytes(bytes(f.descriptors)); f.configuration.operations[0].descriptorsSha256 = f.input['descriptors-sha256'];
  assert.throws(() => checkNoBackupInputs(f), /database_text_changed/);
});

for (const role of NO_BACKUP_RUNTIME_INPUT_ROLES) test(`v2 ${role} bytes cannot change behind a reviewed descriptor`, () => {
  const f = noBackupFixture(); f.inputBytes[role] = Buffer.from('changed synthetic bytes');
  assert.throws(() => checkNoBackupInputs(f), /input_bytes_changed/);
});
for (const role of NO_BACKUP_EVIDENCE_ROLES) test(`v2 ${role} evidence needs the exact referenced bytes`, () => {
  const f = noBackupFixture(); f.evidenceBytes[role] = Buffer.from('changed synthetic evidence');
  assert.throws(() => checkNoBackupInputs(f), /evidence_scope_changed/);
});

for (const [name, change] of [
  ['different descriptor packet', f => { f.descriptors.packetSha256 = hash('f'); }],
  ['different descriptor operation', f => { f.descriptors.operationId = id('9'); }],
  ['legacy descriptor format', f => { f.descriptors.format = 'nestory-protected-reset-review-v1'; }],
  ['fake encrypted descriptor', f => { f.descriptors.keyId = 'invented'; }],
  ['extra backup input', f => { f.inputBytes.restoreProof = Buffer.from('invented'); }],
  ['omitted raw semantic input', f => { delete f.inputBytes.postgresSemantic; }],
  ['different enrolled packet', f => { f.configuration.operations[0].packetSha256 = hash('f'); }],
  ['different input operation', f => { f.input['operation-id'] = id('9'); }],
]) test(`v2 purpose-bound input descriptor rejects ${name}`, () => {
  const f = noBackupFixture(); change(f);
  f.input['descriptors-sha256'] = hashBytes(bytes(f.descriptors)); f.configuration.operations[0].descriptorsSha256 = f.input['descriptors-sha256'];
  assert.throws(() => checkNoBackupInputs(f), /^Error: hosted_workflow_/);
});

function noBackupHistoricalFixture() {
  const f = noBackupFixture();
  f.input = { ...f.input, action: 'reconcile', 'reconcile-action': 'execute', 'authorization-id': 'none' };
  f.now = Date.parse('2026-10-24T02:00:00Z');
  f.readAuthority = { format: 'nestory-reset-reviewed-read-authority-v1', operationId: f.packet.operation.operationId,
    packetSha256: f.packet.packetSha256, mainSha: f.packet.operation.mainSha, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    originalAuthoritySha256: f.input['authority-sha256'], actions: ['reconcile'], validUntil: '2026-10-24T03:00:00Z', provisioningSha256: f.configuration.provisioningSha256 };
  f.readAuthorityBytes = bytes(f.readAuthority); f.configuration.operations[0].reconciliation = { authoritySha256: hashBytes(f.readAuthorityBytes) };
  return f;
}

test('v2 historical evidence may use separately current read authority without reviving expired mutation authority', () => {
  const f = noBackupHistoricalFixture();
  assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration));
  assert.deepEqual(assertRuntimeEvidence(f), { authoritySha256: hashBytes(f.readAuthorityBytes) });
  assert.throws(() => assertRuntimeEvidence({ ...f, readAuthority: undefined, readAuthorityBytes: undefined }), /action_authority_unverified/);
  assert.throws(() => assertRuntimeEvidence({ ...f, input: { ...f.input, action: 'execute', 'reconcile-action': 'none', 'authorization-id': id('4') } }), /current_read_authority_required/);
  assert.equal(f.packet.executionSupported, false);
});

for (const [name, change] of [
  ['expired read authority', f => { f.now = Date.parse('2026-10-24T03:00:00Z'); }],
  ['expired original provisioning', f => { f.now = Date.parse('2026-10-26T00:00:00Z'); }],
  ['wrong original authority', f => { f.input['authority-sha256'] = hash('f'); }],
  ['write locator on historical read', f => { f.input['authorization-id'] = id('4'); }],
  ['inverse action from read receipt', f => { f.input['reconcile-action'] = 'execute-recovery'; }],
]) test(`v2 historical policy rejects ${name}`, () => {
  const f = noBackupHistoricalFixture(); change(f); assert.throws(() => assertRuntimeEvidence(f), /^Error: hosted_workflow_/);
});

test('closed invocation and protected configuration bind one exact operation', () => {
  const f = fixture();
  assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration));
  assert.equal(assertWorkflowInvocation(f).runnerId, 42);
  assert.equal(assertRuntimeEvidence({ ...f, provisioningBytes: bytes(f.provisioning), authorityBytes: bytes(f.authority) }).authoritySha256, f.input['authority-sha256']);
  validateHostedDescriptors(f.descriptors, f.input, f.packet, f.configuration, bytes(f.descriptors));
});

for (const [label, mutate] of [
  ['SQL action', a => { a[1] = 'sql'; }], ['extra module', a => a.push('--module', 'evil.mjs')],
  ['bearer instead of UUID', a => { a[11] = 'secret'; }], ['wrong option order', a => { a[0] = '--command'; }],
  ['invalid operation ID', a => { a[3] = '../escape'; }], ['reconcile action on dispatch', a => { a[13] = 'execute'; }],
]) test(`arguments reject ${label}`, () => { const f = fixture(); mutate(f.args); assert.throws(() => parseHostedWorkflowArguments(f.args), /arguments_invalid/); });

for (const [label, mutate] of [
  ['branch ref', f => { f.environment.GITHUB_REF = 'refs/heads/other'; }],
  ['different active workflow SHA', f => { f.environment.GITHUB_WORKFLOW_SHA = 'b'.repeat(40); }],
  ['branch workflow definition', f => { f.environment.GITHUB_WORKFLOW_REF = `${RESET_REPOSITORY}/${RESET_WORKFLOW_PATH}@refs/heads/other`; }],
  ['main changed', f => { f.currentMain = 'b'.repeat(40); }], ['wrong runner', f => { f.jobs.jobs[0].runner_id = 99; }],
  ['finished job', f => { f.jobs.jobs[0].status = 'completed'; }], ['unseen jobs page', f => { f.jobs.total_count = 101; }],
  ['wrong active run', f => { f.run.id = 501; }], ['changed workflow source', f => { f.workflowBytes = Buffer.from('altered'); }],
  ['wrong environment repository', f => { f.environment.GITHUB_REPOSITORY = 'other/repository'; }],
  ['unenrolled action', f => { f.configuration.operations[0].actions = ['execute']; }],
]) test(`invocation rejects ${label}`, () => { const f = fixture(); mutate(f); assert.throws(() => assertWorkflowInvocation(f), /^Error: hosted_workflow_/); });

test('private path verifies every ancestor including links and writable parents', () => {
  const observation = { requested: '/private/reset/file', resolved: '/private/reset/file', uid: 1000, kind: 'file', ancestors: [
    { path: '/', type: 'directory', uid: 0, mode: 0o755 }, { path: '/private', type: 'directory', uid: 0, mode: 0o755 },
    { path: '/private/reset', type: 'directory', uid: 1000, mode: 0o700 }, { path: '/private/reset/file', type: 'file', uid: 1000, mode: 0o600 },
  ] };
  assertPrivatePathObservation(observation);
  for (const mutate of [v => { v.resolved = '/other'; }, v => { v.ancestors[1].mode = 0o777; },
    v => { v.ancestors[2].type = 'symlink'; }, v => { v.ancestors[1].uid = 99; }, v => { v.ancestors.pop(); },
    v => { v.ancestors[3].mode = 0o644; }]) { const changed = structuredClone(observation); mutate(changed); assert.throws(() => assertPrivatePathObservation(changed), /^Error: hosted_workflow_/); }
});

test('persistent mount is separate and pinned; tmpfs/overlay/missing roots fail', () => {
  const f = fixture(), line = '42 1 8:2 / /var/lib/nestory-reset rw,relatime - ext4 /dev/fixture-persistent rw\n';
  assertPersistentMount(f.configuration, line);
  for (const bad of ['', line.replace('ext4', 'tmpfs'), line.replace('ext4', 'overlay'), line.replace('/var/lib/nestory-reset', '/'),
    line.replace('/dev/fixture-persistent', '/dev/other'), line + line]) assert.throws(() => assertPersistentMount(f.configuration, bad), /^Error: hosted_workflow_/);
});

test('protected environment must independently restrict deployment to main', () => {
  const metadata = { name: 'production-database', protection_rules: [{ type: 'branch_policy' }], deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } };
  assertProtectedEnvironment(metadata, ['main'], null);
  assert.throws(() => assertProtectedEnvironment(metadata, ['main', 'other'], null), /main_only_environment_required/);
  assert.throws(() => assertProtectedEnvironment({ ...metadata, protection_rules: [] }, ['main'], null), /environment_unprotected/);
});

test('provisioning evidence and current operation consent remain independent prerequisites', () => {
  const f = fixture();
  const evidence = { ...f, provisioningBytes: bytes(f.provisioning), authorityBytes: bytes(f.authority) };
  assertRuntimeEvidence(evidence);
  assert.throws(() => assertRuntimeEvidence({ ...evidence, now: Date.parse('2026-10-25T02:00:00Z') }), /provisioning_unverified/);
  assert.throws(() => assertRuntimeEvidence({ ...evidence, now: Date.parse('2026-10-24T02:00:00Z') }), /action_authority_unverified/);
  assert.throws(() => assertRuntimeEvidence({ ...evidence, authorityBytes: Buffer.from('changed') }), /evidence_digest_changed/);
});

test('ciphertext identity is never substituted with plaintext digest', () => {
  const f = fixture();
  validateHostedDescriptors(f.descriptors, f.input, f.packet, f.configuration, bytes(f.descriptors));
  f.descriptors.archive.ciphertextSha256 = f.descriptors.archive.plaintextSha256;
  const input = { ...f.input, 'descriptors-sha256': hashBytes(bytes(f.descriptors)) };
  assert.throws(() => validateHostedDescriptors(f.descriptors, input, f.packet, f.configuration, bytes(f.descriptors)), /descriptor_scope_changed/);
});

test('workflow descriptors interoperate with actual AES envelopes and committed artifact reads', async () => {
  const f = fixture(), values = new Map();
  const provider = createEncryptedArtifactProvider({ store: {
    async read(key) { return values.has(key) ? Buffer.from(values.get(key)) : null; },
    async putIfAbsent(key, value) { if (values.has(key)) return 'exists'; values.set(key, Buffer.from(value)); return 'created'; },
  }, keyProvider: { async resolveKey() { return createSecretKey(Buffer.alloc(32, 0x4f)); } } });
  const descriptors = {}, envelopes = {};
  for (const role of REQUIRED_ARTIFACTS) {
    const binding = f.descriptors[role].binding;
    const prepared = await provider.prepare({ binding, keyId: f.configuration.keyId, plaintext: bytes({ syntheticOnly: true, role }) });
    descriptors[role] = prepared.descriptor; envelopes[role] = prepared.sealedBytes;
    await provider.putPrepared({ slot: artifactSlot(binding), prepared });
  }
  const review = structuredClone(f.review);
  review.artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, descriptors[role].ciphertextSha256]));
  const packet = prepareOperatorPacket({ review, sources: f.sources, artifacts: envelopes, candidateHead: review.operation.mainSha });
  const input = { ...f.input, 'descriptors-sha256': hashBytes(bytes(descriptors)) };
  validateHostedDescriptors(descriptors, input, packet, f.configuration, bytes(descriptors));
  const reader = createBoundArtifactReader({ provider, packet, descriptors, verifyRecoveryAuthority() { throw Error('fixture has no runtime authority'); } });
  assert.deepEqual(JSON.parse(Buffer.from(await reader.read('manifest')).toString('utf8')), { syntheticOnly: true, role: 'manifest' });
  assert.notEqual(descriptors.manifest.plaintextSha256, packet.artifacts.manifest.sha256);
});

test('workflow keeps protected writer separate and verifies checkout before private inputs', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pilot-financial-reset.yml', import.meta.url), 'utf8');
  assert.match(workflow, /environment: production-database/);
  assert.match(workflow, /group: production-supabase\s+cancel-in-progress: false/);
  assert.match(workflow, /clean: true/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github\.workflow_sha == github\.sha/);
  assert.ok(workflow.indexOf('Verify clean tracked runtime before private inputs') < workflow.indexOf('PILOT_RESET_ENCRYPTION_KEY:'));
  assert.doesNotMatch(workflow, /supabase db push|upload-artifact|npm install|npm ci|curl .*\|/);
  assert.ok(workflow.includes('scripts/pilot-finance-reset-hosted-actor.mjs'));
});

test('incomplete pipeline refuses mutation before platform/configuration/key access', () => {
  const f = fixture();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./pilot-finance-reset-hosted-runner.mjs', import.meta.url)), ...f.args],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr.trim()), { status: 'stopped', code: 'hosted_transport_integration_incomplete',
    automaticRetryAllowed: false, preserveOriginalIntent: true });
});

test('source pins cover the complete actual runner import graph before private inputs', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)), visited = new Set();
  async function walk(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const source = await readFile(path.join(root, name), 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)) {
      await walk(path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1])));
    }
  }
  await walk('scripts/pilot-finance-reset-hosted-runner.mjs');
  await walk('scripts/pilot-finance-reset-hosted-reconcile.mjs');
  assert.deepEqual([...HOSTED_RUNTIME_SOURCE_FILES].filter(name => name !== RESET_WORKFLOW_PATH).sort(), [...visited].sort());
  const workflow = await readFile(path.join(root, RESET_WORKFLOW_PATH), 'utf8');
  const cleanRuntime = workflow.slice(workflow.indexOf('git ls-files --error-unmatch'), workflow.indexOf('>/dev/null'));
  for (const name of HOSTED_RUNTIME_SOURCE_FILES) assert.ok(cleanRuntime.includes(name), `untracked runtime dependency: ${name}`);
  const packet = { sourceFiles: HOSTED_RUNTIME_SOURCE_FILES.map(name => ({ path: name, sha256: hash('1') })) };
  assertHostedSourceCoverage(packet);
  for (const name of HOSTED_RUNTIME_SOURCE_FILES) assert.throws(() => assertHostedSourceCoverage({ sourceFiles: packet.sourceFiles.filter(file => file.path !== name) }), /source_coverage_missing/);
});

function recoveryFixture() {
  const f = fixture();
  f.input = { ...f.input, action: 'prepare-recovery' };
  f.configuration.operations[0].actions.push('prepare-recovery', 'execute-recovery');
  const expected = { restoreOperationId: id('6'), originalOperationId: f.packet.operation.operationId,
    projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, mainSha: f.packet.operation.mainSha,
    sourcesSha256: f.packet.sourcesSha256, reportCheckpointSha256: hash('a'), postSourceSha256: hash('b'),
    recoverySourcesSha256: hash('c'), phaseBindingSha256: hash('d'), actionMappingSha256: hash('e'), executionBusinessDate: '2026-10-24' };
  const descriptor = { keyId: f.configuration.keyId, ciphertextSha256: hash('f'), binding: {
    operationId: expected.restoreOperationId, projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION,
    mainSha: expected.mainSha, sourceSnapshotSha256: expected.postSourceSha256, sourcesSha256: expected.sourcesSha256, role: 'recoveryPlan' } };
  const authority = { format: 'nestory-reset-reviewed-recovery-authority-v1', originalOperationId: expected.originalOperationId,
    restoreOperationId: expected.restoreOperationId, originalPacketSha256: f.packet.packetSha256, mainSha: expected.mainSha,
    projectRef: RESET_PROJECT, organizationId: RESET_ORGANIZATION, actions: ['prepare-recovery', 'execute-recovery'],
    validUntil: '2026-10-24T01:00:00Z', expectedSha256: hashBytes(bytes(expected)), descriptorSha256: hashBytes(bytes(descriptor)),
    artifactSha256: descriptor.ciphertextSha256, liveConsentSha256: hash('1'), containmentProofSha256: hash('2'),
    restoreProofSha256: hash('3'), storageProofSha256: hash('4'), provisioningSha256: f.configuration.provisioningSha256 };
  f.configuration.operations[0].recovery = { operationId: expected.restoreOperationId, expectedSha256: authority.expectedSha256,
    descriptorSha256: authority.descriptorSha256, authoritySha256: hashBytes(bytes(authority)) };
  return { ...f, expected, descriptor, authority, expectedBytes: bytes(expected), descriptorBytes: bytes(descriptor), authorityBytes: bytes(authority) };
}

test('inverse authority separately pins post-reset checkpoint and new artifact without replacing original dates or consent', () => {
  const f = recoveryFixture(), original = canonicalJson(f.packet);
  assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration));
  assert.deepEqual(assertSupplementalRecoveryEvidence(f), { authoritySha256: f.configuration.operations[0].recovery.authoritySha256 });
  assert.equal(requiresSupplementalRecovery({ action: 'reconcile', 'reconcile-action': 'execute-recovery' }), true);
  assert.equal(requiresSupplementalRecovery({ action: 'reconcile', 'reconcile-action': 'execute' }), false);
  assert.equal(canonicalJson(f.packet), original);
  assert.equal(f.packet.operation.issueDate, '2026-10-01');
  assert.equal(f.packet.operation.executionBusinessDate, '2026-10-24');
});

for (const [label, mutate] of [
  ['absent enrollment', f => { delete f.configuration.operations[0].recovery; }],
  ['changed expected document', f => { f.expectedBytes = bytes({ ...f.expected, postSourceSha256: hash('1') }); }],
  ['original source substituted for post source', f => { f.descriptor.binding.sourceSnapshotSha256 = f.packet.sourceSnapshotSha256; }],
  ['wrong organization', f => { f.expected.organizationId = id('3'); }],
  ['wrong original packet', f => { f.authority.originalPacketSha256 = hash('6'); }],
  ['expired authority', f => { f.now = Date.parse('2026-10-24T01:00:00Z'); }],
  ['unenrolled inverse action', f => { f.configuration.operations[0].actions = ['execute']; }],
  ['incomplete inverse actions', f => { f.authority.actions = ['prepare-recovery']; }],
  ['wrong artifact', f => { f.authority.artifactSha256 = hash('a'); }],
  ['missing independent proof', f => { delete f.authority.restoreProofSha256; }],
  ['authority outlives storage', f => { f.authority.validUntil = '2027-10-24T00:00:00Z'; }],
]) test(`inverse execution rejects ${label}`, () => { const f = recoveryFixture(); mutate(f); assert.throws(() => assertSupplementalRecoveryEvidence(f), /^Error: hosted_workflow_recovery_/); });

function historicalReadFixture() {
  const f = fixture();
  f.input = { ...f.input, action: 'reconcile', 'reconcile-action': 'execute', 'authorization-id': 'none' };
  f.now = Date.parse('2026-10-24T02:00:00Z');
  const readAuthority = { format: 'nestory-reset-reviewed-read-authority-v1', operationId: f.packet.operation.operationId,
    packetSha256: f.packet.packetSha256, mainSha: f.packet.operation.mainSha, projectRef: RESET_PROJECT,
    organizationId: RESET_ORGANIZATION, originalAuthoritySha256: f.input['authority-sha256'], actions: ['reconcile'],
    validUntil: '2026-10-24T03:00:00Z', provisioningSha256: f.configuration.provisioningSha256 };
  const readAuthorityBytes = bytes(readAuthority);
  f.configuration.operations[0].reconciliation = { authoritySha256: hashBytes(readAuthorityBytes) };
  return { ...f, readAuthority, readAuthorityBytes, authorityBytes: bytes(f.authority), provisioningBytes: bytes(f.provisioning) };
}

test('fresh read-only authority can inspect expired execution consent without authorizing any dispatch', () => {
  const f = historicalReadFixture();
  assertHostedConfiguration(f.configuration, hashBytes(bytes(f.configuration)), bytes(f.configuration));
  assert.deepEqual(assertHistoricalReadAuthority(f), { authoritySha256: hashBytes(f.readAuthorityBytes) });
  assert.deepEqual(assertRuntimeEvidence(f), { authoritySha256: hashBytes(f.readAuthorityBytes) });
  assert.throws(() => assertRuntimeEvidence({ ...f, readAuthority: undefined, readAuthorityBytes: undefined }), /action_authority_unverified/);
  const mutation = { ...f, input: { ...f.input, action: 'execute', 'authorization-id': id('4'), 'reconcile-action': 'none' } };
  assert.throws(() => assertRuntimeEvidence(mutation), /current_read_authority_required/);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./pilot-finance-reset-hosted-reconcile.mjs', import.meta.url)), ...f.args],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr.trim()).code, 'hosted_workflow_historical_read_only');
});

for (const [label, mutate] of [
  ['missing enrollment', f => { delete f.configuration.operations[0].reconciliation; }],
  ['old read permission', f => { f.now = Date.parse('2026-10-24T03:00:00Z'); }],
  ['wrong original packet', f => { f.readAuthority.packetSha256 = hash('9'); }],
  ['wrong input packet', f => { f.input['packet-sha256'] = hash('9'); }],
  ['wrong operation', f => { f.input['operation-id'] = id('8'); }],
  ['write authorization token', f => { f.input['authorization-id'] = id('4'); }],
  ['wrong original consent', f => { f.readAuthority.originalAuthoritySha256 = hash('9'); }],
  ['outlives provider authority', f => { f.readAuthority.validUntil = '2027-10-24T00:00:00Z'; }],
]) test(`historical read rejects ${label}`, () => {
  const f = historicalReadFixture(); mutate(f);
  assert.throws(() => assertHistoricalReadAuthority(f), /current_read_authority_required/);
});

test('historical reads and inverse writes still require unchanged current provisioning', () => {
  const f = historicalReadFixture();
  f.configuration.provisioningSha256 = hash('e');
  assert.throws(() => assertRuntimeEvidence(f), /current_read_authority_required/);
  const inverse = recoveryFixture();
  const originalAuthority = { ...fixture().authority, actions: [...inverse.configuration.operations[0].actions] };
  const authorityBytes = bytes(originalAuthority), originalDigest = hashBytes(authorityBytes);
  inverse.input['authority-sha256'] = originalDigest;
  inverse.configuration.operations[0].authoritySha256 = originalDigest;
  const checked = { ...inverse, authority: originalAuthority, authorityBytes, provisioningBytes: bytes(inverse.provisioning) };
  assert.deepEqual(assertRuntimeEvidence(checked), { authoritySha256: originalDigest });
  // The denied relaxation is not present: even independently approved inverse
  // writes keep the original execution expiry gate until separately resolved.
  assert.throws(() => assertRuntimeEvidence({ ...checked, now: Date.parse('2026-10-24T02:00:00Z') }), /hosted_workflow_action_authority_unverified/);
});
