import { describe, expect, it } from "vitest";
import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report PDF export", () => {
  it("renders generic trusted report metadata and table text", () => {
    const report: TrustedReport = {
      columns: [
        { key: "owner", label: "Owner" },
        { key: "net", label: "Net", align: "right" },
      ],
      description: "Owner statement report.",
      emptyDescription: "No owner rows.",
      emptyTitle: "No owner statement rows",
      exportFilenameBase: "owner-statement",
      generatedAt: "2026-06-15T00:00:00.000Z",
      kind: "owner-statement",
      periodLabel: "01 Jun 2026 - 30 Jun 2026",
      rows: [
        {
          cells: {
            net: "USD 380.00",
            owner: "Owner One",
          },
          href: "/properties/property-1",
          id: "property-1",
          sourceCount: 2,
          sourceLinks: [],
          sourceSummary: "2 source rows",
          title: "Property One",
        },
      ],
      scopeLabel: "All properties",
      summary: [],
      title: "Owner Statement",
      totalsTraceLabel: "Statement totals trace to 2 ledger rows.",
    };

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Nestory Test", report }),
    ).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("xref");
    expect(pdf).toContain("Owner Statement");
    expect(pdf).toContain("Property One");
    expect(pdf).toContain("USD 380.00");
  });
});
