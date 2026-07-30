import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(
  scriptsDirectory,
  "fixtures",
  "unit-09a-july-2026-profit-loss.json",
);
const logoPath = path.join(
  scriptsDirectory,
  "fixtures",
  "ips-cambodia-logo.png",
);

async function readFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

test("locks the exact Unit 09A July 2026 comparison data", async () => {
  const fixture = await readFixture();
  const income = fixture.entries.filter(({ section }) => section === "income");
  const expenses = fixture.entries.filter(
    ({ section }) => section === "expense",
  );
  const incomeTotal = income.reduce((sum, { amount }) => sum + amount, 0);
  const expenseTotal = expenses.reduce((sum, { amount }) => sum + amount, 0);

  assert.equal(fixture.organizationName, "IPS Cambodia");
  assert.equal(fixture.title, "Profit and loss details");
  assert.equal(fixture.property, "CTR-RES-018 - Central Residence");
  assert.equal(fixture.unit, "09A / Floor 9");
  assert.equal(fixture.period, "01 Jul 2026 - 31 Jul 2026");
  assert.equal(fixture.generated, "30 Jul 2026");
  assert.equal(fixture.basis, "Cash basis");
  assert.equal(fixture.currency, "USD");
  assert.equal(fixture.entries.length, 20);
  assert.equal(income.length, 8);
  assert.equal(expenses.length, 12);
  assert.equal(incomeTotal, 1045);
  assert.equal(expenseTotal, 788);
  assert.deepEqual(fixture.totals, {
    expenses: 788,
    income: 1045,
    netIncome: 257,
  });
});

test("locks the reviewed IPS logo bytes", async () => {
  const logo = await readFile(logoPath);
  const sha256 = createHash("sha256").update(logo).digest("hex");

  assert.equal(logo.byteLength, 100492);
  assert.equal(
    sha256,
    "ef89b036df79f2a1742371b94b156983f0c00d544ce6347a45786424e759dfee",
  );
});
