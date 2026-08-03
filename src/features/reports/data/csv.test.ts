import { describe, expect, it } from "vitest";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report CSV export", () => {
  it("exports report rows, source links, and totals", () => {
    const csv = buildTrustedReportCsv(report());
    expect(csv).toContain("Report,Owner activity");
    expect(csv).toContain("Property,Owner,Net change");
    expect(csv).toContain("RIV / Riverside Apartments,Maly Chen,USD 200.00");
    expect(csv).toContain("Metric,Value,Detail,Source count");
  });

  it("keeps spreadsheet formulas inert", () => {
    const value = report();
    value.rows[0]!.title = "=unsafe title";
    value.rows[0]!.cells.owner = "+unsafe owner";

    const csv = buildTrustedReportCsv(value);
    expect(csv).toContain("'=unsafe title");
    expect(csv).toContain("'+unsafe owner");
  });
});

function report(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "owner", label: "Owner" },
      { align: "right", key: "netChange", label: "Net change" },
    ],
    description: "Monthly owner activity.",
    emptyDescription: "No activity.",
    emptyTitle: "No owner activity",
    exportFilenameBase: "owner-activity",
    generatedAt: "2026-08-04T00:00:00.000Z",
    kind: "owner-activity",
    periodLabel: "01 Aug 2026 - 31 Aug 2026",
    rows: [
      {
        cells: {
          netChange: "USD 200.00",
          owner: "Maly Chen",
          property: "RIV / Riverside Apartments",
        },
        id: "property-1",
        sourceCount: 4,
        sourceLinks: [],
        sourceSummary: "4 account entries",
        title: "RIV / Riverside Apartments",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Rent income",
        label: "Rent",
        sourceCount: 1,
        value: "USD 800.00",
      },
    ],
    title: "Owner activity",
    totalsTraceLabel: "Totals trace to property account entries.",
  };
}
