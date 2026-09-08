import { describe, expect, it } from "vitest";
import { prepareTrustedReportForScreen } from "@/features/reports/data/reports";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("report screen preparation", () => {
  it("limits the screen preview while preserving the complete row count", () => {
    const selected = prepareTrustedReportForScreen(reportWithRows(76));
    expect(selected.rows).toHaveLength(75);
    expect(selected.totalRowCount).toBe(76);
  });

  it("bounds Unit P&L source links without changing the source count", () => {
    const report = reportWithRows(1);
    report.kind = "unit-profit-loss";
    report.rows[0]!.sourceCount = 7;
    report.rows[0]!.sourceLinks = Array.from({ length: 7 }, (_, index) => ({
      href: `/ledger?entryId=source-${index + 1}`,
      id: `source-${index + 1}`,
      label: `Source ${index + 1}`,
      recordType: "ledger" as const,
    }));

    const selected = prepareTrustedReportForScreen(report);
    expect(selected.rows[0]?.sourceLinks).toHaveLength(5);
    expect(selected.rows[0]?.sourceCount).toBe(7);
  });

  it("keeps every Owner activity source available in row details", () => {
    const report = reportWithRows(1);
    report.rows[0]!.sourceCount = 7;
    report.rows[0]!.sourceLinks = Array.from({ length: 7 }, (_, index) => ({
      href: `/properties/property-1/account?source=${index + 1}`,
      id: `source-${index + 1}`,
      label: `Source ${index + 1}`,
      recordType: "property-account-entry" as const,
    }));

    const selected = prepareTrustedReportForScreen(report);
    expect(selected.rows[0]?.sourceLinks).toHaveLength(7);
    expect(selected.rows[0]?.sourceCount).toBe(7);
  });

  it("preserves scoped property-account links for Finance Managers", () => {
    const report = reportWithRows(1);
    const scopedHref =
      "/properties/property-1/account?activity=corrections&month=2026-08&ownerPersonId=owner-1";
    report.rows[0]!.href = scopedHref;
    report.rows[0]!.sourceLinks = [
      {
        href: scopedHref,
        id: "correction-1",
        label: "Expense reversal",
        recordType: "property-account-entry",
      },
    ];

    const selected = prepareTrustedReportForScreen(report, {
      financeSafeRecords: true,
    });

    expect(selected.rows[0]?.href).toBe(scopedHref);
    expect(selected.rows[0]?.sourceLinks[0]?.href).toBe(scopedHref);
  });
});

function reportWithRows(rowCount: number): TrustedReport {
  return {
    columns: [{ key: "property", label: "Property" }],
    description: "Owner activity",
    emptyDescription: "No rows",
    emptyTitle: "No rows",
    exportFilenameBase: "monthly-owner-activity",
    generatedAt: "2026-08-04T00:00:00.000Z",
    kind: "monthly-owner-activity",
    periodLabel: "01 Aug 2026 - 31 Aug 2026",
    rows: Array.from({ length: rowCount }, (_, index) => ({
      cells: { property: `Property ${index + 1}` },
      id: `row-${index + 1}`,
      sourceCount: 0,
      sourceLinks: [],
      sourceSummary: "",
      title: `Property ${index + 1}`,
    })),
    scopeLabel: "All properties",
    summary: [],
    title: "Owner activity",
    totalsTraceLabel: "Property account rows",
  };
}
