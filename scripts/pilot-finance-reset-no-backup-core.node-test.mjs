import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes, assertOperatorPacket, prepareOperatorPacket, REQUIRED_ARTIFACTS,
  SOURCE_ENTRYPOINTS } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION, NO_BACKUP_DATABASE_FIELDS,
  NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_HOSTED_BINDING_FIELDS, NO_BACKUP_VERIFICATION_BLOCKERS,
  NO_BACKUP_RECOVERY, prepareNoBackupPacket, assertNoBackupPacket, verifyNoBackupSourceContents,
  hostedNoBackupBinding, assertNoBackupHostedBinding, assertNoBackupAction } from './pilot-finance-reset-no-backup-core.mjs';

const d = value => value.repeat(64);
const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const hashJson = value => hashBytes(canonicalJson(value));
const sourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name =>
  [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const sources = Object.entries(sourceContents).map(([name, content]) => ({ path: name, sha256: hashSourceBytes(content) }));

function semanticFixture() {
  return { version: 3, actor_id: id(3), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(10), term_id: id(11), billing_rule_id: id(12), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', due_date: '2026-10-07' },
      { lease_id: id(20), term_id: id(21), billing_rule_id: id(22), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '0.00', management_fee_amount: '0.00', currency: 'USD', recipient_person_id: id(23), collection_route: 'direct_to_owner', due_date: '2026-10-07' },
      { lease_id: id(30), term_id: id(31), billing_rule_id: id(32), disposition: 'defer-expired-unbilled', reason: 'renewal-unconfirmed', source_sha256: d('9') },
    ], original_invoice_sources: [{ lease_id: id(10), invoice_id: id(40), row_sha256: d('8') }] };
}

// These are synthetic reference bytes and a synthetic DB-text witness. Tests
// prove binding behavior, never customer consent, PostgreSQL truth, or readiness.
function fixture(continuation = semanticFixture()) {
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, Buffer.from(`synthetic-only ${role}`)]));
  const postgresSemanticText = JSON.stringify(continuation, null, 1);
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(1), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01',
      dueDate: '2026-10-07', executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: d('b'), ledgerSha256: d('c'), sourceSnapshotSha256: d('d'), foreignSnapshotSha256: d('e'), archiveRows: 5, actionCount: 4,
    databaseBinding: { manifestSha256: d('1'), planSha256: d('2'), archiveSha256: d('3'), actionSha256: d('4'),
      zeroReviewSha256: d('5'), continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: d('7') },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  return { input: { review, sources: structuredClone(sources), sourceContents: { ...sourceContents }, evidence,
    candidateHead: review.operation.mainSha, observedBusinessDate: review.operation.executionBusinessDate }, continuation, postgresSemanticText };
}

function prepared() {
  const f = fixture();
  return { ...f, packet: prepareNoBackupPacket(f.input) };
}
function rehash(packet) {
  const body = { ...packet }; delete body.packetSha256;
  packet.packetSha256 = hashJson(body);
  return packet;
}

test('complete references produce a truthful blocked no-backup packet, without payloads or authority', () => {
  const { packet } = prepared();
  assert.equal(assertNoBackupPacket(packet), packet);
  assert.equal(packet.executionSupported, false);
  assert.equal(packet.customerApprovalVerified, false);
  assert.deepEqual(packet.evidenceBlockers, []);
  assert.deepEqual(packet.verificationBlockers, NO_BACKUP_VERIFICATION_BLOCKERS);
  assert.deepEqual(packet.recovery, NO_BACKUP_RECOVERY);
  assert.equal(packet.databaseBinding.archiveSha256, d('3'));
  assert.equal(Object.hasOwn(packet, 'artifacts'), false);
  assert.equal(JSON.stringify(packet).includes('synthetic-only'), false);
  assert.equal(verifyNoBackupSourceContents(packet, sourceContents), true);
});

test('missing consent and waiver are preserved as blockers, never inferred from the selected policy', () => {
  const { input } = fixture();
  for (const role of NO_BACKUP_EVIDENCE_ROLES) { input.review.evidenceReferences[role] = null; delete input.evidence[role]; }
  const packet = prepareNoBackupPacket(input);
  assertNoBackupPacket(packet);
  assert.deepEqual(packet.evidenceBlockers, NO_BACKUP_EVIDENCE_ROLES.map(role => `missing_${role}`));
  assert.equal(packet.executionSupported, false);
  assert.equal(packet.customerApprovalVerified, false);
});

for (const role of NO_BACKUP_EVIDENCE_ROLES) test(`reference ${role} requires exact reviewed bytes`, () => {
  const { input } = fixture(); input.evidence[role] = Buffer.from('changed');
  assert.throws(() => prepareNoBackupPacket(input), /evidence_digest_mismatch/);
});

test('unexpected backup artifacts and unreviewed evidence are rejected', () => {
  const f = fixture();
  f.input.evidence.archive = Buffer.from('invented backup');
  assert.throws(() => prepareNoBackupPacket(f.input), /evidence_roles_invalid/);
  delete f.input.evidence.archive;
  f.input.review.evidenceReferences.waiver = null;
  assert.throws(() => prepareNoBackupPacket(f.input), /unreviewed_evidence/);
  f.input.review.artifacts = { archive: null };
  assert.throws(() => prepareNoBackupPacket(f.input), /review_invalid/);
  assert.throws(() => prepareNoBackupPacket({ ...fixture().input, artifacts: {} }), /preparation_input_invalid/);
});

for (const [name, field, value] of [
  ['other tenant', 'organizationId', id(999)], ['other project', 'projectRef', 'q'.repeat(20)], ['inverse', 'kind', 'restore'],
  ['restore linkage', 'restoreOf', id(99)], ['short main SHA', 'mainSha', 'a'.repeat(7)], ['coerced main SHA', 'mainSha', ['a'.repeat(40)]],
  ['negative generation', 'sourceGeneration', -1], ['generation overflow', 'sourceGeneration', 2147483647], ['skipped generation', 'targetGeneration', 2],
  ['changed cutoff', 'cutoff', '2026-10-02'], ['changed invoice date', 'issueDate', '2026-10-24'], ['changed due date', 'dueDate', '2026-10-08'],
  ['execution outside October', 'executionBusinessDate', '2026-11-01'], ['coerced business date', 'executionBusinessDate', ['2026-10-24']],
  ['legacy date policy', 'invoiceDatePolicy', 'execution-business-date'], ['changed timezone', 'timezone', 'UTC'],
]) test(`operation rejects ${name}`, () => {
  const { input } = fixture(); input.review.operation[field] = value;
  assert.throws(() => prepareNoBackupPacket(input), /operation_scope_invalid/);
});

test('preparation requires the same main SHA and observed business date', () => {
  const { input } = fixture(); input.candidateHead = 'f'.repeat(40);
  assert.throws(() => prepareNoBackupPacket(input), /checkout_changed/);
  input.candidateHead = input.review.operation.mainSha; input.observedBusinessDate = '2026-10-25';
  assert.throws(() => prepareNoBackupPacket(input), /business_date_changed/);
});

test('all database and foreign/schema/ledger witnesses are mandatory typed hashes', () => {
  for (const field of NO_BACKUP_DATABASE_FIELDS) for (const value of [null, d('A'), [d('a')], 'a'.repeat(63)]) {
    const { input } = fixture(); input.review.databaseBinding[field] = value;
    assert.throws(() => prepareNoBackupPacket(input), /database_witness_invalid/);
  }
  for (const field of ['schemaSha256', 'ledgerSha256', 'sourceSnapshotSha256', 'foreignSnapshotSha256']) {
    const { input } = fixture(); input.review[field] = null;
    assert.throws(() => prepareNoBackupPacket(input), /database_witness_invalid/);
  }
  for (const field of ['archiveRows', 'actionCount']) for (const value of [0, -1, 1.5, '4', Number.MAX_SAFE_INTEGER + 1]) {
    const { input } = fixture(); input.review[field] = value;
    assert.throws(() => prepareNoBackupPacket(input), /database_witness_invalid/);
  }
});

test('every known runner, phase, and reopening source is required', () => {
  for (const name of NO_BACKUP_REQUIRED_SOURCE_FILES) {
    const { input } = fixture(); input.sources = input.sources.filter(source => source.path !== name);
    assert.throws(() => prepareNoBackupPacket(input), /source_coverage_incomplete/, name);
  }
});

test('known runtime import closure is fully pinned', () => {
  const names = new Set(NO_BACKUP_REQUIRED_SOURCE_FILES);
  for (const [name, content] of Object.entries(sourceContents).filter(([name]) => name.endsWith('.mjs'))) {
    for (const match of content.toString('utf8').matchAll(/^import\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
      assert.ok(names.has(dependency), `${name} imports unpinned ${dependency}`);
    }
  }
});

test('source aliases, duplicate paths, unknown helpers, missing bytes and changed bytes fail closed', () => {
  for (const value of ['../secrets', 'scripts\\pilot-finance-reset-no-backup-core.mjs', 'scripts/unknown-adapter.mjs']) {
    const { input } = fixture(); input.sources.push({ path: value, sha256: d('a') });
    assert.throws(() => prepareNoBackupPacket(input), /source_descriptor_invalid/);
  }
  const { input } = fixture(); input.sources.push(input.sources[0]);
  assert.throws(() => prepareNoBackupPacket(input), /source_descriptor_invalid/);
  input.sources.pop(); delete input.sourceContents[input.sources[0].path];
  assert.throws(() => prepareNoBackupPacket(input), /source_bytes_incomplete/);
  input.sourceContents[input.sources[0].path] = Buffer.from('changed');
  assert.throws(() => prepareNoBackupPacket(input), /source_bytes_changed/);
});

test('source hashes normalize CRLF while evidence hashes remain byte-exact', () => {
  const f = fixture();
  f.input.sourceContents = Object.fromEntries(Object.entries(sourceContents).map(([name, content]) =>
    [name, Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'))]));
  assertNoBackupPacket(prepareNoBackupPacket(f.input));
  f.input.evidence.liveConsent = Buffer.from('synthetic-only liveConsent\r\n');
  assert.throws(() => prepareNoBackupPacket(f.input), /evidence_digest_mismatch/);
});

test('new additive migration bytes may be pinned, but no extra unpinned content is accepted', () => {
  const { input } = fixture(), name = 'supabase/migrations/20261024030000_synthetic_only.sql';
  const content = Buffer.from('-- synthetic source-contract test only\n');
  input.sources.push({ path: name, sha256: hashSourceBytes(content) }); input.sourceContents[name] = content;
  const packet = prepareNoBackupPacket(input);
  assertNoBackupPacket(packet);
  assert.equal(verifyNoBackupSourceContents(packet, input.sourceContents), true);
  input.sourceContents['scripts/unreviewed.mjs'] = Buffer.from('// extra');
  assert.throws(() => verifyNoBackupSourceContents(packet, input.sourceContents), /source_bytes_incomplete/);
});

test('packet rehashing cannot remove holds, fake backup proof, or silently change the original review', () => {
  for (const change of [p => { p.executionSupported = true; }, p => { p.customerApprovalVerified = true; },
    p => { p.verificationBlockers = []; }, p => { p.recovery.available = true; }, p => { p.recoveryPolicy = 'backed-up'; },
    p => { p.artifacts = { archive: { sha256: d('a'), bytes: 1 } }; }, p => { p.operation.restoreOf = id(8); },
    p => { p.writer.cancelInProgress = true; }, p => { p.endState = 'open'; }, p => { p.sourceFiles.reverse(); },
    p => { p.databaseBinding.archiveSha256 = d('f'); }, p => { p.evidenceReferences.liveConsent.sha256 = d('f'); }]) {
    const { packet } = prepared(); change(packet); rehash(packet);
    assert.throws(() => assertNoBackupPacket(packet));
  }
  const { input } = fixture(); input.review.evidenceReferences.liveConsent = null; delete input.evidence.liveConsent;
  const packet = prepareNoBackupPacket(input); packet.evidenceBlockers = []; rehash(packet);
  assert.throws(() => assertNoBackupPacket(packet), /evidence_blockers_changed/);
});

test('v2 preserves accounting/security fields and explicitly has no external archive digest', () => {
  const { packet, continuation, postgresSemanticText } = prepared();
  const binding = hostedNoBackupBinding(packet, continuation, postgresSemanticText);
  assert.deepEqual(Object.keys(binding).sort(), [...NO_BACKUP_HOSTED_BINDING_FIELDS].sort());
  assert.equal(assertNoBackupHostedBinding(packet, binding, postgresSemanticText), binding);
  assert.equal(binding.version, 2); assert.equal(binding.recovery_policy, NO_BACKUP_POLICY);
  assert.equal(binding.archive_artifact_sha256, null); assert.equal(binding.archive_sha256, packet.databaseBinding.archiveSha256);
  assert.equal(binding.foreign_snapshot_sha256, packet.foreignSnapshotSha256);
  assert.equal(Object.hasOwn(binding, 'recovery'), false);
  assert.notEqual(hashJson(continuation), packet.databaseBinding.continuationSemanticSha256);
  assert.equal(binding.continuation_semantic_sha256, hashBytes(postgresSemanticText));
});

test('semantic input requires the exact database-text witness, not a JavaScript reserialization', () => {
  const { packet, continuation, postgresSemanticText } = prepared();
  assert.throws(() => hostedNoBackupBinding(packet, continuation), /semantic_bytes_mismatch/);
  assert.throws(() => hostedNoBackupBinding(packet, continuation, canonicalJson(continuation)), /semantic_bytes_mismatch/);
  continuation.actor_id = id(99);
  assert.throws(() => hostedNoBackupBinding(packet, continuation, postgresSemanticText), /semantic_scope_invalid/);
});

for (const [name, change] of [
  ['legacy semantic', c => { c.version = 2; }], ['renewal', c => { c.leases[0].continue_month_to_month = true; }],
  ['changed due date', c => { c.leases[0].due_date = '2026-10-08'; }], ['changed business date', c => { c.execution_business_date = '2026-10-25'; }],
  ['duplicate lease', c => { c.leases.push({ ...c.leases[0] }); }], ['missing original source', c => { c.original_invoice_sources = []; }],
  ['duplicate invoice source', c => { c.original_invoice_sources.push({ ...c.original_invoice_sources[0] }); }],
  ['deferred lease billed through source', c => { c.original_invoice_sources[0].lease_id = id(30); }],
  ['unreviewed deferral reason', c => { c.leases[2].reason = 'skip-anything'; }],
  ['hidden source mutation', c => { c.source_sha256 = d('a'); }],
]) test(`v3 semantic rejects ${name} even with a matching text hash`, () => {
  const c = semanticFixture(); change(c);
  const { input, continuation, postgresSemanticText } = fixture(c), packet = prepareNoBackupPacket(input);
  assert.throws(() => hostedNoBackupBinding(packet, continuation, postgresSemanticText));
});

test('binding rejects v1, recovery members, invented artifact digests and foreign/source drift', () => {
  const { packet, continuation, postgresSemanticText } = prepared();
  for (const change of [b => { b.version = 1; }, b => { b.recovery = {}; }, b => { b.archive_artifact_sha256 = d('3'); },
    b => { delete b.archive_artifact_sha256; }, b => { b.foreign_snapshot_sha256 = d('f'); },
    b => { b.source_snapshot_sha256 = d('f'); }, b => { b.action_count++; }, b => { b.recovery_policy = 'optional'; }]) {
    const binding = hostedNoBackupBinding(packet, continuation, postgresSemanticText); change(binding);
    assert.throws(() => assertNoBackupHostedBinding(packet, binding, postgresSemanticText), /hosted_binding_invalid/);
  }
});

test('backup, export and inverse actions cannot be requested through the new mode', () => {
  for (const action of ['backup', 'export', 'restore', 'prepare-recovery', 'execute-recovery', 'reset-all', null])
    assert.throws(() => assertNoBackupAction(action), /action_unsupported/);
  for (const action of ['inspect', 'reconcile', 'freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'reopen']) assert.equal(assertNoBackupAction(action), action);
});

test('legacy backed-up packet validation remains separate and unchanged', () => {
  const { packet } = prepared();
  assert.throws(() => assertOperatorPacket(packet), /operator_packet_invalid/);
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, Buffer.from(`synthetic-only old ${role}`)]));
  const operation = { operationId: id(90), projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, mainSha: 'b'.repeat(40),
    sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-24', timezone: 'Asia/Phnom_Penh' };
  const review = { format: 'nestory-protected-reset-review-v1', operation, schemaSha256: d('a'), ledgerSha256: d('b'), sourceSnapshotSha256: d('c'),
    archiveRows: 1, actionCount: 1, databaseBinding: structuredClone(packet.databaseBinding),
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(role => [role, hashBytes(artifacts[role])])) };
  const legacy = prepareOperatorPacket({ review, artifacts, candidateHead: operation.mainSha,
    sources: [...SOURCE_ENTRYPOINTS, 'supabase/migrations/20261024030000_synthetic_only.sql'].map(name => ({ path: name, sha256: d('a') })) });
  assertOperatorPacket(legacy);
  assert.throws(() => assertNoBackupPacket(legacy), /packet_shape_invalid/);
});
