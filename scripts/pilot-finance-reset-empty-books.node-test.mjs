import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGET, json, sha256, VALIDATION_SOURCE_ARTIFACTS } from './pilot-finance-reset-core.mjs';
import { assertCheckedPhaseReview, assertEmptyBooksContinuation, EMPTY_BOOKS_MIGRATION } from './pilot-finance-reset-executor-plan.mjs';
import { checkedBillingSummary, assertActionReadiness, buildActionTransactionSql, createFreshOwnedResetClone, rehearseCheckedReset } from './pilot-finance-reset-executor-local.mjs';
import { REBUILD_REQUIREMENTS, RESET_REGISTRY, resetRequirementsForContinuation } from './pilot-finance-reset-registry.mjs';

const hash = 'a'.repeat(64), id = '12345678-1234-4123-8123-123456789abc';
const seal = body => ({ ...body, reviewSha256: sha256(json(body)) });
const continuation = () => ({ version: 4, actor_id: '00000000-0000-0000-0000-000000000101',
  billing_period_start: TARGET.cutoff, issue_date: TARGET.cutoff, execution_business_date: '2026-10-27',
  invoice_date_policy: 'empty-books-no-invoices', contracts_sha256: hash,
  leases: [{ lease_id: id, disposition: 'preserve-unbilled', source_sha256: hash }] });
const review = () => ({ format: 'nestory-synthetic-checked-reset-phase-review-v1', syntheticOnly: true, customerApproval: false,
  manifestSha256: hash, actionsSha256: hash,
  zero: { makerActorId: '00000000-0000-0000-0000-000000000101', reviewerActorId: '00000000-0000-0000-0000-000000000501',
    effectiveDate: TARGET.cutoff, currencies: ['USD'], scopes: [{ property_id: id, property_owner_id: id, owner_person_id: id,
      ownership_percent: 100, ownership_roster_hash: hash, property_row_sha256: hash, property_archived_at: null, currency: 'USD' }] },
  continuation: continuation() });
const materialized = () => ({ sourceBinding: { manifestSha256: hash }, actionsSha256: hash });
const result = () => ({ empty_books: true, billing_paused: true, contracts_unchanged: true, billing_complete: false,
  close_ready: false, deferred_lease_count: 0, preserved_unbilled_lease_count: 1 });
const phases = () => ({ continuationResult: { ...result(), leases: continuation().leases.map(lease => ({ ...lease,
  invoice_id: null, generated_rent_amount: 0, generated_fee_amount: 0, contract_changed: false })) },
  reportResult: { ...result(), reports_persisted: true }, continuationUnchanged: true,
  remainingTenantInvoices: 0, remainingOwnerInvoices: 0, createdOwnerInvoices: 0 });

test('v4 explicitly reviews empty books and complete preserved contract hashes without billing fields', () => {
  const input = review(), before = structuredClone(input);
  assert.deepEqual(assertCheckedPhaseReview(seal(input), materialized()).continuation, input.continuation);
  assert.deepEqual(input, before);
  assert.doesNotThrow(() => assertEmptyBooksContinuation({ ...continuation(), leases: [] }));
  assert.ok(VALIDATION_SOURCE_ARTIFACTS.some(item => item.name === EMPTY_BOOKS_MIGRATION));
});

for (const [label, mutate] of [
  ['legacy version', c => { c.version = 3; }],
  ['rebuild policy', c => { c.invoice_date_policy = 'original-reviewed-october'; }],
  ['absent full contract fingerprint', c => { delete c.contracts_sha256; }],
  ['invalid full contract fingerprint', c => { c.contracts_sha256 = 'unknown'; }],
  ['wrong issue date', c => { c.issue_date = '2026-10-27'; }],
  ['wrong execution month', c => { c.execution_business_date = '2026-11-01'; }],
  ['missing execution date', c => { delete c.execution_business_date; }],
  ['original invoice sources', c => { c.original_invoice_sources = []; }],
  ['missing lease fingerprint', c => { delete c.leases[0].source_sha256; }],
  ['duplicate lease', c => { c.leases.push(c.leases[0]); }],
  ['billing disposition', c => { c.leases[0].disposition = 'bill'; }],
  ['expired-only deferral', c => { c.leases[0].disposition = 'defer-expired-unbilled'; }],
  ['rent amount', c => { c.leases[0].rent_amount = '0.00'; }],
  ['term rewrite', c => { c.leases[0].continue_month_to_month = true; }],
]) test(`empty-books review rejects ${label}`, () => {
  const input = review(); mutate(input.continuation);
  assert.throws(() => assertCheckedPhaseReview(seal(input), materialized()));
});

test('v4 no-op remains in the same checked continuation/report transaction', () => {
  const action = { action_id: id, ordinal: 1, relation_name: 'public.timeline_events', primary_key: { id },
    kind: 'normalization', before_row_text: JSON.stringify({ id, cost_amount: 10 }),
    after_row_text: JSON.stringify({ id, cost_amount: null }), before_sha256: hash, after_sha256: hash, changed_columns: ['cost_amount'] };
  const sql = buildActionTransactionSql(id, [action], null, seal(review()));
  assert.ok(sql.includes(JSON.stringify(continuation())));
  assert.ok(sql.indexOf('apply_financial_reset_known_zero') < sql.indexOf('apply_financial_reset_continuation'));
  assert.ok(sql.indexOf('apply_financial_reset_continuation') < sql.indexOf('apply_financial_reset_reports'));
  assert.ok(sql.indexOf('apply_financial_reset_reports') < sql.indexOf('COMMIT;'));
  assert.doesNotMatch(sql, /generate_.*invoice|continue_month_to_month|"rent_amount"/);
});

test('empty-books verification never claims billing or close completeness', () => {
  assert.deepEqual(checkedBillingSummary(review(), phases()), { reviewedLeaseDecisionsVerified: true,
    billingComplete: false, deferredUnbilledLeaseCount: 0, emptyBooksVerified: true, billingPaused: true,
    closeReady: false, contractsUnchanged: true, preservedUnbilledLeaseCount: 1 });
  for (const field of ['empty_books', 'billing_paused', 'contracts_unchanged', 'billing_complete', 'close_ready']) {
    for (const phase of ['continuationResult', 'reportResult']) {
      const changed = phases(); changed[phase][field] = !changed[phase][field];
      assert.throws(() => checkedBillingSummary(review(), changed));
    }
  }
  for (const [field, value] of [['continuationUnchanged', false], ['remainingTenantInvoices', 1],
    ['remainingOwnerInvoices', 1], ['createdOwnerInvoices', 1]]) {
    assert.throws(() => checkedBillingSummary(review(), { ...phases(), [field]: value }));
  }
  for (const patch of [{ invoice_id: id }, { contract_changed: true }, { source_sha256: 'b'.repeat(64) },
    { generated_rent_amount: 1 }, { generated_fee_amount: 1 }, { disposition: 'bill' }]) {
    const changed = phases(); Object.assign(changed.continuationResult.leases[0], patch);
    assert.throws(() => checkedBillingSummary(review(), changed));
  }
  const changed = phases(); changed.continuationResult.leases = [];
  assert.throws(() => checkedBillingSummary(review(), changed));
});

test('native empty-books rehearsal stays blocked even with every migration authority present', async () => {
  const artifacts = VALIDATION_SOURCE_ARTIFACTS.map(item => ({ name: item.name, sha256: hash }));
  const input = { syntheticOnly: true, customerApproval: false, executionSupported: false,
    blockers: [{ code: 'known_zero_authority_unimplemented' }], sourceBinding: { validatedSourceArtifacts: artifacts } };
  const blocked = /Native empty-books rehearsal requires consumed-session integration/;
  assert.throws(() => assertActionReadiness(input, 'rehearseCheckedReset', review()), blocked);
  const missing = structuredClone(input);
  missing.sourceBinding.validatedSourceArtifacts = artifacts.filter(item => item.name !== EMPTY_BOOKS_MIGRATION);
  assert.throws(() => assertActionReadiness(missing, 'rehearseCheckedReset', review()), blocked);
  assert.doesNotThrow(() => assertActionReadiness(missing, 'rehearseCheckedReset'));
  assert.throws(() => assertActionReadiness(input, 'fullReset', review()), blocked);
  // Supplying only the review proves rejection precedes prerequisite/source
  // inspection, evidence-directory creation and any Docker/clone operation.
  await assert.rejects(createFreshOwnedResetClone({ phaseReview: review(), mode: 'rehearseCheckedReset' }), blocked);
  await assert.rejects(rehearseCheckedReset({ phaseReview: review() }), blocked);
});

test('v4 excludes invoice rebuilding only; legacy requirements and preserved contract registry remain', () => {
  for (const version of [1, 2, 3]) assert.deepEqual(resetRequirementsForContinuation(version), REBUILD_REQUIREMENTS);
  assert.deepEqual(resetRequirementsForContinuation(4).map(row => row.table),
    ['public.owner_opening_balance_entries', 'public.petty_cash_periods']);
  for (const table of ['properties', 'units', 'people', 'leases', 'lease_terms', 'lease_billing_terms']) {
    assert.equal(RESET_REGISTRY[`public.${table}`].disposition, 'preserve');
  }
  assert.throws(() => resetRequirementsForContinuation(5));
});
