import test from 'node:test';
import assert from 'node:assert/strict';
import { json, sha256, TARGET } from './pilot-finance-reset-core.mjs';
import { assertCheckedPhaseReview } from './pilot-finance-reset-executor-plan.mjs';

const hash = 'a'.repeat(64);
const id = n => `fd231852-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seal = review => {
  const { reviewSha256: ignored, ...body } = review;
  void ignored;
  return { ...body, reviewSha256: sha256(json(body)) };
};
function fixture() {
  const billed = [
    { lease_id: id(1), term_id: id(101), billing_rule_id: id(201), rent_amount: '400.00', management_fee_amount: '0.00' },
    { lease_id: id(2), term_id: id(102), billing_rule_id: id(202), rent_amount: '451.61', management_fee_amount: '45.16' },
    { lease_id: id(3), term_id: id(103), billing_rule_id: id(203), rent_amount: '0.00', management_fee_amount: '0.00' },
  ].map(lease => ({ ...lease, disposition: 'bill', continue_month_to_month: false,
    currency: 'USD', recipient_person_id: id(900), collection_route: 'through_ips', due_date: '2026-10-07' }));
  const deferred = Array.from({ length: 5 }, (_, index) => ({ lease_id: id(10 + index), term_id: id(110 + index),
    billing_rule_id: id(210 + index), disposition: 'defer-expired-unbilled', reason: 'renewal-unconfirmed', source_sha256: hash }));
  const archiveRows = billed.slice(0, 2).map((lease, index) => {
    const rowText = JSON.stringify({ id: id(500 + index), organization_id: TARGET.organization, lease_id: lease.lease_id,
      lease_term_id: lease.term_id, billing_term_id: lease.billing_rule_id, billing_period_start: '2026-10-01',
      billing_period_end: '2026-10-31', issue_date: '2026-10-01', due_date: '2026-10-07', lifecycle: 'issued',
      voided_at: null, voided_by: null, currency: 'USD', recipient_person_id: lease.recipient_person_id,
      collection_route: lease.collection_route, total_amount: lease.rent_amount });
    return { table: 'public.tenant_invoices', pk: [id(500 + index)], rowText, sha256: sha256(rowText) };
  });
  const review = { format: 'nestory-synthetic-checked-reset-phase-review-v1', syntheticOnly: true, customerApproval: false,
    manifestSha256: hash, actionsSha256: hash,
    zero: { makerActorId: '00000000-0000-0000-0000-000000000101', reviewerActorId: '00000000-0000-0000-0000-000000000501',
      effectiveDate: TARGET.cutoff, currencies: ['USD'], scopes: [{ property_id: id(901), property_owner_id: id(902), owner_person_id: id(903),
        ownership_percent: 100, ownership_roster_hash: hash, property_row_sha256: hash, property_archived_at: null, currency: 'USD' }] },
    continuation: { version: 3, actor_id: '00000000-0000-0000-0000-000000000101', billing_period_start: '2026-10-01',
      issue_date: '2026-10-01', execution_business_date: '2026-10-24', invoice_date_policy: 'original-reviewed-october',
      original_invoice_sources: archiveRows.map((row, index) => ({ lease_id: billed[index].lease_id, invoice_id: row.pk[0], row_sha256: row.sha256 })),
      leases: [...billed, ...deferred] } };
  const materialized = { sourceBinding: { manifestSha256: hash }, actionsSha256: hash, archiveRows,
    actions: archiveRows.map(row => ({ table: row.table, pk: row.pk, kind: 'archive-remove', beforeRowText: row.rowText })) };
  return { review, materialized };
}
const validate = ({ review, materialized }) => assertCheckedPhaseReview(seal(review), materialized);
function changeInvoice(input, patch) {
  const row = input.materialized.archiveRows[0];
  row.rowText = JSON.stringify({ ...JSON.parse(row.rowText), ...patch });
  row.sha256 = sha256(row.rowText);
  input.materialized.actions[0].beforeRowText = row.rowText;
  input.review.continuation.original_invoice_sources[0].row_sha256 = row.sha256;
}

test('explicit v3 option retains real execution date, October business dates and five deferred leases', () => {
  const input = fixture(), before = structuredClone(input);
  const result = validate(input);
  assert.deepEqual(input, before, 'validation must not select or rewrite an option');
  assert.equal(result.continuation.issue_date, '2026-10-01');
  assert.equal(result.continuation.execution_business_date, '2026-10-24');
  assert.equal(result.continuation.leases.filter(lease => lease.disposition === 'defer-expired-unbilled').length, 5);
  assert.equal(result.continuation.leases[1].rent_amount, '451.61');
  assert.equal(result.continuation.leases[1].management_fee_amount, '45.16');
  assert.equal(result.customerApproval, false);
  assert.ok(result.continuation.leases.filter(lease => lease.disposition === 'bill').every(lease => lease.due_date === '2026-10-07'));
});

for (const [label, mutate] of [
  ['no explicit policy', c => { delete c.invoice_date_policy; }],
  ['unrecognized policy', c => { c.invoice_date_policy = 'any-historical-date'; }],
  ['execution date chosen as issue date', c => { c.issue_date = c.execution_business_date; }],
  ['different billing month', c => { c.billing_period_start = '2026-09-01'; }],
  ['missing actual execution date', c => { delete c.execution_business_date; }],
  ['execution date outside October', c => { c.execution_business_date = '2026-11-01'; }],
  ['null execution date', c => { c.execution_business_date = null; }],
  ['unreviewed extra top-level field', c => { c.skip_permissions = true; }],
  ['renewal', c => { c.leases[0].continue_month_to_month = true; c.leases[0].disposition = 'continue-month-to-month'; }],
  ['different contractual due date', c => { c.leases[0].due_date = '2026-10-08'; }],
  ['zero rent with different due date', c => { c.leases[2].due_date = '2026-10-24'; }],
  ['invented charge for a deferred lease', c => { c.leases[3].rent_amount = '0.00'; }],
  ['duplicate lease', c => { c.leases.push(c.leases[0]); }],
  ['missing source roster', c => { delete c.original_invoice_sources; }],
  ['empty source roster', c => { c.original_invoice_sources = []; }],
  ['missing billed source', c => { c.original_invoice_sources.pop(); }],
  ['duplicate source', c => { c.original_invoice_sources[1] = c.original_invoice_sources[0]; }],
  ['source for deferred lease', c => { c.original_invoice_sources[0].lease_id = c.leases[3].lease_id; }],
  ['source for zero-rent lease', c => { c.original_invoice_sources[0].lease_id = c.leases[2].lease_id; }],
  ['unreviewed source field', c => { c.original_invoice_sources[0].allow_stale = true; }],
  ['missing source hash', c => { delete c.original_invoice_sources[0].row_sha256; }],
  ['wrong source hash', c => { c.original_invoice_sources[0].row_sha256 = hash; }],
]) test(`v3 rejects ${label}`, () => {
  const input = fixture(); mutate(input.review.continuation);
  assert.throws(() => validate(input));
});

for (const [label, patch] of [
  ['another organization', { organization_id: id(999) }],
  ['another lease', { lease_id: id(999) }],
  ['another term', { lease_term_id: id(999) }],
  ['another billing rule', { billing_term_id: id(999) }],
  ['another invoice identity', { id: id(999) }],
  ['an execution-date invoice', { issue_date: '2026-10-24', due_date: '2026-10-24' }],
  ['wrong original due date', { due_date: '2026-10-08' }],
  ['different period', { billing_period_start: '2026-09-01' }],
  ['shortened period', { billing_period_end: '2026-10-14' }],
  ['void invoice', { lifecycle: 'void', voided_at: '2026-10-20T00:00:00Z', voided_by: id(900) }],
  ['missing void evidence', { voided_at: undefined }],
  ['different currency', { currency: 'KHR' }],
  ['different recipient', { recipient_person_id: id(999) }],
  ['different collection route', { collection_route: 'direct_to_owner' }],
]) test(`v3 rejects rehashed archive containing ${label}`, () => {
  const input = fixture(); changeInvoice(input, patch);
  assert.throws(() => validate(input), /business dates or contract identity/);
});

for (const [label, mutate] of [
  ['missing archive', m => { delete m.archiveRows; }],
  ['absent archived invoice', m => { m.archiveRows.pop(); }],
  ['duplicate archived invoice', m => { m.archiveRows.push(m.archiveRows[0]); }],
  ['unverified archive bytes', m => { m.archiveRows[0].rowText += ' '; }],
  ['missing deletion action', m => { m.actions.pop(); }],
  ['normalization instead of deletion', m => { m.actions[0].kind = 'normalization'; }],
  ['deletion with different before-image', m => { m.actions[0].beforeRowText += ' '; }],
]) test(`v3 rejects ${label}`, () => {
  const input = fixture(); mutate(input.materialized);
  assert.throws(() => validate(input));
});

test('legacy v2 execution-date option stays valid and cannot smuggle original-date fields', () => {
  const input = fixture(), c = input.review.continuation;
  c.version = 2; c.issue_date = c.execution_business_date;
  delete c.execution_business_date; delete c.invoice_date_policy; delete c.original_invoice_sources;
  for (const lease of c.leases.filter(lease => lease.disposition === 'bill')) lease.due_date = c.issue_date;
  assert.equal(validate(input).continuation.issue_date, '2026-10-24');
  c.invoice_date_policy = 'original-reviewed-october';
  assert.throws(() => validate(input));
});
