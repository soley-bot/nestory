import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertRetiredJournalIntent, assertRetiredJournalSlot, assertRetiredJournalLogicalEdge } from './pilot-finance-reset-retired-journal-core.mjs';

const id = n => `fa240215-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const intentTable = 'app_private.deposit_rent_journal_intents', slotTable = 'app_private.deposit_rent_journal_slots';
const identity = row => ({ table: row.table, pk: row.pk });
const payloadHash = p => sha(JSON.stringify(['deposit-rent-journal-payload-v1', p.operation, p.leaseId, p.date, p.reason,
  ...(p.operation === 'apply' ? [p.depositId, p.invoiceId, p.lineId, p.amount] : [p.applicationId])]));
function wrap(table, values, text = JSON.stringify(values)) {
  const pk = table === intentTable ? [values.token] : table === slotTable ? [values.organization_id, values.actor_id, values.lease_id] : [values.id];
  return { table, pk, values, rowText: text, sha256: sha(text) };
}
function decision(row, kind = 'retain-retired-deposit-rent-intent') {
  return { ...identity(row), kind, beforeSha256: row.sha256, changes: [], preserveAllUnlistedColumns: true,
    expectedStoredAfterSha256: null, afterImageVerified: false };
}
function intent(state = 'preview', operation = 'apply') {
  const payload = { operation, leaseId: id(30), date: '2026-10-24', reason: 'Synthetic journal retirement',
    ...(operation === 'apply' ? { depositId: id(31), invoiceId: id(32), lineId: id(33), amount: '20.00' } : { applicationId: id(34) }) };
  const values = { token: id(40), idempotency_key: id(41), organization_id: id(1), actor_id: id(10), lease_id: id(30),
    property_id: id(2), unit_id: null, deposit_id: id(31), invoice_id: id(32), payload, payload_hash: payloadHash(payload),
    snapshot_hash: 'a'.repeat(64), authorization_hash: 'b'.repeat(64), expires_at: '2026-10-24T02:05:00+00:00',
    created_at: '2026-10-24T02:00:00+00:00', state, revision: state === 'preview' ? 1 : 3,
    result_id: state === 'resolved' ? id(35) : null,
    result_message: state === 'preview' ? null : state === 'resolved' ? 'Checked financial action resolved.' : 'Checked action rolled back.',
    financial_generation: 0 };
  const row = wrap(intentTable, values);
  return { row, decision: decision(row), migrationBound: true };
}
function rebind(input, mutate) {
  const copy = structuredClone(input); mutate(copy.row.values);
  copy.row = wrap(copy.row.table, copy.row.values); copy.decision = { ...copy.decision, pk: copy.row.pk, beforeSha256: copy.row.sha256 };
  return copy;
}
function slot(state = 'preview', operation = 'apply') {
  const parentInput = intent(state, operation), p = parentInput.row.values;
  const row = wrap(slotTable, { organization_id: p.organization_id, actor_id: p.actor_id, lease_id: p.lease_id, current_token: p.token });
  return { row, decision: { ...decision(row, 'retain-retired-deposit-rent-slot'), parent: { ...identity(parentInput.row), sha256: parentInput.row.sha256 } },
    parent: parentInput.row, parentDecision: parentInput.decision, migrationBound: true };
}
function edgeFixture(column = 'invoice_id', operation = 'apply') {
  const input = intent(column === 'result_id' ? 'resolved' : 'preview', operation), v = input.row.values;
  const target = column === 'invoice_id'
    ? wrap('public.tenant_invoices', { id: v.invoice_id, organization_id: v.organization_id, property_id: v.property_id, unit_id: v.unit_id, lease_id: v.lease_id })
    : wrap('public.deposit_rent_applications', { id: v.result_id, organization_id: v.organization_id, property_id: v.property_id,
      unit_id: v.unit_id, lease_deposit_id: v.deposit_id, invoice_id: v.invoice_id, created_by: v.actor_id,
      reversal_of_application_id: operation === 'reverse' ? v.payload.applicationId : null });
  return { edge: { kind: 'static-reference', column, source: identity(input.row), target: identity(target) }, row: input.row, target,
    sourceAction: { ...identity(input.row), kind: input.decision.kind, beforeSha256: input.row.sha256, beforeRowText: input.row.rowText,
      allowedAfterRowText: input.row.rowText, changedColumns: [], expectedStoredAfterSha256: null, storedImageVerified: false }, targetRemoved: true };
}

test('accepts only unchanged reviewed generation-zero unused and terminal intents', () => {
  for (const state of ['preview', 'resolved', 'rejected']) for (const operation of ['apply', 'reverse']) {
    const input = intent(state, operation), before = structuredClone(input);
    assert.doesNotThrow(() => assertRetiredJournalIntent(input)); assert.deepEqual(input, before);
  }
  assert.equal(intent().row.values.payload_hash, '63dc9f95350fbd53a9e2f970f9555208d6b2b658b8e14e1e2bb784967120a11f');
});

test('matches shared independent SQL/JavaScript Unicode and decimal canonical vectors', () => {
  const vectors = JSON.parse(readFileSync(new URL('./deposit-rent-journal-canonical-vectors.json', import.meta.url), 'utf8'));
  for (const vector of vectors) {
    const fields = JSON.parse(vector.canonicalText), input = intent('preview', fields[1]);
    const p = { operation: fields[1], leaseId: fields[2], date: fields[3], reason: fields[4],
      ...(fields[1] === 'apply' ? { depositId: fields[5], invoiceId: fields[6], lineId: fields[7], amount: fields[8] } : { applicationId: fields[5] }) };
    const bound = rebind(input, v => { v.lease_id = p.leaseId; v.payload = p; v.payload_hash = vector.sha256;
      if (p.operation === 'apply') { v.deposit_id = p.depositId; v.invoice_id = p.invoiceId; } });
    assert.doesNotThrow(() => assertRetiredJournalIntent(bound), vector.name);
  }
});

test('preserves Unicode whitespace and exact maximal decimal cents without Number coercion', () => {
  const input = rebind(intent(), v => { v.payload.reason = '\u00a0Khmer ខ្មែរ 😀\u00a0'; v.payload.amount = '999999999999.99'; v.payload_hash = payloadHash(v.payload); });
  const before = structuredClone(input); assert.doesNotThrow(() => assertRetiredJournalIntent(input)); assert.deepEqual(input, before);
  assert.throws(() => assertRetiredJournalIntent(rebind(input, v => { v.payload.reason = v.payload.reason.trim(); })), /payload hash/);
});

test('rejects attempted or malformed state/result/revision instead of treating expiry as retirement', () => {
  for (const mutate of [v => { v.state = 'attempted'; v.revision = 2; }, v => { v.state = 'unknown'; },
    v => { v.revision = 2; }, v => { v.result_id = id(99); }, v => { v.result_message = 'Invented'; },
    v => { v.state = 'resolved'; v.revision = 3; v.result_message = 'Missing result id'; },
    v => { v.state = 'rejected'; v.revision = 3; v.result_message = ''; },
    v => { v.state = 'resolved'; v.revision = 4; v.result_id = id(99); v.result_message = 'Wrong transition'; }]) {
    assert.throws(() => assertRetiredJournalIntent(rebind(intent(), mutate)), /attempted, uncertain/);
  }
});

test('rejects current, future, negative, missing or string generations', () => {
  for (const generation of [1, 2, -1, '0', null]) assert.throws(() => assertRetiredJournalIntent(rebind(intent(), v => { v.financial_generation = generation; })), /generation zero/);
  assert.throws(() => assertRetiredJournalIntent(rebind(intent(), v => { delete v.financial_generation; })), /shape/);
});

test('rejects incomplete review, changed sources, missing migration and mutation requests', () => {
  for (const mutate of [x => { x.migrationBound = false; }, x => { x.migrationBound = 1; }, x => { x.decision.beforeSha256 = 'f'.repeat(64); },
    x => { x.decision.pk = [id(99)]; }, x => { x.decision.kind = 'archive-remove'; }, x => { x.decision.preserveAllUnlistedColumns = false; },
    x => { x.decision.changes = [{ column: 'state', after: 'resolved' }]; }, x => { x.decision.afterImageVerified = true; },
    x => { x.decision.expectedStoredAfterSha256 = x.row.sha256; }, x => { x.row.values.actor_id = id(99); },
    x => { x.row.rowText += ' '; }, x => { x.row.pk = [id(99)]; }]) {
    const input = intent(); mutate(input); assert.throws(() => assertRetiredJournalIntent(input));
  }
});

test('checks any explicitly supplied generation retirement condition', () => {
  const input = intent(); input.decision.retirementCondition = { oldGeneration: 0, newGenerationMustBeGreaterThan: 0, controlMustRemainFrozen: true };
  assert.doesNotThrow(() => assertRetiredJournalIntent(input));
  for (const key of Object.keys(input.decision.retirementCondition)) {
    const bad = structuredClone(input); bad.decision.retirementCondition[key] = key === 'controlMustRemainFrozen' ? false : 1;
    assert.throws(() => assertRetiredJournalIntent(bad), /generation condition/);
  }
});

test('rejects extra, malformed or foreign payload identifiers even after rebinding row hashes', () => {
  for (const mutate of [v => { v.payload.invoiceId = id(98); }, v => { v.payload.depositId = id(98); },
    v => { v.payload.leaseId = id(98); }, v => { v.payload.lineId = 'not-a-uuid'; }, v => { v.payload.extra = true; },
    v => { v.payload.date = '2026-02-31'; }, v => { v.payload.date = '0000-01-01'; }, v => { v.payload.reason = '  not stored canonical  '; },
    v => { v.payload.reason = '\ud800bad'; }, v => { v.payload.reason = 'bad\u0000reason'; }]) {
    assert.throws(() => assertRetiredJournalIntent(rebind(intent(), v => { mutate(v); v.payload_hash = payloadHash(v.payload); })));
  }
});

test('rejects rounded, noncanonical, negative and out-of-range decimal payloads', () => {
  for (const amount of [20, '20', '020.00', '20.000', '2e1', '-20.00', '0.00', '1000000000000.00', 'NaN', 'Infinity']) {
    assert.throws(() => assertRetiredJournalIntent(rebind(intent(), v => { v.payload.amount = amount; v.payload_hash = payloadHash(v.payload); })), /decimal amount/);
  }
  assert.throws(() => assertRetiredJournalIntent(rebind(intent(), v => { v.payload_hash = sha(JSON.stringify(v.payload)); })), /payload hash/);
});

test('rejects duplicate decoded JSON keys at root and inside the hashed payload', () => {
  for (const change of [text => text.replace('"state":"preview"', '"state":"rejected","state":"preview"'),
    text => text.replace('"reason":"Synthetic journal retirement"', '"reason":"Synthetic journal retirement","\\u0072eason":"Synthetic journal retirement"')]) {
    const input = intent(); input.row.rowText = change(input.row.rowText); input.row.sha256 = sha(input.row.rowText); input.decision.beforeSha256 = input.row.sha256;
    assert.throws(() => assertRetiredJournalIntent(input), /duplicate JSON keys/);
  }
});

test('accepts only the exact unchanged slot with its separately reviewed safe parent', () => {
  for (const state of ['preview', 'resolved', 'rejected']) {
    const input = slot(state), before = structuredClone(input);
    assert.doesNotThrow(() => assertRetiredJournalSlot(input)); assert.deepEqual(input, before);
  }
});

test('rejects null, foreign actor/org/lease, wrong token and changed slot primary keys', () => {
  for (const field of ['organization_id', 'actor_id', 'lease_id', 'current_token']) {
    for (const value of [null, id(99)]) {
      const input = slot(); input.row.values[field] = value; input.row = wrap(slotTable, input.row.values);
      input.decision.pk = input.row.pk; input.decision.beforeSha256 = input.row.sha256;
      assert.throws(() => assertRetiredJournalSlot(input));
    }
  }
  const input = slot(); input.row.pk.reverse(); assert.throws(() => assertRetiredJournalSlot(input));
});

test('rejects absent or unreviewed, changed, attempted and mismatched parent evidence', () => {
  for (const mutate of [x => { delete x.parent; }, x => { delete x.parentDecision; }, x => { x.decision.parent.sha256 = 'f'.repeat(64); },
    x => { x.decision.parent.pk = [id(99)]; }, x => { x.parentDecision.kind = 'archive-remove'; }, x => { x.parentDecision.beforeSha256 = 'f'.repeat(64); },
    x => { x.parent.values.actor_id = id(99); }, x => { x.migrationBound = false; }]) {
    const input = slot(); mutate(input); assert.throws(() => assertRetiredJournalSlot(input));
  }
  const input = slot(); input.parent = rebind(intent(), v => { v.state = 'attempted'; v.revision = 2; }).row;
  input.parentDecision = decision(input.parent); input.decision.parent.sha256 = input.parent.sha256;
  assert.throws(() => assertRetiredJournalSlot(input), /attempted, uncertain/);
});

test('permits only exact archived invoice and resolved application logical references', () => {
  for (const column of ['invoice_id', 'result_id']) for (const operation of ['apply', 'reverse']) {
    const input = edgeFixture(column, operation), before = structuredClone(input);
    assert.doesNotThrow(() => assertRetiredJournalLogicalEdge(input)); assert.deepEqual(input, before);
  }
  const result = edgeFixture('result_id'); result.edge.kind = 'polymorphic-reference';
  assert.doesNotThrow(() => assertRetiredJournalLogicalEdge(result));
});

test('logical validation preserves exact financial numeric lexemes in captured targets', () => {
  const input = edgeFixture();
  const text = input.target.rowText.replace(/}$/, ',"total_amount":9007199254740993.1200}');
  input.target = wrap(input.target.table, JSON.parse(text), text);
  const before = structuredClone(input); assert.doesNotThrow(() => assertRetiredJournalLogicalEdge(input)); assert.deepEqual(input, before);
  assert.match(input.target.rowText, /9007199254740993\.1200/);
});

test('rejects physical slot FKs, unrelated columns/tables and unremoved target rows', () => {
  for (const mutate of [x => { x.edge.kind = 'foreign-key'; }, x => { x.edge.kind = 'polymorphic-reference'; },
    x => { x.edge.column = 'deposit_id'; }, x => { x.edge.column = 'result_id'; }, x => { x.targetRemoved = false; },
    x => { x.target.table = 'public.leases'; x.edge.target.table = x.target.table; }, x => { x.edge.source.pk = [id(99)]; },
    x => { x.edge.target.pk = [id(99)]; }, x => { x.sourceAction.kind = 'retain-retired-deposit-rent-slot'; }]) {
    const input = edgeFixture(); mutate(input); assert.throws(() => assertRetiredJournalLogicalEdge(input));
  }
  const input = slot();
  assert.throws(() => assertRetiredJournalLogicalEdge({ edge: { kind: 'foreign-key', column: 'current_token', source: identity(input.row), target: identity(input.parent) },
    row: input.row, target: input.parent, sourceAction: {}, targetRemoved: true }));
});

test('rejects foreign or changed invoice and resolved-result lineage', () => {
  for (const column of ['invoice_id', 'result_id']) {
    const fields = ['organization_id', 'property_id', 'unit_id', ...(column === 'invoice_id' ? ['lease_id'] : ['lease_deposit_id', 'invoice_id', 'created_by', 'reversal_of_application_id'])];
    for (const field of fields) {
      const input = edgeFixture(column); input.target.values[field] = id(99); input.target = wrap(input.target.table, input.target.values);
      assert.throws(() => assertRetiredJournalLogicalEdge(input));
    }
  }
});

test('rejects changed source-action images, identities, hashes or stored-image claims', () => {
  for (const mutate of [a => { a.beforeSha256 = 'f'.repeat(64); }, a => { a.beforeRowText += ' '; }, a => { a.allowedAfterRowText += ' '; },
    a => { a.changedColumns = ['state']; }, a => { a.expectedStoredAfterSha256 = 'f'.repeat(64); }, a => { a.storedImageVerified = true; }, a => { a.pk = [id(99)]; }]) {
    const input = edgeFixture(); mutate(input.sourceAction); assert.throws(() => assertRetiredJournalLogicalEdge(input));
  }
});
