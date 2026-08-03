// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { RecordsPropertyPreviewList } from "@/features/overview/components/records-property-preview-list";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

describe("OverviewScreen", () => {
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
