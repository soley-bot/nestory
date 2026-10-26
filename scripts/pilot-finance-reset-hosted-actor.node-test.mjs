// Offline protocol/process tests only. Genuine Auth provenance is exercised by
// the separate isolated SQL fixture, never certified by these mocked processes.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashBytes, hashSourceBytes, prepareOperatorPacket } from './pilot-finance-reset-operator-core.mjs';
import { hostedBinding } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { ACTOR_SOURCE_FILES, actorAuthorizationObservationQuery, createHostedResetActor, createHostedActorAuthorizationReader } from './pilot-finance-reset-hosted-actor.mjs';
import { NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION, NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';

const id = n => `a0231000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceContents = Object.fromEntries(await Promise.all([...new Set([...ACTOR_SOURCE_FILES, ...NO_BACKUP_REQUIRED_SOURCE_FILES])]
  .map(async name => [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const sourceDigests = new Map(Object.entries(sourceContents).map(([name, content]) => [name, hashSourceBytes(content)]));
const semanticOptions = f => Object.hasOwn(f, 'postgresSemanticText') ? { postgresSemanticText: f.postgresSemanticText } : {};

test('actor pins the complete local static import graph, including validator dependencies', async () => {
  const rootUrl = new URL('../', import.meta.url), seen = new Set();
  async function visit(url) {
    assert.equal(url.href.startsWith(rootUrl.href), true);
    const name = decodeURIComponent(url.href.slice(rootUrl.href.length));
    if (seen.has(name)) return; seen.add(name);
    assert.equal(ACTOR_SOURCE_FILES.includes(name), true, `Unpinned actor dependency: ${name}`);
    const body = await readFile(url, 'utf8');
    for (const match of body.matchAll(/(?:from\s+|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      const child = new URL(match[1], url);
      if (child.pathname.endsWith('.mjs')) await visit(child);
    }
  }
  await visit(new URL('./pilot-finance-reset-hosted-actor.mjs', import.meta.url));
  assert.equal(seen.has('scripts/pilot-finance-reset-no-backup-core.mjs'), true);
  assert.equal(seen.has('scripts/pilot-finance-reset-reopening-protocol.mjs'), true);
});

function fixture() {
  const artifacts = Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, `synthetic-${name}`]));
  const review = { format: 'nestory-protected-reset-review-v1', operation: {
    operationId: id(10), projectRef: 'syntheticprojectrefa', organizationId: id(11), mainSha: 'a'.repeat(40),
    sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-23', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), archiveRows: 1, actionCount: 1,
    databaseBinding: Object.fromEntries(['manifestSha256', 'planSha256', 'archiveSha256', 'actionSha256', 'zeroReviewSha256',
      'continuationSemanticSha256', 'reportReviewSha256'].map((name, i) => [name, String(i + 1).repeat(64)])),
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, hashBytes(value)])) };
  const names = [...new Set([...SOURCE_ENTRYPOINTS, ...ACTOR_SOURCE_FILES])].sort();
  const packet = prepareOperatorPacket({ review, artifacts, candidateHead: review.operation.mainSha,
    sources: names.map(name => ({ path: name, sha256: sourceDigests.get(name) ?? 'a'.repeat(64) })) });
  const binding = hostedBinding(packet, { version: 2, actor_id: id(1), billing_period_start: '2026-10-01', issue_date: '2026-10-23', leases: [] });
  const authorizationId = id(99), action = 'prepare';
  return { packet, binding, authorizationId, action };
}
function status(f, changes = {}) {
  return { authorizationId: f.authorizationId, actorId: id(1), status: 'pending', bindingMatches: true,
    backendPid: null, transactionId: null, expiresAt: new Date(Date.now() + 120000).toISOString(), observedAt: new Date().toISOString(), ...changes };
}
const rows = o => [{ financial_reset_actor_authorization_observation: o }];
function harness(change = () => {}, f = fixture()) {
  const observations = [];
  const provider = async query => { observations.push(query); return rows(status(f, change(observations.length))); };
  const actor = createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization: provider, ...semanticOptions(f) });
  return { ...f, actor, observations, request: { packet: f.packet, binding: f.binding, action: f.action },
    load: () => actor.load({ authorizationId: f.authorizationId, action: f.action }) };
}

test('opaque handle re-observes current DB authority and returns only the bound locator descriptor', async () => {
  const h = harness(), handle = await h.load();
  assert.deepEqual(Object.keys(handle), []); assert.equal(Object.isFrozen(handle), true);
  const result = await h.actor.consume(handle, h.request);
  assert.deepEqual(result, { authorizationId: h.authorizationId, binding: h.binding, action: h.action });
  assert.equal(Object.isFrozen(result.binding.continuation_semantic), true);
  assert.equal(h.observations.length, 2);
  assert.deepEqual(h.observations[0], actorAuthorizationObservationQuery(h));
  assert.equal(JSON.stringify(result).includes('sessionId'), false);
  await assert.rejects(h.actor.consume(handle, h.request), /hosted_actor_opaque_handle_required/);
  await assert.rejects(h.load(), /hosted_actor_locator_already_loaded/);
});

test('a UUID, cloned handle, foreign handle, or object asserting authority cannot be consumed', async () => {
  const a = harness(), b = harness(), handle = await a.load();
  for (const value of [a.authorizationId, { authorizationId: a.authorizationId }, {}, structuredClone(handle)]) {
    await assert.rejects(a.actor.consume(value, a.request), /hosted_actor_opaque_handle_required/);
  }
  await assert.rejects(b.actor.consume(handle, b.request), /hosted_actor_opaque_handle_required/);
  assert.equal(b.observations.length, 0);
});

for (const [label, changes] of [
  ['missing', { status: 'missing', bindingMatches: false, actorId: null, expiresAt: null }],
  ['wrong binding', { status: 'mismatch', bindingMatches: false }],
  ['expired', { status: 'expired' }], ['revoked', { status: 'revoked' }],
  ['replayed', { status: 'consumed', backendPid: 12, transactionId: '54321' }],
  ['wrong actor', { actorId: id(2) }], ['false match', { bindingMatches: false }],
  ['already bound', { backendPid: 12 }], ['already assigned', { transactionId: '54321' }],
  ['stale observation', { observedAt: new Date(Date.now() - 60000).toISOString() }],
  ['future observation', { observedAt: new Date(Date.now() + 60000).toISOString() }],
  ['excessive expiry', { expiresAt: new Date(Date.now() + 600000).toISOString() }],
  ['expired timestamp', { expiresAt: new Date(Date.now() - 1000).toISOString() }],
]) test(`${label} authorization fails both before loading and between load/consume`, async () => {
  const before = harness(() => changes);
  await assert.rejects(before.load(), /hosted_actor_authorization_unavailable/);
  const during = harness(n => n === 2 ? changes : {}), handle = await during.load();
  await assert.rejects(during.actor.consume(handle, during.request), /hosted_actor_authorization_unavailable/);
  await assert.rejects(during.actor.consume(handle, during.request), /hosted_actor_opaque_handle_required/);
});

test('changed action, packet, binding and extra fields burn the handle before another read', async () => {
  for (const change of [r => { r.action = 'seal'; }, r => { r.packet.operation.organizationId = id(9); },
    r => { r.binding.plan_sha256 = 'f'.repeat(64); }, r => { r.actorId = id(1); }]) {
    const h = harness(), handle = await h.load(), request = structuredClone(h.request); change(request);
    await assert.rejects(h.actor.consume(handle, request), /hosted_actor_handle_binding_changed/);
    assert.equal(h.observations.length, 1);
    await assert.rejects(h.actor.consume(handle, h.request), /hosted_actor_opaque_handle_required/);
  }
});

test('concurrent consumption has exactly one descriptor even with a pending observation', async () => {
  const h = harness(), handle = await h.load();
  const outcomes = await Promise.allSettled([h.actor.consume(handle, h.request), h.actor.consume(handle, h.request)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(r => r.status === 'rejected').reason.message, /opaque_handle_required/);
});

test('mutating a load request during observation cannot change its captured locator or action', async () => {
  const f = fixture(), input = { authorizationId: f.authorizationId, action: f.action };
  const actor = createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization: async () => {
    input.authorizationId = id(77); input.action = 'seal';
    return rows(status(f));
  } });
  const handle = await actor.load(input);
  assert.deepEqual(await actor.consume(handle, { packet: f.packet, binding: f.binding, action: f.action }),
    { authorizationId: f.authorizationId, binding: f.binding, action: f.action });
});

test('a separate recovery review is bound to its exact generation, operation and action', async () => {
  const f = fixture();
  f.binding.recovery = { operation_id: id(42), source_generation: 1, target_generation: 2,
    plan_sha256: '1'.repeat(64), action_sha256: '2'.repeat(64), action_count: 1,
    report_checkpoint_sha256: '3'.repeat(64), phase_binding_sha256: '4'.repeat(64),
    review_artifact_sha256: '5'.repeat(64), execution_business_date: '2026-10-24' };
  const actor = createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization: async () => rows(status(f)) });
  const action = 'execute-recovery', handle = await actor.load({ authorizationId: f.authorizationId, action });
  const result = await actor.consume(handle, { packet: f.packet, binding: f.binding, action });
  assert.equal(result.binding.recovery.operation_id, id(42));
  assert.equal(result.action, action);
  for (const change of [r => { r.operation_id = f.binding.operation_id; }, r => { r.target_generation = 4; },
    r => { r.review_artifact_sha256 = 'wrong'; }, r => { r.actorId = id(2); }]) {
    const binding = structuredClone(f.binding); change(binding.recovery);
    assert.throws(() => actorAuthorizationObservationQuery({ ...f, binding, action }), /hosted_actor_binding_invalid/);
  }
});

test('locator-only and caller claims inputs fail the closed descriptor shape', async () => {
  const h = harness();
  for (const input of [h.authorizationId, { authorizationId: h.authorizationId },
    { authorizationId: h.authorizationId, action: h.action, actorId: id(1) },
    { authorizationId: h.authorizationId, action: h.action, accessToken: 'synthetic' }]) {
    await assert.rejects(h.actor.load(input), /hosted_actor_locator_invalid/);
  }
  assert.equal(h.observations.length, 0);
});

test('wrong scope and recovery confusion are rejected before observation', async () => {
  for (const change of [b => { b.organization_id = id(22); }, b => { b.operation_id = id(23); },
    b => { b.project_ref = 'anotherprojectrefaaa'; }, b => { b.packet_sha256 = 'f'.repeat(64); },
    b => { b.recovery = {}; }, b => { b.actorId = id(1); }]) {
    const f = fixture(); change(f.binding);
    const actor = createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization: () => assert.fail('must not observe') });
    await assert.rejects(actor.load({ authorizationId: f.authorizationId, action: f.action }), /hosted_actor_binding_invalid/);
  }
});

test('provider errors and invalid or secret-bearing response fields are rejected without disclosure', async () => {
  const f = fixture(), marker = 'SYNTHETIC_PRIVATE_FAILURE';
  for (const provider of [() => { throw Error(marker); }, () => rows({ ...status(f), accessToken: marker }),
    () => rows({ ...status(f), observedAt: marker }), () => [{ other: marker }]]) {
    const actor = createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization: provider });
    await assert.rejects(actor.load({ authorizationId: f.authorizationId, action: f.action }), error =>
      /^hosted_actor_observation_(invalid|unavailable)$/.test(error.message) && !error.message.includes(marker));
  }
});

function readerHarness(config = {}) {
  const f = config.fixture ? config.fixture() : fixture(), calls = [], marker = 'SYNTHETIC_PRIVATE_FAILURE';
  const connection = { expectedProjectRef: f.packet.operation.projectRef, host: `db.${f.packet.operation.projectRef}.supabase.co`,
    port: 5432, database: 'postgres', user: 'postgres', psqlPath: '/protected/bin/psql',
    sslRootCertPath: `/protected/${marker}/root.crt`, passwordFilePath: `/protected/${marker}/pgpass` };
  config.connection?.(connection); config.packet?.(f.packet);
  const reopening = f.binding.reopening;
  f.binding = Object.hasOwn(f, 'postgresSemanticText') ? hostedNoBackupBinding(f.packet, f.binding.continuation_semantic, f.postgresSemanticText)
    : hostedBinding(f.packet, f.binding.continuation_semantic);
  if (reopening) f.binding.reopening = reopening;
  const reader = createHostedActorAuthorizationReader({ packet: f.packet, connection, ...semanticOptions(f), spawnProcess(executable, args, options) {
    const call = { executable, args, options, input: '', killed: false }; calls.push(call);
    if (config.throwSpawn) throw Error(marker);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { call.killed = true; return true; };
    child.stdin = new Writable({ write(bytes, _, done) { call.input += bytes.toString(); done(); }, final(done) {
      done(); queueMicrotask(() => {
        if (config.respond) config.respond(child, f);
        else { child.stdout.write(JSON.stringify(status(f))); child.emit('close', 0, null); }
      });
    } });
    return child;
  } });
  return { ...f, connection, calls, reader, query: actorAuthorizationObservationQuery(f), marker };
}

test('concrete reader sends only the fixed prepared SELECT with pinned TLS, target and environment', async () => {
  const h = readerHarness(), result = await h.reader(h.query), call = h.calls[0];
  assert.equal(result[0].financial_reset_actor_authorization_observation.status, 'pending');
  assert.match(call.input, /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(call.input, /PREPARE nestory_financial_reset_actor_observation\(uuid,jsonb,text\)/);
  assert.match(call.input, /COMMIT;\n$/);
  assert.doesNotMatch(call.input, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|CALL)\b/i);
  assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
  assert.equal(call.options.env.PGSSLMODE, 'verify-full'); assert.equal(call.options.env.PGGSSENCMODE, 'disable');
  assert.equal(call.options.env.PGHOST, `db.${h.packet.operation.projectRef}.supabase.co`);
  assert.deepEqual(Object.keys(call.options.env).sort(), ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGSSLMODE', 'PGGSSENCMODE', 'PGSSLROOTCERT', 'PGPASSFILE', 'PGCONNECT_TIMEOUT', 'PGAPPNAME'].sort());
  assert.equal(call.input.includes(h.marker), false); assert.equal(JSON.stringify(call.args).includes(h.marker), false);
});

test('query SQL, target, parameters, transaction and extra fields cannot redirect the reader', async () => {
  for (const change of [q => { q.text = 'SELECT 1'; }, q => { q.projectRef = 'foreignprojectrefaaa'; },
    q => { q.values[1].organization_id = id(12); }, q => { q.values[2] = 'DROP'; },
    q => { q.transaction.readOnly = false; }, q => { q.accessToken = 'synthetic'; }]) {
    const h = readerHarness(), q = structuredClone(h.query); change(q);
    await assert.rejects(h.reader(q), /hosted_actor_query_invalid/); assert.equal(h.calls.length, 0);
  }
});

for (const [label, change] of [
  ['host', c => { c.host = '127.0.0.1'; }], ['project', c => { c.expectedProjectRef = 'foreignprojectrefaaa'; }],
  ['port', c => { c.port = 6543; }], ['database', c => { c.database = 'other'; }],
  ['user', c => { c.user = 'postgres password=secret'; }], ['executable', c => { c.psqlPath = '/bin/sh'; }],
  ['relative passfile', c => { c.passwordFilePath = 'pgpass'; }], ['remote passfile', c => { c.passwordFilePath = '\\\\server\\pgpass'; }],
  ['traversal', c => { c.sslRootCertPath = '/protected/../ca'; }], ['password', c => { c.password = 'synthetic'; }],
]) test(`reader rejects ${label} before spawning`, () => {
  assert.throws(() => readerHarness({ connection: change }), /hosted_actor_connection_invalid/);
});

test('stale source hashes block both the actor and concrete reader before dispatch', async () => {
  const h = readerHarness({ packet(p) {
    p.sourceFiles.find(s => s.path === 'scripts/pilot-finance-reset-hosted-actor.mjs').sha256 = '0'.repeat(64);
    p.sourcesSha256 = hashBytes(canonicalJson(p.sourceFiles));
    const body = { ...p }; delete body.packetSha256; p.packetSha256 = hashBytes(canonicalJson(body));
  } });
  await assert.rejects(h.reader(h.query), /hosted_actor_source_changed/); assert.equal(h.calls.length, 0);
  const actor = createHostedResetActor({ packet: h.packet, binding: h.binding, observeAuthorization: () => assert.fail('must not observe') });
  await assert.rejects(actor.load({ authorizationId: h.authorizationId, action: h.action }), /hosted_actor_source_changed/);
});

for (const [label, respond, expected] of [
  ['stderr', child => { child.stderr.write('SYNTHETIC_PRIVATE_FAILURE'); child.emit('close', 1, null); }, 'process_failed'],
  ['invalid JSON', child => { child.stdout.write('SYNTHETIC_PRIVATE_FAILURE'); child.emit('close', 0, null); }, 'output_invalid'],
  ['oversize', child => { child.stdout.write('x'.repeat(65537)); child.emit('close', 0, null); }, 'output_limit'],
  ['signal', child => { child.emit('close', 0, 'SIGTERM'); }, 'process_failed'],
  ['extra fields', (child, f) => { child.stdout.write(JSON.stringify({ ...status(f), token: 'SYNTHETIC_PRIVATE_FAILURE' })); child.emit('close', 0, null); }, 'observation_invalid'],
]) test(`reader safely refuses ${label}`, async () => {
  const h = readerHarness({ respond });
  await assert.rejects(h.reader(h.query), error => error.message === `hosted_actor_${expected}` && !error.message.includes(h.marker));
});

// Synthetic policy/reference bytes, including the raw semantic-text witness.
// A mock process can prove adapter behavior but cannot issue genuine authority.
function noBackupFixture(reopen = false) {
  const continuation = { version: 3, actor_id: id(1), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(20), term_id: id(21), billing_rule_id: id(22), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(23),
        collection_route: 'through_ips', due_date: '2026-10-07' },
    ], original_invoice_sources: [{ lease_id: id(20), invoice_id: id(24), row_sha256: '8'.repeat(64) }] };
  const postgresSemanticText = JSON.stringify(continuation, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, Buffer.from(`synthetic-only ${role}`)]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(10), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01',
      dueDate: '2026-10-07', executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: 'b'.repeat(64), ledgerSha256: 'c'.repeat(64), sourceSnapshotSha256: 'd'.repeat(64), foreignSnapshotSha256: 'e'.repeat(64),
    archiveRows: 1, actionCount: 1, databaseBinding: { manifestSha256: '1'.repeat(64), planSha256: '2'.repeat(64), archiveSha256: '3'.repeat(64),
      actionSha256: '4'.repeat(64), zeroReviewSha256: '5'.repeat(64), continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: '7'.repeat(64) },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  const packet = prepareNoBackupPacket({ review, evidence, sourceContents,
    sources: [...sourceDigests].map(([name, sha256]) => ({ path: name, sha256 })),
    candidateHead: review.operation.mainSha, observedBusinessDate: review.operation.executionBusinessDate });
  const f = { packet, binding: hostedNoBackupBinding(packet, continuation, postgresSemanticText), postgresSemanticText,
    authorizationId: id(99), action: 'prepare' };
  return reopen ? reopeningFixture(f) : f;
}

function reopeningFixture(f = fixture()) {
  f.action = 'reopen';
  f.binding.reopening = { version: 1, request_id: id(80), operation_id: f.binding.operation_id, generation: f.binding.target_generation,
    cutoff: f.binding.cutoff, checkpoint_sha256: 'a'.repeat(64), after_sha256: 'b'.repeat(64),
    foreign_sha256: f.packet.foreignSnapshotSha256 ?? 'c'.repeat(64), evidence_sha256: 'd'.repeat(64),
    review_sha256: 'e'.repeat(64), execution_business_date: '2026-10-24' };
  return f;
}

test('typed no-backup actions use the same fixed read and opaque custody without issuing authorization', async () => {
  for (const action of ['freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'reopen']) {
    const h = readerHarness({ fixture: () => { const f = noBackupFixture(action === 'reopen'); f.action = action; return f; } });
    const actor = createHostedResetActor({ packet: h.packet, binding: h.binding, postgresSemanticText: h.postgresSemanticText,
      observeAuthorization: h.reader });
    const handle = await actor.load({ authorizationId: h.authorizationId, action });
    const result = await actor.consume(handle, { packet: h.packet, binding: h.binding, action });
    assert.deepEqual(result, { authorizationId: h.authorizationId, binding: h.binding, action });
    assert.equal(h.calls.length, 2); assert.equal(result.binding.version, 2);
    assert.equal(result.binding.archive_artifact_sha256, null);
    for (const call of h.calls) {
      assert.match(call.input, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
      assert.match(call.input, /financial_reset_hosted_actor_authorization_status\(\$1::uuid,\$2::jsonb,\$3::text\)/);
      assert.doesNotMatch(call.input, /authorize_financial_reset_hosted_action|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|CALL)\b/i);
      assert.equal(call.options.env.PGSSLMODE, 'verify-full');
      assert.equal(call.options.env.PGHOST, `db.${NO_BACKUP_PROJECT}.supabase.co`);
      assert.equal(call.options.shell, false);
    }
    assert.equal(Object.hasOwn(result, 'sessionId'), false);
    await assert.rejects(actor.consume(handle, { packet: h.packet, binding: h.binding, action }), /opaque_handle_required/);
  }
});

test('only no-backup APIs require raw semantic bytes and never replace them with parsed or reserialized JSON', async () => {
  const f = noBackupFixture(), h = readerHarness({ fixture: noBackupFixture });
  assert.throws(() => actorAuthorizationObservationQuery({ packet: f.packet, binding: f.binding, authorizationId: f.authorizationId, action: f.action }), /semantic_bytes_required/);
  assert.throws(() => createHostedResetActor({ packet: f.packet, binding: f.binding, observeAuthorization() {} }), /options_invalid/);
  assert.throws(() => createHostedActorAuthorizationReader({ packet: f.packet, connection: h.connection }), /reader_options_invalid/);
  for (const bytes of ['', {}, null, JSON.stringify(f.binding.continuation_semantic), `${f.postgresSemanticText}\n`]) {
    assert.throws(() => actorAuthorizationObservationQuery({ ...f, postgresSemanticText: bytes }), /semantic_bytes/);
  }
  const legacy = fixture();
  assert.throws(() => actorAuthorizationObservationQuery({ ...legacy, postgresSemanticText: '{}' }), /options_invalid/);
  assert.throws(() => createHostedResetActor({ packet: legacy.packet, binding: legacy.binding, observeAuthorization() {}, postgresSemanticText: '{}' }), /options_invalid/);
  assert.throws(() => createHostedActorAuthorizationReader({ packet: legacy.packet, connection: h.connection, postgresSemanticText: '{}' }), /reader_options_invalid/);
  assert.equal(h.calls.length, 0);
});

test('actor and concrete reader capture immutable copies of supplied semantic byte buffers', async () => {
  const h = readerHarness({ fixture: () => { const f = noBackupFixture(); f.postgresSemanticText = Buffer.from(f.postgresSemanticText); return f; } });
  const actor = createHostedResetActor({ packet: h.packet, binding: h.binding, postgresSemanticText: h.postgresSemanticText, observeAuthorization: h.reader });
  h.postgresSemanticText.fill(0);
  const handle = await actor.load({ authorizationId: h.authorizationId, action: h.action });
  await actor.consume(handle, { packet: h.packet, binding: h.binding, action: h.action });
  assert.equal(h.calls.length, 2);
});

test('no-backup rejects recovery actions, invented archives, changed scope and reopening-as-execution before observation', async () => {
  for (const action of ['prepare-recovery', 'execute-recovery', 'inspect', 'reconcile', 'restore', 'export']) {
    const f = noBackupFixture(); f.action = action;
    const h = harness(() => assert.fail('must not observe'), f);
    await assert.rejects(h.load(), /hosted_actor_binding_invalid/); assert.equal(h.observations.length, 0);
  }
  for (const mutate of [f => { f.binding.archive_artifact_sha256 = 'f'.repeat(64); }, f => { f.binding.recovery = {}; },
    f => { f.binding.organization_id = id(88); }, f => { f.binding.project_ref = 'syntheticprojectrefa'; },
    f => { f.binding.version = 1; }, f => { f.binding.continuation_semantic.actor_id = id(2); },
    f => { f.binding.continuation_semantic.leases[0].continue_month_to_month = true; },
    f => { f.binding.reopening = reopeningFixture(noBackupFixture()).binding.reopening; }]) {
    const f = noBackupFixture(); mutate(f); const h = harness(() => assert.fail('must not observe'), f);
    await assert.rejects(h.load(), /no_backup_|hosted_actor_binding_invalid/); assert.equal(h.observations.length, 0);
  }
});

for (const mode of ['no-backup', 'no-backup-reopening']) test(`${mode} preserves current-status, expiry and session revocation refusals at both reads`, async () => {
  for (const changes of [{ status: 'expired' }, { status: 'revoked' }, { status: 'missing', bindingMatches: false, actorId: null, expiresAt: null },
    { status: 'consumed', backendPid: 1, transactionId: '42' }, { actorId: id(2) }, { bindingMatches: false },
    { backendPid: 1 }, { transactionId: '42' }, { expiresAt: new Date(Date.now() - 1000).toISOString() },
    { expiresAt: new Date(Date.now() + 600000).toISOString() }, { observedAt: new Date(Date.now() - 60000).toISOString() }]) {
    const before = harness(() => changes, noBackupFixture(mode === 'no-backup-reopening'));
    await assert.rejects(before.load(), /authorization_unavailable/);
    const during = harness(n => n === 2 ? changes : {}, noBackupFixture(mode === 'no-backup-reopening')), handle = await during.load();
    await assert.rejects(during.actor.consume(handle, during.request), /authorization_unavailable/);
    await assert.rejects(during.actor.consume(handle, during.request), /opaque_handle_required/);
  }
});

test('separate reopening binding accepts legacy or no-backup packets but never broadens an execution locator', async () => {
  for (const make of [reopeningFixture, () => noBackupFixture(true)]) {
    const h = harness(() => ({}), make()), handle = await h.load();
    assert.equal((await h.actor.consume(handle, h.request)).action, 'reopen');
    for (const mutate of [f => { delete f.binding.reopening; }, f => { f.binding.reopening.request_id = 'invalid'; },
      f => { f.binding.reopening.operation_id = id(81); }, f => { f.binding.reopening.generation += 1; },
      f => { f.binding.reopening.cutoff = '2026-11-01'; }, f => { f.binding.reopening.evidence_sha256 = 'invalid'; },
      f => { f.binding.reopening.checkpoint_sha256 = 'invalid'; }, f => { f.binding.reopening.review_sha256 = 'invalid'; },
      f => { f.binding.reopening.execution_business_date = '2026-02-30'; }, f => { f.binding.reopening.extra = true; }]) {
      const f = make(); mutate(f);
      const invalid = harness(() => assert.fail('must not observe'), f);
      await assert.rejects(invalid.load(), /binding_invalid/); assert.equal(invalid.observations.length, 0);
    }
    const changed = harness(() => ({}), make()), changedHandle = await changed.load();
    await assert.rejects(changed.actor.consume(changedHandle, { ...changed.request, action: 'execute' }), /handle_binding_changed/);
    await assert.rejects(changed.actor.consume(changedHandle, changed.request), /opaque_handle_required/);
  }
});

test('no-backup reopening preserves original scope and permits a separately reviewed valid later date', async () => {
  for (const mutate of [f => { f.binding.reopening.foreign_sha256 = 'f'.repeat(64); },
    f => { f.binding.execution_business_date = '2026-10-25'; }]) {
    const f = noBackupFixture(true); mutate(f);
    const h = harness(() => assert.fail('must not observe'), f);
    await assert.rejects(h.load(), /reset_reopening_binding_invalid|no_backup_hosted_binding_invalid/); assert.equal(h.observations.length, 0);
  }
  // The reader binds this exact request; the checked DB action separately
  // requires the fresh review date to equal the database business date.
  const f = noBackupFixture(true); f.binding.reopening.execution_business_date = '2026-10-25';
  const h = harness(() => ({}), f), handle = await h.load();
  assert.equal((await h.actor.consume(handle, h.request)).binding.reopening.execution_business_date, '2026-10-25');
});

test('new protocol and migration source changes block the actor and read adapter before any process', async () => {
  for (const source of ['scripts/pilot-finance-reset-no-backup-core.mjs', 'scripts/pilot-finance-reset-reopening-protocol.mjs',
    'supabase/migrations/20261024015702_financial_reset_checked_reopening.sql',
    'supabase/migrations/20261024023749_financial_reset_explicit_no_backup_binding.sql']) {
    const h = readerHarness({ fixture: noBackupFixture, packet(packet) {
      packet.sourceFiles.find(s => s.path === source).sha256 = '0'.repeat(64);
      packet.sourcesSha256 = hashBytes(canonicalJson(packet.sourceFiles));
      const body = { ...packet }; delete body.packetSha256; packet.packetSha256 = hashBytes(canonicalJson(body));
    } });
    await assert.rejects(h.reader(h.query), /source_changed/); assert.equal(h.calls.length, 0);
    const actor = createHostedResetActor({ packet: h.packet, binding: h.binding, postgresSemanticText: h.postgresSemanticText,
      observeAuthorization: () => assert.fail('must not observe') });
    await assert.rejects(actor.load({ authorizationId: h.authorizationId, action: h.action }), /source_changed/);
  }
});

test('typed reader rejects altered SQL, scope, action and transaction before starting its fixed adapter', async () => {
  for (const mutate of [q => { q.text = 'SELECT 1'; }, q => { q.values[1].archive_artifact_sha256 = 'f'.repeat(64); },
    q => { q.values[1].organization_id = id(77); }, q => { q.values[2] = 'execute-recovery'; },
    q => { q.values[2] = 'reopen'; }, q => { q.transaction.readOnly = false; }, q => { q.sessionId = id(1); }]) {
    const h = readerHarness({ fixture: noBackupFixture }), query = structuredClone(h.query); mutate(query);
    await assert.rejects(h.reader(query), /query_invalid/); assert.equal(h.calls.length, 0);
  }
});
