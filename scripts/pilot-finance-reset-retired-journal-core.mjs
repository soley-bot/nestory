// Pure validation of reviewed, unchanged journal retirement. No IO, commands,
// credentials, grants or mutation authority. Raw PostgreSQL row text is hashed
// directly; financial values are never reconstructed through JavaScript numbers.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const intentTable = 'app_private.deposit_rent_journal_intents';
const slotTable = 'app_private.deposit_rent_journal_slots';
const intentKind = 'retain-retired-deposit-rent-intent';
const slotKind = 'retain-retired-deposit-rent-slot';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = isDeepStrictEqual;
const keys = (value, expected) => object(value) && same(Object.keys(value).sort(), [...expected].sort());
const scalarString = value => typeof value === 'string' && !/\u0000|[\uD800-\uDFFF]/u.test(value);
const length = value => [...value].length;
const identity = (left, right) => object(left) && object(right) && left.table === right.table && same(left.pk, right.pk);
function requireThat(value, message) { if (!value) throw Error(message); }

function parseExactRow(text) {
  const parsed = JSON.parse(text);
  // JSON.parse alone accepts repeated object keys. Track decoded keys at every
  // nesting level without interpreting or reserializing any numeric lexeme.
  const stack = [];
  for (const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/gsu)) {
    if (token === '{') stack.push({ object: true, names: new Set(), key: true });
    else if (token === '[') stack.push({ object: false });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
    else if (token === ':' && stack.at(-1)?.object) stack.at(-1).key = false;
    else if (token.startsWith('"') && stack.at(-1)?.object && stack.at(-1).key) {
      const name = JSON.parse(token), frame = stack.at(-1);
      requireThat(!frame.names.has(name), 'Retired journal row has duplicate JSON keys.');
      frame.names.add(name); frame.key = false;
    }
  }
  return parsed;
}

function captured(row, table) {
  requireThat(object(row) && row.table === table && Array.isArray(row.pk) && typeof row.rowText === 'string' &&
    digest.test(row.sha256 ?? '') && sha(row.rowText) === row.sha256, 'Retired journal captured row/hash mismatch.');
  const parsed = parseExactRow(row.rowText);
  requireThat(object(parsed) && same(parsed, row.values), 'Retired journal parsed values do not match exact source text.');
  return parsed;
}

function reviewed(row, decision, kind, migrationBound) {
  requireThat(migrationBound === true, 'Retired journal migration must be bound.');
  requireThat(object(decision) && decision.kind === kind && identity(decision, row) &&
    decision.beforeSha256 === row.sha256 && decision.preserveAllUnlistedColumns === true &&
    Array.isArray(decision.changes) && decision.changes.length === 0 &&
    decision.expectedStoredAfterSha256 === null && decision.afterImageVerified === false,
  'Retired journal decision must preserve the exact complete source row.');
  if (Object.hasOwn(decision, 'retirementCondition')) {
    requireThat(keys(decision.retirementCondition, ['oldGeneration', 'newGenerationMustBeGreaterThan', 'controlMustRemainFrozen']) &&
      decision.retirementCondition.oldGeneration === 0 && decision.retirementCondition.newGenerationMustBeGreaterThan === 0 &&
      decision.retirementCondition.controlMustRemainFrozen === true, 'Retired journal review has an invalid generation condition.');
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function intentValues(row) {
  const v = captured(row, intentTable);
  requireThat(keys(v, ['token', 'idempotency_key', 'organization_id', 'actor_id', 'lease_id', 'property_id', 'unit_id',
    'deposit_id', 'invoice_id', 'payload', 'payload_hash', 'snapshot_hash', 'authorization_hash', 'expires_at', 'created_at',
    'state', 'revision', 'result_id', 'result_message', 'financial_generation']) && same(row.pk, [v.token]),
  'Retired journal intent shape or primary key is invalid.');
  requireThat(['token', 'idempotency_key', 'organization_id', 'actor_id', 'lease_id', 'property_id', 'deposit_id', 'invoice_id']
    .every(key => typeof v[key] === 'string' && uuid.test(v[key])) && (v.unit_id === null || typeof v.unit_id === 'string' && uuid.test(v.unit_id)),
  'Retired journal intent scope is invalid.');
  requireThat(v.financial_generation === 0, 'Retired journal intent must be original generation zero.');
  requireThat(['payload_hash', 'snapshot_hash', 'authorization_hash'].every(key => typeof v[key] === 'string' && digest.test(v[key])),
    'Retired journal evidence hashes are invalid.');
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  requireThat(timestamp(v.created_at) && timestamp(v.expires_at) && Date.parse(v.expires_at) >= Date.parse(v.created_at),
    'Retired journal timestamps are invalid.');
  const terminalMessage = scalarString(v.result_message) && length(v.result_message) >= 1 && length(v.result_message) <= 300;
  requireThat(v.state === 'preview' && v.revision === 1 && v.result_id === null && v.result_message === null ||
    v.state === 'resolved' && v.revision === 3 && typeof v.result_id === 'string' && uuid.test(v.result_id) && terminalMessage ||
    v.state === 'rejected' && v.revision === 3 && v.result_id === null && terminalMessage,
  'Retired journal intent is attempted, uncertain, or has invalid terminal evidence.');
  const p = v.payload, base = ['operation', 'leaseId', 'date', 'reason'];
  requireThat(object(p) && ['apply', 'reverse'].includes(p.operation) &&
    keys(p, [...base, ...(p.operation === 'apply' ? ['depositId', 'invoiceId', 'lineId', 'amount'] : ['applicationId'])]) &&
    p.leaseId === v.lease_id && validDate(p.date) && scalarString(p.reason) && length(p.reason) >= 3 && length(p.reason) <= 200 &&
    p.reason === p.reason.replace(/^ +| +$/g, ''), 'Retired journal payload shape or canonical scope is invalid.');
  let suffix;
  if (p.operation === 'apply') {
    requireThat(p.depositId === v.deposit_id && p.invoiceId === v.invoice_id && typeof p.lineId === 'string' && uuid.test(p.lineId) &&
      typeof p.amount === 'string' && /^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(p.amount) && BigInt(p.amount.replace('.', '')) > 0n,
    'Retired journal apply payload or decimal amount is invalid.');
    suffix = [p.depositId, p.invoiceId, p.lineId, p.amount];
  } else {
    requireThat(typeof p.applicationId === 'string' && uuid.test(p.applicationId), 'Retired journal reverse parent is invalid.');
    suffix = [p.applicationId];
  }
  // Exact SQL deposit_rent_journal_payload_text text[] contract. All members
  // are strings; no amount coercion, Unicode normalization or JS.trim().
  requireThat(v.payload_hash === sha(JSON.stringify(['deposit-rent-journal-payload-v1', p.operation, p.leaseId, p.date, p.reason, ...suffix])),
    'Retired journal canonical payload hash mismatch.');
  return v;
}

export function assertRetiredJournalIntent({ row, decision, migrationBound }) {
  intentValues(row);
  reviewed(row, decision, intentKind, migrationBound);
}

export function assertRetiredJournalSlot({ row, decision, parent, parentDecision, migrationBound }) {
  const v = captured(row, slotTable);
  reviewed(row, decision, slotKind, migrationBound);
  requireThat(keys(v, ['organization_id', 'actor_id', 'lease_id', 'current_token']) &&
    Object.values(v).every(value => typeof value === 'string' && uuid.test(value)) &&
    same(row.pk, [v.organization_id, v.actor_id, v.lease_id]), 'Retired journal slot shape or primary key is invalid.');
  assertRetiredJournalIntent({ row: parent, decision: parentDecision, migrationBound });
  requireThat(keys(decision.parent, ['table', 'pk', 'sha256']) && identity(decision.parent, parent) &&
    decision.parent.sha256 === parent.sha256 && parent.values.token === v.current_token &&
    ['organization_id', 'actor_id', 'lease_id'].every(key => v[key] === parent.values[key]),
  'Retired journal slot requires the exact reviewed same-scope parent intent.');
}

export function assertRetiredJournalLogicalEdge({ edge, row, target, sourceAction, targetRemoved }) {
  const v = intentValues(row);
  requireThat(object(edge) && identity(edge.source, row) && identity(edge.target, target) && targetRemoved === true &&
    object(sourceAction) && sourceAction.kind === intentKind && identity(sourceAction, row) &&
    sourceAction.beforeSha256 === row.sha256 && sourceAction.beforeRowText === row.rowText &&
    sourceAction.allowedAfterRowText === row.rowText && Array.isArray(sourceAction.changedColumns) &&
    sourceAction.changedColumns.length === 0 && sourceAction.expectedStoredAfterSha256 === null && sourceAction.storedImageVerified === false,
  'Retired journal edge requires exact retained source and captured removed target.');
  const invoice = edge.kind === 'static-reference' && edge.column === 'invoice_id' && target.table === 'public.tenant_invoices';
  const application = ['static-reference', 'polymorphic-reference'].includes(edge.kind) && edge.column === 'result_id' &&
    target.table === 'public.deposit_rent_applications' && v.state === 'resolved';
  requireThat(invoice || application, 'Retired journal logical edge kind or column is not permitted.');
  const t = captured(target, invoice ? 'public.tenant_invoices' : 'public.deposit_rent_applications');
  requireThat(typeof t.id === 'string' && uuid.test(t.id) && same(target.pk, [t.id]) &&
    t.organization_id === v.organization_id && t.property_id === v.property_id && t.unit_id === v.unit_id,
  'Retired journal removed parent scope does not match.');
  if (invoice) {
    requireThat(t.id === v.invoice_id && t.lease_id === v.lease_id, 'Retired journal removed invoice does not match.');
  } else {
    requireThat(t.id === v.result_id && t.lease_deposit_id === v.deposit_id && t.invoice_id === v.invoice_id &&
      t.created_by === v.actor_id && t.reversal_of_application_id === (v.payload.operation === 'reverse' ? v.payload.applicationId : null),
    'Retired journal removed resolved application does not match.');
  }
}
