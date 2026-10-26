// Offline transport simulation only. No user credentials, network or database.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { canonicalJson, hashBytes, hashSourceBytes } from './pilot-finance-reset-operator-core.mjs';
import { NO_BACKUP_REQUIRED_SOURCE_FILES, NO_BACKUP_EVIDENCE_ROLES, NO_BACKUP_POLICY, NO_BACKUP_PROJECT, NO_BACKUP_ORGANIZATION,
  prepareNoBackupPacket, hostedNoBackupBinding } from './pilot-finance-reset-no-backup-core.mjs';
import { createCurrentSessionReader, createSyntheticCurrentSessionReaderForTests, assertConcreteCurrentSession,
  CURRENT_SESSION_PERMISSION_PINS, CURRENT_SESSION_LIMITS } from './pilot-finance-reset-current-session.mjs';

const self = 'scripts/pilot-finance-reset-current-session.mjs';
const sourceAdmitted = NO_BACKUP_REQUIRED_SOURCE_FILES.includes(self);
const needsSourceAdmission = { skip: sourceAdmitted ? false : 'Existing source contract frozen: current-session module not yet admitted; no source bypass.' };
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, d = c => c.repeat(64), copy = v => structuredClone(v);
const digest = value => hashBytes(canonicalJson(value));
const sourceContents = Object.fromEntries(await Promise.all(NO_BACKUP_REQUIRED_SOURCE_FILES.map(async name =>
  [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const sourceDescriptors = Object.entries(sourceContents).map(([name, bytes]) => ({ path: name, sha256: hashSourceBytes(bytes) }));
const catalog = [{ kind: 'function', name: 'synthetic.offline_only()', sha256: d('a') }], ledger = [];
const key = 'sb_publishable_synthetic_public_key';
const origin = `https://${NO_BACKUP_PROJECT}.supabase.co`;
const token = changes => [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({
  sub: id(3), session_id: id(4), iss: `${origin}/auth/v1`, role: 'authenticated', aud: 'authenticated',
  is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 300, ...changes,
})).toString('base64url'), 'synthetic_signature_not_a_real_token'].join('.');

function fixture() {
  const semantic = { version: 3, actor_id: id(3), billing_period_start: '2026-10-01', issue_date: '2026-10-01',
    execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october', leases: [
      { lease_id: id(10), term_id: id(11), billing_rule_id: id(12), disposition: 'bill', continue_month_to_month: false,
        rent_amount: '1000.00', management_fee_amount: '100.00', currency: 'USD', recipient_person_id: id(13), collection_route: 'through_ips', due_date: '2026-10-07' },
    ], original_invoice_sources: [{ lease_id: id(10), invoice_id: id(14), row_sha256: d('a') }] };
  const postgresSemanticText = JSON.stringify(semantic, null, 1);
  const evidence = Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, `synthetic-only ${role}`]));
  const review = { format: 'nestory-protected-reset-no-backup-review-v1', recoveryPolicy: NO_BACKUP_POLICY,
    operation: { operationId: id(1), kind: 'reset', restoreOf: null, projectRef: NO_BACKUP_PROJECT, organizationId: NO_BACKUP_ORGANIZATION,
      mainSha: 'a'.repeat(40), sourceGeneration: 0, targetGeneration: 1, cutoff: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-07',
      executionBusinessDate: '2026-10-24', invoiceDatePolicy: 'original-reviewed-october', timezone: 'Asia/Phnom_Penh' },
    schemaSha256: digest(catalog), ledgerSha256: digest(ledger), sourceSnapshotSha256: d('d'), foreignSnapshotSha256: d('e'), archiveRows: 1, actionCount: 1,
    databaseBinding: { manifestSha256: d('1'), planSha256: d('2'), archiveSha256: d('3'), actionSha256: d('4'), zeroReviewSha256: d('5'),
      continuationSemanticSha256: hashBytes(postgresSemanticText), reportReviewSha256: d('7') },
    evidenceReferences: Object.fromEntries(NO_BACKUP_EVIDENCE_ROLES.map(role => [role, hashBytes(evidence[role])])) };
  const packet = prepareNoBackupPacket({ review, sources: sourceDescriptors, sourceContents, evidence,
    candidateHead: review.operation.mainSha, observedBusinessDate: '2026-10-24' });
  const binding = hostedNoBackupBinding(packet, semantic, postgresSemanticText);
  const connection = { expectedProjectRef: NO_BACKUP_PROJECT, host: `db.${NO_BACKUP_PROJECT}.supabase.co`, port: 5432,
    database: 'postgres', user: 'postgres', psqlPath: '/protected/bin/psql', sslRootCertPath: '/protected/root.crt', passwordFilePath: '/protected/existing.pgpass' };
  const observation = { database: 'postgres', sessionUser: 'postgres', readOnly: 'on', authSubject: null, catalog, ledger,
    permissionPins: copy(CURRENT_SESSION_PERMISSION_PINS), actorSourceSha256: '33e62685c3a973aaf9ebf2875f83a9c78232e6123f4d8a953c2cdbce3938ed19',
    organizationId: NO_BACKUP_ORGANIZATION, actorId: id(3), sessionId: id(4), observedAt: new Date(Date.now() - 1000).toISOString(),
    actorCurrent: true, sessionNotAfter: null, stepUpExpiresAt: null };
  return { packet, postgresSemanticText, binding, connection, observation };
}
const options = f => ({ packet: f.packet, postgresSemanticText: f.postgresSemanticText, connection: f.connection });
const expected = f => ({ packet: f.packet, binding: f.binding, postgresSemanticText: f.postgresSemanticText });

function harness(f, behavior = {}) {
  const authCalls = [], processCalls = [], kills = [];
  const request = (url, settings, callback) => {
    authCalls.push({ url, settings }); if (behavior.authStartError) throw Error('PRIVATE_AUTH_DETAIL');
    const req = new EventEmitter(); req.destroy = () => { kills.push('auth'); };
    req.end = () => queueMicrotask(() => {
      if (behavior.authError) { req.emit('error', Error('PRIVATE_AUTH_DETAIL')); return; }
      const res = new PassThrough(); res.statusCode = behavior.status ?? 200;
      res.headers = { 'content-type': behavior.contentType ?? 'application/json', location: 'https://attacker.invalid/' };
      callback(res);
      behavior.afterAuth?.();
      res.end(behavior.authRaw ?? JSON.stringify(behavior.user ?? { id: id(3), role: 'authenticated', is_anonymous: false,
        email: 'PRIVATE_UNRETURNED_EMAIL', user_metadata: { role: 'super_admin', session_id: id(999) } }));
    });
    return req;
  };
  const spawnProcess = (executable, args, settings) => {
    const call = { executable, args, settings, input: '' }; processCalls.push(call);
    if (behavior.processStartError) throw Error('PRIVATE_PROCESS_DETAIL');
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = signal => { kills.push(signal); return true; };
    child.stdin = new Writable({ write(bytes, encoding, done) { call.input += bytes.toString('utf8'); done(); }, final(done) {
      done(); queueMicrotask(() => {
        if (behavior.streamError) { child.stdout.emit('error', Error('PRIVATE_STREAM_DETAIL')); return; }
        behavior.afterProcess?.();
        if (behavior.stderr) child.stderr.write(behavior.stderr);
        child.stdout.write(behavior.rawOutput ?? JSON.stringify(f.observation)); child.emit('close', behavior.code ?? 0, behavior.signal ?? null);
      });
    } });
    return child;
  };
  return { reader: createSyntheticCurrentSessionReaderForTests(options(f), { request, spawnProcess }), authCalls, processCalls, kills };
}

test('production construction is inert and accepts no callback, credential, endpoint or action overrides', () => {
  const f = fixture(); assert.deepEqual(Object.keys(createCurrentSessionReader(options(f))), ['inspect']);
  for (const extra of [{ request() {} }, { spawnProcess() {} }, { accessToken: 'secret' }, { endpoint: origin }, { action: 'reopen' }, { authorityVerified: true }])
    assert.throws(() => createCurrentSessionReader({ ...options(f), ...extra }), /options_invalid/);
  assert.throws(() => createSyntheticCurrentSessionReaderForTests(options(f), { request() {}, spawnProcess() {}, verify() {} }), /test_ports_invalid/);
});
test('fixed direct TLS database target and explicit path boundaries are mandatory', () => {
  const f = fixture();
  for (const changed of [{ host: 'elsewhere.invalid' }, { port: 6543 }, { database: 'other' }, { expectedProjectRef: 'q'.repeat(20) },
    { user: 'postgres\nanything' }, { psqlPath: 'psql' }, { psqlPath: '/protected/bin/sh' }, { passwordFilePath: '//remote/private' },
    { sslRootCertPath: '/safe/../private' }, { passwordFilePath: '/safe/private\nkey' }])
    assert.throws(() => createCurrentSessionReader({ ...options(f), connection: { ...f.connection, ...changed } }), /connection_invalid/);
});
test('raw PostgreSQL semantic bytes are mandatory and cannot be reconstructed', () => {
  const f = fixture();
  for (const raw of [undefined, {}, canonicalJson(JSON.parse(f.postgresSemanticText)), f.postgresSemanticText + ' '])
    assert.throws(() => createCurrentSessionReader({ ...options(f), postgresSemanticText: raw }), /semantic_binding_invalid/);
});
test('wrong, expired, anonymous, service and unscoped credentials fail before all I/O', async () => {
  const f = fixture(), h = harness(f);
  for (const accessToken of ['opaque', 'x'.repeat(16385), token({ exp: Math.floor(Date.now() / 1000) }), token({ exp: 1.5 }),
    token({ role: 'service_role' }), token({ aud: 'anon' }), token({ is_anonymous: true }), token({ is_anonymous: undefined }),
    token({ sub: 'bad' }), token({ session_id: 'bad' }), token({ session_id: null }), token({ iss: 'https://other.supabase.co/auth/v1' })])
    await assert.rejects(h.reader.inspect({ accessToken, publishableKey: key }), /credential_invalid/);
  await assert.rejects(h.reader.inspect({ accessToken: token({ sub: id(999) }), publishableKey: key }), /actor_mismatch/);
  assert.equal(h.authCalls.length, 0); assert.equal(h.processCalls.length, 0);
});
test('only a publishable or same-project anon key is accepted; extra input authority is refused', async () => {
  const f = fixture(), h = harness(f), accessToken = token();
  const syntheticSecretKey = ['sb', 'secret', 'synthetic', 'private', 'key'].join('_');
  for (const publishableKey of ['short', syntheticSecretKey, token({ role: 'service_role', ref: NO_BACKUP_PROJECT }), token({ role: 'anon', ref: 'elsewhere' })])
    await assert.rejects(h.reader.inspect({ accessToken, publishableKey }), /public_key_invalid/);
  for (const extra of [{ observed: true }, { authorizationId: id(9) }, { refreshToken: 'private' }, { url: origin }])
    await assert.rejects(h.reader.inspect({ accessToken, publishableKey: key, ...extra }), /input_invalid/);
  assert.equal(h.authCalls.length, 0); assert.equal(h.processCalls.length, 0);
});
test('an unadmitted source cannot be used even by an explicit test transport', async () => {
  const f = fixture();
  if (sourceAdmitted) {
    const p = f.packet; p.sourceFiles = p.sourceFiles.filter(source => source.path !== self); p.sourcesSha256 = digest(p.sourceFiles);
    const body = { ...p }; delete body.packetSha256; p.packetSha256 = digest(body);
    assert.throws(() => harness(f), /source_coverage_incomplete/); return;
  }
  const h = harness(f);
  await assert.rejects(h.reader.inspect({ accessToken: token(), publishableKey: key }), /source_coverage_invalid/);
  assert.equal(h.authCalls.length, 0); assert.equal(h.processCalls.length, 0);
});
test('copied metadata and caller booleans cannot mint concrete current-session evidence', () => {
  const f = fixture();
  for (const result of [null, {}, { actorId: id(3), sessionId: id(4), transport: 'fixed-auth-and-read-only-psql', authorityVerified: true }])
    assert.throws(() => assertConcreteCurrentSession(result, expected(f)), /concrete_current_session_required/);
});
test('all imported application modules are inside the packet source contract', async () => {
  const visited = new Set();
  async function visit(name) {
    if (visited.has(name)) return; visited.add(name);
    const text = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    for (const match of text.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g)) await visit(`scripts/${match[1]}`);
  }
  await visit(self);
  assert.ok(visited.size > 5);
  for (const name of visited) if (name !== self) assert.ok(NO_BACKUP_REQUIRED_SOURCE_FILES.includes(name), name);
});

test('fixed Auth GET and fixed read-only SQL produce bounded metadata without secrets or authority', needsSourceAdmission, async () => {
  const f = fixture(), h = harness(f), accessToken = token(), result = await h.reader.inspect({ accessToken, publishableKey: key });
  assert.equal(h.authCalls.length, 1); assert.equal(h.processCalls.length, 1);
  const auth = h.authCalls[0], p = h.processCalls[0];
  assert.equal(auth.url, `${origin}/auth/v1/user`); assert.equal(auth.settings.method, 'GET'); assert.equal(auth.settings.rejectUnauthorized, true);
  assert.equal(auth.settings.agent, false); assert.equal(auth.settings.headers.Authorization, `Bearer ${accessToken}`);
  assert.equal(p.settings.shell, false); assert.equal(p.settings.windowsHide, true);
  assert.equal(p.settings.env.PGSSLMODE, 'verify-full'); assert.equal(p.settings.env.PGHOST, `db.${NO_BACKUP_PROJECT}.supabase.co`);
  assert.equal(p.settings.env.PGPASSFILE, f.connection.passwordFilePath);
  for (const field of ['PGPASSWORD', 'PGOPTIONS', 'PGSERVICE', 'SUPABASE_ACCESS_TOKEN']) assert.equal(Object.hasOwn(p.settings.env, field), false);
  assert.match(p.input, /REPEATABLE READ READ ONLY/); assert.match(p.input, /financial_reset_actor_is_current\(/);
  assert.match(p.input, /auth\.uid\(\)/); assert.doesNotMatch(p.input, /set_config|request\.jwt|SET ROLE|INSERT INTO|UPDATE |DELETE FROM|authorize_financial_reset_hosted_action|consume_financial_reset_actor_authorization/);
  for (const value of [accessToken, key, f.connection.passwordFilePath]) assert.equal(p.input.includes(value), false);
  const rendered = JSON.stringify(result);
  for (const value of [accessToken, key, 'PRIVATE_UNRETURNED_EMAIL', 'user_metadata', f.connection.passwordFilePath]) assert.equal(rendered.includes(value), false);
  assert.equal(result.actorId, id(3)); assert.equal(result.sessionId, id(4)); assert.equal(result.baseBindingSha256, digest(f.binding));
  assert.equal(result.transport, 'synthetic-auth-and-process'); assert.equal(result.authorizationIssued, false);
  assert.equal(result.protectedRuntimeVerified, false); assert.equal(result.customerApprovalVerified, false); assert.equal(result.dispatchSupported, false);
  assert.ok(Date.parse(result.expiresAt) - Date.parse(result.observedAt) <= CURRENT_SESSION_LIMITS.freshnessMs);
  assert.ok(Object.isFrozen(result)); assert.throws(() => assertConcreteCurrentSession(result, expected(f)), /concrete_current_session_required/);
  assert.throws(() => assertConcreteCurrentSession({ ...result, transport: 'fixed-auth-and-read-only-psql' }, expected(f)), /concrete_current_session_required/);
});
test('fresh same-actor session is checked directly and no prior forward locator can be borrowed', needsSourceAdmission, async () => {
  const f = fixture(); f.observation.sessionId = id(5); const h = harness(f);
  const result = await h.reader.inspect({ accessToken: token({ session_id: id(5) }), publishableKey: key });
  assert.equal(result.sessionId, id(5)); assert.match(h.processCalls[0].input, new RegExp(id(5)));
  assert.equal(h.processCalls[0].input.includes('financial_reset_actor_authorizations'), false);
  assert.equal(h.processCalls[0].input.includes(id(4)), false);
});
test('Auth identity, rejection, redirect, malformed and oversized responses cannot reach SQL', needsSourceAdmission, async () => {
  for (const behavior of [{ status: 302 }, { status: 401 }, { contentType: 'text/html' }, { authRaw: '{' },
    { authRaw: Buffer.from([0xff]) }, { authRaw: 'x'.repeat(CURRENT_SESSION_LIMITS.authBytes + 1) },
    { user: { id: id(999), role: 'authenticated', is_anonymous: false } }, { user: { id: id(3), role: 'service_role', is_anonymous: false } },
    { user: { id: id(3), role: 'authenticated', is_anonymous: true } }, { user: { id: id(3), role: 'authenticated' } },
    { authStartError: true }, { authError: true }]) {
    const f = fixture(), h = harness(f, behavior);
    await assert.rejects(h.reader.inspect({ accessToken: token(), publishableKey: key }), error => /^current_session_auth_/.test(error.message) && !error.message.includes('PRIVATE'));
    assert.equal(h.processCalls.length, 0);
  }
});
test('expiry is rechecked after Auth verification before opening a database process', needsSourceAdmission, async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const f = fixture(), h = harness(f, { afterAuth: () => { now += 310000; } });
  await assert.rejects(h.reader.inspect({ accessToken: token(), publishableKey: key }), /credential_invalid/);
  assert.equal(h.processCalls.length, 0);
});
test('live revoked or changed actor/session/scope is refused despite successful Auth verification', needsSourceAdmission, async () => {
  for (const changed of [{ actorCurrent: false }, { actorCurrent: null }, { actorCurrent: 'true' }, { actorId: id(999) },
    { sessionId: id(999) }, { organizationId: id(999) }, { sessionNotAfter: new Date(Date.now() - 1000).toISOString() },
    { stepUpExpiresAt: new Date(Date.now() - 1000).toISOString() }, { stepUpExpiresAt: 'not-a-timestamp' }]) {
    const f = fixture(); Object.assign(f.observation, changed); const h = harness(f);
    await assert.rejects(h.reader.inspect({ accessToken: token(), publishableKey: key }), /current_authority_required/);
  }
});
test('existing session and step-up expiry cap metadata without rounding up', needsSourceAdmission, async t => {
  const now = Math.floor(Date.now() / 1000) * 1000; t.mock.method(Date, 'now', () => now);
  const f = fixture(); f.observation.sessionNotAfter = new Date(now + 20000).toISOString();
  f.observation.stepUpExpiresAt = new Date(now + 10000).toISOString().replace('.000Z', '.123456Z');
  const result = await harness(f).reader.inspect({ accessToken: token(), publishableKey: key });
  assert.equal(result.expiresAt, new Date(now + 10123).toISOString());
  const g = fixture(); g.observation.stepUpExpiresAt = new Date(now).toISOString().replace('.000Z', '.000001Z');
  await assert.rejects(harness(g).reader.inspect({ accessToken: token(), publishableKey: key }), /current_authority_required/);
});
test('freshness, schema, ledger and exact permission/helper definitions are independently checked', needsSourceAdmission, async () => {
  for (const [changed, message] of [
    [{ observedAt: new Date(Date.now() - 31000).toISOString() }, /observation_stale/],
    [{ observedAt: new Date(Date.now() + 31000).toISOString() }, /observation_stale/],
    [{ catalog: [] }, /database_definition_changed/], [{ ledger: ['changed'] }, /database_definition_changed/],
    [{ permissionPins: {} }, /database_definition_changed/], [{ actorSourceSha256: d('f') }, /database_definition_changed/],
  ]) {
    const f = fixture(); Object.assign(f.observation, changed);
    await assert.rejects(harness(f).reader.inspect({ accessToken: token(), publishableKey: key }), message);
  }
});
test('database identity, injected claims, output shape and process failures remain closed and sanitized', needsSourceAdmission, async () => {
  for (const changed of [{ database: 'other' }, { sessionUser: 'other' }, { readOnly: 'off' }, { authSubject: id(3) }, { arbitrary: true }]) {
    const f = fixture(); Object.assign(f.observation, changed);
    await assert.rejects(harness(f).reader.inspect({ accessToken: token(), publishableKey: key }), /database_identity_invalid/);
  }
  for (const behavior of [{ rawOutput: '{}\n{}' }, { rawOutput: '{' }, { rawOutput: Buffer.from([0xff]) },
    { stderr: 'PRIVATE_DATABASE_DETAIL' }, { code: 1 }, { signal: 'SIGTERM' }, { processStartError: true }, { streamError: true }]) {
    const f = fixture();
    await assert.rejects(harness(f, behavior).reader.inspect({ accessToken: token(), publishableKey: key }), error => /^current_session_/.test(error.message) && !error.message.includes('PRIVATE'));
  }
});
test('changed checked-out source bytes stop inspection before Auth or SQL', needsSourceAdmission, async () => {
  const f = fixture(), p = f.packet; p.sourceFiles.find(source => source.path === self).sha256 = d('f');
  p.sourcesSha256 = digest(p.sourceFiles); const body = { ...p }; delete body.packetSha256; p.packetSha256 = digest(body);
  f.binding = hostedNoBackupBinding(p, JSON.parse(f.postgresSemanticText), f.postgresSemanticText);
  const h = harness(f);
  await assert.rejects(h.reader.inspect({ accessToken: token(), publishableKey: key }), /source_changed/);
  assert.equal(h.authCalls.length, 0); assert.equal(h.processCalls.length, 0);
});
