/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ReportResultsTable } from "./report-results-table";
import { prepareTrustedReportForScreen } from "@/features/reports/data/reports";
import type {
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("Shared report results table", () => {
  it("matches drawer transactions by unit identity even when unit labels repeat", async () => {
    const user = userEvent.setup();
    const report = unitProfitLossReport();
    const base = { amountCents: BigInt(50000), category: "Rent", categoryCode: "rent", categoryId: null, currency: "USD" as const, date: "2026-07-09", direction: "income" as const, property: "Property One", reportingGroup: "income", unit: "Unit A1", propertyId: "property-1" };
    report.unitProfitLossLines = [
      { ...base, id: "chosen", unitId: "unit-1", description: "Selected unit rent" },
      { ...base, id: "other", unitId: "unit-2", description: "Other unit rent" },
      { ...base, id: "shared", unitId: null, description: "Property-only activity" },
    ];
    renderReport({ report });
    await user.click(screen.getByRole("button", { name: "View details for P1 / Unit A1" }));
    const transactions = screen.getByRole("region", { name: "Unit transactions" });
    expect(within(transactions).getByText("Selected unit rent")).toBeTruthy();
    expect(within(transactions).queryByText("Other unit rent")).toBeNull();
    expect(within(transactions).queryByText("Property-only activity")).toBeNull();
  });

  it("closes the drawer when opening the already selected complete P&L", async () => {
    const user = userEvent.setup();
    renderReport({ viewQuery: query({ unitId: "unit-1" }) });
    await user.click(screen.getByRole("button", { name: "View details for P1 / Unit A1" }));
    await user.click(screen.getByRole("link", { name: "Open complete P&L" }));
    expect(screen.queryByRole("button", { name: "Close drawer" })).toBeNull();
  });

  it("keeps the report title and row count inline until the heading needs to wrap", () => {
    renderReport();

    const title = screen.getByRole("heading", {
      level: 2,
      name: "Monthly Unit Profit & Loss",
    });
    const heading = title.parentElement;
    const rowCount = within(heading!).getByText("1 scope");

    expect(heading).not.toBeNull();
    expect(heading?.className).toContain("flex");
    expect(heading?.className).toContain("flex-wrap");
    expect(title.parentElement).toBe(heading);
    expect(rowCount.parentElement).toBe(heading);
    expect(rowCount.className).not.toContain("mt-0.5");
  });

  it("draws each report row separator across the full row and omits the final one", () => {
    const report = unitProfitLossReport();
    report.rows.push({
      ...report.rows[0]!,
      cells: {
        ...report.rows[0]!.cells,
        property: "P2 - Property Two",
        unit: "Unit B1",
      },
      href: "/units/unit-2",
      id: "unit-2",
      title: "P2 / Unit B1",
    });

    renderReport({ report });

    const bodyRows = screen
      .getByRole("table", { name: "Monthly Unit Profit & Loss" })
      .querySelectorAll("tbody > tr");

    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]?.className).toContain("border-b");
    expect(bodyRows[1]?.parentElement?.className).toContain(
      "[&_tr:last-child]:border-0",
    );
    for (const cell of bodyRows[0]!.querySelectorAll("td")) {
      expect(cell.className).not.toContain("border-b");
    }
  });

  it("discloses omitted source links inside row details", async () => {
    const user = userEvent.setup();
    const report = unitProfitLossReport();
    report.rows[0]!.sourceLinks = Array.from({ length: 7 }, (_, index) => ({
      href: `/ledger?entryId=ledger-${index + 1}`,
      id: `ledger-${index + 1}`,
      label: `Source ${index + 1}`,
      recordType: "ledger" as const,
    }));
    report.rows[0]!.sourceCount = 7;
    report.rows[0]!.sourceSummary = "7 source records";

    renderReport({ report: prepareTrustedReportForScreen(report) });

    await user.click(
      screen.getByRole("button", { name: "View details for P1 / Unit A1" }),
    );
    expect(screen.getByText("+2 more")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "7 source records; 2 additional sources are not shown in this preview",
      ),
    ).toBeTruthy();
  });

  it("hides zero-activity units until the user asks to include them", async () => {
    const user = userEvent.setup();
    const report = unitProfitLossReport();
    report.rows.push({
      ...report.rows[0]!,
      cells: {
        expenses: "USD 0.00",
        income: "USD 0.00",
        netIncome: "USD 0.00",
        property: "P2 - Property Two",
        unit: "Unit B1",
      },
      href: "/units/unit-2",
      id: "unit-2",
      sourceCount: 2,
      sourceLinks: [],
      sourceSummary: "Property and unit records",
      title: "P2 / Unit B1",
    });

    renderReport({ report });

    expect(screen.queryByText("P2 - Property Two")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show 1 scope with no activity" }));
    expect(screen.getByText("P2 - Property Two")).toBeTruthy();
  });

  it("keeps Finance Manager report records on finance-safe routes", async () => {
    const user = userEvent.setup();
    const report = unitProfitLossReport();
    report.rows[0]!.sourceLinks.push(
      {
        href: "/properties/property-1",
        id: "property-1",
        label: "P1",
        recordType: "property",
      },
      {
        href: "/units/unit-1",
        id: "unit-1",
        label: "Unit A1",
        recordType: "unit",
      },
    );

    const financeSafe = prepareTrustedReportForScreen(report, {
      financeSafeRecords: true,
    });
    renderReport({ report: financeSafe });

    expect(screen.queryByRole("link", { name: "P1 - Property One" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "View details for P1 / Unit A1" }),
    );
    expect(screen.getByRole("link", { name: "P1" }).getAttribute("href")).toBe(
      "/properties/property-1/account",
    );
    expect(screen.queryByRole("link", { name: "Unit A1" })).toBeNull();
    expect(screen.getAllByText("Unit A1")).not.toHaveLength(0);
  });
});

function renderReport({ report = unitProfitLossReport(), viewQuery = query() }: { report?: TrustedReport; viewQuery?: ReportsViewQuery } = {}) {
  return render(<ReportResultsTable report={report} reportRowCount={report.rows.length} viewQuery={viewQuery} />);
}
function query(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "unit-profit-loss",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}

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
    rows: [
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
        sourceCount: 2,
        sourceLinks: [
          {
            href: "/ledger?archiveState=all&entryId=ledger-income",
            id: "ledger-income",
            label: "Rent ledger",
            recordType: "ledger",
          },
        ],
        sourceSummary: "1 source row",
        title: "P1 / Unit A1",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Unit-linked income",
        label: "Income",
        sourceCount: 1,
        value: "USD 500.00",
      },
      {
        detail: "Unit-linked expenses",
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
      {
        detail: "Units in scope",
        label: "Units",
        sourceCount: 1,
        value: "1",
      },
    ],
    title: "Monthly Unit Profit & Loss",
    totalsTraceLabel: "Totals trace to 2 unit-linked ledger rows.",
  };
}
