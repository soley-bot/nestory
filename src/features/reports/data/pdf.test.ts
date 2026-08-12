import { describe, expect, it } from "vitest";
import {
  buildOwnerStatementPdf,
  buildTrustedReportPdf,
} from "@/features/reports/data/pdf";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report PDF export", () => {
  it("renders Owner activity metadata and rows", () => {
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Sokha Property Services",
        report: monthlyOwnerActivityReport(),
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
        report: monthlyOwnerActivityReport(),
      }),
    ).toString("latin1");

    expect(pdf).toContain("/Count 1");
    expect(pdf).not.toContain("SOURCE TRACE");
  });
});

describe("official owner statement PDF", () => {
  it("is byte-stable and contains numbered body, source appendix, and pages", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const first = buildOwnerStatementPdf(model);
    const second = buildOwnerStatementPdf(model);
    const text = Buffer.from(first).toString("latin1");

    expect(first).toEqual(second);
    expect(text).toContain("Official Owner Statement");
    expect(text).toContain("OS-202608-300000000000");
    expect(text).toContain("SOURCE TRACE");
    expect(text).toContain("Page 1 of 2");
    expect(text).toContain("Page 2 of 2");
  });
});

function monthlyOwnerActivityReport(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "owner", label: "Owner" },
      { align: "right", key: "netChange", label: "Net change" },
    ],
    description: "Monthly owner activity.",
    emptyDescription: "No activity.",
    emptyTitle: "No owner activity",
    exportFilenameBase: "monthly-owner-activity",
    generatedAt: "2026-08-04T00:00:00.000Z",
    kind: "monthly-owner-activity",
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
