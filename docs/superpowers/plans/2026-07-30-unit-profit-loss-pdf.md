# Unit Profit And Loss PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic landscape Monthly Unit Profit & Loss PDF with a clean portrait A4 statement that shows dated unit-linked income and expense lines, section subtotals, and authoritative net income.

**Architecture:** Keep the authenticated report loader, aggregate Reports screen, endpoint, and Excel export unchanged. Add one optional structured ledger-detail field to `TrustedReport`, populate it only in the existing unit-profit-loss builder, and route only that report kind to a dedicated portrait PDF renderer. Reuse the low-level PDF drawing primitives while making the document writer accept an explicit page size so every existing export remains landscape.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, Vitest, the existing zero-dependency PDF command writer, Playwright/browser verification, Poppler `pdfinfo` and `pdftoppm`, and `pypdf`.

## Global Constraints

- Follow `PROJECT_RULES.md`, `docs/engineering-rules.md`, `docs/verification.md`, and the approved design in `docs/superpowers/specs/2026-07-30-unit-profit-loss-pdf-design.md`.
- Work only in `D:\nestory-report-import-simplification` on `codex/report-import-simplification`.
- Use test-driven development: write each failing assertion, run it and confirm the expected failure, then add the smallest implementation.
- Keep `ledger_entries` as the only financial detail authority. Never infer unit ownership for property-level rows.
- Preserve the existing Reports screen, aggregate rows, endpoint authentication, Excel export, Owner Statement PDF, Management Fee Statement PDF, and generic landscape PDFs.
- Do not copy OpenAI branding, payment language, invoice identifiers, tax language, or company details.
- Do not push, merge, deploy, upload to Drive, or alter Supabase data in this slice.
- Use `apply_patch` for source edits and keep each implementation commit narrowly scoped.

---

## Task 1: Expose Dated Unit Ledger Lines In The Report Contract

**Files:**

- Modify: `src/features/reports/reports.types.ts`
- Modify: `src/features/reports/data/trusted-report.ts`
- Test: `src/features/reports/data/trusted-report.test.ts`

- [ ] **Step 1: Add the failing detail-line assertion**

Extend the existing `"shows income, expenses, and net income by unit without report clutter"` test with the exact dated lines:

```ts
expect(report.unitProfitLossLines).toEqual([
  {
    amount: 500,
    category: "Rent",
    currency: "USD",
    date: "2026-07-05",
    description: "July rent",
    direction: "income",
    id: "ledger-income",
    property: "P1 - Property One",
    unit: "Unit A1",
  },
  {
    amount: 120,
    category: "Repair",
    currency: "USD",
    date: "2026-07-10",
    description: "Repair",
    direction: "expense",
    id: "ledger-expense",
    property: "P1 - Property One",
    unit: "Unit A1",
  },
]);
```

Extend `"does not silently assign property-level ledger rows to a unit"` with:

```ts
expect(report.unitProfitLossLines?.map(({ id }) => id)).not.toContain(
  "ledger-unassigned",
);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npx vitest run src/features/reports/data/trusted-report.test.ts
```

Expected: the new assertion fails because `unitProfitLossLines` is `undefined`.

- [ ] **Step 3: Add the narrow report-data type**

In `src/features/reports/reports.types.ts`, add:

```ts
export type UnitProfitLossLine = {
  amount: number;
  category: string;
  currency: CurrencyCode;
  date: string;
  description: string;
  direction: "expense" | "income";
  id: string;
  property: string;
  unit: string;
};
```

Then add the optional field to `TrustedReport`:

```ts
unitProfitLossLines?: UnitProfitLossLine[];
```

The field is optional so every other report builder and test fixture remains unchanged.

- [ ] **Step 4: Build the lines from the already-filtered unit ledger**

Import `UnitProfitLossLine` as a type in `trusted-report.ts`. Immediately after `unitLinkedLedger`, create the detail list:

```ts
const unitProfitLossLines = unitLinkedLedger
  .map<UnitProfitLossLine>((entry) => {
    const unit = entry.unit_id
      ? context.unitsById.get(entry.unit_id)
      : undefined;
    const category = normalizeCategory(entry.category);

    return {
      amount: Math.abs(entry.amount),
      category,
      currency: entry.currency,
      date: entry.transaction_date,
      description: entry.description?.trim() || category,
      direction: isExpense(entry) ? "expense" : "income",
      id: entry.id,
      property: propertyLabel(context.propertiesById.get(entry.property_id)),
      unit: unit ? unitLabel(unit) : "Unknown unit",
    };
  })
  .toSorted(
    (first, second) =>
      compareStrings(first.date, second.date) ||
      compareStrings(first.category, second.category) ||
      compareStrings(first.id, second.id),
  );
```

Pass `unitProfitLossLines` into the object given to `baseReport`. Do not add receipts, payments, obligations, maintenance records, timeline events, or property-level ledger rows.

- [ ] **Step 5: Prove line totals agree with the report summary**

Add assertions that reduce income and expense line magnitudes and compare them to the existing fixture totals:

```ts
const lines = report.unitProfitLossLines ?? [];
expect(
  lines
    .filter(({ direction }) => direction === "income")
    .reduce((total, line) => total + line.amount, 0),
).toBe(500);
expect(
  lines
    .filter(({ direction }) => direction === "expense")
    .reduce((total, line) => total + line.amount, 0),
).toBe(120);
```

- [ ] **Step 6: Run the focused test and confirm GREEN**

Run:

```powershell
npx vitest run src/features/reports/data/trusted-report.test.ts
```

Expected: all Monthly Unit Profit & Loss data tests pass.

- [ ] **Step 7: Commit the report contract**

```powershell
git add src/features/reports/reports.types.ts src/features/reports/data/trusted-report.ts src/features/reports/data/trusted-report.test.ts
git commit -m "feat: expose dated unit profit and loss lines"
```

---

## Task 2: Render The Approved Portrait Statement

**Files:**

- Modify: `src/features/reports/data/pdf.ts`
- Modify: `src/features/reports/data/pdf.test.ts`

- [ ] **Step 1: Add a dedicated unit-statement fixture**

Add a `unitProfitLossReport()` helper in `pdf.test.ts` whose significant fields are:

```ts
function unitProfitLossReport(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "unit", label: "Unit" },
      { align: "right", key: "income", label: "Income" },
      { align: "right", key: "expenses", label: "Expenses" },
      { align: "right", key: "netIncome", label: "Net income" },
    ],
    description: "Income, expenses, and net income by unit.",
    emptyDescription: "No rows.",
    emptyTitle: "No unit rows",
    exportFilenameBase: "unit-profit-loss",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "unit-profit-loss",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [],
    scopeLabel: "P1 - Property One / Unit A1",
    summary: [
      {
        detail: "Income from unit-linked ledger rows",
        label: "Income",
        sourceCount: 1,
        value: "USD 500.00",
      },
      {
        detail: "Expenses from unit-linked ledger rows",
        label: "Expenses",
        sourceCount: 1,
        value: "USD 120.00",
      },
      {
        detail: "Income less expenses",
        label: "Net income",
        sourceCount: 2,
        value: "USD 380.00",
      },
    ],
    title: "Monthly Unit Profit & Loss",
    totalsTraceLabel: "Totals trace to 2 unit-linked ledger rows.",
    unitProfitLossLines: [
      {
        amount: 500,
        category: "Rent",
        currency: "USD",
        date: "2026-07-05",
        description: "July rent",
        direction: "income",
        id: "ledger-income",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      {
        amount: 120,
        category: "Repair",
        currency: "USD",
        date: "2026-07-10",
        description: "Kitchen sink repair",
        direction: "expense",
        id: "ledger-expense",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
    ],
  };
}
```

- [ ] **Step 2: Add the failing portrait and hierarchy test**

Add:

```ts
it("renders unit profit and loss as a portrait dated financial statement", () => {
  const pdf = Buffer.from(
    buildTrustedReportPdf({
      organizationName: "Demo Org",
      report: unitProfitLossReport(),
    }),
  ).toString("latin1");
  const renderedText = extractPdfCommandText(pdf);

  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/MediaBox [0 0 595 842]");
  for (const label of [
    "Monthly Unit Profit & Loss",
    "P1 - Property One / Unit A1",
    "Cash basis",
    "INCOME",
    "05 Jul 2026",
    "Income subtotal",
    "EXPENSES",
    "10 Jul 2026",
    "Expenses subtotal",
    "Total income",
    "Total expenses",
    "Net income",
    "USD 380.00",
  ]) {
    expect(renderedText).toContain(label);
  }
  expect(renderedText).not.toContain("REPORT PURPOSE");
  expect(renderedText).not.toContain("Source rows");
  expect(renderedText).not.toContain("TRACEABLE OPERATING REPORT");
});
```

- [ ] **Step 3: Run the PDF test and confirm RED**

Run:

```powershell
npx vitest run src/features/reports/data/pdf.test.ts
```

Expected: the unit report still uses `/MediaBox [0 0 842 595]` and lacks the dated Income and Expenses statement structure.

- [ ] **Step 4: Make the shared writer page-size aware without changing defaults**

Add:

```ts
type PdfPageSize = {
  height: number;
  width: number;
};

const landscapePageSize: PdfPageSize = {
  height: pageHeight,
  width: pageWidth,
};
const portraitA4PageSize: PdfPageSize = {
  height: 842,
  width: 595,
};
```

Change only the writer signature and media box:

```ts
function createPdfDocument(
  pageContents: string[],
  pageSize: PdfPageSize = landscapePageSize,
) {
  // Existing object and xref construction stays unchanged.
  objects[pageObjectId] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
}
```

All existing calls must continue omitting the second argument.

- [ ] **Step 5: Route only unit-profit-loss to a dedicated renderer**

Place this before the existing `income-expense` branch:

```ts
if (report.kind === "unit-profit-loss") {
  return buildUnitProfitLossStatementPdf({ organizationName, report });
}
```

The new renderer returns:

```ts
return createPdfDocument(pageCommands, portraitA4PageSize);
```

- [ ] **Step 6: Implement the portrait visual system**

Import `formatDate` from `@/lib/dates/format` and `formatMoney` from `@/lib/money/format`.

Use a 36-point margin and a 523-point content width with these exact columns:

```ts
const unitStatementColumns: PdfColumn[] = [
  { label: "Date", maxLines: 1, width: 76 },
  { label: "Description", maxLines: 2, width: 259 },
  { label: "Category", maxLines: 1, width: 105 },
  { align: "right", label: "Amount", maxLines: 1, width: 83 },
];
```

Split `report.unitProfitLossLines ?? []` into income and expense groups. Render:

1. `Nestory` and the organization name.
2. `Monthly Unit Profit & Loss`.
3. `report.scopeLabel`, `report.periodLabel`, generated date, and `Cash basis`.
4. A prominent `Net income` value read from `report.summary`.
5. `INCOME`, its dated rows, and `Income subtotal`.
6. `EXPENSES`, its dated rows, and `Expenses subtotal`.
7. A compact right-aligned stack using the authoritative summary values:

```ts
const incomeTotal =
  report.summary.find(({ label }) => label === "Income")?.value ?? "USD 0.00";
const expenseTotal =
  report.summary.find(({ label }) => label === "Expenses")?.value ?? "USD 0.00";
const netIncome =
  report.summary.find(({ label }) => label === "Net income")?.value ?? "USD 0.00";
```

Format detail amounts as positive magnitudes:

```ts
formatMoney(Math.abs(line.amount), line.currency)
```

Format transaction dates with:

```ts
formatDate(line.date)
```

Do not call `drawTrustedReportHeader`, `drawReportDescription`, `drawSummaryCards`, or the generic `drawFooter` from this renderer. Add a narrow unit-statement footer containing only `Nestory unit financial statement` and `Page X of Y`.

- [ ] **Step 7: Run the PDF test and confirm GREEN**

Run:

```powershell
npx vitest run src/features/reports/data/pdf.test.ts
```

Expected: the dedicated statement test passes and every pre-existing PDF test remains green.

- [ ] **Step 8: Commit the portrait renderer**

```powershell
git add src/features/reports/data/pdf.ts src/features/reports/data/pdf.test.ts
git commit -m "feat: redesign unit profit and loss PDF"
```

---

## Task 3: Make Pagination And Empty Sections Reliable

**Files:**

- Modify: `src/features/reports/data/pdf.ts`
- Modify: `src/features/reports/data/pdf.test.ts`

- [ ] **Step 1: Add failing empty-section coverage**

Create variants from `unitProfitLossReport()` with no income lines and no expense lines. Assert:

```ts
expect(extractPdfCommandText(noIncomePdf)).toContain("No income recorded");
expect(extractPdfCommandText(noIncomePdf)).toContain("Income subtotal");
expect(extractPdfCommandText(noIncomePdf)).toContain("USD 0.00");
expect(extractPdfCommandText(noExpensePdf)).toContain("No expenses recorded");
expect(extractPdfCommandText(noExpensePdf)).toContain("Expenses subtotal");
```

Update each fixture's summary totals so the final totals remain authoritative.

- [ ] **Step 2: Add failing continuation-page coverage**

Generate 48 stable lines with long descriptions:

```ts
const report = unitProfitLossReport();
report.unitProfitLossLines = Array.from({ length: 48 }, (_, index) => ({
  amount: index + 1,
  category: index % 2 === 0 ? "Rent" : "Repair",
  currency: "USD" as const,
  date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
  description:
    `Ledger detail ${index + 1} ` +
    "with enough context to wrap cleanly without overlapping the next row",
  direction: index < 24 ? ("income" as const) : ("expense" as const),
  id: `ledger-${String(index + 1).padStart(2, "0")}`,
  property: "P1 - Property One",
  unit: "Unit A1",
}));
```

Assert that:

```ts
expect(pdf).toMatch(/\/Count [2-9]/);
expect(renderedText.split("Monthly Unit Profit & Loss").length - 1).toBeGreaterThan(1);
expect(renderedText.split("Description").length - 1).toBeGreaterThan(1);
expect(renderedText).toContain("Income (continued)");
expect(renderedText).toContain("Expenses subtotal");
expect(renderedText).toContain("Page 2 of");
```

Add one extra-long description assertion that the rendered command text contains `...`, proving the two-line cap is applied.

- [ ] **Step 3: Run the PDF test and confirm RED**

Run:

```powershell
npx vitest run src/features/reports/data/pdf.test.ts
```

Expected: empty labels, continuation headings, repeated headers, or multipage output are absent until the paginator is implemented.

- [ ] **Step 4: Implement group-aware flow rows**

Represent the renderer's content as explicit blocks:

```ts
type UnitStatementFlowRow =
  | { height: number; kind: "section"; label: "EXPENSES" | "INCOME" }
  | { height: number; kind: "entry"; line: UnitProfitLossLine }
  | { height: number; kind: "empty"; label: string }
  | {
      height: number;
      kind: "subtotal";
      label: "Expenses subtotal" | "Income subtotal";
      value: string;
    }
  | {
      expenseTotal: string;
      height: number;
      incomeTotal: string;
      kind: "totals";
      netIncome: string;
    };
```

Use these layout measurements:

```ts
const unitStatementFirstContentTop = 552;
const unitStatementContinuationContentTop = 704;
const unitStatementContentBottom = 58;
const unitStatementSectionHeight = 26;
const unitStatementEmptyHeight = 30;
const unitStatementSubtotalHeight = 28;
const unitStatementTotalsHeight = 82;
```

Compute each entry height from its wrapped description:

```ts
const descriptionLines = wrapText(line.description, 249, 8.6, 2);
const height = Math.max(28, descriptionLines.length * 11 + 12);
```

- [ ] **Step 5: Implement pagination invariants**

In `paginateUnitStatementRows`:

- use the smaller first-page capacity and the larger continuation-page capacity;
- before adding a section, require enough room for the section heading and its first entry or empty row;
- track the active section and add `Income (continued)` or `Expenses (continued)` after a page break inside a section;
- render the table column labels in every page header;
- move a subtotal to the next page when it does not fit;
- treat the three final totals as one 82-point block so they never split;
- preserve the existing date/category/id input order rather than re-sorting inside the PDF layer.

Return a structure that gives `renderUnitProfitLossPage` both the page rows and whether it is the first page:

```ts
type UnitStatementPage = {
  firstPage: boolean;
  rows: UnitStatementFlowRow[];
};
```

- [ ] **Step 6: Render empty, continuation, subtotal, and totals blocks**

Use the existing `drawText`, `drawRect`, `drawLine`, and `wrapText` primitives. Keep rules neutral, use no metric cards, and ensure:

- section labels are visually distinct but restrained;
- dates and categories never wrap;
- descriptions render at most two lines;
- amounts and all totals are right-aligned;
- Net income is the strongest value;
- every page repeats title, scope, period, column labels, and the unit-statement footer.

- [ ] **Step 7: Run the focused PDF suite and confirm GREEN**

Run:

```powershell
npx vitest run src/features/reports/data/pdf.test.ts
```

Expected: portrait, grouping, empty-section, long-description, and continuation-page tests all pass.

- [ ] **Step 8: Commit pagination hardening**

```powershell
git add src/features/reports/data/pdf.ts src/features/reports/data/pdf.test.ts
git commit -m "test: harden unit statement pagination"
```

---

## Task 4: Run Regression Checks And Inspect A Real Unit 09A Export

**Files:**

- Verify: `src/features/reports/data/trusted-report.test.ts`
- Verify: `src/features/reports/data/pdf.test.ts`
- Verify: `src/app/api/reports/report-routes.test.ts`
- Generate: `output/pdf/Nestory-Unit-09A-Profit-Loss-July-2026.pdf`
- Generate temporarily: `tmp/unit-profit-loss-pages/*.png`

- [ ] **Step 1: Run the focused report and route regression suites**

```powershell
npx vitest run src/features/reports/data/trusted-report.test.ts src/features/reports/data/pdf.test.ts src/app/api/reports/report-routes.test.ts
```

Expected: all tests pass, including unchanged authentication and route behavior.

- [ ] **Step 2: Run static and full-project checks**

```powershell
npm run lint -- src/features/reports/reports.types.ts src/features/reports/data/trusted-report.ts src/features/reports/data/pdf.ts src/features/reports/data/trusted-report.test.ts src/features/reports/data/pdf.test.ts
npm run test
npm run build
git diff --check
```

Expected: every command exits successfully. Do not claim production verification from these checks.

- [ ] **Step 3: Start an isolated authenticated local runtime**

Start the worktree on port 3017 using its existing `.env.local`:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3017
```

Use the seeded administrator account already configured for the local Nestory environment. Do not print credentials.

- [ ] **Step 4: Export the exact Unit 09A July 2026 statement**

Open:

```text
http://127.0.0.1:3017/reports?report=unit-profit-loss&month=2026-07&propertyId=10000000-0000-0000-0000-000000000001&unitId=20000000-0000-0000-0000-000000000001
```

Confirm the authenticated screen identifies Central Residence / Unit 09A, then use the PDF export action. Save the response as:

```text
output/pdf/Nestory-Unit-09A-Profit-Loss-July-2026.pdf
```

Confirm the browser console has zero errors during the export flow.

- [ ] **Step 5: Verify the media box and page count**

```powershell
& 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdfinfo.exe' 'output\pdf\Nestory-Unit-09A-Profit-Loss-July-2026.pdf'
```

Expected: `Page size: 595 x 842 pts (A4)` or the equivalent portrait A4 dimensions.

- [ ] **Step 6: Extract and verify authoritative text**

Run `pypdf` with the managed runtime:

```powershell
@'
from pathlib import Path
from pypdf import PdfReader

path = Path(r"output/pdf/Nestory-Unit-09A-Profit-Loss-July-2026.pdf")
text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
required = [
    "Monthly Unit Profit & Loss",
    "Unit 09A",
    "01 Jul 2026 - 31 Jul 2026",
    "INCOME",
    "EXPENSES",
    "Income subtotal",
    "Expenses subtotal",
    "Net income",
]
missing = [value for value in required if value not in text]
if missing:
    raise SystemExit(f"Missing PDF text: {missing}")
print(text)
'@ | & 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -
```

Also verify that the extracted July rent and repair lines show their actual ledger transaction dates. If the local dataset differs from the approved Unit 09A fixture, report the observed ledger rows rather than fabricating values.

- [ ] **Step 7: Rasterize and inspect every page**

Create the exact temporary output directory, then render all pages:

```powershell
New-Item -ItemType Directory -Force -Path 'tmp\unit-profit-loss-pages' | Out-Null
& 'C:\Users\USer\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe' -png -r 150 'output\pdf\Nestory-Unit-09A-Profit-Loss-July-2026.pdf' 'tmp\unit-profit-loss-pages\page'
Get-ChildItem -LiteralPath 'tmp\unit-profit-loss-pages' -Filter '*.png' | Sort-Object Name
```

Open every PNG with the image viewer and inspect:

- portrait orientation;
- clean organization/title/scope/date hierarchy;
- clear Income and Expenses grouping;
- correct transaction dates;
- aligned subtotals and final totals;
- no clipped or overlapping descriptions;
- readable footer and page number;
- no report-purpose block, source cards, trace label, invoice language, or OpenAI branding.

- [ ] **Step 8: Clean only generated browser and raster artifacts**

Stop the temporary dev server and close the browser session. Preview cleanup before removing generated directories:

```powershell
git clean -nd -- .playwright-cli tmp/unit-profit-loss-pages
git clean -fd -- .playwright-cli tmp/unit-profit-loss-pages
```

Keep the final PDF under `output/pdf/`.

- [ ] **Step 9: Verify final repository state**

```powershell
git status --short --branch
git log -4 --oneline
```

Expected: only the intended local commits are ahead of the remote branch; no unrelated user files are modified. Do not push.

## Completion Evidence

Before declaring completion, report:

- focused test counts and full test/build results;
- exact local branch and final commit SHA;
- the portrait A4 `pdfinfo` result;
- extracted text evidence for Unit 09A, period, both groups, dates, subtotals, and net income;
- the number of rasterized pages visually inspected;
- the clickable local path to the final PDF;
- any verification boundary that remains unproven.
