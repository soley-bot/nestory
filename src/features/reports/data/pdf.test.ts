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
      description: "Ledger income and expense rows for the selected accounting month.",
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

  it("keeps Owner Statement totals and blocked reasons in the generic PDF", () => {
    const report: TrustedReport = {
      columns: [
        { key: "status", label: "Status" },
        { key: "net", label: "Net owner cash movement", align: "right" },
        { key: "notes", label: "Notes" },
      ],
      description: "Property-level cash-basis owner activity.",
      emptyDescription: "No rows.",
      emptyTitle: "No rows",
      exportFilenameBase: "owner-statement",
      generatedAt: "2026-08-01T00:00:00.000Z",
      kind: "owner-statement",
      periodLabel: "01 Jul 2026 - 31 Jul 2026",
      rows: [
        {
          cells: { net: "USD 100.00", notes: "—", status: "Ready" },
          id: "ready-1",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 evidence line",
          title: "Owner One / P1",
          tone: "success",
        },
        {
          cells: {
            net: "—",
            notes: "No effective owner on 15 Jul 2026",
            status: "Blocked",
          },
          id: "blocked-1",
          sourceCount: 1,
          sourceLinks: [],
          sourceSummary: "1 evidence line",
          title: "Blocked: No effective owner on 15 Jul 2026 / P2",
          tone: "danger",
        },
      ],
      scopeLabel: "All properties",
      summary: [
        {
          detail: "Ready properties only",
          label: "Net owner cash movement",
          sourceCount: 1,
          value: "USD 100.00",
        },
      ],
      title: "Owner Statement",
      totalsTraceLabel: "Blocked property money excluded.",
    };

    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");

    expect(pdf).toContain("Owner Statement - Demo Org");
    expect(pdf).toContain("USD 100.00");
    expect(pdf).toContain("No effective owner");
    expect(pdf).not.toContain("amount payable");
  });
});
