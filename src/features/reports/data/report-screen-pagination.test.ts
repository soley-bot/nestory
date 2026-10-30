import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { prepareTrustedReportForScreen } from "./reports";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { applyReportPresentation } from "../report-presentation";
import { parseReportSearchParams } from "../reports.filters";
import type { ReportKind, TrustedReport, UnitProfitLossLine } from "../reports.types";

describe("server report screen pagination", () => {
  it.each<ReportKind>(["transactions", "management-fees", "rent-roll", "rent-collections", "monthly-owner-activity"])("bounds %s to the requested late page without changing totals or source links", (kind) => {
    const full = reportWithRows(10_000, kind);
    const selected = prepareTrustedReportForScreen(full, { viewQuery: query({ report: kind, page: "200" }) });
    expect(selected.rows).toHaveLength(50);
    expect(selected.rows[0]?.id).toBe("row-9951");
    expect(selected.rows.at(-1)?.id).toBe("row-10000");
    expect(selected.rows.at(-1)?.sourceLinks).toEqual(full.rows.at(-1)?.sourceLinks);
    expect(selected.summary).toEqual(full.summary);
    expect(selected.totalRowCount).toBe(10_000);
    expect(selected.screenPagination).toEqual({ page: 200, pageSize: 50, totalRecords: 10_000, totalPages: 200 });
    expect(JSON.stringify(selected).length).toBeLessThan(40_000);
    expect(full.rows).toHaveLength(10_000);
  });

  it("repeats full group subtotals when a page continues a group and crosses into another", () => {
    const full = reportWithRows(10_000);
    full.rows.forEach((row, index) => { row.cells.property = index < 5_025 ? "A" : "B"; });
    const grouped = applyReportPresentation(full, query({ groupBy: "property" }));
    const selected = prepareTrustedReportForScreen(grouped, { viewQuery: query({ page: "101" }) });
    expect(selected.rows.filter(row => !row.isGroup)).toHaveLength(50);
    expect(selected.rows.filter(row => row.isGroup).map(row => row.cells.amount)).toEqual(["USD 5025.00", "USD 4975.00"]);
    expect(selected.rows[0]?.isGroup).toBe(true);
    expect(selected.rows[1]?.id).toBe("row-5001");
    expect(selected.rows.at(-1)?.id).toBe("row-5050");
    expect(selected.totalRowCount).toBe(10_000);
    expect(selected.summary).toEqual(full.summary);
  });

  it("filters all Unit P&L scopes before paging, keeps zero-activity counts, and clamps stale pages", () => {
    const full = reportWithRows(10_000, "unit-profit-loss");
    full.rows.forEach((row, index) => {
      row.cells.unit = `Unit ${index + 1}`;
      row.cells.income = index % 2 === 0 ? "USD 0.00" : "-USD 1.00";
      row.cells.expenses = "USD 0.00";
      row.cells.netIncome = row.cells.income;
    });
    const selected = prepareTrustedReportForScreen(full, { viewQuery: query({ report: full.kind, page: "200" }) });
    expect(selected.rows).toHaveLength(25);
    expect(selected.rows.at(-1)?.id).toBe("row-10000");
    expect(selected.screenPagination?.totalRecords).toBe(5_000);
    expect(selected.zeroActivityRowCount).toBe(5_000);
    const empty = prepareTrustedReportForScreen(full, { viewQuery: query({ report: full.kind, scopeQuery: "Property 9999", page: "999" }) });
    expect(empty.rows).toHaveLength(0);
    expect(empty.screenPagination).toMatchObject({ page: 1, totalRecords: 0 });
    const zero = prepareTrustedReportForScreen(full, { viewQuery: query({ report: full.kind, scopeQuery: "Property 9999", showZeroActivity: "1", page: "999" }) });
    expect(zero.rows.map(row => row.id)).toEqual(["row-9999"]);
    expect(zero.screenPagination).toMatchObject({ page: 1, totalRecords: 1 });
    expect(zero.summary).toEqual(full.summary);
  });

  it("pages the detailed P&L while retaining exact category totals and complete PDF/XLSX exports", () => {
    const full = reportWithRows(1, "unit-profit-loss");
    full.unitProfitLossLines = Array.from({ length: 10_000 }, (_, index): UnitProfitLossLine => ({
      id: `line-${index + 1}`, amountCents: BigInt(index % 10 === 0 ? -100 : 200),
      category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-10-01",
      description: `Synthetic repair ${index + 1}`, direction: "expense", property: "Property 1", propertyId: "property-1", unit: `Unit ${index + 1}`, unitId: `unit-${index + 1}`, reportingGroup: "expenses",
      sourceHref: `/bills-expenses?sourceId=source-${index + 1}`,
    }));
    const selected = prepareTrustedReportForScreen(full, { viewQuery: query({ report: full.kind, detailPage: "400" }) });
    expect(selected.unitProfitLossLines).toHaveLength(25);
    expect(selected.unitProfitLossLines?.at(-1)?.id).toBe("line-10000");
    expect(selected.unitProfitLossScreen?.pagination).toMatchObject({ page: 400, totalRecords: 10_000, totalPages: 400 });
    expect(selected.unitProfitLossScreen?.totals).toEqual({ income: BigInt(0), expenses: BigInt(1_700_000) });
    expect(selected.unitProfitLossScreen?.groups).toEqual([expect.objectContaining({ total: BigInt(1_700_000), count: 10_000 })]);
    expect(full.unitProfitLossLines).toHaveLength(10_000);
    const searched = prepareTrustedReportForScreen(full, { viewQuery: query({ report: full.kind, scopeQuery: "Unit 9999", detailPage: "400" }) });
    expect(searched.unitProfitLossLines?.map(line => line.id)).toEqual(["line-9999"]);
    expect(searched.unitProfitLossScreen?.pagination).toMatchObject({ page: 1, totalRecords: 1 });
    expect(searched.unitProfitLossScreen?.totals).toEqual(selected.unitProfitLossScreen?.totals);
    expect(() => buildTrustedReportXlsx(searched)).toThrow("paged report cannot be exported");
    const sheet = strFromU8(unzipSync(buildTrustedReportXlsx(full))["xl/worksheets/sheet1.xml"]!);
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "Synthetic", report: full })).toString("latin1");
    for (const text of [sheet, pdf]) {
      expect(text).toContain("Synthetic repair 1");
      expect(text).toContain("Synthetic repair 10000");
    }
    expect(sheet).toContain("<v>17000.00</v>");
    expect(pdf).toContain("USD 17,000.00");
  }, 30_000);

  it("is idempotent when the route sanitizes an already paged Finance Manager report", () => {
    const page = prepareTrustedReportForScreen(reportWithRows(10_000), { viewQuery: query({ page: "200" }) });
    const safe = prepareTrustedReportForScreen(page, { financeSafeRecords: true });
    expect(safe.rows.map(row => row.id)).toEqual(page.rows.map(row => row.id));
    expect(safe.screenPagination).toEqual(page.screenPagination);
    expect(safe.totalRowCount).toBe(10_000);
  });

  it("rejects exporting a screen page in place of a complete report", () => {
    const selected = prepareTrustedReportForScreen(reportWithRows(10_000));
    expect(() => buildTrustedReportXlsx(selected)).toThrow("paged report cannot be exported");
    expect(() => buildTrustedReportPdf({ organizationName: "Synthetic", report: selected })).toThrow("paged report cannot be exported");
  });
});

function query(values: Record<string, string> = {}) {
  return parseReportSearchParams({ month: "2026-10", report: "transactions", ...values });
}

function reportWithRows(count: number, kind: ReportKind = "transactions"): TrustedReport {
  return {
    kind, title: "Synthetic report", description: "Synthetic", emptyTitle: "No rows", emptyDescription: "No rows",
    exportFilenameBase: "synthetic-report", generatedAt: "2026-10-01T00:00:00Z", periodLabel: "October 2026", scopeLabel: "All properties", totalsTraceLabel: `${count} synthetic records`,
    columns: [{ key: "property", label: "Property" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", numeric: true }],
    summary: [{ label: "Total", value: `USD ${count}.00`, detail: "All records", sourceCount: count }],
    rows: Array.from({ length: count }, (_, index) => ({ id: `row-${index + 1}`, title: `Record ${index + 1}`, cells: { property: `Property ${index + 1}`, description: `Record ${index + 1}`, amount: "USD 1.00" }, amounts: { amount: "1.00" }, sourceCount: 1, sourceLinks: [{ id: `source-${index + 1}`, label: `Source ${index + 1}`, href: `/ledger?entryId=${index + 1}`, recordType: "ledger" }], sourceSummary: "1 source" })),
  };
}
