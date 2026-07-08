/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewScreen } from "@/features/overview/components/overview-screen";
import type { OverviewScreenData } from "@/features/overview/overview.types";

describe("OverviewScreen", () => {
  it("shows a setup path instead of a clear dashboard for a new workspace", () => {
    render(<OverviewScreen data={emptyWorkspaceData} />);

    expect(
      screen.getByRole("heading", {
        name: "Start with your operating records.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Setup plan")).toBeTruthy();
    expect(screen.queryByText("Fastest start")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: /add first property/i })
        .every(
          (link) =>
            link.getAttribute("href") === "/properties?action=create",
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /open imports/i })
        .every((link) => link.getAttribute("href") === "/import"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /add tenant/i })
        .every((link) => link.getAttribute("href") === "/tenants?action=create"),
    ).toBe(true);
    expect(screen.getByText("Import center")).toBeTruthy();
    expect(screen.getByText("500 valid rows per commit")).toBeTruthy();
    expect(screen.queryByText(/not people or leases/i)).toBeNull();
  });
});

const emptyWorkspaceData: OverviewScreenData = {
  attentionItems: [],
  attentionTotal: 0,
  dashboardSummary: {
    actionHref: "/timeline",
    actionLabel: "Open timeline",
    detail: "No high-priority operating checks are open from the current data.",
    headline: "Portfolio is clear from the current checks.",
    tone: "success",
  },
  leaseEndings: [],
  leaseRiskCount: 0,
  ledgerCurrency: "USD",
  ledgerFlow: [],
  metrics: [],
  occupancyByProperty: [],
  quickActions: [
    { href: "/import", label: "Import data" },
    { href: "/properties?action=create", label: "Add property" },
  ],
  recentChanges: [],
  workspaceSetup: {
    activeLeaseCount: 0,
    hasAnyOperatingData: false,
    ledgerEntryCount: 0,
    peopleCount: 0,
    propertyCount: 0,
    unitCount: 0,
  },
};
