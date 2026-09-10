/* @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportsDirectory } from "./reports-directory";
import { ReportBuilderScreen } from "./reports-screen";
import { ReportSavedViews } from "./report-saved-views";
import { ReportColumns } from "./report-columns";
import { ReportResultsTable } from "./report-results-table";
import { ReportsFilters } from "./reports-filters";
import type { ReportsViewQuery, TrustedReport } from "../reports.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Reporting workspace", () => {
  it("groups the directory and gates official statements", () => {
    const { rerender } = render(<ReportsDirectory />);
    expect(within(screen.getByRole("region", { name: "Transactions reports" })).getByRole("link", { name: /Management fees/ }).getAttribute("href")).toBe("/reports/management-fees");
    expect(screen.queryByRole("link", { name: /Official owner statements/ })).toBeNull();
    rerender(<ReportsDirectory canReadFinance />);
    expect(screen.getByRole("link", { name: /Official owner statements/ }).getAttribute("href")).toBe("/balances?view=statements");
  });

  it("shows the effective date range and keeps default More filters collapsed", () => {
    const { container } = render(<ReportsFilters action="/reports/transactions" viewQuery={query()} ownerOptions={[]} propertyOptions={[]} unitOptions={[]} availableColumns={report().columns} filterOptions={report().filterOptions} />);
    expect((container.querySelector('input[name="dateFrom"]') as HTMLInputElement).value).toBe("2026-07-01");
    expect((container.querySelector('input[name="dateTo"]') as HTMLInputElement).value).toBe("2026-07-31");
    expect(screen.getByText("More filters").closest("details")?.open).toBe(false);
    expect(screen.queryByRole("button", { name: "Report month" })).toBeNull();
  });

  it("exports every applied filter and selected column", async () => {
    const user = userEvent.setup();
    const viewQuery = query({ dateFrom: "2026-07-03", dateTo: "2026-07-20", query: "roof", propertyId: "property-1", unitId: "unit-1", transactionType: "paid-cost", transactionStatus: "approved", payeeId: "vendor-1", groupBy: "property", columns: "date,amount" });
    render(<ReportBuilderScreen organizationName="IPS" propertyOptions={[]} unitOptions={[]} trustedReport={report()} viewQuery={viewQuery} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    for (const label of ["PDF report", "Excel workbook"]) {
      const url = new URL(screen.getByRole("menuitem", { name: label }).getAttribute("href")!, "https://nestory.test");
      for (const key of ["dateFrom", "dateTo", "query", "propertyId", "unitId", "transactionType", "transactionStatus", "payeeId", "groupBy", "columns"] as const) expect(url.searchParams.get(key)).toBe(viewQuery[key]);
    }
  });

  it("requires a visible column and preserves other filters when applying columns", async () => {
    const user = userEvent.setup(); const columns = report().columns;
    render(<ReportColumns columns={columns} selectedColumns={columns} viewQuery={query({ query: "roof", dateFrom: "2026-07-03", groupBy: "property" })} />);
    await user.click(screen.getByText("Columns"));
    await user.click(screen.getByRole("checkbox", { name: "Property" }));
    const href = new URL(screen.getByRole("link", { name: "Apply columns" }).getAttribute("href")!, "https://nestory.test");
    expect(href.searchParams.get("columns")).toBe("date,amount");
    expect(href.searchParams.get("query")).toBe("roof");
    expect(href.searchParams.get("groupBy")).toBe("property");
    await user.click(screen.getByRole("checkbox", { name: "Date" }));
    await user.click(screen.getByRole("checkbox", { name: "Amount" }));
    expect(screen.getByRole("button", { name: "Apply columns" }).hasAttribute("disabled")).toBe(true);
  });

  it("stores only view preferences and isolates organization and user scopes", async () => {
    const user = userEvent.setup();
    const viewQuery = query({ query: "roof", columns: "date,amount" });
    const { rerender } = render(<ReportSavedViews storageKey="org-1:user-1" viewQuery={viewQuery} />);
    await user.click(screen.getByText("Saved views"));
    expect(screen.getByText("Saved on this browser")).toBeTruthy();
    await user.type(screen.getByLabelText("View name"), "Roof costs");
    await user.click(screen.getByRole("button", { name: "Save current view" }));
    const stored = JSON.parse(localStorage.getItem("nestory:report-views:v1:org-1:user-1:transactions")!);
    expect(Object.keys(stored[0]).sort()).toEqual(["name", "query"]);
    expect(new URLSearchParams(stored[0].query).get("columns")).toBe("date,amount");
    expect(screen.getByRole("link", { name: "Roof costs" }).getAttribute("href")).toContain("query=roof");
    rerender(<ReportSavedViews storageKey="org-2:user-1" viewQuery={viewQuery} />);
    expect(screen.queryByRole("link", { name: "Roof costs" })).toBeNull();
    rerender(<ReportSavedViews storageKey="org-1:user-2" viewQuery={viewQuery} />);
    expect(screen.queryByRole("link", { name: "Roof costs" })).toBeNull();
    rerender(<ReportSavedViews storageKey="org-1:user-1" viewQuery={viewQuery} />);
    await user.click(screen.getByRole("button", { name: "Remove saved view Roof costs" }));
    expect(screen.queryByRole("link", { name: "Roof costs" })).toBeNull();
  });

  it("repeats full group totals on later pages without counting headings as records", async () => {
    const user = userEvent.setup(); const data = report();
    data.rows = [{ id: "group-1", isGroup: true, title: "Property One", cells: { amount: "USD 510.00" }, sourceCount: 0, sourceLinks: [], sourceSummary: "" }, ...Array.from({ length: 51 }, (_, i) => ({ id: `row-${i}`, title: `Cost ${i + 1}`, cells: { date: "10 Jul 2026", property: "Property One", amount: "USD 10.00" }, sourceCount: 1, sourceLinks: [], sourceSummary: "1 source record" }))];
    render(<ReportResultsTable report={data} reportRowCount={51} viewQuery={query({ groupBy: "property" })} />);
    expect(screen.getAllByRole("button", { name: /View details for/ })).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("button", { name: /View details for/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View details for Cost 51" })).toBeTruthy();
    expect(screen.getByText("USD 510.00")).toBeTruthy();
    expect(screen.getByText("All matching rows")).toBeTruthy();
  });
});

function query(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return { report: "transactions", month: "2026-07", ownerPersonId: "all", peopleArchiveState: "active", peopleView: "relationship", propertyId: "all", unitId: "all", status: "all", transactionType: "all", transactionStatus: "all", payeeId: "all", groupBy: "none", ...overrides };
}
function report(): TrustedReport {
  const columns = [{ key: "date", label: "Date" }, { key: "property", label: "Property" }, { key: "amount", label: "Amount", numeric: true, align: "right" as const }];
  return { kind: "transactions", title: "Transactions", description: "", columns, availableColumns: columns, rows: [], summary: [], periodLabel: "July 2026", scopeLabel: "All properties", emptyTitle: "No transactions", emptyDescription: "Adjust the filters.", exportFilenameBase: "transactions", generatedAt: "2026-07-31T00:00:00Z", totalsTraceLabel: "All matching records", filterOptions: { types: [{ id: "paid-cost", label: "Paid costs" }] } };
}
