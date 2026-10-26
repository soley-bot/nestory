import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGET, json, sha256 } from './pilot-finance-reset-core.mjs';
import { patchRowText, materializeResetActions, materializeRestoreActions, assertCheckedPhaseReview, orderRecoverySources, historicalRestoreRemovalEdges } from './pilot-finance-reset-executor-plan.mjs';

const hash = 'a'.repeat(64), id = '00000000-0000-4000-8000-000000000099';
const seal = (value, field) => { const body = { ...value }; delete body[field]; return { ...body, [field]: sha256(json(body)) }; };
function fixture() {
  const rowText = `{"id": "${id}", "amount": 9007199254740993.00, "status": "held", "received_on": null, "returned_on": null, "organization_id": "${TARGET.organization}"}`;
  const row = { table: 'public.lease_deposits', pk: [id], rowText, sha256: sha256(rowText) };
  const inventory = seal({ format: 'nestory-local-finance-reset-inventory-v1', syntheticOnly: true, inventoryAccepted: true, issues: [],
    binding: { ...TARGET, candidateHead: TARGET.baseSha, schemaSha256: hash, migrationsSha256: hash, containerId: hash,
      endpoint: 'local', candidateSources: [], fixtureArtifacts: [] },
    tables: [{ table: row.table, pk: ['id'], policy: { disposition: 'normalize-reviewed', scope: 'organization_id' },
      nullableColumns: ['received_on', 'returned_on'], foreignKeys: [], selectedRows: [{ pk: row.pk, sha256: row.sha256 }] }] }, 'manifestSha256');
  const snapshot = seal({ format: 'synthetic-row-review-supplement-v1', manifestSha256: inventory.manifestSha256,
    containerId: hash, endpoint: 'local', rows: [row] }, 'sha256');
  const dependencyPlan = seal({ manifestSha256: inventory.manifestSha256, dependencies: [] }, 'planSha256');
  const review = seal({ format: 'synthetic-finance-reset-exact-review-proposal-v1', syntheticOnly: true, customerApproval: false, executionSupported: false,
    sourceBinding: { manifestSha256: inventory.manifestSha256, planSha256: dependencyPlan.planSha256, supplementSha256: snapshot.sha256,
      candidateHead: TARGET.baseSha, schemaSha256: hash, migrationsSha256: hash, candidateSources: [], validatedSourceArtifacts: [] },
    normalizationDecisions: [{ table: row.table, pk: row.pk, kind: 'normalize-cash-status', beforeSha256: row.sha256,
      preserveAllUnlistedColumns: true, expectedStoredAfterSha256: null, afterImageVerified: false,
      changes: [{ column: 'status', before: 'held', after: 'pending' }] }], retirementDecisions: [], cycleBreakDecisions: [],
    graphResolution: { candidateRemovalOrder: [], candidateRestoreInsertionOrder: [], remainingEdges: [], removedForeignKeyEdges: [], conditionallyRetiredLogicalEdges: [] } }, 'reviewSha256');
  return { inventory, dependencyPlan, snapshot, review };
}
function changedReview(change) { const input = fixture(); change(input.review); input.review = seal(input.review, 'reviewSha256'); return input; }

function provenancePairFixture(shape = 'allocation') {
  const input = fixture(), sourceId = '00000000-0000-4000-8000-000000000091';
  const [sourceTable, sourceType, childTable, linkColumn] = shape === 'allocation'
    ? ['public.ledger_entries', 'owner_collection_allocation', 'public.owner_collection_confirmation_allocations', 'ledger_entry_id']
    : ['public.owner_invoice_lines', 'owner_expense', 'public.ips_expense_responsibilities', 'owner_invoice_line_id'];
  const makeRow = (table, values) => {
    const rowText = JSON.stringify({ organization_id: TARGET.organization, financial_generation: 0, ...values });
    return { table, pk: [values.id], rowText, sha256: sha256(rowText) };
  };
  const source = makeRow(sourceTable, { id: sourceId, source_type: sourceType, source_id: id });
  const child = makeRow(childTable, { id, [linkColumn]: sourceId });
  input.snapshot.rows = [source, child];
  input.inventory.tables = [source, child].map(row => ({ table: row.table, pk: ['id'],
    policy: { disposition: 'archive-remove', scope: 'organization_id' }, nullableColumns: [linkColumn],
    foreignKeys: row === source ? [] : [{ name: 'physical_backlink', target: sourceTable, columns: ['organization_id', linkColumn],
      targetColumns: ['organization_id', 'id'], matchType: 's' }], selectedRows: [{ pk: row.pk, sha256: row.sha256 }] }));
  const identity = row => ({ table: row.table, pk: row.pk });
  const logical = { source: identity(source), target: identity(child), kind: 'polymorphic-reference', column: 'source_id' };
  const physical = { source: identity(child), target: identity(source), kind: 'foreign-key', constraint: 'physical_backlink' };
  input.dependencyPlan.dependencies = [logical, physical];
  input.review.normalizationDecisions = [];
  input.review.graphResolution = { candidateRemovalOrder: [identity(child), identity(source)],
    candidateRestoreInsertionOrder: [identity(source), identity(child)], remainingEdges: [physical],
    removedForeignKeyEdges: [], conditionallyRetiredLogicalEdges: [], temporarilyAbsentLogicalEdges: [logical] };
  return rebindPair(input);
}
function rebindPair(input) {
  input.inventory = seal(input.inventory, 'manifestSha256');
  input.snapshot = seal({ ...input.snapshot, manifestSha256: input.inventory.manifestSha256 }, 'sha256');
  input.dependencyPlan = seal({ ...input.dependencyPlan, manifestSha256: input.inventory.manifestSha256 }, 'planSha256');
  input.review.sourceBinding = { ...input.review.sourceBinding, manifestSha256: input.inventory.manifestSha256,
    supplementSha256: input.snapshot.sha256, planSha256: input.dependencyPlan.planSha256 };
  input.review = seal(input.review, 'reviewSha256');
  return input;
}

function retiredJournalFixture() {
  const input = fixture(), uid = n => `fa240215-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const migration = { name: '20261024021544_financial_reset_retired_deposit_journal_slots.sql', sha256: hash };
  const intentValues = { token: uid(40), idempotency_key: uid(41), organization_id: TARGET.organization,
    actor_id: uid(10), lease_id: uid(30), property_id: uid(2), unit_id: null, deposit_id: uid(31), invoice_id: uid(32),
    payload: { operation: 'apply', leaseId: uid(30), date: '2026-10-24', reason: 'Synthetic journal retirement',
      depositId: uid(31), invoiceId: uid(32), lineId: uid(33), amount: '20.00' },
    payload_hash: '63dc9f95350fbd53a9e2f970f9555208d6b2b658b8e14e1e2bb784967120a11f', snapshot_hash: hash,
    authorization_hash: 'b'.repeat(64), expires_at: '2026-10-24T02:05:00Z', created_at: '2026-10-24T02:00:00Z',
    state: 'preview', revision: 1, result_id: null, result_message: null, financial_generation: 0 };
  const row = (table, values, pk) => { const rowText = JSON.stringify(values); return { table, pk, rowText, sha256: sha256(rowText) }; };
  const intent = row('app_private.deposit_rent_journal_intents', intentValues, [uid(40)]);
  const slot = row('app_private.deposit_rent_journal_slots', { organization_id: TARGET.organization,
    actor_id: uid(10), lease_id: uid(30), current_token: uid(40) }, [TARGET.organization, uid(10), uid(30)]);
  const invoice = row('public.tenant_invoices', { id: uid(32), organization_id: TARGET.organization,
    property_id: uid(2), unit_id: null, lease_id: uid(30) }, [uid(32)]);
  const ident = ({ table, pk }) => ({ table, pk });
  const decision = (r, kind) => ({ ...ident(r), kind, beforeSha256: r.sha256, preserveAllUnlistedColumns: true,
    changes: [], expectedStoredAfterSha256: null, afterImageVerified: false });
  input.inventory.binding.fixtureArtifacts = [migration];
  input.review.sourceBinding.validatedSourceArtifacts = [migration];
  input.snapshot.rows = [intent, slot, invoice];
  input.inventory.tables = [intent, slot, invoice].map(r => ({ table: r.table,
    pk: r === slot ? ['organization_id', 'actor_id', 'lease_id'] : [r === intent ? 'token' : 'id'],
    policy: { disposition: r === invoice ? 'archive-remove' : 'retire-intent', scope: 'organization_id' }, nullableColumns: [],
    foreignKeys: r === slot ? [{ name: 'exact_journal_slot_parent', target: intent.table,
      columns: ['current_token', 'organization_id', 'actor_id', 'lease_id'], targetColumns: ['token', 'organization_id', 'actor_id', 'lease_id'], matchType: 's' }] : [],
    selectedRows: [{ pk: r.pk, sha256: r.sha256 }] }));
  const edge = { source: ident(intent), target: ident(invoice), kind: 'static-reference', column: 'invoice_id' };
  input.dependencyPlan.dependencies = [edge];
  input.review.normalizationDecisions = [];
  input.review.retirementDecisions = [decision(intent, 'retain-retired-deposit-rent-intent'),
    { ...decision(slot, 'retain-retired-deposit-rent-slot'), parent: { ...ident(intent), sha256: intent.sha256 } }];
  input.review.graphResolution = { candidateRemovalOrder: [ident(invoice)], candidateRestoreInsertionOrder: [ident(invoice)],
    remainingEdges: [], removedForeignKeyEdges: [], conditionallyRetiredLogicalEdges: [edge] };
  return rebindPair(input);
}

test('retired deposit journal pair remains byte-exact while its reviewed invoice is removed', () => {
  const input = retiredJournalFixture(), result = materializeResetActions(input);
  assert.equal(result.actions.filter(action => action.kind === 'archive-remove').length, 1);
  const retained = result.actions.filter(action => action.kind.startsWith('retain-retired-deposit-rent'));
  assert.equal(retained.length, 2);
  for (const action of retained) {
    assert.equal(action.allowedAfterRowText, action.beforeRowText);
    assert.deepEqual(action.changedColumns, []);
  }
  assert.deepEqual(result.blockers, [{ code: 'known_zero_authority_unimplemented' }]);
  const inverse = materializeRestoreActions(result, 2);
  assert.equal(inverse.retainedRetiredRows.length, 2);
  assert.equal(inverse.actions.some(action => action.table.startsWith('app_private.deposit_rent_journal_')), false);
});

test('journal slot cannot retire without an independently reviewed exact parent', () => {
  const input = retiredJournalFixture();
  input.review.retirementDecisions = input.review.retirementDecisions.slice(1);
  assert.throws(() => materializeResetActions(rebindPair(input)), /decision must preserve/);
});

test('journal retirement requires the reviewed forward migration and keeps the physical slot FK', () => {
  const input = retiredJournalFixture();
  input.inventory.binding.fixtureArtifacts = []; input.review.sourceBinding.validatedSourceArtifacts = [];
  assert.throws(() => materializeResetActions(rebindPair(input)), /migration must be bound/);
  const physical = retiredJournalFixture(), [intent, slot] = physical.snapshot.rows;
  const edge = { source: { table: slot.table, pk: slot.pk }, target: { table: intent.table, pk: intent.pk },
    kind: 'foreign-key', constraint: 'exact_journal_slot_parent' };
  physical.dependencyPlan.dependencies.push(edge); physical.review.graphResolution.conditionallyRetiredLogicalEdges.push(edge);
  assert.throws(() => materializeResetActions(rebindPair(physical)), /Retired logical edge lacks exact archived result/);
});

test('journal retirement cannot omit a selected intent or slot from the internal before-image inventory', () => {
  const input = retiredJournalFixture(); input.snapshot.rows.splice(1, 1);
  assert.throws(() => materializeResetActions(rebindPair(input)), /Full selected-row archive is incomplete/);
});

function historicalOrderFixture(shape) {
  const input = fixture(), uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const make = (table, number, values) => {
    const rowText = JSON.stringify({ id: uuid(number), organization_id: TARGET.organization, financial_generation: 0, ...values });
    return { table, pk: [uuid(number)], rowText, sha256: sha256(rowText) };
  };
  const scope = { property_id: uuid(1), owner_person_id: uuid(2), currency: 'USD', effective_date: '2026-09-01', component: 'owner_cash', request_id: uuid(3) };
  const rows = shape === 'opening' ? [
    make('public.owner_opening_balance_entries', 10, { ...scope, entry_kind: 'correction_replacement', reversal_of_entry_id: null }),
    make('public.owner_opening_balance_entries', 11, { ...scope, entry_kind: 'correction_reversal', reversal_of_entry_id: uuid(12) }),
  ] : [
    make('public.expense_customer_adjustments', 20, { responsibility: 'owner', responsibility_id: uuid(25) }),
    make('public.owner_charge_cash_allocations', 21, { owner_invoice_line_id: uuid(22), reversal_of_id: null }),
    make('public.owner_invoice_lines', 22, { source_type: 'owner_expense', source_id: uuid(25) }),
  ];
  input.snapshot.rows = rows;
  input.inventory.tables = [...new Set(rows.map(row => row.table))].map(table => ({ table, pk: ['id'],
    policy: { disposition: 'archive-remove', scope: 'organization_id' }, nullableColumns: [], foreignKeys: [],
    selectedRows: rows.filter(row => row.table === table).map(row => ({ pk: row.pk, sha256: row.sha256 })) }));
  const order = rows.map(({ table, pk }) => ({ table, pk }));
  input.review.normalizationDecisions = [];
  input.review.graphResolution = { candidateRemovalOrder: order, candidateRestoreInsertionOrder: [...order].reverse(),
    remainingEdges: [], removedForeignKeyEdges: [], conditionallyRetiredLogicalEdges: [],
    historicalOrderingEdges: historicalRestoreRemovalEdges(rows, order) };
  return rebindPair(input);
}

for (const shape of ['opening', 'held-cash']) {
  test(`${shape} restore honors its exact historical validator sequence without repartitioning dependencies`, () => {
    const input = historicalOrderFixture(shape), reset = materializeResetActions(input), restore = materializeRestoreActions(reset, 2);
    assert.equal(input.review.graphResolution.historicalOrderingEdges.length, 1);
    assert.deepEqual(input.dependencyPlan.dependencies, []);
    assert.deepEqual(restore.actions.map(({ table, pk }) => ({ table, pk })), input.review.graphResolution.candidateRestoreInsertionOrder);
    assert.deepEqual(reset.blockers, [{ code: 'known_zero_authority_unimplemented' }]);
    const edge = input.review.graphResolution.historicalOrderingEdges[0];
    const indexes = new Map(restore.actions.map((row, index) => [json([row.table, row.pk]), index]));
    assert.ok(indexes.get(json([edge.target.table, edge.target.pk])) < indexes.get(json([edge.source.table, edge.source.pk])));
    const bad = structuredClone(input);
    bad.review.graphResolution.candidateRemovalOrder.reverse();
    bad.review.graphResolution.candidateRestoreInsertionOrder.reverse();
    assert.throws(() => materializeResetActions(rebindPair(bad)), /historical restore sequence/);
    const changed = structuredClone(reset);
    changed.actions.reverse();
    assert.throws(() => materializeRestoreActions(seal(changed, 'actionsSha256'), 2), /historical restore sequence/);
  });

  test(`${shape} historical edges cannot be omitted, fabricated or assigned an unarchived endpoint`, () => {
    const input = historicalOrderFixture(shape), rows = input.snapshot.rows, order = input.review.graphResolution.candidateRemovalOrder;
    const missing = structuredClone(input);
    missing.review.graphResolution.historicalOrderingEdges = [];
    assert.throws(() => materializeResetActions(rebindPair(missing)), /historical ordering edges/);
    const fabricated = structuredClone(input);
    fabricated.review.graphResolution.historicalOrderingEdges[0].rule = 'unreviewed-rule';
    assert.throws(() => materializeResetActions(rebindPair(fabricated)), /historical ordering edges/);
    assert.throws(() => historicalRestoreRemovalEdges(rows, order.slice(1)), /endpoint/);
    assert.throws(() => historicalRestoreRemovalEdges(rows.filter((_, i) => i !== (shape === 'opening' ? 1 : 2)), order),
      shape === 'opening' ? /same-request reversal/ : /source line/);
  });
}

test('historical restore derivation rejects ambiguous reversal and expense adjustment shapes', () => {
  for (const shape of ['opening', 'held-cash']) {
    const input = historicalOrderFixture(shape), rows = structuredClone(input.snapshot.rows);
    const duplicated = { ...rows[shape === 'opening' ? 1 : 0], pk: ['00000000-0000-4000-8000-000000000090'] };
    duplicated.rowText = patchRowText(duplicated.rowText, { id: duplicated.pk[0] });
    duplicated.sha256 = sha256(duplicated.rowText); rows.push(duplicated);
    assert.throws(() => historicalRestoreRemovalEdges(rows, rows), shape === 'opening' ? /same-request reversal/ : /ambiguous/);
  }
  const input = historicalOrderFixture('opening'), rows = structuredClone(input.snapshot.rows);
  rows[1].rowText = patchRowText(rows[1].rowText, { component: 'different_component' }); rows[1].sha256 = sha256(rows[1].rowText);
  assert.throws(() => historicalRestoreRemovalEdges(rows, rows), /scope is ambiguous/);
  const cash = historicalOrderFixture('held-cash').snapshot.rows;
  cash[1].rowText = patchRowText(cash[1].rowText, { reversal_of_id: 'unknown' }); cash[1].sha256 = sha256(cash[1].rowText);
  assert.throws(() => historicalRestoreRemovalEdges(cash, cash), /reversal shape/);
});

for (const shape of ['allocation', 'responsibility']) {
  test(`${shape} provenance cycle keeps the physical FK and restores exact parent before child`, () => {
    const input = provenancePairFixture(shape), reset = materializeResetActions(input);
    assert.deepEqual(reset.blockers, [{ code: 'known_zero_authority_unimplemented' }]);
    assert.deepEqual(reset.actions.map(action => action.kind), ['archive-remove', 'archive-remove']);
    assert.deepEqual(reset.actions.map(({table,pk}) => ({table,pk})), input.review.graphResolution.candidateRemovalOrder);
    for (const action of reset.actions) assert.equal(action.requiredCurrentRowText, action.beforeRowText);
    const restore = materializeRestoreActions(reset, 2);
    assert.deepEqual(restore.actions.map(({table,pk}) => ({table,pk})), input.review.graphResolution.candidateRestoreInsertionOrder);
    for (const action of restore.actions) {
      const original = input.snapshot.rows.find(row => row.table === action.table);
      assert.equal(action.beforeRowText, null);
      assert.equal(action.allowedAfterRowText, patchRowText(original.rowText, { financial_generation: 2 }));
    }
  });
  test(`${shape} provenance relaxation rejects unknown or physical edges and incomplete paired recovery`, () => {
    for (const mutate of [
      input => { input.review.graphResolution.temporarilyAbsentLogicalEdges[0].kind = 'foreign-key'; },
      input => { input.review.graphResolution.temporarilyAbsentLogicalEdges[0].kind = 'static-reference'; },
      input => { input.review.graphResolution.temporarilyAbsentLogicalEdges[0].column = 'source_line_id'; },
      input => { input.inventory.tables[0].foreignKeys.push({ columns: ['source_id'] }); },
      input => { input.inventory.tables[1].foreignKeys[0].targetColumns = ['organization_id', 'other_id']; },
      input => { input.review.graphResolution.remainingEdges = []; input.dependencyPlan.dependencies.pop(); },
      input => { input.inventory.tables[1].policy.disposition = 'preserve'; },
      input => { input.snapshot.rows.pop(); },
      input => { input.review.graphResolution.candidateRestoreInsertionOrder.reverse(); },
      input => { input.review.graphResolution.candidateRemovalOrder.reverse(); },
      input => {
        const row = input.snapshot.rows[0]; row.rowText = row.rowText.replace('"source_type":', '"unrecognized_type":');
        row.sha256 = sha256(row.rowText); input.inventory.tables[0].selectedRows[0].sha256 = row.sha256;
      },
      input => {
        const row = input.snapshot.rows[1]; row.rowText = row.rowText.replace('00000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092');
        row.sha256 = sha256(row.rowText); input.inventory.tables[1].selectedRows[0].sha256 = row.sha256;
      },
    ]) {
      const input = provenancePairFixture(shape); mutate(input);
      assert.throws(() => materializeResetActions(rebindPair(input)));
    }
  });
  test(`${shape} CHECK-constrained backlink can no longer be staged to null`, () => {
    const input = provenancePairFixture(shape), row = input.snapshot.rows[1];
    const column = shape === 'allocation' ? 'ledger_entry_id' : 'owner_invoice_line_id';
    input.review.cycleBreakDecisions = [{ table: row.table, pk: row.pk, kind: 'stage-exact-null-cycle-edges', beforeSha256: row.sha256,
      preserveAllUnlistedColumns: true, expectedStoredAfterSha256: null, afterImageVerified: false,
      changes: [{ column, before: JSON.parse(row.rowText)[column], after: null }] }];
    const result = materializeResetActions(rebindPair(input));
    assert.ok(result.blockers.some(blocker => blocker.code === 'unsupported_decision'));
    assert.equal(result.actions.some(action => action.kind === 'stage-exact-null-cycle-edges'), false);
  });
}

function checkedReviewFixture() {
  return seal({ format: 'nestory-synthetic-checked-reset-phase-review-v1', syntheticOnly: true, customerApproval: false,
    manifestSha256: hash, actionsSha256: hash,
    zero: { makerActorId: '00000000-0000-0000-0000-000000000101', reviewerActorId: '00000000-0000-0000-0000-000000000501',
      effectiveDate: TARGET.cutoff, currencies: ['USD'], scopes: [{ property_id: id, property_owner_id: id, owner_person_id: id,
        ownership_percent: 100, ownership_roster_hash: hash, property_row_sha256: hash, property_archived_at: null, currency: 'USD' }] },
    continuation: { version: 1, actor_id: '00000000-0000-0000-0000-000000000101', billing_period_start: TARGET.cutoff,
      issue_date: '2026-10-23', leases: [{ lease_id: id, term_id: id, billing_rule_id: id, continue_month_to_month: false,
        rent_amount: '9007199254740993.00', management_fee_amount: '0.00', currency: 'USD', recipient_person_id: id,
        collection_route: 'through_ips', due_date: '2026-10-05' }] } }, 'reviewSha256');
}

test('recovery sources sort children first and reject cycles or surviving incoming rows', () => {
  const make = (relation_name, value) => {
    const before_row_text = JSON.stringify({ id: value, organization_id: TARGET.organization, amount: '10.00' });
    return { relation_name, primary_key: { id: value }, kind: 'recovery-prune', before_row_text,
      before_sha256: sha256(before_row_text), after_row_text: null, after_sha256: null, changed_columns: [] };
  };
  const child = make('public.tenant_invoice_lines', 'child'), parent = make('public.tenant_invoices', 'parent');
  const identity = row => ({ relation_name: row.relation_name, primary_key: row.primary_key });
  const edge = { source: identity(child), target: identity(parent), constraint: 'invoice_fk' };
  assert.deepEqual(orderRecoverySources([parent, child], [edge]), [child, parent]);
  assert.deepEqual(orderRecoverySources([child], [{ source: identity(child), target: identity(child) }]), [child]);
  assert.throws(() => orderRecoverySources([parent, child], [edge, { source: identity(parent), target: identity(child) }]), /cycle/);
  assert.throws(() => orderRecoverySources([parent], [{ source: null, target: identity(parent) }]), /surviving incoming/);
  assert.throws(() => orderRecoverySources([parent, parent], []), /identity/);
  assert.throws(() => orderRecoverySources([{ ...parent, before_sha256: hash }], []), /typed hash/);
});

test('recovery repair accepts only the recorded expired-to-active predecessor change', () => {
  const before_row_text = JSON.stringify({ id, organization_id: TARGET.organization, status: 'expired', rent_amount: '9007199254740993.00', updated_at: 'after' });
  const after_row_text = JSON.stringify({ id, organization_id: TARGET.organization, status: 'active', rent_amount: '9007199254740993.00', updated_at: 'before' });
  const row = { relation_name: 'public.lease_terms', primary_key: { id }, kind: 'recovery-repair', before_row_text, after_row_text,
    before_sha256: sha256(before_row_text), after_sha256: sha256(after_row_text), changed_columns: ['status', 'updated_at'] };
  assert.deepEqual(orderRecoverySources([row], []), [row]);
  assert.throws(() => orderRecoverySources([{ ...row, changed_columns: ['status', 'rent_amount'] }], []), /predecessor-term/);
  const changed = after_row_text.replace('9007199254740993.00', '9007199254740994.00');
  assert.throws(() => orderRecoverySources([{ ...row, after_row_text: changed, after_sha256: sha256(changed) }], []), /unreviewed/);
});

test('checked phase review binds exact synthetic actors, USD scopes and string amounts', () => {
  const materialized = { actionsSha256: hash, sourceBinding: { manifestSha256: hash } };
  assert.equal(assertCheckedPhaseReview(checkedReviewFixture(), materialized).continuation.leases[0].rent_amount, '9007199254740993.00');
  for (const mutate of [r => { r.customerApproval = true; }, r => { r.zero.reviewerActorId = r.zero.makerActorId; },
    r => { r.zero.makerActorId = id; }, r => { r.zero.currencies = ['KHR']; }, r => { r.zero.scopes.push(r.zero.scopes[0]); },
    r => { r.continuation.leases[0].rent_amount = 12; }, r => { r.continuation.leases.push(r.continuation.leases[0]); },
    r => { r.continuation.source_sha256 = hash; }, r => { r.actionsSha256 = 'b'.repeat(64); }]) {
    const review = checkedReviewFixture(); mutate(review);
    assert.throws(() => assertCheckedPhaseReview(seal(review, 'reviewSha256'), materialized));
  }
});

test('known-zero review requires full property binding for live and archived scopes', () => {
  const materialized = { actionsSha256: hash, sourceBinding: { manifestSha256: hash } };
  for (const archivedAt of [null, '2026-10-23T08:30:00.123456+00:00']) {
    const review = checkedReviewFixture();
    review.zero.scopes[0].property_archived_at = archivedAt;
    assert.doesNotThrow(() => assertCheckedPhaseReview(seal(review, 'reviewSha256'), materialized));
  }
  for (const mutate of [scope => { delete scope.property_row_sha256; }, scope => { delete scope.property_archived_at; },
    scope => { scope.property_row_sha256 = 'invalid'; }, scope => { scope.property_archived_at = true; },
    scope => { scope.property_archived_at = '2026-10-23'; }, scope => { scope.property_archived_at = '2026-99-23T08:30:00Z'; },
    scope => { scope.allow_archived = true; }]) {
    const review = checkedReviewFixture(); mutate(review.zero.scopes[0]);
    assert.throws(() => assertCheckedPhaseReview(seal(review, 'reviewSha256'), materialized), /zero scope/);
  }
});

function deferredReviewFixture() {
  const review = checkedReviewFixture();
  review.continuation.version = 2;
  review.continuation.leases[0].disposition = 'bill';
  review.continuation.leases.push({ lease_id: '00000000-0000-4000-8000-000000000098', term_id: id, billing_rule_id: id,
    disposition: 'defer-expired-unbilled', reason: 'renewal-unconfirmed', source_sha256: hash });
  return seal(review, 'reviewSha256');
}

test('version2 review preserves explicit bill and deferred unbilled dispositions without invented charges', () => {
  const materialized = { actionsSha256: hash, sourceBinding: { manifestSha256: hash } };
  const result = assertCheckedPhaseReview(deferredReviewFixture(), materialized);
  assert.equal(result.continuation.leases.length, 2);
  assert.equal(Object.hasOwn(result.continuation.leases[1], 'rent_amount'), false);
  const continued = deferredReviewFixture();
  continued.continuation.leases[0].disposition = 'continue-month-to-month';
  continued.continuation.leases[0].continue_month_to_month = true;
  assert.doesNotThrow(() => assertCheckedPhaseReview(seal(continued, 'reviewSha256'), materialized));
});

test('version2 bill binds reviewed October end-proration amounts and issue-date floor without requesting renewal', () => {
  const review = deferredReviewFixture();
  const billed = review.continuation.leases[0];
  billed.rent_amount = '451.61'; billed.management_fee_amount = '45.16';
  billed.due_date = review.continuation.issue_date;
  const result = assertCheckedPhaseReview(seal(review, 'reviewSha256'), { actionsSha256: hash, sourceBinding: { manifestSha256: hash } });
  assert.equal(result.continuation.leases[0].disposition, 'bill');
  assert.equal(result.continuation.leases[0].continue_month_to_month, false);
  assert.equal(result.continuation.leases[0].rent_amount, '451.61');
  assert.equal(result.continuation.leases[0].management_fee_amount, '45.16');
  assert.equal(result.continuation.leases[0].due_date, review.continuation.issue_date);
});

for (const [label, mutate] of [
  ['missing source', row => { delete row.source_sha256; }],
  ['unknown reason', row => { row.reason = 'ignore-errors'; }],
  ['invented zero charge', row => { row.rent_amount = '0.00'; }],
  ['invented renewal', row => { row.continue_month_to_month = true; }],
  ['unknown source field', row => { row.expectedReady = true; }],
]) test(`version2 deferred review refuses ${label}`, () => {
  const review = deferredReviewFixture(); mutate(review.continuation.leases[1]);
  assert.throws(() => assertCheckedPhaseReview(seal(review, 'reviewSha256'), { actionsSha256: hash, sourceBinding: { manifestSha256: hash } }));
});

test('version2 rejects duplicate leases, missing explicit bill and v1-deferred mixing', () => {
  const materialized = { actionsSha256: hash, sourceBinding: { manifestSha256: hash } };
  for (const mutate of [review => { review.continuation.leases[1].lease_id = id; },
    review => { delete review.continuation.leases[0].disposition; },
    review => { review.continuation.version = 1; delete review.continuation.leases[0].disposition; },
    review => { review.continuation.leases[0].disposition = 'continue-month-to-month'; }]) {
    const review = deferredReviewFixture(); mutate(review);
    assert.throws(() => assertCheckedPhaseReview(seal(review, 'reviewSha256'), materialized));
  }
});

function depositDispositionFixture(status = 'held', archivedAt = null) {
  const input = fixture();
  const source = input.snapshot.rows[0];
  source.rowText = patchRowText(source.rowText, { status }).replace(/}$/, `, "lease_id":"${id}", "deposit_type":"security", "currency":"USD", "archived_at":${JSON.stringify(archivedAt)}, "notes":"Unchanged contract"}`);
  source.sha256 = sha256(source.rowText);
  input.inventory.tables[0].selectedRows = [{ pk: source.pk, sha256: source.sha256 }];
  const artifact = { name: '20261024013621_financial_reset_reviewed_deferred_leases_and_deposits.sql', sha256: hash };
  input.inventory.binding.fixtureArtifacts = [artifact];
  input.review.sourceBinding.validatedSourceArtifacts = [artifact];
  input.review.normalizationDecisions[0] = { ...input.review.normalizationDecisions[0], beforeSha256: source.sha256,
    kind: ['held', 'received', 'partially_returned'].includes(status) ? 'clear-recorded-deposit-cash' : 'preserve-deposit-header',
    changes: ['held', 'received', 'partially_returned'].includes(status) ? [{ column: 'status', before: status, after: 'pending' }] : [] };
  return rebindPair(input);
}

test('reviewed deposit clear preserves exact contractual numeric lexemes and restores the original header', () => {
  const input = depositDispositionFixture(), reset = materializeResetActions(input);
  const cleared = reset.actions[0];
  assert.equal(JSON.parse(cleared.allowedAfterRowText).status, 'pending');
  assert.match(cleared.allowedAfterRowText, /9007199254740993\.00/);
  assert.deepEqual(cleared.changedColumns, ['status']);
  assert.equal(materializeRestoreActions(reset, 2).actions[0].allowedAfterRowText, input.snapshot.rows[0].rowText);
});

test('pending and settled deposit headers stay byte-identical including archived contract meanings', () => {
  for (const [status, archivedAt] of [['pending', null], ['pending', '2026-09-01T00:00:00Z'], ['returned', null], ['waived', null], ['forfeited', null]]) {
    const input = depositDispositionFixture(status, archivedAt), reset = materializeResetActions(input), restored = materializeRestoreActions(reset, 2);
    assert.equal(reset.actions[0].allowedAfterRowText, input.snapshot.rows[0].rowText);
    assert.deepEqual(reset.actions[0].changedColumns, []);
    assert.deepEqual(restored.actions, []);
    assert.equal(restored.preservedHeaderRows[0].requiredRowText, input.snapshot.rows[0].rowText);
    assert.deepEqual(restored.retainedRetiredRows, []);
  }
});

test('deposit disposition rejects terminal revival, archived cash clear, contract changes and missing source migration', () => {
  for (const mutate of [input => { input.review.normalizationDecisions[0].changes.push({ column: 'amount', before: 9007199254740993, after: null }); },
    input => { input.inventory.binding.fixtureArtifacts = []; input.review.sourceBinding.validatedSourceArtifacts = []; },
    input => { input.review.normalizationDecisions[0].kind = 'preserve-deposit-header'; input.review.normalizationDecisions[0].changes = []; }]) {
    const input = depositDispositionFixture(); mutate(input);
    assert.throws(() => materializeResetActions(rebindPair(input)));
  }
  assert.throws(() => materializeResetActions(depositDispositionFixture('held', '2026-09-01T00:00:00Z')));
  const returned = depositDispositionFixture('returned');
  returned.review.normalizationDecisions[0].kind = 'normalize-cash-status';
  returned.review.normalizationDecisions[0].changes = [{ column: 'status', before: 'returned', after: 'pending' }];
  assert.throws(() => materializeResetActions(rebindPair(returned)), /Terminal deposit/);
});

test('restore reverses dependencies, stages cycles then restores pointers in a fresh generation', () => {
  const original = '{"id":"'+id+'","amount":9007199254740993.00,"ledger_entry_id":"ledger","financial_generation":0}';
  const staged = patchRowText(original, { ledger_entry_id: null });
  const child = { table: 'public.deposit_rent_allocations', pk: [id], beforeRowText: original };
  const parent = { table: 'public.ledger_entries', pk: ['ledger'], beforeRowText: '{"id":"ledger","financial_generation":0}' };
  const reset = seal({ actions: [
    { ...child, kind: 'stage-exact-null-cycle-edges', allowedAfterRowText: staged, changedColumns: ['ledger_entry_id'] },
    { ...child, kind: 'archive-remove', allowedAfterRowText: null, changedColumns: [] },
    { ...parent, kind: 'archive-remove', allowedAfterRowText: null, changedColumns: [] },
    { table: 'public.notification_outbox', pk: ['outbox'], kind: 'cancel-unclaimed-synthetic-reminder',
      beforeRowText: '{"status":"pending"}', allowedAfterRowText: '{"status":"cancelled"}', changedColumns: ['status'] },
    { table: 'app_private.paid_cost_evidence_registrations', pk: ['registration'], kind: 'retain-registration-retired-generation',
      beforeRowText: '{"financial_generation":0}', allowedAfterRowText: '{"financial_generation":0}', changedColumns: [] },
  ], sourceBinding: {}, blockers: [{ code: 'known_zero_authority_unimplemented' }] }, 'actionsSha256');
  const restored = materializeRestoreActions(reset, 2);
  assert.deepEqual(restored.actions.map(row => [row.table, row.beforeRowText === null]), [
    ['public.ledger_entries', true], ['public.deposit_rent_allocations', true], ['public.deposit_rent_allocations', false],
  ]);
  assert.equal(JSON.parse(restored.actions[1].allowedAfterRowText).ledger_entry_id, null);
  assert.equal(JSON.parse(restored.actions[2].allowedAfterRowText).ledger_entry_id, 'ledger');
  for (const row of restored.actions) assert.equal(JSON.parse(row.allowedAfterRowText).financial_generation, 2);
  assert.match(restored.actions[1].allowedAfterRowText, /9007199254740993\.00/);
  assert.deepEqual(restored.retainedRetiredRows.map(row => row.requiredRowText), ['{"status":"cancelled"}', '{"financial_generation":0}']);
  assert.throws(() => materializeRestoreActions(reset, 1));
  assert.throws(() => materializeRestoreActions({ ...reset, actions: [] }, 2));
});

test('restore retained projections preserves archived values and names generation when needed', () => {
  const reset = materializeResetActions(fixture());
  const restored = materializeRestoreActions(reset, 2);
  assert.equal(restored.actions.length, 1);
  assert.equal(restored.actions[0].allowedAfterRowText, reset.actions[0].beforeRowText);
  assert.equal(restored.actions[0].beforeRowText, reset.actions[0].allowedAfterRowText);
  assert.equal(restored.actualResetRecoveryProven, false);
});

test('lossless patch preserves numeric lexemes, escapes and nested values', () => {
  const row = '{"amount": 9007199254740993.1200, "status": "held", "nested": {"quote": "x\\\"y", "list": [1, null]}}';
  const result = patchRowText(row, { status: 'pending' });
  assert.equal(result, row.replace('"held"', '"pending"'));
  assert.throws(() => patchRowText('{"x":1,"x":2}', {}), /Duplicate/);
  assert.throws(() => patchRowText(row, { absent: null }), /Unsupported/);
  assert.throws(() => patchRowText(row, { amount: 0 }), /Unsupported/);
});
test('materialization carries exact before and full allowed after, never fabricated stored hash', () => {
  const result = materializeResetActions(fixture());
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].allowedAfterRowText, /9007199254740993\.00/);
  assert.match(result.actions[0].allowedAfterRowText, /"status": "pending"/);
  assert.equal(result.actions[0].expectedStoredAfterSha256, null);
  assert.equal(result.actions[0].storedImageVerified, false);
  assert.equal(result.executionSupported, false);
  assert.deepEqual(result.blockers, [{ code: 'known_zero_authority_unimplemented' }]);
});
test('rejects stale review, fabricated stored image proof and unreviewed fields', () => {
  for (const change of [
    value => { value.sourceBinding.schemaSha256 = 'b'.repeat(64); },
    value => { value.normalizationDecisions[0].beforeSha256 = 'b'.repeat(64); },
    value => { value.normalizationDecisions[0].expectedStoredAfterSha256 = hash; },
    value => { value.normalizationDecisions[0].changes[0].after = 'returned'; },
    value => { value.normalizationDecisions[0].changes[0].before = 'pending'; },
    value => { value.normalizationDecisions[0].changes.push({ column: 'amount', before: 0, after: null }); },
    value => { value.normalizationDecisions[0].changes = []; },
    value => { value.normalizationDecisions.push(value.normalizationDecisions[0]); },
    value => { value.normalizationDecisions = []; },
  ]) assert.throws(() => materializeResetActions(changedReview(change)));
});
test('rejects altered or incomplete full-row capture even if outer hashes are regenerated', () => {
  for (const change of [value => value.rows.pop(), value => value.rows.push(value.rows[0]),
    value => { value.rows[0].rowText = value.rows[0].rowText.replace('held', 'returned'); },
    value => { value.rows[0].pk = ['foreign']; }]) {
    const input = fixture(); change(input.snapshot); input.snapshot = seal(input.snapshot, 'sha256');
    input.review.sourceBinding.supplementSha256 = input.snapshot.sha256; input.review = seal(input.review, 'reviewSha256');
    assert.throws(() => materializeResetActions(input));
  }
});
test('unsupported action becomes an explicit blocker rather than an executor permission', () => {
  const input = changedReview(value => { value.normalizationDecisions[0].kind = 'arbitrary-sql'; });
  const result = materializeResetActions(input);
  assert.equal(result.actions.length, 0);
  assert.equal(result.blockers[0].code, 'unsupported_decision');
  assert.equal(result.executionSupported, false);
});
test('dependency omission cannot be hidden by re-signing the review', () => {
  const input = fixture(); input.dependencyPlan.dependencies = [{ source: { table: 'a', pk: [id] }, target: { table: 'b', pk: [id] }, kind: 'foreign-key' }];
  input.dependencyPlan = seal(input.dependencyPlan, 'planSha256');
  input.review.sourceBinding.planSha256 = input.dependencyPlan.planSha256;
  input.review = seal(input.review, 'reviewSha256');
  assert.throws(() => materializeResetActions(input), /partition/);
});

test('orphan, cross-scope and unsupported catalog findings cannot be treated as reviewed cycles', () => {
  for (const code of ['foreign_key_target_not_unique_or_missing', 'logical_reference_target_missing',
    'cross_scope_inbound_dependency', 'unsupported_foreign_key_catalog', 'match_full_partial_null']) {
    const input = fixture(); input.dependencyPlan = seal({ ...input.dependencyPlan, issues: [{ code }] }, 'planSha256');
    input.review.sourceBinding.planSha256 = input.dependencyPlan.planSha256;
    input.review = seal(input.review, 'reviewSha256');
    assert.throws(() => materializeResetActions(input), /unsupported catalog, scope or orphan/);
  }
});
