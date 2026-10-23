import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { json, sha256, TARGET } from './pilot-finance-reset-core.mjs';
import { buildActionTransactionSql, runBoundResetTransaction, assertFixedLocalEnvironment, assertActionReadiness, untouchedCensusSql, boundedCommandFailure, checkedInvoiceSequenceEvidence } from './pilot-finance-reset-executor-local.mjs';
const id = '12345678-1234-4123-8123-123456789abc', hash = 'a'.repeat(64);
test('checked invoice sequence consumes exact new invoice count without rewinding or changing other evidence', () => {
  const sequence = { kind: 'sequence', table: 'public.owner_invoice_number_seq', lastValue: 14, isCalled: true };
  const other = { kind: 'sequence', table: 'public.owner_payment_number_seq', lastValue: 7, isCalled: true };
  const master = { kind: 'table', table: 'public.leases', rows: 5, sha256: hash };
  const evidence = [sequence, other, master];
  assert.deepEqual(checkedInvoiceSequenceEvidence(evidence, 3), [{ ...sequence, lastValue: 17 }, other, master]);
  assert.equal(sequence.lastValue, 14);
  assert.deepEqual(checkedInvoiceSequenceEvidence(evidence, 0), evidence);
  assert.deepEqual(checkedInvoiceSequenceEvidence([{ ...sequence, lastValue: 1, isCalled: false }], 3), [{ ...sequence, lastValue: 3 }]);
  assert.deepEqual(checkedInvoiceSequenceEvidence([{ ...sequence, isCalled: false }], 0), [{ ...sequence, isCalled: false }]);
  for (const count of [-1, null, 0.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => checkedInvoiceSequenceEvidence(evidence, count));
  assert.throws(() => checkedInvoiceSequenceEvidence([other], 1));
  assert.throws(() => checkedInvoiceSequenceEvidence([sequence, sequence], 1));
  assert.throws(() => checkedInvoiceSequenceEvidence([{ ...sequence, lastValue: Number.MAX_SAFE_INTEGER + 1 }], 1));
});
const action = () => ({ action_id: id, ordinal: 1, relation_name: 'public.timeline_events', primary_key: { id },
  kind: 'normalization', before_row_text: '{"id":"'+id+'","cost_amount":10,"cost_currency":"USD"}',
  after_row_text: '{"id":"'+id+'","cost_amount":null,"cost_currency":null}', before_sha256: hash, after_sha256: hash,
  changed_columns: ['cost_amount', 'cost_currency'] });
const checkedReview = () => {
  const review = { format: 'nestory-synthetic-checked-reset-phase-review-v1', syntheticOnly: true, customerApproval: false,
    manifestSha256: hash, actionsSha256: hash,
    zero: { makerActorId: '00000000-0000-0000-0000-000000000101', reviewerActorId: '00000000-0000-0000-0000-000000000501',
      effectiveDate: TARGET.cutoff, currencies: ['USD'], scopes: [{ property_id: id, property_owner_id: id, owner_person_id: id,
        ownership_percent: 100, ownership_roster_hash: hash, property_row_sha256: hash, property_archived_at: null, currency: 'USD' }] },
    continuation: { version: 1, actor_id: '00000000-0000-0000-0000-000000000101', billing_period_start: TARGET.cutoff,
      issue_date: '2026-10-23', leases: [{ lease_id: id, term_id: id, billing_rule_id: id, continue_month_to_month: true,
        rent_amount: '100.00', management_fee_amount: '0.00', currency: 'USD', recipient_person_id: id,
        collection_route: 'through_ips', due_date: '2026-10-05' }] } };
  return { ...review, reviewSha256: sha256(json(review)) };
};

test('checked zero and continuation execute atomically after actions with derived post-zero source hash', () => {
  const sql = buildActionTransactionSql(id, [action()], null, checkedReview());
  const stages = ['complete_financial_reset_actions', 'apply_financial_reset_known_zero', 'financial_reset_continuation_snapshot',
    'prepare_financial_reset_continuation', 'apply_financial_reset_continuation', 'COMMIT;'];
  for (let i = 1; i < stages.length; i++) assert.ok(sql.indexOf(stages[i - 1]) < sql.indexOf(stages[i]));
  assert.equal(sql.match(/COMMIT;/g).length, 1);
  assert.match(sql, /request\.jwt\.claim\.sub/);
  assert.doesNotMatch(sql, /aal|session_id|approve_financial_reset_zero_plan|INSERT INTO.*approvals|status='open'/);
  assert.throws(() => buildActionTransactionSql(id, [action()], null, { ...checkedReview(), customerApproval: true }));
  assert.doesNotMatch(buildActionTransactionSql(id, [action()]), /known_zero|continuation|jwt/);
});

test('checked mode needs every phase and recovery migration binding while raw mode remains independent', () => {
  const materialized = { syntheticOnly: true, customerApproval: false, executionSupported: false,
    blockers: [{ code: 'known_zero_authority_unimplemented' }], sourceBinding: { validatedSourceArtifacts: [] } };
  assert.throws(() => assertActionReadiness(materialized, 'rehearseCheckedReset'), /migration authority/);
  assert.doesNotThrow(() => assertActionReadiness(materialized, 'rehearseArchiveRestore'));
  materialized.sourceBinding.validatedSourceArtifacts = ['20261023104000_financial_reset_known_zero_checked_phase.sql',
    '20261023105000_financial_reset_checked_continuation_billing.sql', '20261023110000_financial_reset_phase_recovery_sources.sql',
    '20261023111000_financial_reset_contract_recovery_guards.sql', '20261023112000_financial_reset_archived_property_known_zero.sql'].map(name => ({ name, sha256: hash }));
  assert.doesNotThrow(() => assertActionReadiness(materialized, 'rehearseCheckedReset'));
  for (const omitted of materialized.sourceBinding.validatedSourceArtifacts) {
    const changed = structuredClone(materialized);
    changed.sourceBinding.validatedSourceArtifacts = changed.sourceBinding.validatedSourceArtifacts.filter(item => item.name !== omitted.name);
    assert.throws(() => assertActionReadiness(changed, 'rehearseCheckedReset'), /migration authority/);
  }
  assert.throws(() => assertActionReadiness(materialized, 'fullReset'));
});

test('phase recovery DML uses exact prunes and named predecessor repair fields', () => {
  const prune = { ...action(), kind: 'recovery-prune', after_row_text: null, after_sha256: null, changed_columns: [] };
  assert.match(buildActionTransactionSql(id, [prune]), /DELETE FROM.*AND to_jsonb\(t\)=/);
  const repair = { ...action(), kind: 'recovery-repair', relation_name: 'public.lease_terms', changed_columns: ['status', 'updated_at', 'updated_by'] };
  const sql = buildActionTransactionSql(id, [repair]);
  assert.match(sql, /UPDATE "public"\."lease_terms" t SET "status"=/);
  assert.doesNotMatch(sql, /INSERT INTO|DISABLE TRIGGER/);
});

test('command diagnostics expose SQLSTATE and safe constraint name without SQL or values', () => {
  const error = boundedCommandFailure({ code: 1 }, 'psql:<stdin>:42: ERROR: 23514: private customer payload\nDETAIL: Failing row contains secret.\nCONSTRAINT NAME: example_check\nCONTEXT: PL/pgSQL function app_private.example_guard(secret) line 76 at RAISE\nSTATEMENT: DELETE private stuff');
  assert.match(error.message, /SQLSTATE 23514; constraint example_check/);
  assert.doesNotMatch(error.message, /customer|secret|DELETE|stuff/);
  assert.match(error.message, /functions app_private.example_guard:76/);
  assert.doesNotMatch(boundedCommandFailure({}, 'CONSTRAINT NAME: unsafe value').message, /unsafe/);
});

test('rehearsal authorizes only the explicit synthetic single known-zero blocker', () => {
  const materialized = { syntheticOnly: true, customerApproval: false, executionSupported: false,
    blockers: [{ code: 'known_zero_authority_unimplemented' }] };
  assert.doesNotThrow(() => assertActionReadiness(materialized, 'rehearseArchiveRestore'));
  assert.throws(() => assertActionReadiness(materialized, 'fullReset'));
  for (const changed of [{ syntheticOnly: false }, { customerApproval: true }, { executionSupported: true },
    { blockers: [] }, { blockers: [...materialized.blockers, { code: 'retirement_unimplemented' }] },
    { blockers: [{ code: 'retirement_unimplemented' }] }]) {
    assert.throws(() => assertActionReadiness({ ...materialized, ...changed }, 'rehearseArchiveRestore'));
  }
  assert.throws(() => assertActionReadiness(materialized, 'unknown'));
});

test('restore inserts omit generated fields while retaining the complete sealed after image', () => {
  const insert = { ...action(), kind: 'restore', before_row_text: null, before_sha256: null,
    after_row_text: '{"id":"'+id+'","amount":12,"signed_amount":-12}', insert_columns: ['id', 'amount'], changed_columns: [] };
  const sql = buildActionTransactionSql(id, [insert]);
  assert.match(sql, /INSERT INTO "public"\."timeline_events"\("id","amount"\)/);
  assert.match(sql, /"signed_amount":-12/);
  assert.doesNotMatch(sql, /INSERT INTO[^\n]+"signed_amount"/);
  for (const changed of [{ insert_columns: [] }, { insert_columns: ['id', 'id'] }, { before_sha256: hash }]) {
    assert.throws(() => buildActionTransactionSql(id, [{ ...insert, ...changed }]));
  }
});

test('untouched census excludes only exact archived identities and target private metadata', () => {
  const sql = untouchedCensusSql([
    { kind: 'table', schema: 'public', name: 'timeline_events' },
    { kind: 'table', schema: 'public', name: 'properties' },
    { kind: 'table', schema: 'app_private', name: 'financial_reset_actions' },
    { kind: 'table', schema: 'auth', name: 'users' },
    { kind: 'sequence', schema: 'public', name: 'example_seq' },
  ], { tables: [{ table: 'public.timeline_events', pk: ['id'] }] },
  { archiveRows: [{ table: 'public.timeline_events', pk: [id] }] });
  assert.match(sql, /WHERE NOT \(\(to_jsonb\(t\)->'id'=/);
  assert.match(sql, /FROM "public"\."properties" t\s*;/);
  assert.match(sql, /FROM "auth"\."users" t\s*;/);
  assert.match(sql, /organization_id.*00000000-0000-0000-0000-000000000001/);
  assert.match(sql, /last_value,'isCalled',is_called/);
  assert.throws(() => untouchedCensusSql([{ kind: 'table', schema: 'public', name: 'timeline_events' }],
    { tables: [] }, { archiveRows: [{ table: 'public.timeline_events', pk: [id] }] }));
});
test('exact action SQL names only changed fields and requires one matching full row', () => {
  const sql = buildActionTransactionSql(id, [action()]);
  assert.match(sql, /SET "cost_amount"=/); assert.match(sql, /,"cost_currency"=/);
  assert.doesNotMatch(sql, /SET "title"|DISABLE TRIGGER|session_replication_role/);
  assert.match(sql, /AND to_jsonb\(t\)=/); assert.match(sql, /affected<>1/);
  assert.ok(sql.indexOf('arm_financial_reset_action') < sql.indexOf('UPDATE "public"'));
  assert.ok(sql.indexOf('complete_financial_reset_actions') < sql.indexOf('COMMIT'));
});
test('SQL builder rejects injection, unsupported verbs, noncontiguous actions and key mutation', () => {
  for (const mutate of [a => { a.relation_name = 'public.timeline_events;DROP TABLE people'; },
    a => { a.kind = 'arbitrary'; }, a => { a.ordinal = 2; }, a => { a.changed_columns = ['id']; },
    a => { a.changed_columns = ['cost_amount;SELECT 1']; }, a => { a.action_id = 'bad'; }]) {
    const a = action(); mutate(a); assert.throws(() => buildActionTransactionSql(id, [a]));
  }
  assert.throws(() => buildActionTransactionSql(id, [action()], 2));
  const sql = buildActionTransactionSql(id, [action()], 1);
  assert.ok(sql.indexOf('Injected reset action rollback') < sql.indexOf('complete_financial_reset_actions'));
});
test('unknown commit checks original UUID and never resubmits a committed operation', async () => {
  const seen = []; let calls = 0;
  const driver = { operationStatus: async operationId => { seen.push(operationId); return { operationId, planSha256: hash, frozen: true, status: calls ? 'actions_complete' : 'sealed' }; },
    executeOperation: async operationId => { assert.equal(operationId, id); calls++; throw Error('lost COMMIT acknowledgement'); } };
  const result = await runBoundResetTransaction({ driver, operationId: id, planSha256: hash });
  assert.equal(result.commitAcknowledgementRecovered, true); assert.equal(result.actualResetRecoveryProven, false);
  assert.deepEqual(seen, [id, id]); assert.equal(calls, 1);
  assert.equal((await runBoundResetTransaction({ driver, operationId: id, planSha256: hash })).replay, true);
  assert.equal(calls, 1);
});
test('rolled back and still-executing outcomes cannot become success or a new operation', async () => {
  for (const final of ['sealed', 'executing']) {
    let calls = 0;
    const driver = { operationStatus: async operationId => ({ operationId, planSha256: hash, frozen: true, status: calls ? final : 'sealed' }),
      executeOperation: async () => { calls++; throw Error('connection lost'); } };
    await assert.rejects(runBoundResetTransaction({ driver, operationId: id, planSha256: hash }));
    assert.equal(calls, 1);
  }
});
test('changed operation binding or reopened control fails before execution', async () => {
  for (const bad of [{ operationId: 'other' }, { planSha256: 'b'.repeat(64) }, { frozen: false }]) {
    let writes = 0;
    const driver = { operationStatus: async () => ({ operationId: id, planSha256: hash, frozen: true, status: 'sealed', ...bad }),
      executeOperation: async () => { writes++; } };
    await assert.rejects(runBoundResetTransaction({ driver, operationId: id, planSha256: hash })); assert.equal(writes, 0);
  }
});
test('native path rejects source/database overrides and non-Windows execution', () => {
  const config = { platform: 'win32', env: {}, actualProjectPath: path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261022'),
    actualRootPath: path.resolve(import.meta.dirname, '..') };
  assertFixedLocalEnvironment(config);
  for (const bad of [{ platform: 'linux' }, { actualProjectPath: 'D:\\nestory' }, { env: { DATABASE_URL: 'postgres://unknown' } },
    { env: { PGDATABASE: 'postgres' } }]) assert.throws(() => assertFixedLocalEnvironment({ ...config, ...bad }));
});
