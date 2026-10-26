import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket } from './pilot-finance-reset-operator-core.mjs';
import { approvalObservationQuery } from './pilot-finance-reset-hosted-protocol.mjs';
import { createHostedApprovalReader } from './pilot-finance-reset-hosted-reader.mjs';
import { NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_REQUIRED_SOURCE_FILES,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readerSources = ['scripts/pilot-finance-reset-operator-core.mjs', 'scripts/pilot-finance-reset-no-backup-core.mjs',
  'scripts/pilot-finance-reset-hosted-protocol.mjs', 'scripts/pilot-finance-reset-hosted-reader.mjs'];
const sourceDigests = new Map(await Promise.all(readerSources.map(async name => [name, hashSourceBytes(await readFile(path.join(root, name)))])));
const noBackupSourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name => [name, await readFile(path.join(root, name))])));
const actor = '20000000-0000-4000-8000-000000000001', reviewer = '20000000-0000-4000-8000-000000000002';
const privateMarker = 'SYNTHETIC_PRIVATE_MARKER_DO_NOT_DISCLOSE';
function packetFixture() {
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, `synthetic-${name}`]));
  const review = { format: 'nestory-protected-reset-review-v1', operation: {
    operationId: '20000000-0000-4000-8000-000000000010', projectRef: 'syntheticprojectrefa', organizationId: '20000000-0000-4000-8000-000000000011',
    mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-23', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), archiveRows: 7, actionCount: 6,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256',
      'continuationSemanticSha256', 'reportReviewSha256'].map((name, i) => [name, String(i + 1).repeat(64)])),
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, hashBytes(value)])) };
  const names = [...new Set([...SOURCE_ENTRYPOINTS, ...readerSources, 'supabase/migrations/20261023161622_synthetic_reader_fixture.sql'])].sort();
  return prepareOperatorPacket({ review, artifacts, candidateHead: review.operation.mainSha,
    sources: names.map(name => ({ path: name, sha256: sourceDigests.get(name) ?? 'a'.repeat(64) })) });
}
function noBackupFixture() {
  const continuation = { version: 3, actor_id: actor, billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-23', invoice_date_policy: 'original-reviewed-october', leases: [{
      lease_id: '20000000-0000-4000-8000-000000000020', term_id: '20000000-0000-4000-8000-000000000021',
      billing_rule_id: '20000000-0000-4000-8000-000000000022', disposition: 'bill', continue_month_to_month: false,
      rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: reviewer,
      collection_route: 'through_ips', due_date: '2026-10-07' }], original_invoice_sources: [{
      lease_id: '20000000-0000-4000-8000-000000000020', invoice_id: '20000000-0000-4000-8000-000000000023', row_sha256: '8'.repeat(64) }] };
  // All returned process metadata, semantic bytes and evidence are synthetic.
  const postgresSemanticText = JSON.stringify(continuation, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, `synthetic-only ${role}`]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: '20000000-0000-4000-8000-000000000010', kind: 'reset', restoreOf: null,
      projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION, mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1,
      cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07', executionBusinessDate: '2026-10-23',
      invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), foreignSnapshotSha256: 'e'.repeat(64),
    archiveRows: 7, actionCount: 6, databaseBinding: { manifestSha256: '1'.repeat(64), planSha256: '2'.repeat(64), archiveSha256: '3'.repeat(64),
      actionSha256: '4'.repeat(64), zeroReviewSha256: '5'.repeat(64), continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: '7'.repeat(64) },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  const packet = prepareNoBackupPacket({ review, sources: Object.entries(noBackupSourceContents).map(([name, bytes]) => ({ path: name, sha256: hashSourceBytes(bytes) })),
    sourceContents: noBackupSourceContents, evidence, candidateHead: review.operation.mainSha, observedBusinessDate: review.operation.executionBusinessDate });
  return { packet, continuation, postgresSemanticText };
}
function observationFixture(packet, noBackup = null) {
  const b = packet.databaseBinding, op = packet.operation;
  return { operation: { operationId: op.operationId, organizationId: op.organizationId, kind: 'reset', restoreOf: null,
    status: 'sealed', sourceGeneration: op.sourceGeneration, targetGeneration: op.targetGeneration,
    manifestSha256: b.manifestSha256, planSha256: b.planSha256, schemaSha256: packet.schemaSha256,
    archiveSha256: b.archiveSha256, actionSha256: b.actionSha256, archiveRows: packet.archiveRows, actionCount: packet.actionCount, appliedCount: 0 },
    control: { status: 'frozen', generation: op.targetGeneration, cutoff: op.cutoff, timezone: op.timezone, businessDate: op.executionBusinessDate ?? op.issueDate },
    zeroPlan: { status: 'prepared', reviewSha256: b.zeroReviewSha256, canonicalSha256: b.zeroReviewSha256, operationId: op.operationId,
      organizationId: op.organizationId, manifestSha256: b.manifestSha256, planSha256: b.planSha256, effectiveDate: op.cutoff,
      makerActorId: actor, reviewerActorId: reviewer }, approvals: [], endorsements: [], targetEndorsements: [], capabilityCount: 0,
    ...(noBackup ? { reservation: { binding: hostedNoBackupBinding(packet, noBackup.continuation, noBackup.postgresSemanticText),
      bindingSha256: '9'.repeat(64), canonicalSha256: '9'.repeat(64), foreignSha256: packet.foreignSnapshotSha256,
      continuationSemanticText: noBackup.postgresSemanticText } } : {}) };
}
function reseal(packet) {
  packet.sourcesSha256 = hashBytes(canonicalJson(packet.sourceFiles));
  const body = { ...packet }; delete body.packetSha256;
  packet.packetSha256 = hashBytes(canonicalJson(body));
}
function harness({ response, spawnFailure, onSpawn, connectionChange, packetChange, noBackup: useNoBackup = false } = {}) {
  const noBackup = useNoBackup ? noBackupFixture() : null;
  const packet = noBackup?.packet ?? packetFixture(); packetChange?.(packet);
  const observation = observationFixture(packet, noBackup), calls = [];
  const connection = { expectedProjectRef: packet.operation.projectRef, host: `db.${packet.operation.projectRef}.supabase.co`,
    port: 5432, database: 'postgres', user: 'postgres', psqlPath: '/protected/bin/psql',
    sslRootCertPath: `/protected/${privateMarker}/root.crt`, passwordFilePath: `/protected/${privateMarker}/pgpass` };
  connectionChange?.(connection);
  const spawnProcess = (executable, args, options) => {
    const call = { executable, args, options, input: '', killed: false }; calls.push(call);
    if (spawnFailure) throw new Error(privateMarker);
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { call.killed = true; return true; };
    child.stdin = new Writable({
      write(chunk, encoding, callback) { call.input += chunk.toString(); callback(); },
      final(callback) {
        callback();
        queueMicrotask(() => {
          if (response) response({ child, call, observation });
          else { child.stdout.write(`${JSON.stringify(observation)}\n`); child.emit('close', 0, null); }
        });
      },
    });
    onSpawn?.(call);
    return child;
  };
  const reader = createHostedApprovalReader({ packet, connection, spawnProcess });
  return { packet, connection, observation, calls, reader, query: approvalObservationQuery(packet), spawnProcess };
}

test('typed no-backup packet uses the fixed TLS reader and exact registered v2 binding', async () => {
  const h = harness({ noBackup: true });
  assert.deepEqual(await h.reader(h.query), [{ financial_reset_approval_observation: h.observation }]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.env.PGHOST, `db.${NO_BACKUP_PROJECT}.supabase.co`);
  assert.equal(h.calls[0].options.env.PGSSLMODE, 'verify-full'); assert.equal(h.calls[0].options.shell, false);
  assert.match(h.calls[0].input, /financial_reset_hosted_reservations/);
  assert.match(h.calls[0].input, /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.doesNotMatch(h.calls[0].input, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|CALL)\b/i);
  assert.equal(h.observation.reservation.binding.version, 2); assert.equal(h.observation.reservation.binding.archive_artifact_sha256, null);
  assert.equal(h.packet.executionSupported, false); assert.equal(h.packet.customerApprovalVerified, false);
});

test('a v1 query descriptor cannot downgrade a v2 approval reader', async () => {
  const h = harness({ noBackup: true }), v1 = approvalObservationQuery(packetFixture());
  await assert.rejects(h.reader({ ...h.query, name: v1.name, text: v1.text }), /query_invalid/);
  assert.equal(h.calls.length, 0);
});

for (const [name, change] of [
  ['missing reservation', o => { delete o.reservation; }],
  ['foreign packet', o => { o.reservation.binding.packet_sha256 = 'f'.repeat(64); }],
  ['legacy policy', o => { o.reservation.binding.version = 1; }],
  ['different raw semantic bytes', o => { o.reservation.continuationSemanticText += '\n'; }],
]) test(`no-backup reader rejects ${name} in otherwise matching process output`, async () => {
  const h = harness({ noBackup: true, response({ child, observation }) { change(observation); child.stdout.write(JSON.stringify(observation)); child.emit('close', 0, null); } });
  await assert.rejects(h.reader(h.query), /hosted_approval_(?:reservation_changed|observation_shape_invalid)/);
  assert.equal(h.calls.length, 1);
});

for (const source of ['scripts/pilot-finance-reset-no-backup-core.mjs', 'supabase/migrations/20261024023749_financial_reset_explicit_no_backup_binding.sql']) {
  test(`v2 reader verifies the full pinned closure before process creation: ${source}`, async () => {
    const h = harness({ noBackup: true, packetChange(p) { p.sourceFiles.find(entry => entry.path === source).sha256 = 'f'.repeat(64); reseal(p); } });
    await assert.rejects(h.reader(h.query), /hosted_reader_source_changed/); assert.equal(h.calls.length, 0);
  });
}

test('reader executes only the bound SELECT in a fixed read-only transaction with pinned TLS and no credential arguments', async () => {
  const h = harness();
  assert.deepEqual(await h.reader(h.query), [{ financial_reset_approval_observation: h.observation }]);
  assert.equal(h.calls.length, 1);
  const call = h.calls[0];
  assert.equal(call.executable, '/protected/bin/psql');
  assert.deepEqual(call.args, ['-X', '-qAtw', '--set=ON_ERROR_STOP=on', '--set=VERBOSITY=terse', '--pset=pager=off']);
  assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
  assert.equal(call.options.env.PGHOST, `db.${h.packet.operation.projectRef}.supabase.co`);
  assert.equal(call.options.env.PGSSLMODE, 'verify-full');
  assert.equal(call.options.env.PGGSSENCMODE, 'disable');
  assert.equal(call.options.env.PGSSLROOTCERT, h.connection.sslRootCertPath);
  assert.equal(call.options.env.PGPASSFILE, h.connection.passwordFilePath);
  assert.equal(call.options.env.PGCONNECT_TIMEOUT, '10');
  assert.deepEqual(Object.keys(call.options.env).sort(), ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGSSLMODE', 'PGGSSENCMODE', 'PGSSLROOTCERT', 'PGPASSFILE', 'PGCONNECT_TIMEOUT', 'PGAPPNAME'].sort());
  assert.equal(JSON.stringify(call.args).includes(privateMarker), false);
  assert.equal(call.input.includes(privateMarker), false);
  assert.match(call.input, /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.ok(call.input.includes(`PREPARE nestory_financial_reset_approval_observation(uuid,integer) AS\n${h.query.text};`));
  assert.match(call.input, /EXECUTE nestory_financial_reset_approval_observation\('[a-f0-9-]{36}'::uuid,NULL::integer\);\nCOMMIT;\n$/);
  assert.doesNotMatch(call.input, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|CALL)\b/i);
});

test('reader accepts only the requested exact endorsement ordinal while retaining latest status separately', async () => {
  const h = harness(), o = h.observation, op = h.packet.operation;
  o.approvals = [{ operationId: op.operationId, organizationId: op.organizationId, kind: 'maker',
    reviewSha256: h.packet.databaseBinding.zeroReviewSha256, approvedBy: actor, approvedAt: '2026-10-23T10:00:00Z' }];
  const target = { endorsementId: '20000000-0000-4000-8000-000000000012', operationId: op.operationId, organizationId: op.organizationId,
    kind: 'maker', number: 2, reviewSha256: h.packet.databaseBinding.zeroReviewSha256, actorId: actor,
    sessionId: '20000000-0000-4000-8000-000000000013', credentialExpiresAt: '2026-10-23T11:00:00Z', endorsedAt: '2026-10-23T10:00:01Z' };
  o.targetEndorsements = [target];
  o.endorsements = [{ ...target, endorsementId: '20000000-0000-4000-8000-000000000014', number: 3,
    sessionId: '20000000-0000-4000-8000-000000000015', credentialExpiresAt: '2026-10-23T14:00:00Z',
    availability: { status: 'current', observedAt: '2026-10-23T12:00:00Z' } }];
  const query = approvalObservationQuery(h.packet, 2);
  assert.deepEqual(await h.reader(query), [{ financial_reset_approval_observation: o }]);
  assert.match(h.calls[0].input, /::uuid,2::integer\);\nCOMMIT;/);
  assert.deepEqual(query.values, [op.operationId, 2]);
  o.operation.status = 'actions_complete'; o.operation.appliedCount = o.operation.actionCount; o.zeroPlan.status = 'complete';
  o.control.status = 'open'; o.control.generation++; o.control.businessDate = '2026-10-24';
  assert.deepEqual(await h.reader(query), [{ financial_reset_approval_observation: o }]);
  await assert.rejects(h.reader(h.query), /operation_changed/);
  target.number = 1;
  await assert.rejects(h.reader(query), /endorsement_rows_invalid/);
});

for (const [name, change] of [
  ['wrong project', c => { c.expectedProjectRef = 'otherprojectrefaaaaa'; }],
  ['foreign host', c => { c.host = 'db.otherprojectrefaaaaa.supabase.co'; }],
  ['host URL', c => { c.host = `https://${c.host}`; }],
  ['host userinfo', c => { c.host = `attacker@${c.host}`; }],
  ['loopback redirect', c => { c.host = '127.0.0.1'; }],
  ['pooler fallback', c => { c.host = 'aws-0-region.pooler.supabase.com'; }],
  ['wrong port', c => { c.port = 6543; }],
  ['wrong database', c => { c.database = 'other'; }],
  ['username with whitespace', c => { c.user = 'invalid user'; }],
  ['relative executable', c => { c.psqlPath = 'psql'; }],
  ['shell executable', c => { c.psqlPath = '/bin/sh'; }],
  ['remote passfile', c => { c.passwordFilePath = '\\\\server\\secret'; }],
  ['passfile traversal', c => { c.passwordFilePath = '/protected/../secret'; }],
  ['certificate URI', c => { c.sslRootCertPath = 'https://elsewhere.invalid/ca'; }],
  ['extra TLS override', c => { c.sslmode = 'disable'; }],
  ['password option', c => { Object.defineProperty(c, 'password', { enumerable: true }); }],
]) test(`${name} is refused before creating a process`, () => {
  assert.throws(() => harness({ connectionChange: change }), /hosted_reader_connection_invalid/);
});

test('an absolute Windows psql path is supported without inheriting shell or environment settings', async () => {
  const h = harness({ connectionChange(c) {
    c.psqlPath = 'C:\\protected\\bin\\psql.exe'; c.sslRootCertPath = 'C:\\protected\\ca.crt'; c.passwordFilePath = 'C:\\protected\\pgpass';
  } });
  await h.reader(h.query);
  assert.equal(h.calls[0].executable, 'C:\\protected\\bin\\psql.exe');
});

for (const [name, change] of [
  ['text', q => { q.text = 'SELECT 1'; }],
  ['parameters', q => { q.values = [actor]; }],
  ['invalid ordinal', q => { q.values[1] = 0; }],
  ['SQL ordinal', q => { q.values[1] = '1); DELETE FROM anything;'; }],
  ['project', q => { q.projectRef = 'otherprojectrefaaaaa'; }],
  ['transaction', q => { q.transaction.readOnly = false; }],
  ['extra URL', q => { q.url = 'https://elsewhere.invalid'; }],
]) test(`changed query ${name} cannot reach psql`, async () => {
  const h = harness(), query = structuredClone(h.query); change(query);
  await assert.rejects(h.reader(query), /hosted_reader_query_invalid/);
  assert.equal(h.calls.length, 0);
});

for (const source of readerSources) test(`missing or stale ${source} digest blocks the process`, async () => {
  for (const missing of [true, false]) {
    let h;
    await assert.rejects(async () => {
      h = harness({ packetChange(p) {
        if (missing) p.sourceFiles = p.sourceFiles.filter(s => s.path !== source);
        else p.sourceFiles.find(s => s.path === source).sha256 = 'f'.repeat(64);
        reseal(p);
      } });
      await h.reader(h.query);
    }, /(?:hosted_reader_source_changed|operator_source_coverage_incomplete)/);
    assert.equal(h?.calls.length ?? 0, 0);
  }
});

test('caller mutation cannot redirect the captured packet or connection', async () => {
  const h = harness();
  h.packet.operation.operationId = actor;
  h.connection.host = 'elsewhere.invalid'; h.connection.passwordFilePath = '/different/passfile';
  await h.reader(h.query);
  assert.equal(h.calls[0].options.env.PGHOST, 'db.syntheticprojectrefa.supabase.co');
  assert.equal(h.calls[0].options.env.PGPASSFILE.includes(privateMarker), true);
  assert.ok(h.calls[0].input.includes(h.query.values[0]));
});

for (const [name, output] of [['empty', ''], ['non-JSON', privateMarker], ['multiple results', '{}\n{}'], ['wrong shape', '[]']]) {
  test(`${name} output is refused without leaking contents`, async () => {
    const h = harness({ response({ child }) { child.stdout.write(output); child.emit('close', 0, null); } });
    await assert.rejects(h.reader(h.query), error => /^hosted_(?:reader_output|approval_observation)_/.test(error.message) && !error.message.includes(privateMarker));
  });
}

test('database operation or frozen-generation mismatch is rejected after reading', async () => {
  const h = harness({ response({ child, observation }) {
    observation.control.generation++; child.stdout.write(JSON.stringify(observation)); child.emit('close', 0, null);
  } });
  await assert.rejects(h.reader(h.query), /hosted_approval_frozen_context_changed/);
});

for (const kind of ['throw', 'error', 'exit', 'stderr']) test(`${kind} process failure is sanitized without credential/path details`, async () => {
  const h = harness({ spawnFailure: kind === 'throw', response({ child, observation }) {
    if (kind === 'error') child.emit('error', new Error(privateMarker));
    else {
      child.stdout.write(JSON.stringify(observation));
      if (kind === 'stderr') child.stderr.write(`password/file ${privateMarker}`);
      child.emit('close', kind === 'exit' ? 2 : 0, null);
    }
  } });
  await assert.rejects(h.reader(h.query), error => /^hosted_reader_process_/.test(error.message) && !error.message.includes(privateMarker));
});

for (const stream of ['stdout', 'stderr']) test(`oversized ${stream} kills the reader and refuses partial output`, async () => {
  const h = harness({ response({ child }) { child[stream].write('x'.repeat(65537)); child.emit('close', 0, null); } });
  await assert.rejects(h.reader(h.query), /hosted_reader_output_limit/);
  assert.equal(h.calls[0].killed, true);
});

test('20-second process timeout kills the read and returns no partial evidence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started;
  const spawned = new Promise(resolve => { started = resolve; });
  const h = harness({ onSpawn: started, response() { /* Deliberately no result. */ } });
  const pending = h.reader(h.query);
  const rejected = assert.rejects(pending, /hosted_reader_process_timeout/);
  await spawned;
  t.mock.timers.tick(20000);
  await rejected;
  assert.equal(h.calls[0].killed, true);
});

test('no optional URL, environment, SQL or executable fallback override is accepted', () => {
  const h = harness();
  for (const key of ['url', 'env', 'sql', 'fallback']) {
    assert.throws(() => createHostedApprovalReader({ packet: h.packet, connection: h.connection, [key]: privateMarker }), /options_invalid/);
  }
});
