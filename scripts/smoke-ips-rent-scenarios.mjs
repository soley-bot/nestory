import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(path.join(cwd, "scripts", "fixtures", "ips-rent-scenarios.json"), "utf8"),
);

export function runScenarioContract() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(cwd, "node_modules", "supabase", "dist", "supabase.js"),
      "test",
      "db",
      "--local",
      "supabase/tests/ips_rent_scenario_acceptance_test.sql",
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(
      [result.error?.message, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim() ||
        "Track 5 database scenario contract failed",
    );
  }
}

export function queryGuardedRentFixture() {
  const sql = String.raw`
WITH invoice_rows AS (
  SELECT property.code AS property_code, unit.unit_number,
    invoice.billing_period_start, invoice.due_date,
    to_char(invoice.total_amount, 'FM999999999990.00') AS amount,
    balance.collection_route, balance.payment_status,
    to_char(balance.paid_through_ips, 'FM999999999990.00') AS paid_through_ips,
    to_char(balance.collected_by_owner, 'FM999999999990.00') AS collected_by_owner,
    to_char(balance.balance_due, 'FM999999999990.00') AS balance
  FROM public.tenant_invoices AS invoice
  JOIN public.tenant_invoice_balances AS balance ON balance.id = invoice.id
  JOIN public.properties AS property ON property.id = invoice.property_id
  LEFT JOIN public.units AS unit ON unit.id = invoice.unit_id
  WHERE invoice.organization_id = '00000000-0000-0000-0000-000000000001'
    AND invoice.billing_period_start = '2026-08-01'
), selected AS (
  SELECT json_object_agg(
    concat(property_code, ':', coalesce(unit_number, 'NO-UNIT')),
    json_build_object(
      'amount', amount,
      'balance', balance,
      'collectedByOwner', collected_by_owner,
      'collectionRoute', collection_route,
      'dueDate', due_date,
      'paidThroughIps', paid_through_ips,
      'status', payment_status
    ) ORDER BY property_code, unit_number
  ) AS value
  FROM invoice_rows
  WHERE (property_code, unit_number) IN (
    ('RIV-SHP', 'R-01'),
    ('GDN-CRT', 'G-01'),
    ('CTR-RES', 'A-01'),
    ('CTR-RES', 'A-02')
  )
)
SELECT json_build_object(
  'invoices', (SELECT value FROM selected),
  'segmentRows', (
    SELECT count(*)::integer
    FROM public.tenant_invoice_rent_segments
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  'nonLegacySegmentRows', (
    SELECT count(*)::integer
    FROM public.tenant_invoice_rent_segments
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND proration_rule <> 'legacy_snapshot'
  ),
  'track5PendingOrResidue', (
    SELECT count(*)::integer
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND idempotency_key LIKE 'track-5-%'
  )
)::text;`;
  const result = spawnSync(
    "docker",
    [
      "exec",
      findLocalDatabaseContainer(cwd),
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Track 5 guarded fixture query failed");
  }
  const row = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  return JSON.parse(row ?? "null");
}

export function validateGuardedRentFixture(report) {
  const byId = Object.fromEntries(
    manifest.scenarios.map((scenario) => [scenario.id, scenario.oracle]),
  );
  assert.deepEqual(report.invoices["RIV-SHP:R-01"], {
    amount: byId.full_month.amount,
    balance: byId.full_month.balance,
    collectedByOwner: "0.00",
    collectionRoute: "through_ips",
    dueDate: byId.full_month.dueDate,
    paidThroughIps: "0.00",
    status: byId.full_month.status,
  });
  assert.deepEqual(report.invoices["GDN-CRT:G-01"], {
    amount: byId.unpaid.amount,
    balance: byId.unpaid.balance,
    collectedByOwner: "0.00",
    collectionRoute: "through_ips",
    dueDate: byId.unpaid.dueDate,
    paidThroughIps: "0.00",
    status: "unpaid",
  });
  assert.deepEqual(report.invoices["CTR-RES:A-01"], {
    amount: byId.partial_payment.amount,
    balance: byId.partial_payment.balance,
    collectedByOwner: "0.00",
    collectionRoute: "through_ips",
    dueDate: "2026-08-05",
    paidThroughIps: byId.partial_payment.paidThroughIps,
    status: byId.partial_payment.status,
  });
  assert.deepEqual(report.invoices["CTR-RES:A-02"], {
    amount: byId.owner_direct_collection.amount,
    balance: byId.owner_direct_collection.balance,
    collectedByOwner: byId.owner_direct_collection.collectedByOwner,
    collectionRoute: "direct_to_owner",
    dueDate: "2026-08-05",
    paidThroughIps: byId.owner_direct_collection.paidThroughIps,
    status: "partly_paid",
  });
  assert.equal(report.segmentRows, 5, "every guarded invoice must retain one immutable segment");
  assert.equal(report.nonLegacySegmentRows, 5, "guarded invoices must use live immutable segment evidence");
  assert.equal(report.track5PendingOrResidue, 0, "Track 5 contract must leave no idempotency residue");
}

export async function main() {
  runScenarioContract();
  const report = queryGuardedRentFixture();
  validateGuardedRentFixture(report);
  process.stdout.write(
    "IPS rent scenarios reconciled: 10/10 transactional cases; guarded fixture restored\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
