import { describe, expect, it } from "vitest";
import { applyReportPresentation } from "./report-presentation";
import { parseReportSearchParams, getReportDateRange, buildReportQueryParams } from "./reports.filters";
import type { TrustedReport } from "./reports.types";

describe("report presentation", () => {
  const report = { kind: "transactions", columns: [{ key: "property", label: "Property" }, { key: "charges", label: "Charges", numeric: true }, { key: "received", label: "Received", numeric: true }], rows: [
    { id: "a", title: "A", cells: { property: "A" }, amounts: { charges: "0.10", received: "10.00" } },
    { id: "b", title: "B", cells: { property: "A" }, amounts: { charges: "0.20", received: "-1.00" } },
  ] } as unknown as TrustedReport;
  it("groups without mixing charges with cash and sums exact decimals", () => {
    const result = applyReportPresentation(report, parseReportSearchParams({ report: "transactions", groupBy: "property", columns: "property,received" }));
    expect(result.rows[0]).toMatchObject({ isGroup: true, amounts: { charges: "0.30", received: "9.00" } });
    expect(result.columns.map((c) => c.key)).toEqual(["property", "received"]);
    expect(result.availableColumns).toHaveLength(3);
    expect(result.totalRowCount).toBe(2);
  });
  it("does not hide all columns through an unknown selection", () => {
    expect(applyReportPresentation(report, parseReportSearchParams({ columns: "unknown" })).columns).toHaveLength(3);
  });
  it("keeps identically numbered units in different properties separate", () => {
    const units = { ...report, columns: [{ key: "unit", label: "Unit" }], rows: [
      { ...report.rows[0]!, cells: { property: "Garden", unit: "101" } },
      { ...report.rows[1]!, cells: { property: "Riverside", unit: "101" } },
    ] };
    const result = applyReportPresentation(units, parseReportSearchParams({ report: "transactions", groupBy: "unit" }));
    expect(result.rows.filter((row) => row.isGroup)).toHaveLength(2);
  });
  it("preserves legacy occupancy filters in rent report export URLs", () => {
    const query = parseReportSearchParams({ report: "rent-collections", status: "occupied" });
    expect(parseReportSearchParams(Object.fromEntries(buildReportQueryParams(query))).status).toBe("occupied");
  });
  it("never presents mixed financial types as a single amount subtotal", () => {
    const mixed = { ...report, columns: [{ key: "property", label: "Property" }, { key: "amount", label: "Amount", numeric: true }], rows: [
      { ...report.rows[0]!, cells: { property: "Garden", type: "Rent charge" }, amounts: { amount: "100.00" } },
      { ...report.rows[1]!, cells: { property: "Garden", type: "Company receipts" }, amounts: { amount: "100.00" } },
    ] };
    const result = applyReportPresentation(mixed, parseReportSearchParams({ report: "transactions", groupBy: "property" }));
    expect(result.rows[0].cells.amount).toBe("Mixed types");
    expect(result.rows[0].amounts?.amount).toBeUndefined();
  });
  it("rejects invalid and oversized date ranges", () => {
    expect(() => getReportDateRange(parseReportSearchParams({ dateFrom: "2026-02-30" }))).toThrow();
    expect(() => getReportDateRange(parseReportSearchParams({ dateFrom: "2026-03-01", dateTo: "2026-02-01" }))).toThrow();
    expect(() => getReportDateRange(parseReportSearchParams({ dateFrom: "2025-01-01", dateTo: "2026-12-31" }))).toThrow();
  });
  it("roundtrips report filters for screen and download URLs", () => {
    const query = parseReportSearchParams({ report: "transactions", dateFrom: "2026-08-01", dateTo: "2026-08-31", query: "IPS", transactionType: "management-fee", transactionStatus: "reversal", payeeId: "external", groupBy: "property", columns: "property,charges" });
    expect(parseReportSearchParams(Object.fromEntries(buildReportQueryParams(query)))).toEqual(query);
  });
});
