import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildTrustedReportXlsx } from "@/features/reports/data/excel";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report Excel export", () => {
  it("builds a real XLSX workbook with report metadata, rows, and totals", () => {
    const body = buildTrustedReportXlsx(reportFixture());
    const files = unzipSync(body);

    expect(Array.from(body.slice(0, 2))).toEqual([80, 75]);
    expect(Object.keys(files).toSorted()).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/app.xml",
        "docProps/core.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
      ]),
    );

    const worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain("Monthly Unit Profit &amp; Loss");
    expect(worksheet).toContain("P1 - Property One");
    expect(worksheet).toContain("USD 380.00");
    expect(worksheet).toContain("Net income");
    expect(worksheet).toContain("ledger:Rent receipt");
    expect(worksheet).toContain("receipt-allocation-1");
    expect(worksheet).toContain("/rent-income?receiptId=receipt-1");
  });

  it("writes formula-looking values as inline text instead of formulas", () => {
    const report = reportFixture();
    report.rows[0]!.cells.netIncome = "=HYPERLINK(\"bad\")";
    report.rows[0]!.title = "+unsafe";

    const worksheet = strFromU8(
      unzipSync(buildTrustedReportXlsx(report))[
        "xl/worksheets/sheet1.xml"
      ]!,
    );

    expect(worksheet).not.toContain("<f");
    expect(worksheet).toContain(
      "=HYPERLINK(&quot;bad&quot;)",
    );
  });
});

function reportFixture(): TrustedReport {
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
    rows: [
      {
        cells: {
          expenses: "USD 120.00",
          income: "USD 500.00",
          netIncome: "USD 380.00",
          property: "P1 - Property One",
          unit: "Unit A1",
        },
        id: "unit-1",
        sourceCount: 2,
        sourceLinks: [
          {
            href: "/rent-income?receiptId=receipt-1",
            id: "receipt-allocation-1",
            label: "Rent receipt",
            recordType: "ledger",
          },
        ],
        sourceSummary: "1 source row",
        title: "P1 / Unit A1",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Income less expenses",
        label: "Net income",
        sourceCount: 2,
        value: "USD 380.00",
      },
    ],
    title: "Monthly Unit Profit & Loss",
    totalsTraceLabel: "Totals trace to 2 unit-linked ledger rows.",
  };
}
