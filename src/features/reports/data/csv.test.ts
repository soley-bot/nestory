import { describe, expect, it } from "vitest";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report CSV export", () => {
  it("exports report metadata, source records, source ids, source links, and metrics", () => {
    const report: TrustedReport = {
      columns: [
        { key: "income", label: "Income", align: "right" },
        { key: "noi", label: "NOI", align: "right" },
      ],
      description: "Unit-level report.",
      emptyDescription: "No rows.",
      emptyTitle: "No unit rows",
      exportFilenameBase: "unit-performance",
      generatedAt: "2026-06-15T00:00:00.000Z",
      kind: "unit-performance",
      periodLabel: "01 Jun 2026 - 30 Jun 2026",
      rows: [
        {
          cells: {
            income: "USD 500.00",
            noi: "USD 380.00",
          },
          href: "/units/unit-1",
          id: "unit-1",
          sourceCount: 2,
          sourceLinks: [
            {
              href: "/units/unit-1",
              id: "unit-1",
              label: "Unit A1",
              recordType: "unit",
            },
            {
              href: "/ledger?archiveState=all&entryId=ledger-income",
              id: "ledger-income",
              label: "Rent, June",
              recordType: "ledger",
            },
          ],
          sourceSummary: "2 source rows",
          title: "P1 / Unit A1",
          tone: "success",
        },
      ],
      scopeLabel: "All properties",
      summary: [
        {
          detail: "Income ledger rows in period",
          label: "Income",
          sourceCount: 1,
          value: "USD 500.00",
        },
      ],
      title: "Unit Performance",
      totalsTraceLabel: "Financial totals trace to 2 ledger rows.",
    };

    const csv = buildTrustedReportCsv(report);

    expect(csv).toContain("Report,Unit Performance");
    expect(csv).toContain("Source records,Source ids,Source links");
    expect(csv).toContain("\"unit:Unit A1 | ledger:Rent, June\"");
    expect(csv).toContain("unit-1 | ledger-income");
    expect(csv).toContain(
      "/units/unit-1 | /ledger?archiveState=all&entryId=ledger-income",
    );
    expect(csv).toContain("Metric,Value,Detail,Source count");
    expect(csv).toContain("Income,USD 500.00,Income ledger rows in period,1");
  });

  it("keeps exported spreadsheet formulas inert", () => {
    const report: TrustedReport = {
      columns: [{ key: "risk", label: "Risk" }],
      description: "Risk export.",
      emptyDescription: "No rows.",
      emptyTitle: "No rows",
      exportFilenameBase: "risk",
      generatedAt: "2026-06-15T00:00:00.000Z",
      kind: "missing-data",
      periodLabel: "June 2026",
      rows: [
        {
          cells: { risk: "+missing owner" },
          id: "row-1",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 source row",
          title: "=unsafe title",
        },
      ],
      scopeLabel: "All properties",
      summary: [
        {
          detail: "@source detail",
          label: "Rows",
          sourceCount: 1,
          value: "-1",
        },
      ],
      title: "Missing Data",
      totalsTraceLabel: "Trace",
    };

    const csv = buildTrustedReportCsv(report);

    expect(csv).toContain("1,'=unsafe title,'+missing owner,,,");
    expect(csv).toContain("Rows,'-1,'@source detail,1");
  });

  it("keeps empty rows aligned with report columns and source columns", () => {
    const report: TrustedReport = {
      columns: [
        { key: "record", label: "Record" },
        { key: "issue", label: "Issue" },
      ],
      description: "Missing data export.",
      emptyDescription: "No missing data.",
      emptyTitle: "No rows",
      exportFilenameBase: "missing-data",
      generatedAt: "2026-06-15T00:00:00.000Z",
      kind: "missing-data",
      periodLabel: "June 2026",
      rows: [],
      scopeLabel: "All properties",
      summary: [],
      title: "Missing Data",
      totalsTraceLabel: "Trace",
    };

    const csv = buildTrustedReportCsv(report);

    expect(csv).toContain(
      "Row,Title,Record,Issue,Source records,Source ids,Source links\r\n,No rows,No missing data.,,,,",
    );
  });

  it("exports exact typed Owner Statement evidence and allocated cents", () => {
    const report: TrustedReport = {
      columns: [
        { key: "readiness", label: "Status" },
        { key: "notes", label: "Notes" },
      ],
      description: "Cash-basis owner statement.",
      emptyDescription: "No rows.",
      emptyTitle: "No rows",
      exportFilenameBase: "owner-statement",
      generatedAt: "2026-08-01T00:00:00.000Z",
      kind: "owner-statement",
      periodLabel: "01 Jul 2026 - 31 Jul 2026",
      rows: [
        {
          cells: { notes: "—", readiness: "Ready" },
          evidence: [
            {
              allocatedAmountCents: 6_000,
              allocationId: "allocation-1",
              classification: "operating_receipt",
              depositEventId: null,
              eventDate: "2026-07-20",
              expenseItemId: null,
              incomeItemId: "income-1",
              ownerEndedOn: null,
              ownerLinkId: "owner-link-1",
              ownerPersonId: "person-1",
              ownerStartedOn: "2026-01-01",
              paymentId: null,
              propertyId: "property-1",
              receiptId: "receipt-1",
              signedAmountCents: 10_000,
              statementFact: "operating_cash_received",
            },
          ],
          id: "row-1",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 evidence line",
          title: "Owner One / P1",
        },
      ],
      scopeLabel: "P1 - Property One",
      summary: [],
      title: "Owner Statement",
      totalsTraceLabel: "Ready rows only.",
    };

    const csv = buildTrustedReportCsv(report);

    expect(csv).toContain("Evidence records,Evidence details");
    expect(csv).toContain(
      "property:property-1 | owner-person:person-1 | owner-link:owner-link-1 | income-obligation:income-1 | receipt:receipt-1 | receipt-allocation:allocation-1",
    );
    expect(csv).toContain(
      "2026-07-20 | operating_receipt | signed_cents=10000 | allocated_cents=6000 | fact=operating_cash_received",
    );
  });
});
