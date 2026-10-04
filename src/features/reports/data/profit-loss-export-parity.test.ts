import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ProfitLossDetail } from "../components/profit-loss-detail";
import type { TrustedReport, UnitProfitLossLine } from "../reports.types";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { formatProfitLossAmount, profitLossSummaryRows } from "./profit-loss-funding";

const line = (id: string, direction: "income" | "expense", cents: bigint): UnitProfitLossLine => ({
  id, direction, amountCents: cents, category: direction === "income" ? "Rent" : "Maintenance",
  categoryCode: direction === "income" ? "rent" : "repairs_maintenance", categoryId: null,
  reportingGroup: direction === "income" ? "rent" : "maintenance", currency: "USD", date: "2026-09-01",
  description: "Synthetic recognized transaction", property: "Synthetic property", unit: "Synthetic unit",
});
function fixture(): TrustedReport {
  return { kind: "unit-profit-loss", title: "Profit and loss", description: "Synthetic Accrual report",
    emptyDescription: "No transactions", emptyTitle: "No transactions", exportFilenameBase: "synthetic-profit-loss",
    generatedAt: "2026-10-03T00:00:00Z", periodLabel: "01 Sep 2026 - 30 Sep 2026", scopeLabel: "Synthetic property",
    columns: [], rows: [], totalsTraceLabel: "Synthetic source", summary: [
      { label: "Income", value: "USD 999.99", detail: "Deliberately stale synthetic summary", sourceCount: 2 },
      { label: "Expenses", value: "USD 888.88", detail: "Deliberately stale synthetic summary", sourceCount: 2 },
      { label: "Net income", value: "USD 111.11", detail: "Deliberately stale synthetic summary", sourceCount: 4 },
    ], unitProfitLossLines: [line("rent", "income", BigInt(10003)), line("partial-rent", "income", BigInt(7)),
      line("cost", "expense", BigInt(12003)), line("cost-correction", "expense", BigInt(-2))],
    unitProfitLossFunding: { contributionCents: BigInt(50001), remainingBalanceCents: null,
      unavailableReason: "Some activity has no unit assignment." } };
}

describe("current Accrual P&L UI/PDF/Excel parity (synthetic report, not DB acceptance)", () => {
  it("derives every profit total from exact detail cents and keeps funding outside profit", () => {
    const report = fixture();
    const rows = profitLossSummaryRows(report.unitProfitLossLines!, report.unitProfitLossFunding);
    expect(rows.map(row => row.amountCents)).toEqual([BigInt(10010), BigInt(12001), BigInt(-1991), BigInt(50001), null]);
    const html = renderToStaticMarkup(createElement(ProfitLossDetail, { lines: report.unitProfitLossLines!, funding: report.unitProfitLossFunding }));
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic company", report })).toString("latin1");
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(report))["xl/worksheets/sheet1.xml"]!);
    for (const [index, row] of rows.entries()) {
      if (index >= 2) expect(html).toContain(row.label);
      expect(html).toContain(formatProfitLossAmount(row.amountCents));
      if (index >= 2) expect(pdf).toContain(row.label);
      expect(pdf).toContain(formatProfitLossAmount(row.amountCents));
      if (index >= 2) expect(sheet).toContain(row.label);
    }
    for (const value of ["100.10", "120.01", "-19.91", "500.01"]) expect(sheet).toContain(`<v>${value}</v>`);
    expect(sheet).toContain(">Unavailable</t>");
    for (const presentation of [html, pdf, sheet]) for (const stale of ["999.99", "888.88", "111.11"]) expect(presentation).not.toContain(stale);
    expect(pdf).toContain("Accrual basis");
    expect(sheet).toContain("Accrual basis");
  });
});
