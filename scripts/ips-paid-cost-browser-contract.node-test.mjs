import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scriptPath = path.join(
  process.cwd(),
  "scripts/smoke-ips-paid-cost-browser-acceptance.mjs",
);

test("Track 6 retains one complete real-role paid-cost browser lifecycle", () => {
  assert.equal(existsSync(scriptPath), true, "paid-cost browser acceptance must exist");
  const source = readFileSync(scriptPath, "utf8");

  for (const required of [
    "Finance Member records an already-paid owner cost with verified evidence",
    "Finance Manager approves the exact paid cost after reviewing its fingerprint",
    "Super Admin reverses the approved cost without erasing the original",
    "corrected paid cost is resubmitted and approved exactly once",
    "Finance Member remains read-only after submission",
    "Operations role is denied the paid-cost route",
    "paid-cost browser database effects reconcile and the guarded fixture is restored",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(source, /getByRole\("button", \{ name: "Record paid cost" \}\)/);
  assert.match(source, /getByRole\("dialog", \{ name: "Approve paid cost" \}\)/);
  assert.match(source, /getByRole\("dialog", \{ name: "Reverse paid cost" \}\)/);
  assert.match(source, /setInputFiles/);
  assert.match(source, /content_sha256/);
  assert.match(source, /approved_payment_id/);
  assert.match(source, /approved_ledger_entry_id/);
  assert.match(source, /expense_customer_adjustments/);
  assert.match(source, /finally[\s\S]*loadBaseline\(false\)/);
});
