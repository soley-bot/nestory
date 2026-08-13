import assert from "node:assert/strict";
import test from "node:test";

import {
  financeManagerDaySmokeContract,
  formatFinanceManagerDayFailure,
  getLocalGatewayContainer,
  resolveFinanceManagerDayConfig,
} from "./smoke-fixture-finance-manager-day.mjs";

test("derives the local API gateway that refreshes after a database reset", () => {
  assert.equal(
    getLocalGatewayContainer("supabase_db_nestory"),
    "supabase_kong_nestory",
  );
  assert.throws(() => getLocalGatewayContainer("postgres"), /unexpected/i);
});

test("defines the local Finance Manager day journey and every required allowed state", () => {
  assert.equal(financeManagerDaySmokeContract.email, "finance.manager@nestory.com");
  assert.deepEqual(financeManagerDaySmokeContract.allowed, [
    "unique-finance-manager-membership",
    "lease-configuration",
    "historical-rent-recovery",
    "record-payment",
    "confirm-owner-direct-collection",
    "record-owner-invoice-payment",
    "record-owner-distribution",
    "retry-current-rent",
    "review-paid-cost",
    "create-petty-cash-entry",
    "post-petty-cash-entry",
    "lock-financial-month",
    "read-ledger",
    "navigate-to-reports",
    "export-pdf",
    "export-excel",
    "read-owner-statement-publications",
  ]);
});

test("declares every forbidden structural, maker-checker, and correction control", () => {
  assert.deepEqual(financeManagerDaySmokeContract.forbidden, [
    "submit-paid-cost",
    "finance-correction-or-reversal",
    "finance-correction-or-reversal-expense",
    "petty-cash-account-or-float-configuration",
    "petty-cash-rollover",
    "petty-cash-update",
    "petty-cash-void",
    "unlock-financial-month",
    "reconciliation-source-configuration",
  ]);
});

test("declares same-request replay coverage for every keyed ordinary create or review", () => {
  assert.deepEqual(financeManagerDaySmokeContract.replayCoverage, {
    sameRequestKey: [
      "record-payment",
      "confirm-owner-direct-collection",
      "record-owner-invoice-payment",
      "record-owner-distribution",
      "review-paid-cost",
      "create-petty-cash-entry",
    ],
    naturalIdentity: ["retry-current-rent", "post-petty-cash-entry"],
    rejectedReplay: ["lock-financial-month"],
    unavailable: [],
  });
  assert.ok(financeManagerDaySmokeContract.allowed.includes("navigate-to-reports"));
});

test("accepts only a local URL and keeps the password out of diagnostics", () => {
  const fixtureCredentialMarker = ["fixture", "credential", "marker"].join("-");
  const config = resolveFinanceManagerDayConfig({
    NESTORY_BASE_URL: "http://localhost:3101",
    NESTORY_TEST_PASSWORD: fixtureCredentialMarker,
  });
  assert.equal(config.baseUrl, "http://localhost:3101");
  assert.equal(config.email, "finance.manager@nestory.com");
  assert.equal(config.password, fixtureCredentialMarker);
  assert.throws(
    () => resolveFinanceManagerDayConfig({ NESTORY_BASE_URL: "https://nestory.example.com" }),
    /loopback/i,
  );
  assert.equal(
    formatFinanceManagerDayFailure(
      "post-petty-cash-entry",
      `password=${fixtureCredentialMarker}`,
    ),
    "Finance Manager day post-petty-cash-entry: journey failed",
  );
});
