import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = new URL("./fixtures/owner-balance-lifecycle.json", import.meta.url);

function localDatabaseContainer() {
  return findLocalDatabaseContainer(cwd);
}

function queryLocalDatabase(sql) {
  const result = spawnSync(
    "docker",
    ["exec", localDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Owner-balance fixture query failed");
  return result.stdout.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
}

export function prepareOwnerBalanceBlockedSourceFixture() {
  const feeRows = queryLocalDatabase(String.raw`
SELECT json_build_object(
  'feeId', fee.id,
  'feeDate', fee.fee_date,
  'invoiceIssueDate', invoice.issue_date,
  'amount', to_char(fee.amount, 'FM999999999990.00'),
  'propertyId', fee.property_id,
  'feeLeaseId', fee.lease_id,
  'tenantInvoiceId', fee.tenant_invoice_id,
  'invoiceId', invoice.id,
  'invoiceLeaseId', invoice.lease_id,
  'generationSource', invoice.generation_source,
  'billingPeriodStart', invoice.billing_period_start,
  'invoiceLifecycle', invoice.lifecycle,
  'invoiceVoidedAt', invoice.voided_at,
  'feeReversalOfId', fee.reversal_of_id,
  'feeCorrectionOccurrenceId', fee.correction_occurrence_id
)::text
FROM public.management_fee_occurrences AS fee
JOIN public.tenant_invoices AS invoice
  ON invoice.organization_id = fee.organization_id
 AND invoice.id = fee.tenant_invoice_id
WHERE fee.organization_id = '00000000-0000-0000-0000-000000000001'
  AND fee.property_id = '10000000-0000-0000-0000-000000000002'
  AND fee.amount = 116.00
  AND fee.reversal_of_id IS NULL
  AND invoice.property_id = fee.property_id
  AND fee.fee_date = invoice.issue_date
  AND invoice.billing_period_start = date_trunc('month', current_date)::date
  AND invoice.generation_source = 'lease_rules_v1'
  AND invoice.lifecycle = 'issued'
  AND invoice.voided_at IS NULL
ORDER BY fee.id;`);

  assert.equal(feeRows.length, 1, "fixture must select one exact original property-2 management fee");
  const fee = JSON.parse(feeRows[0]);
  assert.equal(fee.propertyId, "10000000-0000-0000-0000-000000000002");
  assert.equal(fee.amount, "116.00");
  assert.equal(fee.tenantInvoiceId, fee.invoiceId, "management fee must retain exact invoice lineage");
  assert.equal(fee.feeLeaseId, fee.invoiceLeaseId, "management fee must retain exact lease lineage");
  assert.equal(fee.generationSource, "lease_rules_v1");
  assert.equal(fee.invoiceLifecycle, "issued", "fixture must select the issued invoice");
  assert.equal(fee.invoiceVoidedAt, null, "fixture must not select a voided invoice");
  assert.equal(fee.feeReversalOfId, null, "fixture must select the original management fee");
  assert.equal(fee.feeCorrectionOccurrenceId, null, "fixture must not select a correction occurrence");
  assert.match(fee.feeDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(fee.feeDate, fee.invoiceIssueDate, "management fee date must match invoice issuance");

  const ownershipRows = queryLocalDatabase(String.raw`
UPDATE public.property_owners
SET started_on = '${fee.feeDate}'::date,
    ended_on = ('${fee.feeDate}'::date + 1)
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = '90000000-0000-0000-0000-000000000005'
  AND property_id = '10000000-0000-0000-0000-000000000002'
  AND person_id = '80000000-0000-0000-0000-000000000012'
  AND ownership_percent = 10.000
  AND ownership_label = 'Deliberate event-date remediation vector'
RETURNING json_build_object(
  'ownershipId', id,
  'propertyId', property_id,
  'startedOn', started_on,
  'endedOn', ended_on,
  'intervalDays', ended_on - started_on
)::text;`);
  assert.equal(ownershipRows.length, 1, "fixture must update only the deliberate extra ownership row");
  const ownership = JSON.parse(ownershipRows[0]);
  assert.equal(ownership.ownershipId, "90000000-0000-0000-0000-000000000005");
  assert.equal(ownership.propertyId, fee.propertyId);
  assert.equal(ownership.startedOn, fee.feeDate, "owner-share interval must start on the selected fee date");
  assert.equal(ownership.intervalDays, 1, "owner-share remediation interval must remain exactly one day");
}

export function validateOwnerBalanceFixture(report, manifest) {
  assert.equal(report.organizationId, manifest.organizationId);
  assert.deepEqual(report.periods, manifest.periods, "literal four-component period oracle changed");
  assert.deepEqual(report.sourceCounts, manifest.sourceCounts, "fixture source registry coverage changed");
  assert.deepEqual(report.transferComponents, manifest.transferComponents, "explicit transfer is not equal and opposite");
  assert.deepEqual(report.blockedSources, manifest.blockedSources, "typed blocked-source remediation changed");
  assert.equal(report.readyPropertyCount, 2, "fixture must prove ready balances for two properties");
  assert.equal(report.readyMonthCount, 2, "fixture must prove two-month roll-forward");
  assert.deepEqual(report.cashLifecycle, {
    contributions: "800.00",
    reimbursements: "40.00",
    distributions: "300.00",
    distributionReversals: "50.00",
    ownerInvoicePayments: "85.00",
    ownerInvoicePaymentReversals: "85.00",
    depositReceipts: "100.00",
    depositRefunds: "40.00",
  });
}

export function queryOwnerBalanceFixture() {
  const sql = String.raw`
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', false);
WITH expected_periods(property_id, owner_person_id, month_start, period_key) AS (
  VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000004'::uuid, date_trunc('month', current_date)::date, 'central:current:80000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000004'::uuid, (date_trunc('month', current_date) + interval '1 month')::date, 'central:next:80000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000003'::uuid, '80000000-0000-0000-0000-000000000009'::uuid, date_trunc('month', current_date)::date, 'garden:current:80000000-0000-0000-0000-000000000009'),
    ('10000000-0000-0000-0000-000000000003'::uuid, '80000000-0000-0000-0000-000000000012'::uuid, (date_trunc('month', current_date) + interval '1 month')::date, 'garden:next:80000000-0000-0000-0000-000000000012')
), period_rows AS (
  SELECT expected.period_key AS key, component.component::text AS component,
    to_char(component.opening_amount, 'FM999999999990.00') AS opening,
    to_char(component.movement_amount, 'FM999999999990.00') AS movement,
    to_char(component.closing_amount, 'FM999999999990.00') AS closing,
    period.status::text AS status,
    expected.property_id,
    expected.month_start
  FROM expected_periods AS expected
  JOIN public.owner_balance_periods AS period
    ON period.organization_id = '00000000-0000-0000-0000-000000000001'
   AND period.property_id = expected.property_id
   AND period.owner_person_id = expected.owner_person_id
   AND period.currency = 'USD'
   AND period.month_start = expected.month_start
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
), source_counts AS (
  SELECT allocation.source_type, count(*)::integer AS count
  FROM public.owner_event_allocation_sets AS allocation
  WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
    AND allocation.property_id IN (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003'
    )
    AND allocation.event_date >= date_trunc('month', current_date)::date
    AND allocation.event_date < (date_trunc('month', current_date) + interval '2 months')::date
  GROUP BY allocation.source_type
), transfer_components AS (
  SELECT instruction.component::text AS component,
    to_char(instruction.amount, 'FM999999999990.00') AS amount,
    count(line.id)::integer AS line_count,
    to_char(sum(line.signed_amount), 'FM999999999990.00') AS signed_total
  FROM public.owner_component_transfer_instructions AS instruction
  JOIN public.owner_component_transfer_lines AS line
    ON line.organization_id = instruction.organization_id
   AND line.transfer_instruction_id = instruction.id
  WHERE instruction.organization_id = '00000000-0000-0000-0000-000000000001'
    AND instruction.idempotency_key LIKE 'fixture-owner-balance-transfer-%'
  GROUP BY instruction.id, instruction.component, instruction.amount
), blocked_sources AS (
  SELECT queue.source_type, queue.gross_signed_amount, queue.remediation_code
  FROM public.get_owner_event_allocation_queue(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'USD',
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) AS queue
  WHERE queue.allocation_state = 'blocked'
), fixture_cash AS (
  SELECT
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'owner_contribution'), 0) AS contributions,
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'owner_reimbursement'), 0) AS reimbursements
  FROM public.owner_cash_events AS event
  WHERE event.organization_id = '00000000-0000-0000-0000-000000000001'
    AND event.idempotency_key LIKE 'fixture-owner-balance-%'
), fixture_withdrawals AS (
  SELECT
    coalesce(sum(withdrawal.amount) FILTER (WHERE withdrawal.reversal_of_id IS NULL), 0) AS distributions,
    coalesce(sum(withdrawal.amount) FILTER (WHERE withdrawal.reversal_of_id IS NOT NULL), 0) AS reversals
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = '00000000-0000-0000-0000-000000000001'
    AND withdrawal.idempotency_key LIKE 'fixture-owner-balance-%'
), fixture_owner_payments AS (
  SELECT
    coalesce(sum(allocation.amount) FILTER (WHERE allocation.reversal_of_allocation_id IS NULL), 0) AS payments,
    coalesce(sum(allocation.amount) FILTER (WHERE allocation.reversal_of_allocation_id IS NOT NULL), 0) AS reversals
  FROM public.owner_payment_allocations AS allocation
  JOIN public.owner_payments AS payment
    ON payment.organization_id = allocation.organization_id
   AND payment.id = allocation.owner_payment_id
  WHERE allocation.organization_id = '00000000-0000-0000-0000-000000000001'
    AND payment.idempotency_key LIKE 'fixture-owner-balance-%'
), fixture_deposits AS (
  SELECT
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'received'), 0) AS receipts,
    coalesce(sum(event.amount) FILTER (WHERE event.event_type = 'refunded'), 0) AS refunds
  FROM public.lease_deposit_events AS event
  WHERE event.organization_id = '00000000-0000-0000-0000-000000000001'
    AND event.reference LIKE 'FIXTURE-OWNER-BALANCE-%'
)
SELECT json_build_object(
  'organizationId', '00000000-0000-0000-0000-000000000001',
  'periods', coalesce((SELECT json_agg(json_build_object(
    'key', key, 'component', component, 'opening', opening, 'movement', movement,
    'closing', closing, 'status', status
  ) ORDER BY key, component) FROM period_rows), '[]'::json),
  'sourceCounts', coalesce((SELECT json_object_agg(source_type, count ORDER BY source_type) FROM source_counts), '{}'::json),
  'transferComponents', coalesce((SELECT json_agg(json_build_object(
    'component', component, 'amount', amount, 'lineCount', line_count, 'signedTotal', signed_total
  ) ORDER BY component) FROM transfer_components), '[]'::json),
  'blockedSources', coalesce((SELECT json_agg(json_build_object(
    'propertyId', '10000000-0000-0000-0000-000000000002',
    'sourceType', source_type, 'amount', gross_signed_amount, 'remediationCode', remediation_code
  ) ORDER BY source_type, gross_signed_amount) FROM blocked_sources), '[]'::json),
  'readyPropertyCount', (SELECT count(DISTINCT property_id)::integer FROM period_rows WHERE status = 'ready'),
  'readyMonthCount', (SELECT count(DISTINCT month_start)::integer FROM period_rows WHERE status = 'ready'),
  'cashLifecycle', json_build_object(
    'contributions', to_char((SELECT contributions FROM fixture_cash), 'FM999999999990.00'),
    'reimbursements', to_char((SELECT reimbursements FROM fixture_cash), 'FM999999999990.00'),
    'distributions', to_char((SELECT distributions FROM fixture_withdrawals), 'FM999999999990.00'),
    'distributionReversals', to_char((SELECT reversals FROM fixture_withdrawals), 'FM999999999990.00'),
    'ownerInvoicePayments', to_char((SELECT payments FROM fixture_owner_payments), 'FM999999999990.00'),
    'ownerInvoicePaymentReversals', to_char((SELECT reversals FROM fixture_owner_payments), 'FM999999999990.00'),
    'depositReceipts', to_char((SELECT receipts FROM fixture_deposits), 'FM999999999990.00'),
    'depositRefunds', to_char((SELECT refunds FROM fixture_deposits), 'FM999999999990.00')
  )
)::text;`;
  const result = spawnSync(
    "docker",
    ["exec", localDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Owner-balance fixture query failed");
  const rows = result.stdout.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  return JSON.parse(rows.at(-1));
}

export async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  prepareOwnerBalanceBlockedSourceFixture();
  const report = queryOwnerBalanceFixture();
  validateOwnerBalanceFixture(report, manifest);
  process.stdout.write("Owner-balance lifecycle fixture reconciled: 16 component rows, 12 source types, 2 properties, 2 months\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
