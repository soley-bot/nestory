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
  it("keeps wide report columns readable across repeated record panels", () => {
    const report = monthlyOwnerActivityReport();
    report.kind = "transactions";
    report.columns = Array.from({ length: 11 }, (_, index) => ({ key: `field${index}`, label: `Field ${index}` }));
    report.rows = [{ ...report.rows[0]!, title: "Receipt A", sourceLinks: [], cells: Object.fromEntries(report.columns.map((column, index) => [column.key, `value${index}`])) }];
    const bytes = buildTrustedReportPdf({ organizationName: "Nestory", report });
    expect(isContainedPdf(bytes)).toBe(true);
    const pdf = Buffer.from(bytes).toString("latin1");
    expect(pdf).toContain("columns 1-5");
    expect(pdf).toContain("columns 11-11");
    expect(pdf).toContain("value10");
  });
  it("separates wrapped metadata, purpose, metrics and source trace on every page", () => {
    const report = monthlyOwnerActivityReport();
    report.periodLabel = "01 October 2026 through 31 October 2026 (business date, inclusive)";
    report.description = "Purpose text " + "explaining charges and receipts for the selected reporting period. ".repeat(4);
    report.totalsTraceLabel = "Trace evidence " + "links each total to the scoped invoice and receipt records. ".repeat(4);
    report.summary = [{ label: "Total charges", value: "USD 850.00", detail: "Charges", sourceCount: 1 }];
    report.rows[0]!.sourceLinks = [{ id: "invoice-1", label: "Invoice 1", recordType: "income-obligation", href: "/rent-income?invoiceId=invoice-1" }];
    const pdf = Buffer.from(buildTrustedReportPdf({ organizationName: "Nestory", report })).toString("latin1");
    const texts = [...pdf.matchAll(/BT \/F[12] ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*)\) Tj ET/g)]
      .map((match) => ({ size: Number(match[1]), x: Number(match[2]), y: Number(match[3]), text: match[4]! }));
    const purpose = texts.filter((text) => text.size === 8.6);
    expect(purpose.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...purpose.map((text) => text.y))).toBeGreaterThan(438);
    const trace = texts.filter((text) => text.size === 8 && text.y > 350 && text.y < 396);
    expect(trace.length).toBeGreaterThanOrEqual(4);
    const heading = texts.find((text) => text.text === "SOURCE TRACE")!;
    expect(heading.y + heading.size).toBeLessThan(Math.min(...trace.map((text) => text.y)));
    const period = texts.filter((text) => text.size === 8.5 && text.x === 306);
    expect(period.length).toBe(4);
    expect(period.every((text) => text.y >= 491 && text.y <= 501)).toBe(true);
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("USD 850.00");
    expect(isContainedPdf(Buffer.from(pdf, "latin1"))).toBe(true);
  });
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
    expect(text).toContain("Owner Statement");
    expect(text).toContain("Independent Property Service");
    expect(text).toContain("XIA YIXUAN");
    expect(text).toContain("The PEAK #2807");
    expect(text).not.toContain(model.statementNumber);
    expect(text).not.toContain(model.generatedAt);
    expect(text).toContain("Cash Out");
    expect(text).toContain("Cash In");
    expect(text).toContain("Balance");
    expect(text).not.toContain(model.organizationId);
    expect(text).not.toContain(model.ownerPersonId);
    expect(text).not.toContain(model.propertyId);
    expect(text).not.toContain("SOURCE TRACE");
    expect(text).toContain("Page 1 of 1");
    expect(text).toContain("Category");
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
