import { describe, expect, it } from "vitest";
import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report PDF export", () => {
  it("renders Owner activity metadata and rows", () => {
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Sokha Property Services",
        report: ownerActivityReport(),
      }),
    ).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Owner activity - Sokha Property Services");
    expect(pdf).toContain("RIV / Riverside Apartments");
    expect(pdf).toContain("USD 200.00");
    expect(pdf).toContain("xref");
  });

  it("omits a source appendix when rows have no source links", () => {
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Sokha Property Services",
        report: ownerActivityReport(),
      }),
    ).toString("latin1");

    expect(pdf).toContain("/Count 1");
    expect(pdf).not.toContain("SOURCE TRACE");
  });
});

function ownerActivityReport(): TrustedReport {
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
    summary: [],
    title: "Owner activity",
    totalsTraceLabel: "Totals trace to property account entries.",
  };
}
