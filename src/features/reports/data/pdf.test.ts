import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTrustedReportPdf,
  getReportPdf,
} from "@/features/reports/data/pdf";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type { TrustedReport } from "@/features/reports/reports.types";

vi.mock("@/features/reports/data/trusted-report", () => ({
  getTrustedReport: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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
          sourceLinks: [
            {
              href: "/ledger?entryId=ledger-1",
              id: "ledger-1",
              label: "Rent",
              recordType: "ledger",
            },
          ],
          sourceSummary: "1 source row",
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
    expect(pdf).toContain("/MediaBox [0 0 842 595]");
    expect(pdf).toContain("Unit Performance - Demo Org");
    expect(pdf).toContain("P1 / Unit A1");
    expect(pdf).toContain("USD 500.00");
    expect(pdf).toContain("ledger:Rent");
    expect(pdf).toContain("ledger-1");
    expect(pdf).toContain("/ledger?entryId=ledger-1");
    expect(pdf).toContain("xref");
  });

  it("does not create a source trace page when no report row has source links", () => {
    const report: TrustedReport = {
      columns: [{ key: "income", label: "Income", align: "right" }],
      description: "Unit-level report.",
      emptyDescription: "No rows.",
      emptyTitle: "No unit rows",
      exportFilenameBase: "unit-profit-loss",
      generatedAt: "2026-06-15T00:00:00.000Z",
      kind: "unit-profit-loss",
      periodLabel: "01 Jun 2026 - 30 Jun 2026",
      rows: [
        {
          cells: { income: "USD 0.00" },
          id: "unit-1",
          sourceCount: 0,
          sourceLinks: [],
          sourceSummary: "No sources",
          title: "P1 / Unit A1",
        },
      ],
      scopeLabel: "P1 - Property One",
      summary: [],
      title: "Monthly Unit Profit & Loss",
      totalsTraceLabel: "No operating events.",
    };

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");

    expect(pdf).toContain("/Count 1");
    expect(pdf).not.toContain("SOURCE TRACE");
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

  it("renders unit profit and loss as a portrait dated financial statement", () => {
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: unitProfitLossReport(),
      }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595 842]");
    for (const label of [
      "Monthly Unit Profit & Loss",
      "P1 - Property One / Unit A1",
      "Cash basis",
      "INCOME",
      "05 Jul 2026",
      "Income subtotal",
      "EXPENSES",
      "10 Jul 2026",
      "Expenses subtotal",
      "Total income",
      "Total expenses",
      "Net income",
      "USD 380.00",
    ]) {
      expect(renderedText).toContain(label);
    }
    expect(renderedText).not.toContain("REPORT PURPOSE");
    expect(renderedText).not.toContain("Source rows");
    expect(renderedText).not.toContain("TRACEABLE OPERATING REPORT");
  });

  it("appends every selected-unit source on portrait pages with global numbering", () => {
    const report = unitProfitLossReport();
    report.rows = [
      {
        cells: {
          expenses: "USD 120.00",
          income: "USD 500.00",
          netIncome: "USD 380.00",
          property: "P1 - Property One",
          unit: "Unit A1",
        },
        href: "/units/unit-1",
        id: "unit-1",
        sourceCount: 7,
        sourceLinks: Array.from({ length: 7 }, (_, index) => ({
          href: `/rent-income?sourceId=canonical-source-${index + 1}`,
          id: `canonical-source-${index + 1}`,
          label: `Rent receipt allocation ${index + 1}`,
          recordType: "receipt-allocation" as const,
        })),
        sourceSummary: "7 source rows",
        title: "P1 / Unit A1",
      },
    ];

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const pages = extractPdfPageCommandText(pdf);

    expect(pdf).toContain("/Count 2");
    expect(pdf.match(/\/MediaBox \[0 0 595 842\]/g)).toHaveLength(2);
    expect(pdf).not.toContain("/MediaBox [0 0 842 595]");
    expect(pages[0]).toContain("Page 1 of 2");
    expect(pages[1]).toContain("SOURCE TRACE");
    expect(pages[1]).toContain("Page 2 of 2");
    expect(pages[1]).toContain("receipt-allocation:Rent receipt allocation 7");
    expect(pages[1]).toContain("canonical-source-7");
    expect(pages[1]).toContain(
      "/rent-income?sourceId=canonical-source-7",
    );
  });

  it("keeps all-unit exports as traceable per-unit landscape summaries", () => {
    const report = unitProfitLossReport();
    report.scopeLabel = "All properties / All units";
    report.unitProfitLossDetailScope = undefined;
    report.unitProfitLossLines = undefined;
    report.rows = [
      summaryUnitRow("unit-1", "P1 / Unit A1", "source-a"),
      summaryUnitRow("unit-2", "P1 / Unit B1", "source-b"),
    ];

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");

    expect(pdf).toContain("/MediaBox [0 0 842 595]");
    expect(pdf).toContain("P1 / Unit A1");
    expect(pdf).toContain("P1 / Unit B1");
    expect(pdf).toContain("SOURCE TRACE");
    expect(pdf).toContain("source-a");
    expect(pdf).toContain("source-b");
    expect(pdf).not.toContain("Category / Description");
  });

  it("shows net income only in the final totals block", () => {
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: unitProfitLossReport(),
      }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(renderedText.split("Net income").length - 1).toBe(1);
  });

  it("groups repeated categories once above indented transaction details", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines?.push({
      amountCents: BigInt(7_500),
      category: "Rent",
      currency: "USD",
      date: "2026-07-08",
      description: "Parking space rent",
      direction: "income",
      id: "ledger-income-parking",
      property: "P1 - Property One",
      unit: "Unit A1",
    });

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);
    const categoryPosition = extractPdfTextPosition(pdf, "Rent");
    const detailPosition = extractPdfTextPosition(pdf, "July rent");

    expect(renderedText.split("Rent").length - 1).toBe(1);
    expect(renderedText).toMatch(
      /INCOME.*Rent.*05 Jul 2026.*July rent.*08 Jul 2026.*Parking space rent/,
    );
    expect(detailPosition.x - categoryPosition.x).toBeGreaterThanOrEqual(10);
  });

  it("renders income reversals with their sign and authoritative totals", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines?.push({
      amountCents: BigInt(-50_000),
      category: "Rent",
      currency: "USD",
      date: "2026-07-20",
      description: "Receipt allocation reversal",
      direction: "income",
      id: "receipt-allocation-reversal",
      property: "P1 - Property One",
      unit: "Unit A1",
    });
    report.summary = report.summary.map((metric) => {
      if (metric.label === "Income") {
        return { ...metric, sourceCount: 2, value: "USD 0.00" };
      }
      if (metric.label === "Net income") {
        return { ...metric, sourceCount: 3, value: "-USD 120.00" };
      }
      return metric;
    });

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(renderedText).toContain("-USD 500.00");
    expect(renderedText).toMatch(
      /Receipt allocation reversal.*-USD 500\.00.*Income subtotal.*USD 0\.00.*Total income.*USD 0\.00.*Total expenses.*USD 120\.00.*Net income.*-USD 120\.00/,
    );
  });

  it("renders expense reversals as negative expense detail without changing totals", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines?.push({
      amountCents: BigInt(-2_000),
      category: "Repair",
      currency: "USD",
      date: "2026-07-20",
      description: "Payment allocation reversal",
      direction: "expense",
      id: "payment_allocation:expense-reversal",
      property: "P1 - Property One",
      unit: "Unit A1",
    });
    report.summary = report.summary.map((metric) => {
      if (metric.label === "Expenses") {
        return { ...metric, sourceCount: 2, value: "USD 100.00" };
      }
      if (metric.label === "Net income") {
        return { ...metric, sourceCount: 3, value: "USD 400.00" };
      }
      return metric;
    });

    const renderedText = extractPdfCommandText(
      Buffer.from(
        buildTrustedReportPdf({ organizationName: "Demo Org", report }),
      ).toString("latin1"),
    );

    expect(renderedText).toContain("Payment allocation reversal");
    expect(renderedText).toContain("-USD 20.00");
    expect(renderedText).toMatch(
      /Payment allocation reversal.*-USD 20\.00.*Expenses subtotal.*USD 100\.00.*Net income.*USD 400\.00/,
    );
  });

  it("renders explicit empty income and expense sections with authoritative totals", () => {
    const noIncomeReport = unitProfitLossReport();
    noIncomeReport.unitProfitLossLines =
      noIncomeReport.unitProfitLossLines?.filter(
        ({ direction }) => direction === "expense",
      );
    noIncomeReport.summary = noIncomeReport.summary.map((metric) => {
      if (metric.label === "Income") {
        return { ...metric, sourceCount: 0, value: "USD 0.00" };
      }
      if (metric.label === "Net income") {
        return { ...metric, sourceCount: 1, value: "-USD 120.00" };
      }
      return metric;
    });

    const noExpenseReport = unitProfitLossReport();
    noExpenseReport.unitProfitLossLines =
      noExpenseReport.unitProfitLossLines?.filter(
        ({ direction }) => direction === "income",
      );
    noExpenseReport.summary = noExpenseReport.summary.map((metric) => {
      if (metric.label === "Expenses") {
        return { ...metric, sourceCount: 0, value: "USD 0.00" };
      }
      if (metric.label === "Net income") {
        return { ...metric, sourceCount: 1, value: "USD 500.00" };
      }
      return metric;
    });

    const noIncomePdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: noIncomeReport,
      }),
    ).toString("latin1");
    const noExpensePdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: noExpenseReport,
      }),
    ).toString("latin1");

    expect(extractPdfCommandText(noIncomePdf)).toContain("No income recorded");
    expect(extractPdfCommandText(noIncomePdf)).toContain("Income subtotal");
    expect(extractPdfCommandText(noIncomePdf)).toContain("USD 0.00");
    expect(extractPdfCommandText(noExpensePdf)).toContain(
      "No expenses recorded",
    );
    expect(extractPdfCommandText(noExpensePdf)).toContain("Expenses subtotal");
  });

  it("repeats statement context while paginating stable grouped canonical events", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = Array.from({ length: 48 }, (_, index) => ({
      amountCents: BigInt((index + 1) * 100),
      category: index % 2 === 0 ? "Rent" : "Repair",
      currency: "USD" as const,
      date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
      description:
        `Canonical event detail ${index + 1} ` +
        "with enough context to wrap cleanly without overlapping the next row",
      direction: index < 24 ? ("income" as const) : ("expense" as const),
      id: `cash-event-${String(index + 1).padStart(2, "0")}`,
      property: "P1 - Property One",
      unit: "Unit A1",
    }));
    report.summary = report.summary.map((metric) => {
      if (metric.label === "Income") {
        return { ...metric, sourceCount: 24, value: "USD 300.00" };
      }
      if (metric.label === "Expenses") {
        return { ...metric, sourceCount: 24, value: "USD 876.00" };
      }
      return { ...metric, sourceCount: 48, value: "-USD 576.00" };
    });

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(renderedText.split("Monthly Unit Profit & Loss").length - 1).toBeGreaterThan(
      1,
    );
    expect(renderedText.split("Description").length - 1).toBeGreaterThan(1);
    expect(renderedText).toContain("Income (continued)");
    expect(renderedText).toContain("Expenses subtotal");
    expect(renderedText).toContain("Page 2 of");
  });

  it("keeps a twenty-row categorized statement and its totals within two pages", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = Array.from({ length: 20 }, (_, index) => ({
      amountCents: BigInt((index + 1) * 100),
      category: `Category ${String(index + 1).padStart(2, "0")}`,
      currency: "USD" as const,
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      description: `Canonical event detail ${index + 1}`,
      direction: index < 8 ? ("income" as const) : ("expense" as const),
      id: `cash-event-category-${String(index + 1).padStart(2, "0")}`,
      property: "P1 - Property One",
      unit: "Unit A1",
    }));

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const pages = extractPdfPageCommandText(pdf);

    expect(pdf).toContain("/Count 2");
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("Expenses subtotal");
    expect(pages[1]).toContain("Net income");
  });

  it("keeps a section heading with its first row at a page boundary", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = [
      ...Array.from({ length: 17 }, (_, index) =>
        unitProfitLossLine(index + 1, "income", `Income boundary row ${index + 1}`),
      ),
      unitProfitLossLine(18, "expense", "First expense boundary row"),
    ];

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const pages = extractPdfPageCommandText(pdf);
    const expensePageIndex = pages.findIndex((page) => page.includes("EXPENSES"));

    expect(expensePageIndex).toBe(1);
    expect(pages[0]).not.toContain("EXPENSES");
    expect(pages[expensePageIndex]).toContain("First expense boundary row");
  });

  it("moves a section subtotal intact when the preceding page is full", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = Array.from({ length: 19 }, (_, index) =>
      unitProfitLossLine(index + 1, "income", `Income boundary row ${index + 1}`),
    );

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const pages = extractPdfPageCommandText(pdf);

    expect(pages[0]).toContain("Income boundary row 19");
    expect(pages[0]).not.toContain("Income subtotal");
    expect(pages[1]).toContain("Income (continued)");
    expect(pages[1]).toContain("Income subtotal");
  });

  it("keeps all three final totals together when they cross a page boundary", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = Array.from({ length: 13 }, (_, index) =>
      unitProfitLossLine(index + 1, "expense", `Expense totals row ${index + 1}`),
    );

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const pages = extractPdfPageCommandText(pdf);
    const totalsPages = pages.filter((page) => page.includes("Total income"));

    expect(pages[0]).toContain("Expenses subtotal");
    expect(pages[0]).not.toContain("Total income");
    expect(totalsPages).toHaveLength(1);
    expect(totalsPages[0]).toContain("Total expenses");
    expect(totalsPages[0]).toContain("Net income");
  });

  it("caps an extra-long statement description at two rendered lines", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines![0].description =
      "Exceptionally detailed ledger context ".repeat(20);

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");

    expect(extractPdfCommandText(pdf)).toContain("...");
  });

  it("keeps the grouped category readable while bounding a long amount", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines![0].category =
      "Emergency plumbing restoration and replacement";
    report.unitProfitLossLines![0].amountCents = BigInt(
      "12345678901234500",
    );

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(renderedText).toContain(
      "Emergency plumbing restoration and replacement",
    );
    expect(renderedText).toContain("USD 123,456,789,012,345.00");
  });

  it("width-bounds an unbroken wide-glyph grouped category", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines![0].category = "W".repeat(60);

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(renderedText.match(/W+\.\.\./)?.[0]).toBe(`${"W".repeat(43)}...`);
  });

  it("keeps all nine owner-facing amounts readable without internal readiness detail", () => {
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

    expect(pdf).toContain("Owner Statement");
    expect(pdf).toContain("Demo Org");
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
    expect(renderedText).toContain("CASH ACTIVITY");
    expect(renderedText).toContain("PERIOD DISCLOSURES");
    expect(pdf).not.toContain("USD...");
    expect(pdf).toContain("Owner 1");
    expect(pdf).toContain("P1 - Property 1");
    expect(pdf).toContain("100.000%");
    expect(pdf).not.toContain("Ready with warning");
    expect(pdf).not.toContain("Owner contact details are missing");
    expect(pdf).not.toContain("EVIDENCE / SOURCES");
    expect(pdf).not.toContain("9 evidence lines");
    expect(pdf).not.toContain("TRACEABLE OPERATING REPORT");
    expect(pdf).not.toContain("Nestory property report");
  });

  it("bounds long owner and property identity while keeping the complete statement on one page", () => {
    const row = ownerStatementReadyRow(1, {
      owner: `Owner ${"Extraordinarily Long Recipient Name ".repeat(12)}`,
      property: `P1 - ${"Extraordinarily Long Property Name ".repeat(12)}`,
    });
    const pdf = Buffer.from(
      buildTrustedReportPdf({
        organizationName: "Demo Org",
        report: ownerStatementReport([row]),
      }),
    ).toString("latin1");
    const renderedText = extractPdfCommandText(pdf);

    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("Page 1 of 1");
    expect(renderedText).toContain("...");
    expect(pdf).toContain("USD 600.00");
    expect(pdf).toContain("Security deposits held");
    expect(pdf).not.toContain("Extraordinarily Long Recipient Name Extraordinarily Long Recipient Name Extraordinarily Long Recipient Name Extraordinarily Long Recipient Name");
  });
});

describe("Owner Statement PDF selection", () => {
  it("returns the authoritative-balance publication block", async () => {
    const report = ownerStatementReport([ownerStatementReadyRow(1)]);
    report.exportValidation = {
      code: "owner_statement_balances_unavailable",
      message:
        "Owner Statement export is unavailable until opening and closing owner balances are authoritative.",
      status: 409,
    };
    vi.mocked(getTrustedReport).mockResolvedValue(report);

    const result = await getReportPdf("organization-1", "Demo Org", {
      month: "2026-07",
      ownerPersonId: "all",
      peopleArchiveState: "active",
      peopleView: "relationship",
      propertyId: "all",
      report: "owner-statement",
      status: "all",
      unitId: "all",
    });

    expect(result).toEqual({
      validation: {
        code: "owner_statement_balances_unavailable",
        message:
          "Owner Statement export is unavailable until opening and closing owner balances are authoritative.",
        status: 409,
      },
    });
  });
});

function unitProfitLossReport(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "unit", label: "Unit" },
      { align: "right", key: "income", label: "Income" },
      { align: "right", key: "expenses", label: "Expenses" },
      { align: "right", key: "netIncome", label: "Net income" },
    ],
    description: "Income, expenses, and net income by unit.",
    emptyDescription: "No rows.",
    emptyTitle: "No unit rows",
    exportFilenameBase: "unit-profit-loss",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "unit-profit-loss",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [],
    scopeLabel: "P1 - Property One / Unit A1",
    summary: [
      {
        detail: "Income from unit-linked ledger rows",
        label: "Income",
        sourceCount: 1,
        value: "USD 500.00",
      },
      {
        detail: "Expenses from unit-linked ledger rows",
        label: "Expenses",
        sourceCount: 1,
        value: "USD 120.00",
      },
      {
        detail: "Income less expenses",
        label: "Net income",
        sourceCount: 2,
        value: "USD 380.00",
      },
    ],
    title: "Monthly Unit Profit & Loss",
    totalsTraceLabel:
      "Totals trace to 2 canonical unit-linked operating cash events.",
    unitProfitLossDetailScope: "single-unit",
    unitProfitLossLines: [
      {
        amountCents: BigInt(50_000),
        category: "Rent",
        currency: "USD",
        date: "2026-07-05",
        description: "July rent",
        direction: "income",
        id: "receipt_allocation:income-source",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      {
        amountCents: BigInt(12_000),
        category: "Repair",
        currency: "USD",
        date: "2026-07-10",
        description: "Kitchen sink repair",
        direction: "expense",
        id: "payment_allocation:expense-source",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
    ],
  };
}

function summaryUnitRow(
  id: string,
  title: string,
  sourceId: string,
): TrustedReport["rows"][number] {
  return {
    cells: {
      expenses: "USD 120.00",
      income: "USD 500.00",
      netIncome: "USD 380.00",
      property: "P1 - Property One",
      unit: title.split(" / ")[1] ?? title,
    },
    href: `/units/${id}`,
    id,
    sourceCount: 1,
    sourceLinks: [
      {
        href: `/rent-income?sourceId=${sourceId}`,
        id: sourceId,
        label: "Rent receipt allocation",
        recordType: "receipt-allocation",
      },
    ],
    sourceSummary: "1 source row",
    title,
  };
}

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

function extractPdfPageCommandText(pdf: string) {
  return [...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(
    (match) => extractPdfCommandText(match[1]),
  );
}

function extractPdfTextPosition(pdf: string, value: string) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pdf.match(
    new RegExp(
      `1 0 0 1 (-?[\\d.]+) (-?[\\d.]+) Tm \\(${escapedValue}\\) Tj ET`,
    ),
  );

  if (!match) {
    throw new Error(`PDF text position not found for "${value}"`);
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

function unitProfitLossLine(
  index: number,
  direction: "expense" | "income",
  description: string,
): NonNullable<TrustedReport["unitProfitLossLines"]>[number] {
  return {
    amountCents: BigInt(index * 100),
    category: direction === "income" ? "Rent" : "Repair",
    currency: "USD",
    date: `2026-07-${String(index).padStart(2, "0")}`,
    description,
    direction,
    id: `cash-event-boundary-${String(index).padStart(2, "0")}`,
    property: "P1 - Property One",
    unit: "Unit A1",
  };
}
