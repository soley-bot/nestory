import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("./fixtures/owner-opening-balances.json", import.meta.url);
const smokeUrl = new URL("./smoke-fixture-owner-opening-balances.mjs", import.meta.url);
const browserUrl = new URL("./smoke-owner-opening-browser-acceptance.mjs", import.meta.url);

test("owner-opening fixture manifest fixes the four-component authority and lineage contract", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, 1);
  assert.equal(manifest.currency, "USD");
  assert.deepEqual(
    manifest.authority.map(({ component, amount }) => [component, amount]),
    [
      ["ips_held_owner_cash", "1250.00"],
      ["owner_due_to_ips", "0.00"],
      ["ips_due_to_owner", "240.50"],
      ["security_deposit_custody", "800.00"],
    ],
  );
  assert.equal(manifest.expected.requestCount, 8);
  assert.equal(manifest.expected.entryCount, 6);
  assert.deepEqual(manifest.expected.requestStatuses, {
    approved: 5,
    rejected: 2,
    submitted: 1,
  });
  assert.equal(manifest.expected.transitionCount, 15);
  assert.match(manifest.reportSha256, /^[0-9a-f]{64}$/);
});

test("fixture reconciliation smoke is mutation-aware and checks physical Storage absence", async () => {
  const source = await readFile(smokeUrl, "utf8");

  for (const required of [
    "reportSha256",
    "ownershipRosterHash",
    "financial_idempotency_requests",
    "activity_logs",
    "storage.objects",
    "supporting_document_id",
    "resubmission_of_request_id",
    "correction_of_entry_id",
  ]) {
    assert.match(source, new RegExp(required.replace(".", "\\.")));
  }
});

test("authenticated acceptance starts at the shell and covers the independent-review zero-correction journey", async () => {
  const source = await readFile(browserUrl, "utf8");

  assert.match(source, /goto\(`?\$\{baseUrl\}\/workspace/);
  assert.match(source, /Open workspace/);
  assert.match(source, /Finance/);
  assert.match(source, /Owner balances/);
  assert.doesNotMatch(source, /goto\([^\n]*owner-balances/);
  for (const required of [
    "finance_member",
    "super_admin",
    "finance_manager",
    "operations_manager",
    "operations_member",
    "reject",
    "resubmit",
    "correction",
    "0.00",
    "role=status",
    "document.activeElement",
  ]) {
    assert.match(source, new RegExp(required));
  }
});
