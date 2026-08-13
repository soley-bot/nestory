// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { RecordsPropertyPreviewList } from "@/features/overview/components/records-property-preview-list";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

describe("OverviewScreen", () => {
  afterEach(cleanup);

  it("uses one compact Dashboard title without legacy tabs or actions", () => {
    render(<OverviewScreen data={data} query={query} />);

    const headerRows = document.querySelectorAll<HTMLElement>(
      '[data-slot="overview-header-row"]',
    );
    const headerRow = headerRows.item(0);

    expect(headerRows).toHaveLength(1);
    expect(classTokens(headerRow)).toContain("items-center");
    expect(headerRow.contains(screen.getByRole("heading", { name: "Dashboard", level: 1 }))).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Overview lenses" })).toBeNull();
    expect(within(headerRow).queryByRole("link", { name: /Review maintenance/i })).toBeNull();
    expect(within(headerRow).queryByRole("button", { name: /Change reporting month/i })).toBeNull();

    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("delegates vertical scrolling to the app shell", () => {
    render(<OverviewScreen data={data} query={query} />);

    const screenRoot = screen.getByRole("main");
    const operatingWork = screen.getByRole("region", {
      name: "Portfolio operating work",
    });
    const metrics = screen.getByRole("region", { name: "Portfolio metrics" });
    const scrollOwners = Array.from(screenRoot.querySelectorAll("*")).filter((element) =>
      classTokens(element).includes("overflow-y-auto"),
    );

    expect(classTokens(screenRoot)).toContain("min-h-full");
    expect(classTokens(screenRoot)).not.toContain("h-full");
    expect(classTokens(screenRoot)).not.toContain("min-h-0");
    expect(classTokens(screenRoot)).not.toContain("min-h-screen");
    expect(scrollOwners).toEqual([]);
    expect(classTokens(operatingWork)).not.toContain("border-y");
    expect(classTokens(metrics)).toContain("grid");
  });

  it("neutralizes the old lens-list frame without adding a nested scroll", () => {
    render(<OverviewScreen data={data} query={{ ...query, lens: "leasing" }} />);

    const operatingWork = screen.getByRole("region", {
      name: "Leasing operating work",
    });

    expect(classTokens(operatingWork)).toContain("[&>section]:border-y-0");
    expect(classTokens(operatingWork)).not.toContain("overflow-y-auto");
  });

  it("shows clear metrics without duplicated explanatory copy", () => {
    render(<OverviewScreen data={data} query={query} />);

    const metrics = screen.getByRole("region", { name: "Portfolio metrics" });
    for (const label of ["Portfolio occupancy", "Active leases", "Units without leases", "Needs attention"]) {
      expect(within(metrics).getByText(label)).toBeTruthy();
    }
    expect(within(metrics).queryByText("Based on current workspace records")).toBeNull();
    expect(screen.queryByRole("table", { name: "Attention queue" })).toBeNull();
  });

  it("opens the attention details from the metric card", () => {
    render(
      <OverviewScreen
        attentionQueue={[
          {
            actionLabel: "Review rent",
            count: 2,
            helper: "Two collections need review",
            href: "/rent-income",
            id: "rent",
            kind: "overdue-rent",
            label: "Rent exceptions",
            priority: 10,
            tone: "warning",
          },
        ]}
        data={data}
        query={query}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Needs attention, 2 open checks/i }));

    const dialog = screen.getByRole("dialog", { name: "Needs attention" });
    expect(within(dialog).getByText("Rent exceptions")).toBeTruthy();
    expect(within(dialog).getByText("Two collections need review")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Review rent" }).getAttribute("href")).toBe(
      "/rent-income",
    );
  });

  it("keeps the active reporting month readable in every theme", () => {
    render(<OverviewScreen data={data} query={query} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Change reporting month, currently August 2026",
      }),
    );

    const activeMonth = screen.getByRole("link", { name: "Aug" });
    expect(classTokens(activeMonth)).toContain("text-accent-foreground");
    expect(classTokens(activeMonth)).not.toContain("text-background");
  });

  it("stacks compact cash flow and properties as separate full-width rows", () => {
    render(<OverviewScreen data={data} query={query} />);

    const primaryStack = document.querySelector<HTMLElement>(
      '[data-slot="dashboard-primary-stack"]',
    )!;
    const cashFlow = document.querySelector<HTMLElement>(
      '[data-slot="dashboard-cash-flow"]',
    )!;
    const properties = document.querySelector<HTMLElement>(
      '[data-slot="dashboard-properties"]',
    )!;
    const toolbar = document.querySelector<HTMLElement>(
      '[data-slot="dashboard-chart-toolbar"]',
    )!;

    expect(classTokens(primaryStack)).toContain("flex-col");
    expect(primaryStack.getAttribute("class")).not.toContain("grid-cols-[");
    expect(primaryStack.children.item(0)).toBe(cashFlow);
    expect(primaryStack.children.item(1)).toBe(properties);
    expect(cashFlow.contains(toolbar)).toBe(false);
    expect(within(toolbar).queryByText("Property", { exact: true })).toBeNull();
    expect(within(toolbar).queryByText("Period", { exact: true })).toBeNull();
    expect(within(toolbar).getByRole("button", { name: "Change property, currently All properties" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "Change reporting month, currently August 2026" })).toBeTruthy();
    expect(classTokens(within(toolbar).getByRole("button", { name: "Change property, currently All properties" }))).toContain("w-64");
    expect(classTokens(cashFlow.querySelector('[data-slot="dashboard-cash-flow-chart"]')!)).toContain("h-[280px]");
    expect(within(properties).getByRole("link", { name: "View all properties" }).getAttribute("href")).toBe("/properties");
    expect(within(properties).queryByText(/open checks need attention/i)).toBeNull();
    expect(screen.queryByText("Occupancy and current operating records.")).toBeNull();
    expect(screen.queryByText("Income and expenses across the recent operating period.")).toBeNull();
  });

  it("uses the inline summary for operating lenses instead of a metric-card region", () => {
    render(<OverviewScreen data={data} query={{ ...query, lens: "leasing" }} />);

    expect(screen.getByRole("region", { name: "Leasing summary" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Leasing metrics" })).toBeNull();
  });

  it("keeps finance out of Dashboard and shows operating portfolio counts", () => {
    render(<OverviewScreen data={data} query={query} />);

    expect(screen.queryByRole("link", { name: "Property finance" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Properties" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /RIV \/ Riverside Apartments/ })).toBeTruthy();
  });

  it("keeps the attention drilldown discoverable when no checks are open", () => {
    render(
      <OverviewScreen
        data={{ ...data, attentionTotal: 0 }}
        query={query}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Needs attention, no open checks/i }));
    expect(screen.getByRole("dialog", { name: "Needs attention" })).toBeTruthy();
    expect(screen.getByText("No open checks need attention.")).toBeTruthy();
  });

  it("opens records without owner-statement language", () => {
    render(<RecordsPropertyPreviewList rows={data.recordsByProperty} />);

    fireEvent.click(screen.getByRole("button", { name: /RIV \/ Riverside Apartments/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Owner linked")).toBeTruthy();
    expect(within(dialog).queryByText(/statement/i)).toBeNull();
  });
});

const query: OverviewViewQuery = {
  financeView: "collections",
  lens: "all",
  month: "2026-08",
  propertyId: "all",
  review: "all",
};

const data = {
  attentionItems: [],
  attentionTotal: 2,
  dashboardSummary: {
    actionHref: "/overview/attention",
    actionLabel: "Review",
    detail: "Two checks",
    headline: "Needs review",
    tone: "warning",
  },
  leaseEndings: [],
  leaseRiskCount: 0,
  ledgerCurrency: "USD",
  ledgerFlow: [],
  maintenanceByProperty: [],
  metrics: [
    { helper: "Occupied units", label: "Occupancy", tone: "success", value: "100%" },
    { helper: "Current tenant agreements", label: "Active leases", tone: "neutral", value: "1" },
    { helper: "Units without active lease", label: "Lease gaps", tone: "success", value: "0" },
    { helper: "Open operating checks", label: "Attention", tone: "warning", value: "2" },
  ],
  occupancyByProperty: [
    {
      href: "/properties/property-1",
      label: "RIV / Riverside Apartments",
      occupiedUnits: 1,
      percent: 100,
      totalUnits: 1,
      unoccupiedUnits: 0,
      vacantUnits: 0,
    },
  ],
  propertyOptions: [
    { label: "RIV / Riverside Apartments", value: "property-1" },
  ],
  quickActions: [],
  recentChanges: [],
  recordsByProperty: [
    {
      documentCount: 2,
      href: "/properties/property-1",
      label: "RIV / Riverside Apartments",
      missingTenantLinks: 0,
      ownerLinked: true,
      unitCount: 1,
    },
  ],
  workspaceSetup: {
    activeLeaseCount: 1,
    hasAnyOperatingData: true,
    ledgerEntryCount: 0,
    peopleCount: 3,
    propertyCount: 1,
    unitCount: 1,
  },
} satisfies OverviewScreenData;

function classTokens(element: Element) {
  return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}
