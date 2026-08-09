/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ReportBuilderScreen } from "@/features/reports/components/reports-screen";
import { prepareTrustedReportForScreen } from "@/features/reports/data/reports";
import type {
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

afterEach(cleanup);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("minimal Reports workspace", () => {
  it("keeps only the two useful reports in the primary flow", () => {
    renderReport();

    const navigation = screen.getByRole("navigation", { name: "Reports" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Owner activity",
      "Unit P&L",
    ]);
    expect(links[1]?.getAttribute("aria-current")).toBe("page");

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

  it("offers PDF and Excel through one Export menu", async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(
      screen.getByRole("menuitem", { name: "PDF" }).getAttribute("href"),
    ).toBe("/api/reports/pdf?report=unit-profit-loss&month=2026-07");
    expect(
      screen.getByRole("menuitem", { name: "Excel" }).getAttribute("href"),
    ).toBe("/api/reports/excel?report=unit-profit-loss&month=2026-07");
    expect(screen.queryByText("Export CSV")).toBeNull();
    expect(screen.queryByText("Print / PDF")).toBeNull();
  });

  it("keeps totals and rows while removing report-builder clutter", () => {
    const { container } = renderReport();

    const totals = screen.getByRole("region", { name: "Report totals" });
    expect(within(totals).getByText("USD 500.00")).toBeTruthy();
    expect(within(totals).getByText("USD 380.00")).toBeTruthy();
    expect(totals.className).toContain("rounded-md");
    expect(totals.className).toMatch(/(?:^|\s)border(?:\s|$)/);

    const table = screen.getByRole("table", {
      name: "Monthly Unit Profit & Loss",
    });
    const tableFrame = container.querySelector<HTMLElement>(
      '[data-slot="report-table-frame"]',
    );
    expect(tableFrame).not.toBeNull();
    expect(tableFrame?.className).toContain("rounded-md");
    expect(tableFrame?.className).toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(tableFrame?.querySelector("thead > tr")?.className).toContain(
      "border-b",
    );
    expect(within(table).getByText("P1 - Property One")).toBeTruthy();
    expect(within(table).getByText("Unit A1")).toBeTruthy();
    expect(
      within(table)
        .getByRole("link", { name: "Rent ledger" })
        .getAttribute("href"),
    ).toBe("/ledger?archiveState=all&entryId=ledger-income");
    expect(
      within(table)
        .getByRole("link", { name: "Rent ledger" })
        .getAttribute("title"),
    ).toBeNull();
    expect(screen.queryByText("Report library")).toBeNull();
    expect(screen.queryByText("Report families")).toBeNull();
    expect(screen.queryByText("Report packets")).toBeNull();
    expect(screen.queryByText("Preview ready")).toBeNull();
    expect(screen.queryByText("2 source rows")).toBeNull();
    expect(screen.queryByText("Generate preview")).toBeNull();
  });

  it("keeps the report title and row count inline until the heading needs to wrap", () => {
    renderReport();

    const title = screen.getByRole("heading", {
      level: 2,
      name: "Monthly Unit Profit & Loss",
    });
    const heading = title.parentElement;
    const rowCount = within(heading!).getByText("1 row");

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

  it("discloses when the bounded Sources cell omits additional source links", () => {
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

    expect(screen.getByText("+2 more")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "7 source records; 2 additional sources are available in PDF and Excel exports",
      ),
    ).toBeTruthy();
  });

  it("keeps Finance Manager report records on finance-safe routes", () => {
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
    expect(screen.getByRole("link", { name: "P1" }).getAttribute("href")).toBe(
      "/properties/property-1/account",
    );
    expect(screen.queryByRole("link", { name: "Unit A1" })).toBeNull();
    expect(screen.getAllByText("Unit A1")).not.toHaveLength(0);
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
