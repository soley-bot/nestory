import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  queryOwnerBalanceFixture,
  validateOwnerBalanceFixture,
} from "./smoke-fixture-owner-balance-lifecycle.mjs";

const manifestUrl = new URL("./fixtures/owner-balance-lifecycle.json", import.meta.url);

test("owner-balance fixture pins literal four-component oracles", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.periods.length, 16);
  assert.deepEqual(
    manifest.periods.filter((row) => row.key.startsWith("central:current")).map((row) => [row.component, row.closing]),
    [
      ["ips_due_to_owner", "200.50"],
      ["ips_held_owner_cash", "2125.00"],
      ["owner_due_to_ips", "370.00"],
      ["security_deposit_custody", "860.00"],
    ],
  );
});

test("owner-balance fixture covers every required lifecycle source", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.deepEqual(Object.keys(manifest.sourceCounts), [
    "management_fee_occurrence",
    "owner_component_transfer",
    "owner_contribution",
    "owner_direct_rent_receipt",
    "owner_distribution",
    "owner_invoice_payment",
    "owner_paid_cost",
    "owner_reimbursement",
    "reversal",
    "security_deposit_receipt",
    "security_deposit_refund",
    "tenant_rent_receipt",
  ]);
});

test("loaded fixture proves two-property, two-month lifecycle authority", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const report = queryOwnerBalanceFixture();
  validateOwnerBalanceFixture(report, manifest);
});
