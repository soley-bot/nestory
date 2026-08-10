import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("./smoke-owner-balance-browser-acceptance.mjs", import.meta.url);

test("owner-balance browser acceptance freezes the complete authenticated operator story", async () => {
  const source = await readFile(scriptUrl, "utf8");
  for (const contract of [
    "opening components visible",
    "pending source allocated",
    "checked contribution recorded",
    "safe distribution reversed",
    "current month regenerated",
    "next month regenerated",
    "exact two-month balances",
    "explicit transfer source visible",
    "Finance Member mutation denial",
    "Operations role route denial",
  ]) {
    assert.match(source, new RegExp(contract.replaceAll(" ", "\\s+"), "i"));
  }
  assert.match(source, /\/workspace/);
  assert.match(source, /openOwnerBalancesFromVisibleFinance/);
  assert.match(source, /public\.record_lease_deposit_event/);
  assert.match(source, /owner_cash_source_consumptions/);
});
