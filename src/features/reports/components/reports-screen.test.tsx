/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ReportBuilderScreen } from "@/features/reports/components/reports-screen";
import { prepareTrustedReportForScreen } from "@/features/reports/data/reports";
import type {
  ReportsScreenData,
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

describe("Reports screen", () => {
  it("opens directly in the reference account table with compact controls", async () => {
    const user = userEvent.setup();
    const report = unitProfitLossReport();
    report.unitProfitLossLines = [{ amountCents: BigInt(6500), category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-07-09", description: "Roof repair", direction: "expense", id: "event-1", property: "Property One", reportingGroup: "expenses", unit: "Property-level" }];
    renderReport({ report });
    expect(screen.getByRole("heading", { name: "Profit & loss detail", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("region", { name: "Report totals" })).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Account", "Date", "Type", "Name", "Property", "Memo", "Amount"]);
    expect(screen.getByRole("link", { name: "All reports" }).getAttribute("href")).toBe("/reports");
    expect(screen.getByRole("button", { name: "Report month" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter report by property" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter report by unit" })).toBeTruthy();
    expect(screen.queryByText("Roof repair")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Operating expenses: Repairs" }));
    expect(screen.getByText("Roof repair")).toBeTruthy();
  });

  it("keeps unavailable owner balances visible below operating profit", () => {
    const report = unitProfitLossReport();
    report.unitProfitLossLines = [];
    report.unitProfitLossFunding = { contributionCents: BigInt(68200), remainingBalanceCents: null, unavailableReason: "Unit allocation is unresolved." };
    renderReport({ report });
    expect(screen.getByRole("status").textContent).toBe("Unit allocation is unresolved.");
    expect(screen.getByRole("row", { name: "Remaining Balance Unavailable" })).toBeTruthy();
    expect(screen.getByRole("row", { name: "Net income Unavailable" })).toBeTruthy();
  });

  it("hides the report and exports when scope validation fails", () => {
    const report = unitProfitLossReport();
    report.scopeValidation = { code: "invalid", message: "Choose a valid unit." };
    renderReport({ report });
    expect(screen.getByRole("alert").textContent).toContain("Choose a valid unit.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  it("offers clearly named PDF and Excel exports through one menu", async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(
      screen.getByRole("menuitem", { name: "PDF report" }).getAttribute("href"),
    ).toBe("/api/reports/pdf?report=unit-profit-loss&month=2026-07");
    expect(
      screen.getByRole("menuitem", { name: "Excel workbook" }).getAttribute("href"),
    ).toBe("/api/reports/excel?report=unit-profit-loss&month=2026-07");
    expect(screen.queryByText("Export CSV")).toBeNull();
    expect(screen.queryByText("Print / PDF")).toBeNull();
  });

  it("keeps the selected owner in Owner activity exports", async () => {
    const user = userEvent.setup();
    const report = ownerActivityReport();
    renderReport({
      report,
      viewQuery: query({
        ownerPersonId: "owner-1",
        report: "monthly-owner-activity",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(
      screen.getByRole("menuitem", { name: "PDF report" }).getAttribute("href"),
    ).toBe(
      "/api/reports/pdf?report=monthly-owner-activity&month=2026-07&ownerPersonId=owner-1",
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Excel workbook" })
        .getAttribute("href"),
    ).toBe(
      "/api/reports/excel?report=monthly-owner-activity&month=2026-07&ownerPersonId=owner-1",
    );
  });

  it("shows every Owner activity source and an explicit reconciliation formula", async () => {
    const user = userEvent.setup();
    const report = ownerActivityReport();
    report.rows[0]!.sourceLinks = Array.from({ length: 9 }, (_, index) => ({
      detail: `0${index + 1} Jul 2026 · USD 100.00 increase`,
      href: `/properties/property-1/account?source=${index + 1}`,
      id: `source-${index + 1}`,
      label: `Source ${index + 1}`,
      recordType: "property-account-entry" as const,
    }));
    report.rows[0]!.sourceCount = 9;
    report.rows[0]!.sourceSummary = "9 source records";

    renderReport({
      report: prepareTrustedReportForScreen(report),
      viewQuery: query({ report: "monthly-owner-activity" }),
    });

    await user.click(
      screen.getByRole("button", {
        name: "View details for Central Residence — CTR-RES",
      }),
    );
    expect(screen.getAllByRole("link", { name: /Source \d/ })).toHaveLength(9);
    expect(screen.getByText("09 Jul 2026 · USD 100.00 increase")).toBeTruthy();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
    expect(
      screen.getByText(
        "USD 1,725.00 − USD 145.00 − USD 25.00 − USD 350.00 = USD 1,205.00",
      ),
    ).toBeTruthy();
  });


});
function renderReport({
  report = unitProfitLossReport(),
  viewQuery = query(),
}: {
  report?: TrustedReport;
  viewQuery?: ReportsViewQuery;
} = {}) {
  const data: ReportsScreenData = {
    ownerOptions: report.ownerOptions ?? [],
    propertyOptions: [{ id: "property-1", label: "P1 - Property One" }],
    trustedReport: report,
    unitOptions: [
      {
        id: "unit-1",
        label: "P1 / Unit A1",
        propertyId: "property-1",
      },
    ],
    viewQuery,
  };

  return render(
    <ReportBuilderScreen {...data} organizationName="Demo Organization" />,
  );
}

function ownerActivityReport(): TrustedReport {
  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "owner", label: "Owner" },
      { align: "right", key: "rent", label: "Rent" },
      { align: "right", key: "managementFees", label: "Management fee" },
      { align: "right", key: "propertyCosts", label: "Property costs" },
      { align: "right", key: "withdrawals", label: "Owner distributions" },
      { align: "right", key: "netChange", label: "Net change" },
    ],
    description: "Recorded owner activity.",
    emptyDescription: "No rows.",
    emptyTitle: "No owner activity",
    exportFilenameBase: "monthly-owner-activity",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "monthly-owner-activity",
    ownerOptions: [{ id: "owner-1", label: "Sokha Vannak" }],
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [
      {
        cells: {
          managementFees: "USD 145.00",
          netChange: "USD 1,205.00",
          owner: "Sokha Vannak",
          property: "Central Residence — CTR-RES",
          propertyCosts: "USD 25.00",
          rent: "USD 1,725.00",
          withdrawals: "USD 350.00",
        },
        href: "/properties/property-1/account",
        id: "property-1",
        ownerPersonId: "owner-1",
        propertyId: "property-1",
        sourceCount: 0,
        sourceLinks: [],
        sourceSummary: "No source records",
        title: "Central Residence — CTR-RES",
      },
    ],
    scopeLabel: "All properties",
    summary: [],
    title: "Owner activity",
    totalsTraceLabel: "Totals trace to owner activity.",
  };
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
