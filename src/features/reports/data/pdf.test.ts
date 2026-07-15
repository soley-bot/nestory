import { describe, expect, it } from "vitest";

import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
import type { TrustedReport } from "@/features/reports/reports.types";

describe("trusted report PDF export", () => {
  it("renders report metadata and rows into a PDF document", () => {
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
          sourceLinks: [],
          sourceSummary: "2 source rows",
          title: "P1 / Unit A1",
          tone: "success",
        },
      ],
      scopeLabel: "P1 - Property One",
      summary: [],
      title: "Unit Performance",
      totalsTraceLabel: "Financial totals trace to 2 ledger rows.",
    };

    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report,
      }),
    ).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Unit Performance - Demo Org");
    expect(pdf).toContain("P1 / Unit A1");
    expect(pdf).toContain("USD 500.00");
    expect(pdf).toContain("xref");
  });

  it("renders income and expense reports as a profit and loss statement", () => {
    const report: TrustedReport = {
      columns: [
        { key: "date", label: "Date" },
        { key: "direction", label: "Type" },
        { key: "category", label: "Category" },
        { key: "property", label: "Property" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "description", label: "Description" },
      ],
      description:
        "Ledger income and expense rows for the selected accounting month.",
      emptyDescription: "No rows.",
      emptyTitle: "No ledger rows",
      exportFilenameBase: "income-expense",
      generatedAt: "2026-06-20T00:00:00.000Z",
      kind: "income-expense",
      periodLabel: "01 Jun 2026 - 30 Jun 2026",
      rows: [
        {
          cells: {
            amount: "USD 1,400.00",
            category: "Rent",
            date: "01 Jun 2026",
            description: "Monthly Rent",
            direction: "Income",
            property: "J-TOWER II",
            unit: "Unit 1303",
          },
          id: "ledger-income",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 source row",
          title: "01 Jun 2026 / Rent",
          tone: "success",
        },
        {
          cells: {
            amount: "USD 35.00",
            category: "Cleaning",
            date: "02 Jun 2026",
            description: "Cleaning service",
            direction: "Expense",
            property: "J-TOWER II",
            unit: "Unit 1303",
          },
          id: "ledger-expense",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 source row",
          title: "02 Jun 2026 / Cleaning",
          tone: "warning",
        },
      ],
      scopeLabel: "Unit 1303",
      summary: [],
      title: "Income & Expense",
      totalsTraceLabel: "Totals trace directly to 2 ledger rows.",
    };

    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "IPS Cambodia",
        report,
      }),
    ).toString("latin1");

    expect(pdf).toContain("Profit and loss details");
    expect(pdf).toContain("Company logo");
    expect(pdf).toContain("Cash basis");
    expect(pdf).toContain("Total Income");
    expect(pdf).toContain("Total Expenses");
    expect(pdf).toContain("Net income");
    expect(pdf).toContain("USD 1,365.00");
  });

  it("keeps all nine Owner Statement amounts readable with identity and warnings", () => {
    const amounts = [
      "USD 100.00",
      "USD 12,345.67",
      "USD 0.00",
      "-USD 75.00",
      "USD 250.00",
      "USD 1,500.00",
      "USD 300.00",
      "USD 2,000.00",
      "-USD 11,070.67",
    ];
    const report = ownerStatementReport([
      ownerStatementReadyRow(1, {
        depositsHeld: amounts[7],
        managementEarned: amounts[2],
        managementOutstanding: amounts[4],
        managementReceived: amounts[3],
        netMovement: amounts[8],
        notes: "Owner contact details are missing",
        operatingCash: amounts[0],
        ownerContributions: amounts[5],
        ownerPayouts: amounts[6],
        propertyExpenses: amounts[1],
      }),
    ]);

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(pdf).toContain("Owner Statement - Demo Org");
    for (const amount of amounts) expect(pdf).toContain(amount);
    for (const label of [
      "Operating cash received",
      "Property expenses paid",
      "Management fees earned",
      "Management fees received",
      "Management fees outstanding from this period",
      "Owner contributions",
      "Owner payouts",
      "Security deposits held",
      "Net owner cash movement",
    ]) {
      expect(renderedText).toContain(label);
    }
    expect(pdf).not.toContain("USD...");
    expect(pdf).toContain("Owner 1");
    expect(pdf).toContain("P1 - Property 1");
    expect(pdf).toContain("Ready with warning");
    expect(pdf).toContain("100.000%");
    expect(pdf).toContain("Owner contact details are missing");
  });

  it("renders a blocked Owner Statement with its full reason and no money grid", () => {
    const reason =
      "No effective owner roster exists on 15 Jul 2026 for property P2; correct ownership before generating this statement.";
    const report = ownerStatementReport([
      {
        cells: {
          depositsHeld: "-",
          managementEarned: "-",
          managementOutstanding: "-",
          managementReceived: "-",
          netMovement: "-",
          notes: reason,
          operatingCash: "-",
          owner: "Blocked",
          ownerContributions: "-",
          ownerPayouts: "-",
          ownership: "-",
          property: "P2 - Property 2",
          propertyExpenses: "-",
          readiness: "Blocked",
        },
        id: "blocked-2",
        sourceCount: 3,
        sourceLinks: [],
        sourceSummary: "3 evidence lines",
        title: `Blocked: ${reason} / P2`,
        tone: "danger",
      },
    ]);

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(pdf).toContain("P2 - Property 2");
    expect(pdf).toContain("Blocked");
    expect(renderedText).toContain(reason);
    expect(pdf).toContain("3 evidence lines");
    expect(pdf).not.toContain("Operating cash received");
    expect(pdf).not.toContain("USD ");
  });

  it("paginates complete Owner Statement blocks without separating identity and amounts", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      ownerStatementReadyRow(index + 1, {
        netMovement: `USD ${index + 1},000.00`,
      }),
    );
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: ownerStatementReport(rows),
      }),
    ).toString("latin1");

    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(pdf).toContain("Page 1 of");
    expect(pdf).toContain("Page 2 of");

    const pageStreams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(
      (match) => match[1],
    );
    for (const [index] of rows.entries()) {
      const owner = `Owner ${index + 1}`;
      const amount = `USD ${index + 1},000.00`;
      expect(
        pageStreams.some(
          (page) => page.includes(owner) && page.includes(amount),
        ),
      ).toBe(true);
    }
  });
});

function ownerStatementReport(
  rows: TrustedReport["rows"],
): TrustedReport {
  return {
    columns: [
      { key: "readiness", label: "Status" },
      { key: "owner", label: "Owner" },
      { key: "property", label: "Property" },
      { key: "ownership", label: "Ownership share" },
      {
        align: "right",
        key: "operatingCash",
        label: "Operating cash received",
      },
      {
        align: "right",
        key: "propertyExpenses",
        label: "Property expenses paid",
      },
      {
        align: "right",
        key: "managementEarned",
        label: "Management fees earned",
      },
      {
        align: "right",
        key: "managementReceived",
        label: "Management fees received",
      },
      {
        align: "right",
        key: "managementOutstanding",
        label: "Management fees outstanding from this period",
      },
      {
        align: "right",
        key: "ownerContributions",
        label: "Owner contributions",
      },
      { align: "right", key: "ownerPayouts", label: "Owner payouts" },
      {
        align: "right",
        key: "depositsHeld",
        label: "Security deposits held",
      },
      {
        align: "right",
        key: "netMovement",
        label: "Net owner cash movement",
      },
      { key: "notes", label: "Notes" },
    ],
    description: "Property-level cash-basis owner activity.",
    emptyDescription: "No rows.",
    emptyTitle: "No owner statement rows",
    exportFilenameBase: "owner-statement",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "owner-statement",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows,
    scopeLabel: "All properties",
    summary: [],
    title: "Owner Statement",
    totalsTraceLabel: "Blocked property money excluded.",
  };
}

function ownerStatementReadyRow(
  index: number,
  cellOverrides: Record<string, string> = {},
): TrustedReport["rows"][number] {
  return {
    cells: {
      depositsHeld: "USD 900.00",
      managementEarned: "USD 30.00",
      managementOutstanding: "USD 40.00",
      managementReceived: "USD 50.00",
      netMovement: "USD 600.00",
      notes: "-",
      operatingCash: "USD 700.00",
      owner: `Owner ${index}`,
      ownerContributions: "USD 60.00",
      ownerPayouts: "USD 70.00",
      ownership: "100.000%",
      property: `P${index} - Property ${index}`,
      propertyExpenses: "USD 80.00",
      readiness: "Ready with warning",
      ...cellOverrides,
    },
    id: `ready-${index}`,
    sourceCount: 9,
    sourceLinks: [],
    sourceSummary: "9 evidence lines",
    title: `Owner ${index} / P${index}`,
    tone: "warning",
  };
}

function extractPdfCommandText(pdf: string) {
  return [...pdf.matchAll(/\(((?:\\.|[^)])*)\) Tj/g)]
    .map((match) =>
      match[1]
        .replaceAll("\\(", "(")
        .replaceAll("\\)", ")")
        .replaceAll("\\\\", "\\"),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
