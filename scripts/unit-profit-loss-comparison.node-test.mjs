import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildComparisonHtml,
  validateComparisonFixture,
} from "./unit-profit-loss-comparison-core.mjs";
import {
  OUTPUT_FILENAMES,
  parseComparisonArgs,
} from "./generate-unit-profit-loss-comparison.mjs";

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

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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

test("rejects comparison data whose detail rows do not reconcile", async () => {
  const fixture = await readFixture();
  const invalid = structuredClone(fixture);
  invalid.entries[0].amount += 1;

  assert.throws(
    () => validateComparisonFixture(invalid),
    /income total 1046 does not match 1045/,
  );
});

test("renders the approved compact statement contract in both orientations", async () => {
  const fixture = await readFixture();
  const logo = await readFile(logoPath);
  const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
  const portrait = buildComparisonHtml({
    fixture,
    logoDataUrl,
    orientation: "portrait",
  });
  const landscape = buildComparisonHtml({
    fixture,
    logoDataUrl,
    orientation: "landscape",
  });

  for (const [orientation, html] of [
    ["portrait", portrait],
    ["landscape", landscape],
  ]) {
    assert.match(html, new RegExp(`size: A4 ${orientation}`));
    assert.equal((html.match(/data-meta-row/g) ?? []).length, 2);
    assert.equal((html.match(/<tr data-entry-row/g) ?? []).length, 20);
    assert.equal((html.match(/data-category-row/g) ?? []).length, 0);
    assert.equal((html.match(/<th scope="col"/g) ?? []).length, 4);
    assert.match(
      html,
      /<th scope="col">Date<\/th>[\s\S]*<th scope="col">Category<\/th>[\s\S]*<th scope="col">Description<\/th>[\s\S]*<th scope="col">Amount<\/th>/,
    );
    assert.match(
      html,
      /data-entry-row data-entry-id="income-parking-fee"[\s\S]*Parking Fee[\s\S]*July parking space fee\./,
    );
    assert.match(html, /Income subtotal[\s\S]*USD 1,045\.00/);
    assert.match(html, /Expenses subtotal[\s\S]*USD 788\.00/);
    assert.match(html, /Net income[\s\S]*USD 257\.00/);
    assert.match(html, /data:image\/png;base64,/);
    assert.doesNotMatch(visibleText(html), /Nestory/);
  }

  assert.equal(visibleText(portrait), visibleText(landscape));
});

test("uses stable comparison filenames and an explicit output override", () => {
  assert.deepEqual(OUTPUT_FILENAMES, {
    landscape: "IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf",
    portrait: "IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf",
  });
  assert.deepEqual(parseComparisonArgs([]), { outputDir: "output/pdf" });
  assert.deepEqual(
    parseComparisonArgs(["--output-dir", "tmp/comparison-output"]),
    { outputDir: "tmp/comparison-output" },
  );
  assert.throws(
    () => parseComparisonArgs(["--portrait-only"]),
    /Usage: npm run report:unit-profit-loss:compare/,
  );
});
