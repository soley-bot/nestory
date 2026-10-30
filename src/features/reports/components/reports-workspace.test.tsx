/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportsDirectory } from "./reports-directory";
import { ReportBuilderScreen } from "./reports-screen";
import { ReportSavedViews } from "./report-saved-views";
import { ReportColumns } from "./report-columns";
import { ReportResultsTable } from "./report-results-table";
import { ReportsFilters } from "./reports-filters";
import { paginateTrustedReportForScreen } from "../data/report-screen-pagination";
import type { ReportsViewQuery, TrustedReport } from "../reports.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/reports/transactions" }));
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("Reporting workspace", () => {
  it("clears non-matching transaction filters while keeping the selected scope and period", () => {
    const data = { ...report(), rows: [], emptyReason: "no-matches" as const };
    render(<ReportBuilderScreen organizationName="IPS" propertyOptions={[]} unitOptions={[]} trustedReport={data} viewQuery={query({ propertyId: "property-1", unitId: "unit-1", dateFrom: "2026-07-03", dateTo: "2026-07-20", query: "roof", transactionType: "paid-cost", transactionStatus: "approved", payeeId: "vendor-1" })} />);
    const href = new URL(screen.getByRole("link", { name: "Clear transaction filters" }).getAttribute("href")!, "https://nestory.test");
    expect(href.searchParams.get("propertyId")).toBe("property-1");
    expect(href.searchParams.get("unitId")).toBe("unit-1");
    expect(href.searchParams.get("dateFrom")).toBe("2026-07-03");
    expect(href.searchParams.get("dateTo")).toBe("2026-07-20");
    for (const key of ["query", "transactionType", "transactionStatus", "payeeId"]) expect(href.searchParams.has(key)).toBe(false);
    expect(screen.getByRole("link", { name: "Clear transaction filters" }).closest('[role="region"][tabindex="0"]')).toBeNull();
  });

  it("offers an authorized next step for an empty period", () => {
    const props = { organizationName: "IPS", propertyOptions: [], unitOptions: [], trustedReport: { ...report(), rows: [], emptyReason: "no-activity" as const }, viewQuery: query() };
    const { rerender } = render(<ReportBuilderScreen {...props} canReadFinance canCreateExpense />);
    expect(screen.getByRole("link", { name: "Record expense" }).getAttribute("href")).toBe("/bills-expenses?action=create");
    rerender(<ReportBuilderScreen {...props} canReadFinance />);
    expect(screen.queryByRole("link", { name: "Record expense" })).toBeNull();
    expect(screen.getByRole("link", { name: "Review rent & collections" }).getAttribute("href")).toBe("/rent-income");
    rerender(<ReportBuilderScreen {...props} />);
    expect(screen.queryByRole("link", { name: "Review rent & collections" })).toBeNull();
  });

  it("keeps compatible scope and dates when switching reports without carrying transaction-only filters", () => {
    render(<ReportBuilderScreen organizationName="IPS" propertyOptions={[]} unitOptions={[]} trustedReport={report()} viewQuery={query({ propertyId: "property-1", unitId: "unit-1", ownerPersonId: "owner-1", dateFrom: "2026-07-03", dateTo: "2026-07-20", columns: "date,amount", transactionType: "paid-cost" })} />);
    const nav = within(screen.getByRole("navigation", { name: "Reports" }));
    const collections = new URL(nav.getByRole("link", { name: "Rent collections" }).getAttribute("href")!, "https://nestory.test");
    expect(collections.searchParams.get("propertyId")).toBe("property-1");
    expect(collections.searchParams.get("unitId")).toBe("unit-1");
    expect(collections.searchParams.get("dateFrom")).toBe("2026-07-03");
    expect(collections.searchParams.has("transactionType")).toBe(false);
    expect(collections.searchParams.has("columns")).toBe(false);
    const owner = new URL(nav.getByRole("link", { name: "Owner activity" }).getAttribute("href")!, "https://nestory.test");
    expect(owner.searchParams.get("ownerPersonId")).toBe("owner-1");
    expect(owner.searchParams.get("month")).toBe("2026-07");
    expect(owner.searchParams.has("unitId")).toBe(false);
  });
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

  it("preserves browser views and imports them only after server confirmation", async () => {
    const user = userEvent.setup();
    const viewQuery = query({ query: "roof", columns: "date,amount" });
    const key = "nestory:report-views:v1:org-1:user-1:transactions";
    localStorage.setItem(key, JSON.stringify([{ name: "Roof costs", query: "query=roof&columns=date,amount&action=create" }]));
    const fetchViews = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ scope: "org-1:user-1", views: [] })));
    fetchViews.mockResolvedValue(new Response(JSON.stringify({ scope: "org-1:user-1", ok: true })));
    render(<ReportSavedViews storageKey="org-1:user-1" viewQuery={viewQuery} />);
    await user.click(screen.getByText("Saved views"));
    expect(screen.getByText("From this browser")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sync Roof costs" }).hasAttribute("disabled")).toBe(false));
    await user.click(screen.getByRole("button", { name: "Sync Roof costs" }));
    await screen.findByText("Saved Roof costs.");
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([]);
    expect(JSON.parse(fetchViews.mock.calls[1][1]!.body as string)).toMatchObject({ scope: "org-1:user-1", query: "query=roof&columns=date%2Camount" });
    expect(screen.getByRole("link", { name: "Roof costs" }).getAttribute("href")).not.toContain("action=create");
  });

  it("repeats full group totals on later server pages without counting headings as records", () => {
    const data = report();
    data.rows = [{ id: "group-1", isGroup: true, title: "Property One", cells: { amount: "USD 510.00" }, sourceCount: 0, sourceLinks: [], sourceSummary: "" }, ...Array.from({ length: 51 }, (_, i) => ({ id: `row-${i}`, title: `Cost ${i + 1}`, cells: { date: "10 Jul 2026", property: "Property One", amount: "USD 10.00" }, sourceCount: 1, sourceLinks: [], sourceSummary: "1 source record" }))];
    const firstQuery = query({ groupBy: "property" });
    const rendered = render(<ReportResultsTable report={paginateTrustedReportForScreen(data, firstQuery)} reportRowCount={51} viewQuery={firstQuery} />);
    expect(screen.getAllByRole("button", { name: /View details for/ })).toHaveLength(50);
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toContain("groupBy=property&page=2");
    const secondQuery = query({ groupBy: "property", page: 2 });
    rendered.rerender(<ReportResultsTable report={paginateTrustedReportForScreen(data, secondQuery)} reportRowCount={51} viewQuery={secondQuery} />);
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
