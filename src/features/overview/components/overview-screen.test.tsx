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

  it("keeps the title, lenses, and month control in one compact site-header row", () => {
    render(<OverviewScreen data={data} query={query} />);

    const headerRows = document.querySelectorAll('[data-slot="overview-header-row"]');
    const headerRow = headerRows.item(0);

    expect(headerRows).toHaveLength(1);
    expect(classTokens(headerRow)).toContain("items-center");
    expect(headerRow.contains(screen.getByRole("heading", { name: "Overview", level: 1 }))).toBe(true);
    expect(headerRow.contains(screen.getByRole("navigation", { name: "Overview lenses" }))).toBe(true);
    expect(
      headerRow.contains(
        screen.getByRole("button", {
          name: "Change reporting month, currently August 2026",
        }),
      ),
    ).toBe(true);

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

  it("keeps overview controls above the official dashboard composition", () => {
    render(<OverviewScreen data={data} query={query} />);

    expect(screen.getAllByRole("heading", { name: "Overview", level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: "Change reporting month, currently August 2026",
      }),
    ).toBeTruthy();
    const lenses = within(screen.getByRole("navigation", { name: "Overview lenses" }));
    expect(lenses.getByRole("link", { name: "Portfolio" }).getAttribute("href")).toBe(
      "/overview?month=2026-08",
    );
    expect(lenses.getByRole("link", { name: "Leasing" }).getAttribute("href")).toBe(
      "/overview?lens=leasing&month=2026-08",
    );
    expect(lenses.getByRole("link", { name: "Maintenance" }).getAttribute("href")).toBe(
      "/overview?lens=maintenance&month=2026-08",
    );
    expect(lenses.getByRole("link", { name: "Records" }).getAttribute("href")).toBe(
      "/overview?lens=records&month=2026-08",
    );

    const metrics = screen.getByRole("region", { name: "Portfolio metrics" });
    expect(within(metrics).getByText("Occupancy")).toBeTruthy();
    expect(within(metrics).getByText("Active leases")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Portfolio cash flow" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("places the prioritized attention queue before portfolio context", () => {
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

    const queue = screen.getByRole("table", { name: "Attention queue" });
    const portfolio = screen.getByRole("region", {
      name: "Portfolio metrics",
    });

    expect(
      queue.compareDocumentPosition(portfolio) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const header = document.querySelector<HTMLElement>(
      '[data-slot="overview-header-row"]',
    )!;
    expect(
      within(header).getByRole("link", { name: "Review rent" }).getAttribute(
        "href",
      ),
    ).toBe("/rent-income");
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

  it("uses the inline summary for operating lenses instead of a metric-card region", () => {
    render(<OverviewScreen data={data} query={{ ...query, lens: "leasing" }} />);

    expect(screen.getByRole("region", { name: "Leasing summary" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Leasing metrics" })).toBeNull();
  });

  it("keeps finance out of Overview and shows operating portfolio counts", () => {
    render(<OverviewScreen data={data} query={query} />);

    expect(screen.queryByRole("link", { name: "Property finance" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Properties" })).toBeTruthy();
    expect(screen.getByText("2 open checks need attention")).toBeTruthy();
    expect(screen.getByRole("link", { name: /RIV \/ Riverside Apartments/ })).toBeTruthy();
  });

  it("keeps the attention drilldown discoverable when no checks are open", () => {
    render(
      <OverviewScreen
        data={{ ...data, attentionTotal: 0 }}
        query={query}
      />,
    );

    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe(
      "/overview/attention?month=2026-08",
    );
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
