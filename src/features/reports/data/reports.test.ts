import { describe, expect, it } from "vitest";

import { prepareTrustedReportForScreen } from "@/features/reports/data/reports";
import type {
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

describe("report screen preparation", () => {
  it("selects an Owner Statement recipient before trimming the readiness preview", () => {
    const report = ownerStatementReport(76);
    report.rows[75]!.sourceCount = 7;
    report.rows[75]!.sourceSummary = "7 source records";
    report.rows[75]!.sourceLinks = Array.from({ length: 7 }, (_, index) => ({
      href: `/ledger?entryId=owner-76-source-${index + 1}`,
      id: `owner-76-source-${index + 1}`,
      label: `Owner 76 source ${index + 1}`,
      recordType: "ledger" as const,
    }));
    const selected = prepareTrustedReportForScreen(report, {
      ...ownerStatementQuery(),
      ownerPersonId: "owner-76",
      propertyId: "property-76",
    });

    expect(selected.rows).toHaveLength(1);
    expect(selected.rows[0]).toMatchObject({
      ownerPersonId: "owner-76",
      propertyId: "property-76",
      sourceCount: 0,
      sourceSummary: "",
    });
    expect(selected.rows[0]?.sourceLinks).toEqual([]);
    expect(selected.totalRowCount).toBe(1);
    expect(selected.title).toBe("Owner Statement");
  });

  it("keeps the internal readiness workspace limited to 75 rows", () => {
    const selected = prepareTrustedReportForScreen(
      ownerStatementReport(76),
      ownerStatementQuery(),
    );

    expect(selected.rows).toHaveLength(75);
    expect(selected.totalRowCount).toBe(76);
  });

  it("preserves full source counts while bounding screen links", () => {
    const report = ownerStatementReport(1);
    report.rows[0]!.sourceCount = 7;
    report.rows[0]!.sourceSummary = "7 source records";
    report.rows[0]!.sourceLinks = Array.from({ length: 7 }, (_, index) => ({
      href: `/ledger?entryId=source-${index + 1}`,
      id: `source-${index + 1}`,
      label: `Source ${index + 1}`,
      recordType: "ledger" as const,
    }));

    const selected = prepareTrustedReportForScreen(
      report,
      ownerStatementQuery(),
    );

    expect(selected.rows[0]?.sourceLinks).toHaveLength(5);
    expect(selected.rows[0]).toMatchObject({
      sourceCount: 7,
      sourceSummary: "7 source records",
    });
  });
});

function ownerStatementReport(rowCount: number): TrustedReport {
  return {
    columns: [{ key: "readiness", label: "Status" }],
    description: "Readiness",
    emptyDescription: "No rows",
    emptyTitle: "No rows",
    exportFilenameBase: "owner-statement",
    generatedAt: "2026-07-15T00:00:00.000Z",
    kind: "owner-statement",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: Array.from({ length: rowCount }, (_, index) => {
      const number = index + 1;
      return {
        cells: {
          owner: `Owner ${number}`,
          property: `Property ${number}`,
          readiness: "Ready",
        },
        id: `row-${number}`,
        ownerPersonId: `owner-${number}`,
        propertyId: `property-${number}`,
        sourceCount: 0,
        sourceLinks: [],
        sourceSummary: "",
        title: `Owner ${number}`,
      };
    }),
    scopeLabel: "All properties",
    summary: [],
    title: "Owner Statement readiness",
    totalsTraceLabel: "Trace",
  };
}

function ownerStatementQuery(): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "owner-statement",
    status: "all",
    unitId: "all",
  };
}
