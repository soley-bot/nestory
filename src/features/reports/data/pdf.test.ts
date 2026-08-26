import { describe, expect, it } from "vitest";
import {
  buildOwnerStatementPdf,
  buildTrustedReportPdf,
} from "@/features/reports/data/pdf";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";
import type { TrustedReport } from "@/features/reports/reports.types";
import { isContainedPdf } from "@/lib/uploads/pdf-containment";

describe("trusted report PDF export", () => {
  it("renders Owner activity metadata and rows", () => {
    const bytes = buildTrustedReportPdf({
      organizationName: "Sokha Property Services",
      report: monthlyOwnerActivityReport(),
    });
    const pdf = Buffer.from(bytes).toString("latin1");

    expect(isContainedPdf(bytes)).toBe(true);
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
  it("renders a branded cash register with human-readable scope and no internal trace", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const presentation = {
      organizationName: "Independent Property Service",
      ownerName: "XIA YIXUAN",
      propertyLabel: "The PEAK #2807",
    };
    const first = buildOwnerStatementPdf(model, presentation);
    const second = buildOwnerStatementPdf(model, presentation);
    const text = Buffer.from(first).toString("latin1");

    expect(first).toEqual(second);
    expect(isContainedPdf(first)).toBe(true);
    expect(text).toContain("OWNER STATEMENT");
    expect(text).toContain("Independent Property Service");
    expect(text).toContain("XIA YIXUAN");
    expect(text).toContain("The PEAK #2807");
    expect(text).toContain("OS-202608-300000000000");
    expect(text).toContain("OPENING BALANCE");
    expect(text).toContain("CASH IN");
    expect(text).toContain("CASH OUT");
    expect(text).toContain("CLOSING BALANCE");
    expect(text).toContain("Cash out");
    expect(text).toContain("Cash in");
    expect(text).toContain("Balance");
    expect(text).not.toContain(model.organizationId);
    expect(text).not.toContain(model.ownerPersonId);
    expect(text).not.toContain(model.propertyId);
    expect(text).not.toContain("SOURCE TRACE");
    expect(text).toContain("Page 1 of 1");
  });

  it("embeds the uploaded company logo as an image in the statement header", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    const pdf = buildOwnerStatementPdf(model, {
      logo: {
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        height: 120,
        width: 240,
      },
      organizationName: "Independent Property Service",
      ownerName: "XIA YIXUAN",
      propertyLabel: "The PEAK #2807",
    });
    const text = Buffer.from(pdf).toString("latin1");

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Logo Do");
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
