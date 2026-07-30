# Compact Unit Profit And Loss Dual-Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate searchable, one-page A4 portrait and landscape comparison PDFs for the exact Unit 09A July 2026 profit and loss data, with the IPS logo, two metadata rows, and compact spreadsheet-style transaction rows.

**Architecture:** Keep the authenticated Nestory PDF endpoint and production report renderer unchanged during the comparison. Add a deterministic Node/Playwright comparison tool that reads one reviewed JSON fixture and one local IPS logo asset, renders the same semantic HTML in both orientations, and writes the two ignored PDF artifacts for visual selection.

**Tech Stack:** Node.js ESM, Node's built-in test runner, Playwright 1.61.1, HTML/CSS print layout, the existing npm scripts, Poppler `pdfinfo`/`pdftoppm`, and managed-runtime `pypdf`.

## Global Constraints

- Follow `PROJECT_RULES.md`, `docs/engineering-rules.md`, `docs/verification.md`, and `docs/superpowers/specs/2026-07-30-unit-profit-loss-dual-layout-design.md`.
- Generate A4 portrait at 595 by 842 points and A4 landscape at 842 by 595 points.
- Use exactly the same 20 transaction rows, ordering, labels, and totals in both orientations.
- Show exactly two metadata rows beneath the title.
- Use exactly four table columns: Date, Category, Description, Amount.
- Category must appear on every transaction row; do not render standalone category rows.
- Show the IPS logo in the upper-right header and no visible `Nestory` sample label.
- Use compact 7.8-8 point body text, 9-9.5 point line spacing, 16-18 point minimum rows, and approximately 24-point top and bottom margins.
- Keep Income and Expenses section rows, section subtotals, and the three-row final totals block.
- Do not add organization logo persistence, storage, a settings screen, a database migration, an API query option, or an authenticated UI control.
- Do not fetch the logo during an application request. The comparison tool reads a local, checksum-locked asset.
- Do not modify other report kinds, Excel export, financial calculations, or the Reports screen.
- Do not push.

## File Structure

- Create `scripts/fixtures/unit-09a-july-2026-profit-loss.json`
  - Owns the exact reviewed comparison data and expected totals.
- Create `scripts/fixtures/ips-cambodia-logo.png`
  - Owns the published IPS sample mark, locked by SHA-256.
- Create `scripts/unit-profit-loss-comparison-core.mjs`
  - Owns fixture validation, money formatting, escaping, and orientation-neutral HTML generation.
- Create `scripts/generate-unit-profit-loss-comparison.mjs`
  - Owns CLI parsing, local input loading, Playwright startup, and PDF writes.
- Create `scripts/unit-profit-loss-comparison.node-test.mjs`
  - Owns fixture, branding, semantic markup, orientation, and CLI contract tests.
- Modify `package.json`
  - Adds the comparison command and includes its Node test in `test:demo-tools`.
- Generate, but do not commit:
  - `output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf`
  - `output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf`
  - `tmp/unit-profit-loss-comparison/portrait/page-1.png`
  - `tmp/unit-profit-loss-comparison/landscape/page-1.png`

---

### Task 1: Lock The Authoritative Unit 09A Fixture And IPS Asset

**Files:**

- Create: `scripts/fixtures/unit-09a-july-2026-profit-loss.json`
- Create: `scripts/fixtures/ips-cambodia-logo.png`
- Create: `scripts/unit-profit-loss-comparison.node-test.mjs`

**Interfaces:**

- Consumes: the approved Unit 09A July 2026 values already verified in `output/pdf/Nestory-Unit-09A-Profit-Loss-July-2026.pdf`.
- Produces: a JSON object with `organizationName`, `title`, `property`, `unit`, `period`, `generated`, `basis`, `currency`, `entries`, and `totals`.
- Produces: the exact 100,492-byte IPS PNG whose SHA-256 is `ef89b036df79f2a1742371b94b156983f0c00d544ce6347a45786424e759dfee`.

- [ ] **Step 1: Write the failing fixture and asset test**

Create `scripts/unit-profit-loss-comparison.node-test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
```

Expected: FAIL with `ENOENT` because the fixture and local logo do not exist.

- [ ] **Step 3: Add the exact reviewed fixture**

Create `scripts/fixtures/unit-09a-july-2026-profit-loss.json`:

```json
{
  "organizationName": "IPS Cambodia",
  "title": "Profit and loss details",
  "property": "CTR-RES-018 - Central Residence",
  "unit": "09A / Floor 9",
  "period": "01 Jul 2026 - 31 Jul 2026",
  "generated": "30 Jul 2026",
  "basis": "Cash basis",
  "currency": "USD",
  "entries": [
    {
      "id": "income-parking-fee",
      "section": "income",
      "date": "03 Jul 2026",
      "category": "Parking Fee",
      "description": "July parking space fee.",
      "amount": 60
    },
    {
      "id": "income-storage-fee",
      "section": "income",
      "date": "06 Jul 2026",
      "category": "Storage Fee",
      "description": "July storage locker fee.",
      "amount": 30
    },
    {
      "id": "income-utility-reimbursement",
      "section": "income",
      "date": "08 Jul 2026",
      "category": "Utility Reimbursement",
      "description": "Tenant utility reimbursement for July.",
      "amount": 45
    },
    {
      "id": "income-late-fee",
      "section": "income",
      "date": "12 Jul 2026",
      "category": "Late Fee",
      "description": "Late payment fee collected.",
      "amount": 25
    },
    {
      "id": "income-cleaning-reimbursement",
      "section": "income",
      "date": "17 Jul 2026",
      "category": "Cleaning Reimbursement",
      "description": "Move-in cleaning reimbursement.",
      "amount": 35
    },
    {
      "id": "income-pet-fee",
      "section": "income",
      "date": "19 Jul 2026",
      "category": "Pet Fee",
      "description": "Monthly pet fee.",
      "amount": 50
    },
    {
      "id": "income-key-replacement",
      "section": "income",
      "date": "22 Jul 2026",
      "category": "Key Replacement",
      "description": "Replacement access key reimbursement.",
      "amount": 20
    },
    {
      "id": "income-rent",
      "section": "income",
      "date": "28 Jul 2026",
      "category": "Rent",
      "description": "Rent received for Central Residence 09A.",
      "amount": 780
    },
    {
      "id": "expense-building-service-charge",
      "section": "expense",
      "date": "02 Jul 2026",
      "category": "Building Service Charge",
      "description": "Monthly building service charge.",
      "amount": 90
    },
    {
      "id": "expense-water-bill",
      "section": "expense",
      "date": "04 Jul 2026",
      "category": "Water Bill",
      "description": "July shared water charge.",
      "amount": 42
    },
    {
      "id": "expense-ac-service",
      "section": "expense",
      "date": "05 Jul 2026",
      "category": "Ac Service",
      "description": "Air conditioner cleaning and inspection.",
      "amount": 75
    },
    {
      "id": "expense-cleaning-service",
      "section": "expense",
      "date": "07 Jul 2026",
      "category": "Cleaning Service",
      "description": "Deep cleaning service for the unit.",
      "amount": 40
    },
    {
      "id": "expense-electrical-repair",
      "section": "expense",
      "date": "10 Jul 2026",
      "category": "Electrical Repair",
      "description": "Replaced faulty kitchen outlet.",
      "amount": 55
    },
    {
      "id": "expense-pest-control",
      "section": "expense",
      "date": "13 Jul 2026",
      "category": "Pest Control",
      "description": "Scheduled pest control treatment.",
      "amount": 35
    },
    {
      "id": "expense-smoke-alarm-battery",
      "section": "expense",
      "date": "14 Jul 2026",
      "category": "Smoke Alarm Battery",
      "description": "Replaced smoke alarm battery.",
      "amount": 18
    },
    {
      "id": "expense-appliance-repair",
      "section": "expense",
      "date": "16 Jul 2026",
      "category": "Appliance Repair",
      "description": "Refrigerator thermostat replacement.",
      "amount": 110
    },
    {
      "id": "expense-consumable-supplies",
      "section": "expense",
      "date": "20 Jul 2026",
      "category": "Consumable Supplies",
      "description": "Light bulbs and basic unit supplies.",
      "amount": 28
    },
    {
      "id": "expense-plumbing-repair",
      "section": "expense",
      "date": "24 Jul 2026",
      "category": "Plumbing Repair",
      "description": "Kitchen sink leak follow-up parts and labor estimate.",
      "amount": 185
    },
    {
      "id": "expense-internet-service",
      "section": "expense",
      "date": "26 Jul 2026",
      "category": "Internet Service",
      "description": "July managed internet service.",
      "amount": 65
    },
    {
      "id": "expense-locksmith-service",
      "section": "expense",
      "date": "27 Jul 2026",
      "category": "Locksmith Service",
      "description": "Adjusted and serviced the entry lock.",
      "amount": 45
    }
  ],
  "totals": {
    "income": 1045,
    "expenses": 788,
    "netIncome": 257
  }
}
```

- [ ] **Step 4: Download the exact IPS source asset into the reviewed local path**

Run from the repository root:

```powershell
$comparisonRoot = (Resolve-Path '.').Path
$fixtureDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path $comparisonRoot 'scripts\fixtures')
)
$logoTarget = [System.IO.Path]::GetFullPath(
  (Join-Path $fixtureDirectory 'ips-cambodia-logo.png')
)
$expectedPrefix = $comparisonRoot + [System.IO.Path]::DirectorySeparatorChar
if (-not $logoTarget.StartsWith(
  $expectedPrefix,
  [System.StringComparison]::OrdinalIgnoreCase
)) {
  throw "Logo target escaped the repository: $logoTarget"
}
New-Item -ItemType Directory -Force -Path $fixtureDirectory | Out-Null
Invoke-WebRequest `
  -Uri 'https://biz.prlog.org/IPSCambodia/logo.png' `
  -OutFile $logoTarget `
  -UseBasicParsing
```

Do not substitute another IPS company. The checksum test is the acceptance
gate for the downloaded bytes.

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit the locked inputs**

```powershell
git add scripts/fixtures/unit-09a-july-2026-profit-loss.json scripts/fixtures/ips-cambodia-logo.png scripts/unit-profit-loss-comparison.node-test.mjs
git commit -m "test: lock unit statement comparison inputs"
```

---

### Task 2: Build The Compact Orientation-Neutral HTML Renderer

**Files:**

- Create: `scripts/unit-profit-loss-comparison-core.mjs`
- Modify: `scripts/unit-profit-loss-comparison.node-test.mjs`

**Interfaces:**

- Consumes: the Task 1 fixture object and a `data:image/png;base64,...` URL.
- Produces: `validateComparisonFixture(fixture): { expenseTotal: number, incomeTotal: number, netIncome: number }`.
- Produces: `buildComparisonHtml({ fixture, logoDataUrl, orientation }): string`, where `orientation` is exactly `"portrait"` or `"landscape"`.
- Guarantees: two metadata rows, four table columns, 20 entry rows, no category-only rows, and identical visible content in both orientations.

- [ ] **Step 1: Add failing renderer contract tests**

Append these imports and tests to
`scripts/unit-profit-loss-comparison.node-test.mjs`:

```js
import {
  buildComparisonHtml,
  validateComparisonFixture,
} from "./unit-profit-loss-comparison-core.mjs";

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
    assert.equal((html.match(/data-entry-row/g) ?? []).length, 20);
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`unit-profit-loss-comparison-core.mjs`.

- [ ] **Step 3: Implement strict fixture validation and formatting**

Create `scripts/unit-profit-loss-comparison-core.mjs` with these helpers:

```js
const ORIENTATIONS = new Set(["portrait", "landscape"]);

export function validateComparisonFixture(fixture) {
  if (!fixture || !Array.isArray(fixture.entries)) {
    throw new Error("Comparison fixture must contain an entries array.");
  }

  for (const entry of fixture.entries) {
    if (!["income", "expense"].includes(entry.section)) {
      throw new Error(`Unsupported entry section: ${entry.section}`);
    }
    if (!Number.isFinite(entry.amount) || entry.amount < 0) {
      throw new Error(`Invalid amount for ${entry.id}: ${entry.amount}`);
    }
  }

  const incomeTotal = sumSection(fixture.entries, "income");
  const expenseTotal = sumSection(fixture.entries, "expense");
  const netIncome = incomeTotal - expenseTotal;

  if (incomeTotal !== fixture.totals.income) {
    throw new Error(
      `Calculated income total ${incomeTotal} does not match ${fixture.totals.income}.`,
    );
  }
  if (expenseTotal !== fixture.totals.expenses) {
    throw new Error(
      `Calculated expense total ${expenseTotal} does not match ${fixture.totals.expenses}.`,
    );
  }
  if (netIncome !== fixture.totals.netIncome) {
    throw new Error(
      `Calculated net income ${netIncome} does not match ${fixture.totals.netIncome}.`,
    );
  }

  return { expenseTotal, incomeTotal, netIncome };
}

function sumSection(entries, section) {
  return entries
    .filter((entry) => entry.section === section)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function formatMoney(amount, currency) {
  return `${currency} ${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 4: Implement one semantic table shared by both orientations**

Continue in `scripts/unit-profit-loss-comparison-core.mjs`:

```js
function renderEntryRow(entry, currency) {
  return `
    <tr data-entry-row data-entry-id="${escapeHtml(entry.id)}">
      <td class="date">${escapeHtml(entry.date)}</td>
      <td class="category">${escapeHtml(entry.category)}</td>
      <td class="description">${escapeHtml(entry.description)}</td>
      <td class="amount">${formatMoney(entry.amount, currency)}</td>
    </tr>`;
}

function renderSection(fixture, section, label, subtotal) {
  const rows = fixture.entries
    .filter((entry) => entry.section === section)
    .map((entry) => renderEntryRow(entry, fixture.currency))
    .join("");

  return `
    <tr class="section-row">
      <th colspan="4" scope="rowgroup">${label}</th>
    </tr>
    ${rows}
    <tr class="subtotal-row">
      <th colspan="3" scope="row">${label} subtotal</th>
      <td class="amount">${formatMoney(subtotal, fixture.currency)}</td>
    </tr>`;
}

export function buildComparisonHtml({
  fixture,
  logoDataUrl,
  orientation,
}) {
  if (!ORIENTATIONS.has(orientation)) {
    throw new Error(`Unsupported orientation: ${orientation}`);
  }
  if (!logoDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The comparison logo must be a local PNG data URL.");
  }

  const totals = validateComparisonFixture(fixture);
  const incomeRows = renderSection(
    fixture,
    "income",
    "Income",
    totals.incomeTotal,
  );
  const expenseRows = renderSection(
    fixture,
    "expense",
    "Expenses",
    totals.expenseTotal,
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(fixture.title)} - ${escapeHtml(fixture.unit)}</title>
    <style>
      @page {
        size: A4 ${orientation};
        margin: 24pt 28pt;
      }

      :root {
        color-scheme: light;
        font-family: Arial, Helvetica, sans-serif;
        font-synthesis: none;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        --accent: #2f5f7f;
        --border: #cbd5df;
        --header-fill: #edf3f8;
        --ink: #17212b;
        --muted: #5d6b78;
        --section-fill: #f3f6f9;
        color: var(--ink);
        font-size: 7.8pt;
        line-height: 9.2pt;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body[data-orientation="portrait"] {
        --columns: 70pt 125pt minmax(0, 1fr) 89pt;
        --logo-height: 40pt;
        --logo-width: 92pt;
        --logo-source-left: -61pt;
        --logo-source-top: -55pt;
        --logo-source-width: 210pt;
      }

      body[data-orientation="landscape"] {
        --columns: 78pt 180pt minmax(0, 1fr) 105pt;
        --logo-height: 44pt;
        --logo-width: 105pt;
        --logo-source-left: -70pt;
        --logo-source-top: -63pt;
        --logo-source-width: 240pt;
      }

      .report {
        padding-bottom: 18pt;
      }

      .title-row {
        align-items: flex-start;
        display: flex;
        justify-content: space-between;
        min-height: var(--logo-height);
      }

      h1 {
        font-size: 18pt;
        line-height: 21pt;
        margin: 1pt 18pt 0 0;
      }

      .logo-window {
        flex: 0 0 auto;
        height: var(--logo-height);
        overflow: hidden;
        position: relative;
        width: var(--logo-width);
      }

      .logo-window img {
        height: auto;
        left: var(--logo-source-left);
        max-width: none;
        position: absolute;
        top: var(--logo-source-top);
        width: var(--logo-source-width);
      }

      .metadata {
        border-bottom: 0.5pt solid var(--border);
        margin: 1pt 0 6pt;
        padding-bottom: 5pt;
      }

      .metadata p {
        color: var(--muted);
        font-size: 8pt;
        line-height: 10pt;
        margin: 0;
      }

      .metadata strong {
        color: var(--ink);
        font-weight: 700;
      }

      table {
        border-collapse: collapse;
        table-layout: fixed;
        width: 100%;
      }

      col.date {
        width: var(--date-width);
      }

      thead {
        display: table-header-group;
      }

      thead tr {
        background: var(--header-fill);
        height: 18pt;
      }

      th,
      td {
        border-bottom: 0.35pt solid var(--border);
        padding: 3pt 5pt;
        text-align: left;
        vertical-align: top;
      }

      thead th {
        font-size: 7.4pt;
        font-weight: 700;
        line-height: 8.5pt;
      }

      thead th:last-child,
      .amount {
        text-align: right;
      }

      tbody tr[data-entry-row] {
        min-height: 16pt;
      }

      .category {
        color: var(--accent);
        font-weight: 700;
        padding-left: 9pt;
      }

      .description {
        overflow-wrap: anywhere;
      }

      .date,
      .amount {
        white-space: nowrap;
      }

      .section-row {
        background: var(--section-fill);
        break-after: avoid;
        height: 16pt;
      }

      .section-row th {
        font-size: 8.2pt;
        font-weight: 700;
        padding-bottom: 3pt;
        padding-top: 3pt;
      }

      .subtotal-row {
        break-inside: avoid;
        height: 17pt;
      }

      .subtotal-row th,
      .subtotal-row td {
        border-bottom-width: 0.7pt;
        font-weight: 700;
      }

      .subtotal-row th {
        text-align: right;
      }

      .totals {
        break-inside: avoid;
        margin-left: auto;
        margin-top: 5pt;
        width: min(240pt, 46%);
      }

      .totals-row {
        display: grid;
        font-size: 8pt;
        grid-template-columns: 1fr auto;
        line-height: 10pt;
        min-height: 16pt;
        padding: 3pt 5pt;
      }

      .totals-row span:last-child {
        min-width: 86pt;
        text-align: right;
      }

      .totals-row.net {
        border-top: 0.8pt solid var(--ink);
        font-size: 10pt;
        font-weight: 700;
        line-height: 12pt;
        margin-top: 1pt;
      }

      footer {
        border-top: 0.5pt solid var(--border);
        bottom: 0;
        color: var(--muted);
        display: flex;
        font-size: 7pt;
        justify-content: space-between;
        left: 0;
        line-height: 9pt;
        padding-top: 4pt;
        position: fixed;
        right: 0;
      }
    </style>
  </head>
  <body data-orientation="${orientation}">
    <main class="report">
      <header>
        <div class="title-row">
          <h1>${escapeHtml(fixture.title)}</h1>
          <div class="logo-window">
            <img data-logo src="${logoDataUrl}" alt="${escapeHtml(
              fixture.organizationName,
            )}">
          </div>
        </div>
        <div class="metadata">
          <p data-meta-row><strong>Property:</strong> ${escapeHtml(
            fixture.property,
          )} | <strong>Unit:</strong> ${escapeHtml(fixture.unit)}</p>
          <p data-meta-row><strong>Period:</strong> ${escapeHtml(
            fixture.period,
          )} | <strong>Generated:</strong> ${escapeHtml(
            fixture.generated,
          )} | ${escapeHtml(fixture.basis)}</p>
        </div>
      </header>

      <table aria-label="Unit profit and loss transaction details">
        <colgroup>
          <col style="width: ${
            orientation === "portrait" ? "70pt" : "78pt"
          }">
          <col style="width: ${
            orientation === "portrait" ? "125pt" : "180pt"
          }">
          <col>
          <col style="width: ${
            orientation === "portrait" ? "89pt" : "105pt"
          }">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Category</th>
            <th scope="col">Description</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${incomeRows}
          ${expenseRows}
        </tbody>
      </table>

      <section class="totals" aria-label="Statement totals">
        <div class="totals-row">
          <span>Total income</span>
          <span>${formatMoney(totals.incomeTotal, fixture.currency)}</span>
        </div>
        <div class="totals-row">
          <span>Total expenses</span>
          <span>${formatMoney(totals.expenseTotal, fixture.currency)}</span>
        </div>
        <div class="totals-row net">
          <span>Net income</span>
          <span>${formatMoney(totals.netIncome, fixture.currency)}</span>
        </div>
      </section>
    </main>

    <footer>
      <span>Unit financial statement</span>
      <span>Page 1 of 1</span>
    </footer>
  </body>
</html>`;
}
```

Remove the unused `.date` `<col>` selector if ESLint reports it; do not change
the four explicit `<colgroup>` widths or introduce an extra column.

- [ ] **Step 5: Run the renderer tests and verify GREEN**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit the renderer**

```powershell
git add scripts/unit-profit-loss-comparison-core.mjs scripts/unit-profit-loss-comparison.node-test.mjs
git commit -m "feat: render compact unit statement comparisons"
```

---

### Task 3: Add The Playwright PDF Generator

**Files:**

- Create: `scripts/generate-unit-profit-loss-comparison.mjs`
- Modify: `scripts/unit-profit-loss-comparison.node-test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `buildComparisonHtml(...)` and `validateComparisonFixture(...)` from Task 2.
- Produces: `parseComparisonArgs(args): { outputDir: string }`.
- Produces: `OUTPUT_FILENAMES`, with exact `portrait` and `landscape` names.
- Produces: two PDFs in the selected output directory, with no remote image request during rendering.

- [ ] **Step 1: Add failing CLI contract tests**

Append to `scripts/unit-profit-loss-comparison.node-test.mjs`:

```js
import {
  OUTPUT_FILENAMES,
  parseComparisonArgs,
} from "./generate-unit-profit-loss-comparison.mjs";

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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`generate-unit-profit-loss-comparison.mjs`.

- [ ] **Step 3: Implement the side-effect-free CLI contract**

Create `scripts/generate-unit-profit-loss-comparison.mjs`:

```js
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { chromium } from "playwright";

import {
  buildComparisonHtml,
  validateComparisonFixture,
} from "./unit-profit-loss-comparison-core.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
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
const IPS_LOGO_SHA256 =
  "ef89b036df79f2a1742371b94b156983f0c00d544ce6347a45786424e759dfee";

export const OUTPUT_FILENAMES = {
  landscape: "IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf",
  portrait: "IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf",
};

export function parseComparisonArgs(args) {
  if (args.length === 0) {
    return { outputDir: "output/pdf" };
  }
  if (args.length === 2 && args[0] === "--output-dir" && args[1]) {
    return { outputDir: args[1] };
  }
  throw new Error(
    "Usage: npm run report:unit-profit-loss:compare -- [--output-dir PATH]",
  );
}
```

- [ ] **Step 4: Implement deterministic portrait and landscape PDF writes**

Continue in `scripts/generate-unit-profit-loss-comparison.mjs`:

```js
export async function main(args = process.argv.slice(2)) {
  const { outputDir } = parseComparisonArgs(args);
  const resolvedOutputDir = path.resolve(repositoryRoot, outputDir);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const logo = await readFile(logoPath);
  const logoHash = createHash("sha256").update(logo).digest("hex");

  if (logoHash !== IPS_LOGO_SHA256) {
    throw new Error(
      `IPS logo checksum ${logoHash} does not match ${IPS_LOGO_SHA256}.`,
    );
  }
  validateComparisonFixture(fixture);

  const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
  await mkdir(resolvedOutputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const orientation of ["portrait", "landscape"]) {
      const page = await browser.newPage();
      try {
        const html = buildComparisonHtml({
          fixture,
          logoDataUrl,
          orientation,
        });
        await page.setContent(html, { waitUntil: "load" });
        await page.emulateMedia({ media: "print" });
        await page.pdf({
          displayHeaderFooter: false,
          landscape: orientation === "landscape",
          path: path.join(resolvedOutputDir, OUTPUT_FILENAMES[orientation]),
          preferCSSPageSize: true,
          printBackground: true,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const orientation of ["portrait", "landscape"]) {
    console.log(
      path.join(resolvedOutputDir, OUTPUT_FILENAMES[orientation]),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Add the npm command and regression-test registration**

Modify the `scripts` object in `package.json`:

```json
{
  "report:unit-profit-loss:compare": "node scripts/generate-unit-profit-loss-comparison.mjs",
  "test:demo-tools": "node --test scripts/reset-demo-data.node-test.mjs scripts/demo-seed-source.node-test.mjs scripts/demo-seed-manifest.node-test.mjs scripts/hosted-demo-cutover-plan.node-test.mjs scripts/target-org-dump.node-test.mjs scripts/unit-profit-loss-comparison.node-test.mjs"
}
```

Keep all existing script entries. Replace only the current `test:demo-tools`
value and add the new generator command; do not add or update dependencies.

- [ ] **Step 6: Run the Node tests and verify GREEN**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
npm run test:demo-tools
```

Expected: the focused comparison tests pass, and the complete demo-tools suite
remains green.

- [ ] **Step 7: Generate both comparison PDFs**

Run:

```powershell
npm run report:unit-profit-loss:compare
Get-ChildItem -LiteralPath 'output\pdf' `
  -Filter 'IPS-Unit-09A-Profit-Loss-July-2026-*.pdf' |
  Sort-Object Name |
  Select-Object Name,Length,LastWriteTime
```

Expected: both exact filenames exist and have nonzero lengths.

- [ ] **Step 8: Commit the generator**

```powershell
git add package.json scripts/generate-unit-profit-loss-comparison.mjs scripts/unit-profit-loss-comparison.node-test.mjs
git commit -m "feat: generate dual-layout unit statement PDFs"
```

Do not add files under `output/`.

---

### Task 4: Verify Both PDFs And Inspect Their Rasterized Pages

**Files:**

- Verify: `scripts/unit-profit-loss-comparison.node-test.mjs`
- Verify: `output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf`
- Verify: `output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf`
- Generate temporarily: `tmp/unit-profit-loss-comparison/portrait/page-1.png`
- Generate temporarily: `tmp/unit-profit-loss-comparison/landscape/page-1.png`

**Interfaces:**

- Consumes: both PDFs generated by Task 3.
- Produces: page-size, page-count, extracted-text, and visual evidence.
- Produces: no tracked source changes.

- [ ] **Step 1: Run focused and repository regression checks**

Run:

```powershell
node --test scripts/unit-profit-loss-comparison.node-test.mjs
npm run lint -- scripts/unit-profit-loss-comparison-core.mjs scripts/generate-unit-profit-loss-comparison.mjs scripts/unit-profit-loss-comparison.node-test.mjs
npm run test:all
npm run build
git diff --check
```

Expected: every command exits successfully. Do not claim production endpoint
verification, because the approved comparison intentionally leaves it
unchanged.

- [ ] **Step 2: Prove both media boxes and one-page counts**

Run:

```powershell
$pdfInfo = 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdfinfo.exe'
& $pdfInfo 'output\pdf\IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf'
& $pdfInfo 'output\pdf\IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf'
```

Expected:

- portrait: `Pages: 1` and `Page size: 595 x 842 pts (A4)`
- landscape: `Pages: 1` and `Page size: 842 x 595 pts (A4)`

- [ ] **Step 3: Extract and compare the searchable PDF text**

Run:

```powershell
@'
from pathlib import Path
from pypdf import PdfReader

paths = {
    "portrait": Path(
        r"output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf"
    ),
    "landscape": Path(
        r"output/pdf/IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf"
    ),
}
required = [
    "Profit and loss details",
    "CTR-RES-018 - Central Residence",
    "09A / Floor 9",
    "01 Jul 2026 - 31 Jul 2026",
    "Cash basis",
    "Date",
    "Category",
    "Description",
    "Amount",
    "Income",
    "Parking Fee",
    "July parking space fee.",
    "Rent",
    "Rent received for Central Residence 09A.",
    "Income subtotal",
    "USD 1,045.00",
    "Expenses",
    "Building Service Charge",
    "Monthly building service charge.",
    "Plumbing Repair",
    "Kitchen sink leak follow-up parts and labor estimate.",
    "Expenses subtotal",
    "USD 788.00",
    "Total income",
    "Total expenses",
    "Net income",
    "USD 257.00",
    "Unit financial statement",
    "Page 1 of 1",
]
texts = {}
for name, path in paths.items():
    reader = PdfReader(path)
    if len(reader.pages) != 1:
        raise SystemExit(f"{name} has {len(reader.pages)} pages")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    missing = [value for value in required if value not in text]
    if missing:
        raise SystemExit(f"{name} missing text: {missing}")
    if "Nestory" in text:
        raise SystemExit(f"{name} still contains Nestory sample branding")
    texts[name] = " ".join(text.split())

if texts["portrait"] != texts["landscape"]:
    raise SystemExit("Portrait and landscape visible text differs")

print("Both one-page PDFs contain identical searchable report content.")
'@ | & 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -
```

Expected: the script prints the success line and exits zero.

- [ ] **Step 4: Rasterize page 1 from each PDF**

Run:

```powershell
$rasterizer = 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe'
New-Item -ItemType Directory -Force `
  -Path 'tmp\unit-profit-loss-comparison\portrait' |
  Out-Null
New-Item -ItemType Directory -Force `
  -Path 'tmp\unit-profit-loss-comparison\landscape' |
  Out-Null
& $rasterizer -png -r 150 `
  'output\pdf\IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf' `
  'tmp\unit-profit-loss-comparison\portrait\page'
& $rasterizer -png -r 150 `
  'output\pdf\IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf' `
  'tmp\unit-profit-loss-comparison\landscape\page'
Get-ChildItem -LiteralPath 'tmp\unit-profit-loss-comparison' `
  -Recurse `
  -Filter '*.png' |
  Sort-Object FullName |
  Select-Object FullName,Length
```

Expected: exactly two PNG files, one for each one-page PDF.

- [ ] **Step 5: Inspect both PNGs at original detail**

Open both rasterized pages with the local image viewer and inspect:

- IPS logo is clearly legible, right-aligned, uncropped, and not stretched.
- Title and logo share a compact header row.
- Property/unit and period/generated/basis occupy exactly two lines.
- Date, Category, Description, and Amount are the only columns.
- Every category appears on the same row as its description with a small inset.
- Income and Expenses are clearly separated without standalone category rows.
- Rows are compact but readable.
- Descriptions, including Plumbing Repair, do not clip or overlap.
- All amounts are right-aligned.
- Subtotals and the final totals stack are aligned and compact.
- Net income is the strongest total without a large card.
- Top and bottom whitespace is restrained.
- Footer is readable and does not overlap the report.
- There is no visible Nestory sample branding.

If either image fails any item, return to Task 2, add a failing semantic or
layout regression test for the defect, apply the smallest CSS fix, rerun both
generations, and repeat this inspection.

- [ ] **Step 6: Verify final repository state**

Run:

```powershell
git status --short --branch
git log -5 --oneline
```

Expected: only the intended local commits are ahead of the remote branch.
Generated `output/` and `tmp/` files remain ignored. Do not push.

## Completion Evidence

Before declaring completion, report:

- exact branch and final local commit SHA
- focused comparison-test count
- `test:all`, lint, and build outcomes
- portrait and landscape page sizes and one-page counts
- extracted-text equality and reconciliation results
- the two rasterized pages visually inspected
- clickable local paths to both final PDFs
- that the authenticated production PDF endpoint intentionally remains
  unchanged pending the user's orientation choice
