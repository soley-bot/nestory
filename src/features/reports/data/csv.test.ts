import { describe, expect, it } from "vitest";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report CSV export", () => {
  it("exports report metadata, source records, source ids, and metrics", () => {
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
    expect(csv).toContain("Source records,Source ids");
    expect(csv).toContain("\"unit:Unit A1 | ledger:Rent, June\"");
    expect(csv).toContain("unit-1 | ledger-income");
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

    expect(csv).toContain("1,'=unsafe title,'+missing owner,,");
    expect(csv).toContain("Rows,'-1,'@source detail,1");
  });
});
