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

  it("keeps the title, lenses, and month control in one responsive header row", () => {
    render(<OverviewScreen data={data} query={query} />);

    const header = screen.getByRole("banner");
    const headerRows = header.querySelectorAll('[data-slot="overview-header-row"]');
    const headerRow = headerRows.item(0);

    expect(headerRows).toHaveLength(1);
    expect(classTokens(headerRow)).toContain("md:flex-row");
    expect(headerRow.contains(screen.getByRole("heading", { name: "Overview", level: 1 }))).toBe(true);
    expect(headerRow.contains(screen.getByRole("navigation", { name: "Overview lenses" }))).toBe(true);
    expect(
      headerRow.contains(
        screen.getByRole("button", {
          name: "Change reporting month, currently August 2026",
        }),
      ),
    ).toBe(true);
  });

  it("uses app-shell height containment and one unframed operating scroll", () => {
    render(<OverviewScreen data={data} query={query} />);

    const screenRoot = screen.getByRole("main");
    const header = screen.getByRole("banner");
    const operatingWork = screen.getByRole("region", {
      name: "Portfolio operating work",
    });
    const summary = screen.getByRole("region", { name: "Portfolio summary" });
    const scrollOwners = Array.from(screenRoot.querySelectorAll("*")).filter((element) =>
      classTokens(element).includes("overflow-y-auto"),
    );

    expect(classTokens(screenRoot)).toContain("h-full");
    expect(classTokens(screenRoot)).toContain("min-h-0");
    expect(classTokens(screenRoot)).not.toContain("min-h-screen");
    expect(scrollOwners).toEqual([operatingWork]);
    expect(classTokens(header)).not.toContain("border-b");
    expect(classTokens(operatingWork)).not.toContain("border-y");
    expect(classTokens(summary)).not.toContain("border-y");
  });

  it("neutralizes the legacy lens-list frame while keeping one operating scroll", () => {
    render(<OverviewScreen data={data} query={{ ...query, lens: "leasing" }} />);

    const operatingWork = screen.getByRole("region", {
      name: "Leasing operating work",
    });

    expect(classTokens(operatingWork)).toContain("[&>section]:border-y-0");
    expect(classTokens(operatingWork)).toContain("overflow-y-auto");
  });

  it("keeps overview controls while making portfolio work precede one inline summary", () => {
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

    const operatingWork = screen.getByRole("region", {
      name: "Portfolio operating work",
    });
    const summary = screen.getByRole("region", { name: "Portfolio summary" });
    expect(within(summary).getByText("Properties")).toBeTruthy();
    expect(within(summary).getByText("Open checks")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Portfolio counts" })).toBeNull();
    expect(
      operatingWork.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(screen.getByText("2 open checks")).toBeTruthy();
    expect(screen.getByRole("link", { name: /RIV \/ Riverside Apartments/ })).toBeTruthy();
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
  metrics: [],
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
