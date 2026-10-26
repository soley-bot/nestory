// Explicit offline process simulation only; no database, credentials or network.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';
import { digestJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { noBackupDeletionScope } from './pilot-finance-reset-no-backup-transport.mjs';
import { createNoBackupReadOnlyReader, createSyntheticNoBackupReaderForTests, assertConcreteNoBackupReaderResult,
  NO_BACKUP_READER_LIMITS } from './pilot-finance-reset-no-backup-reader.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, d = c => c.repeat(64), copy = value => structuredClone(value);
const sourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name =>
  [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const sources = Object.entries(sourceContents).map(([name, bytes]) => ({ path: name, sha256: hashSourceBytes(bytes) }));
const catalog = [{ kind: 'function', name: 'app_private.synthetic_only()', sha256: d('a') }];
const ledger = Object.entries(sourceContents).filter(([name]) => name.endsWith('.sql')).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => {
  const base = name.split('/').at(-1), body = bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/^[\t\n\r ;]+/, '');
  return { version: base.slice(0, 14), name: base.slice(15, -4), statements: [{ byteLength: Buffer.byteLength(body), sha256: hashBytes(body) }] };
});

function fixture() {
  const semantic = { version: 3, actor_id: id(3), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(10), term_id: id(11), billing_rule_id: id(12), disposition: 'bill', continue_month_to_month: false, rent_amount: '1000.00',
        management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', due_date: '2026-10-07' },
    ], original_invoice_sources: [{ lease_id: id(10), invoice_id: id(14), row_sha256: d('a') }] };
  const postgresSemanticText = JSON.stringify(semantic, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, `synthetic-only ${role}`]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(1), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07',
      executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: digestJson(catalog), ledgerSha256: digestJson(ledger), sourceSnapshotSha256: d('d'), foreignSnapshotSha256: d('e'), archiveRows: 1, actionCount: 1,
    databaseBinding: { manifestSha256: d('1'), planSha256: d('2'), archiveSha256: d('3'), actionSha256: d('4'), zeroReviewSha256: d('5'),
      continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: d('7') },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  const packet = prepareNoBackupPacket({ review, sources, sourceContents, evidence, candidateHead: review.operation.mainSha, observedBusinessDate: '2026-10-24' });
  const binding = hostedNoBackupBinding(packet, semantic, postgresSemanticText);
  const connection = { expectedProjectRef: NO_BACKUP_PROJECT, host: `db.${NO_BACKUP_PROJECT}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres',
    psqlPath: '/protected/bin/psql', sslRootCertPath: '/protected/root.crt', passwordFilePath: '/protected/existing.pgpass' };
  const authorization = { authorizationId: id(100), actorId: id(3), status: 'pending', bindingMatches: true, backendPid: null, transactionId: null,
    expiresAt: '2026-10-24T04:04:00Z', observedAt: '2026-10-24T04:00:00Z' };
  const observation = { catalog: copy(catalog), ledger: copy(ledger), businessDate: '2026-10-24', timezone: 'Asia/Phnom_Penh', sourceSha256: d('d'), foreignSha256: d('e'),
    control: null, reservation: null, reservationHashValid: null, recoveryReservation: null, recoveryCheckpoint: null, actionReceipt: null, operation: null,
    appliedCount: 0, archiveCount: 0, actionCount: 0, capabilityCount: 0, zero: null, continuation: null, phaseFences: [], approvalCount: 0, checkpoint: null, authorization };
  return { packet, postgresSemanticText, binding, connection, observation };
}
const options = f => ({ packet: f.packet, postgresSemanticText: f.postgresSemanticText, connection: f.connection });
const forward = f => ({ binding: f.binding, action: 'freeze', authorizationId: id(100), previousIntent: null });
const identity = () => ({ database: 'postgres', sessionUser: 'postgres', readOnly: 'on' });

function harness(f, responses, behavior = {}) {
  const calls = [], kills = [];
  const spawnProcess = (executable, args, settings) => {
    if (behavior.startError) throw Error('PRIVATE_PROCESS_OR_CREDENTIAL_DETAIL');
    const call = { executable, args, settings, input: '' }; calls.push(call);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = signal => { kills.push(signal); return true; };
    child.stdin = new Writable({ write(bytes, encoding, done) { call.input += bytes.toString('utf8'); done(); }, final(done) {
      done(); queueMicrotask(() => {
        if (behavior.streamError) { child.stdout.emit('error', Error('PRIVATE_STREAM_DETAIL')); return; }
        if (behavior.stderr) child.stderr.write(behavior.stderr);
        const value = behavior.rawOutput ?? [identity(), ...responses].map(row => JSON.stringify(row)).join('\n');
        child.stdout.write(value);
        child.emit('close', behavior.code ?? 0, behavior.signal ?? null);
      });
    } });
    return child;
  };
  return { reader: createSyntheticNoBackupReaderForTests(options(f), spawnProcess), calls, kills };
}

function completed(f) {
  const tx = { backendPid: 81, transactionId: '12345' }, o = f.observation;
  o.authorization = { ...o.authorization, status: 'consumed', ...tx };
  o.control = { status: 'frozen', generation: 1, cutoff: '2026-10-01' };
  o.reservation = { binding: copy(f.binding), bindingSha256: d('8'), foreignSha256: d('e'), ...tx }; o.reservationHashValid = true;
  o.recoveryCheckpoint = { bindingSha256: d('8'), sourceSha256: d('d'), foreignSha256: d('e'), authoritySha256: d('f'), ...tx };
  o.operation = { operation_id: id(1), organization_id: NO_BACKUP_ORGANIZATION, operation_kind: 'reset', restore_of: null,
    status: 'actions_complete', target_generation: 1, action_count: 1, execution_backend: tx.backendPid, execution_xid: tx.transactionId };
  o.actionCount = 1; o.archiveCount = 1; o.appliedCount = 1;
  o.zero = { status: 'complete', reviewSha256: f.binding.zero_review_sha256,
    plan: { scopes: [{ ownership_percent: 25.5 }] }, ...tx };
  o.continuation = { status: 'complete', semantic: copy(f.binding.continuation_semantic) };
  o.phaseFences = ['known-zero', 'continuation', 'reports'].map(phase => ({ phase, ...tx }));
  o.sourceSha256 = d('f'); o.checkpoint = { kind: 'checked-reports', generation: 1, sha256: d('9'), hashValid: true, currentImagesMatch: true, ...tx,
    result: { after_sha256: d('f'), report_review_sha256: f.binding.report_review_sha256,
      continuation_semantic_sha256: f.binding.continuation_semantic_sha256, reports_persisted: true, control_reopened: false, close_published: false } };
  const audit = { operationId: id(1), organizationId: NO_BACKUP_ORGANIZATION, bindingSha256: d('8'), checkpointSha256: d('9'),
    databaseAudit: { archive_count: 1, archive_sha256: d('3'), action_count: 1, action_sha256: d('4'), prepare_receipt_sha256: d('a'), seal_receipt_sha256: d('b'),
      completion_authorization_id: id(100), completion_backend_pid: tx.backendPid, completion_transaction_id: tx.transactionId },
    archiveRowsValid: true, stageReceiptsValid: true,
    completionAuthorization: { authorizationId: id(100), actorId: id(3), sessionId: id(4), ...tx, hashValid: true } };
  return audit;
}
function reopeningBinding(f) {
  return { ...copy(f.binding), reopening: { version: 1, request_id: id(200), operation_id: id(1), generation: 1, cutoff: '2026-10-01',
    checkpoint_sha256: d('9'), after_sha256: d('f'), foreign_sha256: d('e'), evidence_sha256: d('a'), review_sha256: d('b'), execution_business_date: '2026-10-25' } };
}

test('production construction performs no I/O and rejects callback, SQL, token or endpoint overrides', () => {
  const f = fixture(), reader = createNoBackupReadOnlyReader(options(f));
  assert.deepEqual(Object.keys(reader), ['readForward', 'readReopeningAudit', 'readReopeningReceipt']);
  for (const extra of [{ spawnProcess() {} }, { observe() {} }, { sql: 'caller SQL' }, { token: 'invented' }])
    assert.throws(() => createNoBackupReadOnlyReader({ ...options(f), ...extra }), /options_invalid/);
  for (const change of [{ host: 'elsewhere.invalid' }, { port: 6543 }, { database: 'other' }, { expectedProjectRef: 'q'.repeat(20) },
    { psqlPath: 'psql' }, { passwordFilePath: '//remote/secret' }, { sslRootCertPath: '/safe/../other' }, { user: 'postgres\nother' }])
    assert.throws(() => createNoBackupReadOnlyReader({ ...options(f), connection: { ...f.connection, ...change } }), /connection_invalid/);
});

test('forward read uses fixed TLS target, strict environment, stdin and one read-only transaction', async () => {
  const f = fixture(), h = harness(f, [f.observation]), result = await h.reader.readForward(forward(f));
  assert.equal(h.calls.length, 1); const c = h.calls[0];
  assert.equal(c.settings.shell, false); assert.equal(c.settings.windowsHide, true);
  assert.equal(c.settings.env.PGHOST, `db.${NO_BACKUP_PROJECT}.supabase.co`); assert.equal(c.settings.env.PGSSLMODE, 'verify-full');
  assert.equal(c.settings.env.PGPASSFILE, f.connection.passwordFilePath);
  for (const name of ['PGPASSWORD', 'PGOPTIONS', 'PGSERVICE', 'SUPABASE_ACCESS_TOKEN']) assert.equal(Object.hasOwn(c.settings.env, name), false);
  assert.equal(c.args.join(' ').includes(f.connection.passwordFilePath), false);
  assert.equal(c.input.includes(f.connection.passwordFilePath), false);
  assert.match(c.input, /REPEATABLE READ READ ONLY/); assert.match(c.input, /transaction_read_only/); assert.match(c.input, /statement_timeout='20s'/);
  assert.equal((c.input.match(/COMMIT;/g) ?? []).length, 1);
  assert.doesNotMatch(c.input, /consume_financial_reset_actor_authorization|archive_financial_reset_rows|DELETE FROM|UPDATE public/);
  assert.equal(result.transport, 'synthetic-process'); assert.equal(result.runtimeProvenanceVerified, false); assert.equal(result.authorityVerified, false);
  assert.deepEqual(result.observation, f.observation); assert.equal(result.previousObservation, null);
  assert.throws(() => assertConcreteNoBackupReaderResult(result), /concrete_process_result_required/);
  assert.throws(() => assertConcreteNoBackupReaderResult({ ...result, transport: 'fixed-read-only-psql' }), /concrete_process_result_required/);
});

test('binding, action and descriptor injection fails before a process starts', async () => {
  const f = fixture(), h = harness(f, [f.observation]);
  for (const request of [{ ...forward(f), query: 'SELECT arbitrary' }, { ...forward(f), action: 'execute-recovery' },
    { ...forward(f), authorizationId: "' OR true--" }, { ...forward(f), binding: { ...f.binding, project_ref: 'q'.repeat(20) } },
    { ...forward(f), binding: { ...f.binding, archive_artifact_sha256: d('a') } }]) await assert.rejects(h.reader.readForward(request));
  assert.equal(h.calls.length, 0);
});

test('changed local source pins stop the adapter before any process runs', async () => {
  const f = fixture(), p = f.packet;
  p.sourceFiles.find(source => source.path.endsWith('no-backup-reader.mjs')).sha256 = d('f'); p.sourcesSha256 = digestJson(p.sourceFiles);
  const body = { ...p }; delete body.packetSha256; p.packetSha256 = digestJson(body);
  f.binding = hostedNoBackupBinding(p, JSON.parse(f.postgresSemanticText), f.postgresSemanticText);
  const h = harness(f, [f.observation]); await assert.rejects(h.reader.readForward(forward(f)), /source_changed/);
  assert.equal(h.calls.length, 0);
});

test('reader rejects changed semantic bytes at construction', () => {
  const f = fixture();
  assert.throws(() => createNoBackupReadOnlyReader({ ...options(f), postgresSemanticText: canonicalJson(JSON.parse(f.postgresSemanticText)) }), /semantic_binding_invalid/);
});

test('exact project database/session and read-only execution identity are checked', async () => {
  for (const identityRow of [{ database: 'other', sessionUser: 'postgres', readOnly: 'on' },
    { database: 'postgres', sessionUser: 'other', readOnly: 'on' }, { database: 'postgres', sessionUser: 'postgres', readOnly: 'off' }]) {
    const f = fixture(), h = harness(f, [], { rawOutput: [identityRow, f.observation].map(JSON.stringify).join('\n') });
    await assert.rejects(h.reader.readForward(forward(f)), /database_identity_invalid/);
  }
});

test('schema, complete ledger, foreign rows and leaked capability changes cannot be returned as valid observations', async () => {
  for (const change of [o => { o.catalog[0].sha256 = d('f'); }, o => { o.ledger.pop(); }, o => { o.foreignSha256 = d('f'); },
    o => { o.capabilityCount = 1; }, o => { o.reservationHashValid = true; }, o => { o.authorization.actorId = id(999); }]) {
    const f = fixture(); change(f.observation); const h = harness(f, [f.observation]);
    await assert.rejects(h.reader.readForward(forward(f)));
  }
});

test('both current and prior action rows are read and validated in one transaction', async () => {
  const f = fixture(), prior = copy(f.observation);
  prior.authorization = { ...prior.authorization, authorizationId: id(99), status: 'consumed', backendPid: 81, transactionId: '12345' };
  const intent = { format: 'nestory-no-backup-action-intent-v1', operationId: id(1), packetSha256: f.packet.packetSha256, action: 'freeze',
    bindingSha256: digestJson(f.binding), authorizationId: id(99), authoritySha256: d('a'), deletionScopeSha256: digestJson(noBackupDeletionScope(f.packet)),
    liveConsentSha256: f.packet.evidenceReferences.liveConsent.sha256, waiverSha256: f.packet.evidenceReferences.waiver.sha256,
    sourceObservationSha256: d('b'), previousIntentSha256: null, sqlSha256: d('c') };
  const h = harness(f, [f.observation, prior]);
  const result = await h.reader.readForward({ ...forward(f), action: 'checkpoint', previousIntent: intent });
  assert.deepEqual(result.previousObservation, prior); assert.equal((h.calls[0].input.match(/BEGIN TRANSACTION/g) ?? []).length, 1);
  prior.authorization.authorizationId = id(999);
  const bad = harness(f, [f.observation, prior]);
  await assert.rejects(bad.reader.readForward({ ...forward(f), action: 'checkpoint', previousIntent: intent }), /authorization_output_invalid/);
});

test('reopening audit reads actual checked execution and same-DB archive/action/stage witnesses together', async () => {
  const f = fixture(), audit = completed(f), h = harness(f, [f.observation, audit]);
  const result = await h.reader.readReopeningAudit({ binding: f.binding, authorizationId: id(100) });
  assert.equal(result.kind, 'reopening-audit'); assert.equal(result.proof.checkpointSha256, d('9'));
  assert.match(h.calls[0].input, /PREPARE nestory_no_backup_reopening_audit\(uuid,jsonb,uuid\)/);
  assert.match(h.calls[0].input, /financial_reset_archive_digest/); assert.match(h.calls[0].input, /financial_reset_hosted_action_receipts/);
  assert.equal((h.calls[0].input.match(/COMMIT;/g) ?? []).length, 1);
  assert.equal(result.authorityVerified, false); assert.equal(result.runtimeProvenanceVerified, false);
});

test('reopening audit refuses missing or mismatched archive/stage/consumed-transaction proof', async () => {
  for (const change of [a => { a.archiveRowsValid = false; }, a => { a.stageReceiptsValid = false; },
    a => { a.databaseAudit.archive_sha256 = d('f'); }, a => { a.databaseAudit.completion_transaction_id = '999'; },
    a => { a.completionAuthorization.actorId = id(999); }]) {
    const f = fixture(), audit = completed(f); change(audit); const h = harness(f, [f.observation, audit]);
    await assert.rejects(h.reader.readReopeningAudit({ binding: f.binding, authorizationId: id(100) }));
  }
  const f = fixture(), audit = completed(f); f.observation.sourceSha256 = d('a');
  const h = harness(f, [f.observation, audit]);
  await assert.rejects(h.reader.readReopeningAudit({ binding: f.binding, authorizationId: id(100) }), /current_checkpoint_source_changed/);
});

test('historical reopening receipt read does not depend on later source/foreign/schema state or manufacture a missing receipt', async () => {
  const f = fixture(); completed(f); f.observation.sourceSha256 = d('a'); f.observation.control.status = 'open'; f.observation.authorization = null;
  const binding = reopeningBinding(f), receiptObservation = { receipt: null, control: copy(f.observation.control),
    authorization: { authorizationId: id(200), actorId: null, status: 'missing', bindingMatches: false, backendPid: null, transactionId: null,
      expiresAt: null, observedAt: '2026-10-25T04:00:00Z' }, authorizationSessionId: null };
  const h = harness(f, [receiptObservation]);
  const result = await h.reader.readReopeningReceipt({ binding, authorizationId: id(200) });
  assert.equal(result.receiptObservation.receipt, null); assert.equal(Object.hasOwn(result, 'databaseObservation'), false);
  assert.equal(result.kind, 'historical-reopening-receipt'); assert.equal(result.currentReadinessVerified, false);
  assert.doesNotMatch(h.calls[0].input, /financial_reset_hosted_foreign_census|schema_migrations|pg_get_functiondef/);
  assert.match(h.calls[0].input, /financial_reset_reopening_receipts/); assert.equal(result.authorityVerified, false);
});

test('reopening receipt requires exact immutable binding and hash-valid metadata', async () => {
  const f = fixture(); completed(f); f.observation.authorization = null;
  const binding = reopeningBinding(f), authorization = { authorizationId: id(200), actorId: id(3), status: 'consumed', bindingMatches: true,
    backendPid: 81, transactionId: '12346', expiresAt: '2026-10-25T04:01:00Z', observedAt: '2026-10-25T04:00:00Z' };
  const receipt = { operationId: id(1), binding, bindingSha256: d('1'), evidenceSha256: d('a'), checkpointSha256: d('9'), afterSha256: d('f'),
    authorizationId: id(200), actorId: id(3), sessionId: id(4), backendPid: 81, transactionId: '12346', result: { status: 'open' }, sha256: d('2'), hashValid: true };
  const observation = { receipt, control: { status: 'open', generation: 1, cutoff: '2026-10-01' }, authorization, authorizationSessionId: id(4) };
  const h = harness(f, [observation]);
  assert.equal((await h.reader.readReopeningReceipt({ binding, authorizationId: id(200) })).receiptObservation.receipt.sha256, d('2'));
  receipt.hashValid = false; const bad = harness(f, [observation]);
  await assert.rejects(bad.reader.readReopeningReceipt({ binding, authorizationId: id(200) }), /receipt_binding_changed/);
});

test('malformed, incomplete, extra or non-UTF8 output is refused without returning payloads', async () => {
  for (const rawOutput of ['PRIVATE_NON_JSON_OUTPUT', JSON.stringify(identity()), `${JSON.stringify(identity())}\n{}\n{}`, Buffer.from([0xff])]) {
    const f = fixture(), h = harness(f, [], { rawOutput });
    await assert.rejects(h.reader.readForward(forward(f)), error => /output_invalid/.test(error.message) && !error.message.includes('PRIVATE'));
  }
});

test('process stderr, start errors, stream failures, nonzero exits and signals are sanitized', async () => {
  for (const behavior of [{ stderr: 'PRIVATE_CREDENTIAL_DETAIL' }, { startError: true }, { streamError: true }, { code: 1 }, { signal: 'SIGTERM' }]) {
    const f = fixture(), h = harness(f, [f.observation], behavior);
    await assert.rejects(h.reader.readForward(forward(f)), error => /^no_backup_reader_process_/.test(error.message) && !error.message.includes('PRIVATE'));
  }
});

test('bounded stdout and stderr terminate the child without exposing driver data', async () => {
  for (const behavior of [{ rawOutput: 'x'.repeat(NO_BACKUP_READER_LIMITS.stdoutBytes + 1) }, { stderr: 'x'.repeat(NO_BACKUP_READER_LIMITS.stderrBytes + 1) }]) {
    const f = fixture(), h = harness(f, [], behavior);
    await assert.rejects(h.reader.readForward(forward(f)), /output_limit/);
    assert.deepEqual(h.kills, ['SIGKILL']);
  }
});

test('read-only limits are fixed and callers cannot supply a process adapter as authority', () => {
  const f = fixture();
  assert.deepEqual(NO_BACKUP_READER_LIMITS, { processTimeoutMs: 60000, stdoutBytes: 16 * 1024 * 1024, stderrBytes: 8192 });
  assert.throws(() => createNoBackupReadOnlyReader({ ...options(f), processTimeoutMs: 0 }), /options_invalid/);
  assert.throws(() => assertConcreteNoBackupReaderResult({ transport: 'fixed-read-only-psql', authorityVerified: true }), /concrete_process_result_required/);
});
