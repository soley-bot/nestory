import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { IMPLEMENTATION_BLOCKERS, REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashBytes, hashSourceBytes,
  prepareOperatorPacket, assertOperatorPacket, reconcileOperatorState, operationBusinessDate, operationInvoiceDatePolicy } from './pilot-finance-reset-operator-core.mjs';

const hash = letter => letter.repeat(64);
const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
function fixture() {
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, Buffer.from(`synthetic-only ${role}`)]));
  const review = {
    format: 'nestory-protected-reset-review-v1',
    operation: { operationId: id('1'), projectRef: 'abcdefghijklmnopqrst', organizationId: id('2'), mainSha: 'a'.repeat(40),
      sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-23', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: hash('b'), ledgerSha256: hash('c'), sourceSnapshotSha256: hash('d'), archiveRows: 5, actionCount: 4,
    databaseBinding: { manifestSha256: hash('1'), planSha256: hash('2'), archiveSha256: hash('3'), actionSha256: hash('4'),
      zeroReviewSha256: hash('5'), continuationSemanticSha256: hash('6'), reportReviewSha256: hash('7') },
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, hashBytes(artifacts[role])])),
  };
  const sources = [...SOURCE_ENTRYPOINTS, 'supabase/migrations/20261023154356_synthetic_only.sql']
    .map(source => ({ path: source, sha256: hash('e') }));
  return { review, sources, artifacts, candidateHead: review.operation.mainSha };
}
const packet = () => prepareOperatorPacket(fixture());
function observed(prepared, status = null) {
  const observation = {
    operation: structuredClone(prepared.operation), packetSha256: prepared.packetSha256,
    currentMainSha: prepared.operation.mainSha, sourcesSha256: prepared.sourcesSha256, schemaSha256: prepared.schemaSha256,
    ledgerSha256: prepared.ledgerSha256, businessDate: prepared.operation.issueDate,
    control: { status: 'frozen', generation: prepared.operation.targetGeneration, cutoff: prepared.operation.cutoff },
    durable: null, checkpoint: null, approvals: null, contained: true,
    writerLease: { environment: 'production-database', group: 'production-supabase', cancelInProgress: false, held: true },
  };
  if (status === null) return observation;
  observation.checkpoint = {
    operationId: prepared.operation.operationId, sourceSha256: prepared.sourceSnapshotSha256,
    archiveSha256: prepared.databaseBinding.archiveSha256, archiveArtifactSha256: prepared.artifacts.archive.sha256,
    restoreProofSha256: prepared.artifacts.restoreProof.sha256, storageProofSha256: prepared.artifacts.storageProof.sha256,
    contained: true, isolatedRestoreVerified: true, encryptedRetentionVerified: true, foreignOrganizationsPreserved: true,
  };
  observation.durable = {
    operationId: prepared.operation.operationId, packetSha256: prepared.packetSha256,
    manifestSha256: prepared.databaseBinding.manifestSha256, planSha256: prepared.databaseBinding.planSha256,
    actionSha256: prepared.databaseBinding.actionSha256, archiveSha256: prepared.databaseBinding.archiveSha256,
    archiveRows: prepared.archiveRows, actionCount: prepared.actionCount, appliedCount: 0, status, finalCheckpoint: null,
  };
  observation.approvals = {
    operationId: prepared.operation.operationId, zeroReviewSha256: prepared.databaseBinding.zeroReviewSha256,
    continuationSemanticSha256: prepared.databaseBinding.continuationSemanticSha256,
    reportReviewSha256: prepared.databaseBinding.reportReviewSha256, liveConsentSha256: prepared.artifacts.liveConsent.sha256,
    makerActorId: id('3'), reviewerActorId: id('4'), continuationActorId: id('3'),
    independentAuthenticatedApprovals: true, continuationContextVerified: true,
  };
  if (status === 'actions_complete') {
    observation.durable.appliedCount = prepared.actionCount;
    observation.durable.finalCheckpoint = { status: 'complete', kind: 'checked-reports', sha256: hash('e'), generation: prepared.operation.targetGeneration,
      cutoff: prepared.operation.cutoff, sourceSha256: hash('f'), currentSourceSha256: hash('f'),
      reportsVerified: true, recoverySourcesVerified: true, capabilitiesAbsent: true };
  }
  return observation;
}

test('private packet binds source files and artifact bytes without claiming hosted readiness', () => {
  const input = fixture(), prepared = prepareOperatorPacket(input);
  assertOperatorPacket(prepared);
  assert.equal(prepared.executionSupported, false);
  assert.equal(prepared.customerApprovalVerified, false);
  assert.deepEqual(prepared.implementationBlockers, IMPLEMENTATION_BLOCKERS);
  assert.equal(prepared.endState, 'verified-frozen-checkpoint');
  assert.notEqual(prepared.databaseBinding.archiveSha256, prepared.artifacts.archive.sha256);
  assert.doesNotMatch(JSON.stringify(prepared), /synthetic-only/);
  const shuffled = fixture(); shuffled.sources.reverse();
  assert.equal(prepareOperatorPacket(shuffled).packetSha256, prepared.packetSha256);
  input.review.operation.issueDate = '2026-10-24';
  assert.notEqual(prepareOperatorPacket(input).packetSha256, prepared.packetSha256);
});

test('missing live evidence is represented separately from implementation gaps', () => {
  const input = fixture(); input.review.artifacts.liveConsent = null; delete input.artifacts.liveConsent;
  const prepared = prepareOperatorPacket(input);
  assert.deepEqual(prepared.evidenceBlockers, ['missing_liveConsent']);
  const decision = reconcileOperatorState(prepared, observed(prepared));
  assert.equal(decision.next, 'blocked');
  assert.equal(decision.reason, 'operation_evidence_incomplete');
  assert.equal(decision.mutationAllowed, false);
});

test('original-date option binds actual business date without approving or selecting execution', () => {
  const input = fixture();
  Object.assign(input.review.operation, { issueDate: '2026-10-01', executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october' });
  const prepared = prepareOperatorPacket(input);
  assert.equal(operationBusinessDate(prepared.operation), '2026-10-24');
  assert.equal(operationInvoiceDatePolicy(prepared.operation), 'original-reviewed-october');
  const observation = observed(prepared);
  assert.throws(() => reconcileOperatorState(prepared, observation), /operator_observation_binding_invalid/);
  observation.businessDate = '2026-10-24';
  assert.equal(reconcileOperatorState(prepared, observation).mutationAllowed, false);
  assert.equal(prepared.customerApprovalVerified, false);
  assert.equal(prepared.executionSupported, false);
  assert.equal(operationBusinessDate(packet().operation), '2026-10-23');
  assert.equal(operationInvoiceDatePolicy(packet().operation), 'execution-business-date');
});

for (const mutate of [
  operation => { operation.executionBusinessDate = '2026-11-01'; },
  operation => { operation.issueDate = '2026-10-02'; },
  operation => { operation.invoiceDatePolicy = 'execution-business-date'; },
  operation => { delete operation.executionBusinessDate; },
  operation => { delete operation.invoiceDatePolicy; },
]) test('incomplete or inconsistent original-date policy is refused', () => {
  const input = fixture();
  Object.assign(input.review.operation, { issueDate: '2026-10-01', executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october' });
  mutate(input.review.operation);
  assert.throws(() => prepareOperatorPacket(input), /operator_(scope|invoice_date_policy)_invalid/);
});

test('source hashes are portable across Git line endings while artifact hashes are byte-exact', () => {
  const lf = Buffer.from('select 1;\n'), crlf = Buffer.from('select 1;\r\n');
  assert.equal(hashSourceBytes(lf), hashSourceBytes(crlf));
  assert.notEqual(hashSourceBytes(lf), hashSourceBytes(Buffer.from('select 2;\n')));
  assert.notEqual(hashBytes(lf), hashBytes(crlf));
  assert.throws(() => hashSourceBytes(Uint8Array.from([0xff])), /operator_source_encoding_invalid/);
});

for (const [label, mutate] of [
  ['changed artifact bytes', input => { input.artifacts.actions = Buffer.from('changed'); }],
  ['missing required exact archive', input => { input.review.artifacts.archive = null; delete input.artifacts.archive; }],
  ['different checked-out commit', input => { input.candidateHead = 'f'.repeat(40); }],
  ['unknown artifact role', input => { input.artifacts.sql = 'DELETE'; }],
  ['omitted source entrypoint', input => { input.sources.shift(); }],
  ['duplicate source path', input => { input.sources.push(input.sources[0]); }],
  ['escaping source path', input => { input.sources.push({ path: '../secret', sha256: hash('e') }); }],
  ['November billing date', input => { input.review.operation.issueDate = '2026-11-01'; }],
  ['generation rewind', input => { input.review.operation.targetGeneration = 0; }],
  ['unknown review field', input => { input.review.sql = 'select 1'; }],
]) test(`preparation refuses ${label}`, () => {
  const input = fixture(); mutate(input);
  assert.throws(() => prepareOperatorPacket(input), /^Error: operator_/);
});

test('packet cannot be made executable by changing flags or rehashing its payload', () => {
  const prepared = packet(); prepared.executionSupported = true;
  const { packetSha256: ignored, ...body } = prepared; void ignored;
  prepared.packetSha256 = hashBytes(canonicalJson(body));
  assert.throws(() => assertOperatorPacket(prepared), /operator_packet_binding_invalid/);
});

test('durable next requirements preserve freeze, recovery checkpoint and approval ordering', () => {
  const prepared = packet(), observation = observed(prepared);
  observation.control = { status: 'unenrolled', generation: 0, cutoff: null };
  assert.equal(reconcileOperatorState(prepared, observation).next, 'freeze-and-reserve-generation');
  observation.control = { status: 'frozen', generation: 1, cutoff: '2026-10-01' };
  assert.equal(reconcileOperatorState(prepared, observation).next, 'capture-frozen-recovery-checkpoint');
  observation.checkpoint = observed(prepared, 'prepared').checkpoint;
  assert.equal(reconcileOperatorState(prepared, observation).next, 'prepare-original-operation');
  assert.equal(reconcileOperatorState(prepared, observed(prepared, 'prepared')).next, 'seal-original-operation');
  const sealed = observed(prepared, 'sealed'); sealed.approvals = null;
  assert.equal(reconcileOperatorState(prepared, sealed).next, 'verify-authenticated-approvals');
  sealed.approvals = observed(prepared, 'sealed').approvals;
  const decision = reconcileOperatorState(prepared, sealed);
  assert.equal(decision.next, 'execute-original-checked-transaction');
  assert.equal(decision.mutationAllowed, false);
});

test('lost acknowledgement reconciles the original completed checkpoint without replay', () => {
  const prepared = packet(), observation = observed(prepared, 'actions_complete');
  assert.equal(reconcileOperatorState(prepared, observation).next, 'retain-frozen-checkpoint');
  observation.durable.finalCheckpoint = null;
  assert.equal(reconcileOperatorState(prepared, observation).next, 'inspect-original-operation');
  observation.durable.status = 'executing';
  assert.equal(reconcileOperatorState(prepared, observation).reason, 'commit_outcome_unresolved_never_replay_or_replace_uuid');
});

test('later normal entries prevent a completed checkpoint from being accepted', () => {
  const prepared = packet(), observation = observed(prepared, 'actions_complete');
  observation.durable.finalCheckpoint.currentSourceSha256 = hash('a');
  const decision = reconcileOperatorState(prepared, observation);
  assert.equal(decision.next, 'inspect-original-operation');
  assert.equal(decision.mutationAllowed, false);
});

test('zero-only result or missing immutable digest cannot be accepted as a report checkpoint', () => {
  const prepared = packet(), observation = observed(prepared, 'actions_complete');
  observation.durable.finalCheckpoint.kind = 'known-zero';
  assert.equal(reconcileOperatorState(prepared, observation).next, 'inspect-original-operation');
  observation.durable.finalCheckpoint.kind = 'checked-reports';
  observation.durable.finalCheckpoint.sha256 = null;
  assert.equal(reconcileOperatorState(prepared, observation).next, 'inspect-original-operation');
});

for (const [label, mutate] of [
  ['different operation UUID', value => { value.durable.operationId = id('9'); }],
  ['different archive hash', value => { value.durable.archiveSha256 = hash('e'); }],
  ['ciphertext hash substituted for database archive hash', value => { value.durable.archiveSha256 = value.checkpoint.archiveArtifactSha256; }],
  ['different main SHA', value => { value.currentMainSha = 'b'.repeat(40); }],
  ['different schema', value => { value.schemaSha256 = hash('e'); }],
  ['business date changed overnight', value => { value.businessDate = '2026-10-24'; }],
  ['uncontained workers', value => { value.contained = false; }],
  ['parallel writer', value => { value.writerLease.held = false; }],
  ['cancelable writer', value => { value.writerLease.cancelInProgress = true; }],
  ['reopened control', value => { value.control.status = 'open'; }],
  ['later generation', value => { value.control.generation = 2; }],
  ['missing isolated restore proof', value => { value.checkpoint.isolatedRestoreVerified = false; }],
  ['missing encrypted retention proof', value => { value.checkpoint.encryptedRetentionVerified = false; }],
  ['unproved foreign organization preservation', value => { value.checkpoint.foreignOrganizationsPreserved = false; }],
  ['operator supplied actor identity', value => { value.approvals.independentAuthenticatedApprovals = false; }],
  ['same maker and reviewer', value => { value.approvals.reviewerActorId = value.approvals.makerActorId; }],
  ['unverified continuation session', value => { value.approvals.continuationContextVerified = false; }],
  ['partial action commit', value => { value.durable.appliedCount = 1; }],
]) test(`durable reconciliation refuses ${label}`, () => {
  const prepared = packet(), observation = observed(prepared, 'sealed'); mutate(observation);
  assert.throws(() => reconcileOperatorState(prepared, observation), /^Error: operator_/);
});

test('offline CLI creates an exclusive private packet from a clean committed synthetic checkout', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nestory-operator-contract-'));
  const checkout = path.join(temporary, 'checkout'), privateDirectory = path.join(temporary, 'private');
  const runGit = args => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    await mkdir(checkout); await mkdir(privateDirectory);
    const input = fixture();
    for (const source of input.sources) {
      const file = path.join(checkout, source.path); await mkdir(path.dirname(file), { recursive: true });
      const own = source.path.endsWith('operator-core.mjs') || source.path.endsWith('operator-prepare.mjs');
      await writeFile(file, own ? await readFile(new URL(`../${source.path}`, import.meta.url)) : '// Synthetic source only.\n');
    }
    runGit(['init', '--quiet']); runGit(['add', '.']);
    runGit(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic operator preparation']);
    input.review.operation.mainSha = runGit(['rev-parse', 'HEAD']);
    const reviewPath = path.join(privateDirectory, 'review.json'), output = path.join(privateDirectory, 'prepared.json');
    await writeFile(reviewPath, JSON.stringify(input.review));
    for (const [role, bytes] of Object.entries(input.artifacts)) await writeFile(path.join(privateDirectory, `${role}.artifact`), bytes);
    const command = path.join(checkout, 'scripts', 'pilot-finance-reset-operator-prepare.mjs');
    const args = [command, '--review', reviewPath, '--private-artifacts', privateDirectory, '--output', output];
    const execute = extra => spawnSync(process.execPath, extra ?? args, { encoding: 'utf8', windowsHide: true });
    const success = execute(); assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(success.stdout).executionSupported, false);
    assert.doesNotMatch(success.stdout, /synthetic-only|Synthetic Test|organizationId/);
    assert.ok(!success.stdout.includes(privateDirectory));
    assertOperatorPacket(JSON.parse(await readFile(output, 'utf8')));
    assert.equal(execute().status, 1, 'a reviewed packet is never overwritten');
    const inCheckout = execute([...args.slice(0, -1), path.join(checkout, 'packet.json')]);
    assert.equal(inCheckout.status, 1); assert.match(inCheckout.stderr, /operator_private_artifacts_inside_checkout/);
    await writeFile(path.join(checkout, 'uncommitted.sql'), 'select 1;');
    const dirty = execute([...args.slice(0, -1), path.join(privateDirectory, 'next.json')]);
    assert.equal(dirty.status, 1); assert.match(dirty.stderr, /operator_clean_committed_source_required/);
    const rejected = execute([command, '--execute', '--database-url', 'sensitive-marker']);
    assert.equal(rejected.status, 1); assert.doesNotMatch(rejected.stderr, /sensitive-marker/);
  } finally {
    const expectedParent = path.resolve(os.tmpdir());
    assert.equal(path.dirname(path.resolve(temporary)), expectedParent);
    assert.ok(path.basename(temporary).startsWith('nestory-operator-contract-'));
    await rm(temporary, { recursive: true, force: true });
  }
});
