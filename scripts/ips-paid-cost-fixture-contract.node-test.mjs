import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const manifestPath = path.join(
  process.cwd(),
  "scripts/fixtures/ips-paid-cost-scenarios.json",
);
const smokePath = path.join(
  process.cwd(),
  "scripts/smoke-ips-paid-cost-scenarios.mjs",
);
const concurrencyPath = path.join(
  process.cwd(),
  "scripts/paid-cost-concurrency.node-test.mjs",
);

test("Track 6 retains the complete paid-cost lifecycle oracle", () => {
  assert.equal(existsSync(manifestPath), true, "paid-cost manifest must exist");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  assert.deepEqual(
    manifest.scenarios.map(({ id }) => id),
    [
      "owner_approved",
      "tenant_approved",
      "petty_cash_approved",
      "rejected_resubmitted",
      "approved_reversed",
      "wrong_amount_corrected",
      "pending_review",
      "missing_evidence",
    ],
  );
  for (const scenario of manifest.scenarios) {
    assert.equal(scenario.evidenceAuthority, "verified_storage_bytes");
    assert.deepEqual(scenario.downstream, [
      "payment",
      "ledger",
      "responsibility",
      "owner_or_tenant_effect",
      "close_readiness",
      "owner_statement_source",
    ]);
  }

  assert.deepEqual(manifest.closeOracle, {
    currency: "USD",
    ownerPersonId: "80000000-0000-0000-0000-000000000014",
    propertyCode: "CLS-RDY",
    activeOwnerPaidCosts: "235.00",
    reversedOwnerPaidCosts: "160.00",
    statementDifference: "0.00",
  });
});

test("Track 6 retains literal database and race executors", () => {
  assert.equal(existsSync(smokePath), true, "paid-cost smoke must exist");
  assert.equal(
    existsSync(concurrencyPath),
    true,
    "paid-cost concurrency harness must exist",
  );
  const smoke = readFileSync(smokePath, "utf8");
  const races = readFileSync(concurrencyPath, "utf8");

  for (const required of [
    "expense_submissions",
    "finance_payment_allocations",
    "ips_expense_responsibilities",
    "owner_close_line_sources",
    "owner_statement_publications",
    "financial_idempotency_requests",
  ]) {
    assert.match(smoke, new RegExp(required));
  }
  for (const required of [
    "duplicate submit",
    "approve versus reject",
    "approve versus reversal",
    "reversal versus resubmit",
    "evidence registration versus mutation",
    "source versus close",
  ]) {
    assert.match(races, new RegExp(required));
  }
});
