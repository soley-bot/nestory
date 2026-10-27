import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { json, sha256, TARGET } from './pilot-finance-reset-core.mjs';
import { buildActionTransactionSql, sqlDoBlock, runBoundResetTransaction, assertFixedLocalEnvironment, assertActionReadiness, untouchedCensusSql, boundedCommandFailure, checkedInvoiceSequenceEvidence, checkedBillingSummary, persistRehearsalEvidence, finishRehearsal } from './pilot-finance-reset-executor-local.mjs';
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
test('exact row images containing dollar delimiters and quotes remain data in one complete SQL block', () => {
  const notes = "O'Reilly $exact_row$ $exact_row_1$ $exact_row_2$; END; $continuation$ \\ backslash";
  for (const kind of ['normalization', 'archive-delete', 'restore']) {
    const row = { ...action(), kind, before_row_text: JSON.stringify({ id, notes, cost_amount: 10, cost_currency: 'USD' }),
      after_row_text: JSON.stringify({ id, notes, cost_amount: null, cost_currency: null }) };
    if (kind === 'archive-delete') { row.after_row_text = null; row.after_sha256 = null; }
    if (kind === 'restore') { row.before_row_text = null; row.before_sha256 = null; row.insert_columns = ['id', 'notes', 'cost_amount', 'cost_currency']; }
    const sql = buildActionTransactionSql(id, [row]);
    const tag = sql.match(/DO (\$exact_row[^$]*\$)/)?.[1];
    assert.equal(tag, '$exact_row_3$');
    assert.equal(sql.split(tag).length, 3);
    assert.ok(sql.includes("O''Reilly $exact_row$ $exact_row_1$ $exact_row_2$"));
    assert.equal(sql, buildActionTransactionSql(id, [row]));
  }
});

test('SQL block delimiter is selected against its complete body, including continuation and catalog values', () => {
  for (const name of ['continuation', 'checked_continuation', 'catalog', 'phase', 'foreign']) {
    const body = `BEGIN PERFORM '$${name}$ $${name}_1$'; END`;
    assert.equal(sqlDoBlock(body, name), `DO $${name}_2$ ${body} $${name}_2$;`);
    assert.equal(sqlDoBlock('BEGIN NULL; END', name), `DO $${name}$ BEGIN NULL; END $${name}$;`);
  }
  assert.throws(() => sqlDoBlock('BEGIN NULL; END', 'bad$tag'));
});
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

const deferredReview = () => {
  const review = checkedReview();
  delete review.reviewSha256;
  review.continuation = { ...review.continuation, version: 2, leases: [{ lease_id: id, term_id: id, billing_rule_id: id,
    disposition: 'defer-expired-unbilled', reason: 'renewal-unconfirmed', source_sha256: 'b'.repeat(64) }] };
  return { ...review, reviewSha256: sha256(json(review)) };
};

test('deferred review keeps its source hash and no invented billing fields in the checked transaction', () => {
  const review = deferredReview(), sql = buildActionTransactionSql(id, [action()], null, review);
  assert.ok(sql.includes(JSON.stringify(review.continuation)));
  assert.match(sql, /"disposition":"defer-expired-unbilled"/);
  assert.doesNotMatch(sql, /"continue_month_to_month"|"rent_amount"|"due_date"|financial_reset_deferred_lease_source/);
  assert.ok(sql.indexOf('apply_financial_reset_reports') < sql.indexOf('COMMIT;'));
});

test('persisted report cannot present reviewed deferred billing as complete or mutate its contract', () => {
  const review = deferredReview();
  const phases = { continuationResult: { billing_complete: false, deferred_lease_count: 1,
    leases: [{ ...review.continuation.leases[0], invoice_id: null, generated_rent_amount: 0, generated_fee_amount: 0, contract_changed: false }] },
  reportResult: { billing_complete: false, deferred_lease_count: 1, reports_persisted: true } };
  assert.deepEqual(checkedBillingSummary(review, phases), { reviewedLeaseDecisionsVerified: true, billingComplete: false, deferredUnbilledLeaseCount: 1 });
  for (const patch of [{ invoice_id: id }, { contract_changed: true }, { source_sha256: hash }, { generated_rent_amount: 1 }]) {
    const changed = structuredClone(phases); Object.assign(changed.continuationResult.leases[0], patch);
    assert.throws(() => checkedBillingSummary(review, changed), /deferred lease/);
  }
  assert.throws(() => checkedBillingSummary(review, { ...phases, reportResult: { ...phases.reportResult, billing_complete: true } }), /completeness/);
  assert.deepEqual(checkedBillingSummary(checkedReview(), { continuationResult: { billing_complete: true, deferred_lease_count: 0, leases: [] },
    reportResult: { billing_complete: true, deferred_lease_count: 0, reports_persisted: true } }),
  { reviewedLeaseDecisionsVerified: true, billingComplete: true, deferredUnbilledLeaseCount: 0 });
});

test('checked zero and continuation execute atomically after actions with derived post-zero source hash', () => {
  const sql = buildActionTransactionSql(id, [action()], null, checkedReview());
  const stages = ['complete_financial_reset_actions', 'apply_financial_reset_known_zero', 'financial_reset_continuation_snapshot',
    'prepare_financial_reset_continuation', 'apply_financial_reset_continuation', 'apply_financial_reset_reports', 'COMMIT;'];
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
  materialized.sourceBinding.validatedSourceArtifacts = ['20261024013615_financial_reset_known_zero_checked_phase.sql',
    '20261024013616_financial_reset_checked_continuation_billing.sql', '20261024013617_financial_reset_phase_recovery_sources.sql',
    '20261024013618_financial_reset_contract_recovery_guards.sql', '20261024013619_financial_reset_archived_property_known_zero.sql',
    '20261024013620_financial_reset_report_finalization_checkpoint.sql',
    '20261024013621_financial_reset_reviewed_deferred_leases_and_deposits.sql'].map(name => ({ name, sha256: hash }));
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

test('server deterministic UUID action identity is preserved without weakening operation identity or duplicate checks', () => {
  const actionId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a={...action(),action_id:actionId};
  const sql=buildActionTransactionSql(id,[a]);
  assert.ok(sql.includes(`arm_financial_reset_action('${id}'::uuid,'${actionId}'::uuid)`));
  assert.equal(a.action_id,actionId);
  assert.throws(()=>buildActionTransactionSql(actionId,[a]),/Invalid action transaction/);
  assert.throws(()=>buildActionTransactionSql(id,[a,{...a,ordinal:2}]),/Unsealed or unsupported row action/);
  for(const invalid of [actionId.replaceAll('-',''),actionId.toUpperCase(),actionId+'x',"'; SELECT 1; --"])
    assert.throws(()=>buildActionTransactionSql(id,[{...a,action_id:invalid}]),/Unsealed or unsupported row action/);
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
  const config = { platform: 'win32', env: {}, actualProjectPath: path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261023'),
    actualRootPath: path.resolve(import.meta.dirname, '..') };
  assertFixedLocalEnvironment(config);
  for (const bad of [{ platform: 'linux' }, { actualProjectPath: 'D:\\nestory' }, { env: { DATABASE_URL: 'postgres://unknown' } },
    { env: { PGDATABASE: 'postgres' } }]) assert.throws(() => assertFixedLocalEnvironment({ ...config, ...bad }));
});

test('checked recovery checkpoint is part of the original restore commit', () => {
  const sql = buildActionTransactionSql(id, [action()], null, null, true);
  assert.ok(sql.indexOf('complete_financial_reset_actions') < sql.indexOf('finalize_financial_reset_recovery'));
  assert.ok(sql.indexOf('finalize_financial_reset_recovery') < sql.indexOf('COMMIT;'));
  assert.equal(sql.match(/COMMIT;/g).length, 1);
  assert.throws(() => buildActionTransactionSql(id, [action()], null, checkedReview(), true));
});

test('lost commit only succeeds with the same durable checkpoint and current generation', async () => {
  for (const kind of ['checked-reports', 'phase-recovery']) {
    let calls = 0;
    const driver = { operationStatus: async () => ({ operationId: id, planSha256: hash, frozen: true,
      status: calls ? 'actions_complete' : 'sealed', checkpointKind: kind, checkpointSha256: hash, checkpointGenerationCurrent: true }),
      executeOperation: async () => { calls++; throw Error('lost acknowledgement'); } };
    const result = await runBoundResetTransaction({ driver, operationId: id, planSha256: hash, expectedCheckpointKind: kind });
    assert.equal(result.commitAcknowledgementRecovered, true); assert.equal(calls, 1);
    for (const changed of [{ checkpointKind: null }, { checkpointKind: 'wrong' }, { checkpointSha256: 'bad' }, { checkpointGenerationCurrent: false }]) {
      const changedDriver = { ...driver, operationStatus: async () => ({ ...await driver.operationStatus(), ...changed }) };
      await assert.rejects(runBoundResetTransaction({ driver: changedDriver, operationId: id, planSha256: hash, expectedCheckpointKind: kind }), /durable verification checkpoint/);
      assert.equal(calls, 1);
    }
  }
});

test('durable evidence is exclusive, exact, and cannot overwrite a different prior report', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pilot-reset-evidence-test-'));
  const file = path.join(directory, 'report.json'), report = { operationId: id, checkpoint: hash };
  const saved = await persistRehearsalEvidence(file, report);
  assert.equal(saved.sha256, sha256(await readFile(file, 'utf8')));
  assert.deepEqual(await persistRehearsalEvidence(file, report), saved);
  await assert.rejects(persistRehearsalEvidence(file, { ...report, checkpoint: 'b'.repeat(64) }), /differs/);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), report);
});

test('rehearsal saves verified evidence before cleanup and retains the clone on export failure', async () => {
  const events = [], clone = { identity: { database: 'synthetic' }, operationIdentities: () => ({ reset: id, restore: id }),
    persistEvidence: async stage => { events.push(stage); return { path: stage, sha256: hash }; },
    cleanup: async () => { events.push('cleanup'); } };
  const report = await finishRehearsal({ clone, result: { verified: true } });
  assert.deepEqual(events, ['verified-before-cleanup', 'cleanup', 'report']);
  assert.equal(report.cleanup.cloneDropped, true);
  events.length = 0;
  await assert.rejects(finishRehearsal({ clone: { ...clone, persistEvidence: async () => { throw Error('disk full'); } }, result: {} }), error => {
    assert.equal(error.rehearsalFailure.cleanupAttempted, false); assert.equal(error.rehearsalFailure.inspectionRequired, true); return true;
  });
  assert.deepEqual(events, []);
});

test('failure evidence preserves original identities and cleanup failure never becomes success', async () => {
  const events = [], failure = Object.assign(Error('verification failed'), { rehearsalFailure: { originalResetOperationId: id, phase: 'verify' } });
  const clone = { identity: {}, operationIdentities: () => ({ reset: id, restore: null }),
    persistEvidence: async stage => { events.push(stage); return { path: stage, sha256: hash }; },
    cleanup: async () => { events.push('cleanup'); } };
  await assert.rejects(finishRehearsal({ clone, failure }), error => error === failure && error.rehearsalFailure.evidence.sha256 === hash &&
    error.rehearsalFailure.cleanupAttempted === false && error.rehearsalFailure.cleanup.cloneDropped === false &&
    error.rehearsalFailure.cleanup.inspectionRequired === true);
  assert.deepEqual(events, ['failure-before-cleanup']);
  await assert.rejects(finishRehearsal({ clone: { ...clone, cleanup: async () => { throw Error('cleanup failed'); } }, result: {} }), error =>
    error.rehearsalFailure.cleanup.inspectionRequired === true && error.rehearsalFailure.reset === id);
  await assert.rejects(finishRehearsal({ clone: { ...clone, persistEvidence: async stage => {
    if (stage === 'report') throw Error('final file unavailable');
    return { path: stage, sha256: hash };
  } }, result: {} }), error => error.rehearsalFailure.finalReportPersisted === false &&
    error.rehearsalFailure.cleanup.cloneDropped === true && error.rehearsalFailure.evidence.sha256 === hash);
});
