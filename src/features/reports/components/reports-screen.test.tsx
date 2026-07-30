/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportBuilderScreen } from "@/features/reports/components/reports-screen";
import type {
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

afterEach(cleanup);

describe("minimal Reports workspace", () => {
  it("shows exactly three report tabs and one compact filter row", () => {
    renderReport();

    const navigation = screen.getByRole("navigation", { name: "Reports" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Monthly Unit Profit & Loss",
      "Owner Statement",
      "Management Fee Statement",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");

    const filters = screen.getByRole("region", { name: "Report filters" });
    expect(
      within(filters).getByRole("combobox", {
        name: "Filter report by property",
      }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("button", { name: "Report month" }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("combobox", {
        name: "Filter report by unit",
      }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("button", { name: "Apply filters" }),
    ).toBeTruthy();
  });

  it("offers PDF and Excel through one Export disclosure", () => {
    renderReport();

    const exportMenu = screen.getByText("Export").closest("details");
    expect(exportMenu).not.toBeNull();
    expect(
      within(exportMenu!).getByRole("link", { name: "PDF" }).getAttribute(
        "href",
      ),
    ).toBe(
      "/api/reports/pdf?report=unit-profit-loss&month=2026-07",
    );
    expect(
      within(exportMenu!).getByRole("link", { name: "Excel" }).getAttribute(
        "href",
      ),
    ).toBe(
      "/api/reports/excel?report=unit-profit-loss&month=2026-07",
    );
    expect(screen.queryByText("Export CSV")).toBeNull();
    expect(screen.queryByText("Print / PDF")).toBeNull();
  });

  it("keeps totals and rows while removing report-builder clutter", () => {
    renderReport();

    const totals = screen.getByRole("region", { name: "Report totals" });
    expect(within(totals).getByText("USD 500.00")).toBeTruthy();
    expect(within(totals).getByText("USD 380.00")).toBeTruthy();

    const table = screen.getByRole("table", {
      name: "Monthly Unit Profit & Loss",
    });
    expect(within(table).getByText("P1 - Property One")).toBeTruthy();
    expect(within(table).getByText("Unit A1")).toBeTruthy();
    expect(screen.queryByText("Report library")).toBeNull();
    expect(screen.queryByText("Report families")).toBeNull();
    expect(screen.queryByText("Report packets")).toBeNull();
    expect(screen.queryByText("Preview ready")).toBeNull();
    expect(screen.queryByText("2 source rows")).toBeNull();
    expect(screen.queryByText("Generate preview")).toBeNull();
  });

  it("shows Owner Statement readiness without an export escape hatch", () => {
    renderReport({
      report: ownerStatementReport(),
      viewQuery: query({ report: "owner-statement" }),
    });

    expect(
      screen.getByText(
        "Owner Statement export is unavailable until opening and closing owner balances are authoritative.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Export")).toBeNull();
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Excel" })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Filter report by unit" }),
    ).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Reason" }),
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
    propertyOptions: [
      { id: "property-1", label: "P1 - Property One" },
    ],
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

function query(
  overrides: Partial<ReportsViewQuery> = {},
): ReportsViewQuery {
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
        sourceLinks: [],
        sourceSummary: "2 source rows",
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

function ownerStatementReport(): TrustedReport {
  return {
    columns: [
      { key: "readiness", label: "Status" },
      { key: "owner", label: "Owner" },
      { key: "property", label: "Property" },
      { key: "notes", label: "Reason" },
    ],
    description: "Owner Statement readiness.",
    emptyDescription: "No owner statement rows.",
    emptyTitle: "No owner statement rows",
    exportFilenameBase: "owner-statement",
    exportValidation: {
      code: "owner_statement_balances_unavailable",
      message:
        "Owner Statement export is unavailable until opening and closing owner balances are authoritative.",
      status: 409,
    },
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "owner-statement",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [
      {
        cells: {
          notes: "Opening and closing balances are unavailable",
          owner: "Owner One",
          property: "P1 - Property One",
          readiness: "Not publishable",
        },
        id: "owner-1",
        sourceCount: 1,
        sourceLinks: [],
        sourceSummary: "1 source row",
        title: "Owner One / P1",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Ready properties",
        label: "Ready properties",
        sourceCount: 1,
        value: "1",
      },
    ],
    title: "Owner Statement",
    totalsTraceLabel: "Readiness only.",
  };
}
